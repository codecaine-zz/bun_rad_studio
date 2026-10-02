import { mkdir, copyFile as fsCopyFile, rename, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

// Doer: Ensure directory exists asynchronously without blocking the event loop
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== "EEXIST") throw err;
  }
}

// Doer: Format human-readable byte sizes asynchronously
export async function fileSizeHuman(bytesOrPath: number | string): Promise<string> {
  let bytes: number;
  if (typeof bytesOrPath === "string") {
    try {
      const s = await stat(bytesOrPath);
      bytes = s.size;
    } catch {
      throw new Error(`[fileutils] File not found: ${bytesOrPath}`);
    }
  } else {
    bytes = bytesOrPath;
  }

  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let u = -1;
  let size = bytes;
  do {
    size /= 1024;
    u++;
  } while (size >= 1024 && u < units.length - 1);
  return `${size.toFixed(1)} ${units[u]}`;
}

// Doer: Save data to JSON file asynchronously
export async function saveJson(filePath: string, data: unknown, pretty = true): Promise<void> {
  await ensureDir(dirname(filePath));
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await Bun.write(filePath, content);
}

// Doer: Load data from JSON file with optional fallback asynchronously
export async function loadJson<T>(filePath: string, fallback?: T): Promise<T> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      if (fallback !== undefined) return fallback;
      throw new Error(`[fileutils] JSON file not found: ${filePath}`);
    }
    return (await file.json()) as T;
  } catch (err: any) {
    if (fallback !== undefined) return fallback;
    throw new Error(`[fileutils] Failed to load JSON from ${filePath}: ${err.message}`);
  }
}

// Doer: Read text lines from file asynchronously
export async function readLines(filePath: string): Promise<string[]> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`[fileutils] File not found: ${filePath}`);
  }
  const text = await file.text();
  return text.split(/\r?\n/);
}

// Doer: Write lines to file asynchronously
export async function writeLines(filePath: string, lines: string[]): Promise<void> {
  await ensureDir(dirname(filePath));
  await Bun.write(filePath, lines.join("\n"));
}

// Doer: Append single line to file asynchronously
export async function appendLine(filePath: string, line: string): Promise<void> {
  await ensureDir(dirname(filePath));
  const file = Bun.file(filePath);
  const exists = await file.exists();
  const text = exists ? `\n${line}` : line;
  const original = exists ? await file.text() : "";
  await Bun.write(filePath, original + text);
}

// Doer: Copy file from source to destination asynchronously
export async function copyFile(src: string, dest: string): Promise<void> {
  const file = Bun.file(src);
  if (!(await file.exists())) {
    throw new Error(`[fileutils] Source file does not exist: ${src}`);
  }
  await ensureDir(dirname(dest));
  await fsCopyFile(src, dest);
}

// Doer: Move file from source to destination asynchronously
export async function moveFile(src: string, dest: string): Promise<void> {
  const file = Bun.file(src);
  if (!(await file.exists())) {
    throw new Error(`[fileutils] Source file does not exist: ${src}`);
  }
  await ensureDir(dirname(dest));
  await rename(src, dest);
}

// Doer: Parse CSV lines into 2D string matrix (pure, CPU non-blocking)
export function parseCsvString(csvText: string, delimiter = ","): string[][] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const row: string[] = [];
    let insideQuotes = false;
    let currentCell = "";
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
        row.push(currentCell.trim());
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
    row.push(currentCell.trim());
    return row;
  });
}

// Doer: Format 2D string matrix to CSV text
export function formatCsvString(rows: string[][], delimiter = ","): string {
  return rows
    .map((row) =>
      row
        .map((val) => {
          if (val.includes(delimiter) || val.includes('"') || val.includes("\n")) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(delimiter)
    )
    .join("\n");
}

// Coordinator: Read CSV from file asynchronously
export async function readCsv(filePath: string, delimiter = ","): Promise<string[][]> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`[fileutils] CSV file not found: ${filePath}`);
  }
  const text = await file.text();
  return parseCsvString(text, delimiter);
}

// Coordinator: Write CSV to file asynchronously
export async function writeCsv(filePath: string, rows: string[][], delimiter = ","): Promise<void> {
  await ensureDir(dirname(filePath));
  const text = formatCsvString(rows, delimiter);
  await Bun.write(filePath, text);
}

// Coordinator: Walk directory recursively and collect all file paths asynchronously
export async function walkFiles(
  dirPath: string,
  filter?: (path: string) => boolean
): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await walkFiles(fullPath, filter);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        if (!filter || filter(fullPath)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    return [];
  }
  return results;
}

export const fileutils = {
  ensureDir,
  fileSizeHuman,
  saveJson,
  loadJson,
  readLines,
  writeLines,
  appendLine,
  copyFile,
  moveFile,
  parseCsvString,
  formatCsvString,
  readCsv,
  writeCsv,
  walkFiles,
};
