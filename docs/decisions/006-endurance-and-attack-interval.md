# 006 — Endurance, attack interval, and AI anticipation

Status: accepted (Phase 1c.1)

## Context

Landscape phone playtesting of Phase 1c surfaced three problems:

1. Blocking only reduced damage by 65% and drained stamina, so a blocked hit still cost health
   and the same bar that paid for dodges. Blocking did not feel like blocking.
2. Attacks could be repeated as fast as the 24-tick attack cycle allowed, which made mashing the
   dominant strategy and left no room for per-weapon pacing.
3. The Rookie AI almost never blocked — its 12-tick reaction delay is longer than the 9-tick
   startup+active window of an attack — and it walked after a dashing player instead of dashing.

## Decision

### Endurance vs Stamina

| Resource | Spent by | Regenerates | Failure state |
| --- | --- | --- | --- |
| **Stamina** | attacks (5), dodges (10) | 0.30/tick, continuous; paused only while block is held/active and during a dodge | actions simply cannot start |
| **Endurance** | blocked hits only (`damage * enduranceDrainPerDamage`) | 0.25/tick, but only after `enduranceRegenDelayTicks` (45) with no blocked hit; runs whether or not block is held | **guard break** |

`maxEndurance` is derived in `deriveCombatVitals` from the hidden stamina stat (primary, 0.2) and
hidden willpower (secondary, 0.05, deliberately small) around a base of 100, clamped to 90..110 —
the same shape and bounded output as health and stamina.

### Blocking

- A frontal blocked hit (inside `block.facingArcDegrees`) deals `damage * blockChipFraction`
  health damage — **0 by default** — and drains `damage * enduranceDrainPerDamage` endurance.
- Blocking no longer costs stamina per hit. Stamina regen is still paused while Block is held,
  blocking still slows movement, and a hit from behind is still not blocked (and drains nothing).
- `ATTACK_BLOCKED` carries the chip `amount`, the remaining endurance, and `enduranceDrained`.

### Guard break

If a blocked hit would take endurance to 0 or below:

- that hit deals **full** health damage;
- the defender is staggered for `guardBreakStaggerTicks` (30): it cannot act, its input buffer is
  cleared, and every hit during the stagger deals full damage;
- blocking ends immediately and `endurance` is 0 for the whole stagger;
- when the stagger ends, endurance is restored to `guardBreakResetRatio` (0.5) of max;
- events: `ENDURANCE_DEPLETED`, `GUARD_BROKEN`, and `BLOCK_BROKEN` (kept as a compatible alias).

The old stamina-based block break is gone; `stamina.regenDelayTicks` survives as the one tunable
carried-over stamina pause and is now applied after a *guard* break (default 0).

### Attack interval

Attack numbers moved into an `AttackProfile` object (`COMBAT_TUNING.attackProfiles.basic`, also
exposed as `COMBAT_TUNING.attack`). Every combatant carries `attackProfileId` (default `basic`)
and combat code reads timing, range, arc, damage, cost, and movement multipliers through
`attackProfileOf(actor)`, so a future weapon can supply its own profile. **No weapon system is
built here.**

`minIntervalTicks` (34) is measured from the START of one attack to the earliest start of the
next. The natural cycle is 6+3+15 = 24 ticks, so 10 ticks of pure cooldown follow recovery.
`attackCooldownRemaining` / `attackCooldownFraction` are on the combatant state for the UI.
Input buffering is unchanged: a press that cannot be satisfied inside the existing 6-tick buffer
window is dropped. Blocking, dodging, and movement are never gated by the attack cooldown.

### AI (same `CombatInput`, same rules, same delayed observation)

- **Guard stance (anticipation, not reaction).** When the delayed observation puts the player
  inside `attack.range + defenseRangeMargin` and the AI is idle, each decision may start a block
  hold with probability `guardChance * caution * 2`, for `guardHoldTicksMin..guardHoldTicksMax`
  ticks, then `guardGapTicks` before it may re-enter. The hold is released early after
  `guardReleaseObservations` consecutive far observations. It never starts below
  `minEnduranceRatioToGuard` endurance.
- **Punish.** If the delayed snapshot shows the player staggered, in attack recovery, or in dodge
  recovery and inside attack range, the AI attacks with `punishChance` (0.85) — far above its
  normal `aggression`. It is bound by the reaction delay, never by current-tick knowledge.
- **Gap-close dash.** If the delayed distance exceeds `dashCloseDistance`, stamina ratio is at
  least `dashMinStaminaRatio` *and* stays there after paying the dodge cost, and the AI is not
  retreating, it presses Dodge toward the player with `dashCloseChance`. Evasive dodges against
  observed attack startup are unchanged.
- Determinism, the seeded RNG in `aiState`, the decision interval, the reaction buffer, and the
  existing mistakes are all preserved; the number of RNG draws per decision remains fixed.

## Consequences

- Holding block is now a real, exhaustible defense instead of a slow health loss.
- Mashing is capped at one attack per 34 ticks and the Attack button shows the cooldown fill.
- Fights last longer against a guarding AI and reward punishing its recovery windows.
- No save-format change: combat state is still session-only and the schema stays at version 1.

## Planned only — not built here

Heavy attacks, a weapon/equipment system, parry or perfect block, hit-stop, and adaptive or
learning AI (including new personalities) remain planned.
