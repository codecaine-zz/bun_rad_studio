import type { IpInfoOptions, IpInfoResult } from "./ipinfoTypes.ts";
import {
  calculateSubnet,
  extractField,
  fetchIpDetails,
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
  resolveTargetToIp,
} from "./ipinfoDoers.ts";

export async function queryIp(
  target?: string,
  token?: string
): Promise<IpInfoResult> {
  const { ip, domain } = await resolveTargetToIp(target);
  const data = await fetchIpDetails(ip, token);
  if (domain && (!data.hostname || !data.hostname.includes(domain))) {
    return { ...data, hostname: `${domain} (${data.hostname ?? "unnamed"})` };
  }
  if (!data.hostname && data.ip) {
    const ptr = await lookupPtr(data.ip);
    if (ptr) data.hostname = ptr;
  }
  return data;
}

export async function runIpInfoCoordinator(options: IpInfoOptions): Promise<string> {
  const token = options.token ?? process.env.IPINFO_TOKEN;

  if (options.local) {
    const ifaces = getLocalInterfaces();
    return options.json ? JSON.stringify(ifaces, null, 2) : formatLocalInterfaces(ifaces);
  }

  if (options.targetIp && isCidr(options.targetIp)) {
    const subnet = calculateSubnet(options.targetIp);
    return options.json ? JSON.stringify(subnet, null, 2) : formatSubnetInfo(subnet);
  }

  if (options.bulkFile) {
    const targets = await readIpTargets(options.bulkFile);
    const results = await Promise.all(targets.map((t) => queryIp(t, token)));
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
