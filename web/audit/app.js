// AI Seat Audit page. Reads dropped files with FileReader, runs the shared audit core, renders.
// Nothing is sent anywhere: no fetch/XHR in this file, and the page's CSP blocks it anyway.
// Data from files is only ever set via textContent, never innerHTML.
import { detect, KIND_LABELS } from "./lib/sources.js";
import { buildAudit, auditCsv, DEFAULT_SETTINGS, TOOLS, TOOL_LABELS } from "./lib/audit.js";
import { sampleFiles } from "./lib/sample.js";

// Tally form for the anonymised benchmark; empty hides the card.
const BENCHMARK_FORM = "";
const SETTINGS_KEY = "burnmeter-audit-settings";

const $ = (id) => document.getElementById(id);
const files = [];
let settings = loadSettings();

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { ...DEFAULT_SETTINGS, ...s, prices: { ...DEFAULT_SETTINGS.prices, ...s.prices }, mapping: { ...s.mapping } };
  } catch { return structuredClone(DEFAULT_SETTINGS); }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode: settings just don't persist */ }
}

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}
const usd = (n) => (n ? "$" + (Math.abs(n) >= 100 || Number.isInteger(n) ? Math.round(n).toLocaleString("en-US") : n.toFixed(2)) : "–");

function addFile(name, text, sample = false) {
  let parsed = null, error = null;
  try { parsed = detect(text); } catch (e) { error = e.message; }
  files.push({ name, parsed, error, sample });
}

async function readFiles(list) {
  if (files.some((f) => f.sample)) clearFiles();
  for (const f of list) {
    if (f.size > 50e6) { files.push({ name: f.name, error: "Larger than 50 MB; is this the right file?" }); continue; }
    addFile(f.name, await f.text());
  }
  render();
}
function clearFiles() { files.length = 0; }

function renderFiles() {
  const ul = $("filelist");
  ul.replaceChildren(...files.map((f, i) => h("li", {},
    h("span", {}, f.name),
    f.error ? h("span", { class: "err" }, f.error) : h("span", { class: "kind" }, KIND_LABELS[f.parsed.kind]),
    h("button", { type: "button", "aria-label": `Remove ${f.name}`, onclick: () => { files.splice(i, 1); render(); } }, "Remove"),
  )));
}

const textCols = new Set(["Tool", "Why", "Top model", "Flags"]);
function table(el, head, rows, foot) {
  el.replaceChildren(
    h("thead", {}, h("tr", {}, head.map((c, i) => h("th", { class: textCols.has(c) || i === 0 ? "t" : "" }, c)))),
    h("tbody", {}, rows.length ? rows : h("tr", {}, h("td", { class: "empty", colspan: head.length }, "Nothing found."))),
    foot ? h("tfoot", {}, foot) : "",
  );
}

function renderReport(a) {
  const s = a.summary;
  $("report-sub").textContent = files.some((f) => f.sample) ? "(sample)" : `(${files.filter((f) => f.parsed).length} files)`;
  $("tiles").replaceChildren(
    tile(usd(s.total), "estimated per month"),
    tile(usd(s.perEngineer), `per person (${s.engineers} people)`),
    tile(usd(s.idleCost), `${s.idleSeats} seat${s.idleSeats === 1 ? "" : "s"} nobody uses`),
    tile(String(s.overlapPeople), `people paying for 2+ tools (up to ${usd(s.overlapSaving)})`),
  );
  $("findings").replaceChildren(...a.findings.map((f) => h("li", {}, f)));

  const tools = Object.keys(a.byTool);
  table($("bytool"), ["Tool", "Seats", "Seat cost", "Usage on top", "Total"],
    tools.map((t) => { const x = a.byTool[t]; return h("tr", {}, h("td", {}, TOOL_LABELS[t]), h("td", {}, x.seats || "–"), h("td", {}, usd(x.seatCost)), h("td", {}, usd(x.usage)), h("td", {}, usd(x.seatCost + x.usage))); }),
    h("tr", { class: "sum" }, h("td", {}, "Total"), h("td", {}, ""), h("td", {}, usd(s.seatTotal)), h("td", {}, usd(s.usageTotal)), h("td", {}, usd(s.total))));

  table($("idle"), ["Person", "Tool", "Why", "Per month"],
    a.idle.map((x) => h("tr", {}, h("td", {}, who(x.person)), h("td", { class: "t" }, TOOL_LABELS[x.tool]), h("td", { class: "t" }, x.note), h("td", {}, usd(x.cost)))));

  table($("people"), ["Person", ...tools.map((t) => TOOL_LABELS[t]), "Total", "Top model", "Flags"],
    a.rows.map((r) => h("tr", {},
      h("td", {}, who(r.label)),
      tools.map((t) => {
        const c = r.tools[t];
        if (!c) return h("td", {}, "–");
        const parts = [c.seat ? usd(c.seatCost) : "", c.usage ? `+${usd(c.usage)}` : ""].filter(Boolean).join(" ");
        return h("td", { title: c.seat ? "seat + usage billed on top" : "usage" }, parts || "$0");
      }),
      h("td", {}, usd(r.total)),
      h("td", { class: "t" }, r.topModel || "–"),
      h("td", { class: "flags" }, [
        r.seatsHeld.length >= 2 ? `${r.seatsHeld.length} tools` : "",
        ...TOOLS.filter((t) => r.tools[t]?.seat && r.tools[t].active === false).map((t) => `idle ${TOOL_LABELS[t]}`),
        r.key.startsWith("@") ? "GitHub name not matched" : "",
      ].filter(Boolean).join(" · ")),
    )));

  const notes = [
    "Per person = seat fee at the prices below + usage billed on top of the seat (Cursor on-demand, Copilot AI credits over the included amount, Claude net spend, API spend from burnmeter). Exports cover different ranges, so treat totals as a monthly estimate.",
    `A seat counts as unused if the person used nothing this cycle (Cursor) or in the last ${settings.idleDays} days (Copilot).`,
    "\"2+ tools\" is a question to ask the person, not a verdict: some people genuinely use two.",
    ...a.notes,
    ...a.periods.map((p) => `${p.source}: ${p.from} to ${p.to}.`),
  ];
  $("notes").replaceChildren(...notes.map((n) => h("li", {}, n)));
  renderMapping(a);
  renderBenchmark(a);
}
// "Name <email>" as the name with the email underneath, so wide tables stay readable.
function who(label) {
  const m = /^(.*) <(.+)>$/.exec(label);
  return m ? [m[1], h("span", { class: "email" }, m[2])] : label;
}
const tile = (v, l) => h("div", { class: "tile" }, h("div", { class: "v" }, v), h("div", { class: "l" }, l));

function renderMapping(a) {
  const box = $("mapping");
  const logins = [...new Set([...a.unmatched, ...Object.keys(settings.mapping)])].sort();
  if (!logins.length) return box.replaceChildren();
  box.replaceChildren(
    h("p", { class: "fine" }, "GitHub names that couldn't be matched to an email. Add the email so their Copilot seat joins the rest of their row."),
    h("div", { class: "form" }, logins.map((login) => h("label", {}, `@${login}`,
      h("input", { type: "email", placeholder: "name@company.com", value: settings.mapping[login] || "", onchange: (e) => {
        const v = e.target.value.trim();
        if (v) settings.mapping[login] = v; else delete settings.mapping[login];
        saveSettings(); render();
      } })))),
  );
}

function renderBenchmark(a) {
  const card = $("benchmark");
  const real = files.some((f) => f.parsed) && !files.some((f) => f.sample);
  card.hidden = !(BENCHMARK_FORM && real && a.summary.engineers);
  if (card.hidden) return;
  const s = a.summary;
  const q = new URLSearchParams({ engineers: s.engineers, tools: Object.keys(a.byTool).join("+"), monthly_total: Math.round(s.total), idle_cost: Math.round(s.idleCost), overlap_people: s.overlapPeople, utm_source: "audit", utm_medium: "web", utm_campaign: "benchmark" });
  $("benchmark-link").href = `https://tally.so/r/${BENCHMARK_FORM}?${q}`;
}

function renderSettings() {
  for (const el of document.querySelectorAll("[data-price]")) el.value = settings.prices[el.dataset.price];
  $("idleDays").value = settings.idleDays;
}

let last = null;
function render() {
  renderFiles();
  const sources = files.filter((f) => f.parsed).map((f) => f.parsed);
  $("report").hidden = !sources.length;
  $("samplebanner").hidden = !files.some((f) => f.sample);
  if (!sources.length) return;
  last = buildAudit(sources, settings);
  renderReport(last);
}

// Wiring
$("input").addEventListener("change", (e) => { readFiles([...e.target.files]); e.target.value = ""; });
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); readFiles([...e.dataTransfer.files]); });
// Dropping a file anywhere else would make the browser open it and leave the page.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer?.files?.length) readFiles([...e.dataTransfer.files]); });

$("sample").addEventListener("click", () => {
  clearFiles();
  for (const f of sampleFiles()) addFile(f.name, f.text, true);
  render();
  $("report").scrollIntoView({ behavior: "smooth" });
});
$("clear-sample").addEventListener("click", () => { clearFiles(); render(); $("files").scrollIntoView({ behavior: "smooth" }); });

for (const el of document.querySelectorAll("[data-price]")) el.addEventListener("change", () => {
  const v = Number(el.value);
  if (Number.isFinite(v) && v >= 0) { settings.prices[el.dataset.price] = v; saveSettings(); render(); }
});
$("idleDays").addEventListener("change", (e) => {
  const v = Math.round(Number(e.target.value));
  if (v >= 1) { settings.idleDays = v; saveSettings(); render(); }
});

$("csv").addEventListener("click", () => {
  if (!last) return;
  const url = URL.createObjectURL(new Blob([auditCsv(last)], { type: "text/csv" }));
  const a = h("a", { href: url, download: `ai-seat-audit-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("print").addEventListener("click", () => window.print());

renderSettings();
render();
