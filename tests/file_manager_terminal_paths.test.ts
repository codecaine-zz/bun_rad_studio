import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { quoteArg, quotePathsForTerminal, shellFor, windowsToWsl } from "../resources/file_manager/ui/codeRun.js";

describe("selected paths for a terminal", () => {
  test("multiple files and folders become separate shell arguments, never a command", () => {
    const paths = ["/tmp/a file.txt", "/tmp/a folder", "/tmp/plain"];
    const result = quotePathsForTerminal(paths);
    expect(result).toEqual({ text: "'/tmp/a file.txt' '/tmp/a folder' /tmp/plain " });
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
    expect(quotePathsForTerminal(["C:\\my folder\\file.txt", "D:\\data"], "wsl")).toEqual({ text: "'/mnt/c/my folder/file.txt' /mnt/d/data " });
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

  test("Command Prompt paths use double quotes and refuse what cmd can't protect", () => {
    expect(quotePathsForTerminal(["C:\\Program Files\\a & b", "C:\\plain"], "cmd")).toEqual({ text: '"C:\\Program Files\\a & b" C:\\plain ' });
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
        quoteArg, quotePathsForTerminal, shellFor, windowsToWsl, state, terminalUrl, emit, toast } = deps;
      ${source}
      return insertPaths;
    `)({
      $: () => element, Terminal: FakeTerminal, FitAddon: FakeFit,
      ResizeObserver: class { observe() {} }, WebSocket: FakeSocket,
      window: { innerHeight: 1000 }, requestAnimationFrame: () => 0,
      quoteArg, quotePathsForTerminal, shellFor, windowsToWsl,
      state: { platform: "darwin", settings: { textSize: 100 }, location: { kind: "folder", path: "/tmp" } },
      terminalUrl: () => "ws://test", emit() {}, toast: (message: string) => notices.push(message),
    }) as (paths: string[]) => Promise<void>;
    const pending = insert(["/tmp/a file", "/tmp/folder"]);
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.sent).toHaveLength(0);
    sockets[0]!.readyState = FakeSocket.OPEN;
    sockets[0]!.dispatchEvent(new Event("open"));
    await pending;
    expect(sockets[0]!.sent.map((text) => JSON.parse(text))).toEqual([{ type: "input", data: "'/tmp/a file' /tmp/folder " }]);
    expect(notices).toEqual(["Paths inserted. Add a command or press Enter when you're ready."]);
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
      "'C:\\Users\\me\\a file.txt' \\\\wsl.localhost\\Ubuntu\\home\\me ",
      '"C:\\Users\\me\\a file.txt" \\\\wsl.localhost\\Ubuntu\\home\\me ',
      "'/mnt/c/Users/me/a file.txt' /home/me ",
      "'/c/Users/me/a file.txt' \"$(wslpath -u '\\\\wsl.localhost\\Ubuntu\\home\\me')\" ",
      "'C:\\Users\\me\\a file.txt' \\\\wsl.localhost\\Ubuntu\\home\\me ",
    ]);
    expect(notices.every((n) => n.startsWith("Paths inserted"))).toBe(true);
  });
});

type FakeSocketT = EventTarget & { readyState: number; sent: string[]; onmessage?: (e: { data: string }) => void };

/** terminal.js with fake browser parts, so its shell handling can be checked without a page. */
function loadTerminal(platform: string) {
  const sockets: FakeSocketT[] = [];
  class FakeSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    readyState = 0;
    sent: string[] = [];
    onmessage?: (e: { data: string }) => void;
    constructor(_url: string) { super(); sockets.push(this); }
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
  const element = { hidden: true, style: { setProperty() {} }, setAttribute() {} };
  const source = readFileSync(new URL("../resources/file_manager/ui/terminal.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  const api = new Function("deps", `
    const { $, Terminal, FitAddon, ResizeObserver, WebSocket, window, requestAnimationFrame,
      quoteArg, quotePathsForTerminal, shellFor, windowsToWsl, state, terminalUrl, emit, toast } = deps;
    ${source}
    return { insertPaths, folderCommand };
  `)({
    $: () => element, Terminal: FakeTerminal, FitAddon: FakeFit,
    ResizeObserver: class { observe() {} }, WebSocket: FakeSocket,
    window: { innerHeight: 1000 }, requestAnimationFrame: () => 0,
    quoteArg, quotePathsForTerminal, shellFor, windowsToWsl,
    state: { platform, settings: { textSize: 100 }, location: { kind: "folder", path: platform === "win32" ? "C:\\" : "/tmp" } },
    terminalUrl: () => "ws://test", emit() {}, toast: (message: string) => notices.push(message),
  }) as { insertPaths: (paths: string[]) => Promise<void>; folderCommand: (folder: string, shell: string, wsl?: object) => string | null };
  return { ...api, sockets, notices };
}
