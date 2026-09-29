# 004 — The Arena View Uses Canvas 2D with a Faked 2.5D Projection

- **Decision:** The arena is drawn with the Canvas 2D API. Depth is faked: the floor is an angled ground plane, sizes scale with depth, and everything standing on the floor is painted back to front by its z coordinate. No 3D library and no image assets are used. The projection maths lives in `src/render/projection.ts`, apart from both the simulation and the drawing code.
- **Reason:** The movement prototype needs a readable sense of depth on a phone, not a 3D engine. Canvas 2D ships with the browser, keeps the bundle small, starts instantly on low-end devices, and keeps the rendering boundary obvious: the renderer reads simulation state and never writes to it. A real 3D renderer can replace this layer later without touching `src/sim/`.
- **Status:** Accepted
- **Date:** 2026-09-29
- **Status of implementation:** Implemented in Phase 1b-i for the movement prototype: floor, grid, corner posts, and a placeholder fighter with a shadow. Camera effects, animation, and art are planned, not built.
