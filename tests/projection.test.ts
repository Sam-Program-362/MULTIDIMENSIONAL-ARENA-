import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS } from '../src/sim';
import { byDepth, createCamera, depthScale, MAX_SQUASH, MIN_SQUASH, project, projectFloor } from '../src/render/projection';

const viewports = [
  { name: 'small phone', width: 360, height: 640 },
  { name: 'tall phone', width: 390, height: 844 },
  { name: 'landscape phone', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'degenerate', width: 0, height: 0 },
];

describe('2.5D projection', () => {
  it.each(viewports)('keeps the whole floor on screen ($name)', (viewport) => {
    const camera = createCamera(viewport, ARENA_BOUNDS);
    const corners = [
      projectFloor(ARENA_BOUNDS.minX, ARENA_BOUNDS.minZ, camera),
      projectFloor(ARENA_BOUNDS.maxX, ARENA_BOUNDS.minZ, camera),
      projectFloor(ARENA_BOUNDS.minX, ARENA_BOUNDS.maxZ, camera),
      projectFloor(ARENA_BOUNDS.maxX, ARENA_BOUNDS.maxZ, camera),
    ];
    for (const corner of corners) {
      expect(Number.isFinite(corner.x) && Number.isFinite(corner.y)).toBe(true);
      expect(corner.x).toBeGreaterThanOrEqual(0);
      expect(corner.x).toBeLessThanOrEqual(Math.max(viewport.width, 1));
      expect(corner.y).toBeGreaterThanOrEqual(0);
      expect(corner.y).toBeLessThanOrEqual(Math.max(viewport.height, 1));
    }
    expect(camera.squash).toBeGreaterThanOrEqual(MIN_SQUASH);
    expect(camera.squash).toBeLessThanOrEqual(MAX_SQUASH);
  });

  it('draws the near edge wider than the far edge, so the plane looks angled', () => {
    const camera = createCamera({ width: 390, height: 844 }, ARENA_BOUNDS);
    const farWidth = projectFloor(ARENA_BOUNDS.maxX, ARENA_BOUNDS.minZ, camera).x - projectFloor(ARENA_BOUNDS.minX, ARENA_BOUNDS.minZ, camera).x;
    const nearWidth = projectFloor(ARENA_BOUNDS.maxX, ARENA_BOUNDS.maxZ, camera).x - projectFloor(ARENA_BOUNDS.minX, ARENA_BOUNDS.maxZ, camera).x;
    expect(nearWidth).toBeGreaterThan(farWidth);
  });

  it('scales depth from the far edge to the near edge', () => {
    const camera = createCamera({ width: 390, height: 844 }, ARENA_BOUNDS);
    expect(depthScale(ARENA_BOUNDS.minZ, camera)).toBeCloseTo(camera.farScale, 12);
    expect(depthScale(ARENA_BOUNDS.maxZ, camera)).toBeCloseTo(camera.nearScale, 12);
    expect(depthScale(0, camera)).toBeGreaterThan(camera.farScale);
    expect(depthScale(0, camera)).toBeLessThan(camera.nearScale);
    // Out of range values are clamped rather than extrapolated.
    expect(depthScale(-1000, camera)).toBeCloseTo(camera.farScale, 12);
    expect(depthScale(1000, camera)).toBeCloseTo(camera.nearScale, 12);
  });

  it('moves points down the screen as they come toward the viewer', () => {
    const camera = createCamera({ width: 390, height: 844 }, ARENA_BOUNDS);
    expect(projectFloor(0, ARENA_BOUNDS.maxZ, camera).y).toBeGreaterThan(projectFloor(0, ARENA_BOUNDS.minZ, camera).y);
  });

  it('lifts height above the floor point it stands on', () => {
    const camera = createCamera({ width: 390, height: 844 }, ARENA_BOUNDS);
    const feet = project({ x: 1, y: 0, z: 2 }, camera);
    const head = project({ x: 1, y: 1.8, z: 2 }, camera);
    expect(head.y).toBeLessThan(feet.y);
    expect(head.x).toBeCloseTo(feet.x, 12);
  });

  it('sorts sprites far to near', () => {
    const sprites = [{ z: 3 }, { z: -4 }, { z: 0 }];
    expect([...sprites].sort(byDepth)).toEqual([{ z: -4 }, { z: 0 }, { z: 3 }]);
  });
});
