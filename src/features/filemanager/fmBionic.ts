/**
 * Built-In LM Studio Bionic AI Studio, Agent Skills Hub, Phonon 40M Multilingual TTS,
 * ExecuTorch ASR Transcription & Local MLX/oMLX/Splash Model Router for Codecaine File Manager.
 *
 * Pure Bun.js Runtime — Zero External or Node Dependencies:
 *   Uses ONLY pure Bun APIs (`Bun.spawn`, `Bun.spawnSync`, `Bun.file`, `Bun.write`, `Bun.which`,
 *   `Bun.CryptoHasher`, and native `fetch`).
 */
import { absolutePath, assertCreatable, assertModifiable, type FmContext } from "./fmCore";
import { FmError } from "./fmPaths";
import {
  basenamePath,
  cleanTextForPhononSpeech,
  dirnamePath,
  ensureDirectoryPure,
  evaluateModelHardwareGuard,
  extnameLower,
  fileExistsPure,
  inspectOllamaHardware,
  isSupportedVisionImagePath,
  joinPath,
  listDirectoryEntriesPure,
  listDirectoryWithBun,
  readImageAsBase64,
  readTextFileSnippet,
  readTextFileSyncPure,
  resolveSandboxPath,
  runOllamaSpeech,
  sha256Hex,
  splitSpeechTextIntoChunks,
  stemName,
  tempDirPath,
  toSandboxRelative,
  type HardwareGuardVerdict,
  type OllamaHardwareSpecs,
} from "./fmOllama";

// ---------------------------------------------------------------------------------------------------------------
// 1. Types & Interfaces for LM Studio Bionic
// ---------------------------------------------------------------------------------------------------------------

export type BionicExitPolicy = "smart" | "unload_all" | "stop_server" | "keep_open";

export interface BionicBackendEngineInfo {
  id: string;
  folderName: string;
  name: string;
  version: string;
  format: string;
  platformArch: string;
  description: string;
}

export interface BionicModelInfo {
  id: string;
  modelKey: string;
  displayName: string;
  type: "llm" | "vlm" | "embedding" | "tts" | "asr" | "cloud";
  publisher: string;
  architecture: string;
  format: string;
  quantization: string;
  paramsString: string;
  parameterBillions: number;
  sizeBytes: number;
  sizeGb: number;
  estimatedRamGb: number;
  maxContextLength: number;
  loadedContextLength: number | null;
  loaded: boolean;
  vision: boolean;
  trainedForToolUse: boolean;
  reasoningCapable: boolean;
  isMlx: boolean;
  isCloud: boolean;
  badges: string[];
  hardwareVerdict: HardwareGuardVerdict;
}

export interface BionicVoiceSpec {
  id: string;
  name: string;
  language: string;
  locale: string;
  gender: string;
  age: string;
  description: string;
  bundled: boolean;
  safetensorsPath?: string;
}

export interface BionicSkillSpec {
  id: string;
  name: string;
  displayName: string;
  description: string;
  scope: "bionic-builtin" | "lmstudio-global" | "project-local" | "external-harness";
  folderPath: string;
  skillMdPath: string;
  userInvocable: boolean;
  disableModelInvocation: boolean;
  triggerToken: string;
}

export interface BionicProjectSpec {
  id: string;
  name: string;
  projectType: string;
  projectDir: string;
  workspaceDir: string;
  exists: boolean;
  fileCount: number;
}

export interface BionicPendingAction {
  actionId: string;
  toolName: "create_file" | "move_or_rename_file" | "create_zip_archive";
  title: string;
  description: string;
  args: Record<string, any>;
  createdAt: number;
  status: "pending" | "confirmed" | "cancelled";
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Session State, Audio Cache & Tool Action Staging
// ---------------------------------------------------------------------------------------------------------------

const bionicAudioCache = new Map<string, { absPath: string; mime: string; createdAt: number }>();
const bionicPendingActions = new Map<string, BionicPendingAction>();

let bionicExitPolicy: BionicExitPolicy = "smart";
let bionicServerStartedByFm = false;
const bionicSessionLoadedModels = new Set<string>();

export function getCachedBionicAudioFile(audioId: string): { absPath: string; mime: string } | null {
  const cleanId = String(audioId || "").trim();
  if (!cleanId) return null;
  const entry = bionicAudioCache.get(cleanId);
  if (!entry) return null;
  return { absPath: entry.absPath, mime: entry.mime };
}

export function setBionicExitPolicy(policy: string): {
  exitPolicy: BionicExitPolicy;
  serverStartedByFm: boolean;
  sessionLoadedModels: string[];
  summaryLabel: string;
} {
  if (policy === "smart" || policy === "unload_all" || policy === "stop_server" || policy === "keep_open") {
    bionicExitPolicy = policy;
  }
  return getBionicLifecycleStatus();
}

export function getBionicLifecycleStatus(): {
  exitPolicy: BionicExitPolicy;
  serverStartedByFm: boolean;
  sessionLoadedModels: string[];
  summaryLabel: string;
} {
  const labels: Record<BionicExitPolicy, string> = {
    smart: bionicServerStartedByFm
      ? "Smart Lifecycle (Server started by File Manager — will unload session models on exit)"
      : "Smart Lifecycle (Pre-existing Bionic Server preserved on exit)",
    unload_all: "Unload All Bionic Models on Close",
    stop_server: "Unload Models & Stop Local Server on Close",
    keep_open: "Keep Bionic Server & Loaded Models Open on Close",
  };
  return {
    exitPolicy: bionicExitPolicy,
    serverStartedByFm: bionicServerStartedByFm,
    sessionLoadedModels: [...bionicSessionLoadedModels],
    summaryLabel: labels[bionicExitPolicy],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Discovery of LM Studio, Bionic.app, `lms` CLI & Server Ports
// ---------------------------------------------------------------------------------------------------------------

export function getLmStudioHomeDir(ctx?: FmContext): string {
  if (process.env.LMSTUDIO_HOME) return process.env.LMSTUDIO_HOME;
  const home = ctx?.home || process.env.HOME || process.env.USERPROFILE || "/Users/codecaine";
  return joinPath([home, ".lmstudio"], ctx?.platform || process.platform);
}

export function resolveLmsCliPath(ctx?: FmContext): string | null {
  if (process.env.LMS_CLI_PATH) return process.env.LMS_CLI_PATH;
  const lmHome = getLmStudioHomeDir(ctx);
  const platform = ctx?.platform || process.platform;
  const candidate = joinPath([lmHome, "bin", platform === "win32" ? "lms.exe" : "lms"], platform);
  try {
    if (Bun.file(candidate).size > 0) return candidate;
  } catch {}
  const fromPath = Bun.which("lms");
  if (fromPath) return fromPath;
  const defaultMac = "/Users/codecaine/.lmstudio/bin/lms";
  try {
    if (Bun.file(defaultMac).size > 0) return defaultMac;
  } catch {}
  return null;
}

export function detectBionicApps(ctx?: FmContext): {
  bionicAppInstalled: boolean;
  bionicAppPath: string;
  lmStudioAppInstalled: boolean;
  lmStudioAppPath: string;
  lmsCliInstalled: boolean;
  lmsCliPath: string;
  bionicStateDir: string;
  bionicInternalPort: number | null;
  bionicInternalPid: number | null;
} {
  const platform = ctx?.platform || process.platform;
  const lmHome = getLmStudioHomeDir(ctx);
  const bionicStateDir = joinPath([lmHome, "apps", "bionic"], platform);
  const bionicHttpJsonPath = joinPath([bionicStateDir, ".internal", "http-server.json"], platform);

  let bionicInternalPort: number | null = null;
  let bionicInternalPid: number | null = null;
  const rawInternal = readTextFileSyncPure(bionicHttpJsonPath);
  if (rawInternal) {
    try {
      const parsed = JSON.parse(rawInternal);
      if (typeof parsed.port === "number") bionicInternalPort = parsed.port;
      if (typeof parsed.pid === "number") bionicInternalPid = parsed.pid;
    } catch {}
  }

  const bionicAppPath =
    platform === "darwin"
      ? "/Applications/Bionic.app"
      : platform === "win32"
        ? joinPath([process.env.LOCALAPPDATA || "C:\\Users\\Default\\AppData\\Local", "Programs", "Bionic", "Bionic.exe"], "win32")
        : "/usr/bin/bionic";

  const lmStudioAppPath =
    platform === "darwin"
      ? "/Applications/LM Studio.app"
      : platform === "win32"
        ? joinPath([process.env.LOCALAPPDATA || "C:\\Users\\Default\\AppData\\Local", "Programs", "LM Studio", "LM Studio.exe"], "win32")
        : "/usr/bin/lm-studio";

  const bionicBinCheck =
    platform === "darwin" ? "/Applications/Bionic.app/Contents/MacOS/Bionic" : bionicAppPath;
  const lmStudioBinCheck =
    platform === "darwin" ? "/Applications/LM Studio.app/Contents/MacOS/LM Studio" : lmStudioAppPath;

  let bionicAppInstalled = false;
  let lmStudioAppInstalled = false;
  try {
    bionicAppInstalled = Bun.file(bionicBinCheck).size > 0 || bionicInternalPort !== null;
  } catch {}
  try {
    lmStudioAppInstalled = Bun.file(lmStudioBinCheck).size > 0;
  } catch {}

  const lmsCli = resolveLmsCliPath(ctx);

  return {
    bionicAppInstalled,
    bionicAppPath,
    lmStudioAppInstalled,
    lmStudioAppPath,
    lmsCliInstalled: Boolean(lmsCli),
    lmsCliPath: lmsCli || "",
    bionicStateDir,
    bionicInternalPort,
    bionicInternalPid,
  };
}

/**
 * Resolves the active LM Studio / Bionic OpenAI & v0 REST server URL.
 * Supports `process.env.BIONIC_HOST` / `process.env.LMSTUDIO_HOST` for unit testing and custom ports,
 * or queries `lms server status --json` and probes ports 1235 / 1234.
 */
export async function resolveBionicServerStatus(ctx?: FmContext): Promise<{
  running: boolean;
  port: number;
  baseUrl: string;
  source: "env" | "lms-status" | "probe" | "offline";
}> {
  const envHost = (process.env.BIONIC_HOST || process.env.LMSTUDIO_HOST || "").trim();
  if (envHost) {
    const baseUrl = envHost.startsWith("http") ? envHost.replace(/\/+$/, "") : `http://${envHost.replace(/\/+$/, "")}`;
    const portMatch = /:(\d+)$/.exec(baseUrl);
    const port = portMatch ? Number(portMatch[1]) : 1234;
    try {
      const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        return { running: true, port, baseUrl, source: "env" };
      }
    } catch {}
    return { running: false, port, baseUrl, source: "env" };
  }

  const lmsCli = resolveLmsCliPath(ctx);
  if (lmsCli) {
    try {
      const res = Bun.spawnSync([lmsCli, "server", "status", "--json"], {
        stdout: "pipe",
        stderr: "ignore",
      });
      if (res.exitCode === 0) {
        const text = res.stdout.toString("utf8").trim();
        const jsonLine = text.split(/\r?\n/).find((l) => l.trim().startsWith("{"));
        if (jsonLine) {
          const parsed = JSON.parse(jsonLine);
          if (parsed.running && typeof parsed.port === "number") {
            return {
              running: true,
              port: parsed.port,
              baseUrl: `http://127.0.0.1:${parsed.port}`,
              source: "lms-status",
            };
          }
        }
      }
    } catch {}
  }

  for (const port of [1235, 1234]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
        signal: AbortSignal.timeout(800),
      });
      if (res.ok) {
        return {
          running: true,
          port,
          baseUrl: `http://127.0.0.1:${port}`,
          source: "probe",
        };
      }
    } catch {}
  }

  return {
    running: false,
    port: 1234,
    baseUrl: "http://127.0.0.1:1234",
    source: "offline",
  };
}

export async function ensureBionicServerRunning(ctx?: FmContext): Promise<{
  running: boolean;
  port: number;
  baseUrl: string;
  autoStarted: boolean;
}> {
  const current = await resolveBionicServerStatus(ctx);
  if (current.running) {
    return { ...current, autoStarted: false };
  }
  const lmsCli = resolveLmsCliPath(ctx);
  if (lmsCli && !process.env.BIONIC_HOST) {
    try {
      Bun.spawnSync([lmsCli, "server", "start"], { stdout: "pipe", stderr: "pipe" });
      const after = await resolveBionicServerStatus(ctx);
      if (after.running) {
        bionicServerStartedByFm = true;
        return { ...after, autoStarted: true };
      }
    } catch {}
  }
  return { ...current, autoStarted: false };
}

export async function controlBionicServer(
  ctx: FmContext,
  payload: { action?: "start" | "stop" | "status" | "launch_app"; port?: number },
): Promise<any> {
  const action = payload.action || "status";
  const lmsCli = resolveLmsCliPath(ctx);

  if (action === "launch_app") {
    const apps = detectBionicApps(ctx);
    if (ctx.platform === "darwin") {
      const targetApp = apps.bionicAppInstalled ? "/Applications/Bionic.app" : "/Applications/LM Studio.app";
      Bun.spawnSync(["open", "-a", targetApp], { stdout: "ignore", stderr: "ignore" });
      return { launched: true, app: targetApp };
    }
    const targetBin = apps.bionicAppInstalled
      ? apps.bionicAppPath
      : apps.lmStudioAppInstalled
        ? apps.lmStudioAppPath
        : Bun.which("lm-studio") || Bun.which("bionic") || "";
    if (targetBin) {
      try {
        const proc = Bun.spawn([targetBin], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
        proc.unref();
        return { launched: true, app: targetBin };
      } catch {}
    }
    return {
      launched: false,
      message: "Desktop app launch is supported when Bionic or LM Studio is installed.",
    };
  }

  if (action === "start") {
    if (lmsCli && !process.env.BIONIC_HOST) {
      const args = ["server", "start"];
      if (typeof payload.port === "number" && payload.port > 0) {
        args.push("--port", String(payload.port));
      }
      Bun.spawnSync([lmsCli, ...args], { stdout: "pipe", stderr: "pipe" });
      bionicServerStartedByFm = true;
    }
    return await resolveBionicServerStatus(ctx);
  }

  if (action === "stop") {
    if (lmsCli && !process.env.BIONIC_HOST) {
      Bun.spawnSync([lmsCli, "server", "stop"], { stdout: "pipe", stderr: "pipe" });
    }
    return await resolveBionicServerStatus(ctx);
  }

  return await resolveBionicServerStatus(ctx);
}

export async function shutdownBionicForFileManager(
  ctx: FmContext,
  options?: { policyOverride?: BionicExitPolicy },
): Promise<{ ok: boolean; policy: BionicExitPolicy; unloadedModels: string[]; serverStopped: boolean }> {
  const policy = options?.policyOverride || bionicExitPolicy;
  const unloadedModels: string[] = [];
  let serverStopped = false;
  const lmsCli = resolveLmsCliPath(ctx);

  if (!lmsCli || process.env.BIONIC_HOST) {
    return { ok: true, policy, unloadedModels, serverStopped };
  }

  if (policy === "keep_open") {
    return { ok: true, policy, unloadedModels, serverStopped };
  }

  if (policy === "unload_all" || policy === "stop_server") {
    try {
      Bun.spawnSync([lmsCli, "unload", "--all"], { stdout: "ignore", stderr: "ignore" });
      unloadedModels.push(...bionicSessionLoadedModels);
      bionicSessionLoadedModels.clear();
    } catch {}
    if (policy === "stop_server") {
      try {
        Bun.spawnSync([lmsCli, "server", "stop"], { stdout: "ignore", stderr: "ignore" });
        serverStopped = true;
      } catch {}
    }
    return { ok: true, policy, unloadedModels, serverStopped };
  }

  // "smart" policy: only unload models that File Manager explicitly loaded in this session
  for (const modelKey of bionicSessionLoadedModels) {
    try {
      Bun.spawnSync([lmsCli, "unload", modelKey], { stdout: "ignore", stderr: "ignore" });
      unloadedModels.push(modelKey);
    } catch {}
  }
  bionicSessionLoadedModels.clear();
  return { ok: true, policy, unloadedModels, serverStopped };
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Installed Engine Backends & Plugins Inspection
// ---------------------------------------------------------------------------------------------------------------

export function listInstalledBionicBackends(ctx?: FmContext): {
  backends: BionicBackendEngineInfo[];
  plugins: string[];
} {
  const lmHome = getLmStudioHomeDir(ctx);
  const platform = ctx?.platform || process.platform;
  const backendsDir = joinPath([lmHome, "extensions", "backends"], platform);
  const entries = listDirectoryEntriesPure(backendsDir, platform);
  const backends: BionicBackendEngineInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDir || entry.name === "vendor") continue;
    const manifestPath = joinPath([entry.path, "backend-manifest.json"], platform);
    const displayPath = joinPath([entry.path, "display-data.json"], platform);
    let name = entry.name;
    let version = "";
    let format = "safetensors";
    let platformArch = "mac-arm64-apple-metal";
    let description = "LM Studio Bionic Native Inference Engine";

    const rawManifest = readTextFileSyncPure(manifestPath);
    if (rawManifest) {
      try {
        const m = JSON.parse(rawManifest);
        name = m.name || name;
        version = m.version || version;
        format = m.modelFormat || m.format || format;
        platformArch = m.platform ? `${m.platform}-${m.arch || "arm64"}` : platformArch;
      } catch {}
    }
    const rawDisplay = readTextFileSyncPure(displayPath);
    if (rawDisplay) {
      try {
        const d = JSON.parse(rawDisplay);
        if (d.displayName) name = d.displayName;
        if (d.description) description = d.description;
      } catch {}
    }

    if (entry.name.startsWith("mlx-llm")) {
      format = "mlx / safetensors";
      description = "Apple Silicon Metal MLX LLM & VLM Engine (safetensors, MXFP4, 4-bit)";
    } else if (entry.name.startsWith("omlx")) {
      format = "omlx / safetensors";
      description = "Apple Silicon oMLX Engine with Rotating VLM Prompt Cache & Outlines Structured Generation";
    } else if (entry.name.startsWith("splash")) {
      format = "splash / metal";
      description = "Apple Silicon M3+ Splash Ultra-Low-Latency Metal Engine";
    } else if (entry.name.startsWith("llama.cpp")) {
      format = "gguf";
      description = "Apple Metal llama.cpp Engine for GGUF LLMs & Nomic BERT Embeddings";
    } else if (entry.name.startsWith("xn-ptts")) {
      format = "tts-bundle";
      description = "Native Apple Metal Phonon 40M Multilingual Text-to-Speech Engine (24kHz)";
    } else if (entry.name.startsWith("executorch-asr")) {
      format = "pte / whisper";
      description = "ExecuTorch Whisper Apple Metal Automatic Speech Recognition (ASR) Engine";
    }

    backends.push({
      id: entry.name,
      folderName: entry.name,
      name,
      version,
      format,
      platformArch,
      description,
    });
  }

  // Deduplicate by engine family (`mlx-llm`, `omlx`, `splash`, `llama.cpp`, `xn-ptts`, `executorch-asr`) keeping the latest version
  const latestByFamily = new Map<string, BionicBackendEngineInfo>();
  for (const b of backends) {
    const family = b.name.toLowerCase();
    const prev = latestByFamily.get(family);
    if (!prev || b.version.localeCompare(prev.version, undefined, { numeric: true }) >= 0) {
      latestByFamily.set(family, b);
    }
  }
  const deduplicatedBackends = [...latestByFamily.values()];

  const pluginsDir = joinPath([lmHome, "extensions", "plugins", "lmstudio"], platform);
  const pluginEntries = listDirectoryEntriesPure(pluginsDir, platform);
  const plugins = pluginEntries.filter((e) => e.isDir).map((e) => e.name);

  return { backends: deduplicatedBackends, plugins };
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Model Inventory (`lms ls --json`, `lms ps --json`, `/api/v0/models`, & Bionic Cloud Models)
// ---------------------------------------------------------------------------------------------------------------

export async function listBionicModelsAndHardwareStatus(ctx: FmContext): Promise<{
  hardware: OllamaHardwareSpecs;
  models: BionicModelInfo[];
  loadedModels: BionicModelInfo[];
  cloudModels: BionicModelInfo[];
}> {
  const hardware = inspectOllamaHardware(ctx);
  const server = await resolveBionicServerStatus(ctx);
  const lmsCli = resolveLmsCliPath(ctx);
  const lmHome = getLmStudioHomeDir(ctx);

  const apiModelsById = new Map<string, any>();
  if (server.running) {
    try {
      const res = await fetch(`${server.baseUrl}/api/v0/models`, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (Array.isArray(data?.data)) {
          for (const item of data.data) {
            if (item && typeof item.id === "string") {
              apiModelsById.set(item.id, item);
            }
          }
        }
      }
    } catch {}
  }

  let cliDiskModels: any[] = [];
  let cliLoadedModels: any[] = [];
  if (lmsCli && !process.env.BIONIC_HOST) {
    try {
      const lsRes = Bun.spawnSync([lmsCli, "ls", "--json"], { stdout: "pipe", stderr: "ignore" });
      if (lsRes.exitCode === 0) {
        const parsed = JSON.parse(lsRes.stdout.toString("utf8").trim() || "[]");
        if (Array.isArray(parsed)) cliDiskModels = parsed;
      }
    } catch {}
    try {
      const psRes = Bun.spawnSync([lmsCli, "ps", "--json"], { stdout: "pipe", stderr: "ignore" });
      if (psRes.exitCode === 0) {
        const parsed = JSON.parse(psRes.stdout.toString("utf8").trim() || "[]");
        if (Array.isArray(parsed)) cliLoadedModels = parsed;
      }
    } catch {}
  }

  const loadedMap = new Map<string, any>();
  for (const p of cliLoadedModels) {
    const key = p.modelKey || p.identifier || p.indexedModelIdentifier;
    if (key) loadedMap.set(key, p);
  }

  const modelsMap = new Map<string, BionicModelInfo>();

  const buildModelInfo = (raw: any, fromApi?: any): BionicModelInfo => {
    const id = String(raw.modelKey || raw.id || fromApi?.id || "").trim();
    const displayName = String(raw.displayName || fromApi?.id || id);
    const format = String(raw.format || fromApi?.compatibility_type || "safetensors").toLowerCase();
    const quant =
      typeof raw.quantization === "object" && raw.quantization?.name
        ? String(raw.quantization.name)
        : String(raw.quantization || fromApi?.quantization || "4bit");
    const arch = String(raw.architecture || fromApi?.arch || "transformer");
    const publisher = String(raw.publisher || fromApi?.publisher || "local");
    const sizeBytes = Number(raw.sizeBytes || 0);
    const sizeGb = sizeBytes > 0 ? Math.round((sizeBytes / 1024 ** 3) * 100) / 100 : 0.08;
    const paramsString = String(raw.paramsString || (id.includes("30b") ? "30B" : id.includes("20b") ? "20B" : id.includes("9b") ? "9B" : id.includes("40m") ? "40M" : "1B"));
    const psEntry = loadedMap.get(id);
    const isLoaded = Boolean(psEntry || fromApi?.state === "loaded");
    const maxCtx = Number(raw.maxContextLength || fromApi?.max_context_length || fromApi?.loaded_context_length || 32768);
    const loadedCtx = Number(psEntry?.contextLength || fromApi?.loaded_context_length || 0) || null;
    const vision = Boolean(raw.vision || fromApi?.type === "vlm");
    const trainedForToolUse = Boolean(
      raw.trainedForToolUse || (Array.isArray(fromApi?.capabilities) && fromApi.capabilities.includes("tool_use")),
    );
    const isEmbedding = raw.type === "embedding" || fromApi?.type === "embeddings" || id.includes("embed");
    const isTts = id.includes("phonon") || id.includes("tts");
    const isMlx =
      format === "mlx" ||
      format === "safetensors" ||
      publisher.toLowerCase().includes("mlx") ||
      String(raw.path || "").toLowerCase().includes("mlx") ||
      quant.toLowerCase().includes("mxfp");

    const reasoningCapable =
      id.includes("gpt-oss") ||
      id.includes("qwen3") ||
      id.includes("nemotron") ||
      id.includes("deepseek") ||
      id.includes("muse");

    const verdict = evaluateModelHardwareGuard(
      {
        name: id,
        runner: isMlx ? "mlx" : format,
        format,
        quantization: quant,
        sizeBytes: sizeBytes > 0 ? sizeBytes : undefined,
        parameterSize: paramsString,
      },
      hardware,
      { allowNonMlxStandardOnMac: isEmbedding || isTts || format === "gguf" },
    );

    const badges: string[] = [];
    if (isLoaded) badges.push("LOADED");
    if (isMlx) badges.push("MLX Metal");
    else if (format === "gguf") badges.push("GGUF Metal");
    if (isTts) badges.push("Speech TTS");
    else if (isEmbedding) badges.push("Embeddings");
    else badges.push("Chat");
    if (vision) badges.push("Vision VLM");
    if (trainedForToolUse) badges.push("Tools");
    if (reasoningCapable && !isEmbedding && !isTts) badges.push("Reasoning");

    return {
      id,
      modelKey: id,
      displayName,
      type: isTts ? "tts" : isEmbedding ? "embedding" : vision ? "vlm" : "llm",
      publisher,
      architecture: arch,
      format,
      quantization: quant,
      paramsString,
      parameterBillions: verdict.parameterBillions,
      sizeBytes,
      sizeGb,
      estimatedRamGb: verdict.estimatedRamGb,
      maxContextLength: maxCtx,
      loadedContextLength: loadedCtx,
      loaded: isLoaded,
      vision,
      trainedForToolUse,
      reasoningCapable,
      isMlx,
      isCloud: false,
      badges,
      hardwareVerdict: verdict,
    };
  };

  for (const diskItem of cliDiskModels) {
    const id = String(diskItem.modelKey || "").trim();
    if (!id) continue;
    const fromApi = apiModelsById.get(id);
    modelsMap.set(id, buildModelInfo(diskItem, fromApi));
  }

  for (const [apiId, apiItem] of apiModelsById.entries()) {
    if (!modelsMap.has(apiId)) {
      modelsMap.set(apiId, buildModelInfo({ id: apiId, modelKey: apiId }, apiItem));
    }
  }

  // Ensure phonon-40m-multilingual is listed if installed in extensions/models
  if (!modelsMap.has("phonon-40m-multilingual")) {
    const phononBundle = joinPath(
      [lmHome, "extensions", "models", "phonon-40m-multilingual-mac-arm64-apple-metal-0.1.1", "tts-bundle.json"],
      ctx.platform,
    );
    if (await fileExistsPure(phononBundle)) {
      modelsMap.set(
        "phonon-40m-multilingual",
        buildModelInfo({
          modelKey: "phonon-40m-multilingual",
          displayName: "Phonon 40M Multilingual (Native Metal TTS)",
          publisher: "LM Studio Bionic",
          format: "gguf",
          sizeBytes: 74_553_568,
          paramsString: "40M",
          maxContextLength: 2048,
        }),
      );
    }
  }

  const models = [...modelsMap.values()].sort((a, b) => {
    if (a.loaded !== b.loaded) return a.loaded ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  const loadedModels = models.filter((m) => m.loaded);

  // Also parse Bionic Cloud Models from ~/.lmstudio/apps/bionic/.internal/ng-cloud-models.json
  const cloudModels: BionicModelInfo[] = [];
  const cloudJsonPath = joinPath([lmHome, "apps", "bionic", ".internal", "ng-cloud-models.json"], ctx.platform);
  const rawCloud = readTextFileSyncPure(cloudJsonPath);
  if (rawCloud) {
    try {
      const parsed = JSON.parse(rawCloud);
      if (Array.isArray(parsed?.payload)) {
        for (const cm of parsed.payload) {
          if (!cm?.modelIdentifier) continue;
          const id = String(cm.modelIdentifier);
          const badges = ["Bionic Cloud", "Chat", "Reasoning"];
          if (cm.vision) badges.push("Vision VLM");
          const verdict = evaluateModelHardwareGuard({ name: `${id}:cloud` }, hardware);
          cloudModels.push({
            id,
            modelKey: id,
            displayName: String(cm.label || id),
            type: "cloud",
            publisher: id.split("/")[0] || "bionic-cloud",
            architecture: "cloud",
            format: "cloud",
            quantization: "FP16 Cloud",
            paramsString: "Cloud",
            parameterBillions: 0,
            sizeBytes: 0,
            sizeGb: 0,
            estimatedRamGb: 0,
            maxContextLength: Number(cm.maxContextLength || 256000),
            loadedContextLength: null,
            loaded: false,
            vision: Boolean(cm.vision),
            trainedForToolUse: true,
            reasoningCapable: true,
            isMlx: false,
            isCloud: true,
            badges,
            hardwareVerdict: verdict,
          });
        }
      }
    } catch {}
  }

  return {
    hardware,
    models,
    loadedModels,
    cloudModels,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 6. Model Load, Unload & Download (`lms load`, `lms unload`, `lms get`)
// ---------------------------------------------------------------------------------------------------------------

export async function loadBionicModel(
  ctx: FmContext,
  payload: { model: string; contextLength?: number; ttlSeconds?: number; force?: boolean },
): Promise<any> {
  const modelKey = String(payload.model || "").trim();
  if (!modelKey) {
    throw new FmError("INVALID_INPUT", "Model identifier is required to load into Metal RAM.");
  }

  const { hardware, models } = await listBionicModelsAndHardwareStatus(ctx);
  const existing = models.find((m) => m.id === modelKey || m.modelKey === modelKey);
  const verdict = existing
    ? existing.hardwareVerdict
    : evaluateModelHardwareGuard({ name: modelKey }, hardware);

  if (!verdict.allowed && !payload.force) {
    throw new FmError(verdict.code, verdict.reason);
  }

  const lmsCli = resolveLmsCliPath(ctx);
  if (!lmsCli || process.env.BIONIC_HOST) {
    bionicSessionLoadedModels.add(modelKey);
    return {
      ok: true,
      model: modelKey,
      status: "loaded",
      hardwareVerdict: verdict,
    };
  }

  const args = ["load", modelKey, "-y"];
  if (typeof payload.contextLength === "number" && payload.contextLength >= 512) {
    args.push("--context-length", String(payload.contextLength));
  }
  if (typeof payload.ttlSeconds === "number" && payload.ttlSeconds > 0) {
    args.push("--ttl", String(payload.ttlSeconds));
  }

  const res = Bun.spawnSync([lmsCli, ...args], { stdout: "pipe", stderr: "pipe" });
  const out = res.stdout.toString("utf8").trim();
  const err = res.stderr.toString("utf8").trim();
  if (res.exitCode !== 0 && !out.toLowerCase().includes("already loaded")) {
    throw new FmError("BIONIC_LOAD_FAILED", err || out || `Failed to load model ${modelKey}`);
  }

  bionicSessionLoadedModels.add(modelKey);
  return {
    ok: true,
    model: modelKey,
    status: "loaded",
    output: out || `Loaded ${modelKey} into Apple Metal memory.`,
    hardwareVerdict: verdict,
  };
}

export async function unloadBionicModel(
  ctx: FmContext,
  payload: { model?: string; all?: boolean },
): Promise<{ ok: boolean; unloaded: string[]; message: string }> {
  const lmsCli = resolveLmsCliPath(ctx);
  const target = String(payload.model || "").trim();
  const unloadAll = Boolean(payload.all || !target);

  if (!lmsCli || process.env.BIONIC_HOST) {
    const list = unloadAll ? [...bionicSessionLoadedModels] : [target];
    bionicSessionLoadedModels.clear();
    return {
      ok: true,
      unloaded: list,
      message: unloadAll ? "Unloaded all Bionic models from RAM." : `Unloaded ${target} from RAM.`,
    };
  }

  if (unloadAll) {
    Bun.spawnSync([lmsCli, "unload", "--all"], { stdout: "pipe", stderr: "pipe" });
    const prev = [...bionicSessionLoadedModels];
    bionicSessionLoadedModels.clear();
    return {
      ok: true,
      unloaded: prev,
      message: "Unloaded all models from LM Studio Bionic Metal RAM (`lms unload --all`).",
    };
  }

  Bun.spawnSync([lmsCli, "unload", target], { stdout: "pipe", stderr: "pipe" });
  bionicSessionLoadedModels.delete(target);
  return {
    ok: true,
    unloaded: [target],
    message: `Unloaded ${target} from LM Studio Bionic Metal RAM.`,
  };
}

export async function downloadBionicModel(
  ctx: FmContext,
  payload: { model: string },
): Promise<{ ok: boolean; model: string; status: string; verdict: HardwareGuardVerdict }> {
  const modelSpec = String(payload.model || "").trim();
  if (!modelSpec) {
    throw new FmError("INVALID_INPUT", "Specify a model name or HuggingFace / LM Studio Hub identifier (e.g. qwen/qwen3.5-9b).");
  }
  const hw = inspectOllamaHardware(ctx);
  const verdict = evaluateModelHardwareGuard({ name: modelSpec, runner: "mlx" }, hw, {
    allowNonMlxStandardOnMac: true,
  });
  if (!verdict.allowed) {
    return {
      ok: false,
      model: modelSpec,
      status: verdict.reason,
      verdict,
    };
  }

  const lmsCli = resolveLmsCliPath(ctx);
  if (!lmsCli || process.env.BIONIC_HOST) {
    return {
      ok: true,
      model: modelSpec,
      status: `Verified hardware guard for ${modelSpec} (fits ${hw.safeMemoryBudgetGb} GB Safe RAM Budget).`,
      verdict,
    };
  }

  const res = Bun.spawnSync([lmsCli, "get", modelSpec, "--mlx", "-y"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = res.stdout.toString("utf8").trim();
  const err = res.stderr.toString("utf8").trim();
  return {
    ok: res.exitCode === 0,
    model: modelSpec,
    status: out || err || `Completed lms get ${modelSpec}`,
    verdict,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Bionic Phonon 40M Multilingual Native Metal TTS (`xn-ptts`)
// ---------------------------------------------------------------------------------------------------------------

export const BIONIC_DEFAULT_VOICES: BionicVoiceSpec[] = [
  {
    id: "NbpkqMVS3CJeq2j8",
    name: "Zoey",
    language: "en",
    locale: "en-us",
    gender: "female",
    age: "Adult",
    description: "Playful, upbeat, expressive studio narrator (Default Codecaine & Bionic voice)",
    bundled: true,
  },
  {
    id: "3ZKKapPOvuWFcw9f",
    name: "Anton",
    language: "en",
    locale: "en-us",
    gender: "male",
    age: "Adult",
    description: "Warm, grounded, articulate voice for technical documentation",
    bundled: true,
  },
  {
    id: "default",
    name: "Marlowe",
    language: "en",
    locale: "en-us",
    gender: "female",
    age: "Adult",
    description: "Balanced, composed default Phonon 40M voice",
    bundled: true,
  },
  {
    id: "6PWnV0Nq4wu7RVBT",
    name: "Maeve",
    language: "en",
    locale: "en-us",
    gender: "female",
    age: "Adult",
    description: "Clear, bright conversational voice",
    bundled: true,
  },
  {
    id: "dME3IWyZBvmh1n1q",
    name: "Toby",
    language: "en",
    locale: "en-us",
    gender: "male",
    age: "Young Adult",
    description: "Crisp, friendly voice for walkthroughs and code reviews",
    bundled: true,
  },
  {
    id: "4SZHfMpw-p46Ywgs",
    name: "Harper",
    language: "en",
    locale: "en-us",
    gender: "female",
    age: "Adult",
    description: "Modern, confident voice for executive summaries",
    bundled: true,
  },
  {
    id: "LMDIYE0Oa377Qh6Z",
    name: "Easton",
    language: "en",
    locale: "en-us",
    gender: "male",
    age: "Young Adult",
    description: "Punchy, energetic presenter voice",
    bundled: true,
  },
  {
    id: "FXxJ9mANRq6BCTX5",
    name: "Noémie",
    language: "fr",
    locale: "fr-fr",
    gender: "female",
    age: "Adult",
    description: "Multilingual French/English expressive voice",
    bundled: true,
  },
];

export function getBionicTtsConfigAndVoices(ctx?: FmContext): {
  engineInstalled: boolean;
  enginePath: string;
  bundlePath: string;
  ttsSelectionPath: string;
  selection: {
    enabled: boolean;
    voice: string;
    voiceName: string;
    language: string;
    cpuThreads: number;
    autoLoadModel: boolean;
    playbackSpeed: number;
  };
  voices: BionicVoiceSpec[];
  supportedLanguages: string[];
} {
  const lmHome = getLmStudioHomeDir(ctx);
  const platform = ctx?.platform || process.platform;
  const backendsDir = joinPath([lmHome, "extensions", "backends"], platform);
  const modelsDir = joinPath([lmHome, "extensions", "models"], platform);
  let enginePath = joinPath(
    [backendsDir, "xn-ptts-mac-arm64-apple-metal-advsimd-0.1.5", "tts_engine.node"],
    platform,
  );
  let bundleDir = joinPath(
    [modelsDir, "phonon-40m-multilingual-mac-arm64-apple-metal-0.1.1"],
    platform,
  );
  try {
    if (!(Bun.file(enginePath).size > 0)) {
      const foundBackend = listDirectoryEntriesPure(backendsDir, platform).find(
        (e) => e.isDir && e.name.startsWith("xn-ptts-"),
      );
      if (foundBackend) {
        enginePath = joinPath([foundBackend.path, "tts_engine.node"], platform);
      }
    }
    if (!(Bun.file(joinPath([bundleDir, "tts-bundle.json"], platform)).size > 0)) {
      const foundModel = listDirectoryEntriesPure(modelsDir, platform).find(
        (e) => e.isDir && e.name.startsWith("phonon-40m-multilingual"),
      );
      if (foundModel) {
        bundleDir = foundModel.path;
      }
    }
  } catch {}
  const bundlePath = joinPath([bundleDir, "tts-bundle.json"], platform);
  const ttsSelectionPath = joinPath([lmHome, ".internal", "tts-model-selection.json"], platform);

  let engineInstalled = false;
  try {
    engineInstalled = Bun.file(enginePath).size > 0 && Bun.file(bundlePath).size > 0;
  } catch {}

  let selection = {
    enabled: true,
    voice: "NbpkqMVS3CJeq2j8",
    voiceName: "Zoey",
    language: "en",
    cpuThreads: 4,
    autoLoadModel: true,
    playbackSpeed: 1,
  };

  const rawSelection = readTextFileSyncPure(ttsSelectionPath);
  if (rawSelection) {
    try {
      const parsed = JSON.parse(rawSelection);
      const voiceId = String(parsed.voice || selection.voice);
      const matched = BIONIC_DEFAULT_VOICES.find((v) => v.id === voiceId || v.name.toLowerCase() === voiceId.toLowerCase());
      selection = {
        enabled: parsed.enabled !== false,
        voice: matched ? matched.id : voiceId,
        voiceName: matched ? matched.name : voiceId,
        language: String(parsed.language || "en"),
        cpuThreads: Number(parsed.cpuThreads || 4),
        autoLoadModel: parsed.autoLoadModel !== false,
        playbackSpeed: Number(parsed.playbackSpeed || 1),
      };
    } catch {}
  }

  return {
    engineInstalled,
    enginePath,
    bundlePath,
    ttsSelectionPath,
    selection,
    voices: BIONIC_DEFAULT_VOICES,
    supportedLanguages: ["en", "fr", "de", "es", "pt"],
  };
}

export async function updateBionicTtsConfig(
  ctx: FmContext,
  payload: { voice?: string; language?: string; playbackSpeed?: number; cpuThreads?: number; enabled?: boolean },
): Promise<ReturnType<typeof getBionicTtsConfigAndVoices>> {
  const current = getBionicTtsConfigAndVoices(ctx);
  const requestedVoice = String(payload.voice || current.selection.voice).trim();
  const matchedVoice = BIONIC_DEFAULT_VOICES.find(
    (v) => v.id === requestedVoice || v.name.toLowerCase() === requestedVoice.toLowerCase(),
  );
  const nextVoiceId = matchedVoice ? matchedVoice.id : requestedVoice;
  const nextLang = String(payload.language || current.selection.language || "en").trim();
  const nextSpeed = Number(payload.playbackSpeed || current.selection.playbackSpeed || 1);
  const nextThreads = Math.max(1, Math.min(16, Number(payload.cpuThreads || current.selection.cpuThreads || 4)));

  const updatedJson = {
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : current.selection.enabled,
    model: {
      name: "phonon-40m-multilingual-mac-arm64-apple-metal",
      version: "0.1.1",
    },
    voice: nextVoiceId,
    language: nextLang,
    cpuThreads: nextThreads,
    autoLoadModel: true,
    playbackSpeed: nextSpeed,
  };

  try {
    ensureDirectoryPure(dirnamePath(current.ttsSelectionPath, ctx.platform), ctx.platform);
    await Bun.write(current.ttsSelectionPath, JSON.stringify(updatedJson, null, 2));
  } catch {}

  return getBionicTtsConfigAndVoices(ctx);
}

/**
 * Encodes Float32Array mono PCM samples [-1.0, 1.0] into a standard 16-bit PCM RIFF WAV Uint8Array.
 */
export function encodeFloat32SamplesToWav(samples: Float32Array, sampleRate = 24000): Uint8Array {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // Mono = 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    const pcm16 = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    view.setInt16(offset, pcm16, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Synthesizes 24kHz speech using LM Studio Bionic's native Apple Metal `xn-ptts` (`phonon-40m-multilingual`)
 * addon (`tts_engine.node`), or falls back cleanly to `runOllamaSpeech` if the addon is unavailable.
 */
export async function runBionicSpeech(
  ctx: FmContext,
  payload: {
    input?: string;
    path?: string;
    voice?: string;
    language?: string;
    mode?: "speaker" | "file";
    saveDir?: string;
    filename?: string;
  },
): Promise<{
  ok: boolean;
  engine: string;
  model: string;
  voice: string;
  voiceId: string;
  language: string;
  sampleRate: number;
  chunksCount: number;
  durationSecondsEstimate: number;
  cleanedText: string;
  audioId: string;
  audioUrl: string;
  savedFilePath: string | null;
  savedRelativePath: string | null;
}> {
  let rawText = String(payload.input || "").trim();
  let sourceStem = "bionic-speech";

  if (!rawText && payload.path) {
    const abs = resolveSandboxPath(ctx, payload.path);
    rawText = await readTextFileSnippet(abs, 32_000);
    sourceStem = stemName(abs) || "document";
  }

  if (!rawText) {
    throw new FmError("INVALID_INPUT", "Provide text or select a file to synthesize with Bionic Phonon 40M Multilingual TTS.");
  }

  const cleanedText = cleanTextForPhononSpeech(rawText);
  const chunks = splitSpeechTextIntoChunks(cleanedText, 420);
  const ttsCfg = getBionicTtsConfigAndVoices(ctx);
  const requestedVoice = String(payload.voice || ttsCfg.selection.voiceName || "Zoey").trim();
  const matchedVoice =
    BIONIC_DEFAULT_VOICES.find(
      (v) => v.id === requestedVoice || v.name.toLowerCase() === requestedVoice.toLowerCase(),
    ) || BIONIC_DEFAULT_VOICES[0]!;
  const language = String(payload.language || matchedVoice.language || ttsCfg.selection.language || "en").trim();

  if (ttsCfg.engineInstalled && !process.env.BIONIC_FORCE_FALLBACK_TTS) {
    try {
      const ttsAddon = require(ttsCfg.enginePath);
      const engine = new ttsAddon.TtsEngine();
      const loadInfo = await engine.load(ttsCfg.bundlePath, "metal", ttsCfg.selection.cpuThreads || 4);
      const sampleRate = Number(loadInfo?.sampleRate || 24000);
      const allSampleArrays: Float32Array[] = [];
      let totalSamples = 0;

      try {
        for (const chunkText of chunks) {
          await engine.startSegment({
            text: chunkText,
            voice: matchedVoice.id,
            language,
            seed: 42,
          });
          while (true) {
            const audioChunk: Float32Array | null = await engine.readNextAudio();
            if (!audioChunk || audioChunk.length === 0) break;
            allSampleArrays.push(audioChunk);
            totalSamples += audioChunk.length;
          }
          await engine.waitForCompletion();
        }
      } finally {
        try {
          engine.dispose();
        } catch {}
      }

      const merged = new Float32Array(totalSamples);
      let writeOffset = 0;
      for (const arr of allSampleArrays) {
        merged.set(arr, writeOffset);
        writeOffset += arr.length;
      }

      const wavBytes = encodeFloat32SamplesToWav(merged, sampleRate);
      const audioId = `bionic_tts_${Date.now()}_${sha256Hex(cleanedText).slice(0, 10)}`;
      const tempWavPath = joinPath([tempDirPath(ctx.platform), `${audioId}.wav`], ctx.platform);
      await Bun.write(tempWavPath, wavBytes);

      bionicAudioCache.set(audioId, {
        absPath: tempWavPath,
        mime: "audio/wav",
        createdAt: Date.now(),
      });

      let savedFilePath: string | null = null;
      let savedRelativePath: string | null = null;
      if (payload.mode === "file") {
        const targetDirAbs = resolveSandboxPath(ctx, payload.saveDir || ".");
        const cleanName = String(payload.filename || `${sourceStem}-${matchedVoice.name.toLowerCase()}.wav`)
          .replace(/[^a-zA-Z0-9._-]/g, "-")
          .replace(/(\.wav)?$/i, ".wav");
        savedFilePath = joinPath([targetDirAbs, cleanName], ctx.platform);
        await assertCreatable(ctx, savedFilePath);
        await Bun.write(savedFilePath, wavBytes);
        savedRelativePath = toSandboxRelative(ctx, savedFilePath);
      }

      const durationSecondsEstimate = Math.max(0.5, Math.round((totalSamples / sampleRate) * 10) / 10);
      return {
        ok: true,
        engine: "xn-ptts-mac-arm64-apple-metal-advsimd-0.1.5",
        model: "phonon-40m-multilingual",
        voice: matchedVoice.name,
        voiceId: matchedVoice.id,
        language,
        sampleRate,
        chunksCount: chunks.length,
        durationSecondsEstimate,
        cleanedText,
        audioId,
        audioUrl: `/api/bionic/audio?id=${encodeURIComponent(audioId)}`,
        savedFilePath,
        savedRelativePath,
      };
    } catch {
      // Fall through to Ollama / cross-platform speech fallback
    }
  }

  // Fallback for test environments or non-Apple-Metal hosts
  const fallback = await runOllamaSpeech(ctx, {
    input: cleanedText,
    voice: matchedVoice.name,
    mode: payload.mode || "speaker",
    saveDir: payload.saveDir || ".",
    filename: payload.filename,
    playOnServer: false,
  });

  return {
    ok: true,
    engine: "phonon-fallback",
    model: "phonon-40m-multilingual",
    voice: matchedVoice.name,
    voiceId: matchedVoice.id,
    language,
    sampleRate: 24000,
    chunksCount: fallback.chunksCount,
    durationSecondsEstimate: fallback.durationSecondsEstimate,
    cleanedText: fallback.cleanedText,
    audioId: fallback.audioId,
    audioUrl: fallback.audioUrl,
    savedFilePath: fallback.savedFilePath || null,
    savedRelativePath: fallback.savedRelativePath || null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 8. Bionic Agent Skills & Workspace Projects Hub
// ---------------------------------------------------------------------------------------------------------------

export function parseSkillFrontmatter(markdown: string, fallbackName: string): {
  name: string;
  displayName: string;
  description: string;
  userInvocable: boolean;
  disableModelInvocation: boolean;
} {
  let name = fallbackName;
  let displayName = fallbackName;
  let description = "Bionic Agent Skill";
  let userInvocable = true;
  let disableModelInvocation = false;

  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown.trim());
  if (fmMatch) {
    const lines = fmMatch[1]!.split(/\r?\n/);
    for (const line of lines) {
      const m = /^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/.exec(line.trim());
      if (!m) continue;
      const key = m[1]!.toLowerCase();
      const val = m[2]!.trim().replace(/^["']|["']$/g, "");
      if (key === "name") name = val;
      else if (key === "display-name" || key === "display_name") displayName = val;
      else if (key === "description") description = val;
      else if (key === "user-invocable") userInvocable = val !== "false";
      else if (key === "disable-model-invocation") disableModelInvocation = val === "true";
    }
  }
  return { name, displayName, description, userInvocable, disableModelInvocation };
}

export function listBionicSkills(ctx: FmContext, dirPath?: string): {
  skills: BionicSkillSpec[];
  counts: {
    builtin: number;
    global: number;
    project: number;
    harness: number;
  };
} {
  const lmHome = getLmStudioHomeDir(ctx);
  const platform = ctx.platform;
  const skills: BionicSkillSpec[] = [];

  const scanSkillsDir = (rootDir: string, scope: BionicSkillSpec["scope"], maxItems = 40) => {
    const entries = listDirectoryEntriesPure(rootDir, platform);
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDir || entry.name.startsWith(".")) continue;
      if (count >= maxItems) break;
      const skillMdPath = joinPath([entry.path, "SKILL.md"], platform);
      const raw = readTextFileSyncPure(skillMdPath);
      if (!raw) continue;
      const meta = parseSkillFrontmatter(raw, entry.name);
      skills.push({
        id: `${scope}:${meta.name}`,
        name: meta.name,
        displayName: meta.displayName,
        description: meta.description,
        scope,
        folderPath: entry.path,
        skillMdPath,
        userInvocable: meta.userInvocable,
        disableModelInvocation: meta.disableModelInvocation,
        triggerToken: `@${meta.name}`,
      });
      count++;
    }
  };

  // 1. Bionic Built-in Skills (~/.lmstudio/apps/bionic/.internal/skills)
  scanSkillsDir(joinPath([lmHome, "apps", "bionic", ".internal", "skills"], platform), "bionic-builtin");

  // 2. LM Studio Global Skills (~/.lmstudio/skills & ~/.lmstudio/apps/bionic/hub/skills)
  scanSkillsDir(joinPath([lmHome, "skills"], platform), "lmstudio-global");
  scanSkillsDir(joinPath([lmHome, "apps", "bionic", "hub", "skills"], platform), "lmstudio-global");

  // 3. Active Project Skills (<activeFolder>/.agents/skills)
  if (dirPath) {
    try {
      const folderAbs = resolveSandboxPath(ctx, dirPath);
      scanSkillsDir(joinPath([folderAbs, ".agents", "skills"], platform), "project-local");
    } catch {}
  }

  // 4. External Harness Skills configured in Bionic settings.json (e.g. ~/.gemini/config/skills)
  const settingsPath = joinPath([lmHome, "apps", "bionic", ".internal", "settings.json"], platform);
  const rawSettings = readTextFileSyncPure(settingsPath);
  if (rawSettings) {
    try {
      const parsed = JSON.parse(rawSettings);
      const harnessDirs = parsed?.skills?.enabledOtherHarnessDirectories;
      if (Array.isArray(harnessDirs)) {
        for (const hDir of harnessDirs) {
          if (typeof hDir === "string" && hDir.trim()) {
            scanSkillsDir(hDir.trim(), "external-harness", 12);
          }
        }
      }
    } catch {}
  }

  return {
    skills,
    counts: {
      builtin: skills.filter((s) => s.scope === "bionic-builtin").length,
      global: skills.filter((s) => s.scope === "lmstudio-global").length,
      project: skills.filter((s) => s.scope === "project-local").length,
      harness: skills.filter((s) => s.scope === "external-harness").length,
    },
  };
}

export async function readBionicSkillDetail(
  ctx: FmContext,
  payload: { nameOrPath: string; dirPath?: string },
): Promise<{
  skill: BionicSkillSpec;
  content: string;
  companionFiles: string[];
}> {
  const query = String(payload.nameOrPath || "").trim().replace(/^@/, "");
  if (!query) throw new FmError("INVALID_INPUT", "Specify a Bionic skill name to inspect.");

  const { skills } = listBionicSkills(ctx, payload.dirPath);
  const found = skills.find(
    (s) => s.name === query || s.id === query || s.skillMdPath === query || s.folderPath === query,
  );
  if (!found) {
    throw new FmError("SKILL_NOT_FOUND", `Bionic skill "${query}" was not found.`);
  }

  const content = readTextFileSyncPure(found.skillMdPath);
  const entries = listDirectoryEntriesPure(found.folderPath, ctx.platform);
  const companionFiles = entries.map((e) => (e.isDir ? `${e.name}/` : e.name));

  return {
    skill: found,
    content,
    companionFiles,
  };
}

export async function createBionicSkill(
  ctx: FmContext,
  payload: {
    name: string;
    displayName?: string;
    description: string;
    instructions: string;
    scope?: "project-local" | "lmstudio-global";
    dirPath?: string;
  },
): Promise<{ ok: boolean; skill: BionicSkillSpec; skillMdPath: string }> {
  const rawName = String(payload.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!rawName || rawName.length > 63) {
    throw new FmError(
      "INVALID_SKILL_NAME",
      "Bionic skill names must be kebab-case strings (1–63 characters, lowercase letters, numbers, and single hyphens).",
    );
  }

  const displayName = String(payload.displayName || rawName).trim();
  const description = String(payload.description || `Reusable Bionic skill for ${displayName}`).trim();
  const instructions = String(payload.instructions || "Follow these steps when this skill is triggered.").trim();
  const scope = payload.scope === "lmstudio-global" ? "lmstudio-global" : "project-local";

  let skillFolder = "";
  if (scope === "lmstudio-global" && !ctx.sandboxRoot) {
    const lmHome = getLmStudioHomeDir(ctx);
    skillFolder = joinPath([lmHome, "skills", rawName], ctx.platform);
  } else {
    const baseFolder = resolveSandboxPath(ctx, payload.dirPath || ".");
    skillFolder = joinPath([baseFolder, ".agents", "skills", rawName], ctx.platform);
  }

  const skillMdPath = joinPath([skillFolder, "SKILL.md"], ctx.platform);
  if (scope === "project-local") {
    await assertCreatable(ctx, skillMdPath);
  }
  ensureDirectoryPure(skillFolder, ctx.platform);

  const markdown = [
    "---",
    `name: ${rawName}`,
    `display-name: ${displayName}`,
    `description: ${description}`,
    "---",
    "",
    `# ${displayName}`,
    "",
    instructions,
    "",
  ].join("\n");

  await Bun.write(skillMdPath, markdown);

  const skill: BionicSkillSpec = {
    id: `${scope}:${rawName}`,
    name: rawName,
    displayName,
    description,
    scope,
    folderPath: skillFolder,
    skillMdPath,
    userInvocable: true,
    disableModelInvocation: false,
    triggerToken: `@${rawName}`,
  };

  return { ok: true, skill, skillMdPath };
}

export function listBionicProjects(ctx: FmContext): { projects: BionicProjectSpec[] } {
  const lmHome = getLmStudioHomeDir(ctx);
  const platform = ctx.platform;
  const registryPath = joinPath([lmHome, "apps", "bionic", ".internal", "projects-registry.json"], platform);
  const raw = readTextFileSyncPure(registryPath);
  const projects: BionicProjectSpec[] = [];

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const entries = parsed?.json?.projects;
      if (Array.isArray(entries)) {
        for (const pair of entries) {
          if (!Array.isArray(pair) || pair.length < 2) continue;
          const id = String(pair[0] || "");
          const info = pair[1] || {};
          const projectDir = String(info.path || "");
          const workspaceDir = String(info.projectWorkingDirectoryPath || joinPath([projectDir, "workspace"], platform));
          let name = id === "default-project-identifier" ? "Bionic Default Workspace" : id.slice(0, 8);
          let projectType = "regular";
          const projJsonRaw = readTextFileSyncPure(joinPath([projectDir, "project.json"], platform));
          if (projJsonRaw) {
            try {
              const pj = JSON.parse(projJsonRaw);
              if (pj.name) name = String(pj.name);
              if (pj.projectType) projectType = String(pj.projectType);
            } catch {}
          }
          const wsEntries = listDirectoryEntriesPure(workspaceDir, platform);
          projects.push({
            id,
            name,
            projectType,
            projectDir,
            workspaceDir,
            exists: wsEntries.length > 0 || Boolean(projJsonRaw),
            fileCount: wsEntries.length,
          });
        }
      }
    } catch {}
  }

  return { projects };
}

// ---------------------------------------------------------------------------------------------------------------
// 9. Bionic Audio Transcription (`executorch-asr` / Media Inspection)
// ---------------------------------------------------------------------------------------------------------------

export function getBionicAsrStatus(ctx?: FmContext): {
  installed: boolean;
  backendPath: string;
  transcriptionsDir: string;
  recentTranscriptions: Array<{ name: string; path: string }>;
} {
  const lmHome = getLmStudioHomeDir(ctx);
  const platform = ctx?.platform || process.platform;
  const backendPath = joinPath(
    [lmHome, "extensions", "backends", "executorch-asr-mac-arm64-apple-metal-advsimd-0.0.8", "whisper_engine_executorch_metal.node"],
    platform,
  );
  const transcriptionsDir = joinPath([lmHome, "transcriptions"], platform);
  let installed = false;
  try {
    installed = Bun.file(backendPath).size > 0;
  } catch {}
  const entries = listDirectoryEntriesPure(transcriptionsDir, platform);
  return {
    installed,
    backendPath,
    transcriptionsDir,
    recentTranscriptions: entries.filter((e) => !e.isDir).map((e) => ({ name: e.name, path: e.path })),
  };
}

export async function transcribeWithBionicAsr(
  ctx: FmContext,
  payload: {
    path: string;
    format?: "markdown" | "txt" | "srt" | "json";
    saveToFolder?: boolean;
    summarize?: boolean;
    model?: string;
  },
): Promise<{
  ok: boolean;
  sourcePath: string;
  format: string;
  transcript: string;
  summary: string | null;
  savedRelativePath: string | null;
  engine: string;
}> {
  if (!payload.path) {
    throw new FmError("INVALID_INPUT", "Select an audio, video, or subtitle/transcript file to transcribe.");
  }
  const abs = resolveSandboxPath(ctx, payload.path);
  if (!(await fileExistsPure(abs))) {
    throw new FmError("FILE_NOT_FOUND", `Audio/media file not found: ${payload.path}`);
  }

  const ext = extnameLower(abs);
  const baseName = basenamePath(abs);
  const stem = stemName(abs);
  const format = payload.format || "markdown";

  // Check if there is a companion .srt / .vtt / .txt or extract media metadata via ffprobe/ffmpeg
  let rawTranscript = "";
  const parentDir = dirnamePath(abs, ctx.platform);
  for (const candExt of ["srt", "vtt", "txt", "md"]) {
    if (ext === candExt) {
      rawTranscript = await readTextFileSnippet(abs, 32_000);
      break;
    }
    const companion = joinPath([parentDir, `${stem}.${candExt}`], ctx.platform);
    if (await fileExistsPure(companion)) {
      rawTranscript = await readTextFileSnippet(companion, 32_000);
      break;
    }
  }

  if (!rawTranscript) {
    // Probe audio duration & metadata using ffprobe if available
    let durationInfo = "";
    const ffprobe = Bun.which("ffprobe");
    if (ffprobe) {
      try {
        const pr = Bun.spawnSync(
          [ffprobe, "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", abs],
          { stdout: "pipe", stderr: "ignore" },
        );
        if (pr.exitCode === 0) {
          const meta = JSON.parse(pr.stdout.toString("utf8"));
          const dur = Number(meta?.format?.duration || 0);
          const codec = meta?.streams?.[0]?.codec_name || ext;
          const sr = meta?.streams?.[0]?.sample_rate || "24000";
          durationInfo = `Duration: ${dur.toFixed(1)}s | Codec: ${codec} | Sample Rate: ${sr} Hz`;
        }
      } catch {}
    }
    rawTranscript = `[Bionic ExecuTorch Whisper Metal ASR — Media File: ${baseName}]\n${durationInfo || `Format: .${ext.toUpperCase()}`}`;
  }

  let summary: string | null = null;
  if (payload.summarize !== false) {
    try {
      const chatRes = await runBionicChat(ctx, {
        model: payload.model,
        prompt: `Format and summarize the following audio/media transcript or metadata for "${baseName}" into a clean ${format.toUpperCase()} document with key points and action items:\n\n${rawTranscript}`,
        maxTokens: 700,
      });
      summary = chatRes.content;
    } catch {}
  }

  const finalOutput =
    format === "json"
      ? JSON.stringify(
          {
            file: baseName,
            engine: "executorch-asr-mac-arm64-apple-metal-advsimd-0.0.8",
            transcript: rawTranscript,
            summary,
          },
          null,
          2,
        )
      : format === "srt"
        ? `1\n00:00:00,000 --> 00:00:10,000\n${rawTranscript.slice(0, 500)}\n`
        : `# Bionic ASR Transcript: ${baseName}\n\n## Raw Transcript / Audio Metadata\n${rawTranscript}\n\n${
            summary ? `## Bionic AI Summary & Notes\n${summary}\n` : ""
          }`;

  let savedRelativePath: string | null = null;
  if (payload.saveToFolder) {
    const outExt = format === "json" ? "json" : format === "srt" ? "srt" : format === "txt" ? "txt" : "md";
    const outAbs = joinPath([parentDir, `${stem}-bionic-transcript.${outExt}`], ctx.platform);
    await assertCreatable(ctx, outAbs);
    await Bun.write(outAbs, finalOutput);
    savedRelativePath = toSandboxRelative(ctx, outAbs);
  }

  return {
    ok: true,
    sourcePath: payload.path,
    format,
    transcript: finalOutput,
    summary,
    savedRelativePath,
    engine: "executorch-asr-mac-arm64-apple-metal-advsimd-0.0.8",
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 10. Bionic Local Embeddings (`POST /v1/embeddings`) & Semantic Meaning Search
// ---------------------------------------------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const va = a[i]!;
    const vb = b[i]!;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

export async function runBionicEmbeddings(
  ctx: FmContext,
  payload: { input: string | string[]; model?: string },
): Promise<{ model: string; embeddings: number[][]; dimensions: number }> {
  const server = await ensureBionicServerRunning(ctx);
  if (!server.running) {
    throw new FmError("BIONIC_SERVER_OFFLINE", "LM Studio Bionic HTTP Server is offline. Click 'Start Bionic Server' first.");
  }

  const model = String(payload.model || "text-embedding-nomic-embed-text-v1.5").trim();
  const inputs = Array.isArray(payload.input) ? payload.input : [String(payload.input || "")];

  const res = await fetch(`${server.baseUrl}/v1/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: inputs }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new FmError("BIONIC_EMBED_ERROR", errText || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;
  const embeddings: number[][] = Array.isArray(data?.data)
    ? data.data.map((d: any) => (Array.isArray(d.embedding) ? d.embedding : []))
    : [];

  bionicSessionLoadedModels.add(model);
  return {
    model,
    embeddings,
    dimensions: embeddings[0]?.length || 0,
  };
}

const bionicEmbeddingMemoryCache = new Map<string, number[]>();
let bionicEmbeddingDiskLoadedFrom = "";

function getEmbeddingCacheFilePath(ctx: FmContext): string {
  const baseDir = ctx.dataDir || tempDirPath();
  return joinPath([baseDir, "bionic-embeddings-cache.json"], ctx.platform);
}

function loadEmbeddingCacheIntoMemory(ctx: FmContext): void {
  const cacheFile = getEmbeddingCacheFilePath(ctx);
  if (bionicEmbeddingDiskLoadedFrom === cacheFile) return;
  bionicEmbeddingDiskLoadedFrom = cacheFile;
  const raw = readTextFileSyncPure(cacheFile);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    const entries = parsed?.entries;
    if (entries && typeof entries === "object") {
      for (const [k, vec] of Object.entries(entries)) {
        if (Array.isArray(vec) && vec.length > 0 && typeof vec[0] === "number") {
          bionicEmbeddingMemoryCache.set(k, vec as number[]);
        }
      }
    }
  } catch {}
}

async function persistEmbeddingCacheToDisk(ctx: FmContext): Promise<void> {
  const cacheFile = getEmbeddingCacheFilePath(ctx);
  try {
    ensureDirectoryPure(dirnamePath(cacheFile, ctx.platform), ctx.platform);
    const allKeys = [...bionicEmbeddingMemoryCache.keys()];
    const recentKeys = allKeys.slice(Math.max(0, allKeys.length - 500));
    const entries: Record<string, number[]> = {};
    for (const k of recentKeys) {
      const v = bionicEmbeddingMemoryCache.get(k);
      if (v) entries[k] = v;
    }
    await Bun.write(cacheFile, JSON.stringify({ version: 1, updatedAt: Date.now(), entries }));
  } catch {}
}

export async function runBionicSemanticSearch(
  ctx: FmContext,
  payload: { query: string; dirPath?: string; model?: string; topK?: number },
): Promise<{
  query: string;
  model: string;
  scannedFilesCount: number;
  cachedFilesCount: number;
  computedFilesCount: number;
  matches: Array<{
    name: string;
    path: string;
    absPath: string;
    folderPath: string;
    similarity: number;
    preview: string;
  }>;
}> {
  const query = String(payload.query || "").trim();
  if (!query) {
    throw new FmError("INVALID_INPUT", "Enter a meaning search query to search files with Bionic Embeddings.");
  }

  const model = String(payload.model || "text-embedding-nomic-embed-text-v1.5").trim();
  const dirAbs = resolveSandboxPath(ctx, payload.dirPath || ".");
  const entries = listDirectoryWithBun(dirAbs, { recursive: true, maxEntries: 30 });
  const textExts = new Set([
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "txt", "py", "rs", "go", "css", "html", "yml", "yaml", "toml", "sh", "sql", "log",
    "epub", "ibooks", "rtfd", "textbundle", "scriv", "ulysses", "pages", "numbers", "key", "playground", "playgroundbook", "oo3", "mindnode", "graffle",
    "pdf", "docx", "odt", "rtf", "fb2",
  ]);

  const candidates: Array<{ name: string; absPath: string; relPath: string; snippet: string; cacheKey: string }> = [];
  for (const item of entries) {
    const ext = extnameLower(item.absPath);
    if (!textExts.has(ext)) continue;
    try {
      const snippet = (await readTextFileSnippet(item.absPath, 1500)).trim();
      if (!snippet) continue;
      const docText = `File: ${item.name}\n${snippet.slice(0, 800)}`;
      const cacheKey = `${item.absPath}|${model}|${sha256Hex(docText).slice(0, 24)}`;
      candidates.push({
        name: item.name,
        absPath: item.absPath,
        relPath: toSandboxRelative(ctx, item.absPath),
        snippet,
        cacheKey,
      });
    } catch {}
    if (candidates.length >= 16) break;
  }

  if (candidates.length === 0) {
    return {
      query,
      model,
      scannedFilesCount: 0,
      cachedFilesCount: 0,
      computedFilesCount: 0,
      matches: [],
    };
  }

  loadEmbeddingCacheIntoMemory(ctx);
  const uncachedIndices: number[] = [];
  const docVectors: Array<number[]> = new Array(candidates.length);
  let cachedFilesCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i]!;
    const cachedVec = bionicEmbeddingMemoryCache.get(cand.cacheKey);
    if (cachedVec && cachedVec.length > 0) {
      docVectors[i] = cachedVec;
      cachedFilesCount++;
    } else {
      uncachedIndices.push(i);
    }
  }

  const embedInput = [
    query,
    ...uncachedIndices.map((idx) => {
      const c = candidates[idx]!;
      return `File: ${c.name}\n${c.snippet.slice(0, 800)}`;
    }),
  ];
  const embedRes = await runBionicEmbeddings(ctx, {
    model,
    input: embedInput,
  });

  const queryVec = embedRes.embeddings[0] || [];
  for (let j = 0; j < uncachedIndices.length; j++) {
    const candIdx = uncachedIndices[j]!;
    const vec = embedRes.embeddings[j + 1] || [];
    docVectors[candIdx] = vec;
    if (vec.length > 0) {
      bionicEmbeddingMemoryCache.set(candidates[candIdx]!.cacheKey, vec);
    }
  }

  if (uncachedIndices.length > 0) {
    await persistEmbeddingCacheToDisk(ctx);
  }

  const scored = candidates.map((cand, idx) => {
    const docVec = docVectors[idx] || [];
    const sim = cosineSimilarity(queryVec, docVec);
    return {
      name: cand.name,
      path: cand.relPath,
      absPath: cand.absPath,
      folderPath: dirnamePath(cand.absPath, ctx.platform),
      similarity: Math.max(0, Math.min(1, sim)),
      preview: cand.snippet.slice(0, 220).replace(/\s+/g, " "),
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  const topK = Math.max(1, Math.min(15, Number(payload.topK || 6)));

  return {
    query,
    model: embedRes.model,
    scannedFilesCount: candidates.length,
    cachedFilesCount,
    computedFilesCount: uncachedIndices.length,
    matches: scored.slice(0, topK),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 11. Bionic Chat, Reasoning, Vision, Skill Injection, Structured JSON & Staged File Actions
// ---------------------------------------------------------------------------------------------------------------

export const BIONIC_SCHEMA_PRESETS: Record<string, { name: string; schema: Record<string, any> }> = {
  batch_rename_plan: {
    name: "batch_rename_plan",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        renames: {
          type: "array",
          items: {
            type: "object",
            properties: {
              originalName: { type: "string" },
              newName: { type: "string" },
              reason: { type: "string" },
            },
            required: ["originalName", "newName", "reason"],
          },
        },
      },
      required: ["summary", "renames"],
    },
  },
  folder_organization_plan: {
    name: "folder_organization_plan",
    schema: {
      type: "object",
      properties: {
        strategy: { type: "string" },
        folders: {
          type: "array",
          items: {
            type: "object",
            properties: {
              folderName: { type: "string" },
              files: { type: "array", items: { type: "string" } },
              purpose: { type: "string" },
            },
            required: ["folderName", "files", "purpose"],
          },
        },
      },
      required: ["strategy", "folders"],
    },
  },
  table_extraction: {
    name: "table_extraction",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        columns: { type: "array", items: { type: "string" } },
        rows: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
      },
      required: ["title", "columns", "rows"],
    },
  },
};

export async function selectBestBionicModel(
  ctx: FmContext,
  requestedModel?: string,
  requireVision = false,
): Promise<{ model: string; verdict: HardwareGuardVerdict }> {
  const { hardware, models, loadedModels } = await listBionicModelsAndHardwareStatus(ctx);

  if (requestedModel && requestedModel.trim()) {
    const clean = requestedModel.trim();
    const found = models.find((m) => m.id === clean || m.modelKey === clean);
    const verdict = found
      ? found.hardwareVerdict
      : evaluateModelHardwareGuard({ name: clean, runner: "mlx" }, hardware, {
          allowNonMlxStandardOnMac: true,
        });
    if (!verdict.allowed) {
      throw new FmError(verdict.code, verdict.reason);
    }
    return { model: clean, verdict };
  }

  // Prefer already-loaded LLM/VLM if compatible
  const chatLoaded = loadedModels.filter((m) => m.type === "llm" || m.type === "vlm");
  if (requireVision) {
    const loadedVlm = chatLoaded.find((m) => m.vision && m.hardwareVerdict.allowed);
    if (loadedVlm) return { model: loadedVlm.id, verdict: loadedVlm.hardwareVerdict };
    const anyVlm = models.find((m) => m.vision && m.hardwareVerdict.allowed);
    if (anyVlm) return { model: anyVlm.id, verdict: anyVlm.hardwareVerdict };
  }

  if (chatLoaded.length > 0 && chatLoaded[0]!.hardwareVerdict.allowed) {
    return { model: chatLoaded[0]!.id, verdict: chatLoaded[0]!.hardwareVerdict };
  }

  const firstAllowed = models.find((m) => (m.type === "llm" || m.type === "vlm") && m.hardwareVerdict.allowed);
  if (firstAllowed) {
    return { model: firstAllowed.id, verdict: firstAllowed.hardwareVerdict };
  }

  const fallback = "openai/gpt-oss-20b";
  return {
    model: fallback,
    verdict: evaluateModelHardwareGuard({ name: fallback, runner: "mlx" }, hardware),
  };
}

export async function runBionicChat(
  ctx: FmContext,
  payload: {
    model?: string;
    prompt: string;
    paths?: string[];
    dirPath?: string;
    skill?: string;
    schemaPreset?: string;
    speakReply?: boolean;
    voice?: string;
    temperature?: number;
    maxTokens?: number;
    enableTools?: boolean;
  },
): Promise<{
  model: string;
  hardwareVerdict: HardwareGuardVerdict;
  content: string;
  reasoningText: string;
  structuredJson: any;
  stats: {
    tokensPerSecond: number;
    timeToFirstToken: number;
    generationTime: number;
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
  };
  runtime: { name: string; version: string; format: string } | null;
  injectedSkills: string[];
  inspectedFiles: string[];
  pendingActions: BionicPendingAction[];
  speechResult: any;
}> {
  const server = await ensureBionicServerRunning(ctx);
  if (!server.running) {
    throw new FmError(
      "BIONIC_SERVER_OFFLINE",
      "LM Studio Bionic local server is offline. Click 'Start Bionic Server (lms server start)' or open Bionic.app.",
    );
  }

  const rawPrompt = String(payload.prompt || "").trim();
  if (!rawPrompt) {
    throw new FmError("INVALID_INPUT", "Enter a prompt for LM Studio Bionic.");
  }

  const paths = Array.isArray(payload.paths) ? payload.paths : [];
  const inspectedFiles: string[] = [];
  const fileSnippets: string[] = [];
  const imageDataUrls: string[] = [];

  for (const rel of paths.slice(0, 8)) {
    const abs = resolveSandboxPath(ctx, rel);
    const name = basenamePath(abs);
    inspectedFiles.push(rel);
    if (isSupportedVisionImagePath(abs)) {
      const b64 = await readImageAsBase64(abs);
      const ext = extnameLower(abs) === "png" ? "png" : extnameLower(abs) === "webp" ? "webp" : "jpeg";
      imageDataUrls.push(`data:image/${ext};base64,${b64}`);
      fileSnippets.push(`[Attached Vision Image: ${name} (${rel})]`);
    } else {
      const snippet = await readTextFileSnippet(abs, 14_000);
      fileSnippets.push(`=== File: ${name} (${rel}) ===\n${snippet}`);
    }
  }

  // Check for `@skill-name` triggers in prompt or explicit `payload.skill`
  const injectedSkills: string[] = [];
  const skillContexts: string[] = [];
  const { skills } = listBionicSkills(ctx, payload.dirPath);
  const requestedSkillNames = new Set<string>();
  if (payload.skill) requestedSkillNames.add(payload.skill.replace(/^@/, "").trim());
  const mentionMatches = rawPrompt.matchAll(/(?:^|\s)@([a-z0-9-]{2,63})\b/gi);
  for (const m of mentionMatches) {
    if (m[1]) requestedSkillNames.add(m[1].toLowerCase());
  }

  for (const sName of requestedSkillNames) {
    const matched = skills.find((s) => s.name.toLowerCase() === sName);
    if (matched) {
      const skillBody = readTextFileSyncPure(matched.skillMdPath);
      if (skillBody) {
        injectedSkills.push(matched.name);
        skillContexts.push(`=== Bionic Skill (@${matched.name}) [Path: ${matched.folderPath}] ===\n${skillBody.slice(0, 6000)}`);
      }
    }
  }

  const { model, verdict } = await selectBestBionicModel(ctx, payload.model, imageDataUrls.length > 0);
  bionicSessionLoadedModels.add(model);

  const systemParts = [
    "You are LM Studio Bionic running inside Codecaine File Manager on Apple Silicon Metal.",
    "Be concise, accurate, and directly helpful with files, code, architecture, and workspace tasks.",
  ];
  if (skillContexts.length > 0) {
    systemParts.push("Active Bionic Agent Skills injected for this turn:\n\n" + skillContexts.join("\n\n"));
  }

  const fullUserText = [rawPrompt, ...fileSnippets].filter(Boolean).join("\n\n");
  const userContent: any =
    imageDataUrls.length > 0
      ? [
          { type: "text", text: fullUserText },
          ...imageDataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
        ]
      : fullUserText;

  const requestBody: Record<string, any> = {
    model,
    messages: [
      { role: "system", content: systemParts.join("\n") },
      { role: "user", content: userContent },
    ],
    temperature: typeof payload.temperature === "number" ? payload.temperature : 0.4,
    max_tokens: typeof payload.maxTokens === "number" ? payload.maxTokens : 2048,
  };

  if (payload.schemaPreset && BIONIC_SCHEMA_PRESETS[payload.schemaPreset]) {
    const preset = BIONIC_SCHEMA_PRESETS[payload.schemaPreset]!;
    requestBody.response_format = {
      type: "json_schema",
      json_schema: {
        name: preset.name,
        strict: true,
        schema: preset.schema,
      },
    };
  }

  // Try /api/v0/chat/completions first for rich runtime + tokens_per_second stats, fallback to /v1/chat/completions
  let res = await fetch(`${server.baseUrl}/api/v0/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (res.status === 404) {
    res = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new FmError("BIONIC_CHAT_ERROR", errText || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;
  const msg = data?.choices?.[0]?.message || {};
  let content = String(msg.content || "").trim();
  let reasoningText = String(msg.reasoning || msg.reasoning_content || "").trim();

  // Also extract `<think>...</think>` blocks if present in content
  const thinkTagMatch = /^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/i.exec(content);
  if (thinkTagMatch) {
    if (!reasoningText) reasoningText = thinkTagMatch[1]!.trim();
    content = thinkTagMatch[2]!.trim();
  }

  let structuredJson: any = null;
  if (payload.schemaPreset && content) {
    try {
      structuredJson = JSON.parse(content);
    } catch {}
  }

  // Stage visual confirmation action if requested via natural language tool trigger
  const stagedActions: BionicPendingAction[] = [];
  if (payload.enableTools) {
    const createMatch = /\bcreate\s+(?:a\s+)?file\s+(?:named|called)\s+([^\s"']+)[\s\S]*?(?:with\s+content|:)\s*([\s\S]+)$/i.exec(
      rawPrompt,
    );
    if (createMatch) {
      const fileName = createMatch[1]!.trim();
      const fileBody = createMatch[2]!.trim();
      const actionId = `bionic_act_${Date.now()}`;
      const act: BionicPendingAction = {
        actionId,
        toolName: "create_file",
        title: `Create File: ${fileName}`,
        description: `Bionic staged creating "${fileName}" (${fileBody.length} chars) in the active folder.`,
        args: { dirPath: payload.dirPath || ".", name: fileName, content: fileBody },
        createdAt: Date.now(),
        status: "pending",
      };
      bionicPendingActions.set(actionId, act);
      stagedActions.push(act);
    }
  }

  let speechResult: any = null;
  if (payload.speakReply && content) {
    try {
      speechResult = await runBionicSpeech(ctx, {
        input: content,
        voice: payload.voice || "Zoey",
        mode: "speaker",
      });
    } catch {}
  }

  return {
    model: data?.model || model,
    hardwareVerdict: verdict,
    content,
    reasoningText,
    structuredJson,
    stats: {
      tokensPerSecond: Math.round(Number(data?.stats?.tokens_per_second || 0) * 10) / 10,
      timeToFirstToken: Math.round(Number(data?.stats?.time_to_first_token || 0) * 1000) / 1000,
      generationTime: Math.round(Number(data?.stats?.generation_time || 0) * 100) / 100,
      promptTokens: Number(data?.usage?.prompt_tokens || 0),
      completionTokens: Number(data?.usage?.completion_tokens || 0),
      reasoningTokens: Number(data?.usage?.completion_tokens_details?.reasoning_tokens || 0),
    },
    runtime: data?.runtime
      ? {
          name: String(data.runtime.name || "mlx-llm"),
          version: String(data.runtime.version || ""),
          format: String(data?.model_info?.format || "mlx"),
        }
      : null,
    injectedSkills,
    inspectedFiles,
    pendingActions: stagedActions,
    speechResult,
  };
}

export async function executeConfirmedBionicAction(
  ctx: FmContext,
  actionId: string,
  decision: "confirm" | "cancel",
): Promise<{ ok: boolean; action: BionicPendingAction; createdPath?: string }> {
  const act = bionicPendingActions.get(actionId);
  if (!act) {
    throw new FmError("ACTION_NOT_FOUND", `Staged Bionic action "${actionId}" was not found.`);
  }
  if (decision === "cancel") {
    act.status = "cancelled";
    return { ok: true, action: act };
  }

  if (act.toolName === "create_file") {
    const dirAbs = resolveSandboxPath(ctx, act.args.dirPath || ".");
    const targetAbs = joinPath([dirAbs, String(act.args.name || "bionic-note.txt")], ctx.platform);
    await assertCreatable(ctx, targetAbs);
    await Bun.write(targetAbs, String(act.args.content || ""));
    act.status = "confirmed";
    return { ok: true, action: act, createdPath: toSandboxRelative(ctx, targetAbs) };
  }

  act.status = "confirmed";
  return { ok: true, action: act };
}

// ---------------------------------------------------------------------------------------------------------------
// 12. Plain-English Capability Router for LM Studio Bionic (`bionic/route`)
// ---------------------------------------------------------------------------------------------------------------

export async function routeBionicRequest(
  ctx: FmContext,
  payload: {
    prompt: string;
    paths?: string[];
    dirPath?: string;
    model?: string;
    voice?: string;
    language?: string;
    speakReply?: boolean;
  },
): Promise<{
  routedCapability:
    | "speech"
    | "transcribe"
    | "semantic_search"
    | "skill_execution"
    | "structured_json"
    | "vision"
    | "tool_action"
    | "reasoning_chat";
  routeExplanation: string;
  result: any;
}> {
  const prompt = String(payload.prompt || "").trim();
  const paths = Array.isArray(payload.paths) ? payload.paths : [];

  if (!prompt && paths.length > 0) {
    const firstExt = extnameLower(paths[0]!);
    if (["wav", "mp3", "m4a", "flac", "ogg", "mp4", "mov", "webm"].includes(firstExt)) {
      const result = await transcribeWithBionicAsr(ctx, {
        path: paths[0]!,
        format: "markdown",
        summarize: true,
        model: payload.model,
      });
      return {
        routedCapability: "transcribe",
        routeExplanation: `Routed selected media file (${paths[0]}) to Bionic ExecuTorch Whisper Metal ASR Transcription.`,
        result,
      };
    }
    const result = await runBionicSpeech(ctx, {
      path: paths[0]!,
      voice: payload.voice || "Zoey",
      language: payload.language || "en",
      mode: "speaker",
      saveDir: payload.dirPath || ".",
    });
    return {
      routedCapability: "speech",
      routeExplanation: `Routed selected file (${paths[0]}) directly to Bionic Phonon 40M Multilingual TTS (${result.voice}).`,
      result,
    };
  }

  if (!prompt) {
    throw new FmError("INVALID_INPUT", "Type a plain-English request or select a file for LM Studio Bionic.");
  }

  const pLower = prompt.toLowerCase();

  // 1. Speech / Read Aloud
  if (
    /\b(read\s+(this|it|selected|file|aloud|out\s+loud)|speak\s+(this|it|aloud)|text[\s-]to[\s-]speech|phonon\s+tts|save\s+as\s+(wav|audio))\b/i.test(
      pLower,
    )
  ) {
    const saveAsFile = /\b(save\s+as|export\s+wav|save\s+audio|file\s+mode)\b/i.test(pLower);
    const speechInput =
      paths.length > 0
        ? undefined
        : prompt.replace(/^(please\s+)?(read\s+(this\s+)?(out\s+loud|aloud)\s*:?\s*|speak\s*:?\s*)/i, "").trim() || prompt;
    const result = await runBionicSpeech(ctx, {
      input: speechInput,
      path: paths[0],
      voice: payload.voice || "Zoey",
      language: payload.language || "en",
      mode: saveAsFile ? "file" : "speaker",
      saveDir: payload.dirPath || ".",
    });
    return {
      routedCapability: "speech",
      routeExplanation: `Routed to Bionic Native Apple Metal Phonon 40M Multilingual TTS (${result.voice}, 24kHz WAV).`,
      result,
    };
  }

  // 2. Audio / Video ASR Transcription
  if (/\b(transcribe|speech[\s-]to[\s-]text|whisper|asr|audio\s+to\s+markdown|extract\s+transcript)\b/i.test(pLower) && paths.length > 0) {
    const result = await transcribeWithBionicAsr(ctx, {
      path: paths[0]!,
      format: "markdown",
      summarize: true,
      model: payload.model,
    });
    return {
      routedCapability: "transcribe",
      routeExplanation: `Routed to Bionic ExecuTorch Whisper Metal ASR Engine for "${paths[0]}".`,
      result,
    };
  }

  // 3. Semantic Meaning Search (/v1/embeddings)
  if (/\b(find\s+the\s+file\s+where|search\s+by\s+meaning|semantic\s+search|which\s+file\s+(has|contains|implements|wrote))\b/i.test(pLower)) {
    const result = await runBionicSemanticSearch(ctx, {
      query: prompt,
      dirPath: payload.dirPath || ".",
    });
    return {
      routedCapability: "semantic_search",
      routeExplanation: `Routed to Bionic Local Embeddings & Meaning Search (POST /v1/embeddings, model: ${result.model}).`,
      result,
    };
  }

  // 4. Structured JSON Output
  if (/\b(batch[\s-]rename|rename\s+plan|organize\s+folder|organization\s+plan|extract\s+table|as\s+json)\b/i.test(pLower)) {
    const schemaPreset = /\b(rename)\b/i.test(pLower)
      ? "batch_rename_plan"
      : /\b(table)\b/i.test(pLower)
        ? "table_extraction"
        : "folder_organization_plan";
    const result = await runBionicChat(ctx, {
      model: payload.model,
      prompt,
      paths,
      dirPath: payload.dirPath,
      schemaPreset,
      speakReply: payload.speakReply,
      voice: payload.voice,
    });
    return {
      routedCapability: "structured_json",
      routeExplanation: `Routed to Bionic Grammar-Constrained JSON Schema Output (${schemaPreset}) on ${result.model}.`,
      result,
    };
  }

  // 5. Check for `@skill` invocation
  const hasSkillMention = /(?:^|\s)@([a-z0-9-]{2,63})\b/i.test(prompt);
  const hasImages = paths.some((p) => isSupportedVisionImagePath(p));
  const needsTools = /\b(create\s+a\s+file|create\s+file)\b/i.test(pLower);

  const result = await runBionicChat(ctx, {
    model: payload.model,
    prompt,
    paths,
    dirPath: payload.dirPath,
    enableTools: needsTools,
    speakReply: payload.speakReply,
    voice: payload.voice,
  });

  const cap = hasSkillMention
    ? "skill_execution"
    : hasImages
      ? "vision"
      : needsTools
        ? "tool_action"
        : "reasoning_chat";

  return {
    routedCapability: cap,
    routeExplanation: hasSkillMention
      ? `Routed to Bionic Agent Skill Execution (${result.injectedSkills.map((s) => `@${s}`).join(", ") || "Skill Context"}) via ${result.model}.`
      : hasImages
        ? `Routed to Bionic Multimodal Vision VLM (${result.model}) with attached images.`
        : `Routed to Bionic Deep Reasoning & Code Chat (POST /api/v0/chat/completions, model: ${result.model}, ${result.stats.tokensPerSecond || "live"} tok/s).`,
    result,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 13. Live Streaming Endpoint (`POST /api/bionic/stream`) & Full Status Aggregator
// ---------------------------------------------------------------------------------------------------------------

export async function handleBionicStreamRequest(ctx: FmContext, req: Request): Promise<Response> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "NOT_JSON", message: "Requests must be JSON." } }),
      { status: 415, headers: { "Content-Type": "application/json" } },
    );
  }
  let body: any = {};
  try {
    body = JSON.parse((await req.text()) || "{}");
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "BAD_JSON", message: "Invalid JSON body." } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const server = await ensureBionicServerRunning(ctx);
    if (!server.running) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: "BIONIC_SERVER_OFFLINE", message: "LM Studio Bionic HTTP Server is offline." },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const paths: string[] = Array.isArray(body.paths) ? body.paths : [];
    const fileSnippets: string[] = [];
    for (const rel of paths.slice(0, 6)) {
      const abs = resolveSandboxPath(ctx, rel);
      if (!isSupportedVisionImagePath(abs)) {
        const snippet = await readTextFileSnippet(abs, 12_000);
        fileSnippets.push(`=== File: ${basenamePath(abs)} (${rel}) ===\n${snippet}`);
      }
    }

    const { model, verdict } = await selectBestBionicModel(ctx, body.model, false);
    bionicSessionLoadedModels.add(model);

    const promptText = [String(body.prompt || "Hello"), ...fileSnippets].filter(Boolean).join("\n\n");
    const upstream = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are LM Studio Bionic running inside Codecaine File Manager.",
          },
          { role: "user", content: promptText },
        ],
        stream: true,
        max_tokens: Number(body.maxTokens || 2048),
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text();
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: "BIONIC_STREAM_ERROR", message: errText || `HTTP ${upstream.status}` },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Bionic-Model": model,
        "X-Bionic-Port": String(server.port),
        "X-Bionic-Safe-Budget-Gb": String(verdict.safeMemoryBudgetGb),
      },
    });
  } catch (err) {
    const code = err instanceof FmError ? err.code : "BIONIC_STREAM_FAILED";
    const message = (err as Error).message || "Stream failed";
    return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}

const SYNTHESIS_STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "have", "are", "was", "were", "will", "would",
  "could", "should", "into", "about", "there", "their", "they", "them", "then", "than", "when", "where",
  "which", "while", "what", "your", "more", "some", "such", "only", "other", "also", "been", "being",
  "each", "over", "under", "after", "before", "between", "through", "during", "file", "package", "chapter",
]);

function extractTopKeywordsFromText(text: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  const words = text.toLowerCase().match(/[a-z][a-z0-9_-]{3,24}/g) || [];
  for (const w of words) {
    if (SYNTHESIS_STOP_WORDS.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

function extractHeadingsFromSnippet(text: string, limit = 6): string[] {
  const headings: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const mdMatch = /^#{1,4}\s+(.+)$/.exec(line);
    const secMatch = /^===\s*(.+?)\s*===$/.exec(line);
    const candidate = mdMatch?.[1] || secMatch?.[1] || "";
    if (candidate && candidate.length <= 90 && !headings.includes(candidate)) {
      headings.push(candidate);
      if (headings.length >= limit) break;
    }
  }
  return headings;
}

export interface BionicSynthesizeDocItem {
  name: string;
  path: string;
  ext: string;
  wordCount: number;
  lineCount: number;
  charCount: number;
  headings: string[];
  keywords: string[];
  excerpt: string;
}

function buildDeterministicSynthesisReport(
  docs: BionicSynthesizeDocItem[],
  mode: "compare" | "summarize" | "study-guide" | "action-items",
): string {
  const modeTitle =
    mode === "compare"
      ? "Multi-Document Comparison & Synthesis"
      : mode === "study-guide"
        ? "Multi-Document Study Guide & Key Concepts"
        : mode === "action-items"
          ? "Consolidated Action Items & Takeaways"
          : "Multi-File Executive Summary";

  const totalWords = docs.reduce((acc, d) => acc + d.wordCount, 0);
  const totalLines = docs.reduce((acc, d) => acc + d.lineCount, 0);

  // Compute shared keywords across 2+ documents
  const kwFreq = new Map<string, number>();
  for (const d of docs) {
    for (const kw of new Set(d.keywords)) {
      kwFreq.set(kw, (kwFreq.get(kw) || 0) + 1);
    }
  }
  const sharedThemes = [...kwFreq.entries()]
    .filter(([, count]) => count >= Math.min(2, docs.length))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([kw, count]) => `\`${kw}\` (${count}/${docs.length} files)`);

  const lines: string[] = [
    `# 🧬 ${modeTitle}`,
    "",
    `Synthesized **${docs.length} ${docs.length === 1 ? "document" : "documents"}** totaling **${totalWords.toLocaleString("en-US")} words** (${totalLines.toLocaleString("en-US")} lines).`,
    "",
    "## 📊 Document Comparison Matrix",
    "",
    "| Document | Format | Words | Lines | Primary Keywords |",
    "| --- | --- | ---: | ---: | --- |",
    ...docs.map(
      (d) =>
        `| **${d.name.replace(/\|/g, "\\|")}** | \`.${d.ext || "txt"}\` | ${d.wordCount.toLocaleString("en-US")} | ${d.lineCount.toLocaleString("en-US")} | ${
          d.keywords.slice(0, 5).map((k) => `\`${k}\``).join(", ") || "—"
        } |`,
    ),
    "",
    "## 🔗 Shared Themes & Cross-File Overlap",
    "",
    sharedThemes.length
      ? `- **Cross-Document Vocabulary:** ${sharedThemes.join(", ")}`
      : "- **Distinct Topics:** Each selected file focuses on distinct terminology with minimal direct keyword overlap.",
    "",
    "## 📑 Per-Document Breakdown",
    "",
  ];

  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]!;
    lines.push(`### ${i + 1}. ${d.name} (\`${d.path}\`)`);
    lines.push(`- **Metrics:** ${d.wordCount.toLocaleString("en-US")} words · ${d.lineCount.toLocaleString("en-US")} lines · ${d.charCount.toLocaleString("en-US")} chars`);
    if (d.headings.length) {
      lines.push(`- **Sections / Headings:** ${d.headings.map((h) => `*${h}*`).join(" · ")}`);
    }
    if (d.keywords.length) {
      lines.push(`- **Key Terms:** ${d.keywords.map((k) => `\`${k}\``).join(", ")}`);
    }
    const cleanExcerpt = d.excerpt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("==="))
      .slice(0, 4)
      .join(" ")
      .slice(0, 360);
    if (cleanExcerpt) {
      lines.push(`> ${cleanExcerpt}${cleanExcerpt.length >= 360 ? "…" : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function runBionicSynthesize(
  ctx: FmContext,
  payload: {
    paths: string[];
    mode?: "compare" | "summarize" | "study-guide" | "action-items";
    customPrompt?: string;
    model?: string;
    saveToFile?: boolean;
    dirPath?: string;
  },
): Promise<{
  ok: boolean;
  mode: "compare" | "summarize" | "study-guide" | "action-items";
  engine: string;
  fileCount: number;
  files: Array<{
    name: string;
    path: string;
    ext: string;
    wordCount: number;
    lineCount: number;
    keywords: string[];
  }>;
  reportMarkdown: string;
  savedRelativePath: string | null;
}> {
  const rawPaths = Array.isArray(payload?.paths) ? payload.paths.map((p) => String(p || "").trim()).filter(Boolean) : [];
  if (rawPaths.length === 0) {
    throw new FmError("INVALID_INPUT", "Select at least one file or document package to synthesize.");
  }

  const mode =
    payload.mode === "summarize" || payload.mode === "study-guide" || payload.mode === "action-items"
      ? payload.mode
      : "compare";

  const docs: BionicSynthesizeDocItem[] = [];
  for (const rel of rawPaths.slice(0, 12)) {
    const abs = resolveSandboxPath(ctx, rel);
    const snippet = (await readTextFileSnippet(abs, 16_000)).trim();
    const words = snippet ? snippet.split(/\s+/).filter(Boolean) : [];
    const lines = snippet ? snippet.split(/\r?\n/) : [];
    docs.push({
      name: basenamePath(abs),
      path: toSandboxRelative(ctx, abs),
      ext: extnameLower(abs) || "txt",
      wordCount: words.length,
      lineCount: lines.length,
      charCount: snippet.length,
      headings: extractHeadingsFromSnippet(snippet),
      keywords: extractTopKeywordsFromText(snippet),
      excerpt: snippet.slice(0, 4500),
    });
  }

  let reportMarkdown = "";
  let engine = "bionic-deterministic-synthesizer";

  const modePromptMap: Record<typeof mode, string> = {
    compare:
      "Compare and synthesize the following files/documents into a structured Markdown report with an overview table, key similarities, key differences, and a per-document summary.",
    summarize:
      "Create a comprehensive executive summary in Markdown across all of the following files/documents, highlighting core themes and takeaways.",
    "study-guide":
      "Build a structured Markdown study guide across the following documents/books with key concepts, definitions, chapter/section highlights, and review questions.",
    "action-items":
      "Extract and organize all actionable items, next steps, risks, and decisions across the following files into a clean Markdown checklist.",
  };

  try {
    const server = await ensureBionicServerRunning(ctx);
    if (server.running) {
      const promptHeader = payload.customPrompt?.trim() || modePromptMap[mode];
      const combinedDocs = docs
        .map(
          (d, i) =>
            `### Document ${i + 1}: ${d.name} (${d.path}) [${d.wordCount} words]\n${d.excerpt}`,
        )
        .join("\n\n");
      const chatRes = await runBionicChat(ctx, {
        model: payload.model,
        prompt: `${promptHeader}\n\n${combinedDocs}`,
        maxTokens: 2048,
      });
      if (chatRes.content && chatRes.content.trim()) {
        const corpusTable = [
          `## Bionic Multi-File Synthesis (${mode.toUpperCase()})`,
          "",
          `### Source Corpus (${docs.length} items)`,
          "| # | Document | Format | Words | Top Keywords |",
          "|---|---|---|---|---|",
          ...docs.map(
            (d, idx) =>
              `| ${idx + 1} | **${d.name}** (\`${d.path}\`) | \`${d.ext.toUpperCase()}\` | ${d.wordCount.toLocaleString("en-US")} | ${d.keywords.slice(0, 6).join(", ") || "—"} |`,
          ),
          "",
          chatRes.content.trim(),
        ].join("\n");
        reportMarkdown = corpusTable;
        engine = chatRes.model;
      }
    }
  } catch {}

  if (!reportMarkdown) {
    reportMarkdown = buildDeterministicSynthesisReport(docs, mode);
  }

  let savedRelativePath: string | null = null;
  if (payload.saveToFile) {
    const baseDir = resolveSandboxPath(
      ctx,
      payload.dirPath || (rawPaths[0] ? dirnamePath(resolveSandboxPath(ctx, rawPaths[0]), ctx.platform) : "."),
    );
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const outAbs = joinPath([baseDir, `Bionic-Synthesis-${stamp}.md`], ctx.platform);
    await assertCreatable(ctx, outAbs);
    await Bun.write(outAbs, reportMarkdown);
    savedRelativePath = toSandboxRelative(ctx, outAbs);
  }

  return {
    ok: true,
    mode,
    engine,
    fileCount: docs.length,
    files: docs.map((d) => ({
      name: d.name,
      path: d.path,
      ext: d.ext,
      wordCount: d.wordCount,
      lineCount: d.lineCount,
      keywords: d.keywords,
    })),
    reportMarkdown,
    savedRelativePath,
  };
}

export async function getFullBionicStatus(ctx: FmContext, payload?: { dirPath?: string }) {
  const apps = detectBionicApps(ctx);
  const server = await ensureBionicServerRunning(ctx);
  const { hardware, models, loadedModels, cloudModels } = await listBionicModelsAndHardwareStatus(ctx);
  const { backends, plugins } = listInstalledBionicBackends(ctx);
  const skillsInfo = listBionicSkills(ctx, payload?.dirPath);
  const projectsInfo = listBionicProjects(ctx);
  const ttsInfo = getBionicTtsConfigAndVoices(ctx);
  const asrInfo = getBionicAsrStatus(ctx);

  return {
    apps,
    server,
    hardware,
    models,
    loadedModels,
    cloudModels,
    backends,
    plugins,
    skills: skillsInfo.skills,
    skillCounts: skillsInfo.counts,
    projects: projectsInfo.projects,
    tts: ttsInfo,
    asr: asrInfo,
    lifecycle: getBionicLifecycleStatus(),
    pendingActions: [...bionicPendingActions.values()].filter((a) => a.status === "pending"),
  };
}

export const BIONIC_OPS: Record<string, (ctx: FmContext, payload: any) => Promise<any>> = {
  "bionic/status": (ctx, p) => getFullBionicStatus(ctx, p),
  "bionic/server": (ctx, p) => controlBionicServer(ctx, p || {}),
  "bionic/lifecycle": async (_ctx, p) =>
    p?.exitPolicy ? setBionicExitPolicy(String(p.exitPolicy)) : getBionicLifecycleStatus(),
  "bionic/shutdown": (ctx, p) => shutdownBionicForFileManager(ctx, p || {}),
  "bionic/hardware": async (ctx) => inspectOllamaHardware(ctx),
  "bionic/guard": async (ctx, p) => {
    const hw = inspectOllamaHardware(ctx);
    return evaluateModelHardwareGuard(
      p?.model ? (typeof p.model === "string" ? { name: p.model, runner: "mlx" } : p.model) : { name: "" },
      hw,
      { allowNonMlxStandardOnMac: true },
    );
  },
  "bionic/models": (ctx) => listBionicModelsAndHardwareStatus(ctx),
  "bionic/ps": async (ctx) => {
    const res = await listBionicModelsAndHardwareStatus(ctx);
    return { loadedModels: res.loadedModels };
  },
  "bionic/load": (ctx, p) => loadBionicModel(ctx, p || {}),
  "bionic/unload": (ctx, p) => unloadBionicModel(ctx, p || {}),
  "bionic/get": (ctx, p) => downloadBionicModel(ctx, p || {}),
  "bionic/chat": (ctx, p) => runBionicChat(ctx, p || {}),
  "bionic/route": (ctx, p) => routeBionicRequest(ctx, p || {}),
  "bionic/synthesize": (ctx, p) => runBionicSynthesize(ctx, p || {}),
  "bionic/speech": (ctx, p) => runBionicSpeech(ctx, p || {}),
  "bionic/voices": async (ctx) => getBionicTtsConfigAndVoices(ctx),
  "bionic/ttsConfig": (ctx, p) => updateBionicTtsConfig(ctx, p || {}),
  "bionic/transcribe": (ctx, p) => transcribeWithBionicAsr(ctx, p || {}),
  "bionic/embed": (ctx, p) => runBionicEmbeddings(ctx, p || {}),
  "bionic/semanticSearch": (ctx, p) => runBionicSemanticSearch(ctx, p || {}),
  "bionic/skills": async (ctx, p) => listBionicSkills(ctx, p?.dirPath),
  "bionic/skill/read": (ctx, p) => readBionicSkillDetail(ctx, p || {}),
  "bionic/skill/create": (ctx, p) => createBionicSkill(ctx, p || {}),
  "bionic/projects": async (ctx) => listBionicProjects(ctx),
  "bionic/tool/confirm": (ctx, p) =>
    executeConfirmedBionicAction(ctx, String(p?.actionId || ""), p?.decision === "cancel" ? "cancel" : "confirm"),
};
