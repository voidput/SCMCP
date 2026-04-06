"""
UEX Corp API client for Star Citizen data.

API documentation: https://uexcorp.space/api/documentation/
Base URL: https://uexcorp.space/api/2.0
"""

import httpx
from typing import Any

UEX_BASE_URL = "https://uexcorp.space/api/2.0"


async def _get(path: str, params: dict[str, Any] | None = None) -> Any:
    """Make a GET request to the UEX API."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(f"{UEX_BASE_URL}{path}", params=params)
        response.raise_for_status()
        return response.json()


async def get_commodities(name: str | None = None) -> list[dict]:
    """Fetch all commodities, optionally filtered by name."""
    data = await _get("/commodities")
    items: list[dict] = data.get("data", data) if isinstance(data, dict) else data
    if name:
        name_lower = name.lower()
        items = [c for c in items if name_lower in c.get("name", "").lower()]
    return items


async def get_commodity_prices(
    id_commodity: int | None = None,
    id_terminal: int | None = None,
) -> list[dict]:
    """Fetch commodity prices, optionally filtered by commodity or terminal ID."""
    params: dict[str, Any] = {}
    if id_commodity is not None:
        params["id_commodity"] = id_commodity
    if id_terminal is not None:
        params["id_terminal"] = id_terminal
    data = await _get("/commodities_prices", params=params)
    return data.get("data", data) if isinstance(data, dict) else data


async def get_commodities_routes(
    id_start_terminal: int | None = None,
    id_end_terminal: int | None = None,
    max_scu: int | None = None,
    credits: int | None = None,
) -> list[dict]:
    """Fetch best trading routes between terminals."""
    params: dict[str, Any] = {}
    if id_start_terminal is not None:
        params["id_start_terminal"] = id_start_terminal
    if id_end_terminal is not None:
        params["id_end_terminal"] = id_end_terminal
    if max_scu is not None:
        params["max_scu"] = max_scu
    if credits is not None:
        params["credits"] = credits
    data = await _get("/commodities_routes", params=params)
    return data.get("data", data) if isinstance(data, dict) else data


async def get_star_systems() -> list[dict]:
    """Fetch all star systems."""
    data = await _get("/star_systems")
    return data.get("data", data) if isinstance(data, dict) else data


async def get_planets(id_star_system: int | None = None) -> list[dict]:
    """Fetch planets, optionally filtered by star system."""
    params: dict[str, Any] = {}
    if id_star_system is not None:
        params["id_star_system"] = id_star_system
    data = await _get("/planets", params=params)
    return data.get("data", data) if isinstance(data, dict) else data


async def get_moons(id_planet: int | None = None) -> list[dict]:
    """Fetch moons, optionally filtered by planet."""
    params: dict[str, Any] = {}
    if id_planet is not None:
        params["id_planet"] = id_planet
    data = await _get("/moons", params=params)
    return data.get("data", data) if isinstance(data, dict) else data


async def get_space_stations(id_star_system: int | None = None) -> list[dict]:
    """Fetch space stations, optionally filtered by star system."""
    params: dict[str, Any] = {}
    if id_star_system is not None:
        params["id_star_system"] = id_star_system
    data = await _get("/space_stations", params=params)
    return data.get("data", data) if isinstance(data, dict) else data


async def get_cities(id_planet: int | None = None) -> list[dict]:
    """Fetch cities/landing zones, optionally filtered by planet."""
    params: dict[str, Any] = {}
    if id_planet is not None:
        params["id_planet"] = id_planet
    data = await _get("/cities", params=params)
    return data.get("data", data) if isinstance(data, dict) else data


async def get_terminals(
    id_star_system: int | None = None,
    id_planet: int | None = None,
    name: str | None = None,
) -> list[dict]:
    """Fetch trading terminals, optionally filtered by star system, planet, or name."""
    params: dict[str, Any] = {}
    if id_star_system is not None:
        params["id_star_system"] = id_star_system
    if id_planet is not None:
        params["id_planet"] = id_planet
    data = await _get("/terminals", params=params)
    items: list[dict] = data.get("data", data) if isinstance(data, dict) else data
    if name:
        name_lower = name.lower()
        items = [t for t in items if name_lower in t.get("name", "").lower()]
    return items


async def get_ships(name: str | None = None) -> list[dict]:
    """Fetch all ships, optionally filtered by name."""
    data = await _get("/ships")
    items: list[dict] = data.get("data", data) if isinstance(data, dict) else data
    if name:
        name_lower = name.lower()
        items = [s for s in items if name_lower in s.get("name", "").lower()]
    return items


async def get_ship_purchases(id_ship: int | None = None) -> list[dict]:
    """Fetch where ships can be purchased, optionally filtered by ship ID."""
    params: dict[str, Any] = {}
    if id_ship is not None:
        params["id_ship"] = id_ship
    data = await _get("/ship_purchases", params=params)
    return data.get("data", data) if isinstance(data, dict) else data


async def get_vehicles(name: str | None = None) -> list[dict]:
    """Fetch all vehicles, optionally filtered by name."""
    data = await _get("/vehicles")
    items: list[dict] = data.get("data", data) if isinstance(data, dict) else data
    if name:
        name_lower = name.lower()
        items = [v for v in items if name_lower in v.get("name", "").lower()]
    return items


async def get_vehicle_purchases(id_vehicle: int | None = None) -> list[dict]:
    """Fetch where vehicles can be purchased, optionally filtered by vehicle ID."""
    params: dict[str, Any] = {}
    if id_vehicle is not None:
        params["id_vehicle"] = id_vehicle
    data = await _get("/vehicle_purchases", params=params)
    return data.get("data", data) if isinstance(data, dict) else data


async def get_fuel_prices(id_terminal: int | None = None) -> list[dict]:
    """Fetch fuel prices, optionally filtered by terminal ID."""
    params: dict[str, Any] = {}
    if id_terminal is not None:
        params["id_terminal"] = id_terminal
    data = await _get("/fuel_prices", params=params)
    return data.get("data", data) if isinstance(data, dict) else data
