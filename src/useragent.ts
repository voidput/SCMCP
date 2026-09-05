/**
 * Identity sent to every upstream API.
 *
 * MediaWiki asks API consumers for a descriptive User-Agent with a contact URL
 * and serves anonymous clients 403s when a host is under load — both wikis this
 * server reads are MediaWiki. The version comes from package.json so a
 * semantic-release bump reaches the header (and the MCP handshake) without an
 * edit here.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const VERSION = pkg.version;
export const USER_AGENT = `SCMCP/${VERSION} (+https://github.com/voidput/SCMCP)`;
