import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createServer } from "./http.js";

/**
 * Covers routing and the request guard. Routes that would call the UEX API are
 * exercised only on paths that fail before any network call, so the suite is
 * offline.
 */
let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("GET /health", () => {
  it("reports tool and preset counts", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.tools).toBeGreaterThan(0);
    expect(body.presets).toBeGreaterThan(0);
  });
});

describe("discovery routes", () => {
  it("lists tools with their schemas", async () => {
    const body = await (await fetch(`${base}/tools`)).json();
    expect(Array.isArray(body)).toBe(true);
    const prices = body.find((t: { name: string }) => t.name === "uex_get_commodity_prices");
    expect(prices.inputSchema.required).toContain("commodity_name");
  });

  it("lists voice presets with their parameters", async () => {
    const body = await (await fetch(`${base}/presets`)).json();
    const sell = body.find((p: { name: string }) => p.name === "sell");
    expect(sell.params).toContainEqual({ name: "commodity", required: true, type: "string" });
  });

  it("ignores a trailing slash", async () => {
    expect((await fetch(`${base}/health/`)).status).toBe(200);
  });
});

describe("request guard", () => {
  it("rejects requests carrying a browser Origin", async () => {
    const res = await fetch(`${base}/health`, { headers: { Origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("rejects cross-site fetches even without an Origin", async () => {
    const res = await fetch(`${base}/health`, { headers: { "Sec-Fetch-Site": "cross-site" } });
    expect(res.status).toBe(403);
  });

  it("allows a same-origin-less client such as curl or Stream Deck", async () => {
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("refuses methods other than GET and POST", async () => {
    expect((await fetch(`${base}/health`, { method: "DELETE" })).status).toBe(405);
  });
});

describe("GET /q/:tool", () => {
  it("404s an unknown tool", async () => {
    const res = await fetch(`${base}/q/not_a_tool`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("Unknown tool");
  });

  it("returns JSON errors, not prose", async () => {
    const res = await fetch(`${base}/q/not_a_tool`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("GET /say/:preset", () => {
  it("404s an unknown preset with a speakable message", async () => {
    const res = await fetch(`${base}/say/nonsense`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("Unknown preset nonsense.");
  });

  it("names the missing required parameter", async () => {
    const res = await fetch(`${base}/say/sell`);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing commodity.");
  });

  it("always answers in plain text so TTS can read the body verbatim", async () => {
    const res = await fetch(`${base}/say/sell`);
    expect(res.headers.get("content-type")).toContain("text/plain");
  });
});

describe("/ask", () => {
  it("rejects an empty question before spending any credit", async () => {
    const res = await fetch(`${base}/ask`);
    // 400 when credentials exist, 503 when they don't; both are pre-flight.
    expect([400, 503]).toContain(res.status);
  });

  it("rejects a malformed POST body", async () => {
    const res = await fetch(`${base}/ask`, { method: "POST", body: "not json" });
    expect([400, 503]).toContain(res.status);
  });
});

describe("unknown routes", () => {
  it("404s", async () => {
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
