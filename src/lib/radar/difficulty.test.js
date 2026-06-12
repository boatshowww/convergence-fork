import { describe, it, expect } from 'vitest';
import { suggestDc, ACTION_BASE_DC, DC_MIN, DC_MAX } from './difficulty.js';

const at = (x, y, vx = 0, vy = 0, extra = {}) => ({ x, y, vx, vy, ...extra });

describe('suggestDc', () => {
  it('point-blank matched-velocity shot is the base DC', () => {
    const r = suggestDc('weapons', at(0, 0, 40, 0), at(100, 0, 40, 0));
    expect(r.dc).toBe(ACTION_BASE_DC.weapons);
  });

  it('range raises the DC', () => {
    const near = suggestDc('weapons', at(0, 0), at(500, 0)).dc;
    const far = suggestDc('weapons', at(0, 0), at(4500, 0)).dc;
    expect(far).toBeGreaterThan(near);
  });

  it('relative velocity raises the DC', () => {
    const slow = suggestDc('weapons', at(0, 0, 40, 0), at(1000, 0, 45, 0)).dc;
    const fast = suggestDc('weapons', at(0, 0, 40, 0), at(1000, 0, -80, 30)).dc;
    expect(fast).toBeGreaterThan(slow);
  });

  it('attacker weapon ports lower the weapons DC (better fire control)', () => {
    const lightly = suggestDc('weapons', at(0, 0, 0, 0, { weaponPorts: 1 }), at(2000, 0)).dc;
    const barge = suggestDc('weapons', at(0, 0, 0, 0, { weaponPorts: 12 }), at(2000, 0)).dc;
    expect(barge).toBeLessThan(lightly);
  });

  it('network attacks ignore weapon ports', () => {
    const a = suggestDc('network', at(0, 0, 0, 0, { weaponPorts: 12 }), at(2000, 0)).dc;
    const b = suggestDc('network', at(0, 0, 0, 0, { weaponPorts: 0 }), at(2000, 0)).dc;
    expect(a).toBe(b);
  });

  it('clamps to the DC range', () => {
    const min = suggestDc('weapons', at(0, 0, 0, 0, { weaponPorts: 40 }), at(10, 0)).dc;
    const max = suggestDc('network', at(0, 0, 200, 200), at(60000, 0, -200, -200)).dc;
    expect(min).toBeGreaterThanOrEqual(DC_MIN);
    expect(max).toBeLessThanOrEqual(DC_MAX);
  });
});
