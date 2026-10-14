import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DONATE_URL, qrText } from "../scripts/donate";

const root = join(import.meta.dir, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");

describe("donation links", () => {
  test("every place that mentions the link agrees", () => {
    expect(DONATE_URL).toBe("https://paypal.me/codecaine81");
    expect(read(".github/FUNDING.yml")).toContain(`custom: ["${DONATE_URL}"]`);
    expect(JSON.parse(read("package.json")).funding).toEqual({ type: "paypal", url: DONATE_URL });
    const readme = read("README.md");
    expect(readme).toContain(`](${DONATE_URL})`);
    expect(readme).toContain("Support & Donations");
    expect(readme).toContain("docs/images/donate-paypal-qr.png");
    expect(readme).toContain("bun run donate");
  });

  test("the QR pictures exist, and the PNG scans to the link (checked with macOS's own QR reader)", () => {
    const png = join(root, "docs", "images", "donate-paypal-qr.png");
    expect(existsSync(png)).toBe(true);
    expect(readFileSync(png).subarray(1, 4).toString()).toBe("PNG");
    expect(read("docs/images/donate-paypal-qr.svg")).toContain("<svg");
    if (process.platform !== "darwin") return;
    const file = join(tmpdir(), `qr-decode-${process.pid}.js`);
    writeFileSync(file, `ObjC.import("CoreImage"); function run(a){const i=$.CIImage.imageWithContentsOfURL($.NSURL.fileURLWithPath(a[0]));const d=$.CIDetector.detectorOfTypeContextOptions("CIDetectorTypeQRCode",$(),$());const f=d.featuresInImage(i);return f.count>0?ObjC.unwrap(f.objectAtIndex(0).messageString):"NONE"}`);
    try {
      const out = Bun.spawnSync(["osascript", "-l", "JavaScript", file, png]);
      expect(out.stdout.toString().trim()).toBe(DONATE_URL);
    } finally {
      rmSync(file, { force: true });
    }
  });

  test("the terminal QR is drawn when qrencode is there, and is simply skipped when it is not", async () => {
    const text = await qrText(DONATE_URL);
    if (Bun.which("qrencode")) expect(text).toContain("█");
    else expect(text).toBeNull();
  });
});
