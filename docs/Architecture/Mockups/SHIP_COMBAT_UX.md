# Ship Combat — Design Spec (how a fight actually plays)

> **Status:** living doc. Updated 2026-06-18 to fold in the ratified decisions from
> [[0003 Ship Combat Design Decisions]] (this no longer "awaits review" — the core
> calls are made). Consolidates + extends Scott's existing docs; does not replace
> them. Grounded in: GM Mockup (`GM Mockup.md` — HP/Shields/Weapon Docks/Stations),
> the radar mockup (`mockup - Radar Action Notes.md` — Plot Course / Target Weapons /
> Redirect Shields / Network Attack), the Ship-Combat class diagram, and
> `Sprint 03 - Ship Combat Mechanics.md`. Weapon details live in
> `docs/Reference/Ship Weapons.md`. Marked **[OPEN]** = still undecided.

## One paragraph
Combat happens on the **tactical radar**. Ships are crewed by **stations**; each
player mans **one** station and that defines what they can do this turn. Turns are
**WEGO**: every ship (players *and* the GM's bogeys) plots a maneuver and declares
its station actions during a **planning phase**, then the **GM executes the turn**
and everything resolves **simultaneously** (narrated ship-by-ship in initiative
order). Actions are **checks** (hidden DC → implicit band → narration), but for
combat the band also carries a **mechanical effect** — damage to **shields then
hull**, until a ship is **destroyed** or breaks **contact**. Enemy hull/shields are
**hidden until scanned**.

## Stations (canonical — from the GM Mockup)
A ship has five stations; each is manned by one crew member. **An unmanned station
falls to the ship's AI, which makes a default check** (weaker than a skilled crew
member). Identical for player ships and GM bogeys — the GM *plays* its ships through
the same stations.

| Station | Action on the radar | Drives | Skill |
|---------|--------------------|--------|-------|
| **Helm** | Plot Course (maneuver) + **Evade** (distinct action) | movement, evasion DC | Vessel Piloting |
| **Targeting** | Target Weapons (fires all docks) | to-hit + damage | **Heavy Weapons** (ratified) |
| **Shields** | Redirect Shields | shield regen/allocation | Hardware Maintenance |
| **Network** | Network Attack (hack) + **Scan** | disable enemy station/system; reveal enemy | Hacking |
| **Comms** | Hail / negotiate / coordinate | social | Persuasion |

*Targeting → Heavy Weapons is settled (ADR 0003 Q1); the other station skills are
still proposed. **Scan is a Network action** (Q5) — until a target is scanned,
players see `?? / ??` for its bars.*

### Manning stations (players self-assign — ADR 0003 D1/Q6)
- When the **GM initiates space combat**, the player screen prominently displays
  **"MAN BATTLE STATIONS"** and prompts the player to choose a battlestation.
- A player **occupies that station until they spend a turn to exit it** (switching
  stations costs a turn — stations are sticky, not free-swap).
- A **persistent button at the top of the radar** lets a player pick/change their
  station whenever they are not currently manning one.
- Players self-assign; the **GM assigns NPC/bogey stations** (and runs unmanned ones
  via AI). One player = one station = one action per turn. (Class-diagram
  `assignToStation`; mockup shows `Helm → Player #1`, `Targeting → Player #3`, …)

## The WEGO turn sequence
1. **Planning phase.** Each ship's manned stations declare intent on the radar:
   - Helm: plot a course (bounds → point → exit-arc → confirm) and/or **Evade**.
   - Targeting: pick target ship (+optional subsystem) for the dock volley.
   - Network/Shields/Comms: pick their action + target.
   - Unmanned stations: AI picks a default (Helm AI holds course; Targeting AI fires
     at the nearest threat; etc.).
   - Players **confirm**; the GM sees a readiness list (already exists for Helm).
2. **GM clicks Execute Turn.** (Batch resolution — ADR 0003 D6.)
3. **Resolution.** Decisions were entered **simultaneously**; they **resolve
   simultaneously** in a fixed deterministic order
   `Helm/movement → Network (disables) → Shields (regen) → Targeting (damage)`, then
   the outcome is **narrated ship-by-ship in initiative order (initiative is by ship
   in space combat — Q9)**. Animations play the movement + weapon fire together.
4. **Check end conditions**, advance turn, return to planning.

> This trades the per-check "roll → pause → narrate one at a time" beat (kept for
> *non-combat* skill checks in `PLAYER_CHECK_UX.md`) for **batched, ship-ordered turn
> narration**. Hidden DC and "no bare success/fail" still hold — players get narrated
> bands + their own bars moving, never raw numbers or enemy DCs.

## GM combat interface (ADR 0003 D2)
- **Left pane — own crew:** the GM can **expand or condense player stats for the
  entire crew**, and quickly check **stats and inventory for all players** at a glance.
- **Right pane — NPCs:** **NPC details**, and from this pane the **GM controls the
  actions of all NPCs in combat** (their station choices, plots, and targeting — the
  symmetric counterpart to how players act through their own ship).

## Resolution: band → damage
The to-hit check (gunner's **Heavy Weapons** vs geometry DC from `difficulty.js`)
yields a band; the band scales the equipped weapon's base damage, then damage is
applied **by weapon type** per `Ship Weapons.md`:

| Band | Effect |
|------|--------|
| **Critical** | max damage; roll a **system crit** (knock out a subsystem/station) |
| **Success** | full damage |
| **Partial** | half damage (glancing) |
| **No-read / Fail** | miss — 0 (nat-1 may risk a misfire/jam) |

**Shields vs type (ADR 0003 Q4 + ordnance call):** *while shields are up* — energy →
**fully absorbed** (overflow to hull); kinetic & ordnance → **20% to shields, 80% to
hull**. *Once shields are depleted* → **all types 100% to hull**. `hull ≤ 0` →
**destroyed** (escape pods). **Shields recover only via the Shields station** (Redirect
Shields), otherwise slowly/not at all. (Energy weapons are heat-limited, not reloaded —
see `Ship Weapons.md` §Heat; Overcharge = 1.5× damage / 2× heat.)

**Subsystem targeting (Q2):** the gunner may aim at a subsystem (Shields / Engines /
Weapons / a station) — DC multiplier **Helm = 2×, all others = 1.5×**; **if no
subsystem is named, a hidden roll randomizes which system takes the damage and how much.**

## Information & fog
- **Enemy hull/shields/loadout hidden until scanned** (D5). A successful **Scan**
  (Network action) reveals bars for a few turns, then goes stale.
- Ties into radar **fog of war** (P5): you can't target what you can't see.

## Range & end conditions
- Each weapon has a **max range** (`Ship Weapons.md`); beyond it, that dock's Target
  Weapons is disabled. Geometry already raises the DC with range/relative velocity.
- An engagement resolves when **one side is destroyed/disabled** or ships **break
  contact** (leave the 5,000 km draw distance). Then the GM ends the engagement.

## What this means for the code (no schema change — GM-authoritative & ephemeral)
- **Radar entity** (`src/lib/radar/model.js`) gains `hull/maxHull/shields/maxShields`,
  a `stations` map (station → crew/AI), `weaponDocks[]` (equipped weapon + ammo +
  **heat state** for energy: `heat/heatCap/heatPerShot/coolTurns`), and `scannedBy`.
  (The persisted `ship` table already has hp/shields columns for the future migration;
  nothing to apply now.)
- **GM symmetry:** tapping a GM-owned bogey opens the same station/action menu (and
  the right-pane NPC control); bogey plots + actions join the WEGO turn. (Today only a
  player tapping *their own* ship opens a menu — the gap Scott flagged.)
- **Player station UI:** "MAN BATTLE STATIONS" prompt on combat start + a persistent
  top-of-radar station button; manning is sticky (exit costs a turn).
- **Actions → batch:** combat `check:attempt`s are collected during planning and
  resolved together at Execute Turn (extends the current P4 per-action queue).
- **Reuse:** `difficulty.js` (geometry DC), `bands.js` (band derivation),
  `dice.js` (d15 explode), the check log (source-aware entries).

## Build order (after radar P5 fog / P6 polish, unless reprioritized)
C1 entity gains hull/shields + bars on the radar (own ship visible, enemies `??`).
C2 stations + crew assignment ("MAN BATTLE STATIONS") + AI default for unmanned.
C3 GM plays bogeys (symmetric station menu + NPC right-pane + bogey plotting in WEGO).
C4 weapons/ammo from `Ship Weapons.md`; Targeting volley → batched damage at Execute.
C5 scan-to-reveal; system crits / subsystem targeting; destruction + escape pods.
C6 Shields/Network/Comms station actions; range/end-condition polish; GM crew left-pane.

## Settled (see [[0003 Ship Combat Design Decisions]])
- Five stations; **players self-assign** via "MAN BATTLE STATIONS", sticky (exit = a turn).
- **GM panes:** left = own-crew stats/inventory; right = NPC details + NPC action control.
- Targeting skill = **Heavy Weapons**; **Scan = Network**; **Evade = distinct Helm action**.
- Shields: **energy fully absorbed**; **kinetic & ordnance −20% while up**; **full to hull once depleted**.
- Subsystem targeting **Helm 2× / all else 1.5×**, untargeted → **random-system** hit.
- **Energy heat + Overcharge** (1.5× dmg / 2× heat) — new mechanic (see `Ship Weapons.md`).
- **Infinite ammo** for first playable. **Batch resolution**; **initiative by ship**, narrated in order.

## Open questions (carry forward — see also `Ship Weapons.md`)
- Skills for Helm/Shields/Comms stations (Targeting=Heavy Weapons is fixed).
- Per-weapon balance numbers (damage/range/heat) — tune in playtest.
- Boarding (`boardingAction`, Breaching ammo) — deferred.
