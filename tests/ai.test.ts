import { describe, expect, it } from 'vitest';
import {
  COMBAT_TUNING,
  NEUTRAL_COMBAT_INPUT,
  ROOKIE_PROFILE,
  createAiState,
  createCombatState,
  createOpponentCombatState,
  decide,
  stepCombat,
  stepCombatWithAi,
  stepCombatantPair,
  type AiProfile,
  type AiState,
  type CombatEvent,
  type CombatInput,
  type CombatState,
  type CombatantState,
} from '../src/sim';

const neutral = (overrides: Partial<CombatInput> = {}): CombatInput => ({
  ...NEUTRAL_COMBAT_INPUT,
  ...overrides,
});

const profile = (overrides: Partial<AiProfile>): AiProfile => ({
  ...ROOKIE_PROFILE,
  ...overrides,
});

function face(actor: CombatantState, target: CombatantState): void {
  const x = target.position.x - actor.position.x;
  const z = target.position.z - actor.position.z;
  const length = Math.hypot(x, z);
  actor.facing = { x: x / length, z: z / length };
}

function readyAttack(actor: CombatantState, target: CombatantState): void {
  actor.currentAction = { type: 'attack', phase: 'active' };
  actor.actionTick = COMBAT_TUNING.attack.startupTicks;
  actor.attackConnected = false;
  face(actor, target);
}

function aiObservation(state: CombatState, self: CombatantState, target: CombatantState) {
  return { self, target, bounds: state.bounds };
}

function runAiFight(seed: number, inputs: CombatInput[]) {
  let state = createOpponentCombatState();
  let aiState = createAiState(seed, state.player);
  const events: CombatEvent[] = [];
  const aiInputs: CombatInput[] = [];
  for (const input of inputs) {
    const result = stepCombatWithAi(state, input, aiState);
    state = result.state;
    aiState = result.aiState;
    events.push(...result.events);
    aiInputs.push(result.aiInput);
  }
  return { state, aiState, events, aiInputs };
}

function runAiVsAi(seed: number, maximumTicks: number): { state: CombatState; ticks: number } {
  let state = createOpponentCombatState();
  let playerAi = createAiState(seed * 2 + 1, state.dummy);
  let opponentAi = createAiState(seed * 2 + 2, state.player);
  let ticks = 0;
  while (!state.fightOver && ticks < maximumTicks) {
    const playerDecision = decide(
      playerAi,
      aiObservation(state, state.player, state.dummy),
      state.tick,
    );
    const opponentDecision = decide(
      opponentAi,
      aiObservation(state, state.dummy, state.player),
      state.tick,
    );
    playerAi = playerDecision.nextAiState;
    opponentAi = opponentDecision.nextAiState;
    state = stepCombatantPair(state, {
      player: playerDecision.input,
      dummy: opponentDecision.input,
    }).state;
    ticks += 1;
  }
  return { state, ticks };
}

describe('rookie AI contract and rules', () => {
  it('returns only a valid shared CombatInput and cannot request attacks or dodges at zero stamina', () => {
    const state = createOpponentCombatState();
    state.dummy.stamina = 0;
    state.player.currentAction = { type: 'attack', phase: 'startup' };
    const forced = profile({ aggression: 1, caution: 1, mistakeChance: 1 });
    const aiState = createAiState(4, state.player, forced);
    const result = decide(aiState, aiObservation(state, state.dummy, state.player), 0, forced);

    expect(Object.keys(result.input).sort()).toEqual([
      'attackPressed', 'blockHeld', 'dodgePressed', 'x', 'z',
    ]);
    expect(Number.isFinite(result.input.x)).toBe(true);
    expect(Number.isFinite(result.input.z)).toBe(true);
    expect(Math.hypot(result.input.x, result.input.z)).toBeLessThanOrEqual(1);
    expect(typeof result.input.attackPressed).toBe('boolean');
    expect(typeof result.input.blockHeld).toBe('boolean');
    expect(typeof result.input.dodgePressed).toBe('boolean');
    expect(result.input.attackPressed).toBe(false);
    expect(result.input.dodgePressed).toBe(false);

    const stepped = stepCombatantPair(state, { player: neutral(), dummy: result.input });
    expect(stepped.state.dummy.currentAction.type).toBe('idle');
  });

  it('creates a mobile neutral-vitals opponent at the established dummy start', () => {
    const dummy = createCombatState();
    const opponent = createOpponentCombatState();
    expect(opponent.dummy.position).toEqual(dummy.dummy.position);
    expect(opponent.dummy.maxHealth).toBe(COMBAT_TUNING.vitals.baseHealth);
    expect(opponent.dummy.maxStamina).toBe(COMBAT_TUNING.vitals.baseStamina);
    expect(dummy.dummy.stationary).toBe(true);
    expect(opponent.dummy.stationary).toBe(false);
  });

  it('stays finite and inside bounds when deciding and moving from a corner', () => {
    let state = createOpponentCombatState();
    state.dummy.position = { x: state.bounds.maxX, z: state.bounds.maxZ };
    state.player.position = { x: 0, z: 0 };
    let aiState = createAiState(99, state.player);
    for (let tick = 0; tick < 30; tick += 1) {
      const result = stepCombatWithAi(state, neutral(), aiState);
      state = result.state;
      aiState = result.aiState;
      expect(Number.isFinite(state.dummy.position.x)).toBe(true);
      expect(Number.isFinite(state.dummy.position.z)).toBe(true);
      expect(state.dummy.position.x).toBeGreaterThanOrEqual(state.bounds.minX);
      expect(state.dummy.position.x).toBeLessThanOrEqual(state.bounds.maxX);
      expect(state.dummy.position.z).toBeGreaterThanOrEqual(state.bounds.minZ);
      expect(state.dummy.position.z).toBeLessThanOrEqual(state.bounds.maxZ);
    }
  });
});

describe('rookie AI perception and behavior', () => {
  it('does not react to an attack before the configured delayed snapshot is visible', () => {
    const state = createOpponentCombatState();
    const forcedDefense = profile({
      reactionTicks: 12,
      decisionIntervalTicks: 1,
      aggression: 0,
      caution: 1,
      mistakeChance: 0,
      // Anticipation guard off: this test measures pure reaction to an observed attack.
      guardChance: 0,
    });
    let aiState = createAiState(8, state.player, forcedDefense);
    state.player.currentAction = { type: 'attack', phase: 'startup' };
    let firstDefenseTick: number | null = null;

    for (let tick = 0; tick <= forcedDefense.reactionTicks; tick += 1) {
      const result = decide(
        aiState,
        aiObservation(state, state.dummy, state.player),
        tick,
        forcedDefense,
      );
      aiState = result.nextAiState;
      if (result.input.blockHeld || result.input.dodgePressed) firstDefenseTick ??= tick;
    }

    expect(firstDefenseTick).toBe(forcedDefense.reactionTicks);
  });

  it('moves toward a far player and attacks in range within a bounded number of ticks', () => {
    let farState = createOpponentCombatState();
    farState.player.position = { x: -8, z: -5 };
    farState.dummy.position = { x: 8, z: 5 };
    let farAi = createAiState(17, farState.player);
    const before = Math.hypot(
      farState.player.position.x - farState.dummy.position.x,
      farState.player.position.z - farState.dummy.position.z,
    );
    const approached = stepCombatWithAi(farState, neutral(), farAi);
    farState = approached.state;
    farAi = approached.aiState;
    const after = Math.hypot(
      farState.player.position.x - farState.dummy.position.x,
      farState.player.position.z - farState.dummy.position.z,
    );
    expect(after).toBeLessThan(before);
    expect(farAi.lastDecision).toBe('approach');

    let state = createOpponentCombatState();
    let aiState = createAiState(17, state.player);
    let attackTick: number | null = null;
    for (let tick = 0; tick < 180 && attackTick === null; tick += 1) {
      const result = stepCombatWithAi(state, neutral(), aiState);
      state = result.state;
      aiState = result.aiState;
      if (result.events.some((event) => event.type === 'ACTION_STARTED'
        && event.actorId === 'dummy' && event.action === 'attack')) attackTick = state.tick;
    }
    expect(attackTick).not.toBeNull();
    expect(attackTick!).toBeLessThanOrEqual(180);
  });

  it('blocks or dodges some but not all of fifty delayed player attacks', () => {
    const defensiveProfile = profile({
      decisionIntervalTicks: 1,
      aggression: 0,
      mistakeChance: 0,
      guardChance: 0,
    });
    let defended = 0;
    let blocked = 0;
    let dodged = 0;
    for (let seed = 1; seed <= 50; seed += 1) {
      const state = createOpponentCombatState();
      let aiState = createAiState(seed, state.player, defensiveProfile);
      state.player.currentAction = { type: 'attack', phase: 'startup' };
      let input = neutral();
      for (let tick = 0; tick <= defensiveProfile.reactionTicks; tick += 1) {
        const result = decide(
          aiState,
          aiObservation(state, state.dummy, state.player),
          tick,
          defensiveProfile,
        );
        aiState = result.nextAiState;
        input = result.input;
      }
      if (input.blockHeld || input.dodgePressed) defended += 1;
      if (input.blockHeld) blocked += 1;
      if (input.dodgePressed) dodged += 1;
    }
    expect(defended).toBeGreaterThan(8);
    expect(defended).toBeLessThan(42);
    expect(blocked).toBeGreaterThan(0);
    expect(dodged).toBeGreaterThan(0);
  });

  it('makes outside attacks, overblocks, and recovery overcommits at loose bounded rates', () => {
    const samples = 200;
    let outsideAttacks = 0;
    let overblocks = 0;
    let overcommits = 0;
    const mistakeProfile = profile({
      decisionIntervalTicks: 1,
      aggression: 0,
      caution: 1,
      guardChance: 0,
    });

    for (let seed = 1; seed <= samples; seed += 1) {
      const outside = createOpponentCombatState();
      outside.player.position = { x: 0, z: 0 };
      outside.dummy.position = {
        x: COMBAT_TUNING.attack.range + mistakeProfile.mistakeRangeMargin / 2,
        z: 0,
      };
      let result = decide(
        createAiState(seed, outside.player, mistakeProfile),
        aiObservation(outside, outside.dummy, outside.player),
        0,
        mistakeProfile,
      );
      outsideAttacks += result.nextAiState.mistakes.outsideAttack;

      const blocking = createOpponentCombatState();
      blocking.player.currentAction = { type: 'attack', phase: 'startup' };
      result = decide(
        createAiState(seed, blocking.player, mistakeProfile),
        aiObservation(blocking, blocking.dummy, blocking.player),
        0,
        mistakeProfile,
      );
      overblocks += result.nextAiState.mistakes.overblock;

      const overcommit = createOpponentCombatState();
      overcommit.dummy.currentAction = { type: 'attack', phase: 'recovery' };
      overcommit.dummy.actionTick = COMBAT_TUNING.attack.startupTicks
        + COMBAT_TUNING.attack.activeTicks
        + COMBAT_TUNING.attack.recoveryTicks - 2;
      result = decide(
        createAiState(seed, overcommit.player, mistakeProfile),
        aiObservation(overcommit, overcommit.dummy, overcommit.player),
        0,
        mistakeProfile,
      );
      overcommits += result.nextAiState.mistakes.overcommit;
    }

    for (const count of [outsideAttacks, overblocks, overcommits]) {
      expect(count).toBeGreaterThan(samples * 0.05);
      expect(count).toBeLessThan(samples * 0.25);
    }
  });
});

describe('rookie AI engagement cycle', () => {
  it('does not press attack while its own public cooldown remains', () => {
    const state = createOpponentCombatState();
    state.dummy.attackCooldownRemaining = 7;
    const forced = profile({ decisionIntervalTicks: 1, aggression: 1, mistakeChance: 0, guardChance: 0 });
    const result = decide(createAiState(44, state.player, forced), aiObservation(state, state.dummy, state.player), 0, forced);
    expect(result.input.attackPressed).toBe(false);
  });

  it('keeps the default target edge outside basic attack reach while the target is idle', () => {
    const state = createOpponentCombatState();
    state.dummy.position = { x: 3, z: 0 };
    state.player.position = { x: 0, z: 0 };
    const forced = profile({ decisionIntervalTicks: 1, aggression: 0, guardChance: 0, mistakeChance: 0 });
    const result = decide(createAiState(45, state.player, forced), aiObservation(state, state.dummy, state.player), 0, forced);
    expect(result.input.attackPressed).toBe(false);
    expect(result.nextAiState.plan).toBe('approach');
  });
});

describe('AI fight determinism and lifecycle', () => {
  it('replays identical combat states, AI states, inputs, and events for one seed and input sequence', () => {
    const inputs = Array.from({ length: 420 }, (_, tick) => neutral({
      x: tick % 80 < 30 ? 0.35 : tick % 80 < 50 ? -0.2 : 0,
      z: tick % 55 < 20 ? -0.25 : 0.1,
      attackPressed: tick % 28 === 0,
      blockHeld: tick % 90 >= 48 && tick % 90 < 60,
      dodgePressed: tick % 117 === 70,
    }));
    expect(runAiFight(0x12345678, inputs)).toEqual(runAiFight(0x12345678, inputs));
  });

  it('finishes AI versus AI without a stalemate for ten fixed seeds', () => {
    const maximumTicks = COMBAT_TUNING.tickRate * 60;
    const results = Array.from({ length: 10 }, (_, seed) => runAiVsAi(seed + 1, maximumTicks));
    expect(results.every((result) => result.state.fightOver)).toBe(true);
    expect(results.every((result) => result.ticks <= maximumTicks)).toBe(true);
  });

  it('reports either combatant as winner and rejects all later player and AI actions', () => {
    const opponentDefeat = createOpponentCombatState();
    opponentDefeat.dummy.health = COMBAT_TUNING.attack.damage;
    readyAttack(opponentDefeat.player, opponentDefeat.dummy);
    let aiState = createAiState(3, opponentDefeat.player);
    const won = stepCombatWithAi(
      opponentDefeat,
      neutral(),
      aiState,
      profile({ aggression: 0, caution: 0, mistakeChance: 0 }),
    );
    expect(won.state.fightOver).toBe(true);
    expect(won.state.winner).toBe('player');
    expect(won.state.dummy.defeated).toBe(true);

    aiState = won.aiState;
    const afterWin = stepCombatWithAi(
      won.state,
      neutral({ attackPressed: true, blockHeld: true, dodgePressed: true }),
      aiState,
    );
    expect(afterWin.state).toEqual(won.state);
    expect(afterWin.events).toEqual([]);
    expect(afterWin.aiState).toEqual(aiState);

    const playerDefeat = createOpponentCombatState();
    playerDefeat.player.health = COMBAT_TUNING.attack.damage;
    readyAttack(playerDefeat.dummy, playerDefeat.player);
    const lost = stepCombatWithAi(
      playerDefeat,
      neutral(),
      createAiState(4, playerDefeat.player),
    );
    expect(lost.state.fightOver).toBe(true);
    expect(lost.state.winner).toBe('dummy');
    expect(lost.state.player.defeated).toBe(true);
    const afterLoss = stepCombatWithAi(
      lost.state,
      neutral({ attackPressed: true, blockHeld: true, dodgePressed: true }),
      lost.aiState,
    );
    expect(afterLoss.state).toEqual(lost.state);
    expect(afterLoss.events).toEqual([]);
  });

  it('defines a same-tick double defeat as a draw', () => {
    const state = createOpponentCombatState();
    state.player.health = COMBAT_TUNING.attack.damage;
    state.dummy.health = COMBAT_TUNING.attack.damage;
    readyAttack(state.player, state.dummy);
    readyAttack(state.dummy, state.player);
    const result = stepCombatantPair(state, { player: neutral(), dummy: neutral() });
    expect(result.state.player.defeated).toBe(true);
    expect(result.state.dummy.defeated).toBe(true);
    expect(result.state.winner).toBe('draw');
    expect(result.events.filter((event) => event.type === 'COMBATANT_DEFEATED')).toHaveLength(2);
  });

  it('keeps legacy dummy mode exactly equivalent to a neutral stationary second input', () => {
    const state = createCombatState();
    const input = neutral({ x: 0.4, z: -0.2, attackPressed: true });
    const legacy = stepCombat(state, input);
    const explicit = stepCombatantPair(state, { player: input, dummy: neutral() });
    expect(legacy).toEqual(explicit);
    expect(legacy.state.dummy.position).toEqual(state.dummy.position);
    expect(legacy.state.dummy.currentAction.type).toBe('idle');
  });
});

describe('rookie AI guard stance, punishing, and dash usage', () => {
  /** Place the AI at a chosen distance from an idle player, both facing each other. */
  function standoff(distance: number): CombatState {
    const state = createOpponentCombatState();
    state.player.position = { x: 0, z: 0 };
    state.dummy.position = { x: distance, z: 0 };
    face(state.dummy, state.player);
    face(state.player, state.dummy);
    return state;
  }

  const threatDistance = COMBAT_TUNING.attack.range + ROOKIE_PROFILE.defenseRangeMargin - 0.1;

  it('enters an anticipation guard in some but not all decisions across fifty seeds', () => {
    let guarded = 0;
    for (let seed = 1; seed <= 50; seed += 1) {
      const state = standoff(threatDistance);
      const result = decide(
        createAiState(seed, state.player),
        aiObservation(state, state.dummy, state.player),
        0,
      );
      if (result.nextAiState.lastDecision === 'guard-stance') {
        guarded += 1;
        expect(result.input.blockHeld).toBe(true);
      }
    }
    expect(guarded).toBeGreaterThan(0);
    expect(guarded).toBeLessThan(50);
  });

  it('holds the guard for a bounded number of ticks and then releases it', () => {
    const guardProfile = profile({ aggression: 0, guardChance: 1, caution: 1, mistakeChance: 0 });
    const state = standoff(threatDistance);
    const result = decide(
      createAiState(5, state.player, guardProfile),
      aiObservation(state, state.dummy, state.player),
      0,
      guardProfile,
    );
    expect(result.nextAiState.lastDecision).toBe('guard-stance');
    const hold = result.nextAiState.blockUntilTick;
    expect(hold).toBeGreaterThanOrEqual(guardProfile.guardHoldTicksMin);
    expect(hold).toBeLessThanOrEqual(guardProfile.guardHoldTicksMax);
    expect(result.nextAiState.guardReadyTick).toBe(hold + guardProfile.guardGapTicks);
  });

  it('releases a guard early when the target is observed far away repeatedly', () => {
    const guardProfile = profile({ aggression: 0, guardChance: 1, caution: 1, decisionIntervalTicks: 1 });
    let state = standoff(threatDistance);
    let aiState = createAiState(5, state.player, guardProfile);
    let result = decide(aiState, aiObservation(state, state.dummy, state.player), 0, guardProfile);
    expect(result.input.blockHeld).toBe(true);
    aiState = result.nextAiState;
    state = standoff(9);
    let tick = 1;
    for (let index = 0; index < guardProfile.guardReleaseObservations; index += 1) {
      result = decide(aiState, aiObservation(state, state.dummy, state.player), tick, guardProfile);
      aiState = result.nextAiState;
      tick += 1;
    }
    expect(aiState.blockUntilTick).toBeLessThanOrEqual(tick);
    expect(result.input.blockHeld).toBe(false);
  });

  it('never chooses to guard at very low endurance', () => {
    const guardProfile = profile({ aggression: 0, guardChance: 1, caution: 1, mistakeChance: 0 });
    for (let seed = 1; seed <= 25; seed += 1) {
      const state = standoff(threatDistance);
      state.dummy.endurance = state.dummy.maxEndurance * (guardProfile.minEnduranceRatioToGuard - 0.05);
      const result = decide(
        createAiState(seed, state.player, guardProfile),
        aiObservation(state, state.dummy, state.player),
        0,
        guardProfile,
      );
      expect(result.nextAiState.lastDecision).not.toBe('guard-stance');
    }
  });

  it('punishes an observed staggered target far more often than an idle one', () => {
    const punishProfile = profile({ aggression: 0, guardChance: 0, mistakeChance: 0, caution: 0 });
    const rate = (stagger: boolean): number => {
      let attacks = 0;
      for (let seed = 1; seed <= 50; seed += 1) {
        const state = standoff(COMBAT_TUNING.attack.range - 0.2);
        if (stagger) state.player.currentAction = { type: 'stagger', phase: 'recovery' };
        const aiState = createAiState(seed, state.player, punishProfile);
        const result = decide(aiState, aiObservation(state, state.dummy, state.player), 0, punishProfile);
        if (result.input.attackPressed) attacks += 1;
      }
      return attacks / 50;
    };
    const baseline = rate(false);
    const punished = rate(true);
    expect(baseline).toBe(0);
    expect(punished).toBeGreaterThan(0.5);
  });

  it('only punishes through the delayed observation, never the current tick', () => {
    const punishProfile = profile({
      aggression: 0, guardChance: 0, mistakeChance: 0, caution: 0, punishChance: 1, decisionIntervalTicks: 1,
    });
    const state = standoff(COMBAT_TUNING.attack.range - 0.2);
    let aiState = createAiState(11, state.player, punishProfile);
    // The player becomes staggered only now; the AI must not see it before the reaction delay.
    state.player.currentAction = { type: 'stagger', phase: 'recovery' };
    let firstPunishTick: number | null = null;
    for (let tick = 0; tick <= punishProfile.reactionTicks; tick += 1) {
      const result = decide(aiState, aiObservation(state, state.dummy, state.player), tick, punishProfile);
      aiState = result.nextAiState;
      if (result.input.attackPressed && firstPunishTick === null) firstPunishTick = tick;
    }
    expect(firstPunishTick).toBe(punishProfile.reactionTicks);
  });

  it('gap-close dashes toward a far target and never below the stamina floor', () => {
    const dashProfile = profile({ guardChance: 0, dashCloseChance: 1, decisionIntervalTicks: 1 });
    const state = standoff(dashProfile.dashCloseDistance + 2);
    const result = decide(
      createAiState(3, state.player, dashProfile),
      aiObservation(state, state.dummy, state.player),
      0,
      dashProfile,
    );
    expect(result.nextAiState.lastDecision).toBe('dash-close');
    expect(result.input.dodgePressed).toBe(true);
    // The dash vector points at the target, which sits in -x from the AI.
    expect(result.input.x).toBeLessThan(0);

    const tired = standoff(dashProfile.dashCloseDistance + 2);
    tired.dummy.stamina = tired.dummy.maxStamina * dashProfile.dashMinStaminaRatio
      + COMBAT_TUNING.dodge.staminaCost - 0.01;
    const noDash = decide(
      createAiState(3, tired.player, dashProfile),
      aiObservation(tired, tired.dummy, tired.player),
      0,
      dashProfile,
    );
    expect(noDash.input.dodgePressed).toBe(false);
    expect(noDash.nextAiState.lastDecision).not.toBe('dash-close');
  });

  it('does not gap-close dash while the target is close', () => {
    const dashProfile = profile({ guardChance: 0, dashCloseChance: 1 });
    const state = standoff(dashProfile.dashCloseDistance - 0.5);
    const result = decide(
      createAiState(3, state.player, dashProfile),
      aiObservation(state, state.dummy, state.player),
      0,
      dashProfile,
    );
    expect(result.nextAiState.lastDecision).not.toBe('dash-close');
  });

  it('obeys the shared attack interval over a long fight', () => {
    const interval = COMBAT_TUNING.attack.minIntervalTicks;
    let state = createOpponentCombatState();
    state.player.health = 1e6;
    state.dummy.health = 1e6;
    let aiState = createAiState(21, state.player);
    let lastAttackTick: number | null = null;
    for (let tick = 0; tick < 1200; tick += 1) {
      const result = stepCombatWithAi(state, neutral(), aiState);
      state = result.state;
      aiState = result.aiState;
      const started = result.events.some((event) => event.type === 'ACTION_STARTED'
        && event.actorId === 'dummy' && event.action === 'attack');
      if (started) {
        if (lastAttackTick !== null) expect(state.tick - lastAttackTick).toBeGreaterThanOrEqual(interval);
        lastAttackTick = state.tick;
      }
      expect(state.dummy.stamina).toBeGreaterThanOrEqual(0);
    }
    expect(lastAttackTick).not.toBeNull();
  });
});
