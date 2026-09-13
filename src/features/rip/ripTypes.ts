export interface GraveyardRecord {
  id: string;
  originalPath: string;
  graveyardPath: string;
  deletedAt: string;
  isDirectory: boolean;
  size: number;
}

export interface GraveyardManifest {
  version: number;
  records: GraveyardRecord[];
}

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
