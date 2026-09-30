# Roadmap

- **Phase 0 — Project Foundation (complete)** — Documentation and repository safeguards established.
- **Phase 1 — Simulation Foundations (in progress)** — Phase 1a fighter creation/save-load, Phase 1b fixed-timestep movement and tuned deterministic combat basics, and Phase 1c's first seeded Rookie opponent are implemented. Phase 1c.1 added endurance (the guard resource), guard breaks, a per-attack minimum interval, and AI guard/punish/dash behavior. Phase 1c.2 added block auto-facing, empty delayed guard recovery, and the 28-tick interval. Phase 1c.3 adds the Exposure anti-spam meter (whiffed/blocked swings build exposure, clean hits barely do, and at full exposure the guard drops and damage taken is ×1.75) with Rookie punish/restraint hooks, and reverted the Rookie to the 1c.1 approach/hold/punish/dash controller while keeping the 1c.2 combat rules. Stamina pays for attacks and dodges; endurance absorbs blocked hits and breaks the guard when it empties; exposure penalizes repeated non-connecting offense. The current session-only training fight can switch between a stationary dummy and a delayed-observation, non-frame-perfect opponent; both use the same attack/block/dodge rules and debug HUD.
- Phase 2 — Persistent World State (planned)
- Phase 3 — World Events (planned)
- Phase 4 — Actors and Factions (planned)
- Phase 5 — Expanded Combat Simulation (planned; adaptive AI, personalities, multiple opponents, powers, and deeper combat on the implemented fixed-timestep prototype)
- Phase 6 — Progression and Consequences (planned)
- Phase 7 — Narrator Layer (planned)
- Phase 8 — Player Interface (planned)
- Phase 9 — Persistence and Recovery (planned)
- Phase 10 — Multiplayer and Shared World (planned)
- Phase 11 — Content and Scenario Tools (planned)
- Phase 12 — Observability and Balancing (planned)
- Phase 13 — Deployment and Operations (planned)
- Phase 14 — Testing and Hardening (planned)
- Phase 15 — Release and Live Evolution (planned)

## Planned future ideas — not built

- Spacing / engagement-cycle AI (edge-distance baiting, plans) — prototyped in 1c.2 and removed in 1c.3.
- Adaptive AI and behavior based on personalities/traits.
- Feints.
- Multiple simultaneous opponents.
- Fight rewards or progression consequences.
- A Heavy attack button.
- A weapon/equipment system supplying per-weapon attack profiles.
- Parry / perfect block and hit-stop.
- An optional button that frees movement from auto-facing.
