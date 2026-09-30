# Phase 1c.5 Implementation Report

Date: 2026-09-30  
Branch: `arena/01a0f14c-multidimensional-arena`

## Result

Implemented shared Exposure/endurance rule changes, the opt-in deterministic Veteran tier, the
Dummy / Rookie / Veteran UI, pattern debug text, benchmark coverage, tests, and documentation.
Part A was committed first as `6718779`; Parts B–D were committed as `15b6102`.

- Save schema: unchanged (version 1); combat and AI state remain session-only.
- Rookie profile/controller values: unchanged.
- Simulation remains DOM-free.
- No new actions, libraries, assets, joystick changes, or persistent learning.

## Final tuning

Exposure: `whiffExposure 30`, `blockedExposure 35`, `hitExposure 5`, `maxExposure 100`,
`decayDelayTicks 60`, `decayPerTick 0.25`, `exposedTicks 75`, `exposureDamageBonus 0.75`,
`exposedResetRatio 0.25`.

Complete final `VETERAN_PROFILE` values:

```text
tier veteran; reactionTicks 13; decisionIntervalTicks 8; aggression 0.70; caution 0.62;
mistakeChance 0.05; preferredRange 1.65; rangeTolerance 0.25; mistakeRangeMargin 0.55;
defenseRangeMargin 0.45; retreatStaminaRatio 0.22; retreatResumeStaminaRatio 0.48;
retreatTicks 0; approachStrength 0.9; retreatStrength 0.8; sidestepStrength 0.3;
spacingStrength 0.42; dodgeShare 0.34; normalBlockHoldTicks 16; mistakeBlockHoldTicks 24;
overcommitWindowTicks 6; wallBuffer 0.35; circleSwitchChance 0.08; guardChance 0.48;
guardHoldTicksMin 10; guardHoldTicksMax 22; guardGapTicks 8; guardReleaseObservations 2;
minEnduranceRatioToGuard 0.25; punishChance 0.90; restraintExposureRatio 0.70;
dashCloseDistance 4.5; dashCloseChance 0.60; dashMinStaminaRatio 0.35;
pressureWeight 0.72; rhythmBreakWeight 0.34; counterGuardWeight 0.78;
rhythmBreakChance 0.38; desperationHealthRatio 0.30.
```

## Benchmark comparison

The Phase 1c.4 baseline had no Veteran implementation; Veteran baseline cells and pattern counts
are therefore N/A rather than fabricated. Full tables and rationale are in
`docs/benchmark-baseline.txt` and `docs/benchmark-final.txt`.

| Tier / scenario | Baseline | Final |
|---|---:|---:|
| Rookie idle AI win | 100% | 100% |
| Rookie Block-forever AI win | 0% | 100% |
| Rookie Block-forever guard break | not recorded | 100%, avg 14.92s |
| Rookie novice wins / AI whiffs | 57.5% / 35.3% | 50.0% / 39.2% |
| Rookie vs Rookie finishes | 40/40 | 40/40 |
| Veteran idle AI win / prompt attack | N/A | 100% / 100% |
| Veteran Block-forever AI win / break | N/A | 100% / 100%, avg 12.63s |
| Veteran novice wins | N/A | 20.0% |
| Veteran vs Rookie | N/A | Veteran 67.5%, 40/40 finish |
| Pressure vs blocker | N/A | 40/40 (100%) |
| Counter-Guard vs spammer | N/A | 40/40 (100%) |
| Desperation when <=30% health | N/A | 40/40 (100%) |
| Longest ordinary retreat | N/A | 16 ticks |

Report-only final results: Rookie stationary spammer wins 82.5%; runaway reach 180.9 ticks;
counter-puncher wins 35.0%. Veteran AI wins 5.0% against stationary spammer, 100% against runaway,
and 55.0% against counter-puncher. The low Veteran stationary-spammer result is reported honestly;
Counter-Guard does activate in every seed, but shared startup/trade rules still favor uninterrupted
in-range attack input.

## Test reconciliation and new tests

The requested merged baseline was 135 tests. Final is 148: **+13**, with no removals.

Part A (+4 net):

1. `does not regenerate endurance or consume its delay while Block is held`
2. `regenerates only after Block ends and the full blocked-hit delay elapses`
3. `cannot exploit a short Block release to run down the regen delay`
4. `one whiff adds 30, three minimum-interval whiffs add 90, and the fourth Exposes`
5. `three consecutive blocked attacks at 35 each make the attacker Exposed`

The first three replace one old “regenerates held or not” test, hence +4 net rather than +5.

Veteran (+9):

1. `never enters kill instinct before reactionTicks reveal the target health`
2. `is deterministic for the same seed and shared inputs`
3. `uses PRESSURE against held Block and pauses before a blocked swing would Expose it`
4. `COUNTER-GUARD reads a stationary spammer and attacks an observed recovery`
5. `DESPERATION removes retreating and raises attack selection`
6. `KILL INSTINCT ignores exposure restraint and presses the low-health target`
7. `never records more than 30 consecutive retreat ticks`
8. `RHYTHM BREAK varies first-attack timing across seeds`
9. `finishes Veteran versus Rookie for twenty seeds`

## Baseline benchmark output

```text
Accuracy vs novice: AI outcomes hit 64.7% / blocked 0.0% / whiff 35.3%

=== PHASE-1c.5-BASELINE — 40 seeds, 5400 tick cap (90s @ 60/s) ===
------------------------------------------------------------------------------------------------
#  Scenario              Result                                      Goal                Pass
------------------------------------------------------------------------------------------------
a  Stationary spammer    spammer wins 75.0% (AI 20.0%)               spammer <= 50%      FAIL
b  Idle player           AI wins 100.0%, draws 0, stalemates 0       AI >= 95%, 0 draw/stalePASS
c  Holds Block forever   AI wins 0.0%                                AI >= 90%           FAIL
d  Runs away + Dodge     avg reach 180.9 ticks (3.01s), never 0      <= 180 ticks (3s)   FAIL
e  Counter-puncher       AI wins 52.5% (counter 47.5%)               counter >= 55%      FAIL
h  Novice human proxy    novice 57.5% / AI 42.5% / draws 0; AI outcomes hit 64.7% / blocked 0.0% / whiff 35.3%novice 40–60%, AI whiff >= 30%PASS
i  AI accuracy vs spammerhit 100.0% / blocked 0.0% / whiff 0.0%      report only         PASS
f  Two spammers          player 37.5% / dummy 57.5% / draw 2         each 35–65%         PASS
g  AI vs AI              finished 40/40, avg 617 ticks               no stalemate        PASS
------------------------------------------------------------------------------------------------
5/9 goals met
```

Veteran baseline: N/A (tier did not exist).

## Final benchmark output

```text
Accuracy vs novice: AI outcomes hit 60.8% / blocked 0.0% / whiff 39.2%

=== PHASE-1c.5-FINAL ROOKIE — 40 seeds, 5400 tick cap (90s @ 60/s) ===
----------------------------------------------------------------------------------------------------------------
#  Scenario              Result                                      Goal                Pass
----------------------------------------------------------------------------------------------------------------
a  Stationary spammer    spammer wins 82.5% (AI 12.5%)               report only         PASS
b  Idle player           AI wins 100.0%, draws 0, stalemates 0       AI >= 95%, 0 draw/stalePASS
c  Holds Block forever   AI 100.0%, breaks 100.0%, avg 14.92s        AI >= 90%           PASS
d  Runs away + Dodge     avg reach 180.9 ticks (3.01s), never 0      report only         PASS
e  Counter-puncher       AI wins 65.0% (counter 35.0%)               report only         PASS
h  Novice human proxy    novice 50.0% / AI 50.0% / draws 0; AI outcomes hit 60.8% / blocked 0.0% / whiff 39.2%novice 40–60%, AI whiff >= 30%PASS
i  AI accuracy vs spammerhit 100.0% / blocked 0.0% / whiff 0.0%      report only         PASS
f  Two spammers          player 37.5% / dummy 57.5% / draw 2         each 35–65%         PASS
g  AI vs AI              finished 40/40, avg 587 ticks               no stalemate        PASS
----------------------------------------------------------------------------------------------------------------
9/9 goals met

=== PHASE-1c.5-FINAL VETERAN — 40 seeds, 5400 tick cap (90s @ 60/s) ===
----------------------------------------------------------------------------------------------------------------
#  Scenario              Result                                                  Goal                     Pass
----------------------------------------------------------------------------------------------------------------
b  Idle player           AI 100.0%, first attack <=3s 100.0%, stale 0            AI >=95%, prompt 100%    PASS
c  Holds Block forever   AI 100.0%, breaks 100.0%, avg 12.63s, pressure 100.0%   95% / 90% / <15s / 50%   PASS
a  Stationary spammer    AI wins 5.0%, counter-guard 100.0%, desperation 40/40   report; patterns >=50%   PASS
d  Runaway dodger        AI wins 100.0%                                          report only              PASS
e  Counter-puncher       AI wins 55.0%                                           report only              PASS
h  Novice human proxy    novice wins 20.0%                                       novice 20-40%            PASS
g  Veteran vs Rookie     Veteran 67.5%, finished 40/40, longest retreat 16t      >=65%, all finish, <=30t PASS
----------------------------------------------------------------------------------------------------------------
7/7 goals met
```

## Full verbose Vitest output

```text

> multidimensional-arena@0.1.0 test
> vitest run --reporter=verbose


 RUN  v2.1.9 /home/user/MULTIDIMENSIONAL-ARENA-

 ✓ tests/combat.test.ts > attack state machine > honors attack startup, active, and recovery timing in ticks
 ✓ tests/combat.test.ts > attack state machine > hits at the exact edge of range when the target is inside the facing arc
 ✓ tests/combat.test.ts > attack state machine > misses outside attack range
 ✓ tests/combat.test.ts > attack state machine > misses outside the locked facing arc
 ✓ tests/combat.test.ts > attack state machine > cannot start another attack during recovery
 ✓ tests/combat.test.ts > attack state machine > fires a buffered attack as soon as the attack interval allows
 ✓ tests/combat.test.ts > stamina > applies attack and dodge stamina costs
 ✓ tests/combat.test.ts > stamina > regenerates every tick with no delay after attacking
 ✓ tests/combat.test.ts > stamina > keeps regenerating through every phase of an attack
 ✓ tests/combat.test.ts > stamina > regenerates a full attack cycle worth of stamina for every attack spent
 ✓ tests/combat.test.ts > stamina > never runs out while chaining basic attacks for twenty seconds
 ✓ tests/combat.test.ts > stamina > refills from empty in the expected number of ticks
 ✓ tests/combat.test.ts > stamina > pauses regeneration while block is held and resumes on the first tick after release
 ✓ tests/combat.test.ts > stamina > pauses regeneration for the whole dodge and resumes on the first tick after
 ✓ tests/combat.test.ts > stamina > allows at least six consecutive dodges from full stamina before the chain breaks
 ✓ tests/combat.test.ts > stamina > does not start actions without enough stamina
 ✓ tests/combat.test.ts > stamina > starts actions at exactly the action cost
 ✓ tests/combat.test.ts > stamina > fires a buffered attack pressed at zero stamina once regeneration pays for it
 ✓ tests/combat.test.ts > stamina > gives up a buffered press that stays unaffordable for the whole buffer window
 ✓ tests/combat.test.ts > stamina > does not start a block below the minimum start stamina and keeps it drained while held
 ✓ tests/combat.test.ts > attack movement > moves at the configured multiplier in each attack phase
 ✓ tests/combat.test.ts > attack movement > reaches full configured speed on the first tick with no acceleration ramp
 ✓ tests/combat.test.ts > endurance and guard break > takes no health damage from a blocked frontal hit and drains endurance instead
 ✓ tests/combat.test.ts > endurance and guard break > honors a changed chip fraction and endurance drain factor
 ✓ tests/combat.test.ts > endurance and guard break > breaks the guard when endurance would reach zero and applies full damage
 ✓ tests/combat.test.ts > endurance and guard break > breaks the guard at exactly zero endurance
 ✓ tests/combat.test.ts > endurance and guard break > staggers for the configured duration, refuses input, and ends at zero endurance
 ✓ tests/combat.test.ts > endurance and guard break > applies full damage to extra hits landed during the stagger
 ✓ tests/combat.test.ts > endurance and guard break > does not regenerate endurance or consume its delay while Block is held
 ✓ tests/combat.test.ts > endurance and guard break > regenerates only after Block ends and the full blocked-hit delay elapses
 ✓ tests/combat.test.ts > endurance and guard break > cannot exploit a short Block release to run down the regen delay
 ✓ tests/combat.test.ts > endurance and guard break > restarts the regen delay on every consecutive blocked hit
 ✓ tests/combat.test.ts > endurance and guard break > caps endurance regeneration at the derived maximum
 ✓ tests/combat.test.ts > endurance and guard break > auto-faces during block so circling cannot hit behind the guard
 ✓ tests/combat.test.ts > endurance and guard break > keeps endurance at zero through the post-stagger delay and then regenerates gradually
 ✓ tests/combat.test.ts > endurance and guard break > resumes stamina regeneration immediately after a guard break with the default delay
 ✓ tests/combat.test.ts > endurance and guard break > applies the stamina regen delay only after a guard break
 ✓ tests/combat.test.ts > endurance and guard break > leaves the attacker regenerating normally through a guard break
 ✓ tests/combat.test.ts > endurance and guard break > breaks a held guard under sustained mashed attacks
 ✓ tests/combat.test.ts > attack interval > cannot start a second attack before minIntervalTicks after the first start
 ✓ tests/combat.test.ts > attack interval > fires an attack buffered during the cooldown on the first allowed tick
 ✓ tests/combat.test.ts > attack interval > limits mashed attacks to the interval over a long run
 ✓ tests/combat.test.ts > attack interval > reports a cooldown fraction that completes exactly when the attack is available
 ✓ tests/combat.test.ts > attack interval > allows block and dodge while the attack cooldown is running
 ✓ tests/combat.test.ts > dodge > uses i-frames to evade a hit during the invulnerable window
 ✓ tests/combat.test.ts > dodge > takes a hit after the i-frame window ends
 ✓ tests/combat.test.ts > dodge > stays inside arena bounds when dodging into a wall
 ✓ tests/combat.test.ts > fight lifecycle and facing > defeats a combatant at zero health and accepts no actions after the fight ends
 ✓ tests/combat.test.ts > fight lifecycle and facing > auto-faces the opponent while idle and locks facing during an action
 ✓ tests/combat.test.ts > determinism and derived vitals > produces identical state and event logs for identical input sequences
 ✓ tests/combat.test.ts > determinism and derived vitals > keeps derived maximum health and stamina bounded for extreme hidden stats
 ✓ tests/ai.test.ts > rookie AI contract and rules > returns only a valid shared CombatInput and cannot request attacks or dodges at zero stamina
 ✓ tests/ai.test.ts > rookie AI contract and rules > creates a mobile neutral-vitals opponent at the established dummy start
 ✓ tests/ai.test.ts > rookie AI contract and rules > stays finite and inside bounds when deciding and moving from a corner
 ✓ tests/ai.test.ts > rookie AI perception and behavior > does not react to an attack before the configured delayed snapshot is visible
 ✓ tests/ai.test.ts > rookie AI perception and behavior > moves toward a far player and attacks in range within a bounded number of ticks
 ✓ tests/ai.test.ts > rookie AI perception and behavior > blocks or dodges some but not all of fifty delayed player attacks
 ✓ tests/ai.test.ts > rookie AI perception and behavior > makes outside attacks, overblocks, and recovery overcommits at loose bounded rates
 ✓ tests/ai.test.ts > AI fight determinism and lifecycle > replays identical combat states, AI states, inputs, and events for one seed and input sequence
 ✓ tests/ai.test.ts > AI fight determinism and lifecycle > finishes AI versus AI without a stalemate for ten fixed seeds
 ✓ tests/ai.test.ts > AI fight determinism and lifecycle > reports either combatant as winner and rejects all later player and AI actions
 ✓ tests/ai.test.ts > AI fight determinism and lifecycle > defines a same-tick double defeat as a draw
 ✓ tests/ai.test.ts > AI fight determinism and lifecycle > keeps legacy dummy mode exactly equivalent to a neutral stationary second input
 ✓ tests/ai.test.ts > rookie AI guard stance, punishing, and dash usage > enters an anticipation guard in some but not all decisions across fifty seeds
 ✓ tests/ai.test.ts > rookie AI guard stance, punishing, and dash usage > holds the guard for a bounded number of ticks and then releases it
 ✓ tests/ai.test.ts > rookie AI guard stance, punishing, and dash usage > releases a guard early when the target is observed far away repeatedly
 ✓ tests/ai.test.ts > rookie AI guard stance, punishing, and dash usage > never chooses to guard at very low endurance
 ✓ tests/ai.test.ts > rookie AI guard stance, punishing, and dash usage > punishes an observed staggered target far more often than an idle one
 ✓ tests/ai.test.ts > rookie AI guard stance, punishing, and dash usage > only punishes through the delayed observation, never the current tick
 ✓ tests/ai.test.ts > rookie AI guard stance, punishing, and dash usage > gap-close dashes toward a far target and never below the stamina floor
 ✓ tests/ai.test.ts > rookie AI guard stance, punishing, and dash usage > does not gap-close dash while the target is close
 ✓ tests/ai.test.ts > rookie AI guard stance, punishing, and dash usage > obeys the shared attack interval over a long fight
 ✓ tests/ai.test.ts > rookie AI exposure hooks (Phase 1c.3) > extends the delayed target snapshot with exposed and exposure
 ✓ tests/ai.test.ts > rookie AI exposure hooks (Phase 1c.3) > punishes an observed Exposed target far more often than a normal one
 ✓ tests/ai.test.ts > rookie AI exposure hooks (Phase 1c.3) > does not start ordinary attacks when its own exposure is at/above restraintExposureRatio
 ✓ tests/ai.test.ts > rookie AI exposure hooks (Phase 1c.3) > still punishes an Exposed opponent while restrained (restraint spares punishing)
 ✓ tests/ai.test.ts > rookie AI exposure hooks (Phase 1c.3) > does not react to a target becoming Exposed earlier than the reaction delay
 ✓ tests/ai.test.ts > Veteran delayed patterns > never enters kill instinct before reactionTicks reveal the target health
 ✓ tests/ai.test.ts > Veteran delayed patterns > is deterministic for the same seed and shared inputs
 ✓ tests/ai.test.ts > Veteran delayed patterns > uses PRESSURE against held Block and pauses before a blocked swing would Expose it
 ✓ tests/ai.test.ts > Veteran delayed patterns > COUNTER-GUARD reads a stationary spammer and attacks an observed recovery
 ✓ tests/ai.test.ts > Veteran delayed patterns > DESPERATION removes retreating and raises attack selection
 ✓ tests/ai.test.ts > Veteran delayed patterns > KILL INSTINCT ignores exposure restraint and presses the low-health target
 ✓ tests/ai.test.ts > Veteran delayed patterns > never records more than 30 consecutive retreat ticks
 ✓ tests/ai.test.ts > Veteran delayed patterns > RHYTHM BREAK varies first-attack timing across seeds
 ✓ tests/ai.test.ts > Veteran delayed patterns > finishes Veteran versus Rookie for twenty seeds
 ✓ tests/exposure.test.ts > exposure buckets and decay > adds whiffExposure to the attacker when an attack ends without connecting
 ✓ tests/exposure.test.ts > exposure buckets and decay > adds blockedExposure to the attacker when the target blocks
 ✓ tests/exposure.test.ts > exposure buckets and decay > adds hitExposure to the attacker when an attack connects
 ✓ tests/exposure.test.ts > exposure buckets and decay > counts a dodge that evades the attack as a whiff for the attacker
 ✓ tests/exposure.test.ts > exposure buckets and decay > decays exposure by decayPerTick every tick while not exposed and clamps to zero
 ✓ tests/exposure.test.ts > exposure buckets and decay > clamps exposure at maxExposure
 ✓ tests/exposure.test.ts > reaching the Exposed state > one whiff adds 30, three minimum-interval whiffs add 90, and the fourth Exposes
 ✓ tests/exposure.test.ts > reaching the Exposed state > three consecutive blocked attacks at 35 each make the attacker Exposed
 ✓ tests/exposure.test.ts > reaching the Exposed state > continuous whiffing at the minimum interval reaches Exposed in the expected tick count
 ✓ tests/exposure.test.ts > reaching the Exposed state > continuous connected hits never reach Exposed
 ✓ tests/exposure.test.ts > Exposed behavior > prevents a block from starting while Exposed
 ✓ tests/exposure.test.ts > Exposed behavior > drops a held block the moment the fighter becomes Exposed
 ✓ tests/exposure.test.ts > Exposed behavior > multiplies hit damage by exposedDamageMultiplier against an Exposed target
 ✓ tests/exposure.test.ts > Exposed behavior > ends after exposedTicks and resets exposure to exposedResetRatio of max
 ✓ tests/exposure.test.ts > Exposed behavior > still allows attacking while Exposed
 ✓ tests/exposure.test.ts > exposure leaves endurance and guard-break rules unchanged > drains the same endurance on a block whether or not the attacker is Exposed
 ✓ tests/exposure.test.ts > exposure leaves endurance and guard-break rules unchanged > an Exposed target still breaks guard by endurance rules, not by the multiplier
 ✓ tests/exposure.test.ts > exposure determinism > produces identical exposure states and events for identical inputs
 ✓ tests/exposure.test.ts > proportional exposure and delayed decay (Phase 1c.4) > calculates x1.0, x1.375, and x1.75 from pure exposure
 ✓ tests/exposure.test.ts > proportional exposure and delayed decay (Phase 1c.4) > holds exposure for the full delay, then decays at the configured rate
 ✓ tests/exposure.test.ts > proportional exposure and delayed decay (Phase 1c.4) > restarts the decay delay after a new exposure gain
 ✓ tests/exposure.test.ts > proportional exposure and delayed decay (Phase 1c.4) > uses fractional target exposure for health damage while leaving endurance drain raw
 ✓ tests/input.test.ts > joystick tuning constants > reaches full speed at (or just inside) the visible base circle
 ✓ tests/input.test.ts > joystick tuning constants > uses a small dead zone of roughly 8-10% of the full-speed radius
 ✓ tests/input.test.ts > joystick tuning constants > keeps the pad off the screen corner with an extra margin of 24-40px
 ✓ tests/input.test.ts > joystick dead zone > returns zero for a zero-length drag
 ✓ tests/input.test.ts > joystick dead zone > returns zero anywhere inside the dead zone
 ✓ tests/input.test.ts > joystick dead zone > is zero at the dead zone boundary itself
 ✓ tests/input.test.ts > joystick dead zone > produces a small but non-zero magnitude just outside the dead zone
 ✓ tests/input.test.ts > joystick analog response > gives about half magnitude halfway between the dead zone and the full radius
 ✓ tests/input.test.ts > joystick analog response > scales linearly and monotonically across the travel
 ✓ tests/input.test.ts > joystick analog response > is not quadratic: a half-radius drag is far more than a quarter of full speed
 ✓ tests/input.test.ts > joystick full speed > is exactly 1 at the full-speed radius
 ✓ tests/input.test.ts > joystick full speed > is exactly 1 at the visible circle edge and beyond, preserving direction
 ✓ tests/input.test.ts > joystick full speed > never exceeds magnitude 1 for diagonal drags of any size
 ✓ tests/input.test.ts > joystick direction > maps the four axes to the correct movement directions
 ✓ tests/input.test.ts > joystick direction > preserves the drag angle at partial magnitude
 ✓ tests/input.test.ts > joystick direction > feeds the simulation a proportionally slower velocity for small drags
 ✓ tests/input.test.ts > joystick knob position > stays at the centre for a zero-length drag
 ✓ tests/input.test.ts > joystick knob position > is clamped to the base circle edge at and beyond the full radius
 ✓ tests/input.test.ts > joystick knob position > never leaves the base circle for diagonal or very large drags
 ✓ tests/input.test.ts > joystick knob position > tracks the thumb proportionally inside the circle and keeps the drag direction
 ✓ tests/input.test.ts > joystick edge cases > handles non-finite input without producing NaN
 ✓ tests/input.test.ts > joystick edge cases > falls back to the default base radius when the measured radius is unusable
 ✓ tests/input.test.ts > joystick edge cases > behaves consistently for the smaller pad used on compact or landscape screens
 ✓ tests/arena.test.ts > arena movement simulation > does not move with no input
 ✓ tests/arena.test.ts > arena movement simulation > moves in the requested direction at the configured speed
 ✓ tests/arena.test.ts > arena movement simulation > normalizes diagonal movement to straight-line speed
 ✓ tests/arena.test.ts > arena movement simulation > clamps the fighter on every arena side
 ✓ tests/arena.test.ts > arena movement simulation > is deterministic for an identical input sequence
 ✓ tests/arena.test.ts > fixed timestep accumulator > returns the expected number of ticks and remainder
 ✓ tests/arena.test.ts > fixed timestep accumulator > caps catch-up after a very large elapsed time
 ✓ tests/storage.test.ts > fighter storage > save then load returns an identical fighter
 ✓ tests/storage.test.ts > fighter storage > returns null for structurally invalid saves without throwing
 ✓ tests/storage.test.ts > fighter storage > loads an older valid save even when text exceeds current input limits
 ✓ tests/storage.test.ts > fighter storage > returns no save for missing, corrupt, or unknown schema data
 ✓ tests/fighter.test.ts > fighter generation > is deterministic for the same seed and input
 ✓ tests/fighter.test.ts > fighter generation > generates different hidden stats for different seeds
 ✓ tests/fighter.test.ts > fighter generation > rejects an empty name and missing required fields
 ✓ tests/fighter.test.ts > fighter generation > rejects text and list values over their limits while accepting exact limits
 ✓ tests/fighter.test.ts > fighter generation > keeps optional lists empty and defaults rules off
 ✓ tests/sim-boundary.test.ts > simulation boundary > contains no DOM or browser references

 Test Files  8 passed (8)
      Tests  148 passed (148)
   Start at  08:00:08
   Duration  2.18s (transform 306ms, setup 0ms, collect 455ms, tests 377ms, environment 1ms, prepare 400ms)
```

## Full build output

```text

> multidimensional-arena@0.1.0 build
> tsc && vite build

vite v6.4.3 building for production...
transforming...
✓ 14 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  0.46 kB │ gzip:  0.29 kB
dist/assets/index-BoWNWFP2.css   8.52 kB │ gzip:  2.77 kB
dist/assets/index-DcD-r62G.js   47.58 kB │ gzip: 14.81 kB
✓ built in 322ms
```

## Full tracked/workspace source tree

Generated dependency/build directories and `.git` internals are intentionally omitted.

```text
.gitignore
README.md
docs/architecture.md
docs/benchmark-baseline.txt
docs/benchmark-final.txt
docs/decisions/001-simulation-separate-from-narrator.md
docs/decisions/002-typescript-vite.md
docs/decisions/003-realtime-fixed-timestep-combat.md
docs/decisions/004-combat-basics.md
docs/decisions/005-basic-ai-opponent.md
docs/decisions/006-endurance-and-attack-interval.md
docs/decisions/007-block-facing-guard-recovery-and-ai-spacing.md
docs/decisions/008-exposure-anti-spam.md
docs/decisions/009-veteran-ai-patterns.md
docs/development-log.md
docs/implementation-report-phase-1c5.md
docs/roadmap.md
docs/vision.md
index.html
package-lock.json
package.json
scripts/benchmark.ts
src/main.ts
src/sim/ai.ts
src/sim/arena.ts
src/sim/combat.ts
src/sim/fighter.ts
src/sim/index.ts
src/sim/input.ts
src/sim/rng.ts
src/storage/fighterStorage.ts
src/storage/index.ts
src/ui/app.ts
src/ui/styles.css
tests/ai.test.ts
tests/arena.test.ts
tests/combat.test.ts
tests/exposure.test.ts
tests/fighter.test.ts
tests/input.test.ts
tests/sim-boundary.test.ts
tests/storage.test.ts
tsconfig.json
vite.config.ts
```
