/**
 * What the graveyard asks the computer that tests need to replace: whether two places are on the same disk (so a plain
 * rename works) and a step inside the copy loop (so a test can simulate a crash half way through a copy).
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";

export interface GraveyardHooks {
  /** True when `a` (an existing item) and the folder `b` are on the same disk. Saying false makes a move copy instead of rename. */
  sameDevice(a: string, b: string): Promise<boolean>;
  /** Runs after each file, link or folder is copied. Throwing here stops the copy, as a crash or a full disk would. */
  afterCopy(destination: string, copied: number): void | Promise<void>;
}

/** The closest folder that exists at or above `path`. */
async function existingAncestor(path: string): Promise<string> {
  let current = path;
  for (;;) {
    try {
      await fsp.lstat(current);
      return current;
    } catch {
      const parent = nodePath.dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

export const defaultGraveyardHooks: GraveyardHooks = {
  async sameDevice(a, b) {
    try {
      const ancestor = await existingAncestor(b);
      const [x, y] = await Promise.all([fsp.lstat(a), fsp.lstat(ancestor)]);
      return x.dev === y.dev;
    } catch {
      // can't tell: trying the rename is harmless, and a refused one falls back to copying
      return true;
    }
  },
  afterCopy() {},
};

export const graveyardHooksOf = (ctx: { graveyardHooks?: Partial<GraveyardHooks> }): GraveyardHooks => ({ ...defaultGraveyardHooks, ...ctx.graveyardHooks });
