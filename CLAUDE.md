# SCMCP Project Instructions

## Data Sources

- **Star Citizen Wiki API** — https://api.star-citizen.wiki/api/v2
  Docs: https://docs.star-citizen.wiki/ · Source: https://github.com/StarCitizenWiki/API
  Ships, items, components, stats. No auth required.
- **UEX Corp API** — https://api.uexcorp.space/2.0
  Docs: https://uexcorp.space/api/documentation/
  Prices, terminals, trade routes, purchase/rental locations. Needs `UEXTOKEN` bearer.

## Model Routing for MCP Tool Calls

All `scmcp` tools (`uex_*`, `scw_*`, `sct_*`) are read-only lookups against
external APIs — no reasoning happens server-side. Per the global model-selection
policy (small items = sonnet/haiku), route these through a `sonnet` or `haiku`
subagent rather than the primary session model:

- Single-field lookups (`scw_get_item`, `sct_get_article`, `uex_get_commodities`) → `haiku`
- Lookups needing filtering or cross-referencing (`uex_get_ship_prices`,
  `scw_list_items`, `scw_snapshot_diff`) → `sonnet`
- Escalate only when the result needs interpretation beyond presenting the data,
  such as recommending a trade route rather than just fetching prices.

MCP has no protocol field to force a caller's model choice — this depends on the
orchestrating agent honoring this file, not on the server.

## API Gotchas

These cost real debugging time. Do not re-derive them.

- **`vehicles_purchases_prices` ignores `vehicle_name`.** Passing it silently
  returns *every* vehicle rather than erroring. Only `id_vehicle` filters. Resolve
  the name to an id via `/vehicles` first — price rows carry no vehicle name field.
- **Wiki item categories are endpoints, not filters.** Use `/weapons`,
  `/armor`, `/vehicle-weapons` (ship weapons), `/vehicle-items` (ship components).
  There is no `filter[category]`.
- **Call `/vehicles/filters` and `/items/filters`** for authoritative filter names
  and allowed values. Exposed as the `scw_get_filters` tool.
- **Ground vehicles are not covered by `filter[role]=Medical`.** The Ursa Medivac
  is `is_spaceship: false` and is found via `max_medical_tier`, not `role`.
- **`formatOutput` strips nulls and zeros.** A meaningful null (like `ptu: null`
  from `game_versions`, meaning no PTU build is live) must be mapped to explicit
  text before formatting or the signal disappears.

## PTU vs LIVE

`uex_get_game_versions` reports both build strings; `ptu` is null when no PTU
build is up. Neither API serves PTU *data* on request — the wiki API stamps
records with the build it synced (`game_version`) but exposes no environment
selector. So patch comparison works by snapshot: `scw_snapshot_save` captures a
dataset keyed by version, `scw_snapshot_diff` compares two snapshots (or one
against current live). Snapshots land in `.snapshots/` (gitignored); override
with `SCMCP_SNAPSHOT_DIR`.

## Not Integrated

- **spviewer.eu** — has a JSON endpoint (`data.spviewer.eu/spvapi/data/v1/live`)
  but it is session-gated and returns `{"error":"Disconnection (CODE 30000)"}` to
  direct requests.
- **erkul.games** — no REST API. Ships data as content-hashed binary blobs
  (`cdn.erkul.games/LIVE/*.bin`) in an undocumented format.

Both would need reverse-engineering of private contracts that can break without
notice. Revisit only if either publishes a real API.
