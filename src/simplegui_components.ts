// SimpleGUI enterprise component suite.
//
// Only components that did NOT already exist in SimpleWindow live here (everything MUI/Ant-like that was already
// covered — tabs, stepper, breadcrumbs, pagination, rating, sliders, date/time pickers, transfer list, tree view,
// accordion, timeline, data table, kanban, command palette, toasts/dialogs ... — is intentionally not duplicated).
//
// Architecture: every component is a `<div data-sgu="type" data-cfg="{json}">` rendered through the existing
// `raw_html` control. The client runtime below (`SimpleUI`) hydrates those nodes (also after later HTML updates)
// and talks back to Bun with the same `on_<id>_change` / `on_<id>_click` IPC every other control uses.
//
// NOTE: the client code is a String.raw template: never use backticks, `${ }` or a closing script tag inside it.

export type UIComponentType =
    | "skeleton" | "paper" | "emptyState" | "result" | "appBar" | "bottomNav" | "fab" | "speedDial" | "backToTop"
    | "drawer" | "backdrop" | "popover" | "popconfirm" | "tour" | "autocomplete" | "cascader" | "treeSelect"
    | "mentions" | "signaturePad" | "richText" | "copyButton" | "loadingButton" | "avatarGroup" | "descriptions"
    | "statistic" | "countdown" | "watermark" | "masonry" | "imageCompare" | "marquee" | "typography" | "chips"
    | "virtualList" | "anchor" | "scrollProgress";

/** Default `[width, height]` for each component (overridable with `width` / `height` options). */
export const UI_DEFAULT_SIZES: Record<UIComponentType, [number, number]> = {
    skeleton: [320, 60], paper: [320, 120], emptyState: [360, 220], result: [460, 260], appBar: [700, 56],
    bottomNav: [420, 56], fab: [56, 56], speedDial: [56, 56], backToTop: [48, 8], drawer: [140, 38], backdrop: [120, 8],
    popover: [140, 38], popconfirm: [140, 38], tour: [120, 8], autocomplete: [320, 40], cascader: [320, 40],
    treeSelect: [320, 40], mentions: [360, 90], signaturePad: [420, 180], richText: [520, 220], copyButton: [140, 36],
    loadingButton: [150, 38], avatarGroup: [260, 44], descriptions: [520, 170], statistic: [200, 80], countdown: [260, 80],
    watermark: [420, 160], masonry: [520, 300], imageCompare: [420, 260], marquee: [520, 36], typography: [420, 32],
    chips: [420, 36], virtualList: [360, 280], anchor: [200, 150], scrollProgress: [200, 6],
};

const UI_CSS = String.raw`
.sgu{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--theme-fg,#e2e8f0);font-size:13px;line-height:1.4}
.sgu *{box-sizing:border-box}
.sgu button{font-family:inherit}
.sgu-surface{background:var(--card-bg,#1e293b);border:1px solid rgba(148,163,184,.22);border-radius:10px}
.sgu-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid transparent;border-radius:8px;padding:0 16px;height:36px;font-weight:700;font-size:13px;cursor:pointer;color:#fff;background:var(--accent,#38bdf8);transition:filter .15s,transform .1s,box-shadow .15s;box-shadow:0 2px 6px rgba(0,0,0,.28);user-select:none}
.sgu-btn:hover{filter:brightness(1.12)}.sgu-btn:active{transform:scale(.97)}
.sgu-btn[disabled]{opacity:.55;cursor:not-allowed;pointer-events:none}
.sgu-btn.sgu-outlined{background:transparent;color:var(--sgu-c,var(--accent,#38bdf8));border-color:var(--sgu-c,var(--accent,#38bdf8));box-shadow:none}
.sgu-btn.sgu-text{background:transparent;color:var(--sgu-c,var(--accent,#38bdf8));box-shadow:none}
.sgu-btn.sgu-ghost{background:transparent;color:inherit;box-shadow:none;border-color:rgba(148,163,184,.3)}
.sgu-spin{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:sgu-rot .7s linear infinite;display:inline-block}
.sgu-outlined .sgu-spin,.sgu-text .sgu-spin{border-color:rgba(148,163,184,.35);border-top-color:var(--sgu-c,var(--accent,#38bdf8))}
@keyframes sgu-rot{to{transform:rotate(360deg)}}
@keyframes sgu-pulse{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes sgu-wave{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}
@keyframes sgu-pop{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}
@keyframes sgu-fade{from{opacity:0}to{opacity:1}}
@keyframes sgu-marq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
/* skeleton */
.sgu-skel{background:rgba(148,163,184,.25);display:block;margin-bottom:8px}
.sgu-skel.sgu-text{border-radius:4px}.sgu-skel.sgu-circular{border-radius:50%}.sgu-skel.sgu-rect{border-radius:0}.sgu-skel.sgu-rounded{border-radius:10px}
.sgu-anim-pulse{animation:sgu-pulse 1.5s ease-in-out infinite}
.sgu-anim-wave{background-image:linear-gradient(90deg,transparent,rgba(255,255,255,.14),transparent);background-size:200px 100%;background-repeat:no-repeat;animation:sgu-wave 1.6s linear infinite}
/* paper / empty / result */
.sgu-paper{padding:16px}.sgu-paper h4{margin:0 0 6px;font-size:15px}
.sgu-center{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:8px;height:100%;padding:12px}
.sgu-center .sgu-big{font-size:46px;line-height:1}
.sgu-center h3{margin:0;font-size:17px}.sgu-center p{margin:0;opacity:.7;max-width:380px}
.sgu-actions{display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;justify-content:center}
/* app bar */
.sgu-appbar{display:flex;align-items:center;gap:6px;height:100%;padding:0 14px;background:var(--sgu-c,var(--accent,#0284c7));color:#fff;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.sgu-appbar .sgu-title{font-weight:800;font-size:16px;margin-right:12px;flex:0 0 auto}
.sgu-appbar .sgu-grow{flex:1}
.sgu-appbar button{background:transparent;border:0;color:inherit;cursor:pointer;padding:6px 10px;border-radius:8px;font-weight:600;font-size:13px;position:relative}
.sgu-appbar button:hover,.sgu-appbar button.sgu-on{background:rgba(255,255,255,.2)}
.sgu-appbar input{background:rgba(255,255,255,.18);border:0;color:#fff;border-radius:8px;padding:6px 10px;outline:none;width:150px}
.sgu-appbar input::placeholder{color:rgba(255,255,255,.75)}
.sgu-badge{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;border-radius:8px;background:#ef4444;color:#fff;font-size:10px;line-height:16px;text-align:center;padding:0 4px}
/* bottom nav */
.sgu-bnav{display:flex;height:100%;border-radius:10px;overflow:hidden}
.sgu-bnav button{flex:1;background:transparent;border:0;color:inherit;opacity:.7;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:11px;position:relative;transition:all .15s}
.sgu-bnav button .sgu-i{font-size:20px}
.sgu-bnav button.sgu-on{opacity:1;color:var(--accent,#38bdf8)}.sgu-bnav button.sgu-on .sgu-i{transform:translateY(-2px) scale(1.12)}
.sgu-bnav button:hover{background:rgba(148,163,184,.12)}
/* fab + speed dial */
.sgu-fab{border:0;border-radius:50%;width:56px;height:56px;color:#fff;background:var(--sgu-c,var(--accent,#38bdf8));font-size:22px;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.4);display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .15s,box-shadow .15s}
.sgu-fab:hover{transform:scale(1.07);box-shadow:0 10px 22px rgba(0,0,0,.45)}
.sgu-fab.sgu-ext{width:auto;border-radius:28px;padding:0 20px;font-size:14px;font-weight:700}
.sgu-fab.sgu-sm{width:40px;height:40px;font-size:17px}.sgu-fab.sgu-lg{width:72px;height:72px;font-size:28px}
.sgu-dial{position:relative;width:56px;height:56px;display:inline-block}
.sgu-dial .sgu-acts{position:absolute;display:flex;gap:10px;align-items:center;pointer-events:none}
.sgu-dial.sgu-up .sgu-acts{bottom:64px;left:8px;flex-direction:column-reverse}
.sgu-dial.sgu-down .sgu-acts{top:64px;left:8px;flex-direction:column}
.sgu-dial.sgu-left .sgu-acts{right:64px;top:8px;flex-direction:row-reverse}
.sgu-dial.sgu-right .sgu-acts{left:64px;top:8px;flex-direction:row}
.sgu-dial .sgu-act{display:flex;align-items:center;gap:8px;opacity:0;transform:scale(.4);transition:all .18s;pointer-events:none}
.sgu-dial.sgu-open .sgu-act{opacity:1;transform:none;pointer-events:auto}
.sgu-dial .sgu-act button{width:40px;height:40px;border-radius:50%;border:0;background:var(--card-bg,#1e293b);color:inherit;cursor:pointer;font-size:17px;box-shadow:0 4px 10px rgba(0,0,0,.4)}
.sgu-dial .sgu-act button:hover{background:var(--accent,#38bdf8);color:#fff}
.sgu-dial .sgu-act span{background:rgba(15,23,42,.92);color:#f8fafc;padding:3px 8px;border-radius:6px;font-size:12px;white-space:nowrap}
.sgu-dial .sgu-main{transition:transform .2s}.sgu-dial.sgu-open .sgu-main{transform:rotate(45deg)}
.sgu-top{position:fixed;right:24px;bottom:24px;z-index:99990;opacity:0;pointer-events:none;transform:translateY(12px);transition:all .2s}
.sgu-top.sgu-show{opacity:1;pointer-events:auto;transform:none}
/* overlays */
.sgu-ov{position:fixed;inset:0;z-index:99980;display:none}
.sgu-ov.sgu-open{display:block}
.sgu-scrim{position:absolute;inset:0;background:rgba(2,6,23,.55);animation:sgu-fade .18s}
.sgu-blur .sgu-scrim{backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}
.sgu-panel{position:absolute;background:var(--card-bg,#1e293b);color:var(--theme-fg,#e2e8f0);box-shadow:0 20px 50px rgba(0,0,0,.55);display:flex;flex-direction:column;transition:transform .22s cubic-bezier(.2,.8,.2,1)}
.sgu-panel.sgu-left{left:0;top:0;bottom:0;width:var(--sgu-w,300px);transform:translateX(-102%)}
.sgu-panel.sgu-right{right:0;top:0;bottom:0;width:var(--sgu-w,300px);transform:translateX(102%)}
.sgu-panel.sgu-top{left:0;right:0;top:0;height:var(--sgu-w,260px);transform:translateY(-102%)}
.sgu-panel.sgu-bottom{left:0;right:0;bottom:0;height:var(--sgu-w,260px);transform:translateY(102%);border-radius:16px 16px 0 0}
.sgu-ov.sgu-shown .sgu-panel{transform:none}
.sgu-panel header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.2);font-weight:800;font-size:15px}
.sgu-panel .sgu-body{padding:14px 16px;overflow:auto;flex:1}
.sgu-x{background:transparent;border:0;color:inherit;font-size:20px;cursor:pointer;opacity:.7;line-height:1}.sgu-x:hover{opacity:1}
.sgu-nav{display:flex;flex-direction:column;gap:2px;padding:8px}
.sgu-nav button{display:flex;align-items:center;gap:12px;background:transparent;border:0;color:inherit;padding:10px 12px;border-radius:8px;cursor:pointer;text-align:left;font-size:14px}
.sgu-nav button:hover{background:rgba(148,163,184,.16)}.sgu-nav button.sgu-on{background:rgba(56,189,248,.18);color:var(--accent,#38bdf8);font-weight:700}
.sgu-bd{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;color:#fff;font-weight:600}
.sgu-bd .sgu-spin{width:44px;height:44px;border-width:4px}
/* popups */
.sgu-pop{position:fixed;z-index:99995;background:var(--card-bg,#1e293b);color:var(--theme-fg,#e2e8f0);border:1px solid rgba(148,163,184,.28);border-radius:10px;box-shadow:0 14px 34px rgba(0,0,0,.5);animation:sgu-pop .14s ease-out;font-family:system-ui,-apple-system,sans-serif;font-size:13px}
.sgu-pop.sgu-pad{padding:12px 14px;max-width:320px}
.sgu-pop h4{margin:0 0 4px;font-size:14px}
.sgu-pop .sgu-row{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.sgu-pop .sgu-btn{height:30px;padding:0 12px;font-size:12px}
.sgu-card{display:flex;gap:10px;align-items:flex-start}
/* tour */
.sgu-tour-hl{position:fixed;z-index:99996;border-radius:8px;box-shadow:0 0 0 9999px rgba(2,6,23,.7),0 0 0 3px var(--accent,#38bdf8);pointer-events:none;transition:all .25s}
.sgu-tour-card{max-width:300px}
.sgu-dots{display:flex;gap:4px;margin-right:auto;align-items:center}.sgu-dots i{width:6px;height:6px;border-radius:50%;background:rgba(148,163,184,.4)}.sgu-dots i.sgu-on{background:var(--accent,#38bdf8)}
/* fields */
.sgu-field{position:relative;width:100%}
.sgu-box{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-height:40px;padding:4px 36px 4px 10px;background:var(--card-bg,#1e293b);border:1px solid rgba(148,163,184,.35);border-radius:8px;cursor:text;position:relative;transition:border-color .15s,box-shadow .15s}
.sgu-box:focus-within,.sgu-box.sgu-focus{border-color:var(--accent,#38bdf8);box-shadow:0 0 0 3px rgba(56,189,248,.22)}
.sgu-box input{flex:1;min-width:70px;background:transparent;border:0;outline:0;color:inherit;font-size:13px;padding:6px 0;font-family:inherit}
.sgu-box .sgu-ctl{position:absolute;right:6px;top:0;bottom:0;display:flex;align-items:center;gap:2px}
.sgu-box .sgu-ctl button{background:transparent;border:0;color:inherit;opacity:.6;cursor:pointer;font-size:13px;padding:4px}.sgu-box .sgu-ctl button:hover{opacity:1}
.sgu-lbl{position:absolute;top:-8px;left:8px;background:var(--card-bg,#1e293b);padding:0 5px;font-size:11px;opacity:.8;z-index:1;color:var(--accent,#38bdf8)}
.sgu-list{max-height:260px;overflow:auto;padding:4px}
.sgu-opt{padding:7px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px}
.sgu-opt.sgu-hi,.sgu-opt:hover{background:rgba(56,189,248,.2)}.sgu-opt.sgu-sel{font-weight:700;color:var(--accent,#38bdf8)}
.sgu-opt[aria-disabled=true]{opacity:.4;pointer-events:none}
.sgu-grp{padding:6px 10px 2px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;opacity:.55}
.sgu-none{padding:10px;opacity:.6;text-align:center}
.sgu-opt b{color:var(--accent,#38bdf8)}
.sgu-chip{display:inline-flex;align-items:center;gap:6px;height:var(--sgu-ch,28px);padding:0 10px;border-radius:999px;background:var(--sgu-c,#475569);color:#fff;font-size:12px;font-weight:600;border:1px solid transparent;transition:filter .15s,transform .1s;white-space:nowrap}
.sgu-chip.sgu-outlined{background:transparent;color:var(--sgu-c,#cbd5e1);border-color:var(--sgu-c,#64748b)}
.sgu-chip.sgu-click{cursor:pointer}.sgu-chip.sgu-click:hover{filter:brightness(1.15)}.sgu-chip.sgu-click:active{transform:scale(.95)}
.sgu-chip.sgu-sm{--sgu-ch:22px;font-size:11px;padding:0 8px}
.sgu-chip.sgu-selected{box-shadow:0 0 0 2px var(--accent,#38bdf8)}
.sgu-chip .sgu-av{width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.28);display:inline-flex;align-items:center;justify-content:center;font-size:10px;margin-left:-6px;overflow:hidden}
.sgu-chip .sgu-av img{width:100%;height:100%;object-fit:cover}
.sgu-chip .sgu-del{background:rgba(255,255,255,.25);border:0;color:inherit;border-radius:50%;width:16px;height:16px;font-size:11px;line-height:1;cursor:pointer;padding:0;margin-right:-4px}
.sgu-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sgu-casc{display:flex}.sgu-casc .sgu-col{min-width:150px;max-height:240px;overflow:auto;padding:4px;border-right:1px solid rgba(148,163,184,.2)}.sgu-casc .sgu-col:last-child{border-right:0}
.sgu-arrow{opacity:.5;margin-left:auto;font-size:11px}
.sgu-tree{padding:4px;max-height:280px;overflow:auto;min-width:240px}
.sgu-node{display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:6px;cursor:pointer}.sgu-node:hover{background:rgba(148,163,184,.16)}.sgu-node.sgu-sel{background:rgba(56,189,248,.2);font-weight:700}
.sgu-node .sgu-tw{width:14px;text-align:center;opacity:.7;font-size:10px}
.sgu-ta{width:100%;height:100%;resize:none;background:var(--card-bg,#1e293b);color:inherit;border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:10px;font-family:inherit;font-size:13px;outline:0}
.sgu-ta:focus{border-color:var(--accent,#38bdf8);box-shadow:0 0 0 3px rgba(56,189,248,.22)}
.sgu-mention{color:var(--accent,#38bdf8);font-weight:700}
/* signature + rich text */
.sgu-sig{display:flex;flex-direction:column;height:100%;gap:6px}.sgu-sig canvas{flex:1;width:100%;min-height:0;background:#fff;border-radius:8px;cursor:crosshair;touch-action:none;border:1px solid rgba(148,163,184,.35)}
.sgu-sig .sgu-bar{display:flex;justify-content:space-between;align-items:center;font-size:12px;opacity:.85}
.sgu-rt{display:flex;flex-direction:column;height:100%;border:1px solid rgba(148,163,184,.35);border-radius:8px;overflow:hidden;background:var(--card-bg,#1e293b)}
.sgu-rt .sgu-tb{display:flex;flex-wrap:wrap;gap:2px;padding:4px;border-bottom:1px solid rgba(148,163,184,.25);background:rgba(148,163,184,.08)}
.sgu-rt .sgu-tb button{background:transparent;border:0;color:inherit;min-width:30px;height:28px;border-radius:6px;cursor:pointer;font-size:13px}.sgu-rt .sgu-tb button:hover{background:rgba(148,163,184,.25)}
.sgu-rt .sgu-tb i{width:1px;background:rgba(148,163,184,.3);margin:3px 4px}
.sgu-rt .sgu-ed{flex:1;padding:10px 12px;overflow:auto;outline:0;line-height:1.55}.sgu-rt .sgu-ed:empty:before{content:attr(data-ph);opacity:.45}
.sgu-rt .sgu-ed blockquote{border-left:3px solid var(--accent,#38bdf8);margin:6px 0;padding:2px 12px;opacity:.85}
/* data display */
.sgu-ag{display:flex;align-items:center}
.sgu-avatar{width:var(--sgu-s,36px);height:var(--sgu-s,36px);border-radius:50%;background:var(--sgu-c,#6366f1);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:calc(var(--sgu-s,36px)*.34);letter-spacing:-.4px;border:2px solid var(--card-bg,#1e293b);overflow:hidden;flex:0 0 auto}
.sgu-avatar img{width:100%;height:100%;object-fit:cover}
.sgu-ag .sgu-avatar+.sgu-avatar{margin-left:calc(var(--sgu-s,36px)*-.3)}
.sgu-desc{width:100%}.sgu-desc h4{margin:0 0 8px;font-size:15px}
.sgu-desc table{width:100%;border-collapse:collapse}.sgu-desc th,.sgu-desc td{padding:8px 12px;text-align:left;vertical-align:top}
.sgu-desc.sgu-bordered th,.sgu-desc.sgu-bordered td{border:1px solid rgba(148,163,184,.25)}.sgu-desc th{opacity:.7;font-weight:600;white-space:nowrap;background:rgba(148,163,184,.08)}
.sgu-stat{display:flex;flex-direction:column;gap:2px;height:100%;justify-content:center}.sgu-stat .sgu-t{font-size:12px;opacity:.7;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.sgu-stat .sgu-v{font-size:30px;font-weight:800;color:var(--sgu-c,inherit);font-variant-numeric:tabular-nums}.sgu-stat .sgu-tr{font-size:12px;font-weight:700}
.sgu-up{color:#22c55e}.sgu-dn{color:#ef4444}
.sgu-wm{position:relative;height:100%}.sgu-wm .sgu-wl{position:absolute;inset:0;pointer-events:none;z-index:2}
.sgu-wm .sgu-wc{height:100%;padding:12px}
.sgu-mas{column-gap:var(--sgu-g,12px);height:100%;overflow:auto}.sgu-mas>div{break-inside:avoid;margin-bottom:var(--sgu-g,12px);padding:12px;border-radius:10px;background:var(--card-bg,#1e293b);border:1px solid rgba(148,163,184,.2)}
.sgu-mas img{width:100%;display:block;border-radius:8px}
.sgu-cmp{position:relative;width:100%;height:100%;overflow:hidden;border-radius:10px;user-select:none;cursor:ew-resize;touch-action:none}
.sgu-cmp img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
.sgu-cmp .sgu-hd{position:absolute;top:0;bottom:0;width:3px;background:#fff;box-shadow:0 0 8px rgba(0,0,0,.6)}
.sgu-cmp .sgu-hd:after{content:"\2194";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:34px;height:34px;border-radius:50%;background:#fff;color:#0f172a;display:flex;align-items:center;justify-content:center;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.5)}
.sgu-cmp .sgu-tag{position:absolute;top:8px;background:rgba(15,23,42,.8);color:#fff;padding:2px 8px;border-radius:6px;font-size:11px}
.sgu-mq{overflow:hidden;height:100%;display:flex;align-items:center;border-radius:8px;background:var(--card-bg,#1e293b);border:1px solid rgba(148,163,184,.2)}
.sgu-mq .sgu-trk{display:flex;gap:36px;white-space:nowrap;animation:sgu-marq var(--sgu-d,20s) linear infinite;padding-left:36px;font-weight:600}
.sgu-mq:hover .sgu-trk.sgu-pause{animation-play-state:paused}
.sgu-vl{height:100%;display:flex;flex-direction:column;gap:6px}.sgu-vl input{background:var(--card-bg,#1e293b);color:inherit;border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:7px 10px;outline:0;font-size:13px}
.sgu-vl .sgu-vp{flex:1;overflow:auto;position:relative;border:1px solid rgba(148,163,184,.25);border-radius:8px;background:var(--card-bg,#1e293b)}
.sgu-vl .sgu-it{position:absolute;left:0;right:0;display:flex;align-items:center;gap:10px;padding:0 12px;cursor:pointer;border-bottom:1px solid rgba(148,163,184,.1)}.sgu-vl .sgu-it:hover{background:rgba(148,163,184,.14)}.sgu-vl .sgu-it.sgu-sel{background:rgba(56,189,248,.2)}
.sgu-vl .sgu-it small{opacity:.6;margin-left:auto}
.sgu-vl .sgu-cnt{font-size:11px;opacity:.6}
.sgu-anc{display:flex;flex-direction:column;border-left:2px solid rgba(148,163,184,.3)}.sgu-anc.sgu-h{flex-direction:row;border-left:0;border-bottom:2px solid rgba(148,163,184,.3)}
.sgu-anc a{padding:5px 12px;color:inherit;opacity:.7;text-decoration:none;cursor:pointer;margin-left:-2px;border-left:2px solid transparent}.sgu-anc.sgu-h a{margin:0 0 -2px;border-left:0;border-bottom:2px solid transparent}
.sgu-anc a:hover{opacity:1}.sgu-anc a.sgu-on{opacity:1;color:var(--accent,#38bdf8);border-color:var(--accent,#38bdf8);font-weight:700}
.sgu-sp{position:fixed;left:0;top:0;height:4px;width:0;background:var(--accent,#38bdf8);z-index:99999;transition:width .08s}
.sgu-typo{margin:0}
`;

const UI_JS = String.raw`
(function(){
if (window.SimpleUI) return;
var U = window.SimpleUI = { reg: {}, inst: {}, version: "1.0" };
U.colors = { primary: "#0ea5e9", secondary: "#8b5cf6", success: "#22c55e", error: "#ef4444", warning: "#f59e0b", info: "#06b6d4", default: "#475569", dark: "#0f172a" };
U.icons = { home: "\u2302", search: "\u{1F50D}", add: "+", plus: "+", close: "\u2715", menu: "\u2630", edit: "\u270E", delete: "\u{1F5D1}", save: "\u{1F4BE}", share: "\u{1F517}", copy: "\u{1F4CB}", print: "\u{1F5A8}", settings: "\u2699", user: "\u{1F464}", mail: "\u2709", bell: "\u{1F514}", star: "\u2605", heart: "\u2665", up: "\u2191", down: "\u2193", check: "\u2713", info: "\u2139", warning: "\u26A0", error: "\u26D4", folder: "\u{1F4C1}", file: "\u{1F4C4}", image: "\u{1F5BC}", chat: "\u{1F4AC}", cart: "\u{1F6D2}", help: "?", download: "\u2B07", upload: "\u2B06", refresh: "\u21BB", back: "\u2190", forward: "\u2192", dashboard: "\u25A6", chart: "\u{1F4CA}", calendar: "\u{1F4C5}", location: "\u{1F4CD}", favorite: "\u2665", send: "\u27A4" };
function ic(n) { return (n && U.icons[n]) || n || ""; }
function col(c) { return U.colors[c] || c || U.colors.primary; }
function E(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
function on(el, ev, fn) { el.addEventListener(ev, fn); return el; }
function norm(o) { if (o === null || o === undefined) return { label: "", value: "" }; if (typeof o === "object") { var v = o.value !== undefined ? o.value : o.label; return { label: o.label !== undefined ? String(o.label) : String(v), value: v, group: o.group, disabled: !!o.disabled, icon: o.icon, children: o.children, raw: o }; } return { label: String(o), value: o }; }
function root(el) { var r = el.closest("[id]"); return r; }
function emit(el, kind, val) { var r = root(el); if (!r) return; var f = window["on_" + r.id + "_" + kind]; if (typeof f === "function") { try { f(val); } catch (e) {} } }
function btn(label, cls, fn) { var b = E("button", "sgu-btn " + (cls || ""), label); b.type = "button"; if (fn) on(b, "click", fn); return b; }
function avatar(a, size) { var v = E("span", "sgu-avatar"); v.style.setProperty("--sgu-s", (size || 36) + "px"); v.style.setProperty("--sgu-c", a.color || colorFor(a.name || "")); if (a.src) { var im = E("img"); im.src = a.src; im.alt = a.name || ""; v.appendChild(im); } else v.textContent = initials(a.name || a.label || "?"); if (a.name) v.title = a.name; return v; }
function initials(n) { var p = String(n).trim().split(/\s+/); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
function colorFor(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return "hsl(" + (Math.abs(h) % 360) + ",55%,45%)"; }
function setH(el, c) { if (c.height) el.style.height = typeof c.height === "number" ? c.height + "px" : c.height; }
function reEsc(s) { var o = ""; for (var i = 0; i < s.length; i++) { o += ".*+?^$(){}|[]\\".indexOf(s[i]) >= 0 ? "\\" + s[i] : s[i]; } return o; }
function nt(n) { if (n && n.querySelectorAll) Array.prototype.forEach.call(n.querySelectorAll("button"), function (b) { b.setAttribute("data-no-theme", "1"); }); return n; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]; }); }

var openPops = [];
function closePops(except) { openPops.slice().forEach(function (p) { if (p !== except) p.close(); }); }
document.addEventListener("mousedown", function (e) { openPops.slice().forEach(function (p) { if (!p.node.contains(e.target) && !(p.anchor && p.anchor.contains(e.target))) p.close(); }); }, true);
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePops(); });
window.addEventListener("resize", function () { closePops(); });
function popup(anchor, node, o) {
    o = o || {};
    var p = { node: node, anchor: anchor, close: function () { if (node.parentNode) node.parentNode.removeChild(node); var i = openPops.indexOf(p); if (i >= 0) openPops.splice(i, 1); if (o.onClose) o.onClose(); } };
    nt(node); node.classList.add("sgu-pop"); node.style.visibility = "hidden"; document.body.appendChild(node);
    var r = anchor.getBoundingClientRect(), pw = node.offsetWidth, ph = node.offsetHeight, pl = o.placement || "bottom-start", x, y, vw = window.innerWidth, vh = window.innerHeight;
    if (o.matchWidth) { node.style.minWidth = r.width + "px"; pw = node.offsetWidth; }
    if (pl.indexOf("top") === 0) y = r.top - ph - 6; else if (pl.indexOf("bottom") === 0) y = r.bottom + 6; else y = r.top;
    if (pl.indexOf("left") === 0) { x = r.left - pw - 6; y = r.top; } else if (pl.indexOf("right") === 0) { x = r.right + 6; y = r.top; }
    else if (/-end$/.test(pl)) x = r.right - pw; else if (/-center$|^top$|^bottom$/.test(pl)) x = r.left + (r.width - pw) / 2; else x = r.left;
    if (y + ph > vh - 6 && r.top - ph - 6 > 0) y = r.top - ph - 6;
    x = Math.max(6, Math.min(x, vw - pw - 6)); y = Math.max(6, Math.min(y, vh - ph - 6));
    node.style.left = x + "px"; node.style.top = y + "px"; node.style.visibility = "";
    if (!o.keep) closePops(p);
    openPops.push(p); return p;
}
U.popup = popup;

function hl(text, q) { var s = E("span"); if (!q) { s.textContent = text; return s; } var i = text.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) { s.textContent = text; return s; } s.appendChild(document.createTextNode(text.slice(0, i))); s.appendChild(E("b", "", text.slice(i, i + q.length))); s.appendChild(document.createTextNode(text.slice(i + q.length))); return s; }

var R = U.reg;
R.skeleton = function (el, c) {
    var n = c.lines || 1, v = c.variant || "text";
    for (var i = 0; i < n; i++) {
        var s = E("span", "sgu-skel sgu-" + v + " sgu-anim-" + (c.animation === "wave" ? "wave" : "pulse"));
        var size = c.size || 44;
        if (v === "circular") { s.style.width = size + "px"; s.style.height = size + "px"; }
        else { s.style.width = c.width ? (typeof c.width === "number" ? c.width + "px" : c.width) : (i === n - 1 && n > 1 ? "60%" : "100%"); s.style.height = (c.height || (v === "text" ? 14 : 90)) + "px"; }
        el.appendChild(s);
    }
};
R.paper = function (el, c) {
    var d = E("div", "sgu-paper sgu-surface"); var el2 = c.elevation === undefined ? 2 : c.elevation;
    d.style.boxShadow = el2 ? "0 " + (el2 * 2) + "px " + (el2 * 6) + "px rgba(0,0,0," + Math.min(.15 + el2 * .04, .55) + ")" : "none";
    if (c.outlined) d.style.boxShadow = "none"; else if (!el2) d.style.border = "0";
    if (c.radius !== undefined) d.style.borderRadius = c.radius + "px"; if (c.padding !== undefined) d.style.padding = c.padding + "px";
    if (c.background) d.style.background = c.background; d.style.height = "100%"; d.style.overflow = "auto";
    if (c.title) d.appendChild(E("h4", "", c.title));
    if (c.html) { var b = E("div"); b.innerHTML = c.html; d.appendChild(b); } else if (c.text) d.appendChild(E("div", "", c.text));
    el.appendChild(d);
};
R.emptyState = function (el, c) {
    var d = E("div", "sgu-center sgu-surface"); d.appendChild(E("div", "sgu-big", ic(c.icon || "\u{1F4ED}"))); d.appendChild(E("h3", "", c.title || "Nothing here yet"));
    if (c.text) d.appendChild(E("p", "", c.text));
    var acts = c.actions || (c.actionLabel ? [c.actionLabel] : []);
    if (acts.length) { var a = E("div", "sgu-actions"); acts.forEach(function (x, i) { var o = norm(x); a.appendChild(btn(o.label, i ? "sgu-outlined" : "", function () { emit(el, "click", o.value); })); }); d.appendChild(a); }
    d.style.height = "100%"; el.appendChild(d);
};
R.result = function (el, c) {
    var st = c.status || "info", m = { success: ["\u2705", "success"], error: ["\u274C", "error"], warning: ["\u26A0\uFE0F", "warning"], info: ["\u2139\uFE0F", "info"], "404": ["404", "warning"], "403": ["\u26D4", "error"], "500": ["\u{1F4A5}", "error"] }[st] || ["\u2139\uFE0F", "info"];
    var d = E("div", "sgu-center sgu-surface"); var big = E("div", "sgu-big", c.icon ? ic(c.icon) : m[0]); if (/^\d+$/.test(m[0])) { big.style.fontWeight = "900"; big.style.color = col(m[1]); }
    d.appendChild(big); d.appendChild(E("h3", "", c.title || st)); if (c.subtitle || c.text) d.appendChild(E("p", "", c.subtitle || c.text));
    var acts = c.actions || []; if (acts.length) { var a = E("div", "sgu-actions"); acts.forEach(function (x, i) { var o = norm(x); var b = btn(o.label, i ? "sgu-outlined" : "", function () { emit(el, "click", o.value); }); b.style.setProperty("--sgu-c", col(m[1])); if (!i) b.style.background = col(m[1]); a.appendChild(b); }); d.appendChild(a); }
    d.style.height = "100%"; el.appendChild(d);
};
R.appBar = function (el, c) {
    var d = E("div", "sgu-appbar"); d.style.setProperty("--sgu-c", col(c.color || "")); if (c.color) d.style.background = col(c.color);
    if (c.menuButton !== false && c.menuButton) { var mb = E("button", "", ic("menu")); mb.title = "Menu"; on(mb, "click", function () { emit(el, "click", "menu"); }); d.appendChild(mb); }
    if (c.logo) d.appendChild(E("span", "", ic(c.logo))); d.appendChild(E("span", "sgu-title", c.title || ""));
    var btns = [];
    (c.items || []).forEach(function (x) { var o = norm(x); var raw = o.raw || {}; var b = E("button", "", (raw.icon ? ic(raw.icon) + " " : "") + o.label); on(b, "click", function () { btns.forEach(function (k) { k.classList.remove("sgu-on"); }); if (c.selectable !== false) b.classList.add("sgu-on"); emit(el, "click", o.value); }); if (c.active !== undefined && String(c.active) === String(o.value)) b.classList.add("sgu-on"); btns.push(b); d.appendChild(b); });
    d.appendChild(E("span", "sgu-grow"));
    if (c.search) { var si = E("input"); si.placeholder = c.searchPlaceholder || "Search..."; on(si, "keydown", function (e) { if (e.key === "Enter") emit(el, "enter", si.value); }); on(si, "input", function () { emit(el, "change", si.value); }); d.appendChild(si); }
    (c.actions || []).forEach(function (x) { var o = norm(x); var raw = o.raw || {}; var b = E("button", "", ic(raw.icon || o.label)); b.title = o.label; if (raw.badge) b.appendChild(E("span", "sgu-badge", raw.badge)); on(b, "click", function () { emit(el, "click", o.value); }); d.appendChild(b); });
    d.style.height = "100%"; el.appendChild(d);
};
R.bottomNav = function (el, c) {
    var d = E("div", "sgu-bnav sgu-surface"), cur = c.value, btns = [];
    (c.items || []).forEach(function (x, i) { var o = norm(x); var raw = o.raw || {}; var b = E("button"); b.appendChild(E("span", "sgu-i", ic(raw.icon || "\u25CF"))); if (c.showLabels !== false) b.appendChild(E("span", "", o.label)); if (raw.badge) b.appendChild(E("span", "sgu-badge", raw.badge));
        if (cur === undefined && i === 0) cur = o.value; if (String(cur) === String(o.value)) b.classList.add("sgu-on");
        on(b, "click", function () { cur = o.value; btns.forEach(function (k) { k.classList.remove("sgu-on"); }); b.classList.add("sgu-on"); emit(el, "change", o.value); }); btns.push(b); d.appendChild(b); });
    d.style.height = "100%"; el.appendChild(d);
    return { setValue: function (v) { (c.items || []).forEach(function (x, i) { btns[i].classList.toggle("sgu-on", String(norm(x).value) === String(v)); }); } };
};
R.fab = function (el, c) {
    var b = E("button", "sgu-fab" + (c.label ? " sgu-ext" : "") + (c.size === "small" ? " sgu-sm" : c.size === "large" ? " sgu-lg" : "")); b.type = "button"; b.style.setProperty("--sgu-c", col(c.color || ""));
    b.appendChild(E("span", "", ic(c.icon || "add"))); if (c.label) b.appendChild(E("span", "", c.label)); if (c.tooltip) b.title = c.tooltip; if (c.disabled) b.disabled = true;
    on(b, "click", function () { emit(el, "click", true); }); el.appendChild(b);
};
R.speedDial = function (el, c) {
    var d = E("div", "sgu-dial sgu-" + (c.direction || "up")), acts = E("div", "sgu-acts"), main = E("button", "sgu-fab sgu-main"); main.type = "button"; main.style.setProperty("--sgu-c", col(c.color || "")); main.textContent = ic(c.icon || "add");
    var order = (c.direction === "down" || c.direction === "right") ? 1 : 1;
    (c.actions || []).forEach(function (x, i) { var o = norm(x); var raw = o.raw || {}; var a = E("div", "sgu-act"); a.style.transitionDelay = (i * 30 * order) + "ms"; var b = E("button", "", ic(raw.icon || o.label[0])); b.title = o.label; var t = E("span", "", o.label); if (c.direction === "left" || c.direction === "right") { a.appendChild(b); } else { a.appendChild(b); a.appendChild(t); } on(b, "click", function () { d.classList.remove("sgu-open"); emit(el, "click", o.value); }); acts.appendChild(a); });
    on(main, "click", function () { d.classList.toggle("sgu-open"); emit(el, "change", d.classList.contains("sgu-open")); });
    document.addEventListener("mousedown", function (e) { if (!d.contains(e.target)) d.classList.remove("sgu-open"); });
    d.appendChild(acts); d.appendChild(main); el.appendChild(d);
    return { open: function () { d.classList.add("sgu-open"); }, close: function () { d.classList.remove("sgu-open"); }, toggle: function () { d.classList.toggle("sgu-open"); } };
};
R.backToTop = function (el, c) {
    var b = E("button", "sgu-fab sgu-top sgu-sm", ic(c.icon || "up")); b.type = "button"; b.title = c.tooltip || "Back to top"; b.style.setProperty("--sgu-c", col(c.color || "")); var th = c.threshold || 200, last = null;
    if (c.right !== undefined) b.style.right = c.right + "px"; if (c.bottom !== undefined) b.style.bottom = c.bottom + "px";
    window.addEventListener("scroll", function (e) { var t = e.target === document ? (document.scrollingElement || document.documentElement) : e.target; if (t && t.scrollTop > th) { last = t; b.classList.add("sgu-show"); } else if (t === last) { b.classList.remove("sgu-show"); } }, true);
    on(b, "click", function () { var t = last || document.scrollingElement || document.documentElement; t.scrollTo({ top: 0, behavior: "smooth" }); emit(el, "click", true); });
    el.appendChild(b);
};
R.scrollProgress = function (el, c) {
    var bar = E("div", "sgu-sp"); if (c.color) bar.style.background = col(c.color); if (c.height) bar.style.height = c.height + "px"; if (c.position === "bottom") { bar.style.top = "auto"; bar.style.bottom = "0"; }
    window.addEventListener("scroll", function (e) { var t = e.target === document ? (document.scrollingElement || document.documentElement) : e.target; var max = t.scrollHeight - t.clientHeight; if (max > 0) { bar.style.width = Math.min(100, t.scrollTop / max * 100) + "%"; emit(el, "change", Math.round(t.scrollTop / max * 100)); } }, true);
    el.appendChild(bar);
};

function overlay(el, c, kind) {
    var ov = E("div", "sgu-ov" + (c.blur === false ? "" : " sgu-blur")), scrim = E("div", "sgu-scrim"); ov.appendChild(scrim); el.appendChild(ov);
    var api = { ov: ov, isOpen: false, open: function () { if (api.isOpen) return; api.isOpen = true; ov.classList.add("sgu-open"); void ov.offsetWidth; ov.classList.add("sgu-shown"); emit(el, "change", true); if (api.onOpen) api.onOpen(); }, close: function () { if (!api.isOpen) return; api.isOpen = false; ov.classList.remove("sgu-shown"); setTimeout(function () { if (!api.isOpen) ov.classList.remove("sgu-open"); }, 230); emit(el, "change", false); }, toggle: function () { api.isOpen ? api.close() : api.open(); } };
    if (!c.persistent) on(scrim, "click", api.close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && api.isOpen && !c.persistent && ov.isConnected) api.close(); });
    return api;
}
R.drawer = function (el, c) {
    var api = overlay(el, c), anchor = c.anchor || "left", p = E("aside", "sgu-panel sgu-" + anchor); p.style.setProperty("--sgu-w", (c.width || (anchor === "top" || anchor === "bottom" ? 260 : 300)) + "px");
    var hd = E("header"); hd.appendChild(E("span", "", c.title || "")); var x = E("button", "sgu-x", "\u2715"); on(x, "click", api.close); hd.appendChild(x); p.appendChild(hd);
    if (c.items && c.items.length) { var nav = E("nav", "sgu-nav"); var bs = []; c.items.forEach(function (it) { var o = norm(it); var raw = o.raw || {}; if (raw.divider) { var dv = E("hr"); dv.style.cssText = "border:0;border-top:1px solid rgba(148,163,184,.25);margin:6px 0;width:100%"; nav.appendChild(dv); return; } var b = E("button"); b.appendChild(E("span", "", ic(raw.icon || ""))); b.appendChild(E("span", "", o.label)); if (String(c.active) === String(o.value)) b.classList.add("sgu-on"); on(b, "click", function () { bs.forEach(function (k) { k.classList.remove("sgu-on"); }); b.classList.add("sgu-on"); emit(el, "click", o.value); if (c.closeOnSelect !== false) api.close(); }); bs.push(b); nav.appendChild(b); }); p.appendChild(nav); }
    if (c.html || c.text) { var bd = E("div", "sgu-body"); if (c.html) bd.innerHTML = c.html; else bd.textContent = c.text; p.appendChild(bd); }
    api.ov.appendChild(p);
    if (c.trigger !== false && (c.trigger || c.label !== false)) { var t = btn(c.trigger || c.label || "Open drawer", c.variant || "", api.toggle); t.style.setProperty("--sgu-c", col(c.color || "")); el.appendChild(t); }
    if (c.open) setTimeout(api.open, 30);
    return api;
};
R.backdrop = function (el, c) {
    var api = overlay(el, c); api.ov.style.zIndex = "99999"; var b = E("div", "sgu-bd"); b.style.cssText = "position:absolute;inset:0"; b.appendChild(E("div", "sgu-spin")); if (c.text) b.appendChild(E("div", "", c.text)); api.ov.appendChild(b);
    api.show = api.open; api.hide = api.close; if (c.timeout) { var o = api.open; api.open = function () { o(); setTimeout(api.close, c.timeout); }; }
    if (c.trigger) el.appendChild(btn(c.trigger, "", api.open)); if (c.open) setTimeout(api.open, 30); return api;
};
R.popover = function (el, c) {
    var b = btn(c.label || "Open", c.variant || "", null); b.style.setProperty("--sgu-c", col(c.color || "")); var pop = null, hover = c.trigger === "hover", timer = null;
    function build() { var n = E("div", "sgu-pad"); if (c.avatar || c.name) { var card = E("div", "sgu-card"); card.appendChild(avatar({ name: c.name || c.avatar, src: /^(https?:|data:|\.|\/)/.test(c.avatar || "") ? c.avatar : undefined }, 44)); var tx = E("div"); tx.appendChild(E("h4", "", c.title || c.name || "")); if (c.text) tx.appendChild(E("div", "", c.text)); card.appendChild(tx); n.appendChild(card); } else { if (c.title) n.appendChild(E("h4", "", c.title)); if (c.html) { var h = E("div"); h.innerHTML = c.html; n.appendChild(h); } else if (c.text) n.appendChild(E("div", "", c.text)); } return n; }
    function show() { if (pop) return; clearTimeout(timer); pop = popup(b, build(), { placement: c.placement || "bottom-start", onClose: function () { pop = null; } }); if (hover) { on(pop.node, "mouseenter", function () { clearTimeout(timer); }); on(pop.node, "mouseleave", hide); } }
    function hide() { timer = setTimeout(function () { if (pop) pop.close(); }, 160); }
    if (hover) { on(b, "mouseenter", show); on(b, "mouseleave", hide); } else on(b, "click", function () { pop ? pop.close() : show(); emit(el, "click", true); });
    el.appendChild(b); return { open: show, close: function () { if (pop) pop.close(); } };
};
R.popconfirm = function (el, c) {
    var b = btn(c.label || "Delete", c.variant || "", null); b.style.setProperty("--sgu-c", col(c.color || "error")); if (!c.variant) b.style.background = col(c.color || "error"); var pop;
    on(b, "click", function () {
        var n = E("div", "sgu-pad"); var t = E("div", "sgu-card"); t.appendChild(E("span", "", ic(c.icon || "warning"))); var tx = E("div"); tx.appendChild(E("h4", "", c.title || "Are you sure?")); if (c.text) tx.appendChild(E("div", "", c.text)); t.appendChild(tx); n.appendChild(t);
        var row = E("div", "sgu-row"); row.appendChild(btn(c.cancelText || "Cancel", "sgu-ghost", function () { pop.close(); emit(el, "change", false); })); var ok = btn(c.okText || "Yes", "", function () { pop.close(); emit(el, "change", true); emit(el, "click", true); }); ok.style.background = col(c.color || "error"); row.appendChild(ok); n.appendChild(row);
        pop = popup(b, n, { placement: c.placement || "top-center" });
    });
    el.appendChild(b);
};
R.tour = function (el, c) {
    var step = 0, hlEl = null, card = null, pop = null, active = false, steps = c.steps || [];
    function target(s) { if (!s || !s.target) return null; var t = s.target; try { return document.querySelector(/^[#.\[]/.test(t) ? t : "#" + (window.CSS && CSS.escape ? CSS.escape(t) : t)); } catch (e) { return null; } }
    function clean() { if (hlEl && hlEl.parentNode) hlEl.parentNode.removeChild(hlEl); if (pop) pop.close(); hlEl = null; pop = null; }
    function stop(done) { active = false; clean(); emit(el, done ? "click" : "change", done ? "finish" : { cancelled: true }); }
    function show() {
        clean(); var s = steps[step]; if (!s) return stop(true); var t = target(s);
        if (t && t.scrollIntoView) t.scrollIntoView({ block: "center", behavior: "auto" });
        hlEl = E("div", "sgu-tour-hl"); document.body.appendChild(hlEl);
        var r = t ? t.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 }, pad = 6;
        hlEl.style.left = (r.left - pad) + "px"; hlEl.style.top = (r.top - pad) + "px"; hlEl.style.width = (r.width + pad * 2) + "px"; hlEl.style.height = (r.height + pad * 2) + "px";
        var n = E("div", "sgu-pad sgu-tour-card"); n.appendChild(E("h4", "", s.title || ("Step " + (step + 1)))); if (s.text) n.appendChild(E("div", "", s.text));
        var row = E("div", "sgu-row"); if (c.showProgress !== false) { var dots = E("div", "sgu-dots"); steps.forEach(function (_, i) { dots.appendChild(E("i", i === step ? "sgu-on" : "")); }); row.appendChild(dots); }
        row.appendChild(btn("Skip", "sgu-text", function () { stop(false); })); if (step > 0) row.appendChild(btn("Back", "sgu-ghost", function () { step--; show(); })); row.appendChild(btn(step === steps.length - 1 ? "Finish" : "Next", "", function () { step++; if (step >= steps.length) stop(true); else show(); })); n.appendChild(row);
        var anchor = t || hlEl; pop = popup(t || hlEl, n, { placement: s.placement || "bottom-start", keep: true }); n.style.zIndex = "99997";
    }
    var api = { start: function (i) { step = i || 0; active = true; show(); }, stop: function () { stop(false); } };
    window.addEventListener("resize", function () { if (active) show(); });
    if (c.trigger) el.appendChild(btn(c.trigger, "", function () { api.start(0); })); if (c.open) setTimeout(function () { api.start(0); }, 400);
    return api;
};

function fieldBox(c) { var f = E("div", "sgu-field"); if (c.label) f.appendChild(E("span", "sgu-lbl", c.label)); var box = E("div", "sgu-box"); f.appendChild(box); return { f: f, box: box }; }
R.autocomplete = function (el, c) {
    var opts = (c.options || []).map(norm), multi = !!c.multiple, sel = [], q = "", pop = null, hi = -1, fb = fieldBox(c), box = fb.box, input = E("input"), ctl = E("div", "sgu-ctl"), clr = E("button", "", "\u2715"), arr = E("button", "", "\u25BE"), filtered = [];
    var init = c.value; if (init !== undefined && init !== null && init !== "") sel = multi ? [].concat(init) : [init];
    input.placeholder = c.placeholder || ""; if (c.disabled) input.disabled = true; input.setAttribute("autocomplete", "off"); ctl.appendChild(clr); ctl.appendChild(arr); box.appendChild(input); box.appendChild(ctl);
    function labelOf(v) { var o = opts.filter(function (x) { return String(x.value) === String(v); })[0]; return o ? o.label : String(v); }
    function out() { return multi ? sel.slice() : (sel[0] !== undefined ? sel[0] : ""); }
    function renderChips() {
        Array.prototype.slice.call(box.querySelectorAll(".sgu-chip,.sgu-more")).forEach(function (n) { n.remove(); });
        var lim = c.limitTags && !document.activeElement.isSameNode(input) ? c.limitTags : 999;
        if (multi) sel.forEach(function (v, i) { if (i >= lim) return; var ch = E("span", "sgu-chip sgu-sm"); ch.appendChild(E("span", "", labelOf(v))); var d = E("button", "sgu-del", "\u2715"); d.type = "button"; on(d, "mousedown", function (e) { e.preventDefault(); e.stopPropagation(); sel.splice(i, 1); changed(); }); ch.appendChild(d); box.insertBefore(ch, input); });
        if (multi && sel.length > lim) box.insertBefore(E("span", "sgu-more", "+" + (sel.length - lim)), input);
        if (!multi) { if (document.activeElement !== input || !q) input.value = sel.length ? labelOf(sel[0]) : ""; }
        clr.style.display = (sel.length && c.clearable !== false) ? "" : "none"; input.placeholder = sel.length && multi ? "" : (c.placeholder || "");
    }
    function changed() { renderChips(); emit(el, "change", out()); if (pop) refresh(); }
    function pick(o) { if (o.disabled) return; if (multi) { var i = sel.findIndex(function (v) { return String(v) === String(o.value); }); if (i >= 0) sel.splice(i, 1); else sel.push(o.value); q = ""; input.value = ""; } else { sel = [o.value]; q = ""; closeP(); } changed(); if (multi) input.focus(); }
    function closeP() { if (pop) pop.close(); }
    function refresh() {
        var term = (multi || document.activeElement === input) ? q : ""; filtered = opts.filter(function (o) { return !term || o.label.toLowerCase().indexOf(term.toLowerCase()) >= 0; });
        if (multi && c.hideSelected) filtered = filtered.filter(function (o) { return sel.indexOf(o.value) < 0; });
        var n = E("div"), list = E("div", "sgu-list"); n.appendChild(list); var lastG = null;
        filtered.forEach(function (o, i) { if (o.group !== undefined && o.group !== lastG) { lastG = o.group; list.appendChild(E("div", "sgu-grp", o.group)); } var d = E("div", "sgu-opt" + (sel.some(function (v) { return String(v) === String(o.value); }) ? " sgu-sel" : "") + (i === hi ? " sgu-hi" : "")); if (o.disabled) d.setAttribute("aria-disabled", "true"); if (multi) d.appendChild(E("span", "", sel.some(function (v) { return String(v) === String(o.value); }) ? "\u2611" : "\u2610")); if (o.icon) d.appendChild(E("span", "", ic(o.icon))); d.appendChild(hl(o.label, term)); on(d, "mousedown", function (e) { e.preventDefault(); pick(o); }); list.appendChild(d); });
        if (c.freeSolo && term && !filtered.some(function (o) { return o.label.toLowerCase() === term.toLowerCase(); })) { var add = E("div", "sgu-opt", "Add \u201C" + term + "\u201D"); on(add, "mousedown", function (e) { e.preventDefault(); var o = { label: term, value: term }; opts.push(o); pick(o); }); list.appendChild(add); }
        if (!list.children.length) list.appendChild(E("div", "sgu-none", c.noOptionsText || "No options"));
        var hadScroll = pop ? pop.node.firstChild.scrollTop : 0; if (pop) { pop.node.replaceChildren(list); list.scrollTop = hadScroll; } else pop = popup(box, n, { matchWidth: true, onClose: function () { pop = null; hi = -1; renderChips(); } });
        if (pop && pop.node.firstChild !== list) { }
    }
    on(input, "focus", function () { if (c.disabled) return; renderChips(); if (!multi) input.select(); refresh(); });
    on(input, "input", function () { q = input.value; hi = 0; refresh(); });
    on(input, "keydown", function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(filtered.length - 1, hi + 1); refresh(); } else if (e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(0, hi - 1); refresh(); }
        else if (e.key === "Enter") { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); else if (c.freeSolo && q) { var o = { label: q, value: q }; opts.push(o); pick(o); } }
        else if (e.key === "Backspace" && !input.value && multi && sel.length) { sel.pop(); changed(); } else if (e.key === "Escape" || e.key === "Tab") closeP();
    });
    on(input, "blur", function () { setTimeout(function () { if (document.activeElement !== input) { if (!multi && c.freeSolo && q) { sel = [q]; changed(); } q = ""; closeP(); renderChips(); } }, 120); });
    on(clr, "mousedown", function (e) { e.preventDefault(); sel = []; q = ""; input.value = ""; changed(); });
    on(arr, "mousedown", function (e) { e.preventDefault(); if (pop) closeP(); else { input.focus(); refresh(); } });
    on(box, "mousedown", function (e) { if (e.target === box) { e.preventDefault(); input.focus(); } });
    el.appendChild(fb.f); renderChips();
    return { setValue: function (v) { sel = v === undefined || v === null || v === "" ? [] : (multi ? [].concat(v) : [v]); renderChips(); }, getValue: out, setOptions: function (o) { opts = (o || []).map(norm); } };
};
function flatPath(nodes, path, outl) { nodes.forEach(function (n) { var o = norm(n); var p = path.concat([o]); outl.push(p); if (o.children) flatPath(o.children, p, outl); }); return outl; }
R.cascader = function (el, c) {
    var fb = fieldBox(c), box = fb.box, txt = E("div"), pathSel = []; txt.style.cssText = "flex:1;padding:6px 0;cursor:pointer;min-height:20px"; box.appendChild(txt); box.style.cursor = "pointer"; box.appendChild(E("span", "sgu-arrow", "\u25BE")); box.lastChild.style.cssText = "position:absolute;right:12px";
    var pop = null, nodes = c.options || [];
    function find(vals) { var lvl = nodes, out = []; for (var i = 0; i < vals.length; i++) { var f = lvl.map(norm).filter(function (o) { return String(o.value) === String(vals[i]); })[0]; if (!f) break; out.push(f); lvl = f.children || []; } return out; }
    function show() { var p = find(pathSel); txt.textContent = p.length ? p.map(function (o) { return o.label; }).join(c.separator || " / ") : (c.placeholder || "Select..."); txt.style.opacity = p.length ? "1" : ".5"; }
    function open() {
        var n = E("div", "sgu-casc"), cur = find(pathSel).map(function (o) { return o.value; });
        function cols(from) { while (n.children.length > from) n.removeChild(n.lastChild); var lvl = nodes; for (var i = 0; i < from; i++) { var f = lvl.map(norm).filter(function (o) { return String(o.value) === String(cur[i]); })[0]; lvl = f ? (f.children || []) : []; } if (!lvl.length) return; var col = E("div", "sgu-col"); lvl.map(norm).forEach(function (o) { var d = E("div", "sgu-opt" + (String(cur[from]) === String(o.value) ? " sgu-sel" : "")); d.appendChild(E("span", "", o.label)); if (o.children && o.children.length) d.appendChild(E("span", "sgu-arrow", "\u203A")); on(d, "click", function () { cur = cur.slice(0, from); cur.push(o.value); Array.prototype.forEach.call(col.children, function (k) { k.classList.remove("sgu-sel"); }); d.classList.add("sgu-sel"); if (o.children && o.children.length) cols(from + 1); else { pathSel = cur.slice(); show(); pop.close(); emit(el, "change", pathSel.slice()); } }); col.appendChild(d); }); n.appendChild(col); }
        cols(0); for (var k = 1; k <= cur.length; k++) cols(k); pop = popup(box, n, { onClose: function () { pop = null; } });
    }
    on(box, "click", function () { pop ? pop.close() : open(); });
    if (c.value) pathSel = [].concat(c.value); show(); el.appendChild(fb.f);
    return { setValue: function (v) { pathSel = [].concat(v || []); show(); } };
};
R.treeSelect = function (el, c) {
    var fb = fieldBox(c), box = fb.box, txt = E("div"), multi = !!c.multiple, sel = c.value === undefined ? [] : [].concat(c.value), pop = null; txt.style.cssText = "flex:1;padding:6px 0;cursor:pointer;min-height:20px"; box.appendChild(txt); box.style.cursor = "pointer";
    var flat = flatPath(c.options || [], [], []);
    function label(v) { var f = flat.filter(function (p) { return String(p[p.length - 1].value) === String(v); })[0]; return f ? f[f.length - 1].label : String(v); }
    function show() { txt.textContent = sel.length ? sel.map(label).join(", ") : (c.placeholder || "Select..."); txt.style.opacity = sel.length ? "1" : ".5"; }
    function open() {
        var n = E("div", "sgu-tree"); var expanded = {};
        function draw(list, depth, host) { list.forEach(function (raw) { var o = norm(raw), has = o.children && o.children.length, key = String(o.value); var row = E("div", "sgu-node" + (sel.some(function (v) { return String(v) === key; }) ? " sgu-sel" : "")); row.style.paddingLeft = (6 + depth * 18) + "px"; var tw = E("span", "sgu-tw", has ? (expanded[key] ? "\u25BC" : "\u25B6") : ""); row.appendChild(tw); if (multi) row.appendChild(E("span", "", sel.some(function (v) { return String(v) === key; }) ? "\u2611" : "\u2610")); row.appendChild(E("span", "", o.label));
            on(tw, "click", function (e) { e.stopPropagation(); expanded[key] = !expanded[key]; redraw(); });
            on(row, "click", function () { if (has && c.leafOnly) { expanded[key] = !expanded[key]; redraw(); return; } if (multi) { var i = sel.findIndex(function (v) { return String(v) === key; }); if (i >= 0) sel.splice(i, 1); else sel.push(o.value); redraw(); show(); emit(el, "change", sel.slice()); } else { sel = [o.value]; show(); pop.close(); emit(el, "change", o.value); } });
            host.appendChild(row); if (has && (expanded[key] || c.expandAll)) draw(o.children, depth + 1, host); }); }
        function redraw() { var st = n.scrollTop; n.textContent = ""; draw(c.options || [], 0, n); n.scrollTop = st; }
        redraw(); pop = popup(box, n, { matchWidth: true, onClose: function () { pop = null; } });
    }
    on(box, "click", function () { pop ? pop.close() : open(); }); show(); el.appendChild(fb.f);
    return { setValue: function (v) { sel = v === undefined ? [] : [].concat(v); show(); } };
};
R.mentions = function (el, c) {
    var ta = E("textarea", "sgu-ta"), pop = null, opts = (c.options || []).map(norm), trig = c.trigger || "@", hi = 0, flt = [], start = -1;
    ta.placeholder = c.placeholder || "Type " + trig + " to mention..."; ta.value = c.value || ""; if (c.disabled) ta.disabled = true;
    function closeP() { if (pop) pop.close(); start = -1; }
    function update() {
        var pos = ta.selectionStart, before = ta.value.slice(0, pos), m = before.match(new RegExp("(^|\\s)" + reEsc(trig) + "([\\w.\\-]*)$"));
        if (!m) return closeP(); start = pos - m[2].length - trig.length; var q = m[2].toLowerCase(); flt = opts.filter(function (o) { return o.label.toLowerCase().indexOf(q) >= 0; }); if (!flt.length) return closeP(); if (hi >= flt.length) hi = 0;
        var n = E("div", "sgu-list"); flt.forEach(function (o, i) { var d = E("div", "sgu-opt" + (i === hi ? " sgu-hi" : "")); if (o.icon) d.appendChild(E("span", "", ic(o.icon))); else d.appendChild(avatar({ name: o.label }, 22)); d.appendChild(E("span", "", o.label)); on(d, "mousedown", function (e) { e.preventDefault(); pick(o); }); n.appendChild(d); });
        if (pop) pop.close(); pop = popup(ta, n, { placement: "bottom-start", keep: true, onClose: function () { pop = null; } }); n.parentNode.style.minWidth = "180px";
    }
    function pick(o) { var pos = ta.selectionStart; var ins = trig + o.label + " "; ta.value = ta.value.slice(0, start) + ins + ta.value.slice(pos); var np = start + ins.length; ta.setSelectionRange(np, np); closeP(); ta.focus(); emit(el, "change", ta.value); }
    on(ta, "input", function () { hi = 0; update(); emit(el, "change", ta.value); });
    on(ta, "click", update);
    on(ta, "keydown", function (e) { if (!pop) return; if (e.key === "ArrowDown") { e.preventDefault(); hi = (hi + 1) % flt.length; update(); } else if (e.key === "ArrowUp") { e.preventDefault(); hi = (hi - 1 + flt.length) % flt.length; update(); } else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(flt[hi]); } else if (e.key === "Escape") closeP(); });
    on(ta, "blur", function () { setTimeout(closeP, 120); }); el.appendChild(ta);
    return { setValue: function (v) { ta.value = v || ""; }, getValue: function () { return ta.value; } };
};
R.signaturePad = function (el, c) {
    var wrap = E("div", "sgu-sig"), cv = E("canvas"), bar = E("div", "sgu-bar"), has = false; wrap.appendChild(cv); bar.appendChild(E("span", "", c.hint || "Sign above")); var row = E("span"); row.style.display = "flex"; row.style.gap = "6px"; row.appendChild(btn("Clear", "sgu-ghost", function () { clear(); emit(el, "change", ""); })); if (c.saveButton) row.appendChild(btn(c.saveLabel || "Save", "", function () { emit(el, "click", cv.toDataURL("image/png")); })); bar.appendChild(row); wrap.appendChild(bar); el.appendChild(wrap);
    var ctx, drawing = false, last = null, ratio = window.devicePixelRatio || 1;
    function fit() { var r = cv.getBoundingClientRect(); if (!r.width) return; var img = has ? cv.toDataURL() : null; cv.width = r.width * ratio; cv.height = r.height * ratio; ctx = cv.getContext("2d"); ctx.scale(ratio, ratio); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = c.penWidth || 2.4; ctx.strokeStyle = c.penColor || "#0f172a"; if (img) { var im = new Image(); im.onload = function () { ctx.drawImage(im, 0, 0, r.width, r.height); }; im.src = img; } }
    function clear() { var r = cv.getBoundingClientRect(); ctx.clearRect(0, 0, r.width, r.height); has = false; }
    function pt(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    on(cv, "pointerdown", function (e) { if (!ctx) fit(); drawing = true; last = pt(e); cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, 6.3); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); has = true; });
    on(cv, "pointermove", function (e) { if (!drawing) return; var p = pt(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; });
    function end() { if (!drawing) return; drawing = false; emit(el, "change", cv.toDataURL("image/png")); }
    on(cv, "pointerup", end); on(cv, "pointercancel", end); setTimeout(fit, 50); window.addEventListener("resize", fit);
    return { clear: function () { clear(); emit(el, "change", ""); }, toDataURL: function () { return has ? cv.toDataURL("image/png") : ""; } };
};
R.richText = function (el, c) {
    var wrap = E("div", "sgu-rt"), tb = E("div", "sgu-tb"), ed = E("div", "sgu-ed"); ed.contentEditable = c.readOnly ? "false" : "true"; ed.setAttribute("data-ph", c.placeholder || "Write something..."); ed.innerHTML = c.value || "";
    var tools = c.toolbar || ["bold", "italic", "underline", "strike", "|", "h2", "quote", "ul", "ol", "|", "link", "clear", "|", "undo", "redo"];
    var defs = { bold: ["B", "bold"], italic: ["I", "italic"], underline: ["U", "underline"], strike: ["S", "strikeThrough"], ul: ["\u2022", "insertUnorderedList"], ol: ["1.", "insertOrderedList"], h1: ["H1", "formatBlock", "H1"], h2: ["H2", "formatBlock", "H2"], h3: ["H3", "formatBlock", "H3"], quote: ["\u275D", "formatBlock", "BLOCKQUOTE"], clear: ["\u2715", "removeFormat"], undo: ["\u21B6", "undo"], redo: ["\u21B7", "redo"], left: ["\u2B05", "justifyLeft"], center: ["\u2194", "justifyCenter"], right: ["\u27A1", "justifyRight"], code: ["</>", "formatBlock", "PRE"], link: ["\u{1F517}", "link"], hr: ["\u2015", "insertHorizontalRule"] };
    tools.forEach(function (t) { if (t === "|") { tb.appendChild(E("i")); return; } var d = defs[t]; if (!d) return; var b = E("button", "", d[0]); b.type = "button"; b.title = t; if (t === "bold") b.style.fontWeight = "800"; if (t === "italic") b.style.fontStyle = "italic"; if (t === "underline") b.style.textDecoration = "underline"; on(b, "mousedown", function (e) { e.preventDefault(); }); on(b, "click", function () { ed.focus(); if (d[1] === "link") { var u = window.prompt("Link URL", "https://"); if (u) document.execCommand("createLink", false, u); } else document.execCommand(d[1], false, d[2] || null); emit(el, "change", ed.innerHTML); }); tb.appendChild(b); });
    if (!c.readOnly) wrap.appendChild(tb); wrap.appendChild(ed); on(ed, "input", function () { emit(el, "change", ed.innerHTML); }); el.appendChild(wrap);
    return { setValue: function (v) { ed.innerHTML = v || ""; }, getValue: function () { return ed.innerHTML; } };
};
function copyText(t) { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(function () { fallbackCopy(t); }); fallbackCopy(t); return Promise.resolve(); }
function fallbackCopy(t) { var ta = E("textarea"); ta.value = t; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); }
R.copyButton = function (el, c) {
    var label = c.label || "Copy", b = btn((c.icon === false ? "" : ic("copy") + " ") + label, c.variant || "", function () { var t = c.text; if (c.target) { var tn = document.querySelector(c.target); if (tn) t = tn.value !== undefined ? tn.value : tn.textContent; } copyText(t === undefined ? "" : String(t)).then(function () { b.textContent = ic("check") + " " + (c.copiedLabel || "Copied!"); setTimeout(function () { b.textContent = (c.icon === false ? "" : ic("copy") + " ") + label; }, c.resetMs || 1500); emit(el, "click", t); }); });
    b.style.setProperty("--sgu-c", col(c.color || "")); el.appendChild(b);
};
R.loadingButton = function (el, c) {
    var loading = !!c.loading, b = btn("", c.variant || "", function () { if (loading) return; emit(el, "click", true); if (c.autoLoadingMs) { set(true); setTimeout(function () { set(false); }, c.autoLoadingMs); } }); b.style.setProperty("--sgu-c", col(c.color || "")); if (!c.variant && c.color) b.style.background = col(c.color);
    function set(v) { loading = v; b.disabled = v; b.setAttribute("data-no-theme", "1"); b.textContent = ""; if (v) { b.appendChild(E("span", "sgu-spin")); b.appendChild(E("span", "", c.loadingText || c.label || "Loading...")); } else { if (c.icon) b.appendChild(E("span", "", ic(c.icon))); b.appendChild(E("span", "", c.label || "Submit")); } emit(el, "change", v); }
    set(loading); el.appendChild(b); return { setLoading: set };
};
R.avatarGroup = function (el, c) {
    var g = E("div", "sgu-ag"), list = c.avatars || [], max = c.max || 5, size = c.size || 36;
    list.slice(0, max).forEach(function (a) { var o = typeof a === "string" ? { name: a } : a; var v = avatar(o, size); on(v, "click", function () { emit(el, "click", o.name || o); }); v.style.cursor = "pointer"; g.appendChild(v); });
    if (list.length > max) { var m = avatar({ name: "+" + (list.length - max), color: "#475569" }, size); m.textContent = "+" + (list.length - max); m.title = list.slice(max).map(function (a) { return typeof a === "string" ? a : a.name; }).join(", "); g.appendChild(m); }
    el.appendChild(g);
};
R.descriptions = function (el, c) {
    var d = E("div", "sgu-desc sgu-surface" + (c.bordered ? " sgu-bordered" : "")), cols = c.columns || 2, items = c.items || []; d.style.padding = "12px"; d.style.height = "100%"; d.style.overflow = "auto";
    if (c.title) d.appendChild(E("h4", "", c.title)); var t = E("table"), tr = null, used = 0;
    items.forEach(function (it) { var o = Array.isArray(it) ? { label: it[0], value: it[1] } : it, span = Math.min(o.span || 1, cols); if (!tr || used + span > cols) { tr = E("tr"); t.appendChild(tr); used = 0; } used += span; var th = E("th", "", o.label), td = E("td", "", o.value); td.colSpan = span * 2 - 1; tr.appendChild(th); tr.appendChild(td); });
    d.appendChild(t); el.appendChild(d);
};
function fmtNum(v, prec, sep) { var n = Number(v); if (isNaN(n)) return String(v); var s = n.toFixed(prec || 0); return sep === false ? s : Number(s).toLocaleString(undefined, { minimumFractionDigits: prec || 0, maximumFractionDigits: prec || 0 }); }
R.statistic = function (el, c) {
    var d = E("div", "sgu-stat"), vEl = E("div", "sgu-v"), cur = 0; if (c.title) d.appendChild(E("div", "sgu-t", c.title)); d.appendChild(vEl); if (c.color) vEl.style.setProperty("--sgu-c", col(c.color));
    function fmt(v) { return (c.prefix || "") + (typeof v === "number" || /^-?[\d.]+$/.test(String(v)) ? fmtNum(v, c.precision, c.separator) : v) + (c.suffix || ""); }
    function set(v, anim) { var tgt = Number(v); if (anim && !isNaN(tgt)) { var from = cur, t0 = performance.now(), dur = c.duration || 900; (function step(t) { var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); cur = from + (tgt - from) * e; vEl.textContent = fmt(cur); if (k < 1) requestAnimationFrame(step); })(t0); } else { cur = isNaN(tgt) ? 0 : tgt; vEl.textContent = fmt(v); } }
    if (c.trend) { var tr = E("div", "sgu-tr " + (String(c.trend).indexOf("-") === 0 || c.trendDirection === "down" ? "sgu-dn" : "sgu-up"), (String(c.trend).indexOf("-") === 0 || c.trendDirection === "down" ? "\u25BC " : "\u25B2 ") + String(c.trend).replace(/^[-+]/, "")); d.appendChild(tr); }
    if (c.description) d.appendChild(E("div", "", c.description)).style.cssText = "font-size:12px;opacity:.65";
    set(c.value === undefined ? 0 : c.value, c.animate !== false && !isNaN(Number(c.value))); el.appendChild(d);
    return { setValue: function (v) { set(v, true); } };
};
R.countdown = function (el, c) {
    var d = E("div", "sgu-stat"), vEl = E("div", "sgu-v"), end = 0, timer = null, fin = false; if (c.title) d.appendChild(E("div", "sgu-t", c.title)); d.appendChild(vEl); el.appendChild(d);
    function start(secs) { end = c.target ? new Date(c.target).getTime() : Date.now() + (secs !== undefined ? secs : (c.seconds || 60)) * 1000; if (secs !== undefined) end = Date.now() + secs * 1000; fin = false; clearInterval(timer); tick(); timer = setInterval(tick, 250); }
    function tick() { var ms = Math.max(0, end - Date.now()), s = Math.ceil(ms / 1000), dd = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60, p = function (n) { return (n < 10 ? "0" : "") + n; }; vEl.textContent = (dd || c.showDays ? dd + "d " : "") + p(hh) + ":" + p(mm) + ":" + p(ss); if (ms <= 0 && !fin) { fin = true; clearInterval(timer); vEl.style.color = col("error"); emit(el, "change", { finished: true }); } else if (ms > 0) vEl.style.color = ""; }
    if (c.autoStart !== false) start(); else vEl.textContent = "00:00:00";
    return { start: start, reset: start, stop: function () { clearInterval(timer); } };
};
R.watermark = function (el, c) {
    var w = E("div", "sgu-wm"), body = E("div", "sgu-wc sgu-surface"), layer = E("div", "sgu-wl"); body.style.cssText += ";overflow:auto"; if (c.html) body.innerHTML = c.html; else if (c.text) body.textContent = c.text; else if (c.content) body.textContent = c.content;
    var fs = c.fontSize || 16, txt = c.watermark || c.mark || "CONFIDENTIAL", gap = c.gap || 80, cv = document.createElement("canvas"); var sz = txt.length * fs * .62 + gap; cv.width = sz; cv.height = sz * .6 + gap / 2; var x = cv.getContext("2d"); x.translate(cv.width / 2, cv.height / 2); x.rotate((c.rotate === undefined ? -22 : c.rotate) * Math.PI / 180); x.font = "700 " + fs + "px system-ui,sans-serif"; x.fillStyle = c.color || "#94a3b8"; x.globalAlpha = c.opacity === undefined ? .22 : c.opacity; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(txt, 0, 0);
    layer.style.backgroundImage = "url(" + cv.toDataURL() + ")"; w.appendChild(body); w.appendChild(layer); w.style.height = "100%"; el.appendChild(w);
};
R.masonry = function (el, c) {
    var m = E("div", "sgu-mas"); m.style.columnCount = c.columns || 3; m.style.setProperty("--sgu-g", (c.gap || 12) + "px");
    (c.items || []).forEach(function (it, i) { var d = E("div"); if (typeof it === "string") { if (/^(https?:|data:)/.test(it) || /\.(png|jpe?g|gif|webp|svg)$/i.test(it)) { var im = E("img"); im.src = it; d.appendChild(im); d.style.padding = "0"; d.style.overflow = "hidden"; } else d.textContent = it; } else { if (it.image) { var im2 = E("img"); im2.src = it.image; d.appendChild(im2); } if (it.title) { var t = E("b", "", it.title); t.style.display = "block"; t.style.marginTop = it.image ? "8px" : "0"; d.appendChild(t); } if (it.html) { var h = E("div"); h.innerHTML = it.html; d.appendChild(h); } else if (it.text) d.appendChild(E("div", "", it.text)); if (it.height) d.style.minHeight = it.height + "px"; } d.style.cursor = "pointer"; on(d, "click", function () { emit(el, "click", { index: i, item: it }); }); m.appendChild(d); });
    el.appendChild(m);
};
R.imageCompare = function (el, c) {
    var d = E("div", "sgu-cmp"), a = E("img"), b = E("img"), hd = E("div", "sgu-hd"), pos = c.position === undefined ? 50 : c.position; a.src = c.after || ""; b.src = c.before || ""; d.appendChild(a); d.appendChild(b); d.appendChild(hd);
    if (c.labels !== false) { var l1 = E("span", "sgu-tag", c.beforeLabel || "Before"), l2 = E("span", "sgu-tag", c.afterLabel || "After"); l1.style.left = "8px"; l2.style.right = "8px"; d.appendChild(l1); d.appendChild(l2); }
    function set(p) { pos = Math.max(0, Math.min(100, p)); b.style.clipPath = "inset(0 " + (100 - pos) + "% 0 0)"; hd.style.left = "calc(" + pos + "% - 1.5px)"; }
    function mv(e) { var r = d.getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100); }
    var down = false; on(d, "pointerdown", function (e) { down = true; d.setPointerCapture(e.pointerId); mv(e); }); on(d, "pointermove", function (e) { if (down) mv(e); }); on(d, "pointerup", function () { down = false; emit(el, "change", Math.round(pos)); }); set(pos); d.style.height = "100%"; el.appendChild(d);
    return { setValue: set };
};
R.marquee = function (el, c) {
    var m = E("div", "sgu-mq"), trk = E("div", "sgu-trk" + (c.pauseOnHover !== false ? " sgu-pause" : "")), items = c.items || [], sep = c.separator === undefined ? "\u2022" : c.separator;
    function fill() { for (var k = 0; k < 2; k++) items.forEach(function (it) { var s = E("span", "", typeof it === "string" ? it : (it.text || it.label || "")); s.style.cursor = "pointer"; on(s, "click", function () { emit(el, "click", it); }); trk.appendChild(s); if (sep) { var sp = E("span", "", sep); sp.style.opacity = ".4"; trk.appendChild(sp); } }); }
    fill(); trk.style.setProperty("--sgu-d", (c.duration || Math.max(10, items.length * 4)) + "s"); if (c.reverse) trk.style.animationDirection = "reverse"; m.appendChild(trk); m.style.height = "100%"; el.appendChild(m);
};
R.typography = function (el, c) {
    var v = c.variant || "body1", map = { h1: ["h1", 40, 800], h2: ["h2", 34, 800], h3: ["h3", 28, 700], h4: ["h4", 24, 700], h5: ["h5", 20, 700], h6: ["h6", 17, 700], subtitle1: ["div", 16, 600], subtitle2: ["div", 14, 600], body1: ["p", 14, 400], body2: ["p", 13, 400], caption: ["span", 12, 400], overline: ["span", 11, 700], button: ["span", 13, 700] }, d = map[v] || map.body1, t = E(d[0], "sgu-typo", c.text || "");
    t.style.fontSize = (c.size || d[1]) + "px"; t.style.fontWeight = c.weight || d[2]; if (v === "overline") { t.style.textTransform = "uppercase"; t.style.letterSpacing = "1.2px"; } if (v === "button") { t.style.textTransform = "uppercase"; t.style.letterSpacing = ".8px"; } if (v === "subtitle1" || v === "subtitle2" || v === "caption" || v === "overline") t.style.opacity = ".75";
    if (c.color) t.style.color = col(c.color); if (c.align) t.style.textAlign = c.align; if (c.italic) t.style.fontStyle = "italic"; if (c.underline) t.style.textDecoration = "underline"; if (c.noWrap) { t.style.whiteSpace = "nowrap"; t.style.overflow = "hidden"; t.style.textOverflow = "ellipsis"; } if (c.gutterBottom) t.style.marginBottom = "8px"; if (c.gradient) { t.style.background = "linear-gradient(90deg," + c.gradient.join(",") + ")"; t.style.webkitBackgroundClip = "text"; t.style.backgroundClip = "text"; t.style.color = "transparent"; }
    el.appendChild(t);
};
R.chips = function (el, c) {
    var wrap = E("div", "sgu-chips"), items = (c.chips || c.items || []).slice(), selected = {};
    function draw() { wrap.textContent = ""; items.forEach(function (raw, i) { var o = norm(raw), r = o.raw || {}; var ch = E("span", "sgu-chip" + (c.variant === "outlined" ? " sgu-outlined" : "") + (c.size === "small" ? " sgu-sm" : "") + (c.clickable || r.clickable ? " sgu-click" : "") + (selected[o.value] ? " sgu-selected" : "")); ch.style.setProperty("--sgu-c", col(r.color || c.color || "")); if (!r.color && !c.color) ch.style.setProperty("--sgu-c", c.variant === "outlined" ? "#64748b" : "#475569");
        if (r.avatar || r.src) { var av = E("span", "sgu-av"); if (r.src) { var im = E("img"); im.src = r.src; av.appendChild(im); } else av.textContent = String(r.avatar).slice(0, 2); ch.appendChild(av); } else if (r.icon || c.icon) ch.appendChild(E("span", "", ic(r.icon || c.icon))); ch.appendChild(E("span", "", o.label));
        if (c.clickable || r.clickable) on(ch, "click", function () { if (c.selectable) { if (c.multiple === false) selected = {}; selected[o.value] = !selected[o.value]; draw(); emit(el, "change", Object.keys(selected).filter(function (k) { return selected[k]; })); } emit(el, "click", o.value); });
        if (c.deletable || r.deletable) { var d = E("button", "sgu-del", "\u2715"); d.type = "button"; d.title = "Remove"; on(d, "click", function (e) { e.stopPropagation(); items.splice(items.indexOf(raw), 1); draw(); emit(el, "change", { deleted: o.value, remaining: items.map(function (x) { return norm(x).value; }) }); }); ch.appendChild(d); }
        wrap.appendChild(ch); }); nt(wrap); }
    draw(); nt(wrap); el.appendChild(wrap);
    return { setItems: function (l) { items = l.slice(); draw(); } };
};
R.virtualList = function (el, c) {
    var wrap = E("div", "sgu-vl"), items = c.items || [], ih = c.itemHeight || 36, q = "", view = items, selected = -1, cnt = E("div", "sgu-cnt"), vp = E("div", "sgu-vp"), inner = E("div"), input = null;
    if (c.search !== false && c.searchable !== false && c.search) { input = E("input"); input.placeholder = c.searchPlaceholder || "Filter " + items.length.toLocaleString() + " items..."; wrap.appendChild(input); }
    vp.appendChild(inner); wrap.appendChild(vp); if (c.showCount !== false) wrap.appendChild(cnt);
    function label(it) { return typeof it === "object" && it ? String(it.primary || it.label || it.text || "") : String(it); }
    function paint() {
        var top = vp.scrollTop, h = vp.clientHeight || 240, s = Math.max(0, Math.floor(top / ih) - 4), e = Math.min(view.length, Math.ceil((top + h) / ih) + 4); inner.style.height = (view.length * ih) + "px"; inner.textContent = "";
        for (var i = s; i < e; i++) { (function (i) { var it = view[i], row = E("div", "sgu-it" + (selected === i ? " sgu-sel" : "")); row.style.top = (i * ih) + "px"; row.style.height = ih + "px"; if (typeof it === "object" && it && it.icon) row.appendChild(E("span", "", ic(it.icon))); row.appendChild(E("span", "", label(it))); if (typeof it === "object" && it && it.secondary) row.appendChild(E("small", "", it.secondary)); on(row, "click", function () { selected = i; paint(); emit(el, "click", { index: items.indexOf(it), item: it }); emit(el, "change", it); }); inner.appendChild(row); })(i); }
        cnt.textContent = view.length.toLocaleString() + (view.length === items.length ? " items" : " of " + items.length.toLocaleString());
    }
    on(vp, "scroll", paint); if (input) on(input, "input", function () { q = input.value.toLowerCase(); view = q ? items.filter(function (x) { return label(x).toLowerCase().indexOf(q) >= 0; }) : items; vp.scrollTop = 0; paint(); });
    el.appendChild(wrap); setTimeout(paint, 0); if (window.ResizeObserver) new ResizeObserver(paint).observe(vp);
    return { setItems: function (l) { items = l; view = l; selected = -1; paint(); } };
};
R.anchor = function (el, c) {
    var a = E("div", "sgu-anc" + (c.direction === "horizontal" ? " sgu-h" : "")), ls = [];
    (c.links || []).forEach(function (x) { var o = norm(x); var raw = o.raw || {}; var l = E("a", "", o.label); l.href = "#"; on(l, "click", function (e) { e.preventDefault(); var t = raw.target || o.value; var n = null; try { n = document.querySelector(/^[#.\[]/.test(t) ? t : "#" + t); } catch (er) {} if (n && n.scrollIntoView) n.scrollIntoView({ behavior: "smooth", block: "start" }); ls.forEach(function (k) { k.classList.remove("sgu-on"); }); l.classList.add("sgu-on"); emit(el, "click", o.value); }); ls.push(l); a.appendChild(l); });
    if (ls[0]) ls[0].classList.add("sgu-on"); el.appendChild(a);
};

function hydrate(el) {
    if (el.__sgu || !el.getAttribute) return; var t = el.getAttribute("data-sgu"); if (!t || !R[t]) return; el.__sgu = true;
    var c = {}; try { c = JSON.parse(el.getAttribute("data-cfg") || "{}"); } catch (e) {}
    el.classList.add("sgu"); el.style.height = "100%"; el.style.width = "100%"; el.style.position = "relative"; el.textContent = "";
    try { var api = R[t](el, c) || {}; nt(el); var r = root(el); if (r) { U.inst[r.id] = api; api.type = t; } } catch (err) { el.textContent = "SimpleUI error: " + err; console.error("[SimpleUI]", t, err); }
}
U.hydrate = function (rootNode) { var nodes = (rootNode || document).querySelectorAll ? (rootNode || document).querySelectorAll("[data-sgu]") : []; Array.prototype.forEach.call(nodes, hydrate); if (rootNode && rootNode.getAttribute && rootNode.getAttribute("data-sgu")) hydrate(rootNode); };
U.call = function (id, method, args) { var api = U.inst[id]; if (api && typeof api[method] === "function") return api[method].apply(api, args || []); };
function boot() { U.hydrate(document); if (window.MutationObserver) new MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) U.hydrate(n); }); }); }).observe(document.body, { childList: true, subtree: true }); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
`;

/** Style + script injected once into every SimpleWindow page. */
export const UI_CLIENT_HTML = `<style id="sgu-style">${UI_CSS}</style><script id="sgu-script">${UI_JS}</script>`;

/** Build the markup for one component (used by SimpleWindow.ui()). */
export function renderUIComponent(type: UIComponentType, cfg: Record<string, any>): string {
    const { width: _w, height: _h, onChange: _c, onClick: _k, onEnter: _e, id: _i, ...clean } = cfg;
    const json = JSON.stringify(clean)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    return `<div data-sgu="${type}" data-cfg="${json}"></div>`;
}
