import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, csvObjects } from "../src/audit/csv.js";
import { detect } from "../src/audit/sources.js";
import { buildAudit, auditCsv } from "../src/audit/audit.js";
import { sampleFiles } from "../src/audit/sample.js";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const sample = () => sampleFiles(NOW).map((f) => detect(f.text));

test("csv: quotes, escaped quotes, embedded commas and newlines, CRLF, BOM", () => {
  const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n1,,3\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["x, y", 'say "hi"', "line1\nline2"], ["1", "", "3"]]);
  assert.deepEqual(csvObjects(" User_Email ,X\nA@B.co,1").rows, [{ user_email: "A@B.co", x: "1" }]);
});

test("detect: recognises every sample file", () => {
  assert.deepEqual(sample().map((s) => s.kind), ["cursor-members", "cursor-spend", "copilot-seats", "copilot-usage", "claude-spend", "burnmeter"]);
});

test("detect: gh --paginate output without --slurp (pages back to back)", () => {
  const page = (login) => JSON.stringify({ total_seats: 2, seats: [{ assignee: { login }, plan_type: "business", last_activity_at: null }] });
  const s = detect(page("a") + "\n" + page("b"));
  assert.deepEqual(s.seats.map((x) => x.login), ["a", "b"]);
});

test("detect: clear errors for API errors and unknown files", () => {
  assert.throws(() => detect('{"message":"Bad credentials","documentation_url":"x"}'), /GitHub returned an error/);
  assert.throws(() => detect("a,b\n1,2"), /Unrecognised CSV/);
  assert.throws(() => detect('{"foo":1}'), /Unrecognised JSON/);
  assert.throws(() => detect('{"teamMembers": ['), /doesn't parse/);
});

test("audit: sample team totals, idle seats, overlap, concentration", () => {
  const a = buildAudit(sample(), {}, NOW);
  const s = a.summary;
  assert.equal(s.engineers, 11); // removed Cursor member excluded; octo-ops unmatched stays separate
  assert.equal(s.seatTotal, 523); // 6×40 Cursor + 7×19 Copilot + 6×25 Claude
  assert.equal(s.usageTotal, 750.9); // 253 Cursor on-demand + 23.5 Copilot + 260 Claude + 214.4 API
  assert.equal(s.total, 1273.9);
  assert.equal(s.perEngineer, 115.81);
  assert.deepEqual(a.idle.map((x) => `${x.person.split(" <")[0]}:${x.tool}`).sort(), ["Chen:cursor", "Farid:copilot", "Hugo:copilot"]);
  assert.equal(s.idleCost, 78);
  assert.equal(s.overlapPeople, 7);
  assert.equal(s.overlapSaving, 164);
  assert.equal(s.topN, 2);
  assert.equal(s.topShare, 61); // alice 228 + dana 226.4 of 750.9
  assert.deepEqual(a.unmatched, ["octo-ops"]);
  assert.equal(a.rows[0].label, "Alice <alice@example.com>");
  assert.equal(a.rows[0].total, 312);
  assert.equal(a.rows[0].topModel, "claude-sonnet-5-5");
  assert.ok(a.findings.some((f) => f.includes("3 paid seats") && f.includes("$78/month")));
});

test("audit: GitHub logins auto-match emails from any source, mapping overrides", () => {
  const a = buildAudit(sample(), {}, NOW);
  const kim = a.rows.find((r) => r.key === "kim.lee@example.com");
  assert.deepEqual(kim.seatsHeld, ["copilot", "claude"]); // kim-lee matched to the Claude-only email
  const mapped = buildAudit(sample(), { mapping: { "octo-ops": "Eve@example.com" } }, NOW);
  assert.deepEqual(mapped.unmatched, []);
  assert.equal(mapped.summary.engineers, 10);
  assert.deepEqual(mapped.rows.find((r) => r.key === "eve@example.com").seatsHeld, ["cursor", "copilot"]);
});

test("audit: settings change prices and idle window", () => {
  const a = buildAudit(sample(), { prices: { cursor: 32 }, idleDays: 60 }, NOW);
  assert.equal(a.byTool.cursor.seatCost, 192);
  assert.equal(a.idle.filter((x) => x.tool === "copilot").length, 1); // Hugo (50 days) is no longer idle
});

test("audit: Copilot usage report alone assumes active seats and says what's missing", () => {
  const usage = sampleFiles(NOW).find((f) => f.name.endsWith(".csv") && f.name.startsWith("AIUsage"));
  const a = buildAudit([detect(usage.text)], {}, NOW);
  assert.equal(a.summary.idleSeats, 0);
  assert.equal(a.byTool.copilot.seats, 5); // farid and hugo have no usage rows
  assert.ok(a.notes.some((n) => n.includes("seats file")));
});

test("audit: empty input gives an empty report", () => {
  const a = buildAudit([], {}, NOW);
  assert.equal(a.summary.engineers, 0);
  assert.deepEqual(a.findings, []);
});

test("auditCsv: one row per person with flags", () => {
  const csv = auditCsv(buildAudit(sample(), {}, NOW)).trim().split("\n");
  assert.equal(csv[0], "person,cursor_seat_usd,cursor_usage_usd,copilot_seat_usd,copilot_usage_usd,claude_seat_usd,claude_usage_usd,api_seat_usd,api_usage_usd,total_usd,flags");
  assert.equal(csv.length, 12);
  assert.equal(csv[1], "Alice <alice@example.com>,40,186,19,0,25,42,0,0,312,3 tools");
  assert.ok(csv.some((l) => l.startsWith("Chen") && l.endsWith("2 tools; idle cursor")));
});
