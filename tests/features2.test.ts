import { JSDOM } from "jsdom";
import { checks, readBundle, readSource } from "./helpers/harness.ts";
import { it } from "vitest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bundle = readBundle("content.js");
const doms: JSDOM[] = [];
const store: Record<string, any> = { igMethodV2: true, minDelay: 10, maxDelay: 10 };
const listeners: Array<(ch: any) => void> = [];
const U = (n: number, p = "u", extra: any = {}) => ({ pk: p + n, username: p + n, full_name: "N" + n, profile_pic_url: "", is_verified: false, ...extra });
const net: any = { following: [], followers: [], calls: [], createStatus: 200 };
function boot(acct: string) {
  const dom = new JSDOM("<!doctype html><html lang='en' data-nfb='{\"fb_dtsg\":\"NAcTEST\"}'><body></body></html>", { url: "https://www.instagram.com/x/", runScripts: "outside-only", pretendToBeVisual: true });
  doms.push(dom);
  const w = dom.window; (w.document as any).cookie = "ds_user_id=" + acct;
  const local = {
    get: async (k: any) => { const o: any = {}; (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); }); return o; },
    set: async (o: any) => { const ch: any = {}; for (const k in o) { ch[k] = { oldValue: store[k], newValue: o[k] }; store[k] = JSON.parse(JSON.stringify(o[k])); } listeners.forEach((f) => f(ch)); },
    remove: async (ks: any) => { const ch: any = {}; (Array.isArray(ks) ? ks : [ks]).forEach((k) => { ch[k] = { oldValue: store[k] }; delete store[k]; }); listeners.forEach((f) => f(ch)); },
    onChanged: { addListener: (f: any) => listeners.push(f) },
  };
  (w as any).chrome = { storage: { local, onChanged: { addListener: (f: any) => listeners.push(f) } } };
  (w as any).Element.prototype.scrollIntoView = function () {};
  const downloads: any[] = []; (w as any).__downloads = downloads;
  (w as any).URL.createObjectURL = (b: any) => { downloads.push(b); return "blob:x"; }; (w as any).URL.revokeObjectURL = () => {};
  (w as any).HTMLAnchorElement.prototype.click = function (this: any) { if (this.download) downloads[downloads.length - 1].name = this.download; };
  (w as any).fetch = async (url: string) => {
    const j = (b: any, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(b), json: async () => b });
    net.calls.push(url);
    if (/\/users\/\d+\/info\//.test(url)) return j({ user: { follower_count: net.followers.length, following_count: net.following.length, username: "me" + acct } });
    if (/\/following\//.test(url)) return j({ users: net.following });
    if (/\/followers\//.test(url)) return j({ users: net.followers });
    if (/\/friendships\/create\//.test(url)) return j({ status: "ok", friendship_status: { following: true } }, net.createStatus);
    if (/\/destroy\//.test(url)) return j({ status: "ok", friendship_status: { following: false } });
    return j({});
  };
  w.eval(bundle);
  return { w, sh: () => (w.document.getElementById("nfb-host") as any).shadowRoot, click: (el: any) => el.dispatchEvent(new (w as any).MouseEvent("click", { bubbles: true })) };
}

it("features2: fans, protection, warm-up, re-follow, export/import", async () => {
  const { ok, finish } = checks();
  net.following = [1, 2, 3, 4, 5, 6].map((n) => U(n, "u", n === 2 ? { is_verified: true } : {}));
  net.followers = [U(1), U(1, "f"), U(2, "f")];
  const a = boot("900"); await sleep(400);
  const sh = a.sh(), $ = (id: string) => sh.getElementById(id);
  await (a.w as any).chrome.storage.local.set({ allowScan_instagram: true }); await sleep(1700);
  $("lim").value = "0"; a.click($("scan")); await sleep(150); a.click(sh.querySelector(".modal .btn.primary")); await sleep(600);
  const tab = (id: string) => { a.click(sh.querySelector(`.tab[data-id="${id}"]`)); };
  ok("S0 scan filled lists", sh.querySelectorAll("#list .row").length === 5, sh.querySelectorAll("#list .row").length);

  tab("fans"); await sleep(30);
  ok("F1 fans = followers I don't follow (f1,f2)", sh.querySelectorAll("#list .row").length === 2 && sh.querySelector("#list .tag.ok").textContent === "Follows you");
  tab("stats"); await sleep(30);
  ok("F2 stats cards + 14 bars", sh.querySelectorAll(".card2").length === 8 && sh.querySelectorAll(".bcol").length === 14 && $("toolbar").style.display === "none");
  const rate = sh.querySelector(".card2 b").textContent;
  ok("F3 follow-back rate = 1 of 6", rate === "17%", rate);

  tab("todo"); await sleep(30);
  await (a.w as any).chrome.storage.local.set({ protectVerified: true }); await sleep(300);
  ok("P1 verified tag shown", [...sh.querySelectorAll("#list .tag.info")].some((t: any) => t.textContent === "Verified"));
  a.click($("all")); await sleep(60);
  ok("P2 Select all skips verified (u2)", sh.querySelectorAll("#list input:checked").length === 4 && !sh.querySelector('.row[data-pk="u2"] input').checked, sh.querySelectorAll("#list input:checked").length);
  a.click($("clr")); await (a.w as any).chrome.storage.local.set({ protectVerified: false }); await sleep(300);

  ok("P3 baseline marked complete", store.nfb_seen_instagram_900 && store.nfb_seen_instagram_900.complete === true && Object.values(store.nfb_seen_instagram_900.m).every((v: any) => v === 0));
  net.following = [...net.following, U(7)];
  await (a.w as any).chrome.storage.local.set({ allowScan_instagram: true, protectRecentDays: 7 }); await sleep(1700);
  $("lim").value = "0"; a.click($("scan")); await sleep(150); a.click(sh.querySelector(".modal .btn.primary")); await sleep(600);
  ok("P4 new account is 'Recent'", store.nfb_seen_instagram_900.m.u7 > 0 && sh.querySelector('.row[data-pk="u7"] .tag.info') && sh.querySelector('.row[data-pk="u7"] .tag.info').textContent === "Recent");
  a.click($("all")); await sleep(60);
  ok("P5 Select all skips recent", !sh.querySelector('.row[data-pk="u7"] input').checked);
  await (a.w as any).chrome.storage.local.set({ protectRecentDays: 0 }); await sleep(300);

  await (a.w as any).chrome.storage.local.set({ warmupEnabled: true, warmupStart: 3, warmupStep: 2 }); await sleep(400);
  ok("W1 chip shows warm-up limit", /0 \/ 3 today · warm-up/.test($("chipCap").textContent), $("chipCap").textContent);
  a.click($("all")); await sleep(60);
  ok("W2 selection limited to warm-up (3)", sh.querySelectorAll("#list input:checked").length === 3, sh.querySelectorAll("#list input:checked").length);
  store.nfb_days_instagram_900 = { n: 3, last: "2000-01-01" }; await (a.w as any).chrome.storage.local.set({ warmupStep: 2 }); await sleep(400);
  ok("W3 grows with active days (3 + 2*3 = 9)", /0 \/ 9 today/.test($("chipCap").textContent), $("chipCap").textContent);
  await (a.w as any).chrome.storage.local.set({ warmupEnabled: false }); await sleep(300);

  a.click($("clr")); a.click(sh.querySelector("#list input[type=checkbox]")); await sleep(50);
  a.click($("del")); await sleep(150); a.click(sh.querySelector(".modal .btn.danger")); await sleep(900);
  ok("R0 one unfollowed", (store.nfb_hist_instagram_900 || []).length === 1);
  tab("history"); await sleep(30);
  const btn = sh.querySelector("#list .btn:not(.tagbtn)");
  ok("R1 Re-follow button shown", btn && btn.textContent === "Re-follow");
  const who = store.nfb_hist_instagram_900[0].pk;
  a.click(btn); await sleep(300);
  ok("R2 follow request sent", net.calls.some((u: string) => /friendships\/create\//.test(u)));
  ok("R3 marked re-followed + kept", store.nfb_hist_instagram_900[0].refollowed === true && !!store.nfb_keep_instagram_900[who]);
  ok("R4 tag replaces button", sh.querySelector("#list .tag.ok") && sh.querySelector("#list .tag.ok").textContent === "Re-followed");
  tab("keep"); a.click(sh.querySelector("#list .btn:not(.tagbtn)")); await sleep(100); tab("todo"); await sleep(30);
  ok("R5 'Move back' returns it to the list", !!sh.querySelector(`.row[data-pk="${who}"]`));

  tab("todo"); a.click($("expCsv")); await sleep(50);
  const csvBlob = (a.w as any).__downloads.find((b: any) => b.name && b.name.endsWith(".csv"));
  ok("E1 CSV downloaded with header", csvBlob && csvBlob.name === "unfollow-guard-instagram-todo.csv");
  a.click(sh.querySelector('.row .btn:not(.tagbtn)')); await sleep(60);
  tab("keep"); a.click($("expJson")); await sleep(50);
  const js = (a.w as any).__downloads.find((b: any) => b.name && b.name.endsWith(".json"));
  ok("E2 Backup JSON downloaded", !!js && js.name.includes("kept-backup"));
  a.click(sh.querySelector("#list .btn:not(.tagbtn)")); await sleep(60);
  tab("todo"); await sleep(30);
  const first = sh.querySelector("#list .row").dataset.pk;
  const fakeFile = { text: async () => "username\n@" + first + "\nnot_a_known_user\n" };
  Object.defineProperty($("fileIn"), "files", { value: [fakeFile], configurable: true });
  $("fileIn").dispatchEvent(new (a.w as any).Event("change")); await sleep(150);
  ok("E3 import adds known, reports unknown", !!store.nfb_keep_instagram_900[first] && /1 not found/.test([...sh.querySelectorAll(".toast")].map((t: any) => t.textContent).join(" ")), JSON.stringify([...sh.querySelectorAll(".toast")].map((t: any) => t.textContent)));

  const mod = readSource("src/adapters/instagram.ts");
  ok("L1 label dictionaries present", /Siguiendo/.test(mod) && /Dejar de seguir/.test(mod) && /Se désabonner/.test(mod));

  doms.forEach((d) => d.window.close());
  finish();
});
