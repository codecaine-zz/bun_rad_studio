import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { buildRunSequence, commandInFolder, quoteArg, quotePathsForTerminal, shellFor, windowsToGitBash, windowsToWsl } from "../resources/file_manager/ui/codeRun.js";

describe("selected paths for a terminal", () => {
  test("multiple files and folders become separate shell arguments, never a command", () => {
    const paths = ["/tmp/a file.txt", "/tmp/a folder", "/tmp/plain"];
    const result = quotePathsForTerminal(paths);
    expect(result).toEqual({ text: "'/tmp/a file.txt' '/tmp/a folder' '/tmp/plain' " });
    expect(result.text).not.toMatch(/[\r\n]/);
  });

  test("quotes shell metacharacters, apostrophes, dollar substitutions and Unicode", () => {
    const paths = ["/tmp/it's mine", "/tmp/$(touch nope);x", "/tmp/\u03bb"];
    const result = quotePathsForTerminal(paths);
    expect(result).toEqual({ text: "'/tmp/it'\\''s mine' '/tmp/$(touch nope);x' '/tmp/\u03bb' " });
    if (process.platform !== "win32") {
      const proc = Bun.spawnSync(["/bin/sh", "-c", `set -- ${result.text}; printf '%s\\n' "$@"`]);
      expect(proc.exitCode).toBe(0);
      expect(proc.stdout.toString().trimEnd().split("\n")).toEqual(paths);
    }
  });

  test("PowerShell paths preserve apostrophes; WSL gets Linux paths, and wslpath only when it can't be worked out", () => {
    expect(quotePathsForTerminal(["C:\\my folder\\it's.txt"], "powershell")).toEqual({ text: "'C:\\my folder\\it''s.txt' " });
    expect(quotePathsForTerminal(["C:\\my folder\\file.txt", "D:\\data"], "wsl")).toEqual({ text: "'/mnt/c/my folder/file.txt' '/mnt/d/data' " });
    expect(quotePathsForTerminal(["\\\\wsl.localhost\\Ubuntu\\home\\me\\it's"], "wsl", { distro: "Ubuntu", driveRoot: "/mnt/" })).toEqual({ text: "'/home/me/it'\\''s' " });
    expect(quotePathsForTerminal(["\\\\server\\share\\a b"], "wsl")).toEqual({ text: '"$(wslpath -u \'\\\\server\\share\\a b\')" ' });
  });

  test("Windows paths become the paths WSL sees", () => {
    expect(windowsToWsl("C:\\")).toBe("/mnt/c");
    expect(windowsToWsl("C:")).toBe("/mnt/c");
    expect(windowsToWsl("c:\\Users\\Me\\")).toBe("/mnt/c/Users/Me");
    expect(windowsToWsl("E:/Photos/λ.jpg")).toBe("/mnt/e/Photos/λ.jpg");
    expect(windowsToWsl("C:\\Users", { driveRoot: "/" })).toBe("/c/Users");
    expect(windowsToWsl("C:\\Users", { driveRoot: "/win/" })).toBe("/win/c/Users");
    expect(windowsToWsl("C:\\Users", { driveRoot: "../bad" })).toBe("/mnt/c/Users");
    expect(windowsToWsl("\\\\wsl$\\Ubuntu\\etc\\hosts")).toBe("/etc/hosts");
    expect(windowsToWsl("\\\\wsl.localhost\\Ubuntu")).toBe("/");
    expect(windowsToWsl("\\\\WSL.LOCALHOST\\ubuntu\\home\\", { distro: "Ubuntu" })).toBe("/home");
    expect(windowsToWsl("\\\\wsl.localhost\\Debian\\home", { distro: "Ubuntu" })).toBeNull();
    expect(windowsToWsl("\\\\server\\share")).toBeNull();
    expect(windowsToWsl("relative\\path")).toBeNull();
  });

  test("Git Bash gets /c/... paths, always quoted", () => {
    expect(windowsToGitBash("C:\\")).toBe("/c");
    expect(windowsToGitBash("D:\\My Files\\")).toBe("/d/My Files");
    expect(windowsToGitBash("\\\\server\\share\\a")).toBe("//server/share/a");
    expect(quotePathsForTerminal(["C:\\Users\\me\\it's.txt", "E:\\data"], "gitbash")).toEqual({ text: "'/c/Users/me/it'\\''s.txt' '/e/data' " });
  });

  test("a command runs in a folder the way each shell needs, and only when moving there worked", () => {
    expect(commandInFolder("C:\\a b", "npm test", "powershell")).toEqual({ text: "Set-Location -LiteralPath 'C:\\a b'; if ($?) { npm test }" });
    expect(commandInFolder("C:\\a b", "npm test", "cmd")).toEqual({ text: 'cd /d "C:\\a b" && npm test' });
    expect(commandInFolder("C:\\a b", "npm test", "wsl")).toEqual({ text: "cd -- '/mnt/c/a b' && npm test" });
    expect(commandInFolder("\\\\nas\\x", "ls", "wsl")).toEqual({ text: "cd -- \"$(wslpath -u '\\\\nas\\x')\" && ls" });
    expect(commandInFolder("C:\\a b", "npm test", "gitbash")).toEqual({ text: "cd -- '/c/a b' && npm test" });
    expect("error" in commandInFolder("C:\\100%", "dir", "cmd")).toBe(true);
  });

  test("Run presets follow the terminal's shell on Windows, path placeholders included", () => {
    const vars = { path: "C:\\proj\\src\\a b.ts", workspace: "C:\\proj", root: "C:\\proj", platform: "win32" };
    const preset = { command: "bun run {file} --name {name}", cwd: "root" };
    expect((buildRunSequence(preset, vars) as any).line).toBe("Set-Location -LiteralPath 'C:\\proj'; if ($?) { bun run 'C:\\proj\\src\\a b.ts' --name 'a b.ts' }");
    expect((buildRunSequence(preset, { ...vars, shell: "cmd" }) as any).line).toBe('cd /d "C:\\proj" && bun run "C:\\proj\\src\\a b.ts" --name "a b.ts"');
    expect((buildRunSequence(preset, { ...vars, shell: "wsl", wsl: { distro: "Ubuntu", driveRoot: "/mnt/" } }) as any).line).toBe("cd -- '/mnt/c/proj' && bun run '/mnt/c/proj/src/a b.ts' --name 'a b.ts'");
    expect((buildRunSequence(preset, { ...vars, shell: "gitbash" }) as any).line).toBe("cd -- '/c/proj' && bun run '/c/proj/src/a b.ts' --name 'a b.ts'");
  });

  test("Command Prompt paths use double quotes and refuse what cmd can't protect", () => {
    expect(quotePathsForTerminal(["C:\\Program Files\\a & b", "C:\\plain"], "cmd")).toEqual({ text: '"C:\\Program Files\\a & b" "C:\\plain" ' });
    expect(quotePathsForTerminal(["C:\\100%"], "cmd").error).toBeTruthy();
    expect(quotePathsForTerminal(["C:\\say \"hi\""], "cmd").error).toBeTruthy();
    expect(quotePathsForTerminal(["C:\\x"], "nonsense")).toEqual({ text: "'C:\\x' " });
  });

  test("empty selections and control characters are explicitly refused", () => {
    for (const paths of [[], [""], ["/tmp/a\nwhoami"], ["/tmp/a\rb"], ["/tmp/a\tb"], ["/tmp/a\x1bb"], ["/tmp/a\u009bb"]]) {
      expect(quotePathsForTerminal(paths).error).toBeTruthy();
      expect(quotePathsForTerminal(paths).text).toBeUndefined();
    }
  });

  test("a fresh terminal accepts paths after opening without waiting for a folder-change message", async () => {
    const sockets: FakeSocket[] = [];
    class FakeSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      readyState = 0;
      sent: string[] = [];
      constructor(_url: string) { super(); sockets.push(this); }
      send(text: string) { this.sent.push(text); }
      close() {}
    }
    class FakeTerminal {
      reset() {}
      loadAddon(_addon: unknown) {}
      open(_host: unknown) {}
      onData(_callback: unknown) {}
      onResize(_callback: unknown) {}
      focus() {}
    }
    class FakeFit {
      fit() {}
      proposeDimensions() { return { cols: 80, rows: 24 }; }
    }
    const notices: string[] = [];
    const element = { hidden: true, style: { setProperty() {} }, setAttribute() {} };
    const source = readFileSync(new URL("../resources/file_manager/ui/terminal.js", import.meta.url), "utf8")
      .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
    const insert = new Function("deps", `
      const { $, Terminal, FitAddon, ResizeObserver, WebSocket, window, requestAnimationFrame,
        quoteArg, quotePathsForTerminal, shellFor, windowsToGitBash, windowsToWsl, state, terminalUrl, emit, toast, wireTerminalClipboard, terminalTheme = () => ({}) } = deps;
      ${source}
      return insertPaths;
    `)({
      $: () => element, Terminal: FakeTerminal, FitAddon: FakeFit,
      ResizeObserver: class { observe() {} }, WebSocket: FakeSocket,
      window: { innerHeight: 1000 }, requestAnimationFrame: () => 0,
      quoteArg, quotePathsForTerminal, shellFor, windowsToGitBash, windowsToWsl,
      state: { platform: "darwin", settings: { textSize: 100 }, location: { kind: "folder", path: "/tmp" } },
      terminalUrl: () => "ws://test", emit() {}, toast: (message: string) => notices.push(message),
      wireTerminalClipboard() {},
    }) as (paths: string[]) => Promise<void>;
    const pending = insert(["/tmp/a file", "/tmp/folder"]);
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.sent).toHaveLength(0);
    sockets[0]!.readyState = FakeSocket.OPEN;
    sockets[0]!.dispatchEvent(new Event("open"));
    await pending;
    expect(sockets[0]!.sent.map((text) => JSON.parse(text))).toEqual([{ type: "input", data: "'/tmp/a file' '/tmp/folder' " }]);
    expect(notices).toEqual(["Paths inserted. Add a command or press Enter when you're ready."]);
  });

  test("inserting multiple paths appends to pending input without resetting or submitting it", async () => {
    const { insertPaths, typeInTerminal, sockets } = loadTerminal("win32");
    typeInTerminal("Write-Output ");
    const ws = sockets[0]!;
    ws.readyState = 1;
    ws.dispatchEvent(new Event("open"));
    const paths = ["C:\\first folder", "C:\\it's a folder"];
    await insertPaths(paths);
    const messages = ws.sent.map((text) => JSON.parse(text));
    expect(messages).toEqual([
      { type: "input", data: "Write-Output " },
      { type: "input", data: "'C:\\first folder' 'C:\\it''s a folder' " },
    ]);
    expect(messages.map((message) => message.data).join("")).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(sockets).toHaveLength(1);
  });

  test("each Windows shell gets its own folder command", () => {
    const { folderCommand } = loadTerminal("win32");
    expect(folderCommand("C:\\it's here", "powershell")).toBe("\x1bSet-Location -LiteralPath 'C:\\it''s here'\r");
    expect(folderCommand("C:\\a & b", "cmd")).toBe('\x1bcd /d "C:\\a & b"\r');
    expect(folderCommand("C:\\100%", "cmd")).toBeNull();
    expect(folderCommand("C:\\My Docs", "wsl")).toBe("\x15cd -- '/mnt/c/My Docs'\r");
    expect(folderCommand("\\\\wsl.localhost\\Ubuntu\\home\\me", "wsl", { distro: "Ubuntu" })).toBe("\x15cd -- /home/me\r");
    expect(folderCommand("\\\\nas\\share", "wsl")).toBe("\x15cd -- \"$(wslpath -u '\\\\nas\\share')\"\r");
    expect(folderCommand("/tmp/a b", "posix")).toBe("\x15cd -- '/tmp/a b'\r");
    expect(folderCommand("C:\\My Docs", "gitbash")).toBe("\x15cd -- '/c/My Docs'\r");
  });

  test("on Windows, inserted paths follow the shell the terminal reports: PowerShell, Command Prompt or WSL", async () => {
    const { insertPaths, sockets, notices } = loadTerminal("win32");
    const paths = ["C:\\Users\\me\\a file.txt", "\\\\wsl.localhost\\Ubuntu\\home\\me"];
    const pending = insertPaths(paths);
    const ws = sockets[0]!;
    ws.readyState = 1;
    ws.dispatchEvent(new Event("open"));
    await pending;
    const report = (m: object) => ws.onmessage!({ data: JSON.stringify({ type: "cwd", path: "C:\\", ...m }) });
    report({ shell: "cmd" });
    await insertPaths(paths);
    report({ shell: "wsl", wsl: { distro: "Ubuntu", driveRoot: "/mnt/" } });
    await insertPaths(paths);
    report({ shell: "wsl", wsl: { distro: "Debian", driveRoot: "/" } });
    await insertPaths(paths);
    report({ shell: "powershell" });
    await insertPaths(paths);
    expect(ws.sent.map((text) => JSON.parse(text).data)).toEqual([
      "'C:\\Users\\me\\a file.txt' '\\\\wsl.localhost\\Ubuntu\\home\\me' ",
      '"C:\\Users\\me\\a file.txt" "\\\\wsl.localhost\\Ubuntu\\home\\me" ',
      "'/mnt/c/Users/me/a file.txt' '/home/me' ",
      "'/c/Users/me/a file.txt' \"$(wslpath -u '\\\\wsl.localhost\\Ubuntu\\home\\me')\" ",
      "'C:\\Users\\me\\a file.txt' '\\\\wsl.localhost\\Ubuntu\\home\\me' ",
    ]);
    expect(notices.every((n) => n.startsWith("Paths inserted"))).toBe(true);
  });

  test("following uses the reported physical folder and explains logical versus physical paths", () => {
    for (const platform of ["linux", "darwin", "win32"]) {
      const { typeInTerminal, sockets, element, navigated, settings } = loadTerminal(platform);
      typeInTerminal("pwd");
      expect(element.title).toContain("Requested terminal folder:");
      const physical = platform === "win32" ? "C:\\real folder" : "/tmp/real folder";
      sockets[0]!.onmessage!({ data: JSON.stringify({ type: "cwd", path: physical }) });
      expect(navigated).toEqual([physical]);
      expect(element.textContent).toContain(physical);
      expect(element.title).toContain(`Physical folder reported by the terminal: ${physical}`);
      expect(element.title).toContain("can differ from pwd");
      settings.terminalFollow = false;
      const next = platform === "win32" ? "C:\\another target" : "/tmp/another target";
      sockets[0]!.onmessage!({ data: JSON.stringify({ type: "cwd", path: next }) });
      expect(navigated).toEqual([physical]);
      expect(element.title).toContain(next);
    }
    const html = readFileSync(new URL("../resources/file_manager/index.html", import.meta.url), "utf8");
    expect(html).toContain("Follow terminal (real path)");
    expect(html).toContain("compare pwd -P");
  });

  test("terminal open state, height, and folder are saved and restored across restarts", () => {
    const first = loadTerminal("darwin");
    first.settings.terminalHeight = 360;
    first.showTerminal("/tmp/project");
    expect(first.element.hidden).toBe(false);
    expect(first.settings.terminalOpen).toBe(true);
    expect(first.settings.terminalHeight).toBe(360);
    expect(first.settings.terminalPath).toBe("/tmp/project");
    expect(first.savedPatches.at(-1)).toEqual({
      terminalOpen: true,
      terminalHeight: 360,
      terminalPath: "/tmp/project",
    });

    // Moving in the shell updates terminalPath (and lastPath when follow is on).
    first.sockets[0]!.onmessage!({ data: JSON.stringify({ type: "cwd", path: "/tmp/project/sub" }) });
    expect(first.settings.terminalPath).toBe("/tmp/project/sub");
    expect(first.savedPatches.at(-1)).toEqual({
      terminalPath: "/tmp/project/sub",
      lastPath: "/tmp/project/sub",
    });

    // Simulating reopening the File Manager while the terminal was left open:
    const reopened = loadTerminal("darwin");
    Object.assign(reopened.settings, {
      terminalOpen: true,
      terminalHeight: 420,
      terminalPath: "/tmp/project/sub",
    });
    reopened.restoreTerminal();
    expect(reopened.element.hidden).toBe(false);
    expect(reopened.props.get("--term-height")).toBe("420px");
    expect(reopened.urls).toEqual(["ws://test?path=/tmp/project/sub"]);

    // If the saved terminalPath was removed while closed, connection failure before open falls back to the current folder.
    reopened.sockets[0]!.onclose?.();
    expect(reopened.urls).toEqual(["ws://test?path=/tmp/project/sub", "ws://test?path=/tmp"]);

    // Closing the terminal saves terminalOpen: false so it stays closed next time.
    reopened.hideTerminal();
    expect(reopened.element.hidden).toBe(true);
    expect(reopened.settings.terminalOpen).toBe(false);
    expect(reopened.savedPatches.at(-1)).toEqual({ terminalOpen: false });
  });
});

type FakeSocketT = EventTarget & { readyState: number; sent: string[]; onmessage?: (e: { data: string }) => void; onclose?: () => void };

/** terminal.js with fake browser parts, so its shell handling can be checked without a page. */
function loadTerminal(platform: string) {
  const sockets: FakeSocketT[] = [];
  const urls: string[] = [];
  class FakeSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    readyState = 0;
    sent: string[] = [];
    onmessage?: (e: { data: string }) => void;
    onclose?: () => void;
    constructor(url: string) { super(); urls.push(url); sockets.push(this); }
    send(text: string) { this.sent.push(text); }
    close() {}
  }
  class FakeTerminal {
    reset() {}
    write() {}
    loadAddon(_addon: unknown) {}
    open(_host: unknown) {}
    onData(_callback: unknown) {}
    onResize(_callback: unknown) {}
    focus() {}
  }
  class FakeFit {
    fit() {}
    proposeDimensions() { return { cols: 80, rows: 24 }; }
  }
  const notices: string[] = [];
  const navigated: string[] = [];
  const savedPatches: Array<Record<string, unknown>> = [];
  const props = new Map<string, string>();
  const settings: Record<string, any> = { textSize: 100, terminalFollow: true, terminalOpen: false, terminalHeight: 300, terminalPath: "" };
  const element = { hidden: true, title: "", textContent: "", style: { setProperty(k: string, v: string) { props.set(k, v); } }, setAttribute() {}, contains: () => false };
  const source = readFileSync(new URL("../resources/file_manager/ui/terminal.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  const api = new Function("deps", `
    const { $, Terminal, FitAddon, ResizeObserver, WebSocket, window, document, requestAnimationFrame,
      quoteArg, quotePathsForTerminal, shellFor, windowsToGitBash, windowsToWsl, state, terminalUrl, emit, toast, goTo, saveSettings, wireTerminalClipboard, terminalTheme = () => ({}) } = deps;
    ${source}
    return { insertPaths, folderCommand, typeInTerminal, showTerminal, hideTerminal, restoreTerminal };
  `)({
    $: () => element, Terminal: FakeTerminal, FitAddon: FakeFit,
    ResizeObserver: class { observe() {} }, WebSocket: FakeSocket,
    window: { innerHeight: 1000 }, document: { activeElement: null, querySelector: () => null }, requestAnimationFrame: () => 0,
    quoteArg, quotePathsForTerminal, shellFor, windowsToGitBash, windowsToWsl,
    state: { platform, settings, location: { kind: "folder", path: platform === "win32" ? "C:\\" : "/tmp" }, terminalOpen: false },
    terminalUrl: (folder: string) => `ws://test?path=${folder}`, emit() {}, toast: (message: string) => notices.push(message),
    wireTerminalClipboard() {},
    goTo: (path: string) => navigated.push(path),
    saveSettings: (patch: Record<string, unknown>) => savedPatches.push(patch),
  }) as {
    insertPaths: (paths: string[]) => Promise<void>;
    folderCommand: (folder: string, shell: string, wsl?: object) => string | null;
    typeInTerminal: (text: string) => boolean;
    showTerminal: (folder?: string) => void;
    hideTerminal: () => void;
    restoreTerminal: () => void;
  };
  return { ...api, sockets, urls, notices, element, props, navigated, settings, savedPatches };
}
