import { describe, expect, it } from 'vitest';
import { canonicalUrl, cleanTabTitle, isCapturable, parsePageUrl } from '../../src/domain/pageContext';

describe('parsePageUrl', () => {
  it('detects watch pages and ignores extra params', () => {
    const c = parsePageUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL1');
    expect(c).toMatchObject({ kind: 'watch', videoId: 'dQw4w9WgXcQ' });
    expect(canonicalUrl(c)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
  it('rejects malformed video ids', () => {
    expect(parsePageUrl('https://www.youtube.com/watch?v=short').kind).toBe('youtube-other');
    expect(parsePageUrl('https://www.youtube.com/shorts/x').kind).toBe('youtube-other');
  });
  it('detects shorts, search, playlist and home', () => {
    expect(parsePageUrl('https://www.youtube.com/shorts/abcdefghijk')).toMatchObject({ kind: 'shorts', videoId: 'abcdefghijk' });
    expect(parsePageUrl('https://www.youtube.com/results?search_query=%D8%B7%D8%B1%D8%A7%D8%AD%DB%8C+ui')).toMatchObject({
      kind: 'search',
      searchQuery: 'طراحی ui',
    });
    expect(parsePageUrl('https://www.youtube.com/playlist?list=PLabc')).toMatchObject({ kind: 'playlist', playlistId: 'PLabc' });
    expect(parsePageUrl('https://www.youtube.com/').kind).toBe('home');
  });
  it('detects channels by handle (including Persian handles) and by id', () => {
    expect(parsePageUrl('https://www.youtube.com/@someone/videos')).toMatchObject({ kind: 'channel', channelHandle: '@someone' });
    expect(parsePageUrl('https://www.youtube.com/@%D8%B9%D9%84%DB%8C')).toMatchObject({ kind: 'channel', channelHandle: '@علی' });
    expect(parsePageUrl('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv')).toMatchObject({
      kind: 'channel',
      channelId: 'UCabcdefghijklmnopqrstuv',
    });
  });
  it('detects Studio video and channel pages', () => {
    expect(parsePageUrl('https://studio.youtube.com/video/abcdefghijk/edit')).toMatchObject({ kind: 'studio-video', videoId: 'abcdefghijk' });
    expect(parsePageUrl('https://studio.youtube.com/channel/UCabcdefghijklmnopqrstuv/videos').kind).toBe('studio');
  });
  it('treats other sites, http, lookalikes and browser pages as unsupported or unknown', () => {
    expect(parsePageUrl('https://example.com/watch?v=dQw4w9WgXcQ').kind).toBe('unsupported');
    expect(parsePageUrl('https://www.youtube.com.evil.test/watch?v=dQw4w9WgXcQ').kind).toBe('unsupported');
    expect(parsePageUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ').kind).toBe('unsupported');
    expect(parsePageUrl('chrome://newtab/').kind).toBe('unsupported');
    expect(parsePageUrl(undefined).kind).toBe('unknown');
    expect(parsePageUrl('not a url').kind).toBe('unknown');
    expect(isCapturable('unsupported')).toBe(false);
    expect(isCapturable('watch')).toBe(true);
  });
});

describe('cleanTabTitle', () => {
  it('strips the YouTube suffix and notification count', () => {
    expect(cleanTabTitle('(3) آموزش فیگما - YouTube')).toBe('آموزش فیگما');
    expect(cleanTabTitle('Video details - YouTube Studio')).toBe('Video details');
    expect(cleanTabTitle('YouTube')).toBeUndefined();
    expect(cleanTabTitle(undefined)).toBeUndefined();
  });
});
