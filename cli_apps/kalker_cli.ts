#!/usr/bin/env bun
/**
 * Kalker Scientific Math & Calculus Studio for Bun
 */

import { SimpleCLI, stdlib } from '../src/index.ts';

const app = SimpleCLI.newApp('kalker-cli', '1.0.0')
  .setDescription('High-Precision Scientific Calculator & Calculus Evaluator CLI');

app.addFlagString('expr', 'e', '', 'Math expression to evaluate (e.g. "sin(pi / 4) * sqrt(144)")');
app.addFlagString('diff', 'd', '', 'Compute numerical derivative d/dx of function at point x (e.g. "x^2 + 3*x, x=4")');
app.addFlagString('integral', 'i', '', 'Compute definite integral ∫ f(x) dx from a to b (e.g. "x^2, 0, 3")');
app.addFlagBool('interactive', 'x', false, 'Launch interactive scientific math REPL');

if (!app.parseCli()) process.exit(0);

app.banner('Kalker Scientific & Calculus Studio', 'v1.0.0 - Mathematical Engine');

// Built-in Scientific & Calculus Evaluator
function evaluateExpression(exprStr: string): { result: number; error?: string } {
  try {
    let sanitized = exprStr
      .replace(/\bpi\b/gi, String(Math.PI))
      .replace(/\be\b/gi, String(Math.E))
      .replace(/\bphi\b/gi, '1.618033988749895')
      .replace(/\bsin\(([^)]+)\)/gi, 'Math.sin($1)')
      .replace(/\bcos\(([^)]+)\)/gi, 'Math.cos($1)')
      .replace(/\btan\(([^)]+)\)/gi, 'Math.tan($1)')
      .replace(/\basin\(([^)]+)\)/gi, 'Math.asin($1)')
      .replace(/\bacos\(([^)]+)\)/gi, 'Math.acos($1)')
      .replace(/\batan\(([^)]+)\)/gi, 'Math.atan($1)')
      .replace(/\bsqrt\(([^)]+)\)/gi, 'Math.sqrt($1)')
      .replace(/\bcbrt\(([^)]+)\)/gi, 'Math.cbrt($1)')
      .replace(/\blog\(([^)]+)\)/gi, 'Math.log10($1)')
      .replace(/\bln\(([^)]+)\)/gi, 'Math.log($1)')
      .replace(/\bexp\(([^)]+)\)/gi, 'Math.exp($1)')
      .replace(/\babs\(([^)]+)\)/gi, 'Math.abs($1)')
      .replace(/\^/g, '**');

    const fn = new Function(`"use strict"; return (${sanitized});`);
    const res = Number(fn());
    return { result: res };
  } catch (err: any) {
    return { result: NaN, error: err.message || 'Syntax Error' };
  }
}

// Numerical Derivative f'(x) using central difference
function computeDerivative(fnStr: string, xVal: number): number {
  const h = 1e-6;
  const evalAt = (x: number) => {
    const expr = fnStr.replace(/\bx\b/g, `(${x})`);
    return evaluateExpression(expr).result;
  };
  return (evalAt(xVal + h) - evalAt(xVal - h)) / (2 * h);
}

// Definite Integral ∫ f(x) dx using Simpson's Rule
function computeIntegral(fnStr: string, a: number, b: number, n: number = 1000): number {
  if (n % 2 !== 0) n++;
  const h = (b - a) / n;
  const evalAt = (x: number) => {
    const expr = fnStr.replace(/\bx\b/g, `(${x})`);
    return evaluateExpression(expr).result;
  };

  let sum = evalAt(a) + evalAt(b);
  for (let i = 1; i < n; i++) {
    const x = a + i * h;
    sum += (i % 2 === 0 ? 2 : 4) * evalAt(x);
  }
  return (h / 3) * sum;
}

async function runInteractive() {
  app.panel('Kalker Scientific REPL', 'Supported: sin, cos, tan, sqrt, ln, log, exp, pi, e, derivative, integral');
  while (true) {
    const input = await app.prompt('kalker', 'sin(pi / 4) * sqrt(144)');
    if (input === 'exit' || input === 'q') break;

    app.resetTimer();
    const { result, error } = evaluateExpression(input);
    if (error || isNaN(result)) {
      app.error(`Calculation Error: ${error || 'Invalid expression'}`);
    } else {
      app.success(`Result (${app.elapsedMs()} ms): ${app.bold(app.cyan(result.toString()))}`);
    }
  }
}

const diffArg = app.getFlagString('diff');
const intArg = app.getFlagString('integral');

if (diffArg) {
  // e.g. "x^2 + 3*x, x=4"
  const [fnStr = '', xPart = ''] = diffArg.split(',').map(s => s.trim());
  const xVal = parseFloat(xPart.replace(/^x\s*=\s*/i, '') || '1');
  const dVal = computeDerivative(fnStr, xVal);

  app.table(
    ['Calculus Operation', 'Function f(x)', 'Evaluation Point (x)', 'Derivative f\'(x)'],
    [['d/dx (Derivative)', fnStr, xVal.toString(), dVal.toFixed(6)]]
  );
} else if (intArg) {
  // e.g. "x^2, 0, 3"
  const [fnStr = '', aStr = '0', bStr = '1'] = intArg.split(',').map(s => s.trim());
  const a = parseFloat(aStr || '0');
  const b = parseFloat(bStr || '1');
  const area = computeIntegral(fnStr, a, b);

  app.table(
    ['Calculus Operation', 'Integrand f(x)', 'Lower Bound (a)', 'Upper Bound (b)', 'Definite Integral ∫'],
    [['∫ Definite Integral', fnStr, a.toString(), b.toString(), area.toFixed(6)]]
  );
} else if (app.getFlagBool('interactive')) {
  runInteractive();
} else {
  const expr = app.getPositionalArgs().join(' ') || app.getFlagString('expr') || 'sin(pi / 4) * sqrt(144)';
  app.resetTimer();
  const { result, error } = evaluateExpression(expr);

  if (error || isNaN(result)) {
    app.error(`Calculation Error: ${error || 'Invalid expression'}`);
  } else {
    app.table(
      ['Mathematical Expression', 'Calculated Result', 'Evaluation Duration'],
      [[expr, result.toString(), `${app.elapsedMs()} ms`]]
    );

    // Also display calculus derivative & integral preview
    const fnSample = 'x^2 * sin(x)';
    const dSample = computeDerivative(fnSample, Math.PI / 4);
    const iSample = computeIntegral('x^2', 0, 3);

    app.step(1, 'Calculus Engine Demonstrations');
    app.printKv({
      'Derivative d/dx [x^2 * sin(x)] at x = π/4': dSample.toFixed(6),
      'Integral ∫ [x^2] dx from 0 to 3': iSample.toFixed(6),
    });
  }
}
