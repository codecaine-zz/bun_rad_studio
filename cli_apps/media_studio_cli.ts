#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('mediastudio-cli', '1.0.0')
  .setDescription('Multi-Purpose Media Production Toolkit');

if (!app.parseCli()) process.exit(0);

app.banner('Media Studio Suite', 'v1.0.0 - Audio, Video & Image Orchestrator');
app.info('Media processing pipelines initialized.');
