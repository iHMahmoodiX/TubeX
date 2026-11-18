// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUESTION_TOKEN, answerFromPanel, bodyTemplate, buildBody, coerceAskSettings, extractAnswer, fillPreset, learnAnswerPath, parseChunks, safeHeaders, studioUrlFor, DEFAULT_PRESETS } from '../../src/domain/askStudio';

describe('Ask Studio: learning and replay', () => {
  const q = 'چرا ویدیوی "Auto Layout" کم دیده شد؟';
  const body = JSON.stringify({ context: { client: { clientName: 62 } }, input: { text: q }, videoId: 'abcdefghijk', channelId: 'UC1234567890123456789012' });

  it('turns the captured body into a template and fills a new question, video and channel', () => {
    const tpl = bodyTemplate(body, q)!;
    expect(tpl).toContain(QUESTION_TOKEN);
    expect(tpl).not.toContain('Auto Layout');
    const next = buildBody({ body: tpl, videoId: 'abcdefghijk', channelId: 'UC1234567890123456789012' }, 'سؤال "تازه"\nخط دوم', { videoId: 'zyxwvutsrqp' });
    const parsed = JSON.parse(next);
    expect(parsed.input.text).toBe('سؤال "تازه"\nخط دوم');
    expect(parsed.videoId).toBe('zyxwvutsrqp');
    expect(parsed.channelId).toBe('UC1234567890123456789012');
    expect(bodyTemplate(body, 'something else')).toBeNull();
  });

  it('reads answers from one JSON, a guarded JSON or a line stream, by the learned path', () => {
    const answer = 'ویدیوی شما در ۴۸ ساعت اول CTR پایین‌تری از میانگین کانال داشت. عنوان را کوتاه‌تر کنید.';
    const one = JSON.stringify({ responseId: 'x9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4', parts: [{ text: answer }], echo: q });
    const path = learnAnswerPath(one, q);
    expect(path).toBe('parts.*.text');
    expect(extractAnswer(one, q, path)).toBe(answer);
    expect(extractAnswer(`)]}'\n${one}`, q, path)).toBe(answer);
    const stream = [JSON.stringify({ parts: [{ text: 'ویدیوی شما' }] }), JSON.stringify({ parts: [{ text: answer }] })].join('\n');
    expect(parseChunks(stream)).toHaveLength(2);
    expect(extractAnswer(stream, q, path)).toBe(answer);
    // Different shape than learned: falls back to the longest human text.
    expect(extractAnswer(JSON.stringify({ a: { b: [{ msg: answer }] }, token: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345' }), q, path)).toBe(answer);
  });

  it('keeps only safe client headers and drops learned requests without the question or with foreign paths', () => {
    expect(safeHeaders({ Authorization: 'SAPISIDHASH x', Cookie: 'a=b', 'X-YouTube-Client-Name': '62', 'x-goog-authuser': '1' })).toEqual({ 'x-youtube-client-name': '62', 'x-goog-authuser': '1' });
    const ok = coerceAskSettings({ mode: 'direct', learned: { path: '/youtubei/v1/ask?key=k', body: `{"t":"${QUESTION_TOKEN}"}`, headers: { authorization: 'x', 'x-goog-authuser': '0' }, learnedAt: 'now' } });
    expect(ok.mode).toBe('direct');
    expect(ok.learned?.headers).toEqual({ 'x-goog-authuser': '0' });
    expect(coerceAskSettings({ learned: { path: '//evil.example/x', body: QUESTION_TOKEN } }).learned).toBeUndefined();
    expect(coerceAskSettings({ learned: { path: '/x', body: '{}' } }).learned).toBeUndefined();
    expect(coerceAskSettings({ mode: 'weird' }).mode).toBe('page');
    expect(coerceAskSettings(undefined).presets).toHaveLength(DEFAULT_PRESETS.length);
  });

  it('page mode reads only the text that came after the question', () => {
    expect(answerFromPanel('Ask Studio\nسلام', 'Ask Studio\nسلام\nسؤال من\nجواب اول\n\n\nجواب دوم', 'سؤال من')).toBe('جواب اول\n\nجواب دوم');
  });

  it('fills placeholders and builds Studio addresses', () => {
    expect(fillPreset('عنوان: {title} · {missing}', { title: 'X' })).toBe('عنوان: X · {missing}');
    expect(studioUrlFor({ videoId: 'abcdefghijk' })).toContain('/video/abcdefghijk/analytics');
    expect(studioUrlFor({})).toBe('https://studio.youtube.com/');
  });
});

describe('Ask Studio: page automation on a fixture', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('opens Ask Studio, types the question, sends it and returns the new answer', async () => {
    const { askOnPage, findLauncher } = await import('../../src/inpage/askStudio');
    const header = document.createElement('div');
    const host = document.createElement('ytcp-header');
    const shadow = host.attachShadow({ mode: 'open' });
    const launch = document.createElement('button');
    launch.setAttribute('aria-label', 'Ask Studio');
    shadow.append(launch);
    header.append(host);
    document.body.append(header);
    expect(findLauncher()).toBe(launch);
    launch.addEventListener('click', () => {
      const panel = document.createElement('ytcp-ask-studio-panel');
      panel.innerHTML = '<div class="msgs">چطور کمکت کنم؟</div><textarea placeholder="Ask a question"></textarea><button aria-label="Send">→</button>';
      document.body.append(panel);
      const ta = panel.querySelector('textarea')!;
      panel.querySelector('button')!.addEventListener('click', () => {
        const msgs = panel.querySelector('.msgs')!;
        msgs.textContent += `\n${ta.value}`;
        setTimeout(() => (msgs.textContent += '\nاین ویدیو بیشتر از جستجو بازدید گرفته'), 300);
        setTimeout(() => (msgs.textContent += ' و نگهداشت خوبی دارد.'), 600);
      });
    });
    const r = await askOnPage('منابع ترافیک این ویدیو چیست؟', 15_000);
    expect(r).toEqual({ ok: true, answer: 'این ویدیو بیشتر از جستجو بازدید گرفته و نگهداشت خوبی دارد.', learned: false });
  }, 20_000);

  it('reports when Ask Studio is not on the page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 200 });
    const { askOnPage } = await import('../../src/inpage/askStudio');
    const p = askOnPage('سؤال', 5000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await p).toEqual({ ok: false, code: 'no-launcher' });
    vi.useRealTimers();
  });
});
