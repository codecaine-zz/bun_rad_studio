import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import {
  MIN_WEB_SEARCH_NUM_CTX,
  cleanTextForPhononSpeech,
  compareSemver,
  convertNumericDatesToWords,
  detectNativeHostArch,
  evaluateModelHardwareGuard,
  formatSystemOneQuestions,
  getOllamaInstallStatus,
  getSpeechCapabilitiesForHost,
  inspectOllamaHardware,
  resolveSpeechModelRegistryFallback,
  runOllamaAutoInstall,
  runOllamaSpeech,
  splitSpeechTextIntoChunks,
} from "../src/features/filemanager/fmOllama";

describe("Codecaine File Manager — Built-In Ollama AI Assistant & Full Capability Router", () => {
  let mockOllamaServer: ReturnType<typeof Bun.serve>;
  let mockOllamaUrl = "";
  let fmServer: ReturnType<typeof startFileManagerServer>;
  let fmUrl = "";
  let fmToken = "";
  let tempRoot = "";

  const recordedOllamaRequests: Array<{ path: string; method: string; body: any; headers: Record<string, string> }> = [];
  let mockVersion = "0.40.12";

  beforeAll(async () => {
    tempRoot = `/tmp/fm_ollama_test_${Date.now()}`;
    Bun.spawnSync(["mkdir", "-p", `${tempRoot}/home/docs`, `${tempRoot}/data`]);
    await Bun.write(
      `${tempRoot}/home/docs/auth_login.ts`,
      `export async function verifyDatabaseLogin(user: string, pass: string) {\n  // Database login authentication check\n  return user === "admin" && pass.length > 8;\n}\n`,
    );
    await Bun.write(
      `${tempRoot}/home/docs/crash.log`,
      `2026-10-28T10:12:00Z FATAL Unhandled panic in worker thread: segmentation fault at 0x0042\n`,
    );
    // Tiny valid 1x1 PNG
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    await Bun.write(`${tempRoot}/home/docs/receipt.png`, Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0)));

    mockOllamaServer = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;
        const headersObj: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          headersObj[k.toLowerCase()] = v;
        });

        let body: any = null;
        if (req.method !== "GET" && req.method !== "HEAD") {
          const raw = await req.text();
          if (raw) {
            try {
              body = JSON.parse(raw);
            } catch {
              body = raw;
            }
          }
        }
        recordedOllamaRequests.push({ path, method: req.method, body, headers: headersObj });

        if (path === "/api/version") {
          return Response.json({ version: mockVersion });
        }

        if (path === "/api/tags") {
          return Response.json({
            models: [
              {
                name: "lfm3:latest",
                model: "lfm3:latest",
                size: 1_900_000_000,
                modified_at: "2026-10-28T12:00:00Z",
                details: {
                  format: "safetensors",
                  family: "lfm3",
                  parameter_size: "1.7B",
                  quantization_level: "BF16",
                  runner: "mlx",
                },
              },
              {
                name: "lfm3-vl:2b-mlx-bf16",
                model: "lfm3-vl:2b-mlx-bf16",
                size: 3_800_000_000,
                modified_at: "2026-10-28T12:00:00Z",
                details: {
                  format: "safetensors",
                  family: "lfm3",
                  parameter_size: "1.9B",
                  quantization_level: "BF16",
                  runner: "mlx",
                },
              },
              {
                name: "d3:9b-mxfp8",
                model: "d3:9b-mxfp8",
                size: 9_600_000_000,
                modified_at: "2026-10-28T12:00:00Z",
                details: {
                  format: "safetensors",
                  family: "d3",
                  parameter_size: "8.4B",
                  quantization_level: "MXFP8",
                  runner: "mlx",
                },
              },
              {
                name: "phonon:latest",
                model: "phonon:latest",
                size: 185_000_000,
                modified_at: "2026-10-28T12:00:00Z",
                details: {
                  format: "safetensors",
                  family: "gradium",
                  parameter_size: "43.6M",
                  quantization_level: "BF16",
                  runner: "mlx",
                },
              },
              {
                name: "legacy-non-mlx:7b",
                model: "legacy-non-mlx:7b",
                size: 4_500_000_000,
                modified_at: "2026-10-28T12:00:00Z",
                details: {
                  format: "gguf",
                  family: "llama",
                  parameter_size: "7B",
                  quantization_level: "Q4_K_M",
                  runner: "gguf",
                },
              },
            ],
          });
        }

        if (path === "/api/show") {
          const modelName = String(body?.model || "");
          if (modelName.startsWith("phonon")) {
            return Response.json({
              capabilities: ["speech"],
              details: { format: "safetensors", family: "gradium", parameter_size: "43.6M", quantization_level: "BF16", runner: "mlx" },
              model_info: {
                "general.parameter_count": 43600000,
                "gradium.voices": ["default", "Zoey", "Easton", "Freya", "Mia", "Leo"],
              },
            });
          }
          if (modelName.startsWith("d3")) {
            return Response.json({
              capabilities: ["decision", "vision"],
              details: { format: "safetensors", family: "d3", parameter_size: "8.4B", quantization_level: "MXFP8", runner: "mlx" },
              model_info: { "d3.context_length": 32768 },
            });
          }
          if (modelName.includes("-vl")) {
            return Response.json({
              capabilities: ["completion", "vision", "tools", "thinking"],
              details: { format: "safetensors", family: "lfm3", parameter_size: "1.9B", quantization_level: "BF16", runner: "mlx" },
              model_info: { "lfm3.context_length": 32768 },
            });
          }
          if (modelName.startsWith("legacy-non-mlx")) {
            return Response.json({
              capabilities: ["completion"],
              details: { format: "gguf", family: "llama", parameter_size: "7B", quantization_level: "Q4_K_M", runner: "gguf" },
              model_info: { "llama.context_length": 8192 },
            });
          }
          return Response.json({
            capabilities: ["completion", "tools", "thinking"],
            details: { format: "safetensors", family: "lfm3", parameter_size: "1.7B", quantization_level: "BF16", runner: "mlx" },
            model_info: { "lfm3.context_length": 32768 },
          });
        }

        if (path === "/api/ps") {
          return Response.json({
            models: [
              {
                name: "lfm3:latest",
                model: "lfm3:latest",
                size: 1_900_000_000,
                size_vram: 1_900_000_000,
                context_length: 32768,
                expires_at: "2026-10-28T19:00:00Z",
              },
            ],
          });
        }

        if (path === "/v1/systemone") {
          const questions = body?.questions || {};
          const answers: Record<string, any> = {};
          for (const [k, q] of Object.entries<any>(questions)) {
            if (q.type === "noul") {
              answers[k] = { type: "noul", noul: 0.96 };
            } else if (q.type === "choice") {
              const keys = Object.keys(q.criteria || {});
              const win = keys.includes("bug_report") ? "bug_report" : keys[0] || "billing";
              answers[k] = {
                type: "choice",
                choice: win,
                probabilities: Object.fromEntries(keys.map((label, i) => [label, i === 0 ? 0.85 : 0.05])),
                confidence: 0.91,
              };
            } else if (q.type === "score") {
              const levels: string[] = Array.isArray(q.criteria) ? q.criteria : ["Routine", "Soon", "Immediate"];
              answers[k] = {
                type: "score",
                score: levels.length - 1 - 0.1,
                legend: Object.fromEntries(levels.map((lvl, idx) => [String(idx), lvl])),
                probabilities: Object.fromEntries(levels.map((_lvl, idx) => [String(idx), idx === levels.length - 1 ? 0.9 : 0.05])),
                confidence: 0.88,
              };
            }
          }
          return Response.json({
            model: body?.model || "d3:9b-mxfp8",
            answers,
          });
        }

        if (path === "/v1/audio/speech") {
          // Return a valid 44-byte RIFF WAV header + 4800 bytes of 24kHz 16-bit mono PCM (0.1s)
          const pcmLen = 4800;
          const buf = new ArrayBuffer(44 + pcmLen);
          const view = new DataView(buf);
          const writeStr = (off: number, s: string) => {
            for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
          };
          writeStr(0, "RIFF");
          view.setUint32(4, 36 + pcmLen, true);
          writeStr(8, "WAVE");
          writeStr(12, "fmt ");
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true);
          view.setUint16(22, 1, true);
          view.setUint32(24, 24000, true);
          view.setUint32(28, 48000, true);
          view.setUint16(32, 2, true);
          view.setUint16(34, 16, true);
          writeStr(36, "data");
          view.setUint32(40, pcmLen, true);
          return new Response(new Uint8Array(buf), {
            status: 200,
            headers: { "Content-Type": "audio/wav" },
          });
        }

        if (path === "/api/chat") {
          if (body?.keep_alive === 0) {
            return Response.json({ model: body.model, done: true, done_reason: "unload" });
          }
          if (body?.stream === true) {
            const ndjson =
              JSON.stringify({ model: body.model, message: { role: "assistant", thinking: "Analyzing file..." }, done: false }) +
              "\n" +
              JSON.stringify({ model: body.model, message: { role: "assistant", content: "Live streamed answer." }, done: true }) +
              "\n";
            return new Response(ndjson, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
          }
          if (body?.format) {
            return Response.json({
              model: body.model,
              message: {
                role: "assistant",
                content: JSON.stringify({
                  summary: "Clean batch rename plan",
                  renames: [{ from: "docs/crash.log", to: "docs/crash_2026_10_28.log", reason: "Add ISO date" }],
                }),
              },
              done: true,
            });
          }
          if (body?.tools && String(body?.messages?.[body.messages.length - 1]?.content || "").includes("create a file")) {
            return Response.json({
              model: body.model,
              message: {
                role: "assistant",
                content: "I have prepared a new file creation action for your confirmation.",
                tool_calls: [
                  {
                    function: {
                      name: "create_file",
                      arguments: {
                        path: "docs/ai_created_note.txt",
                        content: "Created safely after visual confirmation!",
                      },
                    },
                  },
                ],
              },
              done: true,
            });
          }
          return Response.json({
            model: body?.model || "lfm3:latest",
            message: {
              role: "assistant",
              thinking: body?.think ? "Step 1: Read file. Step 2: Formulate answer." : "",
              content: "Summary completed on 10/28 with **bold** highlights.",
            },
            done: true,
          });
        }

        if (path === "/api/generate") {
          if (body?.keep_alive === 0) {
            return Response.json({ model: body.model, done: true, done_reason: "unload" });
          }
          return Response.json({
            model: body?.model || "lfm3:latest",
            response: "Generated response text.",
            done: true,
          });
        }

        if (path === "/api/embed") {
          const inputs: string[] = Array.isArray(body?.input) ? body.input : [String(body?.input || "")];
          const embeddings = inputs.map((txt) => {
            const lower = txt.toLowerCase();
            if (lower.includes("database") || lower.includes("login") || lower.includes("auth")) {
              return [0.95, 0.2, 0.1, 0.05];
            }
            return [0.05, 0.1, 0.9, 0.2];
          });
          return Response.json({ model: body?.model || "lfm3:latest", embeddings });
        }

        if (path === "/api/web_search") {
          return Response.json({
            results: [
              {
                title: "Ollama 0.40.12 Release Notes",
                url: "https://ollama.com/blog/ollama-0-40",
                content: "Added Gradium Phonon TTS and SystemOne Decision API.",
              },
            ],
          });
        }

        if (path === "/api/web_fetch") {
          return Response.json({
            title: "Ollama Documentation",
            content: "Full documentation page content fetched for context.",
            links: ["https://ollama.com/docs"],
          });
        }

        if (path === "/api/pull") {
          const lines = [
            JSON.stringify({ status: "pulling manifest" }),
            JSON.stringify({ status: "downloading weights", completed: 50, total: 100 }),
            JSON.stringify({ status: "success", completed: 100, total: 100 }),
          ].join("\n");
          return new Response(lines, { status: 200 });
        }

        if (path === "/api/create" || path === "/api/copy" || path === "/api/push" || path === "/api/delete") {
          return Response.json({ status: "success" });
        }

        if (path === "/api/usage") {
          return Response.json({ plan: "Pro Cloud", requestsToday: 14 });
        }

        if (path === "/api/balance") {
          return Response.json({ remainingCredits: 42.5, currency: "USD" });
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    mockOllamaUrl = `http://127.0.0.1:${mockOllamaServer.port}`;
    fmToken = "test-ollama-token-12345";
    fmServer = startFileManagerServer({
      port: 0,
      host: "127.0.0.1",
      token: fmToken,
      context: {
        home: `${tempRoot}/home`,
        sandboxRoot: `${tempRoot}/home`,
        dataDir: `${tempRoot}/data`,
        ollama: {
          baseUrl: mockOllamaUrl,
          cloudBaseUrl: mockOllamaUrl,
          apiKey: "test_ollama_cloud_key",
          platform: "darwin",
          arch: "arm64",
          totalRamBytes: 48 * 1024 ** 3, // 48 GB Apple Silicon Mac
          cpuModel: "Apple M4 Pro",
          cpuCores: 14,
          playAudioCommand: [], // disable actual speaker sound during automated test
        },
      },
    });
    fmUrl = `http://127.0.0.1:${fmServer.port}`;
  });

  afterAll(() => {
    try {
      fmServer?.stop(true);
    } catch {}
    try {
      mockOllamaServer?.stop(true);
    } catch {}
    try {
      Bun.spawnSync(["rm", "-rf", tempRoot]);
    } catch {}
  });

  async function apiCall(op: string, payload: Record<string, any> = {}) {
    const res = await fetch(`${fmUrl}/api/${op}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fm-token": fmToken,
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as any;
    return { status: res.status, data };
  }

  test("1. Pure Bun Runtime check: fmOllama.ts has zero Node or external imports", async () => {
    const source = await Bun.file(`${import.meta.dir}/../src/features/filemanager/fmOllama.ts`).text();
    expect(source).not.toMatch(/from\s+["']node:/);
    expect(source).not.toMatch(/from\s+["'](fs|path|os|child_process|crypto|http|https)["']/);
    expect(source).toContain("Bun.spawnSync");
    expect(source).toContain("Bun.file");
    expect(source).toContain("Bun.write");
  });

  test("2. Strict Hardware Rules A, B, and C across all 4 RAM safety tiers & Apple Silicon MLX Exclusivity", () => {
    // Tier 1: Under 8 GB RAM (e.g. 6 GB RAM -> 4.2 GB 70% budget)
    const hw6Gb = inspectOllamaHardware({
      ollama: { platform: "darwin", arch: "arm64", totalRamBytes: 6 * 1024 ** 3, cpuModel: "Apple M1" },
    } as any);
    expect(hw6Gb.isAppleSiliconMac).toBe(true);
    expect(hw6Gb.ramTier).toBe("under_8gb");
    expect(hw6Gb.safeMemoryBudgetGb).toBeCloseTo(4.2, 1);

    // Allow tiny MLX model (1.7B) and utility models (phonon, nimble, clef-flash) on <8 GB RAM
    expect(evaluateModelHardwareGuard({ name: "lfm3:latest", parameterSize: "1.7B", runner: "mlx" }, hw6Gb).allowed).toBe(true);
    expect(evaluateModelHardwareGuard({ name: "phonon" }, hw6Gb).allowed).toBe(true);
    expect(evaluateModelHardwareGuard({ name: "nimble" }, hw6Gb).allowed).toBe(true);
    expect(evaluateModelHardwareGuard({ name: "clef-flash" }, hw6Gb).allowed).toBe(true);

    // Block 7B+ model on <8 GB RAM with polite refusal + suggestions
    const block7bOn6Gb = evaluateModelHardwareGuard({ name: "qwen2.5:7b-mlx", parameterSize: "7B", runner: "mlx" }, hw6Gb);
    expect(block7bOn6Gb.allowed).toBe(false);
    expect(block7bOn6Gb.code).toBe("HARDWARE_RAM_REFUSAL");
    expect(block7bOn6Gb.reason).toContain("freeze your computer");
    expect(block7bOn6Gb.suggestedCloudModel).toContain(":cloud");

    // Tier 2: 8 GB to 16 GB RAM (e.g. 16 GB RAM -> 11.2 GB 70% budget)
    const hw16Gb = inspectOllamaHardware({
      ollama: { platform: "darwin", arch: "arm64", totalRamBytes: 16 * 1024 ** 3 },
    } as any);
    expect(hw16Gb.ramTier).toBe("8gb_to_16gb");
    expect(evaluateModelHardwareGuard({ name: "d3:9b-mxfp8", parameterSize: "8.4B", runner: "mlx" }, hw16Gb).allowed).toBe(true);
    const block14bOn16Gb = evaluateModelHardwareGuard({ name: "qwen2.5:14b-mlx", parameterSize: "14B", runner: "mlx" }, hw16Gb);
    expect(block14bOn16Gb.allowed).toBe(false);
    expect(block14bOn16Gb.code).toBe("HARDWARE_RAM_REFUSAL");

    // Tier 3: 17 GB to 32 GB RAM (e.g. 32 GB RAM -> 22.4 GB 70% budget)
    const hw32Gb = inspectOllamaHardware({
      ollama: { platform: "darwin", arch: "arm64", totalRamBytes: 32 * 1024 ** 3 },
    } as any);
    expect(hw32Gb.ramTier).toBe("17gb_to_32gb");
    expect(
      evaluateModelHardwareGuard({ name: "qwen2.5:14b-mlx-q4", parameterSize: "14B", sizeBytes: 10 * 1024 ** 3, runner: "mlx" }, hw32Gb)
        .allowed,
    ).toBe(true);
    const block70bOn32Gb = evaluateModelHardwareGuard({ name: "llama3.3:70b-mlx", parameterSize: "70B", runner: "mlx" }, hw32Gb);
    expect(block70bOn32Gb.allowed).toBe(false);
    expect(block70bOn32Gb.code).toBe("HARDWARE_RAM_REFUSAL");

    // Tier 4: 33 GB to 64+ GB RAM (e.g. 64 GB RAM -> 44.8 GB 70% budget)
    const hw64Gb = inspectOllamaHardware({
      ollama: { platform: "darwin", arch: "arm64", totalRamBytes: 64 * 1024 ** 3 },
    } as any);
    expect(hw64Gb.ramTier).toBe("33gb_plus");
    expect(
      evaluateModelHardwareGuard({ name: "llama3.3:70b-mlx-q4", parameterSize: "70B", sizeBytes: 36 * 1024 ** 3, runner: "mlx" }, hw64Gb)
        .allowed,
    ).toBe(true);

    // Rule A: Mac Apple Silicon MLX Exclusivity blocks standard non-MLX GGUF models when MLX models exist
    const nonMlxVerdict = evaluateModelHardwareGuard(
      { name: "legacy-non-mlx:7b", parameterSize: "7B", format: "gguf", runner: "gguf" },
      hw64Gb,
      { hasMlxAlternativeForTask: true },
    );
    expect(nonMlxVerdict.allowed).toBe(false);
    expect(nonMlxVerdict.code).toBe("HARDWARE_MLX_EXCLUSIVITY");

    // Cloud models always pass with 0 local RAM
    const cloudVerdict = evaluateModelHardwareGuard({ name: "gemma4:cloud" }, hw6Gb);
    expect(cloudVerdict.allowed).toBe(true);
    expect(cloudVerdict.isCloud).toBe(true);
    expect(cloudVerdict.estimatedRamGb).toBe(0);
  });

  test("3. GET /api/tags & /api/show hides non-MLX models on Apple Silicon Mac and badges capabilities", async () => {
    const { status, data } = await apiCall("ollama/tags", {});
    expect(status).toBe(200);
    const names = data.models.map((m: any) => m.name);
    expect(names).toContain("lfm3:latest");
    expect(names).toContain("lfm3-vl:2b-mlx-bf16");
    expect(names).toContain("d3:9b-mxfp8");
    expect(names).toContain("phonon:latest");
    // Standard GGUF non-MLX model is automatically hidden on Apple Silicon Mac!
    expect(names).not.toContain("legacy-non-mlx:7b");
    expect(data.hiddenNonMlxModels.map((m: any) => m.name)).toContain("legacy-non-mlx:7b");

    const vlModel = data.models.find((m: any) => m.name === "lfm3-vl:2b-mlx-bf16");
    expect(vlModel.badges).toContain("Vision");
    expect(vlModel.badges).toContain("MLX");
    expect(vlModel.badges).toContain("Thinking");
  });

  test("4. Capability A: Decision / SystemOne Engine (POST /v1/systemone) formats noul, choice (2-26), and score (2-10) + multi-question & image support", async () => {
    // Validation bounds check
    expect(() =>
      formatSystemOneQuestions([{ type: "choice", instructions: "Too few", criteria: { only_one: "desc" } }]),
    ).toThrow();
    expect(() =>
      formatSystemOneQuestions([{ type: "score", instructions: "Too few", criteria: ["OnlyOne"] }]),
    ).toThrow();

    const { status, data } = await apiCall("ollama/decision", {
      paths: ["docs/crash.log", "docs/receipt.png"],
      questions: [
        { id: "has_crash", type: "noul", instructions: "Does this log file contain a crash?" },
        {
          id: "triage_bucket",
          type: "choice",
          instructions: "Categorize this file",
          criteria: {
            billing: "Invoices and receipts",
            bug_report: "Crash logs and stack traces",
            source_code: "Source code",
            personal: "Personal notes",
          },
        },
        {
          id: "urgency",
          type: "score",
          instructions: "Rate review urgency",
          criteria: ["Routine", "Soon", "Immediate"],
        },
      ],
    });
    expect(status).toBe(200);
    expect(data.answers.has_crash.type).toBe("noul");
    expect(data.answers.has_crash.noul).toBeGreaterThan(0.9);
    expect(data.answers.triage_bucket.type).toBe("choice");
    expect(data.answers.triage_bucket.choice).toBe("bug_report");
    expect(data.answers.urgency.type).toBe("score");
    expect(data.answers.urgency.score).toBeGreaterThan(1.5);

    const lastSysOneReq = recordedOllamaRequests.filter((r) => r.path === "/v1/systemone").pop();
    expect(lastSysOneReq).toBeDefined();
    expect(Array.isArray(lastSysOneReq?.body?.images)).toBe(true);
    expect(lastSysOneReq?.body?.images.length).toBe(1);
  });

  test("5. Capability B: Phonon Speech Engine (/v1/audio/speech) date conversion, markdown stripping, 4,096-char chunking, voice validation, File Mode & Safety Rule", async () => {
    // Date conversion check
    const dateConverted = convertNumericDatesToWords("Release scheduled for 10/28 and 2026-12-05 or 03/14/2027.");
    expect(dateConverted).toContain("October 28");
    expect(dateConverted).toContain("December 5, 2026");
    expect(dateConverted).toContain("March 14, 2027");

    // Markdown & <think> stripping check
    const cleaned = cleanTextForPhononSpeech("<think>secret reasoning</think>### Heading on 10/28\nCheck **bold** and `code` and ~tilde~!");
    expect(cleaned).not.toContain("<think>");
    expect(cleaned).not.toContain("secret reasoning");
    expect(cleaned).not.toContain("*");
    expect(cleaned).not.toContain("#");
    expect(cleaned).not.toContain("`");
    expect(cleaned).not.toContain("~");
    expect(cleaned).toContain("October 28");

    // 4,096-char paragraph/sentence splitting check
    const longParagraphs = Array.from({ length: 60 }, (_, i) => `Sentence number ${i + 1} with natural punctuation and details.`).join(" ");
    const chunks = splitSpeechTextIntoChunks(longParagraphs + " " + longParagraphs, 4096);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(4096);
    }

    // Reject unknown voice before hitting a 400 error
    const badVoiceRes = await apiCall("ollama/speech", {
      input: "Hello world",
      voice: "NonExistentRobotVoice999",
    });
    expect(badVoiceRes.status).toBe(400);
    expect(badVoiceRes.data.error.code).toBe("INVALID_PHONON_VOICE");

    // File Mode: Save 24kHz mono WAV directly into active folder
    const goodSpeechRes = await apiCall("ollama/speech", {
      input: "Meeting notes from 10/28: review **auth_login.ts**.",
      voice: "Zoey",
      mode: "file",
      responseFormat: "wav",
      saveDir: "docs",
      saveFilename: "meeting_10_28.wav",
    });
    expect(goodSpeechRes.status).toBe(200);
    expect(goodSpeechRes.data.cleanedText).toContain("October 28");
    expect(goodSpeechRes.data.cleanedText).not.toContain("**");
    expect(goodSpeechRes.data.savedRelativePath).toBe("docs/meeting_10_28.wav");
    expect(await Bun.file(`${tempRoot}/home/docs/meeting_10_28.wav`).exists()).toBe(true);

    // Safety Rule: Never send chat, completion, decision, or embedding requests to "phonon"
    const phononChatAttempt = await apiCall("ollama/chat", { model: "phonon", prompt: "Hello" });
    expect(phononChatAttempt.status).toBe(400);
    expect(phononChatAttempt.data.error.code).toBe("PHONON_SAFETY_VIOLATION");

    const phononEmbedAttempt = await apiCall("ollama/embed", { model: "phonon:latest", input: "Hello" });
    expect(phononEmbedAttempt.status).toBe(400);
    expect(phononEmbedAttempt.data.error.code).toBe("PHONON_SAFETY_VIOLATION");
  });

  test("6. Capabilities C, D, E, F, H, I: Chat, Thinking toggle, Vision base64, Structured JSON, 32,000-token Web Search context & Tool Confirmation", async () => {
    // When speakReply is true, thinking output is forced off (think: false)
    const chatSpeak = await apiCall("ollama/chat", {
      prompt: "Summarize crash.log",
      paths: ["docs/crash.log"],
      think: true,
      speakReply: true,
      voice: "Zoey",
    });
    expect(chatSpeak.status).toBe(200);
    expect(chatSpeak.data.thinkEnabled).toBe(false);
    expect(chatSpeak.data.speechResult).toBeDefined();
    expect(chatSpeak.data.speechResult.cleanedText).toContain("October 28");

    // Web Search automatically enforces num_ctx >= 32,000
    const webChat = await apiCall("ollama/chat", {
      prompt: "What is new in Ollama 0.40?",
      useWebSearch: true,
      numCtx: 4096,
    });
    expect(webChat.status).toBe(200);
    expect(webChat.data.enforcedNumCtx).toBeGreaterThanOrEqual(MIN_WEB_SEARCH_NUM_CTX);
    const lastChatReq = recordedOllamaRequests.filter((r) => r.path === "/api/chat").pop();
    expect(lastChatReq?.body?.options?.num_ctx).toBeGreaterThanOrEqual(32000);

    // Tool Calling stages a visual confirmation action before writing to disk
    const toolChat = await apiCall("ollama/chat", {
      prompt: "Please create a file with notes",
      enableTools: true,
    });
    expect(toolChat.status).toBe(200);
    expect(toolChat.data.pendingActions.length).toBeGreaterThan(0);
    const pendingAct = toolChat.data.pendingActions[0];
    expect(pendingAct.toolName).toBe("create_file");
    expect(await Bun.file(`${tempRoot}/home/docs/ai_created_note.txt`).exists()).toBe(false);

    // Confirming the visual prompt executes the file creation
    const confirmRes = await apiCall("ollama/tool/confirm", {
      actionId: pendingAct.actionId,
      decision: "confirm",
    });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.data.status).toBe("executed");
    expect(await Bun.file(`${tempRoot}/home/docs/ai_created_note.txt`).exists()).toBe(true);
  });

  test("7. Capability G & Plain-English Router: Semantic meaning search (/api/embed) and automatic routing", async () => {
    const semRes = await apiCall("ollama/route", {
      prompt: "Find the file where I wrote the database login logic",
      dirPath: "docs",
    });
    expect(semRes.status).toBe(200);
    expect(semRes.data.routedCapability).toBe("semantic_search");
    const firstMatch = semRes.data.result.matches[0];
    expect(firstMatch.name).toBe("auth_login.ts");
    expect(firstMatch.absPath.startsWith("/")).toBe(true);
    expect(firstMatch.folderPath.startsWith("/")).toBe(true);

    // Verify "Open Containing Folder" (calling `list` with `firstMatch.folderPath`) succeeds with a full path
    const listContainingRes = await apiCall("list", { path: firstMatch.folderPath });
    expect(listContainingRes.status).toBe(200);
    expect(listContainingRes.data.path).toBe(firstMatch.folderPath);

    const structRes = await apiCall("ollama/route", {
      prompt: "Create a batch-rename plan for these files as JSON",
      paths: ["docs/crash.log"],
    });
    expect(structRes.status).toBe(200);
    expect(structRes.data.routedCapability).toBe("structured_json");
    expect(structRes.data.result.structuredJson.renames.length).toBe(1);

    // Asking a question first, then going blank (prompt: "") with a selected file reads the selected file aloud instead of repeating the previous question
    const firstQuestionRes = await apiCall("ollama/route", {
      prompt: "What is the main topic of this log?",
      paths: ["docs/crash.log"],
    });
    expect(firstQuestionRes.status).toBe(200);
    expect(firstQuestionRes.data.routedCapability).toBe("chat");

    const blankReadSelectedRes = await apiCall("ollama/route", {
      prompt: "",
      paths: ["docs/crash.log"],
      voice: "Zoey",
    });
    expect(blankReadSelectedRes.status).toBe(200);
    expect(blankReadSelectedRes.data.routedCapability).toBe("speech");
    expect(blankReadSelectedRes.data.result.cleanedText).toContain("FATAL Unhandled panic in worker thread");
    expect(blankReadSelectedRes.data.result.cleanedText).not.toContain("What is the main topic of this log?");
  });

  test("8. Capability K: Full Lifecycle endpoints (/api/ps, Free Up RAM keep_alive: 0, /api/pull guard, /api/version warnings, /api/usage, /api/balance)", async () => {
    // Free Up RAM sends keep_alive: 0
    const freeRes = await apiCall("ollama/freeRam", {});
    expect(freeRes.status).toBe(200);
    expect(freeRes.data.unloaded).toContain("lfm3:latest");
    const unloadCall = recordedOllamaRequests.find((r) => r.body?.keep_alive === 0);
    expect(unloadCall).toBeDefined();

    // Pulling a model that exceeds the 70% RAM budget (e.g. a 120B model on 48 GB RAM) is politely refused
    const blockedPull = await apiCall("ollama/pull", { model: "mega-model:120b-mlx" });
    expect(blockedPull.status).toBe(200);
    expect(blockedPull.data.ok).toBe(false);
    expect(blockedPull.data.verdict.code).toBe("HARDWARE_RAM_REFUSAL");

    // Version warning check when Ollama is older than v0.40.9 / v0.35.1
    expect(compareSemver("0.34.0", "0.35.1")).toBe(-1);
    expect(compareSemver("0.40.12", "0.40.9")).toBe(1);
    mockVersion = "0.34.0";
    const oldVer = await apiCall("ollama/version", {});
    expect(oldVer.data.supportsDecision).toBe(false);
    expect(oldVer.data.supportsSpeech).toBe(false);
    expect(oldVer.data.warnings.length).toBe(2);
    mockVersion = "0.40.12";

    // Account usage & balance
    const acct = await apiCall("ollama/account", {});
    expect(acct.status).toBe(200);
    expect(acct.data.hasApiKey).toBe(true);
    expect(acct.data.balance.remainingCredits).toBe(42.5);
  });

  test("9. Security Guard: blocks path traversal outside sandboxRoot, null bytes, and filename traversal in speech export", async () => {
    // Relative path traversal outside sandboxRoot must be blocked
    const travChat = await apiCall("ollama/chat", {
      prompt: "Read outside file",
      paths: ["../../../etc/passwd"],
    });
    expect(travChat.status).toBe(400);
    expect(travChat.data.error.code).toBe("PROTECTED_PATH");

    // Absolute path outside sandboxRoot must be blocked
    const absOutChat = await apiCall("ollama/chat", {
      prompt: "Read outside absolute file",
      paths: ["/etc/hosts"],
    });
    expect(absOutChat.status).toBe(400);
    expect(absOutChat.data.error.code).toBe("PROTECTED_PATH");

    // Null byte in path must be blocked
    const nullByteChat = await apiCall("ollama/chat", {
      prompt: "Read null byte file",
      paths: ["docs/crash.log\0.txt"],
    });
    expect(nullByteChat.status).toBe(400);
    expect(nullByteChat.data.error.code).toBe("BAD_PATH");

    // Filename traversal in speech export is stripped to basename inside saveDir
    const speechTraversal = await apiCall("ollama/speech", {
      input: "Safe path check",
      voice: "Zoey",
      mode: "file",
      responseFormat: "wav",
      saveDir: "docs",
      saveFilename: "../../escaped_audio.wav",
    });
    expect(speechTraversal.status).toBe(200);
    expect(speechTraversal.data.savedRelativePath).toBe("docs/escaped_audio.wav");
    expect(await Bun.file(`${tempRoot}/escaped_audio.wav`).exists()).toBe(false);
    expect(await Bun.file(`${tempRoot}/home/docs/escaped_audio.wav`).exists()).toBe(true);
  });

  test("10. Cross-Platform Linux & Windows Auto-Install, Live Progress Status Symbol, and Non-Phonon Text-to-Audio LLMs", async () => {
    // 1. Verify Linux (linux/x64) and Windows (win32/x64) speech capabilities recognize that Phonon is Apple MLX only
    const linuxCtx: any = {
      home: `${tempRoot}/home`,
      sandboxRoot: `${tempRoot}/home`,
      dataDir: `${tempRoot}/data`,
      trashRoot: `${tempRoot}/trash`,
      roots: [`${tempRoot}/home`],
      protectedPaths: [],
      platform: process.platform,
      ollama: {
        baseUrl: mockOllamaUrl,
        platform: "linux",
        arch: "x64",
        totalRamBytes: 16 * 1024 ** 3,
        ollamaBinPath: null,
        playAudioCommand: [],
      },
    };

    const winCtx: any = {
      home: `${tempRoot}/home`,
      sandboxRoot: `${tempRoot}/home`,
      dataDir: `${tempRoot}/data`,
      trashRoot: `${tempRoot}/trash`,
      roots: [`${tempRoot}/home`],
      protectedPaths: [],
      platform: process.platform,
      ollama: {
        baseUrl: "http://127.0.0.1:1", // unreachable to test pure-Bun 24kHz WAV fallback on Windows
        platform: "win32",
        arch: "x64",
        totalRamBytes: 6 * 1024 ** 3, // Under 8 GB RAM tier on Windows -> defaults to ultra-light kokoro:latest
        ollamaBinPath: null,
        playAudioCommand: [],
      },
    };

    const linuxSpeechCaps = getSpeechCapabilitiesForHost(linuxCtx);
    expect(linuxSpeechCaps.phononSupported).toBe(false);
    expect(linuxSpeechCaps.defaultSpeechModel).toBe("lfm3-omni:latest");
    expect(linuxSpeechCaps.availableSpeechModels.map((m) => m.name)).toContain("lfm3-omni:latest");
    expect(linuxSpeechCaps.availableSpeechModels.map((m) => m.name)).toContain("orpheus:latest");
    expect(linuxSpeechCaps.availableSpeechModels.map((m) => m.name)).toContain("kokoro:latest");
    expect(linuxSpeechCaps.availableSpeechModels.map((m) => m.name)).not.toContain("phonon");

    const winSpeechCaps = getSpeechCapabilitiesForHost(winCtx);
    expect(winSpeechCaps.phononSupported).toBe(false);
    expect(winSpeechCaps.defaultSpeechModel).toBe("kokoro:latest");
    expect(winSpeechCaps.availableSpeechModels.map((m) => m.name)).toContain("lfm3-omni:latest");

    // 2. Linux 1-Click Auto-Install defaults to qwen3.5:latest + lfm3-omni:latest + nimble and replaces "phonon"
    const recordedSteps: Array<{ step: string; pct: number }> = [];
    linuxCtx.ollama.installBinaryHook = async (_plat: string, _arch: string, onProgress: (s: string, p: number) => void) => {
      onProgress("Downloading ollama-linux-amd64.tar.zst (48.0 MB / 120.0 MB)...", 28);
      onProgress("Decompressing with Bun.zstdDecompressSync into ~/.local/bin/ollama...", 46);
      return { installedPath: `${tempRoot}/home/.local/bin/ollama` };
    };

    const linuxDefaultInstallRes = await runOllamaAutoInstall(linuxCtx);
    expect(linuxDefaultInstallRes.ok).toBe(true);
    expect(linuxDefaultInstallRes.pulledModels).toContain("qwen3.5:4b");
    expect(linuxDefaultInstallRes.pulledModels).toContain("lfm3-omni:latest");
    expect(linuxDefaultInstallRes.installStatus.recommendedStarterModels).toContain("qwen3.5:4b");
    expect(linuxDefaultInstallRes.installStatus.recommendedStarterModels).toContain("lfm3-omni:latest");

    const linuxInstallRes = await runOllamaAutoInstall(linuxCtx, {
      models: ["qwen3.5:4b", "phonon"], // "phonon" must be automatically replaced on Linux with lfm3-omni:latest!
    });
    expect(linuxInstallRes.ok).toBe(true);
    expect(linuxInstallRes.platform).toBe("linux");
    expect(linuxInstallRes.skippedPhononForNonMlxOs).toBe(true);
    expect(linuxInstallRes.pulledModels).toContain("qwen3.5:4b");
    expect(linuxInstallRes.pulledModels).toContain("lfm3-omni:latest");
    expect(linuxInstallRes.pulledModels).not.toContain("phonon");
    expect(linuxInstallRes.installSteps.length).toBeGreaterThanOrEqual(3);
    expect(linuxInstallRes.installStatus.longTask.percent).toBe(100);
    for (const s of linuxInstallRes.installSteps) {
      recordedSteps.push({ step: s.step, pct: s.percent });
    }
    expect(recordedSteps.length).toBeGreaterThan(0);

    // 3. Windows Speech synthesis without Phonon / without /v1/audio/speech still produces a valid 24kHz mono WAV file
    const winSpeechOut = await runOllamaSpeech(winCtx, {
      model: "phonon", // even if caller asks for phonon on Windows, it auto-routes to kokoro:latest!
      input: "Windows speech synthesis on 10/28 without Apple MLX Phonon.",
      voice: "Zoey",
      mode: "file",
      responseFormat: "wav",
      saveDir: "docs",
      saveFilename: "windows_tts_test.wav",
      playOnServer: false,
    });
    expect(winSpeechOut.phononSupportedOnHost).toBe(false);
    expect(winSpeechOut.usedCrossPlatformTtsModel).toBe(true);
    expect(winSpeechOut.model).toBe("kokoro:latest");
    expect(winSpeechOut.cleanedText).toContain("October 28");
    expect(winSpeechOut.savedRelativePath).toBe("docs/windows_tts_test.wav");
    const wavBytes = await Bun.file(`${tempRoot}/home/docs/windows_tts_test.wav`).bytes();
    expect(wavBytes.byteLength).toBeGreaterThan(44);
    expect(String.fromCharCode(wavBytes[0]!, wavBytes[1]!, wavBytes[2]!, wavBytes[3]!)).toBe("RIFF");

    // 4. Verify Windows 11 ARM64 in Parallels Desktop detection (when running x64 Bun under ARM64 emulation with PROCESSOR_ARCHITEW6432=ARM64)
    const prevWow = process.env.PROCESSOR_ARCHITEW6432;
    process.env.PROCESSOR_ARCHITEW6432 = "ARM64";
    try {
      expect(detectNativeHostArch("win32")).toBe("arm64");
      const winArmHw = inspectOllamaHardware({
        platform: "win32",
        home: `${tempRoot}/home`,
        ollama: {
          platform: "win32",
          totalRamBytes: 16 * 1024 ** 3,
        },
      } as any);
      expect(winArmHw.platform).toBe("win32");
      expect(winArmHw.arch).toBe("arm64");
      expect(winArmHw.isAppleSiliconMac).toBe(false);
    } finally {
      if (prevWow === undefined) delete process.env.PROCESSOR_ARCHITEW6432;
      else process.env.PROCESSOR_ARCHITEW6432 = prevWow;
    }

    // Verify speech model registry fallback mapping for real registry.ollama.ai manifests
    expect(resolveSpeechModelRegistryFallback("orpheus:latest")).toBe("legraphista/Orpheus:latest");
    expect(resolveSpeechModelRegistryFallback("kokoro:latest")).toBe("lfm3-omni:latest");
    expect(resolveSpeechModelRegistryFallback("oute-tts:latest")).toBe("mannix/outetts:0.3");

    // 5. Verify UI modules expose Ollama AI on Windows, Linux, and macOS and include live progress spinner + Copy/Clear output console
    const toolbarSrc = await Bun.file("resources/file_manager/ui/toolbar.js").text();
    const sidebarSrc = await Bun.file("resources/file_manager/ui/sidebar.js").text();
    const ollamaJsSrc = await Bun.file("resources/file_manager/ui/ollama.js").text();
    const cssSrc = await Bun.file("resources/file_manager/ui/ollama.css").text();
    expect(toolbarSrc).toContain('id: "ollama"');
    expect(sidebarSrc).toContain('placeId: "ollama"');
    expect(ollamaJsSrc).toContain("copyOllamaOutput");
    expect(ollamaJsSrc).toContain("clearOllamaOutput");
    expect(ollamaJsSrc).toContain("renderStudioOutputConsole");
    expect(ollamaJsSrc).toContain('selectedModel: "qwen3.5:latest"');
    expect(ollamaJsSrc).toContain("lfm3-omni:latest");
    expect(ollamaJsSrc).toContain("qwen3.5:4b");
    expect(ollamaJsSrc).toContain("qwen3.5:latest");
    expect(cssSrc).toContain(".ollama-spinner");
    expect(cssSrc).toContain(".ollama-live-progress-banner");
    expect(cssSrc).toContain(".ollama-output-console");
    expect(cssSrc).toContain("field-sizing: content");
  });
});
