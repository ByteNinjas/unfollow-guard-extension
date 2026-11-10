// The MAIN-world hook must publish captured request headers with events (never a DOM attribute)
// and must answer a replay request even when nothing changed since its first publish.
import { JSDOM, VirtualConsole } from "jsdom";
import { describe, it } from "vitest";
import { checks, readBundle } from "./helpers/harness.ts";

const hook = readBundle("hook.iife.js");

describe("hook token bridge", () => {
  it("publishes captured headers and replays them on request", async () => {
    const { ok, finish } = checks();
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://www.instagram.com/",
      runScripts: "outside-only",
      virtualConsole: new VirtualConsole(),
    });
    const w = dom.window as any;
    w.Headers = Headers;
    w.fetch = async () => ({ ok: true, json: async () => ({}) });

    const received: string[] = [];
    w.document.addEventListener("nfb:tokens", (e: any) => received.push(e.detail));
    w.eval(hook);

    await w.fetch("/api/v1/friendships/1/following/", { headers: { "x-ig-app-id": "123" } });
    ok("headers are never written to a DOM attribute", !w.document.documentElement.hasAttribute("data-nfb"));

    const beforeReplay = received.length;
    w.document.dispatchEvent(new w.CustomEvent("nfb:tokens-request"));
    ok("a replay request always answers, even when nothing changed", received.length === beforeReplay + 1, `${beforeReplay} -> ${received.length}`);
    ok("the replay carries the captured header", JSON.parse(received[received.length - 1])["x-ig-app-id"] === "123", received[received.length - 1]);

    dom.window.close();
    finish();
  });
});
