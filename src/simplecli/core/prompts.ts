/**
 * Interactive terminal prompts, menus, fuzzy selectors, and form wizards
 */

import { Ansi } from './ansi.ts';
import { type FormField, PathMode, type FilePickerOptions } from './types.ts';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import * as readline from 'node:readline';

export class Prompts {
  /**
   * Helper to expand tilde in paths
   */
  public static expandPath(filePath: string): string {
    if (filePath.startsWith('~')) {
      return resolve(homedir(), filePath.slice(1).replace(/^[/\\]/, ''));
    }
    return resolve(filePath);
  }

  /**
   * Reads a single line from standard input
   */
  public static async readline(promptText: string = ''): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((res) => {
      rl.question(promptText, (answer) => {
        rl.close();
        res(answer.trim());
      });
    });
  }

  /**
   * Basic string prompt with optional default value
   */
  public static async prompt(message: string, defaultVal: string = ''): Promise<string> {
    const hint = defaultVal ? ` ${Ansi.dim(`(${defaultVal})`)}` : '';
    const label = `${Ansi.cyan('?')} ${Ansi.bold(message)}${hint}: `;
    const answer = await Prompts.readline(label);
    return answer.length > 0 ? answer : defaultVal;
  }

  /**
   * Masked password prompt
   */
  public static async promptPassword(message: string, maskChar: string = '*'): Promise<string> {
    const label = `${Ansi.cyan('?')} ${Ansi.bold(message)}: `;

    if (!process.stdin.isTTY) {
      return Prompts.readline(label);
    }

    return new Promise((res) => {
      process.stdout.write(label);
      let password = '';

      const isRaw = process.stdin.isRaw;
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (chunk: string) => {
        for (const char of chunk) {
          if (char === '\r' || char === '\n' || char === '\u0004') {
            // Enter or EOF
            process.stdin.setRawMode?.(isRaw ?? false);
            process.stdin.pause();
            process.stdin.removeListener('data', onData);
            process.stdout.write('\n');
            res(password);
            return;
          } else if (char === '\u0003') {
            // Ctrl+C
            process.stdout.write('\n');
            process.exit(130);
          } else if (char === '\b' || char === '\x7f') {
            // Backspace
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else if (char.charCodeAt(0) >= 32) {
            password += char;
            process.stdout.write(maskChar);
          }
        }
      };

      process.stdin.on('data', onData);
    });
  }

  /**
   * Validated Email prompt
   */
  public static async promptEmail(message: string, defaultVal: string = ''): Promise<string> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    while (true) {
      const val = await Prompts.prompt(message, defaultVal);
      if (emailRegex.test(val)) {
        return val;
      }
      console.log(Ansi.red(`  ✖ Invalid email address format: "${val}". Please try again.`));
    }
  }

  /**
   * Validated URL prompt
   */
  public static async promptUrl(message: string, defaultVal: string = ''): Promise<string> {
    while (true) {
      const val = await Prompts.prompt(message, defaultVal);
      try {
        const u = new URL(val);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          return val;
        }
      } catch {
        // invalid URL
      }
      console.log(Ansi.red(`  ✖ Invalid URL format: "${val}". Must start with http:// or https://. Please try again.`));
    }
  }

  /**
   * Bounded numeric prompt
   */
  public static async promptNumber(message: string, defaultVal: number = 0, min: number = -Infinity, max: number = Infinity): Promise<number> {
    const boundsHint = (min !== -Infinity || max !== Infinity)
      ? ` [${min === -Infinity ? '...' : min} - ${max === Infinity ? '...' : max}]`
      : '';
    const fullMsg = `${message}${boundsHint}`;

    while (true) {
      const valStr = await Prompts.prompt(fullMsg, defaultVal.toString());
      const num = Number(valStr);
      if (!isNaN(num) && num >= min && num <= max) {
        return num;
      }
      console.log(Ansi.red(`  ✖ Value must be a valid number between ${min} and ${max}. Got: "${valStr}".`));
    }
  }

  /**
   * Boolean confirmation prompt (y/n)
   */
  public static async confirm(message: string, defaultVal: boolean = false): Promise<boolean> {
    const hint = defaultVal ? 'Y/n' : 'y/N';
    const label = `${Ansi.cyan('?')} ${Ansi.bold(message)} ${Ansi.dim(`(${hint})`)}: `;
    const answer = await Prompts.readline(label);
    if (!answer) return defaultVal;
    return /^(y|yes|true|1)$/i.test(answer);
  }

  /**
   * Interactive single-selection menu with arrow keys and fallback
   */
  public static async select(message: string, choices: string[], defaultIndex: number = 0): Promise<string> {
    if (choices.length === 0) return '';
    if (!process.stdin.isTTY) {
      console.log(`${Ansi.cyan('?')} ${Ansi.bold(message)}`);
      choices.forEach((c, idx) => console.log(`  ${idx + 1}) ${c}`));
      const ans = await Prompts.readline(`Enter choice (1-${choices.length}) [${defaultIndex + 1}]: `);
      const num = parseInt(ans, 10);
      if (!isNaN(num) && num >= 1 && num <= choices.length) {
        return choices[num - 1] ?? '';
      }
      return choices[defaultIndex] ?? choices[0] ?? '';
    }

    return new Promise((resolveChoice) => {
      let selectedIdx = Math.max(0, Math.min(defaultIndex, choices.length - 1));
      const isRaw = process.stdin.isRaw;
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const render = (firstTime: boolean = false) => {
        if (!firstTime) {
          // move cursor up by choices.length + 1 lines
          process.stdout.write(Ansi.cursorUp(choices.length + 1) + Ansi.clearLine());
        }
        process.stdout.write(`${Ansi.cyan('?')} ${Ansi.bold(message)} ${Ansi.dim('(Use ↑/↓ arrows, Enter to select)')}\n`);
        choices.forEach((choice, idx) => {
          if (idx === selectedIdx) {
            process.stdout.write(`${Ansi.cyan('❯')} ${Ansi.cyan(Ansi.bold(choice))}\n`);
          } else {
            process.stdout.write(`  ${Ansi.dim(choice)}\n`);
          }
        });
      };

      render(true);

      const onData = (chunk: string) => {
        if (chunk === '\u0003') {
          // Ctrl+C
          process.stdout.write('\n');
          process.exit(130);
        } else if (chunk === '\r' || chunk === '\n') {
          // Enter
          process.stdin.setRawMode?.(isRaw ?? false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          // clear and output final choice
          process.stdout.write(Ansi.cursorUp(choices.length + 1) + Ansi.clearLine());
          const chosen = choices[selectedIdx] ?? choices[0] ?? '';
          process.stdout.write(`${Ansi.green('✔')} ${Ansi.bold(message)}: ${Ansi.cyan(chosen)}\n`);
          resolveChoice(chosen);
        } else if (chunk === '\x1b[A' || chunk === 'k') {
          // Up
          selectedIdx = (selectedIdx - 1 + choices.length) % choices.length;
          render(false);
        } else if (chunk === '\x1b[B' || chunk === 'j') {
          // Down
          selectedIdx = (selectedIdx + 1) % choices.length;
          render(false);
        }
      };

      process.stdin.on('data', onData);
    });
  }

  /**
   * Interactive multi-selection menu with checkbox toggling
   */
  public static async multiSelect(message: string, choices: string[], defaultSelected: number[] = []): Promise<string[]> {
    if (choices.length === 0) return [];
    const selected = new Set<number>(defaultSelected);

    if (!process.stdin.isTTY) {
      console.log(`${Ansi.cyan('?')} ${Ansi.bold(message)}`);
      choices.forEach((c, idx) => console.log(`  ${idx + 1}) [${selected.has(idx) ? 'x' : ' '}] ${c}`));
      const ans = await Prompts.readline(`Enter comma-separated numbers (e.g. 1, 3): `);
      if (!ans) return Array.from(selected).map(i => choices[i] ?? '').filter(Boolean);
      const indices = ans.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(i => i >= 0 && i < choices.length);
      return indices.map(i => choices[i] ?? '').filter(Boolean);
    }

    return new Promise((resolveChoices) => {
      let cursorIdx = 0;
      const isRaw = process.stdin.isRaw;
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const render = (firstTime: boolean = false) => {
        if (!firstTime) {
          process.stdout.write(Ansi.cursorUp(choices.length + 1) + Ansi.clearLine());
        }
        process.stdout.write(`${Ansi.cyan('?')} ${Ansi.bold(message)} ${Ansi.dim('(Space to toggle, ↑/↓ to move, Enter to submit)')}\n`);
        choices.forEach((choice, idx) => {
          const isChecked = selected.has(idx);
          const checkbox = isChecked ? Ansi.green('[✔]') : Ansi.dim('[ ]');
          const cursor = idx === cursorIdx ? Ansi.cyan('❯') : ' ';
          const label = isChecked ? Ansi.bold(choice) : Ansi.dim(choice);
          process.stdout.write(`${cursor} ${checkbox} ${label}\n`);
        });
      };

      render(true);

      const onData = (chunk: string) => {
        if (chunk === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        } else if (chunk === '\r' || chunk === '\n') {
          process.stdin.setRawMode?.(isRaw ?? false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write(Ansi.cursorUp(choices.length + 1) + Ansi.clearLine());
          const chosen = Array.from(selected).map(i => choices[i] ?? '').filter(Boolean);
          process.stdout.write(`${Ansi.green('✔')} ${Ansi.bold(message)}: ${Ansi.cyan(chosen.join(', ') || '(none)')}\n`);
          resolveChoices(chosen);
        } else if (chunk === ' ') {
          if (selected.has(cursorIdx)) selected.delete(cursorIdx);
          else selected.add(cursorIdx);
          render(false);
        } else if (chunk === 'a' || chunk === 'A') {
          if (selected.size === choices.length) selected.clear();
          else choices.forEach((_, i) => selected.add(i));
          render(false);
        } else if (chunk === '\x1b[A' || chunk === 'k') {
          cursorIdx = (cursorIdx - 1 + choices.length) % choices.length;
          render(false);
        } else if (chunk === '\x1b[B' || chunk === 'j') {
          cursorIdx = (cursorIdx + 1) % choices.length;
          render(false);
        }
      };

      process.stdin.on('data', onData);
    });
  }

  /**
   * Interactive Fuzzy Finder Search Menu
   */
  public static async fuzzySelect(message: string, choices: string[]): Promise<string> {
    if (choices.length === 0) return '';
    if (!process.stdin.isTTY) {
      return Prompts.select(message, choices);
    }

    return new Promise((resolveChoice) => {
      let query = '';
      let cursorIdx = 0;
      const maxResults = Math.min(8, choices.length);
      const isRaw = process.stdin.isRaw;
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const filterChoices = (): string[] => {
        if (!query) return choices.slice(0, maxResults);
        const lowerQ = query.toLowerCase();
        return choices
          .filter(c => c.toLowerCase().includes(lowerQ))
          .slice(0, maxResults);
      };

      let currentFiltered = filterChoices();

      const render = (firstTime: boolean = false) => {
        if (!firstTime) {
          process.stdout.write(Ansi.cursorUp(maxResults + 1) + Ansi.clearLine());
        }
        process.stdout.write(`${Ansi.cyan('?')} ${Ansi.bold(message)} ${Ansi.yellow(query)}${Ansi.dim('█')} ${Ansi.dim(`(${currentFiltered.length} matches)`)}\n`);
        for (let i = 0; i < maxResults; i++) {
          const item = currentFiltered[i];
          if (!item) {
            process.stdout.write(Ansi.clearLine() + '\n');
          } else if (i === cursorIdx) {
            process.stdout.write(`${Ansi.cyan('❯')} ${Ansi.cyan(Ansi.bold(item))}\n`);
          } else {
            process.stdout.write(`  ${Ansi.dim(item)}\n`);
          }
        }
      };

      render(true);

      const onData = (chunk: string) => {
        if (chunk === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        } else if (chunk === '\r' || chunk === '\n') {
          process.stdin.setRawMode?.(isRaw ?? false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write(Ansi.cursorUp(maxResults + 1) + Ansi.clearLine());
          const chosen = currentFiltered[cursorIdx] || currentFiltered[0] || choices[0] || '';
          process.stdout.write(`${Ansi.green('✔')} ${Ansi.bold(message)}: ${Ansi.cyan(chosen)}\n`);
          resolveChoice(chosen);
        } else if (chunk === '\x1b[A') {
          // Up
          if (currentFiltered.length > 0) {
            cursorIdx = (cursorIdx - 1 + currentFiltered.length) % currentFiltered.length;
            render(false);
          }
        } else if (chunk === '\x1b[B') {
          // Down
          if (currentFiltered.length > 0) {
            cursorIdx = (cursorIdx + 1) % currentFiltered.length;
            render(false);
          }
        } else if (chunk === '\b' || chunk === '\x7f') {
          // Backspace
          if (query.length > 0) {
            query = query.slice(0, -1);
            currentFiltered = filterChoices();
            cursorIdx = 0;
            render(false);
          }
        } else if (chunk.charCodeAt(0) >= 32 && !chunk.startsWith('\x1b')) {
          query += chunk;
          currentFiltered = filterChoices();
          cursorIdx = 0;
          render(false);
        }
      };

      process.stdin.on('data', onData);
    });
  }

  /**
   * File and Directory Path Prompt with Mode Validation
   */
  public static async promptPath(message: string, defaultVal: string = '', mode: PathMode = PathMode.ANY): Promise<string> {
    while (true) {
      const inputPath = await Prompts.prompt(message, defaultVal);
      const expanded = Prompts.expandPath(inputPath);

      if (mode === PathMode.ANY) {
        return expanded;
      }

      if (!existsSync(expanded)) {
        console.log(Ansi.red(`  ✖ Path does not exist: "${inputPath}" (${expanded}).`));
        continue;
      }

      const st = statSync(expanded);
      if (mode === PathMode.FILE && !st.isFile()) {
        console.log(Ansi.red(`  ✖ Path is not a file: "${inputPath}".`));
        continue;
      }
      if (mode === PathMode.DIRECTORY && !st.isDirectory()) {
        console.log(Ansi.red(`  ✖ Path is not a directory: "${inputPath}".`));
        continue;
      }

      return expanded;
    }
  }

  /**
   * Interactive Multi-field Form Wizard
   */
  public static async form(title: string, fields: FormField[]): Promise<Record<string, string>> {
    console.log(`\n${Ansi.bold(Ansi.bgCyan(Ansi.black(` 📋 FORM: ${title} `)))}\n`);
    const results: Record<string, string> = {};

    for (const f of fields) {
      const kind = f.kind || 'text';
      let val = '';

      if (kind === 'password') {
        val = await Prompts.promptPassword(f.label);
      } else if (kind === 'boolean') {
        const boolVal = await Prompts.confirm(f.label, f.defaultVal === 'true');
        val = boolVal ? 'true' : 'false';
      } else if (kind === 'number') {
        const numVal = await Prompts.promptNumber(f.label, f.defaultVal ? Number(f.defaultVal) : 0);
        val = numVal.toString();
      } else if (kind === 'select' && f.choices && f.choices.length > 0) {
        val = await Prompts.select(f.label, f.choices);
      } else {
        val = await Prompts.prompt(f.label, f.defaultVal || '');
      }

      if (f.required && !val) {
        console.log(Ansi.red(`  ✖ Field "${f.label}" is required.`));
      }
      results[f.key] = val;
    }

    return results;
  }

  /**
   * Interactive File & Directory Explorer Picker
   */
  public static async filePicker(message: string = 'Select a file or directory:', options: FilePickerOptions = {}): Promise<string> {
    let currentDir = resolve(options.baseDir ? Prompts.expandPath(options.baseDir) : process.cwd());
    const mode = options.mode ?? PathMode.ANY;
    const extensions = options.extensions?.map(e => e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`);
    const allowHidden = options.allowHidden ?? false;

    if (!process.stdin.isTTY) {
      return Prompts.promptPath(message, currentDir, mode);
    }

    interface FileEntry {
      name: string;
      displayName: string;
      fullPath: string;
      isDir: boolean;
    }

    const readEntries = (dir: string): FileEntry[] => {
      const list: FileEntry[] = [];
      const parent = dirname(dir);
      if (parent !== dir) {
        list.push({ name: '..', displayName: '📁 .. (Parent Directory)', fullPath: parent, isDir: true });
      }

      try {
        const files = readdirSync(dir, { withFileTypes: true });
        // Directories first
        for (const f of files) {
          if (!allowHidden && f.name.startsWith('.') && f.name !== '..') continue;
          if (f.isDirectory()) {
            list.push({
              name: f.name,
              displayName: `📁 ${f.name}/`,
              fullPath: join(dir, f.name),
              isDir: true,
            });
          }
        }
        // Then files
        for (const f of files) {
          if (!allowHidden && f.name.startsWith('.')) continue;
          if (f.isFile() || f.isSymbolicLink()) {
            if (extensions && extensions.length > 0) {
              const lower = f.name.toLowerCase();
              if (!extensions.some(ext => lower.endsWith(ext))) continue;
            }
            list.push({
              name: f.name,
              displayName: `📄 ${f.name}`,
              fullPath: join(dir, f.name),
              isDir: false,
            });
          }
        }
      } catch {
        // Unreadable directory
      }

      return list;
    };

    return new Promise((resolveChoice) => {
      let entries = readEntries(currentDir);
      let cursorIdx = 0;
      const pageSize = 10;
      const isRaw = process.stdin.isRaw;
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      let lastRenderedLines = 0;

      const render = (firstTime: boolean = false) => {
        if (!firstTime && lastRenderedLines > 0) {
          process.stdout.write(Ansi.cursorUp(lastRenderedLines) + Ansi.clearLine());
        }

        const visibleCount = Math.min(pageSize, entries.length);
        const startIdx = Math.max(0, Math.min(cursorIdx - Math.floor(pageSize / 2), entries.length - visibleCount));
        const visibleEntries = entries.slice(startIdx, startIdx + visibleCount);

        let out = `${Ansi.cyan('?')} ${Ansi.bold(message)} ${Ansi.dim(`[${currentDir}]`)}\n`;
        out += `${Ansi.dim('  (↑/↓: navigate, Enter: open/select, Space: select folder, q: cancel)')}\n`;

        if (entries.length === 0) {
          out += `  ${Ansi.dim('(empty directory)')}\n`;
        } else {
          visibleEntries.forEach((entry, i) => {
            const actualIdx = startIdx + i;
            const isSelected = actualIdx === cursorIdx;
            const prefix = isSelected ? Ansi.cyan('❯') : ' ';
            const label = isSelected ? Ansi.bold(Ansi.cyan(entry.displayName)) : entry.displayName;
            out += `${prefix} ${label}\n`;
          });
        }

        const lines = out.split('\n').length - 1;
        lastRenderedLines = lines;
        process.stdout.write(out);
      };

      render(true);

      const cleanup = () => {
        process.stdin.setRawMode?.(isRaw ?? false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        if (lastRenderedLines > 0) {
          process.stdout.write(Ansi.cursorUp(lastRenderedLines) + Ansi.clearLine());
        }
      };

      const onData = (chunk: string) => {
        if (chunk === '\u0003' || chunk === 'q' || chunk === '\x1b') {
          // Cancel
          cleanup();
          process.stdout.write(`${Ansi.yellow('!')} ${Ansi.bold(message)}: ${Ansi.dim('(cancelled)')}\n`);
          resolveChoice('');
        } else if (chunk === ' ' && (mode === PathMode.DIRECTORY || mode === PathMode.ANY)) {
          // Select current directory with Space
          cleanup();
          process.stdout.write(`${Ansi.green('✔')} ${Ansi.bold(message)}: ${Ansi.cyan(currentDir)}\n`);
          resolveChoice(currentDir);
        } else if (chunk === '\r' || chunk === '\n') {
          if (entries.length === 0) return;
          const target = entries[cursorIdx];
          if (!target) return;

          if (target.isDir) {
            currentDir = target.fullPath;
            entries = readEntries(currentDir);
            cursorIdx = 0;
            render(false);
          } else {
            // File selected
            cleanup();
            process.stdout.write(`${Ansi.green('✔')} ${Ansi.bold(message)}: ${Ansi.cyan(target.fullPath)}\n`);
            resolveChoice(target.fullPath);
          }
        } else if (chunk === '\x1b[A' || chunk === 'k') {
          // Up
          if (entries.length > 0) {
            cursorIdx = (cursorIdx - 1 + entries.length) % entries.length;
            render(false);
          }
        } else if (chunk === '\x1b[B' || chunk === 'j') {
          // Down
          if (entries.length > 0) {
            cursorIdx = (cursorIdx + 1) % entries.length;
            render(false);
          }
        }
      };

      process.stdin.on('data', onData);
    });
  }
}

