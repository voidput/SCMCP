"""
Tests for the Star Citizen MCP server.

These tests mock the external API calls so they run offline.
"""

import json
import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_COMMODITIES = [
    {"id": 1, "name": "Gold", "code": "GOLD", "kind": "metal"},
    {"id": 2, "name": "Laranite", "code": "LARA", "kind": "metal"},
    {"id": 3, "name": "Agricium", "code": "AGRI", "kind": "metal"},
]

SAMPLE_PRICES = [
    {"id_commodity": 1, "id_terminal": 10, "price_buy": 100.0, "price_sell": 95.0},
    {"id_commodity": 1, "id_terminal": 11, "price_buy": 102.0, "price_sell": 97.0},
]

SAMPLE_ROUTES = [
    {
        "id_terminal_origin": 10,
        "id_terminal_destination": 20,
        "commodity": "Gold",
        "profit_per_scu": 50.0,
    }
]

SAMPLE_SHIPS = [
    {"id": 1, "name": "Aegis Avenger Titan", "manufacturer": "Aegis"},
    {"id": 2, "name": "Origin 300i", "manufacturer": "Origin"},
]

SAMPLE_PURCHASES = [
    {"id_ship": 1, "id_terminal": 10, "terminal_name": "New Deal", "price": 950000},
]

SAMPLE_STAR_SYSTEMS = [
    {"id": 1, "name": "Stanton", "code": "STAN"},
]

SAMPLE_PLANETS = [
    {"id": 1, "name": "Hurston", "id_star_system": 1},
    {"id": 2, "name": "Crusader", "id_star_system": 1},
]

SAMPLE_TERMINALS = [
    {"id": 10, "name": "New Deal", "id_star_system": 1},
    {"id": 11, "name": "Lorville Trade Terminal", "id_star_system": 1},
]

SAMPLE_CSTONE_ITEMS = [
    {"id": "abc123", "name": "Distilled Spirits", "category": "food"},
    {"id": "def456", "name": "MedPen", "category": "medical"},
]

SAMPLE_CSTONE_LOCATIONS = [
    {"shop": "Tammany and Sons", "location": "Lorville", "price": 12.5},
]


# ---------------------------------------------------------------------------
# UEX client tests
# ---------------------------------------------------------------------------


class TestUexClient:
    """Tests for the UEX Corp API client."""

    @pytest.mark.asyncio
    async def test_get_commodities_all(self):
        """get_commodities with no filter returns all commodities."""
        from scmcp import uex_client

        mock_response = MagicMock()
        mock_response.json.return_value = {"data": SAMPLE_COMMODITIES}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await uex_client.get_commodities()

        assert len(result) == 3
        assert result[0]["name"] == "Gold"

    @pytest.mark.asyncio
    async def test_get_commodities_filtered_by_name(self):
        """get_commodities with a name filter returns matching items."""
        from scmcp import uex_client

        mock_response = MagicMock()
        mock_response.json.return_value = {"data": SAMPLE_COMMODITIES}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await uex_client.get_commodities("gold")

        assert len(result) == 1
        assert result[0]["name"] == "Gold"

    @pytest.mark.asyncio
    async def test_get_commodities_no_match(self):
        """get_commodities with non-matching name returns empty list."""
        from scmcp import uex_client

        mock_response = MagicMock()
        mock_response.json.return_value = {"data": SAMPLE_COMMODITIES}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await uex_client.get_commodities("titanium")

        assert result == []

    @pytest.mark.asyncio
    async def test_get_commodity_prices_by_id(self):
        """get_commodity_prices passes id_commodity as a query param."""
        from scmcp import uex_client

        mock_response = MagicMock()
        mock_response.json.return_value = {"data": SAMPLE_PRICES}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await uex_client.get_commodity_prices(id_commodity=1)

        assert len(result) == 2
        mock_client.get.assert_called_once()
        call_kwargs = mock_client.get.call_args
        assert call_kwargs[1]["params"].get("id_commodity") == 1

    @pytest.mark.asyncio
    async def test_get_ships_filtered(self):
        """get_ships with a name filter returns only matching ships."""
        from scmcp import uex_client

        mock_response = MagicMock()
        mock_response.json.return_value = {"data": SAMPLE_SHIPS}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await uex_client.get_ships("avenger")

        assert len(result) == 1
        assert "Avenger" in result[0]["name"]

    @pytest.mark.asyncio
    async def test_get_star_systems(self):
        """get_star_systems returns the list of star systems."""
        from scmcp import uex_client

        mock_response = MagicMock()
        mock_response.json.return_value = {"data": SAMPLE_STAR_SYSTEMS}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await uex_client.get_star_systems()

        assert len(result) == 1
        assert result[0]["name"] == "Stanton"

    @pytest.mark.asyncio
    async def test_get_terminals_name_filter(self):
        """get_terminals filters by name when provided."""
        from scmcp import uex_client

        mock_response = MagicMock()
        mock_response.json.return_value = {"data": SAMPLE_TERMINALS}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await uex_client.get_terminals(name="lorville")

        assert len(result) == 1
        assert "Lorville" in result[0]["name"]


# ---------------------------------------------------------------------------
# MCP server tool tests
# ---------------------------------------------------------------------------


class TestMcpServerTools:
    """Tests for the MCP server tool handlers."""

    @pytest.mark.asyncio
    async def test_uex_search_commodities_found(self):
        """uex_search_commodities returns JSON when commodities are found."""
        from scmcp import server

        with patch.object(
            server.uex_client, "get_commodities", new=AsyncMock(return_value=[SAMPLE_COMMODITIES[0]])
        ):
            result = await server.uex_search_commodities(name="gold")

        data = json.loads(result)
        assert isinstance(data, list)
        assert data[0]["name"] == "Gold"

    @pytest.mark.asyncio
    async def test_uex_search_commodities_not_found(self):
        """uex_search_commodities returns a helpful message when nothing is found."""
        from scmcp import server

        with patch.object(
            server.uex_client, "get_commodities", new=AsyncMock(return_value=[])
        ):
            result = await server.uex_search_commodities(name="unobtanium")

        assert "No commodities found" in result

    @pytest.mark.asyncio
    async def test_uex_search_commodities_http_error(self):
        """uex_search_commodities returns error message on HTTP failure."""
        from scmcp import server

        with patch.object(
            server.uex_client,
            "get_commodities",
            new=AsyncMock(side_effect=httpx.RequestError("Connection failed")),
        ):
            result = await server.uex_search_commodities(name="gold")

        assert "Error" in result

    @pytest.mark.asyncio
    async def test_uex_get_commodity_prices_by_name_resolves_id(self):
        """uex_get_commodity_prices resolves commodity name to ID before fetching prices."""
        from scmcp import server

        with patch.object(
            server.uex_client,
            "get_commodities",
            new=AsyncMock(return_value=[SAMPLE_COMMODITIES[0]]),
        ), patch.object(
            server.uex_client,
            "get_commodity_prices",
            new=AsyncMock(return_value=SAMPLE_PRICES),
        ) as mock_prices:
            result = await server.uex_get_commodity_prices(commodity_name="gold")

        data = json.loads(result)
        assert isinstance(data, list)
        mock_prices.assert_called_once_with(1, None)

    @pytest.mark.asyncio
    async def test_uex_get_commodity_prices_no_match(self):
        """uex_get_commodity_prices returns helpful message when commodity not found."""
        from scmcp import server

        with patch.object(
            server.uex_client,
            "get_commodities",
            new=AsyncMock(return_value=[]),
        ):
            result = await server.uex_get_commodity_prices(commodity_name="unobtanium")

        assert "No commodity found" in result

    @pytest.mark.asyncio
    async def test_uex_get_best_trade_routes(self):
        """uex_get_best_trade_routes returns JSON with route data."""
        from scmcp import server

        with patch.object(
            server.uex_client,
            "get_commodities_routes",
            new=AsyncMock(return_value=SAMPLE_ROUTES),
        ):
            result = await server.uex_get_best_trade_routes()

        data = json.loads(result)
        assert isinstance(data, list)
        assert data[0]["commodity"] == "Gold"

    @pytest.mark.asyncio
    async def test_uex_get_best_trade_routes_none(self):
        """uex_get_best_trade_routes returns message when no routes found."""
        from scmcp import server

        with patch.object(
            server.uex_client,
            "get_commodities_routes",
            new=AsyncMock(return_value=[]),
        ):
            result = await server.uex_get_best_trade_routes()

        assert "No trade routes" in result

    @pytest.mark.asyncio
    async def test_uex_search_ships_found(self):
        """uex_search_ships returns JSON list of matching ships."""
        from scmcp import server

        with patch.object(
            server.uex_client,
            "get_ships",
            new=AsyncMock(return_value=[SAMPLE_SHIPS[0]]),
        ):
            result = await server.uex_search_ships(name="avenger")

        data = json.loads(result)
        assert data[0]["name"] == "Aegis Avenger Titan"

    @pytest.mark.asyncio
    async def test_uex_get_ship_purchase_locations_by_name(self):
        """uex_get_ship_purchase_locations resolves ship name to ID."""
        from scmcp import server

        with patch.object(
            server.uex_client,
            "get_ships",
            new=AsyncMock(return_value=[SAMPLE_SHIPS[0]]),
        ), patch.object(
            server.uex_client,
            "get_ship_purchases",
            new=AsyncMock(return_value=SAMPLE_PURCHASES),
        ) as mock_purchases:
            result = await server.uex_get_ship_purchase_locations(ship_name="avenger")

        data = json.loads(result)
        assert data[0]["terminal_name"] == "New Deal"
        mock_purchases.assert_called_once_with(1)

    @pytest.mark.asyncio
    async def test_uex_get_star_systems(self):
        """uex_get_star_systems returns JSON list of star systems."""
        from scmcp import server

        with patch.object(
            server.uex_client,
            "get_star_systems",
            new=AsyncMock(return_value=SAMPLE_STAR_SYSTEMS),
        ):
            result = await server.uex_get_star_systems()

        data = json.loads(result)
        assert data[0]["name"] == "Stanton"

    @pytest.mark.asyncio
    async def test_uex_get_terminals(self):
        """uex_get_terminals returns JSON list of terminals."""
        from scmcp import server

        with patch.object(
            server.uex_client,
            "get_terminals",
            new=AsyncMock(return_value=SAMPLE_TERMINALS),
        ):
            result = await server.uex_get_terminals(name="lorville")

        data = json.loads(result)
        assert len(data) == 2

    @pytest.mark.asyncio
    async def test_cstone_search_items_found(self):
        """cstone_search_items returns JSON list when items are found."""
        from scmcp import server

        with patch.object(
            server.cstone_client,
            "search_items",
            new=AsyncMock(return_value=SAMPLE_CSTONE_ITEMS),
        ):
            result = await server.cstone_search_items(query="spirits")

        data = json.loads(result)
        assert data[0]["name"] == "Distilled Spirits"

    @pytest.mark.asyncio
    async def test_cstone_search_items_not_found(self):
        """cstone_search_items returns message when nothing is found."""
        from scmcp import server

        with patch.object(
            server.cstone_client,
            "search_items",
            new=AsyncMock(return_value=[]),
        ):
            result = await server.cstone_search_items(query="unobtanium")

        assert "No items found" in result

    @pytest.mark.asyncio
    async def test_cstone_find_item_locations(self):
        """cstone_find_item_locations returns JSON with item and location data."""
        from scmcp import server

        item_with_locations = {**SAMPLE_CSTONE_ITEMS[0], "locations": SAMPLE_CSTONE_LOCATIONS}

        with patch.object(
            server.cstone_client,
            "find_item_by_name",
            new=AsyncMock(return_value=[item_with_locations]),
        ):
            result = await server.cstone_find_item_locations(item_name="spirits")

        data = json.loads(result)
        assert data[0]["locations"][0]["shop"] == "Tammany and Sons"

    @pytest.mark.asyncio
    async def test_cstone_get_item_locations_by_id(self):
        """cstone_get_item_locations_by_id returns JSON location list."""
        from scmcp import server

        with patch.object(
            server.cstone_client,
            "get_item_locations",
            new=AsyncMock(return_value=SAMPLE_CSTONE_LOCATIONS),
        ):
            result = await server.cstone_get_item_locations_by_id(item_id="abc123")

        data = json.loads(result)
        assert data[0]["location"] == "Lorville"

    @pytest.mark.asyncio
    async def test_cstone_get_item_categories(self):
        """cstone_get_item_categories returns JSON list of categories."""
        from scmcp import server

        categories = [{"name": "food"}, {"name": "medical"}, {"name": "weapon"}]
        with patch.object(
            server.cstone_client,
            "get_categories",
            new=AsyncMock(return_value=categories),
        ):
            result = await server.cstone_get_item_categories()

        data = json.loads(result)
        assert len(data) == 3

    @pytest.mark.asyncio
    async def test_cstone_get_shops(self):
        """cstone_get_shops returns JSON list of shops."""
        from scmcp import server

        shops = [{"name": "Tammany and Sons", "location": "Lorville"}]
        with patch.object(
            server.cstone_client,
            "get_shops",
            new=AsyncMock(return_value=shops),
        ):
            result = await server.cstone_get_shops(location="lorville")

        data = json.loads(result)
        assert data[0]["name"] == "Tammany and Sons"
