import type { MoveInput } from '../sim';

/** WASD / arrow-key movement for desktop testing. */

export interface KeyboardInput {
  value(): MoveInput;
  isActive(): boolean;
  destroy(): void;
}

const AXES: Record<string, MoveInput> = {
  arrowup: { x: 0, z: -1 },
  arrowdown: { x: 0, z: 1 },
  arrowleft: { x: -1, z: 0 },
  arrowright: { x: 1, z: 0 },
  w: { x: 0, z: -1 },
  s: { x: 0, z: 1 },
  a: { x: -1, z: 0 },
  d: { x: 1, z: 0 },
};

export function createKeyboardInput(): KeyboardInput {
  const pressed = new Set<string>();

  function onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (!AXES[key] || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault(); // arrows would otherwise scroll the page
    pressed.add(key);
  }

  function onKeyUp(event: KeyboardEvent): void {
    pressed.delete(event.key.toLowerCase());
  }

  function clear(): void {
    pressed.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clear);

  return {
    value() {
      let x = 0;
      let z = 0;
      for (const key of pressed) {
        x += AXES[key].x;
        z += AXES[key].z;
      }
      // Opposite keys cancel; the simulation normalises the rest.
      return { x: Math.max(-1, Math.min(1, x)), z: Math.max(-1, Math.min(1, z)) };
    },
    isActive: () => pressed.size > 0,
    destroy() {
      clear();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
    },
  };
}
