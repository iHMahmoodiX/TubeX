import { describe, expect, it } from 'vitest';
import { GEMINI_BASE_URL, GEMINI_DEFAULT_MODEL, geminiFamily, geminiModelNotice, suggestGeminiModel } from '../../src/domain/aiModels';
import { AI_PRESETS } from '../../src/integrations/ai/provider';
import { coerceIntegrations } from '../../src/storage/integrations';

describe('Gemini model lifecycle', () => {
  it('new Gemini setups use a model that is not scheduled for rerouting', () => {
    expect(AI_PRESETS.gemini.model).toBe(GEMINI_DEFAULT_MODEL);
    expect(geminiModelNotice(GEMINI_BASE_URL, AI_PRESETS.gemini.model)).toBeNull();
  });
  it('warns about gemini-2.5-flash before and after 2026-12-01, only on the Gemini endpoint', () => {
    const before = geminiModelNotice(GEMINI_BASE_URL, 'gemini-2.5-flash', new Date('2026-11-18T12:00:00Z'))!;
    expect(before).toMatchObject({ past: false, retirement: { to: 'gemini-3.5-flash-lite', date: '2026-12-01' } });
    expect(before.days).toBe(13);
    expect(geminiModelNotice(GEMINI_BASE_URL, 'models/gemini-2.5-flash-001', new Date('2026-12-02T00:00:00Z'))!.past).toBe(true);
    expect(geminiModelNotice('http://localhost:11434/v1', 'gemini-2.5-flash')).toBeNull();
    expect(geminiModelNotice(GEMINI_BASE_URL, 'gemini-2.5-flash-lite')).toBeNull();
  });
  it('normalizes model ids to their family', () => {
    expect(geminiFamily('models/gemini-2.5-flash-001')).toBe('gemini-2.5-flash');
    expect(geminiFamily('gemini-2.5-flash-preview-05-20')).toBe('gemini-2.5-flash');
    expect(geminiFamily('gemini-2.5-flash-lite')).toBe('gemini-2.5-flash-lite');
  });
  it('suggests a replacement the key actually offers, skipping previews', () => {
    expect(suggestGeminiModel('gemini-2.5-flash')).toBe('gemini-3.5-flash-lite');
    expect(suggestGeminiModel('gemini-2.5-flash', ['gemini-3.5-flash-lite-preview', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'])).toBe('gemini-2.5-flash-lite');
    expect(suggestGeminiModel('gemini-2.5-pro', ['models/gemini-3.8-flash', 'gemini-3.5-flash-lite'])).toBe('gemini-3.8-flash');
    expect(suggestGeminiModel('x', ['gemini-4.0-flash'])).toBe('gemini-4.0-flash');
  });
  it('keeps an existing saved model untouched (no silent migration)', () => {
    expect(coerceIntegrations({ ai: { baseUrl: GEMINI_BASE_URL, model: 'gemini-2.5-flash' } }).ai.model).toBe('gemini-2.5-flash');
  });
});
