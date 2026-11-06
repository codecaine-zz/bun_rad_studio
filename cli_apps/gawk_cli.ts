#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import * as nodePath from "node:path";
import { SimpleCLI } from "../src/index.ts";

const app = SimpleCLI.newApp("gawk-cli", "1.0.0").setDescription(
  "Pattern Scanning & Text Processing Engine",
);

app.addFlagString("pattern", "p", "", "Filter regex pattern");
app.addFlagString("file", "f", "", "Input text file");
app.addFlagString(
  "field",
  "c",
  "1",
  "Field index (1-based) or comma-separated list to print",
);
app.addFlagString("delim", "F", " ", "Field delimiter");
app.addFlagString("text", "t", "", "Inline text to process");
app.addFlagBool(
  "sum",
  "s",
  false,
  "Calculate numeric sum and average of extracted field",
);

if (!app.parseCli()) process.exit(0);

app.banner("Gawk Text Processing Engine", "v1.0.0 - Pattern Matcher");

const pattern = app.getFlagString("pattern");
const fileFlag =
  app.getFlagString("file") || (app.getPositionalArgs()[0] ?? "");
const fieldSpec = app.getFlagString("field") || "1";
const delim = app.getFlagString("delim");
const inlineText = app.getFlagString("text");
const computeSum = app.getFlagBool("sum");

if (fileFlag || inlineText) {
  let rawText = inlineText ? inlineText.replace(/\\n/g, "\n") : "";
  if (fileFlag && existsSync(nodePath.resolve(fileFlag))) {
    rawText = readFileSync(nodePath.resolve(fileFlag), "utf8");
  }
  const rowFilter = pattern ? new RegExp(pattern, "i") : null;
  const indices = fieldSpec
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));

  const lines = rawText.split(/\r?\n/).filter((l) => l.length > 0);
  const extractedRows: string[] = [];
  const numericValues: number[] = [];

  for (const line of lines) {
    if (rowFilter && !rowFilter.test(line)) continue;
    const cols = delim === " " ? line.trim().split(/\s+/) : line.split(delim);
    const picked = indices.map((idx) => {
      if (idx === 0) return line;
      if (idx < 0) return cols[cols.length + idx] ?? "";
      return cols[idx - 1] ?? "";
    });
    const joined = picked.join(delim === " " ? "\t" : delim);
    extractedRows.push(joined);
    for (const val of picked) {
      const num = Number(val);
      if (val.trim() !== "" && Number.isFinite(num)) numericValues.push(num);
    }
  }

  for (const row of extractedRows) {
    console.log(row);
  }

  if (computeSum && numericValues.length > 0) {
    const sum = numericValues.reduce((a, b) => a + b, 0);
    const avg = sum / numericValues.length;
    app.info(
      `Numeric summary (N=${numericValues.length}): SUM=${sum} | AVG=${avg.toFixed(2)}`,
    );
  }
}

app.info("Text scanning and formatting active.");
