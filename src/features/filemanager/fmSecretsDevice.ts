/**
 * "Unlock with this computer": a random 256-bit device key kept in the operating system's credential store
 * (macOS Keychain, Linux libsecret, Windows Credential Manager, through `Bun.secrets`). The vault file holds a third
 * wrapping of the data key under a key made from it. The entry also remembers when the master password was last typed
 * and how many days the shortcut may last; this program stops using it after that. (Anyone who can read the entry
 * with their own program is not stopped by that: see docs/security.md.)
 */
import type { CredentialStore } from "./fmSecretsHooks";

/** OS credential store service identifier used by the File Manager Secrets vault. */
export const SERVICE = "codecaine-file-manager";
const DAY_MS = 86_400_000;

/** The real store. `persist: "local"` stops Windows from roaming the entry to other computers. */
export function bunCredentialStore(): CredentialStore {
  const opts = (service: string, name: string) =>
    ({
      service,
      name,
      ...(process.platform === "win32" ? { persist: "local" } : {}),
    }) as { service: string; name: string };
  return {
    get: async (service, name) =>
      (await Bun.secrets.get(opts(service, name))) ?? null,
    set: async (service, name, value) => {
      await Bun.secrets.set({ ...opts(service, name), value });
    },
    delete: async (service, name) =>
      (await Bun.secrets.delete(opts(service, name))) === true,
  };
}

/** Formats the OS credential store account/entry name for a given 16-byte `vaultId`. */
export const entryName = (vaultId: Buffer): string =>
  `vault-device-key:${vaultId.toString("hex")}`;

/** Unpacked record stored in the OS credential store for unlocking a vault on the local machine. */
export interface DeviceEntry {
  key: Buffer;
  passwordAt: number;
  days: number;
}

/** Serializes a `DeviceEntry` to a versioned JSON string suitable for saving in the OS credential store. */
export const encodeEntry = (e: DeviceEntry): string =>
  JSON.stringify({
    v: 1,
    key: e.key.toString("base64"),
    passwordAt: e.passwordAt,
    days: e.days,
  });

/** The entry, or null when it is missing or not what this program wrote. */
export function parseEntry(text: string | null): DeviceEntry | null {
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    const key = Buffer.from(String(j.key), "base64");
    if (
      j.v !== 1 ||
      key.length !== 32 ||
      !Number.isFinite(j.passwordAt) ||
      !Number.isInteger(j.days)
    )
      return null;
    return { key, passwordAt: j.passwordAt, days: j.days };
  } catch {
    return null;
  }
}

/** Returns `true` if the device key entry has exceeded its allowed `days` since the master password was last entered (or has a future timestamp). */
export const isExpired = (e: DeviceEntry, now: number): boolean =>
  now - e.passwordAt > e.days * DAY_MS || e.passwordAt > now + DAY_MS;

/** User-facing fallback message when the OS credential store is unavailable or denies access. */
export const UNAVAILABLE =
  "This computer's secure storage (Keychain, Credential Manager or Secret Service) isn't available or didn't allow access. Use your master password instead.";

/** Whether the store can be used at all (a missing entry is fine; a thrown error is not). */
export async function probe(
  store: CredentialStore,
): Promise<{ ok: boolean; reason: string }> {
  try {
    await store.get(SERVICE, "availability-check");
    return { ok: true, reason: "" };
  } catch {
    return {
      ok: false,
      reason:
        process.platform === "linux"
          ? "On Linux this needs a running Secret Service (GNOME Keyring or KWallet) and libsecret. None answered, so this option is turned off. Your master password still works."
          : UNAVAILABLE,
    };
  }
}
