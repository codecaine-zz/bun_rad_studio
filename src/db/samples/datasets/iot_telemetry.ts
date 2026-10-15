import { addDays, hashString, mulberry32 } from "../gen";
import { dataset, query, table, view, type Scale } from "../model";

const ASOF = "2025-06-30";
const KINDS: { kind: string; unit: string; base: number; amp: number; noise: number; spike: number }[] = [
  { kind: "temperature", unit: "C", base: 21, amp: 4, noise: 0.6, spike: 14 }, { kind: "humidity", unit: "%", base: 48, amp: 9, noise: 2, spike: 25 },
  { kind: "pressure", unit: "kPa", base: 101.3, amp: 0.6, noise: 0.15, spike: 4 }, { kind: "vibration", unit: "mm/s", base: 2.2, amp: 0.8, noise: 0.4, spike: 9 },
  { kind: "power", unit: "kW", base: 14, amp: 6, noise: 1.2, spike: 25 }, { kind: "co2", unit: "ppm", base: 650, amp: 180, noise: 30, spike: 900 },
  { kind: "flow", unit: "L/min", base: 38, amp: 12, noise: 2.5, spike: 40 }, { kind: "battery", unit: "%", base: 88, amp: 0, noise: 0.3, spike: 0 },
];
const CFG: Record<Scale, { SITES: number; D: number; K: number }> = { small: { SITES: 3, D: 8, K: 60 }, medium: { SITES: 8, D: 30, K: 400 }, large: { SITES: 15, D: 60, K: 1800 } };
const SENSORS_PER_DEVICE = 3;
const hh = (a: number, b: number) => { let x = Math.imul(a * 2654435761 + b * 40503 + 12345, 1274126177); x ^= x >>> 15; x = Math.imul(x, 2246822519); x ^= x >>> 13; return (x >>> 0) / 4294967296; };
const endSec = Date.parse(`${ASOF}T23:45:00Z`) / 1000;
const isoSec = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 19).replace("T", " ");
const sensorKind = (s: number) => KINDS[(s - 1) % KINDS.length]!;
const tsOf = (K: number, k: number) => endSec - (K - 1 - k) * 900;
function valueAt(s: number, k: number, K: number): number {
  const kd = sensorKind(s);
  const sec = tsOf(K, k);
  const hour = (sec / 3600) % 24;
  const phase = hh(s, 1) * 6;
  const season = kd.kind === "battery" ? -((K - k) * 0.004) : kd.amp * Math.sin(((hour - 6 + phase) / 24) * 2 * Math.PI);
  const noise = (hh(s, k + 7) - 0.5) * 2 * kd.noise;
  const spike = kd.spike && hh(s, k + 900001) < 0.0025 ? kd.spike * (0.6 + hh(s, k + 5)) : 0;
  return Math.round((kd.base * (0.9 + 0.2 * hh(s, 2)) + season + noise + spike) * 100) / 100;
}
const sensors = (s: Scale) => CFG[s].D * SENSORS_PER_DEVICE;

export default dataset({
  id: "iot_telemetry",
  title: "IoT Telemetry",
  tagline: "Sites, gateways, devices, sensors, 15-minute readings, hourly rollups, alerts and maintenance.",
  description:
    "A fleet of building and industrial sensors: sites with gateways, device types and firmware releases, devices with three sensors each (temperature, humidity, pressure, vibration, power, CO2, flow, battery), " +
    "a large time-series table of 15-minute readings with daily cycles, noise and occasional spikes, hourly roll-ups that match the raw data, alert rules and alerts, device online/offline events, " +
    "calibrations, commands and maintenance tickets. Built for window functions: moving averages, z-score anomalies and latest-value-per-sensor. All data is synthetic.",
  tags: ["IoT", "Time series", "Operations"],
  asOf: ASOF,
  highlights: ["time-series volume", "moving averages (window frames)", "z-score anomalies", "hourly roll-up = raw", "latest value per sensor"],
  tables: [
    table("site", "Monitored locations.", ["id id", "code str(8) uq", "name str(60)", "city str(40)", "state char(2)", "timezone str(30)"], {
      n: [CFG.small.SITES, CFG.medium.SITES, CFG.large.SITES], gen: (g, i) => { const p = g.place(); return { code: `SITE${String(i).padStart(3, "0")}`, name: `${p.city} ${g.pick(["Plant", "Warehouse", "Campus", "Data Hall", "Depot"])}`, city: p.city, state: p.state, timezone: g.pick(["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"]) }; },
    }),
    table("device_type", "Hardware models.", ["id id", "model str(30) uq", "manufacturer str(40)", "battery_powered bool", "reporting_interval_s int"], { rows: [["EnvNode-100", "Lumen Devices", true, 900], ["VibeSense-20", "Granite Sensors", true, 900], ["PowerMeter-3", "Ridge Instruments", false, 900], ["AirQ-7", "Orchid IoT", false, 900], ["FlowTrack-5", "Harbor Controls", true, 900]].map(([model, manufacturer, battery_powered, reporting_interval_s]) => ({ model, manufacturer, battery_powered, reporting_interval_s })) }),
    table("firmware_release", "Firmware versions.", ["id id", "version str(12) uq", "released_on date", "notes str(100) null"], { rows: ["1.0.2", "1.1.0", "1.2.4", "2.0.0", "2.0.3", "2.1.0"].map((version, i) => ({ version, released_on: addDays("2023-06-01", i * 95), notes: i === 3 ? "New radio stack" : null })) }),
    table("gateway", "Edge gateways that collect readings.", ["id id", "site_id int fk:site", "serial_no str(16) uq", "ip_address str(15)", "last_seen_at ts", "status enum(online,offline)"], {
      n: (n) => n("site") * 2, gen: (g, i) => ({ site_id: Math.ceil(i / 2), serial_no: `GW${String(i).padStart(8, "0")}`, ip_address: `10.${Math.ceil(i / 2)}.${g.int(0, 255)}.${g.int(1, 254)}`, last_seen_at: `${ASOF} 23:${String(g.int(30, 59))}:00`, status: g.w([["online", 95], ["offline", 5]] as const) }),
    }),
    table("device", "Devices, each reporting three sensors.", ["id id", "serial_no str(16) uq", "device_type_id int fk:device_type", "site_id int fk:site", "gateway_id int fk:gateway", "firmware_id int fk:firmware_release", "installed_on date", "status enum(online,offline,maintenance,retired)", "location_note str(60) null", "updated_at ts upd"], {
      n: [CFG.small.D, CFG.medium.D, CFG.large.D], ix: ["site_id,status", "firmware_id"],
      gen: (g, i) => { const site = ((i - 1) % g.count("site")) + 1; return { serial_no: `DEV${g.hex(8).toUpperCase()}`, device_type_id: ((i - 1) % 5) + 1, site_id: site, gateway_id: (site - 1) * 2 + 1 + (i % 2), firmware_id: g.w([[1, 4], [2, 8], [3, 18], [4, 20], [5, 30], [6, 20]] as const), installed_on: g.date("2023-06-01", "2025-03-01"), status: g.w([["online", 90], ["offline", 5], ["maintenance", 4], ["retired", 1]] as const), location_note: g.bool(0.6) ? `${g.pick(["Floor", "Rack", "Zone", "Bay"])} ${g.int(1, 20)}` : null }; },
    }),
    table("sensor", "Measuring channels of a device.", ["id id", "device_id int fk:device cascade", "kind enum(temperature,humidity,pressure,vibration,power,co2,flow,battery)", "unit str(8)", "sampling_seconds int def:900", "calibrated_on date null"], {
      n: (n) => n("device") * SENSORS_PER_DEVICE, ix: ["kind"],
      gen: (g, i) => ({ device_id: Math.ceil(i / SENSORS_PER_DEVICE), kind: sensorKind(i).kind, unit: sensorKind(i).unit, sampling_seconds: 900, calibrated_on: g.bool(0.9) ? g.date("2024-01-01", "2025-05-01") : null }),
    }),
    table("reading", "The time series: one value per sensor every 15 minutes.", ["id id", "sensor_id int fk:sensor", "recorded_at ts", "value dec(12,3)", "quality enum(good,suspect)"], {
      n: (n, s) => sensors(s) * CFG[s].K, uq: [["sensor_id", "recorded_at"]], ix: ["recorded_at"],
      gen: (g, i) => { const S = g.count("sensor"); const K = CFG[g.scale].K; const s = ((i - 1) % S) + 1; const k = Math.floor((i - 1) / S); const v = valueAt(s, k, K); return { sensor_id: s, recorded_at: isoSec(tsOf(K, k)), value: v, quality: hh(s, k + 31) < 0.004 ? "suspect" : "good" }; },
    }),
    table("hourly_stat", "Hourly roll-up of the readings (equals the raw data aggregated).", ["id id", "sensor_id int fk:sensor", "hour_start ts", "avg_value dec(12,3)", "min_value dec(12,3)", "max_value dec(12,3)", "samples smallint"], {
      n: (n, s) => sensors(s) * (CFG[s].K / 4), uq: [["sensor_id", "hour_start"]],
      gen: (g, i) => { const S = g.count("sensor"); const K = CFG[g.scale].K; const s = ((i - 1) % S) + 1; const h = Math.floor((i - 1) / S); const vals = [0, 1, 2, 3].map((j) => valueAt(s, h * 4 + j, K)); return { sensor_id: s, hour_start: isoSec(tsOf(K, h * 4)), avg_value: Math.round((vals.reduce((a, b) => a + b, 0) / 4) * 1000) / 1000, min_value: Math.min(...vals), max_value: Math.max(...vals), samples: 4 }; },
    }),
    table("alert_rule", "Thresholds that raise alerts.", ["id id", "name str(60) uq", "kind str(16)", "comparison enum(above,below)", "threshold dec(10,2)", "severity enum(info,warning,critical)"], { rows: [["High temperature", "temperature", "above", 28, "warning"], ["Freezing risk", "temperature", "below", 5, "critical"], ["High humidity", "humidity", "above", 65, "warning"], ["Excess vibration", "vibration", "above", 6, "critical"], ["Power spike", "power", "above", 30, "warning"], ["Poor air quality", "co2", "above", 1000, "warning"], ["Low flow", "flow", "below", 15, "warning"], ["Battery low", "battery", "below", 20, "critical"]].map(([name, kind, comparison, threshold, severity]) => ({ name, kind, comparison, threshold, severity })) }),
    table("alert", "Alerts raised when a reading crossed a rule.", ["id id", "alert_rule_id int fk:alert_rule", "sensor_id int fk:sensor", "triggered_at ts", "cleared_at ts null", "peak_value dec(12,3)", "acknowledged_by str(40) null"], {
      n: [20, 250, 1500], ix: ["triggered_at", "sensor_id,triggered_at"],
      gen: (g, i) => { const rule = g.int(1, 8); const kind = ["temperature", "temperature", "humidity", "vibration", "power", "co2", "flow", "battery"][rule - 1]!; const cand = g.rows("sensor").filter((x) => x.kind === kind); const s = cand.length ? g.pick(cand) : g.rows("sensor")[0]!; const K = CFG[g.scale].K; const k = g.int(0, K - 12); const clear = g.bool(0.88); return { alert_rule_id: rule, sensor_id: s.id, triggered_at: isoSec(tsOf(K, k)), cleared_at: clear ? isoSec(Math.min(endSec, tsOf(K, k) + g.int(1, 30) * 900)) : null, peak_value: g.round(sensorKind(Number(s.id)).base * g.float(1.1, 2.2)), acknowledged_by: g.bool(0.6) ? g.first() : null }; },
    }),
    table("device_event", "Device lifecycle events.", ["id id", "device_id int fk:device cascade", "event_type enum(online,offline,reboot,firmware_update,battery_low)", "occurred_at ts", "details json null"], {
      n: [40, 500, 3000], ix: ["device_id,occurred_at"],
      gen: (g) => { const t = g.w([["online", 30], ["offline", 28], ["reboot", 18], ["firmware_update", 10], ["battery_low", 14]] as const); return { device_id: g.fkSkew(g.count("device"), 1.3), event_type: t, occurred_at: g.tsBetween("2025-04-01", ASOF), details: t === "firmware_update" ? { from: "2.0.3", to: "2.1.0" } : t === "battery_low" ? { level_pct: g.int(5, 19) } : null }; },
    }),
    table("calibration", "Calibration records per sensor.", ["id id", "sensor_id int fk:sensor cascade", "calibrated_on date", "offset_value dec(8,4)", "technician str(40)"], {
      n: (n) => n("sensor"), uq: [["sensor_id", "calibrated_on"]], gen: (g, i) => ({ sensor_id: i, calibrated_on: g.date("2024-01-01", "2025-05-01"), offset_value: g.float(-0.4, 0.4, 4), technician: `${g.first()} ${g.last()}` }),
    }),
    table("command_log", "Remote commands sent to devices.", ["id id", "device_id int fk:device", "command enum(reboot,set_interval,update_firmware,calibrate,identify)", "issued_at ts", "status enum(sent,acked,failed)", "issued_by str(40)"], {
      n: [30, 400, 2500], gen: (g) => ({ device_id: g.fkSkew(g.count("device"), 1.2), command: g.pick(["reboot", "set_interval", "update_firmware", "calibrate", "identify"]), issued_at: g.tsBetween("2025-04-01", ASOF), status: g.w([["acked", 88], ["sent", 4], ["failed", 8]] as const), issued_by: `${g.first()} ${g.last()}` }),
    }),
    table("maintenance_ticket", "Field-service tickets.", ["id id", "device_id int fk:device", "opened_at ts", "closed_at ts null", "category enum(battery,sensor_fault,connectivity,mounting,firmware)", "priority enum(low,normal,high)", "notes str(120) null"], {
      n: [10, 80, 400], gen: (g) => { const open = g.bool(0.25); const o = g.tsBetween("2025-03-01", ASOF); return { device_id: g.fkSkew(g.count("device"), 1.3), opened_at: o, closed_at: open ? null : (() => { const c = g.shift(o, g.int(1, 9)); return c > `${ASOF} 23:59:59` ? o : c; })(), category: g.pick(["battery", "sensor_fault", "connectivity", "mounting", "firmware"]), priority: g.w([["low", 30], ["normal", 50], ["high", 20]] as const), notes: g.bool(0.5) ? g.sentence(6) : null }; },
    }),
  ],
  views: [
    view("v_latest_reading", "Most recent reading of every sensor.", () => `
SELECT sensor_id, kind, unit, recorded_at, value FROM (
  SELECT r.sensor_id, s.kind, s.unit, r.recorded_at, r.value, ROW_NUMBER() OVER (PARTITION BY r.sensor_id ORDER BY r.recorded_at DESC) AS rn
  FROM reading r JOIN sensor s ON s.id = r.sensor_id
) t WHERE rn = 1`),
    view("v_device_health", "Device status with battery, last reading and open alerts.", () => `
SELECT d.id AS device_id, d.serial_no, dt.model, st.code AS site, d.status, f.version AS firmware,
       (SELECT COUNT(*) FROM alert a JOIN sensor s ON s.id = a.sensor_id WHERE s.device_id = d.id AND a.cleared_at IS NULL) AS open_alerts
FROM device d JOIN device_type dt ON dt.id = d.device_type_id JOIN site st ON st.id = d.site_id JOIN firmware_release f ON f.id = d.firmware_id`),
    view("v_daily_stats", "Daily minimum, maximum and average per sensor.", (d) => `
SELECT sensor_id, ${d.dateOf("recorded_at")} AS day, COUNT(*) AS samples, MIN(value) AS min_value, MAX(value) AS max_value, ${d.round("AVG(value)", 2)} AS avg_value
FROM reading GROUP BY sensor_id, ${d.dateOf("recorded_at")}`),
    view("v_open_alerts", "Alerts that have not cleared yet.", () => `
SELECT a.id AS alert_id, ar.name AS rule, ar.severity, d.serial_no AS device, s.kind, a.triggered_at, a.peak_value
FROM alert a JOIN alert_rule ar ON ar.id = a.alert_rule_id JOIN sensor s ON s.id = a.sensor_id JOIN device d ON d.id = s.device_id WHERE a.cleared_at IS NULL`),
    view("v_offline_devices", "Devices that are not online.", () => `
SELECT d.serial_no, d.status, st.name AS site, d.updated_at FROM device d JOIN site st ON st.id = d.site_id WHERE d.status <> 'online'`),
    view("v_fleet_by_firmware", "Fleet size, open alerts and tickets per firmware version.", () => `
SELECT f.version, COUNT(DISTINCT d.id) AS devices, COUNT(DISTINCT mt.id) AS tickets
FROM firmware_release f LEFT JOIN device d ON d.firmware_id = f.id LEFT JOIN maintenance_ticket mt ON mt.device_id = d.id GROUP BY f.version`),
  ],
  queries: [
    query("moving_average", "Moving average and deviation", "Temperature smoothed with a 4-reading moving average (window frame) and the deviation from it.", (d) => `
-- Smooth the signal: average of the current and previous 3 readings
SELECT recorded_at, value,
       ${d.round("AVG(value) OVER (ORDER BY recorded_at ROWS BETWEEN 3 PRECEDING AND CURRENT ROW)", 2)} AS moving_avg_4,
       ${d.round("value - AVG(value) OVER (ORDER BY recorded_at ROWS BETWEEN 3 PRECEDING AND CURRENT ROW)", 2)} AS deviation
FROM reading WHERE sensor_id = (SELECT MIN(id) FROM sensor WHERE kind = 'temperature') ORDER BY recorded_at LIMIT 30`),
    query("zscore_anomalies", "Statistical outliers", "Readings more than 3 standard deviations from their sensor's mean (variance from AVG of squares, no SQRT needed).", (d) => `
-- Statistical outliers per sensor: (value - mean)^2 > 9 * variance
WITH st AS (SELECT sensor_id, AVG(value) AS mean_v, AVG(value * value) - AVG(value) * AVG(value) AS var_v FROM reading GROUP BY sensor_id)
SELECT r.sensor_id, s.kind, r.recorded_at, r.value, ${d.round("r.value - st.mean_v", 2)} AS deviation, ${d.round("st.mean_v", 2)} AS sensor_mean
FROM reading r JOIN st ON st.sensor_id = r.sensor_id JOIN sensor s ON s.id = r.sensor_id
WHERE st.var_v > 0 AND (r.value - st.mean_v) * (r.value - st.mean_v) > 9 * st.var_v
ORDER BY (r.value - st.mean_v) * (r.value - st.mean_v) DESC, r.sensor_id, r.recorded_at LIMIT 15`),
    query("daily_cycle", "Daily cycle by hour", "Average value by hour of day for each sensor kind (shows the daily rhythm).", (d) => `
-- When is each signal highest?
SELECT s.kind, ${d.hour("r.recorded_at")} AS hour, ${d.round("AVG(r.value)", 2)} AS avg_value
FROM reading r JOIN sensor s ON s.id = r.sensor_id WHERE s.kind IN ('temperature', 'power', 'co2')
GROUP BY s.kind, ${d.hour("r.recorded_at")} ORDER BY s.kind, hour`),
    query("alert_backlog", "Alert backlog by rule", "Alerts per rule with how many are still open and the cleared share.", (d) => `
-- Which rules fire most, and do they clear?
SELECT ar.name, ar.severity, COUNT(*) AS alerts, SUM(CASE WHEN a.cleared_at IS NULL THEN 1 ELSE 0 END) AS still_open,
       ${d.round("100.0 * SUM(CASE WHEN a.cleared_at IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*)", 1)} AS cleared_pct
FROM alert a JOIN alert_rule ar ON ar.id = a.alert_rule_id GROUP BY ar.name, ar.severity ORDER BY alerts DESC, ar.name`),
    query("firmware_faults", "Faults by firmware", "Offline events and tickets per firmware version (join of 4 tables).", () => `
-- Is a firmware release less stable?
SELECT f.version, COUNT(DISTINCT d.id) AS devices, SUM(CASE WHEN e.event_type = 'offline' THEN 1 ELSE 0 END) AS offline_events, SUM(CASE WHEN e.event_type = 'reboot' THEN 1 ELSE 0 END) AS reboots
FROM firmware_release f JOIN device d ON d.firmware_id = f.id LEFT JOIN device_event e ON e.device_id = d.id GROUP BY f.version ORDER BY f.version`),
    query("temp_humidity", "Temperature vs humidity", "Same-timestamp readings of a device's temperature and humidity sensors (self join).", (d) => `
-- Correlated channels of one device
SELECT t.recorded_at, t.value AS temperature_c, h.value AS humidity_pct
FROM reading t JOIN sensor st ON st.id = t.sensor_id AND st.kind = 'temperature'
JOIN sensor sh ON sh.device_id = st.device_id AND sh.kind = 'humidity'
JOIN reading h ON h.sensor_id = sh.id AND h.recorded_at = t.recorded_at
WHERE st.device_id = (SELECT MIN(device_id) FROM sensor WHERE kind = 'humidity') ORDER BY t.recorded_at LIMIT 20`),
    query("rollup_check", "Roll-up equals raw data", "Compares the hourly table with the raw readings; every difference should be 0.", (d) => `
-- Data-quality check: aggregate the raw data and compare with the stored roll-up
SELECT COUNT(*) AS hours_checked, SUM(CASE WHEN ABS(x.raw_avg - h.avg_value) > 0.001 THEN 1 ELSE 0 END) AS mismatches
FROM hourly_stat h
JOIN (SELECT sensor_id, ${d.dateOf("recorded_at")} AS day, ${d.hour("recorded_at")} AS hr, AVG(value) AS raw_avg FROM reading GROUP BY sensor_id, ${d.dateOf("recorded_at")}, ${d.hour("recorded_at")}) x
  ON x.sensor_id = h.sensor_id AND x.day = ${d.dateOf("h.hour_start")} AND x.hr = ${d.hour("h.hour_start")}`),
  ],
});
