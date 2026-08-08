import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The presets are exercised against stubbed tool handlers so the suite never
 * touches the UEX API. Field names below mirror the shapes the presets expect;
 * the "unfamiliar field names" cases cover what happens when they don't.
 */
const handlers = vi.hoisted(() => ({
  current: new Map<string, (args: unknown) => Promise<unknown>>(),
}));

vi.mock("./tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tools.js")>();
  return {
    ...actual,
    getTool: (name: string) => {
      const handler = handlers.current.get(name);
      return handler ? { name, description: "", inputSchema: {}, handler } : undefined;
    },
  };
});

const { presets, presetsByName, spokenNumber } = await import("./voice.js");

function stub(name: string, data: unknown) {
  handlers.current.set(name, async () => data);
}

function render(preset: string, args: Record<string, string> = {}) {
  const found = presetsByName.get(preset);
  if (!found) throw new Error(`no preset ${preset}`);
  return found.render(args);
}

beforeEach(() => {
  handlers.current.clear();
});

describe("spokenNumber", () => {
  it("adds separators so TTS reads the magnitude correctly", () => {
    expect(spokenNumber(32500)).toBe("32,500");
    expect(spokenNumber(1234567.6)).toBe("1,234,568");
  });
});

describe("preset registry", () => {
  it("registers every preset under a unique name", () => {
    const names = presets.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(["sell", "buy", "route", "top"]);
  });
});

describe("sell / buy presets", () => {
  const rows = [
    {
      terminal_name: "Area 18 TDD",
      star_system_name: "Stanton",
      price_sell: 30000,
      price_buy: 28000,
    },
    {
      terminal_name: "Everus Harbor",
      star_system_name: "Stanton",
      price_sell: 32500,
      price_buy: 31000,
    },
    {
      terminal_name: "Port Tressler",
      star_system_name: "Stanton",
      price_sell: 29000,
      price_buy: 25000,
    },
  ];

  it("names the highest-paying terminal for a sell", async () => {
    stub("uex_get_commodity_prices", rows);
    const out = await render("sell", { commodity: "Gold" });
    expect(out).toBe("Gold sells highest at Everus Harbor in Stanton, 32,500 per S C U.");
  });

  it("names the cheapest terminal for a buy", async () => {
    stub("uex_get_commodity_prices", rows);
    const out = await render("buy", { commodity: "Gold" });
    expect(out).toBe("Gold is cheapest at Port Tressler in Stanton, 25,000 per S C U.");
  });

  it("forwards location filters to the tool", async () => {
    const seen: unknown[] = [];
    handlers.current.set("uex_get_commodity_prices", async (args) => {
      seen.push(args);
      return rows;
    });
    await render("sell", { commodity: "Gold", system: "Pyro", terminal: "Ruin Station" });
    expect(seen[0]).toMatchObject({
      commodity_name: "Gold",
      star_system_name: "Pyro",
      terminal_name: "Ruin Station",
    });
  });

  it("ignores rows priced at zero rather than calling them the cheapest", async () => {
    stub("uex_get_commodity_prices", [
      { terminal_name: "Nowhere", price_buy: 0 },
      { terminal_name: "Lorville", price_buy: 26000 },
    ]);
    expect(await render("buy", { commodity: "Gold" })).toContain("Lorville");
  });

  it("says so plainly when nothing is priced", async () => {
    stub("uex_get_commodity_prices", []);
    expect(await render("sell", { commodity: "Gold", system: "Pyro" })).toBe(
      "No sell prices found for Gold in Pyro.",
    );
  });

  it("reports a missing commodity instead of querying", async () => {
    expect(await render("sell", {})).toBe("No commodity specified.");
  });

  it("omits the system clause when the row does not carry one", async () => {
    stub("uex_get_commodity_prices", [{ terminal_name: "Everus Harbor", price_sell: 32500 }]);
    expect(await render("sell", { commodity: "Gold" })).toBe(
      "Gold sells highest at Everus Harbor, 32,500 per S C U.",
    );
  });
});

describe("route preset", () => {
  it("reads the most profitable route", async () => {
    stub("uex_get_trade_routes", [
      {
        commodity_name: "Laranite",
        origin_terminal_name: "ArcCorp Mining 141",
        destination_terminal_name: "Area 18 TDD",
        profit: 120000,
      },
      {
        commodity_name: "Gold",
        origin_terminal_name: "HDMS-Stanhope",
        destination_terminal_name: "Everus Harbor",
        profit: 450000,
      },
    ]);
    expect(await render("route", { scu: "96", investment: "1000000" })).toBe(
      "Best route: buy Gold at HDMS-Stanhope, sell at Everus Harbor, for 450,000 profit.",
    );
  });

  it("passes SCU and investment through as numbers", async () => {
    const seen: unknown[] = [];
    handlers.current.set("uex_get_trade_routes", async (args) => {
      seen.push(args);
      return [];
    });
    await render("route", { scu: "96", investment: "1000000" });
    expect(seen[0]).toEqual({ cargo_capacity: 96, investment: 1000000 });
  });

  it("stays speakable when the route fields are unfamiliar", async () => {
    stub("uex_get_trade_routes", [{ some_unexpected_shape: true }]);
    const out = await render("route", {});
    expect(out).toContain("could not read the route fields");
    expect(out).not.toContain("undefined");
  });

  it("reports an empty result", async () => {
    stub("uex_get_trade_routes", []);
    expect(await render("route", {})).toBe("No trade routes returned.");
  });
});

describe("top preset", () => {
  const ranking = Array.from({ length: 10 }, (_, i) => ({ commodity_name: `Commodity ${i}` }));

  it("defaults to three commodities", async () => {
    stub("uex_get_commodity_ranking", ranking);
    expect(await render("top", {})).toBe(
      "Top 3 commodities: Commodity 0, Commodity 1, Commodity 2.",
    );
  });

  it("clamps the count to at most five", async () => {
    stub("uex_get_commodity_ranking", ranking);
    const out = await render("top", { count: "50" });
    expect(out.startsWith("Top 5 commodities:")).toBe(true);
  });

  it("clamps a nonsensical count back to the default", async () => {
    stub("uex_get_commodity_ranking", ranking);
    expect(await render("top", { count: "-4" })).toContain("Top 3 commodities");
  });

  it("says so when no names are readable", async () => {
    stub("uex_get_commodity_ranking", [{ unexpected: 1 }]);
    expect(await render("top", {})).toBe("Ranking returned but no commodity names were readable.");
  });
});
