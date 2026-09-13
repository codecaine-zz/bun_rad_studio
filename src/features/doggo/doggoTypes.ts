export type DnsRecordType =
  | "A"
  | "AAAA"
  | "CNAME"
  | "MX"
  | "TXT"
  | "NS"
  | "SOA"
  | "PTR"
  | "CAA"
  | "SRV";

export interface DnsAnswer {
  name: string;
  type: string;
  class: string;
  ttl?: number;
  data: string;
}

export interface DoggoResponse {
  domain: string;
  queryType: string;
  answers: DnsAnswer[];
  queryTimeMs: number;
  server: string;
  protocol?: "UDP" | "DoH";
}

export interface DoggoOptions {
  domain: string;
  queryType: DnsRecordType | "ALL";
  nameserver?: string;
  doh?: boolean;
  dohUrl?: string;
  all?: boolean;
  short: boolean;
  json: boolean;
  showTime: boolean;
}
