#!/usr/bin/env bun
import { SimpleCLI, stdlib } from '../src/index.ts';

const app = SimpleCLI.newApp('wget2-cli', '1.0.0')
  .setDescription('Fast HTTP File Downloader with Progress Bar');

app.addFlagString('url', 'u', 'https://raw.githubusercontent.com/oven-sh/bun/main/README.md', 'Download URL');
app.addFlagString('out', 'o', '/tmp/bun_readme.md', 'Output destination path');

if (!app.parseCli()) process.exit(0);

app.banner('Wget2 Downloader CLI', 'v1.0.0 - Streaming HTTP Downloads');

const url = app.getFlagString('url');
const out = app.getFlagString('out');

async function main() {
  app.info(`Downloading ${url} to ${out}...`);
  try {
    await stdlib.downloadFile(url, out, (done, total) => {
      if (total > 0) {
        app.progressBar(done, total, 'Download Progress');
      }
    });
    app.success(`Download complete: ${out}`);
  } catch (err: any) {
    app.error(`Download failed: ${err.message}`);
  }
}

main();
