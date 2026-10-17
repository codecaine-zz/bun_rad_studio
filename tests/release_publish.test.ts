import { describe, expect, test } from "bun:test";
import { VERSION } from "../scripts/release/common";
import { notes } from "../scripts/release_publish";

describe("release notes", () => {
  test("lists optional CC BY music packs separately from the MIT application suite", () => {
    const body = notes([
      { name: `bun-rad-studio-v${VERSION}-free-music-source.zip`, bytes: 100_000 },
      { name: `bun-rad-studio-v${VERSION}-free-music-mp3-1of2.zip`, bytes: 200_000 },
      { name: `bun-rad-studio-v${VERSION}-free-music-songs-mp3.zip`, bytes: 300_000 },
    ], "codecaine-zz/bun_rad_studio");

    expect(body).toContain("## 🎵 Free music — CC BY 4.0");
    expect(body).toContain(`https://github.com/codecaine-zz/bun_rad_studio/releases/download/v${VERSION}/bun-rad-studio-v${VERSION}-free-music-source.zip`);
    expect(body).toContain("MP3 (128 kbps)");
    expect(body).toContain("Individual chapter songs (MP3, 128 kbps)");
    expect(body).not.toContain(`| macos-arm64 | [bun-rad-studio-v${VERSION}-free-music-source.zip]`);
  });
});
