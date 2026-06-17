# Ship Weapons & Ammunition — Reference Catalog

> **Status:** DRAFT for Scott's review (2026-06-17). Numbers here are **proposals**
> and the primary combat balance levers — tune freely, like `Ship Archetypes.md`.
> Grounded in the GDD (*Weapons*, *Personal Equipment → shields*, *Spacecrafts*),
> the Ship-Combat class diagram (`ShipWeapon{type,damage,range,targetingSkill,
> cooldown}`), and the GM Mockup ("Weapon Docks: Laser / Torpedo Bay / Laser").

## The core model (this is the part that's load-bearing, not the numbers)

A ship hull has a number of **weapon docks** (slots). **A dock may be empty.** An
equipped dock holds a **weapon** of some **type**, loaded with an **ammunition**
type, with a **current targeting** solution. *The equipped weapon + its ammo + the
targeting is what determines the interaction* — not the raw dock count. (So two
ships with "4 docks" can play completely differently.)

The single most important rule, straight from the GDD:

> **Shields stop energy, not matter.** Shields absorb **energy** damage until
> depleted; **kinetic** and **ordnance** damage largely *bypass* shields and strike
> the **hull** directly.

That one rule gives every fight a texture: strip shields with energy, *then* the
hull is exposed to everything — or skip shields entirely with kinetic/torpedoes at
the cost of ammo and reload time.

## Damage flow

```
to-hit CHECK (gunner skill at Targeting vs target DC)  ──►  band
   band → damage multiplier (see SHIP_COMBAT_UX.md §Resolution)
   apply by weapon type:
     ENERGY    → shields first, overflow to hull
     KINETIC   → hull directly (shields stop only a small fraction)
     ORDNANCE  → hull directly, may trigger a system crit
   hull ≤ 0  →  destroyed (escape pods)
```

## Weapon types

| Type | Examples | Vs shields | Vs hull | Ammo? | Range | Reload/CD | Role |
|------|----------|-----------|---------|-------|-------|-----------|------|
| **Energy** | Pulse Laser, Beam Cannon, Plasma Lance | **full** (absorbed) | normal | no (power/heat-limited) | med | short cooldown | shield-stripper; sustained DPS |
| **Kinetic** | Autocannon, Railgun, Mass Driver, Flak | mostly **bypassed** | **high** | **yes** | long (railgun) / short (flak) | reload | hull-killer; needs magazines |
| **Ordnance** | Torpedo, Breaching Charge, EMP Torpedo | bypassed | **very high** | **yes (scarce)** | very long, slow/interceptable | long reload | finisher; needs a Torpedo Bay |

### Proposed starter weapons (per-dock)

| Weapon | Type | Base dmg | Range (km) | Skill | CD/Reload | Notes |
|--------|------|---------:|-----------:|-------|-----------|-------|
| Pulse Laser | Energy | 8 | 2500 | Heavy Weapons | 1 turn | reliable shield-stripper |
| Beam Cannon | Energy | 14 | 2000 | Heavy Weapons | 2 turns | high energy burst, short range falloff |
| Autocannon | Kinetic | 10 | 1800 | Heavy Weapons | 1 turn (mag 6) | bypasses shields; chews hull |
| Railgun | Kinetic | 22 | 4000 | Heavy Weapons | 2 turns (mag 3) | long-range hull punch; slow |
| Flak Battery | Kinetic | 5 | 800 | Heavy Weapons | 1 turn | point-defense; intercepts ordnance |
| Torpedo Bay | Ordnance | 40 | 5000 | Heavy Weapons | 3 turns (mag 4) | guided; can be shot down by flak |

*(Skill is a placeholder — see open question on a dedicated **Gunnery** skill vs.
reusing **Heavy Weapons**.)*

## Ammunition types

Ammo modifies the interaction without changing the dock. Magazines are finite —
running dry is a real constraint (mirrors the GDD's anti-matter/Casamir scarcity
theme).

| Ammo | For | Effect |
|------|-----|--------|
| **Standard** | kinetic/ordnance | baseline |
| **Armor-Piercing (AP)** | kinetic | +hull damage, −vs shields |
| **High-Explosive (HE)** | kinetic | splash + higher system-crit chance, −range |
| **Flak/Point-Defense** | kinetic | weak vs ships, intercepts incoming ordnance |
| **EMP** | ordnance | low hull damage; on hit disables a **station/system** a turn (a Network-style effect delivered by gunnery) |
| **Breaching** | ordnance | enables a **boarding** action on hit (deferred) |
| Energy "modes" | energy | not ammo — *Overcharge* trades cooldown for damage |

## Targeting

The **Targeting** station's gunner picks, per volley:
1. **Target ship** (must be within the weapon's range and the radar draw distance).
2. **Subsystem** (optional, raises DC): `Hull` (default) · `Shields` · `Engines`
   (cripple maneuver) · `Weapons` (knock out a dock) · `Helm/Network` (disable a
   station). Subsystem hits require a **Success+** and a successful system-crit.
3. The **firing solution** → the to-hit DC, computed from geometry (range +
   relative velocity − the target's Helm/Evasion), already modeled in
   `src/lib/radar/difficulty.js`.

All equipped docks fire as **one Targeting action** per turn (per the GM Mockup's
single Targeting station), each rolling/​applying by its own weapon+ammo.

## Open questions for Scott (design calls, not code)

1. **Gunnery skill:** dedicated **Gunnery** skill, or keep reusing **Heavy
   Weapons** (currently in `difficulty.js`)? Affects the skill list + character sheet.
2. **Subsystem targeting depth:** ship as one HP pool (simplest), or the
   subsystem-crit model above (engines/weapons/stations can be knocked out)?
3. **Ammo bookkeeping in v1:** track magazines now, or treat energy-only/​infinite
   for the first playable and add ammo after?
4. **Shield vs kinetic exact fraction:** GDD says shields are *only* effective vs
   energy. Do kinetic/ordnance ignore shields **entirely**, or shields stop a token
   fraction (e.g., 25%)? (Recommend: entirely, for clarity.)
5. **Per-dock weapon roster:** confirm/extend the six starter weapons + their numbers.
