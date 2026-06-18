# Ship Weapons & Ammunition — Reference Catalog

> **Status:** living doc. Updated 2026-06-18 to fold in the ratified decisions from
> [[0003 Ship Combat Design Decisions]]. Numbers here are **proposals** and the
> primary combat balance levers — tune freely, like `Ship Archetypes.md`. Grounded
> in the GDD (*Weapons*, *Personal Equipment → shields*, *Spacecrafts*), the
> Ship-Combat class diagram (`ShipWeapon{type,damage,range,targetingSkill,cooldown}`),
> and the GM Mockup ("Weapon Docks: Laser / Torpedo Bay / Laser"). Marked
> **[OPEN]** = still undecided.

## The core model (load-bearing — not the numbers)

A ship hull has a number of **weapon docks** (slots). **A dock may be empty.** An
equipped dock holds a **weapon** of some **type**, loaded with an **ammunition**
type, with a **current targeting** solution. *The equipped weapon + its ammo + the
targeting is what determines the interaction* — not the raw dock count. (Two ships
with "4 docks" can play completely differently.)

The damage rule, from the GDD (*"shields are only effective against energy
weapons"*) as refined in ADR 0003:

> **Shields stop energy; they barely slow matter.** Shields absorb **energy** damage
> until depleted. **Kinetic** damage is **reduced 20% by shields**, the rest strikes
> the **hull**. **Ordnance** bypasses shields and strikes the hull directly.

That gives every fight a texture: strip shields with energy, *then* the hull is fully
exposed — or skip the shield problem with kinetic/ordnance straight into the hull.

## Damage flow

```
to-hit CHECK  (gunner's Heavy Weapons at Targeting  vs  geometry DC from difficulty.js)
   → band  (Critical / Success / Partial / Miss)
   → band scales the weapon's base damage   (see SHIP_COMBAT_UX.md §Resolution)
   → apply by weapon TYPE:
        ENERGY    → shields absorb fully, overflow to hull
        KINETIC   → shields absorb 20%, the other 80% strikes hull
        ORDNANCE  → straight to hull (may trigger a system crit)
   hull ≤ 0  →  destroyed (escape pods)
```

## Weapon types

| Type | Examples | Vs shields | Vs hull | Range | Reload/CD | Role |
|------|----------|-----------|---------|-------|-----------|------|
| **Energy** | Pulse Laser, Beam Cannon, Plasma Lance | **fully absorbed** | normal | med | short cooldown | shield-stripper; sustained DPS |
| **Kinetic** | Autocannon, Railgun, Mass Driver, Flak | **−20% only** | **high** | long (railgun) / short (flak) | reload | hull-killer through shields |
| **Ordnance** | Torpedo, Breaching Charge, EMP Torpedo | **bypassed** | **very high** | very long, slow/interceptable | long reload | finisher; needs a Torpedo Bay |

### Proposed starter weapons (per-dock) **[OPEN — confirm/extend the roster & numbers]**

| Weapon | Type | Base dmg | Range (km) | Skill | CD/Reload | Notes |
|--------|------|---------:|-----------:|-------|-----------|-------|
| Pulse Laser | Energy | 8 | 2500 | Heavy Weapons | 1 turn | reliable shield-stripper |
| Beam Cannon | Energy | 14 | 2000 | Heavy Weapons | 2 turns | high burst, short-range falloff |
| Autocannon | Kinetic | 10 | 1800 | Heavy Weapons | 1 turn | punches through shields into hull |
| Railgun | Kinetic | 22 | 4000 | Heavy Weapons | 2 turns | long-range hull punch; slow |
| Flak Battery | Kinetic | 5 | 800 | Heavy Weapons | 1 turn | point-defense; intercepts ordnance |
| Torpedo Bay | Ordnance | 40 | 5000 | Heavy Weapons | 3 turns | guided; can be shot down by flak |

**Skill is settled: all ship weapons roll the gunner's _Heavy Weapons_ skill** at the
Targeting station (ADR 0003 Q1). No separate Gunnery skill.

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
| Energy "modes" | energy | not ammo — *Overcharge* trades cooldown for damage |

## Targeting

The **Targeting** station's gunner picks, per volley:
1. **Target ship** — must be within the weapon's range and currently **scanned/visible**
   (scan is a **Network** action; an unscanned contact shows `?? / ??`).
2. **Subsystem (optional):** `Shields` · `Engines` (cripple maneuver) · `Weapons`
   (knock out a dock) · `Helm/Network` (disable a station). Aiming a subsystem applies
   a **1.5–2× difficulty multiplier** to the to-hit DC (ADR 0003 Q2). **If no subsystem
   is named, a hidden roll randomizes which ship system takes the damage and how much.**
3. The **firing solution** → the to-hit DC, from geometry (range + relative velocity −
   the target's Helm/Evasion), already modeled in `src/lib/radar/difficulty.js`.

All equipped docks fire as **one Targeting action** per turn (the GM Mockup's single
Targeting station), each rolling/applying by its own weapon + ammo.

## Open questions (design calls, not code)

1. **[OPEN]** Per-dock weapon roster & numbers — confirm/extend the six starters above.
2. **[OPEN]** Subsystem multiplier — fixed (e.g. 1.5×), or scaling by subsystem (engines
   easier than a single dock)? Currently the **1.5–2×** band.
3. **[OPEN]** Does ordnance bypass shields **entirely** (current), or also get the 20%
   reduction? (Only kinetic's 20% is ratified; ordnance left as full bypass for now.)
4. **[OPEN]** Energy *Overcharge* exact trade (extra damage for how much extra cooldown).

## Settled (see [[0003 Ship Combat Design Decisions]])
- Ship-weapon skill = **Heavy Weapons** (Q1).
- **Shields reduce kinetic damage by 20%** (Q4); energy fully absorbed; ordnance bypasses.
- Subsystem targeting at **1.5–2× difficulty**; **untargeted → hidden random-system** hit (Q2).
- **Infinite ammo** for the first playable (Q3).
- **Scan is a Network action** (Q5).
