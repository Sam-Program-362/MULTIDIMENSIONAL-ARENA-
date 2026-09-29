# Architecture

> **Mostly a future plan.** Only the parts marked implemented below exist today.

The planned architecture follows these principles:

- Keep the simulation core separate from the UI and from the narrator.
- Treat persistent state as the source of truth.
- Use an event-driven model for changes and reactions in the world.
- Use deterministic or seeded randomness where practical, so simulation behavior can be reproduced and investigated.

## Implemented so far

- **Simulation separate from presentation** — `src/sim/` has no DOM or browser imports and is tested without a browser. `src/render/` draws simulation state and never writes to it; `src/ui/` owns screens, input, and the frame loop. A test fails the build if simulation code reaches for browser APIs.
- **Deterministic behavior** — seeded fighter generation, and a fixed-timestep arena simulation where the same start state and input sequence produce an identical end state (decision 003).
- **Versioned local persistence** — a single schema-versioned save behind a storage adapter, with a structural check on load.

Persistent world state, the event-driven world model, the narrator layer, and any server-side storage are still planned.
