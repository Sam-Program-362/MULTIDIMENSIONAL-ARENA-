# Decision 008: Exposure anti-spam mechanic

Status: accepted (Phase 1c.3)

## Problem

Playtesting and a scripted benchmark showed a stationary attacker who simply mashed Attack in range was very hard to beat: it kept first-move advantage, never had to defend, and the Rookie could not punish a target that never over-committed. Blocking, dodging, and endurance already discourage *reckless* offense, but nothing made *repeated* offense from a fixed spot costly.

## Rule

Every combatant carries an **Exposure** meter (`0..maxExposure`, default `maxExposure = 100`). Exposure is a public, DOM-free part of combat state that measures how much a fighter has committed to offense without it landing cleanly.

Exposure is applied to the **attacker** when an attack resolves, by outcome:

- **Whiff** (missed swing, including a swing the target dodge-evaded): `+whiffExposure` (45).
- **Blocked**: `+blockedExposure` (45).
- **Clean hit**: `+hitExposure` (10).

Between resolutions exposure decays at `decayPerTick` (0.45) per tick. Because a clean, connecting hit adds less than the decay over one attack interval, an attacker who keeps landing hits never builds toward Exposed; an attacker who keeps whiffing or getting blocked does.

When exposure reaches `maxExposure` the fighter becomes **Exposed** for `exposedTicks` (75 ticks):

- Block **cannot start** and any **held block is force-dropped** — the guard is down.
- Incoming health damage is multiplied by `exposedDamageMultiplier` (**1.75×**).
- The fighter can still move, attack, and dodge.

When the Exposed window ends, `exposed` returns to false and exposure is reset to `maxExposure * exposedResetRatio` (**0.25**, i.e. 25) so the fighter is not immediately re-Exposed but is not fully recovered either.

New plain-data events: `EXPOSED_STARTED` and `EXPOSED_ENDED`. `DAMAGE_APPLIED` and `ATTACK_HIT` record the exposure damage multiplier that was in effect.

### Final tuning

`COMBAT_TUNING.exposure = { maxExposure: 100, whiffExposure: 45, blockedExposure: 45, hitExposure: 10, decayPerTick: 0.45, exposedTicks: 75, exposedDamageMultiplier: 1.75, exposedResetRatio: 0.25 }`.

## Rookie behavior

The Rookie's delayed public snapshot is extended with `exposed` and `exposure`. Two hooks reuse existing behavior — no new movement, spacing, plans, or reaction-time changes:

- **Punish**: an observed Exposed target is treated as punishable, exactly like an observed stagger or recovery window, and is attacked with `punishChance` (0.9), still through the 12-tick reaction delay.
- **Restraint**: when the AI's *own* exposure is at or above `restraintExposureRatio` (0.6) of its maximum, it stops *starting ordinary attacks*. It may still punish an exposed/staggered target, guard, retreat, and dodge, so restraint never freezes it.

## Boundaries and future work

Exposure changed no save data or schema; combat state remains session-only. This phase reverted the Rookie to the Phase 1c.1 approach/hold/punish/dash controller (the Phase 1c.2 edge-distance engagement cycle with plans was removed) while keeping the Phase 1c.2 combat rules — block auto-facing, empty-guard recovery, and the 28-tick attack interval. Spacing/engagement AI, adaptive AI, feints, and parry/perfect block remain **planned only**. All exposure logic, events, and AI hooks are tested without a browser.

## Known limit

A perfectly clean-connecting stationary spammer never self-exposes (by design — landing hits should not be punished), so it remains stronger than a target that mixes offense and defense. Under the benchmark the stationary spammer's win rate dropped from 82.5% to 60% but did not fall to ≤50% without breaking the "AI beats a pure blocker ≥90%" fairness goal; the tuning was chosen to protect that fairness goal. This is a limit of the fixed Rookie behavior, which this phase did not change.
