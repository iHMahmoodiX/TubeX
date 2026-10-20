import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en';
import { fa } from '../../src/i18n/fa';
import { translate } from '../../src/i18n';

describe('catalogs', () => {
  it('Persian provides every English key, with the same placeholders', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(fa[key], key).toBeTruthy();
      const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(vars(fa[key]), key).toBe(vars(en[key]));
    }
  });
  it('formats numbers with Persian digits in Persian', () => {
    expect(translate('fa', 'ideas.count', { n: 12 })).toBe('۱۲ ایده');
    expect(translate('en', 'ideas.count', { n: 12 })).toBe('12 ideas');
  });
});
