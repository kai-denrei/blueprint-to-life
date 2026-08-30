import { MKVI_SUBJECT } from './mkvi.js';
import { MKCX_SUBJECT } from './mkcx.js';
import { HEPTAT_SUBJECT } from './heptat.js';
import { HEPTAPOD_SUBJECT } from './heptapod.js';
import { HEADLESS_SUBJECT } from './headless.js';
import { MOTOPOD_SUBJECT } from './motopod.js';
import { ROBOTARM_SUBJECT } from './robotarm.js';
import { GIMBAL_SUBJECT } from './gimbal.js';
import { SERVER_SUBJECT } from './server.js';
import { CONTAINER_SUBJECT } from './container.js';
import { HOWITZER_SUBJECT } from './howitzer.js';
import { BOX_SUBJECT } from './box.js';

/**
 * The subject registry.
 *
 * The chrome's subject switcher used to be a hardcoded list of three ids, which meant adding a
 * vehicle touched display code for no reason other than a menu. It reads this instead.
 */
export const SUBJECTS = {
  mkvi: { label: 'MK-VI', subject: MKVI_SUBJECT },
  mkcx: { label: 'MK-CX', subject: MKCX_SUBJECT },
  heptat: { label: 'HEPTA-T', subject: HEPTAT_SUBJECT },
  heptapod: { label: 'HEPTAPOD', subject: HEPTAPOD_SUBJECT },
  headless: { label: 'BP-H01', subject: HEADLESS_SUBJECT },
  motopod: { label: 'MOTOPOD', subject: MOTOPOD_SUBJECT },
  robotarm: { label: 'RA-6 ARM', subject: ROBOTARM_SUBJECT },
  gimbal: { label: 'GS-3 GIMBAL', subject: GIMBAL_SUBJECT },
  server: { label: 'SERVER01', subject: SERVER_SUBJECT },
  container: { label: 'CX-20', subject: CONTAINER_SUBJECT },
  howitzer: { label: 'HOWITZER', subject: HOWITZER_SUBJECT },
  box: { label: 'BOX RIG', subject: BOX_SUBJECT },
};

/**
 * Old ids that still have to resolve. `?subject=tank` is live on a published page, so it keeps
 * working rather than 404-ing into the default and quietly showing the wrong vehicle.
 */
const ALIASES = { tank: 'mkvi' };

export const DEFAULT_SUBJECT = 'mkvi';

export function resolveSubject(id) {
  const key = ALIASES[id] || id;
  return SUBJECTS[key] ? { key, ...SUBJECTS[key] } : { key: DEFAULT_SUBJECT, ...SUBJECTS[DEFAULT_SUBJECT] };
}

export function subjectList() {
  return Object.entries(SUBJECTS).map(([id, v]) => ({ id, label: v.label }));
}
