# Architecture

The implemented foundation follows these principles:

- `src/sim/` contains deterministic fighter generation, input mapping, arena movement, combat rules, and the Rookie AI without DOM/browser references.
- `src/sim/ai.ts` converts delayed observations into the same `CombatInput` used by the player. Its target history and serializable seeded-RNG state are plain data; `stepCombatWithAi` sends the result through the shared pair-combat step.
- Combatant resources are separated by role: health, **stamina** (attacks and dodges), **endurance** (blocked hits only, with guard break at zero), and **exposure** (an anti-spam meter applied to the attacker as attacks resolve). A broken guard staggers for 40 ticks, ends at zero endurance, waits 30 additional ticks, then regenerates gradually. Exposure rises on whiffed and blocked swings, barely on clean hits, and decays each tick; at maximum the fighter is **Exposed** for a fixed window during which block cannot be raised and incoming damage is multiplied, after which exposure resets to a fraction of maximum. All resources live on the same generic combatant shape used by the player, the dummy, and the AI opponent; health/stamina/endurance are derived and bounded in `deriveCombatVitals`, and exposure tuning is `COMBAT_TUNING.exposure`. See `docs/decisions/008-exposure-anti-spam.md`.
- Attack numbers live in an `AttackProfile` (`COMBAT_TUNING.attackProfiles.basic`). Combat reads them through `attackProfileOf(actor)` using the combatant's `attackProfileId`, so per-weapon profiles can be added later without touching combat code. A per-attack `minIntervalTicks` gates only attacks; block, dodge, and movement are unaffected.
- `src/ui/` owns screens, browser input, the fixed-timestep render loop, the Dummy/Opponent session toggle, and canvas presentation.
- `src/storage/` owns the versioned local fighter-save adapter. Combat and AI state are intentionally not saved.
- Plain-data combat events connect simulation outcomes to temporary UI feedback without putting rules in the renderer.
- Deterministic or seeded behavior is used where practical so complete fights can be reproduced and tested.

Heavy attacks, a weapon/equipment system, parry or perfect block, hit-stop, spacing/engagement AI, adaptive AI, AI personalities, feints, multiple opponents, fight rewards, persistent world state, narrator systems, actors/factions, backend services, and multiplayer architecture are **planned only** and remain future work.
