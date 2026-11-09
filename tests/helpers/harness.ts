import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function readBundle(name: string): string {
  return fs.readFileSync(path.join(root, "dist/test", name), "utf8");
}

export function readSource(...parts: string[]): string {
  return fs.readFileSync(path.join(root, ...parts), "utf8");
}

export function checks() {
  const failures: string[] = [];
  return {
    ok(name: string, cond: unknown, extra?: unknown) {
      if (!cond) failures.push(name + (extra !== undefined && extra !== "" ? ` — ${extra}` : ""));
    },
    finish() {
      expect(failures, failures.join("\n")).toEqual([]);
    },
  };
}

export function closeDoms(doms: Array<{ window: Window & typeof globalThis }>) {
  for (const d of doms) {
    try { (d.window as any).close(); } catch {}
  }
}
