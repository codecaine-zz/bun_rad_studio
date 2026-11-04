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

export interface MemoryBreakdown {
  total: number;
  used: number;
  free: number;
  rawFree: number;
  active: number;
  wired: number;
  compressed: number;
  cached: number;
  percent: number;
}

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

  private static execAsync(command: string, cwd?: string): Promise<[string, number]> {
    return new Promise((resolve) => {
      try {
        const proc = spawn(command, {
          shell: true,
          cwd: cwd || process.cwd(),
          env: process.env,
        });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d) => {
          stdout += d.toString();
        });
        proc.stderr?.on('data', (d) => {
          stderr += d.toString();
        });
        proc.on('close', (code) => {
          const out = stdout.trim() || stderr.trim();
          resolve([out, code ?? 0]);
        });
        proc.on('error', (err) => {
          resolve([err.message || String(err), 1]);
        });
      } catch (err: any) {
        resolve([err?.message || String(err), 1]);
      }
    });
  }

  public static async execParallel(commands: string[], concurrency: number = 4): Promise<[string, number][]> {
    if (commands.length === 0) return [];
    const results: [string, number][] = new Array(commands.length);
    let index = 0;

    const worker = async () => {
      while (index < commands.length) {
        const i = index++;
        const cmd = commands[i];
        if (cmd !== undefined) {
          results[i] = await Sys.execAsync(cmd);
        }
      }
    };

    const workers = Array.from({ length: Math.max(1, Math.min(concurrency, commands.length)) }, () => worker());
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

  private static _memCache: { ts: number; data: MemoryBreakdown } | null = null;

  /**
   * Parse macOS `vm_stat` output to calculate true Memory Used (App + Wired + Compressor)
   * matching macOS Activity Monitor instead of counting reclaimable file-backed cache as used.
   */
  public static parseMacVmStat(raw: string, totalBytes: number, fallbackFreeBytes: number = 0): MemoryBreakdown | null {
    if (!raw || !raw.includes('Pages free')) return null;
    const pageSizeMatch = raw.match(/page size of\s+(\d+)\s+bytes/i);
    const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : (os.arch() === 'arm64' ? 16384 : 4096);
    const pages: Record<string, number> = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^"?([^":]+)"?:\s+(\d+)/);
      if (m && m[1] && m[2]) {
        pages[m[1].trim().toLowerCase()] = Number(m[2]);
      }
    }

    const freePages = pages['pages free'] ?? 0;
    const activePages = pages['pages active'] ?? 0;
    const inactivePages = pages['pages inactive'] ?? 0;
    const speculativePages = pages['pages speculative'] ?? 0;
    const wiredPages = pages['pages wired down'] ?? 0;
    const purgeablePages = pages['pages purgeable'] ?? 0;
    const anonymousPages = pages['anonymous pages'] ?? pages['pages anonymous'] ?? 0;
    const fileBackedPages = pages['file-backed pages'] ?? 0;
    const compressorPages = pages['pages occupied by compressor'] ?? 0;

    // Activity Monitor formula:
    // App Memory = Anonymous pages - Pages purgeable (fallback: Pages active - Pages purgeable)
    // Memory Used = App Memory + Wired Memory + Compressor Occupied
    const appPages = anonymousPages > 0
      ? Math.max(0, anonymousPages - purgeablePages)
      : Math.max(0, activePages - purgeablePages);
    const usedPages = appPages + wiredPages + compressorPages;

    const rawFree = freePages > 0 ? freePages * pageSize : fallbackFreeBytes;
    const active = appPages * pageSize;
    const wired = wiredPages * pageSize;
    const compressed = compressorPages * pageSize;
    const cached = fileBackedPages > 0
      ? (fileBackedPages + purgeablePages) * pageSize
      : (inactivePages + speculativePages + purgeablePages) * pageSize;

    const used = Math.min(totalBytes, Math.max(0, usedPages * pageSize));
    const free = Math.max(0, totalBytes - used);
    const percent = totalBytes > 0 ? Number(((used / totalBytes) * 100).toFixed(1)) : 0;

    return {
      total: totalBytes,
      used,
      free,
      rawFree,
      active,
      wired,
      compressed,
      cached,
      percent,
    };
  }

  /**
   * Parse Linux `/proc/meminfo` using `MemAvailable` so page cache and reclaimable buffers
   * are not misreported as used memory.
   */
  public static parseLinuxMeminfo(raw: string, totalBytes: number, fallbackFreeBytes: number = 0): MemoryBreakdown | null {
    if (!raw || !raw.includes('MemTotal:')) return null;
    const kb: Record<string, number> = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_()]+):\s+(\d+)/);
      if (m && m[1] && m[2]) {
        kb[m[1]] = Number(m[2]);
      }
    }
    const total = kb['MemTotal'] ? kb['MemTotal'] * 1024 : totalBytes;
    const rawFree = kb['MemFree'] !== undefined ? kb['MemFree'] * 1024 : fallbackFreeBytes;
    const cached = ((kb['Buffers'] ?? 0) + (kb['Cached'] ?? 0) + (kb['SReclaimable'] ?? 0)) * 1024;
    const available = kb['MemAvailable'] !== undefined
      ? kb['MemAvailable'] * 1024
      : Math.min(total, rawFree + cached);
    const used = Math.max(0, total - available);
    const active = kb['Active'] !== undefined ? kb['Active'] * 1024 : used;
    const percent = total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0;

    return {
      total,
      used,
      free: available,
      rawFree,
      active,
      wired: kb['KernelStack'] ? kb['KernelStack'] * 1024 : 0,
      compressed: kb['Zswap'] ? kb['Zswap'] * 1024 : 0,
      cached,
      percent,
    };
  }

  /**
   * Parse Windows `wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /Value` (values in KB)
   * or PowerShell CIM JSON output into a `MemoryBreakdown`.
   */
  public static parseWindowsMeminfo(raw: string, totalBytes: number, fallbackFreeBytes: number = 0): MemoryBreakdown | null {
    if (!raw) return null;
    const kb: Record<string, number> = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Za-z0-9_]+)\s*[:=]\s*(\d+)/);
      if (m && m[1] && m[2]) {
        kb[m[1].toLowerCase()] = Number(m[2]);
      }
    }
    const totalKb = kb['totalvisiblememorysize'];
    const freeKb = kb['freephysicalmemory'];
    if (totalKb === undefined && freeKb === undefined) return null;

    const total = totalKb ? totalKb * 1024 : totalBytes;
    const free = freeKb !== undefined ? freeKb * 1024 : fallbackFreeBytes;
    const used = Math.max(0, total - free);
    const cached = kb['freestandbylist'] ? kb['freestandbylist'] * 1024 : 0;
    const percent = total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0;

    return {
      total,
      used,
      free,
      rawFree: free,
      active: used,
      wired: 0,
      compressed: 0,
      cached,
      percent,
    };
  }

  public static memoryInfo(forceRefresh: boolean = false): MemoryBreakdown {
    const now = Date.now();
    if (!forceRefresh && Sys._memCache && now - Sys._memCache.ts < 500) {
      return Sys._memCache.data;
    }

    const total = os.totalmem();
    const rawFree = os.freemem();

    if (process.platform === 'darwin') {
      try {
        const res = spawnSync('vm_stat', [], { encoding: 'utf8', timeout: 1500 });
        if (res.status === 0 && res.stdout) {
          const parsed = Sys.parseMacVmStat(res.stdout, total, rawFree);
          if (parsed) {
            Sys._memCache = { ts: now, data: parsed };
            return parsed;
          }
        }
      } catch {}
    } else if (process.platform === 'linux') {
      try {
        if (fs.existsSync('/proc/meminfo')) {
          const raw = fs.readFileSync('/proc/meminfo', 'utf8');
          const parsed = Sys.parseLinuxMeminfo(raw, total, rawFree);
          if (parsed) {
            Sys._memCache = { ts: now, data: parsed };
            return parsed;
          }
        }
      } catch {}
    }

    // On Windows (win32), os.freemem() queries Win32 GlobalMemoryStatusEx.ullAvailPhys,
    // which natively includes reclaimable Standby cache and matches Windows Task Manager.
    const used = Math.max(0, total - rawFree);
    const fallback: MemoryBreakdown = {
      total,
      used,
      free: rawFree,
      rawFree,
      active: used,
      wired: 0,
      compressed: 0,
      cached: 0,
      percent: total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0,
    };
    Sys._memCache = { ts: now, data: fallback };
    return fallback;
  }

  public static ramTotal(): number {
    return Sys.memoryInfo().total;
  }

  public static ramFree(): number {
    return Sys.memoryInfo().free;
  }

  public static ramUsed(): number {
    return Sys.memoryInfo().used;
  }

  public static ramPercent(): number {
    return Sys.memoryInfo().percent;
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
    if (process.env.SCREENSHOT_MODE === "1") return "studio-workstation";
    return os.hostname();
  }

  public static osHomedir(): string {
    if (process.env.SCREENSHOT_MODE === "1") return "/Users/developer";
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
      for (const bat of ['BAT0', 'BAT1', 'CMB0']) {
        try {
          const cap = fs.readFileSync(`/sys/class/power_supply/${bat}/capacity`, 'utf8');
          const parsed = parseInt(cap.trim(), 10);
          if (!Number.isNaN(parsed)) return parsed;
        } catch {}
      }
    } else if (p === 'win32') {
      try {
        const res = spawnSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1).EstimatedChargeRemaining'],
          { encoding: 'utf8', timeout: 1500 },
        );
        const parsed = parseInt((res.stdout || '').trim(), 10);
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 100) return parsed;
      } catch {}
    }
    return 100;
  }

  public static isCharging(): boolean {
    const p = os.platform();
    if (p === 'darwin') {
      const out = Sys.execOr('pmset -g batt', '');
      return out.includes('charging') || out.includes('AC Power');
    } else if (p === 'linux') {
      for (const bat of ['BAT0', 'BAT1', 'CMB0']) {
        try {
          const status = fs.readFileSync(`/sys/class/power_supply/${bat}/status`, 'utf8').trim().toLowerCase();
          if (status) return status === 'charging' || status === 'full';
        } catch {}
      }
    } else if (p === 'win32') {
      try {
        const res = spawnSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1).BatteryStatus'],
          { encoding: 'utf8', timeout: 1500 },
        );
        const code = parseInt((res.stdout || '').trim(), 10);
        // Win32_Battery BatteryStatus: 1 = Discharging, 2 = AC Power, 3 = Fully Charged, 6..9 = Charging
        if (!Number.isNaN(code)) return code !== 1;
      } catch {}
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
    const p = os.platform();
    const resolvedTarget =
      p === 'win32' && (targetPath === '/' || !targetPath)
        ? (process.env.SystemDrive ? `${process.env.SystemDrive}\\` : (path.parse(process.cwd()).root || 'C:\\'))
        : targetPath;

    // 1. Cross-platform native statfsSync (accurate on Windows, Linux, and macOS APFS containers)
    if (typeof (fs as any).statfsSync === 'function') {
      try {
        const st = (fs as any).statfsSync(resolvedTarget);
        const bsize = Number(st.frsize || st.bsize || 4096);
        const totalBytes = Number(st.blocks || 0) * bsize;
        const freeBytes = Number(st.bavail ?? st.bfree ?? 0) * bsize;
        if (totalBytes > 0) {
          const usedBytes = Math.max(0, totalBytes - freeBytes);
          const percent = Number(((usedBytes / totalBytes) * 100).toFixed(1));
          return { totalBytes, usedBytes, freeBytes, percent };
        }
      } catch {}
    }

    // 2. POSIX df fallback (darwin / linux)
    if (p !== 'win32') {
      try {
        const dfTarget = p === 'darwin' && resolvedTarget === '/' && fs.existsSync('/System/Volumes/Data')
          ? '/System/Volumes/Data'
          : resolvedTarget;
        const res = spawnSync('df', ['-k', '--', dfTarget], { encoding: 'utf8' });
        const out = res.stdout || '';
        const code = res.status ?? 1;
        if (code === 0) {
          const lines = out.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          if (lines.length >= 2 && lastLine) {
            const parts = lastLine.split(/\s+/);
            if (parts.length >= 5) {
              const totalBytes = (parseInt(parts[1] || '0', 10) || 0) * 1024;
              const reportedUsed = (parseInt(parts[2] || '0', 10) || 0) * 1024;
              const freeBytes = (parseInt(parts[3] || '0', 10) || 0) * 1024;
              const usedBytes = totalBytes > freeBytes ? Math.max(reportedUsed, totalBytes - freeBytes) : reportedUsed;
              const percent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
              return { totalBytes, usedBytes, freeBytes, percent: Number(percent.toFixed(1)) };
            }
          }
        }
      } catch {}
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
    if (process.env.SCREENSHOT_MODE === "1") {
      return { lo0: ["127.0.0.1"], en0: ["192.168.1.100"] };
    }
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
    if (process.env.SCREENSHOT_MODE === "1") return "192.168.1.100";
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
    if (process.env.SCREENSHOT_MODE === "1") return "02:00:00:00:00:01";
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
    if (process.env.SCREENSHOT_MODE === "1") return "Studio-Mesh-5G";
    const p = os.platform();
    if (p === 'darwin') {
      const out = Sys.execOr('/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I', '');
      const match = out.match(/\bSSID:\s*(.+)/);
      if (match?.[1]) return match[1].trim();
      const out2 = Sys.execOr('networksetup -getairportnetwork en0', '');
      const match2 = out2.match(/Current Wi-Fi Network:\s*(.+)/);
      if (match2?.[1]) return match2[1].trim();
    } else if (p === 'linux') {
      const iwget = Sys.execOr('iwgetid -r', '');
      if (iwget) return iwget;
      const nmcli = Sys.execOr('nmcli -t -f active,ssid dev wifi', '');
      const activeLine = nmcli.split(/\r?\n/).find((l) => l.startsWith('yes:'));
      if (activeLine) return activeLine.slice(4).trim();
      return 'Unknown Wi-Fi';
    } else if (p === 'win32') {
      const out = Sys.execOr('netsh wlan show interfaces', '');
      const match = out.match(/^\s*SSID\s*:\s*(.+)$/m);
      if (match?.[1]) return match[1].trim();
    }
    return 'Wi-Fi Connected';
  }

  public static async pingCheck(host: string = '8.8.8.8', timeoutMs: number = 2000): Promise<boolean> {
    const cleanHost = String(host || '').trim();
    if (!cleanHost || cleanHost.startsWith('-') || !/^[a-zA-Z0-9.:_-]+$/.test(cleanHost)) {
      return false;
    }
    const p = os.platform();
    const timeoutSec = String(Math.max(1, Math.round(timeoutMs / 1000)));
    const args = p === 'win32' ? ['-n', '1', '-w', timeoutSec, cleanHost] : ['-c', '1', '-W', timeoutSec, cleanHost];
    const res = spawnSync('ping', args, { stdio: 'ignore' });
    return res.status === 0;
  }

  public static async checkPort(host: string, port: number, timeoutMs: number = 1000): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        socket.destroy();
        resolve(ok);
      };

      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));

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

  public static async waitForPort(
    host: string,
    port: number,
    timeoutMs: number = 10000,
    intervalMs: number = 200
  ): Promise<boolean> {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (Date.now() <= deadline) {
      const open = await Sys.checkPort(host, port, Math.min(Math.max(100, intervalMs * 2), 1000));
      if (open) return true;
      if (Date.now() + intervalMs > deadline) break;
      await Sys.sleep(intervalMs);
    }
    return false;
  }

  public static async waitForHttp(
    url: string,
    timeoutMs: number = 10000,
    intervalMs: number = 250,
    expectedStatus?: number
  ): Promise<boolean> {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (Date.now() <= deadline) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(2000, Math.max(250, timeoutMs)));
        try {
          const res = await fetch(url, { signal: controller.signal });
          if (expectedStatus !== undefined ? res.status === expectedStatus : res.ok) {
            return true;
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        // Keep polling until deadline
      }
      if (Date.now() + intervalMs > deadline) break;
      await Sys.sleep(intervalMs);
    }
    return false;
  }

  // ===========================================================================
  // 5. Desktop Notifications, Audio & Speech
  // ===========================================================================

  public static notify(title: string, message: string, sound: boolean = true): void {
    const p = os.platform();
    const escAs = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
    if (p === 'darwin') {
      const soundArg = sound ? ' sound name "default"' : '';
      const script = `display notification "${escAs(message)}" with title "${escAs(title)}"${soundArg}`;
      try {
        spawnSync('osascript', ['-e', script], { stdio: 'ignore' });
      } catch {}
    } else if (p === 'linux') {
      try {
        spawnSync('notify-send', ['--', String(title ?? ''), String(message ?? '')], { stdio: 'ignore' });
      } catch {}
    }
  }

  public static say(text: string, voice?: string, rate?: number): void {
    const p = os.platform();
    const cleanText = String(text ?? '');
    if (!cleanText) return;
    if (p === 'darwin') {
      const args: string[] = [];
      if (voice && /^[a-zA-Z0-9 _-]+$/.test(voice)) args.push('-v', voice);
      if (rate && Number.isFinite(rate) && rate > 0) args.push('-r', String(Math.round(rate)));
      args.push('--', cleanText);
      try {
        const proc = spawn('say', args, { detached: true, stdio: 'ignore' });
        proc.unref();
      } catch {}
    } else if (p === 'linux') {
      try {
        const bin = Sys.which('spd-say') ? 'spd-say' : 'espeak';
        const proc = spawn(bin, ['--', cleanText], { detached: true, stdio: 'ignore' });
        proc.unref();
      } catch {}
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
        // stdout and stderr are ignored: xclip leaves a background process that would keep captured pipes open.
        const res = spawnSync('xclip', ['-selection', 'clipboard'], { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
        return res.status === 0;
      } catch { return false; }
    } else if (p === 'win32') {
      try {
        const res = spawnSync('clip', { input: text, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'] });
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
    } else if (p === 'win32') {
      try {
        const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Raw'], { encoding: 'utf8', timeout: 1500 });
        return res.status === 0 ? (res.stdout || '').replace(/\r?\n$/, '') : '';
      } catch { return ''; }
    }
    return '';
  }

  public static openUrl(urlOrPath: string): boolean {
    const target = String(urlOrPath ?? '').trim();
    if (!target || target.startsWith('-') || target.includes('\0')) return false;
    try {
      const p = os.platform();
      let cmd: string;
      let args: string[];

      if (p === 'darwin') {
        cmd = 'open';
        args = [target];
      } else if (p === 'win32') {
        cmd = 'cmd';
        args = ['/c', 'start', '""', target];
      } else {
        cmd = 'xdg-open';
        args = [target];
      }

      const proc = spawn(cmd, args, {
        detached: true,
        stdio: 'ignore',
      });
      proc.unref();
      return true;
    } catch {
      return false;
    }
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
    const clean = String(binName ?? '').trim();
    if (!clean || clean.startsWith('-') || clean.includes('\0')) return null;
    if (typeof (Bun as any)?.which === 'function') {
      return (Bun as any).which(clean);
    }
    const res = spawnSync('which', ['--', clean], { encoding: 'utf8' });
    return res.status === 0 && res.stdout ? res.stdout.trim() : null;
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
        hostname: options.hostname ?? '127.0.0.1',
        fetch: options.fetch,
      });
    }
    throw new Error('sys.serve requires Bun runtime.');
  }

  // Listens on 127.0.0.1 unless `hostname` is given (for example "0.0.0.0" to publish the directory on the network).
  public static serveStatic(directory: string, port: number = 3000, hostname: string = '127.0.0.1'): any {
    const fullDir = path.resolve(Sys.expandTilde(directory));
    if (!fs.existsSync(fullDir)) {
      throw new Error(`Directory "${fullDir}" does not exist.`);
    }

    if (typeof (Bun as any)?.serve === 'function') {
      return (Bun as any).serve({
        port,
        hostname,
        fetch(req: Request) {
          const url = new URL(req.url);
          let reqPath: string;
          try {
            reqPath = decodeURIComponent(url.pathname);
          } catch {
            return new Response('Bad Request', { status: 400 });
          }
          if (reqPath.includes('\0')) return new Response('Bad Request', { status: 400 });
          if (reqPath.endsWith('/')) reqPath += 'index.html';
          const target = path.resolve(fullDir, '.' + (reqPath.startsWith('/') ? reqPath : '/' + reqPath));
          if (target !== fullDir && !target.startsWith(fullDir + path.sep)) {
            return new Response('Forbidden', { status: 403 });
          }
          const file = (Bun as any).file(target);
          return new Response(file);
        },
      });
    }
    throw new Error('sys.serveStatic requires Bun runtime.');
  }

  /**
   * Instant zero-config JSON REST & mock API server on `127.0.0.1` by default.
   * Accepts a route dictionary (e.g. `{ "/health": { ok: true }, "POST /users": async (req) => ... }`)
   * or a handler function `(req) => any`.
   */
  public static serveJson(
    routesOrHandler: Record<string, any> | ((req: Request) => any),
    port: number = 3000,
    hostname: string = '127.0.0.1'
  ): any {
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, Accept',
    };

    const toJsonResponse = (payload: any, status: number = 200, extraHeaders: Record<string, string> = {}): Response => {
      if (payload instanceof Response) return payload;
      return new Response(JSON.stringify(payload ?? null), {
        status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...corsHeaders,
          ...extraHeaders,
        },
      });
    };

    const safeDecode = (val: string): string => {
      try {
        return decodeURIComponent(val);
      } catch {
        return val;
      }
    };

    const matchPattern = (patternPath: string, actualPath: string): Record<string, string> | null => {
      if (patternPath === '*' || patternPath === actualPath) return {};
      const patParts = patternPath.split('/').filter(Boolean);
      const actParts = actualPath.split('/').filter(Boolean);
      if (patParts.length !== actParts.length) return null;
      const params: Record<string, string> = {};
      for (let i = 0; i < patParts.length; i++) {
        const p = patParts[i]!;
        const a = actParts[i]!;
        if (p.startsWith(':')) {
          const paramKey = p.slice(1);
          if (paramKey && paramKey !== '__proto__' && paramKey !== 'constructor' && paramKey !== 'prototype') {
            params[paramKey] = safeDecode(a);
          }
        } else if (p !== a) {
          return null;
        }
      }
      return params;
    };

    const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

    return Sys.serve({
      port,
      hostname,
      fetch: async (req: Request) => {
        if (req.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: corsHeaders });
        }

        try {
          if (typeof routesOrHandler === 'function') {
            const out = await routesOrHandler(req);
            return toJsonResponse(out);
          }

          const url = new URL(req.url);
          const pathname = url.pathname;
          if (pathname.includes('\0')) {
            return toJsonResponse({ error: 'Bad Request' }, 400);
          }
          const method = req.method.toUpperCase();

          // 1. Exact method + path or exact path (using hasOwn to prevent Object.prototype property invocation)
          const exactMethodKey = `${method} ${pathname}`;
          if (hasOwn(routesOrHandler, exactMethodKey)) {
            const target = routesOrHandler[exactMethodKey];
            const out = typeof target === 'function' ? await target(req, {}) : target;
            return toJsonResponse(out);
          }
          if (hasOwn(routesOrHandler, pathname)) {
            const target = routesOrHandler[pathname];
            const out = typeof target === 'function' ? await target(req, {}) : target;
            return toJsonResponse(out);
          }

          // 2. Parameterized route matching (e.g., "GET /users/:id" or "/users/:id")
          for (const [rawKey, target] of Object.entries(routesOrHandler)) {
            if (rawKey === '*') continue;
            const spaceIdx = rawKey.indexOf(' ');
            let routeMethod = '*';
            let routePath = rawKey;
            if (spaceIdx > 0) {
              routeMethod = rawKey.slice(0, spaceIdx).trim().toUpperCase();
              routePath = rawKey.slice(spaceIdx + 1).trim();
            }
            if (routeMethod !== '*' && routeMethod !== method) continue;
            const params = matchPattern(routePath, pathname);
            if (params !== null) {
              (req as any).params = params;
              const out = typeof target === 'function' ? await target(req, params) : target;
              return toJsonResponse(out);
            }
          }

          // 3. Wildcard fallback
          if (hasOwn(routesOrHandler, '*')) {
            const target = routesOrHandler['*'];
            const out = typeof target === 'function' ? await target(req, {}) : target;
            return toJsonResponse(out);
          }

          return toJsonResponse({ error: 'Not Found', method, path: pathname }, 404);
        } catch (err: any) {
          const isSyntax = err instanceof SyntaxError;
          return toJsonResponse(
            { error: isSyntax ? 'Invalid JSON payload' : (err?.message || 'Internal Server Error') },
            isSyntax ? 400 : 500
          );
        }
      },
    });
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

