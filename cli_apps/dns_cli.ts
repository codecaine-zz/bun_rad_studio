#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';
import * as dns from 'node:dns/promises';

const app = SimpleCLI.newApp('dns-cli', '1.0.0')
  .setDescription('DNS Lookup, Nameserver & Latency Inspector CLI');

app.addFlagString('domain', 'd', 'google.com', 'Target domain name to resolve');
app.addFlagString('type', 't', 'A', 'DNS record type (A, AAAA, MX, TXT, NS, CNAME)');

if (!app.parseCli()) process.exit(0);

app.banner('DNS Resolution Studio', 'v1.0.0 - Domain Name Diagnostics');

const domain = app.getFlagString('domain') || app.getPositionalArgs()[0] || 'google.com';
const type = app.getFlagString('type').toUpperCase();

async function main() {
  app.info(`Resolving ${type} records for ${domain}...`);
  app.resetTimer();

  try {
    let records: any = [];
    if (type === 'A') records = await dns.resolve4(domain);
    else if (type === 'AAAA') records = await dns.resolve6(domain);
    else if (type === 'MX') records = (await dns.resolveMx(domain)).map(m => `${m.exchange} (pri: ${m.priority})`);
    else if (type === 'TXT') records = (await dns.resolveTxt(domain)).map(t => t.join(' '));
    else if (type === 'NS') records = await dns.resolveNs(domain);
    else if (type === 'CNAME') records = await dns.resolveCname(domain);
    else records = await dns.resolve4(domain);

    const elapsed = app.elapsedMs();
    app.success(`DNS resolution succeeded in ${elapsed} ms:`);
    app.table(
      ['Domain', 'Record Type', 'Resolved Value'],
      records.map((r: string) => [domain, type, String(r)])
    );
  } catch (err: any) {
    app.error(`DNS resolution failed for ${domain}: ${err.message}`);
  }
}

main();
