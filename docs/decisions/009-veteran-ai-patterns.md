# Decision 009: Opt-in Veteran AI patterns

Status: accepted (Phase 1c.5)

## Context

The Rookie is intentionally readable and error-prone. It remains the default opponent and its
profile and controller behavior are unchanged. A separate tier is needed for an arena in which a
fighter cannot leave and defeat means death, without granting the AI private inputs or special
combat rules.

## Fairness boundary

Veteran emits only ordinary `CombatInput`. Combat applies the same stamina, endurance, cooldown,
Exposure, block, dodge, damage, and arena-bound rules used for the player and Rookie. The Veteran
may read its own live combat state, but target decisions use only a public snapshot delayed by
`reactionTicks`. The snapshot contains position/facing, action and action tick, stamina band,
health ratio, cooldown, guard-break state, Exposure, Exposed, and defeat. Current-tick target
input is never passed to the controller.

A rolling window of at most 300 delayed observations records attack and dodge starts, block-held
ticks, and approach/retreat movement. It is plain `AiState`, uses the seeded RNG, and is discarded
when a fight restarts. Nothing is learned or persisted across fights.

## Patterns

Only one named pattern is active at once; the debug HUD displays it.

- **Pressure** recognizes sustained blocking, attacks at shared cooldown cadence, and commits to
  punish chains against delayed observations of stagger, guard break, recovery, or Exposed. Before
  an ordinary blocked swing it predicts `self.exposure + blockedExposure`; if that reaches the cap,
  it guards or steps out instead. Kill instinct overrides this restraint.
- **Rhythm break** inserts a seeded 6–18 tick beat before an intended swing. Timing varies by seed
  but remains replayable.
- **Counter-guard** becomes likely against a high observed attack-start rate. It anticipates with a
  short guard, releases between hits so endurance can recover, and counters delayed recovery,
  cooldown, guard-break, or Exposed observations.
- **Desperation** begins at or below 30% own health: no retreat, half the normal mistake chance,
  greater attack commitment, and more defensive dodges.
- **Kill instinct** begins when delayed target health is at or below 30%: restraint is ignored and
  the Veteran presses for the finish.

The Veteran never chooses an open-ended withdrawal. Ordinary away movement is capped at 30
consecutive ticks; a single dodge is exempt. At a wall it is steered within shared bounds and must
fight, guard, circle, or dodge. This is the arena-story rationale: there is no exit and backing out
cannot save either fighter.

## Profiles and consequences

`VETERAN_PROFILE` is opt-in beside `ROOKIE_PROFILE`. Dummy / Rookie / Veteran mode changes restart
the session-only fight. Profile weights and the bounded Veteran reaction/aggression/mistake/punish
values are tuning data. Seed plus inputs reproduces decisions and patterns.

No save data changed. Adaptive learning across fights, personalities, feints, parry/perfect block,
heavy attacks, and weapons remain planned only.
