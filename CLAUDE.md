# Firewalla MCP Server

Building a read-only Model Context Protocol server that lets Claude query and
audit a Firewalla box via the Firewalla MSP API.

## How to work on this project

**Always start by loading the `mcp-builder` skill at `.claude/skills/mcp-builder/SKILL.md`.**
That skill is Anthropic's official MCP authoring guide and defines the four-phase
workflow (research → implement → test → evaluate) we are following. Its reference
library lives under `.claude/skills/mcp-builder/reference/`:

- `mcp_best_practices.md` — naming, pagination, transport, security, annotations
- `node_mcp_server.md` — TypeScript SDK patterns, Zod schemas, `server.registerTool`
- `python_mcp_server.md` — FastMCP patterns (not used here, kept for reference)
- `evaluation.md` — Phase 4 eval authoring rules and XML format

Evaluation tooling lives under `.claude/skills/mcp-builder/scripts/`.

## Stack decisions (locked)

- **Language**: TypeScript (per skill recommendation — best SDK, good for codegen)
- **Transport**: stdio (local, single-user Claude Desktop integration)
- **Schemas**: Zod for every tool input; define `outputSchema` + return
  `structuredContent` wherever the response is tabular
- **Package name**: `firewalla-mcp-server`
- **Tool prefix**: `firewalla_` (e.g. `firewalla_list_devices`, `firewalla_get_flows`)
- **Response formats**: every list/get tool takes `response_format: "json" | "markdown"`
- **Pagination**: flows and alarms use **cursor-based** pagination — tools
  accept `cursor` + `limit` (1–500, default 200) and return `next_cursor`
  when more results exist. The other list endpoints (boxes, devices, rules,
  target-lists) have no native pagination; expose them as single-shot lists.

## Conventions we will follow

- Tool names are `snake_case`, action-first, prefixed with `firewalla_`
- Read tools: `readOnlyHint: true`
- Write/mutation tools: `destructiveHint: true` (block, unblock, rule changes)
- Errors are returned inside `result` objects with actionable next steps, never
  bare exceptions (e.g. "device not found — call `firewalla_list_devices`")
- **Never log to stdout** — stdio transport treats stdout as the protocol channel.
  Logs go to stderr.
- Secrets (`FIREWALLA_MSP_TOKEN`, `FIREWALLA_MSP_DOMAIN`) come from env vars,
  validated on startup, never hardcoded

## Firewalla API references

- Main docs: https://docs.firewalla.net/
- MSP API examples: https://github.com/firewalla/msp-api-examples
- Getting started with MSP API: https://help.firewalla.com/hc/en-us/articles/5345330648083-Getting-Started-with-the-Firewalla-MSP-API

Raw links also live in `firewalla-resources.txt`.

## Project scope (decided)

- **Box**: single standalone Firewalla (not a managed fleet)
- **API path**: Firewalla MSP API — the _only_ supported public API, even for
  standalone boxes. User must link their box to an MSP account at
  `<subdomain>.firewalla.net` and generate a personal access token.
  There is no local-box API; do not attempt to reverse-engineer one.
- **Surface**: read-only / query-and-observe only. No block/unblock, no rule
  mutation, no pause/resume. Every tool gets `readOnlyHint: true`.
- **Clients**: Claude Desktop _and_ Claude Code. Both consume local stdio MCP
  servers (Desktop via `claude_desktop_config.json`, Code via `.mcp.json` or
  `claude mcp add`), so stdio transport covers both.

## Endpoint categories to cover (read-only)

From `firewalla/msp-api-examples`:

- **Flow** — network flow pagination
- **Alarm** — list/get active alarms, filter by box
- **Device** — list devices, offline devices, top bandwidth users
- **Rule** — list/get rules with conditions (no pause/resume)
- **Target Lists** — list/get IP/domain target lists

## Env vars

- `FIREWALLA_MSP_DOMAIN` — e.g. `yourname.firewalla.net`
- `FIREWALLA_MSP_TOKEN` — personal access token from MSP Account Settings

## Phase status

- [x] Phase 0: skill installed, CLAUDE.md written
- [x] Phase 1: research Firewalla MSP API, draft tool list (approved)
- [x] Phase 2: scaffold TS project, implement API client + 8 tools
- [x] Phase 3: MCP Inspector verified; wired into Claude Desktop + Claude Code
- [x] Phase 4: evaluation.xml written with 10 verified QA pairs

## Project goal

Security posture review: this MCP server exists so Claude can audit whether
the user's Firewalla is configured correctly and the network is secure.
Every tool description, markdown formatter, and eval question should orient
toward that goal — not generic network browsing.
