# MULTIDIMENSIONAL ARENA

MULTIDIMENSIONAL ARENA is intended to become a persistent open-world combat simulation RPG. **Phase 1b-i is implemented:** create/save a fighter and move them in a fixed-timestep, touch-controlled 2.5D arena. Combat and the persistent world are planned, not built.

## Stack

- Vite + vanilla TypeScript
- Vitest
- Browser `localStorage` behind `src/storage/fighterStorage.ts`

Only the runtime dependencies listed in `package.json` are used. Simulation code in `src/sim/` has no DOM or browser imports and is kept separate from `src/ui/`.

## Install and run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The app is designed for mobile widths around 360px and up.

```sh
npm test       # run the Vitest suite
npm run build  # type-check and create dist/
```

## Structure

- `src/sim/` deterministic fighter model and generation logic
- `src/ui/` DOM screens
- `src/storage/` versioned local save adapter
- `tests/` simulation, storage, and boundary tests

## Deployment on Vercel

- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Install command:** `npm install` (default)

No Vercel configuration file is required. Combat, movement, canvas/WebGL, AI, opponents, matchmaking, rank changes, economy logic, Neon/database, and multiplayer are planned for later phases.
