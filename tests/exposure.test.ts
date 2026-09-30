import { describe, expect, it } from 'vitest';
import {
  COMBAT_TUNING,
  NEUTRAL_COMBAT_INPUT,
  createOpponentCombatState,
  exposureDamageMultiplier,
  stepCombatantPair,
  type CombatEvent,
  type CombatInput,
  type CombatState,
  type CombatantState,
} from '../src/sim';

const EXP = COMBAT_TUNING.exposure;
const ATTACK = COMBAT_TUNING.attack;

const neutral = (overrides: Partial<CombatInput> = {}): CombatInput => ({ ...NEUTRAL_COMBAT_INPUT, ...overrides });
const pairStep = (state: CombatState, player: Partial<CombatInput> = {}, dummy: Partial<CombatInput> = {}) =>
  stepCombatantPair(state, { player: neutral(player), dummy: neutral(dummy) });

function face(actor: CombatantState, target: CombatantState): void {
  const x = target.position.x - actor.position.x;
  const z = target.position.z - actor.position.z;
  const length = Math.hypot(x, z) || 1;
  actor.facing = { x: x / length, z: z / length };
}

/** Put the actor into an active attack aimed at the target, at the requested active tick. */
function readyAttack(actor: CombatantState, target: CombatantState, actionTick = ATTACK.startupTicks): void {
  actor.currentAction = { type: 'attack', phase: 'active' };
  actor.actionTick = actionTick;
  actor.attackConnected = false;
  face(actor, target);
}

const finalActiveTick = ATTACK.startupTicks + ATTACK.activeTicks - 1;

/** A fresh mobile pair with both combatants very healthy so single hits never end the fight. */
function pair(): CombatState {
  const state = createOpponentCombatState();
  state.player.health = 1e6;
  state.dummy.health = 1e6;
  return state;
}

describe('exposure buckets and decay', () => {
  it('adds whiffExposure to the attacker when an attack ends without connecting', () => {
    const state = pair();
    state.player.position = { x: 0, z: 0 };
    state.dummy.position = { x: 9, z: 6 };
    readyAttack(state.player, state.dummy, finalActiveTick);
    const result = pairStep(state);
    expect(result.events.some((e) => e.type === 'ATTACK_MISSED' && e.actorId === 'player')).toBe(true);
    expect(state.player.exposure).toBe(0);
    expect(result.state.player.exposure).toBeCloseTo(EXP.whiffExposure, 6);
  });

  it('adds blockedExposure to the attacker when the target blocks', () => {
    const state = pair();
    readyAttack(state.player, state.dummy);
    state.dummy.currentAction = { type: 'block', phase: 'active' };
    face(state.dummy, state.player);
    const result = pairStep(state, {}, { blockHeld: true });
    expect(result.events.some((e) => e.type === 'ATTACK_BLOCKED' && e.actorId === 'player')).toBe(true);
    expect(result.state.player.exposure).toBeCloseTo(EXP.blockedExposure, 6);
  });

  it('adds hitExposure to the attacker when an attack connects', () => {
    const state = pair();
    readyAttack(state.player, state.dummy);
    const result = pairStep(state);
    expect(result.events.some((e) => e.type === 'ATTACK_HIT' && e.actorId === 'player')).toBe(true);
    expect(result.state.player.exposure).toBeCloseTo(EXP.hitExposure, 6);
  });

  it('counts a dodge that evades the attack as a whiff for the attacker', () => {
    const state = pair();
    readyAttack(state.player, state.dummy);
    state.dummy.currentAction = { type: 'dodge', phase: 'active' };
    state.dummy.actionTick = COMBAT_TUNING.dodge.startupTicks;
    state.dummy.actionDirection = { x: 0, z: 0 };
    const result = pairStep(state, {}, {});
    expect(result.events.some((e) => e.type === 'DODGE_EVADED' && e.targetId === 'player')).toBe(true);
    expect(result.state.player.exposure).toBeCloseTo(EXP.whiffExposure, 6);
  });

  it('decays exposure by decayPerTick every tick while not exposed and clamps to zero', () => {
    const state = pair();
    state.player.position = { x: -9, z: -6 };
    state.dummy.position = { x: 9, z: 6 };
    state.player.exposure = 5;
    const once = pairStep(state);
    expect(once.state.player.exposure).toBeCloseTo(5 - EXP.decayPerTick, 6);
    // Run enough ticks that decay would drive it negative; it must clamp at zero.
    let current = once.state;
    for (let i = 0; i < 60; i += 1) current = pairStep(current).state;
    expect(current.player.exposure).toBe(0);
  });

  it('clamps exposure at maxExposure', () => {
    const state = pair();
    state.player.exposure = EXP.maxExposure - 1;
    readyAttack(state.player, state.dummy);
    const result = pairStep(state);
    expect(result.state.player.exposure).toBeLessThanOrEqual(EXP.maxExposure);
    // The attacker crossed the cap this hit, so it is now Exposed and pinned at max.
    expect(result.state.player.exposed).toBe(true);
    expect(result.state.player.exposure).toBe(EXP.maxExposure);
  });
});

describe('reaching the Exposed state', () => {
  it('one whiff adds 30, three minimum-interval whiffs add 90, and the fourth Exposes', () => {
    expect(EXP.whiffExposure).toBe(30);
    let state = pair();
    state.player.position = { x: 0, z: 0 };
    state.dummy.position = { x: 9, z: 6 };
    let whiffs = 0;
    while (whiffs < 4) {
      const result = pairStep(state, { attackPressed: true });
      state = result.state;
      if (result.events.some((event) => event.type === 'ATTACK_MISSED' && event.actorId === 'player')) {
        whiffs += 1;
        if (whiffs === 1) expect(state.player.exposure).toBe(30);
        if (whiffs === 3) {
          expect(state.player.exposure).toBe(90);
          expect(state.player.exposed).toBe(false);
        }
      }
    }
    expect(state.player.exposed).toBe(true);
    expect(state.player.exposure).toBe(EXP.maxExposure);
  });

  it('three consecutive blocked attacks at 35 each make the attacker Exposed', () => {
    expect(EXP.blockedExposure).toBe(35);
    let state = pair();
    let blocked = 0;
    while (blocked < 3) {
      const result = pairStep(state, { attackPressed: true }, { blockHeld: true });
      state = result.state;
      if (result.events.some((event) => event.type === 'ATTACK_BLOCKED' && event.actorId === 'player')) blocked += 1;
    }
    expect(state.player.exposed).toBe(true);
    expect(state.player.exposure).toBe(EXP.maxExposure);
  });

  it('continuous whiffing at the minimum interval reaches Exposed in the expected tick count', () => {
    let state = pair();
    state.player.position = { x: 0, z: 0 };
    state.dummy.position = { x: 9, z: 6 };
    let exposedTick: number | null = null;
    let whiffs = 0;
    for (let tick = 0; tick < 400 && exposedTick === null; tick += 1) {
      const result = pairStep(state, { attackPressed: true });
      state = result.state;
      whiffs += result.events.filter((e) => e.type === 'ATTACK_MISSED' && e.actorId === 'player').length;
      if (result.events.some((e) => e.type === 'EXPOSED_STARTED' && e.actorId === 'player')) exposedTick = state.tick;
    }
    // The minimum interval is shorter than the decay delay, and each gain restarts that delay,
    // so no decay occurs between consecutive whiffs.
    const count = Math.ceil(EXP.maxExposure / EXP.whiffExposure);
    expect(exposedTick).not.toBeNull();
    expect(whiffs).toBe(count);
    // Sanity: it happens within a small number of attack intervals.
    expect(exposedTick!).toBeLessThanOrEqual(ATTACK.minIntervalTicks * (count + 1));
  });

  it('continuous connected hits never reach Exposed', () => {
    let state = pair();
    // Keep both huge-health and in range so the attacker lands clean hits forever.
    for (let tick = 0; tick < 500; tick += 1) {
      const result = pairStep(state, { attackPressed: true });
      state = result.state;
      face(state.player, state.dummy);
      expect(state.player.exposed).toBe(false);
    }
    expect(state.player.exposure).toBeLessThan(EXP.maxExposure);
  });
});

describe('Exposed behavior', () => {
  const makeExposed = (actor: CombatantState): void => {
    actor.exposure = EXP.maxExposure;
    actor.exposed = true;
    actor.exposedTicksRemaining = EXP.exposedTicks;
  };

  it('prevents a block from starting while Exposed', () => {
    const state = pair();
    makeExposed(state.player);
    state.player.currentAction = { type: 'idle', phase: 'idle' };
    const result = pairStep(state, { blockHeld: true });
    expect(result.state.player.currentAction.type).not.toBe('block');
  });

  it('drops a held block the moment the fighter becomes Exposed', () => {
    const state = pair();
    state.player.currentAction = { type: 'block', phase: 'active' };
    makeExposed(state.player);
    const result = pairStep(state, { blockHeld: true });
    expect(result.state.player.currentAction.type).toBe('idle');
  });

  it('multiplies hit damage by exposedDamageMultiplier against an Exposed target', () => {
    const state = pair();
    makeExposed(state.dummy);
    const before = state.dummy.health;
    readyAttack(state.player, state.dummy);
    const result = pairStep(state);
    const hit = result.events.find((e) => e.type === 'ATTACK_HIT' && e.actorId === 'player');
    const damage = result.events.find((e) => e.type === 'DAMAGE_APPLIED' && e.targetId === 'dummy');
    expect(hit?.multiplier).toBe(EXP.exposedDamageMultiplier);
    expect(damage?.multiplier).toBe(EXP.exposedDamageMultiplier);
    expect(hit?.amount).toBeCloseTo(ATTACK.damage * EXP.exposedDamageMultiplier, 6);
    expect(before - result.state.dummy.health).toBeCloseTo(ATTACK.damage * EXP.exposedDamageMultiplier, 6);
    expect(EXP.exposedDamageMultiplier).toBe(1.75);
  });

  it('ends after exposedTicks and resets exposure to exposedResetRatio of max', () => {
    const state = pair();
    state.player.position = { x: -9, z: -6 };
    state.dummy.position = { x: 9, z: 6 };
    makeExposed(state.player);
    let current = state;
    let endedTick: number | null = null;
    for (let i = 0; i < EXP.exposedTicks + 5; i += 1) {
      const result = pairStep(current);
      current = result.state;
      if (result.events.some((e) => e.type === 'EXPOSED_ENDED' && e.actorId === 'player')) endedTick = current.tick;
      if (endedTick !== null) break;
    }
    expect(endedTick).toBe(EXP.exposedTicks);
    expect(current.player.exposed).toBe(false);
    expect(current.player.exposure).toBeCloseTo(EXP.maxExposure * EXP.exposedResetRatio, 6);
    expect(EXP.exposedResetRatio).toBe(0.25);
  });

  it('still allows attacking while Exposed', () => {
    const state = pair();
    makeExposed(state.player);
    state.player.currentAction = { type: 'idle', phase: 'idle' };
    const result = pairStep(state, { attackPressed: true });
    expect(result.state.player.currentAction.type).toBe('attack');
  });
});

describe('exposure leaves endurance and guard-break rules unchanged', () => {
  it('drains the same endurance on a block whether or not the attacker is Exposed', () => {
    const drainFor = (attackerExposed: boolean): number => {
      const state = pair();
      if (attackerExposed) {
        state.player.exposure = EXP.maxExposure;
        state.player.exposed = true;
        state.player.exposedTicksRemaining = EXP.exposedTicks;
      }
      readyAttack(state.player, state.dummy);
      state.dummy.currentAction = { type: 'block', phase: 'active' };
      face(state.dummy, state.player);
      const result = pairStep(state, {}, { blockHeld: true });
      const blocked = result.events.find((e) => e.type === 'ATTACK_BLOCKED');
      return blocked?.enduranceDrained ?? -1;
    };
    const normal = drainFor(false);
    const exposedAttacker = drainFor(true);
    expect(normal).toBeCloseTo(ATTACK.damage * COMBAT_TUNING.block.enduranceDrainPerDamage, 6);
    expect(exposedAttacker).toBe(normal);
  });

  it('an Exposed target still breaks guard by endurance rules, not by the multiplier', () => {
    const state = pair();
    // Endurance one point above the incoming drain so this blocked hit is the breaking hit.
    state.dummy.endurance = ATTACK.damage * COMBAT_TUNING.block.enduranceDrainPerDamage - 1;
    readyAttack(state.player, state.dummy);
    state.dummy.currentAction = { type: 'block', phase: 'active' };
    face(state.dummy, state.player);
    const result = pairStep(state, {}, { blockHeld: true });
    expect(result.events.some((e) => e.type === 'GUARD_BROKEN' && e.actorId === 'dummy')).toBe(true);
  });
});

describe('exposure determinism', () => {
  const run = (): { states: string; events: string } => {
    let state = createOpponentCombatState();
    const events: CombatEvent[] = [];
    const snapshots: number[] = [];
    for (let tick = 0; tick < 300; tick += 1) {
      const result = stepCombatantPair(state, {
        player: neutral({ attackPressed: tick % 5 === 0, x: tick % 40 < 20 ? 0.3 : -0.2 }),
        dummy: neutral({ attackPressed: tick % 7 === 0, blockHeld: tick % 13 < 4 }),
      });
      state = result.state;
      events.push(...result.events);
      snapshots.push(state.player.exposure, state.dummy.exposure);
    }
    return { states: JSON.stringify(snapshots), events: JSON.stringify(events) };
  };

  it('produces identical exposure states and events for identical inputs', () => {
    const first = run();
    const second = run();
    expect(first.states).toBe(second.states);
    expect(first.events).toBe(second.events);
  });
});


describe('proportional exposure and delayed decay (Phase 1c.4)', () => {
  it('calculates x1.0, x1.375, and x1.75 from pure exposure', () => {
    expect(exposureDamageMultiplier(0)).toBeCloseTo(1);
    expect(exposureDamageMultiplier(50)).toBeCloseTo(1.375);
    expect(exposureDamageMultiplier(100)).toBeCloseTo(1.75);
  });

  it('holds exposure for the full delay, then decays at the configured rate', () => {
    let state = pair();
    state.player.exposure = 50;
    state.player.exposureDecayDelayRemaining = EXP.decayDelayTicks;
    for (let i = 0; i < EXP.decayDelayTicks; i += 1) state = pairStep(state).state;
    expect(state.player.exposure).toBe(50);
    state = pairStep(state).state;
    expect(state.player.exposure).toBeCloseTo(50 - EXP.decayPerTick);
  });

  it('restarts the decay delay after a new exposure gain', () => {
    let state = pair();
    state.player.exposure = 20;
    state.player.exposureDecayDelayRemaining = 1;
    readyAttack(state.player, state.dummy);
    state = pairStep(state).state;
    expect(state.player.exposureDecayDelayRemaining).toBeGreaterThan(0);
    expect(state.player.exposure).toBeGreaterThan(20);
  });

  it('uses fractional target exposure for health damage while leaving endurance drain raw', () => {
    const state = pair();
    state.dummy.exposure = 50;
    readyAttack(state.player, state.dummy);
    const result = pairStep(state);
    const hit = result.events.find((event) => event.type === 'ATTACK_HIT');
    expect(hit?.multiplier).toBeCloseTo(1.375);
  });
});
