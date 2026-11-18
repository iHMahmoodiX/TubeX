// Reads and restores the optional "settings" section of a backup (format 2). Keys are written to the file
// only when the owner ticks the matching box, and restored only when the file has them. Sign-in tokens are
// never part of a backup: restored channels sign in again with one Reconnect click.
import type { BackupSettings } from '../../domain/backup';
import { loadGoogleState, mergeChannels, setActiveChannel } from '../../integrations/google/auth';
import { loadIntegrations, saveIntegrations } from '../../storage/integrations';
import { loadPrefs, updatePrefs } from '../../storage/prefs';

export interface SettingsExportOptions {
  includeAiKey: boolean;
  includeYtKey: boolean;
}

export async function collectSettings(o: SettingsExportOptions): Promise<BackupSettings> {
  const [p, i, g] = await Promise.all([loadPrefs(), loadIntegrations(), loadGoogleState()]);
  return {
    prefs: { uiLanguage: p.uiLanguage, theme: p.theme, pageAdapterEnabled: p.pageAdapterEnabled, ...(p.inpage && { inpage: p.inpage }) },
    ai: {
      enabled: i.ai.enabled,
      baseUrl: i.ai.baseUrl,
      model: i.ai.model,
      monthlyRequestCap: i.ai.monthlyRequestCap,
      ...(o.includeAiKey && i.ai.apiKey && { apiKey: i.ai.apiKey }),
    },
    youtube: {
      region: i.youtube.region,
      language: i.youtube.language,
      dailyUnitCap: i.youtube.dailyUnitCap,
      ...(o.includeYtKey && i.youtube.apiKey && { apiKey: i.youtube.apiKey }),
    },
    channels: g.channels.map((c) => ({
      channelId: c.channelId,
      title: c.title,
      handle: c.handle,
      connectedAt: c.connectedAt,
      ...(c.thumbnail && { thumbnail: c.thumbnail }),
      ...(c.uploadsPlaylistId && { uploadsPlaylistId: c.uploadsPlaylistId }),
      ...(c.sub && { sub: c.sub }),
    })),
    ...(g.activeChannelId && { activeChannelId: g.activeChannelId }),
  };
}

export interface SettingsRestoreResult {
  prefs: boolean;
  ai: boolean;
  youtube: boolean;
  keys: number;
  channelsAdded: number;
}

/** Applies a validated settings section. Keys already in this browser are kept when the file has none. */
export async function restoreSettings(s: BackupSettings): Promise<SettingsRestoreResult> {
  const r: SettingsRestoreResult = { prefs: false, ai: false, youtube: false, keys: 0, channelsAdded: 0 };
  if (s.prefs) {
    const cur = await loadPrefs();
    await updatePrefs({ ...s.prefs, inpage: s.prefs.inpage ?? cur.inpage });
    r.prefs = true;
  }
  if (s.ai || s.youtube) {
    const cur = await loadIntegrations();
    const ai = s.ai ? { ...cur.ai, ...s.ai, baseUrl: s.ai.baseUrl || cur.ai.baseUrl, model: s.ai.model || cur.ai.model, apiKey: s.ai.apiKey ?? cur.ai.apiKey } : cur.ai;
    const youtube = s.youtube ? { ...cur.youtube, ...s.youtube, apiKey: s.youtube.apiKey ?? cur.youtube.apiKey } : cur.youtube;
    await saveIntegrations({ ai, youtube });
    r.ai = !!s.ai;
    r.youtube = !!s.youtube;
    r.keys = (s.ai?.apiKey ? 1 : 0) + (s.youtube?.apiKey ? 1 : 0);
  }
  if (s.channels?.length) {
    const hadActive = !!(await loadGoogleState()).activeChannelId;
    r.channelsAdded = await mergeChannels(s.channels);
    if (!hadActive && s.activeChannelId) await setActiveChannel(s.activeChannelId);
  }
  return r;
}
