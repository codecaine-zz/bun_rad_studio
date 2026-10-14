// Password hashing: turn a password into the safe form to store (Bun.password: argon2id, argon2i, argon2d or bcrypt),
// and check a password against a stored hash. Passwords are only ever in these boxes: never saved, never in the log.
import { call } from "./api.js";
import { debounce, h } from "./dom.js";
import { actionButton, attempt, card, checkBox, formatMs, lineBox, outBox, secretBox, selectBox, statusLine } from "./crypto_ui.js";

const ALGORITHMS = [
  ["argon2id", "argon2id (recommended)"],
  ["argon2i", "argon2i"],
  ["argon2d", "argon2d"],
  ["bcrypt", "bcrypt (older, still common)"],
];

const WHY = "Why not just SHA-256? Ordinary hashes are made to be fast, so an attacker who steals a database can try billions of guesses a second. Password hashes are slow on purpose, they need a lot of memory (argon2) and they add a random salt, so every password has its own hash. Only the stored hash is kept, never the password. To log in, hash what was typed the same way and compare.";

/** Builds the two password cards. Returns { cards, clear() }. */
export function buildPasswordCards(env) {
  let waiting = 0;

  // ---- Hash a password ------------------------------------------------------------------------------------------
  const pass = secretBox({ label: "Password to hash", tip: "The password you want a stored hash of. It is only used for this one calculation and is never saved or logged.", placeholder: "a password", secrets: env.secrets });
  const algorithm = selectBox({ label: "Method", tip: "argon2id is the current best choice for new passwords. argon2i and argon2d are variants. bcrypt is older but very widely supported.", options: ALGORITHMS });
  const memory = lineBox({ label: "Memory (KiB)", tip: "How much memory each hash needs, in KiB. 65536 is 64 MiB. More memory makes guessing harder for attackers. Allowed: 8 to 1,048,576 (1 GiB).", type: "number", value: "65536", min: 8, max: 1048576, width: "crypto-narrow" });
  const passes = lineBox({ label: "Passes", tip: "How many times the hash is repeated. Each extra pass makes it slower to compute and to guess. Allowed: 1 to 10.", type: "number", value: "2", min: 1, max: 10, width: "crypto-narrow" });
  const cost = lineBox({ label: "Cost", tip: "bcrypt's work factor: every +1 doubles the time. 10 is the usual minimum today; 12 is a common choice. Allowed: 4 to 16.", type: "number", value: "10", min: 4, max: 16, width: "crypto-narrow" });
  const estimate = h("p", { class: "pw-hint", role: "status", "data-copy": "off" });
  const wipe = checkBox("Empty the password box afterwards", "Clears the password you typed as soon as the answer is ready, so it doesn't sit on the screen.", true);
  const hashStatus = statusLine();
  const stored = outBox("Hash to store", "The result to store in your database or settings file. It starts with $argon2id$ (or $2b$ for bcrypt) and includes the method, the settings and the random salt, so it can be checked later.", { secret: false, onCopy: () => env.log("Copy password hash", "") });
  const note = h("p", { class: "pw-hint", role: "status", "data-copy": "Note about bcrypt" });
  const hashButton = actionButton("Hash the password", "Work out the hash to store. Strong settings take a moment on purpose; the window stays usable meanwhile.", async () => {
    const mine = ++waiting;
    cancel.hidden = false;
    hashStatus.set("Working it out… strong password hashes are slow on purpose.");
    const r = await attempt(hashButton, hashStatus, () => call("crypto/pwhash", { password: pass.input.value, algorithm: algorithm.input.value, memoryCost: Number(memory.input.value), timeCost: Number(passes.input.value), cost: Number(cost.input.value) }));
    cancel.hidden = true;
    if (mine !== waiting) return;
    if (!r) return env.log("Hash password", "failed");
    stored.set(r.hash);
    env.setLast(r.hash);
    note.textContent = r.note;
    hashStatus.set(`Done in ${formatMs(r.ms)} (${r.description}). Store this hash, not the password.`, "ok");
    env.log("Hash password", `${r.algorithm}, ${formatMs(r.ms)}`);
    if (wipe.input.checked) pass.input.value = "";
  }, { primary: true });
  const cancel = actionButton("Stop waiting", "Stop waiting for the answer. The computer may still finish the calculation in the background, but its result is thrown away.", () => {
    waiting++;
    cancel.hidden = true;
    hashButton.disabled = false;
    checkButton.disabled = false;
    hashStatus.set("Stopped waiting.");
    checkStatus.set("Stopped waiting.");
  });
  cancel.hidden = true;

  function showFields() {
    const bcrypt = algorithm.input.value === "bcrypt";
    memory.el.hidden = passes.el.hidden = bcrypt;
    cost.el.hidden = !bcrypt;
  }
  const refreshEstimate = debounce(async () => {
    const r = await call("crypto/pwcost", { algorithm: algorithm.input.value, memoryCost: Number(memory.input.value), timeCost: Number(passes.input.value), cost: Number(cost.input.value) }).catch(() => null);
    estimate.textContent = r ? `Rough guess: about ${formatMs(r.estimateMs)} on a typical computer. Slower is safer, but don't make your own users wait too long.` : "Choose settings within the allowed ranges to see a time guess.";
  }, 250);
  for (const box of [algorithm, memory, passes, cost]) box.input.addEventListener("input", () => {
    showFields();
    refreshEstimate();
  });
  algorithm.input.addEventListener("change", () => {
    showFields();
    refreshEstimate();
  });
  showFields();

  const hashCard = card("Hash a password for storing", WHY,
    pass.el, h("div", { class: "pw-row" }, algorithm.el, memory.el, passes.el, cost.el), estimate, wipe.el,
    h("div", { class: "pw-row" }, hashButton, cancel), hashStatus.el, stored.el, note);
  hashCard.setAttribute("data-copy-secret", "");

  // ---- Check a password -----------------------------------------------------------------------------------------
  const checkPass = secretBox({ label: "Password to check", tip: "The password someone typed. It is hashed with the settings found inside the stored hash and compared. It is never saved or logged.", placeholder: "a password", secrets: env.secrets });
  const checkHash = lineBox({ label: "Stored hash", tip: "Paste the stored hash here. It starts with $argon2id$, $argon2i$, $argon2d$ or $2b$ (bcrypt). The method is read from the hash itself.", placeholder: "$argon2id$v=19$m=65536,t=2,p=1$…", width: "crypto-wide" });
  const checkStatus = statusLine("Password check result");
  const checkButton = actionButton("Check the password", "Find out whether this password belongs to the stored hash.", async () => {
    const mine = ++waiting;
    cancel.hidden = false;
    checkStatus.set("Checking… strong password hashes are slow on purpose.");
    const r = await attempt(checkButton, checkStatus, () => call("crypto/pwcheck", { password: checkPass.input.value, hash: checkHash.input.value }));
    cancel.hidden = true;
    if (mine !== waiting) return;
    if (!r) return env.log("Check password", "failed");
    checkStatus.set(r.matches ? `✔ That is the right password (${r.description}).` : `✖ That is not the password for this hash (${r.description}).`, r.matches ? "ok" : "bad");
    env.log("Check password", `${r.algorithm}, ${r.matches ? "right" : "wrong"}, ${formatMs(r.ms)}`);
    if (wipe.input.checked) checkPass.input.value = "";
  }, { primary: true });
  const checkCard = card("Check a password against a stored hash", "Paste a hash made by the card above (or by your own app, if it used argon2 or bcrypt) and a password to see if they belong together. The method and settings are read from the hash. A hash that would need more than 1 GiB of memory or very many passes is refused so a pasted hash can't freeze this computer.",
    checkPass.el, checkHash.el, h("div", { class: "pw-row" }, checkButton), checkStatus.el);
  checkCard.setAttribute("data-copy-secret", "");

  return {
    cards: [hashCard, checkCard],
    clear() {
      waiting++;
      for (const box of [pass, checkPass, checkHash]) box.input.value = "";
      stored.set("");
      note.textContent = "";
      for (const s of [hashStatus, checkStatus]) s.set("");
      cancel.hidden = true;
    },
  };
}
