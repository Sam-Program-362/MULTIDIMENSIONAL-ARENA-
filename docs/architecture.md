# Architecture

The implemented foundation follows these principles:

- `src/sim/` contains deterministic fighter generation, input mapping, arena movement, combat rules, and the Rookie AI without DOM/browser references.
- `src/sim/ai.ts` converts delayed observations into the same `CombatInput` used by the player. Its target history and serializable seeded-RNG state are plain data; `stepCombatWithAi` sends the result through the shared pair-combat step. The Rookie keeps an explicit engagement cycle (approach → hold at the edge of the target's reach → entry plan → strike → disengage) in `AiState`; the delayed snapshot includes the target's public attack cooldown, and every behavior number lives in `ROOKIE_PROFILE`.
- Combatant resources are separated by role: health, **stamina** (attacks and dodges), and **endurance** (blocked hits only, with guard break at zero). All three are derived and bounded in `deriveCombatVitals` and live on the same generic combatant shape used by the player, the dummy, and the AI opponent.
- Attack numbers live in an `AttackProfile` (`COMBAT_TUNING.attackProfiles.basic`). Combat reads them through `attackProfileOf(actor)` using the combatant's `attackProfileId`, so per-weapon profiles can be added later without touching combat code. A per-attack `minIntervalTicks` (28 for the basic attack) gates only attacks; block, dodge, and movement are unaffected.
- Facing auto-tracks the opponent while idle **and while a block is in startup/active phase**; it stays locked during attack, dodge, stagger, and block recovery. A guard break leaves endurance empty and pauses its regeneration for a dedicated post-stagger delay (`guardBreakRegenDelayTicks`), separate from the ordinary post-block delay.
- `src/ui/` owns screens, browser input, the fixed-timestep render loop, the Dummy/Opponent session toggle, and canvas presentation.
- `src/storage/` owns the versioned local fighter-save adapter. Combat and AI state are intentionally not saved.
- Plain-data combat events connect simulation outcomes to temporary UI feedback without putting rules in the renderer.
- Deterministic or seeded behavior is used where practical so complete fights can be reproduced and tested.

Heavy attacks, a weapon/equipment system, parry or perfect block, hit-stop, adaptive AI, AI personalities, multiple opponents, fight rewards, persistent world state, narrator systems, actors/factions, backend services, and multiplayer architecture are **planned only** and remain future work.
