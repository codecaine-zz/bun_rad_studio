#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';

const app = SimpleCLI.newApp('brew-cli', '1.0.0')
  .setDescription('Homebrew Package Manager Assistant & Health Dashboard');

app.addFlagString('search', 's', '', 'Search for Homebrew formula or cask');
app.addFlagBool('list', 'l', false, 'List installed formulas');
app.addFlagBool('doctor', 'd', false, 'Run brew doctor diagnostic check');
app.addFlagBool('update', 'u', false, 'Run brew update and outdated check');

if (!app.parseCli()) process.exit(0);

app.banner('Homebrew Companion CLI', 'v1.0.0 - Package Manager Guardian');

async function main() {
  const searchQ = app.getFlagString('search');
  if (searchQ) {
    app.info(`Searching Homebrew for "${searchQ}"...`);
    const [out, code] = sys.exec(`brew search ${searchQ}`);
    if (code === 0 && out) {
      const formulas = out.split('\n').filter(l => l.trim().length > 0);
      app.table(['Search Results', 'Type'], formulas.slice(0, 15).map(f => [f, 'formula/cask']));
    } else {
      app.warn(`No formulas found matching "${searchQ}"`);
    }
    return;
  }

  if (app.getFlagBool('list')) {
    app.info('Querying installed Homebrew packages...');
    const [out] = sys.exec('brew list --formula');
    const items = out ? out.split('\n').filter(l => l.trim()) : [];
    app.success(`Found ${items.length} installed formulas:`);
    app.println(items.slice(0, 20).join(', ') + (items.length > 20 ? ` ... (+${items.length - 20} more)` : ''));
    return;
  }

  if (app.getFlagBool('doctor')) {
    app.info('Running brew doctor...');
    const [out, code] = sys.exec('brew doctor');
    if (code === 0) {
      app.success('Your Homebrew system is ready to brew (healthy).');
    } else {
      app.warn('Brew doctor found warnings:');
      app.println(out);
    }
    return;
  }

  // Default dashboard
  const [brewVersion] = sys.exec('brew --version');
  const [formulaCount] = sys.exec('brew list --formula | wc -l');
  const [caskCount] = sys.exec('brew list --cask | wc -l');

  app.printKv({
    'Homebrew Version': brewVersion.split('\n')[0] || 'Homebrew installed',
    'Installed Formulas': formulaCount.trim() || '0',
    'Installed Casks': caskCount.trim() || '0',
    'Prefix Path': sys.execOr('brew --prefix', '/opt/homebrew'),
  });
}

main();
