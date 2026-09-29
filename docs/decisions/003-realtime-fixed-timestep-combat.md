# 003 — Real-time Combat Uses a Fixed Timestep

- **Decision:** Combat is real-time on a fixed-timestep simulation. Rendering is separate from simulation and may interpolate or otherwise present simulation state.
- **Reason:** A fixed timestep makes combat behavior deterministic, testable, and consistent across rendering performance differences.
- **Status:** Accepted
- **Date:** 2026-09-29
- **Status of implementation:** Implemented for arena movement and the Phase 1b-ii combat-basics training fight at 60 ticks per second. Broader combat and world systems remain planned.
