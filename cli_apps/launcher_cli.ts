#!/usr/bin/env bun
/**
 * ⚡ Launcher Studio Pro CLI
 * Terminal Command-Line Companion for Unified Application Auto-Detection & Launching
 */

import { SimpleCLI } from '../src/index.ts';
import {
  scanAllApplications,
  launchApplication,
  toggleFavorite,
  type DetectedApp,
} from '../applications/launcher_studio.ts';

const app = SimpleCLI.newApp('launcher-cli', '1.0.0')
  .setDescription('Auto-detect, catalog, search, and launch applications and CLI utilities in this project');

app.addFlagBool('list', 'l', false, 'List all auto-detected project applications');
app.addFlagString('search', 's', '', 'Search applications by name, category, or keyword');
app.addFlagString('source', 'S', '', 'Filter by source (rad_studio, cli_tool, rad_demo)');
app.addFlagBool('running', 'r', false, 'Show only currently active/running applications');
app.addFlagBool('favorites', 'f', false, 'Show only pinned favorite applications');
app.addFlagString('fav-toggle', 'F', '', 'Toggle pinned favorite status for an application ID');
app.addFlagString('launch', 'x', '', 'Launch application by ID or partial name');
app.addFlagBool('json', 'j', false, 'Output results in JSON format');

if (!app.parseCli()) process.exit(0);

const isJson = app.getFlagBool('json');
const isList = app.getFlagBool('list');
const search = app.getFlagString('search').toLowerCase();
const source = app.getFlagString('source').toLowerCase();
const runningOnly = app.getFlagBool('running');
const favoritesOnly = app.getFlagBool('favorites');
const favToggle = app.getFlagString('fav-toggle');
const launchTarget = app.getFlagString('launch');

const { apps, kpis } = scanAllApplications();

// Handle Favorite Toggle Action
if (favToggle) {
  const matched = apps.find(
    (a) =>
      a.id.toLowerCase() === favToggle.toLowerCase() ||
      a.displayName.toLowerCase().includes(favToggle.toLowerCase()) ||
      a.name.toLowerCase().includes(favToggle.toLowerCase())
  );
  if (!matched) {
    console.error(`❌ Error: Application '${favToggle}' not found.`);
    process.exit(1);
  }
  const isFav = toggleFavorite(matched.id);
  console.log(isFav ? `⭐ Favorited: ${matched.displayName}` : `☆ Removed Favorite: ${matched.displayName}`);
  process.exit(0);
}

// Handle Launch Action
if (launchTarget) {
  const matched = apps.find(
    (a) =>
      a.id.toLowerCase() === launchTarget.toLowerCase() ||
      a.displayName.toLowerCase().includes(launchTarget.toLowerCase()) ||
      a.name.toLowerCase().includes(launchTarget.toLowerCase())
  );

  if (!matched) {
    if (isJson) {
      console.log(JSON.stringify({ success: false, error: `Application not found: ${launchTarget}` }, null, 2));
    } else {
      console.error(`❌ Error: Application '${launchTarget}' not found in auto-detected catalog.`);
    }
    process.exit(1);
  }

  if (!isJson) {
    console.log(`🚀 Launching ${matched.displayName} (${matched.sourceLabel})...`);
  }

  const res = await launchApplication(matched.id);
  if (isJson) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    if (res.success) {
      console.log(`✅ ${res.message}`);
    } else {
      console.error(`❌ Launch failed: ${res.message}`);
      process.exit(1);
    }
  }
  process.exit(0);
}

// Filter apps
let filtered = apps;

if (favoritesOnly) {
  filtered = filtered.filter((a) => a.isFavorite);
}

if (source) {
  filtered = filtered.filter((a) => a.source.toLowerCase().includes(source));
}

if (runningOnly) {
  filtered = filtered.filter((a) => a.isRunning);
}

if (search) {
  filtered = filtered.filter(
    (a) =>
      a.displayName.toLowerCase().includes(search) ||
      a.name.toLowerCase().includes(search) ||
      a.category.toLowerCase().includes(search) ||
      a.description.toLowerCase().includes(search)
  );
}

if (isJson) {
  console.log(JSON.stringify({ kpis, count: filtered.length, apps: filtered }, null, 2));
  process.exit(0);
}

// Visual CLI Banner & Table Output
app.banner('Launcher Studio Pro CLI', 'v1.0.0 - Unified Application Auto-Detector');

console.log(`📊 Catalog Summary:`);
console.log(`   • Total Detected: ${kpis.total} tools`);
console.log(`   • RAD Studios:    ${kpis.radStudios}`);
console.log(`   • CLI Utilities:  ${kpis.cliTools}`);
console.log(`   • Showcase Demos: ${kpis.demos}`);
console.log(`   • ⭐ Favorites:   ${kpis.favorites}`);
console.log(`   • Running Now:    ${kpis.running}`);
console.log('');

console.log(`Found ${filtered.length} applications matching criteria:\n`);

const rows = filtered.map((a) => [
  a.isFavorite ? '⭐' : ' ',
  a.icon || '⚡',
  a.displayName.slice(0, 30),
  a.sourceLabel,
  a.category.slice(0, 20),
  a.isRunning ? `🟢 Running (#${a.pid || '?'})` : '⚪ Inactive',
  a.command.slice(0, 34),
]);

// Print fixed column table
console.log(' FAV | ICON | NAME                           | SOURCE       | CATEGORY             | STATUS             | COMMAND');
console.log('-----+------+--------------------------------+--------------+----------------------+--------------------+-----------------------------------');
for (const r of rows) {
  const cFav = (r[0] || ' ').padEnd(3);
  const c0 = (r[1] || ' ').padEnd(4);
  const c1 = (r[2] || '').padEnd(30);
  const c2 = (r[3] || '').padEnd(12);
  const c3 = (r[4] || '').padEnd(20);
  const c4 = (r[5] || '').padEnd(18);
  const c5 = (r[6] || '');
  console.log(` ${cFav} | ${c0} | ${c1} | ${c2} | ${c3} | ${c4} | ${c5}`);
}

console.log('\n💡 Launch any app directly using:');
console.log('   bun run cli:launcher --launch <id_or_name>');
