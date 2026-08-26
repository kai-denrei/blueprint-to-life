import { MKVI_SUBJECT } from './mkvi.js';
import { MKCX_SUBJECT } from './mkcx.js';
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
