// The Secrets tab's clock. Everything timed (auto-hide of revealed values, countdowns, polling) goes through here, so a
// test can replace it and never wait for real time. In the page it is simply the browser's own timers.

const real = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
};

export const clock = { ...real };

/** For tests: replace some or all of the timers. Call with no argument to go back to the real ones. */
export function setClock(replacement = {}) {
  Object.assign(clock, real, replacement);
}
