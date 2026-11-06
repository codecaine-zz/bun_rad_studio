/**
 * Coordinator workflows for `doggo`, dispatching UDP DNS, DNS-over-HTTPS (DoH),
 * or multi-record (`ALL`) queries and formatting the resulting output.
 */
import type { DoggoOptions, DoggoResponse } from "./doggoTypes.ts";
import {
  formatDoggoTable,
  formatJsonOutput,
  formatShortOutput,
  performAllLookup,
  performDnsLookup,
  performDohLookup,
} from "./doggoDoers.ts";

/**
 * Resolves DNS records for `domain` using either a specific record `type` or `"ALL"` common record types.
 */
export async function lookupDomain(
  domain: string,
  type: DoggoOptions["queryType"] = "A",
  nameserver?: string
): Promise<DoggoResponse> {
  if (type === "ALL") {
    return await performAllLookup(domain, nameserver);
  }
  return await performDnsLookup(domain, type, nameserver);
}

/**
 * Executes the configured `doggo` query workflow and formats the response as short text, JSON, or a table.
 */
export async function runDoggoCoordinator(options: DoggoOptions): Promise<string> {
  let response: DoggoResponse;
  if (options.all || options.queryType === "ALL") {
    response = await performAllLookup(options.domain, options.nameserver, options.doh);
  } else if (options.doh) {
    response = await performDohLookup(options.domain, options.queryType, options.dohUrl);
  } else {
    response = await lookupDomain(options.domain, options.queryType, options.nameserver);
  }

  if (options.short) {
    return formatShortOutput(response);
  }

  if (options.json) {
    return formatJsonOutput(response);
  }

  return formatDoggoTable(response, options.showTime);
}
