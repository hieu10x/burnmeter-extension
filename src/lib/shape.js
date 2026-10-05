// Redacted structure of a JSON value: key names and types only, never values. Used by
// the discovery panel so a user can share what a dashboard returns without sharing data.
// Keys that look like data themselves (emails, dates, long ids) are replaced too.
const DATA_KEY = /@|^\d{4}-\d{2}|^\d{6,}$|^[0-9a-f-]{16,}$/i;

export function shape(v, depth = 0) {
  if (depth > 6) return "…";
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1), `×${v.length}`] : [];
  if (v === null) return "null";
  if (typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).slice(0, 40)) out[DATA_KEY.test(k) ? "<key>" : k] ??= shape(v[k], depth + 1);
    return out;
  }
  return typeof v;
}
