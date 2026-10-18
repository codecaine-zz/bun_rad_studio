// The tab strip of open files (a dot marks unsaved changes; right-click for more), and the welcome screen shown
// when nothing is open.
import { h } from "./dom.js";
import { showMenu } from "./menus.js";
import { isDirty } from "./codeDocs.js";

/** Draws the tabs into `strip`. `on`: { activate(doc), close(doc), closeOthers(doc), closeAll(), copyPath(doc), reveal(doc) }. */
export function renderTabs(strip, docs, activeId, on) {
  strip.replaceChildren(...docs.map((d) => {
    const dirty = isDirty(d);
    const label = d.kind === "diff" ? `${d.name} (read only)` : d.name;
    return h("div", { class: `code-tab${d.id === activeId ? " active" : ""}`, role: "presentation" },
      h("button", {
        type: "button", role: "tab", class: "code-tab-main", "aria-selected": String(d.id === activeId), tabindex: d.id === activeId ? "0" : "-1", dataset: { id: String(d.id) },
        title: `${d.path || d.name}${dirty ? " — has unsaved changes" : ""}${d.external === "changed" ? " — changed on disk" : d.external === "deleted" ? " — deleted from disk" : ""}`,
        onclick: () => on.activate(d),
        onauxclick: (e) => { if (e.button === 1) on.close(d); },
        oncontextmenu: (e) => {
          e.preventDefault();
          showMenu([
            { label: "Close", action: () => on.close(d) }, { label: "Close the other tabs", action: () => on.closeOthers(d) }, { label: "Close all tabs", action: () => on.closeAll() },
            { separator: true }, { label: "Copy path", disabled: !d.path, action: () => on.copyPath(d) },
          ], { x: e.clientX, y: e.clientY, label: `Actions for ${d.name}` });
        },
      }, dirty ? h("span", { class: "code-dot", "aria-label": "unsaved changes", title: "Unsaved changes" }, "●") : null, d.external ? h("span", { class: "code-dot code-dot-warn", "aria-hidden": "true" }, "⚠") : null, h("span", { class: "code-tab-name" }, label)),
      h("button", { type: "button", class: "code-tab-close", "aria-label": `Close ${d.name}`, title: "Close this tab", tabindex: "-1", onclick: () => on.close(d) }, "✕"));
  }));
}

/** Arrow keys move between tabs. */
export function wireTabKeys(strip, activate) {
  strip.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const tabs = [...strip.querySelectorAll("[role=tab]")];
    const at = tabs.indexOf(document.activeElement);
    const next = tabs[(at + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    if (next) {
      e.preventDefault();
      activate(Number(next.dataset.id));
      strip.querySelector(`[data-id="${next.dataset.id}"]`)?.focus();
    }
  });
}

/** The screen with big buttons for when no file is open. */
export function renderWelcome(el, { recents, recentsEnabled = true, onNew, onQuickOpen, onOpen, onOpenByPath, onRemoveRecent, onClearRecents, onToggleRecents }) {
  const big = (label, tip, run) => h("button", { type: "button", class: "btn code-big", title: tip, onclick: run }, label);
  const recentHeader = h("div", { class: "code-recent-head" },
    h("h3", {}, "Recent files"),
    h("div", { class: "code-recent-actions" },
      onToggleRecents ? h("button", {
        type: "button",
        class: "btn small ghost",
        title: recentsEnabled ? "Stop remembering recently opened files in the Code editor" : "Resume remembering recently opened files in the Code editor",
        onclick: () => onToggleRecents(!recentsEnabled),
      }, recentsEnabled ? "Turn off" : "Turn on") : null,
      recents.length && onClearRecents ? h("button", {
        type: "button",
        class: "btn small ghost",
        title: "Clear all recent files from the Code editor",
        onclick: onClearRecents,
      }, "Clear") : null,
    ),
  );
  const recentItems = !recentsEnabled
    ? [h("p", { class: "code-hint" }, "Recent files are turned off.")]
    : recents.length
      ? recents.slice(0, 8).map((r) => h("div", { class: "code-recent-row" },
          h("button", {
            type: "button",
            class: "code-res-line",
            title: r.path,
            onclick: () => onOpen(r.path),
            oncontextmenu: (e) => {
              e.preventDefault();
              showMenu([
                { label: "Open", icon: "📄", action: () => onOpen(r.path) },
                ...(onRemoveRecent ? [{ label: "Remove from Recent", icon: "✕", action: () => onRemoveRecent(r.path) }] : []),
                ...(onClearRecents ? [{ separator: true }, { label: "Clear recent files", icon: "🧹", danger: true, action: onClearRecents }] : []),
                ...(onToggleRecents ? [{ label: "Stop remembering recent files", icon: "⏸", action: () => onToggleRecents(false) }] : []),
              ], { x: e.clientX, y: e.clientY, label: `Recent file ${r.path}` });
            },
          }, r.path),
          onRemoveRecent ? h("button", {
            type: "button",
            class: "btn small ghost code-recent-remove",
            title: `Remove ${r.path} from recent files`,
            "aria-label": `Remove ${r.path} from recent files`,
            onclick: (e) => { e.stopPropagation(); onRemoveRecent(r.path); },
          }, "✕") : null,
        ))
      : [h("p", { class: "code-hint" }, "No recent files yet.")];
  el.replaceChildren(
    h("h2", {}, "Code editor"),
    h("p", { class: "code-hint" }, "Open a file from the Explorer on the left, or start here:"),
    h("div", { class: "pw-row" }, big("New file", "Start an empty file", onNew), big("Go to file…", "Find a file by typing part of its name", onQuickOpen), big("Open by path…", "Type the full path of a file", onOpenByPath)),
    recentHeader,
    ...recentItems,
    h("p", { class: "code-hint" }, "Press F1 to see every keyboard shortcut."),
  );
}
