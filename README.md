# SCMCP — Star Citizen MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that lets AI assistants answer questions about Star Citizen resources using live game-economy data from two community APIs:

| Source | What it provides |
|--------|-----------------|
| [UEX Corp API](https://uexcorp.space/api/documentation/) | Commodity prices, trade routes, ship/vehicle buy locations, terminals, planets, star systems |
| [Cornerstone Finder](https://finder.cstone.space/) | Item/component search with shop and location data |

---

## Requirements

- Python 3.11+
- An MCP-compatible client (e.g. [Claude Desktop](https://claude.ai/download), [Cursor](https://www.cursor.com/), any client that supports MCP)

---

## Installation

```bash
# Clone the repository
git clone https://github.com/NyleGarcia/SCMCP.git
cd SCMCP

# Install the package and its dependencies
pip install .
```

---

## Usage

### Running the server

The server communicates over **stdio** (the standard MCP transport):

```bash
scmcp
```

Or equivalently:

```bash
python -m scmcp.server
```

### Connecting to Claude Desktop

Add the following to your `claude_desktop_config.json`
(typically at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "star-citizen": {
      "command": "scmcp"
    }
  }
}
```

Restart Claude Desktop and you should see the Star Citizen tools available.

---

## Available Tools

### UEX Corp Tools

| Tool | Description |
|------|-------------|
| `uex_search_commodities` | Search for tradeable commodities by name |
| `uex_get_commodity_prices` | Get buy/sell prices at all terminals for a commodity |
| `uex_get_best_trade_routes` | Find the most profitable commodity trade routes |
| `uex_get_terminals` | List trading terminals, filterable by name/system/planet |
| `uex_get_star_systems` | List all star systems with trading data |
| `uex_get_planets` | List planets, optionally filtered by star system |
| `uex_get_moons` | List moons, optionally filtered by planet |
| `uex_get_space_stations` | List space stations |
| `uex_get_cities` | List cities/landing zones |
| `uex_search_ships` | Search for ships by name |
| `uex_get_ship_purchase_locations` | Find where a ship can be bought in-game |
| `uex_search_vehicles` | Search for ground vehicles |
| `uex_get_vehicle_purchase_locations` | Find where a vehicle can be bought |
| `uex_get_fuel_prices` | Get hydrogen/quantum fuel prices at terminals |

### Cornerstone Finder Tools

| Tool | Description |
|------|-------------|
| `cstone_search_items` | Search for any item/equipment/resource by name and optional category |
| `cstone_find_item_locations` | Find all shop locations for an item by name |
| `cstone_get_item_locations_by_id` | Get locations for a specific item using its ID |
| `cstone_get_item_categories` | List all available item categories |
| `cstone_get_shops` | List shops/kiosks, optionally filtered by location |

---

## Example Questions

Once connected to an MCP client you can ask questions like:

- *"What is the best trade route from Port Tressler right now?"*
- *"Where can I buy an Aegis Avenger Titan?"*
- *"What are the current prices for Laranite?"*
- *"Where can I find a MedPen in Lorville?"*
- *"List all moons around Crusader."*
- *"What fuel prices are available at ArcCorp terminals?"*

---

## Development

```bash
# Install with dev dependencies
pip install -e ".[dev]"

# Run tests
pytest
```

---

## Data Sources

- **UEX Corp** — community-maintained Star Citizen economy database  
  API documentation: <https://uexcorp.space/api/documentation/>

- **Cornerstone Finder** — community tool for locating in-game items  
  Website: <https://finder.cstone.space/>

Data accuracy depends on community contributions to these third-party services.
