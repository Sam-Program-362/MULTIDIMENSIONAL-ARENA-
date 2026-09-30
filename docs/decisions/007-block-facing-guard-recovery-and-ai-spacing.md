# 007 — Block facing, guard-break recovery, and AI spacing

**Status:** accepted (Phase 1c.2)
**Context:** phone playtest of Phase 1c.1

## Problems observed

1. Facing locks during every action, including block, so an attacker circling to the side or
   behind a blocker landed full damage past the guard.
2. A guard break restored endurance to 50% the instant the stagger ended, so breaking a guard
   was barely worth it.
3. The 34-tick start-to-start attack interval felt sluggish for a duel game.
4. `ROOKIE_PROFILE.preferredRange` (1.65) was inside the basic attack range (2.1), so the AI
   idled and circled inside the player's reach. A stationary player pressing Attack whenever
   available beat it reliably.

## Decisions

### Block facing

While a combatant's action is **block in startup or active phase**, it auto-faces the opponent
every tick — the same rule as idle auto-facing (`tracksOpponentFacing` in `src/sim/combat.ts`).
Facing stays locked during attack, dodge, stagger, and the block **recovery** phase. The
frontal-arc check (150°) still decides whether an individual hit is blocked; auto-facing only
keeps an active guard pointed at the opponent. This is a shared rule: player and AI blocks
behave identically.

### Guard-break recovery

- `guardBreakStaggerTicks: 40` (~0.67 s). The defender cannot act and takes full damage from
  every hit for the whole stagger (unchanged behavior, longer duration).
- `guardBreakResetRatio: 0`. Endurance is **empty** when the stagger ends.
- New `guardBreakRegenDelayTicks: 30`. Endurance regeneration resumes only that many ticks
  **after** the stagger ends. It applies exclusively to guard breaks; an ordinary blocked hit
  keeps the separate `enduranceRegenDelayTicks` (45).
- `enduranceRegenPerTick: 0.30` (was 0.25), so the empty bar recovers visibly but gradually
  (a full refill from empty takes ~5.6 s).
- A blocked hit that would take endurance to zero **or below** is a guard break — including at
  exactly zero endurance. Blocking with an empty endurance bar therefore fails (and breaks
  again) until some endurance has regenerated. This is deliberate: a broken guard stays broken
  for a readable window instead of flickering back on.
- `GUARD_BROKEN` stays the primary event; `BLOCK_BROKEN` remains the compatible alias. The HUD
  needs no changes: the endurance bar reads 0 through the stagger and delay, then rises.

### Attack interval

`minIntervalTicks` for the basic attack profile drops **34 → 28** (~18% shorter, inside the
requested 15–25%). All other attack numbers are unchanged. The 24-tick swing now leaves a
4-tick cooldown tail instead of 10.

### AI spacing and engagement cycle

The Rookie now fights in an explicit cycle stored in plain `AiState` data
(`engagePhase`, `entryPlan`, deadline ticks), decided on the existing 8-tick decision interval
with the existing seeded PRNG:

`APPROACH` to the edge → `HOLD` at the edge (small lateral movement) → choose an **entry
plan** → `ENTRY` → **strike** → `DISENGAGE` back to the edge for a random 18–45 ticks → repeat.

- **Reach awareness.** The target's reach is read from its public attack profile (2.1). The
  default fighting distance is `reach + reachMargin` (0.5), the *edge*. While the target's
  attack is observed as available (cooldown finished, not swinging, not staggered, not holding
  a guard), the AI never idles or circles inside that reach; it only crosses it to execute an
  entry plan, to punish, or behind its own guard.
- **Observation.** The delayed target snapshot gains `attackCooldownRemaining` — public
  information the HUD already shows the player as the opponent's cooldown ring. It is read
  through the same 12-tick reaction delay as everything else. `reactionTicks` is unchanged.
- **Entry plans**, chosen per cycle by profile weights:
  - *bait-punish* (0.35): hold at the edge; enter when the delayed observation shows attack
    recovery, a large attack cooldown, a stagger, or a raised guard; if a random
    `patienceTicks` (40–90) passes with no opening, fall through to a committal plan so a
    passive player is still engaged.
  - *dash-strike* (0.25): dodge toward the target from the edge (i-frames cover the entry),
    strike when the dodge recovery ends and the target is in range. It respects the dash
    stamina floor and only dashes when the fixed dodge distance will not overshoot.
  - *poke* (0.40): step in just far enough to strike once, then disengage immediately.
- **Swing-imminence discipline.** The target's next swing cannot start before its observed
  cooldown elapses. When the observed remainder is small (`entryShieldThreatTicks`), the AI
  does not commit an attack into that gap (that is how trades happen); instead it waits at the
  door just outside reach, or raises a short *entry shield* and lets the swing spend itself on
  endurance, then strikes. The same veto applies to the punish branch, except against a
  staggered target, which cannot swing at all. Disengages inside reach are covered by a
  dodge-out (i-frames, stamina floor respected) or the same short guard.
- **Kept from 1c/1c.1:** anticipation guard only inside threat range, punish, low-stamina
  retreat, seeded mistakes (enter early = out-of-range swing; stay too long = recovery
  overcommit), decision interval, determinism. When cornered, movement wall-slides along the
  boundary instead of freezing.
- **Attack presses respect the shared cooldown.** Regular presses happen only at
  `attackCooldownRemaining === 0`; the overcommit mistake may press within the 6-tick input
  buffer of the cooldown end, which is an ordinary buffered press and cannot start early.

### Fairness constraints (unchanged)

The AI receives no information a player cannot see, keeps the 12-tick reaction delay, gets no
stat changes, and passes through the identical `CombatInput` → `stepCombatantPair` path with
all stamina/endurance/cooldown rules.

## Benchmark results (80 seeds per scenario, 90 s cap, 60 ticks/s)

| Scenario | Goal | Result |
| --- | --- | --- |
| (a) stationary attack spammer | wins ≤ 40% | wins **21%** (AI 79%) |
| (b) idle player | AI wins ~all | AI **100%** |
| (c) permanent blocker | AI ≥ 90% wins, ≥ 80% guard breaks | AI **100%**, breaks **100%** |
| (d) dodge-away runner | AI reaches attack range ≤ 3 s average | **~1.0 s** average re-acquire |
| (e) literal counter-puncher | wins ≥ 55% | wins **0%** — see below |
| (e2) skilled-player proxy | (same intent as e) | wins **75%** |
| (f) AI vs AI | finishes, no stalemate | **80/80** finished, avg 15.4 s |

**Why (e) cannot be met as literally specified:** the counter-puncher's defense trigger is
"block or dodge when the AI's attack is *observed in startup* with a 12-tick reaction delay".
The basic attack resolves 6–9 ticks after it starts, so by the time any agent — human bot or
AI — observes the startup, the hit already landed. Reactive defense is physically impossible
in this ruleset; this is exactly why the Rookie itself defends by anticipation (guard/shield
raised from the cooldown signal), not by reaction. Its punish trigger ("attack when observed
in recovery") fails for the same reason against a disciplined disengager: by the time recovery
is observed and an answer arrives, the Rookie has left reach. Weakening the AI profile until
this bot wins would reintroduce problem 4. The honest skilled-player measurement is (e2): the
same controller rules, the **same 12-tick reaction delay**, no extra information, but
human-quality parameters (near-per-tick micro instead of 8-tick decisions, no scripted
mistakes, disciplined shield use). That player beats the Rookie **75%** of fights, which is
the actual "a skilled player should beat a Rookie" property. `scripts/benchmark.ts` reproduces
both numbers.

## Consequences

- Circling no longer defeats a guard; positioning still matters through the frontal arc during
  block recovery and all locked actions.
- A guard break is now a real window: ~0.67 s helpless, then an empty guard for another 0.5 s,
  then gradual recovery — and blocking on an empty bar re-breaks.
- The stationary-spammer degenerate strategy loses to spacing, shield-punish timing, and
  disengages, without any AI-only information or stats.
- Adaptive/learning AI, feints, parry/perfect block, and heavy attacks remain **planned only**.
