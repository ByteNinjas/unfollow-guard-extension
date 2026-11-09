// Test fixture: registers the documented adapter template as a fake site, then
// boots the real panel. Built by scripts/build-test.mjs to dist/test/example-content.js.
import { NFB } from "../../src/shared";
import "../../src/i18n";
import "../../src/adapters/_template";

const example = { id: "example", label: "Example" } as any;
if (!(NFB.PLATFORMS as any[]).some((p) => p.id === "example")) NFB.PLATFORMS.push(example);
NFB.DEFAULTS.allowScan_example = true;
NFB.DEFAULTS.dailyCap_example = 10;
// shared.ts already built the settings form before this fixture ran, so rebuild it with the new platform.
NFB.settingsHTML = NFB.buildSettingsHTML();

const A: any = (NFB.adapters as any).example;
const user = (n: number) => ({ pk: "e" + n, username: "ex" + n, full_name: "", pic: "", verified: false });
A.scan = async ({ setStatus }: any) => {
  setStatus("Reading lists…");
  const following = [1, 2, 3].map(user);
  const followers = [user(1)];
  const fset = new Set(followers.map((u: any) => u.pk));
  const users = following.filter((u) => !fset.has(u.pk));
  return {
    complete: true,
    scan: { at: Date.now(), followers: followers.length, following: following.length, users },
    lists: { at: Date.now(), followers, following, followingComplete: true, followersComplete: true },
    message: `${users.length} accounts don't follow you back.`,
  };
};
A.unfollow = async (u: any) => {
  (globalThis as any).__unfollowed = ((globalThis as any).__unfollowed || []).concat(u.pk);
};

// Deferred so the platform and adapter overrides exist before the panel mounts.
import("../../src/content/index");
