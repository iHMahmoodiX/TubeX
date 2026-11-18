// Backup file format. Bump BACKUP_FORMAT only with a migration in migrateBackup().
// Format 1 (0.1–0.5): records only. Format 2 (0.5.1): optional `settings` section (UI preferences, in-page
// switches, AI provider and YouTube settings, connected channels). Keys are included only when the owner
// ticks the matching box at export; sign-in tokens never are.
import { COLLECTIONS, nowIso } from './models';
import type { CollectionName, Collections, Lang } from './models';
import { checkRecord, type RejectReason } from './records';

export const BACKUP_APP = 'tubex';
export const BACKUP_FORMAT = 2;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS_PER_COLLECTION = 20_000;

export type BackupData = { [K in CollectionName]: Collections[K][] };

/** Connected channel as stored in a backup: identity only, never a token. */
export interface BackupChannel {
  channelId: string;
  title: string;
  handle: string;
  thumbnail?: string;
  uploadsPlaylistId?: string;
  connectedAt: string;
  sub?: string;
}

export interface BackupSettings {
  prefs?: { uiLanguage: Lang; theme: 'system' | 'light' | 'dark'; pageAdapterEnabled: boolean; inpage?: Record<string, boolean> };
  ai?: { enabled: boolean; baseUrl: string; model: string; monthlyRequestCap: number; apiKey?: string };
  youtube?: { region: string; language: string; dailyUnitCap: number; apiKey?: string };
  channels?: BackupChannel[];
  activeChannelId?: string;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  appVersion: string;
  data: BackupData;
  settings?: BackupSettings;
}

export function emptyData(): BackupData {
  return { profiles: [], ideas: [], drafts: [], templates: [], keywordLists: [], watchlist: [], replies: [] };
}

export function createBackup(data: BackupData, appVersion: string, settings?: BackupSettings): BackupFile {
  return { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: nowIso(), appVersion, data, ...(settings && { settings }) };
}

export type ImportError = 'too-large' | 'not-json' | 'not-tubex' | 'newer-format' | 'bad-shape';

export interface ImportPreview {
  ok: true;
  format: number;
  exportedAt?: string;
  appVersion?: string;
  data: BackupData;
  /** Records that failed validation and will not be imported, per collection. */
  rejected: Record<CollectionName, number>;
  /** The same, split by reason. */
  reasons: Record<CollectionName, Partial<Record<RejectReason, number>>>;
  settings?: BackupSettings;
}

/** Upgrades older backup formats to the current shape, one step per format. */
export function migrateBackup(obj: Record<string, unknown>, format: number): Record<string, unknown> {
  let o = obj;
  // 1 → 2: the settings section was added. A format-1 file has none; anything under that name is ignored.
  if (format < 2) {
    const { settings: _ignored, ...rest } = o;
    void _ignored;
    o = { ...rest, format: 2 };
  }
  return o;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length <= max ? v.trim() : undefined);
const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined);

function coerceChannel(c: unknown): BackupChannel | null {
  if (!isObj(c) || typeof c.channelId !== 'string' || !/^UC[\w-]{22}$/.test(c.channelId)) return null;
  const thumb = text(c.thumbnail, 2048);
  const uploads = text(c.uploadsPlaylistId, 64);
  const sub = text(c.sub, 128);
  return {
    channelId: c.channelId,
    title: text(c.title, 200) ?? '',
    handle: text(c.handle, 200) ?? '',
    connectedAt: text(c.connectedAt, 40) ?? '',
    ...(thumb?.startsWith('https://') && { thumbnail: thumb }),
    ...(uploads && /^[\w-]{2,64}$/.test(uploads) && { uploadsPlaylistId: uploads }),
    ...(sub && /^[\w.-]{1,128}$/.test(sub) && { sub }),
  };
}

/** Validates a settings section; unknown or broken parts are dropped, never guessed. */
export function coerceBackupSettings(raw: unknown): BackupSettings | undefined {
  if (!isObj(raw)) return undefined;
  const out: BackupSettings = {};
  const p = raw.prefs;
  if (isObj(p)) {
    const inpage = isObj(p.inpage)
      ? Object.fromEntries(Object.entries(p.inpage).filter(([k, v]) => k.length < 40 && typeof v === 'boolean') as [string, boolean][])
      : undefined;
    out.prefs = {
      uiLanguage: p.uiLanguage === 'en' ? 'en' : 'fa',
      theme: p.theme === 'light' || p.theme === 'system' ? p.theme : 'dark',
      pageAdapterEnabled: p.pageAdapterEnabled !== false,
      ...(inpage && { inpage }),
    };
  }
  const a = raw.ai;
  if (isObj(a)) {
    const baseUrl = text(a.baseUrl, 500);
    const key = text(a.apiKey, 500);
    out.ai = {
      enabled: a.enabled === true,
      baseUrl: baseUrl && /^https?:\/\//.test(baseUrl) ? baseUrl.replace(/\/+$/, '') : '',
      model: text(a.model, 200) ?? '',
      monthlyRequestCap: count(a.monthlyRequestCap) ?? 1000,
      ...(key && { apiKey: key }),
    };
  }
  const y = raw.youtube;
  if (isObj(y)) {
    const key = text(y.apiKey, 500);
    out.youtube = {
      region: /^[A-Z]{2}$/.test(String(y.region)) ? String(y.region) : 'US',
      language: /^[a-z]{2,3}$/.test(String(y.language)) ? String(y.language) : 'fa',
      dailyUnitCap: count(y.dailyUnitCap) ?? 8000,
      ...(key && { apiKey: key }),
    };
  }
  if (Array.isArray(raw.channels)) {
    out.channels = raw.channels
      .slice(0, 50)
      .map(coerceChannel)
      .filter((c): c is BackupChannel => !!c);
    if (typeof raw.activeChannelId === 'string' && out.channels.some((c) => c.channelId === raw.activeChannelId)) out.activeChannelId = raw.activeChannelId;
  }
  return Object.keys(out).length ? out : undefined;
}

export function parseBackup(text: string): ImportPreview | { ok: false; error: ImportError } {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) return { ok: false, error: 'too-large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, error: 'not-tubex' };
  let obj = parsed as Record<string, unknown>;
  if (obj.app !== BACKUP_APP) return { ok: false, error: 'not-tubex' };
  const format = obj.format;
  if (typeof format !== 'number' || !Number.isInteger(format) || format < 1) return { ok: false, error: 'bad-shape' };
  if (format > BACKUP_FORMAT) return { ok: false, error: 'newer-format' };
  obj = migrateBackup(obj, format);

  const rawData = obj.data;
  if (typeof rawData !== 'object' || rawData === null || Array.isArray(rawData)) return { ok: false, error: 'bad-shape' };
  const exportedAt = typeof obj.exportedAt === 'string' && !Number.isNaN(Date.parse(obj.exportedAt)) ? obj.exportedAt : undefined;
  const data = emptyData();
  const rejected = Object.fromEntries(COLLECTIONS.map((c) => [c, 0])) as Record<CollectionName, number>;
  const reasons = Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as ImportPreview['reasons'];
  for (const name of COLLECTIONS) {
    const list = (rawData as Record<string, unknown>)[name];
    if (list === undefined || list === null) continue;
    if (!Array.isArray(list) || list.length > MAX_RECORDS_PER_COLLECTION) return { ok: false, error: 'bad-shape' };
    const seen = new Set<string>();
    for (const raw of list) {
      const r = checkRecord(name, raw, { fallbackDate: exportedAt });
      const reason: RejectReason | null = !r.ok ? r.reason : seen.has(r.record.id) ? 'duplicate' : null;
      if (reason || !r.ok) {
        rejected[name]++;
        const why = reason ?? 'bad-field';
        reasons[name][why] = (reasons[name][why] ?? 0) + 1;
        continue;
      }
      seen.add(r.record.id);
      (data[name] as unknown[]).push(r.record);
    }
  }
  const appVersion = typeof obj.appVersion === 'string' ? obj.appVersion.slice(0, 20) : undefined;
  const settings = coerceBackupSettings(obj.settings);
  return { ok: true, format, exportedAt, appVersion, data, rejected, reasons, ...(settings && { settings }) };
}

export function countRecords(data: BackupData): number {
  return COLLECTIONS.reduce((n, c) => n + data[c].length, 0);
}
