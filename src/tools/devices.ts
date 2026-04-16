/**
 * firewalla_list_devices — inventory of devices Firewalla sees on the network.
 *
 * Core primitive for "who's on my network right now". Supports filtering by
 * box (gid) and an `online_only` convenience flag (client-side filter).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FirewallaClient } from "../firewalla-client.js";
import { errorResult, fmtBytes, formatResult, mdCell, yesNo } from "../formatters.js";
import { responseFormatSchema } from "../schemas.js";
import type { Device } from "../types.js";

const inputShape = {
  box: z.string().optional().describe("Filter to devices attached to a specific box gid."),
  online_only: z
    .boolean()
    .optional()
    .describe(
      "If true, drop offline devices from the response. Client-side filter — " +
        "the API returns all devices either way.",
    ),
  response_format: responseFormatSchema,
};

type Input = z.infer<z.ZodObject<typeof inputShape>>;

export function registerDeviceTools(server: McpServer, client: FirewallaClient): void {
  server.registerTool(
    "firewalla_list_devices",
    {
      title: "List Firewalla Devices",
      description: `Inventory every device Firewalla tracks — the "who's on my network right now" primitive.

Use this to answer:
  - "Are there any unknown/rogue devices on my network?"
  - "Which devices aren't being monitored?"
  - "What's the MAC vendor breakdown across my network?"
  - "Any router-class devices I didn't expect?"

Args:
  - box (string, optional): Filter to devices on a specific box gid.
  - online_only (boolean, optional): Drop offline devices client-side.
  - response_format ('markdown' | 'json'): Output format (default: markdown).

Returns:
  {
    count: number,           // devices after client-side filtering
    total: number,           // devices returned by the API (pre-filter)
    devices: Array<{
      id: string,             // typically MAC
      gid: string,            // box the device is attached to
      name: string,
      ip: string,
      mac?: string,
      macVendor?: string,
      ipReserved?: boolean,
      online: boolean,
      network?: { id, name },
      deviceType?: string,    // e.g. "phone", "computer", "iot"
      isRouter?: boolean,
      isFirewalla?: boolean,
      monitoring?: boolean,   // false = device excluded from monitoring
      totalDownload?: number, // bytes (lifetime)
      totalUpload?: number
    }>
  }

Audit framing:
  - Unknown macVendor → possible squatter or spoofed MAC.
  - monitoring=false → device is excluded from Firewalla's visibility; review whether that's intentional.
  - Unexpected isRouter=true → shadow router on the LAN.
  - ipReserved=false on a server that should have a static lease → risk of address drift.`,
      inputSchema: inputShape,
      annotations: {
        title: "List Firewalla Devices",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: Input) => {
      try {
        const params: Record<string, unknown> = {};
        if (args.box) params.box = args.box;

        const all = await client.get<Device[]>("/devices", params);
        const filtered = args.online_only ? all.filter((d) => d.online) : all;

        const structured = {
          count: filtered.length,
          total: all.length,
          devices: filtered,
        };

        return formatResult({
          format: args.response_format,
          structured,
          toMarkdown: renderDevices,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}

function renderDevices(data: { count: number; total: number; devices: Device[] }): string {
  if (data.count === 0) {
    return data.total === 0
      ? "No devices returned from the Firewalla MSP API."
      : `No online devices (the API returned ${data.total}, filtered out by online_only).`;
  }
  const lines: string[] = [
    `# Devices (${data.count}${data.count !== data.total ? ` of ${data.total}` : ""})`,
    "",
    "| Name | IP | MAC vendor | Type | Online | Monitored | Network | Download | Upload |",
    "| --- | --- | --- | --- | :---: | :---: | --- | ---: | ---: |",
  ];
  for (const d of data.devices) {
    const typeCell = d.isRouter
      ? `${mdCell(d.deviceType) || "device"} (router)`
      : mdCell(d.deviceType);
    lines.push(
      `| ${mdCell(d.name)} | \`${mdCell(d.ip)}\` | ${mdCell(d.macVendor)} | ${typeCell} | ${yesNo(
        d.online,
      )} | ${yesNo(d.monitoring)} | ${mdCell(d.network?.name)} | ${fmtBytes(
        d.totalDownload,
      )} | ${fmtBytes(d.totalUpload)} |`,
    );
  }
  return lines.join("\n");
}
