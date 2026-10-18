#!/usr/bin/env bun
/**
 * Qalculate Algebraic Equation Solver & Math Engine
 */

import { SimpleCLI, stdlib } from '../src/index.ts';

const app = SimpleCLI.newApp('qalc-cli', '1.0.0')
  .setDescription('Advanced Algebraic Equation Solver & Scientific Engine');

app.addFlagString('solve', 's', '', 'Solve algebraic equation (e.g. "2*x + 5 = 15")');
app.addFlagString('eval', 'e', '', 'Evaluate expression (e.g. "gcd(48, 180) + lcm(12, 15)")');

if (!app.parseCli()) process.exit(0);

app.banner('Qalculate Algebraic Solver', 'v1.0.0 - Equation & Number Theory Engine');

// Basic GCD & LCM
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function lcm(a: number, b: number): number {
  return (!a || !b) ? 0 : Math.abs((a * b) / gcd(a, b));
}

// Linear equation solver: a*x + b = c
function solveLinear(eqStr: string): { x: number; formula: string } | null {
  try {
    const parts = eqStr.split('=');
    if (parts.length !== 2) return null;
    const left = parts[0]?.trim() || '';
    const right = parseFloat(parts[1]?.trim() || '0');

    // match a*x + b
    const match = left.match(/([+-]?\s*\d*\.?\d*)\s*\*?\s*x\s*([+-]\s*\d+\.?\d*)?/);
    if (!match) return null;

    let a = parseFloat(match[1]?.replace(/\s+/g, '') || '1');
    if (isNaN(a)) a = match[1]?.trim() === '-' ? -1 : 1;
    const b = match[2] ? parseFloat(match[2].replace(/\s+/g, '')) : 0;

    const x = (right - b) / a;
    return { x, formula: `x = (${right} - ${b}) / ${a}` };
  } catch {
    return null;
  }
}

const eq = app.getFlagString('solve') || app.getPositionalArgs().join(' ') || '2*x + 10 = 50';
const res = solveLinear(eq);

if (res) {
  app.table(
    ['Equation', 'Step Derivation', 'Solution (x)'],
    [[eq, res.formula, res.x.toString()]]
  );
} else {
  app.printKv({
    'Expression': eq,
    'GCD(48, 180)': gcd(48, 180),
    'LCM(12, 15)': lcm(12, 15),
  });
}
