/**
 * firewalla_list_boxes — discover the Firewalla boxes linked to the MSP account.
 *
 * This is the entry point for every audit: it returns the `gid` that every
 * other tool needs and surfaces the top-level posture (online, firmware,
 * counts of devices/rules/alarms).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FirewallaClient } from "../firewalla-client.js";
import { errorResult, fmtTimestamp, formatResult, mdCell, yesNo } from "../formatters.js";
import { responseFormatSchema } from "../schemas.js";
import type { Box } from "../types.js";

const inputShape = {
  group: z
    .string()
    .optional()
    .describe("Filter to boxes in a specific group id. Omit to list all boxes on the account."),
  response_format: responseFormatSchema,
};

type Input = z.infer<z.ZodObject<typeof inputShape>>;

export function registerBoxTools(server: McpServer, client: FirewallaClient): void {
  server.registerTool(
    "firewalla_list_boxes",
    {
      title: "List Firewalla Boxes",
      description: `Discover the Firewalla boxes linked to this MSP account. This is the entry point for every audit — the returned \`gid\` is required by other tools.

Use this to answer:
  - "Is my box online and reporting in?"
  - "What firmware version is it running?"
  - "How many active devices, rules, alarms are there right now?"

Args:
  - group (string, optional): Filter to a specific group id.
  - response_format ('markdown' | 'json'): Output format (default: markdown).

Returns:
  {
    count: number,
    boxes: Array<{
      gid: string,          // box id — save this, other tools need it
      name: string,
      model: string,        // e.g. "gold_plus"
      mode: string,         // routing mode
      version: string,      // firmware
      online: boolean,
      publicIP?: string,
      lastSeen?: number,    // epoch seconds — not always populated
      license?: string,
      location?: string,
      deviceCount: number,
      ruleCount: number,
      alarmCount: number,   // currently-active alarms
      group?: { id, name }
    }>
  }

Audit framing:
  - Offline box → can't observe current state; surface it.
  - High alarmCount → follow up with firewalla_search_alarms.
  - publicIP exposed unexpectedly → investigate with firewalla_search_flows.`,
      inputSchema: inputShape,
      annotations: {
        title: "List Firewalla Boxes",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: Input) => {
      try {
        const params: Record<string, unknown> = {};
        if (args.group) params.group = args.group;

        const boxes = await client.get<Box[]>("/boxes", params);
        const structured = {
          count: boxes.length,
          boxes,
        };

        return formatResult({
          format: args.response_format,
          structured,
          toMarkdown: renderBoxes,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}

function renderBoxes(data: { count: number; boxes: Box[] }): string {
  if (data.count === 0) {
    return "No Firewalla boxes found for this MSP account.";
  }
  const lines: string[] = [
    `# Firewalla boxes (${data.count})`,
    "",
    "| Name | gid | Model | Online | Firmware | Devices | Rules | Alarms | Last seen |",
    "| --- | --- | --- | :---: | --- | ---: | ---: | ---: | --- |",
  ];
  for (const b of data.boxes) {
    lines.push(
      `| ${mdCell(b.name)} | \`${mdCell(b.gid)}\` | ${mdCell(b.model)} | ${yesNo(
        b.online,
      )} | ${mdCell(b.version)} | ${b.deviceCount} | ${b.ruleCount} | ${b.alarmCount} | ${fmtTimestamp(b.lastSeen)} |`,
    );
  }
  if (data.boxes.some((b) => b.publicIP)) {
    lines.push("", "## Public IPs");
    for (const b of data.boxes) {
      if (b.publicIP) {
        lines.push(`- ${mdCell(b.name)}: \`${mdCell(b.publicIP)}\``);
      }
    }
  }
  return lines.join("\n");
}
