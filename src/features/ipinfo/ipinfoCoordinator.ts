/**
 * High-level orchestration for IPInfo workflows, coordinating DNS/IP resolution,
 * upstream geolocation lookups, CIDR subnet math, bulk file processing, and output formatting.
 */
import type { IpInfoOptions, IpInfoResult } from "./ipinfoTypes.ts";
import {
  calculateSubnet,
  extractField,
  fetchIpDetailsAsync,
  formatBulkTable,
  formatCsv,
  formatJson,
  formatLocalInterfaces,
  formatSubnetInfo,
  formatSummary,
  getLocalInterfaces,
  isCidr,
  lookupPtr,
  readIpTargets,
  resolveTargetToIpAsync,
} from "./ipinfoDoers.ts";

const BULK_CONCURRENCY = 8;

/**
 * Resolves a target hostname or IP and fetches its enriched geolocation and reverse-DNS details.
 */
export async function queryIp(
  target?: string,
  token?: string,
): Promise<IpInfoResult> {
  const { ip, domain } = await resolveTargetToIpAsync(target);
  const data = await fetchIpDetailsAsync(ip, token);
  if (domain && (!data.hostname || !data.hostname.includes(domain))) {
    return { ...data, hostname: `${domain} (${data.hostname ?? "unnamed"})` };
  }
  if (!data.hostname && data.ip) {
    const ptr = await lookupPtr(data.ip);
    if (ptr) data.hostname = ptr;
  }
  return data;
}

/**
 * Executes the requested IPInfo workflow (local interfaces, CIDR math, bulk lookup, or single IP query)
 * and formats the output according to the provided CLI options.
 */
export async function runIpInfoCoordinator(
  options: IpInfoOptions,
): Promise<string> {
  const token = options.token ?? process.env.IPINFO_TOKEN;

  if (options.local) {
    const ifaces = getLocalInterfaces();
    return options.json
      ? JSON.stringify(ifaces, null, 2)
      : formatLocalInterfaces(ifaces);
  }

  if (options.targetIp && isCidr(options.targetIp)) {
    const subnet = calculateSubnet(options.targetIp);
    return options.json
      ? JSON.stringify(subnet, null, 2)
      : formatSubnetInfo(subnet);
  }

  if (options.bulkFile) {
    const targets = await readIpTargets(options.bulkFile);
    const results: IpInfoResult[] = new Array(targets.length);
    let cursor = 0;
    const workerCount = Math.min(BULK_CONCURRENCY, targets.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (cursor < targets.length) {
          const idx = cursor++;
          results[idx] = await queryIp(targets[idx], token);
        }
      }),
    );
    if (options.json) {
      return formatJson(results);
    }
    return formatBulkTable(results);
  }

  const data = await queryIp(options.targetIp, token);

  if (options.field) {
    return extractField(data, options.field);
  }

  if (options.json) {
    return formatJson(data);
  }

  if (options.csv) {
    return formatCsv(data);
  }

  return formatSummary(data);
}
