/**
 * Zero-dependency persistent JSON configuration & key-value store for SimpleCLI
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir, platform } from 'node:os';

export class ConfigStore {
  public readonly appName: string;
  public readonly configPath: string;
  private data: Record<string, any> = {};

  constructor(appName: string = 'simplcli', customPath?: string) {
    this.appName = appName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    this.configPath = customPath ? resolve(customPath) : this.resolveDefaultConfigPath(this.appName);
    this.load();
  }

  private resolveDefaultConfigPath(name: string): string {
    const isWindows = platform() === 'win32';
    if (isWindows) {
      const appData = process.env.APPDATA || resolve(homedir(), 'AppData', 'Roaming');
      return resolve(appData, name, 'config.json');
    }
    const xdgConfig = process.env.XDG_CONFIG_HOME || resolve(homedir(), '.config');
    return resolve(xdgConfig, name, 'config.json');
  }

  public get path(): string {
    return this.configPath;
  }

  public load(): Record<string, any> {
    if (!existsSync(this.configPath)) {
      this.data = {};
      return this.data;
    }
    try {
      const raw = readFileSync(this.configPath, 'utf8');
      this.data = JSON.parse(raw);
    } catch {
      this.data = {};
    }
    return this.data;
  }

  public save(): void {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.configPath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  public get(key: string): any;
  public get<T>(key: string, defaultVal: T): T;
  public get<T = any>(key: string, defaultVal?: T): any {
    if (key.includes('.')) {
      const parts = key.split('.');
      let curr: any = this.data;
      for (const p of parts) {
        if (curr === undefined || curr === null) return defaultVal as T;
        curr = curr[p];
      }
      return curr !== undefined ? curr : (defaultVal as T);
    }
    return this.data[key] !== undefined ? this.data[key] : (defaultVal as T);
  }

  public set(key: string, value: any): this {
    if (key.includes('.')) {
      const parts = key.split('.');
      let curr: any = this.data;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i] || '';
        if (curr[p] === undefined || typeof curr[p] !== 'object' || curr[p] === null) {
          curr[p] = {};
        }
        curr = curr[p];
      }
      const lastKey = parts[parts.length - 1] || '';
      curr[lastKey] = value;
    } else {
      this.data[key] = value;
    }
    this.save();
    return this;
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  public delete(key: string): boolean {
    if (key.includes('.')) {
      const parts = key.split('.');
      let curr: any = this.data;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i] || '';
        if (curr[p] === undefined) return false;
        curr = curr[p];
      }
      const lastKey = parts[parts.length - 1] || '';
      delete curr[lastKey];
    } else {
      delete this.data[key];
    }
    this.save();
    return true;
  }

  public clear(): this {
    this.data = {};
    if (existsSync(this.configPath)) {
      try {
        unlinkSync(this.configPath);
      } catch {
        this.save();
      }
    }
    return this;
  }

  public all(): Record<string, any> {
    return { ...this.data };
  }
}
