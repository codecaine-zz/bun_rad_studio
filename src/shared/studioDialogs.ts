// @ts-nocheck
/**
 * In-page dialogs for the SQLite, MySQL and PostgreSQL studios.
 *
 * Native prompt() / confirm() / alert() do nothing in the desktop webview windows and are unreliable inside the File
 * Manager's iframe, so every studio uses these instead. They return Promises:
 *
 *   await StudioDialogs.prompt({ title, message, value })   -> string | null (null = cancelled)
 *   await StudioDialogs.confirm({ title, message, danger }) -> boolean
 *   await StudioDialogs.alert({ title, message })           -> void
 *   StudioDialogs.open({ title, body, buttons, wide })      -> controller (used by the Create view dialog)
 *
 * and the shorthand globals studioPrompt(message, default), studioConfirm(message) and studioAlert(message).
 *
 * Keyboard: Tab stays inside the dialog, Enter submits (not inside a textarea), Esc closes only the dialog (nothing
 * else sees the key), focus returns to where it was. The browser full-screen API is never used.
 */

export const STUDIO_DIALOGS_STYLE = `
    /* ===== In-page dialogs ===== */
    .sd-overlay { position: fixed; inset: 0; z-index: 10300; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(2, 6, 14, 0.55); backdrop-filter: blur(4px); }
    .sd-dialog { width: min(480px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: var(--bg-surface); color: var(--text-main); border: 1px solid color-mix(in srgb, var(--text-main) 24%, transparent); border-radius: 12px; box-shadow: 0 24px 64px rgba(0,0,0,0.5); font-family: var(--font-sans); font-size: 13px; user-select: text; -webkit-user-select: text; }
    .sd-dialog.sd-wide { width: min(760px, 100%); }
    .sd-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 10px; }
    .sd-title { font-size: 15px; font-weight: 700; margin: 0; flex: 1; }
    .sd-x { border: 0; background: none; color: var(--text-muted); width: 28px; height: 28px; border-radius: 6px; cursor: pointer; font-size: 16px; line-height: 1; }
    .sd-x:hover { background: color-mix(in srgb, var(--text-main) 10%, transparent); color: var(--text-main); }
    .sd-body { padding: 0 16px 8px; overflow: auto; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
    .sd-msg { margin: 0; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .sd-input, .sd-textarea, .sd-select { width: 100%; padding: 7px 10px; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--text-main) 26%, transparent); background: color-mix(in srgb, var(--text-main) 6%, transparent); color: var(--text-main); font: inherit; outline: none; }
    .sd-textarea { font-family: var(--font-mono); font-size: 12px; min-height: 120px; resize: vertical; line-height: 1.5; }
    .sd-select { appearance: auto; }
    .sd-input:focus, .sd-textarea:focus, .sd-select:focus { border-color: var(--cyan); box-shadow: 0 0 0 3px var(--cyan-glow); }
    .sd-input[aria-invalid="true"] { border-color: var(--rose); }
    .sd-label { display: flex; flex-direction: column; gap: 4px; font-weight: 600; font-size: 12px; }
    .sd-label small { font-weight: 400; color: var(--text-muted); }
    .sd-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .sd-check { display: inline-flex; gap: 6px; align-items: center; font-weight: 500; cursor: pointer; }
    .sd-check input { accent-color: var(--cyan); }
    .sd-error { color: var(--rose); background: color-mix(in srgb, var(--rose) 11%, transparent); border: 1px solid color-mix(in srgb, var(--rose) 55%, transparent); border-radius: 6px; padding: 8px 10px; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
    .sd-ok { color: var(--emerald); background: color-mix(in srgb, var(--emerald) 10%, transparent); border: 1px solid color-mix(in srgb, var(--emerald) 50%, transparent); border-radius: 6px; padding: 8px 10px; font-size: 12px; word-break: break-word; }
    .sd-note { color: var(--text-muted); font-size: 11px; line-height: 1.45; }
    .sd-pre { margin: 0; padding: 8px 10px; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--text-main) 16%, transparent); background: color-mix(in srgb, var(--bg-base) 70%, var(--text-main) 3%); font-family: var(--font-mono); font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; max-height: 150px; overflow: auto; user-select: text; -webkit-user-select: text; }
    .sd-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px 14px; flex-wrap: wrap; }
    .sd-foot .sd-left { margin-right: auto; }
    .sd-btn { min-height: 30px; padding: 4px 14px; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--text-main) 28%, transparent); background: color-mix(in srgb, var(--text-main) 6%, transparent); color: var(--text-main); font: inherit; font-weight: 600; cursor: pointer; }
    .sd-btn:hover:not([disabled]) { background: color-mix(in srgb, var(--text-main) 12%, transparent); }
    .sd-btn.sd-primary { background: var(--cyan); border-color: var(--cyan); color: var(--bg-base); }
    .sd-btn.sd-danger { background: var(--rose); border-color: var(--rose); color: #fff; }
    .sd-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
    .sd-dialog :focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
    @media (prefers-reduced-motion: no-preference) { .sd-dialog { animation: sd-pop 0.12s ease-out; } @keyframes sd-pop { from { transform: translateY(6px) scale(0.98); opacity: 0; } to { transform: none; opacity: 1; } } }
`;

function studioDialogsClient() {
  if (window.StudioDialogs) return;
  const stack = [];
  let seq = 0;

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") n.className = v;
        else if (k === "html") n.innerHTML = v;
        else n.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const kid of kids) {
      if (kid === null || kid === undefined || kid === false) continue;
      n.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return n;
  }

  function focusables(root) {
    return Array.from(root.querySelectorAll("button, input, select, textarea, [tabindex='0']")).filter((n) => !n.disabled && !n.hidden && n.type !== "hidden" && n.offsetParent !== null);
  }

  // opts: { title, body: Node | string, buttons: [{ label, kind, id, onClick(ctl) }], wide, initialFocus: selector | Node }
  function open(opts) {
    opts = opts || {};
    const id = "sdDlg" + ++seq;
    const previous = document.activeElement;
    const overlay = el("div", { class: "sd-overlay", "data-sd": id });
    const dialog = el("div", { class: "sd-dialog" + (opts.wide ? " sd-wide" : ""), role: opts.role || "dialog", "aria-modal": "true", "aria-labelledby": id + "T" });
    const x = el("button", { type: "button", class: "sd-x", title: "Close (Esc)", "aria-label": "Close dialog" }, "\u2715");
    dialog.appendChild(el("div", { class: "sd-head" }, el("h2", { class: "sd-title", id: id + "T" }, opts.title || "Message"), x));
    const body = el("div", { class: "sd-body" });
    if (typeof opts.body === "string") body.appendChild(el("p", { class: "sd-msg" }, opts.body));
    else if (opts.body) body.appendChild(opts.body);
    dialog.appendChild(body);
    const error = el("div", { class: "sd-error", role: "alert", hidden: true });
    body.appendChild(error);
    const foot = el("div", { class: "sd-foot" });
    dialog.appendChild(foot);
    overlay.appendChild(dialog);

    let done = false;
    let resolveFn;
    const promise = new Promise((r) => { resolveFn = r; });
    const ctl = {
      node: dialog, body, foot, promise, buttons: {},
      setError(msg) { error.textContent = msg || ""; error.hidden = !msg; if (msg) { try { error.scrollIntoView({ block: "nearest" }); } catch (e) {} } },
      close(result) {
        if (done) return;
        done = true;
        const i = stack.indexOf(ctl);
        if (i >= 0) stack.splice(i, 1);
        overlay.remove();
        if (opts.onClose) opts.onClose(result);
        if (previous && previous.focus) try { previous.focus(); } catch (e) {}
        resolveFn(result);
      },
    };
    ctl.cancel = () => ctl.close(opts.cancelValue === undefined ? null : opts.cancelValue);
    x.addEventListener("click", () => ctl.cancel());
    (opts.buttons || []).forEach((b) => {
      const btn = el("button", { type: "button", class: "sd-btn" + (b.kind ? " sd-" + b.kind : ""), id: b.id || null, title: b.title || null }, b.label);
      if (b.side === "left") btn.classList.add("sd-left");
      btn.addEventListener("click", async () => {
        if (!b.onClick) return;
        btn.disabled = true;
        try { const r = await b.onClick(ctl); if (r === false) return; } finally { btn.disabled = false; }
      });
      ctl.buttons[b.id || b.label] = btn;
      if (b.kind === "primary" || b.kind === "danger") ctl.primary = btn;
      foot.appendChild(btn);
    });
    stack.push(ctl);
    document.body.appendChild(overlay);
    const target = typeof opts.initialFocus === "string" ? dialog.querySelector(opts.initialFocus) : opts.initialFocus;
    const first = target || dialog.querySelector("input:not([type=checkbox]):not([type=radio]), textarea, select") || ctl.primary || focusables(dialog)[0] || x;
    try { first.focus(); if (first.select && first.tagName === "INPUT") first.select(); } catch (e) {}
    return ctl;
  }

  function prompt(o) {
    o = o || {};
    const input = el("input", { type: "text", class: "sd-input", value: o.value === undefined || o.value === null ? "" : String(o.value), placeholder: o.placeholder || "", "aria-label": o.label || o.message || o.title || "Value", spellcheck: "false", autocomplete: "off" });
    const body = el("div", { class: "sd-body-inner", style: "display:flex;flex-direction:column;gap:10px" }, o.message ? el("p", { class: "sd-msg" }, o.message) : null, input);
    const ctl = open({
      title: o.title || "Enter a value",
      body,
      cancelValue: null,
      initialFocus: input,
      buttons: [
        { label: o.cancelLabel || "Cancel", id: "sdCancel", onClick: (c) => c.close(null) },
        { label: o.okLabel || "OK", kind: "primary", id: "sdOk", onClick: (c) => {
          const v = input.value;
          const err = o.validate ? o.validate(v) : "";
          if (err) { input.setAttribute("aria-invalid", "true"); c.setError(err); input.focus(); return false; }
          c.close(v);
        } },
      ],
    });
    input.addEventListener("input", () => { input.removeAttribute("aria-invalid"); ctl.setError(""); });
    return ctl.promise;
  }

  function confirm(o) {
    o = o || {};
    const ctl = open({
      title: o.title || "Please confirm",
      body: o.message || "",
      role: "alertdialog",
      cancelValue: false,
      buttons: [
        { label: o.cancelLabel || "Cancel", id: "sdCancel", onClick: (c) => c.close(false) },
        { label: o.okLabel || "OK", kind: o.danger ? "danger" : "primary", id: "sdOk", onClick: (c) => c.close(true) },
      ],
      initialFocus: o.danger ? "#sdCancel" : null,
    });
    return ctl.promise;
  }

  function alertDialog(o) {
    o = typeof o === "string" ? { message: o } : o || {};
    const ctl = open({ title: o.title || "Notice", body: o.message || "", role: "alertdialog", cancelValue: true, buttons: [{ label: o.okLabel || "OK", kind: "primary", id: "sdOk", onClick: (c) => c.close(true) }] });
    return ctl.promise;
  }

  // Esc / Tab / Enter belong to the top dialog; nothing else gets Esc while one is open.
  window.addEventListener("keydown", (e) => {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); top.cancel(); return; }
    if (e.key === "Tab") {
      const f = focusables(top.node);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (!top.node.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && top.primary && !top.primary.disabled) {
      const t = e.target;
      if (t && t.tagName === "INPUT" && t.type !== "checkbox" && t.type !== "radio" && top.node.contains(t)) { e.preventDefault(); e.stopPropagation(); top.primary.click(); }
    }
  }, true);

  window.StudioDialogs = { open, prompt, confirm, alert: alertDialog, el, isOpen: () => stack.length > 0 };
  window.studioPrompt = (message, value, o) => prompt(Object.assign({ message, value }, o || {}));
  window.studioConfirm = (message, o) => confirm(Object.assign({ message }, o || {}));
  window.studioAlert = (message, o) => alertDialog(Object.assign({ message }, o || {}));
}

export const STUDIO_DIALOGS_SCRIPT = `(${studioDialogsClient.toString()})();`;
