import { describe, expect, it } from 'vitest';
import {
  ARENA_BOUNDS,
  ARENA_DEPTH,
  ARENA_WIDTH,
  createArenaState,
  FIGHTER_RADIUS,
  isAtBounds,
  MOVE_SPEED,
  MoveInput,
  normalizeInput,
  NO_INPUT,
  runTicks,
  step,
  TICK_SECONDS,
} from '../src/sim';

const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const repeat = (input: MoveInput, ticks: number): MoveInput[] => Array.from({ length: ticks }, () => input);

describe('arena state', () => {
  it('starts still in the middle of the floor, facing the viewer', () => {
    const state = createArenaState();
    expect(state.tick).toBe(0);
    expect(state.fighter.position).toEqual({ x: 0, z: 0 });
    expect(state.fighter.velocity).toEqual({ x: 0, z: 0 });
    expect(state.fighter.facing).toEqual({ x: 0, z: 1 });
    expect(state.bounds).toEqual({ minX: -ARENA_WIDTH / 2, maxX: ARENA_WIDTH / 2, minZ: -ARENA_DEPTH / 2, maxZ: ARENA_DEPTH / 2 });
  });

  it('clamps a start position that is outside the floor', () => {
    const state = createArenaState({ position: { x: 500, z: -500 } });
    expect(state.fighter.position.x).toBeCloseTo(ARENA_BOUNDS.maxX - FIGHTER_RADIUS, 10);
    expect(state.fighter.position.z).toBeCloseTo(ARENA_BOUNDS.minZ + FIGHTER_RADIUS, 10);
  });
});

describe('input normalisation', () => {
  it('leaves partial pushes partial and shortens over-long vectors', () => {
    expect(normalizeInput({ x: 0.5, z: 0 })).toEqual({ x: 0.5, z: 0 });
    const diagonal = normalizeInput({ x: 1, z: 1 });
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1, 12);
  });

  it('clamps each axis to -1..1 and survives junk values', () => {
    const clamped = normalizeInput({ x: 9, z: -9 });
    expect(Math.hypot(clamped.x, clamped.z)).toBeCloseTo(1, 12);
    expect(normalizeInput({ x: Number.NaN, z: Number.POSITIVE_INFINITY })).toEqual({ x: 0, z: 0 });
  });
});

describe('movement', () => {
  it('does not move without input', () => {
    const start = createArenaState();
    const after = runTicks(start, repeat(NO_INPUT, 60));
    expect(after.fighter.position).toEqual(start.fighter.position);
    expect(after.fighter.velocity).toEqual({ x: 0, z: 0 });
    expect(after.tick).toBe(60);
  });

  it('never mutates the state it is given', () => {
    const start = createArenaState();
    const snapshot = structuredClone(start);
    step(start, { x: 1, z: 1 });
    expect(start).toEqual(snapshot);
  });

  it('moves in the direction of the input', () => {
    const start = createArenaState();
    const right = step(start, { x: 1, z: 0 });
    expect(right.fighter.position.x).toBeGreaterThan(start.fighter.position.x);
    expect(right.fighter.position.z).toBeCloseTo(0, 12);

    const left = step(start, { x: -1, z: 0 });
    expect(left.fighter.position.x).toBeLessThan(start.fighter.position.x);

    const far = step(start, { x: 0, z: -1 });
    expect(far.fighter.position.z).toBeLessThan(start.fighter.position.z);

    const near = step(start, { x: 0, z: 1 });
    expect(near.fighter.position.z).toBeGreaterThan(start.fighter.position.z);
  });

  it('moves exactly MOVE_SPEED * dt in one tick', () => {
    const start = createArenaState();
    const after = step(start, { x: 1, z: 0 });
    expect(distance(start.fighter.position, after.fighter.position)).toBeCloseTo(MOVE_SPEED * TICK_SECONDS, 12);
    expect(after.fighter.velocity.x).toBeCloseTo(MOVE_SPEED, 10);
  });

  it('moves at the same speed diagonally as in a straight line', () => {
    const start = createArenaState();
    const straight = distance(start.fighter.position, runTicks(start, repeat({ x: 1, z: 0 }, 30)).fighter.position);
    const diagonal = distance(start.fighter.position, runTicks(start, repeat({ x: 1, z: 1 }, 30)).fighter.position);
    expect(diagonal).toBeCloseTo(straight, 10);
  });

  it('scales a half-pushed stick to half speed', () => {
    const start = createArenaState();
    const full = distance(start.fighter.position, step(start, { x: 1, z: 0 }).fighter.position);
    const half = distance(start.fighter.position, step(start, { x: 0.5, z: 0 }).fighter.position);
    expect(half).toBeCloseTo(full / 2, 12);
  });

  it('keeps the last facing when the input stops', () => {
    const moved = step(createArenaState(), { x: -1, z: 0 });
    expect(moved.fighter.facing).toEqual({ x: -1, z: 0 });
    const stopped = step(moved, NO_INPUT);
    expect(stopped.fighter.facing).toEqual({ x: -1, z: 0 });
    expect(stopped.fighter.velocity).toEqual({ x: 0, z: 0 });
  });

  it('keeps facing a unit vector for partial input', () => {
    const moved = step(createArenaState(), { x: 0.2, z: 0.2 });
    expect(Math.hypot(moved.fighter.facing.x, moved.fighter.facing.z)).toBeCloseTo(1, 12);
  });
});

describe('bounds', () => {
  it('cannot be pushed off any edge of the floor', () => {
    const corners: MoveInput[] = [
      { x: 1, z: 1 },
      { x: -1, z: -1 },
      { x: 1, z: -1 },
      { x: -1, z: 1 },
    ];
    for (const input of corners) {
      const end = runTicks(createArenaState(), repeat(input, 60 * 30));
      const { position, radius } = end.fighter;
      expect(position.x).toBeGreaterThanOrEqual(ARENA_BOUNDS.minX + radius - 1e-9);
      expect(position.x).toBeLessThanOrEqual(ARENA_BOUNDS.maxX - radius + 1e-9);
      expect(position.z).toBeGreaterThanOrEqual(ARENA_BOUNDS.minZ + radius - 1e-9);
      expect(position.z).toBeLessThanOrEqual(ARENA_BOUNDS.maxZ - radius + 1e-9);
      expect(isAtBounds(end)).toBe(true);
    }
  });

  it('reports zero velocity while pressed into a wall and still slides along it', () => {
    const pinned = runTicks(createArenaState(), repeat({ x: 1, z: 0 }, 60 * 10));
    expect(pinned.fighter.velocity.x).toBeCloseTo(0, 10);
    const sliding = step(pinned, { x: 1, z: 1 });
    expect(sliding.fighter.position.z).toBeGreaterThan(pinned.fighter.position.z);
    expect(sliding.fighter.position.x).toBeCloseTo(pinned.fighter.position.x, 12);
  });

  it('respects custom bounds', () => {
    const bounds = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    const end = runTicks(createArenaState({ bounds }), repeat({ x: -1, z: -1 }, 600));
    expect(end.fighter.position.x).toBeCloseTo(-1 + FIGHTER_RADIUS, 10);
    expect(end.fighter.position.z).toBeCloseTo(-1 + FIGHTER_RADIUS, 10);
  });
});

describe('determinism', () => {
  const script: MoveInput[] = Array.from({ length: 600 }, (_, tick) => ({
    x: Math.sin(tick / 9),
    z: Math.cos(tick / 13),
  }));

  it('produces an identical end state for the same input sequence', () => {
    const first = runTicks(createArenaState(), script);
    const second = runTicks(createArenaState(), script);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('diverges only when the input sequence differs', () => {
    const changed = script.map((input, index) => (index === 42 ? { x: -input.x, z: input.z } : input));
    expect(runTicks(createArenaState(), changed)).not.toEqual(runTicks(createArenaState(), script));
  });

  it('is unaffected by how the ticks are batched', () => {
    const inOneGo = runTicks(createArenaState(), script);
    const inChunks = [script.slice(0, 137), script.slice(137, 400), script.slice(400)]
      .reduce((state, chunk) => runTicks(state, chunk), createArenaState());
    expect(inChunks).toEqual(inOneGo);
  });
});
