import { addDays, dayOf, dayStr } from "../gen";
import { COMPANY_A, COMPANY_B } from "../words";
import { dataset, query, table, view } from "../model";

const ASOF = "2025-06-30";
const START = "2024-07-01";
const dOf = (v: unknown) => String(v).slice(0, 10);
const CATS = ["Beverages", "Snacks", "Canned goods", "Dairy", "Frozen", "Household", "Personal care", "Pet supplies", "Bakery", "Produce", "Hardware", "Office"];
const UOM = ["each", "case", "pallet"];

export default dataset({
  id: "wms_supply_chain",
  title: "Warehouse, Inventory and Supply Chain",
  tagline: "Suppliers, purchase orders, receiving, lots with expiry, bin stock, pick tasks, shipments and cycle counts.",
  description:
    "A distribution-centre WMS: suppliers and their lead times, purchase orders with receipts, product lots with expiry dates, stock by bin location, a stock-movement ledger, sales orders with " +
    "pick tasks and shipments, carriers, cycle counts with a computed variance and reorder policies. Views and queries cover ABC velocity classes, expiring lots, open PO ageing, " +
    "fill rate and supplier on-time-in-full. All data is synthetic.",
  tags: ["Logistics", "Inventory", "Operations"],
  asOf: ASOF,
  highlights: ["ABC classification (window)", "lot expiry", "OTIF", "cycle-count variance", "stock-movement ledger"],
  tables: [
    table("supplier", "Vendors.", ["id id", "code str(10) uq", "name str(80)", "country char(2)", "payment_terms enum(net15,net30,net45,net60)", "rating dec(2,1)", "is_active bool def:true"], {
      n: [14, 50, 150], gen: (g, i) => ({ code: `SUP${String(i).padStart(5, "0")}`, name: g.company(), country: g.w([["US", 60], ["MX", 10], ["CN", 12], ["DE", 8], ["IN", 10]] as const), payment_terms: g.pick(["net15", "net30", "net30", "net45", "net60"]), rating: g.round(g.clamp(g.normal(4.1, 0.5), 2, 5), 1), is_active: g.bool(0.95) }),
    }),
    table("warehouse", "Distribution centres.", ["id id", "code str(8) uq", "name str(40)", "city str(40)", "state char(2)"], { rows: [{ code: "DC-ATL", name: "Atlanta DC", city: "Atlanta", state: "GA" }, { code: "DC-DAL", name: "Dallas DC", city: "Dallas", state: "TX" }, { code: "DC-RNO", name: "Reno DC", city: "Reno", state: "NV" }] }),
    table("location", "Storage bins.", ["id id", "warehouse_id int fk:warehouse", "zone char(1)", "aisle smallint", "bay smallint", "level smallint", "bin_code str(14) uq", "location_type enum(pick,reserve,receiving,shipping)", "max_weight_kg int"], {
      n: [90, 400, 1500], ix: ["warehouse_id,zone"],
      gen: (g, i) => { const wh = ((i - 1) % 3) + 1; const zone = "ABCD"[Math.floor((i - 1) / 3) % 4]!; const aisle = Math.floor((i - 1) / 12) % 30 + 1; const bay = (i % 12) + 1; const level = (i % 4) + 1; return { warehouse_id: wh, zone, aisle, bay, level, bin_code: `W${wh}-${zone}${String(aisle).padStart(2, "0")}-${String(i).padStart(5, "0")}`, location_type: level === 1 ? "pick" : g.pick(["reserve", "reserve", "pick"]), max_weight_kg: g.pick([250, 500, 1000]) }; },
    }),
    table("product", "Stock-keeping units.", ["id id", "sku str(16) uq", "name str(100)", "category str(30)", "uom enum(each,case,pallet)", "unit_weight_kg dec(8,3)", "unit_cost dec(10,2)", "shelf_life_days int null", "abc_class char(1)", "is_active bool def:true"], {
      n: [80, 400, 1500], ix: ["category"],
      gen: (g, i) => { const cat = CATS[(i * 7) % CATS.length]!; const perish = ["Dairy", "Bakery", "Produce", "Frozen", "Beverages"].includes(cat); return { sku: `SKU${String(i).padStart(6, "0")}`, name: `${COMPANY_A[(i * 5) % COMPANY_A.length]} ${cat} ${COMPANY_B[(i * 3) % COMPANY_B.length]}`.slice(0, 98), category: cat, uom: g.w([["each", 55], ["case", 40], ["pallet", 5]] as const), unit_weight_kg: g.round(g.logNormal(1.2, 0.9), 3), unit_cost: g.money(9, 0.9), shelf_life_days: perish ? g.pick([14, 30, 60, 120, 180]) : null, abc_class: i <= g.n * 0.15 ? "A" : i <= g.n * 0.5 ? "B" : "C", is_active: g.bool(0.96) }; },
    }),
    table("supplier_product", "Which supplier delivers which product, at what lead time and price.", ["id id", "supplier_id int fk:supplier", "product_id int fk:product cascade", "lead_time_days smallint", "min_order_qty int", "unit_price dec(10,2)", "is_preferred bool"], {
      n: (n) => n("product") * 2, uq: [["supplier_id", "product_id"]],
      gen: (g, i) => { const p = Math.ceil(i / 2); const S = g.count("supplier"); return { supplier_id: i % 2 ? ((p * 3) % S) + 1 : ((p * 3 + 5) % S) + 1, product_id: p, lead_time_days: Math.round(g.logNormal(9, 0.5)), min_order_qty: g.pick([6, 12, 24, 48, 100]), unit_price: g.money(7, 0.8), is_preferred: i % 2 === 1 }; },
    }),
    table("purchase_order", "Purchase orders; the first 80% are received, the rest are open or cancelled.", ["id id", "po_number str(12) uq", "supplier_id int fk:supplier", "warehouse_id int fk:warehouse", "status enum(open,partial,received,cancelled)", "ordered_on date", "expected_on date", "received_on date null"], {
      n: [60, 500, 3000], ix: ["status,expected_on"],
      gen: (g, i) => { const N = g.count("supplier"); const frac = i / (g.scale === "small" ? 60 : g.scale === "medium" ? 500 : 3000); const ordered = dayStr(dayOf(START) + Math.floor(frac * (dayOf(ASOF) - dayOf(START) - 5))); const lead = g.int(5, 21); const expected = addDays(ordered, lead); const done = expected < addDays(ASOF, -3); const status = done ? (g.bool(0.04) ? "cancelled" : g.bool(0.1) ? "partial" : "received") : "open"; return { po_number: `PO${String(i).padStart(9, "0")}`, supplier_id: g.fkSkew(N, 1.4), warehouse_id: g.int(1, 3), status, ordered_on: ordered, expected_on: expected, received_on: status === "received" || status === "partial" ? addDays(expected, g.w([[0, 50], [1, 20], [2, 12], [4, 10], [7, 8]] as const)) : null }; },
    }),
    table("po_line", "Ordered products per purchase order.", ["id id", "po_id int fk:purchase_order cascade", "product_id int fk:product", "qty_ordered int", "qty_received int def:0", "unit_cost dec(10,2)"], {
      n: [180, 1600, 10000], ix: ["po_id", "product_id"], ck: ["qty_ordered > 0", "qty_received >= 0"],
      gen: (g, i) => { const po = g.rows("purchase_order")[g.spread(g.count("purchase_order"), i, 1.2) - 1]!; const q = g.pick([12, 24, 48, 96, 240, 480]); const got = po.status === "received" ? (g.bool(0.9) ? q : Math.round(q * g.float(0.7, 0.99, 2))) : po.status === "partial" ? Math.round(q * g.float(0.3, 0.8, 2)) : 0; return { po_id: po.id, product_id: g.fkSkew(g.count("product"), 1.5), qty_ordered: q, qty_received: got, unit_cost: g.money(7, 0.8) }; },
    }),
    table("goods_receipt", "Receiving documents for received purchase orders.", ["id id", "po_id int fk:purchase_order", "received_at ts", "dock_door smallint", "received_by str(40)"], {
      n: (n) => Math.floor(n("purchase_order") * 0.8), uq: [["po_id"]],
      gen: (g, i) => { const po = g.rows("purchase_order")[i - 1]!; return { po_id: po.id, received_at: g.ts(po.received_on ? dOf(po.received_on) : dOf(po.expected_on), 6, 16), dock_door: g.int(1, 12), received_by: `${g.first()} ${g.last()}` }; },
    }),
    table("inventory_lot", "Lots (batches) with receipt and expiry dates.", ["id id", "product_id int fk:product", "lot_no str(16) uq", "received_on date", "expires_on date null", "supplier_id int fk:supplier", "status enum(available,quarantine,expired,recalled)"], {
      n: [150, 1500, 9000], ix: ["expires_on"],
      gen: (g, i) => { const p = g.rows("product")[g.fkSkew(g.count("product"), 1.3) - 1]!; const rec = g.date("2024-06-01", ASOF); const exp = p.shelf_life_days ? addDays(rec, Number(p.shelf_life_days)) : null; return { product_id: p.id, lot_no: `L${g.hex(4).toUpperCase()}-${String(i).padStart(6, "0")}`, received_on: rec, expires_on: exp, supplier_id: g.fkSkew(g.count("supplier"), 1.4), status: exp && exp < ASOF ? "expired" : g.w([["available", 95], ["quarantine", 4], ["recalled", 1]] as const) }; },
    }),
    table("stock", "On-hand quantity per bin and lot (a snapshot as of the reference date).", ["id id", "location_id int fk:location", "lot_id int fk:inventory_lot", "product_id int fk:product", "qty_on_hand int", "qty_allocated int def:0", "updated_at ts upd"], {
      n: [260, 3200, 20000], uq: [["location_id", "lot_id"]], ck: ["qty_on_hand >= 0", "qty_allocated >= 0 AND qty_allocated <= qty_on_hand"],
      gen: (g, i) => { const L = g.count("inventory_lot"); const l = ((i - 1) % L) + 1; const c = Math.floor((i - 1) / L); const lot = g.rows("inventory_lot")[l - 1]!; const q = Math.round(g.logNormal(60, 0.9)); return { location_id: ((l * 13 + c * 17) % g.count("location")) + 1, lot_id: l, product_id: lot.product_id, qty_on_hand: q, qty_allocated: Math.min(q, g.int(0, Math.ceil(q * 0.4))) }; },
    }),
    table("picker", "Warehouse associates.", ["id id", "employee_no str(8) uq", "name str(60)", "shift enum(day,swing,night)", "hired_on date"], { n: [8, 20, 60], gen: (g, i) => ({ employee_no: `W${String(i).padStart(6, "0")}`, name: `${g.first()} ${g.last()}`, shift: g.pick(["day", "day", "swing", "night"]), hired_on: g.date("2015-01-01", "2025-01-01") }) }),
    table("carrier", "Freight and parcel carriers.", ["id id", "code str(8) uq", "name str(40)", "mode enum(parcel,ltl,ftl)"], { rows: [{ code: "UPS", name: "United Parcel", mode: "parcel" }, { code: "FDX", name: "Federal Express", mode: "parcel" }, { code: "XPO", name: "XPO Logistics", mode: "ltl" }, { code: "SAIA", name: "Saia Freight", mode: "ltl" }, { code: "JBH", name: "J.B. Hunt", mode: "ftl" }] }),
    table("customer_order", "Outbound orders from store customers.", ["id id", "order_no str(12) uq", "customer_name str(80)", "warehouse_id int fk:warehouse", "status enum(open,picking,shipped,backordered,cancelled)", "ordered_at ts", "required_by date", "priority enum(standard,rush)"], {
      n: [120, 1500, 9000], ix: ["status,required_by"],
      gen: (g, i) => { const day = g.date(START, ASOF); const recent = day > addDays(ASOF, -3); return { order_no: `SO${String(i).padStart(9, "0")}`, customer_name: g.company(), warehouse_id: g.int(1, 3), status: recent ? g.pick(["open", "picking"]) : g.w([["shipped", 90], ["backordered", 6], ["cancelled", 4]] as const), ordered_at: g.ts(day, 6, 18), required_by: addDays(day, g.int(2, 7)), priority: g.w([["standard", 88], ["rush", 12]] as const) }; },
    }),
    table("order_line", "Ordered, allocated and shipped quantities per line.", ["id id", "order_id int fk:customer_order cascade", "product_id int fk:product", "qty_ordered int", "qty_shipped int def:0"], {
      n: [350, 4500, 28000], ix: ["order_id", "product_id"],
      gen: (g, i) => { const o = g.rows("customer_order")[g.spread(g.count("customer_order"), i, 1.2) - 1]!; const q = g.pick([1, 2, 6, 12, 24, 48]); const full = g.bool(0.94); return { order_id: o.id, product_id: g.fkSkew(g.count("product"), 1.8), qty_ordered: q, qty_shipped: o.status === "shipped" ? (full ? q : Math.floor(q * 0.5)) : 0 }; },
    }),
    table("pick_task", "Pick tasks generated for order lines.", ["id id", "order_line_id int fk:order_line", "picker_id int fk:picker", "location_id int fk:location", "qty_picked int", "started_at ts", "completed_at ts null", "status enum(open,done,short)"], {
      n: [300, 4000, 25000], ix: ["picker_id,started_at"],
      gen: (g, i) => { const l = g.rows("order_line")[i - 1]!; const o = g.rows("customer_order")[Number(l.order_id) - 1]!; const start = g.ts(dOf(o.ordered_at), 7, 20); const mins = Math.max(1, Math.round(g.logNormal(5, 0.6))); const done = o.status === "shipped"; return { order_line_id: l.id, picker_id: g.fkSkew(g.count("picker"), 1.3), location_id: g.fkSkew(g.count("location"), 1.3), qty_picked: done ? l.qty_shipped : 0, started_at: start, completed_at: done ? new Date(Date.parse(`${start.replace(" ", "T")}Z`) + mins * 60000).toISOString().slice(0, 19).replace("T", " ") : null, status: done ? (Number(l.qty_shipped) < Number(l.qty_ordered) ? "short" : "done") : "open" }; },
    }),
    table("shipment", "Outbound shipments.", ["id id", "order_id int fk:customer_order", "carrier_id int fk:carrier", "tracking_no str(20) uq", "shipped_at ts", "delivered_on date null", "weight_kg dec(10,2)"], {
      n: (n) => Math.floor(n("customer_order") * 0.85), uq: [["order_id"]],
      gen: (g, i) => { const o = g.rows("customer_order")[i - 1]!; return { order_id: o.id, carrier_id: g.fkSkew(5, 1.2), tracking_no: `TRK${g.digits(14)}`, shipped_at: g.ts(dOf(o.ordered_at), 12, 20), delivered_on: g.bool(0.9) ? addDays(dOf(o.ordered_at), g.int(2, 8)) : null, weight_kg: g.money(120, 1) }; },
    }),
    table("stock_movement", "Ledger of every stock movement (recent activity).", ["id id", "product_id int fk:product", "from_location_id int fk:location null", "to_location_id int fk:location null", "movement_type enum(receipt,putaway,pick,transfer,adjustment,cycle_count)", "qty int", "moved_at ts", "reference str(20) null"], {
      n: [800, 10000, 90000], ix: ["product_id,moved_at", "movement_type,moved_at"],
      gen: (g) => { const t = g.w([["pick", 40], ["putaway", 22], ["receipt", 18], ["transfer", 12], ["adjustment", 5], ["cycle_count", 3]] as const); const L = g.count("location"); return { product_id: g.fkSkew(g.count("product"), 1.7), from_location_id: t === "putaway" || t === "pick" || t === "transfer" ? g.fk(L) : null, to_location_id: t === "receipt" || t === "putaway" || t === "transfer" ? g.fk(L) : null, movement_type: t, qty: t === "pick" ? -g.pick([1, 2, 6, 12, 24]) : g.pick([6, 12, 24, 48, 96]), moved_at: g.tsBetween(START, ASOF), reference: g.bool(0.7) ? `REF${g.digits(8)}` : null }; },
    }),
    table("cycle_count", "Counted versus system quantity; variance is computed.", ["id id", "location_id int fk:location", "product_id int fk:product", "counted_on date", "system_qty int", "counted_qty int", "variance int = counted_qty - system_qty", "counted_by int fk:picker"], {
      n: [60, 500, 3000], gen: (g) => { const sys = Math.round(g.logNormal(50, 0.8)); return { location_id: g.fkSkew(g.count("location"), 1.2), product_id: g.fkSkew(g.count("product"), 1.5), counted_on: g.date("2025-01-01", ASOF), system_qty: sys, counted_qty: Math.max(0, sys + (g.bool(0.7) ? 0 : g.int(-6, 4))), counted_by: g.fkSkew(g.count("picker"), 1.2) }; },
    }),
    table("reorder_policy", "Reorder point and safety stock per product and warehouse.", ["id id", "product_id int fk:product cascade", "warehouse_id int fk:warehouse", "reorder_point int", "safety_stock int", "target_days_cover smallint"], {
      n: (n) => n("product"), uq: [["product_id", "warehouse_id"]], gen: (g, i) => ({ product_id: i, warehouse_id: (i % 3) + 1, reorder_point: g.int(30, 400), safety_stock: g.int(10, 120), target_days_cover: g.pick([14, 21, 30, 45]) }),
    }),
  ],
  views: [
    view("v_stock_on_hand", "Quantity per product across bins, with the part allocated to orders.", () => `
SELECT p.id AS product_id, p.sku, p.name, p.category, SUM(s.qty_on_hand) AS on_hand, SUM(s.qty_allocated) AS allocated, SUM(s.qty_on_hand - s.qty_allocated) AS available
FROM stock s JOIN product p ON p.id = s.product_id GROUP BY p.id, p.sku, p.name, p.category`),
    view("v_expiring_lots", "Lots expiring within 60 days of the reference date.", (d) => `
SELECT l.id AS lot_id, l.lot_no, p.sku, p.name, l.expires_on, ${d.diffDays("l.expires_on", d.asOf)} AS days_left, COALESCE(SUM(s.qty_on_hand), 0) AS qty_on_hand
FROM inventory_lot l JOIN product p ON p.id = l.product_id LEFT JOIN stock s ON s.lot_id = l.id
WHERE l.expires_on IS NOT NULL AND l.expires_on BETWEEN ${d.asOf} AND ${d.addDays(d.asOf, 60)} GROUP BY l.id, l.lot_no, p.sku, p.name, l.expires_on`),
    view("v_open_po_aging", "Open purchase orders and how many days they are late.", (d) => `
SELECT po.po_number, s.name AS supplier, po.ordered_on, po.expected_on, ${d.diffDays(d.asOf, "po.expected_on")} AS days_past_due
FROM purchase_order po JOIN supplier s ON s.id = po.supplier_id WHERE po.status IN ('open', 'partial')`),
    view("v_fill_rate", "Quantity shipped versus ordered per month.", (d) => `
SELECT ${d.ym("o.ordered_at")} AS month, SUM(l.qty_ordered) AS ordered, SUM(l.qty_shipped) AS shipped, ${d.round("100.0 * SUM(l.qty_shipped) / SUM(l.qty_ordered)", 1)} AS fill_rate_pct
FROM order_line l JOIN customer_order o ON o.id = l.order_id WHERE o.status = 'shipped' GROUP BY ${d.ym("o.ordered_at")}`),
    view("v_pick_velocity", "Units picked per product with ABC rank.", () => `
SELECT p.sku, p.name, p.abc_class, SUM(pt.qty_picked) AS units_picked, RANK() OVER (ORDER BY SUM(pt.qty_picked) DESC) AS velocity_rank
FROM pick_task pt JOIN order_line l ON l.id = pt.order_line_id JOIN product p ON p.id = l.product_id GROUP BY p.sku, p.name, p.abc_class`),
    view("v_supplier_otif", "On-time and in-full performance of received purchase orders.", (d) => `
SELECT s.name AS supplier, COUNT(*) AS orders,
       SUM(CASE WHEN po.received_on <= po.expected_on THEN 1 ELSE 0 END) AS on_time,
       ${d.round("100.0 * SUM(CASE WHEN po.received_on <= po.expected_on THEN 1 ELSE 0 END) / COUNT(*)", 1)} AS on_time_pct
FROM purchase_order po JOIN supplier s ON s.id = po.supplier_id WHERE po.received_on IS NOT NULL GROUP BY s.name`),
  ],
  queries: [
    query("abc_analysis", "ABC analysis", "Products ranked by units picked with cumulative share and the A/B/C class each falls into.", (d) => `
-- Pareto of pick volume: A = first 80% of units, B = next 15%, C = rest
WITH v AS (SELECT sku, name, units_picked FROM v_pick_velocity WHERE units_picked > 0),
c AS (SELECT sku, name, units_picked, 100.0 * SUM(units_picked) OVER (ORDER BY units_picked DESC, sku) / SUM(units_picked) OVER () AS cum_pct FROM v)
SELECT sku, name, units_picked, ${d.round("cum_pct", 1)} AS cumulative_pct, CASE WHEN cum_pct <= 80 THEN 'A' WHEN cum_pct <= 95 THEN 'B' ELSE 'C' END AS abc_class
FROM c ORDER BY units_picked DESC, sku LIMIT 25`),
    query("reorder_alerts", "Reorder alerts", "Products whose available stock is below the reorder point.", () => `
-- Replenishment worklist
SELECT v.sku, v.name, v.available, rp.reorder_point, rp.reorder_point - v.available AS shortfall
FROM v_stock_on_hand v JOIN reorder_policy rp ON rp.product_id = v.product_id
WHERE v.available < rp.reorder_point ORDER BY shortfall DESC, v.sku LIMIT 20`),
    query("lead_time", "Supplier lead-time reliability", "Promised versus actual lead time with spread per supplier.", (d) => `
-- Who delivers when they say?
SELECT s.name, COUNT(*) AS orders, ${d.round("AVG(" + d.diffDays("po.expected_on", "po.ordered_on") + ")", 1)} AS promised_days,
       ${d.round("AVG(" + d.diffDays("po.received_on", "po.ordered_on") + ")", 1)} AS actual_days,
       MAX(${d.diffDays("po.received_on", "po.expected_on")}) AS worst_delay_days
FROM purchase_order po JOIN supplier s ON s.id = po.supplier_id WHERE po.received_on IS NOT NULL GROUP BY s.name ORDER BY worst_delay_days DESC, s.name LIMIT 15`),
    query("picker_productivity", "Picker productivity", "Lines per picker per shift with average minutes per pick.", (d) => `
-- Labour productivity
SELECT pk.name, pk.shift, COUNT(*) AS picks, SUM(pt.qty_picked) AS units
FROM pick_task pt JOIN picker pk ON pk.id = pt.picker_id WHERE pt.status <> 'open'
GROUP BY pk.name, pk.shift ORDER BY picks DESC, pk.name LIMIT 15`),
    query("expiry_exposure", "Expiry exposure", "Value of stock in lots that expire soon (join of lot, stock and product cost).", (d) => `
-- Write-off risk
SELECT e.lot_no, e.name, e.days_left, e.qty_on_hand, ${d.round("e.qty_on_hand * p.unit_cost")} AS value_at_risk
FROM v_expiring_lots e JOIN product p ON p.sku = e.sku ORDER BY value_at_risk DESC, e.lot_no LIMIT 15`),
    query("backorders", "Backorders and short picks", "Order lines shipped short, by category.", () => `
-- Where do we ship short?
SELECT p.category, COUNT(*) AS short_lines, SUM(l.qty_ordered - l.qty_shipped) AS units_short
FROM order_line l JOIN product p ON p.id = l.product_id JOIN customer_order o ON o.id = l.order_id
WHERE o.status = 'shipped' AND l.qty_shipped < l.qty_ordered GROUP BY p.category ORDER BY units_short DESC`),
    query("count_accuracy", "Cycle-count accuracy", "Share of counts that matched the system, by zone.", (d) => `
-- Inventory accuracy by zone
SELECT l.zone, COUNT(*) AS counts, SUM(CASE WHEN c.variance = 0 THEN 1 ELSE 0 END) AS exact_matches,
       ${d.round("100.0 * SUM(CASE WHEN c.variance = 0 THEN 1 ELSE 0 END) / COUNT(*)", 1)} AS accuracy_pct, SUM(c.variance) AS net_variance
FROM cycle_count c JOIN location l ON l.id = c.location_id GROUP BY l.zone ORDER BY l.zone`),
    query("movement_mix", "Movement mix by month", "Stock movements by type and month.", (d) => `
-- Warehouse activity profile
SELECT ${d.ym("moved_at")} AS month, movement_type, COUNT(*) AS movements, SUM(ABS(qty)) AS units
FROM stock_movement GROUP BY ${d.ym("moved_at")}, movement_type ORDER BY month, movements DESC`),
  ],
});
