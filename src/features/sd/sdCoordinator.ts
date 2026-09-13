import type { FileTransformResult, SdOptions } from "./sdTypes.ts";
import {
  buildReplacerRegex,
  computeDiffHunks,
  countMatches,
  createBackup,
  expandTargets,
  formatDiffPreview,
  readContent,
  replaceText,
  writeContent,
} from "./sdDoers.ts";

export async function processFile(
  filePath: string,
  regex: RegExp,
  replacement: string
): Promise<FileTransformResult> {
  const original = await readContent(filePath);
  const newContent = replaceText(original, regex, replacement);
  const hasChanged = original !== newContent;
  const diffHunks = hasChanged ? computeDiffHunks(original, newContent) : [];

  return {
    filePath,
    hasChanged,
    originalContent: original,
    newContent,
    diffHunks,
  };
}

export async function runSdCoordinator(options: SdOptions): Promise<string[]> {
  const regex = buildReplacerRegex(
    options.findPattern,
    options.stringMode,
    options.flags,
    options.ignoreCase,
    options.wholeWord
  );

  // Stdin mode
  if (options.files.length === 0 || (options.files.length === 1 && options.files[0] === "-")) {
    const input = await Bun.stdin.text();
    if (options.countOnly) {
      const count = countMatches(input, regex);
      return [`Found ${count} match(es).`];
    }
    const replaced = replaceText(input, regex, options.replacePattern);
    return [replaced];
  }

  const resolvedFiles = await expandTargets(options.files);
  const results: string[] = [];
  let totalMatches = 0;
  let matchingFiles = 0;

  for (const file of resolvedFiles) {
    if (options.countOnly) {
      try {
        const content = await readContent(file);
        const matches = countMatches(content, regex);
        if (matches > 0) {
          totalMatches += matches;
          matchingFiles++;
        }
      } catch {
        // Skip unreadable
      }
      continue;
    }

    const result = await processFile(file, regex, options.replacePattern);
    if (!result.hasChanged) continue;

    if (options.preview) {
      results.push(formatDiffPreview(result.filePath, result.diffHunks));
    } else {
      if (options.backupExt) {
        await createBackup(result.filePath, options.backupExt);
      }
      await writeContent(result.filePath, result.newContent);
      results.push(`Updated ${result.filePath} (${result.diffHunks.length} changes)`);
    }
  }

  if (options.countOnly) {
    return [`Found ${totalMatches} match(es) across ${matchingFiles} file(s).`];
  }

  if (options.quiet) {
    return results.length > 0 ? [`Updated ${results.length} file(s).`] : [];
  }

  return results;
}
