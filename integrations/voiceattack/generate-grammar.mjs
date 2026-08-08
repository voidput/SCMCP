#!/usr/bin/env node
/**
 * Generate a VoiceAttack dynamic phrase list from live commodity data.
 *
 * Dictation mode will mis-hear "Laranite" more often than not. A closed grammar
 * — `[Gold;Laranite;Titanium]` with the match exposed as {TXT:1} — gets the
 * recognizer a fixed vocabulary and is dramatically more accurate. The cost is
 * that the list has to be regenerated when CIG adds commodities, which is what
 * this script is for.
 *
 * Usage:
 *   node integrations/voiceattack/generate-grammar.mjs            # print to stdout
 *   node integrations/voiceattack/generate-grammar.mjs -o out.txt # write to a file
 *
 * Requires the daemon to be running (npm run daemon).
 */

import { writeFileSync } from "node:fs";

const baseUrl = process.env.SCMCP_URL ?? "http://127.0.0.1:7331";
const token = process.env.SCMCP_HTTP_TOKEN;

const outIndex = process.argv.findIndex((a) => a === "-o" || a === "--out");
const outFile = outIndex !== -1 ? process.argv[outIndex + 1] : undefined;

/**
 * VoiceAttack uses ; to separate alternatives and [] to delimit the list, so a
 * name containing either would silently corrupt the grammar. Commas and
 * parentheses confuse the recognizer without breaking it, so strip those too.
 */
function speakable(name) {
  return name
    .replace(/[[\];]/g, " ")
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const url = `${baseUrl.replace(/\/+$/, "")}/q/uex_get_commodities`;
  const headers = token ? { "X-SCMCP-Token": token } : {};

  let response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    console.error(`Could not reach the daemon at ${baseUrl} — is it running? (npm run daemon)`);
    console.error(String(error));
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`Daemon returned ${response.status}: ${await response.text()}`);
    process.exit(1);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    console.error("Expected an array of commodities. Got:");
    console.error(JSON.stringify(data, null, 2).slice(0, 500));
    process.exit(1);
  }

  const names = [
    ...new Set(
      data
        .map((row) => (row && typeof row.name === "string" ? row.name : row?.commodity_name))
        .filter((name) => typeof name === "string" && name.trim() !== "")
        .map(speakable)
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));

  if (names.length === 0) {
    console.error("No commodity names found in the response.");
    process.exit(1);
  }

  const list = `[${names.join(";")}]`;
  const output = `VoiceAttack phrase list — ${names.length} commodities
Generated from ${url}

Paste the bracketed list into a command's spoken phrase. The matched word is
available as {TXT:1}.

--- Suggested commands ---

  where should I sell ${list}
  where can I buy ${list}
  price check ${list}

For each, the command's actions are:

  Set Text  ~commodity  to  {TXT:1}
  Set Text  ~path       to  /say/sell?commodity={TXT:~commodity}
  Execute inline C# (integrations/voiceattack/SCMCP.cs)
  Say with text-to-speech  {TXT:~answer}

Swap /say/sell for /say/buy on the "where can I buy" command.

--- Phrase list ---

${list}
`;

  if (outFile) {
    writeFileSync(outFile, output, "utf8");
    console.error(`Wrote ${names.length} commodities to ${outFile}`);
  } else {
    process.stdout.write(output);
  }
}

main();
