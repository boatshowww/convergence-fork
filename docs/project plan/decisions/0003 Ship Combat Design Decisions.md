# 0003 — Ship Combat Design Decisions

Decision record for the tactical-radar combat subsystem. Companion to the living
specs [[SHIP_COMBAT_UX]] (flow) and [[Ship Weapons]] (catalog / balance levers);
grounded in [[GM Mockup]], the Game Design Document, and the Ship-Combat class
diagram. These docs are **incomplete by design and will keep evolving** — this file
records *why* we chose what we chose, so future changes are deliberate.

**Date:** 2026-06-17 · **Driver:** Scott · **Status:** accepted (implementation not started)

---

## Context
The radar is the combat centerpiece, but combat resolution was undefined: no damage,
no HP depletion, no range/end conditions, and the **GM had no way to play enemy
vessels** (it could only author scenes and adjudicate player checks). We needed to
define how targeting and HP depletion work, and how the GM controls bogeys
symmetrically with players.

## Decisions

### D1 — Stations, not "tap ship → all actions"
Each player mans **one** station; that defines their one action per turn. Canonical
stations (from [[GM Mockup]]): **Helm · Targeting · Shields · Network · Comms**.
- **Unmanned station → ship AI makes a default check** (weaker than a skilled crew member).
- Identical for player ships **and** GM bogeys.
- *Why:* matches the existing mockup + class diagram; makes a crew feel like a crew;
  gives short-crewed ships (and all bogeys) a sane fallback.

### D2 — GM plays the bogeys (symmetry)
Tapping a GM-owned bogey opens the **same** station/action menu players get; bogey
maneuvers + actions join the WEGO planning phase. *Why:* Scott's core ask — the GM
must target/hack/maneuver enemy ships the same way players do. (Today only a player
tapping their own ship opens a menu — the gap this closes.)

### D3 — Weapons are equipped, not implied by port count
A hull has **weapon docks** that **may be empty**; the **equipped weapon + ammunition
+ current targeting** determine the interaction. Three types, differentiated by the
GDD rule *"shields stop energy, not matter"*: **Energy** (absorbed by shields →
shield-stripper), **Kinetic** (bypasses shields → hull-killer, uses magazines),
**Ordnance/Torpedoes** (finisher, scarce). Catalog + numbers in [[Ship Weapons]].
*Why:* depth and identity come from loadout, not a raw dock count; gives a real
attack/defense rock-paper-scissors.

### D4 — Damage = the to-hit band, made mechanical
The to-hit **check** (gunner skill vs geometry DC from `difficulty.js`) yields a band;
the band scales the equipped weapon's damage: **Critical** max + system-crit ·
**Success** full · **Partial** half · **Miss** 0. Apply by type: energy → **shields
first, overflow hull**; kinetic/ordnance → **hull**. `hull ≤ 0` → **destroyed**
(escape pods). Shields recover only via the **Shields** station. *Why:* reuses the
existing hidden-DC → band pipeline; keeps "never show bare success/fail."

### D5 — Enemy info hidden until scanned
Players see `?? / ??` for an enemy's hull/shields/loadout until a successful **scan**
reveals them (and the reveal goes stale). *Why:* preserves the hidden-info / fog-of-war
ethos; makes recon a meaningful action. (Ties into radar fog of war, P5.)

### D6 — Batch resolution at Execute Turn
Combat actions are declared during planning and resolved **simultaneously** when the
GM clicks **Execute Turn** (fixed order: move → hacks → shields → weapons → narration).
*Why:* Scott's call; fits WEGO. **Trade-off (accepted):** gives up the per-check
"roll → pause → narrate one at a time" beat — that beat stays for **non-combat** skill
checks ([[PLAYER_CHECK_UX]]). Hidden DC + narrated bands still hold.

### D7 — No schema change (GM-authoritative, ephemeral)
The radar entity gains `hull/maxHull/shields/maxShields`, a `stations` map,
`weaponDocks[]`, and `scannedBy` **in the radar model only** — GM-authoritative,
localStorage-autosaved, snapshot-synced. The persisted `ship` table already carries
hp/shields columns for the eventual migration. *Why:* consistent with the radar's
"no schema change now" decision; fastest path to playable.

## Open questions (not yet decided — carry to playtest)
1. **Gunnery skill:** dedicated *Gunnery* vs. reuse *Heavy Weapons* (current in code).
2. **Subsystem targeting depth:** single HP pool vs. knock-out of engines/weapons/stations.
3. **Ammo in v1:** track magazines now vs. infinite/energy-only for first playable.
4. **Kinetic vs shields:** ignore shields entirely (leaning) vs. stop a token fraction.
5. **Scan station:** Network vs. Comms.
6. **Station assignment:** players self-assign vs. GM-only.
7. **Weapon roster/numbers:** confirm/extend the six starter weapons in [[Ship Weapons]].
8. **Helm "Evade":** distinct declared action vs. baked into the maneuver.
9. **Initiative variant** vs. pure simultaneous (class diagram mentions initiative; D6 leans pure).

## Proposed build order
After radar **P5 fog / P6 polish** (unless reprioritized): C1 entity hull/shields + bars →
C2 stations + crew assignment + AI default → C3 GM plays bogeys → C4 weapons/ammo +
batched damage → C5 scan-to-reveal + system crits → C6 Shields/Network/Comms + range/end.

## Related session decisions (radar/infra, 2026-06-17)
- **Ship inventory** is a separate deferred initiative (GM authors/customizes ships →
  assigns to players; radar reads the owned `ship` record). Player-ship stats currently
  use a labeled DEMO default (`PLAYER_SHIP_DEFAULT`) until then.
- **Exit-trajectory arc** added to the plot flow for legibility (reachable headings shown).
- **Tailscale access:** app points at the Supabase VM's Tailscale IP (`100.102.156.51:8000`)
  and `PUBLIC_URL` at the app VM's (`100.99.26.107:3000`); GoTrue allowlist updated.
