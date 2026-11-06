/**
 * Core data models and CLI option interfaces for the `subfinder` passive/active subdomain discovery tool.
 */

/**
 * Discovered subdomain entry enriched with OSINT provenance sources, resolved IPs, HTTP probe metadata, and open ports.
 */
export interface SubdomainResult {
  host: string;
  sources: string[];
  ip?: string[];
  httpStatus?: number;
  httpTitle?: string;
  openPorts?: number[];
  isWildcard?: boolean;
  /** Which scheme answered the HTTP check (set by the engine in subfinderEngine.ts). */
  httpScheme?: "http" | "https";
  /** A plain-words remark about the host (a redirect, a refused private address ...). */
  note?: string;
}

/**
 * Parsed command-line options controlling target domains, active DNS/HTTP/port probing, timeouts, and output formats.
 */
export interface SubfinderOptions {
  domains: string[];
  sources?: string[];
  active: boolean;
  probe: boolean;
  silent: boolean;
  json: boolean;
  outputFile?: string;
  timeoutMs: number;
  ports?: number[];
  detectWildcard?: boolean;
}
