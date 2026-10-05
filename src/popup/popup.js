const TEAM_URL = "https://burnmeter.pages.dev/?utm_source=chrome_ext&utm_medium=popup";
const $ = (id) => document.getElementById(id);
const usd = (n) => "$" + (n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2));
const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

function show(msg, isError) {
  $("msg").hidden = false;
  $("msg").textContent = msg;
  $("msg").className = "small" + (isError ? " error" : "");
}

async function render() {
  const s = await chrome.runtime.sendMessage({ type: "summary" });
  if (!s || s.error) return show(s?.error || "Couldn't load data", true);
  const monthName = new Date(`${s.month}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  $("month").textContent = `${monthName} (UTC)`;
  $("total").textContent = usd(s.total);
  const pace = s.forecast ? `on pace for ~${usd(s.forecast)}` : "";
  $("pace").textContent = s.budget ? `${s.pct}% of ${usd(s.budget)} budget${pace ? " · " + pace : ""}` : pace;
  if (s.budget) {
    $("bar").hidden = false;
    $("bar").classList.toggle("over", s.pct >= 100);
    $("bar").firstElementChild.style.width = Math.min(100, s.pct) + "%";
  }

  $("sources").replaceChildren(
    ...s.sources.map((src) => {
      const li = document.createElement("li");
      li.innerHTML = `<div class="row spread"><span class="label"></span><span class="cost"></span></div><div class="small muted meta"></div>`;
      li.querySelector(".label").textContent = src.label;
      li.querySelector(".cost").textContent = usd(src.cost);
      const meta = li.querySelector(".meta");
      meta.textContent = `Updated ${ago(src.updated)}${src.note ? " · " + src.note : ""}`;
      if (src.stale) meta.classList.add("stale");
      return li;
    }),
  );
  $("empty").hidden = s.sources.length > 0;
}

$("import").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async () => {
  const f = $("file").files[0];
  if (!f) return;
  const r = await chrome.runtime.sendMessage({ type: "importBurnmeter", json: await f.text() });
  if (r?.error) return show(r.error, true);
  show(`Imported ${r.days} day${r.days === 1 ? "" : "s"} from burnmeter.`);
  render();
});
$("team").href = TEAM_URL;

render();
