/**
 * HTTP client for the Firewalla MSP API.
 *
 * Responsibilities:
 * - Inject the `Authorization: Token <token>` header on every request
 * - Normalize errors into actionable {@link FirewallaApiError} messages that
 *   tell the agent what to try next (rotate token, check gid, slow down…)
 * - Keep tool implementations free of HTTP plumbing
 *
 * This client is read-only: it only exposes `get()`. If the scope ever
 * widens, add new methods explicitly — don't bolt on a generic `request()`.
 */

import axios, { type AxiosInstance } from "axios";
import type { FirewallaConfig } from "./config.js";
import { REQUEST_TIMEOUT_MS } from "./constants.js";

/**
 * Error type raised for every failed Firewalla MSP API call. Its message
 * is safe to surface directly in a tool result — `suggestion` tells the
 * agent what to do next.
 */
export class FirewallaApiError extends Error {
  public readonly status: number | undefined;
  public readonly suggestion: string | undefined;

  constructor(message: string, options: { status?: number; suggestion?: string } = {}) {
    super(message);
    this.name = "FirewallaApiError";
    this.status = options.status;
    this.suggestion = options.suggestion;
  }

  /** Single-line message suitable for a tool result body. */
  toToolMessage(): string {
    return this.suggestion ? `${this.message} ${this.suggestion}` : this.message;
  }
}

/**
 * Thin Firewalla MSP API client. Construct once at server startup and reuse
 * across tool calls (axios keeps a keep-alive agent internally).
 */
export class FirewallaClient {
  private readonly http: AxiosInstance;

  constructor(config: FirewallaConfig) {
    this.http = axios.create({
      baseURL: `https://${config.domain}/v2`,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Authorization: `Token ${config.token}`,
        Accept: "application/json",
      },
    });
  }

  /**
   * GET a Firewalla MSP API path relative to `/v2`.
   *
   * @throws {@link FirewallaApiError} on any non-2xx response or transport error.
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    try {
      const response = await this.http.get<T>(path, {
        params: stripUndefined(params),
      });
      return response.data;
    } catch (err) {
      throw mapError(err);
    }
  }
}

/** Strip undefined values so axios doesn't serialize `?foo=undefined`. */
function stripUndefined(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Convert any thrown error from axios into a {@link FirewallaApiError} with
 * an actionable suggestion. Security-audit framing: errors should help the
 * agent recover, not dump stack traces.
 */
function mapError(err: unknown): FirewallaApiError {
  if (!axios.isAxiosError(err)) {
    return new FirewallaApiError(
      `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Request never reached the server (DNS, connection, timeout).
  if (!err.response) {
    if (err.code === "ECONNABORTED") {
      return new FirewallaApiError(
        `Firewalla MSP request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`,
        {
          suggestion: "Retry, or narrow the query with a smaller `limit` / more specific `query`.",
        },
      );
    }
    if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") {
      return new FirewallaApiError(`Cannot resolve Firewalla MSP domain: ${err.message}`, {
        suggestion:
          "Verify FIREWALLA_MSP_DOMAIN points at your MSP subdomain (e.g. yourname.firewalla.net).",
      });
    }
    return new FirewallaApiError(
      `Firewalla MSP request failed before reaching the server: ${err.message}`,
      {
        suggestion: "Check network connectivity and FIREWALLA_MSP_DOMAIN, then retry.",
      },
    );
  }

  const status = err.response.status;
  const detail = extractDetail(err.response.data) ?? err.message;

  switch (status) {
    case 401:
      return new FirewallaApiError("Firewalla MSP rejected the token (401 Unauthorized).", {
        status,
        suggestion:
          "Verify FIREWALLA_MSP_TOKEN is valid and hasn't been revoked in the MSP portal → Account Settings → Personal Access Tokens. Rotate if needed.",
      });
    case 403:
      return new FirewallaApiError("Firewalla MSP denied access (403 Forbidden).", {
        status,
        suggestion:
          "Confirm the token's role has read access to this resource, or that the target box is linked to the MSP account.",
      });
    case 404:
      return new FirewallaApiError(`Firewalla MSP resource not found (404): ${detail}`, {
        status,
        suggestion:
          "Call `firewalla_list_boxes` to list available gids, or `firewalla_search_alarms` to find a valid alarm id before retrying.",
      });
    case 429:
      return new FirewallaApiError("Firewalla MSP rate limit exceeded (429).", {
        status,
        suggestion:
          "Wait a few seconds before retrying, and prefer smaller `limit` values to stay under the quota.",
      });
    default:
      return new FirewallaApiError(`Firewalla MSP request failed (${status}): ${detail}`, {
        status,
      });
  }
}

/** Pull a human-readable detail string out of an arbitrary error body. */
function extractDetail(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "msg"]) {
      const value = obj[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  return undefined;
}
