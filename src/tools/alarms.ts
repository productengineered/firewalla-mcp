/**
 * Alarm tools:
 *
 *   - firewalla_search_alarms — cursor-paginated search over active alarms
 *     (Firewalla query grammar pass-through).
 *   - firewalla_get_alarm — fetch one alarm by gid + aid.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FirewallaClient } from "../firewalla-client.js";
import { errorResult, fmtTimestamp, formatResult, mdCell } from "../formatters.js";
import {
  cursorPaginationSchema,
  groupBySchema,
  querySchema,
  responseFormatSchema,
  sortBySchema,
} from "../schemas.js";
import type { Alarm, CursorPage } from "../types.js";

// ---------- firewalla_search_alarms ----------

const searchInputShape = {
  query: querySchema,
  group_by: groupBySchema,
  sort_by: sortBySchema,
  ...cursorPaginationSchema,
  response_format: responseFormatSchema,
};

type SearchInput = z.infer<z.ZodObject<typeof searchInputShape>>;

// ---------- firewalla_get_alarm ----------

const getInputShape = {
  gid: z.string().min(1).describe("Box id (from firewalla_list_boxes)."),
  aid: z
    .union([z.string().min(1), z.number().int()])
    .transform((v) => String(v))
    .describe(
      "Alarm id (from firewalla_search_alarms results). Accepts number or string; the API returns numeric ids.",
    ),
  response_format: responseFormatSchema,
};

type GetInput = z.infer<z.ZodObject<typeof getInputShape>>;

export function registerAlarmTools(server: McpServer, client: FirewallaClient): void {
  server.registerTool(
    "firewalla_search_alarms",
    {
      title: "Search Firewalla Alarms",
      description: `Search active Firewalla alarms with the MSP query grammar. This is the primary tool for "what security events are happening right now?" audits.

Use this to answer:
  - "Any alarms from devices not in a known group?"
  - "How many alarms of type X in the last 24h, grouped by device?"
  - "Which remote countries are triggering the most alarms?"
  - "Any alarms relating to a specific device (by MAC)?"

Args:
  - query (string, optional): Firewalla query grammar. Examples:
      \`type:1\`, \`device.mac:AA:BB:CC:DD:EE:FF\`, \`remote.country:CN\`, \`ts:>1700000000\`.
  - group_by (string, optional): e.g. \`device\`, \`type\`, \`remote.country\`.
  - sort_by (string, optional): e.g. \`ts:desc\` (default), \`ts:asc\`.
  - limit (number, 1–500, default 200).
  - cursor (string, optional): pagination cursor from a prior response.
  - response_format ('markdown' | 'json'): Output format (default: markdown).

Returns:
  {
    count: number,              // items in this page
    next_cursor?: string,       // echo back to fetch the next page
    alarms: Array<{
      aid, gid, type, ts, message, status?,
      device?: { id?, name?, ip? },
      remote?: { ip?, country?, name?, region?, category? }
    }>
  }

Audit framing:
  - Alarm from an unknown MAC (device.id not in firewalla_list_devices) → rogue device.
  - Repeated alarms to the same remote.country → likely a single piece of malware, check firewalla_list_rules.
  - When counts get big, use group_by=type first for a birds-eye view, then drill.`,
      inputSchema: searchInputShape,
      annotations: {
        title: "Search Firewalla Alarms",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: SearchInput) => {
      try {
        const params: Record<string, unknown> = { limit: args.limit };
        if (args.query) params.query = args.query;
        if (args.group_by) params.groupBy = args.group_by;
        if (args.sort_by) params.sortBy = args.sort_by;
        if (args.cursor) params.cursor = args.cursor;

        const raw = await client.get<CursorPage<Alarm>>("/alarms", params);
        const alarms = raw.results ?? [];
        const structured = {
          count: alarms.length,
          ...(raw.next_cursor ? { next_cursor: raw.next_cursor } : {}),
          alarms,
        };
        return formatResult({
          format: args.response_format,
          structured,
          toMarkdown: renderAlarmPage,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "firewalla_get_alarm",
    {
      title: "Get Firewalla Alarm",
      description: `Fetch the full detail of a single alarm by \`gid\` (box id) + \`aid\` (alarm id). Use this after firewalla_search_alarms to drill into one event.

Args:
  - gid (string, required): Box id (from firewalla_list_boxes).
  - aid (string, required): Alarm id (from firewalla_search_alarms).
  - response_format ('markdown' | 'json'): Output format (default: markdown).

Returns the full alarm record, which may include device, remote endpoint,
category, timestamps, and any alarm-type-specific detail fields the MSP API
surfaces.`,
      inputSchema: getInputShape,
      annotations: {
        title: "Get Firewalla Alarm",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GetInput) => {
      try {
        const alarm = await client.get<Alarm>(
          `/alarms/${encodeURIComponent(args.gid)}/${encodeURIComponent(args.aid)}`,
        );
        return formatResult({
          format: args.response_format,
          structured: { alarm },
          toMarkdown: ({ alarm }) => renderAlarmDetail(alarm),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}

function renderAlarmPage(data: { count: number; next_cursor?: string; alarms: Alarm[] }): string {
  if (data.count === 0) {
    return "No alarms match the filter.";
  }
  const lines: string[] = [
    `# Alarms (${data.count}${data.next_cursor ? ", more available" : ""})`,
    "",
    "| aid | Type | Timestamp | Device | Remote | Country | Message |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const a of data.alarms) {
    lines.push(
      `| \`${mdCell(a.aid)}\` | ${mdCell(a.type)} | ${fmtTimestamp(a.ts)} | ${mdCell(
        a.device?.name ?? a.device?.ip,
      )} | ${mdCell(a.remote?.name ?? a.remote?.ip)} | ${mdCell(
        a.remote?.country,
      )} | ${mdCell(a.message)} |`,
    );
  }
  if (data.next_cursor) {
    lines.push(
      "",
      `_More results available — pass \`cursor='${data.next_cursor}'\` to the next call._`,
    );
  }
  return lines.join("\n");
}

function renderAlarmDetail(alarm: Alarm): string {
  const lines: string[] = [
    `# Alarm \`${alarm.aid}\``,
    "",
    `- **Type**: ${mdCell(alarm.type)}`,
    `- **Timestamp**: ${fmtTimestamp(alarm.ts)}`,
    `- **Status**: ${mdCell(alarm.status)}`,
    `- **Message**: ${mdCell(alarm.message)}`,
  ];
  if (alarm.device) {
    lines.push(
      "",
      "## Device",
      `- name: ${mdCell(alarm.device.name)}`,
      `- id: ${mdCell(alarm.device.id)}`,
      `- ip: ${mdCell(alarm.device.ip)}`,
    );
  }
  if (alarm.remote) {
    lines.push(
      "",
      "## Remote",
      `- name: ${mdCell(alarm.remote.name)}`,
      `- ip: ${mdCell(alarm.remote.ip)}`,
      `- country: ${mdCell(alarm.remote.country)}`,
      `- region: ${mdCell(alarm.remote.region)}`,
      `- category: ${mdCell(alarm.remote.category)}`,
    );
  }
  return lines.join("\n");
}
