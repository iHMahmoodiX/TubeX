// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRelated,
  contentTabList,
  fillRelated,
  findOption,
  firstInt,
  readSelectedRows,
  relatedField,
  relatedSpot,
  selectionBar,
  selectionCount,
  selectionSpot,
  toolsSpot,
  videoIdFromStudioHref,
} from '../../src/inpage/studio/content/dom';

// Synthetic markup modelled on Studio's Content page (custom element names Inferred; not verified live).
const CONTENT = `
<ytcp-app><div id="main">
  <ytcp-content-section>
    <h1>Channel content</h1>
    <div id="tabs-container" style="display:flex">
      <tp-yt-paper-tabs id="tabs">
        <tp-yt-paper-tab>Videos</tp-yt-paper-tab><tp-yt-paper-tab>Shorts</tp-yt-paper-tab><tp-yt-paper-tab>Live</tp-yt-paper-tab>
      </tp-yt-paper-tabs>
    </div>
    <ytcp-bulk-actions>
      <span id="selection-count">2 selected</span>
      <ytcp-select id="edit">Edit</ytcp-select>
      <ytcp-select id="add-to-playlist">Add to playlist</ytcp-select>
      <div class="wrap"><ytcp-select id="more-actions">More actions</ytcp-select></div>
      <ytcp-icon-button id="close-button" aria-label="Close"></ytcp-icon-button>
    </ytcp-bulk-actions>
    <ytcp-video-row>
      <ytcp-checkbox-lit id="row-checkbox" aria-checked="true"></ytcp-checkbox-lit>
      <a id="thumbnail-anchor" href="/video/aaaaaaaaaa1/edit"><img alt="thumb"></a>
      <a id="video-title" href="/video/aaaaaaaaaa1/edit">سرویس جدید XpertAI</a>
    </ytcp-video-row>
    <ytcp-video-row>
      <ytcp-checkbox-lit id="row-checkbox"><div id="checkbox" aria-checked="true"></div></ytcp-checkbox-lit>
      <a id="video-title" href="https://studio.youtube.com/video/bbbbbbbbbb2/edit?x=1">Second</a>
    </ytcp-video-row>
    <ytcp-video-row>
      <ytcp-checkbox-lit id="row-checkbox" aria-checked="false"></ytcp-checkbox-lit>
      <a id="video-title" href="/video/cccccccccc3/edit">Third</a>
    </ytcp-video-row>
  </ytcp-content-section>
</div></ytcp-app>`;

const EDITOR = `
<ytcp-video-metadata-editor>
  <div class="section">
    <h3 class="label">Related video</h3>
    <div class="control">
      <ytcp-dropdown-trigger id="trigger" role="button">Add a related video</ytcp-dropdown-trigger>
      <ytcp-icon-button id="clear-button" aria-label="Remove related video"></ytcp-icon-button>
    </div>
  </div>
</ytcp-video-metadata-editor>`;

describe('Studio content DOM', () => {
  beforeEach(() => {
    document.body.innerHTML = CONTENT;
  });

  it('finds the tabs row and puts the tools button after it', () => {
    expect(contentTabList(document)?.id).toBe('tabs');
    const spot = toolsSpot(document);
    expect(spot?.append).toBe('after');
    expect(spot?.el.id).toBe('tabs');
  });

  it('ignores tab lists inside dialogs', () => {
    document.body.innerHTML = `<tp-yt-paper-dialog><div role="tablist"><div role="tab">a</div><div role="tab">b</div></div></tp-yt-paper-dialog>`;
    expect(contentTabList(document)).toBeNull();
  });

  it('places the selection dropdown right after "More actions" at the bar level', () => {
    const spot = selectionSpot(document)!;
    expect(spot.append).toBe('after');
    expect(spot.el.className).toBe('wrap');
    expect(selectionCount(selectionBar(document)!)).toBe(2);
  });

  it('falls back to before the close button, then to the end of the bar', () => {
    document.querySelector('.wrap')!.remove();
    expect(selectionSpot(document)).toMatchObject({ append: 'before' });
    expect(selectionSpot(document)!.el.id).toBe('close-button');
    document.querySelector('#close-button')!.remove();
    expect(selectionSpot(document)).toMatchObject({ append: 'last' });
  });

  it('has no selection spot while the bar is hidden', () => {
    document.querySelector('ytcp-bulk-actions')!.setAttribute('hidden', '');
    expect(selectionSpot(document)).toBeNull();
  });

  it('reads the ticked rows (aria-checked on the box or inside it)', () => {
    expect(readSelectedRows(document)).toEqual([
      { id: 'aaaaaaaaaa1', title: 'سرویس جدید XpertAI' },
      { id: 'bbbbbbbbbb2', title: 'Second' },
    ]);
  });

  it('parses ids and counts', () => {
    expect(videoIdFromStudioHref('/video/aaaaaaaaaa1/edit')).toBe('aaaaaaaaaa1');
    expect(videoIdFromStudioHref('https://youtube.com/shorts/aaaaaaaaaa1')).toBe('aaaaaaaaaa1');
    expect(videoIdFromStudioHref('/channel/UC/videos')).toBeUndefined();
    expect(firstInt('۱۲ انتخاب شد')).toBe(12);
    expect(firstInt('1,204 selected')).toBe(1204);
    expect(firstInt('none')).toBeUndefined();
  });
});

describe('Shorts editor related video', () => {
  beforeEach(() => {
    document.body.innerHTML = EDITOR;
  });

  it('finds the control by its label only when asked (not in the page observer)', () => {
    expect(relatedField(document, false)).toBeNull();
    expect(relatedSpot(document)).toBeNull();
    expect(relatedField(document)?.className).toBe('section');
  });

  it('finds the control by id when Studio has one', () => {
    document.body.innerHTML = `<div id="related-video"><div role="button">pick</div></div>`;
    expect(relatedField(document, false)?.id).toBe('related-video');
    expect(relatedSpot(document)).toMatchObject({ append: 'after' });
  });

  it('clears by clicking Studio’s own remove button', () => {
    let clicked = 0;
    document.querySelector('#clear-button')!.addEventListener('click', () => clicked++);
    expect(clearRelated(document)).toBe('cleared');
    expect(clicked).toBe(1);
  });

  it('reports a missing field instead of guessing', () => {
    document.body.innerHTML = '<div>nothing</div>';
    expect(clearRelated(document)).toBe('no-field');
  });

  it('opens the picker, searches and picks the matching video', async () => {
    document.querySelector('#trigger')!.addEventListener('click', () => {
      const d = document.createElement('tp-yt-paper-dialog');
      d.innerHTML = `<input type="search" aria-label="Search"><div role="listbox"><div role="option">Other video</div><div role="option"><span>Figma auto layout</span></div></div>`;
      document.body.append(d);
    });
    let picked = '';
    document.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.getAttribute('role') === 'option') picked = el.textContent ?? '';
    });
    const r = await fillRelated(document, { id: 'aaaaaaaaaa1', title: 'Figma auto layout' });
    expect(r).toBe('filled');
    expect(picked).toBe('Figma auto layout');
    expect((document.querySelector('tp-yt-paper-dialog input') as HTMLInputElement).value).toBe('Figma auto layout');
  });

  it('prefers the innermost matching option', () => {
    const d = document.createElement('div');
    d.innerHTML = `<li><div role="option" id="x">My video</div></li>`;
    expect(findOption(d, 'my video', 'zzzzzzzzzzz')?.id).toBe('x');
  });
});
