# MULTIDIMENSIONAL ARENA

MULTIDIMENSIONAL ARENA is intended to become a persistent open-world combat simulation RPG. **Phase 1c is implemented:** create/save a fighter, enter a fixed-timestep 2.5D training arena, and use movement, attack, hold-to-block, and dodge. A Dummy/Opponent toggle switches between the passive stationary dummy and a deterministic "Rookie" AI opponent that approaches, attacks, sometimes blocks and dodges, and can defeat you or be defeated. The AI produces the same inputs as the player and obeys the same combat rules — it never cheats. Health, stamina, action timing, input buffering, combat events, and the AI all run in the deterministic DOM-free simulation. The persistent world remains planned.

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
- Top-right toggle: switch between **Opponent** (the Rookie AI, default) and **Dummy** (passive). Switching restarts the fight; Reset restarts the current mode.

```sh
npm test       # run the Vitest suite
npm run build  # type-check and create dist/
```

## Structure

- `src/sim/` deterministic fighter generation, arena movement, combat state machines, and the basic AI opponent
- `src/ui/` DOM screens, pointer/keyboard controls, and canvas presentation
- `src/storage/` versioned local save adapter
- `tests/` simulation, input, storage, and DOM-boundary tests
- `docs/decisions/` accepted architecture and simulation decisions

Combat state is deliberately session-only. Entering the arena creates a fresh fight and does not change the version 1 fighter save schema or persist health/stamina.

## Deployment on Vercel

- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Install command:** `npm install` (default)

No Vercel configuration file is required. A basic AI opponent is now included; adaptive/learning AI, personalities, multiple opponents, powers, progression consequences, rewards, world simulation, matchmaking, backend persistence, and multiplayer are planned for later phases and are not part of this prototype.
