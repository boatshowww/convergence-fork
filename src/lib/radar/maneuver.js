/**
 * Ship maneuver math for the tactical radar (pure functions, no UI).
 *
 * GAME-FEEL, NOT PHYSICS: constants are tuned so the mockup's reference numbers
 * hold (a 46 km/s ship has a 690 km navigable radius in a 15 s turn; a hard course
 * change reads ~8 G and ~5% fuel — see mockup - Radar Action Notes.md). Real
 * relativistic/Newtonian numbers would be illegible at the table; the relationships
 * (faster = farther; sharper velocity change = more G and fuel) are what matter.
 */
import { TURN_SECONDS, speedOf } from './model.js';

/** Δv budget (km/s per turn) granted per point of a ship's accelG rating. */
export const DELTA_V_PER_G = 4;

/** Fuel % consumed per km/s of velocity change. */
export const FUEL_PER_KMS = 0.17;

/** Max Δv (km/s) this entity can apply in one turn. */
export const maxDeltaV = (entity) => (entity.accelG ?? 0) * DELTA_V_PER_G;

/**
 * Inner circle: how far the ship travels this turn at current speed (mockup:
 * 46 km/s × 15 s = 690 km). Display-faithful "navigable radius".
 */
export const navigableRadius = (entity, t = TURN_SECONDS) => speedOf(entity) * t;

/**
 * Plot-course bounds: the selectable region for this turn's end point — current
 * reach plus what the thrust budget can add. Centered on the entity.
 */
export const plotBounds = (entity, t = TURN_SECONDS) => ({
  cx: entity.x,
  cy: entity.y,
  radius: (speedOf(entity) + maxDeltaV(entity)) * t,
});

/**
 * Evaluate a candidate maneuver: end the turn at `target`, exiting along `exitDir`
 * (defaults to the travel direction). Returns the HUD numbers + validity.
 * - newVel: exit velocity (direction = exitDir, magnitude = avg speed to reach target)
 * - gForce: velocity-change intensity in G (game-feel: Δv / DELTA_V_PER_G)
 * - fuelCost: fuel units (capacity is the entity's tank size)
 * - valid: inside plot bounds, within the ship's thrust rating, within its top
 *   speed (archetype balance axis: a freighter physically cannot sprint), and
 *   affordable from the remaining tank
 */
export function evaluateManeuver(entity, target, exitDir = null, t = TURN_SECONDS) {
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.hypot(dx, dy);
  const newSpeed = dist / t;

  let dirX, dirY;
  const ex = exitDir?.x ?? dx, ey = exitDir?.y ?? dy;
  const elen = Math.hypot(ex, ey);
  if (elen > 0) { dirX = ex / elen; dirY = ey / elen; }
  else { dirX = 0; dirY = 0; }

  const newVel = { vx: dirX * newSpeed, vy: dirY * newSpeed };
  const deltaV = Math.hypot(newVel.vx - entity.vx, newVel.vy - entity.vy);
  const gForce = deltaV / DELTA_V_PER_G;
  const fuelCost = deltaV * FUEL_PER_KMS;
  const bounds = plotBounds(entity, t);
  const withinTopSpeed = entity.topSpeed == null || newSpeed <= entity.topSpeed;
  const valid = dist <= bounds.radius && gForce <= (entity.accelG ?? 0)
    && fuelCost <= (entity.fuel ?? 0) && withinTopSpeed;

  return { target: { ...target }, newVel, newSpeed, deltaV, gForce, fuelCost, valid };
}

/** Drift an entity for t seconds (no maneuver): position advances along velocity. */
export const driftStep = (entity, t = TURN_SECONDS) => ({
  ...entity,
  x: entity.x + entity.vx * t,
  y: entity.y + entity.vy * t,
});

/**
 * WEGO turn resolution (pure): entities with a confirmed plot jump to their target
 * with their new exit velocity (and pay fuel); everyone else drifts.
 * @param {Array} entities
 * @param {Map<string, {target:{x,y}, newVel:{vx,vy}, fuelCost:number}>} plots by entity id
 * @returns {Array} new entity array
 */
export function resolveTurn(entities, plots, t = TURN_SECONDS) {
  return entities.map((e) => {
    const plot = plots?.get?.(e.id) ?? plots?.[e.id];
    if (!plot) return driftStep(e, t);
    return {
      ...e,
      x: plot.target.x,
      y: plot.target.y,
      vx: plot.newVel.vx,
      vy: plot.newVel.vy,
      fuel: Math.max(0, (e.fuel ?? 0) - (plot.fuelCost ?? 0)),
    };
  });
}
