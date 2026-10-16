// Run and Build presets: turning a saved command like "bun run {file}" into the exact text that is sent to the
// File Manager's terminal. Pure functions (no page, no server): quoting for each kind of shell, the placeholders,
// the "go to the folder first" step, and the refusal of anything that could smuggle in a second command.

export const PLACEHOLDERS = [
  ["{file}", "the full path of this file"],
  ["{name}", "the file name, like app.ts"],
  ["{stem}", "the name without its ending, like app"],
  ["{ext}", "the ending with its dot, like .ts"],
  ["{dir}", "the folder the file is in"],
  ["{workspace}", "the folder shown in the Explorer"],
  ["{root}", "the project folder: the nearest folder above the file with package.json, .git, Cargo.toml, go.mod, pyproject.toml, v.mod or Makefile"],
];

const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/;
const SAFE = { posix: /^[A-Za-z0-9_@%+=:,./-]+$/, powershell: /^[A-Za-z0-9_./\\:-]+$/, cmd: /^[A-Za-z0-9_./\\:-]+$/ };

/** "posix" (macOS, Linux), or "powershell" on Windows. */
export const shellFor = (platform) => (platform === "win32" ? "powershell" : "posix");

/** True when the text holds a line break or another control character (a tab is allowed). */
export const hasControlChars = (text) => CONTROL.test(text);

/**
 * Quotes one value for a shell, only when it needs it (so plain paths stay readable). Returns { text } or { error }.
 * posix: 'single quotes' with ' written as '\''. powershell: 'single quotes' with ' (and curly quotes) doubled.
 * cmd: "double quotes"; values holding a " or a % are refused, because cmd can't protect them.
 */
export function quoteArg(value, shell = "posix") {
  if (hasControlChars(value)) return { error: "This path has a line break or another hidden control character in it, so it won't be sent to the terminal." };
  if (value !== "" && (SAFE[shell] ?? SAFE.posix).test(value) && !(shell === "posix" && value.startsWith("~"))) return { text: value };
  if (shell === "powershell") return { text: `'${value.replace(/['\u2018\u2019\u201a\u201b]/g, (m) => m + m)}'` };
  if (shell === "cmd") {
    if (value.includes('"') || value.includes("%")) return { error: 'This path has a " or a % in it, which the Windows command prompt can\'t handle safely.' };
    return { text: `"${value.replace(/\\+$/, (m) => m + m)}"` };
  }
  return { text: `'${value.replace(/'/g, `'\\''`)}'` };
}

/**
 * Shell arguments only: no command, no Enter, and no terminal control characters.
 * @returns {{ text: string, error?: never } | { error: string, text?: never }}
 */
export function quotePathsForTerminal(paths, shell = "posix") {
  if (!Array.isArray(paths) || !paths.length) return { error: "Select one or more files or folders first." };
  const quoted = [];
  for (const path of paths) {
    if (typeof path !== "string" || !path || /[\x00-\x1f\x7f-\x9f]/.test(path)) return { error: "A selected path has a hidden control character, so it can't be pasted into a terminal safely." };
    const arg = quoteArg(path, shell === "wsl" ? "posix" : shell);
    if (arg.error) return arg;
    quoted.push(shell === "wsl" ? `"$(wslpath -u ${arg.text})"` : arg.text);
  }
  return { text: quoted.join(" ") + " " };
}

/** Splits a path at the last "/" (or "\" on Windows): { dir, name, stem, ext }. */
export function pathParts(path, platform) {
  const sepAt = platform === "win32" ? Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/")) : path.lastIndexOf("/");
  const name = path.slice(sepAt + 1);
  const dot = name.lastIndexOf(".");
  return { dir: sepAt <= 0 ? path.slice(0, sepAt + 1) : path.slice(0, sepAt), name, stem: dot > 0 ? name.slice(0, dot) : name, ext: dot > 0 ? name.slice(dot) : "" };
}

/**
 * Fills in a command's placeholders. `vars` = { path, workspace, root, platform }. {{ and }} stand for { and }.
 * Anything like ${HOME} or {a,b} is left alone. @returns {{ command: string } | { error: string }}
 */
export function expandCommand(template, vars, shell = shellFor(vars.platform)) {
  const parts = pathParts(vars.path ?? "", vars.platform);
  const values = { file: vars.path ?? "", name: parts.name, stem: parts.stem, ext: parts.ext, dir: parts.dir, workspace: vars.workspace ?? "", root: vars.root ?? "" };
  const why = {
    file: "Save this file first, so it has a place on disk.",
    ext: "This file has no ending (like .ts), so {ext} has nothing to fill in.",
    workspace: "No folder is open in the Explorer, so {workspace} has nothing to fill in.",
    root: "No project folder was found above this file (looking for package.json, .git, Cargo.toml, go.mod, pyproject.toml, v.mod or Makefile).",
  };
  let out = "";
  for (let i = 0; i < template.length; i++) {
    const c = template[i];
    if (c === "{" && template[i + 1] === "{") { out += "{"; i++; } else if (c === "}" && template[i + 1] === "}") { out += "}"; i++; } else if (c === "{") {
      const end = template.indexOf("}", i);
      const word = end > 0 ? template.slice(i + 1, end) : "";
      if (end > 0 && word in values && template[i - 1] !== "$") {
        if (values[word] === "") return { error: why[word] ?? `{${word}} has nothing to fill in.` };
        const q = quoteArg(values[word], shell);
        if (q.error) return { error: q.error };
        out += q.text;
        i = end;
      } else if (end > 0 && /^[a-z]+$/.test(word) && template[i - 1] !== "$") return { error: `{${word}} isn't a placeholder this editor knows. The ones you can use are {file}, {name}, {stem}, {ext}, {dir}, {workspace} and {root}.` };
      else out += c;
    } else out += c;
  }
  return { command: out };
}

/**
 * The exact text to send to the terminal for a preset: go to its working folder (and stop if that fails), run the
 * command, press Enter. `vars` = { path, workspace, root, platform }.
 * @returns {{ send: string, line: string, dir: string } | { error: string }}
 */
export function buildRunSequence(preset, vars) {
  const shell = vars.shell ?? shellFor(vars.platform);
  if (!vars.path) return { error: "Save this file first, so the command knows where it is." };
  if (hasControlChars(preset.command)) return { error: "The command must be on a single line." };
  const expanded = expandCommand(preset.command, vars, shell);
  if (expanded.error) return { error: expanded.error };
  const parts = pathParts(vars.path, vars.platform);
  const dir = preset.cwd === "workspace" ? vars.workspace : preset.cwd === "root" ? vars.root : parts.dir;
  if (!dir) return { error: preset.cwd === "root" ? "No project folder was found above this file, so the command can't run \"in the project folder\". Pick another working folder." : "No folder is open in the Explorer, so the command can't run in it. Pick another working folder." };
  const q = quoteArg(dir, shell);
  if (q.error) return { error: q.error };
  const line = shell === "cmd" ? `cd /d ${q.text} && ${expanded.command}` : shell === "powershell" ? `Set-Location -LiteralPath ${q.text}; if ($?) { ${expanded.command} }` : `cd ${q.text} && ${expanded.command}`;
  if (hasControlChars(line)) return { error: "That command has a line break in it, so it won't be sent to the terminal." };
  return { send: `${line}\r`, line, dir };
}

/** Commands that deserve a "Are you sure?" first: deleting, moving, super-user, redirects, piping into a shell, forcing. Same rule as the server's. */
export function needsConfirmation(command) {
  return /(^|[\s;&|(])(rm|rmdir|sudo|mv|dd|mkfs[\w.]*)(\s|$)|>|\|\s*(sudo\s+)?(sh|bash|zsh|dash|ksh)\b|--force\b|\s-rf?\b|(^|\s)-fr\b/.test(command);
}

/**
 * Ready-made presets to add with one click. langs: language ids (codeLang.js) or "*" for any file.
 * `repo` ones are for developing this app (Bun RAD Studio).
 */
export const SUGGESTIONS = [
  { name: "Run with Node", command: "node {file}", kind: "run", cwd: "file", langs: ["javascript"], tip: "Runs this JavaScript file with Node.js." },
  { name: "Run with Bun", command: "bun run {file}", kind: "run", cwd: "file", langs: ["javascript", "typescript"], tip: "Runs this file with Bun." },
  { name: "Test this file (Bun)", command: "bun test {file}", kind: "run", cwd: "root", langs: ["javascript", "typescript"], tip: "Runs the tests in this file with Bun's test runner." },
  { name: "Type-check", command: "tsc --noEmit", kind: "build", cwd: "root", langs: ["typescript"], tip: "Checks the types in the whole project without writing files." },
  { name: "Lint this file", command: "eslint {file}", kind: "run", cwd: "root", langs: ["javascript", "typescript"], tip: "Looks for mistakes and style problems with ESLint." },
  { name: "Check formatting", command: "prettier --check {file}", kind: "run", cwd: "root", langs: ["javascript", "typescript", "json", "css", "html", "markdown", "yaml"], tip: "Says whether this file is formatted the way Prettier likes." },
  { name: "Run with Python", command: "python3 {file}", kind: "run", cwd: "file", langs: ["python"], tip: "Runs this file with Python 3." },
  { name: "Test with pytest", command: "python3 -m pytest {file}", kind: "run", cwd: "root", langs: ["python"], tip: "Runs the tests in this file with pytest." },
  { name: "Run with Go", command: "go run {file}", kind: "run", cwd: "file", langs: ["go"], tip: "Compiles and runs this Go file." },
  { name: "Build with Go", command: "go build ./...", kind: "build", cwd: "root", langs: ["go"], tip: "Compiles every package in the project." },
  { name: "Run with Cargo", command: "cargo run", kind: "run", cwd: "root", langs: ["rust"], tip: "Builds and runs the Rust project." },
  { name: "Build with Cargo", command: "cargo build", kind: "build", cwd: "root", langs: ["rust"], tip: "Builds the Rust project." },
  { name: "Test with Cargo", command: "cargo test", kind: "run", cwd: "root", langs: ["rust"], tip: "Runs the Rust project's tests." },
  { name: "Run with Bash", command: "bash {file}", kind: "run", cwd: "file", langs: ["shell"], tip: "Runs this script with Bash." },
  { name: "Check with ShellCheck", command: "shellcheck {file}", kind: "run", cwd: "file", langs: ["shell"], tip: "Looks for mistakes in this shell script." },
  { name: "Run with Ruby", command: "ruby {file}", kind: "run", cwd: "file", langs: ["ruby"], tip: "Runs this Ruby file." },
  { name: "Run with PHP", command: "php {file}", kind: "run", cwd: "file", langs: ["php"], tip: "Runs this PHP file." },
  { name: "Run with Lua", command: "lua {file}", kind: "run", cwd: "file", langs: ["lua"], tip: "Runs this Lua file." },
  { name: "Run with Java", command: "java {file}", kind: "run", cwd: "file", langs: ["java"], tip: "Runs this single Java file (needs Java 11 or newer)." },
  { name: "Run make", command: "make", kind: "build", cwd: "root", langs: ["*"], tip: "Runs the project's Makefile." },
  { name: "Build with npm", command: "npm run build", kind: "build", cwd: "root", langs: ["javascript", "typescript", "json"], tip: "Runs the \"build\" script from package.json." },
  { name: "Bundle with Bun", command: "bun build {file} --outdir dist", kind: "build", cwd: "root", langs: ["javascript", "typescript"], tip: "Bundles this file into the dist folder with Bun." },
  { name: "Type-check the project (this repo)", command: "bun run typecheck", kind: "build", cwd: "root", langs: ["*"], repo: true, tip: "Runs this project's TypeScript check." },
  { name: "Build the docs (this repo)", command: "bun run docs:build", kind: "build", cwd: "root", langs: ["*"], repo: true, tip: "Rebuilds this project's documentation." },
  { name: "Run all tests (this repo)", command: "bun test", kind: "run", cwd: "root", langs: ["*"], repo: true, tip: "Runs every test of this project." },
  // V 0.5.2
  { name: "Run with V", command: "v run {file}", kind: "run", cwd: "file", langs: ["v"], tip: "Compiles and runs this V file (V 0.5.2)." },
  { name: "Run the script (./name)", command: "./{name}", kind: "run", cwd: "file", langs: ["v"], tip: "Runs a V shell script (.vsh) directly. It needs the executable permission and a #!/usr/bin/env -S v line." },
  { name: "Test this file (V)", command: "v test {file}", kind: "run", cwd: "file", langs: ["v"], tip: "Runs the test_ functions of this V file." },
  { name: "Test the project (V)", command: "v test .", kind: "run", cwd: "root", langs: ["v"], tip: "Runs all the tests of the V project (the folder with v.mod)." },
  { name: "Check formatting (v fmt)", command: "v fmt -verify {file}", kind: "run", cwd: "file", langs: ["v"], tip: "Says whether this file is formatted the way v fmt likes, without changing it." },
  { name: "Format the file (v fmt -w)", command: "v fmt -w {file}", kind: "run", cwd: "file", langs: ["v"], tip: "Rewrites this file with V's standard formatting." },
  { name: "Lint (v vet)", command: "v vet {file}", kind: "run", cwd: "file", langs: ["v"], tip: "Looks for suspicious code with V's vet tool." },
  { name: "Show the docs (v doc)", command: "v doc {file}", kind: "run", cwd: "file", langs: ["v"], tip: "Prints the documentation V finds in this file." },
  { name: "Build with V", command: "v {file}", kind: "build", cwd: "file", langs: ["v"], tip: "Compiles this V file into a program." },
  { name: "Build optimised (v -prod)", command: "v -prod {file}", kind: "build", cwd: "file", langs: ["v"], tip: "Compiles with optimisations for a release build." },
  { name: "Build with debug info (v -cg)", command: "v -cg {file}", kind: "build", cwd: "file", langs: ["v"], tip: "Compiles with debug symbols so a debugger can show the V code." },
  { name: "Build a program named after the file", command: "v -o {stem} {file}", kind: "build", cwd: "file", langs: ["v"], tip: "Compiles this file into a program named after it." },
  { name: "Check without building (v -check)", command: "v -check {file}", kind: "build", cwd: "file", langs: ["v"], tip: "Parses and type-checks this file without making a program." },
  { name: "Build the project (v .)", command: "v .", kind: "build", cwd: "root", langs: ["v"], tip: "Builds the V project in the folder with v.mod." },
  { name: "Update V (v up)", command: "v up", kind: "build", cwd: "root", langs: ["v"], tip: "Updates V itself to the newest version." },
];

/** The suggestions that make sense for a language (all of "any file", plus the ones for that language). */
export function suggestionsFor(langId) {
  return SUGGESTIONS.filter((s) => s.langs.includes("*") || s.langs.includes(langId));
}

/** A default name for a copy: "Run with Bun" becomes "Run with Bun (copy)", and so on. */
export function copyName(name, existing) {
  let candidate = `${name} (copy)`.slice(0, 60);
  for (let n = 2; existing.includes(candidate); n++) candidate = `${name.slice(0, 50)} (copy ${n})`;
  return candidate;
}
