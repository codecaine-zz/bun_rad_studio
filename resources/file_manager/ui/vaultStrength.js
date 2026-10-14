// How strong a password looks, in plain words. This is a rough estimate that runs in the page, so it can answer as you
// type; nothing you type is sent anywhere for it. Real words and patterns are easier to guess than random characters,
// so word-like text is counted more strictly.

export const MIN_LENGTH = 10;

/** The labels, from worst to best. `level` 0 means nothing typed yet. */
export const LEVELS = ["Nothing typed yet", "Too short", "Weak", "Good", "Strong"];

/**
 * @param {string} password
 * @param {{ phrase: string, bits: number } | null} [suggested] a passphrase the page made itself, whose strength is known exactly
 * @returns {{ level: number, label: string, bits: number, tip: string }}
 */
export function strengthOf(password, suggested = null) {
  const chars = [...password.normalize("NFKC")];
  const length = chars.length;
  if (length === 0) return { level: 0, label: LEVELS[0], bits: 0, tip: "Type a password, or press “Suggest a passphrase”." };
  if (length < MIN_LENGTH) {
    return { level: 1, label: LEVELS[1], bits: 0, tip: `Use at least ${MIN_LENGTH} characters (you have ${length}). A passphrase of 4 or more random words is best.` };
  }
  let bits;
  if (suggested && suggested.phrase === password) {
    bits = suggested.bits;
  } else {
    let pool = 0;
    if (/[a-z]/.test(password)) pool += 26;
    if (/[A-Z]/.test(password)) pool += 26;
    if (/[0-9]/.test(password)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(password)) pool += 33;
    bits = length * Math.log2(Math.max(pool, 2));
    const unique = new Set(chars).size;
    if (unique < length / 2) bits *= unique / (length / 2);
    const letters = chars.filter((c) => /[A-Za-z]/.test(c)).length;
    // Words (even with separators), or a word followed by digits and a symbol ("Summer2024!"), are far easier to guess than random characters.
    if (/^[A-Za-z]+([ _.-][A-Za-z]+)*$/.test(password)) bits = Math.min(bits, letters * 2 + (length - letters));
    else if (/^[A-Za-z]{3,}[0-9]{1,6}[^A-Za-z0-9]{0,2}$/.test(password)) bits = Math.min(bits, letters * 2 + (length - letters) * 3.3 + 6);
    if (/(.)\1{3,}/.test(password) || /(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(password)) bits *= 0.7;
  }
  bits = Math.round(bits);
  if (bits < 45) return { level: 2, label: LEVELS[2], bits, tip: "This could be guessed by a determined attacker. Make it longer, or press “Suggest a passphrase”." };
  if (bits < 65) return { level: 3, label: LEVELS[3], bits, tip: "Good for most files. A longer passphrase of random words would make it stronger still." };
  return { level: 4, label: LEVELS[4], bits, tip: "Very hard to guess, as long as you chose it randomly and use it nowhere else." };
}
