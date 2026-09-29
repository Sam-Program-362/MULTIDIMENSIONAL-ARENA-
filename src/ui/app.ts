import { createFighter, describeCondition, Fighter, FighterInput, TEXT_LIMITS } from '../sim';
import { browserStorage } from '../storage';
import { mountArenaScreen } from './arenaScreen';
import { escapeHtml } from './html';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
const storage = browserStorage();
const list = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean);
/** Comma-separated inputs hold several entries, each limited to TEXT_LIMITS.listItem. */
const LIST_INPUT_MAXLENGTH = TEXT_LIMITS.listItem * 4;

/** The arena screen owns a frame loop and listeners, so screens are torn down before swapping. */
let disposeScreen: (() => void) | null = null;

function mount(markup: string): void {
  disposeScreen?.();
  disposeScreen = null;
  root.innerHTML = markup;
}

export function renderStart(): void {
  const fighter = storage.load();
  mount(`<main class="shell start-screen"><div class="eyebrow">MULTIDIMENSIONAL ARENA</div><h1>Enter the arena.</h1><p class="lede">Build a fighter with a history, a style, and a future worth risking.</p><div class="actions"><button class="primary" id="new">New Fighter</button><button id="continue" ${fighter ? '' : 'disabled'}>Continue</button></div>${fighter ? `<p class="save-note">Save found: ${escapeHtml(fighter.name)}</p>` : '<p class="save-note">No fighter saved yet.</p>'}</main>`);
  root.querySelector('#new')!.addEventListener('click', renderCreation);
  root.querySelector('#continue')?.addEventListener('click', () => fighter && renderProfile(fighter));
}

function field(label: string, name: string, placeholder: string, required = true, maxLength: number = TEXT_LIMITS.singleLine): string {
  return `<label>${label}${required ? ' <span>*</span>' : ''}<input name="${name}" placeholder="${placeholder}" maxlength="${maxLength}" ${required ? 'required' : ''} /></label>`;
}

export function renderCreation(): void {
  mount(`<main class="shell"><button class="back" id="back">← Back</button><div class="eyebrow">FIGHTER CREATION</div><h1>Make your mark.</h1><p class="lede">Every fighter starts somewhere. The arena will learn the rest.</p><form id="creation-form">
    <section><h2>Identity</h2>${field('Name', 'name', 'What are you called?', true, TEXT_LIMITS.name)}${field('Origin', 'origin', 'Where did you come from?')}${field('Species', 'species', 'Human, synth, drake…')}${field('Background', 'background', 'A sentence about your past', true, TEXT_LIMITS.background)}</section>
    <section><h2>Combat identity</h2>${field('Primary style', 'primaryStyle', 'Boxing, tidecraft…')}${field('Secondary styles', 'secondaryStyles', 'Comma-separated', false, LIST_INPUT_MAXLENGTH)}${field('Power system', 'powerSystem', 'What fuels your abilities?')}${field('Weapons', 'weapons', 'Comma-separated', false, LIST_INPUT_MAXLENGTH)}${field('Equipment', 'equipment', 'Comma-separated', false, LIST_INPUT_MAXLENGTH)}${field('Special abilities', 'specialAbilities', 'Comma-separated', false, LIST_INPUT_MAXLENGTH)}</section>
    <section><h2>Rules</h2><label class="toggle"><input type="checkbox" name="permanentDeath" /> <span>Permanent Death</span><small>Losses have lasting consequences.</small></label><label class="toggle"><input type="checkbox" name="undergroundAccess" /> <span>Underground Access</span><small>Begin with access to hidden circles.</small></label></section>
    <button class="primary full" type="submit">Create Fighter</button><p class="form-error" id="error" role="alert"></p>
  </form></main>`);
  root.querySelector('#back')!.addEventListener('click', renderStart);
  root.querySelector('form')!.addEventListener('submit', (event) => { event.preventDefault(); const form = new FormData(event.currentTarget as HTMLFormElement); const input: FighterInput = { name: String(form.get('name') ?? ''), origin: String(form.get('origin') ?? ''), species: String(form.get('species') ?? ''), background: String(form.get('background') ?? ''), primaryStyle: String(form.get('primaryStyle') ?? ''), secondaryStyles: list(String(form.get('secondaryStyles') ?? '')), powerSystem: String(form.get('powerSystem') ?? ''), weapons: list(String(form.get('weapons') ?? '')), equipment: list(String(form.get('equipment') ?? '')), specialAbilities: list(String(form.get('specialAbilities') ?? '')), permanentDeath: form.has('permanentDeath'), undergroundAccess: form.has('undergroundAccess') }; try { const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff); const fighter = createFighter(input, seed); storage.save(fighter); renderProfile(fighter); } catch (error) { root.querySelector('#error')!.textContent = error instanceof Error ? error.message : 'Unable to create fighter.'; } });
}

export function renderProfile(fighter: Fighter): void {
  const itemList = (values: string[]) => values.length ? values.map(escapeHtml).join(', ') : 'None';
  mount(`<main class="shell"><button class="back" id="home">← Start screen</button><div class="profile-heading"><div><div class="eyebrow">FIGHTER PROFILE</div><h1>${escapeHtml(fighter.name)}</h1><p class="muted">${escapeHtml(fighter.species)} · ${escapeHtml(fighter.origin)}</p></div><div class="badge">${escapeHtml(fighter.progression.rank)}</div></div><div class="condition"><span class="pulse"></span><div><strong>${describeCondition(fighter)}</strong><small>Current condition</small></div></div><div class="actions"><button class="primary" id="enter-arena">Enter Arena</button></div><section class="card"><h2>Identity</h2><dl><dt>Background</dt><dd>${escapeHtml(fighter.background)}</dd><dt>Reputation</dt><dd>${escapeHtml(fighter.progression.reputation)}</dd><dt>Titles</dt><dd>${itemList(fighter.progression.titles)}</dd><dt>Currency</dt><dd>${fighter.progression.currency} credits</dd><dt>Housing</dt><dd>${escapeHtml(fighter.progression.housing)}</dd></dl></section><section class="card"><h2>Combat identity</h2><dl><dt>Primary style</dt><dd>${escapeHtml(fighter.primaryStyle)}</dd><dt>Secondary styles</dt><dd>${itemList(fighter.secondaryStyles)}</dd><dt>Power system</dt><dd>${escapeHtml(fighter.powerSystem)}</dd><dt>Weapons</dt><dd>${itemList(fighter.weapons)}</dd><dt>Equipment</dt><dd>${itemList(fighter.equipment)}</dd><dt>Special abilities</dt><dd>${itemList(fighter.specialAbilities)}</dd></dl></section><p class="footer-note">Your fighter is saved on this device. The arena is a movement prototype: no combat yet.</p></main>`);
  root.querySelector('#home')!.addEventListener('click', renderStart);
  root.querySelector('#enter-arena')!.addEventListener('click', () => renderArena(fighter));
}

export function renderArena(fighter: Fighter): void {
  mount('');
  disposeScreen = mountArenaScreen(root, { fighterName: fighter.name, onLeave: () => renderProfile(fighter) });
}
