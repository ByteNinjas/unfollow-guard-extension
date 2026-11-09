import { JSDOM } from "jsdom";
import { readBundle } from "./helpers/harness.ts";
import { checks } from "./helpers/harness.ts";
import { it } from "vitest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bundle = readBundle("content.js");
const doms: JSDOM[] = [];
const store: Record<string, any> = { igMethodV2: true, minDelay: 10, maxDelay: 10 };
const listeners: Array<(ch: any) => void> = [];
const U = (n: number, p = "u") => ({ pk: p + n, username: p + n, full_name: "N" + n, profile_pic_url: "", is_verified: false });
let net: any = { following: [], followers: [], destroy: { status: 200, body: { status: "ok", friendship_status: { following: false } } }, destroyCalls: 0 };

function boot(acct: string) {
  const dom = new JSDOM("<!doctype html><html lang='en' data-nfb='{\"fb_dtsg\":\"NAcTEST\"}'><body></body></html>", { url: "https://www.instagram.com/x/", runScripts: "outside-only", pretendToBeVisual: true });
  doms.push(dom);
  const w = dom.window;
  (w.document as any).cookie = "ds_user_id=" + acct; (w.document as any).cookie = "csrftoken=abc";
  const local = {
    get: async (k: any) => { const o: any = {}; (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); }); return o; },
    set: async (o: any) => { const ch: any = {}; for (const k in o) { ch[k] = { oldValue: store[k], newValue: o[k] }; store[k] = JSON.parse(JSON.stringify(o[k])); } listeners.forEach((f) => f(ch)); },
    remove: async (ks: any) => { const ch: any = {}; (Array.isArray(ks) ? ks : [ks]).forEach((k) => { ch[k] = { oldValue: store[k] }; delete store[k]; }); listeners.forEach((f) => f(ch)); },
    onChanged: { addListener: (f: any) => listeners.push(f) },
  };
  (w as any).chrome = { storage: { local, onChanged: { addListener: (f: any) => listeners.push(f) } } };
  (w as any).Element.prototype.scrollIntoView = function () {};
  (w as any).fetch = async (url: string) => {
    const j = (b: any, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(b), json: async () => b });
    if (/\/users\/\d+\/info\//.test(url)) return j({ user: { follower_count: net.followers.length, following_count: net.following.length, username: "me" + acct } });
    if (/\/following\//.test(url)) return j({ users: net.following });
    if (/\/followers\//.test(url)) return j({ users: net.followers });
    if (/\/destroy\//.test(url)) { net.destroyCalls++; return j(net.destroy.body, net.destroy.status); }
    return j({});
  };
  w.eval(bundle);
  const sh = () => (w.document.getElementById("nfb-host") as any).shadowRoot;
  const click = (el: any) => el.dispatchEvent(new (w as any).MouseEvent("click", { bubbles: true }));
  return { w, sh, click };
}

it("features: migration, follower diffs, cool-down, active hours", async () => {
  const { ok, finish } = checks();

  // ---------- A: legacy data moves to the account, other accounts stay separate ----------
  store.nfb_scan_instagram = { at: Date.now(), followers: 2, following: 3, users: [U(1), U(2)].map((u: any) => ({ pk: u.pk, username: u.username, full_name: "", pic: "", verified: false })) };
  store.nfb_hist_instagram = [{ pk: "h1", username: "hh", at: Date.now() }];
  store.nfb_daily_instagram = { date: new Date().toLocaleDateString("en-CA"), count: 7 };
  let a = boot("111"); await sleep(400);
  ok("A1 legacy scan moved", !!store.nfb_scan_instagram_111 && !store.nfb_scan_instagram);
  ok("A2 legacy history/daily moved", !!store.nfb_hist_instagram_111 && store.nfb_daily_instagram_111.count === 7);
  ok("A3 account indexed", JSON.stringify(store.nfb_accounts) === JSON.stringify({ instagram: ["111"] }));
  ok("A4 account 111 sees its list", a.sh().querySelector('.tab[data-id="todo"]').textContent.includes("2"));
  const b = boot("222"); await sleep(400);
  ok("A5 account 222 starts empty", b.sh().querySelector('.tab[data-id="todo"]').textContent.includes("0") && b.sh().getElementById("chipCap").textContent.startsWith("0 /"));
  ok("A6 account 111 data untouched", !!store.nfb_scan_instagram_111);

  // ---------- B: follower changes between two scans ----------
  net.following = [1, 2, 3, 4, 5].map((n) => U(n)); net.followers = [U(1), U(2), U(1, "f"), U(2, "f"), U(3, "f")];
  const c = boot("333"); await sleep(400);
  store.allowScan_instagram = true; await (c.w as any).chrome.storage.local.set({ allowScan_instagram: true }); await sleep(1700);
  const sh = c.sh(), $ = (id: string) => sh.getElementById(id);
  const scanOnce = async () => { $("lim").value = "0"; c.click($("scan")); await sleep(150); c.click(sh.querySelector(".modal .btn.primary")); await sleep(500); };
  await scanOnce();
  ok("B1 baseline saved", /baseline saved/i.test($("status").textContent), $("status").textContent);
  ok("B2 snapshot stored", store.nfb_snap_instagram_333 && store.nfb_snap_instagram_333.users.length === 5);
  ok("B3 meta has username", store.nfb_meta_instagram_333 && store.nfb_meta_instagram_333.username === "me333");
  ok("B4 header shows @username", $("acct").textContent.includes("@me333"));
  net.followers = [U(1), U(2), U(2, "f"), U(3, "f"), U(4, "f")];
  await (c.w as any).chrome.storage.local.set({ allowScan_instagram: true }); await sleep(1700);
  await scanOnce();
  const changes = store.nfb_flw_instagram_333 || [];
  ok("B5 lost + new recorded", changes.length === 2 && changes.some((x: any) => x.type === "lost" && x.pk === "f1") && changes.some((x: any) => x.type === "new" && x.pk === "f4"), JSON.stringify(changes.map((x: any) => x.type + x.pk)));
  ok("B6 status explains", /1 new follower, 1 unfollowed you/.test($("status").textContent), $("status").textContent);
  c.click(sh.querySelector('.tab[data-id="changes"]')); await sleep(50);
  ok("B7 Changes tab rows + tags", sh.querySelectorAll("#list .row").length === 2 && sh.querySelector("#list .tag.warn").textContent === "Unfollowed you");
  net.followers = [U(1), U(2)]; net.followersLie = true;
  const before = JSON.stringify(store.nfb_flw_instagram_333);
  const origFetch = (c.w as any).fetch;
  (c.w as any).fetch = async (url: string, init?: any) => /\/users\/\d+\/info\//.test(url) ? { ok: true, status: 200, text: async () => "", json: async () => ({ user: { follower_count: 500, following_count: 5, username: "me333" } }) } : origFetch(url, init);
  await (c.w as any).chrome.storage.local.set({ allowScan_instagram: true }); await sleep(1700);
  await scanOnce();
  ok("B8 incomplete list not diffed", JSON.stringify(store.nfb_flw_instagram_333) === before && /incomplete/i.test($("status").textContent), $("status").textContent);
  (c.w as any).fetch = origFetch;
  const info = sh.getElementById("info_instagram").textContent;
  ok("B9 settings lists accounts", info.includes("@me111") || info.includes("Account 111") || info.includes("@me333"), info);

  // ---------- C: block -> cool-down ----------
  c.click(sh.querySelector('.tab[data-id="todo"]')); await sleep(50);
  c.click(sh.querySelector("#list input[type=checkbox]")); await sleep(50);
  net.destroy = { status: 429, body: { message: "feedback_required", status: "fail" } }; net.destroyCalls = 0;
  c.click($("del")); await sleep(150); c.click(sh.querySelector(".modal .btn.danger")); await sleep(900);
  ok("C1 request sent once then stopped", net.destroyCalls === 1, "calls=" + net.destroyCalls);
  const until = store.nfb_cool_instagram_333;
  ok("C2 cool-down ~6h saved", until && Math.abs(until - (Date.now() + 6 * 3600000)) < 60000);
  ok("C3 chip shows cool-down", /Cool-down/.test($("chipTime").textContent), $("chipTime").textContent);
  ok("C4 status mentions it", /Cool-down started/.test($("status").textContent), $("status").textContent);
  c.click($("del")); await sleep(150);
  ok("C5 dialog blocks restart", !!sh.querySelector(".modal h3") && sh.querySelector(".modal h3").textContent === "Cool-down is active");
  net.destroyCalls = 0; c.click(sh.querySelector(".modal .btn:not(.danger)")); await sleep(200);
  ok("C6 'keep waiting' sends nothing", net.destroyCalls === 0 && !sh.querySelector(".overlay"));

  // ---------- D: active hours ----------
  await (c.w as any).chrome.storage.local.remove("nfb_cool_instagram_333"); await sleep(100);
  const h = new Date().getHours(); const pad = (n: number) => String((n + 24) % 24).padStart(2, "0");
  await (c.w as any).chrome.storage.local.set({ activeEnabled: true, activeFrom: pad(h + 2) + ":00", activeTo: pad(h + 3) + ":00" }); await sleep(300);
  ok("D1 chip shows outside hours", /Outside active hours/.test($("chipTime").textContent), $("chipTime").textContent);
  net.destroy = { status: 200, body: { status: "ok", friendship_status: { following: false } } }; net.destroyCalls = 0;
  c.click(sh.querySelector("#list input[type=checkbox]")); await sleep(50);
  if (!sh.querySelector("#list input:checked")) c.click(sh.querySelector("#list input[type=checkbox]"));
  c.click($("del")); await sleep(150);
  ok("D2 dialog warns about hours", /outside your active hours/.test(sh.querySelector(".modal").textContent), sh.querySelector(".modal") && sh.querySelector(".modal").textContent.slice(0, 200));
  c.click(sh.querySelector(".modal .btn.danger")); await sleep(1500);
  ok("D3 nothing sent while paused", net.destroyCalls === 0);
  ok("D4 banner says paused", /outside active hours/i.test($("rcTitle").textContent), $("rcTitle").textContent);
  c.click($("runstop")); await sleep(1600);
  ok("D5 stop works while paused", !store.nfb_run_instagram_333 && /Stopped/.test($("rcTitle").textContent), $("rcTitle").textContent);
  await (c.w as any).chrome.storage.local.set({ activeFrom: pad(h - 1) + ":00", activeTo: pad(h + 1) + ":00" }); await sleep(300);
  ok("D6 inside window is ready", /Ready|Daily/.test($("chipTime").textContent), $("chipTime").textContent);

  doms.forEach((d) => d.window.close());
  finish();
});
