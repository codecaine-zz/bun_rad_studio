import {
  afterAll,
  describe,
  expect,
  mock,
  setDefaultTimeout,
  test,
} from "bun:test";
import { createHash } from "crypto";
import { EventEmitter } from "events";
import * as fs from "fs";
import { promises as fsp } from "fs";
import type { Socket } from "net";
import { tmpdir } from "os";
import * as nodePath from "path";
import { Database } from "bun:sqlite";
import { JSDOM } from "jsdom";
import { SqliteAdapter } from "../src/db/adapters/sqlite";
import type { ConnectionConfig } from "../src/db/types";
import {
  assetIdForPlatform,
  installLatestUpdate,
  parseSha256Sums,
} from "../src/features/filemanager/fmAboutOps";
import {
  encodeFloat32SamplesToWav,
  getCachedBionicAudioFile,
  runBionicSpeech,
  runBionicWhisper,
} from "../src/features/filemanager/fmBionic";
import {
  generateChecksums,
  pasteClipboardImageToFile,
} from "../src/features/filemanager/fmClipboardOps";
import { cliUtilsOperations } from "../src/features/filemanager/fmCliUtils";
import { compareOperations } from "../src/features/filemanager/fmCompare";
import { Notes } from "../src/features/filemanager/fmConvCommon";
import { DOC_DEFS } from "../src/features/filemanager/fmConvDocs";
import { publishFile } from "../src/features/filemanager/fmConvExec";
import { parseIni } from "../src/features/filemanager/fmConvMarkup";
import { VIDEO_DEFS } from "../src/features/filemanager/fmConvMedia";
import type { BuildContext } from "../src/features/filemanager/fmConvTypes";
import { startConvert } from "../src/features/filemanager/fmConvert";
import { createContext } from "../src/features/filemanager/fmCore";
import {
  compareTextFiles,
  computeLineDiff as computeBackendLineDiff,
} from "../src/features/filemanager/fmDataCompare";
import {
  inspectCloneSource,
  runClone,
} from "../src/features/filemanager/fmDbClone";
import type { CloneRedisClient } from "../src/features/filemanager/fmDbHooks";
import {
  adaptSqlPlaceholders,
  evalCondition,
  executeDbMacro,
  validateBunMacroCode,
} from "../src/features/filemanager/fmDbMacros";
import {
  runMacroCodeInWorker,
  validateConditionAst,
} from "../src/features/filemanager/fmDbMacroWorker";
import { databaseOperations } from "../src/features/filemanager/fmDbOps";
import type { TestInput } from "../src/features/filemanager/fmDbTest";
import {
  DownloadManager,
  MAX_CHUNKS,
  assertSafeDownloadUrlSync,
  stripSensitiveHeaders,
} from "../src/features/filemanager/fmDownloads";
import {
  assertRealpathInsideSandboxSync,
  ensureDirectorySyncNative,
  listDirectoryEntriesSyncNative,
  readTextFileSyncNative,
  streamDownloadWithSha256,
  verifyDownloadedArchiveIntegrity,
  writeNewFileExclusiveAsync,
} from "../src/features/filemanager/fmNativeFs";
import { netState } from "../src/features/filemanager/fmNetCore";
import {
  snapshot as netSnapshot,
  startScan,
} from "../src/features/filemanager/fmNetScan";
import { classify, protectedReason } from "../src/features/filemanager/fmPaths";
import { protectedChangeReason } from "../src/features/filemanager/fmPerms";
import { permsOperations } from "../src/features/filemanager/fmPermsOps";
import { buildReadAlongSlideBmpFallback } from "../src/features/filemanager/fmPhonon";
import { stageRenames } from "../src/features/filemanager/fmPlanRun";
import {
  inspectPackageDirectoryRich,
  parseBinaryPlist,
} from "../src/features/filemanager/fmPreview";
import { breachCheck } from "../src/features/filemanager/fmSecretsHealth";
import type { SecretItem } from "../src/features/filemanager/fmSecretsModel";
import { SecretsService } from "../src/features/filemanager/fmSecretsService";
import { writeAtomic } from "../src/features/filemanager/fmSecretsStore";
import { serveOperations } from "../src/features/filemanager/fmServeOps";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import {
  createTerminalHub,
  type WslInfo,
} from "../src/features/filemanager/fmTerminal";
import { scanSource } from "../src/features/filemanager/fmVaultWalk";
import { presetsFor } from "../src/features/filemanager/fmWatchOps";
import { FakeKeychain, fakeStudioCommand } from "./helpers/db_fm";

setDefaultTimeout(30_000);

mock.module("../resources/file_manager/ui/terminal.js", () => ({
  terminalShell: () => "posix",
  terminalWsl: () => ({}),
  terminalAvailable: () => true,
  typeInTerminal: () => true,
  showTerminal() {},
  hideTerminal() {},
  toggleTerminal() {},
  wireTerminal() {},
  isTerminalOpen: () => false,
  terminalReady: () => false,
  openTerminal: async () => {},
  closeTerminal: async () => {},
  sendCommandToTerminal: async () => {},
}));

const tempRoots: string[] = [];
function makeTempRoot(prefix = "fm-fixes-"): string {
  const dir = fs.mkdtempSync(nodePath.join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

describe("File Manager Security Regressions (Slice 2)", () => {
  test("[V-SEC-01] AST condition evaluator evaluates expressions without Function/eval and blocks prototype/global access", async () => {
    const scope = {
      tempVars: {
        rowCount: 12,
        status: "ok",
        tags: ["alpha", "beta"],
        nested: { ready: true },
      },
      params: { minRows: 10 },
      recordsAffected: 12,
      engine: "postgres",
      connectionName: "staging",
    };

    expect(
      await evalCondition(
        'rowCount >= params.minRows && status === "ok" && vars.tags.includes("beta") && vars.nested.ready ? true : false',
        scope,
      ),
    ).toBe(true);
    expect(
      await evalCondition("Math.max(rowCount, 3) === 12 && !false", scope),
    ).toBe(true);

    // Unsafe identifiers, prototype chains, and dynamic code constructs must fail validation or evaluation
    for (const bad of [
      "constructor",
      'vars["__proto__"]',
      "vars.constructor.constructor('return process')()",
      "process.exit(1)",
      "globalThis.Bun",
      "eval('1+1')",
      "Function('return 1')()",
    ]) {
      const check = validateConditionAst(bad);
      if (check.valid) {
        await expect(evalCondition(bad, scope)).rejects.toThrow();
      } else {
        expect(check.valid).toBe(false);
      }
    }
  });

  test("[V-SEC-01] Worker-isolated RunCode scrubs host globals, gates unconfirmed code, and enforces hard timeout", async () => {
    const root = makeTempRoot("fm-sec01-worker-");
    const dbPath = nodePath.join(root, "dev.sqlite");
    const initDb = new Database(dbPath);
    initDb.run("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);");
    initDb.close();

    const ctx = createContext({
      home: root,
      dataDir: nodePath.join(root, ".data"),
      databases: {
        secretStore: async () => new FakeKeychain(),
        studioCommand: () => fakeStudioCommand(),
        openAdapter: (cfg: ConnectionConfig) => new SqliteAdapter(cfg),
      },
    });

    const saved = (await databaseOperations["db/profile/save"]!(ctx, {
      profile: {
        name: "Dev SQLite",
        engine: "sqlite",
        path: dbPath,
        production: false,
      },
    })) as { profile: { id: string } };

    const codeMacro = {
      id: "m-worker-isolation",
      name: "Worker Isolation Check",
      mode: "actions" as const,
      engineFilter: "any" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      actions: [
        {
          id: "rc1",
          action: "RunCode" as const,
          enabled: true,
          comment: "",
          condition: "",
          params: {
            code: `
              TempVars.sum = 40 + 2;
              TempVars.hasWindow = typeof window;
              console.log("worker-ok=" + TempVars.sum);
            `,
          },
        },
      ],
    };

    // Unconfirmed custom RunCode step MUST require confirmation
    await expect(
      executeDbMacro(ctx, {
        macro: codeMacro,
        target: { kind: "profile", profileId: saved.profile.id },
        confirmCode: false,
        confirmWrites: false,
      }),
    ).rejects.toMatchObject({ code: "NEEDS_CONFIRM" });

    // Confirmed worker execution isolates code in worker_threads and bridges TempVars/logs safely
    const okRes = await executeDbMacro(ctx, {
      macro: codeMacro,
      target: { kind: "profile", profileId: saved.profile.id },
      confirmCode: true,
      confirmWrites: true,
    });
    expect(okRes.ok).toBe(true);
    expect(okRes.tempVars.sum).toBe(42);
    expect(okRes.tempVars.hasWindow).toBe("undefined");

    // Infinite synchronous loop in worker is hard-terminated by timeoutMs
    const loopRes = await executeDbMacro(ctx, {
      macro: {
        id: "m-loop",
        name: "Infinite Loop",
        mode: "code" as const,
        engineFilter: "any" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        code: "while (true) {}",
      },
      target: { kind: "profile", profileId: saved.profile.id },
      timeoutMs: 250,
      confirmCode: true,
      confirmWrites: true,
    });
    expect(loopRes.ok).toBe(false);
    expect(JSON.stringify(loopRes)).toMatch(/timed out|TIMEOUT/i);

    // Static + Bun.Transpiler guard blocks dynamic import, host APIs, ShadowRealm, Unicode escapes, and early-brace breakouts
    expect(validateBunMacroCode('await import("fs")').valid).toBe(false);
    expect(validateBunMacroCode("Bun.spawn(['id'])").valid).toBe(false);
    expect(
      validateBunMacroCode(
        'const sr = new ShadowRealm(); await sr.importValue("fs", "readFileSync");',
      ).valid,
    ).toBe(false);
    expect(
      validateBunMacroCode("const s = new \\u0053hadowRealm();").valid,
    ).toBe(false);
    expect(
      validateBunMacroCode("}\nfunction Object() {}\nasync function __tail() {")
        .valid,
    ).toBe(false);

    // Direct Worker runtime check: even bypassing static regex, ShadowRealm & BroadcastChannel are wiped on globalThis
    const workerGlobalsRes = await runMacroCodeInWorker(
      `return { shadowRealm: typeof ShadowRealm, broadcast: typeof BroadcastChannel, htmlRewriter: typeof HTMLRewriter };`,
      {
        engine: "sqlite",
        label: "test",
        bunVersion: Bun.version,
        timeoutMs: 2000,
        tempVarsStore: {},
        inputParams: {},
        connectionsList: [],
        onSyncEvent() {},
        onRpc: async () => null,
        createStopSignal: (r) => new Error(r),
      },
    );
    expect(workerGlobalsRes).toEqual({
      shadowRealm: "undefined",
      broadcast: "undefined",
      htmlRewriter: "undefined",
    });
  });

  test("[V-SEC-01] executeDbMacro enforces NEEDS_CONFIRM on production/readOnly profiles even when dryRun=true and blocks dryRun writes", async () => {
    const root = makeTempRoot("fm-sec01-macro-");
    const dbPath = nodePath.join(root, "prod.sqlite");
    const initDb = new Database(dbPath);
    initDb.run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);");
    initDb.run("INSERT INTO items (name) VALUES ('keep');");
    initDb.close();

    const ctx = createContext({
      home: root,
      dataDir: nodePath.join(root, ".data"),
      databases: {
        secretStore: async () => new FakeKeychain(),
        studioCommand: () => fakeStudioCommand(),
        openAdapter: (cfg: ConnectionConfig) => new SqliteAdapter(cfg),
      },
    });

    const saved = (await databaseOperations["db/profile/save"]!(ctx, {
      profile: {
        name: "Prod SQLite",
        engine: "sqlite",
        path: dbPath,
        sqliteMode: "readonly",
        production: true,
      },
    })) as { profile: { id: string } };

    const macroDef = {
      id: "m-prod-check",
      name: "Prod Check",
      mode: "actions" as const,
      engineFilter: "any" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      actions: [
        {
          id: "s1",
          action: "RunSQL" as const,
          enabled: true,
          comment: "",
          condition: "",
          args: { sql: "DELETE FROM items" },
        },
      ],
    };

    // Unconfirmed dryRun against production/readOnly profile MUST throw NEEDS_CONFIRM
    await expect(
      executeDbMacro(ctx, {
        macro: macroDef,
        target: { kind: "profile", profileId: saved.profile.id },
        dryRun: true,
        confirmWrites: false,
      }),
    ).rejects.toMatchObject({ code: "NEEDS_CONFIRM" });

    // Confirmed dryRun must NOT mutate persistent SQLite rows
    const dryRes = await executeDbMacro(ctx, {
      macro: macroDef,
      target: { kind: "profile", profileId: saved.profile.id },
      dryRun: true,
      confirmWrites: true,
    });
    expect(dryRes.ok).toBe(false);

    const checkDb = new Database(dbPath, { readonly: true });
    const count = checkDb.query("SELECT COUNT(*) AS c FROM items").get() as {
      c: number;
    };
    checkDb.close();
    expect(count.c).toBe(1);
  });

  test("[V-SEC-04] & [V-OPT-10] Update installer & streaming downloader sanitize names and verify SHA-256 / archive magic", async () => {
    const goodBytes = Buffer.from(
      "PK\x03\x04-fake-release-zip-payload-1234567890",
    );
    const goodSha = createHash("sha256").update(goodBytes).digest("hex");
    const sums = parseSha256Sums(
      `${goodSha}  *BunRadStudio-Setup.zip\n${"0".repeat(64)}  other.tar.gz\n`,
    );
    expect(sums.get("BunRadStudio-Setup.zip")).toBe(goodSha);

    const root = makeTempRoot("fm-sec04-upd-");
    fs.mkdirSync(nodePath.join(root, "Downloads"), { recursive: true });
    const assetId = assetIdForPlatform("win32", "x64")!;
    const assetFileName = `Codecaine-File-Manager-v99.0.0-${assetId}.zip`;
    let openedPath = "";
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/releases/latest")) {
        return new Response(
          JSON.stringify({
            tag_name: "v99.0.0",
            html_url: "https://github.com/example/release",
            assets: [
              {
                name: `../${assetFileName}`,
                browser_download_url: `https://objects.githubusercontent.com/${assetFileName}`,
                digest: `sha256:${"f".repeat(64)}`,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(goodBytes, { status: 200 });
    }) as typeof fetch;

    try {
      const ctx = createContext({
        platform: "win32",
        arch: "x64",
        home: root,
        sandboxRoot: root,
        dataDir: nodePath.join(root, ".data"),
        launch: async (_cmd, args) => {
          openedPath = args[args.length - 1] ?? "";
        },
      });
      await expect(installLatestUpdate(ctx)).rejects.toMatchObject({
        code: "INTEGRITY_FAILED",
      });
      expect(openedPath).toBe("");
    } finally {
      globalThis.fetch = origFetch;
    }

    // Streaming archive integrity rejects HTML error pages masquerading as .tar.zst
    const badZst = nodePath.join(root, "bad.tar.zst");
    const badHtml = "<html>502 Bad Gateway - upstream error page</html>";
    fs.writeFileSync(badZst, badHtml);
    await expect(
      verifyDownloadedArchiveIntegrity({
        downloadUrl: "https://example.invalid/bad.tar.zst",
        assetName: "bad.tar.zst",
        actualSha256: createHash("sha256").update(badHtml).digest("hex"),
        bytesWritten: badHtml.length,
        magicCheckPath: badZst,
        expectedMagic: "zstd",
        checkRemoteManifest: false,
      }),
    ).rejects.toMatchObject({ code: "INTEGRITY_FAILED" });

    // Streaming download computes exact SHA-256 and verifyDownloadedArchiveIntegrity rejects digest mismatch
    const destStream = nodePath.join(root, "streamed.bin");
    const prevFetch2 = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(goodBytes, { status: 200 })) as unknown as typeof fetch;
    try {
      const dl = await streamDownloadWithSha256(
        "https://example.invalid/streamed.bin",
        destStream,
      );
      expect(dl.sha256).toBe(goodSha);
      await expect(
        verifyDownloadedArchiveIntegrity({
          downloadUrl: "https://example.invalid/streamed.bin",
          assetName: "streamed.bin",
          actualSha256: dl.sha256,
          expectedSha256: "a".repeat(64),
          bytesWritten: dl.bytesWritten,
          checkRemoteManifest: false,
        }),
      ).rejects.toMatchObject({ code: "INTEGRITY_FAILED" });
    } finally {
      globalThis.fetch = prevFetch2;
    }
  });

  test("[V-SEC-06] & [V-OPT-04] Native FS helpers handle shell metacharacters safely and Windows watch preset quotes env var", async () => {
    const root = makeTempRoot("fm-sec06-fs-");
    const trickyDir = nodePath.join(root, "dir & $(echo pwned) 'quoted'");
    ensureDirectorySyncNative(trickyDir);
    const trickyFile = nodePath.join(trickyDir, "note & calc.txt");
    assertRealpathInsideSandboxSync(trickyFile, root, process.platform);
    await writeNewFileExclusiveAsync(trickyFile, "safe-native-io");

    expect(readTextFileSyncNative(trickyFile)).toBe("safe-native-io");
    const entries = listDirectoryEntriesSyncNative(trickyDir, (name) =>
      nodePath.join(trickyDir, name),
    );
    expect(entries.map((e) => e.name)).toEqual(["note & calc.txt"]);

    const winPresets = presetsFor("win32");
    const echoPreset = winPresets.find((p) =>
      p.command.includes("WATCHEXEC_TRIGGERED_PATH"),
    );
    expect(echoPreset?.command).toContain(
      '"Changed: %WATCHEXEC_TRIGGERED_PATH%"',
    );
  });

  test("[V-SEC-07] db/test refuses to attach stored Keychain password when host, port, user, or tls changes", async () => {
    const root = makeTempRoot("fm-sec07-db-");
    const keychain = new FakeKeychain();
    let seenInput: TestInput | null = null;

    const ctx = createContext({
      home: root,
      dataDir: nodePath.join(root, ".data"),
      databases: {
        secretStore: async () => keychain,
        studioCommand: () => fakeStudioCommand(),
        testConnection: async (input: TestInput) => {
          seenInput = input;
          return {
            ok: true,
            ms: 1,
            version: "16.0",
            summary: "ok",
            message: "Connected",
            facts: [],
          };
        },
      },
    });

    const saved = (await databaseOperations["db/profile/save"]!(ctx, {
      profile: {
        name: "Corp PG",
        engine: "postgres",
        host: "db.internal.corp",
        port: 5432,
        user: "app_user",
        database: "prod",
        tls: true,
      },
      password: "super-secret-db-password",
    })) as { profile: { id: string } };

    // Draft referencing saved profile ID but with attacker-modified host -> password MUST NOT be attached!
    await databaseOperations["db/test"]!(ctx, {
      draftOf: saved.profile.id,
      profile: {
        name: "Corp PG",
        engine: "postgres",
        host: "attacker.evil.example",
        port: 5432,
        user: "app_user",
        database: "prod",
        tls: true,
      },
    });
    expect(seenInput!.password ?? "").toBe("");

    // Draft with exact matching endpoint fields -> stored password IS attached
    await databaseOperations["db/test"]!(ctx, {
      draftOf: saved.profile.id,
      profile: {
        name: "Corp PG",
        engine: "postgres",
        host: "db.internal.corp",
        port: 5432,
        user: "app_user",
        database: "prod",
        tls: true,
      },
    });
    expect(seenInput!.password).toBe("super-secret-db-password");
  });

  test("[V-SEC-09] Symlink sandbox containment, exclusive file creation, PROGRAM_EXTS parity, and cliutils/run confirmation gate", async () => {
    const root = makeTempRoot("fm-sec09-");
    const sandbox = nodePath.join(root, "sandbox");
    const outside = nodePath.join(root, "outside");
    fs.mkdirSync(sandbox, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    const secretFile = nodePath.join(outside, "secret.txt");
    fs.writeFileSync(secretFile, "outside-secret");

    const linkDir = nodePath.join(sandbox, "escape-dir");
    fs.symlinkSync(outside, linkDir);
    const linkFile = nodePath.join(sandbox, "escape-file.txt");
    fs.symlinkSync(secretFile, linkFile);

    // 1. Native sandbox realpath containment & exclusive write
    expect(() =>
      assertRealpathInsideSandboxSync(
        nodePath.join(linkDir, "pwn.txt"),
        sandbox,
        process.platform,
      ),
    ).toThrow();
    const validTarget = nodePath.join(sandbox, "once.txt");
    await writeNewFileExclusiveAsync(validTarget, "first");
    await expect(
      writeNewFileExclusiveAsync(validTarget, "second"),
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });

    const ctx = createContext({
      home: sandbox,
      sandboxRoot: sandbox,
      dataDir: nodePath.join(root, ".data"),
    });

    // 2. Preview package directory symlink escape
    const fakePkg = nodePath.join(sandbox, "Bad.rtfd");
    fs.mkdirSync(fakePkg, { recursive: true });
    fs.symlinkSync(secretFile, nodePath.join(fakePkg, "TXT.rtf"));
    const pkgPreview = await inspectPackageDirectoryRich(fakePkg);
    expect(JSON.stringify(pkgPreview)).not.toContain("outside-secret");

    // 3. Perms, Clipboard, Compare, and DataCompare symlink escape rejection
    const escapedPathViaSymlinkDir = nodePath.join(linkDir, "secret.txt");
    expect(
      protectedChangeReason(ctx, escapedPathViaSymlinkDir, false),
    ).toContain("outside the allowed workspace");
    const permsInfo = (await permsOperations["perms/get"]!(ctx, {
      paths: [escapedPathViaSymlinkDir, linkFile],
    })) as {
      items: Array<{ canChange: boolean; reason: string | null }>;
    };
    expect(permsInfo.items.every((item) => item.canChange === false)).toBe(
      true,
    );
    await expect(
      pasteClipboardImageToFile(ctx, {
        dirPath: linkDir,
        fileName: "shot.png",
        base64Png: "iVBORw0KGgo=",
      }),
    ).rejects.toThrow();
    await expect(
      generateChecksums(ctx, { paths: [linkFile], algorithm: "sha256" }),
    ).rejects.toThrow();
    const inFile = nodePath.join(sandbox, "local.txt");
    fs.writeFileSync(inFile, "local");
    await expect(compareTextFiles(ctx, inFile, linkFile)).rejects.toThrow();
    await expect(
      compareOperations["compare/start"]!(ctx, {
        left: sandbox,
        right: linkDir,
      }),
    ).rejects.toThrow();

    // 4. PROGRAM_EXTS synced with LAUNCH_EXTS
    for (const ext of [
      "payload.hta",
      "script.vbs",
      "job.wsf",
      "shortcut.lnk",
      "jump.url",
      "keys.reg",
      "app.desktop",
      "run.terminal",
      "macro.scpt",
    ]) {
      const info = classify(ext, false);
      expect(info.kind).toBe("program");
      expect(info.program).toBe(true);
    }

    // 5. cliutils/run requires confirm: true
    await expect(
      cliUtilsOperations["cliutils/run"]!(ctx, {
        tool: "rg",
        args: ["--version"],
      }),
    ).rejects.toMatchObject({ code: "NEEDS_CONFIRM" });
  });

  test("[V-SEC-15] Download auth header scrubbing, SSRF blocking, and Secrets .bak purge with writeAtomic read-back verify intact", async () => {
    const scrubbed = stripSensitiveHeaders({
      Authorization: "Bearer top-secret-jwt",
      Cookie: "sid=secret-cookie",
      "X-Api-Key": "secret-api-key",
      Accept: "application/octet-stream",
    });
    expect(scrubbed).toEqual({ Accept: "application/octet-stream" });

    // SSRF guard blocks loopback, RFC1918, and cloud metadata endpoints when private/loopback are disallowed (fmDownloadOps default)
    for (const unsafeUrl of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:8080/internal",
      "http://10.0.0.5/private",
      "http://[::1]:3000/secret",
      "http://localhost:9200/_nodes",
    ]) {
      expect(() =>
        assertSafeDownloadUrlSync(unsafeUrl, {
          allowPrivateNetworks: false,
          allowLoopback: false,
        }),
      ).toThrow();
    }

    const root = makeTempRoot("fm-sec15-");
    const dlData = nodePath.join(root, "dl-data");
    const dlFolder = nodePath.join(root, "Downloads");
    fs.mkdirSync(dlData, { recursive: true });
    fs.mkdirSync(dlFolder, { recursive: true });

    const dlListFile = nodePath.join(dlData, "file_manager_downloads.json");
    const mgr = new DownloadManager({
      file: dlListFile,
      defaultFolder: dlFolder,
      allowPrivateNetworks: false,
      allowLoopback: false,
    });
    mgr.add([
      {
        url: "https://93.184.216.34/archive.bin",
        start: false,
        headers: {
          Authorization: "Bearer must-never-touch-disk",
          "X-Custom-Trace": "trace-123",
        },
      },
    ]);
    mgr.closeAll();
    const persistedJson = fs.readFileSync(dlListFile, "utf8");
    expect(persistedJson).not.toContain("must-never-touch-disk");
    expect(persistedJson).toContain("Authorization");
    expect(persistedJson).toContain("trace-123");

    // Guardrail check: writeAtomic read-back verify callback MUST run and block replacement when it throws
    const atomicTarget = nodePath.join(root, "vault-check.bin");
    fs.writeFileSync(atomicTarget, "original-bytes");
    let verifyCalled = false;
    expect(() =>
      writeAtomic(atomicTarget, Buffer.from("corrupt-candidate"), {
        verify: (readBack) => {
          verifyCalled = true;
          expect(readBack.toString("utf8")).toBe("corrupt-candidate");
          throw new Error("Simulated read-back verification failure");
        },
      }),
    ).toThrow(/Simulated read-back verification failure/);
    expect(verifyCalled).toBe(true);
    expect(fs.readFileSync(atomicTarget, "utf8")).toBe("original-bytes");

    // SecretsService.rekey purges .bak files even when rotateKey === false
    const secData = nodePath.join(root, "sec-data");
    const secCtx = createContext({
      home: root,
      dataDir: secData,
      secrets: { fastKdf: true } as never,
    });
    const svc = new SecretsService(secCtx);
    await svc.create({
      password: "CorrectHorseBatteryStaple!1",
      strength: "standard",
    });
    await svc.updateSettings({ autoLockMinutes: 5 });
    svc.lock();
    await svc.unlock({ password: "CorrectHorseBatteryStaple!1" });
    expect(svc.status().backups).toBeGreaterThan(0);

    const rekeyRes = await svc.rekey({
      password: "CorrectHorseBatteryStaple!1",
      strength: "strong",
      rotateKey: false,
    });
    expect(rekeyRes.backupsDeleted).toBeGreaterThan(0);
    expect(svc.status().backups).toBe(0);
    svc.lock();
  });

  test("[V-SEC-17], [V-SEC-18], [V-SEC-20] Pandoc --, ffmpeg concat escaping, Serve $HOME/.ssh & LAN gate, prototype guards, and \\\\?\\UNC\\ paths", async () => {
    // 1. Pandoc passes "--" when input filename starts with "-"
    const mdHtml = DOC_DEFS.find((d) => d.id === "doc-html")!;
    const writtenFiles: Array<{ name: string; content: string }> = [];
    const mockBuildCtx: BuildContext = {
      inputs: ["-flag-injection.md"],
      output: "/tmp/out.html",
      title: "Test",
      opts: { toc: false, method: "copy", size: "1920x1080" },
      tmpFile: (name: string, content = "") => {
        writtenFiles.push({ name, content });
        return `/tmp/${name}`;
      },
      platform: "darwin",
      pdfEngine: null,
    } as unknown as BuildContext;
    const args = mdHtml.engines[0]!.argv!(mockBuildCtx) as string[];
    const dashDashIdx = args.indexOf("--");
    expect(dashDashIdx).toBeGreaterThan(-1);
    expect(args.indexOf("-flag-injection.md")).toBeGreaterThan(dashDashIdx);

    // 2. FFmpeg vid-concat rejects newline injection and escapes backslashes & quotes
    const vidConcat = VIDEO_DEFS.find((d) => d.id === "vid-concat")!;
    expect(() =>
      vidConcat.engines[0]!.argv!({
        ...mockBuildCtx,
        inputs: ["/tmp/good.mp4", "/tmp/bad\nfile '/etc/passwd'.mp4"],
      }),
    ).toThrow();
    writtenFiles.length = 0;
    vidConcat.engines[0]!.argv!({
      ...mockBuildCtx,
      inputs: ["C:\\clips\\part'1.mp4", "C:\\clips\\part2.mp4"],
    });
    expect(writtenFiles[0]!.content).toContain(
      "C:'\\\\'clips'\\\\'part'\\''1.mp4",
    );

    // 3. Serve blocks $HOME/.ssh & requires NEEDS_CONFIRM for LAN binding
    const root = makeTempRoot("fm-sec17-serve-");
    const sshDir = nodePath.join(root, ".ssh");
    const projDir = nodePath.join(root, "project");
    fs.mkdirSync(sshDir, { recursive: true });
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(nodePath.join(projDir, "index.html"), "<h1>ok</h1>");
    const serveCtx = createContext({
      home: root,
      dataDir: nodePath.join(root, ".data"),
      requireServeLanConfirm: true,
    });
    await expect(
      serveOperations["serve/start"]!(serveCtx, {
        path: sshDir,
        kind: "static",
      }),
    ).rejects.toMatchObject({ code: "PROTECTED" });
    await expect(
      serveOperations["serve/start"]!(serveCtx, {
        path: projDir,
        kind: "static",
        lan: true,
      }),
    ).rejects.toMatchObject({ code: "NEEDS_CONFIRM" });

    // 4. Prototype-pollution guards in fmConvMarkup.parseIni and fmPreview.parseBinaryPlist
    const iniParsed = parseIni(
      "[__proto__]\npolluted = yes\n[safe]\nconstructor = no\nok = 1\n",
      true,
      new Notes(),
    ) as Record<string, Record<string, unknown>>;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(iniParsed.safe?.ok).toBe(1);

    // Minimal bplist00 with odd-length UTF-16BE string object does not throw RangeError
    const header = Buffer.from("bplist00", "ascii");
    const body = Buffer.from([0x61, 0x00]); // marker 0x61 (UTF-16 length 1 char = 2 bytes, truncated to 1 byte)
    const offsetTable = Buffer.from([0x08]);
    const trailer = Buffer.alloc(32, 0);
    trailer[6] = 1;
    trailer[7] = 1;
    trailer.writeBigUInt64BE(1n, 8);
    trailer.writeBigUInt64BE(0n, 16);
    trailer.writeBigUInt64BE(10n, 24);
    expect(() =>
      parseBinaryPlist(Buffer.concat([header, body, offsetTable, trailer])),
    ).not.toThrow();

    // 5. Windows \\?\ and \\?\UNC\localhost\C$ protected path normalization
    expect(
      protectedReason(
        "\\\\?\\C:\\Windows\\System32",
        { platform: "win32", home: "C:\\Users\\Alice" },
        "modify",
      ),
    ).toBeTruthy();
    expect(
      protectedReason(
        "\\\\?\\UNC\\localhost\\c$\\Windows",
        { platform: "win32", home: "C:\\Users\\Alice" },
        "modify",
      ),
    ).toBeTruthy();
  });
});

describe("File Manager QA & UI Regressions (Slice 2)", () => {
  test("[V-QA-06] runBionicWhisper returns honest ASR_ENGINE_UNAVAILABLE instead of LLM fabrication when Whisper is absent", async () => {
    const root = makeTempRoot("fm-qa06-asr-");
    const wavPath = nodePath.join(root, "sample.wav");
    fs.writeFileSync(
      wavPath,
      encodeFloat32SamplesToWav(new Float32Array(2400), 24000),
    );
    const emptyBin = nodePath.join(root, "empty-bin");
    fs.mkdirSync(emptyBin, { recursive: true });
    const prevPath = process.env.PATH;
    process.env.PATH = emptyBin;
    try {
      const ctx = createContext({
        home: root,
        sandboxRoot: root,
        dataDir: nodePath.join(root, ".data"),
        toolDirs: [emptyBin],
      });
      await expect(runBionicWhisper(ctx, wavPath)).rejects.toMatchObject({
        code: "ASR_ENGINE_UNAVAILABLE",
      });
    } finally {
      process.env.PATH = prevPath;
    }
  });

  test("[V-QA-06] Document convert preserves duplicate headings & Acknowledgments unless cleanEpubClutter is opted in", async () => {
    const root = makeTempRoot("fm-qa06-md-");
    const mdPath = nodePath.join(root, "notes.md");
    const mdText = [
      "# Overview",
      "Important project body paragraph.",
      "",
      "## Acknowledgments",
      "Thanks to every contributor — this section must NOT be truncated!",
      "",
      "# Overview",
      "Second legitimate section with a repeated heading.",
    ].join("\n");
    fs.writeFileSync(mdPath, mdText, "utf8");

    const ctx = createContext({
      home: root,
      dataDir: nodePath.join(root, ".data"),
      toolDirs: [nodePath.join(root, "no-external-tools")],
    });
    const job = await startConvert(ctx, {
      action: "doc-html",
      paths: [mdPath],
      options: {},
    });
    await ctx.jobs.whenDone(job.id);
    const outHtmlPath = nodePath.join(root, "notes.html");
    expect(fs.existsSync(outHtmlPath)).toBe(true);
    const htmlOut = fs.readFileSync(outHtmlPath, "utf8");
    expect(htmlOut).toContain("Thanks to every contributor");
    expect(htmlOut).toContain("Second legitimate section");
  });

  test("[V-QA-06] stageRenames two-phase rollback restores all files intact on cyclic collision", async () => {
    const root = makeTempRoot("fm-qa06-rename-");
    const a = nodePath.join(root, "a.txt");
    const b = nodePath.join(root, "b.txt");
    const c = nodePath.join(root, "c.txt");
    const occupied = nodePath.join(root, "occupied.txt");
    fs.writeFileSync(a, "content-A");
    fs.writeFileSync(b, "content-B");
    fs.writeFileSync(c, "content-C");
    fs.writeFileSync(occupied, "content-OCCUPIED");

    const ctx = createContext({
      home: root,
      dataDir: nodePath.join(root, ".data"),
    });
    await expect(
      stageRenames(ctx, [
        { from: a, to: b },
        { from: b, to: c },
        { from: c, to: occupied },
      ]),
    ).rejects.toMatchObject({ code: "EXISTS" });

    expect(fs.readFileSync(a, "utf8")).toBe("content-A");
    expect(fs.readFileSync(b, "utf8")).toBe("content-B");
    expect(fs.readFileSync(c, "utf8")).toBe("content-C");
    expect(fs.readFileSync(occupied, "utf8")).toBe("content-OCCUPIED");
  });

  test("[V-QA-07] & [V-QA-15] Vault scanSource Windows check, Redis sourceName clone, PG JSONB ?, and Windows terminal wsl getter", async () => {
    // 1. Vault scanSource rejects Windows reserved device names directly and inside folders
    const vaultRoot = makeTempRoot("fm-qa07-vault-");
    const badFolder = nodePath.join(vaultRoot, "project");
    fs.mkdirSync(badFolder, { recursive: true });
    await expect(
      scanSource(nodePath.join(badFolder, "CON.txt")),
    ).rejects.toThrow();
    if (process.platform !== "win32") {
      fs.writeFileSync(nodePath.join(badFolder, "CON.txt"), "reserved");
      await expect(scanSource(badFolder)).rejects.toThrow();
    }

    // 2. Redis -> SQLite clone preserves raw HGETALL field names (e.g. "profile:email")
    const cloneRoot = makeTempRoot("fm-qa07-clone-");
    const fakeRedisClient: CloneRedisClient = {
      async send(cmd: string, args: string[]) {
        const u = cmd.toUpperCase();
        if (u === "SCAN") return ["0", ["acct:1"]];
        if (u === "TYPE") return "hash";
        if (u === "PTTL") return -1;
        if (u === "HGETALL" && args[0] === "acct:1") {
          return ["profile:email", "ada@lovelace.org", "login-count", "7"];
        }
        return null;
      },
      close() {},
    };
    const ctx = createContext({
      home: cloneRoot,
      dataDir: nodePath.join(cloneRoot, ".data"),
      databases: {
        secretStore: async () => new FakeKeychain(),
        studioCommand: () => fakeStudioCommand(),
        openAdapter: (cfg: ConnectionConfig) => new SqliteAdapter(cfg),
        openRedis: async () => fakeRedisClient,
      },
    });
    const savedRedis = (await databaseOperations["db/profile/save"]!(ctx, {
      profile: {
        name: "Local Redis",
        engine: "redis",
        host: "127.0.0.1",
        port: 6379,
      },
    })) as { profile: { id: string } };

    const inspected = await inspectCloneSource(ctx, {
      kind: "profile",
      profileId: savedRedis.profile.id,
    });
    const acctObj = inspected.objects.find((o) => o.name === "acct")!;
    expect(
      acctObj.columns.some(
        (c) => c.sourceName === "profile:email" && c.name === "profile_email",
      ),
    ).toBe(true);

    const cloneRes = await runClone(ctx, {
      source: { kind: "profile", profileId: savedRedis.profile.id },
      target: { kind: "newSqlite", folder: cloneRoot, name: "cloned.sqlite" },
      options: {
        tables: ["acct"],
        conflictMode: "replace",
        contentMode: "all",
      },
    });
    expect(cloneRes.summary.rowsCopied).toBe(1);
    const verifyDb = new Database(nodePath.join(cloneRoot, "cloned.sqlite"), {
      readonly: true,
    });
    const clonedRow = verifyDb.query('SELECT * FROM "acct"').get() as Record<
      string,
      unknown
    >;
    verifyDb.close();
    expect(clonedRow.profile_email).toBe("ada@lovelace.org");
    expect(String(clonedRow["login-count"] ?? clonedRow.login_count)).toBe("7");

    // 3. adaptSqlPlaceholders preserves PostgreSQL JSONB ?, ?|, ?& and string literals
    const adaptedSql = adaptSqlPlaceholders(
      "postgres",
      `SELECT payload ? 'role' AS has_role, payload ?| array['a','b'] FROM users WHERE org_id = ? AND note = 'what?' AND active = ?`,
      2,
    );
    expect(adaptedSql).toBe(
      `SELECT payload ? 'role' AS has_role, payload ?| array['a','b'] FROM users WHERE org_id = $1 AND note = 'what?' AND active = $2`,
    );

    // 4. TerminalHub preserves live `wsl` getter on Windows PTY sessions
    let liveWsl: WslInfo | null = null;
    const hub = createTerminalHub(4, undefined, () => ({
      pid: 9999,
      get cwd() {
        return "C:\\Users\\Alice";
      },
      get shell() {
        return (liveWsl ? "wsl" : "powershell") as "wsl" | "powershell";
      },
      get wsl() {
        return liveWsl;
      },
      write() {},
      resize() {},
      close() {},
    }));
    const winCtx = createContext({
      platform: "win32",
      home: cloneRoot,
      dataDir: nodePath.join(cloneRoot, ".termdata"),
    });
    const sess = hub.open(winCtx, {
      cwd: cloneRoot,
      cols: 80,
      rows: 24,
      cwdPollMs: 250,
      onData() {},
      onExit() {},
    });
    expect(sess).not.toBeNull();
    expect(sess!.wsl).toBeNull();
    liveWsl = { distro: "Ubuntu", driveRoot: "/mnt/" };
    expect(sess!.wsl).toEqual({ distro: "Ubuntu", driveRoot: "/mnt/" });
    expect(sess!.shell).toBe("wsl");
    hub.closeAll();
  });

  test("[V-SEC-17], [V-SEC-18], [V-QA-07], [V-QA-15] UI modules: codeAiChat href allowlist + docPath guard, codePreview lightbox & null-proto parser, 70k-row QuickLook grid", async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://127.0.0.1:4321/",
    });
    const prevWin = globalThis.window;
    const prevDoc = globalThis.document;
    const prevHTMLElement = globalThis.HTMLElement;
    const prevNode = globalThis.Node;
    (globalThis as Record<string, unknown>).window = dom.window;
    (globalThis as Record<string, unknown>).document = dom.window.document;
    (globalThis as Record<string, unknown>).HTMLElement =
      dom.window.HTMLElement;
    (globalThis as Record<string, unknown>).Node = dom.window.Node;

    try {
      const codePreview =
        await import("../resources/file_manager/ui/codePreview.js");
      const qlFormat =
        await import("../resources/file_manager/ui/quicklookFormat.js");
      const codeAiChat =
        await import("../resources/file_manager/ui/codeAiChat.js");

      // 1. Structured preview ignores __proto__ / constructor without polluting Object.prototype
      const structHost = dom.window.document.createElement("div");
      codePreview.renderStructuredDataPreview(
        structHost,
        "[__proto__]\nadmin = true\n[app]\nname = Studio\n",
        "toml",
      );
      expect(({} as Record<string, unknown>).admin).toBeUndefined();
      expect(structHost.textContent).toContain("Studio");

      // 2. Lightbox cleans up previous keydown listener and ignores editable inputs
      const lb1 = codePreview.openMarkdownImageLightbox("/a.png", "First");
      const lb2 = codePreview.openMarkdownImageLightbox("/b.png", "Second");
      expect(lb1.isConnected).toBe(false);
      expect(lb2.dataset.zoom).toBe("100");
      const inputEl = dom.window.document.createElement("input");
      dom.window.document.body.appendChild(inputEl);
      inputEl.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { key: "+", bubbles: true }),
      );
      expect(lb2.dataset.zoom).toBe("100");
      dom.window.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
      );
      expect(lb2.isConnected).toBe(false);

      // 3. 70,000-row spreadsheet/CSV QuickLook renders without stack overflow
      const hugeRows = Array.from({ length: 70_000 }, (_, i) => [
        String(i),
        `val-${i}`,
      ]);
      const card = qlFormat.renderRichQuickLook(
        { name: "huge.csv", path: "/tmp/huge.csv", ext: ".csv" },
        {
          rich: {
            kind: "spreadsheet",
            format: "CSV",
            sheets: [
              {
                name: "Sheet1",
                headers: ["id", "value"],
                rows: hugeRows,
                totalRows: 70_000,
                truncated: false,
              },
            ],
            meta: [],
          },
        },
      );
      expect(card).toBeTruthy();

      // 4. codeAiChat blocks unsafe schemes in Markdown links & guards duplicate basenames on Apply
      const chatHost = dom.window.document.createElement("div");
      dom.window.document.body.appendChild(chatHost);
      const toasts: string[] = [];
      let currentDoc = {
        id: 1,
        name: "index.ts",
        path: "/repo/src/index.ts",
        text: "export const x = 1;\n",
        readOnly: false,
      };
      const wrongDoc = {
        id: 2,
        name: "index.ts",
        path: "/repo/tests/index.ts",
        text: "export const x = 1;\n",
        readOnly: false,
      };
      let editorText = currentDoc.text;
      const unsafeScheme = ["java", "script:alert(1)"].join("");
      const chat = codeAiChat.createCodeAiChat({
        getDoc: () => currentDoc,
        docs: {
          get: (id: number) => (id === 2 ? wrongDoc : null),
          byPath: (p: string) => (p === wrongDoc.path ? wrongDoc : null),
          list: () => [wrongDoc],
          activate: () => {},
          snapshot: () => {},
        },
        getEditor: () => ({
          getText: () => editorText,
          getSelection: () => ({ start: 0, end: 0 }),
          setText: (txt: string) => {
            editorText = txt;
          },
          replaceRange: (_f: number, _t: number, txt: string) => {
            editorText = txt;
          },
        }),
        toast: (msg: string) => toasts.push(msg),
      });
      chat.el.hidden = false;
      chatHost.appendChild(chat.el);
      chat.pushMessage({
        role: "assistant",
        content: `[Bad](${unsafeScheme}) and [Good](https://example.com)\n\n\`\`\`ts\nexport const x = 2;\n\`\`\`\n`,
      });

      const anchors = Array.from(chatHost.querySelectorAll("a"));
      expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
        "https://example.com",
      ]);
      expect(chatHost.querySelector(".is-blocked-href")).toBeTruthy();

      // Switch active tab to /repo/tests/index.ts (same basename "index.ts", different path!) while /repo/src/index.ts is closed
      currentDoc = wrongDoc;
      const applyBtn = chatHost.querySelector(
        '[data-ai-apply-selected-hunks="true"]',
      ) as HTMLButtonElement | null;
      expect(applyBtn).toBeTruthy();
      applyBtn?.click();
      expect(editorText).toBe("export const x = 1;\n");
      expect(toasts.some((t) => t.includes("/repo/src/index.ts"))).toBe(true);
    } finally {
      (globalThis as Record<string, unknown>).window = prevWin;
      (globalThis as Record<string, unknown>).document = prevDoc;
      (globalThis as Record<string, unknown>).HTMLElement = prevHTMLElement;
      (globalThis as Record<string, unknown>).Node = prevNode;
      dom.window.close();
    }
  });
});

describe("File Manager Performance & Resource Optimizations (Slice 2)", () => {
  test("[V-OPT-02] Backend & UI computeLineDiff use Myers O((N+M)D) without 250k-cell whole-file fallback", async () => {
    const codeExtras =
      await import("../resources/file_manager/ui/codeExtras.js");
    const baseLines = Array.from({ length: 2500 }, (_, i) => `line-${i}`);
    const oldLines = [...baseLines];
    const newLines = [...baseLines];
    newLines[1] = "line-1-edited";
    newLines[2498] = "line-2498-edited";

    const t0 = performance.now();
    const backendRows = computeBackendLineDiff(oldLines, newLines, 5000);
    const uiDiff = codeExtras.computeLineDiff(
      oldLines.join("\n"),
      newLines.join("\n"),
    );
    const elapsedMs = performance.now() - t0;

    expect(backendRows.filter((r) => r.type === "add").length).toBe(2);
    expect(backendRows.filter((r) => r.type === "del").length).toBe(2);
    expect(uiDiff.added).toBe(2);
    expect(uiDiff.removed).toBe(2);
    expect(elapsedMs).toBeLessThan(250);
  });

  test("[V-OPT-03], [V-OPT-09], [V-OPT-10], [V-OPT-13], [V-OPT-16] formatDate cache, publishFile EEXIST, breachCheck 1MiB cap, Bionic cache disposal, NetScan single DNS lookup, and BMP scanline builder", async () => {
    // 1. formatDate cached Intl.DateTimeFormat accuracy
    const uiUtil = await import("../resources/file_manager/ui/util.js");
    const refNow = new Date(2026, 5, 15, 14, 30, 0).getTime();
    expect(uiUtil.formatDate(refNow - 60_000, refNow, "en-US")).toStartWith(
      "Today, ",
    );
    expect(uiUtil.formatDate(refNow - 86_400_000, refNow, "en-US")).toStartWith(
      "Yesterday, ",
    );
    expect(
      uiUtil.formatDate(new Date(2024, 0, 5, 12, 0).getTime(), refNow, "en-US"),
    ).toContain("2024");

    // 2. publishFile preserves non-overwrite guarantee (EEXIST) asynchronously
    const root = makeTempRoot("fm-opt09-");
    const staged = nodePath.join(root, "staged.txt");
    const existing = nodePath.join(root, "final.txt");
    await fsp.writeFile(staged, "new-data");
    await fsp.writeFile(existing, "must-survive");
    await expect(publishFile(staged, existing)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await fsp.readFile(existing, "utf8")).toBe("must-survive");

    // 3. MAX_CHUNKS & breachCheck 1 MiB response cap
    expect(MAX_CHUNKS).toBe(16_384);
    let chunksPulled = 0;
    const item = {
      id: "item-1",
      type: "login",
      title: "Login",
      favorite: false,
      tags: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      passwordUpdatedAt: "2026-01-01T00:00:00Z",
      deletedAt: null,
      fields: { password: "password123" },
      custom: [],
      notes: "",
      history: [],
    } as unknown as SecretItem;
    await expect(
      breachCheck([item], {
        fetch: async () => {
          const hugeChunk = new Uint8Array(600 * 1024).fill(65);
          const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
              chunksPulled++;
              if (chunksPulled > 10) {
                controller.close();
                return;
              }
              controller.enqueue(hugeChunk);
            },
          });
          return new Response(stream, { status: 200 });
        },
      }),
    ).rejects.toMatchObject({ code: "BREACH_UNAVAILABLE" });
    expect(chunksPulled).toBeLessThanOrEqual(3);

    // 4. Per-FmContext Bionic audio cache isolation & temp dir cleanup on dispose
    const ctxA = createContext({
      platform: "win32",
      home: root,
      sandboxRoot: root,
      dataDir: nodePath.join(root, ".dataA"),
    });
    const ctxB = createContext({
      platform: "win32",
      home: root,
      sandboxRoot: root,
      dataDir: nodePath.join(root, ".dataB"),
    });
    const prevFallbackEnv = process.env.BIONIC_FORCE_FALLBACK_TTS;
    process.env.BIONIC_FORCE_FALLBACK_TTS = "1";
    try {
      const spk = await runBionicSpeech(ctxA, {
        input: "Hello world",
        mode: "speaker",
      });
      const cachedEntry = getCachedBionicAudioFile(spk.audioId, ctxA);
      expect(cachedEntry && fs.existsSync(cachedEntry.absPath)).toBe(true);
      expect(getCachedBionicAudioFile(spk.audioId, ctxB)).toBeNull();
      for (const fn of ctxA.disposers) await fn();
      expect(cachedEntry && fs.existsSync(cachedEntry.absPath)).toBe(false);
    } finally {
      if (prevFallbackEnv === undefined) {
        delete process.env.BIONIC_FORCE_FALLBACK_TTS;
      } else {
        process.env.BIONIC_FORCE_FALLBACK_TTS = prevFallbackEnv;
      }
    }

    // 5. NetScan pre-resolves hostname ONCE before multi-port fan-out
    let dnsLookups = 0;
    const connectedTargets: string[] = [];
    const scanCtx = createContext({
      home: root,
      dataDir: nodePath.join(root, ".netdata"),
    });
    const st = netState(scanCtx);
    st.dnsLookup = async (host: string) => {
      dnsLookups++;
      expect(host).toBe("example.internal");
      return { address: "203.0.113.42" };
    };
    st.makeSocket = () => {
      const sock = new EventEmitter() as unknown as Socket & EventEmitter;
      (sock as unknown as { destroy: () => void }).destroy = () => {};
      (
        sock as unknown as {
          connect: (
            portOrOpts: number | { host?: string; port?: number },
            hostArg?: string,
          ) => Socket;
        }
      ).connect = (portOrOpts, hostArg) => {
        const h =
          typeof portOrOpts === "object" && portOrOpts !== null
            ? (portOrOpts.host ?? "")
            : (hostArg ?? "");
        connectedTargets.push(h);
        queueMicrotask(() => {
          sock.emit(
            "error",
            Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }),
          );
        });
        return sock;
      };
      return sock;
    };
    const scanTask = startScan(scanCtx, {
      host: "example.internal",
      mode: "list",
      ports: "80,443,8080",
    });
    await scanTask.finished;
    expect(netSnapshot(scanTask).state).toBe("done");
    expect(dnsLookups).toBe(1);
    expect(connectedTargets).toEqual([
      "203.0.113.42",
      "203.0.113.42",
      "203.0.113.42",
    ]);

    // 6. buildReadAlongSlideBmpFallback produces valid 24-bit BMP header & scanlines
    const bmp = buildReadAlongSlideBmpFallback({
      timeline: {
        totalDurationMs: 2000,
        cues: [
          {
            text: "Fast scanline copy",
            words: [{ word: "Fast" }, { word: "scanline" }, { word: "copy" }],
          },
        ],
      } as never,
      slide: {
        cueIndex: 0,
        activeWordInCue: 1,
        spokenWordsInCue: 1,
        startMs: 0,
        endMs: 1000,
      } as never,
      aspect: {
        width: 320,
        height: 180,
        lineSpacingPx: 36,
      } as never,
      videoTheme: "midnight",
    });
    expect(bmp.subarray(0, 2).toString("ascii")).toBe("BM");
    expect(bmp.readInt32LE(18)).toBe(320);
    expect(Math.abs(bmp.readInt32LE(22))).toBe(180);
  });

  test("[V-OPT-15] fmServer serves /ui/* with ETag (304) + gzip while keeping Cache-Control: no-store & CSP on / and /api/*", async () => {
    const root = makeTempRoot("fm-opt15-srv-");
    const srv = await startFileManagerServer({
      port: 0,
      context: {
        home: root,
        dataDir: nodePath.join(root, ".data"),
      },
    });
    try {
      // 1. Static /ui/util.js gets private, no-cache + ETag + gzip + CSP
      const r1 = await fetch(`${srv.url}/ui/util.js`, {
        headers: { "Accept-Encoding": "gzip" },
      });
      expect(r1.status).toBe(200);
      expect(r1.headers.get("cache-control")).toBe("private, no-cache");
      const etag = r1.headers.get("etag");
      expect(etag).toBeTruthy();
      expect(r1.headers.get("content-security-policy")).toContain(
        "script-src 'self'",
      );
      const bodyText = await r1.text();
      expect(bodyText).toContain("export function formatDate");

      // Conditional request with If-None-Match -> 304 Not Modified
      const r304 = await fetch(`${srv.url}/ui/util.js`, {
        headers: { "If-None-Match": etag! },
      });
      expect(r304.status).toBe(304);
      expect(r304.headers.get("content-security-policy")).toContain(
        "script-src 'self'",
      );

      // 2. STRICT GUARDRAIL: "/" (carrying per-session token) & "/api/*" MUST remain Cache-Control: no-store!
      const rIndex = await fetch(`${srv.url}/`, {
        headers: { "Accept-Encoding": "gzip" },
      });
      expect(rIndex.status).toBe(200);
      expect(rIndex.headers.get("cache-control")).toContain("no-store");
      expect(rIndex.headers.get("etag")).toBeNull();

      const rApi = await fetch(`${srv.url}/api/places`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fm-token": srv.token,
        },
        body: "{}",
      });
      expect(rApi.status).toBe(200);
      expect(rApi.headers.get("cache-control")).toContain("no-store");
    } finally {
      await srv.stop();
    }
  });
});
