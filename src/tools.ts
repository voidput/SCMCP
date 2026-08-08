import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import dotenv from "dotenv";
import { z } from "zod";

// quiet is essential, not cosmetic: dotenv v17 prints a banner to stdout, and
// the MCP transport requires stdout to carry nothing but JSON-RPC frames.
dotenv.config({ quiet: true });

const UEX_API_KEY = process.env.UEXTOKEN;
const UEX_BASE_URL = "https://api.uexcorp.space/2.0";
const SCW_BASE_URL = "https://api.star-citizen.wiki/api/v2";

if (!UEX_API_KEY) {
  console.error("UEXTOKEN not found in .env file");
}

const uexClient = axios.create({
  baseURL: UEX_BASE_URL,
  headers: {
    Authorization: `Bearer ${UEX_API_KEY}`,
  },
});

const scwClient = axios.create({
  baseURL: SCW_BASE_URL,
});

const sctClient = axios.create({
  baseURL: "https://starcitizen.tools",
});

export function isObject(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

/**
 * Strip bulky and empty fields to save model context.
 *
 * This is a presentation concern for LLM consumers only. Tool handlers return
 * raw upstream data so that non-LLM adapters (the HTTP daemon, voice presets)
 * can read fields this would otherwise discard.
 */
export function optimizeData(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(optimizeData);
  } else if (isObject(data)) {
    return Object.fromEntries(
      Object.entries(data)
        .filter(([k, v]) => {
          // Remove empty values to save context
          if (v === null || v === "" || v === 0) return false;
          // Filter out bulky historical/statistical data from UEX
          if (
            k.includes("_min") ||
            k.includes("_max") ||
            k.includes("_avg") ||
            k.includes("_week") ||
            k.includes("_month")
          )
            return false;
          if (k.startsWith("volatility_") || k.startsWith("id_")) return false;
          if (k === "date_added" || k === "date_modified") return false;
          return true;
        })
        .map(([k, v]) => [k, optimizeData(v)]),
    );
  }
  return data;
}

export const DEFAULT_OUTPUT_BUDGET = 40000;

export function formatOutput(data: unknown, maxLength: number = DEFAULT_OUTPUT_BUDGET): string {
  const optimized = optimizeData(data);
  let jsonStr = JSON.stringify(optimized, null, 2);

  if (jsonStr.length > maxLength) {
    jsonStr = JSON.stringify(optimized); // Fallback to minified JSON
  }

  if (jsonStr.length > maxLength) {
    const note = "\n... [Output truncated due to excessive length]";
    jsonStr = jsonStr.substring(0, maxLength - note.length) + note;
  }

  return jsonStr;
}

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function clearCache() {
  cache.clear();
}

async function fetchWithCache(client: AxiosInstance, url: string, config?: AxiosRequestConfig) {
  const cacheKey = (client.defaults?.baseURL || "") + url + JSON.stringify(config?.params || {});
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.error(`[Cache Hit] ${cacheKey}`);
    return { data: cached.data };
  }

  console.error(`[Cache Miss] ${cacheKey}`);
  const response = await client.get(url, config);
  cache.set(cacheKey, { data: response.data, timestamp: Date.now() });
  return { data: response.data };
}

function filterByField(data: unknown, field: string, value: string | undefined) {
  if (!value || !Array.isArray(data)) return data;
  return data.filter(
    (d: Record<string, unknown>) =>
      typeof d[field] === "string" && (d[field] as string).toLowerCase() === value.toLowerCase(),
  );
}

export type JsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object"
  | "null";

export interface JsonSchema {
  type: "object";
  properties: Record<string, { type: JsonSchemaType; description?: string }>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /**
   * Returns raw upstream data. A string return is emitted verbatim by adapters;
   * anything else is serialized by the adapter that consumes it.
   */
  handler: (args: unknown) => Promise<unknown>;
}

export const tools: ToolDefinition[] = [
  {
    name: "uex_get_commodities",
    description: "Get a list of all commodities in Star Citizen from UEX Corp.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const response = await fetchWithCache(uexClient, "/commodities");
      return response.data.data;
    },
  },
  {
    name: "uex_get_commodity_prices",
    description:
      "Get current prices for a specific commodity from UEX Corp. Returns buy/sell prices at various terminals.",
    inputSchema: {
      type: "object",
      properties: {
        commodity_name: {
          type: "string",
          description: "The name of the commodity (e.g., 'Gold', 'Laranite').",
        },
        star_system_name: {
          type: "string",
          description: "Optional: Filter by star system (e.g., 'Stanton', 'Pyro').",
        },
        planet_name: {
          type: "string",
          description: "Optional: Filter by planet name.",
        },
        terminal_name: {
          type: "string",
          description: "Optional: Filter by terminal name.",
        },
      },
      required: ["commodity_name"],
    },
    handler: async (args) => {
      const { commodity_name, star_system_name, planet_name, terminal_name } = z
        .object({
          commodity_name: z.string(),
          star_system_name: z.string().optional(),
          planet_name: z.string().optional(),
          terminal_name: z.string().optional(),
        })
        .parse(args);
      const response = await fetchWithCache(uexClient, "/commodities_prices", {
        params: { commodity_name },
      });

      let data = response.data.data;
      data = filterByField(data, "star_system_name", star_system_name);
      data = filterByField(data, "planet_name", planet_name);
      data = filterByField(data, "terminal_name", terminal_name);
      return data;
    },
  },
  {
    name: "uex_get_commodity_averages",
    description: "Get average prices for a specific commodity over time from UEX Corp.",
    inputSchema: {
      type: "object",
      properties: {
        commodity_name: {
          type: "string",
          description: "The name of the commodity (e.g., 'Gold', 'Laranite').",
        },
      },
      required: ["commodity_name"],
    },
    handler: async (args) => {
      const { commodity_name } = z.object({ commodity_name: z.string() }).parse(args);
      const response = await fetchWithCache(uexClient, "/commodities_averages", {
        params: { commodity_name },
      });
      return response.data.data;
    },
  },
  {
    name: "uex_get_terminals",
    description: "Get a list of all terminals (locations) in Star Citizen from UEX Corp.",
    inputSchema: {
      type: "object",
      properties: {
        star_system_name: {
          type: "string",
          description: "Optional: Filter by star system (e.g., 'Stanton', 'Pyro').",
        },
        planet_name: {
          type: "string",
          description: "Optional: Filter by planet name.",
        },
      },
    },
    handler: async (args) => {
      const { star_system_name, planet_name } = z
        .object({
          star_system_name: z.string().optional(),
          planet_name: z.string().optional(),
        })
        .parse(args || {});
      const response = await fetchWithCache(uexClient, "/terminals");

      let data = response.data.data;
      data = filterByField(data, "star_system_name", star_system_name);
      data = filterByField(data, "planet_name", planet_name);
      return data;
    },
  },
  {
    name: "uex_get_trade_routes",
    description: "Get suggested trade routes based on current market data from UEX Corp.",
    inputSchema: {
      type: "object",
      properties: {
        investment: {
          type: "number",
          description: "Available credits for investment.",
        },
        cargo_capacity: {
          type: "number",
          description: "Cargo capacity in SCU.",
        },
      },
    },
    handler: async (args) => {
      const { investment, cargo_capacity } = z
        .object({
          investment: z.number().optional(),
          cargo_capacity: z.number().optional(),
        })
        .parse(args || {});
      const response = await fetchWithCache(uexClient, "/commodities_routes", {
        params: { investment, scu: cargo_capacity },
      });
      return response.data.data;
    },
  },
  {
    name: "uex_get_commodity_ranking",
    description:
      "Get ranking of commodities based on various metrics (e.g., profit) from UEX Corp.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const response = await fetchWithCache(uexClient, "/commodities_ranking");
      return response.data.data;
    },
  },
  {
    name: "scw_search",
    description: "Search the Star Citizen Wiki for any item, ship, or lore topic.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query.",
        },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const { query } = z.object({ query: z.string() }).parse(args);
      // Using MediaWiki API for search as it's more flexible for general queries
      const response = await fetchWithCache(scwClient, "https://star-citizen.wiki/api.php", {
        params: {
          action: "opensearch",
          search: query,
          format: "json",
          limit: 10,
        },
      });
      return response.data;
    },
  },
  {
    name: "scw_get_vehicle",
    description:
      "Get detailed information about a vehicle (ship/ground vehicle) from the Star Citizen Wiki.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name of the vehicle (e.g., '300i', 'Carrack').",
        },
      },
      required: ["name"],
    },
    handler: async (args) => {
      const { name: vehicleName } = z.object({ name: z.string() }).parse(args);
      const response = await fetchWithCache(
        scwClient,
        `/vehicles/${encodeURIComponent(vehicleName)}`,
      );
      return response.data.data;
    },
  },
  {
    name: "scw_get_item",
    description:
      "Get detailed information about an item (weapon, armor, component) from the Star Citizen Wiki.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name of the item (e.g., 'FS-9 LMG', 'Lynx Helmet').",
        },
      },
      required: ["name"],
    },
    handler: async (args) => {
      const { name: itemName } = z.object({ name: z.string() }).parse(args);
      const response = await fetchWithCache(scwClient, `/items/${encodeURIComponent(itemName)}`);
      return response.data.data;
    },
  },
  {
    name: "sct_search",
    description: "Search Star Citizen Tools (starcitizen.tools) for any topic.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query.",
        },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const { query } = z.object({ query: z.string() }).parse(args);
      const response = await fetchWithCache(sctClient, "/api.php", {
        params: {
          action: "opensearch",
          search: query,
          format: "json",
          limit: 10,
        },
      });
      return response.data;
    },
  },
  {
    name: "sct_get_article",
    description: "Get the text content of an article from Star Citizen Tools (starcitizen.tools).",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The title of the article (e.g., 'Wikelo', 'Carrack').",
        },
      },
      required: ["title"],
    },
    handler: async (args) => {
      const { title } = z.object({ title: z.string() }).parse(args);
      const response = await fetchWithCache(sctClient, "/api.php", {
        params: {
          action: "query",
          prop: "extracts",
          explaintext: "1",
          format: "json",
          titles: title,
        },
      });

      if (
        response.data &&
        isObject(response.data) &&
        isObject(response.data.query) &&
        isObject(response.data.query.pages)
      ) {
        const pages = response.data.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pageId !== "-1" && isObject(pages[pageId])) {
          const extract = pages[pageId].extract as string | undefined;
          // Fall through to the raw payload when the page exists but has no extract.
          if (extract) return extract;
        } else {
          return "Article not found.";
        }
      }

      return response.data;
    },
  },
];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));

export function getTool(name: string): ToolDefinition | undefined {
  return toolsByName.get(name);
}

/**
 * Coerce a flat string map (an HTTP query string) into the shape a tool's
 * inputSchema declares. Query params arrive as strings; number and boolean
 * properties need converting before the handler's zod schema sees them.
 */
export function coerceArgs(
  schema: JsonSchema,
  raw: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const prop = schema.properties[key];
    if (!prop) continue; // ignore params the tool doesn't declare
    if (value === "") continue; // treat ?x= as absent
    if (prop.type === "number" || prop.type === "integer") {
      const n = Number(value);
      if (Number.isNaN(n)) {
        throw new Error(`Parameter '${key}' must be a number, got '${value}'`);
      }
      out[key] = n;
    } else if (prop.type === "boolean") {
      out[key] = value !== "false" && value !== "0";
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function describeError(error: unknown): string {
  let errorMessage = "Unknown error occurred";
  let details = "";

  if (error instanceof Error) {
    errorMessage = error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "data" in error.response
  ) {
    details = JSON.stringify(error.response.data);
  }

  return `Error: ${errorMessage}${details ? `\nDetails: ${details}` : ""}`;
}
