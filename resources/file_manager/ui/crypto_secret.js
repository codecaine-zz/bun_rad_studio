// The "keeping secrets" half of the Crypto tool: AES lock/unlock with a passphrase, the strength meter,
// random value generators and the password generator.
import { call } from "./api.js";
import { debounce, h } from "./dom.js";
import { formatSize } from "./util.js";
import { actionButton, attempt, card, checkBox, formatMs, lineBox, outBox, secretBox, statusLine, textBox } from "./crypto_ui.js";

const AES_NOTES = [
  "This uses the same lock as Crypto Studio Pro: AES-256 in CBC mode with a fresh random starting value (IV) each time. The result looks like 32 letters/digits, a colon, then Base64 text.",
  "Your passphrase becomes the key with one plain SHA-256 step: there is no salt and no deliberately slow key stretching. That means the lock is only as strong as the passphrase: a short or common one can be guessed by a computer very quickly. Use a long random passphrase (see the strength meter). A passphrase that is exactly 64 characters of 0-9 and a-f is used directly as the key.",
  "This lock has no tamper check. A wrong passphrase or damaged text is usually reported, but not always: sometimes you get nonsense instead. Anyone who can change the locked text could alter it without you being told. For serious secrets use a dedicated, audited tool.",
];

function labelled(label, id, control) {
  return h("div", { class: "pw-field crypto-field" }, h("label", { for: id }, label), control);
}

/** Builds the AES, generator and password cards. Returns { cards, clear() }. */
export function buildSecretCards(env) {
  // ---- AES ------------------------------------------------------------------------------------------------------
  const pass = secretBox({ label: "Passphrase", tip: "The secret that locks and unlocks. Use the same one to unlock. Never share it, and don't forget it: nobody can recover locked text without it.", placeholder: "a long, hard-to-guess phrase", secrets: env.secrets });
  const input = textBox({ label: "Text to lock, or locked text to unlock", tip: "To lock: type the private text here. To unlock: paste the locked text here (the one with a colon in it).", rows: 4 });
  const result = outBox("Lock or unlock result", "The locked or unlocked text appears here. Use its Copy button to copy just this result.", { onCopy: () => env.log("Copy result", "lock or unlock") });
  const status = statusLine();
  const meter = h("meter", { class: "crypto-meter", min: "0", max: "128", low: "40", high: "80", optimum: "128", value: "0", "aria-label": "Strength estimate in bits", title: "How hard this would be to guess. A fuller bar is better." });
  const strengthText = h("span", { class: "pw-status", role: "status" });
  const strength = h("div", { class: "crypto-strength", hidden: true, "data-copy": "Strength estimate" }, meter, strengthText);

  async function showStrength(source, { quiet }) {
    if (!source.value) {
      strength.hidden = true;
      return;
    }
    const r = await call("crypto/entropy", { text: source.value }).catch(() => null);
    if (!r) return;
    meter.value = r.bits;
    strengthText.textContent = `${r.strength}: about ${r.bits} bits. ${r.advice}`;
    strength.hidden = false;
    if (!quiet) env.log("Strength check", "");
  }
  pass.input.addEventListener("input", debounce(() => showStrength(pass.input, { quiet: true }), 300));

  const lock = actionButton("Lock (encrypt)", "Scramble the text with your passphrase. Only the same passphrase can unlock it.", async () => {
    const r = await attempt(lock, status, () => call("crypto/encrypt", { text: input.input.value, passphrase: pass.input.value }));
    if (!r) return env.log("AES-256 lock", "failed");
    result.set(r.output);
    env.setLast(r.output);
    status.set(`Locked ${formatSize(r.bytes)} of text in ${formatMs(r.ms)}. Copy the result, and keep your passphrase safe.`, "ok");
    env.log("AES-256 lock", `${formatSize(r.bytes)}, ${formatMs(r.ms)}`);
  }, { primary: true });
  const unlock = actionButton("Unlock (decrypt)", "Turn locked text back into readable text using the same passphrase that locked it.", async () => {
    const r = await attempt(unlock, status, () => call("crypto/decrypt", { cipher: input.input.value, passphrase: pass.input.value }));
    if (!r) return env.log("AES-256 unlock", "failed");
    result.set(r.text);
    env.setLast(r.text);
    if (r.suspicious) status.set("It unlocked, but the result looks like nonsense, so the passphrase is probably wrong.", "bad");
    else status.set(`Unlocked in ${formatMs(r.ms)}.`, "ok");
    env.log("AES-256 unlock", `${formatSize(r.bytes)}, ${r.suspicious ? "result looks wrong, " : ""}${formatMs(r.ms)}`);
  });
  const checkPass = actionButton("Check passphrase strength", "Estimate how hard your passphrase would be to guess.", async () => {
    if (!pass.input.value) return status.set("Type a passphrase first.", "bad");
    await showStrength(pass.input, { quiet: false });
  });
  const checkText = actionButton("Check text strength", "Estimate how hard the text in the box above would be to guess (useful for checking a password you already have).", async () => {
    if (!input.input.value) return status.set("Type or paste some text first.", "bad");
    await showStrength(input.input, { quiet: false });
  });
  const moveUp = actionButton("Move result up", "Put the result back in the first box, so you can unlock what you just locked, or lock it again.", () => {
    if (!result.text()) return;
    input.input.value = result.text();
    result.set("");
  });
  const aesCard = card("Lock and unlock text with a passphrase (AES-256)", "Lock text so only someone with the passphrase can read it. Never share your passphrase. This tool never saves it anywhere.",
    pass.el, input.el, h("div", { class: "pw-row" }, lock, unlock, checkPass, checkText, moveUp), strength, status.el, result.el,
    h("details", { class: "crypto-details" }, h("summary", { title: "How this lock works and how strong it really is" }, "How safe is this lock? (technical details)"), AES_NOTES.map((t) => h("p", { class: "pw-hint" }, t))));

  // ---- Random values --------------------------------------------------------------------------------------------
  const genOut = outBox("Generated value", "The newest random value. Use its Copy button to copy just this value.", { onCopy: () => env.log("Copy value", "random value") });
  const genStatus = statusLine();
  const generate = async (button, label, body, detail) => {
    const r = await attempt(button, genStatus, () => call("crypto/generate", body));
    if (!r) return;
    genOut.set(r.value);
    env.setLast(r.value);
    genStatus.set(`${label}: about ${r.bits} bits of randomness.`, "ok");
    env.log(`Generate ${label}`, detail);
  };
  const uuid = actionButton("New UUID v4", "A random unique ID like 3b241101-e2bb-4255-8caf-4136c566a962. Handy as an identifier.", () => generate(uuid, "UUID v4", { kind: "uuid" }, ""));
  const hex32 = actionButton("32-byte hex key", "32 random bytes (256 bits) written as 64 characters of 0-9 and a-f. A good secret key.", () => generate(hex32, "32-byte hex key", { kind: "hex32" }, "32 bytes"));
  const b64 = actionButton("256-bit Base64 key", "32 random bytes (256 bits) written in Base64. A good secret key.", () => generate(b64, "256-bit Base64 key", { kind: "base64-256" }, "32 bytes"));
  const count = lineBox({ label: "Number of random bytes", tip: "How many random bytes to make, from 1 to 1024.", type: "number", value: "16", min: "1", max: "1024", width: "crypto-narrow" });
  const format = h("select", { id: "crypto-bytes-format", class: "crypto-input", title: "How to write the bytes: hex (0-9 and a-f) or Base64 (shorter)." }, h("option", { value: "hex" }, "Hex"), h("option", { value: "base64" }, "Base64"));
  const bytes = actionButton("Make random bytes", "Make the chosen number of random bytes from your computer's secure random generator.", () => {
    const n = parseInt(count.input.value, 10);
    return generate(bytes, "random bytes", { kind: "bytes", length: n, format: format.value }, `${Number.isFinite(n) ? n : "?"} bytes`);
  });
  const randomCard = card("Random keys and IDs", "Random values come from your computer's secure random generator, so they are safe to use as keys. Generate a new one each time; never reuse a key for different things.",
    h("div", { class: "pw-row" }, uuid, hex32, b64), h("div", { class: "pw-row" }, count.el, labelled("Write as", "crypto-bytes-format", format), bytes), genStatus.el, genOut.el);

  // ---- Password -------------------------------------------------------------------------------------------------
  const length = lineBox({ label: "Length", tip: "How many characters (4 to 256). Longer is stronger; 16 or more is a good choice.", type: "number", value: "20", min: "4", max: "256", width: "crypto-narrow" });
  const lower = checkBox("a–z", "Include lower-case letters.", true);
  const upper = checkBox("A–Z", "Include capital letters.", true);
  const digits = checkBox("0–9", "Include digits.", true);
  const symbols = checkBox("Symbols", "Include symbols like ! @ # $ %. Some websites don't allow them.", true);
  const clear = checkBox("No look-alikes", "Leave out characters that are easy to mix up, like O and 0, or l, 1 and I.", false);
  const pwOut = outBox("Generated password", "The newest password. It is shown here only and never saved. Use its Copy button to copy it.", { onCopy: () => env.log("Copy password", "") });
  const pwStatus = statusLine();
  const pwButton = actionButton("Generate password", "Make a new random password with the choices above. At least one of every chosen kind is included.", async () => {
    const r = await attempt(pwButton, pwStatus, () => call("crypto/generate", { kind: "password", length: parseInt(length.input.value, 10), lower: lower.input.checked, upper: upper.input.checked, digits: digits.input.checked, symbols: symbols.input.checked, noAmbiguous: clear.input.checked }));
    if (!r) return;
    length.input.value = String(r.value.length);
    pwOut.set(r.value);
    env.setLast(r.value);
    pwStatus.set(`${r.strength}: about ${r.bits} bits. Put it in a password manager rather than reusing it.`, "ok");
    env.log("Generate password", `${r.value.length} characters`);
  }, { primary: true });
  const passwordCard = card("Password generator", "Makes a random password with your computer's secure random generator. The password is only shown here: it is not saved or logged anywhere.",
    h("div", { class: "pw-row" }, length.el, lower.el, upper.el, digits.el, symbols.el, clear.el), h("div", { class: "pw-row" }, pwButton), pwStatus.el, pwOut.el);
  for (const c of [aesCard, randomCard, passwordCard]) c.setAttribute("data-copy-secret", "");

  return {
    cards: [aesCard, randomCard, passwordCard],
    clear() {
      for (const box of [pass, input]) box.input.value = "";
      result.set("");
      genOut.set("");
      pwOut.set("");
      for (const s of [status, genStatus, pwStatus]) s.set("");
      strength.hidden = true;
    },
  };
}
