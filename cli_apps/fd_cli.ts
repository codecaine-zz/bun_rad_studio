#!/usr/bin/env bun
import { SimpleCLI, stdlib } from '../src/index.ts';
import { executeFdSearch, runFdCommand, parseSizeFilter, parseDurationMs, type FdFileType } from '../applications/fd_engine.ts';

const app = SimpleCLI.newApp('fd-cli', '2.0.0')
  .setDescription('Native Bun Fast Filesystem Search & Directory Traversal Tool (fd-find replacement)');

// Pattern & Path matching flags
app.addFlagBool('glob', 'g', false, 'Glob-based search rather than regular expression');
app.addFlagBool('fixed-strings', 'F', false, 'Treat pattern as a literal fixed string rather than regex');
app.addFlagBool('case-sensitive', 's', false, 'Case-sensitive search (default: smart case)');
app.addFlagBool('ignore-case', 'i', false, 'Case-insensitive search (default: smart case)');
app.addFlagBool('full-path', 'p', false, 'Match pattern against full relative path rather than file name');

// Filtering flags
app.addFlagString('type', 't', '', 'Filter by type: f (file), d (dir), l (symlink), x (executable), e (empty)');
app.addFlagString('extension', 'e', '', 'Filter by file extension (e.g. ts, json, md)');
app.addFlagBool('hidden', 'H', false, 'Search hidden files and directories');
app.addFlagBool('no-ignore', 'I', false, 'Do not respect .(git)ignore files');
app.addFlagString('exclude', 'E', '', 'Exclude patterns (comma-separated, e.g. node_modules,dist)');
app.addFlagInt('max-depth', 'd', 0, 'Set maximum search depth');
app.addFlagInt('min-depth', '', 0, 'Set minimum search depth');
app.addFlagBool('follow', 'L', false, 'Follow symbolic links');
app.addFlagString('size', 'S', '', 'Filter by size: +10M (greater), -1k (less), 500k (exact)');
app.addFlagString('changed-within', '', '', 'Filter by modified within time (e.g. 10m, 2h, 1d, 1w)');
app.addFlagString('changed-before', '', '', 'Filter by modified before time (e.g. 10m, 2h, 1d, 1w)');

// Action flags
app.addFlagString('exec', 'x', '', 'Execute command for each search result ({} replaced by path)');
app.addFlagString('exec-batch', 'X', '', 'Execute command once with all search results as arguments');
app.addFlagBool('json', '', false, 'Output results as JSON array');
app.addFlagBool('print0', '0', false, 'Separate results by null character for xargs -0');

if (!app.parseCli()) process.exit(0);

const posArgs = app.getPositionalArgs();
const pattern = posArgs[0] || '';
const rootDir = posArgs[1] || '.';

const isGlob = app.getFlagBool('glob');
const isFixed = app.getFlagBool('fixed-strings');
const isSensitive = app.getFlagBool('case-sensitive');
const isInsensitive = app.getFlagBool('ignore-case');
const fullPath = app.getFlagBool('full-path');
const hidden = app.getFlagBool('hidden');
const noIgnore = app.getFlagBool('no-ignore');
const follow = app.getFlagBool('follow');
const isJson = app.getFlagBool('json');
const isPrint0 = app.getFlagBool('print0');

const typeStr = app.getFlagString('type');
const extStr = app.getFlagString('extension');
const excludeStr = app.getFlagString('exclude');
const maxDepth = app.getFlagInt('max-depth');
const minDepth = app.getFlagInt('min-depth');
const sizeStr = app.getFlagString('size');
const withinStr = app.getFlagString('changed-within');
const beforeStr = app.getFlagString('changed-before');
const execCmd = app.getFlagString('exec');
const execBatchCmd = app.getFlagString('exec-batch');

// Parse searchMode & caseMode
let searchMode: 'regex' | 'glob' | 'fixed' = 'regex';
if (isGlob) searchMode = 'glob';
else if (isFixed) searchMode = 'fixed';

let caseMode: 'smart' | 'sensitive' | 'ignore' = 'smart';
if (isSensitive) caseMode = 'sensitive';
else if (isInsensitive) caseMode = 'ignore';

// Parse types
let types: FdFileType[] | undefined;
if (typeStr) {
  const typeMap: Record<string, FdFileType> = {
    f: 'file',
    file: 'file',
    d: 'directory',
    dir: 'directory',
    l: 'symlink',
    symlink: 'symlink',
    x: 'executable',
    executable: 'executable',
    e: 'empty',
    empty: 'empty',
    s: 'socket',
    socket: 'socket',
    p: 'pipe',
    pipe: 'pipe',
  };
  types = typeStr.split(/[,;\s]+/).map(t => typeMap[t.toLowerCase()]).filter(Boolean) as FdFileType[];
}

// Parse extensions & excludes
const extensions = extStr ? extStr.split(/[,;\s]+/).filter(Boolean) : undefined;
const excludePatterns = excludeStr ? excludeStr.split(/[,;\s]+/).filter(Boolean) : undefined;

// Parse size
let minSizeBytes: number | undefined;
let maxSizeBytes: number | undefined;
if (sizeStr) {
  const parsed = parseSizeFilter(sizeStr);
  if (parsed) {
    if (parsed.mode === 'greater') minSizeBytes = parsed.bytes;
    else if (parsed.mode === 'less') maxSizeBytes = parsed.bytes;
    else {
      minSizeBytes = parsed.bytes * 0.95;
      maxSizeBytes = parsed.bytes * 1.05;
    }
  }
}

// Parse time
const changedWithinMs = withinStr ? parseDurationMs(withinStr) || undefined : undefined;
const changedBeforeMs = beforeStr ? parseDurationMs(beforeStr) || undefined : undefined;

// Execute native search
const res = await executeFdSearch({
  searchRoot: rootDir,
  pattern,
  searchMode,
  caseMode,
  fullPath,
  types,
  extensions,
  hidden,
  noIgnore,
  excludePatterns,
  maxDepth: maxDepth > 0 ? maxDepth : undefined,
  minDepth: minDepth > 0 ? minDepth : undefined,
  followSymlinks: follow,
  minSizeBytes,
  maxSizeBytes,
  changedWithinMs,
  changedBeforeMs,
});

// If JSON output requested
if (isJson) {
  console.log(JSON.stringify(res.items, null, 2));
  process.exit(0);
}

// If print0 requested (null-delimited paths)
if (isPrint0) {
  for (const item of res.items) {
    process.stdout.write(item.relativePath + '\0');
  }
  process.exit(0);
}

// If execution requested (-x or -X)
if (execCmd) {
  for (const item of res.items) {
    const runRes = await runFdCommand(execCmd, [item.path]);
    if (runRes.stdout) console.log(runRes.stdout);
    if (runRes.stderr) console.error(runRes.stderr);
  }
  process.exit(0);
}

if (execBatchCmd) {
  const paths = res.items.map(it => it.path);
  const runRes = await runFdCommand(execBatchCmd, paths);
  if (runRes.stdout) console.log(runRes.stdout);
  if (runRes.stderr) console.error(runRes.stderr);
  process.exit(0);
}

// Default CLI terminal output: Banner and Table
app.banner('Native Bun File Finder (fd-cli)', `Found ${res.matchedCount} matching items in ${res.durationMs}ms (${res.totalHumanSize})`);

if (res.items.length === 0) {
  app.warn(`No files or directories matching '${pattern}' in ${rootDir}`);
  process.exit(0);
}

const rows = res.items.slice(0, 50).map(m => {
  const icon = m.type === 'directory' ? '📁' : m.isExecutable ? '⚡' : m.isSymlink ? '🔗' : '📄';
  return [`${icon} ${m.name}`, m.type, m.humanSize, m.relativePath, m.permStr];
});

app.table(['Name', 'Type', 'Size', 'Relative Path', 'Perms'], rows);

if (res.items.length > 50) {
  app.println(app.dim(`  ... and ${res.items.length - 50} more items (use --json for complete list)`));
}
