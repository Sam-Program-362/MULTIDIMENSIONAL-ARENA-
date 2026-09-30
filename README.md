# MULTIDIMENSIONAL ARENA

MULTIDIMENSIONAL ARENA is intended to become a persistent open-world combat simulation RPG. **Phase 1c.5 is implemented:** create/save a fighter, enter a fixed-timestep 2.5D training arena, and use movement, attack, hold-to-block, and dodge against a stationary dummy, the seeded Rookie, or the opt-in patterned Veteran opponent. Health, stamina, endurance (the guard resource), the Exposure anti-spam meter, action timing, the per-attack minimum interval, input buffering, AI decisions, and combat events run in the deterministic DOM-free simulation. The persistent world remains planned.

## Stack

- Vite + vanilla TypeScript
- Vitest
- Browser `localStorage` behind `src/storage/fighterStorage.ts`

Only the dependencies listed in `package.json` are used. Simulation code in `src/sim/` has no DOM or browser imports and is kept separate from `src/ui/`.

## Install and run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The app is designed for mobile widths around 360px and up.

Arena controls:

- Touch: left virtual joystick; right-side Attack, hold Block, and Dodge buttons support simultaneous touches.
- Keyboard: WASD or arrows to move, `J` to attack, hold `K` to block, and `L` to dodge.
- The arena opens in **Rookie** mode. The **Dummy / Rookie / Veteran** toggle restarts the session-only fight in the selected mode.

```sh
npm test       # run the Vitest suite
npm run build  # type-check and create dist/
```

## Structure

- `src/sim/` deterministic fighter generation, arena movement, combat state machines, and seeded basic AI
- `src/ui/` DOM screens, pointer/keyboard controls, and canvas presentation
- `src/storage/` versioned local save adapter
- `tests/` simulation, input, storage, and DOM-boundary tests
- `docs/decisions/` accepted architecture and simulation decisions

Blocking a frontal hit costs **endurance**, not health and not stamina; endurance cannot regenerate while Block is held, and the 45-tick blocked-hit delay runs only after release; a blocker auto-faces during block startup/active, and when endurance hits zero the guard breaks for 40 ticks at full damage. Endurance is 0 at stagger end, waits 30 more ticks, then regenerates at 0.30 per tick. Attacks obey a per-attack minimum interval (28 ticks for the basic attack profile), shown as a fill on the Attack button. See `docs/decisions/007-block-facing-guard-recovery-and-ai-spacing.md`.

Every fighter also has an **Exposure** meter that punishes spammed offense: a whiff adds 30, a blocked swing adds 35, a clean hit adds 5, and exposure waits 60 ticks after each gain, then decays at 0.25 per tick, so an attacker who keeps landing is fine while one who keeps missing or getting blocked fills the meter. At full exposure the fighter is **Exposed** for a short window — the guard drops and cannot be raised and incoming health damage scales from ×1.0 at zero exposure to ×1.75 at the cap — then exposure resets to a quarter of maximum. The debug HUD shows an orange Exposure bar for both fighters and a red pulsing "guard down" ring on an Exposed fighter. The Rookie punishes an Exposed opponent and restrains its own attacks when its exposure gets high. The Veteran adds delayed-observation Pressure, Rhythm Break, Counter-Guard, Desperation, and Kill Instinct patterns; the removable debug HUD names its current pattern. See `docs/decisions/009-veteran-ai-patterns.md`. See `docs/decisions/008-exposure-anti-spam.md`.

Heavy attacks, a weapon/equipment system, parry or perfect block, feints, and adaptive learning across fights are **planned only**.

Combat state is deliberately session-only. Entering the arena creates a fresh fight and does not change the version 1 fighter save schema or persist health/stamina.

## Deployment on Vercel

- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Install command:** `npm install` (default)

No Vercel configuration file is required. Adaptive AI, personality/trait-driven behavior, multiple opponents, fight rewards, powers, progression consequences, world simulation, matchmaking, backend persistence, and multiplayer are **planned only**; none are part of this phase.
