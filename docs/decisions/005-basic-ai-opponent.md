# 005 — Basic AI Opponent Uses the Same Input and Rules as the Player

- **Status:** Accepted and implemented
- **Date:** 2026-09-30

## Decision

Phase 1c adds the first AI opponent — the "Rookie sparring opponent" — as a DOM-free part of the simulation in `src/sim/ai.ts`. It controls the second combatant (the fighter that used to be the passive training dummy) and gives the combat engine something that fights back.

### Same input, same rules

The AI is a pure function:

```
decide(aiState, observation, tick) -> { input, nextAiState }
```

Its output is exactly the existing `CombatInput` a human produces: a movement vector plus edge-triggered attack, level-triggered block, and edge-triggered dodge. There is **no AI-only combat path**. The opponent's input is fed through the same `stepCombatantPair` as the player, so it is bound by the same stamina costs, action locks, ranges, arcs, and defeat rules. An AI with too little stamina cannot start an attack, dodge, or block, because the engine — not the AI — enforces that. The AI never mutates combat state directly and never receives free stamina or damage.

The opponent keeps the `dummy` combatant id and the identical `CombatantState` shape. It starts at the dummy's position with health and stamina from `deriveCombatVitals` using neutral hidden stats (all 50). The only structural change is that, in opponent mode, the combatant is no longer `stationary`. Both fighters can be defeated; the fight ends on the first defeat and `fightOutcome` reports the winner.

### Perception with a human-like delay

The AI never reads the player's current-tick input. It sees the player's **state** (position, facing, action type/phase, action tick, and a coarse low/ok stamina flag) from `reactionTicks` ago (default 12), using a small history buffer stored inside `aiState`. Its own state is read live. Because perception is delayed, the AI can never respond to a fresh attack sooner than `reactionTicks` after that attack actually started. Attack startup (6 ticks) is faster than the reaction delay, so a purely reactive parry cannot catch the swing that triggered it — instead the AI, once it *perceives* an aggressor, stays briefly wary and may hold a guard that persists across the follow-up swing. This keeps the reaction floor honest while still letting the AI block and dodge a meaningful share of a pressuring player's attacks.

### Deterministic, seeded decisions

Behaviour is a small deterministic decision routine, not a neural net or a learner:

- **Approach** when farther than the preferred range; **circle** with gentle sidestepping at range.
- **Attack** when the target is in range and the AI is idle, gated by an `aggression` probability, and only on a **decision interval** (every `decisionIntervalTicks`, not every tick) so play is never frame-perfect.
- **Defend** (block or dodge) against a perceived attack with a `caution` probability, limited by the reaction delay.
- **Retreat** and stop attacking/dodging when its own stamina is low.
- **Mistakes** at small probabilities: swinging from just outside range, holding a guard too long, and overcommitting into recovery pressure.

Randomness uses the project's existing PRNG. The generator **state lives inside `aiState` as a plain number** (via the new pure `nextRandom` helper), so `decide` stays pure and a whole fight is reproducible: the same seed plus the same player inputs produce identical states and events. All tunable numbers live in one `AI_TUNING` block plus the `AiProfile`; the shipped preset is `ROOKIE_PROFILE`. There is exactly one preset.

### Stepper

`stepCombatWithAi(state, playerInput, aiState)` builds the observation from the pre-step state, calls `decide`, and runs both fighters through `stepCombatantPair`. The passive dummy mode is untouched: `stepCombat` still supplies neutral dummy input, and the dummy remains stationary and inert exactly as before.

## Consequences

- The combat engine can now be exercised against a moving, attacking, sometimes-defending opponent without any browser code.
- Determinism is preserved end to end, so AI fights are testable and replayable from a seed.
- The AI is beatable by a player who spaces, blocks, dodges, and manages stamina, and it is not frame-perfect.
- Adaptive AI, personalities/traits, multiple opponents, and rewards are **explicitly out of scope** here and remain planned.
- No data is persisted: fights are session-only and the fighter save schema stays at version 1.
