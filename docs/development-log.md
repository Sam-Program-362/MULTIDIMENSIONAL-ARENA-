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

## 2026-09-30 — Phase 1c.1

Replaced damage-reduction blocking with an endurance guard resource. A frontal blocked hit now deals `damage * blockChipFraction` health damage (0 by default) and drains `damage * enduranceDrainPerDamage` (1.0) endurance instead of stamina; block still pauses stamina regeneration, still slows movement, and still does nothing against hits from behind. Endurance regenerates at 0.25 per tick only after 45 ticks without a blocked hit, held or not, and `maxEndurance` is derived from hidden stamina with a small willpower contribution, clamped to 90..110. Emptying endurance is a guard break: the breaking hit deals full damage, the defender staggers for 30 ticks during which it cannot act and takes full damage, and endurance returns to 50% of max when the stagger ends. `ENDURANCE_DEPLETED` and `GUARD_BROKEN` joined the plain-data event log, `ATTACK_BLOCKED` now reports the endurance drained, and `BLOCK_BROKEN` remains as a compatible alias.

Moved every attack number into an `AttackProfile` (`COMBAT_TUNING.attackProfiles.basic`, still reachable as `COMBAT_TUNING.attack`). Combatants carry `attackProfileId` and combat reads timing, range, arc, damage, cost, and movement multipliers through `attackProfileOf`, so future weapons can swap profiles; no weapon system was built. `minIntervalTicks` (34) is measured start-to-start, leaving 10 cooldown ticks after the 24-tick cycle, and `attackCooldownRemaining`/`attackCooldownFraction` are exposed for the UI. Buffering is unchanged, and block, dodge, and movement are never gated by the cooldown.

Improved the Rookie AI without adding AI-only rules: an anticipation guard hold inside threat range with an endurance floor, an early release after repeated far observations, high-probability punishes against delayed observations of stagger/attack-recovery/dodge-recovery targets, and a gap-close dash toward distant players that respects a stamina floor before and after the dodge cost. Determinism, decision interval, reaction buffer, and existing mistakes are unchanged.

The debug HUD gained labelled endurance bars for both combatants, the canvas shows a shield spark on blocked hits, a wobbling ring during a guard break, and a charge ring while the attack interval runs down, and the Attack button shows a radial cooldown fill. Joystick mapping/placement and button layout are untouched. Tests grew to 109 across the suite, covering chip/drain tuning, guard-break timing and damage, endurance regeneration and delay resets, behind-hits, derived bounds, attack-interval limits and buffering, block/dodge during cooldown, and the new AI guard/punish/dash behavior. The save schema stays at version 1 and combat state is still session-only. Heavy attacks, weapons, parry, hit-stop, and adaptive AI remain planned only.

## Phase 1c.2 — combat rule fixes and engagement spacing

Phone playtesting exposed three fairness issues: a held guard could be circled, a guard break restored too much endurance at once, and the 34-tick attack interval made duels feel inert. Block startup/active now auto-face the opponent while all other action phases retain their locked facing. Guard breaks last 40 ticks, end at zero endurance, wait 30 ticks after stagger, and recover at 0.30 endurance per tick. The basic attack interval is now 28 ticks.

The Rookie target snapshot now includes delayed public attack cooldown. The controller uses a seeded approach/hold/entry/strike/disengage cycle at an edge 0.50 outside the 2.1 attack range, with weighted bait-punish, dash-strike, and poke plans, randomized 40–90 tick patience, and 18–45 tick disengagement. It still uses the shared input, stamina, endurance, cooldown, reaction delay, anticipation guard, punish, mistakes, and wall steering. Adaptive AI, feints, parry, heavy attacks, and weapons remain planned only.

## 2026-09-30 — Phase 1c.3 — Exposure anti-spam and AI revert

Added a shared, DOM-free **Exposure** anti-spam meter to the combat simulation. Exposure is applied to the attacker when an attack resolves: a whiff (including a dodge-evaded swing) or a blocked swing adds a large amount (45 each), a clean hit adds little (10), and exposure decays 0.45 per tick, so a fighter who keeps landing never fills the meter while one who keeps missing or getting blocked does. At `maxExposure` (100) the fighter becomes **Exposed** for 75 ticks: block cannot start, a held block is force-dropped, and incoming health damage is multiplied by 1.75. When the window ends, exposure resets to 25% of maximum. `EXPOSED_STARTED` and `EXPOSED_ENDED` joined the plain-data event log, and `DAMAGE_APPLIED`/`ATTACK_HIT` now record the exposure damage multiplier in effect. Exposure and the Exposed flag are public combat state; `COMBAT_TUNING.exposure` holds the tuning. No save data or schema changed.

The Rookie gained two hooks that reuse existing behavior with no new movement, spacing, plans, or reaction-time change: its delayed public snapshot now carries `exposed`/`exposure`; it punishes an observed Exposed target like an observed stagger (through the 12-tick reaction delay, at `punishChance` 0.9); and it restrains — stops starting ordinary attacks — when its own exposure is at or above `restraintExposureRatio` (0.6), while still allowed to punish, guard, retreat, and dodge. This phase also reverted the controller to the Phase 1c.1 approach/hold/punish/dash behavior, removing the Phase 1c.2 edge-distance engagement cycle, plans, patience, and disengage timers, while keeping the Phase 1c.2 combat rules (block auto-facing, empty-guard recovery, 28-tick interval).

The debug HUD gained an orange Exposure bar for both fighters (reading `EXPOSED` at maximum), and the canvas draws a red pulsing "guard down" ring plus a body tint on an Exposed fighter. The joystick, action buttons, and attack-cooldown visuals were untouched.

A scripted seven-scenario benchmark (`scripts/benchmark.ts`, 40 seeds) was run before the change (baseline) and after (final). Exposure and the AI hooks moved the stationary-spammer win rate from 82.5% to 60% and the counter-puncher scenario from a loss to a 100% AI win; the idle-player, hold-block, gap-close, two-spammer, and AI-vs-AI goals all pass with no stalemates. The stationary-spammer goal of ≤50% was not reachable without dropping the "AI beats a pure blocker ≥90%" fairness goal — a limit of the fixed Rookie behavior — so tuning was chosen to protect fairness (documented in decision 008). Vitest grew to 131 tests (16 new exposure tests, 5 new AI exposure-hook tests, and the two Phase 1c.2 engagement-cycle AI tests removed with the revert), all run without a browser. The save schema stays at version 1 and combat state is still session-only. Spacing/engagement AI, adaptive AI, feints, parry/perfect block, heavy attacks, and weapons remain planned only.

## 2026-09-30 — Phase 1c.4 — proportional Exposure and Rookie benchmark

Reworked Exposure into a shared proportional health-damage multiplier: x1.0 at zero, x1.375
at half, and x1.75 at the cap. Exposure now waits 60 ticks after its last gain and then drains
at 0.25 per tick; Exposed behavior, guard gating, duration, and reset remain unchanged. Added a
pure multiplier helper and live x1.x labels beside both orange HUD bars. Rookie profile values
were tuned within the requested ranges and punish selection uses the delayed observed exposure
ratio. Added the novice-human benchmark proxy and AI hit/blocked/whiff metrics.

The final novice result is 50.0% wins with 38.9% AI whiffs, meeting that acceptance target.
The stationary spammer, permanent blocker, runaway timing, and original-direction counter goal
remain misses under the fixed behavior; these are documented honestly in benchmark-final.txt.
Spacing/engagement AI, adaptive AI, feints, and parry remain planned only.

## 2026-09-30 — Phase 1c.5 — exposure feel, held-guard endurance, and Veteran

Phone tuning lowered whiff Exposure from 45 to 30 and blocked Exposure from 40 to 35; clean-hit
Exposure remains 5, with the existing 60-tick delay, 0.25/tick decay, cap, duration, proportional
damage bonus, and quarter reset. Endurance regeneration and its outstanding blocked-hit delay now
pause throughout Block startup/active. Releasing Block must then serve the full 45-tick delay;
quick release/re-hold gaps cannot sustain a permanent guard. Guard-break values are unchanged.

Added the opt-in deterministic Veteran profile and controller path. It reads only delayed public
snapshots, keeps a 300-tick per-fight habit window, and emits shared `CombatInput` for Pressure,
Rhythm Break, Counter-Guard, Desperation, and Kill Instinct patterns. It predicts blocked-swing
Exposure before pressure attacks unless killing, counters observed spam recovery, increases
commitment at <=30% health, ignores restraint against a <=30% target, and caps ordinary retreat at
30 ticks. Dummy / Rookie / Veteran mode changes restart the fight; Rookie remains the default and
its profile/controller values are unchanged. The removable debug HUD shows the Veteran pattern.

The benchmark now reports both tiers over 40 seeds, guard-break timing, pattern usage, and Veteran
versus Rookie. Combat/AI remain DOM-free and session-only; save schema version 1 is unchanged.
Adaptive learning across fights, feints, parry/perfect block, heavy attacks, and weapons remain
planned only.

## 2026-09-30 — Phase 6b — Career loop, slice 2: injuries, clinic, day counter, temperaments, grudges, and save schema v3

Implemented the complete career consequence foundation:
1. **Slice 1 cleanups:** Re-formatted `src/sim/career.ts` and `tests/career.test.ts` into clean, modular multi-line code with named settlement helpers; corrected history offer labeling for Open Ring, Rookie, Veteran, and Revenge bouts; and surfaced "Entry fee lost: N" on defeat/forfeit breakdowns.
2. **Day Counter & Pacing:** `career.day` starts at 1 and advances on settled official matches and `restDay(state)`. Existing injuries heal on each day advance prior to evaluating new match injuries.
3. **Structured Injuries & Modifiers:** Tracked in `fighter.condition.injuries` across 4 body areas (Head, Ribs, Arm, Leg) with base durations (2, 5, 10 days) and natural healing rates (0.5 untreated, 1.0 treated). Area penalties scale max health, max stamina, attack damage, and move speed, capped at 0.40 with a 0.60 floor. Severe injuries lock paid official bouts while Open Ring remains available. Combat simulation accepts optional combatant modifiers applied in official matches.
4. **Opponent Roster & Temperaments:** Added fixed 8-opponent roster with immutable Professional, Brutal, and Ruthless temperaments driving deterministic injury distributions. Forfeits count as losses for injury generation to eliminate exploit paths.
5. **Medical Clinic:** Free Basic Care (sets treated flag) and Paid Premium Treatment (minor 15 credits, moderate 40 credits, severe 90 credits; heals minor/moderate immediately, downgrades severe to moderate with 2.5 days remaining).
6. **Grudges & Revenge Bouts:** Defeats reaching severity score 3 or moderate+ trauma from ruthless rivals create active grudges (max 3). Active grudges offer a 4th Revenge card (1.5x purse, +1 rank, +25 bounty) that settles the score on victory.
7. **Aftermath Text:** Deterministic pure function producing 1-3 lines of narrative recap reflecting outcome, opponent demeanor, injuries, and grudge evolution.
8. **Save Schema v3:** Complete migration from v1 and v2 formats with defensive structure validation and legacy key preservation.
9. **UI & Testing:** Full Hub, Clinic, Offers, History, Profile, and Result screens with mobile-first controls. Suite expanded to 206 tests with 100% pass rate.
