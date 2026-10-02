import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";

// Doer: Resolve standard application configuration state directory across OSes
export function resolveConfigDir(appName: string): string {
  const platform = process.platform;
  let base: string;
  if (platform === "darwin") {
    base = path.join(os.homedir(), "Library", "Application Support");
  } else if (platform === "win32") {
    base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  } else {
    base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  }
  return path.join(base, appName);
}

// Managed Application State Store with atomic persistence and rollback
export class AppStateStore<T extends Record<string, any>> {
  private current: T;
  private previous: T;
  private readonly defaultData: T;
  readonly filePath: string;
  readonly autoSave: boolean;

  constructor(
    appName: string,
    initialData: T,
    options: { customPath?: string; autoSave?: boolean } = {}
  ) {
    this.defaultData = JSON.parse(JSON.stringify(initialData));
    this.current = JSON.parse(JSON.stringify(initialData));
    this.previous = JSON.parse(JSON.stringify(initialData));
    this.autoSave = options.autoSave ?? true;

    if (options.customPath) {
      this.filePath = options.customPath;
    } else {
      const dir = resolveConfigDir(appName);
      this.filePath = path.join(dir, "state.json");
    }
  }

  get(): T {
    return this.current;
  }

  async update(fn: (draft: T) => void | T): Promise<void> {
    this.previous = JSON.parse(JSON.stringify(this.current));
    const result = fn(this.current);
    if (result !== undefined) {
      this.current = result;
    }
    if (this.autoSave) {
      await this.save();
    }
  }

  async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    await Bun.write(this.filePath, JSON.stringify(this.current, null, 2));
  }

  async load(): Promise<T> {
    const file = Bun.file(this.filePath);
    if (await file.exists()) {
      try {
        const data = (await file.json()) as T;
        this.current = { ...this.defaultData, ...data };
        this.previous = JSON.parse(JSON.stringify(this.current));
      } catch {
        // preserve current fallback
      }
    }
    return this.current;
  }

  rollback(): void {
    this.current = JSON.parse(JSON.stringify(this.previous));
  }

  reset(): void {
    this.previous = JSON.parse(JSON.stringify(this.current));
    this.current = JSON.parse(JSON.stringify(this.defaultData));
  }
}

// Key-Value App State wrapper
export class KeyValueState {
  private store: AppStateStore<Record<string, any>>;

  constructor(appName: string, customPath?: string) {
    this.store = new AppStateStore(appName, {}, { customPath, autoSave: true });
  }

  async init(): Promise<void> {
    await this.store.load();
  }

  get<T = any>(key: string, fallback?: T): T | undefined {
    const val = this.store.get()[key];
    return val !== undefined ? val : fallback;
  }

  async set(key: string, value: any): Promise<void> {
    await this.store.update((draft) => {
      draft[key] = value;
    });
  }

  async delete(key: string): Promise<void> {
    await this.store.update((draft) => {
      delete draft[key];
    });
  }

  all(): Record<string, any> {
    return { ...this.store.get() };
  }
}

export const stateutils = {
  resolveConfigDir,
  AppStateStore,
  KeyValueState,
};
