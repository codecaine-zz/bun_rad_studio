// Talking to the File Manager server. Every call carries this session's secret token (put in the page by the server).

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? "";
const TOKEN = meta("fm-token");
export const platform = meta("fm-platform") || "linux";

export class ApiError extends Error {
  /** @param {string} message @param {string} code @param {number} status */
  constructor(message, code, status) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Calls one operation. Resolves with the answer, or throws an ApiError whose message is already in plain words.
 * @param {string} op
 * @param {Record<string, any>} [body]
 */
export async function call(op, body = {}) {
  let res;
  try {
    res = await fetch(`/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError("Can't reach the File Manager. Close this window and open it again.", "OFFLINE", 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // not JSON: fall through to the generic message
  }
  if (!res.ok || !data || data.ok === false) {
    throw new ApiError(data?.error?.message ?? "Something went wrong.", data?.error?.code ?? "UNKNOWN", res.status);
  }
  return data;
}

/** The address of a picture, for an <img>. */
export const rawUrl = (path) => `/api/raw?path=${encodeURIComponent(path)}&token=${encodeURIComponent(TOKEN)}`;
