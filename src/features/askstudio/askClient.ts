// Page-side helpers for Ask Studio: the background call, error text, and saving an answer as an idea.
import { newBase, type Idea } from '../../domain/models';
import type { AskMode } from '../../domain/askStudio';
import type { MessageKey } from '../../i18n/en';
import { rpc } from '../../platform/rpc';
import { create } from '../../storage/db';

export interface AskResult {
  answer: string;
  mode: Exclude<AskMode, 'copy'>;
  learned: boolean;
}

export function askStudio(question: string, ctx: { videoId?: string; channelId?: string }, title?: string): Promise<AskResult> {
  return rpc<AskResult>('askStudio.ask', question, ctx, title ?? '');
}

const CODES = ['off', 'no-tab', 'no-studio', 'no-launcher', 'no-input', 'timeout', 'empty', 'not-learned', 'direct-failed', 'signed-out'];

export function askErrorText(t: (k: MessageKey, v?: Record<string, string | number>) => string, e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const code = m.startsWith('ask:') ? m.slice(4).split(':')[0]! : '';
  return CODES.includes(code) ? t(`ask.err.${code}` as MessageKey) : t('error.generic');
}

export async function saveAnswerAsIdea(question: string, answer: string): Promise<Idea> {
  return create('ideas', { ...newBase(), text: question.split('\n')[0]!.slice(0, 200), notes: answer.slice(0, 8000), status: 'inbox' } as Idea);
}
