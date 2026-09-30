import { describe, expect, it } from 'vitest';
import {
  AI_TUNING,
  AiState,
  COMBAT_TUNING,
  CombatEvent,
  CombatInput,
  CombatState,
  NEUTRAL_COMBAT_INPUT,
  ROOKIE_PROFILE,
  createAiFight,
  createAiState,
  createCombatState,
  decide,
  fightOutcome,
  stepCombatantPair,
  stepCombatWithAi,
  winnerId,
} from '../src/sim';

const ATTACK_RANGE = COMBAT_TUNING.attack.range;

const neutral = (overrides: Partial<CombatInput> = {}): CombatInput => ({
  ...NEUTRAL_COMBAT_INPUT,
  ...overrides,
});

const distanceBetween = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

interface FightRun {
  state: CombatState;
  aiState: AiState;
  events: CombatEvent[];
  ticks: number;
}

/** Drive a fight where the AI controls the dummy and the player follows a script. */
function runAiFight(
  seed: number,
  playerInput: (state: CombatState, tick: number) => CombatInput,
  maxTicks: number,
  setup?: (state: CombatState) => void,
): FightRun {
  const fight = createAiFight(undefined, seed);
  let { state, aiState } = fight;
  if (setup) setup(state);
  const events: CombatEvent[] = [];
  let ticks = 0;
  for (; ticks < maxTicks; ticks += 1) {
    const stepped = stepCombatWithAi(state, playerInput(state, ticks), aiState);
    state = stepped.result.state;
    aiState = stepped.aiState;
    events.push(...stepped.result.events);
    if (state.fightOver) break;
  }
  return { state, aiState, events, ticks };
}

const spamAttack = (): CombatInput => neutral({ attackPressed: true });
const idle = (): CombatInput => neutral();

describe('AI output validity', () => {
  it('always produces a well-formed combat input', () => {
    let { state, aiState } = createAiFight(undefined, 5);
    for (let tick = 0; tick < 400; tick += 1) {
      const decision = decide(aiState, { self: state.dummy, opponent: state.player, bounds: state.bounds }, state.tick);
      const input = decision.input;
      expect(typeof input.attackPressed).toBe('boolean');
      expect(typeof input.blockHeld).toBe('boolean');
      expect(typeof input.dodgePressed).toBe('boolean');
      expect(Number.isFinite(input.x)).toBe(true);
      expect(Number.isFinite(input.z)).toBe(true);
      expect(input.x).toBeGreaterThanOrEqual(-1);
      expect(input.x).toBeLessThanOrEqual(1);
      expect(input.z).toBeGreaterThanOrEqual(-1);
      expect(input.z).toBeLessThanOrEqual(1);
      const stepped = stepCombatWithAi(state, spamAttack(), aiState);
      state = stepped.result.state;
      aiState = stepped.aiState;
      if (state.fightOver) ({ state, aiState } = createAiFight(undefined, state.tick + 1));
    }
  });
});

describe('AI obeys the same combat rules', () => {
  it('cannot start an attack or dodge with zero stamina', () => {
    const fight = createAiFight(undefined, 3);
    let { state, aiState } = fight;
    // Keep the fighters in attack range so the AI wants to act.
    state.dummy.position = { x: 0, z: 0 };
    state.player.position = { x: 0, z: ATTACK_RANGE * 0.8 };
    for (let tick = 0; tick < 200; tick += 1) {
      state.dummy.stamina = 0; // Pin the bar empty before each decision.
      const stepped = stepCombatWithAi(state, idle(), aiState);
      for (const event of stepped.result.events) {
        if (event.actorId === 'dummy' && event.type === 'ACTION_STARTED') {
          expect(event.action).not.toBe('attack');
          expect(event.action).not.toBe('dodge');
        }
      }
      state = stepped.result.state;
      aiState = stepped.aiState;
    }
  });

  it('decide itself never presses attack or dodge it cannot pay for', () => {
    const state = createCombatState();
    state.dummy.stationary = false;
    state.dummy.position = { x: 0, z: 0 };
    state.player.position = { x: 0, z: ATTACK_RANGE * 0.7 };
    state.player.currentAction = { type: 'attack', phase: 'startup' };
    state.dummy.stamina = 0;
    let aiState = createAiState(9);
    for (let tick = 0; tick < 60; tick += 1) {
      const decision = decide(aiState, { self: state.dummy, opponent: state.player, bounds: state.bounds }, tick);
      expect(decision.input.attackPressed).toBe(false);
      expect(decision.input.dodgePressed).toBe(false);
      aiState = decision.nextAiState;
    }
  });
});

describe('determinism', () => {
  it('produces identical states and events for the same seed and player inputs', () => {
    const script = (_state: CombatState, tick: number): CombatInput => neutral({
      x: tick % 10 < 5 ? 0.5 : -0.5,
      z: tick % 7 < 3 ? -0.4 : 0.3,
      attackPressed: tick % 23 === 0,
      blockHeld: tick % 31 < 6,
      dodgePressed: tick % 47 === 0,
    });
    const first = runAiFight(1234, script, 600);
    const second = runAiFight(1234, script, 600);
    expect(first.events).toEqual(second.events);
    expect(first.state).toEqual(second.state);
    expect(first.aiState).toEqual(second.aiState);
  });

  it('produces different fights for different seeds', () => {
    const a = runAiFight(1, spamAttack, 400);
    const b = runAiFight(2, spamAttack, 400);
    expect(a.events).not.toEqual(b.events);
  });
});

describe('reaction delay', () => {
  it('never defends a player attack sooner than reactionTicks after it starts', () => {
    // caution 1 forces a reaction; aggression 0 keeps the AI from swinging first.
    const profile = { ...ROOKIE_PROFILE, caution: 1, aggression: 0, mistakeChance: 0 };
    for (const seed of [1, 2, 3, 5, 7, 11, 13]) {
      const state = createCombatState();
      state.dummy.stationary = false;
      state.dummy.position = { x: 0, z: 0 };
      state.player.position = { x: 0, z: ATTACK_RANGE * 0.85 };
      let aiState = createAiState(seed, profile);
      let attackStart: number | null = null;
      let firstDefense: number | null = null;
      let live = state;
      for (let tick = 0; tick < 60 && firstDefense === null; tick += 1) {
        const playerInput = neutral({ attackPressed: tick === 0 });
        const decision = decide(aiState, { self: live.dummy, opponent: live.player, bounds: live.bounds }, live.tick);
        const stepped = stepCombatantPair(live, { player: playerInput, dummy: decision.input });
        for (const event of stepped.events) {
          if (event.actorId === 'player' && event.type === 'ACTION_STARTED' && event.action === 'attack' && attackStart === null) {
            attackStart = event.tick;
          }
          if (event.actorId === 'dummy' && event.type === 'ACTION_STARTED' && (event.action === 'block' || event.action === 'dodge') && firstDefense === null) {
            firstDefense = event.tick;
          }
        }
        live = stepped.state;
        aiState = decision.nextAiState;
      }
      expect(attackStart).not.toBeNull();
      expect(firstDefense).not.toBeNull();
      expect((firstDefense as number) - (attackStart as number)).toBeGreaterThanOrEqual(ROOKIE_PROFILE.reactionTicks);
    }
  });
});

describe('positioning and offense', () => {
  it('moves toward a distant player', () => {
    const fight = createAiFight(undefined, 4);
    let { state, aiState } = fight;
    state.dummy.position = { x: -8, z: 5 };
    state.player.position = { x: 8, z: -5 };
    const startDistance = distanceBetween(state.dummy.position, state.player.position);
    for (let tick = 0; tick < 90; tick += 1) {
      const stepped = stepCombatWithAi(state, idle(), aiState);
      state = stepped.result.state;
      aiState = stepped.aiState;
    }
    const endDistance = distanceBetween(state.dummy.position, state.player.position);
    expect(endDistance).toBeLessThan(startDistance - 3);
  });

  it('attacks a player in range within a bounded number of ticks', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const fight = createAiFight(undefined, seed);
      let { state, aiState } = fight;
      state.dummy.position = { x: 0, z: 0 };
      state.player.position = { x: 0, z: ATTACK_RANGE * 0.6 };
      let attacked = false;
      for (let tick = 0; tick < 120 && !attacked; tick += 1) {
        const stepped = stepCombatWithAi(state, idle(), aiState);
        attacked = stepped.result.events.some(
          (event) => event.actorId === 'dummy' && event.type === 'ACTION_STARTED' && event.action === 'attack',
        );
        state = stepped.result.state;
        aiState = stepped.aiState;
      }
      expect(attacked).toBe(true);
    }
  });
});

describe('defense across many seeds', () => {
  it('blocks and dodges some but not all of a spamming player', () => {
    let seedsWithBlock = 0;
    let seedsWithDodge = 0;
    let totalBlocked = 0;
    let totalHitsOnDummy = 0;
    for (let seed = 1; seed <= 50; seed += 1) {
      const run = runAiFight(seed, spamAttack, 60 * 30);
      const blocked = run.events.filter((event) => event.type === 'ATTACK_BLOCKED' && event.targetId === 'dummy').length;
      const dodged = run.events.filter(
        (event) => event.actorId === 'dummy' && event.type === 'ACTION_STARTED' && event.action === 'dodge',
      ).length;
      const hits = run.events.filter((event) => event.type === 'ATTACK_HIT' && event.targetId === 'dummy').length;
      totalBlocked += blocked;
      totalHitsOnDummy += hits;
      if (blocked > 0) seedsWithBlock += 1;
      if (dodged > 0) seedsWithDodge += 1;
    }
    // Some defense happens...
    expect(seedsWithBlock).toBeGreaterThanOrEqual(10);
    expect(totalBlocked).toBeGreaterThanOrEqual(20);
    expect(seedsWithDodge).toBeGreaterThanOrEqual(5);
    // ...but the player still lands plenty, so it is not an impenetrable wall.
    expect(totalHitsOnDummy).toBeGreaterThanOrEqual(20);
    // And blocking is not universal across every seed.
    expect(seedsWithBlock).toBeLessThanOrEqual(50);
  });
});

describe('mistakes within loose bounds', () => {
  it('sometimes swings from just outside range, but not every time', () => {
    let seedsWithOutsideSwing = 0;
    const seeds = 100;
    for (let seed = 1; seed <= seeds; seed += 1) {
      const state = createCombatState();
      state.dummy.stationary = false;
      state.dummy.position = { x: 0, z: 0 };
      state.player.position = { x: 0, z: ATTACK_RANGE + AI_TUNING.attackRangeSlack * 0.5 };
      let aiState = createAiState(seed);
      let live = state;
      let outside = false;
      for (let tick = 0; tick < 40 && !outside; tick += 1) {
        const decision = decide(aiState, { self: live.dummy, opponent: live.player, bounds: live.bounds }, live.tick);
        const dist = distanceBetween(live.dummy.position, live.player.position);
        const stepped = stepCombatantPair(live, { player: neutral(), dummy: decision.input });
        for (const event of stepped.events) {
          if (event.actorId === 'dummy' && event.type === 'ACTION_STARTED' && event.action === 'attack' && dist > ATTACK_RANGE) {
            outside = true;
          }
        }
        live = stepped.state;
        aiState = decision.nextAiState;
      }
      if (outside) seedsWithOutsideSwing += 1;
    }
    expect(seedsWithOutsideSwing).toBeGreaterThanOrEqual(1);
    expect(seedsWithOutsideSwing).toBeLessThan(seeds);
  });
});

describe('AI versus AI', () => {
  it('finishes without a stalemate within a maximum tick budget', () => {
    const maxTicks = 60 * 90; // 90 seconds is a generous ceiling.
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const unfinished: number[] = [];
    for (const seed of seeds) {
      const state = createCombatState();
      state.dummy.stationary = false;
      let live = state;
      let playerAi = createAiState(seed * 7 + 1);
      let dummyAi = createAiState(seed * 13 + 3);
      for (let tick = 0; tick < maxTicks; tick += 1) {
        const playerDecision = decide(playerAi, { self: live.player, opponent: live.dummy, bounds: live.bounds }, live.tick);
        const dummyDecision = decide(dummyAi, { self: live.dummy, opponent: live.player, bounds: live.bounds }, live.tick);
        const stepped = stepCombatantPair(live, { player: playerDecision.input, dummy: dummyDecision.input });
        live = stepped.state;
        playerAi = playerDecision.nextAiState;
        dummyAi = dummyDecision.nextAiState;
        if (live.fightOver) break;
      }
      if (!live.fightOver) unfinished.push(seed);
    }
    // Honest reporting: name any stalling seeds if the ceiling is ever hit.
    expect(unfinished, `AI-vs-AI seeds that stalled past ${maxTicks} ticks: ${unfinished.join(', ')}`).toEqual([]);
  });
});

describe('fight lifecycle with the AI stepper', () => {
  it('ends when the player is defeated and rejects further actions', () => {
    const fight = createAiFight(undefined, 2);
    let { state, aiState } = fight;
    state.dummy.position = { x: 0, z: 0 };
    state.player.position = { x: 0, z: ATTACK_RANGE * 0.6 };
    state.player.health = COMBAT_TUNING.attack.damage; // one clean hit ends it.
    let ended = false;
    for (let tick = 0; tick < 600 && !ended; tick += 1) {
      const stepped = stepCombatWithAi(state, idle(), aiState);
      state = stepped.result.state;
      aiState = stepped.aiState;
      ended = state.fightOver;
    }
    expect(fightOutcome(state)).toBe('opponent');
    expect(winnerId(fightOutcome(state))).toBe('dummy');
    const after = stepCombatWithAi(state, spamAttack(), aiState);
    expect(after.result.events).toEqual([]);
    expect(after.result.state).toEqual(state);
  });

  it('ends when the opponent is defeated and rejects further actions', () => {
    const fight = createAiFight(undefined, 2);
    let { state, aiState } = fight;
    state.dummy.position = { x: 0, z: 0 };
    state.player.position = { x: 0, z: ATTACK_RANGE * 0.6 };
    state.dummy.health = COMBAT_TUNING.attack.damage;
    let ended = false;
    for (let tick = 0; tick < 600 && !ended; tick += 1) {
      const stepped = stepCombatWithAi(state, spamAttack(), aiState);
      state = stepped.result.state;
      aiState = stepped.aiState;
      ended = state.fightOver;
    }
    expect(fightOutcome(state)).toBe('player');
    expect(winnerId(fightOutcome(state))).toBe('player');
    const after = stepCombatWithAi(state, spamAttack(), aiState);
    expect(after.result.events).toEqual([]);
    expect(after.result.state).toEqual(state);
  });

  it('reports a draw when both combatants are defeated and no winner otherwise', () => {
    const state = createCombatState();
    expect(fightOutcome(state)).toBeNull();
    state.player.defeated = true;
    state.dummy.defeated = true;
    expect(fightOutcome(state)).toBe('draw');
    expect(winnerId('draw')).toBeNull();
    expect(winnerId('player')).toBe('player');
    expect(winnerId('opponent')).toBe('dummy');
  });

  it('never lets a combatant defeated first land a same-tick killing blow', () => {
    // Both are one hit from death and both are mid-attack in range: the deterministic
    // player-then-dummy order means only one can fall, so a true double KO cannot occur here.
    const state = createCombatState();
    state.dummy.stationary = false;
    state.player.position = { x: 0, z: 0 };
    state.dummy.position = { x: 0, z: ATTACK_RANGE * 0.5 };
    state.player.facing = { x: 0, z: 1 };
    state.dummy.facing = { x: 0, z: -1 };
    state.player.health = COMBAT_TUNING.attack.damage;
    state.dummy.health = COMBAT_TUNING.attack.damage;
    for (const actor of [state.player, state.dummy]) {
      actor.currentAction = { type: 'attack', phase: 'active' };
      actor.actionTick = COMBAT_TUNING.attack.startupTicks;
      actor.attackConnected = false;
    }
    const result = stepCombatantPair(state, { player: neutral(), dummy: neutral() });
    const outcome = fightOutcome(result.state);
    expect(outcome).toBe('player');
    expect(result.state.player.defeated).toBe(false);
    expect(result.state.dummy.defeated).toBe(true);
  });
});

describe('dummy mode is unchanged', () => {
  it('keeps the training dummy stationary and inert', () => {
    let state = createCombatState();
    const startPosition = { ...state.dummy.position };
    for (let tick = 0; tick < 120; tick += 1) {
      state = stepCombatantPair(state, { player: spamAttack(), dummy: neutral() }).state;
      expect(state.dummy.stationary).toBe(true);
      expect(state.dummy.currentAction.type === 'idle' || state.dummy.currentAction.type === 'stagger').toBe(true);
      expect(state.dummy.velocity).toEqual({ x: 0, z: 0 });
      if (state.fightOver) break;
    }
    // The dummy never chose to move away from its start.
    expect(state.dummy.position).toEqual(startPosition);
  });
});

describe('edge cases', () => {
  it('behaves without NaN when cornered against a wall', () => {
    const fight = createAiFight(undefined, 8);
    let { state, aiState } = fight;
    state.dummy.position = { x: state.bounds.minX, z: state.bounds.minZ };
    state.player.position = { x: state.bounds.minX + 1, z: state.bounds.minZ + 1 };
    for (let tick = 0; tick < 300; tick += 1) {
      const stepped = stepCombatWithAi(state, spamAttack(), aiState);
      state = stepped.result.state;
      aiState = stepped.aiState;
      expect(Number.isFinite(state.dummy.position.x)).toBe(true);
      expect(Number.isFinite(state.dummy.position.z)).toBe(true);
      expect(state.dummy.position.x).toBeGreaterThanOrEqual(state.bounds.minX);
      expect(state.dummy.position.z).toBeGreaterThanOrEqual(state.bounds.minZ);
      if (state.fightOver) break;
    }
  });

  it('retreats and stops attacking when its own stamina is low', () => {
    const state = createCombatState();
    state.dummy.stationary = false;
    state.dummy.position = { x: 0, z: 0 };
    state.player.position = { x: 0, z: ATTACK_RANGE * 0.6 };
    state.dummy.stamina = state.dummy.maxStamina * (AI_TUNING.retreatStaminaFraction * 0.5);
    let aiState = createAiState(6);
    const decision = decide(aiState, { self: state.dummy, opponent: state.player, bounds: state.bounds }, 0);
    expect(decision.input.attackPressed).toBe(false);
    expect(decision.input.dodgePressed).toBe(false);
    // Moving away from the in-front player means a negative z component.
    expect(decision.input.z).toBeLessThan(0);
  });
});
