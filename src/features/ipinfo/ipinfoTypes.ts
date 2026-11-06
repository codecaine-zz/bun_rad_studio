/**
 * Core data structures and CLI option interfaces for the IPInfo network intelligence feature,
 * covering geolocation telemetry, CIDR subnet calculations, and local network interface inspection.
 */

/**
 * Geolocation, ASN/organization, and reverse-DNS metadata returned for an IP address query.
 */
export interface IpInfoResult {
  ip: string;
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  org?: string;
  postal?: string;
  timezone?: string;
  mapUrl?: string;
  readme?: string;
}

/**
 * Computed IPv4 CIDR subnet boundaries, masks, and host counts.
 */
export interface SubnetInfo {
  cidr: string;
  network: string;
  broadcast: string;
  netmask: string;
  wildcard: string;
  firstHost: string;
  lastHost: string;
  totalHosts: number;
  usableHosts: number;
}

/**
 * Address, netmask, hardware MAC, and family details for a host network interface.
 */
export interface LocalInterfaceInfo {
  name: string;
  address: string;
  family: string;
  netmask: string;
  mac: string;
  internal: boolean;
}

/**
 * Parsed command-line options controlling IPInfo queries and output formatting.
 */
export interface IpInfoOptions {
  targetIp?: string;
  token?: string;
  field?: string;
  json: boolean;
  csv: boolean;
  noColor: boolean;
  bulkFile?: string;
  local?: boolean;
}
