#!/usr/bin/env bun
import { SimpleCLI, stdlib } from '../src/index.ts';
import * as fs from 'node:fs';

const app = SimpleCLI.newApp('crypto-cli', '1.0.0')
  .setDescription('Cryptographic Hash, Symmetric AES, and BCrypt Studio');

app.addFlagString('algo', 'a', 'sha256', 'Hash algorithm: md5, sha1, sha256, sha512, bcrypt');
app.addFlagString('text', 't', '', 'Input plaintext string');
app.addFlagString('file', 'f', '', 'Input file path for hashing');
app.addFlagString('encrypt', 'e', '', 'Encrypt input text using AES-256 with key');
app.addFlagString('decrypt', 'd', '', 'Decrypt ciphertext using AES-256 with key');
app.addFlagString('key', 'k', '', 'Passphrase/key for AES or HMAC operations');
app.addFlagBool('interactive', 'x', false, 'Launch interactive crypto workstation');

if (!app.parseCli()) process.exit(0);

app.banner('Crypto & Hashing Studio CLI', 'v1.0.0 - Headless Security Toolkit');

async function main() {
  if (app.getFlagBool('interactive')) {
    app.panel('Crypto Studio REPL', 'Supported algorithms: MD5, SHA-1, SHA-256, SHA-512, BCrypt, AES-256.');
    const text = await app.prompt('Enter plaintext to process', 'MasterPassword123!');
    const hMd5 = stdlib.md5(text);
    const hSha256 = stdlib.sha256(text);
    const hSha512 = stdlib.sha512(text);
    const hBcrypt = await stdlib.bcryptHash(text);

    app.table(
      ['Algorithm', 'Hash / Digest'],
      [
        ['MD5', hMd5],
        ['SHA-256', hSha256],
        ['SHA-512', hSha512.slice(0, 32) + '...'],
        ['BCrypt', hBcrypt],
      ]
    );
    return;
  }

  const key = app.getFlagString('key');
  const encryptTxt = app.getFlagString('encrypt');
  const decryptTxt = app.getFlagString('decrypt');

  if (encryptTxt) {
    if (!key) {
      app.error('Encryption requires --key / -k flag.');
      return;
    }
    const cipher = stdlib.aesEncrypt(encryptTxt, key);
    app.success('AES-256 Encrypted Ciphertext:');
    console.log(cipher);
    return;
  }

  if (decryptTxt) {
    if (!key) {
      app.error('Decryption requires --key / -k flag.');
      return;
    }
    try {
      const plain = stdlib.aesDecrypt(decryptTxt, key);
      app.success('AES-256 Decrypted Plaintext:');
      console.log(plain);
    } catch (err: any) {
      app.error(`AES decryption failed: ${err.message}`);
    }
    return;
  }

  const algo = app.getFlagString('algo').toLowerCase();
  const filePath = app.getFlagString('file');
  let inputData = app.getFlagString('text') || app.getPositionalArgs().join(' ');

  if (filePath) {
    if (!fs.existsSync(filePath)) {
      app.error(`File not found: ${filePath}`);
      return;
    }
    inputData = fs.readFileSync(filePath, 'utf8');
    app.info(`Read ${inputData.length} bytes from ${filePath}`);
  }

  if (!inputData) {
    inputData = 'Hello, World!';
    app.info(`No text or file specified. Using default input "${inputData}"`);
  }

  app.resetTimer();
  let hashOut = '';
  if (algo === 'md5') hashOut = stdlib.md5(inputData);
  else if (algo === 'sha1') hashOut = stdlib.sha1(inputData);
  else if (algo === 'sha512') hashOut = stdlib.sha512(inputData);
  else if (algo === 'bcrypt') hashOut = await stdlib.bcryptHash(inputData);
  else hashOut = stdlib.sha256(inputData);

  app.success(`${algo.toUpperCase()} Hash computed in ${app.elapsedMs()} ms:`);
  console.log(hashOut);
}

main();
