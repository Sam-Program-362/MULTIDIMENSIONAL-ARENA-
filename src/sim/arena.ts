export interface Vec2 { x: number; z: number; }
export interface ArenaState { bounds: { minX: number; maxX: number; minZ: number; maxZ: number }; position: Vec2; velocity: Vec2; facing: Vec2; }
export interface MovementInput { x: number; z: number; }
export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;
export const MOVEMENT_SPEED = 5;
export const MAX_CATCH_UP_TICKS = 5;

export function createArenaState(): ArenaState { return { bounds: { minX: -10, maxX: 10, minZ: -7, maxZ: 7 }, position: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, facing: { x: 0, z: 1 } }; }
export function step(state: ArenaState, input: MovementInput, dt = FIXED_DT): ArenaState {
  const x = Math.max(-1, Math.min(1, input.x)); const z = Math.max(-1, Math.min(1, input.z));
  const length = Math.hypot(x, z); const nx = length > 1 ? x / length : x; const nz = length > 1 ? z / length : z;
  const velocity = { x: nx * MOVEMENT_SPEED, z: nz * MOVEMENT_SPEED };
  const position = { x: Math.max(state.bounds.minX, Math.min(state.bounds.maxX, state.position.x + velocity.x * dt)), z: Math.max(state.bounds.minZ, Math.min(state.bounds.maxZ, state.position.z + velocity.z * dt)) };
  return { ...state, position, velocity, facing: length > 0 ? { x: nx, z: nz } : state.facing };
}
export function ticksForElapsed(elapsedSeconds: number, accumulator: number): { ticks: number; accumulator: number } {
  const total = Math.max(0, accumulator) + Math.min(Math.max(0, elapsedSeconds), 1);
  const requested = Math.floor(total / FIXED_DT); const ticks = Math.min(requested, MAX_CATCH_UP_TICKS);
  return { ticks, accumulator: total - ticks * FIXED_DT };
}
