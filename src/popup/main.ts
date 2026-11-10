// NOTE: don't name top-level variables `top`, `name`, `status`… they clash with window properties and break the whole script.
import { NFB } from "../shared";

(() => {
  const css = document.createElement("style");
  css.textContent = NFB.themeCSS + NFB.uiCSS + NFB.settingsCSS;
  document.head.append(css);
  const settings = document.getElementById("settings");
  if (settings) settings.innerHTML = NFB.settingsHTML;
  NFB.watchTheme(document.getElementById("app"));

  const toggle = document.getElementById("enabledTop") as HTMLInputElement | null;
  const stateText = document.getElementById("state");
  const showEnabled = (on: boolean) => {
    if (toggle) toggle.checked = on;
    if (stateText) stateText.textContent = on ? "Enabled · floating button is shown" : "Disabled · floating button is hidden";
  };
  toggle?.addEventListener("change", () => chrome.storage.local.set({ enabled: !!toggle.checked }));
  chrome.storage.onChanged.addListener((ch) => { if (ch.enabled) showEnabled(!!ch.enabled.newValue); });
  NFB.getSettings().then((s: any) => showEnabled(!!s.enabled));

  NFB.migrate().then(() => NFB.bindSettings(document, document.getElementById("modalhost")));
})();
