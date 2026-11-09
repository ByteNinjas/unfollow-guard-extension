import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Unfollow Guard",
  version: pkg.version,
  description:
    "See who doesn't follow you back and unfollow safely, slowly and in small batches. Works with Instagram and Facebook.",
  permissions: ["storage", "unlimitedStorage", "notifications"],
  icons: {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  },
  action: {
    default_title: "Unfollow Guard settings",
    default_popup: "src/popup/index.html",
    default_icon: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
    },
  },
  content_scripts: [
    {
      matches: ["https://www.instagram.com/*"],
      js: ["src/hook.iife.ts"],
      run_at: "document_start",
      world: "MAIN",
    },
    {
      matches: ["https://www.instagram.com/*", "https://www.facebook.com/*", "https://web.facebook.com/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  commands: {
    "toggle-panel": {
      suggested_key: { default: "Alt+Shift+N" },
      description: "Show or hide the Unfollow Guard panel",
    },
  },
  host_permissions: ["https://*.cdninstagram.com/*", "https://*.fbcdn.net/*"],
});
