// "Git" section of the Dev tool: a read-only summary of the repository the folder belongs to. Remote addresses arrive
// with any password or token already removed by the server.
import { call } from "./api.js";
import { h } from "./dom.js";
import { sparkline } from "./devChart.js";
import { btn, createStatus, createTable, errorText, factList, num } from "./devCore.js";
import { formatDate, formatSize, plural } from "./util.js";

const when = (iso) => (iso ? formatDate(Date.parse(iso)) : "—");

export function createGit(env) {
  const status = createStatus();
  const host = h("div", { class: "dev-cardgrid" });
  let seq = 0;

  function render(g) {
    const cards = [];
    const sync = g.upstream ? `${g.ahead ?? 0} ahead, ${g.behind ?? 0} behind ${g.upstream}` : "no upstream branch";
    cards.push(h("section", { class: "pw-card", "aria-label": "Repository" }, h("h3", {}, "Repository"), factList([
      ["Branch", `${g.branch || "(unknown)"}${g.detached ? " (detached HEAD)" : ""}`],
      ["Upstream", sync],
      ["Changed files", `${g.changed ?? 0} changed, ${g.staged ?? 0} staged, ${g.untracked ?? 0} untracked`],
      ["Commits", num(g.commitCount ?? 0)],
      ["Last commit", g.lastCommit ? `${g.lastCommit.hash} — ${g.lastCommit.subject} (${g.lastCommit.author}, ${when(g.lastCommit.date)})` : "none yet"],
      ["First commit", when(g.firstCommitDate)],
      ["Tags", g.tags?.count ? `${g.tags.count} (latest: ${g.tags.latest.slice(0, 3).join(", ")})` : "none"],
      ["History size (.git)", g.gitDirBytes === null || g.gitDirBytes === undefined ? g.gitDirNote ?? "unknown" : formatSize(g.gitDirBytes)],
      g.subfolder ? ["Repository top", g.toplevel] : null,
    ].filter(Boolean))));
    if (g.remotes?.length) cards.push(h("section", { class: "pw-card", "aria-label": "Remotes" }, h("h3", {}, "Remotes"), h("ul", { class: "dev-chips" }, g.remotes.map((r) => h("li", { class: "dev-chip pw-mono" }, `${r.name}: ${r.url}`))), h("p", { class: "pw-hint" }, "Passwords and tokens in these addresses are removed before they are shown.")));
    if (g.perMonth?.length) {
      const total = g.perMonth.reduce((n, p) => n + p.commits, 0);
      const table = createTable({ caption: "Commits per month, last 12 months", columns: [{ key: "month", label: "Month", rowHeader: true }, { key: "commits", label: "Commits", num: true }] });
      table.render(g.perMonth.map((p) => ({ cells: [p.month, String(p.commits)] })));
      cards.push(h("section", { class: "pw-card", "aria-label": "Activity" }, h("h3", {}, "Activity"), sparkline(g.perMonth.map((p) => ({ label: p.month, value: p.commits })), { summary: `${plural(total, "commit")} in the last 12 months` }), h("p", { class: "pw-hint" }, `${plural(total, "commit")} in the last 12 months.`), h("details", {}, h("summary", {}, "Show the numbers"), table.el)));
    }
    if (g.contributors?.length) {
      const table = createTable({ caption: `Top contributors (${g.contributorCount} in all)`, columns: [{ key: "name", label: "Name", rowHeader: true }, { key: "commits", label: "Commits", num: true }] });
      table.render(g.contributors.map((c) => ({ cells: [c.name, num(c.commits)] })));
      cards.push(h("section", { class: "pw-card", "aria-label": "Contributors" }, h("h3", {}, "Contributors"), table.el));
    }
    if (g.biggestFiles?.length) {
      const table = createTable({ caption: "Biggest tracked files", columns: [{ key: "path", label: "File", rowHeader: true }, { key: "bytes", label: "Size", num: true }] });
      table.render(g.biggestFiles.map((f) => ({ cells: [f.path, formatSize(f.bytes)] })));
      cards.push(h("section", { class: "pw-card", "aria-label": "Biggest files" }, h("h3", {}, "Biggest tracked files"), table.el, g.biggestTruncated ? h("p", { class: "pw-hint" }, "The repository is large, so only the first part of the file list was looked at.") : null));
    }
    host.replaceChildren(...cards);
  }

  async function load() {
    const root = env.getRoot();
    if (!root) return status.set("Choose a folder first.", true);
    const mine = ++seq;
    status.set("Asking Git…");
    try {
      const res = await call("dev/git", { root });
      if (mine !== seq) return;
      const g = res.git;
      if (!g.isRepo) {
        host.replaceChildren();
        return status.set(g.message ?? "This folder isn't in a Git repository.");
      }
      render(g);
      status.set(`${g.branch || "Repository"}: ${plural(g.commitCount ?? 0, "commit")}.`);
    } catch (err) {
      if (mine === seq) status.set(errorText(err, "Git didn't answer."), true);
    }
  }

  return {
    el: h("div", { class: "dev-section" },
      h("div", { class: "pw-card" }, h("h3", {}, "Git summary"),
        h("p", { class: "pw-hint" }, "Only read-only Git commands are used. Nothing is fetched from the internet and nothing is changed."),
        h("div", { class: "pw-row" }, btn("Read Git history", "Summarize this folder's Git repository.", load, { primary: true })), status.el),
      host),
    load,
  };
}
