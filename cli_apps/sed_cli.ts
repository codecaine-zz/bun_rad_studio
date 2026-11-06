#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as nodePath from "node:path";
import { SimpleCLI } from "../src/index.ts";

const app = SimpleCLI.newApp("sed-cli", "1.0.0").setDescription(
  "Stream Editor & Line Transformation Utility",
);

app.addFlagString(
  "expr",
  "e",
  "s/foo/bar/g",
  "Sed substitution or line expression",
);
app.addFlagString("file", "f", "", "Input file to transform");
app.addFlagString("text", "t", "", "Inline text to transform");
app.addFlagBool(
  "in-place",
  "i",
  false,
  "Write transformed output back to the input file",
);

if (!app.parseCli()) process.exit(0);

function applySedExpression(
  input: string,
  expr: string,
): { output: string; replacements: number } {
  const trimmed = expr.trim();
  let replacements = 0;

  if (trimmed.startsWith("s") && trimmed.length >= 4) {
    const delim = trimmed[1]!;
    const parts: string[] = [];
    let cur = "";
    for (let i = 2; i < trimmed.length; i++) {
      const ch = trimmed[i]!;
      if (ch === "\\" && i + 1 < trimmed.length && trimmed[i + 1] === delim) {
        cur += delim;
        i++;
      } else if (ch === delim) {
        parts.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    parts.push(cur);
    if (parts.length >= 2) {
      const pattern = parts[0]!;
      const replacement = (parts[1] ?? "")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t");
      const rawFlags = parts[2] ?? "";
      const flags =
        (rawFlags.includes("g") ? "g" : "") +
        (rawFlags.includes("i") ? "i" : "") +
        (rawFlags.includes("m") ? "m" : "");
      const re = new RegExp(pattern, flags || undefined);
      const lines = input.split(/\r?\n/);
      const transformed = lines.map((line) =>
        line.replace(re, (...args) => {
          replacements++;
          return replacement.replace(/&/g, args[0] as string);
        }),
      );
      return { output: transformed.join("\n"), replacements };
    }
  }

  const lineOp = /^\/(.+)\/([dp])$/.exec(trimmed);
  if (lineOp) {
    const re = new RegExp(lineOp[1]!);
    const op = lineOp[2]!;
    const lines = input.split(/\r?\n/);
    const kept = lines.filter((line) => {
      const hit = re.test(line);
      if (hit) replacements++;
      return op === "d" ? !hit : hit;
    });
    return { output: kept.join("\n"), replacements };
  }

  return { output: input, replacements: 0 };
}

app.banner("Stream Editor CLI (sed-cli)", "v1.0.0");

const expr = app.getFlagString("expr");
const fileFlag =
  app.getFlagString("file") || (app.getPositionalArgs()[0] ?? "");
const inlineText = app.getFlagString("text");
const inPlace = app.getFlagBool("in-place");

if (fileFlag || inlineText) {
  let sourceText = inlineText || "";
  let resolvedFile = "";
  if (fileFlag && existsSync(nodePath.resolve(fileFlag))) {
    resolvedFile = nodePath.resolve(fileFlag);
    sourceText = readFileSync(resolvedFile, "utf8");
  }
  const { output, replacements } = applySedExpression(sourceText, expr);
  if (resolvedFile && inPlace) {
    writeFileSync(resolvedFile, output, "utf8");
    app.success(
      `Transformed ${resolvedFile} in-place (${replacements} match(es) updated)`,
    );
  } else {
    console.log(output);
    app.info(`Stream transformations active (${replacements} match(es)).`);
  }
} else {
  app.info("Stream transformations active.");
}
