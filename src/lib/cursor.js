// Cursor dashboard responses → usage events. The dashboard's internal API is undocumented
// and changes, so instead of trusting one endpoint name this looks for arrays of event-like
// objects (a timestamp, a model and a cost field) anywhere in a response.
// TENTATIVE: field names below come from Cursor's public Admin API docs and community
// tools; confirm against real dashboard responses (discovery panel) before release.

const CENT_PATHS = [["tokenUsage", "totalCents"], ["totalCents"], ["priceCents"], ["costCents"], ["chargedCents"]];
const DOLLAR_FIELDS = ["usageBasedCosts", "cost", "price"];

const get = (o, path) => path.reduce((v, k) => (v == null ? undefined : v[k]), o);

export function costOf(ev) {
  for (const p of CENT_PATHS) {
    const v = Number(get(ev, p));
    if (get(ev, p) != null && Number.isFinite(v)) return v / 100;
  }
  for (const f of DOLLAR_FIELDS) {
    const m = typeof ev[f] === "string" && ev[f].match(/^\s*\$\s*([\d.]+)/);
    if (m) return Number(m[1]);
  }
  return null;
}

export function timeOf(ev) {
  const raw = ev.timestamp ?? ev.createdAt ?? ev.date;
  if (raw == null) return null;
  if (typeof raw === "number" || /^\d+$/.test(raw)) {
    const n = Number(raw);
    return n < 1e12 ? n * 1000 : n;
  }
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

const isEvent = (o) => o && typeof o === "object" && !Array.isArray(o) && timeOf(o) != null && typeof (o.model ?? o.modelName) === "string";

function* eventArrays(v, depth = 0) {
  if (depth > 5 || v == null || typeof v !== "object") return;
  if (Array.isArray(v)) {
    if (v.some(isEvent)) yield v;
    else for (const x of v) yield* eventArrays(x, depth + 1);
    return;
  }
  for (const x of Object.values(v)) yield* eventArrays(x, depth + 1);
}

// → { events: [{ t, model, cost }], unpriced } ; events without any cost field are counted, not guessed.
export function parseCursor(body) {
  const events = [];
  let unpriced = 0;
  for (const arr of eventArrays(body)) {
    for (const ev of arr) {
      if (!isEvent(ev)) continue;
      const cost = costOf(ev);
      if (cost == null) {
        unpriced++;
        continue;
      }
      events.push({ t: timeOf(ev), model: ev.model ?? ev.modelName, cost });
    }
  }
  return { events, unpriced };
}

// Merge new events into the stored map (key = time|model|cost, so re-seeing a page of the
// dashboard doesn't double-count) and drop anything older than `keepMs`.
export function mergeEvents(stored = {}, events, now = Date.now(), keepMs = 62 * 864e5) {
  const out = {};
  for (const [k, e] of Object.entries(stored)) if (now - e.t <= keepMs) out[k] = e;
  for (const e of events) if (now - e.t <= keepMs) out[`${e.t}|${e.model}|${e.cost}`] = e;
  return out;
}
