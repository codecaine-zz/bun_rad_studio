import { createHash } from "crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join, posix } from "path";
import { VERSION, xmlEscape } from "./common";

export const APPSTREAM_ID = "io.github.codecaine_zz.CodecaineFileManager";
export const DEB_PACKAGE_NAME = "codecaine-file-manager";
export const RPM_PACKAGE_NAME = "codecaine-file-manager";
export const DEFAULT_REPO = "codecaine-zz/bun_rad_studio";

export function debFileName(
  arch: "amd64" | "arm64",
  version = VERSION,
): string {
  return `${DEB_PACKAGE_NAME}_${version}_${arch}.deb`;
}

export function debArchForDownload(id: string): "amd64" | "arm64" | null {
  if (id === "linux-x64") return "amd64";
  if (id === "linux-arm64") return "arm64";
  return null;
}

export function rpmFileName(
  arch: "x86_64" | "aarch64",
  version = VERSION,
  release = "1",
): string {
  return `${RPM_PACKAGE_NAME}-${version}-${release}.${arch}.rpm`;
}

export function rpmArchForDownload(id: string): "x86_64" | "aarch64" | null {
  if (id === "linux-x64") return "x86_64";
  if (id === "linux-arm64") return "aarch64";
  return null;
}

/**
 * FreeDesktop AppStream MetaInfo XML required by GNOME Software, KDE Discover,
 * Ubuntu App Center, Linux Mint Software Manager, Pop!_OS Cosmic Store, and Flathub.
 */
export function appStreamMetaInfoXml(
  version = VERSION,
  releaseDate = new Date().toISOString().slice(0, 10),
  repo = DEFAULT_REPO,
): string {
  const v = xmlEscape(version);
  const d = xmlEscape(releaseDate);
  const r = xmlEscape(repo);
  return `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${APPSTREAM_ID}</id>
  <name>Codecaine File Manager</name>
  <summary>Dual-pane file manager, code editor, and database studios for developers</summary>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>
  <developer id="io.github.codecaine_zz">
    <name>Codecaine</name>
  </developer>
  <launchable type="desktop-id">${APPSTREAM_ID}.desktop</launchable>
  <description>
    <p>Codecaine File Manager is a fast, local-first desktop file manager built for developers. It combines dual-pane file navigation with a multi-tab code editor, SQLite/MySQL/PostgreSQL/Redis database studios, a cross-platform Process and Task Manager, a System Information dashboard, an encrypted password vault, a multi-connection download manager, and 1-click local Ollama AI integration.</p>
    <ul>
      <li>Dual-pane file browser with tabs, quick preview, batch rename, checksums, and archive tools</li>
      <li>Built-in SQLite, MySQL, PostgreSQL, and Redis database studios</li>
      <li>Encrypted vault, file encryption, .env editor, and local static/live web server</li>
      <li>1-click local Ollama and starter AI model installer (Qwen 3.5 and LFM3-Omni)</li>
    </ul>
  </description>
  <url type="homepage">https://github.com/${r}</url>
  <url type="bugtracker">https://github.com/${r}/issues</url>
  <url type="vcs-browser">https://github.com/${r}</url>
  <categories>
    <category>Utility</category>
    <category>FileTools</category>
    <category>FileManager</category>
    <category>Development</category>
  </categories>
  <keywords>
    <keyword>file manager</keyword>
    <keyword>dual pane</keyword>
    <keyword>sqlite</keyword>
    <keyword>postgres</keyword>
    <keyword>mysql</keyword>
    <keyword>redis</keyword>
    <keyword>developer tools</keyword>
    <keyword>ollama</keyword>
  </keywords>
  <provides>
    <binary>codecaine-file-manager</binary>
    <mediatype>inode/directory</mediatype>
  </provides>
  <supports>
    <control>pointing</control>
    <control>keyboard</control>
  </supports>
  <requires>
    <display_length compare="ge">768</display_length>
  </requires>
  <content_rating type="oars-1.1" />
  <releases>
    <release version="${v}" date="${d}">
      <url type="details">https://github.com/${r}/releases/tag/v${v}</url>
    </release>
  </releases>
</component>
`;
}

/**
 * Standard FreeDesktop .desktop entry for system packages (.deb, .rpm, Flatpak, Snap, AUR).
 */
export function systemDesktopEntry(
  execCommand = "/usr/bin/codecaine-file-manager %U",
  iconName = APPSTREAM_ID,
): string {
  return `[Desktop Entry]
Version=1.0
Type=Application
Name=Codecaine File Manager
GenericName=File Manager
Comment=Dual-pane file manager, code editor, and database studios for developers
Exec=${execCommand}
Icon=${iconName}
Terminal=false
StartupNotify=true
StartupWMClass=codecaine-file-manager
Categories=Utility;FileTools;FileManager;Development;
MimeType=inode/directory;
Keywords=file;manager;explorer;dual-pane;sqlite;postgres;mysql;redis;ollama;developer;
`;
}

export function debControlFile(opts: {
  version: string;
  arch: "amd64" | "arm64";
  installedSizeKb: number;
  repo?: string;
}): string {
  const repo = opts.repo ?? DEFAULT_REPO;
  return [
    `Package: ${DEB_PACKAGE_NAME}`,
    `Version: ${opts.version}`,
    `Section: utils`,
    `Priority: optional`,
    `Architecture: ${opts.arch}`,
    `Installed-Size: ${Math.max(1, Math.ceil(opts.installedSizeKb))}`,
    `Depends: libc6, libgtk-4-1, libwebkitgtk-6.0-4`,
    `Recommends: apparmor, espeak-ng, libttspico-utils, ffmpeg`,
    `Maintainer: Codecaine <https://github.com/${repo}>`,
    `Homepage: https://github.com/${repo}`,
    `Description: Dual-pane file manager, code editor, and database studios for developers`,
    ` Codecaine File Manager is a fast, private file manager for developers with`,
    ` dual panes, a built-in code editor, database studios (SQLite, MySQL,`,
    ` PostgreSQL, Redis), a cross-platform Process & Task Manager, a System`,
    ` Information dashboard, an encrypted password vault, a live web server,`,
    ` a multi-connection download manager, and 1-click local Ollama AI support.`,
    "",
  ].join("\n");
}

export function debPostinstScript(): string {
  return `#!/bin/sh
set -e

APP_BIN="/opt/codecaine-file-manager/codecaine-file-manager"
PROFILE="/etc/apparmor.d/codecaine-file-manager"

if [ "$1" = "configure" ] || [ "$1" = "abort-upgrade" ] || [ "$1" = "abort-deconfigure" ] || [ "$1" = "abort-remove" ]; then
  if [ -x "$APP_BIN" ]; then
    chmod 0755 "$APP_BIN" 2>/dev/null || true
  fi
  ln -sf "$APP_BIN" /usr/bin/codecaine-file-manager

  # Do not silently install a system-wide unconfined userns AppArmor profile on the
  # BUN_BE_BUN-capable packaged binary during .deb installation; clean up any legacy
  # unconfined profile left behind by an earlier package release.
  if [ -f "$PROFILE" ] && grep -q "flags=(unconfined)" "$PROFILE" 2>/dev/null; then
    PARSER="$(command -v apparmor_parser || true)"
    if [ -z "$PARSER" ] && [ -x /usr/sbin/apparmor_parser ]; then PARSER=/usr/sbin/apparmor_parser; fi
    if [ -n "$PARSER" ]; then
      "$PARSER" -R "$PROFILE" >/dev/null 2>&1 || true
    fi
    rm -f "$PROFILE" 2>/dev/null || true
  fi

  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications >/dev/null 2>&1 || true
  fi
  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
  fi
  if command -v appstreamcli >/dev/null 2>&1; then
    appstreamcli refresh-cache >/dev/null 2>&1 || true
  fi
fi

exit 0
`;
}

export function debPrermScript(): string {
  return `#!/bin/sh
set -e

PROFILE="/etc/apparmor.d/codecaine-file-manager"

if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
  if [ -f "$PROFILE" ]; then
    PARSER="$(command -v apparmor_parser || true)"
    if [ -z "$PARSER" ] && [ -x /usr/sbin/apparmor_parser ]; then PARSER=/usr/sbin/apparmor_parser; fi
    if [ -n "$PARSER" ]; then
      "$PARSER" -R "$PROFILE" >/dev/null 2>&1 || true
    fi
    rm -f "$PROFILE" 2>/dev/null || true
  fi
fi

exit 0
`;
}

interface TarEntry {
  /** Path inside tar starting with `./`, e.g. `./opt/codecaine-file-manager/VERSION` */
  path: string;
  mode: number;
  type: "file" | "dir" | "symlink";
  data?: Uint8Array;
  linkname?: string;
  mtime?: number;
}

function writeOctal(
  buf: Uint8Array,
  offset: number,
  length: number,
  value: number,
): void {
  const str = value.toString(8).padStart(length - 1, "0");
  for (let i = 0; i < str.length && i < length - 1; i++) {
    buf[offset + i] = str.charCodeAt(i);
  }
  buf[offset + length - 1] = 0;
}

function writeAscii(
  buf: Uint8Array,
  offset: number,
  length: number,
  text: string,
): void {
  const bytes = Buffer.from(text, "utf8");
  const n = Math.min(bytes.length, length);
  buf.set(bytes.subarray(0, n), offset);
}

function makeTarHeader(opts: {
  name: string;
  mode: number;
  size: number;
  mtime: number;
  typeflag: string;
  linkname?: string;
}): Uint8Array {
  const header = new Uint8Array(512);
  writeAscii(header, 0, 100, opts.name);
  writeOctal(header, 100, 8, opts.mode & 0o7777);
  writeOctal(header, 108, 8, 0); // uid = 0 (root)
  writeOctal(header, 116, 8, 0); // gid = 0 (root)
  writeOctal(header, 124, 12, opts.size);
  writeOctal(header, 136, 12, opts.mtime);
  // Checksum field filled with spaces before computing sum
  for (let i = 148; i < 156; i++) header[i] = 0x20;
  header[156] = opts.typeflag.charCodeAt(0);
  if (opts.linkname) writeAscii(header, 157, 100, opts.linkname);
  writeAscii(header, 257, 6, "ustar\0");
  writeAscii(header, 263, 2, "00");
  writeAscii(header, 265, 32, "root");
  writeAscii(header, 297, 32, "root");
  writeOctal(header, 329, 8, 0);
  writeOctal(header, 337, 8, 0);

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i]!;
  const chk = sum.toString(8).padStart(6, "0");
  for (let i = 0; i < 6; i++) header[148 + i] = chk.charCodeAt(i);
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

/**
 * Serializes a deterministic GNU/USTAR tar archive owned by root:root (0:0).
 * Supports arbitrary path lengths via GNU `././@LongLink` headers.
 */
export function buildTarArchive(
  entries: TarEntry[],
  defaultMtime = 1700000000,
): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  const pushPadded = (data: Uint8Array) => {
    chunks.push(data);
    const rem = data.byteLength % 512;
    if (rem !== 0) chunks.push(new Uint8Array(512 - rem));
  };

  for (const entry of entries) {
    const mtime = entry.mtime ?? defaultMtime;
    const rawPath =
      entry.type === "dir" && !entry.path.endsWith("/")
        ? `${entry.path}/`
        : entry.path;
    const pathBytes = Buffer.from(rawPath, "utf8");
    if (pathBytes.byteLength > 99) {
      const longData = new Uint8Array(pathBytes.byteLength + 1);
      longData.set(pathBytes, 0);
      longData[pathBytes.byteLength] = 0;
      chunks.push(
        makeTarHeader({
          name: "././@LongLink",
          mode: 0o644,
          size: longData.byteLength,
          mtime,
          typeflag: "L",
        }),
      );
      pushPadded(longData);
    }

    if (entry.type === "dir") {
      chunks.push(
        makeTarHeader({
          name: rawPath.slice(0, 99),
          mode: entry.mode,
          size: 0,
          mtime,
          typeflag: "5",
        }),
      );
    } else if (entry.type === "symlink") {
      chunks.push(
        makeTarHeader({
          name: rawPath.slice(0, 99),
          mode: entry.mode,
          size: 0,
          mtime,
          typeflag: "2",
          linkname: entry.linkname ?? "",
        }),
      );
    } else {
      const body = entry.data ?? new Uint8Array(0);
      chunks.push(
        makeTarHeader({
          name: rawPath.slice(0, 99),
          mode: entry.mode,
          size: body.byteLength,
          mtime,
          typeflag: "0",
        }),
      );
      if (body.byteLength > 0) pushPadded(body);
    }
  }

  // Two 512-byte zero blocks mark end-of-archive
  chunks.push(new Uint8Array(1024));
  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Serializes a standard Unix `ar` archive used by Debian `.deb` packages.
 */
export function buildArArchive(
  members: Array<{
    name: string;
    data: Uint8Array;
    mtime?: number;
    mode?: number;
  }>,
): Uint8Array {
  const chunks: Uint8Array[] = [Buffer.from("!<arch>\n", "ascii")];
  for (const m of members) {
    const header = Buffer.alloc(60, 0x20);
    header.write(m.name.slice(0, 16), 0, "ascii");
    header.write(String(m.mtime ?? 1700000000).slice(0, 12), 16, "ascii");
    header.write("0", 28, "ascii"); // uid
    header.write("0", 34, "ascii"); // gid
    header.write((m.mode ?? 0o100644).toString(8), 40, "ascii");
    header.write(String(m.data.byteLength), 48, "ascii");
    header[58] = 0x60; // '`'
    header[59] = 0x0a; // '\n'
    chunks.push(header);
    chunks.push(m.data);
    if (m.data.byteLength % 2 === 1) {
      chunks.push(Buffer.from("\n", "ascii"));
    }
  }
  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function collectStageFiles(
  rootDir: string,
  relDir = "",
): Array<{
  rel: string;
  full: string;
  isDir: boolean;
  mode: number;
  size: number;
}> {
  const out: Array<{
    rel: string;
    full: string;
    isDir: boolean;
    mode: number;
    size: number;
  }> = [];
  const current = relDir ? join(rootDir, relDir) : rootDir;
  for (const name of readdirSync(current).sort()) {
    const rel = relDir ? posix.join(relDir, name) : name;
    const full = join(current, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push({ rel, full, isDir: true, mode: 0o755, size: 0 });
      out.push(...collectStageFiles(rootDir, rel));
    } else if (st.isFile()) {
      const exec =
        name === "codecaine-file-manager" ||
        name.endsWith(".sh") ||
        name.endsWith(".so") ||
        (st.mode & 0o111) !== 0;
      out.push({
        rel,
        full,
        isDir: false,
        mode: exec ? 0o755 : 0o644,
        size: st.size,
      });
    }
  }
  return out;
}

/**
 * Builds a complete, spec-compliant `.deb` installer from a staged Linux File Manager directory.
 * Installs to `/opt/codecaine-file-manager`, links `/usr/bin/codecaine-file-manager`, and registers
 * desktop launcher, icons, AppStream MetaInfo XML, and Ubuntu 24.04+ AppArmor userns profile.
 */
export async function buildDebPackage(
  stageDir: string,
  outDebPath: string,
  opts: {
    version?: string;
    arch: "amd64" | "arm64";
    repo?: string;
    iconPngPath?: string | null;
  },
): Promise<string> {
  const version = opts.version ?? VERSION;
  const repo = opts.repo ?? DEFAULT_REPO;
  const dataEntries: TarEntry[] = [];
  const addedDirs = new Set<string>();
  const ensureDir = (tarDirPath: string) => {
    const clean = tarDirPath.replace(/\/+$/, "");
    const parts = clean.split("/");
    let cur = ".";
    for (let i = 1; i < parts.length; i++) {
      cur += "/" + parts[i]!;
      if (!addedDirs.has(cur)) {
        addedDirs.add(cur);
        dataEntries.push({ path: `${cur}/`, mode: 0o755, type: "dir" });
      }
    }
  };

  dataEntries.push({ path: "./", mode: 0o755, type: "dir" });
  addedDirs.add(".");
  ensureDir("./opt/codecaine-file-manager");

  const md5Lines: string[] = [];
  let installedBytes = 0;

  const addFile = (tarPath: string, bytes: Uint8Array, mode = 0o644) => {
    ensureDir(posix.dirname(tarPath));
    dataEntries.push({ path: tarPath, mode, type: "file", data: bytes });
    installedBytes += bytes.byteLength;
    const md5 = createHash("md5").update(bytes).digest("hex");
    md5Lines.push(`${md5}  ${tarPath.replace(/^\.\//, "")}`);
  };

  for (const item of collectStageFiles(stageDir)) {
    const tarPath = `./opt/codecaine-file-manager/${item.rel}`;
    if (item.isDir) {
      ensureDir(tarPath);
    } else {
      const bytes = new Uint8Array(readFileSync(item.full));
      addFile(tarPath, bytes, item.mode);
    }
  }

  // Symlink /usr/bin/codecaine-file-manager -> /opt/codecaine-file-manager/codecaine-file-manager
  ensureDir("./usr/bin");
  dataEntries.push({
    path: "./usr/bin/codecaine-file-manager",
    mode: 0o777,
    type: "symlink",
    linkname: "/opt/codecaine-file-manager/codecaine-file-manager",
  });

  // Desktop files (both reverse-DNS AppStream launchable ID and short CLI name)
  const desktopBytes = Buffer.from(
    systemDesktopEntry("/usr/bin/codecaine-file-manager %U", APPSTREAM_ID),
    "utf8",
  );
  addFile(
    `./usr/share/applications/${APPSTREAM_ID}.desktop`,
    desktopBytes,
    0o644,
  );

  // AppStream MetaInfo XML (makes the package appear with rich GUI metadata in GNOME Software, KDE Discover, Ubuntu App Center)
  const metainfoBytes = Buffer.from(
    appStreamMetaInfoXml(version, new Date().toISOString().slice(0, 10), repo),
    "utf8",
  );
  addFile(
    `./usr/share/metainfo/${APPSTREAM_ID}.metainfo.xml`,
    metainfoBytes,
    0o644,
  );

  // Icons in hicolor + pixmaps
  const iconCandidate =
    opts.iconPngPath && existsSync(opts.iconPngPath)
      ? opts.iconPngPath
      : existsSync(join(stageDir, "codecaine-file-manager.png"))
        ? join(stageDir, "codecaine-file-manager.png")
        : null;
  if (iconCandidate) {
    const iconBytes = new Uint8Array(readFileSync(iconCandidate));
    addFile(
      `./usr/share/icons/hicolor/512x512/apps/${APPSTREAM_ID}.png`,
      iconBytes,
      0o644,
    );
    addFile(
      `./usr/share/icons/hicolor/512x512/apps/codecaine-file-manager.png`,
      iconBytes,
      0o644,
    );
    addFile(`./usr/share/pixmaps/codecaine-file-manager.png`, iconBytes, 0o644);
  }

  const controlText = debControlFile({
    version,
    arch: opts.arch,
    installedSizeKb: Math.ceil(installedBytes / 1024),
    repo,
  });
  const controlEntries: TarEntry[] = [
    { path: "./", mode: 0o755, type: "dir" },
    {
      path: "./control",
      mode: 0o644,
      type: "file",
      data: Buffer.from(controlText, "utf8"),
    },
    {
      path: "./md5sums",
      mode: 0o644,
      type: "file",
      data: Buffer.from(md5Lines.join("\n") + "\n", "utf8"),
    },
    {
      path: "./postinst",
      mode: 0o755,
      type: "file",
      data: Buffer.from(debPostinstScript(), "utf8"),
    },
    {
      path: "./prerm",
      mode: 0o755,
      type: "file",
      data: Buffer.from(debPrermScript(), "utf8"),
    },
  ];

  const controlTarGz = Bun.gzipSync(buildTarArchive(controlEntries));
  const dataTarGz = Bun.gzipSync(buildTarArchive(dataEntries));
  const debBytes = buildArArchive([
    { name: "debian-binary", data: Buffer.from("2.0\n", "ascii") },
    { name: "control.tar.gz", data: controlTarGz },
    { name: "data.tar.gz", data: dataTarGz },
  ]);

  mkdirSync(dirname(outDebPath), { recursive: true });
  writeFileSync(outDebPath, debBytes);
  return outDebPath;
}

export function rpmPostinScript(): string {
  return `#!/bin/sh
set -e

APP_BIN="/opt/codecaine-file-manager/codecaine-file-manager"
PROFILE="/etc/apparmor.d/codecaine-file-manager"

if [ -x "$APP_BIN" ]; then
  chmod 0755 "$APP_BIN" 2>/dev/null || true
fi
ln -sf "$APP_BIN" /usr/bin/codecaine-file-manager

# Do not silently install a system-wide unconfined userns AppArmor profile on the
# BUN_BE_BUN-capable packaged binary during .rpm installation; clean up any legacy
# unconfined profile left behind by an earlier package release.
if [ -f "$PROFILE" ] && grep -q "flags=(unconfined)" "$PROFILE" 2>/dev/null; then
  PARSER="$(command -v apparmor_parser || true)"
  if [ -z "$PARSER" ] && [ -x /usr/sbin/apparmor_parser ]; then PARSER=/usr/sbin/apparmor_parser; fi
  if [ -n "$PARSER" ]; then
    "$PARSER" -R "$PROFILE" >/dev/null 2>&1 || true
  fi
  rm -f "$PROFILE" 2>/dev/null || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi
if command -v appstreamcli >/dev/null 2>&1; then
  appstreamcli refresh-cache >/dev/null 2>&1 || true
fi

exit 0
`;
}

export function rpmPreunScript(): string {
  return `#!/bin/sh
set -e

PROFILE="/etc/apparmor.d/codecaine-file-manager"

if [ "$1" = "0" ]; then
  if [ -f "$PROFILE" ]; then
    PARSER="$(command -v apparmor_parser || true)"
    if [ -z "$PARSER" ] && [ -x /usr/sbin/apparmor_parser ]; then PARSER=/usr/sbin/apparmor_parser; fi
    if [ -n "$PARSER" ]; then
      "$PARSER" -R "$PROFILE" >/dev/null 2>&1 || true
    fi
    rm -f "$PROFILE" 2>/dev/null || true
  fi
fi

exit 0
`;
}

export interface CpioEntry {
  /** Path inside cpio starting with `./`, e.g. `./opt/codecaine-file-manager/VERSION` */
  name: string;
  /** Full stat mode including S_IFDIR (`0o040000`), S_IFLNK (`0o120000`), or S_IFREG (`0o100000`) */
  mode: number;
  mtime?: number;
  ino?: number;
  nlink?: number;
  data?: Uint8Array;
}

/**
 * Serializes a deterministic SVR4 "newc" (`070701`) CPIO archive owned by root:root (`0:0`),
 * used as the uncompressed payload inside RPM v4 packages.
 */
export function buildCpioNewcArchive(
  entries: CpioEntry[],
  defaultMtime = 1700000000,
): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  const pad4 = (len: number) => (4 - (len % 4)) % 4;
  const hex8 = (v: number) =>
    (v >>> 0).toString(16).toUpperCase().padStart(8, "0");

  const writeRecord = (
    name: string,
    mode: number,
    mtime: number,
    ino: number,
    nlink: number,
    body: Uint8Array,
  ) => {
    const nameBytes = Buffer.from(name, "utf8");
    const nameSize = nameBytes.byteLength + 1;
    const hdrStr =
      "070701" +
      hex8(ino) +
      hex8(mode) +
      hex8(0) + // uid = 0
      hex8(0) + // gid = 0
      hex8(nlink) +
      hex8(mtime) +
      hex8(body.byteLength) +
      hex8(0) + // devmajor
      hex8(0) + // devminor
      hex8(0) + // rdevmajor
      hex8(0) + // rdevminor
      hex8(nameSize) +
      hex8(0); // check
    const hdrBytes = Buffer.from(hdrStr, "ascii");
    chunks.push(hdrBytes);
    chunks.push(nameBytes);
    chunks.push(new Uint8Array([0]));
    const hPad = pad4(hdrBytes.byteLength + nameSize);
    if (hPad > 0) chunks.push(new Uint8Array(hPad));
    if (body.byteLength > 0) {
      chunks.push(body);
      const bPad = pad4(body.byteLength);
      if (bPad > 0) chunks.push(new Uint8Array(bPad));
    }
  };

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const body = e.data ?? new Uint8Array(0);
    writeRecord(
      e.name,
      e.mode,
      e.mtime ?? defaultMtime,
      e.ino ?? i + 1,
      e.nlink ?? ((e.mode & 0o170000) === 0o040000 ? 2 : 1),
      body,
    );
  }
  writeRecord("TRAILER!!!", 0, 0, 0, 1, new Uint8Array(0));

  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

const RPM_TYPE_INT16 = 3;
const RPM_TYPE_INT32 = 4;
const RPM_TYPE_STRING = 6;
const RPM_TYPE_BIN = 7;
const RPM_TYPE_STRING_ARRAY = 8;
const RPM_TYPE_I18NSTRING = 9;

const RPM_REGION_SIGNATURES = 62; // 0x3e, RPMTAG_HEADERSIGNATURES
const RPM_REGION_IMMUTABLE = 63; // 0x3f, RPMTAG_HEADERIMMUTABLE

interface RpmIndexValue {
  type: number;
  count: number;
  data: Uint8Array;
}

function rpmEntryInt16(values: number[]): RpmIndexValue {
  const buf = Buffer.alloc(values.length * 2);
  for (let i = 0; i < values.length; i++) {
    buf.writeUInt16BE(values[i]! & 0xffff, i * 2);
  }
  return { type: RPM_TYPE_INT16, count: values.length, data: buf };
}

function rpmEntryInt32(values: number[]): RpmIndexValue {
  const buf = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    buf.writeInt32BE(values[i]! | 0, i * 4);
  }
  return { type: RPM_TYPE_INT32, count: values.length, data: buf };
}

function rpmEntryUint32(values: number[]): RpmIndexValue {
  const buf = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    buf.writeUInt32BE(values[i]! >>> 0, i * 4);
  }
  return { type: RPM_TYPE_INT32, count: values.length, data: buf };
}

function rpmEntryString(value: string): RpmIndexValue {
  const raw = Buffer.from(value + "\0", "utf8");
  return { type: RPM_TYPE_STRING, count: 1, data: raw };
}

function rpmEntryI18NString(value: string): RpmIndexValue {
  const raw = Buffer.from(value + "\0", "utf8");
  return { type: RPM_TYPE_I18NSTRING, count: 1, data: raw };
}

function rpmEntryBytes(value: Uint8Array): RpmIndexValue {
  return { type: RPM_TYPE_BIN, count: value.byteLength, data: value };
}

function rpmEntryStringSlice(values: string[]): RpmIndexValue {
  const raw = Buffer.from(values.join("\0") + "\0", "utf8");
  return { type: RPM_TYPE_STRING_ARRAY, count: values.length, data: raw };
}

function buildRpmHeaderBlock(
  regionTag: number,
  entries: Map<number, RpmIndexValue>,
): Uint8Array {
  const tags = Array.from(entries.keys()).sort((a, b) => a - b);
  const dataChunks: Uint8Array[] = [];
  let dataLen = 0;
  const offsets: number[] = [];

  for (const tag of tags) {
    const e = entries.get(tag)!;
    const align =
      e.type === RPM_TYPE_INT16 ? 2 : e.type === RPM_TYPE_INT32 ? 4 : 1;
    const rem = dataLen % align;
    if (rem !== 0) {
      const pad = align - rem;
      dataChunks.push(new Uint8Array(pad));
      dataLen += pad;
    }
    offsets.push(dataLen);
    dataChunks.push(e.data);
    dataLen += e.data.byteLength;
  }

  // Immutable region trailer (16 bytes at end of data store pointing back with negative offset)
  const regionOffset = dataLen;
  const trailer = Buffer.alloc(16);
  trailer.writeInt32BE(regionTag, 0);
  trailer.writeInt32BE(RPM_TYPE_BIN, 4);
  trailer.writeInt32BE(-16 * (tags.length + 1), 8);
  trailer.writeInt32BE(16, 12);
  dataChunks.push(trailer);
  dataLen += 16;

  const indexCount = tags.length + 1;
  const out = Buffer.alloc(16 + indexCount * 16 + dataLen);
  // 8-byte header magic + 4-byte index count + 4-byte data length
  out.set([0x8e, 0xad, 0xe8, 0x01, 0x00, 0x00, 0x00, 0x00], 0);
  out.writeInt32BE(indexCount, 8);
  out.writeInt32BE(dataLen, 12);

  let pos = 16;
  const writeIdx = (
    tag: number,
    type: number,
    offset: number,
    count: number,
  ) => {
    out.writeInt32BE(tag, pos);
    out.writeInt32BE(type, pos + 4);
    out.writeInt32BE(offset, pos + 8);
    out.writeInt32BE(count, pos + 12);
    pos += 16;
  };

  // Region entry first, then sorted tag entries
  writeIdx(regionTag, RPM_TYPE_BIN, regionOffset, 16);
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i]!;
    const e = entries.get(tag)!;
    writeIdx(tag, e.type, offsets[i]!, e.count);
  }
  for (const c of dataChunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

function buildRpmLead(
  name: string,
  fullVersion: string,
  arch: "x86_64" | "aarch64",
): Uint8Array {
  const lead = Buffer.alloc(96, 0);
  lead.set([0xed, 0xab, 0xee, 0xdb], 0);
  lead[4] = 0x03; // major 3
  lead[5] = 0x00; // minor 0
  lead.writeUInt16BE(0, 6); // binary package (0)
  // RPM lead archnum: 1 = x86_64/i386, 19 = aarch64
  lead.writeUInt16BE(arch === "aarch64" ? 19 : 1, 8);
  const pkgLabel = Buffer.from(`${name}-${fullVersion}`, "utf8").subarray(
    0,
    65,
  );
  lead.set(pkgLabel, 10);
  lead.writeUInt16BE(1, 76); // osnum: Linux (1)
  lead.writeUInt16BE(5, 78); // signature_type: RPMSIGTYPE_HEADERSIG (5)
  return new Uint8Array(lead.buffer, lead.byteOffset, lead.byteLength);
}

/**
 * Builds a complete, spec-compliant `.rpm` installer (RPM v4 header + gzip-compressed SVR4 CPIO payload)
 * from a staged Linux File Manager directory without requiring `rpmbuild` on the build host.
 * Installs to `/opt/codecaine-file-manager`, links `/usr/bin/codecaine-file-manager`, and registers
 * desktop launcher, icons, and AppStream MetaInfo XML for Fedora, RHEL, Rocky, AlmaLinux, and openSUSE.
 */
export async function buildRpmPackage(
  stageDir: string,
  outRpmPath: string,
  opts: {
    version?: string;
    release?: string;
    arch: "x86_64" | "aarch64";
    repo?: string;
    iconPngPath?: string | null;
  },
): Promise<string> {
  const version = opts.version ?? VERSION;
  const release = opts.release ?? "1";
  const repo = opts.repo ?? DEFAULT_REPO;
  const defaultMtime = 1700000000;

  interface StagedRpmItem {
    absPath: string; // e.g. `/opt/codecaine-file-manager/codecaine-file-manager`
    kind: "file" | "dir" | "symlink";
    modePerm: number;
    data: Uint8Array;
    linkTarget: string;
  }

  const fileMap = new Map<string, StagedRpmItem>();
  // Only own package-specific directories; never claim system dirs like `/usr/bin` or `/usr/share/applications`
  const addDir = (absDirPath: string, modePerm = 0o755) => {
    const clean = absDirPath.replace(/\/+$/, "");
    if (!clean.startsWith("/opt/codecaine-file-manager")) return;
    const parts = clean.split("/").filter(Boolean);
    let cur = "";
    for (const p of parts) {
      cur += "/" + p;
      if (!cur.startsWith("/opt/codecaine-file-manager")) continue;
      if (!fileMap.has(cur)) {
        fileMap.set(cur, {
          absPath: cur,
          kind: "dir",
          modePerm,
          data: new Uint8Array(0),
          linkTarget: "",
        });
      }
    }
  };

  const addFile = (absPath: string, bytes: Uint8Array, modePerm = 0o644) => {
    addDir(posix.dirname(absPath));
    fileMap.set(absPath, {
      absPath,
      kind: "file",
      modePerm: modePerm & 0o7777,
      data: bytes,
      linkTarget: "",
    });
  };

  addDir("/opt/codecaine-file-manager");

  for (const item of collectStageFiles(stageDir)) {
    const absPath = `/opt/codecaine-file-manager/${item.rel}`;
    if (item.isDir) {
      addDir(absPath, item.mode);
    } else {
      addFile(absPath, new Uint8Array(readFileSync(item.full)), item.mode);
    }
  }

  // Symlink /usr/bin/codecaine-file-manager -> /opt/codecaine-file-manager/codecaine-file-manager
  const symlinkTarget = "/opt/codecaine-file-manager/codecaine-file-manager";
  fileMap.set("/usr/bin/codecaine-file-manager", {
    absPath: "/usr/bin/codecaine-file-manager",
    kind: "symlink",
    modePerm: 0o777,
    data: new Uint8Array(Buffer.from(symlinkTarget, "utf8")),
    linkTarget: symlinkTarget,
  });

  // Desktop file
  const desktopBytes = new Uint8Array(
    Buffer.from(
      systemDesktopEntry("/usr/bin/codecaine-file-manager %U", APPSTREAM_ID),
      "utf8",
    ),
  );
  addFile(
    `/usr/share/applications/${APPSTREAM_ID}.desktop`,
    desktopBytes,
    0o644,
  );

  // AppStream MetaInfo XML
  const metainfoBytes = new Uint8Array(
    Buffer.from(
      appStreamMetaInfoXml(
        version,
        new Date().toISOString().slice(0, 10),
        repo,
      ),
      "utf8",
    ),
  );
  addFile(
    `/usr/share/metainfo/${APPSTREAM_ID}.metainfo.xml`,
    metainfoBytes,
    0o644,
  );

  // Icons in hicolor + pixmaps
  const iconCandidate =
    opts.iconPngPath && existsSync(opts.iconPngPath)
      ? opts.iconPngPath
      : existsSync(join(stageDir, "codecaine-file-manager.png"))
        ? join(stageDir, "codecaine-file-manager.png")
        : null;
  if (iconCandidate) {
    const iconBytes = new Uint8Array(readFileSync(iconCandidate));
    addFile(
      `/usr/share/icons/hicolor/512x512/apps/${APPSTREAM_ID}.png`,
      iconBytes,
      0o644,
    );
    addFile(
      `/usr/share/icons/hicolor/512x512/apps/codecaine-file-manager.png`,
      iconBytes,
      0o644,
    );
    addFile(`/usr/share/pixmaps/codecaine-file-manager.png`, iconBytes, 0o644);
  }

  // Sort all entries lexicographically by path (required by RPM)
  const sortedPaths = Array.from(fileMap.keys()).sort();
  const dirLookup = new Map<string, number>();
  const dirnames: string[] = [];
  const getDirIndex = (dirWithSlash: string): number => {
    const existing = dirLookup.get(dirWithSlash);
    if (existing !== undefined) return existing;
    const idx = dirnames.length;
    dirnames.push(dirWithSlash);
    dirLookup.set(dirWithSlash, idx);
    return idx;
  };

  const dirindexes: number[] = [];
  const basenames: string[] = [];
  const filesizes: number[] = [];
  const filemodes: number[] = [];
  const filerdevs: number[] = [];
  const filemtimes: number[] = [];
  const filedigests: string[] = [];
  const filelinktos: string[] = [];
  const fileflags: number[] = [];
  const fileusernames: string[] = [];
  const filegroupnames: string[] = [];
  const fileverifyflags: number[] = [];
  const filedevices: number[] = [];
  const fileinodes: number[] = [];
  const filelangs: string[] = [];
  const cpioEntries: CpioEntry[] = [];
  let installedBytes = 0;

  for (let i = 0; i < sortedPaths.length; i++) {
    const p = sortedPaths[i]!;
    const item = fileMap.get(p)!;
    const slashIdx = p.lastIndexOf("/");
    const dirPart = p.slice(0, slashIdx + 1);
    const basePart = p.slice(slashIdx + 1);

    dirindexes.push(getDirIndex(dirPart));
    basenames.push(basePart);

    let fullMode = item.modePerm & 0o7777;
    let size = 0;
    let digest = "";
    let nlink = 1;
    if (item.kind === "dir") {
      fullMode |= 0o040000;
      size = 4096;
      nlink = 2;
    } else if (item.kind === "symlink") {
      fullMode |= 0o120000;
      size = item.data.byteLength;
    } else {
      fullMode |= 0o100000;
      size = item.data.byteLength;
      digest = createHash("sha256").update(item.data).digest("hex");
    }

    filesizes.push(size);
    installedBytes += size;
    filemodes.push(fullMode);
    filerdevs.push(1);
    filemtimes.push(defaultMtime);
    filedigests.push(digest);
    filelinktos.push(item.linkTarget);
    fileflags.push(0);
    fileusernames.push("root");
    filegroupnames.push("root");
    fileverifyflags.push(-1);
    filedevices.push(1);
    fileinodes.push(i + 1);
    filelangs.push("");

    cpioEntries.push({
      name: `.${p}`,
      mode: fullMode,
      mtime: defaultMtime,
      ino: i + 1,
      nlink,
      data: item.data,
    });
  }

  const cpioRaw = buildCpioNewcArchive(cpioEntries, defaultMtime);
  const payloadGz = new Uint8Array(Bun.gzipSync(cpioRaw));
  const payloadSha256 = createHash("sha256").update(payloadGz).digest("hex");
  const fullVersion = `${version}-${release}`;
  const isa = opts.arch === "aarch64" ? "aarch-64" : "x86-64";

  // Build main Header tags
  const hdr = new Map<number, RpmIndexValue>();
  hdr.set(100, rpmEntryStringSlice(["C"])); // HEADERI18NTABLE
  hdr.set(1000, rpmEntryString(RPM_PACKAGE_NAME)); // NAME
  hdr.set(1001, rpmEntryString(version)); // VERSION
  hdr.set(1002, rpmEntryString(release)); // RELEASE
  hdr.set(
    1004,
    rpmEntryI18NString(
      "Dual-pane file manager, code editor, and database studios for developers",
    ),
  ); // SUMMARY
  hdr.set(
    1005,
    rpmEntryI18NString(
      "Codecaine File Manager is a fast, private desktop file manager for developers featuring dual panes, a built-in code editor, database studios (SQLite, MySQL, PostgreSQL, Redis), a cross-platform Process & Task Manager, a System Information dashboard, an encrypted password vault, a live web server, a multi-connection download manager, and 1-click local Ollama AI integration.",
    ),
  ); // DESCRIPTION
  hdr.set(1006, rpmEntryInt32([defaultMtime])); // BUILDTIME
  hdr.set(1007, rpmEntryString("localhost")); // BUILDHOST
  hdr.set(1009, rpmEntryInt32([installedBytes])); // SIZE
  hdr.set(1011, rpmEntryString("Codecaine")); // VENDOR
  hdr.set(1014, rpmEntryString("MIT")); // LICENSE
  hdr.set(1015, rpmEntryString(`Codecaine <https://github.com/${repo}>`)); // PACKAGER
  hdr.set(1016, rpmEntryString("Applications/File")); // GROUP
  hdr.set(1020, rpmEntryString(`https://github.com/${repo}`)); // URL
  hdr.set(1021, rpmEntryString("linux")); // OS
  hdr.set(1022, rpmEntryString(opts.arch)); // ARCH
  hdr.set(1024, rpmEntryString(rpmPostinScript())); // POSTIN
  hdr.set(1025, rpmEntryString(rpmPreunScript())); // PREUN
  hdr.set(1028, rpmEntryUint32(filesizes)); // FILESIZES
  hdr.set(1030, rpmEntryInt16(filemodes)); // FILEMODES
  hdr.set(1033, rpmEntryInt16(filerdevs)); // FILERDEVS
  hdr.set(1034, rpmEntryInt32(filemtimes)); // FILEMTIMES
  hdr.set(1035, rpmEntryStringSlice(filedigests)); // FILEDIGESTS
  hdr.set(1036, rpmEntryStringSlice(filelinktos)); // FILELINKTOS
  hdr.set(1037, rpmEntryInt32(fileflags)); // FILEFLAGS
  hdr.set(1039, rpmEntryStringSlice(fileusernames)); // FILEUSERNAME
  hdr.set(1040, rpmEntryStringSlice(filegroupnames)); // FILEGROUPNAME
  hdr.set(1044, rpmEntryString(`${RPM_PACKAGE_NAME}-${fullVersion}.src.rpm`)); // SOURCERPM
  hdr.set(1045, rpmEntryInt32(fileverifyflags)); // FILEVERIFYFLAGS

  // PROVIDES: package name and arch-qualified ISA
  const provideNames = [RPM_PACKAGE_NAME, `${RPM_PACKAGE_NAME}(${isa})`];
  const provideVers = [fullVersion, fullVersion];
  const provideFlags = [8, 8]; // RPMSENSE_EQUAL (1 << 3)
  hdr.set(1047, rpmEntryStringSlice(provideNames)); // PROVIDENAME
  hdr.set(1112, rpmEntryInt32(provideFlags)); // PROVIDEFLAGS
  hdr.set(1113, rpmEntryStringSlice(provideVers)); // PROVIDEVERSION

  // REQUIRES: shared library sonames (portable across Fedora, RHEL, Rocky, Alma, openSUSE) + rpmlib features
  const sfx = opts.arch === "aarch64" ? "(64bit)" : "()(64bit)";
  const rpmlibSense = (1 << 24) | 2 | 8; // RPMSENSE_RPMLIB | RPMSENSE_LESS | RPMSENSE_EQUAL
  const requiresList: Array<{ name: string; ver: string; flags: number }> = [
    { name: "/bin/sh", ver: "", flags: 0 },
    {
      name:
        opts.arch === "aarch64"
          ? "libc.so.6(GLIBC_2.17)(64bit)"
          : "libc.so.6(GLIBC_2.17)(64bit)",
      ver: "",
      flags: 0,
    },
    { name: `libgtk-4.so.1${sfx}`, ver: "", flags: 0 },
    { name: `libwebkitgtk-6.0.so.4${sfx}`, ver: "", flags: 0 },
    {
      name: "rpmlib(CompressedFileNames)",
      ver: "3.0.4-1",
      flags: rpmlibSense,
    },
    { name: "rpmlib(FileDigests)", ver: "4.6.0-1", flags: rpmlibSense },
    {
      name: "rpmlib(PayloadFilesHavePrefix)",
      ver: "4.0-1",
      flags: rpmlibSense,
    },
  ];
  hdr.set(1048, rpmEntryInt32(requiresList.map((r) => r.flags))); // REQUIREFLAGS
  hdr.set(1049, rpmEntryStringSlice(requiresList.map((r) => r.name))); // REQUIRENAME
  hdr.set(1050, rpmEntryStringSlice(requiresList.map((r) => r.ver))); // REQUIREVERSION

  hdr.set(1064, rpmEntryString("4.18.0")); // RPMVERSION
  hdr.set(1086, rpmEntryString("/bin/sh")); // POSTINPROG
  hdr.set(1087, rpmEntryString("/bin/sh")); // PREUNPROG
  hdr.set(1095, rpmEntryInt32(filedevices)); // FILEDEVICES
  hdr.set(1096, rpmEntryInt32(fileinodes)); // FILEINODES
  hdr.set(1097, rpmEntryStringSlice(filelangs)); // FILELANGS
  hdr.set(1116, rpmEntryInt32(dirindexes)); // DIRINDEXES
  hdr.set(1117, rpmEntryStringSlice(basenames)); // BASENAMES
  hdr.set(1118, rpmEntryStringSlice(dirnames)); // DIRNAMES
  hdr.set(1124, rpmEntryString("cpio")); // PAYLOADFORMAT
  hdr.set(1125, rpmEntryString("gzip")); // PAYLOADCOMPRESSOR
  hdr.set(1126, rpmEntryString("9")); // PAYLOADFLAGS
  hdr.set(5011, rpmEntryInt32([8])); // FILEDIGESTALGO (8 = SHA256)
  hdr.set(5062, rpmEntryString("utf-8")); // ENCODING
  hdr.set(5092, rpmEntryStringSlice([payloadSha256])); // PAYLOADDIGEST
  hdr.set(5093, rpmEntryInt32([8])); // PAYLOADDIGESTALGO (8 = SHA256)
  hdr.set(5097, rpmEntryStringSlice([payloadSha256])); // PAYLOADDIGESTALT

  const headerBytes = buildRpmHeaderBlock(RPM_REGION_IMMUTABLE, hdr);

  // Build Signature Header tags
  const sig = new Map<number, RpmIndexValue>();
  const hdrSha1 = createHash("sha1").update(headerBytes).digest("hex");
  const hdrSha256 = createHash("sha256").update(headerBytes).digest("hex");
  const md5Hash = createHash("md5");
  md5Hash.update(headerBytes);
  md5Hash.update(payloadGz);
  const md5Bytes = new Uint8Array(md5Hash.digest());

  sig.set(269, rpmEntryString(hdrSha1)); // RPMSIGTAG_SHA1
  sig.set(273, rpmEntryString(hdrSha256)); // RPMSIGTAG_SHA256
  sig.set(1000, rpmEntryInt32([headerBytes.byteLength + payloadGz.byteLength])); // RPMSIGTAG_SIZE
  sig.set(1004, rpmEntryBytes(md5Bytes)); // RPMSIGTAG_MD5
  sig.set(1007, rpmEntryInt32([cpioRaw.byteLength])); // RPMSIGTAG_PAYLOADSIZE

  const sigBytes = buildRpmHeaderBlock(RPM_REGION_SIGNATURES, sig);
  const sigPadLen = (8 - (sigBytes.byteLength % 8)) % 8;
  const leadBytes = buildRpmLead(RPM_PACKAGE_NAME, fullVersion, opts.arch);

  const totalLen =
    leadBytes.byteLength +
    sigBytes.byteLength +
    sigPadLen +
    headerBytes.byteLength +
    payloadGz.byteLength;
  const rpmBytes = new Uint8Array(totalLen);
  let offset = 0;
  rpmBytes.set(leadBytes, offset);
  offset += leadBytes.byteLength;
  rpmBytes.set(sigBytes, offset);
  offset += sigBytes.byteLength;
  offset += sigPadLen; // already zero-filled
  rpmBytes.set(headerBytes, offset);
  offset += headerBytes.byteLength;
  rpmBytes.set(payloadGz, offset);

  mkdirSync(dirname(outRpmPath), { recursive: true });
  writeFileSync(outRpmPath, rpmBytes);
  return outRpmPath;
}

/**
 * Generates the Flathub / Flatpak manifest (`io.github.codecaine_zz.CodecaineFileManager.yml`).
 * Uses `org.gnome.Platform` 47 which includes GTK 4 and WebKitGTK 6.0 out of the box.
 */
export function flathubManifestYaml(opts: {
  version?: string;
  repo?: string;
  sha256X64: string;
  sha256Arm64: string;
}): string {
  const version = opts.version ?? VERSION;
  const repo = opts.repo ?? DEFAULT_REPO;
  return `app-id: ${APPSTREAM_ID}
runtime: org.gnome.Platform
runtime-version: '47'
sdk: org.gnome.Sdk
command: codecaine-file-manager
separate-locales: false
finish-args:
  - --share=ipc
  - --socket=fallback-x11
  - --socket=wayland
  - --device=dri
  - --share=network
  - --filesystem=host
  - --talk-name=org.freedesktop.Notifications
  - --talk-name=org.freedesktop.FileManager1

modules:
  - name: codecaine-file-manager
    buildsystem: simple
    build-commands:
      - mkdir -p /app/lib/codecaine-file-manager /app/bin
      - cp -r codecaine-file-manager app lib resources LICENSE README.txt VERSION /app/lib/codecaine-file-manager/
      - install -Dm755 install-ollama.sh /app/lib/codecaine-file-manager/install-ollama.sh
      - chmod 0755 /app/lib/codecaine-file-manager/codecaine-file-manager
      - ln -sf /app/lib/codecaine-file-manager/codecaine-file-manager /app/bin/codecaine-file-manager
      - install -Dm644 ${APPSTREAM_ID}.desktop /app/share/applications/${APPSTREAM_ID}.desktop
      - install -Dm644 ${APPSTREAM_ID}.metainfo.xml /app/share/metainfo/${APPSTREAM_ID}.metainfo.xml
      - install -Dm644 codecaine-file-manager.png /app/share/icons/hicolor/512x512/apps/${APPSTREAM_ID}.png
    sources:
      - type: archive
        only-arches:
          - x86_64
        archive-type: zip
        url: https://github.com/${repo}/releases/download/v${version}/Codecaine-File-Manager-v${version}-linux-x64.zip
        sha256: ${opts.sha256X64}
      - type: archive
        only-arches:
          - aarch64
        archive-type: zip
        url: https://github.com/${repo}/releases/download/v${version}/Codecaine-File-Manager-v${version}-linux-arm64.zip
        sha256: ${opts.sha256Arm64}
      - type: file
        path: ${APPSTREAM_ID}.desktop
      - type: file
        path: ${APPSTREAM_ID}.metainfo.xml
`;
}

/**
 * Generates the Snap Store manifest (`snapcraft.yaml`) for Ubuntu App Center.
 */
export function snapcraftYaml(
  opts: { version?: string; repo?: string } = {},
): string {
  const version = opts.version ?? VERSION;
  const repo = opts.repo ?? DEFAULT_REPO;
  return `name: codecaine-file-manager
base: core24
version: '${version}'
summary: Dual-pane file manager, code editor, and database studios for developers
description: |
  Codecaine File Manager is a fast, private file manager for developers featuring
  dual panes, a code editor, SQLite/MySQL/PostgreSQL/Redis studios, a Process & Task
  Manager, a System Information dashboard, an encrypted password vault, a live web
  server, a multi-connection download manager, and 1-click local Ollama AI integration.
grade: stable
confinement: strict
compression: lzo
license: MIT
source-code: https://github.com/${repo}
issues: https://github.com/${repo}/issues
website: https://github.com/${repo}

platforms:
  amd64:
    build-on: [amd64]
    build-for: [amd64]
  arm64:
    build-on: [arm64]
    build-for: [arm64]

apps:
  codecaine-file-manager:
    command: opt/codecaine-file-manager/codecaine-file-manager
    extensions: [gnome]
    desktop: usr/share/applications/${APPSTREAM_ID}.desktop
    common-id: ${APPSTREAM_ID}
    plugs:
      - home
      - removable-media
      - network
      - network-bind
      - desktop
      - desktop-legacy
      - wayland
      - x11
      - opengl
      - mount-observe
      - system-observe
      - process-control

parts:
  codecaine-file-manager:
    plugin: dump
    source:
      - on amd64: https://github.com/${repo}/releases/download/v${version}/Codecaine-File-Manager-v${version}-linux-x64.zip
      - on arm64: https://github.com/${repo}/releases/download/v${version}/Codecaine-File-Manager-v${version}-linux-arm64.zip
    source-type: zip
    build-packages:
      - unzip
    override-build: |
      mkdir -p "$CRAFT_PART_INSTALL/opt/codecaine-file-manager"
      cp -r codecaine-file-manager app lib resources install-ollama.sh LICENSE README.txt VERSION "$CRAFT_PART_INSTALL/opt/codecaine-file-manager/"
      chmod 0755 "$CRAFT_PART_INSTALL/opt/codecaine-file-manager/codecaine-file-manager"
      mkdir -p "$CRAFT_PART_INSTALL/usr/share/applications" "$CRAFT_PART_INSTALL/usr/share/metainfo" "$CRAFT_PART_INSTALL/usr/share/icons/hicolor/512x512/apps"
      cp codecaine-file-manager.png "$CRAFT_PART_INSTALL/usr/share/icons/hicolor/512x512/apps/${APPSTREAM_ID}.png"
      if [ -f "${APPSTREAM_ID}.desktop" ]; then
        sed 's|Exec=/usr/bin/codecaine-file-manager|Exec=codecaine-file-manager|g' "${APPSTREAM_ID}.desktop" > "$CRAFT_PART_INSTALL/usr/share/applications/${APPSTREAM_ID}.desktop"
      fi
      if [ -f "${APPSTREAM_ID}.metainfo.xml" ]; then
        cp "${APPSTREAM_ID}.metainfo.xml" "$CRAFT_PART_INSTALL/usr/share/metainfo/${APPSTREAM_ID}.metainfo.xml"
      fi
    parse-info:
      - usr/share/metainfo/${APPSTREAM_ID}.metainfo.xml
`;
}

/**
 * Generates the Arch Linux AUR `PKGBUILD` (`codecaine-file-manager-bin`) for Pamac, Octopi, Bauh, and yay/paru.
 */
export function aurPkgbuild(opts: {
  version?: string;
  repo?: string;
  sha256X64: string;
  sha256Arm64: string;
}): string {
  const version = opts.version ?? VERSION;
  const repo = opts.repo ?? DEFAULT_REPO;
  return `# Maintainer: Codecaine <https://github.com/${repo}>
pkgname=codecaine-file-manager-bin
pkgver=${version}
pkgrel=1
pkgdesc="Dual-pane file manager, code editor, and database studios for developers"
arch=('x86_64' 'aarch64')
url="https://github.com/${repo}"
license=('MIT')
depends=('glibc' 'gtk4' 'webkitgtk-6.0')
provides=('codecaine-file-manager')
conflicts=('codecaine-file-manager')
options=('!strip' '!debug')
source_x86_64=("https://github.com/${repo}/releases/download/v\${pkgver}/Codecaine-File-Manager-v\${pkgver}-linux-x64.zip")
source_aarch64=("https://github.com/${repo}/releases/download/v\${pkgver}/Codecaine-File-Manager-v\${pkgver}-linux-arm64.zip")
sha256sums_x86_64=('${opts.sha256X64}')
sha256sums_aarch64=('${opts.sha256Arm64}')

package() {
  local _arch_id="linux-x64"
  if [[ "\${CARCH}" == "aarch64" ]]; then
    _arch_id="linux-arm64"
  fi
  cd "\${srcdir}/Codecaine-File-Manager-v\${pkgver}-\${_arch_id}"

  install -d "\${pkgdir}/opt/codecaine-file-manager" "\${pkgdir}/usr/bin"
  cp -r codecaine-file-manager app lib resources install-ollama.sh troubleshoot.sh README.txt VERSION "\${pkgdir}/opt/codecaine-file-manager/"
  chmod 0755 "\${pkgdir}/opt/codecaine-file-manager/codecaine-file-manager"
  ln -sf /opt/codecaine-file-manager/codecaine-file-manager "\${pkgdir}/usr/bin/codecaine-file-manager"

  install -Dm644 "${APPSTREAM_ID}.desktop" "\${pkgdir}/usr/share/applications/${APPSTREAM_ID}.desktop"
  install -Dm644 "${APPSTREAM_ID}.metainfo.xml" "\${pkgdir}/usr/share/metainfo/${APPSTREAM_ID}.metainfo.xml"
  install -Dm644 "codecaine-file-manager.png" "\${pkgdir}/usr/share/icons/hicolor/512x512/apps/${APPSTREAM_ID}.png"
  install -Dm644 "codecaine-file-manager.png" "\${pkgdir}/usr/share/pixmaps/codecaine-file-manager.png"
  install -Dm644 "LICENSE" "\${pkgdir}/usr/share/licenses/\${pkgname}/LICENSE"
}
`;
}

/**
 * Generates `.SRCINFO` matching `aurPkgbuild` for AUR git pushes.
 */
export function aurSrcinfo(opts: {
  version?: string;
  repo?: string;
  sha256X64: string;
  sha256Arm64: string;
}): string {
  const version = opts.version ?? VERSION;
  const repo = opts.repo ?? DEFAULT_REPO;
  return `pkgbase = codecaine-file-manager-bin
\tpkgdesc = Dual-pane file manager, code editor, and database studios for developers
\tpkgver = ${version}
\tpkgrel = 1
\turl = https://github.com/${repo}
\tarch = x86_64
\tarch = aarch64
\tlicense = MIT
\tdepends = glibc
\tdepends = gtk4
\tdepends = webkitgtk-6.0
\tprovides = codecaine-file-manager
\tconflicts = codecaine-file-manager
\toptions = !strip
\toptions = !debug
\tsource_x86_64 = https://github.com/${repo}/releases/download/v${version}/Codecaine-File-Manager-v${version}-linux-x64.zip
\tsha256sums_x86_64 = ${opts.sha256X64}
\tsource_aarch64 = https://github.com/${repo}/releases/download/v${version}/Codecaine-File-Manager-v${version}-linux-arm64.zip
\tsha256sums_aarch64 = ${opts.sha256Arm64}

pkgname = codecaine-file-manager-bin
`;
}

/**
 * Generates the RPM `.spec` file for Fedora, RHEL, openSUSE, and Fedora COPR.
 */
export function rpmSpecFile(
  opts: { version?: string; repo?: string } = {},
): string {
  const version = opts.version ?? VERSION;
  const repo = opts.repo ?? DEFAULT_REPO;
  return `%global debug_package %{nil}
%global __strip /bin/true

Name:           codecaine-file-manager
Version:        ${version}
Release:        1%{?dist}
Summary:        Dual-pane file manager, code editor, and database studios for developers
License:        MIT
URL:            https://github.com/${repo}
ExclusiveArch:  x86_64 aarch64
Requires:       gtk4
Requires:       webkitgtk6.0
BuildRequires:  unzip

%ifarch x86_64
Source0:        https://github.com/${repo}/releases/download/v%{version}/Codecaine-File-Manager-v%{version}-linux-x64.zip
%endif
%ifarch aarch64
Source0:        https://github.com/${repo}/releases/download/v%{version}/Codecaine-File-Manager-v%{version}-linux-arm64.zip
%endif

%description
Codecaine File Manager is a fast, private desktop file manager for developers
featuring dual panes, a built-in code editor, database studios (SQLite, MySQL,
PostgreSQL, Redis), a Process & Task Manager, a System Information dashboard,
an encrypted password vault, a live web server, a multi-connection download
manager, and 1-click local Ollama AI integration.

%prep
%setup -q -c -T
unzip -q %{SOURCE0}

%install
%ifarch x86_64
cd Codecaine-File-Manager-v%{version}-linux-x64
%else
cd Codecaine-File-Manager-v%{version}-linux-arm64
%endif

install -d %{buildroot}/opt/codecaine-file-manager %{buildroot}%{_bindir}
cp -r codecaine-file-manager app lib resources install-ollama.sh troubleshoot.sh LICENSE README.txt VERSION %{buildroot}/opt/codecaine-file-manager/
chmod 0755 %{buildroot}/opt/codecaine-file-manager/codecaine-file-manager
ln -sf /opt/codecaine-file-manager/codecaine-file-manager %{buildroot}%{_bindir}/codecaine-file-manager

install -Dm644 ${APPSTREAM_ID}.desktop %{buildroot}%{_datadir}/applications/${APPSTREAM_ID}.desktop
install -Dm644 ${APPSTREAM_ID}.metainfo.xml %{buildroot}%{_datadir}/metainfo/${APPSTREAM_ID}.metainfo.xml
install -Dm644 codecaine-file-manager.png %{buildroot}%{_datadir}/icons/hicolor/512x512/apps/${APPSTREAM_ID}.png
install -Dm644 codecaine-file-manager.png %{buildroot}%{_datadir}/pixmaps/codecaine-file-manager.png

%files
/opt/codecaine-file-manager
%{_bindir}/codecaine-file-manager
%{_datadir}/applications/${APPSTREAM_ID}.desktop
%{_datadir}/metainfo/${APPSTREAM_ID}.metainfo.xml
%{_datadir}/icons/hicolor/512x512/apps/${APPSTREAM_ID}.png
%{_datadir}/pixmaps/codecaine-file-manager.png
`;
}

/**
 * Generates `AppRun` and `build-appimage.sh` for building single-file `.AppImage` bundles.
 */
export function appImageRunScript(): string {
  return `#!/bin/sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd -P)"
exec "$HERE/usr/lib/codecaine-file-manager/codecaine-file-manager" "$@"
`;
}

export function appImageBuildScript(version = VERSION): string {
  return `#!/bin/sh
# Converts an extracted Codecaine-File-Manager-v${version}-linux-<arch> folder into an AppDir and .AppImage
set -e
SRC_DIR="\${1:-.}"
ARCH="\${2:-x86_64}"
APPDIR="Codecaine_File_Manager.AppDir"

rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/lib/codecaine-file-manager" "$APPDIR/usr/bin" "$APPDIR/usr/share/applications" "$APPDIR/usr/share/metainfo" "$APPDIR/usr/share/icons/hicolor/512x512/apps"

cp -r "$SRC_DIR/codecaine-file-manager" "$SRC_DIR/app" "$SRC_DIR/lib" "$SRC_DIR/resources" "$SRC_DIR/install-ollama.sh" "$SRC_DIR/LICENSE" "$SRC_DIR/README.txt" "$SRC_DIR/VERSION" "$APPDIR/usr/lib/codecaine-file-manager/"
chmod 0755 "$APPDIR/usr/lib/codecaine-file-manager/codecaine-file-manager"
ln -sf ../lib/codecaine-file-manager/codecaine-file-manager "$APPDIR/usr/bin/codecaine-file-manager"

cp "$(dirname "$0")/AppRun" "$APPDIR/AppRun"
chmod 0755 "$APPDIR/AppRun"

cp "$SRC_DIR/${APPSTREAM_ID}.desktop" "$APPDIR/${APPSTREAM_ID}.desktop"
cp "$SRC_DIR/${APPSTREAM_ID}.desktop" "$APPDIR/usr/share/applications/${APPSTREAM_ID}.desktop"
cp "$SRC_DIR/${APPSTREAM_ID}.metainfo.xml" "$APPDIR/usr/share/metainfo/${APPSTREAM_ID}.metainfo.xml"
cp "$SRC_DIR/codecaine-file-manager.png" "$APPDIR/${APPSTREAM_ID}.png"
cp "$SRC_DIR/codecaine-file-manager.png" "$APPDIR/.DirIcon"
cp "$SRC_DIR/codecaine-file-manager.png" "$APPDIR/usr/share/icons/hicolor/512x512/apps/${APPSTREAM_ID}.png"

if command -v appimagetool >/dev/null 2>&1; then
  ARCH="$ARCH" appimagetool "$APPDIR" "Codecaine-File-Manager-v${version}-\${ARCH}.AppImage"
else
  echo "AppDir prepared at $APPDIR. Install appimagetool to pack Codecaine-File-Manager-v${version}-\${ARCH}.AppImage"
fi
`;
}

export function linuxStoresReadme(
  opts: { version?: string; repo?: string } = {},
): string {
  const version = opts.version ?? VERSION;
  const repo = opts.repo ?? DEFAULT_REPO;
  return `# Linux GUI Package Managers & App Stores — Codecaine File Manager v${version}

This directory contains ready-to-publish manifests and metadata for listing **Codecaine File Manager** across all major Linux GUI Software Centers:

1. **Native Debian / Ubuntu / Linux Mint / Pop!_OS GUI Installer (\`.deb\`)**
   - Built automatically in \`release/file-manager/\`:
     - \`codecaine-file-manager_${version}_amd64.deb\`
     - \`codecaine-file-manager_${version}_arm64.deb\`
   - Users can double-click the \`.deb\` in **GNOME Software**, **Ubuntu App Center**, **KDE Discover**, or **GDebi** to install with one click.
   - Automatically installs \`libgtk-4-1\` and \`libwebkitgtk-6.0-4\`, registers the AppStream metadata and \`inode/directory\` handler, and configures the Ubuntu 24.04+ AppArmor userns profile in \`postinst\`.

2. **Flathub / Flatpak (\`flathub/\`)** — *Populates GNOME Software, KDE Discover, Mint Software Manager, Pop!_OS Cosmic Store, elementary AppCenter, SteamOS, Fedora, Zorin*
   - Files:
     - \`flathub/${APPSTREAM_ID}.yml\`
     - \`flathub/${APPSTREAM_ID}.metainfo.xml\`
     - \`flathub/${APPSTREAM_ID}.desktop\`
     - \`flathub/flathub.json\`
   - Test locally on Linux:
     \`\`\`sh
     flatpak-builder --user --install --force-clean build-dir flathub/${APPSTREAM_ID}.yml
     \`\`\`
   - Submit to Flathub: fork \`https://github.com/flathub/flathub\` (\`new-pr\` branch) and copy the files in \`flathub/\` into a branch named \`${APPSTREAM_ID}\`.

3. **Ubuntu Snap Store (\`snap/snapcraft.yaml\`)** — *Populates Ubuntu App Center, KDE Discover, Pamac*
   - Build and publish:
     \`\`\`sh
     snapcraft pack
     snapcraft login
     snapcraft upload --release=stable codecaine-file-manager_${version}_*.snap
     \`\`\`

4. **Arch User Repository — AUR (\`aur/\`)** — *Populates Manjaro/Arch Pamac, Octopi, Bauh, yay, paru*
   - Files: \`aur/PKGBUILD\` and \`aur/.SRCINFO\` (with precomputed SHA-256 hashes for \`x86_64\` and \`aarch64\`).
   - Publish:
     \`\`\`sh
     git clone ssh://aur@aur.archlinux.org/codecaine-file-manager-bin.git
     cp aur/PKGBUILD aur/.SRCINFO codecaine-file-manager-bin/
     cd codecaine-file-manager-bin && git add PKGBUILD .SRCINFO && git commit -m "Update to v${version}" && git push
     \`\`\`

5. **Native Fedora / RHEL / openSUSE / Rocky / AlmaLinux GUI Installer (\`.rpm\`) & COPR (\`rpm/codecaine-file-manager.spec\`)** — *Populates GNOME Software & KDE Discover on Fedora/RHEL/openSUSE*
   - Built automatically in \`release/file-manager/\`:
     - \`codecaine-file-manager-${version}-1.x86_64.rpm\`
     - \`codecaine-file-manager-${version}-1.aarch64.rpm\`
   - Users can double-click the \`.rpm\` in **GNOME Software** or **KDE Discover**, or run \`sudo dnf install ./codecaine-file-manager-${version}-1.x86_64.rpm\`.
   - Or build from source / upload \`rpm/codecaine-file-manager.spec\` to [Fedora COPR](https://copr.fedorainfracloud.org/):
     \`\`\`sh
     rpmbuild -bb rpm/codecaine-file-manager.spec
     \`\`\`

6. **AppImage (\`appimage/\`)** — *Works with Gear Lever & AppImageLauncher*
   - Run \`sh appimage/build-appimage.sh <extracted-linux-folder> x86_64\` with \`appimagetool\` installed.

Source repository: https://github.com/${repo}
`;
}

/**
 * Writes all Linux GUI store manifests (Flathub, Snap, AUR, RPM, AppImage) with exact SHA-256 checksums.
 */
export function writeLinuxStoreManifests(
  outDir: string,
  opts: {
    version?: string;
    repo?: string;
    sha256X64?: string;
    sha256Arm64?: string;
    releaseDate?: string;
    iconPngPath?: string | null;
  } = {},
): void {
  const version = opts.version ?? VERSION;
  const repo = opts.repo ?? DEFAULT_REPO;
  const sha256X64 = opts.sha256X64 || "0".repeat(64);
  const sha256Arm64 = opts.sha256Arm64 || "0".repeat(64);
  const releaseDate = opts.releaseDate ?? new Date().toISOString().slice(0, 10);

  const flathubDir = join(outDir, "flathub");
  const snapDir = join(outDir, "snap");
  const aurDir = join(outDir, "aur");
  const rpmDir = join(outDir, "rpm");
  const appimageDir = join(outDir, "appimage");
  for (const d of [flathubDir, snapDir, aurDir, rpmDir, appimageDir]) {
    mkdirSync(d, { recursive: true });
  }

  const metainfo = appStreamMetaInfoXml(version, releaseDate, repo);
  const desktopFlatpak = systemDesktopEntry(
    "codecaine-file-manager %U",
    APPSTREAM_ID,
  );

  writeFileSync(
    join(flathubDir, `${APPSTREAM_ID}.yml`),
    flathubManifestYaml({ version, repo, sha256X64, sha256Arm64 }),
  );
  writeFileSync(join(flathubDir, `${APPSTREAM_ID}.metainfo.xml`), metainfo);
  writeFileSync(join(flathubDir, `${APPSTREAM_ID}.desktop`), desktopFlatpak);
  writeFileSync(
    join(flathubDir, "flathub.json"),
    JSON.stringify({ "only-arches": ["x86_64", "aarch64"] }, null, 2) + "\n",
  );
  if (opts.iconPngPath && existsSync(opts.iconPngPath)) {
    cpSync(opts.iconPngPath, join(flathubDir, "codecaine-file-manager.png"));
  }

  writeFileSync(
    join(snapDir, "snapcraft.yaml"),
    snapcraftYaml({ version, repo }),
  );
  writeFileSync(
    join(aurDir, "PKGBUILD"),
    aurPkgbuild({ version, repo, sha256X64, sha256Arm64 }),
  );
  writeFileSync(
    join(aurDir, ".SRCINFO"),
    aurSrcinfo({ version, repo, sha256X64, sha256Arm64 }),
  );
  writeFileSync(
    join(rpmDir, "codecaine-file-manager.spec"),
    rpmSpecFile({ version, repo }),
  );
  writeFileSync(join(appimageDir, "AppRun"), appImageRunScript());
  chmodSync(join(appimageDir, "AppRun"), 0o755);
  writeFileSync(
    join(appimageDir, "build-appimage.sh"),
    appImageBuildScript(version),
  );
  chmodSync(join(appimageDir, "build-appimage.sh"), 0o755);
  writeFileSync(
    join(outDir, "README.md"),
    linuxStoresReadme({ version, repo }),
  );
}
