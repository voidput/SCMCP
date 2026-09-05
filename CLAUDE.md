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
- **`marketplace_listings` caps at 100 rows** unless both `id_item` and
  `operation` are passed together, which unlocks a 1,000-row cap. No free-text
  search param exists server-side — `uex_search_marketplace` filters
  title/description client-side over whatever page the API returns, so a broad
  query without `id_item` only searches the first 100 active listings.

## Comparing Patch Versions

`sc_list_builds` and `sc_diff_versions` compare any two patches. They read a
data repo (`SCMCP_DATA_REPO`, default `voidput/sc-gamedata-dumps`) that commits
one `data/game-*.json` dump per game build and tags that commit with the build
string. The tag list is the patch history, and it is the only source that serves
data for a *past* patch — the wiki API and UEX both expose only the build they
are currently synced to.

Same pipeline as `SCMCP_GAME_DATA_DIR`, so a domain readable offline diffs here
with identical field names. Datasets: `ships`, `ship-components`, `fps-weapons`,
`ammo`, `mining`, `mining-spawns`, `blueprints`, `missions`, `reputation`,
`containers`, `starmap`, `manufacturers`, `wikelo-trades`, `strings`.

Each dump is an envelope (`_source`, `_extracted`, `_build`) wrapping named
collections, not a bare array. Every dataset declares the collection to diff by
default; pass `collection` to diff another (`shields`, `quantumDrives`, `radars`
and `missiles` all live in `ship-components`). The `by*` keys are derived
indexes over the same records — diffing one double-counts.

Records are identified by `className`/`recordName` where they carry one, and by
their own object key where they do not (`strings` is a flat id -> text map).
Display names are not stable across patches and are never the identity.

Dumps are immutable per tag, so they cache to `.build-cache/` (override with
`SCMCP_BUILD_CACHE_DIR`). Set `GITHUB_TOKEN` to avoid GitHub rate limits.

Without `item_name` a whole-dataset diff returns counts plus the most-changed
entries, because a full field-level diff runs to thousands of entries. Pass
`item_name` for field-level detail on one thing.

## PTU vs LIVE

`uex_get_game_versions` reports both build strings; `ptu` is null when no PTU
build is up. Neither API serves PTU *data* on request — the wiki API stamps
records with the build it synced (`game_version`) but exposes no environment
selector. For comparing patches prefer `sc_diff_versions` above. The `scw_snapshot_*`
tools remain useful only for capturing the wiki API's enriched view (which
carries UEX prices and shop data the raw dumps lack). Snapshots land in `.snapshots/` (gitignored); override
with `SCMCP_SNAPSHOT_DIR`.

## Locally Extracted Game Data

`sc_local_datasets`, `sc_search_local` and `sc_read_local_collection` read
`game-*.json` produced by the StarBreaker pipeline: a PowerShell extract step
rips the DataCore/DataForge database out of the shipped game files, then a parse
step bakes it into per-domain JSON.

Set `SCMCP_GAME_DATA_DIR` to the directory holding those files. Nothing assumes a
sibling checkout, and the tools report how to configure themselves when it is
unset.

This is the only source for mining ore signatures and spawn weights, crafting
blueprints, reputation and mission brokers, quality bands, and Wikelo trades.
It covers ships and guns too, but carries no prices or shop locations — those
are UEX and wiki API territory. Same files the tagged dump history serves, so
this is the offline read of the build you have installed; `sc_diff_versions` is
the read across builds. The sources are complementary, not redundant.

Note the extraction toolkit ships its own MCP server, but that one exposes
low-level archive internals (p4k entries, chunks, DataCore bytes) for debugging
extraction. It is not a game-data query API and does not overlap with SCMCP.

## Not Integrated

- **spviewer.eu** — has a JSON endpoint (`data.spviewer.eu/spvapi/data/v1/live`)
  but it is session-gated and returns `{"error":"Disconnection (CODE 30000)"}` to
  direct requests.
- **erkul.games** — no REST API. Ships data as content-hashed binary blobs
  (`cdn.erkul.games/LIVE/*.bin`) in an undocumented format.

Both would need reverse-engineering of private contracts that can break without
notice. Revisit only if either publishes a real API.
