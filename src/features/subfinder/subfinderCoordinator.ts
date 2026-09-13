import type { SubdomainResult, SubfinderOptions } from "./subfinderTypes.ts";
import {
  cleanDomain,
  cleanSubdomain,
  deduplicateSubdomains,
  detectWildcardDns,
  isWildcardMatch,
  probeHttp,
  probePorts,
  queryAlienVault,
  queryAnubis,
  queryCertSpotter,
  queryCommonDns,
  queryCrtSh,
  queryHackerTarget,
  resolveHostDns,
  queryCommonDnsSync,
  queryCertSpotterSync,
  queryHackerTargetSync,
  queryOsintSourcesSync,
  resolveHostDnsSync,
  probeHttpSync,
  probeHostsHttpSync,
} from "./subfinderDoers.ts";
import { colors } from "../../shared/colors.ts";

export async function enumerateDomain(
  domain: string,
  timeoutMs: number,
  active: boolean,
  probe: boolean = false,
  ports?: number[],
  detectWildcard: boolean = false,
  onProgress?: (msg: string) => void,
  onBatch?: (batch: SubdomainResult[]) => void
): Promise<SubdomainResult[]> {
  const rootDomain = cleanDomain(domain);
  const capTimeout = Math.min(timeoutMs, 3000);

  onProgress?.(`Querying OSINT sources (CertSpotter, HackerTarget, DNS-dict)...`);

  // Fast sources run immediately, crtsh/alienvault capped to 2.5s
  const [hackertarget, crtsh, alienvault, anubis, certspotter, commonDns, wildcardIps] = await Promise.all([
    queryHackerTarget(rootDomain, capTimeout),
    queryCrtSh(rootDomain, Math.min(capTimeout, 2000)),
    queryAlienVault(rootDomain, Math.min(capTimeout, 1500)),
    queryAnubis(rootDomain, Math.min(capTimeout, 1500)),
    queryCertSpotter(rootDomain, capTimeout),
    queryCommonDns(rootDomain),
    detectWildcard || active ? detectWildcardDns(rootDomain) : Promise.resolve([]),
  ]);

  const rawHosts = [...commonDns, ...certspotter, ...hackertarget, ...crtsh, ...alienvault, ...anubis];
  const cleaned = rawHosts
    .map((h) => cleanSubdomain(h, rootDomain))
    .filter((h): h is string => h !== null);

  const uniqueHosts = deduplicateSubdomains(cleaned);
  // Cap candidate pool to top 150 for rapid interactive responsiveness
  const candidatePool = uniqueHosts.slice(0, 150);
  onProgress?.(`Discovered ${uniqueHosts.length} candidate hosts. Streaming DNS verification...`);

  // 1. Resolve hosts in parallel chunks of 25 and stream results immediately
  const results: SubdomainResult[] = [];
  const BATCH_SIZE = 25;

  for (let i = 0; i < candidatePool.length; i += BATCH_SIZE) {
    const batchHosts = candidatePool.slice(i, i + BATCH_SIZE);

    const batchVerified = await Promise.all(
      batchHosts.map(async (host, bIdx) => {
        const globalIdx = i + bIdx;
        const ip = active ? await resolveHostDns(host) : undefined;
        if (active && (!ip || ip.length === 0)) return null;

        const sources: string[] = [];
        if (commonDns.includes(host)) sources.push("dns-dict");
        if (certspotter.includes(host)) sources.push("certspotter");
        if (hackertarget.includes(host)) sources.push("hackertarget");
        if (crtsh.includes(host)) sources.push("crtsh");
        if (alienvault.includes(host)) sources.push("alienvault");
        if (anubis.includes(host)) sources.push("anubis");
        if (sources.length === 0) sources.push("osint");

        const isWildcard = ip && wildcardIps.length > 0 ? isWildcardMatch(ip, wildcardIps) : undefined;

        let httpStatus: number | undefined = undefined;
        let httpTitle: string | undefined = undefined;
        if (probe && globalIdx < 30) {
          const p = await probeHttp(host, 800);
          httpStatus = p.status;
          httpTitle = p.title;
        }

        let openPorts: number[] | undefined = undefined;
        if (ports && ports.length > 0 && globalIdx < 30) {
          openPorts = await probePorts(host, ports, 400);
        }

        return { host, sources, ip, httpStatus, httpTitle, openPorts, isWildcard } as SubdomainResult;
      })
    );

    const validBatch = batchVerified.filter((r): r is SubdomainResult => r !== null);
    for (const r of validBatch) {
      results.push(r);
    }

    if (validBatch.length > 0 && onBatch) {
      onBatch(validBatch);
    }

    onProgress?.(`Streaming results: ${results.length} active host(s) found...`);
  }

  return results;
}

export function formatSubdomainResult(
  res: SubdomainResult,
  options: SubfinderOptions
): string {
  if (options.json) {
    return JSON.stringify(res);
  }
  if (options.silent) {
    return res.host;
  }
  const hostStr = colors.bold(colors.cyan(res.host));
  const ipStr = res.ip && res.ip.length > 0 ? ` ${colors.dim(`[${res.ip.join(", ")}]`)}` : "";
  const wildcardStr = res.isWildcard ? ` ${colors.yellow("[wildcard]")}` : "";
  const portsStr = res.openPorts && res.openPorts.length > 0 ? ` ${colors.magenta(`[ports: ${res.openPorts.join(",")}]`)}` : "";
  const statusStr = res.httpStatus ? ` ${colors.green(`[${res.httpStatus}]`)}` : "";
  const titleStr = res.httpTitle ? ` ${colors.dim(`("${res.httpTitle}")`)}` : "";
  const srcStr = res.sources.length > 0 ? ` ${colors.yellow(`(${res.sources.join(",")})`)}` : "";
  return `${hostStr}${ipStr}${wildcardStr}${portsStr}${statusStr}${titleStr}${srcStr}`;
}

export async function runSubfinderCoordinator(
  options: SubfinderOptions
): Promise<string[]> {
  const allResults: SubdomainResult[] = [];

  for (const domain of options.domains) {
    const domainResults = await enumerateDomain(
      domain,
      options.timeoutMs,
      options.active,
      options.probe,
      options.ports,
      options.detectWildcard
    );
    allResults.push(...domainResults);
  }

  const lines = allResults.map((r) => formatSubdomainResult(r, options));

  if (options.outputFile) {
    await Bun.write(options.outputFile, lines.join("\n") + "\n");
  }

  return lines;
}

export function enumerateDomainSync(
  domain: string,
  active: boolean = false,
  probe: boolean = false,
  ports?: number[],
  detectWildcard: boolean = false,
  onProgress?: (msg: string) => void
): SubdomainResult[] {
  const rootDomain = cleanDomain(domain);
  onProgress?.(`Querying OSINT sources & DNS dictionary for "${rootDomain}"...`);

  const dnsSubs = queryCommonDnsSync(rootDomain);
  const { certSubs, hackerSubs } = queryOsintSourcesSync(rootDomain);

  const rawHosts = [...dnsSubs.map((d) => d.host), ...certSubs, ...hackerSubs];
  const uniqueHosts = deduplicateSubdomains(rawHosts);

  const hostIps = resolveHostDnsSync(uniqueHosts);
  for (const item of dnsSubs) {
    if (item.ip && item.ip.length > 0 && !hostIps.has(item.host)) {
      hostIps.set(item.host, item.ip);
    }
  }

  // Fast parallel probing if requested
  const probeStatusMap = probe ? probeHostsHttpSync(uniqueHosts) : new Map<string, number>();

  const results: SubdomainResult[] = [];
  for (const host of uniqueHosts) {
    const ip = hostIps.get(host);
    if (active && (!ip || ip.length === 0)) continue;

    const sources: string[] = [];
    if (dnsSubs.some((d) => d.host === host)) sources.push("dns-dict");
    if (certSubs.includes(host)) sources.push("certspotter");
    if (hackerSubs.includes(host)) sources.push("hackertarget");
    if (sources.length === 0) sources.push("osint");

    const httpStatus = probeStatusMap.get(host);

    results.push({
      host,
      sources,
      ip,
      httpStatus,
    });
  }

  return results;
}
