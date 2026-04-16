/**
 * Firewalla MSP API response types.
 *
 * These interfaces describe the shapes returned by the MSP API as documented
 * at https://docs.firewalla.net/api-reference/. Fields not always present are
 * marked optional. We intentionally do NOT runtime-validate these with Zod:
 * the API is a trusted upstream, and schema drift surfaces as a missing field
 * in the markdown rendering rather than a hard server error.
 */

export interface FirewallaGroup {
  id: string;
  name: string;
}

export interface FirewallaNetwork {
  id: string;
  name: string;
}

// ---------- Box ----------

export interface Box {
  gid: string;
  name: string;
  model: string;
  mode: string;
  version: string;
  online: boolean;
  publicIP?: string;
  /** Not always returned by the MSP API — surfaces as "—" in markdown when absent. */
  lastSeen?: number;
  license?: string;
  location?: string;
  group?: FirewallaGroup;
  deviceCount: number;
  ruleCount: number;
  alarmCount: number;
}

// ---------- Device ----------

export interface Device {
  id: string;
  gid: string;
  name: string;
  ip: string;
  ipReserved?: boolean;
  mac?: string;
  macVendor?: string;
  online: boolean;
  network?: FirewallaNetwork;
  deviceType?: string;
  isRouter?: boolean;
  isFirewalla?: boolean;
  monitoring?: boolean;
  totalDownload?: number;
  totalUpload?: number;
}

// ---------- Flow ----------

export interface FlowEndpoint {
  id?: string;
  ip?: string;
  name?: string;
  port?: number;
}

export interface Flow {
  ts: number;
  gid: string;
  protocol: string;
  direction: string;
  block?: boolean;
  blockType?: string;
  download?: number;
  upload?: number;
  /** Aggregate of download + upload when returned by the API. */
  total?: number;
  duration?: number;
  count?: number;
  device?: {
    id: string;
    ip?: string;
    name?: string;
    network?: FirewallaNetwork;
  };
  source?: FlowEndpoint;
  destination?: FlowEndpoint;
  /** Top-level fields in the MSP response (not nested under destination). */
  country?: string;
  region?: string;
  domain?: string;
  category?: string;
}

// ---------- Alarm ----------

export interface AlarmDevice {
  id?: string;
  name?: string;
  ip?: string;
}

export interface AlarmRemote {
  ip?: string;
  name?: string;
  country?: string;
  region?: string;
  category?: string;
}

export interface Alarm {
  /** The MSP API returns numeric alarm ids; tools accept either form and coerce. */
  aid: number | string;
  gid: string;
  type: number | string;
  ts: number;
  message: string;
  /** Numeric status code in observed responses (1=active). */
  status?: number | string;
  device?: AlarmDevice;
  remote?: AlarmRemote;
  // Full-detail endpoint may return additional fields we surface verbatim.
  [key: string]: unknown;
}

// ---------- Rule ----------

export interface RuleTarget {
  type: string;
  value: string;
  dnsOnly?: boolean;
  port?: string;
}

export interface RuleScope {
  type?: string;
  value?: string;
}

export interface RuleHit {
  count?: number;
  lastHitTs?: number;
}

export interface Rule {
  id: string;
  gid: string;
  action: string;
  direction?: string;
  status?: string;
  target: RuleTarget;
  scope?: RuleScope;
  notes?: string;
  hit?: RuleHit;
  ts?: number;
  updateTs?: number;
}

// ---------- Target lists ----------

export interface TargetListSummary {
  id: string;
  name: string;
  owner: string;
  /** Target list type/category, e.g. "ad", "tracker", "malware", "custom". */
  type?: string;
  /** Upstream source (e.g. firewalla-managed feed name) when present. */
  source?: string;
  /** Number of entries in the list — returned in the summary, no need for a detail call. */
  count?: number;
  blockMode?: string;
  beta?: boolean;
  notes?: string;
  lastUpdated?: number;
}

export interface TargetList extends TargetListSummary {
  /**
   * The Firewalla MSP API does NOT return the individual target entries for
   * Firewalla-managed lists — only the aggregate `count`. Some user-created
   * lists may include this field. Treat as optional and fall back to `count`.
   */
  targets?: string[];
}

// ---------- Cursor-paginated response (flows/alarms) ----------

export interface CursorPage<T> {
  results?: T[];
  next_cursor?: string;
  count?: number;
}
