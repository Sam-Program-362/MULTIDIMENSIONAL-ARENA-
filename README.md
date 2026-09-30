# MULTIDIMENSIONAL ARENA

MULTIDIMENSIONAL ARENA is a persistent open-world combat simulation RPG. **Phase 6b (Career loop, slice 2) is implemented:** build a fighter, manage career day progression, accept official bouts (Open Ring, Rookie, Veteran, and high-stakes Revenge bouts), withstand and treat structured injuries at the clinic, face distinct opponent temperaments, form and settle grudges against rivals, and read deterministic match aftermaths.

Combat runs in a deterministic DOM-free fixed-timestep 2.5D simulation featuring movement, attacks, hold-to-block, dodge, stamina, endurance (guard resource), Exposure (anti-spam meter), injury modifiers, and Rookie/Veteran AI tiers.

## Stack

- Vite + vanilla TypeScript
- Vitest
- Browser `localStorage` with versioned save schema (v3)

Only the dependencies listed in `package.json` are used. Simulation code in `src/sim/` has no DOM or browser imports and is strictly decoupled from `src/ui/`.

## Install and run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The app is designed for mobile-first layouts around 360px and up.

Arena controls:
- Touch: left virtual joystick; right-side Attack, hold Block, and Dodge buttons support multi-touch.
- Keyboard: WASD or arrow keys to move, `J` to attack, hold `K` to block, and `L` to dodge.
- Official matches run under **Arena Lock**; Training Room supports sparring against Dummy, Rookie, and Veteran opponents.

```sh
npm test       # run the Vitest suite
npm run build  # type-check and build production bundle
```

## Structure

- `src/sim/` deterministic fighter generation, arena movement, combat state machines, AI controllers, career day counter, injury mechanics, clinic actions, opponent temperaments, grudges, and aftermath text
- `src/ui/` DOM screens (Hub, Clinic, Offers, History, Profile, Match Result, Arena) and canvas presentation
- `src/storage/` schema v3 save adapter with migrations from v1 and v2
- `tests/` simulation, injuries, clinic, grudges, aftermath, storage, input, combat, AI, and DOM-boundary tests
- `docs/decisions/` architectural and simulation design records
- `docs/game-design/` career and combat consequence specifications

## Career & Combat Systems

- **Injuries & Penalties:** Structured trauma to Head (health), Ribs (stamina), Arm (damage), and Leg (speed). Penalties scale per severity (minor 4%, moderate 10%, severe 20%), capped at 40% with a 60% stat floor. Severe injuries lock paid official bouts until treated.
- **Clinic:** Free basic care accelerates natural healing (1.0 vs 0.5 days/day). Paid premium treatments restore injuries immediately or reduce severe trauma to moderate.
- **Temperaments & Grudges:** Fixed roster opponents possess Professional, Brutal, or Ruthless temperaments dictating injury severity. Rough defeats spawn Grudges, enabling high-stakes Revenge bouts (1.5x purse, +1 rank, +25 credit bounty).
- **Combat Mechanics:** Frontal blocking drains endurance; guard breaks stagger for 40 ticks. Exposure punishes missed/blocked swings with vulnerable Exposed states. Attacks follow fixed intervals (28 ticks).

Equipment loot/loss, Permanent Death choices, daily living costs, and housing effects remain planned.
