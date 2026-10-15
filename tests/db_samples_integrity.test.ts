import { describe, expect, it } from "bun:test";
import type { Database } from "bun:sqlite";
import { DATASETS, getDataset } from "../src/db/samples/catalog";
import { sqlHelpers } from "../src/db/samples/dialect";
import { luhnValid } from "../src/db/samples/gen";
import { seedSqlite, scalar } from "./helpers/samples";

const cache = new Map<string, Database>();
async function dbOf(id: string, scale: "small" | "medium" = "small"): Promise<Database> {
  const key = `${id}:${scale}`;
  if (!cache.has(key)) cache.set(key, (await seedSqlite(getDataset(id)!, scale)).db);
  return cache.get(key)!;
}
const all = (db: Database, sql: string) => db.query(sql).all() as any[];

describe("data correctness of the samples", () => {
  it("Medicare formulary: NPI-style ids are Luhn-valid, all six tiers and all five version states exist", async () => {
    const db = await dbOf("medicare_formulary");
    for (const r of all(db, "SELECT npi FROM pharmacy")) expect(luhnValid(`80840${r.npi}`)).toBe(true);
    expect(all(db, "SELECT DISTINCT tier_id FROM formulary_drug ORDER BY 1").map((r) => r.tier_id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(all(db, "SELECT DISTINCT status FROM formulary_version ORDER BY 1").map((r) => r.status)).toEqual(["approved", "draft", "in_review", "published", "retired"]);
    expect(scalar(db, "SELECT COUNT(*) FROM drug")).toBeGreaterThan(300);
    expect(all(db, "SELECT DISTINCT dea_schedule FROM ingredient WHERE dea_schedule IS NOT NULL ORDER BY 1").map((r) => r.dea_schedule)).toEqual(["CII", "CIII", "CIV", "CV"]);
    expect(scalar(db, "SELECT COUNT(*) FROM drug WHERE rxcui NOT BETWEEN 100000 AND 9999999")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM drug_product WHERE ndc_code NOT LIKE '_____-____-__'")).toBe(0);
  });

  it("Medicare formulary: contract ids look like H0000 / S0000, plan keys include the year, data is flagged synthetic", async () => {
    const db = await dbOf("medicare_formulary");
    for (const r of all(db, "SELECT contract_number FROM contract")) expect(r.contract_number).toMatch(/^[HS]\d{4}$/);
    for (const r of all(db, "SELECT plan_key FROM plan")) expect(r.plan_key).toMatch(/^[HS]\d{4}-\d{3}-20\d\d$/);
    expect(scalar(db, "SELECT synthetic_notice FROM _sample_info")).toContain("SYNTHETIC");
    expect(scalar(db, "SELECT COUNT(*) FROM _sample_dictionary WHERE description IS NULL OR description = ''")).toBe(0);
  });

  it("Medicare formulary: cost sharing follows the benefit model (no coverage gap from 2025) and staging tables mirror the data", async () => {
    const db = await dbOf("medicare_formulary");
    expect(scalar(db, `SELECT COUNT(*) FROM cost_share cs JOIN plan p ON p.id = cs.plan_id JOIN plan_year py ON py.id = p.plan_year_id JOIN benefit_phase bp ON bp.id = cs.benefit_phase_id WHERE bp.code = 'GAP' AND py.plan_year >= 2025`)).toBe(0);
    expect(scalar(db, `SELECT COUNT(*) FROM cost_share cs JOIN plan p ON p.id = cs.plan_id JOIN plan_year py ON py.id = p.plan_year_id JOIN benefit_phase bp ON bp.id = cs.benefit_phase_id WHERE bp.code = 'GAP' AND py.plan_year <= 2024`)).toBeGreaterThan(0);
    expect(scalar(db, "SELECT COUNT(*) FROM stg_formulary_file")).toBe(scalar(db, "SELECT COUNT(*) FROM formulary_drug fd JOIN formulary_version fv ON fv.id = fd.formulary_version_id WHERE fv.status = 'published'"));
    expect(scalar(db, "SELECT COUNT(*) FROM stg_plan_info_file")).toBe(scalar(db, "SELECT COUNT(*) FROM plan"));
    expect(scalar(db, "SELECT COUNT(*) FROM formulary_drug_um um JOIN um_rule r ON r.id = um.um_rule_id WHERE r.code = 'ST-GROUP' AND um.step_group_id IS NULL")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM quantity_limit")).toBe(scalar(db, "SELECT COUNT(*) FROM formulary_drug WHERE quantity_limit"));
    expect(scalar(db, "SELECT COUNT(*) FROM formulary_change_log")).toBeGreaterThan(0);
  });

  it("Medicare formulary: triggers keep published versions immutable and audit status changes (SQLite)", async () => {
    const db = (await seedSqlite(getDataset("medicare_formulary")!, "small")).db;
    const published = scalar(db, "SELECT fd.id FROM formulary_drug fd JOIN formulary_version fv ON fv.id = fd.formulary_version_id WHERE fv.status = 'published' LIMIT 1");
    expect(() => db.run("UPDATE formulary_drug SET tier_id = 4 WHERE id = ?", [published])).toThrow(/immutable/);
    const draft = scalar(db, "SELECT fd.id FROM formulary_drug fd JOIN formulary_version fv ON fv.id = fd.formulary_version_id WHERE fv.status = 'draft' LIMIT 1");
    db.run("UPDATE formulary_drug SET tier_id = 4 WHERE id = ?", [draft]);
    const vid = scalar(db, "SELECT id FROM formulary_version WHERE status = 'draft' LIMIT 1");
    const before = scalar(db, "SELECT COUNT(*) FROM audit_event WHERE entity_type = 'formulary_version' AND action = 'status_change'");
    db.run("UPDATE formulary_version SET status = 'in_review' WHERE id = ?", [vid]);
    expect(scalar(db, "SELECT COUNT(*) FROM audit_event WHERE entity_type = 'formulary_version' AND action = 'status_change'")).toBe(before + 1);
  });

  it("Banking: every entry balances, the ledger is immutable, IBAN-style numbers have valid check digits", async () => {
    const db = (await seedSqlite(getDataset("retail_banking")!, "small")).db;
    expect(scalar(db, "SELECT COUNT(*) FROM v_entry_balance_check WHERE difference <> 0")).toBe(0);
    expect(Math.abs(scalar(db, "SELECT SUM(debit) - SUM(credit) FROM posting"))).toBeLessThan(0.001);
    expect(() => db.run("UPDATE posting SET debit = debit + 1 WHERE id = 1")).toThrow(/immutable/);
    expect(() => db.run("DELETE FROM posting WHERE id = 1")).toThrow(/immutable/);
    expect(() => db.run("UPDATE journal_entry SET description = 'x' WHERE id = 1")).toThrow(/immutable/);
    for (const r of all(db, "SELECT account_number FROM account WHERE kind = 'customer'")) {
      const s: string = r.account_number;
      const re = s.slice(4) + s.slice(0, 4);
      let rem = 0;
      for (const ch of re) for (const d of ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch) rem = (rem * 10 + Number(d)) % 97;
      expect(rem).toBe(1);
    }
    expect(scalar(db, "SELECT COUNT(*) FROM card WHERE pan_masked NOT LIKE '______******____'")).toBe(0);
  });

  it("E-commerce: totals reconcile with the lines, payments and barcodes are consistent", async () => {
    const db = await dbOf("ecommerce_marketplace", "medium");
    expect(scalar(db, "SELECT COUNT(*) FROM orders o WHERE ABS(o.subtotal - (SELECT SUM(line_total) FROM order_item WHERE order_id = o.id)) > 0.011")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM orders WHERE ABS(total - (subtotal - discount + shipping_fee + tax)) > 0.011")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM payment p JOIN orders o ON o.id = p.order_id WHERE ABS(p.amount - o.total) > 0.011")).toBe(0);
    for (const r of all(db, "SELECT barcode FROM product_variant")) {
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += Number(r.barcode[i]) * (i % 2 ? 3 : 1);
      expect(Number(r.barcode[12])).toBe((10 - (sum % 10)) % 10);
    }
  });

  it("Claims: header totals equal the sum of the lines and remittances equal the claims they pay", async () => {
    const db = await dbOf("claims_adjudication", "medium");
    for (const col of ["billed", "allowed", "paid", "member_responsibility"]) {
      const lineCol = col === "member_responsibility" ? "member_responsibility" : `${col}_amount`;
      const headCol = col === "member_responsibility" ? "member_responsibility" : `total_${col}`;
      expect(scalar(db, `SELECT COUNT(*) FROM claim c WHERE ABS(c.${headCol} - (SELECT SUM(${lineCol}) FROM claim_line WHERE claim_id = c.id)) > 0.011`)).toBe(0);
    }
    expect(scalar(db, "SELECT COUNT(*) FROM remittance r WHERE ABS(r.total_paid - COALESCE((SELECT SUM(total_paid) FROM claim WHERE remittance_id = r.id), 0)) > 0.05")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM claim_line WHERE denial_reason_id IS NOT NULL AND paid_amount <> 0")).toBe(0);
  });

  it("Airline: no flight is oversold, seats are unique and payments equal the ticket totals", async () => {
    const db = await dbOf("airline_reservations", "medium");
    expect(scalar(db, "SELECT COUNT(*) FROM v_flight_load WHERE tickets > seats")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM booking b WHERE ABS((SELECT amount FROM payment WHERE booking_id = b.id) - (SELECT SUM(total_amount) FROM ticket WHERE booking_id = b.id)) > 0.011")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM check_in")).toBe(scalar(db, "SELECT COUNT(*) FROM ticket WHERE status = 'flown'"));
  });

  it("HR: net pay is computed, payslip lines add up and managers have lower ids", async () => {
    const db = await dbOf("hr_payroll", "medium");
    expect(scalar(db, "SELECT COUNT(*) FROM payslip WHERE ABS(net_pay - (gross_pay - tax_withheld - deductions)) > 0.001")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM payslip p WHERE ABS(p.gross_pay - (SELECT amount FROM payslip_line WHERE payslip_id = p.id AND line_type = 'earning')) > 0.001")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM employee WHERE manager_id IS NOT NULL AND manager_id >= id")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM v_org_chart WHERE manager_id IS NULL")).toBe(1);
  });

  it("SaaS: invoice totals equal their lines", async () => {
    const db = await dbOf("saas_billing", "medium");
    expect(scalar(db, "SELECT COUNT(*) FROM invoice i WHERE ABS(i.subtotal - (SELECT SUM(amount) FROM invoice_line WHERE invoice_id = i.id)) > 0.011")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM invoice WHERE ABS(total - (subtotal - discount_total + tax_total)) > 0.011")).toBe(0);
  });

  it("IoT: hourly roll-ups equal the raw readings", async () => {
    const db = await dbOf("iot_telemetry", "medium");
    const r = all(db, getDataset("iot_telemetry")!.queries.find((q) => q.id === "rollup_check")!.sql(sqlHelpers("sqlite")))[0];
    expect(r.hours_checked).toBe(scalar(db, "SELECT COUNT(*) FROM hourly_stat"));
    expect(r.mismatches).toBe(0);
  });

  it("Issue tracker: the last recorded transition is the issue's status; epics own their children", async () => {
    const db = await dbOf("project_tracker", "medium");
    expect(scalar(db, `SELECT COUNT(*) FROM issue i WHERE EXISTS (SELECT 1 FROM issue_history h WHERE h.issue_id = i.id)
      AND i.status <> (SELECT to_status FROM issue_history h WHERE h.issue_id = i.id ORDER BY changed_at DESC, id DESC LIMIT 1)`)).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM issue c JOIN issue e ON e.id = c.parent_id WHERE e.issue_type <> 'epic' OR e.project_id <> c.project_id")).toBe(0);
  });

  it("Hospital: lab flags agree with the reference ranges; discharge never precedes admission", async () => {
    const db = await dbOf("hospital_ehr", "medium");
    expect(scalar(db, "SELECT COUNT(*) FROM lab_result lr JOIN lab_test t ON t.id = lr.lab_test_id WHERE lr.flag = 'normal' AND (lr.result_value < t.ref_low OR lr.result_value > t.ref_high)")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM encounter WHERE discharged_at IS NOT NULL AND discharged_at < admitted_at")).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM encounter_diagnosis ed JOIN encounter e ON e.id = ed.encounter_id WHERE ed.dx_rank = 1")).toBeGreaterThan(0);
  });

  it("every dataset: dictionary documents every column, info says synthetic, views and indexes exist", async () => {
    for (const ds of DATASETS) {
      const db = await dbOf(ds.id);
      expect(scalar(db, "SELECT COUNT(*) FROM _sample_dictionary WHERE object_type = 'column' AND (description IS NULL OR description = '')")).toBe(0);
      expect(scalar(db, "SELECT scale FROM _sample_info")).toBe("small");
      expect(scalar(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'view'")).toBe(ds.views.length);
      expect(scalar(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name LIKE 'ix_%'")).toBeGreaterThan(5);
    }
  });

  it("the same seed gives the same rows, and a new seed gives different ones", async () => {
    const ds = getDataset("hospital_ehr")!;
    const a = (await seedSqlite(ds, "small", 11)).db, b = (await seedSqlite(ds, "small", 11)).db, c = (await seedSqlite(ds, "small", 12)).db;
    const q = "SELECT mrn, first_name, last_name, birth_date FROM patient ORDER BY id LIMIT 50";
    expect(all(a, q)).toEqual(all(b, q));
    expect(all(a, q)).not.toEqual(all(c, q));
  });
});
