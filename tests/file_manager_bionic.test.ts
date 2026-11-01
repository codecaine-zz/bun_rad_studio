import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
      platform: "darwin",
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

    // 4. When pandoc (and LibreOffice) are installed on the host, verify .epub directory bundle converts to DOCX & PDF
    const hostCtx = createContext({
      platform: "darwin",
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
    const pdfAct = hostOv.actions.find((a) => a.id === "doc-pdf");
    if (pdfAct?.available) {
      const pdfJob = await startConvert(hostCtx, { action: "doc-pdf", paths: [epubBundleDir] });
      const pdfDone = await hostCtx.jobs.whenDone(pdfJob.id);
      expect(pdfDone.state).toBe("done");
      expect(existsSync(join(homeRoot, "docs", "Deadlocked 3.pdf"))).toBe(true);
    }
  });

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
      platform: "darwin",
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
});
