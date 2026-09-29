# Development Log

## 2026-09-29 — Phase 1a

Inspected the docs-only repository and confirmed there was no package manifest, runtime, source code, or application stack. Added a Vite + TypeScript vanilla app with Vitest. Implemented the first vertical slice: deterministic seeded fighter generation, validation, a versioned localStorage adapter, a mobile-first creation flow, and a profile screen that intentionally hides internal stats and traits. Added tests for determinism, validation, persistence, corrupt saves, and the simulation/DOM boundary.

## 2026-09-29 — Phase 1b-i

Implemented the real-time movement prototype: browser-independent arena state and fixed-timestep stepping, normalized movement, bounds clamping, a capped accumulator helper, canvas 2.5D placeholder rendering, responsive virtual joystick, keyboard controls, and profile-to-arena screen flow. Tightened input limits and made save loading structurally defensive while preserving the save schema. Combat, opponents, AI, and effects remain planned.

## 2026-09-29 — Phase 1b-i.1

Tuned the virtual joystick after landscape phone testing. The old inline mapping multiplied an already-normalized offset by its own length, so the response was quadratic: full speed effectively demanded dragging well past the visible circle, and the knob lagged the thumb the same way. Moved the mapping into one pure module (`src/sim/input.ts`) with a single `JOYSTICK_TUNING` constants block: full speed at 95% of the measured base-circle radius, a 9% dead zone, and a 32px inset beyond the safe-area margin. Magnitude is now linear from the dead zone to the full-speed radius, the knob is clamped to the circle edge, and beyond-edge dragging holds full speed in that direction. Keyboard controls, movement speed, and the fixed-timestep loop are unchanged.
