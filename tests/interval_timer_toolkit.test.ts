/**
 * The Timer Toolkit's logic (resources/interval_timer/index.html, between the ULT-PURE markers): phase building,
 * the clock-driven runner, stopwatch laps and the chess clock. The code under test is cut out of the page itself, so
 * what is tested is what ships. A fake clock makes every case exact.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(import.meta.dir, "..", "resources", "interval_timer", "index.html"), "utf8");
const pure = html.slice(html.indexOf("/* ULT-PURE-START */"), html.indexOf("/* ULT-PURE-END */"));
const ult = new Function(`${pure}; return { ultClamp, ultFmt, ultEsc, ultBuild, ultNormalize, ultDefaults, MODES, MODE_ORDER, UltRunner, UltStopwatch, UltChess, ULT_MAX_PHASES };`)() as any;

function fakeClock(start = 1000) {
  let now = start;
  const clock = () => now;
  return { clock, advance: (ms: number) => void (now += ms), set: (ms: number) => void (now = ms) };
}
const run = (modeId: string, raw: Record<string, unknown>, events: string[] = []) => {
  const c = fakeClock();
  const built = ult.ultBuild(modeId, raw);
  const runner = new ult.UltRunner(built.phases, { phase: (p: any, i: number, first: boolean) => events.push(`phase:${i}:${p.label}${first ? ":first" : ""}`), second: (s: number) => events.push(`s${s}`), done: () => events.push("done") }, c.clock);
  return { c, runner, built, events };
};

describe("formatting and limits", () => {
  test("times read m:ss and h:mm:ss; countdowns round up, stopwatches down", () => {
    expect(ult.ultFmt(0)).toBe("00:00");
    expect(ult.ultFmt(200)).toBe("00:01");
    expect(ult.ultFmt(61_000)).toBe("01:01");
    expect(ult.ultFmt(3_661_000)).toBe("1:01:01");
    expect(ult.ultFmt(1_990, true)).toBe("00:01.99");
    expect(ult.ultFmt(-5)).toBe("00:00");
  });
  test("numbers are clamped and never NaN; text is trimmed and shortened", () => {
    expect(ult.ultClamp("abc", 1, 10, 5)).toBe(5);
    expect(ult.ultClamp(1e9, 1, 10, 5)).toBe(10);
    expect(ult.ultClamp(-4, 1, 10, 5)).toBe(1);
    expect(ult.ultClamp(2.6, 1, 10, 5)).toBe(3);
    const v = ult.ultNormalize("countdown", { m: "999999", name: `  ${"x".repeat(100)}\n`, evil: 1 });
    expect(v.m).toBe(999);
    expect(v.name.length).toBe(40);
    expect("evil" in v).toBe(false);
  });
  test("user text is escaped for the page", () => {
    expect(ult.ultEsc(`<img src=x onerror="a">&'`)).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
  });
});

describe("building timers", () => {
  test("every sequence mode builds with its defaults", () => {
    for (const id of ult.MODE_ORDER) {
      if (ult.MODES[id].kind !== "sequence") continue;
      const built = ult.ultBuild(id, ult.ultDefaults(id));
      expect(String(built.error), id).toBe("");
      expect(built.phases.length).toBeGreaterThan(0);
    }
  });
  test("Tabata is 10 s get-ready, 8 x 20 s work with 7 x 10 s rest", () => {
    const quick = ult.MODES.rounds.quick.find((q: any) => q[0].startsWith("Tabata"))[1];
    const { phases } = ult.ultBuild("rounds", quick);
    expect(phases.length).toBe(1 + 8 + 7);
    expect(phases.reduce((a: number, p: any) => a + p.sec, 0)).toBe(10 + 8 * 20 + 7 * 10);
    expect(phases.at(-1).kind).toBe("work");
  });
  test("sets add rest between sets only, and a cool down comes last", () => {
    const { phases } = ult.ultBuild("rounds", { prep: 0, work: 30, rest: 10, rounds: 2, sets: 3, setRest: 60, cool: 120 });
    expect(phases.filter((p: any) => p.kind === "long").length).toBe(2);
    expect(phases.filter((p: any) => p.kind === "work").length).toBe(6);
    expect(phases.at(-1)).toMatchObject({ kind: "cool", sec: 120 });
  });
  test("Pomodoro: a long break after every Nth focus session and no break after the last", () => {
    const { phases } = ult.ultBuild("pomodoro", { work: 25, short: 5, long: 15, every: 2, sessions: 4 });
    expect(phases.map((p: any) => p.label)).toEqual(["Focus 1 of 4", "Short break", "Focus 2 of 4", "Long break", "Focus 3 of 4", "Short break", "Focus 4 of 4"]);
  });
  test("EMOM makes one equal step per round", () => {
    const { phases } = ult.ultBuild("emom", { rounds: 5, every: 90 });
    expect(phases.length).toBe(5);
    expect(new Set(phases.map((p: any) => p.sec))).toEqual(new Set([90]));
  });
  test("zero-length steps are dropped and an empty timer is an error, not a crash", () => {
    expect(ult.ultBuild("countdown", { h: 0, m: 0, s: 0 }).error).toContain("greater than zero");
    const { phases } = ult.ultBuild("rounds", { prep: 0, work: 10, rest: 0, rounds: 3, sets: 1, setRest: 0, cool: 0 });
    expect(phases.length).toBe(3);
  });
  test("an enormous plan is refused", () => {
    const r = ult.ultBuild("rounds", { prep: 0, work: 1, rest: 1, rounds: 200, sets: 50, setRest: 1, cool: 0 });
    expect(r.error).toContain("more than");
    expect(r.phases).toEqual([]);
  });
});

describe("the runner", () => {
  test("counts down to done exactly, with the phase and done hooks", () => {
    const { c, runner, events } = run("countdown", { h: 0, m: 0, s: 5, bell: 0 });
    runner.start();
    expect(events[0]).toBe("phase:0:Countdown:first");
    c.advance(2000); runner.tick();
    expect(runner.left()).toBe(3000);
    expect(runner.finished).toBe(false);
    c.advance(3000); runner.tick();
    expect(runner.finished).toBe(true);
    expect(runner.running).toBe(false);
    expect(events.at(-1)).toBe("done");
    expect(events.filter((e) => e === "done").length).toBe(1);
    expect(runner.left()).toBe(0);
  });
  test("pause keeps the time left and resume continues from it", () => {
    const { c, runner } = run("countdown", { h: 0, m: 1, s: 0, bell: 0 });
    runner.start();
    c.advance(20_000); runner.tick();
    runner.pause();
    c.advance(10 * 60_000);
    runner.tick();
    expect(runner.left()).toBe(40_000);
    runner.start();
    c.advance(40_000); runner.tick();
    expect(runner.finished).toBe(true);
  });
  test("no drift: late ticks do not push later phases back", () => {
    const { c, runner } = run("emom", { rounds: 4, every: 60 });
    runner.start();
    c.advance(60_000 + 137); runner.tick();
    expect(runner.idx).toBe(1);
    c.advance(60_000 - 137); runner.tick();
    expect(runner.idx).toBe(2);
    expect(runner.left()).toBe(60_000);
  });
  test("a long stall skips straight to the right phase and cues it once", () => {
    const events: string[] = [];
    const { c, runner } = run("emom", { rounds: 10, every: 60 }, events);
    runner.start();
    events.length = 0;
    c.advance(5 * 60_000 + 20_000);
    runner.tick();
    expect(runner.idx).toBe(5);
    expect(events.filter((e) => e.startsWith("phase:")).length).toBe(1);
    expect(runner.left()).toBe(40_000);
  });
  test("a stall longer than the whole plan just finishes", () => {
    const { c, runner, events } = run("emom", { rounds: 3, every: 60 });
    runner.start();
    c.advance(24 * 3600_000);
    runner.tick();
    expect(runner.finished).toBe(true);
    expect(events.filter((e) => e === "done").length).toBe(1);
  });
  test("seconds are reported once each, counting down to 1", () => {
    const { c, runner, events } = run("countdown", { h: 0, m: 0, s: 4, bell: 0 });
    runner.start();
    for (let i = 0; i < 40; i++) { c.advance(100); runner.tick(); }
    expect(events.filter((e) => /^s\d+$/.test(e))).toEqual(["s4", "s3", "s2", "s1"]);
  });
  test("next and back move between phases; back restarts a phase that is well under way", () => {
    const { c, runner } = run("rounds", { prep: 5, work: 20, rest: 10, rounds: 2, sets: 1, setRest: 0, cool: 0 });
    runner.start();
    runner.next();
    expect(runner.phase.label).toBe("Work 1 of 2");
    c.advance(10_000);
    runner.prev();
    expect(runner.idx).toBe(1);
    expect(runner.left()).toBe(20_000);
    runner.prev();
    expect(runner.idx).toBe(0);
    runner.next(); runner.next(); runner.next(); runner.next();
    expect(runner.finished).toBe(true);
  });
  test("reset returns to the start and can run again", () => {
    const { c, runner } = run("countdown", { h: 0, m: 0, s: 3, bell: 0 });
    runner.start(); c.advance(5000); runner.tick();
    expect(runner.finished).toBe(true);
    runner.reset();
    expect(runner.finished).toBe(false);
    expect(runner.left()).toBe(3000);
    runner.start(); c.advance(1000); runner.tick();
    expect(runner.left()).toBe(2000);
  });
  test("elapsed and total add up across phases", () => {
    const { c, runner } = run("rounds", { prep: 0, work: 30, rest: 10, rounds: 3, sets: 1, setRest: 0, cool: 0 });
    expect(runner.totalMs).toBe(30_000 * 3 + 10_000 * 2);
    runner.start(); c.advance(45_000); runner.tick();
    expect(runner.elapsed()).toBe(45_000);
  });
});

describe("stopwatch", () => {
  test("measures running time across pauses, and laps are splits that add up to the total", () => {
    const c = fakeClock();
    const sw = new ult.UltStopwatch(c.clock);
    expect(sw.lap()).toBeNull();
    sw.start();
    c.advance(1500);
    expect(sw.lap()).toMatchObject({ n: 1, split: 1500, total: 1500 });
    sw.pause();
    c.advance(99_999);
    expect(sw.elapsed()).toBe(1500);
    sw.start();
    c.advance(2500);
    const l2 = sw.lap();
    expect(l2).toMatchObject({ n: 2, split: 2500, total: 4000 });
    c.advance(500);
    sw.lap();
    expect(sw.extremes()).toEqual({ best: 2, worst: 1 });
    expect(sw.toCsv().split("\n")).toEqual(["lap,split,total", "1,00:01.50,00:01.50", "2,00:02.50,00:04.00", "3,00:00.50,00:04.50"]);
    sw.reset();
    expect(sw.elapsed()).toBe(0);
    expect(sw.laps).toEqual([]);
  });
  test("a lap needs a running stopwatch", () => {
    const c = fakeClock();
    const sw = new ult.UltStopwatch(c.clock);
    sw.start(); c.advance(1000); sw.pause();
    expect(sw.lap()).toBeNull();
  });
});

describe("chess clock", () => {
  test("the first press starts the opponent's clock; only the side to move counts afterwards", () => {
    const c = fakeClock();
    const g = new ult.UltChess(5, 3, c.clock);
    expect(g.press(0)).toBe(true);
    expect(g.active).toBe(1);
    c.advance(4000);
    expect(g.left(1)).toBe(5 * 60_000 - 4000);
    expect(g.press(0)).toBe(false);
    expect(g.press(1)).toBe(true);
    expect(g.left(1)).toBe(5 * 60_000 - 4000 + 3000);
    expect(g.active).toBe(0);
    expect(g.moves).toEqual([1, 1]);
  });
  test("pause stops the active clock and resume continues it", () => {
    const c = fakeClock();
    const g = new ult.UltChess(1, 0, c.clock);
    g.press(0);
    c.advance(10_000);
    g.pause();
    c.advance(60_000);
    expect(g.left(1)).toBe(50_000);
    g.resume();
    c.advance(5000);
    expect(g.left(1)).toBe(45_000);
  });
  test("a flag fall ends the game and nothing can be pressed afterwards", () => {
    const c = fakeClock();
    const g = new ult.UltChess(1, 0, c.clock);
    g.press(0);
    c.advance(61_000);
    expect(g.tick()).toBe(true);
    expect(g.flagged).toBe(1);
    expect(g.left(1)).toBe(0);
    expect(g.press(0)).toBe(false);
    expect(g.tick()).toBe(false);
  });
  test("bad sides are ignored", () => {
    const g = new ult.UltChess(1, 0, () => 0);
    expect(g.press(2 as any)).toBe(false);
  });
});

describe("the page", () => {
  test("has no YouTube player: no iframe, no IFrame API, no playback code", () => {
    expect(html).not.toContain("iframe_api");
    expect(html).not.toContain("youtube-nocookie");
    expect(html).not.toContain("YT.Player");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("loadVideoById");
  });
  test("the workout music list is plain links that open in the browser", () => {
    expect(html).toContain('target="_blank" rel="noopener noreferrer" title="Open on YouTube: ');
    expect(html).toContain("openRandomCodeCaineTrack");
  });
  test("the toolkit is reachable from the header and from the T key, and the main page's shortcuts are blocked while it is open", () => {
    expect(html).toContain('id="header-toolkit-btn"');
    expect(html).toContain("openTimerToolkit()");
    expect(html).toContain("e.code === 'KeyT'");
    expect(html).toContain("e.stopPropagation()");
  });
});
