import type { MovementInput } from './arena';

/**
 * Joystick tuning constants.
 *
 * All radii are expressed as ratios of the *visible* base circle radius, which is measured
 * from the rendered pad by the UI layer and passed in. That keeps the felt full-speed distance
 * identical to the drawn circle at every screen size.
 */
export const JOYSTICK_TUNING = {
  /** Full speed is reached at this fraction of the visible base circle radius. */
  fullSpeedRadiusRatio: 0.95,
  /** Ignored wobble around the centre, as a fraction of the full-speed radius. */
  deadZoneRatio: 0.09,
  /** Base circle radius (px) used when the UI layer cannot measure one. */
  defaultBaseRadius: 60,
  /** Inset (px) applied to the pad *in addition* to the safe-area margin, keeping it off the corner. */
  extraMarginPx: 32,
} as const;

const safeRadius = (baseRadius: number): number =>
  Number.isFinite(baseRadius) && baseRadius > 0 ? baseRadius : JOYSTICK_TUNING.defaultBaseRadius;

/** Drag distance (px) at which the output reaches magnitude 1. */
export function fullSpeedRadius(baseRadius: number = JOYSTICK_TUNING.defaultBaseRadius): number {
  return safeRadius(baseRadius) * JOYSTICK_TUNING.fullSpeedRadiusRatio;
}

/** Drag distance (px) below which the output is zero. */
export function deadZoneRadius(baseRadius: number = JOYSTICK_TUNING.defaultBaseRadius): number {
  return fullSpeedRadius(baseRadius) * JOYSTICK_TUNING.deadZoneRatio;
}

/**
 * Analog magnitude for a drag distance: 0 inside the dead zone, rising linearly to exactly 1
 * at the full-speed radius, and staying at 1 for any larger drag.
 */
export function joystickMagnitude(distance: number, baseRadius: number = JOYSTICK_TUNING.defaultBaseRadius): number {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  const full = fullSpeedRadius(baseRadius);
  const dead = deadZoneRadius(baseRadius);
  if (distance <= dead) return 0;
  if (full <= dead) return 1;
  return Math.min(1, (distance - dead) / (full - dead));
}

/**
 * Map a joystick drag offset (px, screen axes: +x right, +y down) to a movement vector
 * (+x right, +z away from the camera) with magnitude 0..1. Pure: no rendering dependencies.
 */
export function joystickInput(
  dx: number,
  dy: number,
  baseRadius: number = JOYSTICK_TUNING.defaultBaseRadius,
): MovementInput {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 0, z: 0 };
  const distance = Math.hypot(dx, dy);
  const magnitude = joystickMagnitude(distance, baseRadius);
  if (magnitude <= 0) return { x: 0, z: 0 };
  return { x: (dx / distance) * magnitude, z: (dy / distance) * magnitude };
}

/**
 * Visual knob offset (px) for a drag offset, clamped so the knob never leaves the base circle.
 * `travel` is the maximum distance the knob centre may move (base radius minus knob radius).
 */
export function joystickKnobOffset(
  dx: number,
  dy: number,
  baseRadius: number = JOYSTICK_TUNING.defaultBaseRadius,
  travel = safeRadius(baseRadius),
): { x: number; y: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 0, y: 0 };
  const distance = Math.hypot(dx, dy);
  if (distance <= 0) return { x: 0, y: 0 };
  const limit = Math.max(0, travel);
  const reach = Math.min(distance, fullSpeedRadius(baseRadius)) / fullSpeedRadius(baseRadius);
  return { x: (dx / distance) * reach * limit, y: (dy / distance) * reach * limit };
}
