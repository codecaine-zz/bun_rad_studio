/**
 * SimpleGUI Dialogs — a SweetAlert2-style, theme-aware dialog / toast / file-picker engine.
 *
 * Two halves live in this file:
 *   1. DIALOG_CLIENT_HTML : CSS + JS injected into every SimpleGUI webview page (`window.SimpleDialogClient`).
 *   2. SimpleDialogs      : the TypeScript API (`win.dialogs`, `win.fire(...)`, ...) that drives the client over the webview bridge.
 *
 * IMPORTANT DESIGN NOTE — callbacks first, promises second:
 * `webview.run()` blocks the Bun thread, so `await` continuations are not guaranteed to resume while a window is open.
 * Every API therefore accepts an optional trailing callback that is invoked synchronously from the IPC handler, and
 * also returns a Promise for contexts where promises do work.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ---------------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------------

export type DialogIcon = "success" | "error" | "warning" | "info" | "question";

export type DialogInputType =
    | "text" | "email" | "password" | "number" | "tel" | "url" | "search"
    | "date" | "time" | "datetime-local" | "month" | "week" | "color"
    | "range" | "textarea" | "select" | "radio" | "checkbox" | "file";

export type DialogPosition =
    | "top" | "top-start" | "top-end"
    | "center" | "center-start" | "center-end"
    | "bottom" | "bottom-start" | "bottom-end";

export type DialogValidationPreset = "required" | "email" | "url" | "number" | "integer";

export interface DialogValidationRules {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    integer?: boolean;
    pattern?: string;
    flags?: string;
    message?: string;
}

/** Map `{ value: "Label" }`, nested map for option groups, or array of strings / `[value,label]` / `{value,label}`. */
export type DialogInputOptions =
    | Record<string, any>
    | Array<string | [string, string] | { value: string; label: string }>;

export interface DialogOptions {
    // content
    title?: string;
    /** Plain text (HTML-escaped, newlines preserved). */
    text?: string;
    /** Raw HTML string (developer-trusted). */
    html?: string;
    icon?: DialogIcon;
    /** Custom icon markup. */
    iconHtml?: string;
    imageUrl?: string;
    imageAlt?: string;
    imageWidth?: number | string;
    imageHeight?: number | string;
    footer?: string;

    // behavior
    /** Render as a small non-blocking toast. */
    toast?: boolean;
    /** `false` = non-modal: no backdrop, page stays interactive. */
    modal?: boolean;
    position?: DialogPosition;
    /** Auto-close after N ms. */
    timer?: number;
    timerProgressBar?: boolean;
    timerPauseOnHover?: boolean;
    allowOutsideClick?: boolean;
    allowEscapeKey?: boolean;
    allowEnterKey?: boolean;
    /** Clicking a toast dismisses it (default true). */
    dismissOnClick?: boolean;
    /** Show a spinner instead of an icon. */
    loading?: boolean;

    // buttons
    showConfirmButton?: boolean;
    showCancelButton?: boolean;
    showDenyButton?: boolean;
    showCloseButton?: boolean;
    confirmButtonText?: string;
    cancelButtonText?: string;
    denyButtonText?: string;
    confirmButtonColor?: string;
    cancelButtonColor?: string;
    denyButtonColor?: string;
    reverseButtons?: boolean;
    focusConfirm?: boolean;
    focusCancel?: boolean;
    focusDeny?: boolean;
    showLoaderOnConfirm?: boolean;

    // input
    input?: DialogInputType;
    inputValue?: any;
    inputPlaceholder?: string;
    inputLabel?: string;
    inputOptions?: DialogInputOptions | (() => DialogInputOptions | Promise<DialogInputOptions>);
    inputAttributes?: Record<string, string>;
    inputAutoFocus?: boolean;
    inputAutoTrim?: boolean;
    /** Declarative validation: a preset name or a rules object. Runs in the webview (instant feedback). */
    validate?: DialogValidationPreset | DialogValidationRules;
    /** TypeScript validator. Return an error string (or `false`) to block confirm, nothing/`null` to accept. */
    inputValidator?: (value: any) => string | false | null | undefined | void | Promise<string | false | null | undefined | void>;
    /** TypeScript hook run on confirm (spinner shown). Return `false` to keep open; any other value becomes `result.value`. Throw to show an error. */
    preConfirm?: (value: any) => any | Promise<any>;
    /** Return the input value (instead of `false`) when the deny button is pressed. */
    returnInputValueOnDeny?: boolean;

    // look & feel
    width?: number | string;
    padding?: number | string;
    background?: string;
    color?: string;
    accent?: string;
    /** `false` = no backdrop, or any CSS color. */
    backdrop?: boolean | string;
    align?: "left" | "center";
    customClass?: string | Partial<Record<"popup" | "title" | "confirmButton" | "cancelButton" | "denyButton", string>>;

    // progress steps
    progressSteps?: string[];
    currentProgressStep?: number;
}

export interface DialogResult<T = any> {
    isConfirmed: boolean;
    isDenied: boolean;
    isDismissed: boolean;
    value?: T;
    /** "cancel" | "backdrop" | "close" | "esc" | "timer" | "click" | "replaced" | "unavailable" */
    dismiss?: string;
}

export type DialogCallback<T = DialogResult> = (result: T) => void;

export interface FileDialogOptions {
    title?: string;
    /** Extensions, e.g. `"png,jpg"`, `"*.png;*.jpg"` or `["png","jpg"]`. */
    filter?: string | string[];
    defaultName?: string;
    initialDir?: string;
    multiple?: boolean;
    showHidden?: boolean;
    /**
     * `"auto"` (default): use the native OS dialog; fall back to the in-webview picker ONLY when the native dialog is
     * unavailable (never when the user simply cancels). `"never"`: always use the in-webview picker.
     * `"always"`: native only (resolves `null` if unavailable).
     */
    native?: "auto" | "always" | "never";
}

export type FileDialogMode = "open" | "save" | "folder";

export interface DialogHost {
    isRunning(): boolean;
    eval(code: string): void;
    resolvers: Map<string, (val: any) => void>;
}

// ---------------------------------------------------------------------------------------------------------------------
// Client-side engine (CSS + JS injected into the webview page)
//   NOTE: String.raw is used so backslashes survive. Do not use backticks or ${ } inside the client code.
// ---------------------------------------------------------------------------------------------------------------------

const DIALOG_CLIENT_CSS = String.raw`
.sgd-container,.sgd-container *,.sgd-toasts,.sgd-toasts *{box-sizing:border-box}
.sgd-container{position:fixed;inset:0;z-index:2147483000;display:flex;padding:16px;overflow:auto;background:var(--sgd-backdrop,rgba(2,6,23,.62));backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:sgdFade .18s ease both}
.sgd-container.sgd-nobackdrop{background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;pointer-events:none}
.sgd-container.sgd-nobackdrop .sgd-popup{pointer-events:auto}
.sgd-container.sgd-v-top{align-items:flex-start}.sgd-container.sgd-v-center{align-items:center}.sgd-container.sgd-v-bottom{align-items:flex-end}
.sgd-container.sgd-h-start{justify-content:flex-start}.sgd-container.sgd-h-center{justify-content:center}.sgd-container.sgd-h-end{justify-content:flex-end}
.sgd-container.sgd-hiding{animation:sgdFadeOut .16s ease both;pointer-events:none}
.sgd-popup{position:relative;width:var(--sgd-width,420px);max-width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:var(--sgd-padding,26px);border-radius:16px;background:var(--sgd-bg);color:var(--sgd-fg);border:1px solid var(--sgd-border);box-shadow:0 28px 70px rgba(0,0,0,.5);display:flex;flex-direction:column;align-items:center;text-align:center;font-size:14px;line-height:1.5;outline:none;margin:auto;animation:sgdPop .24s cubic-bezier(.16,1,.3,1) both}
.sgd-container.sgd-v-top .sgd-popup,.sgd-container.sgd-v-bottom .sgd-popup,.sgd-container.sgd-h-start .sgd-popup,.sgd-container.sgd-h-end .sgd-popup{margin:0}
.sgd-popup.sgd-left{align-items:stretch;text-align:left}
.sgd-popup.sgd-shake{animation:sgdShake .4s ease}
.sgd-close{position:absolute;top:8px;right:10px;width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--sgd-fg);opacity:.5;font-size:24px;line-height:1;cursor:pointer;transition:opacity .15s,background .15s}
.sgd-close:hover{opacity:1;background:var(--sgd-input)}
.sgd-icon{display:flex;align-items:center;justify-content:center;flex:none;width:78px;height:78px;margin:4px auto 16px;border:4px solid currentColor;border-radius:50%;font-size:44px;font-weight:700;line-height:1;user-select:none;animation:sgdIcon .5s cubic-bezier(.34,1.56,.64,1) both}
.sgd-icon svg{width:60%;height:60%;fill:none;stroke:currentColor;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.sgd-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:sgdDraw .45s .18s ease forwards}.sgd-d2{animation-delay:.34s}
.sgd-icon-custom{border:0;font-size:56px}
.sgd-loader{width:54px;height:54px;margin:8px auto 14px;border-radius:50%;border:5px solid var(--sgd-border);border-top-color:var(--sgd-accent);animation:sgdSpin .8s linear infinite}
.sgd-image{max-width:100%;margin:6px auto 14px;border-radius:10px}
.sgd-title{max-width:100%;margin:0 0 6px;padding:0;font-size:22px;font-weight:700;line-height:1.3;word-break:break-word}
.sgd-left .sgd-title{font-size:18px}
.sgd-content{max-width:100%;margin:2px 0 0;font-size:15px;word-break:break-word}
.sgd-text{white-space:pre-wrap}
.sgd-inputwrap{width:100%;margin-top:16px;text-align:left}
.sgd-label{display:block;margin:0 0 6px;font-size:13px;font-weight:600;opacity:.85}
.sgd-input{display:block;width:100%;margin:0;padding:10px 12px;font:inherit;color:var(--sgd-fg);background:var(--sgd-input);border:1px solid var(--sgd-border);border-radius:10px;outline:none;transition:border-color .15s,box-shadow .15s}
.sgd-input:focus{border-color:var(--sgd-accent);box-shadow:0 0 0 3px var(--sgd-focus)}
.sgd-input.sgd-invalid{border-color:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.25);animation:sgdShake .35s ease}
textarea.sgd-input{min-height:96px;resize:vertical}
input[type=color].sgd-input{height:46px;padding:4px;cursor:pointer}
input[type=file].sgd-input{padding:8px}
select.sgd-input option,select.sgd-input optgroup{color:#111827;background:#fff}
.sgd-pw{position:relative}.sgd-pw .sgd-input{padding-right:42px}
.sgd-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--sgd-fg);opacity:.6;cursor:pointer;font-size:15px}
.sgd-eye:hover{opacity:1;background:var(--sgd-input)}
.sgd-choices{display:flex;flex-wrap:wrap;gap:10px 18px;justify-content:center;padding:4px 0}
.sgd-choice{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;color:var(--sgd-fg)!important}
.sgd-choice input{width:17px;height:17px;margin:0;accent-color:var(--sgd-accent);cursor:pointer}
.sgd-range{display:flex;align-items:center;gap:12px}.sgd-range input{flex:1;accent-color:var(--sgd-accent)}.sgd-range output{min-width:36px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.sgd-validation{display:none;align-items:center;gap:8px;width:100%;margin:12px 0 0;padding:9px 12px;border-radius:10px;background:rgba(239,68,68,.12);color:#ef4444;font-size:13px;font-weight:600;text-align:left}
.sgd-validation::before{content:"!";display:inline-flex;flex:none;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;font-size:12px;font-weight:800}
.sgd-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;width:100%;margin-top:22px}
.sgd-left .sgd-actions{justify-content:flex-end}
.sgd-btn{position:relative;min-width:84px;padding:10px 20px;border:0;border-radius:10px;background:var(--c,#0284c7);color:#fff;font:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:transform .08s,filter .15s,box-shadow .15s}
.sgd-btn:hover{filter:brightness(1.1)}.sgd-btn:active{transform:translateY(1px)}
.sgd-btn:focus-visible{outline:2px solid var(--sgd-accent);outline-offset:2px}
.sgd-btn[disabled]{opacity:.6;cursor:default}
.sgd-btn.sgd-loading{color:transparent!important;pointer-events:none}
.sgd-btn.sgd-loading::after{content:"";position:absolute;inset:0;margin:auto;width:18px;height:18px;border-radius:50%;border:3px solid rgba(255,255,255,.4);border-top-color:#fff;animation:sgdSpin .7s linear infinite}
.sgd-footer{width:100%;margin-top:18px;padding-top:12px;border-top:1px solid var(--sgd-border);font-size:13px;opacity:.8}
.sgd-timer{position:absolute;left:0;right:0;bottom:0;height:4px;background:var(--sgd-accent);opacity:.65;transform-origin:left;border-radius:0 0 16px 16px}
.sgd-steps{display:flex;align-items:center;justify-content:center;margin:0 0 18px}
.sgd-step{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:var(--sgd-input);border:1px solid var(--sgd-border);font-size:12px;font-weight:700}
.sgd-step.active{background:var(--sgd-accent);border-color:var(--sgd-accent);color:#fff}.sgd-step.done{background:var(--sgd-accent);border-color:var(--sgd-accent);color:#fff;opacity:.55}
.sgd-step-line{width:34px;height:2px;background:var(--sgd-border)}
.sgd-toasts{position:fixed;z-index:2147483100;display:flex;flex-direction:column;gap:10px;max-width:100vw;padding:14px;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.sgd-toasts.sgd-v-top{top:46px}.sgd-toasts.sgd-v-bottom{bottom:0}.sgd-toasts.sgd-v-center{top:50%}
.sgd-toasts.sgd-h-start{left:0;align-items:flex-start}.sgd-toasts.sgd-h-end{right:0;align-items:flex-end}.sgd-toasts.sgd-h-center{left:50%;align-items:center}
.sgd-toasts.sgd-v-center.sgd-h-center{transform:translate(-50%,-50%)}.sgd-toasts.sgd-v-center:not(.sgd-h-center){transform:translateY(-50%)}.sgd-toasts.sgd-h-center:not(.sgd-v-center){transform:translateX(-50%)}
.sgd-toast{position:relative;display:flex;align-items:center;gap:12px;min-width:250px;max-width:440px;padding:12px 16px 12px 14px;overflow:hidden;border-radius:12px;border:1px solid var(--sgd-border);border-left:4px solid var(--sgd-stripe,var(--sgd-accent));background:var(--sgd-bg);color:var(--sgd-fg);box-shadow:0 14px 36px rgba(0,0,0,.4);font-size:14px;line-height:1.4;pointer-events:auto;cursor:pointer;animation:sgdToastIn .3s cubic-bezier(.16,1,.3,1) both}
.sgd-toast.sgd-hiding{animation:sgdToastOut .18s ease both;pointer-events:none}
.sgd-toast .sgd-icon{width:28px;height:28px;margin:0;border-width:2px;font-size:16px;animation:none}
.sgd-toast .sgd-loader{width:24px;height:24px;margin:0;border-width:3px}
.sgd-toast-body{flex:1;min-width:0;text-align:left}
.sgd-toast .sgd-title{margin:0;font-size:14px;font-weight:700}
.sgd-toast .sgd-content{margin:0;font-size:13px;opacity:.9}
.sgd-toast .sgd-close{position:static;flex:none;width:26px;height:26px;font-size:20px}
.sgd-toast .sgd-actions{width:auto;margin:0;gap:6px}.sgd-toast .sgd-btn{min-width:0;padding:6px 12px;font-size:12px}
.sgd-toast .sgd-timer{height:3px;border-radius:0}
.sgd-fp-popup{--sgd-width:740px}
.sgd-fp{display:flex;gap:12px;width:100%;height:380px;color:var(--sgd-fg);text-align:left}
.sgd-fp-side{display:flex;flex:none;flex-direction:column;gap:2px;width:150px;padding-right:10px;overflow:auto;border-right:1px solid var(--sgd-border)}
.sgd-fp-place{display:flex;align-items:center;gap:8px;padding:7px 9px;border:0;border-radius:8px;background:transparent;color:var(--sgd-fg);font:inherit;font-size:13px;text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sgd-fp-place:hover{background:var(--sgd-input)}.sgd-fp-place.active{background:var(--sgd-focus);font-weight:700}
.sgd-fp-main{display:flex;flex:1;flex-direction:column;gap:8px;min-width:0}
.sgd-fp-bar{display:flex;align-items:center;gap:6px}
.sgd-fp-ibtn{flex:none;width:34px;height:34px;border:1px solid var(--sgd-border);border-radius:8px;background:var(--sgd-input);color:var(--sgd-fg);font-size:15px;cursor:pointer}
.sgd-fp-ibtn:hover:not([disabled]){border-color:var(--sgd-accent)}.sgd-fp-ibtn[disabled]{opacity:.35;cursor:default}
.sgd-fp-path,.sgd-fp-search,.sgd-fp-name{flex:1;min-width:0;padding:7px 10px;border:1px solid var(--sgd-border);border-radius:8px;background:var(--sgd-input);color:var(--sgd-fg);font:inherit;font-size:12.5px;outline:none}
.sgd-fp-path{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.sgd-fp-path:focus,.sgd-fp-search:focus,.sgd-fp-name:focus{border-color:var(--sgd-accent);box-shadow:0 0 0 3px var(--sgd-focus)}
.sgd-fp-hidden{display:inline-flex;align-items:center;gap:5px;flex:none;font-size:12px;cursor:pointer;color:var(--sgd-fg)!important}
.sgd-fp-hidden input{margin:0;accent-color:var(--sgd-accent)}
.sgd-fp-mk{display:none;align-items:center;gap:6px}.sgd-fp-mk.on{display:flex}
.sgd-fp-mk .sgd-btn{min-width:0;padding:6px 12px;font-size:12px}
.sgd-fp-list{flex:1;min-height:0;overflow:auto;border:1px solid var(--sgd-border);border-radius:10px;background:var(--sgd-input);padding:4px;outline:none}
.sgd-fp-row{display:flex;align-items:center;gap:9px;padding:6px 9px;border-radius:7px;font-size:13px;cursor:pointer;user-select:none}
.sgd-fp-row:hover{background:var(--sgd-input)}.sgd-fp-row.sel{background:var(--sgd-focus)}
.sgd-fp-ico{flex:none;width:20px;text-align:center}
.sgd-fp-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sgd-fp-sz{flex:none;font-size:11.5px;opacity:.6;font-variant-numeric:tabular-nums}
.sgd-fp-empty{padding:34px 10px;text-align:center;font-size:13px;opacity:.6}
.sgd-fp-foot{display:flex;align-items:center;gap:8px}
.sgd-fp-lbl{flex:none;font-size:12px;opacity:.7}
.sgd-fp-msg{min-height:18px;font-size:12px;font-weight:600;color:#ef4444}.sgd-fp-msg.warn{color:#f59e0b}
@keyframes sgdFade{from{opacity:0}to{opacity:1}}@keyframes sgdFadeOut{from{opacity:1}to{opacity:0}}
@keyframes sgdPop{from{opacity:0;transform:scale(.9) translateY(8px)}to{opacity:1;transform:none}}
@keyframes sgdIcon{from{opacity:0;transform:scale(.4) rotate(-20deg)}to{opacity:1;transform:none}}
@keyframes sgdDraw{to{stroke-dashoffset:0}}
@keyframes sgdSpin{to{transform:rotate(360deg)}}
@keyframes sgdShake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}
@keyframes sgdToastIn{from{opacity:0;transform:translateX(24px) scale(.96)}to{opacity:1;transform:none}}
@keyframes sgdToastOut{from{opacity:1}to{opacity:0;transform:translateX(24px) scale(.96)}}
@media (prefers-reduced-motion:reduce){.sgd-popup,.sgd-toast,.sgd-icon,.sgd-container{animation-duration:.01s!important}}
`;

const DIALOG_CLIENT_JS = String.raw`
(function () {
  if (window.SimpleDialogClient) return;
  var COLORS = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#38bdf8', question: '#a78bfa' };
  var stack = [];       // open dialogs (modal + non-modal)
  var toasts = [];      // open toasts
  var current = null;   // most recent dialog
  var uid = 0;
  var keysInstalled = false;

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function px(v) { return typeof v === 'number' ? v + 'px' : v; }
  function dismissed(why) { return { isConfirmed: false, isDenied: false, isDismissed: true, dismiss: why }; }

  // ---------- colors / theme ----------
  function parseColor(c) {
    if (!c) return null; c = String(c).trim(); var m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(c))) { var h = m[1]; return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]; }
    if ((m = /^#([0-9a-f]{6})/i.exec(c))) { return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)]; }
    if ((m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c))) { return [+m[1], +m[2], +m[3]]; }
    return null;
  }
  function lum(rgb) { return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255; }
  function textOn(c) { var p = parseColor(c); return (p && lum(p) > 0.62) ? '#111827' : '#ffffff'; }

  function applyTheme(node, o) {
    var cs = getComputedStyle(document.documentElement);
    var card = (cs.getPropertyValue('--card-bg') || '').trim();
    var fg = (cs.getPropertyValue('--theme-fg') || '').trim();
    var accent = o.accent || (cs.getPropertyValue('--accent') || '').trim() || '#38bdf8';
    var bg = o.background || card || getComputedStyle(document.body).backgroundColor || '#1e293b';
    var bgRgb = parseColor(bg);
    if (!bgRgb || /rgba\(.*,\s*0\)\s*$/.test(bg)) { bg = '#1e293b'; bgRgb = parseColor(bg); }
    var light = lum(bgRgb) > 0.55;
    var fgc = o.color || fg || (light ? '#1f2937' : '#e2e8f0');
    var fgRgb = parseColor(fgc);
    if (!o.color && (!fgRgb || Math.abs(lum(fgRgb) - lum(bgRgb)) < 0.35)) { fgc = light ? '#1f2937' : '#e2e8f0'; }
    var a = parseColor(accent) || [56, 189, 248];
    node.style.setProperty('--sgd-bg', bg);
    node.style.setProperty('--sgd-fg', fgc);
    node.style.setProperty('--sgd-accent', accent);
    node.style.setProperty('--sgd-border', light ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.16)');
    node.style.setProperty('--sgd-input', light ? 'rgba(0,0,0,.045)' : 'rgba(255,255,255,.06)');
    node.style.setProperty('--sgd-focus', 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',.32)');
    return { accent: accent, light: light };
  }

  // ---------- option normalization ----------
  function normalize(raw) {
    raw = raw || {};
    var d = {
      title: '', text: '', html: null, icon: null, iconHtml: null, imageUrl: null, footer: null,
      toast: false, modal: true, position: 'center', loading: false,
      input: null, inputValue: '', inputPlaceholder: '', inputLabel: '', inputOptions: null, inputAttributes: null,
      inputAutoFocus: true, inputAutoTrim: true, validate: null,
      showConfirmButton: true, showCancelButton: false, showDenyButton: false, showCloseButton: false,
      confirmButtonText: 'OK', cancelButtonText: 'Cancel', denyButtonText: 'No',
      confirmButtonColor: null, cancelButtonColor: null, denyButtonColor: null,
      reverseButtons: false, focusConfirm: true, focusCancel: false, focusDeny: false, showLoaderOnConfirm: false,
      allowOutsideClick: true, allowEscapeKey: true, allowEnterKey: true, dismissOnClick: true,
      backdrop: true, width: null, padding: null, background: null, color: null, accent: null, align: null,
      timer: 0, timerProgressBar: false, timerPauseOnHover: null,
      progressSteps: null, currentProgressStep: 0, customClass: null, hasValidator: false, hasPreConfirm: false, reqId: null
    };
    var o = {}, k;
    for (k in d) o[k] = d[k];
    for (k in raw) o[k] = raw[k];
    if (o.toast) {
      if (!has(raw, 'position')) o.position = 'top-end';
      if (!has(raw, 'showConfirmButton')) o.showConfirmButton = false;
      if (!has(raw, 'timer')) o.timer = 3000;
      if (!has(raw, 'timerProgressBar')) o.timerProgressBar = true;
      o.modal = false;
    }
    if (typeof o.icon === 'string') o.icon = o.icon.toLowerCase();
    if (o.modal === false) o.backdrop = false;
    if (typeof o.customClass === 'string') o.customClass = { popup: o.customClass };
    o.customClass = o.customClass || {};
    return o;
  }
  function cc(o, k) { return o.customClass[k] ? ' ' + o.customClass[k] : ''; }
  function posClasses(p) {
    p = String(p || 'center'); var v = 'center', h = 'center';
    if (p.indexOf('top') === 0) v = 'top'; else if (p.indexOf('bottom') === 0) v = 'bottom';
    if (/-(start|left)$/.test(p)) h = 'start'; else if (/-(end|right)$/.test(p)) h = 'end';
    return 'sgd-v-' + v + ' sgd-h-' + h;
  }

  // ---------- pieces ----------
  function iconNode(o) {
    if (o.loading) return el('div', 'sgd-loader');
    if (o.iconHtml) { var w0 = el('div', 'sgd-icon sgd-icon-custom'); w0.innerHTML = o.iconHtml; return w0; }
    if (!o.icon || !COLORS[o.icon]) return null;
    var w = el('div', 'sgd-icon sgd-icon-' + o.icon); w.style.color = COLORS[o.icon]; w.setAttribute('aria-hidden', 'true');
    var art = {
      success: '<svg viewBox="0 0 52 52"><path class="sgd-draw" pathLength="1" d="M14 27l8 8 16-18"/></svg>',
      error: '<svg viewBox="0 0 52 52"><path class="sgd-draw" pathLength="1" d="M16 16l20 20"/><path class="sgd-draw sgd-d2" pathLength="1" d="M36 16L16 36"/></svg>',
      warning: '<span>!</span>', info: '<span>i</span>', question: '<span>?</span>'
    };
    w.innerHTML = art[o.icon];
    return w;
  }
  function optList(src) {
    var out = [];
    if (!src) return out;
    if (Array.isArray(src)) {
      src.forEach(function (it) {
        if (Array.isArray(it)) out.push({ value: it[0], label: it[1] });
        else if (it && typeof it === 'object') out.push({ value: it.value, label: it.label != null ? it.label : it.value });
        else out.push({ value: it, label: it });
      });
    } else {
      Object.keys(src).forEach(function (k) {
        var v = src[k];
        if (v && typeof v === 'object') out.push({ group: k, items: optList(v) });
        else out.push({ value: k, label: v });
      });
    }
    return out;
  }
  function makeInput(inst) {
    var o = inst.opts, t = o.input, attrs = o.inputAttributes || {};
    var wrap = el('div', 'sgd-inputwrap'), ctl, get, focusEl;
    if (o.inputLabel) wrap.appendChild(el('label', 'sgd-label', o.inputLabel));
    function setAttrs(n) { for (var k in attrs) n.setAttribute(k, attrs[k]); }
    function onEdit(n) { var f = function () { hideValidation(inst); }; n.addEventListener('input', f); n.addEventListener('change', f); }
    var items = optList(o.inputOptions);
    if (t === 'textarea') {
      ctl = el('textarea', 'sgd-input'); ctl.value = o.inputValue == null ? '' : o.inputValue; ctl.placeholder = o.inputPlaceholder || '';
      setAttrs(ctl); wrap.appendChild(ctl); get = function () { return ctl.value; }; focusEl = ctl;
    } else if (t === 'select') {
      ctl = el('select', 'sgd-input');
      if (o.inputPlaceholder) { var ph = el('option', '', o.inputPlaceholder); ph.value = ''; ph.disabled = true; ph.selected = true; ctl.appendChild(ph); }
      items.forEach(function (it) {
        if (it.group) { var g = el('optgroup'); g.label = it.group; it.items.forEach(function (s) { var op = el('option', '', s.label); op.value = s.value; g.appendChild(op); }); ctl.appendChild(g); }
        else { var op2 = el('option', '', it.label); op2.value = it.value; ctl.appendChild(op2); }
      });
      if (o.inputValue != null && o.inputValue !== '') ctl.value = o.inputValue;
      setAttrs(ctl); wrap.appendChild(ctl); get = function () { return ctl.value; }; focusEl = ctl;
    } else if (t === 'radio') {
      var box = el('div', 'sgd-choices'), name = 'sgd-r' + inst.id; var flat = [];
      items.forEach(function (it) { if (it.group) it.items.forEach(function (s) { flat.push(s); }); else flat.push(it); });
      flat.forEach(function (it, i) {
        var lb = el('label', 'sgd-choice'); var r = el('input'); r.type = 'radio'; r.name = name; r.value = it.value;
        if (String(o.inputValue) === String(it.value) || (o.inputValue === '' && i === 0 && false)) r.checked = true;
        lb.appendChild(r); lb.appendChild(el('span', '', it.label)); box.appendChild(lb);
      });
      onEdit(box); wrap.appendChild(box);
      get = function () { var c = box.querySelector('input:checked'); return c ? c.value : ''; }; focusEl = box.querySelector('input');
    } else if (t === 'checkbox') {
      var lb2 = el('label', 'sgd-choice'); var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!o.inputValue && o.inputValue !== '0';
      lb2.appendChild(cb); lb2.appendChild(el('span', '', o.inputPlaceholder || o.inputLabel || '')); onEdit(cb);
      var cw = el('div', 'sgd-choices'); cw.appendChild(lb2); wrap.appendChild(cw); get = function () { return cb.checked; }; focusEl = cb;
    } else if (t === 'range') {
      var rw = el('div', 'sgd-range'); ctl = el('input'); ctl.type = 'range'; setAttrs(ctl);
      if (o.inputValue !== '' && o.inputValue != null) ctl.value = o.inputValue;
      var out = el('output', '', ctl.value); ctl.addEventListener('input', function () { out.textContent = ctl.value; });
      rw.appendChild(ctl); rw.appendChild(out); wrap.appendChild(rw); get = function () { return Number(ctl.value); }; focusEl = ctl;
    } else if (t === 'file') {
      ctl = el('input', 'sgd-input'); ctl.type = 'file'; setAttrs(ctl); wrap.appendChild(ctl); focusEl = ctl;
      get = function () {
        var files = Array.prototype.slice.call(ctl.files || []);
        return Promise.all(files.map(function (f) {
          return new Promise(function (res) {
            var info = { name: f.name, size: f.size, type: f.type };
            if (f.size > 5 * 1024 * 1024) { res(info); return; }
            var fr = new FileReader(); fr.onload = function () { info.dataUrl = fr.result; res(info); }; fr.onerror = function () { res(info); }; fr.readAsDataURL(f);
          });
        })).then(function (arr) { return ctl.multiple ? arr : (arr[0] || null); });
      };
    } else {
      ctl = el('input', 'sgd-input'); ctl.type = t || 'text'; ctl.value = o.inputValue == null ? '' : o.inputValue; ctl.placeholder = o.inputPlaceholder || '';
      setAttrs(ctl); ctl.autocomplete = 'off'; ctl.spellcheck = false;
      if (t === 'password') {
        var pw = el('div', 'sgd-pw'); pw.appendChild(ctl);
        var eye = el('button', 'sgd-eye', '\u{1F441}'); eye.type = 'button'; eye.setAttribute('data-no-theme', '1'); eye.tabIndex = -1; eye.title = 'Show / hide';
        eye.onclick = function () { ctl.type = ctl.type === 'password' ? 'text' : 'password'; ctl.focus(); };
        pw.appendChild(eye); wrap.appendChild(pw);
      } else { wrap.appendChild(ctl); }
      get = function () { var v = ctl.value; if (o.inputAutoTrim && (t === 'text' || t === 'email' || t === 'url' || t === 'tel' || t === 'search')) v = v.trim(); return t === 'number' ? (v === '' ? '' : Number(v)) : v; };
      focusEl = ctl;
    }
    if (ctl) onEdit(ctl);
    return { wrap: wrap, get: get, focusEl: focusEl, control: ctl };
  }

  var PRESETS = {
    required: { required: true },
    email: { required: true, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', message: 'Please enter a valid email address' },
    url: { required: true, pattern: '^https?://[^\\s]+$', message: 'Please enter a valid URL (http:// or https://)' },
    number: { required: true, pattern: '^-?\\d+(\\.\\d+)?$', message: 'Please enter a valid number' },
    integer: { required: true, pattern: '^-?\\d+$', message: 'Please enter a whole number' }
  };
  function validateLocal(o, v) {
    var r = o.validate; if (!r) return null;
    if (typeof r === 'string') r = PRESETS[r] || {};
    var s = v == null ? '' : String(v);
    if (r.required && (s.trim() === '' || v === false)) return r.message || 'This field is required';
    if (s === '') return null;
    if (r.minLength != null && s.length < r.minLength) return r.message || ('Must be at least ' + r.minLength + ' characters');
    if (r.maxLength != null && s.length > r.maxLength) return r.message || ('Must be at most ' + r.maxLength + ' characters');
    if (r.pattern) { try { if (!new RegExp(r.pattern, r.flags || '').test(s)) return r.message || 'Invalid format'; } catch (e) { } }
    var n = Number(s);
    if (r.integer && !/^-?\d+$/.test(s)) return r.message || 'Please enter a whole number';
    if (r.min != null && n < r.min) return r.message || ('Must be at least ' + r.min);
    if (r.max != null && n > r.max) return r.message || ('Must be at most ' + r.max);
    return null;
  }
  function showValidation(inst, msg) {
    if (inst.vm) { inst.vm.textContent = msg; inst.vm.style.display = 'flex'; }
    if (inst.input && inst.input.control) { inst.input.control.classList.remove('sgd-invalid'); void inst.input.control.offsetWidth; inst.input.control.classList.add('sgd-invalid'); inst.input.control.setAttribute('aria-invalid', 'true'); }
    if (inst.input && inst.input.focusEl && inst.input.focusEl.focus) inst.input.focusEl.focus();
  }
  function hideValidation(inst) {
    if (inst.vm) inst.vm.style.display = 'none';
    if (inst.input && inst.input.control) { inst.input.control.classList.remove('sgd-invalid'); inst.input.control.removeAttribute('aria-invalid'); }
  }
  function shake(inst) { var p = inst.popup; p.classList.remove('sgd-shake'); void p.offsetWidth; p.classList.add('sgd-shake'); }

  function mkBtn(inst, kind, label, color, show) {
    var o = inst.opts;
    var b = el('button', 'sgd-btn sgd-btn-' + kind + cc(o, kind + 'Button'), label); b.type = 'button'; b.setAttribute('data-no-theme', '1');
    var col = color || (kind === 'confirm' ? inst.accent : (kind === 'deny' ? '#dc3741' : '#6b7280'));
    b.style.setProperty('--c', col); b.style.color = textOn(col); b.style.display = show ? '' : 'none';
    return b;
  }
  function buildButtons(inst, host) {
    var o = inst.opts;
    var c = mkBtn(inst, 'confirm', o.confirmButtonText, o.confirmButtonColor, o.showConfirmButton);
    var dn = mkBtn(inst, 'deny', o.denyButtonText, o.denyButtonColor, o.showDenyButton);
    var ca = mkBtn(inst, 'cancel', o.cancelButtonText, o.cancelButtonColor, o.showCancelButton);
    inst.confirmBtn = c; inst.denyBtn = dn; inst.cancelBtn = ca;
    (o.reverseButtons ? [ca, dn, c] : [c, dn, ca]).forEach(function (b) { host.appendChild(b); });
    c.onclick = function () { onConfirm(inst); };
    dn.onclick = function () { onDeny(inst); };
    ca.onclick = function () { closeInst(inst, dismissed('cancel')); };
    return o.showConfirmButton || o.showDenyButton || o.showCancelButton;
  }
  function setBusy(inst, on) {
    inst.busy = on;
    [inst.confirmBtn, inst.denyBtn, inst.cancelBtn].forEach(function (b) { if (b) b.disabled = on; });
    if (inst.confirmBtn) inst.confirmBtn.classList.toggle('sgd-loading', on);
  }

  // ---------- modal / non-modal ----------
  function render(inst) {
    var o = inst.opts, p = inst.popup;
    p.innerHTML = '';
    p.className = 'sgd-popup' + (o.align === 'left' ? ' sgd-left' : '') + cc(o, 'popup');
    var th = applyTheme(inst.box, o); inst.accent = th.accent;
    if (o.width) p.style.setProperty('--sgd-width', px(o.width));
    if (o.padding != null) p.style.setProperty('--sgd-padding', px(o.padding));
    if (o.showCloseButton) {
      var x = el('button', 'sgd-close', '\u00D7'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.setAttribute('data-no-theme', '1');
      x.onclick = function () { closeInst(inst, dismissed('close')); }; p.appendChild(x);
    }
    if (o.progressSteps && o.progressSteps.length) {
      var st = el('div', 'sgd-steps');
      o.progressSteps.forEach(function (s, i) {
        if (i) st.appendChild(el('span', 'sgd-step-line'));
        st.appendChild(el('span', 'sgd-step' + (i < o.currentProgressStep ? ' done' : '') + (i === o.currentProgressStep ? ' active' : ''), String(s)));
      });
      p.appendChild(st);
    }
    var ic = iconNode(o); if (ic) p.appendChild(ic);
    if (o.imageUrl) {
      var im = el('img', 'sgd-image'); im.src = o.imageUrl; im.alt = o.imageAlt || '';
      if (o.imageWidth) im.style.width = px(o.imageWidth); if (o.imageHeight) im.style.height = px(o.imageHeight); p.appendChild(im);
    }
    if (o.title) { var t = el('div', 'sgd-title' + cc(o, 'title'), o.title); t.setAttribute('role', 'heading'); p.appendChild(t); }
    if (o.html != null && o.html !== '') {
      var c = el('div', 'sgd-content'); if (o.html && o.html.nodeType) c.appendChild(o.html); else c.innerHTML = String(o.html); p.appendChild(c);
    } else if (o.text) { p.appendChild(el('div', 'sgd-content sgd-text', o.text)); }
    inst.input = null;
    if (o.input) { inst.input = makeInput(inst); p.appendChild(inst.input.wrap); }
    var vm = el('div', 'sgd-validation'); vm.setAttribute('role', 'alert'); p.appendChild(vm); inst.vm = vm;
    var acts = el('div', 'sgd-actions'); var any = buildButtons(inst, acts); if (any) p.appendChild(acts);
    if (o.footer) { var f = el('div', 'sgd-footer'); f.innerHTML = o.footer; p.appendChild(f); }
    inst.bar = null;
    if (o.timer > 0 && o.timerProgressBar) { inst.bar = el('div', 'sgd-timer'); p.appendChild(inst.bar); }
  }

  function startTimer(inst) {
    var o = inst.opts; if (!(o.timer > 0)) return;
    inst.remaining = o.timer; inst.paused = false; inst.last = performance.now();
    var pause = o.timerPauseOnHover == null ? !!o.toast : !!o.timerPauseOnHover;
    if (pause && inst.popup) { inst.popup.addEventListener('mouseenter', function () { inst.paused = true; }); inst.popup.addEventListener('mouseleave', function () { inst.paused = false; }); }
    function tick(now) {
      if (inst.closed) return;
      if (!inst.paused) inst.remaining -= (now - inst.last);
      inst.last = now;
      if (inst.bar) inst.bar.style.transform = 'scaleX(' + Math.max(0, inst.remaining / o.timer) + ')';
      if (inst.remaining <= 0) { closeInst(inst, dismissed('timer')); return; }
      inst.raf = requestAnimationFrame(tick);
    }
    inst.raf = requestAnimationFrame(tick);
  }

  function fireModal(raw) {
    var o = normalize(raw);
    return new Promise(function (resolve) {
      if (o.modal !== false) { stack.slice().forEach(function (s) { if (s.opts.modal !== false) closeInst(s, dismissed('replaced')); }); }
      var inst = { id: ++uid, opts: o, resolve: resolve, closed: false, busy: false, prevFocus: document.activeElement };
      var box = el('div', 'sgd-container ' + posClasses(o.position) + (o.backdrop ? '' : ' sgd-nobackdrop'));
      if (o.backdrop && typeof o.backdrop === 'string') box.style.setProperty('--sgd-backdrop', o.backdrop);
      var popup = el('div', 'sgd-popup'); popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-modal', o.modal === false ? 'false' : 'true'); popup.tabIndex = -1;
      box.appendChild(popup); document.body.appendChild(box);
      inst.box = box; inst.popup = popup;
      box.addEventListener('mousedown', function (e) {
        if (e.target !== box || o.modal === false) return;
        if (inst.opts.allowOutsideClick) closeInst(inst, dismissed('backdrop')); else shake(inst);
      });
      render(inst);
      stack.push(inst); current = inst; installKeys(); startTimer(inst);
      if (typeof o.didOpen === 'function') { try { o.didOpen(inst.popup, inst); } catch (e) { console.error(e); } }
      setTimeout(function () {
        if (inst.closed) return; var f = null;
        if (o.input && o.inputAutoFocus && inst.input && inst.input.focusEl) f = inst.input.focusEl;
        else if (o.modal !== false) {
          if (o.focusCancel && inst.cancelBtn.style.display !== 'none') f = inst.cancelBtn;
          else if (o.focusDeny && inst.denyBtn.style.display !== 'none') f = inst.denyBtn;
          else if (o.focusConfirm && inst.confirmBtn.style.display !== 'none') f = inst.confirmBtn;
          else f = inst.popup;
        }
        if (f && f.focus) { f.focus(); if (f.select && o.input && /^(text|email|url|tel|search|password)$/.test(o.input)) { try { f.select(); } catch (e) { } } }
      }, 30);
    });
  }

  // ---------- toast ----------
  function toastHost(pos) {
    var id = 'sgd-th-' + String(pos).replace(/[^a-z-]/g, ''); var h = document.getElementById(id);
    if (!h) { h = el('div', 'sgd-toasts ' + posClasses(pos)); h.id = id; document.body.appendChild(h); }
    return h;
  }
  function fireToast(raw) {
    var o = normalize(raw); o.toast = true; o.modal = false;
    return new Promise(function (resolve) {
      var inst = { id: ++uid, opts: o, resolve: resolve, closed: false, isToast: true };
      var t = el('div', 'sgd-toast' + cc(o, 'popup')); t.setAttribute('role', 'status');
      var th = applyTheme(t, o); inst.accent = th.accent;
      t.style.setProperty('--sgd-stripe', (o.icon && COLORS[o.icon]) ? COLORS[o.icon] : th.accent);
      if (o.width) t.style.width = px(o.width);
      var ic = iconNode(o); if (ic) t.appendChild(ic);
      var body = el('div', 'sgd-toast-body');
      if (o.title) body.appendChild(el('div', 'sgd-title' + cc(o, 'title'), o.title));
      if (o.html != null && o.html !== '') { var c = el('div', 'sgd-content'); if (o.html && o.html.nodeType) c.appendChild(o.html); else c.innerHTML = String(o.html); body.appendChild(c); }
      else if (o.text) body.appendChild(el('div', 'sgd-content sgd-text', o.text));
      t.appendChild(body);
      inst.box = t; inst.popup = t;
      var acts = el('div', 'sgd-actions'); var any = buildButtons(inst, acts); if (any) t.appendChild(acts);
      if (o.showCloseButton) { var x = el('button', 'sgd-close', '\u00D7'); x.type = 'button'; x.setAttribute('data-no-theme', '1'); x.onclick = function (e) { e.stopPropagation(); closeInst(inst, dismissed('close')); }; t.appendChild(x); }
      if (o.timer > 0 && o.timerProgressBar) { inst.bar = el('div', 'sgd-timer'); t.appendChild(inst.bar); }
      if (o.dismissOnClick !== false && !any) t.addEventListener('click', function () { closeInst(inst, dismissed('click')); });
      toastHost(o.position).appendChild(t); toasts.push(inst); startTimer(inst);
      if (typeof o.didOpen === 'function') { try { o.didOpen(t, inst); } catch (e) { console.error(e); } }
    });
  }

  // ---------- confirm / deny / close ----------
  function hook(inst, name, value) {
    if (typeof window.simpleguiDialogHookIPC !== 'function') return Promise.resolve({});
    return Promise.resolve(window.simpleguiDialogHookIPC(inst.opts.reqId, name, value === undefined ? null : value)).then(function (r) { return typeof r === 'string' ? JSON.parse(r) : (r || {}); });
  }
  function onConfirm(inst) {
    if (inst.busy || inst.closed) return;
    var o = inst.opts;
    Promise.resolve(inst.input ? inst.input.get() : undefined).then(function (value) {
      if (inst.input) {
        var msg = validateLocal(o, value);
        if (msg) { showValidation(inst, msg); return; }
        if (o.hasValidator) {
          setBusy(inst, true);
          return hook(inst, 'validator', value).then(function (r) {
            setBusy(inst, false);
            if (r && r.error) { showValidation(inst, r.error); return; }
            return afterValidate(inst, value);
          });
        }
      }
      return afterValidate(inst, value);
    });
  }
  function afterValidate(inst, value) {
    var o = inst.opts;
    function done(v) { closeInst(inst, { isConfirmed: true, isDenied: false, isDismissed: false, value: v }); }
    if (typeof o.preConfirm === 'function') {
      if (o.showLoaderOnConfirm) setBusy(inst, true);
      return Promise.resolve().then(function () { return o.preConfirm(value); }).then(function (rv) {
        setBusy(inst, false); if (rv === false) return; done(rv === undefined ? value : rv);
      }, function (e) { setBusy(inst, false); showValidation(inst, String(e && e.message || e)); });
    }
    if (o.hasPreConfirm) {
      setBusy(inst, true);
      return hook(inst, 'preConfirm', value).then(function (r) {
        setBusy(inst, false);
        if (r && r.error) { showValidation(inst, r.error); return; }
        if (r && r.cancel) return;
        done(r && Object.prototype.hasOwnProperty.call(r, 'value') ? r.value : value);
      });
    }
    done(value);
  }
  function onDeny(inst) {
    if (inst.busy || inst.closed) return;
    var o = inst.opts;
    Promise.resolve(inst.input && o.returnInputValueOnDeny ? inst.input.get() : false).then(function (v) {
      closeInst(inst, { isConfirmed: false, isDenied: true, isDismissed: false, value: v });
    });
  }
  function closeInst(inst, result) {
    if (!inst || inst.closed) return;
    inst.closed = true; if (inst.raf) cancelAnimationFrame(inst.raf);
    var list = inst.isToast ? toasts : stack, i = list.indexOf(inst); if (i >= 0) list.splice(i, 1);
    if (current === inst) current = stack.length ? stack[stack.length - 1] : null;
    var node = inst.isToast ? inst.box : inst.box;
    node.classList.add('sgd-hiding');
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 190);
    if (!inst.isToast && inst.opts.modal !== false && inst.prevFocus && inst.prevFocus.focus) { try { inst.prevFocus.focus(); } catch (e) { } }
    if (typeof inst.opts.willClose === 'function') { try { inst.opts.willClose(result); } catch (e) { } }
    inst.resolve(result);
  }

  // ---------- keyboard ----------
  function focusables(root) {
    return Array.prototype.slice.call(root.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function (n) { return n.offsetParent !== null || n === document.activeElement; });
  }
  function installKeys() { if (keysInstalled) return; keysInstalled = true; document.addEventListener('keydown', onKey, true); }
  function onKey(e) {
    var inst = stack[stack.length - 1]; if (!inst || inst.closed) return;
    var o = inst.opts, inside = inst.popup.contains(document.activeElement);
    if (o.modal === false && !inside) return;
    if (e.key === 'Escape') {
      if (o.allowEscapeKey) { e.preventDefault(); e.stopPropagation(); closeInst(inst, dismissed('esc')); } else shake(inst);
      return;
    }
    if (e.key === 'Enter' && o.allowEnterKey && !e.isComposing) {
      var tg = e.target; if (tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'BUTTON')) return;
      if (inst.confirmBtn && inst.confirmBtn.style.display !== 'none' && !inst.busy) { e.preventDefault(); inst.confirmBtn.click(); }
      return;
    }
    if (e.key === 'Tab' && o.modal !== false) {
      var f = focusables(inst.popup); if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1], act = document.activeElement;
      if (e.shiftKey && (act === first || !inst.popup.contains(act))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (act === last || !inst.popup.contains(act))) { e.preventDefault(); first.focus(); }
    }
  }

  // ---------- in-webview file picker ----------
  function fmtSize(n) {
    if (n == null) return ''; var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i === 0 ? n : n.toFixed(1)) + ' ' + u[i];
  }
  function ipc(name) {
    var f = window[name];
    if (typeof f !== 'function') return Promise.reject(new Error('Bridge function ' + name + ' is unavailable'));
    var args = Array.prototype.slice.call(arguments, 1);
    return Promise.resolve(f.apply(window, args)).then(function (r) { return typeof r === 'string' ? JSON.parse(r) : r; });
  }
  function filePicker(o) {
    o = o || {};
    var mode = o.mode || 'open';
    var exts = (o.filter || []).map(function (x) { return String(x).replace(/^\*?\./, '').toLowerCase(); }).filter(Boolean);
    var st = { dir: o.initialDir || '', parent: null, entries: [], shown: [], places: [], sel: [], last: -1, hidden: !!o.showHidden, q: '', sep: '/', armed: false };
    var api = { btn: null };
    var root = el('div', 'sgd-fp'), side = el('div', 'sgd-fp-side'), main = el('div', 'sgd-fp-main');
    var bar = el('div', 'sgd-fp-bar');
    function ibtn(txt, title) { var b = el('button', 'sgd-fp-ibtn', txt); b.type = 'button'; b.title = title; b.setAttribute('data-no-theme', '1'); return b; }
    var up = ibtn('\u2191', 'Parent folder'), mkb = ibtn('\u{1F4C1}+', 'New folder');
    mkb.style.width = 'auto'; mkb.style.padding = '0 8px'; mkb.style.fontSize = '12px';
    var pathIn = el('input', 'sgd-fp-path'); pathIn.type = 'text'; pathIn.spellcheck = false;
    var hidLbl = el('label', 'sgd-fp-hidden'); var hidCb = el('input'); hidCb.type = 'checkbox'; hidCb.checked = st.hidden; hidLbl.appendChild(hidCb); hidLbl.appendChild(el('span', '', 'Hidden'));
    bar.appendChild(up); bar.appendChild(pathIn); if (mode !== 'open' || true) bar.appendChild(mkb); bar.appendChild(hidLbl);
    var mkRow = el('div', 'sgd-fp-mk'); var mkIn = el('input', 'sgd-fp-name'); mkIn.placeholder = 'New folder name'; mkIn.type = 'text';
    function sbtn(t, c) { var b = el('button', 'sgd-btn', t); b.type = 'button'; b.setAttribute('data-no-theme', '1'); b.style.setProperty('--c', c); b.style.color = textOn(c); return b; }
    var mkOk = sbtn('Create', '#22c55e'), mkNo = sbtn('Cancel', '#6b7280'); mkRow.appendChild(mkIn); mkRow.appendChild(mkOk); mkRow.appendChild(mkNo);
    var search = el('input', 'sgd-fp-search'); search.type = 'search'; search.placeholder = 'Filter this folder\u2026';
    var list = el('div', 'sgd-fp-list'); list.tabIndex = 0; list.setAttribute('role', 'listbox');
    var foot = el('div', 'sgd-fp-foot'), nameIn = null, info = el('span', 'sgd-fp-lbl', '');
    if (mode === 'save') { foot.appendChild(el('span', 'sgd-fp-lbl', 'File name')); nameIn = el('input', 'sgd-fp-name'); nameIn.type = 'text'; nameIn.value = o.defaultName || ''; foot.appendChild(nameIn); } else { foot.appendChild(info); }
    var msg = el('div', 'sgd-fp-msg');
    main.appendChild(bar); main.appendChild(mkRow); main.appendChild(search); main.appendChild(list); main.appendChild(foot); main.appendChild(msg);
    root.appendChild(side); root.appendChild(main);

    function setMsg(t, warn) { msg.textContent = t || ''; msg.className = 'sgd-fp-msg' + (warn ? ' warn' : ''); }
    function join(d, n) { var s = (d.indexOf('\\') >= 0 && d.indexOf('/') < 0) ? '\\' : '/'; return d.replace(/[\\\/]+$/, '') + s + n; }
    function entryOf(p) { for (var i = 0; i < st.entries.length; i++) if (st.entries[i].path === p) return st.entries[i]; return null; }
    function updateInfo() {
      if (nameIn) return;
      if (!st.sel.length) { info.textContent = mode === 'folder' ? 'Selecting current folder' : 'Nothing selected'; return; }
      info.textContent = st.sel.length === 1 ? ('Selected: ' + (entryOf(st.sel[0]) ? entryOf(st.sel[0]).name : st.sel[0])) : (st.sel.length + ' items selected');
    }
    function paintPlaces() {
      side.innerHTML = '';
      st.places.forEach(function (pl) {
        var b = el('button', 'sgd-fp-place' + (st.dir === pl.path ? ' active' : ''), (pl.icon || '\u{1F4C1}') + '  ' + pl.name); b.type = 'button'; b.setAttribute('data-no-theme', '1'); b.title = pl.path;
        b.onclick = function () { go(pl.path); }; side.appendChild(b);
      });
    }
    function isSel(e) { return st.sel.indexOf(e.path) >= 0; }
    function paint() {
      list.innerHTML = ''; var q = st.q.toLowerCase(); var shown = [];
      st.entries.forEach(function (e) {
        if (q && e.name.toLowerCase().indexOf(q) < 0) return;
        if (!e.isDirectory && mode === 'folder') return;
        if (!e.isDirectory && exts.length) { var m = /\.([^.]+)$/.exec(e.name); if (!m || exts.indexOf(m[1].toLowerCase()) < 0) return; }
        shown.push(e);
      });
      st.shown = shown;
      if (!shown.length) { list.appendChild(el('div', 'sgd-fp-empty', st.entries.length ? 'No matching items' : 'This folder is empty')); updateInfo(); return; }
      shown.forEach(function (e, i) {
        var row = el('div', 'sgd-fp-row' + (isSel(e) ? ' sel' : '')); row.setAttribute('role', 'option');
        row.appendChild(el('span', 'sgd-fp-ico', e.isDirectory ? '\u{1F4C1}' : '\u{1F4C4}')); row.appendChild(el('span', 'sgd-fp-nm', e.name));
        if (!e.isDirectory) row.appendChild(el('span', 'sgd-fp-sz', fmtSize(e.size)));
        row.addEventListener('click', function (ev) { select(e, i, ev); });
        row.addEventListener('dblclick', function () {
          if (e.isDirectory) go(e.path);
          else if (mode === 'open') { st.sel = [e.path]; confirmNow(); }
          else if (mode === 'save') { nameIn.value = e.name; confirmNow(); }
        });
        list.appendChild(row);
      });
      updateInfo();
    }
    function select(e, i, ev) {
      setMsg(''); st.armed = false;
      if (mode === 'save') { if (!e.isDirectory) nameIn.value = e.name; st.sel = [e.path]; }
      else if (mode === 'folder') { st.sel = [e.path]; }
      else if (o.multiple && ev && (ev.ctrlKey || ev.metaKey)) { var ix = st.sel.indexOf(e.path); if (ix >= 0) st.sel.splice(ix, 1); else st.sel.push(e.path); }
      else if (o.multiple && ev && ev.shiftKey && st.last >= 0) { var a = Math.min(st.last, i), b = Math.max(st.last, i); st.sel = st.shown.slice(a, b + 1).filter(function (x) { return !x.isDirectory; }).map(function (x) { return x.path; }); }
      else { st.sel = [e.path]; }
      st.last = i; paint();
    }
    function go(p) {
      ipc('simpleguiBrowseDirIPC', p, st.hidden).then(function (r) {
        if (r.error) { setMsg(r.error); return; }
        st.dir = r.currentDir; st.parent = r.parentDir; st.entries = r.entries || []; st.places = r.places || st.places; st.sep = r.sep || '/';
        st.sel = []; st.last = -1; st.armed = false; pathIn.value = r.currentDir; up.disabled = !r.parentDir; setMsg('');
        paintPlaces(); paint(); list.scrollTop = 0;
      }).catch(function (e) { setMsg(String(e && e.message || e)); });
    }
    function confirmNow() { if (api.btn) api.btn.click(); }
    up.onclick = function () { if (st.parent) go(st.parent); };
    pathIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(pathIn.value.trim()); } });
    hidCb.onchange = function () { st.hidden = hidCb.checked; go(st.dir); };
    search.addEventListener('input', function () { st.q = search.value; paint(); });
    mkb.onclick = function () { mkRow.classList.toggle('on'); if (mkRow.classList.contains('on')) { mkIn.value = ''; mkIn.focus(); } };
    mkNo.onclick = function () { mkRow.classList.remove('on'); };
    function doMk() {
      var n = mkIn.value.trim(); if (!n) return;
      ipc('simpleguiMkdirIPC', st.dir, n).then(function (r) { if (r.error) { setMsg(r.error); return; } mkRow.classList.remove('on'); go(r.path); }).catch(function (e) { setMsg(String(e && e.message || e)); });
    }
    mkOk.onclick = doMk; mkIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); doMk(); } });
    if (nameIn) nameIn.addEventListener('input', function () { st.armed = false; setMsg(''); });
    list.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; e.preventDefault();
      if (!st.shown.length) return; var i = st.last < 0 ? 0 : st.last + (e.key === 'ArrowDown' ? 1 : -1);
      i = Math.max(0, Math.min(st.shown.length - 1, i)); select(st.shown[i], i, null);
      var rows = list.querySelectorAll('.sgd-fp-row'); if (rows[i] && rows[i].scrollIntoView) rows[i].scrollIntoView({ block: 'nearest' });
    });

    function pre() {
      if (mode === 'folder') return st.sel.length ? st.sel[0] : st.dir;
      if (mode === 'save') {
        var nm = nameIn.value.trim();
        if (!nm) { setMsg('Enter a file name'); return false; }
        if (/[\\\/]/.test(nm)) { setMsg('The name cannot contain slashes'); return false; }
        var ex = st.entries.filter(function (e) { return e.name === nm; })[0];
        if (ex && ex.isDirectory) { go(ex.path); return false; }
        if (ex && !st.armed) { st.armed = true; setMsg('"' + nm + '" already exists \u2014 press Save again to replace it.', true); return false; }
        return join(st.dir, nm);
      }
      if (!st.sel.length) { setMsg('Select a file first'); return false; }
      var d = st.entries.filter(function (e) { return st.sel.indexOf(e.path) >= 0 && e.isDirectory; })[0];
      if (d) { go(d.path); return false; }
      return o.multiple ? st.sel.slice() : st.sel[0];
    }
    return fireModal({
      title: o.title || (mode === 'folder' ? 'Select a folder' : (mode === 'save' ? 'Save as' : (o.multiple ? 'Open files' : 'Open file'))),
      html: root, align: 'left', width: 740, showCancelButton: true, allowOutsideClick: false,
      confirmButtonText: mode === 'save' ? 'Save' : (mode === 'folder' ? 'Select folder' : 'Open'),
      customClass: { popup: 'sgd-fp-popup' }, preConfirm: pre,
      didOpen: function (popup) { api.btn = popup.querySelector('.sgd-btn-confirm'); go(st.dir); }
    }).then(function (r) { return r.isConfirmed ? r.value : null; });
  }

  // ---------- public API ----------
  window.SimpleDialogClient = {
    version: '1.0',
    fire: function (o) { return (o && o.toast) ? fireToast(o) : fireModal(o); },
    toast: fireToast,
    filePicker: filePicker,
    close: function (result) { if (current) closeInst(current, result || dismissed('close')); },
    closeAll: function () { stack.slice().forEach(function (s) { closeInst(s, dismissed('close')); }); toasts.slice().forEach(function (s) { closeInst(s, dismissed('close')); }); },
    update: function (partial) {
      if (!current) return false;
      for (var k in partial) current.opts[k] = partial[k];
      render(current); return true;
    },
    isVisible: function () { return stack.length > 0; }
  };

  // Back-compat shims for older SimpleGUI scripts.
  window.showSimpleguiModalDialog = function (opts) {
    var type = opts.type, o = { title: opts.title, text: opts.message };
    if (type === 'confirm') { o.icon = 'question'; o.showCancelButton = true; }
    if (type === 'prompt') { o.showCancelButton = true; o.input = 'text'; o.inputValue = opts.defaultVal || ''; }
    fireModal(o).then(function (r) {
      if (!opts.reqId || !window.onSimpleguiPromptResult) return;
      window.onSimpleguiPromptResult(opts.reqId, type === 'prompt' ? (r.isConfirmed ? r.value : null) : (type === 'confirm' ? !!r.isConfirmed : true));
    });
  };
  window.showSimpleguiToast = function (msg, ms) { fireToast({ title: String(msg), timer: ms || 3000 }); };
})();
`;

/** CSS + JS injected before `</body>` of every SimpleGUI page. */
export const DIALOG_CLIENT_HTML = `<style id="sgd-style">${DIALOG_CLIENT_CSS}</style><script id="sgd-script">${DIALOG_CLIENT_JS}</script>`;

// ---------------------------------------------------------------------------------------------------------------------
// TypeScript API
// ---------------------------------------------------------------------------------------------------------------------

type NativeResult = { status: "ok"; paths: string[] } | { status: "cancel" } | { status: "unavailable" };

function parseExts(filter?: string | string[]): string[] {
    const raw = Array.isArray(filter) ? filter : String(filter ?? "").split(/[,;|\s]+/);
    return raw.map(s => String(s).trim().replace(/^\*?\./, "").toLowerCase()).filter(s => s && s !== "*" && s !== "*.*");
}
const psq = (s: string) => String(s).replace(/'/g, "''");
const asq = (s: string) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const cleanPath = (p: string) => (p.length > 1 && /[\\/]$/.test(p) && !/^[A-Za-z]:[\\/]$/.test(p) ? p.replace(/[\\/]+$/, "") : p);

function runNative(mode: FileDialogMode, o: FileDialogOptions): NativeResult {
    if (typeof Bun === "undefined") return { status: "unavailable" };
    const title = o.title || (mode === "folder" ? "Select Folder" : mode === "save" ? "Save File" : "Open File");
    const exts = parseExts(o.filter);
    const dir = o.initialDir && fs.existsSync(o.initialDir) ? o.initialDir : "";
    const split = (s: string, sep: RegExp) => s.split(sep).map(x => x.trim()).filter(Boolean).map(cleanPath);
    try {
        if (process.platform === "darwin") {
            const loc = dir ? ` default location (POSIX file "${asq(dir)}")` : "";
            const multi = o.multiple && mode !== "save" ? " with multiple selections allowed" : "";
            const lines = ["activate"];
            if (mode === "folder") lines.push(`set r to choose folder with prompt "${asq(title)}"${loc}${multi}`);
            else if (mode === "save") lines.push(`set r to choose file name with prompt "${asq(title)}" default name "${asq(o.defaultName || "untitled.txt")}"${loc}`);
            else {
                const types = exts.length ? ` of type {${exts.map(e => `"${asq(e)}"`).join(", ")}}` : "";
                lines.push(`set r to choose file with prompt "${asq(title)}"${types}${loc}${multi}`);
            }
            lines.push("if class of r is list then", "set fs to r", "else", "set fs to {r}", "end if", 'set out to ""',
                "repeat with f in fs", "set out to out & POSIX path of (contents of f) & linefeed", "end repeat", "return out");
            const proc = Bun.spawnSync(["osascript", ...lines.flatMap(l => ["-e", l])]);
            const err = proc.stderr.toString();
            if (proc.exitCode === 0) {
                const paths = split(proc.stdout.toString(), /\r?\n/);
                return paths.length ? { status: "ok", paths } : { status: "cancel" };
            }
            return /-128/.test(err) ? { status: "cancel" } : { status: "unavailable" };
        }
        if (process.platform === "win32") {
            const filt = exts.length ? `Files|${exts.map(e => "*." + e).join(";")}|All files|*.*` : "All files|*.*";
            let body: string;
            if (mode === "folder") {
                body = `$f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description='${psq(title)}'; ${dir ? `$f.SelectedPath='${psq(dir)}';` : ""} if($f.ShowDialog() -eq 'OK'){ $f.SelectedPath }`;
            } else if (mode === "save") {
                body = `$f=New-Object System.Windows.Forms.SaveFileDialog; $f.Title='${psq(title)}'; $f.FileName='${psq(o.defaultName || "untitled.txt")}'; $f.Filter='${psq(filt)}'; ${dir ? `$f.InitialDirectory='${psq(dir)}';` : ""} if($f.ShowDialog() -eq 'OK'){ $f.FileName }`;
            } else {
                body = `$f=New-Object System.Windows.Forms.OpenFileDialog; $f.Title='${psq(title)}'; $f.Multiselect=$${o.multiple ? "true" : "false"}; $f.Filter='${psq(filt)}'; ${dir ? `$f.InitialDirectory='${psq(dir)}';` : ""} if($f.ShowDialog() -eq 'OK'){ $f.FileNames | ForEach-Object { $_ } }`;
            }
            const proc = Bun.spawnSync(["powershell", "-NoProfile", "-STA", "-Command", `Add-Type -AssemblyName System.Windows.Forms; ${body}`]);
            if (proc.exitCode !== 0) return { status: "unavailable" };
            const paths = split(proc.stdout.toString(), /\r?\n/);
            return paths.length ? { status: "ok", paths } : { status: "cancel" };
        }
        // linux & others: zenity
        const args = ["zenity", "--file-selection", `--title=${title}`];
        if (mode === "folder") args.push("--directory");
        if (mode === "save") args.push("--save", "--confirm-overwrite");
        if (o.multiple && mode !== "save") args.push("--multiple", "--separator=\n");
        if (exts.length && mode === "open") args.push(`--file-filter=Files | ${exts.map(e => "*." + e).join(" ")}`);
        if (mode === "save") { if (dir || o.defaultName) args.push(`--filename=${path.join(dir, o.defaultName || "")}`); }
        else if (dir) args.push(`--filename=${dir.replace(/[\\/]+$/, "")}/`);
        const proc = Bun.spawnSync(args);
        if (proc.exitCode === 0) {
            const paths = split(proc.stdout.toString(), /\r?\n/);
            return paths.length ? { status: "ok", paths } : { status: "cancel" };
        }
        // zenity exits 1 with empty stderr when the user cancels; anything else (no display, crash) means unavailable.
        return proc.exitCode === 1 && !proc.stderr.toString().trim() ? { status: "cancel" } : { status: "unavailable" };
    } catch {
        return { status: "unavailable" };
    }
}

export class SimpleDialogs {
    private host: DialogHost;
    private defaults: DialogOptions;
    private shared: { hooks: Map<string, { validator?: DialogOptions["inputValidator"]; preConfirm?: DialogOptions["preConfirm"] }>; open: Set<string> };

    constructor(host: DialogHost, defaults: DialogOptions = {}, shared?: SimpleDialogs["shared"]) {
        this.host = host;
        this.defaults = defaults;
        this.shared = shared ?? { hooks: new Map(), open: new Set() };
    }

    /** New instance sharing this window but with extra default options (like `Swal.mixin`). */
    mixin(defaults: DialogOptions): SimpleDialogs {
        return new SimpleDialogs(this.host, { ...this.defaults, ...defaults }, this.shared);
    }

    // ----- core -----------------------------------------------------------------------------------------------------

    /**
     * Show a dialog. Accepts an options object or the classic `(title, text, icon)` shorthand.
     * The LAST argument may be a callback `(result) => void` (recommended inside window event handlers).
     */
    fire(options?: DialogOptions | string, text?: string | DialogOptions | DialogCallback, icon?: DialogIcon | DialogOptions | DialogCallback, cb?: DialogCallback): Promise<DialogResult> {
        const args: any[] = [options, text, icon, cb];
        let callback: DialogCallback | undefined;
        for (let i = args.length - 1; i >= 0; i--) {
            if (typeof args[i] === "function") { callback = args[i]; args[i] = undefined; break; }
        }
        let opts: DialogOptions;
        if (typeof args[0] === "string") {
            opts = { title: args[0] };
            for (const extra of [args[1], args[2]]) {
                if (typeof extra === "string") { if (opts.text === undefined) opts.text = extra; else opts.icon = extra as DialogIcon; }
                else if (extra && typeof extra === "object") Object.assign(opts, extra);
            }
            if (typeof args[2] === "string") opts.icon = args[2] as DialogIcon;
        } else {
            opts = { ...(args[0] || {}) };
        }
        return this.dispatch({ ...this.defaults, ...opts }, callback);
    }

    private dispatch(opts: DialogOptions, callback?: DialogCallback): Promise<DialogResult> {
        // Headless (window not shown, e.g. unit tests / CLI): auto-accept so scripts never hang.
        if (!this.host.isRunning()) {
            const label = opts.title || opts.text || "";
            console.log(`[${opts.toast ? "Toast" : "Dialog"}${opts.icon ? ` - ${opts.icon}` : ""}] ${label}`);
            const res: DialogResult = { isConfirmed: true, isDenied: false, isDismissed: false, value: opts.input ? opts.inputValue : true };
            callback?.(res);
            return Promise.resolve(res);
        }

        const resolveOptions = (): DialogOptions | Promise<DialogOptions> => {
            const src = opts.inputOptions;
            if (typeof src === "function") {
                const r = (src as () => any)();
                if (r && typeof (r as any).then === "function") return (r as Promise<any>).then(v => ({ ...opts, inputOptions: v }));
                return { ...opts, inputOptions: r };
            }
            return opts;
        };
        const resolved = resolveOptions();

        return new Promise<DialogResult>((resolve) => {
            const go = (o: DialogOptions) => {
                const reqId = `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const { inputValidator, preConfirm, ...plain } = o as any;
                plain.reqId = reqId;
                plain.hasValidator = typeof inputValidator === "function";
                plain.hasPreConfirm = typeof preConfirm === "function";
                if (plain.hasValidator || plain.hasPreConfirm) this.shared.hooks.set(reqId, { validator: inputValidator, preConfirm });
                if (!o.toast && o.modal !== false) this.shared.open.add(reqId);
                this.host.resolvers.set(reqId, (r: DialogResult) => {
                    this.shared.hooks.delete(reqId);
                    this.shared.open.delete(reqId);
                    try { callback?.(r); } catch (e) { console.error("[SimpleDialogs] callback error:", e); }
                    resolve(r);
                });
                const payload = JSON.stringify(plain);
                this.host.eval(
                    `(function(){var c=window.SimpleDialogClient;var done=function(r){if(window.handlePromptResultIPC)window.handlePromptResultIPC(${JSON.stringify(reqId)},r);};` +
                    `if(!c){done({isConfirmed:false,isDenied:false,isDismissed:true,dismiss:"unavailable"});return;}` +
                    `c.fire(${payload}).then(done,function(e){done({isConfirmed:false,isDenied:false,isDismissed:true,dismiss:"error",error:String(e)});});})();`
                );
            };
            if (resolved && typeof (resolved as any).then === "function") (resolved as Promise<DialogOptions>).then(go);
            else go(resolved as DialogOptions);
        });
    }

    private wrap<T>(opts: DialogOptions, map: (r: DialogResult) => T, cb?: DialogCallback<T>): Promise<T> {
        const p = this.dispatch(opts, cb ? (r) => cb(map(r)) : undefined);
        return p.then(map);
    }

    // ----- shortcuts ------------------------------------------------------------------------------------------------

    private iconDialog(icon: DialogIcon, title: string, text?: string | DialogCallback, opts?: DialogOptions | DialogCallback, cb?: DialogCallback): Promise<DialogResult> {
        const extra = typeof text === "function" ? {} : typeof opts === "object" ? opts : {};
        const callback = typeof text === "function" ? text : typeof opts === "function" ? opts : cb;
        return this.dispatch({ ...this.defaults, title, text: typeof text === "string" ? text : undefined, icon, ...extra }, callback);
    }
    success(title: string, text?: string | DialogCallback, opts?: DialogOptions | DialogCallback, cb?: DialogCallback) { return this.iconDialog("success", title, text, opts, cb); }
    error(title: string, text?: string | DialogCallback, opts?: DialogOptions | DialogCallback, cb?: DialogCallback) { return this.iconDialog("error", title, text, opts, cb); }
    warning(title: string, text?: string | DialogCallback, opts?: DialogOptions | DialogCallback, cb?: DialogCallback) { return this.iconDialog("warning", title, text, opts, cb); }
    info(title: string, text?: string | DialogCallback, opts?: DialogOptions | DialogCallback, cb?: DialogCallback) { return this.iconDialog("info", title, text, opts, cb); }
    question(title: string, text?: string | DialogCallback, opts?: DialogOptions | DialogCallback, cb?: DialogCallback) { return this.iconDialog("question", title, text, opts, cb); }

    /** Yes/No style confirmation. Resolves `true` when confirmed. */
    confirm(text: string, title = "Are you sure?", opts?: DialogOptions | DialogCallback<boolean>, cb?: DialogCallback<boolean>): Promise<boolean> {
        const extra = typeof opts === "object" ? opts : {};
        const callback = typeof opts === "function" ? opts : cb;
        return this.wrap({ icon: "question", title, text, showCancelButton: true, confirmButtonText: "Yes", cancelButtonText: "Cancel", focusCancel: false, ...this.defaults, ...extra }, r => r.isConfirmed, callback);
    }

    /** Typical "Delete this?" flow with a red confirm button. */
    confirmDelete(what = "this item", opts?: DialogOptions | DialogCallback<boolean>, cb?: DialogCallback<boolean>): Promise<boolean> {
        const extra = typeof opts === "object" ? opts : {};
        const callback = typeof opts === "function" ? opts : cb;
        return this.wrap({ icon: "warning", title: "Are you sure?", text: `You are about to delete ${what}. This cannot be undone.`, showCancelButton: true, confirmButtonText: "Yes, delete it", confirmButtonColor: "#dc3741", focusCancel: true, ...this.defaults, ...extra }, r => r.isConfirmed, callback);
    }

    /** Free-text prompt. Resolves the entered string, or `null` when cancelled. */
    prompt(text: string, defaultValue = "", title = "Prompt", opts?: DialogOptions | DialogCallback<string | null>, cb?: DialogCallback<string | null>): Promise<string | null> {
        const extra = typeof opts === "object" ? opts : {};
        const callback = typeof opts === "function" ? opts : cb;
        return this.wrap({ title, text, input: "text", inputValue: defaultValue, showCancelButton: true, ...this.defaults, ...extra }, r => (r.isConfirmed ? String(r.value ?? "") : null), callback);
    }

    /** Ask for a single typed value (`email`, `password`, `number`, `date`, `color`, `range`, `textarea`...). Resolves `undefined` when cancelled. */
    inputDialog(type: DialogInputType, title: string, opts?: DialogOptions | DialogCallback<any>, cb?: DialogCallback<any>): Promise<any> {
        const extra = typeof opts === "object" ? opts : {};
        const callback = typeof opts === "function" ? opts : cb;
        return this.wrap({ title, input: type, showCancelButton: true, ...this.defaults, ...extra }, r => (r.isConfirmed ? r.value : undefined), callback);
    }

    /** Pick one option from a dropdown. Resolves the chosen value, or `undefined` when cancelled. */
    selectDialog(title: string, options: DialogInputOptions, opts?: DialogOptions | DialogCallback<any>, cb?: DialogCallback<any>): Promise<any> {
        const extra = typeof opts === "object" ? opts : {};
        const callback = typeof opts === "function" ? opts : cb;
        return this.wrap({ title, input: "select", inputOptions: options, inputPlaceholder: "Select...", showCancelButton: true, validate: "required", ...this.defaults, ...extra }, r => (r.isConfirmed ? r.value : undefined), callback);
    }

    /** Non-blocking toast. `icon` and `position` are optional. */
    toast(message: string | DialogOptions, durationMs = 3000, icon?: DialogIcon | DialogCallback, cb?: DialogCallback): Promise<DialogResult> {
        const callback = typeof icon === "function" ? icon : cb;
        const opts: DialogOptions = typeof message === "string"
            ? { title: message, timer: durationMs, ...(typeof icon === "string" ? { icon } : {}) }
            : { ...message };
        return this.dispatch({ ...this.defaults, ...opts, toast: true }, callback);
    }

    /** Show a spinner dialog. Close it with `close()`. */
    showLoading(title = "Loading...", text?: string): Promise<DialogResult> {
        return this.dispatch({ ...this.defaults, title, text, loading: true, showConfirmButton: false, allowOutsideClick: false, allowEscapeKey: false });
    }

    /** Run several dialogs in sequence with a progress-step indicator. Stops at the first non-confirmed step. */
    queue(steps: DialogOptions[], cb?: (out: { completed: boolean; results: DialogResult[] }) => void): Promise<{ completed: boolean; results: DialogResult[] }> {
        return new Promise((resolve) => {
            const results: DialogResult[] = [];
            const finish = (completed: boolean) => { const out = { completed, results }; try { cb?.(out); } catch (e) { console.error(e); } resolve(out); };
            const run = (i: number) => {
                if (i >= steps.length) return finish(true);
                const s = steps[i]!;
                this.dispatch({ ...this.defaults, ...s, progressSteps: s.progressSteps ?? steps.map((_, k) => String(k + 1)), currentProgressStep: i }, (r) => {
                    results.push(r);
                    if (r.isConfirmed) run(i + 1); else finish(false);
                });
            };
            run(0);
        });
    }

    // ----- control --------------------------------------------------------------------------------------------------

    close(result?: Partial<DialogResult>): void {
        this.host.eval(`window.SimpleDialogClient&&window.SimpleDialogClient.close(${result ? JSON.stringify(result) : ""});`);
    }
    closeAll(): void { this.host.eval(`window.SimpleDialogClient&&window.SimpleDialogClient.closeAll();`); }
    /** Update the visible dialog in place (title, text, icon, button labels, ...). Function options are not supported here. */
    update(options: Omit<DialogOptions, "inputValidator" | "preConfirm">): void {
        this.host.eval(`window.SimpleDialogClient&&window.SimpleDialogClient.update(${JSON.stringify(options)});`);
    }
    isVisible(): boolean { return this.shared.open.size > 0; }

    // ----- files ----------------------------------------------------------------------------------------------------

    /**
     * Generic file dialog. Native OS dialog first (`native: "auto"`); the in-webview picker is used ONLY when the native
     * dialog is unavailable — a user pressing Cancel never opens a second dialog.
     * Result: path string, array of paths (when `multiple`), or `null` when cancelled.
     */
    fileDialog(mode: FileDialogMode, opts: FileDialogOptions = {}, cb?: DialogCallback<string | string[] | null>): Promise<string | string[] | null> {
        const finish = (v: string | string[] | null) => { try { cb?.(v); } catch (e) { console.error(e); } return Promise.resolve(v); };
        const native = opts.native ?? "auto";
        if (native !== "never") {
            const r = runNative(mode, opts);
            if (r.status === "ok") return finish(opts.multiple && mode !== "save" ? r.paths : (r.paths[0] ?? null));
            if (r.status === "cancel") return finish(null);
            if (native === "always") { console.warn("[SimpleDialogs] Native file dialog unavailable."); return finish(null); }
        }
        if (!this.host.isRunning()) return finish(null);
        return new Promise((resolve) => {
            const reqId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            this.host.resolvers.set(reqId, (v: any) => { const out = v ?? null; try { cb?.(out); } catch (e) { console.error(e); } resolve(out); });
            const payload = JSON.stringify({
                mode, title: opts.title, filter: parseExts(opts.filter), defaultName: opts.defaultName,
                initialDir: opts.initialDir || process.cwd(), multiple: !!opts.multiple, showHidden: !!opts.showHidden,
            });
            this.host.eval(
                `(function(){var c=window.SimpleDialogClient;var done=function(r){if(window.handlePromptResultIPC)window.handlePromptResultIPC(${JSON.stringify(reqId)},r);};` +
                `if(!c){done(null);return;}c.filePicker(${payload}).then(done,function(){done(null);});})();`
            );
        });
    }

    openFile(opts: FileDialogOptions = {}, cb?: DialogCallback<string | null>) { return this.fileDialog("open", { ...opts, multiple: false }, cb as any) as Promise<string | null>; }
    openFiles(opts: FileDialogOptions = {}, cb?: DialogCallback<string[] | null>) { return this.fileDialog("open", { ...opts, multiple: true }, cb as any) as Promise<string[] | null>; }
    saveFile(opts: FileDialogOptions = {}, cb?: DialogCallback<string | null>) { return this.fileDialog("save", { ...opts, multiple: false }, cb as any) as Promise<string | null>; }
    openFolder(opts: FileDialogOptions = {}, cb?: DialogCallback<string | null>) { return this.fileDialog("folder", { ...opts, multiple: false }, cb as any) as Promise<string | null>; }

    // ----- bridge (called once from SimpleWindow.show()) -------------------------------------------------------------

    bindIpc(webview: { bind: (name: string, fn: (...a: any[]) => any) => void }): void {
        const safeBind = (name: string, fn: (...a: any[]) => any) => { try { webview.bind(name, fn); } catch { /* already bound */ } };
        safeBind("simpleguiBrowseDirIPC", (dir: string, showHidden?: boolean) => this.browseDir(dir, !!showHidden));
        safeBind("simpleguiMkdirIPC", (parent: string, name: string) => this.makeDir(parent, name));
        safeBind("simpleguiDialogHookIPC", (reqId: string, name: string, value: any) => this.runHook(reqId, name, value));
    }

    private runHook(reqId: string, name: string, value: any): any {
        const h = this.shared.hooks.get(reqId);
        if (!h) return {};
        const shape = (r: any) => {
            if (name === "validator") return (typeof r === "string" && r) ? { error: r } : (r === false ? { error: "Invalid value" } : {});
            return r === false ? { cancel: true } : { value: r };
        };
        try {
            const fn = name === "validator" ? h.validator : h.preConfirm;
            if (!fn) return {};
            const r: any = fn(value);
            // Stay synchronous when the user's function is synchronous (no dependency on microtask draining).
            if (r && typeof r.then === "function") return r.then(shape, (e: any) => ({ error: String(e?.message ?? e) }));
            return shape(r);
        } catch (e: any) {
            return { error: String(e?.message ?? e) };
        }
    }

    private places(): Array<{ name: string; path: string; icon: string }> {
        const home = os.homedir();
        const out: Array<{ name: string; path: string; icon: string }> = [{ name: "Home", path: home, icon: "\u{1F3E0}" }];
        for (const [n, ic] of [["Desktop", "\u{1F5A5}"], ["Documents", "\u{1F4C4}"], ["Downloads", "\u2B07"], ["Pictures", "\u{1F5BC}"], ["Projects", "\u{1F4BB}"]] as const) {
            const p = path.join(home, n);
            try { if (fs.statSync(p).isDirectory()) out.push({ name: n, path: p, icon: ic }); } catch { /* skip */ }
        }
        out.push({ name: "Working dir", path: process.cwd(), icon: "\u{1F4C2}" });
        if (process.platform === "win32") {
            for (let c = 67; c <= 90; c++) { const d = `${String.fromCharCode(c)}:\\`; try { if (fs.existsSync(d)) out.push({ name: d, path: d, icon: "\u{1F4BD}" }); } catch { /* skip */ } }
        } else {
            out.push({ name: "Computer", path: "/", icon: "\u{1F4BD}" });
            if (process.platform === "darwin") out.push({ name: "Volumes", path: "/Volumes", icon: "\u{1F4BE}" });
        }
        return out;
    }

    private browseDir(dirPath: string, showHidden: boolean): any {
        const places = this.places();
        try {
            let target = dirPath ? path.resolve(dirPath) : os.homedir();
            try { if (!fs.statSync(target).isDirectory()) target = path.dirname(target); } catch { target = os.homedir(); }
            const entries: Array<{ name: string; isDirectory: boolean; path: string; size: number | null; mtime: number }> = [];
            for (const e of fs.readdirSync(target, { withFileTypes: true })) {
                if (!showHidden && e.name.startsWith(".")) continue;
                const full = path.join(target, e.name);
                let isDir = e.isDirectory(), size: number | null = null, mtime = 0;
                try { const st = fs.statSync(full); isDir = st.isDirectory(); size = isDir ? null : st.size; mtime = st.mtimeMs; } catch { /* broken symlink etc. */ }
                entries.push({ name: e.name, isDirectory: isDir, path: full, size, mtime });
            }
            entries.sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) : a.isDirectory ? -1 : 1));
            const parent = path.dirname(target);
            return { currentDir: target, parentDir: parent !== target ? parent : null, entries, places, sep: path.sep, home: os.homedir() };
        } catch (err: any) {
            return { error: `Cannot open folder: ${err?.message ?? err}`, currentDir: dirPath, parentDir: null, entries: [], places, sep: path.sep };
        }
    }

    private makeDir(parent: string, name: string): any {
        try {
            const clean = String(name || "").trim();
            if (!clean || /[\\/]/.test(clean) || clean === "." || clean === "..") return { error: "Invalid folder name" };
            const full = path.join(parent, clean);
            fs.mkdirSync(full, { recursive: false });
            return { ok: true, path: full };
        } catch (err: any) {
            return { error: err?.code === "EEXIST" ? "A folder with that name already exists" : `Could not create folder: ${err?.message ?? err}` };
        }
    }
}
