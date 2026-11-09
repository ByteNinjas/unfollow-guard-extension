// Domain types shared by the extension modules.

export type PlatformId = "instagram" | "facebook";

export interface Platform {
  id: PlatformId;
  label: string;
  beta?: boolean;
}

export interface User {
  pk: string;
  username: string;
  full_name?: string;
  pic?: string;
  verified?: boolean;
  private?: boolean;
  noPic?: boolean;
  profile_pic_url?: string;
  is_verified?: boolean;
  [key: string]: unknown;
}

export interface ScanRange {
  start?: number;
  end?: number;
  [key: string]: unknown;
}

export interface Scan {
  at: number;
  followers?: number;
  following?: number;
  checked?: number;
  range?: ScanRange | null;
  username?: string;
  users: User[];
  complete?: boolean;
  [key: string]: unknown;
}

export interface Lists {
  at?: number;
  followers: User[];
  following: User[];
  followersComplete?: boolean | null;
  followingComplete?: boolean | null;
  [key: string]: unknown;
}

export interface DailyCounter {
  date: string;
  count: number;
}

export interface DaysCounter {
  n: number;
  last: string;
}

export interface Settings {
  enabled: boolean;
  allowScan_instagram: boolean;
  allowScan_facebook: boolean;
  dailyCap_instagram: number;
  dailyCap_facebook: number;
  minDelay: number;
  maxDelay: number;
  theme: string;
  position: string;
  draggable: boolean;
  igMethod: "api" | "ui";
  cooldownHours: number;
  dayResetTime: string;
  activeEnabled: boolean;
  activeFrom: string;
  activeTo: string;
  protectVerified: boolean;
  protectRecentDays: number;
  warmupEnabled: boolean;
  warmupStart: number;
  warmupStep: number;
  labelFollowing: string;
  labelUnfollow: string;
  lang: string;
  notifyEnabled: boolean;
  scheduleEnabled: boolean;
  scheduleTime: string;
  scheduleCount: number;
  protectPrivate: boolean;
  protectPattern: string;
  protectTagged: boolean;
  [key: string]: unknown;
}

export interface RunItem extends User {
  type?: string;
  at?: number;
}

export interface RunState {
  owner?: string;
  queue: RunItem[];
  idx: number;
  done: number;
  fails?: number;
  retry?: RunItem[];
  retried?: boolean;
  nextAt?: number;
  beat?: number;
  forceUI?: boolean;
  total?: number;
  last?: { username: string; pic: string; ok: boolean };
}

export interface TagEntry {
  tag?: string;
  note?: string;
}

export interface ScanResult {
  scan: Scan;
  lists?: Lists;
  message?: string;
  complete?: boolean;
}

export interface ScanContext {
  setStatus: (text: string) => void;
  prev?: Scan | null;
  opts: Record<string, unknown>;
}

export interface ResolveResult {
  gone?: boolean;
  username?: string;
  full_name?: string;
  pic?: string;
}

export interface Adapter {
  id: PlatformId;
  label: string;
  beta?: boolean;
  supportsStart?: boolean;
  followerDiff?: boolean;
  canSchedule?: boolean;
  match: () => boolean;
  accountId: () => string;
  scan: (ctx: ScanContext) => Promise<ScanResult>;
  unfollow: (u: User, s: Settings) => Promise<void>;
  follow?: (u: User) => Promise<void>;
  resolve?: (u: User) => Promise<ResolveResult>;
  navigateTo?: (u: User, s: Settings) => string | null;
  canScan: (prev?: Scan | null) => boolean;
  cannotScanMessage: (prev?: Scan | null) => string;
  scanLabel: () => string;
  profileUrl: (u: User) => string;
  scanConfirm?: (opts: Record<string, unknown>) => string;
  diagnose?: () => Promise<Array<{ ok: boolean | null; label: string; detail?: string }>>;
  [key: string]: unknown;
}

// The legacy namespace objects are intentionally loose while the UI internals
// are migrated module by module.
export type NFB = Record<string, any>;
