#!/usr/bin/env bun
import { SimpleCLI, stdlib } from '../src/index.ts';

const app = SimpleCLI.newApp('calc-cli', '1.0.0')
  .setDescription('Programmer Calculator (HEX, DEC, OCT, BIN, Bitwise Ops) CLI');

app.addFlagString('val', 'v', '255', 'Numeric value (prefix with 0x for Hex, 0b for Binary, or standard Decimal)');
app.addFlagString('op', 'o', '', 'Bitwise operation (e.g. NOT, AND, OR, XOR, SHL, SHR)');
app.addFlagString('val2', 'w', '', 'Second operand for binary bitwise operation');
app.addFlagBool('interactive', 'x', false, 'Launch interactive programmer calculator');

if (!app.parseCli()) process.exit(0);

app.banner('Programmer Calculator CLI', 'v1.0.0 - Radix & Bitwise Engine');

function parseRadixNumber(s: string): bigint {
  const clean = s.trim().toLowerCase();
  try {
    if (clean.startsWith('0x')) {
      return BigInt(clean);
    } else if (clean.startsWith('0b')) {
      return BigInt(clean);
    } else if (clean.startsWith('0o')) {
      return BigInt(clean);
    }
    return BigInt(clean);
  } catch {
    return 0n;
  }
}

function displayRadixTable(val: bigint) {
  const hexVal = '0x' + val.toString(16).toUpperCase();
  const decVal = val.toString(10);
  const octVal = '0o' + val.toString(8);
  const binVal = toBinaryString(val);

  app.table(
    ['Radix Base', 'Representation', 'Bit Size'],
    [
      ['HEX (Base 16)', hexVal, '64-bit'],
      ['DEC (Base 10)', decVal, '64-bit'],
      ['OCT (Base 8)', octVal, '64-bit'],
      ['BIN (Base 2)', binVal, '64-bit formatted'],
    ]
  );

  const notVal = ~val & 0xFFFFFFFFFFFFFFFFn;
  app.printKv({
    'Bitwise NOT (~val)': '0x' + notVal.toString(16).toUpperCase(),
    'Byte Length': `${val.toString(16).length / 2} bytes`,
  });
}

function toBinaryString(v: bigint): string {
  let s = (v & 0xFFFFFFFFFFFFFFFFn).toString(2).padStart(64, '0');
  const chunks: string[] = [];
  for (let i = 0; i < 64; i += 8) {
    chunks.push(s.slice(i, i + 8));
  }
  return chunks.join(' ');
}

async function runInteractive() {
  app.panel('Programmer Calculator REPL', 'Enter decimal, hex (0x...), or binary (0b...) numbers.');
  while (true) {
    const input = await app.prompt('Enter number', '0xDEADBEEF');
    if (input === 'exit' || input === 'q') break;
    const num = parseRadixNumber(input);
    displayRadixTable(num);
    if (!await app.confirm('Inspect another number?', true)) break;
  }
}

if (app.getFlagBool('interactive')) {
  runInteractive();
} else {
  const valStr = app.getPositionalArgs()[0] || app.getFlagString('val') || '255';
  const num = parseRadixNumber(valStr);
  displayRadixTable(num);
}
