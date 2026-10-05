// Import of `npx burnmeter --export me.json` (schema burnmeter.team/1): adds Claude Code and
// Codex spend, which only exist in local logs, to the browser total. Only the per-day totals
// are kept; per-project hashes and model details aren't needed here.
export const SCHEMA = "burnmeter.team/1";

export function parseExport(json) {
  const d = typeof json === "string" ? JSON.parse(json) : json;
  if (d?.schema !== SCHEMA) throw new Error(`Not a burnmeter export (expected schema ${SCHEMA}). Run: npx burnmeter --export me.json`);
  if (!Array.isArray(d.by_day)) throw new Error("burnmeter export has no by_day totals");
  const byDay = d.by_day.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x?.day) && Number.isFinite(x?.cost)).map((x) => ({ day: x.day, cost: x.cost }));
  return { generated: d.generated, until: d.period?.until, tools: Array.isArray(d.tools) ? d.tools : [], byDay };
}
