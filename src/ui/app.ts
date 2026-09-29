import { createFighter, describeCondition, Fighter, FighterInput, createArenaState, step, FIXED_DT, joystickInput, joystickKnobOffset } from '../sim';
import { browserStorage } from '../storage';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
const storage = browserStorage();
const list = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]!));

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
  root.querySelector('form')!.addEventListener('submit', (event) => { event.preventDefault(); const form = new FormData(event.currentTarget as HTMLFormElement); const input: FighterInput = { name: String(form.get('name') ?? ''), origin: String(form.get('origin') ?? ''), species: String(form.get('species') ?? ''), background: String(form.get('background') ?? ''), primaryStyle: String(form.get('primaryStyle') ?? ''), secondaryStyles: list(String(form.get('secondaryStyles') ?? '')), powerSystem: String(form.get('powerSystem') ?? ''), weapons: list(String(form.get('weapons') ?? '')), equipment: list(String(form.get('equipment') ?? '')), specialAbilities: list(String(form.get('specialAbilities') ?? '')), permanentDeath: form.has('permanentDeath'), undergroundAccess: form.has('undergroundAccess') }; try { const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff); const fighter = createFighter(input, seed); storage.save(fighter); renderProfile(fighter); } catch (error) { root.querySelector('#error')!.textContent = error instanceof Error ? error.message : 'Unable to create fighter.'; } });
}

export function renderProfile(fighter: Fighter): void {
  const itemList = (values: string[]) => values.length ? values.map(escapeHtml).join(', ') : 'None';
  root.innerHTML = `<main class="shell"><button class="back" id="home">← Start screen</button><div class="profile-heading"><div><div class="eyebrow">FIGHTER PROFILE</div><h1>${escapeHtml(fighter.name)}</h1><p class="muted">${escapeHtml(fighter.species)} · ${escapeHtml(fighter.origin)}</p></div><div class="badge">${escapeHtml(fighter.progression.rank)}</div></div><div class="condition"><span class="pulse"></span><div><strong>${describeCondition(fighter)}</strong><small>Current condition</small></div></div><section class="card"><h2>Identity</h2><dl><dt>Background</dt><dd>${escapeHtml(fighter.background)}</dd><dt>Reputation</dt><dd>${escapeHtml(fighter.progression.reputation)}</dd><dt>Titles</dt><dd>${itemList(fighter.progression.titles)}</dd><dt>Currency</dt><dd>${fighter.progression.currency} credits</dd><dt>Housing</dt><dd>${escapeHtml(fighter.progression.housing)}</dd></dl></section><section class="card"><h2>Combat identity</h2><dl><dt>Primary style</dt><dd>${escapeHtml(fighter.primaryStyle)}</dd><dt>Secondary styles</dt><dd>${itemList(fighter.secondaryStyles)}</dd><dt>Power system</dt><dd>${escapeHtml(fighter.powerSystem)}</dd><dt>Weapons</dt><dd>${itemList(fighter.weapons)}</dd><dt>Equipment</dt><dd>${itemList(fighter.equipment)}</dd><dt>Special abilities</dt><dd>${itemList(fighter.specialAbilities)}</dd></dl></section><button class="primary" id="arena">Enter Arena</button><p class="footer-note">Your fighter is saved on this device. Movement prototype implemented; combat is planned.</p></main>`;
  root.querySelector('#home')!.addEventListener('click', renderStart);
  root.querySelector('#arena')!.addEventListener('click', renderArena);
}

export function renderArena(): void {
  root.innerHTML = `<main class="arena-screen"><button class="leave" id="leave">Leave</button><canvas id="arena-canvas" aria-label="Arena movement view"></canvas><div class="joystick" id="joystick"><div class="stick"></div></div></main>`;
  root.querySelector('#leave')!.addEventListener('click', () => { cancelAnimationFrame(frame); renderProfile(storage.load()!); });
  const canvas = root.querySelector('canvas')!; const ctx = canvas.getContext('2d')!; const pad = root.querySelector<HTMLElement>('#joystick')!; const stick = pad.querySelector<HTMLElement>('.stick')!;
  let state = createArenaState(); let accumulator = 0; let last = performance.now(); let input = { x: 0, z: 0 }; let frame = 0; let pointer: number | null = null;
  const resize = () => { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`; ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); }; addEventListener('resize', resize); resize();
  // Joystick: the visible base circle is the source of truth for the full-speed radius.
  const padGeometry = () => { const r = pad.getBoundingClientRect(); const baseRadius = r.width / 2; return { centerX: r.left + r.width / 2, centerY: r.top + r.height / 2, baseRadius, travel: Math.max(0, baseRadius - stick.offsetWidth / 2) }; };
  const updatePad = (e: PointerEvent) => {
    const { centerX, centerY, baseRadius, travel } = padGeometry();
    const dx = e.clientX - centerX, dy = e.clientY - centerY;
    input = joystickInput(dx, dy, baseRadius);
    const knob = joystickKnobOffset(dx, dy, baseRadius, travel);
    stick.style.transform = `translate(${knob.x}px, ${knob.y}px)`;
  };
  const release = (e?: PointerEvent) => { if (e && pointer !== null && e.pointerId !== pointer) return; pointer = null; input = { x: 0, z: 0 }; stick.style.transform = ''; };
  pad.addEventListener('pointerdown', (e) => { if (pointer !== null) return; pointer = e.pointerId; pad.setPointerCapture(pointer); updatePad(e); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) updatePad(e); });
  pad.addEventListener('pointerup', release); pad.addEventListener('pointercancel', release); pad.addEventListener('lostpointercapture', release);
  addEventListener('keydown',e=>{const k=e.key.toLowerCase(); if('wasd'.includes(k)||['arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();input={x:(k==='d'||k==='arrowright'?1:k==='a'||k==='arrowleft'?-1:0),z:(k==='s'||k==='arrowdown'?1:k==='w'||k==='arrowup'?-1:0)}}}); addEventListener('keyup',()=>{input={x:0,z:0}});
  const draw=()=>{ctx.clearRect(0,0,innerWidth,innerHeight);ctx.fillStyle='#171b2b';ctx.fillRect(0,0,innerWidth,innerHeight);const sx=innerWidth/2, sy=innerHeight*.55, scale=Math.min(innerWidth/24,innerHeight/20);ctx.fillStyle='#303650';ctx.beginPath();ctx.moveTo(sx-10*scale,sy-7*scale);ctx.lineTo(sx+10*scale,sy-7*scale);ctx.lineTo(sx+10*scale,sy+7*scale);ctx.lineTo(sx-10*scale,sy+7*scale);ctx.fill();const px=sx+state.position.x*scale,pz=sy+state.position.z*scale*.6;ctx.fillStyle='#0008';ctx.beginPath();ctx.ellipse(px,pz+10,18,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b9adff';ctx.beginPath();ctx.arc(px,pz,12,0,Math.PI*2);ctx.fill();}; const loop=(now:number)=>{const elapsed=Math.min(.25,(now-last)/1000);last=now;accumulator+=elapsed;const ticks=Math.min(5,Math.floor(accumulator/FIXED_DT));accumulator-=ticks*FIXED_DT;for(let i=0;i<ticks;i++)state=step(state,input);draw();frame=requestAnimationFrame(loop)}; frame=requestAnimationFrame(loop);
}

