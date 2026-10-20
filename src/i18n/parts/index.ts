// Feature catalogs merged into en/fa. One file per area so features can grow their text independently.
import { engage } from './engage';
import { inpage } from './inpage';
import { reports } from './reports';
import { seo } from './seo';
import { shell } from './shell';

export const partsEn = { ...shell.en, ...reports.en, ...seo.en, ...engage.en, ...inpage.en } as const;
export const partsFa = { ...shell.fa, ...reports.fa, ...seo.fa, ...engage.fa, ...inpage.fa };
