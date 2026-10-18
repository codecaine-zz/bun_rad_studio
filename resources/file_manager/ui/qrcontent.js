// What goes inside a QR code, for the usual jobs: builders that make the text for Wi-Fi, contacts, e-mail, SMS, phone numbers,
// places and calendar events, and `describePayload`, which recognizes the same kinds in text read from a code and lists
// their parts. Pure functions. Fields that hold a secret are marked `secret: true` so the page can hide them.

const escapeWifi = (s) => String(s).replace(/([\\;,":])/g, "\\$1");
const escapeVcard = (s) => String(s).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([;,])/g, "\\$1");
const escapeIcs = escapeVcard;
const clean = (s) => String(s ?? "").trim();

/** Wi-Fi network: security is "WPA" (also WPA2/WPA3), "WEP" or "nopass". */
export function wifiPayload({ ssid, password = "", security = "WPA", hidden = false }) {
  if (!clean(ssid)) throw new Error("Type the network name (SSID).");
  if (security !== "nopass" && !password) throw new Error("Type the Wi-Fi password, or choose “No password”.");
  if (security === "WPA" && (password.length < 8 || password.length > 63)) throw new Error("A WPA password is 8 to 63 characters long.");
  const t = security === "nopass" ? "nopass" : security === "WEP" ? "WEP" : "WPA";
  return `WIFI:T:${t};S:${escapeWifi(ssid)};${t === "nopass" ? "" : `P:${escapeWifi(password)};`}${hidden ? "H:true;" : ""};`;
}

/** A contact card (vCard 3.0). */
export function vcardPayload(c) {
  const first = clean(c.first);
  const last = clean(c.last);
  if (!first && !last && !clean(c.org)) throw new Error("Type at least a name or an organization.");
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${escapeVcard(last)};${escapeVcard(first)};;;`, `FN:${escapeVcard([first, last].filter(Boolean).join(" ") || clean(c.org))}`];
  if (clean(c.org)) lines.push(`ORG:${escapeVcard(clean(c.org))}`);
  if (clean(c.title)) lines.push(`TITLE:${escapeVcard(clean(c.title))}`);
  if (clean(c.phone)) lines.push(`TEL;TYPE=CELL:${clean(c.phone)}`);
  if (clean(c.workPhone)) lines.push(`TEL;TYPE=WORK:${clean(c.workPhone)}`);
  if (clean(c.email)) lines.push(`EMAIL:${clean(c.email)}`);
  if (clean(c.url)) lines.push(`URL:${clean(c.url)}`);
  if (clean(c.address)) lines.push(`ADR:;;${escapeVcard(clean(c.address))};;;;`);
  if (clean(c.note)) lines.push(`NOTE:${escapeVcard(clean(c.note))}`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

export function emailPayload({ to, subject = "", body = "" }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(to))) throw new Error("Type a valid e-mail address.");
  const q = [];
  if (clean(subject)) q.push(`subject=${encodeURIComponent(subject)}`);
  if (body) q.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${clean(to)}${q.length ? `?${q.join("&")}` : ""}`;
}

export function smsPayload({ number, message = "" }) {
  if (!/^\+?[0-9 ()-]{3,20}$/.test(clean(number))) throw new Error("Type a phone number (digits, and + at the start for a country code).");
  return `SMSTO:${clean(number).replace(/[ ()-]/g, "")}:${message}`;
}

export function phonePayload(number) {
  if (!/^\+?[0-9 ()-]{3,20}$/.test(clean(number))) throw new Error("Type a phone number (digits, and + at the start for a country code).");
  return `tel:${clean(number).replace(/[ ()-]/g, "")}`;
}

export function geoPayload({ lat, lon, label = "" }) {
  const la = Number(lat);
  const lo = Number(lon);
  if (clean(lat) === "" || clean(lon) === "" || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new Error("Latitude must be from -90 to 90 and longitude from -180 to 180.");
  return `geo:${la},${lo}${clean(label) ? `?q=${la},${lo}(${encodeURIComponent(clean(label))})` : ""}`;
}

const icsDate = (value, allDay) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Choose the start and end of the event.");
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return allDay ? `${p(d.getFullYear(), 4)}${p(d.getMonth() + 1)}${p(d.getDate())}` : `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};

/** A calendar event. `start` and `end` are anything Date understands (for example "2026-05-01T18:30"). */
export function eventPayload({ title, start, end, location = "", description = "", allDay = false }) {
  if (!clean(title)) throw new Error("Type a title for the event.");
  if (new Date(end) < new Date(start)) throw new Error("The event can't end before it starts.");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `SUMMARY:${escapeIcs(clean(title))}`, `DTSTART${allDay ? ";VALUE=DATE" : ""}:${icsDate(start, allDay)}`, `DTEND${allDay ? ";VALUE=DATE" : ""}:${icsDate(end, allDay)}`];
  if (clean(location)) lines.push(`LOCATION:${escapeIcs(clean(location))}`);
  if (clean(description)) lines.push(`DESCRIPTION:${escapeIcs(clean(description))}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\n");
}

/** Web address: adds https:// when no scheme is typed. Returns "" for empty input. */
export function urlPayload(value) {
  const v = clean(value);
  if (!v) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Recognizing what a code holds
// ---------------------------------------------------------------------------------------------------------------

const unescapeWifi = (s) => s.replace(/\\([\\;,":])/g, "$1");
const unescapeVcard = (s) => s.replace(/\\n/gi, "\n").replace(/\\([\\;,])/g, "$1");

/** Splits at a separator that isn't escaped with a backslash. */
const splitUnescaped = (s, sep) => {
  const out = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; }
    else if (s[i] === sep) { out.push(cur); cur = ""; }
    else cur += s[i];
  }
  out.push(cur);
  return out;
};

const field = (label, value, extra = {}) => ({ label, value, ...extra });

/**
 * What a piece of text is: { kind, title, fields: [{ label, value, secret? }], url? (a web address that is safe to offer to open), warning? }.
 * `kind` is one of url, wifi, contact, email, phone, sms, geo, event, otp, text.
 */
export function describePayload(text) {
  const t = String(text);
  const trimmed = t.trim();
  const upper = trimmed.slice(0, 12).toUpperCase();
  if (upper.startsWith("WIFI:")) {
    const parts = splitUnescaped(trimmed.slice(5), ";");
    const get = (k) => {
      const hit = parts.find((p) => p.startsWith(`${k}:`));
      return hit === undefined ? undefined : unescapeWifi(hit.slice(k.length + 1));
    };
    return { kind: "wifi", title: "Wi-Fi network", fields: [field("Network name", get("S") ?? ""), field("Security", get("T") ?? "none"), ...(get("P") ? [field("Password", get("P"), { secret: true })] : []), ...(get("H") === "true" ? [field("Hidden", "yes")] : [])] };
  }
  if (/^BEGIN:VCARD/i.test(trimmed)) {
    const lines = trimmed.split(/\r?\n/);
    const first = (prefix) => {
      const l = lines.find((x) => x.toUpperCase().startsWith(prefix));
      return l ? unescapeVcard(l.slice(l.indexOf(":") + 1)) : "";
    };
    const tels = lines.filter((x) => /^TEL/i.test(x)).map((x) => x.slice(x.indexOf(":") + 1));
    const name = first("FN") || first("N").split(";").filter(Boolean).reverse().join(" ");
    return { kind: "contact", title: "Contact", fields: [field("Name", name), ...(first("ORG") ? [field("Organization", first("ORG"))] : []), ...(first("TITLE") ? [field("Job title", first("TITLE"))] : []), ...tels.map((n) => field("Phone", n)), ...(first("EMAIL") ? [field("E-mail", first("EMAIL"))] : []), ...(first("URL") ? [field("Web", first("URL"))] : []), ...(first("ADR") ? [field("Address", first("ADR").split(";").filter(Boolean).join(", "))] : []), ...(first("NOTE") ? [field("Note", first("NOTE"))] : [])] };
  }
  if (/^MECARD:/i.test(trimmed)) {
    const items = splitUnescaped(trimmed.slice(7), ";").map((x) => [x.slice(0, x.indexOf(":")), x.slice(x.indexOf(":") + 1)]);
    const label = { N: "Name", TEL: "Phone", EMAIL: "E-mail", URL: "Web", ADR: "Address", NOTE: "Note", ORG: "Organization" };
    return { kind: "contact", title: "Contact", fields: items.filter(([k]) => label[k]).map(([k, v]) => field(label[k], k === "N" ? v.split(",").reverse().join(" ") : v)) };
  }
  if (/^BEGIN:VCALENDAR|^BEGIN:VEVENT/i.test(trimmed)) {
    const get = (key) => {
      const l = trimmed.split(/\r?\n/).find((x) => x.toUpperCase().startsWith(key));
      return l ? unescapeVcard(l.slice(l.indexOf(":") + 1)) : "";
    };
    return { kind: "event", title: "Calendar event", fields: [field("Title", get("SUMMARY")), field("Starts", get("DTSTART")), field("Ends", get("DTEND")), ...(get("LOCATION") ? [field("Where", get("LOCATION"))] : []), ...(get("DESCRIPTION") ? [field("Details", get("DESCRIPTION"))] : [])] };
  }
  if (/^mailto:/i.test(trimmed)) {
    let to = trimmed.slice(7);
    let query = "";
    const q = to.indexOf("?");
    if (q >= 0) { query = to.slice(q + 1); to = to.slice(0, q); }
    const params = new URLSearchParams(query);
    return { kind: "email", title: "E-mail", fields: [field("To", decodeURIComponent(to)), ...(params.get("subject") ? [field("Subject", params.get("subject"))] : []), ...(params.get("body") ? [field("Message", params.get("body"))] : [])] };
  }
  if (/^tel:/i.test(trimmed)) return { kind: "phone", title: "Phone number", fields: [field("Number", trimmed.slice(4))] };
  if (/^(smsto|sms|mmsto):/i.test(trimmed)) {
    const rest = trimmed.slice(trimmed.indexOf(":") + 1);
    const i = rest.indexOf(":");
    return { kind: "sms", title: "Text message", fields: [field("To", i >= 0 ? rest.slice(0, i) : rest.split("?")[0]), ...(i >= 0 && rest.slice(i + 1) ? [field("Message", rest.slice(i + 1))] : [])] };
  }
  if (/^geo:/i.test(trimmed)) {
    const [coords] = trimmed.slice(4).split(/[?;]/);
    const [lat, lon] = coords.split(",");
    return { kind: "geo", title: "Location", fields: [field("Latitude", lat ?? ""), field("Longitude", lon ?? "")], url: Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) ? `https://www.openstreetmap.org/?mlat=${Number(lat)}&mlon=${Number(lon)}#map=16/${Number(lat)}/${Number(lon)}` : undefined };
  }
  if (/^otpauth:\/\//i.test(trimmed)) {
    let params = new URLSearchParams();
    let label = "";
    try {
      const u = new URL(trimmed);
      params = u.searchParams;
      label = decodeURIComponent(u.pathname.replace(/^\//, ""));
    } catch { /* show it as text below */ }
    return { kind: "otp", title: "One-time-code setup (authenticator app)", fields: [field("Account", label), ...(params.get("issuer") ? [field("Issuer", params.get("issuer"))] : []), ...(params.get("secret") ? [field("Secret", params.get("secret"), { secret: true })] : [])], warning: "This code contains the secret key of a login. Anyone who sees it can generate your codes. Don't share it or post a picture of it." };
  }
  if (/^https?:\/\/\S+$/i.test(trimmed)) {
    let host = "";
    try { host = new URL(trimmed).host; } catch { /* leave empty */ }
    return { kind: "url", title: "Web address", fields: [field("Address", trimmed), ...(host ? [field("Site", host)] : [])], url: trimmed };
  }
  return { kind: "text", title: "Text", fields: [] };
}
