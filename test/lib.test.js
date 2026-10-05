import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { shape } from "../src/lib/shape.js";
import { parseCursor, mergeEvents, costOf, timeOf } from "../src/lib/cursor.js";
import { parseExport } from "../src/lib/burnmeter.js";
import { summarize, alertsDue } from "../src/lib/summary.js";

const fixture = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const NOW = Date.parse("2025-10-05T12:00:00Z");

test("shape keeps key names and types, never values", () => {
  const s = shape({ email: "a@b.co", cents: 12, list: [{ id: "x" }, { id: "y" }], "a@b.co": 1, "2025-10-01": 2 });
  assert.deepEqual(s, { email: "string", cents: "number", list: [{ id: "string" }, "×2"], "<key>": "number" });
  assert.ok(!JSON.stringify(s).includes("a@b.co"));
});

test("cursor: finds priced events, skips unpriced, reads cents and $ strings", () => {
  const { events, unpriced } = parseCursor(fixture("cursor-synthetic.json"));
  assert.equal(events.length, 4);
  assert.equal(unpriced, 1);
  assert.ok(Math.abs(events.reduce((s, e) => s + e.cost, 0) - 0.475) < 1e-9);
});

test("cursor: timestamps in ms, seconds and ISO", () => {
  assert.equal(timeOf({ timestamp: "1759622400000" }), 1759622400000);
  assert.equal(timeOf({ timestamp: 1759622400 }), 1759622400000);
  assert.equal(timeOf({ createdAt: "2025-10-05T00:00:00Z" }), Date.parse("2025-10-05T00:00:00Z"));
  assert.equal(timeOf({}), null);
  assert.equal(costOf({ priceCents: "250" }), 2.5);
  assert.equal(costOf({ model: "x" }), null);
});

test("cursor: re-seeing the same page doesn't double count; old events pruned", () => {
  const { events } = parseCursor(fixture("cursor-synthetic.json"));
  const once = mergeEvents({}, events, NOW);
  const twice = mergeEvents(once, events, NOW);
  assert.equal(Object.keys(twice).length, Object.keys(once).length);
  const later = mergeEvents(twice, [], NOW + 90 * 864e5);
  assert.equal(Object.keys(later).length, 0);
});

test("burnmeter: import validates schema and keeps day totals", () => {
  const bm = parseExport(JSON.stringify(fixture("burnmeter-export.json")));
  assert.equal(bm.byDay.length, 4);
  assert.deepEqual(bm.tools, ["claude-code", "codex"]);
  assert.throws(() => parseExport({ schema: "other" }), /Not a burnmeter export/);
});

test("summary: combines this month only, forecasts, flags stale", () => {
  const { events } = parseCursor(fixture("cursor-synthetic.json"));
  const state = {
    cursor: { events: mergeEvents({}, events, NOW), updated: NOW - 3600e3 },
    burnmeter: { ...parseExport(fixture("burnmeter-export.json")), imported: NOW },
    settings: { budget: 50 },
  };
  const s = summarize(state, NOW);
  assert.equal(s.month, "2025-10");
  const cursor = s.sources.find((x) => x.id === "cursor");
  const bm = s.sources.find((x) => x.id === "burnmeter");
  assert.equal(cursor.cost, 0.48); // 0.125 + 0.04 + 0 + 0.31, rounded
  assert.equal(bm.cost, 30.25); // October days only
  assert.equal(bm.label, "Claude Code + Codex (burnmeter import)");
  assert.equal(s.total, 30.73);
  assert.equal(s.forecast, Math.round((30.73 / 5) * 31 * 100) / 100);
  assert.equal(s.pct, 61);
  assert.equal(cursor.stale, false);
  assert.equal(summarize(state, NOW + 4 * 864e5).sources.find((x) => x.id === "cursor").stale, true);
});

test("alerts: each threshold once per month", () => {
  const s = { month: "2025-10", budget: 100, pct: 85 };
  assert.deepEqual(alertsDue(s, {}), [80]);
  assert.deepEqual(alertsDue(s, { month: "2025-10", thresholds: [80] }), []);
  assert.deepEqual(alertsDue({ ...s, pct: 120 }, { month: "2025-10", thresholds: [80] }), [100]);
  assert.deepEqual(alertsDue(s, { month: "2025-09", thresholds: [80, 100] }), [80]);
  assert.deepEqual(alertsDue({ ...s, budget: null }, {}), []);
});

test("manifest: narrow permissions, no remote code", () => {
  const m = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(m.permissions.sort(), ["alarms", "notifications", "storage"]);
  assert.ok(m.host_permissions.every((h) => /^https:\/\/(www\.)?cursor\.com\/\*$|^https:\/\/github\.com\/settings\/billing\*$/.test(h)));
  const files = fs.readdirSync(new URL("../src", import.meta.url), { recursive: true }).filter((f) => /\.(js|html)$/.test(f));
  for (const f of files) {
    const src = fs.readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
    assert.ok(!/<script[^>]+src=["']https?:/.test(src) && !/\beval\(|new Function\(/.test(src), `${f} loads remote or dynamic code`);
  }
});
