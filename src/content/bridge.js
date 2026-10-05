// Isolated-world relay: hook.js (page context) → background service worker.
// Only messages from this same page and carrying hook.js's tag are forwarded.
const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});

window.addEventListener("message", (e) => {
  if (e.source !== window || e.origin !== location.origin || e.data?.["burnmeter:capture"] !== true) return;
  const { path, status, body } = e.data;
  send({ type: "capture", host: location.hostname, path, status, body });
});

send({ type: "page", host: location.hostname, path: location.pathname });
