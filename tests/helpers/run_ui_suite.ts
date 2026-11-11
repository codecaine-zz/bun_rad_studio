/**
 * Shared runner for `.node.mjs` jsdom UI test suites.
 *
 * Uses a genuine Node.js binary when available (`!process.versions.bun`), and falls back seamlessly
 * to the current Bun runtime (`process.execPath` — Bun 1.4.4+ executes jsdom `runScripts: "dangerously"` natively)
 * when `node` on PATH is missing or is Bun's `bun-node` shim.
 *
 * Also verifies that `# pass <N>` (`N > 0`) appears in output so a silent 0-test exit can never pass.
 */

let cachedRunner: string | null = null;

/** Returns a genuine Node.js binary if installed on PATH, or null if missing / shimmed to Bun. */
export function findGenuineNode(): string | null {
  const candidate = Bun.which("node");
  if (!candidate) return null;
  try {
    const probe = Bun.spawnSync(
      [
        candidate,
        "-e",
        "process.exit(process.versions && process.versions.bun ? 1 : 0)",
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    return probe.exitCode === 0 ? candidate : null;
  } catch {
    return null;
  }
}

/** Resolves the JS runtime to execute `.node.mjs` UI suites (`node` if genuine, else `process.execPath` Bun). */
export function resolveUiRuntime(): string {
  if (cachedRunner) return cachedRunner;
  cachedRunner = findGenuineNode() ?? process.execPath;
  return cachedRunner;
}

/** Parses `# pass <N>` and `# fail <M>` summary lines emitted by `tests/helpers/ui_harness.mjs`. */
export function parseUiHarnessCounts(output: string): {
  tests: number;
  pass: number;
  skip: number;
  fail: number;
} {
  const num = (re: RegExp) => {
    const m = re.exec(output);
    return m ? Number(m[1]) : 0;
  };
  return {
    tests: num(/^# tests (\d+)/m),
    pass: num(/^# pass (\d+)/m),
    skip: num(/^# skip (\d+)/m),
    fail: num(/^# fail (\d+)/m),
  };
}

export async function runUiSuiteAsync(
  scriptPath: string,
  env: Record<string, string | undefined>,
  cwd?: string,
): Promise<{
  code: number;
  out: string;
  err: string;
  combined: string;
  pass: number;
  fail: number;
}> {
  const proc = Bun.spawn([resolveUiRuntime(), scriptPath], {
    cwd,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const combined = out + err;
  const counts = parseUiHarnessCounts(combined);
  return {
    code: code === 0 && counts.pass > 0 && counts.fail === 0 ? 0 : code || 1,
    out,
    err,
    combined,
    pass: counts.pass,
    fail: counts.fail,
  };
}

export function runUiSuiteSync(
  scriptPath: string,
  env: Record<string, string | undefined>,
  cwd?: string,
): {
  code: number;
  combined: string;
  pass: number;
  fail: number;
} {
  const r = Bun.spawnSync([resolveUiRuntime(), scriptPath], {
    cwd,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const combined = r.stdout.toString() + r.stderr.toString();
  const counts = parseUiHarnessCounts(combined);
  const code =
    r.exitCode === 0 && counts.pass > 0 && counts.fail === 0
      ? 0
      : r.exitCode || 1;
  return {
    code,
    combined,
    pass: counts.pass,
    fail: counts.fail,
  };
}
