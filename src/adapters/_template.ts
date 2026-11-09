// ──────────────────────────────────────────────────────────────────────────────────────────────
//  Adapter TEMPLATE: how to add another site. See docs/ADDING-A-SITE.md for the three registration steps.
//
//  An adapter teaches the panel (content.js) how to read follower lists and unfollow on one site.
//  Everything else (tabs, selection, daily limit, cool-down, history, translations…) is shared.
//  Rename "example" below, change match(), and replace the three TODO functions with real logic.
// ──────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  const NFB = globalThis.NFB;

  // A "user" object used everywhere in the panel:
  //   { pk: "stable id as a string", username, full_name, pic: "image url or ''", verified: bool,
  //     private?: bool, noPic?: bool }

  NFB.adapters.example = {
    id: "example",                      // must also be listed in NFB.PLATFORMS and NFB.DEFAULTS (shared.js)
    label: "Example",
    match: () => location.hostname.endsWith("example.test"),
    accountId: () => "default",         // id of the logged-in account (read a cookie, the page…), so data is kept per account

    // ---- scanning ------------------------------------------------------------------------------
    supportsStart: false,               // true if you support the "from #" offset
    scanConfirm: (opts) => "Read the follower lists now?",   // text of the confirmation dialog
    canScan: (prev) => true,            // false disables the Scan button (e.g. wrong page)
    cannotScanMessage: (prev) => "",    // shown when canScan() is false
    scanLabel: (prev) => "Scan",        // label of the Scan button
    profileUrl: (u) => `https://example.test/${u.username}`,

    // TODO 1: return everyone you follow who doesn't follow back.
    async scan({ setStatus, prev, opts }) {
      setStatus("Reading lists…");
      const following = [];   // TODO: fetch the accounts you follow  -> user objects
      const followers = [];   // TODO: fetch your followers           -> user objects
      const fset = new Set(followers.map((u) => u.pk));
      const users = following.filter((u) => !fset.has(u.pk));
      return {
        complete: true,                                  // true locks the Scan button until unlocked in Settings
        scan: { at: Date.now(), followers: followers.length, following: following.length, users },
        lists: { at: Date.now(), followers, following, followingComplete: true, followersComplete: true },
        message: `${users.length} accounts don't follow you back.`,
      };
    },

    // ---- unfollowing ---------------------------------------------------------------------------
    // TODO 2: unfollow one account. THROW an Error on failure. Optional flags on the error:
    //   err.fatal = true  -> stop the whole batch      err.block = true -> also start the cool-down
    //   err.useUI = true  -> (instagram only) retry with the browser-click method
    async unfollow(u, settings) {
      throw new Error("unfollow() is not implemented for this site yet");
    },

    // ---- optional ------------------------------------------------------------------------------
    // navigateTo: (u, settings) => url,   // browser-click flow: open this page before calling unfollow()
    // follow: async (u) => {},            // enables the "Re-follow" button
    // followerDiff: true,                 // the follower list is complete: log who unfollowed you
    // canSchedule: true,                  // allow the daily schedule on this site
    // async diagnose(settings) { return [{ ok: true, name: "Logged in", detail: "yes" }]; },  // "Self-check" button
  };
})();
