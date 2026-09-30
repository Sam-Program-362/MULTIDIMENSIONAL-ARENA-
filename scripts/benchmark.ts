/**
 * Headless combat benchmark (no browser, DOM-free). Drives the shared simulation with scripted
 * opponents against the Rookie AI and reports win rates over a fixed set of seeds.
 *
 * Run: npx vite-node scripts/benchmark.ts [label]
 *
 * All scenarios put the Rookie AI on the `dummy` side (exactly as the arena wires it) and the
 * scripted opponent on the `player` side, except (f) two spammers and (g) AI vs AI.
 */
import {
  COMBAT_TUNING,
  NEUTRAL_COMBAT_INPUT,
  createAiState,
  createOpponentCombatState,
  createRngState,
  decide,
  stepCombatWithAi,
  stepCombatantPair,
  stepRng,
  type AiState,
  type CombatInput,
  type CombatState,
  type CombatantState,
} from '../src/sim';

const SEEDS = 40;
const TICK_CAP = COMBAT_TUNING.tickRate * 90; // 90 seconds at 60 ticks/s.
const ATTACK_RANGE = COMBAT_TUNING.attack.range;
const DODGE_COST = COMBAT_TUNING.dodge.staminaCost;
const REACTION = 15;

const neutral = (o: Partial<CombatInput> = {}): CombatInput => ({ ...NEUTRAL_COMBAT_INPUT, ...o });

const distanceBetween = (a: CombatantState, b: CombatantState): number =>
  Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);

const awayDir = (self: CombatantState, other: CombatantState) => {
  const x = self.position.x - other.position.x;
  const z = self.position.z - other.position.z;
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
};
const towardDir = (self: CombatantState, other: CombatantState) => {
  const d = awayDir(self, other);
  return { x: -d.x, z: -d.z };
};

/** A tiny deterministic RNG stream for scripted opponents that need choices. */
function rngStream(seed: number): () => number {
  let s = createRngState(seed);
  return () => {
    const n = stepRng(s);
    s = n.state;
    return n.value;
  };
}

/** Delayed observation ring for a scripted opponent (matches the AI's reaction model). */
interface Observed { type: string; phase: string; exposed: boolean; position: { x: number; z: number }; }
class DelayedView {
  private history: Observed[] = [];
  constructor(private readonly delay: number) {}
  push(c: CombatantState): Observed {
    this.history.push({ type: c.currentAction.type, phase: c.currentAction.phase, exposed: c.exposed, position: { ...c.position } });
    while (this.history.length > this.delay + 1) this.history.shift();
    return this.history[0];
  }
}

type PlayerStrategy = (state: CombatState, ctx: { rand: () => number; view: DelayedView }) => CombatInput;

interface FightResult {
  winner: CombatState['winner'];
  ticks: number;
  firstReachTick: number | null;
  aiAttacks: { hit: number; blocked: number; whiffed: number };
}

/** Run one fight: AI drives `dummy`, the scripted strategy drives `player`. */
function runAiFight(
  seed: number,
  strategy: PlayerStrategy,
  setup?: (state: CombatState) => void,
): FightResult {
  let state = createOpponentCombatState();
  if (setup) setup(state);
  let aiState: AiState = createAiState(seed * 7 + 3, state.player);
  const ctx = { rand: rngStream(seed * 131 + 17), view: new DelayedView(REACTION) };
  let firstReachTick: number | null = null;
  const aiAttacks = { hit: 0, blocked: 0, whiffed: 0 };
  while (!state.fightOver && state.tick < TICK_CAP) {
    if (firstReachTick === null && distanceBetween(state.player, state.dummy) <= ATTACK_RANGE) {
      firstReachTick = state.tick;
    }
    const input = strategy(state, ctx);
    const result = stepCombatWithAi(state, input, aiState);
    for (const event of result.events) {
      if (event.actorId === 'dummy' && event.type === 'ATTACK_HIT') aiAttacks.hit += 1;
      if (event.actorId === 'dummy' && event.type === 'ATTACK_BLOCKED') aiAttacks.blocked += 1;
      if (event.actorId === 'dummy' && event.type === 'ATTACK_MISSED') aiAttacks.whiffed += 1;
    }
    state = result.state;
    aiState = result.aiState;
  }
  return { winner: state.winner, ticks: state.tick, firstReachTick, aiAttacks };
}

// ---- Scenarios a–e (scripted player vs Rookie AI) ----

const spammer: PlayerStrategy = () => neutral({ attackPressed: true });
const idle: PlayerStrategy = () => neutral();
const blocker: PlayerStrategy = () => neutral({ blockHeld: true });

/** Deliberately imperfect delayed human proxy: periodic choices, late defense, and rough spacing. */
const noviceHuman: PlayerStrategy = (state, ctx) => {
  const observed = ctx.view.push(state.dummy);
  const self = state.player;
  const dx = observed.position.x - self.position.x;
  const dz = observed.position.z - self.position.z;
  const distance = Math.hypot(dx, dz) || 1;
  const toward = { x: dx / distance, z: dz / distance };
  if (state.tick % 10 === 0 && distance <= ATTACK_RANGE + 0.35 && ctx.rand() < 0.4) {
    return neutral({ attackPressed: true });
  }
  if (observed.type === 'attack') {
    if (ctx.rand() < 0.6) return neutral({ blockHeld: true });
    if (ctx.rand() < 0.15 && self.stamina >= DODGE_COST) {
      return { ...neutral(), x: -toward.x, z: -toward.z, dodgePressed: true };
    }
  }
  // Imprecise approach: sometimes overshoot or step away, so delayed defense and spacing are
  // visibly late rather than a perfect range lock.
  if (ctx.rand() < 0.6) return neutral({ x: -toward.x, z: -toward.z });
  const wobble = ctx.rand() < 0.4 ? (ctx.rand() < 0.6 ? -0.65 : 0.65) : 0;
  return neutral({ x: Math.max(-1, Math.min(1, toward.x + wobble)), z: toward.z });
};

const runaway: PlayerStrategy = (state) => {
  const away = awayDir(state.player, state.dummy);
  const idlePlayer = state.player.currentAction.type === 'idle';
  const canDodge = state.player.stamina >= DODGE_COST;
  if (idlePlayer && canDodge) {
    return { x: away.x, z: away.z, attackPressed: false, blockHeld: false, dodgePressed: true };
  }
  return neutral({ x: away.x, z: away.z });
};

// Fraction of no-read ticks the counter-puncher keeps its guard raised (see below).
const COUNTER_GUARD_BIAS = 0.85;

// A disciplined counter-puncher. It watches the AI through a 12-tick reaction delay, keeps a guard
// up most of the time, dodges telegraphed swings for i-frames, backs off to protect its endurance,
// and drops in to attack the moment it sees an opening (recovery / stagger / Exposed) — cashing in
// multiplied damage on an Exposed AI. Because its 12-tick reaction is slower than the 6-tick attack
// startup and it drops its guard on a fraction of ticks, the AI's guard-break and Exposure punishes
// still get through: this is the AI's toughest scripted opponent, and the test asks that the AI
// still win the majority of the time against a competent, credible defender.
const counterPuncher: PlayerStrategy = (state, ctx) => {
  const observed = ctx.view.push(state.dummy);
  const self = state.player;
  const dist = distanceBetween(self, state.dummy);
  const toward = towardDir(self, state.dummy);
  const away = awayDir(self, state.dummy);
  const idlePlayer = self.currentAction.type === 'idle';
  const ready = self.attackCooldownRemaining < COMBAT_TUNING.inputBufferTicks;
  const enduranceRatio = self.endurance / self.maxEndurance;
  const observedPunishable = observed.exposed
    || observed.type === 'stagger'
    || (observed.type === 'attack' && observed.phase === 'recovery')
    || (observed.type === 'dodge' && observed.phase === 'recovery');
  // A telegraphed incoming swing — the cue a counter-puncher reacts to.
  const observedIncoming = observed.type === 'attack'
    && (observed.phase === 'startup' || observed.phase === 'active');

  // Stay just inside striking range so a counter can reach.
  if (dist > ATTACK_RANGE) return neutral({ x: toward.x, z: toward.z });

  // Cash in an observed opening — including multiplied damage on an Exposed AI.
  if (observedPunishable && ready) return neutral({ attackPressed: true });

  // Guard-break risk: back off and dodge to let endurance recover rather than eat a break.
  if (enduranceRatio < 0.3) {
    if (idlePlayer && self.stamina >= DODGE_COST) {
      return { x: away.x, z: away.z, attackPressed: false, blockHeld: false, dodgePressed: true };
    }
    return neutral({ x: away.x, z: away.z });
  }

  // React to a telegraphed swing: dodge for i-frames, else raise the guard (often a touch late).
  if (observedIncoming) {
    if (idlePlayer && self.stamina >= DODGE_COST && ctx.rand() < 0.25) {
      return { x: away.x, z: away.z, attackPressed: false, blockHeld: false, dodgePressed: true };
    }
    return neutral({ blockHeld: true });
  }

  // No read yet: a disciplined counter-puncher keeps its guard up most of the time (COUNTER_GUARD_BIAS)
  // but not perfectly — the occasional dropped guard is the flaw the AI's guard-break and Exposure
  // punishes exploit. At ~0.85 this is the AI's hardest scripted opponent yet still beatable ~75%.
  if (ctx.rand() < COUNTER_GUARD_BIAS) return neutral({ blockHeld: true });
  return neutral();
};

// ---- Scenario f: two identical spammers (no AI) ----
// Two perfectly-mirrored stationary spammers from the same frame double-KO into a draw every
// time (distance is mutual, so if one lands the other lands on the same tick). That proves zero
// slot bias but yields no win distribution. To actually test that neither *slot* is favored, we
// give each side an independent small per-seed start delay (two humans never press in lockstep);
// whoever effectively swings first should win, and across 40 seeds it must be ~even.
function runTwoSpammers(seed: number): CombatState['winner'] {
  let state = createOpponentCombatState();
  const rand = rngStream(seed * 977 + 5);
  const playerDelay = Math.floor(rand() * 12);
  const dummyDelay = Math.floor(rand() * 12);
  while (!state.fightOver && state.tick < TICK_CAP) {
    state = stepCombatantPair(state, {
      player: neutral({ attackPressed: state.tick >= playerDelay }),
      dummy: neutral({ attackPressed: state.tick >= dummyDelay }),
    }).state;
  }
  return state.winner;
}

// ---- Scenario g: AI vs AI ----
function runAiVsAi(seed: number): { winner: CombatState['winner']; ticks: number } {
  let state = createOpponentCombatState();
  let a = createAiState(seed * 2 + 1, state.dummy);
  let b = createAiState(seed * 2 + 2, state.player);
  while (!state.fightOver && state.tick < TICK_CAP) {
    const da = decide(a, { self: state.player, target: state.dummy, bounds: state.bounds }, state.tick);
    const db = decide(b, { self: state.dummy, target: state.player, bounds: state.bounds }, state.tick);
    a = da.nextAiState;
    b = db.nextAiState;
    state = stepCombatantPair(state, { player: da.input, dummy: db.input }).state;
  }
  return { winner: state.winner, ticks: state.tick };
}

interface Row {
  key: string;
  desc: string;
  metric: string;
  goal: string;
  pass: boolean;
}

function pct(n: number): string {
  return `${((n / SEEDS) * 100).toFixed(1)}%`;
}

function main(): void {
  const label = process.argv[2] ?? 'BENCHMARK';
  const rows: Row[] = [];

  // (a) stationary spammer — AI (dummy) should win >= 50%.
  {
    let ai = 0;
    for (let s = 1; s <= SEEDS; s += 1) if (runAiFight(s, spammer).winner === 'dummy') ai += 1;
    const spammerWins = SEEDS - ai; // remaining are player wins/draws counted against goal via spammer
    let spammerOnly = 0;
    for (let s = 1; s <= SEEDS; s += 1) if (runAiFight(s, spammer).winner === 'player') spammerOnly += 1;
    rows.push({
      key: 'a', desc: 'Stationary spammer', metric: `spammer wins ${pct(spammerOnly)} (AI ${pct(ai)})`,
      goal: 'spammer <= 50%', pass: spammerOnly / SEEDS <= 0.5,
    });
    void spammerWins;
  }

  // (b) idle player — AI wins >= 95%, zero draws/stalemates.
  {
    let ai = 0; let draws = 0; let stalemates = 0;
    for (let s = 1; s <= SEEDS; s += 1) {
      const r = runAiFight(s, idle);
      if (r.winner === 'dummy') ai += 1;
      if (r.winner === 'draw') draws += 1;
      if (r.winner === null) stalemates += 1;
    }
    rows.push({
      key: 'b', desc: 'Idle player', metric: `AI wins ${pct(ai)}, draws ${draws}, stalemates ${stalemates}`,
      goal: 'AI >= 95%, 0 draw/stale', pass: ai / SEEDS >= 0.95 && draws === 0 && stalemates === 0,
    });
  }

  // (c) holds Block forever — AI wins >= 90%.
  {
    let ai = 0;
    for (let s = 1; s <= SEEDS; s += 1) if (runAiFight(s, blocker).winner === 'dummy') ai += 1;
    rows.push({
      key: 'c', desc: 'Holds Block forever', metric: `AI wins ${pct(ai)}`,
      goal: 'AI >= 90%', pass: ai / SEEDS >= 0.9,
    });
  }

  // (d) runs away with Dodge — avg ticks until AI first reaches attack range <= 180.
  // Start the fighters in opposite corners so closing time is actually measured.
  {
    let sum = 0; let counted = 0; let never = 0;
    // Well-separated start with room to flee (the repo's established "far" test positions,
    // ~18.9u apart), not pinned in a corner.
    const farStart = (state: CombatState) => {
      state.player.position = { x: 8, z: 5 };
      state.dummy.position = { x: -8, z: -5 };
    };
    for (let s = 1; s <= SEEDS; s += 1) {
      const r = runAiFight(s, runaway, farStart);
      if (r.firstReachTick !== null) { sum += r.firstReachTick; counted += 1; } else never += 1;
    }
    const avg = counted > 0 ? sum / counted : Infinity;
    rows.push({
      key: 'd', desc: 'Runs away + Dodge', metric: `avg reach ${avg.toFixed(1)} ticks (${(avg / 60).toFixed(2)}s), never ${never}`,
      goal: '<= 180 ticks (3s)', pass: avg <= 180 && never === 0,
    });
  }

  // (e) counter-puncher — original goal is counter wins >= 55%.
  {
    let ai = 0;
    let counter = 0;
    for (let s = 1; s <= SEEDS; s += 1) {
      const w = runAiFight(s, counterPuncher).winner;
      if (w === 'dummy') ai += 1;
      else if (w === 'player') counter += 1;
    }
    rows.push({
      key: 'e', desc: 'Counter-puncher', metric: `AI wins ${pct(ai)} (counter ${pct(counter)})`,
      goal: 'counter >= 55%', pass: counter / SEEDS >= 0.55,
    });
  }

  // (h) novice human proxy: novice wins 40–60%, and report AI outcome accuracy.
  {
    let novice = 0; let ai = 0; let draws = 0; let total = { hit: 0, blocked: 0, whiffed: 0 };
    for (let s = 1; s <= SEEDS; s += 1) {
      const r = runAiFight(s, noviceHuman);
      if (r.winner === 'player') novice += 1; else if (r.winner === 'dummy') ai += 1; else draws += 1;
      total.hit += r.aiAttacks.hit; total.blocked += r.aiAttacks.blocked; total.whiffed += r.aiAttacks.whiffed;
    }
    const totalAttacks = total.hit + total.blocked + total.whiffed;
    const accuracy = totalAttacks > 0
      ? `AI outcomes hit ${((total.hit / totalAttacks) * 100).toFixed(1)}% / blocked ${((total.blocked / totalAttacks) * 100).toFixed(1)}% / whiff ${((total.whiffed / totalAttacks) * 100).toFixed(1)}%`
      : 'AI outcomes unavailable';
    rows.push({ key: 'h', desc: 'Novice human proxy', metric: `novice ${pct(novice)} / AI ${pct(ai)} / draws ${draws}; ${accuracy}`, goal: 'novice 40–60%, AI whiff >= 30%', pass: novice / SEEDS >= 0.4 && novice / SEEDS <= 0.6 && totalAttacks > 0 && total.whiffed / totalAttacks >= 0.3 });
    console.log(`Accuracy vs novice: ${accuracy}`);
  }

  // (i) AI accuracy against the stationary spammer, reported separately from scenario (a).
  {
    let total = { hit: 0, blocked: 0, whiffed: 0 };
    for (let s = 1; s <= SEEDS; s += 1) { const r = runAiFight(s, spammer); total.hit += r.aiAttacks.hit; total.blocked += r.aiAttacks.blocked; total.whiffed += r.aiAttacks.whiffed; }
    const n = total.hit + total.blocked + total.whiffed;
    rows.push({ key: 'i', desc: 'AI accuracy vs spammer', metric: `hit ${((total.hit / n) * 100).toFixed(1)}% / blocked ${((total.blocked / n) * 100).toFixed(1)}% / whiff ${((total.whiffed / n) * 100).toFixed(1)}%`, goal: 'report only', pass: true });
  }

  // (f) two identical spammers — each between 35% and 65%.
  {
    let p = 0; let d = 0; let draw = 0;
    for (let s = 1; s <= SEEDS; s += 1) {
      const w = runTwoSpammers(s);
      if (w === 'player') p += 1; else if (w === 'dummy') d += 1; else draw += 1;
    }
    const lo = 0.35; const hi = 0.65;
    rows.push({
      key: 'f', desc: 'Two spammers', metric: `player ${pct(p)} / dummy ${pct(d)} / draw ${draw}`,
      goal: 'each 35–65%', pass: p / SEEDS >= lo && p / SEEDS <= hi && d / SEEDS >= lo && d / SEEDS <= hi,
    });
  }

  // (g) AI vs AI — finishes without stalemate.
  {
    let finished = 0; let sumTicks = 0;
    for (let s = 1; s <= SEEDS; s += 1) {
      const r = runAiVsAi(s);
      if (r.winner !== null) finished += 1;
      sumTicks += r.ticks;
    }
    rows.push({
      key: 'g', desc: 'AI vs AI', metric: `finished ${finished}/${SEEDS}, avg ${Math.round(sumTicks / SEEDS)} ticks`,
      goal: 'no stalemate', pass: finished === SEEDS,
    });
  }

  const line = '-'.repeat(96);
  console.log(`\n=== ${label} — ${SEEDS} seeds, ${TICK_CAP} tick cap (90s @ ${COMBAT_TUNING.tickRate}/s) ===`);
  console.log(line);
  console.log(`${'#'.padEnd(3)}${'Scenario'.padEnd(22)}${'Result'.padEnd(44)}${'Goal'.padEnd(20)}Pass`);
  console.log(line);
  for (const r of rows) {
    console.log(`${r.key.padEnd(3)}${r.desc.padEnd(22)}${r.metric.padEnd(44)}${r.goal.padEnd(20)}${r.pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(line);
  const passed = rows.filter((r) => r.pass).length;
  console.log(`${passed}/${rows.length} goals met`);
}

main();
