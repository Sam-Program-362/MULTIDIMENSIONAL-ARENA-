# Decision 007: block facing, empty guard recovery, and Rookie engagement

Status: accepted (Phase 1c.2)

## Rules

The shared simulation auto-faces an opponent while block is in startup or active. Block recovery, attacks, dodges, and stagger retain their committed facing. Hits still use the defender's frontal arc; there is no perfect block or parry.

A guard break lasts 40 fixed ticks. The breaking hit and later hits during stagger deal full damage. Endurance is set to zero when the stagger ends, not to a hidden safety value. It remains empty for 30 ticks after the stagger and then regenerates at 0.30 per tick. Ordinary blocked-hit regeneration remains delayed 45 ticks. A hit that would reduce endurance to zero, including a hit against an already-empty guard, breaks the guard. `GUARD_BROKEN`, `BLOCK_BROKEN`, and the existing endurance events remain plain-data events.

The basic attack's start-to-start interval is 28 ticks. The profile is shared by player and AI and is the only cooldown gate on attacks.

## Rookie behavior

The AI stores the public target cooldown in the existing 12-tick delayed snapshot. It uses the basic attack's public range plus a profile `reachMargin` of 0.50 as its edge. Its serializable state carries an engagement plan: approach, hold, bait-punish, dash-strike, poke, strike, and disengage. Plans are selected only at the existing decision interval with seeded RNG and profile weights. A strike is always followed by a randomized 18–45 tick disengage. Bait patience is randomized from 40–90 ticks so a passive target is eventually engaged.

Entry, punishment, anticipation guard, low-stamina retreat, mistakes, wall steering, reaction delay, and the shared action/cooldown/stamina rules remain intact. The AI receives no target input, hidden stat, or current target state: the cooldown and action snapshot are delayed public state.

## Boundaries and future work

Combat state remains session-only and the save schema is unchanged. Adaptive learning, feints, parry/perfect block, heavy attacks, weapons, and new AI personalities remain planned. The DOM-free simulation is tested independently of the UI.
