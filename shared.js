// Shared helpers: settings, storage, dialogs and the styles/forms used by the toolbar popup and the in-page panel.
// NOTE: the `NFB` namespace and all `nfb_*` storage keys / element ids are the
// legacy "Non-Followers" identifiers kept DELIBERATELY. Renaming them orphans
// every existing user's saved scans, keep lists and history. Only user-visible
// strings use the "Unfollow Guard" name.
(() => {
  const NFB = (globalThis.NFB = globalThis.NFB || {});
  NFB.adapters = NFB.adapters || {};
  NFB.PLATFORMS = [
    { id: "instagram", label: "Instagram" },
    { id: "facebook", label: "Facebook", beta: true },
  ];
  NFB.LANGS = [["auto", "Automatic"], ["en", "English"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["pt", "Português"]];
  NFB.DEFAULTS = {
    enabled: true,
    allowScan_instagram: true,
    allowScan_facebook: true,
    dailyCap_instagram: 40,
    dailyCap_facebook: 20,
    minDelay: 20,
    maxDelay: 60,
    theme: "system",
    position: "bottom-right",
    draggable: true,
    igMethod: "api",
    cooldownHours: 6,
    dayResetTime: "00:00",
    activeEnabled: false,
    activeFrom: "09:00",
    activeTo: "22:00",
    protectVerified: false,
    protectRecentDays: 0,
    warmupEnabled: false,
    warmupStart: 10,
    warmupStep: 5,
    labelFollowing: "",
    labelUnfollow: "",
    lang: "auto",
    notifyEnabled: true,
    scheduleEnabled: false,
    scheduleTime: "10:00",
    scheduleCount: 20,
    protectPrivate: false,
    protectPattern: "",
    protectTagged: true,
  };
  NFB.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  NFB.rand = (a, b) => a + Math.random() * (b - a);
  // The daily counter starts over at `dayResetTime` (setting, default midnight). NFB.resetMin is that time in minutes.
  NFB.resetMin = 0;
  NFB.today = () => new Date(Date.now() - NFB.resetMin * 60000).toLocaleDateString("en-CA");
  NFB.msToMidnight = () => { // time until the next reset (the name is historical)
    const n = new Date();
    const t = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, NFB.resetMin, 0, 0).getTime();
    return (t > n.getTime() ? t : t + 86400000) - n.getTime();
  };
  NFB.fmtClock = (sec) => {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  };
  NFB.fmtHM = (ms) => {
    const m = Math.max(1, Math.ceil(ms / 60000));
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  };
  NFB.fmtWhen = (t) => {
    const d = new Date(t), now = new Date();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === now.toDateString() ? `Today ${time}` : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
  };

  // Active hours (local time). A window like 22:00–06:00 that crosses midnight is supported.
  const toMin = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  NFB.inActiveHours = (s, d = new Date()) => {
    if (!s.activeEnabled) return true;
    const n = d.getHours() * 60 + d.getMinutes(), a = toMin(s.activeFrom), b = toMin(s.activeTo);
    if (a === b) return true;
    return a < b ? n >= a && n < b : n >= a || n < b;
  };
  NFB.msToActiveStart = (s, d = new Date()) => {
    const n = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    let diff = toMin(s.activeFrom) - n;
    if (diff <= 0) diff += 1440;
    return diff * 60000;
  };

  NFB.getSettings = async () => {
    const s = { ...NFB.DEFAULTS, ...(await chrome.storage.local.get(Object.keys(NFB.DEFAULTS))) };
    NFB.resetMin = toMin(s.dayResetTime);
    return s;
  };

  NFB.getDaily = async (p) => {
    const o = await chrome.storage.local.get("nfb_daily_" + p);
    const d = o["nfb_daily_" + p];
    return d && d.date === NFB.today() ? d : { date: NFB.today(), count: 0 };
  };
  // Sets today's counter to an exact number (used by "reset counter" in the panel).
  NFB.setUsed = async (p, n) => {
    await chrome.storage.local.set({ ["nfb_daily_" + p]: { date: NFB.today(), count: Math.max(0, n | 0) } });
  };
  NFB.bumpDaily = async (p) => {
    const d = await NFB.getDaily(p);
    d.count++;
    await chrome.storage.local.set({ ["nfb_daily_" + p]: d });
    // number of different days with at least one unfollow (used by warm-up mode)
    const dk = "nfb_days_" + p;
    const days = (await chrome.storage.local.get(dk))[dk] || { n: 0, last: "" };
    if (days.last !== NFB.today()) { days.n++; days.last = NFB.today(); await chrome.storage.local.set({ [dk]: days }); }
    return d.count;
  };
  // Daily limit after warm-up: starts low and grows by `warmupStep` for every earlier day you used it.
  NFB.effectiveCap = async (p, s, base) => {
    if (!s.warmupEnabled) return { cap: base, warm: null };
    const dk = "nfb_days_" + p;
    const days = (await chrome.storage.local.get(dk))[dk] || { n: 0, last: "" };
    const before = Math.max(0, days.n - (days.last === NFB.today() ? 1 : 0));
    const warm = Math.max(1, s.warmupStart + s.warmupStep * before);
    return { cap: Math.min(base, warm), warm };
  };

  // Moves data saved by older versions to the current keys.
  NFB.migrate = async () => {
    const flag = await chrome.storage.local.get("igMethodV2");
    if (!flag.igMethodV2) await chrome.storage.local.set({ igMethod: "api", igMethodV2: true });
    const o = await chrome.storage.local.get(["nfb_scan", "nfb_scan_instagram", "allowScan", "dailyCap", "nfb_daily"]);
    const upd = {};
    if (o.nfb_scan && !o.nfb_scan_instagram) upd.nfb_scan_instagram = o.nfb_scan;
    if (o.allowScan !== undefined) upd.allowScan_instagram = o.allowScan;
    if (o.dailyCap !== undefined) upd.dailyCap_instagram = o.dailyCap;
    if (o.nfb_daily) upd.nfb_daily_instagram = o.nfb_daily;
    if (Object.keys(upd).length) {
      await chrome.storage.local.set(upd);
      await chrome.storage.local.remove(["nfb_scan", "allowScan", "dailyCap", "nfb_daily"]);
    }
  };

  // Data is stored per logged-in account (nfb_<name>_<site>_<accountId>). Data saved by older versions
  // (no account id) is adopted by the first account that opens the site.
  NFB.migrateAccount = async (p, acct) => {
    const names = ["scan", "lists", "keep", "sel", "gone", "hist"];
    const oldKeys = names.map((n) => `nfb_${n}_${p}`).concat([`nfb_daily_${p}`]);
    const newKeys = names.map((n) => `nfb_${n}_${p}_${acct}`);
    const o = await chrome.storage.local.get(oldKeys.concat(newKeys));
    const set = {}, rm = [];
    names.forEach((n) => {
      const ok = `nfb_${n}_${p}`, nk = `nfb_${n}_${p}_${acct}`;
      if (o[ok] !== undefined) { if (o[nk] === undefined) set[nk] = o[ok]; rm.push(ok); }
    });
    if (o[`nfb_daily_${p}`] !== undefined) { set[`nfb_daily_${p}_${acct}`] = o[`nfb_daily_${p}`]; rm.push(`nfb_daily_${p}`); }
    if (Object.keys(set).length) await chrome.storage.local.set(set);
    if (rm.length) await chrome.storage.local.remove(rm);
    const idx = (await chrome.storage.local.get("nfb_accounts")).nfb_accounts || {};
    const list = idx[p] || [];
    if (!list.includes(acct)) { list.push(acct); idx[p] = list; await chrome.storage.local.set({ nfb_accounts: idx }); }
    const sc = set[`nfb_scan_${p}_${acct}`] || o[`nfb_scan_${p}_${acct}`];
    if (sc) await chrome.storage.local.set({ [`nfb_meta_${p}_${acct}`]: { at: sc.at, text: NFB.describeScan(p, sc), username: sc.username || "" } });
  };

  NFB.describeScan = (p, sc) => {
    const n = (sc.users || []).length;
    if (p === "facebook") {
      const f1 = sc.followersList ? sc.followersList.length : "not collected";
      const f2 = sc.followingList ? sc.followingList.length : "not collected";
      return `Followers list: ${f1} · Following list: ${f2} · ${n} non-followers`;
    }
    const chk = sc.range ? `checked #${sc.range.from}–${sc.range.to} of ${sc.following}` : `following ${sc.following}`;
    return `Scanned ${new Date(sc.at).toLocaleDateString()} · ${chk}, followers ${sc.followers ?? "?"} · ${n} non-followers`;
  };

  // ---------- styles ----------
  const DARK = `--bg:#17191c; --bg2:#1f2226; --fg:#eceff3; --fg2:#9aa4af; --border:#2b2f34; --border2:#3d434a;
    --input-bg:#22262b; --hover:#252a30; --dis-bg:#2b2f34; --dis-fg:#6f7882; --dis-border:#343a40;
    --green:#4cd07d; --red:#ff6b6b; --av-bg:#2b2f34; --accent:#1ea1f7; --accent-soft:#0f2a40;
    --ok-soft:#13291c; --danger:#f0457a; --danger-soft:#3a1622; --warn-soft:#3a2d12;`;
  NFB.themeCSS = `
    .app { --bg:#fff; --bg2:#f5f6f8; --fg:#14171a; --fg2:#5b6570; --border:#e6e8eb; --border2:#cfd4da;
           --input-bg:#fff; --hover:#f3f6fa; --dis-bg:#eceef1; --dis-fg:#8b95a0; --dis-border:#e1e4e8;
           --green:#14803c; --red:#d92d20; --av-bg:#e3e6ea; --accent:#0095f6; --accent-soft:#e6f3fe;
           --ok-soft:#e6f6ec; --danger:#e0245e; --danger-soft:#fde8ef; --warn-soft:#fff4dc; }
    .app[data-theme="dark"] { ${DARK} }
    @media (prefers-color-scheme: dark) { .app[data-theme="system"] { ${DARK} } }
  `;

  NFB.uiCSS = `
    .btn { height: 34px; padding: 0 14px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer;
           border: 1px solid var(--border2); background: var(--bg); color: var(--fg);
           display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; }
    .btn:hover:not(:disabled) { background: var(--hover); }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn.danger { background: var(--danger); border-color: var(--danger); color: #fff; }
    .btn.primary:hover:not(:disabled), .btn.danger:hover:not(:disabled) { filter: brightness(1.08); }
    .btn.sm { height: 28px; padding: 0 10px; font-size: 12px; border-radius: 8px; }
    .btn:disabled { background: var(--dis-bg); border-color: var(--dis-border); color: var(--dis-fg); cursor: not-allowed; }
    .btn:focus-visible, .tab:focus-visible, .iconbtn:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .field { height: 34px; padding: 0 10px; font-size: 13px; color: var(--fg); background: var(--input-bg);
             border: 1px solid var(--border2); border-radius: 10px; }
    input.sw { appearance: none; -webkit-appearance: none; width: 40px; height: 24px; border-radius: 12px; background: var(--border2);
               position: relative; cursor: pointer; flex: none; margin: 0; transition: background .15s; }
    input.sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
                      background: #fff; transition: left .15s; box-shadow: 0 1px 3px rgba(0,0,0,.35); }
    input.sw:checked { background: var(--accent); }
    input.sw:checked::after { left: 19px; }
    .badge { font-size: 10px; font-weight: 800; letter-spacing: .05em; padding: 2px 6px; border-radius: 6px; background: #f59e0b; color: #fff; vertical-align: middle; }
    .overlay { position: fixed; inset: 0; background: rgba(8,10,14,.55); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
    .modal { width: min(400px, 100%); background: var(--bg); color: var(--fg); border: 1px solid var(--border);
             border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,.5); padding: 20px; }
    .modal h3 { margin: 0 0 8px; font-size: 17px; font-weight: 700; color: var(--fg); }
    .mbody { font-size: 13px; color: var(--fg2); line-height: 1.55; }
    .mactions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
    .mstack { display: flex; margin: 12px 0 2px; }
    .mstack .av { width: 34px; height: 34px; border: 2px solid var(--bg); margin-left: -8px; }
    .mstack .av:first-child { margin-left: 0; }
    .mstack .more { width: 34px; height: 34px; border-radius: 50%; margin-left: -8px; border: 2px solid var(--bg); background: var(--bg2);
                    color: var(--fg2); font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  `;

  NFB.settingsCSS = `
    .sblock { border: 1px solid var(--border); border-radius: 14px; padding: 4px 14px; margin-bottom: 12px; background: var(--bg); color: var(--fg); }
    .stitle { font-weight: 700; font-size: 13px; padding: 12px 0 4px; color: var(--fg); display: flex; align-items: center; gap: 8px; }
    .srow { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0;
            border-top: 1px solid var(--border); color: var(--fg); font-size: 13px; }
    .stitle + .srow { border-top: 0; }
    .stext { min-width: 0; }
    .stext b { font-weight: 600; }
    .hint { color: var(--fg2); font-size: 12px; margin-top: 3px; line-height: 1.4; font-weight: 400; }
    .snum { width: 64px; text-align: center; }
    .ltext { width: 170px; }
    .ssel { max-width: 190px; }
    .sbtn { height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--red); background: var(--bg); color: var(--red);
            font-size: 12px; font-weight: 600; cursor: pointer; flex: none; }
    .sbtn.plain { border-color: var(--border2); color: var(--fg); }
    .ssaved { color: var(--green); font-size: 13px; min-height: 18px; text-align: center; }
  `;

  // ---------- dialog (replaces the browser's alert/confirm) ----------
  let dlgId = 0;
  NFB.dialog = (container, o) =>
    new Promise((resolve) => {
      const root = container.getRootNode ? container.getRootNode() : document;
      const prev = root.activeElement || document.activeElement;
      const ov = document.createElement("div");
      ov.className = "overlay";
      const m = document.createElement("div");
      m.className = "modal";
      m.setAttribute("role", "dialog");
      m.setAttribute("aria-modal", "true");
      const h = document.createElement("h3");
      h.id = "nfb-dlg-" + ++dlgId;
      m.setAttribute("aria-labelledby", h.id);
      h.textContent = o.title || "";
      const b = document.createElement("div");
      b.className = "mbody";
      if (o.body instanceof Node) b.append(o.body);
      else b.textContent = o.body || "";
      const act = document.createElement("div");
      act.className = "mactions";
      const done = (v) => {
        ov.remove();
        try { if (prev && prev.focus) prev.focus(); } catch {}
        resolve(v);
      };
      if (!o.hideCancel) {
        const c = document.createElement("button");
        c.className = "btn";
        c.textContent = o.cancelText || "Cancel";
        c.onclick = () => done(false);
        act.append(c);
      }
      const ok = document.createElement("button");
      ok.className = "btn " + (o.danger ? "danger" : "primary");
      ok.textContent = o.confirmText || "OK";
      ok.onclick = () => done(true);
      act.append(ok);
      m.append(h, b, act);
      ov.append(m);
      ov.addEventListener("mousedown", (e) => { if (e.target === ov && !o.hideCancel) done(false); });
      ov.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape" && !o.hideCancel) { done(false); return; }
        if (e.key === "Enter" && !/^(BUTTON|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); done(true); return; }
        if (e.key === "Tab") {                                   // keep keyboard focus inside the dialog
          const f = [...m.querySelectorAll("button, input, select, textarea, a[href]")].filter((x) => !x.disabled);
          if (!f.length) return;
          const cur = root.activeElement || document.activeElement;
          if (e.shiftKey && cur === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && cur === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      });
      container.append(ov);
      const first = o.focusFirst ? m.querySelector("input, select, textarea") : null;
      (first || ok).focus();
    });

  // ---------- settings form ----------
  const row = (title, hint, control) =>
    `<div class="srow"><div class="stext"><b>${title}</b>${hint ? `<div class="hint">${hint}</div>` : ""}</div>${control}</div>`;
  const sw = (id) => `<input type="checkbox" class="sw" id="${id}">`;

  const general = `
    <div class="sblock">
      <div class="stitle">General</div>
      ${row("Enable extension", "Turn off to hide the floating button on every site.", sw("enabled"))}
      ${row("Notifications", "Show a desktop notification when a batch finishes, stops or is blocked.", sw("notifyEnabled"))}
    </div>`;
  const appearance = `
    <div class="sblock">
      <div class="stitle">Appearance</div>
      ${row("Theme", "System follows your device's light/dark setting.",
        `<select class="field ssel" id="theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>`)}
      ${row("Language", "Language of the panel. Settings and technical messages stay in English.",
        `<select class="field ssel" id="lang">${NFB.LANGS ? NFB.LANGS.map((l) => `<option value="${l[0]}">${l[1]}</option>`).join("") : '<option value="auto">Automatic</option>'}</select>`)}
      ${row("Button position", "Used when dragging is off, or after a reset.",
        `<select class="field ssel" id="position"><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-right">Top right</option><option value="top-left">Top left</option></select>`)}
      ${row("Allow dragging", "Drag the button anywhere. Its spot is remembered per site.", sw("draggable"))}
      ${row("Reset dragged position", "Puts the button back at the position above.", `<button class="sbtn plain" id="resetPos">Reset</button>`)}
    </div>`;
  const method = `
    <div class="sblock">
      <div class="stitle">Instagram unfollow method</div>
      ${row("Method", "Direct API sends the same request Instagram's own page sends and switches to Browser clicks if it is rejected. Browser clicks opens each profile and clicks Following → Unfollow (Instagram must be set to English).",
        `<select class="field ssel" id="igMethod"><option value="api">Direct API</option><option value="ui">Browser clicks</option></select>`)}
    </div>`;
  const platform = (p) => `
    <div class="sblock">
      <div class="stitle">${p.label}${p.beta ? ' <span class="badge" title="Not fully tested yet">BETA</span>' : ""}</div>
      ${p.beta ? `<div class="hint" style="margin:0 0 6px">Facebook support is a beta feature and has not been tested much. Expect rough edges.</div>` : ""}
      ${row("Allow scanning", "Locks itself after a successful scan. Turn it on only when you really want to fetch again.", sw("allowScan_" + p.id))}
      ${row("Daily unfollow cap", "1–100 per day", `<input class="field snum" type="number" id="dailyCap_${p.id}" min="1" max="100">`)}
      ${row("Saved scan", `<span id="info_${p.id}" style="white-space:pre-line">No saved scan.</span>`, `<button class="sbtn" id="clear_${p.id}">Clear</button>`)}
    </div>`;
  const safety = `
    <div class="sblock">
      <div class="stitle">Safety</div>
      ${row("Cool-down after a block", "If Instagram or Facebook blocks or rate-limits an action, unfollowing pauses for this many hours (0 = off).",
        `<input class="field snum" type="number" id="cooldownHours" min="0" max="72">`)}
      ${row("Daily counter resets at", "When today's unfollow counter starts over (your local time). It only changes this extension's counter; Instagram applies its own limits.",
        `<input class="field" type="time" id="dayResetTime">`)}
      ${row("Only unfollow during active hours", "A batch waits until the window opens (your local time). The tab has to stay open.", sw("activeEnabled"))}
      ${row("Active hours", "From and to",
        `<div style="display:flex;gap:6px;align-items:center"><input class="field" type="time" id="activeFrom"> – <input class="field" type="time" id="activeTo"></div>`)}
    </div>`;
  const schedule = `
    <div class="sblock">
      <div class="stitle">Daily schedule</div>
      ${row("Run a batch automatically", "Once a day, at the time below, if an Instagram tab is open. It shows a 20-second countdown you can cancel, respects every safety setting, and only uses accounts that aren't protected.", sw("scheduleEnabled"))}
      ${row("Time and size", "Start time (24 h) and how many accounts",
        `<div style="display:flex;gap:6px;align-items:center"><input class="field" type="time" id="scheduleTime"> <input class="field snum" type="number" id="scheduleCount" min="1" max="100"></div>`)}
    </div>`;
  const filters = `
    <div class="sblock">
      <div class="stitle">Protection</div>
      ${row("Protect verified accounts", "Select first / Select all skip verified accounts. You can still tick them by hand.", sw("protectVerified"))}
      ${row("Protect private accounts", "Select first / Select all skip private accounts.", sw("protectPrivate"))}
      ${row("Protect labelled accounts", "Accounts you gave a label (Friend, Client, …) are skipped by bulk selection.", sw("protectTagged"))}
      ${row("Protect usernames matching", "Comma-separated patterns; * matches anything, e.g. *_official, shop*", `<input class="field ltext" type="text" id="protectPattern" placeholder="*_official, shop*">`)}
      ${row("Protect recently followed", "Bulk selection skips accounts you started following in the last N days (0 = off). Instagram doesn't share follow dates, so this counts from when the extension first saw them after your first complete scan.",
        `<input class="field snum" type="number" id="protectRecentDays" min="0" max="365">`)}
      ${row("Warm-up mode", "Start with a small daily limit and raise it every day you use the extension, up to your daily cap.", sw("warmupEnabled"))}
      ${row("Warm-up: start / add per day", "Day 1 limit, then how many are added each day.",
        `<div style="display:flex;gap:6px;align-items:center"><input class="field snum" type="number" id="warmupStart" min="1" max="100"> + <input class="field snum" type="number" id="warmupStep" min="1" max="50"></div>`)}
    </div>`;
  const labels = `
    <div class="sblock">
      <div class="stitle">Browser clicks · other languages</div>
      <div class="hint" style="margin:0 0 4px">Common languages are built in. If the Following or Unfollow button isn't found, type the words your Instagram uses (comma-separated).</div>
      ${row("“Following” button label", "", `<input class="field ltext" type="text" id="labelFollowing" placeholder="e.g. Siguiendo">`)}
      ${row("“Unfollow” menu label", "", `<input class="field ltext" type="text" id="labelUnfollow" placeholder="e.g. Dejar de seguir">`)}
    </div>`;
  NFB.settingsHTML =
    `<div id="nfbset">` + general + appearance + method + safety + schedule + filters + labels + NFB.PLATFORMS.map(platform).join("") +
    `<div class="sblock"><div class="stitle">Delay between unfollows</div>
       ${row("Random delay (seconds)", "A random value between min and max is used.",
        `<div style="display:flex;gap:6px;align-items:center"><input class="field snum" type="number" id="minDelay" min="10" max="600"> – <input class="field snum" type="number" id="maxDelay" min="10" max="600"></div>`)}
     </div>
     <div class="ssaved" id="ssaved"></div></div>`;

  // root: document (popup) or a ShadowRoot (in-page panel). dialogHost: where confirmation dialogs are shown.
  NFB.bindSettings = async (root, dialogHost) => {
    const $ = (id) => root.getElementById(id);
    let timer;
    const flash = (m) => {
      $("ssaved").textContent = m;
      clearTimeout(timer);
      timer = setTimeout(() => ($("ssaved").textContent = ""), 1800);
    };
    const refreshInfo = async () => {
      const s = await NFB.getSettings();
      $("theme").value = s.theme || "system";
      $("enabled").checked = !!s.enabled;
      const idx = (await chrome.storage.local.get("nfb_accounts")).nfb_accounts || {};
      for (const p of NFB.PLATFORMS) {
        $("allowScan_" + p.id).checked = !!s["allowScan_" + p.id];
        const accts = idx[p.id] || [];
        const metas = accts.length ? await chrome.storage.local.get(accts.map((a) => `nfb_meta_${p.id}_${a}`)) : {};
        const lines = accts
          .map((a) => ({ a, m: metas[`nfb_meta_${p.id}_${a}`] }))
          .filter((x) => x.m)
          .map((x) => `${x.m.username ? "@" + x.m.username : "Account " + x.a} · ${x.m.text}`);
        $("info_" + p.id).textContent = lines.length ? lines.join("\n") : "No saved scan.";
      }
    };
    const loadAll = async () => {
      const s = await NFB.getSettings();
      for (const p of NFB.PLATFORMS) $("dailyCap_" + p.id).value = s["dailyCap_" + p.id];
      $("position").value = s.position;
      $("draggable").checked = !!s.draggable;
      $("igMethod").value = s.igMethod || "api";
      $("minDelay").value = s.minDelay;
      $("maxDelay").value = s.maxDelay;
      $("cooldownHours").value = s.cooldownHours;
      $("dayResetTime").value = s.dayResetTime;
      $("activeEnabled").checked = !!s.activeEnabled;
      $("activeFrom").value = s.activeFrom;
      $("activeTo").value = s.activeTo;
      $("protectVerified").checked = !!s.protectVerified;
      $("protectRecentDays").value = s.protectRecentDays;
      $("warmupEnabled").checked = !!s.warmupEnabled;
      $("warmupStart").value = s.warmupStart;
      $("warmupStep").value = s.warmupStep;
      $("labelFollowing").value = s.labelFollowing || "";
      $("labelUnfollow").value = s.labelUnfollow || "";
      $("lang").value = s.lang || "auto";
      $("notifyEnabled").checked = !!s.notifyEnabled;
      $("scheduleEnabled").checked = !!s.scheduleEnabled;
      $("scheduleTime").value = s.scheduleTime;
      $("scheduleCount").value = s.scheduleCount;
      $("protectPrivate").checked = !!s.protectPrivate;
      $("protectTagged").checked = !!s.protectTagged;
      $("protectPattern").value = s.protectPattern || "";
      await refreshInfo();
    };
    const save = async () => {
      const upd = {};
      for (const p of NFB.PLATFORMS) {
        upd["allowScan_" + p.id] = $("allowScan_" + p.id).checked;
        upd["dailyCap_" + p.id] = Math.min(100, Math.max(1, parseInt($("dailyCap_" + p.id).value, 10) || NFB.DEFAULTS["dailyCap_" + p.id]));
      }
      let mn = Math.max(10, parseInt($("minDelay").value, 10) || 20);
      let mx = Math.max(10, parseInt($("maxDelay").value, 10) || 60);
      if (mx < mn) mx = mn;
      upd.enabled = $("enabled").checked;
      upd.theme = $("theme").value;
      upd.position = $("position").value;
      upd.draggable = $("draggable").checked;
      upd.igMethod = $("igMethod").value;
      upd.minDelay = mn;
      upd.maxDelay = mx;
      upd.cooldownHours = Math.min(72, Math.max(0, parseInt($("cooldownHours").value, 10) || 0));
      upd.dayResetTime = $("dayResetTime").value || "00:00";
      upd.activeEnabled = $("activeEnabled").checked;
      upd.activeFrom = $("activeFrom").value || "09:00";
      upd.activeTo = $("activeTo").value || "22:00";
      upd.protectVerified = $("protectVerified").checked;
      upd.protectRecentDays = Math.min(365, Math.max(0, parseInt($("protectRecentDays").value, 10) || 0));
      upd.warmupEnabled = $("warmupEnabled").checked;
      upd.warmupStart = Math.min(100, Math.max(1, parseInt($("warmupStart").value, 10) || 10));
      upd.warmupStep = Math.min(50, Math.max(1, parseInt($("warmupStep").value, 10) || 5));
      upd.labelFollowing = $("labelFollowing").value.trim();
      upd.labelUnfollow = $("labelUnfollow").value.trim();
      upd.lang = $("lang").value;
      upd.notifyEnabled = $("notifyEnabled").checked;
      upd.scheduleEnabled = $("scheduleEnabled").checked;
      upd.scheduleTime = $("scheduleTime").value || "10:00";
      upd.scheduleCount = Math.min(100, Math.max(1, parseInt($("scheduleCount").value, 10) || 20));
      upd.protectPrivate = $("protectPrivate").checked;
      upd.protectTagged = $("protectTagged").checked;
      upd.protectPattern = $("protectPattern").value.trim();
      await chrome.storage.local.set(upd);
      flash("Saved");
    };
    $("nfbset").querySelectorAll("input, select").forEach((i) => { if (i.id !== "enabled") i.addEventListener("change", save); });
    // Turning the extension off from inside the page asks first, and explains how to get it back.
    $("enabled").addEventListener("change", async () => {
      if (!$("enabled").checked && root !== document) {
        const ok = await NFB.dialog(dialogHost, {
          title: "Turn off the extension?",
          body: "The floating button will disappear from every site. To turn it back on, click the extension's icon in the browser toolbar and switch it on.",
          confirmText: "Turn off",
          danger: true,
        });
        if (!ok) { $("enabled").checked = true; return; }
      }
      await save();
    });
    const FABPOS = NFB.PLATFORMS.map((p) => "fabPos_" + p.id);
    $("position").addEventListener("change", () => chrome.storage.local.remove(FABPOS));
    $("resetPos").addEventListener("click", async () => {
      await chrome.storage.local.remove(FABPOS);
      flash("Position reset");
    });
    for (const p of NFB.PLATFORMS) {
      $("clear_" + p.id).addEventListener("click", async () => {
        const ok = await NFB.dialog(dialogHost, {
          title: `Clear the saved ${p.label} scan?`,
          body: "The saved list and the followers/following lists (for every account on this site) will be removed and you will need to scan again. Kept accounts, unfollow history and the follower-change log are not affected.",
          confirmText: "Clear scan",
          danger: true,
        });
        if (!ok) return;
        const idx = (await chrome.storage.local.get("nfb_accounts")).nfb_accounts || {};
        const keys = ["nfb_scan_" + p.id, "nfb_lists_" + p.id, "nfb_gone_" + p.id];
        (idx[p.id] || []).forEach((a) => ["scan", "lists", "gone", "meta"].forEach((n) => keys.push(`nfb_${n}_${p.id}_${a}`)));
        await chrome.storage.local.remove(keys);
        await chrome.storage.local.set({ ["allowScan_" + p.id]: true });
        await loadAll();
        flash("Cleared. Scanning is allowed again.");
      });
    }
    let infoT;
    chrome.storage.onChanged.addListener((ch) => {
      if (!Object.keys(ch).some((k) => k.startsWith("nfb_scan_") || k.startsWith("nfb_meta_") || k === "nfb_accounts" || k.startsWith("allowScan_") || k === "theme" || k === "enabled")) return;
      clearTimeout(infoT);
      infoT = setTimeout(refreshInfo, 300);
    });
    await loadAll();
  };

  // Keeps the data-theme attribute of `el` in sync with the saved theme (light | dark | system).
  NFB.watchTheme = async (el) => {
    const s = await NFB.getSettings();
    el.setAttribute("data-theme", s.theme || "system");
    chrome.storage.onChanged.addListener((ch) => {
      if (ch.theme) el.setAttribute("data-theme", ch.theme.newValue || "system");
    });
  };
})();
