/**
 * Core type definitions for bun-simplcli
 */

/** Numeric severity levels for `Logger` filtering. */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  SILENT = 5,
}

/** Case-insensitive string names corresponding to `LogLevel` values. */
export type LogLevelName =
  "trace" | "debug" | "info" | "warn" | "error" | "silent";

/** Visual callout styles for terminal alert boxes. */
export enum AlertKind {
  INFO = "info",
  SUCCESS = "success",
  WARNING = "warning",
  CAUTION = "caution",
  TIP = "tip",
  NOTE = "note",
}

/** Execution status states for terminal task list items. */
export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  DONE = "done",
  FAILED = "failed",
  SKIPPED = "skipped",
}

/** Supported input control types for interactive CLI form wizards. */
export enum FormFieldKind {
  TEXT = "text",
  NUMBER = "number",
  BOOLEAN = "boolean",
  PASSWORD = "password",
  SELECT = "select",
}

/** Schema definition for a single field in an interactive CLI form wizard. */
export interface FormField {
  key: string;
  label: string;
  kind?: FormFieldKind | "text" | "number" | "boolean" | "password" | "select";
  defaultVal?: string;
  required?: boolean;
  choices?: string[];
}

/** Filesystem validation modes for interactive path prompts and file pickers. */
export enum PathMode {
  ANY = "any",
  MUST_EXIST = "must_exist",
  FILE = "file",
  DIRECTORY = "directory",
}

/** Hierarchical tree node used for rendering ASCII/Unicode tree views in the terminal. */
export class TreeNode {
  public label: string;
  public children: TreeNode[];

  /** Creates a new `TreeNode` with the given display label and an empty child list. */
  constructor(label: string) {
    this.label = label;
    this.children = [];
  }

  /** Appends a child node (created from a label string or passed as a `TreeNode`) and returns the child. */
  public addChild(childLabelOrNode: string | TreeNode): TreeNode {
    if (typeof childLabelOrNode === "string") {
      const child = new TreeNode(childLabelOrNode);
      this.children.push(child);
      return child;
    } else {
      this.children.push(childLabelOrNode);
      return childLabelOrNode;
    }
  }

  /** Appends an existing `TreeNode` as a child and returns it. */
  public addNode(child: TreeNode): TreeNode {
    this.children.push(child);
    return child;
  }
}

/** Named execution step within a `Pipeline`. */
export interface PipelineStep {
  name: string;
  stepFn: () => boolean | Promise<boolean>;
}

/** Supported data types for CLI command-line flags. */
export type FlagKind = "string" | "int" | "float" | "bool" | "array";

/** Configuration metadata for a registered CLI command-line flag. */
export interface FlagOption {
  name: string;
  short?: string;
  kind: FlagKind;
  defaultVal?: any;
  desc: string;
  required?: boolean;
  choices?: string[];
}

/** Result returned by shell command execution helpers in `Sys`. */
export interface ExecResult {
  output: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  attempts: number;
}

/** Filesystem disk space statistics in bytes and usage percentage. */
export interface DiskStats {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  percent: number;
}

/** Detailed file or directory metadata returned by `Sys.fileMetadata`. */
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

/** Lightweight HTTP response structure returned by basic HTTP helpers. */
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

/** Rich HTTP response returned by `BackendClient` with parsed data, timing, retry count, and helper accessors. */
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

/** Outgoing HTTP request context passed to request, response, and error interceptors. */
export interface BackendRequestContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
}

/** Interceptor function invoked before sending an HTTP request, optionally returning a modified context. */
export type RequestInterceptor = (
  ctx: BackendRequestContext,
) => BackendRequestContext | void | Promise<BackendRequestContext | void>;

/** Interceptor function invoked after receiving an HTTP response, optionally returning a modified response. */
export type ResponseInterceptor<T = any> = (
  res: BackendResponse<T>,
  ctx: BackendRequestContext,
) => BackendResponse<T> | void | Promise<BackendResponse<T> | void>;

/** Interceptor function invoked when an HTTP request fails with an error. */
export type ErrorInterceptor = (
  err: Error,
  ctx: BackendRequestContext,
) => void | Promise<void>;

/** Configuration options for constructing a `BackendClient` instance. */
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

/** Per-request override options for `BackendClient` HTTP calls. */
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

/** Non-throwing result envelope returned by `BackendClient.tryRequest` and related `try*` methods. */
export interface SafeApiResult<T = any> {
  ok: boolean;
  data: T | null;
  error: string | null;
  statusCode: number;
  durationMs: number;
  response: BackendResponse<T> | null;
}

/** Standard GraphQL error entry returned in a GraphQL response payload. */
export interface GraphQLErrorItem {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: Record<string, any>;
}

/** Parsed response envelope returned by `BackendClient.graphql`. */
export interface GraphQLResult<T = any> {
  ok: boolean;
  data: T | null;
  errors?: GraphQLErrorItem[];
  statusCode: number;
  durationMs: number;
  headers: Record<string, string>;
}

/** Parsed Server-Sent Event (SSE) message frame yielded by `BackendClient.streamSse`. */
export interface SseEvent {
  id?: string;
  event: string;
  data: string;
  retry?: number;
  json<T = any>(): T | null;
}

/** Options controlling automatic pagination in `BackendClient.paginate` and `BackendClient.fetchAllPages`. */
export interface PaginationOptions<T = any> {
  mode?: "page" | "offset" | "cursor" | "link";
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
  extractNextCursor?: (
    data: any,
    response: BackendResponse<any>,
  ) => string | null | undefined;
}

/** Result of probing a service health endpoint via `BackendClient.healthCheck`. */
export interface HealthCheckResult {
  healthy: boolean;
  statusCode: number;
  latencyMs: number;
  url: string;
  data: any;
  error?: string;
}

/** Connectivity and latency result for a single URL tested by `BackendClient.probeEndpoints`. */
export interface EndpointProbeResult {
  url: string;
  ok: boolean;
  statusCode: number;
  latencyMs: number;
  error?: string;
}

/** Load parameters for benchmarking an HTTP endpoint via `BackendClient.benchmark`. */
export interface BenchmarkOptions {
  requests?: number;
  concurrency?: number;
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** Aggregated latency percentiles, success rate, and throughput from `BackendClient.benchmark`. */
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

/** File payload specification accepted by `BackendClient.upload` for multipart uploads. */
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

/** Single HTTP request item in a `BackendClient.batch` execution list. */
export interface BatchRequestItem {
  method?: string;
  path: string;
  body?: any;
  options?: RequestOptions;
}

/** Decomposed URL components returned by `Stdlib.parseUrl`. */
export interface SimpleURL {
  raw: string;
  scheme: string;
  host: string;
  port: number;
  path: string;
  query: string;
  fragment: string;
}

/** Callback handler invoked when a registered CLI command or subcommand is executed. */
export type CommandAction = (
  flags: Record<string, any>,
  args: string[],
) => void | Promise<void>;

/** Metadata and flag definitions for a registered `SimpleCLI` subcommand. */
export interface CommandDefinition {
  name: string;
  description: string;
  aliases?: string[];
  flags: Map<string, FlagOption>;
  action?: CommandAction;
}

/** Filtering and navigation options for the interactive terminal file picker (`Prompts.filePicker`). */
export interface FilePickerOptions {
  baseDir?: string;
  mode?: PathMode;
  extensions?: string[];
  allowHidden?: boolean;
}

/** Output serialization formats supported by `SimpleCLI.output`. */
export type OutputFormat = "json" | "table" | "kv" | "markdown" | "text";

/** Target shell types supported for auto-completion script generation. */
export type ShellType = "bash" | "zsh" | "fish";
