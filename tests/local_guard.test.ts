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
});
