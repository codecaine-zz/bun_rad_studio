import { expect, test, describe } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { JSDOM } from "jsdom";
import { TypingStudio, createTypingStudio } from "../applications/typing_studio";

describe("⌨️ CyberType Deluxe — Codecaine Master Edition", () => {
  const resourceDir = join(import.meta.dir, "../resources/typing_studio");

  test("1. Static assets and core components are present and structured", () => {
    const htmlPath = join(resourceDir, "index.html");
    const svgPath = join(resourceDir, "favicon.svg");

    expect(existsSync(htmlPath)).toBe(true);
    expect(existsSync(svgPath)).toBe(true);

    const html = readFileSync(htmlPath, "utf-8");
    expect(html).toContain("CyberType");
    expect(html).toContain("Codecaine Master");
    expect(html).toContain("keyboard-box");
    expect(html).toContain("resultsOverlay");
    expect(html).not.toContain("user-scalable=no");
  });

  test("2. Signature Codecaine Dual Hands posture guide and tactile homing anchors are wired", () => {
    const html = readFileSync(join(resourceDir, "index.html"), "utf-8");
    expect(html).toContain('id="handsWrapper"');
    expect(html).toContain('data-finger="l-pinky"');
    expect(html).toContain('data-finger="l-ring"');
    expect(html).toContain('data-finger="l-middle"');
    expect(html).toContain('data-finger="l-index"');
    expect(html).toContain('data-finger="thumb"');
    expect(html).toContain('data-finger="r-index"');
    expect(html).toContain('data-finger="r-middle"');
    expect(html).toContain('data-finger="r-ring"');
    expect(html).toContain('data-finger="r-pinky"');
    expect(html).toContain('id="fingerIndicator"');
    expect(html).toContain('class="key homing"');
  });

  test("3. Teaching curriculum, 10-step guided tutorial, adaptive AI, multiple modes, and arcade mini-game are present", () => {
    const html = readFileSync(join(resourceDir, "index.html"), "utf-8");
    expect(html).toContain('data-mode="tutorial"');
    expect(html).toContain('data-mode="lessons"');
    expect(html).toContain('data-mode="adaptive"');
    expect(html).toContain('data-mode="time"');
    expect(html).toContain('data-mode="words"');
    expect(html).toContain('data-mode="quote"');
    expect(html).toContain('data-mode="code"');
    expect(html).toContain('data-mode="weak"');
    expect(html).toContain('data-mode="custom"');
    expect(html).toContain('data-mode="arcade"');
    expect(html).toContain('id="arcadeOverlay"');
    expect(html).toContain('id="arcadeCanvas"');
    expect(html).toContain('id="dlgGuide"');
    expect(html).toContain('id="dlgCurriculum"');
    expect(html).toContain('id="dlgCustom"');
    expect(html).toContain('id="dlgCareer"');
  });

  test("4. WebAudio multi-switch audio profiles, hardware keyboard layouts, and themes are available", () => {
    const html = readFileSync(join(resourceDir, "index.html"), "utf-8");
    expect(html).toContain('value="thock"');
    expect(html).toContain('value="clicky"');
    expect(html).toContain('value="panda"');
    expect(html).toContain('value="topre"');
    expect(html).toContain('value="typewriter"');
    expect(html).toContain('value="cyber"');
    expect(html).toContain('value="theme-cyber"');
    expect(html).toContain('value="theme-codecaine"');
    expect(html).toContain('value="theme-matrix"');
    expect(html).toContain('value="theme-synthwave"');
    expect(html).toContain('value="theme-nord"');
    expect(html).toContain('value="theme-paper"');
    expect(html).toContain('value="qwerty"');
    expect(html).toContain('value="colemak"');
    expect(html).toContain('value="dvorak"');
    expect(html).toContain('value="workman"');
  });

  test("5. Performance telemetry, consistency, sparkline chart, per-finger breakdown & weak key diagnosis are wired", () => {
    const html = readFileSync(join(resourceDir, "index.html"), "utf-8");
    expect(html).toContain('id="hudWPM"');
    expect(html).toContain('id="hudRaw"');
    expect(html).toContain('id="hudAcc"');
    expect(html).toContain('id="hudStreak"');
    expect(html).toContain('id="hudLatency"');
    expect(html).toContain('id="resConsistency"');
    expect(html).toContain('id="resChart"');
    expect(html).toContain('id="resWeakKeys"');
    expect(html).toContain('id="resFingerBars"');
    expect(html).toContain('id="resBadges"');
  });

  test("6. Interactive DOM behavior: Tutorial steps, Adaptive AI, Layout switching & Keystroke telemetry work in JSDOM", () => {
    const html = readFileSync(join(resourceDir, "index.html"), "utf-8");
    const dom = new JSDOM(html, { url: "http://127.0.0.1:59700/" });
    const doc = dom.window.document;
    const scripts = Array.from(doc.querySelectorAll("script")).map((s) => s.textContent || "");
    for (const code of scripts) {
      new Function("window", "document", "setInterval", "clearInterval", "setTimeout", "clearTimeout", code)(
        dom.window,
        doc,
        dom.window.setInterval.bind(dom.window),
        dom.window.clearInterval.bind(dom.window),
        dom.window.setTimeout.bind(dom.window),
        dom.window.clearTimeout.bind(dom.window),
      );
    }

    // Initial words rendered in Time mode
    const wordsWrapper = doc.getElementById("wordsWrapper")!;
    expect(wordsWrapper.children.length).toBeGreaterThan(20);

    // Switch to Interactive Tutorial mode
    const tutBtn = doc.querySelector('.mode-btn[data-mode="tutorial"]') as HTMLButtonElement;
    tutBtn.click();
    const tutBriefing = doc.getElementById("tutorialBriefing")!;
    expect(tutBriefing.classList.contains("visible")).toBe(true);
    expect(doc.getElementById("tutTitle")!.textContent).toContain("Tactile Index Anchors");
    expect(doc.getElementById("targetKeyDisplay")!.textContent?.toLowerCase()).toBe("f");
    expect(doc.getElementById("fingerIndicator")!.textContent).toContain("Left Index");

    // Simulate typing the first tutorial word ("f")
    const canvas = doc.getElementById("typeCanvas")!;
    canvas.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "f", code: "KeyF", bubbles: true }));
    expect(doc.getElementById("hudStreak")!.textContent).toContain("1");

    // Switch to Adaptive AI mode
    const adaptiveBtn = doc.querySelector('.mode-btn[data-mode="adaptive"]') as HTMLButtonElement;
    adaptiveBtn.click();
    const keybrStrip = doc.getElementById("keybrStrip")!;
    expect(keybrStrip.classList.contains("visible")).toBe(true);
    expect(keybrStrip.children.length).toBe(26);

    // Switch keyboard layout to Colemak and verify row 3 home keys remap
    const selLayout = doc.getElementById("selLayout") as HTMLSelectElement;
    selLayout.value = "colemak";
    selLayout.dispatchEvent(new dom.window.Event("change"));
    const homePos3 = doc.querySelector('.key[data-pos="r3c3"]') as HTMLElement;
    expect(homePos3.dataset.key).toBe("t");

    dom.window.close();
  });

  test("7. Desktop app instance and background server operate correctly", async () => {
    const studio = new TypingStudio();
    expect(studio).toBeDefined();
    expect(typeof studio.start).toBe("function");

    const factoryApp = createTypingStudio({ fullscreen: false });
    expect(factoryApp.generateHtml()).toContain("CyberType");

    // @ts-ignore
    studio.startServer();
    // @ts-ignore
    const port = studio.port;

    const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as any;
    expect(healthJson.status).toBe("ok");
    expect(healthJson.game).toBe("typing_studio");
    expect(Array.isArray(healthJson.features)).toBe(true);

    const htmlRes = await fetch(`http://127.0.0.1:${port}/`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get("content-type")).toContain("text/html");

    const svgRes = await fetch(`http://127.0.0.1:${port}/favicon.svg`);
    expect(svgRes.status).toBe(200);
    try { (studio as any).server?.stop(); } catch {}
  });

  test("8. Gameplay regression suite: bare 'f' never triggers fullscreen, lesson advance preserves step, Colemak remaps hardware keys, and cross-word Backspace works", () => {
    const html = createTypingStudio({ fullscreen: false }).generateHtml();
    const dom = new JSDOM(html, { url: "http://127.0.0.1:59700/" });
    const doc = dom.window.document;
    let fullscreenTriggered = 0;
    (dom.window as any).toggleNativeFullscreen = () => {
      fullscreenTriggered++;
    };

    const scripts = Array.from(doc.querySelectorAll("script")).map((s) => s.textContent || "");
    for (const code of scripts) {
      new Function("window", "document", "setInterval", "clearInterval", "setTimeout", "clearTimeout", code)(
        dom.window,
        doc,
        dom.window.setInterval.bind(dom.window),
        dom.window.clearInterval.bind(dom.window),
        dom.window.setTimeout.bind(dom.window),
        dom.window.clearTimeout.bind(dom.window),
      );
    }

    // Switch to Tutorial Step 1 (which starts with "f")
    const tutBtn = doc.querySelector('.mode-btn[data-mode="tutorial"]') as HTMLButtonElement;
    tutBtn.click();
    expect(doc.getElementById("tutBadge")!.textContent).toBe("TUTORIAL 1 / 10");

    // 1. Bare 'f' keystroke must type 'f' and NEVER trigger fullscreen even with getWindowShortcutsScript loaded
    dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "f", code: "KeyF", bubbles: true }));
    expect(fullscreenTriggered).toBe(0);
    expect(doc.querySelector("#wordsWrapper .word .letter.correct")?.textContent).toBe("f");

    // 2. Press Space to advance to word 2 ("j"), then Backspace at index 0 to return to word 1
    dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
    expect(doc.querySelectorAll("#wordsWrapper .word")[1]?.classList.contains("active-word")).toBe(true);
    dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Backspace", code: "Backspace", bubbles: true }));
    expect(doc.querySelectorAll("#wordsWrapper .word")[0]?.classList.contains("active-word")).toBe(true);

    // 3. Complete all 16 words in Tutorial Step 1 and verify synchronous completion + NEXT LESSON advancement
    const allWordEls = Array.from(doc.querySelectorAll("#wordsWrapper .word"));
    const wordTexts = allWordEls.map((el) => el.textContent || "");
    // Word 0 already has "f" typed, so press Space to advance from word 0
    dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
    for (let i = 1; i < wordTexts.length; i++) {
      for (const ch of wordTexts[i]!) {
        dom.window.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", { key: ch, code: `Key${ch.toUpperCase()}`, bubbles: true }),
        );
      }
      if (i < wordTexts.length - 1) {
        dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      }
    }

    const resultsOverlay = doc.getElementById("resultsOverlay")!;
    expect(resultsOverlay.classList.contains("show")).toBe(true);
    const advanceBtn = doc.getElementById("btnAdvanceLesson") as HTMLButtonElement;
    expect(advanceBtn.style.display).toBe("inline-block");
    advanceBtn.click();

    expect(doc.getElementById("tutBadge")!.textContent).toBe("TUTORIAL 2 / 10");
    expect(doc.querySelector("#subOptions .sub-btn.active")?.textContent).toContain("S2: D/K/F/J");

    // 4. Hardware layout emulation: when Colemak is selected, physical KeyF produces 't'
    const selLayout = doc.getElementById("selLayout") as HTMLSelectElement;
    selLayout.value = "colemak";
    selLayout.dispatchEvent(new dom.window.Event("change"));
    dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "f", code: "KeyF", bubbles: true }));
    expect(doc.querySelector("#wordsWrapper .word.active-word .letter")?.classList.contains("incorrect")).toBe(true);

    dom.window.close();
  });
});
