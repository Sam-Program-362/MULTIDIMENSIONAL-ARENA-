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

## 2026-09-29 — Phase 1b-ii.1

Retuned combat feel after landscape phone playtesting. Stamina had been an endurance meter: an attack cost 20 and a dodge 28 of roughly 95, regeneration waited 45 ticks, and every action restarted that wait, so continuous attacking never regenerated. Attacks also cut movement to 20-55%, which felt like being anchored mid-swing.

Stamina is now a defensive resource. Regeneration is continuous at 0.30 per tick and pauses only while block is held or active and for every phase of a dodge, resuming on the first tick after those end. Attacking no longer pauses regeneration at all. `stamina.regenDelayTicks` survives as the one tunable carried-over pause and is applied only after a block break; its default is 0. Attack cost dropped to 5 and dodge cost to 10, block stays at 12 per absorbed hit. The design invariant, covered by a test, is that one full attack cycle regenerates at least one attack's cost (7.2 versus 5), so basic attacks are chainable forever while nine consecutive dodges from full stamina still break the chain. A full refill from empty takes 317 ticks, about 5.3 seconds. Attack movement multipliers rose to 0.75 startup, 0.6 active, and 0.85 recovery.

Audited the simulation and input layers for hidden acceleration: there is none. Position is integrated directly from input each tick and velocity is derived from the position delta, so speed is instant on press and on release, with no ramp-up after an action. A buffered press that cannot be paid for is no longer discarded; it decays in the existing buffer and fires on the first affordable tick inside its window.

Test coverage grew to cover twenty seconds of chained attacks without draining, regeneration continuing through every attack phase, the block and dodge pauses with resumption on the following tick, the block-break-only regen delay at both zero and a non-zero value, the maximum consecutive dodge count, per-phase attack movement speeds, instant acceleration, actions at exactly their cost, buffered presses at zero stamina, and block held at low stamina. Movement, joystick, save/load, profile, and the save schema are unchanged.

## 2026-09-30 — Phase 1c

Implemented the first active opponent as a deterministic, DOM-free Rookie controller. It emits the existing `CombatInput` and therefore receives no AI-only movement, stamina, action, or damage path. A target-state history in plain `AiState` enforces a 12-tick reaction delay, while an 8-tick decision interval prevents frame-perfect updates. The controller approaches, circles, attacks, responds to delayed attack startup with probabilistic blocks/dodges, retreats at low stamina, and makes seeded out-of-range attack, overblock, and recovery-overcommit mistakes. Shared PRNG state is serializable inside the AI state, so a seed and player-input sequence replay the complete fight.

Added a mobile opponent factory with neutral 50-point hidden stats, an AI combat stepper that still uses the symmetric pair-combat rules, explicit winner reporting, and a defined draw for two already-active lethal attacks on one tick. Legacy dummy creation and neutral-input stepping remain unchanged. The arena now defaults to Opponent mode, offers a session-resetting Dummy/Opponent toggle, colors the opponent separately, reports defeat for either side, and resets safely during any action. Visibility handling still clears input and timing backlog without advancing simulation while hidden.

Added Node/Vitest coverage for valid shared inputs, stamina gating, delayed reactions, approach/attack behavior, probabilistic defense bounds, mistake-rate bounds, corner behavior, full-fight determinism, AI-vs-AI completion, both defeat paths, double knockouts, and exact dummy-mode equivalence. Combat/AI state is not persisted and the fighter save schema remains version 1. Adaptive AI, personalities, multiple opponents, and rewards remain planned only.
