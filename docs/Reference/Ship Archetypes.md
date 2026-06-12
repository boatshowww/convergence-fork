# Ship Archetypes

Quick-pick stat blocks for staging contacts on the tactical radar. These flesh out the
GDD's **Spacecraft Classes** (Patrol Craft / Cruiser-Freighter / Battleship) into concrete,
playable presets. The Patrol Craft's canonical **100 km/s top speed** anchors the velocity
scale; cargo and armament are expressed through the GDD's **bay / weapon-port** system.

> Source of truth for the live values: `src/lib/radar/archetypes.js` — tune there, then
> mirror edits here. The four columns below are the **gameplay-balance axes**.

| Archetype | GDD class | Top speed (km/s) | G rating | Fuel tank | Cargo bays | Weapon ports |
|---|---|---|---|---|---|---|
| Merchant Freighter | Cruiser/Freighter | 45 | 2 | 160 | 5 | 1 |
| Armed Trader | Cruiser/Freighter | 55 | 3 | 130 | 4 | 3 |
| Pirate Sloop | Patrol Craft | 95 | 9 | 60 | 1 | 3 |
| Patrol Corvette | Patrol Craft | 100 | 7 | 90 | 1 | 4 |
| Raider Cruiser | Cruiser | 70 | 5 | 110 | 3 | 6 |
| Battle Barge | Battleship | 35 | 2 | 220 | 2 | 12 |

## How the stats play on the radar

- **Top speed** is a hard cap on plotted maneuvers: a course requiring a higher exit
  velocity is invalid. *A freighter physically cannot run; a sloop can sprint to 95 km/s.*
- **G rating** sets the Δv budget per 15-second turn (`accelG × 4 km/s`). High-G ships turn
  hard and dodge; low-G ships commit to their vector.
- **Fuel tank** is total maneuver endurance — each km/s of velocity change burns fuel
  (`Δv × 0.17` units). A Battle Barge can maneuver all day; a sloop has short legs.
- **Cargo bays vs weapon ports** is the economic-vs-military axis (GDD bay system). Inert
  on the radar today; weapon ports feed targeting-difficulty math when radar actions land,
  and cargo drives boarding/loot later.

## Design intent

- **Merchant Freighter** — prey. Big, slow, valuable. Drama comes from what defends it.
- **Armed Trader** — prey that bites; punishes a lazy intercept.
- **Pirate Sloop** — the knife-fighter: wins by closing fast, loses any long chase it
  can't end quickly (smallest tank).
- **Patrol Corvette** — the law: fastest hull on the board, balanced fit.
- **Raider Cruiser** — mid-weight predator; outguns traders, outruns barges.
- **Battle Barge** — area denial. You don't outfight it; you stay out of its sky.

Numbers are a first-pass balance — expected to move in playtest.
