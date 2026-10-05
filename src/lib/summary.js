// Combine the stored sources into this month's view. Months are UTC calendar months, the
// same day boundaries burnmeter uses, so imported and browser-read days line up.
export const STALE_MS = 3 * 864e5;
export const THRESHOLDS = [80, 100];

export const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);
const daysIn = (ms) => {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
};
const round = (n) => Math.round(n * 100) / 100;
const TOOL_LABELS = { "claude-code": "Claude Code", codex: "Codex" };

export function summarize(state = {}, now = Date.now()) {
  const month = monthOf(now);
  const sources = [];

  const cursor = state.cursor;
  if (cursor?.updated) {
    const events = Object.values(cursor.events || {}).filter((e) => monthOf(e.t) === month);
    sources.push({
      id: "cursor",
      label: "Cursor",
      cost: round(events.reduce((s, e) => s + e.cost, 0)),
      updated: cursor.updated,
      stale: now - cursor.updated > STALE_MS,
      note: cursor.unpriced ? `${cursor.unpriced} event${cursor.unpriced === 1 ? "" : "s"} without a price skipped` : "Counts the usage events your dashboard has loaded",
    });
  }

  const bm = state.burnmeter;
  if (bm?.imported) {
    const tools = bm.tools.map((t) => TOOL_LABELS[t] || t).join(" + ") || "Claude Code / Codex";
    const updated = Date.parse(bm.generated) || bm.imported;
    sources.push({
      id: "burnmeter",
      label: `${tools} (burnmeter import)`,
      cost: round(bm.byDay.filter((d) => d.day.slice(0, 7) === month).reduce((s, d) => s + d.cost, 0)),
      updated,
      stale: now - updated > STALE_MS,
      note: bm.until ? `Logs up to ${bm.until}` : "",
    });
  }

  const total = round(sources.reduce((s, x) => s + x.cost, 0));
  const dayOfMonth = new Date(now).getUTCDate();
  const forecast = dayOfMonth >= 3 && total > 0 ? round((total / dayOfMonth) * daysIn(now)) : null;
  const budget = Number(state.settings?.budget) || null;
  return { month, sources, total, forecast, budget, pct: budget ? Math.round((total / budget) * 100) : null };
}

// Thresholds newly crossed this month that haven't been notified yet.
export function alertsDue(summary, sent = {}) {
  if (!summary.budget) return [];
  const done = sent.month === summary.month ? sent.thresholds || [] : [];
  return THRESHOLDS.filter((t) => summary.pct >= t && !done.includes(t));
}
