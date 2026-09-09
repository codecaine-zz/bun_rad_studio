/**
 * Core SimpleCLI Application class - Zero-window console utility framework and RAD toolkit for Bun
 */

import { Ansi } from './ansi.ts';
import { Logger } from './logger.ts';
import { Prompts } from './prompts.ts';
import { Pipeline } from './pipeline.ts';
import { ConfigStore } from './config.ts';
import { NamespacedRedis, type NamespacedRedisOptions } from './redis.ts';
import { Sys } from '../sys/index.ts';
import {
  LogLevel,
  type LogLevelName,
  AlertKind,
  TaskStatus,
  type FormField,
  PathMode,
  TreeNode,
  type FlagOption,
  type CommandAction,
  type FilePickerOptions,
  type OutputFormat,
  type ShellType,
} from './types.ts';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

export class SimpleCLI {
  public appName: string = 'SimpleCLI Application';
  public version: string = '1.0.0';
  public author: string = '';
  public description: string = '';
  public debugMode: boolean = false;
  public noColor: boolean = false;
  public silentMode: boolean = false;
  public logger: Logger;
  public config: ConfigStore;
  private state: Record<string, string> = {};
  private flagsDef: Map<string, FlagOption> = new Map();
  private flagsVal: Map<string, any> = new Map();
  private subcommands: Map<string, SimpleCLI> = new Map();
  private actionHandler?: CommandAction;
  private posArgs: string[] = [];
  private benchStart: number = performance.now();

  constructor(appName: string = 'SimpleCLI Application', version: string = '1.0.0') {
    this.appName = appName;
    this.version = version;
    this.logger = new Logger(LogLevel.INFO, undefined, this.noColor);
    this.config = new ConfigStore(this.appName);
  }

  public static new(appName: string): SimpleCLI {
    return new SimpleCLI(appName);
  }

  public static newApp(appName: string, version: string): SimpleCLI {
    return new SimpleCLI(appName, version);
  }

  public static initApp(): SimpleCLI {
    const scriptPath = process.argv[1] || 'app';
    const baseName = scriptPath.split(/[/\\]/).pop()?.replace(/\.(ts|js)$/, '') || 'SimpleCLI';
    return new SimpleCLI(baseName);
  }


  // ===========================================================================
  // Fluent Configuration
  // ===========================================================================

  public setVersion(ver: string): this {
    this.version = ver;
    return this;
  }

  public setAuthor(author: string): this {
    this.author = author;
    return this;
  }

  public setDescription(desc: string): this {
    this.description = desc;
    return this;
  }

  public setDebug(debug: boolean): this {
    this.debugMode = debug;
    if (debug) {
      this.logger.setLevel(LogLevel.DEBUG);
    }
    return this;
  }

  public setNoColor(noColor: boolean): this {
    this.noColor = noColor;
    this.logger.setNoColor(noColor);
    return this;
  }

  public setSilent(silent: boolean): this {
    this.silentMode = silent;
    if (silent) {
      this.logger.setLevel(LogLevel.SILENT);
    }
    return this;
  }

  public setLogLevel(level: LogLevel | LogLevelName): this {
    this.logger.setLevel(level);
    return this;
  }

  public setLogFile(filePath: string): this {
    this.logger.setLogFile(filePath);
    return this;
  }

  // ===========================================================================
  // Flag Registration & CLI Parsing
  // ===========================================================================

  public addFlagString(name: string, short: string, defaultVal: string = '', desc: string = '', choices?: string[]): this {
    this.flagsDef.set(name, { name, short, kind: 'string', defaultVal, desc, choices });
    this.flagsVal.set(name, defaultVal);
    return this;
  }

  public addFlagInt(name: string, short: string, defaultVal: number = 0, desc: string = ''): this {
    this.flagsDef.set(name, { name, short, kind: 'int', defaultVal, desc });
    this.flagsVal.set(name, defaultVal);
    return this;
  }

  public addFlagFloat(name: string, short: string, defaultVal: number = 0.0, desc: string = ''): this {
    this.flagsDef.set(name, { name, short, kind: 'float', defaultVal, desc });
    this.flagsVal.set(name, defaultVal);
    return this;
  }

  public addFlagBool(name: string, short: string, defaultVal: boolean = false, desc: string = ''): this {
    this.flagsDef.set(name, { name, short, kind: 'bool', defaultVal, desc });
    this.flagsVal.set(name, defaultVal);
    return this;
  }

  public addFlagArray(name: string, short: string, defaultVal: string[] = [], desc: string = ''): this {
    this.flagsDef.set(name, { name, short, kind: 'array', defaultVal, desc });
    this.flagsVal.set(name, defaultVal);
    return this;
  }

  public command(
    name: string,
    descriptionOrSetup?: string | ((sub: SimpleCLI) => void),
    maybeSetup?: (sub: SimpleCLI) => void
  ): SimpleCLI {
    let desc = '';
    let setupFn: ((sub: SimpleCLI) => void) | undefined;
    if (typeof descriptionOrSetup === 'string') {
      desc = descriptionOrSetup;
      setupFn = maybeSetup;
    } else if (typeof descriptionOrSetup === 'function') {
      setupFn = descriptionOrSetup;
    }

    const sub = new SimpleCLI(name, this.version);
    sub.setDescription(desc);
    sub.setNoColor(this.noColor);
    if (setupFn) {
      setupFn(sub);
    }
    this.subcommands.set(name, sub);
    return sub;
  }

  public action(fn: CommandAction): this {
    this.actionHandler = fn;
    return this;
  }

  public getSubcommands(): Map<string, SimpleCLI> {
    return this.subcommands;
  }

  public getAllFlags(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, val] of this.flagsVal.entries()) {
      result[key] = val;
    }
    return result;
  }

  public suggestMatch(input: string, choices: string[], maxDistance: number = 3): string | undefined {
    const levenshtein = (a: string, b: string): number => {
      const m = a.length;
      const n = b.length;
      const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i]![0] = i;
      for (let j = 0; j <= n; j++) dp[0]![j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
        }
      }
      return dp[m]![n]!;
    };

    let bestMatch: string | undefined;
    let minDistance = Infinity;
    const lowerInput = input.toLowerCase();

    for (const choice of choices) {
      const lowerChoice = choice.toLowerCase();
      const strippedChoice = lowerChoice.replace(/(_cli|-cli)$/, '');
      const distDirect = levenshtein(lowerInput, lowerChoice);
      const distStripped = levenshtein(lowerInput, strippedChoice);
      const dist = Math.min(distDirect, distStripped);
      const effectiveMaxDist = Math.max(maxDistance, Math.floor(strippedChoice.length / 2));

      if (dist < minDistance && dist <= effectiveMaxDist) {
        minDistance = dist;
        bestMatch = choice;
      }
    }
    return bestMatch;
  }


  public parseCli(rawArgs?: string[]): boolean {
    const args = rawArgs ?? process.argv.slice(2);
    return this.parseArgs(args);
  }

  public async run(rawArgs?: string[]): Promise<boolean> {
    const args = rawArgs ?? process.argv.slice(2);
    const parsed = this.parseArgs(args);
    if (!parsed) return false;

    if (this.subcommands.size > 0 && this.posArgs.length > 0) {
      const subName = this.posArgs[0];
      if (subName) {
        const sub = this.subcommands.get(subName);
        if (sub) {
          return await sub.run(args.slice(1));
        }
      }
    }

    if (this.actionHandler) {
      await this.actionHandler(this.getAllFlags(), this.posArgs);
      return true;
    }

    return true;
  }

  public parseArgs(args: string[]): boolean {
    const shortToName = new Map<string, string>();
    for (const [name, opt] of this.flagsDef.entries()) {
      if (opt.short) shortToName.set(opt.short, name);
    }

    // Check completion flag or command
    if (args.includes('--completion') || (args[0] === 'completion' && args[1])) {
      const shell = (args.includes('--completion') ? args[args.indexOf('--completion') + 1] : args[1]) as ShellType || 'zsh';
      console.log(this.generateCompletions(shell));
      return false;
    }

    // Check help flag
    if (args.includes('--help') || (!shortToName.has('h') && args.includes('-h'))) {
      this.printHelp();
      return false;
    }
    // Check version flag
    if (args.includes('--version') || args.includes('-V') || (!shortToName.has('v') && args.includes('-v'))) {
      console.log(`${this.appName} version ${this.version}`);
      return false;
    }

    this.posArgs = [];
    let i = 0;

    // Check subcommand routing for first positional argument if subcommands are defined
    const firstArg = args[0];
    if (firstArg && !firstArg.startsWith('-') && this.subcommands.size > 0) {
      const sub = this.subcommands.get(firstArg);
      if (sub) {
        this.posArgs.push(firstArg);
        return true;
      } else {
        const suggestion = this.suggestMatch(firstArg, Array.from(this.subcommands.keys()));
        if (suggestion) {
          console.error(Ansi.red(`Unknown command "${firstArg}". Did you mean "${suggestion}"?`));
        } else {
          console.error(Ansi.red(`Unknown command "${firstArg}".`));
        }
        return false;
      }
    }

    while (i < args.length) {
      const arg = args[i];
      if (!arg) {
        i++;
        continue;
      }

      if (arg === '--') {
        this.posArgs.push(...args.slice(i + 1));
        break;
      }

      if (arg.startsWith('--')) {
        const flagNameWithVal = arg.slice(2);
        let flagName = flagNameWithVal;
        let inlineVal: string | undefined;

        if (flagNameWithVal.includes('=')) {
          const parts = flagNameWithVal.split('=');
          flagName = parts[0] || '';
          inlineVal = parts.slice(1).join('=');
        }

        const opt = this.flagsDef.get(flagName);
        if (opt) {
          if (opt.kind === 'bool') {
            const val = inlineVal ? /^(true|1|yes)$/i.test(inlineVal) : true;
            this.flagsVal.set(flagName, val);
          } else {
            const val = inlineVal ?? args[++i];
            if (val !== undefined) {
              this.setTypedFlagValue(flagName, opt.kind, val);
            }
          }
        } else {
          const suggestion = this.suggestMatch(flagName, Array.from(this.flagsDef.keys()));
          if (suggestion) {
            console.error(Ansi.yellow(`Unknown flag "--${flagName}". Did you mean "--${suggestion}"?`));
          }
          if (arg) this.posArgs.push(arg);
        }
      } else if (arg.startsWith('-') && arg.length > 1) {
        const shortFlag = arg.slice(1);
        const flagName = shortToName.get(shortFlag);
        const opt = flagName ? this.flagsDef.get(flagName) : undefined;

        if (opt && flagName) {
          if (opt.kind === 'bool') {
            this.flagsVal.set(flagName, true);
          } else {
            const val = args[++i];
            if (val !== undefined) {
              this.setTypedFlagValue(flagName, opt.kind, val);
            }
          }
        } else {
          if (arg) this.posArgs.push(arg);
        }
      } else {
        if (arg) this.posArgs.push(arg);
      }

      i++;
    }

    return true;
  }

  private setTypedFlagValue(flagName: string, kind: string, val: string): void {
    if (kind === 'int') {
      this.flagsVal.set(flagName, parseInt(val, 10) || 0);
    } else if (kind === 'float') {
      this.flagsVal.set(flagName, parseFloat(val) || 0.0);
    } else if (kind === 'array') {
      const existing = this.flagsVal.get(flagName) || [];
      this.flagsVal.set(flagName, [...existing, val]);
    } else {
      this.flagsVal.set(flagName, val);
    }
  }

  public getFlagString(name: string): string {
    return String(this.flagsVal.get(name) ?? '');
  }

  public getFlagInt(name: string): number {
    return Number(this.flagsVal.get(name) ?? 0);
  }

  public getFlagFloat(name: string): number {
    return Number(this.flagsVal.get(name) ?? 0.0);
  }

  public getFlagBool(name: string): boolean {
    return Boolean(this.flagsVal.get(name) ?? false);
  }

  public getFlagArray(name: string): string[] {
    return (this.flagsVal.get(name) as string[]) ?? [];
  }

  public getPositionalArgs(): string[] {
    return this.posArgs;
  }

  public printHelp(): void {
    console.log(`\n${Ansi.bold(this.appName)} ${Ansi.cyan(`v${this.version}`)}`);
    if (this.description) {
      console.log(`${Ansi.dim(this.description)}\n`);
    }
    if (this.author) {
      console.log(`Author: ${Ansi.dim(this.author)}`);
    }

    console.log(`${Ansi.bold('USAGE:')}`);
    const usageCmd = this.subcommands.size > 0 ? ' [COMMAND]' : '';
    console.log(`  ${this.appName.toLowerCase()}${usageCmd} [FLAGS] [ARGUMENTS...]\n`);

    if (this.subcommands.size > 0) {
      console.log(`${Ansi.bold('COMMANDS:')}`);
      const cmdRows: [string, string][] = [];
      for (const [name, sub] of this.subcommands.entries()) {
        cmdRows.push([name, sub.description || '']);
      }
      const maxCmdLen = Math.max(...cmdRows.map(r => r[0].length));
      for (const [name, desc] of cmdRows) {
        console.log(`  ${Ansi.cyan(name.padEnd(maxCmdLen + 2))} ${desc}`);
      }
      console.log('');
    }

    if (this.flagsDef.size > 0) {
      console.log(`${Ansi.bold('FLAGS:')}`);
      const rows: [string, string, string][] = [];

      for (const [name, opt] of this.flagsDef.entries()) {
        const shortStr = opt.short ? `-${opt.short}, ` : '    ';
        const flagKey = `${shortStr}--${name}`;
        const typeHint = `<${opt.kind}>`;
        const defHint = opt.defaultVal !== undefined && opt.defaultVal !== '' && opt.defaultVal !== false && opt.defaultVal !== 0
          ? ` [default: ${JSON.stringify(opt.defaultVal)}]`
          : '';
        rows.push([flagKey, typeHint, `${opt.desc}${defHint}`]);
      }

      // Add default help & version
      rows.push(['-h, --help', '', 'Show application help information']);
      rows.push(['-v, --version', '', 'Show application version']);

      const maxKeyLen = Math.max(...rows.map(r => r[0].length));
      for (const [k, t, d] of rows) {
        console.log(`  ${Ansi.cyan(k.padEnd(maxKeyLen + 2))} ${Ansi.dim(t.padEnd(8))} ${d}`);
      }
      console.log('');
    }
  }


  // ===========================================================================
  // Console UI & ANSI Color RAD Components
  // ===========================================================================

  public print(...args: any[]): void {
    if (!this.silentMode) {
      if (args.length === 0) return;
      process.stdout.write(args.map(a => typeof a === 'string' ? a : String(a)).join(' '));
    }
  }

  public println(...args: any[]): void {
    if (!this.silentMode) {
      if (args.length === 0) console.log('');
      else console.log(...args);
    }
  }

  public bold(t: string): string { return this.noColor ? t : Ansi.bold(t); }
  public dim(t: string): string { return this.noColor ? t : Ansi.dim(t); }
  public italic(t: string): string { return this.noColor ? t : Ansi.italic(t); }
  public underline(t: string): string { return this.noColor ? t : Ansi.underline(t); }
  public inverse(t: string): string { return this.noColor ? t : Ansi.inverse(t); }
  public strike(t: string): string { return this.noColor ? t : Ansi.strike(t); }

  public black(t: string): string { return this.noColor ? t : Ansi.black(t); }
  public red(t: string): string { return this.noColor ? t : Ansi.red(t); }
  public green(t: string): string { return this.noColor ? t : Ansi.green(t); }
  public yellow(t: string): string { return this.noColor ? t : Ansi.yellow(t); }
  public blue(t: string): string { return this.noColor ? t : Ansi.blue(t); }
  public magenta(t: string): string { return this.noColor ? t : Ansi.magenta(t); }
  public cyan(t: string): string { return this.noColor ? t : Ansi.cyan(t); }
  public white(t: string): string { return this.noColor ? t : Ansi.white(t); }
  public gray(t: string): string { return this.noColor ? t : Ansi.gray(t); }

  public brightRed(t: string): string { return this.noColor ? t : Ansi.brightRed(t); }
  public brightGreen(t: string): string { return this.noColor ? t : Ansi.brightGreen(t); }
  public brightYellow(t: string): string { return this.noColor ? t : Ansi.brightYellow(t); }
  public brightBlue(t: string): string { return this.noColor ? t : Ansi.brightBlue(t); }
  public brightMagenta(t: string): string { return this.noColor ? t : Ansi.brightMagenta(t); }
  public brightCyan(t: string): string { return this.noColor ? t : Ansi.brightCyan(t); }
  public brightWhite(t: string): string { return this.noColor ? t : Ansi.brightWhite(t); }

  public rgb(r: number, g: number, b: number, t: string): string {
    return this.noColor ? t : Ansi.rgb(r, g, b, t);
  }

  public hex(hexCode: string, t: string): string {
    return this.noColor ? t : Ansi.hex(hexCode, t);
  }

  public hsl(h: number, s: number, l: number, t: string): string {
    return this.noColor ? t : Ansi.hsl(h, s, l, t);
  }

  public step(num: number, title: string): void {
    const badge = this.noColor ? `[Step ${num}]` : Ansi.bgCyan(Ansi.black(` STEP ${num} `));
    this.println(`\n${badge} ${this.bold(title)}`);
  }

  public divider(char: string = '─', width: number = 60): void {
    const cols = Math.min(width, process.stdout.columns || 80);
    this.println(this.dim(char.repeat(cols)));
  }

  public banner(title: string, subtitle: string = ''): void {
    const termWidth = Math.min(68, (process.stdout.columns || 80) - 4);
    const top = '┌' + '─'.repeat(termWidth) + '┐';
    const bot = '└' + '─'.repeat(termWidth) + '┘';

    this.println(this.cyan(top));
    const titlePadded = `  ${this.bold(title)}`.padEnd(termWidth + (this.noColor ? 0 : 9));
    this.println(`${this.cyan('│')}${titlePadded}${this.cyan('│')}`);

    if (subtitle) {
      const subPadded = `  ${this.dim(subtitle)}`.padEnd(termWidth + (this.noColor ? 0 : 9));
      this.println(`${this.cyan('│')}${subPadded}${this.cyan('│')}`);
    }

    this.println(this.cyan(bot));
  }

  public panel(title: string, content: string): void {
    const termWidth = Math.min(64, (process.stdout.columns || 80) - 4);
    const top = `┌─ ${this.bold(title)} ${'─'.repeat(Math.max(0, termWidth - Ansi.stringWidth(title) - 4))}┐`;
    const bot = `└${'─'.repeat(termWidth)}┘`;

    this.println(`\n${this.cyan(top)}`);
    const lines = content.split('\n');
    for (const line of lines) {
      this.println(`${this.cyan('│')} ${line}`);
    }
    this.println(`${this.cyan(bot)}\n`);
  }

  public card(title: string, content: string): void {
    this.panel(title, content);
  }

  public printKv(data: Record<string, any>): void {
    const keys = Object.keys(data);
    if (keys.length === 0) return;
    const maxKeyLen = Math.max(...keys.map(k => Ansi.stringWidth(k)));

    for (const k of keys) {
      const paddedKey = k.padEnd(maxKeyLen);
      const val = data[k];
      const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
      this.println(`  ${this.dim(paddedKey)} : ${this.bold(valStr)}`);
    }
  }

  public table(headers: string[], rows: (string | number | boolean)[][]): void {
    if (headers.length === 0 && rows.length === 0) return;

    const colCount = Math.max(headers.length, ...rows.map(r => r.length));
    const colWidths = new Array(colCount).fill(0);

    for (let c = 0; c < colCount; c++) {
      colWidths[c] = Math.max(
        headers[c] ? Ansi.stringWidth(headers[c]!) : 0,
        ...rows.map(r => (r[c] !== undefined ? Ansi.stringWidth(String(r[c])) : 0))
      ) + 2;
    }

    const buildRow = (cells: (string | number | boolean)[], isHeader: boolean = false) => {
      let out = '│';
      for (let c = 0; c < colCount; c++) {
        const text = cells[c] !== undefined ? String(cells[c]) : '';
        const padLen = colWidths[c] - Ansi.stringWidth(text);
        const cellContent = isHeader ? this.bold(text) : text;
        out += ` ${cellContent}${' '.repeat(Math.max(0, padLen - 1))}│`;
      }
      return out;
    };

    const topBorder = '┌' + colWidths.map(w => '─'.repeat(w)).join('┬') + '┐';
    const midBorder = '├' + colWidths.map(w => '─'.repeat(w)).join('┼') + '┤';
    const botBorder = '└' + colWidths.map(w => '─'.repeat(w)).join('┴') + '┘';

    this.println(this.cyan(topBorder));
    if (headers.length > 0) {
      this.println(buildRow(headers, true));
      this.println(this.cyan(midBorder));
    }
    for (const row of rows) {
      this.println(buildRow(row, false));
    }
    this.println(this.cyan(botBorder));
  }

  public progressBar(current: number, total: number, label: string = '', width: number = 30): void {
    if (this.silentMode) return;
    const ratio = Math.max(0, Math.min(1, total > 0 ? current / total : 0));
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const percent = (ratio * 100).toFixed(1);

    const bar = this.noColor
      ? `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`
      : `[${Ansi.green('█'.repeat(filled))}${Ansi.dim('░'.repeat(empty))}]`;

    const status = `\r${label ? `${this.bold(label)}: ` : ''}${bar} ${percent}% (${current}/${total})`;
    process.stdout.write(status);
    if (current >= total) {
      process.stdout.write('\n');
    }
  }

  public async spinner(label: string, durationMs: number = 1000): Promise<void> {
    if (this.silentMode) return;
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let idx = 0;
    const startTime = performance.now();

    return new Promise((resolveSpinner) => {
      const interval = setInterval(() => {
        if (!this.noColor && process.stdout.isTTY) {
          process.stdout.write(`\r${this.cyan(frames[idx] || '⠋')} ${label}`);
          idx = (idx + 1) % frames.length;
        }
        if (performance.now() - startTime >= durationMs) {
          clearInterval(interval);
          if (process.stdout.isTTY) {
            process.stdout.write(`\r${this.green('✓')} ${label}\n`);
          } else {
            console.log(`✓ ${label}`);
          }
          resolveSpinner();
        }
      }, 80);
    });
  }

  public sparkline(values: number[]): string {
    if (values.length === 0) return '';
    const glyphs = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    return values.map(v => {
      if (range === 0) return glyphs[3];
      const normalized = Math.max(0, Math.min(1, (v - min) / range));
      const idx = Math.min(glyphs.length - 1, Math.floor(normalized * glyphs.length));
      return glyphs[idx];
    }).join('');
  }

  public barChart(title: string, data: Record<string, number>, maxBarWidth: number = 30): void {
    this.println(`\n${this.bold(title)}`);
    const entries = Object.entries(data);
    if (entries.length === 0) return;

    const maxVal = Math.max(...entries.map(e => e[1]), 1);
    const maxKeyLen = Math.max(...entries.map(e => Ansi.stringWidth(e[0])));

    for (const [key, val] of entries) {
      const ratio = Math.max(0, Math.min(1, val / maxVal));
      const barLen = Math.round(ratio * maxBarWidth);
      const bar = this.cyan('█'.repeat(barLen));
      const padKey = key.padEnd(maxKeyLen);
      this.println(`  ${this.dim(padKey)} │ ${bar} ${this.bold(val.toString())}`);
    }
    this.println('');
  }

  public gauge(label: string, value: number, max: number, unit: string = ''): void {
    const ratio = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
    const width = 20;
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const pct = (ratio * 100).toFixed(1);

    let badgeKind = AlertKind.SUCCESS;
    let badgeText = 'OK';
    if (ratio >= 0.9) {
      badgeKind = AlertKind.CAUTION;
      badgeText = 'CRITICAL';
    } else if (ratio >= 0.75) {
      badgeKind = AlertKind.WARNING;
      badgeText = 'WARN';
    }

    const badgeStr = this.badge('STATUS', badgeText, badgeKind);
    const bar = this.noColor
      ? `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`
      : `[${Ansi.cyan('█'.repeat(filled))}${Ansi.dim('░'.repeat(empty))}]`;

    const unitStr = unit ? ` ${unit}` : '';
    this.println(`  ${this.bold(label)}: ${bar} ${value}/${max}${unitStr} (${pct}%) ${badgeStr}`);
  }

  public tree(root: TreeNode, prefix: string = '', isLast: boolean = true): void {
    if (!prefix) {
      this.println(`${this.bold(this.cyan(root.label))}`);
    } else {
      const branch = isLast ? '└── ' : '├── ';
      this.println(`${this.dim(prefix + branch)}${root.label}`);
    }

    const nextPrefix = prefix + (isLast ? '    ' : '│   ');
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i];
      const lastChild = i === root.children.length - 1;
      if (child) this.tree(child, nextPrefix, lastChild);
    }
  }

  public diffText(oldText: string, newText: string): string {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const out: string[] = [];

    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === newLine) {
        out.push(`  ${oldLine ?? ''}`);
      } else {
        if (oldLine !== undefined) {
          out.push(this.red(`- ${oldLine}`));
        }
        if (newLine !== undefined) {
          out.push(this.green(`+ ${newLine}`));
        }
      }
    }
    return out.join('\n');
  }

  public diff(oldText: string, newText: string): void {
    this.println(this.diffText(oldText, newText));
  }

  public badge(prefix: string, text: string, kind: AlertKind = AlertKind.INFO): string {
    if (this.noColor) return `[${prefix}: ${text}]`;

    let style = Ansi.BG_CYAN + Ansi.BLACK;
    if (kind === AlertKind.SUCCESS) style = Ansi.BG_GREEN + Ansi.BLACK;
    else if (kind === AlertKind.WARNING) style = Ansi.BG_YELLOW + Ansi.BLACK;
    else if (kind === AlertKind.CAUTION) style = Ansi.BG_RED + Ansi.WHITE;
    else if (kind === AlertKind.TIP) style = Ansi.BG_MAGENTA + Ansi.WHITE;

    return `${Ansi.style(` ${prefix} `, Ansi.BG_GRAY + Ansi.WHITE)}${Ansi.style(` ${text} `, style)}`;
  }

  public alert(kind: AlertKind, title: string, message: string): void {
    let tag = '[NOTE]';
    let colorFn = (t: string) => this.cyan(t);

    if (kind === AlertKind.SUCCESS) {
      tag = '[SUCCESS]';
      colorFn = (t: string) => this.green(t);
    } else if (kind === AlertKind.WARNING) {
      tag = '[WARNING]';
      colorFn = (t: string) => this.yellow(t);
    } else if (kind === AlertKind.CAUTION) {
      tag = '[CAUTION]';
      colorFn = (t: string) => this.red(t);
    } else if (kind === AlertKind.TIP) {
      tag = '[TIP]';
      colorFn = (t: string) => this.magenta(t);
    }

    const badge = this.noColor ? tag : colorFn(this.bold(` ${tag} `));
    this.println(`\n${badge} ${this.bold(title)}`);
    this.println(`  ${this.dim(message)}\n`);
  }

  public taskItem(name: string, status: TaskStatus, durationMs: number = 0): void {
    let icon = '○';
    let statusText = '';

    if (status === TaskStatus.DONE) {
      icon = this.green('✓');
      statusText = durationMs > 0 ? this.dim(`(${durationMs} ms)`) : '';
    } else if (status === TaskStatus.RUNNING) {
      icon = this.cyan('⏳');
      statusText = this.dim('...');
    } else if (status === TaskStatus.FAILED) {
      icon = this.red('✖');
      statusText = `${this.red('[FAILED]')} ${durationMs > 0 ? this.dim(`(${durationMs} ms)`) : ''}`;
    } else if (status === TaskStatus.SKIPPED) {
      icon = this.dim('↷');
      statusText = this.dim('[SKIPPED]');
    }

    this.println(`  ${icon} ${name} ${statusText}`);
  }

  public tableToCsv(headers: string[], rows: (string | number | boolean)[][]): string {
    const escape = (val: any) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [
      headers.map(escape).join(','),
      ...rows.map(r => r.map(escape).join(',')),
    ];
    return lines.join('\n');
  }

  public tableToMarkdown(headers: string[], rows: (string | number | boolean)[][]): string {
    const colCount = Math.max(headers.length, ...rows.map(r => r.length));
    const lines: string[] = [];

    lines.push('| ' + headers.map(h => h || '').join(' | ') + ' |');
    lines.push('| ' + new Array(colCount).fill('---').join(' | ') + ' |');
    for (const r of rows) {
      lines.push('| ' + r.map(c => String(c ?? '')).join(' | ') + ' |');
    }
    return lines.join('\n');
  }

  public tableToJson(headers: string[], rows: (string | number | boolean)[][]): string {
    const objects = rows.map(row => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i];
      });
      return obj;
    });
    return JSON.stringify(objects, null, 2);
  }

  public jsonHighlight(jsonStr: string): string {
    if (this.noColor) return jsonStr;
    return jsonStr.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            return Ansi.cyan(match); // key
          } else {
            return Ansi.green(match); // string value
          }
        } else if (/true|false/.test(match)) {
          return Ansi.yellow(match); // boolean
        } else if (/null/.test(match)) {
          return Ansi.dim(match); // null
        } else {
          return Ansi.brightMagenta(match); // number
        }
      }
    );
  }

  public renderMarkdown(markdownText: string): void {
    const lines = markdownText.split('\n');
    for (const line of lines) {
      if (line.startsWith('# ')) {
        this.println(`\n${this.bold(this.cyan(line.slice(2)))}\n${this.dim('═'.repeat(40))}`);
      } else if (line.startsWith('## ')) {
        this.println(`\n${this.bold(line.slice(3))}\n${this.dim('─'.repeat(30))}`);
      } else if (line.startsWith('### ')) {
        this.println(`\n${this.bold(this.yellow(line.slice(4)))}`);
      } else if (line.startsWith('* ') || line.startsWith('- ')) {
        this.println(`  ${this.cyan('•')} ${line.slice(2)}`);
      } else if (line.startsWith('> ')) {
        this.println(`  ${this.dim('│')} ${this.italic(line.slice(2))}`);
      } else {
        this.println(line);
      }
    }
  }

  // ===========================================================================
  // Interactive Prompts Proxies
  // ===========================================================================

  public prompt(message: string, defaultVal: string = ''): Promise<string> {
    return Prompts.prompt(message, defaultVal);
  }

  public promptPassword(message: string): Promise<string> {
    return Prompts.promptPassword(message);
  }

  public promptEmail(message: string, defaultVal: string = ''): Promise<string> {
    return Prompts.promptEmail(message, defaultVal);
  }

  public promptUrl(message: string, defaultVal: string = ''): Promise<string> {
    return Prompts.promptUrl(message, defaultVal);
  }

  public promptNumber(message: string, defaultVal: number = 0, min: number = -Infinity, max: number = Infinity): Promise<number> {
    return Prompts.promptNumber(message, defaultVal, min, max);
  }

  public confirm(message: string, defaultVal: boolean = false): Promise<boolean> {
    return Prompts.confirm(message, defaultVal);
  }

  public select(message: string, choices: string[], defaultIdx: number = 0): Promise<string> {
    return Prompts.select(message, choices, defaultIdx);
  }

  public multiSelect(message: string, choices: string[], defaultSelected: number[] = []): Promise<string[]> {
    return Prompts.multiSelect(message, choices, defaultSelected);
  }

  public fuzzySelect(message: string, choices: string[]): Promise<string> {
    return Prompts.fuzzySelect(message, choices);
  }

  public promptPath(message: string, defaultVal: string = '', mode: PathMode = PathMode.ANY): Promise<string> {
    return Prompts.promptPath(message, defaultVal, mode);
  }

  public form(title: string, fields: FormField[]): Promise<Record<string, string>> {
    return Prompts.form(title, fields);
  }

  // ===========================================================================
  // Task Pipeline
  // ===========================================================================

  public newPipeline(title: string): Pipeline {
    return new Pipeline(title, this.noColor);
  }

  // ===========================================================================
  // Multi-Level Logging
  // ===========================================================================

  public trace(msg: string, ...args: any[]): void { this.logger.trace(msg, ...args); }
  public debug(msg: string, ...args: any[]): void { this.logger.debug(msg, ...args); }
  public info(msg: string, ...args: any[]): void { this.logger.info(msg, ...args); }
  public success(msg: string, ...args: any[]): void { this.logger.success(msg, ...args); }
  public warn(msg: string, ...args: any[]): void { this.logger.warn(msg, ...args); }
  public error(msg: string, ...args: any[]): void { this.logger.error(msg, ...args); }
  public fatal(msg: string, ...args: any[]): never { this.logger.fatal(msg, ...args); }

  // ===========================================================================
  // Benchmark & Execution Timing
  // ===========================================================================

  public resetTimer(): void {
    this.benchStart = performance.now();
  }

  public elapsedMs(): number {
    return Math.round(performance.now() - this.benchStart);
  }

  public elapsedSeconds(): number {
    return Number(((performance.now() - this.benchStart) / 1000).toFixed(3));
  }

  // ===========================================================================
  // Reactive State Store & File Persistence
  // ===========================================================================

  public setState(key: string, value: string): this {
    this.state[key] = value;
    return this;
  }

  public getState(key: string, defaultVal: string = ''): string {
    return this.state[key] ?? defaultVal;
  }

  public getAllState(): Record<string, string> {
    return { ...this.state };
  }

  public saveState(filePath: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  public loadState(filePath: string): void {
    if (!existsSync(filePath)) return;
    try {
      const data = readFileSync(filePath, 'utf8');
      this.state = JSON.parse(data);
    } catch (err) {
      if (this.debugMode) {
        this.debug(`Failed loading state from "${filePath}":`, err);
      }
    }
  }

  public getAppStateFile(appName: string, fileName: string = 'state.json'): string {
    const dir = resolve(homedir(), `.${appName.toLowerCase()}`);
    return resolve(dir, fileName);
  }

  // ===========================================================================
  // Namespaced Redis Client Helper
  // ===========================================================================

  public redis(namespace?: string, options?: Omit<NamespacedRedisOptions, 'namespace'>): NamespacedRedis {
    const ns = namespace || this.appName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    return new NamespacedRedis({
      namespace: ns,
      ...options,
    });
  }


  // ===========================================================================
  // Interactive File Picker Proxy
  // ===========================================================================

  public filePicker(message?: string, options?: FilePickerOptions): Promise<string> {
    return Prompts.filePicker(message, options);
  }

  // ===========================================================================
  // Shell Auto-Completion Generator
  // ===========================================================================

  public generateCompletions(shell: ShellType = 'zsh'): string {
    const commands = Array.from(this.subcommands.entries()).map(([k, v]) => ({ name: k, desc: v.description }));
    const flags: string[] = [];
    for (const [name, opt] of this.flagsDef.entries()) {
      flags.push(`--${name}`);
      if (opt.short) flags.push(`-${opt.short}`);
    }

    if (shell === 'bash') {
      const allOpts = [...flags, ...commands.map(c => c.name)].join(' ');
      return `_${this.appName.toLowerCase()}_completions() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local opts="${allOpts}"
  COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
  return 0
}
complete -F _${this.appName.toLowerCase()}_completions ${this.appName.toLowerCase()}`;
    }

    if (shell === 'fish') {
      let script = `# Fish completions for ${this.appName}\n`;
      for (const [name, opt] of this.flagsDef.entries()) {
        const shortPart = opt.short ? `-s ${opt.short} ` : '';
        script += `complete -c ${this.appName.toLowerCase()} ${shortPart}-l ${name} -d "${opt.desc.replace(/"/g, '\\"')}"\n`;
      }
      for (const cmd of commands) {
        script += `complete -c ${this.appName.toLowerCase()} -n "__fish_use_subcommand" -a "${cmd.name}" -d "${cmd.desc.replace(/"/g, '\\"')}"\n`;
      }
      return script;
    }

    // zsh default
    let script = `#compdef ${this.appName.toLowerCase()}\n\n_${this.appName.toLowerCase()}() {\n`;
    script += `  local -a commands\n  commands=(\n`;
    for (const cmd of commands) {
      script += `    '${cmd.name}:${cmd.desc.replace(/'/g, "\\'")}'\n`;
    }
    script += `  )\n\n  _arguments -s \\\n`;
    for (const [name, opt] of this.flagsDef.entries()) {
      const shortPart = opt.short ? ` '(-${opt.short} --${name})'{-${opt.short},--${name}}` : ` '--${name}'`;
      script += `   ${shortPart}'[${opt.desc.replace(/'/g, "\\'")}]' \\\n`;
    }
    script += `    '1: :->command' \\\n    '*::arg:->args'\n}\n\n_${this.appName.toLowerCase()} "$@"\n`;
    return script;
  }

  // ===========================================================================
  // Smart Output & Pipe Auto-Detection
  // ===========================================================================

  public output(data: any, options?: { format?: OutputFormat; title?: string }): void {
    const isJsonRequested = this.getFlagBool('json') || options?.format === 'json';
    const isPiped = !process.stdout.isTTY;

    if (isJsonRequested || (isPiped && options?.format !== 'text' && options?.format !== 'markdown')) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (options?.title) {
      this.println(`\n${this.bold(this.cyan(options.title))}`);
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        this.println(this.dim('(empty dataset)'));
        return;
      }
      if (typeof data[0] === 'object' && data[0] !== null) {
        const headers = Object.keys(data[0]);
        const rows = data.map(item => headers.map(h => (item as any)[h] ?? ''));
        this.table(headers, rows);
      } else {
        data.forEach(item => this.println(`  • ${item}`));
      }
    } else if (typeof data === 'object' && data !== null) {
      this.printKv(data);
    } else {
      this.println(String(data));
    }
  }

  // ===========================================================================
  // Pretty Error Formatter & Global Error Handling
  // ===========================================================================

  public formatError(err: unknown): string {
    const error = err instanceof Error ? err : new Error(String(err));
    const title = `✖ ${error.name || 'Error'}: ${error.message}`;
    let stackClean = '';
    if (error.stack) {
      const lines = error.stack.split('\n').slice(1);
      const filtered = lines.map(line => {
        if (line.includes('node:') || line.includes('bun:')) {
          return Ansi.dim(line);
        }
        return Ansi.yellow(line);
      });
      stackClean = '\n' + filtered.join('\n');
    }
    return `${this.red(this.bold(title))}${stackClean}`;
  }

  public handleErrors(): this {
    process.on('uncaughtException', (err) => {
      console.error(`\n${this.formatError(err)}`);
      process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
      console.error(`\n${this.formatError(reason)}`);
      process.exit(1);
    });
    return this;
  }

  // ===========================================================================
  // Markdown Documentation & Man-Page Generator
  // ===========================================================================

  public generateMarkdownDocs(): string {
    let md = `# \`${this.appName}\`\n\n`;
    if (this.description) md += `> ${this.description}\n\n`;
    if (this.version) md += `**Version:** \`${this.version}\`  \n`;
    if (this.author) md += `**Author:** ${this.author}  \n`;

    md += `\n## Usage\n\n\`\`\`bash\n${this.appName.toLowerCase()} [command] [flags] [arguments...]\n\`\`\`\n\n`;

    if (this.flagsDef.size > 0) {
      md += `## Flags\n\n| Flag | Short | Type | Default | Description |\n| :--- | :--- | :--- | :--- | :--- |\n`;
      for (const [name, opt] of this.flagsDef.entries()) {
        const shortStr = opt.short ? `\`-${opt.short}\`` : '-';
        const defStr = opt.defaultVal !== undefined && opt.defaultVal !== '' && opt.defaultVal !== false && opt.defaultVal !== 0
          ? `\`${JSON.stringify(opt.defaultVal)}\``
          : '-';
        md += `| \`--${name}\` | ${shortStr} | \`${opt.kind}\` | ${defStr} | ${opt.desc || '-'} |\n`;
      }
      md += `\n`;
    }

    if (this.subcommands.size > 0) {
      md += `## Commands\n\n`;
      for (const [name, sub] of this.subcommands.entries()) {
        md += `### \`${name}\`\n\n${sub.description || 'No description provided.'}\n\n`;
        if (sub.flagsDef.size > 0) {
          md += `| Flag | Short | Type | Default | Description |\n| :--- | :--- | :--- | :--- | :--- |\n`;
          for (const [fName, opt] of sub.flagsDef.entries()) {
            const shortStr = opt.short ? `\`-${opt.short}\`` : '-';
            const defStr = opt.defaultVal !== undefined && opt.defaultVal !== '' && opt.defaultVal !== false && opt.defaultVal !== 0
              ? `\`${JSON.stringify(opt.defaultVal)}\``
              : '-';
            md += `| \`--${fName}\` | ${shortStr} | \`${opt.kind}\` | ${defStr} | ${opt.desc || '-'} |\n`;
          }
          md += `\n`;
        }
      }
    }

    return md;
  }

  public generateManPage(): string {
    const appUpper = this.appName.toUpperCase();
    const date = new Date().toISOString().slice(0, 10);
    let man = `.TH ${appUpper} 1 "${date}" "${this.appName} ${this.version}" "User Commands"\n`;
    man += `.SH NAME\n${this.appName.toLowerCase()} \\- ${this.description || 'SimpleCLI Utility'}\n`;
    man += `.SH SYNOPSIS\n.B ${this.appName.toLowerCase()}\n[\\fIOPTIONS\\fR] [\\fICOMMAND\\fR]\n`;
    man += `.SH DESCRIPTION\n${this.description || this.appName}\n`;

    if (this.flagsDef.size > 0) {
      man += `.SH OPTIONS\n`;
      for (const [name, opt] of this.flagsDef.entries()) {
        const shortPart = opt.short ? `-${opt.short}, ` : '';
        man += `.TP\n\\fB${shortPart}--${name}\\fR\n${opt.desc}\n`;
      }
    }

    if (this.subcommands.size > 0) {
      man += `.SH COMMANDS\n`;
      for (const [name, sub] of this.subcommands.entries()) {
        man += `.TP\n\\fB${name}\\fR\n${sub.description}\n`;
      }
    }

    if (this.author) {
      man += `.SH AUTHOR\n${this.author}\n`;
    }

    return man;
  }

  // ===========================================================================
  // Bun System & File Helpers
  // ===========================================================================

  public which(binName: string): string | null {
    return Sys.which(binName);
  }

  public hasBinary(binName: string): boolean {
    return Sys.hasBinary(binName);
  }

  public async sleep(ms: number): Promise<void> {
    return Sys.sleep(ms);
  }

  public async readFile(filePath: string): Promise<string> {
    return Sys.readText(filePath);
  }

  public readFileSync(filePath: string): string {
    return Sys.readTextSync(filePath);
  }

  public async readJson<T = any>(filePath: string, fallback?: T): Promise<T> {
    return Sys.readJson<T>(filePath, fallback);
  }

  public async writeFile(filePath: string, content: string | Uint8Array): Promise<number> {
    return Sys.write(filePath, content);
  }

  public async writeJson(filePath: string, data: any, indent: number = 2): Promise<number> {
    return Sys.writeJson(filePath, data, indent);
  }

  public measure<T>(fn: () => T): { result: T; durationMs: number; durationNs: number } {
    return Sys.measure(fn);
  }

  public async measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number; durationNs: number }> {
    return Sys.measureAsync(fn);
  }

  public serveStatic(directory: string, port: number = 3000): any {
    return Sys.serveStatic(directory, port);
  }

  // ===========================================================================
  // Standalone Single-Binary Compilation
  // ===========================================================================

  public static async compileBinary(entrypoint: string, outName: string, target?: string): Promise<boolean> {
    const args = ['build', '--compile', entrypoint, '--outfile', outName];
    if (target) {
      args.push('--target', target);
    }
    const proc = spawnSync('bun', args, { stdio: 'inherit' });
    return proc.status === 0;
  }
}


