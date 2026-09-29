# 004 — Combat Basics Use Generic Tick-Based State Machines

- **Status:** Accepted and implemented
- **Date:** 2026-09-29

## Decision

The combat prototype is part of the DOM-free fixed-timestep simulation. Both the controlled fighter and the training dummy use the same `CombatantState` structure: position, velocity, facing, current/max health and stamina, current action and action tick, invulnerability and defeat flags, plus generic action/buffer bookkeeping. The playable wrapper supplies input only to the fighter and always supplies neutral input to the stationary dummy.

Attack, block, and dodge are explicit state machines measured in 60 Hz simulation ticks:

- Attack advances through startup, a short active hit window, and recovery. Facing is captured by entering the action, one hit can resolve, and recovery prevents immediate restart.
- Block advances through startup and an active held phase, then recovery after release. Only frontal hits are reduced. A blocked hit spends stamina; insufficient stamina takes full damage and enters a short stagger.
- Dodge advances through startup, dash-active, and recovery. Its initial active ticks are invulnerable. Direction comes from current movement input or defaults away from the opponent.

Action presses use a short tick buffer. If a valid press arrives near the end of recovery, it starts on the first available tick. A same-tick input tie is deterministic: dodge has priority over attack, then held block. All timings, costs, ranges, arcs, damage, movement modifiers, stamina behavior, dash behavior, and derived-vital bounds are centralized in `COMBAT_TUNING`.

## Auto-facing

An idle combatant faces its opponent each tick. Entering any action locks facing until that action returns to idle. This keeps phone movement focused on spacing while making attack and defense direction meaningful and reproducible.

## Events

Each combat step returns the next immutable-by-convention state and plain-data events for that tick. Events cover action starts, hits, blocks, misses, dodges, damage, block breaks, stamina depletion, and defeat. Rendering reacts to these records but does not resolve combat, mutate saved fighter data, or read hidden stats.

## Consequences

- Identical initial state and input sequences produce identical state and event logs; combat currently uses no randomness.
- Unit tests can exercise both sides of each mechanic without browser APIs.
- The canvas and controls can be replaced without changing combat rules.
- Combat health/stamina are session state. Entering or resetting the arena creates a fresh fight, and the fighter save schema remains unchanged.
