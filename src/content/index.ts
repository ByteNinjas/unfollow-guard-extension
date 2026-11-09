import { NFB } from "../shared";
import "../i18n";
import "../adapters";

(() => {
  if (document.getElementById("nfb-host")) return;
  const A = Object.values(NFB.adapters).find((a: any) => a.match()) as any;
  if (!A) return;
  const ACCT = String((A.accountId && A.accountId()) || "default"); // everything below is stored per logged-in account
  const dayKey = `${A.id}_${ACCT}`;
  const K = (n) => `nfb_${n}_${A.id}_${ACCT}`;
  const scanKey = K("scan"), listsKey = K("lists"), keepKey = K("keep"), selKey = K("sel"),
        goneKey = K("gone"), histKey = K("hist"), runKey = K("run"), stopKey = K("stop"),
        snapKey = K("snap"), flwKey = K("flw"), coolKey = K("cool"), metaKey = K("meta"), seenKey = K("seen"),
        tagsKey = K("tags"), schedKey = K("sched"), picsKey = K("pics"), failKey = K("fail");
  const allowKey = "allowScan_" + A.id;
  const IS_BETA = !!(NFB.PLATFORMS.find((p) => p.id === A.id) || {}).beta;

  const LOGO = `<svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true"><defs><linearGradient id="nfbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0095f6"/><stop offset="1" stop-color="#833ab4"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#nfbg)"/><circle cx="25" cy="21" r="9" fill="#fff"/><path d="M7 49a18 18 0 0 1 36 0z" fill="#fff"/><circle cx="46" cy="45" r="12" fill="#ff3b5c" stroke="#6f55d9" stroke-width="3"/><rect x="40" y="43.5" width="12" height="3" rx="1.5" fill="#fff"/></svg>`;

  // ---------- UI (Shadow DOM so the site's CSS/dark mode can't affect it) ----------
  const host = document.createElement("div");
  host.id = "nfb-host";
  host.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;display:none;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
  <style>
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    ${NFB.themeCSS}
    ${NFB.uiCSS}
    ${NFB.settingsCSS}
    .app { display: contents; }
    button { font-family: inherit; }

    /* floating button */
    .fab { position: fixed; left: 0; top: 0; visibility: hidden; height: 44px; padding: 0 18px 0 14px; border: 0; border-radius: 22px;
           background: var(--accent); color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px;
           user-select: none; touch-action: none; box-shadow: 0 6px 18px rgba(0,0,0,.35); }
    .fab.drag { cursor: grab; }
    .fab.drag:active { cursor: grabbing; }

    /* panel */
    .panel { position: fixed; left: 0; top: 0; display: none; flex-direction: column; width: 440px; max-width: calc(100vw - 32px); height: 86vh;
             background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 18px;
             box-shadow: 0 18px 48px rgba(0,0,0,.38); overflow: hidden; }
    .head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border); }
    .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .brand .title { font-size: 15px; font-weight: 700; color: var(--fg); }
    .brand .sub { font-size: 12px; color: var(--fg2); display: flex; align-items: center; gap: 6px; }
    .hbtns { display: flex; gap: 2px; }
    .iconbtn { width: 32px; height: 32px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--fg);
               cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; }
    .iconbtn:hover { background: var(--hover); border-color: var(--border); }
    .main { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .setview { display: none; flex: 1; overflow-y: auto; padding: 14px; background: var(--bg2); color: var(--fg); }

    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 12px 14px 0; }
    .stat { background: var(--bg2); border-radius: 12px; padding: 6px 10px; }
    .stat b { display: block; font-size: 16px; font-weight: 700; color: var(--fg); }
    .stat span { font-size: 11px; color: var(--fg2); }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; padding: 10px 14px 0; }
    .chip { font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 999px; background: var(--bg2); color: var(--fg); }
    .chip.ok { background: var(--ok-soft); color: var(--green); }
    .chip.warn { background: var(--warn-soft); color: #b45309; }
    .chip.info { background: var(--accent-soft); color: var(--accent); }
    .chipbtn { border: 0; cursor: pointer; font-family: inherit; }
    .chipbtn:hover { filter: brightness(.95); }
    .notice { margin: 10px 14px 0; padding: 9px 12px; border-radius: 12px; background: var(--bg2); font-size: 12.5px; line-height: 1.45; color: var(--fg); }
    .notice:empty { display: none; }
    .scan { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 8px 14px; }
    .scan .lbl { font-size: 12.5px; color: var(--fg2); }
    .scan .num { width: 62px; text-align: center; }

    .tabs { display: flex; gap: 2px; padding: 0 10px; overflow-x: auto; border-bottom: 1px solid var(--border); scrollbar-width: none; }
    .tabs::-webkit-scrollbar { display: none; }
    .tab { flex: none; padding: 10px 9px; font-size: 13px; font-weight: 600; color: var(--fg2); background: none; border: 0;
           border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; }
    .tab:hover { color: var(--fg); }
    .tab.on { color: var(--accent); border-bottom-color: var(--accent); }
    .tab .n { font-weight: 500; opacity: .75; margin-left: 4px; font-size: 12px; }
    .toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 10px 14px 6px; }
    .toolbar .search { flex: 1; min-width: 150px; }
    .sel2 { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; padding: 0 14px 6px; }
    .sel2 .num { width: 56px; text-align: center; }
    .note { margin: 0 14px 6px; font-size: 12px; color: var(--fg2); }
    .note:empty { display: none; }

    .list { flex: 1; overflow-y: auto; min-height: 60px; }
    .list::-webkit-scrollbar { width: 8px; }
    .list::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 8px; }
    .row { display: flex; align-items: center; gap: 12px; padding: 8px 14px; }
    label.row { cursor: pointer; }
    .row:hover { background: var(--hover); }
    .row input[type=checkbox] { width: 18px; height: 18px; flex: none; accent-color: var(--accent); }
    .av { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex: none; background: var(--av-bg); }
    .ph { display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 700; color: #fff; background: #8e8e93; }
    .who { flex: 1; min-width: 0; }
    .un { font-size: 14px; font-weight: 600; color: var(--fg); text-decoration: none; display: block;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .un:hover { text-decoration: underline; }
    .fn { font-size: 12.5px; color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tag { flex: none; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; background: var(--bg2); color: var(--fg2); white-space: nowrap; }
    .tag.ok { background: var(--ok-soft); color: var(--green); }
    .tag.warn { background: var(--warn-soft); color: #b45309; }
    .tag.info { background: var(--accent-soft); color: var(--accent); }
    .empty { padding: 36px 24px; color: var(--fg2); font-size: 13.5px; text-align: center; line-height: 1.5; }
    .stats2 { padding: 12px 14px 16px; }
    .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .card2 { background: var(--bg2); border-radius: 12px; padding: 12px; }
    .card2 b { display: block; font-size: 20px; font-weight: 700; color: var(--fg); }
    .card2 span { display: block; font-size: 12.5px; font-weight: 600; color: var(--fg); margin-top: 2px; }
    .card2 small { font-size: 11px; color: var(--fg2); }
    .chart-title { margin: 16px 0 8px; font-size: 12.5px; font-weight: 700; color: var(--fg); }
    .bars { display: flex; align-items: flex-end; gap: 5px; height: 112px; padding: 0 2px; }
    .bcol { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 3px; }
    .bcol i { display: block; width: 100%; max-width: 22px; border-radius: 5px 5px 2px 2px; background: var(--accent); }
    .bn, .bl { font-size: 10px; color: var(--fg2); }
    .bn { height: 12px; }

    .footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--border); background: var(--bg); }
    .footer .count { font-size: 13px; font-weight: 600; color: var(--fg); }
    .footer .count span { display: block; font-size: 11.5px; font-weight: 400; color: var(--fg2); }
    .footer .acts { display: flex; gap: 8px; }
    details.log { border-top: 1px solid var(--border); background: var(--bg); color: var(--fg); }
    details.log summary { padding: 8px 14px; font-size: 12px; cursor: pointer; color: var(--fg2); }
    .logbox { max-height: 110px; overflow-y: auto; padding: 0 14px 10px; font-size: 11.5px; line-height: 1.5;
              font-family: ui-monospace, Menlo, Consolas, monospace; color: var(--fg); }

    /* progress card (top of the screen while unfollowing) */
    .runcard { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); display: none; width: min(440px, calc(100vw - 24px));
               background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 16px;
               box-shadow: 0 12px 34px rgba(0,0,0,.35); padding: 12px 14px; }
    .rc-top { display: flex; align-items: center; gap: 12px; }
    .rc-av { position: relative; width: 44px; height: 44px; flex: none; }
    .rc-av .av { width: 44px; height: 44px; }
    .rc-badge { position: absolute; right: -4px; bottom: -4px; width: 20px; height: 20px; border-radius: 50%; font-size: 12px; font-weight: 800;
                display: flex; align-items: center; justify-content: center; color: #fff; background: var(--accent); border: 2px solid var(--bg); }
    .rc-badge.ok { background: #16a34a; }
    .rc-badge.warn { background: #d97706; }
    .rc-badge.spin::after { content: ""; width: 9px; height: 9px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: nfbspin .8s linear infinite; }
    @keyframes nfbspin { to { transform: rotate(360deg); } }
    .rc-txt { flex: 1; min-width: 0; }
    .rc-title { font-size: 14px; font-weight: 700; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rc-sub { font-size: 12px; color: var(--fg2); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rc-bar { height: 5px; border-radius: 4px; background: var(--bg2); margin-top: 10px; overflow: hidden; }
    .rc-bar i { display: block; height: 100%; width: 0; background: var(--accent); transition: width .4s; }
    .toasts { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; }
    .toast { background: #1f2933; color: #fff; font-size: 13px; padding: 9px 14px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.35); max-width: 380px; }
    .field.sm { height: 30px; font-size: 12.5px; padding: 0 8px; }
    textarea.field { height: auto; padding: 8px 10px; font-family: inherit; }
    .filters { display: flex; gap: 8px; padding: 0 14px 6px; flex-wrap: wrap; }
    .logtools { display: flex; gap: 8px; padding: 0 14px 8px; }
    .toast .tbtn { margin-left: 12px; background: transparent; border: 0; color: #7cc4ff; font-weight: 700; cursor: pointer; font-size: 13px; }
    .tagbtn { width: 28px; padding: 0; font-size: 13px; flex: none; }
    .row .fn { max-width: 100%; }
  </style>
  <div class="app" id="app" data-theme="system">
    <button class="fab" id="fab" aria-label="Unfollow Guard"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="8" r="4"/><path d="M2 21a8 8 0 0 1 16 0"/><path d="M16 12h6"/></svg><span>Unfollow Guard</span></button>

    <div class="panel" id="panel" role="region" aria-label="Unfollow Guard">
      <div class="head">
        <div class="brand">${LOGO}<div><div class="title">Unfollow Guard</div>
          <div class="sub">${A.label}${IS_BETA ? ' <span class="badge" title="Facebook support is not fully tested yet">BETA</span>' : ""}<span id="acct"></span></div></div></div>
        <div class="hbtns">
          <button class="iconbtn" id="helpBtn" data-ti="tt_help">?</button>
          <button class="iconbtn" id="themeBtn">◐</button>
          <button class="iconbtn" id="gear" data-ti="tt_settings">⚙</button>
          <button class="iconbtn" id="closeBtn" data-ti="tt_close">✕</button>
        </div>
      </div>

      <div class="main" id="main">
        <div class="stats">
          <div class="stat"><b id="stFollowing">–</b><span data-i="st_following"></span></div>
          <div class="stat"><b id="stFollowers">–</b><span data-i="st_followers"></span></div>
          <div class="stat"><b id="stMutual">–</b><span data-i="st_mutual"></span></div>
          <div class="stat"><b id="stTodo">–</b><span data-i="st_todo"></span></div>
        </div>
        <div class="chips"><span class="chip" id="chipTime"></span><button class="chip chipbtn" id="chipCap" type="button" data-ti="tip_chipcap"></button></div>
        <div class="notice" id="status" role="status" aria-live="polite"></div>
        <div class="scan">
          <select class="field" id="lim">
            <option value="50" data-i="opt_first" data-n="50"></option><option value="100" data-i="opt_first" data-n="100"></option>
            <option value="250" data-i="opt_first" data-n="250"></option><option value="500" data-i="opt_first" data-n="500"></option>
            <option value="0" data-i="opt_all"></option>
          </select>
          <span class="lbl" id="startwrap"><span data-i="lbl_from"></span> <input class="field num" id="start" type="number" min="1" value="1"></span>
          <button class="btn primary" id="scan" style="margin-left:auto"></button>
        </div>
        <div class="tabs" id="tabs" role="tablist"></div>
        <div class="toolbar" id="toolbar">
          <input class="field search" id="q" type="search" data-ph="ph_search">
          <button class="btn sm" id="expCsv" data-i="btn_csv" data-ti="tip_csv"></button>
          <button class="btn sm" id="expJson" style="display:none" data-i="btn_backup" data-ti="tip_backup"></button>
          <button class="btn sm" id="impKept" style="display:none" data-i="btn_import" data-ti="tip_import"></button>
          <input type="file" id="fileIn" accept=".json,.csv,.txt,text/plain,text/csv,application/json" style="display:none" tabindex="-1">
        </div>
        <div class="filters" id="filters">
          <select class="field sm" id="fltr">
            <option value="all" data-i="flt_all"></option><option value="private" data-i="flt_private"></option><option value="public" data-i="flt_public"></option>
            <option value="nopic" data-i="flt_nopic"></option><option value="verified" data-i="flt_verified"></option>
            <option value="tagged" data-i="flt_tagged"></option><option value="untagged" data-i="flt_untagged"></option>
          </select>
          <select class="field sm" id="srt">
            <option value="default" data-i="srt_default"></option><option value="az" data-i="srt_az"></option>
            <option value="za" data-i="srt_za"></option><option value="name" data-i="srt_name"></option>
          </select>
        </div>
        <div class="sel2" id="sel2">
          <button class="btn sm" id="selN" data-i="btn_selfirst"></button>
          <input class="field num" id="n" type="number" min="1" value="30" aria-label="30">
          <button class="btn sm" id="all" data-i="btn_selall"></button>
          <button class="btn sm" id="clr" data-i="btn_clear"></button>
        </div>
        <div class="note" id="listNote"></div>
        <div class="list" id="list"></div>
        <div class="footer" id="footer">
          <div class="count"><div id="selLabel"></div><span id="selSub"></span></div>
          <div class="acts">
            <button class="btn" id="keepSel" data-i="btn_keep"></button>
            <button class="btn danger" id="del"></button>
          </div>
        </div>
        <details class="log"><summary data-i="log_title"></summary>
          <div class="logtools"><button class="btn sm" id="diagBtn" data-i="btn_selfcheck"></button><button class="btn sm" id="dbgBtn" data-i="btn_copydebug"></button></div>
          <div class="logbox" id="log"></div></details>
      </div>
      <div class="setview" id="setview">${NFB.settingsHTML}</div>
    </div>

    <div class="runcard" id="runcard" role="status" aria-live="polite">
      <div class="rc-top">
        <div class="rc-av"><span id="rcAv"></span><span class="rc-badge spin" id="rcBadge"></span></div>
        <div class="rc-txt"><div class="rc-title" id="rcTitle"></div><div class="rc-sub" id="rcSub"></div></div>
        <button class="btn danger sm" id="runstop"></button>
      </div>
      <div class="rc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" id="rcBar"><i id="rcFill"></i></div>
    </div>
    <div class="toasts" id="toasts" role="status" aria-live="polite"></div>
    <div id="modalhost"></div>
  </div>`;
  document.body.append(host);

  const $ = (id) => shadow.getElementById(id);
  const tr = (k: string, v?: Record<string, unknown>) => NFB.t(k, v);
  NFB.watchTheme($("app"));
  const panel = $("panel"), listEl = $("list"), modalHost = $("modalhost");
  const scanBtn = $("scan"), delBtn = $("del"), keepBtn = $("keepSel"), stopBtn = $("runstop");
  const ask = (o) => NFB.dialog(modalHost, o);
  const fmtN = (v) => (typeof v === "number" ? v.toLocaleString() : "–");

  // Fills every element marked data-i (text), data-ph (placeholder) and data-ti (tooltip + accessible name).
  function applyLang() {
    shadow.querySelectorAll("[data-i]").forEach((el) => { el.textContent = tr(el.dataset.i, el.dataset.n ? { n: Number(el.dataset.n).toLocaleString() } : undefined); });
    shadow.querySelectorAll("[data-ph]").forEach((el) => { el.placeholder = tr(el.dataset.ph); el.setAttribute("aria-label", el.placeholder); });
    shadow.querySelectorAll("[data-ti]").forEach((el) => {
      const s = tr(el.dataset.ti);
      el.title = s;
      if (!el.textContent.trim() || el.textContent.trim() === "?" || el.classList.contains("iconbtn")) el.setAttribute("aria-label", s);
    });
    stopBtn.textContent = tr(stopBtn.dataset.state === "stopping" ? "btn_stopping" : schedPending ? "btn_cancel" : "btn_stop");
  }

  const setStatus = (text) => ($("status").textContent = text || "");
  // toast with an optional action button (e.g. Undo)
  const toast = (msg, action?) => {
    const d = document.createElement("div");
    d.className = "toast";
    d.textContent = msg;
    if (action) {
      d.style.pointerEvents = "auto";
      const b = document.createElement("button");
      b.className = "tbtn";
      b.textContent = action.label;
      b.onclick = () => { d.remove(); action.fn(); };
      d.append(b);
    }
    $("toasts").append(d);
    setTimeout(() => d.remove(), action ? 7000 : 3200);
  };
  // Activity log. `name` is kept separately so a shared debug report can hide usernames.
  const logEntries = [];
  const logBox = $("log");
  const log = (text, name?) => {
    logEntries.push({ at: Date.now(), text, name: name || "" });
    if (logEntries.length > 200) logEntries.shift();
    const d = document.createElement("div");
    d.textContent = new Date().toLocaleTimeString() + "  " + text;
    logBox.prepend(d);
    while (logBox.childElementCount > 80) logBox.lastChild.remove();
    console.log("[Unfollow Guard]", text);
  };
  const notify = (title, message) => {
    try { if (chrome.runtime && chrome.runtime.sendMessage) chrome.runtime.sendMessage({ type: "notify", title, message }, () => void chrome.runtime.lastError); } catch {}
  };

  const placeholder = (u) => {
    const d = document.createElement("div");
    d.className = "av ph";
    d.textContent = ((u && u.username) || "?").trim().charAt(0).toUpperCase();
    return d;
  };
  // ---------- profile pictures ----------
  // Instagram picture links expire after a few days and can be blocked by the page's security rules or a
  // privacy shield. A picture is therefore loaded in steps: directly, then through the extension's background
  // worker, then (Instagram) with a freshly requested link. Only if all fail is a letter shown.
  const picCache = new Map();       // url -> data URL, this session
  let picFresh: Record<string, any> = {};                // pk -> refreshed url (saved)
  const expiredUrl = (url) => { const m = /[?&]oe=([0-9a-f]+)/i.exec(url || ""); return !!m && parseInt(m[1], 16) * 1000 < Date.now(); };
  const loadImg = (img, src) => new Promise((res) => {
    const timer = setTimeout(() => res(false), 8000);
    img.onload = () => { clearTimeout(timer); res(true); };
    img.onerror = () => { clearTimeout(timer); res(false); };
    img.src = src;
  });

  const bgQueue = []; let bgActive = 0;
  const fetchViaBg = (url) => new Promise((res) => {
    try { chrome.runtime.sendMessage({ type: "fetch-image", url }, (r) => { void chrome.runtime.lastError; res(r && r.ok ? r.data : null); }); } catch { res(null); }
  });
  function pumpBg() {
    while (bgActive < 4 && bgQueue.length) {
      const job = bgQueue.shift();
      bgActive++;
      fetchViaBg(job.url).then((d) => {
        if (d) { if (picCache.size > 400) picCache.delete(picCache.keys().next().value); picCache.set(job.url, d); }
        job.resolve(d);
      }).finally(() => { bgActive--; pumpBg(); });
    }
  }
  const viaExtension = (url) => (picCache.has(url) ? Promise.resolve(picCache.get(url)) : new Promise((resolve) => { bgQueue.push({ url, resolve }); pumpBg(); }));

  // Asks the site for a fresh picture link, slowly (about one a second), at most 80 per page load, and
  // stops for the rest of the page load if the site answers with a limit or block.
  let refreshBudget = 80, refreshDead = false, refreshBusy = false;
  const refreshQ = [], refreshing = new Map();
  function refreshPic(u) {
    if (!A.refreshPic || refreshDead || refreshBudget <= 0) return Promise.resolve(null);
    if (refreshing.has(u.pk)) return refreshing.get(u.pk);
    const p = new Promise((resolve) => { refreshQ.push({ u, resolve }); pumpRefresh(); });
    refreshing.set(u.pk, p);
    return p;
  }
  async function pumpRefresh() {
    if (refreshBusy) return;
    refreshBusy = true;
    while (refreshQ.length) {
      const { u, resolve } = refreshQ.shift();
      if (refreshDead || refreshBudget <= 0) { resolve(null); continue; }
      refreshBudget--;
      let url = null;
      try { url = await A.refreshPic(u); } catch (e) { if (e && e.fatal) refreshDead = true; }
      resolve(url);
      await NFB.sleep(NFB.rand(900, 1600));
    }
    refreshBusy = false;
  }
  let picT;
  const savePics = () => { clearTimeout(picT); picT = setTimeout(() => chrome.storage.local.set({ [picsKey]: picFresh }), 800); };

  async function loadAvatar(img, u) {
    const attempt = async (url) => {
      if (!url) return false;
      if (/^data:/.test(url)) return loadImg(img, url);
      if (expiredUrl(url)) return false;                       // known to be dead: don't even try
      if (await loadImg(img, url)) return true;
      const d = await viaExtension(url);
      return !!d && (await loadImg(img, d));
    };
    const url = picFresh[u.pk] || u.pic;
    if (await attempt(url)) return;
    const fresh = await refreshPic(u);
    if (fresh && fresh !== url && (await attempt(fresh))) { picFresh[u.pk] = fresh; savePics(); return; }
    img.replaceWith(placeholder(u));
  }
  const avatarEl = (u) => {
    if (!u || !(u.pic || picFresh[u.pk])) return placeholder(u);
    const img = new Image();
    img.className = "av";
    img.alt = "";
    img.decoding = "async";
    loadAvatar(img, u);
    return img;
  };
  async function picCheck() {
    const u = users.find((x) => x.pic) || ((lists && lists.following) || []).find((x) => x.pic);
    if (!u) return [{ ok: null, name: "Profile pictures", detail: "none saved yet: run a scan" }];
    const url = picFresh[u.pk] || u.pic;
    const out = [];
    const exp = expiredUrl(url);
    out.push({ ok: !exp, name: "Picture link", detail: exp ? "expired (links last a few days): refreshed automatically, or scan again" : "not expired" });
    const test = (src) => loadImg(new Image(), src);
    out.push({ ok: await test(url), name: "Picture loads directly in the page", detail: "" });
    const d = await viaExtension(url);
    out.push({ ok: !!d, name: "Picture loads through the extension", detail: d ? "" : "blocked, expired or unavailable" });
    out.push({ ok: A.refreshPic ? true : null, name: "Expired links can be refreshed", detail: A.refreshPic ? `up to ${refreshBudget} more this page load` : "not supported on this site" });
    return out;
  }

  // ---------- header buttons: settings / theme / close / help ----------
  let inSettings = false;
  function refreshGear() {
    const s = tr(inSettings ? "tt_back" : "tt_settings");
    $("gear").textContent = inSettings ? "←" : "⚙";
    $("gear").title = s;
    $("gear").setAttribute("aria-label", s);
  }
  $("gear").onclick = () => {
    inSettings = !inSettings;
    $("main").style.display = inSettings ? "none" : "flex";
    $("setview").style.display = inSettings ? "block" : "none";
    refreshGear();
  };
  const THEMES = ["system", "light", "dark"];
  const THEME_ICON = { system: "◐", light: "☀", dark: "☾" };
  let theme = "system";
  const showTheme = (v) => {
    theme = THEMES.includes(v) ? v : "system";
    const s = tr("tt_theme", { x: theme[0].toUpperCase() + theme.slice(1) });
    $("themeBtn").textContent = THEME_ICON[theme];
    $("themeBtn").title = s;
    $("themeBtn").setAttribute("aria-label", s);
  };
  $("themeBtn").onclick = () => chrome.storage.local.set({ theme: THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] });
  $("closeBtn").onclick = () => (panel.style.display = "none");
  $("helpBtn").onclick = () => showTour();

  // ---------- button placement + dragging ----------
  const fab = $("fab");
  const M = 16;
  let cfg = { position: "bottom-right", draggable: true };
  let custom = null;
  const vw = () => document.documentElement.clientWidth;
  const vh = () => window.innerHeight;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function fabXY() {
    const w = fab.offsetWidth, h = fab.offsetHeight;
    const maxX = Math.max(0, vw() - w), maxY = Math.max(0, vh() - h);
    if (cfg.draggable && custom) return { x: custom.fx * maxX, y: custom.fy * maxY, w, h };
    const p = cfg.position || "bottom-right";
    return { x: clamp(p.endsWith("left") ? M : maxX - M, 0, maxX), y: clamp(p.startsWith("top") ? M : maxY - M, 0, maxY), w, h };
  }
  function placePanel(f) {
    const W = vw(), H = vh();
    const pw = Math.min(440, W - 2 * M);
    const above = f.y + f.h / 2 > H / 2;
    const space = above ? f.y - 8 - M : H - (f.y + f.h) - 8 - M;
    const ph = Math.max(Math.min(340, H - 2 * M), Math.min(H * 0.92, space));
    const rightAlign = f.x + f.w / 2 > W / 2;
    const x = clamp(rightAlign ? f.x + f.w - pw : f.x, M, Math.max(M, W - pw - M));
    const y = clamp(above ? f.y - 8 - ph : f.y + f.h + 8, M, Math.max(M, H - ph - M));
    panel.style.width = pw + "px";
    panel.style.height = ph + "px";
    panel.style.left = x + "px";
    panel.style.top = y + "px";
  }
  function place(override?) {
    const f = override || fabXY();
    fab.style.left = f.x + "px";
    fab.style.top = f.y + "px";
    if (panel.style.display === "flex") placePanel(f);
  }
  async function loadCfg() {
    const s = await NFB.getSettings();
    cfg = { position: s.position, draggable: !!s.draggable };
    const o = await chrome.storage.local.get<Record<string, any>>("fabPos_" + A.id);
    custom = o["fabPos_" + A.id] || null;
    fab.classList.toggle("drag", cfg.draggable);
    place();
    fab.style.visibility = "visible";
  }
  window.addEventListener("resize", () => place());
  const togglePanel = () => {
    panel.style.display = panel.style.display === "flex" ? "none" : "flex";
    place();
    if (panel.style.display === "flex") { fillView(); maybeTour(); }
  };
  let drag = null;
  fab.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const f = fabXY();
    drag = { sx: e.clientX, sy: e.clientY, ox: f.x, oy: f.y, w: f.w, h: f.h, moved: false };
    fab.setPointerCapture(e.pointerId);
  });
  fab.addEventListener("pointermove", (e) => {
    if (!drag || !cfg.draggable) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    drag.x = clamp(drag.ox + dx, 0, Math.max(0, vw() - drag.w));
    drag.y = clamp(drag.oy + dy, 0, Math.max(0, vh() - drag.h));
    place({ x: drag.x, y: drag.y, w: drag.w, h: drag.h });
  });
  fab.addEventListener("pointerup", async (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    try { fab.releasePointerCapture(e.pointerId); } catch {}
    if (!d.moved) return togglePanel();
    const maxX = Math.max(1, vw() - d.w), maxY = Math.max(1, vh() - d.h);
    custom = { fx: d.x / maxX, fy: d.y / maxY };
    await chrome.storage.local.set({ ["fabPos_" + A.id]: custom });
  });
  fab.addEventListener("pointercancel", () => { drag = null; place(); });


  // ---------- state ----------
  // Big data (scan, lists) is read once and cached; small data (keep, gone, history, selection, tags) is saved
  // separately, so ticking, keeping and unfollowing never rewrite the big lists.
  let scanCache: any = null;       // last saved scan (users = non-followers)
  let lists: any = null;           // {followers, following, followingComplete}
  let users: any[] = [];             // non-followers still to decide on
  let keep: Record<string, any> = {};              // pk -> user kept
  let gone = new Set<any>();       // unfollowed since the last scan
  let hist: any[] = [];              // unfollow history [{pk, username, full_name, pic, at}]
  let selected = new Set();
  let followerSet = new Set(), followingSet = new Set(), histSet = new Set(), mutual = [], fans = [];
  let seen: any = { complete: false, m: {} }; // when the extension first saw each account you follow (0 = already followed before)
  let tab = "todo", query = "", fltr = "all", srt = "default";
  let capInfo: any = { cap: 40, used: 0 };
  let scanning = false, unfollowing = false, stop = false, enabled = true;
  let runNextAt = 0;
  let flw: any[] = [];               // follower changes between scans [{pk, username, full_name, pic, type: "lost"|"new", at}]
  let coolUntil = 0;          // cool-down after a block (timestamp)
  let safety = NFB.DEFAULTS;  // cool-down, protection, schedule... settings
  let tags: Record<string, any> = {};              // pk -> {tag, note}
  let failed: Record<string, any> = {};            // pk -> reason, for accounts whose unfollow failed (also after the retry)
  let onboarded = true;
  let schedPending = null;    // {cancel} while a scheduled batch counts down
  NFB.shouldStop = () => stop;

  const TAG_IDS = ["friend", "family", "client", "work", "other"];
  const tagLabel = (id) => tr("tag_" + id);
  const maxSel = () => Math.max(0, capInfo.cap - capInfo.used);
  const capMsg = () =>
    tr("ts_cap", { cap: capInfo.cap, warm: capInfo.warm ? tr("ts_cap_warm", { base: capInfo.base }) : "", used: capInfo.used, max: maxSel() });
  const esc = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/"/g, '\\"'));

  let selT;
  const saveSel = () => { clearTimeout(selT); selT = setTimeout(() => chrome.storage.local.set({ [selKey]: [...selected] }), 150); };
  const saveKeep = () => chrome.storage.local.set({ [keepKey]: keep });
  const saveHist = () => chrome.storage.local.set({ [histKey]: hist });
  const saveTags = () => chrome.storage.local.set({ [tagsKey]: tags });

  function derive() {
    const fol = (lists && lists.followers) || null;
    const fing = (lists && lists.following) || [];
    followerSet = new Set((fol || []).map((u) => u.pk));
    followingSet = new Set(fing.map((u) => u.pk));
    histSet = new Set(hist.map((h) => h.pk));
    mutual = fol ? fing.filter((u) => followerSet.has(u.pk) && !histSet.has(u.pk)) : [];
    fans = fol ? fol.filter((u) => !followingSet.has(u.pk)) : [];
  }
  // Instagram's lists lag a few minutes behind: accounts unfollowed in the last 24 h are hidden if a scan still lists them
  const recentlyUnfollowed = () => new Set(hist.filter((h) => !h.refollowed && Date.now() - h.at < 864e5).map((h) => h.pk));

  // ---------- tabs + list (renders in chunks: big lists stay fast) ----------
  const TABS = [
    { id: "todo", count: () => users.length, items: () => users },
    { id: "keep", count: () => Object.keys(keep).length, items: () => Object.values(keep) },
    { id: "mutual", count: () => mutual.length, items: () => mutual },
    { id: "fans", count: () => fans.length, items: () => fans },
    { id: "followers", count: () => (lists && lists.followers ? lists.followers.length : 0), items: () => (lists && lists.followers) || [] },
    { id: "following", count: () => (lists && lists.following ? lists.following.length : 0), items: () => (lists && lists.following) || [] },
    { id: "history", count: () => hist.length, items: () => hist.slice().reverse() },
  ];
  if (A.followerDiff) TABS.push({ id: "changes", count: () => flw.length, items: () => flw.slice().reverse() });
  TABS.push({ id: "stats", count: () => "", items: () => [] });
  const FILTER_TABS = new Set(["todo", "keep", "mutual", "fans", "followers", "following"]);
  const tabLabel = (id) => tr("tab_" + id);

  const tabsEl = $("tabs");
  TABS.forEach((t) => {
    const b = document.createElement("button");
    b.className = "tab";
    b.dataset.id = t.id;
    b.setAttribute("role", "tab");
    b.innerHTML = '<span class="tl"></span><span class="n">0</span>';
    b.querySelector(".tl").textContent = tabLabel(t.id);
    b.onclick = () => showTab(t.id);
    tabsEl.append(b);
  });
  tabsEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const ids = TABS.map((x) => x.id);
    const j = (ids.indexOf(tab) + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length;
    showTab(ids[j]);
    tabsEl.querySelector(`[data-id="${ids[j]}"]`).focus();
    e.preventDefault();
  });

  const emptyText = () => {
    if (query || (FILTER_TABS.has(tab) && fltr !== "all")) return tr("empty_nomatch");
    const withF = !!(lists && lists.followers);
    switch (tab) {
      case "todo": return tr("empty_todo");
      case "keep": return tr("empty_keep");
      case "mutual": return tr(withF ? "empty_mutual_a" : "empty_mutual_b");
      case "fans": return tr(withF ? "empty_fans_a" : "empty_fans_b");
      case "followers": return tr(lists && lists.followers === null ? "empty_followers_a" : "empty_followers_b");
      case "following": return tr("empty_following");
      case "history": return tr("empty_history");
      case "changes": return tr("empty_changes");
      default: return "";
    }
  };
  const emptyEl = () => {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = emptyText();
    return d;
  };

  const rows = new Map(); // pk -> {row, cb} for the To-unfollow tab
  const BATCH = 60;
  let filtered = [], shown = 0;

  const matches = (u) => !query || ((u.username || "") + " " + (u.full_name || "")).toLowerCase().includes(query);
  const tabItems = () => TABS.find((t) => t.id === tab).items();
  const tagOf = (u) => (tags[u.pk] && tags[u.pk].tag) || "";
  const passFilter = (u) => {
    switch (fltr) {
      case "private": return u.private === true;
      case "public": return u.private === false;
      case "nopic": return u.noPic === true;
      case "verified": return !!u.verified;
      case "tagged": return !!tagOf(u);
      case "untagged": return !tagOf(u);
      default: return true;
    }
  };
  const SORTERS = {
    az: (a, b) => (a.username || "").localeCompare(b.username || ""),
    za: (a, b) => (b.username || "").localeCompare(a.username || ""),
    name: (a, b) => (a.full_name || "").localeCompare(b.full_name || ""),
  };

  const tagEl = (text, kind) => {
    const s = document.createElement("span");
    s.className = "tag" + (kind ? " " + kind : "");
    s.textContent = text;
    return s;
  };

  function buildRow(u) {
    const todo = tab === "todo";
    const row = document.createElement(todo ? "label" : "div");
    row.className = "row";
    row.dataset.pk = u.pk;
    let cb = null;
    if (todo) {
      cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(u.pk);
      cb.onchange = () => {
        if (cb.checked) {
          if (selected.size >= maxSel()) { cb.checked = false; toast(capMsg()); return; }
          selected.add(u.pk);
        } else selected.delete(u.pk);
        saveSel();
        updateChrome();
      };
      row.append(cb);
    }
    const who = document.createElement("div");
    who.className = "who";
    const a = document.createElement("a");
    a.className = "un";
    a.href = A.profileUrl(u);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = u.username + (u.verified ? " ✔" : "");
    a.onclick = (e) => e.stopPropagation();
    const fn = document.createElement("div");
    fn.className = "fn";
    const note = tags[u.pk] && tags[u.pk].note;
    const base = tab === "history" ? tr("sub_unfollowed", { when: NFB.fmtWhen(u.at) })
      : tab === "changes" ? tr(u.type === "lost" ? "sub_lost" : "sub_new", { when: NFB.fmtWhen(u.at) })
      : u.full_name || "";
    fn.textContent = note ? (base ? base + " · " : "") + "📝 " + note : base;
    if (note) row.title = note;
    who.append(a, fn);
    row.append(avatarEl(u), who);

    const addTagUi = () => {
      const t = tagOf(u);
      if (t) row.append(tagEl(tagLabel(t), "info"));
      const tb = document.createElement("button");
      tb.className = "btn sm tagbtn";
      tb.textContent = "🏷";
      tb.title = tr("tip_tag");
      tb.setAttribute("aria-label", tr("tip_tag") + " @" + u.username);
      tb.onclick = (e) => { e.preventDefault(); e.stopPropagation(); editTag(u); };
      row.append(tb);
    };
    const actionBtn = (label, tip, fn2) => {
      const b = document.createElement("button");
      b.className = "btn sm";
      b.textContent = label;
      b.title = tip;
      b.setAttribute("aria-label", label + " @" + u.username);
      b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fn2(b); };
      row.append(b);
    };

    if (tab === "todo") {
      if (failed[u.pk]) { const ft = tagEl(tr("tag_failed"), "warn"); ft.title = failed[u.pk]; row.append(ft); }
      const why = protectReason(u);
      if (why && !(tagOf(u) && why === tagLabel(tagOf(u)))) row.append(tagEl(why, "info"));
      addTagUi();
      actionBtn(tr("btn_keep"), tr("tip_keep"), () => keepUsers([u.pk]));
    } else if (tab === "keep") {
      addTagUi();
      actionBtn(tr("btn_moveback"), tr("tip_moveback"), () => unkeepUsers([u.pk]));
    } else if (tab === "history") {
      if (u.refollowed) row.append(tagEl(tr("tag_refollowed"), "ok"));
      else if (A.follow) actionBtn(tr("btn_refollow"), tr("tip_refollow"), (b) => refollow(u, b));
    } else if (tab === "fans") {
      row.append(tagEl(tr("tag_followsyou"), "ok"));
    } else if (tab === "mutual") {
      row.append(tagEl(tr("tag_mutual"), "ok"));
    } else if (tab === "followers") {
      if (followingSet.has(u.pk)) row.append(tagEl(tr("tag_mutual"), "ok"));
      else if (lists && lists.following) row.append(tagEl(tr("tag_youdont"), ""));
    } else if (tab === "following") {
      if (histSet.has(u.pk)) row.append(tagEl(tr("tag_unfollowed"), "warn"));
      else if (lists && lists.followers) row.append(followerSet.has(u.pk) ? tagEl(tr("tag_followsyou"), "ok") : tagEl(tr("tag_notback"), "warn"));
    } else if (tab === "changes") {
      row.append(u.type === "lost" ? tagEl(tr("tag_lost"), "warn") : tagEl(tr("tag_new"), "ok"));
    }
    return { row, cb };
  }

  // An account that no longer exists (removed, banned, deactivated) leaves the list; it doesn't use up today's limit.
  async function dropUnavailable(u, why?) {
    users = users.filter((x) => x.pk !== u.pk);
    selected.delete(u.pk);
    gone.add(u.pk);
    delete failed[u.pk];
    derive();
    if (tab === "todo") removeFromList(u.pk);
    await chrome.storage.local.set({ [goneKey]: [...gone], [selKey]: [...selected], [failKey]: failed });
    log(`⚠ ${u.username} ${why || "is no longer available"}: removed from the list`, u.username);
    updateChrome();
  }
  const withTimeout = (p, ms) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(Object.assign(new Error("Timed out"), { timeout: true })), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });

  function refreshRow(u) {
    const old = listEl.querySelector(`.row[data-pk="${esc(u.pk)}"]`);
    if (!old) return;
    const r = buildRow(u);
    old.replaceWith(r.row);
    if (r.cb) rows.set(u.pk, r);
  }

  function appendMore() {
    const end = Math.min(filtered.length, shown + BATCH);
    const frag = document.createDocumentFragment();
    for (let i = shown; i < end; i++) {
      const r = buildRow(filtered[i]);
      frag.append(r.row);
      if (r.cb) rows.set(filtered[i].pk, r);
    }
    shown = end;
    listEl.append(frag);
  }
  function fillView() {
    if (!listEl.clientHeight) return; // panel hidden: render more once it is shown
    let guard = 0;
    while (shown < filtered.length && listEl.scrollHeight <= listEl.clientHeight + 160 && guard++ < 25) appendMore();
  }
  listEl.addEventListener("scroll", () => {
    if (shown < filtered.length && listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 320) appendMore();
  });

  function renderList() {
    if (tab === "stats") { renderStats(); updateChrome(); return; }
    listEl.replaceChildren();
    rows.clear();
    filtered = tabItems().filter(matches);
    if (FILTER_TABS.has(tab)) {
      filtered = filtered.filter(passFilter);
      if (SORTERS[srt]) filtered = filtered.slice().sort(SORTERS[srt]);
    }
    shown = 0;
    if (!filtered.length) listEl.append(emptyEl());
    else { appendMore(); fillView(); }
    updateChrome();
  }
  function removeFromList(pk) {
    const i = filtered.findIndex((u) => u.pk === pk);
    if (i >= 0) { filtered.splice(i, 1); if (i < shown) shown--; }
    const el = listEl.querySelector(`.row[data-pk="${esc(pk)}"]`);
    if (el) el.remove();
    rows.delete(pk);
    if (!filtered.length) { listEl.replaceChildren(emptyEl()); } else fillView();
  }
  function syncChecks() { rows.forEach(({ cb }, pk) => (cb.checked = selected.has(pk))); }

  function showTab(id) {
    tab = id;
    renderList();
    listEl.scrollTop = 0;
  }
  let qT;
  $("q").oninput = () => { clearTimeout(qT); qT = setTimeout(() => { query = $("q").value.trim().toLowerCase(); renderList(); }, 140); };
  $("fltr").onchange = () => { fltr = $("fltr").value; renderList(); };
  $("srt").onchange = () => { srt = $("srt").value; renderList(); };

  // ---------- header numbers, chips, footer ----------
  let lastStatus = "";
  function publishStatus() { // lets the toolbar badge show today's progress
    const st = { used: capInfo.used, cap: capInfo.cap, running: unfollowing, cool: coolUntil > Date.now() };
    const j = JSON.stringify(st);
    if (j === lastStatus) return;
    lastStatus = j;
    chrome.storage.local.set({ nfb_status: st });
  }

  function updateChrome() {
    const fing = scanCache && typeof scanCache.following === "number" ? scanCache.following : lists && lists.following ? lists.following.length : null;
    const fol = scanCache && typeof scanCache.followers === "number" ? scanCache.followers : lists && lists.followers ? lists.followers.length : null;
    $("stFollowing").textContent = fmtN(fing);
    $("stFollowers").textContent = fmtN(fol);
    $("stMutual").textContent = lists && lists.followers ? fmtN(mutual.length) : "–";
    $("stTodo").textContent = fmtN(users.length);
    tabsEl.querySelectorAll(".tab").forEach((b) => {
      const t = TABS.find((x) => x.id === b.dataset.id);
      const on = t.id === tab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      b.querySelector(".tl").textContent = tabLabel(t.id);
      b.querySelector(".n").textContent = t.id === "stats" ? "" : fmtN(t.count());
    });
    const todo = tab === "todo";
    $("toolbar").style.display = tab === "stats" ? "none" : "flex";
    $("filters").style.display = FILTER_TABS.has(tab) ? "flex" : "none";
    $("expJson").style.display = tab === "keep" ? "" : "none";
    $("impKept").style.display = tab === "keep" ? "" : "none";
    $("sel2").style.display = todo ? "flex" : "none";
    $("footer").style.display = todo ? "flex" : "none";
    $("selLabel").textContent = tr("ft_selected", { n: selected.size });
    $("selSub").textContent = tr("ft_left", { n: maxSel() });
    delBtn.textContent = selected.size ? tr("btn_unfollow_n", { n: selected.size }) : tr("btn_unfollow");
    delBtn.disabled = unfollowing || !selected.size;
    keepBtn.disabled = unfollowing || !selected.size;
    const partial = lists && lists.followingComplete === false && (tab === "following" || tab === "mutual" || tab === "fans");
    $("listNote").textContent = partial ? tr("note_partial") : "";
    tick();
    publishStatus();
  }

  let lastDay = NFB.today();
  function tick() {
    const chip = $("chipTime");
    const now = Date.now();
    if (coolUntil && coolUntil <= now) { coolUntil = 0; chrome.storage.local.remove(coolKey); }
    const outside = !NFB.inActiveHours(safety);
    let txt, kind;
    if (coolUntil > now) { txt = tr("chip_cool", { t: NFB.fmtHM(coolUntil - now) }); kind = "warn"; }
    else if (outside) { txt = tr("chip_hours", { t: NFB.fmtHM(NFB.msToActiveStart(safety)) }); kind = "warn"; }
    else if (unfollowing && runNextAt > now) { txt = tr("chip_next", { t: NFB.fmtClock((runNextAt - now) / 1000) }); kind = "info"; }
    else if (unfollowing) { txt = tr("chip_run"); kind = "info"; }
    else if (maxSel() <= 0) { txt = tr("chip_cap", { t: NFB.fmtHM(NFB.msToMidnight()) }); kind = "warn"; }
    else { txt = tr("chip_ready"); kind = "ok"; }
    chip.textContent = txt;
    chip.className = "chip " + kind;
    $("chipCap").textContent = tr("chip_today", { used: capInfo.used, cap: capInfo.cap }) + (capInfo.warm ? tr("chip_warm") : "");
    if (NFB.today() !== lastDay) { lastDay = NFB.today(); refreshCap(); }
  }
  setInterval(tick, 1000);

  async function refreshCap() {
    const s = await NFB.getSettings();
    const d = await NFB.getDaily(dayKey);
    safety = s;
    const base = s["dailyCap_" + A.id];
    const eff = await NFB.effectiveCap(dayKey, s, base);
    capInfo = { cap: eff.cap, used: d.count, base, warm: eff.warm };
    if (selected.size > maxSel()) {
      selected = new Set([...selected].slice(0, maxSel()));
      syncChecks();
      saveSel();
    }
    updateChrome();
  }


  // ---------- protection (bulk selection skips these) ----------
  let patterns = [], patSrc = null;
  const compilePatterns = () =>
    (safety.protectPattern || "").split(",").map((x) => x.trim()).filter(Boolean)
      .map((p) => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i"));
  const protectReason = (u) => {
    if (safety.protectVerified && u.verified) return tr("tag_verified");
    if (safety.protectPrivate && u.private === true) return tr("tag_private");
    if (safety.protectTagged && tagOf(u)) return tagLabel(tagOf(u));
    if (safety.protectPattern) {
      if (safety.protectPattern !== patSrc) { patSrc = safety.protectPattern; patterns = compilePatterns(); }
      if (patterns.some((r) => r.test(u.username || ""))) return tr("tag_pattern");
    }
    const d = safety.protectRecentDays;
    if (d > 0) { const x = seen.m[u.pk]; if (x && Date.now() - x < d * 864e5) return tr("tag_recent"); }
    return "";
  };
  async function updateSeen(res) {
    const cur = (res.lists && res.lists.following) || [];
    if (!cur.length) return;
    const now = Date.now();
    cur.forEach((u) => { if (!(u.pk in seen.m)) seen.m[u.pk] = seen.complete ? now : 0; });
    if (res.lists.followingComplete) seen.complete = true;
    await chrome.storage.local.set({ [seenKey]: seen });
  }

  // ---------- labels + notes ----------
  async function editTag(u) {
    const cur = tags[u.pk] || { tag: "", note: "" };
    const body = document.createElement("div");
    body.textContent = tr("tag_dlg_body");
    const sel = document.createElement("select");
    sel.className = "field";
    sel.style.cssText = "width:100%;margin-top:10px";
    [["", tr("tag_none")], ...TAG_IDS.map((id) => [id, tagLabel(id)])].forEach(([v, l]) => {
      const o = document.createElement("option");
      o.value = v; o.textContent = l; o.selected = v === cur.tag;
      sel.append(o);
    });
    const ta = document.createElement("textarea");
    ta.className = "field";
    ta.style.cssText = "width:100%;height:72px;margin-top:8px;resize:vertical";
    ta.placeholder = tr("tag_note_ph");
    ta.maxLength = 200;
    ta.value = cur.note || "";
    body.append(sel, ta);
    const ok = await ask({ title: tr("tag_dlg_title", { u: u.username }), body, confirmText: tr("btn_save"), cancelText: tr("btn_cancel"), focusFirst: true });
    if (!ok) return;
    if (!sel.value && !ta.value.trim()) delete tags[u.pk];
    else tags[u.pk] = { tag: sel.value, note: ta.value.trim() };
    saveTags();
    const old = listEl.querySelector(`.row[data-pk="${esc(u.pk)}"]`);
    if (old) { const r = buildRow(u); old.replaceWith(r.row); if (r.cb) rows.set(u.pk, r); }
    updateChrome();
  }

  // ---------- keep list (changes rows in place: no re-render, no flicker) ----------
  const slimKeep = (u) => ({ pk: u.pk, username: u.username, full_name: u.full_name || "", pic: u.pic || "", verified: !!u.verified, private: u.private, noPic: u.noPic });
  function keepUsers(pks, quiet?) {
    let n = 0;
    const did = [];
    pks.forEach((pk) => {
      const u = users.find((x) => x.pk === pk);
      if (!u) return;
      keep[pk] = u;
      selected.delete(pk);
      if (tab === "todo") removeFromList(pk);
      did.push(pk);
      n++;
    });
    if (!n) return toast(tr("ts_pickfirst"));
    users = users.filter((x) => !keep[x.pk]);
    saveKeep();
    saveSel();
    updateChrome();
    if (!quiet) toast(tr("ts_kept", { n }), { label: tr("btn_undo"), fn: () => unkeepUsers(did, true) });
  }
  function unkeepUsers(pks, quiet?) {
    let n = 0;
    pks.forEach((pk) => {
      const u = keep[pk];
      if (!u) return;
      delete keep[pk];
      if (!gone.has(pk)) users.unshift(u);
      if (tab === "keep") removeFromList(pk);
      n++;
    });
    if (!n) return;
    saveKeep();
    if (tab === "todo") renderList(); else updateChrome();
    if (!quiet) toast(tr("ts_moved", { n }));
  }
  keepBtn.onclick = () => keepUsers([...selected]);

  // ---------- re-follow (Unfollowed tab) ----------
  async function refollow(u, btn) {
    if (!A.follow) return;
    btn.disabled = true;
    btn.textContent = tr("btn_refollowing");
    try {
      await A.follow(u, safety);
      u.refollowed = true; // `u` is the history entry itself
      keep[u.pk] = slimKeep(u);
      gone.delete(u.pk);
      await Promise.all([saveHist(), saveKeep(), chrome.storage.local.set({ [goneKey]: [...gone] })]);
      derive();
      log(`↺ re-followed ${u.username}`, u.username);
      toast(tr("ts_refollowed", { u: u.username }));
      if (tab === "history") renderList(); else updateChrome();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = tr("btn_refollow");
      log(`✗ re-follow ${u.username}: ${e.message}`, u.username);
      toast(tr("ts_refollow_fail", { e: e.message }));
    }
  }

  // ---------- export / import ----------
  const csvCell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const download = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  const iso = (t) => new Date(t).toISOString();
  $("expCsv").onclick = () => {
    const items = TABS.find((x) => x.id === tab).items();
    if (!items.length) return toast(tr("ts_nothing"));
    const extra = tab === "history" ? [(u) => iso(u.at), (u) => (u.refollowed ? "yes" : "no")] : tab === "changes" ? [(u) => u.type, (u) => iso(u.at)] : [];
    const head = ["username", "full_name", "profile_url", "label", "note", ...(tab === "history" ? ["unfollowed_at", "re_followed"] : tab === "changes" ? ["change", "at"] : [])];
    const lines = [head.map(csvCell).join(",")].concat(
      items.map((u) => [u.username, u.full_name || "", A.profileUrl(u), tagOf(u) ? tagLabel(tagOf(u)) : "", (tags[u.pk] && tags[u.pk].note) || "", ...extra.map((f) => f(u))].map(csvCell).join(","))
    );
    download(`unfollow-guard-${A.id}-${tab}.csv`, "\ufeff" + lines.join("\r\n"), "text/csv");
    toast(tr("ts_exported", { n: items.length }));
  };
  $("expJson").onclick = () => {
    const kept = Object.values(keep).map((u) => ({ ...slimKeep(u), tag: tagOf(u), note: (tags[u.pk] && tags[u.pk].note) || "" }));
    if (!kept.length) return toast(tr("ts_nothing"));
    const data = { app: "unfollow-guard", version: 2, platform: A.id, account: ACCT, exportedAt: new Date().toISOString(), kept };
    download(`unfollow-guard-${A.id}-kept-backup.json`, JSON.stringify(data, null, 2), "application/json");
    toast(tr("ts_exported", { n: kept.length }));
  };
  const readText = (f) => (f.text ? f.text() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(f); }));
  function importKept(text) {
    let entries = [];
    try {
      const j = JSON.parse(text);
      const arr = Array.isArray(j) ? j : j.kept || j.users || [];
      entries = arr.map((x) => (typeof x === "string" ? { username: x } : x));
    } catch {
      entries = text.split(/[\r\n,;]+/).map((x) => x.trim().replace(/^"|"$/g, "").replace(/^@/, "")).filter((x) => x && !/^(username|user|name)$/i.test(x)).map((x) => ({ username: x }));
    }
    const byName = new Map();
    [...users, ...Object.values(keep), ...((lists && lists.following) || []), ...hist].forEach((u) => { if (u && u.username) byName.set(String(u.username).toLowerCase(), u); });
    let added = 0, missing = 0;
    entries.forEach((e) => {
      const found = e.pk ? e : byName.get(String(e.username || "").toLowerCase());
      if (!found || !found.pk) { missing++; return; }
      if (e.tag || e.note) tags[found.pk] = { tag: TAG_IDS.includes(e.tag) ? e.tag : "", note: String(e.note || "") };
      if (keep[found.pk]) return;
      keep[found.pk] = slimKeep(found);
      selected.delete(found.pk);
      added++;
    });
    users = users.filter((x) => !keep[x.pk]);
    saveKeep();
    saveTags();
    saveSel();
    renderList();
    toast(`Imported ${added} kept account${added === 1 ? "" : "s"}${missing ? `; ${missing} not found in your saved lists (scan first)` : ""}.`);
  }
  $("impKept").onclick = () => $("fileIn").click();
  $("fileIn").onchange = async () => {
    const f = $("fileIn").files[0];
    $("fileIn").value = "";
    if (f) importKept(await readText(f));
  };

  // ---------- statistics ----------
  function renderStats() {
    listEl.replaceChildren();
    rows.clear();
    const fing = scanCache && typeof scanCache.following === "number" ? scanCache.following : lists && lists.following ? lists.following.length : null;
    const fol = scanCache && typeof scanCache.followers === "number" ? scanCache.followers : lists && lists.followers ? lists.followers.length : null;
    const now = Date.now(), DAY = 864e5;
    const rate = lists && lists.followers && fing ? Math.round((mutual.length / fing) * 100) + "%" : "–";
    const unf7 = hist.filter((h) => now - h.at < 7 * DAY).length;
    const gained = flw.filter((e) => e.type === "new" && now - e.at < 30 * DAY).length;
    const lost = flw.filter((e) => e.type === "lost" && now - e.at < 30 * DAY).length;
    const cards = [
      [rate, "Follow-back rate", "of the accounts you follow"], [fmtN(fing), "Following", "accounts"],
      [fmtN(fol), "Followers", "accounts"], [lists && lists.followers ? fmtN(fans.length) : "–", "Fans", "follow you, you don't follow back"],
      [fmtN(hist.length), "Unfollowed", "all time"], [fmtN(unf7), "Unfollowed", "last 7 days"],
      [A.followerDiff ? fmtN(gained) : "–", "New followers", "last 30 days"], [A.followerDiff ? fmtN(lost) : "–", "Lost followers", "last 30 days"],
    ];
    const wrap = document.createElement("div");
    wrap.className = "stats2";
    const grid = document.createElement("div");
    grid.className = "cards";
    cards.forEach(([v, l, sub]) => {
      const d = document.createElement("div");
      d.className = "card2";
      const b = document.createElement("b"); b.textContent = v;
      const s1 = document.createElement("span"); s1.textContent = l;
      const s2 = document.createElement("small"); s2.textContent = sub;
      d.append(b, s1, s2);
      grid.append(d);
    });
    const title = document.createElement("div");
    title.className = "chart-title";
    title.textContent = "Unfollowed per day (last 14 days)";
    const bars = document.createElement("div");
    bars.className = "bars";
    const days = [];
    for (let k = 13; k >= 0; k--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - k); days.push(d); }
    const counts = days.map((d) => hist.filter((h) => { const x = new Date(h.at); x.setHours(0, 0, 0, 0); return x.getTime() === d.getTime(); }).length);
    const max = Math.max(1, ...counts);
    days.forEach((d, i) => {
      const col = document.createElement("div");
      col.className = "bcol";
      col.title = `${d.toLocaleDateString()}: ${counts[i]}`;
      const n = document.createElement("span"); n.className = "bn"; n.textContent = String(counts[i] || "");
      const bar = document.createElement("i"); bar.style.height = Math.max(counts[i] ? 4 : 2, (counts[i] / max) * 70) + "px";
      const lab = document.createElement("span"); lab.className = "bl"; lab.textContent = d.getDate();
      col.append(n, bar, lab);
      bars.append(col);
    });
    wrap.append(grid, title, bars);
    listEl.append(wrap);
  }


  // ---------- daily limit: reset / clear / change ----------
  async function openLimitDialog() {
    await refreshCap();
    const base = capInfo.base || capInfo.cap;
    const body = document.createElement("div");
    const info = document.createElement("div");
    info.textContent = tr("lim_info", { used: capInfo.used, cap: base, at: safety.dayResetTime, t: NFB.fmtHM(NFB.msToMidnight()) });
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center;margin-top:12px";
    const field = (label, input) => { const l = document.createElement("label"); l.textContent = label; l.style.color = "var(--fg)"; grid.append(l, input); return input; };
    const num = (v, min, max) => { const i = document.createElement("input"); i.type = "number"; i.min = min; i.max = max; i.value = v; i.className = "field snum"; return i; };
    const usedIn = field(tr("lim_used"), num(capInfo.used, 0, 1000));
    const capIn = field(tr("lim_title"), num(base, 1, 100));
    const atIn = field(tr("lim_reset_at"), Object.assign(document.createElement("input"), { type: "time", value: safety.dayResetTime || "00:00", className: "field" }));
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px";
    const resetBtn = document.createElement("button");
    resetBtn.type = "button"; resetBtn.className = "btn sm"; resetBtn.textContent = tr("btn_reset_counter");
    resetBtn.onclick = () => { usedIn.value = 0; };
    actions.append(resetBtn);
    if (coolUntil > Date.now()) {
      const coolBtn = document.createElement("button");
      coolBtn.type = "button"; coolBtn.className = "btn sm"; coolBtn.textContent = tr("btn_clear_cool");
      coolBtn.onclick = async () => { coolUntil = 0; await chrome.storage.local.remove(coolKey); coolBtn.remove(); toast(tr("ts_cool_cleared")); tick(); publishStatus(); };
      actions.append(coolBtn);
    }
    const note = document.createElement("div");
    note.style.cssText = "margin-top:12px;font-size:12px;color:var(--fg2)";
    note.textContent = tr("lim_note");
    body.append(info, grid, actions, note);
    const ok = await ask({ title: tr("lim_title"), body, confirmText: tr("btn_save"), cancelText: tr("btn_cancel") });
    if (!ok) return;
    await NFB.setUsed(dayKey, Math.min(1000, Math.max(0, parseInt(usedIn.value, 10) || 0)));
    await chrome.storage.local.set({ ["dailyCap_" + A.id]: Math.min(100, Math.max(1, parseInt(capIn.value, 10) || base)), dayResetTime: atIn.value || "00:00" });
    await refreshCap();
    toast(tr("ts_limit_saved"));
  }
  $("chipCap").onclick = openLimitDialog;

  // ---------- scan ----------
  if (!A.supportsStart) $("startwrap").style.display = "none";
  const getOpts = () => ({
    limit: parseInt($("lim").value, 10) || 0,
    start: A.supportsStart ? Math.max(0, (parseInt($("start").value, 10) || 1) - 1) : 0,
  });
  const saveOpts = () => chrome.storage.local.set({ nfb_opts: { lim: $("lim").value, start: $("start").value } });
  $("lim").onchange = saveOpts;
  $("start").onchange = saveOpts;

  async function refreshButtons() {
    const s = await NFB.getSettings();
    const allow = !!s[allowKey];
    scanBtn.disabled = scanning || unfollowing || !allow || !A.canScan(scanCache);
    $("lim").disabled = $("start").disabled = scanBtn.disabled;
    const label = A.scanLabel(scanCache);
    scanBtn.textContent = scanning ? tr("btn_scanning") : allow ? (label === "Scan" ? tr("btn_scan") : label) : tr("btn_locked");
    scanBtn.title = allow ? "" : tr("tip_locked");
  }
  setInterval(refreshButtons, 1500);

  const mergeLists = (cur, add) => {
    const out = { ...(cur || {}) };
    Object.keys(add || {}).forEach((k) => { if (add[k] !== undefined) out[k] = add[k]; });
    return out;
  };
  const slim = (u) => ({ pk: u.pk, username: u.username, full_name: u.full_name || "", pic: u.pic || "" });
  // Compares this scan's followers with the previous snapshot: who unfollowed you, who started following you.
  async function recordFollowerChanges(res) {
    const L = res.lists;
    if (!A.followerDiff || !L || !Array.isArray(L.followers)) return "";
    if (L.followersComplete === false) return " Your followers list looked incomplete, so follower changes weren't recorded this time.";
    const cur = L.followers.map(slim);
    const snap = (await chrome.storage.local.get<Record<string, any>>(snapKey))[snapKey];
    let msg = " Follower baseline saved: future scans will show who unfollowed you.";
    if (snap && snap.users && snap.users.length) {
      const curSet = new Set(cur.map((u) => u.pk)), oldSet = new Set(snap.users.map((u) => u.pk));
      const lostU = snap.users.filter((u) => !curSet.has(u.pk));
      const gainedU = cur.filter((u) => !oldSet.has(u.pk));
      const at = Date.now();
      flw = flw.concat(lostU.map((u) => ({ ...u, type: "lost", at })), gainedU.map((u) => ({ ...u, type: "new", at }))).slice(-2000);
      await chrome.storage.local.set({ [flwKey]: flw });
      msg = ` Since ${NFB.fmtWhen(snap.at)}: ${gainedU.length} new follower${gainedU.length === 1 ? "" : "s"}, ${lostU.length} unfollowed you.`;
      if (lostU.length) toast(`${lostU.length} ${lostU.length === 1 ? "person" : "people"} unfollowed you. See the Changes tab.`);
    }
    await chrome.storage.local.set({ [snapKey]: { at: Date.now(), users: cur } });
    return msg;
  }

  scanBtn.onclick = async () => {
    if (scanning || unfollowing) return;
    const s = await NFB.getSettings();
    if (!s[allowKey]) return;
    if (!A.canScan(scanCache)) return setStatus(A.cannotScanMessage(scanCache));
    const opts = getOpts();
    const ok = await ask({ title: tr("dlg_scan_title", { site: A.label }), body: A.scanConfirm(opts), confirmText: tr("btn_startscan"), cancelText: tr("btn_cancel") });
    if (!ok) return;

    scanning = true;
    refreshButtons();
    try {
      const res = await A.scan({ setStatus, prev: scanCache, opts });
      scanCache = res.scan;
      failed = {};
      chrome.storage.local.remove(failKey);
      lists = mergeLists(lists, res.lists);
      gone = new Set();
      await chrome.storage.local.set({
        [scanKey]: res.scan, [listsKey]: lists, [goneKey]: [],
        [metaKey]: { at: res.scan.at, text: NFB.describeScan(A.id, res.scan), username: res.scan.username || "" },
      });
      if (res.scan.username) $("acct").textContent = " · @" + res.scan.username;
      const diffMsg = await recordFollowerChanges(res);
      await updateSeen(res);
      if (res.complete) await chrome.storage.local.set({ [allowKey]: false });
      const all = res.scan.users || [];
      const recent = recentlyUnfollowed();
      users = all.filter((u) => !keep[u.pk] && !recent.has(u.pk));
      const lag = all.filter((u) => recent.has(u.pk) && !keep[u.pk]).length;
      const hidden = all.length - users.length - lag;
      const have = new Set(users.map((u) => u.pk));
      selected = new Set([...selected].filter((pk) => have.has(pk)));
      saveSel();
      derive();
      showTab("todo");
      setStatus(res.message + diffMsg + (hidden ? ` ${hidden} kept account(s) hidden.` : "") + (lag ? ` ${lag} account(s) you unfollowed recently are still in Instagram's list (it lags by a few minutes) and were hidden.` : ""));
    } catch (e) {
      setStatus("Error: " + e.message);
    }
    scanning = false;
    refreshButtons();
  };

  // ---------- selection (limited by the daily cap, skips protected accounts) ----------
  const todoFirst = () => { if (tab !== "todo") showTab("todo"); };
  const pickable = () => filtered.filter((u) => !protectReason(u));
  // Selects up to `want` accounts, never more than what is left of today's limit, and explains it when that is fewer than the limit.
  async function selectBulk(want) {
    todoFirst();
    await refreshCap();
    const pool = pickable();
    const skipped = filtered.length - pool.length;
    selected = new Set(pool.slice(0, Math.min(want, maxSel())).map((u) => u.pk));
    syncChecks();
    saveSel();
    updateChrome();
    const n = selected.size;
    if (n < Math.min(want, capInfo.cap)) toast(tr("ts_sel_info", { n, cap: capInfo.cap, used: capInfo.used, skipped, avail: pool.length }));
    else if (skipped > 0) toast(tr("ts_protected", { n: skipped }));
  }
  $("selN").onclick = () => selectBulk(Math.max(1, parseInt($("n").value, 10) || 30));
  $("all").onclick = () => selectBulk(Infinity);
  $("clr").onclick = () => { selected.clear(); syncChecks(); saveSel(); updateChrome(); };

  // ---------- progress card ----------
  let rcUser = null, hideT;
  function banner({ user, title, sub, pct, tone, spin }: any) {
    clearTimeout(hideT);
    $("runcard").style.display = "block";
    if (!rcUser || !user || rcUser.username !== user.username) {
      $("rcAv").replaceChildren(avatarEl(user));
      rcUser = user;
    }
    $("rcTitle").textContent = title;
    $("rcSub").textContent = sub || "";
    const p = Math.max(0, Math.min(100, pct || 0));
    $("rcFill").style.width = p + "%";
    $("rcBar").setAttribute("aria-valuenow", String(Math.round(p)));
    const b = $("rcBadge");
    b.className = "rc-badge " + (spin ? "spin" : tone || "");
    b.textContent = spin ? "" : tone === "ok" ? "✓" : tone === "warn" ? "!" : "";
  }
  function drawRun(run, mode, u?) {
    const pct = run.total ? (run.done / run.total) * 100 : 0;
    if (mode === "wait" && run.last) {
      const l = run.last;
      banner({
        user: l,
        title: tr(l.ok ? "rc_unfollowed" : "rc_couldnt", { u: l.username }),
        sub: tr("rc_sub_wait", { done: run.done, total: run.total, t: NFB.fmtClock((run.nextAt - Date.now()) / 1000), left: users.length.toLocaleString() }),
        pct, tone: l.ok ? "ok" : "warn",
      });
    } else if (mode === "open") {
      banner({ user: u, title: tr("rc_opening", { u: u.username }), sub: tr(run.retried ? "rc_retry" : "rc_sub_n", { i: run.idx + 1, total: run.queue.length }), pct, spin: true });
    } else {
      banner({ user: u, title: tr("rc_unfollowing", { u: u.username }), sub: tr(run.retried ? "rc_retry" : "rc_sub_n", { i: run.idx + 1, total: run.queue.length }), pct, spin: true });
    }
  }
  function finishBanner(msg, run, tone) {
    banner({
      user: run && run.last ? run.last : rcUser,
      title: msg,
      sub: run ? tr("rc_sub_end", { n: run.done, left: users.length.toLocaleString() }) : "",
      pct: run && run.total ? (run.done / run.total) * 100 : 0,
      tone,
    });
    stopBtn.style.display = "none";
    hideT = setTimeout(() => ($("runcard").style.display = "none"), 7000);
  }

  // ---------- unfollow (resumable: the browser-click method opens each profile in turn) ----------
  const OWNER = (() => {
    try {
      let o = sessionStorage.getItem("nfb_owner");
      if (!o) { o = Math.random().toString(36).slice(2); sessionStorage.setItem("nfb_owner", o); }
      return o;
    } catch { return "x"; }
  })();
  const STALE_MS = 5 * 60 * 1000;
  const loadRun = async () => (await chrome.storage.local.get<Record<string, any>>(runKey))[runKey] || null;
  const saveRun = (r) => { r.beat = Date.now(); return chrome.storage.local.set({ [runKey]: r }); };
  // only this loop writes the run; Stop uses its own key, so nothing can be overwritten
  const patchRun = async (patch) => {
    const r = await loadRun();
    if (!r) return null;
    Object.assign(r, patch);
    await saveRun(r);
    return r;
  };
  const endRun = () => chrome.storage.local.remove(runKey);
  const samePage = (url) => {
    try {
      const p = (x) => new URL(x, location.href).pathname.replace(/\/+$/, "").toLowerCase();
      return p(url) === p(location.href);
    } catch { return true; }
  };
  const sleepStop = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms && !stop) await NFB.sleep(Math.min(250, ms));
  };
  const setRunning = (on) => {
    unfollowing = on;
    if (on) { stopBtn.style.display = ""; stopBtn.disabled = false; delete stopBtn.dataset.state; stopBtn.textContent = tr("btn_stop"); }
    refreshButtons();
    updateChrome();
  };
  const doStop = async () => {
    if (schedPending) { schedPending.cancel = true; return; }
    stop = true;
    stopBtn.disabled = true;
    stopBtn.dataset.state = "stopping";
    stopBtn.textContent = tr("btn_stopping");
    await chrome.storage.local.set({ [stopKey]: Date.now() });
  };
  stopBtn.onclick = doStop;

  async function runLoop() {
    if (unfollowing) return;
    let run = await loadRun();
    if (!run || run.owner !== OWNER) return;
    stop = !!(await chrome.storage.local.get<Record<string, any>>(stopKey))[stopKey];
    setRunning(true);
    if (run.last && run.nextAt) drawRun(run, "wait");
    let endMsg = "", tone = "ok";

    try {
      while (true) {
        run = await loadRun();
        if (!run) { endMsg = "Batch ended"; tone = "warn"; break; }
        if (stop) { endMsg = tr("rc_stopped"); tone = "warn"; break; }
        if (run.idx >= run.queue.length) {
          const pending = run.retry || [];
          if (!run.retried && pending.length) {                 // second pass over the accounts that failed
            run = (await patchRun({ queue: pending, idx: 0, retry: [], retried: true })) || run;
            log(`Retrying ${pending.length} account(s) that failed`);
            continue;
          }
          endMsg = pending.length ? tr("rc_finished_f", { n: run.done, f: pending.length }) : tr("rc_finished", { n: run.done });
          if (pending.length) tone = "warn";
          break;
        }
        const s0 = await NFB.getSettings();
        const s = run.forceUI ? { ...s0, igMethod: "ui" } : s0;

        // wait out the delay since the previous unfollow (this also works across page loads)
        let ticks = 0;
        while (run.nextAt && Date.now() < run.nextAt && !stop) {
          runNextAt = run.nextAt;
          drawRun(run, "wait");
          await NFB.sleep(500);
          if (++ticks % 30 === 0) await patchRun({});
        }
        runNextAt = 0;
        if (stop) { endMsg = tr("rc_stopped"); tone = "warn"; break; }

        // active hours: wait until the window opens (the tab has to stay open)
        {
          let sNow = s0, t2 = 0;
          while (!NFB.inActiveHours(sNow) && !stop) {
            banner({
              user: run.last || rcUser,
              title: tr("rc_paused"),
              sub: tr("rc_resumes", { from: sNow.activeFrom, t: NFB.fmtHM(NFB.msToActiveStart(sNow)) }),
              pct: run.total ? (run.done / run.total) * 100 : 0,
              tone: "warn",
            });
            await NFB.sleep(1000);
            if (++t2 % 15 === 0) { await patchRun({}); sNow = await NFB.getSettings(); }
          }
        }
        if (stop) { endMsg = tr("rc_stopped"); tone = "warn"; break; }

        await refreshCap();
        if (maxSel() <= 0) { endMsg = tr("rc_cap", { n: capInfo.cap }); tone = "warn"; break; }

        const q = run.queue[run.idx];
        let u = { ...(users.find((x) => x.pk === q.pk) || {}), ...q };   // the queue entry may carry a newer username

        // Browser-click method: look the account up first. A renamed account is opened under its new name; a removed or
        // banned one is skipped at once instead of waiting for a profile page that will never load.
        if (A.resolve && A.navigateTo && A.navigateTo(u, s) && run.navFor !== run.idx) {
          let rr: any = {}, pre: any = null;
          try { rr = await A.resolve(u, s); } catch (e) { pre = e; }
          if (pre && pre.fatal) {
            endMsg = `Stopped: ${pre.message}`;
            tone = "warn";
            if (pre.block && s.cooldownHours > 0) {
              coolUntil = Date.now() + s.cooldownHours * 3600000;
              await chrome.storage.local.set({ [coolKey]: coolUntil });
              endMsg += ` Cool-down started: unfollowing is paused for ${s.cooldownHours}h.`;
            }
            break;
          }
          if (rr.gone) {
            await dropUnavailable(u);
            const moreAfter = run.idx + 1 < run.queue.length || (!run.retried && (run.retry || []).length > 0);
            run = (await patchRun({ idx: run.idx + 1, nextAt: moreAfter ? Date.now() + (NFB.skipDelay != null ? NFB.skipDelay : 1500) : 0 })) || run;
            continue;
          }
          if (rr.username && rr.username !== u.username) {
            log(`↻ ${u.username} is now @${rr.username}`, u.username);
            const queue = run.queue.slice();
            queue[run.idx] = { ...queue[run.idx], username: rr.username };
            run = (await patchRun({ queue })) || run;
            const real = users.find((x) => x.pk === u.pk);
            if (real) real.username = rr.username;
            u = { ...u, username: rr.username };
          }
        }

        // Browser-click method: go to the account's profile first (the page reloads and this loop resumes there).
        const target = A.navigateTo ? A.navigateTo(u, s) : null;
        if (target && !samePage(target) && run.navFor !== run.idx) {
          await patchRun({ navFor: run.idx });
          drawRun(run, "open", u);
          location.assign(target);
          return;
        }

        drawRun(run, "work", u);
        if (target) await sleepStop(NFB.rand(2000, 4000));
        if (stop) { endMsg = tr("rc_stopped"); tone = "warn"; break; }

        let ok = false, errMsg = "", fatal = false, blocked = false, skip = false;
        try {
          await withTimeout(A.unfollow(u, s), NFB.unfollowTimeout || 90000);   // never wait forever for one account
          ok = true;
          log(`✓ ${u.username} unfollowed`, u.username);
        } catch (e) {
          if (e.stopped) { endMsg = tr("rc_stopped"); tone = "warn"; break; }
          errMsg = e.message;
          log(`✗ ${u.username} — ${e.message}`, u.username);
          if (e.useUI && !run.forceUI) {
            await patchRun({ forceUI: true });
            log("Direct API was rejected: switching to browser clicks for the rest of this batch");
            continue; // retry this same account with the browser-click method
          }
          fatal = !!e.fatal;
          blocked = !!e.block;
          skip = !!e.skip;
        }

        const fails = ok ? 0 : skip ? (run.fails || 0) : (run.fails || 0) + 1;   // a missing account isn't a sign the batch is failing
        if (!ok && (fatal || fails >= 3)) {
          run = (await patchRun({ last: { username: u.username, pic: u.pic || "", ok: false } })) || run;
          endMsg = fatal ? `Stopped: ${errMsg}` : `Stopped after 3 failures in a row: ${errMsg}`;
          tone = "warn";
          if (blocked && s.cooldownHours > 0) {
            coolUntil = Date.now() + s.cooldownHours * 3600000;
            await chrome.storage.local.set({ [coolKey]: coolUntil });
            endMsg += ` Cool-down started: unfollowing is paused for ${s.cooldownHours}h.`;
          }
          break;
        }
        if (ok) {
          await NFB.bumpDaily(dayKey);
          users = users.filter((x) => x.pk !== u.pk);
          selected.delete(u.pk);
          gone.add(u.pk);
          hist.push({ pk: u.pk, username: u.username, full_name: u.full_name || "", pic: u.pic || "", at: Date.now() });
          if (hist.length > 5000) hist = hist.slice(-5000);
          derive();
          delete failed[u.pk];
          if (tab === "todo") removeFromList(u.pk);
          await chrome.storage.local.set({ [goneKey]: [...gone], [selKey]: [...selected], [histKey]: hist, [failKey]: failed });
          await refreshCap();
        } else if (skip) {
          await dropUnavailable(u);
        } else {
          failed[u.pk] = errMsg;                                // stays in the list, marked, and is tried once more after this pass
          await chrome.storage.local.set({ [failKey]: failed });
          if (tab === "todo") refreshRow(u);
        }
        const retry = !ok && !skip ? (run.retry || []).concat({ pk: u.pk, username: u.username, full_name: u.full_name || "", pic: u.pic || "" }) : run.retry || [];
        const nextIdx = run.idx + 1;
        const more = nextIdx < run.queue.length || (!run.retried && retry.length > 0);
        const nextAt = more ? Date.now() + Math.round(NFB.rand(s.minDelay, s.maxDelay)) * 1000 : 0;
        run = (await patchRun({
          idx: nextIdx, done: run.done + (ok ? 1 : 0), fails, nextAt, retry,
          last: { username: u.username, pic: u.pic || "", ok },
        })) || run;
      }
    } catch (e) {
      endMsg = "Error: " + e.message;
      tone = "warn";
      log(endMsg);
    }

    const finalRun = await loadRun();
    log(endMsg);
    await endRun();
    await chrome.storage.local.remove(stopKey);
    const byUser = endMsg === tr("rc_stopped");
    stop = false;
    runNextAt = 0;
    setRunning(false);
    finishBanner(endMsg, finalRun, tone);
    setStatus(endMsg);
    if (finalRun && !byUser && (finalRun.done > 0 || tone === "warn")) {
      notify(tone === "ok" ? tr("nf_finished") : tr("nf_stopped"), `${endMsg} (${finalRun.done}/${finalRun.total})`);
    }
  }

  async function beginBatch(chosen, auto) {
    await chrome.storage.local.remove(stopKey);
    stop = false;
    await saveRun({
      owner: OWNER,
      queue: chosen.map((u) => ({ pk: u.pk, username: u.username, full_name: u.full_name || "", pic: u.pic || "" })),
      idx: 0, done: 0, fails: 0, total: chosen.length, nextAt: 0, navFor: -1, forceUI: false, last: null,
    });
    log(`${auto ? "Starting scheduled batch" : "Starting batch"} of ${chosen.length}`);
    runLoop();
  }

  delBtn.onclick = async () => {
    if (unfollowing) return;
    await refreshCap();
    const chosen = users.filter((u) => selected.has(u.pk)).slice(0, maxSel());
    if (!chosen.length) return toast(maxSel() <= 0 ? capMsg() : tr("ts_pickfirst"));
    const s = await NFB.getSettings();
    if (coolUntil > Date.now()) {
      const endIt = await ask({
        title: tr("dlg_cool_title"),
        body: tr("dlg_cool_body", { t: NFB.fmtHM(coolUntil - Date.now()), site: A.label }),
        confirmText: tr("btn_endcool"),
        cancelText: tr("btn_keepwait"),
        danger: true,
      });
      if (!endIt) return;
      coolUntil = 0;
      await chrome.storage.local.remove(coolKey);
    }
    const browserMode = !!(A.navigateTo && A.navigateTo(chosen[0], s));

    const body = document.createElement("div");
    const p1 = document.createElement("div");
    p1.textContent = tr("dlg_unf_body", { min: s.minDelay, max: s.maxDelay, used: capInfo.used, cap: capInfo.cap });
    const stack = document.createElement("div");
    stack.className = "mstack";
    chosen.slice(0, 6).forEach((u) => stack.append(avatarEl(u)));
    if (chosen.length > 6) {
      const more = document.createElement("div");
      more.className = "more";
      more.textContent = "+" + (chosen.length - 6);
      stack.append(more);
    }
    body.append(p1, stack);
    if (browserMode) {
      const p2 = document.createElement("div");
      p2.style.marginTop = "8px";
      p2.textContent = tr("dlg_unf_browser");
      body.append(p2);
    }
    if (!NFB.inActiveHours(s)) {
      const p3 = document.createElement("div");
      p3.style.marginTop = "8px";
      p3.textContent = tr("dlg_unf_hours", { from: s.activeFrom });
      body.append(p3);
    }
    const ok = await ask({ title: tr("dlg_unf_title", { n: chosen.length }), body, confirmText: tr("btn_unfollow_n", { n: chosen.length }), cancelText: tr("btn_cancel"), danger: true });
    if (!ok) return;
    beginBatch(chosen, false);
  };

  // ---------- daily schedule (needs an open Instagram tab; shows a cancellable countdown first) ----------
  async function schedCheck() {
    if (!enabled || !A.canSchedule || unfollowing || scanning || schedPending || !safety.scheduleEnabled) return;
    const now = new Date();
    const [h, m] = String(safety.scheduleTime || "10:00").split(":").map(Number);
    const late = now.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0).getTime();
    if (late < 0 || late > 3 * 3600000) return;                       // only within 3 hours after the set time
    if ((await chrome.storage.local.get<Record<string, any>>(schedKey))[schedKey] === NFB.today()) return;
    if (coolUntil > Date.now() || !NFB.inActiveHours(safety) || maxSel() <= 0 || !users.length) return;
    const pool = users.filter((u) => !protectReason(u)).slice(0, Math.min(safety.scheduleCount || 20, maxSel()));
    if (!pool.length) return;
    await chrome.storage.local.set({ [schedKey]: NFB.today() });       // at most one automatic batch per day
    schedPending = { cancel: false };
    stopBtn.style.display = "";
    stopBtn.disabled = false;
    stopBtn.textContent = tr("btn_cancel");
    for (let sec = 20; sec > 0 && !schedPending.cancel; sec--) {
      banner({ user: null, title: tr("sc_title", { s: sec }), sub: tr("sc_sub", { n: pool.length }), pct: ((20 - sec) / 20) * 100, tone: "warn" });
      await NFB.sleep(1000);
    }
    const cancelled = schedPending.cancel;
    schedPending = null;
    stopBtn.textContent = tr("btn_stop");
    if (cancelled) {
      $("runcard").style.display = "none";
      stopBtn.style.display = "";
      toast(tr("sc_cancelled"));
      return;
    }
    notify("Unfollow Guard · " + A.label, tr("sc_sub", { n: pool.length }));
    beginBatch(pool, true);
  }
  setInterval(schedCheck, 30000);
  NFB.schedCheck = schedCheck; // exposed for the automated tests


  // ---------- welcome tour ----------
  async function showTour() {
    for (let i = 1; i <= 5; i++) {
      const last = i === 5;
      const ok = await ask({ title: tr(`tour_${i}_t`), body: tr(`tour_${i}_b`), confirmText: tr(last ? "btn_done" : "btn_next"), cancelText: tr("btn_skip"), hideCancel: last });
      if (!ok) break;
    }
    onboarded = true;
    chrome.storage.local.set({ nfb_onboarded: true });
  }
  const maybeTour = () => { if (!onboarded) { onboarded = true; showTour(); } };

  // ---------- self-check + debug report ----------
  const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(16); };
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
    return ok;
  }
  function buildReport(checkLines) {
    const man: any = (chrome.runtime && chrome.runtime.getManifest && chrome.runtime.getManifest()) || {};
    const keys = ["igMethod", "cooldownHours", "activeEnabled", "activeFrom", "activeTo", "protectVerified", "protectPrivate", "protectTagged", "protectPattern",
      "protectRecentDays", "warmupEnabled", "warmupStart", "warmupStep", "scheduleEnabled", "scheduleTime", "scheduleCount", "minDelay", "maxDelay", "lang", "theme"];
    const maskedLog = logEntries.slice(-40).map((e) => `${new Date(e.at).toISOString()}  ${e.name ? e.text.split(e.name).join("@user") : e.text}`);
    return [
      "Unfollow Guard debug report",
      `Version: ${man.version || "?"}`,
      `Site: ${A.id} (account ${hash(ACCT)})  Host: ${location.hostname}`,
      `Browser: ${navigator.userAgent}`,
      `Language: ${NFB.lang}`,
      `Settings: ${keys.map((k) => `${k}=${safety[k]}`).join(", ")}`,
      `Counts: toUnfollow=${users.length}, kept=${Object.keys(keep).length}, history=${hist.length}, followers=${lists && lists.followers ? lists.followers.length : "-"}, following=${lists && lists.following ? lists.following.length : "-"}, changes=${flw.length}`,
      `Today: ${capInfo.used}/${capInfo.cap}${capInfo.warm ? " (warm-up)" : ""}; cool-down=${coolUntil > Date.now() ? NFB.fmtHM(coolUntil - Date.now()) : "no"}; running=${unfollowing}`,
      "",
      "Self-check:",
      ...(checkLines || ["(not run)"]),
      "",
      "Last log lines (usernames hidden):",
      ...maskedLog,
      "",
      "No cookies, tokens or usernames are included in this report.",
    ].join("\n");
  }
  async function selfCheck() {
    let res;
    try { res = A.diagnose ? await A.diagnose(safety) : []; } catch (e) { res = [{ ok: false, name: "Self-check", detail: e.message }]; }
    try { res = res.concat(await picCheck()); } catch {}
    const lines = res.map((r) => `${r.ok === true ? "✓" : r.ok === false ? "✗" : "•"} ${r.name}${r.detail ? " — " + r.detail : ""}`);
    const body = document.createElement("pre");
    body.style.cssText = "white-space:pre-wrap;font:12px/1.55 ui-monospace,Menlo,Consolas,monospace;margin:0;max-height:280px;overflow:auto;color:var(--fg)";
    body.textContent = lines.join("\n") || "–";
    const copy = await ask({ title: tr("btn_selfcheck"), body, confirmText: tr("btn_copydebug"), cancelText: tr("tt_close") });
    if (copy) toast(tr((await copyText(buildReport(lines))) ? "ts_copied" : "ts_nothing"));
    return res;
  }
  $("diagBtn").onclick = selfCheck;
  $("dbgBtn").onclick = async () => toast(tr((await copyText(buildReport(null))) ? "ts_copied" : "ts_nothing"));

  // ---------- keyboard ----------
  panel.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || shadow.querySelector(".overlay")) return;
    if (e.key === "Escape") { panel.style.display = "none"; return; }
    const tg = (shadow.activeElement && shadow.activeElement.tagName) || "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tg)) return;
    if (e.key === "/") { e.preventDefault(); $("q").focus(); }
    else if (e.key === "]" || e.key === "[") {
      const ids = TABS.map((x) => x.id);
      showTab(ids[(ids.indexOf(tab) + (e.key === "]" ? 1 : ids.length - 1)) % ids.length]);
    } else if (e.key === "?") showTour();
  });
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === "toggle-panel" && enabled) togglePanel(); });
  }

  // ---------- enable / disable ----------
  function applyEnabled(on) {
    enabled = on;
    host.style.display = on ? "" : "none";
    if (!on) {
      panel.style.display = "none";
      if (unfollowing) doStop();
    }
  }

  chrome.storage.onChanged.addListener((ch) => {
    if (ch.enabled) applyEnabled(!!ch.enabled.newValue);
    if (ch.theme) showTheme(ch.theme.newValue);
    if (ch.lang) { NFB.setLang(ch.lang.newValue); applyLang(); showTheme(theme); refreshGear(); refreshButtons(); renderList(); }
    if (ch.position || ch.draggable || ch["fabPos_" + A.id]) loadCfg();
    if (ch["dailyCap_" + A.id] || ch["nfb_daily_" + dayKey] || ch["nfb_days_" + dayKey] || ch.cooldownHours || ch.activeEnabled || ch.activeFrom || ch.activeTo ||
        ch.warmupEnabled || ch.warmupStart || ch.warmupStep || ch.scheduleEnabled || ch.scheduleTime || ch.scheduleCount || ch.dayResetTime) refreshCap();
    if (ch.protectVerified || ch.protectRecentDays || ch.protectPrivate || ch.protectTagged || ch.protectPattern) {
      refreshCap().then(() => { if (tab === "todo") renderList(); });
    }
    if (ch[coolKey]) coolUntil = Number(ch[coolKey].newValue) || 0;
    if (ch[scanKey]) scanCache = ch[scanKey].newValue || null;
    if (ch[scanKey] || ch[allowKey]) refreshButtons();
    if (ch[stopKey] && ch[stopKey].newValue) stop = true;
  });

  // ---------- init ----------
  (async () => {
    await NFB.migrate();
    await NFB.migrateAccount(A.id, ACCT);
    const s = await NFB.getSettings();
    NFB.setLang(s.lang);
    applyLang();
    showTheme(s.theme);
    refreshGear();
    applyEnabled(!!s.enabled);
    await loadCfg();
    await NFB.bindSettings(shadow, modalHost);
    const o = await chrome.storage.local.get<Record<string, any>>([scanKey, listsKey, keepKey, selKey, goneKey, histKey, snapKey, flwKey, coolKey, seenKey, tagsKey, picsKey, failKey, "nfb_opts", "nfb_onboarded"]);
    scanCache = o[scanKey] || null;
    lists = o[listsKey] || null;
    keep = o[keepKey] || {};
    gone = new Set(o[goneKey] || []);
    hist = o[histKey] || [];
    flw = o[flwKey] || [];
    seen = o[seenKey] || seen;
    tags = o[tagsKey] || {};
    failed = o[failKey] || {};
    picFresh = o[picsKey] || {};
    onboarded = !!o.nfb_onboarded;
    coolUntil = o[coolKey] || 0;
    if (scanCache && scanCache.username) $("acct").textContent = " · @" + scanCache.username;
    // first run with this version: use the saved followers list as the baseline for "who unfollowed me"
    if (A.followerDiff && !o[snapKey] && lists && Array.isArray(lists.followers) && lists.followersComplete !== false) {
      await chrome.storage.local.set({ [snapKey]: { at: (scanCache && scanCache.at) || Date.now(), users: lists.followers.map(slim) } });
    }
    const recentGone = recentlyUnfollowed();
    users = ((scanCache && scanCache.users) || []).filter((u) => !keep[u.pk] && !gone.has(u.pk) && !recentGone.has(u.pk));
    const have = new Set(users.map((u) => u.pk));
    selected = new Set((o[selKey] || []).filter((pk) => have.has(pk)));
    if (o.nfb_opts) { $("lim").value = o.nfb_opts.lim; $("start").value = o.nfb_opts.start; }
    derive();
    await refreshCap();
    renderList();
    if (users.length) setStatus(tr("nt_saved", { n: users.length.toLocaleString(), s: selected.size }));
    else setStatus(tr(A.id === "facebook" ? "nt_hint_fb" : "nt_hint_ig"));
    refreshButtons();

    // A batch started in this tab keeps going after the page reloads (browser-click method).
    const run = await loadRun();
    if (run) {
      const fresh = Date.now() - run.beat < STALE_MS;
      if (run.owner === OWNER && fresh && enabled) runLoop();
      else if (!fresh || (run.owner === OWNER && !enabled)) await endRun(); // abandoned batch
    }
  })();
})();
