# SCMCP Project Instructions

## Model Routing for MCP Tool Calls

All `scmcp` tools (`uex_*`, `scw_*`, `sct_*`) are read-only lookups against
external Star Citizen data APIs — no reasoning or synthesis happens server-side.
Per the global model-selection policy (small items = sonnet/haiku), route calls
to these tools through a `sonnet` or `haiku` subagent rather than the primary
session model:

- Simple single-field lookups (`scw_get_item`, `sct_get_article`, `uex_get_commodities`) → `haiku`
- Multi-step lookups requiring filtering/cross-referencing (`uex_get_terminal_inventory`,
  `scw_search_ships_by_vendor`, `scw_get_ship_comparison`, `uex_get_ship_prices`) → `sonnet`
- Only escalate to the primary model when the result needs interpretation beyond
  presenting the data (e.g. recommending a trade route, not just fetching prices).

MCP has no protocol field to force a caller's model choice — this is enforced by
the orchestrating agent honoring this file, not by the server.

## Known Gaps

- Ship vendor availability (which terminal stocks which ship right now) is not
  exposed by UEX or the Star Citizen Wiki API as a clean queryable field. Tools
  like `scw_get_ship_vendors` return best-effort data plus known common vendor
  locations as a fallback.
- `spviewer.eu` and `erkul.games` have no public/documented API and return
  HTTP 403 to automated fetches — not integrated. Revisit if either publishes
  an API or a maintainer confirms endpoint contracts.
