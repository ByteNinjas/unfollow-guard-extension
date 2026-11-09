import { JSDOM } from "jsdom";
import vm from "node:vm";
import { checks, readBundle, readSource } from "./helpers/harness.ts";
import { it } from "vitest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bundle = readBundle("content.js");
const doms: JSDOM[] = [];
const store: Record<string, any> = { igMethodV2: true, nfb_onboarded: true, minDelay: 10, maxDelay: 10 };
const listeners: Array<(ch: any) => void> = [];
const net: any = { followers: [], following: [], calls: [] };
const mk = (n: number, extra: any = {}) => ({ pk: "p" + n, username: "user" + n, full_name: "Name " + n, pic: "", verified: false, ...extra });

function boot(acct: string) {
  const dom = new JSDOM("<!doctype html><html lang='en' data-nfb='{\"fb_dtsg\":\"NAcTEST\"}'><body></body></html>", { url: "https://www.instagram.com/x/", runScripts: "outside-only", pretendToBeVisual: true });
  doms.push(dom);
  const w = dom.window; (w.document as any).cookie = "ds_user_id=" + acct; (w.document as any).cookie = "csrftoken=abc";
  const sent: any[] = [], clip: string[] = [], msgListeners: Array<(m: any) => void> = [];
  const local = {
    get: async (k: any) => { const o: any = {}; (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); }); return o; },
    set: async (o: any) => { const ch: any = {}; for (const k in o) { ch[k] = { oldValue: store[k], newValue: o[k] }; store[k] = JSON.parse(JSON.stringify(o[k])); } listeners.forEach((f) => f(ch)); },
    remove: async (ks: any) => { const ch: any = {}; (Array.isArray(ks) ? ks : [ks]).forEach((k) => { ch[k] = { oldValue: store[k] }; delete store[k]; }); listeners.forEach((f) => f(ch)); },
    onChanged: { addListener: (f: any) => listeners.push(f) },
  };
  (w as any).chrome = {
    storage: { local, onChanged: { addListener: (f: any) => listeners.push(f) } },
    runtime: { sendMessage: (m: any, cb?: any) => { sent.push(m); cb && cb(); }, onMessage: { addListener: (f: any) => msgListeners.push(f) }, getManifest: () => ({ version: "1.7.0" }) },
  };
  Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (t: string) => { clip.push(t); } } });
  (w as any).Element.prototype.scrollIntoView = function () {};
  (w as any).fetch = async (url: string) => {
    const j = (b: any, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(b), json: async () => b });
    net.calls.push(url);
    if (/\/users\/\d+\/info\//.test(url)) return j({ user: { follower_count: net.followers.length, following_count: net.following.length, username: "me" } });
    if (/\/following\//.test(url)) return j({ users: net.following });
    if (/\/followers\//.test(url)) return j({ users: net.followers });
    if (/\/destroy\//.test(url)) return j({ status: "ok", friendship_status: { following: false } });
    return j({});
  };
  w.eval(bundle);
  const sh = () => (w.document.getElementById("nfb-host") as any).shadowRoot;
  const click = (el: any) => el.dispatchEvent(new (w as any).MouseEvent("click", { bubbles: true }));
  const $ = (id: string) => sh().getElementById(id);
  const tab = (id: string) => click(sh().querySelector(`.tab[data-id="${id}"]`));
  const rowsOf = () => [...sh().querySelectorAll("#list .row")];
  const names = () => rowsOf().map((r: any) => r.dataset.pk);
  return { w, sh, click, $, tab, rowsOf, names, sent, clip, msgListeners };
}
const seed = (acct: string, users: any[], extra: any = {}) => {
  const k = (n: string) => `nfb_${n}_instagram_${acct}`;
  store[k("scan")] = { at: Date.now(), followers: 5, following: users.length, users, username: "me" };
  store[k("lists")] = { at: Date.now(), followers: [], following: users, followingComplete: true };
  store.nfb_accounts = { instagram: [...new Set([...(store.nfb_accounts?.instagram || []), acct])] };
  Object.assign(store, extra);
};

it("features3: translations, filters, undo, schedule, self-check, background", async () => {
  const { ok, finish } = checks();

  // ---------- translation completeness ----------
  {
    const g: any = {}; vm.runInNewContext(readBundle("i18n.js"), { globalThis: g, navigator: { language: "en" } });
    const D = g.NFB.i18n, src = readSource("src/content/index.ts");
    const used = new Set([...src.matchAll(/\btr\("([a-z_0-9]+)"/g)].map((m) => m[1]).filter((k) => !k.endsWith("_")));
    [...src.matchAll(/data-(?:i|ti|ph)="([a-z_0-9]+)"/g)].forEach((m) => used.add(m[1]));
    ["todo", "keep", "mutual", "fans", "followers", "following", "history", "changes", "stats"].forEach((id) => used.add("tab_" + id));
    ["friend", "family", "client", "work", "other"].forEach((id) => used.add("tag_" + id));
    for (let i = 1; i <= 5; i++) { used.add(`tour_${i}_t`); used.add(`tour_${i}_b`); }
    ["ts_cap", "ts_cap_warm", "sc_title", "sc_sub", "nf_finished", "nf_stopped", "chip_ready", "chip_cool", "chip_hours"].forEach((k) => used.add(k));
    const missing: any = {};
    for (const c of ["en", "es", "fr", "de", "pt"]) missing[c] = [...used].filter((k) => !(k in D[c]));
    ok("L0 every used key exists in all 5 languages", Object.values(missing).every((m: any) => !m.length), JSON.stringify(missing));
    ok("L0b placeholders match across languages", Object.keys(D.en).every((k) => { const ph = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join(); return ["es", "fr", "de", "pt"].every((c) => ph(D[c][k]) === ph(D.en[k])); }),
      Object.keys(D.en).filter((k) => ["es", "fr", "de", "pt"].some((c) => (D[c][k].match(/\{\w+\}/g) || []).sort().join() !== (D.en[k].match(/\{\w+\}/g) || []).sort().join())).join());
  }

  // ---------- translations at runtime ----------
  seed("1", [1, 2, 3, 4].map((n) => mk(n)));
  store.lang = "es";
  const a = boot("1"); await sleep(450);
  ok("L1 Spanish tabs", a.sh().querySelector('.tab[data-id="todo"] .tl').textContent === "Por dejar de seguir", a.sh().querySelector('.tab[data-id="todo"]').textContent);
  ok("L2 Spanish scan button + chip + footer", a.$("scan").textContent === "Escanear" && /Listo para dejar de seguir/.test(a.$("chipTime").textContent) && /restantes hoy/.test(a.$("selSub").textContent), a.$("scan").textContent + "|" + a.$("chipTime").textContent);
  ok("L3 placeholder + empty state translated", a.$("q").placeholder === "Buscar nombre o usuario");
  await (a.w as any).chrome.storage.local.set({ lang: "de" }); await sleep(100);
  ok("L4 switches language live", a.sh().querySelector('.tab[data-id="todo"] .tl').textContent === "Zu entfolgen" && a.$("scan").textContent === "Scannen", a.$("scan").textContent);
  a.click(a.rowsOf()[0].querySelector(".btn:not(.tagbtn)")); await sleep(50);
  ok("L5 toast translated", /behalten/i.test([...a.sh().querySelectorAll(".toast")].map((t: any) => t.textContent).join(" ")), [...a.sh().querySelectorAll(".toast")].map((t: any) => t.textContent).join("|"));
  await (a.w as any).chrome.storage.local.set({ lang: "auto" }); await sleep(100);
  ok("L6 'auto' follows the browser (English here)", a.$("scan").textContent === "Scan");
  store.lang = "auto";

  // ---------- filters + sort ----------
  seed("2", [mk(1, { private: true }), mk(2, { private: false }), mk(3, { noPic: true, private: false }), mk(4, { private: true, verified: true }), mk(0, { private: false })]);
  const b = boot("2"); await sleep(450);
  const pick = async (id: string, v: string) => { b.$(id).value = v; b.$(id).dispatchEvent(new (b.w as any).Event("change")); await sleep(30); };
  await pick("fltr", "private"); ok("F1 filter private", b.names().sort().join() === "p1,p4", b.names().join());
  await pick("fltr", "public"); ok("F2 filter public", b.names().sort().join() === "p0,p2,p3", b.names().join());
  await pick("fltr", "nopic"); ok("F3 filter no picture", b.names().join() === "p3");
  await pick("fltr", "verified"); ok("F4 filter verified", b.names().join() === "p4");
  await pick("fltr", "all"); await pick("srt", "az"); ok("F5 sort A→Z", b.names().join() === "p0,p1,p2,p3,p4", b.names().join());
  await pick("srt", "za"); ok("F6 sort Z→A", b.names().join() === "p4,p3,p2,p1,p0");
  await pick("srt", "default"); await pick("fltr", "private"); b.click(b.$("all")); await sleep(40);
  ok("F7 Select all uses the filter", b.sh().querySelectorAll("#list input:checked").length === 2);
  b.click(b.$("clr")); await pick("fltr", "all");

  // ---------- labels + notes + protection ----------
  const tagBtn = () => b.sh().querySelector('.row[data-pk="p2"] .tagbtn');
  b.click(tagBtn()); await sleep(80);
  ok("G1 label dialog opens (accessible)", !!b.sh().querySelector(".modal[aria-modal='true'][aria-labelledby]") && !!b.sh().querySelector(".modal select") && !!b.sh().querySelector(".modal textarea"));
  const sel = b.sh().querySelector(".modal select"), ta = b.sh().querySelector(".modal textarea");
  sel.value = "friend"; ta.value = "college friend"; b.click(b.sh().querySelector(".modal .btn.primary")); await sleep(80);
  ok("G2 label + note saved", store.nfb_tags_instagram_2 && store.nfb_tags_instagram_2.p2.tag === "friend" && store.nfb_tags_instagram_2.p2.note === "college friend", JSON.stringify(store.nfb_tags_instagram_2));
  ok("G3 row shows chip and note", /Friend/.test(b.sh().querySelector('.row[data-pk="p2"]').textContent) && /college friend/.test(b.sh().querySelector('.row[data-pk="p2"]').textContent));
  b.click(b.$("all")); await sleep(40);
  ok("G4 labelled account skipped by Select all", !b.sh().querySelector('.row[data-pk="p2"] input').checked && b.sh().querySelectorAll("#list input:checked").length === 4);
  b.click(b.$("clr")); await pick("fltr", "tagged"); ok("G5 filter labelled", b.names().join() === "p2"); await pick("fltr", "untagged"); ok("G6 filter unlabelled", !b.names().includes("p2")); await pick("fltr", "all");
  await (b.w as any).chrome.storage.local.set({ protectTagged: false }); await sleep(300);
  b.click(b.$("all")); await sleep(40); ok("G7 protectTagged off includes it", b.sh().querySelector('.row[data-pk="p2"] input').checked); b.click(b.$("clr"));
  await (b.w as any).chrome.storage.local.set({ protectTagged: true, protectPrivate: true, protectPattern: "user3, *4" }); await sleep(300);
  b.click(b.$("all")); await sleep(40);
  const checked = [...b.sh().querySelectorAll("#list .row input:checked")].map((i: any) => i.closest(".row").dataset.pk).sort().join();
  ok("P1 private + pattern + label all skipped", checked === "p0", checked); b.click(b.$("clr"));
  ok("P2 protection chips shown", /Private/.test(b.sh().querySelector('.row[data-pk="p1"]').textContent) && /Pattern/.test(b.sh().querySelector('.row[data-pk="p3"]').textContent));
  await (b.w as any).chrome.storage.local.set({ protectPrivate: false, protectPattern: "" }); await sleep(300);

  // ---------- undo ----------
  b.sh().querySelector('.row[data-pk="p0"] input').click(); b.sh().querySelector('.row[data-pk="p1"] input').click(); await sleep(260);
  b.click(b.$("keepSel")); await sleep(60);
  const undo = b.sh().querySelector(".toast .tbtn");
  ok("U1 Keep shows an Undo toast", !!undo && undo.textContent === "Undo" && !b.names().includes("p0"));
  b.click(undo); await sleep(80);
  ok("U2 Undo restores the accounts", b.names().includes("p0") && b.names().includes("p1") && !store.nfb_keep_instagram_2.p0, JSON.stringify(Object.keys(store.nfb_keep_instagram_2 || {})));

  // ---------- accessibility ----------
  const tabs = b.sh().getElementById("tabs");
  ok("A1 tablist / tab roles + aria-selected", tabs.getAttribute("role") === "tablist" && b.sh().querySelector('.tab[data-id="todo"]').getAttribute("aria-selected") === "true" && b.sh().querySelector('.tab[data-id="keep"]').getAttribute("aria-selected") === "false");
  ok("A2 live regions + progressbar + labelled icon buttons", b.$("toasts").getAttribute("aria-live") === "polite" && b.$("rcBar").getAttribute("role") === "progressbar" && !!b.$("gear").getAttribute("aria-label") && !!b.$("closeBtn").getAttribute("aria-label"));
  tabs.dispatchEvent(new (b.w as any).KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await sleep(30);
  ok("A3 arrow keys move between tabs", b.sh().querySelector('.tab[data-id="keep"]').getAttribute("aria-selected") === "true");
  b.tab("todo");

  // ---------- keyboard + panel toggle message ----------
  b.msgListeners[0]({ type: "toggle-panel" }); await sleep(50);
  ok("K0 shortcut message opens the panel", b.sh().getElementById("panel").style.display === "flex");
  const key = (k: string) => b.sh().getElementById("panel").dispatchEvent(new (b.w as any).KeyboardEvent("keydown", { key: k, bubbles: true, composed: true }));
  key("/"); ok("K1 '/' focuses search", b.sh().activeElement && b.sh().activeElement.id === "q");
  b.sh().activeElement.blur(); key("]"); await sleep(30); ok("K2 ']' next tab", b.sh().querySelector('.tab[data-id="keep"]').getAttribute("aria-selected") === "true");
  key("["); await sleep(30); ok("K3 '[' previous tab", b.sh().querySelector('.tab[data-id="todo"]').getAttribute("aria-selected") === "true");
  key("Escape"); ok("K4 Esc closes the panel", b.sh().getElementById("panel").style.display === "none");

  // ---------- welcome tour ----------
  store.nfb_onboarded = false;
  const t = boot("3"); await sleep(400);
  t.msgListeners[0]({ type: "toggle-panel" }); await sleep(120);
  ok("T1 tour opens on first use", !!t.sh().querySelector(".modal") && /Welcome/.test(t.sh().querySelector(".modal h3").textContent));
  for (let i = 0; i < 4; i++) { t.click(t.sh().querySelector(".modal .btn.primary")); await sleep(60); }
  ok("T2 last step has no Skip button", t.sh().querySelectorAll(".modal .btn").length === 1 && /Shortcuts/.test(t.sh().querySelector(".modal h3").textContent));
  t.click(t.sh().querySelector(".modal .btn.primary")); await sleep(80);
  ok("T3 tour remembered", store.nfb_onboarded === true && !t.sh().querySelector(".overlay"));
  t.click(t.$("helpBtn")); await sleep(80); ok("T4 help button replays it", !!t.sh().querySelector(".modal")); t.click(t.sh().querySelector(".modal .btn:not(.primary)")); await sleep(40);

  // ---------- daily schedule + notifications + badge status ----------
  seed("4", [1, 2, 3, 4, 5, 6].map((n) => mk(n)));
  const s = boot("4"); await sleep(450);
  (s.w as any).NFB.sleep = () => new Promise((r) => setTimeout(r, 1));
  const nowT = new Date(Date.now() - 60000); const hhmm = String(nowT.getHours()).padStart(2, "0") + ":" + String(nowT.getMinutes()).padStart(2, "0");
  await (s.w as any).chrome.storage.local.set({ scheduleEnabled: true, scheduleTime: hhmm, scheduleCount: 2 }); await sleep(300);
  const p1 = (s.w as any).NFB.schedCheck(); await sleep(15);
  ok("S1 countdown shown with Cancel", /Scheduled batch starts in/.test(s.$("rcTitle").textContent) && s.$("runstop").textContent === "Cancel", s.$("rcTitle").textContent + "|" + s.$("runstop").textContent);
  s.click(s.$("runstop")); await p1; await sleep(30);
  ok("S2 cancel skips today", /skipped for today/.test([...s.sh().querySelectorAll(".toast")].map((x: any) => x.textContent).join(" ")) && store.nfb_sched_instagram_4 === new Date().toLocaleDateString("en-CA") && !net.calls.some((u: string) => /destroy/.test(u)));
  await (s.w as any).NFB.schedCheck(); await sleep(20);
  ok("S3 at most one run per day", !s.$("rcTitle").textContent.includes("Scheduled batch starts") || s.$("runcard").style.display === "none");
  delete store.nfb_sched_instagram_4; net.calls.length = 0;
  const p2 = (s.w as any).NFB.schedCheck(); await p2; await sleep(1500);
  const destroys = net.calls.filter((u: string) => /destroy/.test(u)).length;
  ok("S4 scheduled batch runs (count 2, unprotected)", destroys >= 1, "destroy calls=" + destroys);
  ok("S5 desktop notification when it starts", s.sent.some((m: any) => m.type === "notify" && /Unfollow Guard/.test(m.title)), JSON.stringify(s.sent));
  ok("B1 badge status published", store.nfb_status && store.nfb_status.cap === 40 && store.nfb_status.used >= 1 && store.nfb_status.running === true, JSON.stringify(store.nfb_status));
  s.click(s.$("runstop")); await sleep(400);
  ok("N1 notification not sent for a user Stop", !s.sent.some((m: any) => m.type === "notify" && /stopped/i.test(m.title)));

  seed("5", [mk(11)]); const f = boot("5"); await sleep(450);
  (f.w as any).NFB.sleep = () => new Promise((r) => setTimeout(r, 1));
  f.sh().querySelector("#list input[type=checkbox]").click(); await sleep(260);
  f.click(f.$("del")); await sleep(120); f.click(f.sh().querySelector(".modal .btn.danger")); await sleep(900);
  ok("N2 'finished' notification", f.sent.some((m: any) => m.type === "notify" && /finished/i.test(m.title)), JSON.stringify(f.sent));

  // ---------- self-check + debug report ----------
  f.click(f.$("diagBtn")); await sleep(300);
  const rep = f.sh().querySelector(".modal pre") && f.sh().querySelector(".modal pre").textContent;
  ok("D1 self-check lists results", /Logged in/.test(rep || "") && /Instagram API reachable/.test(rep || "") && /✓/.test(rep || ""), rep);
  f.click(f.sh().querySelector(".modal .btn.primary")); await sleep(150);
  const report = f.clip[f.clip.length - 1] || "";
  ok("D2 report copied with version, settings, log", /Version: 1\.7\.0/.test(report) && /Settings:/.test(report) && /Last log lines/.test(report), report.slice(0, 120));
  ok("D3 report hides usernames, cookies and tokens", !/user11/.test(report) && /@user/.test(report) && !/NAcTEST|csrftoken|ds_user_id|sessionid/.test(report), report);

  // ---------- background worker ----------
  {
    const calls: any = { badge: [], notif: [], tabs: [] }; const handlers: any = {};
    const bgStore: any = { enabled: true, nfb_status: { used: 12, cap: 40, running: false, cool: false }, notifyEnabled: true };
    const ctx: any = { console, chrome: {
      storage: { local: { get: async (k: any) => { const o: any = {}; (Array.isArray(k) ? k : [k]).forEach((x) => { if (x in bgStore) o[x] = bgStore[x]; }); return o; } }, onChanged: { addListener: (f: any) => (handlers.changed = f) } },
      action: { setBadgeText: async (o: any) => calls.badge.push(["text", o.text]), setBadgeBackgroundColor: async (o: any) => calls.badge.push(["color", o.color]) },
      runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener: (f: any) => (handlers.msgs = (handlers.msgs || []).concat(f)) } },
      notifications: { create: (o: any) => calls.notif.push(o) },
      commands: { onCommand: { addListener: (f: any) => (handlers.cmd = f) } },
      tabs: { query: async () => [{ id: 7 }], sendMessage: async (id: any, m: any) => calls.tabs.push([id, m]) },
    } };
    vm.runInNewContext(readBundle("background.js"), ctx); await sleep(30);
    ok("BG1 badge shows today's count (green)", calls.badge.some((c: any) => c[0] === "text" && c[1] === "12") && calls.badge.some((c: any) => c[0] === "color" && c[1] === "#16a34a"), JSON.stringify(calls.badge));
    calls.badge.length = 0; bgStore.nfb_status = { used: 12, running: false, cool: true }; handlers.changed({ nfb_status: {} }); await sleep(30);
    ok("BG2 cool-down badge", calls.badge.some((c: any) => c[1] === "COOL"));
    bgStore.enabled = false; handlers.changed({ enabled: {} }); await sleep(30); ok("BG3 OFF badge", calls.badge.some((c: any) => c[1] === "OFF"));
    handlers.msgs.forEach((h: any) => h({ type: "notify", title: "T", message: "M" })); await sleep(30); ok("BG4 notification created", calls.notif.length === 1 && calls.notif[0].title === "T");
    bgStore.notifyEnabled = false; handlers.msgs.forEach((h: any) => h({ type: "notify", title: "T2", message: "M" })); await sleep(30); ok("BG5 notifications can be turned off", calls.notif.length === 1);
    await handlers.cmd("toggle-panel"); ok("BG6 shortcut messages the active tab", calls.tabs.length === 1 && calls.tabs[0][0] === 7 && calls.tabs[0][1].type === "toggle-panel");
  }

  doms.forEach((d) => d.window.close());
  finish();
});
