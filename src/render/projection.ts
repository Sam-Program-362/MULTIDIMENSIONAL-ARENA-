import type { ArenaBounds } from '../sim';

/**
 * 2.5D projection maths for the arena view.
 *
 * Pure geometry, no canvas calls, so it can be unit tested. The floor is drawn as a
 * ground plane seen from a raised camera: depth (z) squashes vertically and things
 * closer to the viewer are drawn slightly larger, which gives the angled-plane look
 * without any 3D library.
 */

/** A point in arena space. `y` is height above the floor, in floor units. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface Viewport {
  /** CSS pixels. */
  width: number;
  height: number;
}

export interface Camera {
  /** Screen position of arena (0, 0) on the floor. */
  originX: number;
  originY: number;
  /** Screen pixels per floor unit before depth scaling. */
  unit: number;
  /** How much depth is flattened vertically. 1 = top-down, 0 = edge on. */
  squash: number;
  nearScale: number;
  farScale: number;
  minZ: number;
  maxZ: number;
  centerZ: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Depth scale applied at this point; multiply sizes by `unit * scale`. */
  scale: number;
}

/** Size multiplier at the near and far edge of the floor. */
export const NEAR_SCALE = 1.12;
export const FAR_SCALE = 0.74;
/** Flattest and steepest allowed tilt; the camera picks a value between them to fit. */
export const MIN_SQUASH = 0.34;
export const MAX_SQUASH = 0.8;
/** Fractions of the viewport the floor is allowed to occupy. */
const USABLE_WIDTH = 0.94;
const USABLE_HEIGHT = 0.66;
/** Floor centre sits slightly above the middle, leaving room for the on-screen controls. */
const HORIZON_BIAS = 0.46;

const clamp = (value: number, low: number, high: number): number =>
  !Number.isFinite(value) ? low : value < low ? low : value > high ? high : value;

/** Builds a camera that fits the whole floor into the viewport. */
export function createCamera(viewport: Viewport, bounds: ArenaBounds): Camera {
  const width = Math.max(viewport.width, 1);
  const height = Math.max(viewport.height, 1);
  const arenaWidth = Math.max(bounds.maxX - bounds.minX, 0.001);
  const arenaDepth = Math.max(bounds.maxZ - bounds.minZ, 0.001);
  const usableWidth = width * USABLE_WIDTH;
  const usableHeight = height * USABLE_HEIGHT;
  // Fit the widest (nearest) row horizontally, and the deepest floor vertically even at
  // the flattest tilt. Whichever is tighter decides the scale.
  const unit = Math.min(usableWidth / (arenaWidth * NEAR_SCALE), usableHeight / (arenaDepth * MIN_SQUASH));
  return {
    originX: width / 2,
    originY: height * HORIZON_BIAS,
    unit,
    squash: clamp(usableHeight / (arenaDepth * unit), MIN_SQUASH, MAX_SQUASH),
    nearScale: NEAR_SCALE,
    farScale: FAR_SCALE,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
  };
}

/** Size multiplier for a given depth: larger near the viewer, smaller far away. */
export function depthScale(z: number, camera: Camera): number {
  const span = camera.maxZ - camera.minZ;
  const t = span === 0 ? 0.5 : clamp((z - camera.minZ) / span, 0, 1);
  return camera.farScale + (camera.nearScale - camera.farScale) * t;
}

/** Projects an arena point to screen space. */
export function project(point: Point3, camera: Camera): Projected {
  const scale = depthScale(point.z, camera);
  return {
    x: camera.originX + point.x * camera.unit * scale,
    y: camera.originY + (point.z - camera.centerZ) * camera.unit * camera.squash - point.y * camera.unit * scale,
    scale,
  };
}

/** Projects a point lying flat on the floor. */
export function projectFloor(x: number, z: number, camera: Camera): Projected {
  return project({ x, y: 0, z }, camera);
}

/** Painter's-algorithm comparator: far (small z) first, near (large z) last. */
export function byDepth(a: { z: number }, b: { z: number }): number {
  return a.z - b.z;
}
