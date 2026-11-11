import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isInsideWorkspace,
  startCodeStudioServer,
} from "../applications/code_studio";
import {
  generateCalculatorStudioHtml,
  startCalculatorStudioServer,
} from "../applications/calculator_studio";
import { startMazeStudioServer } from "../applications/maze_generator_studio";
import { startWordSearchStudioServer } from "../applications/word_search_studio";
import {
  generateTaskManagerHtml,
  matchesQuery,
  type ProcessItem,
} from "../applications/task_manager";
import { createTokeiStudio } from "../applications/tokei_studio";
import { startRatScrewServer } from "../applications/rat_screw_studio";
import { startPokerServer } from "../applications/poker_studio";
import { startBlackjackServer } from "../applications/blackjack_studio";
import { startYahtzeeServer } from "../applications/yahtzee_studio";
import { startPaintServer } from "../applications/paint_studio";
import { startLemmingsServer } from "../applications/lemmings_studio";
import { startLodeRunnerServer } from "../applications/lode_runner_studio";
import { startChuChuRocketServer } from "../applications/chuchu_rocket_studio";
import { startRampartServer } from "../applications/rampart_studio";
import { startChipsChallengeServer } from "../applications/chips_challenge_studio";
import { startPeggleServer } from "../applications/peggle_studio";
import { startVampireSurvivorsServer } from "../applications/vampire_survivors_studio";
import { startMemoryMatchServer } from "../applications/memory_match_studio";
import { sanitizeHtml } from "../applications/markdown_studio";
import { interpolateExecCommand } from "../applications/fd_engine";
import {
  escapeXml,
  generatePlist,
  sanitizeBundleName,
} from "../applications/app_bundler_studio";
import { buryTargetsSync } from "../applications/rip_engine";
import { startMediaPlayerStudioServer } from "../applications/media_player_studio";
import { startSubprocessPipeStudioServer } from "../applications/subprocess_pipe_studio_server";
import { probeHttpSync } from "../applications/network_studio";

function extractCalculatorEvalFn(): (expr: string, x: number) => number {
  const src = readFileSync(
    join(process.cwd(), "resources/universal_calculator/app.js"),
    "utf8",
  );
  const start = src.indexOf("const GRAPH_MATH_FUNCS =");
  const end = src.indexOf("function drawCalculusStudio()");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not locate safeEvalGraphExpression in app.js");
  }
  const slice = src.slice(start, end);
  expect(slice).not.toContain("new Function");
  expect(slice).not.toContain("eval(");
  // Compile extracted pure parser module in test harness only to invoke safeEvalGraphExpression
  const factory = new Function(`${slice}\nreturn safeEvalGraphExpression;`);
  return factory() as (expr: string, x: number) => number;
}

describe("Slice 4 Studios & Non-FM Resources Regression Suite", () => {
  describe("[V-SEC-08] Universal Calculator recursive-descent expression parser", () => {
    const safeEval = extractCalculatorEvalFn();

    test("evaluates arithmetic, implicit multiplication, powers, constants, and inverse trig accurately", () => {
      expect(safeEval("2x^2 + 3x - 5", 2)).toBeCloseTo(9, 10);
      expect(safeEval("(x + 1)(x - 1)", 4)).toBeCloseTo(15, 10);
      expect(safeEval("-x^2", 3)).toBeCloseTo(-9, 10);
      expect(safeEval("(-x)^2", 3)).toBeCloseTo(9, 10);
      expect(safeEval("2^3^2", 0)).toBeCloseTo(512, 10);
      expect(safeEval("asin(0.5)", 0)).toBeCloseTo(Math.asin(0.5), 10);
      expect(safeEval("acos(0.5)", 0)).toBeCloseTo(Math.acos(0.5), 10);
      expect(safeEval("atan(1) * 4", 0)).toBeCloseTo(Math.PI, 10);
      expect(safeEval("atan2(1, 1) * 4", 0)).toBeCloseTo(Math.PI, 10);
      expect(safeEval("ln(e^2) + log(100)", 0)).toBeCloseTo(4, 10);
      expect(safeEval("1 - cos(theta)", Math.PI)).toBeCloseTo(2, 10);
      expect(safeEval("sqrt(t) + tan(0)", 9)).toBeCloseTo(3, 10);
    });

    test("blocks arbitrary JavaScript execution and prototype/global escapes", () => {
      const payloads = [
        "globalThis.process.exit(1)",
        "constructor.constructor('return 1')()",
        "this.constructor",
        "alert(1)",
        "x; 1+1",
        "Math.sin(1)",
        "__proto__",
        "toString(1)",
      ];
      for (const payload of payloads) {
        expect(() => safeEval(payload, 1)).toThrow();
      }
    });
  });

  describe("[V-SEC-09] Code Studio & Static Studio symlink containment", () => {
    test("isInsideWorkspace blocks real and dangling symlinks pointing outside workspace and safe delete unlinks symlink only", async () => {
      const root = mkdtempSync(join(tmpdir(), "code-studio-sec-"));
      const outside = mkdtempSync(join(tmpdir(), "code-studio-outside-"));
      try {
        const secretFile = join(outside, "secret.txt");
        writeFileSync(secretFile, "TOP_SECRET_DATA", "utf8");

        const linkToSecret = join(root, "escape.txt");
        symlinkSync(secretFile, linkToSecret);

        const danglingLink = join(root, "dangling.txt");
        symlinkSync(join(outside, "nonexistent-new.txt"), danglingLink);

        expect(isInsideWorkspace(root, linkToSecret)).toBe(false);
        expect(isInsideWorkspace(root, danglingLink)).toBe(false);
        expect(isInsideWorkspace(root, join(root, "safe/new.ts"))).toBe(true);

        const srv = startCodeStudioServer({
          port: 0,
          host: "127.0.0.1",
          workspaceRoot: root,
        });
        try {
          const readRes = await fetch(
            `http://127.0.0.1:${srv.port}/api/fs/read`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: "escape.txt" }),
            },
          );
          expect(readRes.status).toBe(403);

          const saveDangling = await fetch(
            `http://127.0.0.1:${srv.port}/api/fs/save`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: "dangling.txt", content: "pwned" }),
            },
          );
          expect(saveDangling.status).toBe(403);
          expect(existsSync(join(outside, "nonexistent-new.txt"))).toBe(false);

          // Deleting a symlink entry inside the workspace unlinks the symlink without harming the external target
          const outsideDir = join(outside, "protected_dir");
          mkdirSync(outsideDir);
          const protectedChild = join(outsideDir, "keep.txt");
          writeFileSync(protectedChild, "keep", "utf8");
          const dirSymlink = join(root, "linked_dir");
          symlinkSync(outsideDir, dirSymlink);

          const delRes = await fetch(
            `http://127.0.0.1:${srv.port}/api/fs/delete`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: "linked_dir" }),
            },
          );
          expect([200, 403]).toContain(delRes.status);
          expect(existsSync(protectedChild)).toBe(true);
        } finally {
          srv.stop(true);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  describe("[V-SEC-12] Code Editor DOM attribute escaping", () => {
    test("resources/code_editor/index.html avoids inline onclick interpolation on git status paths", () => {
      const html = readFileSync(
        join(process.cwd(), "resources/code_editor/index.html"),
        "utf8",
      );
      expect(html).not.toContain("onclick=\"openFile('${path}')\"");
      expect(html).toContain('data-git-path="${escapeHtml(path)}"');
    });
  });

  describe("[V-SEC-19] & [V-SEC-20] Zero-length regex safety, body size caps & shutdown auth", () => {
    test("Code Studio /api/fs/search terminates cleanly on zero-length regexes (^ and a*) and preserves multiline anchor parity", async () => {
      const ws = mkdtempSync(join(tmpdir(), "code-studio-search-"));
      try {
        writeFileSync(
          join(ws, "sample.ts"),
          "const alpha = 1;\r\nexport function beta() {\r\n  return alpha;\r\n}\r\n",
          "utf8",
        );
        mkdirSync(join(ws, "target"));
        writeFileSync(
          join(ws, "target", "ignored.ts"),
          "export function ignoredBuildArtifact() {}\n",
          "utf8",
        );

        const srv = startCodeStudioServer({
          port: 0,
          host: "127.0.0.1",
          workspaceRoot: ws,
        });
        try {
          // Zero-length regex ^ must not hang
          const caretRes = await fetch(
            `http://127.0.0.1:${srv.port}/api/fs/search`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: "^",
                isRegex: true,
                maxResults: 50,
              }),
            },
          );
          expect(caretRes.status).toBe(200);
          const caretJson = (await caretRes.json()) as { results: unknown[] };
          expect(caretJson.results.length).toBeGreaterThan(0);

          // Multiline ^export on line 2 of CRLF file must be found by whole-file pre-filter, while target/ is skipped
          const anchorRes = await fetch(
            `http://127.0.0.1:${srv.port}/api/fs/search`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: "^export\\s+function",
                isRegex: true,
                matchCase: true,
              }),
            },
          );
          const anchorJson = (await anchorRes.json()) as {
            results: Array<{
              path: string;
              matches: Array<{ line: number; col: number; snippet: string }>;
            }>;
          };
          expect(anchorJson.results).toEqual([
            {
              path: "sample.ts",
              matches: [
                { col: 0, line: 2, snippet: "export function beta() {" },
              ],
            },
          ]);
        } finally {
          srv.stop(true);
        }
      } finally {
        rmSync(ws, { recursive: true, force: true });
      }
    });

    test("Maze Generator and Word Search /api/state reject oversized >64 KiB bodies with 413", async () => {
      const mazeSrv = startMazeStudioServer({ port: 0, host: "127.0.0.1" });
      const wordSrv = startWordSearchStudioServer({
        port: 0,
        host: "127.0.0.1",
      });
      try {
        const huge = JSON.stringify({ pad: "A".repeat(70 * 1024) });
        const mazeRes = await fetch(
          `http://127.0.0.1:${mazeSrv.port}/api/state`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: huge,
          },
        );
        expect(mazeRes.status).toBe(413);

        const wordRes = await fetch(
          `http://127.0.0.1:${wordSrv.port}/api/state`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: huge,
          },
        );
        expect(wordRes.status).toBe(413);
      } finally {
        mazeSrv.stop(true);
        wordSrv.stop(true);
      }
    });

    test("Calculator Studio /api/shutdown requires POST + valid x-calc-token and escapes </script in HTML", async () => {
      const html = generateCalculatorStudioHtml({
        shutdownToken: "tok</script><script>alert(1)",
      });
      expect(html).not.toContain("</script><script>alert(1)");
      expect(html).toContain("\\u003c/script>");

      const srv = startCalculatorStudioServer({ port: 0, host: "127.0.0.1" });
      try {
        const getRes = await fetch(`http://127.0.0.1:${srv.port}/api/shutdown`);
        expect(getRes.status).toBe(405);

        const noTokenPost = await fetch(
          `http://127.0.0.1:${srv.port}/api/shutdown`,
          { method: "POST" },
        );
        expect(noTokenPost.status).toBe(403);

        const wrongTokenPost = await fetch(
          `http://127.0.0.1:${srv.port}/api/shutdown`,
          {
            method: "POST",
            headers: { "x-calc-token": "wrong-token" },
          },
        );
        expect(wrongTokenPost.status).toBe(403);
      } finally {
        srv.stop(true);
      }
    });
  });

  describe("[V-QA-11] & [V-QA-17] Tokei console output & 13 Arcade Studios dynamic port non-collision", () => {
    test("Tokei Studio writes formatted file breakdown without per-character newline flooding", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "tokei-studio-fix-"));
      try {
        writeFileSync(
          join(tmp, "hello.ts"),
          "export const answer = 42;\n",
          "utf8",
        );
        const win = createTokeiStudio();
        win.setValue("txt_path", tmp);
        win.setValue("chk_files", true);
        const handler = (win as any).eventHandlersMap?.get("btn_analyze:click");
        expect(handler).toBeDefined();
        await handler(win, tmp);
        const out = String(win.getValue("console_tokei") || "");
        expect(out).toContain("hello.ts");
        // Must NOT contain ANSI escape codes or single-character-per-line vertical gibberish
        expect(out).not.toContain("\x1b[");
        expect(out).not.toContain("h\ne\nl\nl\no");
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    test("all 13 arcade/canvas studios start concurrently on ephemeral ports without collision and missing favicons exist", () => {
      const servers = [
        startRatScrewServer(),
        startPokerServer(),
        startBlackjackServer(),
        startYahtzeeServer(),
        startPaintServer(),
        startLemmingsServer(),
        startLodeRunnerServer(),
        startChuChuRocketServer(),
        startRampartServer(),
        startChipsChallengeServer(),
        startPeggleServer(),
        startVampireSurvivorsServer(),
        startMemoryMatchServer(),
      ];
      try {
        const ports = servers.map((s) => s.port);
        for (const p of ports) {
          expect(p).toBeGreaterThan(0);
        }
        expect(new Set(ports).size).toBe(servers.length);
      } finally {
        for (const s of servers) s.stop(true);
      }

      for (const dir of ["magical_drop", "qix", "vampire_survivors"]) {
        const fav = join(process.cwd(), "resources", dir, "favicon.svg");
        expect(existsSync(fav)).toBe(true);
        expect(readFileSync(fav, "utf8")).toContain("<svg");
      }
    });
  });

  describe("[V-OPT-11] & [V-OPT-18] Task Manager lightweight shell & Paint copy-on-write layer history", () => {
    test("generateTaskManagerHtml returns lightweight <600 KiB shell while matchesQuery preserves semantic & typo aliases", () => {
      const html = generateTaskManagerHtml();
      expect(Buffer.byteLength(html, "utf8")).toBeLessThan(600 * 1024);
      expect(html).toContain("__masterTableTbodyHtml");
      expect(html).toContain("/api/processes");

      const ghosttyProc: ProcessItem = {
        pid: "4242",
        ppid: "1",
        name: "Ghostty",
        cpu: 2.5,
        mem: 1.2,
        rssKb: 120000,
        rssMb: "117.2 MB",
        user: "dev",
        state: "S",
        uptime: "01:00",
        ports: [],
        command: "/Applications/Ghostty.app/Contents/MacOS/ghostty",
        isUserApp: true,
        isDevServer: false,
      };
      expect(matchesQuery(ghosttyProc, "temrinal")).toBe(true);
      expect(matchesQuery(ghosttyProc, "ghosty console")).toBe(true);
      expect(matchesQuery(ghosttyProc, "postgres")).toBe(false);
    });

    test("Paint Studio saveHistory shares unmodified layer ImageData references and Calculator guards canvas dimensions", () => {
      const paintHtml = readFileSync(
        join(process.cwd(), "resources/paint/index.html"),
        "utf8",
      );
      expect(paintHtml).toContain("function saveHistory(dirtyScope =");
      expect(paintHtml).toContain("canReuseImageData");
      expect(paintHtml).toContain(
        "canvas: activeSnap ? activeSnap.imageData : null",
      );

      const calcJs = readFileSync(
        join(process.cwd(), "resources/universal_calculator/app.js"),
        "utf8",
      );
      expect(calcJs).toContain(
        "if (canvas.width !== targetW) canvas.width = targetW;",
      );
      expect(calcJs).toContain(
        "if (canvas.height !== targetH) canvas.height = targetH;",
      );
      expect(calcJs).toContain("ctx.setTransform(dpr, 0, 0, dpr, 0, 0);");
    });
  });

  describe("[V-SEC-06] fd_engine single-pass POSIX quoting & app_bundler_studio sanitization", () => {
    test("interpolateExecCommand single-quotes shell metacharacters and resists cascaded placeholder injection", () => {
      const cmd = interpolateExecCommand(
        "echo {} {/}",
        "/tmp/dir/{/}$(touch pwn)'quote.txt",
      );
      expect(cmd).not.toContain("$(touch pwn)'quote.txt $(touch");
      const proc = Bun.spawnSync(["sh", "-c", cmd], {
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(proc.exitCode).toBe(0);
      expect(proc.stdout.toString().trim()).toContain("$(touch pwn)");
    });

    test("sanitizeBundleName blocks dot/traversal segments and generatePlist XML-escapes values", () => {
      expect(sanitizeBundleName(".", "FallbackApp")).toBe("FallbackApp");
      expect(sanitizeBundleName("..", "FallbackApp")).toBe("FallbackApp");
      const scrubbed = sanitizeBundleName("../etc/passwd", "FallbackApp");
      expect(scrubbed).not.toContain("/");
      expect(scrubbed).not.toContain("\\");
      expect(scrubbed).not.toContain("..");
      expect(scrubbed).toMatch(/^[A-Za-z0-9._ -]{1,64}$/);
      expect(sanitizeBundleName("My Cool App 2.0")).toBe("My Cool App 2.0");

      const plist = generatePlist(
        'Evil</string><key>Injected</key><string>"&',
        "com.example.<app>",
        "1.0&beta",
      );
      expect(plist).not.toContain("</string><key>Injected</key>");
      expect(plist).toContain("&lt;/string&gt;");
      expect(escapeXml(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
    });
  });

  describe("[V-SEC-09] & [V-SEC-10] rip_engine D-019 manifest protection & media_player_studio auth", () => {
    test("buryTargetsSync refuses to overwrite a corrupted manifest.json (D-019)", () => {
      const tmp = mkdtempSync(join(tmpdir(), "rip-d019-"));
      try {
        const grave = join(tmp, "graveyard");
        mkdirSync(grave, { recursive: true });
        const manifestPath = join(grave, "manifest.json");
        writeFileSync(manifestPath, "{corrupted-json!!!", "utf8");
        const victim = join(tmp, "victim.txt");
        writeFileSync(victim, "precious", "utf8");

        const res = buryTargetsSync([victim], {
          graveyardDir: grave,
          cwd: tmp,
        });
        expect(res.success).toBe(false);
        expect(res.failed.length).toBeGreaterThan(0);
        expect(readFileSync(manifestPath, "utf8")).toBe("{corrupted-json!!!");
        expect(existsSync(victim)).toBe(true);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    test("media_player_studio requires valid session token on /api/* and blocks symlink playlist.m3u8 overwrite", async () => {
      const mediaRoot = mkdtempSync(join(tmpdir(), "media-sec-root-"));
      const outside = mkdtempSync(join(tmpdir(), "media-sec-outside-"));
      try {
        const outsideTarget = join(outside, "keep.txt");
        writeFileSync(outsideTarget, "DO_NOT_OVERWRITE", "utf8");
        symlinkSync(outsideTarget, join(mediaRoot, "playlist.m3u8"));

        const started = startMediaPlayerStudioServer({
          port: 0,
          host: "127.0.0.1",
          rootDir: mediaRoot,
        });
        try {
          const unauthLib = await fetch(`${started.url}/api/library`);
          expect([401, 403]).toContain(unauthLib.status);

          const authLib = await fetch(
            `${started.url}/api/library?token=${encodeURIComponent(started.token)}`,
          );
          expect(authLib.status).toBe(200);

          const expRes = await fetch(`${started.url}/api/playlist`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-media-token": started.token,
            },
            body: JSON.stringify({
              action: "export",
              folder: mediaRoot,
              tracks: [{ path: join(mediaRoot, "song.mp3"), title: "Song" }],
            }),
          });
          expect(expRes.status).toBeGreaterThanOrEqual(400);
          expect(readFileSync(outsideTarget, "utf8")).toBe("DO_NOT_OVERWRITE");
        } finally {
          started.server.stop(true);
        }
      } finally {
        rmSync(mediaRoot, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  describe("[V-SEC-12] & [V-SEC-17] Markdown allowlist sanitizer & curl protocol hardening", () => {
    test("sanitizeHtml blocks nested <script>, <svg/onload>, <details ontoggle>, and entity-encoded javascript: URIs", () => {
      const dirty = [
        "<scr<script>ipt>alert(1)</scr</script>ipt>",
        "<svg/onload=alert(1)>",
        '<details open ontoggle="alert(2)"><summary>Info</summary></details>',
        '<a href="&#x6a;&#x61;vascript&colon;alert(3)">click</a>',
        '<a href="https://example.com" onclick="evil()">safe</a>',
      ].join("\n");
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain("<script");
      expect(clean).not.toContain("<svg");
      expect(clean).not.toContain("onload");
      expect(clean).not.toContain("ontoggle");
      expect(clean).not.toContain("onclick");
      expect(clean.toLowerCase()).not.toContain("javascript:");
      expect(clean).toContain("<details");
      expect(clean).toContain('href="https://example.com"');
    });

    test("probeHttpSync rejects non-http(s) file:// and option-like URLs", () => {
      const fileProbe = probeHttpSync("file:///etc/passwd");
      expect(fileProbe.success).toBe(false);
      const optProbe = probeHttpSync("-K/etc/passwd");
      expect(optProbe.success).toBe(false);
    });
  });

  describe("[V-QA-11] Subprocess Pipe Studio pipeline ID/export routing & ignoreError propagation", () => {
    test("supports GET/DELETE /api/pipelines/:id, routes /api/pipelines/export before :id, and honors stage.ignoreError", async () => {
      const tmpFile = join(
        mkdtempSync(join(tmpdir(), "pipe-lib-")),
        "pipelines.json",
      );
      const srv = startSubprocessPipeStudioServer(0, {
        host: "127.0.0.1",
        libraryPath: tmpFile,
      });
      try {
        const base = `http://127.0.0.1:${srv.port}`;
        const saveRes = await fetch(`${base}/api/pipelines`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Resilient Pipe",
            description: "continues past stage 1 failure",
            stages: [
              { name: "FailStep", command: "false", ignoreError: true },
              { name: "RecoverStep", command: "echo RECOVERED_OK" },
            ],
          }),
        });
        expect(saveRes.status).toBe(200);
        const savedBody = (await saveRes.json()) as any;
        expect(savedBody.pipeline).toBeDefined();
        const pipeId = savedBody.pipeline.id;
        expect(typeof pipeId).toBe("string");

        const exportRes = await fetch(`${base}/api/pipelines/export`);
        expect(exportRes.status).toBe(200);

        const getById = await fetch(
          `${base}/api/pipelines/${encodeURIComponent(pipeId)}`,
        );
        expect(getById.status).toBe(200);

        const runRes = await fetch(`${base}/api/execute/full`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stages: [
              {
                id: "s1",
                name: "FailStep",
                command: "false",
                inputMode: "none",
                enabled: true,
                ignoreError: true,
              },
              {
                id: "s2",
                name: "RecoverStep",
                command: "echo RECOVERED_OK",
                inputMode: "none",
                enabled: true,
              },
            ],
          }),
        });
        expect(runRes.status).toBe(200);
        const runJson = (await runRes.json()) as any;
        expect(
          String(
            runJson.report?.finalOutput ??
              runJson.finalOutput ??
              JSON.stringify(runJson),
          ),
        ).toContain("RECOVERED_OK");

        const delRes = await fetch(
          `${base}/api/pipelines/${encodeURIComponent(pipeId)}`,
          { method: "DELETE" },
        );
        expect(delRes.status).toBe(200);
      } finally {
        srv.stop(true);
        rmSync(join(tmpFile, ".."), { recursive: true, force: true });
      }
    });
  });
});
