import type { Vec2 } from './arena';
import {
  COMBAT_TUNING,
  NEUTRAL_COMBAT_INPUT,
  attackProfileOf,
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
  /**
   * Edge distance the AI keeps OUTSIDE the target's attack reach. The default fighting
   * distance is `targetReach + reachMargin`; the AI holds there unless it is entering,
   * guarding, punishing, or disengaging.
   */
  reachMargin: number;
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
  /** Attack chance against an observed staggered / recovering target in range. */
  punishChance: number;
  dashCloseDistance: number;
  dashCloseChance: number;
  dashMinStaminaRatio: number;
  /** Engagement cycle: relative weights for choosing the entry plan each cycle. */
  baitPunishWeight: number;
  dashStrikeWeight: number;
  pokeWeight: number;
  /** Observed target attack-cooldown ticks that count as an opening worth entering on. */
  minOpeningCooldownTicks: number;
  /** Entries stop at (own attack range - strikeRangeMargin) instead of running through. */
  strikeRangeMargin: number;
  /** Dash-strike only dashes when the fixed dodge distance leaves at least this much room. */
  dashEntrySlack: number;
  /** The strike is pressed up to this far outside own range; startup closes the rest. */
  strikePressMargin: number;
  /** During an entry, guard when the observed target could swing within this many ticks. */
  entryShieldThreatTicks: number;
  /** How long the entry shield is held per raise. */
  entryShieldHoldTicks: number;
  /** Chance per decision that the entry shield is actually raised (rookies miss some). */
  entryShieldChance: number;
  /** Bait-punish gives up and falls through to another plan after this random wait. */
  patienceTicksMin: number;
  patienceTicksMax: number;
  /** Ticks spent back at the edge after every strike before a new plan starts. */
  disengageTicksMin: number;
  disengageTicksMax: number;
  /** An entry that cannot land a strike within this many ticks is abandoned. */
  entryTimeoutTicks: number;
}

export const ROOKIE_PROFILE: Readonly<AiProfile> = {
  reactionTicks: 12,
  decisionIntervalTicks: 8,
  aggression: 0.58,
  caution: 0.52,
  mistakeChance: 0.14,
  reachMargin: 0.5,
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
  punishChance: 0.85,
  dashCloseDistance: 4.5,
  dashCloseChance: 0.45,
  dashMinStaminaRatio: 0.35,
  baitPunishWeight: 0.35,
  dashStrikeWeight: 0.25,
  pokeWeight: 0.4,
  minOpeningCooldownTicks: 16,
  strikeRangeMargin: 0.25,
  dashEntrySlack: 0.6,
  strikePressMargin: 0.25,
  entryShieldThreatTicks: 16,
  entryShieldHoldTicks: 8,
  entryShieldChance: 0.9,
  patienceTicksMin: 40,
  patienceTicksMax: 90,
  disengageTicksMin: 18,
  disengageTicksMax: 45,
  entryTimeoutTicks: 60,
} as const;

export type StaminaBand = 'low' | 'ok';

/** The intentionally limited, delayed information retained about the target. */
export interface AiTargetSnapshot {
  position: Vec2;
  facing: Vec2;
  currentAction: { type: ActionType; phase: ActionPhase };
  actionTick: number;
  staminaBand: StaminaBand;
  /**
   * The target's attack cooldown at snapshot time. Public information: the HUD shows the
   * player exactly the same fill for the opponent. It is read through the same delay as
   * everything else in the snapshot.
   */
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

export type AiEngagePhase = 'approach' | 'hold' | 'entry' | 'disengage';
export type AiEntryPlan = 'bait-punish' | 'dash-strike' | 'poke';

export type AiDecisionReason =
  | 'waiting'
  | 'approach'
  | 'spacing-out'
  | 'hold-edge'
  | 'entry'
  | 'strike'
  | 'disengage'
  | 'retreat'
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
  /** Engagement cycle: approach -> hold at the edge -> entry -> strike -> disengage. */
  engagePhase: AiEngagePhase;
  entryPlan: AiEntryPlan;
  /** Bait-punish falls through to another plan when this tick passes without an opening. */
  patienceDeadlineTick: number;
  /** An entry that has not struck by this tick is abandoned into a disengage. */
  entryDeadlineTick: number;
  /** Disengage lasts at least until this tick before a new plan is chosen. */
  disengageUntilTick: number;
  /** True once the dash-strike entry has spent its dodge for the current entry. */
  entryDashUsed: boolean;
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
    engagePhase: 'approach',
    entryPlan: 'poke',
    patienceDeadlineTick: 0,
    entryDeadlineTick: 0,
    disengageUntilTick: 0,
    entryDashUsed: false,
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

/** Hold a chosen distance: approach when too far, circle when there, back out when too close. */
function movementAtRange(
  self: CombatantState,
  target: AiTargetSnapshot,
  profile: AiProfile,
  circleDirection: -1 | 1,
  desiredDistance: number,
): Vec2 {
  const toward = normalized({
    x: target.position.x - self.position.x,
    z: target.position.z - self.position.z,
  });
  const distance = Math.hypot(
    target.position.x - self.position.x,
    target.position.z - self.position.z,
  );
  if (distance > desiredDistance + profile.rangeTolerance) {
    return { x: toward.x * profile.approachStrength, z: toward.z * profile.approachStrength };
  }

  const circle = {
    x: -toward.z * profile.sidestepStrength * circleDirection,
    z: toward.x * profile.sidestepStrength * circleDirection,
  };
  if (distance < desiredDistance - profile.rangeTolerance) {
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

/**
 * Steer inside bounds, and if the wanted direction is fully blocked by walls (a corner),
 * slide along the wall in the current circle direction instead of freezing in place.
 */
function steerOrWallSlide(
  movement: Vec2,
  self: CombatantState,
  bounds: CombatState['bounds'],
  wallBuffer: number,
  circleDirection: -1 | 1,
): Vec2 {
  const steered = steerInsideBounds(movement, self, bounds, wallBuffer);
  if (lengthOf(steered) > 0.05 || lengthOf(movement) <= 0.05) return steered;
  const slideCandidates: Vec2[] = [
    { x: -movement.z * circleDirection, z: movement.x * circleDirection },
    { x: movement.z * circleDirection, z: -movement.x * circleDirection },
  ];
  for (const candidate of slideCandidates) {
    const slid = steerInsideBounds(normalized(candidate), self, bounds, wallBuffer);
    if (lengthOf(slid) > 0.05) return slid;
  }
  return { x: 0, z: 0 };
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

const randomInRange = (minimum: number, maximum: number, roll: number): number =>
  minimum + Math.floor(roll * (Math.max(minimum, maximum) - minimum + 1));

function choosePlan(profile: AiProfile, roll: number, excludeBaitPunish: boolean): AiEntryPlan {
  const bait = excludeBaitPunish ? 0 : Math.max(0, profile.baitPunishWeight);
  const dash = Math.max(0, profile.dashStrikeWeight);
  const poke = Math.max(0, profile.pokeWeight);
  const total = bait + dash + poke;
  if (total <= 0) return 'poke';
  const pick = roll * total;
  if (pick < bait) return 'bait-punish';
  if (pick < bait + dash) return 'dash-strike';
  return 'poke';
}

/**
 * Deterministic rookie controller. The target's current snapshot is appended to history, but all
 * decisions use the snapshot exactly `reactionTicks` old. No target input is accepted or read.
 *
 * Spacing rules: the AI's default fighting distance is `targetReach + reachMargin` (the "edge").
 * It never idles or circles inside the target's reach while the target's attack is observed as
 * available; it only goes inside the reach to execute an entry plan, to punish, or behind a
 * guard, and after every strike it disengages back to the edge.
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
  const guardRoll = random();
  const guardHoldRoll = random();
  const punishRoll = random();
  const dashRoll = random();
  const planRoll = random();
  const patienceRoll = random();
  const disengageRoll = random();

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

  // Reach awareness: the target's attack profile (its loadout) is static public information,
  // exactly like the weapon a player can see; only time-varying state goes through the delay.
  const targetReach = attackProfileOf(observation.target).range;
  const edgeDistance = targetReach + profile.reachMargin;
  // "Attack available" as seen through the delayed snapshot: cooldown finished, not swinging,
  // and not holding a guard (a raised block must pass its recovery before it can attack).
  const observedHoldingBlock = target.currentAction.type === 'block'
    && target.currentAction.phase !== 'recovery';
  const observedAttackReady = target.attackCooldownRemaining <= 0
    && target.currentAction.type !== 'attack'
    && target.currentAction.type !== 'stagger'
    && !observedHoldingBlock;
  // Openings worth entering on, all read from the delayed snapshot: the target is committed
  // to something (swing recovery, cooldown, stagger, or a raised guard) and cannot hit back.
  const observedOpening = target.currentAction.type === 'stagger'
    || (target.currentAction.type === 'attack' && target.currentAction.phase === 'recovery')
    || (target.currentAction.type === 'dodge' && target.currentAction.phase === 'recovery')
    || observedHoldingBlock
    || target.attackCooldownRemaining >= profile.minOpeningCooldownTicks;
  // The target's next swing cannot start before its cooldown elapses (public information).
  // A small observed remainder means the swing is imminent; committing an attack into that
  // gap is how trades happen, so punish and strike both respect it. A staggered target
  // cannot swing at all, so the veto never applies there.
  const observedSwingSoon = target.currentAction.type !== 'stagger'
    && target.attackCooldownRemaining > 0
    && target.attackCooldownRemaining <= profile.entryShieldThreatTicks;

  // Engagement-cycle state for this decision (written back at the end).
  let engagePhase = aiState.engagePhase;
  let entryPlan = aiState.entryPlan;
  let patienceDeadlineTick = aiState.patienceDeadlineTick;
  let entryDeadlineTick = aiState.entryDeadlineTick;
  let disengageUntilTick = aiState.disengageUntilTick;
  let entryDashUsed = aiState.entryDashUsed;
  const startDisengage = () => {
    engagePhase = 'disengage';
    disengageUntilTick = tick + randomInRange(profile.disengageTicksMin, profile.disengageTicksMax, disengageRoll);
    entryDashUsed = false;
  };

  // Default movement follows the current engagement phase until a branch overrides it.
  let heldMovement: Vec2;
  let reason: AiDecisionReason;
  if (engagePhase === 'disengage') {
    heldMovement = retreatMovement(self, target, profile.retreatStrength);
    reason = 'disengage';
  } else if (engagePhase === 'entry') {
    heldMovement = { x: normalized(towardTarget).x * profile.approachStrength, z: normalized(towardTarget).z * profile.approachStrength };
    reason = 'entry';
  } else {
    heldMovement = movementAtRange(self, target, profile, circleDirection, edgeDistance);
    reason = distance > edgeDistance + profile.rangeTolerance ? 'approach' : 'hold-edge';
  }
  if (retreating) {
    heldMovement = retreatMovement(self, target, profile.retreatStrength);
    reason = 'retreat';
  }

  let blockUntilTick = aiState.blockUntilTick;
  let guardReadyTick = aiState.guardReadyTick;
  const threatRange = attackProfileOf(observation.target).range + profile.defenseRangeMargin;
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
  const attackProfile = attackProfileOf(self);
  const enoughToAttack = self.stamina >= attackProfile.staminaCost;
  const enoughToDodge = self.stamina >= COMBAT_TUNING.dodge.staminaCost;
  const idle = self.currentAction.type === 'idle';
  // Attack presses respect the shared cooldown: pressed only when it has fully elapsed.
  const canAttackNow = idle && enoughToAttack && self.attackCooldownRemaining <= 0;
  const observedStartup = target.currentAction.type === 'attack'
    && target.currentAction.phase === 'startup';
  const defensiveRange = distance <= threatRange;
  const enduranceRatio = self.maxEndurance > 0 ? self.endurance / self.maxEndurance : 0;
  // Punishable states, as seen through the reaction delay: never current-tick knowledge.
  const observedPunishable = target.currentAction.type === 'stagger'
    || (target.currentAction.type === 'attack' && target.currentAction.phase === 'recovery')
    || (target.currentAction.type === 'dodge' && target.currentAction.phase === 'recovery');
  const dashLeavesEnoughStamina = self.maxStamina > 0
    && (self.stamina - COMBAT_TUNING.dodge.staminaCost) / self.maxStamina >= profile.dashMinStaminaRatio;
  const staminaRatioOkForDash = staminaRatio >= profile.dashMinStaminaRatio;
  const canDashEntry = enoughToDodge && staminaRatioOkForDash && dashLeavesEnoughStamina;

  if (!retreating && canAttackNow && observedPunishable && !observedSwingSoon
    && distance <= attackProfile.range && punishRoll < profile.punishChance) {
    input.attackPressed = true;
    reason = 'punish';
    startDisengage();
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
    engagePhase = 'approach';
  } else if (
    !retreating
    && self.currentAction.type === 'attack'
    && self.currentAction.phase === 'recovery'
    && enoughToAttack
    // A press this late is an ordinary buffered press: it can only fire after the cooldown.
    && self.attackCooldownRemaining <= COMBAT_TUNING.inputBufferTicks
    && attackProfile.startupTicks
      + attackProfile.activeTicks
      + attackProfile.recoveryTicks
      - self.actionTick <= profile.overcommitWindowTicks
    && mistakeRoll < profile.mistakeChance
  ) {
    // "Stayed too long": instead of disengaging after the strike, it swings again in place.
    input.attackPressed = true;
    mistakes.overcommit += 1;
    reason = 'mistake-overcommit';
  } else if (
    // "Entered early": an eager swing from just outside its own reach.
    !retreating
    && canAttackNow
    && distance > attackProfile.range
    && distance <= attackProfile.range + profile.mistakeRangeMargin
    && mistakeRoll < profile.mistakeChance
  ) {
    input.attackPressed = true;
    mistakes.outsideAttack += 1;
    reason = 'mistake-outside-attack';
    startDisengage();
  } else if (!retreating) {
    // Engagement cycle: approach -> hold at the edge -> entry -> strike -> disengage.
    if (engagePhase === 'disengage') {
      if (tick >= disengageUntilTick && distance >= edgeDistance - profile.rangeTolerance) {
        engagePhase = 'approach';
      } else {
        heldMovement = retreatMovement(self, target, profile.retreatStrength);
        reason = 'disengage';
        // Cover the backout: if the target's swing is imminent while still inside its
        // reach, dodge out behind i-frames when stamina allows, otherwise retreat behind
        // a short guard instead of eating the hit in the back.
        if (
          idle
          && observedSwingSoon
          && distance <= targetReach + profile.rangeTolerance
          && defenseRoll < profile.entryShieldChance
        ) {
          if (enoughToDodge && staminaRatioOkForDash && dashLeavesEnoughStamina) {
            const away = retreatMovement(self, target, 1);
            input.x = away.x;
            input.z = away.z;
            input.dodgePressed = true;
          } else if (
            tick >= blockUntilTick
            && enduranceRatio >= profile.minEnduranceRatioToGuard
            && self.stamina >= COMBAT_TUNING.block.minimumStartStamina
          ) {
            blockUntilTick = tick + profile.entryShieldHoldTicks;
            input.blockHeld = true;
          }
        }
      }
    }
    if (engagePhase === 'approach') {
      if (distance > edgeDistance + profile.rangeTolerance) {
        heldMovement = movementAtRange(self, target, profile, circleDirection, edgeDistance);
        reason = 'approach';
      } else if (distance < edgeDistance - profile.rangeTolerance && observedAttackReady) {
        // Inside the target's reach with its attack up: never linger here, get back out
        // at full retreat speed rather than the gentle spacing shuffle.
        heldMovement = retreatMovement(self, target, profile.retreatStrength);
        reason = 'spacing-out';
      } else {
        engagePhase = 'hold';
        entryPlan = choosePlan(profile, planRoll, false);
        patienceDeadlineTick = tick
          + randomInRange(profile.patienceTicksMin, profile.patienceTicksMax, patienceRoll);
      }
    }
    if (engagePhase === 'hold') {
      const baitTimedOut = entryPlan === 'bait-punish' && tick >= patienceDeadlineTick;
      if (baitTimedOut) {
        // A passive target never shows an opening: fall through to a committal plan.
        entryPlan = choosePlan(profile, planRoll, true);
      }
      if (entryPlan !== 'bait-punish' || observedOpening || baitTimedOut) {
        engagePhase = 'entry';
        entryDeadlineTick = tick + profile.entryTimeoutTicks;
        entryDashUsed = false;
      } else {
        heldMovement = movementAtRange(self, target, profile, circleDirection, edgeDistance);
        reason = 'hold-edge';
      }
    }
    if (engagePhase === 'entry') {
      if (tick >= entryDeadlineTick) {
        startDisengage();
        heldMovement = retreatMovement(self, target, profile.retreatStrength);
        reason = 'disengage';
      } else {
        let dashedThisDecision = false;
        if (entryPlan === 'dash-strike' && !entryDashUsed && idle) {
          // Only dash when the fixed dodge distance will not overshoot deep past the target.
          if (canDashEntry && distance >= COMBAT_TUNING.dodge.distance + profile.dashEntrySlack) {
            // Enter behind the dodge's i-frames; the strike follows when recovery ends.
            const toward = normalized(towardTarget);
            input.x = toward.x;
            input.z = toward.z;
            input.dodgePressed = true;
            entryDashUsed = true;
            dashedThisDecision = true;
          } else {
            entryPlan = 'poke';
          }
        }
        // Step in only as far as the strike needs: never run through the target. While the
        // target's swing is imminent, wait at the door (just outside its reach) instead of
        // walking into the active frames; advance once the swing has spent itself.
        const strikeDistance = observedSwingSoon && distance > targetReach - profile.rangeTolerance
          ? Math.max(targetReach + profile.rangeTolerance, attackProfile.range - profile.strikeRangeMargin)
          : Math.max(0.1, attackProfile.range - profile.strikeRangeMargin);
        heldMovement = movementAtRange(self, target, profile, circleDirection, strikeDistance);
        reason = 'entry';
        // Bait-punish and dash-strike entries are committed; a poke still hesitates with
        // (1 - aggression) probability per decision, like the rookie it is.
        const committed = entryPlan !== 'poke' || aggressionRoll < profile.aggression;
        const canStrikeNow = !dashedThisDecision
          && committed
          && canAttackNow
          && distance <= attackProfile.range + profile.strikePressMargin;
        // Shield advance: the target's swing is imminent, so raise a short guard and let the
        // swing spend itself on endurance, then strike. An observed startup is NOT used
        // here: through the reaction delay it is always stale against quick attacks.
        if (
          !dashedThisDecision
          && observedSwingSoon
          && distance <= targetReach + profile.rangeTolerance
          && tick >= blockUntilTick
          && enduranceRatio >= profile.minEnduranceRatioToGuard
          && self.stamina >= COMBAT_TUNING.block.minimumStartStamina
          && defenseRoll < profile.entryShieldChance
        ) {
          blockUntilTick = tick + profile.entryShieldHoldTicks;
          input.blockHeld = true;
        } else if (canStrikeNow && !observedSwingSoon) {
          input.attackPressed = true;
          reason = 'strike';
          startDisengage();
        }
      }
    }
  }

  // Wall awareness applies to every chosen movement; a cornered AI slides along the wall
  // instead of freezing (and its guard/dodge branches above remain available).
  heldMovement = steerOrWallSlide(heldMovement, self, observation.bounds, profile.wallBuffer, circleDirection);
  input.x = input.dodgePressed ? input.x : heldMovement.x;
  input.z = input.dodgePressed ? input.z : heldMovement.z;

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
    engagePhase,
    entryPlan,
    patienceDeadlineTick,
    entryDeadlineTick,
    disengageUntilTick,
    entryDashUsed,
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
