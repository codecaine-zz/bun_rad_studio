/**
 * Core type definitions for bun-simplcli
 */

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  SILENT = 5,
}

export type LogLevelName = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export enum AlertKind {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  CAUTION = 'caution',
  TIP = 'tip',
  NOTE = 'note',
}

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  DONE = 'done',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum FormFieldKind {
  TEXT = 'text',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  PASSWORD = 'password',
  SELECT = 'select',
}

export interface FormField {
  key: string;
  label: string;
  kind?: FormFieldKind | 'text' | 'number' | 'boolean' | 'password' | 'select';
  defaultVal?: string;
  required?: boolean;
  choices?: string[];
}

export enum PathMode {
  ANY = 'any',
  MUST_EXIST = 'must_exist',
  FILE = 'file',
  DIRECTORY = 'directory',
}

export class TreeNode {
  public label: string;
  public children: TreeNode[];

  constructor(label: string) {
    this.label = label;
    this.children = [];
  }

  public addChild(childLabelOrNode: string | TreeNode): TreeNode {
    if (typeof childLabelOrNode === 'string') {
      const child = new TreeNode(childLabelOrNode);
      this.children.push(child);
      return child;
    } else {
      this.children.push(childLabelOrNode);
      return childLabelOrNode;
    }
  }

  public addNode(child: TreeNode): TreeNode {
    this.children.push(child);
    return child;
  }
}

export interface PipelineStep {
  name: string;
  stepFn: () => boolean | Promise<boolean>;
}

export type FlagKind = 'string' | 'int' | 'float' | 'bool' | 'array';

export interface FlagOption {
  name: string;
  short?: string;
  kind: FlagKind;
  defaultVal?: any;
  desc: string;
  required?: boolean;
  choices?: string[];
}

export interface ExecResult {
  output: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  attempts: number;
}

export interface DiskStats {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  percent: number;
}

export interface FileMetadata {
  path: string;
  name: string;
  sizeBytes: number;
  isDir: boolean;
  isLink: boolean;
  isReadable: boolean;
  isWritable: boolean;
  createdTime: number;
  modifiedTime: number;
}

export interface SimpleHttpResponse {
  statusCode: number;
  body: string;
  url: string;
  headers: Record<string, string>;
}

export interface SimpleURL {
  raw: string;
  scheme: string;
  host: string;
  port: number;
  path: string;
  query: string;
  fragment: string;
}

export type CommandAction = (flags: Record<string, any>, args: string[]) => void | Promise<void>;

export interface CommandDefinition {
  name: string;
  description: string;
  aliases?: string[];
  flags: Map<string, FlagOption>;
  action?: CommandAction;
}

export interface FilePickerOptions {
  baseDir?: string;
  mode?: PathMode;
  extensions?: string[];
  allowHidden?: boolean;
}

export type OutputFormat = 'json' | 'table' | 'kv' | 'markdown' | 'text';

export type ShellType = 'bash' | 'zsh' | 'fish';

