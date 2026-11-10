// Facebook adapter. Facebook has no stable internal API like Instagram's, so this works on the page itself:
// it scrolls your Followers / Following tabs to collect the lists, and unfollows by clicking the buttons.
// All selectors/text matching live in this file (English UI) so they are easy to adjust.
import { NFB } from "../shared";
import type { Scan, ScanContext, User } from "../types";

  type Kind = "followers" | "following";

  const RESERVED = new Set([
    "", "friends", "groups", "watch", "marketplace", "gaming", "pages", "events", "photo", "photos", "reel", "reels",
    "stories", "story.php", "hashtag", "help", "settings", "notifications", "messages", "bookmarks", "login",
    "policies", "privacy", "search", "share", "permalink.php", "profile.php", "me", "ads", "business", "fundraisers",
    "memories", "saved", "video", "videos", "public", "l.php", "recover", "dialog", "forms", "about",
  ]);

  const kind = (): Kind | null => {
    const p = location.pathname.toLowerCase();
    const q = location.search.toLowerCase();
    if (/\/followers\/?$/.test(p) || /sk=followers/.test(q)) return "followers";
    if (/\/following\/?$/.test(p) || /sk=following/.test(q)) return "following";
    return null;
  };

  const ownKey = () => {
    if (location.pathname === "/profile.php") {
      const id = new URLSearchParams(location.search).get("id");
      return id ? "id:" + id : null;
    }
    const seg = location.pathname.split("/").filter(Boolean)[0];
    return seg ? seg.toLowerCase() : null;
  };

  const keyFromHref = (href: string): { key: string; url: string } | null => {
    let u: URL;
    try { u = new URL(href, location.href); } catch { return null; }
    if (!/(^|\.)facebook\.com$/.test(u.hostname)) return null;
    if (u.pathname === "/profile.php") {
      const id = u.searchParams.get("id");
      return id ? { key: "id:" + id, url: `https://www.facebook.com/profile.php?id=${id}` } : null;
    }
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length !== 1) return null;
    const s = segs[0].toLowerCase();
    if (RESERVED.has(s)) return null;
    return { key: s, url: `https://www.facebook.com/${segs[0]}` };
  };

  const keysIn = (el: Element): Set<string> => {
    const s = new Set<string>();
    el.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((x) => { const k = keyFromHref(x.href); if (k) s.add(k.key); });
    return s;
  };

  // The list row for a profile link: the biggest ancestor that holds only this one profile and has a button.
  const rowFor = (a: Element, key: string): Element | null => {
    let el: Element = a, row: Element | null = null;
    for (let i = 0; i < 12 && el.parentElement && el.parentElement !== document.body; i++) {
      el = el.parentElement;
      const ks = keysIn(el);
      if (ks.size > 1 || (ks.size === 1 && !ks.has(key))) break;
      if (el.querySelector('[role="button"],button')) row = el;
      if (el.matches('[role="main"]')) break;
    }
    return row;
  };

  const avatarIn = (row: Element): string => {
    const img = row.querySelector<HTMLImageElement>("img[src]");
    if (img) return img.src;
    const im = row.querySelector("image");
    return im ? im.getAttribute("xlink:href") || im.getAttribute("href") || "" : "";
  };

  const mainEl = (): Element => document.querySelector('[role="main"]') || document.body;

  const collect = (map: Map<string, User>, k: Kind) => {
    const own = ownKey();
    mainEl().querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      const hit = keyFromHref(a.href);
      if (!hit || hit.key === own) return;
      if (k !== "followers" && map.has(hit.key)) return;
      const name = (a.textContent || "").trim();
      if (k === "followers") {
        // Be liberal here: over-collecting followers is safe, missing one would wrongly mark a follower as a non-follower.
        const prevU = map.get(hit.key);
        const row = rowFor(a, hit.key);
        map.set(hit.key, {
          pk: hit.key,
          username: name || (prevU && prevU.username) || hit.key,
          full_name: "",
          pic: (row && avatarIn(row)) || (prevU && prevU.pic) || "",
          verified: false,
          url: hit.url,
        });
        return;
      }
      if (!name) return;
      const row = rowFor(a, hit.key);
      if (!row) return;
      map.set(hit.key, { pk: hit.key, username: name, full_name: "", pic: avatarIn(row), verified: false, url: hit.url });
    });
  };

  async function findRow(pk: string) {
    const look = () => {
      for (const a of mainEl().querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const k = keyFromHref(a.href);
        if (k && k.key === pk) { const row = rowFor(a, pk); if (row) return row; }
      }
      return null;
    };
    let row = look();
    if (row) return row;
    window.scrollTo(0, 0);
    await NFB.sleep(800);
    for (let i = 0; i < 40; i++) {
      row = look();
      if (row) return row;
      window.scrollBy(0, window.innerHeight * 0.8);
      await NFB.sleep(900);
    }
    return null;
  }

  const btnsIn = (row: Element): Element[] => [...row.querySelectorAll('[role="button"],button')];
  const txt = (el: Element) => (el.textContent || "").trim();

  const getCookie = (n: string) => (document.cookie.split("; ").find((c) => c.startsWith(n + "=")) || "").split("=")[1];

  NFB.adapters.facebook = {
    id: "facebook",
    label: "Facebook",
    followerDiff: false,                      // scrolled lists may be incomplete, so no "who unfollowed me" log
    accountId: () => getCookie("c_user") || "default",
    match: () => /(^|\.)facebook\.com$/.test(location.hostname),
    scanConfirm: (o: { limit?: unknown }) =>
      kind() === "following" && o.limit
        ? `Collect the first ${o.limit} accounts on this list? The page will scroll by itself.`
        : "Scroll this list to the end and collect it now? The page will scroll by itself for a while.",

    canScan(prev?: Scan | null) {
      const k = kind();
      if (!k) return false;
      return !(prev && prev[k === "followers" ? "followersList" : "followingList"]);
    },
    cannotScanMessage() {
      return kind()
        ? "This list is already collected. To redo it, clear the saved scan in ⚙ Settings."
        : "Open your profile's Followers or Following tab (facebook.com/<you>/followers or /following), then click again.";
    },
    scanLabel(prev?: Scan | null) {
      const k = kind();
      if (!k) return "Open Followers/Following tab";
      const have = prev && prev[k === "followers" ? "followersList" : "followingList"];
      if (have) return (k === "followers" ? "Followers" : "Following") + " collected ✓";
      return k === "followers" ? "Collect followers" : "Collect following";
    },
    profileUrl: (u: User) => String(u.url || `https://www.facebook.com/${u.pk}`),

    async diagnose() {
      const out: Array<{ ok: boolean | null; name: string; detail: string }> = [];
      const add = (ok: boolean | null, name: string, detail?: string) => out.push({ ok, name, detail: detail || "" });
      add(!!getCookie("c_user"), "Logged in (account cookie)", getCookie("c_user") ? "yes" : "not found: are you logged in?");
      const k = kind();
      add(k ? true : null, "Followers / Following tab recognised", k || "open your profile's Followers or Following tab");
      const main = document.querySelector('[role="main"]');
      add(!!main, "Main page area found", main ? "yes" : "not found: Facebook's layout may have changed");
      const own = ownKey();
      const keys = new Set<string>();
      mainEl().querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => { const h = keyFromHref(a.href); if (h && h.key !== own) keys.add(h.key); });
      add(keys.size > 0 ? true : null, "Profile links found", keys.size + " distinct");
      let rowsWithButton = 0;
      mainEl().querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => { const h = keyFromHref(a.href); if (h && h.key !== own && rowFor(a, h.key)) rowsWithButton++; });
      add(rowsWithButton > 0 ? true : null, "List rows with a Follow/Following button", rowsWithButton + " found");
      return out;
    },

    async scan({ setStatus, prev, opts }: ScanContext) {
      const k = kind();
      if (!k) throw new Error(this.cannotScanMessage());
      // Only the Following list can be limited. Followers are always collected fully so nobody is wrongly marked as a non-follower.
      const limit = (k === "following" && Number(opts.limit)) || 0;
      const items = new Map<string, User>();
      let stagnant = 0;
      while (stagnant < 8) {
        const before = items.size;
        collect(items, k);
        window.scrollTo(0, document.documentElement.scrollHeight);
        await NFB.sleep(NFB.rand(1800, 3000));
        collect(items, k);
        if (limit && items.size >= limit) break;
        stagnant = items.size === before ? stagnant + 1 : 0;
        setStatus(`Collecting ${k}… ${items.size} found (scrolling)`);
      }
      window.scrollTo(0, 0);
      if (!items.size) throw new Error(`No ${k} found on this page. Facebook's layout may differ from what this extension expects.`);

      const arr = [...items.values()].slice(0, limit || undefined);
      const scan: Scan = { ...(prev || {}), at: Date.now(), users: [] };
      const followersList = k === "followers" ? arr.map((x) => x.pk) : undefined;
      const followingList = k === "following" ? arr : undefined;
      scan.followersList = followersList;
      scan.followingList = followingList;
      scan.followers = followersList ? followersList.length : undefined;
      scan.following = followingList ? followingList.length : undefined;

      if (followersList && followingList) {
        const fs = new Set(followersList);
        scan.users = followingList.filter((u) => !fs.has(u.pk));
        const lists = { at: Date.now(), [k]: arr };
        return {
          complete: true,
          scan,
          lists,
          message: `Following ${scan.following}, followers ${scan.followers}. ${scan.users.length} don't follow you back (this includes Pages and public figures). Scan is now locked.`,
        };
      }
      const lists = { at: Date.now(), [k]: arr };
      const other = k === "followers" ? "Following" : "Followers";
      return { complete: false, scan, lists, message: `Collected ${arr.length} ${k}. Now open your ${other} tab and click again.` };
    },

    async unfollow(u: User) {
      if (kind() !== "following") {
        const err = new Error("Open your Following tab first, then try again.");
        err.fatal = true;
        throw err;
      }
      const row = await findRow(u.pk);
      if (!row) throw new Error(`Couldn't find ${u.username} on this page. Keep the Following tab open.`);
      row.scrollIntoView({ block: "center" });
      await NFB.sleep(NFB.rand(600, 1200));

      const btn =
        btnsIn(row).find((b) => /^(following|unfollow)$/i.test(txt(b))) ||
        btnsIn(row).find((b) => /following|unfollow/i.test(b.getAttribute("aria-label") || ""));
      if (!btn) throw new Error(`No Following/Unfollow button found for ${u.username}.`);
      btn.click();

      // A menu and/or a confirmation dialog may appear; click "Unfollow" up to twice.
      const item = () =>
        [...document.querySelectorAll('[role="menuitem"],[role="menu"] [role="button"],[role="dialog"] [role="button"],[role="dialog"] button')]
          .find((x) => /^unfollow\b/i.test(txt(x)));
      for (let i = 0; i < 2; i++) {
        await NFB.sleep(NFB.rand(700, 1400));
        const it = item();
        if (it) it.click();
      }

      for (let i = 0; i < 12; i++) {
        await NFB.sleep(500);
        if (!document.contains(row)) return;
        const t = btnsIn(row).map(txt);
        if (t.some((x) => /^follow$/i.test(x)) && !t.some((x) => /^following$/i.test(x))) return;
      }
      throw new Error(`Couldn't confirm that ${u.username} was unfollowed`);
    },
  };
