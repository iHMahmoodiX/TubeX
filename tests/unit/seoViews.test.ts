// @vitest-environment happy-dom
import { createElement as h } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { keywordScore } from '../../src/domain/seo';
import { ToastProvider } from '../../src/components/toasts';
import { Explore } from '../../src/features/research/Explore';
import type { KeywordData } from '../../src/features/research/keywordData';
import { I18nProvider } from '../../src/i18n';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const videos = Array.from({ length: 5 }, (_, i) => ({
  id: `vid${i}xxxxxx`.slice(0, 11),
  title: i === 2 ? 'آموزش پایتون برای مبتدی‌ها' : `Python tutorial ${i}`,
  description: '',
  channelId: i === 2 ? 'MINE' : `C${i}`,
  channelTitle: i === 2 ? 'Me' : `Channel ${i}`,
  publishedAt: day(10 + i),
  tags: ['python', 'آموزش'],
  durationSec: 600,
  views: 10_000 * (i + 1),
}));

function data(): KeywordData {
  const subs = { C0: 5000, C1: 900_000, C3: 1200, C4: 40_000 };
  return {
    sample: { query: 'آموزش پایتون', region: 'IR', language: 'fa', order: 'relevance', videos, fetchedAt: day(0), fromCache: false },
    channels: {},
    score: keywordScore({ keyword: 'آموزش پایتون', videos, subscribers: subs, mine: { channelIds: ['MINE'], subscribers: 3000 } }),
    mine: ['MINE'],
  };
}

describe('keyword explorer view', () => {
  it('renders the estimate, explained parts and highlights my video', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const root = createRoot(el);
    await act(async () => {
      const explore = h(Explore, { data: data(), loading: false, error: null, onExplore: () => {}, onRefresh: () => {}, onCompare: () => {}, recent: [] });
      root.render(h(I18nProvider, { lang: 'en', children: h(ToastProvider, { children: explore }) }));
    });
    const text = el.textContent ?? '';
    expect(text).toContain('Keyword score · estimate');
    expect(text).toContain('Demand');
    expect(text).toContain('Competition');
    expect(text).toContain('Your chance');
    expect(text).toContain('#3');
    expect(text).not.toMatch(/search volume:/i);
    expect(el.querySelectorAll('[data-mine="true"]')).toHaveLength(1);
    await act(async () => root.unmount());
  });
});
