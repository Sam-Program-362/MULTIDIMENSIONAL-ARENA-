import { TICK_SECONDS } from './timestep';

/**
 * Arena movement simulation (Phase 1b-i).
 *
 * Pure state + pure transitions. No rendering, no input devices, no browser APIs, so the
 * same code runs in the frame loop and in tests. Combat is not modelled here yet.
 *
 * Coordinates: the floor is the ground plane (x, z) measured in floor units (1 unit ~= 1
 * metre). +x is arena right, +z is toward the viewer. Height is a rendering concern.
 */

/** Ground-plane vector. */
export interface Vector2 {
  x: number;
  z: number;
}

/** Rectangular floor of the arena. */
export interface ArenaBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The only input the simulation accepts so far: a movement vector, each axis -1..1. */
export interface MoveInput {
  x: number;
  z: number;
}

export interface FighterBody {
  /** Position on the floor. */
  position: Vector2;
  /** Realised velocity of the last tick, in floor units per second. */
  velocity: Vector2;
  /** Unit vector the fighter last moved along; kept while standing still. */
  facing: Vector2;
  /** Collision radius used when clamping to the floor. */
  radius: number;
}

export interface ArenaState {
  /** Number of fixed ticks simulated so far. */
  tick: number;
  bounds: ArenaBounds;
  fighter: FighterBody;
}

/** Floor size in floor units. */
export const ARENA_WIDTH = 12;
export const ARENA_DEPTH = 9;

/** Walking speed in floor units per second. Diagonals are normalised, so they match. */
export const MOVE_SPEED = 3.6;

/** Fighter footprint radius in floor units. */
export const FIGHTER_RADIUS = 0.4;

/** Vectors shorter than this count as zero (joystick deadzones live in the UI, not here). */
const EPSILON = 1e-6;

export const ARENA_BOUNDS: Readonly<ArenaBounds> = Object.freeze({
  minX: -ARENA_WIDTH / 2,
  maxX: ARENA_WIDTH / 2,
  minZ: -ARENA_DEPTH / 2,
  maxZ: ARENA_DEPTH / 2,
});

export const NO_INPUT: Readonly<MoveInput> = Object.freeze({ x: 0, z: 0 });

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low + (high - low) / 2;
  if (low > high) return low + (high - low) / 2;
  return value < low ? low : value > high ? high : value;
}

function finite(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export interface ArenaStateOptions {
  position?: Vector2;
  facing?: Vector2;
  bounds?: ArenaBounds;
  radius?: number;
}

/** Builds a fresh arena with the fighter standing still in the middle. */
export function createArenaState(options: ArenaStateOptions = {}): ArenaState {
  const bounds: ArenaBounds = { ...(options.bounds ?? ARENA_BOUNDS) };
  const radius = options.radius ?? FIGHTER_RADIUS;
  const requested = options.position ?? { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
  const facing = options.facing ?? { x: 0, z: 1 };
  return {
    tick: 0,
    bounds,
    fighter: {
      position: clampToBounds(requested, bounds, radius),
      velocity: { x: 0, z: 0 },
      facing: normalizeDirection(facing) ?? { x: 0, z: 1 },
      radius,
    },
  };
}

/** Unit-length copy of a vector, or null when it has no length. */
export function normalizeDirection(vector: Vector2): Vector2 | null {
  const x = finite(vector?.x);
  const z = finite(vector?.z);
  const magnitude = Math.hypot(x, z);
  if (magnitude <= EPSILON) return null;
  return { x: x / magnitude, z: z / magnitude };
}

/**
 * Turns raw input into a movement vector of length 0..1. Each axis is clamped to -1..1
 * first, then anything longer than 1 (a full diagonal) is scaled down, so diagonal speed
 * equals straight-line speed. Partial pushes of an analogue stick stay partial.
 */
export function normalizeInput(input: MoveInput = NO_INPUT): Vector2 {
  const x = clamp(finite(input?.x), -1, 1);
  const z = clamp(finite(input?.z), -1, 1);
  const magnitude = Math.hypot(x, z);
  if (magnitude <= EPSILON) return { x: 0, z: 0 };
  return magnitude > 1 ? { x: x / magnitude, z: z / magnitude } : { x, z };
}

/** Keeps a position inside the floor, leaving room for the fighter's radius. */
export function clampToBounds(position: Vector2, bounds: ArenaBounds, radius = 0): Vector2 {
  return {
    x: clamp(finite(position?.x), bounds.minX + radius, bounds.maxX - radius),
    z: clamp(finite(position?.z), bounds.minZ + radius, bounds.maxZ - radius),
  };
}

/** True when the fighter is pressed against one of the arena walls. */
export function isAtBounds(state: ArenaState): boolean {
  const { position, radius } = state.fighter;
  const { bounds } = state;
  return (
    position.x <= bounds.minX + radius + EPSILON ||
    position.x >= bounds.maxX - radius - EPSILON ||
    position.z <= bounds.minZ + radius + EPSILON ||
    position.z >= bounds.maxZ - radius - EPSILON
  );
}

/**
 * Advances the arena by one fixed tick. Pure: the incoming state is never mutated, so the
 * same start state and input sequence always produce the same end state.
 */
export function step(state: ArenaState, input: MoveInput = NO_INPUT, dt: number = TICK_SECONDS): ArenaState {
  const move = normalizeInput(input);
  const previous = state.fighter.position;
  const stepped = {
    x: previous.x + move.x * MOVE_SPEED * dt,
    z: previous.z + move.z * MOVE_SPEED * dt,
  };
  const position = clampToBounds(stepped, state.bounds, state.fighter.radius);
  const velocity = dt > 0
    ? { x: (position.x - previous.x) / dt, z: (position.z - previous.z) / dt }
    : { x: 0, z: 0 };
  const facing = normalizeDirection(move) ?? { ...state.fighter.facing };
  return {
    tick: state.tick + 1,
    bounds: { ...state.bounds },
    fighter: { position, velocity, facing, radius: state.fighter.radius },
  };
}

/** Convenience for tests and replays: runs a sequence of inputs, one per tick. */
export function runTicks(
  state: ArenaState,
  inputs: readonly MoveInput[],
  dt: number = TICK_SECONDS,
): ArenaState {
  return inputs.reduce((current, input) => step(current, input, dt), state);
}
