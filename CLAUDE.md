# CLAUDE.md — Convergence

Project context and working notes for Claude Code sessions. Read this first; it
exists so a fresh session doesn't have to re-derive everything.

## What this project is

**Convergence** is a web-based, real-time, multiplayer tabletop RPG, intended to
be played over the local network. Players and a GM connect from their own
machines; game state (characters, ships, etc.) is shared live via Supabase
realtime. Public dev build historically deployed to GitHub Pages
(`https://sdt6585.github.io/convergence/`), but active development is local on the
LAN setup below.

## Who I'm working with

- **Scott** — describes himself as an **amateur developer**. He wants:
  - **Verbose explanations** and explicit, step-by-step guidance, especially for
    any **server / infrastructure / Supabase configuration**.
  - To be **explicitly told whenever a change requires a database schema change**,
    because he applies those himself (currently by hand in Supabase Studio).
  - Questions asked as we go to improve answer quality.

## Infrastructure / network topology

Two VMs on a single **Proxmox** host:

| Role | IP | Notes |
|------|----|-------|
| **App VM** | `192.168.1.106` | This repo (`/home/gm/convergence-fork`). Runs the SvelteKit dev server: `npm run dev` → Vite on **port 3000**, started with `--host` so it's LAN-reachable at `http://192.168.1.106:3000`. |
| **Supabase VM** | `192.168.1.105` | Self-hosted Supabase (Docker). **Kong API gateway on :8000** (this is `PUBLIC_SUPABASE_URL`). Postgres reachable directly from the app VM on **:5432** and pooler **:6543** (both confirmed OPEN — no SSH tunnel needed for DB access). |

`.env` (app VM):
- `PUBLIC_SUPABASE_URL=http://192.168.1.105:8000`
- `PUBLIC_SUPABASE_ANON_KEY=...` (anon JWT, valid ~2026–2031)
- `PUBLIC_URL=http://192.168.1.106:3000`

Scott has **SSH access to the Supabase VM** and **Proxmox admin access**.

## Stack

- **SvelteKit** + **Svelte 5 runes** (`$state`, `$derived`, `$effect`).
- **`adapter-static`** → builds a static SPA. Production base path is `/convergence`
  (GitHub Pages); empty in dev. See `svelte.config.js`.
- **Supabase JS** (`@supabase/supabase-js`) for auth + Postgres (PostgREST) + realtime.
- **Phaser 3** (3.88.2) — **in use** by the Tactical Radar (`src/lib/radar/phaser/`),
  dynamically imported client-side (kept out of SSR + the base bundle).
- **Vitest** (unit) + **Playwright** (e2e).
- Path aliases: `@src @styles @utils @lib @routes @components` (see `vite.config.js`).

## Architecture (the important part)

`src/DataStore.svelte.js` (~1100 lines) is the heart of the app — a generic,
config-driven data layer (hand-rolled ORM).

- A `tables` array (lines ~24–293) declares every table once, with relationships
  (`has-one`, `has-many`, `junction`), realtime filters, and Supabase select
  strings. The constructor **auto-generates** per-table helpers: `load_games()`,
  `create_character()`, `load_character(id)`, etc., plus relationship caching and
  realtime wiring.
- One `DataStore` instance is created in `routes/(main_layout)/+layout.svelte` and
  shared everywhere via Svelte `setContext('store', store)`. Access with
  `getContext('store')`.
- **Auth**: email/password, magic link, and password recovery, handled via
  `supabase.auth.onAuthStateChange` in the DataStore constructor. `/game` and
  `/games` require login (enforced in the layout).
- **Realtime**: (1) per-table Postgres change subscriptions filtered by `game_id`;
  (2) a per-game **broadcast channel** for transient events (dice rolls, etc.)
  that don't need persisting (`subscribeRealtime`, `handleRealtimeChange`).
- **Game UI** (`routes/(main_layout)/game/+page.svelte`): 3-panel resizable
  desktop layout (Party / Character / Chat) + mobile layout. Character-creation
  wizard (`game/components/CharacterCreation.svelte`) and dice roller
  (`components/Check.svelte`, `components/checkRoller.js`).
- **Character model** (`src/lib/data/createCharacter.js`): factory that adds skill
  helpers; skill level (0–10) derived from `*_success_checks` columns.

The DB tables modeled: `game, player, ship, planet, star_system,
star_system_object, stat, race, class, subclass, skill, ability, subclass_skill,
character, character_ability, class_skill, role`.

## INITIATIVE: Player Check Interface (IN PROGRESS)

A player-facing **skill-check interface**. This is the current feature focus.

### STATUS — where we are (updated 2026-06-18) — READ THIS FIRST
Build sequence: prototype → local slice → real-data → role-aware routing → broadcast ✅ → **persistence: cosmic tokens (code DONE, schema apply pending)**. Focus has since shifted to the **Tactical Radar / ship-combat** initiative below.

**DONE & committed on `main`:**
- **Dice engine** `src/lib/dice.js` (+ `dice.test.js`, 12 tests): exploding d15, luck d30, `MAX_COSMIC_TOKENS = 2`.
- **Player slice** `src/routes/(main_layout)/player/`:
  - `+page.svelte` (host): with `?game_id=` it loads the game → finds your **Player** seat → feeds your real `character` into the sheet. No `game_id` → local **mock** sandbox (the GM Sim bar shows only in mock).
  - `playerCheck.svelte.js` — local lifecycle controller (mode toggle, pending tray, cosmic/discard re-rolls, narrative bands, token cap). Still has local `gmStage/gmResolveOldest/grantToken` **sim** methods.
  - `components/{CharacterSheet,StarMap,CheckLog,DiceDisplay}.svelte`. Log scrolls + smart auto-scroll (follows new entries only when pinned to bottom).
- **Role-aware routing (Option A):** `/games` lists by **membership** (your player seats) with role badges → routes Player→`/player?game_id=`, GM→`/gm?game_id=`. New `/gm` route + `gm/GmView.svelte` (**scaffold**: stage control + pending-resolutions queue; guards to GM seats).
- `DataStore.svelte.js`: `SIGNED_IN` redirect gated to neutral pages only (deep links no longer hijacked).

**DONE — broadcast wiring (built 2026-06-07; CONFIRMED working in live two-client testing, 2026-06-18):**
- `src/lib/check/net.js` — `makeCheckNet(store, onEvent) → {clientId, send, dispose}`; sends on `store.realtimeChannels.broadcast`, receives via `store.on('game-event', …)` (where `event.args` is the raw supabase msg), ignores own `senderId`. Transport verified.
- **Player** (`playerCheck.svelte.js` + `/player` host): emits `check:attempt` / `-updated` / `-ejected`; applies `gate-staged` / `gate-cancelled` / `resolved` / `attempt-dismissed` / `token-granted`. Each pending attempt carries a global `attemptId`. GM Sim bar now shows **only on the mock route** (no game_id).
- **GM** (`gm/gmCheck.svelte.js` + rewritten `gm/GmView.svelte` + `/gm` host): stage form with **per-skill DCs** (DCs stay local — only skill NAMES broadcast); live attempt queue; resolve via the **implicit band** (`src/lib/check/bands.js`: +5 crit / −3 partial, + natural 15/1); dismiss; cancel-gate; grant token.
- **Resolution model:** the GM sets/confirms a DC at resolve — **pre-filled if staged, entered on the fly for player-initiated checks (Door 2)**; the band is implicit (total vs DC); the GM types narration; the player receives **tier + text, never the number** (DCs never cross the wire). Discard works both ways: player ejects (`attempt-ejected`) ↔ GM dismisses (`attempt-dismissed`).
- **Log entries are source-aware** (`source: player|gm` — `system|ai` ready for the LLM seam).
- **Two-browser test:** GM as `+test1` (`/gm?game_id=24`) + player as main (`/player?game_id=24`).
- Still **ephemeral** (no persistence; refresh resets; late-joiners see nothing prior). Deferred: formal resolution modes (first-success / best-result), "other skill" UX.

**NEXT STEPS:**
1. **Cosmic-token persistence — CODE DONE (2026-06-18); pending the schema apply.**
   Column: `ALTER TABLE public.character ADD COLUMN cosmic_tokens smallint NOT NULL DEFAULT 0;`
   (Scott applies in Studio → `npm run db:schema` to snapshot). Wiring: `PlayerCheck.persistTokens`
   hook + `_saveTokens()` on grant/spend; `store.save_cosmic_tokens(charId, n)`; `/player` loads
   `character.cosmic_tokens` on ready. Cap (`MAX_COSMIC_TOKENS=2`) stays enforced in code. Until the
   column exists the UI still works (reads `0`, writes log-and-no-op).
2. *(Later)* migrate the check lifecycle off the broadcast scaffold to the persisted tables model
   (see INTENDED FUTURE ARCHITECTURE).

### INITIATIVE: Tactical Radar (started 2026-06-11) — the combat centerpiece
Full plan: `~/.claude/plans/zesty-orbiting-willow.md`. Design source:
`docs/Architecture/Mockups/mockup - Radar Action Notes.md` (its **Text Elements** section is
the spec; the rest is compressed Excalidraw JSON).
- **Decisions (Scott):** ships first (character mode later on the same engine); **GM-authoritative
  state + GM localStorage autosave + full-snapshot broadcast to (re)joining players — NO schema
  change now**; **WEGO simultaneous turns** (players plot+confirm → GM Execute Turn); **Phaser
  3.88.2** renders it (already a dependency).
- **Mockup mechanics:** 5,000 km draw distance; 15 s turns; inner circle = navigable radius
  (= speed×t; 46 km/s → 690 km); contacts w/ velocity vectors; click own ship → Plot Course /
  Target Weapons / Redirect Shields / Network Attack; plot = bounds → point → **new vel/G/fuel
  HUD** → confirm → exit vector → confirm. Station-gating deferred.
- **Module:** `src/lib/radar/` — `model.js` (engagement/entity, constants), `maneuver.js`
  (+tests; game-feel constants `DELTA_V_PER_G=4`, `FUEL_PER_KMS=0.17` tuned to mockup numbers),
  `phaser/RadarScene.js` (bridge contract: getEngagement/getViewerEntityId/onSelect/subscribe),
  `RadarCanvas.svelte` (dynamic-imports Phaser), `demo.js` (mock-sandbox scene).
- **Phases:** P1 foundation render ✅(built; verify pending) · P2 GM setup+sync(localStorage/
  snapshot; `net.js` gains `radar:` prefix) · P3 plot+WEGO execute · P4 actions→existing check
  queue with geometry-suggested DC (`difficulty.js`) · P5 fog of war (GM click-drag reveal
  strokes) · P6 polish. Radar `check:attempt`s carry `{action, targetId, suggestedDc}`.
- Mock `/player` center pane shows a **demo engagement** (headless-verifiable); real games show
  the radar when the GM enables an engagement (P2+). Proposed: `ALTER TABLE public.character ADD COLUMN cosmic_tokens smallint NOT NULL DEFAULT 0;` (cap of 2 still enforced in code). Flag explicitly + give Studio steps before wiring read/write.
- **Exit-trajectory legibility (2026-06-17):** at the plot exit stage the scene draws the reachable
  **exit-heading arc** (`RadarScene.drawExitOptions`) — bright teal = reachable, faint red = beyond
  thrust — because exit *speed* is fixed by the target and only heading varies, within Δv budget.
- **Player-ship hull fix (2026-06-17):** GM-spawned player ships get `PLAYER_SHIP_DEFAULT`
  (`archetypes.js`) so the vector drag clamps to a real `topSpeed`; spawn at scene center. This is a
  labeled DEMO interim — real player ships come from the deferred **ship-inventory** initiative (GM
  authors/customizes ships → assigns to players; radar reads the owned `ship` record).

#### COMBAT DESIGN (defined 2026-06-17; docs are Scott's, living + incomplete) — READ THE TWO DOCS
The radar is the combat centerpiece; combat is now spec'd in two **new, evolving** docs (Scott owns
them — extend, don't freeze): `docs/Architecture/Mockups/SHIP_COMBAT_UX.md` (the flow) +
`docs/Reference/Ship Weapons.md` (weapon/ammo catalog = balance levers). Grounded in Scott's GM
Mockup / GDD / class diagram. **Scott's decisions (this session):**
- **Stations, not "tap ship → all actions":** five stations from the GM Mockup — **Helm · Targeting ·
  Shields · Network · Comms**. Each player mans ONE; one action/turn. **Unmanned station → ship AI
  default check.** Identical for player ships and GM bogeys.
- **GM plays the bogeys (symmetry GAP today):** tapping a GM-owned bogey must open the same
  station/action menu + join WEGO planning. Currently only a player tapping their *own* ship opens a menu.
- **Weapons are equipped, not implied by ports:** a hull has **weapon docks** (may be empty); the
  equipped **weapon type + ammo + targeting** decide the interaction. GDD rule: **shields stop ENERGY,
  not kinetic/ordnance** (energy→shields-first; kinetic/ordnance→hull). Damage scales off the to-hit band.
- **Scan-to-reveal:** enemy hull/shields/loadout hidden (`?? / ??`) until a successful scan.
- **Batch resolution at Execute Turn** (not the interactive per-check queue — that stays for *non-combat*
  skill checks). Hidden DC + no-bare-success still hold; players get narrated bands + their own bars moving.
- **No schema change:** radar entity gains `hull/shields/stations/weaponDocks/scannedBy` (GM-authoritative,
  ephemeral; persisted `ship` table already has hp/shields for the future migration).
- **Open design Qs for Scott** (in the docs): Gunnery skill vs reuse Heavy Weapons; subsystem-crit depth;
  ammo bookkeeping in v1; kinetic ignores shields entirely vs token fraction; Scan at Network vs Comms;
  players self-assign stations vs GM-only. Build order C1–C6 in SHIP_COMBAT_UX.md (after radar P5/P6).
3. *(Later)* migrate off the broadcast scaffold to the persisted model (see INTENDED FUTURE ARCHITECTURE); retire `Check.svelte` for checks.

**TEST DATA / INFRA (seeded in the live DB — DML only, NOT in git):**
- Game **24 "Check Test"** (owned by the main account).
- Seat **player 4** = `wilson.scott214@gmail.com` (main), role **Player**, character **12 "Vesh Kaur"** (stats + skill levels seeded).
- Seat **player 5** = `wilson.scott214+test1@gmail.com`, role **Game Master**.
- **Two-browser test:** main → `http://192.168.1.106:3000/player?game_id=24` · `+test1` → `…/gm?game_id=24`.
- `role.id`: 1 = Game Master, 2 = Player. RLS is wide-open placeholder (`USING(true)`).
- Headless Playwright works for the **mock** route only (authed routes have no session) — use two real browsers for multiplayer. Browser deps already installed.

### Character ownership & membership architecture (SHIPPED 2026-06-06)
Characters are now **user-owned and game-independent** (full plan: `~/.claude/plans/zesty-orbiting-willow.md`).
Schema added: `character.user_id`, nullable `character.game_id`, `game.invite_code`, and `character.background` widened `varchar(255)`→`text`.
- Create characters any time from **`/characters`** (game-independent; `CharacterCreation.svelte` sets `user_id`, `game_id: null`; finalize shows an inline summary — the old `<Character>` preview was hardcoded "Helm: Alex").
- **`/games`:** Create seats you as **GM** (`create_game_with_gm`, auto-generates an invite code shown next to GM games); **Join by code** brings a character (`join_game_by_code`).
- Membership = `player` seat (user, game, role). `/player` is gated on **having a character here**; `/gm` on **being the GM**; each shows a cross "⇄ switch view" link (a GM may add their own character to play). DataStore helpers: `create_game_with_gm`, `load_my_characters`, `join_game_by_code`, `assign_character_to_game`, `remove_character_from_game`, `_generate_invite_code`.

**KNOWN ISSUE — pick up next session: character skills have no default values.** A newly created character's skills all show **level 0** — the `*_success_checks` columns default to 0 and nothing seeds starting values (core-skill selections / subclass skills don't grant a baseline). Decide the intended starting values and seed them at creation. Look at `src/lib/data/createCharacter.js` (the success-checks→level model), the creation wizard's core-skill handling, and the `*_success_checks` columns.

### Source design docs (READ THESE FIRST — they are the spec)
- `docs/Architecture/Mockups/PLAYER_CHECK_UX.md` — the design spec & rationale
  (the *why*, including rejected alternatives; treat its constraints as load-bearing).
- `docs/Architecture/Mockups/player-interface.html` — a working clickable prototype
  (vanilla HTML/CSS/JS) implementing everything in the spec. The "GM Sim" bar in it is
  a stand-in for the GM's separate interface, not part of the player experience.

### The design in one paragraph
Players roll checks through a three-pane interface (character sheet · map · log). A
persistent **mode toggle** distinguishes **Just Roll** (tactile, never counts, never
sent to GM — teal) from **Check** (committed, sent to GM, held until narrated — gold).
The game holds **secret per-skill DCs the player never sees**; a committed roll enters a
**PENDING** state and the player learns the outcome only as **GM-authored narrative
bands** (No-read / Partial / Success / Critical) *after the GM narrates* — never as bare
pass/fail. A rare **cosmic token** (earned when the background luck d30 hits 30, **max 2 held**)
allows a **keep-highest** re-roll during the pending window. Re-rolling a skill that is already
pending **ejects it from the resolution queue entirely** (anti-shopping), demoting it to a
just-roll. One pending check per skill. **Gold = "this counts / cosmic"; teal = "quiet /
pending."**

### Non-negotiable constraints (from the spec — do not "optimize" away)
1. **Hidden DC.** The player never sees the target number. *(How we enforce it: see the
   simplification decision below.)*
2. **GM narrates first, always.** Die result and outcome are **decoupled in time** —
   `PENDING` is a first-class, comfortable UI state, not a spinner. The pause **is** the
   product (recreates the table rhythm: roll → slide die forward → look up at GM).
3. **Never show bare SUCCESS/FAIL.** Only GM-authored narrative bands. (Per-skill DCs mean
   two players can roll the same number and get different outcomes — bare pass/fail would
   read as a bug.)
4. **Two re-roll paths must look/behave clearly different:** cosmic (funded, keep-highest,
   gold ✦) vs discard (unfunded, *ejects from queue*, faintly cautionary, guarded by a
   confirm dialog whose safe default is "Keep Waiting").
5. **Don't signal the easy skill** — multi-skill prompt buttons are visually equal weight.

### Dice mechanics (from the GDD; prototype JS is the reference impl)
- **d15:** 15 = critical success → **explode** (roll again & add, repeat); 1 = critical
  failure (auto non-pass). Skill modifies via the `*_success_checks`→level model already in
  `createCharacter.js`.
- **Luck d30 (background, every CHECK):** 1–29 nothing; **30 (luck stat added to the roll)
  → cosmic moment → free re-roll token.**

### THE CORE COLLISION with current code
`components/Check.svelte` + `components/checkRoller.js` do exactly what the design
**forbids**: they compute pass/fail **on the client** (`Check.svelte` ~line 48:
`displayResult = displayModified >= threshold`) and show bare **"SUCCESS!/FAILURE"**
immediately (~line 114). For checks this is a **replacement**, not an extension. (The old
roller may stay for generic/non-check rolls, or be retired later.)

### DECISION 1 — Hidden-DC enforcement: keep it SIMPLE for now (2026-06-05, Scott)
Enforce the hidden DC at the **UI level only** — the player interface simply does not
render the DC. We explicitly **rejected** the heavier options (RLS-split secret tables,
Postgres SECURITY DEFINER RPC, Supabase Edge Function) for now. Scott's call: *"If a player
can inspect page source and find the answer, that's on them; worry about encryption/
obfuscation later."* **Future hardening is a known, deferred task — not abandoned.**

### DECISION 2 — First slice runs over BROADCAST ONLY, no schema change (2026-06-05, Scott)
The first working slice drives the **entire check lifecycle over the existing per-game
broadcast channel** (`game-broadcast:${gameId}`, see `subscribeRealtime`) with **NO new
tables**. Rationale: fastest path to a clickable, real-multi-client UX with zero schema
work, matching the "keep the codebase as simple as possible" directive.
- **Trade-off (accepted):** nothing persists — a refresh loses in-flight checks. This is a
  scaffold, not the destination.
- **GM authority:** the **GM client holds the secret DCs/bands locally** and only
  broadcasts player-facing data (fiction, flagged skills, mode). On resolve, the GM client
  computes the band and broadcasts **only the band text**. (Conveniently, DCs never even hit
  the wire this way — but that's a side effect, not a security guarantee.)
- **Broadcast event shapes (the protocol; transport implemented in `src/lib/check/net.js`):** roughly
  `check:gate-staged {gateId, fiction, skills[], mode, targets}` ·
  `check:attempt {attemptId, characterId, skill, mode, d15{total,chain,crit,fail}, luck{base,sum,cosmic}, state}` ·
  `check:attempt-updated {attemptId, newTotal, kept}` (cosmic) ·
  `check:attempt-ejected {attemptId}` (discard) ·
  `check:resolved {attemptId, bandLabel, bandText}` · `check:token-granted {playerId}`.
- **Lifecycle/tray/mode/re-roll logic** lives in component state (Svelte 5 runes), synced by
  these events — port directly from the prototype's JS.

### DECISION 3 — Build location (UPDATED — role-aware routes now exist)
Originally: build the player UI in a standalone `/player` route first. That's done, and it
has since grown into **role-aware routing (Option A)**:
- **`/player?game_id=`** — the Player view (game-scoped; mock sandbox with no `game_id`).
- **`/gm?game_id=`** — the GM view (scaffold today; broadcast wiring is the active step).
- **`/games`** — routes each of your seats to `/player` or `/gm` by role.
- The legacy `game/+page.svelte` (old Party/Character/Chat panels + the `debugger;` /
  forced-modal scaffolding) is **left intact and unlinked** — additive, reversible. Decide
  its fate (fold in vs retire) when the persisted model lands.

### Prerequisites (DONE — this initiative deliberately SKIPS character creation)
- **Test character without the creation wizard:** ✅ done both ways — a local mock character
  (no `game_id`) and a real seeded `character` (game 24, see STATUS test-data) rendered via
  `createCharacter.js` helpers.
- **Minimal GM trigger:** ✅ the local **GM Sim bar** drives the player UI today (mock); the
  real GM side is the `/gm` view + broadcast wiring now in progress.

### INTENDED FUTURE ARCHITECTURE (the migration target — do NOT lose this)
When we outgrow the broadcast scaffold, promote the lifecycle to **real tables wired into
the DataStore `tables` array with `postgres_changes` realtime** (filtered by `game_id`),
exactly like every other table. **This is a SCHEMA CHANGE Scott applies in Studio — flag it
explicitly when we get there.** Target shape (from PLAYER_CHECK_UX §9):
```
gate(id, game_id, fiction, resolution_mode[FIRST_SUCCESS|EVERYONE_ROLLS|BEST_RESULT],
     allow_other_skills, targets, status[OPEN|RESOLVED|CLOSED])
gate_skill(gate_id, skill_id, dc)          -- dc hidden by UI (see Decision 1)
gate_band(gate_id, min_total, label, text) -- GM-authored narrative outcomes
check_attempt(id, gate_id|null, character_id, skill_id, mode[JUST_ROLL|CHECK],
              d15_total, d15_chain, luck_base, luck_sum, luck_cosmic,
              state[ROLLING|PENDING|EJECTED|RESOLVED|UNEVALUATED],
              cosmic_prev_total, cosmic_new_total, cosmic_kept,
              resolved_band_label, resolved_band_text)
```
- **Resolution modes** (§7) drive shared-vs-personal cards: first-success (shared, closes
  for all), everyone-rolls (personal copy per target), best-result (stays open, accrues).
- **Just-rolls stay ephemeral** (broadcast/local only) even in the future model — they never
  persist by design.
- **Then** retire `Check.svelte` for checks; revisit hidden-DC hardening (Decision 1).

### Open questions (from spec §10 — carry to playtest, don't pre-decide)
1. Map clicks: auto-switch to Check, or respect current mode?
2. Cosmic moment on a *just-roll*: grant a token or not? (Leaning: CHECK only.)
3. GM prompts a skill that's already pending: block / queue / supersede?
4. Unprompted roll with no GM-staged DC: raw result for GM to interpret, or a request the
   GM must accept?
5. Mode-misfire frequency — does the persistent toggle cause wrong-mode rolls often enough
   to warrant a long-press accelerator?

### Aesthetic (load-bearing color semantics, not decoration)
Aeterna / cosmic-filament: deep teal-blue void, faint star texture, slowly-rotating
accretion disk on the center map. **Teal** = quiet/pending/just-roll; **Gold** =
committed/cosmic/"this counts" (reserve it); **Red** = critical-fail/destructive only.
Fonts: `Chakra Petch` (HUD/labels) + `Spectral` (fiction/narration, italic). Spend
animation budget on (a) dice + crit chain, (b) cosmic claim, (c) pending→narrated.

## LLM functionality (FUTURE — roadmap, do NOT build yet)

Goal: optional AI features — **GM-driven character generation**, **contextual chat in
the log**, more later — running against a **self-hosted local model** (no per-token cost).
Must stay **additive**: core functionality works without it.

### The data model is already AI-ready (no schema change needed for LLM)
- `llm_model` — provider-agnostic, with cost-per-(input/cached/output)-token columns. A
  local model is just a row with `provider='local'`, cost `0`. Cloud + local coexist.
- `llm_thread` (per `user_id`+`game_id`) and `llm_entry` (full per-call log: `messages`
  jsonb, tokens, timing, cost, success/error, **streaming timestamps**). Trigger
  `calculate_timing_metrics` fills metrics; view `llm_cost_by_model`.
- Stubs already in code: `store.generate_character(prompt)` (commented in
  `CharacterCreation.svelte`), `handleLLMRequest` in `game/components/Chat.svelte`.

### Cost control = self-host; local models speak OpenAI's API
Ollama / llama.cpp / vLLM / LM Studio all expose an **OpenAI-compatible
`/v1/chat/completions`**. Build the call layer to that shape → local↔cloud is a config
swap (base URL + model + key), distinguished by `llm_model.provider`. Self-hosting removes
per-token billing entirely (compute is fixed hardware you own).

### Call topology — DECISION DEFERRED (lean: Supabase Edge Function mediator)
The app is `adapter-static` (no app-server tier). Options:
- **Client → local LLM directly:** simplest, but endpoint/config live in the browser, no
  central control, LAN-only (the public GitHub Pages build can't reach the LAN).
- **Supabase Edge Function mediator (LEAN):** SPA → Edge Function (in the Supabase VM) →
  local LLM → logs `llm_entry` → returns. Keeps the app static, reuses the Supabase tier,
  hides the endpoint, centralizes prompts/auth/logging. Value is hygiene, not cost.
- **App server** (adapter-node / separate service): heaviest; only if we outgrow Edge Functions.
Decide when the local serving stack is chosen — not now.

### Forward-compatible choices to make WHILE building core (cheap; land in the broadcast/log step)
1. **One LLM seam:** all access behind `src/lib/llm/` (`generateCharacter(prompt)`,
   `chat(threadId, msg)`); impl starts as a "not configured" stub → later client-direct or
   Edge-Function-backed with zero feature changes. The existing stubs call this.
2. **Source-aware log entries:** entries / broadcast events carry an `author`/`source`
   (`player | gm | system | ai`) + a `pending/streaming` state. Then AI chat is just
   another source, and a streamed AI reply is an entry that *updates* (same mechanism as
   pending→resolved). **Do this when wiring the check log (next step).**
3. **AI proposes, human disposes:** generated characters flow into the **editable creation
   wizard for review** (never straight to the DB); chat suggestions are draft entries the GM
   accepts. Keeps data integrity independent of model quality. (NPC fits the ownership model:
   `is_npc=true`, `user_id=GM`, `game_id`.)
4. **Async + gated:** non-blocking generation with loading/streaming states (the wizard
   `loading` panel exists); **feature-flag** AI (`llmEnabled`, derived from whether a model/
   endpoint is configured) so affordances vanish when no model is available — core never
   depends on AI and the public build degrades gracefully.
5. **Reuse broadcast/log as the AI delivery channel:** AI content posts into the same log
   store tagged `source='ai'`; keep the entry model generic (system/AI can emit), not human-only.

**Net:** nothing blocks current work. Only two new habits — the LLM seam (#1) and
source-aware/streamable entries (#2) — both nearly free, and both land naturally during the
broadcast/log step that is next.

## DB schema tracking (ESTABLISHED 2026-05-29)

**Goal (achieved):** capture the real schema in version control and define a
repeatable, Docker-free workflow. The schema is hand-edited in Studio; our tracked
artifact is a *record* of that reality, not the driver.

### The workflow — Studio first, then capture

Scott edits schema in **Supabase Studio**, then we snapshot it to a single
canonical file and review via `git diff`:

1. Make the change in **Studio** (Scott's comfort zone).
2. Run **`npm run db:schema`** (wraps `scripts/dump-schema.sh`). This dumps the
   live `public` schema to **`supabase/schema.sql`** (the single source of truth).
3. **`git diff supabase/schema.sql`** shows exactly what changed — review it.
4. Commit `supabase/schema.sql` (and any related app code) together.

`supabase/schema.sql` is `pg_dump --schema-only --schema=public --no-owner`, with
pg_dump 16's random `\restrict`/`\unrestrict` nonce lines stripped so re-dumps are
**deterministic** (no spurious diffs). Re-running with no schema change yields a
byte-identical file.

> **Still flag every schema change explicitly** so Scott can apply it in Studio.
> Prefer exact SQL or exact Studio steps. `db:schema` only *records* a change after
> Scott has made it — it never applies one.

### Connection facts (important — corrected from earlier assumptions)
- **`192.168.1.105:5432` is the Supavisor *session* pooler, NOT direct Postgres.**
  (Earlier notes mis-stated this; a TCP "port open" check can't tell them apart.)
  Direct Postgres is only inside the Supabase VM's Docker network.
- Supavisor requires the tenant in the username: **`postgres.your-tenant-id`**
  (tenant id = `POOLER_TENANT_ID` in the Supabase VM Docker `.env`, left at the
  default `your-tenant-id`). Plain `postgres` → `FATAL: Tenant or user not found`.
- Use the **session** port `5432` for `pg_dump` (it's pg_dump-safe). Do **not** use
  the **transaction** pooler `6543` for dumps.
- DB password is `SUPABASE_DB_PASSWORD` in **`.env`** (gitignored). `dump-schema.sh`
  reads it and passes it via `PGPASSWORD` so it never hits the process list or the
  output file. Server is **PostgreSQL 15.8**.

### Tooling decision (why no Supabase CLI / Docker)
The Supabase CLI works now (CPU fix below) but its `db dump`/`db diff`/`db pull` all
require **Docker on the app VM** (they run a pinned pg_dump/shadow-DB container).
Since Scott edits in Studio first, we don't need that machinery. We use the
**locally-installed `postgresql-client` (pg_dump/psql 16.14)** directly instead —
lighter, and `git diff` is our "diff engine." The cloud-oriented npm scripts
(`db:pull`, `migration:new/push`, `supabase:dev-deploy` → `deploy-db.bat`) are
**vestigial** (Docker/cloud-`link` based) and are not part of this workflow.

### Schema facts captured in the baseline
- **22 tables in `public`, all with RLS enabled.** Core RPG tables (game, player,
  character, ship, planet, star_system, star_system_object, **star_system_object_type**,
  stat, race, class, subclass, skill, ability, subclass_skill, character_ability,
  class_skill, role) plus an **LLM-logging subsystem** (intentional, Scott's work):
  `llm_entry`, `llm_model`, `llm_thread`, `error_log`, the views `llm_cost_by_model`
  / `llm_thread_summary`, and functions `calculate_timing_metrics` (trigger on
  `llm_entry`) / `cleanup_old_llm_logs`. These LLM tables are not modeled in the
  DataStore `tables` array.
- **`player_character` does not exist** in the live DB (one-to-many via
  `character.player_id`, with `is_npc boolean DEFAULT true` as a plain column — no
  trigger). The orphaned `..._add_character_npc_trigger.sql` migration was **deleted**
  (zero DB impact); the now-empty `supabase/migrations/` dir is retired in favour of
  `supabase/schema.sql`.

### RESOLVED blocker (kept for history): Supabase CLI "Illegal instruction"
The CLI crashed with exit 132 because this app VM's Proxmox CPU was the default
`kvm64`/"QEMU Virtual CPU 2.5+", which **lacks AVX** (the CLI Go binary needs it).
**Fixed** by setting the VM's Proxmox processor **Type → `host`** + full stop/start.
`grep avx /proc/cpuinfo` now shows `avx`/`avx2`; `npx supabase --version` → 2.101.0.
(Trade-off: `host` CPU breaks cross-host live migration — irrelevant on this
single-host homelab.)

### Unrelated cleanup still pending (not blocking)
- **Debug scaffolding** in `routes/(main_layout)/game/+page.svelte` (~lines 77–87):
  a `debugger;` and a `//TODO remove testing` block that *unconditionally* forces the
  character-creation modal open on every game load. Clean up at some point.

### Memory files (persistent, file-based)
`convergence-infra`, `convergence-schema-not-in-migrations` (the latter now
superseded — schema IS tracked via `supabase/schema.sql`).

## Useful commands

```bash
npm run dev            # Vite dev server, port 3000 (already running, --host)
npm run build          # static build
npm run check          # svelte-check
npm run test:unit      # vitest
npm run test:e2e       # playwright
npm run db:schema      # snapshot live public schema -> supabase/schema.sql (Docker-free)
npx supabase --version # CLI now works (2.101.0) after the CPU=host fix
```
