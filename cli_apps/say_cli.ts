#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';

const app = SimpleCLI.newApp('say-cli', '1.0.0')
  .setDescription('Text-to-Speech Synthesis CLI');

app.addFlagString('text', 't', 'Hello from Bun Simple CLI!', 'Speech text');
app.addFlagString('voice', 'v', 'Samantha', 'Voice name');

if (!app.parseCli()) process.exit(0);

app.banner('Text-to-Speech Voice Engine', 'v1.0.0');
const text = app.getFlagString('text') || app.getPositionalArgs().join(' ') || 'Speech synthesized.';
sys.say(text, app.getFlagString('voice'));
app.success(`Speaking: "${text}"`);
