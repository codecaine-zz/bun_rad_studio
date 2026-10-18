// The "Crypto" tool of the Power tools panel: everything Crypto Studio Pro can do, inside the File Manager.
// Hashes and HMAC, file hashing and checksum checks, AES lock/unlock, strength meter, random keys and passwords,
// password hashing, JWT reading/checking, encoders and a color converter. Secrets live only in the boxes of this page: they are never stored.
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { registerPowerTab } from "./power.js";
import { buildHashCards } from "./crypto_hash.js";
import { buildColorCards } from "./crypto_color.js";
import { buildPasswordCards } from "./crypto_password.js";
import { buildSecretCards } from "./crypto_secret.js";
import { buildTokenCards } from "./crypto_tokens.js";
import { actionButton, card, copyText, createLog } from "./crypto_ui.js";
import { copySectionNow } from "./copysection.js";

registerPowerTab({
  id: "crypto", label: "Crypto", icon: "🔐", tip: "Hashes, encryption, tokens, passwords and encoders",
  mount(root) {
    let lastOutput = "";
    const log = createLog();
    /** What the cards share: the activity log, the "last output" for the Copy button, and the secret boxes to re-hide. */
    const env = { secrets: [], log: log.add, setLast: (text) => (lastOutput = text) };

    const hashing = buildHashCards(env);
    const secrets = buildSecretCards(env);
    const passwords = buildPasswordCards(env);
    const tokens = buildTokenCards(env);
    const colours = buildColorCards(env);
    const sections = [hashing, secrets, passwords, tokens, colours];

    const copyOutput = actionButton("Copy output", "Copy the newest result (a digest, locked or unlocked text, a key, a password or converted text) to the clipboard.", async () => {
      if (await copyText(lastOutput, "The output")) log.add("Copy output", "");
    });
    const copyAll = actionButton("Copy all", "Copy everything shown on this tab (every heading, result and the activity log) as plain text. What you typed into the boxes is not included. Each section and each value also has its own Copy button.", async () => {
      if (await copySectionNow(grid, { title: "the whole Crypto tab", secret: true })) log.add("Copy all", "");
    });
    const clearAll = actionButton("Clear all", "Empty every box, result and the activity log on this tab, and hide the secret boxes. Nothing is saved anywhere, so this can't be undone.", () => {
      for (const s of sections) s.clear();
      for (const hide of env.secrets) hide();
      lastOutput = "";
      log.clear();
      toast("Everything on the Crypto tab was cleared.", { kind: "info" });
    }, { danger: true });
    const clearLog = actionButton("Clear log", "Empty the activity list only.", () => log.clear());

    const logCard = card("Activity log", "What you did on this tab: the action, a size and how long it took. It never contains passphrases, keys, passwords or your text, lives only in this page, and is forgotten when you close the File Manager.",
      log.empty, log.el, h("div", { class: "pw-row" }, clearLog));
    logCard.classList.add("crypto-span");
    const cards = [...hashing.cards, ...secrets.cards, ...passwords.cards, ...tokens.cards, ...colours.cards];
    cards[2].classList.add("crypto-span"); // the results table is wide

    const grid = h("div", { class: "crypto-grid" }, ...cards, logCard);

    root.append(
      h("div", { class: "crypto-toolbar pw-row" },
        h("p", { class: "pw-hint crypto-intro" }, "Everything here runs on your own computer. What you type is never saved, only shown in these boxes, and Clear all wipes it. Never share your passphrases, keys or secrets with anyone."),
        copyOutput, copyAll, clearAll),
      grid,
    );

    return {
      show: (opts) => hashing.show(opts),
      hide() {
        for (const hide of env.secrets) hide();
      },
    };
  },
});
