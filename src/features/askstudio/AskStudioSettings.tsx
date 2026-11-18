// Settings → Ask Studio: which method is active, what "direct" has learned, and the ready-made questions.
import { useEffect, useState } from 'react';
import { Button, ConfirmButton, Field } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { ASK_MODES, DEFAULT_PRESETS, type AskPreset, type AskScope } from '../../domain/askStudio';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { updateAskSettings } from '../../storage/askStudio';
import { useAskSettings } from './AskStudioView';

const newId = () => `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function PresetEditor() {
  const { t } = useI18n();
  const toast = useToast();
  const s = useAskSettings();
  const [sel, setSel] = useState('');
  const cur = s.presets.find((p) => p.id === sel) ?? s.presets[0];
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [scope, setScope] = useState<AskScope>('channel');
  useEffect(() => {
    setName(cur?.name ?? '');
    setText(cur?.text ?? '');
    setScope(cur?.scope ?? 'channel');
  }, [cur?.id, cur?.text, cur?.name, cur?.scope]);
  const dirty = !!cur && (name !== cur.name || text !== cur.text || scope !== cur.scope);
  const original = cur && DEFAULT_PRESETS.find((p) => p.id === cur.id);
  const write = (fn: (list: AskPreset[]) => AskPreset[]) => updateAskSettings((x) => ({ ...x, presets: fn(x.presets) }));

  return (
    <div className="stack" data-testid="ask-presets-editor">
      <p className="small muted">{t('ask.presetsHelp')}</p>
      {(['channel', 'video'] as const).map((sc) => (
        <div key={sc} className="stack-s">
          <strong className="small">{t(`ask.scope.${sc}` as MessageKey)}</strong>
          <div className="chips">
            {s.presets
              .filter((p) => p.scope === sc)
              .map((p) => (
                <button key={p.id} type="button" className="chip" aria-pressed={cur?.id === p.id} onClick={() => setSel(p.id)}>
                  {p.name}
                </button>
              ))}
          </div>
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <Button
          size="s"
          variant="ghost"
          onClick={async () => {
            const id = newId();
            await write((l) => [...l, { id, name: t('ask.newPreset'), text: t('ask.newPresetText'), scope: 'channel' }]);
            setSel(id);
          }}
        >
          <Icon name="plus" />
          {t('ask.addPreset')}
        </Button>
        <ConfirmButton
          size="s"
          danger={false}
          label={t('ask.restorePresets')}
          question={t('ask.restorePresetsQ')}
          confirmLabel={t('ask.restorePresets')}
          onConfirm={async () => {
            await write((l) => [...DEFAULT_PRESETS.map((p) => ({ ...p })), ...l.filter((p) => !DEFAULT_PRESETS.some((d) => d.id === p.id))]);
            toast(t('ask.restored'));
          }}
        />
      </div>
      {cur && (
        <div className="card stack-s" style={{ padding: 12 }}>
          <div className="grid-2">
            <Field label={t('ask.presetName')}>{({ id }) => <input id={id} className="input" dir="auto" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label={t('ask.scope')}>
              {({ id }) => (
                <select id={id} className="select" value={scope} onChange={(e) => setScope(e.target.value as AskScope)}>
                  <option value="channel">{t('ask.scope.channel')}</option>
                  <option value="video">{t('ask.scope.video')}</option>
                </select>
              )}
            </Field>
          </div>
          <Field label={t('ask.presetText')} help={t('ask.presetTextHelp')}>
            {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" dir="auto" rows={5} value={text} onChange={(e) => setText(e.target.value)} />}
          </Field>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Button
              size="s"
              variant="primary"
              disabled={!dirty || !text.trim()}
              onClick={async () => {
                await write((l) => l.map((p) => (p.id === cur.id ? { ...p, name: name.trim() || p.name, text, scope } : p)));
                toast(t('prompt.saved'));
              }}
            >
              <Icon name="check" />
              {t('prompt.save')}
            </Button>
            {original && (
              <Button size="s" disabled={text === original.text && name === original.name} onClick={() => (setText(original.text), setName(original.name), setScope(original.scope))}>
                <Icon name="refresh" />
                {t('prompt.reset')}
              </Button>
            )}
            <ConfirmButton size="s" label={t('prompt.delete')} question={t('prompt.deleteQ', { name: cur.name })} confirmLabel={t('prompt.delete')} onConfirm={() => void write((l) => l.filter((p) => p.id !== cur.id))} />
          </div>
        </div>
      )}
    </div>
  );
}

export function AskStudioSettings() {
  const { t } = useI18n();
  const s = useAskSettings();
  return (
    <div className="stack" data-testid="ask-settings">
      <fieldset className="stack-s" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small">
          <strong>{t('ask.modeTitle')}</strong>
        </legend>
        {ASK_MODES.map((m) => (
          <label key={m} className="check" style={{ alignItems: 'flex-start' }}>
            <input type="radio" name="ask-mode" checked={s.mode === m} onChange={() => void updateAskSettings((x) => ({ ...x, mode: m }))} data-testid={`ask-mode-${m}`} />
            <span className="stack-s" style={{ gap: 2 }}>
              <strong className="small">{t(`ask.mode.${m}` as MessageKey)}</strong>
              <span className="xsmall muted">{t(`ask.modeHelp.${m}` as MessageKey)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {s.mode === 'direct' && (
        <div className="card stack-s" style={{ padding: 12 }}>
          {s.learned ? (
            <>
              <span className="small">{t('ask.learned', { at: new Date(s.learned.learnedAt).toLocaleString() })}</span>
              <div>
                <Button size="s" variant="ghost" onClick={() => void updateAskSettings((x) => ({ ...x, learned: undefined }))}>
                  {t('ask.forget')}
                </Button>
              </div>
            </>
          ) : (
            <span className="small muted">{t('ask.notLearned')}</span>
          )}
        </div>
      )}
      <label className="check">
        <input type="checkbox" role="switch" className="switch" checked={s.showInStudio} onChange={(e) => void updateAskSettings((x) => ({ ...x, showInStudio: e.target.checked }))} data-testid="ask-show-in-studio" />
        <span className="stack-s" style={{ gap: 2 }}>
          <strong className="small">{t('ask.showInStudio')}</strong>
          <span className="xsmall muted">{t('ask.showInStudioHelp')}</span>
        </span>
      </label>
      <p className="xsmall faint">{t('ask.risk')}</p>
      <hr className="divider" />
      <h3>{t('ask.presets')}</h3>
      <PresetEditor />
    </div>
  );
}
