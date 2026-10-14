/**
 * What the Secrets feature needs from the outside world, replaceable so tests never wait for real time, touch the
 * network or the real clipboard. Kept free of imports so fmCore.ts can refer to its type without a cycle.
 */
export interface SecretsKdfParams {
  memoryKiB: number;
  passes: number;
  parallelism: number;
}

export interface CredentialStore {
  /** The stored text, or null when there is none. Throws when the store is unavailable or access was refused. */
  get(service: string, name: string): Promise<string | null>;
  set(service: string, name: string, value: string): Promise<void>;
  /** True when something was deleted. */
  delete(service: string, name: string): Promise<boolean>;
}

export interface SecretsHooks {
  /** Milliseconds since 1970 (`Date.now`). */
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Used only by the opt-in breach check. */
  fetch(url: string, init: { headers: Record<string, string>; signal?: AbortSignal }): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
  clipboard: { read(): string; write(text: string): boolean };
  /** The operating system's credential store for "Unlock with this computer" (default: `Bun.secrets`). Tests use an in-memory fake. */
  store: CredentialStore;
  /** Replaces the three strength levels (tests use tiny, fast ones). */
  kdf?: { standard: SecretsKdfParams; strong: SecretsKdfParams; maximum: SecretsKdfParams };
  /** Seconds a rotating backup is kept from being replaced by a newer state. 0 = every save may rotate (tests). */
  backupMinIntervalMs?: number;
  /** A test can make the atomic write fail between the temporary file and the rename. */
  faultBeforeRename?: () => void;
  /** Milliseconds a change may wait before it is saved (settings, audit entries). */
  saveDelayMs?: number;
}
