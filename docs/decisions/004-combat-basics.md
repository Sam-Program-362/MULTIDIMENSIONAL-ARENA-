# 004 — Combat Basics Use Generic Tick-Based State Machines

- **Status:** Accepted and implemented
- **Date:** 2026-09-29

## Decision

The combat prototype is part of the DOM-free fixed-timestep simulation. Both the controlled fighter and the training dummy use the same `CombatantState` structure: position, velocity, facing, current/max health and stamina, current action and action tick, invulnerability and defeat flags, plus generic action/buffer bookkeeping. The playable wrapper supplies input only to the fighter and always supplies neutral input to the stationary dummy.

Attack, block, and dodge are explicit state machines measured in 60 Hz simulation ticks:

- Attack advances through startup, a short active hit window, and recovery. Facing is captured by entering the action, one hit can resolve, and recovery prevents immediate restart.
- Block advances through startup and an active held phase, then recovery after release. Only frontal hits are reduced. A blocked hit spends stamina; insufficient stamina takes full damage and enters a short stagger.
- Dodge advances through startup, dash-active, and recovery. Its initial active ticks are invulnerable. Direction comes from current movement input or defaults away from the opponent.

Action presses use a short tick buffer. If a valid press arrives near the end of recovery, it starts on the first available tick. A press that cannot be paid for is not thrown away: it keeps decaying in the buffer and fires on the first buffered tick where enough stamina exists. A same-tick input tie is deterministic: dodge has priority over attack, then held block. All timings, costs, ranges, arcs, damage, movement modifiers, stamina behavior, dash behavior, and derived-vital bounds are centralized in `COMBAT_TUNING`.

## Stamina philosophy

Phone playtesting showed the first pass was an endurance meter: an attack cost 20 and a dodge 28 of roughly 95, regeneration waited 45 ticks, and every action restarted that wait, so continuous attacking never regenerated at all. The revised rule is that **basic attacks are sustainable and stamina is a defensive resource**.

- **Basic attacks never run the bar dry.** One attack costs 5 and one full attack cycle (startup + active + recovery, 24 ticks) regenerates 7.2. Chaining basic attacks is a net gain, so the bar can never gate the fighter's core offense. This is a design invariant and is covered by a test: `attackCycleTicks * regenPerTick >= attack.staminaCost`.
- **Stamina pays for defense and evasion.** Blocking costs 12 per absorbed hit and freezes regeneration while held; dodging costs 10 and freezes regeneration for the whole dodge. Dodges are therefore chainable but finite — nine consecutive dodges from a full 95 bar, about three seconds of dodging, and then the chain breaks.
- **Future heavy attacks and powers are the other spenders.** Room in the budget is deliberately reserved for them rather than consumed by the basic swing.

Regeneration is continuous at 0.30 per tick (a full 0-to-max refill in 317 ticks, about 5.3 seconds). It pauses only while block is held or active and for every phase of a dodge, and it resumes on the first tick after those end, with no delay. Attacking, staggering, moving, and idling all regenerate.

`stamina.regenDelayTicks` is the single tunable regen pause that outlives an action, and it is applied **only** after a block break. Its default is 0, so a broken guard starts recovering immediately; raising it lengthens the punish gap after a break without any code change.

## Movement during actions

Movement is instant in both directions: the simulation applies `movementSpeed * inputMagnitude * actionMultiplier` to position every tick and derives velocity from the resulting position delta. There is no acceleration curve, velocity smoothing, or post-action ramp-up anywhere in the simulation or the input layer, so a fighter reaches full configured speed on the first tick and stops on the first tick after release. Attack multipliers were raised from 0.35/0.2/0.55 to 0.75 startup, 0.6 active, and 0.85 recovery so that attacking repositions the fighter instead of anchoring it. Block (0.45) and the deliberate dodge-recovery hold (0) are unchanged, because their slowness is the cost being paid.

## Auto-facing

An idle combatant faces its opponent each tick. Entering any action locks facing until that action returns to idle. This keeps phone movement focused on spacing while making attack and defense direction meaningful and reproducible.

## Events

Each combat step returns the next immutable-by-convention state and plain-data events for that tick. Events cover action starts, hits, blocks, misses, dodges, damage, block breaks, stamina depletion, and defeat. Rendering reacts to these records but does not resolve combat, mutate saved fighter data, or read hidden stats.

## Consequences

- Identical initial state and input sequences produce identical state and event logs; combat currently uses no randomness.
- Unit tests can exercise both sides of each mechanic without browser APIs.
- The canvas and controls can be replaced without changing combat rules.
- Combat health/stamina are session state. Entering or resetting the arena creates a fresh fight, and the fighter save schema remains unchanged.
- Stamina pressure now comes from defending and evading rather than from swinging, so pacing can be tuned by changing costs and `regenPerTick` alone.
- Heavy attacks and powers must be priced against a bar that basic attacks no longer drain.
