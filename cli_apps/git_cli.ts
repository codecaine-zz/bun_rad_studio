#!/usr/bin/env bun
/**
 * Git Workbench Pro CLI -- Fast Working Tree Status, Diff & Commit Explorer
 * Powered by native Bun.spawn git stream processing
 */
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('git-cli', '1.0.0')
  .setDescription('Working Tree Status, Colorized Diff Viewer & Commit Log Explorer');

app.addFlagBool('status', 's', false, 'Show working tree status table');
app.addFlagBool('diff', 'd', false, 'Show working tree diff (or staged diff with --staged)');
app.addFlagBool('staged', 'S', false, 'Inspect staged changes diff');
app.addFlagInt('log', 'l', 0, 'Display recent N commits (defaults to 10)');
app.addFlagString('commit', 'm', '', 'Commit staged changes with message');
app.addFlagBool('stage-all', 'a', false, 'Stage all modified and untracked files');

if (!app.parseCli()) process.exit(0);

async function runGit(args: string[]): Promise<string> {
  const proc = Bun.spawn(['git', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0 && stderr) throw new Error(stderr.trim());
  return stdout;
}

async function showStatus() {
  const branch = (await runGit(['branch', '--show-current'])).trim();
  const rawStatus = await runGit(['status', '--short']);
  const lines = rawStatus.trim().split('\n').filter(Boolean);

  app.banner('Git Workbench CLI', `Branch: [${branch}]`);
  app.info(`Working tree contains ${lines.length} changed items:`);

  if (lines.length > 0) {
    const rows = lines.map(l => {
      const state = l.slice(0, 2);
      const file = l.slice(3);
      let badge = state;
      if (state.includes('M')) badge = app.yellow('Modified');
      else if (state.includes('A')) badge = app.green('Staged');
      else if (state.includes('?')) badge = app.cyan('Untracked');
      else if (state.includes('D')) badge = app.red('Deleted');
      return [badge, file];
    });
    app.table(['Status', 'File Path'], rows);
  } else {
    app.success('Working tree clean. Nothing to commit.');
  }
}

async function showDiff(isStaged: boolean) {
  const args = ['diff'];
  if (isStaged) args.push('--staged');
  const targetFile = app.getPositionalArgs()[0];
  if (targetFile) args.push(targetFile);

  const diffText = await runGit(args);
  if (!diffText.trim()) {
    app.info(isStaged ? 'No staged changes.' : 'No unstaged modifications.');
    return;
  }

  console.log(diffText.split('\n').map(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) return `\x1b[32m${line}\x1b[0m`;
    if (line.startsWith('-') && !line.startsWith('---')) return `\x1b[31m${line}\x1b[0m`;
    if (line.startsWith('@@')) return `\x1b[36m${line}\x1b[0m`;
    return line;
  }).join('\n'));
}

async function showLog(count: number) {
  const num = count > 0 ? count : 10;
  const rawLog = await runGit(['log', `-${num}`, '--pretty=format:%h|%an|%ar|%s']);
  const lines = rawLog.trim().split('\n').filter(Boolean);

  app.banner('Git Commit Log', `Last ${lines.length} commits`);
  app.table(
    ['Hash', 'Author', 'Time', 'Subject'],
    lines.map(l => l.split('|'))
  );
}

async function main() {
  if (app.getFlagBool('stage-all')) {
    await runGit(['add', '-A']);
    app.success('Staged all modified and untracked files.');
  }

  const commitMsg = app.getFlagString('commit');
  if (commitMsg) {
    try {
      const out = await runGit(['commit', '-m', commitMsg]);
      app.success(`Committed changes: "${commitMsg}"`);
      console.log(out.trim());
    } catch (e: any) {
      app.error(`Commit failed: ${e.message}`);
    }
    return;
  }

  if (app.getFlagBool('diff') || app.getFlagBool('staged')) {
    await showDiff(app.getFlagBool('staged'));
  } else if (app.getFlagInt('log') > 0) {
    await showLog(app.getFlagInt('log'));
  } else {
    // Default action: status
    await showStatus();
  }
}

main();
