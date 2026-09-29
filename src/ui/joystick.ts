import type { MoveInput } from '../sim';

/**
 * Virtual joystick built on pointer events, so mouse, pen, and touch all work.
 *
 * The pad captures the pointer that grabbed it, which means a drag that leaves the pad
 * keeps steering and a release anywhere still resets the stick. A second finger on the
 * screen is ignored while one is already steering.
 */

export interface JoystickOptions {
  /** Fraction of the travel distance ignored around the centre. */
  deadzone?: number;
}

export interface Joystick {
  /** Current movement vector; x/z are each -1..1 and the length never exceeds 1. */
  value(): MoveInput;
  isActive(): boolean;
  destroy(): void;
}

const DEFAULT_DEADZONE = 0.14;

export function createJoystick(pad: HTMLElement, thumb: HTMLElement, options: JoystickOptions = {}): Joystick {
  const deadzone = Math.min(Math.max(options.deadzone ?? DEFAULT_DEADZONE, 0), 0.9);
  let pointerId: number | null = null;
  let travel = 1;
  let centerX = 0;
  let centerY = 0;
  let vector: MoveInput = { x: 0, z: 0 };

  function measure(): void {
    const rect = pad.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    travel = Math.max(rect.width / 2 - thumb.getBoundingClientRect().width / 2, 12);
  }

  function update(clientX: number, clientY: number): void {
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-4) {
      vector = { x: 0, z: 0 };
      thumb.style.transform = 'translate(0px, 0px)';
      return;
    }
    const magnitude = Math.min(distance / travel, 1);
    const unitX = dx / distance;
    const unitY = dy / distance;
    thumb.style.transform = `translate(${unitX * travel * magnitude}px, ${unitY * travel * magnitude}px)`;
    const scaled = magnitude <= deadzone ? 0 : (magnitude - deadzone) / (1 - deadzone);
    // Screen y maps to arena z: pushing up walks into the screen.
    vector = { x: unitX * scaled, z: unitY * scaled };
  }

  function release(): void {
    if (pointerId !== null && pad.hasPointerCapture?.(pointerId)) pad.releasePointerCapture(pointerId);
    pointerId = null;
    vector = { x: 0, z: 0 };
    thumb.style.transform = 'translate(0px, 0px)';
    pad.classList.remove('is-active');
  }

  function onPointerDown(event: PointerEvent): void {
    if (pointerId !== null) return; // already steering with another finger
    event.preventDefault();
    pointerId = event.pointerId;
    pad.classList.add('is-active');
    pad.setPointerCapture?.(event.pointerId);
    measure();
    update(event.clientX, event.clientY);
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    update(event.clientX, event.clientY);
  }

  function onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;
    release();
  }

  pad.addEventListener('pointerdown', onPointerDown);
  pad.addEventListener('pointermove', onPointerMove);
  pad.addEventListener('pointerup', onPointerEnd);
  pad.addEventListener('pointercancel', onPointerEnd);
  // Safety nets: capture can be lost, and a release can land outside the pad.
  pad.addEventListener('lostpointercapture', onPointerEnd);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);
  window.addEventListener('blur', release);

  return {
    value: () => vector,
    isActive: () => pointerId !== null,
    destroy() {
      release();
      pad.removeEventListener('pointerdown', onPointerDown);
      pad.removeEventListener('pointermove', onPointerMove);
      pad.removeEventListener('pointerup', onPointerEnd);
      pad.removeEventListener('pointercancel', onPointerEnd);
      pad.removeEventListener('lostpointercapture', onPointerEnd);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      window.removeEventListener('blur', release);
    },
  };
}
