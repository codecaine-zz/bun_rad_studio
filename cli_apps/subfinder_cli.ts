#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('subfinder-cli', '1.0.0')
  .setDescription('Subdomain Discovery & DNS Enumeration Tool');

app.addFlagString('domain', 'd', 'example.com', 'Target root domain');

if (!app.parseCli()) process.exit(0);

app.banner('Subdomain Discovery Studio', 'v1.0.0 - Reconnaissance');

const domain = app.getFlagString('domain') || 'example.com';
const subs = ['api', 'auth', 'admin', 'mail', 'cdn', 'vpn', 'staging'].map(s => `${s}.${domain}`);

app.table(['Discovered Subdomain', 'Resolution Status', 'IP Address'], subs.map(s => [s, 'ACTIVE', '93.184.216.34']));
