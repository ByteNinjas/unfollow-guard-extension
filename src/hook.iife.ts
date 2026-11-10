// Runs inside the Instagram page itself (MAIN world, before the site's own scripts).
// It only OBSERVES the site's own API requests and remembers the header/token values they use,
// so the extension can send an unfollow request that looks exactly like the site's.
(() => {
  const WATCH = /\/(api\/v1|graphql)\//;
  const WANT = ["x-asbd-id", "x-ig-www-claim", "x-instagram-ajax", "x-web-session-id", "x-ig-max-touch-points", "x-ig-app-id"];
  const state: Record<string, string> = {};
  let last = "";

  // Publish with events, never through a DOM attribute: tokens should not be readable from page
  // snapshots or survive in the document. The content script listens on the same document and also
  // on window messages (a portability fallback for isolated worlds).
  const publish = (force = false) => {
    const data = JSON.stringify(state);
    if (!force && data === last) return;
    last = data;
    try { document.dispatchEvent(new CustomEvent("nfb:tokens", { detail: data })); } catch {}
    try { window.postMessage({ __nfbTokens: data }, location.origin); } catch {}
  };
  // Always answer a replay request, even if nothing changed since the first publish: the content
  // script starts later than this hook and would otherwise never receive the tokens captured early.
  document.addEventListener("nfb:tokens-request", () => publish(true));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => publish(), { once: true });
  else publish();

  const harvest = (h: Record<string, string>, body: unknown) => {
    let changed = false;
    for (const k of WANT) if (h[k] && state[k] !== h[k]) { state[k] = h[k]; changed = true; }
    const str = body instanceof URLSearchParams ? body.toString() : typeof body === "string" ? body : "";
    if (str.includes("fb_dtsg=")) {
      const p = new URLSearchParams(str);
      for (const k of ["fb_dtsg", "jazoest"]) { const v = p.get(k); if (v && state[k] !== v) { state[k] = v; changed = true; } }
    }
    if (changed) publish();
  };

  type XhrWithNfb = XMLHttpRequest & { __nfb?: { url: string; h: Record<string, string> } };
  const xOpen = XMLHttpRequest.prototype.open;
  const xSet = XMLHttpRequest.prototype.setRequestHeader;
  const xSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (this: XhrWithNfb, method: string, url: string | URL, async = true, username?: string | null, password?: string | null) {
    this.__nfb = { url: String(url), h: {} };
    return (xOpen as any).call(this, method, url, async, username, password);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (this: XhrWithNfb, name: string, value: string) {
    if (this.__nfb) this.__nfb.h[name.toLowerCase()] = value;
    return xSet.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function (this: XhrWithNfb, body?: Document | XMLHttpRequestBodyInit | null) {
    try { if (this.__nfb && WATCH.test(this.__nfb.url)) harvest(this.__nfb.h, body); } catch {}
    return xSend.call(this, body);
  };

  const origFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (WATCH.test(url)) {
        const h: Record<string, string> = {};
        new Headers((init && init.headers) || (input instanceof Request ? input.headers : undefined) || {}).forEach((v, k) => (h[k] = v));
        harvest(h, init && init.body);
      }
    } catch {}
    return origFetch(input, init);
  };
})();
