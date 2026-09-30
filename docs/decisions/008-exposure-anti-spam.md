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

## Benchmark outcome

The seven-scenario benchmark (40 seeds, 90 s cap, 60 t/s; `scripts/benchmark.ts`, artifacts `docs/benchmark-baseline.txt` and `docs/benchmark-final.txt`) is evaluated against the **original wording** of each goal. In particular, scenario (e) asks that a scripted **skilled counter-puncher wins at least 55% of its fights against the AI** (the counter-puncher wins, not the AI).

| # | Scenario | Goal (original) | Final result | Met? |
|---|----------|-----------------|--------------|------|
| a | Stationary spammer | spammer ≤ 50% | spammer 60.0% | NO |
| b | Idle player | AI ≥ 95%, 0 draw/stale | AI 100% | YES |
| c | Holds Block forever | AI ≥ 90% | AI 97.5% | YES |
| d | Runaway dodger | reach ≤ 180 t, never 0 | 172.1 t | YES |
| e | Counter-puncher | **counter ≥ 55%** | see below | see below |
| f | Two spammers | each 35–65% | 37.5 / 57.5 | YES |
| g | AI vs AI | no stalemate | 40/40 | YES |

Two counter-puncher scripts were built; both are reported so the choice is transparent (the committed `scripts/benchmark.ts` prints the same fights from the AI's side — `AI% = 100 − counter%` here since there were no draws — only the reported direction differs):

- **(1) Competent turtle-and-punish** — stays in range, keeps a standing guard by default, dodges to protect endurance/bait whiffs, and punishes every observed opening (recovery / stagger / Exposed AI), cashing the 1.75× multiplier on an Exposed AI. **Counter wins 100.0%** (AI 0.0%, 0 draw) → goal **MET**.
- **(2) `guardBias 0.85`** — the same punishing/dodging but holds guard on only ~85% of no-read ticks, so the AI's guard-break and Exposure punishes get through. **Counter wins 25.0%** (AI 75.0%, 0 draw) → goal **NOT met**.

**Goals met under the original wording:** with counter-puncher script (1) for (e), **6/7** are met (b, c, d, e, f, g; only (a) fails). With the weaker script (2) for (e), **5/7** are met (a and e fail). The original counter-puncher goal is therefore achievable: a competent skilled counter-puncher beats the AI outright.

## Known limit

A perfectly clean-connecting stationary spammer never self-exposes (by design — landing hits should not be punished), so it remains stronger than a target that mixes offense and defense. Under the benchmark the stationary spammer's win rate dropped from 82.5% to 60% but did not fall to ≤50% without breaking the "AI beats a pure blocker ≥90%" fairness goal; the tuning was chosen to protect that fairness goal. Scenario (a) is the only goal that cannot be met. This is a limit of the fixed Rookie behavior, which this phase did not change.
