// Doer: Validate email address format
export function isEmail(str: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
}

// Doer: Validate standard HTTP/HTTPS/FTP URL
export function isUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return ["http:", "https:", "ftp:"].includes(url.protocol);
  } catch {
    return false;
  }
}

// Doer: Validate IPv4 address
export function isIpv4(str: string): boolean {
  const parts = str.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d+$/.test(p)) return false;
    const n = parseInt(p, 10);
    return n >= 0 && n <= 255 && (p === "0" || !p.startsWith("0"));
  });
}

// Doer: Validate IPv6 address
export function isIpv6(str: string): boolean {
  return /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^::1$|^([0-9a-fA-F]{1,4}:){1,7}:$|^:((:[0-9a-fA-F]{1,4}){1,7}|:)$/.test(
    str.trim()
  );
}

// Doer: Validate E.164 or common domestic phone number format
export function isPhone(str: string): boolean {
  return /^\+?[0-9\s\-\(\)\.]{7,20}$/.test(str.trim()) && str.replace(/\D/g, "").length >= 7;
}

// Doer: Validate alphanumeric string without spaces or symbols
export function isAlphanumeric(str: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(str);
}

// Doer: Check if number falls within inclusive range [min, max]
export function inRange(val: number, min: number, max: number): boolean {
  return val >= min && val <= max;
}

// Doer: Validate UUID v4 format
export function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    str.trim()
  );
}

// Doer: Validate string is valid JSON
export function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

export const validutils = {
  isEmail,
  isUrl,
  isIpv4,
  isIpv6,
  isPhone,
  isAlphanumeric,
  inRange,
  isUuid,
  isJson,
};
