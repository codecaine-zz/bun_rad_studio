/**
 * "Unlock with this computer": a random 256-bit device key kept in the operating system's credential store
 * (macOS Keychain, Linux libsecret, Windows Credential Manager, through `Bun.secrets`). The vault file holds a third
 * wrapping of the data key under a key made from it. The entry also remembers when the master password was last typed
 * and how many days the shortcut may last; this program stops using it after that. (Anyone who can read the entry
 * with their own program is not stopped by that: see docs/security.md.)
 */
import type { CredentialStore } from "./fmSecretsHooks";

export const SERVICE = "codecaine-file-manager";
const DAY_MS = 86_400_000;

/** The real store. `persist: "local"` stops Windows from roaming the entry to other computers. */
export function bunCredentialStore(): CredentialStore {
  const opts = (service: string, name: string) => ({ service, name, ...(process.platform === "win32" ? { persist: "local" } : {}) }) as { service: string; name: string };
  return {
    get: async (service, name) => (await Bun.secrets.get(opts(service, name))) ?? null,
    set: async (service, name, value) => {
      await Bun.secrets.set({ ...opts(service, name), value });
    },
    delete: async (service, name) => (await Bun.secrets.delete(opts(service, name))) === true,
  };
}

export const entryName = (vaultId: Buffer): string => `vault-device-key:${vaultId.toString("hex")}`;

export interface DeviceEntry {
  key: Buffer;
  passwordAt: number;
  days: number;
}

export const encodeEntry = (e: DeviceEntry): string => JSON.stringify({ v: 1, key: e.key.toString("base64"), passwordAt: e.passwordAt, days: e.days });

/** The entry, or null when it is missing or not what this program wrote. */
export function parseEntry(text: string | null): DeviceEntry | null {
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    const key = Buffer.from(String(j.key), "base64");
    if (j.v !== 1 || key.length !== 32 || !Number.isFinite(j.passwordAt) || !Number.isInteger(j.days)) return null;
    return { key, passwordAt: j.passwordAt, days: j.days };
  } catch {
    return null;
  }
}

export const isExpired = (e: DeviceEntry, now: number): boolean => now - e.passwordAt > e.days * DAY_MS || e.passwordAt > now + DAY_MS;

export const UNAVAILABLE = "This computer's secure storage (Keychain, Credential Manager or Secret Service) isn't available or didn't allow access. Use your master password instead.";

/** Whether the store can be used at all (a missing entry is fine; a thrown error is not). */
export async function probe(store: CredentialStore): Promise<{ ok: boolean; reason: string }> {
  try {
    await store.get(SERVICE, "availability-check");
    return { ok: true, reason: "" };
  } catch {
    return { ok: false, reason: process.platform === "linux" ? "On Linux this needs a running Secret Service (GNOME Keyring or KWallet) and libsecret. None answered, so this option is turned off. Your master password still works." : UNAVAILABLE };
  }
}
