// RAD tutorial 10: the rad utility modules.
// Run it with:  bun run examples/rad_tutorial/10_rad_modules.ts
import { rad } from "../../src/features/rad/index.ts";

// Text and data
console.log(rad.strutils.slugify("Rapid App Dev 2026!"));
console.log(rad.strutils.maskEmail("developer@example.com"));
console.log(JSON.stringify(rad.arrutils.chunk([1, 2, 3, 4, 5, 6], 3)));
console.log(rad.arrutils.at(["alpha", "beta", "gamma"], -1));
console.log(rad.validutils.isEmail("team@bun.sh"));

// Files and a database
await rad.fileutils.saveJson("/tmp/rad_tutorial.json", { tool: "rad", version: "1.0.0" });
console.log((await rad.fileutils.loadJson<{ tool: string }>("/tmp/rad_tutorial.json")).tool);
const db = rad.sqliteutils.openDb(":memory:");
rad.sqliteutils.createKvTable(db, "config");
rad.sqliteutils.setKv(db, "config", "env", "production");
console.log(rad.sqliteutils.getKv(db, "config", "env"));

// Maths, time, versions
console.log(rad.statutils.mean([10, 20, 30]), rad.statutils.median([10, 20, 30]));
console.log(rad.timeutils.timeAgo(new Date(Date.now() - 3600 * 1000)));
console.log(rad.semverutils.satisfiesRange("2.4.1", "^2.0.0"));
console.log(rad.cliutils.renderSparkline([1, 3, 6, 8, 4, 9, 2]));

// Security and the web
console.log(rad.cryptoutils.sha256("bun").slice(0, 16) + "...");
console.log(rad.httputils.buildQuery({ search: "rad", page: 1 }));

// Caches and limits
const lru = new rad.cacheutils.LRUCache<string, string>(2);
lru.set("x", "1");
console.log(lru.get("x"));
