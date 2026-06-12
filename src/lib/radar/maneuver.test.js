import { describe, it, expect } from 'vitest';
import { createEntity } from './model.js';
import {
  navigableRadius, plotBounds, evaluateManeuver, driftStep, resolveTurn, maxDeltaV,
} from './maneuver.js';

/** The mockup's reference ship: 46 km/s, 8 G rating. */
const ship = (over = {}) => createEntity({ kind: 'ship', x: 0, y: 0, vx: 46, vy: 0, accelG: 8, fuel: 100, ...over });

describe('navigableRadius (mockup reference)', () => {
  it('46 km/s over a 15 s turn = 690 km — the mockup inner circle', () => {
    expect(navigableRadius(ship())).toBe(690);
  });
  it('scales with speed; zero when stationary', () => {
    expect(navigableRadius(ship({ vx: 80, vy: 0 }))).toBe(1200);
    expect(navigableRadius(ship({ vx: 0, vy: 0 }))).toBe(0);
  });
});

describe('plotBounds', () => {
  it('adds the thrust budget to current reach', () => {
    const b = plotBounds(ship());
    expect(b.radius).toBe((46 + maxDeltaV(ship())) * 15); // (46 + 32) * 15 = 1170
    expect(b.cx).toBe(0);
  });
});

describe('evaluateManeuver (mockup HUD numbers)', () => {
  it('straight-line burn 46→75 km/s reads ~8 G and ~5% fuel (mockup panel)', () => {
    const m = evaluateManeuver(ship(), { x: 75 * 15, y: 0 }); // 1125 km dead ahead
    expect(m.newSpeed).toBeCloseTo(75, 5);
    expect(m.gForce).toBeGreaterThan(6.5);
    expect(m.gForce).toBeLessThan(8.5);
    expect(m.fuelCost).toBeGreaterThan(4);
    expect(m.fuelCost).toBeLessThan(6);
    expect(m.valid).toBe(true);
  });

  it('pure drift (target = drift point, same exit dir) costs nothing', () => {
    const m = evaluateManeuver(ship(), { x: 690, y: 0 });
    expect(m.deltaV).toBeCloseTo(0, 9);
    expect(m.gForce).toBeCloseTo(0, 9);
    expect(m.fuelCost).toBeCloseTo(0, 9);
    expect(m.valid).toBe(true);
  });

  it('target outside plot bounds is invalid', () => {
    const m = evaluateManeuver(ship(), { x: 2000 * 15, y: 0 });
    expect(m.valid).toBe(false);
  });

  it('a velocity reversal exceeds the G rating and is invalid', () => {
    const m = evaluateManeuver(ship(), { x: -400, y: 0 }, { x: -1, y: 0 });
    expect(m.gForce).toBeGreaterThan(8);
    expect(m.valid).toBe(false);
  });

  it('top speed caps the envelope: a freighter cannot sprint, a sloop can', () => {
    // 60 km/s requires reaching 900 km in a turn
    const target = { x: 900, y: 0 };
    // same high G rating for both so the check isolates the top-speed cap
    const freighter = ship({ topSpeed: 45, accelG: 9, vx: 40 });
    const sloop = ship({ topSpeed: 95, accelG: 9, vx: 40 });
    expect(evaluateManeuver(freighter, target).valid).toBe(false); // 60 > 45 top speed
    expect(evaluateManeuver(sloop, target).valid).toBe(true);
    // entities without a topSpeed (legacy/default) are uncapped
    expect(evaluateManeuver(ship({ vx: 40 }), target).valid).toBe(true);
  });

  it('exit direction reorients the new velocity at the same speed', () => {
    const m = evaluateManeuver(ship(), { x: 690, y: 0 }, { x: 0, y: 1 });
    expect(m.newVel.vx).toBeCloseTo(0, 6);
    expect(m.newVel.vy).toBeCloseTo(46, 6);
  });
});

describe('driftStep / resolveTurn (WEGO)', () => {
  it('drift advances along velocity', () => {
    const d = driftStep(createEntity({ kind: 'debris', x: 100, y: -50, vx: 2, vy: 4 }));
    expect(d.x).toBe(130);
    expect(d.y).toBe(10);
  });

  it('plotted entities jump to target with exit velocity and pay fuel; others drift', () => {
    const a = ship({ name: 'A' });
    const b = createEntity({ kind: 'debris', name: 'B', x: 0, y: 1000, vx: 0, vy: -10 });
    const plot = evaluateManeuver(a, { x: 600, y: 300 });
    const out = resolveTurn([a, b], new Map([[a.id, plot]]));
    const A = out.find((e) => e.id === a.id), B = out.find((e) => e.id === b.id);
    expect(A.x).toBe(600); expect(A.y).toBe(300);
    expect(Math.hypot(A.vx, A.vy)).toBeCloseTo(plot.newSpeed, 6);
    expect(A.fuel).toBeCloseTo(100 - plot.fuelCost, 6);
    expect(B.y).toBe(1000 - 150); // drifted
  });
});

describe('clampVelocity (GM vector drag / spawn hull limit)', () => {
  it('scales an over-limit velocity down to top speed, preserving direction', async () => {
    const { clampVelocity } = await import('./model.js');
    const freighter = { topSpeed: 45 };
    const v = clampVelocity(freighter, 60, 80); // 100 km/s requested
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(45, 6);
    expect(v.vx / v.vy).toBeCloseTo(60 / 80, 6); // direction preserved
  });
  it('passes through under-limit and uncapped velocities', async () => {
    const { clampVelocity } = await import('./model.js');
    expect(clampVelocity({ topSpeed: 45 }, 10, 0)).toEqual({ vx: 10, vy: 0 });
    expect(clampVelocity({ topSpeed: null }, 500, 0)).toEqual({ vx: 500, vy: 0 });
  });
});
