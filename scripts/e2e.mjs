// End-to-end: load the unpacked extension in Chromium, serve a FAKE cursor.com dashboard via
// request interception (no request reaches Cursor), and check capture → storage → popup,
// burnmeter import, budget alert state, and that the discovery panel holds no values.
// Usage: CHROME=/path/to/chrome npm run e2e   (needs `npm i` for puppeteer-core)
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import os from "node:os";
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const TMP = fs.mkdtempSync(os.tmpdir() + "/burnmeter-e2e-");
// Load only what ships in the Web Store zip, not the repo (no node_modules, tests or scripts).
const EXT = TMP + "/ext";
for (const f of ["manifest.json", "LICENSE", "icons", "src"]) fs.cpSync(`${ROOT}/${f}`, `${EXT}/${f}`, { recursive: true });
const fixture = fs.readFileSync(ROOT + "/test/fixtures/cursor-synthetic.json", "utf8")
  // shift timestamps into the current month so they count
  .replace(/"1759(\d{9})"/g, (_, r) => `"${Date.now() - 3600e3 - Number(r.slice(-6))}"`)
  .replace("2025-10-05T10:00:00Z", new Date(Date.now() - 7200e3).toISOString());
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/chromium",
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-sandbox"],
});
const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("background.js"), { timeout: 10000 });
const id = new URL(sw.url()).host;
console.log("extension id", id);
const errors = [];
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.setRequestInterception(true);
page.on("request", (r) => {
  const u = r.url();
  if (u.startsWith("https://cursor.com/dashboard")) return r.respond({ contentType: "text/html", body: `<html><body>fake dashboard<script>
    fetch('/api/dashboard/get-filtered-usage-events', {method:'POST'}).then(r=>r.json()).then(()=>document.title='fetched');
    const x = new XMLHttpRequest(); x.open('GET','/api/usage-summary'); x.send();
  </script></body></html>` });
  if (u.startsWith("https://cursor.com/api/dashboard/get-filtered-usage-events")) return r.respond({ contentType: "application/json", body: fixture });
  if (u.startsWith("https://cursor.com/api/usage-summary")) return r.respond({ contentType: "application/json", body: JSON.stringify({ billingCycleStart: "x", email: "secret@example.com", individualUsage: { plan: { used: 3, limit: 20 } } }) });
  if (u.endsWith("/favicon.ico")) return r.respond({ status: 204 });
  r.abort();
});
await page.goto("https://cursor.com/dashboard?tab=usage");
await page.waitForFunction(() => document.title === "fetched", { timeout: 5000 });
await new Promise((r) => setTimeout(r, 800));

const popup = await browser.newPage();
popup.on("console", (m) => m.type() === "error" && errors.push("popup: " + m.text()));
await popup.goto(`chrome-extension://${id}/src/popup/popup.html`);
await popup.waitForFunction(() => document.querySelectorAll("#sources li").length > 0, { timeout: 5000 });
console.log("popup total:", await popup.$eval("#total", (e) => e.textContent));
console.log("popup sources:", await popup.$$eval("#sources li", (l) => l.map((x) => x.innerText.replace(/\n/g, " | "))));

// import burnmeter export through the real file input
const [chooser] = await Promise.all([popup.waitForFileChooser(), popup.click("#import")]);
const bm = JSON.parse(fs.readFileSync(ROOT + "/test/fixtures/burnmeter-export.json", "utf8"));
const today = new Date().toISOString().slice(0, 10);
bm.by_day = [{ day: today, cost: 10 }]; bm.generated = new Date().toISOString();
fs.writeFileSync(TMP + "/bm.json", JSON.stringify(bm));
await chooser.accept([TMP + "/bm.json"]);
await popup.waitForFunction(() => document.querySelectorAll("#sources li").length === 2, { timeout: 5000 });
console.log("after import total:", await popup.$eval("#total", (e) => e.textContent), "|", await popup.$eval("#msg", (e) => e.textContent));
console.log("team link:", await popup.$eval("#team", (e) => e.href));

const opts = await browser.newPage();
await opts.goto(`chrome-extension://${id}/src/options/options.html`);
await opts.type("#budget", "12"); await opts.click("#saveBudget");
await new Promise((r) => setTimeout(r, 300));
const disc = await opts.$eval("#discovery", (e) => e.textContent);
console.log("discovery leaks email?", disc.includes("secret@example.com"), "| paths:", [...disc.matchAll(/"path": "([^"]+)"/g)].map((m) => m[1]));
const st = await sw.worker().then((w) => w.evaluate(() => chrome.storage.local.get(["alertsSent", "settings"])));
console.log("budget/alerts state:", JSON.stringify(st));
await popup.reload(); await popup.waitForSelector("#bar:not([hidden])");
console.log("popup pace:", await popup.$eval("#pace", (e) => e.textContent));
await popup.screenshot({ path: TMP + "/popup.png" });
console.log("screenshot:", TMP + "/popup.png");
console.log("console errors:", errors.length ? errors : "none");
await browser.close();
fs.rmSync(EXT, { recursive: true, force: true });
