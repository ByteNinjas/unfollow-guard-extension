// Regression tests for the two ways an unfollow batch could silently die:
// 1) the extension is reloaded/updated while an Instagram tab stays open (Chrome removes its APIs);
// 2) a captured fb_dtsg/jazoest pair stops matching the token the page currently uses.
import { JSDOM, VirtualConsole } from "jsdom";
import { checks, readBundle } from "./helpers/harness.ts";
import { it } from "vitest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const content = readBundle("content.js");
const adapters = readBundle("adapters.js");

it("orphaned content script: stops its timers and asks for a page reload", async () => {
  const { ok, finish } = checks();
  const store: Record<string, any> = { nfb_onboarded: true, enabled: true, minDelay: 10, maxDelay: 10 };
  let invalid = false;
  let calls = 0;
  const storageError = () => new Error("Extension context invalidated.");
  const local = {
    get: async (k: any) => {
      calls++;
      if (invalid) throw storageError();
      const o: any = {};
      (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); });
      return o;
    },
    set: async (o: any) => { calls++; if (invalid) throw storageError(); Object.assign(store, JSON.parse(JSON.stringify(o))); },
    remove: async (k: any) => { calls++; if (invalid) throw storageError(); (Array.isArray(k) ? k : [k]).forEach((x) => delete store[x]); },
    onChanged: { addListener() {} },
  };
  const dom = new JSDOM("<!doctype html><html lang='en'><body></body></html>", {
    url: "https://www.instagram.com/x/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window as any;
  (w.document as any).cookie = "ds_user_id=777";
  (w.document as any).cookie = "csrftoken=abc";
  w.chrome = { runtime: { id: "test-extension" }, storage: { local, onChanged: { addListener() {} } } };
  w.Element.prototype.scrollIntoView = function () {};
  w.fetch = async () => ({ ok: true, status: 200, text: async () => "{}", json: async () => ({}) });

  w.eval(content);
  await sleep(500);
  const sh = () => (w.document.getElementById("nfb-host") as any).shadowRoot;
  ok("R1 panel boots with a live extension context", !!sh() && !sh().querySelector(".deadcard") && !!w.NFB.alive());

  // Chrome's real behaviour after chrome.runtime.reload(): the old content script keeps running,
  // but runtime.id becomes undefined and every storage call rejects.
  invalid = true;
  w.chrome.runtime.id = "";
  await sleep(2200);
  const card = sh().querySelector(".deadcard");
  ok("R2 panel is replaced by the reload banner", !!card && sh().getElementById("panel").style.display === "none", card && card.textContent);
  ok("R3 banner explains what happened", /Extension updated/.test(card ? card.textContent : "") && /Reload page/.test(card ? card.textContent : ""), card && card.textContent);
  ok("R4 liveness flag is set", w.NFB.dead === true && w.NFB.alive() === false);
  ok("R4b an in-flight batch is stopped in memory", typeof w.NFB.shouldStop === "function" && w.NFB.shouldStop() === true);

  await sleep(300);
  const stopped = calls;
  await sleep(2000);
  ok("R5 all panel timers stopped (no more storage calls)", calls === stopped, `${stopped} -> ${calls}`);

  dom.window.close();
  finish();
});

it("captured Instagram tokens expire and jazoest always matches the token that is sent", async () => {
  const { ok, finish } = checks();
  const dom = new JSDOM(
    `<!doctype html><html lang="en" data-nfb='{"fb_dtsg":"OLDT","jazoest":"2CAP","x-ig-www-claim":"claim-1"}'><body></body></html>`,
    { url: "https://www.instagram.com/user1/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: new VirtualConsole() },
  );
  const w = dom.window as any;
  w.chrome = {
    storage: {
      local: { get: async () => ({}), set: async () => {}, remove: async () => ({}), onChanged: { addListener() {} } },
      onChanged: { addListener() {} },
    },
  };
  w.Element.prototype.scrollIntoView = function () {};
  const requests: Array<{ url: string; init: any }> = [];
  w.fetch = async (url: string, init: any) => {
    requests.push({ url, init });
    return { ok: true, status: 200, text: async () => JSON.stringify({ status: "ok", friendship_status: { following: false } }) };
  };
  w.eval(adapters);
  const A = w.NFB.adapters.instagram;

  await A.unfollow({ pk: "42", username: "user1" }, { igMethod: "api" });
  const first = new URLSearchParams(requests[0].init.body);
  ok("T1 a fresh captured token is used", first.get("fb_dtsg") === "OLDT", String(first.get("fb_dtsg")));
  ok("T2 the site's matching jazoest is forwarded", first.get("jazoest") === "2CAP", String(first.get("jazoest")));

  // 31 minutes later the captured token is past DTSG_TTL and the page has rotated it.
  const base = w.Date.now();
  w.Date.now = () => base + 31 * 60 * 1000;
  w.document.body.insertAdjacentHTML("beforeend", '<input name="fb_dtsg" value="NEWTOKEN">');

  await A.unfollow({ pk: "43", username: "user2" }, { igMethod: "api" });
  const second = new URLSearchParams(requests[1].init.body);
  const expectedJz = "2" + [..."NEWTOKEN"].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  ok("T3 the stale captured token is not reused", second.get("fb_dtsg") === "NEWTOKEN", String(second.get("fb_dtsg")));
  ok("T4 jazoest is derived from the new token", second.get("jazoest") === expectedJz && second.get("jazoest") !== "2CAP", String(second.get("jazoest")));
  ok("T5 other captured headers still apply", requests[1].init.headers["x-ig-www-claim"] === "claim-1", String(requests[1].init.headers["x-ig-www-claim"]));

  dom.window.close();
  finish();
});
