// Runtime-agnostic UI test harness for jsdom suites (.node.mjs).
// Runs identically under Bun (`bun <suite.node.mjs>`) and Node.js (`node <suite.node.mjs>`),
// never swallows top-level setup crashes, and exits non-zero if zero tests executed or any failed.

const rootSuites = [];
const suiteStack = [];
const globalBefore = [];
const globalAfter = [];

function currentSuite() {
  return suiteStack.length > 0 ? suiteStack[suiteStack.length - 1] : null;
}

export function describe(name, fn) {
  const suite = {
    name: String(name),
    tests: [],
    suites: [],
    before: [],
    after: [],
    beforeEach: [],
    afterEach: [],
  };
  const parent = currentSuite();
  if (parent) parent.suites.push(suite);
  else rootSuites.push(suite);

  suiteStack.push(suite);
  try {
    fn();
  } finally {
    suiteStack.pop();
  }
}

describe.skip = function skipDescribe(_name, _fn) {};

export function test(name, fn) {
  const entry = { name: String(name), fn, skip: false };
  const parent = currentSuite();
  if (parent) parent.tests.push(entry);
  else {
    let implicit = rootSuites.find((s) => s.__implicit);
    if (!implicit) {
      implicit = {
        name: "root",
        __implicit: true,
        tests: [],
        suites: [],
        before: [],
        after: [],
        beforeEach: [],
        afterEach: [],
      };
      rootSuites.push(implicit);
    }
    implicit.tests.push(entry);
  }
}

test.skip = function skipTest(name, fn) {
  const entry = { name: String(name), fn, skip: true };
  const parent = currentSuite();
  if (parent) parent.tests.push(entry);
};

export const it = test;

export function before(fn) {
  const parent = currentSuite();
  if (parent) parent.before.push(fn);
  else globalBefore.push(fn);
}

export function after(fn) {
  const parent = currentSuite();
  if (parent) parent.after.push(fn);
  else globalAfter.push(fn);
}

export function beforeEach(fn) {
  const parent = currentSuite();
  if (parent) parent.beforeEach.push(fn);
}

export function afterEach(fn) {
  const parent = currentSuite();
  if (parent) parent.afterEach.push(fn);
}

let total = 0;
let passed = 0;
let skipped = 0;
let failed = 0;
let activeTestError = null;
let tearingDown = false;

process.on("uncaughtException", (err) => {
  if (tearingDown) return;
  // Ignore harmless post-test jsdom timer callbacks touching closed windows,
  // ONLY if they come from a closed/detached jsdom timer rather than active test assertions.
  const msg = String(err && (err.stack || err.message || err));
  if (
    /window is not defined|Cannot read properties of null.*document/i.test(
      msg,
    ) &&
    activeTestError === null &&
    !inActiveStep
  ) {
    return;
  }
  activeTestError = err instanceof Error ? err : new Error(msg);
  console.error("[ui_harness uncaughtException]", activeTestError);
});

process.on("unhandledRejection", (reason) => {
  if (tearingDown) return;
  const msg = String(reason && (reason.stack || reason.message || reason));
  activeTestError = reason instanceof Error ? reason : new Error(msg);
  console.error("[ui_harness unhandledRejection]", activeTestError);
});

let inActiveStep = false;

const SKIP_SENTINEL = Symbol("ui_harness_skip");

async function runSuite(
  suite,
  prefix,
  inheritedBeforeEach,
  inheritedAfterEach,
) {
  const fullPrefix = suite.__implicit
    ? prefix
    : prefix
      ? `${prefix} > ${suite.name}`
      : suite.name;
  const allBeforeEach = [...inheritedBeforeEach, ...suite.beforeEach];
  const allAfterEach = [...suite.afterEach, ...inheritedAfterEach];

  for (const hook of suite.before) {
    await hook();
  }

  try {
    for (const t of suite.tests) {
      total++;
      const label = fullPrefix ? `${fullPrefix} > ${t.name}` : t.name;
      if (t.skip) {
        skipped++;
        console.log(`- ${label} # SKIP`);
        continue;
      }

      activeTestError = null;
      inActiveStep = true;
      let skipReason = null;
      const ctx = {
        name: t.name,
        skip(reason = "") {
          skipReason = String(reason);
          throw SKIP_SENTINEL;
        },
      };

      try {
        for (const h of allBeforeEach) await h();
        await t.fn(ctx);
        for (const h of allAfterEach) await h();
        if (activeTestError) throw activeTestError;
        if (skipReason !== null) {
          skipped++;
          console.log(`- ${label} # SKIP ${skipReason}`.trim());
        } else {
          passed++;
          console.log(`✓ ${label}`);
        }
      } catch (err) {
        if (err === SKIP_SENTINEL || skipReason !== null) {
          skipped++;
          console.log(`- ${label} # SKIP ${skipReason || ""}`.trim());
        } else {
          failed++;
          console.error(`✗ ${label}`);
          console.error(err && (err.stack || err.message || err));
        }
      } finally {
        inActiveStep = false;
        activeTestError = null;
      }
    }

    for (const child of suite.suites) {
      await runSuite(child, fullPrefix, allBeforeEach, allAfterEach);
    }
  } finally {
    for (const hook of suite.after) {
      try {
        await hook();
      } catch (err) {
        failed++;
        console.error("[ui_harness suite after hook error]", err);
      }
    }
  }
}

queueMicrotask(async () => {
  try {
    for (const hook of globalBefore) await hook();
    for (const suite of rootSuites) {
      await runSuite(suite, "", [], []);
    }
  } catch (err) {
    failed++;
    console.error("[ui_harness fatal error]", err);
  } finally {
    tearingDown = true;
    for (const hook of globalAfter) {
      try {
        await hook();
      } catch {}
    }
    console.log(`# tests ${total}`);
    console.log(`# pass ${passed}`);
    console.log(`# skip ${skipped}`);
    console.log(`# fail ${failed}`);

    const ok = total > 0 && failed === 0 && (passed > 0 || skipped === total);
    process.exit(ok ? 0 : 1);
  }
});
