// Menus (right-click, the View menu) and toast messages.
import { h, $, announce } from "./dom.js";

let current = null;

export function closeMenu() {
  if (!current) return;
  const { el, opener, off } = current;
  current = null;
  off();
  el.remove();
  document.body?.classList.remove("menu-open");
  if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
}

/**
 * Shows a menu. `items`: { label, icon, shortcut, action, disabled, danger, checked, separator, header }.
 * Opens at a point ({ x, y }) or below an element ({ anchor }). Arrow keys move, Enter chooses, Escape closes.
 * @param {Array<any>} items
 * @param {{ x?: number, y?: number, anchor?: HTMLElement, label?: string }} where
 */
export function showMenu(items, { x = 0, y = 0, anchor, label = "Menu" } = {}) {
  closeMenu();
  const opener = document.activeElement;
  const rows = items.filter((i) => i && (i.separator || i.header || i.label));
  const buttons = [];
  const menu = h("div", { class: "menu", role: "menu", "aria-label": label },
    rows.map((item) => {
      if (item.separator) return h("div", { class: "menu-sep", role: "separator" });
      if (item.header) return h("div", { class: "menu-header", role: "presentation" }, item.header);
      const btn = h("button", {
        type: "button", role: item.checked !== undefined ? "menuitemcheckbox" : "menuitem", class: `menu-item${item.danger ? " danger" : ""}`,
        "aria-checked": item.checked === undefined ? null : String(!!item.checked), disabled: item.disabled, title: item.tip ?? null,
        onclick: () => { closeMenu(); item.action?.(); },
      },
        h("span", { class: "menu-icon", "aria-hidden": "true" }, item.checked ? "✓" : item.icon ?? ""),
        h("span", { class: "menu-label" }, item.label),
        item.shortcut ? h("span", { class: "menu-shortcut" }, item.shortcut) : null,
      );
      buttons.push(btn);
      return btn;
    }),
  );
  $("#overlay").append(menu);
  document.body?.classList.add("menu-open");

  const rect = anchor?.getBoundingClientRect();
  let left = rect ? rect.left : x;
  let top = rect ? rect.bottom + 2 : y;
  const { width, height } = menu.getBoundingClientRect();
  left = Math.max(4, Math.min(left, window.innerWidth - width - 4));
  top = Math.max(4, Math.min(top, window.innerHeight - Math.min(height, window.innerHeight - 8) - 4));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  if (window.innerHeight > 0) {
    menu.style.maxHeight = `${Math.max(160, window.innerHeight - top - 8)}px`;
  }

  for (const evt of ["mousedown", "mouseup", "pointerdown", "pointerup", "mousemove", "pointermove", "contextmenu"]) {
    menu.addEventListener(evt, (e) => e.stopPropagation());
  }

  const enabled = () => buttons.filter((b) => !b.disabled);
  const onKey = (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (/^Digit[1-8]$/.test(e.code ?? "") || /^[1-8]$/.test(e.key ?? ""))) {
      closeMenu();
      return;
    }
    const list = enabled();
    const i = list.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(); }
    else if (e.key === "Enter" && i >= 0) { e.preventDefault(); e.stopPropagation(); list[i].click(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); list.at(-1)?.focus(); }
    else if (e.key === "Tab") { e.preventDefault(); closeMenu(); }
  };
  const onOutside = (e) => { if (!menu.contains(e.target)) closeMenu(); };
  const onWheel = (e) => {
    if (!menu.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const dy = e.deltaY;
    const canDown = dy > 0 && menu.scrollTop + menu.clientHeight < menu.scrollHeight - 1;
    const canUp = dy < 0 && menu.scrollTop > 0;
    if (!canDown && !canUp) {
      e.preventDefault();
    }
    e.stopPropagation();
  };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("wheel", onWheel, { passive: false, capture: true });
  setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
  window.addEventListener("blur", closeMenu);
  const off = () => {
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("wheel", onWheel, { capture: true });
    document.removeEventListener("mousedown", onOutside, true);
    window.removeEventListener("blur", closeMenu);
  };
  current = { el: menu, opener, off };
  enabled()[0]?.focus();
  return menu;
}

export const menuIsOpen = () => current !== null;

// ---------------------------------------------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------------------------------------------

/**
 * A short message at the bottom. `action` adds a button (like Undo). Errors stay a little longer.
 * @param {string} message
 * @param {{ kind?: "info" | "success" | "error", action?: { label: string, run: () => void } | null, timeout?: number }} [options]
 */
export function toast(message, { kind = "info", action = null, timeout } = {}) {
  if (typeof document === "undefined") return; // a request that finished after the page was torn down
  const host = $("#toasts");
  while (host.children.length >= 3) host.firstElementChild?.remove();
  const el = h("div", { class: `toast ${kind}`, role: kind === "error" ? "alert" : "status" },
    h("span", { class: "toast-text" }, message),
    action ? h("button", { type: "button", class: "toast-action", onclick: () => { el.remove(); action.run(); } }, action.label) : null,
    h("button", { type: "button", class: "toast-close", "aria-label": "Dismiss", onclick: () => el.remove() }, "✕"),
  );
  host.append(el);
  announce(message);
  setTimeout(() => el.remove(), timeout ?? (kind === "error" ? 9000 : action ? 8000 : 4500));
  return el;
}
