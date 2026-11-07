/**
 * Extended Standard Library for Bun: Cryptography, HTTP, Data Structures, Math/Stats, String Metrics, and Validation
 */

import {
  type BackendClientOptions,
  type BackendResponse,
  type GraphQLResult,
  type RequestOptions,
  type SimpleHttpResponse,
  type SimpleURL,
  type UploadFileInput,
} from "../core/types.ts";
import {
  BackendClient,
  buildQueryString,
  parseQueryString,
  type ParsedCurlClientRequest,
} from "../core/client.ts";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

function normalizeStdlibRequestOptions(
  headersOrOptions?: Record<string, string> | RequestOptions,
  extraBody?: any,
): RequestOptions {
  if (!headersOrOptions) {
    return extraBody !== undefined ? { body: extraBody } : {};
  }
  const optionKeys = new Set([
    "headers",
    "query",
    "body",
    "timeoutMs",
    "retries",
    "retryDelayMs",
    "throwOnError",
    "cacheTtlMs",
    "fallback",
    "signal",
    "vars",
  ]);
  const keys = Object.keys(headersOrOptions);
  const isRequestOpts = keys.some((k) => optionKeys.has(k));
  if (isRequestOpts) {
    const opts = { ...(headersOrOptions as RequestOptions) };
    if (extraBody !== undefined && opts.body === undefined) {
      opts.body = extraBody;
    }
    return opts;
  }
  return {
    headers: headersOrOptions as Record<string, string>,
    ...(extraBody !== undefined ? { body: extraBody } : {}),
  };
}

/** Static extended standard library providing cryptography, HTTP helpers, statistics, string metrics, formatting, and validation. */
export class Stdlib {
  // ===========================================================================
  // 1. Cryptography & Hashing
  // ===========================================================================

  /** Computes the lowercase hex SHA-256 digest of `data`. */
  public static sha256(data: string | Uint8Array): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /** Computes the lowercase hex SHA-512 digest of `data`. */
  public static sha512(data: string | Uint8Array): string {
    return crypto.createHash("sha512").update(data).digest("hex");
  }

  /** Computes the lowercase hex SHA-1 digest of `data`. */
  public static sha1(data: string | Uint8Array): string {
    return crypto.createHash("sha1").update(data).digest("hex");
  }

  /** Computes the lowercase hex MD5 digest of `data`. */
  public static md5(data: string | Uint8Array): string {
    return crypto.createHash("md5").update(data).digest("hex");
  }

  /** Computes the lowercase hex HMAC-SHA256 signature of `data` using `key`. */
  public static hmacSha256(key: string, data: string): string {
    return crypto.createHmac("sha256", key).update(data).digest("hex");
  }

  private static deriveKey(keyOrPassphrase: string): Buffer {
    if (/^[0-9a-fA-F]{64}$/.test(keyOrPassphrase)) {
      return Buffer.from(keyOrPassphrase, "hex");
    }
    return crypto.createHash("sha256").update(keyOrPassphrase, "utf8").digest();
  }

  /** Encrypts `text` with AES-256-CBC using `keyOrPassphrase` and returns `<ivHex>:<base64Ciphertext>`. */
  public static aesEncrypt(
    text: string,
    keyOrPassphrase: string,
    ivHex?: string,
  ): string {
    const key = Stdlib.deriveKey(keyOrPassphrase);
    const iv =
      ivHex && /^[0-9a-fA-F]{32}$/.test(ivHex)
        ? Buffer.from(ivHex, "hex")
        : crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(text, "utf8", "base64");
    encrypted += cipher.final("base64");
    return `${iv.toString("hex")}:${encrypted}`;
  }

  /** Decrypts an `<ivHex>:<base64Ciphertext>` payload produced by `aesEncrypt`. */
  public static aesDecrypt(
    cipherPayload: string,
    keyOrPassphrase: string,
  ): string {
    const parts = cipherPayload.split(":");
    if (parts.length !== 2)
      throw new Error(
        "Invalid cipher payload format (expected ivHex:base64Data)",
      );
    const iv = Buffer.from(parts[0] || "", "hex");
    const encryptedData = parts[1] || "";
    const key = Stdlib.deriveKey(keyOrPassphrase);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedData, "base64", "utf8") as string;
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  /** Hashes a plaintext `password` using `Bun.password` bcrypt (or PBKDF2-SHA256 fallback). */
  public static async bcryptHash(password: string): Promise<string> {
    if (typeof (Bun as any)?.password?.hash === "function") {
      return (Bun as any).password.hash(password, {
        algorithm: "bcrypt",
        cost: 10,
      });
    }
    // WebCrypto / fallback HMAC-based token for test environments without Bun password
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
      .pbkdf2Sync(password, salt, 1000, 32, "sha256")
      .toString("hex");
    return `$pbkdf2$${salt}$${hash}`;
  }

  /** Verifies a plaintext `password` against a hash string produced by `bcryptHash`. */
  public static async bcryptVerify(
    password: string,
    hash: string,
  ): Promise<boolean> {
    if (
      typeof (Bun as any)?.password?.verify === "function" &&
      hash.startsWith("$2")
    ) {
      return (Bun as any).password.verify(password, hash);
    }
    if (hash.startsWith("$pbkdf2$")) {
      const parts = hash.split("$");
      const salt = parts[2] || "";
      const expected = parts[3] || "";
      const actual = crypto
        .pbkdf2Sync(password, salt, 1000, 32, "sha256")
        .toString("hex");
      const aBuf = Buffer.from(actual, "utf8");
      const bBuf = Buffer.from(expected, "utf8");
      return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
    }
    return false;
  }

  /** Generates a random RFC 4122 v4 UUID string. */
  public static uuid(): string {
    return crypto.randomUUID();
  }

  /** Generates a time-ordered UUIDv7 string based on the current millisecond epoch timestamp. */
  public static uuidV7(): string {
    const timestamp = Date.now();
    const timeHex = timestamp.toString(16).padStart(12, "0");
    const randomHex = crypto.randomBytes(10).toString("hex");
    return `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-7${randomHex.slice(0, 3)}-${((parseInt(randomHex.slice(3, 4), 16) & 0x3) | 0x8).toString(16)}${randomHex.slice(4, 7)}-${randomHex.slice(7, 19)}`;
  }

  /** Generates a cryptographically strong random `Buffer` of `length` bytes. */
  public static randomBytes(length: number): Buffer {
    return crypto.randomBytes(length);
  }

  /** Generates a cryptographically random lowercase hex string derived from `byteCount` random bytes. */
  public static randomHex(byteCount: number = 16): string {
    return crypto.randomBytes(byteCount).toString("hex");
  }

  /** Generates a URL-safe random alphanumeric token of `length` characters. */
  public static randomToken(length: number = 32): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let token = "";
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      token += chars[(bytes[i] || 0) % chars.length] || "";
    }
    return token;
  }

  /** Encodes a UTF-8 string into Base64. */
  public static base64Encode(text: string): string {
    return Buffer.from(text, "utf8").toString("base64");
  }

  /** Decodes a Base64 string back into UTF-8 text. */
  public static base64Decode(encoded: string): string {
    return Buffer.from(encoded, "base64").toString("utf8");
  }

  /** Encodes a UTF-8 string into lowercase hexadecimal. */
  public static hexEncode(text: string): string {
    return Buffer.from(text, "utf8").toString("hex");
  }

  /** Decodes a hexadecimal string back into UTF-8 text. */
  public static hexDecode(hexStr: string): string {
    return Buffer.from(hexStr, "hex").toString("utf8");
  }

  /** Applies the ROT13 substitution cipher to ASCII letters in `text`. */
  public static rot13(text: string): string {
    return text.replace(/[a-zA-Z]/g, (c) => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
  }

  /** Percent-encodes a URI component string via `encodeURIComponent`. */
  public static urlEncode(text: string): string {
    return encodeURIComponent(text);
  }

  /** Decodes a percent-encoded URI component string via `decodeURIComponent`. */
  public static urlDecode(text: string): string {
    return decodeURIComponent(text);
  }

  // ===========================================================================
  // 2. HTTP Client, Backend API Ergonomics & File Downloads
  // ===========================================================================

  private static _defaultClient: BackendClient = new BackendClient();

  /** Creates a new `BackendClient` instance with the given base URL or options. */
  public static createClient(
    baseUrlOrOptions?: string | BackendClientOptions,
  ): BackendClient {
    return new BackendClient(baseUrlOrOptions);
  }

  /** Alias for `createClient` that returns a new `BackendClient` instance. */
  public static createApiClient(
    baseUrlOrOptions?: string | BackendClientOptions,
  ): BackendClient {
    return new BackendClient(baseUrlOrOptions);
  }

  /** Performs a simple `GET` request to `url` and returns the response body as a string. */
  public static async httpGet(
    url: string,
    headers: Record<string, string> = {},
  ): Promise<string> {
    const res = await fetch(url, { headers });
    return res.text();
  }

  /** Performs a `POST` request to `url` with a string or JSON object `body` and returns the response text. */
  public static async httpPost(
    url: string,
    body: string | object,
    headers: Record<string, string> = {},
  ): Promise<string> {
    const isJson = typeof body === "object";
    const payload = isJson ? JSON.stringify(body) : body;
    const reqHeaders: Record<string, string> = {
      ...(isJson ? { "Content-Type": "application/json" } : {}),
      ...headers,
    };
    const res = await fetch(url, {
      method: "POST",
      body: payload,
      headers: reqHeaders,
    });
    return res.text();
  }

  /** Sends an arbitrary HTTP request via the default `BackendClient` and returns the full `BackendResponse<T>`. */
  public static async httpRequest<T = any>(
    method: string,
    url: string,
    body?: string | object,
    headersOrOptions: Record<string, string> | RequestOptions = {},
  ): Promise<BackendResponse<T>> {
    const opts = normalizeStdlibRequestOptions(headersOrOptions, body);
    return Stdlib._defaultClient.request<T>(method, url, opts);
  }

  /** Sends a `GET` request to `url` and returns the unwrapped JSON response payload. */
  public static async httpGetJson<T = any>(
    url: string,
    headersOrOptions?: Record<string, string> | RequestOptions,
  ): Promise<T> {
    return Stdlib._defaultClient.getJson<T>(
      url,
      normalizeStdlibRequestOptions(headersOrOptions),
    );
  }

  /** Sends a `POST` request with `body` to `url` and returns the unwrapped JSON response payload. */
  public static async httpPostJson<T = any>(
    url: string,
    body?: any,
    headersOrOptions?: Record<string, string> | RequestOptions,
  ): Promise<T> {
    return Stdlib._defaultClient.postJson<T>(
      url,
      body,
      normalizeStdlibRequestOptions(headersOrOptions),
    );
  }

  /** Sends a `PUT` request with `body` to `url` and returns the unwrapped JSON response payload. */
  public static async httpPutJson<T = any>(
    url: string,
    body?: any,
    headersOrOptions?: Record<string, string> | RequestOptions,
  ): Promise<T> {
    return Stdlib._defaultClient.putJson<T>(
      url,
      body,
      normalizeStdlibRequestOptions(headersOrOptions),
    );
  }

  /** Sends a `PATCH` request with `body` to `url` and returns the unwrapped JSON response payload. */
  public static async httpPatchJson<T = any>(
    url: string,
    body?: any,
    headersOrOptions?: Record<string, string> | RequestOptions,
  ): Promise<T> {
    return Stdlib._defaultClient.patchJson<T>(
      url,
      body,
      normalizeStdlibRequestOptions(headersOrOptions),
    );
  }

  /** Sends a `DELETE` request to `url` and returns the unwrapped JSON response payload. */
  public static async httpDeleteJson<T = any>(
    url: string,
    headersOrOptions?: Record<string, string> | RequestOptions,
  ): Promise<T> {
    return Stdlib._defaultClient.deleteJson<T>(
      url,
      normalizeStdlibRequestOptions(headersOrOptions),
    );
  }

  /** Sends a `HEAD` request to `url` and returns the response headers dictionary. */
  public static async httpHead(
    url: string,
    headersOrOptions?: Record<string, string> | RequestOptions,
  ): Promise<Record<string, string>> {
    const res = await Stdlib._defaultClient.head(
      url,
      normalizeStdlibRequestOptions(headersOrOptions),
    );
    return res.headers;
  }

  /** Submits an `application/x-www-form-urlencoded` `POST` request to `url`. */
  public static async httpPostForm<T = any>(
    url: string,
    fields: Record<string, string | number | boolean>,
    headersOrOptions?: Record<string, string> | RequestOptions,
  ): Promise<BackendResponse<T>> {
    return Stdlib._defaultClient.postForm<T>(
      url,
      fields,
      normalizeStdlibRequestOptions(headersOrOptions),
    );
  }

  /** Submits a `multipart/form-data` file upload `POST` request to `url`. */
  public static async httpUpload<T = any>(
    url: string,
    files: Record<string, UploadFileInput>,
    fields: Record<string, string | number | boolean> = {},
    headersOrOptions?: Record<string, string> | RequestOptions,
  ): Promise<BackendResponse<T>> {
    return Stdlib._defaultClient.upload<T>(
      url,
      files,
      fields,
      normalizeStdlibRequestOptions(headersOrOptions),
    );
  }

  /** Executes an HTTP request with automatic retries (default 3 retries, 200ms backoff). */
  public static async httpRetry<T = any>(
    method: string,
    url: string,
    options: RequestOptions = {},
  ): Promise<BackendResponse<T>> {
    return Stdlib._defaultClient.request<T>(method, url, {
      retries: options.retries ?? 3,
      retryDelayMs: options.retryDelayMs ?? 200,
      ...options,
    });
  }

  /** Executes a GraphQL query or mutation against `url` and returns a `GraphQLResult<T>`. */
  public static async graphql<T = any>(
    url: string,
    query: string,
    variables?: Record<string, any>,
    headersOrOptions?: Record<string, string> | RequestOptions,
  ): Promise<GraphQLResult<T>> {
    return Stdlib._defaultClient.graphql<T>(
      query,
      variables,
      undefined,
      url,
      normalizeStdlibRequestOptions(headersOrOptions),
    );
  }

  /** Builds a URL query string (prefixed with `?`) from a key-value parameter object. */
  public static buildQuery(params: Record<string, any>): string {
    return buildQueryString(params);
  }

  /** Parses a URL or query string into a key-value dictionary. */
  public static parseQuery(queryStr: string): Record<string, string> {
    return parseQueryString(queryStr);
  }

  /** Combines `baseUrl`, an optional relative path, and query parameters into a resolved URL string. */
  public static buildUrl(
    baseUrl: string,
    pathOrQuery?: string | Record<string, any>,
    query?: Record<string, any>,
  ): string {
    if (typeof pathOrQuery === "object" && pathOrQuery !== null) {
      return new BackendClient(baseUrl).resolveUrl("", pathOrQuery);
    }
    return new BackendClient(baseUrl).resolveUrl(pathOrQuery || "", query);
  }

  /** Converts an HTTP method, URL, and `RequestOptions` into a shell-escaped `curl` command string. */
  public static toCurl(
    method: string,
    url: string,
    options: RequestOptions = {},
  ): string {
    return Stdlib._defaultClient.toCurl(method, url, options);
  }

  /** Parses a `curl` command string into a `ParsedCurlClientRequest`. */
  public static fromCurl(curlCommand: string): ParsedCurlClientRequest {
    return BackendClient.fromCurl(curlCommand);
  }

  /** Downloads a file from `url` to `destPath` on disk with optional byte-progress reporting. */
  public static async downloadFile(
    url: string,
    destPath: string,
    onProgress?: (downloaded: number, total: number) => void,
  ): Promise<string> {
    return Stdlib._defaultClient.download(url, destPath, onProgress);
  }

  /** Parses a URL string into its decomposed `SimpleURL` components (`scheme`, `host`, `port`, `path`, `query`, `fragment`). */
  public static parseUrl(urlStr: string): SimpleURL {
    const u = new URL(urlStr);
    return {
      raw: urlStr,
      scheme: u.protocol.replace(":", ""),
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : u.protocol === "https:" ? 443 : 80,
      path: u.pathname,
      query: u.search.replace(/^\?/, ""),
      fragment: u.hash.replace(/^#/, ""),
    };
  }

  // ===========================================================================
  // 3. Math & Statistics
  // ===========================================================================

  /** Returns the arithmetic sum of all numbers in `values`. */
  public static sum(values: number[]): number {
    return values.reduce((acc, v) => acc + v, 0);
  }

  /** Returns the arithmetic mean (average) of `values`, or `0` if empty. */
  public static mean(values: number[]): number {
    if (values.length === 0) return 0;
    return Stdlib.sum(values) / values.length;
  }

  /** Returns the median value of `values`, or `0` if empty. */
  public static median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }

  /** Returns the most frequently occurring number (mode) in `values`, or `0` if empty. */
  public static mode(values: number[]): number {
    if (values.length === 0) return 0;
    const freq: Record<number, number> = {};
    let maxCount = 0;
    let modeVal = values[0] ?? 0;
    for (const v of values) {
      freq[v] = (freq[v] || 0) + 1;
      if (freq[v] > maxCount) {
        maxCount = freq[v];
        modeVal = v;
      }
    }
    return modeVal;
  }

  /** Returns the sample variance of `values` (`0` when fewer than 2 elements). */
  public static variance(values: number[]): number {
    if (values.length <= 1) return 0;
    const m = Stdlib.mean(values);
    const sumDiffSq = values.reduce((acc, v) => acc + Math.pow(v - m, 2), 0);
    return sumDiffSq / (values.length - 1);
  }

  /** Returns the sample standard deviation of `values`. */
  public static stddev(values: number[]): number {
    return Math.sqrt(Stdlib.variance(values));
  }

  /** Returns the root mean square (RMS) of `values`. */
  public static rms(values: number[]): number {
    if (values.length === 0) return 0;
    const sumSq = values.reduce((acc, v) => acc + Math.pow(v, 2), 0);
    return Math.sqrt(sumSq / values.length);
  }

  /** Computes the `p`-th percentile (`0..100`) of `values` using linear interpolation. */
  public static percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
  }

  /** Returns the minimum number in `values`, or `0` if empty. */
  public static min(values: number[]): number {
    return values.length > 0 ? Math.min(...values) : 0;
  }

  /** Returns the maximum number in `values`, or `0` if empty. */
  public static max(values: number[]): number {
    return values.length > 0 ? Math.max(...values) : 0;
  }

  /** Clamps `val` to the inclusive range `[minVal, maxVal]`. */
  public static clamp(val: number, minVal: number, maxVal: number): number {
    return Math.max(minVal, Math.min(maxVal, val));
  }

  /** Linearly interpolates between `start` and `end` by factor `t`. */
  public static lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
  }

  /** Rounds `val` to the specified number of decimal places (default `2`). */
  public static roundPrecision(val: number, decimals: number = 2): number {
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  }

  // ===========================================================================
  // 4. String Metrics & Text Manipulation
  // ===========================================================================

  /** Computes the Levenshtein edit distance between strings `a` and `b`. */
  public static levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    // Ensure b is the shorter string for O(min(m, n)) memory
    if (a.length < b.length) {
      const tmp = a;
      a = b;
      b = tmp;
    }

    const m = a.length;
    const n = b.length;
    const row = new Int32Array(n + 1);
    for (let j = 0; j <= n; j++) row[j] = j;

    for (let i = 1; i <= m; i++) {
      let prevDiag = row[0]!;
      row[0] = i;
      const charA = a.charCodeAt(i - 1);
      for (let j = 1; j <= n; j++) {
        const temp = row[j]!;
        const cost = charA === b.charCodeAt(j - 1) ? 0 : 1;
        const del = row[j]! + 1;
        const ins = row[j - 1]! + 1;
        const sub = prevDiag + cost;
        row[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
        prevDiag = temp;
      }
    }
    return row[n]!;
  }

  /** Computes the Jaro-Winkler similarity score (`0.0` to `1.0`) between strings `s1` and `s2`. */
  public static jaroWinklerSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    const len1 = s1.length;
    const len2 = s2.length;
    if (len1 === 0 || len2 === 0) return 0.0;

    const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);

    let matches = 0;
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, len2);
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0.0;

    let k = 0;
    let transpositions = 0;
    for (let i = 0; i < len1; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    const jaro =
      (matches / len1 +
        matches / len2 +
        (matches - transpositions / 2) / matches) /
      3.0;
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1.0 - jaro);
  }

  /** Returns `true` if all characters of `query` appear in `target` in order (case-insensitive). */
  public static fuzzyMatch(query: string, target: string): boolean {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    let qIdx = 0;
    for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
      if (t[tIdx] === q[qIdx]) qIdx++;
    }
    return qIdx === q.length;
  }

  /** Converts `text` into a lowercase hyphen-separated URL slug. */
  public static slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s-]+/g, "-");
  }

  /** Truncates `text` to `maxLength` characters, appending `suffix` (default `'...'`) if shortened. */
  public static truncate(
    text: string,
    maxLength: number,
    suffix: string = "...",
  ): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, Math.max(0, maxLength - suffix.length)) + suffix;
  }

  /** Wraps `text` across multiple lines so no line exceeds `width` characters (when possible). */
  public static wordWrap(text: string, width: number = 80): string {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine += (currentLine.length > 0 ? " " : "") + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.join("\n");
  }

  /** Capitalizes the first letter of each word in `text` and lowercases the rest. */
  public static titleCase(text: string): string {
    return text.replace(
      /\w\S*/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase(),
    );
  }

  /** Converts `text` into `snake_case`. */
  public static snakeCase(text: string): string {
    return text
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/^_/, "")
      .replace(/[\s-]+/g, "_");
  }

  /** Converts `text` into `camelCase`. */
  public static camelCase(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
  }

  /** Converts `text` into `kebab-case`. */
  public static kebabCase(text: string): string {
    return Stdlib.slugify(text);
  }

  /** Centers `text` within a field of `width` characters padded with `char` (default space). */
  public static padCenter(
    text: string,
    width: number,
    char: string = " ",
  ): string {
    if (text.length >= width) return text;
    const leftPad = Math.floor((width - text.length) / 2);
    const rightPad = width - text.length - leftPad;
    return char.repeat(leftPad) + text + char.repeat(rightPad);
  }

  // ===========================================================================
  // 5. Units & Human Formatting
  // ===========================================================================

  /** Formats a byte count into a human-readable unit string (`B`, `KB`, `MB`, `GB`, `TB`, `PB`). */
  public static humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB", "PB"];
    let u = -1;
    let b = bytes;
    do {
      b /= 1024;
      u++;
    } while (b >= 1024 && u < units.length - 1);
    return `${b.toFixed(2)} ${units[u]}`;
  }

  /** Alias for `humanSize` that formats a byte count into a human-readable string. */
  public static formatBytes(bytes: number): string {
    return Stdlib.humanSize(bytes);
  }

  /** Formats a duration in milliseconds into a compact human-readable string (e.g. `12m 30s`, `2d 4h`). */
  public static humanDuration(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remSec = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remSec}s`;
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    if (hours < 24) return `${hours}h ${remMin}m`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }

  /** Alias for `humanDuration` that formats milliseconds into a human-readable duration. */
  public static formatDuration(ms: number): string {
    return Stdlib.humanDuration(ms);
  }

  /** Formats a `Date` or epoch millisecond timestamp as a relative `"X ago"` string. */
  public static timeAgo(dateOrTimestamp: Date | number): string {
    const timestamp =
      typeof dateOrTimestamp === "number"
        ? dateOrTimestamp
        : dateOrTimestamp.getTime();
    const diffMs = Date.now() - timestamp;
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 5) return "just now";
    if (diffSec < 60) return `${diffSec} seconds ago`;
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `${min} minute${min > 1 ? "s" : ""} ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hour${hr > 1 ? "s" : ""} ago`;
    const days = Math.floor(hr / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  /** Formats `num` with thousands separators and fixed `decimals` places. */
  public static formatNumber(num: number, decimals: number = 2): string {
    return num.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  // ===========================================================================
  // 6. CSV & TOML Parsing
  // ===========================================================================

  /** Parses CSV text into a 2D array of string cells, respecting quoted fields and escaped quotes. */
  public static csvParse(csvText: string, delimiter: string = ","): string[][] {
    const rows: string[][] = [];
    const lines = csvText
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((l) => l.trim().length > 0);

    for (const line of lines) {
      const row: string[] = [];
      let inQuotes = false;
      let cur = "";

      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (c === delimiter && !inQuotes) {
          row.push(cur.trim());
          cur = "";
        } else {
          cur += c;
        }
      }
      row.push(cur.trim());
      rows.push(row);
    }
    return rows;
  }

  /** Parses a simple TOML document into a nested key-value object. */
  public static tomlParse(tomlText: string): Record<string, any> {
    const result: Record<string, any> = {};
    let currentSection = result;
    const lines = tomlText.split("\n");

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      if (line.startsWith("[") && line.endsWith("]")) {
        const sectionName = line.slice(1, -1).trim();
        if (
          sectionName === "__proto__" ||
          sectionName === "constructor" ||
          sectionName === "prototype"
        )
          continue;
        result[sectionName] = {};
        currentSection = result[sectionName];
      } else if (line.includes("=")) {
        const [k = "", ...rest] = line.split("=");
        const key = k.trim();
        if (key === "__proto__" || key === "constructor" || key === "prototype")
          continue;
        let val: any = rest.join("=").trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        } else if (val === "true") {
          val = true;
        } else if (val === "false") {
          val = false;
        } else if (!isNaN(Number(val))) {
          val = Number(val);
        }
        currentSection[key] = val;
      }
    }
    return result;
  }

  // ===========================================================================
  // 7. Validation Engine
  // ===========================================================================

  /** Returns `true` if `val` is a syntactically valid email address. */
  public static isEmail(val: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  }

  /** Returns `true` if `val` is a valid `http:` or `https:` URL. */
  public static isUrl(val: string): boolean {
    try {
      const u = new URL(val);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  /** Returns `true` if `val` is a valid dotted-quad IPv4 address. */
  public static isIPv4(val: string): boolean {
    return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
      val,
    );
  }

  /** Returns `true` if `val` is a full 8-group colon-separated IPv6 address. */
  public static isIPv6(val: string): boolean {
    return /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(val);
  }

  /** Returns `true` if `val` is an integer TCP/UDP port in the range `1..65535`. */
  public static isPort(val: number | string): boolean {
    const num = Number(val);
    return !isNaN(num) && Number.isInteger(num) && num >= 1 && num <= 65535;
  }

  /** Returns `true` if `val` conforms to Semantic Versioning (`X.Y.Z` with optional pre-release/build tags). */
  public static isSemver(val: string): boolean {
    return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(val);
  }

  /** Returns `true` if `val` can be parsed by `JSON.parse` without throwing. */
  public static isJson(val: string): boolean {
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  }

  /** Returns `true` if `val` consists solely of hexadecimal characters (`0-9`, `a-f`, `A-F`). */
  public static isHex(val: string): boolean {
    return /^[0-9a-fA-F]+$/.test(val);
  }

  /** Returns `true` if `val` consists solely of ASCII letters and digits. */
  public static isAlphanumeric(val: string): boolean {
    return /^[a-zA-Z0-9]+$/.test(val);
  }

  /** Returns `true` if `val` is a valid canonical UUID string (versions 1 through 7). */
  public static isUUID(val: string): boolean {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-7][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
      val,
    );
  }
}

// =============================================================================
// Generic Data Collections
// =============================================================================

/** Generic LIFO (last-in, first-out) stack data structure. */
export class Stack<T> {
  private items: T[] = [];
  /** Pushes `item` onto the top of the stack. */
  public push(item: T): void {
    this.items.push(item);
  }
  /** Removes and returns the top item from the stack, or `undefined` if empty. */
  public pop(): T | undefined {
    return this.items.pop();
  }
  /** Returns the top item on the stack without removing it, or `undefined` if empty. */
  public peek(): T | undefined {
    return this.items[this.items.length - 1];
  }
  /** Returns `true` if the stack contains no elements. */
  public isEmpty(): boolean {
    return this.items.length === 0;
  }
  /** Returns the number of elements currently in the stack. */
  public size(): number {
    return this.items.length;
  }
  /** Returns a shallow array copy of the stack's elements from bottom to top. */
  public toArray(): T[] {
    return [...this.items];
  }
  /** Removes all elements from the stack. */
  public clear(): void {
    this.items = [];
  }
}

/** Generic amortized O(1) FIFO (first-in, first-out) queue data structure. */
export class Queue<T> {
  private items: T[] = [];
  private head = 0;
  /** Appends `item` to the back of the queue. */
  public enqueue(item: T): void {
    this.items.push(item);
  }
  /** Removes and returns the front item of the queue, or `undefined` if empty. */
  public dequeue(): T | undefined {
    if (this.head >= this.items.length) return undefined;
    const item = this.items[this.head];
    this.items[this.head] = undefined as any;
    this.head++;
    if (this.head > 64 && this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return item;
  }
  /** Returns the front item of the queue without removing it, or `undefined` if empty. */
  public peek(): T | undefined {
    return this.items[this.head];
  }
  /** Returns `true` if the queue contains no elements. */
  public isEmpty(): boolean {
    return this.head >= this.items.length;
  }
  /** Returns the number of elements currently in the queue. */
  public size(): number {
    return this.items.length - this.head;
  }
  /** Returns an array of the active elements in FIFO order. */
  public toArray(): T[] {
    return this.items.slice(this.head);
  }
  /** Removes all elements from the queue. */
  public clear(): void {
    this.items = [];
    this.head = 0;
  }
}

/** Generic set wrapper supporting algebraic `union`, `intersect`, and `difference` operations. */
export class SetCollection<T> {
  private set: Set<T> = new Set();
  /** Adds `item` to the set. */
  public add(item: T): void {
    this.set.add(item);
  }
  /** Removes `item` from the set and returns `true` if it was present. */
  public remove(item: T): boolean {
    return this.set.delete(item);
  }
  /** Returns `true` if `item` is in the set. */
  public has(item: T): boolean {
    return this.set.has(item);
  }
  /** Returns the number of unique items in the set. */
  public size(): number {
    return this.set.size;
  }
  /** Converts the set into an array of its elements. */
  public toArray(): T[] {
    return Array.from(this.set);
  }
  /** Returns a new `SetCollection<T>` containing elements present in either this set or `other`. */
  public union(other: SetCollection<T>): SetCollection<T> {
    const res = new SetCollection<T>();
    for (const i of this.set) res.add(i);
    for (const i of other.set) res.add(i);
    return res;
  }
  /** Returns a new `SetCollection<T>` containing only elements present in both this set and `other`. */
  public intersect(other: SetCollection<T>): SetCollection<T> {
    const res = new SetCollection<T>();
    for (const i of this.set) {
      if (other.has(i)) res.add(i);
    }
    return res;
  }
  /** Returns a new `SetCollection<T>` containing elements in this set that are not in `other`. */
  public difference(other: SetCollection<T>): SetCollection<T> {
    const res = new SetCollection<T>();
    for (const i of this.set) {
      if (!other.has(i)) res.add(i);
    }
    return res;
  }
}

/** Fixed-capacity circular buffer that overwrites the oldest element when full. */
export class RingBuffer<T> {
  private buffer: (T | undefined)[];
  private capacity: number;
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;

  /** Creates a `RingBuffer` with the specified maximum `capacity`. */
  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /** Appends `item` to the buffer, overwriting the oldest element if at capacity. */
  public push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /** Removes and returns the oldest item from the buffer, or `undefined` if empty. */
  public pop(): T | undefined {
    if (this.count === 0) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    return item;
  }

  /** Returns `true` when the number of stored elements equals `capacity`. */
  public isFull(): boolean {
    return this.count === this.capacity;
  }
  /** Returns `true` when the buffer contains no elements. */
  public isEmpty(): boolean {
    return this.count === 0;
  }
  /** Returns the number of elements currently stored in the buffer. */
  public size(): number {
    return this.count;
  }
  /** Returns the buffered elements ordered from oldest to newest. */
  public toArray(): T[] {
    const res: T[] = [];
    for (let i = 0; i < this.count; i++) {
      res.push(this.buffer[(this.head + i) % this.capacity] as T);
    }
    return res;
  }
}

/** Binary min-heap supporting O(log n) insertion and minimum extraction. */
export class MinHeap<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;

  /** Creates a `MinHeap` ordered by `compareFn` (defaults to natural `<` / `>` comparison). */
  constructor(compareFn?: (a: T, b: T) => number) {
    this.compare =
      compareFn || ((a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /** Inserts `item` into the heap and restores the heap invariant. */
  public push(item: T): void {
    this.heap.push(item);
    this.siftUp(this.heap.length - 1);
  }

  /** Removes and returns the smallest item in the heap, or `undefined` if empty. */
  public pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.siftDown(0);
    }
    return top;
  }

  /** Returns the smallest item in the heap without removing it, or `undefined` if empty. */
  public peek(): T | undefined {
    return this.heap[0];
  }
  /** Returns the number of elements in the heap. */
  public size(): number {
    return this.heap.length;
  }
  /** Returns `true` if the heap contains no elements. */
  public isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private siftUp(index: number): void {
    let child = index;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (this.compare(this.heap[child]!, this.heap[parent]!) < 0) {
        [this.heap[child], this.heap[parent]] = [
          this.heap[parent]!,
          this.heap[child]!,
        ];
        child = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    let parent = index;
    const length = this.heap.length;
    while (parent * 2 + 1 < length) {
      let left = parent * 2 + 1;
      let right = parent * 2 + 2;
      let smallest = left;
      if (
        right < length &&
        this.compare(this.heap[right]!, this.heap[left]!) < 0
      ) {
        smallest = right;
      }
      if (this.compare(this.heap[smallest]!, this.heap[parent]!) < 0) {
        [this.heap[parent], this.heap[smallest]] = [
          this.heap[smallest]!,
          this.heap[parent]!,
        ];
        parent = smallest;
      } else {
        break;
      }
    }
  }
}

/** Min-priority queue backed by a `MinHeap` where lower numeric priority values are dequeued first. */
export class PriorityQueue<T> {
  private minHeap: MinHeap<{ item: T; priority: number }>;

  /** Creates an empty `PriorityQueue`. */
  constructor() {
    this.minHeap = new MinHeap((a, b) => a.priority - b.priority);
  }

  /** Inserts `item` into the queue with the given numeric `priority` (lower numbers have higher priority). */
  public enqueue(item: T, priority: number): void {
    this.minHeap.push({ item, priority });
  }

  /** Removes and returns the highest-priority (lowest numeric priority value) item, or `undefined` if empty. */
  public dequeue(): T | undefined {
    return this.minHeap.pop()?.item;
  }

  /** Returns the highest-priority item without removing it, or `undefined` if empty. */
  public peek(): T | undefined {
    return this.minHeap.peek()?.item;
  }

  /** Returns the number of elements in the priority queue. */
  public size(): number {
    return this.minHeap.size();
  }
  /** Returns `true` if the priority queue is empty. */
  public isEmpty(): boolean {
    return this.minHeap.isEmpty();
  }
}

/** Fixed-capacity Least Recently Used (LRU) cache backed by a JavaScript `Map`. */
export class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, V> = new Map();

  /** Creates an `LRUCache` that holds at most `capacity` entries before evicting the least-recently accessed key. */
  constructor(capacity: number) {
    this.capacity = capacity;
  }

  /** Retrieves the value for `key` and marks it as most-recently used, or returns `undefined` if absent. */
  public get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    const val = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  /** Inserts or updates `key` with `value`, evicting the least-recently used entry if at capacity. */
  public set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  /** Returns `true` if `key` is currently cached (without updating its recency). */
  public has(key: K): boolean {
    return this.cache.has(key);
  }
  /** Returns the current number of entries in the cache. */
  public size(): number {
    return this.cache.size;
  }
  /** Evicts all entries from the cache. */
  public clear(): void {
    this.cache.clear();
  }
}

/** Lowercase convenience alias for the `Stdlib` utility class. */
export const stdlib = Stdlib;
