# Development Log

## 2026-09-29 — Phase 1a

Inspected the docs-only repository and confirmed there was no package manifest, runtime, source code, or application stack. Added a Vite + TypeScript vanilla app with Vitest. Implemented the first vertical slice: deterministic seeded fighter generation, validation, a versioned localStorage adapter, a mobile-first creation flow, and a profile screen that intentionally hides internal stats and traits. Added tests for determinism, validation, persistence, corrupt saves, and the simulation/DOM boundary.

## 2026-09-29 — Phase 1b-i

Implemented the real-time movement prototype: browser-independent arena state and fixed-timestep stepping, normalized movement, bounds clamping, a capped accumulator helper, canvas 2.5D placeholder rendering, responsive virtual joystick, keyboard controls, and profile-to-arena screen flow. Tightened input limits and made save loading structurally defensive while preserving the save schema. Combat, opponents, AI, and effects remain planned.

## 2026-09-29 — Phase 1b-i.1

Tuned the virtual joystick after landscape phone testing. The old inline mapping multiplied an already-normalized offset by its own length, so the response was quadratic: full speed effectively demanded dragging well past the visible circle, and the knob lagged the thumb the same way. Moved the mapping into one pure module (`src/sim/input.ts`) with a single `JOYSTICK_TUNING` constants block: full speed at 95% of the measured base-circle radius, a 9% dead zone, and a 32px inset beyond the safe-area margin. Magnitude is now linear from the dead zone to the full-speed radius, the knob is clamped to the circle edge, and beyond-edge dragging holds full speed in that direction. Keyboard controls, movement speed, and the fixed-timestep loop are unchanged.

## 2026-09-29 — Phase 1b-ii

Implemented deterministic combat basics in the DOM-free simulation. Player and training dummy now share one combatant state shape; tick-based attack, hold-block, dodge, stagger, stamina regeneration, bounded hidden-stat-derived vitals, auto-facing, input buffering, defeat, and plain-data per-tick events are controlled by one `COMBAT_TUNING` block. The dummy remains stationary and receives neutral input in the playable fight. Combat state is not persisted and the save schema remains version 1.

Added independent multi-touch Attack, Block, and Dodge controls without changing joystick mapping or placement, plus J/K/L desktop controls. The canvas now depth-sorts both combatants and presents facing, hit, block, dodge, and defeated feedback. A removable debug HUD shows both health/stamina pools, and dummy defeat offers an in-arena reset while Leave returns to the unchanged saved profile. Visibility changes clear held input and timing backlog so a backgrounded tab resumes cleanly.

Added a DOM-free combat suite covering action timing, range/arc misses, recovery lock and buffering, stamina cost/regeneration/gating, block direction/drain/break, dodge i-frames and walls, defeat lockout, facing, determinism, and derived-vital bounds. Existing movement, joystick, fighter, storage, and simulation-boundary coverage remains in place.
