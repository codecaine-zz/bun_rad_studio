/**
 * Type definitions for the `doggo` DNS lookup client, including supported DNS
 * record types, normalized answer records, query responses, and CLI options.
 */

/**
 * Supported DNS resource record types that `doggo` can query.
 */
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

/**
 * Normalized representation of a single DNS resource record answer.
 */
export interface DnsAnswer {
  name: string;
  type: string;
  class: string;
  ttl?: number;
  data: string;
}

/**
 * Complete result of a DNS or DNS-over-HTTPS (DoH) lookup, including timing and server metadata.
 */
export interface DoggoResponse {
  domain: string;
  queryType: string;
  answers: DnsAnswer[];
  queryTimeMs: number;
  server: string;
  protocol?: "UDP" | "DoH";
}

/**
 * Configuration options controlling `doggo` DNS queries and output formatting.
 */
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
