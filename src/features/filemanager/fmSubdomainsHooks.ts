/**
 * What the Subdomains tool needs from the outside, replaceable so tests never use the network, a real DNS server
 * or a real clock: the engine's own dependencies (fetch, DNS, HTTP, TCP, clock, program start) in one object.
 */
import { defaultDeps, type EngineDeps } from "../subfinder/subfinderEngine";
import type { FmContext } from "./fmCore";
import { childEnv } from "./fmTools";

export type SubdomainsHooks = EngineDeps;

/** The real dependencies, with any replacements the context carries on top. */
export function subdomainDeps(ctx: FmContext): EngineDeps {
  return { ...defaultDeps(), env: childEnv(ctx), ...ctx.subdomains };
}
