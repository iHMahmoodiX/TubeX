// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePageUrl } from '../../src/domain/pageContext';
import { readWatchDom } from '../../src/platform/youtubeDom';

const html = readFileSync(resolve(__dirname, '../fixtures/youtube-watch.html'), 'utf8');
const doc = () => new DOMParser().parseFromString(html, 'text/html');

describe('readWatchDom', () => {
  it('reads title and channel when the player matches the URL video', () => {
    const ctx = parsePageUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(readWatchDom(doc(), ctx)).toEqual({ title: 'آموزش فیگما برای مبتدی‌ها', channelName: 'Sample Channel' });
  });
  it('returns nothing when the DOM still shows a previous video (SPA navigation)', () => {
    const ctx = parsePageUrl('https://www.youtube.com/watch?v=abcdefghijk');
    expect(readWatchDom(doc(), ctx)).toBeNull();
  });
  it('returns nothing when anchors are missing or the page is not a watch page', () => {
    const empty = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    expect(readWatchDom(empty, parsePageUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))).toBeNull();
    expect(readWatchDom(doc(), parsePageUrl('https://www.youtube.com/@x'))).toBeNull();
  });
});
