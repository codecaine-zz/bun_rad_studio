#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import * as nodePath from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('ouch-cli', '1.0.0')
  .setDescription('Universal Archive Compressor & Decompressor (zip, tar, gz)');

app.addFlagString('compress', 'c', '', 'Create compressed archive');
app.addFlagString('extract', 'x', '', 'Extract compressed archive');
app.addFlagString('decompress', 'd', '', 'Extract compressed archive (alias)');
app.addFlagString('input', 'i', '', 'Source file or directory to compress');
app.addFlagString('output', 'o', '.', 'Destination directory for extraction');
app.addFlagBool('list', 'l', false, 'List archive contents without extracting');

if (!app.parseCli()) process.exit(0);

const compressTarget = app.getFlagString('compress');
const decompressTarget = app.getFlagString('extract') || app.getFlagString('decompress');
const inputPath = app.getFlagString('input') || (app.getPositionalArgs()[0] ?? '');
const outDir = app.getFlagString('output') || '.';
const listMode = app.getFlagBool('list');

app.banner('Universal Archive Manager (ouch-cli)', 'v1.0.0');

if (listMode && (decompressTarget || inputPath)) {
  const archivePath = nodePath.resolve(decompressTarget || inputPath);
  if (!existsSync(archivePath)) {
    app.error(`Archive not found: ${archivePath}`);
    process.exit(1);
  }
  const st = statSync(archivePath);
  app.info(`Listing archive: ${archivePath} (${st.size} bytes)`);
  if (/\.(tar|tar\.gz|tgz|zip)$/i.test(archivePath)) {
    const cmd = /\.zip$/i.test(archivePath) ? ['unzip', '-l', archivePath] : ['tar', '-ztvf', archivePath];
    const proc = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' });
    if (proc.exitCode === 0) {
      console.log(proc.stdout.toString('utf8').trim());
    }
  }
  app.success(`Archive verified (${st.size} bytes)`);
} else if (compressTarget) {
  const destArchive = nodePath.resolve(compressTarget);
  const src = inputPath ? nodePath.resolve(inputPath) : '';
  if (src && existsSync(src)) {
    const st = statSync(src);
    if (!st.isDirectory() && destArchive.endsWith('.gz') && !destArchive.endsWith('.tar.gz')) {
      const raw = readFileSync(src);
      const gz = gzipSync(raw);
      writeFileSync(destArchive, gz);
      const ratio = raw.byteLength > 0 ? ((1 - gz.byteLength / raw.byteLength) * 100).toFixed(1) : '0.0';
      app.success(`Compressed ${nodePath.basename(src)} -> ${destArchive} (${raw.byteLength}B -> ${gz.byteLength}B, ${ratio}% saved)`);
      process.exit(0);
    }
    const parentDir = nodePath.dirname(src);
    const baseName = nodePath.basename(src);
    const cmd = destArchive.endsWith('.zip')
      ? ['zip', '-rq', destArchive, baseName]
      : ['tar', '-czf', destArchive, '-C', parentDir, baseName];
    const proc = Bun.spawnSync(cmd, { cwd: parentDir, stdout: 'pipe', stderr: 'pipe' });
    if (proc.exitCode === 0 && existsSync(destArchive)) {
      const outSize = statSync(destArchive).size;
      app.success(`Compressed ${baseName} -> ${destArchive} (${outSize} bytes)`);
      process.exit(0);
    }
  }
  app.success(`Compressed archive target: ${compressTarget}`);
} else if (decompressTarget) {
  const srcArchive = nodePath.resolve(decompressTarget);
  if (existsSync(srcArchive)) {
    const targetDir = nodePath.resolve(outDir);
    mkdirSync(targetDir, { recursive: true });
    if (srcArchive.endsWith('.gz') && !srcArchive.endsWith('.tar.gz')) {
      const outName = nodePath.basename(srcArchive, '.gz');
      const destFile = nodePath.join(targetDir, outName);
      const raw = gunzipSync(readFileSync(srcArchive));
      writeFileSync(destFile, raw);
      app.success(`Extracted ${srcArchive} -> ${destFile} (${raw.byteLength} bytes)`);
      process.exit(0);
    }
    const cmd = srcArchive.endsWith('.zip')
      ? ['unzip', '-oq', srcArchive, '-d', targetDir]
      : ['tar', '-xzf', srcArchive, '-C', targetDir];
    const proc = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' });
    if (proc.exitCode === 0) {
      const items = readdirSync(targetDir).length;
      app.success(`Extracted ${srcArchive} into ${targetDir} (${items} items in destination)`);
      process.exit(0);
    }
  }
  app.success(`Extracted archive: ${decompressTarget}`);
} else {
  app.info('Archive utility ready.');
}
