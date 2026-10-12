import { readFileSync } from "node:fs";

const files = (await Bun.$`git ls-files '*.ts'`.text()).trim().split("\n").filter((f) => !f.includes("node_modules"));
const declRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/g;
const vagueNames = new Set(["res", "tmp", "temp", "val", "obj", "arr", "ret", "cb", "fn", "cnt", "str", "num", "el", "ev", "idx", "ctx"]);
const counts = { single: new Map<string, number>(), vague: new Map<string, number>(), snake: 0, total: 0 };
const perFile = new Map<string, number>();
const snakeExamples: string[] = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  let fileSingle = 0;
  for (const m of src.matchAll(declRe)) {
    const name = m[1]!;
    counts.total++;
    if (name.length === 1 && name !== "_") { counts.single.set(name, (counts.single.get(name) ?? 0) + 1); fileSingle++; }
    else if (vagueNames.has(name)) counts.vague.set(name, (counts.vague.get(name) ?? 0) + 1);
    else if (/^[a-z]+(_[a-z0-9]+)+$/.test(name)) { counts.snake++; if (snakeExamples.length < 8) snakeExamples.push(`${file}: ${name}`); }
  }
  if (fileSingle) perFile.set(file, fileSingle);
}
const top = (m: Map<string, number>, n = 10) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}=${v}`).join(", ");
console.log("files:", files.length, "declarations:", counts.total);
console.log("single-letter total:", [...counts.single.values()].reduce((a, b) => a + b, 0), "|", top(counts.single));
console.log("vague total:", [...counts.vague.values()].reduce((a, b) => a + b, 0), "|", top(counts.vague));
console.log("snake_case variables:", counts.snake, snakeExamples);
console.log("top files (single-letter decls):");
for (const [f, n] of [...perFile].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(" ", n, f);
