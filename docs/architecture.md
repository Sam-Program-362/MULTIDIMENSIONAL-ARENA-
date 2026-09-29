# Architecture

The implemented foundation follows these principles:

- `src/sim/` contains deterministic fighter generation, input mapping, arena movement, and combat rules without DOM/browser references.
- `src/ui/` owns screens, browser input, the fixed-timestep render loop, and canvas presentation.
- `src/storage/` owns the versioned local fighter-save adapter. Combat state is intentionally not saved.
- Plain-data combat events connect simulation outcomes to temporary UI feedback without putting rules in the renderer.
- Deterministic or seeded behavior is used where practical so simulation behavior can be reproduced and tested.

Persistent world state, narrator systems, actors/factions, backend services, and multiplayer architecture remain future work.
