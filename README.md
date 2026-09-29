# MULTIDIMENSIONAL ARENA

MULTIDIMENSIONAL ARENA is intended to become a persistent open-world combat simulation RPG.

**Implemented today:**

- **Phase 1a** — create a fighter, save it locally, reload the page, and continue to its profile.
- **Phase 1b-i** — a real-time movement prototype: enter the arena from the profile and walk a fighter around a 2.5D floor with a virtual joystick or the keyboard, on a fixed-timestep simulation.

**Not built yet:** attacks, blocking, dodging, health/stamina use, opponents, AI, matchmaking, progression changes, economy logic, multiplayer, and the persistent world. Those remain planned.

## Stack

- Vite + vanilla TypeScript
- Vitest
- Canvas 2D for the arena view (no 3D library, no image assets)
- Browser `localStorage` behind `src/storage/fighterStorage.ts`

There are no runtime dependencies. Simulation code in `src/sim/` has no DOM or browser imports and is kept separate from `src/render/` and `src/ui/`; a test enforces that boundary.

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

## Using the arena

1. Create a fighter (or press **Continue** if one is saved).
2. Press **Enter Arena** on the profile screen.
3. Move with the joystick at the bottom left, or with `WASD` / the arrow keys on a desktop.
4. Press **Leave** to return to the profile. The profile and the save are unchanged by anything that happens in the arena.

The readout in the bottom right shows the fighter's floor position, the tick count, and the frame rate. There is no combat: nothing can be attacked and nothing attacks back.

## How the loop works

- The simulation advances in fixed ticks of 1/60 s (`src/sim/timestep.ts`, decision 003).
- Each animation frame passes its real elapsed time to `advanceAccumulator`, which returns how many whole ticks to run and what remainder to carry. Catch-up is capped at five ticks per frame, so a hidden tab or a slow device drops time instead of spiralling.
- Each tick runs `step(state, input, dt)` from `src/sim/arena.ts`: input is clamped per axis and normalised (so diagonal speed equals straight-line speed), speed comes from one constant, and the fighter is clamped inside the floor bounds.
- Rendering happens after the ticks and never advances the simulation, so the same start state and input sequence always produce the same end state.

## Structure

- `src/sim/` deterministic, browser-free simulation: fighter model and generation, seeded RNG, arena state and movement, fixed-timestep accumulator
- `src/render/` canvas 2D arena view: 2.5D projection maths and the renderer
- `src/ui/` DOM screens, frame loop, virtual joystick, keyboard input
- `src/storage/` versioned local save adapter
- `tests/` simulation, rendering-maths, storage, and boundary tests
- `docs/` vision, architecture, roadmap, development log, and decision records

## Save format

The save schema version is unchanged (`1`). Text limits (name 40, other single-line fields 60, list entries 60, background 200) apply when a fighter is created; older saves with longer text still load. A save that is missing a required field, or has one with the wrong type, is treated as "no save" rather than an error.

## Deployment on Vercel

- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Install command:** `npm install` (default)

No Vercel configuration file is required. Combat, AI, opponents, matchmaking, rank changes, economy logic, Neon/database, and multiplayer are planned for later phases.
