// Select all / daily limit / failed unfollows: exact selection, clear explanations, retries, missing accounts,
// stop rules, and the daily-limit dialog (reset counter, end cool-down, change limit and reset time).
import { JSDOM } from "jsdom";
import vm from "node:vm";
import { checks, readBundle } from "./helpers/harness.ts";
import { it } from "vitest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bundle = readBundle("content.js");
const doms: JSDOM[] = [];
const store: Record<string, any> = { igMethodV2: true, nfb_onboarded: true, minDelay: 0, maxDelay: 0 };
const listeners: Array<(ch: any) => void> = [];
const TODAY = () => new Date().toLocaleDateString("en-CA");
const mkUsers = (n: number, extra: (i: number) => any = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({ pk: "p" + i, username: "user" + i, full_name: "", pic: "", verified: false, ...extra(i) }));
let behave = (_pk?: string, _n?: number): any => ({ status: 200, body: { status: "ok", friendship_status: { following: false } } });
const calls: Record<string, number> = {};

function boot(acct: string, users: any[], extra: any = {}) {
  const dom = new JSDOM("<!doctype html><html lang='en' data-nfb='{\"fb_dtsg\":\"x\"}'><body></body></html>", { url: "https://www.instagram.com/x/", runScripts: "outside-only", pretendToBeVisual: true });
  doms.push(dom);
  const w = dom.window; (w.document as any).cookie = "ds_user_id=" + acct;
  const local = {
    get: async (k: any) => { const o: any = {}; (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); }); return o; },
    set: async (o: any) => { const ch: any = {}; for (const k in o) { ch[k] = { oldValue: store[k], newValue: o[k] }; store[k] = JSON.parse(JSON.stringify(o[k])); } listeners.forEach((f) => f(ch)); },
    remove: async (ks: any) => { const ch: any = {}; (Array.isArray(ks) ? ks : [ks]).forEach((k) => { ch[k] = { oldValue: store[k] }; delete store[k]; }); listeners.forEach((f) => f(ch)); },
    onChanged: { addListener: (f: any) => listeners.push(f) },
  };
  (w as any).chrome = {
    storage: { local, onChanged: { addListener: (f: any) => listeners.push(f) } },
    runtime: { sendMessage: (_m: any, cb?: any) => cb && cb(), onMessage: { addListener() {} }, getManifest: () => ({ version: "1.8.0" }) },
  };
  (w as any).Element.prototype.scrollIntoView = function () {};
  (w as any).fetch = async (url: string) => {
    const j = (b: any, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(b), json: async () => b });
    let m = /destroy\/(\w+)\//.exec(url);
    if (m) { calls[m[1]] = (calls[m[1]] || 0) + 1; const r = behave(m[1], calls[m[1]]); return j(r.body, r.status); }
    m = /friendships\/show\/(\w+)\//.exec(url); if (m) return j({ following: false });
    if (/\/users\/\d+\/info\//.test(url)) return j({ user: { follower_count: 1, following_count: users.length, username: "me" } });
    if (/\/following\//.test(url)) return j({ users: (extra.apiFollowing || users).map((u: any) => ({ pk: u.pk, username: u.username, full_name: "", profile_pic_url: "" })) });
    if (/\/followers\//.test(url)) return j({ users: [] });
    return j({});
  };
  const k = (n: string) => `nfb_${n}_instagram_${acct}`;
  store[k("scan")] = { at: Date.now(), followers: 1, following: users.length, users, username: "me" };
  store[k("lists")] = { at: Date.now(), followers: [], following: users, followingComplete: true };
  store.nfb_accounts = { instagram: [...new Set([...(store.nfb_accounts?.instagram || []), acct])] };
  w.eval(bundle);
  (w as any).NFB.sleep = () => new Promise((r) => setTimeout(r, 1));
  const sh = () => (w.document.getElementById("nfb-host") as any).shadowRoot;
  const click = (el: any) => el.dispatchEvent(new (w as any).MouseEvent("click", { bubbles: true }));
  const toasts = () => [...sh().querySelectorAll(".toast")].map((t: any) => t.textContent).join(" | ");
  const runBatch = async (ms = 2500) => { click(sh().getElementById("del")); await sleep(120); click(sh().querySelector(".modal .btn.danger")); await sleep(ms); };
  return { w, sh, click, toasts, runBatch, $: (id: string) => sh().getElementById(id) };
}
const label = (b: any) => b.$("selLabel").textContent;

it("limits: selection, failures, missing accounts and the daily-limit dialog", async () => {
  const { ok, finish } = checks();

  // ---------- Select all is exactly the daily limit ----------
  let a = boot("1", mkUsers(100)); await sleep(500);
  a.click(a.$("all")); await sleep(120);
  ok("S1 Select all selects exactly 40 (the limit)", label(a) === "40 selected" && a.sh().querySelectorAll("#list input:checked").length === 40, label(a));
  ok("S2 no warning when the full limit is selected", !/allowed per day/.test(a.toasts()), a.toasts());
  a.click(a.$("clr")); a.$("n").value = "25"; a.click(a.$("selN")); await sleep(120);
  ok("S3 Select first 25 selects 25", label(a) === "25 selected");

  // ---------- fewer than 40: the reason is explained ----------
  store.nfb_daily_instagram_2 = { date: TODAY(), count: 3 };
  a = boot("2", mkUsers(100)); await sleep(500);
  a.click(a.$("all")); await sleep(120);
  ok("S4 3 already used today -> 37, and it says why", label(a) === "37 selected" && /3 were already unfollowed today/.test(a.toasts()), label(a) + " | " + a.toasts());
  a = boot("3", mkUsers(100, (i) => ({ verified: i < 5 }))); await sleep(400);
  await (a.w as any).chrome.storage.local.set({ protectVerified: true }); await sleep(300);
  a.click(a.$("all")); await sleep(120);
  ok("S5 protected accounts are skipped and the limit is still filled", label(a) === "40 selected" && !a.sh().querySelector('.row[data-pk="p2"] input').checked && /protected/.test(a.toasts()), label(a) + " | " + a.toasts());
  a = boot("4", mkUsers(10)); await sleep(400);
  a.click(a.$("all")); await sleep(120);
  ok("S6 only 10 accounts exist -> 10 selected, explained", label(a) === "10 selected" && /10 accounts are available/.test(a.toasts()), a.toasts());
  await (a.w as any).chrome.storage.local.set({ protectVerified: false });

  // ---------- failed unfollows ----------
  behave = (pk, n) => {
    if ((pk === "p5" || pk === "p12") && n === 1) return { status: 500, body: { message: "Oops, an error occurred.", status: "fail" } };   // transient
    if (pk === "p30") return { status: 404, body: { message: "User not found", status: "fail" } };                                          // account is gone
    if (pk === "p7") return { status: 500, body: { message: "Oops, an error occurred.", status: "fail" } };                                  // keeps failing
    return { status: 200, body: { status: "ok", friendship_status: { following: false } } };
  };
  for (const k in calls) delete calls[k];
  a = boot("5", mkUsers(100)); await sleep(500);
  a.click(a.$("all")); await sleep(100); await a.runBatch(3500);
  const hist = store.nfb_hist_instagram_5 || [];
  ok("F1 transient failures are retried and succeed", hist.some((h: any) => h.pk === "p5") && hist.some((h: any) => h.pk === "p12") && calls.p5 === 2 && calls.p12 === 2, JSON.stringify([calls.p5, calls.p12]));
  ok("F2 an account that no longer exists is dropped (one attempt, not counted)", !a.sh().querySelector('.row[data-pk="p30"]') && calls.p30 === 1 && !hist.some((h: any) => h.pk === "p30") && (store.nfb_gone_instagram_5 || []).includes("p30"));
  ok("F3 a permanent failure is retried once, then stays in the list marked Failed", calls.p7 === 2 && !!a.sh().querySelector('.row[data-pk="p7"] .tag.warn') && /Failed/.test(a.sh().querySelector('.row[data-pk="p7"]').textContent));
  ok("F4 the summary reports the failure", /Finished — 38 unfollowed, 1 failed/.test(a.$("rcTitle").textContent), a.$("rcTitle").textContent);
  ok("F5 the daily counter only counts real unfollows (38)", store.nfb_daily_instagram_5.count === 38, JSON.stringify(store.nfb_daily_instagram_5));
  ok("F6 nothing else from the 40 is left", [...Array(40).keys()].map((i) => "p" + i).filter((pk) => a.sh().querySelector(`#list .row[data-pk="${pk}"]`)).join() === "p7");
  const b2 = boot("5", mkUsers(100)); await sleep(500);
  ok("F7 the Failed mark survives a reload", !!b2.sh().querySelector('.row[data-pk="p7"] .tag.warn'));

  // systemic failure still stops the batch quickly
  behave = () => ({ status: 500, body: { message: "Oops", status: "fail" } });
  for (const k in calls) delete calls[k];
  a = boot("6", mkUsers(20)); await sleep(500);
  a.click(a.$("all")); await sleep(100); await a.runBatch(2500);
  ok("F8 3 failures in a row stop the batch (not 20 attempts)", /Stopped after 3 failures/.test(a.$("rcTitle").textContent + a.$("status").textContent) && Object.keys(calls).length === 3, JSON.stringify(calls));

  // missing accounts never stop a batch
  behave = () => ({ status: 404, body: { message: "User not found", status: "fail" } });
  for (const k in calls) delete calls[k];
  a = boot("7", mkUsers(8)); await sleep(500);
  a.click(a.$("all")); await sleep(100); await a.runBatch(2500);
  ok("F9 8 missing accounts are all removed without stopping", Object.keys(calls).length === 8 && !a.sh().querySelector("#list .row") && !/Stopped/.test(a.$("rcTitle").textContent), a.$("rcTitle").textContent);

  // an unfollow that Instagram first reports as "still following" is double-checked
  behave = (pk) => (pk === "p1" ? { status: 200, body: { status: "ok", friendship_status: { following: true } } } : { status: 200, body: { status: "ok", friendship_status: { following: false } } });
  a = boot("8", mkUsers(3)); await sleep(500);
  a.click(a.$("all")); await sleep(100); await a.runBatch(2000);
  ok("F10 'still following' is re-checked and counted as success", (store.nfb_hist_instagram_8 || []).length === 3 && !/failed/.test(a.$("rcTitle").textContent), a.$("rcTitle").textContent);
  behave = () => ({ status: 200, body: { status: "ok", friendship_status: { following: false } } });

  // ---------- recently unfollowed accounts that Instagram still lists ----------
  const base = mkUsers(10);
  store.nfb_hist_instagram_9 = [{ pk: "p3", username: "user3", at: Date.now() - 3600e3 }, { pk: "p4", username: "user4", at: Date.now() - 3 * 86400e3 }];
  store.allowScan_instagram = true;
  a = boot("9", base, { apiFollowing: base }); await sleep(500);
  ok("R0 on load, an account unfollowed 1 h ago stays hidden (older ones come back)", !a.sh().querySelector('.row[data-pk="p3"]') && !!a.sh().querySelector('.row[data-pk="p4"]'));
  await (a.w as any).chrome.storage.local.set({ allowScan_instagram: true }); await sleep(1700);
  a.$("lim").value = "0"; a.click(a.$("scan")); await sleep(150); a.click(a.sh().querySelector(".modal .btn.primary")); await sleep(700);
  ok("R1 a scan that still lists it (Instagram lags) hides it and says so", !a.sh().querySelector('.row[data-pk="p3"]') && /recently are still in Instagram's list/.test(a.$("status").textContent) && a.sh().querySelectorAll("#list .row").length === 9, a.$("status").textContent);

  // ---------- daily limit dialog ----------
  store.nfb_daily_instagram_10 = { date: TODAY(), count: 12 };
  a = boot("10", mkUsers(60)); await sleep(500);
  ok("D0 the counter chip is a button", a.$("chipCap").tagName === "BUTTON" && /12 \/ 40 today/.test(a.$("chipCap").textContent), a.$("chipCap").textContent);
  a.click(a.$("chipCap")); await sleep(150);
  const modal = a.sh().querySelector(".modal");
  const inputs = modal ? [...modal.querySelectorAll("input")] : [];
  ok("D1 dialog shows used, limit and reset time", !!modal && /Daily limit/.test(modal.querySelector("h3").textContent) && inputs[0].value === "12" && inputs[1].value === "40" && inputs[2].value === "00:00" && /Used today: 12 of 40/.test(modal.textContent), modal && modal.textContent.slice(0, 160));
  a.click([...modal.querySelectorAll(".btn")].find((x: any) => /Reset counter/.test(x.textContent))); await sleep(30);
  ok("D2 'Reset counter to 0' zeroes the field", inputs[0].value === "0");
  (inputs[1] as any).value = "25"; (inputs[2] as any).value = "06:00";
  a.click(modal.querySelector(".btn.primary")); await sleep(250);
  ok("D3 Save: counter reset, limit and reset time updated", store.nfb_daily_instagram_10.count === 0 && store.dailyCap_instagram === 25 && store.dayResetTime === "06:00", JSON.stringify([store.nfb_daily_instagram_10, store.dailyCap_instagram, store.dayResetTime]));
  ok("D4 the chip shows the new numbers", /0 \/ 25 today/.test(a.$("chipCap").textContent), a.$("chipCap").textContent);
  a.click(a.$("all")); await sleep(120);
  ok("D5 Select all now selects 25", label(a) === "25 selected", label(a));
  // set a custom number of used
  a.click(a.$("chipCap")); await sleep(120);
  const m2 = a.sh().querySelector(".modal"); const in2 = [...m2.querySelectorAll("input")]; (in2[0] as any).value = "30"; a.click(m2.querySelector(".btn.primary")); await sleep(250);
  ok("D6 'Used today' can be set to any number", store.nfb_daily_instagram_10.count === 30 && /30 \/ 25 today/.test(a.$("chipCap").textContent) && /Daily limit reached/.test(a.$("chipTime").textContent), a.$("chipTime").textContent);
  // cool-down can be ended from the same dialog
  store.dayResetTime = "00:00"; await (a.w as any).chrome.storage.local.set({ nfb_cool_instagram_10: Date.now() + 5 * 3600e3 }); await sleep(1250);   // the chip refreshes once a second
  ok("D7 cool-down chip shows while active", /Cool-down/.test(a.$("chipTime").textContent), a.$("chipTime").textContent);
  a.click(a.$("chipCap")); await sleep(120);
  const m3 = a.sh().querySelector(".modal"); const endBtn = [...m3.querySelectorAll(".btn")].find((x: any) => /End cool-down/.test(x.textContent));
  ok("D8 'End cool-down' appears only while a cool-down is active", !!endBtn);
  a.click(endBtn); await sleep(150); a.click([...m3.querySelectorAll(".btn")].find((x: any) => /Cancel/.test(x.textContent))); await sleep(80);
  ok("D9 ending it clears the saved cool-down", !store.nfb_cool_instagram_10 && !/Cool-down/.test(a.$("chipTime").textContent), a.$("chipTime").textContent);

  // ---------- reset time moves the day boundary ----------
  {
    const g: any = {}; const st: any = {};
    vm.runInNewContext(readBundle("shared.js"), { globalThis: g, console, chrome: { storage: { local: { get: async () => ({ ...st }), set: async () => {} }, onChanged: { addListener() {} } } }, document: {} });
    const N = g.NFB; const now = new Date(); const nm = now.getHours() * 60 + now.getMinutes();
    const hhmm = (m: number) => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0") + ":" + String((((m % 1440) + 1440) % 1440) % 60).padStart(2, "0");
    st.dayResetTime = hhmm(nm + 90); await N.getSettings();
    ok("T1 reset 90 min from now -> about 90 min away", Math.abs(N.msToMidnight() / 60000 - 90) <= 2, N.msToMidnight() / 60000);
    st.dayResetTime = hhmm(nm - 30); await N.getSettings();
    ok("T2 reset 30 min ago -> about 23.5 h away", Math.abs(N.msToMidnight() / 60000 - 1410) <= 2, N.msToMidnight() / 60000);
    st.dayResetTime = "00:00"; await N.getSettings();
    ok("T3 default reset is midnight (plain local date)", N.today() === now.toLocaleDateString("en-CA") && N.resetMin === 0);
    if (nm + 60 < 1440) { st.dayResetTime = hhmm(nm + 60); await N.getSettings(); ok("T4 before today's reset time it is still 'yesterday'", N.today() !== now.toLocaleDateString("en-CA")); }
  }

  doms.forEach((d) => d.window.close());
  finish();
});
