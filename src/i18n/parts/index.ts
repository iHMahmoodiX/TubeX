// Feature catalogs merged into en/fa. One file per area so features can grow their text independently.
import { engage } from './engage';
import { inpage } from './inpage';
import { reports } from './reports';
import { seo } from './seo';
import { shell } from './shell';
import { studioContent } from './studioContent';
import { tagTools } from './tagTools';
import { channelInsights } from './channelInsights';
import { launchers } from './launchers';
import { bulk } from './bulk';
import { signin } from './signin';

export const partsEn = { ...shell.en, ...reports.en, ...seo.en, ...engage.en, ...inpage.en, ...studioContent.en, ...tagTools.en, ...channelInsights.en, ...launchers.en, ...bulk.en, ...signin.en } as const;
export const partsFa = { ...shell.fa, ...reports.fa, ...seo.fa, ...engage.fa, ...inpage.fa, ...studioContent.fa, ...tagTools.fa, ...channelInsights.fa, ...launchers.fa, ...bulk.fa, ...signin.fa };
