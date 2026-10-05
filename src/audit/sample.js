// SYNTHETIC sample team (example.com) in the exact formats of the real exports, for the page's
// "Try sample data" button and the tests. Dates are relative to `now` so idle seats stay idle.
const iso = (ms) => new Date(ms).toISOString();
const DAY = 864e5;

export function sampleFiles(now = Date.now()) {
  const cycle = now - 12 * DAY;
  const day = (n) => iso(now - n * DAY).slice(0, 10);

  const cursorMembers = { teamMembers: [
    ["Alice", "alice@example.com"], ["Bob", "bob@example.com"], ["Chen", "chen@example.com"],
    ["Eve", "eve@example.com"], ["Farid", "farid@example.com"], ["Hugo", "hugo@example.com"],
    ["Jon", "jon@example.com", true],
  ].map(([name, email, removed], i) => ({ id: `user_sample${i}`, name, email, role: i ? "member" : "owner", isRemoved: !!removed })) };

  // cents; spendCents = on-demand billed on top of the seat, overall includes included usage
  const spend = [["Alice", "alice@example.com", 18600, 31000], ["Bob", "bob@example.com", 1500, 5500],
    ["Chen", "chen@example.com", 0, 0], ["Eve", "eve@example.com", 0, 3800],
    ["Farid", "farid@example.com", 5200, 9600], ["Hugo", "hugo@example.com", 0, 2000]];
  const cursorSpend = {
    teamMemberSpend: spend.map(([name, email, s, o], i) => ({ userId: `user_sample${i}`, name, email, role: "member", spendCents: s, overallSpendCents: o, fastPremiumRequests: 0, hardLimitOverrideDollars: 0, monthlyLimitDollars: null, effectivePerUserLimitDollars: null })),
    subscriptionCycleStart: cycle, totalMembers: spend.length, totalPages: 1,
  };

  // gh api --paginate --slurp: an array of pages
  const seat = (login, last, plan = "business") => ({ created_at: iso(now - 200 * DAY), assignee: { login, type: "User" }, plan_type: plan, last_activity_at: last == null ? null : iso(now - last * DAY), last_activity_editor: last == null ? null : "vscode/1.104" });
  const copilotSeats = [{ total_seats: 7, seats: [seat("alice", 1), seat("bob", 2), seat("farid", null), seat("gia", 0), seat("hugo", 50), seat("kim-lee", 3), seat("octo-ops", 4)] }];

  const cols = "date,username,product,sku,model,quantity,unit_type,applied_cost_per_quantity,gross_amount,discount_amount,net_amount,total_monthly_quota,organization,cost_center_name,aic_quantity,aic_gross_amount";
  const cp = (d, user, model, credits, net) => {
    const gross = (credits * 0.01).toFixed(2);
    return [d, user, "copilot", "copilot_ai_credit", model, credits, "ai-credits", "0.01", gross, (gross - net).toFixed(2), net.toFixed(2), 1900, "ExampleOrg", "", credits, gross].join(",");
  };
  const copilotUsage = [cols,
    cp(day(9), "alice", "Auto: GPT-5.4", 820, 0), cp(day(6), "bob", "GPT-5.4 mini", 410, 0),
    cp(day(8), "gia", "Claude Opus 4.7", 2650, 7.5), cp(day(3), "gia", "Claude Opus 4.7", 1600, 16),
    cp(day(5), "kim-lee", "GPT-5.3-Codex", 900, 0), cp(day(4), "octo-ops", "Auto: GPT-5.4", 500, 0),
  ].join("\n") + "\n";

  const claudeCols = "user_email,account_uuid,product,model,total_requests,total_prompt_tokens,total_completion_tokens,total_net_spend_usd,total_gross_spend_usd";
  const cl = (email, product, model, req, net) => [email, "00000000-0000-4000-8000-000000000000", product, model, req, req * 9000, req * 700, net.toFixed(2), net.toFixed(2)].join(",");
  const claudeSpend = [claudeCols,
    cl("alice@example.com", "Chat", "claude-sonnet-5-5", 140, 42), cl("chen@example.com", "Claude Code", "claude-opus-5-5", 610, 128),
    cl("dana@example.com", "Chat", "claude-sonnet-5-5", 60, 12), cl("gia@example.com", "Chat", "claude-haiku-4-5", 90, 5),
    cl("ines@example.com", "Claude Code", "claude-sonnet-5-5", 300, 64), cl("kim.lee@example.com", "Chat", "claude-sonnet-5-5", 40, 9),
  ].join("\n") + "\n";

  const burnmeter = {
    _note: "synthetic", schema: "burnmeter.team/1", generated: iso(now), prices_checked: "2026-10-04",
    period: { since: day(12), until: day(0) }, developer: "dana@example.com", tools: ["claude-code", "codex"],
    total: { cost: 214.4, requests: 3120, input: 0, output: 0, cache_read: 0, cache_write: 0 },
    by_day: [], by_model: [{ model: "claude-opus-5-5", cost: 171.2 }, { model: "gpt-5.4", cost: 43.2 }], by_project: [], alerts: {},
  };

  return [
    { name: "cursor-members.json", text: JSON.stringify(cursorMembers, null, 1) },
    { name: "cursor-spend.json", text: JSON.stringify(cursorSpend, null, 1) },
    { name: "copilot-seats.json", text: JSON.stringify(copilotSeats, null, 1) },
    { name: "AIUsageReport_sample.csv", text: copilotUsage },
    { name: "claude-spend-report.csv", text: claudeSpend },
    { name: "dana-burnmeter.json", text: JSON.stringify(burnmeter, null, 1) },
  ];
}
