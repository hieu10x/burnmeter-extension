// Service worker: receives captured dashboard responses and burnmeter imports, stores the
// numbers in chrome.storage.local, and sends budget notifications. No network requests.
import { shape } from "./lib/shape.js";
import { parseCursor, mergeEvents } from "./lib/cursor.js";
import { parseExport } from "./lib/burnmeter.js";
import { summarize, alertsDue } from "./lib/summary.js";

const store = chrome.storage.local;
const MAX_DISCOVERY = 60;
const VENDOR_HOSTS = new Set(["cursor.com", "www.cursor.com", "github.com"]);

const fromExtension = (sender) => sender.id === chrome.runtime.id && sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`);
const fromVendor = (sender) => {
  try {
    return sender.id === chrome.runtime.id && !!sender.tab && VENDOR_HOSTS.has(new URL(sender.url).hostname);
  } catch {
    return false;
  }
};

async function record(entry) {
  const { discovery = {} } = await store.get("discovery");
  const key = `${entry.host}${entry.path}`;
  const prev = discovery[key];
  discovery[key] = { ...entry, count: (prev?.count || 0) + 1, lastSeen: Date.now() };
  const keep = Object.entries(discovery).sort((a, b) => b[1].lastSeen - a[1].lastSeen).slice(0, MAX_DISCOVERY);
  await store.set({ discovery: Object.fromEntries(keep) });
}

async function checkBudget() {
  const state = await store.get(null);
  const s = summarize(state);
  const due = alertsDue(s, state.alertsSent);
  if (!due.length) return;
  const top = Math.max(...due);
  chrome.notifications.create(`budget-${s.month}-${top}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: top >= 100 ? "AI coding budget reached" : `AI coding spend at ${s.pct}% of budget`,
    message: `$${s.total.toFixed(2)} of $${s.budget} this month${s.forecast ? ` · on pace for ~$${Math.round(s.forecast)}` : ""}.`,
  });
  const prev = state.alertsSent?.month === s.month ? state.alertsSent.thresholds : [];
  await store.set({ alertsSent: { month: s.month, thresholds: [...new Set([...prev, ...due])] } });
}

async function handleCapture({ host, path, status, body }) {
  const parsed = host.endsWith("cursor.com") ? parseCursor(body) : { events: [], unpriced: 0 };
  await record({ kind: "response", host, path, status, shape: shape(body), events: parsed.events.length });
  if (!parsed.events.length) return;
  const { cursor = {} } = await store.get("cursor");
  await store.set({ cursor: { events: mergeEvents(cursor.events, parsed.events), unpriced: parsed.unpriced, updated: Date.now() } });
  await checkBudget();
}

const handlers = {
  capture: (msg, sender) => fromVendor(sender) && handleCapture(msg),
  page: (msg, sender) => fromVendor(sender) && record({ kind: "page", host: msg.host, path: msg.path }),
  summary: async (_m, sender) => fromExtension(sender) && summarize(await store.get(null)),
  importBurnmeter: async (msg, sender) => {
    if (!fromExtension(sender)) return;
    const bm = parseExport(msg.json);
    await store.set({ burnmeter: { ...bm, imported: Date.now() } });
    await checkBudget();
    return { ok: true, days: bm.byDay.length };
  },
  setBudget: async (msg, sender) => {
    if (!fromExtension(sender)) return;
    const budget = Number(msg.budget) > 0 ? Number(msg.budget) : null;
    const { settings = {} } = await store.get("settings");
    await store.set({ settings: { ...settings, budget }, alertsSent: {} });
    await checkBudget();
    return { ok: true };
  },
  discovery: async (_m, sender) => fromExtension(sender) && (await store.get("discovery")).discovery,
  clear: async (msg, sender) => fromExtension(sender) && store.remove(msg.keys),
};

// Handlers read-modify-write chrome.storage, so run them one at a time: two dashboard
// responses arriving together would otherwise overwrite each other's updates.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  serial(() => h(msg, sender))
    .then((r) => sendResponse(r ?? null))
    .catch((e) => sendResponse({ error: String(e.message || e) }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create("budget", { periodInMinutes: 360 }));
chrome.alarms.onAlarm.addListener((a) => a.name === "budget" && serial(checkBudget));
