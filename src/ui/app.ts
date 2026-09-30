import {
  AiState,
  CombatEvent,
  CombatInput,
  CombatState,
  Fighter,
  FighterInput,
  createAiState,
  createCombatState,
  createFighter,
  describeCondition,
  fightOutcome,
  joystickInput,
  joystickKnobOffset,
  stepCombat,
  stepCombatWithAi,
  ticksForElapsed,
} from '../sim';
import { browserStorage } from '../storage';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
const storage = browserStorage();
const list = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character]!));

export function renderStart(): void {
  const fighter = storage.load();
  root.innerHTML = `<main class="shell start-screen"><div class="eyebrow">MULTIDIMENSIONAL ARENA</div><h1>Enter the arena.</h1><p class="lede">Build a fighter with a history, a style, and a future worth risking.</p><div class="actions"><button class="primary" id="new">New Fighter</button><button id="continue" ${fighter ? '' : 'disabled'}>Continue</button></div>${fighter ? `<p class="save-note">Save found: ${escapeHtml(fighter.name)}</p>` : '<p class="save-note">No fighter saved yet.</p>'}</main>`;
  root.querySelector('#new')!.addEventListener('click', renderCreation);
  root.querySelector('#continue')?.addEventListener('click', () => fighter && renderProfile(fighter));
}

function field(label: string, name: string, placeholder: string, required = true): string {
  const max = name === 'name' ? 40 : name === 'background' ? 200 : 60;
  return `<label>${label}${required ? ' <span>*</span>' : ''}<input name="${name}" maxlength="${max}" placeholder="${placeholder}" ${required ? 'required' : ''} /></label>`;
}

export function renderCreation(): void {
  root.innerHTML = `<main class="shell"><button class="back" id="back">← Back</button><div class="eyebrow">FIGHTER CREATION</div><h1>Make your mark.</h1><p class="lede">Every fighter starts somewhere. The arena will learn the rest.</p><form id="creation-form">
    <section><h2>Identity</h2>${field('Name', 'name', 'What are you called?')}${field('Origin', 'origin', 'Where did you come from?')}${field('Species', 'species', 'Human, synth, drake…')}${field('Background', 'background', 'A sentence about your past')}</section>
    <section><h2>Combat identity</h2>${field('Primary style', 'primaryStyle', 'Boxing, tidecraft…')}${field('Secondary styles', 'secondaryStyles', 'Comma-separated', false)}${field('Power system', 'powerSystem', 'What fuels your abilities?')}${field('Weapons', 'weapons', 'Comma-separated', false)}${field('Equipment', 'equipment', 'Comma-separated', false)}${field('Special abilities', 'specialAbilities', 'Comma-separated', false)}</section>
    <section><h2>Rules</h2><label class="toggle"><input type="checkbox" name="permanentDeath" /> <span>Permanent Death</span><small>Losses have lasting consequences.</small></label><label class="toggle"><input type="checkbox" name="undergroundAccess" /> <span>Underground Access</span><small>Begin with access to hidden circles.</small></label></section>
    <button class="primary full" type="submit">Create Fighter</button><p class="form-error" id="error" role="alert"></p>
  </form></main>`;
  root.querySelector('#back')!.addEventListener('click', renderStart);
  root.querySelector('form')!.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const input: FighterInput = {
      name: String(form.get('name') ?? ''),
      origin: String(form.get('origin') ?? ''),
      species: String(form.get('species') ?? ''),
      background: String(form.get('background') ?? ''),
      primaryStyle: String(form.get('primaryStyle') ?? ''),
      secondaryStyles: list(String(form.get('secondaryStyles') ?? '')),
      powerSystem: String(form.get('powerSystem') ?? ''),
      weapons: list(String(form.get('weapons') ?? '')),
      equipment: list(String(form.get('equipment') ?? '')),
      specialAbilities: list(String(form.get('specialAbilities') ?? '')),
      permanentDeath: form.has('permanentDeath'),
      undergroundAccess: form.has('undergroundAccess'),
    };
    try {
      const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff);
      const fighter = createFighter(input, seed);
      storage.save(fighter);
      renderProfile(fighter);
    } catch (error) {
      root.querySelector('#error')!.textContent = error instanceof Error ? error.message : 'Unable to create fighter.';
    }
  });
}

export function renderProfile(fighter: Fighter): void {
  const itemList = (values: string[]) => values.length ? values.map(escapeHtml).join(', ') : 'None';
  root.innerHTML = `<main class="shell"><button class="back" id="home">← Start screen</button><div class="profile-heading"><div><div class="eyebrow">FIGHTER PROFILE</div><h1>${escapeHtml(fighter.name)}</h1><p class="muted">${escapeHtml(fighter.species)} · ${escapeHtml(fighter.origin)}</p></div><div class="badge">${escapeHtml(fighter.progression.rank)}</div></div><div class="condition"><span class="pulse"></span><div><strong>${describeCondition(fighter)}</strong><small>Current condition</small></div></div><section class="card"><h2>Identity</h2><dl><dt>Background</dt><dd>${escapeHtml(fighter.background)}</dd><dt>Reputation</dt><dd>${escapeHtml(fighter.progression.reputation)}</dd><dt>Titles</dt><dd>${itemList(fighter.progression.titles)}</dd><dt>Currency</dt><dd>${fighter.progression.currency} credits</dd><dt>Housing</dt><dd>${escapeHtml(fighter.progression.housing)}</dd></dl></section><section class="card"><h2>Combat identity</h2><dl><dt>Primary style</dt><dd>${escapeHtml(fighter.primaryStyle)}</dd><dt>Secondary styles</dt><dd>${itemList(fighter.secondaryStyles)}</dd><dt>Power system</dt><dd>${escapeHtml(fighter.powerSystem)}</dd><dt>Weapons</dt><dd>${itemList(fighter.weapons)}</dd><dt>Equipment</dt><dd>${itemList(fighter.equipment)}</dd><dt>Special abilities</dt><dd>${itemList(fighter.specialAbilities)}</dd></dl></section><button class="primary" id="arena">Enter Arena</button><p class="footer-note">Your fighter is saved on this device. Movement and combat basics are ready in the training arena.</p></main>`;
  root.querySelector('#home')!.addEventListener('click', renderStart);
  root.querySelector('#arena')!.addEventListener('click', renderArena);
}

const arenaMarkup = (fighterName: string): string => `<main class="arena-screen">
  <button class="leave" id="leave">Leave</button>
  <div class="mode-toggle" role="group" aria-label="Opponent mode">
    <button type="button" data-mode="opponent" aria-pressed="true">Opponent</button>
    <button type="button" data-mode="dummy" aria-pressed="false">Dummy</button>
  </div>
  <canvas id="arena-canvas" aria-label="Combat training arena"></canvas>
  <!-- Debug-only combat HUD: remove this component without touching simulation or canvas code. -->
  <aside class="debug-combat-hud" aria-label="Combat status">
    <div class="hud-fighter" data-hud="player"><div class="hud-label"><strong>${escapeHtml(fighterName)}</strong><span data-value="health"></span></div><div class="meter health"><i data-bar="health"></i></div><div class="hud-label stamina-label"><span>Stamina</span><span data-value="stamina"></span></div><div class="meter stamina"><i data-bar="stamina"></i></div></div>
    <div class="hud-fighter hud-dummy" data-hud="dummy"><div class="hud-label"><strong data-opponent-name>Rookie Opponent</strong><span data-value="health"></span></div><div class="meter health"><i data-bar="health"></i></div><div class="hud-label stamina-label"><span>Stamina</span><span data-value="stamina"></span></div><div class="meter stamina"><i data-bar="stamina"></i></div></div>
  </aside>
  <div class="fight-result" id="fight-result" hidden><strong data-result-title>Opponent defeated</strong><span data-result-note>Well fought.</span><button class="primary" id="reset-fight">Reset</button></div>
  <div class="joystick" id="joystick" aria-label="Movement joystick"><div class="stick"></div></div>
  <div class="combat-controls" aria-label="Combat controls">
    <button class="combat-button attack-button" data-control="attack" aria-label="Attack">Attack<kbd>J</kbd></button>
    <button class="combat-button block-button" data-control="block" aria-label="Hold to block">Block<kbd>K</kbd></button>
    <button class="combat-button dodge-button" data-control="dodge" aria-label="Dodge">Dodge<kbd>L</kbd></button>
  </div>
</main>`;

export function renderArena(): void {
  const fighter = storage.load();
  if (!fighter) {
    renderStart();
    return;
  }
  root.innerHTML = arenaMarkup(fighter.name);

  const canvas = root.querySelector<HTMLCanvasElement>('#arena-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const pad = root.querySelector<HTMLElement>('#joystick')!;
  const stick = pad.querySelector<HTMLElement>('.stick')!;
  const resultPanel = root.querySelector<HTMLElement>('#fight-result')!;
  const resultTitle = resultPanel.querySelector<HTMLElement>('[data-result-title]')!;
  const resultNote = resultPanel.querySelector<HTMLElement>('[data-result-note]')!;
  const opponentName = root.querySelector<HTMLElement>('[data-opponent-name]')!;
  const modeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-mode]'));
  const actionButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-control]'));
  const cleanup: Array<() => void> = [];
  const on = <K extends keyof WindowEventMap>(target: Window, type: K, listener: (event: WindowEventMap[K]) => void) => {
    target.addEventListener(type, listener as EventListener);
    cleanup.push(() => target.removeEventListener(type, listener as EventListener));
  };

  // 'opponent' pits the player against the Rookie AI; 'dummy' keeps the passive training dummy.
  let mode: 'opponent' | 'dummy' = 'opponent';
  let state = createCombatState(fighter.hiddenStats);
  // The AI's RNG lives in aiState; a fresh seed per fight keeps each restart reproducible-but-varied.
  let aiSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  let aiState: AiState = createAiState(aiSeed);
  let accumulator = 0;
  let last = performance.now();
  let frame = 0;
  let joystickVector = { x: 0, z: 0 };
  let joystickPointer: number | null = null;
  let attackQueued = false;
  let dodgeQueued = false;
  let blockPointer: number | null = null;
  const movementKeys = new Set<string>();
  const heldActionKeys = new Set<string>();
  const flashTicks: Record<'player' | 'dummy', number> = { player: 0, dummy: 0 };
  const blockFlashTicks: Record<'player' | 'dummy', number> = { player: 0, dummy: 0 };
  const dodgeFlashTicks: Record<'player' | 'dummy', number> = { player: 0, dummy: 0 };

  const resize = () => {
    const ratio = devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  on(window, 'resize', resize);
  resize();

  // Joystick placement and mapping are unchanged: the rendered base remains the source of truth.
  const padGeometry = () => {
    const rect = pad.getBoundingClientRect();
    const baseRadius = rect.width / 2;
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      baseRadius,
      travel: Math.max(0, baseRadius - stick.offsetWidth / 2),
    };
  };
  const updatePad = (event: PointerEvent) => {
    const { centerX, centerY, baseRadius, travel } = padGeometry();
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    joystickVector = joystickInput(dx, dy, baseRadius);
    const knob = joystickKnobOffset(dx, dy, baseRadius, travel);
    stick.style.transform = `translate(${knob.x}px, ${knob.y}px)`;
  };
  const releasePad = (event?: PointerEvent) => {
    if (event && joystickPointer !== null && event.pointerId !== joystickPointer) return;
    joystickPointer = null;
    joystickVector = { x: 0, z: 0 };
    stick.style.transform = '';
  };
  pad.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (joystickPointer !== null) return;
    joystickPointer = event.pointerId;
    pad.setPointerCapture(joystickPointer);
    updatePad(event);
  });
  pad.addEventListener('pointermove', (event) => {
    if (event.pointerId === joystickPointer) updatePad(event);
  });
  pad.addEventListener('pointerup', releasePad);
  pad.addEventListener('pointercancel', releasePad);
  pad.addEventListener('lostpointercapture', releasePad);

  const releaseActionButton = (button: HTMLButtonElement, event: PointerEvent) => {
    const control = button.dataset.control;
    if (control === 'block' && event.pointerId === blockPointer) blockPointer = null;
    button.classList.remove('held');
  };
  for (const button of actionButtons) {
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const control = button.dataset.control;
      if (control === 'block') {
        if (blockPointer !== null) return;
        blockPointer = event.pointerId;
      } else if (button.classList.contains('held')) {
        return;
      } else if (control === 'attack') {
        attackQueued = true;
      } else if (control === 'dodge') {
        dodgeQueued = true;
      }
      button.classList.add('held');
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointerup', (event) => releaseActionButton(button, event));
    button.addEventListener('pointercancel', (event) => releaseActionButton(button, event));
    button.addEventListener('lostpointercapture', (event) => releaseActionButton(button, event));
  }

  const keyboardMovement = () => {
    const x = Number(movementKeys.has('d') || movementKeys.has('arrowright'))
      - Number(movementKeys.has('a') || movementKeys.has('arrowleft'));
    const z = Number(movementKeys.has('s') || movementKeys.has('arrowdown'))
      - Number(movementKeys.has('w') || movementKeys.has('arrowup'));
    const length = Math.hypot(x, z);
    return length > 1 ? { x: x / length, z: z / length } : { x, z };
  };
  const movementInput = () => {
    const keyboard = keyboardMovement();
    if (keyboard.x !== 0 || keyboard.z !== 0) return keyboard;
    return joystickVector;
  };
  const movementKeyNames = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
  on(window, 'keydown', (event) => {
    const key = event.key.toLowerCase();
    if (movementKeyNames.has(key)) {
      event.preventDefault();
      movementKeys.add(key);
    }
    if (key === 'j' || key === 'k' || key === 'l') event.preventDefault();
    if (event.repeat) return;
    if (key === 'j') attackQueued = true;
    if (key === 'k') heldActionKeys.add('k');
    if (key === 'l') dodgeQueued = true;
  });
  on(window, 'keyup', (event) => {
    const key = event.key.toLowerCase();
    movementKeys.delete(key);
    heldActionKeys.delete(key);
  });

  const clearHeldInput = () => {
    movementKeys.clear();
    heldActionKeys.clear();
    attackQueued = false;
    dodgeQueued = false;
    blockPointer = null;
    releasePad();
    for (const button of actionButtons) button.classList.remove('held');
  };
  on(window, 'blur', clearHeldInput);
  const visibilityChange = () => {
    clearHeldInput();
    accumulator = 0;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', visibilityChange);
  cleanup.push(() => document.removeEventListener('visibilitychange', visibilityChange));

  const handleEvents = (events: CombatEvent[]) => {
    for (const event of events) {
      if (event.type === 'DAMAGE_APPLIED' && event.targetId) flashTicks[event.targetId] = 6;
      if (event.type === 'ATTACK_BLOCKED' && event.targetId) blockFlashTicks[event.targetId] = 8;
      if (event.type === 'DODGE_EVADED' && event.actorId) dodgeFlashTicks[event.actorId] = 8;
    }
  };

  const updateHudCombatant = (id: 'player' | 'dummy', combatant: CombatState['player']) => {
    const hud = root.querySelector<HTMLElement>(`[data-hud="${id}"]`)!;
    const healthPercent = (combatant.health / combatant.maxHealth) * 100;
    const staminaPercent = (combatant.stamina / combatant.maxStamina) * 100;
    hud.querySelector<HTMLElement>('[data-bar="health"]')!.style.width = `${healthPercent}%`;
    hud.querySelector<HTMLElement>('[data-bar="stamina"]')!.style.width = `${staminaPercent}%`;
    hud.querySelector<HTMLElement>('[data-value="health"]')!.textContent = `${Math.ceil(combatant.health)} / ${combatant.maxHealth}`;
    hud.querySelector<HTMLElement>('[data-value="stamina"]')!.textContent = `${Math.ceil(combatant.stamina)} / ${combatant.maxStamina}`;
    hud.classList.toggle('defeated', combatant.defeated);
  };
  const updateHud = () => {
    updateHudCombatant('player', state.player);
    updateHudCombatant('dummy', state.dummy);
    const outcome = fightOutcome(state);
    resultPanel.hidden = outcome === null;
    if (outcome === 'player') {
      resultTitle.textContent = mode === 'dummy' ? 'Dummy defeated' : 'Opponent defeated';
      resultNote.textContent = mode === 'dummy' ? 'Training complete.' : 'Well fought.';
    } else if (outcome === 'opponent') {
      resultTitle.textContent = 'You were defeated';
      resultNote.textContent = 'The opponent got the better of you.';
    } else if (outcome === 'draw') {
      resultTitle.textContent = 'Double knockout';
      resultNote.textContent = 'You fell together.';
    }
  };

  const project = (position: { x: number; z: number }) => {
    const scale = Math.min(innerWidth / 24, innerHeight / 20);
    return {
      x: innerWidth / 2 + position.x * scale,
      y: innerHeight * 0.55 + position.z * scale * 0.6,
      scale,
    };
  };
  const drawCombatant = (combatant: CombatState['player']) => {
    const point = project(combatant.position);
    const isPlayer = combatant.id === 'player';
    const flash = flashTicks[combatant.id] > 0;
    const blocking = combatant.currentAction.type === 'block' && combatant.currentAction.phase !== 'recovery';
    const dodging = combatant.currentAction.type === 'dodge';

    ctx.fillStyle = '#0008';
    ctx.beginPath();
    ctx.ellipse(point.x, point.y + 11, combatant.defeated ? 23 : 18, combatant.defeated ? 5 : 7, 0, 0, Math.PI * 2);
    ctx.fill();

    if (dodging) {
      ctx.strokeStyle = dodgeFlashTicks[combatant.id] > 0 ? '#f4ffff' : '#69e7ff99';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(point.x - combatant.actionDirection.x * 12, point.y - combatant.actionDirection.z * 7, 17, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The active AI opponent gets its own crimson so it never looks like the passive orange dummy.
    const bodyColor = isPlayer ? '#b9adff' : mode === 'opponent' ? '#ff6b7d' : '#ffb56b';
    const facingColor = isPlayer ? '#ded8ff' : mode === 'opponent' ? '#ffd2d8' : '#ffe0bc';
    ctx.fillStyle = flash ? '#ffffff' : combatant.defeated ? '#55586a' : bodyColor;
    ctx.beginPath();
    if (combatant.defeated) ctx.ellipse(point.x, point.y + 4, 22, 8, -0.18, 0, Math.PI * 2);
    else ctx.arc(point.x, point.y, isPlayer ? 13 : 15, 0, Math.PI * 2);
    ctx.fill();

    if (!combatant.defeated) {
      const facingEndX = point.x + combatant.facing.x * 26;
      const facingEndY = point.y + combatant.facing.z * 15;
      ctx.strokeStyle = facingColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(facingEndX, facingEndY);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(facingEndX, facingEndY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (blocking || blockFlashTicks[combatant.id] > 0) {
      const angle = Math.atan2(combatant.facing.z * 0.6, combatant.facing.x);
      ctx.strokeStyle = blockFlashTicks[combatant.id] > 0 ? '#ffffff' : '#62dda2';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 23, angle - 0.75, angle + 0.75);
      ctx.stroke();
    }
  };

  const draw = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.fillStyle = '#171b2b';
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    const centerX = innerWidth / 2;
    const centerY = innerHeight * 0.55;
    const scale = Math.min(innerWidth / 24, innerHeight / 20);
    ctx.fillStyle = '#303650';
    ctx.beginPath();
    ctx.moveTo(centerX - 10 * scale, centerY - 7 * scale);
    ctx.lineTo(centerX + 10 * scale, centerY - 7 * scale);
    ctx.lineTo(centerX + 10 * scale, centerY + 7 * scale);
    ctx.lineTo(centerX - 10 * scale, centerY + 7 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#454c6d';
    ctx.lineWidth = 2;
    ctx.stroke();

    [state.player, state.dummy]
      .sort((first, second) => first.position.z - second.position.z)
      .forEach(drawCombatant);
    updateHud();
  };

  const resetFight = () => {
    state = createCombatState(fighter.hiddenStats);
    // In opponent mode the second combatant is an active AI; in dummy mode it stays stationary.
    state.dummy.stationary = mode !== 'opponent';
    aiSeed = (aiSeed * 1664525 + 1013904223) >>> 0; // A fresh seed so each restart plays out anew.
    aiState = createAiState(aiSeed);
    accumulator = 0;
    last = performance.now();
    clearHeldInput();
    flashTicks.player = flashTicks.dummy = 0;
    blockFlashTicks.player = blockFlashTicks.dummy = 0;
    dodgeFlashTicks.player = dodgeFlashTicks.dummy = 0;
    resultPanel.hidden = true;
    draw();
  };
  root.querySelector('#reset-fight')!.addEventListener('click', resetFight);

  const applyMode = (next: 'opponent' | 'dummy') => {
    mode = next;
    opponentName.textContent = mode === 'opponent' ? 'Rookie Opponent' : 'Training Dummy';
    for (const button of modeButtons) {
      const active = button.dataset.mode === mode;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('active', active);
    }
    resetFight(); // Switching opponent modes always restarts the fight.
  };
  for (const button of modeButtons) {
    button.addEventListener('click', () => applyMode(button.dataset.mode === 'dummy' ? 'dummy' : 'opponent'));
  }
  applyMode('opponent');

  const leave = () => {
    cancelAnimationFrame(frame);
    cleanup.forEach((remove) => remove());
    renderProfile(fighter);
  };
  root.querySelector('#leave')!.addEventListener('click', leave);

  const loop = (now: number) => {
    const elapsed = Math.max(0, (now - last) / 1000);
    last = now;
    const timing = ticksForElapsed(elapsed, accumulator);
    accumulator = timing.accumulator;
    for (let index = 0; index < timing.ticks; index += 1) {
      const movement = movementInput();
      const input: CombatInput = {
        ...movement,
        attackPressed: attackQueued,
        blockHeld: blockPointer !== null || heldActionKeys.has('k'),
        dodgePressed: dodgeQueued,
      };
      attackQueued = false;
      dodgeQueued = false;
      let result;
      if (mode === 'opponent') {
        const stepped = stepCombatWithAi(state, input, aiState);
        result = stepped.result;
        aiState = stepped.aiState;
      } else {
        result = stepCombat(state, input);
      }
      state = result.state;
      handleEvents(result.events);
      flashTicks.player = Math.max(0, flashTicks.player - 1);
      flashTicks.dummy = Math.max(0, flashTicks.dummy - 1);
      blockFlashTicks.player = Math.max(0, blockFlashTicks.player - 1);
      blockFlashTicks.dummy = Math.max(0, blockFlashTicks.dummy - 1);
      dodgeFlashTicks.player = Math.max(0, dodgeFlashTicks.player - 1);
      dodgeFlashTicks.dummy = Math.max(0, dodgeFlashTicks.dummy - 1);
    }
    draw();
    frame = requestAnimationFrame(loop);
  };
  draw();
  frame = requestAnimationFrame(loop);
}
