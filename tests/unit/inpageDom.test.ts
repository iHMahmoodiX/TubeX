// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  channelIdFromHref,
  channelStripSpot,
  editableText,
  fillReplyBox,
  findReplyBox,
  findReplyButton,
  mastheadSpot,
  readChannelRef,
  readCommentThreads,
  readSearchResults,
  readStudioValues,
  searchStripSpot,
  setEditableText,
  studioEditorRoot,
  studioEditorSpot,
  studioFields,
  typeTags,
  uploadDialogSpot,
  videoIdFromHref,
  watchCardSpot,
  watchVideoId,
} from '../../src/platform/youtubeDomInpage';

const load = (name: string) => {
  const html = readFileSync(resolve(__dirname, `../fixtures/${name}`), 'utf8');
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, 'text/html').documentElement.innerHTML;
  return document;
};
const empty = () => new DOMParser().parseFromString('<html><body><div></div></body></html>', 'text/html');

describe('ids from links', () => {
  it('reads video ids from watch, shorts, youtu.be, embed and Studio links', () => {
    expect(videoIdFromHref('/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
    expect(videoIdFromHref('https://www.youtube.com/shorts/aaaaaaaaaa1')).toBe('aaaaaaaaaa1');
    expect(videoIdFromHref('https://youtu.be/bbbbbbbbbb2?si=x')).toBe('bbbbbbbbbb2');
    expect(videoIdFromHref('https://www.youtube.com/embed/cccccccccc3')).toBe('cccccccccc3');
    expect(videoIdFromHref('https://studio.youtube.com/video/dddddddddd4/edit')).toBe('dddddddddd4');
    expect(videoIdFromHref('/watch?v=short')).toBeUndefined();
    expect(videoIdFromHref('/@channel')).toBeUndefined();
    expect(videoIdFromHref(null)).toBeUndefined();
  });
  it('reads channel ids', () => {
    expect(channelIdFromHref('/channel/UCabcdefghijklmnopqrstuv/videos')).toBe('UCabcdefghijklmnopqrstuv');
    expect(channelIdFromHref('/@x')).toBeUndefined();
  });
});

describe('watch page', () => {
  it('places the card before the description row and finds the masthead buttons', () => {
    const doc = load('inpage-watch.html');
    const spot = watchCardSpot(doc)!;
    expect(spot.el.id).toBe('bottom-row');
    expect(spot.append).toBe('before');
    const m = mastheadSpot(doc)!;
    expect(m.el.id).toBe('buttons');
    expect(m.append).toBe('first');
  });
  it('falls back when #bottom-row is missing, and gives up without anchors', () => {
    const doc = load('inpage-watch.html');
    doc.querySelector('#bottom-row')!.replaceWith(...Array.from(doc.querySelector('#bottom-row')!.childNodes));
    expect(watchCardSpot(doc)!.el.id).toBe('description');
    expect(watchCardSpot(empty())).toBeNull();
    expect(mastheadSpot(empty())).toBeNull();
  });
  it('returns the URL video only when the player shows it', () => {
    const doc = load('inpage-watch.html');
    expect(watchVideoId(doc, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(watchVideoId(doc, 'https://www.youtube.com/watch?v=abcdefghijk')).toBeNull();
    expect(watchVideoId(doc, 'https://www.youtube.com/results?search_query=x')).toBeNull();
  });
});

describe('search results', () => {
  it('finds video results with a badge slot, skipping ads and items without a video link', () => {
    const doc = load('inpage-search.html');
    const r = readSearchResults(doc);
    expect(r.map((x) => x.videoId)).toEqual(['aaaaaaaaaa1', 'bbbbbbbbbb2', 'cccccccccc3']);
    expect(r[0]!.after.id).toBe('metadata-line');
    expect(r[1]!.after.tagName.toLowerCase()).toBe('yt-content-metadata-view-model');
    expect(searchStripSpot(doc)!.el.tagName.toLowerCase()).toBe('ytd-section-list-renderer');
    expect(readSearchResults(empty())).toEqual([]);
    expect(searchStripSpot(empty())).toBeNull();
  });
});

describe('channel page', () => {
  it('anchors after the visible header (not the hidden browse page)', () => {
    const doc = load('inpage-channel.html');
    const spot = channelStripSpot(doc)!;
    expect(spot.el.closest('ytd-browse')!.getAttribute('page-subtype')).toBe('channels');
    expect(spot.append).toBe('after');
    expect(channelStripSpot(empty())).toBeNull();
  });
  it('takes the channel from the URL first, then page metadata for legacy /c/ URLs', () => {
    const doc = load('inpage-channel.html');
    expect(readChannelRef(doc, 'https://www.youtube.com/@sample-channel/videos')).toEqual({ handle: '@sample-channel' });
    expect(readChannelRef(doc, 'https://www.youtube.com/channel/UCzzzzzzzzzzzzzzzzzzzzzz')).toEqual({ id: 'UCzzzzzzzzzzzzzzzzzzzzzz' });
    expect(readChannelRef(doc, 'https://www.youtube.com/c/SampleChannel')).toEqual({ id: 'UCabcdefghijklmnopqrstuv' });
    expect(readChannelRef(doc, 'https://www.youtube.com/feed/history')).toBeNull();
  });
});

describe('Studio editor', () => {
  it('finds the editor (not the hidden upload dialog) and reads its fields', () => {
    const doc = load('inpage-studio-editor.html');
    const root = studioEditorRoot(doc)!;
    expect(root.closest('ytcp-uploads-dialog')).toBeNull();
    expect(studioEditorSpot(doc)!.el.tagName.toLowerCase()).toBe('ytcp-video-metadata-editor-sidepanel');
    const v = readStudioValues(root);
    expect(v.title).toBe('Figma auto layout tutorial');
    expect(v.description).toBe('Learn auto layout in Figma.\n0:00 Intro\n0:30 Basics\n2:00 Advanced');
    expect(v.tags).toEqual(['figma', 'auto layout']);
    expect(v.found).toEqual({ title: true, description: true, tags: true });
    expect(uploadDialogSpot(doc)).toBeNull();
  });
  it('writes text into contenteditable fields and fires input events', () => {
    const doc = load('inpage-studio-editor.html');
    const f = studioFields(studioEditorRoot(doc)!);
    let inputs = 0;
    f.description!.addEventListener('input', () => inputs++);
    setEditableText(f.description!, 'New description\n\nBlock');
    expect(editableText(f.description)).toContain('New description');
    expect(editableText(f.description)).toContain('Block');
    expect(inputs).toBeGreaterThan(0);
  });
  it('types tags into the tag input as a comma list followed by Enter', () => {
    const doc = load('inpage-studio-editor.html');
    const input = studioFields(studioEditorRoot(doc)!).tagsInput!;
    const keys: string[] = [];
    input.addEventListener('keydown', (e) => keys.push((e as KeyboardEvent).key));
    typeTags(input, ['design', 'ui']);
    expect(input.value).toContain('design,ui');
    expect(keys).toContain('Enter');
  });
});

describe('Studio upload dialog', () => {
  it('anchors inside the details step and exposes its fields', () => {
    const doc = load('inpage-studio-upload.html');
    const spot = uploadDialogSpot(doc)!;
    expect(spot.el.closest('ytcp-uploads-dialog')).not.toBeNull();
    const f = studioFields(doc.querySelector('ytcp-uploads-dialog')!);
    expect(f.title).not.toBeNull();
    expect(f.description).not.toBeNull();
    expect(f.tagsInput).not.toBeNull();
    expect(f.tags).toEqual([]);
  });
});

describe('Studio comments', () => {
  it('reads threads with author and action row; finds and fills the reply box', () => {
    const doc = load('inpage-studio-comments.html');
    const threads = readCommentThreads(doc);
    expect(threads.map((t) => t.author)).toEqual(['@sara_designs', 'Ali Rezaei']);
    expect(threads[0]!.after.tagName.toLowerCase()).toBe('ytcp-comment-action-buttons');
    const box = findReplyBox(threads[0]!.thread)!;
    fillReplyBox(box, 'Thanks sara_designs!');
    expect(editableText(box)).toBe('Thanks sara_designs!');
    expect(findReplyBox(threads[1]!.thread)).toBeNull();
    expect(findReplyButton(threads[1]!.thread)!.id).toBe('reply-button');
    expect(readCommentThreads(empty())).toEqual([]);
  });
});
