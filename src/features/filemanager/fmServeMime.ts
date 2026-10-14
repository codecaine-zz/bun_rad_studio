/**
 * What kind of file is this? The live server tells the browser with a MIME type, picked from the file's extension.
 * Text types carry `charset=utf-8`. Anything not listed is sent as `application/octet-stream`, which makes the
 * browser offer a download instead of guessing (the server also sends `nosniff`).
 */

const TEXT = "; charset=utf-8";

/** extension (lower case, no dot) -> MIME type. */
export const MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
  // Web pages and code
  html: `text/html${TEXT}`, htm: `text/html${TEXT}`, xhtml: `application/xhtml+xml${TEXT}`,
  css: `text/css${TEXT}`,
  js: `text/javascript${TEXT}`, mjs: `text/javascript${TEXT}`, cjs: `text/javascript${TEXT}`, jsx: `text/javascript${TEXT}`,
  // A ".ts" file here is TypeScript source (a developer's folder), not an MPEG transport stream, so it is shown as text.
  ts: `text/plain${TEXT}`, tsx: `text/plain${TEXT}`, mts: `text/plain${TEXT}`, cts: `text/plain${TEXT}`,
  json: `application/json${TEXT}`, map: `application/json${TEXT}`, webmanifest: `application/manifest+json${TEXT}`, jsonld: `application/ld+json${TEXT}`,
  wasm: "application/wasm",
  xml: `application/xml${TEXT}`, xsl: `application/xml${TEXT}`, rss: `application/rss+xml${TEXT}`, atom: `application/atom+xml${TEXT}`,
  txt: `text/plain${TEXT}`, md: `text/markdown${TEXT}`, markdown: `text/markdown${TEXT}`, log: `text/plain${TEXT}`,
  csv: `text/csv${TEXT}`, tsv: `text/tab-separated-values${TEXT}`, yaml: `text/yaml${TEXT}`, yml: `text/yaml${TEXT}`, toml: `text/plain${TEXT}`,
  ics: `text/calendar${TEXT}`, vcf: `text/vcard${TEXT}`, php: `text/plain${TEXT}`,
  // Pictures
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", jpe: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  svg: "image/svg+xml", svgz: "image/svg+xml", ico: "image/x-icon", cur: "image/x-icon", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff",
  apng: "image/apng", heic: "image/heic", heif: "image/heif", jxl: "image/jxl",
  // Sound
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/opus", flac: "audio/flac", aac: "audio/aac",
  m4a: "audio/mp4", weba: "audio/webm", mid: "audio/midi", midi: "audio/midi",
  // Video
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", ogv: "video/ogg", mov: "video/quicktime", mkv: "video/x-matroska",
  avi: "video/x-msvideo", mpeg: "video/mpeg", mpg: "video/mpeg", m3u8: "application/vnd.apple.mpegurl", mpd: "application/dash+xml",
  // Fonts
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject",
  // Documents and downloads
  pdf: "application/pdf", zip: "application/zip", gz: "application/gzip", tgz: "application/gzip", tar: "application/x-tar",
  "7z": "application/x-7z-compressed", rar: "application/vnd.rar", bz2: "application/x-bzip2",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  epub: "application/epub+zip", rtf: "application/rtf", bin: "application/octet-stream", exe: "application/octet-stream",
  // 3D and data
  glb: "model/gltf-binary", gltf: `model/gltf+json${TEXT}`, obj: `text/plain${TEXT}`, wat: `text/plain${TEXT}`,
});

export const FALLBACK_MIME = "application/octet-stream";

export function extensionOfName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function mimeFor(name: string): string {
  const ext = extensionOfName(name);
  return Object.hasOwn(MIME_TYPES, ext) ? MIME_TYPES[ext]! : FALLBACK_MIME;
}

export const isHtmlName = (name: string) => /\.(html?|xhtml)$/i.test(name);
