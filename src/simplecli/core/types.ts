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
  ok?: boolean;
  status?: number;
  statusText?: string;
  data?: any;
  durationMs?: number;
}

export interface BackendResponse<T = any> extends SimpleHttpResponse {
  ok: boolean;
  status: number;
  statusCode: number;
  statusText: string;
  data: T;
  body: string;
  url: string;
  headers: Record<string, string>;
  durationMs: number;
  attempts: number;
  cached: boolean;
  json<U = T>(): U;
  text(): string;
  header(name: string): string | undefined;
}

export interface BackendRequestContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
}

export type RequestInterceptor = (
  ctx: BackendRequestContext
) => BackendRequestContext | void | Promise<BackendRequestContext | void>;

export type ResponseInterceptor<T = any> = (
  res: BackendResponse<T>,
  ctx: BackendRequestContext
) => BackendResponse<T> | void | Promise<BackendResponse<T> | void>;

export type ErrorInterceptor = (
  err: Error,
  ctx: BackendRequestContext
) => void | Promise<void>;

export interface BackendClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  query?: Record<string, any>;
  bearerToken?: string;
  basicAuth?: { username: string; password?: string } | string;
  apiKey?: string;
  apiKeyHeader?: string;
  timeoutMs?: number;
  retries?: number;
  retryBackoffMs?: number;
  retryStatusCodes?: number[];
  throwOnError?: boolean;
  vars?: Record<string, string>;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  allowCrossOriginAuth?: boolean;
  rateLimit?: {
    maxRequests: number;
    windowMs?: number;
  };
}

export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
  timeoutMs?: number;
  retries?: number;
  retryBackoffMs?: number;
  retryDelayMs?: number;
  retryStatusCodes?: number[];
  throwOnError?: boolean;
  vars?: Record<string, string>;
  cache?: boolean;
  cacheTtlMs?: number;
  fallback?: any;
  redactSecrets?: boolean;
  maxDownloadBytes?: number;
  signal?: AbortSignal;
}

export interface SafeApiResult<T = any> {
  ok: boolean;
  data: T | null;
  error: string | null;
  statusCode: number;
  durationMs: number;
  response: BackendResponse<T> | null;
}

export interface GraphQLErrorItem {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: Record<string, any>;
}

export interface GraphQLResult<T = any> {
  ok: boolean;
  data: T | null;
  errors?: GraphQLErrorItem[];
  statusCode: number;
  durationMs: number;
  headers: Record<string, string>;
}

export interface SseEvent {
  id?: string;
  event: string;
  data: string;
  retry?: number;
  json<T = any>(): T | null;
}

export interface PaginationOptions<T = any> {
  mode?: 'page' | 'offset' | 'cursor' | 'link';
  pageParam?: string;
  offsetParam?: string;
  limitParam?: string;
  cursorParam?: string;
  pageSize?: number;
  startPage?: number;
  maxPages?: number;
  query?: Record<string, any>;
  headers?: Record<string, string>;
  extractItems?: (data: any, response: BackendResponse<any>) => T[];
  extractNextCursor?: (data: any, response: BackendResponse<any>) => string | null | undefined;
}

export interface HealthCheckResult {
  healthy: boolean;
  statusCode: number;
  latencyMs: number;
  url: string;
  data: any;
  error?: string;
}

export interface EndpointProbeResult {
  url: string;
  ok: boolean;
  statusCode: number;
  latencyMs: number;
  error?: string;
}

export interface BenchmarkOptions {
  requests?: number;
  concurrency?: number;
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface BenchmarkStats {
  url: string;
  method: string;
  requests: number;
  successful: number;
  failed: number;
  successRate: number;
  totalMs: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  rps: number;
}

export type UploadFileInput =
  | string
  | Uint8Array
  | Blob
  | {
      path?: string;
      data?: string | Uint8Array | Blob;
      filename?: string;
      contentType?: string;
    };

export interface BatchRequestItem {
  method?: string;
  path: string;
  body?: any;
  options?: RequestOptions;
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

