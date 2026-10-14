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

