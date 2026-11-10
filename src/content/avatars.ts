// Profile-picture loading for the panel: direct load, background-worker relay, then a refreshed link.
// Only UI policy lives here; the adapter supplies the site-specific refresh call.
import { NFB } from "../shared";
import type { Adapter, Lists, User } from "../types";

export interface AvatarState {
  get users(): User[];
  get lists(): Lists | null;
  get picFresh(): Record<string, string>;
}

export interface AvatarDeps {
  adapter: Adapter;
  picsKey: string;
  state: AvatarState;
}

export function createAvatars({ adapter: A, picsKey, state }: AvatarDeps) {
  const refresh = A.refreshPic as ((u: User) => Promise<string | null>) | undefined;
  const picCache = new Map<string, string>(); // url -> data URL, this session
  const expiredUrl = (url: string) => {
    const m = /[?&]oe=([0-9a-f]+)/i.exec(url || "");
    return !!m && parseInt(m[1], 16) * 1000 < Date.now();
  };
  const loadImg = (img: HTMLImageElement, src: string) => new Promise<boolean>((res) => {
    const timer = setTimeout(() => res(false), 8000);
    img.onload = () => { clearTimeout(timer); res(true); };
    img.onerror = () => { clearTimeout(timer); res(false); };
    img.src = src;
  });

  const bgQueue: Array<{ url: string; resolve: (data: string | null) => void }> = [];
  let bgActive = 0;
  const BG_TIMEOUT = 10000;
  const fetchViaBg = (url: string) => new Promise<string | null>((res) => {
    let settled = false;
    const done = (data: string | null) => { if (settled) return; settled = true; clearTimeout(timer); res(data); };
    const timer = setTimeout(() => done(null), BG_TIMEOUT);
    try {
      chrome.runtime.sendMessage({ type: "fetch-image", url }, (r) => {
        void chrome.runtime.lastError;
        done(r && r.ok ? r.data : null);
      });
    } catch {
      done(null);
    }
  });
  function pumpBg() {
    while (bgActive < 4 && bgQueue.length) {
      const job = bgQueue.shift();
      if (!job) return;
      bgActive++;
      fetchViaBg(job.url).then((d) => {
        if (d) {
          if (picCache.size > 400) picCache.delete(picCache.keys().next().value as string);
          picCache.set(job.url, d);
        }
        job.resolve(d);
      }).finally(() => { bgActive--; pumpBg(); });
    }
  }
  const viaExtension = (url: string) => (picCache.has(url) ? Promise.resolve(picCache.get(url) as string) : new Promise<string | null>((resolve) => { bgQueue.push({ url, resolve }); pumpBg(); }));

  // Asks the site for a fresh picture link, slowly (about one a second), at most 80 per page load, and
  // stops for the rest of the page load if the site answers with a limit or block.
  let refreshBudget = 80, refreshDead = false, refreshBusy = false;
  const refreshQ: Array<{ u: User; resolve: (url: string | null) => void }> = [];
  const refreshing = new Map<string, Promise<string | null>>();
  function refreshPic(u: User): Promise<string | null> {
    if (!refresh || refreshDead || refreshBudget <= 0) return Promise.resolve(null);
    const pending = refreshing.get(u.pk);
    if (pending) return pending;
    const p = new Promise<string | null>((resolve) => { refreshQ.push({ u, resolve }); pumpRefresh(); });
    refreshing.set(u.pk, p);
    return p;
  }
  async function pumpRefresh() {
    if (refreshBusy) return;
    refreshBusy = true;
    while (refreshQ.length) {
      const job = refreshQ.shift();
      if (!job) break;
      const { u, resolve } = job;
      if (!refresh || refreshDead || refreshBudget <= 0) { resolve(null); continue; }
      refreshBudget--;
      let url: string | null = null;
      const pending = refresh(u).catch((e) => {
        if (e && (e as { fatal?: boolean }).fatal) refreshDead = true;
        return null;
      });
      url = await Promise.race([pending, NFB.sleep(15000).then(() => null)]);
      resolve(url);
      await NFB.sleep(NFB.rand(900, 1600));
    }
    refreshBusy = false;
  }
  let picT: ReturnType<typeof setTimeout> | undefined;
  const savePics = () => {
    clearTimeout(picT);
    picT = setTimeout(() => chrome.storage.local.set({ [picsKey]: state.picFresh }), 800);
  };

  const placeholder = (u: User | null | undefined) => {
    const d = document.createElement("div");
    d.className = "av ph";
    d.textContent = ((u && u.username) || "?").trim().charAt(0).toUpperCase();
    return d;
  };

  async function loadAvatar(img: HTMLImageElement, u: User) {
    const attempt = async (url: string | null) => {
      if (!url) return false;
      if (/^data:/.test(url)) return loadImg(img, url);
      if (expiredUrl(url)) return false; // known to be dead: don't even try
      if (await loadImg(img, url)) return true;
      const d = await viaExtension(url);
      return !!d && (await loadImg(img, d));
    };
    const url = state.picFresh[u.pk] || u.pic;
    if (await attempt(url || null)) return;
    const fresh = await refreshPic(u);
    if (fresh && fresh !== url && (await attempt(fresh))) {
      state.picFresh[u.pk] = fresh;
      savePics();
      return;
    }
    img.replaceWith(placeholder(u));
  }

  const avatarEl = (u: User | null | undefined) => {
    if (!u || !(u.pic || state.picFresh[u.pk])) return placeholder(u);
    const img = new Image();
    img.className = "av";
    img.alt = "";
    img.decoding = "async";
    void loadAvatar(img, u);
    return img;
  };

  async function picCheck() {
    const u = state.users.find((x) => x.pic) || (state.lists && state.lists.following || []).find((x) => x.pic);
    if (!u) return [{ ok: null, name: "Profile pictures", detail: "none saved yet: run a scan" }];
    const url = state.picFresh[u.pk] || u.pic;
    const out = [];
    const exp = expiredUrl(url || "");
    out.push({ ok: !exp, name: "Picture link", detail: exp ? "expired (links last a few days): refreshed automatically, or scan again" : "not expired" });
    const test = (src: string) => loadImg(new Image(), src);
    out.push({ ok: await test(url || ""), name: "Picture loads directly in the page", detail: "" });
    const d = await viaExtension(url || "");
    out.push({ ok: !!d, name: "Picture loads through the extension", detail: d ? "" : "blocked, expired or unavailable" });
    out.push({ ok: refresh ? true : null, name: "Expired links can be refreshed", detail: refresh ? `up to ${refreshBudget} more this page load` : "not supported on this site" });
    return out;
  }

  return { avatarEl, placeholder, picCheck };
}
