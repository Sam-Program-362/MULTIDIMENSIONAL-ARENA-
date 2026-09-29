# 001 — Keep the Simulation Separate from the Narrator

- **Decision:** The simulation core will be designed as a distinct system from the narrator. The narrator will interpret and communicate simulation state rather than own or define it.
- **Reason:** Separating authoritative world behavior from presentation supports persistent state as the source of truth, makes simulation behavior easier to test, and prevents narrative output from becoming the world model.
- **Status:** Accepted
- **Date:** 2026-09-29
