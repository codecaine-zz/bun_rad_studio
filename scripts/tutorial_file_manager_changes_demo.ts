#!/usr/bin/env bun
/**
 * Codecaine File Manager v1.5.1 — Master Enhancements, Security Hardening & Performance Demo Video
 *
 * A live-recorded 1080p widescreen demonstration of all the new Codecaine File Manager v1.5.1
 * features, security hardening, and performance optimizations:
 *   - On-Demand Recursive Folder Sizes (batched async lstat chunks) & Smart Single-Pass Kind-Chips
 *   - Power Quick-Filter Predicates (`is:dir`, `ext:json,md`, `-negation`) & 1-Click Empty State Reset
 *   - Select by Pattern (`*.json`), Select Same Extension/Kind, New Folder with Selection + Atomic Undo, & Paste Text as File
 *   - Folder Tabs, Reopen Closed Tab (`⇧⌘T`), Dual-Pane Swap, & Universal Command Palette (`⌘K`)
 *   - Security & Performance Engine Tour: Task Manager (parallel ps/lsof, O(N) grouping, ancestor tree guard),
 *     Crypto/Vault (try/finally key zeroization, streaming 64 KB SHA-256), and Serve (origin isolation & debounced hints)
 *
 * Usage:
 *   bun scripts/tutorial_file_manager_changes_demo.ts all
 */
import "./lib/tts_edge_default";
import { fmtTime } from "./lib/video_pipeline";
import { runTutorial, type Do, type Suite } from "./lib/step_video";
import type { Chapter } from "./lib/fm_tutorial_types";
import {
  RIG_MARK,
  VIEW_H,
  clearUnobstructedBanner,
  closeDialogs,
  createThemesTutorialEnv,
  showKeys,
  showThemeUnobstructed,
} from "./lib/fm_themes_tutorial_shared";

const { seedWorld, env } = createThemesTutorialEnv({
  tmpDir: "/tmp/cc_fm_v151_changes_demo",
  cdpPort: 19380,
  fmPort: 19510,
});

const DEMO_RATE = "+10%";
const DEMO_GAP = 0.30;

async function showDemoHud(d: Do, badge: string, title: string, subtitle: string) {
  await d.eval(`(() => {
    let banner = document.getElementById('fm-unobstructed-theme-hud');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'fm-unobstructed-theme-hud';
      banner.style.cssText = 'position:fixed;top:10px;right:18px;z-index:9999;pointer-events:none;padding:10px 16px;border-radius:12px;background:rgba(9,13,24,0.92);border:1.5px solid var(--accent, #38bdf8);color:#fff;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 12px 28px rgba(0,0,0,0.65);backdrop-filter:blur(12px);max-width:520px;transition:all 0.2s ease;';
      document.body.appendChild(banner);
    }
    banner.innerHTML = '<div style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--accent, #38bdf8);">' + ${JSON.stringify(badge)} + '</div>'
      + '<div style="font-size:15px;font-weight:800;margin-top:3px;color:#ffffff;">' + ${JSON.stringify(title)} + '</div>'
      + '<div style="font-size:12px;opacity:0.90;margin-top:2px;color:#cbd5e1;">' + ${JSON.stringify(subtitle)} + '</div>';
  })()`);
}

const chapters: Chapter[] = [
  {
    id: "00_intro",
    chapter: "WHAT'S NEW IN V1.5.1",
    title: "Codecaine File Manager v1.5.1 — Master Features, Security & Performance Demo",
    kind: "card",
    card: {
      kicker: "Codecaine File Manager v1.5.1 · Live Feature, Security & Performance Demo",
      title: "Faster Rendering, Hardened Local Security & Power Ergonomics",
      lines: [
        "📐 On-Demand Folder Sizes · ⚡ Power Filter Predicates · 🏷️ Single-Pass Kind Chips",
        "🎯 Select by Pattern · 📁 New Folder with Selection + Undo · 📋 Paste Text as File",
        "🛡️ Origin & Symlink Guards · Prototype-Pollution Protection · WeakMap O(1) Caching",
      ],
    },
    steps: [
      {
        cap: "Welcome to the Codecaine File Manager v1.5.1 Changes & Security Demo",
        say: "Welcome to the Codecaine File Manager version one point five point one live demo. In this tour, we showcase the new master productivity workflows alongside our full-stack security hardening and performance optimizations.",
      },
    ],
  },

  {
    id: "01_sizes_and_power_filters",
    chapter: "FOLDER SIZES & POWER FILTERS",
    title: "On-Demand Recursive Folder Sizes, Power Filter Predicates & Single-Pass Kind Chips",
    blurb: "Compute folder sizes in batched async chunks, filter by extension or negation predicates, and switch kind chips in a single pass",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "📐 On-Demand Folder Sizes (Batched 64-Entry Async lstat) & WeakMap Visible-Entry Caching",
        say: "In Details View, clicking the new Sizes button calculates recursive byte counts for every folder in the current directory using batched asynchronous stats, while visible entries are memoized in a WeakMap for instant rendering.",
        act: async (d) => {
          await closeDialogs(d);
          await d.eval(`(async () => {
            const { saveSettings } = await import('/ui/nav.js');
            await saveSettings({ view: 'details' });
          })()`);
          await d.wait(500);
          await showDemoHud(
            d,
            "⚡ PERFORMANCE + ERGONOMICS",
            "On-Demand Folder Sizes & WeakMap List Caching",
            "Batched 64-item async fsp.lstat chunks · Zero redundant sort/filter passes",
          );
          await d.click("#qb-sizes-btn", { pause: 900 }).catch(async () => {
            await d.eval(`(async () => {
              const { calculateFolderSizes } = await import('/ui/nav.js');
              const { left } = await import('/ui/pane.js');
              await calculateFolderSizes(left);
            })()`);
            await d.wait(900);
          });
          await d.wait(900);
        },
      },
      {
        cap: "⚡ Power Quick-Filter Predicates (`is:dir`, `ext:md,json`, `-negation`) & 1-Click Reset",
        say: "The live folder filter now supports power predicates: type is colon dir to show only folders, or combine extension filters and minus exclusions, with a single-pass kind chip counter and one-click empty filter reset.",
        act: async (d) => {
          await showDemoHud(
            d,
            "🔍 POWER QUICK-FILTER PREDICATES",
            "Live Predicates: is:dir · ext:md,json · -exclude · size:>1kb",
            "Single-pass O(N) Kind-Chip counts · 1-Click Empty State Reset",
          );
          await d.click("#quick-filter", { pause: 300 });
          await d.eval(`(() => {
            const q = document.getElementById('quick-filter');
            if (q) { q.value = 'is:dir'; q.dispatchEvent(new Event('input', { bubbles: true })); }
          })()`);
          await d.wait(1100);
          await d.eval(`(() => {
            const q = document.getElementById('quick-filter');
            if (q) { q.value = 'ext:md,json -package'; q.dispatchEvent(new Event('input', { bubbles: true })); }
          })()`);
          await d.wait(1100);
          await d.eval(`(() => {
            const q = document.getElementById('quick-filter');
            if (q) { q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); }
          })()`);
          await d.wait(600);
        },
      },
    ],
  },

  {
    id: "02_selection_and_atomic_ops",
    chapter: "SELECTION & ATOMIC FILE OPS",
    title: "Select by Pattern, New Folder with Selection + Atomic Undo & Paste Text as File",
    blurb: "Select items by glob or regex, bundle selected files into a new folder with full Undo, and paste clipboard text directly as a file",
    path: "<HOME>/Projects/shop-app/custom_themes",
    steps: [
      {
        cap: "🎯 Select Items by Pattern (`*.json`), Select Same Extension & Marquee Diff Guard",
        say: "Inside the custom themes folder, we open Select Items by Pattern to match glob or regular expression patterns, or select all items sharing the same extension, backed by our new marquee selection diff guard.",
        act: async (d) => {
          await closeDialogs(d);
          await d.eval(`(async () => {
            const { saveSettings } = await import('/ui/nav.js');
            await saveSettings({ view: 'details' });
          })()`);
          await d.wait(400);
          await showDemoHud(
            d,
            "🎯 SMART SELECTION ENGINE",
            "Select by Glob / Regex Pattern & Select Same Extension",
            "Marquee selection diff guard avoids redundant DOM selection events",
          );
          await d.eval(`(async () => {
            const { showSelectByPatternDialog } = await import('/ui/quickbar.js');
            showSelectByPatternDialog('replace');
          })()`);
          await d.wait(900);
          await d.eval(`(async () => {
            document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
            const { selectByPattern } = await import('/ui/selection.js');
            const { left } = await import('/ui/pane.js');
            selectByPattern('pack_tier_*.json', { mode: 'replace', pane: left });
          })()`);
          await d.wait(1100);
        },
      },
      {
        cap: "📁 New Folder with Selection + Atomic Undo (`⌘Z`) & 📋 Paste Clipboard Text as File",
        say: "With those four tier packs selected, New Folder with Selection bundles them into a single folder in one step—and pressing Command Z undoes the entire batch atomically. You can also paste raw clipboard text directly as a new file.",
        act: async (d) => {
          await showDemoHud(
            d,
            "📁 ATOMIC WORKFLOWS + UNDO",
            "New Folder with Selection + Atomic Undo & Paste Text as File",
            "Collision-safe file creation · Full multi-item Undo restoration",
          );
          await d.eval(`(async () => {
            const ops = await import('/ui/ops.js');
            const { left } = await import('/ui/pane.js');
            const paths = [...left.selection];
            await ops.newFolderWithSelection(paths, 'Bundled_Tier_Packs');
            const r = document.querySelector('.rename-input');
            if (r) r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          })()`);
          await d.wait(1100);
          await showKeys(d, ["⌘", "Z"]);
          await d.eval(`(async () => {
            const ops = await import('/ui/ops.js');
            await ops.undo();
          })()`);
          await d.wait(900);
          await d.eval(`(async () => {
            const ops = await import('/ui/ops.js');
            await ops.pasteTextAsFile(JSON.stringify({ verified: true, securityAudit: "passed" }, null, 2), 'security_audit_manifest.json');
            const r = document.querySelector('.rename-input');
            if (r) r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          })()`);
          await d.wait(900);
        },
      },
    ],
  },

  {
    id: "03_tabs_dual_and_security",
    chapter: "TABS, DUAL VIEW & SECURITY",
    title: "Reopen Closed Tab, Swap Dual Panes & Full-Stack Security Hardening",
    blurb: "Restore closed folder tabs, swap left and right dual panes in one click, and inspect hardened local security and parallel tools",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "🗂️ Folder Tabs, Reopen Closed Tab (`⇧⌘T`) & ⇄ Swap Dual Panes",
        say: "Folder tabs now remember closed locations so Shift Command T reopens your last closed tab immediately. In Dual View, clicking Swap Dual Panes exchanges the left and right directories in a single action.",
        act: async (d) => {
          await closeDialogs(d);
          await showDemoHud(
            d,
            "🗂️ TABS & DUAL-PANE PARITY",
            "Reopen Closed Tab (⇧⌘T), Middle-Click Breadcrumbs & Swap Dual Panes",
            "Full history, search & address-bar parity across both panes",
          );
          await d.eval(`(async () => {
            const tabs = await import('/ui/tabs.js');
            const { state } = await import('/ui/state.js');
            await tabs.openNewTab(state.location.path + '/custom_themes');
          })()`);
          await d.wait(700);
          await d.eval(`(async () => {
            const tabs = await import('/ui/tabs.js');
            const { state } = await import('/ui/state.js');
            await tabs.closeTab(state.activeTabId);
          })()`);
          await d.wait(600);
          await showKeys(d, ["⇧", "⌘", "T"]);
          await d.eval(`(async () => {
            const tabs = await import('/ui/tabs.js');
            await tabs.reopenClosedTab();
          })()`);
          await d.wait(800);
          await d.eval(`(async () => {
            const { emit } = await import('/ui/state.js');
            const dual = await import('/ui/dual.js');
            emit('workspace-go', 'dual');
            await new Promise(r => setTimeout(r, 400));
            await dual.swapDualPanes();
          })()`);
          await d.wait(1000);
        },
      },
      {
        cap: "🛡️ Security Hardening & Parallel Tools: Task Manager, Vault Zeroization & Origin Isolation",
        say: "Under the hood, version one point five point one hardens every boundary: embedded apps are isolated to the alternate loopback origin, cross-site Fetch requests and symlinked system ancestors are blocked, vault keys are zeroed in finally blocks, and the Task Manager runs process and port inspections in parallel.",
        act: async (d) => {
          await showDemoHud(
            d,
            "🛡️ SECURITY & PERFORMANCE AUDIT",
            "Origin Isolation · Symlink Ancestor Guard · Vault Key Zeroing · Parallel Task Manager",
            "3,650+ automated tests passing across 120 test suites",
          );
          await d.eval(`(async () => {
            const { openPower } = await import('/ui/power.js');
            openPower('tasks');
          })()`);
          await d.wait(1300);
          await d.eval(`(async () => {
            const { openPower } = await import('/ui/power.js');
            openPower('crypto');
          })()`);
          await d.wait(1100);
          await d.eval(`(async () => {
            const { emit } = await import('/ui/state.js');
            const { saveSettings } = await import('/ui/nav.js');
            emit('workspace-go', 'files');
            await saveSettings({ view: 'icons' });
          })()`);
          await showThemeUnobstructed(
            d,
            "polar_night",
            "🌌 Codecaine File Manager v1.5.1 — Ready Across All Platforms",
            "Hardened Security · O(1) Cached Lists · 67 SVG Icon Packs · 310 Themes",
            { anim: "folder_3d_spin_turntable", waitMs: 1100 },
          );
          await clearUnobstructedBanner(d);
        },
      },
    ],
  },

  {
    id: "04_outro",
    chapter: "DOWNLOAD V1.5.1",
    title: "Download Codecaine File Manager v1.5.1 for macOS, Windows & Linux",
    kind: "card",
    card: {
      kicker: "Free & Open Source (MIT) · 25 Native Release Packages Available Now",
      title: "Download Codecaine File Manager v1.5.1 on GitHub",
      lines: [
        "🍎 macOS (Apple Silicon arm64 & Intel x64) · 🪟 Windows (x64, ARM64 & Baseline) · 🐧 Linux (x64 & ARM64)",
        "🛡️ Full Security Hardening + Performance Optimizations Verified by 3,650+ Tests",
        "🔗 github.com/codecaine-zz/bun_rad_studio/releases/tag/v1.5.1",
      ],
    },
    steps: [
      {
        cap: "Download Codecaine File Manager v1.5.1 on GitHub for macOS, Windows & Linux",
        say: "Codecaine File Manager version one point five point one is available now for macOS, Windows, and Linux on GitHub. Download the prebuilt release for your platform today!",
      },
    ],
  },
];

function notesText(marks: Array<{ at: number; title: string }>, total: number): string {
  const REPO = "https://github.com/codecaine-zz/bun_rad_studio";
  const chaptersText = marks.map((m, i) => `${fmtTime(i === 0 ? 0 : m.at)} ${m.title}`).join("\n");
  return `# Codecaine File Manager v1.5.1 — Security, Performance & Master Enhancements Demo (${fmtTime(total)})

## Video Output
- **MP4 Video:** \`youtube_production/file_manager_v151_changes_demo_tutorial.mp4\` (1920×1080 1080p widescreen, 30 fps, narrated with synchronized captions)
- **Workstation Hardware Mark:** \`${RIG_MARK}\`

## Highlights Covered in This Demo
1. **On-Demand Folder Sizes & Power Quick-Filter Predicates**:
   - Batched 64-entry async \`fsp.lstat\` folder sizing, \`WeakMap\` memoized \`visibleEntries(pane)\`, single-pass \`KIND_CHIP_DEFS\` counting, and power filter predicates (\`is:dir\`, \`ext:md,json\`, \`-exclude\`).
2. **Smart Selection & Atomic File Operations**:
   - Select Items by Pattern (glob/regex), Select Same Extension/Kind, marquee selection diff guard, New Folder with Selection + atomic Undo (\`⌘Z\`), and Paste Clipboard Text as File.
3. **Tabs, Dual-Pane Parity & Command Palette**:
   - Folder tabs with Reopen Closed Tab (\`⇧⌘T\`), middle-click breadcrumb navigation, and 1-click Swap Dual Panes.
4. **Full-Stack Security & Performance Hardening**:
   - \`Sec-Fetch-Site: cross-site\` & Origin guards, strict \`/app/<id>/\` alternate-loopback origin isolation, \`deepestRealPath\` symlink ancestor protection, prototype-pollution guards in \`unflatten\` / \`parseTomlLite\` / \`normalizeDb\`, \`try/finally\` cryptographic key zeroization, streaming 64 KB SHA-256 hashing, and parallel \`ps\`/\`lsof\` Task Manager inspection.

## Chapters
\`\`\`text
${chaptersText}
\`\`\`

## Download
- **GitHub Release v1.5.1:** ${REPO}/releases/tag/v1.5.1
`;
}

const suite: Suite = {
  name: "file_manager_v151_changes_demo",
  chapters,
  seedWorld,
  open: (ch, world) => env.open(ch, world),
  start: () => env.start(),
  stop: () => env.stop(),
  cdp: () => env.c,
  notes: notesText,
  rate: DEMO_RATE,
  gap: DEMO_GAP,
  viewHeight: VIEW_H,
  rigMark: RIG_MARK,
};

await runTutorial(suite, process.argv.slice(2));
process.exit(0);
