# Burnmeter for Chrome

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
