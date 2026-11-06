/**
 * Dialect-aware SQL identifier quoting, parameter placeholder formatting, and `LIKE` wildcard escaping.
 */
import type { Engine, ObjectRef } from "./types";

/** Quote one identifier for an engine. Never interpolate an identifier without going through this. */
export function quoteIdent(engine: Engine, name: string): string {
  if (typeof name !== "string" || name.length === 0)
    throw new Error("Identifier must be a non-empty string");
  if (name.includes("\0"))
    throw new Error("Identifier contains a NUL character");
  if (engine === "mysql") return "`" + name.replace(/`/g, "``") + "`";
  return '"' + name.replace(/"/g, '""') + '"';
}

/** Quotes a table or view reference (`schema.name` or `name`) for the specified database `engine`. */
export function quoteRef(
  engine: Engine,
  ref: Pick<ObjectRef, "schema" | "name">,
): string {
  if (engine === "sqlite" || !ref.schema) return quoteIdent(engine, ref.name);
  return `${quoteIdent(engine, ref.schema)}.${quoteIdent(engine, ref.name)}`;
}

/** Positional placeholder for the n-th (1-based) parameter. */
export function placeholder(engine: Engine, n: number): string {
  return engine === "postgres" ? `$${n}` : "?";
}

/** Escape LIKE wildcards so user text is matched literally (pair with `ESCAPE '!'`). */
export const LIKE_ESCAPE = "!";
/** Escapes `!`, `%`, and `_` in `text` using `!` as the SQL `LIKE` escape character. */
export function escapeLike(text: string): string {
  return text.replace(/[!%_]/g, (c) => "!" + c);
}
