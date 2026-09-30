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
export interface AiProfile {
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
}

export const ROOKIE_PROFILE: Readonly<AiProfile> = {
  reactionTicks: 12,
  decisionIntervalTicks: 8,
  aggression: 0.58,
  caution: 0.52,
  mistakeChance: 0.14,
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
} as const;

export type StaminaBand = 'low' | 'ok';

/** The intentionally limited, delayed information retained about the target. */
export interface AiTargetSnapshot {
  position: Vec2;
  facing: Vec2;
  currentAction: { type: ActionType; phase: ActionPhase };
  actionTick: number;
  staminaBand: StaminaBand;
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

export type AiDecisionReason =
  | 'waiting'
  | 'approach'
  | 'circle'
  | 'retreat'
  | 'attack'
  | 'defend-block'
  | 'defend-dodge'
  | 'mistake-outside-attack'
  | 'mistake-overblock'
  | 'mistake-overcommit';

/** Plain data only: this includes history and the serializable shared-PRNG state. */
export interface AiState {
  rngState: number;
  history: AiTargetSnapshot[];
  nextDecisionTick: number;
  blockUntilTick: number;
  retreatUntilTick: number;
  circleDirection: -1 | 1;
  heldMovement: Vec2;
  decisionCount: number;
  mistakes: AiMistakeCounts;
  lastDecision: AiDecisionReason;
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
  defeated: false,
});

function targetSnapshot(target: CombatantState): AiTargetSnapshot {
  return {
    position: { ...target.position },
    facing: { ...target.facing },
    currentAction: { ...target.currentAction },
    actionTick: target.actionTick,
    staminaBand: target.stamina / target.maxStamina <= COMBAT_TUNING.lowStaminaThreshold ? 'low' : 'ok',
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
    retreatUntilTick: 0,
    circleDirection: 1,
    heldMovement: { x: 0, z: 0 },
    decisionCount: 0,
    mistakes: { outsideAttack: 0, overblock: 0, overcommit: 0 },
    lastDecision: 'waiting',
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
  const input: CombatInput = {
    ...NEUTRAL_COMBAT_INPUT,
    ...heldMovement,
    blockHeld: tick < blockUntilTick && self.stamina >= COMBAT_TUNING.block.minimumStartStamina,
  };
  const mistakes = { ...aiState.mistakes };
  const enoughToAttack = self.stamina >= COMBAT_TUNING.attack.staminaCost;
  const enoughToDodge = self.stamina >= COMBAT_TUNING.dodge.staminaCost;
  const idle = self.currentAction.type === 'idle';
  const observedStartup = target.currentAction.type === 'attack'
    && target.currentAction.phase === 'startup';
  const defensiveRange = distance <= COMBAT_TUNING.attack.range + profile.defenseRangeMargin;

  if (!retreating && idle && observedStartup && defensiveRange && cautionRoll < profile.caution) {
    if (defenseRoll < profile.dodgeShare && enoughToDodge) {
      const away = retreatMovement(self, target, profile.retreatStrength);
      input.x = away.x;
      input.z = away.z;
      input.dodgePressed = true;
      reason = 'defend-dodge';
    } else if (self.stamina >= COMBAT_TUNING.block.minimumStartStamina) {
      const overblock = mistakeRoll < profile.mistakeChance;
      blockUntilTick = tick + (overblock ? profile.mistakeBlockHoldTicks : profile.normalBlockHoldTicks);
      input.blockHeld = true;
      if (overblock) {
        mistakes.overblock += 1;
        reason = 'mistake-overblock';
      } else {
        reason = 'defend-block';
      }
    }
  } else if (!retreating && idle && enoughToAttack) {
    if (distance <= COMBAT_TUNING.attack.range && aggressionRoll < profile.aggression) {
      input.attackPressed = true;
      reason = 'attack';
    } else if (
      distance > COMBAT_TUNING.attack.range
      && distance <= COMBAT_TUNING.attack.range + profile.mistakeRangeMargin
      && mistakeRoll < profile.mistakeChance
    ) {
      input.attackPressed = true;
      mistakes.outsideAttack += 1;
      reason = 'mistake-outside-attack';
    }
  } else if (
    !retreating
    && self.currentAction.type === 'attack'
    && self.currentAction.phase === 'recovery'
    && enoughToAttack
    && COMBAT_TUNING.attack.startupTicks
      + COMBAT_TUNING.attack.activeTicks
      + COMBAT_TUNING.attack.recoveryTicks
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
