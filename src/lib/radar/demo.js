/**
 * Demo engagement for the mock /player sandbox (no game, no GM, no net): a real
 * RadarController in player role preloaded with the mockup's example scene, so the
 * full plot-course flow can be exercised (and headless-verified) locally. With no
 * net attached, confirmed plots simply stay local.
 */
import { createEngagement, createEntity } from './model.js';
import { revealCircle } from './fog.js';
import { RadarController } from './radarState.svelte.js';

const DEMO_SEAT = 'demo-seat';

export function makeDemoRadar() {
  const radar = new RadarController({ role: 'player', gameId: null, seatId: DEMO_SEAT });

  const eng = createEngagement({ kind: 'ship', name: 'Demo · The Lodestone approach' });
  eng.entities.push(
    createEntity({ kind: 'ship', name: 'The Lodestone', x: 0, y: 0, vx: 46, vy: 0, accelG: 8, fuel: 100, ownerSeatId: DEMO_SEAT }),
    createEntity({ kind: 'bogey', name: 'Bogey #1', x: 2600, y: -1500, vx: -70, vy: 38 }),
    createEntity({ kind: 'debris', name: 'Debris', x: -1800, y: 900, vx: 8, vy: -3 }),
    createEntity({ kind: 'debris', name: 'Debris', x: 900, y: 2300, vx: -5, vy: -6 }),
    createEntity({ kind: 'debris', name: 'Debris', x: -600, y: -2600, vx: 3, vy: 9 }),
  );
  eng.status = 'active';

  // Demo fog: a sensor bubble around our ship + a scanned lane out to the bogey, so
  // the debris drifting in the dark stays hidden — shows fog of war at a glance.
  eng.fog.enabled = true;
  revealCircle(eng.fog, 0, 0, 1500);
  revealCircle(eng.fog, 1400, -900, 1100);
  revealCircle(eng.fog, 2500, -1500, 900);

  radar.engagement = eng;

  return radar;
}
