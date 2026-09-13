import type { DoggoOptions, DoggoResponse } from "./doggoTypes.ts";
import {
  formatDoggoTable,
  formatJsonOutput,
  formatShortOutput,
  performAllLookup,
  performDnsLookup,
  performDohLookup,
} from "./doggoDoers.ts";

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
