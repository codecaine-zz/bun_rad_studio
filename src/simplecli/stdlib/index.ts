/**
 * Extended Standard Library for Bun: Cryptography, HTTP, Data Structures, Math/Stats, String Metrics, and Validation
 */

import { type SimpleHttpResponse, type SimpleURL } from '../core/types.ts';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class Stdlib {
  // ===========================================================================
  // 1. Cryptography & Hashing
  // ===========================================================================

  public static sha256(data: string | Uint8Array): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  public static sha512(data: string | Uint8Array): string {
    return crypto.createHash('sha512').update(data).digest('hex');
  }

  public static sha1(data: string | Uint8Array): string {
    return crypto.createHash('sha1').update(data).digest('hex');
  }

  public static md5(data: string | Uint8Array): string {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  public static hmacSha256(key: string, data: string): string {
    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }

  private static deriveKey(keyOrPassphrase: string): Buffer {
    if (/^[0-9a-fA-F]{64}$/.test(keyOrPassphrase)) {
      return Buffer.from(keyOrPassphrase, 'hex');
    }
    return crypto.createHash('sha256').update(keyOrPassphrase, 'utf8').digest();
  }

  public static aesEncrypt(text: string, keyOrPassphrase: string, ivHex?: string): string {
    const key = Stdlib.deriveKey(keyOrPassphrase);
    const iv = ivHex && /^[0-9a-fA-F]{32}$/.test(ivHex) ? Buffer.from(ivHex, 'hex') : crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  public static aesDecrypt(cipherPayload: string, keyOrPassphrase: string): string {
    const parts = cipherPayload.split(':');
    if (parts.length !== 2) throw new Error('Invalid cipher payload format (expected ivHex:base64Data)');
    const iv = Buffer.from(parts[0] || '', 'hex');
    const encryptedData = parts[1] || '';
    const key = Stdlib.deriveKey(keyOrPassphrase);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8') as string;
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  public static async bcryptHash(password: string): Promise<string> {
    if (typeof (Bun as any)?.password?.hash === 'function') {
      return (Bun as any).password.hash(password, { algorithm: 'bcrypt', cost: 10 });
    }
    // WebCrypto / fallback HMAC-based token for test environments without Bun password
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
    return `$pbkdf2$${salt}$${hash}`;
  }

  public static async bcryptVerify(password: string, hash: string): Promise<boolean> {
    if (typeof (Bun as any)?.password?.verify === 'function' && hash.startsWith('$2')) {
      return (Bun as any).password.verify(password, hash);
    }
    if (hash.startsWith('$pbkdf2$')) {
      const parts = hash.split('$');
      const salt = parts[2] || '';
      const expected = parts[3] || '';
      const actual = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
      return actual === expected;
    }
    return false;
  }

  public static uuid(): string {
    return crypto.randomUUID();
  }

  public static uuidV7(): string {
    const timestamp = Date.now();
    const timeHex = timestamp.toString(16).padStart(12, '0');
    const randomHex = crypto.randomBytes(10).toString('hex');
    return `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-7${randomHex.slice(0, 3)}-${(parseInt(randomHex.slice(3, 4), 16) & 0x3 | 0x8).toString(16)}${randomHex.slice(4, 7)}-${randomHex.slice(7, 19)}`;
  }

  public static randomBytes(length: number): Buffer {
    return crypto.randomBytes(length);
  }

  public static randomHex(byteCount: number = 16): string {
    return crypto.randomBytes(byteCount).toString('hex');
  }

  public static randomToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let token = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      token += chars[(bytes[i] || 0) % chars.length] || '';
    }
    return token;
  }

  public static base64Encode(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64');
  }

  public static base64Decode(encoded: string): string {
    return Buffer.from(encoded, 'base64').toString('utf8');
  }

  public static hexEncode(text: string): string {
    return Buffer.from(text, 'utf8').toString('hex');
  }

  public static hexDecode(hexStr: string): string {
    return Buffer.from(hexStr, 'hex').toString('utf8');
  }

  public static rot13(text: string): string {
    return text.replace(/[a-zA-Z]/g, (c) => {
      const base = c <= 'Z' ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
  }

  public static urlEncode(text: string): string {
    return encodeURIComponent(text);
  }

  public static urlDecode(text: string): string {
    return decodeURIComponent(text);
  }

  // ===========================================================================
  // 2. HTTP Client & File Downloads
  // ===========================================================================

  public static async httpGet(url: string, headers: Record<string, string> = {}): Promise<string> {
    const res = await fetch(url, { headers });
    return res.text();
  }

  public static async httpPost(url: string, body: string | object, headers: Record<string, string> = {}): Promise<string> {
    const isJson = typeof body === 'object';
    const payload = isJson ? JSON.stringify(body) : body;
    const reqHeaders: Record<string, string> = {
      ...(isJson ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    };
    const res = await fetch(url, { method: 'POST', body: payload, headers: reqHeaders });
    return res.text();
  }

  public static async httpRequest(method: string, url: string, body?: string | object, headers: Record<string, string> = {}): Promise<SimpleHttpResponse> {
    const isJson = typeof body === 'object' && body !== null;
    const payload = isJson ? JSON.stringify(body) : (body as string | undefined);
    const reqHeaders: Record<string, string> = {
      ...(isJson ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    };

    const res = await fetch(url, {
      method: method.toUpperCase(),
      body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : payload,
      headers: reqHeaders,
    });

    const resBody = await res.text();
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => { respHeaders[key] = val; });

    return {
      statusCode: res.status,
      body: resBody,
      url: res.url,
      headers: respHeaders,
    };
  }

  public static async downloadFile(url: string, destPath: string, onProgress?: (downloaded: number, total: number) => void): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Download failed with status ${res.status}: ${res.statusText}`);

    const total = parseInt(res.headers.get('content-length') || '0', 10);
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const fileStream = fs.createWriteStream(destPath);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('Response body reader not available');

    let downloaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        fileStream.write(Buffer.from(value));
        downloaded += value.length;
        if (onProgress) onProgress(downloaded, total);
      }
    }
    fileStream.end();
    return destPath;
  }

  public static parseUrl(urlStr: string): SimpleURL {
    const u = new URL(urlStr);
    return {
      raw: urlStr,
      scheme: u.protocol.replace(':', ''),
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname,
      query: u.search.replace(/^\?/, ''),
      fragment: u.hash.replace(/^#/, ''),
    };
  }

  // ===========================================================================
  // 3. Math & Statistics
  // ===========================================================================

  public static sum(values: number[]): number {
    return values.reduce((acc, v) => acc + v, 0);
  }

  public static mean(values: number[]): number {
    if (values.length === 0) return 0;
    return Stdlib.sum(values) / values.length;
  }

  public static median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }

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

  public static variance(values: number[]): number {
    if (values.length <= 1) return 0;
    const m = Stdlib.mean(values);
    const sumDiffSq = values.reduce((acc, v) => acc + Math.pow(v - m, 2), 0);
    return sumDiffSq / (values.length - 1);
  }

  public static stddev(values: number[]): number {
    return Math.sqrt(Stdlib.variance(values));
  }

  public static rms(values: number[]): number {
    if (values.length === 0) return 0;
    const sumSq = values.reduce((acc, v) => acc + Math.pow(v, 2), 0);
    return Math.sqrt(sumSq / values.length);
  }

  public static percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
  }

  public static min(values: number[]): number {
    return values.length > 0 ? Math.min(...values) : 0;
  }

  public static max(values: number[]): number {
    return values.length > 0 ? Math.max(...values) : 0;
  }

  public static clamp(val: number, minVal: number, maxVal: number): number {
    return Math.max(minVal, Math.min(maxVal, val));
  }

  public static lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
  }

  public static roundPrecision(val: number, decimals: number = 2): number {
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  }

  // ===========================================================================
  // 4. String Metrics & Text Manipulation
  // ===========================================================================

  public static levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i]![0] = i;
    for (let j = 0; j <= n; j++) dp[0]![j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i]![j] = dp[i - 1]![j - 1]!;
        } else {
          dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
        }
      }
    }
    return dp[m]![n]!;
  }

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

    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1.0 - jaro);
  }

  public static fuzzyMatch(query: string, target: string): boolean {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    let qIdx = 0;
    for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
      if (t[tIdx] === q[qIdx]) qIdx++;
    }
    return qIdx === q.length;
  }

  public static slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s-]+/g, '-');
  }

  public static truncate(text: string, maxLength: number, suffix: string = '...'): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, Math.max(0, maxLength - suffix.length)) + suffix;
  }

  public static wordWrap(text: string, width: number = 80): string {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine += (currentLine.length > 0 ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.join('\n');
  }

  public static titleCase(text: string): string {
    return text.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
  }

  public static snakeCase(text: string): string {
    return text
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
      .replace(/[\s-]+/g, '_');
  }

  public static camelCase(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
  }

  public static kebabCase(text: string): string {
    return Stdlib.slugify(text);
  }

  public static padCenter(text: string, width: number, char: string = ' '): string {
    if (text.length >= width) return text;
    const leftPad = Math.floor((width - text.length) / 2);
    const rightPad = width - text.length - leftPad;
    return char.repeat(leftPad) + text + char.repeat(rightPad);
  }

  // ===========================================================================
  // 5. Units & Human Formatting
  // ===========================================================================

  public static humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
    let u = -1;
    let b = bytes;
    do {
      b /= 1024;
      u++;
    } while (b >= 1024 && u < units.length - 1);
    return `${b.toFixed(2)} ${units[u]}`;
  }

  public static formatBytes(bytes: number): string {
    return Stdlib.humanSize(bytes);
  }

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

  public static formatDuration(ms: number): string {
    return Stdlib.humanDuration(ms);
  }

  public static timeAgo(dateOrTimestamp: Date | number): string {
    const timestamp = typeof dateOrTimestamp === 'number' ? dateOrTimestamp : dateOrTimestamp.getTime();
    const diffMs = Date.now() - timestamp;
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return `${diffSec} seconds ago`;
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `${min} minute${min > 1 ? 's' : ''} ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hour${hr > 1 ? 's' : ''} ago`;
    const days = Math.floor(hr / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  public static formatNumber(num: number, decimals: number = 2): string {
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  // ===========================================================================
  // 6. CSV & TOML Parsing
  // ===========================================================================

  public static csvParse(csvText: string, delimiter: string = ','): string[][] {
    const rows: string[][] = [];
    const lines = csvText.split('\n').filter(l => l.trim().length > 0);

    for (const line of lines) {
      const row: string[] = [];
      let inQuotes = false;
      let cur = '';

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
          cur = '';
        } else {
          cur += c;
        }
      }
      row.push(cur.trim());
      rows.push(row);
    }
    return rows;
  }

  public static tomlParse(tomlText: string): Record<string, any> {
    const result: Record<string, any> = {};
    let currentSection = result;
    const lines = tomlText.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('[') && line.endsWith(']')) {
        const sectionName = line.slice(1, -1).trim();
        result[sectionName] = {};
        currentSection = result[sectionName];
      } else if (line.includes('=')) {
        const [k = '', ...rest] = line.split('=');
        const key = k.trim();
        let val: any = rest.join('=').trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        } else if (val === 'true') {
          val = true;
        } else if (val === 'false') {
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

  public static isEmail(val: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  }

  public static isUrl(val: string): boolean {
    try {
      const u = new URL(val);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  public static isIPv4(val: string): boolean {
    return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(val);
  }

  public static isIPv6(val: string): boolean {
    return /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(val);
  }

  public static isPort(val: number | string): boolean {
    const num = Number(val);
    return !isNaN(num) && Number.isInteger(num) && num >= 1 && num <= 65535;
  }

  public static isSemver(val: string): boolean {
    return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(val);
  }

  public static isJson(val: string): boolean {
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  }

  public static isHex(val: string): boolean {
    return /^[0-9a-fA-F]+$/.test(val);
  }

  public static isAlphanumeric(val: string): boolean {
    return /^[a-zA-Z0-9]+$/.test(val);
  }

  public static isUUID(val: string): boolean {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-7][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(val);
  }
}

// =============================================================================
// Generic Data Collections
// =============================================================================

export class Stack<T> {
  private items: T[] = [];
  public push(item: T): void { this.items.push(item); }
  public pop(): T | undefined { return this.items.pop(); }
  public peek(): T | undefined { return this.items[this.items.length - 1]; }
  public isEmpty(): boolean { return this.items.length === 0; }
  public size(): number { return this.items.length; }
  public toArray(): T[] { return [...this.items]; }
  public clear(): void { this.items = []; }
}

export class Queue<T> {
  private items: T[] = [];
  public enqueue(item: T): void { this.items.push(item); }
  public dequeue(): T | undefined { return this.items.shift(); }
  public peek(): T | undefined { return this.items[0]; }
  public isEmpty(): boolean { return this.items.length === 0; }
  public size(): number { return this.items.length; }
  public toArray(): T[] { return [...this.items]; }
  public clear(): void { this.items = []; }
}

export class SetCollection<T> {
  private set: Set<T> = new Set();
  public add(item: T): void { this.set.add(item); }
  public remove(item: T): boolean { return this.set.delete(item); }
  public has(item: T): boolean { return this.set.has(item); }
  public size(): number { return this.set.size; }
  public toArray(): T[] { return Array.from(this.set); }
  public union(other: SetCollection<T>): SetCollection<T> {
    const res = new SetCollection<T>();
    this.toArray().forEach(i => res.add(i));
    other.toArray().forEach(i => res.add(i));
    return res;
  }
  public intersect(other: SetCollection<T>): SetCollection<T> {
    const res = new SetCollection<T>();
    this.toArray().forEach(i => { if (other.has(i)) res.add(i); });
    return res;
  }
  public difference(other: SetCollection<T>): SetCollection<T> {
    const res = new SetCollection<T>();
    this.toArray().forEach(i => { if (!other.has(i)) res.add(i); });
    return res;
  }
}

export class RingBuffer<T> {
  private buffer: (T | undefined)[];
  private capacity: number;
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  public push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  public pop(): T | undefined {
    if (this.count === 0) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    return item;
  }

  public isFull(): boolean { return this.count === this.capacity; }
  public isEmpty(): boolean { return this.count === 0; }
  public size(): number { return this.count; }
  public toArray(): T[] {
    const res: T[] = [];
    for (let i = 0; i < this.count; i++) {
      res.push(this.buffer[(this.head + i) % this.capacity] as T);
    }
    return res;
  }
}

export class MinHeap<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compareFn?: (a: T, b: T) => number) {
    this.compare = compareFn || ((a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0));
  }

  public push(item: T): void {
    this.heap.push(item);
    this.siftUp(this.heap.length - 1);
  }

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

  public peek(): T | undefined { return this.heap[0]; }
  public size(): number { return this.heap.length; }
  public isEmpty(): boolean { return this.heap.length === 0; }

  private siftUp(index: number): void {
    let child = index;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (this.compare(this.heap[child]!, this.heap[parent]!) < 0) {
        [this.heap[child], this.heap[parent]] = [this.heap[parent]!, this.heap[child]!];
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
      if (right < length && this.compare(this.heap[right]!, this.heap[left]!) < 0) {
        smallest = right;
      }
      if (this.compare(this.heap[smallest]!, this.heap[parent]!) < 0) {
        [this.heap[parent], this.heap[smallest]] = [this.heap[smallest]!, this.heap[parent]!];
        parent = smallest;
      } else {
        break;
      }
    }
  }
}

export class PriorityQueue<T> {
  private minHeap: MinHeap<{ item: T; priority: number }>;

  constructor() {
    this.minHeap = new MinHeap((a, b) => a.priority - b.priority);
  }

  public enqueue(item: T, priority: number): void {
    this.minHeap.push({ item, priority });
  }

  public dequeue(): T | undefined {
    return this.minHeap.pop()?.item;
  }

  public peek(): T | undefined {
    return this.minHeap.peek()?.item;
  }

  public size(): number { return this.minHeap.size(); }
  public isEmpty(): boolean { return this.minHeap.isEmpty(); }
}

export class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, V> = new Map();

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  public get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    const val = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  public set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  public has(key: K): boolean { return this.cache.has(key); }
  public size(): number { return this.cache.size; }
  public clear(): void { this.cache.clear(); }
}

export const stdlib = Stdlib;
