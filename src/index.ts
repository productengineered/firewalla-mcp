#!/usr/bin/env node
/**
 * firewalla-mcp-server
 *
 * An MCP server that exposes the Firewalla MSP API so Claude can audit
 * Firewalla configuration and network security posture. Read-only by design:
 * no block/unblock, no rule mutation, no pause/resume.
 *
 * Transport: stdio (local, for Claude Desktop + Claude Code).
 *
 * stdio rule: NEVER write to stdout — that channel belongs to the MCP
 * protocol. All logging goes to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { FirewallaClient } from "./firewalla-client.js";
import { registerAllTools } from "./tools/index.js";

async function main(): Promise<void> {
  // Validate env up front so we fail loudly with a clear stderr message
  // instead of erroring mid-request.
  const config = loadConfig();

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const client = new FirewallaClient(config);
  registerAllTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${SERVER_NAME} v${SERVER_VERSION}: connected via stdio (domain=${config.domain})`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${SERVER_NAME}: fatal error — ${message}`);
  process.exit(1);
});
