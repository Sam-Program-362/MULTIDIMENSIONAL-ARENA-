# Match Consequences and Career Progression

This document tracks implemented and planned career systems regarding fight consequences, injuries, recovery, temperaments, grudges, and world pacing.

## Implemented (Phase 6b — Slice 2)

### 1. Day Counter and Pacing
- Career starts on Day 1.
- Each settled official match advances the day by 1.
- Rest Day (`restDay`): Advances the day by 1 and rolls a fresh `offerSeed` without financial cost.
- Healing happens on each day advance prior to recording fresh match injuries.

### 2. Injuries and Vitals Modifiers
- Structured injuries are tracked in `fighter.condition.injuries` (`head`, `ribs`, `arm`, `leg`).
- Multiplier penalties apply to combat attributes in official bouts:
  - Head: max health (clamped to min 0.60)
  - Ribs: max stamina (clamped to min 0.60)
  - Arm: attack damage (clamped to min 0.60)
  - Leg: movement speed (clamped to min 0.60, dash distance unaffected)
- Each area penalty is capped at 0.40 total.
- Severe injuries lock paid official bouts (Rookie/Veteran/Revenge) while keeping the Open Ring available.

### 3. Medical Clinic
- Basic Care: Free stabilization that accelerates daily healing rate (1.0 day/day vs 0.5 day/day untreated).
- Premium Care: Paid restoration (minor 15 credits, moderate 40 credits, severe 90 credits). Minor/moderate are removed; severe downgrades to moderate with 2.5 days remaining.

### 4. Opponent Temperaments and Injury Distributions
- Opponent roster:
  - Professional: Mara Venn, Kestrel-9, Toma Ash, Corin Vance, Lyra Sol
  - Brutal: Orrin Vale, Brakka Gorr
  - Ruthless: Sable Rook
- Temperaments dictate injury quantity and severity upon defeat or forfeit.
- Forfeiting a match counts as a loss for injury rolls to eliminate reload/forfeit exploits.

### 5. Grudges and Revenge Bouts
- Grudges trigger when injury severity score reaches 3 or when a ruthless opponent causes moderate/severe trauma.
- Active grudges generate high-stakes Revenge Bout offers: same tier/fee, 1.5x purse, +1 rank point, +25 credit bounty.
- Winning settles the grudge; defeat updates accumulated harm.

### 6. Narrative Aftermath
- Deterministic 1-3 line narrator aftermath texts recording context, opponent demeanor, injuries taken, and grudge status.

### 7. Persistence
- Save schema version 3 with full migration from v1 and v2 formats.

---

## Planned Future Systems (Post-Slice 2)

### 1. Revenge Post-Match Choices (PLANNED)
When the player defeats a grudge opponent in a Revenge bout, future slices (Permanent Death and Equipment Loot) will introduce post-fight choices:
- **Kill:** Permanent elimination of the opponent (subject to Arena rules and underground access).
- **Injure Badly:** Inflict severe career-impairing trauma on the rival.
- **Rob Completely:** Seize all carried equipment and purse currency.
- **Spare:** Grant mercy in exchange for reputation and prestige.

### 2. Host Intervention Delay (PLANNED)
- In lethal or underground bouts, referee or host interventions may be delayed based on arena security level, allowing extra post-knockout damage.

### 3. Daily Living Costs and Housing Effects (PLANNED)
- Daily upkeep costs for quarters, nutrition, and gear maintenance deducted per day advance.
- Better housing providing natural injury recovery bonuses and stamina regeneration buffs.
