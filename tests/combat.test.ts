import { describe, expect, it } from 'vitest';
import {
  COMBAT_FIXED_DT,
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

const attackCycleTicks = (): number =>
  COMBAT_TUNING.attack.startupTicks + COMBAT_TUNING.attack.activeTicks + COMBAT_TUNING.attack.recoveryTicks;

const dodgeCycleTicks = (): number =>
  COMBAT_TUNING.dodge.startupTicks + COMBAT_TUNING.dodge.activeTicks + COMBAT_TUNING.dodge.recoveryTicks;

const pairStep = (state: CombatState, dummy: Partial<CombatInput> = {}) => stepCombatantPair(state, {
  player: neutral(),
  dummy: neutral(dummy),
});

function runTicksPair(state: CombatState, count: number, dummy: Partial<CombatInput> = {}): CombatState {
  let current = state;
  for (let index = 0; index < count; index += 1) current = pairStep(current, dummy).state;
  return current;
}

/** Separate the combatants so attacks whiff and the fight cannot end during long runs. */
function outOfRange(state: CombatState): CombatState {
  state.player.position = { x: -9, z: -6 };
  state.dummy.position = { x: 9, z: 6 };
  return state;
}

/** A blocking dummy in range of a landing player attack. */
function blockingSetup(endurance?: number): CombatState {
  const state = readyPlayerAttack(createCombatState());
  state.dummy.currentAction = { type: 'block', phase: 'active' };
  state.dummy.actionTick = COMBAT_TUNING.block.startupTicks;
  if (endurance !== undefined) state.dummy.endurance = endurance;
  faceDummyTowardPlayer(state);
  return state;
}

/** A player attack about to break the dummy's guard (endurance cannot absorb the drain). */
function brokenBlockSetup(): CombatState {
  return blockingSetup(COMBAT_TUNING.attack.damage * COMBAT_TUNING.block.enduranceDrainPerDamage - 0.01);
}

/** Temporarily override any numeric field of a tuning sub-object. */
function withTuning(target: object, overrides: Record<string, number>, body: () => void): void {
  const mutable = target as Record<string, unknown>;
  const originals: Record<string, unknown> = {};
  for (const key of Object.keys(overrides)) originals[key] = mutable[key];
  Object.assign(mutable, overrides);
  try {
    body();
  } finally {
    Object.assign(mutable, originals);
  }
}

/** Temporarily override the tunable post-block-break regen delay. */
function withRegenDelay(ticks: number, body: () => void): void {
  const tunable = COMBAT_TUNING.stamina as { regenDelayTicks: number };
  const original = tunable.regenDelayTicks;
  tunable.regenDelayTicks = ticks;
  try {
    body();
  } finally {
    tunable.regenDelayTicks = original;
  }
}

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

  it('fires a buffered attack as soon as the attack interval allows', () => {
    const interval = COMBAT_TUNING.attack.minIntervalTicks;
    let state = stepCombat(createCombatState(), neutral({ attackPressed: true })).state;
    state = runTicks(state, interval - 5).state;
    expect(state.player.currentAction.type).toBe('idle');
    state = stepCombat(state, neutral({ attackPressed: true })).state;
    expect(state.player.currentAction.type).toBe('idle');
    const result = runTicks(state, 4);
    expect(result.events.some((event) => event.type === 'ACTION_STARTED' && event.action === 'attack')).toBe(true);
    expect(result.state.player.currentAction.type).toBe('attack');
  });
});

describe('stamina', () => {
  it('applies attack and dodge stamina costs', () => {
    let state = createCombatState();
    const maximum = state.player.maxStamina;
    // The attack tick also regenerates, because attacking never pauses regeneration.
    state = stepCombat(state, neutral({ attackPressed: true })).state;
    expect(state.player.stamina).toBeCloseTo(
      maximum - COMBAT_TUNING.attack.staminaCost + COMBAT_TUNING.stamina.regenPerTick,
      10,
    );

    state = createCombatState();
    state = stepCombat(state, neutral({ dodgePressed: true })).state;
    expect(state.player.stamina).toBe(maximum - COMBAT_TUNING.dodge.staminaCost);
  });

  it('regenerates every tick with no delay after attacking', () => {
    let state = stepCombat(createCombatState(), neutral({ attackPressed: true })).state;
    let previous = state.player.stamina;
    for (let index = 0; index < 10; index += 1) {
      state = stepCombat(state, neutral()).state;
      expect(state.player.stamina).toBeCloseTo(previous + COMBAT_TUNING.stamina.regenPerTick, 10);
      previous = state.player.stamina;
    }
  });

  it('keeps regenerating through every phase of an attack', () => {
    const total = attackCycleTicks();
    let state = outOfRange(createCombatState());
    let previous = state.player.maxStamina;
    const phases = new Set<string>();
    for (let index = 0; index < total; index += 1) {
      const spent = index === 0 ? COMBAT_TUNING.attack.staminaCost : 0;
      state = stepCombat(state, neutral({ attackPressed: index === 0 })).state;
      const expected = Math.min(
        state.player.maxStamina,
        previous - spent + COMBAT_TUNING.stamina.regenPerTick,
      );
      expect(state.player.stamina).toBeCloseTo(expected, 10);
      if (state.player.currentAction.type === 'attack') phases.add(state.player.currentAction.phase);
      previous = state.player.stamina;
    }
    expect([...phases].sort()).toEqual(['active', 'recovery', 'startup']);
    expect(state.player.currentAction.type).toBe('idle');
  });

  it('regenerates a full attack cycle worth of stamina for every attack spent', () => {
    // Design invariant: chaining basic attacks can never drain the bar.
    expect(attackCycleTicks() * COMBAT_TUNING.stamina.regenPerTick)
      .toBeGreaterThanOrEqual(COMBAT_TUNING.attack.staminaCost);
  });

  it('never runs out while chaining basic attacks for twenty seconds', () => {
    const ticks = COMBAT_TUNING.tickRate * 20;
    // Swinging at air, so the fight cannot end early and the chain runs the full twenty seconds.
    let state = outOfRange(createCombatState());
    let minimum = state.player.stamina;
    let attacks = 0;
    for (let index = 0; index < ticks; index += 1) {
      const result = stepCombat(state, neutral({ attackPressed: true }));
      state = result.state;
      attacks += result.events.filter((event) => event.type === 'ACTION_STARTED' && event.action === 'attack').length;
      minimum = Math.min(minimum, state.player.stamina);
      expect(state.player.stamina).toBeGreaterThan(0);
    }
    expect(attacks).toBe(Math.floor((ticks - 1) / COMBAT_TUNING.attack.minIntervalTicks) + 1);
    expect(minimum).toBeGreaterThan(0);
    // The bar never even dips below the cost of one more attack.
    expect(minimum).toBeGreaterThanOrEqual(COMBAT_TUNING.attack.staminaCost);
  });

  it('refills from empty in the expected number of ticks', () => {
    let state = createCombatState();
    state.player.stamina = 0;
    const expectedTicks = Math.ceil(state.player.maxStamina / COMBAT_TUNING.stamina.regenPerTick);
    state = runTicks(state, expectedTicks - 1).state;
    expect(state.player.stamina).toBeLessThan(state.player.maxStamina);
    state = runTicks(state, 1).state;
    expect(state.player.stamina).toBe(state.player.maxStamina);
  });

  it('pauses regeneration while block is held and resumes on the first tick after release', () => {
    const holdTicks = 30;
    let state = createCombatState();
    state.player.stamina = 50;
    const held = runTicks(state, holdTicks, () => neutral({ blockHeld: true }));
    state = held.state;
    expect(state.player.currentAction.type).toBe('block');
    expect(state.player.currentAction.phase).toBe('active');
    expect(state.player.stamina).toBe(50);

    // First tick after release: block enters recovery and regeneration is already running.
    state = stepCombat(state, neutral()).state;
    expect(state.player.currentAction).toEqual({ type: 'block', phase: 'recovery' });
    expect(state.player.stamina).toBeCloseTo(50 + COMBAT_TUNING.stamina.regenPerTick, 10);
  });

  it('pauses regeneration for the whole dodge and resumes on the first tick after', () => {
    const dodgeTicks = dodgeCycleTicks();
    let state = createCombatState();
    const expected = state.player.maxStamina - COMBAT_TUNING.dodge.staminaCost;
    state = stepCombat(state, neutral({ dodgePressed: true })).state;
    for (let index = 1; index < dodgeTicks; index += 1) {
      expect(state.player.stamina).toBe(expected);
      expect(state.player.currentAction.type).toBe('dodge');
      state = stepCombat(state, neutral()).state;
    }
    // Startup, active, and recovery all elapsed without regenerating.
    expect(state.player.currentAction.type).toBe('idle');
    expect(state.player.stamina).toBe(expected);

    state = stepCombat(state, neutral()).state;
    expect(state.player.stamina).toBeCloseTo(expected + COMBAT_TUNING.stamina.regenPerTick, 10);
  });

  it('allows at least six consecutive dodges from full stamina before the chain breaks', () => {
    let state = outOfRange(createCombatState());
    let dodges = 0;
    for (let index = 0; index < 1000; index += 1) {
      const wasIdle = state.player.currentAction.type === 'idle';
      const result = stepCombat(state, neutral({ dodgePressed: true }));
      state = result.state;
      const started = result.events.some((event) => event.type === 'ACTION_STARTED' && event.action === 'dodge');
      if (started) {
        dodges += 1;
        continue;
      }
      // The chain breaks on the first free tick where the buffered dodge cannot be paid for.
      if (wasIdle) break;
    }
    expect(dodges).toBeGreaterThanOrEqual(6);
    expect(dodges).toBe(Math.floor(state.player.maxStamina / COMBAT_TUNING.dodge.staminaCost));
    // Chainable, but not infinite: the bar is left too low for one more.
    expect(state.player.stamina).toBeLessThan(COMBAT_TUNING.dodge.staminaCost);
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

  it('starts actions at exactly the action cost', () => {
    let state = createCombatState();
    state.player.stamina = COMBAT_TUNING.attack.staminaCost;
    let result = stepCombat(state, neutral({ attackPressed: true }));
    expect(result.state.player.currentAction.type).toBe('attack');
    expect(result.state.player.stamina).toBeCloseTo(COMBAT_TUNING.stamina.regenPerTick, 10);

    state = createCombatState();
    state.player.stamina = COMBAT_TUNING.dodge.staminaCost;
    result = stepCombat(state, neutral({ dodgePressed: true }));
    expect(result.state.player.currentAction.type).toBe('dodge');
    expect(result.state.player.stamina).toBe(0);
    expect(result.events.some((event) => event.type === 'STAMINA_DEPLETED')).toBe(true);
  });

  it('fires a buffered attack pressed at zero stamina once regeneration pays for it', () => {
    let state = createCombatState();
    state.player.stamina = COMBAT_TUNING.attack.staminaCost - COMBAT_TUNING.stamina.regenPerTick * 2;
    const result = runTicks(state, 3, (index) => neutral({ attackPressed: index === 0 }));
    const started = result.events.filter((event) => event.type === 'ACTION_STARTED' && event.action === 'attack');
    expect(started).toHaveLength(1);
    // Pressed on tick 1 while too drained; fires on tick 3, the first affordable tick.
    expect(started[0]!.tick).toBe(3);
  });

  it('gives up a buffered press that stays unaffordable for the whole buffer window', () => {
    let state = createCombatState();
    state.player.stamina = 0;
    const result = runTicks(state, COMBAT_TUNING.inputBufferTicks + 1, (index) => neutral({ attackPressed: index === 0 }));
    expect(result.events.some((event) => event.type === 'ACTION_STARTED')).toBe(false);
    expect(result.state.player.inputBuffer.attackTicks).toBe(0);
  });

  it('does not start a block below the minimum start stamina and keeps it drained while held', () => {
    let state = createCombatState();
    state.player.stamina = COMBAT_TUNING.block.minimumStartStamina - 0.01;
    let result = stepCombat(state, neutral({ blockHeld: true }));
    expect(result.state.player.currentAction.type).toBe('idle');
    // Idle regenerates, so the block becomes available again shortly after.
    expect(result.state.player.stamina).toBeCloseTo(
      COMBAT_TUNING.block.minimumStartStamina - 0.01 + COMBAT_TUNING.stamina.regenPerTick,
      10,
    );

    state = createCombatState();
    state.player.stamina = COMBAT_TUNING.block.minimumStartStamina;
    result = stepCombat(state, neutral({ blockHeld: true }));
    expect(result.state.player.currentAction.type).toBe('block');
    const heldStamina = result.state.player.stamina;
    expect(heldStamina).toBe(COMBAT_TUNING.block.minimumStartStamina);
    const held = runTicks(result.state, 60, () => neutral({ blockHeld: true }));
    expect(held.state.player.stamina).toBe(heldStamina);
  });
});

describe('attack movement', () => {
  it('moves at the configured multiplier in each attack phase', () => {
    let state = createCombatState();
    state.player.position = { x: -9, z: 0 };
    state.dummy.position = { x: 9, z: 6 };
    const perTick = (multiplier: number) => COMBAT_TUNING.movementSpeed * multiplier * COMBAT_FIXED_DT;
    const expectedFor = (actionTick: number) => {
      if (actionTick < COMBAT_TUNING.attack.startupTicks) return perTick(COMBAT_TUNING.attack.startupMovementMultiplier);
      if (actionTick < COMBAT_TUNING.attack.startupTicks + COMBAT_TUNING.attack.activeTicks) {
        return perTick(COMBAT_TUNING.attack.activeMovementMultiplier);
      }
      return perTick(COMBAT_TUNING.attack.recoveryMovementMultiplier);
    };

    const total = attackCycleTicks();
    for (let index = 0; index < total; index += 1) {
      const before = state.player.position.x;
      state = stepCombat(state, neutral({ x: 1, attackPressed: index === 0 })).state;
      if (index < total - 1) expect(state.player.currentAction.type).toBe('attack');
      expect(state.player.position.x - before).toBeCloseTo(expectedFor(index), 10);
    }
    // Idle movement is unmodified, and it returns instantly on the first idle tick.
    const before = state.player.position.x;
    state = stepCombat(state, neutral({ x: 1 })).state;
    expect(state.player.currentAction.type).toBe('idle');
    expect(state.player.position.x - before).toBeCloseTo(perTick(1), 10);
  });

  it('reaches full configured speed on the first tick with no acceleration ramp', () => {
    let state = createCombatState();
    state.player.position = { x: 0, z: 0 };
    const first = stepCombat(state, neutral({ x: 1 })).state;
    expect(first.player.position.x).toBeCloseTo(COMBAT_TUNING.movementSpeed * COMBAT_FIXED_DT, 10);
    expect(first.player.velocity.x).toBeCloseTo(COMBAT_TUNING.movementSpeed, 10);
    // Releasing the stick stops instantly too.
    const stopped = stepCombat(first, neutral()).state;
    expect(stopped.player.position.x).toBe(first.player.position.x);
    expect(stopped.player.velocity.x).toBe(0);
  });
});

describe('endurance and guard break', () => {
  it('takes no health damage from a blocked frontal hit and drains endurance instead', () => {
    const state = blockingSetup();
    const startingHealth = state.dummy.health;
    const startingStamina = state.dummy.stamina;
    const startingEndurance = state.dummy.endurance;
    const result = pairStep(state, { blockHeld: true });
    const drain = COMBAT_TUNING.attack.damage * COMBAT_TUNING.block.enduranceDrainPerDamage;
    const blocked = result.events.find((event) => event.type === 'ATTACK_BLOCKED');
    expect(blocked).toBeDefined();
    expect(blocked?.enduranceDrained).toBeCloseTo(drain, 10);
    expect(result.state.dummy.health).toBe(startingHealth);
    expect(result.state.dummy.endurance).toBeCloseTo(startingEndurance - drain, 10);
    // Blocking never costs stamina now; only the held-block regen pause applies.
    expect(result.state.dummy.stamina).toBe(startingStamina);
  });

  it('honors a changed chip fraction and endurance drain factor', () => {
    withTuning(COMBAT_TUNING.block, { blockChipFraction: 0.25, enduranceDrainPerDamage: 0.5 }, () => {
      const state = blockingSetup();
      const startingHealth = state.dummy.health;
      const startingEndurance = state.dummy.endurance;
      const result = pairStep(state, { blockHeld: true });
      expect(result.state.dummy.health).toBeCloseTo(startingHealth - COMBAT_TUNING.attack.damage * 0.25, 10);
      expect(result.state.dummy.endurance).toBeCloseTo(startingEndurance - COMBAT_TUNING.attack.damage * 0.5, 10);
    });
  });

  it('breaks the guard when endurance would reach zero and applies full damage', () => {
    const state = brokenBlockSetup();
    const startingHealth = state.dummy.health;
    const result = pairStep(state, { blockHeld: true });
    expect(result.events.some((event) => event.type === 'GUARD_BROKEN')).toBe(true);
    expect(result.events.some((event) => event.type === 'ENDURANCE_DEPLETED')).toBe(true);
    expect(result.state.dummy.currentAction.type).toBe('stagger');
    expect(result.state.dummy.guardBroken).toBe(true);
    expect(result.state.dummy.endurance).toBe(0);
    expect(result.state.dummy.health).toBe(startingHealth - COMBAT_TUNING.attack.damage);
  });

  it('breaks the guard at exactly zero endurance', () => {
    const state = blockingSetup(COMBAT_TUNING.attack.damage * COMBAT_TUNING.block.enduranceDrainPerDamage);
    const result = pairStep(state, { blockHeld: true });
    expect(result.events.some((event) => event.type === 'GUARD_BROKEN')).toBe(true);
    expect(result.events.find((event) => event.type === 'DAMAGE_APPLIED')?.amount).toBe(COMBAT_TUNING.attack.damage);
  });

  it('staggers for the configured duration, refuses input, and restores half endurance', () => {
    const state = brokenBlockSetup();
    let current = pairStep(state, { blockHeld: true }).state;
    // Keep the attacker harmless for the rest of the stagger.
    current.player.currentAction = { type: 'idle', phase: 'idle' };
    current.player.position = { x: -9, z: -6 };
    for (let index = 1; index < COMBAT_TUNING.block.guardBreakStaggerTicks - 1; index += 1) {
      current = stepCombatantPair(current, {
        player: neutral(),
        dummy: neutral({ attackPressed: true, dodgePressed: true, blockHeld: true }),
      }).state;
      expect(current.dummy.currentAction.type).toBe('stagger');
      expect(current.dummy.endurance).toBe(0);
    }
    current = pairStep(current, { attackPressed: true }).state;
    expect(current.dummy.currentAction.type).toBe('idle');
    expect(current.dummy.guardBroken).toBe(false);
    expect(current.dummy.endurance).toBeCloseTo(
      current.dummy.maxEndurance * COMBAT_TUNING.block.guardBreakResetRatio,
      10,
    );
  });

  it('applies full damage to extra hits landed during the stagger', () => {
    const state = brokenBlockSetup();
    let current = pairStep(state, { blockHeld: true }).state;
    expect(current.dummy.currentAction.type).toBe('stagger');
    const health = current.dummy.health;
    current = readyPlayerAttack(current);
    const second = pairStep(current, { blockHeld: true });
    expect(second.events.some((event) => event.type === 'ATTACK_HIT')).toBe(true);
    expect(second.state.dummy.health).toBeCloseTo(health - COMBAT_TUNING.attack.damage, 10);
  });

  it('waits the regen delay after a blocked hit and then regenerates per tick, held or not', () => {
    for (const blockHeld of [true, false]) {
      const state = blockingSetup();
      let current = pairStep(state, { blockHeld: true }).state;
      const drained = current.dummy.endurance;
      current.player.position = { x: -9, z: -6 };
      for (let index = 1; index < COMBAT_TUNING.block.enduranceRegenDelayTicks; index += 1) {
        current = pairStep(current, { blockHeld }).state;
        expect(current.dummy.endurance).toBe(drained);
      }
      current = pairStep(current, { blockHeld }).state;
      expect(current.dummy.endurance).toBeCloseTo(drained + COMBAT_TUNING.block.enduranceRegenPerTick, 10);
      current = pairStep(current, { blockHeld }).state;
      expect(current.dummy.endurance).toBeCloseTo(drained + COMBAT_TUNING.block.enduranceRegenPerTick * 2, 10);
    }
  });

  it('restarts the regen delay on every consecutive blocked hit', () => {
    let state = blockingSetup();
    let current = pairStep(state, { blockHeld: true }).state;
    const afterFirst = current.dummy.endurance;
    current = runTicksPair(current, COMBAT_TUNING.block.enduranceRegenDelayTicks - 5, { blockHeld: true });
    expect(current.dummy.endurance).toBe(afterFirst);
    state = readyPlayerAttack(current);
    current = pairStep(state, { blockHeld: true }).state;
    const afterSecond = current.dummy.endurance;
    current = runTicksPair(current, COMBAT_TUNING.block.enduranceRegenDelayTicks - 1, { blockHeld: true });
    expect(current.dummy.endurance).toBe(afterSecond);
  });

  it('caps endurance regeneration at the derived maximum', () => {
    const state = createCombatState();
    state.dummy.endurance = state.dummy.maxEndurance - COMBAT_TUNING.block.enduranceRegenPerTick / 2;
    const current = runTicksPair(state, 10);
    expect(current.dummy.endurance).toBe(current.dummy.maxEndurance);
  });

  it('does not block a hit from behind and does not drain endurance', () => {
    const state = blockingSetup();
    state.dummy.facing = { x: -state.dummy.facing.x, z: -state.dummy.facing.z };
    const startingEndurance = state.dummy.endurance;
    const startingStamina = state.dummy.stamina;
    const result = pairStep(state, { blockHeld: true });
    expect(result.events.some((event) => event.type === 'ATTACK_HIT')).toBe(true);
    expect(result.events.some((event) => event.type === 'ATTACK_BLOCKED')).toBe(false);
    expect(result.state.dummy.endurance).toBe(startingEndurance);
    expect(result.state.dummy.stamina).toBe(startingStamina);
  });

  it('resumes stamina regeneration immediately after a guard break with the default delay', () => {
    expect(COMBAT_TUNING.stamina.regenDelayTicks).toBe(0);
    const state = brokenBlockSetup();
    state.dummy.stamina = 40;
    const broken = pairStep(state, { blockHeld: true });
    expect(broken.events.some((event) => event.type === 'GUARD_BROKEN')).toBe(true);
    expect(broken.state.dummy.stamina).toBeCloseTo(40 + COMBAT_TUNING.stamina.regenPerTick, 10);
  });

  it('applies the stamina regen delay only after a guard break', () => {
    const delay = 20;
    withRegenDelay(delay, () => {
      const state = brokenBlockSetup();
      state.dummy.stamina = 40;
      let current = pairStep(state, { blockHeld: true }).state;
      current.player.position = { x: -9, z: -6 };
      expect(current.dummy.stamina).toBe(40);
      for (let index = 1; index < delay; index += 1) {
        current = pairStep(current).state;
        expect(current.dummy.stamina).toBe(40);
      }
      current = pairStep(current).state;
      expect(current.dummy.stamina).toBeCloseTo(40 + COMBAT_TUNING.stamina.regenPerTick, 10);
    });
  });

  it('leaves the attacker regenerating normally through a guard break', () => {
    const state = brokenBlockSetup();
    state.player.stamina = 40;
    const broken = pairStep(state, { blockHeld: true });
    expect(broken.events.some((event) => event.type === 'GUARD_BROKEN')).toBe(true);
    expect(broken.state.player.stamina).toBeCloseTo(40 + COMBAT_TUNING.stamina.regenPerTick, 10);
  });

  it('breaks a held guard under sustained mashed attacks', () => {
    let state = createCombatState();
    state.player.position = { x: 0, z: 0 };
    state.dummy.position = { x: 1.2, z: 0 };
    faceDummyTowardPlayer(state);
    let broken = false;
    for (let tick = 0; tick < 600 && !broken; tick += 1) {
      const result = stepCombatantPair(state, {
        player: neutral({ attackPressed: true }),
        dummy: neutral({ blockHeld: true }),
      });
      state = result.state;
      broken = result.events.some((event) => event.type === 'GUARD_BROKEN');
    }
    expect(broken).toBe(true);
  });
});

describe('attack interval', () => {
  it('cannot start a second attack before minIntervalTicks after the first start', () => {
    const interval = COMBAT_TUNING.attack.minIntervalTicks;
    let state = outOfRange(createCombatState());
    state = stepCombat(state, neutral({ attackPressed: true })).state;
    expect(state.player.currentAction.type).toBe('attack');
    expect(state.player.attackCooldownRemaining).toBe(interval - 1);

    // Press on every tick until one tick before the interval elapses: nothing may start.
    for (let index = 1; index < interval; index += 1) {
      const result = stepCombat(state, neutral({ attackPressed: true }));
      state = result.state;
      expect(result.events.some((event) => event.type === 'ACTION_STARTED' && event.action === 'attack')).toBe(false);
    }
    const next = stepCombat(state, neutral({ attackPressed: true }));
    expect(next.events.some((event) => event.type === 'ACTION_STARTED' && event.action === 'attack')).toBe(true);
    expect(next.state.player.attackCooldownRemaining).toBe(interval - 1);
  });

  it('fires an attack buffered during the cooldown on the first allowed tick', () => {
    const interval = COMBAT_TUNING.attack.minIntervalTicks;
    let state = outOfRange(createCombatState());
    state = stepCombat(state, neutral({ attackPressed: true })).state;
    const wait = interval - 1 - Math.floor(COMBAT_TUNING.inputBufferTicks / 2);
    state = runTicks(state, wait - 1).state;
    state = stepCombat(state, neutral({ attackPressed: true })).state;
    expect(state.player.currentAction.type).toBe('idle');
    const rest = runTicks(state, COMBAT_TUNING.inputBufferTicks);
    expect(rest.events.some((event) => event.type === 'ACTION_STARTED' && event.action === 'attack')).toBe(true);
  });

  it('limits mashed attacks to the interval over a long run', () => {
    const ticks = 600;
    const state = outOfRange(createCombatState());
    const run = runTicks(state, ticks, () => neutral({ attackPressed: true }));
    const attacks = run.events.filter((event) => event.type === 'ACTION_STARTED' && event.action === 'attack').length;
    expect(attacks).toBeLessThanOrEqual(Math.floor(ticks / COMBAT_TUNING.attack.minIntervalTicks) + 1);
    expect(attacks).toBeGreaterThan(0);
  });

  it('reports a cooldown fraction that completes exactly when the attack is available', () => {
    let state = outOfRange(createCombatState());
    state = stepCombat(state, neutral({ attackPressed: true })).state;
    expect(state.player.attackCooldownFraction).toBeGreaterThan(0);
    expect(state.player.attackCooldownFraction).toBeLessThan(1);
    state = runTicks(state, COMBAT_TUNING.attack.minIntervalTicks - 1).state;
    expect(state.player.attackCooldownRemaining).toBe(0);
    expect(state.player.attackCooldownFraction).toBe(1);
  });

  it('allows block and dodge while the attack cooldown is running', () => {
    let state = outOfRange(createCombatState());
    state = stepCombat(state, neutral({ attackPressed: true })).state;
    state = runTicks(state, attackCycleTicks() - 1).state;
    expect(state.player.currentAction.type).toBe('idle');
    expect(state.player.attackCooldownRemaining).toBeGreaterThan(0);

    const blocked = stepCombat(state, neutral({ blockHeld: true }));
    expect(blocked.state.player.currentAction.type).toBe('block');
    const dodged = stepCombat(state, neutral({ dodgePressed: true }));
    expect(dodged.state.player.currentAction.type).toBe('dodge');
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
    expect(low.maxEndurance).toBe(COMBAT_TUNING.vitals.minEndurance);
    expect(high.maxHealth).toBe(COMBAT_TUNING.vitals.maxHealth);
    expect(high.maxStamina).toBe(COMBAT_TUNING.vitals.maxStamina);
    expect(high.maxEndurance).toBe(COMBAT_TUNING.vitals.maxEndurance);
    expect(deriveCombatVitals({ health: 50, stamina: 50, reaction: 50, skill: 50, willpower: 50 }).maxEndurance)
      .toBe(COMBAT_TUNING.vitals.baseEndurance);
  });
});
