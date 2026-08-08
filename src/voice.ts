import { getTool, isObject } from "./tools.js";

/**
 * Voice presets render a tool result as one plain-English sentence suitable for
 * text-to-speech. JSON is useless to a speech synthesiser, so the voice path
 * needs its own formatter rather than just its own transport.
 *
 * UEX field names vary across endpoints and have changed between API revisions,
 * so every field read goes through `pickNumber` / `pickString` with a candidate
 * list and each preset degrades to a diagnostic sentence rather than throwing.
 */

export interface VoicePreset {
  name: string;
  description: string;
  params: { name: string; required: boolean; type: "string" | "number" }[];
  render: (args: Record<string, string>) => Promise<string>;
}

function pickNumber(obj: unknown, candidates: string[]): number | undefined {
  if (!isObject(obj)) return undefined;
  for (const key of candidates) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function pickString(obj: unknown, candidates: string[]): string | undefined {
  if (!isObject(obj)) return undefined;
  for (const key of candidates) {
    const value = obj[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

/** Numbers read more naturally to SAPI/Windows TTS with thousands separators. */
export function spokenNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

const LOCATION_KEYS = [
  "terminal_name",
  "space_station_name",
  "outpost_name",
  "city_name",
  "planet_name",
  "orbit_name",
  "star_system_name",
];

const SELL_PRICE_KEYS = ["price_sell"];
const BUY_PRICE_KEYS = ["price_buy"];

function asArray(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data.filter(isObject) as Record<string, unknown>[]) : [];
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(args);
}

async function bestPrice(args: Record<string, string>, direction: "sell" | "buy"): Promise<string> {
  const commodity = args.commodity;
  if (!commodity) return "No commodity specified.";

  const rows = asArray(
    await callTool("uex_get_commodity_prices", {
      commodity_name: commodity,
      star_system_name: args.system,
      planet_name: args.planet,
      terminal_name: args.terminal,
    }),
  );

  const priceKeys = direction === "sell" ? SELL_PRICE_KEYS : BUY_PRICE_KEYS;
  const priced = rows
    .map((row) => ({ row, price: pickNumber(row, priceKeys) }))
    .filter((r): r is { row: Record<string, unknown>; price: number } => (r.price ?? 0) > 0);

  if (priced.length === 0) {
    const scope = args.system ? ` in ${args.system}` : "";
    return `No ${direction} prices found for ${commodity}${scope}.`;
  }

  // Best sell is the highest price; best buy is the lowest.
  priced.sort((a, b) => (direction === "sell" ? b.price - a.price : a.price - b.price));
  const best = priced[0];
  const where = pickString(best.row, LOCATION_KEYS) ?? "an unnamed terminal";
  const system = pickString(best.row, ["star_system_name"]);
  const verb = direction === "sell" ? "sells highest at" : "is cheapest at";

  return (
    `${commodity} ${verb} ${where}${system ? ` in ${system}` : ""}, ` +
    `${spokenNumber(best.price)} per S C U.`
  );
}

export const presets: VoicePreset[] = [
  {
    name: "sell",
    description: "Where a commodity sells for the most.",
    params: [
      { name: "commodity", required: true, type: "string" },
      { name: "system", required: false, type: "string" },
      { name: "planet", required: false, type: "string" },
      { name: "terminal", required: false, type: "string" },
    ],
    render: (args) => bestPrice(args, "sell"),
  },
  {
    name: "buy",
    description: "Where a commodity is cheapest to buy.",
    params: [
      { name: "commodity", required: true, type: "string" },
      { name: "system", required: false, type: "string" },
      { name: "planet", required: false, type: "string" },
      { name: "terminal", required: false, type: "string" },
    ],
    render: (args) => bestPrice(args, "buy"),
  },
  {
    name: "route",
    description: "The most profitable trade route for a given hold and budget.",
    params: [
      { name: "scu", required: false, type: "number" },
      { name: "investment", required: false, type: "number" },
    ],
    render: async (args) => {
      const scu = args.scu ? Number(args.scu) : undefined;
      const investment = args.investment ? Number(args.investment) : undefined;

      const rows = asArray(
        await callTool("uex_get_trade_routes", {
          cargo_capacity: scu,
          investment,
        }),
      );

      if (rows.length === 0) return "No trade routes returned.";

      const scored = rows.map((row) => ({
        row,
        profit: pickNumber(row, ["profit", "profit_margin", "price_margin", "margin"]),
      }));
      scored.sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
      const best = scored[0];

      const commodity = pickString(best.row, ["commodity_name", "commodity"]);
      const origin = pickString(best.row, [
        "origin_terminal_name",
        "terminal_origin_name",
        "origin_name",
        "origin",
      ]);
      const destination = pickString(best.row, [
        "destination_terminal_name",
        "terminal_destination_name",
        "destination_name",
        "destination",
      ]);

      if (!commodity || !origin || !destination) {
        // Field names drifted; say something useful instead of throwing.
        return (
          `Got ${rows.length} routes but could not read the route fields. ` +
          `Check slash q slash uex underscore get underscore trade underscore routes.`
        );
      }

      const profitText =
        best.profit !== undefined ? `, for ${spokenNumber(best.profit)} profit` : "";
      return `Best route: buy ${commodity} at ${origin}, sell at ${destination}${profitText}.`;
    },
  },
  {
    name: "top",
    description: "The top-ranked commodities by profitability.",
    params: [{ name: "count", required: false, type: "number" }],
    render: async (args) => {
      // Anything absent, non-numeric, or non-positive falls back to the default
      // rather than clamping to a single result.
      const requested = Math.floor(Number(args.count));
      const count = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 5) : 3;
      const rows = asArray(await callTool("uex_get_commodity_ranking", {}));

      if (rows.length === 0) return "No commodity ranking returned.";

      const names = rows
        .slice(0, count)
        .map((row) => pickString(row, ["commodity_name", "name", "commodity"]))
        .filter((n): n is string => Boolean(n));

      if (names.length === 0) return "Ranking returned but no commodity names were readable.";

      return `Top ${names.length} commodities: ${names.join(", ")}.`;
    },
  },
];

export const presetsByName = new Map(presets.map((p) => [p.name, p]));
