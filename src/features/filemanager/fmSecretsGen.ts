/**
 * The password generator behind "Generate": random characters (the Crypto tool's generator), random words from the
 * built-in list, or pronounceable syllables. Uses the operating system's secure random numbers; nothing is stored.
 */
import { randomInt } from "node:crypto";
import { clampPasswordLength, generatePassword } from "../../crypto_tools";
import { FmError } from "./fmPaths";
import { VAULT_WORDS } from "./fmVaultWords";

export interface Generated {
  mode: string;
  value: string;
  bits: number;
  strength: string;
}

const strengthWord = (bits: number): string => (bits < 40 ? "Weak" : bits < 60 ? "Fair" : bits < 80 ? "Strong" : "Very strong");
const flag = (v: unknown, dflt: boolean): boolean => (v === undefined ? dflt : v === true);
const SEPARATORS = ["-", " ", ".", "_", ""];
const CONSONANTS = "bcdfghjklmnprstvwz";
const VOWELS = "aeiou";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?";

function pick(chars: string): string {
  return chars[randomInt(chars.length)]!;
}

export function generateSecret(body: Record<string, any>): Generated {
  const mode = body.mode === undefined ? "password" : body.mode;
  if (mode === "passphrase") {
    const n = body.words === undefined ? 5 : Number(body.words);
    if (!Number.isInteger(n) || n < 3 || n > 12) throw new FmError("BAD_REQUEST", "Choose 3 to 12 words.");
    const separator = body.separator === undefined ? "-" : body.separator;
    if (!SEPARATORS.includes(separator)) throw new FmError("BAD_REQUEST", "Choose a separator: a dash, space, dot, underscore or none.");
    const cap = flag(body.capitalize, false);
    const words = Array.from({ length: n }, () => {
      const w = VAULT_WORDS[randomInt(VAULT_WORDS.length)]!;
      return cap ? w[0]!.toUpperCase() + w.slice(1) : w;
    });
    let value = words.join(separator);
    let bits = n * Math.log2(VAULT_WORDS.length);
    if (flag(body.number, false)) {
      value += `${separator}${randomInt(100)}`;
      bits += Math.log2(100);
    }
    return { mode, value, bits: Math.round(bits), strength: strengthWord(bits) };
  }
  if (mode === "pronounceable") {
    const length = body.length === undefined ? 16 : Number(body.length);
    if (!Number.isInteger(length) || length < 8 || length > 64) throw new FmError("BAD_REQUEST", "Choose a length from 8 to 64.");
    const digits = flag(body.digits, true);
    const symbols = flag(body.symbols, false);
    const tail = (digits ? 2 : 0) + (symbols ? 1 : 0);
    let out = "";
    let bits = 0;
    while (out.length < length - tail) {
      out += pick(CONSONANTS) + pick(VOWELS);
      bits += Math.log2(CONSONANTS.length * VOWELS.length);
    }
    out = out.slice(0, length - tail);
    if (flag(body.upper, true)) {
      const at = randomInt(out.length);
      out = out.slice(0, at) + out[at]!.toUpperCase() + out.slice(at + 1);
      bits += Math.log2(out.length);
    }
    if (digits) {
      out += pick("0123456789") + pick("0123456789");
      bits += 2 * Math.log2(10);
    }
    if (symbols) {
      out += pick(SYMBOLS);
      bits += Math.log2(SYMBOLS.length);
    }
    return { mode, value: out, bits: Math.round(bits), strength: strengthWord(bits) };
  }
  if (mode !== "password") throw new FmError("BAD_REQUEST", "Choose what to generate: random characters, a passphrase or a pronounceable password.");
  const length = body.length === undefined ? 20 : Number(body.length);
  if (!Number.isInteger(length) || length < 4 || length > 256) throw new FmError("BAD_REQUEST", "Choose a length from 4 to 256.");
  const lower = flag(body.lower, true);
  const upper = flag(body.upper, true);
  const digits = flag(body.digits, true);
  const symbols = flag(body.symbols, true);
  const noAmbiguous = flag(body.noAmbiguous, false);
  if (!lower && !upper && !digits && !symbols) throw new FmError("BAD_REQUEST", "Tick at least one kind of character (a–z, A–Z, 0–9 or symbols).");
  const value = generatePassword({ length: clampPasswordLength(length), lower, upper, digits, symbols, noAmbiguous });
  const amb = (s: string) => (noAmbiguous ? s.replace(/[O0oIl1|`'"]/g, "") : s);
  const pool = (lower ? amb("abcdefghijklmnopqrstuvwxyz").length : 0) + (upper ? amb("ABCDEFGHIJKLMNOPQRSTUVWXYZ").length : 0) + (digits ? amb("0123456789").length : 0) + (symbols ? amb(SYMBOLS).length : 0);
  const bits = Math.round(length * Math.log2(pool));
  return { mode, value, bits, strength: strengthWord(bits) };
}
