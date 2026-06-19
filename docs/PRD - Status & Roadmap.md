# Convergence — PRD: Status & Roadmap

> **Purpose:** session-to-session handoff. This is the "where are we / what's next"
> source of truth. Updated **2026-06-19**. Read alongside `CLAUDE.md` (environment +
> architecture) and the design specs linked below.
>
> **Start-here for a fresh session:** (1) this file, (2) `CLAUDE.md`, (3) the relevant
> design doc for whatever you're building (linked per-initiative).

## Product in one paragraph
Convergence is a web-based, real-time, multiplayer tabletop RPG played over the LAN
(SvelteKit + Svelte 5 runes + self-hosted Supabase + Phaser 3). Players and a GM
connect from their own machines; game state syncs live. The current focal feature is
the **tactical radar** — the centerpiece for ship (and later character) combat —
built on top of a working **player skill-check** system.

## Initiatives at a glance

| Initiative | Status | Next |
|-----------|--------|------|
| Player Check Interface | **Shipped** (broadcast scaffold); cosmic tokens persist | Later: migrate to persisted tables |
| Tactical Radar | **P1–P5 done** (foundation → fog of war) | **P6 polish** |
| Ship Combat | **Fully designed**, not built | **Build C1–C6** |
| Ship Inventory | Deferred (design noted) | After radar/combat |
| LLM features | Roadmap only (do not build) | — |

---

## 1. Player Check Interface — SHIPPED (broadcast scaffold)
Spec: `docs/Architecture/Mockups/PLAYER_CHECK_UX.md`. Hidden-DC skill checks; GM
narrates band outcomes; cosmic-token re-rolls. Runs over the per-game **broadcast
channel** (`src/lib/check/net.js`), confirmed working in live two-client tests.
- **Cosmic tokens persist** (2026-06-18/19): `character.cosmic_tokens` column applied;
  `PlayerCheck.persistTokens` + `store.save_cosmic_tokens`; loads on `/player` entry.
  Cap `MAX_COSMIC_TOKENS = 2` enforced in code. **Optional check next session:** earn/
  spend a token in a real game, reload, confirm it persists.
- **Deferred:** migrate the lifecycle off the broadcast scaffold onto real tables with
  `postgres_changes` (target shape in `PLAYER_CHECK_UX.md §9`); retire `Check.svelte`
  for checks; harden hidden-DC (currently UI-only by decision).

## 2. Tactical Radar — P1–P5 DONE, P6 NEXT
Plan: `~/.claude/plans/zesty-orbiting-willow.md`. Design source:
`docs/Architecture/Mockups/mockup - Radar Action Notes.md`. Module: `src/lib/radar/`.
GM-authoritative + localStorage autosave + snapshot broadcast; **WEGO** turns; Phaser
3.88.2 (dynamic import).
- **P1 foundation** ✅ — model/maneuver math (+tests), Phaser render (rings, contacts,
  vectors, navigable radius).
- **P2 GM setup + sync** ✅ — scene authoring palette, enable, `radar:scene-*` snapshot/
  update, `sync-request`, localStorage restore. `net.js` handles `radar:` prefix.
- **P3 plot + WEGO** ✅ — plot-course flow (bounds → point → **exit-heading arc** → confirm),
  readiness list, Execute Turn resolves/moves all at once.
- **P4 actions → checks** ✅ — tap own ship → Target Weapons / Network Attack → pick
  target → existing GM check queue with a **geometry-suggested DC** (`difficulty.js`).
- **P5 fog of war** ✅ (2026-06-19) — `fog.js` reveal-stroke model; GM **Fog** paint mode
  (brush/undo/clear/reveal-all); players see only revealed contacts (own ship always);
  soft sensor glow; GM sees all + footprint. Rides in snapshot + autosave; `radar:fog`.
- **P6 polish — NEXT.** Hard cinematic **dark fog veil** (currently a soft glow), motion
  trails, hover/selection effects, **execute-turn choreography**, Aeterna palette pass.

**Recent radar fixes (2026-06-17):** player-ship vector clamps to a real default hull
(`PLAYER_SHIP_DEFAULT`, an interim until Ship Inventory) + spawns at center; exit-heading
arc makes the turn limit legible.

## 3. Ship Combat — FULLY DESIGNED, BUILD NOT STARTED
Specs: `docs/Architecture/Mockups/SHIP_COMBAT_UX.md` (flow) + `docs/Reference/Ship
Weapons.md` (catalog/balance) + ADR `docs/project plan/decisions/0003 Ship Combat
Design Decisions.md`. **Ratified decisions:**
- **Stations** (Helm · Targeting · Shields · Network · Comms); players self-assign via
  a **"MAN BATTLE STATIONS"** prompt (sticky — exit costs a turn); **unmanned → ship AI**.
- **GM plays bogeys** symmetrically (left pane = own crew stats/inventory; right pane =
  NPC details + control). *Gap today: only a player tapping their own ship opens a menu.*
- **Weapons are equipped**, not implied by dock count: Energy / Kinetic / Ordnance.
  **Shields:** energy fully absorbed; **kinetic & ordnance −20% while shields up**; full
  to hull once depleted. Skill = **Heavy Weapons**.
- **Energy heat** (new mechanic): heat/shot → overheat at capacity → cool N turns;
  **Overcharge** = 1.5× dmg / 2× heat.
- **Subsystem targeting:** Helm 2× DC, all else 1.5×; **untargeted → random system**.
- **Scan = Network action**; enemies hidden until scanned. **Infinite ammo** for v1.
- **Batch resolution** at Execute Turn; **initiative by ship**, narrated in order.
- **No schema change:** radar entity gains `hull/maxHull/shields/maxShields`, `stations`,
  `weaponDocks[]` (+ energy heat state), `scannedBy` — GM-authoritative/ephemeral.

**Proposed build order (C1–C6):**
- **C1** entity hull/shields + bars on the radar (own visible, enemies `?? / ??`).
- **C2** stations + "MAN BATTLE STATIONS" self-assign + AI default for unmanned.
- **C3** GM plays bogeys (symmetric station menu + NPC right-pane + bogey plotting).
- **C4** weapons/ammo + batched damage at Execute (energy heat; shields −20% kinetic/ordnance).
- **C5** scan-to-reveal + subsystem/system crits + destruction/escape pods.
- **C6** Shields/Network/Comms actions + range/end conditions + GM crew left-pane.

**Open design questions** (in the docs): skills for Helm/Shields/Comms stations; exact
subsystem multiplier within 1.5–2×; per-weapon balance numbers/heat; boarding (deferred).

## 4. Ship Inventory — DEFERRED
GM authors/customizes ships → assigns to players (e.g. on purchase); radar reads the
owned `ship` record instead of `PLAYER_SHIP_DEFAULT`. Needs schema: `ship` gains
maneuver/balance stats + ownership (mirror character ownership). See memory
`convergence-ship-inventory`. Do after radar/combat.

## 5. LLM features — ROADMAP ONLY (do not build yet)
Data model is AI-ready (`llm_model/llm_thread/llm_entry`). Keep two habits while
building: a single LLM seam (`src/lib/llm/`) and source-aware log entries
(`player|gm|system|ai`). Details in `CLAUDE.md`.

---

## Prioritized next steps (pick up here)
1. **Decide P6 polish vs. start Combat C1.** Recommendation: a thin **P6 dark-veil**
   upgrade for fog (it directly serves combat's scan/visibility), then **C1** (hull/
   shields + bars) to start making combat real.
2. **Combat C1–C6** per §3 (no schema change).
3. (Optional) live-verify cosmic-token persistence.
4. (Later) Player-Check migration to persisted tables; Ship Inventory; LLM seam.

## Key files / where things live
- Radar: `src/lib/radar/{model,maneuver,difficulty,archetypes,fog,demo}.js`,
  `radarState.svelte.js`, `phaser/RadarScene.js`, `RadarCanvas.svelte`,
  `routes/(main_layout)/player/components/RadarPane.svelte`.
- Checks: `src/lib/check/{net,bands}.js`, `src/lib/dice.js`,
  `routes/(main_layout)/player/playerCheck.svelte.js`, `gm/gmCheck.svelte.js`, `gm/GmView.svelte`.
- Data: `src/DataStore.svelte.js` (hand-rolled ORM; `tables` array). Schema record:
  `supabase/schema.sql` (Studio-first; `npm run db:schema` on the **app VM** to snapshot).

## Infra & test notes
- **Tailscale:** app calls Supabase at `100.102.156.51:8000`; `PUBLIC_URL =
  100.99.26.107:3000`; GoTrue redirect allowlist updated. (LAN-only-no-Tailscale devices
  won't reach it — fine while everything's on the tailnet.)
- **Schema changes are Scott's** to apply in Studio; flag SQL + steps, then `npm run db:schema`.
- **Headless verify = mock `/player` only** (authed routes have no session). Multiplayer
  (GM paint, two-client checks) needs two real browsers: GM `+test1` `/gm?game_id=24`,
  player main `/player?game_id=24`. Game 24 seeded (see `CLAUDE.md`).
- **Tests:** `npm run test:unit` (radar = 25 tests incl. fog); `npm run build` must stay green.

## Git state at handoff (2026-06-19)
- `origin/main` @ `9338971`. **Local main is ahead by `131f9ac` (Radar P5) — NOT yet pushed.**
- `.env` is gitignored (never commit). Synced-vault churn (Obsidian/Excalidraw `.md`)
  shows as modified — do not stage it.
