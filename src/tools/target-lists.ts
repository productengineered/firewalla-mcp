/**
 * Target-list tools:
 *
 *   - firewalla_list_target_lists — enumerate block/allow target lists
 *     (both Firewalla-managed and user-defined).
 *   - firewalla_get_target_list — fetch the full `targets` array for one list.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FirewallaClient } from "../firewalla-client.js";
import { errorResult, fmtTimestamp, formatResult, mdCell } from "../formatters.js";
import { responseFormatSchema } from "../schemas.js";
import type { TargetList, TargetListSummary } from "../types.js";

// ---------- firewalla_list_target_lists ----------

const listInputShape = {
  owner: z
    .string()
    .optional()
    .describe(
      "Filter by owner. Common values: 'global' (Firewalla-managed), " +
        "or a specific user id. Omit to list all.",
    ),
  response_format: responseFormatSchema,
};

type ListInput = z.infer<z.ZodObject<typeof listInputShape>>;

// ---------- firewalla_get_target_list ----------

const getInputShape = {
  id: z.string().min(1).describe("Target-list id (from firewalla_list_target_lists)."),
  response_format: responseFormatSchema,
};

type GetInput = z.infer<z.ZodObject<typeof getInputShape>>;

export function registerTargetListTools(server: McpServer, client: FirewallaClient): void {
  server.registerTool(
    "firewalla_list_target_lists",
    {
      title: "List Firewalla Target Lists",
      description: `List the block/allow target lists available on this MSP account — both Firewalla-managed ("global") and user-defined.

Use this to answer:
  - "Which block lists is Firewalla enforcing against?"
  - "Have I added any custom target lists, and what are their owners?"
  - "What categories (ad, tracker, malware, …) are covered?"

This endpoint returns summaries (including target \`count\` per list);
call firewalla_get_target_list for the actual \`targets\` array.

Args:
  - owner (string, optional): Filter by owner (e.g. 'global').
  - response_format ('markdown' | 'json'): Output format (default: markdown).

Returns:
  {
    count: number,             // number of target lists
    targetLists: Array<{
      id: string,
      name: string,
      owner: string,            // "global" | user id
      type?: string,            // e.g. "ad", "tracker", "malware", "custom"
      source?: string,          // upstream feed source (Firewalla-managed lists)
      count?: number,           // number of entries in the list
      blockMode?: string,       // e.g. "dns" | "ip"
      beta?: boolean,
      notes?: string,
      lastUpdated?: number
    }>
  }

Audit framing:
  - Custom lists (owner != global) without notes → undocumented intent.
  - blockMode=dns only, but target includes raw IPs → mismatch, investigate.
  - Zero-count list → may be stale / never populated.`,
      inputSchema: listInputShape,
      annotations: {
        title: "List Firewalla Target Lists",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: ListInput) => {
      try {
        const params: Record<string, unknown> = {};
        if (args.owner) params.owner = args.owner;

        const lists = await client.get<TargetListSummary[]>("/target-lists", params);
        const structured = {
          count: lists.length,
          targetLists: lists,
        };
        return formatResult({
          format: args.response_format,
          structured,
          toMarkdown: renderTargetLists,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "firewalla_get_target_list",
    {
      title: "Get Firewalla Target List",
      description: `Fetch the metadata for a single target list by id.

**MSP API limitation:** For Firewalla-managed lists (owner="firewalla"), the MSP API does NOT return individual target entries — it returns the summary plus the aggregate \`count\`. User-created lists may include a \`targets\` array; if so, we surface it.

Use this to answer:
  - "What's the block mode / source / type of list X?"
  - "When was list X last updated?"
  - "How big is list X?" (use the \`count\` / \`targetCount\` field)

Do NOT use this to answer:
  - "Is domain example.com on list X?" — the entries aren't returned.
  - "Give me the first N entries of list X." — same reason.

Args:
  - id (string, required): Target-list id (from firewalla_list_target_lists).
  - response_format ('markdown' | 'json'): Output format (default: markdown).

Returns:
  {
    id, name, owner, type?, source?, blockMode?, notes?, lastUpdated?,
    count?: number,          // summary count reported by the API
    targetCount: number,     // same as count, or actual targets.length when present
    targets?: string[]       // only populated for user-created lists (rare)
  }`,
      inputSchema: getInputShape,
      annotations: {
        title: "Get Firewalla Target List",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GetInput) => {
      try {
        const list = await client.get<TargetList>(`/target-lists/${encodeURIComponent(args.id)}`);
        // `targets` is rarely returned; fall back to the summary `count`.
        const targetCount = Array.isArray(list.targets) ? list.targets.length : (list.count ?? 0);
        const structured = { ...list, targetCount };
        return formatResult({
          format: args.response_format,
          structured,
          toMarkdown: renderTargetList,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}

function renderTargetLists(data: { count: number; targetLists: TargetListSummary[] }): string {
  if (data.count === 0) {
    return "No target lists match the filter.";
  }
  const lines: string[] = [
    `# Target lists (${data.count})`,
    "",
    "| Name | id | Owner | Type | Block mode | Entries | Last updated | Notes |",
    "| --- | --- | --- | --- | --- | ---: | --- | --- |",
  ];
  for (const t of data.targetLists) {
    lines.push(
      `| ${mdCell(t.name)} | \`${mdCell(t.id)}\` | ${mdCell(t.owner)} | ${mdCell(
        t.type,
      )} | ${mdCell(t.blockMode)} | ${t.count ?? "—"} | ${fmtTimestamp(
        t.lastUpdated,
      )} | ${mdCell(t.notes)} |`,
    );
  }
  return lines.join("\n");
}

function renderTargetList(data: TargetList & { targetCount: number }): string {
  const lines: string[] = [
    `# ${data.name} (\`${data.id}\`)`,
    "",
    `- **Owner**: ${mdCell(data.owner)}`,
    `- **Type**: ${mdCell(data.type)}`,
    `- **Block mode**: ${mdCell(data.blockMode)}`,
    `- **Source**: ${mdCell(data.source)}`,
    `- **Last updated**: ${fmtTimestamp(data.lastUpdated)}`,
    `- **Target count**: ${data.targetCount}`,
  ];
  if (data.notes) lines.push(`- **Notes**: ${mdCell(data.notes)}`);

  const targets = Array.isArray(data.targets) ? data.targets : undefined;
  const SHOW = 500;
  lines.push("", "## Targets");
  if (targets === undefined) {
    lines.push(
      "_Target entries are not returned by the Firewalla MSP API for this list " +
        "(Firewalla-managed lists only expose the aggregate `count`)._",
    );
  } else if (targets.length === 0) {
    lines.push("_empty_");
  } else {
    for (const t of targets.slice(0, SHOW)) {
      lines.push(`- \`${mdCell(t)}\``);
    }
    if (targets.length > SHOW) {
      lines.push(
        "",
        `_(showing first ${SHOW} of ${targets.length}; request response_format='json' for the full list)_`,
      );
    }
  }
  return lines.join("\n");
}
