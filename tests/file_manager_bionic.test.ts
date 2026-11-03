import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { encodeFloat32SamplesToWav, parseSkillFrontmatter } from "../src/features/filemanager/fmBionic";
import { ensureDirectoryPure } from "../src/features/filemanager/fmOllama";

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
    ensureDirectoryPure(`${tempRoot}/home/docs`);
    ensureDirectoryPure(`${tempRoot}/data`);

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
          const userMsgText = JSON.stringify(body?.messages || []);
          if (body?.model === "reflection/Beam-1.0" && userMsgText.includes("SIMULATE_NO_MODELS_LOADED")) {
            return Response.json(
              {
                error: {
                  message: "No models loaded. Please load a model in the developer page or use the 'lms load' command.",
                  type: "invalid_request_error",
                  param: "model",
                  code: null,
                },
              },
              { status: 400 },
            );
          }
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
        sandboxRoot: `${tempRoot}/home`,
        dataDir: `${tempRoot}/data`,
        ollama: {
          platform: "darwin",
          arch: "arm64",
          totalRamBytes: 48 * 1024 ** 3,
          cpuModel: "Apple M4 Pro",
          cpuCores: 14,
        },
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
      rmSync(tempRoot, { recursive: true, force: true });
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

    const codeAiChatJs = await (await fetch(`${fmUrl}/ui/codeAiChat.js`)).text();
    expect(codeAiChatJs).toContain('/api/bionic/stream');
    expect(codeAiChatJs).toContain('/api/ollama/stream');
    expect(codeAiChatJs).toContain('Insert at Cursor');
    expect(codeAiChatJs).toContain('Replace Selection');
  });

  test("8. unpacked macOS .epub directory bundles work in Bionic LLM context and convert to HTML, Markdown, TXT, RTF, FB2, DOCX, ODT, and PDF", async () => {
    const { mkdirSync, writeFileSync, existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { readTextFileSnippet } = await import("../src/features/filemanager/fmOllama");
    const { overview, startConvert } = await import("../src/features/filemanager/fmBatch");
    const { createContext } = await import("../src/features/filemanager/fmCore");

    const homeRoot = `${tempRoot}/home`;
    const epubBundleDir = join(homeRoot, "docs", "Deadlocked 3.epub");
    mkdirSync(join(epubBundleDir, "META-INF"), { recursive: true });
    mkdirSync(join(epubBundleDir, "OPS", "xhtml"), { recursive: true });
    writeFileSync(join(epubBundleDir, "mimetype"), "application/epub+zip");
    writeFileSync(
      join(epubBundleDir, "META-INF", "container.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    );
    writeFileSync(
      join(epubBundleDir, "OPS", "package.opf"),
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Deadlocked 3</dc:title>
    <dc:creator>A. R. Breck</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="xhtml/chapter-001.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`,
    );
    writeFileSync(
      join(epubBundleDir, "OPS", "xhtml", "chapter-001.xhtml"),
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter One</title></head>
<body>
  <h1>Chapter 1: Into the Storm</h1>
  <p>The waves crashed against the cliff as the lighthouse beam swept across the bay.</p>
</body>
</html>`,
    );

    // 1. Verify readTextFileSnippet extracts book text without FILE_NOT_FOUND
    const snippet = await readTextFileSnippet(epubBundleDir, 12000);
    expect(snippet).toContain("Title: Deadlocked 3");
    expect(snippet).toContain("Author: A. R. Breck");
    expect(snippet).toContain("The waves crashed against the cliff");

    const realBookPath = "/Users/codecaine/Downloads/books/Deadlocked 3.epub";
    if (existsSync(realBookPath)) {
      const realSnippet = await readTextFileSnippet(realBookPath, 12000);
      expect(realSnippet).toContain("Deadlocked 3");
      expect(realSnippet.length).toBeGreaterThan(200);
    }

    // 2. Verify Bionic chat and router accept the unpacked .epub bundle path without FILE_NOT_FOUND
    const chatRes = await apiCall("bionic/chat", {
      model: "openai/gpt-oss-20b",
      prompt: "Summarize this book.",
      paths: ["docs/Deadlocked 3.epub"],
      dirPath: "docs",
    });
    expect(chatRes.status).toBe(200);
    expect(chatRes.json.ok).toBe(true);
    expect(chatRes.json.inspectedFiles).toContain("docs/Deadlocked 3.epub");

    // 3. Verify Convert & Process classifies .epub directory bundle as an e-book file and converts it
    const convCtx = createContext({
      home: homeRoot,
      dataDir: join(homeRoot, ".conv-data"),
      toolDirs: [join(homeRoot, "no-tools")],
    });
    const ov = await overview(convCtx, [epubBundleDir]);
    expect(ov.selected).toBe(1);
    expect(ov.folders).toBe(0);
    const actionIds = ov.actions.map((a) => a.id);
    expect(actionIds).toContain("doc-html");
    expect(actionIds).toContain("doc-md");
    expect(actionIds).toContain("doc-txt");
    expect(actionIds).toContain("doc-rtf");
    expect(actionIds).toContain("doc-fb2");
    expect(actionIds).toContain("doc-docx");
    expect(actionIds).toContain("doc-odt");
    expect(actionIds).toContain("doc-pdf");

    for (const [actId, ext, marker] of [
      ["doc-html", "html", "<!DOCTYPE html>"],
      ["doc-md", "md", "# Deadlocked 3"],
      ["doc-txt", "txt", "Deadlocked 3"],
      ["doc-rtf", "rtf", "{\\rtf1"],
      ["doc-fb2", "fb2", "<FictionBook"],
    ] as const) {
      const job = await startConvert(convCtx, { action: actId, paths: [epubBundleDir] });
      const done = await convCtx.jobs.whenDone(job.id);
      expect(done.state, actId).toBe("done");
      const outPath = join(homeRoot, "docs", `Deadlocked 3.${ext}`);
      expect(existsSync(outPath), outPath).toBe(true);
      expect(readFileSync(outPath, "utf8")).toContain(marker);
    }

    // 4. When pandoc is installed on the host, verify .epub directory bundle is auto-packed and converts to DOCX
    const hostCtx = createContext({
      home: homeRoot,
      dataDir: join(homeRoot, ".conv-host-data"),
    });
    const hostOv = await overview(hostCtx, [epubBundleDir]);
    const docxAct = hostOv.actions.find((a) => a.id === "doc-docx");
    if (docxAct?.available) {
      const docxJob = await startConvert(hostCtx, { action: "doc-docx", paths: [epubBundleDir] });
      const docxDone = await hostCtx.jobs.whenDone(docxJob.id);
      expect(docxDone.state).toBe("done");
      expect(existsSync(join(homeRoot, "docs", "Deadlocked 3.docx"))).toBe(true);
    }
  }, 15000);

  test("9. macOS document package directories (.textbundle, .scriv, .rtfd, .ulysses, .playground) work across AI context and Convert & Process", async () => {
    const { mkdirSync, writeFileSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { readTextFileSnippet } = await import("../src/features/filemanager/fmOllama");
    const { startConvert } = await import("../src/features/filemanager/fmBatch");
    const { createContext } = await import("../src/features/filemanager/fmCore");

    const homeRoot = `${tempRoot}/home`;
    const docsDir = join(homeRoot, "docs");

    // 1. .textbundle directory
    const tbDir = join(docsDir, "Architecture.textbundle");
    mkdirSync(join(tbDir, "assets"), { recursive: true });
    writeFileSync(join(tbDir, "info.json"), JSON.stringify({ version: 2, type: "net.daringfireball.markdown" }));
    writeFileSync(
      join(tbDir, "text.md"),
      "# System Architecture\n\n## Core Pipeline\n\nTextBundle combines Markdown with embedded assets in a single package.",
    );

    const tbSnippet = await readTextFileSnippet(tbDir, 8000);
    expect(tbSnippet).toContain("System Architecture");
    expect(tbSnippet).toContain("TextBundle combines Markdown");

    // 2. .scriv Scrivener project bundle
    const scrivDir = join(docsDir, "NovelProject.scriv");
    const uuid1 = "A1B2C3D4-1111-2222-3333-444455556666";
    mkdirSync(join(scrivDir, "Files", "Data", uuid1), { recursive: true });
    writeFileSync(
      join(scrivDir, "NovelProject.scrivx"),
      `<?xml version="1.0" encoding="UTF-8"?><ScrivenerProject><Binder><BinderItem UUID="${uuid1}" Type="Text"><Title>Prologue</Title></BinderItem></Binder></ScrivenerProject>`,
    );
    writeFileSync(
      join(scrivDir, "Files", "Data", uuid1, "content.rtf"),
      "{\\rtf1\\ansi\\deff0 {\\b The Dawn of Scrivener}\\par A multi-chapter binder stored as a directory package.}",
    );

    const scrivSnippet = await readTextFileSnippet(scrivDir, 8000);
    expect(scrivSnippet).toContain("Prologue");
    expect(scrivSnippet).toContain("The Dawn of Scrivener");

    // 3. .rtfd Rich Text Directory bundle
    const rtfdDir = join(docsDir, "MeetingNotes.rtfd");
    mkdirSync(rtfdDir, { recursive: true });
    writeFileSync(
      join(rtfdDir, "TXT.rtf"),
      "{\\rtf1\\ansi\\deff0 {\\b Quarterly Review Notes}\\par Action items for the engineering team.}",
    );

    const rtfdSnippet = await readTextFileSnippet(rtfdDir, 8000);
    expect(rtfdSnippet).toContain("Quarterly Review Notes");

    // 4. .playground Swift Playground bundle
    const pgDir = join(docsDir, "Algorithms.playground");
    mkdirSync(pgDir, { recursive: true });
    writeFileSync(join(pgDir, "Contents.swift"), "import Foundation\nfunc fibonacci(_ n: Int) -> Int { n <= 1 ? n : fibonacci(n - 1) + fibonacci(n - 2) }\n");

    const pgSnippet = await readTextFileSnippet(pgDir, 8000);
    expect(pgSnippet).toContain("fibonacci");

    // 5. Built-in conversion of .textbundle and .scriv to HTML & TXT
    const convCtx = createContext({
      home: homeRoot,
      dataDir: join(homeRoot, ".conv-pkg-data"),
      toolDirs: [join(homeRoot, "no-tools")],
    });
    const htmlJob = await startConvert(convCtx, { action: "doc-html", paths: [tbDir, scrivDir, rtfdDir] });
    const htmlDone = await convCtx.jobs.whenDone(htmlJob.id);
    expect(htmlDone.state).toBe("done");
    expect(readFileSync(join(docsDir, "Architecture.html"), "utf8")).toContain("TextBundle combines Markdown");
    expect(readFileSync(join(docsDir, "NovelProject.html"), "utf8")).toContain("The Dawn of Scrivener");
    expect(readFileSync(join(docsDir, "MeetingNotes.html"), "utf8")).toContain("Quarterly Review Notes");
  });

  test("10. Multi-File Bionic Synthesis, Persistent Embedding Cache, Smart Folder Tidy, Clipboard Image Dropzone, and Chaptered Audiobook Export", async () => {
    const { mkdirSync, writeFileSync, existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    const homeRoot = `${tempRoot}/home`;

    // 1. Multi-file Bionic Synthesis across .epub, .textbundle, and .scriv packages
    const synthRes = await apiCall("bionic/synthesize", {
      paths: ["docs/Deadlocked 3.epub", "docs/Architecture.textbundle", "docs/NovelProject.scriv"],
      mode: "compare",
      saveToFile: true,
      dirPath: "docs",
    });
    expect(synthRes.status).toBe(200);
    expect(synthRes.json.ok).toBe(true);
    expect(synthRes.json.fileCount).toBe(3);
    expect(synthRes.json.reportMarkdown).toContain("Deadlocked 3.epub");
    expect(synthRes.json.reportMarkdown).toContain("Architecture.textbundle");
    expect(synthRes.json.reportMarkdown).toContain("NovelProject.scriv");
    expect(synthRes.json.savedRelativePath).toMatch(/^docs\/Bionic-Synthesis-.*\.md$/);
    expect(existsSync(join(homeRoot, synthRes.json.savedRelativePath))).toBe(true);

    // 2. Persistent Embedding Cache on second semanticSearch call
    const sem1 = await apiCall("bionic/semanticSearch", {
      query: "authentication token verification",
      dirPath: ".",
      topK: 3,
    });
    expect(sem1.status).toBe(200);
    expect(sem1.json.scannedFilesCount).toBeGreaterThan(0);

    const sem2 = await apiCall("bionic/semanticSearch", {
      query: "lighthouse storm waves",
      dirPath: ".",
      topK: 3,
    });
    expect(sem2.status).toBe(200);
    expect(sem2.json.cachedFilesCount).toBeGreaterThan(0);
    expect(sem2.json.computedFilesCount).toBe(0);

    // 3. Clipboard Image Dropzone (`clip/pasteImageAsFile`)
    const tinyPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const clipImgRes = await apiCall("clip/pasteImageAsFile", {
      dirPath: "docs",
      base64Png: tinyPngBase64,
      fileName: "Screenshot-Test.png",
    });
    expect(clipImgRes.status).toBe(200);
    expect(clipImgRes.json.saved).toBe(true);
    expect(clipImgRes.json.name).toBe("Screenshot-Test.png");
    expect(existsSync(clipImgRes.json.path)).toBe(true);

    // 4. Smart Folder Tidy (`folder/tidy` preview and execution)
    const messyDir = join(homeRoot, "messy-downloads");
    mkdirSync(messyDir, { recursive: true });
    writeFileSync(join(messyDir, "report.pdf"), "%PDF-1.4 sample");
    writeFileSync(join(messyDir, "photo.png"), Buffer.from(tinyPngBase64, "base64"));
    writeFileSync(join(messyDir, "song.mp3"), "ID3-sample");
    writeFileSync(join(messyDir, "archive.zip"), "PK\x03\x04");
    writeFileSync(join(messyDir, "script.ts"), "export const x = 42;\n");
    const miniEpub = join(messyDir, "MiniBook.epub");
    mkdirSync(miniEpub, { recursive: true });
    writeFileSync(join(miniEpub, "mimetype"), "application/epub+zip");

    const tidyPrev = await apiCall("folder/tidy", { path: "messy-downloads", preview: true });
    expect(tidyPrev.status).toBe(200);
    expect(tidyPrev.json.preview).toBe(true);
    expect(tidyPrev.json.movedCount).toBe(6);
    expect(tidyPrev.json.byCategory["Books & Documents"]).toBe(2);
    expect(tidyPrev.json.byCategory["Images & Screenshots"]).toBe(1);
    expect(tidyPrev.json.byCategory["Audio & Music"]).toBe(1);
    expect(tidyPrev.json.byCategory["Archives & Installers"]).toBe(1);
    expect(tidyPrev.json.byCategory["Code & Data"]).toBe(1);

    const tidyExec = await apiCall("folder/tidy", { path: "messy-downloads", preview: false });
    expect(tidyExec.status).toBe(200);
    expect(tidyExec.json.preview).toBe(false);
    expect(tidyExec.json.movedCount).toBe(6);
    expect(existsSync(join(messyDir, "Books & Documents", "report.pdf"))).toBe(true);
    expect(existsSync(join(messyDir, "Books & Documents", "MiniBook.epub", "mimetype"))).toBe(true);
    expect(existsSync(join(messyDir, "Images & Screenshots", "photo.png"))).toBe(true);

    // 5. Chaptered Audiobook Plan (`phonon/audiobook` previewOnly)
    const abRes = await apiCall("phonon/audiobook", {
      path: "docs/Deadlocked 3.epub",
      voice: "Zoey",
      format: "wav",
      previewOnly: true,
    });
    expect(abRes.status).toBe(200);
    expect(abRes.json.bookTitle).toBe("Deadlocked 3");
    expect(abRes.json.chapterCount).toBeGreaterThanOrEqual(1);
    expect(abRes.json.chapters[0].fileName).toContain("01 - ");
    expect(readFileSync(join(homeRoot, synthRes.json.savedRelativePath), "utf8")).toContain("Bionic Multi-File Synthesis");
  });

  test("11. LM Studio Bionic Multi-Level Reasoning (gpt-oss low/medium/high), Toggleable Thinking (qwen3.5 on/off), Speculative Decoding & Metal Load Options", async () => {
    // 1. Verify bionic/status exposes thinkingCapabilities for openai/gpt-oss-20b ("levels") and qwen/qwen3.5-9b ("toggle")
    const statusRes = await apiCall("bionic/status", {});
    expect(statusRes.status).toBe(200);
    const gptOssModel = statusRes.json.models.find((m: any) => m.id === "openai/gpt-oss-20b");
    const qwenModel = statusRes.json.models.find((m: any) => m.id === "qwen/qwen3.5-9b");
    expect(gptOssModel.thinkingCapabilities.thinkingMode).toBe("levels");
    expect(gptOssModel.thinkingCapabilities.supportedLevels).toEqual(["low", "medium", "high"]);
    expect(gptOssModel.featureProfile.features.thinkingLevels).toBe(true);
    expect(gptOssModel.featureProfile.features.thinkingToggle).toBe(false);
    expect(gptOssModel.featureProfile.features.vision).toBe(false);
    expect(gptOssModel.featureProfile.indicators.map((i: any) => i.id)).toContain("thinking_levels");
    expect(gptOssModel.featureProfile.indicators.map((i: any) => i.id)).not.toContain("vision");

    expect(qwenModel.thinkingCapabilities.thinkingMode).toBe("toggle");
    expect(qwenModel.thinkingCapabilities.canToggle).toBe(true);
    expect(qwenModel.thinkingCapabilities.supportedLevels).toEqual(["off", "on"]);
    expect(qwenModel.featureProfile.features.thinkingToggle).toBe(true);
    expect(qwenModel.featureProfile.features.thinkingLevels).toBe(false);
    expect(qwenModel.featureProfile.features.vision).toBe(true);
    expect(qwenModel.featureProfile.indicators.map((i: any) => i.id)).toContain("thinking_toggle");
    expect(qwenModel.featureProfile.indicators.map((i: any) => i.id)).toContain("vision");

    // 2. Verify bionic/chat with openai/gpt-oss-20b passes reasoning_effort: "high", chat_template_kwargs, Harmony Reasoning: high, and sampling/speculative decoding options
    const beforeCount = recordedBionicRequests.length;
    const gptChat = await apiCall("bionic/chat", {
      model: "openai/gpt-oss-20b",
      prompt: "Analyze lock-free ring buffer memory ordering",
      thinkingLevel: "high",
      thinkingBudget: 8192,
      temperature: 0.3,
      topP: 0.9,
      topK: 50,
      minP: 0.04,
      repeatPenalty: 1.12,
      maxTokens: 4096,
      seed: 7,
      stop: ["<|endoftext|>"],
      contextLength: 65536,
      draftModel: "qwen/qwen3.5-9b",
    });
    expect(gptChat.status).toBe(200);
    expect(gptChat.json.thinkingMode).toBe("levels");
    expect(gptChat.json.thinkingLevel).toBe("high");
    expect(gptChat.json.thinkingEnabled).toBe(true);
    expect(gptChat.json.appliedOptions.reasoningEffort).toBe("high");
    expect(gptChat.json.appliedOptions.thinkingBudget).toBe(8192);
    expect(gptChat.json.appliedOptions.draftModel).toBe("qwen/qwen3.5-9b");

    const gptReqs = recordedBionicRequests
      .slice(beforeCount)
      .filter((r) => r.path === "/api/v0/chat/completions" || r.path === "/v1/chat/completions");
    expect(gptReqs.length).toBeGreaterThanOrEqual(1);
    const sentBody = gptReqs[gptReqs.length - 1]!.body;
    expect(sentBody.reasoning_effort).toBe("high");
    expect(sentBody.chat_template_kwargs.reasoning_effort).toBe("high");
    expect(sentBody.chat_template_kwargs.enable_thinking).toBe(true);
    expect(sentBody.chat_template_kwargs.thinking_budget).toBe(8192);
    expect(sentBody.messages[0].content).toContain("Reasoning: high");
    expect(sentBody.top_p).toBe(0.9);
    expect(sentBody.top_k).toBe(50);
    expect(sentBody.min_p).toBe(0.04);
    expect(sentBody.repeat_penalty).toBe(1.12);
    expect(sentBody.seed).toBe(7);
    expect(sentBody.context_length).toBe(65536);
    expect(sentBody.draft_model).toBe("qwen/qwen3.5-9b");

    // 3. Verify bionic/chat with qwen/qwen3.5-9b can turn thinking OFF (enable_thinking: false)
    const beforeQwen = recordedBionicRequests.length;
    const qwenOffChat = await apiCall("bionic/chat", {
      model: "qwen/qwen3.5-9b",
      prompt: "Quick one-line summary",
      thinkingLevel: "off",
    });
    expect(qwenOffChat.status).toBe(200);
    expect(qwenOffChat.json.thinkingMode).toBe("toggle");
    expect(qwenOffChat.json.thinkingLevel).toBe("off");
    expect(qwenOffChat.json.thinkingEnabled).toBe(false);
    const qwenReqs = recordedBionicRequests
      .slice(beforeQwen)
      .filter((r) => r.path === "/api/v0/chat/completions" || r.path === "/v1/chat/completions");
    const sentQwen = qwenReqs[qwenReqs.length - 1]!.body;
    expect(sentQwen.enable_thinking).toBe(false);
    expect(sentQwen.chat_template_kwargs.enable_thinking).toBe(false);
    expect(sentQwen.max_tokens).toBe(16384);

    // 4. Verify bionic/load supports gpuOffload, flashAttention, kvCacheQuant, and ttlSeconds
    const loadRes = await apiCall("bionic/load", {
      model: "openai/gpt-oss-20b",
      contextLength: 65536,
      gpuOffload: "max",
      flashAttention: true,
      kvCacheQuant: "q8_0",
      ttlSeconds: 900,
    });
    expect(loadRes.status).toBe(200);
    expect(loadRes.json.ok).toBe(true);
    expect(loadRes.json.appliedLoadConfig.contextLength).toBe(65536);
    expect(loadRes.json.appliedLoadConfig.gpuOffload).toBe("max");
    expect(loadRes.json.appliedLoadConfig.flashAttention).toBe(true);
    expect(loadRes.json.appliedLoadConfig.kvCacheQuant).toBe("q8_0");
    expect(loadRes.json.appliedLoadConfig.ttlSeconds).toBe(900);
  });

  test("12. Standalone Bionic Speech without Ollama & Auto Vision Model Selection on Image Review", async () => {
    const { writeFileSync } = await import("node:fs");
    const jpegPath = `${tempRoot}/home/docs/5162237.jpeg`;
    writeFileSync(jpegPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]));

    // 1. Selecting a file in LM Studio Bionic with speakReply: false and blank prompt routes to reasoning_chat, NOT speech
    const fileRouteRes = await apiCall("bionic/route", {
      prompt: "",
      paths: ["docs/bionic_auth.ts"],
      speakReply: false,
      voice: "Zoey",
    });
    expect(fileRouteRes.status).toBe(200);
    expect(fileRouteRes.json.routedCapability).toBe("reasoning_chat");
    expect(fileRouteRes.json.result.speechResult).toBeFalsy();

    // 2. Selecting a .jpeg image in LM Studio Bionic routes to "vision" and automatically selects vision-capable qwen/qwen3.5-9b even if openai/gpt-oss-20b was requested
    const imgRouteRes = await apiCall("bionic/route", {
      model: "openai/gpt-oss-20b",
      prompt: "",
      paths: ["docs/5162237.jpeg"],
      speakReply: false,
      voice: "Zoey",
    });
    expect(imgRouteRes.status).toBe(200);
    expect(imgRouteRes.json.routedCapability).toBe("vision");
    expect(imgRouteRes.json.result.model).toBe("qwen/qwen3.5-9b");
    expect(imgRouteRes.json.result.speechResult).toBeFalsy();

    // 3. Standalone Bionic Speech works when Phonon native addon cannot load AND Ollama is completely closed/offline
    const prevOllamaHost = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = "http://127.0.0.1:1"; // Simulate Ollama completely closed
    try {
      const standaloneSpeech = await apiCall("bionic/speech", {
        input: "Standalone LM Studio Bionic speech test without Ollama open.",
        voice: "Zoey",
        saveDir: "docs",
        saveFilename: "bionic_standalone.wav",
      });
      expect(standaloneSpeech.status).toBe(200);
      expect(standaloneSpeech.json.ok).toBe(true);
      expect(standaloneSpeech.json.savedRelativePath).toBe("docs/bionic_standalone.wav");
      expect(standaloneSpeech.json.engine).not.toContain("Ollama");

      // 4. Calling bionic/speech on a binary image file is cleanly rejected with UNSUPPORTED_SPEECH_FILE
      const imgSpeechErr = await apiCall("bionic/speech", {
        filePath: "docs/5162237.jpeg",
        voice: "Zoey",
      });
      expect(imgSpeechErr.status).toBe(400);
      expect(imgSpeechErr.json.error.code).toBe("UNSUPPORTED_SPEECH_FILE");
    } finally {
      if (prevOllamaHost === undefined) delete process.env.OLLAMA_HOST;
      else process.env.OLLAMA_HOST = prevOllamaHost;
    }
  });

  test("13. LM Studio Bionic Cloud Models Discovery, Feature Profiles & Cloud Inference Chat", async () => {
    const statusRes = await apiCall("bionic/status", {});
    expect(statusRes.status).toBe(200);
    const cloudModels = statusRes.json.cloudModels;
    expect(Array.isArray(cloudModels)).toBe(true);
    expect(cloudModels.length).toBeGreaterThanOrEqual(9);

    const cloudIds = cloudModels.map((cm: any) => cm.id);
    expect(cloudIds).toContain("deepseek-ai/DeepSeek-V4.1-Flash");
    expect(cloudIds).toContain("deepseek-ai/DeepSeek-V4-Pro");
    expect(cloudIds).toContain("zai-org/GLM-5.3");
    expect(cloudIds).toContain("zai-org/GLM-5.3-Flash");
    expect(cloudIds).toContain("moonshotai/Kimi-K3");
    expect(cloudIds).toContain("meta-models/muse-spark-open");
    expect(cloudIds).toContain("reflection/Beam-1.0");

    const dsFlash = cloudModels.find((cm: any) => cm.id === "deepseek-ai/DeepSeek-V4.1-Flash");
    expect(dsFlash.isCloud).toBe(true);
    expect(dsFlash.format).toBe("cloud");
    expect(dsFlash.vision).toBe(true);
    expect(dsFlash.estimatedRamGb).toBe(0);
    expect(dsFlash.hardwareVerdict.allowed).toBe(true);
    expect(dsFlash.hardwareVerdict.isCloud).toBe(true);
    expect(dsFlash.thinkingCapabilities.thinkingMode).toBe("toggle");
    expect(dsFlash.featureProfile.features.vision).toBe(true);
    expect(dsFlash.featureProfile.features.tools).toBe(true);
    expect(dsFlash.featureProfile.indicators.map((i: any) => i.id)).toContain("cloud");

    const chatRes = await apiCall("bionic/chat", {
      model: "reflection/Beam-1.0",
      prompt: "Explain Bionic Cloud zero local RAM inference.",
      thinkingLevel: "on",
    });
    expect(chatRes.status).toBe(200);
    expect(chatRes.json.model).toBe("reflection/Beam-1.0");
    expect(chatRes.json.thinkingMode).toBe("toggle");
    expect(chatRes.json.thinkingEnabled).toBe(true);

    // Verify automatic JIT fallback when local HTTP server (:1235) returns "No models loaded" for reflection/Beam-1.0
    const fallbackChatRes = await apiCall("bionic/chat", {
      model: "reflection/Beam-1.0",
      prompt: "SIMULATE_NO_MODELS_LOADED: test Beam fallback to local MLX model",
      thinkingLevel: "on",
    });
    expect(fallbackChatRes.status).toBe(200);
    expect(fallbackChatRes.json.model).toBe("openai/gpt-oss-20b");
    expect(fallbackChatRes.json.content).toContain("Bionic MLX response");

    const fallbackStreamRes = await fetch(`${fmUrl}/api/bionic/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-FM-Token": fmToken,
      },
      body: JSON.stringify({
        model: "reflection/Beam-1.0",
        prompt: "SIMULATE_NO_MODELS_LOADED: stream Beam fallback",
      }),
    });
    expect(fallbackStreamRes.status).toBe(200);
    expect(fallbackStreamRes.headers.get("X-Bionic-Model")).toBe("openai/gpt-oss-20b");
  });
});
