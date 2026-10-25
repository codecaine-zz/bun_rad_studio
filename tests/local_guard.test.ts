import { describe, it, expect } from "bun:test";
import { guardLocalRequest } from "../src/localGuard";

const req = (headers: Record<string, string>) => new Request("http://127.0.0.1:1234/api/x", { headers });

describe("guardLocalRequest", () => {
  it("allows non-browser clients and same-origin browser requests", () => {
    expect(guardLocalRequest(req({ host: "127.0.0.1:1234" }))).toBeNull();
    expect(guardLocalRequest(req({ host: "localhost:1234", origin: "http://localhost:1234" }))).toBeNull();
  });

  it("blocks cross-site origins", () => {
    const res = guardLocalRequest(req({ host: "127.0.0.1:1234", origin: "https://evil.example" }));
    expect(res?.status).toBe(403);
  });

  it("blocks DNS-rebinding hosts", () => {
    const res = guardLocalRequest(req({ host: "evil.example:1234" }));
    expect(res?.status).toBe(403);
  });

  it("allows Sec-Fetch-Site: cross-site on embedded /app/ routes and static page GETs (127.0.0.1 <-> localhost iframe), while blocking cross-site /api/ and POST requests", () => {
    const embedReq = new Request("http://localhost:1234/app/tetris/index.html", {
      method: "GET",
      headers: { host: "localhost:1234", "sec-fetch-site": "cross-site", "sec-fetch-dest": "iframe", "sec-fetch-mode": "navigate" },
    });
    expect(guardLocalRequest(embedReq)).toBeNull();

    const pageGetReq = new Request("http://127.0.0.1:1234/", {
      method: "GET",
      headers: { host: "127.0.0.1:1234", "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" },
    });
    expect(guardLocalRequest(pageGetReq)).toBeNull();

    const apiGetReq = new Request("http://127.0.0.1:1234/api/raw?path=/etc/passwd", {
      method: "GET",
      headers: { host: "127.0.0.1:1234", "sec-fetch-site": "cross-site" },
    });
    expect(guardLocalRequest(apiGetReq)?.status).toBe(403);

    const apiPostReq = new Request("http://127.0.0.1:1234/api/places", {
      method: "POST",
      headers: { host: "127.0.0.1:1234", "sec-fetch-site": "cross-site" },
    });
    expect(guardLocalRequest(apiPostReq)?.status).toBe(403);
  });
});
