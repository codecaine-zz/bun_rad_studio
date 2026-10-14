// Tokens and encoders: read and check JWTs, and convert text to and from URL, Base64 and hex forms.
import { call } from "./api.js";
import { clear, h } from "./dom.js";
import { formatSize } from "./util.js";
import { actionButton, attempt, card, formatMs, outBox, secretBox, statusLine, textBox } from "./crypto_ui.js";

const ENCODERS = [
  ["url-encode", "URL encode", "Make text safe to put inside a web address: spaces become %20 and so on."],
  ["url-decode", "URL decode", "Turn %20-style text from a web address back into normal text."],
  ["base64-encode", "Base64 encode", "Write the text using only letters, digits, + and /. Common for sending data in text-only places. It is NOT encryption."],
  ["base64-decode", "Base64 decode", "Turn Base64 text back into the original text."],
  ["hex-encode", "Hex encode", "Write each byte of the text as two hex digits (0-9, a-f). It is NOT encryption."],
  ["hex-decode", "Hex decode", "Turn hex digits back into the original text."],
];

/** Builds the JWT and encoder cards. Returns { cards, clear() }. */
export function buildTokenCards(env) {
  // ---- JWT ------------------------------------------------------------------------------------------------------
  const token = textBox({ label: "Token (JWT)", tip: "Paste a JSON Web Token: three pieces joined by dots, like xxxxx.yyyyy.zzzzz. It is only read here, never sent anywhere else.", placeholder: "eyJhbGciOiJIUzI1NiIs…", rows: 4 });
  const secret = secretBox({ label: "Secret (to check the signature)", tip: "The shared secret the token was signed with. Needed only for 'Check signature', and only works for HS256, HS384 and HS512 tokens.", secrets: env.secrets });
  const status = statusLine();
  const headerOut = outBox("Header", "The header says how the token was signed.", { secret: false, onCopy: () => env.log("Copy header", "JWT") });
  const payloadOut = outBox("Payload (claims)", "The payload holds the facts the token states, like who it is for and when it expires.", { onCopy: () => env.log("Copy payload", "JWT") });
  const timesList = h("ul", { class: "crypto-list", "data-copy": "Token times" });
  const verdict = h("p", { class: "pw-status", role: "status", "data-copy": "Signature check result" });
  const notes = h("ul", { class: "crypto-list pw-hint", "data-copy": "Token warnings" });
  const details = h("div", { class: "crypto-jwt", hidden: true }, headerOut.el, payloadOut.el, h("div", { class: "crypto-label", "aria-hidden": "true", "data-copy-keep": "" }, "Times"), timesList, verdict, notes);

  async function inspect(button, withSecret) {
    const name = withSecret ? "JWT check signature" : "JWT decode";
    if (withSecret && !secret.input.value) return status.set("Type the secret first.", "bad");
    const r = await attempt(button, status, () => call("crypto/jwt", { token: token.input.value, secret: withSecret ? secret.input.value : "" }));
    if (!r) {
      details.hidden = true;
      return env.log(name, "failed");
    }
    headerOut.set(r.headerText);
    payloadOut.set(r.payloadText);
    env.setLast(r.payloadText);
    clear(timesList).append(...(r.times.length ? r.times.map((t) => h("li", { class: t.includes("EXPIRED") ? "pw-bad" : "" }, t)) : [h("li", {}, "This token has no issue or expiry time.")]));
    clear(notes).append(...r.warnings.map((t) => h("li", {}, t)));
    if (r.verified) {
      verdict.textContent = r.verified.ok ? `✔ The signature is valid (${r.verified.alg}). The token was signed with this secret and hasn't been changed.` : `✖ The signature is NOT valid: ${r.verified.reason}.`;
      verdict.className = `pw-status ${r.verified.ok ? "pw-ok" : "pw-bad"}`;
    } else {
      verdict.textContent = "The signature has not been checked. Enter the secret and press “Check signature”.";
      verdict.className = "pw-status";
    }
    details.hidden = false;
    status.set(`Read the token (algorithm ${r.alg})${r.expired === true ? ". It has EXPIRED" : ""}.`, r.expired === true ? "bad" : "ok");
    env.log(name, `${r.alg}${r.verified ? (r.verified.ok ? ", valid" : ", not valid") : ""}${r.expired === true ? ", expired" : ""}`);
  }

  const decode = actionButton("Decode token", "Show what's inside the token (header, claims and times). This does not prove the token is genuine.", () => inspect(decode, false), { primary: true });
  const verify = actionButton("Check signature", "Check that the token was signed with the secret above (HS256, HS384 or HS512) and was not altered. Also decodes it.", () => inspect(verify, true));
  const jwtCard = card("JWT reader and signature check", "A JWT is a small signed note that websites use to say who you are. Anyone can read one, so reading is not trusting: only a successful signature check shows it is genuine. Never share your secret.",
    token.el, secret.el, h("div", { class: "pw-row" }, decode, verify), status.el, details);
  jwtCard.setAttribute("data-copy-secret", "");

  // ---- Encoders -------------------------------------------------------------------------------------------------
  const text = textBox({ label: "Text to convert", tip: "Type or paste the text to encode or decode.", rows: 3 });
  const result = outBox("Converted text", "The converted text. Use its Copy button to copy just this result.", { onCopy: () => env.log("Copy result", "converted text") });
  const encStatus = statusLine();
  const buttons = ENCODERS.map(([mode, label, tip]) => {
    const button = actionButton(label, tip, async () => {
      const r = await attempt(button, encStatus, () => call("crypto/encode", { mode, text: text.input.value }));
      if (!r) return env.log(label, "failed");
      result.set(r.output);
      env.setLast(r.output);
      encStatus.set(r.note ?? `Done: ${formatSize(r.bytes)} in ${formatMs(r.ms)}.`, r.note ? "bad" : "ok");
      env.log(label, `${formatSize(r.bytes)}, ${formatMs(r.ms)}`);
    });
    return button;
  });
  const moveUp = actionButton("Move result up", "Put the result back in the box above, so you can convert it again (for example, to check it round-trips).", () => {
    if (!result.text()) return;
    text.input.value = result.text();
    result.set("");
  });
  const encoderCard = card("Encoders: URL, Base64 and hex", "These convert text between forms. They only change how text is written; they do not hide it, so none of them is a way to keep secrets.",
    text.el, h("div", { class: "pw-row" }, ...buttons, moveUp), encStatus.el, result.el);
  encoderCard.setAttribute("data-copy-secret", "");

  return {
    cards: [jwtCard, encoderCard],
    clear() {
      token.input.value = secret.input.value = text.input.value = "";
      for (const s of [status, encStatus]) s.set("");
      result.set("");
      details.hidden = true;
    },
  };
}
