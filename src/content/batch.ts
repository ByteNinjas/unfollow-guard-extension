// Batch execution: the resumable unfollow loop, its per-tab ownership lease and the cross-tab guard.
// The panel keeps all UI state; this module only receives accessors so the safety logic can be tested
// and reviewed on its own.
import { NFB } from "../shared";
import type { Adapter, RunState, Settings, User } from "../types";

export interface BatchCapInfo {
  cap: number;
  used: number;
  base?: number;
  warm?: number | null;
}

export interface BatchState {
  users: User[];
  selected: Set<string>;
  gone: Set<string>;
  hist: Array<User & { at?: number; refollowed?: boolean }>;
  failed: Record<string, string>;
  safety: Settings;
  capInfo: BatchCapInfo;
  coolUntil: number;
  runNextAt: number;
  tab: string;
}

export interface BatchUi {
  drawRun(run: RunState, mode: "wait" | "open" | "work", u?: User): void;
  banner(o: {
    user: User | RunState["last"] | null;
    title: string;
    sub?: string;
    pct?: number;
    tone?: string;
    spin?: boolean;
  }): void;
  finishBanner(msg: string, run: RunState | null, tone?: string): void;
  setRunning(on: boolean): void;
  setStatus(msg: string): void;
  log(msg: string, name?: string): void;
  toast(msg: string): void;
  notify(title: string, msg: string): void;
  derive(): void;
  refreshRow(u: User): void;
  removeFromList(pk: string): void;
  dropUnavailable(u: User, why?: string): Promise<void>;
  refreshCap(): Promise<void>;
  maxSel(): number;
}

export interface BatchKeys {
  run: string;
  stop: string;
  day: string;
  cool: string;
  gone: string;
  sel: string;
  hist: string;
  fail: string;
}

export interface BatchDeps {
  state: BatchState;
  ui: BatchUi;
  adapter: Adapter;
  keys: BatchKeys;
  owner: string;
}

/** A fresh run owned by another tab; older runs are stale and may be replaced. */
export const STALE_MS = 5 * 60 * 1000;
const START_LOCK = "nfb-start-";

class TakenOverError extends Error {
  takenOver = true;
}

export function isFreshForeign(run: RunState | null, owner: string, now = Date.now()) {
  return !!run && run.owner !== owner && now - (run.beat || 0) < STALE_MS;
}

export function createBatchRunner({ state, ui, adapter: A, keys, owner: OWNER }: BatchDeps) {
  const { run: runKey, stop: stopKey, day: dayKey, cool: coolKey, gone: goneKey, sel: selKey, hist: histKey, fail: failKey } = keys;
  let running = false;
  let stop = false;

  // The browser-click adapter calls this during waits and clicks so Stop works even mid-step.
  NFB.shouldStop = () => stop;

  const loadRun = async (): Promise<RunState | null> =>
    (await chrome.storage.local.get<Record<string, unknown>>(runKey))[runKey] as RunState | null || null;
  const saveRun = (run: RunState) => {
    run.beat = Date.now();
    return chrome.storage.local.set({ [runKey]: run });
  };
  // Only the owner may patch the run. A foreign owner means another tab took over: throw instead of
  // overwriting its queue, and never touch its stop flag.
  const patchRun = async (patch: Partial<RunState>): Promise<RunState | null> => {
    const run = await loadRun();
    if (!run) return null;
    if (run.owner !== OWNER) throw new TakenOverError();
    Object.assign(run, patch);
    await saveRun(run);
    return run;
  };
  const ownsRun = async () => {
    const run = await loadRun();
    return !!run && run.owner === OWNER;
  };
  const endRunIfOwner = async () => {
    const run = await loadRun();
    if (run && run.owner === OWNER) await chrome.storage.local.remove(runKey);
  };
  const samePage = (url: string) => {
    try {
      const path = (value: string) => new URL(value, location.href).pathname.replace(/\/+$/, "").toLowerCase();
      return path(url) === path(location.href);
    } catch {
      return true;
    }
  };
  // Sleeps in short steps so Stop and a foreign takeover are noticed quickly.
  const sleepStop = async (ms: number) => {
    const started = Date.now();
    while (Date.now() - started < ms && !stop) {
      if (!(await ownsRun())) throw new TakenOverError();
      await NFB.sleep(Math.min(500, ms));
    }
  };

  async function runLoop() {
    if (running) return;
    let run = await loadRun();
    if (!run || run.owner !== OWNER) return;
    stop = !!(await chrome.storage.local.get<Record<string, unknown>>(stopKey))[stopKey];
    running = true;
    ui.setRunning(true);
    if (run.last && run.nextAt) ui.drawRun(run, "wait");
    let endMsg = "";
    let tone = "ok";

    try {
      while (true) {
        run = await loadRun();
        // Ownership is re-checked on every step: another tab may have started its own batch.
        if (!run) {
          endMsg = "Batch ended";
          tone = "warn";
          break;
        }
        if (run.owner !== OWNER) {
          endMsg = NFB.t("rc_taken_over");
          tone = "warn";
          break;
        }
        if (stop) {
          endMsg = NFB.t("rc_stopped");
          tone = "warn";
          break;
        }
        if (run.idx >= run.queue.length) {
          const pending = run.retry || [];
          if (!run.retried && pending.length) {
            // Second pass over the accounts that failed.
            run = (await patchRun({ queue: pending, idx: 0, retry: [], retried: true })) || run;
            ui.log(`Retrying ${pending.length} account(s) that failed`);
            continue;
          }
          endMsg = pending.length ? NFB.t("rc_finished_f", { n: run.done, f: pending.length }) : NFB.t("rc_finished", { n: run.done });
          if (pending.length) tone = "warn";
          break;
        }
        const settings = (await NFB.getSettings()) as Settings;
        const s: Settings = run.forceUI ? { ...settings, igMethod: "ui" } : settings;

        // Wait out the delay since the previous unfollow (also works across page loads).
        let ticks = 0;
        while (run.nextAt && Date.now() < run.nextAt && !stop) {
          state.runNextAt = run.nextAt;
          ui.drawRun(run, "wait");
          await NFB.sleep(500);
          if (!(await ownsRun())) throw new TakenOverError();
          if (++ticks % 30 === 0) run = (await patchRun({})) || run;
        }
        state.runNextAt = 0;
        if (stop) {
          endMsg = NFB.t("rc_stopped");
          tone = "warn";
          break;
        }

        // Active hours: wait until the window opens (the tab has to stay open).
        {
          let current = settings;
          let waited = 0;
          while (!NFB.inActiveHours(current) && !stop) {
            ui.banner({
              user: run.last || null,
              title: NFB.t("rc_paused"),
              sub: NFB.t("rc_resumes", { from: current.activeFrom, t: NFB.fmtHM(NFB.msToActiveStart(current)) }),
              pct: run.total ? (run.done / run.total) * 100 : 0,
              tone: "warn",
            });
            await NFB.sleep(1000);
            if (!(await ownsRun())) throw new TakenOverError();
            if (++waited % 15 === 0) {
              run = (await patchRun({})) || run;
              current = (await NFB.getSettings()) as Settings;
            }
          }
        }
        if (stop) {
          endMsg = NFB.t("rc_stopped");
          tone = "warn";
          break;
        }

        await ui.refreshCap();
        if (ui.maxSel() <= 0) {
          endMsg = NFB.t("rc_cap", { n: state.capInfo.cap });
          tone = "warn";
          break;
        }

        const queued = run.queue[run.idx];
        let u: User = { ...(state.users.find((x) => x.pk === queued.pk) || {}), ...queued } as User;

        // Browser-click method: look the account up first. A renamed account is opened under its new name; a
        // removed or banned one is skipped at once instead of waiting for a profile page that will never load.
        if (A.resolve && A.navigateTo && A.navigateTo(u, s) && run.navFor !== run.idx) {
          let resolved: { gone?: boolean; username?: string } = {};
          let lookupError: { fatal?: boolean; block?: boolean; message?: string } | null = null;
          try {
            resolved = await A.resolve(u);
          } catch (error) {
            lookupError = error as { fatal?: boolean; block?: boolean; message?: string };
          }
          if (lookupError?.fatal) {
            endMsg = `Stopped: ${lookupError.message}`;
            tone = "warn";
            if (lookupError.block && s.cooldownHours > 0) {
              state.coolUntil = Date.now() + s.cooldownHours * 3600000;
              await chrome.storage.local.set({ [coolKey]: state.coolUntil });
              endMsg += ` Cool-down started: unfollowing is paused for ${s.cooldownHours}h.`;
            }
            break;
          }
          if (resolved.gone) {
            await ui.dropUnavailable(u);
            const moreAfter = run.idx + 1 < run.queue.length || (!run.retried && (run.retry || []).length > 0);
            run = (await patchRun({ idx: run.idx + 1, nextAt: moreAfter ? Date.now() + (NFB.skipDelay != null ? NFB.skipDelay : 1500) : 0 })) || run;
            continue;
          }
          if (resolved.username && resolved.username !== u.username) {
            ui.log(`↻ ${u.username} is now @${resolved.username}`, u.username);
            const queue = run.queue.slice();
            queue[run.idx] = { ...queue[run.idx], username: resolved.username };
            run = (await patchRun({ queue })) || run;
            const real = state.users.find((x) => x.pk === u.pk);
            if (real) real.username = resolved.username;
            u = { ...u, username: resolved.username };
          }
        }

        // Browser-click method: go to the account's profile first (the page reloads and this loop resumes there).
        const target = A.navigateTo ? A.navigateTo(u, s) : null;
        if (target && !samePage(target) && run.navFor !== run.idx) {
          await patchRun({ navFor: run.idx });
          ui.drawRun(run, "open", u);
          location.assign(target);
          return;
        }

        ui.drawRun(run, "work", u);
        if (target) await sleepStop(NFB.rand(2000, 4000));
        if (stop) {
          endMsg = NFB.t("rc_stopped");
          tone = "warn";
          break;
        }

        let ok = false;
        let errMsg = "";
        let fatal = false;
        let blocked = false;
        let skip = false;
        try {
          await withTimeout(A.unfollow(u, s), NFB.unfollowTimeout || 90000); // never wait forever for one account
          ok = true;
          ui.log(`✓ ${u.username} unfollowed`, u.username);
        } catch (error) {
          const e = error as { stopped?: boolean; message?: string; useUI?: boolean; fatal?: boolean; block?: boolean; skip?: boolean };
          if (e.stopped) {
            endMsg = NFB.t("rc_stopped");
            tone = "warn";
            break;
          }
          errMsg = e.message || String(error);
          ui.log(`✗ ${u.username} — ${errMsg}`, u.username);
          if (e.useUI && !run.forceUI) {
            await patchRun({ forceUI: true });
            ui.log("Direct API was rejected: switching to browser clicks for the rest of this batch");
            continue; // retry this same account with the browser-click method
          }
          fatal = !!e.fatal;
          blocked = !!e.block;
          skip = !!e.skip;
        }

        const fails = ok ? 0 : skip ? run.fails || 0 : (run.fails || 0) + 1; // a missing account isn't a sign the batch is failing
        if (!ok && (fatal || fails >= 3)) {
          run = (await patchRun({ last: { username: u.username, pic: u.pic || "", ok: false } })) || run;
          endMsg = fatal ? `Stopped: ${errMsg}` : `Stopped after 3 failures in a row: ${errMsg}`;
          tone = "warn";
          if (blocked && s.cooldownHours > 0) {
            state.coolUntil = Date.now() + s.cooldownHours * 3600000;
            await chrome.storage.local.set({ [coolKey]: state.coolUntil });
            endMsg += ` Cool-down started: unfollowing is paused for ${s.cooldownHours}h.`;
          }
          break;
        }
        if (ok) {
          await NFB.bumpDaily(dayKey);
          state.users = state.users.filter((x) => x.pk !== u.pk);
          state.selected.delete(u.pk);
          state.gone.add(u.pk);
          state.hist.push({ pk: u.pk, username: u.username, full_name: u.full_name || "", pic: u.pic || "", at: Date.now() });
          if (state.hist.length > 5000) state.hist = state.hist.slice(-5000);
          ui.derive();
          delete state.failed[u.pk];
          if (state.tab === "todo") ui.removeFromList(u.pk);
          await chrome.storage.local.set({
            [goneKey]: [...state.gone],
            [selKey]: [...state.selected],
            [histKey]: state.hist,
            [failKey]: state.failed,
          });
          await ui.refreshCap();
        } else if (skip) {
          await ui.dropUnavailable(u);
        } else {
          // Stays in the list, marked, and is tried once more after this pass.
          state.failed[u.pk] = errMsg;
          await chrome.storage.local.set({ [failKey]: state.failed });
          if (state.tab === "todo") ui.refreshRow(u);
        }
        const retry = !ok && !skip
          ? (run.retry || []).concat({ pk: u.pk, username: u.username, full_name: u.full_name || "", pic: u.pic || "" })
          : run.retry || [];
        const nextIdx = run.idx + 1;
        const more = nextIdx < run.queue.length || (!run.retried && retry.length > 0);
        const nextAt = more ? Date.now() + Math.round(NFB.rand(s.minDelay, s.maxDelay)) * 1000 : 0;
        run = (await patchRun({
          idx: nextIdx,
          done: run.done + (ok ? 1 : 0),
          fails,
          nextAt,
          retry,
          last: { username: u.username, pic: u.pic || "", ok },
        })) || run;
      }
    } catch (error) {
      if (error && (error as { takenOver?: boolean }).takenOver) {
        endMsg = NFB.t("rc_taken_over");
      } else {
        endMsg = "Error: " + (error as { message?: string }).message;
        ui.log(endMsg);
      }
      tone = "warn";
    }

    const finalRun = await loadRun();
    const ownsFinal = !!finalRun && finalRun.owner === OWNER;
    ui.log(endMsg);
    if (ownsFinal) {
      await chrome.storage.local.remove(runKey);
      await chrome.storage.local.remove(stopKey);
    }
    const byUser = endMsg === NFB.t("rc_stopped") || endMsg === NFB.t("rc_taken_over");
    stop = false;
    running = false;
    state.runNextAt = 0;
    ui.setRunning(false);
    ui.finishBanner(endMsg, ownsFinal ? finalRun : null, tone);
    ui.setStatus(endMsg);
    if (ownsFinal && finalRun && !byUser && (finalRun.done > 0 || tone === "warn")) {
      ui.notify(tone === "ok" ? NFB.t("nf_finished") : NFB.t("nf_stopped"), `${endMsg} (${finalRun.done}/${finalRun.total})`);
    }
  }

  async function startBatch(chosen: User[], auto: boolean): Promise<"started" | "busy"> {
    const existing = await loadRun();
    if (isFreshForeign(existing, OWNER)) return "busy";
    await chrome.storage.local.remove(stopKey);
    stop = false;
    await saveRun({
      owner: OWNER,
      queue: chosen.map((u) => ({ pk: u.pk, username: u.username, full_name: u.full_name || "", pic: u.pic || "" })),
      idx: 0,
      done: 0,
      fails: 0,
      total: chosen.length,
      nextAt: 0,
      navFor: -1,
      forceUI: false,
      last: null,
    });
    ui.log(`${auto ? "Starting scheduled batch" : "Starting batch"} of ${chosen.length}`);
    void runLoop();
    return "started";
  }

  async function beginBatch(chosen: User[], auto = false): Promise<boolean> {
    if (running) return false;
    // Web Locks serialise the check-and-start between tabs; storage ownership then covers the whole run
    // (the lease can outlive a page navigation, which a Web Lock cannot).
    const locks = (navigator as unknown as { locks?: LockManager }).locks;
    let result: "started" | "busy" = "busy";
    if (locks && typeof locks.request === "function") {
      try {
        await locks.request(START_LOCK + dayKey, { ifAvailable: true }, async (lock) => {
          if (lock) result = await startBatch(chosen, auto);
        });
      } catch {
        result = await startBatch(chosen, auto);
      }
    } else {
      result = await startBatch(chosen, auto);
    }
    if (result === "busy") ui.toast(NFB.t("run_busy"));
    return result === "started";
  }

  // Called on init: only the owner resumes. A foreign stale run is left alone; a fresh foreign run is
  // somebody else's live batch. An owner's stale/disabled run is cleaned up.
  async function resume(enabled: boolean) {
    const run = await loadRun();
    if (!run) return;
    const fresh = Date.now() - (run.beat || 0) < STALE_MS;
    if (run.owner === OWNER && fresh && enabled) void runLoop();
    else if (run.owner === OWNER && (!fresh || !enabled)) await endRunIfOwner();
  }

  const requestStop = async (persist = true) => {
    stop = true;
    if (persist) await chrome.storage.local.set({ [stopKey]: Date.now() });
  };

  return {
    runLoop,
    beginBatch,
    resume,
    loadRun,
    endRunIfOwner,
    requestStop,
    isRunning: () => running,
    owner: OWNER,
    STALE_MS,
  };
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("Timed out"), { timeout: true })), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
