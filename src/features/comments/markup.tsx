// YouTube comment markup (*bold*, _italic_, -strike-) rendered to React nodes for previews. No HTML injection.
import type React from 'react';

export function renderCommentMarkup(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(^|[\s(])([*_-])(?=\S)([^\n]*?\S)\2(?=$|[\s.,!?:;)،؟])/gu;
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index! + m[1]!.length;
    out.push(text.slice(last, start));
    const inner = m[3]!;
    out.push(m[2] === '*' ? <strong key={k++}>{inner}</strong> : m[2] === '_' ? <em key={k++}>{inner}</em> : <s key={k++}>{inner}</s>);
    last = start + inner.length + 2;
  }
  out.push(text.slice(last));
  return out;
}
