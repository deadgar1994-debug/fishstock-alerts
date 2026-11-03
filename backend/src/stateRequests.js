import { SUPPORTED_STATES } from './states.js';
export const US_CODES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
export function requestedState(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return US_CODES.has(code) && !Object.hasOwn(SUPPORTED_STATES, code) ? code : null;
}
