# 003 — Real-time Combat Uses a Fixed Timestep

- **Decision:** Combat will be real-time on a fixed-timestep simulation. Rendering is separate from simulation and may interpolate or otherwise present simulation state.
- **Reason:** A fixed timestep makes combat behavior deterministic, testable, and consistent across rendering performance differences.
- **Status:** Accepted
- **Date:** 2026-09-29
- **Status of implementation:** Planned; no combat, movement, rendering loop, or opponents are built in Phase 1a.
