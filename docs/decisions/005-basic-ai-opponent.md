# Decision 005 — Basic AI opponent

**Status:** Accepted  
**Date:** 2026-09-30

## Context

Combat basics were proven against a passive target, but defense, stamina pressure, pacing, and defeat needed an opponent that fights back. The first opponent must remain reproducible and testable without a browser, and it must not create a privileged path around combat rules.

## Decision

The Rookie controller lives in `src/sim/ai.ts` and is a pure decision function:

```text
decide(aiState, observation, tick) -> { input, nextAiState }
```

Its output is the existing `CombatInput`: movement, attack press, held block, and dodge press. `stepCombatWithAi` passes that input and the player's input to the same `stepCombatantPair` used by combat tests. The AI never writes combatant health, stamina, position, action state, or damage, and receives no free resources.

The target observation is copied into a short history buffer in `AiState`. Decisions use the snapshot from `reactionTicks` ago, not current-tick player input or current target state. The AI may read its own state live. The delayed snapshot contains only position, facing, action/phase/action tick, defeat, and a coarse low/ok stamina band.

The Rookie makes a decision every `decisionIntervalTicks`, carrying ordinary movement or held block between decisions. It approaches, circles near preferred range, probabilistically attacks, probabilistically blocks or dodges an observed startup, and briefly retreats at low stamina. Seeded mistake rolls can request a slightly out-of-range attack, extend a block, or buffer an attack during late recovery. Combat remains authoritative if a request is illegal or unaffordable.

Randomness uses the project's shared seeded PRNG transition. The serializable RNG state is stored in `AiState`; there is no hidden closure or ambient randomness. Identical seed and player input produce identical AI inputs, combat states, winners, and event logs.

The established `createCombatState` and `stepCombat` continue to provide stationary neutral-input dummy mode. Active-opponent mode uses the same second-combatant structure and neutral hidden-stat-derived vitals, with movement enabled. A same-tick double knockout from two already-active attacks is reported as a draw.

## Consequences

- The controller and full fights can be tested in Node/Vitest with no DOM.
- Reaction delay and interval decisions intentionally prevent frame-perfect defense.
- Tuning is centralized in `ROOKIE_PROFILE`; no adaptive model or player-habit tracking exists.
- Combat and AI state remain session-only; the fighter save schema stays at version 1.
- Adaptive AI, personality/trait systems, multiple opponents, and fight rewards are planned only.
