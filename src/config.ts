/**
 * Environment-variable loading and validation for firewalla-mcp-server.
 *
 * Claude Desktop / Claude Code pass these via the server's `env` block when
 * launching us over stdio. For local dev, source your `.env` before running:
 *
 *     set -a; source .env; set +a
 *     npm run dev
 */

export interface FirewallaConfig {
  /** MSP subdomain, e.g. `yourname.firewalla.net` (no protocol, no trailing slash). */
  domain: string;
  /** Personal access token from MSP → Account Settings → Personal Access Tokens. */
  token: string;
}

/**
 * Read FIREWALLA_MSP_DOMAIN + FIREWALLA_MSP_TOKEN from the environment.
 * Throws with an actionable message if either is missing.
 */
export function loadConfig(): FirewallaConfig {
  const rawDomain = process.env.FIREWALLA_MSP_DOMAIN;
  const token = process.env.FIREWALLA_MSP_TOKEN;

  const missing: string[] = [];
  if (!rawDomain) missing.push("FIREWALLA_MSP_DOMAIN");
  if (!token) missing.push("FIREWALLA_MSP_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Set them in your MCP client config (Claude Desktop: claude_desktop_config.json, ` +
        `Claude Code: .mcp.json), or for local dev source your .env first with ` +
        `\`set -a; source .env; set +a\`.`,
    );
  }

  // Accept either `yourname.firewalla.net` or `https://yourname.firewalla.net/`
  // and normalize to the bare host.
  const domain = rawDomain!
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .toLowerCase();

  // Validate that the domain is a Firewalla MSP host — prevents the token
  // from being sent to an arbitrary server if the env var is misconfigured.
  if (domain !== "firewalla.net" && !domain.endsWith(".firewalla.net")) {
    throw new Error(
      `FIREWALLA_MSP_DOMAIN must be a *.firewalla.net host, got "${domain}". ` +
        `Expected format: yourname.firewalla.net`,
    );
  }

  return { domain, token: token! };
}
