// Doer: Convert string to URL-safe slug
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Doer: Convert string to snake_case
export function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

// Doer: Convert string to kebab-case
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z\d])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

// Doer: Convert string to camelCase
export function toCamelCase(str: string): string {
  const words = str.replace(/[-_\s]+/g, " ").trim().split(" ");
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
}

// Doer: Convert string to PascalCase
export function toPascalCase(str: string): string {
  const words = str.replace(/[-_\s]+/g, " ").trim().split(" ");
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

// Doer: Convert string to Title Case
export function toTitleCase(str: string): string {
  return str.replace(/\b\w+/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

// Doer: Mask email address for privacy
export function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const [user, domain] = parts;
  if (!user || user.length <= 2) return `${user?.charAt(0) || "*"}*@${domain}`;
  const maskedUser = `${user.charAt(0)}${"*".repeat(user.length - 2)}${user.charAt(user.length - 1)}`;
  return `${maskedUser}@${domain}`;
}

// Doer: Mask phone number (revealing last 4 digits)
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return phone;
  const visible = digits.slice(-4);
  return `***-***-${visible}`;
}

// Doer: Mask credit card (revealing last 4 digits)
export function maskCreditCard(cc: string): string {
  const digits = cc.replace(/\D/g, "");
  if (digits.length <= 4) return cc;
  return `****-****-****-${digits.slice(-4)}`;
}

// Doer: Calculate Levenshtein edit distance between two strings
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

// Doer: Truncate string with custom suffix
export function truncate(text: string, maxLen: number, suffix = "..."): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - suffix.length)) + suffix;
}

// Doer: Center string with padding
export function padCenter(text: string, width: number, padChar = " "): string {
  if (text.length >= width) return text;
  const totalPad = width - text.length;
  const leftPad = Math.floor(totalPad / 2);
  const rightPad = totalPad - leftPad;
  return padChar.repeat(leftPad) + text + padChar.repeat(rightPad);
}

// Doer: Word-wrap text to specified column width
export function wordWrap(text: string, width: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if (currentLine.length + word.length + 1 <= width) {
      currentLine += ` ${word}`;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.join("\n");
}

// Doer: Generate random alphanumeric string
export function randomAlphanumeric(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export const strutils = {
  slugify,
  toSnakeCase,
  toKebabCase,
  toCamelCase,
  toPascalCase,
  toTitleCase,
  maskEmail,
  maskPhone,
  maskCreditCard,
  levenshteinDistance,
  truncate,
  padCenter,
  wordWrap,
  randomAlphanumeric,
};
