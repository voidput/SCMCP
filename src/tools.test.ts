import { describe, it, expect } from "vitest";
import {
  coerceArgs,
  describeError,
  formatOutput,
  getTool,
  optimizeData,
  tools,
  type JsonSchema,
} from "./tools.js";

describe("tool registry", () => {
  it("exposes every documented tool under a unique name", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        "uex_get_commodities",
        "uex_get_commodity_prices",
        "uex_get_commodity_averages",
        "uex_get_terminals",
        "uex_get_trade_routes",
        "uex_get_commodity_ranking",
        "scw_search",
        "scw_get_vehicle",
        "scw_get_item",
        "sct_search",
        "sct_get_article",
      ]),
    );
  });

  it("only marks parameters required if they are also declared", () => {
    for (const tool of tools) {
      for (const key of tool.inputSchema.required ?? []) {
        expect(Object.keys(tool.inputSchema.properties)).toContain(key);
      }
    }
  });

  it("resolves tools by name and returns undefined otherwise", () => {
    expect(getTool("uex_get_commodities")?.name).toBe("uex_get_commodities");
    expect(getTool("does_not_exist")).toBeUndefined();
  });
});

describe("coerceArgs", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: {
      commodity_name: { type: "string" },
      investment: { type: "number" },
      cargo_capacity: { type: "integer" },
      verbose: { type: "boolean" },
    },
  };

  it("converts numeric query params to numbers", () => {
    expect(coerceArgs(schema, { investment: "1000000", cargo_capacity: "96" })).toEqual({
      investment: 1000000,
      cargo_capacity: 96,
    });
  });

  it("leaves string params alone", () => {
    expect(coerceArgs(schema, { commodity_name: "Gold" })).toEqual({ commodity_name: "Gold" });
  });

  it("treats an empty value as absent so ?x= does not become an empty string", () => {
    expect(coerceArgs(schema, { commodity_name: "" })).toEqual({});
  });

  it("drops params the tool does not declare", () => {
    expect(coerceArgs(schema, { commodity_name: "Gold", nonsense: "1" })).toEqual({
      commodity_name: "Gold",
    });
  });

  it("reads booleans, treating only false and 0 as false", () => {
    expect(coerceArgs(schema, { verbose: "true" }).verbose).toBe(true);
    expect(coerceArgs(schema, { verbose: "false" }).verbose).toBe(false);
    expect(coerceArgs(schema, { verbose: "0" }).verbose).toBe(false);
  });

  it("rejects a non-numeric value for a numeric param", () => {
    expect(() => coerceArgs(schema, { investment: "lots" })).toThrow(/must be a number/);
  });
});

describe("optimizeData", () => {
  it("drops empty values and bulky statistical fields", () => {
    const input = {
      commodity_name: "Gold",
      price_sell: 32500,
      price_sell_avg: 31000,
      price_sell_min: 100,
      volatility_price_sell: 3,
      id_terminal: 42,
      date_added: 1700000000,
      empty_string: "",
      zero: 0,
      nothing: null,
    };
    expect(optimizeData(input)).toEqual({ commodity_name: "Gold", price_sell: 32500 });
  });

  it("recurses through arrays", () => {
    expect(
      optimizeData([
        { a: 1, b: 0 },
        { a: 2, b: null },
      ]),
    ).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("passes primitives through untouched", () => {
    expect(optimizeData("Gold")).toBe("Gold");
    expect(optimizeData(7)).toBe(7);
  });
});

describe("formatOutput", () => {
  it("pretty-prints when the result fits the budget", () => {
    expect(formatOutput({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("falls back to minified JSON before truncating", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ commodity_name: `C${i}` }));
    // Budget sits between the pretty-printed and minified lengths.
    const out = formatOutput(rows, 1100);
    expect(out).not.toContain("\n  ");
    expect(out).not.toContain("truncated");
    expect(JSON.parse(out)).toHaveLength(40);
  });

  it("truncates once even minified output exceeds the budget", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ commodity_name: `Commodity ${i}` }));
    const out = formatOutput(rows, 400);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out).toContain("[Output truncated due to excessive length]");
  });

  it("applies a tighter budget when the caller asks for one", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ commodity_name: `Commodity ${i}` }));
    expect(formatOutput(rows, 400).length).toBeLessThan(formatOutput(rows, 8000).length);
  });
});

describe("describeError", () => {
  it("reports a plain error message", () => {
    expect(describeError(new Error("boom"))).toBe("Error: boom");
  });

  it("appends upstream response details when present", () => {
    const axiosLike = Object.assign(new Error("Request failed"), {
      response: { data: { message: "bad token" } },
    });
    expect(describeError(axiosLike)).toBe(
      'Error: Request failed\nDetails: {"message":"bad token"}',
    );
  });

  it("handles values that are not Errors", () => {
    expect(describeError("nope")).toBe("Error: Unknown error occurred");
  });
});
