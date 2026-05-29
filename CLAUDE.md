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
