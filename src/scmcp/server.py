"""
Star Citizen MCP Server

Provides tools for querying Star Citizen data from:
- UEX Corp API (https://uexcorp.space/api/documentation/)
- Cornerstone Finder (https://finder.cstone.space/)
"""

import json
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

from scmcp import uex_client, cstone_client

mcp = FastMCP(
    name="Star Citizen MCP",
    instructions=(
        "This server provides tools for querying Star Citizen game data. "
        "Use the UEX tools for commodity trading, ship/vehicle info, and "
        "in-game economy data. Use the Cornerstone Finder tools for locating "
        "specific items, components, and resources across the game universe."
    ),
)


def _fmt(data: Any) -> str:
    """Format data as a pretty-printed JSON string."""
    return json.dumps(data, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# UEX Corp API tools
# ---------------------------------------------------------------------------


@mcp.tool()
async def uex_search_commodities(name: str = "") -> str:
    """
    Search for tradeable commodities in Star Citizen.

    Args:
        name: Partial or full commodity name to search for (e.g. 'gold', 'laranite').
              Leave empty to list all commodities.
    """
    try:
        results = await uex_client.get_commodities(name or None)
        if not results:
            return f"No commodities found matching '{name}'."
        return _fmt(results)
    except httpx.HTTPError as e:
        return f"Error fetching commodities: {e}"


@mcp.tool()
async def uex_get_commodity_prices(
    commodity_name: str = "",
    commodity_id: int = 0,
    terminal_id: int = 0,
) -> str:
    """
    Get buy/sell prices for a commodity at trading terminals.

    Args:
        commodity_name: Name of the commodity to look up prices for (used to find
                        the commodity ID if commodity_id is not provided).
        commodity_id: Numeric UEX commodity ID. Takes priority over commodity_name.
        terminal_id: Optional terminal ID to filter prices to a single location.
    """
    try:
        id_commodity = commodity_id or None
        id_terminal = terminal_id or None

        # If only a name is provided, resolve it to an ID first
        if not id_commodity and commodity_name:
            commodities = await uex_client.get_commodities(commodity_name)
            if not commodities:
                return f"No commodity found matching '{commodity_name}'."
            id_commodity = commodities[0].get("id") or commodities[0].get("id_commodity")

        prices = await uex_client.get_commodity_prices(id_commodity, id_terminal)
        if not prices:
            return "No price data found."
        return _fmt(prices)
    except httpx.HTTPError as e:
        return f"Error fetching commodity prices: {e}"


@mcp.tool()
async def uex_get_best_trade_routes(
    start_terminal_id: int = 0,
    end_terminal_id: int = 0,
    max_scu: int = 0,
    credits: int = 0,
) -> str:
    """
    Find the best commodity trading routes between terminals.

    Args:
        start_terminal_id: UEX terminal ID for the departure terminal (0 = any).
        end_terminal_id: UEX terminal ID for the destination terminal (0 = any).
        max_scu: Maximum cargo capacity in SCU (0 = no limit).
        credits: Available credits to invest in cargo (0 = no limit).
    """
    try:
        routes = await uex_client.get_commodities_routes(
            id_start_terminal=start_terminal_id or None,
            id_end_terminal=end_terminal_id or None,
            max_scu=max_scu or None,
            credits=credits or None,
        )
        if not routes:
            return "No trade routes found with the given parameters."
        return _fmt(routes)
    except httpx.HTTPError as e:
        return f"Error fetching trade routes: {e}"


@mcp.tool()
async def uex_get_terminals(
    name: str = "",
    star_system_id: int = 0,
    planet_id: int = 0,
) -> str:
    """
    List trading terminals in the Star Citizen universe.

    Args:
        name: Partial terminal name to search for (e.g. 'Lorville', 'Area18').
        star_system_id: Filter by UEX star system ID (0 = all systems).
        planet_id: Filter by UEX planet ID (0 = all planets).
    """
    try:
        terminals = await uex_client.get_terminals(
            id_star_system=star_system_id or None,
            id_planet=planet_id or None,
            name=name or None,
        )
        if not terminals:
            return "No terminals found matching the given filters."
        return _fmt(terminals)
    except httpx.HTTPError as e:
        return f"Error fetching terminals: {e}"


@mcp.tool()
async def uex_get_star_systems() -> str:
    """
    List all star systems in Star Citizen that have trading data.
    """
    try:
        systems = await uex_client.get_star_systems()
        if not systems:
            return "No star systems found."
        return _fmt(systems)
    except httpx.HTTPError as e:
        return f"Error fetching star systems: {e}"


@mcp.tool()
async def uex_get_planets(star_system_id: int = 0) -> str:
    """
    List planets in Star Citizen.

    Args:
        star_system_id: Filter by UEX star system ID (0 = all systems).
    """
    try:
        planets = await uex_client.get_planets(id_star_system=star_system_id or None)
        if not planets:
            return "No planets found."
        return _fmt(planets)
    except httpx.HTTPError as e:
        return f"Error fetching planets: {e}"


@mcp.tool()
async def uex_get_moons(planet_id: int = 0) -> str:
    """
    List moons in Star Citizen.

    Args:
        planet_id: Filter by UEX planet ID (0 = all planets).
    """
    try:
        moons = await uex_client.get_moons(id_planet=planet_id or None)
        if not moons:
            return "No moons found."
        return _fmt(moons)
    except httpx.HTTPError as e:
        return f"Error fetching moons: {e}"


@mcp.tool()
async def uex_get_space_stations(star_system_id: int = 0) -> str:
    """
    List space stations in Star Citizen.

    Args:
        star_system_id: Filter by UEX star system ID (0 = all systems).
    """
    try:
        stations = await uex_client.get_space_stations(
            id_star_system=star_system_id or None
        )
        if not stations:
            return "No space stations found."
        return _fmt(stations)
    except httpx.HTTPError as e:
        return f"Error fetching space stations: {e}"


@mcp.tool()
async def uex_get_cities(planet_id: int = 0) -> str:
    """
    List cities and landing zones on planets.

    Args:
        planet_id: Filter by UEX planet ID (0 = all planets).
    """
    try:
        cities = await uex_client.get_cities(id_planet=planet_id or None)
        if not cities:
            return "No cities found."
        return _fmt(cities)
    except httpx.HTTPError as e:
        return f"Error fetching cities: {e}"


@mcp.tool()
async def uex_search_ships(name: str = "") -> str:
    """
    Search for ships in Star Citizen.

    Args:
        name: Partial or full ship name to search for (e.g. 'Hornet', 'Carrack').
              Leave empty to list all ships.
    """
    try:
        ships = await uex_client.get_ships(name or None)
        if not ships:
            return f"No ships found matching '{name}'."
        return _fmt(ships)
    except httpx.HTTPError as e:
        return f"Error fetching ships: {e}"


@mcp.tool()
async def uex_get_ship_purchase_locations(
    ship_name: str = "",
    ship_id: int = 0,
) -> str:
    """
    Find where a ship can be purchased in-game.

    Args:
        ship_name: Name of the ship to find purchase locations for. Used to resolve
                   the ship ID if ship_id is not provided.
        ship_id: Numeric UEX ship ID. Takes priority over ship_name.
    """
    try:
        id_ship = ship_id or None

        if not id_ship and ship_name:
            ships = await uex_client.get_ships(ship_name)
            if not ships:
                return f"No ship found matching '{ship_name}'."
            id_ship = ships[0].get("id") or ships[0].get("id_ship")

        purchases = await uex_client.get_ship_purchases(id_ship)
        if not purchases:
            return "No purchase locations found for this ship."
        return _fmt(purchases)
    except httpx.HTTPError as e:
        return f"Error fetching ship purchase locations: {e}"


@mcp.tool()
async def uex_search_vehicles(name: str = "") -> str:
    """
    Search for ground vehicles in Star Citizen.

    Args:
        name: Partial or full vehicle name (e.g. 'Cyclone', 'Ursa').
              Leave empty to list all vehicles.
    """
    try:
        vehicles = await uex_client.get_vehicles(name or None)
        if not vehicles:
            return f"No vehicles found matching '{name}'."
        return _fmt(vehicles)
    except httpx.HTTPError as e:
        return f"Error fetching vehicles: {e}"


@mcp.tool()
async def uex_get_vehicle_purchase_locations(
    vehicle_name: str = "",
    vehicle_id: int = 0,
) -> str:
    """
    Find where a ground vehicle can be purchased in-game.

    Args:
        vehicle_name: Name of the vehicle. Used to resolve ID if vehicle_id is not set.
        vehicle_id: Numeric UEX vehicle ID. Takes priority over vehicle_name.
    """
    try:
        id_vehicle = vehicle_id or None

        if not id_vehicle and vehicle_name:
            vehicles = await uex_client.get_vehicles(vehicle_name)
            if not vehicles:
                return f"No vehicle found matching '{vehicle_name}'."
            id_vehicle = vehicles[0].get("id") or vehicles[0].get("id_vehicle")

        purchases = await uex_client.get_vehicle_purchases(id_vehicle)
        if not purchases:
            return "No purchase locations found for this vehicle."
        return _fmt(purchases)
    except httpx.HTTPError as e:
        return f"Error fetching vehicle purchase locations: {e}"


@mcp.tool()
async def uex_get_fuel_prices(terminal_id: int = 0) -> str:
    """
    Get fuel prices at refueling terminals.

    Args:
        terminal_id: Filter by terminal ID (0 = all terminals).
    """
    try:
        prices = await uex_client.get_fuel_prices(id_terminal=terminal_id or None)
        if not prices:
            return "No fuel price data found."
        return _fmt(prices)
    except httpx.HTTPError as e:
        return f"Error fetching fuel prices: {e}"


# ---------------------------------------------------------------------------
# Cornerstone Finder tools
# ---------------------------------------------------------------------------


@mcp.tool()
async def cstone_search_items(query: str, category: str = "") -> str:
    """
    Search for items, equipment, and resources using the Cornerstone Finder database.

    Args:
        query: Name or partial name of the item to search for.
        category: Optional category to narrow results (e.g. 'commodity', 'weapon',
                  'armor', 'ship_component', 'food', 'medical').
    """
    try:
        results = await cstone_client.search_items(query, category or None)
        if not results:
            return f"No items found matching '{query}'."
        return _fmt(results)
    except httpx.HTTPError as e:
        return f"Error searching items: {e}"


@mcp.tool()
async def cstone_find_item_locations(item_name: str) -> str:
    """
    Find all in-game locations where a specific item can be found or purchased,
    using the Cornerstone Finder.

    Args:
        item_name: Full or partial name of the item to locate.
    """
    try:
        results = await cstone_client.find_item_by_name(item_name)
        if not results:
            return f"No items found matching '{item_name}'."
        return _fmt(results)
    except httpx.HTTPError as e:
        return f"Error finding item locations: {e}"


@mcp.tool()
async def cstone_get_item_locations_by_id(item_id: str) -> str:
    """
    Get all known locations for a specific item using its Cornerstone item ID.

    Args:
        item_id: The item ID obtained from cstone_search_items.
    """
    try:
        locations = await cstone_client.get_item_locations(item_id)
        if not locations:
            return f"No locations found for item ID '{item_id}'."
        return _fmt(locations)
    except httpx.HTTPError as e:
        return f"Error fetching item locations: {e}"


@mcp.tool()
async def cstone_get_item_categories() -> str:
    """
    List all item categories available in the Cornerstone Finder database.
    Useful for filtering searches with cstone_search_items.
    """
    try:
        categories = await cstone_client.get_categories()
        if not categories:
            return "No categories found."
        return _fmt(categories)
    except httpx.HTTPError as e:
        return f"Error fetching categories: {e}"


@mcp.tool()
async def cstone_get_shops(location: str = "") -> str:
    """
    List shops and kiosks where items are sold in Star Citizen.

    Args:
        location: Optional location name to filter shops by (e.g. 'Lorville', 'Orison').
    """
    try:
        shops = await cstone_client.get_shops(location or None)
        if not shops:
            return "No shops found."
        return _fmt(shops)
    except httpx.HTTPError as e:
        return f"Error fetching shops: {e}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    """Run the MCP server using stdio transport (default for MCP clients)."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
