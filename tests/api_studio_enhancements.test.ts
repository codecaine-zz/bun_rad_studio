import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  methodHasBody, isUnsafeMethod, formatBytes, clampInt, normalizeUrl, buildUrl, parseVariables, applyVariables,
  parseHeaderLines, applyAuth, hasHeader, withDefaultContentType, buildCurlCommand, tokenizeShell, parseCurlCommand,
  serializeRequest, parseRequestFile, runPool, summarizeBench, pushHistory,
} from "../src/api_tools";
import { createApiStudio, executeCurlRequest } from "../applications/api_studio";
import type { SimpleWindow } from "../src/simplegui";

async function trigger(win: SimpleWindow, id: string, event = "click", val?: any) {
  const h = win.eventHandlersMap.get(`${id}:on${event}`) || win.eventHandlersMap.get(`${id}:${event}`) || win.eventHandlersMap.get(id);
  if (!h) throw new Error(`no handler for ${id}`);
  return await h(win, val);
}

describe("api_tools helpers", () => {
  test("methods, sizes, clamp", () => {
    expect(methodHasBody("POST")).toBe(true);
    expect(methodHasBody("GET")).toBe(false);
    expect(isUnsafeMethod("DELETE")).toBe(true);
    expect(isUnsafeMethod("GET")).toBe(false);
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toContain("KB");
    expect(clampInt("abc", 1, 10, 5)).toBe(5);
    expect(clampInt("500", 1, 200, 10)).toBe(200);
    expect(clampInt("0", 1, 200, 10)).toBe(1);
  });

  test("normalizeUrl rejects non-http schemes and fills in a scheme", () => {
    expect(normalizeUrl("file:///etc/passwd").error).toBeTruthy();
    expect(normalizeUrl("ftp://x.com").error).toBeTruthy();
    expect(normalizeUrl("example.com").url).toBe("https://example.com");
    expect(normalizeUrl("localhost:3000/x").url).toBe("http://localhost:3000/x");
    expect(normalizeUrl("").error).toBeTruthy();
  });

  test("buildUrl appends and encodes query params", () => {
    expect(buildUrl("https://a.io/p?x=1", "a=b c\n&d=e%20f")).toBe("https://a.io/p?x=1&a=b%20c&d=e%20f");
    expect(buildUrl("https://a.io/p", "")).toBe("https://a.io/p");
  });

  test("variables and dynamic values", () => {
    expect(parseVariables("# c\na=1\n b = two \nbad")).toEqual({ a: "1", b: "two" });
    const r = applyVariables("{{a}}-{{b}}-{{$uuid}}-{{$randomInt}}-{{$timestamp}}", { a: "1" });
    expect(r.missing).toEqual(["b"]);
    expect(r.text).toMatch(/^1-\{\{b\}\}-[0-9a-f-]{36}-\d+-\d+$/);
  });

  test("headers, auth and content type", () => {
    const h = parseHeaderLines("Accept: a/b\nX-Y:  z:w\njunk");
    expect(h).toEqual({ Accept: "a/b", "X-Y": "z:w" });
    expect(applyAuth({}, "Bearer Token", "tok")["Authorization"]).toBe("Bearer tok");
    expect(applyAuth({}, "Basic Auth", "u:p")["Authorization"]).toBe("Basic " + Buffer.from("u:p").toString("base64"));
    expect(applyAuth({}, "API Key Header", "k")["X-API-Key"]).toBe("k");
    expect(applyAuth({}, "Bearer Token", "")).toEqual({});
    expect(hasHeader({ "content-type": "x" }, "Content-Type")).toBe(true);
    expect(withDefaultContentType({}, "POST", '{"a":1}')["Content-Type"]).toBe("application/json");
    expect(withDefaultContentType({}, "POST", "hello")["Content-Type"]).toBe("text/plain");
    expect(withDefaultContentType({}, "GET", '{"a":1}')).toEqual({});
  });
});

describe("cURL export/import", () => {
  test("buildCurlCommand keeps format and adds options", () => {
    const c = buildCurlCommand({ method: "POST", url: "https://x.io", headers: { A: "b" }, body: "it's", follow: true, insecure: true, timeoutSec: 5 });
    expect(c).toContain("curl -X POST 'https://x.io'");
    expect(c).toContain("-H 'A: b'");
    expect(c).toContain("--data-raw 'it'\\''s'");
    expect(c).toContain("-L");
    expect(c).toContain("-k");
    expect(c).toContain("-m 5");
    expect(buildCurlCommand({ method: "HEAD", url: "https://x.io", headers: {} })).toBe("curl -I 'https://x.io'");
  });

  test("tokenizer handles quotes and continuations", () => {
    expect(tokenizeShell("curl 'a b' \"c d\" e\\ f \\\n g")).toEqual(["curl", "a b", "c d", "e f", "g"]);
    expect(() => tokenizeShell("curl 'oops")).toThrow();
  });

  test("parses Chrome-style copy-as-cURL", () => {
    const p = parseCurlCommand(`curl 'https://x.io/a?b=1' \\
  -H 'accept: */*' \\
  -H 'content-type: application/json' \\
  --data-raw $'{"a":"it\\'s"}' \\
  --compressed -sSL -k -m 7`);
    expect(p.method).toBe("POST");
    expect(p.url).toBe("https://x.io/a?b=1");
    expect(p.headers).toEqual([["accept", "*/*"], ["content-type", "application/json"]]);
    expect(p.body).toBe('{"a":"it\'s"}');
    expect(p.follow).toBe(true);
    expect(p.insecure).toBe(true);
    expect(p.timeoutSec).toBe(7);
  });

  test("method flags, basic auth, head and errors", () => {
    expect(parseCurlCommand("curl -XPUT https://x.io -d a=1").method).toBe("PUT");
    const u = parseCurlCommand("curl -u me:pw https://x.io");
    expect(u.authMode).toBe("Basic Auth");
    expect(u.authCred).toBe("me:pw");
    expect(parseCurlCommand("curl -I https://x.io").method).toBe("HEAD");
    expect(parseCurlCommand("curl --json '{\"a\":1}' https://x.io").headers.some(([k]) => k === "Content-Type")).toBe(true);
    expect(() => parseCurlCommand("wget https://x.io")).toThrow();
    expect(() => parseCurlCommand("curl -H 'a: b'")).toThrow();
  });

  test("round trip", () => {
    const c = buildCurlCommand({ method: "PATCH", url: "https://x.io/q", headers: { "X-A": "1" }, body: '{"z":1}' });
    const p = parseCurlCommand(c);
    expect(p.method).toBe("PATCH");
    expect(p.url).toBe("https://x.io/q");
    expect(p.body).toBe('{"z":1}');
  });
});

describe("request files, bench, history", () => {
  test("request file round trip excludes credentials and rejects junk", () => {
    const s = serializeRequest({ method: "POST", url: "u", headers: "h", body: "b", query: "q", vars: "v", authMode: "Bearer Token" });
    expect(s).not.toContain("cred");
    const r = parseRequestFile(s);
    expect(r.method).toBe("POST");
    expect(r.authMode).toBe("Bearer Token");
    expect(() => parseRequestFile("{}")).toThrow();
    expect(() => parseRequestFile("nope")).toThrow();
    expect(parseRequestFile(JSON.stringify({ format: "bun-rad-api-request", method: "zzz", authMode: "x" })).method).toBe("GET");
  });

  test("runPool honours concurrency and order", async () => {
    let active = 0, peak = 0;
    const out = await runPool(10, 3, async (i) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return i * 2;
    });
    expect(out).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  test("summarizeBench and history cap", () => {
    expect(summarizeBench([], 10)).toBeNull();
    const s = summarizeBench([10, 20, 30, 40], 100)!;
    expect(s.min).toBe(10);
    expect(s.max).toBe(40);
    expect(s.avg).toBe(25);
    expect(s.rps).toBe(40);
    let h: any[] = [];
    for (let i = 0; i < 40; i++) h = pushHistory(h, { id: i, method: "GET", url: "", status: 200, ms: "1", time: "", headers: "", body: "" });
    expect(h.length).toBe(30);
    expect(h[0].id).toBe(39);
  });
});

// ---------------------------------------------------------------------------
// Local server: real curl subprocess against an in-process Bun.serve
// ---------------------------------------------------------------------------
let server: ReturnType<typeof Bun.serve>;
let base = "";
let hits = { post: 0 };

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/redir") return new Response(null, { status: 302, headers: { Location: "/echo?from=redir" } });
      if (u.pathname === "/redir-file") return new Response(null, { status: 302, headers: { Location: "file:///etc/hosts" } });
      if (u.pathname === "/slow") return new Promise((r) => setTimeout(() => r(new Response("late")), 3000));
      if (req.method === "POST") hits.post++;
      return req.text().then((body) =>
        Response.json({ method: req.method, path: u.pathname, query: u.search, headers: Object.fromEntries(req.headers), body, items: [{ id: 1, name: "a" }, { id: 2, name: "b" }] }, { headers: { "X-Test": "yes" } })
      );
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.stop(true));

describe("executeCurlRequest against a local server", () => {
  test("GET returns status, headers and body", async () => {
    const r = await executeCurlRequest("GET", `${base}/echo`, { "X-Foo": "bar" });
    expect(r.status).toBe(200);
    expect(r.headers.some(([k, v]) => k.toLowerCase() === "x-test" && v === "yes")).toBe(true);
    expect(JSON.parse(r.body).headers["x-foo"]).toBe("bar");
  });

  test("POST sends the body", async () => {
    const r = await executeCurlRequest("POST", `${base}/echo`, { "Content-Type": "application/json" }, '{"k":1}');
    expect(JSON.parse(r.body).body).toBe('{"k":1}');
  });

  test("follow vs no-follow redirects", async () => {
    const followed = await executeCurlRequest("GET", `${base}/redir`, {});
    expect(followed.status).toBe(200);
    const raw = await executeCurlRequest("GET", `${base}/redir`, {}, undefined, { follow: false });
    expect(raw.status).toBe(302);
    expect(raw.headers.some(([k]) => k.toLowerCase() === "location")).toBe(true);
  });

  test("file:// is refused, directly and via redirect", async () => {
    const direct = await executeCurlRequest("GET", "file:///etc/hosts", {});
    expect(direct.status).toBe(0);
    expect(direct.body).not.toContain("localhost");
    const viaRedirect = await executeCurlRequest("GET", `${base}/redir-file`, {});
    expect(viaRedirect.body).not.toContain("localhost");
  });

  test("timeout option is enforced", async () => {
    const r = await executeCurlRequest("GET", `${base}/slow`, {}, undefined, { timeoutSec: 1 });
    expect(r.status).toBe(0);
    expect(r.ok).toBe(false);
  });
});

describe("API Studio GUI", () => {
  const make = () => createApiStudio({ fullscreen: false });
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "api-studio-"));

  test("renders new controls", () => {
    const html = make().generateHtml();
    for (const id of ["txt_vars", "txt_query", "chk_follow", "chk_insecure", "txt_timeout", "chk_pretty", "txt_bench_n", "txt_bench_c", "txt_curl_import", "btn_import_curl", "btn_save_req_file", "btn_load_req_file", "btn_format_body", "btn_copy_resp", "txt_filter", "btn_apply_filter", "tbl_resp_headers", "tbl_history", "btn_clear_history"]) {
      expect(html).toContain(id);
    }
  });

  test("send with variables and query params, fills headers table and history", async () => {
    const win = make();
    win.setValue("txt_vars", `host=${base}\nname=Ann`);
    win.setValue("txt_url", "{{host}}/echo");
    win.setValue("txt_query", "q={{name}}\nn=2");
    win.setValue("dd_method", "GET");
    await trigger(win, "btn_send");
    const body = JSON.parse(String(win.getValue("txt_resp_body")));
    expect(body.query).toBe("?q=Ann&n=2");
    expect(String(win.getValue("lbl_status"))).toContain("200");
    const hdrs = win.getValue("tbl_resp_headers") as string[][];
    expect(hdrs.some((r) => r[0].toLowerCase() === "x-test" && r[1] === "yes")).toBe(true);
    const hist = win.getValue("tbl_history") as string[][];
    expect(hist.length).toBe(1);
    expect(hist[0]![2]).toBe("{{host}}/echo");
  });

  test("undefined variable blocks the request", async () => {
    const win = make();
    win.setValue("txt_url", `${base}/{{nope}}`);
    await trigger(win, "btn_send");
    expect(String(win.getValue("api_console"))).not.toContain("[HTTP Dispatch]");
  });

  test("file:// URL is rejected before dispatch", async () => {
    const win = make();
    win.setValue("txt_url", "file:///etc/hosts");
    await trigger(win, "btn_send");
    expect(String(win.getValue("api_console"))).not.toContain("[HTTP Dispatch]");
  });

  test("auth modes apply and body gets a content type", async () => {
    const win = make();
    win.setValue("txt_url", `${base}/echo`);
    win.setValue("dd_method", "POST");
    win.setValue("txt_headers", "Accept: */*");
    win.setValue("txt_req_body", '{"a":1}');
    win.setValue("dd_auth", "Bearer Token");
    win.setValue("txt_auth", "sekret");
    await trigger(win, "btn_send");
    const echoed = JSON.parse(String(win.getValue("txt_resp_body")));
    expect(echoed.headers.authorization).toBe("Bearer sekret");
    expect(echoed.headers["content-type"]).toBe("application/json");
  });

  test("cURL import populates the form and export honours options", async () => {
    const win = make();
    win.setValue("txt_curl_import", `curl -X PUT '${base}/echo' -H 'X-A: 1' -d '{"z":1}' -u me:pw -k`);
    await trigger(win, "btn_import_curl");
    expect(win.getValue("dd_method")).toBe("PUT");
    expect(String(win.getValue("txt_url"))).toBe(`${base}/echo`);
    expect(String(win.getValue("txt_headers"))).toContain("X-A: 1");
    expect(win.getValue("txt_req_body")).toBe('{"z":1}');
    expect(win.getValue("dd_auth")).toBe("Basic Auth");
    expect(win.getBool("chk_insecure")).toBe(true);
    await trigger(win, "btn_copy_curl");
    expect(String(win.getValue("api_console"))).toContain("curl -X PUT");
    expect(String(win.getValue("api_console"))).toContain("-k");

    win.setValue("txt_curl_import", "not curl");
    await trigger(win, "btn_import_curl");
    expect(String(win.getValue("api_console"))).toContain("[Import Error]");
  });

  test("history row click restores a request", async () => {
    const win = make();
    win.setValue("txt_url", `${base}/echo`);
    win.setValue("txt_headers", "X-Keep: 1");
    await trigger(win, "btn_send");
    win.setValue("txt_url", "https://other.invalid");
    win.setValue("txt_headers", "");
    await trigger(win, "tbl_history", "click", "#1");
    expect(win.getValue("txt_url")).toBe(`${base}/echo`);
    expect(String(win.getValue("txt_headers"))).toContain("X-Keep");
    await trigger(win, "btn_clear_history");
    expect((win.getValue("tbl_history") as string[][]).length).toBe(0);
  });

  test("request file save/load via stubbed dialogs omits credentials", async () => {
    const dir = tmp();
    const file = path.join(dir, "r.apireq.json");
    const win = make();
    (win as any).saveFile = (_o: any, cb: any) => cb(file);
    (win as any).openFile = (_o: any, cb: any) => cb(file);
    win.setValue("txt_url", "https://x.io/p");
    win.setValue("dd_method", "DELETE");
    win.setValue("txt_vars", "a=1");
    win.setValue("dd_auth", "Bearer Token");
    win.setValue("txt_auth", "TOPSECRET");
    await trigger(win, "btn_save_req_file");
    expect(fs.readFileSync(file, "utf8")).not.toContain("TOPSECRET");

    const win2 = make();
    (win2 as any).openFile = (_o: any, cb: any) => cb(file);
    await trigger(win2, "btn_load_req_file");
    expect(win2.getValue("txt_url")).toBe("https://x.io/p");
    expect(win2.getValue("dd_method")).toBe("DELETE");
    expect(win2.getValue("txt_vars")).toBe("a=1");

    fs.writeFileSync(file, "garbage");
    await trigger(win2, "btn_load_req_file");
    expect(String(win2.getValue("api_console"))).toContain("[Open Error]");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("response filter, copy, export and format body", async () => {
    const dir = tmp();
    const file = path.join(dir, "out.json");
    const win = make();
    (win as any).saveFile = (_o: any, cb: any) => cb(file);
    let copied = "";
    (win as any).copyToClipboard = (t: string) => { copied = t; };
    win.setValue("txt_url", `${base}/echo`);
    await trigger(win, "btn_send");

    win.setValue("txt_filter", ".items[0].name");
    await trigger(win, "btn_apply_filter");
    expect(String(win.getValue("txt_resp_body"))).toContain("a");
    expect(String(win.getValue("txt_resp_body")).length).toBeLessThan(20);
    win.setValue("txt_filter", "");
    await trigger(win, "btn_apply_filter");
    expect(String(win.getValue("txt_resp_body"))).toContain("items");

    await trigger(win, "btn_copy_resp");
    expect(JSON.parse(copied).path).toBe("/echo");
    await trigger(win, "btn_export_resp");
    expect(JSON.parse(fs.readFileSync(file, "utf8")).path).toBe("/echo");

    win.setValue("txt_req_body", '{"a":1,"b":[1,2]}');
    await trigger(win, "btn_format_body");
    expect(String(win.getValue("txt_req_body"))).toContain("\n");
    win.setValue("txt_req_body", "{bad");
    await trigger(win, "btn_format_body");
    expect(win.getValue("txt_req_body")).toBe("{bad");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("benchmark honours N and concurrency, and confirms unsafe methods", async () => {
    const win = make();
    win.setValue("txt_url", `${base}/echo`);
    win.setValue("txt_bench_n", "6");
    win.setValue("txt_bench_c", "2");
    await trigger(win, "btn_bench");
    expect(String(win.getValue("api_console"))).toContain("[Benchmark Completed] 6 requests completed");
    expect(String(win.getValue("api_console"))).toContain("req/s");

    const win2 = make();
    win2.setValue("txt_url", `${base}/echo`);
    win2.setValue("dd_method", "POST");
    win2.setValue("txt_bench_n", "3");
    (win2 as any).confirm = async () => false;
    const before = hits.post;
    await trigger(win2, "btn_bench");
    expect(hits.post).toBe(before);
    expect(String(win2.getValue("api_console"))).toContain("Cancelled");
    (win2 as any).confirm = async () => true;
    await trigger(win2, "btn_bench");
    expect(hits.post).toBe(before + 3);
  });
});
