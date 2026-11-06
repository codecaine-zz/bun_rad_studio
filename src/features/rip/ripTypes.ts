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
}

/**
 * Persistent JSON manifest stored in the graveyard directory tracking all buried items.
 */
export interface GraveyardManifest {
  version: number;
  records: GraveyardRecord[];
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
}
