import { advanceAccumulator, ArenaState, createArenaState, MoveInput, NO_INPUT, step } from '../sim';
import { renderArena, Viewport } from '../render';
import { escapeHtml } from './html';
import { createJoystick } from './joystick';
import { createKeyboardInput } from './keyboard';

/**
 * Arena screen: canvas, frame loop, and controls.
 *
 * The loop feeds real elapsed time to the fixed-timestep accumulator, runs whole
 * simulation ticks, then renders. Rendering never advances the simulation.
 */

export interface ArenaScreenOptions {
  fighterName: string;
  onLeave: () => void;
}

/** Mounts the screen into `root` and returns a teardown function. */
export function mountArenaScreen(root: HTMLElement, options: ArenaScreenOptions): () => void {
  root.innerHTML = `<main class="arena-screen" id="arena-screen">
    <canvas class="arena-canvas" id="arena-canvas"></canvas>
    <div class="arena-overlay">
      <header class="arena-bar">
        <button class="ghost" id="arena-leave">← Leave</button>
        <div class="arena-id"><span class="eyebrow">TRAINING FLOOR</span><strong>${escapeHtml(options.fighterName)}</strong></div>
      </header>
      <footer class="arena-controls">
        <div class="joystick" id="joystick"><span class="joystick-ring"></span><span class="joystick-thumb" id="joystick-thumb"></span></div>
        <div class="arena-status"><p class="arena-hint">Drag the pad, or use WASD / arrow keys.</p><p class="arena-readout" id="arena-readout">—</p></div>
      </footer>
    </div>
  </main>`;

  const screen = root.querySelector<HTMLElement>('#arena-screen')!;
  const canvas = root.querySelector<HTMLCanvasElement>('#arena-canvas')!;
  const pad = root.querySelector<HTMLElement>('#joystick')!;
  const thumb = root.querySelector<HTMLElement>('#joystick-thumb')!;
  const readout = root.querySelector<HTMLElement>('#arena-readout')!;
  const context = canvas.getContext('2d');

  const joystick = createJoystick(pad, thumb);
  const keyboard = createKeyboardInput();

  let state: ArenaState = createArenaState();
  let viewport: Viewport = { width: 1, height: 1 };
  let accumulator = 0;
  let lastFrame = 0;
  let frameHandle = 0;
  let framesSinceSample = 0;
  let lastSample = 0;
  let framesPerSecond = 0;

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    viewport = { width: Math.max(rect.width, 1), height: Math.max(rect.height, 1) };
    canvas.width = Math.round(viewport.width * ratio);
    canvas.height = Math.round(viewport.height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function currentInput(): MoveInput {
    if (joystick.isActive()) return joystick.value();
    if (keyboard.isActive()) return keyboard.value();
    return NO_INPUT;
  }

  function updateReadout(now: number): void {
    framesSinceSample += 1;
    if (now - lastSample < 400) return;
    framesPerSecond = Math.round((framesSinceSample * 1000) / (now - lastSample));
    framesSinceSample = 0;
    lastSample = now;
    const { position } = state.fighter;
    readout.textContent = `x ${position.x.toFixed(1)} · z ${position.z.toFixed(1)} · tick ${state.tick} · ${framesPerSecond} fps`;
  }

  function frame(now: number): void {
    frameHandle = window.requestAnimationFrame(frame);
    const elapsedSeconds = (now - lastFrame) / 1000;
    lastFrame = now;
    const plan = advanceAccumulator(accumulator, elapsedSeconds);
    accumulator = plan.accumulator;
    const input = currentInput();
    for (let index = 0; index < plan.ticks; index += 1) state = step(state, input);
    if (context) renderArena(context, state, viewport);
    updateReadout(now);
  }

  /** A hidden tab produces one enormous frame; restart the clock instead of catching up. */
  function onVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return;
    lastFrame = performance.now();
    lastSample = lastFrame;
    framesSinceSample = 0;
    accumulator = 0;
  }

  function onOrientationChange(): void {
    resize();
    window.setTimeout(resize, 180); // some phones report stale sizes mid-rotation
  }

  const blockGesture = (event: Event) => event.preventDefault();

  screen.addEventListener('touchmove', blockGesture, { passive: false });
  screen.addEventListener('gesturestart', blockGesture);
  screen.addEventListener('gesturechange', blockGesture);
  screen.addEventListener('dblclick', blockGesture);
  screen.addEventListener('contextmenu', blockGesture);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', onOrientationChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.body.classList.add('arena-open');

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);

  root.querySelector<HTMLButtonElement>('#arena-leave')!.addEventListener('click', options.onLeave);

  resize();
  lastFrame = performance.now();
  lastSample = lastFrame;
  frameHandle = window.requestAnimationFrame(frame);

  return function dispose(): void {
    window.cancelAnimationFrame(frameHandle);
    joystick.destroy();
    keyboard.destroy();
    observer?.disconnect();
    screen.removeEventListener('touchmove', blockGesture);
    screen.removeEventListener('gesturestart', blockGesture);
    screen.removeEventListener('gesturechange', blockGesture);
    screen.removeEventListener('dblclick', blockGesture);
    screen.removeEventListener('contextmenu', blockGesture);
    window.removeEventListener('resize', resize);
    window.removeEventListener('orientationchange', onOrientationChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    document.body.classList.remove('arena-open');
  };
}
