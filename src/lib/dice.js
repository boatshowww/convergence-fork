/**
 * Convergence dice engine.
 *
 * Pure, framework-agnostic implementation of the Convergence check dice, ported
 * from the player-interface prototype and the GDD (see
 * docs/Architecture/Mockups/PLAYER_CHECK_UX.md §9 "Dice resolution reference").
 *
 * Mechanics:
 *  - d15: 1..15. A 15 is a critical success and EXPLODES (roll again and add,
 *    repeat while you keep rolling 15s). A first roll of 1 is a critical failure
 *    (an automatic non-pass — but that adjudication lives with the DC/band logic,
 *    not here; this module only reports the `fail` flag).
 *  - Luck d30: rolled in the background on every CHECK. The character's luck stat
 *    is added; if the total reaches 30 it is a "cosmic moment" that grants a
 *    re-roll token.
 *
 * Every function takes an injectable `random` (a function returning a float in
 * [0, 1), defaulting to Math.random) so callers/tests can make rolls
 * deterministic. Nothing here touches Svelte, the DOM, or the network.
 */

/** Default randomness source. */
const defaultRandom = Math.random;

/** Safety cap on d15 explosions so a pathological RNG can't loop forever. */
export const MAX_EXPLOSIONS = 100;

/**
 * Roll a single fair die.
 * @param {number} sides - number of faces (>= 1)
 * @param {() => number} [random] - returns a float in [0, 1)
 * @returns {number} an integer in [1, sides]
 */
export function rollDie(sides, random = defaultRandom) {
  return Math.floor(random() * sides) + 1;
}

/**
 * Roll the exploding d15.
 * @param {() => number} [random]
 * @param {{ maxExplosions?: number }} [options]
 * @returns {{ chain: number[], total: number, crit: boolean, fail: boolean }}
 *   chain  - every face rolled, in order (e.g. [15, 9] for a 15 then a 9)
 *   total  - sum of the chain
 *   crit   - true if the FIRST roll was 15 (a critical success)
 *   fail   - true if the FIRST roll was 1 (a critical failure)
 */
export function rollD15(random = defaultRandom, { maxExplosions = MAX_EXPLOSIONS } = {}) {
  const chain = [];
  let total = 0;
  let face;
  do {
    face = rollDie(15, random);
    chain.push(face);
    total += face;
  } while (face === 15 && chain.length < maxExplosions);

  return {
    chain,
    total,
    crit: chain[0] === 15,
    fail: chain[0] === 1,
  };
}

/**
 * Roll the background luck d30 and add the character's luck stat.
 * @param {number} [luckStat] - added to the raw roll
 * @param {() => number} [random]
 * @returns {{ base: number, luckStat: number, sum: number, cosmic: boolean }}
 *   base   - the raw d30 face (1..30)
 *   sum    - base + luckStat, capped at 30
 *   cosmic - true when sum reaches 30 (grants a cosmic re-roll token)
 */
export function rollLuck(luckStat = 0, random = defaultRandom) {
  const base = rollDie(30, random);
  const sum = Math.min(30, base + luckStat);
  return { base, luckStat, sum, cosmic: sum >= 30 };
}

/**
 * Roll a full CHECK: the exploding d15 plus the background luck d30.
 * The same `random` source feeds the d15 (and its explosions) first, then the
 * luck die.
 * @param {{ luckStat?: number }} [params]
 * @param {() => number} [random]
 * @returns {{ d15: ReturnType<typeof rollD15>, luck: ReturnType<typeof rollLuck> }}
 */
export function rollCheck({ luckStat = 0 } = {}, random = defaultRandom) {
  return {
    d15: rollD15(random),
    luck: rollLuck(luckStat, random),
  };
}
