#!/usr/bin/env bun
/**
 * Native Bun rip CLI -- A Safe and Ergonomic Alternative to rm
 * Full CLI parity with modern rip (rm-improved / rip2)
 */

import { SimpleCLI } from '../src/index.ts';
import {
  getGraveyardDir,
  inspectTargets,
  buryTargets,
  unburyTargets,
  seanceGraveyard,
  decomposeGraveyard,
  getGraveyardStats,
  generateCompletions,
  parseDurationMs,
  formatHumanSize,
} from '../applications/rip_engine.ts';
import * as path from 'node:path';

const app = SimpleCLI.newApp('rip', '2.1.0')
  .setDescription('A safe and ergonomic alternative to rm (Native Bun Edition)');

// Flags matching modern rip
app.addFlagString('graveyard', '', '', 'Directory where deleted files rest');
app.addFlagBool('decompose', 'd', false, 'Permanently deletes the graveyard or specified items');
app.addFlagBool('seance', 's', false, 'Prints files that were deleted in the current directory');
app.addFlagBool('unbury', 'u', false, 'Restore the specified files or the last file if none are specified');
app.addFlagBool('inspect', 'i', false, 'Print some info about FILES before burying');
app.addFlagBool('force', 'f', false, 'Non-interactive mode (skip safety confirmation)');
app.addFlagBool('all', 'a', false, 'Operate across all directories for seance or decompose');
app.addFlagString('older-than', '', '', 'For decompose: filter by age (e.g. 10m, 2h, 7d, 30d)');
app.addFlagBool('json', '', false, 'Output results as JSON');

if (!app.parseCli()) process.exit(0);

const posArgs = app.getPositionalArgs();
const customGraveyard = app.getFlagString('graveyard');
const graveyardDir = getGraveyardDir(customGraveyard);

const isDecompose = app.getFlagBool('decompose');
const isSeance = app.getFlagBool('seance');
const isUnbury = app.getFlagBool('unbury');
const isInspect = app.getFlagBool('inspect');
const isForce = app.getFlagBool('force');
const isAll = app.getFlagBool('all');
const olderThanStr = app.getFlagString('older-than');
const isJson = app.getFlagBool('json');

const cwd = process.cwd();

// Detect subcommands
const firstArg = posArgs[0]?.toLowerCase();
const isSubcommand = ['graveyard', 'seance', 'unbury', 'decompose', 'inspect', 'completions', 'stats'].includes(firstArg);

// -----------------------------------------------------------------------------
// 1. Subcommand: completions
// -----------------------------------------------------------------------------
if (firstArg === 'completions') {
  const shell = (posArgs[1]?.toLowerCase() || 'zsh') as 'zsh' | 'bash' | 'fish';
  const script = generateCompletions(shell);
  console.log(script);
  process.exit(0);
}

// -----------------------------------------------------------------------------
// 2. Subcommand: graveyard
// -----------------------------------------------------------------------------
if (firstArg === 'graveyard') {
  if (isJson) {
    console.log(JSON.stringify({ graveyard: graveyardDir }, null, 2));
  } else {
    console.log(graveyardDir);
  }
  process.exit(0);
}

// -----------------------------------------------------------------------------
// 3. Subcommand: stats
// -----------------------------------------------------------------------------
if (firstArg === 'stats') {
  const stats = getGraveyardStats(graveyardDir);
  if (isJson) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    app.banner('Graveyard Statistics', `Location: ${graveyardDir}`);
    app.table(
      ['Metric', 'Value'],
      [
        ['Total Buried Items', String(stats.totalItems)],
        ['Total Graveyard Size', stats.totalHumanSize],
        ['Items Buried Today', String(stats.buriedTodayCount)],
        ['Oldest Item', stats.oldestItem ? `${stats.oldestItem.name} (${stats.oldestItem.buriedAt.slice(0, 10)})` : 'None'],
        ['Newest Item', stats.newestItem ? `${stats.newestItem.name} (${stats.newestItem.buriedAt.slice(0, 10)})` : 'None'],
      ]
    );
  }
  process.exit(0);
}

// -----------------------------------------------------------------------------
// 4. Séance Mode (-s / --seance or 'seance' subcommand)
// -----------------------------------------------------------------------------
if (isSeance || firstArg === 'seance') {
  const items = seanceGraveyard({ graveyardDir, cwd, all: isAll || posArgs.includes('--all') || posArgs.includes('-a') });

  if (isJson) {
    console.log(JSON.stringify(items, null, 2));
    process.exit(0);
  }

  const scopeLabel = isAll ? 'All Buried Files Across System' : `Files Buried from Current Directory (${cwd})`;
  app.banner('Séance: Graveyard Echoes', `${scopeLabel} | Total: ${items.length} items`);

  if (items.length === 0) {
    app.info(isAll ? 'The graveyard is peacefully empty.' : 'No files buried from this directory. (Use -a to view all)');
    process.exit(0);
  }

  const rows = items.map((it, idx) => {
    const icon = it.type === 'directory' ? '📁' : it.type === 'symlink' ? '🔗' : '📄';
    const dateStr = it.buriedAt.replace('T', ' ').slice(0, 19);
    return [
      String(idx + 1),
      `${icon} ${it.name}`,
      it.type,
      it.humanSize,
      dateStr,
      it.relativePath || it.originalPath,
    ];
  });

  app.table(['#', 'Name', 'Type', 'Size', 'Buried At', 'Original Path'], rows);
  process.exit(0);
}

// -----------------------------------------------------------------------------
// 5. Unbury Mode (-u / --unbury or 'unbury' subcommand)
// -----------------------------------------------------------------------------
if (isUnbury || firstArg === 'unbury') {
  const targets = (firstArg === 'unbury' ? posArgs.slice(1) : posArgs).filter(
    (a) => !a.startsWith('-')
  );

  const res = await unburyTargets(targets.length > 0 ? targets : undefined, {
    graveyardDir,
    cwd,
    force: isForce,
  });

  if (isJson) {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.success ? 0 : 1);
  }

  if (res.restoredItems.length > 0) {
    app.banner('Unburied Successfully', `Restored ${res.restoredItems.length} item(s) from graveyard`);
    for (const item of res.restoredItems) {
      app.success(`↺ Restored '${item.name}' -> ${item.originalPath} (${item.humanSize})`);
    }
  }

  if (res.failed.length > 0) {
    for (const f of res.failed) {
      app.error(`Failed to unbury: ${f.error}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

// -----------------------------------------------------------------------------
// 6. Decompose Mode (-d / --decompose or 'decompose' subcommand)
// -----------------------------------------------------------------------------
if (isDecompose || firstArg === 'decompose') {
  const targets = (firstArg === 'decompose' ? posArgs.slice(1) : posArgs).filter(
    (a) => !a.startsWith('-')
  );

  const olderThanMs = olderThanStr ? parseDurationMs(olderThanStr) || undefined : undefined;

  const res = await decomposeGraveyard({
    graveyardDir,
    targets: targets.length > 0 ? targets : undefined,
    olderThanMs,
    all: isAll || targets.length === 0,
  });

  if (isJson) {
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  }

  app.banner('Graveyard Decomposed', `Permanently deleted ${res.deletedCount} item(s) (${res.freedHumanSize} freed)`);
  if (res.deletedCount > 0) {
    app.success(`Freed ${res.freedHumanSize} of disk space.`);
  } else {
    app.info('No matching graveyard items to decompose.');
  }
  process.exit(0);
}

// -----------------------------------------------------------------------------
// 7. Inspect Mode (-i / --inspect or 'inspect' subcommand)
// -----------------------------------------------------------------------------
const rawTargets = (firstArg === 'inspect' ? posArgs.slice(1) : posArgs).filter((a) => !a.startsWith('-'));

if (isInspect || firstArg === 'inspect') {
  if (rawTargets.length === 0) {
    app.error('No files or directories specified to inspect.');
    process.exit(1);
  }

  const insp = await inspectTargets(rawTargets, { cwd, graveyardDir });

  if (isJson) {
    console.log(JSON.stringify(insp, null, 2));
    process.exit(0);
  }

  app.banner(
    'Pre-Deletion Inspection',
    `Targets: ${insp.items.length} | Total Size: ${insp.totalHumanSize} | Total Files: ${insp.totalFiles}`
  );

  const rows = insp.items.map((it) => {
    const icon = it.type === 'directory' ? '📁' : it.type === 'symlink' ? '🔗' : it.exists ? '📄' : '❓';
    const statusNote = it.isProtected ? '⛔ PROTECTED' : it.warning ? `⚠️ ${it.warning}` : '✓ Safe';
    return [`${icon} ${it.name}`, it.type, it.humanSize, String(it.fileCount), statusNote];
  });

  app.table(['Target', 'Type', 'Size', 'Files', 'Status'], rows);

  if (insp.hasProtected) {
    app.error('One or more targets are protected system directories and CANNOT be buried.');
    process.exit(1);
  }

  if (firstArg === 'inspect') {
    // Pure inspect subcommand exits here
    process.exit(0);
  }

  // If called via `rip -i <files>` without -f, prompt confirmation
  if (!isForce) {
    app.warn('To bury these items into the graveyard, re-run without -i or add -f/--force.');
    process.exit(0);
  }
}

// -----------------------------------------------------------------------------
// 8. Default: Bury Mode (Safe Deletion)
// -----------------------------------------------------------------------------
if (rawTargets.length === 0) {
  // If no arguments provided at all, show help
  console.log(`rip: a safe and ergonomic alternative to rm

Usage: rip [OPTIONS] [FILES]...
       rip [SUBCOMMAND]

Arguments:
    [FILES]...  Files or directories to remove

Options:
      --graveyard <GRAVEYARD>  Directory where deleted files rest
  -d, --decompose              Permanently deletes the graveyard
  -s, --seance                 Prints files that were deleted in the current directory
  -u, --unbury [<UNBURY>...]   Restore the specified files or the last file if none are specified
  -i, --inspect                Print some info about FILES before burying
  -f, --force                  Non-interactive mode
  -a, --all                    Apply to all directories (for seance / decompose)
      --json                   Output results as JSON
  -h, --help                   Print help
  -V, --version                Print version

Subcommands:
  completions  Generate shell completions file
  graveyard    Print the graveyard path
  seance       Prints files that were deleted in the current directory
  unbury       Restore files or last buried file
  decompose    Permanently delete graveyard files
  inspect      Print details about target files
  stats        Print graveyard statistics
`);
  process.exit(0);
}

// Perform safe burial
const res = await buryTargets(rawTargets, { graveyardDir, cwd, force: isForce });

if (isJson) {
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.success ? 0 : 1);
}

if (res.buriedItems.length > 0) {
  for (const item of res.buriedItems) {
    const icon = item.type === 'directory' ? '📁' : item.type === 'symlink' ? '🔗' : '📄';
    app.println(`🪦 Buried ${icon} '${item.name}' (${item.humanSize}) into graveyard.`);
  }
  app.dim(`   Undo anytime with: rip -u`);
}

if (res.failed.length > 0) {
  for (const f of res.failed) {
    app.error(`Cannot bury '${f.target}': ${f.error}`);
  }
  process.exit(1);
}

process.exit(0);
