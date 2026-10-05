const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

async function loadBudget() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  $("budget").value = settings.budget ?? "";
}

async function loadDiscovery() {
  const d = await send({ type: "discovery" });
  const entries = Object.values(d || {}).sort((a, b) => b.lastSeen - a.lastSeen);
  if (!entries.length) return;
  const view = entries.map(({ kind, host, path, status, count, events, shape }) => ({ kind, host, path, status, count, events, shape }));
  $("discovery").textContent = JSON.stringify(view, null, 2);
}

$("saveBudget").addEventListener("click", async () => {
  await send({ type: "setBudget", budget: $("budget").value });
  $("budgetMsg").textContent = "Saved";
});
$("refresh").addEventListener("click", loadDiscovery);
$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("discovery").textContent);
  $("copyMsg").textContent = "Copied";
});
for (const b of document.querySelectorAll("[data-clear]")) {
  b.addEventListener("click", async () => {
    await send({ type: "clear", keys: [b.dataset.clear] });
    b.textContent = "Cleared";
    loadDiscovery();
  });
}

loadBudget();
loadDiscovery();
