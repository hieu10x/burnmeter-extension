// End-to-end for the audit web page: build, serve dist/web locally, then in Chromium check
// the sample report, a real file upload, the CSV download, phone width, and that the page
// makes no requests to other origins and logs no errors (CSP violations show up as errors).
// Usage: CHROME=/path/to/chrome npm run e2e:web   (needs `npm i` for puppeteer-core)
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { sampleFiles } from "../src/audit/sample.js";

const ROOT = new URL("..", import.meta.url).pathname;
execSync("sh scripts/build-web.sh", { cwd: ROOT, stdio: "inherit" });
const WEB = path.join(ROOT, "dist/web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(WEB, p);
  if (!f.startsWith(WEB) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const TMP = fs.mkdtempSync(os.tmpdir() + "/audit-e2e-");
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failures.push(msg); };

try {
  const page = await browser.newPage();
  const errors = [], foreign = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) foreign.push(r.url()); });
  await page.goto(`${ORIGIN}/audit/`, { waitUntil: "networkidle0" });
  check(await page.$eval("#report", (e) => e.hidden), "report hidden before any file");

  // Sample data: same numbers as the unit test (dates are relative, so they don't drift).
  await page.click("#sample");
  await page.waitForSelector("#report:not([hidden])");
  const tiles = await page.$$eval("#tiles .v", (els) => els.map((e) => e.textContent));
  check(JSON.stringify(tiles) === JSON.stringify(["$1,274", "$116", "$78", "7"]), `sample tiles ${JSON.stringify(tiles)}`);
  check(!(await page.$eval("#samplebanner", (e) => e.hidden)), "sample banner shown");
  check((await page.$$("#people tbody tr")).length === 11, "11 people rows");
  check((await page.$$("#idle tbody tr")).length === 3, "3 idle seats");
  check(await page.$eval("#benchmark", (e) => e.hidden), "benchmark hidden for sample data");

  // Settings: map the unmatched GitHub login, which merges two rows.
  await page.click("#settings summary");
  await page.type('#mapping input[type=email]', "eve@example.com");
  await page.$eval('#mapping input[type=email]', (e) => e.dispatchEvent(new Event("change")));
  check((await page.$$("#people tbody tr")).length === 10, "mapping merges @octo-ops into Eve's row");

  // Real upload path: files go through FileReader, not the sample shortcut.
  const paths = sampleFiles().map((f) => { const p = path.join(TMP, f.name); fs.writeFileSync(p, f.text); return p; });
  fs.writeFileSync(path.join(TMP, "junk.csv"), "a,b\n1,2\n");
  const input = await page.$("#input");
  await input.uploadFile(...paths, path.join(TMP, "junk.csv"));
  await page.waitForFunction(() => document.querySelectorAll("#filelist li").length === 7);
  const kinds = await page.$$eval("#filelist li", (els) => els.map((e) => e.children[1].textContent));
  check(kinds.filter((k) => !k.startsWith("Unrecognised")).length === 6 && kinds.some((k) => k.startsWith("Unrecognised CSV")), "6 files recognised, junk rejected with a message");
  check(await page.$eval("#samplebanner", (e) => e.hidden), "sample banner gone after real files");

  // CSV download.
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: TMP });
  await page.click("#csv");
  let csv = null;
  for (let i = 0; i < 50 && !csv; i++) {
    const f = fs.readdirSync(TMP).find((n) => n.startsWith("ai-seat-audit-") && n.endsWith(".csv"));
    if (f) csv = fs.readFileSync(path.join(TMP, f), "utf8");
    else await new Promise((r) => setTimeout(r, 100));
  }
  check(csv?.startsWith("person,cursor_seat_usd") && csv.trim().split("\n").length === 11, "CSV downloaded with 10 people (mapping persisted)");

  // Phone width: no horizontal page scroll (tables scroll inside their own box).
  await page.setViewport({ width: 375, height: 800 });
  const sw = await page.evaluate(() => document.scrollingElement.scrollWidth);
  check(sw <= 375, `no horizontal scroll at 375px (scrollWidth ${sw})`);
  await page.screenshot({ path: path.join(TMP, "mobile.png"), fullPage: true });
  await page.setViewport({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(TMP, "desktop.png"), fullPage: true });

  check(foreign.length === 0, `no requests to other origins ${foreign.join(" ")}`);
  check(errors.length === 0, `no console errors ${errors.join(" | ")}`);
  console.log(`screenshots in ${TMP}`);
} finally {
  await browser.close();
  server.close();
}
process.exit(failures.length ? 1 : 0);
