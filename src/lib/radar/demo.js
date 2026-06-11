/**
 * Demo engagement + bridge for the mock /player sandbox (no game): lets the radar
 * render and be exercised (and headless-verified) without a GM or a DB. Mirrors the
 * mockup's example scene: player ship at center (46 km/s), Bogey #1 (80 km/s), debris.
 */
import { createEngagement, createEntity } from './model.js';

export function makeDemoBridge() {
  const eng = createEngagement({ kind: 'ship', name: 'Demo · The Lodestone approach' });
  const lodestone = createEntity({ kind: 'ship', name: 'The Lodestone', x: 0, y: 0, vx: 46, vy: 0, accelG: 8, fuel: 100 });
  eng.entities.push(
    lodestone,
    createEntity({ kind: 'bogey', name: 'Bogey #1', x: 2600, y: -1500, vx: -70, vy: 38 }),
    createEntity({ kind: 'debris', name: 'Debris', x: -1800, y: 900, vx: 8, vy: -3 }),
    createEntity({ kind: 'debris', name: 'Debris', x: 900, y: 2300, vx: -5, vy: -6 }),
    createEntity({ kind: 'debris', name: 'Debris', x: -600, y: -2600, vx: 3, vy: 9 }),
  );
  eng.status = 'active';

  const listeners = new Set();
  let selectedId = null;

  return {
    getEngagement: () => eng,
    getViewerEntityId: () => lodestone.id,
    onSelect: (id) => { selectedId = id; },
    getSelectedId: () => selectedId,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    notify: () => listeners.forEach((fn) => fn()),
  };
}
