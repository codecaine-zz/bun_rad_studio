import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { gzipSync } from "zlib";
import { Notes } from "../src/features/filemanager/fmConvCommon";
import { writeXlsx } from "../src/features/filemanager/fmConvSheet";
import { zipBuffer } from "../src/features/filemanager/fmConvZip";
import { createContext } from "../src/features/filemanager/fmCore";
import { decodeImageToPngBuffer } from "../src/features/filemanager/fmImageConvert";
import { previewFile } from "../src/features/filemanager/fmList";

const root = mkdtempSync(join(tmpdir(), "fm-rich-preview-"));
const ctx = createContext({ home: root, dataDir: join(root, "data") });

afterAll(() => {
  mock.restore();
  rmSync(root, { recursive: true, force: true });
});

describe("pure-TS image format decoders (fmImageConvert)", () => {
  test("decodes X11 Pixmap (.xpm) into PNG bytes", () => {
    const xpm = [
      "/* XPM */",
      "static char * sample_xpm[] = {",
      '"2 2 2 1",',
      '"a c #ff0000",',
      '"b c #00ff00",',
      '"ab",',
      '"ba"',
      "};",
    ].join("\n");
    const png = decodeImageToPngBuffer(Buffer.from(xpm, "ascii"), "xpm");
    expect(png).not.toBeNull();
    expect(png![0]).toBe(0x89);
    expect(png![1]).toBe(0x50);
  });

  test("decodes Wireless Bitmap (.wbmp) into PNG bytes", () => {
    const wbmp = Buffer.from([0x00, 0x00, 0x08, 0x02, 0b10101010, 0b01010101]);
    const png = decodeImageToPngBuffer(wbmp, "wbmp");
    expect(png).not.toBeNull();
    expect(png![0]).toBe(0x89);
  });

  test("decodes Radiance RGBE HDR (.hdr) into PNG bytes", () => {
    const hdrHeader = "#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 2\n";
    const pixels = new Uint8Array([200, 100, 50, 128, 50, 150, 220, 129]);
    const buf = Buffer.concat([Buffer.from(hdrHeader, "ascii"), Buffer.from(pixels)]);
    const png = decodeImageToPngBuffer(buf, "hdr");
    expect(png).not.toBeNull();
    expect(png![0]).toBe(0x89);
  });

  test("decodes ZSoft PCX (.pcx) into PNG bytes", () => {
    const pcx = Buffer.alloc(128 + 8);
    pcx[0] = 0x0a; // ZSoft magic
    pcx[1] = 5; // v3.0
    pcx[2] = 1; // RLE
    pcx[3] = 8; // 8 bits per plane
    // xmin=0, ymin=0, xmax=1 (width 2), ymax=0 (height 1)
    pcx[8] = 1;
    pcx[9] = 0;
    pcx[10] = 0;
    pcx[11] = 0;
    pcx[65] = 3; // 3 planes (24-bit RGB)
    pcx[66] = 2; // bytesPerLine = 2
    // 3 scanline planes of 2 bytes each: R=[255,0], G=[0,255], B=[0,128]
    pcx.set([0xc1, 255, 0, 0, 0xc1, 255, 0, 128], 128);
    const png = decodeImageToPngBuffer(pcx, "pcx");
    expect(png).not.toBeNull();
    expect(png![0]).toBe(0x89);
  });

  test("decodes Windows Icon (.ico) with DIB payload into PNG bytes", () => {
    const dibSize = 40 + 4 + 4;
    const ico = new Uint8Array(6 + 16 + dibSize);
    const dv = new DataView(ico.buffer);
    dv.setUint16(0, 0, true);
    dv.setUint16(2, 1, true); // ICO
    dv.setUint16(4, 1, true); // 1 image
    ico[6] = 1; // width 1
    ico[7] = 1; // height 1
    dv.setUint16(10, 1, true); // planes
    dv.setUint16(12, 32, true); // bpp
    dv.setUint32(14, dibSize, true);
    dv.setUint32(18, 22, true); // offset
    dv.setUint32(22, 40, true);
    dv.setInt32(26, 1, true); // width 1
    dv.setInt32(30, 2, true); // height 1*2 (XOR + AND)
    dv.setUint16(34, 1, true);
    dv.setUint16(36, 32, true);
    ico.set([0, 128, 255, 255], 62);
    const png = decodeImageToPngBuffer(Buffer.from(ico), "ico");
    expect(png).not.toBeNull();
    expect(png![0]).toBe(0x89);
  });
});

describe("universal rich file previews (fmPreview & previewFile)", () => {
  test("spreadsheet (.xlsx) produces multi-sheet rich preview", async () => {
    const p = join(root, "budget.xlsx");
    writeFileSync(
      p,
      writeXlsx(
        [
          {
            name: "Expenses",
            columns: ["Item", "Cost"],
            rows: [
              ["Server", 120],
              ["Domain", 15],
            ],
          },
        ],
        new Notes(),
      ),
    );
    const prev = await previewFile(ctx, p);
    expect(prev.rich?.kind).toBe("spreadsheet");
    if (prev.rich?.kind === "spreadsheet") {
      expect(prev.rich.sheets.length).toBe(1);
      expect(prev.rich.sheets[0]!.name).toBe("Expenses");
      expect(prev.rich.sheets[0]!.headers).toEqual(["Item", "Cost"]);
      expect(prev.rich.sheets[0]!.rows).toEqual([
        ["Server", "120"],
        ["Domain", "15"],
      ]);
    }
  });

  test("Word document (.docx) produces structured blocks and plainText", async () => {
    const p = join(root, "proposal.docx");
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Project Proposal</w:t></w:r></w:p>
          <w:p><w:r><w:t>This is the first paragraph.</w:t></w:r></w:p>
          <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Milestone 1</w:t></w:r></w:p>
        </w:body>
      </w:document>`;
    writeFileSync(p, zipBuffer([{ name: "word/document.xml", data: new TextEncoder().encode(docXml) }]));
    const prev = await previewFile(ctx, p);
    expect(prev.rich?.kind).toBe("document");
    if (prev.rich?.kind === "document") {
      expect(prev.rich.plainText).toContain("Project Proposal");
      expect(prev.rich.blocks.some((b) => b.type === "h1" && b.text.includes("Project Proposal"))).toBe(true);
      expect(prev.rich.blocks.some((b) => b.type === "li" && b.text.includes("Milestone 1"))).toBe(true);
    }
  });

  test("Rich Text Format (.rtf) strips font/color tables and extracts clean paragraphs", async () => {
    const p = join(root, "letter.rtf");
    writeFileSync(
      p,
      "{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}\\b Welcome Header\\b0\\par Second paragraph with \\'e9 accent.\\par}",
    );
    const prev = await previewFile(ctx, p);
    expect(prev.rich?.kind).toBe("document");
    if (prev.rich?.kind === "document") {
      expect(prev.rich.plainText).toContain("Welcome Header");
      expect(prev.rich.plainText).toContain("Second paragraph with é accent.");
      expect(prev.rich.plainText).not.toContain("Arial");
    }
  });

  test("FictionBook (.fb2) extracts book title, author, and body blocks", async () => {
    const p = join(root, "story.fb2");
    writeFileSync(
      p,
      `<?xml version="1.0" encoding="utf-8"?>
      <FictionBook>
        <description><title-info><book-title>Star Voyage</book-title><author><first-name>Ada</first-name><last-name>Lovelace</last-name></author></title-info></description>
        <body><section><title><p>Chapter One</p></title><p>The ship launched at dawn.</p></section></body>
      </FictionBook>`,
    );
    const prev = await previewFile(ctx, p);
    expect(prev.rich?.kind).toBe("document");
    if (prev.rich?.kind === "document") {
      expect(prev.rich.title).toBe("Star Voyage");
      expect(prev.rich.author).toBe("Ada Lovelace");
      expect(prev.rich.plainText).toContain("The ship launched at dawn.");
    }
  });

  test("Presentation (.pptx) extracts slide titles, bullet points, and speaker notes", async () => {
    const p = join(root, "deck.pptx");
    const slide1 = `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:sp><p:txBody><a:p><a:r><a:t>Quarterly Review</a:t></a:r></a:p></p:txBody></p:sp>
          <p:sp><p:txBody><a:p><a:r><a:t>Revenue grew 28%</a:t></a:r></a:p><a:p><a:r><a:t>Launched 3 products</a:t></a:r></a:p></p:txBody></p:sp>
        </p:spTree></p:cSld>
      </p:sld>`;
    const notes1 = `<?xml version="1.0" encoding="UTF-8"?>
      <p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Emphasize customer retention.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
      </p:notes>`;
    const bytes = zipBuffer([
      { name: "ppt/slides/slide1.xml", data: new TextEncoder().encode(slide1) },
      { name: "ppt/notesSlides/notesSlide1.xml", data: new TextEncoder().encode(notes1) },
    ]);
    writeFileSync(p, bytes);
    const prev = await previewFile(ctx, p);
    expect(prev.rich?.kind).toBe("presentation");
    if (prev.rich?.kind === "presentation") {
      expect(prev.rich.slides.length).toBe(1);
      expect(prev.rich.slides[0]!.title).toBe("Quarterly Review");
      expect(prev.rich.slides[0]!.bullets).toEqual(["Revenue grew 28%", "Launched 3 products"]);
      expect(prev.rich.slides[0]!.notes).toContain("Emphasize customer retention.");
    }
  });

  test("PDF (.pdf) extracts page count and text from BT/ET content streams", async () => {
    const p = join(root, "invoice.pdf");
    const pdf = `%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Count 1 /MediaBox [0 0 612 792] >> endobj
3 0 obj << /Length 44 >>
stream
BT
/F1 12 Tf
72 720 Td
(Invoice #4092 Paid) Tj
ET
endstream
endobj
%%EOF`;
    writeFileSync(p, pdf);
    const prev = await previewFile(ctx, p);
    expect(prev.rich?.kind).toBe("pdf");
    if (prev.rich?.kind === "pdf") {
      expect(prev.rich.pages).toBe(1);
      expect(prev.rich.extractedText).toContain("Invoice #4092 Paid");
    }
  });

  test("SQLite database (.sqlite) inspects tables, columns, row counts, and sample rows", async () => {
    const p = join(root, "app.sqlite");
    const db = new Database(p);
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT)");
    db.run("INSERT INTO users (name, role) VALUES ('Ada', 'admin'), ('Grace', NULL)");
    db.close();
    const prev = await previewFile(ctx, p);
    expect(prev.rich?.kind).toBe("sqlite");
    if (prev.rich?.kind === "sqlite") {
      expect(prev.rich.tables.length).toBe(1);
      expect(prev.rich.tables[0]!.name).toBe("users");
      expect(prev.rich.tables[0]!.rowCount).toBe(2);
      expect(prev.rich.tables[0]!.rows[0]).toEqual(["1", "Ada", "admin"]);
      expect(prev.rich.tables[0]!.rows[1]).toEqual(["2", "Grace", "—"]);
    }
  });

  test("Gzip file (.gz) decompresses inner text for immediate preview", async () => {
    const p = join(root, "server.log.gz");
    writeFileSync(p, gzipSync(Buffer.from("2026-10-18 INFO Boot sequence complete\n")));
    const prev = await previewFile(ctx, p);
    expect(prev.rich?.kind).toBe("archive");
    if (prev.rich?.kind === "archive") {
      expect(prev.rich.innerName).toBe("server.log");
      expect(prev.rich.innerText).toContain("Boot sequence complete");
    }
  });

  test("Structured data (.yaml, .toml, .ini, .jsonl) parses into trees and tables", async () => {
    const yamlPath = join(root, "config.yaml");
    writeFileSync(yamlPath, "service:\n  name: api-gateway\n  port: 8080\n");
    const yamlPrev = await previewFile(ctx, yamlPath);
    expect(yamlPrev.rich?.kind).toBe("structured");
    if (yamlPrev.rich?.kind === "structured") {
      expect((yamlPrev.rich.data as any).service.name).toBe("api-gateway");
      expect((yamlPrev.rich.data as any).service.port).toBe(8080);
    }

    const jsonlPath = join(root, "events.jsonl");
    writeFileSync(jsonlPath, '{"id":1,"event":"login"}\n{"id":2,"event":"purchase"}\n');
    const jsonlPrev = await previewFile(ctx, jsonlPath);
    expect(jsonlPrev.rich?.kind).toBe("structured");
    if (jsonlPrev.rich?.kind === "structured") {
      expect(jsonlPrev.rich.table?.headers).toEqual(["id", "event"]);
      expect(jsonlPrev.rich.table?.rows).toEqual([
        ["1", "login"],
        ["2", "purchase"],
      ]);
    }
  });

  test("Jupyter Notebook (.ipynb) parses markdown and code cells with outputs", async () => {
    const p = join(root, "analysis.ipynb");
    writeFileSync(
      p,
      JSON.stringify({
        nbformat: 4,
        nbformat_minor: 5,
        metadata: { kernelspec: { display_name: "Python 3" } },
        cells: [
          { cell_type: "markdown", source: ["# Data Analysis\n", "Summary of findings."] },
          {
            cell_type: "code",
            execution_count: 1,
            source: ["print(6 * 7)"],
            outputs: [{ output_type: "stream", text: ["42\n"] }],
          },
        ],
      }),
    );
    const prev = await previewFile(ctx, p);
    expect(prev.rich?.kind).toBe("notebook");
    if (prev.rich?.kind === "notebook") {
      expect(prev.rich.cells.length).toBe(2);
      expect(prev.rich.cells[1]!.outputs[0]!.text?.trim()).toBe("42");
    }
  });

  test("Subtitles (.srt), Calendar (.ics), Contact (.vcf), 3D Model (.obj), Diff (.patch), and Log (.log) produce rich previews", async () => {
    const srtPath = join(root, "movie.srt");
    writeFileSync(srtPath, "1\n00:00:01,000 --> 00:00:03,500\nHello world!\n");
    const srtPrev = await previewFile(ctx, srtPath);
    expect(srtPrev.rich?.kind).toBe("subtitles");

    const icsPath = join(root, "invite.ics");
    writeFileSync(icsPath, "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Design Sync\nDTSTART:20261018T150000Z\nLOCATION:Room 42\nEND:VEVENT\nEND:VCALENDAR\n");
    const icsPrev = await previewFile(ctx, icsPath);
    expect(icsPrev.rich?.kind).toBe("calendar");
    if (icsPrev.rich?.kind === "calendar") {
      expect(icsPrev.rich.events[0]!.summary).toBe("Design Sync");
    }

    const vcfPath = join(root, "ada.vcf");
    writeFileSync(vcfPath, "BEGIN:VCARD\nFN:Ada Lovelace\nEMAIL:ada@analytical.engine\nTEL:+44-1234\nEND:VCARD\n");
    const vcfPrev = await previewFile(ctx, vcfPath);
    expect(vcfPrev.rich?.kind).toBe("contact");
    if (vcfPrev.rich?.kind === "contact") {
      expect(vcfPrev.rich.contacts[0]!.fullName).toBe("Ada Lovelace");
    }

    const objPath = join(root, "triangle.obj");
    writeFileSync(objPath, "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    const objPrev = await previewFile(ctx, objPath);
    expect(objPrev.rich?.kind).toBe("model3d");
    if (objPrev.rich?.kind === "model3d") {
      expect(objPrev.rich.vertices.length).toBe(3);
      expect(objPrev.rich.edges.length).toBe(3);
    }

    const diffPath = join(root, "fix.patch");
    writeFileSync(diffPath, "--- a/app.ts\n+++ b/app.ts\n@@ -1,2 +1,2 @@\n-const x = 1;\n+const x = 2;\n");
    const diffPrev = await previewFile(ctx, diffPath);
    expect(diffPrev.rich?.kind).toBe("diff");

    const logPath = join(root, "system.log");
    writeFileSync(logPath, "2026-10-18 INFO Listening on :8080\n2026-10-18 ERROR Connection refused\n");
    const logPrev = await previewFile(ctx, logPath);
    expect(logPrev.rich?.kind).toBe("log");
    if (logPrev.rich?.kind === "log") {
      expect(logPrev.rich.counts.error).toBe(1);
      expect(logPrev.rich.counts.info).toBe(1);
    }
  });

  test("Binary file (.bin / .wasm) generates hex + ASCII dump and extracted strings", async () => {
    const wasmPath = join(root, "module.wasm");
    const bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, ...new TextEncoder().encode("exported_func")]);
    writeFileSync(wasmPath, bytes);
    const prev = await previewFile(ctx, wasmPath);
    expect(prev.type).toBe("binary");
    expect(prev.rich?.kind).toBe("binary");
    if (prev.rich?.kind === "binary") {
      expect(prev.rich.formatLabel).toContain("WebAssembly");
      expect(prev.rich.hexLines.length).toBeGreaterThan(0);
      expect(prev.rich.strings).toContain("exported_func");
    }
  });
});

describe("UI renderers for rich Quick Look and Details panel (quicklookFormat.js)", () => {
  test("renderRichQuickLook and renderRichInfoSummary build interactive DOM views without 'null' or 'undefined'", async () => {
    mock.module("../resources/file_manager/ui/terminal.js", () => ({
      terminalShell: () => "posix",
      terminalWsl: () => ({}),
      terminalAvailable: () => false,
      typeInTerminal: () => false,
      showTerminal() {},
      hideTerminal() {},
      toggleTerminal() {},
      wireTerminal() {},
      isTerminalOpen: () => false,
    }));
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const g = globalThis as any;
    const keys = ["document", "window", "Node", "HTMLElement", "Element"] as const;
    const saved = new Map<string, PropertyDescriptor | undefined>();
    for (const k of keys) {
      saved.set(k, Object.getOwnPropertyDescriptor(g, k));
      Object.defineProperty(g, k, { value: (dom.window as any)[k], configurable: true, writable: true });
    }
    try {
      const { renderRichQuickLook, renderRichInfoSummary } = await import("../resources/file_manager/ui/quicklookFormat.js");
      for (const name of ["budget.xlsx", "proposal.docx", "deck.pptx", "app.sqlite", "analysis.ipynb", "triangle.obj", "module.wasm"]) {
        const path = join(root, name);
        const preview = await previewFile(ctx, path);
        const entry = { name, path, size: preview.size, isDir: false, label: name, mtimeMs: Date.now() };
        const qlNode = renderRichQuickLook(entry, preview);
        expect(qlNode, name).toBeTruthy();
        expect(qlNode.textContent, name).not.toMatch(/\bnull\b|\bundefined\b|\[object/i);

        const infoNode = renderRichInfoSummary(entry, preview);
        expect(infoNode, name).toBeTruthy();
        expect(infoNode.textContent, name).not.toMatch(/\bnull\b|\bundefined\b|\[object/i);
      }
    } finally {
      for (const k of keys) {
        const d = saved.get(k);
        if (d) Object.defineProperty(g, k, d);
        else delete g[k];
      }
    }
  });
});
