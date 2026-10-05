// Recognise and normalise the admin exports the audit reads. Every parser takes the file's
// text and returns { kind, ... } in dollars and lower-cased emails, or throws a message the
// admin can act on. Formats (checked 2026-10-05):
//   Cursor Admin API      GET /teams/members, POST /teams/spend   (Teams and Enterprise)
//   GitHub Copilot        usage report CSV (Billing → Usage), seats API /orgs/{org}/copilot/billing/seats
//   Claude Team/Ent.      spend report CSV (Analytics → Spend → Export)
//   burnmeter             `npx burnmeter --export me.json --as you@company.com`
import { csvObjects } from "./csv.js";

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const email = (v) => String(v || "").trim().toLowerCase();
const add = (obj, key, n) => { obj[key] = (obj[key] || 0) + n; };

// gh api --paginate without --slurp prints pages back to back: "{...}{...}".
function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch (e) {
    if (/}\s*{/.test(text)) return JSON.parse(`[${text.replace(/}\s*{/g, "},{")}]`);
    throw e;
  }
}

function cursorMembers(d) {
  return {
    kind: "cursor-members",
    members: d.teamMembers.map((m) => ({ email: email(m.email), name: m.name || "", role: m.role || "", removed: !!m.isRemoved })),
  };
}

function cursorSpend(d) {
  return {
    kind: "cursor-spend",
    cycleStart: Number(d.subscriptionCycleStart) || null,
    members: d.teamMemberSpend.map((m) => ({
      email: email(m.email),
      name: m.name || "",
      onDemand: num(m.spendCents) / 100,           // billed on top of the seat
      overall: num(m.overallSpendCents ?? m.spendCents) / 100, // includes usage covered by the seat
    })),
  };
}

function copilotSeats(d) {
  const pages = Array.isArray(d) ? d : [d];
  const seats = pages.flatMap((p) => (p && Array.isArray(p.seats) ? p.seats : p?.assignee ? [p] : []));
  return {
    kind: "copilot-seats",
    seats: seats.map((s) => ({
      login: String(s.assignee?.login || "").toLowerCase(),
      plan: String(s.plan_type || "business").toLowerCase(),
      lastActivity: s.last_activity_at ? Date.parse(s.last_activity_at) : null,
      pendingCancel: !!s.pending_cancellation_date,
    })).filter((s) => s.login),
  };
}

function burnmeter(d) {
  const byModel = {};
  for (const m of d.by_model || []) add(byModel, m.model, num(m.cost));
  return { kind: "burnmeter", developer: String(d.developer || ""), period: d.period || null, cost: num(d.total?.cost), byModel };
}

function copilotUsage(rows) {
  const users = {};
  let since = null, until = null;
  for (const r of rows) {
    if (!r.username) continue;
    const u = (users[r.username.toLowerCase()] ||= { gross: 0, net: 0, byModel: {} });
    const gross = num(r.aic_gross_amount) || num(r.gross_amount);
    u.gross += gross;
    u.net += num(r.net_amount);
    add(u.byModel, r.model || "unknown", gross);
    const day = (r.date || "").slice(0, 10);
    if (day) { if (!since || day < since) since = day; if (!until || day > until) until = day; }
  }
  return { kind: "copilot-usage", period: since ? { since, until } : null, users };
}

function claudeSpend(rows) {
  const users = {};
  for (const r of rows) {
    const e = email(r.user_email);
    if (!e) continue;
    const u = (users[e] ||= { net: 0, gross: 0, requests: 0, byModel: {}, byProduct: {} });
    const net = num(r.total_net_spend_usd);
    u.net += net;
    u.gross += num(r.total_gross_spend_usd);
    u.requests += num(r.total_requests);
    add(u.byModel, r.model || "unknown", net);
    add(u.byProduct, r.product || "unknown", net);
  }
  return { kind: "claude-spend", users };
}

export function detect(text) {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    let d;
    try { d = parseJsonLoose(t); } catch { throw new Error("Looks like JSON but doesn't parse. Was the download cut off?"); }
    if (Array.isArray(d?.teamMembers)) return cursorMembers(d);
    if (Array.isArray(d?.teamMemberSpend)) return cursorSpend(d);
    if (d?.schema === "burnmeter.team/1") return burnmeter(d);
    const first = Array.isArray(d) ? d[0] : d;
    if (Array.isArray(first?.seats) || first?.assignee) return copilotSeats(d);
    if (d?.message && d?.documentation_url) throw new Error(`GitHub returned an error instead of data: "${d.message}"`);
    if (d?.error) throw new Error(`The API returned an error instead of data: ${JSON.stringify(d.error).slice(0, 120)}`);
    throw new Error("Unrecognised JSON. Expected Cursor /teams/members or /teams/spend, Copilot seats, or a burnmeter export.");
  }
  const { columns, rows } = csvObjects(t);
  if (columns.includes("username") && columns.includes("net_amount")) return copilotUsage(rows);
  if (columns.includes("user_email") && columns.includes("total_net_spend_usd")) return claudeSpend(rows);
  throw new Error("Unrecognised CSV. Expected the GitHub Copilot usage report or the Claude spend report.");
}

export const KIND_LABELS = {
  "cursor-members": "Cursor members",
  "cursor-spend": "Cursor spend",
  "copilot-usage": "Copilot usage report",
  "copilot-seats": "Copilot seats",
  "claude-spend": "Claude spend report",
  burnmeter: "burnmeter export",
};
