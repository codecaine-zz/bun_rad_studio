// "IP info" tool of the Power tools panel: look up an IP address, a domain or a CIDR block, with a toolkit of
// subnet helpers. The page never contacts the internet itself; every lookup goes through the File Manager server.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { registerPowerTab } from "./power.js";
import { buildToolkit } from "./iptools.js";
import { copyText, createView } from "./ipview.js";

function mount(root) {
  const target = h("input", {
    type: "text", class: "ip-target", spellcheck: "false", autocomplete: "off", placeholder: "8.8.8.8, github.com or 192.168.1.0/24",
    title: "An IP address (like 8.8.8.8), a domain name (like github.com) or a CIDR block (like 192.168.1.0/24). Leave it empty to look up your own public address.",
  });
  const token = h("input", {
    type: "password", class: "ip-token", spellcheck: "false", autocomplete: "off", placeholder: "optional",
    title: "Optional. A free token from ipinfo.io allows more lookups. It is only sent to ipinfo.io, and it is never saved.",
  });

  let seq = 0;
  const busyButtons = [];
  const setBusy = (busy) => {
    root.setAttribute("aria-busy", String(busy));
    for (const b of busyButtons) b.disabled = busy;
  };

  /** Runs an operation and shows its answer. A newer request replaces an older one that is still running. */
  async function run(op, body, typed) {
    const mine = ++seq;
    setBusy(true);
    view.setStatus(typed ? `Looking up ${typed}…` : "Working…");
    try {
      const answer = await call(op, body);
      if (mine !== seq) return;
      view.show(answer, typed);
      if (op === "ip/myip") target.value = answer.ip;
      else if (typed) target.value = typed;
    } catch (err) {
      if (mine !== seq) return;
      view.showError(err instanceof ApiError ? err.message : "That didn't work. Try again.", typed);
    } finally {
      if (mine === seq) setBusy(false);
    }
  }

  const lookup = (text) => run("ip/lookup", { target: text.trim(), token: token.value }, text.trim());
  async function openLink(link) {
    try {
      const r = await call("ip/openurl", { kind: link.kind, target: link.target, provider: link.provider });
      toast(`Opened ${new URL(r.opened).hostname} in your web browser.`, { kind: "success" });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't open that page.", { kind: "error" });
    }
  }
  const view = createView({ lookup: (text) => { target.value = text; return lookup(text); }, open: openLink });

  const button = (label, title, onclick, { primary = false, busy = true } = {}) => {
    const b = h("button", { type: "button", class: `pw-btn${primary ? " primary" : ""}`, title, onclick }, label);
    if (busy) busyButtons.push(b);
    return b;
  };

  target.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookup(target.value);
    }
  });

  const lookupCard = h("div", { class: "pw-card ip-lookup" },
    h("h3", {}, "Look up an address"),
    h("div", { class: "pw-row" },
      h("label", { class: "pw-field ip-grow" }, "IP address, domain or CIDR block", target),
      h("label", { class: "pw-field" }, "ipinfo.io token (optional)", token),
    ),
    h("div", { class: "pw-row" },
      button("🔍 Look up", "Look up the address, domain or CIDR block typed above.", () => lookup(target.value), { primary: true }),
      button("🌐 My public IP", "Find out which public IP address the internet sees you as.", () => run("ip/myip", { token: token.value }, "")),
      button("🧮 Subnet calculator", "Work out the details of the CIDR block typed above, like 192.168.1.0/24: first and last address, mask and size.", () => run("ip/subnet", { cidr: target.value }, target.value.trim())),
      button("💻 Network adapters", "List the network connections of this computer and their addresses.", () => run("ip/interfaces", {}, "")),
      button("🗺️ Open map", "Show the place of the last result on a map in your web browser.", () => {
        const where = view.last()?.loc;
        if (!where) return toast("There is no place to show. Look up a public address first.");
        return openLink({ kind: "map", target: where, provider: "google" });
      }, { busy: false }),
      button("💾 Copy JSON", "Copy the last result as JSON text.", () => copyText(view.last()?.json, "JSON"), { busy: false }),
      button("📋 Copy CSV", "Copy the last result as CSV text, which spreadsheets understand.", () => copyText(view.last()?.csv, "CSV"), { busy: false }),
      button("✕ Clear", "Clear the box and the results.", () => { seq++; setBusy(false); target.value = ""; view.reset(); target.focus(); }, { busy: false }),
    ),
    view.metrics,
    view.status,
    h("p", { class: "pw-hint ip-privacy" }, "Privacy: looking up a public address sends that address (not the domain name you typed) to ipinfo.io, or to ipwho.is if ipinfo.io can't answer. Your token goes to ipinfo.io only. Private addresses, subnet maths and adapters stay on this computer."),
  );

  root.append(
    lookupCard,
    buildToolkit({ view, getTarget: () => target.value, getToken: () => token.value, openLink }),
    h("div", { class: "pw-card ip-details" }, h("h3", {}, "Network properties & forensic metadata"), view.note, view.tableHost),
    h("div", { class: "pw-split" },
      h("div", { class: "pw-card ip-history" }, h("h3", {}, "Recent lookups (click one to repeat it)"), view.historyHost, h("div", { class: "pw-row" }, view.clearHistory)),
      h("div", { class: "pw-card ip-raw-card" }, h("h3", {}, "Raw output & deep links"), view.linksHost, view.raw),
    ),
  );

  return {
    show(opts) {
      if (typeof opts?.target === "string" && opts.target.trim()) {
        target.value = opts.target.trim();
        lookup(target.value);
      } else {
        target.focus();
      }
    },
    hide() {},
  };
}

registerPowerTab({
  id: "ip", label: "IP info", icon: "🌍", tip: "Look up an IP address or domain, and subnet tools",
  mount,
});
