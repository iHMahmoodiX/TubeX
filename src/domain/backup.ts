// Backup file format. Bump BACKUP_FORMAT only with a migration in migrateBackup().
import { COLLECTIONS, nowIso } from './models';
import type { CollectionName, Collections } from './models';
import { sanitizeRecord } from './records';

export const BACKUP_APP = 'tubex';
export const BACKUP_FORMAT = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS_PER_COLLECTION = 20_000;

export type BackupData = { [K in CollectionName]: Collections[K][] };

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  appVersion: string;
  data: BackupData;
}

export function emptyData(): BackupData {
  return { profiles: [], ideas: [], drafts: [], templates: [], keywordLists: [], watchlist: [], replies: [] };
}

export function createBackup(data: BackupData, appVersion: string): BackupFile {
  return { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: nowIso(), appVersion, data };
}

export type ImportError = 'too-large' | 'not-json' | 'not-tubex' | 'newer-format' | 'bad-shape';

export interface ImportPreview {
  ok: true;
  format: number;
  exportedAt?: string;
  data: BackupData;
  /** Records that failed validation and will not be imported, per collection. */
  rejected: Record<CollectionName, number>;
}

/** Upgrades older backup formats to the current shape. Format 1 is the first format. */
function migrateBackup(obj: Record<string, unknown>, format: number): Record<string, unknown> {
  // No older formats exist yet. Add `if (format < N) obj = upgradeToN(obj)` steps here.
  void format;
  return obj;
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
  const data = emptyData();
  const rejected = Object.fromEntries(COLLECTIONS.map((c) => [c, 0])) as Record<CollectionName, number>;
  for (const name of COLLECTIONS) {
    const list = (rawData as Record<string, unknown>)[name];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length > MAX_RECORDS_PER_COLLECTION) return { ok: false, error: 'bad-shape' };
    const seen = new Set<string>();
    for (const raw of list) {
      const rec = sanitizeRecord(name, raw);
      if (!rec || seen.has(rec.id)) {
        rejected[name]++;
        continue;
      }
      seen.add(rec.id);
      (data[name] as unknown[]).push(rec);
    }
  }
  const exportedAt = typeof obj.exportedAt === 'string' ? obj.exportedAt : undefined;
  return { ok: true, format, exportedAt, data, rejected };
}

export function countRecords(data: BackupData): number {
  return COLLECTIONS.reduce((n, c) => n + data[c].length, 0);
}
