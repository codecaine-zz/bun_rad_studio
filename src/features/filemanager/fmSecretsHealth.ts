/**
 * The offline password audit (weak, reused, old, no 2FA hint, duplicate addresses, passwords left in notes) and the
 * optional breach check. The audit compares passwords with keyed fingerprints made in memory for this one report and
 * thrown away; the reports hold item ids and reasons, never a password. The breach check is the only thing here that
 * uses the network, and only when the person asks for it: see `breachCheck`.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { FmError } from "./fmPaths";
import { passwordBits } from "./fmSecretsCrypto";
import type { SecretsHooks } from "./fmSecretsHooks";
import { hostOf, type SecretItem } from "./fmSecretsModel";

export interface HealthEntry {
  id: string;
  title: string;
  /** a short plain reason */
  why: string;
}
export interface HealthReport {
  checked: number;
  weak: HealthEntry[];
  reused: Array<{ ids: string[]; titles: string[] }>;
  old: HealthEntry[];
  no2fa: HealthEntry[];
  duplicateUrls: Array<{ host: string; ids: string[]; titles: string[] }>;
  inNotes: HealthEntry[];
  /** The ids that have a weak or reused password, for the list's "Weak or reused" filter. */
  flagged: string[];
}

/** Sites that offer two-step sign-in, so a login there without a one-time code secret is worth a reminder. */
const TWO_FA_SITES = new Set([
  "google.com", "accounts.google.com", "github.com", "gitlab.com", "microsoft.com", "live.com", "outlook.com", "office.com", "apple.com", "icloud.com", "amazon.com",
  "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com", "dropbox.com", "paypal.com", "stripe.com", "cloudflare.com", "digitalocean.com", "aws.amazon.com",
  "discord.com", "slack.com", "reddit.com", "twitch.tv", "spotify.com", "netflix.com", "coinbase.com", "binance.com", "kraken.com", "bitbucket.org", "atlassian.com",
  "npmjs.com", "pypi.org", "docker.com", "heroku.com", "zoom.us", "evernote.com", "notion.so", "proton.me", "protonmail.com", "yahoo.com", "ebay.com", "shopify.com",
]);

const isLoginLike = (i: SecretItem): boolean => i.type === "login" && i.deletedAt === null;
const hasTotp = (i: SecretItem): boolean => Boolean(i.fields.totp) || i.custom.some((c) => c.kind === "otp" && c.value);

function twoFaSite(host: string): boolean {
  const parts = host.split(".");
  for (let n = 0; n <= parts.length - 2; n++) if (TWO_FA_SITES.has(parts.slice(n).join("."))) return true;
  return false;
}

function normalizedUrl(url: string): string {
  const host = hostOf(url);
  if (!host) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    return `${host}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return host;
  }
}

export function healthReport(items: SecretItem[], now: number, oldDays = 365): HealthReport {
  const logins = items.filter(isLoginLike);
  const withPw = logins.filter((i) => i.fields.password);
  const key = randomBytes(32);
  const prints = new Map<string, SecretItem[]>();
  const report: HealthReport = { checked: withPw.length, weak: [], reused: [], old: [], no2fa: [], duplicateUrls: [], inNotes: [], flagged: [] };
  const flagged = new Set<string>();
  for (const item of withPw) {
    const pw = item.fields.password!;
    const fp = createHmac("sha256", key).update(pw).digest("hex");
    prints.set(fp, [...(prints.get(fp) ?? []), item]);
    const bits = passwordBits(pw);
    if (pw.length < 8 || bits < 50) {
      report.weak.push({ id: item.id, title: item.title, why: pw.length < 8 ? "Shorter than 8 characters" : "Easy to guess" });
      flagged.add(item.id);
    }
    if (now - item.pwChangedAt > oldDays * 86_400_000) report.old.push({ id: item.id, title: item.title, why: `Not changed for ${Math.floor((now - item.pwChangedAt) / 86_400_000)} days` });
    if (item.notes.length >= 6 && (item.notes.includes(pw) || /\b(pass(word)?|pwd|passcode|pin)\s*[:=]\s*\S{4,}/i.test(item.notes))) report.inNotes.push({ id: item.id, title: item.title, why: "A password seems to be written in the notes" });
  }
  for (const group of prints.values()) {
    if (group.length > 1) {
      report.reused.push({ ids: group.map((i) => i.id), titles: group.map((i) => i.title) });
      for (const i of group) flagged.add(i.id);
    }
  }
  prints.clear();
  key.fill(0);
  for (const item of logins) {
    const host = hostOf(item.fields.url ?? "");
    if (host && twoFaSite(host) && !hasTotp(item)) report.no2fa.push({ id: item.id, title: item.title, why: `${host} offers two-step sign-in` });
  }
  const urls = new Map<string, SecretItem[]>();
  for (const item of logins) {
    const n = normalizedUrl(item.fields.url ?? "");
    if (n) urls.set(n, [...(urls.get(n) ?? []), item]);
  }
  for (const [n, group] of urls) if (group.length > 1) report.duplicateUrls.push({ host: n, ids: group.map((i) => i.id), titles: group.map((i) => i.title) });
  report.flagged = [...flagged];
  return report;
}

// ---------------------------------------------------------------------------------------------------------------
// Breach check (opt in): Have I Been Pwned "Pwned Passwords" range API, k-anonymity.
// ---------------------------------------------------------------------------------------------------------------

export const BREACH_URL = "https://api.pwnedpasswords.com/range/";
export interface BreachResult {
  checked: number;
  breached: Array<{ id: string; title: string; count: number }>;
  failed: number;
}

/**
 * Sends ONLY the first 5 hex characters of each password's SHA-1 (with the padding header, so the answer's size says
 * nothing) and compares the returned suffixes here. The password, the rest of the hash and every other detail stay on
 * this computer. The service sees 20 bits of each hash, which fits a very large number of passwords.
 */
export async function breachCheck(items: SecretItem[], hooks: Pick<SecretsHooks, "fetch">, { timeoutMs = 8000, concurrency = 4 } = {}): Promise<BreachResult> {
  const byHash = new Map<string, SecretItem[]>();
  for (const item of items.filter(isLoginLike)) {
    const pw = item.fields.password;
    if (!pw) continue;
    const sha = createHash("sha1").update(pw, "utf8").digest("hex").toUpperCase();
    byHash.set(sha, [...(byHash.get(sha) ?? []), item]);
  }
  const byPrefix = new Map<string, string[]>();
  for (const sha of byHash.keys()) byPrefix.set(sha.slice(0, 5), [...(byPrefix.get(sha.slice(0, 5)) ?? []), sha]);
  if (byPrefix.size > 1500) throw new FmError("TOO_LARGE", "There are too many different passwords to check in one go.");
  const result: BreachResult = { checked: byHash.size, breached: [], failed: 0 };
  const queue = [...byPrefix.entries()];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [prefix, shas] = next;
      try {
        const res = await hooks.fetch(`${BREACH_URL}${prefix}`, { headers: { "Add-Padding": "true", "User-Agent": "Codecaine-File-Manager" }, signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw new Error("status");
        const lines = (await res.text()).split(/\r?\n/).filter(Boolean);
        if (lines.length > 0 && !lines.every((l) => /^[0-9A-F]{35}:\d{1,12}$/i.test(l.trim()))) throw new Error("shape");
        const counts = new Map(lines.map((l) => [l.trim().slice(0, 35).toUpperCase(), Number(l.trim().slice(36))] as const));
        for (const sha of shas) {
          const count = counts.get(sha.slice(5)) ?? 0;
          if (count > 0) for (const item of byHash.get(sha) ?? []) result.breached.push({ id: item.id, title: item.title, count });
        }
      } catch {
        result.failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  if (byPrefix.size > 0 && result.failed === byPrefix.size) throw new FmError("BREACH_UNAVAILABLE", "Couldn't reach the breach-check service. Check your internet connection and try again. Nothing was sent that identifies you or your passwords.");
  return result;
}
