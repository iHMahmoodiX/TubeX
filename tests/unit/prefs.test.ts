import { describe, expect, it } from 'vitest';
import { coercePrefs, DEFAULT_PREFS, loadPrefs, updatePrefs } from '../../src/storage/prefs';

describe('prefs', () => {
  it('defaults to Persian, system theme and adapter on', async () => {
    expect(await loadPrefs()).toEqual(DEFAULT_PREFS);
  });
  it('coerces unknown or damaged values', () => {
    expect(coercePrefs({ uiLanguage: 'de', theme: 'neon', pageAdapterEnabled: 'no' })).toEqual(DEFAULT_PREFS);
    expect(coercePrefs(null)).toEqual(DEFAULT_PREFS);
  });
  it('persists partial updates', async () => {
    await updatePrefs({ uiLanguage: 'en' });
    await updatePrefs({ theme: 'dark' });
    expect(await loadPrefs()).toMatchObject({ uiLanguage: 'en', theme: 'dark', pageAdapterEnabled: true });
  });
});
