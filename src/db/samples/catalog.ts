/** The registry of sample datasets and the metadata the studios show in the "Sample databases" dialog. */
import { sqlHelpers } from "./dialect";
import { SCALES, tableCounts, type DatasetDef, type Dialect, type Scale } from "./model";
import { SYNTHETIC_NOTICE } from "./render";
import medicareFormulary from "./datasets/medicare_formulary";
import hospitalEhr from "./datasets/hospital_ehr";
import ecommerceMarketplace from "./datasets/ecommerce_marketplace";
import retailBanking from "./datasets/retail_banking";
import claimsAdjudication from "./datasets/claims_adjudication";
import hrPayroll from "./datasets/hr_payroll";
import wmsSupplyChain from "./datasets/wms_supply_chain";
import airlineReservations from "./datasets/airline_reservations";
import projectTracker from "./datasets/project_tracker";
import iotTelemetry from "./datasets/iot_telemetry";
import saasBilling from "./datasets/saas_billing";

export const DATASETS: DatasetDef[] = [medicareFormulary, hospitalEhr, claimsAdjudication, ecommerceMarketplace, retailBanking, hrPayroll, wmsSupplyChain, airlineReservations, projectTracker, iotTelemetry, saasBilling];

export function getDataset(id: string): DatasetDef | undefined {
  return DATASETS.find((d) => d.id === id);
}

/** Rows per second the engines sustain when loading (measured on a laptop with Docker MySQL 8 / PostgreSQL 16; used for the time estimate only). */
const LOAD_RATE: Record<Dialect, number> = { sqlite: 160_000, mysql: 30_000, postgres: 40_000 };

export function estimateSeconds(dialect: Dialect, rows: number): number {
  return Math.max(1, Math.round(1 + rows / LOAD_RATE[dialect]));
}

export interface CatalogTable {
  name: string;
  comment: string;
  columns: number;
  rows: Record<Scale, number>;
}

export interface CatalogEntry {
  id: string;
  title: string;
  tagline: string;
  description: string;
  tags: string[];
  version: string;
  highlights: string[];
  tables: CatalogTable[];
  views: { name: string; comment: string }[];
  relationships: { from: string; to: string }[];
  queries: { id: string; title: string; description: string; sql: string }[];
  tableCount: number;
  viewCount: number;
  rows: Record<Scale, number>;
  estimatedSeconds: Record<Scale, number>;
  syntheticNotice: string;
}

const countCache = new Map<string, Record<Scale, Record<string, number>>>();

export function datasetCounts(ds: DatasetDef): Record<Scale, Record<string, number>> {
  let c = countCache.get(ds.id);
  if (!c) {
    c = { small: tableCounts(ds, "small"), medium: tableCounts(ds, "medium"), large: tableCounts(ds, "large") };
    countCache.set(ds.id, c);
  }
  return c;
}

export function totalRows(ds: DatasetDef, scale: Scale): number {
  return Object.values(datasetCounts(ds)[scale]).reduce((a, b) => a + b, 0);
}

export function catalogEntry(ds: DatasetDef, dialect: Dialect): CatalogEntry {
  const counts = datasetCounts(ds);
  const h = sqlHelpers(dialect);
  const rows = Object.fromEntries(SCALES.map((s) => [s, totalRows(ds, s)])) as Record<Scale, number>;
  return {
    id: ds.id,
    title: ds.title,
    tagline: ds.tagline,
    description: ds.description,
    tags: ds.tags,
    version: ds.version,
    highlights: ds.highlights,
    tables: ds.order.map((name) => {
      const t = ds.tables.find((x) => x.name === name)!;
      return {
        name,
        comment: t.comment,
        columns: t.columns.length,
        rows: { small: counts.small[name]!, medium: counts.medium[name]!, large: counts.large[name]! },
      };
    }),
    views: ds.views.map((v) => ({ name: v.name, comment: v.comment })),
    relationships: ds.tables.flatMap((t) => t.columns.filter((c) => c.ref).map((c) => ({ from: `${t.name}.${c.name}`, to: `${c.ref!.table}.${c.ref!.column}` }))),
    queries: ds.queries.map((q) => ({ id: q.id, title: q.title, description: q.description, sql: q.sql(h).trim() })),
    tableCount: ds.tables.length,
    viewCount: ds.views.length,
    rows,
    estimatedSeconds: Object.fromEntries(SCALES.map((s) => [s, estimateSeconds(dialect, rows[s])])) as Record<Scale, number>,
    syntheticNotice: SYNTHETIC_NOTICE,
  };
}

export function catalog(dialect: Dialect): CatalogEntry[] {
  return DATASETS.map((d) => catalogEntry(d, dialect));
}
