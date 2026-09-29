import { describe, expect, it } from 'vitest';
import { advanceAccumulator, createArenaState, MAX_CATCH_UP_TICKS, step, TICK_SECONDS, TICKS_PER_SECOND } from '../src/sim';

describe('fixed-timestep accumulator', () => {
  it('runs one tick per tick-length of elapsed time', () => {
    const plan = advanceAccumulator(0, TICK_SECONDS);
    expect(plan.ticks).toBe(1);
    expect(plan.droppedTicks).toBe(0);
    expect(plan.accumulator).toBeCloseTo(0, 12);
  });

  it('runs no ticks for a frame shorter than one tick and carries the remainder', () => {
    const plan = advanceAccumulator(0, TICK_SECONDS / 2);
    expect(plan.ticks).toBe(0);
    expect(plan.accumulator).toBeCloseTo(TICK_SECONDS / 2, 12);
  });

  it('adds carried time to the new frame', () => {
    const first = advanceAccumulator(0, TICK_SECONDS * 0.75);
    expect(first.ticks).toBe(0);
    const second = advanceAccumulator(first.accumulator, TICK_SECONDS * 0.75);
    expect(second.ticks).toBe(1);
    expect(second.accumulator).toBeCloseTo(TICK_SECONDS * 0.5, 12);
  });

  it('runs 60 ticks across a second of 60 fps frames, with no drift', () => {
    let accumulator = 0;
    let ticks = 0;
    for (let frame = 0; frame < TICKS_PER_SECOND; frame += 1) {
      const plan = advanceAccumulator(accumulator, 1 / 60);
      accumulator = plan.accumulator;
      ticks += plan.ticks;
      expect(plan.droppedTicks).toBe(0);
    }
    expect(ticks).toBe(60);
  });

  it('runs two ticks per frame on a 30 fps display', () => {
    let accumulator = 0;
    let ticks = 0;
    for (let frame = 0; frame < 30; frame += 1) {
      const plan = advanceAccumulator(accumulator, 1 / 30);
      accumulator = plan.accumulator;
      ticks += plan.ticks;
    }
    expect(ticks).toBe(60);
  });

  it('caps catch-up after a long stall and reports what was dropped', () => {
    const plan = advanceAccumulator(0, 30); // e.g. the tab was hidden for half a minute
    expect(plan.ticks).toBe(MAX_CATCH_UP_TICKS);
    expect(plan.droppedTicks).toBe(30 * TICKS_PER_SECOND - MAX_CATCH_UP_TICKS);
    expect(plan.accumulator).toBeLessThan(TICK_SECONDS);
  });

  it('does not let a stall pile up into later frames', () => {
    const stalled = advanceAccumulator(0, 10);
    const next = advanceAccumulator(stalled.accumulator, TICK_SECONDS);
    expect(next.ticks).toBe(1);
    expect(next.droppedTicks).toBe(0);
  });

  it('honours a custom tick length and cap', () => {
    const plan = advanceAccumulator(0, 1, { tickSeconds: 0.1, maxTicks: 3 });
    expect(plan.ticks).toBe(3);
    expect(plan.droppedTicks).toBe(7);
    const uncapped = advanceAccumulator(0, 1, { tickSeconds: 0.1, maxTicks: 100 });
    expect(uncapped.ticks).toBe(10);
  });

  it('ignores negative, zero, and non-finite elapsed time', () => {
    for (const elapsed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const plan = advanceAccumulator(0, elapsed);
      expect(plan.ticks).toBe(0);
      expect(plan.accumulator).toBe(0);
    }
    expect(advanceAccumulator(Number.NaN, TICK_SECONDS).ticks).toBe(1);
  });

  it('keeps simulation time proportional to real time at any frame rate', () => {
    const run = (frameSeconds: number, frames: number) => {
      let accumulator = 0;
      let state = createArenaState();
      for (let frame = 0; frame < frames; frame += 1) {
        const plan = advanceAccumulator(accumulator, frameSeconds);
        accumulator = plan.accumulator;
        for (let index = 0; index < plan.ticks; index += 1) state = step(state, { x: 1, z: 0 });
      }
      return state;
    };
    const sixty = run(1 / 60, 60);
    const thirty = run(1 / 30, 30);
    expect(sixty.tick).toBe(60);
    expect(thirty.tick).toBe(60);
    expect(thirty.fighter.position.x).toBeCloseTo(sixty.fighter.position.x, 12);
  });
});
