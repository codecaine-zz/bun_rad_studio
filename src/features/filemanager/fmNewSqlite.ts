/**
 * New SQLite database: an empty but valid database file (SQLite's own header, 4 KiB), made next to the other files so it can be
 * opened in SQLite Studio, added as a connection or filled with a sample dataset. Never replaces an existing file.
 */
import { Database } from "bun:sqlite";
import { promises as fsp } from "fs";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext } from "./fmCore";
import { FmError, cleanName, uniqueName, validateName } from "./fmPaths";

const DEFAULT_NAME = "New database.sqlite";

export async function makeSqliteFile(ctx: FmContext, parentInput: unknown, nameInput?: unknown): Promise<{ path: string; name: string }> {
  const parent = absolutePath(ctx, parentInput);
  await assertFolder(parent, "The folder you are in");
  assertCreatable(ctx, parent);
  const taken = new Set(await fsp.readdir(parent));
  let name = DEFAULT_NAME;
  if (nameInput !== undefined && nameInput !== "") {
    const reason = validateName(nameInput, ctx.platform);
    if (reason) throw new FmError("BAD_NAME", reason);
    name = cleanName(nameInput);
    if (!/\.[A-Za-z0-9]+$/.test(name)) name += ".sqlite";
  } else name = uniqueName(DEFAULT_NAME, (n) => taken.has(n));
  const path = pathApi(ctx).join(parent, name);
  try {
    // "wx" fails if the name is taken, so nothing is ever overwritten
    await fsp.writeFile(path, "", { flag: "wx" });
  } catch (err: any) {
    if (err?.code === "EEXIST") throw new FmError("EXISTS", `"${name}" already exists here. Choose a different name.`);
    throw err;
  }
  try {
    const db = new Database(path);
    try {
      db.exec("VACUUM"); // writes the header page, so the file is a real database from the start
    } finally {
      db.close();
    }
  } catch (err) {
    await fsp.rm(path, { force: true });
    throw new FmError("CREATE_FAILED", "The database file couldn't be made.");
  }
  return { path, name };
}
