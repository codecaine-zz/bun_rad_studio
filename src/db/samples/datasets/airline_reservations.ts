import { addDays, dayOf, dayStr, hashString, mulberry32 } from "../gen";
import { dataset, query, table, view, type Scale } from "../model";

const ASOF = "2025-06-30";
const START = "2025-01-01";
const AIRPORTS: [string, string, string, string][] = [
  ["ATL", "Hartsfield-Jackson Atlanta", "Atlanta", "US"], ["ORD", "Chicago O'Hare", "Chicago", "US"], ["DFW", "Dallas Fort Worth", "Dallas", "US"], ["DEN", "Denver International", "Denver", "US"],
  ["LAX", "Los Angeles International", "Los Angeles", "US"], ["SEA", "Seattle-Tacoma", "Seattle", "US"], ["BOS", "Boston Logan", "Boston", "US"], ["MSP", "Minneapolis-St Paul", "Minneapolis", "US"],
  ["DTW", "Detroit Metro", "Detroit", "US"], ["PHX", "Phoenix Sky Harbor", "Phoenix", "US"], ["SLC", "Salt Lake City", "Salt Lake City", "US"], ["MCO", "Orlando International", "Orlando", "US"],
  ["CLT", "Charlotte Douglas", "Charlotte", "US"], ["STL", "St. Louis Lambert", "St. Louis", "US"], ["PDX", "Portland International", "Portland", "US"], ["MSY", "New Orleans Armstrong", "New Orleans", "US"],
  ["BNA", "Nashville International", "Nashville", "US"], ["PIT", "Pittsburgh International", "Pittsburgh", "US"], ["SAN", "San Diego International", "San Diego", "US"], ["IND", "Indianapolis International", "Indianapolis", "US"],
];
const AC_TYPES: [string, string, number, number][] = [["E175", "Regional jet 175", 76, 2200], ["CRJ9", "Regional jet 900", 70, 1550], ["E145", "Regional jet 145", 50, 1550], ["Q400", "Turboprop 400", 74, 1100]];
const DELAYS: [string, string][] = [["WX", "Weather"], ["ATC", "Air traffic control"], ["MX", "Maintenance"], ["CREW", "Crew availability"], ["LATE_AC", "Late inbound aircraft"], ["SEC", "Security"], ["OPS", "Ground operations"], ["PAX", "Passenger boarding"]];
const FARES: [string, string, number][] = [["Y", "Economy flex", 1.0], ["B", "Economy standard", 0.8], ["M", "Economy saver", 0.62], ["H", "Economy basic", 0.5], ["W", "Premium economy", 1.5], ["J", "Business", 2.6]];
const CFG: Record<Scale, { F: number; R: number; AC: number; PAX: number }> = { small: { F: 40, R: 14, AC: 6, PAX: 400 }, medium: { F: 220, R: 40, AC: 14, PAX: 2500 }, large: { F: 1000, R: 80, AC: 30, PAX: 10000 } };

const route = (r: number) => { const k = r - 1; const idx = Math.floor(k / 2); const hub = idx % 3; const spoke = 3 + (Math.floor(idx / 3) % 17); return k % 2 === 0 ? ([hub, spoke] as const) : ([spoke, hub] as const); };
const distance = (r: number) => { const [a, b] = route(r); return 300 + ((a * 131 + b * 71) % 1900); };
interface Fl { route: number; ac: number; date: string; hour: number; status: string; delay: number; seats: number; sold: number; no: string }
interface Bk { flight: number; pax: number; start: number }
interface Plan { flights: Fl[]; ticketStart: number[]; bookings: Bk[]; tickets: number; flown: number }
const noShow = (t: number) => (Math.imul(t, 2654435761) >>> 0) % 31 === 0;
const cache = new Map<Scale, Plan>();
function plan(scale: Scale): Plan {
  const hit = cache.get(scale);
  if (hit) return hit;
  const cfg = CFG[scale];
  const r = mulberry32(hashString(`air:${scale}`));
  const flights: Fl[] = [];
  const ticketStart: number[] = [];
  const bookings: Bk[] = [];
  let tickets = 0, flown = 0;
  for (let i = 0; i < cfg.F; i++) {
    const rt = 1 + Math.floor(r() * cfg.R);
    const ac = 1 + Math.floor(r() * cfg.AC);
    const type = AC_TYPES[(ac - 1) % AC_TYPES.length]!;
    const seats = type[2];
    const date = dayStr(dayOf(START) + Math.floor(r() * (dayOf("2025-08-15") - dayOf(START))));
    const past = date <= ASOF;
    const lf = Math.min(1, 0.55 + 0.4 * r() + (past ? 0 : -0.15));
    const sold = Math.max(1, Math.round(seats * lf));
    const status = !past ? "scheduled" : r() < 0.025 ? "cancelled" : "departed";
    const delay = status === "departed" ? (r() < 0.78 ? Math.floor(r() * 12) : Math.floor(15 + r() * 140)) : 0;
    const n = status === "cancelled" ? 0 : sold;
    flights.push({ route: rt, ac, date, hour: 5 + Math.floor(r() * 17), status, delay, seats, sold: n, no: `BR${100 + ((rt * 13 + i) % 800)}` });
    ticketStart.push(tickets);
    for (let k = 0; k < n;) { const pax = Math.min(n - k, r() < 0.62 ? 1 : r() < 0.7 ? 2 : r() < 0.8 ? 3 : 4); bookings.push({ flight: i + 1, pax, start: tickets + k }); k += pax; }
    tickets += n;
    if (status === "departed") for (let k = 0; k < n; k++) if (!noShow(tickets - n + k + 1)) flown++;
  }
  const p = { flights, ticketStart, bookings, tickets, flown };
  cache.set(scale, p);
  return p;
}
const PNR = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const pnrOf = (i: number) => { let x = Math.imul(i, 2654435761) >>> 0; x &= 0x3fffffff; let out = ""; for (let k = 0; k < 6; k++) { out += PNR[x & 31]; x >>>= 5; } return out; };
const seatLabel = (k: number) => `${Math.floor(k / 4) + 1}${"ABCD"[k % 4]}`;

export default dataset({
  id: "airline_reservations",
  title: "Airline Reservations",
  tagline: "Routes, flights, bookings and tickets, seats, check-in, baggage, loyalty, crew and maintenance.",
  description:
    "A regional airline: airports, aircraft types and tail numbers, routes with distances, scheduled flights with delay codes, passengers with loyalty accounts, bookings (PNR) with one to four " +
    "passengers, tickets with unique seats per flight, fare classes, payments that equal the ticket totals, check-in and baggage, crew assignments and aircraft maintenance. Load factors, delays " +
    "and no-shows are realistic; no flight is ever oversold. All data is synthetic and the airline is fictional.",
  tags: ["Travel", "Operations", "Analytics"],
  asOf: ASOF,
  highlights: ["unique seat per flight", "load factor and RASK", "on-time performance", "payment = ticket sum", "loyalty ledger"],
  tables: [
    table("airport", "Airports (IATA codes).", ["id id", "iata_code char(3) uq", "name str(60)", "city str(40)", "country char(2)"], { rows: AIRPORTS.map(([iata_code, name, city, country]) => ({ iata_code, name, city, country })) }),
    table("aircraft_type", "Aircraft models.", ["id id", "code str(6) uq", "name str(40)", "seats smallint", "range_km int"], { rows: AC_TYPES.map(([code, name, seats, range_km]) => ({ code, name, seats, range_km })) }),
    table("aircraft", "Fleet (tail numbers are fictional).", ["id id", "tail_number str(8) uq", "aircraft_type_id int fk:aircraft_type", "delivered_on date", "status enum(active,maintenance,retired)"], {
      n: [CFG.small.AC, CFG.medium.AC, CFG.large.AC], gen: (g, i) => ({ tail_number: `N${200 + i}BR`, aircraft_type_id: ((i - 1) % AC_TYPES.length) + 1, delivered_on: g.date("2012-01-01", "2023-06-01"), status: g.w([["active", 90], ["maintenance", 8], ["retired", 2]] as const) }),
    }),
    table("route", "City pairs flown.", ["id id", "origin_id int fk:airport", "destination_id int fk:airport", "distance_km int"], {
      n: [CFG.small.R, CFG.medium.R, CFG.large.R], uq: [["origin_id", "destination_id"]], ck: ["origin_id <> destination_id"],
      gen: (_g, i) => { const [a, b] = route(i); return { origin_id: a + 1, destination_id: b + 1, distance_km: distance(i) }; },
    }),
    table("delay_code", "Standard delay causes.", ["id id", "code str(8) uq", "description str(40)"], { rows: DELAYS.map(([code, description]) => ({ code, description })) }),
    table("fare_class", "Booking classes and their price multiplier.", ["id id", "code char(1) uq", "name str(30)", "price_factor dec(4,2)"], { rows: FARES.map(([code, name, price_factor]) => ({ code, name, price_factor })) }),
    table("flight", "Flight instances; load comes from the tickets.", ["id id", "flight_no str(8)", "route_id int fk:route", "aircraft_id int fk:aircraft", "flight_date date", "scheduled_dep ts", "scheduled_arr ts", "actual_dep ts null", "status enum(scheduled,departed,cancelled)", "delay_minutes smallint def:0", "delay_code_id int fk:delay_code null", "gate str(4) null"], {
      n: [CFG.small.F, CFG.medium.F, CFG.large.F], ix: ["flight_date", "route_id,flight_date", "status"],
      gen: (g, i) => { const f = plan(g.scale).flights[i - 1]!; const dur = Math.round(distance(f.route) / 7.6) + 25; const dep = `${f.date} ${String(f.hour).padStart(2, "0")}:${g.pick(["00", "15", "30", "45"])}:00`; const arr = new Date(Date.parse(dep.replace(" ", "T") + "Z") + dur * 60000).toISOString().slice(0, 19).replace("T", " "); return { flight_no: f.no, route_id: f.route, aircraft_id: f.ac, flight_date: f.date, scheduled_dep: dep, scheduled_arr: arr, actual_dep: f.status === "departed" ? new Date(Date.parse(dep.replace(" ", "T") + "Z") + f.delay * 60000).toISOString().slice(0, 19).replace("T", " ") : null, status: f.status, delay_minutes: f.delay, delay_code_id: f.delay >= 15 ? g.fkSkew(DELAYS.length, 1.5) : null, gate: f.status === "cancelled" ? null : `${g.pick(["A", "B", "C"])}${g.int(1, 24)}` }; },
    }),
    table("passenger", "Travelers (synthetic).", ["id id", "first_name str(40)", "last_name str(40)", "birth_date date", "email str(160) null", "phone str(16) null", "nationality char(2)", "created_at ts def:now"], {
      n: [CFG.small.PAX, CFG.medium.PAX, CFG.large.PAX], ix: ["last_name,first_name"],
      gen: (g, i) => { const f = g.first(), l = g.last(); return { first_name: f, last_name: l, birth_date: dayStr(dayOf(ASOF) - Math.round(g.clamp(g.normal(41, 16), 2, 90)) * 365 - g.int(0, 364)), email: g.bool(0.8) ? `${f}.${l}${i}@traveler.example`.toLowerCase() : null, phone: g.bool(0.6) ? g.phone() : null, nationality: g.w([["US", 86], ["CA", 5], ["MX", 4], ["GB", 3], ["DE", 2]] as const), created_at: g.ts(g.date("2020-01-01", ASOF)) }; },
    }),
    table("loyalty_account", "Frequent-flyer accounts.", ["id id", "passenger_id int fk:passenger", "member_no str(10) uq", "tier enum(blue,silver,gold,platinum)", "points_balance int", "enrolled_on date"], {
      n: (n) => Math.floor(n("passenger") * 0.45), uq: [["passenger_id"]],
      gen: (g, i) => ({ passenger_id: i, member_no: `BR${String(i).padStart(8, "0")}`, tier: g.w([["blue", 62], ["silver", 22], ["gold", 12], ["platinum", 4]] as const), points_balance: Math.round(g.logNormal(9000, 1.1)), enrolled_on: g.date("2019-01-01", "2025-03-01") }),
    }),
    table("booking", "Reservations (PNR) of one to four travelers on one flight.", ["id id", "pnr char(6) uq", "booked_at ts", "contact_email str(160)", "channel enum(web,mobile,agent,corporate)", "status enum(confirmed,cancelled)"], {
      n: (n, s) => plan(s).bookings.length, ix: ["booked_at"],
      gen: (g, i) => { const b = plan(g.scale).bookings[i - 1]!; const f = plan(g.scale).flights[b.flight - 1]!; return { pnr: pnrOf(i), booked_at: g.ts(addDays(f.date, -g.int(1, 60) > dayOf(f.date) ? 0 : -g.int(1, 60)), 0, 23), contact_email: `pnr${i}@booking.example`, channel: g.w([["web", 48], ["mobile", 32], ["agent", 12], ["corporate", 8]] as const), status: "confirmed" }; },
    }),
    table("ticket", "One ticket per traveler; a seat is unique within a flight.", ["id id", "ticket_no str(14) uq", "booking_id int fk:booking cascade", "flight_id int fk:flight", "passenger_id int fk:passenger", "fare_class_id int fk:fare_class", "seat str(4)", "fare_amount dec(10,2)", "tax_amount dec(10,2)", "total_amount dec(10,2) = fare_amount + tax_amount", "status enum(ticketed,flown,no_show,cancelled)"], {
      n: (n, s) => plan(s).tickets, uq: [["flight_id", "seat"], ["flight_id", "passenger_id"]], ix: ["booking_id", "passenger_id"],
      all: (g) => {
        const p = plan(g.scale); const P = g.count("passenger"); const out: Record<string, unknown>[] = []; let t = 0;
        for (const b of p.bookings) {
          const f = p.flights[b.flight - 1]!; const off = (b.flight * 997) % P;
          for (let k = 0; k < b.pax; k++) {
            const seatIdx = b.start - p.ticketStart[b.flight - 1]! + k; t++;
            const fare = FARES[Math.min(5, g.skew(6, 2.2))]!; const base = (90 + distance(f.route) * 0.11) * fare[2]; const f1 = g.round(base * g.float(0.85, 1.25)); 
            out.push({ ticket_no: `088${String(2000000000 + t).slice(-10)}`, booking_id: bkIndex(p, b), flight_id: b.flight, passenger_id: (((off + seatIdx) * 37 + 11) % P) + 1, fare_class_id: FARES.indexOf(fare) + 1, seat: seatLabel(seatIdx), fare_amount: f1, tax_amount: g.round(f1 * 0.12 + 11.2), status: f.status === "departed" ? (noShow(t) ? "no_show" : "flown") : "ticketed" });
          }
        }
        return out as never;
      },
    }),
    table("payment", "One payment per booking; the amount equals the booking's ticket totals.", ["id id", "booking_id int fk:booking", "amount dec(12,2)", "method enum(card,points,voucher,invoice)", "paid_at ts"], {
      n: (n) => n("booking"), uq: [["booking_id"]], uses: ["ticket"],
      gen: (g, i) => { const tk = g.memo("sums", () => { const m = new Map<number, number>(); for (const t of g.rows("ticket")) m.set(Number(t.booking_id), (m.get(Number(t.booking_id)) ?? 0) + Number(t.fare_amount) + Number(t.tax_amount)); return m; }); const b = g.rows("booking")[i - 1]!; return { booking_id: b.id, amount: g.round(tk.get(i) ?? 0), method: g.w([["card", 84], ["points", 8], ["voucher", 3], ["invoice", 5]] as const), paid_at: b.booked_at }; },
    }),
    table("check_in", "Check-ins for flights that have departed.", ["id id", "ticket_id int fk:ticket", "checked_in_at ts", "channel enum(web,kiosk,counter,mobile)", "boarding_group char(1)"], {
      n: (n, s) => plan(s).flown, uq: [["ticket_id"]],
      gen: (g, i) => { const tk = g.memo("flown", () => g.rows("ticket").filter((t) => t.status === "flown")); const t = tk[i - 1]!; const f = g.rows("flight")[Number(t.flight_id) - 1]!; return { ticket_id: t.id, checked_in_at: g.ts(dayStr(dayOf(String(f.flight_date)) - g.int(0, 1)), 0, 23), channel: g.w([["mobile", 45], ["web", 30], ["kiosk", 15], ["counter", 10]] as const), boarding_group: "ABCDE"[g.skew(5, 1.4)]! }; },
    }),
    table("baggage", "Checked bags.", ["id id", "ticket_id int fk:ticket", "tag_no str(10) uq", "weight_kg dec(5,1)", "status enum(checked,loaded,delivered,delayed,lost)"], {
      n: (n) => Math.floor(n("ticket") * 0.55), gen: (g, i) => ({ ticket_id: ((i * 7) % g.count("ticket")) + 1, tag_no: `BG${String(i).padStart(8, "0")}`, weight_kg: g.round(g.clamp(g.normal(17, 5), 5, 32), 1), status: g.w([["delivered", 93], ["delayed", 5], ["loaded", 1], ["lost", 1]] as const) }),
    }),
    table("loyalty_transaction", "Points earned and redeemed.", ["id id", "loyalty_account_id int fk:loyalty_account cascade", "kind enum(earn,redeem,bonus,expire)", "points int", "occurred_on date", "ticket_id int fk:ticket null"], {
      n: [150, 2000, 14000], ix: ["loyalty_account_id,occurred_on"],
      gen: (g) => { const kind = g.w([["earn", 72], ["redeem", 14], ["bonus", 9], ["expire", 5]] as const); const pts = Math.round(g.logNormal(900, 0.8)); return { loyalty_account_id: g.fkSkew(g.count("loyalty_account"), 1.3), kind, points: kind === "redeem" || kind === "expire" ? -pts : pts, occurred_on: g.date(START, ASOF), ticket_id: kind === "earn" ? g.fkSkew(g.count("ticket"), 1) : null }; },
    }),
    table("crew_member", "Pilots and flight attendants.", ["id id", "employee_no str(8) uq", "name str(60)", "role enum(captain,first_officer,flight_attendant)", "base_airport_id int fk:airport", "hired_on date"], {
      n: [24, 90, 240], gen: (g, i) => ({ employee_no: `C${String(i).padStart(6, "0")}`, name: `${g.first()} ${g.last()}`, role: i % 4 === 1 ? "captain" : i % 4 === 2 ? "first_officer" : "flight_attendant", base_airport_id: g.fkSkew(AIRPORTS.length, 1.5), hired_on: g.date("2008-01-01", "2024-09-01") }),
    }),
    table("crew_assignment", "Three crew members per flight (captain, first officer, lead attendant).", ["id id", "flight_id int fk:flight cascade", "crew_member_id int fk:crew_member", "duty enum(captain,first_officer,lead_attendant)"], {
      n: (n) => n("flight") * 3, uq: [["flight_id", "crew_member_id"]],
      gen: (g, i) => { const f = Math.ceil(i / 3); const k = (i - 1) % 3; const C = g.count("crew_member"); const pool = k === 0 ? 1 : k === 1 ? 2 : 3; const idx = ((f * 5 + pool - 1) + Math.floor(f / 3) * 4) % Math.floor(C / 4) * 4 + pool; return { flight_id: f, crew_member_id: Math.min(C, idx), duty: (["captain", "first_officer", "lead_attendant"] as const)[k] }; },
    }),
    table("maintenance_event", "Scheduled and unscheduled maintenance of aircraft.", ["id id", "aircraft_id int fk:aircraft", "event_type enum(a_check,b_check,c_check,unscheduled,inspection)", "started_on date", "completed_on date null", "cost dec(10,2)", "notes str(120) null"], {
      n: [10, 60, 300], gen: (g) => { const s = g.date("2024-06-01", ASOF); const t = g.w([["a_check", 40], ["b_check", 20], ["c_check", 5], ["unscheduled", 25], ["inspection", 10]] as const); return { aircraft_id: g.fkSkew(g.count("aircraft"), 1.2), event_type: t, started_on: s, completed_on: s > addDays(ASOF, -4) ? null : addDays(s, t === "c_check" ? g.int(10, 30) : g.int(1, 4)), cost: g.money(t === "c_check" ? 90000 : 6000, 0.8), notes: g.bool(0.4) ? g.sentence(6) : null }; },
    }),
  ],
  views: [
    view("v_flight_load", "Seats sold versus capacity per flight.", (d) => `
SELECT f.id AS flight_id, f.flight_no, f.flight_date, f.status, ao.iata_code AS origin, ad.iata_code AS destination, aty.seats, COUNT(t.id) AS tickets,
       ${d.round("100.0 * COUNT(t.id) / aty.seats", 1)} AS load_factor_pct
FROM flight f JOIN route r ON r.id = f.route_id JOIN airport ao ON ao.id = r.origin_id JOIN airport ad ON ad.id = r.destination_id
JOIN aircraft a ON a.id = f.aircraft_id JOIN aircraft_type aty ON aty.id = a.aircraft_type_id LEFT JOIN ticket t ON t.flight_id = f.id
GROUP BY f.id, f.flight_no, f.flight_date, f.status, ao.iata_code, ad.iata_code, aty.seats`),
    view("v_on_time_performance", "Departed flights with delay minutes and on-time flag (within 15 minutes).", () => `
SELECT f.id AS flight_id, f.flight_no, f.flight_date, f.delay_minutes, dc.code AS delay_cause, CASE WHEN f.delay_minutes < 15 THEN 1 ELSE 0 END AS on_time
FROM flight f LEFT JOIN delay_code dc ON dc.id = f.delay_code_id WHERE f.status = 'departed'`),
    view("v_route_revenue", "Ticket revenue and seats flown per route.", (d) => `
SELECT ao.iata_code AS origin, ad.iata_code AS destination, r.distance_km, COUNT(t.id) AS tickets, SUM(t.total_amount) AS revenue,
       ${d.round("SUM(t.total_amount) / NULLIF(COUNT(t.id), 0)")} AS avg_fare
FROM route r JOIN airport ao ON ao.id = r.origin_id JOIN airport ad ON ad.id = r.destination_id JOIN flight f ON f.route_id = r.id JOIN ticket t ON t.flight_id = f.id
GROUP BY ao.iata_code, ad.iata_code, r.distance_km`),
    view("v_booking_summary", "Bookings with passenger count and amount.", () => `
SELECT b.id AS booking_id, b.pnr, b.channel, COUNT(t.id) AS passengers, SUM(t.total_amount) AS ticket_total, MIN(f.flight_date) AS travel_date
FROM booking b JOIN ticket t ON t.booking_id = b.id JOIN flight f ON f.id = t.flight_id GROUP BY b.id, b.pnr, b.channel`),
    view("v_loyalty_tiers", "Members and points by tier.", () => `
SELECT tier, COUNT(*) AS members, SUM(points_balance) AS points_outstanding FROM loyalty_account GROUP BY tier`),
    view("v_aircraft_utilization", "Flights and block hours per aircraft.", (d) => `
SELECT a.tail_number, COUNT(f.id) AS flights, SUM(r.distance_km) AS km_flown
FROM aircraft a LEFT JOIN flight f ON f.aircraft_id = a.id AND f.status = 'departed' LEFT JOIN route r ON r.id = f.route_id GROUP BY a.tail_number`),
  ],
  queries: [
    query("load_factor", "Load factor by route", "Average load factor and RASK-style revenue per seat for each route (window rank).", (d) => `
-- Which routes fill best?
SELECT origin, destination, COUNT(*) AS flights, ${d.round("AVG(load_factor_pct)", 1)} AS avg_load_pct,
       RANK() OVER (ORDER BY AVG(load_factor_pct) DESC) AS fill_rank
FROM v_flight_load WHERE status = 'departed' GROUP BY origin, destination ORDER BY avg_load_pct DESC, origin, destination LIMIT 15`),
    query("delay_causes", "Delay causes", "Minutes lost by cause and the share of all delay minutes.", (d) => `
-- Why are flights late?
SELECT COALESCE(delay_cause, '(under 15 minutes)') AS cause, COUNT(*) AS flights, SUM(delay_minutes) AS minutes,
       ${d.round("100.0 * SUM(delay_minutes) / SUM(SUM(delay_minutes)) OVER ()", 1)} AS pct_of_delay
FROM v_on_time_performance GROUP BY COALESCE(delay_cause, '(under 15 minutes)') ORDER BY minutes DESC`),
    query("connections", "Hub connections", "Spoke-hub-spoke itineraries and the combined ticket volume of both legs (self join of the route view).", () => `
-- Connecting itineraries worth a through fare
SELECT a.origin, a.destination AS hub, b.destination, a.tickets + b.tickets AS combined_tickets
FROM v_route_revenue a JOIN v_route_revenue b ON b.origin = a.destination AND b.destination <> a.origin
ORDER BY combined_tickets DESC, a.origin, b.destination LIMIT 15`),
    query("no_show_rate", "No-show rate by fare class", "Share of tickets on departed flights where the passenger did not fly.", (d) => `
-- Who doesn't show?
SELECT fc.name AS fare_class, COUNT(*) AS tickets, SUM(CASE WHEN t.status = 'no_show' THEN 1 ELSE 0 END) AS no_shows,
       ${d.round("100.0 * SUM(CASE WHEN t.status = 'no_show' THEN 1 ELSE 0 END) / COUNT(*)", 2)} AS no_show_pct
FROM ticket t JOIN fare_class fc ON fc.id = t.fare_class_id WHERE t.status IN ('flown', 'no_show') GROUP BY fc.name ORDER BY no_show_pct DESC`),
    query("revenue_trend", "Monthly revenue and yield", "Revenue by travel month with average fare and growth.", (d) => `
-- Yield trend
WITH m AS (SELECT ${d.ym("f.flight_date")} AS month, SUM(t.total_amount) AS revenue, COUNT(*) AS tickets FROM ticket t JOIN flight f ON f.id = t.flight_id GROUP BY ${d.ym("f.flight_date")})
SELECT month, tickets, ${d.round("revenue")} AS revenue, ${d.round("revenue / tickets")} AS avg_fare,
       ${d.round("100.0 * (revenue - LAG(revenue) OVER (ORDER BY month)) / NULLIF(LAG(revenue) OVER (ORDER BY month), 0)", 1)} AS mom_pct
FROM m ORDER BY month`),
    query("loyalty_liability", "Loyalty points liability", "Outstanding points by tier and an estimated liability at 1.2 cents each.", (d) => `
-- Balance-sheet view of the loyalty programme
SELECT tier, members, points_outstanding, ${d.round("points_outstanding * 0.012")} AS liability_usd FROM v_loyalty_tiers ORDER BY points_outstanding DESC`),
    query("baggage_issues", "Baggage issues by route", "Delayed and lost bags per route.", () => `
-- Mishandled baggage
SELECT ao.iata_code AS origin, ad.iata_code AS destination, COUNT(*) AS bags, SUM(CASE WHEN bg.status IN ('delayed', 'lost') THEN 1 ELSE 0 END) AS mishandled
FROM baggage bg JOIN ticket t ON t.id = bg.ticket_id JOIN flight f ON f.id = t.flight_id JOIN route r ON r.id = f.route_id
JOIN airport ao ON ao.id = r.origin_id JOIN airport ad ON ad.id = r.destination_id
GROUP BY ao.iata_code, ad.iata_code HAVING SUM(CASE WHEN bg.status IN ('delayed', 'lost') THEN 1 ELSE 0 END) > 0 ORDER BY mishandled DESC, origin, destination LIMIT 15`),
    query("crew_workload", "Crew workload", "Flights per crew member and role.", () => `
-- Crew utilisation
SELECT cm.role, cm.name, COUNT(*) AS flights FROM crew_assignment ca JOIN crew_member cm ON cm.id = ca.crew_member_id GROUP BY cm.role, cm.name ORDER BY flights DESC, cm.name LIMIT 15`),
  ],
});

function bkIndex(p: Plan, b: Bk): number {
  if (!idxCache.has(p)) { const m = new Map<Bk, number>(); p.bookings.forEach((x, i) => m.set(x, i + 1)); idxCache.set(p, m); }
  return idxCache.get(p)!.get(b)!;
}
const idxCache = new Map<Plan, Map<Bk, number>>();
