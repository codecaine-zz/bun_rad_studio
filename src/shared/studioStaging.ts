// @ts-nocheck
/**
 * Shared "Import with staging" wizard for the SQLite, MySQL and PostgreSQL studios.
 *
 * Every studio page embeds `STUDIO_STAGING_STYLE` and `studioStagingScript("<engine>")`. The script adds an
 * "Import with staging" button to the header and a modal wizard (Source → Map → Load to staging → Check → Review & promote).
 * It talks to `/api/staging/*` of the same studio server (see src/db/staging/routes.ts). No external network, fonts or CDN.
 */
import { studioStagingClient } from "./studioStagingClient";

export const STUDIO_STAGING_STYLE = `
    /* ===== Import with staging wizard (shared by the SQLite / MySQL / PostgreSQL studios) ===== */
    .stg-overlay { position: fixed; inset: 0; z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(2, 6, 15, 0.62); backdrop-filter: blur(3px); }
    .stg-overlay[hidden] { display: none !important; }
    .stg-dialog { position: relative; display: flex; flex-direction: column; width: min(1180px, 100%); height: min(860px, 100%); background: var(--bg-surface, #0e1526); color: var(--text-main, #f8fafc); border: 1px solid var(--border-subtle, rgba(255,255,255,.12)); border-radius: 14px; box-shadow: 0 30px 80px rgba(0,0,0,.55); overflow: hidden; font-family: var(--font-sans, system-ui, sans-serif); font-size: 13px; }
    .stg-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.12)); }
    .stg-headtext { flex: 1; min-width: 0; }
    .stg-head h2 { font-size: 16px; font-weight: 800; margin: 0; }
    .stg-sub { color: var(--text-muted, #94a3b8); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stg-iconbtn { background: transparent; color: inherit; border: 1px solid var(--border-subtle, rgba(255,255,255,.12)); border-radius: 8px; width: 30px; height: 30px; cursor: pointer; font-size: 14px; }
    .stg-iconbtn:hover:not(:disabled) { border-color: var(--cyan, #38bdf8); }
    .stg-steps { display: flex; flex-wrap: wrap; gap: 4px 8px; list-style: none; margin: 0; padding: 10px 16px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.12)); }
    .stg-steps[hidden] { display: none; }
    .stg-step { display: block; }
    .stg-stepbtn { display: flex; align-items: center; gap: 8px; background: transparent; color: var(--text-muted, #94a3b8); border: 1px solid transparent; border-radius: 999px; padding: 4px 12px 4px 5px; cursor: pointer; font: inherit; font-weight: 600; }
    .stg-stepbtn:disabled { cursor: default; opacity: .55; }
    .stg-stepnum { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: color-mix(in srgb, var(--text-muted, #94a3b8) 25%, transparent); font-size: 11px; font-weight: 800; }
    .stg-step.current .stg-stepbtn { color: var(--text-main, #f8fafc); border-color: var(--cyan, #38bdf8); background: color-mix(in srgb, var(--cyan, #38bdf8) 14%, transparent); }
    .stg-step.current .stg-stepnum { background: var(--cyan, #38bdf8); color: var(--bg-base, #070a12); }
    .stg-step.done .stg-stepnum { background: var(--emerald, #10b981); color: var(--bg-base, #070a12); }
    .stg-body { flex: 1; overflow: auto; padding: 16px; outline: none; }
    .stg-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border-subtle, rgba(255,255,255,.12)); }
    .stg-foot-reason, .foot-reason { margin-right: auto; }
    .stg-pane h3 { font-size: 15px; margin: 0 0 12px; font-weight: 800; }
    .stg-btn { display: inline-flex; align-items: center; gap: 6px; background: color-mix(in srgb, var(--text-muted, #94a3b8) 14%, transparent); color: var(--text-main, #f8fafc); border: 1px solid var(--border-subtle, rgba(255,255,255,.14)); border-radius: 8px; padding: 6px 12px; font: inherit; font-weight: 600; cursor: pointer; }
    .stg-btn:hover:not(:disabled) { border-color: var(--cyan, #38bdf8); }
    .stg-btn:focus-visible, .stg-stepbtn:focus-visible, .stg-iconbtn:focus-visible, .stg-drop:focus-visible, .stg-tab:focus-visible, .stg-pill:focus-visible, .stg-stat:focus-visible { outline: 2px solid var(--cyan, #38bdf8); outline-offset: 2px; }
    .stg-btn:disabled { opacity: .45; cursor: not-allowed; }
    .stg-btn.primary { background: var(--cyan, #38bdf8); color: var(--bg-base, #070a12); border-color: var(--cyan, #38bdf8); }
    .stg-btn.danger { border-color: var(--rose, #f43f5e); color: var(--rose, #f43f5e); }
    .stg-card { background: color-mix(in srgb, var(--text-muted, #94a3b8) 8%, transparent); border: 1px solid var(--border-subtle, rgba(255,255,255,.1)); border-radius: 10px; padding: 12px 14px; margin: 10px 0; }
    .stg-card.ok { border-color: var(--emerald, #10b981); background: color-mix(in srgb, var(--emerald, #10b981) 10%, transparent); }
    .stg-card > summary { cursor: pointer; }
    .stg-big { font-size: 22px; font-weight: 800; }
    .stg-strong { font-weight: 700; }
    .stg-muted { color: var(--text-muted, #94a3b8); }
    .stg-muted.small, .small { font-size: 11px; }
    .stg-rose { color: var(--rose, #f43f5e); }
    .stg-amber { color: var(--amber, #fbbf24); }
    .stg-drop { border: 2px dashed var(--border-subtle, rgba(255,255,255,.25)); border-radius: 12px; padding: 28px 16px; text-align: center; cursor: pointer; }
    .stg-drop.over, .stg-drop:hover { border-color: var(--cyan, #38bdf8); background: color-mix(in srgb, var(--cyan, #38bdf8) 8%, transparent); }
    .stg-drop-big { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
    .stg-paste { margin: 12px 0; }
    .stg-paste > summary { cursor: pointer; color: var(--cyan, #38bdf8); font-weight: 600; margin-bottom: 6px; }
    .stg-textarea, .stg-input, .stg-select { background: var(--bg-base, #070a12); color: var(--text-main, #f8fafc); border: 1px solid var(--border-subtle, rgba(255,255,255,.18)); border-radius: 7px; padding: 6px 8px; font: inherit; max-width: 100%; }
    .stg-textarea { width: 100%; font-family: var(--font-mono, monospace); box-sizing: border-box; }
    .stg-input.short { width: 90px; } .stg-input.tiny { width: 70px; } .stg-input.wide { width: 100%; box-sizing: border-box; }
    .stg-select { padding-right: 22px; max-width: 320px; }
    .stg-input:focus, .stg-select:focus, .stg-textarea:focus { outline: 2px solid var(--cyan, #38bdf8); outline-offset: 1px; }
    .stg-settings { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: flex-end; margin: 10px 0; }
    .stg-field { display: flex; flex-direction: column; gap: 3px; }
    .stg-fieldlabel { font-size: 11px; font-weight: 700; color: var(--text-muted, #94a3b8); text-transform: uppercase; letter-spacing: .4px; }
    .stg-check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .stg-checks { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 6px 0; }
    .stg-tablewrap { overflow: auto; max-width: 100%; border: 1px solid var(--border-subtle, rgba(255,255,255,.1)); border-radius: 8px; max-height: 48vh; }
    .stg-table { border-collapse: collapse; width: 100%; font-size: 12px; }
    .stg-table th, .stg-table td { text-align: left; padding: 5px 9px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.08)); vertical-align: top; max-width: 360px; overflow-wrap: anywhere; }
    .stg-table th { position: sticky; top: 0; background: var(--bg-surface, #0e1526); z-index: 1; font-weight: 700; white-space: nowrap; }
    .stg-table .num { text-align: right; color: var(--text-muted, #94a3b8); font-variant-numeric: tabular-nums; width: 1%; white-space: nowrap; }
    .stg-table .null { color: var(--text-muted, #94a3b8); font-style: italic; }
    .stg-table .mono, .stg-code, .stg-sql { font-family: var(--font-mono, monospace); }
    .stg-table .nowrap { white-space: nowrap; overflow-wrap: normal; }
    .stg-table tr.bad td { background: color-mix(in srgb, var(--rose, #f43f5e) 9%, transparent); }
    .stg-table td.cellbad { background: color-mix(in srgb, var(--rose, #f43f5e) 28%, transparent); }
    .stg-table td[role="button"] { cursor: pointer; }
    .stg-table td[role="button"]:focus-visible { outline: 2px solid var(--cyan, #38bdf8); outline-offset: -2px; }
    .stg-table tr.missing td { background: color-mix(in srgb, var(--rose, #f43f5e) 12%, transparent); }
    .stg-table tr.skipped td { opacity: .75; }
    .stg-table tr.stale td { background: color-mix(in srgb, var(--amber, #fbbf24) 10%, transparent); }
    .stg-table td.del { background: color-mix(in srgb, var(--rose, #f43f5e) 12%, transparent); }
    .stg-table td.add { background: color-mix(in srgb, var(--emerald, #10b981) 14%, transparent); }
    .stg-table.map td { vertical-align: top; }
    .stg-chip { display: inline-block; font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 999px; white-space: nowrap; background: color-mix(in srgb, var(--text-muted, #94a3b8) 22%, transparent); margin: 1px 3px 1px 0; }
    .stg-chip.key { background: color-mix(in srgb, var(--cyan, #38bdf8) 30%, transparent); }
    .stg-chip.req { background: color-mix(in srgb, var(--rose, #f43f5e) 32%, transparent); }
    .stg-chip.st-valid, .stg-chip.st-promoted { background: color-mix(in srgb, var(--emerald, #10b981) 32%, transparent); }
    .stg-chip.st-invalid { background: color-mix(in srgb, var(--rose, #f43f5e) 32%, transparent); }
    .stg-chip.st-duplicate, .stg-chip.st-skipped, .stg-chip.st-dropped { background: color-mix(in srgb, var(--amber, #fbbf24) 32%, transparent); }
    .stg-chips { margin-top: 2px; }
    .stg-steplist { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .stg-stepchip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 4px 2px 8px; border-radius: 999px; border: 1px solid var(--border-subtle, rgba(255,255,255,.18)); background: color-mix(in srgb, var(--cyan, #38bdf8) 8%, transparent); font-size: 11px; }
    .stg-stepchip .stg-select { font-size: 11px; padding: 2px 4px; }
    .stg-x { background: transparent; border: none; color: var(--text-muted, #94a3b8); cursor: pointer; font-size: 14px; padding: 0 5px; border-radius: 50%; }
    .stg-x:hover, .stg-x:focus-visible { color: var(--rose, #f43f5e); outline: none; }
    .stg-extra { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px; align-items: flex-end; }
    .stg-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
    .stg-rule { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; align-items: center; }
    .stg-bar { height: 10px; border-radius: 99px; background: color-mix(in srgb, var(--text-muted, #94a3b8) 25%, transparent); overflow: hidden; margin: 8px 0; }
    .stg-barfill { height: 100%; width: 0; background: var(--cyan, #38bdf8); transition: width .25s ease; }
    .stg-banner { border-radius: 8px; padding: 8px 12px; margin: 8px 0; border: 1px solid var(--border-subtle, rgba(255,255,255,.12)); background: color-mix(in srgb, var(--cyan, #38bdf8) 9%, transparent); }
    .stg-banner.warn { border-color: var(--amber, #fbbf24); background: color-mix(in srgb, var(--amber, #fbbf24) 11%, transparent); }
    .stg-banner.error { border-color: var(--rose, #f43f5e); background: color-mix(in srgb, var(--rose, #f43f5e) 12%, transparent); }
    .stg-banner.ok { border-color: var(--emerald, #10b981); background: color-mix(in srgb, var(--emerald, #10b981) 11%, transparent); }
    .stg-hint { color: var(--text-muted, #94a3b8); font-size: 12px; margin-top: 3px; }
    .stg-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin: 10px 0; }
    .stg-stat { text-align: left; font: inherit; color: inherit; background: color-mix(in srgb, var(--text-muted, #94a3b8) 9%, transparent); border: 1px solid var(--border-subtle, rgba(255,255,255,.1)); border-radius: 10px; padding: 9px 12px; }
    button.stg-stat { cursor: pointer; }
    button.stg-stat:hover { border-color: var(--cyan, #38bdf8); }
    .stg-stat.good { border-color: color-mix(in srgb, var(--emerald, #10b981) 60%, transparent); }
    .stg-stat.bad { border-color: var(--rose, #f43f5e); }
    .stg-stat.warn { border-color: var(--amber, #fbbf24); }
    .stg-statnum { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .stg-statlabel { font-size: 11px; color: var(--text-muted, #94a3b8); }
    .stg-toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
    .stg-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.12)); margin-top: 8px; }
    .stg-tab { background: transparent; color: var(--text-muted, #94a3b8); border: none; border-bottom: 2px solid transparent; padding: 7px 12px; font: inherit; font-weight: 700; cursor: pointer; }
    .stg-tab.on { color: var(--text-main, #f8fafc); border-bottom-color: var(--cyan, #38bdf8); }
    .stg-tabbody { padding-top: 10px; }
    .stg-filters { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
    .stg-pill { background: color-mix(in srgb, var(--text-muted, #94a3b8) 14%, transparent); border: 1px solid var(--border-subtle, rgba(255,255,255,.14)); color: inherit; border-radius: 999px; padding: 2px 10px; font: inherit; font-size: 11px; cursor: pointer; }
    .stg-pill.on { background: var(--cyan, #38bdf8); color: var(--bg-base, #070a12); border-color: var(--cyan, #38bdf8); }
    .stg-modes { display: grid; gap: 6px; margin: 8px 0; }
    .stg-mode { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--border-subtle, rgba(255,255,255,.14)); border-radius: 10px; padding: 8px 12px; cursor: pointer; }
    .stg-mode.on { border-color: var(--cyan, #38bdf8); background: color-mix(in srgb, var(--cyan, #38bdf8) 10%, transparent); }
    .stg-mode.off { opacity: .5; cursor: not-allowed; }
    .stg-sql { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; background: var(--bg-base, #070a12); border: 1px solid var(--border-subtle, rgba(255,255,255,.1)); border-radius: 8px; padding: 8px 10px; max-height: 240px; overflow: auto; }
    .stg-code { background: var(--bg-base, #070a12); padding: 2px 6px; border-radius: 5px; }
    .stg-sheet { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; background: rgba(2, 6, 15, 0.55); padding: 16px; }
    .stg-sheetbox { background: var(--bg-surface, #0e1526); border: 1px solid var(--border-subtle, rgba(255,255,255,.2)); border-radius: 12px; padding: 16px 18px; width: min(560px, 100%); max-height: 100%; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
    .stg-sheetbox h3 { margin: 0 0 10px; font-size: 15px; }
    .stg-sheetfoot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    .stg-toast { position: absolute; left: 50%; bottom: 62px; transform: translateX(-50%); background: var(--bg-base, #070a12); border: 1px solid var(--cyan, #38bdf8); border-radius: 8px; padding: 6px 14px; opacity: 0; pointer-events: none; transition: opacity .2s; max-width: 80%; }
    .stg-toast.show { opacity: 1; }
    .stg-toast.error { border-color: var(--rose, #f43f5e); }
    .stg-toast.warn { border-color: var(--amber, #fbbf24); }
    html.stg-open body { overflow: hidden; }
    @media (max-width: 760px) {
      .stg-overlay { padding: 0; }
      .stg-dialog { height: 100%; border-radius: 0; }
      .stg-steplabel { display: none; }
      .stg-step.current .stg-steplabel { display: inline; }
      .stg-body { padding: 10px; }
    }
    @media (prefers-reduced-motion: reduce) { .stg-barfill, .stg-toast { transition: none; } }
`;

/** The browser script for one studio; `engine` is "sqlite", "mysql" or "postgres". */
export function studioStagingScript(engine) {
  return `(${studioStagingClient.toString()})(${JSON.stringify({ engine })});`;
}
