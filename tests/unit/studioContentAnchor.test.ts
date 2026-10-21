// @vitest-environment happy-dom
// Anchoring and visibility rules for the Content page tools after issue #8: pill right after the last tab, the
// selection dropdown only while rows are selected, menus placed under their button in a viewport-fixed layer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeSelectionBar, hasLayout, lastTab, PILL_MIN, PILL_ROOM, selectionBar, selectionSpot, tabsRoom, toolsCompact, toolsSpot } from '../../src/inpage/studio/content/dom';
import { LAYER_TAG, layerRoot } from '../../src/inpage/studio/content/layer';
import { onScreen, placeMenu } from '../../src/inpage/studio/content/place';

// Studio-like markup: Polymer paper-tabs renders its tabs inside #tabsContainer (overflow hidden) > #tabsContent.
// A generic filter toolbar sits above the table; the bulk-actions bar exists as an empty shell until rows are ticked.
const PAGE = (opts: { ticked: boolean; barContent: boolean }) => `
<ytcp-app><div id="main">
  <ytcp-content-section>
    <div id="tab-row">
      <tp-yt-paper-tabs id="tabs" role="tablist">
        <div id="tabsContainer"><div id="tabsContent">
          <tp-yt-paper-tab role="tab">Videos</tp-yt-paper-tab><tp-yt-paper-tab role="tab">Shorts</tp-yt-paper-tab>
          <tp-yt-paper-tab role="tab">Collaborations</tp-yt-paper-tab><tp-yt-paper-tab role="tab">Ideas</tp-yt-paper-tab>
          <tp-yt-paper-tab role="tab" hidden>Hidden tab</tp-yt-paper-tab>
        </div></div>
      </tp-yt-paper-tabs>
    </div>
    <ytcp-video-section-content>
      <div id="filter-bar" role="toolbar"><input placeholder="Filter"></div>
      <ytcp-bulk-actions>${opts.barContent ? '<span id="selection-count">1 selected</span><ytcp-select id="more-actions">More actions</ytcp-select><ytcp-icon-button id="close-button" aria-label="Close"></ytcp-icon-button>' : ''}</ytcp-bulk-actions>
      <ytcp-video-row>
        <ytcp-checkbox-lit id="row-checkbox" aria-checked="${opts.ticked}"></ytcp-checkbox-lit>
        <a id="video-title" href="/video/aaaaaaaaaa1/edit">First</a>
      </ytcp-video-row>
      <ytcp-video-row>
        <ytcp-checkbox-lit id="row-checkbox" aria-checked="false"></ytcp-checkbox-lit>
        <a id="video-title" href="/video/bbbbbbbbbb2/edit">Second</a>
      </ytcp-video-row>
    </ytcp-video-section-content>
  </ytcp-content-section>
</div></ytcp-app>`;

type R = { left: number; top: number; width: number; height: number };
/** Fakes layout: rects by matcher; anything unmatched is 100x20 at 0,0 (so "rendered"). */
function fakeLayout(rects: [(el: Element) => boolean, R][]) {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const hit = rects.find(([m]) => m(this));
    const r = hit ? hit[1] : this === document.documentElement ? { left: 0, top: 0, width: 1440, height: 900 } : { left: 0, top: 0, width: 100, height: 20 };
    return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => r } as DOMRect;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('tools pill anchor', () => {
  beforeEach(() => {
    document.body.innerHTML = PAGE({ ticked: false, barContent: false });
  });

  it('anchors right after the last visible tab (skipping hidden tabs)', () => {
    expect(hasLayout(document)).toBe(false);
    expect(lastTab(document.querySelector('#tabs')!)?.textContent).toBe('Ideas');
    const spot = toolsSpot(document)!;
    expect(spot.append).toBe('after');
    expect(spot.el.textContent).toBe('Ideas');
    // Inline with the tabs: the host lands in the same row container as the tabs, not at the row's end.
    expect(spot.el.parentElement?.id).toBe('tabsContent');
  });

  it('skips our own elements when picking the last tab', () => {
    const ours = document.createElement('tubex-sc-tools');
    ours.innerHTML = '<div role="tab">ours</div>';
    document.querySelector('#tabsContent')!.append(ours);
    expect(lastTab(document.querySelector('#tabs')!)?.textContent).toBe('Ideas');
  });

  it('stays after the last tab when the strip has room (LTR layout)', () => {
    fakeLayout([
      [(el) => el.id === 'tabs', { left: 300, top: 230, width: 1600, height: 48 }],
      [(el) => el.textContent === 'Ideas' && el.tagName === 'TP-YT-PAPER-TAB', { left: 1290, top: 230, width: 70, height: 48 }],
    ]);
    expect(hasLayout(document)).toBe(true);
    expect(toolsSpot(document)!.el.textContent).toBe('Ideas');
  });

  it('falls back to after the whole strip when the tabs fill it (narrow window, scrolling tabs)', () => {
    fakeLayout([
      [(el) => el.id === 'tabs', { left: 300, top: 230, width: 760, height: 48 }],
      [(el) => el.textContent === 'Ideas' && el.tagName === 'TP-YT-PAPER-TAB', { left: 1100, top: 230, width: 70, height: 48 }],
    ]);
    const spot = toolsSpot(document)!;
    expect(spot.el.id).toBe('tabs');
    expect(spot.append).toBe('after');
  });

  it('measures room on the left in an RTL Studio', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    (document.querySelector('#tabs') as HTMLElement).style.direction = 'rtl';
    fakeLayout([
      [(el) => el.id === 'tabs', { left: 40, top: 230, width: 1600, height: 48 }],
      [(el) => el.textContent === 'Ideas' && el.tagName === 'TP-YT-PAPER-TAB', { left: 40 + PILL_MIN - 10, top: 230, width: 70, height: 48 }],
    ]);
    expect(toolsSpot(document)!.el.id).toBe('tabs');
    document.documentElement.removeAttribute('dir');
  });

  it('measures against a tighter overflow-clipping box inside the strip (#tabsContainer)', () => {
    (document.querySelector('#tabsContainer') as HTMLElement).style.overflowX = 'hidden';
    fakeLayout([
      [(el) => el.id === 'tabs', { left: 300, top: 230, width: 1600, height: 48 }],
      [(el) => el.id === 'tabsContainer', { left: 300, top: 230, width: 1000, height: 48 }],
      [(el) => el.textContent === 'Ideas' && el.tagName === 'TP-YT-PAPER-TAB', { left: 1200, top: 230, width: 70, height: 48 }],
    ]);
    const tabs = document.querySelector('#tabs')!;
    expect(tabsRoom(document, tabs, lastTab(tabs)!)).toBe(30);
    expect(toolsSpot(document)!.el.id).toBe('tabs');
  });

  it('switches to the compact pill when only it fits after the last tab', () => {
    fakeLayout([
      [(el) => el.id === 'tabs', { left: 300, top: 230, width: 1100, height: 48 }],
      [(el) => el.textContent === 'Ideas' && el.tagName === 'TP-YT-PAPER-TAB', { left: 1200, top: 230, width: 100, height: 48 }],
    ]);
    // room = 1400 - 1300 = 100: enough for the compact pill, not the full one
    expect(PILL_MIN).toBeLessThan(100);
    expect(PILL_ROOM).toBeGreaterThan(100);
    const spot = toolsSpot(document)!;
    expect(spot.el.textContent).toBe('Ideas');
    expect(toolsCompact(document)).toBe(false); // not mounted yet
    spot.el.after(document.createElement('tubex-sc-tools'));
    expect(toolsCompact(document)).toBe(true);
  });

  it('counts its own width back in while it sits after the strip, so it does not ping-pong', () => {
    const host = document.createElement('tubex-sc-tools');
    document.querySelector('#tabs')!.after(host);
    fakeLayout([
      // the strip shrank by the pill's width because the pill sits next to it
      [(el) => el.id === 'tabs', { left: 300, top: 230, width: 1000, height: 48 }],
      [(el) => el.tagName === 'TUBEX-SC-TOOLS', { left: 1312, top: 238, width: 160, height: 32 }],
      [(el) => el.textContent === 'Ideas' && el.tagName === 'TP-YT-PAPER-TAB', { left: 1150, top: 230, width: 100, height: 48 }],
    ]);
    const tabs = document.querySelector('#tabs')!;
    expect(tabsRoom(document, tabs, lastTab(tabs)!)).toBe(1300 + 172 - 1250);
    expect(toolsSpot(document)!.el.textContent).toBe('Ideas');
  });

  it('falls back to after the strip when no tab can be found', () => {
    document.body.innerHTML = `<div role="tablist" id="tl"><div role="tab" hidden>a</div><div role="tab" hidden>b</div></div>`;
    expect(toolsSpot(document)).toMatchObject({ append: 'after', el: { id: 'tl' } });
  });
});

describe('selection dropdown visibility', () => {
  it('does not show with no row selected, even though a bar shell and a filter toolbar exist', () => {
    document.body.innerHTML = PAGE({ ticked: false, barContent: false });
    expect(selectionBar(document)).toBeNull();
    expect(selectionSpot(document)).toBeNull();
  });

  it('never falls back to a generic toolbar or the filter bar', () => {
    document.body.innerHTML = `<div id="main"><div role="toolbar"><span id="count">3</span><button aria-label="More actions">m</button></div></div>`;
    expect(selectionBar(document)).toBeNull();
    expect(selectionSpot(document)).toBeNull();
  });

  it('does not show when the bar is rendered but nothing is selected', () => {
    document.body.innerHTML = PAGE({ ticked: false, barContent: true }).replace('1 selected', '0 selected');
    expect(selectionBar(document)).not.toBeNull();
    expect(activeSelectionBar(document)).toBeNull();
    expect(selectionSpot(document)).toBeNull();
  });

  it('shows after "More actions" once a row is ticked', () => {
    document.body.innerHTML = PAGE({ ticked: true, barContent: true });
    const spot = selectionSpot(document)!;
    expect(spot.append).toBe('after');
    expect(spot.el.id).toBe('more-actions');
  });

  it("trusts Studio's own counter when row checkboxes can't be read", () => {
    document.body.innerHTML = PAGE({ ticked: false, barContent: true });
    document.querySelectorAll('#row-checkbox').forEach((b) => b.remove());
    expect(activeSelectionBar(document)?.tagName).toBe('YTCP-BULK-ACTIONS');
  });

  it('ignores a bar hidden by CSS (zero size) when there is layout', () => {
    document.body.innerHTML = PAGE({ ticked: true, barContent: true });
    fakeLayout([[(el) => el.tagName === 'YTCP-BULK-ACTIONS', { left: 0, top: 0, width: 0, height: 0 }]]);
    expect(selectionSpot(document)).toBeNull();
  });

  it('ignores a bar whose only rendered child is our own island', () => {
    document.body.innerHTML = PAGE({ ticked: true, barContent: false });
    document.querySelector('ytcp-bulk-actions')!.append(document.createElement('tubex-sc-select'));
    expect(selectionSpot(document)).toBeNull();
  });
});

describe('menu placement', () => {
  const vp = { w: 1440, h: 900 };
  const btn = { left: 1380, right: 1540 - 160, top: 236, bottom: 268 };

  it('opens directly under the button, start-aligned, without covering it', () => {
    const b = { left: 1380 - 160, right: 1380, top: 236, bottom: 268 };
    const p = placeMenu(b, { w: 560, h: 500 }, vp, false);
    expect(p.side).toBe('below');
    expect(p.top).toBe(274);
    expect(p.top).toBeGreaterThanOrEqual(b.bottom);
    expect(p.left + p.width).toBeLessThanOrEqual(vp.w - 8); // clamped into the viewport
    expect(p.maxHeight).toBe(900 - 268 - 6 - 8);
  });

  it('starts at the left edge in LTR and the right edge in RTL when there is room', () => {
    const b = { left: 600, right: 760, top: 236, bottom: 268 };
    expect(placeMenu(b, { w: 340, h: 300 }, vp, false).left).toBe(600);
    expect(placeMenu(b, { w: 340, h: 300 }, vp, true).left).toBe(760 - 340);
  });

  it('flips above when the space below is too small and above is larger, still not covering the button', () => {
    const b = { left: 100, right: 260, top: 760, bottom: 792 };
    const p = placeMenu(b, { w: 340, h: 400 }, vp, false);
    expect(p.side).toBe('above');
    expect(p.top + Math.min(400, p.maxHeight)).toBeLessThanOrEqual(b.top);
    expect(p.top).toBeGreaterThanOrEqual(8);
  });

  it('shrinks width to the viewport at narrow widths (1100 px and below)', () => {
    const p = placeMenu({ left: 900, right: 1060, top: 200, bottom: 232 }, { w: 560, h: 400 }, { w: 500, h: 800 }, false);
    expect(p.width).toBe(484);
    expect(p.left).toBe(8);
  });

  it('knows when the button left the screen', () => {
    expect(onScreen(btn, vp)).toBe(true);
    expect(onScreen({ left: 0, right: 0, top: 0, bottom: 0 }, vp)).toBe(false);
    expect(onScreen({ left: 10, right: 100, top: -80, bottom: -40 }, vp)).toBe(false);
  });
});

describe('overlay layer', () => {
  it('is one body-level host with the island styles copied once and its own host rule last', () => {
    const island = document.createElement('tubex-sc-tools');
    const sh = island.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = '.tx-menu{position:fixed}';
    sh.append(st);
    document.body.append(island);
    const a = layerRoot(sh);
    const b = layerRoot(sh);
    expect(a).toBe(b);
    expect(document.querySelectorAll(LAYER_TAG)).toHaveLength(1);
    expect(document.querySelector(LAYER_TAG)?.parentElement).toBe(document.body);
    const styles = Array.from(a.querySelectorAll('style'));
    expect(styles).toHaveLength(2);
    expect(styles[0]!.textContent).toContain('.tx-menu');
    expect(styles[1]!.textContent).toContain('position:fixed');
  });
});
