/**
 * Shared constants for firewalla-mcp-server.
 */

export const SERVER_NAME = "firewalla-mcp-server";
export const SERVER_VERSION = "0.1.0";

/**
 * Maximum characters in a single tool response body before the formatter
 * truncates and appends an actionable note. Keeps large flow/alarm dumps
 * from blowing out the agent's context window.
 */
export const CHARACTER_LIMIT = 25_000;

/** Default page size for cursor-paginated endpoints (flows, alarms). */
export const DEFAULT_PAGE_LIMIT = 200;

/** Hard cap on page size per the MSP API docs. */
export const MAX_PAGE_LIMIT = 500;

/** HTTP timeout for Firewalla MSP API requests (ms). */
export const REQUEST_TIMEOUT_MS = 30_000;
