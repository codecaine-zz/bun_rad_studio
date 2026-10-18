// Calendar, World Clocks, Timestamp Converter, and one-click Dated Folder / Timestamp utilities for the File Manager clock.
import { call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { clear, h } from "./dom.js";
import { showMenu, toast } from "./menus.js";
import * as ops from "./ops.js";
import { activePane, isFolderView } from "./pane.js";
import { openPower } from "./power.js";
import { emit, inTrash, state } from "./state.js";

const pad2 = (n) => String(n).padStart(2, "0");

/** ISO-8601 week number (1..53) for a Date. */
export function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** 1-based day of the year (1..366) and total days in that year (365 or 366). */
export function dayOfYearOf(date) {
  const y = date.getFullYear();
  const start = new Date(y, 0, 1);
  const current = new Date(y, date.getMonth(), date.getDate());
  const dayOfYear = Math.round((current.getTime() - start.getTime()) / 86400000) + 1;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return { dayOfYear, daysInYear: leap ? 366 : 365 };
}

/** Formats the local timezone offset as "UTC-05:00" or "UTC+02:00". */
export function formatUtcOffset(date = new Date()) {
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

const LOCAL_TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
  } catch {
    return "Local";
  }
})();

/** Computes calendar metrics and copy-ready timestamp strings for `now`. */
export function dateMetrics(now = new Date()) {
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mm = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  const localDate = `${y}-${m}-${d}`;
  const fileStamp = `${localDate}_${hh}-${mm}-${ss}`;
  const isoUtc = now.toISOString();
  const unixMs = now.getTime();
  const unixSec = Math.floor(unixMs / 1000);
  const isoWeek = isoWeekOf(now);
  const { dayOfYear, daysInYear } = dayOfYearOf(now);
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const utcOffset = formatUtcOffset(now);
  const timeZone = LOCAL_TIMEZONE;
  const utcShortTime = `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())} UTC`;
  return {
    localDate,
    fileStamp,
    isoUtc,
    unixSec,
    unixMs,
    isoWeek,
    dayOfYear,
    daysInYear,
    quarter,
    utcOffset,
    timeZone,
    utcShortTime,
  };
}

/** Human-readable relative day label ("Today", "Tomorrow", "Yesterday", "In 4 days", "3 days ago"). */
export function relativeDayLabel(target, ref = new Date()) {
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const b = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  const diffDays = Math.round((a - b) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return diffDays > 0 ? `In ${diffDays} days` : `${Math.abs(diffDays)} days ago`;
}

/** Parses a Unix timestamp (seconds or milliseconds) or ISO/date string for the Epoch Converter. */
export function parseFlexibleTimestamp(raw, ref = new Date()) {
  const s = String(raw ?? "").trim();
  if (!s || s.toLowerCase() === "now") {
    return { ok: true, date: new Date(ref.getTime()), kind: "Current time", metrics: dateMetrics(ref) };
  }
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return { ok: false, error: "That number is out of range." };
    // Values under 10^11 (~year 5138 in seconds) are treated as Unix seconds; larger values as milliseconds.
    const isSeconds = Math.abs(n) < 1e11;
    const ms = isSeconds ? Math.round(n * 1000) : Math.round(n);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "That timestamp is outside the supported date range." };
    return { ok: true, date: d, kind: isSeconds ? "Unix seconds" : "Unix milliseconds", metrics: dateMetrics(d) };
  }
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "Enter a Unix timestamp (e.g. 1792285509) or an ISO date (e.g. 2026-10-17T19:05:00)." };
  }
  return { ok: true, date: d, kind: "Date string", metrics: dateMetrics(d) };
}

/** Builds a 6-week (42-day) monthly calendar grid with ISO week numbers. */
export function buildMonthGrid(year, month, today = new Date()) {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 (Sun) .. 6 (Sat)
  const gridStart = new Date(year, month, 1 - startOffset);
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + w * 7 + d);
      const cy = cell.getFullYear();
      const cm = cell.getMonth();
      const cd = cell.getDate();
      const localDate = `${cy}-${pad2(cm + 1)}-${pad2(cd)}`;
      days.push({
        date: cell,
        year: cy,
        month: cm,
        day: cd,
        localDate,
        inMonth: cm === month && cy === year,
        isToday: localDate === todayStr,
      });
    }
    // Use Thursday of the row (or Monday) for the ISO week number
    const rowWeek = isoWeekOf(days[4].date);
    weeks.push({ isoWeek: rowWeek, days });
  }
  return weeks;
}

export const WORLD_ZONES = [
  { id: "UTC", label: "UTC", icon: "🌐", zone: "UTC" },
  { id: "new_york", label: "New York", icon: "🗽", zone: "America/New_York" },
  { id: "london", label: "London", icon: "🎡", zone: "Europe/London" },
  { id: "berlin", label: "Berlin / Paris", icon: "🗼", zone: "Europe/Berlin" },
  { id: "tokyo", label: "Tokyo", icon: "🗾", zone: "Asia/Tokyo" },
  { id: "sydney", label: "Sydney", icon: "⛵", zone: "Australia/Sydney" },
];

export function formatWorldZone(zone, now = new Date(), use24h = false) {
  try {
    const time = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      hour: use24h ? "2-digit" : "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: !use24h,
    }).format(now);
    const day = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(now);
    return { time, day };
  } catch {
    return { time: now.toISOString().slice(11, 19), day: now.toISOString().slice(0, 10) };
  }
}

/** Copies `text` to the system clipboard through the server and shows a toast confirmation. */
export async function copyTimestamp(text, label = "timestamp") {
  try {
    const r = await call("copytext", { text: String(text) });
    toast(r.copied ? `Copied ${label}: ${text}` : "Couldn't copy to the clipboard.", { kind: r.copied ? "success" : "error" });
    return !!r.copied;
  } catch {
    toast("Couldn't copy to the clipboard.", { kind: "error" });
    return false;
  }
}

function ensureInFilesThen(fn) {
  if (state.workspace !== "files" && state.workspace !== "split" && state.workspace !== "dual") {
    emit("workspace-go", "files");
  }
  return fn();
}

/** Opens the quick Clock, Calendar & Timestamp menu anchored to `anchor`. */
export function showClockMenu(anchor, prefs) {
  const now = new Date();
  const m = dateMetrics(now);
  const fullReadable = `${new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now)} · ${new Intl.DateTimeFormat(undefined, { hour: prefs.is24h() ? "2-digit" : "numeric", minute: "2-digit", second: "2-digit", hour12: !prefs.is24h() }).format(now)}`;
  const canCreateHere = isFolderView(activePane()) && !inTrash();
  const items = [
    { header: `Week ${m.isoWeek} · Day ${m.dayOfYear}/${m.daysInYear} · Q${m.quarter} · ${m.utcOffset}` },
    {
      label: "Calendar, World Clocks & Timestamps…",
      icon: "🗓️",
      tip: "Open an interactive monthly calendar, live world clocks, and a Unix timestamp converter.",
      action: () => showCalendarDialog(new Date(), prefs),
    },
    { separator: true },
    { header: "Copy date or timestamp" },
    {
      label: `Copy local date (${m.localDate})`,
      icon: "📋",
      tip: "Copy today's YYYY-MM-DD date to the clipboard for naming folders, notes or backups.",
      action: () => copyTimestamp(m.localDate, "date"),
    },
    {
      label: `Copy filename timestamp (${m.fileStamp})`,
      icon: "📋",
      tip: "Copy a filename-safe YYYY-MM-DD_HH-MM-SS timestamp with no colons or spaces.",
      action: () => copyTimestamp(m.fileStamp, "filename timestamp"),
    },
    {
      label: `Copy ISO-8601 UTC (${m.isoUtc})`,
      icon: "🌐",
      tip: "Copy the current UTC timestamp in standard ISO-8601 format.",
      action: () => copyTimestamp(m.isoUtc, "ISO-8601 timestamp"),
    },
    {
      label: `Copy Unix epoch seconds (${m.unixSec})`,
      icon: "⏱️",
      tip: "Copy the current Unix epoch timestamp in seconds since 1970-01-01T00:00:00Z.",
      action: () => copyTimestamp(String(m.unixSec), "Unix timestamp"),
    },
    {
      label: "Copy readable date & time",
      icon: "🕒",
      tip: "Copy the full human-readable weekday, date and time to the clipboard.",
      action: () => copyTimestamp(fullReadable, "date & time"),
    },
    { separator: true },
    { header: "Create with today's date" },
    {
      label: `New dated folder (${m.localDate})`,
      icon: "📁",
      disabled: !canCreateHere,
      tip: "Create a new folder named with today's YYYY-MM-DD date in the current folder.",
      action: () => ensureInFilesThen(() => ops.newDatedFolder(m.localDate)),
    },
    {
      label: `New dated note (${m.localDate}.md)`,
      icon: "📝",
      disabled: !canCreateHere,
      tip: "Create a new Markdown note named with today's YYYY-MM-DD.md date in the current folder.",
      action: () => ensureInFilesThen(() => ops.newDatedNote(m.localDate)),
    },
    { separator: true },
    { header: "Clock display" },
    {
      label: "Use 24-hour time",
      checked: prefs.is24h(),
      action: () => prefs.set24h(!prefs.is24h()),
    },
    {
      label: "Show seconds",
      checked: prefs.showSeconds(),
      action: () => prefs.setShowSeconds(!prefs.showSeconds()),
    },
    {
      label: "Show UTC time in view bar",
      checked: prefs.showUtc(),
      action: () => prefs.setShowUtc(!prefs.showUtc()),
    },
    { separator: true },
    {
      label: "Open Interval Timer",
      icon: "⏲️",
      tip: "Open the Interval Timer tool for workouts, Pomodoro sessions, studying or reminders.",
      action: () => openPower("timer"),
    },
  ];
  const rect = anchor?.getBoundingClientRect?.();
  if (rect && rect.width > 0) showMenu(items, { anchor, label: "Clock and calendar actions" });
  else showMenu(items, { x: 240, y: 36, label: "Clock and calendar actions" });
}

/** Opens the interactive Monthly Calendar, World Clocks & Unix Timestamp Converter dialog. */
export function showCalendarDialog(initialDate = new Date(), prefs = null) {
  let viewYear = initialDate.getFullYear();
  let viewMonth = initialDate.getMonth();
  let selectedDate = new Date(initialDate.getFullYear(), initialDate.getMonth(), initialDate.getDate());
  const use24h = () => (prefs ? prefs.is24h() : false);

  const nowMetrics = dateMetrics(initialDate);
  const summaryBadges = h("div", { class: "cal-badges" },
    h("span", { class: "cal-badge" }, `📅 Week ${nowMetrics.isoWeek}`),
    h("span", { class: "cal-badge" }, `📆 Day ${nowMetrics.dayOfYear} of ${nowMetrics.daysInYear}`),
    h("span", { class: "cal-badge" }, `📊 Q${nowMetrics.quarter} ${initialDate.getFullYear()}`),
    h("span", { class: "cal-badge" }, `🌍 ${nowMetrics.timeZone} (${nowMetrics.utcOffset})`),
  );

  // --- Interactive Monthly Calendar ---
  const monthLabel = h("strong", { id: "cal-month-label", class: "cal-month-label", "aria-live": "polite" });
  const calGridBody = h("tbody", { id: "cal-grid-body" });
  const selectedInfo = h("span", { id: "cal-selected-info", class: "cal-selected-info" });
  const copySelectedBtn = h("button", {
    type: "button",
    class: "btn",
    id: "cal-copy-selected",
    title: "Copy the selected date in YYYY-MM-DD format",
    onclick: () => copyTimestamp(ops.localDateStamp(selectedDate), "date"),
  });
  const folderSelectedBtn = h("button", {
    type: "button",
    class: "btn",
    id: "cal-folder-selected",
    title: "Create a new folder named after the selected YYYY-MM-DD date in the current folder",
    onclick: async () => {
      const stamp = ops.localDateStamp(selectedDate);
      dlg.close(null);
      await ensureInFilesThen(() => ops.newDatedFolder(stamp));
    },
  });
  const noteSelectedBtn = h("button", {
    type: "button",
    class: "btn",
    id: "cal-note-selected",
    title: "Create a new Markdown note named after the selected YYYY-MM-DD date in the current folder",
    onclick: async () => {
      const stamp = ops.localDateStamp(selectedDate);
      dlg.close(null);
      await ensureInFilesThen(() => ops.newDatedNote(stamp));
    },
  });

  function renderCalendar() {
    const monthDate = new Date(viewYear, viewMonth, 1);
    monthLabel.textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(monthDate);
    const weeks = buildMonthGrid(viewYear, viewMonth, new Date());
    const selStr = ops.localDateStamp(selectedDate);
    clear(calGridBody);
    for (const wk of weeks) {
      const tr = h("tr", {}, h("td", { class: "cal-wk", title: `ISO Week ${wk.isoWeek}` }, `W${wk.isoWeek}`));
      for (const cell of wk.days) {
        const isSel = cell.localDate === selStr;
        const btn = h("button", {
          type: "button",
          class: `cal-day${cell.inMonth ? "" : " outside"}${cell.isToday ? " today" : ""}${isSel ? " selected" : ""}`,
          "aria-label": `${cell.localDate}${cell.isToday ? " (Today)" : ""}`,
          "aria-pressed": String(isSel),
          dataset: { date: cell.localDate },
          onclick: () => {
            selectedDate = cell.date;
            viewYear = cell.year;
            viewMonth = cell.month;
            renderCalendar();
          },
        }, String(cell.day));
        tr.append(h("td", {}, btn));
      }
      calGridBody.append(tr);
    }
    const selFull = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(selectedDate);
    const rel = relativeDayLabel(selectedDate, new Date());
    selectedInfo.textContent = `${selFull} · ${rel}`;
    copySelectedBtn.textContent = `📋 Copy ${selStr}`;
    folderSelectedBtn.textContent = `📁 New folder "${selStr}"`;
    noteSelectedBtn.textContent = `📝 New note "${selStr}.md"`;
  }

  const calSection = h("section", { class: "cal-section", "aria-label": "Monthly calendar" },
    h("div", { class: "cal-nav" },
      h("button", {
        type: "button",
        class: "btn",
        id: "cal-prev-month",
        title: "Previous month",
        "aria-label": "Previous month",
        onclick: () => {
          viewMonth--;
          if (viewMonth < 0) { viewMonth = 11; viewYear--; }
          renderCalendar();
        },
      }, "← Prev"),
      monthLabel,
      h("button", {
        type: "button",
        class: "btn",
        id: "cal-today-btn",
        title: "Jump back to today",
        onclick: () => {
          const t = new Date();
          viewYear = t.getFullYear();
          viewMonth = t.getMonth();
          selectedDate = new Date(t.getFullYear(), t.getMonth(), t.getDate());
          renderCalendar();
        },
      }, "Today"),
      h("button", {
        type: "button",
        class: "btn",
        id: "cal-next-month",
        title: "Next month",
        "aria-label": "Next month",
        onclick: () => {
          viewMonth++;
          if (viewMonth > 11) { viewMonth = 0; viewYear++; }
          renderCalendar();
        },
      }, "Next →"),
    ),
    h("table", { class: "cal-table", role: "grid", "aria-label": "Calendar days" },
      h("thead", {},
        h("tr", {},
          h("th", { scope: "col", class: "cal-wk-head", title: "ISO week number" }, "Wk"),
          ...["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => h("th", { scope: "col" }, d)),
        ),
      ),
      calGridBody,
    ),
    h("div", { class: "cal-selected-bar" },
      selectedInfo,
      h("div", { class: "cal-selected-actions" }, copySelectedBtn, folderSelectedBtn, noteSelectedBtn),
    ),
  );

  // --- Live World Clocks ---
  const worldGrid = h("div", { id: "cal-world-grid", class: "cal-world-grid" });
  function renderWorldClocks(now = new Date()) {
    clear(worldGrid);
    for (const z of WORLD_ZONES) {
      const f = formatWorldZone(z.zone, now, use24h());
      worldGrid.append(
        h("div", { class: "cal-world-card", dataset: { zone: z.id } },
          h("div", { class: "cal-world-city" }, `${z.icon} ${z.label}`),
          h("div", { class: "cal-world-time" }, f.time),
          h("div", { class: "cal-world-day" }, f.day),
        ),
      );
    }
  }

  const worldSection = h("section", { class: "cal-section", "aria-label": "World clocks" },
    h("h3", { class: "cal-subhead" }, "🌐 World Clocks"),
    worldGrid,
  );

  // --- Timestamp & Unix Epoch Converter ---
  const epochInput = h("input", {
    id: "cal-epoch-input",
    type: "text",
    class: "cal-epoch-input",
    value: String(nowMetrics.unixSec),
    placeholder: "Unix seconds, milliseconds, or YYYY-MM-DDTHH:MM:SS…",
    autocomplete: "off",
    spellcheck: "false",
    "data-own-enter": "true",
    "aria-label": "Unix timestamp or ISO date to convert",
  });
  const epochResult = h("div", { id: "cal-epoch-result", class: "cal-epoch-result" });

  function renderEpochConverter() {
    clear(epochResult);
    const parsed = parseFlexibleTimestamp(epochInput.value, new Date());
    if (!parsed.ok) {
      epochResult.append(h("p", { class: "cal-epoch-error", role: "alert" }, parsed.error));
      return;
    }
    const { date, kind, metrics } = parsed;
    const localFull = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: use24h() ? "2-digit" : "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: !use24h(),
    }).format(date);
    const rows = [
      ["Local date & time", `${localFull} (${kind})`, localFull],
      ["ISO-8601 (UTC)", metrics.isoUtc, metrics.isoUtc],
      ["Local date (YYYY-MM-DD)", metrics.localDate, metrics.localDate],
      ["Filename-safe stamp", metrics.fileStamp, metrics.fileStamp],
      ["Unix seconds", String(metrics.unixSec), String(metrics.unixSec)],
      ["Unix milliseconds", String(metrics.unixMs), String(metrics.unixMs)],
    ];
    for (const [label, display, copyVal] of rows) {
      epochResult.append(
        h("div", { class: "cal-epoch-row" },
          h("span", { class: "cal-epoch-k" }, label),
          h("code", { class: "cal-epoch-v" }, display),
          h("button", {
            type: "button",
            class: "btn cal-copy-mini",
            title: `Copy ${label}`,
            onclick: () => copyTimestamp(copyVal, label.toLowerCase()),
          }, "Copy"),
        ),
      );
    }
  }

  epochInput.addEventListener("input", renderEpochConverter);

  const epochSection = h("section", { class: "cal-section", "aria-label": "Timestamp and Unix epoch converter" },
    h("h3", { class: "cal-subhead" }, "⏱️ Timestamp & Unix Epoch Converter"),
    h("div", { class: "cal-epoch-bar" },
      epochInput,
      h("button", {
        type: "button",
        class: "btn",
        id: "cal-epoch-now",
        title: "Fill with the current Unix timestamp in seconds",
        onclick: () => {
          epochInput.value = String(Math.floor(Date.now() / 1000));
          renderEpochConverter();
        },
      }, "Now"),
    ),
    epochResult,
  );

  renderCalendar();
  renderWorldClocks(initialDate);
  renderEpochConverter();

  const body = h("div", { class: "cal-dialog" },
    summaryBadges,
    h("div", { class: "cal-columns" }, calSection, h("div", { class: "cal-side" }, worldSection, epochSection)),
  );

  const dlg = openDialog({
    title: "Calendar, World Clocks & Timestamps",
    wide: true,
    body,
    buttons: [{ label: "Done", primary: true, value: true }],
  });

  const liveTimer = setInterval(() => {
    if (!dlg.el.isConnected) {
      clearInterval(liveTimer);
      return;
    }
    renderWorldClocks(new Date());
  }, 1000);
  liveTimer?.unref?.();
  dlg.result.finally(() => clearInterval(liveTimer));

  return dlg;
}
