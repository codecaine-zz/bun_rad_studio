// Doer: Build URL-encoded query string from object dictionary
export function buildQuery(params: Record<string, any>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

// Doer: Parse URL query string into dictionary
export function parseQuery(queryString: string): Record<string, string> {
  const clean = queryString.startsWith("?") ? queryString.slice(1) : queryString;
  if (!clean) return {};
  const result: Record<string, string> = {};
  const pairs = clean.split("&");
  for (const pair of pairs) {
    if (!pair) continue;
    const [k, v] = pair.split("=");
    if (k) {
      result[decodeURIComponent(k)] = v ? decodeURIComponent(v) : "";
    }
  }
  return result;
}

// Doer: Perform fetch with exponential backoff retry on network or 5xx failures
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  maxRetries = 3,
  backoffMs = 200
): Promise<Response> {
  let attempt = 0;
  let delay = backoffMs;
  let lastError: any;

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, init);
      if (res.ok || (res.status < 500 && res.status !== 429)) {
        return res;
      }
      if (attempt === maxRetries) return res;
    } catch (err: any) {
      lastError = err;
      if (attempt === maxRetries) throw err;
    }
    await Bun.sleep(delay);
    delay *= 2;
    attempt++;
  }
  throw lastError || new Error(`[httputils] Request failed after ${maxRetries} retries`);
}

// Coordinator: Ergonomic GET request parsing JSON response
export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", ...headers },
  });
  if (!res.ok) {
    throw new Error(`[httputils] GET ${url} failed with status ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// Coordinator: Ergonomic POST request sending and receiving JSON
export async function postJson<T, R = any>(
  url: string,
  body: T,
  headers: Record<string, string> = {}
): Promise<R> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`[httputils] POST ${url} failed with status ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as R;
}

// Coordinator: Ergonomic PUT request sending and receiving JSON
export async function putJson<T, R = any>(
  url: string,
  body: T,
  headers: Record<string, string> = {}
): Promise<R> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`[httputils] PUT ${url} failed with status ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as R;
}

// Coordinator: Ergonomic DELETE request
export async function deleteJson<R = any>(url: string, headers: Record<string, string> = {}): Promise<R> {
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Accept: "application/json", ...headers },
  });
  if (!res.ok) {
    throw new Error(`[httputils] DELETE ${url} failed with status ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as R;
}

// Coordinator: Ergonomic GET text request
export async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    method: "GET",
    headers: { ...headers },
  });
  if (!res.ok) {
    throw new Error(`[httputils] GET ${url} failed with status ${res.status}: ${await res.text()}`);
  }
  return await res.text();
}

export const httputils = {
  buildQuery,
  parseQuery,
  fetchWithRetry,
  getJson,
  postJson,
  putJson,
  deleteJson,
  getText,
};
