import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { quoteArg, quotePathsForTerminal, shellFor } from "../resources/file_manager/ui/codeRun.js";

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

  test("PowerShell paths preserve apostrophes and WSL paths use wslpath", () => {
    expect(quotePathsForTerminal(["C:\\my folder\\it's.txt"], "powershell")).toEqual({ text: "'C:\\my folder\\it''s.txt' " });
    expect(quotePathsForTerminal(["C:\\my folder\\file.txt"], "wsl")).toEqual({ text: '"$(wslpath -u \'C:\\my folder\\file.txt\')" ' });
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
        quoteArg, quotePathsForTerminal, shellFor, state, terminalUrl, emit, toast } = deps;
      ${source}
      return insertPaths;
    `)({
      $: () => element, Terminal: FakeTerminal, FitAddon: FakeFit,
      ResizeObserver: class { observe() {} }, WebSocket: FakeSocket,
      window: { innerHeight: 1000 }, requestAnimationFrame: () => 0,
      quoteArg, quotePathsForTerminal, shellFor,
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
});
