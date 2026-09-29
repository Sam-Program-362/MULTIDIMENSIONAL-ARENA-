# 003 — Real-time Combat Uses a Fixed Timestep

- **Decision:** Combat will be real-time on a fixed-timestep simulation. Rendering is separate from simulation and may interpolate or otherwise present simulation state.
- **Reason:** A fixed timestep makes combat behavior deterministic, testable, and consistent across rendering performance differences.
- **Status:** Accepted
- **Date:** 2026-09-29
- **Status of implementation:** Partly implemented in Phase 1b-i. The fixed timestep (60 ticks per second), the pure accumulator with capped catch-up, deterministic movement stepping, and a render loop that reads simulation state are built. Combat itself — attacks, blocking, dodging, stamina and health use, opponents, and AI — is still planned.
