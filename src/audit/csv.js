// Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, commas and newlines inside
// quotes, CRLF, BOM. Vendor exports are small (a month of one team), so a simple scan is fine.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Rows as objects keyed by lower-cased, trimmed header names.
export function csvObjects(text) {
  const [head, ...rows] = parseCsv(text);
  if (!head) return { columns: [], rows: [] };
  const columns = head.map((h) => h.trim().toLowerCase());
  return { columns, rows: rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? "").trim()]))) };
}
