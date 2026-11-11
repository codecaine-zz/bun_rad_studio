/**
 * Type definitions for the `rip` (rm-improved) safe file deletion feature,
 * including graveyard records, manifest schemas, and CLI execution options.
 */

/**
 * Metadata for a single file or directory moved into the graveyard.
 */
export interface GraveyardRecord {
  id: string;
  originalPath: string;
  graveyardPath: string;
  deletedAt: string;
  isDirectory: boolean;
  size: number;
  [key: string]: unknown;
}

/**
 * Persistent JSON manifest stored in the graveyard directory tracking all buried items.
 * Supports both `records` and `rip_engine.ts`'s `items` format for cross-tool compatibility.
 */
export interface GraveyardManifest {
  version: number | string;
  graveyardRoot?: string;
  lastUpdated?: string;
  records: GraveyardRecord[];
  items?: Array<Record<string, unknown>>;
}

/**
 * Configuration options for executing a `rip` command or graveyard operation.
 */
export interface RipOptions {
  targets: string[];
  unbury: boolean;
  unburyTarget?: string;
  seance: boolean;
  decompose: boolean;
  permanent: boolean;
  verbose: boolean;
  graveyardDir?: string;
  infoTarget?: string;
  pruneDays?: number;
  dryRun?: boolean;
  showSize?: boolean;
  force?: boolean;
}
