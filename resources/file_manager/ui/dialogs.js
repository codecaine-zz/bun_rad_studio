// Dialogs: a small modal system with a focus trap, Escape to cancel, and focus returned to where it was.
// Everything is built with h() (never HTML strings), so names from disk can't inject markup.
import { h, $, announce } from "./dom.js";
import { ApiError } from "./api.js";

let active = 0;

/**
 * Opens a modal dialog.
 * @param {{ title: string, body?: Node | Node[], buttons?: Array<{ label: string, value?: any, primary?: boolean, danger?: boolean, disabled?: boolean }>, wide?: boolean, initialFocus?: HTMLElement | null, describe?: string }} options
 * @returns {{ el: HTMLElement, result: Promise<any>, close: (value?: any) => void, setDisabled: (value: any, disabled: boolean) => void, setError: (message: string) => void }}
 */
export function openDialog({ title, body, buttons = [{ label: "OK", primary: true, value: true }], wide = false, initialFocus = null, describe = "" }) {
  const opener = document.activeElement;
  const titleId = `dlg-title-${++active}`;
  const errorBox = h("p", { class: "dialog-error", role: "alert", hidden: true });
  const buttonEls = buttons.map((b) =>
    h("button", { type: "button", class: `btn${b.primary ? " primary" : ""}${b.danger ? " danger" : ""}`, disabled: b.disabled, onclick: () => close(b.value ?? null) }, b.label),
  );
  const dialog = h("div", { class: `dialog${wide ? " wide" : ""}`, role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, "aria-describedby": describe ? `${titleId}-d` : null },
    h("h2", { id: titleId, class: "dialog-title" }, title),
    describe ? h("p", { id: `${titleId}-d`, class: "sr-only" }, describe) : null,
    h("div", { class: "dialog-body" }, body ?? null),
    errorBox,
    h("div", { class: "dialog-buttons" }, buttonEls),
  );
  const backdrop = h("div", { class: "modal-backdrop" }, dialog);
  $("#overlay").append(backdrop);
  document.body.classList.add("modal-open");

  let resolve;
  const result = new Promise((r) => (resolve = r));
  let closed = false;

  function close(value = null) {
    if (closed) return;
    closed = true;
    backdrop.remove();
    if (!document.querySelector(".modal-backdrop")) document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onKey, true);
    if (opener && opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    resolve(value);
  }

  function focusables() {
    return [...dialog.querySelectorAll("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
  }

  function onKey(e) {
    if (!dialog.isConnected || backdrop !== [...document.querySelectorAll(".modal-backdrop")].at(-1)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(null);
    } else if (e.key === "Tab") {
      const items = focusables();
      if (!items.length) return e.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.type !== "checkbox" && !e.target.hasAttribute("data-own-enter")) {
      const primary = buttonEls[buttons.findIndex((b) => b.primary)];
      if (primary && !primary.disabled) {
        e.preventDefault();
        primary.click();
      }
    }
  }
  document.addEventListener("keydown", onKey, true);
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close(null);
  });
  backdrop.addEventListener("wheel", (e) => {
    const dy = e.deltaY;
    const dx = e.deltaX;
    let el = e.target instanceof HTMLElement ? e.target : null;
    while (el && el !== backdrop) {
      const style = window.getComputedStyle?.(el);
      const oy = style?.overflowY;
      const ox = style?.overflowX;
      const scrollableY = (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1;
      const scrollableX = (ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1;
      if (scrollableY && Math.abs(dy) >= Math.abs(dx)) {
        const canDown = dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1;
        const canUp = dy < 0 && el.scrollTop > 0;
        if (canDown || canUp) {
          e.stopPropagation();
          return;
        }
        break;
      }
      if (scrollableX && Math.abs(dx) > Math.abs(dy)) {
        const canRight = dx > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
        const canLeft = dx < 0 && el.scrollLeft > 0;
        if (canRight || canLeft) {
          e.stopPropagation();
          return;
        }
        break;
      }
      el = el.parentElement;
    }
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });

  queueMicrotask(() => {
    const target = initialFocus ?? dialog.querySelector("[autofocus]") ?? buttonEls[buttons.findIndex((b) => b.primary)] ?? focusables()[0];
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  });
  announce(title);

  return {
    el: dialog,
    result,
    close,
    setDisabled(value, disabled) {
      buttons.forEach((b, i) => {
        if ((b.value ?? null) === value) buttonEls[i].disabled = disabled;
      });
    },
    setError(message) {
      errorBox.textContent = message;
      errorBox.hidden = !message;
    },
  };
}

/** A message with one OK button. */
export function messageBox(title, message, details = []) {
  return openDialog({
    title,
    body: [h("p", {}, message), details.length ? h("ul", { class: "detail-list" }, details.map((d) => h("li", {}, d))) : null],
    buttons: [{ label: "OK", primary: true, value: true }],
  }).result;
}

/** A yes/no question. Resolves true when the person confirms. */
export async function confirmBox({ title, message, confirmLabel = "OK", cancelLabel = "Cancel", danger = false, details = [] }) {
  const d = openDialog({
    title,
    body: [h("p", {}, message), details.length ? h("ul", { class: "detail-list" }, details.map((x) => h("li", {}, x))) : null],
    buttons: [
      { label: cancelLabel, value: false },
      { label: confirmLabel, value: true, primary: true, danger },
    ],
    initialFocus: danger ? undefined : null,
  });
  // For dangerous actions the safe button starts focused, so a stray Enter doesn't destroy anything.
  if (danger) queueMicrotask(() => d.el.querySelector(".btn:not(.danger)")?.focus());
  return (await d.result) === true;
}

/**
 * Asks for a name. `submit(name)` does the work (and may throw an ApiError, which is shown in the dialog so the
 * person can fix the name without starting over). Resolves with what `submit` returned, or null when cancelled.
 */
export async function promptBox({ title, label, value = "", confirmLabel = "OK", submit, selectBase = false, hint = "" }) {
  const input = h("input", { type: "text", class: "text-input", value, spellcheck: "false", autocomplete: "off", "aria-label": label });
  const dlg = openDialog({
    title,
    body: [h("label", { class: "field" }, h("span", { class: "field-label" }, label), input), hint ? h("p", { class: "hint" }, hint) : null],
    buttons: [
      { label: "Cancel", value: null },
      { label: confirmLabel, value: "ok", primary: true },
    ],
    initialFocus: input,
  });
  if (selectBase) {
    queueMicrotask(() => {
      const dot = value.lastIndexOf(".");
      input.setSelectionRange(0, dot > 0 ? dot : value.length);
    });
  }
  return await new Promise((resolve) => {
    const okButton = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
    okButton.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      okButton.disabled = true;
      try {
        const out = await submit(input.value);
        dlg.close(out ?? true);
      } catch (err) {
        dlg.setError(err instanceof ApiError ? err.message : "That didn't work. Try a different name.");
        okButton.disabled = false;
        input.focus();
      }
    }, true);
    dlg.result.then((v) => resolve(v === "ok" ? null : v));
  });
}

/** When pasting would replace something: Replace, Keep both, Skip, or Cancel. Resolves "replace" | "rename" | "skip" | null. */
export async function chooseConflict({ conflicts, verb }) {
  const names = conflicts.slice(0, 6).map((c) => c.name);
  const more = conflicts.length - names.length;
  const body = [
    h("p", {}, conflicts.length === 1 ? `An item named "${names[0]}" already exists here.` : `${conflicts.length} items with the same names already exist here:`),
    conflicts.length > 1 ? h("ul", { class: "detail-list" }, [...names.map((n) => h("li", {}, n)), more > 0 ? h("li", {}, `…and ${more} more`) : null]) : null,
    h("p", { class: "hint" }, `"Replace" puts the old item in the Recycle Bin first, so you can get it back with Undo.`),
  ];
  const d = openDialog({
    title: `${verb} — name already in use`,
    body,
    buttons: [
      { label: "Cancel", value: null },
      { label: "Skip", value: "skip" },
      { label: "Replace", value: "replace" },
      { label: "Keep both", value: "rename", primary: true },
    ],
  });
  return await d.result;
}

/** A list of things that went wrong, after a batch. */
export function problemsBox(title, intro, problems) {
  return messageBox(title, intro, problems);
}
