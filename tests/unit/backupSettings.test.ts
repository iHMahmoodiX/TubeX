import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { collectSettings, restoreSettings } from '../../src/features/settings/settingsBackup';
import { loadGoogleState } from '../../src/integrations/google/auth';
import { loadIntegrations, saveIntegrations, DEFAULT_INTEGRATIONS } from '../../src/storage/integrations';
import { loadPrefs, updatePrefs } from '../../src/storage/prefs';

const CH = 'UCabcdefghijklmnopqrstuv';

beforeEach(async () => {
  fakeBrowser.reset();
  await saveIntegrations({ ai: { ...DEFAULT_INTEGRATIONS.ai, apiKey: 'ai-secret' }, youtube: { ...DEFAULT_INTEGRATIONS.youtube, apiKey: 'yt-secret', region: 'DE' } });
  await updatePrefs({ uiLanguage: 'en', inpage: { all: true, watch: false } });
  await fakeBrowser.storage.local.set({ google: { channels: [{ channelId: CH, title: 'Mine', handle: '@m', connectedAt: '2026-10-01', sub: '42' }], activeChannelId: CH } });
  await fakeBrowser.storage.session.set({ googleTokens: { [CH]: { accessToken: 'never-in-backup', expiresAt: Date.now() + 1e6, scopes: [] } } });
});

describe('settings in backups', () => {
  it('exports keys only when ticked and never tokens', async () => {
    const plain = await collectSettings({ includeAiKey: false, includeYtKey: false });
    const text = JSON.stringify(plain);
    expect(text).not.toContain('secret');
    expect(text).not.toContain('never-in-backup');
    expect(plain.channels).toEqual([{ channelId: CH, title: 'Mine', handle: '@m', connectedAt: '2026-10-01', sub: '42' }]);
    expect(plain.prefs?.inpage).toEqual({ all: true, watch: false });
    const withYt = await collectSettings({ includeAiKey: false, includeYtKey: true });
    expect(withYt.youtube?.apiKey).toBe('yt-secret');
    expect(withYt.ai?.apiKey).toBeUndefined();
  });

  it('restores settings, keeps keys already here when the file has none, and adds channels without tokens', async () => {
    const file = await collectSettings({ includeAiKey: false, includeYtKey: false });
    fakeBrowser.reset();
    await saveIntegrations({ ...DEFAULT_INTEGRATIONS, youtube: { ...DEFAULT_INTEGRATIONS.youtube, apiKey: 'local-key' } });
    const r = await restoreSettings(file);
    expect(r).toMatchObject({ prefs: true, ai: true, youtube: true, keys: 0, channelsAdded: 1 });
    const i = await loadIntegrations();
    expect(i.youtube.apiKey).toBe('local-key');
    expect(i.youtube.region).toBe('DE');
    expect((await loadPrefs()).uiLanguage).toBe('en');
    expect((await loadGoogleState()).activeChannelId).toBe(CH);
    expect((await fakeBrowser.storage.session.get('googleTokens')).googleTokens).toBeUndefined();
  });
});
