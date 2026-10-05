// Join the parsed exports into one row per engineer and derive the findings. Pure function:
// same inputs, same report, so it's unit-tested and shared by the web page and the extension.
//
// Money model, per engineer and tool: seat fee (list price, editable) + usage billed on top
// (Cursor on-demand, Copilot net AI credits, Claude net spend, API spend from burnmeter).
// Exports cover "this cycle" or a chosen range, so the totals are labelled as a month estimate.

export const TOOLS = ["cursor", "copilot", "claude", "api"];
export const TOOL_LABELS = { cursor: "Cursor", copilot: "Copilot", claude: "Claude", api: "API (burnmeter)" };

// Monthly list prices, USD, checked 2026-10-05. Admins should edit them to match their invoice
// (annual billing is ~20% lower; premium seats can't be told apart in the exports).
export const DEFAULT_SETTINGS = {
  prices: { cursor: 40, copilotBusiness: 19, copilotEnterprise: 39, claude: 25 },
  idleDays: 30,
  mapping: {}, // GitHub login -> email
};

const round = (n) => Math.round(n * 100) / 100;
const DAY = 864e5;

function topKey(obj) {
  let best = null;
  for (const [k, v] of Object.entries(obj || {})) if (v > 0 && (!best || v > obj[best])) best = k;
  return best;
}

export function buildAudit(sources, settings = {}, now = Date.now()) {
  const s = { ...DEFAULT_SETTINGS, ...settings, prices: { ...DEFAULT_SETTINGS.prices, ...settings.prices } };
  const by = (kind) => sources.filter((x) => x.kind === kind);
  const people = new Map();
  const person = (key, label) => {
    if (!people.has(key)) people.set(key, { key, label: label || key, tools: {}, models: {} });
    return people.get(key);
  };
  const tool = (p, t) => (p.tools[t] ||= { seat: false, seatCost: 0, usage: 0, active: null, note: "" });
  const addModels = (p, byModel) => { for (const [m, v] of Object.entries(byModel || {})) p.models[m] = (p.models[m] || 0) + v; };
  const notes = [];

  // Cursor. Members gives the seat list; spend gives on-demand $ and whether anything was used.
  const cursorMembers = by("cursor-members").flatMap((x) => x.members).filter((m) => !m.removed && m.email);
  const cursorSpend = by("cursor-spend").flatMap((x) => x.members).filter((m) => m.email);
  const seatEmails = new Set((cursorMembers.length ? cursorMembers : cursorSpend).map((m) => m.email));
  for (const e of seatEmails) {
    const m = cursorMembers.find((x) => x.email === e) || cursorSpend.find((x) => x.email === e);
    const c = tool(person(e, m.name ? `${m.name} <${e}>` : e), "cursor");
    c.seat = true;
    c.seatCost = s.prices.cursor;
  }
  for (const m of cursorSpend) {
    const c = tool(person(m.email), "cursor");
    c.usage += m.onDemand;
    c.active = (c.active || false) || m.overall > 0;
  }
  if (cursorMembers.length && !cursorSpend.length) notes.push("Cursor: add /teams/spend to see usage and idle seats.");
  if (seatEmails.size) notes.push(`Cursor seats priced at $${s.prices.cursor} (Standard). The API doesn't say which seats are Premium; edit the price if most of yours are.`);

  // Copilot. Seats carry the plan and last activity; the usage report carries billed credits.
  // Emails from every source, so Claude-only or burnmeter-only people can be matched too.
  const known = [...new Set([
    ...people.keys(),
    ...by("claude-spend").flatMap((x) => Object.keys(x.users)),
    ...by("burnmeter").map((x) => x.developer.toLowerCase()),
  ])].filter((k) => k.includes("@"));
  const squash = (v) => v.toLowerCase().replace(/[._-]/g, "");
  const loginKey = (login) => {
    if (s.mapping[login]) return { key: s.mapping[login].toLowerCase(), how: "mapped" };
    const hit = known.filter((e) => squash(e.split("@")[0]) === squash(login));
    if (hit.length === 1) return { key: hit[0], how: "auto" };
    return { key: "@" + login, how: null };
  };
  const unmatched = new Set();
  const seats = by("copilot-seats").flatMap((x) => x.seats);
  const usageUsers = Object.assign({}, ...by("copilot-usage").map((x) => x.users));
  const copilotLogins = new Set([...seats.map((x) => x.login), ...Object.keys(usageUsers)]);
  for (const login of copilotLogins) {
    const { key, how } = loginKey(login);
    if (!how) unmatched.add(login);
    const p = person(key, how ? undefined : `@${login} (GitHub)`);
    const c = tool(p, "copilot");
    const seat = seats.find((x) => x.login === login);
    const usage = usageUsers[login];
    if (seat || usage) {
      c.seat = true;
      c.seatCost = seat?.plan === "enterprise" ? s.prices.copilotEnterprise : s.prices.copilotBusiness;
    }
    if (seat) {
      c.active = seat.lastActivity != null && now - seat.lastActivity < s.idleDays * DAY;
      c.note = seat.lastActivity ? `last active ${new Date(seat.lastActivity).toISOString().slice(0, 10)}` : "never used";
    } else c.active = true; // only users with usage appear in the report
    if (usage) {
      c.usage += usage.net;
      c.active = c.active || usage.gross > 0;
      addModels(p, usage.byModel);
    }
  }
  if (by("copilot-usage").length && !seats.length) notes.push("Copilot: add the seats file to find seats nobody uses (the usage report lists only people with usage).");

  // Claude Team / Enterprise spend report: one row per person and model, people with usage only.
  for (const x of by("claude-spend")) {
    for (const [e, u] of Object.entries(x.users)) {
      const p = person(e);
      const c = tool(p, "claude");
      c.seat = true;
      c.seatCost = s.prices.claude;
      c.usage += u.net;
      c.active = (c.active || false) || u.requests > 0 || u.gross > 0;
      addModels(p, u.byModel);
    }
  }
  if (by("claude-spend").length) notes.push(`Claude seats priced at $${s.prices.claude} (Team Standard). The spend report lists only people who used Claude, so idle Claude seats don't show here.`);

  // burnmeter: Claude Code / Codex on API keys, labelled by the developer (ideally their email).
  for (const x of by("burnmeter")) {
    const key = x.developer.includes("@") ? x.developer.toLowerCase() : x.developer || "anonymous";
    const p = person(key);
    const c = tool(p, "api");
    c.usage += x.cost;
    c.active = true;
    addModels(p, x.byModel);
    if (!x.developer.includes("@")) notes.push(`burnmeter export "${x.developer}" has no email, so it can't be matched. Re-export with --as you@company.com.`);
  }

  // Rows and totals.
  const rows = [...people.values()].map((p) => {
    const seatCost = TOOLS.reduce((a, t) => a + (p.tools[t]?.seatCost || 0), 0);
    const usage = TOOLS.reduce((a, t) => a + (p.tools[t]?.usage || 0), 0);
    const seatsHeld = TOOLS.filter((t) => p.tools[t]?.seat);
    return { ...p, seatCost: round(seatCost), usage: round(usage), total: round(seatCost + usage), seatsHeld, topModel: topKey(p.models) };
  }).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  const byTool = Object.fromEntries(TOOLS.map((t) => {
    const held = rows.filter((r) => r.tools[t]);
    return [t, {
      seats: held.filter((r) => r.tools[t].seat).length,
      seatCost: round(held.reduce((a, r) => a + r.tools[t].seatCost, 0)),
      usage: round(held.reduce((a, r) => a + r.tools[t].usage, 0)),
    }];
  }).filter(([, v]) => v.seats || v.usage));

  const idle = [];
  for (const r of rows) for (const t of TOOLS) {
    const c = r.tools[t];
    if (c?.seat && c.active === false) idle.push({ person: r.label, tool: t, cost: c.seatCost, note: c.note || "no usage this cycle" });
  }
  const overlap = rows.filter((r) => r.seatsHeld.length >= 2).map((r) => {
    const costs = r.seatsHeld.map((t) => r.tools[t].seatCost);
    return { person: r.label, tools: r.seatsHeld, saving: round(costs.reduce((a, b) => a + b, 0) - Math.max(...costs)) };
  });

  const total = round(rows.reduce((a, r) => a + r.total, 0));
  const usageTotal = round(rows.reduce((a, r) => a + r.usage, 0));
  const users = rows.filter((r) => r.usage > 0).sort((a, b) => b.usage - a.usage);
  const topN = Math.max(1, Math.ceil(rows.length * 0.1));
  const topShare = usageTotal > 0 ? users.slice(0, topN).reduce((a, r) => a + r.usage, 0) / usageTotal : 0;

  const summary = {
    engineers: rows.length,
    tools: Object.keys(byTool).length,
    total,
    perEngineer: rows.length ? round(total / rows.length) : 0,
    seatTotal: round(rows.reduce((a, r) => a + r.seatCost, 0)),
    usageTotal,
    idleCost: round(idle.reduce((a, x) => a + x.cost, 0)),
    idleSeats: idle.length,
    overlapPeople: overlap.length,
    overlapSaving: round(overlap.reduce((a, x) => a + x.saving, 0)),
    topN,
    topShare: Math.round(topShare * 100),
  };

  const periods = [];
  for (const x of by("cursor-spend")) if (x.cycleStart) periods.push({ source: "Cursor", from: new Date(x.cycleStart).toISOString().slice(0, 10), to: "today" });
  for (const x of by("copilot-usage")) if (x.period) periods.push({ source: "Copilot", from: x.period.since, to: x.period.until });
  for (const x of by("burnmeter")) if (x.period) periods.push({ source: `burnmeter (${x.developer})`, from: x.period.since, to: x.period.until });

  return { summary, byTool, rows, idle, overlap, unmatched: [...unmatched].sort(), periods, notes, findings: findings(summary, s) };
}

const usd = (n) => "$" + (n >= 100 || Number.isInteger(n) ? Math.round(n).toLocaleString("en-US") : n.toFixed(2));

function findings(x, s) {
  const out = [];
  if (!x.engineers) return out;
  out.push(`${x.engineers} people across ${x.tools} source${x.tools === 1 ? "" : "s"}: about ${usd(x.total)}/month, ${usd(x.perEngineer)} per person.`);
  if (x.idleSeats) out.push(`${x.idleSeats} paid seat${x.idleSeats === 1 ? "" : "s"} with no use in the last ${s.idleDays} days or this cycle: ${usd(x.idleCost)}/month.`);
  if (x.overlapPeople) out.push(`${x.overlapPeople} ${x.overlapPeople === 1 ? "person pays" : "people pay"} for 2+ tools. If each kept only their main tool: up to ${usd(x.overlapSaving)}/month. Worth asking, not cutting blindly.`);
  if (x.usageTotal > 0) {
    out.push(`Usage billed on top of seats: ${usd(x.usageTotal)} (${Math.round((x.usageTotal / x.total) * 100)}% of the total).`);
    if (x.engineers >= 5) out.push(`${x.topN === 1 ? "One person accounts" : `The top ${x.topN} people account`} for ${x.topShare}% of that usage.`);
  }
  return out;
}

// One row per person for finance, stable column order.
export function auditCsv(audit) {
  const head = ["person", ...TOOLS.flatMap((t) => [`${t}_seat_usd`, `${t}_usage_usd`]), "total_usd", "flags"];
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [head.join(",")];
  for (const r of audit.rows) {
    const flags = [];
    if (r.seatsHeld.length >= 2) flags.push(`${r.seatsHeld.length} tools`);
    for (const t of TOOLS) if (r.tools[t]?.seat && r.tools[t].active === false) flags.push(`idle ${t}`);
    lines.push([r.label, ...TOOLS.flatMap((t) => [round(r.tools[t]?.seatCost || 0), round(r.tools[t]?.usage || 0)]), r.total, flags.join("; ")].map(esc).join(","));
  }
  return lines.join("\n") + "\n";
}
