# Architecture

The implemented foundation follows these principles:

- `src/sim/` contains deterministic fighter generation, input mapping, arena movement, combat rules, and the basic AI opponent without DOM/browser references.
- The AI (`src/sim/ai.ts`) is a pure `decide` function that emits the same `CombatInput` as the player and runs through the same combat step. It perceives the opponent through a delayed history buffer and keeps its seeded RNG state inside its own value, so fights stay deterministic. Adaptive/learning AI, personalities, and multiple opponents remain planned.
- `src/ui/` owns screens, browser input, the fixed-timestep render loop, and canvas presentation.
- `src/storage/` owns the versioned local fighter-save adapter. Combat state is intentionally not saved.
- Plain-data combat events connect simulation outcomes to temporary UI feedback without putting rules in the renderer.
- Deterministic or seeded behavior is used where practical so simulation behavior can be reproduced and tested.

Persistent world state, narrator systems, actors/factions, backend services, and multiplayer architecture remain future work.
