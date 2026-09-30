/**
 * Headless combat benchmark (no browser, no persistence).
 *
 * Runs scripted "player" bots against the Rookie AI opponent through the exact same
 * `stepCombatWithAi` path the game uses, plus AI-vs-AI fights, and prints a summary table.
 *
 * Usage: npx vite-node scripts/benchmark.ts [seedCount]
 */
import {
  COMBAT_TUNING,
  NEUTRAL_COMBAT_INPUT,
  ROOKIE_PROFILE,
  createAiState,
  createOpponentCombatState,
  decide,
  stepCombatWithAi,
  stepCombatantPair,
  type AiProfile,
  type AiState,
  type CombatInput,
  type CombatState,
  type CombatantState,
} from '../src/sim';

const SEEDS = Number(process.argv[2] ?? 40);
const MAX_SECONDS = 90;
const MAX_TICKS = COMBAT_TUNING.tickRate * MAX_SECONDS;
const REACTION_TICKS = 12; // The scripted counter-puncher reacts as slowly as the AI does.

interface BotSnapshot {
  actionType: string;
  actionPhase: string;
  position: { x: number; z: number };
}

type Bot = (state: CombatState, tick: number, memory: BotMemory) => CombatInput;

interface BotMemory {
  history: BotSnapshot[];
  blockUntil: number;
}

const neutral = (overrides: Partial<CombatInput> = {}): CombatInput => ({
  ...NEUTRAL_COMBAT_INPUT,
  ...overrides,
});

const snapshotOf = (target: CombatantState): BotSnapshot => ({
  actionType: target.currentAction.type,
  actionPhase: target.currentAction.phase,
  position: { ...target.position },
});

/** Push the current AI state into the bot's delayed view and return the delayed snapshot. */
function observeDelayed(memory: BotMemory, target: CombatantState): BotSnapshot {
  memory.history.push(snapshotOf(target));
  while (memory.history.length > REACTION_TICKS + 1) memory.history.shift();
  return memory.history[0]!;
}

const towards = (from: { x: number; z: number }, to: { x: number; z: number }) => {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
};

/** (a) Stationary spammer: never moves, presses Attack whenever it is available. */
const spammer: Bot = (state) => neutral({
  attackPressed: state.player.currentAction.type === 'idle' && state.player.attackCooldownRemaining <= 0,
});

/** (b) Idle player: no input at all. */
const idle: Bot = () => neutral();

/** (c) Holds Block forever. */
const blocker: Bot = () => neutral({ blockHeld: true });

/** (d) Runs away, dodging away whenever stamina allows. */
const runner: Bot = (state) => {
  const away = towards(state.dummy.position, state.player.position);
  return neutral({
    x: away.x,
    z: away.z,
    dodgePressed: state.player.stamina >= COMBAT_TUNING.dodge.staminaCost,
  });
};

/**
 * (e) Counter-puncher: keeps facing the AI (auto-facing does this while idle/blocking),
 * blocks or dodges when the AI's attack is observed in startup (12-tick delayed view),
 * and attacks when the AI is observed in attack recovery or staggered, walking in if needed.
 */
const counterPuncher: Bot = (state, tick, memory) => {
  const observed = observeDelayed(memory, state.dummy);
  const self = state.player;
  const distance = Math.hypot(
    state.dummy.position.x - self.position.x,
    state.dummy.position.z - self.position.z,
  );
  const input = neutral();
  const observedStartup = observed.actionType === 'attack' && observed.actionPhase === 'startup';
  const observedPunishable = observed.actionType === 'stagger'
    || (observed.actionType === 'attack' && observed.actionPhase === 'recovery');

  if (observedStartup && distance <= COMBAT_TUNING.attack.range + 0.6) {
    // Alternate block and dodge like a defensive player would.
    if (tick % 2 === 0 && self.stamina >= COMBAT_TUNING.dodge.staminaCost) {
      const away = towards(state.dummy.position, self.position);
      return neutral({ x: away.x, z: away.z, dodgePressed: true });
    }
    memory.blockUntil = tick + 24;
  }
  if (observedPunishable) {
    if (distance > COMBAT_TUNING.attack.range - 0.15) {
      const closeIn = towards(self.position, state.dummy.position);
      input.x = closeIn.x;
      input.z = closeIn.z;
    }
    if (
      self.currentAction.type === 'idle'
      && self.attackCooldownRemaining <= 0
      && distance <= COMBAT_TUNING.attack.range
    ) {
      input.attackPressed = true;
      memory.blockUntil = 0;
    }
  }
  input.blockHeld = tick < memory.blockUntil;
  return input;
};

interface FightOutcome {
  winner: CombatState['winner'];
  ticks: number;
  guardBreaksOnPlayer: number;
  /** Spans (ticks) the AI needed to reach attack range after the target escaped it. */
  reachSpans: number[];
}

function runFight(seed: number, bot: Bot): FightOutcome {
  let state = createOpponentCombatState();
  let aiState = createAiState(seed, state.player);
  const memory: BotMemory = { history: [], blockUntil: 0 };
  let guardBreaksOnPlayer = 0;
  const reachSpans: number[] = [];
  let outOfRangeSince: number | null = null;

  for (let tick = 0; tick < MAX_TICKS && !state.fightOver; tick += 1) {
    const input = bot(state, tick, memory);
    const result = stepCombatWithAi(state, input, aiState);
    state = result.state;
    aiState = result.aiState;
    for (const event of result.events) {
      if (event.type === 'GUARD_BROKEN' && event.actorId === 'player') guardBreaksOnPlayer += 1;
    }
    const distance = Math.hypot(
      state.player.position.x - state.dummy.position.x,
      state.player.position.z - state.dummy.position.z,
    );
    if (distance > COMBAT_TUNING.attack.range) {
      outOfRangeSince ??= tick;
    } else if (outOfRangeSince !== null) {
      reachSpans.push(tick - outOfRangeSince);
      outOfRangeSince = null;
    }
  }
  return { winner: state.winner, ticks: state.tick, guardBreaksOnPlayer, reachSpans };
}

function runAiVsAi(seed: number): { finished: boolean; ticks: number } {
  let state = createOpponentCombatState();
  let left: AiState = createAiState(seed * 2 + 1, state.dummy);
  let right: AiState = createAiState(seed * 2 + 2, state.player);
  let ticks = 0;
  while (!state.fightOver && ticks < MAX_TICKS) {
    const leftDecision = decide(left, { self: state.player, target: state.dummy, bounds: state.bounds }, state.tick);
    const rightDecision = decide(right, { self: state.dummy, target: state.player, bounds: state.bounds }, state.tick);
    left = leftDecision.nextAiState;
    right = rightDecision.nextAiState;
    state = stepCombatantPair(state, { player: leftDecision.input, dummy: rightDecision.input }).state;
    ticks += 1;
  }
  return { finished: state.fightOver, ticks };
}

function summarize(name: string, bot: Bot): void {
  let playerWins = 0;
  let aiWins = 0;
  let draws = 0;
  let unfinished = 0;
  let breaks = 0;
  let totalTicks = 0;
  const allSpans: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const outcome = runFight(seed, bot);
    if (outcome.winner === 'player') playerWins += 1;
    else if (outcome.winner === 'dummy') aiWins += 1;
    else if (outcome.winner === 'draw') draws += 1;
    else unfinished += 1;
    if (outcome.guardBreaksOnPlayer > 0) breaks += 1;
    totalTicks += outcome.ticks;
    allSpans.push(...outcome.reachSpans);
  }
  const pct = (n: number) => `${((n / SEEDS) * 100).toFixed(0)}%`;
  const meanSpan = allSpans.length
    ? (allSpans.reduce((a, b) => a + b, 0) / allSpans.length / COMBAT_TUNING.tickRate).toFixed(2)
    : 'n/a';
  const maxSpan = allSpans.length
    ? (Math.max(...allSpans) / COMBAT_TUNING.tickRate).toFixed(2)
    : 'n/a';
  console.log(
    `${name.padEnd(16)} player ${pct(playerWins)}  ai ${pct(aiWins)}  draw ${pct(draws)}  `
    + `unfinished ${pct(unfinished)}  guard-broken ${pct(breaks)}  `
    + `avgFight ${(totalTicks / SEEDS / COMBAT_TUNING.tickRate).toFixed(1)}s  `
    + `reachSpan avg ${meanSpan}s max ${maxSpan}s`,
  );
}

/**
 * (e2) Skilled player proxy: the same controller rules and the same 12-tick reaction delay,
 * but with human-quality parameters - near-per-tick micro, no scripted mistakes, disciplined
 * shield use. No extra information, no stat changes, no reduced reaction delay.
 */
const SKILLED_PROFILE: AiProfile = {
  ...ROOKIE_PROFILE,
  decisionIntervalTicks: 2,
  mistakeChance: 0,
  aggression: 0.95,
  caution: 0.9,
  punishChance: 1,
  entryShieldChance: 1,
  patienceTicksMin: 20,
  patienceTicksMax: 40,
  disengageTicksMin: 12,
  disengageTicksMax: 24,
};

function runSkilledFight(seed: number): CombatState['winner'] {
  let state = createOpponentCombatState();
  let playerAi = createAiState(seed * 7 + 1, state.dummy, SKILLED_PROFILE);
  let rookieAi = createAiState(seed * 7 + 2, state.player);
  let ticks = 0;
  while (!state.fightOver && ticks < MAX_TICKS) {
    const p = decide(playerAi, { self: state.player, target: state.dummy, bounds: state.bounds }, state.tick, SKILLED_PROFILE);
    const d = decide(rookieAi, { self: state.dummy, target: state.player, bounds: state.bounds }, state.tick);
    playerAi = p.nextAiState;
    rookieAi = d.nextAiState;
    state = stepCombatantPair(state, { player: p.input, dummy: d.input }).state;
    ticks += 1;
  }
  return state.winner;
}

console.log(`Benchmark: ${SEEDS} seeds/scenario, cap ${MAX_SECONDS}s at ${COMBAT_TUNING.tickRate} ticks/s`);
summarize('(a) spammer', spammer);
summarize('(b) idle', idle);
summarize('(c) blocker', blocker);
summarize('(d) runner', runner);
summarize('(e) counter', counterPuncher);

{
  let wins = 0;
  let losses = 0;
  let neither = 0;
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const winner = runSkilledFight(seed);
    if (winner === 'player') wins += 1;
    else if (winner === 'dummy') losses += 1;
    else neither += 1;
  }
  console.log(
    `(e2) skilled      player ${((wins / SEEDS) * 100).toFixed(0)}%  ai ${((losses / SEEDS) * 100).toFixed(0)}%  `
    + `other ${((neither / SEEDS) * 100).toFixed(0)}%  (same rules, same 12-tick reaction delay)`,
  );
}

let finished = 0;
let aiTicks = 0;
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const outcome = runAiVsAi(seed);
  if (outcome.finished) finished += 1;
  aiTicks += outcome.ticks;
}
console.log(
  `(f) AI vs AI      finished ${finished}/${SEEDS}  avg ${(aiTicks / SEEDS / COMBAT_TUNING.tickRate).toFixed(1)}s`,
);
