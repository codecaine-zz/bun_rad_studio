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

export interface LocalInterfaceInfo {
  name: string;
  address: string;
  family: string;
  netmask: string;
  mac: string;
  internal: boolean;
}

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

