import { describe, expect, it } from "bun:test";
import { MASK, auditEnv, diffEnv, formatDiff, isSecretKey, makeExample, maskEnv, parseEnv, unmaskEnv } from "../src/shared/env_vault";
import { createEnvStudio } from "../applications/env_studio";

describe("parseEnv", () => {
  it("reads quotes, export, inline comments and Windows line endings", () => {
    const p = parseEnv('export A=1\r\nB="two words" # note\r\nC=\'x\'\r\nD=plain # tail\r\n# comment\r\n\r\n');
    expect(p.vars.map((v) => [v.key, v.value])).toEqual([["A", "1"], ["B", "two words"], ["C", "x"], ["D", "plain"]]);
    expect(p.syntaxErrors).toEqual([]);
  });
  it("reports lines without = , bad names, unclosed quotes and duplicates", () => {
    const p = parseEnv('NOEQUALS\n1BAD=x\nOK="open\nA=1\nA=2');
    expect(p.syntaxErrors.length).toBe(3);
    expect(p.syntaxErrors[0]).toContain("Line 1");
    expect(p.duplicates).toEqual(["A"]);
  });
  it("keeps = signs inside values", () => {
    expect(parseEnv("URL=http://x/?a=1&b=2").vars[0]!.value).toBe("http://x/?a=1&b=2");
  });
});

describe("secrets", () => {
  it("matches whole words, so PASSPORT_COUNTRY is not a secret but PASSPORT_SECRET is", () => {
    expect(isSecretKey("API_KEY")).toBe(true);
    expect(isSecretKey("PASSPORT_SECRET")).toBe(true);
    expect(isSecretKey("DB_PASSWORD")).toBe(true);
    expect(isSecretKey("MONKEY_NAME")).toBe(false);
    expect(isSecretKey("PORT")).toBe(false);
  });
  it("masks and unmasks, keeping what the user edited", () => {
    const raw = 'PORT=3000\nAPI_KEY="abc"\nexport DB_PASSWORD=pw\nJWT_SECRET=s';
    const masked = maskEnv(raw);
    expect(masked).not.toContain("abc");
    expect(masked).toContain(`export DB_PASSWORD="${MASK}"`);
    expect(unmaskEnv(masked, raw)).toBe(raw);
    const edited = masked.replace("PORT=3000", "PORT=4000").replace(`JWT_SECRET="${MASK}"`, 'JWT_SECRET="new"');
    expect(unmaskEnv(edited, raw)).toBe('PORT=4000\nAPI_KEY="abc"\nexport DB_PASSWORD=pw\nJWT_SECRET="new"');
  });
});

describe("makeExample", () => {
  it("blanks every secret, even when the name also contains PORT or HOST", () => {
    const { text, count, kept } = makeExample('PORT=3000\nPASSPORT_SECRET=topsecret\nDB_HOST_PASSWORD=pw\nREDIS_HOST="127.0.0.1"\nAPI_KEY=k\nURL_HOST=user:pw@host/x\nNODE_ENV=production');
    expect(text).toContain("# Generated .env.example Template");
    expect(text).toContain("PORT=3000");
    expect(text).toContain("REDIS_HOST=127.0.0.1");
    expect(text).toContain("NODE_ENV=production");
    expect(text).toContain('PASSPORT_SECRET=""');
    expect(text).toContain('DB_HOST_PASSWORD=""');
    expect(text).toContain('URL_HOST=""');
    for (const secret of ["topsecret", "pw", "user:pw"]) expect(text).not.toContain(secret);
    expect(count).toBe(7);
    expect(kept).toBe(3);
  });
  it("lists a repeated name once and drops comments, which may hold secrets", () => {
    const { text } = makeExample("# token is abc123\nA=1\nA=2\nB=3");
    expect(text).not.toContain("abc123");
    expect(text.match(/^A=/gm)?.length).toBe(1);
  });
});

describe("diff and audit", () => {
  it("lists missing, extra and empty names", () => {
    const d = diffEnv("A=1\nB=\nC=3", 'A=""\nB=""\nD=""');
    expect(d).toMatchObject({ missing: ["D"], extra: ["C"], empty: ["B"], activeCount: 3, templateCount: 3 });
    expect(formatDiff(d)).toContain("- D");
    expect(formatDiff(d)).toContain("+ C");
  });
  it("separates errors from notes", () => {
    const a = auditEnv('API_KEY=changeme\nlower=1\nEMPTY=\nSPACED=a b\nbroken');
    expect(a.errors.length).toBe(1);
    expect(a.warnings.join("\n")).toContain("placeholder");
    expect(a.warnings.join("\n")).toContain("not UPPER_CASE");
    expect(a.warnings.join("\n")).toContain("EMPTY is empty");
    expect(a.warnings.join("\n")).toContain("has spaces");
    expect(auditEnv('A="x y"\nB=1').warnings).toEqual([]);
  });
});

describe("the studio window", () => {
  it("has a way to copy, save and open the example and the settings", () => {
    const html = createEnvStudio({ fullscreen: false }).generateHtml();
    for (const id of ["btn_copy_example", "btn_save_example", "btn_open_template", "btn_open_env", "btn_copy_env", "btn_export_env", "btn_clear_env", "txt_env_report"]) expect(html).toContain(id);
  });
});
