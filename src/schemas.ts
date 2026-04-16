/**
 * Shared Zod schemas reused across tool input definitions.
 *
 * Keeping these here (instead of duplicating inline on every tool) enforces
 * consistent behavior for `response_format`, cursor pagination, and the
 * pass-through `query` parameter the Firewalla MSP API uses on flows/alarms.
 */

import { z } from "zod";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "./constants.js";

/** Response format: machine-readable JSON or human-readable markdown. */
export enum ResponseFormat {
  JSON = "json",
  MARKDOWN = "markdown",
}

/**
 * Zod schema for the `response_format` input field. Markdown is the default
 * because our primary user is Claude acting as a security auditor — tables
 * and headers surface findings better than raw JSON.
 */
export const responseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe(
    "Output format. 'markdown' (default) renders human-readable audit tables. " +
      "'json' returns structured data suitable for chaining into another tool call.",
  );

/**
 * Cursor-pagination fields for flows/alarms search endpoints.
 *
 * The Firewalla MSP API returns a `next_cursor` that the caller echoes back
 * on the following request. First request omits `cursor`.
 */
export const cursorPaginationSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_LIMIT)
    .default(DEFAULT_PAGE_LIMIT)
    .describe(
      `Maximum results per page (1–${MAX_PAGE_LIMIT}, default ${DEFAULT_PAGE_LIMIT}). ` +
        `Smaller values are recommended when auditing — easier to review.`,
    ),
  cursor: z
    .string()
    .optional()
    .describe(
      "Pagination cursor echoed from a prior response's `next_cursor`. " +
        "Omit for the first page.",
    ),
};

/**
 * Optional `query` pass-through. The Firewalla MSP API defines its own query
 * grammar documented at https://docs.firewalla.net/search/. We pass the
 * string through unmodified so the agent can use the full grammar.
 */
export const querySchema = z
  .string()
  .optional()
  .describe(
    "Firewalla query string (pass-through). See Firewalla docs for the grammar — " +
      "supports filters like `device.mac:AA:BB:CC:DD:EE:FF`, `blocked:true`, " +
      "`region:CN`, `ts:>1700000000`, etc. Omit to match everything.",
  );

/** Shared sort-by field (flows/alarms). Default is descending by timestamp. */
export const sortBySchema = z
  .string()
  .optional()
  .describe(
    "Sort expression. Format: `<field>:<asc|desc>`. Common: `ts:desc` (default, " +
      "newest first), `ts:asc` (oldest first), `download:desc` (biggest flows first).",
  );

/** Shared group-by field (flows/alarms). */
export const groupBySchema = z
  .string()
  .optional()
  .describe(
    "Group results by one or more fields (comma-separated). Examples: `device`, " +
      "`device,domain`, `region`. When set, results are aggregated per group.",
  );
