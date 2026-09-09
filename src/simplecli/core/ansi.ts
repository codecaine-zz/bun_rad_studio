/**
 * Zero-dependency ANSI styling, TrueColor, and terminal cursor control engine for Bun
 */

export class Ansi {
  public static readonly ESC = '\x1b[';
  public static readonly RESET = '\x1b[0m';

  // Styles
  public static readonly BOLD = '\x1b[1m';
  public static readonly DIM = '\x1b[2m';
  public static readonly ITALIC = '\x1b[3m';
  public static readonly UNDERLINE = '\x1b[4m';
  public static readonly INVERSE = '\x1b[7m';
  public static readonly HIDDEN = '\x1b[8m';
  public static readonly STRIKETHROUGH = '\x1b[9m';

  // Standard Foregrounds
  public static readonly BLACK = '\x1b[30m';
  public static readonly RED = '\x1b[31m';
  public static readonly GREEN = '\x1b[32m';
  public static readonly YELLOW = '\x1b[33m';
  public static readonly BLUE = '\x1b[34m';
  public static readonly MAGENTA = '\x1b[35m';
  public static readonly CYAN = '\x1b[36m';
  public static readonly WHITE = '\x1b[37m';
  public static readonly GRAY = '\x1b[90m';

  // Bright Foregrounds
  public static readonly BRIGHT_RED = '\x1b[91m';
  public static readonly BRIGHT_GREEN = '\x1b[92m';
  public static readonly BRIGHT_YELLOW = '\x1b[93m';
  public static readonly BRIGHT_BLUE = '\x1b[94m';
  public static readonly BRIGHT_MAGENTA = '\x1b[95m';
  public static readonly BRIGHT_CYAN = '\x1b[96m';
  public static readonly BRIGHT_WHITE = '\x1b[97m';

  // Backgrounds
  public static readonly BG_BLACK = '\x1b[40m';
  public static readonly BG_RED = '\x1b[41m';
  public static readonly BG_GREEN = '\x1b[42m';
  public static readonly BG_YELLOW = '\x1b[43m';
  public static readonly BG_BLUE = '\x1b[44m';
  public static readonly BG_MAGENTA = '\x1b[45m';
  public static readonly BG_CYAN = '\x1b[46m';
  public static readonly BG_WHITE = '\x1b[47m';
  public static readonly BG_GRAY = '\x1b[100m';

  // Formatting helpers
  public static style(text: string, openCode: string, closeCode: string = Ansi.RESET): string {
    return `${openCode}${text}${closeCode}`;
  }

  public static bold(text: string): string { return Ansi.style(text, Ansi.BOLD); }
  public static dim(text: string): string { return Ansi.style(text, Ansi.DIM); }
  public static italic(text: string): string { return Ansi.style(text, Ansi.ITALIC); }
  public static underline(text: string): string { return Ansi.style(text, Ansi.UNDERLINE); }
  public static inverse(text: string): string { return Ansi.style(text, Ansi.INVERSE); }
  public static strike(text: string): string { return Ansi.style(text, Ansi.STRIKETHROUGH); }

  public static black(text: string): string { return Ansi.style(text, Ansi.BLACK); }
  public static red(text: string): string { return Ansi.style(text, Ansi.RED); }
  public static green(text: string): string { return Ansi.style(text, Ansi.GREEN); }
  public static yellow(text: string): string { return Ansi.style(text, Ansi.YELLOW); }
  public static blue(text: string): string { return Ansi.style(text, Ansi.BLUE); }
  public static magenta(text: string): string { return Ansi.style(text, Ansi.MAGENTA); }
  public static cyan(text: string): string { return Ansi.style(text, Ansi.CYAN); }
  public static white(text: string): string { return Ansi.style(text, Ansi.WHITE); }
  public static gray(text: string): string { return Ansi.style(text, Ansi.GRAY); }

  public static brightRed(text: string): string { return Ansi.style(text, Ansi.BRIGHT_RED); }
  public static brightGreen(text: string): string { return Ansi.style(text, Ansi.BRIGHT_GREEN); }
  public static brightYellow(text: string): string { return Ansi.style(text, Ansi.BRIGHT_YELLOW); }
  public static brightBlue(text: string): string { return Ansi.style(text, Ansi.BRIGHT_BLUE); }
  public static brightMagenta(text: string): string { return Ansi.style(text, Ansi.BRIGHT_MAGENTA); }
  public static brightCyan(text: string): string { return Ansi.style(text, Ansi.BRIGHT_CYAN); }
  public static brightWhite(text: string): string { return Ansi.style(text, Ansi.BRIGHT_WHITE); }

  public static bgBlack(text: string): string { return Ansi.style(text, Ansi.BG_BLACK); }
  public static bgRed(text: string): string { return Ansi.style(text, Ansi.BG_RED); }
  public static bgGreen(text: string): string { return Ansi.style(text, Ansi.BG_GREEN); }
  public static bgYellow(text: string): string { return Ansi.style(text, Ansi.BG_YELLOW); }
  public static bgBlue(text: string): string { return Ansi.style(text, Ansi.BG_BLUE); }
  public static bgMagenta(text: string): string { return Ansi.style(text, Ansi.BG_MAGENTA); }
  public static bgCyan(text: string): string { return Ansi.style(text, Ansi.BG_CYAN); }
  public static bgWhite(text: string): string { return Ansi.style(text, Ansi.BG_WHITE); }
  public static bgGray(text: string): string { return Ansi.style(text, Ansi.BG_GRAY); }

  // 24-bit TrueColor (RGB)
  public static rgb(r: number, g: number, b: number, text: string): string {
    return `\x1b[38;2;${Math.round(r)};${Math.round(g)};${Math.round(b)}m${text}${Ansi.RESET}`;
  }

  public static bgRgb(r: number, g: number, b: number, text: string): string {
    return `\x1b[48;2;${Math.round(r)};${Math.round(g)};${Math.round(b)}m${text}${Ansi.RESET}`;
  }

  // Hex color (#RRGGBB or #RGB)
  public static hex(hexCode: string, text: string): string {
    const { r, g, b } = Ansi.hexToRgb(hexCode);
    return Ansi.rgb(r, g, b, text);
  }

  public static bgHex(hexCode: string, text: string): string {
    const { r, g, b } = Ansi.hexToRgb(hexCode);
    return Ansi.bgRgb(r, g, b, text);
  }

  // HSL color (h: 0-360, s: 0-100, l: 0-100)
  public static hsl(h: number, s: number, l: number, text: string): string {
    const { r, g, b } = Ansi.hslToRgb(h, s, l);
    return Ansi.rgb(r, g, b, text);
  }

  // 256-color palette (0-255)
  public static color256(code: number, text: string): string {
    return `\x1b[38;5;${code}m${text}${Ansi.RESET}`;
  }

  public static bgColor256(code: number, text: string): string {
    return `\x1b[48;5;${code}m${text}${Ansi.RESET}`;
  }

  // Strip ANSI escape codes
  public static stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\].*?\x07/g, '');
  }

  // Accurate visible string width handling ANSI and unicode
  public static stringWidth(text: string): string extends '' ? 0 : number {
    const clean = Ansi.stripAnsi(text);
    let width = 0;
    for (const char of clean) {
      const code = char.codePointAt(0) || 0;
      // Wide characters (CJK, full-width, emojis)
      if (
        (code >= 0x1100 && code <= 0x115f) ||
        (code >= 0x2329 && code <= 0x232a) ||
        (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe10 && code <= 0xfe19) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x1f300 && code <= 0x1f9ff) ||
        (code >= 0x20000 && code <= 0x2fffd) ||
        (code >= 0x30000 && code <= 0x3fffd)
      ) {
        width += 2;
      } else {
        width += 1;
      }
    }
    return width as any;
  }

  // Cursor and Terminal Control
  public static cursorUp(n = 1): string { return `\x1b[${n}A`; }
  public static cursorDown(n = 1): string { return `\x1b[${n}B`; }
  public static cursorForward(n = 1): string { return `\x1b[${n}C`; }
  public static cursorBack(n = 1): string { return `\x1b[${n}D`; }
  public static cursorTo(x: number, y?: number): string {
    return y !== undefined ? `\x1b[${y + 1};${x + 1}H` : `\x1b[${x + 1}G`;
  }
  public static cursorHide(): string { return '\x1b[?25l'; }
  public static cursorShow(): string { return '\x1b[?25h'; }
  public static cursorSave(): string { return '\x1b[s'; }
  public static cursorRestore(): string { return '\x1b[u'; }
  public static clearLine(): string { return '\x1b[2K\r'; }
  public static clearScreen(): string { return '\x1b[2J\x1b[3J\x1b[H'; }

  // Helpers
  private static hexToRgb(hex: string): { r: number; g: number; b: number } {
    let clean = hex.replace(/^#/, '');
    if (clean.length === 3) {
      clean = clean.split('').map(c => c + c).join('');
    }
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }

  private static hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }
}
