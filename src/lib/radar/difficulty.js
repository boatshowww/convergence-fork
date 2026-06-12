/**
 * Suggested difficulty for radar combat actions, derived from scene geometry.
 *
 * The GM always has the final say (the suggestion pre-fills the DC field in the
 * resolve queue, editable) — this just turns range / relative velocity / hull
 * armament into a sane starting number. Tunable constants, like bands.js.
 */
import { distanceBetween } from './model.js';

/** Base DC per action (before geometry). */
export const ACTION_BASE_DC = {
  weapons: 9,   // Target Weapons — a firing solution
  network: 11,  // Network Attack — intrusion at range
};

/** The check skill each radar action rolls. */
export const ACTION_SKILLS = {
  weapons: 'Heavy Weapons',
  network: 'Hacking',
};

export const ACTION_LABELS = {
  weapons: 'Target Weapons',
  network: 'Network Attack',
};

/** +1 DC per this many km of range. */
export const RANGE_STEP_KM = 1500;
/** +1 DC per this many km/s of relative velocity. */
export const REL_VEL_STEP = 40;
/** Weapons only: -1 DC per this many weapon ports on the attacker (better fire control). */
export const PORTS_PER_DC = 4;

export const DC_MIN = 5;
export const DC_MAX = 25;

/**
 * Suggested DC for `action` by `attacker` against `target`.
 * @returns {{ dc:number, range:number, relSpeed:number, breakdown:string }}
 */
export function suggestDc(action, attacker, target) {
  const base = ACTION_BASE_DC[action] ?? 10;
  const range = distanceBetween(attacker, target);
  const relSpeed = Math.hypot((target.vx ?? 0) - (attacker.vx ?? 0), (target.vy ?? 0) - (attacker.vy ?? 0));
  const rangeMod = Math.round(range / RANGE_STEP_KM);
  const velMod = Math.round(relSpeed / REL_VEL_STEP);
  const portMod = action === 'weapons' ? -Math.floor((attacker.weaponPorts ?? 0) / PORTS_PER_DC) : 0;
  const dc = Math.max(DC_MIN, Math.min(DC_MAX, base + rangeMod + velMod + portMod));
  const breakdown = `base ${base} + range ${rangeMod} + closure ${velMod}${portMod ? ` − ports ${-portMod}` : ''}`;
  return { dc, range: Math.round(range), relSpeed: Math.round(relSpeed), breakdown };
}
