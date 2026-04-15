# firewalla-mcp-server

A **read-only** [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets Claude audit your [Firewalla](https://firewalla.com/) configuration and network security posture via the [Firewalla MSP API](https://docs.firewalla.net/).

> **Read-only by design.** This server cannot block/unblock devices, create or modify rules, pause services, or make any changes to your Firewalla. It only observes.

## What it does

Exposes 8 tools that Claude can use to inspect your Firewalla — devices on your network, active rules, security alarms, network flows, and block/allow target lists. Designed for questions like:

- "Are there any unknown devices on my network?"
- "Do I have any allow rules that bypass Firewalla's default blocks?"
- "What security alarms have fired recently, grouped by type?"
- "Are there outbound flows to unexpected countries that weren't blocked?"
- "Which target lists is my Firewalla enforcing?"

## Tools

| Tool                          | Description                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `firewalla_list_boxes`        | Discover Firewalla boxes on the MSP account (model, firmware, online status, device/rule/alarm counts) |
| `firewalla_list_devices`      | Inventory all devices on the network (IP, MAC vendor, device type, online status, monitoring flag)     |
| `firewalla_search_flows`      | Search network flows with query filters, grouping, and cursor pagination                               |
| `firewalla_search_alarms`     | Search active security alarms with query filters, grouping, and cursor pagination                      |
| `firewalla_get_alarm`         | Fetch full detail for a single alarm by box + alarm ID                                                 |
| `firewalla_list_rules`        | Audit configured block/allow rules (action, direction, target, scope, hit count)                       |
| `firewalla_list_target_lists` | List block/allow target lists (Firewalla-managed and user-defined)                                     |
| `firewalla_get_target_list`   | Fetch metadata for a single target list by ID                                                          |

All tools support `response_format: "json" | "markdown"` and are annotated `readOnlyHint: true`.

## Prerequisites

1. **A Firewalla box** linked to an MSP account. Even standalone (non-fleet) boxes use the MSP API — it's the only supported public API.

2. **An MSP personal access token.** Generate one at:
   - Log in to your MSP portal at `https://<your-subdomain>.firewalla.net`
   - Go to **Account Settings** → **Personal Access Tokens**
   - Create a new token and save it somewhere secure

   For detailed setup instructions, see [Getting Started with the Firewalla MSP API](https://help.firewalla.com/hc/en-us/articles/5345330648083-Getting-Started-with-the-Firewalla-MSP-API).

3. **Node.js 18+**

## Install

```bash
git clone https://github.com/<your-username>/firewalla-mcp.git
cd firewalla-mcp
npm install
npm run build
```

## Configuration

The server reads two environment variables:

| Variable               | Description                                           | Example                  |
| ---------------------- | ----------------------------------------------------- | ------------------------ |
| `FIREWALLA_MSP_DOMAIN` | Your MSP subdomain (no `https://`, no trailing slash) | `yourname.firewalla.net` |
| `FIREWALLA_MSP_TOKEN`  | Personal access token from MSP Account Settings       | `fwtoken_abc123...`      |

For local development, copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
# edit .env with your real values
```

## Usage with Claude Desktop

Add to your `claude_desktop_config.json` (usually at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "firewalla": {
      "command": "node",
      "args": ["/absolute/path/to/firewalla-mcp/dist/index.js"],
      "env": {
        "FIREWALLA_MSP_DOMAIN": "yourname.firewalla.net",
        "FIREWALLA_MSP_TOKEN": "your-token-here"
      }
    }
  }
}
```

> **Note:** Claude Desktop launches with a minimal `PATH`. If `node` isn't found, use the absolute path to your Node.js binary (e.g. the output of `which node`).

Restart Claude Desktop after editing the config.

## Usage with Claude Code

```bash
claude mcp add-json --scope user firewalla '{
  "type": "stdio",
  "command": "node",
  "args": ["/absolute/path/to/firewalla-mcp/dist/index.js"],
  "env": {
    "FIREWALLA_MSP_DOMAIN": "yourname.firewalla.net",
    "FIREWALLA_MSP_TOKEN": "your-token-here"
  }
}'
```

Verify with:

```bash
claude mcp list
# firewalla: ... - ✓ Connected
```

New Claude Code sessions will have `firewalla_*` tools available automatically.

## Development

```bash
# Source env for local dev
set -a; source .env; set +a

# Run with auto-reload
npm run dev

# Build
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
```

## Firewalla API documentation

- [Firewalla MSP API reference](https://docs.firewalla.net/)
- [MSP API examples (GitHub)](https://github.com/firewalla/msp-api-examples)
- [Getting started with the MSP API](https://help.firewalla.com/hc/en-us/articles/5345330648083-Getting-Started-with-the-Firewalla-MSP-API)

## License

MIT
