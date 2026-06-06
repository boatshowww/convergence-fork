# Convergence — Player Check Interface: Design Spec & Rationale

> **Purpose of this document.** This captures the design reasoning behind the player-side
> skill-check interface for *Convergence* (the Gargantua TTRPG tool). It is written to be
> handed to a Claude Code session as implementation context. It documents not just *what*
> the interface does, but *why* — including the alternatives that were considered and
> rejected — so that implementation choices don't accidentally undo a load-bearing decision.
>
> **Scope.** Player-side experience of initiating and resolving skill/stat checks during
> **exploration / story play** (the priority context). Turn-based combat, space combat, and
> downtime reuse the same check lifecycle but are out of scope here. The GM-side interface
> is referenced only where it constrains the player side.
>
> **Companion artifact.** `player-interface.html` — a working clickable prototype that
> implements everything below. The "GM Sim" bar in that file is a stand-in for the GM's
> separate interface and is not part of the player experience.

---

## 1. Foundational constraints (decided with the designer)

These were settled in conversation and are treated as fixed requirements, not preferences.

1. **Two interfaces, separate.** Players have their own interface to roll checks. The GM has
   a different interface to prompt checks and adjudicate. This document is the *player* side.
2. **The game holds the DC; the player never sees it.** DCs are set by the GM and stored by
   the system. The player rolls without knowing the target number. This is the single most
   important constraint — most of the UX falls out of it.
3. **GM narrates first, always.** A roll's *outcome* (success/failure/degree) is never
   revealed to the player before the GM has narrated what happens. The die result and the
   outcome are **decoupled in time**.
4. **Per-skill DCs, multi-skill gates.** A single obstacle ("gate") can accept multiple
   different skills, each with its *own* secret DC, entirely at GM discretion. Multiple crew
   members may roll against the same gate with different skills.
5. **Resolution modes vary by gate** (GM's choice): first-success, everyone-rolls, or
   best-result/contribution. (Player-side, this mostly affects whether a prompt is shared or
   personal; see §7.)

### Why constraint #3 drives everything
If the game knows the DC, the naive implementation resolves pass/fail the instant the die
lands. Constraint #3 forbids this. Therefore "rolled but not yet adjudicated" must be a
**first-class UI state** — a comfortable, intentional pause, not dead air or a spinner. This
is the spine of the whole design (see §4, state `PENDING`).

### Why hidden DCs + per-skill DCs force narrative-band feedback
Because each skill has its own secret DC, two players can roll the **same number** against the
same gate and get **different outcomes**, and neither sees why. If the UI showed bare
red/green pass/fail, this would read as a bug. **Therefore the resolution UI must never show
bare SUCCESS/FAIL.** It shows GM-authored *narrative bands* (e.g. No-read / Partial / Success /
Critical) where the fiction does the explanatory work the hidden number can't. Treat this as a
hard rule, not a nice-to-have.

---

## 2. The two entry points to a check

Every check originates one of two ways. **Both run the identical lifecycle** (§4). We do not
want two resolution philosophies depending on who initiated.

- **Door 1 — GM prompt (common case).** The GM stages a gate; it arrives on the player's
  screen as an elevated **call-to-action card** in the right pane, with the GM-flagged skills
  as primary buttons. The matching skills in the left-hand sheet **highlight in sync** so the
  prompt (right) and the action (left) read as one conversation.
- **Door 2 — Unprompted sheet/map click.** The player taps a skill on their sheet, or a tappable
  object on the center map, on their own initiative. Still runs the full lifecycle.

### Design rule: don't signal the easy skill
On a multi-skill prompt, the skill buttons must look **equally weighted** — no ordering or
styling that hints which skill has the lowest DC. Leaking the DC structure would push players
to min-max instead of choosing the *fictionally* appropriate skill. (In the prototype all
`.sbtn` buttons are visually identical.)

---

## 3. The mode toggle — "does this roll count?"

This is the centerpiece of the player interface and the resolution of the hardest UX problem
the rules create.

### The problem it solves
Late in design we established (see §5) that committing a real check is **consequential and
largely irreversible** (you can't improve a queued result except via a rare token). At the same
time, we explicitly want to *let players throw dice for fun* ("just to roll"). These two roll
types have very different stakes, so **the act of initiating a roll must telegraph, before the
tap lands, whether it counts.**

### The decision: a persistent, color-coded mode toggle
Two modes, shown as a sliding toggle at the top of the right pane:

| Mode | Meaning | Sent to GM? | Counts? | Color language |
|---|---|---|---|---|
| **Just Roll** | Throw dice for the feel of it — table theater, superstition | No | No | Teal (cool, quiet) |
| **Check** | A committed roll, held for GM narration | Yes | Yes | Gold (warm, consequential) |

A one-line hint under the toggle rewrites itself per mode so the player always knows the stakes
*before* tapping. The teal/gold split is deliberate and is reused everywhere: **gold = this
counts / the cosmos is involved; teal = quiet / pending / informational.**

### Alternatives considered and rejected
- **Per-tap choice (long-press = check, tap = just-roll).** Rejected as a *default*: less
  legible, easy to misfire, and gives no persistent indication of stakes. A long-press shortcut
  could be added later as an accelerator, but the persistent mode is the source of truth.
- **No "just roll" at all.** Rejected — players want tactile dice, and (critically) the
  discard rule in §5 means a spamming player is *already* effectively just rolling. Making it
  an explicit, first-class mode turns an awkward edge case into an intended feature.

### Known risk
A player parked in the wrong mode (means to commit but is in Just Roll, or vice versa). The
pending-tray visuals (§6) are the safety net. **Flag for playtest.**

---

## 4. The check lifecycle (state machine)

A check moves through these states. This is the canonical model; implement against it directly.

```
IDLE ──prompt arrives──▶ INVITED ──player commits a skill──▶ ROLLING
                                                               │
                                            (dice resolve; raw number shown)
                                                               ▼
                                                            PENDING ──GM opens resolution──▶ RESOLVING ──▶ RESOLVED
                                                               │                                              
                              ┌────────────────────────────────┼───────────────────────────┐
                              │                                 │                           │
                     cosmic re-roll (token)            re-roll same skill            (player does other things;
                     keep-highest, stays PENDING       → DISCARD/EJECT (§5)           pause is non-blocking)
```

### State-by-state

- **IDLE** — no active check. Sheet is freely rollable.
- **INVITED** — *(GM-prompt path only)* a prompt card is shown; flagged skills highlight on the
  sheet. The player has not yet chosen a skill. DC unknown, "easy skill" unsignaled.
- **ROLLING** — the player has committed a skill. The dice resolve **visually**: the d15 is
  prominent; the background luck d30 ticks alongside; exploding crits chain visibly
  (`15 → +9 → 24`). **This is the only moment the player sees a raw number.** The number is not
  the outcome.
- **PENDING** — the heart of the design (constraint #3). The card settles into a visible
  "● With the GM" state. The rolled total stays face-up like a die slid forward on the table.
  **Non-blocking:** the player can read the log, inspect the map, roll *other* skills. The only
  action available *on* a pending card is the cosmic re-roll, and only if a token is held (§5).
- **RESOLVING → RESOLVED** — the GM narrates. The narration arrives as story text; the pending
  card transforms into its **narrative band** (No-read / Partial / Success / Critical or similar)
  and drops into the log. Bare pass/fail is never shown (§1).

### The pause is the product
The PENDING beat intentionally recreates the table rhythm: roll → slide the die forward → look
up at the GM. Do **not** "optimize" this away with instant resolution. Make the wait feel
intentional: total stays elevated, a subtle "GM is looking at it" cue, and the player is free to
do other things meanwhile.

---

## 5. The two re-roll paths (deliberately opposite)

There are exactly two ways to roll a skill again, and they must read as **clearly different
actions** because they are economically opposite. Same verb, very different weight.

### 5a. Cosmic re-roll — a *funded*, powerful second attempt
- **Trigger to obtain:** the background luck d30 hits 30 (with luck stat added). This is rare by
  construction → a "cosmic moment" → grants a **cosmic token**.
- **Cost:** spends one token.
- **Power:** **keep the highest of the two rolls.** The player can only improve or hold, never
  lose ground. This is intentional — it should feel *very powerful* because it's rarely earned.
- **Timing window:** only available while the check is `PENDING`, i.e. *before* the GM narrates.
  The player is gambling on a number they judge too low, against a DC they can't see. This does
  **not** violate "GM narrates first" — they're betting on the raw number, not reacting to a
  revealed outcome.
- **Window close:** the moment the GM opens resolution, the cosmic button must **visibly retract**
  so the player sees the window close rather than getting a silently-rejected tap. Hard cutoff.
- **Visual:** gold, star-marked (`✦`). Both dice shown on use; the higher is claimed with weight.

### 5b. Discard re-roll — an *unfunded* re-roll that EJECTS from the queue
This is the anti-shopping mechanism and the subtler of the two. **Get this exactly right.**

- **Trigger:** the player rolls a skill that *already has a `PENDING` check*.
- **What it does NOT do:** it does **not** replace the old number with a new resolvable number.
  (That would be overwrite-and-resolve, which still leaves a spammer with one resolvable roll
  and a faint incentive to churn toward a high number.)
- **What it DOES do:** it **ejects that skill's attempt from the GM's resolution queue
  entirely.** The old attempt is demoted to an unevaluated "just roll"; the new roll is *also*
  just a (just-roll) throw. **Nothing for that skill gets adjudicated for that beat.**
- **Consequence (the point):** spamming a skill produces *no* resolvable result, not a better
  one. The only way to have a roll matter is to roll it **once** and let it sit. This removes
  the incentive to spam at the root. The rule's own logic disciplines the behavior — **no
  lockouts, no cooldowns, no scolding required.**
- **Guard:** the first discard requires a confirmation dialog that states precisely what
  happens: *"Your [Skill] roll (N) is still with the GM. Rolling again removes it from the
  resolution queue entirely — it will not be narrated or counted."* Default/safe action is
  **Keep Waiting**; the destructive action (**Roll Anyway**) is the non-default. After the player
  blows past it, they're in just-roll territory and the system stops interrupting — they can tap
  forever and the dice just dance.

### Why two paths, contrasted
| | Cosmic re-roll | Discard re-roll |
|---|---|---|
| Funded by | Cosmic token (rare) | Nothing |
| Effect on result | Keep highest of two | Ejects from queue; nothing resolves |
| Player feeling | Powerful, earned | "I've opted out of mattering" |
| Visual | Gold, `✦`, celebratory | Plain, faintly cautionary |

If these two ever look interchangeable, players will mistake the free discard for a free do-over
and resolution-shopping returns. Keep them visually and semantically distinct.

---

## 6. The pending tray & the one-per-skill rule

### The rule
A player may have **multiple checks pending at once, but only ONE per skill.** (GM prompts
Hacking → pending; player may separately roll Perception → also pending. Two skills, two cards,
fine. Two *Hacking* rolls in flight simultaneously — not allowed; the second triggers the
discard guard in §5b.)

### Layout consequence
The right pane has two zones:
- An **active tray** (top) holding live `PENDING` cards, each independently in its own micro-state
  (with/without cosmic action depending on token possession).
- The **historical log** (below) where resolved checks and unevaluated just-rolls fall.

### A happy coincidence
The one-per-skill constraint was added for *game-economy* reasons (anti-shopping), but it also
**bounds UI complexity**: a player can't have more live cards than they have skills, and
realistically it's 1–3 at a time. No runaway stack. The constraint that protects the game also
protects the layout.

### Sheet ↔ tray linkage
A skill with a pending check shows a breathing teal dot on the **left-pane sheet**, so the player
can see at a glance which skills are "in flight" without scanning the tray.

---

## 7. Resolution modes (player-side implications)

The GM picks a gate's resolution mode; here is what each means for the player card. (Full
authoring lives on the GM side, out of scope, but the player card must support all three.)

- **First-success** — the card is a *shared* gate object. When any crew member succeeds, it
  visibly closes for everyone ("Vane cracked it"). For non-turn-based exploration, allow a quick
  free-for-all with a tiny lockout so two simultaneous taps don't both "win."
- **Everyone-rolls** — the card is *personal*; a copy routes to each targeted player, each
  resolves their own, GM sees the aggregate. This is the evasive-maneuver pattern (every crew
  member rolls CON individually, with individual stakes).
- **Best-result / contribution** — behaves like first-success but stays open and accumulates
  contributions; GM closes it when satisfied.

The differentiating field in the data model is the **resolution mode**; the GM prompt-builder
and the player prompt-card are two views of the same object, and this field drives their
divergence.

---

## 8. The center map as a check origin

Tappable map objects (tokens, locations) can originate checks, keeping the *fiction* of the
check spatially linked to the act of initiating it ("scan that system", "read the sealed
container").

**Open decision (flagged):** in the prototype, tapping a map node **auto-switches to Check mode**,
on the theory that interacting with a thing in the fiction is inherently committal — you don't
"just roll" at the sealed container. The alternative is that map clicks **respect the current
mode** like the sheet does. This is a genuine fork; pick deliberately. (Auto-switch is more
magical/helpful but can surprise; respecting-mode is more consistent but allows accidental
just-rolls at fictional objects.)

---

## 9. Implied data model

The cards are two views of a shared object. Minimum fields an implementer will need:

```
Gate {
  id
  fiction: string                 // GM's prompt text
  flaggedSkills: [                 // skills the GM surfaced; player may also use "other"
    { skill, dc }                  // dc is SECRET — never sent to client in plaintext
  ]
  allowOtherSkills: bool           // the "other…" affordance
  resolutionMode: enum {           // drives shared-vs-personal card behavior (§7)
    FIRST_SUCCESS, EVERYONE_ROLLS, BEST_RESULT
  }
  targets: [playerId] | ALL        // who may roll
  bands: [                         // GM-authored narrative outcomes by result range
    { min, label, text }           // player sees the band, never the raw DC
  ]
  status: enum { OPEN, RESOLVED, CLOSED }
}

CheckAttempt {
  id
  gateId | null                    // null = unprompted (Door 2)
  playerId
  skill
  mode: enum { JUST_ROLL, CHECK }
  d15: { chain:[..], total, crit, fail }   // exploding-crit chain
  luck: { base, sum, cosmic }              // d30 + luck stat; cosmic if sum>=30
  state: enum { ROLLING, PENDING, EJECTED, RESOLVED, UNEVALUATED }
  cosmicReroll: { used:bool, prevTotal, newTotal, kept } | null
  resolvedBand: { label, text } | null     // populated only after GM narrates
}
```

**Critical security/UX note:** the DC and the band thresholds are **server/GM-held secrets**.
The client must never receive them before resolution, or a determined player will read them out
of network traffic and the entire hidden-DC design collapses. The client receives only the
*resolved band text* at resolution time.

### Dice resolution reference (from the GDD)
- **d15:** max 15, min 1. **15 = critical success → roll again and add** (exploding; repeat until
  non-15). **1 = critical failure → automatic non-pass.**
- **Luck d30 (background, every check):** 1–29 → nothing; **30 (or luck stat brings sum to 30) →
  cosmic moment → free re-roll token.** Luck stat is added to every luck roll.
- These run on *every* CHECK-mode roll. (Just-rolls may animate them too for feel, but they never
  grant a usable token outcome that matters, since just-rolls don't resolve. Decide whether a
  cosmic moment on a *just-roll* still grants a token — see Open Questions.)

---

## 10. Open questions (carry into implementation / playtest)

1. **Map clicks: auto-switch to Check, or respect current mode?** (§8)
2. **Cosmic moment on a *just-roll*:** does it still grant a token, or only on committed checks?
   (Leaning: only on CHECK, so the token economy stays tied to consequential play — but
   undecided.)
3. **GM prompts a skill that's already pending** (player's self-initiated Perception is in flight,
   then a scene beat fires a GM Perception prompt): block / queue / supersede? Lives at the
   intersection of "one-per-skill" and "GM can prompt anytime." Will surface in playtest.
4. **Unprompted roll with no GM-staged DC:** does it land as a raw result for the GM to interpret
   live, or send a "player wants to roll X" request the GM must accept? (Leaning: raw result for
   tempo; explicit request only when the player declares intent.)
5. **Mode-misfire frequency** (§3 known risk): measure in playtest whether the persistent toggle
   causes wrong-mode rolls often enough to warrant a long-press accelerator or a per-tap confirm.

---

## 11. Aesthetic direction (for continuity)

- **Palette:** Aeterna / cosmic-filament — deep teal-blue void, faint star/filament texture,
  a slowly-rotating accretion disk on the center map. Sourced from the project's black-hole
  reference imagery.
- **Color semantics (load-bearing, not decorative):**
  - **Teal** = quiet, pending, informational, "just roll."
  - **Gold** = committed, cosmic, "this counts." Reserve gold; over-use breaks the signal.
  - **Red** = critical failure / destructive action only.
- **Type:** `Chakra Petch` (HUD/labels, all-caps tracking) + `Spectral` (fiction/narration,
  italic). The split mirrors the two registers: machine/system vs. story/voice.
- **Motion:** the high-impact moments are (a) the dice resolution + crit chain, (b) the cosmic
  re-roll claim, and (c) the pending→narrated transition. Spend animation budget there; keep the
  rest restrained.

---

## 12. One-paragraph summary for a fresh context

*Convergence* players roll skill checks through a three-pane interface (character sheet · map ·
log). A persistent **mode toggle** distinguishes **Just Roll** (tactile, never counts, never
sent to the GM) from **Check** (committed, sent to the GM, held until narrated). The game holds
secret per-skill DCs the player never sees; therefore a committed roll enters a **PENDING**
state and the player learns the outcome only as **GM-authored narrative bands** after the GM
narrates — never as bare pass/fail. A rare **cosmic token** (earned when the background luck d30
hits 30) allows a **keep-highest** re-roll during the pending window. Re-rolling a skill that's
already pending **ejects it from the resolution queue entirely** (anti-shopping), demoting it to
a just-roll. Players may have one pending check per skill. Gold means "this counts / cosmic";
teal means "quiet / pending." See `player-interface.html` for the working prototype.
