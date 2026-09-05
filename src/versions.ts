/**
 * Historical game data across patches.
 *
 * The StarCitizenWiki/scunpacked-data repo commits a fresh dump of the game's
 * data files on every build, and each commit message is the build string
 * (e.g. "4.9.0-LIVE.12344265"). That history is the only source found that can
 * serve data for a *past* patch: both the wiki API and UEX only ever expose
 * whatever build they are currently synced to.
 */

import axios from "axios";
import fs from "node:fs/promises";
import path from "node:path";

const REPO = "StarCitizenWiki/scunpacked-data";
const GITHUB_API = "https://api.github.com";
const RAW_BASE = "https://raw.githubusercontent.com";

export const DATASETS = {
  ships: "ships.json",
  "ship-items": "ship-items.json",
  items: "items.json",
  "fps-items": "fps-items.json",
} as const;

export type DatasetName = keyof typeof DATASETS;

/** Dumps are ~14MB each and immutable per commit, so they are cached on disk. */
const CACHE_DIR =
  process.env.SCMCP_BUILD_CACHE_DIR || path.join(process.cwd(), ".build-cache");

const ghClient = axios.create({
  baseURL: GITHUB_API,
  headers: {
    Accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  },
});

export interface Build {
  version: string;
  sha: string;
  date: string;
}

/**
 * List the game builds for which a dataset has a committed dump, newest first.
 * Commit messages are the build strings; anything that does not look like one
 * is skipped so callers only ever see real versions.
 */
export async function listBuilds(dataset: DatasetName, limit = 40): Promise<Build[]> {
  const file = DATASETS[dataset];
  const perPage = Math.min(Math.max(limit, 1), 100);
  const response = await ghClient.get(`/repos/${REPO}/commits`, {
    params: { path: file, per_page: perPage },
  });

  const builds: Build[] = [];
  const seen = new Set<string>();

  for (const commit of response.data ?? []) {
    const message: string = (commit.commit?.message ?? "").split("\n")[0].trim();
    if (!/^\d+\.\d+/.test(message)) continue;
    // Several commits can share one build; keep the newest of each.
    if (seen.has(message)) continue;
    seen.add(message);
    builds.push({
      version: message,
      sha: commit.sha,
      date: (commit.commit?.author?.date ?? "").slice(0, 10),
    });
  }

  return builds;
}

/**
 * Resolve a user-supplied version to a build. Accepts an exact build string, a
 * prefix such as "4.9", or a commit sha.
 */
export async function resolveBuild(dataset: DatasetName, version: string): Promise<Build> {
  const builds = await listBuilds(dataset, 100);
  const needle = version.trim().toLowerCase();

  const exact = builds.find((b) => b.version.toLowerCase() === needle);
  if (exact) return exact;

  const bySha = builds.find((b) => b.sha.startsWith(needle));
  if (bySha) return bySha;

  // Prefix match: "4.9" should find the newest 4.9.x build, not 4.9 vs 4.10 ambiguously.
  const prefixed = builds.filter(
    (b) => b.version.toLowerCase().startsWith(needle + ".") || b.version.toLowerCase().startsWith(needle + "-"),
  );
  if (prefixed.length > 0) return prefixed[0];

  throw new Error(
    `No build matching "${version}" for ${dataset}. Available: ${builds
      .slice(0, 12)
      .map((b) => b.version)
      .join(", ")}`,
  );
}

/** Fetch a dataset at a build, caching the dump on disk since it never changes. */
export async function fetchDataset(
  dataset: DatasetName,
  build: Build,
): Promise<Record<string, unknown>[]> {
  const file = DATASETS[dataset];
  const cachePath = path.join(CACHE_DIR, `${dataset}__${build.sha.slice(0, 10)}.json`);

  try {
    return JSON.parse(await fs.readFile(cachePath, "utf-8"));
  } catch {
    // Not cached yet.
  }

  const url = `${RAW_BASE}/${REPO}/${build.sha}/${file}`;
  const response = await axios.get(url, {
    responseType: "json",
    maxContentLength: 200 * 1024 * 1024,
    maxBodyLength: 200 * 1024 * 1024,
  });

  const data = response.data;
  if (!Array.isArray(data)) {
    throw new Error(`Unexpected shape for ${file} at ${build.version}: expected an array.`);
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(data));
  return data;
}

/** Identity for a record: className is stable across patches; name is not. */
function keyOf(entry: Record<string, unknown>): string | undefined {
  return (
    (typeof entry.className === "string" && entry.className) ||
    (typeof entry.ClassName === "string" && entry.ClassName) ||
    (typeof entry.reference === "string" && entry.reference) ||
    (typeof entry.name === "string" && entry.name) ||
    undefined
  );
}

function indexBy(entries: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (key) map.set(key, entry);
  }
  return map;
}

/** Flatten nested objects to dotted paths so field-level changes are visible. */
function flatten(value: unknown, prefix = "", out: Record<string, unknown> = {}) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out[prefix] = value;
  }
  return out;
}

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export function diffEntry(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldChange[] {
  const fa = flatten(before);
  const fb = flatten(after);
  const fields = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  const changes: FieldChange[] = [];

  for (const field of fields) {
    if (JSON.stringify(fa[field]) !== JSON.stringify(fb[field])) {
      changes.push({ field, from: fa[field], to: fb[field] });
    }
  }

  return changes.sort((a, b) => a.field.localeCompare(b.field));
}

/** Human-readable label for a record, for listing changed things by name. */
function labelOf(entry: Record<string, unknown> | undefined, key: string): string {
  if (!entry) return key;
  const name = entry.name;
  if (typeof name === "string" && name && !name.includes("PLACEHOLDER")) return `${name} (${key})`;
  return key;
}

export interface DiffResult {
  dataset: string;
  from: Build;
  to: Build;
  summary: { added: number; removed: number; changed: number; unchanged: number };
  added?: string[];
  removed?: string[];
  changed?: { item: string; change_count: number; changes?: FieldChange[] }[];
  truncated?: string;
}

/**
 * Diff a dataset between two builds.
 *
 * With `itemQuery` this reports every changed field for the matching records.
 * Without it, it reports counts plus names, since a full field-level diff of a
 * whole dataset is thousands of entries and would be useless in a response.
 */
export function diffDatasets(
  dataset: string,
  from: Build,
  to: Build,
  beforeEntries: Record<string, unknown>[],
  afterEntries: Record<string, unknown>[],
  options: { itemQuery?: string; limit?: number } = {},
): DiffResult {
  const before = indexBy(beforeEntries);
  const after = indexBy(afterEntries);
  const limit = options.limit ?? 50;

  if (options.itemQuery) {
    const needle = options.itemQuery.toLowerCase();
    const matches = (key: string, entry?: Record<string, unknown>) =>
      key.toLowerCase().includes(needle) ||
      (typeof entry?.name === "string" && entry.name.toLowerCase().includes(needle));

    const keys = new Set<string>();
    for (const [k, v] of before) if (matches(k, v)) keys.add(k);
    for (const [k, v] of after) if (matches(k, v)) keys.add(k);

    if (keys.size === 0) {
      throw new Error(`No entry in ${dataset} matching "${options.itemQuery}" in either build.`);
    }

    const added: string[] = [];
    const removed: string[] = [];
    const changed: DiffResult["changed"] = [];

    for (const key of keys) {
      const b = before.get(key);
      const a = after.get(key);
      if (!b && a) added.push(labelOf(a, key));
      else if (b && !a) removed.push(labelOf(b, key));
      else if (b && a) {
        const changes = diffEntry(b, a);
        if (changes.length > 0) {
          changed.push({ item: labelOf(a, key), change_count: changes.length, changes });
        }
      }
    }

    return {
      dataset,
      from,
      to,
      summary: {
        added: added.length,
        removed: removed.length,
        changed: changed.length,
        unchanged: keys.size - added.length - removed.length - changed.length,
      },
      added: added.length ? added : undefined,
      removed: removed.length ? removed : undefined,
      changed: changed.length ? changed : undefined,
    };
  }

  const added: string[] = [];
  const removed: string[] = [];
  const changed: { item: string; change_count: number }[] = [];
  let unchanged = 0;

  for (const [key, entry] of after) {
    if (!before.has(key)) added.push(labelOf(entry, key));
  }
  for (const [key, entry] of before) {
    if (!after.has(key)) removed.push(labelOf(entry, key));
  }
  for (const [key, b] of before) {
    const a = after.get(key);
    if (!a) continue;
    const count = diffEntry(b, a).length;
    if (count > 0) changed.push({ item: labelOf(a, key), change_count: count });
    else unchanged += 1;
  }

  changed.sort((x, y) => y.change_count - x.change_count);

  const notes: string[] = [];
  if (added.length > limit) notes.push(`added list capped at ${limit} of ${added.length}`);
  if (removed.length > limit) notes.push(`removed list capped at ${limit} of ${removed.length}`);
  if (changed.length > limit)
    notes.push(`changed list capped at ${limit} of ${changed.length}, largest first`);

  return {
    dataset,
    from,
    to,
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged,
    },
    added: added.slice(0, limit),
    removed: removed.slice(0, limit),
    changed: changed.slice(0, limit),
    truncated: notes.length
      ? `${notes.join("; ")}. Pass item_name to see field-level changes for one thing.`
      : undefined,
  };
}
