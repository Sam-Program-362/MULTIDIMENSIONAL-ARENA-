import { describe, expect, it } from 'vitest';
import { JOYSTICK_TUNING, deadZoneRadius, fullSpeedRadius, joystickInput, joystickKnobOffset, joystickMagnitude, step, createArenaState } from '../src/sim';

const BASE = 60;
const FULL = fullSpeedRadius(BASE);
const DEAD = deadZoneRadius(BASE);
const magnitudeOf = (v: { x: number; z: number }) => Math.hypot(v.x, v.z);

describe('joystick tuning constants', () => {
  it('reaches full speed at (or just inside) the visible base circle', () => {
    expect(JOYSTICK_TUNING.fullSpeedRadiusRatio).toBeGreaterThanOrEqual(0.9);
    expect(JOYSTICK_TUNING.fullSpeedRadiusRatio).toBeLessThanOrEqual(1);
    expect(FULL).toBeLessThanOrEqual(BASE);
  });
  it('uses a small dead zone of roughly 8-10% of the full-speed radius', () => {
    expect(JOYSTICK_TUNING.deadZoneRatio).toBeGreaterThanOrEqual(0.05);
    expect(JOYSTICK_TUNING.deadZoneRatio).toBeLessThanOrEqual(0.12);
    expect(DEAD).toBeCloseTo(FULL * JOYSTICK_TUNING.deadZoneRatio, 10);
  });
  it('keeps the pad off the screen corner with an extra margin of 24-40px', () => {
    expect(JOYSTICK_TUNING.extraMarginPx).toBeGreaterThanOrEqual(24);
    expect(JOYSTICK_TUNING.extraMarginPx).toBeLessThanOrEqual(40);
  });
});

describe('joystick dead zone', () => {
  it('returns zero for a zero-length drag', () => expect(joystickInput(0, 0, BASE)).toEqual({ x: 0, z: 0 }));
  it('returns zero anywhere inside the dead zone', () => {
    for (const d of [0.001, DEAD * 0.5, DEAD * 0.9, DEAD * 0.99]) {
      expect(magnitudeOf(joystickInput(d, 0, BASE))).toBe(0);
      expect(magnitudeOf(joystickInput(-d, 0, BASE))).toBe(0);
      expect(magnitudeOf(joystickInput(0, d, BASE))).toBe(0);
      expect(magnitudeOf(joystickInput(-d * Math.SQRT1_2, d * Math.SQRT1_2, BASE))).toBe(0);
    }
  });
  it('is zero at the dead zone boundary itself', () => {
    expect(magnitudeOf(joystickInput(DEAD, 0, BASE))).toBe(0);
    expect(magnitudeOf(joystickInput(0, -DEAD, BASE))).toBe(0);
    // A diagonal of the same length can land a float ulp outside the boundary; it must still be silent.
    expect(magnitudeOf(joystickInput(DEAD * Math.SQRT1_2, DEAD * Math.SQRT1_2, BASE))).toBeLessThan(1e-12);
  });
  it('produces a small but non-zero magnitude just outside the dead zone', () => {
    const magnitude = magnitudeOf(joystickInput(DEAD * 1.05, 0, BASE));
    expect(magnitude).toBeGreaterThan(0);
    expect(magnitude).toBeLessThan(0.1);
  });
});

describe('joystick analog response', () => {
  it('gives about half magnitude halfway between the dead zone and the full radius', () => {
    const halfway = DEAD + (FULL - DEAD) / 2;
    expect(magnitudeOf(joystickInput(halfway, 0, BASE))).toBeCloseTo(0.5, 10);
    expect(magnitudeOf(joystickInput(0, -halfway, BASE))).toBeCloseTo(0.5, 10);
  });
  it('scales linearly and monotonically across the travel', () => {
    const quarter = DEAD + (FULL - DEAD) * 0.25;
    const threeQuarters = DEAD + (FULL - DEAD) * 0.75;
    expect(magnitudeOf(joystickInput(quarter, 0, BASE))).toBeCloseTo(0.25, 10);
    expect(magnitudeOf(joystickInput(threeQuarters, 0, BASE))).toBeCloseTo(0.75, 10);
    let previous = 0;
    for (let d = DEAD; d <= FULL; d += (FULL - DEAD) / 20) {
      const magnitude = magnitudeOf(joystickInput(d, 0, BASE));
      expect(magnitude).toBeGreaterThanOrEqual(previous);
      previous = magnitude;
    }
  });
  it('is not quadratic: a half-radius drag is far more than a quarter of full speed', () => {
    expect(magnitudeOf(joystickInput(FULL / 2, 0, BASE))).toBeGreaterThan(0.4);
  });
});

describe('joystick full speed', () => {
  it('is exactly 1 at the full-speed radius', () => {
    expect(magnitudeOf(joystickInput(FULL, 0, BASE))).toBeCloseTo(1, 10);
    expect(joystickMagnitude(FULL, BASE)).toBe(1);
  });
  it('is exactly 1 at the visible circle edge and beyond, preserving direction', () => {
    for (const d of [BASE, BASE * 2, 10000]) {
      const v = joystickInput(d * Math.SQRT1_2, d * Math.SQRT1_2, BASE);
      expect(magnitudeOf(v)).toBeCloseTo(1, 10);
      expect(v.x).toBeCloseTo(Math.SQRT1_2, 10);
      expect(v.z).toBeCloseTo(Math.SQRT1_2, 10);
    }
  });
  it('never exceeds magnitude 1 for diagonal drags of any size', () => {
    for (const [dx, dy] of [[FULL, FULL], [BASE, BASE], [30, 70], [-500, 900], [FULL * 0.7, FULL * 0.7]]) {
      expect(magnitudeOf(joystickInput(dx, dy, BASE))).toBeLessThanOrEqual(1 + 1e-12);
    }
  });
});

describe('joystick direction', () => {
  it('maps the four axes to the correct movement directions', () => {
    const right = joystickInput(FULL, 0, BASE), left = joystickInput(-FULL, 0, BASE);
    const down = joystickInput(0, FULL, BASE), up = joystickInput(0, -FULL, BASE);
    expect(right).toEqual({ x: 1, z: 0 }); expect(left).toEqual({ x: -1, z: 0 });
    expect(down.z).toBeCloseTo(1, 10); expect(down.x).toBe(0);
    expect(up.z).toBeCloseTo(-1, 10); expect(up.x).toBe(0);
  });
  it('preserves the drag angle at partial magnitude', () => {
    const halfway = DEAD + (FULL - DEAD) / 2;
    const v = joystickInput(halfway * Math.cos(Math.PI / 6), halfway * Math.sin(Math.PI / 6), BASE);
    expect(Math.atan2(v.z, v.x)).toBeCloseTo(Math.PI / 6, 10);
  });
  it('feeds the simulation a proportionally slower velocity for small drags', () => {
    const halfway = DEAD + (FULL - DEAD) / 2;
    const slow = step(createArenaState(), joystickInput(halfway, 0, BASE));
    const fast = step(createArenaState(), joystickInput(BASE * 3, 0, BASE));
    expect(slow.position.x).toBeGreaterThan(0);
    expect(slow.position.x).toBeCloseTo(fast.position.x / 2, 10);
  });
});

describe('joystick knob position', () => {
  const TRAVEL = 35;
  it('stays at the centre for a zero-length drag', () => expect(joystickKnobOffset(0, 0, BASE, TRAVEL)).toEqual({ x: 0, y: 0 }));
  it('is clamped to the base circle edge at and beyond the full radius', () => {
    for (const d of [FULL, BASE, BASE * 4, 99999]) {
      const knob = joystickKnobOffset(d, 0, BASE, TRAVEL);
      expect(Math.hypot(knob.x, knob.y)).toBeCloseTo(TRAVEL, 10);
      expect(knob.x).toBeGreaterThan(0);
    }
  });
  it('never leaves the base circle for diagonal or very large drags', () => {
    for (const [dx, dy] of [[FULL, FULL], [1e6, -1e6], [20, 15]]) {
      expect(Math.hypot(...Object.values(joystickKnobOffset(dx, dy, BASE, TRAVEL)))).toBeLessThanOrEqual(TRAVEL + 1e-9);
    }
  });
  it('tracks the thumb proportionally inside the circle and keeps the drag direction', () => {
    const knob = joystickKnobOffset(0, -FULL / 2, BASE, TRAVEL);
    expect(knob.y).toBeCloseTo(-TRAVEL / 2, 10);
    expect(knob.x).toBe(0);
  });
});

describe('joystick edge cases', () => {
  it('handles non-finite input without producing NaN', () => {
    for (const [dx, dy] of [[NaN, 0], [0, Infinity], [-Infinity, NaN]]) {
      expect(joystickInput(dx, dy, BASE)).toEqual({ x: 0, z: 0 });
      expect(joystickKnobOffset(dx, dy, BASE, 35)).toEqual({ x: 0, y: 0 });
    }
  });
  it('falls back to the default base radius when the measured radius is unusable', () => {
    for (const radius of [0, -10, NaN]) {
      expect(fullSpeedRadius(radius)).toBeCloseTo(JOYSTICK_TUNING.defaultBaseRadius * JOYSTICK_TUNING.fullSpeedRadiusRatio, 10);
      expect(magnitudeOf(joystickInput(1000, 0, radius))).toBeCloseTo(1, 10);
    }
  });
  it('behaves consistently for the smaller pad used on compact or landscape screens', () => {
    for (const radius of [50, 54, 60, 72]) {
      const full = fullSpeedRadius(radius);
      const dead = deadZoneRadius(radius);
      expect(full).toBeLessThanOrEqual(radius);
      expect(magnitudeOf(joystickInput(dead, 0, radius))).toBe(0);
      expect(magnitudeOf(joystickInput(dead + (full - dead) / 2, 0, radius))).toBeCloseTo(0.5, 10);
      expect(magnitudeOf(joystickInput(radius, 0, radius))).toBeCloseTo(1, 10);
    }
  });
});
