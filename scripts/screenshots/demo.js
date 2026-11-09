// Builds deterministic, fake demo data (no real people) and the page/stub harness used for screenshots.
let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const FIRST = ["Maya","Leo","Ines","Sam","Priya","Jonas","Aiko","Omar","Lucia","Noah","Zara","Mateo","Hana","Felix","Amara","Ravi","Elena","Tomas","Nadia","Kai","Sofia","Diego","Mila","Arjun","Chloe","Yusuf","Freya","Andre","Leila","Oscar"];
const LAST = ["Okafor","Vance","Duarte","Whitaker","Nair","Keller","Tanaka","Haddad","Moreno","Fischer","Adeyemi","Silva","Kobayashi","Novak","Mensah","Patel","Rossi","Larsen","Karim","Brandt","Ortega","Lindgren","Bauer","Santos","Ivanov","Cohen","Park","Reyes","Mwangi","Dubois"];
const A = ["sunset","pixel","brew","trail","daily","moss","neon","paper","wild","quiet","golden","urban","salt","fern","cedar","lunar","coral","ember","harbor","juniper","amber","north","velvet","tiny","oak"];
const B = ["lens","pilot","books","notes","dough","stone","studio","diary","cafe","lab","works","journal","garden","roasters","atelier","films","bikes","eats","paws","threads","press","bloom","supply","sketch","wander"];
const COLORS = ["#f97316","#6366f1","#10b981","#ec4899","#0ea5e9","#a855f7","#ef4444","#14b8a6","#eab308","#8b5cf6","#22c55e","#f43f5e"];
const used = new Set();
function avatar(ch, color) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><circle cx='20' cy='20' r='20' fill='${color}'/><text x='20' y='26.5' font-size='18' font-weight='700' text-anchor='middle' fill='white' font-family='Arial,sans-serif'>${ch}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}
let pk = 41000000;
function person(verified = false) {
  let u; do { const sep = pick([".", "_", ""]); u = pick(A) + sep + pick(B) + (rnd() < 0.25 ? Math.floor(rnd() * 90) : ""); } while (used.has(u));
  used.add(u);
  return { pk: String(pk += 1 + Math.floor(rnd() * 900)), username: u, full_name: pick(FIRST) + " " + pick(LAST), pic: avatar(u[0].toUpperCase(), pick(COLORS)), verified, private: rnd() < 0.22, noPic: rnd() < 0.06 };
}
const ME = { followers: 97, following: 3335, mutual: 66 };
const mutual = Array.from({ length: ME.mutual }, () => person());
const fans = Array.from({ length: ME.followers - ME.mutual }, () => person());
const nonFollowers = Array.from({ length: ME.following - ME.mutual }, (_, i) => person(i % 37 === 5));
const following = []; // interleave mutual accounts among the non-followers
{ let mi = 0; nonFollowers.forEach((u, i) => { following.push(u); if (i % 50 === 49 && mi < mutual.length) following.push(mutual[mi++]); }); while (mi < mutual.length) following.push(mutual[mi++]); }
const followers = [...mutual, ...fans];

const DAY = 864e5, now = Date.now();
const keptUsers = nonFollowers.slice(40, 45);
const histUsers = nonFollowers.slice(60, 72);
const lostUsers = [fans[0], fans[1], mutual[3]].map((u) => ({ ...u }));
const newUsers = [fans[2], fans[3], fans[4], fans[5]].map((u) => ({ ...u }));
const ACCT = "777";
const slim = (u) => ({ pk: u.pk, username: u.username, full_name: u.full_name, pic: u.pic, verified: !!u.verified, private: u.private, noPic: u.noPic });
const gone = new Set(histUsers.map((u) => u.pk));
const users = nonFollowers.filter((u) => !gone.has(u.pk) && !keptUsers.includes(u)).map(slim);

function fullStore(theme, extra = {}) {
  const s = {
    igMethodV2: true, theme, allowScan_instagram: true, dailyCap_instagram: 40,
    ["nfb_scan_instagram_" + ACCT]: { at: now - 5 * 3600e3, followers: ME.followers, following: ME.following, checked: ME.following, range: null, username: "demo.account", users: nonFollowers.map(slim) },
    ["nfb_lists_instagram_" + ACCT]: { at: now - 5 * 3600e3, followers: followers.map(slim), following: following.map(slim), followingComplete: true, followersComplete: true },
    ["nfb_keep_instagram_" + ACCT]: Object.fromEntries(keptUsers.map((u) => [u.pk, slim(u)])),
    ["nfb_gone_instagram_" + ACCT]: [...gone],
    ["nfb_hist_instagram_" + ACCT]: histUsers.map((u, i) => ({ ...slim(u), at: now - (i < 5 ? 0 : (1 + (i % 6))) * DAY - i * 777000 })),
    ["nfb_flw_instagram_" + ACCT]: [...lostUsers.map((u, i) => ({ ...slim(u), type: "lost", at: now - (1 + i) * DAY })), ...newUsers.map((u, i) => ({ ...slim(u), type: "new", at: now - (i + 1) * 0.6 * DAY }))],
    ["nfb_snap_instagram_" + ACCT]: { at: now - 5 * 3600e3, users: followers.map(slim) },
    ["nfb_seen_instagram_" + ACCT]: { complete: true, m: {} },
    ["nfb_sel_instagram_" + ACCT]: users.slice(0, 3).map((u) => u.pk),
    nfb_accounts: { instagram: [ACCT] },
    nfb_onboarded: true,
    ["nfb_tags_instagram_" + ACCT]: { [users[2].pk]: { tag: "friend", note: "college friend" }, [users[6].pk]: { tag: "client", note: "" } },
    ["nfb_meta_instagram_" + ACCT]: { at: now - 5 * 3600e3, text: `Scanned today · following ${ME.following}, followers ${ME.followers} · ${nonFollowers.length} non-followers`, username: "demo.account" },
    ...extra,
  };
  return s;
}
const toApi = (u) => ({ pk: u.pk, username: u.username, full_name: u.full_name, profile_pic_url: u.pic, is_verified: !!u.verified });
const demoLists = { following: following.map(toApi), followers: followers.map(toApi) };

const PAGE_HTML = `<!doctype html><html lang="en" data-nfb='{"fb_dtsg":"NAcDEMO","x-ig-www-claim":"hmac.demo","x-instagram-ajax":"1000000","x-asbd-id":"1"}'><head><meta charset="utf-8"><title>Demo page</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:linear-gradient(135deg,#eef2f7,#e3e8f0);color:#1f2933}
.wrap{max-width:560px;margin:40px auto;padding:0 16px}.card{background:#fff;border-radius:16px;padding:18px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.bar{height:12px;border-radius:6px;background:#e5e9ef;margin:10px 0}.bar.s{width:60%}.bar.m{width:80%}.img{height:200px;border-radius:12px;background:linear-gradient(135deg,#cbd5e1,#e2e8f0)}</style></head>
<body><div class="wrap"><div class="card"><header style="display:flex;gap:8px;margin-bottom:10px"><button style="padding:6px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff">Following</button><button style="padding:6px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff">Message</button></header><div class="bar m"></div><div class="bar s"></div><div class="img"></div></div><div class="card"><div class="bar m"></div><div class="bar"></div><div class="img"></div></div></div></body></html>`;
const PAGE_HTML_DARK = PAGE_HTML.replace("linear-gradient(135deg,#eef2f7,#e3e8f0)", "linear-gradient(135deg,#0f1115,#171a20)").replace("color:#1f2933", "color:#e5e7eb").replace(/background:#fff/g, "background:#1c1f26").replace(/#e5e9ef/g, "#2a2f39");

// runs inside the page before the extension scripts: fake chrome.storage + fake Instagram API
const initScript = (store) => `(() => {
  const store = ${JSON.stringify(store)};
  const ls = [];
  const clone = (v) => JSON.parse(JSON.stringify(v));
  window.chrome = { storage: { local: {
    get: async (k) => { const o = {}; (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = clone(store[x]); }); return o; },
    set: async (o) => { const ch = {}; for (const k in o) { ch[k] = { oldValue: store[k], newValue: o[k] }; store[k] = clone(o[k]); } ls.forEach((f) => f(ch)); },
    remove: async (ks) => { const ch = {}; (Array.isArray(ks) ? ks : [ks]).forEach((k) => { ch[k] = { oldValue: store[k] }; delete store[k]; }); ls.forEach((f) => f(ch)); } },
    onChanged: { addListener: (f) => ls.push(f) } } };
  window.__store = store;
  const today = new Date().toLocaleDateString("en-CA");
  if (!store.__noDaily) { store.nfb_daily_instagram_${ACCT} = { date: today, count: ${12} }; store.nfb_days_instagram_${ACCT} = { n: 5, last: today }; }
  delete store.__noDaily;
  const L = ${JSON.stringify(demoLists)};
  const J = (b) => ({ ok: true, status: 200, text: async () => JSON.stringify(b), json: async () => b });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.fetch = async (url) => {
    if (/\\/users\\/\\d+\\/info\\//.test(url)) return J({ user: { follower_count: L.followers.length, following_count: L.following.length, username: "demo.account" } });
    if (/\\/following\\//.test(url)) { await wait(900); return J({ users: L.following }); }
    if (/\\/followers\\//.test(url)) { await wait(500); return J({ users: L.followers }); }
    if (/\\/friendships\\/(destroy|create)\\//.test(url)) { await wait(500); return J({ status: "ok", friendship_status: { following: /create/.test(url) } }); }
    return J({});
  };
})();`;
export { fullStore, initScript, PAGE_HTML, PAGE_HTML_DARK, users, ACCT, ME, nonFollowers };
