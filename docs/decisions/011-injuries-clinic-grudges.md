# Decision 011 — Injuries, Clinic, Day Counter, Opponent Temperaments, Grudges, and Save Schema v3

## Context

Phase 6b (Career loop, slice 2) connects combat outcomes to lasting consequences. Defeat and rough matches must create tangible narrative and mechanical costs: injuries that persist across fights, time passing as days, recovery at a medical clinic, opponent temperaments that dictate ring brutality, grudges formed against opponents who severely hurt the player, and Revenge bouts with elevated stakes.

## Decisions

### 1. Day Counter
- `career.day` initializes at 1 in `defaultCareer`.
- Each settled official match advances `career.day` by 1.
- `restDay(state)` advances `career.day` by 1 and advances `offerSeed` to refresh offers without credit cost.
- Order of operations: on each day advance, existing injuries are healed first, and only then are fresh injuries from that match generated, ensuring new injuries do not heal on the day they occur.

### 2. Structured Injuries and Combat Modifiers
- Injuries are structured objects stored in `fighter.condition.injuries`: `{ id, area, name, severity, daysRemaining, treated, sourceOpponentId, day }`.
- Areas: `head` (max health), `ribs` (max stamina), `arm` (attack damage), `leg` (movement speed).
- Base durations: minor 2 days, moderate 5 days, severe 10 days.
- Natural healing per day: untreated 0.5 days/day, treated 1.0 day/day. Injuries are removed once `daysRemaining <= 0`.
- Penalty amounts: minor 0.04 (4%), moderate 0.10 (10%), severe 0.20 (20%).
- Total penalty per effect is capped at 0.40 (40%), with a stat multiplier floor of 0.60 (60%).
- Severe injuries gate paid bouts (Rookie, Veteran, Revenge), while the exhibition Open Ring remains always available.
- Combat simulation supports optional combatant `modifiers` (`maxHealth`, `maxStamina`, `moveSpeed`, `attackDamage`). Official bouts apply the player's injury modifiers; the Training Room and all opponents remain unmodified. Dodge distance is unaffected by movement speed penalties.

### 3. Opponent Roster and Temperaments
- A fixed 8-fighter roster defines immutable IDs, names, and temperaments:
  - Professional: Mara Venn, Kestrel-9, Toma Ash, Corin Vance, Lyra Sol
  - Brutal: Orrin Vale, Brakka Gorr
  - Ruthless: Sable Rook
- Injury generation is deterministic from the match seed, fight stats (`playerHealthRatio`, `opponentHealthRatio`), and opponent temperament:
  - Professional: 1 (70%) or 2 (30%) injuries; 70% minor / 27% moderate / 3% severe.
  - Brutal: 1-3 injuries; 35% minor / 45% moderate / 20% severe.
  - Ruthless: 2-4 injuries; 15% minor / 40% moderate / 45% severe.
  - Non-exhibition Win: 10% + 50% * (1 - playerHealthRatio) chance of 1 injury (minor, or moderate if health < 25% with 25% chance).
  - Non-exhibition Draw: 30% chance of 1 minor injury.
  - Exhibition (Open Ring): at most 1 minor injury on loss/forfeit (25% chance); 0 on win/draw.
- Forfeiting a match counts as a loss for injury generation, preventing reload/forfeit exploits.

### 4. Clinic
- Basic Care: Free, sets `treated = true` once per injury, accelerating healing from 0.5 to 1.0 days/day.
- Premium Treatment: Costs credits (minor 15, moderate 40, severe 90). Minor and moderate injuries are healed immediately. Severe injuries downgrade to moderate with half base days (`2.5` days) and `treated = true` (eligible for subsequent treatment).
- Clinic actions deduct credits immediately and never advance the day counter.

### 5. Grudges and Revenge Bouts
- `career.grudges` stores active and settled grudges: `{ opponentId, name, temperament, tier, harm, timesBeatenBy, sinceDay, status }`.
- Created or updated when a loss/forfeit inflicts injuries with total severity score >= 3 (minor 1, moderate 2, severe 3) OR when a ruthless opponent causes moderate or severe harm.
- Active grudges are capped at 3; newest replaces the oldest active grudge.
- If an active grudge exists, Find Match generates a 4th card ("Revenge bout") for the most recent active grudge: same tier and fee, 1.5x purse, +1 extra rank point on win, and a +25 credit bounty.
- Winning a Revenge bout marks the grudge as settled. Losing leaves it active and appends harm.

### 6. Aftermath Text
- Deterministic pure function `aftermathLines(context)` generating 1-3 concise narrator lines from structured match data (outcome, opponent, temperament, injuries, fee/payout, grudge state).

### 7. Save Schema Version 3
- Saves stored under `multidimensional-arena:career:v3` with `schemaVersion: 3`.
- Defensive migrations:
  - From v1 (`multidimensional-arena:fighter:v1`): initializes `condition.injuries: []`, `career.day: 1`, `career.grudges: []`.
  - From v2 (`multidimensional-arena:career:v2`): drops legacy string injuries, preserves day and grudges, infers `offerId` and `label` in history entries.
  - Existing storage keys are preserved. Malformed data returns `null` without throwing.
