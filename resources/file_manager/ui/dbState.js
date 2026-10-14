// Shared state of the Databases tab: what the server last told us (connections, settings, running studios) and the
// small helpers every part of the tab uses. Parts talk through the event bus in state.js, so they never import each other in a circle.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { emit } from "./state.js";

export const db = {
  engines: [],
  profiles: [],
  secretStore: { kind: "memory", persistent: false },
  settings: { detect: { auto: true, autoSave: false }, engines: {} },
  studios: [],
  limits: { maxStudios: 4 },
  selectedId: null,
  loaded: false,
};

/** Forgets everything (for tests that start the page more than once in one process). */
export function resetDatabases() {
  Object.assign(db, { engines: [], profiles: [], studios: [], selectedId: null, loaded: false, secretStore: { kind: "memory", persistent: false } });
}

export async function loadOverview() {
  const r = await call("db/overview");
  Object.assign(db, { engines: r.engines, profiles: r.profiles, secretStore: r.secretStore, settings: r.settings, studios: r.studios, limits: r.limits, loaded: true });
  if (db.selectedId && !db.profiles.some((p) => p.id === db.selectedId)) db.selectedId = null;
  emit("db-overview");
  return r;
}

export const engineInfo = (id) => db.engines.find((e) => e.id === id) ?? { id, label: id, icon: "🗄️", studioName: "Studio", defaultPort: null, studioAvailable: false };
export const profileById = (id) => db.profiles.find((p) => p.id === id) ?? null;
export const selectedProfile = () => profileById(db.selectedId);

export function errorText(err, fallback = "That didn't work.") {
  return err instanceof ApiError ? err.message : fallback;
}

const ENVIRONMENTS = {
  development: { icon: "🛠", label: "Development" },
  test: { icon: "🧪", label: "Test" },
  staging: { icon: "🎭", label: "Staging" },
  production: { icon: "⚠", label: "Production" },
};
export const ENVIRONMENT_NAMES = Object.keys(ENVIRONMENTS);

/** A badge that says the environment in words and an icon, never by colour alone. */
export function environmentBadge(environment) {
  const e = ENVIRONMENTS[environment] ?? ENVIRONMENTS.development;
  return h("span", { class: `db-env db-env-${environment}`, title: `This connection is marked as ${e.label.toLowerCase()}.` }, h("span", { "aria-hidden": "true" }, e.icon), ` ${e.label}`);
}

/** "db.example.com:3306 · shop" for a connection, in one line. */
export function summaryOf(p) {
  if (p.engine === "sqlite") return p.sqliteMode === "memory" ? "In memory" : p.path ?? "";
  const port = p.port ?? engineInfo(p.engine).defaultPort;
  const name = p.engine === "redis" ? `database ${p.dbIndex ?? 0}` : p.database;
  return `${p.host ?? "localhost"}${port ? `:${port}` : ""}${name ? ` · ${name}` : ""}`;
}

export function passwordWords(p) {
  if (p.engine === "sqlite") return "SQLite files have no password";
  if (!p.hasPassword) return "No password saved";
  return db.secretStore.persistent ? "Saved in your computer's keychain" : "Kept only until the File Manager closes (the keychain isn't available)";
}

export function studiosFor(profileId) {
  return db.studios.filter((s) => s.profileId === profileId && (s.state === "running" || s.state === "starting"));
}

/** A labelled form row: <label><span>text</span> control hint</label>. */
export function field(label, control, hint = "", extra = "") {
  return h("label", { class: `db-field ${extra}`.trim() }, h("span", { class: "db-field-label" }, label), control, hint ? h("span", { class: "db-field-hint" }, hint) : null);
}
