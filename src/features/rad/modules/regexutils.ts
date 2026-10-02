// Doer: Convert string or RegExp to global RegExp
function toRegex(pattern: string | RegExp, flags = ""): RegExp {
  if (pattern instanceof RegExp) {
    if (!flags) return pattern;
    return new RegExp(pattern.source, Array.from(new Set([...pattern.flags, ...flags])).join(""));
  }
  return new RegExp(pattern, flags);
}

// Doer: Test if text matches pattern
export function isMatch(pattern: string | RegExp, text: string): boolean {
  const re = toRegex(pattern);
  return re.test(text);
}

// Doer: Find first matching substring or null
export function findFirst(pattern: string | RegExp, text: string): string | null {
  const re = toRegex(pattern);
  const match = text.match(re);
  return match ? match[0] : null;
}

// Doer: Find all matching substrings
export function findAll(pattern: string | RegExp, text: string): string[] {
  const re = toRegex(pattern, "g");
  const matches = text.match(re);
  return matches ? Array.from(matches) : [];
}

// Doer: Replace all occurrences of pattern in text
export function replace(pattern: string | RegExp, text: string, replacement: string): string {
  const re = toRegex(pattern, "g");
  return text.replace(re, replacement);
}

// Doer: Split text by regex pattern
export function split(pattern: string | RegExp, text: string): string[] {
  const re = toRegex(pattern);
  return text.split(re);
}

// Coordinator: Find all matches with named capture groups
export function findNamedGroups(pattern: RegExp, text: string): Record<string, string>[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const results: Record<string, string>[] = [];
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.groups) {
      results.push({ ...match.groups });
    }
  }
  return results;
}

export const regexutils = {
  isMatch,
  findFirst,
  findAll,
  replace,
  split,
  findNamedGroups,
};
