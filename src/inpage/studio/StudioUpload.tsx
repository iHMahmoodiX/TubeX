// Upload dialog (details step): "Apply upload profile" fills the new video's description and tags from a
// TubeX template on click. The user continues and publishes with Studio's own buttons.
import { Icon } from '../../components/icons';
import { useI18n } from '../../i18n';
import { uploadDialogRoot } from '../../platform/youtubeDomInpage';
import { Mark, useStored } from '../common';
import { useInpageEnabled } from '../InpageRoot';
import { ProfilePicker } from './ProfilePicker';

export function StudioUpload() {
  const on = useInpageEnabled('studioUpload');
  const { t } = useI18n();
  const [open, setOpen] = useStored<boolean>('upload.open', true);
  if (!on) return null;
  return (
    <section className="tx-card tx-upload" aria-label={t('inpage.upload.label')}>
      <div className="tx-head">
        <Mark />
        <span className="small bold">{t('inpage.upload.title')}</span>
        <span className="grow" />
        <button type="button" className="icon-btn tx-toggle" aria-expanded={open} aria-label={open ? t('inpage.hideDetails') : t('inpage.showDetails')} title={open ? t('inpage.hideDetails') : t('inpage.showDetails')} onClick={() => setOpen(!open)}>
          <Icon name="down" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>
      {open && (
        <>
          <p className="small muted">{t('inpage.upload.desc')}</p>
          <ProfilePicker getRoot={() => uploadDialogRoot(document)} />
        </>
      )}
    </section>
  );
}
