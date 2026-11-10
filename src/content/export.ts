// CSV / JSON export and kept-list import. CSV cells are escaped against spreadsheet formula injection.
import type { Adapter, Lists, TagEntry, User } from "../types";

export interface ExportState {
  get users(): User[];
  set users(value: User[]);
  get keep(): Record<string, User>;
  get tags(): Record<string, TagEntry>;
  get selected(): Set<string>;
  get lists(): Lists | null;
  get hist(): Array<User & { at?: number; refollowed?: boolean }>;
}

export interface ExportUi {
  toast(msg: string): void;
  tr(key: string, vars?: Record<string, unknown>): string;
  renderList(): void;
  saveKeep(): void;
  saveTags(): void;
  saveSel(): void;
  slimKeep(u: User): User;
  tagOf(u: User): string;
  tagLabel(id: string): string;
  itemsFor(tab: string): User[];
}

export interface ExportDeps {
  adapter: Adapter;
  account: string;
  state: ExportState;
  ui: ExportUi;
  tagIds: string[];
}

const MAX_IMPORT_ENTRIES = 50000;

// A leading = + - @ (or tab/CR) makes spreadsheet programs treat a cell as a formula. Prefixing an
// apostrophe keeps the visible text and stops execution.
export function sanitizeCsvCell(value: unknown): string {
  const text = String(value == null ? "" : value);
  return /^[\s]*[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

export function csvCell(value: unknown): string {
  return `"${sanitizeCsvCell(value).replace(/"/g, '""')}"`;
}

// Imported keys become object keys (tags, keep). `__proto__`, `constructor` and `prototype` would
// mutate the prototype chain instead of storing an entry, so they are rejected outright.
export function isSafeKey(key: unknown): boolean {
  const k = String(key == null ? "" : key);
  return !!k && k !== "__proto__" && k !== "prototype" && k !== "constructor";
}

export function createExportTools({ adapter: A, account: ACCT, state, ui, tagIds }: ExportDeps) {
  const download = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  const iso = (t: unknown) => new Date(Number(t) || 0).toISOString();

  function exportCsv(tab: string) {
    const items = ui.itemsFor(tab);
    if (!items.length) return ui.toast(ui.tr("ts_nothing"));
    const extra: Array<(u: User) => unknown> = tab === "history"
      ? [(u) => iso(u.at), (u) => ((u as { refollowed?: boolean }).refollowed ? "yes" : "no")]
      : tab === "changes"
        ? [(u) => u.type, (u) => iso(u.at)]
        : [];
    const head = ["username", "full_name", "profile_url", "label", "note", ...(tab === "history" ? ["unfollowed_at", "re_followed"] : tab === "changes" ? ["change", "at"] : [])];
    const lines = [head.map(csvCell).join(",")].concat(
      items.map((u) => [u.username, u.full_name || "", A.profileUrl(u), ui.tagOf(u) ? ui.tagLabel(ui.tagOf(u)) : "", (state.tags[u.pk] && state.tags[u.pk].note) || "", ...extra.map((f) => f(u))].map(csvCell).join(",")),
    );
    download(`unfollow-guard-${A.id}-${tab}.csv`, "\ufeff" + lines.join("\r\n"), "text/csv");
    ui.toast(ui.tr("ts_exported", { n: items.length }));
  }

  function exportJson() {
    const kept = Object.values(state.keep).map((u) => ({ ...ui.slimKeep(u), tag: ui.tagOf(u), note: (state.tags[u.pk] && state.tags[u.pk].note) || "" }));
    if (!kept.length) return ui.toast(ui.tr("ts_nothing"));
    const data = { app: "unfollow-guard", version: 2, platform: A.id, account: ACCT, exportedAt: new Date().toISOString(), kept };
    download(`unfollow-guard-${A.id}-kept-backup.json`, JSON.stringify(data, null, 2), "application/json");
    ui.toast(ui.tr("ts_exported", { n: kept.length }));
  }

  const readText = (f: File) => (f.text
    ? f.text()
    : new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsText(f);
    }));

  function importKept(text: string) {
    let entries: Array<Partial<User> & { username?: string; tag?: string; note?: string }> = [];
    try {
      const j = JSON.parse(text);
      const arr = Array.isArray(j) ? j : j && Array.isArray(j.kept) ? j.kept : j && Array.isArray(j.users) ? j.users : [];
      entries = arr.slice(0, MAX_IMPORT_ENTRIES)
        .map((x: unknown) => (typeof x === "string" ? { username: x } : x && typeof x === "object" ? x as Partial<User> : null))
        .filter(Boolean) as typeof entries;
    } catch {
      entries = text.split(/[\r\n,;]+/).slice(0, MAX_IMPORT_ENTRIES)
        .map((x) => x.trim().replace(/^"|"$/g, "").replace(/^@/, ""))
        .filter((x) => x && !/^(username|user|name)$/i.test(x))
        .map((x) => ({ username: x }));
    }
    if (!entries.length) return ui.toast(ui.tr("ts_import_none"));
    const byName = new Map<string, User>();
    [...state.users, ...Object.values(state.keep), ...((state.lists && state.lists.following) || []), ...state.hist].forEach((u) => {
      if (u && u.username) byName.set(String(u.username).toLowerCase(), u);
    });
    let added = 0, missing = 0;
    entries.forEach((e) => {
      const found = e.pk ? e as User : byName.get(String(e.username || "").toLowerCase());
      if (!found || !found.pk || !isSafeKey(found.pk)) { missing++; return; }
      if (e.tag || e.note) state.tags[found.pk] = { tag: tagIds.includes(e.tag || "") ? e.tag : "", note: String(e.note || "").slice(0, 200) };
      if (state.keep[found.pk]) return;
      state.keep[found.pk] = ui.slimKeep(found);
      state.selected.delete(found.pk);
      added++;
    });
    state.users = state.users.filter((x) => !state.keep[x.pk]);
    ui.saveKeep();
    ui.saveTags();
    ui.saveSel();
    ui.renderList();
    ui.toast(missing ? ui.tr("ts_imported_missing", { n: added, m: missing }) : ui.tr("ts_imported", { n: added }));
  }

  return { exportCsv, exportJson, importKept, readText };
}
