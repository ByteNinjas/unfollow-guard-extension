// Direct unit tests for the batch ownership helpers (the runner itself is exercised through the bundle).
import { describe, expect, it } from "vitest";
import { STALE_MS, isFreshForeign, withTimeout } from "../src/content/batch";
import type { RunState } from "../src/types";

const run = (owner: string, beat: number): RunState => ({ owner, beat, queue: [], idx: 0, done: 0 });

describe("isFreshForeign", () => {
  it("ignores missing runs and runs owned by this tab", () => {
    expect(isFreshForeign(null, "me")).toBe(false);
    expect(isFreshForeign(run("me", Date.now()), "me")).toBe(false);
  });

  it("treats a recently heartbeating run from another tab as fresh", () => {
    const now = 1_000_000;
    expect(isFreshForeign(run("other", now), "me", now)).toBe(true);
    expect(isFreshForeign(run("other", now - STALE_MS + 1), "me", now)).toBe(true);
  });

  it("lets this tab replace a stale run", () => {
    const now = 1_000_000;
    expect(isFreshForeign(run("other", now - STALE_MS), "me", now)).toBe(false);
    expect(isFreshForeign(run("other", 0), "me", now)).toBe(false);
  });
});

describe("withTimeout", () => {
  it("passes through a value that arrives in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("rejects when the promise takes too long", async () => {
    await expect(withTimeout(new Promise(() => {}), 5)).rejects.toThrow("Timed out");
  });

  it("keeps the original rejection", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 50)).rejects.toThrow("boom");
  });
});
