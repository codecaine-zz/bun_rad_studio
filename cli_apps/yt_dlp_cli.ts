#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';

const app = SimpleCLI.newApp('ytdlp-cli', '1.0.0')
  .setDescription('Media Download Orchestrator & Quality Preset Engine');

app.addFlagString('url', 'u', '', 'Media stream URL to download');
app.addFlagString('quality', 'q', 'best', 'Quality preset (best, 1080p, audio-only)');

if (!app.parseCli()) process.exit(0);

app.banner('YT-DLP Media Orchestrator', 'v1.0.0');
app.printKv({
  'Target Stream': app.getFlagString('url') || 'https://youtube.com/watch?v=...',
  'Quality Profile': app.getFlagString('quality'),
});
