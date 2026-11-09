// The browser-click unfollow path finds the right buttons in all five languages.
import { JSDOM } from "jsdom";
import { checks, readBundle } from "./helpers/harness.ts";
import { it } from "vitest";

const bundle = readBundle("adapters.js");

function page(lang: string, words: any, { confirmStep = false, followingLabel }: any = {}) {
  const dom = new JSDOM(`<!doctype html><html lang="${lang}"><body></body></html>`, { url: "https://www.instagram.com/user1/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window as any;
  // jsdom has no innerText: emulate it (skips the hidden <title> inside icons, like a browser)
  Object.defineProperty(w.HTMLElement.prototype, "innerText", { get() { const walk = (n: any): string => n.nodeType === 3 ? n.textContent : n.nodeName.toLowerCase() === "title" ? "" : [...n.childNodes].map(walk).join(n.nodeName === "DIV" ? "\n" : ""); return walk(this).trim(); } });
  w.Element.prototype.scrollIntoView = function () {};
  w.chrome = { storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {}, onChanged: { addListener() {} } }, onChanged: { addListener() {} } } };
  const d = w.document;
  d.body.innerHTML = `<header><h2>user1</h2><button id="rel"><div>${followingLabel || words.following}</div><svg><title>Down chevron icon</title></svg></button><button>${words.message}</button></header>`;
  const rel = d.getElementById("rel");
  rel.addEventListener("click", () => {
    if (rel.dataset.state === "followed") return;
    const dlg = d.createElement("div"); dlg.setAttribute("role", "dialog");
    dlg.innerHTML = `<button>${words.close}</button><div role="button">${words.mute}</div><div role="button" id="unf">${words.unfollow}</div>`;
    d.body.append(dlg);
    dlg.querySelector("#unf").addEventListener("click", () => {
      if (confirmStep && !dlg.dataset.confirm) {
        dlg.dataset.confirm = "1"; dlg.innerHTML = `<div>Unfollow @user1?</div><button id="unf2">${words.unfollow}</button>`;
        dlg.querySelector("#unf2").addEventListener("click", () => { dlg.remove(); rel.firstChild.textContent = words.follow; });
      } else { dlg.remove(); rel.firstChild.textContent = words.follow; }
    });
  });
  w.eval(bundle);
  // Don't wait out the built-in 1 s pauses between the browser clicks; the flow is what matters here.
  w.NFB.sleep = () => new Promise((r) => setTimeout(r, 1));
  return { w, A: w.NFB.adapters.instagram };
}

const langs: Record<string, any> = {
  en: { following: "Following", follow: "Follow", unfollow: "Unfollow", message: "Message", close: "Cancel", mute: "Mute" },
  es: { following: "Siguiendo", follow: "Seguir", unfollow: "Dejar de seguir", message: "Enviar mensaje", close: "Cancelar", mute: "Silenciar" },
  fr: { following: "Abonné(e)", follow: "S'abonner", unfollow: "Se désabonner", message: "Message", close: "Annuler", mute: "Mettre en sourdine" },
  de: { following: "Gefolgt", follow: "Folgen", unfollow: "Nicht mehr folgen", message: "Nachricht", close: "Abbrechen", mute: "Stummschalten" },
  pt: { following: "Seguindo", follow: "Seguir", unfollow: "Deixar de seguir", message: "Mensagem", close: "Cancelar", mute: "Silenciar" },
};

it("ui labels: browser-click unfollow in every language, private confirm, unknown language", async () => {
  const { ok, finish } = checks();

  for (const [lang, words] of Object.entries(langs)) {
    const p = page(lang, words);
    try { await p.A.unfollow({ pk: "1", username: "user1" }, { igMethod: "ui" }); ok("UI " + lang, p.w.document.getElementById("rel").firstChild.textContent === words.follow); }
    catch (e: any) { ok("UI " + lang, false, e.message); }
    p.w.close();
  }
  // private account (needs a second confirm click)
  { const p = page("en", langs.en, { confirmStep: true });
    try { await p.A.unfollow({ pk: "1", username: "user1" }, { igMethod: "ui" }); ok("UI private confirm step", p.w.document.getElementById("rel").firstChild.textContent === "Follow"); } catch (e: any) { ok("UI private confirm step", false, e.message); }
    p.w.close(); }
  // already not following -> nothing to do
  { const p = page("es", langs.es, { followingLabel: "Seguir" });
    try { await p.A.unfollow({ pk: "1", username: "user1" }, { igMethod: "ui" }); ok("UI already unfollowed is a no-op", !p.w.document.querySelector("[role=dialog]")); } catch (e: any) { ok("UI already unfollowed is a no-op", false, e.message); }
    p.w.close(); }
  // unknown language: error lists the buttons; custom label fixes it
  const th = { following: "กำลังติดตาม", follow: "ติดตาม", unfollow: "เลิกติดตาม", message: "ข้อความ", close: "ยกเลิก", mute: "ปิดเสียง" };
  { const p = page("th", th);
    try { await p.A.unfollow({ pk: "1", username: "user1" }, { igMethod: "ui" }); ok("UI unknown language errors", false, "no error"); }
    catch (e: any) { ok("UI unknown language errors with buttons listed", /Buttons seen: \[กำลังติดตาม/.test(e.message), e.message); }
    p.w.close(); }
  { const p = page("th", th);
    try { await p.A.unfollow({ pk: "1", username: "user1" }, { igMethod: "ui", labelFollowing: "กำลังติดตาม", labelUnfollow: "เลิกติดตาม" }); ok("UI custom labels work", p.w.document.getElementById("rel").firstChild.textContent === th.follow); }
    catch (e: any) { ok("UI custom labels work", false, e.message); }
    p.w.close(); }

  finish();
}, 120000);
