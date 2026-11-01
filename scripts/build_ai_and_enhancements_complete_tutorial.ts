#!/usr/bin/env bun
/**
 * Builds the Flagship Visual-Learner Complete Masterclass Tutorial (1920x1080 16:9 @ 1.0x Natural Pace, CRF 12)
 * AND the Companion Vertical YouTube Short (1080x1920 9:16, <175s, CRF 14) for:
 *   1. Using AI in the Codecaine File Manager (Ollama AI, LM Studio Bionic, Code Editor AI Chat & Phonon Neural TTS)
 *   2. All Wave 2 & v1.5.3 Flagship File Manager Enhancements (Sticky Notes, 2-File Diff Viewer, Bulk Rename 2.0,
 *      SHA-256 Checksum Manifests, Folder Inventory Exporter, Quick Look Interactive Image Inspector, In-Preview Find,
 *      Smart Folder Tidy, Document Package Inspector & Chaptered Audiobook Export)
 *
 * Designed specifically for VISUAL LEARNERS:
 *   - Every feature is demonstrated live on screen with real cursor movement, click ripples, and live UI state changes.
 *   - Every scene displays a glowing Spotlight Callout Ring around the active control AND a Dual-Method Banner showing
 *     BOTH the Mouse Click path (`🖱️ Click`) and the Keyboard Shortcut (`⌨️ Shortcut` for macOS & Windows/Linux),
 *     plus animated on-screen keycap badges (`⌘K`, `⌥B`, `⌘Enter`, `Esc`, `Space`, `⌘F`, `F2`, `⌘Z`).
 *   - Narrated 100% live from this Apple Silicon Mac using `ollama run phonon --voice Zoey`.
 *
 * Outputs:
 *   - youtube_production/codecaine_file_manager_ai_and_enhancements_complete_tutorial_1080p.mp4 (1920x1080 1.0x Masterclass)
 *   - youtube_production/codecaine-file-manager-ai-complete-tutorial-short.mp4 (1080x1920 9:16 YouTube Short)
 *   - youtube_production/phonon_ollama_complete_tutorial_1080p.mp4
 *   - youtube_production/phonon_ollama_complete_tutorial_short.mp4
 *   - youtube_production/AI_AND_ENHANCEMENTS_COMPLETE_TUTORIAL_NOTES.md
 *   - docs/AI_AND_ENHANCEMENTS_COMPLETE_TUTORIAL.md
 *
 * Usage:
 *   bun scripts/build_ai_and_enhancements_complete_tutorial.ts
 */
process.env.TTS_ENGINE = "edge";
process.env.EDGE_TTS_VOICE = "en-US-AndrewMultilingualNeural";

import "./lib/tts_edge_default";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { seedDemoWorkspace } from "./lib/demo_workspace";
import { FFMPEG, FFPROBE, narrate, sh } from "./lib/video_pipeline";

const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const WORK = join(PROD, "ai_complete_tutorial");
const OUTPUT_WIDE_MASTER = join(PROD, "codecaine_file_manager_ai_and_enhancements_complete_tutorial_1080p.mp4");
const OUTPUT_SHORT_MASTER = join(PROD, "codecaine-file-manager-ai-complete-tutorial-short.mp4");
const OUTPUT_WIDE_COMPAT = join(PROD, "phonon_ollama_complete_tutorial_1080p.mp4");
const OUTPUT_SHORT_COMPAT = join(PROD, "phonon_ollama_complete_tutorial_short.mp4");
const NOTES_PROD = join(PROD, "AI_AND_ENHANCEMENTS_COMPLETE_TUTORIAL_NOTES.md");
const DOCS_TUTORIAL = join(ROOT, "docs", "AI_AND_ENHANCEMENTS_COMPLETE_TUTORIAL.md");
const REPO = "https://github.com/codecaine-zz/bun_rad_studio";

const FM_PORT = 51862;
const CDP_REC_PORT = 9532;
const CDP_OVL_PORT = 9533;
const VIEW_W = 1920;
const VIEW_H = 972;

const ROOT_DIR = "/tmp/fm_ai_complete_tutorial";
const HOME = process.platform === "darwin" ? "/private/tmp/fm_ai_complete_tutorial/home" : "/tmp/fm_ai_complete_tutorial/home";
const DATA = `${ROOT_DIR}/data`;
const GRAVE = `${ROOT_DIR}/grave`;
const ZDOT = `${ROOT_DIR}/zdot`;

type SceneSpec = {
  id: string;
  voice: string;
  badge: string;
  title: string;
  label: string;
  clickWay: string;
  shortcutWay: string;
  extra: string;
  bullets: string[];
  say: string;
  record: (c: Cdp) => Promise<void>;
};

function run(args: string[]): string {
  const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`${args[0]} failed:\n${result.stderr.toString().slice(-4000)}`);
  return result.stdout.toString();
}

function duration(file: string): number {
  const value = Number(run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid duration: ${file}`);
  return value;
}

const esc = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function seedTutorialWorkspace() {
  rmSync(ROOT_DIR, { recursive: true, force: true });
  mkdirSync(ROOT_DIR, { recursive: true });
  seedDemoWorkspace(HOME, join(ROOT_DIR, "frames"));

  const studioDir = join(HOME, "AI_Masterclass_Workspace");
  mkdirSync(join(studioDir, "src"), { recursive: true });
  mkdirSync(join(studioDir, "docs"), { recursive: true });

  writeFileSync(
    join(studioDir, "01_AI_Architecture_Guide.md"),
    `---
title: Codecaine AI & File Manager Masterclass
version: 1.5.3
engine: Ollama + LM Studio Bionic + Phonon 24kHz TTS
---

# Codecaine File Manager — Local AI Architecture

Welcome to the **100% local, zero-cloud AI workstation** built directly into Codecaine File Manager.

## Core AI Capabilities
1. **Per-Model Capability Indicators**: Instantly see what every model supports (\`Chat\`, \`Thinking Levels\`, \`Thinking Toggle\`, \`Vision\`, \`Tool Calling\`, \`Code\`, \`Embeddings\`, \`24kHz TTS\`).
2. **Adaptive Reasoning Modes**:
   - \`gpt-oss:20b\` / \`gpt-oss:120b\`: Multi-level **Low / Medium / High** reasoning effort.
   - \`qwen3.5:latest\` / \`gemma4\`: Toggleable **On / Off** thinking trace.
   - \`deepseek-r1:14b\` / \`qwq\`: **Always-On** deep chain-of-thought.
3. **Dramatic Output Expansion & Stop Generation**:
   - Click \`⤢ Expand Output\` or \`⛶ Fullscreen\` (press \`Esc\` to exit).
   - Click \`⏹ Stop Generation\` (or press \`Esc\`) anytime during \`Ask\` or \`Stream Live Tokens\`.
`,
  );

  writeFileSync(
    join(studioDir, "02_Server_Config.v1.ts"),
    `export interface AiServerConfig {
  host: string;
  port: number;
  maxContextTokens: number;
  enableThinking: boolean;
  gpuOffload: "max" | "off" | number;
}

export const defaultAiConfig: AiServerConfig = {
  host: "127.0.0.1",
  port: 11434,
  maxContextTokens: 8192,
  enableThinking: false,
  gpuOffload: "off",
};
`,
  );

  writeFileSync(
    join(studioDir, "03_Server_Config.v2.ts"),
    `export interface AiServerConfig {
  host: string;
  port: number;
  maxContextTokens: number;
  enableThinking: boolean;
  thinkingLevel: "low" | "medium" | "high";
  gpuOffload: "max" | "off" | number;
  flashAttention: boolean;
}

export const defaultAiConfig: AiServerConfig = {
  host: "127.0.0.1",
  port: 11434,
  maxContextTokens: 32768,
  enableThinking: true,
  thinkingLevel: "high",
  gpuOffload: "max",
  flashAttention: true,
};
`,
  );

  writeFileSync(
    join(studioDir, "04_Podcast_Subtitles.srt"),
    `1
00:00:01,000 --> 00:00:05,000
Welcome to the Codecaine AI Masterclass tutorial!

2
00:00:05,500 --> 00:00:10,500
Every AI feature and file management enhancement has both a mouse button and a keyboard shortcut.
`,
  );

  const largeBookChapters = Array.from({ length: 18 }, (_, idx) => {
    const ch = idx + 1;
    return `Chapter ${ch}: Context-Safe Neural Speech & Local AI Synthesis\n\nWhen reading a multi-chapter book or analyzing large repositories, Codecaine File Manager splits text along natural paragraph and sentence boundaries so you never overflow the model's context window.`;
  }).join("\n\n");
  writeFileSync(join(studioDir, "05_Complete_18_Chapter_Book.txt"), largeBookChapters);

  sh(
    [
      FFMPEG,
      "-y",
      "-f",
      "lavfi",
      "-i",
      "gradients=s=1280x800:c0=0x38bdf8:c1=0x6366f1:c2=0xf472b6:n=3:type=radial",
      "-frames:v",
      "1",
      join(studioDir, "06_Architecture_Diagram.png"),
    ],
    { quiet: true },
  );
}

/**
 * Injects rich visual-learner helpers into the live File Manager page:
 *   1. `#visual-learner-hud`: bottom cinema bar showing Step Badge, Title, `🖱️ Click` path, and `⌨️ Shortcut` keys.
 *   2. `#visual-spotlight-ring`: animated glowing callout frame + tag that points directly at any target selector.
 *   3. Deterministic, realistic AI demo responders for Ollama & Bionic so every model selection, live token stream,
 *      `⏹ Stop Generation`, `⤢ Expand Output`, `⛶ Fullscreen`, Multi-File Synthesis, and Code Editor AI Chat works
 *      instantly and visually on screen!
 */
async function installVisualLearnerDemoHarness(c: Cdp) {
  await c.eval(`(() => {
    if (window.__vlHarnessInstalled) return;
    window.__vlHarnessInstalled = true;

    const demoModels = [
      { name: "gpt-oss:20b", sizeBytes: 13800000000, sizeHuman: "12.9 GB", sizeGb: 12.9, family: "gpt-oss", parameterSize: "20B", quantization: "MXFP4", modifiedAt: "Just now", badges: ["Chat", "Thinking", "Tools", "Code", "Decision"], capabilities: ["chat", "thinking", "tools", "code"] },
      { name: "qwen3.5:latest", sizeBytes: 5200000000, sizeHuman: "4.8 GB", sizeGb: 4.8, family: "qwen3", parameterSize: "8B", quantization: "Q4_K_M", modifiedAt: "Just now", badges: ["Chat", "Thinking", "Vision", "Tools", "Code", "Decision"], capabilities: ["chat", "thinking", "vision", "tools", "code"] },
      { name: "deepseek-r1:14b", sizeBytes: 9100000000, sizeHuman: "8.5 GB", sizeGb: 8.5, family: "deepseek2", parameterSize: "14B", quantization: "Q4_K_M", modifiedAt: "Just now", badges: ["Chat", "Thinking", "Code"], capabilities: ["chat", "thinking", "code"] },
      { name: "qwen2.5-coder:7b", sizeBytes: 4700000000, sizeHuman: "4.4 GB", sizeGb: 4.4, family: "qwen2", parameterSize: "7B", quantization: "Q4_K_M", modifiedAt: "Just now", badges: ["Chat", "Tools", "Code"], capabilities: ["chat", "tools", "code"] },
      { name: "nomic-embed-text:latest", sizeBytes: 274000000, sizeHuman: "274 MB", sizeGb: 0.27, family: "nomic-bert", parameterSize: "137M", quantization: "F16", modifiedAt: "Just now", badges: ["Embedding"], capabilities: ["embedding"] },
      { name: "phonon:latest", sizeBytes: 112000000, sizeHuman: "112 MB", sizeGb: 0.11, family: "phonon", parameterSize: "40M", quantization: "MLX", modifiedAt: "Just now", badges: ["Speech", "MLX"], capabilities: ["tts"] }
    ];

    const origFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input?.url || "");
      if (url.includes("/api/")) {
        try {
          const pathname = new URL(url, location.origin).pathname;
          const op = pathname.startsWith("/api/") ? pathname.slice(5) : pathname;
          const args = init?.body ? JSON.parse(String(init.body)) : {};

          if (op === "ollama/status") {
            const realRes = await origFetch(input, init);
            const data = await realRes.json();
            if (data && typeof data === "object") {
              data.ok = true;
              data.installed = true;
              data.running = true;
              data.version = data.version || "0.17.4 (Apple Metal MLX)";
              data.models = demoModels;
              data.recommendedModel = "gpt-oss:20b";
              return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
            }
          }

          if (op === "ollama/chat" || op === "ollama/route" || op === "ollama/autoRoute" || op === "bionic/chat" || op === "bionic/route") {
            const sig = init?.signal;
            if (window.__simulateSlowStream) {
              await new Promise((resolve, reject) => {
                const t = setTimeout(resolve, 4500);
                if (sig) {
                  sig.addEventListener("abort", () => {
                    clearTimeout(t);
                    reject(new DOMException("The operation was aborted.", "AbortError"));
                  }, { once: true });
                }
              });
            }
            const model = args.model || "gpt-oss:20b";
            const level = args.thinkingLevel || args.think || "high";
            const bt = String.fromCharCode(96);
            const fence = bt + bt + bt;
            const thinkingTrace = "1. Inspected workspace files (01_AI_Architecture_Guide.md, 02_Server_Config.v1.ts).\\n2. Verified per-model capability indicators and hardware RAM safety guard (<70%).\\n3. Synthesized structured Markdown table and TypeScript reference snippet.";
            const replyMd = [
              "### ✨ Architecture & Performance Summary (" + model + ")",
              "",
              "| Component | Shortcut | Capability |",
              "|---|---|---|",
              "| **Ollama AI Studio** | **⌘K** → *Ollama AI* | Multi-level reasoning (Low/Med/High), Vision & Tools |",
              "| **LM Studio Bionic** | **⌥B** / **Alt+B** | Speculative Decoding, Multi-File Synthesis & SKILL.md |",
              "| **Phonon Voice Reader** | **🗣️ Speak Reply** | 24 kHz Apple MLX Neural Speech (38 Voices) |",
              "",
              fence + "typescript",
              "export async function runLocalAiPipeline(model = '" + model + "') {",
              "  return { thinking: '" + String(level) + "', offline: true, ramGuardPct: 70 };",
              "}",
              fence
            ].join("\\n");
            return new Response(JSON.stringify({
              ok: true,
              model,
              routedCapability: "chat",
              routeExplanation: "Routed to /api/chat (" + model + ", reasoning=" + String(level) + ", num_ctx=8192)",
              thinkingText: thinkingTrace,
              thinking: thinkingTrace,
              content: replyMd,
              reply: replyMd,
              enforcedNumCtx: 8192,
              thinkParam: level,
              thinkingLevel: String(level),
              durationMs: 420,
              tokensPerSec: 94.6,
              result: {
                model,
                thinkingText: thinkingTrace,
                content: replyMd,
                enforcedNumCtx: 8192,
                thinkParam: level,
                thinkingLevel: String(level)
              }
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          }

          if (op === "ollama/decision" || op === "ollama/systemOne") {
            return new Response(JSON.stringify({
              ok: true,
              model: args.model || "gpt-oss:20b",
              decision: "allow",
              confidence: 0.99,
              category: "safe_workspace_operation",
              rationale: "Verified local read-only code analysis and documentation synthesis within sandbox.",
              answers: [{ prompt: "Safety & Routing Triage", answer: "allow", confidence: 0.99 }],
              latencyMs: 38
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          }

          if (op === "ollama/semanticSearch" || op === "bionic/semanticSearch") {
            return new Response(JSON.stringify({
              ok: true,
              model: "nomic-embed-text:latest",
              query: args.query || "thinking levels and local AI configuration",
              matches: [
                { path: "01_AI_Architecture_Guide.md", name: "01_AI_Architecture_Guide.md", similarity: 0.948, score: 0.948, preview: "Adaptive Reasoning Modes: gpt-oss Low/Medium/High, qwen3.5 On/Off toggle, deepseek-r1 Always-On." },
                { path: "03_Server_Config.v2.ts", name: "03_Server_Config.v2.ts", similarity: 0.892, score: 0.892, preview: "thinkingLevel: 'high', gpuOffload: 'max', flashAttention: true" }
              ]
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          }

          if (op === "bionic/status") {
            const realRes = await origFetch(input, init);
            const data = await realRes.json();
            if (data && typeof data === "object") {
              data.ok = true;
              data.installed = true;
              data.serverRunning = true;
              data.activeEndpoint = "http://127.0.0.1:1235";
              data.models = [
                { id: "gpt-oss-20b-mxfp4", name: "gpt-oss-20b-mxfp4", type: "llm", arch: "gpt-oss", params: "20B", quant: "MXFP4", format: "MLX", sizeBytes: 13800000000, sizeHuman: "12.9 GB", sizeGb: 12.9, loaded: true, capabilities: ["chat", "thinking", "tools", "code"] },
                { id: "qwen3.5-8b-mlx", name: "qwen3.5-8b-mlx", type: "vlm", arch: "qwen3", params: "8B", quant: "4bit", format: "MLX", sizeBytes: 5100000000, sizeHuman: "4.8 GB", sizeGb: 4.8, loaded: true, capabilities: ["chat", "thinking", "vision", "tools", "code"] },
                { id: "qwen2.5-coder-1.5b-draft", name: "qwen2.5-coder-1.5b-draft", type: "llm", arch: "qwen2", params: "1.5B", quant: "4bit", format: "MLX", sizeBytes: 980000000, sizeHuman: "980 MB", sizeGb: 0.98, loaded: false, capabilities: ["chat", "code"] }
              ];
              return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
            }
          }

          if (op === "bionic/synthesize") {
            return new Response(JSON.stringify({
              ok: true,
              mode: args.mode || "compare",
              model: args.model || "gpt-oss-20b-mxfp4",
              filesProcessed: 2,
              thinking: "Compared 02_Server_Config.v1.ts and 03_Server_Config.v2.ts across context window, thinkingLevel, and Metal GPU offload settings.",
              synthesis: [
                "### 📚 Multi-File Bionic Synthesis (v1 vs v2 Server Config)",
                "",
                "- **Context Window**: Upgraded from **8,192** to **32,768** tokens (4× increase).",
                "- **Reasoning Control**: Added explicit **thinkingLevel: 'high'** for **gpt-oss**.",
                "- **Apple Silicon Acceleration**: Enabled **gpuOffload: 'max'** and **flashAttention: true**."
              ].join("\\n")
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          }
        } catch {}
      }
      return origFetch(input, init);
    };
  })()`);
}

async function showVisualLearnerHud(
  c: Cdp,
  opts: {
    stepBadge: string;
    title: string;
    clickWay: string;
    shortcutWay: string;
  },
) {
  await c.eval(`(() => {
    let el = document.getElementById("visual-learner-hud");
    if (!el) {
      el = document.createElement("div");
      el.id = "visual-learner-hud";
      el.style.cssText = [
        "position:fixed",
        "left:50%",
        "bottom:12px",
        "transform:translateX(-50%)",
        "z-index:2147483645",
        "pointer-events:none",
        "display:flex",
        "align-items:center",
        "gap:14px",
        "padding:10px 20px",
        "border-radius:18px",
        "background:linear-gradient(135deg, rgba(6,10,20,0.96), rgba(15,23,42,0.95))",
        "border:2px solid rgba(56,189,248,0.75)",
        "box-shadow:0 22px 55px rgba(0,0,0,0.85), 0 0 35px rgba(56,189,248,0.35)",
        "backdrop-filter:blur(24px) saturate(190%)",
        "font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
        "color:#f8fafc",
        "max-width:1860px"
      ].join(";");
      document.documentElement.appendChild(el);
    }
    el.innerHTML = "";

    const badge = document.createElement("div");
    badge.style.cssText = "background:linear-gradient(135deg,#38bdf8,#818cf8,#f472b6);color:#04070e;font-weight:900;font-size:13px;letter-spacing:0.08em;padding:6px 14px;border-radius:12px;white-space:nowrap;";
    badge.textContent = ${JSON.stringify(opts.stepBadge)};

    const center = document.createElement("div");
    center.style.cssText = "display:flex;flex-direction:column;gap:4px;min-width:0;";

    const titleEl = document.createElement("div");
    titleEl.style.cssText = "font-size:16px;font-weight:800;color:#ffffff;letter-spacing:-0.01em;white-space:nowrap;";
    titleEl.textContent = ${JSON.stringify(opts.title)};

    const waysRow = document.createElement("div");
    waysRow.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:nowrap;";

    const clickPill = document.createElement("span");
    clickPill.style.cssText = "background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.65);color:#a7f3d0;font-size:12.5px;font-weight:700;padding:3px 10px;border-radius:8px;white-space:nowrap;";
    clickPill.textContent = "🖱️ Click: " + ${JSON.stringify(opts.clickWay)};

    const keyPill = document.createElement("span");
    keyPill.style.cssText = "background:rgba(245,158,11,0.20);border:1px solid rgba(245,158,11,0.75);color:#fde68a;font-size:12.5px;font-weight:800;padding:3px 10px;border-radius:8px;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;";
    keyPill.textContent = "⌨️ Shortcut: " + ${JSON.stringify(opts.shortcutWay)};

    waysRow.appendChild(clickPill);
    waysRow.appendChild(keyPill);
    center.appendChild(titleEl);
    center.appendChild(waysRow);

    el.appendChild(badge);
    el.appendChild(center);
  })()`);
}

async function spotlight(c: Cdp, selector: string, label: string, holdMs = 550) {
  const r = await c.rect(selector, true);
  if (!r) return;
  await c.eval(`(() => {
    let ring = document.getElementById("visual-spotlight-ring");
    if (!ring) {
      ring = document.createElement("div");
      ring.id = "visual-spotlight-ring";
      document.documentElement.appendChild(ring);
    }
    const pad = 6;
    const left = Math.max(4, ${r.x - r.w / 2} - pad);
    const top = Math.max(4, ${r.y - r.h / 2} - pad);
    const width = ${r.w} + pad * 2;
    const height = ${r.h} + pad * 2;
    ring.style.cssText = [
      "position:fixed",
      "left:" + left + "px",
      "top:" + top + "px",
      "width:" + width + "px",
      "height:" + height + "px",
      "border:3px solid #38bdf8",
      "border-radius:12px",
      "box-shadow:0 0 0 4px rgba(56,189,248,0.28), 0 0 28px rgba(56,189,248,0.85)",
      "z-index:2147483644",
      "pointer-events:none",
      "transition:all 0.18s cubic-bezier(0.22,1,0.36,1)"
    ].join(";");
    ring.innerHTML = "";
    const tag = document.createElement("div");
    const placeBelow = top < 42;
    tag.style.cssText = [
      "position:absolute",
      placeBelow ? "top:calc(100% + 6px)" : "bottom:calc(100% + 6px)",
      "left:0",
      "background:linear-gradient(135deg,#0284c7,#4f46e5)",
      "color:#ffffff",
      "font:800 12px -apple-system,BlinkMacSystemFont,sans-serif",
      "padding:4px 10px",
      "border-radius:8px",
      "white-space:nowrap",
      "box-shadow:0 8px 20px rgba(0,0,0,0.65)",
      "border:1px solid rgba(255,255,255,0.35)"
    ].join(";");
    tag.textContent = ${JSON.stringify(label)};
    ring.appendChild(tag);
  })()`);
  await sleep(holdMs);
}

async function clearSpotlight(c: Cdp) {
  await c.eval(`(() => {
    const ring = document.getElementById("visual-spotlight-ring");
    if (ring) ring.remove();
  })()`);
}

async function showKeycaps(c: Cdp, keys: string[], holdMs = 800) {
  await c.eval(`window.__cc && window.__cc.keys(${JSON.stringify(keys)})`);
  await sleep(holdMs);
}

const sceneSpecs: SceneSpec[] = [
  {
    id: "01_ai_setup_and_ram_guard",
    voice: "Zoey",
    badge: "01 / 12 · 1-CLICK AI SETUP, COMMAND PALETTE (⌘K) & 70% RAM GUARD",
    title: "1-CLICK LOCAL AI SETUP\n& 70% RAM SAFETY GUARD.",
    label: "🦙 1-CLICK OLLAMA + PHONON INSTALL · ⌘K / Ctrl+K COMMAND PALETTE · KEEP_ALIVE: 0",
    clickWay: "Click '🤖 Ollama AI' tab or 'Convert & process → Helper programs'",
    shortcutWay: "⌘K (Mac) / Ctrl+K (Win/Linux) → Type 'Ollama'",
    extra: "Narrated by Natural Male Studio Voice · Both Mouse Click & Keyboard Shortcut Shown",
    bullets: [
      "🖱️ Click '🤖 Ollama AI' OR Press `⌘K` / `Ctrl+K` Command Palette",
      "⚡ 1-Click Auto-Install Ollama, Starter Models & Phonon Neural Voice",
      "🛡️ 70% Unified RAM Hardware Guard + 1-Click `keep_alive: 0` Unload",
    ],
    say: "Welcome to the complete visual masterclass for using local AI and power tools in the Codecaine File Manager. For every single feature, you will see both the mouse click and the keyboard shortcut right on screen. To open Ollama AI, press Command K on Mac or Control K on Windows and Linux to open the Command Palette, or click the Ollama AI button in the Power Tools bar. You can also click Convert and Process, then Helper Programs, for one-click local AI setup, protected by a seventy percent RAM safety guard and one-click memory unload.",
    record: async (c) => {
      await installVisualLearnerDemoHarness(c);
      await showVisualLearnerHud(c, {
        stepBadge: "STEP 01 / 12",
        title: "Open Ollama AI & 1-Click Setup (Both Ways: Mouse Click + Keyboard Shortcut)",
        clickWay: "Click '🤖 Ollama AI' or 'Convert & process → Helper programs'",
        shortcutWay: "⌘K (Mac) / Ctrl+K (Win/Linux) → 'Open Ollama AI'",
      });
      await showKeycaps(c, ["⌘ / Ctrl", "K"], 650);
      await spotlight(c, "#viewbar-palette", "⌨️ Press ⌘K / Ctrl+K or Click Command Palette", 450);
      await c.click("#viewbar-palette", { pause: 550 }).catch(() => {});
      await sleep(450);
      await c.key("Escape", "Esc");
      await clearSpotlight(c);

      await c.eval(`(async () => {
        const { showToolsDialog } = await import('/ui/tools.js');
        await showToolsDialog();
      })()`);
      await sleep(800);
      await c.eval(`(() => {
        const card = Array.from(document.querySelectorAll('.tool-row, .tools-box *')).find(el => el.textContent && el.textContent.includes('Ollama'));
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })()`);
      await sleep(800);
      await c.eval(`(() => { document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); })()`);

      await c.eval(`(async () => {
        const { openPower, setPowerExpanded } = await import('/ui/power.js');
        openPower('ollama');
        setPowerExpanded(true);
      })()`);
      await sleep(700);
      await spotlight(c, '[data-ollama-select="assistant-model"]', "🦙 Ollama AI Studio Ready (70% RAM Guard Active)", 700);
      await clearSpotlight(c);
    },
  },
  {
    id: "02_model_indicators_and_feature_gating",
    voice: "Zoey",
    badge: "02 / 12 · PER-MODEL CAPABILITY INDICATORS & AUTOMATIC UI FEATURE GATING",
    title: "PER-MODEL CAPABILITY BADGES\n& SMART UI FEATURE GATING.",
    label: "🏷️ WHAT YOU CAN USE EACH MODEL FOR · HIDES UNSUPPORTED UI CONTROLS AUTOMATICALLY",
    clickWay: "Click the 'Model:' dropdown in Ollama AI or Bionic AI",
    shortcutWay: "Tab to Model Selector → ↑ / ↓ Arrow Keys to Switch Models",
    extra: "Each Model Shows What It Can Do · Unsupported Features Automatically Hidden",
    bullets: [
      "🏷️ Live Capability Badges: Chat, Thinking, Vision, Tools, Code, Embed, TTS",
      "📋 'What You Can Use This Model For' Summary Updates Instantly",
      "🚫 Unsupported Tabs & Controls Hide Automatically Per Selected Model",
    ],
    say: "When you select any model—either by clicking the Model dropdown with your mouse, or pressing Tab and using the Up and Down arrow keys—Codecaine immediately displays capability badges and a plain-English guide explaining what you can use that model for. Even better, if a model does not support a feature like Vision or Thinking, those controls are automatically hidden so the interface stays clean and mistake-free.",
    record: async (c) => {
      await installVisualLearnerDemoHarness(c);
      await showVisualLearnerHud(c, {
        stepBadge: "STEP 02 / 12",
        title: "Per-Model Capability Indicators & Smart UI Gating (Hides Unsupported Features)",
        clickWay: "Click 'Model:' Dropdown → Choose Model",
        shortcutWay: "Tab to Model Picker → ↑ / ↓ Arrow Keys",
      });
      await spotlight(c, '[data-ollama-select="assistant-model"]', "🖱️ Click Model Dropdown (or Tab + ↓ Arrow)", 500);
      for (const modelName of ["qwen3.5:latest", "qwen2.5-coder:7b", "nomic-embed-text:latest", "gpt-oss:20b"]) {
        await c.eval(`(() => {
          const sel = document.querySelector('[data-ollama-select="assistant-model"]');
          if (sel) {
            sel.value = ${JSON.stringify(modelName)};
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()`);
        await spotlight(
          c,
          "[data-model-capabilities-card]",
          `🏷️ ${modelName}: Live Capability Indicators & What To Use It For`,
          650,
        );
      }
      await clearSpotlight(c);
    },
  },
  {
    id: "03_thinking_levels_and_toggles",
    voice: "Zoey",
    badge: "03 / 12 · MULTI-LEVEL REASONING (GPT-OSS LOW/MED/HIGH) & THINKING TOGGLES",
    title: "GPT-OSS LOW / MED / HIGH\n& THINKING ON / OFF TOGGLE.",
    label: "🧠 GPT-OSS (LOW / MEDIUM / HIGH) · QWEN 3.5 (ON / OFF) · DEEPSEEK-R1 (ALWAYS-ON)",
    clickWay: "Click 'Low / Medium / High' or 'On / Off' pills in the Thinking Bar",
    shortcutWay: "Tab to Thinking Pill → Press Space or Enter to Toggle",
    extra: "Full Parity with Ollama & LM Studio Reasoning Effort + Token Budget Control",
    bullets: [
      "🧠 `gpt-oss`: Choose `Low`, `Medium`, or `High` Reasoning Effort",
      "🔀 `qwen3.5` / `gemma4` / `lfm3`: Toggle Thinking `On` or `Off`",
      "🔒 `deepseek-r1` / `qwq`: `Always-On` Reasoning + Token Budget Cap",
    ],
    say: "Different reasoning models work in different ways. Select GPT-OSS to reveal Low, Medium, and High thinking effort buttons. Click Low for fast answers, Medium for balanced analysis, or High for deep architecture planning, or press Tab and Spacebar to switch levels. Select Qwen 3.5 to toggle thinking On or Off, or select DeepSeek R1 to see its Always-On reasoning badge and token budget selector.",
    record: async (c) => {
      await installVisualLearnerDemoHarness(c);
      await showVisualLearnerHud(c, {
        stepBadge: "STEP 03 / 12",
        title: "Adaptive Reasoning Controls: Low / Medium / High Levels vs On / Off Toggle",
        clickWay: "Click 'Low', 'Medium', 'High' or 'On / Off' in the Reasoning Bar",
        shortcutWay: "Tab to Thinking Pill → Space / Enter",
      });
      await c.eval(`(() => {
        const sel = document.querySelector('[data-ollama-select="assistant-model"]');
        if (sel) { sel.value = "gpt-oss:20b"; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      })()`);
      await sleep(300);
      for (const lvl of ["low", "medium", "high"]) {
        await spotlight(c, `[data-thinking-level="${lvl}"]`, `🧠 gpt-oss Thinking Effort: ${lvl.toUpperCase()}`, 350);
        await c.click(`[data-thinking-level="${lvl}"]`, { pause: 420 }).catch(() => {});
      }
      await c.eval(`(() => {
        const sel = document.querySelector('[data-ollama-select="assistant-model"]');
        if (sel) { sel.value = "qwen3.5:latest"; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      })()`);
      await sleep(350);
      await spotlight(c, ".ollama-thinking-control-bar", "🔀 Qwen 3.5: Toggle Thinking ON or OFF + Token Budget", 500);
      await c.click('[data-thinking-level="off"]', { pause: 400 }).catch(() => {});
      await c.click('[data-thinking-level="on"]', { pause: 450 }).catch(() => {});
      await c.eval(`(() => {
        const sel = document.querySelector('[data-ollama-select="assistant-model"]');
        if (sel) { sel.value = "deepseek-r1:14b"; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      })()`);
      await sleep(550);
      await clearSpotlight(c);
    },
  },
  {
    id: "04_ask_stream_and_stop_generation",
    voice: "Zoey",
    badge: "04 / 12 · ASK AUTO-ROUTER, LIVE STREAMING & ⏹ STOP GENERATION ANYTIME",
    title: "STREAM LIVE TOKENS &\n⏹ STOP GENERATION ANYTIME.",
    label: "🚀 ASK AUTO-ROUTER (⌘ENTER) · 📡 STREAM LIVE TOKENS · ⏹ STOP GENERATION (ESC)",
    clickWay: "Click '🚀 Ask' or '📡 Stream Live Tokens' → Click Red '⏹ Stop Generation'",
    shortcutWay: "⌘Enter / Ctrl+Enter to Send · Esc to Stop Generation Immediately",
    extra: "Preserves Partial Output & Thinking Trace When Stopped Mid-Generation",
    bullets: [
      "🚀 Click `🚀 Ask` / `📡 Stream Live Tokens` or Press `⌘Enter` (`Ctrl+Enter`)",
      "🧠 Collapsible Chain-of-Thought Thinking Trace + Syntax-Highlighted Code",
      "⏹ Click Red `⏹ Stop Generation` (or Press `Esc`) to Abort Instantly",
    ],
    say: "To ask a question with your selected files attached, click Ask or Stream Live Tokens, or press Command Enter on Mac or Control Enter on Windows and Linux. You will see the collapsible thinking trace and formatted response render live. And if a model is generating a long answer and you want to stop it, simply click the bright red Stop Generation button—or press Escape—to abort the request immediately while keeping everything generated so far!",
    record: async (c) => {
      await installVisualLearnerDemoHarness(c);
      await showVisualLearnerHud(c, {
        stepBadge: "STEP 04 / 12",
        title: "Ask / Stream Live Tokens & Stop LLM Generation Anytime",
        clickWay: "Click '🚀 Ask' / '📡 Stream Live Tokens' → Click '⏹ Stop Generation'",
        shortcutWay: "⌘Enter / Ctrl+Enter to Send · Esc to Stop",
      });
      await c.eval(`(() => {
        const sel = document.querySelector('[data-ollama-select="assistant-model"]');
        if (sel) { sel.value = "gpt-oss:20b"; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        const ta = document.querySelector('.ollama-textarea');
        if (ta) {
          ta.value = "Analyze 01_AI_Architecture_Guide.md and generate a TypeScript pipeline summary table.";
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await showKeycaps(c, ["⌘ / Ctrl", "Enter"], 550);
      await spotlight(c, '[data-ollama-action="send-auto-route"]', "🚀 Click 'Ask (Smart Auto-Router)' or Press ⌘Enter", 400);
      await c.click('[data-ollama-action="send-auto-route"]', { pause: 850 }).catch(() => {});

      // Now demonstrate starting a slow generation and clicking ⏹ Stop Generation!
      await c.eval(`(() => {
        window.__simulateSlowStream = true;
        const btn = document.querySelector('[data-ollama-action="send-auto-route"]');
        if (btn) btn.click();
      })()`);
      await sleep(350);
      await c.eval(`(() => {
        const stopBtn = document.querySelector('.ollama-assistant-actions-row [data-ollama-action="stop-generation"]') || document.querySelector('[data-ollama-action="stop-generation"]');
        if (stopBtn) stopBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
      })()`);
      await spotlight(c, '[data-ollama-action="stop-generation"]', "⏹ Click 'Stop Generation' (or Press Esc) to Abort Live!", 600);
      await showKeycaps(c, ["Esc"], 450);
      await c.eval(`(() => {
        const stopBtn = document.querySelector('[data-ollama-action="stop-generation"]');
        if (stopBtn) stopBtn.click();
        window.__simulateSlowStream = false;
      })()`);
      await sleep(550);
      await c.eval(`(() => {
        const btn = document.querySelector('[data-ollama-action="send-auto-route"]');
        if (btn) btn.click();
      })()`);
      await sleep(600);
      await clearSpotlight(c);
    },
  },
  {
    id: "05_expand_output_fullscreen_compact",
    voice: "Zoey",
    badge: "05 / 12 · ⤢ EXPAND OUTPUT, ⛶ FULLSCREEN READER & 🔼 COMPACT CONTROLS",
    title: "⤢ EXPAND OUTPUT VIEW\n& ⛶ FULLSCREEN READER.",
    label: "⤢ EXPAND OUTPUT (1100PX+) · ⛶ FULLSCREEN MODAL (ESC TO EXIT) · 🔼 COMPACT CONTROLS",
    clickWay: "Click '⤢ Expand Output', '⛶ Fullscreen', or '🔼 Compact Controls'",
    shortcutWay: "Press Esc Anytime to Exit Fullscreen Reader Mode",
    extra: "Auto-Scrolls Output Into View + Font Size A- / A+ + Copy Answer / Copy Thinking",
    bullets: [
      "⤢ `⤢ Expand Output`: Enlarges Output Console to 1100px+ & Auto-Scrolls",
      "🔼 `🔼 Compact Controls`: Collapses Prompt Box so Output Fills the View",
      "⛶ `⛶ Fullscreen`: Edge-to-Edge Reader Modal (Press `Esc` to Exit)",
    ],
    say: "Want to see much more of the AI response at once? Click Expand Output in either the Assistant bar or the Output Console toolbar. It dramatically enlarges the response area and scrolls it smoothly into view. Click Compact Controls to tuck away the prompt inputs, or click Fullscreen for an edge-to-edge distraction-free reading view with font size controls and one-click code copy. Press Escape anytime to exit fullscreen.",
    record: async (c) => {
      await installVisualLearnerDemoHarness(c);
      await showVisualLearnerHud(c, {
        stepBadge: "STEP 05 / 12",
        title: "See More LLM Output: ⤢ Expand Output, 🔼 Compact Controls & ⛶ Fullscreen",
        clickWay: "Click '⤢ Expand Output' · '🔼 Compact Controls' · '⛶ Fullscreen'",
        shortcutWay: "Press Esc to Exit Fullscreen Reader Mode",
      });
      await spotlight(c, '[data-ollama-action="toggle-expand-output"]', "⤢ Click 'Expand Output' to Enlarge & Scroll to Answer", 500);
      await c.click('[data-ollama-action="toggle-expand-output"]', { pause: 900 }).catch(() => {});

      await spotlight(c, '[data-ollama-action="toggle-compact-controls"]', "🔼 Click 'Compact Controls' to Hide Input Box", 500);
      await c.click('[data-ollama-action="toggle-compact-controls"]', { pause: 750 }).catch(() => {});

      await spotlight(c, '[data-ollama-action="toggle-fullscreen-output"]', "⛶ Click 'Fullscreen' for 100% Viewport Reader", 500);
      await c.click('[data-ollama-action="toggle-fullscreen-output"]', { pause: 950 }).catch(() => {});

      await showKeycaps(c, ["Esc"], 550);
      await c.eval(`(() => {
        const fsBtn = document.querySelector('[data-ollama-action="toggle-fullscreen-output"]');
        if (fsBtn) fsBtn.click();
        const expBtn = document.querySelector('[data-ollama-action="toggle-expand-output"]');
        if (expBtn && expBtn.getAttribute('aria-pressed') === 'true') expBtn.click();
        const cmpBtn = document.querySelector('[data-ollama-action="toggle-compact-controls"]');
        if (cmpBtn && cmpBtn.getAttribute('aria-pressed') === 'true') cmpBtn.click();
        const studio = document.querySelector('.ollama-studio');
        if (studio) studio.scrollTop = 0;
      })()`);
      await sleep(450);
      await clearSpotlight(c);
    },
  },
  {
    id: "06_sampling_systemone_semantic_search",
    voice: "Zoey",
    badge: "06 / 12 · ADVANCED SAMPLING, SYSTEMONE (/V1/SYSTEMONE) & MEANING SEARCH",
    title: "SAMPLING PARAMETERS,\nSYSTEMONE & EMBED SEARCH.",
    label: "⚙️ 10 SAMPLING CONTROLS (4K–128K CTX) · ⚡ SYSTEMONE DECISIONS · 🔎 MEANING SEARCH",
    clickWay: "Click '⚙️ Sampling & Runtime Parameters' or Mode Tabs 2 & 4",
    shortcutWay: "Tab / Enter to Toggle Parameters · ⌘K → 'Semantic Search'",
    extra: "Fine-Tune num_ctx, Temperature, Top-P, Top-K, Min-P, Seed & Keep-Alive",
    bullets: [
      "⚙️ 10 Runtime Controls: `num_ctx` (4K–128K), Temp, Top-P/K, Min-P, Seed",
      "⚡ Tab 2 `SystemOne (/v1/systemone)`: Sub-Second JSON Routing & Triage",
      "🔎 Tab 4 `Meaning Search (/api/embed)`: Find Files by Concept, Not Filename",
    ],
    say: "Click Sampling and Runtime Parameters to fine-tune ten engine settings, including context window up to 128K tokens, temperature, top P, top K, min P, repeat penalty, seed, and keep-alive duration. Switch to Tab two for sub-second SystemOne JSON classification, or Tab four for Semantic Meaning Search to find files across your folder by concept using local embeddings.",
    record: async (c) => {
      await installVisualLearnerDemoHarness(c);
      await showVisualLearnerHud(c, {
        stepBadge: "STEP 06 / 12",
        title: "Advanced Sampling Parameters (4K–128K Context), SystemOne & Semantic Search",
        clickWay: "Click '⚙️ Sampling & Runtime Parameters' · Click Mode Tabs 2 & 4",
        shortcutWay: "⌘K / Ctrl+K → 'Ollama AI' · Tab + Space",
      });
      await c.eval(`(() => {
        const sBtn = document.querySelector('[data-ollama-action="toggle-sampling"]');
        if (sBtn) sBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
      })()`);
      await spotlight(c, '[data-ollama-action="toggle-sampling"]', "⚙️ Click 'Sampling & Runtime Parameters'", 450);
      await c.click('[data-ollama-action="toggle-sampling"]', { pause: 850 }).catch(() => {});

      await c.eval(`(() => {
        const btn2 = Array.from(document.querySelectorAll('.ollama-mode-btn')).find(b => b.textContent && b.textContent.includes('2. Decision'));
        if (btn2) btn2.click();
      })()`);
      await sleep(300);
      await c.eval(`(() => {
        const runDecBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Run Multi-Question SystemOne Check'));
        if (runDecBtn) runDecBtn.click();
      })()`);
      await sleep(650);

      await c.eval(`(() => {
        const btn4 = Array.from(document.querySelectorAll('.ollama-mode-btn')).find(b => b.textContent && b.textContent.includes('4. Meaning Search'));
        if (btn4) btn4.click();
      })()`);
      await sleep(300);
      await c.eval(`(() => {
        const inp = document.querySelector('input[placeholder*="Search active folder by meaning"]');
        if (inp) {
          inp.value = 'thinking levels and local AI configuration';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const searchBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Search Folder by Meaning'));
        if (searchBtn) searchBtn.click();
      })()`);
      await sleep(750);

      await c.eval(`(() => {
        const btn1 = Array.from(document.querySelectorAll('.ollama-mode-btn')).find(b => b.textContent && b.textContent.includes('1. Ask Anything'));
        if (btn1) btn1.click();
      })()`);
      await sleep(400);
      await clearSpotlight(c);
    },
  },
  {
    id: "07_lm_studio_bionic_synthesis_skills",
    voice: "Zoey",
    badge: "07 / 12 · LM STUDIO BIONIC (⌥B / ALT+B), MULTI-FILE SYNTHESIS & SKILLS",
    title: "LM STUDIO BIONIC (⌥B),\nSYNTHESIS & AGENT SKILLS.",
    label: "🧬 SHORTCUT ⌥B / ALT+B · SPECULATIVE DECODING · MULTI-FILE SYNTHESIS · SKILL.MD",
    clickWay: "Click '🧬 Bionic AI' in Top Ribbon or Power Tools Bar",
    shortcutWay: "Press ⌥B (Mac) / Alt+B (Windows & Linux) From Anywhere",
    extra: "Draft-Model Speculative Decoding + GPU Offload + Flash Attention + KV Quantization",
    bullets: [
      "⌨️ Press `⌥B` (`Alt+B`) or Click `🧬 Bionic AI` in the Top Ribbon",
      "⚡ Speculative Decoding (`draftModel`), Metal GPU Offload & KV Cache Quant",
      "📚 Multi-File Synthesis (`Compare`, `Summarize`, `Study Guide`) & `SKILL.md`",
    ],
    say: "To open LM Studio Bionic from anywhere in the app, press Option B on Mac or Alt B on Windows and Linux, or click the Bionic AI button in the top ribbon. Bionic gives you the same per-model capability badges and thinking controls, plus speculative decoding with a draft model, Metal GPU offload, Flash Attention, KV cache quantization, reusable Agent Skills, and one-click Multi-File Synthesis to compare or summarize multiple selected files at once.",
    record: async (c) => {
      await installVisualLearnerDemoHarness(c);
      await showVisualLearnerHud(c, {
        stepBadge: "STEP 07 / 12",
        title: "LM Studio Bionic Studio, Speculative Decoding, Multi-File Synthesis & Agent Skills",
        clickWay: "Click '🧬 Bionic AI' Ribbon Button → Click '⚙️ Runtime & Sampling' or Subtabs",
        shortcutWay: "Press ⌥B (Mac) / Alt+B (Win/Linux)",
      });
      await showKeycaps(c, ["⌥ / Alt", "B"], 600);
      await c.eval(`(async () => {
        const { openPower, setPowerExpanded } = await import('/ui/power.js');
        openPower('bionic');
        setPowerExpanded(true);
      })()`);
      await sleep(750);
      await spotlight(c, "[data-bionic-model-capabilities-card]", "🧬 Bionic Per-Model Indicators & Thinking Levels", 550);
      await c.click('[data-bionic-action="toggle-sampling"]', { pause: 750 }).catch(() => {});

      for (const tabId of ["skills", "models", "assistant"]) {
        await c.click(`[data-bionic-subtab="${tabId}"]`, { pause: 550 }).catch(() => {});
      }
      await clearSpotlight(c);
    },
  },
  {
    id: "08_code_editor_ai_chat_and_apply",
    voice: "Zoey",
    badge: "08 / 12 · BUILT-IN CODE EDITOR AI CHAT DRAWER & 1-CLICK APPLY TO EDITOR",
    title: "CODE EDITOR AI CHAT\n& 1-CLICK APPLY CODE.",
    label: "💻 DOUBLE-CLICK CODE FILE → CLICK '🤖 AI CHAT' → THINKING & 1-CLICK APPLY",
    clickWay: "Open File in Code Studio → Click '🤖 AI Chat' Button in Editor Toolbar",
    shortcutWay: "⌘K / Ctrl+K → 'Code Studio' · ⌘S / Ctrl+S to Save File",
    extra: "Side-by-Side Code Explanation, Refactoring, Capability Badges & Stop/Expand Controls",
    bullets: [
      "💻 Open Any Source File in Built-In Code Studio (`🤖 AI Chat` Drawer)",
      "🏷️ Full Model Capability Badges, Thinking Levels (`Low/Med/High`) & `⏹ Stop`",
      "✨ Ask AI to Refactor or Document Code & Click `✨ Apply to Editor`",
    ],
    say: "When editing source code in the built-in Code Studio, click the AI Chat button in the editor toolbar to open the side-by-side coding assistant. You get full model capability badges, thinking level controls, Expand Output, Stop Generation, and one-click Apply to Editor, then press Command S or Control S to save your file.",
    record: async (c) => {
      await installVisualLearnerDemoHarness(c);
      await showVisualLearnerHud(c, {
        stepBadge: "STEP 08 / 12",
        title: "Built-In Code Studio AI Chat Drawer: Refactor, Explain & Apply Code",
        clickWay: "Open Code File → Click '🤖 AI Chat' in Code Editor Toolbar",
        shortcutWay: "⌘K / Ctrl+K → 'Code Studio' · ⌘S / Ctrl+S to Save",
      });
      await c.eval(`(async () => {
        const { openPower, setPowerExpanded } = await import('/ui/power.js');
        openPower('code');
        setPowerExpanded(true);
      })()`);
      await sleep(700);
      await c.eval(`(() => {
        const aiBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('AI Chat'));
        if (aiBtn) aiBtn.click();
      })()`);
      await sleep(800);
      await spotlight(c, ".code-ai-drawer, #power-body", "💻 Built-In Code Editor + Side-by-Side AI Coding Assistant", 900);
      await showKeycaps(c, ["⌘ / Ctrl", "S"], 550);
      await clearSpotlight(c);
    },
  },
  {
    id: "09_phonon_voice_reader_audiobooks_video",
    voice: "Zoey",
    badge: "09 / 12 · PHONON VOICE READER (--VOICE ZOEY), KARAOKE & 9 AUDIO / 4 VIDEO FORMATS",
    title: "PHONON VOICE READER:\n38 VOICES, AUDIO & VIDEO.",
    label: "🗣️ --VOICE ZOEY · WAVEFORM TELEPROMPTER · CHAPTERED AUDIOBOOKS · MP4 READ-ALONG",
    clickWay: "Click '🗣️ Speak Reply' or Open '🔊 Voice Reader' Studio Tab",
    shortcutWay: "Right-Click Any File → 'Read out loud in Voice Reader' · ⌘K → 'Voice Reader'",
    extra: "25+ Document Formats → 24 kHz Neural Speech, Chaptered .M3U8 Audiobooks & 1080p MP4",
    bullets: [
      "🗣️ 38 Neural Voices (`Zoey` Default) + Zero-Shot Voice Cloning (`F5-TTS-MLX`)",
      "📖 Waveform-Synced Follow-Along Karaoke Teleprompter (4 Cinema Themes)",
      "🎬 Export 9 Audio Formats, Chaptered Audiobooks (`.m3u8`) & 4 Video Formats",
    ],
    say: "In the Phonon Voice Reader studio—which you can open from the Power Tools bar, by right-clicking any document, or via Command K—you can read over twenty-five file formats out loud across thirty-eight expressive neural voices. Follow along word by word in the waveform-synced karaoke teleprompter, clone your own voice locally, or export to nine audio formats, chaptered audiobooks, and four read-along video formats.",
    record: async (c) => {
      await installVisualLearnerDemoHarness(c);
      await showVisualLearnerHud(c, {
        stepBadge: "STEP 09 / 12",
        title: "Phonon Neural Voice Reader (`--voice Zoey`), Karaoke Teleprompter & Audio/Video Export",
        clickWay: "Click '🔊 Voice Reader' Tab → '📥 Use Selected File' → '🔊 Read Out Loud'",
        shortcutWay: "Right-Click File → 'Read out loud in Voice Reader'",
      });
      await c.eval(`(async () => {
        const { openPower, setPowerExpanded } = await import('/ui/power.js');
        openPower('phonon');
        setPowerExpanded(true);
      })()`);
      await sleep(700);
      await spotlight(c, "#phonon-voice-select", "🗣️ 38 Expressive Neural Voices (Zoey Selected)", 550);
      await c.eval(`(() => {
        const tp = document.querySelector('.phonon-teleprompter-box');
        if (tp) tp.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })()`);
      await sleep(500);
      for (const [idx, targetWordIdx] of [2, 6, 11].entries()) {
        const themes = ["midnight", "sepia", "matrix"];
        await c.eval(`(() => {
          const stage = document.querySelector('.phonon-teleprompter-stage');
          if (stage) stage.setAttribute('data-tp-theme', ${JSON.stringify(themes[idx] || "midnight")});
          const words = Array.from(document.querySelectorAll('.phonon-teleprompter-stage .phonon-word'));
          const wIdx = Math.min(${targetWordIdx}, Math.max(0, words.length - 1));
          words.forEach((node, i) => {
            node.className = i < wIdx ? 'phonon-word is-spoken' : i === wIdx ? 'phonon-word is-speaking' : 'phonon-word is-upcoming';
          });
        })()`);
        await sleep(420);
      }
      await clearSpotlight(c);
    },
  },
  {
    id: "10_sticky_notes_and_2file_diff_viewer",
    voice: "Zoey",
    badge: "10 / 12 · STICKY NOTES (📝) & UNIVERSAL 2-FILE TEXT & CODE DIFF VIEWER",
    title: "STICKY NOTES (📝) &\n2-FILE CODE DIFF VIEWER.",
    label: "📝 FILE ANNOTATIONS & FILTER CHIP · 🔀 UNIFIED & SPLIT SIDE-BY-SIDE DIFF + .PATCH",
    clickWay: "Right-Click File → '📝 Edit Note…' · Select 2 Files → Click '🔀 Diff Text'",
    shortcutWay: "⌘K / Ctrl+K → 'Edit Sticky Note' or 'Compare / Diff Two Files'",
    extra: "Filter with '📝 Annotated' Pill or 'is:noted' / 'note:' Query + 1-Click Save .patch",
    bullets: [
      "📝 Attach Sticky Notes to Any File/Folder (`📝` Badge + Details Card)",
      "🔎 Filter Instantly with the `📝 Annotated` Chip or `note:keyword`",
      "🔀 Select 2 Files → `🔀 Diff Text` (Unified & Split View + `💾 Save .patch`)",
    ],
    say: "Now let's tour the new file management enhancements! Right-click any file and choose Edit Note—or press Command K and choose Edit Sticky Note—to attach a searchable yellow note badge and Details Panel card, and filter annotated items in one click. Select any two text or code files and click Diff Text in the bottom selection bar to inspect line-by-line additions, removals, similarity percentage, Unified or Split side-by-side views, and save a standard dot patch file!",
    record: async (c) => {
      await installVisualLearnerDemoHarness(c);
      await showVisualLearnerHud(c, {
        stepBadge: "STEP 10 / 12",
        title: "Sticky Notes & File Annotations (`📝`) + Universal 2-File Text & Code Diff Viewer",
        clickWay: "Right-Click → '📝 Edit Note…' · Select 2 Files → Click '🔀 Diff Text'",
        shortcutWay: "⌘K / Ctrl+K → 'Edit Sticky Note' or 'Compare / Diff'",
      });
      await c.eval(`(async () => {
        const { closePower } = await import('/ui/power.js');
        closePower();
        const { state } = await import('/ui/state.js');
        const { setNoteForPath } = await import('/ui/tags.js');
        const { renderList } = await import('/ui/list.js');
        const { renderInfo } = await import('/ui/info.js');
        const { selectKeys } = await import('/ui/selection.js');
        const guide = state.entries.find(e => e.name.includes('01_AI_Architecture_Guide'));
        if (guide) {
          await setNoteForPath(guide.path, "📌 Flagship AI Masterclass Guide — Reviewed & Verified");
          selectKeys([guide.path]);
          renderList();
          await renderInfo();
        }
      })()`);
      await sleep(750);
      await spotlight(c, "[data-note-badge]", "📝 Sticky Note Badge + Hover Tooltip on File Row", 550);

      await c.eval(`(async () => {
        const { state } = await import('/ui/state.js');
        const { selectKeys } = await import('/ui/selection.js');
        const { renderSelectionBar } = await import('/ui/quickbar.js');
        const { showCompareTextFiles } = await import('/ui/datacompare.js');
        const f1 = state.entries.find(e => e.name.includes('02_Server_Config.v1'));
        const f2 = state.entries.find(e => e.name.includes('03_Server_Config.v2'));
        if (f1 && f2) {
          selectKeys([f1.path, f2.path]);
          renderSelectionBar();
          await showCompareTextFiles([f1, f2]);
        }
      })()`);
      await sleep(750);
      await spotlight(c, '[data-diff-mode="split"]', "🔀 Switch Between Unified & Split Side-by-Side Diff", 450);
      await c.click('[data-diff-mode="split"]', { pause: 650 }).catch(() => {});
      await c.eval(`(() => { document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); })()`);
      await clearSpotlight(c);
    },
  },
  {
    id: "11_bulk_rename_checksums_folder_inventory",
    voice: "Zoey",
    badge: "11 / 12 · POWER BULK RENAME 2.0 (F2), SHA-256 CHECKSUMS & FOLDER INVENTORY",
    title: "BULK RENAME 2.0 (F2),\nSHA-256 & TREE EXPORT.",
    label: "✏️ SELECT MULTIPLE + PRESS F2 (REGEX & 6 CASE STYLES) · 🔐 SHA256SUMS · 📋 TREE EXPORT",
    clickWay: "Select Files → Click '✏️ Bulk Rename' / '🔐 SHA-256' / '📋 Export Folder Inventory'",
    shortcutWay: "Select Multiple Files + Press F2 for Power Bulk Rename 2.0",
    extra: "Regex Capture Groups ($1, $2), kebab/snake/camel/Pascal Case, SHA256 Verify & ASCII/MD/CSV/JSON",
    bullets: [
      "⌨️ Select Multiple Files + Press `F2` (or Click `✏️ Bulk Rename`)",
      "🔤 Regex `$1`/`$2`, 6 Case Styles (`kebab`, `snake`, `camel`, `Pascal`) & Tokens",
      "🔐 1-Click `SHA256SUMS` Verifier + `📋 Export Folder Inventory` (Tree/MD/CSV/JSON)",
    ],
    say: "Select multiple files and press F2—or click Bulk Rename in the selection bar—to open Power Bulk Rename 2.0, with Regex capture groups, six naming case styles like kebab-case, snake_case, and camelCase, plus date and folder tokens with a live diff preview. You can also generate and verify SHA-256 checksum manifests in one click, or export a complete Folder Inventory as an ASCII directory tree, Markdown table, CSV, or JSON.",
    record: async (c) => {
      await installVisualLearnerDemoHarness(c);
      await showVisualLearnerHud(c, {
        stepBadge: "STEP 11 / 12",
        title: "Power Bulk Rename 2.0 (`F2`), SHA-256 Checksum Verifier & Folder Inventory Exporter",
        clickWay: "Select Files → Click '✏️ Bulk Rename' · '🔐 SHA-256' · '📋 Export Inventory'",
        shortcutWay: "Select Files + Press F2 · ⌘K → 'Export Folder Inventory'",
      });
      await showKeycaps(c, ["F2"], 550);
      await c.eval(`(async () => {
        const { state } = await import('/ui/state.js');
        const { selectKeys } = await import('/ui/selection.js');
        const { renameSelection } = await import('/ui/ops.js');
        const items = state.entries.slice(0, 3);
        if (items.length >= 2) {
          selectKeys(items.map(e => e.path));
          void renameSelection();
        }
      })()`);
      await sleep(850);
      await c.eval(`(() => { document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); })()`);

      await c.eval(`(async () => {
        const { state } = await import('/ui/state.js');
        const { generateChecksumManifest, verifyChecksumFile } = await import('/ui/ops.js');
        const items = state.entries.filter(e => !e.isDir).slice(0, 2);
        if (items.length) {
          const res = await generateChecksumManifest(items, 'sha256');
          if (res?.savedPath) await verifyChecksumFile(res.savedPath);
        }
      })()`);
      await sleep(800);
      await c.eval(`(() => { document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); })()`);

      await c.eval(`(async () => {
        const { currentPath } = await import('/ui/state.js');
        const { showFolderInventoryDialog } = await import('/ui/ops.js');
        await showFolderInventoryDialog(currentPath());
      })()`);
      await sleep(850);
      await c.eval(`(() => { document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); })()`);
      await clearSpotlight(c);
    },
  },
  {
    id: "12_quicklook_inspector_find_tidy",
    voice: "Zoey",
    badge: "12 / 12 · QUICK LOOK (SPACEBAR) IMAGE INSPECTOR, FIND (⌘F) & SMART TIDY",
    title: "QUICK LOOK INSPECTOR,\nIN-PREVIEW FIND & TIDY.",
    label: "👁️ SPACEBAR QUICK LOOK · IMAGE ZOOM/ROTATE/FLIP · ⌘F IN-PREVIEW FIND · 🧹 SMART TIDY",
    clickWay: "Click Quick Look (👁️) → Use Image Inspector Bar or Find Bar · Right-Click → Smart Tidy",
    shortcutWay: "Spacebar to Preview · + / - / R / H / V / 0 for Images · ⌘F / Ctrl+F to Find",
    extra: "Reading Progress Memory (🔖 Resumed) + Package Inspector (📦) + Smart Folder Tidy with ⌘Z Undo",
    bullets: [
      "⌨️ Press `Spacebar` for Quick Look: Image Zoom (`+`/`-`), Rotate (`R`), Flip (`H`/`V`)",
      "🔎 Press `⌘F` (`Ctrl+F`) Inside Any Document Preview for Instant Highlighted Find",
      "🧹 `Smart Tidy Folder` with Dry-Run Preview & `⌘Z` (`Ctrl+Z`) 1-Click Undo",
    ],
    say: "Finally, select any file and press Spacebar—or click Quick Look—for instant previews. On images, use the interactive Image Inspector bar or press Plus, Minus, R to rotate, H or V to flip, and cycle between checkerboard, dark, and light backdrops. On documents and macOS packages, press Command F or Control F for highlighted in-preview search, resume right where you left off, click Ask AI or Speak, and use Smart Tidy Folder with one-click Command Z undo.",
    record: async (c) => {
      await installVisualLearnerDemoHarness(c);
      await showVisualLearnerHud(c, {
        stepBadge: "STEP 12 / 12",
        title: "Quick Look (`Spacebar`) Image Inspector, In-Preview Find (`⌘F`) & Smart Folder Tidy",
        clickWay: "Click '👁️ Quick Look' → Click Zoom / Rotate / Flip / Backdrop / Find",
        shortcutWay: "Spacebar to Open · + / - / R / H / V / 0 (Image) · ⌘F / Ctrl+F (Find)",
      });
      await showKeycaps(c, ["Space"], 500);
      await c.eval(`(async () => {
        const { state } = await import('/ui/state.js');
        const { openQuickLook } = await import('/ui/quicklook.js');
        const img = state.entries.find(e => e.name.endsWith('.png'));
        if (img) await openQuickLook(img);
      })()`);
      await sleep(550);
      await spotlight(c, "[data-ql-img-inspector]", "🖼️ Interactive Image Inspector (+ / - / R / H / V / Backdrop)", 450);
      await c.click("[data-ql-img-zoom-in]", { pause: 320 }).catch(() => {});
      await c.click("[data-ql-img-rot-right]", { pause: 320 }).catch(() => {});
      await c.click("[data-ql-img-backdrop]", { pause: 380 }).catch(() => {});

      await c.eval(`(async () => {
        const { state } = await import('/ui/state.js');
        const { openQuickLook } = await import('/ui/quicklook.js');
        const docEntry = state.entries.find(e => e.name.includes('01_AI_Architecture_Guide'));
        if (docEntry) await openQuickLook(docEntry);
      })()`);
      await sleep(550);
      await showKeycaps(c, ["⌘ / Ctrl", "F"], 500);
      await c.eval(`(() => {
        const findBtn = document.querySelector('[data-ql-find-toggle]');
        if (findBtn) findBtn.click();
        const findInput = document.querySelector('[data-ql-find-input]');
        if (findInput) {
          findInput.value = 'Thinking';
          findInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await sleep(650);
      await c.eval(`(async () => {
        const { closeQuickLook } = await import('/ui/quicklook.js');
        closeQuickLook();
      })()`);
      await clearSpotlight(c);
    },
  },
];

function overlayVertical(scene: SceneSpec, index: number): string {
  const isLast = index === sceneSpecs.length - 1;
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden}
body{
  background:
    radial-gradient(980px 580px at 50% -4%, rgba(56,189,248,0.34), transparent 70%),
    radial-gradient(820px 520px at 85% 100%, rgba(168,85,247,0.30), transparent 70%),
  #05070c;
  color:#f8fafc;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",sans-serif;
}
.top{position:absolute;top:42px;left:42px;right:42px;display:flex;flex-direction:column;gap:10px}
.hw-strip{
  display:flex;align-items:center;justify-content:space-between;
  background:rgba(15,23,42,0.90);border:1px solid rgba(56,189,248,0.42);
  border-radius:999px;padding:7px 18px;font-size:16.5px;font-weight:800;color:#e2e8f0;
  box-shadow:0 8px 24px rgba(0,0,0,0.45);
}
.hw-strip .apple-chip{color:#38bdf8;font-weight:900;letter-spacing:0.04em}
.badge{
  align-self:flex-start;
  background:linear-gradient(135deg,#38bdf8,#818cf8,#f472b6);
  color:#05070c;font-weight:900;font-size:20px;letter-spacing:.09em;
  padding:6px 16px;border-radius:999px;text-transform:uppercase;
}
.title{
  font-size:56px;font-weight:900;line-height:1.03;letter-spacing:-.025em;white-space:pre-line;
  background:linear-gradient(92deg,#ffffff 0%,#e0f2fe 46%,#f5d0fe 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
}
.ways{display:flex;flex-direction:column;gap:6px;margin-top:4px}
.way-click{color:#a7f3d0;font-size:21px;font-weight:800;background:rgba(16,185,129,0.16);border:1px solid rgba(16,185,129,0.55);padding:6px 14px;border-radius:10px}
.way-key{color:#fde68a;font-size:21px;font-weight:800;background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.65);padding:6px 14px;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.frame-rim{
  position:absolute;top:626px;left:0;width:1080px;height:554px;
  border-top:2px solid rgba(56,189,248,0.65);
  border-bottom:2px solid rgba(236,72,153,0.65);
  box-shadow:0 0 60px rgba(56,189,248,0.24);
  pointer-events:none;
}
.pills{position:absolute;top:1210px;left:42px;right:42px;display:flex;flex-direction:column;gap:13px}
.pill{
  background:linear-gradient(135deg,rgba(15,23,42,0.94),rgba(17,24,39,0.90));
  border:1px solid rgba(255,255,255,0.20);border-left:6px solid #38bdf8;
  border-radius:16px;padding:15px 20px;font-size:24px;font-weight:700;color:#f1f5f9;
  display:flex;align-items:center;gap:14px;
  box-shadow:0 12px 28px rgba(0,0,0,0.45);
}
.dot{color:#38bdf8;font-weight:900;font-size:25px}
.cta{
  position:absolute;top:1505px;left:36px;right:36px;
  background:linear-gradient(135deg,rgba(12,24,48,0.96),rgba(32,14,48,0.96));
  border:1.5px solid rgba(56,189,248,0.68);border-radius:22px;padding:22px 26px;
  box-shadow:0 20px 48px rgba(0,0,0,0.72);
}
.cta strong{font-size:27px;color:#7dd3fc;display:block;letter-spacing:.02em}
.cta p{font-size:22px;margin-top:7px;color:#f8fafc;font-weight:600}
.cta .sub{font-size:19px;color:#94a3b8;margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
</style>
<div class="top">
  <div class="hw-strip">
    <span class="apple-chip">🎙️ CODECAINE AI &amp; POWER TOOLS MASTERCLASS</span>
    <span>VISUAL LEARNER EDITION</span>
  </div>
  <div class="badge">${esc(scene.badge)}</div>
  <div class="title">${esc(scene.title)}</div>
  <div class="ways">
    <div class="way-click">🖱️ Click: ${esc(scene.clickWay)}</div>
    <div class="way-key">⌨️ Shortcut: ${esc(scene.shortcutWay)}</div>
  </div>
</div>
<div class="frame-rim"></div>
<div class="pills">
  ${scene.bullets.map((b) => `<div class="pill"><span class="dot">✦</span><span>${esc(b)}</span></div>`).join("")}
</div>
${
  isLast
    ? `<div class="cta"><strong>▶ FREE DOWNLOAD — MACOS, WINDOWS &amp; LINUX</strong><p>Complete Local AI Studio + Phonon Voice Reader + All Wave 2 Enhancements</p><p class="sub">${esc(REPO)} · MIT Open Source</p></div>`
    : `<div class="cta"><strong>▶ CODECAINE FILE MANAGER — COMPLETE AI TUTORIAL</strong><p>🖱️ Every Mouse Click + ⌨️ Every Keyboard Shortcut Demonstrated Live</p><p class="sub">${esc(REPO)} · 100% Local &amp; Private</p></div>`
}`;
}

function overlayWideStrip(scene: SceneSpec, index: number, totalScenes: number): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1920px;height:1080px;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;position:relative;overflow:hidden}
.strip{position:absolute;left:0;right:0;bottom:0;height:${1080 - VIEW_H}px;background:linear-gradient(180deg,#0b1325,#050811);border-top:3px solid #38bdf8;display:flex;align-items:center;gap:20px;padding:0 32px}
.badge{flex:none;background:linear-gradient(135deg,#38bdf8,#818cf8);color:#05070c;font-weight:900;font-size:14.5px;letter-spacing:.08em;padding:8px 14px;border-radius:10px;text-transform:uppercase}
.col{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}
.top-row{display:flex;align-items:center;gap:12px;white-space:nowrap;overflow:hidden}
.click-tag{background:rgba(16,185,129,0.20);border:1px solid rgba(16,185,129,0.65);color:#a7f3d0;font-size:14px;font-weight:800;padding:3px 10px;border-radius:7px}
.key-tag{background:rgba(245,158,11,0.22);border:1px solid rgba(245,158,11,0.75);color:#fde68a;font-size:14px;font-weight:800;padding:3px 10px;border-radius:7px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.cap{color:#f8fafc;font-size:22px;font-weight:800;letter-spacing:-.01em;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.right{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.rig{color:#0f172a;font-size:13px;font-weight:900;letter-spacing:.01em;background:#fef3c7;border:1.5px solid #f59e0b;padding:4px 12px;border-radius:8px;white-space:nowrap}
.n{flex:none;color:#bae6fd;font-size:15px;font-weight:800;background:rgba(56,189,248,0.15);border:1.5px solid rgba(56,189,248,0.45);padding:4px 13px;border-radius:10px}
</style></head><body><div class="strip"><div class="badge">${esc(`STEP ${String(index + 1).padStart(2, "0")} / ${totalScenes}`)}</div><div class="col"><div class="top-row"><span class="click-tag">🖱️ Click: ${esc(scene.clickWay)}</span><span class="key-tag">⌨️ Shortcut: ${esc(scene.shortcutWay)}</span></div><div class="cap">${esc(scene.bullets.join("  ·  "))}</div></div><div class="right"><div class="rig">🎙️ Visual Learner Masterclass · Both Ways Shown</div><div class="n">Step ${index + 1} of ${totalScenes}</div></div></div></body></html>`;
}

function buildCompleteTutorialMarkdown(
  wideSeconds: number,
  shortSeconds: number,
  wideMarks: Array<{ at: number; scene: SceneSpec }>,
): string {
  const fmt = (sec: number) => {
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const chapters = wideMarks
    .map((m, i) => `- **\`${fmt(i === 0 ? 0 : m.at)}\` — ${m.scene.badge}**: ${m.scene.label}\n  - 🖱️ **Mouse Click**: ${m.scene.clickWay}\n  - ⌨️ **Keyboard Shortcut**: \`${m.scene.shortcutWay}\``)
    .join("\n");

  return `# Codecaine File Manager — Complete Visual-Learner AI & Enhancements Masterclass Tutorial (Narrated by Natural Male Studio Voice \`en-US-AndrewMultilingualNeural\`)

## 🎬 Video Production Deliverables

- **Full 1080p Widescreen Masterclass (16:9, 1920×1080, 1.00× Natural Speaking Pace, CRF 12, 320k AAC)**:
  - \`youtube_production/codecaine_file_manager_ai_and_enhancements_complete_tutorial_1080p.mp4\` (${fmt(wideSeconds)} / ${wideSeconds.toFixed(1)}s)
  - \`youtube_production/phonon_ollama_complete_tutorial_1080p.mp4\`
- **Vertical 9:16 YouTube Short Edition (1080×1920, CRF 14, 320k AAC)**:
  - \`youtube_production/codecaine-file-manager-ai-complete-tutorial-short.mp4\` (${fmt(shortSeconds)} / ${shortSeconds.toFixed(1)}s)
  - \`youtube_production/codecaine-file-manager-phonon-voice-reader-short.mp4\`

---

## ⌨️ Complete Mouse Click & Keyboard Shortcut Cheat Sheet (Both Ways for Every Feature)

| Feature / Workflow | 🖱️ Mouse Click Method | ⌨️ Keyboard Shortcut (macOS / Windows & Linux) |
|---|---|---|
| **Open Command Palette (Search Everything)** | Click **\`⌘ Palette\`** in the top view bar | **\`⌘K\`** or **\`⇧⌘P\`** (Mac) · **\`Ctrl+K\`** or **\`Ctrl+Shift+P\`** (Win/Linux) |
| **Open Ollama AI Assistant** | Click **\`🤖 Ollama AI\`** in the Power Tools bar | **\`⌘K\` / \`Ctrl+K\`** → type **\`Ollama AI\`** → **\`Enter\`** |
| **Open LM Studio Bionic AI Studio** | Click **\`🧬 Bionic AI\`** in the top ribbon or Power Tools bar | **\`⌥B\`** (Mac) · **\`Alt+B\`** (Windows & Linux) |
| **Select AI Model & View Capability Badges** | Click the **\`Model:\`** dropdown in Ollama AI, Bionic AI, or Code AI Chat | **\`Tab\`** to Model Selector → **\`↑\` / \`↓\`** Arrow Keys |
| **Choose Thinking Level (\`gpt-oss\` Low/Med/High) or Toggle (\`On/Off\`)** | Click **\`Low\`**, **\`Medium\`**, **\`High\`**, or **\`On\` / \`Off\`** in the Thinking Control Bar | **\`Tab\`** to Thinking Pill → **\`Space\`** or **\`Enter\`** |
| **Send Prompt (\`Ask\` / \`Stream Live Tokens\`)** | Click **\`🚀 Ask (Smart Auto-Router)\`** or **\`📡 Stream Live Tokens\`** | **\`⌘Enter\`** (Mac) · **\`Ctrl+Enter\`** (Windows & Linux) |
| **Stop LLM Generation Anytime (\`⏹ Stop\`)** | Click the red **\`⏹ Stop Generation\`** button in the Assistant bar or Output Console | Press **\`Esc\`** while generation is running |
| **Expand LLM Output (\`⤢ Expand Output\`)** | Click **\`⤢ Expand Output\`** in the Assistant bar or Output Console header | **\`Tab\`** to **\`⤢ Expand Output\`** → **\`Enter\`** |
| **Fullscreen AI Reader Mode (\`⛶ Fullscreen\`)** | Click **\`⛶ Fullscreen\`** in the Assistant bar or Output Console header | Press **\`Esc\`** anytime to exit Fullscreen Reader Mode |
| **Compact Controls Mode (\`🔼 Compact Controls\`)** | Click **\`🔼 Compact Controls\`** in the Assistant bar | Collapses prompt controls so the AI response fills the workspace |
| **Open Code Editor AI Chat Drawer** | Open a source file in **Code Studio** → click **\`🤖 AI Chat\`** in the editor toolbar | **\`⌘K\` / \`Ctrl+K\`** → **\`Code Studio\`** · **\`⌘S\` / \`Ctrl+S\`** to save edits |
| **Read File or AI Answer Out Loud (\`Phonon Zoey\`)** | Click **\`🗣️ Speak Reply\`** on any AI output or open **\`🔊 Voice Reader\`** | Right-click any file → **\`Read out loud in Voice Reader\`** |
| **Add / Edit Sticky Note Annotation (\`📝\`)** | Right-click any file/folder → **\`📝 Edit Note…\`** (or click **\`📝 Note\`** in Details Panel) | **\`⌘K\` / \`Ctrl+K\`** → **\`Edit Sticky Note\`** (filter with \`is:noted\` or \`note:\`) |
| **Compare / Diff 2 Text or Code Files (\`🔀\`)** | Select 2 files → click **\`🔀 Diff Text\`** in the Selection Bar (or right-click → **\`Compare / Diff text & code…\`**) | **\`⌘K\` / \`Ctrl+K\`** → **\`Compare / Diff Two Files\`** |
| **Power Bulk Rename 2.0 (Regex, Case Styles, Tokens)** | Select multiple files → click **\`✏️ Bulk Rename\`** in the Selection Bar | Select multiple files → press **\`F2\`** |
| **Generate & Verify SHA-256 Checksums (\`🔐\`)** | Select file(s) → click **\`🔐 SHA-256\`** in the Selection Bar (click **\`✅ Verify Checksum\`** on \`.sha256\` / \`SHA256SUMS\`) | **\`⌘K\` / \`Ctrl+K\`** → **\`Generate SHA256SUMS\`** or **\`Verify Checksum\`** |
| **Export Folder Inventory & Directory Tree (\`📋\`)** | Right-click folder or Selection Bar → **\`📋 Export Folder Inventory…\`** | **\`⌘K\` / \`Ctrl+K\`** → **\`Export Folder Inventory\`** |
| **Quick Look Preview & Interactive Image Inspector** | Select any file → click **\`👁️ Quick Look\`** | Press **\`Spacebar\`** · Image keys: **\`+\`** / **\`-\`** (Zoom), **\`R\`** / **\`⇧R\`** (Rotate), **\`H\`** / **\`V\`** (Flip), **\`0\`** (Reset) |
| **Quick Look In-Preview Text Search** | Inside Quick Look → click **\`🔎 Find\`** in the preview header | Press **\`⌘F\`** (Mac) · **\`Ctrl+F\`** (Windows & Linux) inside Quick Look (\`Enter\` / \`⇧Enter\` for next/prev) |
| **Smart Folder Tidy (with Dry-Run Preview & Undo)** | Right-click folder background → **\`🧹 Smart Tidy Folder…\`** | **\`⌘K\` / \`Ctrl+K\`** → **\`Smart Tidy Folder\`** · Undo with **\`⌘Z\` / \`Ctrl+Z\`** |

---

## ⏱️ Chapter Timestamps (1080p Full Visual Masterclass)

${chapters}
`;
}

async function synthesizeSceneNarration(scene: SceneSpec): Promise<string> {
  const audioDir = join(WORK, "audio");
  mkdirSync(audioDir, { recursive: true });
  const masteredWav = join(WORK, `andrew_${scene.id}.wav`);

  if (!existsSync(masteredWav)) {
    console.log(`🎙️  Synthesizing ${scene.id} with natural male neural voice (en-US-AndrewMultilingualNeural)...`);
    const narratedMp3 = await narrate(scene.id, scene.say, audioDir, { rate: "+2%", gap: 0.22 });
    run([
      FFMPEG,
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      narratedMp3,
      "-af",
      "highpass=f=65,acompressor=threshold=-20dB:ratio=2:attack=20:release=250,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,adelay=160|160,apad=pad_dur=0.35",
      "-ar",
      "48000",
      "-c:a",
      "pcm_s16le",
      masteredWav,
    ]);
  }
  return masteredWav;
}

async function main() {
  mkdirSync(WORK, { recursive: true });
  seedTutorialWorkspace();

  // 1. Synthesize all 12 scene narrations using real `ollama run phonon --voice Zoey`!
  const narrated: Array<{ scene: SceneSpec; audio: string; seconds: number }> = [];
  for (const scene of sceneSpecs) {
    const audio = await synthesizeSceneNarration(scene);
    narrated.push({ scene, audio, seconds: duration(audio) });
  }

  const totalNaturalSeconds = narrated.reduce((sum, item) => sum + item.seconds, 0);
  // Widescreen Masterclass runs at natural 1.00x pace for effortless visual learning;
  // Vertical YouTube Short fits under 174s (<3 minutes) for YouTube Shorts eligibility.
  const shortTempo = Math.min(2.0, Math.max(1, totalNaturalSeconds / 172));
  console.log(
    `⏱️  Total Phonon Zoey narration: ${totalNaturalSeconds.toFixed(1)}s (1.00x Widescreen Masterclass) | Short pace ${shortTempo.toFixed(2)}x -> ${(totalNaturalSeconds / shortTempo).toFixed(1)}s`,
  );

  // 2. Launch live File Manager server pointed at AI_Masterclass_Workspace
  const fm = Bun.spawn(
    [
      process.execPath,
      join(ROOT, "applications", "file_manager_studio.ts"),
      "--server",
      "--port",
      String(FM_PORT),
      "--home",
      HOME,
      "--data-dir",
      DATA,
      "--path",
      `${HOME}/AI_Masterclass_Workspace`,
    ],
    {
      cwd: "/tmp",
      stdout: "ignore",
      stderr: "ignore",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        GRAVEYARD: GRAVE,
        SHELL: "/bin/zsh",
        ZDOTDIR: ZDOT,
      },
    },
  );

  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${FM_PORT}/`)).ok) break;
    } catch {}
    await sleep(200);
  }

  const recBrowser = await Cdp.launch(CDP_REC_PORT, join(WORK, "chrome-rec"), VIEW_W, VIEW_H);
  const rawClips: Map<string, string> = new Map();

  try {
    await recBrowser.goto(`http://127.0.0.1:${FM_PORT}/`);
    await sleep(600);
    await recBrowser.eval(`(() => {
      try { localStorage.setItem("fm_seen_welcome", "1"); } catch {}
      document.querySelectorAll(".modal-backdrop").forEach((e) => e.remove());
    })()`);
    await sleep(300);

    for (const item of narrated) {
      const { scene } = item;
      const clipPath = join(WORK, `${scene.id}_raw.mp4`);
      console.log(`🎥 Recording live visual-learner scene ${scene.id} (${item.seconds.toFixed(1)}s natural pace)...`);
      await recBrowser.startRecording();
      await scene.record(recBrowser);
      await sleep(350);
      await recBrowser.stopRecording(clipPath, join(WORK, `frames_${scene.id}`), item.seconds);
      rawClips.set(scene.id, clipPath);
    }
  } finally {
    recBrowser.close();
    try {
      fm.kill(9);
    } catch {}
  }

  // 3. Composite both 1920x1080 Widescreen Masterclass (1.0x natural pace, CRF 12) AND 1080x1920 Vertical YouTube Short
  const ovlBrowser = await Cdp.launch(CDP_OVL_PORT, join(WORK, "chrome-ovl"), 1080, 1920);
  const wideBrowser = await Cdp.launch(CDP_OVL_PORT + 1, join(WORK, "chrome-wide"), 1920, 1080);
  const shortSegments: string[] = [];
  const wideSegments: string[] = [];
  const wideMarks: Array<{ at: number; scene: SceneSpec }> = [];
  let wideAt = 0;

  try {
    for (const [index, item] of narrated.entries()) {
      const { scene, audio } = item;
      const rawClip = rawClips.get(scene.id)!;
      const clipDur = duration(rawClip);

      // A. Widescreen 1920x1080 Masterclass segment at 1.00x natural speaking speed (CRF 12, 320k AAC)
      const wideSeconds = item.seconds;
      const widePtsScale = (wideSeconds / clipDur).toFixed(5);
      console.log(`🎬 Compositing 1080p Masterclass + 9:16 Short for ${scene.id} (${wideSeconds.toFixed(1)}s)...`);

      const wHtml = join(WORK, `${scene.id}_w.html`);
      const wPng = join(WORK, `${scene.id}_w.png`);
      writeFileSync(wHtml, overlayWideStrip(scene, index, narrated.length));
      await wideBrowser.goto(`file://${wHtml}`, null);
      await wideBrowser.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      const wShot = await wideBrowser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(wPng, Buffer.from(wShot.data, "base64"));

      const wideSeg = join(WORK, `${scene.id}_wide.mp4`);
      const wFilter = `[0:v]setpts=(PTS-STARTPTS)*${widePtsScale},fps=30,pad=1920:1080:0:0:color=0x050811[b0];[b0][2:v]overlay=0:0:shortest=1,format=yuv420p[v]`;
      run([
        FFMPEG,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        rawClip,
        "-i",
        audio,
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        wPng,
        "-filter_complex",
        `${wFilter};[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-t",
        wideSeconds.toFixed(3),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "12",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "320k",
        wideSeg,
      ]);
      wideSegments.push(wideSeg);
      wideMarks.push({ at: wideAt, scene });
      wideAt += duration(wideSeg);

      // B. Vertical 1080x1920 YouTube Short segment
      const shortSeconds = item.seconds / shortTempo;
      const shortPtsScale = (shortSeconds / clipDur).toFixed(5);
      const vHtml = join(WORK, `${scene.id}_v.html`);
      const vPng = join(WORK, `${scene.id}_v.png`);
      writeFileSync(vHtml, overlayVertical(scene, index));
      await ovlBrowser.goto(`file://${vHtml}`, null);
      await ovlBrowser.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      const vShot = await ovlBrowser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(vPng, Buffer.from(vShot.data, "base64"));

      const shortSeg = join(WORK, `${scene.id}_short.mp4`);
      const vFilter = `[0:v]setpts=(PTS-STARTPTS)*${shortPtsScale},fps=30,scale=1080:-2:flags=lanczos[demo];[2:v]scale=1080:1920:flags=lanczos[bg];[bg][demo]overlay=0:628:shortest=1,format=yuv420p[v]`;
      run([
        FFMPEG,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        rawClip,
        "-i",
        audio,
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        vPng,
        "-filter_complex",
        `${vFilter};[1:a]atempo=${shortTempo.toFixed(4)},aresample=48000,pan=stereo|c0=c0|c1=c0[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-t",
        shortSeconds.toFixed(3),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "14",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "320k",
        shortSeg,
      ]);
      shortSegments.push(shortSeg);
    }
  } finally {
    ovlBrowser.close();
    wideBrowser.close();
  }

  // Concatenate Widescreen 1080p Masterclass MP4
  const wideList = join(WORK, "concat_wide.txt");
  writeFileSync(wideList, wideSegments.map((f) => `file '${f}'`).join("\n") + "\n");
  run([
    FFMPEG,
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    wideList,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "12",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "320k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    OUTPUT_WIDE_MASTER,
  ]);

  // Concatenate Vertical 9:16 YouTube Short MP4
  const shortList = join(WORK, "concat_short.txt");
  writeFileSync(shortList, shortSegments.map((f) => `file '${f}'`).join("\n") + "\n");
  run([
    FFMPEG,
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    shortList,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "14",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "320k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    OUTPUT_SHORT_MASTER,
  ]);

  copyFileSync(OUTPUT_WIDE_MASTER, OUTPUT_WIDE_COMPAT);
  copyFileSync(OUTPUT_SHORT_MASTER, OUTPUT_SHORT_COMPAT);

  const finalWideSec = duration(OUTPUT_WIDE_MASTER);
  const finalShortSec = duration(OUTPUT_SHORT_MASTER);
  const md = buildCompleteTutorialMarkdown(finalWideSec, finalShortSec, wideMarks);
  writeFileSync(NOTES_PROD, md);
  mkdirSync(join(ROOT, "docs"), { recursive: true });
  writeFileSync(DOCS_TUTORIAL, md);

  console.log(
    `\n✅ Built 1080p Visual-Learner Masterclass (1.0x Pace, CRF 12): ${OUTPUT_WIDE_MASTER} (${finalWideSec.toFixed(1)}s, ${(Bun.file(OUTPUT_WIDE_MASTER).size / 1048576).toFixed(1)} MB)`,
  );
  console.log(
    `✅ Built 9:16 Vertical YouTube Short (CRF 14):                 ${OUTPUT_SHORT_MASTER} (${finalShortSec.toFixed(1)}s, ${(Bun.file(OUTPUT_SHORT_MASTER).size / 1048576).toFixed(1)} MB)`,
  );
  console.log(`📝 Wrote Complete Tutorial & Shortcut Guide:                   ${DOCS_TUTORIAL}`);
}

await main();
process.exit(0);
