import type { ArenaState, FighterBody } from '../sim';
import { byDepth, Camera, createCamera, project, projectFloor, Viewport } from './projection';

/**
 * Canvas 2D renderer for the arena.
 *
 * Placeholder shapes only: no images, no WebGL, no animation state. The renderer reads
 * simulation state and never writes to it, so the simulation stays testable on its own.
 */

/** Fighter proportions in floor units. */
const FIGHTER_HEIGHT = 1.78;
const HEAD_RADIUS = 0.23;
const POST_HEIGHT = 1.05;
const POST_RADIUS = 0.16;
/** Floor grid spacing in floor units. */
const GRID_STEP = 1.5;

/** Something standing on the floor, painted back to front. */
export interface ArenaSprite {
  kind: 'post' | 'fighter';
  x: number;
  z: number;
}

/** Draws one frame. `viewport` is in CSS pixels; the context is already DPR-scaled. */
export function renderArena(ctx: CanvasRenderingContext2D, state: ArenaState, viewport: Viewport): void {
  const camera = createCamera(viewport, state.bounds);
  drawBackdrop(ctx, viewport);
  drawFloor(ctx, state, camera);
  drawSprites(ctx, state, camera);
}

function drawBackdrop(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
  const sky = ctx.createLinearGradient(0, 0, 0, viewport.height);
  sky.addColorStop(0, '#171430');
  sky.addColorStop(0.55, '#10131c');
  sky.addColorStop(1, '#0a0c13');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  const glow = ctx.createRadialGradient(
    viewport.width * 0.5, viewport.height * 0.18, 0,
    viewport.width * 0.5, viewport.height * 0.18, Math.max(viewport.width, viewport.height) * 0.6,
  );
  glow.addColorStop(0, 'rgba(156, 140, 255, 0.20)');
  glow.addColorStop(1, 'rgba(156, 140, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
}

function drawFloor(ctx: CanvasRenderingContext2D, state: ArenaState, camera: Camera): void {
  const { minX, maxX, minZ, maxZ } = state.bounds;
  const farLeft = projectFloor(minX, minZ, camera);
  const farRight = projectFloor(maxX, minZ, camera);
  const nearRight = projectFloor(maxX, maxZ, camera);
  const nearLeft = projectFloor(minX, maxZ, camera);

  ctx.beginPath();
  ctx.moveTo(farLeft.x, farLeft.y);
  ctx.lineTo(farRight.x, farRight.y);
  ctx.lineTo(nearRight.x, nearRight.y);
  ctx.lineTo(nearLeft.x, nearLeft.y);
  ctx.closePath();

  const floorFill = ctx.createLinearGradient(0, farLeft.y, 0, nearLeft.y);
  floorFill.addColorStop(0, '#242840');
  floorFill.addColorStop(1, '#161927');
  ctx.fillStyle = floorFill;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(156, 140, 255, 0.13)';
  ctx.beginPath();
  for (let x = minX; x <= maxX + 1e-6; x += GRID_STEP) {
    const far = projectFloor(x, minZ, camera);
    const near = projectFloor(x, maxZ, camera);
    ctx.moveTo(far.x, far.y);
    ctx.lineTo(near.x, near.y);
  }
  for (let z = minZ; z <= maxZ + 1e-6; z += GRID_STEP) {
    const left = projectFloor(minX, z, camera);
    const right = projectFloor(maxX, z, camera);
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
  }
  ctx.stroke();

  // Centre ring, drawn as a projected circle so the tilt of the plane reads clearly.
  ctx.beginPath();
  const ringRadius = Math.min(maxX - minX, maxZ - minZ) * 0.22;
  for (let i = 0; i <= 48; i += 1) {
    const angle = (i / 48) * Math.PI * 2;
    const point = projectFloor(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, camera);
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.strokeStyle = 'rgba(185, 173, 255, 0.28)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(185, 173, 255, 0.45)';
  ctx.beginPath();
  ctx.moveTo(farLeft.x, farLeft.y);
  ctx.lineTo(farRight.x, farRight.y);
  ctx.lineTo(nearRight.x, nearRight.y);
  ctx.lineTo(nearLeft.x, nearLeft.y);
  ctx.closePath();
  ctx.stroke();
}

/**
 * Everything standing on the floor, depth sorted by z: far first, near last. The corner
 * posts are scenery that makes the tilt of the plane readable; they are a rendering
 * detail and have no presence in the simulation.
 */
export function collectSprites(state: ArenaState): ArenaSprite[] {
  const { minX, maxX, minZ, maxZ } = state.bounds;
  // Inset further than the fighter's radius so it can pass both in front of and behind
  // the posts; that is what makes the depth sorting visible.
  const inset = 0.55;
  const sprites: ArenaSprite[] = [
    { kind: 'post', x: minX + inset, z: minZ + inset },
    { kind: 'post', x: maxX - inset, z: minZ + inset },
    { kind: 'post', x: minX + inset, z: maxZ - inset },
    { kind: 'post', x: maxX - inset, z: maxZ - inset },
    { kind: 'fighter', x: state.fighter.position.x, z: state.fighter.position.z },
  ];
  return sprites.sort(byDepth);
}

function drawSprites(ctx: CanvasRenderingContext2D, state: ArenaState, camera: Camera): void {
  for (const sprite of collectSprites(state)) {
    if (sprite.kind === 'post') drawPost(ctx, camera, sprite.x, sprite.z);
    else drawFighter(ctx, camera, state.fighter);
  }
}

function drawShadow(ctx: CanvasRenderingContext2D, camera: Camera, x: number, z: number, radius: number, alpha: number): void {
  const feet = projectFloor(x, z, camera);
  const rx = radius * camera.unit * feet.scale;
  const ry = Math.max(rx * camera.squash, 1);
  ctx.beginPath();
  ctx.ellipse(feet.x, feet.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(4, 6, 12, ${alpha})`;
  ctx.fill();
}

function drawPost(ctx: CanvasRenderingContext2D, camera: Camera, x: number, z: number): void {
  drawShadow(ctx, camera, x, z, POST_RADIUS * 1.6, 0.35);
  const base = projectFloor(x, z, camera);
  const top = project({ x, y: POST_HEIGHT, z }, camera);
  const halfWidth = POST_RADIUS * camera.unit * base.scale;
  ctx.beginPath();
  roundedRectPath(ctx, base.x - halfWidth, top.y, halfWidth * 2, base.y - top.y, halfWidth * 0.5);
  ctx.fillStyle = 'rgba(58, 62, 92, 0.95)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(base.x, top.y, halfWidth, halfWidth * camera.squash, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#6f66b5';
  ctx.fill();
}

function drawFighter(ctx: CanvasRenderingContext2D, camera: Camera, fighter: FighterBody): void {
  const { position, facing, radius } = fighter;
  drawShadow(ctx, camera, position.x, position.z, radius * 1.15, 0.42);

  // Facing wedge painted flat on the floor, so the direction reads in the tilted view.
  const tipLength = radius * 2.1;
  const tip = projectFloor(position.x + facing.x * tipLength, position.z + facing.z * tipLength, camera);
  const leftBase = projectFloor(position.x - facing.z * radius * 0.8, position.z + facing.x * radius * 0.8, camera);
  const rightBase = projectFloor(position.x + facing.z * radius * 0.8, position.z - facing.x * radius * 0.8, camera);
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(leftBase.x, leftBase.y);
  ctx.lineTo(rightBase.x, rightBase.y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(185, 173, 255, 0.35)';
  ctx.fill();

  const feet = projectFloor(position.x, position.z, camera);
  const pixelsPerUnit = camera.unit * feet.scale;
  const bodyTop = feet.y - (FIGHTER_HEIGHT - HEAD_RADIUS * 2) * pixelsPerUnit;
  const halfWidth = radius * 0.92 * pixelsPerUnit;

  ctx.beginPath();
  roundedRectPath(ctx, feet.x - halfWidth, bodyTop, halfWidth * 2, feet.y - bodyTop, halfWidth * 0.62);
  const body = ctx.createLinearGradient(feet.x - halfWidth, bodyTop, feet.x + halfWidth, feet.y);
  body.addColorStop(0, '#cdc3ff');
  body.addColorStop(1, '#7a6ada');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = Math.max(pixelsPerUnit * 0.045, 1);
  ctx.strokeStyle = 'rgba(16, 14, 30, 0.85)';
  ctx.stroke();

  const headRadius = HEAD_RADIUS * pixelsPerUnit;
  ctx.beginPath();
  ctx.arc(feet.x, bodyTop - headRadius * 0.82, headRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#f1eee8';
  ctx.fill();
  ctx.stroke();
}

/** `roundRect` is not available everywhere yet, so the path is built by hand. */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}
