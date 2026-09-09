/**
 * Cross-platform OS system calls, hardware telemetry, process management, and network diagnostics for Bun
 */

import { type ExecResult, type DiskStats, type FileMetadata } from '../core/types.ts';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as net from 'node:net';
import * as dns from 'node:dns';
import * as zlib from 'node:zlib';
import { spawnSync, spawn } from 'node:child_process';

export class Sys {
  // ===========================================================================
  // 1. Process Execution & Subprocess Control
  // ===========================================================================

  public static exec(command: string, cwd?: string): [string, number] {
    try {
      const res = spawnSync(command, {
        shell: true,
        cwd: cwd || process.cwd(),
        encoding: 'utf8',
        env: process.env,
      });
      const stdout = (res.stdout || '').trim();
      const stderr = (res.stderr || '').trim();
      const output = stdout || stderr;
      return [output, res.status ?? (res.error ? 1 : 0)];
    } catch (err: any) {
      return [err?.message || String(err), 1];
    }
  }

  public static execOr(command: string, fallback: string = '', cwd?: string): string {
    const [out, code] = Sys.exec(command, cwd);
    return code === 0 && out.length > 0 ? out : fallback;
  }

  public static execBg(command: string, cwd?: string): number | undefined {
    try {
      const proc = spawn(command, {
        shell: true,
        cwd: cwd || process.cwd(),
        detached: true,
        stdio: 'ignore',
      });
      proc.unref();
      return proc.pid;
    } catch {
      return undefined;
    }
  }

  public static execInDir(dir: string, command: string): [string, number] {
    return Sys.exec(command, dir);
  }

  public static async execTimeout(command: string, timeoutMs: number = 5000, cwd?: string): Promise<ExecResult> {
    const start = performance.now();
    return new Promise((resolve) => {
      let timedOut = false;
      const proc = spawn(command, {
        shell: true,
        cwd: cwd || process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (d) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Math.round(performance.now() - start);
        resolve({
          output: (stdout || stderr).trim(),
          exitCode: timedOut ? 124 : (code ?? 0),
          durationMs,
          timedOut,
          attempts: 1,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          output: err.message,
          exitCode: 1,
          durationMs: Math.round(performance.now() - start),
          timedOut: false,
          attempts: 1,
        });
      });
    });
  }

  public static async execRetry(command: string, maxRetries: number = 3, delayMs: number = 500, cwd?: string): Promise<ExecResult> {
    const start = performance.now();
    let attempts = 0;
    let lastOut = '';
    let lastCode = 1;

    while (attempts < maxRetries) {
      attempts++;
      const [out, code] = Sys.exec(command, cwd);
      lastOut = out;
      lastCode = code;

      if (code === 0) {
        return {
          output: out,
          exitCode: 0,
          durationMs: Math.round(performance.now() - start),
          timedOut: false,
          attempts,
        };
      }

      if (attempts < maxRetries) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    return {
      output: lastOut,
      exitCode: lastCode,
      durationMs: Math.round(performance.now() - start),
      timedOut: false,
      attempts,
    };
  }

  public static async execParallel(commands: string[], concurrency: number = 4): Promise<[string, number][]> {
    const results: [string, number][] = new Array(commands.length);
    let index = 0;

    const worker = async () => {
      while (index < commands.length) {
        const i = index++;
        const cmd = commands[i];
        if (cmd) results[i] = Sys.exec(cmd);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, commands.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  public static killProcess(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // 2. Hardware Telemetry & Resource Probing
  // ===========================================================================

  public static cpuCount(): number {
    return os.cpus().length || 1;
  }

  public static cpuModel(): string {
    return os.cpus()[0]?.model || 'Unknown CPU';
  }

  public static cpuLoad(): [number, number, number] {
    const load = os.loadavg();
    return [load[0] ?? 0, load[1] ?? 0, load[2] ?? 0];
  }

  public static ramTotal(): number {
    return os.totalmem();
  }

  public static ramFree(): number {
    return os.freemem();
  }

  public static ramUsed(): number {
    return os.totalmem() - os.freemem();
  }

  public static ramPercent(): number {
    const total = os.totalmem();
    if (total === 0) return 0;
    return Number(((Sys.ramUsed() / total) * 100).toFixed(1));
  }

  public static osPlatform(): string {
    return os.platform();
  }

  public static osArch(): string {
    return os.arch();
  }

  public static osRelease(): string {
    return os.release();
  }

  public static osHostname(): string {
    return os.hostname();
  }

  public static osHomedir(): string {
    return os.homedir();
  }

  public static osTmpdir(): string {
    return os.tmpdir();
  }

  public static osUptime(): number {
    return os.uptime();
  }

  public static batteryPercent(): number {
    const p = os.platform();
    if (p === 'darwin') {
      const out = Sys.execOr('pmset -g batt', '');
      const match = out.match(/(\d+)%/);
      if (match?.[1]) return parseInt(match[1], 10);
    } else if (p === 'linux') {
      try {
        const cap = fs.readFileSync('/sys/class/power_supply/BAT0/capacity', 'utf8');
        return parseInt(cap.trim(), 10);
      } catch {
        // fallback
      }
    }
    return 100;
  }

  public static isCharging(): boolean {
    const p = os.platform();
    if (p === 'darwin') {
      const out = Sys.execOr('pmset -g batt', '');
      return out.includes('charging') || out.includes('AC Power');
    } else if (p === 'linux') {
      try {
        const status = fs.readFileSync('/sys/class/power_supply/BAT0/status', 'utf8');
        return status.trim().toLowerCase() === 'charging';
      } catch {
        // fallback
      }
    }
    return true;
  }

  // ===========================================================================
  // 3. File System Helpers
  // ===========================================================================

  public static expandTilde(filePath: string): string {
    if (filePath.startsWith('~')) {
      return path.resolve(os.homedir(), filePath.slice(1).replace(/^[/\\]/, ''));
    }
    return path.resolve(filePath);
  }

  public static diskStats(targetPath: string = '/'): DiskStats {
    try {
      const [out, code] = Sys.exec(`df -k "${targetPath}"`);
      if (code === 0) {
        const lines = out.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        if (lines.length >= 2 && lastLine) {
          const parts = lastLine.split(/\s+/);
          if (parts.length >= 5) {
            const totalBytes = (parseInt(parts[1] || '0', 10) || 0) * 1024;
            const usedBytes = (parseInt(parts[2] || '0', 10) || 0) * 1024;
            const freeBytes = (parseInt(parts[3] || '0', 10) || 0) * 1024;
            const pctStr = (parts[4] || '0').replace('%', '');
            const percent = parseFloat(pctStr) || (totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0);
            return { totalBytes, usedBytes, freeBytes, percent: Number(percent.toFixed(1)) };
          }
        }
      }
    } catch {
      // fallback
    }

    const totalBytes = 100 * 1024 * 1024 * 1024;
    return { totalBytes, usedBytes: 40 * 1024 * 1024 * 1024, freeBytes: 60 * 1024 * 1024 * 1024, percent: 40.0 };
  }

  public static fileMetadata(filePath: string): FileMetadata | null {
    const fullPath = Sys.expandTilde(filePath);
    if (!fs.existsSync(fullPath)) return null;

    try {
      const st = fs.statSync(fullPath);
      let isReadable = false;
      let isWritable = false;
      try {
        fs.accessSync(fullPath, fs.constants.R_OK);
        isReadable = true;
      } catch {}
      try {
        fs.accessSync(fullPath, fs.constants.W_OK);
        isWritable = true;
      } catch {}

      return {
        path: fullPath,
        name: path.basename(fullPath),
        sizeBytes: st.size,
        isDir: st.isDirectory(),
        isLink: st.isSymbolicLink(),
        isReadable,
        isWritable,
        createdTime: Math.round(st.birthtimeMs),
        modifiedTime: Math.round(st.mtimeMs),
      };
    } catch {
      return null;
    }
  }

  public static tempFile(prefix: string = 'tmp_', suffix: string = ''): string {
    const rand = Math.random().toString(36).substring(2, 8);
    const fileName = `${prefix}${Date.now()}_${rand}${suffix}`;
    return path.join(os.tmpdir(), fileName);
  }

  public static tempDir(prefix: string = 'tmp_dir_'): string {
    const dirPath = Sys.tempFile(prefix);
    fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
  }

  public static touch(filePath: string): void {
    const full = Sys.expandTilde(filePath);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    try {
      fs.utimesSync(full, now, now);
    } catch {
      fs.closeSync(fs.openSync(full, 'w'));
    }
  }

  public static chmod(filePath: string, mode: number | string): void {
    const full = Sys.expandTilde(filePath);
    fs.chmodSync(full, mode);
  }

  public static findFiles(rootDir: string, pattern?: RegExp | string): string[] {
    const results: string[] = [];
    const root = Sys.expandTilde(rootDir);
    if (!fs.existsSync(root)) return results;

    const regex = pattern ? (typeof pattern === 'string' ? new RegExp(pattern) : pattern) : null;

    const scan = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scan(full);
          } else {
            if (!regex || regex.test(entry.name) || regex.test(full)) {
              results.push(full);
            }
          }
        }
      } catch {
        // Skip inaccessible dirs
      }
    };

    scan(root);
    return results;
  }

  // ===========================================================================
  // 4. Network Diagnostics & Port Probing
  // ===========================================================================

  public static networkInterfaces(): Record<string, string[]> {
    const ifaces = os.networkInterfaces();
    const result: Record<string, string[]> = {};
    for (const [name, addrs] of Object.entries(ifaces)) {
      if (addrs) {
        result[name] = addrs.map(a => a.address);
      }
    }
    return result;
  }

  public static localIp(): string {
    const ifaces = os.networkInterfaces();
    for (const addrs of Object.values(ifaces)) {
      if (addrs) {
        for (const a of addrs) {
          if (!a.internal && a.family === 'IPv4') {
            return a.address;
          }
        }
      }
    }
    return '127.0.0.1';
  }

  public static macAddress(): string {
    const ifaces = os.networkInterfaces();
    for (const addrs of Object.values(ifaces)) {
      if (addrs) {
        for (const a of addrs) {
          if (!a.internal && a.mac && a.mac !== '00:00:00:00:00:00') {
            return a.mac;
          }
        }
      }
    }
    return '00:00:00:00:00:00';
  }

  public static wifiSsid(): string {
    const p = os.platform();
    if (p === 'darwin') {
      const out = Sys.execOr('/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I', '');
      const match = out.match(/\bSSID:\s*(.+)/);
      if (match?.[1]) return match[1].trim();
      const out2 = Sys.execOr('networksetup -getairportnetwork en0', '');
      const match2 = out2.match(/Current Wi-Fi Network:\s*(.+)/);
      if (match2?.[1]) return match2[1].trim();
    } else if (p === 'linux') {
      return Sys.execOr('iwgetid -r', 'Unknown Wi-Fi');
    }
    return 'Wi-Fi Connected';
  }

  public static async pingCheck(host: string = '8.8.8.8', timeoutMs: number = 2000): Promise<boolean> {
    const p = os.platform();
    const flag = p === 'win32' ? '-n 1 -w' : '-c 1 -W';
    const timeoutSec = Math.max(1, Math.round(timeoutMs / 1000));
    const [_, code] = Sys.exec(`ping ${flag} ${timeoutSec} ${host}`);
    return code === 0;
  }

  public static async checkPort(host: string, port: number, timeoutMs: number = 1000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });
  }

  public static async portScan(host: string, startPort: number, endPort: number, timeoutMs: number = 600): Promise<number[]> {
    const openPorts: number[] = [];
    const ports: number[] = [];
    for (let p = startPort; p <= endPort; p++) ports.push(p);

    const concurrency = 20;
    let idx = 0;

    const worker = async () => {
      while (idx < ports.length) {
        const port = ports[idx++];
        if (port !== undefined) {
          const isOpen = await Sys.checkPort(host, port, timeoutMs);
          if (isOpen) {
            openPorts.push(port);
          }
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return openPorts.sort((a, b) => a - b);
  }

  // ===========================================================================
  // 5. Desktop Notifications, Audio & Speech
  // ===========================================================================

  public static notify(title: string, message: string, sound: boolean = true): void {
    const p = os.platform();
    if (p === 'darwin') {
      const soundArg = sound ? ' sound name "default"' : '';
      const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"${soundArg}`;
      Sys.exec(`osascript -e '${script}'`);
    } else if (p === 'linux') {
      Sys.exec(`notify-send "${title.replace(/"/g, '\\"')}" "${message.replace(/"/g, '\\"')}"`);
    }
  }

  public static say(text: string, voice?: string, rate?: number): void {
    const p = os.platform();
    if (p === 'darwin') {
      const voiceArg = voice ? ` -v "${voice}"` : '';
      const rateArg = rate ? ` -r ${rate}` : '';
      Sys.execBg(`say${voiceArg}${rateArg} "${text.replace(/"/g, '\\"')}"`);
    } else if (p === 'linux') {
      Sys.execBg(`spd-say "${text.replace(/"/g, '\\"')}" || espeak "${text.replace(/"/g, '\\"')}"`);
    }
  }

  public static beep(): void {
    process.stdout.write('\x07');
  }

  public static clipboardCopy(text: string): boolean {
    const p = os.platform();
    if (p === 'darwin') {
      try {
        const res = spawnSync('pbcopy', { input: text, encoding: 'utf8' });
        return res.status === 0;
      } catch { return false; }
    } else if (p === 'linux') {
      try {
        const res = spawnSync('xclip', ['-selection', 'clipboard'], { input: text, encoding: 'utf8' });
        return res.status === 0;
      } catch { return false; }
    }
    return false;
  }

  public static clipboardPaste(): string {
    const p = os.platform();
    if (p === 'darwin') {
      return Sys.execOr('pbpaste', '');
    } else if (p === 'linux') {
      return Sys.execOr('xclip -selection clipboard -o', '');
    }
    return '';
  }

  public static openUrl(urlOrPath: string): boolean {
    const p = os.platform();
    const cmd = p === 'darwin' ? 'open' : (p === 'win32' ? 'start' : 'xdg-open');
    const [_, code] = Sys.exec(`${cmd} "${urlOrPath}"`);
    return code === 0;
  }

  // ===========================================================================
  // 6. Native High-Speed File I/O Ergonomics (Bun.file & Bun.write)
  // ===========================================================================

  public static async readText(filePath: string): Promise<string> {
    const full = Sys.expandTilde(filePath);
    if (typeof (Bun as any)?.file === 'function') {
      return await (Bun as any).file(full).text();
    }
    return fs.promises.readFile(full, 'utf8');
  }

  public static readTextSync(filePath: string): string {
    const full = Sys.expandTilde(filePath);
    return fs.readFileSync(full, 'utf8');
  }

  public static async readJson<T = any>(filePath: string, fallback?: T): Promise<T> {
    try {
      const full = Sys.expandTilde(filePath);
      if (typeof (Bun as any)?.file === 'function') {
        return (await (Bun as any).file(full).json()) as T;
      }
      const raw = await fs.promises.readFile(full, 'utf8');
      return JSON.parse(raw) as T;
    } catch (err) {
      if (fallback !== undefined) return fallback;
      throw err;
    }
  }

  public static readJsonSync<T = any>(filePath: string, fallback?: T): T {
    try {
      const full = Sys.expandTilde(filePath);
      const raw = fs.readFileSync(full, 'utf8');
      return JSON.parse(raw) as T;
    } catch (err) {
      if (fallback !== undefined) return fallback;
      throw err;
    }
  }

  public static async readBytes(filePath: string): Promise<Uint8Array> {
    const full = Sys.expandTilde(filePath);
    if (typeof (Bun as any)?.file === 'function') {
      return await (Bun as any).file(full).bytes();
    }
    const buf = await fs.promises.readFile(full);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  public static async write(filePath: string, data: string | Uint8Array | ArrayBuffer | Blob): Promise<number> {
    const full = Sys.expandTilde(filePath);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (typeof (Bun as any)?.write === 'function') {
      return await (Bun as any).write(full, data);
    }
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data as any);
    await fs.promises.writeFile(full, buf);
    return buf.byteLength;
  }

  public static writeSync(filePath: string, data: string | Uint8Array | ArrayBuffer): void {
    const full = Sys.expandTilde(filePath);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data as any);
    fs.writeFileSync(full, buf);
  }

  public static async writeJson(filePath: string, data: any, indent: number = 2): Promise<number> {
    const jsonStr = JSON.stringify(data, null, indent);
    return await Sys.write(filePath, jsonStr);
  }

  public static async append(filePath: string, data: string | Uint8Array): Promise<void> {
    const full = Sys.expandTilde(filePath);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await fs.promises.appendFile(full, data as any);
  }

  public static async fileExists(filePath: string): Promise<boolean> {
    const full = Sys.expandTilde(filePath);
    if (typeof (Bun as any)?.file === 'function') {
      return await (Bun as any).file(full).exists();
    }
    return fs.existsSync(full);
  }

  public static fileSize(filePath: string): number {
    const full = Sys.expandTilde(filePath);
    if (typeof (Bun as any)?.file === 'function') {
      return (Bun as any).file(full).size;
    }
    try {
      return fs.statSync(full).size;
    } catch {
      return 0;
    }
  }

  public static fileMime(filePath: string): string {
    const full = Sys.expandTilde(filePath);
    if (typeof (Bun as any)?.file === 'function') {
      return (Bun as any).file(full).type || 'application/octet-stream';
    }
    const ext = path.extname(full).toLowerCase();
    const map: Record<string, string> = {
      '.json': 'application/json',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.csv': 'text/csv',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    };
    return map[ext] || 'application/octet-stream';
  }

  public static deleteFile(filePath: string): boolean {
    try {
      const full = Sys.expandTilde(filePath);
      if (fs.existsSync(full)) {
        fs.unlinkSync(full);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public static ensureDir(dirPath: string): void {
    const full = Sys.expandTilde(dirPath);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
    }
  }

  // ===========================================================================
  // 7. Binary Resolution & Environment Probing (Bun.which & Bun.env)
  // ===========================================================================

  public static which(binName: string): string | null {
    if (typeof (Bun as any)?.which === 'function') {
      return (Bun as any).which(binName);
    }
    const [out, code] = Sys.exec(`which "${binName}"`);
    return code === 0 && out ? out.trim() : null;
  }

  public static hasBinary(binName: string): boolean {
    return Sys.which(binName) !== null;
  }

  public static getEnv(key: string, defaultVal: string = ''): string {
    return process.env[key] ?? ((Bun as any)?.env?.[key] || defaultVal);
  }

  public static setEnv(key: string, value: string): void {
    process.env[key] = value;
    if ((Bun as any)?.env) {
      (Bun as any).env[key] = value;
    }
  }

  public static requireEnv(key: string): string {
    const val = Sys.getEnv(key);
    if (!val) {
      throw new Error(`Required environment variable "${key}" is not defined.`);
    }
    return val;
  }

  // ===========================================================================
  // 8. High-Precision Time, Benchmarking & Async Sleep
  // ===========================================================================

  public static async sleep(ms: number): Promise<void> {
    if (typeof (Bun as any)?.sleep === 'function') {
      await (Bun as any).sleep(ms);
    } else {
      await new Promise((r) => setTimeout(r, ms));
    }
  }

  public static nanoseconds(): number {
    if (typeof (Bun as any)?.nanoseconds === 'function') {
      return (Bun as any).nanoseconds();
    }
    return Math.round(performance.now() * 1_000_000);
  }

  public static measure<T>(fn: () => T): { result: T; durationMs: number; durationNs: number } {
    const start = Sys.nanoseconds();
    const result = fn();
    const durationNs = Sys.nanoseconds() - start;
    return { result, durationMs: Number((durationNs / 1_000_000).toFixed(3)), durationNs };
  }

  public static async measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number; durationNs: number }> {
    const start = Sys.nanoseconds();
    const result = await fn();
    const durationNs = Sys.nanoseconds() - start;
    return { result, durationMs: Number((durationNs / 1_000_000).toFixed(3)), durationNs };
  }

  // ===========================================================================
  // 9. Fast Checksums, Hashing & Native Compression
  // ===========================================================================

  public static fastHash(data: string | Uint8Array, seed?: number): string {
    if (typeof (Bun as any)?.hash === 'function') {
      const h = (Bun as any).hash(data, seed);
      return h.toString(16);
    }
    return Sys.crc32(data).toString(16);
  }

  public static crc32(data: string | Uint8Array): number {
    if (typeof (Bun as any)?.hash?.crc32 === 'function') {
      return (Bun as any).hash.crc32(data);
    }
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
    return zlib.crc32(buf);
  }

  public static adler32(data: string | Uint8Array): number {
    if (typeof (Bun as any)?.hash?.adler32 === 'function') {
      return (Bun as any).hash.adler32(data);
    }
    let a = 1, b = 0;
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    for (let i = 0; i < buf.length; i++) {
      a = (a + (buf[i] || 0)) % 65521;
      b = (b + a) % 65521;
    }
    return (b << 16) | a;
  }

  public static gzip(data: string | Uint8Array): Uint8Array {
    if (typeof (Bun as any)?.gzipSync === 'function') {
      const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      return (Bun as any).gzipSync(input);
    }
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
    return new Uint8Array(zlib.gzipSync(buf));
  }

  public static gunzip(data: Uint8Array): Uint8Array {
    if (typeof (Bun as any)?.gunzipSync === 'function') {
      return (Bun as any).gunzipSync(data);
    }
    return new Uint8Array(zlib.gunzipSync(Buffer.from(data)));
  }

  public static deflate(data: string | Uint8Array): Uint8Array {
    if (typeof (Bun as any)?.deflateSync === 'function') {
      const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      return (Bun as any).deflateSync(input);
    }
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
    return new Uint8Array(zlib.deflateSync(buf));
  }

  public static inflate(data: Uint8Array): Uint8Array {
    if (typeof (Bun as any)?.inflateSync === 'function') {
      return (Bun as any).inflateSync(data);
    }
    return new Uint8Array(zlib.inflateSync(Buffer.from(data)));
  }

  // ===========================================================================
  // 10. Semver Engine & Bun Runtime Info
  // ===========================================================================

  public static bunVersion(): string {
    return (typeof Bun !== 'undefined' && Bun?.version) ? Bun.version : process.version;
  }

  public static bunRevision(): string {
    return (typeof Bun !== 'undefined' && (Bun as any)?.revision) ? (Bun as any).revision : '';
  }

  public static semverSatisfies(version: string, range: string): boolean {
    if (typeof (Bun as any)?.semver?.satisfies === 'function') {
      return (Bun as any).semver.satisfies(version, range);
    }
    // Simple basic fallback comparison for ^ or >=
    const cleanV = version.replace(/^v/, '');
    const cleanR = range.replace(/^[\^~>=<]+/, '');
    return cleanV.localeCompare(cleanR, undefined, { numeric: true }) >= 0;
  }

  public static semverCompare(v1: string, v2: string): number {
    if (typeof (Bun as any)?.semver?.order === 'function') {
      return (Bun as any).semver.order(v1, v2);
    }
    return v1.localeCompare(v2, undefined, { numeric: true });
  }

  // ===========================================================================
  // 11. Instant Micro HTTP Server & Static File Server (Bun.serve)
  // ===========================================================================

  public static serve(options: {
    port?: number;
    hostname?: string;
    fetch: (req: Request) => Response | Promise<Response>;
  }): any {
    if (typeof (Bun as any)?.serve === 'function') {
      return (Bun as any).serve({
        port: options.port ?? 3000,
        hostname: options.hostname ?? '0.0.0.0',
        fetch: options.fetch,
      });
    }
    throw new Error('sys.serve requires Bun runtime.');
  }

  public static serveStatic(directory: string, port: number = 3000): any {
    const fullDir = Sys.expandTilde(directory);
    if (!fs.existsSync(fullDir)) {
      throw new Error(`Directory "${fullDir}" does not exist.`);
    }

    if (typeof (Bun as any)?.serve === 'function') {
      return (Bun as any).serve({
        port,
        fetch(req: Request) {
          const url = new URL(req.url);
          let reqPath = url.pathname;
          if (reqPath.endsWith('/')) reqPath += 'index.html';
          const target = path.join(fullDir, reqPath);
          const file = (Bun as any).file(target);
          return new Response(file);
        },
      });
    }
    throw new Error('sys.serveStatic requires Bun runtime.');
  }

  // ===========================================================================
  // 12. Fast DNS Resolution (Bun.dns / dns.promises)
  // ===========================================================================

  public static async dnsLookup(hostname: string): Promise<string[]> {
    try {
      if (typeof (Bun as any)?.dns?.lookup === 'function') {
        const res = await (Bun as any).dns.lookup(hostname);
        return res ? [res.address] : [];
      }
      const records = await dns.promises.lookup(hostname, { all: true });
      return records.map((r: any) => r.address);
    } catch {
      return [];
    }
  }
}

export const sys = Sys;

