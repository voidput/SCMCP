import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

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

const server = new Server(
  {
    name: "star-citizen-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "uex_get_commodities",
        description: "Get a list of all commodities in Star Citizen from UEX Corp.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "uex_get_commodity_prices",
        description: "Get current prices for a specific commodity from UEX Corp. Returns buy/sell prices at various terminals.",
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
      },
      {
        name: "uex_get_commodity_ranking",
        description: "Get ranking of commodities based on various metrics (e.g., profit) from UEX Corp.",
        inputSchema: {
          type: "object",
          properties: {},
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
      },
      {
        name: "scw_get_vehicle",
        description: "Get detailed information about a vehicle (ship/ground vehicle) from the Star Citizen Wiki.",
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
      },
      {
        name: "scw_get_item",
        description: "Get detailed information about an item (weapon, armor, component) from the Star Citizen Wiki.",
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
      },
    ],
  };
});

function optimizeData(data: any): any {
  if (Array.isArray(data)) {
    return data.map(optimizeData);
  } else if (data !== null && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data)
        .filter(([k, v]) => {
          // Remove empty values to save context
          if (v === null || v === "" || v === 0) return false;
          // Filter out bulky historical/statistical data from UEX
          if (k.includes("_min") || k.includes("_max") || k.includes("_avg") || k.includes("_week") || k.includes("_month")) return false;
          if (k.startsWith("volatility_") || k.startsWith("id_")) return false;
          if (k === "date_added" || k === "date_modified") return false;
          return true;
        })
        .map(([k, v]) => [k, optimizeData(v)])
    );
  }
  return data;
}

function formatOutput(data: any): string {
  const optimized = optimizeData(data);
  let jsonStr = JSON.stringify(optimized, null, 2);
  
  if (jsonStr.length > 40000) {
    jsonStr = JSON.stringify(optimized); // Fallback to minified JSON
  }
  
  if (jsonStr.length > 40000) {
    const note = "\n... [Output truncated due to excessive length]";
    jsonStr = jsonStr.substring(0, 40000 - note.length) + note;
  }
  
  return jsonStr;
}

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchWithCache(client: any, url: string, config?: any) {
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

/**
 * Handle tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "uex_get_commodities") {
      const response = await fetchWithCache(uexClient, "/commodities");
      return {
        content: [{ type: "text", text: formatOutput(response.data.data) }],
      };
    }

    if (name === "uex_get_commodity_prices") {
      const { commodity_name, star_system_name, planet_name, terminal_name } = z.object({ 
        commodity_name: z.string(),
        star_system_name: z.string().optional(),
        planet_name: z.string().optional(),
        terminal_name: z.string().optional(),
      }).parse(args);
      const response = await fetchWithCache(uexClient, "/commodities_prices", {
        params: { commodity_name },
      });
      
      let data = response.data.data;
      if (Array.isArray(data)) {
        if (star_system_name) {
          data = data.filter((d: any) => d.star_system_name?.toLowerCase() === star_system_name.toLowerCase());
        }
        if (planet_name) {
          data = data.filter((d: any) => d.planet_name?.toLowerCase() === planet_name.toLowerCase());
        }
        if (terminal_name) {
          data = data.filter((d: any) => d.terminal_name?.toLowerCase() === terminal_name.toLowerCase());
        }
      }
      
      return {
        content: [{ type: "text", text: formatOutput(data) }],
      };
    }

    if (name === "uex_get_commodity_averages") {
      const { commodity_name } = z.object({ commodity_name: z.string() }).parse(args);
      const response = await fetchWithCache(uexClient, "/commodities_averages", {
        params: { commodity_name },
      });
      return {
        content: [{ type: "text", text: formatOutput(response.data.data) }],
      };
    }

    if (name === "uex_get_terminals") {
      const { star_system_name, planet_name } = z.object({
        star_system_name: z.string().optional(),
        planet_name: z.string().optional(),
      }).parse(args || {});
      const response = await fetchWithCache(uexClient, "/terminals");
      
      let data = response.data.data;
      if (Array.isArray(data)) {
        if (star_system_name) {
          data = data.filter((d: any) => d.star_system_name?.toLowerCase() === star_system_name.toLowerCase());
        }
        if (planet_name) {
          data = data.filter((d: any) => d.planet_name?.toLowerCase() === planet_name.toLowerCase());
        }
      }
      
      return {
        content: [{ type: "text", text: formatOutput(data) }],
      };
    }

    if (name === "uex_get_trade_routes") {
      const { investment, cargo_capacity } = z.object({
        investment: z.number().optional(),
        cargo_capacity: z.number().optional()
      }).parse(args);
      const response = await fetchWithCache(uexClient, "/commodities_routes", {
        params: { investment, scu: cargo_capacity },
      });
      return {
        content: [{ type: "text", text: formatOutput(response.data.data) }],
      };
    }

    if (name === "uex_get_commodity_ranking") {
      const response = await fetchWithCache(uexClient, "/commodities_ranking");
      return {
        content: [{ type: "text", text: formatOutput(response.data.data) }],
      };
    }

    if (name === "scw_search") {
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
      return {
        content: [{ type: "text", text: formatOutput(response.data) }],
      };
    }

    if (name === "scw_get_vehicle") {
      const { name: vehicleName } = z.object({ name: z.string() }).parse(args);
      const response = await fetchWithCache(scwClient, `/vehicles/${encodeURIComponent(vehicleName)}`);
      return {
        content: [{ type: "text", text: formatOutput(response.data.data) }],
      };
    }

    if (name === "scw_get_item") {
      const { name: itemName } = z.object({ name: z.string() }).parse(args);
      const response = await fetchWithCache(scwClient, `/items/${encodeURIComponent(itemName)}`);
      return {
        content: [{ type: "text", text: formatOutput(response.data.data) }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error: ${error.message}${error.response?.data ? `\nDetails: ${JSON.stringify(error.response.data)}` : ""}`,
        },
      ],
    };
  }
});

/**
 * Start the server.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Star Citizen MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});