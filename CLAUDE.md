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
- **Phaser 3** — installed but **not yet used** in `src/` (reserved for future
  map/space rendering).
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

## INITIATIVE: Player Check Interface (planning 2026-06-05)

A new player-facing **skill-check interface**. This is the current feature focus.

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
- **Broadcast event shape (to define in impl):** roughly
  `check:gate-staged {gateId, fiction, skills[], mode, targets}` ·
  `check:attempt {attemptId, characterId, skill, mode, d15{total,chain,crit,fail}, luck{base,sum,cosmic}, state}` ·
  `check:attempt-updated {attemptId, newTotal, kept}` (cosmic) ·
  `check:attempt-ejected {attemptId}` (discard) ·
  `check:resolved {attemptId, bandLabel, bandText}` · `check:token-granted {playerId}`.
- **Lifecycle/tray/mode/re-roll logic** lives in component state (Svelte 5 runes), synced by
  these events — port directly from the prototype's JS.

### DECISION 3 — Build location: standalone `/player` route first (2026-06-05)
Build in a **new `src/routes/(main_layout)/player/+page.svelte`** route, not inside the
debug-scaffolded `game/+page.svelte` yet. Port the prototype's three panes to Svelte
components, wire to broadcast incrementally. **The components are the durable asset; the
route wrapper is disposable** — fold the components into the real 3-pane `game` layout once
proven. Low risk to the working game page.

### Prerequisites (because this initiative deliberately SKIPS character creation)
- **Test character without the creation wizard.** Start with a lightweight mock character
  object (mirror the prototype's skill list / `Vesh Kaur`) so the slice doesn't depend on a
  DB character existing. Wire to a real seeded `character` row (via `createCharacter.js`)
  as a follow-up. "Work backwards to the planned UX" = build the target player view first,
  backfill the character/GM plumbing after.
- **Minimal GM trigger.** A bare control (broadcast-driven) to stage a gate and
  narrate/resolve — enough to drive the player UI. Real GM interface is out of scope here.

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
