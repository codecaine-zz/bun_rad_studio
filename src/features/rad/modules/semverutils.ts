export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

const SEMVER_REGEX = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

// Doer: Parse semantic version string
export function parseSemver(version: string): SemVer {
  const match = version.trim().match(SEMVER_REGEX);
  if (!match) {
    throw new Error(`[semverutils] Invalid semantic version format: "${version}"`);
  }
  return {
    major: parseInt(match[1]!, 10),
    minor: parseInt(match[2]!, 10),
    patch: parseInt(match[3]!, 10),
    prerelease: match[4],
    build: match[5],
  };
}

// Doer: Compare two semantic versions (-1: v1 < v2, 0: equal, 1: v1 > v2) powered by native Bun.semver.order
export function compareSemver(v1: string, v2: string): -1 | 0 | 1 {
  const ord = Bun.semver.order(v1, v2);
  return (ord < 0 ? -1 : ord > 0 ? 1 : 0) as -1 | 0 | 1;
}

// Coordinator: Check if version satisfies caret, tilde, or comparator range powered by native Bun.semver.satisfies
export function satisfiesRange(version: string, range: string): boolean {
  return Bun.semver.satisfies(version, range);
}

// Doer: Bump major, minor, or patch version component
export function bumpVersion(version: string, type: "major" | "minor" | "patch"): string {
  const v = parseSemver(version);
  if (type === "major") {
    return `${v.major + 1}.0.0`;
  }
  if (type === "minor") {
    return `${v.major}.${v.minor + 1}.0`;
  }
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

export const semverutils = {
  parseSemver,
  compareSemver,
  satisfiesRange,
  bumpVersion,
};
