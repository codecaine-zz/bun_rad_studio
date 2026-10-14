/**
 * Wraps every Secrets operation: finds this instance's service, counts the call as activity (so the idle timer
 * restarts), and turns anything unexpected into one plain message, so no error can quote a secret.
 */
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { absolutePath, assertCreatable, type FmContext, type FmHandler } from "./fmCore";
import { FmError } from "./fmPaths";
import { secretsService, type SecretsService } from "./fmSecretsService";

export type SecretsHandler = (svc: SecretsService, ctx: FmContext, body: Record<string, any>) => Promise<unknown> | unknown;

export function secretsOp(fn: SecretsHandler, { touch = true }: { touch?: boolean } = {}): FmHandler {
  return async (ctx, body) => {
    const svc = secretsService(ctx);
    try {
      if (touch) svc.unlocked?.touch();
      const out = await fn(svc, ctx, body);
      return out ?? {};
    } catch (err) {
      if (err instanceof FmError) throw err;
      throw new FmError("SECRETS_ERROR", "Something went wrong with the vault. Nothing was changed.");
    }
  };
}

/** A text from a request, or undefined when it is absent; anything else that is not text is refused. */
export function optionalText(value: unknown, what: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new FmError("BAD_REQUEST", `The ${what} must be text.`);
  return value;
}

/** The sign-in details a request may carry for proving the master password again. */
export function credsOf(b: Record<string, any>) {
  return { password: optionalText(b.password, "password"), keyFile: optionalText(b.keyFile, "key file location"), recoveryKey: optionalText(b.recoveryKey, "recovery key") };
}

/** A location for a new file: absolute, in a place that may be written, and not already taken. */
export function newFilePath(ctx: FmContext, input: unknown): string {
  const path = absolutePath(ctx, input);
  assertCreatable(ctx, dirname(path));
  if (existsSync(path)) throw new FmError("EXISTS", "That file already exists. Choose a new name.");
  return path;
}
