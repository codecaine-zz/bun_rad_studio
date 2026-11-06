#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as nodePath from "node:path";
import { SimpleCLI } from "../src/index.ts";

const app = SimpleCLI.newApp("pandoc-cli", "1.0.0").setDescription(
  "Universal Document & Markup Converter",
);

app.addFlagString(
  "from",
  "f",
  "markdown",
  "Source format (markdown, html, txt)",
);
app.addFlagString(
  "to",
  "t",
  "html",
  "Target format (html, markdown, txt, json)",
);
app.addFlagString("input", "i", "", "Input document file path");
app.addFlagString("output", "o", "", "Output file path");
app.addFlagString("text", "s", "", "Inline document text to convert");

if (!app.parseCli()) process.exit(0);

function inlineMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function markdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const hMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (hMatch) {
      const level = hMatch[1]!.length;
      out.push(`<h${level}>${inlineMarkdown(hMatch[2]!)}</h${level}>`);
      continue;
    }
    const liMatch = /^[-*+]\s+(.+)$/.exec(line);
    if (liMatch) {
      out.push(`<li>${inlineMarkdown(liMatch[1]!)}</li>`);
      continue;
    }
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  return out.join("\n");
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function stripToPlainText(doc: string): string {
  return doc
    .replace(/<[^>]+>/g, "")
    .replace(/^[#*>-]+\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

app.banner("Pandoc Document Studio", "v1.0.0 - Markup Converter");

const from = app.getFlagString("from").toLowerCase();
const to = app.getFlagString("to").toLowerCase();
const inputPath =
  app.getFlagString("input") || (app.getPositionalArgs()[0] ?? "");
const outputPath = app.getFlagString("output");
const inlineText = app.getFlagString("text");

let sourceContent = "";
if (inputPath && existsSync(nodePath.resolve(inputPath))) {
  sourceContent = readFileSync(nodePath.resolve(inputPath), "utf8");
} else if (inlineText) {
  sourceContent = inlineText.replace(/\\n/g, "\n");
}

if (sourceContent) {
  let converted = sourceContent;
  if ((from === "markdown" || from === "md") && to === "html") {
    converted = markdownToHtml(sourceContent);
  } else if (from === "html" && (to === "markdown" || to === "md")) {
    converted = htmlToMarkdown(sourceContent);
  } else if (to === "txt" || to === "plain" || to === "text") {
    converted = stripToPlainText(sourceContent);
  } else if (to === "json") {
    converted = JSON.stringify(
      {
        from,
        to,
        lines: sourceContent.split(/\r?\n/),
        htmlPreview: markdownToHtml(sourceContent),
      },
      null,
      2,
    );
  }

  if (outputPath) {
    const resolvedOut = nodePath.resolve(outputPath);
    writeFileSync(resolvedOut, converted, "utf8");
    app.success(`Converted ${from} -> ${to} and wrote ${resolvedOut}`);
  } else {
    console.log(converted);
  }
}

app.info("Document processor initialized.");
