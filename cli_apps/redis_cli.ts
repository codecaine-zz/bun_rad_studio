#!/usr/bin/env bun
/**
 * Namespaced Redis Explorer & Manager CLI
 * Zero-dependency multi-tenant Redis browser, key inspector, and namespace manager
 */

import { SimpleCLI, NamespacedRedis, Ansi, AlertKind } from '../src/index.ts';

const app = SimpleCLI.newApp('redis_cli', '1.0.0')
  .setDescription('Zero-dependency Namespaced Redis Explorer & Multi-Tenant Manager for Bun');

app.addFlagString('namespace', 'n', 'default', 'Target application or tenant namespace');
app.addFlagString('url', 'u', 'redis://localhost:6379', 'Redis connection URL');
app.addFlagString('get', 'g', '', 'Get value for key within namespace');
app.addFlagString('set', 's', '', 'Set value for key within namespace (used with --val)');
app.addFlagString('val', 'v', '', 'Value payload to set');
app.addFlagString('del', 'd', '', 'Delete key within namespace');
app.addFlagBool('keys', 'k', false, 'List all keys in the target namespace');
app.addFlagBool('flush', 'f', false, 'Safely flush only the target namespace');
app.addFlagBool('json', 'j', false, 'Output results as JSON');

if (!app.parseCli()) {
  process.exit(0);
}

const namespace = app.getFlagString('namespace');
const url = app.getFlagString('url');
const r = new NamespacedRedis({ namespace, url });

async function run() {
  try {
    const ping = await r.ping();
    if (ping !== 'PONG' && !ping.startsWith('PONG')) {
      throw new Error(`Unexpected ping response: ${ping}`);
    }
  } catch (err: any) {
    app.alert(AlertKind.CAUTION, 'Connection Failed', `Could not connect to Redis at ${url}: ${err.message}`);
    process.exit(1);
  }

  // CLI Flag Actions
  const getKey = app.getFlagString('get');
  const setKey = app.getFlagString('set');
  const delKey = app.getFlagString('del');
  const listKeys = app.getFlagBool('keys');
  const doFlush = app.getFlagBool('flush');

  if (getKey) {
    const val = await r.get(getKey);
    const ttl = await r.ttl(getKey);
    if (app.getFlagBool('json')) {
      app.output({ namespace, key: getKey, value: val, ttl });
    } else {
      app.banner(`Redis [${namespace}]`, `Key: ${getKey}`);
      app.println(`  Value : ${val !== null ? Ansi.green(val) : Ansi.dim('(nil)')}`);
      app.println(`  TTL   : ${ttl >= 0 ? `${ttl}s` : (ttl === -1 ? 'No expiration (persist)' : 'Key does not exist')}`);
    }
    process.exit(0);
  }

  if (setKey) {
    const val = app.getFlagString('val');
    await r.set(setKey, val);
    if (app.getFlagBool('json')) {
      app.output({ status: 'OK', namespace, key: setKey, value: val });
    } else {
      app.alert(AlertKind.SUCCESS, 'Key Set', `Successfully set key "${setKey}" in namespace "${namespace}"`);
    }
    process.exit(0);
  }

  if (delKey) {
    const count = await r.del(delKey);
    if (app.getFlagBool('json')) {
      app.output({ deleted: count > 0, namespace, key: delKey });
    } else {
      if (count > 0) {
        app.alert(AlertKind.SUCCESS, 'Key Deleted', `Deleted "${delKey}" from namespace "${namespace}"`);
      } else {
        app.alert(AlertKind.WARNING, 'Key Not Found', `Key "${delKey}" not found in namespace "${namespace}"`);
      }
    }
    process.exit(0);
  }

  if (doFlush) {
    const count = await r.flushNamespace();
    if (app.getFlagBool('json')) {
      app.output({ flushed: true, namespace, keysDeleted: count });
    } else {
      app.alert(AlertKind.SUCCESS, 'Namespace Flushed', `Deleted ${count} keys belonging exclusively to namespace "${namespace}"`);
    }
    process.exit(0);
  }

  if (listKeys) {
    const keys = await r.keys('*');
    if (app.getFlagBool('json')) {
      app.output({ namespace, totalKeys: keys.length, keys });
    } else {
      app.banner(`Namespaced Keys for "${namespace}"`, `Total: ${keys.length} keys`);
      if (keys.length === 0) {
        app.println(Ansi.dim('  (no keys found in this namespace)'));
      } else {
        keys.forEach(k => app.println(`  • ${Ansi.cyan(k)} ${Ansi.dim(`(full: ${r.prefixKey(k)})`)}`));
      }
    }
    process.exit(0);
  }

  // Interactive Explorer Mode
  app.banner('Namespaced Redis Explorer', `Namespace: ${Ansi.cyan(namespace)} | Server: ${Ansi.dim(url)}`);

  const keys = await r.keys('*');
  app.println(`Found ${Ansi.bold(keys.length.toString())} keys in namespace "${namespace}".\n`);

  if (keys.length === 0) {
    const createSample = await app.confirm('Namespace is currently empty. Would you like to seed sample keys?', true);
    if (createSample) {
      await r.set('session:admin', JSON.stringify({ user: 'admin', loginTime: new Date().toISOString() }), { ex: 3600 });
      await r.set('config:rate_limit', '1000');
      await r.hset('meta', { version: '1.0.0', env: 'production' });
      app.println(`\n${Ansi.green('✔')} Seeded sample keys in namespace "${namespace}". Rerun redis_cli to inspect.`);
    }
    process.exit(0);
  }

  const rows: [string, string, string][] = [];
  for (const k of keys.slice(0, 20)) {
    const val = await r.get(k);
    const ttl = await r.ttl(k);
    const preview = val ? (val.length > 40 ? `${val.slice(0, 40)}...` : val) : '(complex/hash)';
    const ttlStr = ttl > 0 ? `${ttl}s` : (ttl === -1 ? 'persist' : '-');
    rows.push([k, preview, ttlStr]);
  }

  app.table(['Key (Unprefixed)', 'Value Preview', 'TTL'], rows);

  if (keys.length > 20) {
    app.println(Ansi.dim(`  ... and ${keys.length - 20} more keys.`));
  }

  const action = await app.select('Select an action:', [
    'View specific key details',
    'Add / update key',
    'Flush this namespace',
    'Exit',
  ]);

  if (action === 'View specific key details') {
    const chosenKey = await app.fuzzySelect('Select key to inspect:', keys);
    if (chosenKey) {
      const rawVal = await r.get(chosenKey);
      const ttl = await r.ttl(chosenKey);
      app.panel(`Key: ${chosenKey} (Full: ${r.prefixKey(chosenKey)})`, [
        `TTL: ${ttl >= 0 ? `${ttl} seconds` : 'Persistent'}`,
        'Value:',
        rawVal ? (rawVal.startsWith('{') || rawVal.startsWith('[') ? app.jsonHighlight(rawVal) : rawVal) : '(nil)',
      ].join('\n'));
    }
  } else if (action === 'Add / update key') {
    const k = await app.prompt('Key name:');
    const v = await app.prompt('Value:');
    if (k && v) {
      await r.set(k, v);
      app.println(`${Ansi.green('✔')} Saved key "${k}" in namespace "${namespace}"`);
    }
  } else if (action === 'Flush this namespace') {
    const confirm = await app.confirm(`Are you sure you want to delete ALL keys in "${namespace}"?`, false);
    if (confirm) {
      const deleted = await r.flushNamespace();
      app.println(`${Ansi.green('✔')} Deleted ${deleted} keys from namespace "${namespace}".`);
    }
  }
}

run();
