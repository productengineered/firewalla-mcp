/**
 * Tool registration barrel — call {@link registerAllTools} once at startup
 * to wire every read-only Firewalla MCP tool onto the server.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FirewallaClient } from "../firewalla-client.js";
import { registerAlarmTools } from "./alarms.js";
import { registerBoxTools } from "./boxes.js";
import { registerDeviceTools } from "./devices.js";
import { registerFlowTools } from "./flows.js";
import { registerRuleTools } from "./rules.js";
import { registerTargetListTools } from "./target-lists.js";

export function registerAllTools(server: McpServer, client: FirewallaClient): void {
  registerBoxTools(server, client);
  registerDeviceTools(server, client);
  registerFlowTools(server, client);
  registerAlarmTools(server, client);
  registerRuleTools(server, client);
  registerTargetListTools(server, client);
}
