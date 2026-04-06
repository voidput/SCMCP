# Star Citizen MCP Server

An MCP server for Star Citizen, providing tools to query data from UEX Corp and the Star Citizen Wiki.

## Features

- **UEX Corp API Integration**:
  - Get list of commodities and terminals.
  - Get real-time commodity prices and averages.
  - Suggest trade routes based on investment and cargo capacity.
  - Get commodity rankings (e.g., profit).
- **Star Citizen Wiki API Integration**:
  - Search for items, ships, or lore.
  - Get detailed information about vehicles (ships/ground vehicles).
  - Get detailed information about items (weapons, armor, components).

## Installation

1. Clone this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file and add your UEX Corp API token:
   ```env
   UEXTOKEN=your_uex_token_here
   ```
4. Build the project:
   ```bash
   npm run build
   ```

## Configuration for Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "star-citizen": {
      "command": "node",
      "args": ["/path/to/SCMCP/dist/index.js"],
      "env": {
        "UEXTOKEN": "your_uex_token_here"
      }
    }
  }
}
```

## Tools

### UEX Tools
- `uex_get_commodities`: List all commodities.
- `uex_get_commodity_prices`: Get current prices for a commodity.
- `uex_get_commodity_averages`: Get average prices over time.
- `uex_get_terminals`: List all locations.
- `uex_get_trade_routes`: Get suggested trade routes.
- `uex_get_commodity_ranking`: Get commodity rankings.

### Star Citizen Wiki Tools
- `scw_search`: Search the wiki.
- `scw_get_vehicle`: Get ship/vehicle details.
- `scw_get_item`: Get item details (weapons, components, etc.).
