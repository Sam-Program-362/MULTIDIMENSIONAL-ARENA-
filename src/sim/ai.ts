import type { Vec2 } from './arena';
import {
  COMBAT_TUNING,
  NEUTRAL_COMBAT_INPUT,
  stepCombatantPair,
  type ActionPhase,
  type ActionType,
  type CombatInput,
  type CombatState,
  type CombatStepResult,
  type CombatantState,
} from './combat';
import { createRngState, stepRng } from './rng';

/** Every behavior value used by the basic controller lives in this profile. */
export type AiTier = 'rookie' | 'veteran';
export type AiPattern = 'neutral' | 'pressure' | 'rhythm-break' | 'counter-guard' | 'desperation' | 'kill-instinct';

export interface AiProfile {
  tier: AiTier;
  reactionTicks: number;
  decisionIntervalTicks: number;
  aggression: number;
  caution: number;
  mistakeChance: number;
  preferredRange: number;
  rangeTolerance: number;
  mistakeRangeMargin: number;
  defenseRangeMargin: number;
  retreatStaminaRatio: number;
  retreatResumeStaminaRatio: number;
  retreatTicks: number;
  approachStrength: number;
  retreatStrength: number;
  sidestepStrength: number;
  spacingStrength: number;
  dodgeShare: number;
  normalBlockHoldTicks: number;
  mistakeBlockHoldTicks: number;
  overcommitWindowTicks: number;
  wallBuffer: number;
  circleSwitchChance: number;
  /** Anticipation guard: held before an attack is observed, not in reaction to one. */
  guardChance: number;
  guardHoldTicksMin: number;
  guardHoldTicksMax: number;
  /** Ticks after a guard hold ends before another anticipation guard may start. */
  guardGapTicks: number;
  /** Consecutive out-of-threat-range observations that release a guard hold early. */
  guardReleaseObservations: number;
  /** Below this endurance ratio the AI stops choosing to guard. */
  minEnduranceRatioToGuard: number;
  /** Attack chance against an observed staggered / recovering / Exposed target in range. */
  punishChance: number;
  /**
   * At or above this ratio of its OWN exposure, the AI stops starting ordinary attacks (it may
   * still punish, guard, retreat, or dodge). A profile value, not a hard rule.
   */
  restraintExposureRatio: number;
  dashCloseDistance: number;
  dashCloseChance: number;
  dashMinStaminaRatio: number;
  /** Veteran-only selection weights. They remain data, not hidden controller constants. */
  pressureWeight: number;
  rhythmBreakWeight: number;
  counterGuardWeight: number;
  rhythmBreakChance: number;
  desperationHealthRatio: number;
}

export const ROOKIE_PROFILE: Readonly<AiProfile> = {
  tier: 'rookie',
  reactionTicks: 18,
  decisionIntervalTicks: 12,
  aggression: 0.38,
  caution: 0.52,
  mistakeChance: 0.25,
  preferredRange: 1.65,
  rangeTolerance: 0.25,
  mistakeRangeMargin: 0.55,
  defenseRangeMargin: 0.45,
  retreatStaminaRatio: 0.22,
  retreatResumeStaminaRatio: 0.48,
  retreatTicks: 32,
  approachStrength: 0.9,
  retreatStrength: 0.8,
  sidestepStrength: 0.3,
  spacingStrength: 0.42,
  dodgeShare: 0.34,
  normalBlockHoldTicks: 24,
  mistakeBlockHoldTicks: 42,
  overcommitWindowTicks: 6,
  wallBuffer: 0.35,
  circleSwitchChance: 0.08,
  guardChance: 0.3,
  guardHoldTicksMin: 18,
  guardHoldTicksMax: 40,
  guardGapTicks: 20,
  guardReleaseObservations: 2,
  minEnduranceRatioToGuard: 0.25,
  punishChance: 0.5,
  restraintExposureRatio: 0.6,
  dashCloseDistance: 4.5,
  dashCloseChance: 0.45,
  dashMinStaminaRatio: 0.35,
  pressureWeight: 0,
  rhythmBreakWeight: 0,
  counterGuardWeight: 0,
  rhythmBreakChance: 0,
  desperationHealthRatio: 0.3,
} as const;

/** Opt-in arena fighter. Rookie values and its controller path remain untouched. */
export const VETERAN_PROFILE: Readonly<AiProfile> = {
  ...ROOKIE_PROFILE,
  tier: 'veteran',
  reactionTicks: 13,
  decisionIntervalTicks: 8,
  aggression: 0.70,
  caution: 0.62,
  mistakeChance: 0.05,
  punishChance: 0.90,
  retreatTicks: 0,
  restraintExposureRatio: 0.70,
  guardChance: 0.48,
  normalBlockHoldTicks: 16,
  mistakeBlockHoldTicks: 24,
  guardHoldTicksMin: 10,
  guardHoldTicksMax: 22,
  guardGapTicks: 8,
  dashCloseChance: 0.60,
  pressureWeight: 0.72,
  rhythmBreakWeight: 0.34,
  counterGuardWeight: 0.78,
  rhythmBreakChance: 0.38,
  desperationHealthRatio: 0.3,
} as const;

export type StaminaBand = 'low' | 'ok';

/** The intentionally limited, delayed information retained about the target. */
export interface AiTargetSnapshot {
  position: Vec2;
  facing: Vec2;
  currentAction: { type: ActionType; phase: ActionPhase };
  actionTick: number;
  staminaBand: StaminaBand;
  /** Public exposure state; delayed with the rest of the snapshot. */
  exposed: boolean;
  exposure: number;
  healthRatio: number;
  guardBroken: boolean;
  attackCooldownRemaining: number;
  defeated: boolean;
}

export interface AiObservation {
  /** The controller may read its own combat state live. */
  self: CombatantState;
  /** Only a limited snapshot of this current state is stored; decisions read an older snapshot. */
  target: CombatantState;
  bounds: CombatState['bounds'];
}

export interface AiMistakeCounts {
  outsideAttack: number;
  overblock: number;
  overcommit: number;
}

export interface AiHabitSample {
  attackStart: boolean;
  dodgeStart: boolean;
  blockHeld: boolean;
  approach: boolean;
  retreat: boolean;
}

export type AiDecisionReason =
  | 'waiting'
  | 'approach'
  | 'circle'
  | 'retreat'
  | 'attack'
  | 'defend-block'
  | 'defend-dodge'
  | 'guard-stance'
  | 'punish'
  | 'dash-close'
  | 'mistake-outside-attack'
  | 'mistake-overblock'
  | 'mistake-overcommit';

/** Plain data only: this includes history and the serializable shared-PRNG state. */
export interface AiState {
  rngState: number;
  history: AiTargetSnapshot[];
  nextDecisionTick: number;
  blockUntilTick: number;
  /** Earliest tick a new anticipation guard may start (hold end + gap). */
  guardReadyTick: number;
  /** Consecutive decisions where the observed target was outside threat range. */
  farObservations: number;
  retreatUntilTick: number;
  circleDirection: -1 | 1;
  heldMovement: Vec2;
  decisionCount: number;
  mistakes: AiMistakeCounts;
  lastDecision: AiDecisionReason;
  /** Veteran-only per-fight memory, populated from delayed snapshots and reset by createAiState. */
  habitWindow: AiHabitSample[];
  lastObserved: AiTargetSnapshot;
  lastObservedDistance: number;
  pattern: AiPattern;
  patternUntilTick: number;
  patternCounts: Record<AiPattern, number>;
  delayedAttackUntilTick: number;
  chainRemaining: number;
  consecutiveRetreatTicks: number;
  longestRetreatTicks: number;
}

export interface AiDecision {
  input: CombatInput;
  nextAiState: AiState;
}

export interface AiCombatStepResult extends CombatStepResult {
  aiState: AiState;
  aiInput: CombatInput;
}

const neutralSnapshot = (): AiTargetSnapshot => ({
  position: { x: 0, z: 0 },
  facing: { x: 0, z: 1 },
  currentAction: { type: 'idle', phase: 'idle' },
  actionTick: 0,
  staminaBand: 'ok',
  exposed: false,
  exposure: 0,
  healthRatio: 1,
  guardBroken: false,
  attackCooldownRemaining: 0,
  defeated: false,
});

function targetSnapshot(target: CombatantState): AiTargetSnapshot {
  return {
    position: { ...target.position },
    facing: { ...target.facing },
    currentAction: { ...target.currentAction },
    actionTick: target.actionTick,
    staminaBand: target.stamina / target.maxStamina <= COMBAT_TUNING.lowStaminaThreshold ? 'low' : 'ok',
    exposed: target.exposed,
    exposure: target.exposure,
    healthRatio: target.maxHealth > 0 ? target.health / target.maxHealth : 0,
    guardBroken: target.guardBroken,
    attackCooldownRemaining: target.attackCooldownRemaining,
    defeated: target.defeated,
  };
}

function cloneSnapshot(snapshot: AiTargetSnapshot): AiTargetSnapshot {
  return {
    ...snapshot,
    position: { ...snapshot.position },
    facing: { ...snapshot.facing },
    currentAction: { ...snapshot.currentAction },
  };
}

export function createAiState(
  seed: number,
  initialTarget?: CombatantState,
  profile: AiProfile = ROOKIE_PROFILE,
): AiState {
  const initial = initialTarget ? targetSnapshot(initialTarget) : neutralSnapshot();
  const historyLength = Math.max(1, Math.floor(profile.reactionTicks) + 1);
  return {
    rngState: createRngState(seed),
    history: Array.from({ length: historyLength }, () => cloneSnapshot(initial)),
    nextDecisionTick: 0,
    blockUntilTick: 0,
    guardReadyTick: 0,
    farObservations: 0,
    retreatUntilTick: 0,
    circleDirection: 1,
    heldMovement: { x: 0, z: 0 },
    decisionCount: 0,
    mistakes: { outsideAttack: 0, overblock: 0, overcommit: 0 },
    lastDecision: 'waiting',
    habitWindow: [],
    lastObserved: cloneSnapshot(initial),
    lastObservedDistance: Number.POSITIVE_INFINITY,
    pattern: 'neutral',
    patternUntilTick: 0,
    patternCounts: {
      neutral: 0,
      pressure: 0,
      'rhythm-break': 0,
      'counter-guard': 0,
      desperation: 0,
      'kill-instinct': 0,
    },
    delayedAttackUntilTick: 0,
    chainRemaining: 0,
    consecutiveRetreatTicks: 0,
    longestRetreatTicks: 0,
  };
}

const lengthOf = (vector: Vec2): number => Math.hypot(vector.x, vector.z);

function normalized(vector: Vec2): Vec2 {
  const length = lengthOf(vector);
  return length > 0 ? { x: vector.x / length, z: vector.z / length } : { x: 0, z: 0 };
}

function limited(vector: Vec2): Vec2 {
  const length = lengthOf(vector);
  return length > 1 ? { x: vector.x / length, z: vector.z / length } : vector;
}

function delayedHistory(
  state: AiState,
  current: AiTargetSnapshot,
  reactionTicks: number,
): { history: AiTargetSnapshot[]; observed: AiTargetSnapshot } {
  const maximumLength = Math.max(1, Math.floor(reactionTicks) + 1);
  const history = [...state.history.map(cloneSnapshot), current];
  while (history.length > maximumLength) history.shift();
  while (history.length < maximumLength) history.unshift(cloneSnapshot(history[0] ?? neutralSnapshot()));
  return { history, observed: history[0] };
}

function movementAtRange(
  self: CombatantState,
  target: AiTargetSnapshot,
  profile: AiProfile,
  circleDirection: -1 | 1,
): Vec2 {
  const toward = normalized({
    x: target.position.x - self.position.x,
    z: target.position.z - self.position.z,
  });
  const distance = Math.hypot(
    target.position.x - self.position.x,
    target.position.z - self.position.z,
  );
  if (distance > profile.preferredRange + profile.rangeTolerance) {
    return { x: toward.x * profile.approachStrength, z: toward.z * profile.approachStrength };
  }

  const circle = {
    x: -toward.z * profile.sidestepStrength * circleDirection,
    z: toward.x * profile.sidestepStrength * circleDirection,
  };
  if (distance < profile.preferredRange - profile.rangeTolerance) {
    return limited({
      x: circle.x - toward.x * profile.spacingStrength,
      z: circle.z - toward.z * profile.spacingStrength,
    });
  }
  return circle;
}

function steerInsideBounds(
  movement: Vec2,
  self: CombatantState,
  bounds: CombatState['bounds'],
  wallBuffer: number,
): Vec2 {
  const steered = { ...movement };
  if (self.position.x <= bounds.minX + wallBuffer && steered.x < 0) steered.x = 0;
  if (self.position.x >= bounds.maxX - wallBuffer && steered.x > 0) steered.x = 0;
  if (self.position.z <= bounds.minZ + wallBuffer && steered.z < 0) steered.z = 0;
  if (self.position.z >= bounds.maxZ - wallBuffer && steered.z > 0) steered.z = 0;
  return limited(steered);
}

function retreatMovement(self: CombatantState, target: AiTargetSnapshot, strength: number): Vec2 {
  const away = normalized({
    x: self.position.x - target.position.x,
    z: self.position.z - target.position.z,
  });
  return { x: away.x * strength, z: away.z * strength };
}

function currentInput(state: AiState, self: CombatantState, tick: number): CombatInput {
  return {
    x: state.heldMovement.x,
    z: state.heldMovement.z,
    attackPressed: false,
    blockHeld: tick < state.blockUntilTick && self.stamina >= COMBAT_TUNING.block.minimumStartStamina,
    dodgePressed: false,
  };
}

function habitRatios(samples: AiHabitSample[]): { block: number; attack: number; dodge: number } {
  const size = Math.max(1, samples.length);
  return {
    block: samples.filter((sample) => sample.blockHeld).length / size,
    attack: samples.filter((sample) => sample.attackStart).length / size,
    dodge: samples.filter((sample) => sample.dodgeStart).length / size,
  };
}

function selectVeteranPattern(
  current: AiPattern,
  currentUntil: number,
  tick: number,
  target: AiTargetSnapshot,
  selfHealthRatio: number,
  ratios: ReturnType<typeof habitRatios>,
  profile: AiProfile,
  roll: number,
): AiPattern {
  if (target.healthRatio <= profile.desperationHealthRatio) return 'kill-instinct';
  if (selfHealthRatio <= profile.desperationHealthRatio) return 'desperation';
  if (tick < currentUntil && current !== 'neutral') return current;
  if (target.currentAction.type === 'block' || ratios.block >= 0.22) return 'pressure';
  if (ratios.attack >= 0.018 && roll < profile.counterGuardWeight) return 'counter-guard';
  if (roll < profile.rhythmBreakWeight) return 'rhythm-break';
  return roll < profile.rhythmBreakWeight + profile.pressureWeight * 0.25 ? 'pressure' : 'neutral';
}

/** Veteran controller: deterministic patterns built only from the same delayed public snapshots. */
function decideVeteran(
  aiState: AiState,
  observation: AiObservation,
  tick: number,
  profile: AiProfile,
): AiDecision {
  const delayed = delayedHistory(aiState, targetSnapshot(observation.target), profile.reactionTicks);
  const target = delayed.observed;
  const self = observation.self;
  const distance = lengthOf({ x: target.position.x - self.position.x, z: target.position.z - self.position.z });
  const actionStarted = target.currentAction.type !== aiState.lastObserved.currentAction.type
    || target.currentAction.type !== 'idle' && target.actionTick < aiState.lastObserved.actionTick;
  const sample: AiHabitSample = {
    attackStart: actionStarted && target.currentAction.type === 'attack',
    dodgeStart: actionStarted && target.currentAction.type === 'dodge',
    blockHeld: target.currentAction.type === 'block'
      && (target.currentAction.phase === 'startup' || target.currentAction.phase === 'active'),
    approach: distance < aiState.lastObservedDistance - 0.01,
    retreat: distance > aiState.lastObservedDistance + 0.01,
  };
  const habitWindow = [...aiState.habitWindow, sample].slice(-300);

  const toward = normalized({ x: target.position.x - self.position.x, z: target.position.z - self.position.z });
  const heldDot = aiState.heldMovement.x * toward.x + aiState.heldMovement.z * toward.z;
  const isDodge = self.currentAction.type === 'dodge';
  let consecutiveRetreatTicks = !isDodge && heldDot < -0.05 ? aiState.consecutiveRetreatTicks + 1 : 0;
  let heldMovement = { ...aiState.heldMovement };
  if (consecutiveRetreatTicks >= 30) {
    heldMovement = { x: toward.x * profile.approachStrength, z: toward.z * profile.approachStrength };
    consecutiveRetreatTicks = 0;
  }
  const baseState: AiState = {
    ...aiState,
    history: delayed.history,
    habitWindow,
    lastObserved: cloneSnapshot(target),
    lastObservedDistance: distance,
    heldMovement,
    mistakes: { ...aiState.mistakes },
    patternCounts: { ...aiState.patternCounts },
    consecutiveRetreatTicks,
    longestRetreatTicks: Math.max(aiState.longestRetreatTicks, consecutiveRetreatTicks),
  };
  if (tick < aiState.nextDecisionTick || self.defeated || target.defeated) {
    return { input: currentInput(baseState, self, tick), nextAiState: baseState };
  }

  let rngState = aiState.rngState;
  const random = (): number => {
    const next = stepRng(rngState);
    rngState = next.state;
    return next.value;
  };
  // Always consume the same draws at every Veteran decision.
  const patternRoll = random();
  const attackRoll = random();
  const mistakeRoll = random();
  const defenseRoll = random();
  const rhythmRoll = random();
  const delayRoll = random();
  const dashRoll = random();
  const circleRoll = random();

  const ratios = habitRatios(habitWindow);
  const selfHealthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 0;
  let pattern = selectVeteranPattern(
    aiState.pattern,
    aiState.patternUntilTick,
    tick,
    target,
    selfHealthRatio,
    ratios,
    profile,
    patternRoll,
  );
  const enteredPattern = pattern !== aiState.pattern || tick >= aiState.patternUntilTick;
  const patternCounts = { ...aiState.patternCounts };
  if (enteredPattern) patternCounts[pattern] += 1;
  const patternUntilTick = enteredPattern ? tick + 24 : aiState.patternUntilTick;
  const killMode = pattern === 'kill-instinct';
  const desperate = pattern === 'desperation';
  const targetPunishable = target.exposed || target.guardBroken
    || target.currentAction.type === 'stagger'
    || target.currentAction.type === 'attack' && target.currentAction.phase === 'recovery'
    || target.currentAction.type === 'dodge' && target.currentAction.phase === 'recovery';
  let chainRemaining = targetPunishable ? 3 : aiState.chainRemaining;

  const attack = COMBAT_TUNING.attack;
  const inRange = distance <= attack.range;
  const idle = self.currentAction.type === 'idle';
  const canAttack = idle && self.stamina >= attack.staminaCost
    && self.attackCooldownRemaining < COMBAT_TUNING.inputBufferTicks;
  const canDodge = idle && self.stamina >= COMBAT_TUNING.dodge.staminaCost;
  const projectedBlockedExposure = self.exposure + COMBAT_TUNING.exposure.blockedExposure;
  const exposureRisk = projectedBlockedExposure >= self.maxExposure;
  const restrained = self.exposure / self.maxExposure >= profile.restraintExposureRatio;
  const ordinaryAllowed = killMode || desperate || !restrained;
  const input: CombatInput = { ...NEUTRAL_COMBAT_INPUT };
  let reason: AiDecisionReason = 'circle';
  let blockUntilTick = aiState.blockUntilTick;
  let guardReadyTick = aiState.guardReadyTick;
  let delayedAttackUntilTick = aiState.delayedAttackUntilTick;

  // Default stance is forward pressure/circling, never an open-ended retreat.
  heldMovement = movementAtRange(self, target, profile, aiState.circleDirection);
  if (pattern === 'pressure' || killMode || desperate) {
    heldMovement = distance > attack.range * 0.82
      ? { x: toward.x * profile.approachStrength, z: toward.z * profile.approachStrength }
      : { x: 0, z: 0 };
  }

  const observedIncoming = target.currentAction.type === 'attack'
    && (target.currentAction.phase === 'startup' || target.currentAction.phase === 'active');
  if (observedIncoming && canDodge && (desperate ? defenseRoll < 0.68 : defenseRoll < 0.34)) {
    input.x = -toward.x;
    input.z = -toward.z;
    input.dodgePressed = true;
    reason = 'defend-dodge';
  } else if (targetPunishable && canAttack && inRange && (chainRemaining > 0 || attackRoll < profile.punishChance)) {
    input.attackPressed = true;
    chainRemaining = Math.max(0, chainRemaining - 1);
    reason = 'punish';
  } else if (pattern === 'counter-guard') {
    const counterOpening = target.exposed || target.guardBroken
      || target.currentAction.type === 'attack' && target.currentAction.phase === 'recovery'
      || target.attackCooldownRemaining > COMBAT_TUNING.inputBufferTicks;
    if (counterOpening && canAttack && inRange) {
      input.attackPressed = true;
      blockUntilTick = tick;
      reason = 'punish';
    } else if (idle && inRange && self.endurance / self.maxEndurance >= profile.minEnduranceRatioToGuard) {
      // One decision beat only: releasing between observations permits endurance recovery.
      blockUntilTick = tick + profile.decisionIntervalTicks;
      guardReadyTick = blockUntilTick + 1;
      input.blockHeld = true;
      reason = 'guard-stance';
    }
  } else if (pattern === 'pressure' && exposureRisk && !killMode) {
    // A blocked next swing would reach the cap: pause behind guard or just outside reach.
    if (idle && self.endurance / self.maxEndurance >= profile.minEnduranceRatioToGuard) {
      blockUntilTick = tick + profile.decisionIntervalTicks;
      input.blockHeld = true;
      reason = 'guard-stance';
    } else {
      input.x = -toward.x * 0.35;
      input.z = -toward.z * 0.35;
      heldMovement = { x: input.x, z: input.z };
      reason = 'retreat';
    }
  } else if (pattern === 'rhythm-break' && canAttack && inRange && ordinaryAllowed) {
    if (delayedAttackUntilTick > 0) {
      if (tick >= delayedAttackUntilTick) {
        input.attackPressed = true;
        delayedAttackUntilTick = 0;
        reason = 'attack';
      } else {
        reason = 'waiting';
      }
    } else if (rhythmRoll < profile.rhythmBreakChance) {
      delayedAttackUntilTick = tick + 6 + Math.floor(delayRoll * 13);
      reason = 'waiting';
    } else {
      input.attackPressed = true;
      reason = 'attack';
    }
  } else if (canAttack && inRange && ordinaryAllowed
    && (killMode || desperate || attackRoll < profile.aggression)
    && mistakeRoll >= (desperate ? profile.mistakeChance / 2 : profile.mistakeChance)) {
    input.attackPressed = true;
    reason = 'attack';
  } else if (idle && distance > profile.dashCloseDistance && canDodge
    && self.stamina / self.maxStamina >= profile.dashMinStaminaRatio && dashRoll < profile.dashCloseChance) {
    input.x = toward.x;
    input.z = toward.z;
    input.dodgePressed = true;
    reason = 'dash-close';
  } else {
    input.x = heldMovement.x;
    input.z = heldMovement.z;
    reason = distance > attack.range ? 'approach' : 'circle';
  }

  if (!input.dodgePressed && !input.blockHeld && !input.attackPressed) {
    input.x = heldMovement.x;
    input.z = heldMovement.z;
  }
  if (circleRoll < profile.circleSwitchChance) baseState.circleDirection = baseState.circleDirection === 1 ? -1 : 1;
  heldMovement = steerInsideBounds({ x: input.x, z: input.z }, self, observation.bounds, profile.wallBuffer);
  input.x = heldMovement.x;
  input.z = heldMovement.z;

  return {
    input,
    nextAiState: {
      ...baseState,
      rngState,
      nextDecisionTick: tick + profile.decisionIntervalTicks,
      blockUntilTick,
      guardReadyTick,
      heldMovement,
      decisionCount: aiState.decisionCount + 1,
      lastDecision: reason,
      pattern,
      patternUntilTick,
      patternCounts,
      delayedAttackUntilTick,
      chainRemaining,
    },
  };
}

/**
 * Deterministic rookie controller. The target's current snapshot is appended to history, but all
 * decisions use the snapshot exactly `reactionTicks` old. No target input is accepted or read.
 */
export function decide(
  aiState: AiState,
  observation: AiObservation,
  tick: number,
  profile: AiProfile = ROOKIE_PROFILE,
): AiDecision {
  if (profile.tier === 'veteran') return decideVeteran(aiState, observation, tick, profile);
  const delayed = delayedHistory(aiState, targetSnapshot(observation.target), profile.reactionTicks);
  const baseState: AiState = {
    ...aiState,
    history: delayed.history,
    heldMovement: { ...aiState.heldMovement },
    mistakes: { ...aiState.mistakes },
  };

  if (tick < aiState.nextDecisionTick || observation.self.defeated || delayed.observed.defeated) {
    return { input: currentInput(baseState, observation.self, tick), nextAiState: baseState };
  }

  let rngState = aiState.rngState;
  const random = (): number => {
    const next = stepRng(rngState);
    rngState = next.state;
    return next.value;
  };
  // A stable number of draws per decision keeps branches reproducible and easy to compare.
  const aggressionRoll = random();
  const cautionRoll = random();
  const mistakeRoll = random();
  const defenseRoll = random();
  const circleRoll = random();
  const guardRoll = random();
  const guardHoldRoll = random();
  const punishRoll = random();
  const dashRoll = random();

  let circleDirection = aiState.circleDirection;
  if (circleRoll < profile.circleSwitchChance) circleDirection = circleDirection === 1 ? -1 : 1;

  const target = delayed.observed;
  const self = observation.self;
  const towardTarget = {
    x: target.position.x - self.position.x,
    z: target.position.z - self.position.z,
  };
  const distance = lengthOf(towardTarget);
  const staminaRatio = self.stamina / self.maxStamina;
  let retreatUntilTick = aiState.retreatUntilTick;
  if (staminaRatio <= profile.retreatStaminaRatio) retreatUntilTick = tick + profile.retreatTicks;
  const retreating = tick < retreatUntilTick && staminaRatio < profile.retreatResumeStaminaRatio;

  let heldMovement = movementAtRange(self, target, profile, circleDirection);
  let reason: AiDecisionReason = distance > profile.preferredRange + profile.rangeTolerance
    ? 'approach'
    : 'circle';
  if (retreating) {
    heldMovement = retreatMovement(self, target, profile.retreatStrength);
    reason = 'retreat';
  }
  heldMovement = steerInsideBounds(heldMovement, self, observation.bounds, profile.wallBuffer);

  let blockUntilTick = aiState.blockUntilTick;
  let guardReadyTick = aiState.guardReadyTick;
  const threatRange = COMBAT_TUNING.attack.range + profile.defenseRangeMargin;
  // A guard held while the target keeps being observed far away is dropped after a few looks.
  let farObservations = distance > threatRange ? aiState.farObservations + 1 : 0;
  if (tick < blockUntilTick && farObservations >= profile.guardReleaseObservations) {
    blockUntilTick = tick;
    guardReadyTick = tick + profile.guardGapTicks;
    farObservations = 0;
  }
  const input: CombatInput = {
    ...NEUTRAL_COMBAT_INPUT,
    ...heldMovement,
    blockHeld: tick < blockUntilTick && self.stamina >= COMBAT_TUNING.block.minimumStartStamina,
  };
  const mistakes = { ...aiState.mistakes };
  const attackProfile = COMBAT_TUNING.attack;
  const enoughToAttack = self.stamina >= attackProfile.staminaCost;
  const enoughToDodge = self.stamina >= COMBAT_TUNING.dodge.staminaCost;
  const idle = self.currentAction.type === 'idle';
  const canAttackNow = idle && enoughToAttack && self.attackCooldownRemaining <= 0;
  const observedStartup = target.currentAction.type === 'attack'
    && target.currentAction.phase === 'startup';
  const defensiveRange = distance <= threatRange;
  const enduranceRatio = self.maxEndurance > 0 ? self.endurance / self.maxEndurance : 0;
  // Punishable states, as seen through the reaction delay: never current-tick knowledge.
  // An observed Exposed target is treated exactly like an observed staggered one.
  const observedPunishable = target.exposed
    || target.currentAction.type === 'stagger'
    || (target.currentAction.type === 'attack' && target.currentAction.phase === 'recovery')
    || (target.currentAction.type === 'dodge' && target.currentAction.phase === 'recovery');
  // Restraint: at/above its own exposure ratio the AI stops STARTING ordinary attacks. Punishing,
  // guarding, retreating and dodging stay available.
  const selfExposureRatio = self.maxExposure > 0 ? self.exposure / self.maxExposure : 0;
  const restrained = selfExposureRatio >= profile.restraintExposureRatio;
  const dashLeavesEnoughStamina = self.maxStamina > 0
    && (self.stamina - COMBAT_TUNING.dodge.staminaCost) / self.maxStamina >= profile.dashMinStaminaRatio;
  const staminaRatioOkForDash = staminaRatio >= profile.dashMinStaminaRatio;

  const observedExposureRatio = target.exposed
    ? 1
    : Math.max(0, Math.min(1, target.exposure / COMBAT_TUNING.exposure.maxExposure));
  // Preserve the ordinary stagger/recovery punish while making a visibly exposed target more
  // attractive in proportion to its public meter (including partial exposure).
  const exposureScaledPunishChance = profile.punishChance
    * (target.exposed || target.exposure > 0 ? observedExposureRatio : 1);
  if (!retreating && canAttackNow && observedPunishable && distance <= attackProfile.range
    && punishRoll < exposureScaledPunishChance) {
    input.attackPressed = true;
    reason = 'punish';
  } else if (!retreating && idle && observedStartup && defensiveRange && cautionRoll < profile.caution) {
    if (defenseRoll < profile.dodgeShare && enoughToDodge) {
      const away = retreatMovement(self, target, profile.retreatStrength);
      input.x = away.x;
      input.z = away.z;
      input.dodgePressed = true;
      reason = 'defend-dodge';
    } else if (self.stamina >= COMBAT_TUNING.block.minimumStartStamina) {
      const overblock = mistakeRoll < profile.mistakeChance;
      blockUntilTick = tick + (overblock ? profile.mistakeBlockHoldTicks : profile.normalBlockHoldTicks);
      guardReadyTick = blockUntilTick + profile.guardGapTicks;
      input.blockHeld = true;
      if (overblock) {
        mistakes.overblock += 1;
        reason = 'mistake-overblock';
      } else {
        reason = 'defend-block';
      }
    }
  } else if (
    // Anticipation guard: no attack has been observed, the target is simply close enough.
    !retreating
    && idle
    && defensiveRange
    && tick >= guardReadyTick
    && tick >= blockUntilTick
    && enduranceRatio >= profile.minEnduranceRatioToGuard
    && self.stamina >= COMBAT_TUNING.block.minimumStartStamina
    && guardRoll < profile.guardChance * profile.caution * 2
  ) {
    const span = Math.max(0, profile.guardHoldTicksMax - profile.guardHoldTicksMin);
    const hold = profile.guardHoldTicksMin + Math.floor(guardHoldRoll * (span + 1));
    blockUntilTick = tick + hold;
    guardReadyTick = blockUntilTick + profile.guardGapTicks;
    input.blockHeld = true;
    reason = 'guard-stance';
  } else if (
    // Gap-close dash: only when clearly far away and stamina stays above the floor afterwards.
    !retreating
    && idle
    && distance > profile.dashCloseDistance
    && enoughToDodge
    && staminaRatioOkForDash
    && dashLeavesEnoughStamina
    && dashRoll < profile.dashCloseChance
  ) {
    const toward = normalized(towardTarget);
    input.x = toward.x;
    input.z = toward.z;
    input.dodgePressed = true;
    heldMovement = steerInsideBounds(toward, self, observation.bounds, profile.wallBuffer);
    reason = 'dash-close';
  } else if (!retreating && idle && enoughToAttack && !restrained) {
    // 1c.3 fix: only press Attack when the shared attack cooldown is ready, or close enough
    // that the input buffer keeps the press alive until it clears. Prevents dead presses that
    // the old build wasted while on cooldown.
    const attackReadyOrBuffered = self.attackCooldownRemaining < COMBAT_TUNING.inputBufferTicks;
    if (distance <= attackProfile.range && attackReadyOrBuffered && aggressionRoll < profile.aggression) {
      input.attackPressed = true;
      reason = 'attack';
    } else if (
      distance > attackProfile.range
      && distance <= attackProfile.range + profile.mistakeRangeMargin
      && mistakeRoll < profile.mistakeChance
    ) {
      input.attackPressed = true;
      mistakes.outsideAttack += 1;
      reason = 'mistake-outside-attack';
    }
  } else if (
    !retreating
    && !restrained
    && self.currentAction.type === 'attack'
    && self.currentAction.phase === 'recovery'
    && enoughToAttack
    && attackProfile.startupTicks
      + attackProfile.activeTicks
      + attackProfile.recoveryTicks
      - self.actionTick <= profile.overcommitWindowTicks
    && mistakeRoll < profile.mistakeChance
  ) {
    // This is still only an ordinary buffered press; combat decides whether/when it can start.
    input.attackPressed = true;
    mistakes.overcommit += 1;
    reason = 'mistake-overcommit';
  }

  const nextAiState: AiState = {
    ...baseState,
    rngState,
    nextDecisionTick: tick + profile.decisionIntervalTicks,
    blockUntilTick,
    guardReadyTick,
    farObservations,
    retreatUntilTick,
    circleDirection,
    heldMovement,
    decisionCount: aiState.decisionCount + 1,
    mistakes,
    lastDecision: reason,
  };
  return { input, nextAiState };
}

/**
 * Run one normal pair-combat tick with an AI-produced second input. This wrapper changes no
 * combatant directly: both sides still pass through `stepCombatantPair` and all standard rules.
 */
export function stepCombatWithAi(
  state: CombatState,
  playerInput: CombatInput,
  aiState: AiState,
  profile: AiProfile = ROOKIE_PROFILE,
): AiCombatStepResult {
  if (state.fightOver) {
    const result = stepCombatantPair(state, {
      player: playerInput,
      dummy: { ...NEUTRAL_COMBAT_INPUT },
    });
    return {
      ...result,
      aiState: {
        ...aiState,
        history: aiState.history.map(cloneSnapshot),
        heldMovement: { ...aiState.heldMovement },
        mistakes: { ...aiState.mistakes },
        habitWindow: aiState.habitWindow.map((sample) => ({ ...sample })),
        lastObserved: cloneSnapshot(aiState.lastObserved),
        patternCounts: { ...aiState.patternCounts },
      },
      aiInput: { ...NEUTRAL_COMBAT_INPUT },
    };
  }

  const decision = decide(aiState, {
    self: state.dummy,
    target: state.player,
    bounds: state.bounds,
  }, state.tick, profile);
  const result = stepCombatantPair(state, { player: playerInput, dummy: decision.input });
  return { ...result, aiState: decision.nextAiState, aiInput: decision.input };
}
