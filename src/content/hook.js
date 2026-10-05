// Runs in the vendor page's own JS context (MAIN world). It never makes a request:
// it only copies JSON responses the page itself already received and passes them to
// bridge.js. It doesn't read cookies, tokens or request headers.
(() => {
  const TAG = "burnmeter:capture";
  const PATHS = { "cursor.com": /\/api\//, "www.cursor.com": /\/api\//, "github.com": /billing|copilot|premium/i };
  const re = PATHS[location.hostname];
  if (!re) return;

  const resolve = (url) => {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin && re.test(u.pathname) ? u.pathname : null;
    } catch {
      return null;
    }
  };
  const post = (path, status, text) => {
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return;
    }
    window.postMessage({ [TAG]: true, path, status, body }, location.origin);
  };
  const isJson = (type) => (type || "").includes("json");

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const path = resolve(res.url || (args[0] instanceof Request ? args[0].url : String(args[0])));
      if (path && isJson(res.headers.get("content-type"))) res.clone().text().then((t) => post(path, res.status, t), () => {});
    } catch {}
    return res;
  };

  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__burnmeterPath = resolve(url);
    return open.call(this, method, url, ...rest);
  };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    const path = this.__burnmeterPath;
    if (path) {
      this.addEventListener("load", () => {
        try {
          if (isJson(this.getResponseHeader("content-type")) && (this.responseType === "" || this.responseType === "text")) post(path, this.status, this.responseText);
        } catch {}
      });
    }
    return send.apply(this, args);
  };
})();
