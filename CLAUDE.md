# CLAUDE.md

Chrome extension (Manifest V3) showing one developer's AI coding spend this month: Cursor (read from the user's own dashboard) + Claude Code/Codex (imported burnmeter export) + budget alerts. Companion to the burnmeter CLI (`../burnmeter`, public at github.com/hieu10x/burnmeter). This repo is public.

## Layout
```
manifest.json            MV3 manifest. Keep permissions and host_permissions minimal (a test enforces it)
src/content/hook.js      MAIN world, document_start: wraps fetch/XHR, copies JSON responses the page already got
src/content/bridge.js    isolated world: relays hook.js messages to the service worker
src/background.js        service worker: message handlers (serialised), storage, budget notifications
src/lib/*.js             pure ES modules, unit-tested in Node: shape (redaction), cursor, burnmeter, summary
src/popup, src/options   UI (plain HTML/CSS/JS, light + dark)
test/                    node --test; fixtures/ hold scrubbed or synthetic vendor responses
scripts/                 zip.sh (Web Store package), make-icons.py, e2e.mjs (Chromium + fake dashboard)
```

## Commands
- `npm test`: unit tests. Run before every commit.
- `npm i && CHROME=<chrome binary> npm run e2e`: run after changing hook/bridge/background/popup. Locally: `CHROME=~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`.
- `npm run zip`: build `dist/burnmeter-extension-<version>.zip`. Bump `version` in both manifest.json and package.json first (zip.sh checks that they match).

## Rules
- **No network requests of our own, ever.** Read only what vendor pages already load. Never read, store or send cookies, tokens or headers.
- **No remote code** (Web Store policy): no CDN scripts, no eval. Everything ships in the zip.
- **Discovery stores shapes, never values.** Anything shown in Settings must be safe to paste into a public issue.
- **Single purpose:** track the user's own AI coding spend. Team features (roll-up across developers, sync, history, Slack) belong to the paid Burnmeter team product, not here. The only team touchpoint is the popup's one link with `utm_source=chrome_ext`.
- No runtime dependencies. `puppeteer-core` is a dev-only dependency for e2e.
- Fixtures from real dashboards must be scrubbed: no emails, ids or team names. Mark synthetic fixtures with a `_note`.
- Store listing text and screenshots must be factual. No fake reviews or usage numbers.
- Keep the code style of burnmeter: small modules, short comments that explain why.

## Release checklist
1. `npm test` and `npm run e2e` pass. 2. Bump versions. 3. `npm run zip`. 4. Load the zip's contents unpacked in a clean profile and check the Cursor page + popup by hand. 5. The owner uploads in the Chrome Web Store dev console (publisher account is the owner's). The Web Store privacy answers must match the README's Privacy section.
