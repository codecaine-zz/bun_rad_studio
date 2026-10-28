// Talking to the File Manager server. Every call carries this session's secret token (put in the page by the server).

const meta = (name) => {
  const v = typeof document === "undefined" ? "" : document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? "";
  return /^__FM_.*__$/.test(v) ? "" : v;
};
const INITIAL_TOKEN = meta("fm-token");
export const getToken = () => INITIAL_TOKEN || meta("fm-token");
export const platform = meta("fm-platform") || (typeof process !== "undefined" ? process.platform : "linux");
export const arch = meta("fm-arch") || (typeof process !== "undefined" ? process.arch : "");
/** Ollama Phonon TTS uses Apple's MLX framework and is only enabled on macOS ARM64 (Apple Silicon). */
export const isPhononSupported = () => {
  const p = meta("fm-platform") || (typeof process !== "undefined" ? process.platform : "linux");
  const a = meta("fm-arch") || (typeof process !== "undefined" ? process.arch : "");
  const ph = meta("fm-phonon");
  return p === "darwin" && (ph === "1" || a === "arm64" || (!a && !ph));
};
export const phononSupported = isPhononSupported();

export class ApiError extends Error {
  /** @param {string} message @param {string} code @param {number} status @param {any} [details] extra facts the server sent with the error */
  constructor(message, code, status, details = undefined) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** The address of the terminal connection: it needs the same secret token and starts the shell in `path`. */
export function terminalUrl(path, cols, rows) {
  const query = new URLSearchParams({ token: getToken(), path, cols: String(cols), rows: String(rows) });
  return `ws://${location.host}/api/terminal?${query}`;
}

/**
 * Calls one operation. Resolves with the answer, or throws an ApiError whose message is already in plain words.
 * @param {string} op
 * @param {Record<string, any>} [body]
 */
export async function call(op, body = {}) {
  let res;
  try {
    res = await fetch(`/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": getToken() }, body: JSON.stringify(body) });
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
    throw new ApiError(data?.error?.message ?? "Something went wrong.", data?.error?.code ?? "UNKNOWN", res.status, data?.error?.details);
  }
  return data;
}

/** The address of a picture, for an <img>. */
export const rawUrl = (path) => `/api/raw?path=${encodeURIComponent(path)}&token=${encodeURIComponent(getToken())}`;
export const lyricsUrl = (path) => `${rawUrl(path)}&lyrics=1`;
