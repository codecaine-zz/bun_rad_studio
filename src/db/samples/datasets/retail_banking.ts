import { addDays, dayOf, dayStr, hashString, ibanLike, mulberry32 } from "../gen";
import { dataset, query, table, view, type Scale } from "../model";

const ASOF = "2025-06-30";
const START = "2024-01-01";
const rr = (a: number, b: number) => { const r = mulberry32((a * 2654435761 + b * 40503) >>> 0); r(); return r(); };

const CFG: Record<Scale, { CUST: number; ACC: number; E: number }> = {
  small: { CUST: 120, ACC: 150, E: 500 },
  medium: { CUST: 1000, ACC: 1200, E: 5000 },
  large: { CUST: 6000, ACC: 8000, E: 30000 },
};
const GL: [string, string, string][] = [
  ["1000", "Cash and central bank balances", "asset"], ["1100", "Card settlement receivable", "asset"], ["2000", "Customer deposits (control)", "liability"],
  ["4000", "Fee income", "income"], ["5000", "Interest expense", "expense"], ["6000", "Operating expenses", "expense"],
];
const openedOn = (k: number) => dayStr(dayOf("2019-01-01") + Math.floor(rr(k, 7) * 2000));
interface Entry { type: string; day: string; debit: number; credit: number; amount: number; source: string; desc: string }
const plans = new Map<Scale, Entry[]>();
function entryPlan(scale: Scale): Entry[] {
  const hit = plans.get(scale);
  if (hit) return hit;
  const { ACC, E } = CFG[scale];
  const r = mulberry32(hashString(`bank:${scale}`));
  const out: Entry[] = [];
  const cust = (skew = 1.6) => 7 + Math.min(ACC - 1, Math.floor(ACC * Math.pow(r(), skew)));
  for (let i = 1; i <= E; i++) {
    if (i <= ACC) {
      out.push({ type: "opening_deposit", day: addDays(openedOn(i), 0) < START ? START : openedOn(i), debit: 1, credit: 6 + i, amount: Math.round(Math.exp(Math.log(2500) + 0.9 * (r() * 2 - 1) * 1.6) * 100) / 100, source: "branch", desc: "Opening deposit" });
      continue;
    }
    const x = r();
    const day = dayStr(dayOf(START) + Math.floor(r() * (dayOf(ASOF) - dayOf(START) + 1)));
    const amt = (m: number) => Math.round(m * Math.exp(0.9 * (r() * 2 - 1)) * 100) / 100;
    if (x < 0.25) out.push({ type: "deposit", day, debit: 1, credit: cust(), amount: amt(600), source: r() < 0.5 ? "branch" : "atm", desc: "Cash deposit" });
    else if (x < 0.5) out.push({ type: "withdrawal", day, debit: cust(), credit: 1, amount: amt(120), source: r() < 0.7 ? "atm" : "branch", desc: "Cash withdrawal" });
    else if (x < 0.8) { const a = cust(), b = cust(1.2); out.push({ type: "transfer", day, debit: a, credit: a === b ? 7 + ((b - 6) % ACC) : b, amount: amt(250), source: "online", desc: "Funds transfer" }); }
    else if (x < 0.88) out.push({ type: "fee", day, debit: cust(), credit: 4, amount: [2.5, 5, 12, 25, 35][Math.floor(r() * 5)]!, source: "batch", desc: "Account fee" });
    else if (x < 0.95) out.push({ type: "interest", day, debit: 5, credit: cust(1.1), amount: amt(8), source: "batch", desc: "Interest credited" });
    else out.push({ type: "card_settlement", day, debit: cust(), credit: 2, amount: amt(45), source: "card", desc: "Card purchase settlement" });
  }
  plans.set(scale, out);
  return out;
}

const MCC: [string, string][] = [["5411", "Grocery stores"], ["5812", "Restaurants"], ["5541", "Service stations"], ["5311", "Department stores"], ["4121", "Taxis and rideshare"], ["5732", "Electronics"], ["7832", "Cinemas"], ["5912", "Pharmacies"], ["4900", "Utilities"], ["5999", "Misc retail"], ["7995", "Gambling"], ["6011", "ATM cash"]];

export default dataset({
  id: "retail_banking",
  title: "Retail Banking and Double-Entry Ledger",
  tagline: "Customers, accounts, an immutable double-entry ledger, cards, fraud alerts and loans.",
  description:
    "A retail bank core: customers with KYC checks, accounts with IBAN-style numbers (valid mod-97 check digits), and a real double-entry ledger where every journal entry posts equal debits and credits " +
    "and posted rows are protected by triggers (no updates or deletes). Debit cards with Luhn-valid numbers (stored masked), merchants and card transactions with fraud scores and alerts, " +
    "loans with amortisation schedules, statements and FX rates. Views give balances, a trial balance and the balance check; example queries cover running balances, velocity checks and dormancy. All data is synthetic.",
  tags: ["Finance", "Banking", "Ledger"],
  asOf: ASOF,
  highlights: ["balanced journal entries", "immutable ledger triggers", "IBAN mod-97 + Luhn checks", "running balance window", "fraud velocity", "materialized view (PostgreSQL)"],
  tables: [
    table("branch", "Bank branches.", ["id id", "code str(8) uq", "name str(60)", "city str(40)", "state char(2)", "opened_on date"], {
      n: 12, gen: (g, i) => { const p = g.place(); return { code: `BR${String(i).padStart(3, "0")}`, name: `${p.city} ${g.pick(["Main", "Central", "Plaza", "Heights"])}`, city: p.city, state: p.state, opened_on: g.date("1995-01-01", "2022-01-01") }; },
    }),
    table("customer", "Bank customers (synthetic).", ["id id", "customer_no str(12) uq", "first_name str(40)", "last_name str(40)", "birth_date date", "email str(160) uq", "phone str(16)", "branch_id int fk:branch", "segment enum(mass,affluent,private,student)", "kyc_status enum(pending,verified,expired,rejected)", "risk_rating enum(low,medium,high)", "created_at ts", "updated_at ts upd", "closed_at ts null"], {
      n: [CFG.small.CUST, CFG.medium.CUST, CFG.large.CUST], ix: ["last_name,first_name", "kyc_status"],
      gen: (g, i) => { const f = g.first(), l = g.last(); const age = Math.round(g.clamp(g.normal(44, 15), 18, 92)); return { customer_no: `C${String(i).padStart(9, "0")}`, first_name: f, last_name: l, birth_date: dayStr(dayOf(ASOF) - age * 365 - g.int(0, 364)), email: `${f}.${l}${i}@bank-customer.example`.toLowerCase(), phone: g.phone(), branch_id: g.fkSkew(12, 1.4), segment: age < 25 ? "student" : g.w([["mass", 70], ["affluent", 24], ["private", 6]] as const), kyc_status: g.w([["verified", 90], ["pending", 4], ["expired", 5], ["rejected", 1]] as const), risk_rating: g.w([["low", 78], ["medium", 19], ["high", 3]] as const), created_at: g.ts(g.date("2018-06-01", "2025-05-01")), closed_at: g.bool(0.02) ? g.ts(g.date("2024-01-01", ASOF)) : null }; },
    }),
    table("kyc_check", "Identity and sanctions checks performed on customers.", ["id id", "customer_id int fk:customer cascade", "check_type enum(identity,address,sanctions,pep)", "result enum(pass,review,fail)", "checked_at ts", "provider str(30)"], {
      n: [150, 1500, 9000], gen: (g, i) => ({ customer_id: g.spread(g.count("customer"), i, 1.2), check_type: g.pick(["identity", "address", "sanctions", "pep"]), result: g.w([["pass", 92], ["review", 6], ["fail", 2]] as const), checked_at: g.tsBetween("2022-01-01", ASOF), provider: g.pick(["VerifyOne", "TrustCheck", "ClearID"]) }),
    }),
    table("account_type", "Product definitions.", ["id id", "code str(12) uq", "name str(40)", "monthly_fee dec(6,2)", "interest_rate_pct dec(5,3)", "overdraft_allowed bool"], {
      rows: [["CHK-BASIC", "Basic checking", 0, 0.01, false], ["CHK-PLUS", "Plus checking", 5, 0.05, true], ["SAV-STD", "Standard savings", 0, 1.5, false], ["SAV-HY", "High-yield savings", 0, 4.1, false], ["CHK-STU", "Student checking", 0, 0.01, false]].map(([code, name, monthly_fee, interest_rate_pct, overdraft_allowed]) => ({ code, name, monthly_fee, interest_rate_pct, overdraft_allowed })),
    }),
    table("account", "Customer accounts and internal general-ledger accounts (kind = gl, ids 1-6).", ["id id", "account_number str(34) uq # IBAN-style with valid mod-97 check digits", "kind enum(customer,gl)", "customer_id int fk:customer null", "account_type_id int fk:account_type null", "gl_code str(8) null", "name str(60)", "currency char(3) def:USD", "status enum(active,dormant,frozen,closed)", "opened_on date", "overdraft_limit dec(10,2) def:0", "updated_at ts upd"], {
      n: (n, s) => CFG[s].ACC + 6, ix: ["customer_id", "kind,status"],
      gen: (g, i) => {
        if (i <= 6) { const [code, name] = GL[i - 1]!; return { account_number: `GL-${code}`, kind: "gl", customer_id: null, account_type_id: null, gl_code: code, name, status: "active", opened_on: "2015-01-01", overdraft_limit: 0 }; }
        const k = i - 6; const type = g.w([[1, 38], [2, 14], [3, 30], [4, 12], [5, 6]] as const);
        return { account_number: ibanLike("GB", `BRAD${String(60000000 + k * 17).padStart(8, "0")}${String(10000000 + k * 3).slice(-8)}`), kind: "customer", customer_id: g.spread(g.count("customer"), k, 1.3), account_type_id: type, gl_code: null, name: ["Checking", "Plus checking", "Savings", "High-yield savings", "Student checking"][type - 1]!, status: g.w([["active", 91], ["dormant", 6], ["frozen", 1], ["closed", 2]] as const), opened_on: openedOn(k), overdraft_limit: type === 2 ? 500 : 0 };
      },
    }),
    table("journal_entry", "Double-entry journal entries; every entry has exactly two postings with equal debit and credit.", ["id id", "entry_ref str(14) uq", "entry_type enum(opening_deposit,deposit,withdrawal,transfer,fee,interest,card_settlement)", "posted_at ts", "value_date date", "description str(80)", "source enum(branch,atm,online,batch,card)"], {
      n: [CFG.small.E, CFG.medium.E, CFG.large.E], ix: ["posted_at", "entry_type"],
      gen: (g, i) => { const e = entryPlan(g.scale)[i - 1]!; return { entry_ref: `JE${String(i).padStart(11, "0")}`, entry_type: e.type, posted_at: g.ts(e.day, 6, 21), value_date: e.day, description: e.desc, source: e.source }; },
    }),
    table("posting", "Ledger lines. Immutable: triggers reject UPDATE and DELETE.", ["id id", "entry_id int fk:journal_entry", "account_id int fk:account", "debit dec(14,2) def:0", "credit dec(14,2) def:0"], {
      n: (n) => n("journal_entry") * 2, ix: ["account_id,entry_id"], ck: ["debit >= 0 AND credit >= 0", "(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)"],
      all: (g) => entryPlan(g.scale).flatMap((e, i) => [{ entry_id: i + 1, account_id: e.debit, debit: e.amount, credit: 0 }, { entry_id: i + 1, account_id: e.credit, debit: 0, credit: e.amount }]),
    }),
    table("card", "Debit cards (full numbers are never stored; the masked number came from a Luhn-valid PAN).", ["id id", "account_id int fk:account", "pan_masked str(19)", "network enum(visa,mastercard)", "expires_on date", "status enum(active,blocked,expired,lost)", "issued_on date"], {
      n: [150, 1200, 7000], ix: ["account_id"],
      gen: (g, i) => { const net = g.bool(0.6) ? "visa" : "mastercard"; const pan = g.luhn(net === "visa" ? "4" : "51", 16); return { account_id: 7 + ((i * 7) % (g.count("account") - 6)), pan_masked: `${pan.slice(0, 6)}******${pan.slice(-4)}`, network: net, expires_on: g.date("2025-09-01", "2029-12-31"), status: g.w([["active", 90], ["blocked", 4], ["expired", 3], ["lost", 3]] as const), issued_on: g.date("2020-01-01", "2024-12-31") }; },
    }),
    table("merchant", "Card acceptors with merchant category codes.", ["id id", "name str(80)", "mcc char(4)", "mcc_description str(40)", "country char(2)"], {
      n: [60, 300, 1200], ix: ["mcc"], gen: (g) => { const [mcc, d] = g.pickSkew(MCC, 1.2); return { name: g.company(), mcc, mcc_description: d, country: g.w([["US", 88], ["GB", 4], ["CA", 4], ["MX", 2], ["FR", 2]] as const) }; },
    }),
    table("card_transaction", "Authorised card transactions with a fraud score.", ["id id", "card_id int fk:card", "merchant_id int fk:merchant", "amount dec(10,2)", "currency char(3) def:USD", "authorized_at ts", "status enum(approved,declined,reversed)", "auth_code str(8) null", "fraud_score smallint", "country char(2)"], {
      n: [1000, 12000, 80000], ix: ["card_id,authorized_at", "fraud_score"], ck: ["fraud_score BETWEEN 0 AND 100"],
      gen: (g, i) => { const m = g.rows("merchant")[g.fkSkew(g.count("merchant"), 1.5) - 1]!; const odd = g.bool(0.012); const fs = odd ? g.int(70, 99) : Math.round(g.clamp(g.normal(9, 8), 0, 60)); const last = g.memo("last", () => ({ card: 1, ts: "" }));
      const burst = i % 18 === 0 && last.ts !== "";
      const card = burst ? last.card : g.fkSkew(g.count("card"), 1.4);
      const at = burst ? `${last.ts.slice(0, 14)}${String(g.int(0, 59)).padStart(2, "0")}:${String(g.int(0, 59)).padStart(2, "0")}` : g.tsBetween(START, ASOF);
      last.card = card; last.ts = at;
      return { card_id: card, merchant_id: m.id, amount: g.money(odd ? 900 : 38, 0.9), authorized_at: at, status: fs > 85 ? "declined" : g.w([["approved", 96], ["declined", 3], ["reversed", 1]] as const), auth_code: fs > 85 ? null : g.hex(6).toUpperCase(), fraud_score: fs, country: odd ? g.pick(["RO", "NG", "BR", "VN"]) : m.country }; },
    }),
    table("fraud_alert", "Alerts raised by rules and reviewed by analysts.", ["id id", "card_transaction_id int fk:card_transaction", "rule_code str(24)", "severity enum(low,medium,high)", "status enum(open,confirmed_fraud,false_positive)", "raised_at ts", "resolved_at ts null"], {
      n: [30, 300, 1800], ix: ["status,severity"],
      gen: (g, i) => { const tx = g.rows("card_transaction").filter((_, k) => k % 1 === 0); const t = g.rows("card_transaction")[Math.floor((i * 37) % tx.length)]!; const st = g.w([["open", 20], ["confirmed_fraud", 25], ["false_positive", 55]] as const); return { card_transaction_id: t.id, rule_code: g.pick(["HIGH_VELOCITY", "FOREIGN_COUNTRY", "LARGE_AMOUNT", "NEW_MERCHANT", "ATM_BURST"]), severity: Number(t.fraud_score) > 70 ? "high" : g.pick(["low", "medium"]), status: st, raised_at: t.authorized_at, resolved_at: st === "open" ? null : g.ts(g.shift(String(t.authorized_at), g.int(0, 4)).slice(0, 10)) }; },
    }),
    table("loan", "Consumer loans.", ["id id", "customer_id int fk:customer", "principal dec(12,2)", "annual_rate_pct dec(5,3)", "term_months smallint", "originated_on date", "status enum(current,delinquent,paid_off,charged_off)"], {
      n: [30, 300, 1500], ck: ["principal > 0"],
      gen: (g) => ({ customer_id: g.fkSkew(g.count("customer"), 1.3), principal: g.round(g.pick([2500, 5000, 10000, 15000, 25000, 40000]) * g.float(0.8, 1.2)), annual_rate_pct: g.round(g.normal(8.5, 2.4) + 2, 3), term_months: g.pick([12, 24, 36, 48, 60]), originated_on: g.date("2022-01-01", "2025-03-31"), status: g.w([["current", 82], ["delinquent", 9], ["paid_off", 7], ["charged_off", 2]] as const) }),
    }),
    table("loan_installment", "Amortisation schedule: one row per instalment (first 6 per loan).", ["id id", "loan_id int fk:loan cascade", "installment_no smallint", "due_on date", "principal_due dec(10,2)", "interest_due dec(10,2)", "paid_on date null"], {
      n: (n) => n("loan") * 6, uq: [["loan_id", "installment_no"]], ix: ["due_on"],
      gen: (g, i) => { const loan = g.rows("loan")[Math.ceil(i / 6) - 1]!; const k = ((i - 1) % 6) + 1; const P = Number(loan.principal), r = Number(loan.annual_rate_pct) / 1200, n = Number(loan.term_months); const pay = P * r / (1 - Math.pow(1 + r, -n)); const interest = g.round(P * r); const due = addDays(String(loan.originated_on), k * 30); const late = loan.status === "delinquent" && k >= 5; return { loan_id: loan.id, installment_no: k, due_on: due, principal_due: g.round(pay - interest), interest_due: interest, paid_on: due > ASOF || late ? null : addDays(due, g.int(-3, 4)) }; },
    }),
    table("statement", "Monthly statements; closing balance is computed.", ["id id", "account_id int fk:account", "period char(7)", "opening_balance dec(14,2)", "total_credits dec(14,2)", "total_debits dec(14,2)", "closing_balance dec(14,2) = opening_balance + total_credits - total_debits"], {
      n: (n) => (n("account") - 6) * 3, uq: [["account_id", "period"]],
      gen: (g, i) => { const k = ((i - 1) % (g.count("account") - 6)) + 7; const m = Math.floor((i - 1) / (g.count("account") - 6)); return { account_id: k, period: `2025-0${m + 3}`, opening_balance: g.money(2200, 1), total_credits: g.money(1800, 0.7), total_debits: g.money(1700, 0.7) }; },
    }),
    table("fx_rate", "Daily FX rates against USD.", ["id id", "rate_date date", "currency char(3)", "rate dec(10,6)"], {
      n: [90, 90, 360], uq: [["rate_date", "currency"]],
      gen: (g, i) => { const cur = ["EUR", "GBP", "JPY", "CAD"][(i - 1) % 4]!; const day = Math.floor((i - 1) / 4); const base = { EUR: 0.92, GBP: 0.79, JPY: 151, CAD: 1.36 }[cur]!; return { rate_date: addDays("2025-04-01", day), currency: cur, rate: g.round(base * (1 + 0.01 * Math.sin(day / 6) + g.float(-0.002, 0.002, 5)), 6) }; },
    }),
  ],
  triggers: {
    sqlite: [
      "CREATE TRIGGER trg_posting_no_update BEFORE UPDATE ON posting BEGIN SELECT RAISE(ABORT, 'ledger postings are immutable'); END",
      "CREATE TRIGGER trg_posting_no_delete BEFORE DELETE ON posting BEGIN SELECT RAISE(ABORT, 'ledger postings are immutable'); END",
      "CREATE TRIGGER trg_entry_no_update BEFORE UPDATE ON journal_entry BEGIN SELECT RAISE(ABORT, 'journal entries are immutable'); END",
    ],
    mysql: [
      "CREATE TRIGGER trg_posting_no_update BEFORE UPDATE ON posting FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ledger postings are immutable'",
      "CREATE TRIGGER trg_posting_no_delete BEFORE DELETE ON posting FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ledger postings are immutable'",
      "CREATE TRIGGER trg_entry_no_update BEFORE UPDATE ON journal_entry FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'journal entries are immutable'",
    ],
    postgres: [
      "CREATE FUNCTION ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'ledger rows are immutable'; END $fn$",
      "CREATE TRIGGER trg_posting_no_update BEFORE UPDATE OR DELETE ON posting FOR EACH ROW EXECUTE FUNCTION ledger_immutable()",
      "CREATE TRIGGER trg_entry_no_update BEFORE UPDATE ON journal_entry FOR EACH ROW EXECUTE FUNCTION ledger_immutable()",
    ],
    postgresFunctions: ["ledger_immutable()"],
  },
  views: [
    view("v_account_balances", "Balance of every customer account from the ledger (credits minus debits).", () => `
SELECT a.id AS account_id, a.account_number, c.customer_no, a.name AS product, a.status,
       COALESCE(SUM(p.credit), 0) - COALESCE(SUM(p.debit), 0) AS balance, COUNT(p.id) AS postings
FROM account a LEFT JOIN customer c ON c.id = a.customer_id LEFT JOIN posting p ON p.account_id = a.id
WHERE a.kind = 'customer'
GROUP BY a.id, a.account_number, c.customer_no, a.name, a.status`),
    view("v_trial_balance", "Trial balance of the general-ledger accounts.", () => `
SELECT a.gl_code, a.name, COALESCE(SUM(p.debit), 0) AS total_debits, COALESCE(SUM(p.credit), 0) AS total_credits,
       COALESCE(SUM(p.debit), 0) - COALESCE(SUM(p.credit), 0) AS net_debit
FROM account a LEFT JOIN posting p ON p.account_id = a.id WHERE a.kind = 'gl' GROUP BY a.gl_code, a.name`),
    view("v_entry_balance_check", "Debits versus credits per entry; every row must show difference 0.", () => `
SELECT entry_id, SUM(debit) AS debits, SUM(credit) AS credits, SUM(debit) - SUM(credit) AS difference
FROM posting GROUP BY entry_id`),
    view("v_daily_cash_flow", "Money in and out of customer accounts per day.", (d) => `
SELECT je.value_date, SUM(CASE WHEN a.kind = 'customer' THEN p.credit ELSE 0 END) AS inflow,
       SUM(CASE WHEN a.kind = 'customer' THEN p.debit ELSE 0 END) AS outflow
FROM posting p JOIN journal_entry je ON je.id = p.entry_id JOIN account a ON a.id = p.account_id
GROUP BY je.value_date`),
    view("v_open_fraud_alerts", "Unresolved alerts with card and merchant.", () => `
SELECT fa.id AS alert_id, fa.severity, fa.rule_code, fa.raised_at, ct.amount, ct.fraud_score, m.name AS merchant, ct.country
FROM fraud_alert fa JOIN card_transaction ct ON ct.id = fa.card_transaction_id JOIN merchant m ON m.id = ct.merchant_id
WHERE fa.status = 'open'`),
    view("v_loan_portfolio", "Outstanding principal and overdue instalments per loan.", (d) => `
SELECT l.id AS loan_id, l.customer_id, l.status, l.principal,
       SUM(CASE WHEN i.paid_on IS NULL THEN i.principal_due ELSE 0 END) AS unpaid_principal,
       SUM(CASE WHEN i.paid_on IS NULL AND i.due_on < ${d.asOf} THEN 1 ELSE 0 END) AS overdue_installments
FROM loan l JOIN loan_installment i ON i.loan_id = l.id GROUP BY l.id, l.customer_id, l.status, l.principal`),
    view("mv_daily_postings", "Posting volume per day (a materialized view on PostgreSQL).", () => `
SELECT je.value_date, COUNT(*) AS postings, SUM(p.debit) AS total_debits FROM posting p JOIN journal_entry je ON je.id = p.entry_id GROUP BY je.value_date`, true),
  ],
  queries: [
    query("running_balance", "Running balance of the busiest account", "Account statement with a running balance (window SUM over the ledger).", () => `
-- Statement with running balance for the account with the most postings
SELECT je.value_date, je.description, p.debit, p.credit,
       SUM(p.credit - p.debit) OVER (ORDER BY je.value_date, p.id) AS running_balance
FROM posting p JOIN journal_entry je ON je.id = p.entry_id
WHERE p.account_id = (SELECT account_id FROM v_account_balances ORDER BY postings DESC, account_id LIMIT 1)
ORDER BY je.value_date, p.id LIMIT 30`),
    query("ledger_integrity", "Ledger integrity check", "Proves the ledger balances: total debits equal total credits, entry by entry and overall.", () => `
-- Every entry must balance; the number of unbalanced entries must be 0
SELECT COUNT(*) AS entries, SUM(CASE WHEN difference <> 0 THEN 1 ELSE 0 END) AS unbalanced_entries, SUM(debits) AS total_debits, SUM(credits) AS total_credits
FROM v_entry_balance_check`),
    query("top_mcc", "Spend by merchant category", "Card spend and decline rate by MCC (joins card, merchant, transaction).", (d) => `
-- Where do customers spend with their cards?
SELECT m.mcc, m.mcc_description, COUNT(*) AS transactions, ${d.round("SUM(ct.amount)")} AS spend,
       ${d.round("100.0 * SUM(CASE WHEN ct.status = 'declined' THEN 1 ELSE 0 END) / COUNT(*)", 1)} AS decline_pct
FROM card_transaction ct JOIN merchant m ON m.id = ct.merchant_id JOIN card c ON c.id = ct.card_id
GROUP BY m.mcc, m.mcc_description ORDER BY spend DESC`),
    query("velocity", "Card velocity", "Cards with the most transactions inside a single hour (possible card testing).", (d) => `
-- Velocity check: many authorisations within the same hour
SELECT card_id, ${d.dateOf("authorized_at")} AS day, ${d.hour("authorized_at")} AS hour, COUNT(*) AS transactions, ${d.round("SUM(amount)")} AS total
FROM card_transaction
GROUP BY card_id, ${d.dateOf("authorized_at")}, ${d.hour("authorized_at")}
HAVING COUNT(*) >= 2 ORDER BY transactions DESC, total DESC, card_id LIMIT 15`),
    query("dormant", "Dormant accounts", "Open accounts with no ledger activity in the last 90 days (NOT EXISTS).", (d) => `
-- Dormancy sweep
SELECT a.account_number, a.name, a.opened_on
FROM account a
WHERE a.kind = 'customer' AND a.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM posting p JOIN journal_entry je ON je.id = p.entry_id WHERE p.account_id = a.id AND je.value_date > ${d.addDays(d.asOf, -90)})
ORDER BY a.opened_on LIMIT 20`),
    query("loan_delinquency", "Loan delinquency buckets", "Overdue loans grouped by number of missed instalments.", (d) => `
-- Delinquency buckets
SELECT overdue_installments AS missed, COUNT(*) AS loans, ${d.round("SUM(unpaid_principal)")} AS unpaid_principal
FROM v_loan_portfolio GROUP BY overdue_installments ORDER BY missed`),
    query("net_flow", "Monthly net inflow", "Customer money in, out and net by month with the change from the previous month.", (d) => `
-- Net flow of customer money by month
WITH m AS (SELECT ${d.ym("value_date")} AS month, SUM(inflow) AS inflow, SUM(outflow) AS outflow FROM v_daily_cash_flow GROUP BY ${d.ym("value_date")})
SELECT month, ${d.round("inflow")} AS inflow, ${d.round("outflow")} AS outflow, ${d.round("inflow - outflow")} AS net,
       ${d.round("(inflow - outflow) - LAG(inflow - outflow) OVER (ORDER BY month)")} AS change_vs_prior
FROM m ORDER BY month`),
    query("alert_precision", "Fraud rule precision", "How often each rule's alerts turned out to be real fraud.", (d) => `
-- Rule effectiveness: confirmed fraud vs false positives
SELECT rule_code, COUNT(*) AS alerts, SUM(CASE WHEN status = 'confirmed_fraud' THEN 1 ELSE 0 END) AS confirmed,
       SUM(CASE WHEN status = 'false_positive' THEN 1 ELSE 0 END) AS false_positives,
       ${d.round("100.0 * SUM(CASE WHEN status = 'confirmed_fraud' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN status <> 'open' THEN 1 ELSE 0 END), 0)", 1)} AS precision_pct
FROM fraud_alert GROUP BY rule_code ORDER BY alerts DESC`),
    query("multi_product", "Customers with several products", "Customers who hold three or more accounts or a loan (HAVING over a join).", () => `
-- Cross-sell candidates and relationship depth
SELECT c.customer_no, c.segment, COUNT(DISTINCT a.id) AS accounts, COUNT(DISTINCT l.id) AS loans
FROM customer c LEFT JOIN account a ON a.customer_id = c.id LEFT JOIN loan l ON l.customer_id = c.id
GROUP BY c.customer_no, c.segment HAVING COUNT(DISTINCT a.id) + COUNT(DISTINCT l.id) >= 2
ORDER BY accounts DESC, loans DESC, c.customer_no LIMIT 20`),
  ],
});
