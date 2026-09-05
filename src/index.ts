import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  formatOutput,
  formatOutputRaw,
  isObject,
  optimizeData,
  summarizeItem,
  summarizeList,
  summarizeVehicle,
} from "./format.js";
import { listDatasets, readCollection, searchDataset } from "./localdata.js";
import { USER_AGENT, VERSION } from "./useragent.js";
import {
  DATASETS,
  type DatasetName,
  diffDatasets,
  fetchDataset,
  listBuilds,
  resolveBuild,
} from "./versions.js";

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
    "User-Agent": USER_AGENT,
  },
});

const scwClient = axios.create({
  baseURL: SCW_BASE_URL,
  headers: { "User-Agent": USER_AGENT },
});

const sctClient = axios.create({
  baseURL: "https://starcitizen.tools",
  headers: { "User-Agent": USER_AGENT },
});

const server = new Server(
  {
    name: "star-citizen-mcp",
    version: VERSION,
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
        name: "scw_list_vehicles",
        description:
          "Browse/list ships and ground vehicles from the Star Citizen Wiki. Filter by manufacturer, role (e.g. 'Medical', 'Cargo'), career, or size. Use scw_get_filters to see all valid values.",
        inputSchema: {
          type: "object",
          properties: {
            manufacturer: {
              type: "string",
              description: "Optional: Manufacturer name (e.g., 'Aegis Dynamics', 'Drake Interplanetary').",
            },
            role: {
              type: "string",
              description:
                "Optional: Ship role (e.g., 'Medical', 'Cargo', 'Heavy Fighter', 'Light Mining').",
            },
            career: {
              type: "string",
              description:
                "Optional: Career category (e.g., 'Combat', 'Industrial', 'Support', 'Exploration').",
            },
            size: {
              type: "number",
              description: "Optional: Vehicle size class (1-6, 10).",
            },
            is_spaceship: {
              type: "boolean",
              description: "Optional: true for spaceships only, false for ground vehicles only.",
            },
            page: {
              type: "number",
              description: "Optional: Page number for pagination (default 1).",
            },
            per_page: {
              type: "number",
              description: "Optional: Results per page (default 20, max 50).",
            },
          },
        },
      },
      {
        name: "scw_list_items",
        description:
          "Browse/list weapons, armor, and ship components from the Star Citizen Wiki. Pick a category endpoint and optionally filter by type, size, grade, class, or manufacturer. Use scw_get_filters to see valid values.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: [
                "items",
                "weapons",
                "weapon-attachments",
                "armor",
                "clothes",
                "food",
                "vehicle-weapons",
                "vehicle-items",
              ],
              description:
                "Which catalog to browse. 'vehicle-items' = ship components (shields, coolers, quantum drives), 'vehicle-weapons' = ship weapons, 'weapons' = FPS weapons. Defaults to 'items' (everything).",
            },
            type: {
              type: "string",
              description:
                "Optional: Item type (e.g., 'Shield', 'Cooler', 'Quantum Drive', 'Power Plant', 'Weapon Gun', 'Missile').",
            },
            sub_type: {
              type: "string",
              description: "Optional: Item sub-type (e.g., 'Gun', 'Manned Turret', 'Missile Rack').",
            },
            size: {
              type: "number",
              description: "Optional: Component size (0-12).",
            },
            grade: {
              type: "string",
              enum: ["A", "B", "C", "D"],
              description: "Optional: Component grade.",
            },
            class: {
              type: "string",
              description:
                "Optional: Component class (e.g., 'Military', 'Civilian', 'Stealth', 'Industrial', 'Competition').",
            },
            manufacturer: {
              type: "string",
              description: "Optional: Manufacturer name (e.g., 'Behring Applied Technology').",
            },
            page: {
              type: "number",
              description: "Optional: Page number for pagination (default 1).",
            },
            per_page: {
              type: "number",
              description: "Optional: Results per page (default 20, max 50).",
            },
          },
        },
      },
      {
        name: "scw_get_filters",
        description:
          "Get all valid filter names and allowed values for vehicles or items. Call this before filtering to use exact values.",
        inputSchema: {
          type: "object",
          properties: {
            dataset: {
              type: "string",
              enum: ["vehicles", "items"],
              description: "Which dataset's filters to retrieve.",
            },
          },
          required: ["dataset"],
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
        name: "sc_local_datasets",
        description:
          "List locally extracted game data (mining, blueprints, reputation, ordnance, components, lore) with the game build it came from. This data is extracted from the shipped game files and covers domains no public API exposes.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "sc_search_local",
        description:
          "Search locally extracted game data for records matching a term. Use for mining ore signatures and spawn locations, crafting blueprints, reputation and mission brokers, quality bands, and Wikelo trades.",
        inputSchema: {
          type: "object",
          properties: {
            dataset: {
              type: "string",
              description: "Dataset name, e.g. 'game-mining' or 'game-blueprints'. See sc_local_datasets.",
            },
            query: {
              type: "string",
              description: "Case-insensitive term to match against keys, names and record contents.",
            },
            collection: {
              type: "string",
              description: "Optional: restrict to one collection within the dataset.",
            },
            limit: {
              type: "number",
              description: "Max records to return (default 20).",
            },
          },
          required: ["dataset", "query"],
        },
      },
      {
        name: "sc_read_local_collection",
        description:
          "Read one collection from a locally extracted dataset, with paging. Use after sc_local_datasets to browse in bulk.",
        inputSchema: {
          type: "object",
          properties: {
            dataset: { type: "string", description: "Dataset name, e.g. 'game-mining'." },
            collection: { type: "string", description: "Collection within the dataset, e.g. 'oreSignatures'." },
            offset: { type: "number", description: "Records to skip (default 0)." },
            limit: { type: "number", description: "Records to return (default 25, max 200)." },
          },
          required: ["dataset", "collection"],
        },
      },
      {
        name: "sc_list_builds",
        description:
          "List the game builds (patch versions) for which historical data dumps exist, newest first. Use this to discover which versions can be compared.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "How many builds to return (default 40, max 100).",
            },
          },
        },
      },
      {
        name: "sc_diff_versions",
        description:
          "Compare game data between any two patch versions. Reports what was added, removed, and changed. Pass item_name to get every changed field for one ship/weapon/component, otherwise returns a summary with the most-changed entries. This is the tool for questions like 'what changed for X between 4.9 and 4.10'.",
        inputSchema: {
          type: "object",
          properties: {
            dataset: {
              type: "string",
              enum: ["ships", "ship-components", "fps-weapons", "ammo", "mining", "mining-spawns", "blueprints", "missions", "reputation", "containers", "starmap", "manufacturers", "wikelo-trades", "strings"],
              description:
                "Which dataset to diff. 'ship-components' covers ship weapons, shields, coolers, power plants, quantum drives and radars; 'strings' is the localisation table, useful for spotting renamed or newly added content.",
            },
            from_version: {
              type: "string",
              description: "Older version, e.g. '4.9' or a full build string like '4.9.0-LIVE.12344265'.",
            },
            to_version: {
              type: "string",
              description: "Newer version, e.g. '4.10'.",
            },
            collection: {
              type: "string",
              description:
                "Optional: which collection inside the dataset to diff. Defaults to the main one (e.g. 'weapons' for ship-components); pass 'shields', 'quantumDrives', 'radars' or 'missiles' to diff those instead.",
            },
            item_name: {
              type: "string",
              description:
                "Optional: restrict to entries matching this name or class name (e.g. 'AD5B', 'Mantis', 'Talon'). Returns field-level changes.",
            },
            limit: {
              type: "number",
              description: "Max entries listed per category in summary mode (default 50).",
            },
          },
          required: ["dataset", "from_version", "to_version"],
        },
      },
      {
        name: "uex_get_game_versions",
        description:
          "Get current Star Citizen game versions (LIVE and PTU build strings) tracked by UEX Corp.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "scw_snapshot_save",
        description:
          "Save a snapshot of current ship or item data, keyed by game version, for later patch-to-patch comparison.",
        inputSchema: {
          type: "object",
          properties: {
            dataset: {
              type: "string",
              enum: ["vehicles", "items"],
              description: "Which dataset to snapshot.",
            },
            label: {
              type: "string",
              description:
                "Optional: Label for this snapshot (defaults to the game_version reported by the API).",
            },
            type: {
              type: "string",
              description:
                "Optional (items only): Restrict snapshot to one item type (e.g., 'Shields', 'WeaponPersonal').",
            },
          },
          required: ["dataset"],
        },
      },
      {
        name: "scw_snapshot_diff",
        description:
          "Compare two saved snapshots to see what changed between patches (added, removed, and changed stats).",
        inputSchema: {
          type: "object",
          properties: {
            from_label: {
              type: "string",
              description: "Label of the older snapshot.",
            },
            to_label: {
              type: "string",
              description: "Label of the newer snapshot. Omit to compare against current live data.",
            },
            dataset: {
              type: "string",
              enum: ["vehicles", "items"],
              description: "Which dataset to diff.",
            },
          },
          required: ["from_label", "dataset"],
        },
      },
      {
        name: "scw_snapshot_list",
        description: "List all saved data snapshots available for patch comparison.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "uex_get_ship_prices",
        description:
          "Find where a ship can be bought or rented in game, with prices and terminal locations, from UEX Corp. This is the tool to answer 'where can I get ship X'.",
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
            include_rentals: {
              type: "boolean",
              description: "Include rental locations as well as purchase locations (default true).",
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

const SNAPSHOT_DIR = process.env.SCMCP_SNAPSHOT_DIR || path.join(process.cwd(), ".snapshots");

/** The wiki API caps page size at 50 regardless of what is requested. */
const SCW_MAX_PAGE_SIZE = 50;

function snapshotPath(dataset: string, label: string): string {
  const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(SNAPSHOT_DIR, `${dataset}__${safeLabel}.json`);
}

/** Fetch every page of a paginated Star Citizen Wiki collection. */
async function fetchAllPages(
  endpoint: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  const collected: Record<string, unknown>[] = [];
  let page = 1;

  for (;;) {
    const response = await scwClient.get(endpoint, {
      // `per_page` is ignored. Page size is `page[size]`, capped at 50, and a bare
      // `page` alongside it silently voids it (PHP scalar/array conflict), so the
      // page number must also use bracket form.
      params: { ...params, "page[number]": page, "page[size]": SCW_MAX_PAGE_SIZE },
    });
    const pageData = response.data?.data;
    if (!Array.isArray(pageData) || pageData.length === 0) break;
    collected.push(...pageData);

    const lastPage = response.data?.meta?.last_page;
    if (typeof lastPage === "number") {
      if (page >= lastPage) break;
    } else if (pageData.length < SCW_MAX_PAGE_SIZE) {
      break;
    }
    page += 1;
  }

  return collected;
}

/** Reduce a full record to the identifying + stat fields worth diffing across patches. */
function snapshotFields(entry: Record<string, unknown>): Record<string, unknown> {
  const keep = [
    "name",
    "uuid",
    "class_name",
    "type",
    "grade",
    "size",
    "mass",
    "health",
    "shield_hp",
    "cargo_capacity",
    "speed",
    "crew",
    "weaponry",
    "msrp",
    "version",
    "game_version",
  ];
  const out: Record<string, unknown> = {};
  for (const key of keep) {
    if (key in entry) out[key] = entry[key];
  }
  return out;
}

async function loadSnapshot(dataset: string, label: string) {
  const raw = await fs.readFile(snapshotPath(dataset, label), "utf-8");
  return JSON.parse(raw) as {
    dataset: string;
    label: string;
    game_version?: string;
    captured_at: string;
    entries: Record<string, Record<string, unknown>>;
  };
}

/** Shallow-compare two snapshot entry maps keyed by name. */
function diffEntries(
  before: Record<string, Record<string, unknown>>,
  after: Record<string, Record<string, unknown>>,
) {
  const added = Object.keys(after).filter((k) => !(k in before));
  const removed = Object.keys(before).filter((k) => !(k in after));
  const changed: Record<string, Record<string, { from: unknown; to: unknown }>> = {};

  for (const key of Object.keys(after)) {
    if (!(key in before)) continue;
    const fieldDiffs: Record<string, { from: unknown; to: unknown }> = {};
    const fields = new Set([...Object.keys(before[key]), ...Object.keys(after[key])]);

    for (const field of fields) {
      // game_version stamps every record and would flag everything as changed.
      if (field === "version" || field === "game_version") continue;
      const prev = JSON.stringify(before[key][field]);
      const next = JSON.stringify(after[key][field]);
      if (prev !== next) {
        fieldDiffs[field] = { from: before[key][field], to: after[key][field] };
      }
    }

    if (Object.keys(fieldDiffs).length > 0) changed[key] = fieldDiffs;
  }

  return { added, removed, changed };
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

    if (name === "scw_list_vehicles") {
      const { manufacturer, role, career, size, is_spaceship, page, per_page } = z
        .object({
          manufacturer: z.string().optional(),
          role: z.string().optional(),
          career: z.string().optional(),
          size: z.number().optional(),
          is_spaceship: z.boolean().optional(),
          page: z.number().optional(),
          per_page: z.number().optional(),
        })
        .parse(args || {});

      const params: Record<string, unknown> = {
        // Both must use bracket form: a bare `page` silently voids `page[size]`.
        "page[number]": page ?? 1,
        "page[size]": Math.min(per_page ?? 20, SCW_MAX_PAGE_SIZE),
      };
      if (manufacturer) params["filter[manufacturer]"] = manufacturer;
      if (role) params["filter[role]"] = role;
      if (career) params["filter[career]"] = career;
      if (size !== undefined) params["filter[size]"] = size;
      if (is_spaceship !== undefined) params["filter[is_spaceship]"] = is_spaceship ? "Yes" : "No";

      const response = await fetchWithCache(scwClient, "/vehicles", { params });
      return {
        content: [
          { type: "text", text: formatOutput(summarizeList(response.data, summarizeVehicle)) },
        ],
      };
    }

    if (name === "scw_list_items") {
      const { category, type, sub_type, size, grade, class: itemClass, manufacturer, page, per_page } =
        z
          .object({
            category: z
              .enum([
                "items",
                "weapons",
                "weapon-attachments",
                "armor",
                "clothes",
                "food",
                "vehicle-weapons",
                "vehicle-items",
              ])
              .optional(),
            type: z.string().optional(),
            sub_type: z.string().optional(),
            size: z.number().optional(),
            grade: z.enum(["A", "B", "C", "D"]).optional(),
            class: z.string().optional(),
            manufacturer: z.string().optional(),
            page: z.number().optional(),
            per_page: z.number().optional(),
          })
          .parse(args || {});

      const params: Record<string, unknown> = {
        // Both must use bracket form: a bare `page` silently voids `page[size]`.
        "page[number]": page ?? 1,
        "page[size]": Math.min(per_page ?? 20, SCW_MAX_PAGE_SIZE),
      };
      if (type) params["filter[type]"] = type;
      if (sub_type) params["filter[sub_type]"] = sub_type;
      if (size !== undefined) params["filter[size]"] = size;
      if (grade) params["filter[grade]"] = grade;
      if (itemClass) params["filter[class]"] = itemClass;
      if (manufacturer) params["filter[manufacturer]"] = manufacturer;

      const response = await fetchWithCache(scwClient, `/${category ?? "items"}`, { params });
      return {
        content: [
          { type: "text", text: formatOutput(summarizeList(response.data, summarizeItem)) },
        ],
      };
    }

    if (name === "scw_get_filters") {
      const { dataset } = z.object({ dataset: z.enum(["vehicles", "items"]) }).parse(args);
      const response = await fetchWithCache(scwClient, `/${dataset}/filters`);
      return {
        content: [{ type: "text", text: formatOutput(response.data.data ?? response.data) }],
      };
    }

    if (name === "sc_local_datasets") {
      return { content: [{ type: "text", text: formatOutput(await listDatasets()) }] };
    }

    if (name === "sc_search_local") {
      const { dataset, query, collection, limit } = z
        .object({
          dataset: z.string(),
          query: z.string(),
          collection: z.string().optional(),
          limit: z.number().optional(),
        })
        .parse(args);
      const result = await searchDataset(dataset, query, { collection, limit });
      return { content: [{ type: "text", text: formatOutput(result) }] };
    }

    if (name === "sc_read_local_collection") {
      const { dataset, collection, offset, limit } = z
        .object({
          dataset: z.string(),
          collection: z.string(),
          offset: z.number().optional(),
          limit: z.number().optional(),
        })
        .parse(args);
      const result = await readCollection(dataset, collection, { offset, limit });
      return { content: [{ type: "text", text: formatOutput(result) }] };
    }

    if (name === "sc_list_builds") {
      const { limit } = z
        .object({
          limit: z.number().optional(),
        })
        .parse(args || {});

      const builds = await listBuilds(limit ?? 40);
      return {
        content: [
          {
            type: "text",
            text: formatOutput({ datasets: Object.keys(DATASETS), builds }),
          },
        ],
      };
    }

    if (name === "sc_diff_versions") {
      const { dataset, from_version, to_version, collection, item_name, limit } = z
        .object({
          dataset: z.enum(["ships", "ship-components", "fps-weapons", "ammo", "mining", "mining-spawns", "blueprints", "missions", "reputation", "containers", "starmap", "manufacturers", "wikelo-trades", "strings"]),
          from_version: z.string(),
          to_version: z.string(),
          collection: z.string().optional(),
          item_name: z.string().optional(),
          limit: z.number().optional(),
        })
        .parse(args);

      const ds = dataset as DatasetName;
      const [fromBuild, toBuild] = await Promise.all([
        resolveBuild(from_version),
        resolveBuild(to_version),
      ]);

      if (fromBuild.sha === toBuild.sha) {
        throw new Error(
          `"${from_version}" and "${to_version}" both resolve to build ${fromBuild.version}.`,
        );
      }

      const [beforeEntries, afterEntries] = await Promise.all([
        fetchDataset(ds, fromBuild, collection),
        fetchDataset(ds, toBuild, collection),
      ]);

      const result = diffDatasets(ds, fromBuild, toBuild, beforeEntries, afterEntries, {
        itemQuery: item_name,
        limit,
      });

      return {
        content: [{ type: "text", text: formatOutputRaw(result) }],
      };
    }

    if (name === "uex_get_game_versions") {
      const response = await fetchWithCache(uexClient, "/game_versions");
      const versions = response.data.data ?? {};
      // A null ptu means no PTU build is live; formatOutput strips nulls, so say it explicitly.
      return {
        content: [
          {
            type: "text",
            text: formatOutput({
              live: versions.live ?? "unknown",
              ptu: versions.ptu ?? "no active PTU build",
            }),
          },
        ],
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

    if (name === "scw_snapshot_save") {
      const { dataset, label, type } = z
        .object({
          dataset: z.enum(["vehicles", "items"]),
          label: z.string().optional(),
          type: z.string().optional(),
        })
        .parse(args);

      const params: Record<string, unknown> = {};
      if (dataset === "items" && type) params["filter[type]"] = type;

      const all = await fetchAllPages(`/${dataset}`, params);
      if (all.length === 0) {
        throw new Error(`No ${dataset} returned by the API — nothing to snapshot.`);
      }

      const gameVersion =
        (all[0].version as string) || (all[0].game_version as string) || "unknown";
      const resolvedLabel = label || gameVersion;

      const entries: Record<string, Record<string, unknown>> = {};
      for (const entry of all) {
        const key = (entry.name as string) || (entry.uuid as string);
        if (key) entries[key] = snapshotFields(entry);
      }

      await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
      await fs.writeFile(
        snapshotPath(dataset, resolvedLabel),
        JSON.stringify(
          {
            dataset,
            label: resolvedLabel,
            game_version: gameVersion,
            captured_at: new Date().toISOString(),
            entries,
          },
          null,
          2,
        ),
      );

      return {
        content: [
          {
            type: "text",
            text: formatOutput({
              saved: snapshotPath(dataset, resolvedLabel),
              dataset,
              label: resolvedLabel,
              game_version: gameVersion,
              entry_count: Object.keys(entries).length,
            }),
          },
        ],
      };
    }

    if (name === "scw_snapshot_list") {
      let files: string[] = [];
      try {
        files = await fs.readdir(SNAPSHOT_DIR);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: formatOutput({
                snapshot_dir: SNAPSHOT_DIR,
                snapshots: [],
                note: "No snapshots saved yet. Use scw_snapshot_save to capture one.",
              }),
            },
          ],
        };
      }

      const snapshots = [];
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        try {
          const raw = JSON.parse(await fs.readFile(path.join(SNAPSHOT_DIR, file), "utf-8"));
          snapshots.push({
            dataset: raw.dataset,
            label: raw.label,
            game_version: raw.game_version,
            captured_at: raw.captured_at,
            entry_count: Object.keys(raw.entries || {}).length,
          });
        } catch {
          continue;
        }
      }

      return {
        content: [{ type: "text", text: formatOutput({ snapshot_dir: SNAPSHOT_DIR, snapshots }) }],
      };
    }

    if (name === "scw_snapshot_diff") {
      const { from_label, to_label, dataset } = z
        .object({
          from_label: z.string(),
          to_label: z.string().optional(),
          dataset: z.enum(["vehicles", "items"]),
        })
        .parse(args);

      const fromSnap = await loadSnapshot(dataset, from_label);

      let toEntries: Record<string, Record<string, unknown>>;
      let toDescription: string;

      if (to_label) {
        const toSnap = await loadSnapshot(dataset, to_label);
        toEntries = toSnap.entries;
        toDescription = `${toSnap.label} (${toSnap.game_version})`;
      } else {
        const all = await fetchAllPages(`/${dataset}`);
        toEntries = {};
        for (const entry of all) {
          const key = (entry.name as string) || (entry.uuid as string);
          if (key) toEntries[key] = snapshotFields(entry);
        }
        const liveVersion =
          all.length > 0 ? (all[0].version as string) || (all[0].game_version as string) : "unknown";
        toDescription = `current live data (${liveVersion})`;
      }

      const { added, removed, changed } = diffEntries(fromSnap.entries, toEntries);

      return {
        content: [
          {
            type: "text",
            text: formatOutput({
              dataset,
              from: `${fromSnap.label} (${fromSnap.game_version})`,
              to: toDescription,
              summary: {
                added: added.length,
                removed: removed.length,
                changed: Object.keys(changed).length,
              },
              added,
              removed,
              changed,
            }),
          },
        ],
      };
    }

    if (name === "uex_get_ship_prices") {
      const { vehicle_name, star_system_name, include_rentals } = z
        .object({
          vehicle_name: z.string(),
          star_system_name: z.string().optional(),
          include_rentals: z.boolean().optional(),
        })
        .parse(args);

      // The price endpoints only filter by id_vehicle; vehicle_name is ignored server-side.
      const vehiclesResponse = await fetchWithCache(uexClient, "/vehicles");
      const vehicles: Record<string, unknown>[] = vehiclesResponse.data.data ?? [];
      const needle = vehicle_name.toLowerCase();

      const matches = vehicles.filter((v) => {
        const full = typeof v.name_full === "string" ? v.name_full.toLowerCase() : "";
        const short = typeof v.name === "string" ? v.name.toLowerCase() : "";
        return full === needle || short === needle || full.includes(needle) || short.includes(needle);
      });

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: formatOutput({
                query: vehicle_name,
                error: "No vehicle matched that name in the UEX vehicle list.",
              }),
            },
          ],
        };
      }

      const exact = matches.find(
        (v) =>
          (typeof v.name_full === "string" && v.name_full.toLowerCase() === needle) ||
          (typeof v.name === "string" && v.name.toLowerCase() === needle),
      );
      const vehicle = exact ?? matches[0];

      const filterSystem = (rows: unknown) => {
        if (!Array.isArray(rows)) return [];
        if (!star_system_name) return rows;
        return rows.filter(
          (d: Record<string, unknown>) =>
            typeof d.star_system_name === "string" &&
            d.star_system_name.toLowerCase() === star_system_name.toLowerCase(),
        );
      };

      const purchaseResponse = await fetchWithCache(uexClient, "/vehicles_purchases_prices", {
        params: { id_vehicle: vehicle.id },
      });
      const purchases = filterSystem(purchaseResponse.data.data);

      let rentals: unknown[] = [];
      if (include_rentals !== false) {
        const rentalResponse = await fetchWithCache(uexClient, "/vehicles_rentals_prices", {
          params: { id_vehicle: vehicle.id },
        });
        rentals = filterSystem(rentalResponse.data.data);
      }

      return {
        content: [
          {
            type: "text",
            text: formatOutput({
              vehicle: vehicle.name_full ?? vehicle.name,
              id_vehicle: vehicle.id,
              system_filter: star_system_name ?? "all systems",
              other_matches:
                matches.length > 1
                  ? matches.filter((m) => m.id !== vehicle.id).map((m) => m.name_full ?? m.name)
                  : undefined,
              purchase_locations: purchases,
              rental_locations: rentals,
            }),
          },
        ],
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

        const inventoryFilter = inventory_type ?? "all";
        // UEX exposes shop capability flags per terminal, not per-item stock.
        const CAPABILITIES: { kind: string; flag: string }[] = [
          { kind: "ships", flag: "is_shop_vehicle" },
          { kind: "components", flag: "is_shop_vehicle" },
          { kind: "weapons", flag: "is_shop_fps" },
          { kind: "armor", flag: "is_shop_fps" },
        ];

        const terminalInventory = terminals.map((t: Record<string, unknown>) => {
          const sells: string[] = [];
          for (const { kind, flag } of CAPABILITIES) {
            if (inventoryFilter !== "all" && inventoryFilter !== kind) continue;
            if (t[flag] === 1) sells.push(kind);
          }

          return {
            terminal_id: t.id,
            terminal_name: t.nickname || t.name,
            full_name: t.fullname,
            location: [t.planet_name, t.space_station_name || t.orbit_name]
              .filter(Boolean)
              .join(" / "),
            system: t.star_system_name,
            sells: sells.length > 0 ? sells : "nothing matching that filter",
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
                note: "These are shop capability flags, not live stock. For where a specific ship is sold, use uex_get_ship_prices.",
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
