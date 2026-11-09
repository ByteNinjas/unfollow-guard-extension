// Toolbar badge, desktop notifications and the keyboard shortcut.
const refresh = async () => {
  const o = await chrome.storage.local.get<Record<string, any>>(["enabled", "nfb_status"]);
  const st = o.nfb_status || {};
  let text = "", color = "#6b7280";
  if (o.enabled === false) text = "OFF";
  else if (st.cool) { text = "COOL"; color = "#d97706"; }
  else if (st.running) { text = String(st.used || "•"); color = "#0095f6"; }
  else if (st.used > 0) { text = String(st.used); color = "#16a34a"; }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
};
chrome.runtime.onInstalled.addListener(refresh);
chrome.runtime.onStartup.addListener(refresh);
chrome.storage.onChanged.addListener((ch) => { if (ch.enabled || ch.nfb_status) refresh(); });
refresh();

// the page asks for a desktop notification (batch finished / stopped / blocked)
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "notify") return;
  chrome.storage.local.get<Record<string, any>>("notifyEnabled").then((o) => {
    if (o.notifyEnabled === false) return;
    chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title: String(msg.title || "Unfollow Guard"), message: String(msg.message || "") });
  });
});

// Alt+Shift+N: show or hide the panel in the active tab
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-panel") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" }).catch(() => {});
});

// Loads a profile picture for the page (the page itself may be blocked from loading it). Only picture hosts of
// Instagram and Facebook are allowed, only images, and only small ones; no cookies are sent.
const PIC_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "fetch-image") return false;
  (async () => {
    try {
      const u = new URL(String(msg.url));
      if (u.protocol !== "https:" || !PIC_HOST.test(u.hostname)) return sendResponse({ ok: false });
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(u.href, { credentials: "omit", referrerPolicy: "no-referrer", signal: ctl.signal });
      clearTimeout(timer);
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !/^image\//i.test(type)) return sendResponse({ ok: false });
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > 600000) return sendResponse({ ok: false });
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      sendResponse({ ok: true, data: `data:${type.split(";")[0]};base64,${btoa(bin)}` });
    } catch { sendResponse({ ok: false }); }
  })();
  return true; // the answer is sent asynchronously
});
