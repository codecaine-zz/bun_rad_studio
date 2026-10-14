// The health report: weak, reused, old and un-protected passwords, shown as lists of item names with a plain hint for
// fixing each. It is worked out on this computer; no password is shown or stored. The optional breach check says
// exactly what it sends, and only runs when you press the button and confirm.
import { call } from "./api.js";
import { h } from "./dom.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { toast } from "./menus.js";
import { errorText } from "./secretsState.js";
import { emit } from "./state.js";
import { plural } from "./util.js";

const SECTIONS = [
  ["weak", "Weak passwords", "Replace each with a long random one: open the item, press Edit, then Generate."],
  ["reused", "Reused passwords", "Every site should have its own password, so one leak can't open the others. Generate a new one for each."],
  ["old", "Old passwords", "Passwords that haven't changed for a year. Change the ones that matter most: email, banking, work."],
  ["no2fa", "Two-step sign-in not set up", "These sites offer a second step. Turn it on, then add the one-time code secret to the item."],
  ["duplicateUrls", "Several logins for the same address", "You may have duplicates. Keep one and move the others to the Trash."],
  ["inNotes", "Passwords written in notes", "Move the password into the Password field, and remove it from the notes."],
];

export async function healthDialog() {
  let report;
  try {
    report = (await call("secrets/health")).report;
  } catch (err) {
    toast(errorText(err), { kind: "error" });
    return;
  }
  let d = null;
  const go = (id) => {
    d.close();
    emit("secrets-pick", id);
  };
  const itemButton = (id, title, why = "") => h("button", { type: "button", class: "btn sx-link", title: "Open this item", onclick: () => go(id) }, why ? `${title} — ${why}` : title);
  const problems = SECTIONS.map(([key, heading, hint]) => {
    const rows = report[key];
    if (!rows.length) return null;
    const list = key === "reused" || key === "duplicateUrls"
      ? rows.map((g) => h("li", {}, g.host ? `${g.host}: ` : "", g.ids.map((id, i) => [i ? ", " : "", itemButton(id, g.titles[i])])))
      : rows.map((r) => h("li", {}, itemButton(r.id, r.title, r.why)));
    return h("section", { class: "sx-section", "aria-label": heading }, h("h3", {}, `${heading} (${rows.length})`), h("p", { class: "sx-hint" }, hint), h("ul", { class: "sx-plainlist" }, list));
  }).filter(Boolean);
  const breach = h("div", { class: "sx-breach", role: "status" });
  const check = h("button", { type: "button", class: "btn", title: "Ask haveibeenpwned.com whether any of your passwords appear in known data breaches. Only the first 5 characters of a fingerprint of each password are sent.", onclick: async () => {
    const ok = await confirmBox({
      title: "Check for known breaches?", confirmLabel: "Check now",
      message: "For each password, this program makes a one-way fingerprint (SHA-1) on your computer and sends ONLY its first 5 characters to haveibeenpwned.com, which answers with every fingerprint that starts the same way. The comparison happens here. The password, the rest of the fingerprint, your user names and websites never leave this computer. Other people's passwords share the same 5 characters, so the service can't tell which one is yours.",
    });
    if (!ok) return;
    check.disabled = true;
    breach.textContent = "Checking…";
    try {
      const { result } = await call("secrets/breach", { confirm: true });
      breach.replaceChildren(
        h("p", {}, result.breached.length ? `${plural(result.breached.length, "login")} use a password found in a known breach. Change ${result.breached.length === 1 ? "it" : "them"} now:` : `Checked ${plural(result.checked, "password")}: none was found in the breaches the service knows about.${result.failed ? ` (${plural(result.failed, "lookup")} didn't answer.)` : ""}`),
        h("ul", { class: "sx-plainlist" }, result.breached.map((b) => h("li", {}, itemButton(b.id, b.title, `seen ${b.count.toLocaleString("en-US")} times`)))));
    } catch (err) {
      breach.textContent = errorText(err);
    } finally {
      check.disabled = false;
    }
  } }, "Check for known breaches…");
  d = openDialog({
    title: "Password health", wide: true,
    body: [
      h("p", { role: "status" }, `Checked ${plural(report.checked, "password")} on this computer. ${problems.length ? "These need attention:" : "Nothing needs attention. 🎉"}`),
      problems,
      h("section", { class: "sx-section", "aria-label": "Breach check" }, h("h3", {}, "Known breaches (optional)"), h("p", { class: "sx-hint" }, "Off unless you press the button. Nothing is sent otherwise."), h("div", { class: "sx-row" }, check), breach),
    ],
    buttons: [{ label: "Close", value: null, primary: true }],
  });
  d.el.setAttribute("data-copy", "off");
}
