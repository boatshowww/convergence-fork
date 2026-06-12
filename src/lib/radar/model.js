/**
 * Tactical radar — engagement/entity model and game constants.
 *
 * Pure data module (no Svelte, no Phaser). World units are kilometers; velocities
 * are km/s; turns are TURN_SECONDS of in-fiction time (WEGO: everyone plots, then
 * the GM executes the turn and all movement resolves simultaneously).
 *
 * Design source: docs/Architecture/Mockups/mockup - Radar Action Notes.md
 */

/** Radar draw distance from the viewer's ship (mockup: 5,000 km). */
export const DRAW_DISTANCE_KM = 5000;

/** In-fiction duration of one WEGO turn (mockup: 15 seconds). */
export const TURN_SECONDS = 15;

/** Range-ring spacing on the radar display. */
export const RING_SPACING_KM = 1000;

/**
 * Entity kinds for ship engagements (character mode reuses the same shape later).
 * 'object' = custom GM-authored contact (station, asteroid, marker, …).
 */
export const ENTITY_KINDS = ['ship', 'bogey', 'debris', 'object'];

/** Kinds with engines: they have maneuver characteristics (accelG, fuel) and can plot. */
export const POWERED_KINDS = ['ship', 'bogey'];

let seq = 0;
const uid = (p) => `${p}${Date.now().toString(36)}${(++seq).toString(36)}`;

/**
 * Create an engagement (a staged scene).
 * status: 'setup' (GM authoring, invisible to players) | 'active' | 'ended'
 * phase:  'planning' | 'executing' (only meaningful while active)
 */
export function createEngagement({ kind = 'ship', name = 'Engagement' } = {}) {
  return {
    id: uid('eng'),
    kind,
    name,
    status: 'setup',
    turn: 1,
    phase: 'planning',
    entities: [],
    fog: { enabled: false, strokes: [] },
  };
}

/**
 * Create an entity on the radar plane.
 * - ship: player-crewed vessel (ownerSeatId links it to a player seat)
 * - bogey: hostile/unknown contact (GM-controlled)
 * - debris: inert hazard (drifts, never plots)
 * Positions in km (scene-local plane, origin = scene center); velocity in km/s.
 */
export function createEntity({
  kind = 'ship', name = 'Contact', x = 0, y = 0, vx = 0, vy = 0,
  ownerSeatId = null, accelG = 8, fuel = 100,
  topSpeed = null, cargoBays = 0, weaponPorts = 0, archetype = null,
} = {}) {
  return {
    id: uid('ent'), kind, name, x, y, vx, vy, ownerSeatId, accelG, fuel,
    topSpeed, cargoBays, weaponPorts, archetype,
  };
}

/** Plain-object snapshot of an engagement (broadcast / localStorage safe). */
export function snapshotEngagement(eng) {
  return JSON.parse(JSON.stringify(eng));
}

export const speedOf = (e) => Math.hypot(e.vx, e.vy);
export const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
