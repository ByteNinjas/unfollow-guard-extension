// The toolbar popup renders the shared settings and keeps the master switch in sync.
import { JSDOM } from "jsdom";
import { checks, readBundle, readSource } from "./helpers/harness.ts";
import { it } from "vitest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it("popup: settings render and the master switch toggles the extension", async () => {
  const { ok, finish } = checks();
  const html = readSource("src/popup/index.html").replace(
    '<script type="module" src="./main.ts"></script>',
    "<script>" + readBundle("popup.js") + "</script>",
  );
  const store: Record<string, any> = { igMethodV2: true }; const ls: Array<(ch: any) => void> = [];
  const errs: string[] = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w) {
      const local = {
        get: async (k: any) => { const o: any = {}; (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); }); return o; },
        set: async (o: any) => { const ch: any = {}; for (const k in o) { ch[k] = { oldValue: store[k], newValue: o[k] }; store[k] = JSON.parse(JSON.stringify(o[k])); } ls.forEach((f) => f(ch)); },
        remove: async () => {},
        onChanged: { addListener: (f: any) => ls.push(f) },
      };
      (w as any).chrome = { storage: { local, onChanged: { addListener: (f: any) => ls.push(f) } } };
      w.addEventListener("error", (e: any) => errs.push(e.message));
    },
  });
  const w = dom.window as any, d = w.document;

  await sleep(300);
  const t = d.getElementById("enabledTop");
  ok("P1 settings rendered", !!d.getElementById("theme"), errs.join(" | "));
  ok("P2 enabled by default", t.checked === true && /Enabled/.test(d.getElementById("state").textContent), d.getElementById("state").textContent);
  ok("P3 no script errors", errs.length === 0, errs.join(" | "));

  t.checked = false; t.dispatchEvent(new w.Event("change")); await sleep(450);
  ok("P4 switching off is stored and reflected", store.enabled === false && /Disabled/.test(d.getElementById("state").textContent) && d.getElementById("enabled").checked === false, JSON.stringify({ stored: store.enabled, text: d.getElementById("state").textContent, sw: d.getElementById("enabled").checked }));
  t.checked = true; t.dispatchEvent(new w.Event("change")); await sleep(450);
  ok("P5 switching on is stored and reflected", store.enabled === true && /Enabled/.test(d.getElementById("state").textContent) && d.getElementById("enabled").checked === true, JSON.stringify({ stored: store.enabled, text: d.getElementById("state").textContent, sw: d.getElementById("enabled").checked }));

  w.close();
  finish();
});
