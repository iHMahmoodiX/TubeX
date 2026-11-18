import { beforeEach, describe, expect, it } from 'vitest';
import * as db from '../../src/storage/db';
import { draftsByVideo, prepareForAparat } from '../../src/features/aparat/aparatActions';

const video = { id: 'vid00000001', title: 'آموزش فیگما', description: 'متن\nhttps://www.youtube.com/@x', tags: ['فیگما', 'figma', 'ui'] };

describe('send to Aparat', () => {
  beforeEach(async () => {
    await db.resetDbForTests();
    indexedDB.deleteDatabase(db.DB_NAME);
  });

  it('creates one linked draft with a package and reuses it on the next click', async () => {
    const d1 = await prepareForAparat(video);
    expect(d1.source?.videoId).toBe(video.id);
    expect(d1.platforms?.aparat?.description).toBe('متن');
    expect(d1.platforms?.aparat?.tags).toEqual(['فیگما', 'figma', 'ui']);
    const d2 = await prepareForAparat(video);
    expect(d2.id).toBe(d1.id);
    expect((await db.list('drafts')).items).toHaveLength(1);
  });

  it('adds the package to an existing draft of that video without touching its YouTube text', async () => {
    const { videoToDraft } = await import('../../src/features/reports/data');
    const d = await videoToDraft({ ...video, title: 'my edited title' });
    const ready = await prepareForAparat(video);
    expect(ready.id).toBe(d.id);
    expect(ready.title).toBe('my edited title');
    expect(ready.platforms?.aparat?.title).toBe('my edited title');
    expect((await draftsByVideo()).get(video.id)?.platforms?.aparat).toBeTruthy();
  });

  it('reuses the last category so it is typed once', async () => {
    const d1 = await prepareForAparat(video);
    await db.save('drafts', { ...d1, platforms: { aparat: { ...d1.platforms!.aparat!, category: 'آموزشی' } } });
    const d2 = await prepareForAparat({ ...video, id: 'vid00000002' });
    expect(d2.platforms?.aparat?.category).toBe('آموزشی');
  });
});
