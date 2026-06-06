import { describe, it, expect } from 'vitest';
import { rollDie, rollD15, rollLuck, rollCheck, MAX_EXPLOSIONS } from './dice.js';

/**
 * Convert a desired die face into a float in [0, 1) that, given that die's
 * `sides`, makes rollDie() return exactly that face.
 * rollDie: floor(random() * sides) + 1, so (face - 1) / sides yields `face`.
 */
function faceFloat(face, sides) {
  return (face - 1) / sides;
}

/**
 * Build a scripted RNG from a list of [face, sides] pairs. Each call returns the
 * float that produces the next requested face. Throws if over-drawn so tests
 * fail loudly instead of silently falling back to Math.random.
 */
function scriptedRandom(pairs) {
  let i = 0;
  return () => {
    if (i >= pairs.length) throw new Error(`scriptedRandom exhausted after ${pairs.length} draws`);
    const [face, sides] = pairs[i++];
    return faceFloat(face, sides);
  };
}

describe('rollDie', () => {
  it('maps the low edge of each band to the right face', () => {
    expect(rollDie(15, () => faceFloat(1, 15))).toBe(1);
    expect(rollDie(15, () => faceFloat(15, 15))).toBe(15);
    expect(rollDie(30, () => faceFloat(30, 30))).toBe(30);
  });

  it('stays within [1, sides] across the whole unit interval with real RNG', () => {
    for (let n = 0; n < 5000; n++) {
      const v = rollDie(15);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(15);
    }
  });
});

describe('rollD15', () => {
  it('does not explode on a normal roll', () => {
    const r = rollD15(scriptedRandom([[9, 15]]));
    expect(r.chain).toEqual([9]);
    expect(r.total).toBe(9);
    expect(r.crit).toBe(false);
    expect(r.fail).toBe(false);
  });

  it('flags a critical failure when the first face is 1', () => {
    const r = rollD15(scriptedRandom([[1, 15]]));
    expect(r.fail).toBe(true);
    expect(r.crit).toBe(false);
    expect(r.total).toBe(1);
  });

  it('explodes on 15 and sums the chain', () => {
    const r = rollD15(scriptedRandom([[15, 15], [15, 15], [3, 15]]));
    expect(r.chain).toEqual([15, 15, 3]);
    expect(r.total).toBe(33);
    expect(r.crit).toBe(true);
    expect(r.fail).toBe(false);
  });

  it('crit is keyed off the FIRST face only', () => {
    // a non-15 opener that happens to roll a 15 later cannot occur (it would have
    // had to explode), so crit must reflect chain[0]; verify with a plain roll
    const r = rollD15(scriptedRandom([[14, 15]]));
    expect(r.crit).toBe(false);
  });

  it('respects the explosion safety cap with an always-15 RNG', () => {
    const alwaysFifteen = () => faceFloat(15, 15);
    const r = rollD15(alwaysFifteen);
    expect(r.chain.length).toBe(MAX_EXPLOSIONS);
    expect(r.total).toBe(15 * MAX_EXPLOSIONS);
    expect(r.crit).toBe(true);
  });
});

describe('rollLuck', () => {
  it('reports a normal (non-cosmic) luck roll', () => {
    const r = rollLuck(3, scriptedRandom([[20, 30]]));
    expect(r.base).toBe(20);
    expect(r.luckStat).toBe(3);
    expect(r.sum).toBe(23);
    expect(r.cosmic).toBe(false);
  });

  it('is cosmic on a natural 30', () => {
    const r = rollLuck(0, scriptedRandom([[30, 30]]));
    expect(r.sum).toBe(30);
    expect(r.cosmic).toBe(true);
  });

  it('is cosmic when the luck stat pushes the sum to 30, capped at 30', () => {
    const r = rollLuck(5, scriptedRandom([[28, 30]])); // 28 + 5 = 33 -> capped 30
    expect(r.sum).toBe(30);
    expect(r.cosmic).toBe(true);
  });

  it('defaults luckStat to 0', () => {
    const r = rollLuck(undefined, scriptedRandom([[10, 30]]));
    expect(r.sum).toBe(10);
    expect(r.cosmic).toBe(false);
  });
});

describe('rollCheck', () => {
  it('returns a d15 and a luck roll, consuming the d15 (incl. explosions) first', () => {
    // d15 explodes 15 -> 2, then the luck d30 rolls 30 (cosmic)
    const random = scriptedRandom([[15, 15], [2, 15], [30, 30]]);
    const r = rollCheck({ luckStat: 0 }, random);
    expect(r.d15.chain).toEqual([15, 2]);
    expect(r.d15.total).toBe(17);
    expect(r.d15.crit).toBe(true);
    expect(r.luck.base).toBe(30);
    expect(r.luck.cosmic).toBe(true);
  });
});
