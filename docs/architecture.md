# Architecture

The implemented foundation follows these principles:

- `src/sim/` contains deterministic fighter generation, input mapping, arena movement, combat rules, and the Rookie AI without DOM/browser references.
- `src/sim/ai.ts` converts delayed observations into the same `CombatInput` used by the player. Its target history and serializable seeded-RNG state are plain data; `stepCombatWithAi` sends the result through the shared pair-combat step.
- `src/ui/` owns screens, browser input, the fixed-timestep render loop, the Dummy/Opponent session toggle, and canvas presentation.
- `src/storage/` owns the versioned local fighter-save adapter. Combat and AI state are intentionally not saved.
- Plain-data combat events connect simulation outcomes to temporary UI feedback without putting rules in the renderer.
- Deterministic or seeded behavior is used where practical so complete fights can be reproduced and tested.

Adaptive AI, AI personalities, multiple opponents, fight rewards, persistent world state, narrator systems, actors/factions, backend services, and multiplayer architecture are **planned only** and remain future work.
