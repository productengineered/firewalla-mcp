# firewalla-mcp-server

A **read-only** [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets Claude audit your [Firewalla](https://firewalla.com/) configuration and network security posture via the [Firewalla MSP API](https://docs.firewalla.net/).

> **Read-only by design.** This server cannot block/unblock devices, create or modify rules, pause services, or make any changes to your Firewalla. It only observes.

## What it does

Exposes 8 tools that Claude can use to inspect your Firewalla — devices on your network, active rules, security alarms, network flows, and block/allow target lists.

## Example prompts

### Security audits

These prompts treat Claude as a network security professional conducting a structured review of your Firewalla configuration. They work best in Claude Desktop or Claude Code where the Firewalla MCP tools are available.

**Full network security audit:**

> You are a senior network security engineer conducting a comprehensive audit of my home network. Using the Firewalla MCP tools, perform the following review and present your findings in a structured report with severity ratings (Critical / High / Medium / Low / Informational):
>
> 1. **Device inventory** — Pull the complete device list. Flag any devices with unrecognized MAC vendors, devices not being monitored, or unexpected router-class devices that could indicate a rogue access point.
> 2. **Rule audit** — Review all block/allow rules. Identify any allow rules that are overly permissive (broad scope, inbound direction, no device restriction). Flag rules with zero hit counts that may be stale.
> 3. **Alarm review** — Search recent alarms grouped by type and severity. Identify any patterns (repeated alarms from the same device, alarms from unexpected countries, alarms targeting devices that shouldn't have external exposure).
> 4. **Target list coverage** — Review which block lists are active. Assess whether the current list configuration provides adequate coverage against common threat categories (malware, C2, phishing, cryptomining, newly registered domains).
>
> Conclude with a prioritized list of recommended actions I should take to improve my network security posture.

**Firewall rule gap analysis:**

> Act as a firewall policy analyst. Pull all of my Firewalla rules and the complete device list, then cross-reference them. I need you to identify: (1) devices that have no rules scoped to them at all — are they relying entirely on global rules, and is that intentional? (2) allow rules that grant inbound access — what devices do they target and is the scope appropriately narrow? (3) block rules that have never fired (hit count = 0) — are they stale or is the threat they guard against simply not present? Present your findings as a table for each category with your assessment and recommended action.

**Suspicious traffic investigation:**

> I want to investigate whether any devices on my network are communicating with unexpected external destinations. Search my recent network flows for any traffic to regions outside the US that was NOT blocked by Firewalla. Group the results by device and destination country. For any device that shows unblocked traffic to unusual regions, cross-reference it against my device list to identify what the device is, then check if there are any alarms associated with it. Summarize your findings with a risk assessment for each flagged device.

### Quick queries

These are shorter prompts for everyday monitoring and spot checks:

- "List all devices on my network and flag any that have an unknown MAC vendor or aren't being monitored by Firewalla."
- "Show me all allow rules on my Firewalla. Are any of them scoped too broadly?"
- "What are the top alarm types firing on my network right now? Group them by type and give me a count."
- "Check which Firewalla block lists I have active and how many entries each one has. Am I missing any important categories?"
- "Search for any blocked flows in the last 24 hours and group them by destination country. Which countries are showing up the most?"
- "Pull my Firewalla box info — is it online, what firmware version is it running, and how many active alarms are there right now?"

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
git clone https://github.com/productengineered/firewalla-mcp.git
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
