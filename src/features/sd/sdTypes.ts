export interface SdOptions {
  findPattern: string;
  replacePattern: string;
  files: string[];
  stringMode: boolean;
  flags: string;
  preview: boolean;
  countOnly?: boolean;
  ignoreCase?: boolean;
  backupExt?: string;
  wholeWord?: boolean;
  quiet?: boolean;
}

export interface DiffHunk {
  lineNumber: number;
  original: string;
  modified: string;
}

export interface FileTransformResult {
  filePath: string;
  hasChanged: boolean;
  originalContent: string;
  newContent: string;
  diffHunks: DiffHunk[];
}
