/**
 * Ship archetypes — GM quick-picks for staging bogeys (and eventually player hulls).
 *
 * Grounded in the GDD's Spacecraft Classes (Patrol Craft / Cruiser-Freighter /
 * Battleship; cargo & armament expressed through the bay/weapon-port system; the
 * Patrol Craft's canonical 100 km/s top speed anchors the velocity scale).
 *
 * BALANCE LIVES HERE. The four axes — velocity (topSpeed), maneuver (accelG),
 * fuel capacity (fuel), and cargo-vs-armament (cargoBays/weaponPorts) — are the
 * gameplay-balance levers; tune freely. See docs/Reference/Ship Archetypes.md.
 */
export const SHIP_ARCHETYPES = [
  { key: 'merchant-freighter', label: 'Merchant Freighter', shipClass: 'Cruiser/Freighter', topSpeed: 45, accelG: 2, fuel: 160, cargoBays: 5, weaponPorts: 1, notes: 'Trundling hauler — huge tank and holds, cannot dodge.' },
  { key: 'armed-trader', label: 'Armed Trader', shipClass: 'Cruiser/Freighter', topSpeed: 55, accelG: 3, fuel: 130, cargoBays: 4, weaponPorts: 3, notes: 'A merchant that shoots back.' },
  { key: 'pirate-sloop', label: 'Pirate Sloop', shipClass: 'Patrol Craft', topSpeed: 95, accelG: 9, fuel: 60, cargoBays: 1, weaponPorts: 3, notes: 'Fast, vicious, fragile, short legs.' },
  { key: 'patrol-corvette', label: 'Patrol Corvette', shipClass: 'Patrol Craft', topSpeed: 100, accelG: 7, fuel: 90, cargoBays: 1, weaponPorts: 4, notes: 'CAR security interceptor.' },
  { key: 'raider-cruiser', label: 'Raider Cruiser', shipClass: 'Cruiser', topSpeed: 70, accelG: 5, fuel: 110, cargoBays: 3, weaponPorts: 6, notes: 'Hauler-killer; middling everything.' },
  { key: 'battle-barge', label: 'Battle Barge', shipClass: 'Battleship', topSpeed: 35, accelG: 2, fuel: 220, cargoBays: 2, weaponPorts: 12, notes: 'A wall of guns. Glacial.' },
];

/**
 * INTERIM/DEMO ONLY. A player ship's stats should come from a persisted, player-
 * owned `ship` record (GM authors & customizes ships, then assigns them to a
 * player/crew — e.g. on purchase). Until that ship-inventory model exists, a
 * freshly-spawned player ship gets this fallback hull so it always has real
 * maneuver limits (notably a `topSpeed`, so the GM's vector drag is clamped like a
 * bogey's). Remove once spawn pulls stats from the assigned ship record.
 */
export const PLAYER_SHIP_DEFAULT = { archetype: 'player-cutter', topSpeed: 90, accelG: 8, fuel: 100, cargoBays: 2, weaponPorts: 3 };

export const getArchetype = (key) => SHIP_ARCHETYPES.find((a) => a.key === key) ?? null;

/** Entity props for spawning a contact from an archetype. */
export function archetypeEntityProps(key) {
  const a = getArchetype(key);
  if (!a) return {};
  return {
    name: a.label,
    archetype: a.key,
    topSpeed: a.topSpeed,
    accelG: a.accelG,
    fuel: a.fuel,
    cargoBays: a.cargoBays,
    weaponPorts: a.weaponPorts,
  };
}
