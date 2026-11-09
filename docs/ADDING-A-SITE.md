# Adding a site

Each site is an **adapter**: one file that teaches the panel how to read follower lists and unfollow there. The panel
(`src/content/index.ts`) does everything else: tabs, selection, daily limit, delays, cool-down, history, translations.

> Only add a site you can test with a real account. Sites differ a lot in how strict they are about automation, and an
> adapter that was never run against the real site will not work.

## 1. Copy the template

```bash
cp src/adapters/_template.ts src/adapters/mysite.ts
```

Edit `id`, `label` and `match()` (which hostname the adapter handles), then implement:

| Function | What it does |
| --- | --- |
| `scan({ setStatus, prev, opts })` | Returns the accounts you follow that don't follow back, plus the full lists. |
| `unfollow(user, settings)` | Unfollows one account and **throws** an `Error` if it fails (`err.fatal`, `err.block` change what happens next). |
| `accountId()` | Id of the logged-in account, so data is stored per account. |
| `profileUrl(user)` | Link used when you click a username. |

Optional: `navigateTo`, `follow` (Re-follow button), `followerDiff`, `canSchedule`, `diagnose` (Self-check button).
The template documents every field, and the shape of a `user` object.

## 2. Register the site

1. **`src/shared.ts`**: add the site to `NFB.PLATFORMS` and add `allowScan_<id>: true` and `dailyCap_<id>: 20` to `NFB.DEFAULTS`.
2. **`src/adapters/index.ts`**: import the new adapter next to the Instagram and Facebook ones.
3. **`src/manifest.ts`**: add the site's URL pattern to the content script's `matches`.

Run `npm run build`, then load `dist/chromium/` (the adapters are bundled together, so there is no script list to edit).

## 3. Test it

`tests/adapter-template.test.ts` and `tests/fixtures/example-entry.ts` show how to load an adapter into the panel with a
simulated browser. Copy them for your adapter, then try it on a real account with a **small** daily limit.

Remember that the panel is built around restraint: keep the daily limit, the random delays and "stop when the site pushes
back" intact.
