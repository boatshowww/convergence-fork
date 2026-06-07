/**
 * Implicit resolution bands.
 *
 * The GM sets a DC (per-skill, at stage time, or on the fly at resolve time); the
 * outcome band falls out of the rules — the player never sees the number, only the
 * tier + the GM's narration. The GM holds the DC locally and broadcasts only the
 * resolved band text, so the DC never crosses the wire.
 *
 * Thresholds (game-design tunables):
 *   - Critical: a natural 15 on the d15, OR total >= dc + CRIT_MARGIN
 *   - Success:  total >= dc
 *   - Partial:  total >= dc - PARTIAL_MARGIN  (a near miss)
 *   - Fail:     a natural 1 on the d15, OR total < dc - PARTIAL_MARGIN
 */
export const CRIT_MARGIN = 5;
export const PARTIAL_MARGIN = 3;

export const BANDS = {
  crit: { key: 'crit', label: 'Critical', cls: 'band-crit' },
  success: { key: 'success', label: 'Success', cls: 'band-success' },
  partial: { key: 'partial', label: 'Partial', cls: 'band-partial' },
  fail: { key: 'fail', label: 'No read', cls: 'band-fail' },
};

/**
 * Derive the outcome band from a rolled total against a DC.
 * @param {number} total - the d15 total (including explosions)
 * @param {number} dc - the GM's difficulty
 * @param {{crit?:boolean, fail?:boolean}} [d15] - natural crit/fail flags from the d15
 * @returns {{key:string,label:string,cls:string}} a BANDS entry
 */
export function deriveBand(total, dc, d15 = {}) {
  if (d15.fail) return BANDS.fail; // natural 1 is an automatic non-pass
  if (d15.crit || total >= dc + CRIT_MARGIN) return BANDS.crit;
  if (total >= dc) return BANDS.success;
  if (total >= dc - PARTIAL_MARGIN) return BANDS.partial;
  return BANDS.fail;
}
