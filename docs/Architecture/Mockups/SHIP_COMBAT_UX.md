# Ship Combat — Design Spec (how a fight actually plays)

> **Status:** DRAFT for Scott's review (2026-06-17), consolidating + extending
> Scott's existing (intentionally incomplete, evolving) docs — it does not replace
> them. Grounded in: GM Mockup (`GM Mockup.md` — HP/Shields/Weapon Docks/Stations),
> the radar mockup (`mockup - Radar Action Notes.md` — Plot Course / Target Weapons /
> Redirect Shields / Network Attack), the Ship-Combat class diagram, and
> `Sprint 03 - Ship Combat Mechanics.md`. Weapon details live in
> `docs/Reference/Ship Weapons.md`. Marked **[PROPOSAL]** = my suggestion, your call.

## One paragraph
Combat happens on the **tactical radar**. Ships are crewed by **stations**; each
player mans **one** station and that defines what they can do this turn. Turns are
**WEGO**: every ship (players *and* the GM's bogeys) plots a maneuver and declares
its station actions during a **planning phase**, then the **GM executes the turn**
and everything resolves **simultaneously**. Actions are **checks** (hidden DC →
implicit band → narration), but for combat the band also carries a **mechanical
effect** — damage to **shields then hull**, until a ship is **destroyed** or breaks
**contact**. Enemy hull/shields are **hidden until scanned**.

## Stations (canonical — from the GM Mockup)
A ship has five stations; each is assigned to one crew member. **An unmanned
station falls to the ship's AI, which makes a default check** (weaker than a skilled
crew member). This is identical for player ships and GM bogeys — the GM *plays* its
ships through the same stations.

| Station | Action on the radar | Drives | Skill **[PROPOSAL]** |
|---------|--------------------|--------|----------|
| **Helm** | Plot Course (maneuver) + Evade | movement, evasion DC | Vessel Piloting |
| **Targeting** | Target Weapons (fires all docks) | to-hit + damage | Heavy Weapons / Gunnery |
| **Shields** | Redirect Shields | shield regen/facing allocation | Hardware Maintenance |
| **Network** | Network Attack (hack) | disable enemy station/system; scan | Hacking |
| **Comms** | Hail / negotiate / coordinate | social + (maybe) scan/sensors | Persuasion |

> **[PROPOSAL]** **Scan** (reveal an enemy's hull/shields/loadout) lives at
> **Network** *or* **Comms** — pick one. Until a target is scanned, players see
> `?? / ??` for its bars (your "Scan to reveal" decision).

### Crew → station assignment
The GM (and/or players, TBD) assign each crew member to a station before/​during an
engagement (class-diagram `assignToStation`; mockup shows `Helm → Player #1`,
`Targeting → Player #3`, etc.). A ship with fewer crew than stations runs the rest
on AI. One player = one station = one action per turn.

## The WEGO turn sequence
1. **Planning phase.** Each ship's manned stations declare intent on the radar:
   - Helm: plot a course (existing bounds → point → exit-arc → confirm flow).
   - Targeting: pick target ship (+subsystem) for the dock volley.
   - Network/Shields/Comms: pick their action + target.
   - Unmanned stations: AI picks a default (e.g., Helm AI holds course; Targeting
     AI fires at the nearest threat).
   - Players **confirm**; the GM sees a readiness list (already exists for Helm).
2. **GM clicks Execute Turn.** (Your "batch at Execute Turn" decision.)
3. **Resolution (simultaneous), in a fixed order so it's deterministic:**
   `Helm/movement → Network (disables apply) → Shields (regen) → Targeting (damage)`.
   All rolls are computed, bands derived vs the hidden DCs, effects applied, and a
   **turn narration** is produced (per-ship outcome lines). Animations play the
   movement + weapon fire together.
4. **Check end conditions**, advance turn, return to planning.

> This trades the per-check "roll → pause → GM narrates one at a time" beat (kept for
> *non-combat* skill checks in `PLAYER_CHECK_UX.md`) for a **batched turn narration**.
> Hidden DC and "no bare success/fail" still hold — players get narrated bands + their
> own bars moving, never raw numbers or enemy DCs.

## Resolution: band → damage **[PROPOSAL]**
The to-hit check (gunner skill vs geometry DC from `difficulty.js`) yields a band;
the band scales the equipped weapon's base damage, then damage is applied **by type**
(energy → shields-first; kinetic/ordnance → hull) per `Ship Weapons.md`:

| Band | Effect |
|------|--------|
| **Critical** | max damage; roll a **system crit** (knock out a subsystem/station) |
| **Success** | full damage |
| **Partial** | half damage (glancing) |
| **No-read / Fail** | miss — 0 (nat-1 may risk a misfire/jam) |

**Shields then hull.** Energy damage depletes `shields` first, overflow to `hull`.
Kinetic/ordnance goes (mostly) straight to `hull`. `hull ≤ 0` → **destroyed**
(escape pods; class diagram's destruction/escape-pod mechanic). **Shields recover
only via the Shields station** (Redirect Shields), otherwise slowly/not at all.

## Information & fog
- **Enemy hull/shields/loadout hidden until scanned** (your decision). A successful
  scan reveals bars for a few turns, then goes stale.
- Ties into radar **fog of war** (P5): you can't target what you can't see.

## Range & end conditions
- Each weapon has a **max range** (`Ship Weapons.md`); beyond it, Target Weapons is
  disabled for that dock. Geometry already raises the DC with range/relative velocity.
- An engagement resolves when **one side is destroyed/disabled** or ships **break
  contact** (leave the 5,000 km draw distance). Then the GM ends the engagement.

## What this means for the code (no schema change — GM-authoritative & ephemeral)
- **Radar entity** (`src/lib/radar/model.js`) gains `hull/maxHull/shields/maxShields`,
  a `stations` map (station → crew/AI), `weaponDocks[]` (equipped weapon + ammo), and
  `scannedBy`. (The persisted `ship` table already has hp/shields columns for the
  future migration; nothing to apply now.)
- **GM symmetry:** tapping a GM-owned bogey opens the same station/action menu;
  bogey plots + actions join the WEGO turn. (Today only a player tapping *their own*
  ship opens a menu — this is the gap Scott flagged.)
- **Actions → batch:** combat `check:attempt`s are collected during planning and
  resolved together at Execute Turn (extends the current P4 per-action queue).
- **Reuse:** `difficulty.js` (geometry DC), `bands.js` (band derivation),
  `dice.js` (d15 explode), the check log (source-aware entries).

## Build order **[PROPOSAL]** (after radar P5 fog / P6 polish, unless reprioritized)
C1 entity gains hull/shields + bars on the radar (own ship visible, enemies `??`).
C2 stations + crew assignment + AI default for unmanned.
C3 GM plays bogeys (symmetric station menu + bogey plotting in WEGO).
C4 weapons/ammo from `Ship Weapons.md`; Targeting volley → batched damage at Execute.
C5 scan-to-reveal; system crits / subsystem targeting; destruction + escape pods.
C6 Shields/Network/Comms station actions; range/end-condition polish.

## Open questions (carry forward — see also `Ship Weapons.md`)
- Helm "Evade" as a distinct declared action vs. baked into the maneuver?
- Do players self-assign stations, or GM-only?
- Initiative variant, or pure simultaneous? (Class diagram mentions initiative;
  your Q4 answer leans pure-simultaneous batch.)
- Boarding (`boardingAction`, Breaching ammo) — deferred.
