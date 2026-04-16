/**
 * firewalla_search_flows — cursor-paginated search over network flows.
 *
 * This is the heaviest tool. The Firewalla MSP API supports a query grammar
 * with filters like `blocked:true`, `region:CN`, `ts:>1700000000`, etc.
 * We pass the query string through unmodified.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FirewallaClient } from "../firewalla-client.js";
import { errorResult, fmtBytes, fmtTimestamp, formatResult, mdCell, yesNo } from "../formatters.js";
import {
  cursorPaginationSchema,
  groupBySchema,
  querySchema,
  responseFormatSchema,
  sortBySchema,
} from "../schemas.js";
import type { CursorPage, Flow } from "../types.js";

const inputShape = {
  query: querySchema,
  group_by: groupBySchema,
  sort_by: sortBySchema,
  ...cursorPaginationSchema,
  response_format: responseFormatSchema,
};

type Input = z.infer<z.ZodObject<typeof inputShape>>;

export function registerFlowTools(server: McpServer, client: FirewallaClient): void {
  server.registerTool(
    "firewalla_search_flows",
    {
      title: "Search Firewalla Flows",
      description: `Search network flows observed by Firewalla with the MSP query grammar. Use this to inspect what's actually happening on the wire.

Use this to answer:
  - "Any outbound flows to region:CN that were NOT blocked?"
  - "Top talkers by download volume over the last 24h?"
  - "Which devices have made the most connections to blocklisted categories?"
  - "Are there any inbound flows from the public internet that shouldn't exist?"
  - "Flows from device X in the last hour?"

Args:
  - query (string, optional): Firewalla query grammar. Examples:
      \`blocked:true\`, \`region:CN\`, \`direction:inbound\`,
      \`device.mac:AA:BB:CC:DD:EE:FF\`, \`category:malware\`,
      \`ts:>1700000000\`, combined with AND/OR.
  - group_by (string, optional): e.g. \`device\`, \`device,destination\`, \`region\`.
  - sort_by (string, optional): e.g. \`ts:desc\` (default), \`download:desc\`.
  - limit (number, 1–500, default 200).
  - cursor (string, optional): pagination cursor from a prior response.
  - response_format ('markdown' | 'json'): Output format (default: markdown).

Returns:
  {
    count: number,              // items in this page
    next_cursor?: string,
    flows: Array<{
      ts, gid, protocol, direction,
      block?, blockType?,
      download?, upload?, total?, duration?, count?,
      device?: { id, ip?, name?, network? },
      source?:      { id?, ip?, name?, port? },
      destination?: { id?, ip?, name?, port? },
      // Flow-level classification fields (NOT nested under destination):
      country?, region?, domain?, category?
    }>
  }

Audit framing:
  - Start broad with \`sort_by=download:desc\` to find top bandwidth users.
  - Narrow with \`query\` when you've found a device/region of interest.
  - \`block=false\` flows to a category:malware destination = missed block, investigate rules.
  - Use \`group_by\` for aggregates; use limit=50 or so for fine-grained review.`,
      inputSchema: inputShape,
      annotations: {
        title: "Search Firewalla Flows",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: Input) => {
      try {
        const params: Record<string, unknown> = { limit: args.limit };
        if (args.query) params.query = args.query;
        if (args.group_by) params.groupBy = args.group_by;
        if (args.sort_by) params.sortBy = args.sort_by;
        if (args.cursor) params.cursor = args.cursor;

        const raw = await client.get<CursorPage<Flow>>("/flows", params);
        const flows = raw.results ?? [];
        const structured = {
          count: flows.length,
          ...(raw.next_cursor ? { next_cursor: raw.next_cursor } : {}),
          flows,
        };
        return formatResult({
          format: args.response_format,
          structured,
          toMarkdown: renderFlowPage,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}

function renderFlowPage(data: { count: number; next_cursor?: string; flows: Flow[] }): string {
  if (data.count === 0) {
    return "No flows match the filter.";
  }
  const lines: string[] = [
    `# Flows (${data.count}${data.next_cursor ? ", more available" : ""})`,
    "",
    "| Timestamp | Dir | Proto | Blocked | Device | Remote | Country | Category | Download | Upload |",
    "| --- | --- | --- | :---: | --- | --- | --- | --- | ---: | ---: |",
  ];
  for (const f of data.flows) {
    lines.push(
      `| ${fmtTimestamp(f.ts)} | ${mdCell(f.direction)} | ${mdCell(
        f.protocol,
      )} | ${yesNo(f.block)} | ${mdCell(
        f.device?.name ?? f.device?.ip,
      )} | ${mdCell(remoteLabel(f))} | ${mdCell(
        f.country ?? f.region,
      )} | ${mdCell(f.category)} | ${fmtBytes(f.download)} | ${fmtBytes(f.upload)} |`,
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

/**
 * Build the "remote" (external-party) label for a flow, taking direction
 * into account: inbound flows expose the remote in `source`, outbound in
 * `destination`. Falls back to the flow-level `domain` when present.
 */
function remoteLabel(f: Flow): string {
  if (f.domain && f.domain.length > 0) return f.domain;
  const remote = f.direction === "inbound" ? f.source : f.destination;
  const name = remote?.name;
  if (name && name.length > 0) {
    return remote?.port ? `${name}:${remote.port}` : name;
  }
  const ip = remote?.ip;
  if (ip && ip.length > 0) {
    return remote?.port ? `${ip}:${remote.port}` : ip;
  }
  return "—";
}
