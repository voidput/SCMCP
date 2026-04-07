# Star Citizen MCP (SCMCP)

A Model Context Protocol (MCP) server providing real-time access to Star Citizen market data, trade routes, and wiki information.

## Features
- **Commodity Prices & Averages:** Fetch current and historical pricing for commodities via UEX.
- **Trade Routes:** Find profitable trade routes based on your cargo capacity and available investment.
- **Terminal & Location Data:** List trading terminals, outposts, and cities across systems like Stanton and Pyro.
- **Wiki Search:** Query the Star Citizen Wiki for ships, items, components, and lore.
- **Built-in Caching:** API responses are automatically cached in-memory for 5 minutes to significantly reduce latency and redundant network requests.

## Available Tools
- `uex_get_commodities`: List all commodities.
- `uex_get_commodity_prices`: Get current commodity prices (filterable by system, planet, and terminal).
- `uex_get_commodity_averages`: Get historical average prices over time.
- `uex_get_terminals`: List trading terminals (filterable by system and planet).
- `uex_get_trade_routes`: Find optimized, high-profit trade routes.
- `uex_get_commodity_ranking`: Rank commodities by their profitability metrics.
- `scw_search`: Search the Star Citizen Wiki.
- `scw_get_vehicle`: Retrieve detailed ship and ground vehicle data.
- `scw_get_item`: Retrieve weapon, armor, and ship component data.

## Installation & Local Development

Create a `.env` file in the root directory:
```env
UEXTOKEN=your_uex_api_token
```

Install dependencies:
```bash
npm install
```

Run linting and formatting:
```bash
npm run lint
npm run format
```

Run tests:
```bash
npm run test
```

Start the MCP server:
```bash
npm run build
npm start
```

## Docker

A Docker image is automatically built, tested, and published to Docker Hub upon release.

```bash
docker pull voidput/scmcp
docker run -e UEXTOKEN=your_token voidput/scmcp
```

## Release & Versioning

This project uses `semantic-release` to automate versioning and changelog generation based on commit messages. Follow conventional commit standards (e.g., `feat:`, `fix:`) to trigger automated releases!
