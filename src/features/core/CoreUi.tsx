// Small building blocks shared by the core screens (ideas, drafts, templates, channels, settings, side panel,
// popup). Styles live in core.css with `core-` class names; the design system itself is src/components/ui.tsx.
import { useId, useRef, useState, type ReactNode } from 'react';
import { dedupeTags, parseTags } from '../../domain/metadata';
import type { IdeaStatus } from '../../domain/models';
import { normalizeForSearch } from '../../domain/text';
import { Icon, type IconName } from '../../components/icons';
import { useI18n } from '../../i18n';
import './core.css';

/** Square page artwork (like a playlist cover) for pages without content art. */
export function Cover({ icon, src, size }: { icon: IconName; src?: string; size?: 's' }) {
  return (
    <div className={`core-cover ${size === 's' ? 'core-cover-s' : ''}`} aria-hidden="true">
      {src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : <Icon name={icon} />}
    </div>
  );
}

/** Pill radio group. `label` names the group for assistive tech. */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
  name,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: ReactNode; icon?: IconName; count?: number }[];
  label: string;
  name?: string;
}) {
  const auto = useId();
  return (
    <div className="core-seg" role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <label key={it.id} data-checked={it.id === value}>
          <input type="radio" name={name ?? auto} value={it.id} checked={it.id === value} onChange={() => onChange(it.id)} />
          {it.icon && <Icon name={it.icon} />}
          <span>{it.label}</span>
          {it.count !== undefined && <small className="num-t">{it.count}</small>}
        </label>
      ))}
    </div>
  );
}

const STATUS_TONE: Record<IdeaStatus, string> = { inbox: '', planned: 'badge-info', used: 'badge-accent', dropped: 'core-badge-muted' };
export function StatusPill({ status }: { status: IdeaStatus }) {
  const { t } = useI18n();
  return <span className={`badge ${STATUS_TONE[status]}`}>{t(`status.${status}`)}</span>;
}

/**
 * Tags as removable chips with a text input. Typing a comma (Latin or Persian), Enter or leaving the field
 * turns text into chips; the fragment being typed already counts as a tag so nothing is lost on close.
 */
export function TagInput({
  id,
  describedBy,
  tags,
  onChange,
  lang,
  keyword,
  placeholder,
}: {
  id: string;
  describedBy?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  lang?: string;
  keyword?: string;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState('');
  // Chips shown while a fragment is being typed: the tags as they were before the fragment started.
  const base = useRef<string[]>(tags);
  const input = useRef<HTMLInputElement>(null);
  const chips = pending ? base.current : tags;
  const kw = keyword ? normalizeForSearch(keyword) : '';

  const type = (value: string) => {
    if (!pending) base.current = tags;
    const parts = value.split(/[,\n،]/);
    const fragment = parts.pop() ?? '';
    if (parts.length) base.current = dedupeTags([...base.current, ...parts]);
    setPending(fragment);
    onChange(dedupeTags([...base.current, ...parseTags(fragment)]));
  };
  const commit = () => {
    if (!pending) return;
    base.current = dedupeTags([...base.current, ...parseTags(pending)]);
    setPending('');
  };
  const removeAt = (i: number) => {
    const next = chips.filter((_, j) => j !== i);
    base.current = next;
    onChange(dedupeTags([...next, ...parseTags(pending)]));
  };

  return (
    <div className="core-tags" onClick={(e) => e.target === e.currentTarget && input.current?.focus()}>
      {chips.map((tag, i) => (
        <span key={`${tag}-${i}`} className="core-tag" data-kw={kw && normalizeForSearch(tag).includes(kw) ? 'true' : undefined}>
          <bdi dir="auto">{tag}</bdi>
          <button type="button" aria-label={t('core.tag.remove', { tag })} onClick={() => removeAt(i)}>
            <Icon name="x" />
          </button>
        </span>
      ))}
      <input
        ref={input}
        id={id}
        aria-describedby={describedBy}
        dir="auto"
        lang={lang}
        value={pending}
        placeholder={chips.length ? undefined : placeholder}
        onChange={(e) => type(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !pending && chips.length) {
            e.preventDefault();
            removeAt(chips.length - 1);
          }
        }}
      />
    </div>
  );
}

/** Thumbnail for a YouTube video id, or an icon tile when there is none. */
export function ArtTile({ videoId, icon, width = 64 }: { videoId?: string; icon: IconName; width?: number }) {
  if (videoId) return <img className="thumb" src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width }} />;
  return (
    <span className="thumb core-art" style={{ width }} aria-hidden="true">
      <Icon name={icon} />
    </span>
  );
}

/** Section of a settings-like page with a heading anchor. */
export function Section({ id, title, desc, children, icon }: { id: string; title: string; desc?: ReactNode; children: ReactNode; icon?: IconName }) {
  return (
    <section id={id} className="core-section" aria-labelledby={`${id}-h`}>
      <div className="core-section-head">
        {icon && (
          <span className="core-section-icon" aria-hidden="true">
            <Icon name={icon} />
          </span>
        )}
        <div className="stack-s grow" style={{ gap: 2 }}>
          <h2 id={`${id}-h`} tabIndex={-1}>
            {title}
          </h2>
          {desc && <p className="muted small">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
