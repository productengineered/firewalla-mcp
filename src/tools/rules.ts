/**
 * firewalla_list_rules — audit configured block/allow rules.
 *
 * Read-only: this tool does NOT pause/resume/edit rules. The user's scope
 * for this MCP server is strictly query-and-observe.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FirewallaClient } from "../firewalla-client.js";
import { errorResult, fmtTimestamp, formatResult, mdCell } from "../formatters.js";
import { querySchema, responseFormatSchema } from "../schemas.js";
import type { Rule } from "../types.js";

const inputShape = {
  query: querySchema,
  response_format: responseFormatSchema,
};

type Input = z.infer<z.ZodObject<typeof inputShape>>;

export function registerRuleTools(server: McpServer, client: FirewallaClient): void {
  server.registerTool(
    "firewalla_list_rules",
    {
      title: "List Firewalla Rules",
      description: `Audit configured block / allow rules. Read-only — this tool does NOT pause, resume, create, or modify rules.

Use this to answer:
  - "Do I have any allow rules that bypass Firewalla's default blocks?"
  - "Which rules haven't fired in 90 days (candidates to remove)?"
  - "Are my block rules scoped to the right device/group?"
  - "Any rules with action=allow and broad scope?"

Args:
  - query (string, optional): Firewalla query-grammar filter (pass-through).
    Examples: \`action:allow\`, \`status:paused\`, \`target.type:domain\`.
  - response_format ('markdown' | 'json'): Output format (default: markdown).

Returns:
  {
    count: number,
    rules: Array<{
      id: string,
      gid: string,
      action: string,       // "block" | "allow" | "time_limit" | …
      direction?: string,   // "outbound" | "inbound" | "bidirection"
      status?: string,      // "active" | "paused" | "disabled"
      target: { type, value, dnsOnly?, port? },
      scope?: { type?, value? },
      notes?: string,
      hit?: { count?, lastHitTs? },
      ts?: number,
      updateTs?: number
    }>
  }

Audit framing:
  - action=allow with scope=global → overly permissive, investigate.
  - status=paused with no notes → someone disabled a rule and didn't document why.
  - hit.count=0 & old updateTs → stale rule, candidate for removal.`,
      inputSchema: inputShape,
      annotations: {
        title: "List Firewalla Rules",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: Input) => {
      try {
        const params: Record<string, unknown> = {};
        if (args.query) params.query = args.query;

        // The MSP /v2/rules endpoint may return either a bare array or a
        // { count, results } envelope depending on version — handle both.
        const raw = await client.get<unknown>("/rules", params);
        const rules = normalizeRules(raw);

        const structured = {
          count: rules.length,
          rules,
        };
        return formatResult({
          format: args.response_format,
          structured,
          toMarkdown: renderRules,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}

function normalizeRules(raw: unknown): Rule[] {
  if (Array.isArray(raw)) return raw as Rule[];
  if (raw && typeof raw === "object") {
    const envelope = raw as { results?: unknown; rules?: unknown };
    if (Array.isArray(envelope.results)) return envelope.results as Rule[];
    if (Array.isArray(envelope.rules)) return envelope.rules as Rule[];
  }
  return [];
}

function renderRules(data: { count: number; rules: Rule[] }): string {
  if (data.count === 0) {
    return "No rules match the filter.";
  }
  const lines: string[] = [
    `# Firewalla rules (${data.count})`,
    "",
    "| Action | Direction | Status | Target | Scope | Hits | Last hit | Notes |",
    "| --- | --- | --- | --- | --- | ---: | --- | --- |",
  ];
  for (const r of data.rules) {
    const target = `${mdCell(r.target.type)}:${mdCell(r.target.value)}${
      r.target.port ? `:${r.target.port}` : ""
    }`;
    const scope = r.scope
      ? `${mdCell(r.scope.type)}${r.scope.value ? `:${mdCell(r.scope.value)}` : ""}`
      : "—";
    lines.push(
      `| ${mdCell(r.action)} | ${mdCell(r.direction)} | ${mdCell(
        r.status,
      )} | ${target} | ${scope} | ${r.hit?.count ?? 0} | ${fmtTimestamp(
        r.hit?.lastHitTs,
      )} | ${mdCell(r.notes)} |`,
    );
  }
  return lines.join("\n");
}
