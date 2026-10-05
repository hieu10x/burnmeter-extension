# Burnmeter AI Seat Audit

A free, local audit for whoever pays for the team's AI coding tools. Drop in the exports you already have from **Cursor**, **GitHub Copilot** and **Claude** (plus [burnmeter](https://github.com/hieu10x/burnmeter) exports for Claude Code / Codex on API keys) and see:

- what each engineer costs per month across all tools (seat + usage billed on top)
- seats nobody uses
- people paying for two or three tools
- how concentrated usage charges are, and which models drive them

There's a one-page report to print or save as PDF, and a CSV for finance.

**Status:** the web page (`web/audit/`, served at burnmeter.pages.dev/audit) works today. A Chrome extension that pulls the Cursor numbers through the Admin API directly (Cursor's API doesn't allow calls from web pages) comes next.

## Inputs

| Vendor | File | How to get it |
|---|---|---|
| Cursor (Teams/Enterprise) | `/teams/members` + `/teams/spend` JSON | Admin API key, two `curl` commands (shown on the page) |
| GitHub Copilot | usage report CSV, seats JSON | Billing and licensing → Usage; `gh api /orgs/ORG/copilot/billing/seats --paginate --slurp` |
| Claude Team/Enterprise | spend report CSV | claude.ai → Analytics → spend report → Export CSV |
| Claude Code / Codex on API keys | burnmeter export | `npx burnmeter --export me.json --as you@company.com` |

## Privacy

Files are read in the browser and never uploaded. There is no `fetch` in the page code, and the page's Content-Security-Policy blocks network requests except Cloudflare's anonymous page-view beacon. Settings (prices, GitHub name → email mapping) are kept in your browser's localStorage; the files aren't.

## Develop

```sh
npm test                                     # unit tests (Node 20+, no dependencies)
npm run build:web                            # dist/web/audit, ready for Cloudflare Pages
npm i && CHROME=/path/to/chrome npm run e2e:web   # sample report, real upload, CSV, phone width, no foreign requests
```

The audit logic lives in `src/audit/` (pure ES modules, shared by the page and the coming extension). `src/audit/sample.js` is a synthetic team in the exact export formats; the page's "Try with sample data" and the tests both use it.

---

## Earlier: personal spend extension (0.0.1, frozen)

Your AI coding spend this month, as one number: **Cursor**, read from your own Cursor dashboard, plus **Claude Code and Codex**, imported from the [burnmeter CLI](https://github.com/hieu10x/burnmeter). Set a monthly budget and get a notification at 80% and 100%.

> **Status: pre-release (0.0.x).** Not on the Chrome Web Store yet. The Cursor reader is being checked against real dashboards. Until that's done it may show $0 or miss events. GitHub Copilot support depends on what GitHub's billing page exposes.

## How it works

- **Cursor:** when you open your Cursor dashboard, the extension copies the usage data the page itself downloads (the same JSON your browser already received) and adds up the priced usage events for the current month. It **doesn't make requests of its own** and doesn't read your cookies or tokens. It only counts what your dashboard has loaded, so open the usage tab (and page through it) to update the number.
- **Claude Code / Codex:** these only exist in local log files, which a browser can't read. Run `npx burnmeter --export me.json` and import the file from the popup. Only per-day totals are kept.
- **Budget:** set it under Settings. Alerts are based on the latest numbers the extension has seen. It checks every 6 hours and whenever new data arrives.

Months are UTC calendar months, the same day boundaries burnmeter uses.

## Privacy

- All data stays in `chrome.storage.local` in your browser. No server, no account, no analytics, no telemetry.
- The extension runs only on `cursor.com/dashboard*` and `github.com/settings/billing*`. Permissions: `storage`, `alarms`, `notifications`.
- **Settings → "What the extension has seen"** lists the pages and responses it captured, as **key names and types only** (no amounts, emails or ids), so you can paste it into an issue when a reader breaks.
- The only outbound link is the "Rolling this up for a team?" link in the popup. It opens the Burnmeter website, and only when you click it.

## Install (development)

1. `git clone https://github.com/hieu10x/burnmeter-extension`
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the folder.
3. Open your [Cursor usage page](https://cursor.com/dashboard?tab=usage), then click the Burnmeter icon.

## Develop

```sh
npm test            # unit tests (Node 20+, no dependencies)
npm i && CHROME=/path/to/chrome npm run e2e   # loads the extension in Chromium against a fake dashboard
npm run zip         # dist/burnmeter-extension-<version>.zip for the Web Store
```

When a vendor page changes and a reader breaks: copy the discovery output from Settings, add a scrubbed fixture under `test/fixtures/`, and update `src/lib/<vendor>.js`.

## Limitations

- Cursor's dashboard API is undocumented, and Cursor can change it at any time.
- Only events the dashboard has loaded are counted. If you never open the usage page, the Cursor number won't move.
- Costs are what each vendor shows. burnmeter's figures are estimates at public API rates.

## License

MIT
