# Architecture

The implemented foundation follows these principles:

- `src/sim/` contains deterministic fighter generation, input mapping, arena movement, combat rules, the Rookie and Veteran AI tiers, day counting, injury calculations, clinic actions, opponent temperaments, grudge/revenge logic, and aftermath text without DOM/browser references.
- `src/sim/combat.ts` implements fixed-timestep pair combat. Combatant resources include health, **stamina** (attacks and dodges), **endurance** (blocked hits only, with guard break at zero), and **exposure** (anti-spam meter). Combatants accept optional `modifiers` (`maxHealth`, `maxStamina`, `moveSpeed`, `attackDamage`) that apply injury penalties in official bouts while keeping Training Room sparring unmodified.
- `src/sim/career.ts` drives career loop progression:
  - Day counter starting at 1, advanced by match settlements and `restDay(state)`.
  - Structured injuries (`head`, `ribs`, `arm`, `leg`) with healing (`0.5` untreated, `1.0` treated per day), area penalties capped at `0.40`, and severe injury gating for paid bouts.
  - Medical Clinic pure functions (`applyBasicCare`, `applyPremiumTreatment`).
  - Opponent roster with immutable temperaments (`professional`, `brutal`, `ruthless`).
  - Grudge tracking and dynamic Revenge bout offers (1.5x purse, +1 extra rank point, +25 bounty).
  - Deterministic pure aftermath lines (`aftermathLines`).
- `src/ui/` owns screens, browser input, the fixed-timestep render loop, Hub, Clinic, Find Match, Match Result, History, Profile, and canvas presentation.
- `src/storage/` owns the versioned local save adapter (Save Schema v3), defensively migrating v1 and v2 data while preserving old keys.
- Plain-data combat events and match settlement results connect simulation outcomes to UI presentation without putting business rules in the renderer.

Equipment loot/loss, Permanent Death execution/spare choices, daily living costs, and housing effects remain **planned only**.
