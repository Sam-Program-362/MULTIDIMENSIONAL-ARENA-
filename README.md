# MULTIDIMENSIONAL ARENA

MULTIDIMENSIONAL ARENA is intended to become a persistent open-world combat simulation RPG. **Phase 1b-ii is implemented:** create/save a fighter, enter a fixed-timestep 2.5D training arena, and use movement, attack, hold-to-block, and dodge against a stationary dummy. Health, stamina, action timing, input buffering, and combat events run in the deterministic DOM-free simulation. The persistent world remains planned.

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

```sh
npm test       # run the Vitest suite
npm run build  # type-check and create dist/
```

## Structure

- `src/sim/` deterministic fighter generation, arena movement, and combat state machines
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

No Vercel configuration file is required. Opponent AI, powers, progression consequences, world simulation, matchmaking, backend persistence, and multiplayer are planned for later phases; none are part of this prototype.
