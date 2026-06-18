# Ship Weapons & Ammunition — Reference Catalog

> **Status:** living doc. Updated 2026-06-18 with the ratified decisions from
> [[0003 Ship Combat Design Decisions]] **and** the four weapon-specific calls
> resolved here (subsystem multipliers, ordnance vs shields, energy heat/overcharge,
> starter roster confirmed). Numbers remain **proposals** and the primary combat
> balance levers — tune freely, like `Ship Archetypes.md`. Grounded in the GDD
> (*Weapons*, *Personal Equipment → shields*, *Spacecrafts*), the Ship-Combat class
> diagram (`ShipWeapon{type,damage,range,targetingSkill,cooldown}`), and the GM Mockup
> ("Weapon Docks: Laser / Torpedo Bay / Laser"). Marked **[OPEN]** = still undecided.

## The core model (load-bearing — not the numbers)

A ship hull has a number of **weapon docks** (slots). **A dock may be empty.** An
equipped dock holds a **weapon** of some **type**, loaded with an **ammunition**
type, with a **current targeting** solution. *The equipped weapon + its ammo + the
targeting is what determines the interaction* — not the raw dock count. (Two ships
with "4 docks" can play completely differently.)

The damage rule, from the GDD (*"shields are only effective against energy
weapons"*) as refined in ADR 0003 and the ordnance call below:

> **Shields hold off energy entirely and blunt everything else.** *While shields are
> up:* **energy** is fully absorbed by the shields; **kinetic** and **ordnance** are
> **reduced 20%** (that 20% chips the shields, the other 80% reaches the hull). *Once
> shields are depleted,* all damage strikes the **hull** in full.

That gives every fight a texture: **energy is the only true shield-stripper** (100%
into shields → drops them fastest); kinetic and ordnance leak 80% straight through
even while shields hold, but can't bring the shields down as quickly. When the
shields fall, everything lands full.

## Damage flow

```
to-hit CHECK  (gunner's Heavy Weapons at Targeting  vs  geometry DC from difficulty.js)
   → band  (Critical / Success / Partial / Miss)
   → band scales the weapon's base damage   (see SHIP_COMBAT_UX.md §Resolution)
   → apply, depending on the target's shields:
        shields > 0:
          ENERGY              → 100% to shields (overflow to hull)
          KINETIC / ORDNANCE  → 20% to shields, 80% to hull
        shields = 0:
          ALL TYPES           → 100% to hull
   hull ≤ 0  →  destroyed (escape pods)
```

## Weapon types

| Type | Examples | Vs shields (while up) | Vs hull | Range | Cooldown | Role |
|------|----------|-----------|---------|-------|----------|------|
| **Energy** | Pulse Laser, Beam Cannon, Plasma Lance | **fully absorbed** | normal | med | **heat-limited** (see below) | shield-stripper; sustained DPS |
| **Kinetic** | Autocannon, Railgun, Mass Driver, Flak | **−20%** | **high** | long (railgun) / short (flak) | reload | hull-killer through shields |
| **Ordnance** | Torpedo, Breaching Charge, EMP Torpedo | **−20%** | **very high** | very long, slow/interceptable | long reload | finisher; needs a Torpedo Bay |

### Confirmed starter weapons (per-dock)

| Weapon | Type | Base dmg | Range (km) | Skill | Cooldown/Reload | Notes |
|--------|------|---------:|-----------:|-------|-----------------|-------|
| Pulse Laser | Energy | 8 | 2500 | Heavy Weapons | heat | reliable shield-stripper |
| Beam Cannon | Energy | 14 | 2000 | Heavy Weapons | heat | high burst, short-range falloff |
| Autocannon | Kinetic | 10 | 1800 | Heavy Weapons | 1 turn | punches through shields into hull |
| Railgun | Kinetic | 22 | 4000 | Heavy Weapons | 2 turns | long-range hull punch; slow |
| Flak Battery | Kinetic | 5 | 800 | Heavy Weapons | 1 turn | point-defense; intercepts ordnance |
| Torpedo Bay | Ordnance | 40 | 5000 | Heavy Weapons | 3 turns | guided; can be shot down by flak |

**Skill is settled:** all ship weapons roll the gunner's **Heavy Weapons** skill at
the Targeting station (ADR 0003 Q1). No separate Gunnery skill.

### Heat (energy weapons)
Energy weapons don't reload — they build **heat**. Each shot adds heat; when a
weapon reaches its **heat capacity** it **overheats** and must **cool for N turns**
(by model) before it can fire again. Sustained-fire designs run cool; burst designs
overheat fast. **Overcharge** mode deals **1.5× damage** for **2× heat** that shot
(ADR 0003 / weapons Q4) — a burst at the cost of running hot.

| Energy weapon | Heat / shot | Heat capacity | Cool (turns) | Feel |
|---------------|------------:|--------------:|-------------:|------|
| Pulse Laser | 1 | 4 | 1 | sustains ~4 shots before a 1-turn cooldown |
| Beam Cannon | 2 | 4 | 2 | ~2 shots, then a 2-turn cooldown |

> **[OPEN]** exact heat numbers are balance levers. **Implementation note:** heat is
> a **new mechanic** — energy `weaponDocks` need `heat / heatCap / heatPerShot /
> coolTurns` state on the radar entity, ticked each turn.

## Ammunition

Ammo modifies the interaction without changing the dock. **First playable: ammo is
infinite** (ADR 0003 Q3) — magazines/reload scarcity come later. The types below are
documented now so the model is ready; the *type* still matters (it changes the
effect), only the *count* is ignored in v1.

| Ammo | For | Effect |
|------|-----|--------|
| **Standard** | kinetic/ordnance | baseline |
| **Armor-Piercing (AP)** | kinetic | +hull damage, −vs shields |
| **High-Explosive (HE)** | kinetic | splash + higher system-crit chance, −range |
| **Flak/Point-Defense** | kinetic | weak vs ships, intercepts incoming ordnance |
| **EMP** | ordnance | low hull damage; on hit disables a station/system a turn |
| **Breaching** | ordnance | enables a boarding action on hit (deferred) |
| Energy "modes" | energy | not ammo — *Overcharge* (1.5× dmg / 2× heat) |

## Targeting

The **Targeting** station's gunner picks, per volley:
1. **Target ship** — must be within the weapon's range and currently **scanned/visible**
   (scan is a **Network** action; an unscanned contact shows `?? / ??`).
2. **Subsystem (optional):** `Shields` · `Engines` (cripple maneuver) · `Weapons`
   (knock out a dock) · a **station** (disable it). Aiming a subsystem multiplies the
   to-hit DC: **Helm = 2×, all other subsystems = 1.5×** (ADR 0003 Q2). **If no
   subsystem is named, a hidden roll randomizes which ship system takes the damage
   and how much.**
3. The **firing solution** → the to-hit DC, from geometry (range + relative velocity −
   the target's Helm/Evasion), already modeled in `src/lib/radar/difficulty.js`.

All equipped docks fire as **one Targeting action** per turn (the GM Mockup's single
Targeting station), each rolling/applying by its own weapon + ammo.

## Settled (see [[0003 Ship Combat Design Decisions]])
- Ship-weapon skill = **Heavy Weapons** (Q1).
- Shields: **energy fully absorbed**; **kinetic & ordnance −20% while shields up**;
  **full to hull once shields depleted** (Q4 + ordnance call).
- Subsystem targeting: **Helm 2×, all else 1.5×**; **untargeted → hidden random-system** hit (Q2).
- **Infinite ammo** for the first playable (Q3).
- **Scan is a Network action** (Q5).
- **Energy heat + Overcharge** (1.5× dmg / 2× heat); heat capacity/cooldown per model.
- **Starter roster confirmed** (the six weapons above).

## Open questions (balance, not design)
- **[OPEN]** Per-weapon damage/range/heat numbers will shift with playtest.
- **[OPEN]** Heat capacity/cool-turns for any additional energy weapons (e.g. Plasma Lance).
