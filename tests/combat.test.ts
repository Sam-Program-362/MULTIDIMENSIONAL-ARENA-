import { describe, expect, it } from 'vitest';
import {
  COMBAT_TUNING,
  CombatEvent,
  CombatInput,
  CombatState,
  NEUTRAL_COMBAT_INPUT,
  createCombatState,
  deriveCombatVitals,
  stepCombat,
  stepCombatantPair,
} from '../src/sim';

const neutral = (overrides: Partial<CombatInput> = {}): CombatInput => ({
  ...NEUTRAL_COMBAT_INPUT,
  ...overrides,
});

function runTicks(
  initial: CombatState,
  count: number,
  inputForTick: (index: number) => CombatInput = () => neutral(),
): { state: CombatState; events: CombatEvent[] } {
  let state = initial;
  const events: CombatEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    const result = stepCombat(state, inputForTick(index));
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

function readyPlayerAttack(state: CombatState): CombatState {
  state.player.currentAction = { type: 'attack', phase: 'active' };
  state.player.actionTick = COMBAT_TUNING.attack.startupTicks;
  state.player.attackConnected = false;
  const toward = {
    x: state.dummy.position.x - state.player.position.x,
    z: state.dummy.position.z - state.player.position.z,
  };
  const length = Math.hypot(toward.x, toward.z);
  state.player.facing = { x: toward.x / length, z: toward.z / length };
  return state;
}

function faceDummyTowardPlayer(state: CombatState): void {
  const toward = {
    x: state.player.position.x - state.dummy.position.x,
    z: state.player.position.z - state.dummy.position.z,
  };
  const length = Math.hypot(toward.x, toward.z);
  state.dummy.facing = { x: toward.x / length, z: toward.z / length };
}

const pairStep = (state: CombatState, dummy: Partial<CombatInput> = {}) => stepCombatantPair(state, {
  player: neutral(),
  dummy: neutral(dummy),
});

describe('attack state machine', () => {
  it('honors attack startup, active, and recovery timing in ticks', () => {
    let state = createCombatState();
    let result = stepCombat(state, neutral({ attackPressed: true }));
    state = result.state;
    expect(result.events.map((event) => event.type)).toContain('ACTION_STARTED');
    expect(state.player.currentAction).toEqual({ type: 'attack', phase: 'startup' });
    expect(result.events.some((event) => event.type === 'ATTACK_HIT')).toBe(false);

    const remainingStartup = runTicks(state, COMBAT_TUNING.attack.startupTicks - 1);
    state = remainingStartup.state;
    expect(state.player.currentAction).toEqual({ type: 'attack', phase: 'active' });
    expect(remainingStartup.events.some((event) => event.type === 'ATTACK_HIT')).toBe(false);

    result = stepCombat(state, neutral());
    state = result.state;
    expect(result.events.some((event) => event.type === 'ATTACK_HIT')).toBe(true);

    const throughActive = runTicks(state, COMBAT_TUNING.attack.activeTicks - 1);
    state = throughActive.state;
    expect(state.player.currentAction.phase).toBe('recovery');

    const throughRecovery = runTicks(state, COMBAT_TUNING.attack.recoveryTicks);
    expect(throughRecovery.state.player.currentAction).toEqual({ type: 'idle', phase: 'idle' });
  });

  it('hits at the exact edge of range when the target is inside the facing arc', () => {
    const state = createCombatState();
    state.player.position = { x: 0, z: 0 };
    state.dummy.position = { x: COMBAT_TUNING.attack.range, z: 0 };
    state.player.facing = { x: 1, z: 0 };
    readyPlayerAttack(state);
    const result = stepCombat(state, neutral());
    expect(result.events.some((event) => event.type === 'ATTACK_HIT')).toBe(true);
    expect(result.state.dummy.health).toBeLessThan(result.state.dummy.maxHealth);
  });

  it('misses outside attack range', () => {
    let state = createCombatState();
    state.player.position = { x: 0, z: 0 };
    state.dummy.position = { x: COMBAT_TUNING.attack.range + 0.01, z: 0 };
    state = stepCombat(state, neutral({ attackPressed: true })).state;
    const result = runTicks(state, COMBAT_TUNING.attack.startupTicks + COMBAT_TUNING.attack.activeTicks - 1);
    expect(result.events.some((event) => event.type === 'ATTACK_HIT')).toBe(false);
    expect(result.events.some((event) => event.type === 'ATTACK_MISSED')).toBe(true);
  });

  it('misses outside the locked facing arc', () => {
    let state = createCombatState();
    state = stepCombat(state, neutral({ attackPressed: true })).state;
    state.dummy.position = {
      x: state.player.position.x - state.player.facing.x,
      z: state.player.position.z - state.player.facing.z,
    };
    const result = runTicks(state, COMBAT_TUNING.attack.startupTicks + COMBAT_TUNING.attack.activeTicks - 1);
    expect(result.events.some((event) => event.type === 'ATTACK_HIT')).toBe(false);
    expect(result.events.some((event) => event.type === 'ATTACK_MISSED')).toBe(true);
  });

  it('cannot start another attack during recovery', () => {
    let state = runTicks(createCombatState(), COMBAT_TUNING.attack.startupTicks + COMBAT_TUNING.attack.activeTicks,
      (index) => neutral({ attackPressed: index === 0 })).state;
    expect(state.player.currentAction.phase).toBe('recovery');
    const result = stepCombat(state, neutral({ attackPressed: true }));
    expect(result.state.player.currentAction.type).toBe('attack');
    expect(result.events.filter((event) => event.type === 'ACTION_STARTED')).toHaveLength(0);
  });

  it('fires a buffered attack as soon as recovery ends', () => {
    const total = COMBAT_TUNING.attack.startupTicks + COMBAT_TUNING.attack.activeTicks + COMBAT_TUNING.attack.recoveryTicks;
    let state = stepCombat(createCombatState(), neutral({ attackPressed: true })).state;
    state = runTicks(state, total - 6).state;
    expect(state.player.currentAction.phase).toBe('recovery');
    state = stepCombat(state, neutral({ attackPressed: true })).state;
    const result = runTicks(state, 5);
    expect(result.events.some((event) => event.type === 'ACTION_STARTED' && event.action === 'attack')).toBe(true);
    expect(result.state.player.currentAction.type).toBe('attack');
  });
});

describe('stamina', () => {
  it('applies attack and dodge stamina costs', () => {
    let state = createCombatState();
    const maximum = state.player.maxStamina;
    state = stepCombat(state, neutral({ attackPressed: true })).state;
    expect(state.player.stamina).toBe(maximum - COMBAT_TUNING.attack.staminaCost);

    state = createCombatState();
    state = stepCombat(state, neutral({ dodgePressed: true })).state;
    expect(state.player.stamina).toBe(maximum - COMBAT_TUNING.dodge.staminaCost);
  });

  it('regenerates only after the configured delay', () => {
    let state = stepCombat(createCombatState(), neutral({ attackPressed: true })).state;
    const spent = state.player.stamina;
    state = runTicks(state, COMBAT_TUNING.stamina.regenDelayTicks - 1).state;
    expect(state.player.stamina).toBe(spent);
    state = stepCombat(state, neutral()).state;
    expect(state.player.stamina).toBe(spent + COMBAT_TUNING.stamina.regenPerTick);
  });

  it('does not start actions without enough stamina', () => {
    let state = createCombatState();
    state.player.stamina = COMBAT_TUNING.attack.staminaCost - 0.01;
    let result = stepCombat(state, neutral({ attackPressed: true }));
    expect(result.state.player.currentAction.type).toBe('idle');
    expect(result.events.some((event) => event.type === 'ACTION_STARTED')).toBe(false);

    state = createCombatState();
    state.player.stamina = COMBAT_TUNING.dodge.staminaCost - 0.01;
    result = stepCombat(state, neutral({ dodgePressed: true }));
    expect(result.state.player.currentAction.type).toBe('idle');
  });
});

describe('block resolution', () => {
  it('reduces frontal damage and drains stamina per blocked hit', () => {
    const state = readyPlayerAttack(createCombatState());
    state.dummy.currentAction = { type: 'block', phase: 'active' };
    state.dummy.actionTick = COMBAT_TUNING.block.startupTicks;
    faceDummyTowardPlayer(state);
    const startingHealth = state.dummy.health;
    const startingStamina = state.dummy.stamina;
    const result = pairStep(state, { blockHeld: true });
    const expectedDamage = COMBAT_TUNING.attack.damage * (1 - COMBAT_TUNING.block.damageReduction);
    expect(result.events.some((event) => event.type === 'ATTACK_BLOCKED')).toBe(true);
    expect(result.state.dummy.health).toBeCloseTo(startingHealth - expectedDamage, 10);
    expect(result.state.dummy.stamina).toBe(startingStamina - COMBAT_TUNING.block.staminaPerHit);
  });

  it('breaks block and applies full damage when stamina is insufficient', () => {
    const state = readyPlayerAttack(createCombatState());
    state.dummy.currentAction = { type: 'block', phase: 'active' };
    state.dummy.actionTick = COMBAT_TUNING.block.startupTicks;
    state.dummy.stamina = COMBAT_TUNING.block.staminaPerHit - 0.01;
    faceDummyTowardPlayer(state);
    const startingHealth = state.dummy.health;
    const result = pairStep(state, { blockHeld: true });
    expect(result.events.some((event) => event.type === 'BLOCK_BROKEN')).toBe(true);
    expect(result.state.dummy.currentAction.type).toBe('stagger');
    expect(result.state.dummy.health).toBe(startingHealth - COMBAT_TUNING.attack.damage);
  });

  it('breaks a held block at exactly zero stamina', () => {
    const state = readyPlayerAttack(createCombatState());
    state.dummy.currentAction = { type: 'block', phase: 'active' };
    state.dummy.actionTick = COMBAT_TUNING.block.startupTicks;
    state.dummy.stamina = 0;
    faceDummyTowardPlayer(state);
    const result = pairStep(state, { blockHeld: true });
    expect(result.events.some((event) => event.type === 'BLOCK_BROKEN')).toBe(true);
    expect(result.events.find((event) => event.type === 'DAMAGE_APPLIED')?.amount).toBe(COMBAT_TUNING.attack.damage);
  });

  it('does not block a hit from behind', () => {
    const state = readyPlayerAttack(createCombatState());
    state.dummy.currentAction = { type: 'block', phase: 'active' };
    state.dummy.actionTick = COMBAT_TUNING.block.startupTicks;
    faceDummyTowardPlayer(state);
    state.dummy.facing = { x: -state.dummy.facing.x, z: -state.dummy.facing.z };
    const startingStamina = state.dummy.stamina;
    const result = pairStep(state, { blockHeld: true });
    expect(result.events.some((event) => event.type === 'ATTACK_HIT')).toBe(true);
    expect(result.events.some((event) => event.type === 'ATTACK_BLOCKED')).toBe(false);
    expect(result.state.dummy.stamina).toBe(startingStamina);
  });
});

describe('dodge', () => {
  it('uses i-frames to evade a hit during the invulnerable window', () => {
    const state = readyPlayerAttack(createCombatState());
    state.dummy.currentAction = { type: 'dodge', phase: 'active' };
    state.dummy.actionTick = COMBAT_TUNING.dodge.startupTicks;
    state.dummy.actionDirection = { x: 1, z: 0 };
    const startingHealth = state.dummy.health;
    const result = pairStep(state);
    expect(result.events.some((event) => event.type === 'DODGE_EVADED')).toBe(true);
    expect(result.state.dummy.health).toBe(startingHealth);
  });

  it('takes a hit after the i-frame window ends', () => {
    const state = readyPlayerAttack(createCombatState());
    state.dummy.currentAction = { type: 'dodge', phase: 'active' };
    state.dummy.actionTick = COMBAT_TUNING.dodge.startupTicks + COMBAT_TUNING.dodge.iframeTicks;
    state.dummy.actionDirection = { x: 1, z: 0 };
    const result = pairStep(state);
    expect(result.events.some((event) => event.type === 'ATTACK_HIT')).toBe(true);
    expect(result.state.dummy.health).toBeLessThan(result.state.dummy.maxHealth);
  });

  it('stays inside arena bounds when dodging into a wall', () => {
    let state = createCombatState();
    state.player.position.x = state.bounds.maxX;
    state = stepCombat(state, neutral({ x: 1, dodgePressed: true })).state;
    state = runTicks(state, COMBAT_TUNING.dodge.startupTicks + COMBAT_TUNING.dodge.activeTicks).state;
    expect(state.player.position.x).toBe(state.bounds.maxX);
    expect(state.player.position.x).toBeLessThanOrEqual(state.bounds.maxX);
  });
});

describe('fight lifecycle and facing', () => {
  it('defeats a combatant at zero health and accepts no actions after the fight ends', () => {
    const state = readyPlayerAttack(createCombatState());
    state.dummy.health = COMBAT_TUNING.attack.damage;
    const result = stepCombat(state, neutral());
    expect(result.state.dummy.health).toBe(0);
    expect(result.state.dummy.defeated).toBe(true);
    expect(result.state.fightOver).toBe(true);
    expect(result.events.some((event) => event.type === 'COMBATANT_DEFEATED')).toBe(true);

    const after = stepCombat(result.state, neutral({ attackPressed: true, dodgePressed: true, blockHeld: true }));
    expect(after.events).toEqual([]);
    expect(after.state).toEqual(result.state);
  });

  it('auto-faces the opponent while idle and locks facing during an action', () => {
    let state = createCombatState();
    state.player.facing = { x: -1, z: 0 };
    state = stepCombat(state, neutral()).state;
    const toward = {
      x: state.dummy.position.x - state.player.position.x,
      z: state.dummy.position.z - state.player.position.z,
    };
    const cross = state.player.facing.x * toward.z - state.player.facing.z * toward.x;
    expect(cross).toBeCloseTo(0, 10);
    const locked = { ...state.player.facing };

    state = stepCombat(state, neutral({ attackPressed: true })).state;
    state.dummy.position = { x: -8, z: -6 };
    state = stepCombat(state, neutral()).state;
    expect(state.player.facing).toEqual(locked);
  });
});

describe('determinism and derived vitals', () => {
  it('produces identical state and event logs for identical input sequences', () => {
    const inputs = Array.from({ length: 100 }, (_, index) => neutral({
      x: index % 12 < 6 ? 0.6 : -0.3,
      z: index % 9 < 4 ? -0.4 : 0.2,
      attackPressed: index === 2 || index === 25 || index === 70,
      blockHeld: index >= 45 && index < 54,
      dodgePressed: index === 60,
    }));
    const run = () => {
      let state = createCombatState();
      const events: CombatEvent[] = [];
      for (const input of inputs) {
        const result = stepCombat(state, input);
        state = result.state;
        events.push(...result.events);
      }
      return { state, events };
    };
    expect(run()).toEqual(run());
  });

  it('keeps derived maximum health and stamina bounded for extreme hidden stats', () => {
    const low = deriveCombatVitals({ health: -1e12, stamina: -1e12, reaction: -1e12, skill: -1e12, willpower: -1e12 });
    const high = deriveCombatVitals({ health: 1e12, stamina: 1e12, reaction: 1e12, skill: 1e12, willpower: 1e12 });
    expect(low.maxHealth).toBe(COMBAT_TUNING.vitals.minHealth);
    expect(low.maxStamina).toBe(COMBAT_TUNING.vitals.minStamina);
    expect(high.maxHealth).toBe(COMBAT_TUNING.vitals.maxHealth);
    expect(high.maxStamina).toBe(COMBAT_TUNING.vitals.maxStamina);
  });
});
