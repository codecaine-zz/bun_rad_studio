import { describe, expect, test } from "bun:test";
import * as hub from "../src/index.ts";
import * as simplecli from "../src/simplecli/index.ts";
import * as simplegui from "../src/simplegui.ts";

describe("src/index.ts (unified export hub), D-027", () => {
  test("names defined by several libraries are defined, and refer to the documented one", () => {
    expect(hub.LRUCache).toBe(simplecli.LRUCache);
    expect(hub.Logger).toBe(simplecli.Logger);
    expect(hub.LogLevel).toBe(simplecli.LogLevel);
    expect(hub.TreeNode).toBe(simplecli.TreeNode);
    expect(hub.writeFileAtomic).toBe(simplegui.writeFileAtomic);
  });

  test("the other libraries' versions stay reachable through their namespaces", () => {
    expect(typeof hub.logutils.Logger).toBe("function");
    expect(hub.logutils.Logger).not.toBe(hub.Logger);
    expect(typeof hub.cacheutils.LRUCache).toBe("function");
    expect(hub.cacheutils.LRUCache).not.toBe(hub.LRUCache);
    expect(typeof hub.fileutils.writeFileAtomic).toBe("function");
    expect(hub.fileutils.writeFileAtomic).not.toBe(hub.writeFileAtomic);
  });

  test("the hub still exposes the main entry points", () => {
    for (const name of ["SimpleCLI", "SimpleWindow", "rad"]) expect((hub as Record<string, unknown>)[name]).toBeDefined();
  });
});
