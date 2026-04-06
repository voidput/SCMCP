"""
Cornerstone Finder API client for Star Citizen resource discovery.

Website: https://finder.cstone.space/
API base URL: https://finder.cstone.space/
"""

import httpx
from typing import Any

CSTONE_BASE_URL = "https://finder.cstone.space"


async def _get(path: str, params: dict[str, Any] | None = None) -> Any:
    """Make a GET request to the Cornerstone Finder API."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(f"{CSTONE_BASE_URL}{path}", params=params)
        response.raise_for_status()
        return response.json()


async def search_items(query: str, category: str | None = None) -> list[dict]:
    """
    Search for items/commodities/resources in the Cornerstone Finder database.

    Args:
        query: Name or partial name of the item to search for.
        category: Optional category filter (e.g. 'commodity', 'weapon', 'armor',
                  'ship_component', 'food', 'medical').
    """
    params: dict[str, Any] = {"search": query}
    if category:
        params["category"] = category
    data = await _get("/api/items", params=params)
    return data if isinstance(data, list) else data.get("data", [])


async def get_item_locations(item_id: str) -> list[dict]:
    """
    Get all known locations where a specific item can be found or purchased.

    Args:
        item_id: The item identifier returned from search_items.
    """
    data = await _get(f"/api/items/{item_id}/locations")
    return data if isinstance(data, list) else data.get("data", [])


async def get_categories() -> list[dict]:
    """Fetch all item categories available in Cornerstone Finder."""
    data = await _get("/api/categories")
    return data if isinstance(data, list) else data.get("data", [])


async def get_shops(location: str | None = None) -> list[dict]:
    """
    Get shops/kiosks where items are sold.

    Args:
        location: Optional location name to filter shops by.
    """
    params: dict[str, Any] = {}
    if location:
        params["location"] = location
    data = await _get("/api/shops", params=params)
    return data if isinstance(data, list) else data.get("data", [])


async def find_item_by_name(name: str) -> list[dict]:
    """
    High-level helper: search for an item and return matches with location data.

    Args:
        name: Full or partial name of the item to find.
    """
    items = await search_items(name)
    results = []
    for item in items[:5]:  # Limit to top 5 matches
        item_id = item.get("id") or item.get("uuid")
        if item_id:
            try:
                locations = await get_item_locations(str(item_id))
                item["locations"] = locations
            except httpx.HTTPStatusError:
                item["locations"] = []
        results.append(item)
    return results
