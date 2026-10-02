export interface ParsedUrl {
  href: string;
  protocol: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  username: string;
  password?: string;
  hostWithPort: string;
  pathSegments: string[];
  queryParams: Record<string, string>;
}

// Coordinator: Parse standard RFC 3986 URL with convenient RAD getters
export function parseUrl(urlStr: string): ParsedUrl {
  const u = new URL(urlStr);
  const segments = u.pathname.split("/").filter((s) => s.length > 0);
  const params: Record<string, string> = {};
  for (const [k, v] of u.searchParams.entries()) {
    params[k] = v;
  }

  return {
    href: u.href,
    protocol: u.protocol,
    host: u.host,
    hostname: u.hostname,
    port: u.port,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
    username: u.username,
    password: u.password,
    hostWithPort: u.port ? `${u.hostname}:${u.port}` : u.hostname,
    pathSegments: segments,
    queryParams: params,
  };
}

// Doer: Join URL base with path segments cleanly without double slashes
export function joinUrl(base: string, ...segments: string[]): string {
  let result = base.replace(/\/+$/, "");
  for (const seg of segments) {
    if (!seg) continue;
    const clean = seg.replace(/^\/+|\/+$/g, "");
    if (clean) {
      result += `/${clean}`;
    }
  }
  return result;
}

// Doer: Redact credentials in connection strings or URLs for safe logging
export function redactCredentials(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    if (u.password) {
      u.password = "***";
    }
    return u.toString();
  } catch {
    return urlStr.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
  }
}

export const urlutils = {
  parseUrl,
  joinUrl,
  redactCredentials,
};
