// "Project" section of the Dev tool: what kinds of project the folder holds (Node/Bun, Rust, Go, Python, V, Java, .NET,
// PHP, Ruby, Swift, C/C++, Docker, CI ...) as summary cards, with package scripts you can run in the Terminal.
import { call } from "./api.js";
import { announce, h } from "./dom.js";
import { runInTerminal } from "./devActions.js";
import { btn, createStatus, errorText, factList } from "./devCore.js";

const SAFE_SCRIPT = /^[\w:.@/-]{1,80}$/;

/** The command that runs a package script with the project's own package manager. */
export function scriptCommand(runner, name) {
  if (!SAFE_SCRIPT.test(name)) return null;
  if (runner === "yarn") return `yarn ${name}`;
  return `${["bun", "pnpm"].includes(runner) ? runner : "npm"} run ${name}`;
}

function scriptsBlock(card, root) {
  if (!card.scripts?.length) return null;
  const rows = card.scripts.map((s) => {
    const cmd = scriptCommand(card.runner, s.name);
    return h("li", { class: "dev-script" },
      h("span", { class: "dev-script-name pw-mono" }, s.name),
      h("span", { class: "dev-script-cmd pw-mono", title: s.command }, s.command),
      cmd ? btn("▶ Run in terminal", `Type "${cmd}" in the Terminal, in this project's folder, after you confirm. It runs the project's own script.`, () => runInTerminal(root, cmd, cmd)) : h("span", { class: "pw-hint" }, "(unusual name, not offered)"));
  });
  return h("div", { class: "dev-block" }, h("h4", {}, `Scripts (${card.scripts.length})`), h("ul", { class: "dev-scripts" }, rows));
}

function cardEl(card, root) {
  return h("section", { class: `pw-card dev-proj dev-proj-${card.id}`, "aria-label": card.title },
    h("h3", {}, h("span", { "aria-hidden": "true" }, `${card.icon} `), card.title),
    card.facts.length ? factList(card.facts) : null,
    ...card.lists.map((l) => h("div", { class: "dev-block" }, h("h4", {}, l.label), h("ul", { class: "dev-chips" }, l.items.map((i) => h("li", { class: "dev-chip" }, i))))),
    scriptsBlock(card, root));
}

export function createProject(env) {
  const status = createStatus();
  const host = h("div", { class: "dev-cardgrid" });
  let seq = 0;

  async function load() {
    const root = env.getRoot();
    if (!root) return status.set("Choose a folder first.", true);
    const mine = ++seq;
    status.set("Reading the project files…");
    try {
      const info = await call("dev/project", { root });
      if (mine !== seq) return;
      host.replaceChildren(...info.cards.map((c) => cardEl(c, root)));
      const kinds = info.cards.filter((c) => !["files", "ci", "make", "docker"].includes(c.id)).map((c) => c.title);
      status.set(info.cards.length ? `Found: ${kinds.join(", ") || "project files"}.` : "No project files were recognized in this folder. Try a folder that has a package.json, Cargo.toml, go.mod, pyproject.toml or similar.");
      announce(status.el.textContent);
    } catch (err) {
      if (mine === seq) status.set(errorText(err, "The project files couldn't be read."), true);
    }
  }

  return {
    el: h("div", { class: "dev-section" },
      h("div", { class: "pw-card" }, h("h3", {}, "Project overview"),
        h("p", { class: "pw-hint" }, "Read from the project's own files (nothing is run and nothing is sent anywhere). Names of .env files are listed, but their contents are never read."),
        h("div", { class: "pw-row" }, btn("Read project", "Look at this folder's project files and summarize them.", load, { primary: true })), status.el),
      host),
    load,
  };
}
