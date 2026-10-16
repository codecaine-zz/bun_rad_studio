import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { clampSize, createTerminalHub, pickShell, shellFolder, terminalSupported, windowsTerminalOutput } from "../src/features/filemanager/fmTerminal";

// POSIX shell commands stay separate from the Windows ConPTY tests below.
const posix = process.platform !== "win32";
const suite = posix ? describe : describe.skip;

const root = mkdtempSync(join(tmpdir(), "fm-term-"));
const home = join(root, "home");
const work = join(root, "work with spaces");
const TOKEN = "term-token-123";
let server: ReturnType<typeof startFileManagerServer>;
let base: string;

beforeAll(() => {
  mkdirSync(home);
  mkdirSync(work);
  server = startFileManagerServer({ port: 0, host: "127.0.0.1", token: TOKEN, context: { home, dataDir: join(root, "data"), launch: async () => {} } });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(async () => {
  server.stop(true);
  if (!posix) await Bun.sleep(1000);
  rmSync(root, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
});

interface Client {
  ws: WebSocket;
  messages: any[];
  text: () => string;
  waitFor: (pattern: RegExp, ms?: number) => Promise<string>;
  closed: Promise<void>;
}

function connect(query: Record<string, string>, origin = base): Promise<Client> {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams(query).toString();
    const ws = new (WebSocket as any)(`ws://127.0.0.1:${server.port}/api/terminal?${q}`, { headers: { Origin: origin } }) as WebSocket;
    const messages: any[] = [];
    let closeNow: () => void = () => {};
    const closed = new Promise<void>((r) => (closeNow = r));
    const text = () => messages.filter((m) => m.type === "output").map((m) => m.data).join("");
    ws.onmessage = (e) => messages.push(JSON.parse(String(e.data)));
    ws.onclose = () => closeNow();
    ws.onerror = () => reject(new Error("The connection was refused"));
    ws.onopen = () => resolve({
      ws, messages, text, closed,
      waitFor: async (pattern, ms = 8000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
          if (pattern.test(text())) return text();
          await Bun.sleep(25);
        }
        throw new Error(`Timed out waiting for ${pattern}. Got: ${JSON.stringify(text().slice(-300))}`);
      },
    });
  });
}

describe("terminal helpers", () => {
  test("Windows folder metadata survives every chunk boundary without hiding normal output", () => {
    const path = "C:\\Users\\it's a folder # % \u03bb";
    const marker = `\x1b]777;file-manager-cwd;${Buffer.from(path).toString("base64")}\x07`;
    const text = `before\x1b[31m${marker}after`;
    for (let cut = 0; cut <= text.length; cut++) {
      let output = "";
      const folders: string[] = [];
      const parser = windowsTerminalOutput((s) => output += s, (p) => folders.push(p));
      parser.write(text.slice(0, cut));
      parser.write(text.slice(cut));
      parser.flush();
      expect(output).toBe("before\x1b[31mafter");
      expect(folders).toEqual([path]);
    }
  });

  test("Windows folder metadata refuses invalid paths and bounds incomplete messages", () => {
    let output = "";
    const folders: string[] = [];
    const parser = windowsTerminalOutput((s) => output += s, (p) => folders.push(p));
    for (const path of ["relative", "\\rooted", "C:\\bad\nfolder", `C:\\${"x".repeat(4096)}`]) {
      parser.write(`\x1b]777;file-manager-cwd;${Buffer.from(path).toString("base64")}\x07`);
    }
    parser.write("\x1b]777;file-manager-cwd;invalid!\x07");
    expect(folders).toEqual([]);
    const long = `\x1b]777;file-manager-cwd;${"x".repeat(32768)}`;
    parser.write(long);
    expect(output).toBe(long);
    parser.write("tail\x1b]");
    parser.flush();
    expect(output).toEndWith("tail\x1b]");
  });

  test("WSL metadata tracks the active shell for mounted drives and Linux UNC folders", () => {
    for (const path of ["C:\\Users\\it's a folder # % \u03bb", "\\\\wsl.localhost\\Ubuntu\\home\\codecaine"]) {
      const marker = `\x1b]777;file-manager-cwd;${Buffer.from(path).toString("base64")};wsl\x07`;
      for (let cut = 0; cut <= marker.length; cut++) {
        let output = "";
        const folders: [string, string][] = [];
        const parser = windowsTerminalOutput((s) => output += s, (p, shell) => folders.push([p, shell]));
        parser.write(`before${marker.slice(0, cut)}`);
        parser.write(`${marker.slice(cut)}after`);
        parser.write(`\x1b]777;file-manager-cwd;${Buffer.from("C:\\").toString("base64")}\x07`);
        parser.flush();
        expect(output).toBe("beforeafter");
        expect(folders).toEqual([[path, "wsl"], ["C:\\", "powershell"]]);
      }
    }
    const folders: string[] = [];
    const parser = windowsTerminalOutput(() => {}, (p) => folders.push(p));
    for (const payload of ["/home/user", "C:\\bad\nfolder"]) {
      parser.write(`\x1b]777;file-manager-cwd;${Buffer.from(payload).toString("base64")};wsl\x07`);
    }
    parser.write(`\x1b]777;file-manager-cwd;${Buffer.from("C:\\").toString("base64")};unknown\x07`);
    expect(folders).toEqual([]);
  });

  test("WSL prompts may add their distro and drive root, and bad details are ignored", () => {
    const folder = Buffer.from("\\\\wsl.localhost\\Ubuntu\\home\\me").toString("base64");
    const seen: unknown[] = [];
    const parser = windowsTerminalOutput(() => {}, (p, shell, wsl) => seen.push([p, shell, wsl]));
    const meta = (text: string) => Buffer.from(text).toString("base64");
    parser.write(`\x1b]777;file-manager-cwd;${folder};wsl;${meta("Ubuntu\n/mnt/")}\x07`);
    parser.write(`\x1b]777;file-manager-cwd;${folder};wsl;${meta("Ubuntu-22.04\n")}\x07`);
    parser.write(`\x1b]777;file-manager-cwd;${folder};wsl;${meta("bad name\n/mnt/")}\x07`);
    parser.write(`\x1b]777;file-manager-cwd;${folder};wsl;${meta("Ubuntu\nrelative/")}\x07`);
    parser.write(`\x1b]777;file-manager-cwd;${folder};wsl;not base64!\x07`);
    const path = "\\\\wsl.localhost\\Ubuntu\\home\\me";
    expect(seen).toEqual([
      [path, "wsl", { distro: "Ubuntu", driveRoot: "/mnt/" }],
      [path, "wsl", { distro: "Ubuntu-22.04", driveRoot: "/mnt/" }],
      [path, "wsl", null], [path, "wsl", null], [path, "wsl", null],
    ]);
  });

  test("a Command Prompt started in the terminal reports its folder through its PROMPT", () => {
    const path = "C:\\Program Files\\a & b; c";
    const marker = `\x1b]777;file-manager-cwd-cmd;${path}\x1b\\`;
    const text = `before${marker}C:\\Program Files>`;
    for (let cut = 0; cut <= text.length; cut++) {
      let output = "";
      const seen: [string, string][] = [];
      const parser = windowsTerminalOutput((s) => output += s, (p, shell) => seen.push([p, shell]));
      parser.write(text.slice(0, cut));
      parser.write(text.slice(cut));
      parser.flush();
      expect(output).toBe("beforeC:\\Program Files>");
      expect(seen).toEqual([[path, "cmd"]]);
    }
    const seen: string[] = [];
    const parser = windowsTerminalOutput(() => {}, (p) => seen.push(p));
    parser.write("\x1b]777;file-manager-cwd-cmd;relative\x1b\\\x1b]777;file-manager-cwd-cmd;C:\\a\tb\x1b\\");
    expect(seen).toEqual([]);
    let out = "";
    const other = windowsTerminalOutput((s) => out += s, () => {});
    other.write("\x1b]777;file-manager-cwdX;hello\x07");
    other.flush();
    expect(out).toBe("\x1b]777;file-manager-cwdX;hello\x07");
  });

  test("the Windows shell script makes the Command Prompt and WSL report where they are", () => {
    const ps = readFileSync(new URL("../resources/file_manager/windows-terminal-shell.ps1", import.meta.url), "utf8");
    expect(ps).toContain("$env:PROMPT = '$E]777;file-manager-cwd-cmd;$P$E\\$P$G'");
    const sh = readFileSync(new URL("../resources/file_manager/windows-terminal-wsl.sh", import.meta.url), "utf8");
    expect(sh).toContain("WSL_DISTRO_NAME");
    expect(sh).toContain("file-manager-cwd;%s;wsl;%s");
  });

  test("Git Bash prompts report their folder, and PowerShell 7 uses the PowerShell marker", () => {
    const seen: [string, string][] = [];
    let output = "";
    const parser = windowsTerminalOutput((s) => output += s, (p, shell) => seen.push([p, shell]));
    const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
    parser.write(`a\x1b]777;file-manager-cwd;${b64("C:\\Users\\me")};gitbash\x07b\x1b]777;file-manager-cwd;${b64("D:\\x")}\x07`);
    parser.write(`\x1b]777;file-manager-cwd;${b64("C:\\y")};zsh\x07`);
    parser.flush();
    expect(output).toBe("ab");
    expect(seen).toEqual([["C:\\Users\\me", "gitbash"], ["D:\\x", "powershell"]]);
  });

  test("every shell started inside the Windows terminal stays in it and reports where it is", () => {
    const read = (name: string) => readFileSync(new URL(`../resources/file_manager/${name}`, import.meta.url), "utf8");
    const ps = read("windows-terminal-shell.ps1");
    for (const name of ["powershell", "powershell.exe", "pwsh", "pwsh.exe", "bash", "bash.exe", "git-bash", "git-bash.exe", "wsl", "wsl.exe"]) {
      expect(ps).toContain(`function global:${name} {`);
    }
    expect(ps).toContain("doskey.exe') /exename=cmd.exe /macrofile=cmd-macros.txt");
    const bridge = read("windows-terminal.ps1");
    for (const name of ["'wsl', 'wsl.exe'", "'powershell', 'powershell.exe'", "'pwsh', 'pwsh.exe'", "'bash', 'bash.exe'", "'git-bash', 'git-bash.exe'"]) expect(bridge).toContain(name);
    expect(bridge).toContain("Remove-Item -LiteralPath $helpers -Recurse -Force");
    expect(bridge).toContain("$env:CHERE_INVOKING = '1'");
    // Nothing here starts a separate terminal window.
    for (const text of [ps, bridge]) expect(text).not.toMatch(/\bwt(\.exe)?\b|Start-Process|\bstart\s+""|mintty/i);
  });

  (posix ? test : test.skip)("the Git Bash start-up file reports the folder before each prompt and keeps the exit status", () => {
    const dir = mkdtempSync(join(tmpdir(), "fm-gitbash-"));
    try {
      const bin = join(dir, "bin");
      mkdirSync(bin);
      writeFileSync(join(bin, "cygpath"), "#!/bin/sh\nprintf 'C:\\\\Users\\\\me\\\\it'\\''s here'\n");
      Bun.spawnSync(["chmod", "+x", join(bin, "cygpath")]);
      const rc = join(import.meta.dir, "..", "resources", "file_manager", "windows-terminal-gitbash.sh");
      const proc = Bun.spawnSync(["bash", "--norc", "-c", `HOME=${JSON.stringify(dir)}; set -- ; . ${JSON.stringify(rc)}; false; __file_manager_cwd; echo " status=$?"; echo "pc=$PROMPT_COMMAND"`], {
        env: { PATH: `${bin}:${process.env.PATH}`, HOME: dir },
      });
      const out = proc.stdout.toString();
      const encoded = /\x1b\]777;file-manager-cwd;([A-Za-z0-9+/=]+);gitbash\x07/.exec(out)?.[1];
      expect(Buffer.from(encoded ?? "", "base64").toString("utf8")).toBe("C:\\Users\\me\\it's here");
      expect(out).toContain(" status=1");
      expect(out).toMatch(/pc=__file_manager_cwd/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Windows, macOS and Linux support terminals", () => {
    expect(terminalSupported("darwin")).toBe(true);
    expect(terminalSupported("linux")).toBe(true);
    expect(terminalSupported("win32")).toBe(true);
  });

  (posix ? test : test.skip)("pickShell uses the user's shell when it exists, otherwise one every system has", () => {
    expect(pickShell("linux", { SHELL: "/bin/sh" })).toBe("/bin/sh");
    expect(["/bin/zsh", "/bin/bash", "/bin/sh"]).toContain(pickShell("darwin", { SHELL: "relative/zsh" }));
    expect(["/bin/bash", "/bin/sh"]).toContain(pickShell("linux", { SHELL: "/no/such/shell" }));
    expect(["/bin/bash", "/bin/sh"]).toContain(pickShell("linux", {}));
  });

  test("Windows uses system PowerShell, not SHELL or a PATH executable", () => {
    expect(pickShell("win32", { SystemRoot: "D:\\Windows", SHELL: "/bin/sh" })).toBe("D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  });

  test("clampSize keeps sizes sane and ignores junk", () => {
    expect(clampSize(80, 1, 2, 500)).toBe(80);
    expect(clampSize("120", 1, 2, 500)).toBe(120);
    expect(clampSize(9999, 1, 2, 500)).toBe(500);
    expect(clampSize(-4, 24, 1, 200)).toBe(1);
    expect(clampSize("abc", 24, 1, 200)).toBe(24);
    expect(clampSize(NaN, 24, 1, 200)).toBe(24);
    expect(clampSize(undefined, 24, 1, 200)).toBe(24);
    expect(clampSize(null, 24, 1, 200)).toBe(24);
    expect(clampSize("", 24, 1, 200)).toBe(24);
  });
});

(posix ? describe.skip : describe)("Windows ConPTY terminal", () => {
  (process.env.FM_TEST_WSL === "1" ? test : test.skip)("follows real WSL Bash on entry, cd, mounted paths and exit; direct commands pass through", async () => {
    const c = await connect({ token: TOKEN, path: work, cols: "180" });
    const quote = (path: string) => `'${path.replaceAll("'", "'\\''")}'`;
    const waitFolder = async (path: string, shell: string) => {
      const canonical = realpathSync.native(path);
      const end = Date.now() + 15000;
      while (Date.now() < end) {
        const last = c.messages.filter((m) => m.type === "cwd").at(-1);
        if (last?.path === canonical && last?.shell === shell) return;
        await Bun.sleep(25);
      }
      throw new Error(`Missing ${shell} folder ${canonical}: ${JSON.stringify(c.messages.filter((m) => m.type === "cwd"))}. Output: ${JSON.stringify(c.text().slice(-1500))}`);
    };
    const send = (data: string) => c.ws.send(JSON.stringify({ type: "input", data: `${data}\r` }));
    try {
      await c.waitFor(/PS .*work with spaces>/, 20000);
      send("wsl");
      await waitFolder(work, "wsl");
      const distro = Bun.spawnSync(["wsl.exe", "--exec", "printenv", "WSL_DISTRO_NAME"], { stdout: "pipe", stderr: "pipe" });
      expect(distro.exitCode).toBe(0);
      const name = distro.stdout.toString().trim();
      expect(name).not.toBe("");
      send("cd /tmp");
      await waitFolder(`\\\\wsl.localhost\\${name}\\tmp`, "wsl");
      send("cd /");
      await waitFolder(`\\\\wsl.localhost\\${name}\\`, "wsl");
      const sub = join(work, "it's a folder # % \u03bb");
      mkdirSync(sub, { recursive: true });
      send(`cd -- "$(wslpath -u ${quote(sub)})"`);
      await waitFolder(sub, "wsl");
      send("false");
      await Bun.sleep(400);
      send("printf 'PROMPT_STATUS=%s\\n' \"$?\"");
      await c.waitFor(/PROMPT_STATUS=1/);
      send("exit");
      await waitFolder(work, "powershell");
      send("wsl --exec sh -c 'exit 7'; Write-Output ('WSL' + '_CODE=' + $LASTEXITCODE)");
      await c.waitFor(/WSL_CODE=7/);
      send(`wsl.exe -d '${name.replaceAll("'", "''")}' -u root --cd /`);
      await waitFolder(`\\\\wsl.localhost\\${name}\\`, "wsl");
      send("exit");
      await waitFolder(work, "powershell");
      expect(c.text()).not.toContain("file-manager-cwd;");
      expect(c.text()).not.toContain("could not translate");
    } finally { c.ws.close(); }
  }, 90000);

  (process.env.FM_TEST_WSL === "1" ? test : test.skip)("closing the connection stops an active WSL Bash shell", async () => {
    const c = await connect({ token: TOKEN, path: work });
    let pid = 0;
    try {
      await c.waitFor(/PS .*work with spaces>/, 20000);
      c.ws.send(JSON.stringify({ type: "input", data: "wsl\r" }));
      const end = Date.now() + 15000;
      while (!c.messages.some((m) => m.type === "cwd" && m.shell === "wsl") && Date.now() < end) await Bun.sleep(25);
      expect(c.messages.some((m) => m.type === "cwd" && m.shell === "wsl")).toBe(true);
      c.ws.send(JSON.stringify({ type: "input", data: "printf 'WSL_PID=%s\\n' \"$$\"\r" }));
      const out = await c.waitFor(/WSL_PID=\d+/);
      pid = Number(/WSL_PID=(\d+)/.exec(out)![1]);
      expect(Bun.spawnSync(["wsl.exe", "--exec", "test", "-d", `/proc/${pid}`]).exitCode).toBe(0);
    } finally { c.ws.close(); }
    const end = Date.now() + 10000;
    let status = 0;
    while (status === 0 && Date.now() < end) {
      await Bun.sleep(200);
      status = Bun.spawnSync(["wsl.exe", "--exec", "test", "-d", `/proc/${pid}`]).exitCode;
    }
    expect(status).toBe(1);
  }, 45000);

  test("reports cd, Push-Location and Pop-Location, but not subshells or registry providers", async () => {
    const sub = join(work, "it's a folder # % \u03bb");
    mkdirSync(sub, { recursive: true });
    const c = await connect({ token: TOKEN, path: work, cols: "180" });
    const folders = () => c.messages.filter((m) => m.type === "cwd").map((m) => m.path);
    const waitFolder = async (path: string) => {
      path = realpathSync.native(path);
      const end = Date.now() + 10000;
      while (!folders().includes(path) && Date.now() < end) await Bun.sleep(25);
      expect(folders()).toContain(path);
    };
    try {
      await c.waitFor(/PS .*work with spaces>/, 20000);
      const quote = (path: string) => `'${path.replaceAll("'", "''")}'`;
      c.ws.send(JSON.stringify({ type: "input", data: `cd -LiteralPath ${quote(sub)}\r` }));
      await waitFolder(sub);
      c.ws.send(JSON.stringify({ type: "input", data: `Push-Location -LiteralPath ${quote(home)}\r` }));
      await waitFolder(home);
      const count = folders().length;
      c.ws.send(JSON.stringify({ type: "input", data: "Pop-Location\r" }));
      const end = Date.now() + 10000;
      while (folders().length === count && Date.now() < end) await Bun.sleep(25);
      expect(folders().at(-1)).toBe(realpathSync.native(sub));
      const before = folders().length;
      c.ws.send(JSON.stringify({ type: "input", data: `powershell.exe -NoProfile -Command "Set-Location -LiteralPath '${home}'; Write-Output ('CHILD' + '_DONE')"\r` }));
      await c.waitFor(/CHILD_DONE/);
      c.ws.send(JSON.stringify({ type: "input", data: "Set-Location HKCU:\\; Write-Output ('REGISTRY' + '_DONE')\r" }));
      await c.waitFor(/REGISTRY_DONE/);
      await Bun.sleep(2800);
      expect(folders().length).toBe(before);
      expect(c.text()).not.toContain("file-manager-cwd;");
      c.ws.send(JSON.stringify({ type: "input", data: `Set-Location -LiteralPath ${quote(work)}\r` }));
      await waitFolder(work);
    } finally { c.ws.close(); }
  }, 45000);

  test("runs PowerShell in a folder with spaces, accepts Unicode, resizes and reports exit status", async () => {
    const c = await connect({ token: TOKEN, path: work, cols: "100", rows: "30" });
    try {
      await c.waitFor(/PS .*work with spaces>/, 20000);
      c.ws.send(JSON.stringify({ type: "input", data: "Write-Output ('WORK=' + (Get-Location).Path)\r" }));
      await c.waitFor(/WORK=.*work with spaces/, 20000);
      c.ws.send(JSON.stringify({ type: "input", data: "Write-Output ('UNICODE=' + [char]0x03bb)\r" }));
      await c.waitFor(/UNICODE=\u03bb/);
      c.ws.send(JSON.stringify({ type: "resize", cols: 90, rows: 20 }));
      c.ws.send(JSON.stringify({ type: "input", data: "Write-Output ('SIZE=' + $Host.UI.RawUI.WindowSize.Width + 'x' + $Host.UI.RawUI.WindowSize.Height)\r" }));
      await c.waitFor(/SIZE=90x20/);
      c.ws.send(JSON.stringify({ type: "input", data: "Write-Output ('SLEEP' + '_READY'); Start-Sleep -Seconds 60\r" }));
      await c.waitFor(/SLEEP_READY/);
      c.ws.send(JSON.stringify({ type: "input", data: "\x03" }));
      await c.waitFor(/SLEEP_READY[\s\S]*PS .*work with spaces>/);
      c.ws.send(JSON.stringify({ type: "input", data: "Write-Output ('AFTER' + '_CANCEL')\r" }));
      await c.waitFor(/AFTER_CANCEL/);
      c.ws.send(JSON.stringify({ type: "input", data: "exit 3\r" }));
      await Promise.race([c.closed, Bun.sleep(10000).then(() => { throw new Error("Shell did not exit"); })]);
      expect(c.messages.some((m) => m.type === "exit" && m.code === 3)).toBe(true);
    } finally { c.ws.close(); }
  }, 40000);

  test("closing the connection terminates the actual shell", async () => {
    const c = await connect({ token: TOKEN, path: work });
    let pid = 0;
    try {
      await c.waitFor(/PS .*work with spaces>/, 20000);
      c.ws.send(JSON.stringify({ type: "input", data: "Write-Output ('SHELLPID=' + $PID)\r" }));
      const out = await c.waitFor(/SHELLPID=\d+/, 20000);
      pid = Number(/SHELLPID=(\d+)/.exec(out)![1]);
    } finally { c.ws.close(); }
    const end = Date.now() + 10000;
    let alive = true;
    while (alive && Date.now() < end) {
      try { process.kill(pid, 0); await Bun.sleep(50); } catch { alive = false; }
    }
    expect(alive).toBe(false);
  }, 35000);
});

suite("terminal hub", () => {
  test("a shell starts in the given folder, and closing the hub ends it", async () => {
    const hub = createTerminalHub(2);
    const ctx = createContext({ home, dataDir: join(root, "data") });
    let out = "";
    const s = hub.open(ctx, { cwd: work, cols: 80, rows: 24, onData: (t) => (out += t), onExit: () => {} });
    expect(s).not.toBeNull();
    expect(hub.count).toBe(1);
    s!.write("echo cwd=$(basename \"$PWD\")\r");
    const end = Date.now() + 8000;
    while (!/cwd=work with spaces/.test(out) && Date.now() < end) await Bun.sleep(25);
    expect(out).toContain("cwd=work with spaces");
    hub.closeAll();
    expect(hub.count).toBe(0);
    const stop = Date.now() + 5000;
    let alive = true;
    while (alive && Date.now() < stop) {
      try { process.kill(s!.pid, 0); await Bun.sleep(50); } catch { alive = false; }
    }
    expect(alive).toBe(false);
  });

  test("the number of open terminals is limited, and a closed one frees its place", () => {
    const hub = createTerminalHub(2);
    const ctx = createContext({ home, dataDir: join(root, "data") });
    const open = () => hub.open(ctx, { cwd: work, cols: 80, rows: 24, onData: () => {}, onExit: () => {} });
    const a = open();
    const b = open();
    expect(a && b).toBeTruthy();
    expect(open()).toBeNull();
    a!.close();
    const c = open();
    expect(c).not.toBeNull();
    hub.closeAll();
  });

  test("a file is not a folder", () => {
    const hub = createTerminalHub();
    const ctx = createContext({ home, dataDir: join(root, "data") });
    expect(() => hub.open(ctx, { cwd: join(root, "nothing-here"), cols: 80, rows: 24, onData: () => {}, onExit: () => {} })).toThrow();
  });
});

suite("terminal over WebSocket", () => {
  test("runs commands in the folder it was opened at", async () => {
    const c = await connect({ token: TOKEN, path: work, cols: "100", rows: "30" });
    c.ws.send(JSON.stringify({ type: "input", data: "echo here=$(basename \"$PWD\") size=$(stty size | tr ' ' x)\r" }));
    const out = await c.waitFor(/here=work with spaces size=30x100/);
    expect(out).toContain("here=work with spaces");
    c.ws.send(JSON.stringify({ type: "resize", cols: 90, rows: 20 }));
    c.ws.send(JSON.stringify({ type: "input", data: "echo now=$(stty size | tr ' ' x)\r" }));
    await c.waitFor(/now=20x90/);
    c.ws.close();
  });

  test("tells the page when the shell ends", async () => {
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send(JSON.stringify({ type: "input", data: "exit 3\r" }));
    await c.closed;
    expect(c.messages.some((m) => m.type === "exit" && m.code === 3)).toBe(true);
  });

  test("garbage, oversized and unknown messages are ignored and the shell keeps working", async () => {
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send("not json");
    c.ws.send(JSON.stringify({ type: "input", data: 42 }));
    c.ws.send(JSON.stringify({ type: "format-the-disk" }));
    c.ws.send(JSON.stringify({ type: "input", data: "x".repeat(70 * 1024) }));
    c.ws.send(JSON.stringify({ type: "input", data: "echo alive=$((20+22))\r" }));
    await c.waitFor(/alive=42/);
    c.ws.close();
  });

  test("the fifth terminal is refused with a clear message", async () => {
    const open: Client[] = [];
    for (let i = 0; i < 4; i++) open.push(await connect({ token: TOKEN, path: work }));
    const fifth = await connect({ token: TOKEN, path: work });
    await fifth.closed;
    expect(fifth.messages.some((m) => m.type === "error" && /Too many terminals/.test(m.message))).toBe(true);
    open.forEach((c) => c.ws.close());
  });

  test("closing the page's connection ends the shell", async () => {
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send(JSON.stringify({ type: "input", data: "echo pid=$$\r" }));
    const out = await c.waitFor(/pid=\d+/);
    const pid = Number(/pid=(\d+)/.exec(out)![1]);
    c.ws.close();
    const end = Date.now() + 5000;
    let alive = true;
    while (alive && Date.now() < end) {
      try { process.kill(pid, 0); await Bun.sleep(50); } catch { alive = false; }
    }
    expect(alive).toBe(false);
  });
});

describe("terminal connection checks", () => {
  test("refuses a missing or wrong token, a foreign origin, a missing origin, a non-folder, and a plain request", async () => {
    await expect(connect({ path: work })).rejects.toThrow();
    await expect(connect({ token: "wrong", path: work })).rejects.toThrow();
    await expect(connect({ token: TOKEN, path: work }, "https://evil.example")).rejects.toThrow();
    await expect(connect({ token: TOKEN, path: join(root, "nothing-here") })).rejects.toThrow();
    const plain = await fetch(`${base}/api/terminal?token=${TOKEN}&path=${encodeURIComponent(work)}`);
    expect(plain.status).toBe(403);
    const noToken = await fetch(`${base}/api/terminal?path=${encodeURIComponent(work)}`);
    expect(noToken.status).toBe(401);
    const noOrigin = await fetch(`${base}/api/terminal?token=${TOKEN}&path=${encodeURIComponent(work)}`, { headers: { Upgrade: "websocket", Connection: "Upgrade", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Version": "13" } });
    expect(noOrigin.status).toBe(403);
  });
});

describe("assets for the terminal", () => {
  test("the page allows a WebSocket to its own address only", async () => {
    const csp = (await fetch(`${base}/`)).headers.get("content-security-policy")!;
    expect(csp).toContain(`connect-src 'self' ws://127.0.0.1:${server.port}`);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toMatch(/ws:\/\/\*|ws:;/);
  });

  test("the terminal library is served from a fixed list of files", async () => {
    for (const [name, type] of [["xterm.mjs", "javascript"], ["addon-fit.mjs", "javascript"], ["xterm.css", "css"], ["LICENSE-xterm.txt", "plain"]] as const) {
      const res = await fetch(`${base}/vendor/${name}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain(type);
    }
    expect((await fetch(`${base}/vendor/xterm.mjs.map`)).status).toBe(404);
    expect((await fetch(`${base}/vendor/..%2Fui%2Fmain.js`)).status).toBe(404);
    expect((await fetch(`${base}/vendor/other.mjs`)).status).toBe(404);
  });
});

describe("the terminal library and the page's policy", () => {
  test("each page load gets its own style nonce, used in the policy and in the page", async () => {
    const a = await fetch(`${base}/`);
    const b = await fetch(`${base}/`);
    const nonceOf = (csp: string) => /style-src 'self' 'nonce-([^']+)'/.exec(csp)?.[1];
    const csp = a.headers.get("content-security-policy")!;
    const nonce = nonceOf(csp);
    expect(nonce).toBeTruthy();
    expect(await a.text()).toContain(`name="fm-nonce" content="${nonce}"`);
    expect(nonceOf(b.headers.get("content-security-policy")!)).not.toBe(nonce);
    expect(csp).not.toContain("unsafe-inline");
  });

  test("the vendored xterm.mjs applies that nonce to every style element it makes", async () => {
    const text = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "vendor", "xterm.mjs"), "utf8");
    expect(text.match(/__fmStyle\(/g)?.length).toBe(3);
    expect(text.match(/createElement\("style"\)/g)?.length).toBe(1); // only inside __fmStyle itself
    expect(text).not.toContain("sourceMappingURL");
  });
});

suite("the file list can follow the shell", () => {
  const cwdMessages = (c: Client) => c.messages.filter((m) => m.type === "cwd").map((m) => m.path as string);
  async function waitForCwd(c: Client, path: string, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (cwdMessages(c).includes(path)) return;
      await Bun.sleep(25);
    }
    throw new Error(`No cwd message for ${path}. Got ${JSON.stringify(cwdMessages(c))}`);
  }

  test("shellFolder reads another process's folder, and refuses what it can't use", async () => {
    expect(await shellFolder(process.platform === "darwin" ? "darwin" : "linux", process.pid)).toBe(realpathSync(process.cwd()));
    expect(await shellFolder("linux", 0)).toBeNull();
    expect(await shellFolder("linux", -5)).toBeNull();
    expect(await shellFolder("linux", 1.5)).toBeNull();
    expect(await shellFolder("win32", process.pid)).toBeNull();
    expect(await shellFolder("linux", 2 ** 22 + 12345)).toBeNull();
  });

  test("typing cd moves the reported folder, including names with spaces and quotes", async () => {
    const sub = join(work, "it's a sub folder");
    mkdirSync(sub, { recursive: true });
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send(JSON.stringify({ type: "input", data: "cd \"it's a sub folder\"\r" }));
    await waitForCwd(c, realpathSync(sub));
    c.ws.send(JSON.stringify({ type: "input", data: "cd ..\r" }));
    await waitForCwd(c, realpathSync(work));
    c.ws.close();
  });

  test("nothing is sent while the shell stays where it started", async () => {
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send(JSON.stringify({ type: "input", data: "echo staying\r" }));
    await c.waitFor(/staying/);
    await Bun.sleep(1600);
    expect(cwdMessages(c)).toEqual([]);
    c.ws.close();
  });

  test("only the shell's own folder counts, not a subshell's", async () => {
    const other = join(work, "elsewhere");
    mkdirSync(other, { recursive: true });
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send(JSON.stringify({ type: "input", data: "( cd elsewhere && sleep 0.4 )\r" }));
    // A subshell moves, but the shell itself does not: nothing must be reported.
    await Bun.sleep(1500);
    expect(cwdMessages(c)).toEqual([]);
    c.ws.send(JSON.stringify({ type: "input", data: "cd elsewhere\r" }));
    await waitForCwd(c, realpathSync(other));
    c.ws.close();
  });

  test("a folder that is removed is not reported", async () => {
    const gone = join(work, "will vanish");
    mkdirSync(gone, { recursive: true });
    const c = await connect({ token: TOKEN, path: work });
    // Go in first and wait for it to be seen, so the removal can't race with a look at the folder.
    c.ws.send(JSON.stringify({ type: "input", data: "cd 'will vanish'\r" }));
    await waitForCwd(c, realpathSync(gone));
    const before = cwdMessages(c).length;
    c.ws.send(JSON.stringify({ type: "input", data: "rmdir \"$PWD\"\r" }));
    await Bun.sleep(2800);
    expect(cwdMessages(c).length).toBe(before);
    expect(existsSync(gone)).toBe(false);
    c.ws.close();
  });
});
