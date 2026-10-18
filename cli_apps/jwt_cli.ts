#!/usr/bin/env bun
/**
 * JSON Web Token (JWT) Inspector & Decoder CLI
 * Zero-dependency JWT claim analyzer, expiration tracker, and payload visualizer
 */

import { SimpleCLI, Ansi, AlertKind } from '../src/index.ts';

const app = SimpleCLI.newApp('jwt_cli', '1.0.0')
  .setDescription('Zero-dependency JSON Web Token (JWT) decoder, claim analyzer & inspector');

app.addFlagString('token', 't', '', 'JWT token string to decode');
app.addFlagBool('json', 'j', false, 'Output decoded JWT object as JSON');

if (!app.parseCli()) {
  process.exit(0);
}

let token = app.getFlagString('token') || app.getPositionalArgs()[0];

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

async function run() {
  if (!token) {
    token = await app.prompt('Enter JWT token:');
  }

  if (!token || token.split('.').length < 2) {
    app.alert(AlertKind.CAUTION, 'Invalid Format', 'A valid JWT must have at least 2 dot-separated segments (header.payload).');
    process.exit(1);
  }

  const parts = token.trim().split('.');
  let header: Record<string, any> = {};
  let payload: Record<string, any> = {};

  try {
    header = JSON.parse(base64UrlDecode(parts[0] || ''));
  } catch (err: any) {
    app.alert(AlertKind.CAUTION, 'Header Parse Error', `Failed decoding JWT header: ${err.message}`);
    process.exit(1);
  }

  try {
    payload = JSON.parse(base64UrlDecode(parts[1] || ''));
  } catch (err: any) {
    app.alert(AlertKind.CAUTION, 'Payload Parse Error', `Failed decoding JWT payload: ${err.message}`);
    process.exit(1);
  }

  const signature = parts[2] || '';

  // Expiration calculation
  let expStatus = 'No expiration claim';
  let isExpired = false;
  if (typeof payload.exp === 'number') {
    const expDate = new Date(payload.exp * 1000);
    const now = Date.now();
    const diffMs = expDate.getTime() - now;
    if (diffMs < 0) {
      isExpired = true;
      const agoSec = Math.abs(Math.round(diffMs / 1000));
      expStatus = `${Ansi.red('EXPIRED')} (${expDate.toISOString()} - ${agoSec}s ago)`;
    } else {
      const remainingSec = Math.round(diffMs / 1000);
      const min = Math.floor(remainingSec / 60);
      const hrs = Math.floor(min / 60);
      expStatus = `${Ansi.green('VALID')} (Expires in ${hrs > 0 ? `${hrs}h ` : ''}${min % 60}m ${remainingSec % 60}s - ${expDate.toISOString()})`;
    }
  }

  if (app.getFlagBool('json')) {
    app.output({
      header,
      payload,
      signaturePresent: Boolean(signature),
      isExpired,
      algorithm: header.alg || 'unknown',
    });
    process.exit(0);
  }

  app.banner('JWT Token Inspector', `Algorithm: ${header.alg || 'none'} | Status: ${isExpired ? Ansi.red('EXPIRED') : Ansi.green('ACTIVE')}`);

  app.panel('JWT Header', app.jsonHighlight(JSON.stringify(header, null, 2)));
  app.panel('JWT Payload Claims', app.jsonHighlight(JSON.stringify(payload, null, 2)));

  const metadata: Record<string, string> = {
    'Algorithm (alg)': header.alg || 'none',
    'Token Type (typ)': header.typ || 'JWT',
    'Expiration Status': expStatus,
  };

  if (payload.iat) metadata['Issued At (iat)'] = new Date(payload.iat * 1000).toISOString();
  if (payload.nbf) metadata['Not Before (nbf)'] = new Date(payload.nbf * 1000).toISOString();
  if (payload.iss) metadata['Issuer (iss)'] = String(payload.iss);
  if (payload.sub) metadata['Subject (sub)'] = String(payload.sub);
  if (payload.aud) metadata['Audience (aud)'] = String(payload.aud);
  metadata['Signature'] = signature ? `${signature.slice(0, 16)}... (${signature.length} chars)` : 'None';

  app.println(`${Ansi.bold('Claims Summary:')}`);
  app.printKv(metadata);
}

run();
