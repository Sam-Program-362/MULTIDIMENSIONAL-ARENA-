/**
 * Fixed-timestep helpers (decision 003).
 *
 * Pure time math: no rendering, no timers, no browser APIs. A frame loop hands the
 * accumulator the real elapsed time and is told how many simulation ticks to run.
 */

/** Simulation rate. The simulation always advances in whole ticks of this length. */
export const TICKS_PER_SECOND = 60;
export const TICK_SECONDS = 1 / TICKS_PER_SECOND;

/**
 * Most ticks a single frame may run. Without a cap, a long stall (a hidden tab, a slow
 * device) queues up so much work that each frame falls further behind: the spiral of death.
 * Ticks beyond the cap are discarded rather than carried over.
 */
export const MAX_CATCH_UP_TICKS = 5;

export interface TimestepOptions {
  /** Length of one tick in seconds. Defaults to {@link TICK_SECONDS}. */
  tickSeconds?: number;
  /** Catch-up cap for this frame. Defaults to {@link MAX_CATCH_UP_TICKS}. */
  maxTicks?: number;
}

export interface TimestepPlan {
  /** How many ticks the caller should run now. */
  ticks: number;
  /** Sub-tick remainder to carry into the next frame. */
  accumulator: number;
  /** Ticks that were owed but dropped because of the catch-up cap. */
  droppedTicks: number;
}

/** Guards against NaN, Infinity, and negative clocks. */
function positiveOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Pure accumulator step. Given the carried remainder and the real time since the last
 * frame, returns how many fixed ticks to run and what to carry forward.
 */
export function advanceAccumulator(
  accumulator: number,
  elapsedSeconds: number,
  options: TimestepOptions = {},
): TimestepPlan {
  const tickSeconds = positiveOrZero(options.tickSeconds ?? TICK_SECONDS) || TICK_SECONDS;
  const maxTicks = Number.isFinite(options.maxTicks)
    ? Math.max(0, Math.floor(options.maxTicks as number))
    : MAX_CATCH_UP_TICKS;
  const total = positiveOrZero(accumulator) + positiveOrZero(elapsedSeconds);
  // The epsilon keeps repeated exact-tick frames from drifting a tick behind.
  const owed = Math.floor(total / tickSeconds + 1e-9);
  const ticks = Math.min(owed, maxTicks);
  return {
    ticks,
    accumulator: Math.max(total - owed * tickSeconds, 0),
    droppedTicks: owed - ticks,
  };
}
