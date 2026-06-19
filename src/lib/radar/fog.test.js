import { describe, it, expect } from 'vitest';
import {
  createFog, startStroke, extendStroke, undoStroke, clearFog, revealCircle, isRevealed, DEFAULT_BRUSH_KM,
} from './fog.js';

describe('fog of war', () => {
  it('disabled fog reveals everything', () => {
    const fog = createFog();
    expect(fog.enabled).toBe(false);
    expect(isRevealed(fog, 9999, 9999)).toBe(true);
  });

  it('reveals inside a painted circle and hides outside', () => {
    const fog = createFog();
    fog.enabled = true;
    revealCircle(fog, 0, 0, 500);
    expect(isRevealed(fog, 100, 100)).toBe(true);   // inside
    expect(isRevealed(fog, 500, 0)).toBe(true);      // on the edge
    expect(isRevealed(fog, 800, 0)).toBe(false);     // outside
  });

  it('a stroke reveals the union of circles along its points', () => {
    const fog = createFog();
    fog.enabled = true;
    startStroke(fog, 0, 0, 300);
    extendStroke(fog, 600, 0); // far enough to add a point (>¼ brush)
    expect(fog.strokes[0].pts.length).toBe(2);
    expect(isRevealed(fog, 600, 0)).toBe(true);  // second point
    expect(isRevealed(fog, 1200, 0)).toBe(false);
  });

  it('throttles points closer than ¼ brush', () => {
    const fog = createFog();
    startStroke(fog, 0, 0, 400);
    extendStroke(fog, 50, 0); // 50 < 100 (¼·400) → ignored
    expect(fog.strokes[0].pts.length).toBe(1);
  });

  it('undo drops the last stroke; clear empties them', () => {
    const fog = createFog();
    fog.enabled = true;
    revealCircle(fog, 0, 0, 500);
    revealCircle(fog, 2000, 0, 500);
    undoStroke(fog);
    expect(fog.strokes.length).toBe(1);
    expect(isRevealed(fog, 2000, 0)).toBe(false);
    clearFog(fog);
    expect(fog.strokes.length).toBe(0);
    expect(isRevealed(fog, 0, 0)).toBe(false); // enabled but nothing painted
  });

  it('exposes a sane default brush', () => {
    expect(DEFAULT_BRUSH_KM).toBeGreaterThan(0);
  });
});
