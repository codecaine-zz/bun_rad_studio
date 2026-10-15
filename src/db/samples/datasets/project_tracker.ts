import { addDays, dayOf, dayStr, hashString, mulberry32 } from "../gen";
import { dataset, query, table, view, type Scale } from "../model";

const ASOF = "2025-06-30";
const START = "2024-03-01";
const dOf = (v: unknown) => String(v).slice(0, 10);
const PATH = ["backlog", "todo", "in_progress", "in_review", "done"] as const;
const LABELS = ["backend", "frontend", "ui", "api", "performance", "security", "tech-debt", "documentation", "mobile", "infra", "accessibility", "customer-reported", "regression", "quick-win"];
const SUMMARY_A = ["Add", "Fix", "Refactor", "Improve", "Remove", "Document", "Migrate", "Optimize", "Investigate", "Support"];
const SUMMARY_B = ["login flow", "search results", "export to CSV", "dashboard widgets", "notification emails", "checkout form", "API rate limits", "report builder", "user permissions", "mobile layout", "audit log", "billing page", "onboarding wizard", "cache layer", "webhook retries", "dark mode"];
const CFG: Record<Scale, { U: number; P: number; I: number }> = { small: { U: 24, P: 4, I: 300 }, medium: { U: 120, P: 12, I: 4000 }, large: { U: 500, P: 40, I: 25000 } };

interface Tr { from: string; to: string; at: string }
interface Is { type: string; project: number; created: string; trs: Tr[]; status: string; resolved: string | null; points: number | null; priority: string }
const cache = new Map<Scale, Is[]>();
// The hour grows with the transition number so transitions on one day stay in order.
const ts = (day: string, r: () => number, idx: number) => `${day} ${String(7 + Math.min(idx, 14)).padStart(2, "0")}:${String(Math.floor(r() * 60)).padStart(2, "0")}:00`;
function plan(scale: Scale): Is[] {
  const hit = cache.get(scale);
  if (hit) return hit;
  const { P, I } = CFG[scale];
  const r = mulberry32(hashString(`trk:${scale}`));
  const out: Is[] = [];
  for (let i = 1; i <= I; i++) {
    const epic = i % 25 === 1;
    const type = epic ? "epic" : r() < 0.38 ? "bug" : r() < 0.55 ? "story" : "task";
    const project = (Math.floor((i - 1) / 25) % P) + 1;
    const created = dayStr(dayOf(START) + Math.floor(Math.pow(r(), 0.85) * (dayOf(ASOF) - dayOf(START) - 1)));
    const target = r() < 0.06 ? -1 : Math.min(4, Math.floor(r() * 5.4 * (0.5 + Math.min(1, (dayOf(ASOF) - dayOf(created)) / 120))));
    const trs: Tr[] = [];
    let cur: string = "backlog"; let day = created;
    const steps = target === -1 ? Math.floor(r() * 3) : target;
    for (let k = 1; k <= steps; k++) {
      day = addDays(day, Math.max(0, Math.round(Math.exp(Math.log(type === "bug" ? 1.5 : 3) + 0.8 * (r() * 2 - 1) * 1.7))));
      if (day > ASOF) break;
      const next = PATH[k]!;
      trs.push({ from: cur, to: next, at: ts(day, r, trs.length) }); cur = next;
    }
    if (target === -1 && day <= ASOF) { day = addDays(day, Math.floor(r() * 6)); if (day <= ASOF) { trs.push({ from: cur, to: "canceled", at: ts(day, r, trs.length) }); cur = "canceled"; } }
    // some finished issues are reopened once
    if (cur === "done" && r() < 0.06) { const d2 = addDays(day, 1 + Math.floor(r() * 12)); if (d2 <= ASOF) { trs.push({ from: "done", to: "in_progress", at: ts(d2, r, trs.length) }); cur = "in_progress"; const d3 = addDays(d2, 1 + Math.floor(r() * 6)); if (d3 <= ASOF) { trs.push({ from: "in_progress", to: "done", at: ts(d3, r, trs.length) }); cur = "done"; } } }
    const done = cur === "done" || cur === "canceled";
    out.push({ type, project, created, trs, status: cur, resolved: done ? trs[trs.length - 1]!.at : null, points: type === "epic" ? null : r() < 0.8 ? [1, 2, 3, 5, 8][Math.floor(r() * 5)]! : null, priority: r() < 0.04 ? "highest" : r() < 0.2 ? "high" : r() < 0.6 ? "medium" : r() < 0.85 ? "low" : "lowest" });
  }
  cache.set(scale, out);
  return out;
}

export default dataset({
  id: "project_tracker",
  title: "Project Management and Issue Tracker",
  tagline: "Projects, sprints, epics, stories, bugs, workflow history, comments, labels, links and worklogs.",
  description:
    "A Jira-style tracker: projects with sprints and releases, epics that own stories, tasks and bugs (a self-referencing issue tree), a status workflow whose every transition is recorded in the history table, " +
    "comments, labels, blocking links, assignees and worklogs. Cycle times, reopen rates, sprint velocity and epic progress fall straight out of the data. All people and tickets are synthetic.",
  tags: ["Software", "Productivity", "Analytics"],
  asOf: ASOF,
  highlights: ["issue tree (self FK)", "workflow history", "cycle time", "sprint velocity", "reopen detection (LAG)"],
  tables: [
    table("team_member", "People who work in the tracker.", ["id id", "username str(40) uq", "full_name str(80)", "email str(120) uq", "role enum(admin,developer,qa,product_manager,designer)", "is_active bool def:true", "created_at ts def:now"], {
      n: [CFG.small.U, CFG.medium.U, CFG.large.U], gen: (g, i) => { const f = g.first(), l = g.last(); return { username: `${f}.${l}${i}`.toLowerCase(), full_name: `${f} ${l}`, email: `${f}.${l}${i}@tracker.example`.toLowerCase(), role: g.w([["developer", 60], ["qa", 14], ["product_manager", 10], ["designer", 10], ["admin", 6]] as const), is_active: g.bool(0.94), created_at: g.ts(g.date("2022-01-01", "2024-03-01")) }; },
    }),
    table("project", "Projects.", ["id id", "project_key str(6) uq", "name str(80)", "lead_id int fk:team_member", "status enum(active,archived)", "created_at ts def:now"], {
      n: [CFG.small.P, CFG.medium.P, CFG.large.P], gen: (g, i) => ({ project_key: ["WEB", "API", "MOB", "DATA", "INFRA", "SEC", "BILL", "AUTH", "SRCH", "NOTIF", "ADMIN", "DOCS"][(i - 1) % 12] + (i > 12 ? String(Math.floor((i - 1) / 12)) : ""), name: `${g.pick(["Customer", "Platform", "Growth", "Core", "Partner", "Internal"])} ${g.pick(["Portal", "Services", "Experience", "Tooling", "Gateway"])} ${i}`, lead_id: g.int(1, g.count("team_member")), status: g.bool(0.93) ? "active" : "archived", created_at: g.ts(g.date("2022-06-01", "2024-02-01")) }),
    }),
    table("sprint", "Two-week sprints (four per project).", ["id id", "project_id int fk:project cascade", "name str(40)", "start_date date", "end_date date", "state enum(closed,active,future)", "goal str(160) null"], {
      n: (n) => n("project") * 4, uq: [["project_id", "name"]], ck: ["end_date > start_date"],
      gen: (g, i) => { const p = Math.ceil(i / 4); const k = (i - 1) % 4; const start = addDays("2025-04-21", k * 14 - 14); return { project_id: p, name: `Sprint ${k + 1}`, start_date: start, end_date: addDays(start, 13), state: k < 2 ? "closed" : k === 2 ? "active" : "future", goal: g.bool(0.7) ? g.sentence(6) : null }; },
    }),
    table("project_release", "Versions shipped by a project.", ["id id", "project_id int fk:project cascade", "version str(12)", "release_date date", "status enum(released,unreleased)"], {
      n: (n) => n("project") * 3, uq: [["project_id", "version"]], gen: (g, i) => { const p = Math.ceil(i / 3); const k = (i - 1) % 3; return { project_id: p, version: `${1 + k}.${g.int(0, 9)}.0`, release_date: addDays("2024-09-01", k * 90), status: k < 2 ? "released" : "unreleased" }; },
    }),
    table("component", "Parts of a project that issues belong to.", ["id id", "project_id int fk:project cascade", "name str(40)", "owner_id int fk:team_member null"], {
      n: (n) => n("project") * 3, uq: [["project_id", "name"]],
      gen: (g, i) => ({ project_id: Math.ceil(i / 3), name: ["Frontend", "Backend", "Infrastructure"][(i - 1) % 3]!, owner_id: g.bool(0.8) ? g.fkSkew(g.count("team_member"), 1.2) : null }),
    }),
    table("label", "Labels.", ["id id", "name str(30) uq", "color char(6)"], { rows: LABELS.map((name, i) => ({ name, color: ["d73a4a", "0075ca", "cfd3d7", "a2eeef", "7057ff", "e4e669", "008672", "d876e3", "ff9f1c", "5319e7", "0e8a16", "b60205", "fbca04", "1d76db"][i] })) }),
    table("issue", "Epics, stories, tasks and bugs. parent_id points at the epic that owns an issue.", [
      "id id", "issue_key str(14) uq", "project_id int fk:project", "issue_type enum(epic,story,task,bug)", "parent_id int fk:issue null", "summary str(200)", "description text", "status enum(backlog,todo,in_progress,in_review,done,canceled)", "priority enum(lowest,low,medium,high,highest)", "assignee_id int fk:team_member null", "reporter_id int fk:team_member", "sprint_id int fk:sprint null", "release_id int fk:project_release null", "component_id int fk:component null", "story_points smallint null", "created_at ts", "updated_at ts upd", "resolved_at ts null", "due_date date null",
    ], {
      n: [CFG.small.I, CFG.medium.I, CFG.large.I], ix: ["status,priority", "assignee_id,status", "project_id,issue_type"],
      gen: (g, i) => { const x = plan(g.scale)[i - 1]!; const seq = Math.floor((i - 1) / (25 * g.count("project"))) * 25 + ((i - 1) % 25) + 1; const key = `${["WEB", "API", "MOB", "DATA", "INFRA", "SEC", "BILL", "AUTH", "SRCH", "NOTIF", "ADMIN", "DOCS"][(x.project - 1) % 12]}${x.project > 12 ? Math.floor((x.project - 1) / 12) : ""}-${seq}`; const epicId = Math.floor((i - 1) / 25) * 25 + 1; const inSprint = x.type !== "epic" && g.bool(0.6); const sprint = inSprint ? (x.project - 1) * 4 + 1 + g.int(0, 2) : null; return { issue_key: key, project_id: x.project, issue_type: x.type, parent_id: x.type === "epic" ? null : epicId, summary: `${g.pick(SUMMARY_A)} ${g.pick(SUMMARY_B)}`, description: g.sentence(14), status: x.status, priority: x.priority, assignee_id: x.status === "backlog" && g.bool(0.7) ? null : g.fkSkew(g.count("team_member"), 1.3), reporter_id: g.fk(g.count("team_member")), sprint_id: sprint, release_id: x.status === "done" && g.bool(0.5) ? (x.project - 1) * 3 + 1 + g.int(0, 1) : null, component_id: x.type === "epic" ? null : (x.project - 1) * 3 + 1 + g.int(0, 2), story_points: x.points, created_at: `${x.created} 06:${String(g.int(0, 59)).padStart(2, "0")}:00`, resolved_at: x.resolved, due_date: g.bool(0.2) ? addDays(x.created, g.int(7, 60)) : null }; },
    }),
    table("issue_history", "Every status transition of every issue.", ["id id", "issue_id int fk:issue cascade", "from_status str(12)", "to_status str(12)", "changed_by int fk:team_member", "changed_at ts"], {
      n: (n, s) => plan(s).reduce((a, x) => a + x.trs.length, 0), ix: ["issue_id,changed_at", "to_status,changed_at"],
      all: (g) => plan(g.scale).flatMap((x, i) => x.trs.map((t) => ({ issue_id: i + 1, from_status: t.from, to_status: t.to, changed_by: g.fkSkew(g.count("team_member"), 1.3), changed_at: t.at }))),
    }),
    table("issue_comment", "Discussion on issues.", ["id id", "issue_id int fk:issue cascade", "author_id int fk:team_member", "body text", "created_at ts"], {
      n: [600, 8000, 45000], ix: ["issue_id,created_at"],
      gen: (g, i) => { const iss = g.rows("issue")[g.spread(g.count("issue"), i, 1.4) - 1]!; return { issue_id: iss.id, author_id: g.fkSkew(g.count("team_member"), 1.2), body: `${g.sentence(12)} ${g.bool(0.3) ? g.sentence(8) : ""}`.trim(), created_at: g.ts(g.date(dOf(iss.created_at), ASOF)) }; },
    }),
    table("issue_label", "Labels applied to issues.", ["issue_id int fk:issue cascade", "label_id int fk:label"], {
      pk: ["issue_id", "label_id"], n: [550, 7500, 45000],
      gen: (g, i) => { const N = g.count("issue"); const c = Math.floor((i - 1) / N); const issue = ((i - 1) % N) + 1; return { issue_id: issue, label_id: ((c * 3 + issue * 5) % LABELS.length) + 1 }; },
    }),
    table("issue_link", "Relations between issues (blocks, relates to, duplicates).", ["id id", "from_issue_id int fk:issue cascade", "to_issue_id int fk:issue cascade", "link_type enum(blocks,relates,duplicates)"], {
      n: [30, 400, 2500], ck: ["from_issue_id <> to_issue_id"],
      gen: (g, i) => { const N = g.count("issue"); const a = ((i * 7) % N) + 1; let b = ((i * 13 + 5) % N) + 1; if (b === a) b = (b % N) + 1; return { from_issue_id: a, to_issue_id: b, link_type: g.w([["blocks", 45], ["relates", 45], ["duplicates", 10]] as const) }; },
    }),
    table("attachment", "Files attached to issues (metadata only).", ["id id", "issue_id int fk:issue cascade", "file_name str(120)", "size_bytes int", "content_type str(40)", "uploaded_by int fk:team_member", "uploaded_at ts"], {
      n: [60, 800, 5000], ck: ["size_bytes > 0"],
      gen: (g, i) => { const iss = g.rows("issue")[g.spread(g.count("issue"), i, 1.3) - 1]!; const ext = g.pick(["png", "pdf", "log", "csv", "txt"]); return { issue_id: iss.id, file_name: `${g.pick(["screenshot", "trace", "report", "export", "notes"])}-${i}.${ext}`, size_bytes: Math.round(g.logNormal(180000, 1.2)) + 1, content_type: { png: "image/png", pdf: "application/pdf", log: "text/plain", csv: "text/csv", txt: "text/plain" }[ext]!, uploaded_by: g.fkSkew(g.count("team_member"), 1.2), uploaded_at: g.ts(g.date(dOf(iss.created_at), ASOF)) }; },
    }),
    table("worklog", "Time logged against issues.", ["id id", "issue_id int fk:issue cascade", "author_id int fk:team_member", "started_at ts", "minutes int", "note str(120) null"], {
      n: [300, 5000, 30000], ck: ["minutes > 0"],
      gen: (g, i) => { const iss = g.rows("issue")[g.spread(g.count("issue"), i, 1.5) - 1]!; return { issue_id: iss.id, author_id: iss.assignee_id ?? g.fk(g.count("team_member")), started_at: g.ts(g.date(dOf(iss.created_at), ASOF), 8, 18), minutes: Math.max(5, Math.round(g.logNormal(75, 0.8) / 5) * 5), note: g.bool(0.3) ? g.sentence(5) : null }; },
    }),
  ],
  views: [
    view("v_open_issues_by_priority", "Open issues per project and priority.", () => `
SELECT p.project_key, i.priority, COUNT(*) AS open_issues, SUM(COALESCE(i.story_points, 0)) AS points
FROM issue i JOIN project p ON p.id = i.project_id WHERE i.status NOT IN ('done', 'canceled') GROUP BY p.project_key, i.priority`),
    view("v_cycle_time", "Days from creation to resolution for done issues.", (d) => `
SELECT i.id AS issue_id, i.issue_key, i.issue_type, i.priority, i.story_points, i.created_at, i.resolved_at, ${d.diffDays("i.resolved_at", "i.created_at")} AS cycle_days
FROM issue i WHERE i.status = 'done' AND i.resolved_at IS NOT NULL`),
    view("v_assignee_load", "Open work per assignee.", () => `
SELECT t.full_name, COUNT(*) AS open_issues, SUM(CASE WHEN i.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress, SUM(COALESCE(i.story_points, 0)) AS open_points
FROM issue i JOIN team_member t ON t.id = i.assignee_id WHERE i.status NOT IN ('done', 'canceled') GROUP BY t.full_name`),
    view("v_blocked_issues", "Open issues that are blocked by another unresolved issue.", () => `
SELECT blocked.issue_key AS blocked_issue, blocker.issue_key AS blocked_by, blocker.status AS blocker_status
FROM issue_link l JOIN issue blocker ON blocker.id = l.from_issue_id JOIN issue blocked ON blocked.id = l.to_issue_id
WHERE l.link_type = 'blocks' AND blocker.status NOT IN ('done', 'canceled') AND blocked.status NOT IN ('done', 'canceled')`),
    view("v_sprint_summary", "Committed and completed points per sprint.", () => `
SELECT s.id AS sprint_id, p.project_key, s.name, s.state, COUNT(i.id) AS issues, COALESCE(SUM(i.story_points), 0) AS committed_points,
       COALESCE(SUM(CASE WHEN i.status = 'done' THEN i.story_points ELSE 0 END), 0) AS completed_points
FROM sprint s JOIN project p ON p.id = s.project_id LEFT JOIN issue i ON i.sprint_id = s.id GROUP BY s.id, p.project_key, s.name, s.state`),
    view("v_epic_progress", "Child counts and completion per epic.", (d) => `
SELECT e.issue_key AS epic, e.summary, COUNT(c.id) AS children, SUM(CASE WHEN c.status = 'done' THEN 1 ELSE 0 END) AS done,
       ${d.round("100.0 * SUM(CASE WHEN c.status = 'done' THEN 1 ELSE 0 END) / NULLIF(COUNT(c.id), 0)", 0)} AS pct_done
FROM issue e JOIN issue c ON c.parent_id = e.id WHERE e.issue_type = 'epic' GROUP BY e.issue_key, e.summary`),
  ],
  queries: [
    query("cycle_time_quartiles", "Cycle time by issue type", "Quartile boundaries of creation-to-done time per issue type (NTILE).", () => `
-- How long do things take?
SELECT issue_type, quartile, COUNT(*) AS issues, MIN(cycle_days) AS min_days, MAX(cycle_days) AS max_days
FROM (SELECT issue_type, cycle_days, NTILE(4) OVER (PARTITION BY issue_type ORDER BY cycle_days) AS quartile FROM v_cycle_time) t
GROUP BY issue_type, quartile ORDER BY issue_type, quartile`),
    query("bug_aging", "Open bug aging", "Open bugs bucketed by age at the reference date.", (d) => `
-- Bug aging buckets
SELECT CASE WHEN ${d.diffDays(d.asOf, d.dateOf("created_at"))} <= 7 THEN '0-7 days' WHEN ${d.diffDays(d.asOf, d.dateOf("created_at"))} <= 30 THEN '8-30 days' WHEN ${d.diffDays(d.asOf, d.dateOf("created_at"))} <= 90 THEN '31-90 days' ELSE '90+ days' END AS age_bucket,
       priority, COUNT(*) AS bugs
FROM issue WHERE issue_type = 'bug' AND status NOT IN ('done', 'canceled')
GROUP BY CASE WHEN ${d.diffDays(d.asOf, d.dateOf("created_at"))} <= 7 THEN '0-7 days' WHEN ${d.diffDays(d.asOf, d.dateOf("created_at"))} <= 30 THEN '8-30 days' WHEN ${d.diffDays(d.asOf, d.dateOf("created_at"))} <= 90 THEN '31-90 days' ELSE '90+ days' END, priority
ORDER BY age_bucket, bugs DESC`),
    query("reopened", "Reopened issues", "Issues that went back from done (LAG over the workflow history).", () => `
-- Quality signal: done -> reopened
SELECT i.issue_key, i.issue_type, h.changed_at AS reopened_at, h.from_status, h.to_status
FROM issue_history h JOIN issue i ON i.id = h.issue_id WHERE h.from_status = 'done' ORDER BY h.changed_at DESC LIMIT 20`),
    query("velocity", "Sprint velocity", "Completed points per sprint with a 2-sprint moving average (window frame).", (d) => `
-- Velocity trend per project
SELECT project_key, name, completed_points,
       ${d.round("AVG(completed_points) OVER (PARTITION BY project_key ORDER BY sprint_id ROWS BETWEEN 1 PRECEDING AND CURRENT ROW)", 1)} AS moving_avg
FROM v_sprint_summary WHERE state <> 'future' ORDER BY project_key, sprint_id LIMIT 30`),
    query("epic_progress", "Epic progress", "Epics ordered by completion with child counts (view over a self join).", () => `
-- Roadmap health
SELECT epic, children, done, pct_done FROM v_epic_progress WHERE children >= 3 ORDER BY pct_done DESC, children DESC, epic LIMIT 15`),
    query("wip", "Work in progress per person", "Assignees with the most issues in progress or in review.", () => `
-- WIP limit check
SELECT t.full_name, SUM(CASE WHEN i.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress, SUM(CASE WHEN i.status = 'in_review' THEN 1 ELSE 0 END) AS in_review, COUNT(*) AS total_wip
FROM issue i JOIN team_member t ON t.id = i.assignee_id WHERE i.status IN ('in_progress', 'in_review') GROUP BY t.full_name ORDER BY total_wip DESC, t.full_name LIMIT 15`),
    query("throughput", "Weekly throughput", "Issues completed per month with the change from the previous month.", (d) => `
-- Throughput trend
WITH m AS (SELECT ${d.ym("resolved_at")} AS month, COUNT(*) AS completed FROM issue WHERE status = 'done' AND resolved_at IS NOT NULL GROUP BY ${d.ym("resolved_at")})
SELECT month, completed, completed - LAG(completed) OVER (ORDER BY month) AS change_vs_prior FROM m ORDER BY month`),
    query("label_pairs", "Labels that appear together", "Pairs of labels used on the same issue (self join).", () => `
-- Label co-occurrence
SELECT a.name AS label_a, b.name AS label_b, COUNT(*) AS issues
FROM issue_label x JOIN issue_label y ON y.issue_id = x.issue_id AND y.label_id > x.label_id
JOIN label a ON a.id = x.label_id JOIN label b ON b.id = y.label_id
GROUP BY a.name, b.name ORDER BY issues DESC, label_a, label_b LIMIT 15`),
    query("time_vs_estimate", "Logged time vs story points", "Hours logged per story point for completed stories, by assignee role.", (d) => `
-- Are estimates realistic?
SELECT t.role, COUNT(DISTINCT i.id) AS stories, ${d.round("SUM(w.minutes) / 60.0 / NULLIF(SUM(DISTINCT i.story_points), 0)", 2)} AS hours_per_point_rough
FROM issue i JOIN worklog w ON w.issue_id = i.id JOIN team_member t ON t.id = w.author_id
WHERE i.status = 'done' AND i.story_points IS NOT NULL GROUP BY t.role ORDER BY stories DESC`),
  ],
});
