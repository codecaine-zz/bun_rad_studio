// What the Secrets tab's modules share: the vault's status (from the server, never any secret), the registry of
// "revealed values" that must disappear on lock, blur and tab change, and the lock action. Modules talk through
// emit()/on() from state.js ("secrets-status", "secrets-locked", "secrets-unlocked", "secrets-items"), never by
// importing each other in a circle.
import { ApiError, call } from "./api.js";
import { announce } from "./dom.js";
import { emit } from "./state.js";

/** The latest status from the server (null until the first answer). */
export const sx = { status: null, selectedId: null, activeTab: false, userLock: false };

const wipers = new Set();

/** `fn` hides whatever secret this module is showing. Returns a function that forgets it. */
export function registerWiper(fn) {
  wipers.add(fn);
  return () => wipers.delete(fn);
}

/** Hides every revealed value (and masks every password box). Safe to call at any time. */
export function wipeAll() {
  for (const fn of [...wipers]) {
    try {
      fn();
    } catch (err) {
      console.error("A Secrets view could not be cleared", err instanceof Error ? err.name : "error");
    }
  }
}

export function setStatus(status) {
  const before = sx.status;
  sx.status = status;
  if (status.locked) {
    sx.selectedId = null;
    wipeAll();
  }
  emit("secrets-status", status);
  if (before && before.locked === false && status.locked) emit("secrets-locked");
  if ((!before || before.locked) && status.locked === false) emit("secrets-unlocked");
}

/** Asks the server for the status. Never throws; returns the status or null. */
export async function refreshStatus() {
  try {
    setStatus((await call("secrets/status")).status);
  } catch {
    // the File Manager is gone; the next call will say so
  }
  return sx.status;
}

export const errorText = (err, fallback = "Something went wrong. Nothing was changed.") => (err instanceof ApiError ? err.message : fallback);

/** Locks now. `why` is only used in the announcement. */
export async function lockNow(why = "Vault locked.") {
  sx.userLock = true;
  try {
    const res = await call("secrets/lock");
    setStatus(res.status);
    announce(why);
    if (res.saved === false) return { saved: false };
  } catch (err) {
    sx.userLock = false;
    announce(errorText(err));
  }
  return { saved: true };
}

/** 4:32 for 272 seconds. */
export const mmss = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** A typed location with "~" spelled out, for the server (which wants a full path). */
export function fullPath(text, home) {
  const t = text.trim();
  return t === "~" ? home : t.startsWith("~/") || t.startsWith("~\\") ? `${home}${t.slice(1)}` : t;
}
