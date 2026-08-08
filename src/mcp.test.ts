import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Contract test for the stdio transport, run against the built server rather
 * than the module graph.
 *
 * This has to be a subprocess test: the failure it guards against is a
 * dependency writing to the real stdout at startup (dotenv v17 shipped a banner
 * that did exactly this, corrupting every MCP session). In-process assertions
 * miss it, because the test runner has already replaced stdout by the time any
 * import runs.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = join(root, "dist", "index.js");

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number;
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

function runServer(requests: unknown[], timeoutMs = 15000): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      // A token is not needed: these requests never reach the network.
      env: { ...process.env, UEXTOKEN: process.env.UEXTOKEN ?? "test-token" },
    });

    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not respond within ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", () => {
      clearTimeout(timer);
      resolve({ stdout });
    });

    for (const request of requests) {
      child.stdin.write(JSON.stringify(request) + "\n");
    }
    child.stdin.end();
  });
}

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "scmcp-test", version: "1.0.0" },
  },
};
const INITIALIZED = { jsonrpc: "2.0", method: "notifications/initialized" };

describe("MCP stdio server", () => {
  it("has been built", () => {
    // `npm test` runs tsc first via pretest; this makes a missing build obvious
    // rather than surfacing as a spawn failure further down.
    expect(existsSync(serverPath)).toBe(true);
  });

  it("emits nothing on stdout but JSON-RPC frames", async () => {
    const { stdout } = await runServer([
      INITIALIZE,
      INITIALIZED,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);

    const lines = stdout.split("\n").filter((line) => line.trim() !== "");
    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      // Any banner, log line, or stray console.log fails here.
      const parsed = JSON.parse(line) as JsonRpcResponse;
      expect(parsed.jsonrpc).toBe("2.0");
    }
  }, 20000);

  it("completes the initialize handshake", async () => {
    const { stdout } = await runServer([INITIALIZE]);
    const response = JSON.parse(stdout.split("\n")[0]) as JsonRpcResponse;
    expect(response.id).toBe(1);
    expect(response.result?.serverInfo).toMatchObject({ name: "star-citizen-mcp" });
  }, 20000);

  it("advertises every tool with its schema", async () => {
    const { stdout } = await runServer([
      INITIALIZE,
      INITIALIZED,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);

    const responses = stdout
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as JsonRpcResponse);

    const list = responses.find((r) => r.id === 2);
    const toolList = list?.result?.tools as { name: string; inputSchema: unknown }[];

    expect(toolList).toHaveLength(11);
    expect(toolList.map((t) => t.name)).toContain("uex_get_trade_routes");
    for (const tool of toolList) {
      expect(tool.inputSchema).toBeTruthy();
    }
  }, 20000);

  it("returns an error result rather than crashing on an unknown tool", async () => {
    const { stdout } = await runServer([
      INITIALIZE,
      INITIALIZED,
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "nope", arguments: {} } },
    ]);

    const responses = stdout
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as JsonRpcResponse);

    const call = responses.find((r) => r.id === 3);
    expect(call?.result?.isError).toBe(true);
    const content = call?.result?.content as { text: string }[];
    expect(content[0].text).toContain("Unknown tool: nope");
  }, 20000);
});
