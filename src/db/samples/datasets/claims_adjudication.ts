import { addDays, dayOf, dayStr, hashString, mulberry32 } from "../gen";
import { dataset, query, table, view, type Scale } from "../model";

const ASOF = "2025-06-30";
const START = "2024-01-01";

const PROC: [string, string, number][] = [
  ["99213", "Established patient office visit", 118], ["99203", "New patient office visit", 165], ["99214", "Established patient visit, higher complexity", 175], ["99285", "Emergency department visit, high severity", 520],
  ["80053", "Comprehensive metabolic panel", 28], ["85025", "Complete blood count", 20], ["71046", "Chest X-ray, 2 views", 62], ["73721", "MRI knee without contrast", 480],
  ["93000", "Electrocardiogram", 32], ["45378", "Diagnostic colonoscopy", 780], ["97110", "Therapeutic exercises", 44], ["97140", "Manual therapy", 40],
  ["90834", "Psychotherapy, 45 minutes", 125], ["77067", "Screening mammogram", 150], ["36415", "Blood draw", 8], ["20610", "Joint injection", 95],
  ["27447", "Total knee replacement", 9800], ["59400", "Routine obstetric care and delivery", 4600], ["43239", "Upper GI endoscopy with biopsy", 690], ["99283", "Emergency department visit, moderate", 310],
];
const DX: [string, string][] = [["I10", "Hypertension"], ["E11.9", "Type 2 diabetes"], ["M54.5", "Low back pain"], ["J06.9", "Upper respiratory infection"], ["F32.9", "Depression"], ["Z00.00", "General adult exam"], ["M17.9", "Knee osteoarthritis"], ["K21.9", "GERD"], ["N39.0", "Urinary tract infection"], ["R07.9", "Chest pain"], ["E78.5", "Hyperlipidemia"], ["Z12.31", "Screening mammogram"], ["O80", "Delivery"], ["J45.909", "Asthma"], ["G43.909", "Migraine"]];
const DENIALS: [string, string, string][] = [
  ["CO-4", "Procedure code inconsistent with modifier", "coding"], ["CO-16", "Claim lacks information needed for adjudication", "administrative"], ["CO-18", "Duplicate claim or service", "administrative"], ["CO-29", "Timely filing limit expired", "administrative"],
  ["CO-50", "Not medically necessary", "clinical"], ["CO-97", "Benefit included in another service", "coding"], ["PR-27", "Coverage terminated before service date", "eligibility"], ["CO-197", "Prior authorization absent", "authorization"],
  ["CO-109", "Claim belongs to another payer", "eligibility"], ["PR-96", "Non-covered charge", "benefit"],
];
const SPECIALTIES = ["Family medicine", "Internal medicine", "Orthopedics", "Cardiology", "Radiology", "Physical therapy", "Behavioral health", "OB/GYN", "Emergency medicine", "Gastroenterology"];

const CFG: Record<Scale, { M: number; PR: number; CL: number }> = { small: { M: 200, PR: 50, CL: 400 }, medium: { M: 2000, PR: 300, CL: 4000 }, large: { M: 12000, PR: 1200, CL: 20000 } };
interface Ln { proc: number; units: number; billed: number; allowed: number; denial: number | null; memberResp: number; paid: number }
interface Cl { member: number; provider: number; from: string; to: string; received: string; adjudicated: string | null; status: string; lines: Ln[]; inNetwork: boolean; remit: number | null; auth: boolean }
const cache = new Map<Scale, Cl[]>();
const monthIndex = (d: string) => (Number(d.slice(0, 4)) - 2024) * 12 + Number(d.slice(5, 7)) - 1;
function plan(scale: Scale): Cl[] {
  const hit = cache.get(scale);
  if (hit) return hit;
  const { M, PR, CL } = CFG[scale];
  const r = mulberry32(hashString(`claims:${scale}`));
  const out: Cl[] = [];
  for (let i = 0; i < CL; i++) {
    const dup = i % 40 === 39 && out.length > 0 ? out[out.length - 1]! : null;
    const from = dup ? dup.from : dayStr(dayOf(START) + Math.floor(r() * (dayOf("2025-06-10") - dayOf(START))));
    const nl = r() < 0.45 ? 1 : r() < 0.6 ? 2 : r() < 0.8 ? 3 : 4;
    const inNet = r() < 0.86;
    const lines: Ln[] = [];
    for (let j = 0; j < nl; j++) {
      const proc = 1 + Math.min(PROC.length - 1, Math.floor(PROC.length * Math.pow(r(), 1.7)));
      const units = proc === 11 || proc === 12 ? 1 + Math.floor(r() * 3) : 1;
      const allowed = Math.round(PROC[proc - 1]![2] * units * (inNet ? 1 : 1.25) * (0.95 + r() * 0.1) * 100) / 100;
      const billed = Math.round(allowed * (1.6 + r() * 1.8) * 100) / 100;
      const denied = r() < 0.085;
      const resp = denied ? 0 : Math.round(Math.min(allowed, (r() < 0.5 ? 25 : 0) + allowed * [0, 0.1, 0.2, 0.3][Math.floor(r() * 4)]!) * 100) / 100;
      lines.push({ proc, units, billed, allowed, denial: denied ? 1 + Math.floor(r() * DENIALS.length) : null, memberResp: resp, paid: denied ? 0 : Math.round((allowed - resp) * 100) / 100 });
    }
    const to = from;
    const received = addDays(to, 3 + Math.floor(r() * 18));
    const adjDay = addDays(received, 1 + Math.floor(r() * 14));
    const adjudicated = adjDay <= ASOF ? adjDay : null;
    const allDenied = lines.every((l) => l.denial !== null);
    const status = !adjudicated ? "received" : allDenied ? "denied" : r() < 0.02 ? "appealed" : "paid";
    out.push({ member: dup ? dup.member : 1 + Math.floor(M * Math.pow(r(), 1.4)), provider: dup ? dup.provider : 1 + Math.floor(PR * Math.pow(r(), 1.8)), from, to, received, adjudicated, status, lines, inNetwork: inNet, remit: adjudicated && status !== "denied" ? monthIndex(adjudicated) + 1 : null, auth: r() < 0.1 });
  }
  cache.set(scale, out);
  return out;
}
const lineTotal = (s: Scale) => plan(s).reduce((a, c) => a + c.lines.length, 0);
const remitTotals = (s: Scale) => { const t = new Array<number>(18).fill(0); for (const c of plan(s)) if (c.remit) t[c.remit - 1]! += c.lines.reduce((a, l) => a + l.paid, 0); return t; };

export default dataset({
  id: "claims_adjudication",
  title: "Health Insurance Claims Adjudication",
  tagline: "Members, eligibility, providers, fee schedules, claims and lines, denials, remittances and accumulators.",
  description:
    "A payer's claims platform: plan products, employer groups, members and eligibility spans, in- and out-of-network providers with NPI-style ids, a fee schedule, professional claims with lines " +
    "and diagnoses, denial reasons in the style of claim adjustment reason codes, adjustments, monthly remittance batches whose totals equal the paid claims, prior authorizations, " +
    "deductible / out-of-pocket accumulators, appeals and special-investigation cases. Claim and line totals always reconcile. All data is synthetic.",
  tags: ["Healthcare", "Insurance", "Finance"],
  asOf: ASOF,
  highlights: ["claim header = sum of lines", "CARC-style denials", "remittance reconciliation", "accumulators", "duplicate detection"],
  tables: [
    table("plan_product", "Insurance products offered to groups.", ["id id", "code str(12) uq", "name str(60)", "plan_type enum(HMO,PPO,EPO,HDHP)", "annual_deductible dec(8,2)", "oop_max dec(8,2)", "office_copay dec(6,2)", "coinsurance_pct dec(4,1)"], {
      rows: [["HMO-GOLD", "Gold HMO", "HMO", 500, 4500, 20, 10], ["PPO-SILVER", "Silver PPO", "PPO", 1500, 7000, 30, 20], ["EPO-BRONZE", "Bronze EPO", "EPO", 3500, 8500, 40, 30], ["HDHP-HSA", "HSA-eligible HDHP", "HDHP", 3000, 7500, 0, 20]].map(([code, name, plan_type, annual_deductible, oop_max, office_copay, coinsurance_pct]) => ({ code, name, plan_type, annual_deductible, oop_max, office_copay, coinsurance_pct })),
    }),
    table("employer_group", "Employer groups that buy coverage.", ["id id", "name str(80)", "group_no str(10) uq", "industry str(30)", "employees int", "effective_date date"], {
      n: [10, 40, 150], gen: (g, i) => ({ name: g.company(), group_no: `GRP${String(i).padStart(6, "0")}`, industry: g.pick(["Manufacturing", "Retail", "Education", "Technology", "Healthcare", "Construction", "Services"]), employees: Math.round(g.logNormal(250, 1.1)), effective_date: g.date("2018-01-01", "2024-01-01") }),
    }),
    table("member", "Covered people. Dependents point to the subscriber.", ["id id", "member_no str(12) uq", "subscriber_id int fk:member null", "relationship enum(self,spouse,child)", "first_name str(40)", "last_name str(40)", "birth_date date", "sex enum(F,M)", "state char(2)", "group_id int fk:employer_group", "created_at ts def:now"], {
      n: [CFG.small.M, CFG.medium.M, CFG.large.M], ix: ["group_id"],
      gen: (g, i) => { const dep = i > 20 && g.bool(0.32); const sub = dep ? Math.max(1, i - g.int(1, 3)) : null; const p = g.place(); return { member_no: `M${String(i).padStart(9, "0")}`, subscriber_id: dep ? sub : null, relationship: dep ? g.pick(["spouse", "child", "child"]) : "self", first_name: g.first(), last_name: g.last(), birth_date: dayStr(dayOf(ASOF) - Math.round(g.clamp(g.normal(dep ? 22 : 42, 14), 0, 80)) * 365 - g.int(0, 364)), sex: g.bool(0.52) ? "F" : "M", state: p.state, group_id: g.fkSkew(g.count("employer_group"), 1.5) }; },
    }),
    table("eligibility", "Coverage spans of a member under a product.", ["id id", "member_id int fk:member cascade", "plan_product_id int fk:plan_product", "effective_date date", "term_date date null"], {
      n: (n) => n("member"), ix: ["member_id,effective_date"], ck: ["term_date IS NULL OR term_date >= effective_date"],
      gen: (g, i) => { const eff = g.date("2023-01-01", "2024-06-01"); return { member_id: i, plan_product_id: g.w([[1, 20], [2, 45], [3, 15], [4, 20]] as const), effective_date: eff, term_date: g.bool(0.08) ? g.date(addDays(eff, 60), ASOF) : null }; },
    }),
    table("provider", "Providers with NPI-style ids and network status.", ["id id", "npi char(10) uq", "name str(80)", "specialty str(30)", "network_status enum(in_network,out_of_network)", "tin char(9)", "state char(2)", "contracted_on date null"], {
      n: [CFG.small.PR, CFG.medium.PR, CFG.large.PR], ix: ["specialty,network_status"],
      gen: (g, i) => { const net = g.bool(0.86); return { npi: g.npi(), name: `${g.last()} ${g.pick(["Medical Group", "Clinic", "Health Associates", "Imaging Center", "Surgical Partners"])}`, specialty: g.pick(SPECIALTIES), network_status: net ? "in_network" : "out_of_network", tin: g.digits(9), state: g.place().state, contracted_on: net ? g.date("2015-01-01", "2024-01-01") : null }; },
    }),
    table("procedure_code", "CPT-style procedure subset with own descriptions.", ["id id", "code str(8) uq", "description str(80)"], { rows: PROC.map(([code, description]) => ({ code, description })) }),
    table("diagnosis_code", "ICD-10-style diagnosis subset.", ["id id", "code str(10) uq", "description str(60)"], { rows: DX.map(([code, description]) => ({ code, description })) }),
    table("fee_schedule", "Allowed amount per procedure and network status.", ["id id", "procedure_code_id int fk:procedure_code", "network enum(in,out)", "allowed_amount dec(10,2)", "effective_from date"], {
      n: PROC.length * 2, uq: [["procedure_code_id", "network", "effective_from"]],
      gen: (g, i) => { const p = Math.ceil(i / 2); return { procedure_code_id: p, network: i % 2 ? "in" : "out", allowed_amount: g.round(PROC[p - 1]![2] * (i % 2 ? 1 : 1.25)), effective_from: "2024-01-01" }; },
    }),
    table("denial_reason", "Claim adjustment reason codes (CARC-style).", ["id id", "code str(8) uq", "description str(80)", "category enum(coding,administrative,clinical,eligibility,authorization,benefit)"], { rows: DENIALS.map(([code, description, category]) => ({ code, description, category })) }),
    table("remittance", "Monthly payment batches (electronic remittance); total equals the paid claim lines of the month.", ["id id", "batch_ref str(14) uq", "payment_month char(7)", "total_paid dec(14,2)", "paid_on date"], {
      n: 18, gen: (g, i) => { const m = i - 1; const y = 2024 + Math.floor(m / 12); const mm = (m % 12) + 1; return { batch_ref: `ERA-${y}${String(mm).padStart(2, "0")}`, payment_month: `${y}-${String(mm).padStart(2, "0")}`, total_paid: g.round(remitTotals(g.scale)[m]!), paid_on: `${y}-${String(mm).padStart(2, "0")}-28` }; },
    }),
    table("claim", "Claim headers. Totals are the sum of the lines.", ["id id", "claim_no str(14) uq", "member_id int fk:member", "provider_id int fk:provider", "service_from date", "service_to date", "received_date date", "adjudicated_date date null", "status enum(received,paid,denied,appealed)", "total_billed dec(12,2)", "total_allowed dec(12,2)", "total_paid dec(12,2)", "member_responsibility dec(12,2)", "remittance_id int fk:remittance null", "created_at ts def:now"], {
      n: [CFG.small.CL, CFG.medium.CL, CFG.large.CL], ix: ["member_id,service_from", "provider_id", "status,received_date"],
      gen: (g, i) => { const c = plan(g.scale)[i - 1]!; const sum = (f: (l: Ln) => number) => g.round(c.lines.reduce((a, l) => a + f(l), 0)); return { claim_no: `CLM${String(i).padStart(10, "0")}`, member_id: c.member, provider_id: c.provider, service_from: c.from, service_to: c.to, received_date: c.received, adjudicated_date: c.adjudicated, status: c.status, total_billed: sum((l) => l.billed), total_allowed: sum((l) => l.allowed), total_paid: sum((l) => l.paid), member_responsibility: sum((l) => l.memberResp), remittance_id: c.remit, created_at: `${c.received} 08:00:00` }; },
    }),
    table("claim_line", "Service lines; denied lines carry a denial reason.", ["id id", "claim_id int fk:claim cascade", "line_no smallint", "procedure_code_id int fk:procedure_code", "units smallint", "billed_amount dec(10,2)", "allowed_amount dec(10,2)", "paid_amount dec(10,2)", "member_responsibility dec(10,2)", "denial_reason_id int fk:denial_reason null"], {
      n: (n, s) => lineTotal(s), uq: [["claim_id", "line_no"]], ix: ["procedure_code_id"],
      all: (g) => plan(g.scale).flatMap((c, ci) => c.lines.map((l, k) => ({ claim_id: ci + 1, line_no: k + 1, procedure_code_id: l.proc, units: l.units, billed_amount: l.billed, allowed_amount: l.allowed, paid_amount: l.paid, member_responsibility: l.memberResp, denial_reason_id: l.denial }))),
    }),
    table("claim_diagnosis", "Diagnoses on a claim.", ["id id", "claim_id int fk:claim cascade", "diagnosis_code_id int fk:diagnosis_code", "dx_seq smallint"], {
      n: (n) => n("claim"), uq: [["claim_id", "dx_seq"]], gen: (g, i) => ({ claim_id: i, diagnosis_code_id: g.fkSkew(DX.length, 1.4), dx_seq: 1 }),
    }),
    table("claim_adjustment", "Adjustments applied during adjudication.", ["id id", "claim_line_id int fk:claim_line cascade", "adjustment_type enum(contractual,patient_responsibility,denial,other)", "amount dec(10,2)", "reason_code str(8) null"], {
      n: (n) => Math.floor(n("claim_line") * 0.7),
      gen: (g, i) => { const l = g.rows("claim_line")[(i * 3 - 1) % g.count("claim_line")]!; const contractual = Number(l.billed_amount) - Number(l.allowed_amount); return { claim_line_id: l.id, adjustment_type: l.denial_reason_id ? "denial" : "contractual", amount: g.round(l.denial_reason_id ? Number(l.billed_amount) : contractual), reason_code: l.denial_reason_id ? DENIALS[Number(l.denial_reason_id) - 1]![0] : "CO-45" }; },
    }),
    table("prior_authorization", "Prior authorization requests for high-cost services.", ["id id", "member_id int fk:member", "provider_id int fk:provider", "procedure_code_id int fk:procedure_code", "requested_on date", "decided_on date null", "status enum(approved,denied,pending,expired)"], {
      n: [60, 600, 4000], gen: (g) => { const req = g.date("2024-01-01", ASOF); const pending = req > addDays(ASOF, -5); return { member_id: g.fkSkew(g.count("member"), 1.4), provider_id: g.fkSkew(g.count("provider"), 1.8), procedure_code_id: g.pick([8, 10, 17, 18, 19, 4]), requested_on: req, decided_on: pending ? null : addDays(req, g.int(1, 9)), status: pending ? "pending" : g.w([["approved", 78], ["denied", 17], ["expired", 5]] as const) }; },
    }),
    table("accumulator", "Year-to-date deductible and out-of-pocket per member and plan year.", ["id id", "member_id int fk:member cascade", "plan_year smallint", "deductible_met dec(10,2)", "oop_met dec(10,2)", "updated_at ts upd"], {
      n: (n) => n("member") * 2, uq: [["member_id", "plan_year"]], gen: (g, i) => { const dd = g.money(300, 1, 0, 3500); return { member_id: Math.ceil(i / 2), plan_year: i % 2 ? 2024 : 2025, deductible_met: dd, oop_met: g.round(dd + g.money(200, 1.2, 0, 6000)) }; },
    }),
    table("appeal", "Provider and member appeals of denied claims.", ["id id", "claim_id int fk:claim", "filed_on date", "appeal_level smallint", "status enum(open,upheld,overturned)", "decided_on date null"], {
      n: [25, 300, 1800], gen: (g, i) => { const den = g.rows("claim").filter((c) => c.status === "denied" || c.status === "appealed"); const c = den[(i * 5) % den.length]!; const filed = addDays(String(c.adjudicated_date), g.int(7, 60)); const open = filed > addDays(ASOF, -20); return { claim_id: c.id, filed_on: filed > ASOF ? ASOF : filed, appeal_level: g.w([[1, 85], [2, 15]] as const), status: open ? "open" : g.w([["upheld", 58], ["overturned", 42]] as const), decided_on: open ? null : addDays(filed > ASOF ? ASOF : filed, g.int(10, 40) > 25 ? 20 : 12) }; },
    }),
    table("siu_case", "Special-investigation (fraud / waste / abuse) cases against providers.", ["id id", "provider_id int fk:provider", "opened_on date", "case_type enum(upcoding,duplicate_billing,unbundling,phantom_billing)", "status enum(open,closed_no_finding,recovered,referred)", "amount_at_risk dec(12,2)"], {
      n: [8, 60, 300], gen: (g) => ({ provider_id: g.fkSkew(g.count("provider"), 1.2), opened_on: g.date("2024-03-01", ASOF), case_type: g.pick(["upcoding", "duplicate_billing", "unbundling", "phantom_billing"]), status: g.w([["open", 40], ["closed_no_finding", 25], ["recovered", 25], ["referred", 10]] as const), amount_at_risk: g.money(25000, 1) }),
    }),
  ],
  views: [
    view("v_claim_summary", "Claim headers with member, provider and network status.", () => `
SELECT c.id AS claim_id, c.claim_no, c.status, c.service_from, m.member_no, pr.name AS provider, pr.specialty, pr.network_status, c.total_billed, c.total_allowed, c.total_paid, c.member_responsibility
FROM claim c JOIN member m ON m.id = c.member_id JOIN provider pr ON pr.id = c.provider_id`),
    view("v_denials_by_reason", "Denied lines by reason and category.", () => `
SELECT dr.code, dr.description, dr.category, COUNT(*) AS denied_lines, SUM(cl.billed_amount) AS billed_denied
FROM claim_line cl JOIN denial_reason dr ON dr.id = cl.denial_reason_id GROUP BY dr.code, dr.description, dr.category`),
    view("v_member_accumulators", "Deductible and out-of-pocket progress against the member's product.", (d) => `
SELECT m.member_no, a.plan_year, pp.name AS product, pp.annual_deductible, a.deductible_met, pp.oop_max, a.oop_met,
       ${d.round("100.0 * a.oop_met / pp.oop_max", 1)} AS oop_pct
FROM accumulator a JOIN member m ON m.id = a.member_id
JOIN eligibility e ON e.member_id = m.id JOIN plan_product pp ON pp.id = e.plan_product_id`),
    view("v_provider_scorecard", "Billed versus allowed and denial rate per provider.", (d) => `
SELECT pr.id AS provider_id, pr.name, pr.specialty, pr.network_status, COUNT(cl.id) AS line_count, SUM(cl.billed_amount) AS billed, SUM(cl.allowed_amount) AS allowed,
       ${d.round("SUM(cl.billed_amount) / NULLIF(SUM(cl.allowed_amount), 0)", 2)} AS billed_to_allowed,
       ${d.round("100.0 * SUM(CASE WHEN cl.denial_reason_id IS NULL THEN 0 ELSE 1 END) / COUNT(cl.id)", 1)} AS denial_pct
FROM provider pr JOIN claim c ON c.provider_id = pr.id JOIN claim_line cl ON cl.claim_id = c.id GROUP BY pr.id, pr.name, pr.specialty, pr.network_status`),
    view("v_claims_in_process", "Received claims not yet adjudicated, with days since receipt.", (d) => `
SELECT c.id AS claim_id, c.claim_no, c.received_date, ${d.diffDays(d.asOf, "c.received_date")} AS days_waiting, c.total_billed FROM claim c WHERE c.status = 'received'`),
    view("v_pa_pending", "Pending prior authorizations.", (d) => `
SELECT pa.id AS authorization_id, m.member_no, pc.code AS procedure_code, pc.description, pa.requested_on, ${d.diffDays(d.asOf, "pa.requested_on")} AS days_open
FROM prior_authorization pa JOIN member m ON m.id = pa.member_id JOIN procedure_code pc ON pc.id = pa.procedure_code_id WHERE pa.status = 'pending'`),
  ],
  queries: [
    query("denial_rates", "Denial rate by specialty", "Which specialties see the most denied lines, and for what category of reason.", (d) => `
-- Denials by specialty and reason category
SELECT pr.specialty, dr.category, COUNT(*) AS denied_lines,
       ${d.round("100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY pr.specialty)", 1)} AS pct_of_specialty_denials
FROM claim_line cl JOIN claim c ON c.id = cl.claim_id JOIN provider pr ON pr.id = c.provider_id JOIN denial_reason dr ON dr.id = cl.denial_reason_id
GROUP BY pr.specialty, dr.category ORDER BY pr.specialty, denied_lines DESC`),
    query("turnaround", "Adjudication turnaround", "Average and maximum days from receipt to adjudication by month.", (d) => `
-- Claims processing speed
SELECT ${d.ym("received_date")} AS month, COUNT(*) AS claims, ${d.round("AVG(" + d.diffDays("adjudicated_date", "received_date") + ")", 1)} AS avg_days, MAX(${d.diffDays("adjudicated_date", "received_date")}) AS max_days
FROM claim WHERE adjudicated_date IS NOT NULL GROUP BY ${d.ym("received_date")} ORDER BY month`),
    query("out_of_network_premium", "Out-of-network premium", "Allowed amount in versus out of network for the same procedure (fee schedule self join).", (d) => `
-- How much more does out-of-network cost?
SELECT pc.code, pc.description, i.allowed_amount AS in_network, o.allowed_amount AS out_of_network, ${d.round("100.0 * (o.allowed_amount - i.allowed_amount) / i.allowed_amount", 1)} AS premium_pct
FROM fee_schedule i JOIN fee_schedule o ON o.procedure_code_id = i.procedure_code_id AND o.network = 'out' JOIN procedure_code pc ON pc.id = i.procedure_code_id
WHERE i.network = 'in' ORDER BY i.allowed_amount DESC LIMIT 10`),
    query("duplicates", "Possible duplicate claims", "Same member, provider and service date billed more than once.", () => `
-- Duplicate detection
SELECT m.member_no, pr.name AS provider, c.service_from, COUNT(*) AS claims, SUM(c.total_billed) AS total_billed
FROM claim c JOIN member m ON m.id = c.member_id JOIN provider pr ON pr.id = c.provider_id
GROUP BY m.member_no, pr.name, c.service_from HAVING COUNT(*) > 1 ORDER BY claims DESC, total_billed DESC LIMIT 15`),
    query("high_cost", "High-cost claimants (Pareto)", "Members ranked by paid amount with cumulative share of all spend.", (d) => `
-- Who drives the cost? Cumulative share of paid dollars
WITH spend AS (SELECT member_id, SUM(total_paid) AS paid FROM claim GROUP BY member_id)
SELECT member_id, ${d.round("paid")} AS paid,
       ${d.round("100.0 * SUM(paid) OVER (ORDER BY paid DESC, member_id) / SUM(paid) OVER ()", 1)} AS cumulative_pct
FROM spend ORDER BY paid DESC, member_id LIMIT 20`),
    query("remittance_recon", "Remittance reconciliation", "Remittance batch totals against the paid lines of the claims they cover (should differ by 0).", (d) => `
-- Does each remittance batch equal the sum of its claims?
SELECT r.batch_ref, r.total_paid AS remitted, ${d.round("SUM(c.total_paid)")} AS claims_paid, ${d.round("r.total_paid - SUM(c.total_paid)")} AS difference
FROM remittance r JOIN claim c ON c.remittance_id = r.id GROUP BY r.batch_ref, r.total_paid ORDER BY r.batch_ref`),
    query("pa_approval", "Prior authorization outcomes", "Approval rate and decision time per procedure.", (d) => `
-- Prior authorization approval rate and turnaround
SELECT pc.code, pc.description, COUNT(*) AS requests,
       ${d.round("100.0 * SUM(CASE WHEN pa.status = 'approved' THEN 1 ELSE 0 END) / COUNT(*)", 1)} AS approved_pct,
       ${d.round("AVG(" + d.diffDays("pa.decided_on", "pa.requested_on") + ")", 1)} AS avg_days_to_decide
FROM prior_authorization pa JOIN procedure_code pc ON pc.id = pa.procedure_code_id GROUP BY pc.code, pc.description ORDER BY requests DESC`),
    query("paid_trend", "Paid amount trend", "Monthly paid amount with month-over-month change.", (d) => `
-- Spend trend
WITH m AS (SELECT ${d.ym("adjudicated_date")} AS month, SUM(total_paid) AS paid FROM claim WHERE adjudicated_date IS NOT NULL GROUP BY ${d.ym("adjudicated_date")})
SELECT month, ${d.round("paid")} AS paid, ${d.round("100.0 * (paid - LAG(paid) OVER (ORDER BY month)) / NULLIF(LAG(paid) OVER (ORDER BY month), 0)", 1)} AS mom_pct FROM m ORDER BY month`),
  ],
});
