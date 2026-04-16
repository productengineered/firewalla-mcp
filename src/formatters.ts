/**
 * Response-formatting helpers shared by every tool handler.
 *
 * Every tool builds its own `structuredContent` record and a markdown
 * renderer, then hands them to {@link formatResult}. This centralizes:
 * - JSON vs markdown branching
 * - `CHARACTER_LIMIT` enforcement with an actionable truncation note
 * - error → tool-result conversion that keeps the agent informed
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CHARACTER_LIMIT } from "./constants.js";
import { FirewallaApiError } from "./firewalla-client.js";
import { ResponseFormat } from "./schemas.js";

/** A structured tool payload — must be a record so it maps to `structuredContent`. */
export type StructuredPayload = Record<string, unknown>;

export interface FormatOptions<T extends StructuredPayload> {
  /** Requested output format. */
  format: ResponseFormat;
  /** Structured data — returned verbatim in `structuredContent` for JSON clients. */
  structured: T;
  /** Renderer that produces a human-readable markdown string from the same data. */
  toMarkdown: (data: T) => string;
}

/**
 * Build a successful {@link CallToolResult} in the requested format, with
 * character-limit truncation applied to the text block.
 */
export function formatResult<T extends StructuredPayload>(opts: FormatOptions<T>): CallToolResult {
  const rawText =
    opts.format === ResponseFormat.MARKDOWN
      ? opts.toMarkdown(opts.structured)
      : JSON.stringify(opts.structured, null, 2);

  const { text, truncated } = truncate(rawText);

  const structuredContent: StructuredPayload = truncated
    ? { ...opts.structured, _truncated: true, _truncation_note: TRUNCATION_NOTE }
    : opts.structured;

  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

/** Convert any thrown error into an `isError: true` tool result. */
export function errorResult(err: unknown): CallToolResult {
  const text =
    err instanceof FirewallaApiError
      ? `Error: ${err.toToolMessage()}`
      : `Error: ${err instanceof Error ? err.message : String(err)}`;

  return {
    isError: true,
    content: [{ type: "text", text }],
  };
}

const TRUNCATION_NOTE =
  `Response truncated to ${CHARACTER_LIMIT} characters. ` +
  "Narrow the results with a smaller `limit`, a more specific `query`, " +
  "or paginate with `cursor` (flows/alarms only).";

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= CHARACTER_LIMIT) {
    return { text, truncated: false };
  }
  // Leave room for the truncation note + separator.
  const headroom = TRUNCATION_NOTE.length + 32;
  const keep = Math.max(0, CHARACTER_LIMIT - headroom);
  return {
    text: `${text.slice(0, keep)}\n\n--- truncated ---\n${TRUNCATION_NOTE}`,
    truncated: true,
  };
}

// ---------- markdown building blocks shared across tool renderers ----------

/**
 * Format a YES/NO/UNKNOWN cell for audit tables. Used for things like
 * "online", "blocked", "encrypted" where the answer is tri-state.
 */
export function yesNo(value: boolean | null | undefined): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "—";
}

/** Format a unix epoch seconds timestamp as ISO-8601 (UTC). */
export function fmtTimestamp(ts: number | null | undefined): string {
  if (ts == null || Number.isNaN(ts)) return "—";
  const ms = ts > 1e12 ? ts : ts * 1000; // handle both seconds and ms
  return new Date(ms).toISOString();
}

/** Format a byte count as a human-readable string (KiB/MiB/GiB/TiB). */
export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB", "PiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(2)} ${units[unit]}`;
}

/**
 * Escape a cell value for inclusion in a GFM table. Replaces pipes and
 * newlines so the table stays well-formed.
 */
export function mdCell(value: unknown): string {
  if (value == null) return "—";
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
