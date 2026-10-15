import { addDays, dayOf, dayStr, hashString, mulberry32 } from "../gen";
import { COLORS, COMPANY_A, COMPANY_B } from "../words";
import { dataset, query, table, view, type Scale } from "../model";

const START = "2023-01-01";
const ASOF = "2025-06-30";
const hh = (a: number, b: number) => { const r = mulberry32((a * 7919 + b * 104729) >>> 0); r(); return r(); };
const p2 = (n: number) => String(n).padStart(2, "0");

const CATS: [string, string | null][] = [
  ["Electronics", null], ["Home & Kitchen", null], ["Fashion", null], ["Sports & Outdoors", null], ["Beauty & Health", null], ["Toys & Games", null],
  ["Headphones", "Electronics"], ["Smart Home", "Electronics"], ["Computer Accessories", "Electronics"], ["Cameras", "Electronics"],
  ["Cookware", "Home & Kitchen"], ["Small Appliances", "Home & Kitchen"], ["Bedding", "Home & Kitchen"], ["Storage", "Home & Kitchen"],
  ["Men's Clothing", "Fashion"], ["Women's Clothing", "Fashion"], ["Shoes", "Fashion"], ["Bags", "Fashion"],
  ["Fitness", "Sports & Outdoors"], ["Camping", "Sports & Outdoors"], ["Cycling", "Sports & Outdoors"],
  ["Skincare", "Beauty & Health"], ["Vitamins", "Beauty & Health"], ["Grooming", "Beauty & Health"],
  ["Board Games", "Toys & Games"], ["Building Sets", "Toys & Games"], ["Puzzles", "Toys & Games"],
];
const LEAVES = CATS.map((c, i) => [c, i + 1] as const).filter(([c]) => c[1] !== null).map(([, i]) => i);
const NOUNS: Record<string, string[]> = {
  Headphones: ["Wireless Earbuds", "Over-Ear Headphones", "Sport Earphones"], "Smart Home": ["Smart Plug", "Motion Sensor", "Video Doorbell"], "Computer Accessories": ["USB-C Hub", "Mechanical Keyboard", "Laptop Stand"],
  Cameras: ["Action Camera", "Instant Camera", "Tripod"], Cookware: ["Cast Iron Skillet", "Stainless Saucepan", "Nonstick Pan Set"], "Small Appliances": ["Air Fryer", "Blender", "Electric Kettle"], Bedding: ["Cotton Sheet Set", "Down Comforter", "Memory Pillow"],
  Storage: ["Stackable Bins", "Shelf Organizer", "Vacuum Bags"], "Men's Clothing": ["Oxford Shirt", "Chino Pants", "Fleece Jacket"], "Women's Clothing": ["Wrap Dress", "Knit Cardigan", "Linen Trousers"], Shoes: ["Trail Runner", "Leather Sneaker", "Canvas Slip-on"],
  Bags: ["Daypack", "Tote Bag", "Duffel"], Fitness: ["Yoga Mat", "Resistance Bands", "Adjustable Dumbbell"], Camping: ["Two-Person Tent", "Sleeping Bag", "Headlamp"], Cycling: ["Bike Helmet", "Repair Kit", "Frame Bag"],
  Skincare: ["Daily Moisturizer", "Vitamin C Serum", "Sunscreen SPF 50"], Vitamins: ["Multivitamin", "Omega-3", "Vitamin D3"], Grooming: ["Beard Trimmer", "Safety Razor", "Hair Dryer"],
  "Board Games": ["Strategy Game", "Family Card Game", "Cooperative Game"], "Building Sets": ["Castle Set", "Robotics Kit", "City Blocks"], Puzzles: ["1000-piece Puzzle", "3D Puzzle", "Logic Puzzle"],
};
const SIZES = ["S", "M", "L", "XL", "One size", "500 ml", "1 L", "64 GB", "128 GB"];

const P: Record<Scale, { C: number; S: number; PR: number; O: number }> = {
  small: { C: 400, S: 20, PR: 100, O: 500 },
  medium: { C: 3000, S: 60, PR: 500, O: 5000 },
  large: { C: 20000, S: 200, PR: 2000, O: 30000 },
};
const productSeller = (p: number, S: number) => ((p * 7) % S) + 1;
const productCat = (p: number) => LEAVES[Math.floor(hh(p, 1) * LEAVES.length)]!;
const baseCents = (p: number) => Math.round(7 + 190 * hh(p, 2) ** 2.2) * 100 - 1;
const variantPrice = (v: number) => Math.round(baseCents(Math.ceil(v / 3)) * [1, 1.08, 1.15][(v - 1) % 3]!) / 100;
const ean13 = (v: number) => { const base = `590${String(1000000 + v * 13).slice(-9)}`; let sum = 0; for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 ? 3 : 1); return base + ((10 - (sum % 10)) % 10); };

interface Line { variant: number; qty: number; price: number; seller: number }
interface Ord { cust: number; placed: string; status: string; promo: number | null; items: Line[]; subtotal: number; shipping: number; tax: number; discount: number }
const planCache = new Map<Scale, Ord[]>();
const PROMO_PCT: Record<number, number> = { 1: 10, 2: 15, 3: 20, 5: 5, 6: 25, 8: 30 };
function orderPlan(scale: Scale): Ord[] {
  const hit = planCache.get(scale);
  if (hit) return hit;
  const cfg = P[scale];
  const r = mulberry32(hashString(`ecom:${scale}`));
  const V = cfg.PR * 3;
  const out: Ord[] = [];
  const months = [1.0, 0.9, 0.95, 0.95, 1, 1, 1.05, 1, 1.05, 1.1, 1.5, 1.9];
  for (let i = 0; i < cfg.O; i++) {
    let day = dayStr(dayOf(START) + Math.floor(r() * (dayOf(ASOF) - dayOf(START) + 1)));
    for (let t = 0; t < 30 && r() * 1.9 > months[Number(day.slice(5, 7)) - 1]!; t++) day = dayStr(dayOf(START) + Math.floor(r() * (dayOf(ASOF) - dayOf(START) + 1)));
    const k = r() < 0.5 ? 1 : r() < 0.56 ? 2 : r() < 0.75 ? 3 : 4;
    const items: Line[] = [];
    for (let j = 0; j < k; j++) {
      const variant = 1 + Math.floor(V * Math.pow(r(), 2.2));
      items.push({ variant, qty: r() < 0.82 ? 1 : r() < 0.7 ? 2 : 3, price: variantPrice(variant), seller: productSeller(Math.ceil(variant / 3), cfg.S) });
    }
    const subtotal = Math.round(items.reduce((a, l) => a + l.qty * l.price, 0) * 100) / 100;
    const promo = r() < 0.18 ? [1, 2, 3, 5, 6, 8][Math.floor(r() * 6)]! : null;
    const discount = promo ? Math.round(subtotal * (PROMO_PCT[promo] ?? 0)) / 100 : 0;
    const age = dayOf(ASOF) - dayOf(day);
    const status = age < 2 ? (r() < 0.5 ? "pending" : "paid") : age < 6 ? (r() < 0.5 ? "shipped" : "paid") : r() < 0.04 ? "cancelled" : r() < 0.035 ? "returned" : "delivered";
    out.push({ cust: 1 + Math.floor(cfg.C * Math.pow(r(), 1.6)), placed: day, status, promo, items, subtotal, shipping: subtotal >= 50 ? 0 : 5.99, tax: Math.round((subtotal - discount) * 7) / 100, discount });
  }
  planCache.set(scale, out);
  return out;
}
const itemTotal = (s: Scale) => orderPlan(s).reduce((a, o) => a + o.items.length, 0);
const paidOrders = (s: Scale) => orderPlan(s).filter((o) => o.status !== "pending" && o.status !== "cancelled");
const shippedOrders = (s: Scale) => orderPlan(s).map((o, i) => ({ o, id: i + 1 })).filter(({ o }) => ["shipped", "delivered", "returned"].includes(o.status));

const BRAND_N = 24;
export default dataset({
  id: "ecommerce_marketplace",
  title: "E-commerce Marketplace",
  tagline: "Catalogue, variants, inventory, orders, payments, shipments, returns, promotions and reviews.",
  description:
    "A multi-seller online marketplace: a category tree, sellers, brands, products with size/colour variants (EAN-13 barcodes with valid check digits), warehouse inventory, customers and addresses, " +
    "orders with line items whose totals always add up, payments, shipments with promised and actual delivery dates, returns, promotions, wishlists, reviews, price history and seller payouts. " +
    "Seasonal demand peaks in November and December and the product popularity is heavily skewed. All data is synthetic.",
  tags: ["Retail", "Commerce", "Analytics"],
  asOf: ASOF,
  highlights: ["category tree (recursive CTE)", "totals that reconcile", "EAN-13 check digits", "RFM segmentation", "seasonality + long-tail"],
  tables: [
    table("category", "Product category tree (parent_id).", ["id id", "parent_id int fk:category null", "name str(60)", "slug str(70) uq"], {
      rows: CATS.map(([name, parent]) => ({ parent_id: parent ? CATS.findIndex((c) => c[0] === parent) + 1 : null, name, slug: name.toLowerCase().replace(/[^a-z]+/g, "-") })),
    }),
    table("brand", "Product brands (fictional).", ["id id", "name str(60) uq", "country char(2)"], {
      n: BRAND_N, gen: (g, i) => ({ name: `${COMPANY_A[i - 1]} ${COMPANY_B[(i * 3) % COMPANY_B.length]}`.slice(0, 58), country: g.pick(["US", "DE", "JP", "CN", "GB", "IT"]) }),
    }),
    table("warehouse", "Fulfilment centres.", ["id id", "code str(8) uq", "city str(40)", "state char(2)"], { rows: [{ code: "EAST1", city: "Newark", state: "NJ" }, { code: "WEST1", city: "Reno", state: "NV" }, { code: "CENT1", city: "Dallas", state: "TX" }, { code: "SOUTH1", city: "Atlanta", state: "GA" }] }),
    table("seller", "Third-party sellers on the marketplace.", ["id id", "name str(80)", "status enum(active,suspended,closed)", "commission_pct dec(4,2)", "rating dec(2,1) null", "joined_on date", "country char(2)"], {
      n: [20, 80, 300], gen: (g) => ({ name: g.company(), status: g.w([["active", 90], ["suspended", 6], ["closed", 4]] as const), commission_pct: g.pick([8, 10, 12, 15]), rating: g.bool(0.9) ? g.round(g.clamp(g.normal(4.4, 0.4), 2.5, 5), 1) : null, joined_on: g.date("2019-01-01", "2024-12-31"), country: g.pick(["US", "US", "US", "CA", "GB", "DE"]) }),
    }),
    table("product", "Sellable products; variants carry price and SKU.", ["id id", "seller_id int fk:seller", "brand_id int fk:brand", "category_id int fk:category", "title str(120)", "description text", "status enum(active,draft,archived)", "created_at ts", "updated_at ts upd"], {
      n: [P.small.PR, P.medium.PR, P.large.PR], ix: ["category_id,status"],
      gen: (g, i) => { const cat = productCat(i); const noun = g.pick(NOUNS[CATS[cat - 1]![0]]!); return { seller_id: productSeller(i, g.count("seller")), brand_id: 1 + (i * 5) % BRAND_N, category_id: cat, title: `${COMPANY_A[(i * 11) % COMPANY_A.length]} ${noun}`, description: g.sentence(14), status: g.w([["active", 92], ["draft", 3], ["archived", 5]] as const), created_at: g.ts(g.date("2022-06-01", "2025-03-01")) }; },
    }),
    table("product_variant", "Size / colour variants with SKU, barcode and price.", ["id id", "product_id int fk:product cascade", "sku str(24) uq", "barcode char(13) uq # EAN-13 with a valid check digit", "size_label str(20)", "color str(20)", "price dec(10,2)", "weight_g int", "is_active bool def:true"], {
      n: (n) => n("product") * 3, ck: ["price > 0"],
      gen: (g, i) => ({ product_id: Math.ceil(i / 3), sku: `SKU-${String(i).padStart(7, "0")}`, barcode: ean13(i), size_label: SIZES[(i * 5) % SIZES.length]!, color: COLORS[(i * 3) % COLORS.length]!, price: variantPrice(i), weight_g: g.int(80, 4000), is_active: g.bool(0.97) }),
    }),
    table("inventory", "Stock per variant and warehouse.", ["id id", "variant_id int fk:product_variant cascade", "warehouse_id int fk:warehouse", "on_hand int", "reserved int", "reorder_point int", "updated_at ts upd"], {
      n: (n) => n("product_variant") * 2, uq: [["variant_id", "warehouse_id"]], ck: ["on_hand >= 0", "reserved >= 0 AND reserved <= on_hand"],
      gen: (g, i) => { const hot = Math.ceil(i / 2) < g.count("product_variant") * 0.2; const onHand = Math.round(g.logNormal(hot ? 22 : 40, 0.7)); return { variant_id: Math.ceil(i / 2), warehouse_id: ((Math.ceil(i / 2) + (i % 2)) % 4) + 1, on_hand: onHand, reserved: Math.min(onHand, g.int(0, hot ? 20 : 4)), reorder_point: hot ? 30 : 8 }; },
    }),
    table("customer", "Registered customers.", ["id id", "email str(160) uq", "first_name str(40)", "last_name str(40)", "phone str(16) null", "marketing_opt_in bool", "loyalty_tier enum(none,silver,gold,platinum)", "created_at ts", "updated_at ts upd", "deleted_at ts null"], {
      n: [P.small.C, P.medium.C, P.large.C], ix: ["last_name,first_name", "loyalty_tier"],
      gen: (g, i) => { const f = g.first(), l = g.last(); return { email: `${f}.${l}${i}@shopper.example`.toLowerCase(), first_name: f, last_name: l, phone: g.bool(0.6) ? g.phone() : null, marketing_opt_in: g.bool(0.55), loyalty_tier: g.w([["none", 60], ["silver", 24], ["gold", 12], ["platinum", 4]] as const), created_at: g.ts(g.date("2021-01-01", ASOF)), deleted_at: g.bool(0.01) ? g.ts(g.date("2024-01-01", ASOF)) : null }; },
    }),
    table("address", "Shipping and billing addresses (address i belongs to customer i for the first customers).", ["id id", "customer_id int fk:customer cascade", "label enum(home,work,other)", "street str(120)", "city str(60)", "state char(2)", "zip char(5)", "is_default bool"], {
      n: [500, 3800, 25000], ix: ["customer_id"],
      gen: (g, i) => { const p = g.place(); return { customer_id: g.spread(g.count("customer"), i, 1.2), label: g.pick(["home", "home", "work", "other"]), street: g.street(), city: p.city, state: p.state, zip: p.zip, is_default: i <= g.count("customer") }; },
    }),
    table("promotion", "Discount campaigns.", ["id id", "code str(20) uq", "promo_type enum(percent,fixed,free_shipping)", "percent_off dec(5,2) null", "min_spend dec(8,2) def:0", "starts_on date", "ends_on date"], {
      rows: [["WELCOME10", 10], ["SPRING15", 15], ["VIP20", 20], ["FREESHIP", null], ["FLASH5", 5], ["BIGSALE25", 25], ["FIRSTORDER", 10], ["BLACKFRIDAY30", 30], ["BUNDLE12", 12], ["LOYALTY8", 8]].map(([code, pct], i) => ({ code, promo_type: pct ? "percent" : "free_shipping", percent_off: pct, min_spend: i % 3 === 0 ? 50 : 0, starts_on: "2023-01-01", ends_on: "2026-12-31" })),
    }),
    table("orders", "Customer orders; total is computed from subtotal, discount, shipping and tax.", [
      "id id", "order_number str(14) uq", "customer_id int fk:customer", "shipping_address_id int fk:address", "status enum(pending,paid,shipped,delivered,cancelled,returned)", "placed_at ts", "subtotal dec(10,2)", "discount dec(10,2) def:0", "shipping_fee dec(8,2) def:0", "tax dec(10,2) def:0", "total dec(10,2) = subtotal - discount + shipping_fee + tax", "currency char(3) def:USD", "promotion_id int fk:promotion null", "channel enum(web,mobile,marketplace_app)", "updated_at ts upd",
    ], {
      n: [P.small.O, P.medium.O, P.large.O], ix: ["customer_id,placed_at", "status,placed_at", "placed_at"],
      gen: (g, i) => { const o = orderPlan(g.scale)[i - 1]!; return { order_number: `ORD-${String(i).padStart(9, "0")}`, customer_id: o.cust, shipping_address_id: o.cust, status: o.status, placed_at: g.ts(o.placed, 6, 23), subtotal: o.subtotal, discount: o.discount, shipping_fee: o.shipping, tax: o.tax, currency: "USD", promotion_id: o.promo, channel: g.w([["web", 52], ["mobile", 38], ["marketplace_app", 10]] as const) }; },
    }),
    table("order_item", "Order lines; line_total is computed.", ["id id", "order_id int fk:orders cascade", "variant_id int fk:product_variant", "seller_id int fk:seller", "quantity smallint", "unit_price dec(10,2)", "line_total dec(12,2) = quantity * unit_price", "status enum(ordered,shipped,delivered,returned,cancelled)"], {
      n: (n, s) => itemTotal(s), ix: ["variant_id", "seller_id"], ck: ["quantity > 0"],
      all: (g) => orderPlan(g.scale).flatMap((o, oi) => o.items.map((l) => ({ order_id: oi + 1, variant_id: l.variant, seller_id: l.seller, quantity: l.qty, unit_price: l.price, status: o.status === "cancelled" ? "cancelled" : o.status === "returned" ? "returned" : o.status === "delivered" ? "delivered" : o.status === "shipped" ? "shipped" : "ordered" }))),
    }),
    table("payment", "One payment per paid order.", ["id id", "order_id int fk:orders", "method enum(card,paypal,gift_card,bank_transfer)", "amount dec(10,2)", "status enum(captured,refunded,failed)", "processor_ref str(30) uq", "paid_at ts"], {
      n: (n, s) => paidOrders(s).length,
      gen: (g, i) => { const ids = g.memo("ids", () => orderPlan(g.scale).map((o, k) => ({ o, id: k + 1 })).filter(({ o }) => o.status !== "pending" && o.status !== "cancelled")); const { o, id } = ids[i - 1]!; return { order_id: id, method: g.w([["card", 70], ["paypal", 18], ["gift_card", 7], ["bank_transfer", 5]] as const), amount: g.round(o.subtotal - o.discount + o.shipping + o.tax), status: o.status === "returned" ? "refunded" : "captured", processor_ref: `pay_${g.hex(20)}`, paid_at: g.ts(o.placed, 6, 23) }; },
    }),
    table("shipment", "Parcels for shipped orders with promised and actual dates.", ["id id", "order_id int fk:orders", "warehouse_id int fk:warehouse", "carrier enum(UPS,FedEx,USPS,DHL,OnTrac)", "tracking_number str(24) uq", "shipped_at ts", "promised_by date", "delivered_at ts null", "status enum(in_transit,delivered,lost,returned)"], {
      n: (n, s) => shippedOrders(s).length, ix: ["carrier,shipped_at"],
      gen: (g, i) => { const list = g.memo("ship", () => shippedOrders(g.scale)); const { o, id } = list[i - 1]!; const shipDay = addDays(o.placed, g.int(0, 2)); const promised = addDays(shipDay, g.int(3, 6)); const late = g.bool(0.13); const del = o.status === "shipped" ? null : g.ts(addDays(promised, late ? g.int(1, 4) : -g.int(0, 2)), 9, 20); return { order_id: id, warehouse_id: g.int(1, 4), carrier: g.w([["UPS", 30], ["FedEx", 26], ["USPS", 30], ["DHL", 8], ["OnTrac", 6]] as const), tracking_number: `1Z${g.digits(16)}`, shipped_at: g.ts(shipDay, 8, 18), promised_by: promised, delivered_at: del, status: o.status === "shipped" ? "in_transit" : o.status === "returned" ? "returned" : "delivered" }; },
    }),
    table("return_request", "Customer returns of order lines.", ["id id", "order_item_id int fk:order_item", "reason enum(damaged,wrong_item,not_as_described,changed_mind,too_small,too_large,late)", "status enum(requested,approved,received,refunded,rejected)", "requested_at ts", "refund_amount dec(10,2)"], {
      n: [25, 250, 1300], uq: [["order_item_id"]],
      gen: (g, i) => { const items = g.rows("order_item"); const it = items[(i * 17) % items.length]!; return { order_item_id: it.id, reason: g.w([["changed_mind", 28], ["too_small", 14], ["too_large", 12], ["not_as_described", 16], ["damaged", 14], ["wrong_item", 8], ["late", 8]] as const), status: g.w([["refunded", 60], ["received", 12], ["approved", 10], ["requested", 8], ["rejected", 10]] as const), requested_at: g.tsBetween("2023-02-01", ASOF), refund_amount: g.round(Number(it.quantity) * Number(it.unit_price)) }; },
    }),
    table("review", "Product reviews; verified_purchase marks reviewers who bought it.", ["id id", "customer_id int fk:customer", "product_id int fk:product", "rating smallint", "title str(80)", "body text", "verified_purchase bool", "helpful_votes int def:0", "created_at ts"], {
      n: [250, 2500, 15000], ck: ["rating BETWEEN 1 AND 5"], ix: ["product_id,rating"],
      gen: (g) => ({ customer_id: g.fkSkew(g.count("customer"), 1.3), product_id: g.fkSkew(g.count("product"), 2), rating: g.w([[5, 52], [4, 24], [3, 10], [2, 6], [1, 8]] as const), title: g.pick(["Great value", "Works as described", "Not for me", "Exceeded expectations", "Decent", "Broke after a month", "Love it"]), body: g.sentence(16), verified_purchase: g.bool(0.78), helpful_votes: Math.floor(g.logNormal(2, 1.1)), created_at: g.tsBetween("2023-02-01", ASOF) }),
    }),
    table("wishlist_item", "Saved-for-later products.", ["id id", "customer_id int fk:customer cascade", "product_id int fk:product", "added_at ts"], { n: [150, 1500, 9000], uq: [["customer_id", "product_id"]], gen: (g, i) => ({ customer_id: g.spread(g.count("customer"), i, 1.2), product_id: 1 + ((i * 31) % g.count("product")), added_at: g.tsBetween("2023-01-01", ASOF) }) }),
    table("price_history", "Price points of variants over time.", ["id id", "variant_id int fk:product_variant cascade", "price dec(10,2)", "effective_from date"], {
      n: (n) => n("product_variant") * 2, uq: [["variant_id", "effective_from"]],
      gen: (g, i) => { const v = Math.ceil(i / 2); const base = variantPrice(v); return i % 2 ? { variant_id: v, price: g.round(base * 1.1), effective_from: "2023-01-01" } : { variant_id: v, price: base, effective_from: g.date("2023-06-01", "2024-09-01") }; },
    }),
    table("seller_payout", "Monthly settlements to sellers.", ["id id", "seller_id int fk:seller", "period char(7)", "gross_sales dec(12,2)", "commission dec(12,2)", "net_payout dec(12,2) = gross_sales - commission", "paid_on date"], {
      n: (n) => n("seller") * 6, uq: [["seller_id", "period"]],
      gen: (g, i) => { const sid = ((i - 1) % g.count("seller")) + 1; const m = Math.floor((i - 1) / g.count("seller")); const gross = g.money(6000, 0.9); return { seller_id: sid, period: `2025-${p2(m + 1)}`, gross_sales: gross, commission: g.round(gross * 0.12), paid_on: `2025-${p2(m + 2)}-05` }; },
    }),
  ],
  views: [
    view("v_order_summary", "Orders with customer, item counts and gross merchandise value.", (d) => `
SELECT o.id AS order_id, o.order_number, o.placed_at, o.status, ${d.concat("c.first_name", "' '", "c.last_name")} AS customer, o.total,
       (SELECT COUNT(*) FROM order_item oi WHERE oi.order_id = o.id) AS line_count,
       (SELECT SUM(oi.quantity) FROM order_item oi WHERE oi.order_id = o.id) AS units
FROM orders o JOIN customer c ON c.id = o.customer_id`),
    view("v_sales_by_category_month", "Net sales by root category and month (cancelled orders excluded).", (d) => `
SELECT ${d.ym("o.placed_at")} AS month, COALESCE(pc.name, cat.name) AS root_category, SUM(oi.line_total) AS sales, SUM(oi.quantity) AS units
FROM order_item oi
JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
JOIN product_variant pv ON pv.id = oi.variant_id
JOIN product p ON p.id = pv.product_id
JOIN category cat ON cat.id = p.category_id
LEFT JOIN category pc ON pc.id = cat.parent_id
GROUP BY ${d.ym("o.placed_at")}, COALESCE(pc.name, cat.name)`),
    view("v_inventory_status", "Available stock per variant with a low-stock flag.", () => `
SELECT pv.id AS variant_id, pv.sku, p.title, SUM(i.on_hand) AS on_hand, SUM(i.reserved) AS reserved, SUM(i.on_hand - i.reserved) AS available,
       CASE WHEN SUM(i.on_hand - i.reserved) < MAX(i.reorder_point) THEN 1 ELSE 0 END AS low_stock
FROM inventory i JOIN product_variant pv ON pv.id = i.variant_id JOIN product p ON p.id = pv.product_id
GROUP BY pv.id, pv.sku, p.title`),
    view("v_seller_performance", "GMV, units and return share per seller.", (d) => `
SELECT s.id AS seller_id, s.name, COUNT(DISTINCT oi.order_id) AS orders, SUM(oi.line_total) AS gmv,
       ${d.round("100.0 * SUM(CASE WHEN oi.status = 'returned' THEN 1 ELSE 0 END) / COUNT(*)", 1)} AS return_pct
FROM seller s JOIN order_item oi ON oi.seller_id = s.id GROUP BY s.id, s.name`),
    view("v_product_ratings", "Average rating and review count per product.", (d) => `
SELECT p.id AS product_id, p.title, COUNT(r.id) AS reviews, ${d.round("AVG(r.rating)", 2)} AS avg_rating
FROM product p JOIN review r ON r.product_id = p.id GROUP BY p.id, p.title`),
    view("v_delivery_performance", "Carrier on-time performance.", (d) => `
SELECT carrier, COUNT(*) AS delivered,
       SUM(CASE WHEN ${d.dateOf("delivered_at")} <= promised_by THEN 1 ELSE 0 END) AS on_time,
       ${d.round(`100.0 * SUM(CASE WHEN ${d.dateOf("delivered_at")} <= promised_by THEN 1 ELSE 0 END) / COUNT(*)`, 1)} AS on_time_pct
FROM shipment WHERE delivered_at IS NOT NULL GROUP BY carrier`),
    view("v_customer_lifetime", "Orders and spend per customer.", () => `
SELECT c.id AS customer_id, c.loyalty_tier, COUNT(o.id) AS orders, COALESCE(SUM(o.total), 0) AS lifetime_spend, MIN(o.placed_at) AS first_order, MAX(o.placed_at) AS last_order
FROM customer c LEFT JOIN orders o ON o.customer_id = c.id AND o.status NOT IN ('cancelled', 'pending') GROUP BY c.id, c.loyalty_tier`),
  ],
  queries: [
    query("rfm", "RFM customer segments", "Recency, frequency and monetary quartiles per customer (NTILE) and the segment each falls into.", (d) => `
-- RFM segmentation: who are the best customers?
WITH base AS (
  SELECT customer_id, ${d.diffDays(d.asOf, `MAX(${d.dateOf("placed_at")})`)} AS recency_days, COUNT(*) AS frequency, SUM(total) AS monetary
  FROM orders WHERE status NOT IN ('cancelled', 'pending') GROUP BY customer_id
), scored AS (
  SELECT customer_id, recency_days, frequency, monetary,
         NTILE(4) OVER (ORDER BY recency_days DESC) AS r, NTILE(4) OVER (ORDER BY frequency) AS f, NTILE(4) OVER (ORDER BY monetary) AS m FROM base
)
SELECT CASE WHEN r + f + m >= 10 THEN 'Champions' WHEN r + f + m >= 8 THEN 'Loyal' WHEN r >= 3 THEN 'Recent' ELSE 'At risk' END AS segment,
       COUNT(*) AS customers, ${d.round("AVG(monetary)")} AS avg_spend, ${d.round("AVG(frequency)", 1)} AS avg_orders
FROM scored GROUP BY CASE WHEN r + f + m >= 10 THEN 'Champions' WHEN r + f + m >= 8 THEN 'Loyal' WHEN r >= 3 THEN 'Recent' ELSE 'At risk' END
ORDER BY avg_spend DESC`),
    query("basket", "Frequently bought together", "Product pairs bought in the same order (self join on order lines).", () => `
-- Market-basket analysis
SELECT pa.title AS product_a, pb.title AS product_b, COUNT(*) AS together
FROM order_item a
JOIN order_item b ON b.order_id = a.order_id AND b.variant_id > a.variant_id
JOIN product_variant va ON va.id = a.variant_id JOIN product pa ON pa.id = va.product_id
JOIN product_variant vb ON vb.id = b.variant_id JOIN product pb ON pb.id = vb.product_id
WHERE pa.id <> pb.id
GROUP BY pa.title, pb.title ORDER BY together DESC, product_a, product_b LIMIT 15`),
    query("category_rollup", "Revenue rolled up the category tree", "Recursive CTE that sums sales of every leaf category into its top-level category.", () => `
-- Walk the category tree with a recursive CTE
WITH RECURSIVE tree (id, root_id, root_name, depth) AS (
  SELECT id, id, name, 0 FROM category WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.root_id, t.root_name, t.depth + 1 FROM category c JOIN tree t ON c.parent_id = t.id
)
SELECT t.root_name AS top_category, COUNT(DISTINCT p.id) AS products, SUM(oi.line_total) AS sales
FROM tree t
JOIN product p ON p.category_id = t.id
JOIN product_variant pv ON pv.product_id = p.id
JOIN order_item oi ON oi.variant_id = pv.id
GROUP BY t.root_name ORDER BY sales DESC`),
    query("best_sellers", "Best sellers per category", "Top 3 products by units in each top-level category (ROW_NUMBER).", () => `
-- Best sellers per category
SELECT root_category, title, units, rn AS rank_in_category FROM (
  SELECT COALESCE(pc.name, cat.name) AS root_category, p.title, SUM(oi.quantity) AS units,
         ROW_NUMBER() OVER (PARTITION BY COALESCE(pc.name, cat.name) ORDER BY SUM(oi.quantity) DESC, p.title) AS rn
  FROM order_item oi JOIN product_variant pv ON pv.id = oi.variant_id JOIN product p ON p.id = pv.product_id
  JOIN category cat ON cat.id = p.category_id LEFT JOIN category pc ON pc.id = cat.parent_id
  GROUP BY COALESCE(pc.name, cat.name), p.title
) t WHERE rn <= 3 ORDER BY root_category, rn`),
    query("stockout_risk", "Stock-out risk", "Variants whose available stock is below the reorder point and that sold in the last 90 days.", (d) => `
-- Reorder alert: low stock on moving items
SELECT v.sku, v.title, v.available, v.on_hand, sold.units_90d
FROM v_inventory_status v
JOIN (SELECT oi.variant_id, SUM(oi.quantity) AS units_90d FROM order_item oi JOIN orders o ON o.id = oi.order_id
      WHERE o.placed_at > ${d.addDays(d.asOf, -90)} GROUP BY oi.variant_id) sold ON sold.variant_id = v.variant_id
WHERE v.low_stock = 1 ORDER BY sold.units_90d DESC, v.sku LIMIT 20`),
    query("carrier_lateness", "Carrier lateness", "On-time delivery by carrier with average days late for late parcels.", (d) => `
-- Which carrier misses promised dates?
SELECT s.carrier, COUNT(*) AS parcels,
       SUM(CASE WHEN ${d.dateOf("s.delivered_at")} > s.promised_by THEN 1 ELSE 0 END) AS late,
       ${d.round(`AVG(CASE WHEN ${d.dateOf("s.delivered_at")} > s.promised_by THEN ${d.diffDays(d.dateOf("s.delivered_at"), "s.promised_by")} END)`, 1)} AS avg_days_late
FROM shipment s WHERE s.delivered_at IS NOT NULL GROUP BY s.carrier ORDER BY late DESC`),
    query("promo_effect", "Promotion effectiveness", "Average order value with and without each promotion.", (d) => `
-- Do promotions lift basket size?
SELECT COALESCE(pr.code, '(no promotion)') AS promotion, COUNT(*) AS orders, ${d.round("AVG(o.subtotal)")} AS avg_subtotal, ${d.round("AVG(o.discount)")} AS avg_discount
FROM orders o LEFT JOIN promotion pr ON pr.id = o.promotion_id WHERE o.status <> 'cancelled'
GROUP BY COALESCE(pr.code, '(no promotion)') ORDER BY orders DESC`),
    query("return_reasons", "Return reasons by category", "Why items come back, by top-level category.", () => `
-- Return reasons by category
SELECT COALESCE(pc.name, cat.name) AS root_category, rr.reason, COUNT(*) AS returns, SUM(rr.refund_amount) AS refunded
FROM return_request rr
JOIN order_item oi ON oi.id = rr.order_item_id
JOIN product_variant pv ON pv.id = oi.variant_id JOIN product p ON p.id = pv.product_id
JOIN category cat ON cat.id = p.category_id LEFT JOIN category pc ON pc.id = cat.parent_id
GROUP BY COALESCE(pc.name, cat.name), rr.reason ORDER BY returns DESC, root_category LIMIT 20`),
    query("monthly_growth", "Monthly revenue growth", "Revenue per month with month-over-month and year-over-year growth.", (d) => `
-- Seasonality and growth
WITH m AS (SELECT ${d.ym("placed_at")} AS month, SUM(total) AS revenue FROM orders WHERE status NOT IN ('cancelled', 'pending') GROUP BY ${d.ym("placed_at")})
SELECT month, ${d.round("revenue")} AS revenue,
       ${d.round("100.0 * (revenue - LAG(revenue) OVER (ORDER BY month)) / NULLIF(LAG(revenue) OVER (ORDER BY month), 0)", 1)} AS mom_pct,
       ${d.round("100.0 * (revenue - LAG(revenue, 12) OVER (ORDER BY month)) / NULLIF(LAG(revenue, 12) OVER (ORDER BY month), 0)", 1)} AS yoy_pct
FROM m ORDER BY month`),
  ],
});
