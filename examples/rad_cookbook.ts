/**
 * RAD Cookbook: Complete runnable demonstrations of all 10 Bun System Utilities
 * AND all 37 Rapid Application Development (RAD) Utility Modules.
 *
 * Run with: bun run examples/rad_cookbook.ts
 */

import { colors } from "../src/shared/colors.ts";
import { searchFiles } from "../src/features/fd/fdCoordinator.ts";
import { buildReplacerRegex, replaceText } from "../src/features/sd/sdDoers.ts";
import { readManifest, resolveGraveyardDir } from "../src/features/rip/ripDoers.ts";
import { getProcesses } from "../src/features/procs/procsCoordinator.ts";
import { shouldTrigger } from "../src/features/watchexec/watchexecDoers.ts";
import { computeCodeStats } from "../src/features/tokei/tokeiCoordinator.ts";
import { analyzeDirectory } from "../src/features/gdu/gduCoordinator.ts";
import { formatBytes } from "../src/features/gdu/gduDoers.ts";
import { queryIp } from "../src/features/ipinfo/ipinfoCoordinator.ts";
import { enumerateDomain } from "../src/features/subfinder/subfinderCoordinator.ts";
import { lookupDomain } from "../src/features/doggo/doggoCoordinator.ts";
import { rad } from "../src/features/rad/index.ts";

console.log(colors.bold(colors.cyan("\n=======================================================")));
console.log(colors.bold(colors.cyan("   Bun System Utilities: Part 1 - 10 Core CLI Tools    ")));
console.log(colors.bold(colors.cyan("=======================================================\n")));

// 1. fd
const fdResults = await searchFiles({ pattern: "package.json", rootPath: ".", hidden: false, absolute: false });
console.log(colors.green("1. [fd] Found package.json:"), fdResults[0]?.displayPath);

// 2. sd
const sdReplaced = replaceText("Hello World", buildReplacerRegex("World", true, "g"), "Bun");
console.log(colors.green("2. [sd] Replace text:"), sdReplaced);

// 3. rip
const graveyard = resolveGraveyardDir();
const manifest = await readManifest(graveyard);
console.log(colors.green("3. [rip] Graveyard active records:"), manifest.records.length);

// 4. procs
const procs = await getProcesses();
console.log(colors.green("4. [procs] Active system processes:"), procs.length);

// 5. watchexec
const willTrigger = shouldTrigger("src/index.ts", ["ts"], ["node_modules"]);
console.log(colors.green("5. [watchexec] src/index.ts triggers watcher:"), willTrigger);

// 6. tokei
const stats = await computeCodeStats({ paths: ["src"], sort: "code", showFiles: false, hidden: false });
console.log(colors.green("6. [tokei] Languages detected:"), stats.map((s) => `${s.language} (${s.stats.code} LOC)`).join(", "));

// 7. gdu
const gduRoot = await analyzeDirectory({ targetDir: ".", nonInteractive: true, showItemCount: true, showRelativeSize: true, showDisks: false, summarize: false, noHidden: true, si: false, ignoreDirs: [] });
console.log(colors.green("7. [gdu] Current dir size:"), formatBytes(gduRoot.size));

// 8. ipinfo
const ip = await queryIp("1.1.1.1");
console.log(colors.green("8. [ipinfo] 1.1.1.1 Org:"), ip.org);

// 9. subfinder
const subs = await enumerateDomain("example.com", 5000, false);
console.log(colors.green("9. [subfinder] example.com subdomains:"), subs.map((s) => s.host).join(", "));

// 10. doggo
const dns = await lookupDomain("example.com", "A");
console.log(colors.green("10. [doggo] example.com A records:"), dns.answers.map((a) => a.data).join(", "), `(${dns.queryTimeMs}ms)`);

console.log(colors.bold(colors.cyan("\n=======================================================")));
console.log(colors.bold(colors.cyan("   Bun System Utilities: Part 2 - 44 RAD Utility Modules ")));
console.log(colors.bold(colors.cyan("=======================================================\n")));

// 1. fileutils
const tmpPath = "/tmp/bun_cookbook.json";
await rad.fileutils.saveJson(tmpPath, { tool: "bun_sys_utils", version: "1.0.0" });
const loaded = await rad.fileutils.loadJson<{ tool: string }>(tmpPath);
console.log(colors.green("1.  [fileutils] JSON persistence:"), loaded.tool);

// 2. sqliteutils
const db = rad.sqliteutils.openDb(":memory:");
rad.sqliteutils.createKvTable(db, "config");
rad.sqliteutils.setKv(db, "config", "env", "production");
console.log(colors.green("2.  [sqliteutils] Native SQLite KV:"), rad.sqliteutils.getKv(db, "config", "env"));
rad.sqliteutils.closeDb(db);

// 3. strutils
console.log(colors.green("3.  [strutils] Slugify & Mask:"), rad.strutils.slugify("Rapid App Dev 2026!"), "|", rad.strutils.maskEmail("developer@example.com"));

// 4. arrutils / sliceutils (including es-toolkit at, compact, chunk)
const chunks = rad.arrutils.chunk([1, 2, 3, 4, 5, 6], 3);
const lastItem = rad.arrutils.at(["alpha", "beta", "gamma"], -1);
console.log(colors.green("4.  [arrutils] Chunking & at(-1):"), JSON.stringify(chunks), "at(-1):", lastItem);

// 5. envutils
rad.envutils.set("RAD_APP", "BunSysUtils");
console.log(colors.green("5.  [envutils] Typed env:"), rad.envutils.getStr("RAD_APP"));

// 6. cryptoutils
console.log(colors.green("6.  [cryptoutils] SHA-256:"), rad.cryptoutils.sha256("bun").slice(0, 16) + "...");

// 7. timeutils
console.log(colors.green("7.  [timeutils] Relative time:"), rad.timeutils.timeAgo(new Date(Date.now() - 3600 * 1000)));

// 8. httputils
console.log(colors.green("8.  [httputils] Query string:"), rad.httputils.buildQuery({ search: "rad", page: 1 }));

// 9. cliutils
console.log(colors.green("9.  [cliutils] Sparkline:"), rad.cliutils.renderSparkline([1, 3, 6, 8, 4, 9, 2]));

// 10. sysutils
console.log(colors.green("10. [sysutils] System cores:"), rad.sysutils.getSystemInfo().cpuCount);

// 11. netutils
console.log(colors.green("11. [netutils] Local IP:"), rad.netutils.getLocalIp());

// 12. validutils
console.log(colors.green("12. [validutils] Email valid:"), rad.validutils.isEmail("team@bun.sh"));

// 13. structutils
const stack = new rad.structutils.SimpleStack<string>();
stack.push("A");
stack.push("B");
console.log(colors.green("13. [structutils] Stack pop:"), stack.pop());

// 14. statutils
console.log(colors.green("14. [statutils] Mean & Median:"), rad.statutils.mean([10, 20, 30]), rad.statutils.median([10, 20, 30]));

// 15. stateutils
const stateStore = new rad.stateutils.AppStateStore("cookbook_demo", { visits: 1 }, { customPath: "/tmp/state_demo.json" });
console.log(colors.green("15. [stateutils] Managed store:"), stateStore.get().visits);

// 16. cacheutils
const lru = new rad.cacheutils.LRUCache<string, string>(2);
lru.set("x", "1");
console.log(colors.green("16. [cacheutils] LRU get:"), lru.get("x"));

// 17. semverutils
console.log(colors.green("17. [semverutils] Satisfies range:"), rad.semverutils.satisfiesRange("2.4.1", "^2.0.0"));

// 18. flowutils
const limiter = new rad.flowutils.RateLimiter(10, 5);
console.log(colors.green("18. [flowutils] Rate limit allowed:"), limiter.allow(1));

// 19. templateutils
console.log(colors.green("19. [templateutils] Template:"), rad.templateutils.renderTemplate("Hello {{name}}!", { name: "Developer" }));

// 20. colorutils
const hexRgb = rad.colorutils.hexToRgb("#ff5733");
console.log(colors.green("20. [colorutils] Hex to RGB:"), JSON.stringify(hexRgb));

// 21. archiveutils
const zipData = rad.archiveutils.zipFiles([{ name: "readme.txt", data: "RAD Zip Demo" }]);
const zipEntries = await rad.archiveutils.listZipEntries(zipData);
console.log(colors.green("21. [archiveutils] Zip entries:"), zipEntries.join(", "));

// 22. asyncutils
const parallelRes = await rad.asyncutils.parallelMap([2, 4, 6], 2, async (x) => x * 10);
console.log(colors.green("22. [asyncutils] Parallel map:"), JSON.stringify(parallelRes));

// 23. regexutils
console.log(colors.green("23. [regexutils] Find first digit:"), rad.regexutils.findFirst(/\d+/, "version 42 released"));

// 24. mockutils
const mock = rad.mockutils.mockUser();
console.log(colors.green("24. [mockutils] Synthetic user:"), mock.name, `<${mock.email}>`);

// 25. logutils
console.log(colors.green("25. [logutils] LogLevel defined:"), rad.logutils.LogLevel.INFO);

// 26. tomlutils
const toml = rad.tomlutils.parseToml("[app]\nport = 5000");
console.log(colors.green("26. [tomlutils] TOML parsed port:"), rad.tomlutils.getInt(toml, "app.port"));

// 27. htmlutils
console.log(colors.green("27. [htmlutils] Strip HTML tags:"), rad.htmlutils.stripTags("<p>Hello <b>Bun</b></p>"));

// 28. bitutils
const bs = new rad.bitutils.BitSet(8);
bs.set(2);
console.log(colors.green("28. [bitutils] BitSet bit 2 set:"), bs.get(2));

// 29. compressutils
const compressedStr = rad.compressutils.gzipCompressString("Bun RAD Utilities");
console.log(colors.green("29. [compressutils] Gzip restored:"), rad.compressutils.gzipDecompressString(compressedStr));

// 30. tarutils
const tar = rad.tarutils.packTarBytes([{ name: "log.txt", data: "System ok" }]);
console.log(colors.green("30. [tarutils] TAR entry name:"), rad.tarutils.unpackTarBytes(tar)[0]?.name);

// 31. mathutils
console.log(colors.green("31. [mathutils] GCD & LCM:"), rad.mathutils.gcd(24, 18), rad.mathutils.lcm(24, 18));

// 32. cronutils
console.log(colors.green("32. [cronutils] Cron to human:"), rad.cronutils.cronToHuman("*/10 * * * *"));

// 33. urlutils
console.log(colors.green("33. [urlutils] Redact credentials:"), rad.urlutils.redactCredentials("postgres://user:secret@localhost:5432/db"));

// 34. jwtutils
const jwt = rad.jwtutils.signJwt({ id: "demo" }, "supersecret");
console.log(colors.green("34. [jwtutils] Verified JWT id:"), rad.jwtutils.verifyJwt(jwt, "supersecret").id);

// 35. eventutils
const ee = rad.eventutils.newEmitter();
let evOutput = "";
ee.on("ping", (d: string) => { evOutput = d; });
ee.emit("ping", "pong");
console.log(colors.green("35. [eventutils] EventEmitter:"), evOutput);

// 36. diffutils
const diff = rad.diffutils.unifiedDiff("abc", "abd");
console.log(colors.green("36. [diffutils] Unified diff lines:"), diff.split("\n").length);

// 37. graphutils
const dag = rad.graphutils.newGraph<string>();
dag.addEdge("A", "B");
dag.addEdge("B", "C");
console.log(colors.green("37. [graphutils] Topo sort:"), dag.topologicalSort().join(" -> "));

// 38. globutils (Bun.Glob)
const globs = await rad.globutils.findFiles("*.json", ".");
console.log(colors.green("38. [globutils] Bun.Glob matches:"), globs.join(", "));

// 39. shellutils (Bun.$)
const whichBun = rad.shellutils.whichCmd("bun");
const shRes = await rad.shellutils.execCmd("echo 'Bun Shell Speed'");
console.log(colors.green("39. [shellutils] Bun path:"), whichBun, "stdout:", shRes.stdout.trim());

// 40. hashutils (Bun.hash & BloomFilter)
const wyHashVal = rad.hashutils.wyhash("bun");
const bloom = rad.hashutils.createBloomFilter(50, 0.01);
bloom.add("apple");
console.log(colors.green("40. [hashutils] wyhash:"), wyHashVal.toString(), "bloom has apple:", bloom.has("apple"));

// 41. serverutils (Bun.serve)
const srvRouter = rad.serverutils.createRouter();
srvRouter.get("/ping", () => new Response("pong"));
const srv = rad.serverutils.serveHttp({ router: srvRouter });
const srvRes = await fetch(`${srv.url}/ping`);
console.log(colors.green("41. [serverutils] Bun.serve response:"), await srvRes.text());
srv.stop();

// 42. transpileutils (Bun.Transpiler)
const transpiled = rad.transpileutils.transpileTs("const num: number = 42; export default num;");
const scanned = rad.transpileutils.analyzeCode(transpiled);
console.log(colors.green("42. [transpileutils] AST exports:"), scanned.exports.join(", "));

// 43. objutils (es-toolkit/object)
const userDoc = { meta: { author: { name: "Antigravity", role: "admin" } } };
const authorName = rad.objutils.get(userDoc, "meta.author.name");
const isEq = rad.objutils.isEqual({ a: [1, 2] }, { a: [1, 2] });
console.log(colors.green("43. [objutils] Deep get:"), authorName, "isEqual:", isEq);

// 44. fnutils (es-toolkit/function)
const calc = rad.fnutils.pipe(10, (n: number) => n * 2, (n: number) => n + 5);
console.log(colors.green("44. [fnutils] Piped function result (10 * 2 + 5):"), calc);

console.log(colors.bold(colors.green("\n✓ All 10 CLI Utilities and 44 RAD Modules verified and running successfully!\n")));


