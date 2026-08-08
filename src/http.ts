import http from "node:http";
import { pathToFileURL } from "node:url";
import { coerceArgs, describeError, getTool, tools } from "./tools.js";
import { presets, presetsByName } from "./voice.js";

/**
 * Localhost daemon that puts the tool registry behind plain HTTP, because
 * Stream Deck and VoiceAttack can hit a URL but cannot speak MCP.
 *
 *   GET  /health              liveness + which surfaces are enabled
 *   GET  /tools               tool names and schemas
 *   GET  /presets             voice preset names and parameters
 *   GET  /q/:tool?args        raw JSON  — for Stream Deck key rendering
 *   GET  /say/:preset?args    one sentence of plain text — for TTS
 *   POST /ask  {"q": "..."}   natural language via the Anthropic API
 *   GET  /ask?q=...           same, so VoiceAttack can use a plain GET
 */

const DEFAULT_PORT = 7331;
const HOST = "127.0.0.1";

/** Optional shared secret; see checkAuth. */
const TOKEN = process.env.SCMCP_HTTP_TOKEN;

interface Handled {
  status: number;
  body: string;
  contentType: string;
}

function json(status: number, data: unknown): Handled {
  return {
    status,
    body: JSON.stringify(data, null, 2),
    contentType: "application/json; charset=utf-8",
  };
}

function text(status: number, body: string): Handled {
  return { status, body, contentType: "text/plain; charset=utf-8" };
}

/**
 * A localhost bind keeps other machines out, but not other software on this
 * machine — any page you visit could fetch http://127.0.0.1:7331/ask and spend
 * your API credit. Browsers always attach Origin/Sec-Fetch-Site to such a
 * request; curl, Stream Deck, and VoiceAttack do not. Reject on that, and
 * support an optional shared secret on top.
 */
function checkAuth(req: http.IncomingMessage): string | undefined {
  const origin = req.headers.origin;
  const fetchSite = req.headers["sec-fetch-site"];
  if (origin || (typeof fetchSite === "string" && fetchSite !== "none")) {
    return "Browser-originated requests are not accepted.";
  }

  if (TOKEN) {
    const header = req.headers["x-scmcp-token"];
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    const supplied = typeof header === "string" ? header : url.searchParams.get("token");
    if (supplied !== TOKEN) return "Invalid or missing token.";
  }

  return undefined;
}

function queryToRecord(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key === "token") continue;
    out[key] = value;
  }
  return out;
}

async function readBody(req: http.IncomingMessage, limitBytes = 64 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > limitBytes) throw new Error("Request body too large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function route(req: http.IncomingMessage, url: URL): Promise<Handled> {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const query = queryToRecord(url.searchParams);

  if (path === "/health") {
    const { askAvailable } = await import("./ask.js");
    return json(200, {
      status: "ok",
      tools: tools.length,
      presets: presets.length,
      ask: askAvailable() ? "enabled" : "no ANTHROPIC_API_KEY set",
    });
  }

  if (path === "/tools") {
    return json(
      200,
      tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    );
  }

  if (path === "/presets") {
    return json(
      200,
      presets.map(({ name, description, params }) => ({ name, description, params })),
    );
  }

  if (path.startsWith("/q/")) {
    const toolName = decodeURIComponent(path.slice("/q/".length));
    const tool = getTool(toolName);
    if (!tool) return json(404, { error: `Unknown tool: ${toolName}` });
    const args = coerceArgs(tool.inputSchema, query);
    return json(200, await tool.handler(args));
  }

  if (path.startsWith("/say/")) {
    const presetName = decodeURIComponent(path.slice("/say/".length));
    const preset = presetsByName.get(presetName);
    if (!preset) {
      return text(404, `Unknown preset ${presetName}.`);
    }
    const missing = preset.params.filter((p) => p.required && !query[p.name]).map((p) => p.name);
    if (missing.length > 0) {
      return text(400, `Missing ${missing.join(" and ")}.`);
    }
    // Presets already return a spoken sentence, including for their own
    // failures, so this is always 200 with something safe to read aloud.
    return text(200, await preset.render(query));
  }

  if (path === "/ask") {
    const { ask, askAvailable } = await import("./ask.js");
    if (!askAvailable()) {
      return text(503, "Natural language is unavailable: no Anthropic credentials configured.");
    }

    let question = query.q;
    if (req.method === "POST") {
      const raw = await readBody(req);
      try {
        const parsed = JSON.parse(raw) as { q?: unknown };
        if (typeof parsed.q === "string") question = parsed.q;
      } catch {
        return text(400, 'Body must be JSON of the form {"q": "..."}.');
      }
    }

    if (!question || question.trim() === "") return text(400, "No question supplied.");

    const result = await ask(question.trim());
    // Plain text by default so VoiceAttack can speak the body verbatim;
    // ?format=json when you want the usage numbers too.
    if (query.format === "json") return json(200, result);
    return text(200, result.text);
  }

  return json(404, { error: `No route for ${path}` });
}

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://${HOST}`);
      let handled: Handled;

      try {
        const denied = checkAuth(req);
        if (denied) {
          handled = text(403, denied);
        } else if (req.method !== "GET" && req.method !== "POST") {
          handled = text(405, `Method ${req.method} not allowed.`);
        } else {
          handled = await route(req, url);
        }
      } catch (error) {
        console.error(`[http] ${url.pathname} failed:`, error);
        // /say and /ask are spoken aloud, so their errors must be speakable too.
        const speakable = url.pathname.startsWith("/say/") || url.pathname === "/ask";
        handled = speakable
          ? text(500, "That lookup failed.")
          : json(500, { error: describeError(error) });
      }

      res.writeHead(handled.status, {
        "Content-Type": handled.contentType,
        "Cache-Control": "no-store",
      });
      res.end(handled.body);
    })();
  });
}

function main() {
  const port = Number(process.env.SCMCP_HTTP_PORT) || DEFAULT_PORT;
  const server = createServer();

  server.listen(port, HOST, () => {
    console.error(`SCMCP daemon listening on http://${HOST}:${port}`);
    console.error(`  ${tools.length} tools, ${presets.length} voice presets`);
    if (!TOKEN) {
      console.error("  no SCMCP_HTTP_TOKEN set — any local process can reach this daemon");
    }
  });

  server.on("error", (error) => {
    console.error("Fatal error in daemon:", error);
    process.exit(1);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}

// Only start listening when run directly, so tests can import createServer.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
