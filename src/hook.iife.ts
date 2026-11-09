// Runs inside the Instagram page itself (MAIN world, before the site's own scripts).
// It only OBSERVES the site's own API requests and remembers the header/token values they use,
// so the extension can send an unfollow request that looks exactly like the site's.
(() => {
  const WATCH = /\/(api\/v1|graphql)\//;
  const WANT = ["x-asbd-id", "x-ig-www-claim", "x-instagram-ajax", "x-web-session-id", "x-ig-max-touch-points", "x-ig-app-id"];
  const state = {};

  const publish = () => {
    const el = document.documentElement;
    if (!el) return setTimeout(publish, 50);
    try { el.setAttribute("data-nfb", JSON.stringify(state)); } catch {}
  };

  const harvest = (h, body) => {
    let changed = false;
    for (const k of WANT) if (h[k] && state[k] !== h[k]) { state[k] = h[k]; changed = true; }
    const str = body instanceof URLSearchParams ? body.toString() : typeof body === "string" ? body : "";
    if (str.includes("fb_dtsg=")) {
      const p = new URLSearchParams(str);
      for (const k of ["fb_dtsg", "jazoest"]) { const v = p.get(k); if (v && state[k] !== v) { state[k] = v; changed = true; } }
    }
    if (changed) publish();
  };

  const xOpen = XMLHttpRequest.prototype.open;
  const xSet = XMLHttpRequest.prototype.setRequestHeader;
  const xSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__nfb = { url: String(u), h: {} };
    return xOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__nfb) this.__nfb.h[String(k).toLowerCase()] = v;
    return xSet.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try { if (this.__nfb && WATCH.test(this.__nfb.url)) harvest(this.__nfb.h, body); } catch {}
    return xSend.apply(this, arguments);
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && (input as any).url) || "";
      if (WATCH.test(url)) {
        const h = {};
        new Headers((init && init.headers) || (input && (input as Request).headers) || {}).forEach((v, k) => (h[k] = v));
        harvest(h, init && init.body);
      }
    } catch {}
    return origFetch.apply(this, arguments);
  };
})();
