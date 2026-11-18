// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { replaceTags } from '../../src/inpage/studio/fields';
import { chipFromPath, chipText, readChips, removeAllChips, tagTipSpot, tagToolsSpot, tagsField } from '../../src/inpage/studio/tags/dom';
import { studioEditorRoot } from '../../src/platform/youtubeDomInpage';

// Synthetic fixture modelled on the 2026 Studio video details editor (Inferred): chips with #chip-text and a
// #delete-icon, the text input, plus a hidden upload dialog with its own tags field that must be ignored.
const EDITOR = `
<ytcp-video-metadata-editor>
  <ytcp-video-metadata-editor-basics>
    <ytcp-video-title><div id="title-textarea"><div id="textbox" contenteditable="true">Figma auto layout</div></div></ytcp-video-title>
  </ytcp-video-metadata-editor-basics>
  <ytcp-video-metadata-editor-advanced>
    <div class="tags-intro">Tags can be useful…</div>
    <ytcp-form-input-container id="tags-container">
      <ytcp-free-text-chip-bar>
        <div id="chip-bar">
          <ytcp-chip><span id="chip-text">figma</span><tp-yt-iron-icon id="delete-icon"></tp-yt-iron-icon></ytcp-chip>
          <ytcp-chip><span id="chip-text"> auto  layout </span><tp-yt-iron-icon id="delete-icon"></tp-yt-iron-icon></ytcp-chip>
          <input id="text-input" aria-label="Tags" />
        </div>
      </ytcp-free-text-chip-bar>
      <div class="help">Enter a comma after each tag</div>
    </ytcp-form-input-container>
  </ytcp-video-metadata-editor-advanced>
</ytcp-video-metadata-editor>
<ytcp-uploads-dialog hidden>
  <ytcp-video-metadata-editor><ytcp-form-input-container id="tags-container"><ytcp-chip><span id="chip-text">upload</span></ytcp-chip></ytcp-form-input-container></ytcp-video-metadata-editor>
</ytcp-uploads-dialog>`;

/** Mimics Studio: the delete icon removes its chip; Enter after typed text turns comma-separated text into chips. */
let unwire: (() => void) | null = null;
function wire(doc: Document) {
  const click = (e: Event) => {
    const t = e.target as Element;
    if (t.id === 'delete-icon') t.closest('ytcp-chip')?.remove();
  };
  const key = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if ((e as KeyboardEvent).key !== 'Enter' || input.id !== 'text-input') return;
    for (const tag of input.value.split(',').map((x) => x.trim()).filter(Boolean)) {
      const chip = doc.createElement('ytcp-chip');
      chip.innerHTML = `<span id="chip-text"></span><tp-yt-iron-icon id="delete-icon"></tp-yt-iron-icon>`;
      chip.querySelector('#chip-text')!.textContent = tag;
      input.before(chip);
    }
    input.value = '';
  };
  doc.addEventListener('click', click);
  doc.addEventListener('keydown', key);
  unwire = () => {
    doc.removeEventListener('click', click);
    doc.removeEventListener('keydown', key);
  };
}

beforeEach(() => {
  unwire?.();
  unwire = null;
  document.body.innerHTML = EDITOR;
});

describe('tags field', () => {
  it('finds the editor field, not the upload dialog one', () => {
    const f = tagsField(document)!;
    expect(f.container.id).toBe('tags-container');
    expect(f.container.closest('ytcp-uploads-dialog')).toBeNull();
    expect(f.input?.id).toBe('text-input');
    expect(f.bar?.tagName.toLowerCase()).toBe('ytcp-free-text-chip-bar');
  });
  it('places the tip before and the tools after the field', () => {
    expect(tagTipSpot(document)).toMatchObject({ append: 'before' });
    expect(tagToolsSpot(document)?.el.id).toBe('tags-container');
    expect(tagToolsSpot(document)?.append).toBe('after');
  });
  it('returns null when the field is not open (Show more collapsed)', () => {
    document.querySelector('ytcp-video-metadata-editor-advanced')!.remove();
    expect(tagsField(document)).toBeNull();
    expect(tagTipSpot(document)).toBeNull();
  });
  it('falls back to the chip bar when the container id changes', () => {
    document.querySelector('#tags-container')!.removeAttribute('id');
    expect(tagsField(document)?.container.tagName.toLowerCase()).toBe('ytcp-form-input-container');
  });
});

describe('chips', () => {
  it('reads chip text, trimmed, and ignores TubeX badge hosts', () => {
    const chips = readChips(tagsField(document));
    expect(chips.map((c) => c.text)).toEqual(['figma', 'auto layout']);
    const host = document.createElement('tubex-tag-badge');
    host.attachShadow({ mode: 'open' }).textContent = '3';
    chips[0]!.textEl!.after(host);
    expect(chipText(chips[0]!.el)).toBe('figma');
    expect(readChips(tagsField(document))[0]!.text).toBe('figma');
  });
  it('finds the double-clicked chip from an event path inside the field only', () => {
    const f = tagsField(document)!;
    const chip = readChips(f)[1]!.el;
    const text = chip.querySelector('#chip-text')!;
    const path = [text, chip, f.bar!, f.container, document.body];
    expect(chipFromPath(path, f)).toBe(chip);
    expect(chipFromPath([document.body], f)).toBeNull();
    expect(chipFromPath([f.input!, f.container], f)).toBeNull();
  });
});

describe('writers (explicit click only)', () => {
  it('removes all chips with their delete buttons', async () => {
    wire(document);
    expect(await removeAllChips(document)).toBe(0);
    expect(readChips(tagsField(document))).toHaveLength(0);
  });
  it('replaces the tag list in a new order and returns the previous list for undo', async () => {
    wire(document);
    const r = await replaceTags(studioEditorRoot(document)!, ['auto layout', 'figma', 'ui']);
    expect(r).toMatchObject({ ok: true, previous: ['figma', 'auto layout'], added: ['auto layout', 'figma', 'ui'] });
    expect(readChips(tagsField(document)).map((c) => c.text)).toEqual(['auto layout', 'figma', 'ui']);
  });
  it('reports when Studio does not remove chips', async () => {
    // No click handler wired: delete icons do nothing, Backspace does nothing.
    const r = await replaceTags(studioEditorRoot(document)!, ['x']);
    expect(r).toEqual({ ok: false, reason: 'not-cleared' });
  });
});
