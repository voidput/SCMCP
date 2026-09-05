import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import dotenv from "dotenv";
import { z } from "zod";

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

const server = new Server(
  {
    name: "star-citizen-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
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
        description:
          "Get ranking of commodities based on various metrics (e.g., profit) from UEX Corp.",
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
      },
      {
        name: "sct_get_article",
        description:
          "Get the text content of an article from Star Citizen Tools (starcitizen.tools).",
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
      },
      {
        name: "scw_get_ship_vendors",
        description:
          "Get a list of vendors/dealers selling a specific ship with their locations and system info.",
        inputSchema: {
          type: "object",
          properties: {
            ship_name: {
              type: "string",
              description: "The name of the ship (e.g., 'Ursa Medivac', 'Carrack', '300i').",
            },
          },
          required: ["ship_name"],
        },
      },
      {
        name: "scw_search_ships_by_vendor",
        description:
          "Search for ships available at a specific vendor/location, optionally filtered by system.",
        inputSchema: {
          type: "object",
          properties: {
            vendor_name: {
              type: "string",
              description: "The vendor/dealer name (e.g., 'Ruin Station', 'Port Tressler').",
            },
            star_system_name: {
              type: "string",
              description: "Optional: Filter by star system (e.g., 'Pyro', 'Stanton').",
            },
          },
          required: ["vendor_name"],
        },
      },
      {
        name: "uex_get_ship_prices",
        description:
          "Get purchase prices for a specific ship across all vendors/terminals from UEX Corp.",
        inputSchema: {
          type: "object",
          properties: {
            vehicle_name: {
              type: "string",
              description: "The name of the ship (e.g., 'Ursa Medivac', 'Carrack').",
            },
            star_system_name: {
              type: "string",
              description: "Optional: Filter by star system (e.g., 'Pyro', 'Stanton').",
            },
          },
          required: ["vehicle_name"],
        },
      },
      {
        name: "scw_get_ship_comparison",
        description:
          "Compare specs (size, crew, cargo, speed, etc.) between two or more ships from the Star Citizen Wiki.",
        inputSchema: {
          type: "object",
          properties: {
            ship_names: {
              type: "array",
              items: { type: "string" },
              description: "List of ship names to compare (e.g., ['Ursa Medivac', 'Cutlass Red']).",
              minItems: 2,
            },
          },
          required: ["ship_names"],
        },
      },
      {
        name: "uex_get_terminal_inventory",
        description:
          "Get inventory (items, ships, weapons) sold at a specific terminal from UEX data.",
        inputSchema: {
          type: "object",
          properties: {
            terminal_id: {
              type: "number",
              description: "The UEX terminal ID (e.g., 473 for Ruin Station Buy and Fly).",
            },
            terminal_name: {
              type: "string",
              description:
                "Optional: Terminal name to search for (e.g., 'Ruin Station', 'Checkmate').",
            },
            inventory_type: {
              type: "string",
              enum: ["ships", "weapons", "armor", "components", "all"],
              description:
                "Type of inventory to retrieve (ships, weapons, armor, components, or all).",
            },
          },
        },
      },
    ],
  };
});

function isObject(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

function optimizeData(data: unknown): unknown {
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

function formatOutput(data: unknown): string {
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

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
      if (Array.isArray(data)) {
        if (star_system_name) {
          data = data.filter(
            (d: Record<string, unknown>) =>
              typeof d.star_system_name === "string" &&
              d.star_system_name.toLowerCase() === star_system_name.toLowerCase(),
          );
        }
        if (planet_name) {
          data = data.filter(
            (d: Record<string, unknown>) =>
              typeof d.planet_name === "string" &&
              d.planet_name.toLowerCase() === planet_name.toLowerCase(),
          );
        }
        if (terminal_name) {
          data = data.filter(
            (d: Record<string, unknown>) =>
              typeof d.terminal_name === "string" &&
              d.terminal_name.toLowerCase() === terminal_name.toLowerCase(),
          );
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
      const { star_system_name, planet_name } = z
        .object({
          star_system_name: z.string().optional(),
          planet_name: z.string().optional(),
        })
        .parse(args || {});
      const response = await fetchWithCache(uexClient, "/terminals");

      let data = response.data.data;
      if (Array.isArray(data)) {
        if (star_system_name) {
          data = data.filter(
            (d: Record<string, unknown>) =>
              typeof d.star_system_name === "string" &&
              d.star_system_name.toLowerCase() === star_system_name.toLowerCase(),
          );
        }
        if (planet_name) {
          data = data.filter(
            (d: Record<string, unknown>) =>
              typeof d.planet_name === "string" &&
              d.planet_name.toLowerCase() === planet_name.toLowerCase(),
          );
        }
      }

      return {
        content: [{ type: "text", text: formatOutput(data) }],
      };
    }

    if (name === "uex_get_trade_routes") {
      const { investment, cargo_capacity } = z
        .object({
          investment: z.number().optional(),
          cargo_capacity: z.number().optional(),
        })
        .parse(args);
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
      const response = await fetchWithCache(
        scwClient,
        `/vehicles/${encodeURIComponent(vehicleName)}`,
      );
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

    if (name === "sct_search") {
      const { query } = z.object({ query: z.string() }).parse(args);
      const response = await fetchWithCache(sctClient, "/api.php", {
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

    if (name === "sct_get_article") {
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

      let textContent = "";
      if (
        response.data &&
        isObject(response.data) &&
        isObject(response.data.query) &&
        isObject(response.data.query.pages)
      ) {
        const pages = response.data.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pageId !== "-1" && isObject(pages[pageId])) {
          textContent = (pages[pageId].extract as string) || "";
        } else {
          textContent = "Article not found.";
        }
      }

      return {
        content: [{ type: "text", text: textContent || formatOutput(response.data) }],
      };
    }

    if (name === "scw_get_ship_vendors") {
      const { ship_name } = z.object({ ship_name: z.string() }).parse(args);
      try {
        // Try fetching ship details first to get vendor info
        const shipResponse = await fetchWithCache(
          scwClient,
          `/vehicles/${encodeURIComponent(ship_name)}`,
        );

        let vendors: Record<string, unknown>[] = [];
        if (shipResponse.data && isObject(shipResponse.data.data)) {
          const shipData = shipResponse.data.data;
          // Look for vendor info in ship data
          if ("vendors" in shipData && Array.isArray(shipData.vendors)) {
            vendors = shipData.vendors as Record<string, unknown>[];
          }
          // Also include basic ship info for reference
          const shipInfo = {
            ship_name: shipData.name || ship_name,
            ship_type: shipData.type,
            ship_manufacturer: shipData.manufacturer,
            vendors: vendors.length > 0 ? vendors : "Vendor data not available in wiki",
            note:
              "For real-time vendor availability, check UEX terminals in Pyro (Ruin Station Buy and Fly, Checkmate Ship Parts, etc.) or game vendors.",
          };
          return {
            content: [{ type: "text", text: formatOutput(shipInfo) }],
          };
        }
      } catch {
        // Fallback: return helpful info about checking vendors
      }

      return {
        content: [
          {
            type: "text",
            text: formatOutput({
              query: ship_name,
              message:
                "Ship vendor data not found in Star Citizen Wiki. Check these locations for ships:",
              vendors_to_check: [
                {
                  location: "Ruin Station",
                  system: "Pyro",
                  terminal: "Buy and Fly (BFRUI)",
                  note: "Primary new ship dealer in Pyro",
                },
                {
                  location: "Checkmate Station",
                  system: "Pyro",
                  terminal: "Ship Parts (SPCHE)",
                  note: "Ship upgrades and components",
                },
                {
                  location: "Port Tressler",
                  system: "Stanton",
                  terminal: "Aegis Dynamics",
                  note: "Aegis manufacturer dealer",
                },
              ],
              note: "Use uex_get_terminals to find full vendor list by system",
            }),
          },
        ],
      };
    }

    if (name === "scw_search_ships_by_vendor") {
      const { vendor_name, star_system_name } = z
        .object({
          vendor_name: z.string(),
          star_system_name: z.string().optional(),
        })
        .parse(args);

      // Get terminals by vendor name from UEX
      const terminalsResponse = await fetchWithCache(uexClient, "/terminals");
      let terminals = terminalsResponse.data.data;

      if (Array.isArray(terminals)) {
        terminals = terminals.filter(
          (t: Record<string, unknown>) =>
            (typeof t.name === "string" &&
              t.name.toLowerCase().includes(vendor_name.toLowerCase())) ||
            (typeof t.fullname === "string" &&
              t.fullname.toLowerCase().includes(vendor_name.toLowerCase())) ||
            (typeof t.nickname === "string" &&
              t.nickname.toLowerCase().includes(vendor_name.toLowerCase())),
        );

        if (star_system_name) {
          terminals = terminals.filter(
            (t: Record<string, unknown>) =>
              typeof t.star_system_name === "string" &&
              t.star_system_name.toLowerCase() === star_system_name.toLowerCase(),
          );
        }

        const vendorInfo = terminals.map((t: Record<string, unknown>) => ({
          vendor_name: t.nickname || t.name,
          full_name: t.fullname,
          location: `${t.planet_name || t.space_station_name || "Space"}`,
          system: t.star_system_name,
          has_ship_shop: t.is_shop_vehicle === 1,
          terminal_code: t.code,
          terminal_id: t.id,
        }));

        if (vendorInfo.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: formatOutput({
                  vendor_query: vendor_name,
                  system_filter: star_system_name || "All systems",
                  vendors_found: vendorInfo,
                  note: "Use scw_get_vehicle to get specific ship details and availability",
                }),
              },
            ],
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: formatOutput({
              vendor_query: vendor_name,
              message: "No vendors found matching query",
              suggestion: "Try using uex_get_terminals to list all terminals in a system",
            }),
          },
        ],
      };
    }

    if (name === "uex_get_ship_prices") {
      const { vehicle_name, star_system_name } = z
        .object({
          vehicle_name: z.string(),
          star_system_name: z.string().optional(),
        })
        .parse(args);

      const response = await fetchWithCache(uexClient, "/vehicles_purchases_prices", {
        params: { vehicle_name },
      });

      let data = response.data.data;
      if (Array.isArray(data) && star_system_name) {
        data = data.filter(
          (d: Record<string, unknown>) =>
            typeof d.star_system_name === "string" &&
            d.star_system_name.toLowerCase() === star_system_name.toLowerCase(),
        );
      }

      return {
        content: [{ type: "text", text: formatOutput(data) }],
      };
    }

    if (name === "scw_get_ship_comparison") {
      const { ship_names } = z
        .object({ ship_names: z.array(z.string()).min(2) })
        .parse(args);

      const results = await Promise.all(
        ship_names.map(async (shipName) => {
          try {
            const response = await fetchWithCache(
              scwClient,
              `/vehicles/${encodeURIComponent(shipName)}`,
            );
            return { ship: shipName, data: optimizeData(response.data.data) };
          } catch {
            return { ship: shipName, error: "Ship not found" };
          }
        }),
      );

      return {
        content: [{ type: "text", text: formatOutput({ comparison: results }) }],
      };
    }

    if (name === "uex_get_terminal_inventory") {
      const { terminal_id, terminal_name, inventory_type } = z
        .object({
          terminal_id: z.number().optional(),
          terminal_name: z.string().optional(),
          inventory_type: z.enum(["ships", "weapons", "armor", "components", "all"]).optional(),
        })
        .parse(args);

      const response = await fetchWithCache(uexClient, "/terminals");
      let terminals = response.data.data;

      if (Array.isArray(terminals)) {
        if (terminal_id) {
          terminals = terminals.filter((t: Record<string, unknown>) => t.id === terminal_id);
        }
        if (terminal_name) {
          terminals = terminals.filter(
            (t: Record<string, unknown>) =>
              (typeof t.name === "string" &&
                t.name.toLowerCase().includes(terminal_name.toLowerCase())) ||
              (typeof t.nickname === "string" &&
                t.nickname.toLowerCase().includes(terminal_name.toLowerCase())),
          );
        }

        const inventoryFilter = inventory_type || "all";
        const terminalInventory = terminals.map((t: Record<string, unknown>) => {
          const inventory: Record<string, unknown> = {};

          if (
            inventoryFilter === "ships" ||
            inventoryFilter === "all" ||
            (t.is_shop_vehicle === 1 && inventoryFilter === "all")
          ) {
            if (t.is_shop_vehicle === 1) {
              inventory.ships = "Available";
            }
          }
          if (inventoryFilter === "weapons" || inventoryFilter === "all") {
            if (t.is_shop_fps === 1) {
              inventory.weapons = "Available";
            }
          }
          if (inventoryFilter === "armor" || inventoryFilter === "all") {
            if (t.is_shop_fps === 1) {
              inventory.armor = "Available (with FPS items)";
            }
          }
          if (inventoryFilter === "components" || inventoryFilter === "all") {
            if (t.is_shop_vehicle === 1) {
              inventory.components = "Available";
            }
          }

          return {
            terminal_id: t.id,
            terminal_name: t.nickname || t.name,
            full_name: t.fullname,
            location: `${t.planet_name || ""}/${t.space_station_name || t.orbit_name || ""}`.replace(
              /^\/+|\/+$/g,
              "",
            ),
            system: t.star_system_name,
            inventory: Object.keys(inventory).length > 0 ? inventory : "No inventory matching filter",
            faction: t.faction_name,
            game_version: t.game_version,
          };
        });

        return {
          content: [
            {
              type: "text",
              text: formatOutput({
                query: {
                  terminal_id,
                  terminal_name,
                  inventory_type: inventoryFilter,
                },
                results: terminalInventory,
                note: "For specific item/ship pricing, use commodity_prices or search tools",
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: formatOutput({
              message: "No terminals found",
              suggestion: "Use uex_get_terminals to find terminals",
            }),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: unknown) {
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

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}${details ? `\nDetails: ${details}` : ""}`,
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
