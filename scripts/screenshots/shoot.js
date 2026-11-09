import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fullStore, initScript, PAGE_HTML, PAGE_HTML_DARK } from "./demo.js";
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..") + "/";
const OUT = EXT + "docs/screenshots/";
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(os.tmpdir() + "/nfb-frames", { recursive: true });
const SRC = fs.readFileSync(EXT + "dist/test/content.js", "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_ = "https://www.instagram.com/demo/";

async function newPage(browser, store, dark, scale = 1.5) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: scale });
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url().startsWith(URL_) ? r.respond({ status: 200, contentType: "text/html", body: dark ? PAGE_HTML_DARK : PAGE_HTML }) : r.url().startsWith("data:") ? r.continue() : r.abort()));
  page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
  await page.evaluateOnNewDocument(initScript(store));
  await page.goto(URL_);
  await page.setCookie({ name: "ds_user_id", value: "777", url: URL_ }, { name: "csrftoken", value: "demo", url: URL_ });
  await page.addScriptTag({ content: SRC });
  await sleep(700);
  return page;
}
const $in = (page, fn, ...a) => page.evaluate(fn, ...a);
const sh = "document.getElementById('nfb-host').shadowRoot";
const click = (page, sel) => page.evaluate((s) => document.getElementById("nfb-host").shadowRoot.querySelector(s).click(), sel);
const clickFab = async (page) => { const r = await page.evaluate(() => { const b = document.getElementById("nfb-host").shadowRoot.getElementById("fab").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }); await page.mouse.click(r.x, r.y); await sleep(350); };
const shot = async (page, selector, file) => { const h = await page.evaluateHandle((s) => document.getElementById("nfb-host").shadowRoot.querySelector(s), selector); await h.asElement().screenshot({ path: file }); };
const tab = (page, id) => click(page, `.tab[data-id="${id}"]`).then(() => sleep(250));

(async () => {
  const browser = await puppeteer.launch({ args: [...chromium.args, "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });

  // ---- light + dark panels, plus the other tabs
  for (const theme of ["light", "dark"]) {
    const page = await newPage(browser, fullStore(theme), theme === "dark");
    await clickFab(page);
    await shot(page, "#panel", OUT + `panel-${theme}.png`);
    if (theme === "light") {
      await tab(page, "stats"); await shot(page, "#panel", OUT + "stats.png");
      await tab(page, "changes"); await shot(page, "#panel", OUT + "changes.png");
      await tab(page, "history"); await shot(page, "#panel", OUT + "history.png");
      await tab(page, "mutual"); await shot(page, "#panel", OUT + "mutuals.png");
      await click(page, "#gear"); await sleep(250); await shot(page, "#panel", OUT + "settings.png");
      await click(page, "#gear"); await sleep(200); await tab(page, "todo");
      // confirm dialog + progress card
      await click(page, "#del"); await sleep(400);
      await page.screenshot({ path: OUT + "dialog.png", clip: { x: 300, y: 150, width: 680, height: 520 } });
      await click(page, ".modal .btn.danger"); await sleep(1700);
      await shot(page, "#runcard", OUT + "progress.png");
    } else {
      await tab(page, "stats"); await shot(page, "#panel", OUT + "stats-dark.png");
    }
    await page.close();
  }

  // ---- Spanish panel, label dialog, self-check, welcome tour
  {
    const es = await newPage(browser, fullStore("light", { lang: "es" }), false);
    await clickFab(es); await shot(es, "#panel", OUT + "panel-es.png"); await es.close();

    const tag = await newPage(browser, fullStore("light"), false);
    await clickFab(tag);
    await tag.evaluate(() => document.getElementById("nfb-host").shadowRoot.querySelector("#list .row .tagbtn").click()); await sleep(350);
    await tag.screenshot({ path: OUT + "labels.png", clip: { x: 300, y: 150, width: 680, height: 520 } }); await tag.close();

    const dg = await newPage(browser, fullStore("light"), false);
    await clickFab(dg);
    await dg.evaluate(() => { const r = document.getElementById("nfb-host").shadowRoot; r.querySelector("details.log").open = true; r.getElementById("diagBtn").click(); });
    await sleep(900);
    await dg.screenshot({ path: OUT + "selfcheck.png", clip: { x: 300, y: 150, width: 680, height: 520 } }); await dg.close();

    const lim = await newPage(browser, fullStore("light"), false);
    await clickFab(lim);
    await lim.evaluate(() => document.getElementById("nfb-host").shadowRoot.getElementById("chipCap").click()); await sleep(450);
    await lim.screenshot({ path: OUT + "limit.png", clip: { x: 300, y: 150, width: 680, height: 520 } }); await lim.close();

    const tour = await newPage(browser, fullStore("light", { nfb_onboarded: false }), false);
    await clickFab(tour); await sleep(450);
    await tour.screenshot({ path: OUT + "tour.png", clip: { x: 300, y: 150, width: 680, height: 520 } }); await tour.close();
  }

  // ---- demo GIF (fresh account: scan -> select -> unfollow)
  const fresh = fullStore("light");
  ["nfb_scan_instagram_777", "nfb_lists_instagram_777", "nfb_keep_instagram_777", "nfb_gone_instagram_777", "nfb_hist_instagram_777", "nfb_flw_instagram_777", "nfb_snap_instagram_777", "nfb_seen_instagram_777", "nfb_sel_instagram_777", "nfb_meta_instagram_777"].forEach((k) => delete fresh[k]);
  fresh.__noDaily = true;
  fresh.nfb_onboarded = true;
  const page = await newPage(browser, fresh, false, 1);
  let n = 0; const frame = async (label) => { await page.screenshot({ path: `${os.tmpdir()}/nfb-frames/f${String(n++).padStart(2, "0")}.png` }); console.log("frame", n - 1, label); };
  await frame("page");
  await clickFab(page); await sleep(200); await frame("empty panel");
  await page.evaluate(() => { document.getElementById("nfb-host").shadowRoot.getElementById("lim").value = "0"; });
  await click(page, "#scan"); await sleep(450); await frame("scan dialog");
  await click(page, ".modal .btn.primary"); await sleep(700); await frame("scanning");
  await sleep(1800); await frame("results");
  await page.evaluate(() => { const r = document.getElementById("nfb-host").shadowRoot; r.getElementById("n").value = "5"; r.getElementById("selN").click(); }); await sleep(350); await frame("selected");
  await click(page, "#del"); await sleep(450); await frame("unfollow dialog");
  await click(page, ".modal .btn.danger"); await sleep(1100); await frame("unfollowing");
  await sleep(1300); await frame("unfollowed + countdown");
  await tab(page, "history"); await sleep(200); await frame("history");
  await tab(page, "stats"); await sleep(200); await frame("stats");
  await browser.close();
})().catch((e) => { console.log("FAIL", e.stack); process.exit(1); });
