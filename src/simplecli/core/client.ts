/**
 * Zero-dependency, ergonomic Backend & REST/GraphQL/SSE API Client for SimpleCLI
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type BackendClientOptions,
  type BackendRequestContext,
  type BackendResponse,
  type BatchRequestItem,
  type BenchmarkOptions,
  type BenchmarkStats,
  type EndpointProbeResult,
  type ErrorInterceptor,
  type GraphQLResult,
  type HealthCheckResult,
  type PaginationOptions,
  type RequestInterceptor,
  type RequestOptions,
  type ResponseInterceptor,
  type SafeApiResult,
  type SseEvent,
  type UploadFileInput,
} from "./types.ts";

const DEFAULT_RETRY_STATUS_CODES = [408, 425, 429, 500, 502, 503, 504];
const SENSITIVE_HEADER_RE =
  /^(authorization|x-api-key|api-key|x-auth-token|cookie|set-cookie|proxy-authorization)$/i;

function isUnsafeKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function safeDecodeURIComponent(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

function extractOrigin(urlStr: string): string | null {
  if (!urlStr || !/^https?:\/\//i.test(urlStr)) return null;
  try {
    return new URL(urlStr).origin.toLowerCase();
  } catch {
    return null;
  }
}

function expandTildePath(filePath: string): string {
  if (filePath.includes("\0")) {
    throw new Error("Invalid file path: null bytes are not permitted");
  }
  if (filePath.startsWith("~")) {
    return path.resolve(os.homedir(), filePath.slice(1).replace(/^[/\\]/, ""));
  }
  return path.resolve(filePath);
}

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".json": "application/json",
    ".txt": "text/plain",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".ts": "application/typescript",
    ".csv": "text/csv",
    ".xml": "application/xml",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".gz": "application/gzip",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  return map[ext] || "application/octet-stream";
}

/** Serializes a key-value map into a URL-encoded query string prefixed with `?` (or empty string if empty). */
export function buildQueryString(params?: Record<string, any>): string {
  if (!params) return "";
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item === undefined || item === null) continue;
        parts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`,
        );
      }
    } else if (typeof val === "object") {
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(val))}`,
      );
    } else {
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`,
      );
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/** Parses a URL or query string into a decoded key-value dictionary while ignoring unsafe prototype keys. */
export function parseQueryString(queryStr: string): Record<string, string> {
  const raw = String(queryStr ?? "").trim();
  const qIdx = raw.indexOf("?");
  const clean =
    qIdx >= 0
      ? raw.slice(qIdx + 1).replace(/#.*$/, "")
      : raw.replace(/^\?/, "").replace(/#.*$/, "");
  if (!clean) return {};
  const out: Record<string, string> = {};
  for (const pair of clean.split("&")) {
    if (!pair) continue;
    const eqIdx = pair.indexOf("=");
    const rawKey = eqIdx >= 0 ? pair.slice(0, eqIdx) : pair;
    const rawVal = eqIdx >= 0 ? pair.slice(eqIdx + 1) : "";
    const key = safeDecodeURIComponent(rawKey.replace(/\+/g, " "));
    if (!key || isUnsafeKey(key)) continue;
    out[key] = safeDecodeURIComponent(rawVal.replace(/\+/g, " "));
  }
  return out;
}

/** Replaces `{{variable}}` and built-in dynamic placeholders (`$timestamp`, `$isoTimestamp`, `$uuid`, `$randomInt`) in a template string. */
export function interpolateVars(
  input: string,
  vars: Record<string, string> = {},
): string {
  if (!input || !input.includes("{{")) return input;
  const now = new Date();
  return input.replace(
    /\{\{\s*([$A-Za-z_][\w.$-]*)\s*\}\}/g,
    (whole, name: string) => {
      if (isUnsafeKey(name)) return whole;
      switch (name) {
        case "$timestamp":
          return String(Math.floor(now.getTime() / 1000));
        case "$isoTimestamp":
          return now.toISOString();
        case "$uuid":
          return crypto.randomUUID();
        case "$randomInt":
          return String(Math.floor(Math.random() * 1000));
      }
      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        return String(vars[name]);
      }
      return whole;
    },
  );
}

/** Extracts the `rel="next"` target URL from an RFC 5988 `Link` HTTP response header, if present. */
export function parseLinkNextHeader(linkHeader?: string): string | null {
  if (!linkHeader) return null;
  const segments = linkHeader.split(",");
  for (const seg of segments) {
    const match = seg.match(/<([^>]+)>\s*;\s*rel=["']?next["']?/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Rich HTTP error thrown when `throwOnError` is enabled or when unwrapped `*Json()` helpers receive a non-2xx status.
 */
export class BackendApiError<T = any> extends Error {
  public readonly statusCode: number;
  public readonly status: number;
  public readonly statusText: string;
  public readonly url: string;
  public readonly method: string;
  public readonly data: T;
  public readonly body: string;
  public readonly headers: Record<string, string>;

  /** Creates a `BackendApiError` from an HTTP method, a `BackendResponse`, and an optional custom message. */
  constructor(
    method: string,
    response: BackendResponse<T>,
    customMessage?: string,
  ) {
    const msg =
      customMessage ||
      `HTTP ${method.toUpperCase()} ${response.url} failed with status ${response.statusCode}${
        response.statusText ? ` (${response.statusText})` : ""
      }`;
    super(msg);
    this.name = "BackendApiError";
    this.method = method.toUpperCase();
    this.statusCode = response.statusCode;
    this.status = response.statusCode;
    this.statusText = response.statusText;
    this.url = response.url;
    this.data = response.data;
    this.body = response.body;
    this.headers = response.headers;
  }
}

/**
 * Zero-boilerplate CRUD Resource Client bound to a REST collection path (e.g. `/users`).
 */
export class ResourceClient<T = any, ID = string | number> {
  private readonly client: BackendClient;
  public readonly resourcePath: string;

  /** Creates a `ResourceClient` bound to the given `BackendClient` and collection path. */
  constructor(client: BackendClient, resourcePath: string) {
    this.client = client;
    this.resourcePath = resourcePath.replace(/\/+$/, "");
  }

  private itemPath(id: ID, suffix: string = ""): string {
    const encodedId = encodeURIComponent(String(id));
    const cleanSuffix = suffix ? `/${suffix.replace(/^\/+/, "")}` : "";
    return `${this.resourcePath}/${encodedId}${cleanSuffix}`;
  }

  /** Fetches the collection of items via `GET <resourcePath>`. */
  public async list(
    query?: Record<string, any>,
    options?: RequestOptions,
  ): Promise<T[]> {
    return this.client.getJson<T[]>(this.resourcePath, {
      ...options,
      query: { ...(options?.query || {}), ...(query || {}) },
    });
  }

  /** Fetches a single resource item by ID via `GET <resourcePath>/<id>`. */
  public async get(
    id: ID,
    query?: Record<string, any>,
    options?: RequestOptions,
  ): Promise<T> {
    return this.client.getJson<T>(this.itemPath(id), {
      ...options,
      query: { ...(options?.query || {}), ...(query || {}) },
    });
  }

  /** Creates a new resource item via `POST <resourcePath>`. */
  public async create(
    payload: Partial<T> | Record<string, any>,
    options?: RequestOptions,
  ): Promise<T> {
    return this.client.postJson<T>(this.resourcePath, payload, options);
  }

  /** Replaces an existing resource item by ID via `PUT <resourcePath>/<id>`. */
  public async update(
    id: ID,
    payload: Partial<T> | Record<string, any>,
    options?: RequestOptions,
  ): Promise<T> {
    return this.client.putJson<T>(this.itemPath(id), payload, options);
  }

  /** Partially updates a resource item by ID via `PATCH <resourcePath>/<id>`. */
  public async patch(
    id: ID,
    payload: Partial<T> | Record<string, any>,
    options?: RequestOptions,
  ): Promise<T> {
    return this.client.patchJson<T>(this.itemPath(id), payload, options);
  }

  /** Deletes a resource item by ID via `DELETE <resourcePath>/<id>` and returns `true` on a 2xx response. */
  public async remove(id: ID, options?: RequestOptions): Promise<boolean> {
    const res = await this.client.delete(this.itemPath(id), undefined, options);
    return res.ok;
  }

  /** Invokes a custom sub-resource action via `<method> <resourcePath>/<id>/<actionName>`. */
  public async action<R = any>(
    id: ID,
    actionName: string,
    body?: any,
    method: string = "POST",
    options?: RequestOptions,
  ): Promise<R> {
    const res = await this.client.request<R>(
      method,
      this.itemPath(id, actionName),
      {
        ...options,
        body: body !== undefined ? body : options?.body,
      },
    );
    if (!res.ok) {
      throw new BackendApiError(method, res);
    }
    return res.data;
  }
}

/** Parsed cURL command descriptor with a preconfigured `BackendClient` and an `execute()` helper. */
export interface ParsedCurlClientRequest {
  client: BackendClient;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  execute: <T = any>() => Promise<BackendResponse<T>>;
}

/**
 * High-ergonomics Backend API Client for REST, GraphQL, SSE, Multipart Uploads, Pagination & Benchmarking
 */
export class BackendClient {
  public baseUrl: string = "";
  public defaultHeaders: Record<string, string> = {};
  public defaultQuery: Record<string, any> = {};
  public timeoutMs: number = 30_000;
  public retries: number = 0;
  public retryBackoffMs: number = 200;
  public retryStatusCodes: number[] = [...DEFAULT_RETRY_STATUS_CODES];
  public throwOnError: boolean = false;
  public allowCrossOriginAuth: boolean = false;
  public vars: Record<string, string> = {};
  private customApiKeyHeader: string = "X-API-Key";

  private cacheEnabled: boolean = false;
  private cacheTtlMs: number = 60_000;
  private cacheMaxEntries: number = 256;
  private responseCache: Map<
    string,
    { expiresAt: number; response: BackendResponse<any> }
  > = new Map();

  private rateLimitMaxRequests: number = 0;
  private rateLimitWindowMs: number = 1000;
  private requestTimestamps: number[] = [];
  private rateLimitHead: number = 0;

  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  /** Creates a `BackendClient` configured with a base URL string or a `BackendClientOptions` object. */
  constructor(baseUrlOrOptions?: string | BackendClientOptions) {
    if (typeof baseUrlOrOptions === "string") {
      this.setBaseUrl(baseUrlOrOptions);
    } else if (baseUrlOrOptions && typeof baseUrlOrOptions === "object") {
      if (baseUrlOrOptions.baseUrl) this.setBaseUrl(baseUrlOrOptions.baseUrl);
      if (baseUrlOrOptions.headers) this.setHeaders(baseUrlOrOptions.headers);
      if (baseUrlOrOptions.query) this.setQueryParams(baseUrlOrOptions.query);
      if (baseUrlOrOptions.bearerToken)
        this.setBearerToken(baseUrlOrOptions.bearerToken);
      if (baseUrlOrOptions.basicAuth) {
        if (typeof baseUrlOrOptions.basicAuth === "string") {
          this.setBasicAuth(baseUrlOrOptions.basicAuth);
        } else {
          this.setBasicAuth(
            baseUrlOrOptions.basicAuth.username,
            baseUrlOrOptions.basicAuth.password,
          );
        }
      }
      if (baseUrlOrOptions.apiKey) {
        this.setApiKey(baseUrlOrOptions.apiKey, baseUrlOrOptions.apiKeyHeader);
      }
      if (baseUrlOrOptions.timeoutMs !== undefined)
        this.timeoutMs = baseUrlOrOptions.timeoutMs;
      if (baseUrlOrOptions.retries !== undefined)
        this.retries = baseUrlOrOptions.retries;
      if (baseUrlOrOptions.retryBackoffMs !== undefined)
        this.retryBackoffMs = baseUrlOrOptions.retryBackoffMs;
      if (baseUrlOrOptions.retryStatusCodes)
        this.retryStatusCodes = [...baseUrlOrOptions.retryStatusCodes];
      if (baseUrlOrOptions.throwOnError !== undefined)
        this.throwOnError = baseUrlOrOptions.throwOnError;
      if (baseUrlOrOptions.allowCrossOriginAuth !== undefined) {
        this.allowCrossOriginAuth = baseUrlOrOptions.allowCrossOriginAuth;
      }
      if (baseUrlOrOptions.vars) this.setVars(baseUrlOrOptions.vars);
      if (baseUrlOrOptions.cacheTtlMs && baseUrlOrOptions.cacheTtlMs > 0) {
        this.enableCache(
          baseUrlOrOptions.cacheTtlMs,
          baseUrlOrOptions.cacheMaxEntries ?? 256,
        );
      }
      if (
        baseUrlOrOptions.rateLimit &&
        baseUrlOrOptions.rateLimit.maxRequests > 0
      ) {
        this.setRateLimit(
          baseUrlOrOptions.rateLimit.maxRequests,
          baseUrlOrOptions.rateLimit.windowMs ?? 1000,
        );
      }
    }
  }

  /** Static factory method that instantiates a new `BackendClient`. */
  public static new(
    baseUrlOrOptions?: string | BackendClientOptions,
  ): BackendClient {
    return new BackendClient(baseUrlOrOptions);
  }

  // ===========================================================================
  // 1. Fluent Configuration & Auth
  // ===========================================================================

  /** Sets the base URL prepended to relative request paths. */
  public setBaseUrl(url: string): this {
    this.baseUrl = String(url ?? "")
      .trim()
      .replace(/\/+$/, "");
    return this;
  }

  /** Sets or clears the `Authorization: Bearer <token>` header. */
  public setBearerToken(token: string): this {
    const clean = String(token ?? "").trim();
    if (clean) {
      this.defaultHeaders["Authorization"] = clean.startsWith("Bearer ")
        ? clean
        : `Bearer ${clean}`;
    } else {
      delete this.defaultHeaders["Authorization"];
    }
    return this;
  }

  /** Fluent alias for `setBearerToken`. */
  public withBearer(token: string): this {
    return this.setBearerToken(token);
  }

  /** Sets or clears the `Authorization: Basic <base64>` header from `username:password` credentials. */
  public setBasicAuth(usernameOrCombo: string, password?: string): this {
    const combo =
      password !== undefined
        ? `${usernameOrCombo}:${password}`
        : usernameOrCombo;
    if (combo) {
      this.defaultHeaders["Authorization"] =
        `Basic ${Buffer.from(combo, "utf8").toString("base64")}`;
    } else {
      delete this.defaultHeaders["Authorization"];
    }
    return this;
  }

  /** Fluent alias for `setBasicAuth`. */
  public withBasicAuth(usernameOrCombo: string, password?: string): this {
    return this.setBasicAuth(usernameOrCombo, password);
  }

  /** Sets or clears an API key header (defaults to `X-API-Key`). */
  public setApiKey(key: string, headerName: string = "X-API-Key"): this {
    if (isUnsafeKey(headerName)) return this;
    this.customApiKeyHeader = headerName;
    const clean = String(key ?? "").trim();
    if (clean) {
      this.defaultHeaders[headerName] = clean;
    } else {
      delete this.defaultHeaders[headerName];
    }
    return this;
  }

  /** Fluent alias for `setApiKey`. */
  public withApiKey(key: string, headerName: string = "X-API-Key"): this {
    return this.setApiKey(key, headerName);
  }

  /** Sets a single default request header. */
  public setHeader(name: string, value: string): this {
    if (!isUnsafeKey(name)) {
      this.defaultHeaders[name] = value;
    }
    return this;
  }

  /** Merges multiple default request headers into the client. */
  public setHeaders(headers: Record<string, string>): this {
    for (const [k, v] of Object.entries(headers)) {
      if (!isUnsafeKey(k)) {
        this.defaultHeaders[k] = v;
      }
    }
    return this;
  }

  /** Removes a default request header (case-insensitive). */
  public removeHeader(name: string): this {
    const lower = name.toLowerCase();
    for (const k of Object.keys(this.defaultHeaders)) {
      if (k.toLowerCase() === lower) {
        delete this.defaultHeaders[k];
      }
    }
    return this;
  }

  /** Sets a single default URL query parameter appended to every request. */
  public setQueryParam(key: string, value: any): this {
    if (!isUnsafeKey(key)) {
      this.defaultQuery[key] = value;
    }
    return this;
  }

  /** Merges multiple default URL query parameters into the client. */
  public setQueryParams(params: Record<string, any>): this {
    for (const [k, v] of Object.entries(params)) {
      if (!isUnsafeKey(k)) {
        this.defaultQuery[k] = v;
      }
    }
    return this;
  }

  /** Sets the default per-request timeout in milliseconds. */
  public setTimeout(timeoutMs: number): this {
    this.timeoutMs = Math.max(0, timeoutMs);
    return this;
  }

  /** Configures automatic exponential-backoff retries for transient failures and retryable HTTP status codes. */
  public setRetries(
    maxRetries: number,
    backoffMs: number = 200,
    retryStatusCodes: number[] = DEFAULT_RETRY_STATUS_CODES,
  ): this {
    this.retries = Math.max(0, Math.floor(maxRetries));
    this.retryBackoffMs = Math.max(0, backoffMs);
    this.retryStatusCodes = [...retryStatusCodes];
    return this;
  }

  /** Enables or disables throwing `BackendApiError` on non-2xx HTTP responses. */
  public setThrowOnError(throwOnError: boolean = true): this {
    this.throwOnError = throwOnError;
    return this;
  }

  /** Sets a single template variable for `{{var}}` interpolation in URLs, headers, and bodies. */
  public setVar(key: string, value: string): this {
    if (!isUnsafeKey(key)) {
      this.vars[key] = value;
    }
    return this;
  }

  /** Merges multiple template variables for `{{var}}` interpolation. */
  public setVars(vars: Record<string, string>): this {
    for (const [k, v] of Object.entries(vars)) {
      if (!isUnsafeKey(k)) {
        this.vars[k] = v;
      }
    }
    return this;
  }

  /** Enables in-memory LRU caching for `GET` responses with the specified TTL and capacity. */
  public enableCache(ttlMs: number = 60_000, maxEntries: number = 256): this {
    this.cacheEnabled = true;
    this.cacheTtlMs = Math.max(1, ttlMs);
    this.cacheMaxEntries = Math.max(1, maxEntries);
    return this;
  }

  /** Disables in-memory `GET` response caching without clearing existing entries. */
  public disableCache(): this {
    this.cacheEnabled = false;
    return this;
  }

  /** Clears all cached `GET` responses from memory. */
  public clearCache(): this {
    this.responseCache.clear();
    return this;
  }

  /** Sets a sliding-window client-side rate limit (`maxRequests` per `windowMs`). */
  public setRateLimit(maxRequests: number, windowMs: number = 1000): this {
    this.rateLimitMaxRequests = Math.max(0, Math.floor(maxRequests));
    this.rateLimitWindowMs = Math.max(1, windowMs);
    return this;
  }

  /** Registers a request interceptor invoked before each HTTP call is sent. */
  public useRequestInterceptor(fn: RequestInterceptor): this {
    this.requestInterceptors.push(fn);
    return this;
  }

  /** Registers a response interceptor invoked after each HTTP response is received. */
  public useResponseInterceptor(fn: ResponseInterceptor): this {
    this.responseInterceptors.push(fn);
    return this;
  }

  /** Registers an error interceptor invoked whenever a request fails or throws `BackendApiError`. */
  public onError(fn: ErrorInterceptor): this {
    this.errorInterceptors.push(fn);
    return this;
  }

  /**
   * Create a scoped child client that inherits base settings, auth, headers, and interceptors.
   */
  public scope(
    subPath: string,
    overrides?: Partial<BackendClientOptions>,
  ): BackendClient {
    const cleanSub = String(subPath ?? "").replace(/^\/+|\/+$/g, "");
    const nextBase = this.baseUrl
      ? cleanSub
        ? `${this.baseUrl}/${cleanSub}`
        : this.baseUrl
      : cleanSub;

    const child = new BackendClient({
      baseUrl: nextBase,
      headers: { ...this.defaultHeaders },
      query: { ...this.defaultQuery },
      timeoutMs: this.timeoutMs,
      retries: this.retries,
      retryBackoffMs: this.retryBackoffMs,
      retryStatusCodes: [...this.retryStatusCodes],
      throwOnError: this.throwOnError,
      vars: { ...this.vars },
      ...(this.cacheEnabled
        ? { cacheTtlMs: this.cacheTtlMs, cacheMaxEntries: this.cacheMaxEntries }
        : {}),
      ...(this.rateLimitMaxRequests > 0
        ? {
            rateLimit: {
              maxRequests: this.rateLimitMaxRequests,
              windowMs: this.rateLimitWindowMs,
            },
          }
        : {}),
      ...(overrides || {}),
    });

    child.requestInterceptors = [...this.requestInterceptors];
    child.responseInterceptors = [...this.responseInterceptors];
    child.errorInterceptors = [...this.errorInterceptors];
    return child;
  }

  // ===========================================================================
  // 2. URL Resolution & Internal Helpers
  // ===========================================================================

  /** Resolves a relative path or full URL against `baseUrl`, interpolating `{{vars}}` and appending merged query parameters. */
  public resolveUrl(
    pathOrUrl: string,
    query?: Record<string, any>,
    extraVars?: Record<string, string>,
  ): string {
    const mergedVars = { ...this.vars, ...(extraVars || {}) };
    const interpolatedBase = interpolateVars(this.baseUrl, mergedVars);
    const interpolatedPath = interpolateVars(
      String(pathOrUrl ?? "").trim(),
      mergedVars,
    );

    let fullUrl = interpolatedPath;
    if (!/^https?:\/\//i.test(interpolatedPath)) {
      if (interpolatedBase) {
        const cleanBase = interpolatedBase.replace(/\/+$/, "");
        const cleanRel = interpolatedPath.replace(/^\/+/, "");
        fullUrl = cleanRel ? `${cleanBase}/${cleanRel}` : cleanBase;
      } else if (interpolatedPath) {
        const hostPart = interpolatedPath
          .split(/[/?#]/)[0]!
          .replace(/:\d+$/, "")
          .replace(/^\[|\]$/g, "")
          .toLowerCase();
        const isLocal =
          hostPart === "localhost" ||
          hostPart === "0.0.0.0" ||
          hostPart === "::1" ||
          /^127\./.test(hostPart) ||
          hostPart.endsWith(".local") ||
          hostPart.endsWith(".localhost");
        fullUrl = `${isLocal ? "http" : "https"}://${interpolatedPath.replace(/^\/+/, "")}`;
      }
    }

    const rawQuery = { ...this.defaultQuery, ...(query || {}) };
    const mergedQuery: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawQuery)) {
      if (typeof v === "string") {
        mergedQuery[k] = interpolateVars(v, mergedVars);
      } else if (Array.isArray(v)) {
        mergedQuery[k] = v.map((item) =>
          typeof item === "string" ? interpolateVars(item, mergedVars) : item,
        );
      } else {
        mergedQuery[k] = v;
      }
    }
    const qs = buildQueryString(mergedQuery);
    if (!qs) return fullUrl;

    const hashIdx = fullUrl.indexOf("#");
    const beforeHash = hashIdx >= 0 ? fullUrl.slice(0, hashIdx) : fullUrl;
    const hash = hashIdx >= 0 ? fullUrl.slice(hashIdx) : "";
    const sep = beforeHash.includes("?")
      ? /[?&]$/.test(beforeHash)
        ? ""
        : "&"
      : "?";
    return `${beforeHash}${sep}${qs.slice(1)}${hash}`;
  }

  private isSensitiveHeader(headerName: string): boolean {
    return (
      SENSITIVE_HEADER_RE.test(headerName) ||
      headerName.toLowerCase() === this.customApiKeyHeader.toLowerCase()
    );
  }

  private buildRequestHeaders(
    targetUrl: string,
    mergedVars: Record<string, string>,
    overrideHeaders?: Record<string, string>,
  ): Record<string, string> {
    const baseOrigin = extractOrigin(interpolateVars(this.baseUrl, mergedVars));
    const targetOrigin = extractOrigin(targetUrl);
    const isCrossOrigin = Boolean(
      baseOrigin && targetOrigin && baseOrigin !== targetOrigin,
    );

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.defaultHeaders)) {
      if (isUnsafeKey(k)) continue;
      if (
        isCrossOrigin &&
        !this.allowCrossOriginAuth &&
        this.isSensitiveHeader(k)
      ) {
        continue;
      }
      headers[k] = interpolateVars(v, mergedVars);
    }
    if (overrideHeaders) {
      for (const [k, v] of Object.entries(overrideHeaders)) {
        if (isUnsafeKey(k)) continue;
        headers[k] = interpolateVars(v, mergedVars);
      }
    }
    return headers;
  }

  private async enforceRateLimit(): Promise<void> {
    if (this.rateLimitMaxRequests <= 0) return;
    while (true) {
      const now = Date.now();
      while (
        this.rateLimitHead < this.requestTimestamps.length &&
        now - this.requestTimestamps[this.rateLimitHead]! >=
          this.rateLimitWindowMs
      ) {
        this.rateLimitHead++;
      }
      if (
        this.rateLimitHead > 64 &&
        this.rateLimitHead * 2 >= this.requestTimestamps.length
      ) {
        this.requestTimestamps = this.requestTimestamps.slice(
          this.rateLimitHead,
        );
        this.rateLimitHead = 0;
      }
      const activeCount = this.requestTimestamps.length - this.rateLimitHead;
      if (activeCount < this.rateLimitMaxRequests) {
        this.requestTimestamps.push(now);
        return;
      }
      const oldest = this.requestTimestamps[this.rateLimitHead] ?? now;
      const waitMs = Math.max(5, this.rateLimitWindowMs - (now - oldest));
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  private parseRetryAfterMs(
    headerVal: string | undefined,
    fallbackMs: number,
  ): number {
    if (!headerVal) return fallbackMs;
    const seconds = Number(headerVal.trim());
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.round(seconds * 1000);
    }
    const parsedDate = Date.parse(headerVal);
    if (!Number.isNaN(parsedDate)) {
      return Math.max(0, parsedDate - Date.now());
    }
    return fallbackMs;
  }

  private buildBackendResponse<T>(params: {
    statusCode: number;
    statusText: string;
    body: string;
    data: T;
    url: string;
    headers: Record<string, string>;
    durationMs: number;
    attempts: number;
    cached: boolean;
  }): BackendResponse<T> {
    const lowerHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(params.headers)) {
      lowerHeaders[k.toLowerCase()] = v;
    }

    return {
      ok: params.statusCode >= 200 && params.statusCode < 300,
      status: params.statusCode,
      statusCode: params.statusCode,
      statusText: params.statusText,
      data: params.data,
      body: params.body,
      url: params.url,
      headers: params.headers,
      durationMs: params.durationMs,
      attempts: params.attempts,
      cached: params.cached,
      json<U = T>(): U {
        if (typeof params.data === "object" && params.data !== null) {
          return params.data as unknown as U;
        }
        return JSON.parse(params.body) as U;
      },
      text(): string {
        return params.body;
      },
      header(name: string): string | undefined {
        return params.headers[name] ?? lowerHeaders[name.toLowerCase()];
      },
    };
  }

  // ===========================================================================
  // 3. Core Request Execution Engine
  // ===========================================================================

  /** Executes an HTTP request with automatic variable interpolation, interceptors, rate limiting, caching, and retries. */
  public async request<T = any>(
    method: string,
    pathOrUrl: string,
    options: RequestOptions = {},
  ): Promise<BackendResponse<T>> {
    const upperMethod = String(method || "GET").toUpperCase();
    const mergedVars = { ...this.vars, ...(options.vars || {}) };
    const resolvedUrl = this.resolveUrl(pathOrUrl, options.query, options.vars);

    const headers = this.buildRequestHeaders(
      resolvedUrl,
      mergedVars,
      options.headers,
    );

    const hasContentType = Object.keys(headers).some(
      (k) => k.toLowerCase() === "content-type",
    );
    let payload: any = options.body;

    if (
      payload !== undefined &&
      payload !== null &&
      !["GET", "HEAD"].includes(upperMethod)
    ) {
      if (typeof FormData !== "undefined" && payload instanceof FormData) {
        // FormData sets its own multipart boundary header automatically
      } else if (payload instanceof URLSearchParams) {
        if (!hasContentType)
          headers["Content-Type"] =
            "application/x-www-form-urlencoded;charset=UTF-8";
        payload = payload.toString();
      } else if (
        payload instanceof Uint8Array ||
        payload instanceof ArrayBuffer ||
        (typeof Blob !== "undefined" && payload instanceof Blob)
      ) {
        if (!hasContentType)
          headers["Content-Type"] = "application/octet-stream";
      } else if (typeof payload === "object") {
        if (!hasContentType) headers["Content-Type"] = "application/json";
        payload = interpolateVars(JSON.stringify(payload), mergedVars);
      } else if (typeof payload === "string") {
        payload = interpolateVars(payload, mergedVars);
        if (!hasContentType && /^\s*[{[]/.test(payload)) {
          headers["Content-Type"] = "application/json";
        }
      } else {
        payload = String(payload);
      }
    } else {
      payload = undefined;
    }

    let ctx: BackendRequestContext = {
      method: upperMethod,
      url: resolvedUrl,
      headers,
      body: payload,
    };

    for (const interceptor of this.requestInterceptors) {
      const modified = await interceptor(ctx);
      if (modified) ctx = modified;
    }

    // Check GET cache (true LRU refresh on hit)
    const useCache =
      upperMethod === "GET" && (options.cache ?? this.cacheEnabled);
    const cacheKey = useCache
      ? `${ctx.method}:${ctx.url}:${JSON.stringify(ctx.headers)}`
      : "";
    if (useCache && cacheKey) {
      const hit = this.responseCache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        this.responseCache.delete(cacheKey);
        this.responseCache.set(cacheKey, hit);
        return this.buildBackendResponse<T>({
          ...hit.response,
          durationMs: 0,
          cached: true,
        });
      } else if (hit) {
        this.responseCache.delete(cacheKey);
      }
    }

    const maxRetries = options.retries ?? this.retries;
    const baseBackoffMs =
      options.retryBackoffMs ?? options.retryDelayMs ?? this.retryBackoffMs;
    const retryStatuses = options.retryStatusCodes ?? this.retryStatusCodes;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const shouldThrow = options.throwOnError ?? this.throwOnError;

    let attempts = 0;
    let lastError: any = null;
    const startTime = performance.now();

    while (attempts <= maxRetries) {
      attempts++;
      await this.enforceRateLimit();

      const controller = new AbortController();
      const timeoutId =
        timeoutMs > 0
          ? setTimeout(
              () =>
                controller.abort(
                  new Error(`Request timed out after ${timeoutMs}ms`),
                ),
              timeoutMs,
            )
          : null;

      let onCallerAbort: (() => void) | null = null;
      if (options.signal) {
        if (options.signal.aborted) {
          controller.abort(options.signal.reason);
        } else {
          onCallerAbort = () => controller.abort(options.signal?.reason);
          options.signal.addEventListener("abort", onCallerAbort, {
            once: true,
          });
        }
      }

      try {
        const res = await fetch(ctx.url, {
          method: ctx.method,
          headers: ctx.headers,
          body: ctx.body,
          signal: controller.signal,
        });
        if (timeoutId) clearTimeout(timeoutId);
        if (onCallerAbort && options.signal) {
          options.signal.removeEventListener("abort", onCallerAbort);
          onCallerAbort = null;
        }

        const resBody = upperMethod === "HEAD" ? "" : await res.text();
        const respHeaders: Record<string, string> = {};
        res.headers.forEach((val, key) => {
          respHeaders[key] = val;
        });

        // Check if we should retry on status code
        if (
          !res.ok &&
          attempts <= maxRetries &&
          retryStatuses.includes(res.status)
        ) {
          const retryAfter =
            respHeaders["retry-after"] ?? respHeaders["Retry-After"];
          const delayMs = this.parseRetryAfterMs(
            retryAfter,
            baseBackoffMs * Math.pow(2, attempts - 1),
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        let parsedData: any = resBody;
        if (upperMethod === "HEAD") {
          parsedData = null;
        } else if (resBody.length > 0) {
          const ct = (
            respHeaders["content-type"] ||
            respHeaders["Content-Type"] ||
            ""
          ).toLowerCase();
          if (ct.includes("json") || /^\s*[{[]/.test(resBody)) {
            try {
              parsedData = JSON.parse(resBody);
            } catch {
              parsedData = resBody;
            }
          }
        } else {
          parsedData = null;
        }

        const durationMs =
          Math.round((performance.now() - startTime) * 100) / 100;
        let backendRes = this.buildBackendResponse<T>({
          statusCode: res.status,
          statusText: res.statusText || "",
          body: resBody,
          data: parsedData as T,
          url: res.url || ctx.url,
          headers: respHeaders,
          durationMs,
          attempts,
          cached: false,
        });

        for (const resInterceptor of this.responseInterceptors) {
          const modified = await resInterceptor(backendRes, ctx);
          if (modified) backendRes = modified;
        }

        if (useCache && cacheKey && backendRes.ok) {
          if (this.responseCache.size >= this.cacheMaxEntries) {
            const oldestKey = this.responseCache.keys().next().value;
            if (oldestKey !== undefined) this.responseCache.delete(oldestKey);
          }
          const ttl = options.cacheTtlMs ?? this.cacheTtlMs;
          this.responseCache.set(cacheKey, {
            expiresAt: Date.now() + ttl,
            response: backendRes,
          });
        }

        if (shouldThrow && !backendRes.ok) {
          const apiErr = new BackendApiError<T>(ctx.method, backendRes);
          for (const errInterceptor of this.errorInterceptors) {
            await errInterceptor(apiErr, ctx);
          }
          throw apiErr;
        }

        return backendRes;
      } catch (err: any) {
        if (timeoutId) clearTimeout(timeoutId);
        if (onCallerAbort && options.signal) {
          options.signal.removeEventListener("abort", onCallerAbort);
          onCallerAbort = null;
        }
        lastError = err;

        if (err instanceof BackendApiError) {
          throw err;
        }

        if (attempts <= maxRetries) {
          const delayMs = baseBackoffMs * Math.pow(2, attempts - 1);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        const normalizedErr =
          err instanceof Error ? err : new Error(String(err));
        for (const errInterceptor of this.errorInterceptors) {
          await errInterceptor(normalizedErr, ctx);
        }
        throw normalizedErr;
      }
    }

    throw lastError || new Error(`Request ${ctx.method} ${ctx.url} failed`);
  }

  // ===========================================================================
  // 4. Standard Verb Methods (Return Full BackendResponse<T>)
  // ===========================================================================

  /** Sends an HTTP `GET` request and returns the full `BackendResponse<T>`. */
  public get<T = any>(
    path: string,
    options?: RequestOptions,
  ): Promise<BackendResponse<T>> {
    return this.request<T>("GET", path, options);
  }

  /** Sends an HTTP `POST` request with an optional body and returns the full `BackendResponse<T>`. */
  public post<T = any>(
    path: string,
    body?: any,
    options?: RequestOptions,
  ): Promise<BackendResponse<T>> {
    return this.request<T>("POST", path, {
      ...options,
      body: body !== undefined ? body : options?.body,
    });
  }

  /** Sends an HTTP `PUT` request with an optional body and returns the full `BackendResponse<T>`. */
  public put<T = any>(
    path: string,
    body?: any,
    options?: RequestOptions,
  ): Promise<BackendResponse<T>> {
    return this.request<T>("PUT", path, {
      ...options,
      body: body !== undefined ? body : options?.body,
    });
  }

  /** Sends an HTTP `PATCH` request with an optional body and returns the full `BackendResponse<T>`. */
  public patch<T = any>(
    path: string,
    body?: any,
    options?: RequestOptions,
  ): Promise<BackendResponse<T>> {
    return this.request<T>("PATCH", path, {
      ...options,
      body: body !== undefined ? body : options?.body,
    });
  }

  /** Sends an HTTP `DELETE` request with an optional body and returns the full `BackendResponse<T>`. */
  public delete<T = any>(
    path: string,
    body?: any,
    options?: RequestOptions,
  ): Promise<BackendResponse<T>> {
    return this.request<T>("DELETE", path, {
      ...options,
      body: body !== undefined ? body : options?.body,
    });
  }

  /** Sends an HTTP `HEAD` request and returns the response headers and status with a `null` body. */
  public head(
    path: string,
    options?: RequestOptions,
  ): Promise<BackendResponse<null>> {
    return this.request<null>("HEAD", path, options);
  }

  /** Sends an HTTP `OPTIONS` request and returns the full `BackendResponse<T>`. */
  public options<T = any>(
    path: string,
    options?: RequestOptions,
  ): Promise<BackendResponse<T>> {
    return this.request<T>("OPTIONS", path, options);
  }

  // ===========================================================================
  // 5. Direct Unwrapped Data Methods (Return Promise<T> Directly)
  // ===========================================================================

  private async unwrapData<T>(
    method: string,
    path: string,
    body?: any,
    options?: RequestOptions & { fallback?: T },
  ): Promise<T> {
    try {
      const res = await this.request<T>(method, path, {
        ...options,
        body: body !== undefined ? body : options?.body,
      });
      if (!res.ok) {
        if (
          options &&
          "fallback" in options &&
          options.fallback !== undefined
        ) {
          return options.fallback;
        }
        throw new BackendApiError<T>(method, res);
      }
      if (typeof res.data === "string" && res.body.length > 0) {
        try {
          return JSON.parse(res.body) as T;
        } catch {
          return res.data as unknown as T;
        }
      }
      return res.data;
    } catch (err) {
      if (options && "fallback" in options && options.fallback !== undefined) {
        return options.fallback;
      }
      throw err;
    }
  }

  /** Sends a `GET` request and returns the parsed JSON body directly, throwing `BackendApiError` on non-2xx unless `fallback` is set. */
  public getJson<T = any>(
    path: string,
    options?: RequestOptions & { fallback?: T },
  ): Promise<T> {
    return this.unwrapData<T>("GET", path, undefined, options);
  }

  /** Sends a `POST` request and returns the parsed JSON body directly, throwing `BackendApiError` on non-2xx unless `fallback` is set. */
  public postJson<T = any>(
    path: string,
    body?: any,
    options?: RequestOptions & { fallback?: T },
  ): Promise<T> {
    return this.unwrapData<T>("POST", path, body, options);
  }

  /** Sends a `PUT` request and returns the parsed JSON body directly, throwing `BackendApiError` on non-2xx unless `fallback` is set. */
  public putJson<T = any>(
    path: string,
    body?: any,
    options?: RequestOptions & { fallback?: T },
  ): Promise<T> {
    return this.unwrapData<T>("PUT", path, body, options);
  }

  /** Sends a `PATCH` request and returns the parsed JSON body directly, throwing `BackendApiError` on non-2xx unless `fallback` is set. */
  public patchJson<T = any>(
    path: string,
    body?: any,
    options?: RequestOptions & { fallback?: T },
  ): Promise<T> {
    return this.unwrapData<T>("PATCH", path, body, options);
  }

  /** Sends a `DELETE` request and returns the parsed JSON body directly, throwing `BackendApiError` on non-2xx unless `fallback` is set. */
  public deleteJson<T = any>(
    path: string,
    body?: any,
    options?: RequestOptions & { fallback?: T },
  ): Promise<T> {
    return this.unwrapData<T>("DELETE", path, body, options);
  }

  /** Sends a `GET` request and returns the raw response text, throwing `BackendApiError` on non-2xx unless `fallback` is set. */
  public async getText(
    path: string,
    options?: RequestOptions & { fallback?: string },
  ): Promise<string> {
    try {
      const res = await this.get(path, options);
      if (!res.ok) {
        if (options?.fallback !== undefined) return options.fallback;
        throw new BackendApiError("GET", res);
      }
      return res.body;
    } catch (err) {
      if (options?.fallback !== undefined) return options.fallback;
      throw err;
    }
  }

  /** Sends a `GET` request and returns the raw response payload as a `Uint8Array`. */
  public async getBytes(
    path: string,
    options?: RequestOptions,
  ): Promise<Uint8Array> {
    const resolvedUrl = this.resolveUrl(path, options?.query, options?.vars);
    const headers = { ...this.defaultHeaders, ...(options?.headers || {}) };
    const res = await fetch(resolvedUrl, {
      method: "GET",
      headers,
      signal: options?.signal,
    });
    if (!res.ok) {
      throw new Error(
        `HTTP GET ${resolvedUrl} failed with status ${res.status}`,
      );
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  // ===========================================================================
  // 6. Non-Throwing Safe Result Helpers (`try*`)
  // ===========================================================================

  /** Executes an HTTP request that never throws, returning a `SafeApiResult<T>` with `{ ok, data, error, statusCode }`. */
  public async tryRequest<T = any>(
    method: string,
    path: string,
    options?: RequestOptions,
  ): Promise<SafeApiResult<T>> {
    const start = performance.now();
    try {
      const res = await this.request<T>(method, path, {
        ...options,
        throwOnError: false,
      });
      return {
        ok: res.ok,
        data: res.ok ? res.data : null,
        error: res.ok
          ? null
          : `HTTP ${res.statusCode} ${res.statusText || "Error"}`.trim(),
        statusCode: res.statusCode,
        durationMs: res.durationMs,
        response: res,
      };
    } catch (err: any) {
      return {
        ok: false,
        data: null,
        error: err?.message || String(err),
        statusCode: err?.statusCode ?? 0,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        response: null,
      };
    }
  }

  /** Non-throwing `GET` request returning a `SafeApiResult<T>`. */
  public tryGet<T = any>(
    path: string,
    options?: RequestOptions,
  ): Promise<SafeApiResult<T>> {
    return this.tryRequest<T>("GET", path, options);
  }

  /** Non-throwing `POST` request returning a `SafeApiResult<T>`. */
  public tryPost<T = any>(
    path: string,
    body?: any,
    options?: RequestOptions,
  ): Promise<SafeApiResult<T>> {
    return this.tryRequest<T>("POST", path, {
      ...options,
      body: body !== undefined ? body : options?.body,
    });
  }

  /** Non-throwing `PUT` request returning a `SafeApiResult<T>`. */
  public tryPut<T = any>(
    path: string,
    body?: any,
    options?: RequestOptions,
  ): Promise<SafeApiResult<T>> {
    return this.tryRequest<T>("PUT", path, {
      ...options,
      body: body !== undefined ? body : options?.body,
    });
  }

  /** Non-throwing `PATCH` request returning a `SafeApiResult<T>`. */
  public tryPatch<T = any>(
    path: string,
    body?: any,
    options?: RequestOptions,
  ): Promise<SafeApiResult<T>> {
    return this.tryRequest<T>("PATCH", path, {
      ...options,
      body: body !== undefined ? body : options?.body,
    });
  }

  /** Non-throwing `DELETE` request returning a `SafeApiResult<T>`. */
  public tryDelete<T = any>(
    path: string,
    body?: any,
    options?: RequestOptions,
  ): Promise<SafeApiResult<T>> {
    return this.tryRequest<T>("DELETE", path, {
      ...options,
      body: body !== undefined ? body : options?.body,
    });
  }

  // ===========================================================================
  // 7. Forms, Multipart File Uploads & Streaming Downloads
  // ===========================================================================

  /** Submits an `application/x-www-form-urlencoded` `POST` request with the given form fields. */
  public postForm<T = any>(
    path: string,
    fields: Record<string, string | number | boolean>,
    options?: RequestOptions,
  ): Promise<BackendResponse<T>> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null) {
        params.append(k, String(v));
      }
    }
    return this.request<T>("POST", path, {
      ...options,
      body: params,
    });
  }

  /** Submits a `multipart/form-data` `POST` upload containing files (from disk paths, buffers, or Blobs) and form fields. */
  public async upload<T = any>(
    targetPath: string,
    files: Record<string, UploadFileInput>,
    fields: Record<string, string | number | boolean> = {},
    options?: RequestOptions,
  ): Promise<BackendResponse<T>> {
    const form = new FormData();

    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null) {
        form.append(k, String(v));
      }
    }

    for (const [fieldName, fileInput] of Object.entries(files)) {
      if (typeof fileInput === "string") {
        const fullPath = expandTildePath(fileInput);
        const bytes = await fs.promises.readFile(fullPath);
        const blob = new Blob([bytes], { type: inferMimeType(fullPath) });
        form.append(fieldName, blob, path.basename(fullPath));
      } else if (fileInput instanceof Uint8Array) {
        const blob = new Blob([Buffer.from(fileInput)], {
          type: "application/octet-stream",
        });
        form.append(fieldName, blob, `${fieldName}.bin`);
      } else if (fileInput instanceof Blob) {
        form.append(fieldName, fileInput, `${fieldName}.bin`);
      } else if (fileInput && typeof fileInput === "object") {
        if (fileInput.path) {
          const fullPath = expandTildePath(fileInput.path);
          const bytes = await fs.promises.readFile(fullPath);
          const mime = fileInput.contentType || inferMimeType(fullPath);
          const fname = fileInput.filename || path.basename(fullPath);
          form.append(fieldName, new Blob([bytes], { type: mime }), fname);
        } else if (fileInput.data !== undefined) {
          const fname = fileInput.filename || `${fieldName}.dat`;
          const mime = fileInput.contentType || inferMimeType(fname);
          if (fileInput.data instanceof Blob) {
            form.append(fieldName, fileInput.data, fname);
          } else if (typeof fileInput.data === "string") {
            form.append(
              fieldName,
              new Blob([Buffer.from(fileInput.data, "utf8")], { type: mime }),
              fname,
            );
          } else {
            form.append(
              fieldName,
              new Blob([Buffer.from(fileInput.data)], { type: mime }),
              fname,
            );
          }
        }
      }
    }

    return this.request<T>("POST", targetPath, {
      ...options,
      body: form,
    });
  }

  /** Streams a remote file download to `destPath` on disk with optional byte-progress reporting and size limits. */
  public async download(
    targetPath: string,
    destPath: string,
    onProgress?: (downloaded: number, total: number) => void,
    options?: RequestOptions,
  ): Promise<string> {
    const mergedVars = { ...this.vars, ...(options?.vars || {}) };
    const resolvedUrl = this.resolveUrl(
      targetPath,
      options?.query,
      options?.vars,
    );
    const headers = this.buildRequestHeaders(
      resolvedUrl,
      mergedVars,
      options?.headers,
    );
    const res = await fetch(resolvedUrl, { headers, signal: options?.signal });
    if (!res.ok) {
      throw new Error(
        `HTTP Download failed with status ${res.status}: ${res.statusText}`,
      );
    }

    const total = parseInt(res.headers.get("content-length") || "0", 10);
    const maxBytes = options?.maxDownloadBytes ?? 0;
    if (maxBytes > 0 && total > maxBytes) {
      throw new Error(
        `HTTP Download aborted: Content-Length (${total}) exceeds maxDownloadBytes (${maxBytes})`,
      );
    }

    const fullDest = expandTildePath(destPath);
    const destDir = path.dirname(fullDest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const reader = res.body?.getReader();
    if (!reader) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (maxBytes > 0 && buf.byteLength > maxBytes) {
        throw new Error(
          `HTTP Download aborted: size (${buf.byteLength}) exceeds maxDownloadBytes (${maxBytes})`,
        );
      }
      await fs.promises.writeFile(fullDest, buf);
      if (onProgress) onProgress(buf.length, total || buf.length);
      return fullDest;
    }

    const fileStream = fs.createWriteStream(fullDest);
    let downloaded = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          downloaded += value.byteLength;
          if (maxBytes > 0 && downloaded > maxBytes) {
            await reader.cancel();
            throw new Error(
              `HTTP Download aborted: downloaded bytes (${downloaded}) exceeded maxDownloadBytes (${maxBytes})`,
            );
          }
          const canContinue = fileStream.write(
            Buffer.from(value.buffer, value.byteOffset, value.byteLength),
          );
          if (!canContinue) {
            await new Promise<void>((resolveDrain) =>
              fileStream.once("drain", resolveDrain),
            );
          }
          if (onProgress) onProgress(downloaded, total);
        }
      }
      await new Promise<void>((resolveFinish, rejectFinish) => {
        fileStream.end(() => resolveFinish());
        fileStream.once("error", rejectFinish);
      });
      return fullDest;
    } catch (err) {
      fileStream.destroy();
      try {
        if (fs.existsSync(fullDest)) fs.unlinkSync(fullDest);
      } catch {}
      throw err;
    }
  }

  // ===========================================================================
  // 8. CRUD Resource Builder & GraphQL Client
  // ===========================================================================

  /** Creates a `ResourceClient<T, ID>` bound to the specified REST collection path. */
  public resource<T = any, ID = string | number>(
    resourcePath: string,
  ): ResourceClient<T, ID> {
    return new ResourceClient<T, ID>(this, resourcePath);
  }

  /** Executes a GraphQL query or mutation against `endpointPath` (default `/graphql`) and returns a `GraphQLResult<T>`. */
  public async graphql<T = any>(
    query: string,
    variables?: Record<string, any>,
    operationName?: string,
    endpointPath: string = "/graphql",
    options?: RequestOptions,
  ): Promise<GraphQLResult<T>> {
    const payload: Record<string, any> = { query };
    if (variables !== undefined) payload.variables = variables;
    if (operationName !== undefined) payload.operationName = operationName;

    const res = await this.post<any>(endpointPath, payload, {
      ...options,
      throwOnError: false,
    });
    const bodyObj = res.data && typeof res.data === "object" ? res.data : {};
    const errors = Array.isArray(bodyObj.errors) ? bodyObj.errors : undefined;
    const data =
      bodyObj.data !== undefined
        ? (bodyObj.data as T)
        : res.ok && !errors
          ? (res.data as T)
          : null;

    return {
      ok: res.ok && (!errors || errors.length === 0),
      data,
      errors,
      statusCode: res.statusCode,
      durationMs: res.durationMs,
      headers: res.headers,
    };
  }

  // ===========================================================================
  // 9. Auto-Pagination & Streaming (SSE / NDJSON)
  // ===========================================================================

  private defaultExtractItems<T>(data: any): T[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
      for (const key of [
        "items",
        "data",
        "results",
        "records",
        "rows",
        "entries",
        "nodes",
      ]) {
        if (Array.isArray(data[key])) return data[key];
      }
    }
    return [];
  }

  /** Asynchronously iterates through paginated API responses using page, offset, cursor, or RFC 5988 `Link` header pagination. */
  public async *paginate<T = any>(
    targetPath: string,
    options: PaginationOptions<T> = {},
  ): AsyncGenerator<T[], void, unknown> {
    const mode = options.mode ?? "page";
    const pageParam = options.pageParam ?? "page";
    const offsetParam = options.offsetParam ?? "offset";
    const limitParam = options.limitParam ?? "limit";
    const cursorParam = options.cursorParam ?? "cursor";
    const pageSize = options.pageSize ?? 50;
    const maxPages = options.maxPages ?? 100;
    const extractItems =
      options.extractItems ?? ((d: any) => this.defaultExtractItems<T>(d));

    let currentPage = options.startPage ?? 1;
    let currentOffset = 0;
    let currentCursor: string | null | undefined = undefined;
    let nextUrl: string | null = targetPath;
    let pagesFetched = 0;

    while (pagesFetched < maxPages && nextUrl) {
      pagesFetched++;
      const query: Record<string, any> = { ...(options.query || {}) };

      if (mode === "page") {
        query[pageParam] = currentPage;
        query[limitParam] = pageSize;
      } else if (mode === "offset") {
        query[offsetParam] = currentOffset;
        query[limitParam] = pageSize;
      } else if (mode === "cursor") {
        query[limitParam] = pageSize;
        if (currentCursor) query[cursorParam] = currentCursor;
      }

      const res = await this.get<any>(nextUrl, {
        headers: options.headers,
        query: mode === "link" && pagesFetched > 1 ? undefined : query,
      });

      if (!res.ok) break;
      const items = extractItems(res.data, res);
      if (items.length === 0) break;

      yield items;

      if (mode === "link") {
        const linkNext = parseLinkNextHeader(res.header("link"));
        if (!linkNext) break;
        nextUrl = linkNext;
      } else if (mode === "cursor") {
        const extractor =
          options.extractNextCursor ??
          ((d: any) =>
            d?.nextCursor ?? d?.next_cursor ?? d?.pageInfo?.endCursor ?? null);
        currentCursor = extractor(res.data, res);
        if (!currentCursor) break;
      } else if (mode === "offset") {
        if (items.length < pageSize) break;
        currentOffset += items.length;
      } else {
        if (items.length < pageSize) break;
        currentPage++;
      }
    }
  }

  /** Fetches all pages from a paginated endpoint and returns the concatenated array of items. */
  public async fetchAllPages<T = any>(
    targetPath: string,
    options: PaginationOptions<T> = {},
  ): Promise<T[]> {
    const all: T[] = [];
    for await (const batch of this.paginate<T>(targetPath, options)) {
      all.push(...batch);
    }
    return all;
  }

  private parseSseBlock(block: string): SseEvent | null {
    const trimmed = block.trim();
    if (!trimmed) return null;

    let id: string | undefined;
    let eventName = "message";
    let retry: number | undefined;
    const dataLines: string[] = [];

    for (const line of trimmed.split(/\r?\n/)) {
      if (line.startsWith(":")) continue;
      const colonIdx = line.indexOf(":");
      const field =
        colonIdx >= 0 ? line.slice(0, colonIdx).trim() : line.trim();
      const val =
        colonIdx >= 0 ? line.slice(colonIdx + 1).replace(/^ /, "") : "";

      if (field === "id") id = val;
      else if (field === "event") eventName = val || "message";
      else if (field === "retry") {
        const rNum = parseInt(val, 10);
        if (!Number.isNaN(rNum)) retry = rNum;
      } else if (field === "data") {
        dataLines.push(val);
      }
    }

    if (dataLines.length === 0) return null;
    const dataPayload = dataLines.join("\n");
    return {
      id,
      event: eventName,
      data: dataPayload,
      retry,
      json<U = any>(): U | null {
        try {
          return JSON.parse(dataPayload) as U;
        } catch {
          return null;
        }
      },
    };
  }

  /** Connects to a Server-Sent Events (`text/event-stream`) endpoint and invokes `onEvent` for each parsed SSE block. */
  public async streamSse(
    targetPath: string,
    onEvent: (event: SseEvent) => void | Promise<void>,
    options: RequestOptions = {},
  ): Promise<void> {
    const mergedVars = { ...this.vars, ...(options.vars || {}) };
    const resolvedUrl = this.resolveUrl(
      targetPath,
      options.query,
      options.vars,
    );
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      ...this.buildRequestHeaders(resolvedUrl, mergedVars, options.headers),
    };

    const res = await fetch(resolvedUrl, {
      method: options.body !== undefined ? "POST" : "GET",
      headers,
      body:
        options.body !== undefined
          ? typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body)
          : undefined,
      signal: options.signal,
    });

    if (!res.ok) {
      throw new Error(`SSE stream connection failed with status ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      for (const block of text.split(/\r?\n\r?\n/)) {
        const ev = this.parseSseBlock(block);
        if (ev) await onEvent(ev);
      }
      return;
    }

    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        let sepMatch = buffer.match(/\r?\n\r?\n/);
        while (sepMatch && sepMatch.index !== undefined) {
          const block = buffer.slice(0, sepMatch.index);
          buffer = buffer.slice(sepMatch.index + sepMatch[0].length);
          const ev = this.parseSseBlock(block);
          if (ev) await onEvent(ev);
          sepMatch = buffer.match(/\r?\n\r?\n/);
        }
      }
    }
    if (buffer.trim().length > 0) {
      const ev = this.parseSseBlock(buffer);
      if (ev) await onEvent(ev);
    }
  }

  /** Streams an HTTP response body line-by-line, invoking `onLine` for each non-empty line. */
  public async streamLines(
    targetPath: string,
    onLine: (line: string) => void | Promise<void>,
    options: RequestOptions = {},
  ): Promise<void> {
    const mergedVars = { ...this.vars, ...(options.vars || {}) };
    const resolvedUrl = this.resolveUrl(
      targetPath,
      options.query,
      options.vars,
    );
    const headers = this.buildRequestHeaders(
      resolvedUrl,
      mergedVars,
      options.headers,
    );

    const res = await fetch(resolvedUrl, {
      method: options.body !== undefined ? "POST" : "GET",
      headers,
      body:
        options.body !== undefined
          ? typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body)
          : undefined,
      signal: options.signal,
    });

    if (!res.ok) {
      throw new Error(
        `Line stream connection failed with status ${res.status}`,
      );
    }

    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      for (const line of text.split(/\r?\n/)) {
        if (line.trim().length > 0) await onLine(line);
      }
      return;
    }

    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        let nlIdx = buffer.indexOf("\n");
        while (nlIdx >= 0) {
          const line = buffer.slice(0, nlIdx).replace(/\r$/, "");
          buffer = buffer.slice(nlIdx + 1);
          if (line.trim().length > 0) {
            await onLine(line);
          }
          nlIdx = buffer.indexOf("\n");
        }
      }
    }
    const tail = buffer.replace(/\r$/, "");
    if (tail.trim().length > 0) {
      await onLine(tail);
    }
  }

  /** Streams an NDJSON / JSON Lines HTTP response, parsing each line as JSON and passing it to `onItem`. */
  public async streamJsonLines<T = any>(
    targetPath: string,
    onItem: (item: T) => void | Promise<void>,
    options: RequestOptions = {},
  ): Promise<void> {
    await this.streamLines(
      targetPath,
      async (line) => {
        const parsed = JSON.parse(line) as T;
        await onItem(parsed);
      },
      options,
    );
  }

  // ===========================================================================
  // 10. Health Checks, Readiness Probes, Batching, Benchmarking & cURL
  // ===========================================================================

  /** Performs a non-throwing health check `GET` against `path` (default `/health`) and measures latency. */
  public async healthCheck(
    path: string = "/health",
    expectedStatus: number = 200,
  ): Promise<HealthCheckResult> {
    const start = performance.now();
    const resolvedUrl = this.resolveUrl(path);
    try {
      const res = await this.get(path, { throwOnError: false, retries: 0 });
      return {
        healthy: expectedStatus ? res.statusCode === expectedStatus : res.ok,
        statusCode: res.statusCode,
        latencyMs: res.durationMs,
        url: res.url || resolvedUrl,
        data: res.data,
      };
    } catch (err: any) {
      return {
        healthy: false,
        statusCode: 0,
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
        url: resolvedUrl,
        data: null,
        error: err?.message || String(err),
      };
    }
  }

  /** Polls `path` at `intervalMs` until a 2xx/3xx status is returned or `timeoutMs` elapses. */
  public async waitForReady(
    path: string = "/health",
    timeoutMs: number = 10_000,
    intervalMs: number = 200,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const check = await this.healthCheck(path, 0);
      if (check.statusCode >= 200 && check.statusCode < 400) {
        return true;
      }
      if (Date.now() + intervalMs > deadline) break;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }

  /** Concurrently probes multiple endpoint paths and returns their status codes and latencies in order. */
  public async probeEndpoints(
    endpoints: string[],
    concurrency: number = 5,
  ): Promise<EndpointProbeResult[]> {
    const results: EndpointProbeResult[] = new Array(endpoints.length);
    let idx = 0;

    const worker = async () => {
      while (idx < endpoints.length) {
        const i = idx++;
        const ep = endpoints[i]!;
        const hc = await this.healthCheck(ep, 0);
        results[i] = {
          url: hc.url,
          ok: hc.statusCode >= 200 && hc.statusCode < 400,
          statusCode: hc.statusCode,
          latencyMs: hc.latencyMs,
          error: hc.error,
        };
      }
    };

    const workers = Array.from(
      { length: Math.max(1, Math.min(concurrency, endpoints.length)) },
      () => worker(),
    );
    await Promise.all(workers);
    return results;
  }

  /** Executes a batch of heterogeneous HTTP requests with bounded concurrency and preserves result order. */
  public async batch<T = any>(
    requests: BatchRequestItem[],
    concurrency: number = 5,
  ): Promise<BackendResponse<T>[]> {
    const results: BackendResponse<T>[] = new Array(requests.length);
    let idx = 0;

    const worker = async () => {
      while (idx < requests.length) {
        const i = idx++;
        const req = requests[i]!;
        results[i] = await this.request<T>(req.method || "GET", req.path, {
          ...req.options,
          body: req.body !== undefined ? req.body : req.options?.body,
        });
      }
    };

    const workers = Array.from(
      { length: Math.max(1, Math.min(concurrency, requests.length)) },
      () => worker(),
    );
    await Promise.all(workers);
    return results;
  }

  /** Runs a concurrent load benchmark against `targetPath` and computes latency percentiles (`p50`, `p95`, `p99`) and RPS. */
  public async benchmark(
    targetPath: string,
    options: BenchmarkOptions = {},
  ): Promise<BenchmarkStats> {
    const totalRequests = Math.max(1, options.requests ?? 20);
    const concurrency = Math.max(
      1,
      Math.min(options.concurrency ?? 5, totalRequests),
    );
    const method = (options.method ?? "GET").toUpperCase();
    const url = this.resolveUrl(targetPath);

    const latencies: number[] = [];
    let successful = 0;
    let failed = 0;
    let nextIdx = 0;

    const benchStart = performance.now();

    const worker = async () => {
      while (nextIdx < totalRequests) {
        nextIdx++;
        const reqStart = performance.now();
        try {
          const res = await this.request(method, targetPath, {
            body: options.body,
            headers: options.headers,
            timeoutMs: options.timeoutMs ?? this.timeoutMs,
            throwOnError: false,
            retries: 0,
            cache: false,
          });
          latencies.push(performance.now() - reqStart);
          if (res.ok) successful++;
          else failed++;
        } catch {
          latencies.push(performance.now() - reqStart);
          failed++;
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const totalMs = Math.round((performance.now() - benchStart) * 100) / 100;

    latencies.sort((a, b) => a - b);
    const round = (n: number) => Math.round(n * 100) / 100;
    const pct = (p: number) =>
      latencies[
        Math.min(latencies.length - 1, Math.floor(p * latencies.length))
      ] ?? 0;
    const sum = latencies.reduce((a, b) => a + b, 0);

    return {
      url,
      method,
      requests: totalRequests,
      successful,
      failed,
      successRate: round((successful / totalRequests) * 100),
      totalMs,
      minMs: round(latencies[0] ?? 0),
      avgMs: round(sum / (latencies.length || 1)),
      p50Ms: round(pct(0.5)),
      p95Ms: round(pct(0.95)),
      p99Ms: round(pct(0.99)),
      maxMs: round(latencies[latencies.length - 1] ?? 0),
      rps: totalMs > 0 ? round((totalRequests / totalMs) * 1000) : 0,
    };
  }

  /** Renders an equivalent shell-escaped `curl` command string for the specified request. */
  public toCurl(
    method: string,
    targetPath: string,
    options: RequestOptions = {},
  ): string {
    const upper = String(method || "GET").toUpperCase();
    const mergedVars = { ...this.vars, ...(options.vars || {}) };
    const url = this.resolveUrl(targetPath, options.query, options.vars);
    const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...(options.headers || {}),
    };
    let bodyStr = "";
    if (
      options.body !== undefined &&
      options.body !== null &&
      !["GET", "HEAD"].includes(upper)
    ) {
      if (typeof options.body === "object") {
        bodyStr = interpolateVars(JSON.stringify(options.body), mergedVars);
        if (
          !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")
        ) {
          headers["Content-Type"] = "application/json";
        }
      } else {
        bodyStr = interpolateVars(String(options.body), mergedVars);
      }
    }

    const parts: string[] = [
      upper === "HEAD" ? `curl -I ${sq(url)}` : `curl -X ${upper} ${sq(url)}`,
    ];
    for (const [k, v] of Object.entries(headers)) {
      if (isUnsafeKey(k)) continue;
      const renderedVal =
        options.redactSecrets && this.isSensitiveHeader(k)
          ? "***REDACTED***"
          : interpolateVars(v, mergedVars);
      parts.push(`-H ${sq(`${k}: ${renderedVal}`)}`);
    }
    if (bodyStr) {
      parts.push(`--data-raw ${sq(bodyStr)}`);
    }
    return parts.join(" ");
  }

  /** Parses a `curl` command string into a `ParsedCurlClientRequest` with a configured `BackendClient`. */
  public static fromCurl(curlCommand: string): ParsedCurlClientRequest {
    const clean = String(curlCommand || "")
      .trim()
      .replace(/^\$\s+/, "")
      .replace(/\\\r?\n/g, " ");

    const tokens: string[] = [];
    let cur = "";
    let hasToken = false;
    for (let i = 0; i < clean.length; i++) {
      const c = clean[i]!;
      if (/\s/.test(c)) {
        if (hasToken) {
          tokens.push(cur);
          cur = "";
          hasToken = false;
        }
      } else if (c === "'") {
        hasToken = true;
        const end = clean.indexOf("'", i + 1);
        if (end < 0) {
          cur += clean.slice(i + 1);
          break;
        }
        cur += clean.slice(i + 1, end);
        i = end;
      } else if (c === '"') {
        hasToken = true;
        i++;
        for (; i < clean.length && clean[i] !== '"'; i++) {
          if (clean[i] === "\\" && i + 1 < clean.length) cur += clean[++i];
          else cur += clean[i];
        }
      } else {
        hasToken = true;
        cur += c;
      }
    }
    if (hasToken) tokens.push(cur);

    if (tokens.length === 0 || tokens[0] !== "curl") {
      throw new Error('Command must start with "curl"');
    }

    let method = "";
    let url = "";
    const headers: Record<string, string> = {};
    const dataParts: string[] = [];
    let isHead = false;

    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t === "-X" || t === "--request") {
        method = (tokens[++i] || "GET").toUpperCase();
      } else if (t === "-H" || t === "--header") {
        const hVal = tokens[++i] || "";
        const colonIdx = hVal.indexOf(":");
        if (colonIdx > 0) {
          headers[hVal.slice(0, colonIdx).trim()] = hVal
            .slice(colonIdx + 1)
            .trim();
        }
      } else if (
        ["-d", "--data", "--data-raw", "--data-binary", "--json"].includes(t)
      ) {
        const dVal = tokens[++i] || "";
        dataParts.push(dVal);
        if (t === "--json") {
          headers["Content-Type"] =
            headers["Content-Type"] || "application/json";
          headers["Accept"] = headers["Accept"] || "application/json";
        }
      } else if (t === "-u" || t === "--user") {
        const userPass = tokens[++i] || "";
        headers["Authorization"] =
          `Basic ${Buffer.from(userPass, "utf8").toString("base64")}`;
      } else if (t === "-I" || t === "--head") {
        isHead = true;
      } else if (t === "--url") {
        url = tokens[++i] || "";
      } else if (!t.startsWith("-") && !url) {
        url = t;
      }
    }

    const body = dataParts.join("&");
    const resolvedMethod = isHead ? "HEAD" : method || (body ? "POST" : "GET");
    const client = new BackendClient({ headers });

    return {
      client,
      method: resolvedMethod,
      url,
      headers,
      body,
      execute: <T = any>() =>
        client.request<T>(resolvedMethod, url, {
          body: body || undefined,
        }),
    };
  }
}

/** Value alias for `BackendClient` for API client consumers. */
export const ApiClient = BackendClient;
/** Type alias for `BackendClient` for API client consumers. */
export type ApiClient = BackendClient;

/** Factory function that creates a new `BackendClient` instance. */
export function createBackendClient(
  baseUrlOrOptions?: string | BackendClientOptions,
): BackendClient {
  return new BackendClient(baseUrlOrOptions);
}

/** Alias factory function that creates a new `BackendClient` (`ApiClient`) instance. */
export function createApiClient(
  baseUrlOrOptions?: string | BackendClientOptions,
): BackendClient {
  return new BackendClient(baseUrlOrOptions);
}
