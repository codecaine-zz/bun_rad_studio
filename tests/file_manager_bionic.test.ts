import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { encodeFloat32SamplesToWav, parseSkillFrontmatter } from "../src/features/filemanager/fmBionic";

describe("Codecaine File Manager — Built-In LM Studio Bionic AI Studio & Agent Hub", () => {
  let mockBionicServer: ReturnType<typeof Bun.serve>;
  let mockBionicUrl = "";
  let fmServer: ReturnType<typeof startFileManagerServer>;
  let fmUrl = "";
  let fmToken = "";
  let tempRoot = "";
  let prevBionicHost: string | undefined;

  const recordedBionicRequests: Array<{ path: string; method: string; body: any }> = [];

  beforeAll(async () => {
    prevBionicHost = process.env.BIONIC_HOST;
    tempRoot = `/tmp/fm_bionic_test_${Date.now()}`;
    Bun.spawnSync(["mkdir", "-p", `${tempRoot}/home/docs`, `${tempRoot}/data`]);

    await Bun.write(
      `${tempRoot}/home/docs/bionic_auth.ts`,
      `export function verifyBionicSessionToken(token: string) {\n  // Bionic authentication session verifier\n  return token.startsWith("bionic_");\n}\n`,
    );
    await Bun.write(
      `${tempRoot}/home/docs/meeting_notes.txt`,
      `Welcome to LM Studio Bionic inside Codecaine File Manager on 10/31/2026.`,
    );

    mockBionicServer = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        const url = new URL(req.url);
        let body: any = null;
        if (req.method === "POST") {
          try {
            body = await req.json();
          } catch {}
        }
        recordedBionicRequests.push({ path: url.pathname, method: req.method, body });

        if (url.pathname === "/v1/models") {
          return Response.json({
            object: "list",
            data: [
              { id: "openai/gpt-oss-20b", object: "model", owned_by: "organization_owner" },
              { id: "qwen/qwen3.5-9b", object: "model", owned_by: "organization_owner" },
              { id: "text-embedding-nomic-embed-text-v1.5", object: "model", owned_by: "organization_owner" },
              { id: "phonon-40m-multilingual", object: "model", owned_by: "organization_owner" },
            ],
          });
        }

        if (url.pathname === "/api/v0/models") {
          return Response.json({
            object: "list",
            data: [
              {
                id: "openai/gpt-oss-20b",
                object: "model",
                type: "llm",
                publisher: "openai",
                arch: "gpt_oss",
                compatibility_type: "mlx",
                quantization: "MXFP4",
                state: "loaded",
                max_context_length: 131072,
                loaded_context_length: 131072,
                capabilities: ["tool_use"],
              },
              {
                id: "qwen/qwen3.5-9b",
                object: "model",
                type: "vlm",
                publisher: "qwen",
                arch: "qwen3_5",
                compatibility_type: "mlx",
                quantization: "4bit",
                state: "not-loaded",
                max_context_length: 262144,
                capabilities: ["tool_use"],
              },
              {
                id: "text-embedding-nomic-embed-text-v1.5",
                object: "model",
                type: "embeddings",
                publisher: "nomic-ai",
                arch: "nomic-bert",
                compatibility_type: "gguf",
                quantization: "Q4_K_M",
                state: "not-loaded",
                max_context_length: 2048,
              },
            ],
          });
        }

        if (url.pathname === "/api/v0/chat/completions" || url.pathname === "/v1/chat/completions") {
          if (body?.stream) {
            const sse = [
              `data: ${JSON.stringify({ choices: [{ delta: { reasoning: "Analyzing file context... " } }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ delta: { content: "Bionic stream complete!" } }] })}\n\n`,
              `data: [DONE]\n\n`,
            ].join("");
            return new Response(sse, {
              headers: { "Content-Type": "text/event-stream; charset=utf-8" },
            });
          }

          const isJsonSchema = body?.response_format?.type === "json_schema";
          const content = isJsonSchema
            ? JSON.stringify({
                summary: "Clean snake_case rename plan",
                renames: [{ originalName: "meeting_notes.txt", newName: "2026-10-31_meeting_notes.txt", reason: "ISO date prefix" }],
              })
            : `Bionic MLX response for model ${body?.model || "openai/gpt-oss-20b"}`;

          return Response.json({
            id: "chatcmpl-bionic-test",
            object: "chat.completion",
            model: body?.model || "openai/gpt-oss-20b",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content,
                  reasoning: "Step 1: Inspected workspace files and injected Bionic skills.",
                  tool_calls: [],
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 64,
              completion_tokens: 28,
              total_tokens: 92,
              completion_tokens_details: { reasoning_tokens: 12 },
            },
            stats: {
              tokens_per_second: 78.4,
              time_to_first_token: 0.142,
              generation_time: 0.35,
            },
            model_info: {
              arch: "gpt_oss",
              quant: "MXFP4",
              format: "mlx",
              context_length: 131072,
            },
            runtime: {
              name: "mlx-llm-mac-arm64-apple-metal-advsimd",
              version: "1.13.1",
            },
          });
        }

        if (url.pathname === "/v1/embeddings") {
          const inputs: string[] = Array.isArray(body?.input) ? body.input : [String(body?.input || "")];
          const data = inputs.map((text, index) => {
            const lower = text.toLowerCase();
            const isAuth = lower.includes("auth") || lower.includes("token") || lower.includes("session");
            return {
              object: "embedding",
              index,
              embedding: isAuth ? [0.95, 0.15, 0.05, 0.02] : [0.05, 0.92, 0.12, 0.08],
            };
          });
          return Response.json({
            object: "list",
            model: "text-embedding-nomic-embed-text-v1.5",
            data,
          });
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    mockBionicUrl = `http://127.0.0.1:${mockBionicServer.port}`;
    process.env.BIONIC_HOST = mockBionicUrl;

    fmServer = startFileManagerServer({
      port: 0,
      host: "127.0.0.1",
      token: "test-bionic-secret-token",
      context: {
        home: `${tempRoot}/home`,
        dataDir: `${tempRoot}/data`,
        platform: "darwin",
      },
    });
    fmUrl = `http://127.0.0.1:${fmServer.port}`;
    fmToken = fmServer.token;
  });

  afterAll(() => {
    if (prevBionicHost === undefined) delete process.env.BIONIC_HOST;
    else process.env.BIONIC_HOST = prevBionicHost;
    try {
      fmServer?.stop(true);
    } catch {}
    try {
      mockBionicServer?.stop(true);
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
    const json = (await res.json()) as any;
    return { status: res.status, json };
  }

  test("1. encodeFloat32SamplesToWav and parseSkillFrontmatter pure unit helpers work", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const wav = encodeFloat32SamplesToWav(samples, 24000);
    expect(wav.byteLength).toBe(44 + samples.length * 2);
    expect(String.fromCharCode(wav[0]!, wav[1]!, wav[2]!, wav[3]!)).toBe("RIFF");
    expect(String.fromCharCode(wav[8]!, wav[9]!, wav[10]!, wav[11]!)).toBe("WAVE");

    const parsed = parseSkillFrontmatter(
      "---\nname: file-history\ndisplay-name: File History\ndescription: Track changes\nuser-invocable: false\n---\n# Body",
      "fallback",
    );
    expect(parsed.name).toBe("file-history");
    expect(parsed.displayName).toBe("File History");
    expect(parsed.description).toBe("Track changes");
    expect(parsed.userInvocable).toBe(false);
  });

  test("2. bionic/status returns server, hardware guard, models, backends, skills, projects, and TTS voices", async () => {
    const { status, json } = await apiCall("bionic/status", { dirPath: "docs" });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.server.running).toBe(true);
    expect(json.hardware.safeMemoryBudgetGb).toBeGreaterThan(0);
    expect(Array.isArray(json.models)).toBe(true);
    expect(json.models.some((m: any) => m.id === "openai/gpt-oss-20b")).toBe(true);
    expect(Array.isArray(json.tts.voices)).toBe(true);
    expect(json.tts.voices.some((v: any) => v.name === "Zoey")).toBe(true);
  });

  test("3. bionic/chat executes deep reasoning chat, file inspection, and returns telemetry stats", async () => {
    const { status, json } = await apiCall("bionic/chat", {
      model: "openai/gpt-oss-20b",
      prompt: "Explain the authentication helper in this file.",
      paths: ["docs/bionic_auth.ts"],
      dirPath: "docs",
    });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.model).toBe("openai/gpt-oss-20b");
    expect(json.content).toContain("Bionic MLX response");
    expect(json.reasoningText).toContain("Step 1:");
    expect(json.stats.tokensPerSecond).toBeGreaterThan(50);
    expect(json.inspectedFiles).toContain("docs/bionic_auth.ts");
  });

  test("4. bionic/skills & bionic/skill/create creates a project-local SKILL.md and injects @skill into chat", async () => {
    const createRes = await apiCall("bionic/skill/create", {
      name: "security-reviewer",
      displayName: "Security Reviewer",
      description: "Audit TypeScript files for token handling",
      instructions: "Always verify token prefix checks.",
      scope: "project-local",
      dirPath: "docs",
    });
    expect(createRes.status).toBe(200);
    expect(createRes.json.ok).toBe(true);
    expect(createRes.json.skill.triggerToken).toBe("@security-reviewer");

    const readRes = await apiCall("bionic/skill/read", {
      nameOrPath: "security-reviewer",
      dirPath: "docs",
    });
    expect(readRes.status).toBe(200);
    expect(readRes.json.content).toContain("Always verify token prefix checks.");

    const routedRes = await apiCall("bionic/route", {
      prompt: "@security-reviewer Review docs/bionic_auth.ts",
      paths: ["docs/bionic_auth.ts"],
      dirPath: "docs",
    });
    expect(routedRes.status).toBe(200);
    expect(routedRes.json.routedCapability).toBe("skill_execution");
    expect(routedRes.json.result.injectedSkills).toContain("security-reviewer");
  });

  test("5. bionic/semanticSearch ranks files by cosine similarity using /v1/embeddings", async () => {
    const { status, json } = await apiCall("bionic/semanticSearch", {
      query: "Where is the Bionic authentication session token verified?",
      dirPath: "docs",
    });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.matches.length).toBeGreaterThan(0);
    expect(json.matches[0].name).toBe("bionic_auth.ts");
    expect(json.matches[0].similarity).toBeGreaterThan(0.8);
  });

  test("6. bionic/route handles structured JSON batch rename plans & POST /api/bionic/stream SSE", async () => {
    const routeRes = await apiCall("bionic/route", {
      prompt: "Create a batch-rename JSON plan for the selected files.",
      paths: ["docs/meeting_notes.txt"],
      dirPath: "docs",
    });
    expect(routeRes.status).toBe(200);
    expect(routeRes.json.routedCapability).toBe("structured_json");
    expect(routeRes.json.result.structuredJson.renames[0].newName).toBe("2026-10-31_meeting_notes.txt");

    const streamRes = await fetch(`${fmUrl}/api/bionic/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fm-token": fmToken,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        prompt: "Stream test",
      }),
    });
    expect(streamRes.status).toBe(200);
    const streamText = await streamRes.text();
    expect(streamText).toContain("Bionic stream complete!");
  });

  test("7. bionic/transcribe formats transcripts & UI files include Bionic studio wiring", async () => {
    const trRes = await apiCall("bionic/transcribe", {
      path: "docs/meeting_notes.txt",
      format: "markdown",
      saveToFolder: true,
      summarize: true,
    });
    expect(trRes.status).toBe(200);
    expect(trRes.json.ok).toBe(true);
    expect(trRes.json.transcript).toContain("Bionic ASR Transcript");
    expect(trRes.json.savedRelativePath).toContain("meeting_notes-bionic-transcript.md");

    const indexHtml = await (await fetch(`${fmUrl}/`)).text();
    expect(indexHtml).toContain('id="viewbar-bionic"');
    expect(indexHtml).toContain('/ui/bionic.css');

    const bionicJs = await (await fetch(`${fmUrl}/ui/bionic.js`)).text();
    expect(bionicJs).toContain('registerPowerTab');
    expect(bionicJs).toContain('LM Studio Bionic');
  });
});
