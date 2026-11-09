# AGENTS.md — working rules for Unfollow Guard

These instructions apply to every agent or contributor working in this repository.
Read them before making changes.

## Git workflow (required)

- **Never commit directly to `main`.**
- `dev` is the integration branch. Create every change on a short-lived branch off `dev`
  (`feat/<topic>`, `fix/<topic>`, `chore/<topic>`), then open a PR **into `dev`**.
- When `dev` is stable and tested, open a second PR **`dev` → `main`**. `main` is release-clean.
- Delete branches after they are merged (locally and on the remote). Do not leave stale branches.
- Never force-push or rewrite shared history.
- Keep commits focused and descriptive. Do not commit generated patch files (`*.patch`), build
  output (`dist/`), or stray artifacts at the repo root (e.g. an unreferenced `demo.gif`).
- Pushing works without `gh` auth; if `gh pr create` fails, push the branch and give the user the
  GitHub compare link (`https://github.com/AshutoshSajan/unfollow-guard-extension/compare/dev...<branch>`).

## Dependencies and tools (required)

- **Always use the latest stable release** of every package, runtime and CI action. Do not pin or
  reintroduce older versions.
- Node.js: latest LTS (currently **26.x**, “Lithium”). `.nvmrc` and CI use `lts/*`; `package.json`
  declares `"engines": { "node": ">=26.0.0" }`.
- Run `npm install` after touching `package.json`, commit the regenerated `package-lock.json`, and
  confirm `npm outdated` prints nothing before pushing.
- Dependabot (`.github/dependabot.yml`) opens weekly grouped PRs for npm and GitHub Actions into
  `dev`. Treat those as normal PRs: run the tests, then merge.
- CI (`.github/workflows/ci.yml`) runs `npm ci` + `npm test` on pushes and PRs to `main` and `dev`.
- Prefer the standard library over new dependencies. If a dependency is added, it must be the
  latest stable version and justified.

## Branding rules (required)

- Product name is **Unfollow Guard** in every user-visible string: manifest name/title/command,
  popup, floating button, panel title/aria-labels, console prefix, notifications, debug report,
  CSV/backup filenames and `app` marker, build artifacts, package name, README and artwork.
- Lowercase **“non-followers”** is the concept (accounts that do not follow back) and must stay
  lowercase in prose, scan summaries, comments and code variables (`nonFollowers`).
- **Never rename `NFB`, `nfb_*` storage keys, or `nfb-*` element IDs.** They are the legacy
  namespace kept deliberately for backward compatibility; renaming them orphans every existing
  user's saved scans, keep lists, history and settings. The guard comment at the top of
  `shared.js` documents this and must remain.
- Existing backups and scans continue to import: do not add validation that rejects data based on
  the old `app` marker.
- Regenerate screenshots/demo assets from the live UI after branding or UI changes. Demo fixtures
  must use neutral names (`demo.account`), never a real-looking personal handle.

## Testing (required)

- Run the full suite before every commit:
  ```bash
  npm install
  npm test
  ```
- Tests are jsdom simulations (no network). Each `tests/*.js` file is standalone and prints
  `PASS` / `FAIL` lines; `npm test` chains them and fails on the first failing file.
- Add or update tests for every behavior change. Do not delete or weaken tests to get green.
- When adding a test, follow the existing harness pattern: `JSDOM` with `runScripts: "outside-only"`,
  a `chrome.storage.local` stub, `w.eval()` of `shared.js`, `i18n.js`, the adapter(s) and
  `content.js`, then drive the shadow-root UI and assert on DOM/storage.
- `scripts/screenshots/shoot.js` renders the docs images from the real extension UI with demo data.
  `make-gif.py` needs Pillow; if it is unavailable, rebuild `docs/demo.gif` with the existing
  ffmpeg fallback (frames in `/tmp/nfb-frames/f*.png`, 900 px wide, 128-color palette, keep the
  frame durations from `make-gif.py`). Visually check at least one regenerated screenshot.

## Architecture notes

- Manifest V3 Chromium extension, no build step to run it: edit files and reload at
  `chrome://extensions`.
- `content.js` is the in-page panel UI (shadow DOM, tabs, filters, selection, batch loop,
  schedule, stats, tour). `shared.js` holds settings/storage/dialog helpers and shared styles.
  `i18n.js` holds all strings for `en, es, fr, de, pt`; every key must exist in all columns with
  matching placeholders.
- Site support is adapter-based (`instagram.js`, `facebook.js`, `adapters/_template.js`). See
  `docs/ADDING-A-SITE.md`.
- All state is per logged-in account in `chrome.storage.local` under `nfb_<name>_<site>_<accountId>`.
- Safety rails are the point of the project: daily limits, warm-up, protection rules, delays,
  cool-down, stop after repeated failures. Do not remove or bypass them.
- Use in-app dialogs (`ask`, `toast`), never native `alert`/`confirm`.
- The background worker’s `fetch-image` relay is deliberately restricted to CDN picture hosts,
  images only, size-capped, no cookies and no referrer. Never turn it into a general proxy.
- Version bumps: update `manifest.json`, `package.json`, and the README version badge together;
  rebuild the lockfile if dependencies changed.
