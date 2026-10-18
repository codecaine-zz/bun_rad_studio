import { addDays, dayOf, dayStr } from "../gen";
import { COUNTRIES } from "../words";
import { dataset, query, table, view, type Row } from "../model";

const START = "2022-01-01";
const ASOF = "2025-06-30";
const dateOf = (v: unknown) => String(v).slice(0, 10);
const INDUSTRIES = ["software", "fintech", "healthcare", "retail", "media", "education", "logistics", "manufacturing", "energy", "nonprofit"];
const TAX: Record<string, number> = { US: 0.0725, CA: 0.05, GB: 0.2, DE: 0.19, FR: 0.2, ES: 0.21, NL: 0.21, SE: 0.25, IN: 0.18, AU: 0.1, PL: 0.23, IT: 0.22 };

const PLAN_ROWS: Row[] = [
  { code: "free", name: "Free", tier_rank: 0, description: "For evaluation and hobby projects." },
  { code: "starter", name: "Starter", tier_rank: 1, description: "Small teams getting started." },
  { code: "growth", name: "Growth", tier_rank: 2, description: "Growing teams with higher limits and SSO." },
  { code: "scale", name: "Scale", tier_rank: 3, description: "Advanced controls, audit log and priority support." },
  { code: "enterprise", name: "Enterprise", tier_rank: 4, description: "Custom limits, SLA and dedicated support." },
];
const BASE = [0, 29, 99, 299, 899];
const SEAT = [null, 5, 12, 25, 40];

function priceRows(): Row[] {
  const rows: Row[] = [];
  PLAN_ROWS.forEach((_, pi) => {
    for (const cur of pi === 0 ? ["USD"] : ["USD", "EUR"]) {
      for (const interval of ["month", "year"]) {
        const f = (cur === "EUR" ? 0.92 : 1) * (interval === "year" ? 10 : 1);
        rows.push({
          plan_id: pi + 1, currency: cur, billing_interval: interval,
          unit_amount: Math.round(BASE[pi]! * f * 100) / 100,
          seat_amount: SEAT[pi] == null ? null : Math.round(SEAT[pi]! * f * 100) / 100,
          effective_from: "2022-01-01", effective_to: null,
        });
      }
    }
  });
  return rows;
}

const FEATURES: [string, string, string][] = [
  ["api_access", "API access", "flag"], ["sso", "Single sign-on (SAML)", "flag"], ["audit_log", "Audit log", "flag"],
  ["priority_support", "Priority support", "flag"], ["custom_domain", "Custom domain", "flag"], ["webhooks", "Webhooks", "flag"],
  ["seats", "Included seats", "limit"], ["projects", "Projects", "limit"], ["api_calls", "API calls per month", "metered"],
  ["storage_gb", "Storage (GB)", "metered"], ["builds", "Build minutes per month", "metered"], ["retention_days", "Data retention (days)", "limit"],
];

const accountN: [number, number, number] = [100, 1200, 8000];
const subN: [number, number, number] = [150, 1800, 12000];
const invN: [number, number, number] = [450, 4500, 30000];

export default dataset({
  id: "saas_billing",
  title: "SaaS Subscription Billing",
  tagline: "Plans, subscriptions, usage metering, invoices, payments, dunning and MRR analytics.",
  description:
    "A subscription-business back office: a plan and price catalog (USD/EUR, monthly/annual), accounts and users, subscriptions with a trial-to-active-to-canceled lifecycle, " +
    "usage metering, invoices with line items, payments and refunds, dunning attempts, coupons and tax rates. Views compute MRR, invoice ageing and revenue by month; the example " +
    "queries build an MRR waterfall, cohort retention and payment-failure analysis. All data is synthetic.",
  tags: ["Finance", "SaaS", "Analytics"],
  asOf: ASOF,
  highlights: ["generated columns", "soft delete", "JSON details", "MRR / cohort analytics", "materialized view (PostgreSQL)"],
  tables: [
    table("plan", "Product plans customers can subscribe to.", [
      "id id", "code str(24) uq", "name str(60)", "tier_rank smallint", "description text", "is_public bool def:true",
      "created_at ts def:now", "updated_at ts upd",
    ], { rows: PLAN_ROWS }),
    table("plan_price", "Price points per plan, currency and billing interval; effective dating allows price changes.", [
      "id id", "plan_id int fk:plan", "currency char(3)", "billing_interval enum(month,year)", "unit_amount dec(10,2) # Base price per interval",
      "seat_amount dec(10,2) null # Additional price per seat per interval", "effective_from date", "effective_to date null",
    ], { all: () => priceRows(), n: 18, uq: [["plan_id", "currency", "billing_interval", "effective_from"]], ck: ["unit_amount >= 0"] }),
    table("feature", "Capabilities and limits that plans grant.", [
      "id id", "code str(40) uq", "name str(80)", "kind enum(flag,limit,metered)",
    ], { rows: FEATURES.map(([code, name, kind]) => ({ code, name, kind })) }),
    table("plan_feature", "Entitlements: which features each plan enables and the limit that applies.", [
      "plan_id int fk:plan", "feature_id int fk:feature", "enabled bool", "limit_value int null",
    ], {
      pk: ["plan_id", "feature_id"], n: 60,
      all: () => {
        const rows: Row[] = [];
        for (let p = 0; p < 5; p++) FEATURES.forEach(([code, , kind], f) => {
          const flagOn = kind === "flag" ? (code === "api_access" || code === "webhooks" ? p >= 1 : p >= (code === "sso" ? 2 : code === "audit_log" ? 3 : 2)) : true;
          const limits: Record<string, number[]> = { seats: [1, 5, 25, 100, 1000], projects: [2, 10, 50, 200, 5000], api_calls: [10000, 250000, 2000000, 20000000, 200000000], storage_gb: [1, 20, 100, 500, 5000], builds: [300, 3000, 15000, 60000, 400000], retention_days: [7, 30, 90, 365, 1095] };
          rows.push({ plan_id: p + 1, feature_id: f + 1, enabled: flagOn, limit_value: kind === "flag" ? null : limits[code]![p]! });
        });
        return rows;
      },
    }),
    table("meter", "Usage meters that are billed or tracked.", ["id id", "code str(40) uq", "name str(80)", "unit str(20)", "aggregation enum(sum,max,last)"], {
      rows: [
        { code: "api_calls", name: "API calls", unit: "calls", aggregation: "sum" },
        { code: "storage_gb", name: "Storage", unit: "GB", aggregation: "max" },
        { code: "builds", name: "Build minutes", unit: "minutes", aggregation: "sum" },
        { code: "seats_active", name: "Active seats", unit: "seats", aggregation: "last" },
      ],
    }),
    table("tax_rate", "Sales tax / VAT rates by country.", ["id id", "country char(2) uq", "label str(40)", "rate dec(5,4)", "valid_from date"], {
      rows: Object.entries(TAX).map(([country, rate]) => ({ country, label: country === "US" ? "Sales tax (average)" : "VAT / GST", rate, valid_from: "2022-01-01" })),
      ck: ["rate >= 0 AND rate < 1"],
    }),
    table("account", "Customer companies (tenants). Soft-deleted with deleted_at.", [
      "id id", "public_id uuid uq", "name str(120)", "legal_name str(160)", "industry str(30)", "country char(2)",
      "employee_band enum(1-10,11-50,51-200,201-1000,1000+)", "billing_email str(160)", "status enum(trial,active,suspended,closed)",
      "tax_id str(24) null", "created_at ts", "updated_at ts upd", "deleted_at ts null",
    ], {
      n: accountN, ix: ["status", "country"],
      gen: (g, i) => {
        const [country] = g.pickSkew(COUNTRIES, 1.7);
        const name = g.company();
        const created = dayStr(dayOf(START) + Math.floor(Math.pow(g.r(), 0.65) * (dayOf(ASOF) - dayOf(START) - 20)));
        const status = g.w([["active", 70], ["trial", 8], ["suspended", 4], ["closed", 18]] as const);
        return {
          public_id: g.uuid(), name, legal_name: `${name} ${g.pick(["Inc.", "LLC", "Ltd", "GmbH", "Corp."])}`, industry: g.pick(INDUSTRIES), country,
          employee_band: g.w([["1-10", 38], ["11-50", 30], ["51-200", 18], ["201-1000", 10], ["1000+", 4]] as const),
          billing_email: `billing${i}@${name.toLowerCase().replace(/[^a-z]/g, "")}.example`, status,
          tax_id: g.bool(0.4) ? `${country}${g.digits(9)}` : null, created_at: g.ts(created), updated_at: g.ts(created),
          deleted_at: status === "closed" ? g.ts(g.minDate(ASOF, addDays(created, g.int(30, 300)))) : null,
        };
      },
    }),
    table("account_user", "People who sign in to an account.", [
      "id id", "account_id int fk:account cascade", "email str(160) uq", "full_name str(120)", "role enum(owner,admin,member,billing)",
      "last_login_at ts null", "created_at ts",
    ], {
      n: [250, 3000, 20000], ix: ["account_id,role"],
      gen: (g, i) => {
        const acc = g.rows("account")[g.spread(g.count("account"), i) - 1]!;
        const f = g.first(), l = g.last();
        const created = dateOf(acc.created_at);
        return {
          account_id: acc.id, email: `${f}.${l}.${i}@${String(acc.billing_email).split("@")[1]}`.toLowerCase(), full_name: `${f} ${l}`,
          role: i <= g.count("account") ? "owner" : g.w([["admin", 15], ["member", 70], ["billing", 15]] as const),
          last_login_at: g.bool(0.9) ? g.ts(g.date(created, ASOF)) : null, created_at: g.ts(created),
        };
      },
    }),
    table("payment_method", "Stored payment instruments (tokenised; no real card data).", [
      "id id", "account_id int fk:account cascade", "kind enum(card,ach,wire,paypal)", "brand str(20) null", "last4 char(4) null",
      "exp_month smallint null", "exp_year smallint null", "is_default bool", "status enum(active,expired,removed)", "created_at ts",
    ], {
      n: [110, 1400, 9000], ck: ["exp_month IS NULL OR (exp_month BETWEEN 1 AND 12)"],
      gen: (g, i) => {
        const acc = g.rows("account")[g.spread(g.count("account"), i, 1.5) - 1]!;
        const kind = g.w([["card", 78], ["ach", 12], ["wire", 7], ["paypal", 3]] as const);
        const year = g.int(2024, 2029);
        return {
          account_id: acc.id, kind, brand: kind === "card" ? g.w([["visa", 50], ["mastercard", 32], ["amex", 14], ["discover", 4]] as const) : null,
          last4: kind === "card" || kind === "ach" ? g.digits(4) : null, exp_month: kind === "card" ? g.int(1, 12) : null, exp_year: kind === "card" ? year : null,
          is_default: i <= g.count("account"), status: kind === "card" && year < 2025 ? "expired" : g.w([["active", 92], ["removed", 8]] as const),
          created_at: g.ts(dateOf(acc.created_at)),
        };
      },
    }),
    table("coupon", "Discount codes.", [
      "id id", "code str(30) uq", "percent_off dec(5,2) null", "amount_off dec(10,2) null", "duration enum(once,repeating,forever)",
      "max_redemptions int null", "valid_until date null", "created_at ts def:now",
    ], {
      ck: ["percent_off IS NOT NULL OR amount_off IS NOT NULL"],
      rows: [
        { code: "WELCOME10", percent_off: 10, amount_off: null, duration: "once", max_redemptions: null, valid_until: null },
        { code: "ANNUAL15", percent_off: 15, amount_off: null, duration: "forever", max_redemptions: null, valid_until: null },
        { code: "STARTUP50", percent_off: 50, amount_off: null, duration: "repeating", max_redemptions: 500, valid_until: "2024-12-31" },
        { code: "PARTNER20", percent_off: 20, amount_off: null, duration: "forever", max_redemptions: 200, valid_until: null },
        { code: "SAVE25", percent_off: null, amount_off: 25, duration: "once", max_redemptions: 1000, valid_until: "2025-03-31" },
        { code: "SAVE100", percent_off: null, amount_off: 100, duration: "once", max_redemptions: 250, valid_until: "2025-12-31" },
        { code: "BLACKFRI", percent_off: 30, amount_off: null, duration: "once", max_redemptions: 400, valid_until: "2023-12-01" },
        { code: "EDU40", percent_off: 40, amount_off: null, duration: "forever", max_redemptions: null, valid_until: null },
        { code: "NONPROFIT25", percent_off: 25, amount_off: null, duration: "forever", max_redemptions: null, valid_until: null },
        { code: "WINBACK20", percent_off: 20, amount_off: null, duration: "repeating", max_redemptions: 300, valid_until: "2025-09-30" },
        { code: "LAUNCH", percent_off: 35, amount_off: null, duration: "once", max_redemptions: 100, valid_until: "2022-06-30" },
        { code: "REFER10", percent_off: 10, amount_off: null, duration: "repeating", max_redemptions: null, valid_until: null },
      ],
    }),
    table("subscription", "An account's subscription to a priced plan, with its lifecycle dates.", [
      "id id", "account_id int fk:account", "plan_price_id int fk:plan_price", "status enum(trialing,active,past_due,paused,canceled)",
      "quantity int # Seats", "started_at date", "trial_ends_on date null", "current_period_start date", "current_period_end date",
      "cancel_at_period_end bool def:false", "canceled_at date null", "cancel_reason enum(price,missing_feature,switched_competitor,no_longer_needed,payment_failure,other) null",
      "created_at ts def:now", "updated_at ts upd",
    ], {
      n: subN, ix: ["status", "account_id,status"], ck: ["quantity >= 1", "current_period_end > current_period_start"],
      gen: (g, i) => {
        const accs = g.rows("account");
        const acc = accs[g.spread(accs.length, i, 1.8) - 1]!;
        const prices = g.rows("plan_price");
        const pidx = g.w(prices.map((p, idx) => [idx, Number(p.plan_id) === 1 ? 14 : Number(p.plan_id) === 2 ? 26 : Number(p.plan_id) === 3 ? 28 : Number(p.plan_id) === 4 ? 16 : 6] as const)) ;
        const price = prices[pidx]!;
        const len = price.billing_interval === "year" ? 365 : 30;
        const created = dateOf(acc.created_at);
        let start = addDays(created, g.int(0, 40));
        if (start > ASOF) start = ASOF;
        const age = dayOf(ASOF) - dayOf(start);
        let status = age < 14 ? "trialing" : g.w([["active", 66], ["canceled", 22], ["past_due", 6], ["paused", 4], ["trialing", 2]] as const);
        if (status === "trialing" && age >= 14) status = "active";
        const canceled = status === "canceled";
        const canceledAt = canceled ? addDays(start, Math.max(15, Math.min(age, g.int(20, 700)))) : null;
        const ref = canceledAt && canceledAt < ASOF ? canceledAt : ASOF;
        const k = Math.floor((dayOf(ref) - dayOf(start)) / len);
        const cps = addDays(start, k * len);
        const seats = Number(price.plan_id) === 1 ? 1 : g.int(1, [0, 8, 30, 120, 600][Number(price.plan_id) - 1]!);
        return {
          account_id: acc.id, plan_price_id: pidx + 1, status, quantity: seats, started_at: start,
          trial_ends_on: Number(price.plan_id) > 1 ? addDays(start, 14) : null, current_period_start: cps, current_period_end: addDays(cps, len),
          cancel_at_period_end: status === "active" && g.bool(0.04), canceled_at: canceledAt,
          cancel_reason: canceled ? g.w([["price", 22], ["missing_feature", 18], ["switched_competitor", 20], ["no_longer_needed", 25], ["payment_failure", 10], ["other", 5]] as const) : null,
          created_at: g.ts(start), updated_at: g.ts(canceledAt ?? start),
          _price: price, _len: len,
        };
      },
    }),
    table("subscription_event", "Lifecycle events with their MRR impact (basis of the MRR waterfall).", [
      "id id", "subscription_id int fk:subscription cascade", "event_type enum(created,activated,upgraded,downgraded,seats_changed,paused,resumed,canceled,reactivated)",
      "occurred_at ts", "mrr_delta dec(12,2) # Change in monthly recurring revenue caused by the event", "details json null",
    ], {
      n: [350, 4000, 26000], ix: ["occurred_at", "event_type"],
      gen: (g, i) => {
        const subs = g.rows("subscription");
        const sidx = g.spread(subs.length, i, 1.4);
        const s = subs[sidx - 1]!;
        const price = s._price as Row;
        const monthly = (Number(price.unit_amount) + Number(price.seat_amount ?? 0) * Number(s.quantity)) / (price.billing_interval === "year" ? 12 : 1);
        const first = i <= subs.length;
        let type: string;
        if (first) type = "created";
        else type = g.w([["upgraded", 22], ["downgraded", 9], ["seats_changed", 34], ["paused", 6], ["resumed", 6], ["canceled", s.status === "canceled" ? 40 : 4], ["reactivated", 3]] as const);
        const day = first ? dateOf(s.started_at) : g.date(dateOf(s.started_at), s.canceled_at ? dateOf(s.canceled_at) : ASOF);
        const sign: Record<string, number> = { created: 1, upgraded: 0.35, downgraded: -0.2, seats_changed: 0.15, paused: -1, resumed: 1, canceled: -1, reactivated: 1, activated: 1 };
        const delta = type === "seats_changed" ? (g.bool(0.7) ? 1 : -1) * Math.abs(monthly) * 0.1 : monthly * (sign[type] ?? 0) * (type === "upgraded" || type === "downgraded" ? g.float(0.5, 1.2) : 1);
        return { subscription_id: s.id, event_type: type, occurred_at: g.ts(day), mrr_delta: g.round(delta), details: first ? { source: g.pick(["web", "sales", "partner", "self_serve"]), trial: Number(price.plan_id) > 1 } : null };
      },
    }),
    table("usage_record", "Daily metered usage per subscription and meter.", [
      "id id", "subscription_id int fk:subscription cascade", "meter_id int fk:meter", "usage_date date", "quantity dec(14,2)", "source enum(api,batch,import)",
    ], {
      n: [1000, 12000, 90000], ix: ["subscription_id,usage_date", "usage_date"],
      gen: (g, i) => {
        const subs = g.rows("subscription");
        const s = subs[g.spread(subs.length, i, 2.2) - 1]!;
        const meter = g.w([[1, 50], [2, 15], [3, 20], [4, 15]] as const);
        const seats = Number(s.quantity);
        const q = meter === 1 ? g.logNormal(800 * Math.sqrt(seats), 0.9) : meter === 2 ? g.float(0.1, 4 + seats * 0.5) : meter === 3 ? g.logNormal(40 * Math.sqrt(seats), 0.8) : seats * g.float(0.5, 1);
        return { subscription_id: s.id, meter_id: meter, usage_date: g.date(dateOf(s.started_at), s.canceled_at ? dateOf(s.canceled_at) : ASOF), quantity: g.round(q), source: g.w([["api", 80], ["batch", 15], ["import", 5]] as const) };
      },
    }),
    table("invoice", "Invoices raised per billing period. total is computed from subtotal, discount and tax.", [
      "id id", "invoice_number str(20) uq", "account_id int fk:account", "subscription_id int fk:subscription",
      "period_start date", "period_end date", "status enum(draft,open,paid,void,uncollectible)", "currency char(3)",
      "subtotal dec(12,2)", "discount_total dec(12,2) def:0", "tax_total dec(12,2) def:0", "total dec(12,2) = subtotal - discount_total + tax_total",
      "amount_paid dec(12,2) def:0", "issued_at date", "due_on date", "paid_at ts null", "created_at ts def:now",
    ], {
      n: invN, ix: ["status,due_on", "issued_at", "account_id,issued_at"], ck: ["subtotal >= 0", "period_end > period_start"],
      gen: (g, i) => {
        const subs = g.rows("subscription");
        const sidx = g.spread(subs.length, i, 1.5);
        const s = subs[sidx - 1]!;
        const counters = g.memo("k", () => new Map<number, number>());
        const k = counters.get(sidx) ?? 0;
        counters.set(sidx, k + 1);
        const len = Number(s._len);
        const maxK = Math.max(1, Math.floor(((s.canceled_at ? dayOf(dateOf(s.canceled_at)) : dayOf(ASOF)) - dayOf(dateOf(s.started_at))) / len) + 1);
        const ps = addDays(dateOf(s.started_at), (k % maxK) * len);
        const price = s._price as Row;
        const planAmt = Number(price.unit_amount);
        const extra = Number(price.seat_amount ?? 0) * Number(s.quantity) + (g.bool(0.25) ? g.money(30, 0.8) : 0);
        const subtotal = g.round(planAmt + extra);
        const accs = g.rows("account");
        const acc = accs[Number(s.account_id) - 1]!;
        const issued = ps > ASOF ? ASOF : ps;
        const due = addDays(issued, 14);
        const status = due > ASOF ? "open" : g.w([["paid", 90], ["void", 3], ["uncollectible", 3], ["open", 4]] as const);
        const discount = g.bool(0.12) ? g.round(subtotal * g.pick([0.1, 0.15, 0.2, 0.25])) : 0;
        const tax = g.round((subtotal - discount) * (TAX[String(acc.country)] ?? 0));
        const total = g.round(subtotal - discount + tax);
        return {
          invoice_number: `INV-${String(i).padStart(7, "0")}`, account_id: s.account_id, subscription_id: s.id, period_start: ps, period_end: addDays(ps, len),
          status, currency: price.currency, subtotal, discount_total: discount, tax_total: tax, amount_paid: status === "paid" ? total : 0, issued_at: issued, due_on: due,
          paid_at: status === "paid" ? g.ts(addDays(issued, g.int(0, 12) > dayOf(ASOF) - dayOf(issued) ? 0 : g.int(0, 12))) : null, created_at: g.ts(issued),
          _plan: planAmt, _extra: extra,
        };
      },
    }),
    table("invoice_line", "Two lines per invoice: the plan charge and seats / overage.", [
      "id id", "invoice_id int fk:invoice cascade", "line_type enum(plan,seats,usage_overage,discount,adjustment)", "description str(200)",
      "quantity dec(12,2)", "unit_amount dec(12,4)", "amount dec(12,2) = quantity * unit_amount",
    ], {
      n: (n) => n("invoice") * 2,
      gen: (g, i) => {
        const inv = g.rows("invoice")[Math.ceil(i / 2) - 1]!;
        if (i % 2 === 1) return { invoice_id: inv.id, line_type: "plan", description: "Subscription plan charge", quantity: 1, unit_amount: inv._plan as number };
        const extra = Number(inv._extra);
        return { invoice_id: inv.id, line_type: extra > 0 ? "seats" : "adjustment", description: extra > 0 ? "Additional seats and metered usage" : "No additional charges", quantity: 1, unit_amount: extra };
      },
    }),
    table("payment", "Payment attempts against invoices.", [
      "id id", "invoice_id int fk:invoice", "payment_method_id int fk:payment_method", "amount dec(12,2)", "currency char(3)",
      "status enum(succeeded,failed,refunded,pending)", "processor_ref str(40) uq", "failure_code str(30) null", "attempted_at ts", "created_at ts def:now",
    ], {
      n: [380, 4000, 27000], ix: ["status,attempted_at"],
      gen: (g, i) => {
        const invs = g.rows("invoice");
        const inv = invs[((i - 1) * 7919) % invs.length]!;
        const pms = g.memo("pm", () => {
          const m = new Map<number, number[]>();
          for (const p of g.rows("payment_method")) { const a = Number(p.account_id); (m.get(a) ?? m.set(a, []).get(a)!).push(Number(p.id)); }
          return m;
        });
        const list = pms.get(Number(inv.account_id));
        const pm = list ? g.pick(list) : g.fk(g.count("payment_method"));
        const status = inv.status === "paid" ? (g.bool(0.03) ? "refunded" : "succeeded") : inv.status === "open" ? g.pick(["pending", "failed"]) : "failed";
        return {
          invoice_id: inv.id, payment_method_id: pm, amount: g.round(Number(inv.subtotal) - Number(inv.discount_total) + Number(inv.tax_total)), currency: inv.currency, status,
          processor_ref: `ch_${g.hex(24)}`, failure_code: status === "failed" ? g.pick(["card_declined", "insufficient_funds", "expired_card", "do_not_honor", "processing_error"]) : null,
          attempted_at: g.ts(dateOf(inv.issued_at)), created_at: g.ts(dateOf(inv.issued_at)),
        };
      },
    }),
    table("credit_note", "Credits issued against invoices.", [
      "id id", "invoice_id int fk:invoice", "amount dec(12,2)", "reason enum(duplicate,fraudulent,service_issue,goodwill,proration)", "issued_at date",
    ], {
      n: [25, 300, 2000], ck: ["amount > 0"],
      gen: (g, i) => {
        const inv = g.rows("invoice")[((i - 1) * 104729) % g.count("invoice")]!;
        return { invoice_id: inv.id, amount: Math.max(0.5, g.round(Number(inv.subtotal) * g.float(0.1, 1))), reason: g.w([["service_issue", 35], ["goodwill", 25], ["proration", 25], ["duplicate", 10], ["fraudulent", 5]] as const), issued_at: dateOf(inv.issued_at) };
      },
    }),
    table("coupon_redemption", "Which subscription redeemed which coupon.", [
      "id id", "coupon_id int fk:coupon", "subscription_id int fk:subscription", "redeemed_at ts",
    ], {
      n: [40, 400, 2400], uq: [["coupon_id", "subscription_id"]],
      gen: (g, i) => {
        const s = g.rows("subscription")[i * 3 - 1] ?? g.rows("subscription")[i - 1]!;
        return { coupon_id: g.fkSkew(12, 1.5), subscription_id: s.id, redeemed_at: g.ts(dateOf(s.started_at)) };
      },
    }),
    table("dunning_attempt", "Retries of failed invoice payments.", [
      "id id", "invoice_id int fk:invoice cascade", "attempt_no smallint", "attempted_at ts", "outcome enum(retry_scheduled,paid,failed,gave_up)",
    ], {
      n: [40, 400, 3000], uq: [["invoice_id", "attempt_no"]],
      gen: (g, i) => {
        const inv = g.rows("invoice")[Math.ceil(i / 2) * 5 % g.count("invoice")]!;
        const no = ((i - 1) % 2) + 1;
        return { invoice_id: inv.id, attempt_no: no, attempted_at: g.ts(addDays(dateOf(inv.due_on), no * 3)), outcome: no === 1 ? g.w([["retry_scheduled", 55], ["paid", 40], ["failed", 5]] as const) : g.w([["paid", 45], ["gave_up", 40], ["failed", 15]] as const) };
      },
    }),
  ],
  views: [
    view("v_current_mrr", "Monthly recurring revenue of active subscriptions by plan and currency.", (d) => `
SELECT pl.name AS plan_name, pp.currency, COUNT(*) AS subscriptions, SUM(s.quantity) AS seats,
       ${d.round(`SUM((pp.unit_amount + COALESCE(pp.seat_amount, 0) * s.quantity) / CASE WHEN pp.billing_interval = 'year' THEN 12.0 ELSE 1.0 END)`)} AS mrr
FROM subscription s
JOIN plan_price pp ON pp.id = s.plan_price_id
JOIN plan pl ON pl.id = pp.plan_id
WHERE s.status IN ('active', 'past_due')
GROUP BY pl.name, pp.currency`),
    view("v_revenue_by_month", "Paid invoice revenue, tax and discounts per month and currency.", (d) => `
SELECT ${d.ym("issued_at")} AS month, currency, COUNT(*) AS invoices, SUM(subtotal) AS subtotal, SUM(discount_total) AS discounts, SUM(tax_total) AS tax, SUM(total) AS total
FROM invoice WHERE status = 'paid'
GROUP BY ${d.ym("issued_at")}, currency`),
    view("v_invoice_aging", "Unpaid invoices bucketed by days past due, as of the dataset reference date.", (d) => `
SELECT CASE WHEN ${d.diffDays(d.asOf, "due_on")} <= 0 THEN '0 current'
            WHEN ${d.diffDays(d.asOf, "due_on")} <= 30 THEN '1-30 days'
            WHEN ${d.diffDays(d.asOf, "due_on")} <= 60 THEN '31-60 days'
            WHEN ${d.diffDays(d.asOf, "due_on")} <= 90 THEN '61-90 days'
            ELSE '90+ days' END AS bucket,
       currency, COUNT(*) AS invoices, SUM(total) AS outstanding
FROM invoice WHERE status = 'open'
GROUP BY CASE WHEN ${d.diffDays(d.asOf, "due_on")} <= 0 THEN '0 current'
            WHEN ${d.diffDays(d.asOf, "due_on")} <= 30 THEN '1-30 days'
            WHEN ${d.diffDays(d.asOf, "due_on")} <= 60 THEN '31-60 days'
            WHEN ${d.diffDays(d.asOf, "due_on")} <= 90 THEN '61-90 days'
            ELSE '90+ days' END, currency`),
    view("v_account_overview", "One row per live account: users, subscriptions, open balance and lifetime revenue.", () => `
SELECT a.id AS account_id, a.name, a.country, a.status,
       (SELECT COUNT(*) FROM account_user u WHERE u.account_id = a.id) AS users,
       (SELECT COUNT(*) FROM subscription s WHERE s.account_id = a.id AND s.status IN ('active', 'past_due', 'trialing')) AS live_subscriptions,
       COALESCE((SELECT SUM(i.total) FROM invoice i WHERE i.account_id = a.id AND i.status = 'open'), 0) AS open_balance,
       COALESCE((SELECT SUM(i.total) FROM invoice i WHERE i.account_id = a.id AND i.status = 'paid'), 0) AS lifetime_revenue
FROM account a WHERE a.deleted_at IS NULL`),
    view("v_churn_by_month", "Cancellations per month and reason.", (d) => `
SELECT ${d.ym("canceled_at")} AS month, cancel_reason, COUNT(*) AS cancellations
FROM subscription WHERE status = 'canceled' AND canceled_at IS NOT NULL
GROUP BY ${d.ym("canceled_at")}, cancel_reason`),
    view("v_usage_last_30d", "Usage of the last 30 days before the reference date, per subscription and meter.", (d) => `
SELECT u.subscription_id, m.code AS meter, SUM(u.quantity) AS quantity, COUNT(*) AS days_with_usage
FROM usage_record u JOIN meter m ON m.id = u.meter_id
WHERE u.usage_date > ${d.addDays(d.asOf, -30)} AND u.usage_date <= ${d.asOf}
GROUP BY u.subscription_id, m.code`),
    view("v_failed_payments", "Failed payments with the invoice, account and failure code.", () => `
SELECT p.id AS payment_id, p.attempted_at, p.amount, p.currency, p.failure_code, i.invoice_number, a.name AS account_name
FROM payment p JOIN invoice i ON i.id = p.invoice_id JOIN account a ON a.id = i.account_id
WHERE p.status = 'failed'`),
    view("mv_monthly_revenue", "Monthly revenue by currency (a materialized view on PostgreSQL, a plain view elsewhere).", (d) => `
SELECT ${d.ym("issued_at")} AS month, currency, SUM(total) AS billed, SUM(amount_paid) AS collected
FROM invoice WHERE status <> 'draft' GROUP BY ${d.ym("issued_at")}, currency`, true),
  ],
  queries: [
    query("mrr_waterfall", "MRR waterfall by month", "New, expansion, contraction and churned MRR per month from the subscription event stream, with a running total.", (d) => `
-- MRR waterfall: how monthly recurring revenue moved each month
WITH monthly AS (
  SELECT ${d.ym("occurred_at")} AS month,
         SUM(CASE WHEN event_type IN ('created', 'reactivated', 'resumed') THEN mrr_delta ELSE 0 END) AS new_mrr,
         SUM(CASE WHEN event_type IN ('upgraded', 'seats_changed') AND mrr_delta > 0 THEN mrr_delta ELSE 0 END) AS expansion,
         SUM(CASE WHEN event_type IN ('downgraded', 'seats_changed') AND mrr_delta < 0 THEN mrr_delta ELSE 0 END) AS contraction,
         SUM(CASE WHEN event_type IN ('canceled', 'paused') THEN mrr_delta ELSE 0 END) AS churn
  FROM subscription_event
  GROUP BY ${d.ym("occurred_at")}
)
SELECT month, ${d.round("new_mrr")} AS new_mrr, ${d.round("expansion")} AS expansion, ${d.round("contraction")} AS contraction, ${d.round("churn")} AS churn,
       ${d.round("SUM(new_mrr + expansion + contraction + churn) OVER (ORDER BY month)")} AS net_mrr_running
FROM monthly ORDER BY month`),
    query("cohort_retention", "Signup cohort retention", "Subscriptions per start-month cohort and how many are still not canceled.", (d) => `
-- Cohort retention: share of each start-month cohort that is still subscribed
SELECT ${d.ym("started_at")} AS cohort, COUNT(*) AS subscriptions,
       SUM(CASE WHEN status <> 'canceled' THEN 1 ELSE 0 END) AS still_subscribed,
       ${d.round("100.0 * SUM(CASE WHEN status <> 'canceled' THEN 1 ELSE 0 END) / COUNT(*)", 1)} AS retention_pct
FROM subscription
GROUP BY ${d.ym("started_at")}
HAVING COUNT(*) >= 3
ORDER BY cohort`),
    query("top_accounts_share", "Top accounts and share of revenue", "Lifetime revenue per account with a running cumulative share (window functions).", (d) => `
-- Revenue concentration: who generates the revenue and how quickly it accumulates
WITH rev AS (
  SELECT a.id, a.name, a.country, SUM(i.total) AS revenue
  FROM account a JOIN invoice i ON i.account_id = a.id
  WHERE i.status = 'paid' AND i.currency = 'USD'
  GROUP BY a.id, a.name, a.country
)
SELECT name, country, ${d.round("revenue")} AS revenue,
       ${d.round("100.0 * revenue / SUM(revenue) OVER ()", 2)} AS pct_of_total,
       ${d.round("100.0 * SUM(revenue) OVER (ORDER BY revenue DESC, id) / SUM(revenue) OVER ()", 2)} AS cumulative_pct,
       RANK() OVER (ORDER BY revenue DESC) AS revenue_rank
FROM rev ORDER BY revenue DESC, id LIMIT 25`),
    query("dunning_effectiveness", "Dunning effectiveness", "Outcome of each retry attempt number across invoices.", () => `
-- Do retries recover revenue? Outcome by attempt number
SELECT attempt_no, outcome, COUNT(*) AS attempts,
       COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY attempt_no) AS pct_of_attempt
FROM dunning_attempt
GROUP BY attempt_no, outcome
ORDER BY attempt_no, attempts DESC`),
    query("payment_failures", "Payment failures by card brand", "Failure rate per payment-method brand and failure code.", (d) => `
-- Which payment methods fail most, and why
SELECT COALESCE(pm.brand, pm.kind) AS method, COUNT(*) AS attempts,
       SUM(CASE WHEN p.status = 'failed' THEN 1 ELSE 0 END) AS failed,
       ${d.round("100.0 * SUM(CASE WHEN p.status = 'failed' THEN 1 ELSE 0 END) / COUNT(*)", 1)} AS failure_pct
FROM payment p JOIN payment_method pm ON pm.id = p.payment_method_id
GROUP BY COALESCE(pm.brand, pm.kind)
ORDER BY failure_pct DESC`),
    query("usage_tiers", "Usage quartiles per plan", "Active subscriptions split into usage quartiles per plan (NTILE).", () => `
-- Heavy vs light users inside each plan, by API calls in the last 30 days
SELECT plan_name, quartile, COUNT(*) AS subscriptions, MIN(calls) AS min_calls, MAX(calls) AS max_calls
FROM (
  SELECT pl.name AS plan_name, v.subscription_id, v.quantity AS calls,
         NTILE(4) OVER (PARTITION BY pl.name ORDER BY v.quantity) AS quartile
  FROM v_usage_last_30d v
  JOIN subscription s ON s.id = v.subscription_id
  JOIN plan_price pp ON pp.id = s.plan_price_id
  JOIN plan pl ON pl.id = pp.plan_id
  WHERE v.meter = 'api_calls' AND s.status = 'active'
) t
GROUP BY plan_name, quartile
ORDER BY plan_name, quartile`),
    query("coupon_effect", "Coupon impact on invoices", "Average invoice value with and without a coupon, per coupon code.", (d) => `
-- Do coupon customers pay less per invoice? (joins coupon -> redemption -> subscription -> invoice)
SELECT c.code, COUNT(DISTINCT cr.subscription_id) AS redemptions, COUNT(i.id) AS invoices,
       ${d.round("AVG(i.subtotal)")} AS avg_subtotal, ${d.round("AVG(i.discount_total)")} AS avg_discount
FROM coupon c
JOIN coupon_redemption cr ON cr.coupon_id = c.id
JOIN subscription s ON s.id = cr.subscription_id
JOIN invoice i ON i.subscription_id = s.id
GROUP BY c.code
ORDER BY redemptions DESC`),
    query("aging_by_account", "Overdue balance per account", "Accounts ranked by overdue balance using the ageing view.", (d) => `
-- Collections worklist: overdue invoices per account, worst first
SELECT a.name, COUNT(*) AS overdue_invoices, ${d.round("SUM(i.total)")} AS overdue_total,
       MAX(${d.diffDays(d.asOf, "i.due_on")}) AS oldest_days_past_due,
       DENSE_RANK() OVER (ORDER BY SUM(i.total) DESC) AS priority
FROM invoice i JOIN account a ON a.id = i.account_id
WHERE i.status = 'open' AND i.due_on < ${d.asOf}
GROUP BY a.id, a.name
ORDER BY overdue_total DESC LIMIT 20`),
  ],
});
