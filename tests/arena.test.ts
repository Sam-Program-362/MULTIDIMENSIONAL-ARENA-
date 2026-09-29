import { describe, expect, it } from 'vitest';
import { createArenaState, FIXED_DT, MAX_CATCH_UP_TICKS, MOVEMENT_SPEED, step, ticksForElapsed, ArenaState } from '../src/sim';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 8);

describe('arena movement simulation', () => {
  it('does not move with no input', () => expect(step(createArenaState(), { x: 0, z: 0 })).toEqual(createArenaState()));
  it('moves in the requested direction at the configured speed', () => {
    const state = step(createArenaState(), { x: 1, z: 0 });
    close(state.position.x, MOVEMENT_SPEED * FIXED_DT); expect(state.position.z).toBe(0); expect(state.facing).toEqual({ x: 1, z: 0 });
  });
  it('normalizes diagonal movement to straight-line speed', () => {
    const straight = step(createArenaState(), { x: 1, z: 0 });
    const diagonal = step(createArenaState(), { x: 1, z: 1 });
    close(Math.hypot(diagonal.position.x, diagonal.position.z), Math.abs(straight.position.x));
  });
  it('clamps the fighter on every arena side', () => {
    const base = createArenaState();
    for (const input of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
      let state: ArenaState = { ...base, position: { x: 0, z: 0 } };
      for (let i = 0; i < 1000; i++) state = step(state, input);
      expect(state.position.x).toBeGreaterThanOrEqual(state.bounds.minX); expect(state.position.x).toBeLessThanOrEqual(state.bounds.maxX);
      expect(state.position.z).toBeGreaterThanOrEqual(state.bounds.minZ); expect(state.position.z).toBeLessThanOrEqual(state.bounds.maxZ);
    }
  });
  it('is deterministic for an identical input sequence', () => {
    const sequence = [{ x: 1, z: 0 }, { x: 1, z: 1 }, { x: 0, z: -1 }, { x: -1, z: 0 }];
    const run = () => sequence.reduce((state, input) => step(state, input), createArenaState());
    expect(run()).toEqual(run());
  });
});

describe('fixed timestep accumulator', () => {
  it('returns the expected number of ticks and remainder', () => {
    expect(ticksForElapsed(FIXED_DT * 3, 0).ticks).toBe(3);
    close(ticksForElapsed(FIXED_DT * 3 + FIXED_DT / 2, 0).accumulator, FIXED_DT / 2);
  });
  it('caps catch-up after a very large elapsed time', () => {
    const result = ticksForElapsed(100, 0);
    expect(result.ticks).toBe(MAX_CATCH_UP_TICKS);
    expect(result.accumulator).toBeGreaterThan(0);
  });
});
