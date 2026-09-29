# Development Log

## 2026-09-29 — Phase 1a

Inspected the docs-only repository and confirmed there was no package manifest, runtime, source code, or application stack. Added a Vite + TypeScript vanilla app with Vitest. Implemented the first vertical slice: deterministic seeded fighter generation, validation, a versioned localStorage adapter, a mobile-first creation flow, and a profile screen that intentionally hides internal stats and traits. Added tests for determinism, validation, persistence, corrupt saves, and the simulation/DOM boundary.

Combat, movement, rendering/canvas, AI, opponents, economy logic, Neon, matchmaking, and progression changes remain planned and are not implemented.

## 2026-09-29 — Phase 1b-i (real-time movement prototype)

Reviewed Phase 1a and applied two fixes before building on it. Fighter input now has explicit text limits (name 40, other single-line fields 60, list entries 60, background 200) reported with a readable message, and the creation form carries matching `maxlength` attributes. The save loader now checks that a payload has every required field with the right type and reports anything else as "no save" instead of throwing; the check deliberately ignores text length, so saves written before the limits existed still load. The save schema version is unchanged.

Built the first real-time slice on top of decision 003. `src/sim/timestep.ts` holds a pure accumulator that converts elapsed real time into whole 60 Hz ticks and caps catch-up at five ticks per frame, so a hidden tab or a slow device cannot spiral. `src/sim/arena.ts` holds the arena state (floor bounds, position, velocity, facing) and a pure `step()`: input is clamped per axis and normalised, so diagonals move at the same speed as straight lines, movement comes from a single speed constant, and the fighter is clamped inside the floor. The same start state and input sequence always produce an identical end state.

Rendering lives apart from the simulation in `src/render/`: `projection.ts` is pure 2.5D maths (an angled ground plane with depth scaling) and `arenaRenderer.ts` paints the floor, grid, corner posts, and the fighter with a shadow, depth sorted by z, using placeholder shapes only. `src/ui/arenaScreen.ts` runs the frame loop — real elapsed time into the accumulator, then whole ticks, then one render — and wires a virtual joystick (pointer events, pointer capture so a drag or release outside the pad still behaves) plus WASD/arrow keys. Touch scrolling, pinch zoom, and double-tap zoom are suppressed over the arena, and the canvas re-measures on resize and rotation. The profile screen gained an "Enter Arena" button; the arena has a "Leave" button that returns to the unchanged profile and tears down the loop and its listeners.

Tests cover movement direction, diagonal speed, bounds, determinism, accumulator tick counts and capped catch-up, projection fitting on phone-sized viewports, a headless render smoke test, the new text limits, and the loader structure checks. The simulation/DOM boundary test still passes.

No attacks, blocking, dodging, stamina or health use, opponents, AI, sound, animation, image assets, WebGL, libraries, or database work is included.
