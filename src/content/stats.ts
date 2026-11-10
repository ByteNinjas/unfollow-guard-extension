// Statistics tab: summary cards and the last-14-days unfollow chart. Pure DOM building, no state changes.
import type { Lists, User } from "../types";

export interface StatsInput {
  listEl: HTMLElement;
  rows: Map<string, unknown>;
  scanCache: Record<string, unknown> | null;
  lists: Lists | null;
  mutual: User[];
  fans: User[];
  hist: Array<User & { at?: number }>;
  flw: Array<Record<string, unknown>>;
  followerDiff?: boolean;
  fmtN: (value: number | null | undefined) => string;
}

export function renderStatsView({ listEl, rows, scanCache, lists, mutual, fans, hist, flw, followerDiff, fmtN }: StatsInput) {
  listEl.replaceChildren();
  rows.clear();
  const followingCount = scanCache && typeof scanCache.following === "number"
    ? (scanCache.following as number)
    : lists && lists.following ? lists.following.length : null;
  const followerCount = scanCache && typeof scanCache.followers === "number"
    ? (scanCache.followers as number)
    : lists && lists.followers ? lists.followers.length : null;
  const now = Date.now(), DAY = 864e5;
  const rate = lists && lists.followers && followingCount ? Math.round((mutual.length / followingCount) * 100) + "%" : "–";
  const unf7 = hist.filter((h) => now - (h.at || 0) < 7 * DAY).length;
  const gained = flw.filter((e) => e.type === "new" && now - Number(e.at || 0) < 30 * DAY).length;
  const lost = flw.filter((e) => e.type === "lost" && now - Number(e.at || 0) < 30 * DAY).length;
  const cards: Array<[string, string, string]> = [
    [rate, "Follow-back rate", "of the accounts you follow"], [fmtN(followingCount), "Following", "accounts"],
    [fmtN(followerCount), "Followers", "accounts"], [lists && lists.followers ? fmtN(fans.length) : "–", "Fans", "follow you, you don't follow back"],
    [fmtN(hist.length), "Unfollowed", "all time"], [fmtN(unf7), "Unfollowed", "last 7 days"],
    [followerDiff ? fmtN(gained) : "–", "New followers", "last 30 days"], [followerDiff ? fmtN(lost) : "–", "Lost followers", "last 30 days"],
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
  const days: Date[] = [];
  for (let k = 13; k >= 0; k--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - k);
    days.push(d);
  }
  const counts = days.map((d) => hist.filter((h) => {
    const x = new Date(h.at || 0);
    x.setHours(0, 0, 0, 0);
    return x.getTime() === d.getTime();
  }).length);
  const max = Math.max(1, ...counts);
  days.forEach((d, i) => {
    const col = document.createElement("div");
    col.className = "bcol";
    col.title = `${d.toLocaleDateString()}: ${counts[i]}`;
    const n = document.createElement("span"); n.className = "bn"; n.textContent = String(counts[i] || "");
    const bar = document.createElement("i"); bar.style.height = Math.max(counts[i] ? 4 : 2, (counts[i] / max) * 70) + "px";
    const lab = document.createElement("span"); lab.className = "bl"; lab.textContent = String(d.getDate());
    col.append(n, bar, lab);
    bars.append(col);
  });
  wrap.append(grid, title, bars);
  listEl.append(wrap);
}
