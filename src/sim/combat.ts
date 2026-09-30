import type { HiddenStats } from './fighter';
import type { MovementInput, Vec2 } from './arena';

/** Every combat balance value lives here so timing and feel can be reviewed in one place. */
export const COMBAT_TUNING = {
  tickRate: 60,
  maxCatchUpTicks: 5,
  arena: { minX: -10, maxX: 10, minZ: -7, maxZ: 7 },
  movementSpeed: 5,
  inputBufferTicks: 6,
  lowStaminaThreshold: 0.25,
  lowStaminaMovementMultiplier: 0.9,
  attack: {
    startupTicks: 6,
    activeTicks: 3,
    recoveryTicks: 15,
    range: 2.1,
    arcDegrees: 100,
    damage: 18,
    staminaCost: 5,
    lowStaminaDamageMultiplier: 0.9,
    startupMovementMultiplier: 0.75,
    activeMovementMultiplier: 0.6,
    recoveryMovementMultiplier: 0.85,
  },
  block: {
    startupTicks: 2,
    recoveryTicks: 5,
    facingArcDegrees: 150,
    damageReduction: 0.65,
    staminaPerHit: 12,
    minimumStartStamina: 1,
    movementMultiplier: 0.45,
    breakStaggerTicks: 9,
  },
  dodge: {
    startupTicks: 1,
    activeTicks: 7,
    recoveryTicks: 13,
    iframeTicks: 5,
    distance: 3,
    staminaCost: 10,
    recoveryMovementMultiplier: 0,
  },
  stamina: {
    /**
     * Stamina regenerates every tick. It pauses only while block is held/active and for the
     * whole dodge action, and resumes on the first tick after those end.
     *
     * `regenDelayTicks` is the ONLY regen pause that outlives an action, and it is applied
     * exclusively after a block break, so that punish gap can be tuned without code changes.
     * At the default 0 a broken block regenerates again immediately.
     */
    regenDelayTicks: 0,
    regenPerTick: 0.3,
  },
  vitals: {
    baselineStat: 50,
    baseHealth: 95,
    baseStamina: 95,
    primaryStatScale: 0.2,
    secondaryStatScale: 0.05,
    minHealth: 90,
    maxHealth: 110,
    minStamina: 90,
    maxStamina: 110,
  },
  initial: {
    playerPosition: { x: -1, z: 1 },
    dummyPosition: { x: 0.4, z: 0 },
    playerFacing: { x: 0, z: -1 },
    dummyFacing: { x: 0, z: 1 },
  },
} as const;

export const COMBAT_FIXED_DT = 1 / COMBAT_TUNING.tickRate;

export type CombatantId = 'player' | 'dummy';
/** `draw` is possible when both already-committed attacks defeat their targets on one tick. */
export type FightWinner = CombatantId | 'draw' | null;
export type ActionType = 'idle' | 'attack' | 'block' | 'dodge' | 'stagger';
export type ActionPhase = 'idle' | 'startup' | 'active' | 'recovery';

export interface CurrentAction {
  type: ActionType;
  phase: ActionPhase;
}

export interface CombatInput extends MovementInput {
  /** Edge-triggered: true for one simulation tick per press. */
  attackPressed: boolean;
  /** Level-triggered: true for every tick the control is held. */
  blockHeld: boolean;
  /** Edge-triggered: true for one simulation tick per press. */
  dodgePressed: boolean;
}

export interface CombatantState {
  id: CombatantId;
  position: Vec2;
  velocity: Vec2;
  facing: Vec2;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  currentAction: CurrentAction;
  actionTick: number;
  invulnerable: boolean;
  defeated: boolean;
  /** Generic action bookkeeping; it is present on both player and dummy. */
  attackConnected: boolean;
  actionDirection: Vec2;
  /** Post-block-break regen pause in ticks. Nothing else sets it; spending stamina never does. */
  staminaRegenDelay: number;
  inputBuffer: { attackTicks: number; dodgeTicks: number };
  stationary: boolean;
}

export interface CombatState {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  player: CombatantState;
  /** The shared second-combatant slot: stationary in dummy mode, mobile in opponent mode. */
  dummy: CombatantState;
  tick: number;
  fightOver: boolean;
  winner: FightWinner;
}

export type CombatEventType =
  | 'ACTION_STARTED'
  | 'ATTACK_HIT'
  | 'ATTACK_BLOCKED'
  | 'ATTACK_MISSED'
  | 'DODGE_EVADED'
  | 'DAMAGE_APPLIED'
  | 'BLOCK_BROKEN'
  | 'STAMINA_DEPLETED'
  | 'COMBATANT_DEFEATED';

/** Plain-data event records can be logged, replayed, or rendered without simulation imports. */
export interface CombatEvent {
  type: CombatEventType;
  tick: number;
  actorId?: CombatantId;
  targetId?: CombatantId;
  action?: Exclude<ActionType, 'idle'>;
  amount?: number;
  remaining?: number;
}

export interface CombatStepResult { state: CombatState; events: CombatEvent[]; }
export interface CombatInputPair { player: CombatInput; dummy: CombatInput; }

export const NEUTRAL_COMBAT_INPUT: Readonly<CombatInput> = {
  x: 0,
  z: 0,
  attackPressed: false,
  blockHeld: false,
  dodgePressed: false,
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const finiteStat = (value: number): number =>
  Number.isFinite(value) ? value : COMBAT_TUNING.vitals.baselineStat;

/** Derive modest, bounded combat vitals without exposing the fighter's raw hidden stats. */
export function deriveCombatVitals(hiddenStats: HiddenStats): { maxHealth: number; maxStamina: number } {
  const tuning = COMBAT_TUNING.vitals;
  const centered = (value: number) => finiteStat(value) - tuning.baselineStat;
  const maxHealth = clamp(
    Math.round(tuning.baseHealth + centered(hiddenStats.health) * tuning.primaryStatScale + centered(hiddenStats.willpower) * tuning.secondaryStatScale),
    tuning.minHealth,
    tuning.maxHealth,
  );
  const maxStamina = clamp(
    Math.round(tuning.baseStamina + centered(hiddenStats.stamina) * tuning.primaryStatScale + centered(hiddenStats.reaction) * tuning.secondaryStatScale),
    tuning.minStamina,
    tuning.maxStamina,
  );
  return { maxHealth, maxStamina };
}

const baselineStats = (): HiddenStats => {
  const value = COMBAT_TUNING.vitals.baselineStat;
  return { health: value, stamina: value, reaction: value, skill: value, willpower: value };
};

export function createCombatantState(
  id: CombatantId,
  position: Vec2,
  facing: Vec2,
  vitals: { maxHealth: number; maxStamina: number },
  stationary = false,
): CombatantState {
  return {
    id,
    position: { ...position },
    velocity: { x: 0, z: 0 },
    facing: normalize(facing, { x: 0, z: 1 }),
    health: vitals.maxHealth,
    maxHealth: vitals.maxHealth,
    stamina: vitals.maxStamina,
    maxStamina: vitals.maxStamina,
    currentAction: { type: 'idle', phase: 'idle' },
    actionTick: 0,
    invulnerable: false,
    defeated: false,
    attackConnected: false,
    actionDirection: { x: 0, z: 0 },
    staminaRegenDelay: 0,
    inputBuffer: { attackTicks: 0, dodgeTicks: 0 },
    stationary,
  };
}

export function createCombatState(hiddenStats: HiddenStats = baselineStats()): CombatState {
  const playerVitals = deriveCombatVitals(hiddenStats);
  const dummyVitals = deriveCombatVitals(baselineStats());
  return {
    bounds: { ...COMBAT_TUNING.arena },
    player: createCombatantState(
      'player',
      COMBAT_TUNING.initial.playerPosition,
      COMBAT_TUNING.initial.playerFacing,
      playerVitals,
    ),
    dummy: createCombatantState(
      'dummy',
      COMBAT_TUNING.initial.dummyPosition,
      COMBAT_TUNING.initial.dummyFacing,
      dummyVitals,
      true,
    ),
    tick: 0,
    fightOver: false,
    winner: null,
  };
}

/**
 * Create the active-opponent variant without changing the established dummy-mode factory.
 * The second combatant keeps the dummy's start position and neutral-stat derived vitals, but is
 * mobile and therefore obeys the same movement/action rules as the player once given input.
 */
export function createOpponentCombatState(hiddenStats: HiddenStats = baselineStats()): CombatState {
  const state = createCombatState(hiddenStats);
  state.dummy.stationary = false;
  return state;
}

function cloneCombatant(source: CombatantState): CombatantState {
  return {
    ...source,
    position: { ...source.position },
    velocity: { ...source.velocity },
    facing: { ...source.facing },
    currentAction: { ...source.currentAction },
    actionDirection: { ...source.actionDirection },
    inputBuffer: { ...source.inputBuffer },
  };
}

function normalize(vector: Vec2, fallback: Vec2 = { x: 0, z: 0 }): Vec2 {
  const length = Math.hypot(vector.x, vector.z);
  return length > 0 ? { x: vector.x / length, z: vector.z / length } : { ...fallback };
}

const vectorTo = (from: CombatantState, to: CombatantState): Vec2 => ({
  x: to.position.x - from.position.x,
  z: to.position.z - from.position.z,
});

function faceOpponent(actor: CombatantState, opponent: CombatantState): void {
  actor.facing = normalize(vectorTo(actor, opponent), actor.facing);
}

function isInsideFacingArc(facing: Vec2, toward: Vec2, arcDegrees: number): boolean {
  const direction = normalize(toward);
  if (direction.x === 0 && direction.z === 0) return true;
  const dot = facing.x * direction.x + facing.z * direction.z;
  return dot >= Math.cos((arcDegrees * Math.PI) / 360);
}

function setAction(actor: CombatantState, type: Exclude<ActionType, 'idle'>, events: CombatEvent[], tick: number): void {
  actor.currentAction = { type, phase: type === 'stagger' ? 'recovery' : 'startup' };
  actor.actionTick = 0;
  actor.attackConnected = false;
  events.push({ type: 'ACTION_STARTED', tick, actorId: actor.id, action: type });
}

/**
 * Spending stamina never starts a regen delay. Basic attacks are meant to be sustainable, so
 * regeneration keeps running through them; only the pauses in `regenerateStamina` stop it.
 */
function spendStamina(actor: CombatantState, amount: number, events: CombatEvent[], tick: number): void {
  const before = actor.stamina;
  actor.stamina = Math.max(0, actor.stamina - amount);
  if (before > 0 && actor.stamina === 0) {
    events.push({ type: 'STAMINA_DEPLETED', tick, actorId: actor.id, remaining: 0 });
  }
}

function dodgeDirection(actor: CombatantState, opponent: CombatantState, input: CombatInput): Vec2 {
  const requested = normalize({ x: clamp(input.x, -1, 1), z: clamp(input.z, -1, 1) });
  if (requested.x !== 0 || requested.z !== 0) return requested;
  const away = normalize({ x: actor.position.x - opponent.position.x, z: actor.position.z - opponent.position.z });
  return away.x !== 0 || away.z !== 0 ? away : { x: -actor.facing.x, z: -actor.facing.z };
}

function bufferInput(actor: CombatantState, input: CombatInput): void {
  if (input.attackPressed) actor.inputBuffer.attackTicks = COMBAT_TUNING.inputBufferTicks;
  if (input.dodgePressed) actor.inputBuffer.dodgeTicks = COMBAT_TUNING.inputBufferTicks;
}

function startBufferedAction(
  actor: CombatantState,
  opponent: CombatantState,
  input: CombatInput,
  events: CombatEvent[],
  tick: number,
): void {
  if (actor.currentAction.type !== 'idle' || actor.defeated) return;

  // Dodge wins a same-tick tie, then attack, then held block. The losing tap is discarded.
  // A press that cannot be paid for is not consumed: it keeps decaying in the buffer and fires
  // on the first buffered tick where enough stamina exists.
  if (actor.inputBuffer.dodgeTicks > 0 && actor.stamina >= COMBAT_TUNING.dodge.staminaCost) {
    actor.inputBuffer.dodgeTicks = 0;
    actor.inputBuffer.attackTicks = 0;
    actor.actionDirection = dodgeDirection(actor, opponent, input);
    setAction(actor, 'dodge', events, tick);
    spendStamina(actor, COMBAT_TUNING.dodge.staminaCost, events, tick);
    return;
  }
  if (actor.inputBuffer.attackTicks > 0 && actor.stamina >= COMBAT_TUNING.attack.staminaCost) {
    actor.inputBuffer.attackTicks = 0;
    setAction(actor, 'attack', events, tick);
    spendStamina(actor, COMBAT_TUNING.attack.staminaCost, events, tick);
    return;
  }
  if (input.blockHeld && actor.stamina >= COMBAT_TUNING.block.minimumStartStamina) {
    setAction(actor, 'block', events, tick);
  }
}

function phaseFor(actor: CombatantState): ActionPhase {
  const { type } = actor.currentAction;
  const tick = actor.actionTick;
  if (type === 'idle') return 'idle';
  if (type === 'attack') {
    if (tick < COMBAT_TUNING.attack.startupTicks) return 'startup';
    if (tick < COMBAT_TUNING.attack.startupTicks + COMBAT_TUNING.attack.activeTicks) return 'active';
    return 'recovery';
  }
  if (type === 'dodge') {
    if (tick < COMBAT_TUNING.dodge.startupTicks) return 'startup';
    if (tick < COMBAT_TUNING.dodge.startupTicks + COMBAT_TUNING.dodge.activeTicks) return 'active';
    return 'recovery';
  }
  return actor.currentAction.phase;
}

function prepareAction(actor: CombatantState, input: CombatInput): void {
  if (actor.currentAction.type === 'block') {
    if (actor.currentAction.phase !== 'recovery' && !input.blockHeld) {
      actor.currentAction.phase = 'recovery';
      actor.actionTick = 0;
    } else if (actor.currentAction.phase === 'startup' && actor.actionTick >= COMBAT_TUNING.block.startupTicks) {
      actor.currentAction.phase = 'active';
    }
  } else {
    actor.currentAction.phase = phaseFor(actor);
  }
  const dodgeActiveTick = actor.actionTick - COMBAT_TUNING.dodge.startupTicks;
  actor.invulnerable = actor.currentAction.type === 'dodge'
    && actor.currentAction.phase === 'active'
    && dodgeActiveTick < COMBAT_TUNING.dodge.iframeTicks;
}

function movementMultiplier(actor: CombatantState): number {
  if (actor.currentAction.type === 'attack') {
    if (actor.currentAction.phase === 'startup') return COMBAT_TUNING.attack.startupMovementMultiplier;
    if (actor.currentAction.phase === 'active') return COMBAT_TUNING.attack.activeMovementMultiplier;
    return COMBAT_TUNING.attack.recoveryMovementMultiplier;
  }
  if (actor.currentAction.type === 'block') return COMBAT_TUNING.block.movementMultiplier;
  if (actor.currentAction.type === 'dodge') return actor.currentAction.phase === 'active'
    ? 0
    : COMBAT_TUNING.dodge.recoveryMovementMultiplier;
  if (actor.currentAction.type === 'stagger') return 0;
  return 1;
}

function moveCombatant(actor: CombatantState, input: CombatInput, bounds: CombatState['bounds']): void {
  if (actor.stationary || actor.defeated) {
    actor.velocity = { x: 0, z: 0 };
    return;
  }

  let direction: Vec2;
  let speed: number;
  if (actor.currentAction.type === 'dodge' && actor.currentAction.phase === 'active') {
    direction = actor.actionDirection;
    speed = COMBAT_TUNING.dodge.distance / (COMBAT_TUNING.dodge.activeTicks * COMBAT_FIXED_DT);
  } else {
    const raw = { x: clamp(input.x, -1, 1), z: clamp(input.z, -1, 1) };
    const magnitude = Math.min(1, Math.hypot(raw.x, raw.z));
    direction = normalize(raw);
    const lowStamina = actor.stamina / actor.maxStamina <= COMBAT_TUNING.lowStaminaThreshold;
    speed = COMBAT_TUNING.movementSpeed * magnitude * movementMultiplier(actor)
      * (lowStamina ? COMBAT_TUNING.lowStaminaMovementMultiplier : 1);
  }

  const oldPosition = actor.position;
  const intendedVelocity = { x: direction.x * speed, z: direction.z * speed };
  const position = {
    x: clamp(oldPosition.x + intendedVelocity.x * COMBAT_FIXED_DT, bounds.minX, bounds.maxX),
    z: clamp(oldPosition.z + intendedVelocity.z * COMBAT_FIXED_DT, bounds.minZ, bounds.maxZ),
  };
  actor.position = position;
  actor.velocity = {
    x: (position.x - oldPosition.x) / COMBAT_FIXED_DT,
    z: (position.z - oldPosition.z) / COMBAT_FIXED_DT,
  };
}

function breakBlock(target: CombatantState, events: CombatEvent[], tick: number, attacker: CombatantState): void {
  target.currentAction = { type: 'stagger', phase: 'recovery' };
  target.actionTick = 0;
  target.invulnerable = false;
  // The block break is the only event that delays regeneration beyond the action itself.
  target.staminaRegenDelay = COMBAT_TUNING.stamina.regenDelayTicks;
  events.push({ type: 'BLOCK_BROKEN', tick, actorId: target.id, targetId: attacker.id });
}

function applyDamage(attacker: CombatantState, target: CombatantState, amount: number, events: CombatEvent[], tick: number): void {
  target.health = Math.max(0, target.health - amount);
  events.push({ type: 'DAMAGE_APPLIED', tick, actorId: attacker.id, targetId: target.id, amount, remaining: target.health });
  if (target.health === 0 && !target.defeated) {
    target.defeated = true;
    // Action cleanup is deferred until both already-committed attacks resolve. That makes a
    // same-tick double knockout an explicit draw instead of an artifact of iteration order.
    events.push({ type: 'COMBATANT_DEFEATED', tick, actorId: attacker.id, targetId: target.id, remaining: 0 });
  }
}

function finalizeDefeat(actor: CombatantState): void {
  if (!actor.defeated) return;
  actor.currentAction = { type: 'idle', phase: 'idle' };
  actor.actionTick = 0;
  actor.invulnerable = false;
  actor.attackConnected = false;
  actor.actionDirection = { x: 0, z: 0 };
  actor.velocity = { x: 0, z: 0 };
  actor.inputBuffer = { attackTicks: 0, dodgeTicks: 0 };
}

function resolveAttack(attacker: CombatantState, target: CombatantState, events: CombatEvent[], tick: number): void {
  if (attacker.currentAction.type !== 'attack' || attacker.currentAction.phase !== 'active' || attacker.attackConnected) return;

  const towardTarget = vectorTo(attacker, target);
  const inRange = Math.hypot(towardTarget.x, towardTarget.z) <= COMBAT_TUNING.attack.range;
  const inArc = isInsideFacingArc(attacker.facing, towardTarget, COMBAT_TUNING.attack.arcDegrees);
  if (inRange && inArc && !target.defeated) {
    attacker.attackConnected = true;
    if (target.invulnerable) {
      events.push({ type: 'DODGE_EVADED', tick, actorId: target.id, targetId: attacker.id });
      return;
    }

    const incomingFromFront = isInsideFacingArc(target.facing, vectorTo(target, attacker), COMBAT_TUNING.block.facingArcDegrees);
    const blocking = target.currentAction.type === 'block'
      && target.currentAction.phase === 'active'
      && incomingFromFront;
    const lowStamina = attacker.stamina / attacker.maxStamina <= COMBAT_TUNING.lowStaminaThreshold;
    const baseDamage = COMBAT_TUNING.attack.damage
      * (lowStamina ? COMBAT_TUNING.attack.lowStaminaDamageMultiplier : 1);

    if (blocking && target.stamina >= COMBAT_TUNING.block.staminaPerHit) {
      spendStamina(target, COMBAT_TUNING.block.staminaPerHit, events, tick);
      const damage = baseDamage * (1 - COMBAT_TUNING.block.damageReduction);
      events.push({ type: 'ATTACK_BLOCKED', tick, actorId: attacker.id, targetId: target.id, amount: damage });
      applyDamage(attacker, target, damage, events, tick);
      return;
    }
    if (blocking) breakBlock(target, events, tick, attacker);
    events.push({ type: 'ATTACK_HIT', tick, actorId: attacker.id, targetId: target.id, amount: baseDamage });
    applyDamage(attacker, target, baseDamage, events, tick);
    return;
  }

  const finalActiveTick = COMBAT_TUNING.attack.startupTicks + COMBAT_TUNING.attack.activeTicks - 1;
  if (attacker.actionTick === finalActiveTick) {
    events.push({ type: 'ATTACK_MISSED', tick, actorId: attacker.id, targetId: target.id });
  }
}

function actionTotalTicks(type: ActionType): number {
  if (type === 'attack') return COMBAT_TUNING.attack.startupTicks + COMBAT_TUNING.attack.activeTicks + COMBAT_TUNING.attack.recoveryTicks;
  if (type === 'dodge') return COMBAT_TUNING.dodge.startupTicks + COMBAT_TUNING.dodge.activeTicks + COMBAT_TUNING.dodge.recoveryTicks;
  if (type === 'stagger') return COMBAT_TUNING.block.breakStaggerTicks;
  if (type === 'block') return COMBAT_TUNING.block.recoveryTicks;
  return 0;
}

function finishOrAdvanceAction(actor: CombatantState): void {
  if (actor.defeated || actor.currentAction.type === 'idle') return;
  actor.actionTick += 1;
  const type = actor.currentAction.type;
  const finished = type === 'block'
    ? actor.currentAction.phase === 'recovery' && actor.actionTick >= actionTotalTicks(type)
    : actor.actionTick >= actionTotalTicks(type);
  if (finished) {
    actor.currentAction = { type: 'idle', phase: 'idle' };
    actor.actionTick = 0;
    actor.attackConnected = false;
    actor.actionDirection = { x: 0, z: 0 };
    actor.invulnerable = false;
  } else if (type !== 'block') {
    actor.currentAction.phase = phaseFor(actor);
    const dodgeActiveTick = actor.actionTick - COMBAT_TUNING.dodge.startupTicks;
    actor.invulnerable = type === 'dodge'
      && actor.currentAction.phase === 'active'
      && dodgeActiveTick < COMBAT_TUNING.dodge.iframeTicks;
  }
}

/**
 * True while the action this actor performed on the current tick suppresses regeneration:
 * a held/active block, or any phase of a dodge. Attacks, stagger, and idle all regenerate.
 */
function pausesStaminaRegen(action: CurrentAction): boolean {
  if (action.type === 'block') return action.phase === 'startup' || action.phase === 'active';
  return action.type === 'dodge';
}

/**
 * Continuous regeneration. It is evaluated against the action the actor was performing during
 * this tick, so the first tick after a block release or a dodge ends already regenerates.
 * The only carried-over pause is `staminaRegenDelay`, set exclusively by a block break.
 */
function regenerateStamina(actor: CombatantState, actionThisTick: CurrentAction): void {
  if (actor.defeated) return;
  if (pausesStaminaRegen(actionThisTick)) return;
  if (actor.staminaRegenDelay > 0) {
    actor.staminaRegenDelay -= 1;
    return;
  }
  actor.stamina = Math.min(actor.maxStamina, actor.stamina + COMBAT_TUNING.stamina.regenPerTick);
}

function decrementBuffers(actor: CombatantState): void {
  actor.inputBuffer.attackTicks = Math.max(0, actor.inputBuffer.attackTicks - 1);
  actor.inputBuffer.dodgeTicks = Math.max(0, actor.inputBuffer.dodgeTicks - 1);
}

/**
 * Generic deterministic pair step. It accepts input for both combatants so mechanics can be
 * tested symmetrically; the arena-facing `stepCombat` wrapper always supplies neutral dummy input.
 */
export function stepCombatantPair(state: CombatState, inputs: CombatInputPair): CombatStepResult {
  if (state.fightOver) return { state: { ...state, player: cloneCombatant(state.player), dummy: cloneCombatant(state.dummy) }, events: [] };

  const next: CombatState = {
    ...state,
    bounds: { ...state.bounds },
    player: cloneCombatant(state.player),
    dummy: cloneCombatant(state.dummy),
    tick: state.tick + 1,
  };
  const events: CombatEvent[] = [];
  const pairs = [
    { actor: next.player, opponent: next.dummy, input: inputs.player },
    { actor: next.dummy, opponent: next.player, input: inputs.dummy },
  ];

  for (const { actor, input } of pairs) bufferInput(actor, input);
  for (const { actor, opponent } of pairs) if (actor.currentAction.type === 'idle') faceOpponent(actor, opponent);
  for (const { actor, opponent, input } of pairs) startBufferedAction(actor, opponent, input, events, next.tick);
  for (const { actor, input } of pairs) prepareAction(actor, input);
  for (const { actor, input } of pairs) moveCombatant(actor, input, next.bounds);

  // Stable ordering keeps the event log deterministic. Defeat cleanup is deferred, so an attack
  // already active at the start of this resolution can still produce a same-tick double knockout.
  resolveAttack(next.player, next.dummy, events, next.tick);
  resolveAttack(next.dummy, next.player, events, next.tick);

  next.fightOver = next.player.defeated || next.dummy.defeated;
  next.winner = next.player.defeated && next.dummy.defeated
    ? 'draw'
    : next.player.defeated
      ? 'dummy'
      : next.dummy.defeated
        ? 'player'
        : null;
  if (next.fightOver) {
    finalizeDefeat(next.player);
    finalizeDefeat(next.dummy);
  }
  for (const { actor } of pairs) {
    if (actor.currentAction.type === 'block' && actor.currentAction.phase === 'active' && actor.stamina <= 0) {
      actor.currentAction.phase = 'recovery';
      actor.actionTick = 0;
    }
    // Captured before the action advances so regen resumes on the first tick after it ends.
    const actionThisTick: CurrentAction = { ...actor.currentAction };
    finishOrAdvanceAction(actor);
    regenerateStamina(actor, actionThisTick);
    decrementBuffers(actor);
  }
  return { state: next, events };
}

/** Step the playable fight. The stationary training dummy receives no input and never acts. */
export function stepCombat(state: CombatState, input: CombatInput): CombatStepResult {
  return stepCombatantPair(state, { player: input, dummy: { ...NEUTRAL_COMBAT_INPUT } });
}
