/**
 * Password rules for encryption, and the "Suggest a passphrase" generator. Independent of the File Manager's context.
 * The rules are deliberately short: a minimum length, and a refusal of passwords nobody should use. The real protection
 * is a long random passphrase plus the slow key derivation; the page's strength meter helps people choose well.
 */
import { randomInt } from "node:crypto";
import { FmError, splitName } from "./fmPaths";
import { VAULT_WORDS } from "./fmVaultWords";

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 1024;
export const MIN_PASSPHRASE_WORDS = 4;
export const MAX_PASSPHRASE_WORDS = 12;
export const DEFAULT_PASSPHRASE_WORDS = 6;

const COMMON = new Set([
  "1234567890", "12345678910", "0123456789", "1234567891", "0987654321", "9876543210", "1111111111", "0000000000",
  "qwertyuiop", "qwertyuiopasdf", "asdfghjkl", "asdfghjkl1", "zxcvbnm123", "1q2w3e4r5t", "1qaz2wsx3edc", "qazwsxedcrfv", "qwerty1234", "qwerty12345", "qwerty123456", "qwertyuiop1",
  "iloveyou12", "iloveyou123", "iloveyou1234", "letmein123", "letmein1234", "welcome123", "welcome1234", "administrator", "admin12345", "admin123456", "changeme123", "changeme12",
  "trustno1234", "monkey1234", "dragon1234", "football123", "baseball123", "superman123", "sunshine123", "princess123", "abcdefghij", "abcd123456", "abc1234567", "abcdefg123",
  "mypassword", "mypassword1", "mypassword123", "secretpassword", "supersecret", "masterkey1", "123456789a", "a123456789", "1234567890a",
  "internet123", "computer123", "starwars123", "whatever123", "freedom123", "shadow1234", "michael1234", "hello12345", "hellohello", "testtest12", "testing123", "test123456",
]);

const BASE_WORDS = ["qwerty", "letmein", "welcome", "iloveyou", "administrator", "changeme", "secret"];
const SEQUENCES = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "abcdefghijklmnopqrstuvwxyz"];

function isRepeated(text: string): boolean {
  const chars = [...text];
  if (new Set(chars).size < 4) return true;
  for (let period = 1; period <= 4; period++) {
    if (chars.length >= period * 2 && chars.every((c, i) => c === chars[i % period])) return true;
  }
  return false;
}

function isSequence(lower: string): boolean {
  return SEQUENCES.some((row) => row.includes(lower) || [...row].reverse().join("").includes(lower));
}

/** Throws a plain-language FmError ("WEAK_PASSWORD") when the password may not be used to lock files. `avoidNames` are the names of the items being locked. */
export function checkPasswordPolicy(password: unknown, avoidNames: string[] = []): void {
  if (typeof password !== "string" || password.length === 0) throw new FmError("BAD_PASSWORD", "Type a password first.");
  const normalized = password.normalize("NFKC");
  const length = [...normalized].length;
  if (length < MIN_PASSWORD_LENGTH) throw new FmError("WEAK_PASSWORD", `The password is too short. Use at least ${MIN_PASSWORD_LENGTH} characters; a passphrase of ${MIN_PASSPHRASE_WORDS} or more random words is best.`);
  if (length > MAX_PASSWORD_LENGTH) throw new FmError("BAD_PASSWORD", `The password is too long (the limit is ${MAX_PASSWORD_LENGTH} characters).`);
  const lower = normalized.toLowerCase();
  const letters = lower.replace(/[^a-z]/g, "");
  const common = COMMON.has(lower) || /^(password|passw0rd|p@ssw)/.test(lower) || BASE_WORDS.includes(letters);
  if (common || isSequence(lower)) throw new FmError("WEAK_PASSWORD", "That password is too easy to guess. Pick something nobody could predict, such as a passphrase of random words.");
  if (isRepeated(normalized)) throw new FmError("WEAK_PASSWORD", "That password repeats the same characters, which makes it easy to guess. Pick something less predictable.");
  const squashed = lower.replace(/[^\p{L}\p{N}]/gu, "");
  for (const name of avoidNames) {
    const [stem] = splitName(name);
    for (const candidate of new Set([name, stem])) {
      const c = candidate.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (c.length >= 4 && (squashed.includes(c) || (squashed.length >= 4 && c.includes(squashed)))) {
        throw new FmError("WEAK_PASSWORD", "The password shouldn't contain the name of the file or folder it protects. Pick something else.");
      }
    }
  }
}

/** Random words from the built-in list, joined with hyphens, using the operating system's secure random numbers. */
export function generatePassphrase(words: unknown = DEFAULT_PASSPHRASE_WORDS): { passphrase: string; words: number; bits: number } {
  const n = typeof words === "number" && Number.isFinite(words) ? Math.min(MAX_PASSPHRASE_WORDS, Math.max(MIN_PASSPHRASE_WORDS, Math.round(words))) : DEFAULT_PASSPHRASE_WORDS;
  const picked: string[] = [];
  for (let i = 0; i < n; i++) picked.push(VAULT_WORDS[randomInt(VAULT_WORDS.length)]!);
  return { passphrase: picked.join("-"), words: n, bits: Math.round(n * Math.log2(VAULT_WORDS.length)) };
}
