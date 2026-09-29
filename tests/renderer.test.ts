import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS, createArenaState, runTicks, step } from '../src/sim';
import { collectSprites, renderArena } from '../src/render';

/**
 * The renderer is exercised through a recording stand-in for the canvas context, so
 * drawing can be checked in Node: it must never throw and must never emit NaN
 * coordinates, which is how a canvas silently renders nothing.
 */
interface Call {
  method: string;
  args: number[];
}

function fakeContext() {
  const calls: Call[] = [];
  const gradient = { addColorStop: () => {} };
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args: args.filter((value): value is number => typeof value === 'number') });
    return undefined;
  };
  const context = {
    calls,
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    lineWidth: 0,
    createLinearGradient: (...args: number[]) => { calls.push({ method: 'createLinearGradient', args }); return gradient; },
    createRadialGradient: (...args: number[]) => { calls.push({ method: 'createRadialGradient', args }); return gradient; },
    fillRect: record('fillRect'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    quadraticCurveTo: record('quadraticCurveTo'),
    arc: record('arc'),
    ellipse: record('ellipse'),
    fill: record('fill'),
    stroke: record('stroke'),
    clip: record('clip'),
    save: record('save'),
    restore: record('restore'),
    setTransform: record('setTransform'),
  };
  return context;
}

const viewports = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 900 },
];

describe('arena renderer', () => {
  it.each(viewports)('draws a frame with finite coordinates at $width x $height', (viewport) => {
    const context = fakeContext();
    const state = runTicks(createArenaState(), Array.from({ length: 45 }, () => ({ x: 0.7, z: -0.4 })));
    expect(() => renderArena(context as unknown as CanvasRenderingContext2D, state, viewport)).not.toThrow();
    for (const call of context.calls) {
      for (const value of call.args) expect(Number.isFinite(value), `${call.method} received ${value}`).toBe(true);
    }
    expect(context.calls.filter((call) => call.method === 'fill').length).toBeGreaterThan(5);
    expect(context.calls.some((call) => call.method === 'stroke')).toBe(true);
  });

  it('survives a zero-sized canvas and a fighter pinned to a wall', () => {
    const context = fakeContext();
    const pinned = runTicks(createArenaState(), Array.from({ length: 600 }, () => ({ x: -1, z: 1 })));
    expect(() => renderArena(context as unknown as CanvasRenderingContext2D, pinned, { width: 0, height: 0 })).not.toThrow();
    for (const call of context.calls) {
      for (const value of call.args) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('paints a shadow under the fighter', () => {
    const context = fakeContext();
    renderArena(context as unknown as CanvasRenderingContext2D, createArenaState(), { width: 390, height: 844 });
    // One shadow ellipse per sprite: four posts plus the fighter.
    expect(context.calls.filter((call) => call.method === 'ellipse').length).toBeGreaterThanOrEqual(5);
  });

  it('depth sorts sprites from far to near', () => {
    const near = collectSprites(createArenaState({ position: { x: 0, z: ARENA_BOUNDS.maxZ } }));
    expect(near.map((sprite) => sprite.z)).toEqual([...near.map((sprite) => sprite.z)].sort((a, b) => a - b));
    expect(near[near.length - 1].kind).toBe('fighter');

    const far = collectSprites(createArenaState({ position: { x: 0, z: ARENA_BOUNDS.minZ } }));
    expect(far[0].kind).toBe('fighter');

    const middle = collectSprites(createArenaState());
    expect(middle.findIndex((sprite) => sprite.kind === 'fighter')).toBe(2);
  });

  it('follows the simulation rather than keeping its own state', () => {
    const start = createArenaState();
    const moved = step(start, { x: 1, z: 0 });
    const spriteOf = (state: typeof start) => collectSprites(state).find((sprite) => sprite.kind === 'fighter')!;
    expect(spriteOf(moved).x).toBeGreaterThan(spriteOf(start).x);
  });
});
