import { nextRandom } from './rng';
import type { Vec2 } from './arena';
import {
  COMBAT_TUNING,
  NEUTRAL_COMBAT_INPUT,
  createCombatState,
  stepCombatantPair,
  type ActionPhase,
  type ActionType,
  type CombatInput,
  type CombatantId,
  type CombatantState,
  type CombatState,
  type CombatStepResult,
} from './combat';
import type { HiddenStats } from './fighter';

/**
 * A tunable behaviour profile for the basic AI. Every field is a plain number so a whole
 * personality can be reviewed and adjusted in one place. There are no AI-only combat powers:
 * the AI only ever produces the same `CombatInput` a human produces and is bound by the same
 * combat rules (stamina gating, action locks, ranges, arcs) enforced in `combat.ts`.
 */
export interface AiProfile {
  /** Perception lag in ticks. The AI reacts to the opponent's state from this many ticks ago. */
  reactionTicks: number;
  /** New positioning/offense choices are only made this often, never every tick. */
  decisionIntervalTicks: number;
  /** Probability of throwing an attack when in range, idle, and it is a decision tick. */
  aggression: number;
  /** Probability of defending (block/dodge) against a freshly observed attack. */
  caution: number;
  /** Base probability of the modelled mistakes (attack from range, overlong block, overcommit). */
  mistakeChance: number;
  /** Desired stand-off distance the AI tries to hold when it is not committing to an attack. */
  preferredRange: number;
}

/**
 * All non-profile AI numbers live here so the decision logic below contains no magic constants.
 * Distances are in arena units, durations in 60 Hz ticks, and probabilities in 0..1.
 */
export const AI_TUNING = {
  /** Observed attacks within `attack.range * defendRangeMultiplier` are treated as a threat. */
  defendRangeMultiplier: 1.2,
  /** Mistake (a): the AI may still swing when the target is at most this far past attack range. */
  attackRangeSlack: 0.4,
  /** Half-width of the neutral band around `preferredRange` where the AI circles instead of moving. */
  rangeBandHalfWidth: 0.35,
  /** Retreat when own stamina drops to at most this fraction of maximum. */
  retreatStaminaFraction: 0.3,
  /** When defending, chance of choosing a dodge over a block (subject to having the stamina). */
  dodgePreference: 0.4,
  /**
   * After perceiving an attack, the AI stays wary for this many ticks. Because perception is
   * itself delayed by `reactionTicks`, wariness (and any guard it produces) can never begin
   * sooner than `reactionTicks` after the attack truly started; the memory just lets a guard
   * persist long enough to matter against a follow-up swing.
   */
  aggressorMemoryTicks: 34,
  /** Ticks a normal defensive block is held. Long enough to catch a follow-up attack. */
  blockHoldTicks: 20,
  /** Mistake (b): an overlong guard. Held this many ticks instead. */
  blockHoldMistakeTicks: 40,
  /** Movement magnitudes (0..1) fed into the shared movement input. */
  approachMagnitude: 1,
  retreatMagnitude: 1,
  circleMagnitude: 0.55,
  /** How strongly circling corrects back toward `preferredRange`. */
  circleCorrection: 0.5,
  /** Tiny drift applied while mid-attack so the AI is not a statue during its swing. */
  actionDriftMagnitude: 0.35,
  /** Fallbacks for the very first ticks before a full history buffer exists. */
  minReactionTicks: 0,
} as const;

/** The one shipped preset: a beatable, non-frame-perfect sparring partner. */
export const ROOKIE_PROFILE: AiProfile = {
  reactionTicks: 12,
  decisionIntervalTicks: 8,
  aggression: 0.55,
  caution: 0.5,
  mistakeChance: 0.15,
  preferredRange: 1.9,
};

/** Compact, delayed view of the opponent. Stamina is coarsened to a low/ok flag on purpose. */
export interface OpponentSnapshot {
  position: Vec2;
  facing: Vec2;
  actionType: ActionType;
  actionPhase: ActionPhase;
  actionTick: number;
  staminaLow: boolean;
  defeated: boolean;
}

type AiIntentKind = 'approach' | 'circle' | 'retreat' | 'attack' | 'dodge' | 'block';

interface AiIntent {
  kind: AiIntentKind;
  /** Remaining ticks a held intent (currently only block) stays committed. */
  ticksRemaining: number;
  /** Which way the AI is currently circling: +1 or -1. */
  sidestepSign: 1 | -1;
}

/**
 * The entire mutable memory of one AI-controlled fighter. It is a plain, serialisable value:
 * the seeded RNG state lives here as a number, so `decide` is a pure function and a full fight
 * is reproducible from the seed plus the opponent's inputs.
 */
export interface AiState {
  profile: AiProfile;
  rngState: number;
  /** Ring of the most recent opponent snapshots, oldest first, newest last. */
  history: OpponentSnapshot[];
  ticksSinceDecision: number;
  intent: AiIntent;
  /** True once the current observed attack has already had its single caution roll. */
  reactedToThreat: boolean;
  /** Countdown of remaining "the opponent is dangerous" wariness ticks. */
  perceivedAggressorTicks: number;
}

/** What `decide` is allowed to see: its own combatant live, plus the opponent and the bounds. */
export interface AiObservation {
  self: CombatantState;
  opponent: CombatantState;
  bounds: CombatState['bounds'];
}

export interface AiDecision {
  input: CombatInput;
  nextAiState: AiState;
}

export type FightOutcome = 'player' | 'opponent' | 'draw' | null;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function normalize(vector: Vec2, fallback: Vec2 = { x: 0, z: 0 }): Vec2 {
  const length = Math.hypot(vector.x, vector.z);
  return length > 0 ? { x: vector.x / length, z: vector.z / length } : { ...fallback };
}

const distanceBetween = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

function snapshotOf(combatant: CombatantState): OpponentSnapshot {
  return {
    position: { ...combatant.position },
    facing: { ...combatant.facing },
    actionType: combatant.currentAction.type,
    actionPhase: combatant.currentAction.phase,
    actionTick: combatant.actionTick,
    staminaLow: combatant.stamina / combatant.maxStamina <= COMBAT_TUNING.lowStaminaThreshold,
    defeated: combatant.defeated,
  };
}

/** Create the starting memory for one AI fighter. The seed alone fixes every later roll. */
export function createAiState(seed: number, profile: AiProfile = ROOKIE_PROFILE): AiState {
  return {
    profile,
    rngState: (seed >>> 0) || 1,
    history: [],
    ticksSinceDecision: profile.decisionIntervalTicks,
    intent: { kind: 'approach', ticksRemaining: 0, sidestepSign: 1 },
    reactedToThreat: false,
    perceivedAggressorTicks: 0,
  };
}

/**
 * The delayed opponent view: the snapshot `reactionTicks` ago. Before the buffer is that deep,
 * the oldest available snapshot is used, so the AI simply perceives the opening position.
 */
function delayedSnapshot(history: OpponentSnapshot[], reactionTicks: number): OpponentSnapshot {
  const index = history.length - 1 - Math.max(AI_TUNING.minReactionTicks, reactionTicks);
  return history[Math.max(0, index)]!;
}

const neutralInput = (): CombatInput => ({ ...NEUTRAL_COMBAT_INPUT });

/**
 * Pure decision function. Given the AI's memory, a legal observation, and the current tick, it
 * returns the next combat input and the next memory. It reads the opponent only through the
 * delayed history buffer (never the opponent's current-tick input) and reads itself live.
 */
export function decide(aiState: AiState, observation: AiObservation, _tick: number): AiDecision {
  const profile = aiState.profile;
  const self = observation.self;

  // Record the opponent's current state, then perceive the delayed one.
  const history = [...aiState.history, snapshotOf(observation.opponent)];
  const maxLength = Math.max(AI_TUNING.minReactionTicks, profile.reactionTicks) + 1;
  while (history.length > maxLength) history.shift();
  const seen = delayedSnapshot(history, profile.reactionTicks);

  let rngState = aiState.rngState;
  const roll = (): number => {
    const drawn = nextRandom(rngState);
    rngState = drawn.state;
    return drawn.value;
  };

  let intent: AiIntent = { ...aiState.intent };
  let ticksSinceDecision = aiState.ticksSinceDecision + 1;
  let reactedToThreat = aiState.reactedToThreat;
  let perceivedAggressorTicks = Math.max(0, aiState.perceivedAggressorTicks - 1);

  const finish = (input: CombatInput): AiDecision => ({
    input,
    nextAiState: {
      ...aiState,
      rngState,
      history,
      intent,
      ticksSinceDecision,
      reactedToThreat,
      perceivedAggressorTicks,
    },
  });

  const startGuard = (input: CombatInput): CombatInput => {
    const canDodge = self.stamina >= COMBAT_TUNING.dodge.staminaCost;
    const canBlock = self.stamina >= COMBAT_TUNING.block.minimumStartStamina;
    if (canDodge && roll() < AI_TUNING.dodgePreference) {
      intent = { ...intent, kind: 'dodge' };
      const move = movementFor('retreat');
      return { ...input, x: move.x, z: move.z, dodgePressed: true };
    }
    if (canBlock) {
      const holdMistake = roll() < clamp01(profile.mistakeChance);
      intent = {
        ...intent,
        kind: 'block',
        ticksRemaining: holdMistake ? AI_TUNING.blockHoldMistakeTicks : AI_TUNING.blockHoldTicks,
      };
      return { ...input, blockHeld: true };
    }
    return input;
  };

  // A defeated AI, or one whose fight is already over, issues neutral input forever.
  if (self.defeated) return finish(neutralInput());

  const toOpponent = { x: seen.position.x - self.position.x, z: seen.position.z - self.position.z };
  const toward = normalize(toOpponent, { x: self.facing.x, z: self.facing.z });
  const away = { x: -toward.x, z: -toward.z };
  const dist = distanceBetween(self.position, seen.position);
  const attackRange = COMBAT_TUNING.attack.range;

  const movementFor = (kind: AiIntentKind): Vec2 => {
    if (kind === 'approach') {
      return { x: toward.x * AI_TUNING.approachMagnitude, z: toward.z * AI_TUNING.approachMagnitude };
    }
    if (kind === 'retreat') {
      return { x: away.x * AI_TUNING.retreatMagnitude, z: away.z * AI_TUNING.retreatMagnitude };
    }
    if (kind === 'circle') {
      const tangent = { x: -toward.z * intent.sidestepSign, z: toward.x * intent.sidestepSign };
      const drift = dist > profile.preferredRange ? toward : away;
      const raw = {
        x: tangent.x + drift.x * AI_TUNING.circleCorrection,
        z: tangent.z + drift.z * AI_TUNING.circleCorrection,
      };
      const unit = normalize(raw, tangent);
      return { x: unit.x * AI_TUNING.circleMagnitude, z: unit.z * AI_TUNING.circleMagnitude };
    }
    // Any committed action: gentle drift toward the opponent so the AI is not perfectly static.
    return { x: toward.x * AI_TUNING.actionDriftMagnitude, z: toward.z * AI_TUNING.actionDriftMagnitude };
  };

  // Track whether an attack is currently perceived, so caution is rolled once per threat.
  const observedAttack = !seen.defeated
    && seen.actionType === 'attack'
    && (seen.actionPhase === 'startup' || seen.actionPhase === 'active');
  if (!observedAttack) reactedToThreat = false;
  else perceivedAggressorTicks = AI_TUNING.aggressorMemoryTicks;
  const threatInRange = dist <= attackRange * AI_TUNING.defendRangeMultiplier;

  // While already committed to a held block, keep guarding until the timer runs out.
  if (self.currentAction.type === 'block' && intent.kind === 'block') {
    intent = { ...intent, ticksRemaining: intent.ticksRemaining - 1 };
    if (intent.ticksRemaining > 0) {
      const input = neutralInput();
      input.blockHeld = true;
      return finish(input);
    }
    intent = { ...intent, kind: 'circle' };
    return finish(neutralInput());
  }

  // While mid-attack / mid-dodge / staggered, the engine ignores new presses; just drift.
  if (self.currentAction.type !== 'idle') {
    const move = movementFor('attack');
    return finish({ ...neutralInput(), x: move.x, z: move.z });
  }

  // 1) Reactive defence. Only possible once the delayed buffer surfaces the attack, so it can
  //    never happen sooner than `reactionTicks` after the attack truly started.
  if (observedAttack && threatInRange && !reactedToThreat) {
    reactedToThreat = true;
    if (roll() < clamp01(profile.caution)) {
      const guard = startGuard(neutralInput());
      if (guard.blockHeld || guard.dodgePressed) return finish(guard);
    }
    // Caution failed or no stamina: fall through. If it swings now, that is an overcommit (c).
  }

  // 2) Low stamina: back off and neither attack nor dodge (rules would also forbid it).
  if (self.stamina / self.maxStamina <= AI_TUNING.retreatStaminaFraction) {
    intent = { ...intent, kind: 'retreat' };
    const move = movementFor('retreat');
    return finish({ ...neutralInput(), x: move.x, z: move.z });
  }

  // 3) Offense / positioning choices are made only on a decision boundary.
  if (ticksSinceDecision >= profile.decisionIntervalTicks) {
    ticksSinceDecision = 0;
    const canAffordAttack = self.stamina >= COMBAT_TUNING.attack.staminaCost;
    const inAttackRange = dist <= attackRange;
    const slightlyOut = dist <= attackRange + AI_TUNING.attackRangeSlack;

    // Proactive guard: while wary of a recently perceived aggressor and standing in range, the
    // AI sometimes raises a guard instead of attacking. This wariness starts no sooner than the
    // reaction delay (perception is delayed), so it never beats the reaction floor; it just lets
    // a guard persist across a follow-up swing, which a purely reactive block cannot.
    if (perceivedAggressorTicks > 0 && threatInRange && roll() < clamp01(profile.caution)) {
      const guard = startGuard(neutralInput());
      if (guard.blockHeld || guard.dodgePressed) return finish(guard);
    }

    if (canAffordAttack && inAttackRange && roll() < clamp01(profile.aggression)) {
      intent = { ...intent, kind: 'attack' };
      const move = movementFor('attack');
      return finish({ ...neutralInput(), x: move.x, z: move.z, attackPressed: true });
    }
    if (canAffordAttack && !inAttackRange && slightlyOut && roll() < clamp01(profile.mistakeChance)) {
      // Mistake (a): a hopeful swing from just outside range.
      intent = { ...intent, kind: 'attack' };
      return finish({ ...neutralInput(), attackPressed: true });
    }
    if (dist > profile.preferredRange + AI_TUNING.rangeBandHalfWidth) {
      intent = { ...intent, kind: 'approach' };
    } else {
      const sidestepSign: 1 | -1 = roll() < 0.5 ? 1 : -1;
      intent = { ...intent, kind: 'circle', sidestepSign };
    }
  }

  // 4) Between decisions, keep executing the current positioning intent.
  const kind: AiIntentKind = intent.kind === 'approach' || intent.kind === 'retreat' ? intent.kind : 'circle';
  const move = movementFor(kind);
  return finish({ ...neutralInput(), x: move.x, z: move.z });
}

const baselineHiddenStats = (): HiddenStats => {
  const value = COMBAT_TUNING.vitals.baselineStat;
  return { health: value, stamina: value, reaction: value, skill: value, willpower: value };
};

/**
 * Build a fresh fight where the second combatant is an active opponent rather than the passive
 * training dummy. The opponent keeps the `dummy` id and shape but is no longer stationary, so it
 * moves and acts through exactly the same combat step as the player.
 */
export function createAiFight(
  playerHiddenStats: HiddenStats = baselineHiddenStats(),
  seed = 1,
  profile: AiProfile = ROOKIE_PROFILE,
): { state: CombatState; aiState: AiState } {
  const state = createCombatState(playerHiddenStats);
  state.dummy.stationary = false;
  return { state, aiState: createAiState(seed, profile) };
}

/**
 * Step the fight with the AI controlling the `dummy` combatant. The AI observes the pre-step
 * state, and both fighters resolve through the shared `stepCombatantPair`, so the AI never gets
 * a private code path, free stamina, or free damage.
 */
export function stepCombatWithAi(
  state: CombatState,
  playerInput: CombatInput,
  aiState: AiState,
): { result: CombatStepResult; aiState: AiState } {
  const decision = decide(aiState, { self: state.dummy, opponent: state.player, bounds: state.bounds }, state.tick);
  const result = stepCombatantPair(state, { player: playerInput, dummy: decision.input });
  return { result, aiState: decision.nextAiState };
}

/** Report the fight result: which side won, a draw if both fell, or null while it continues. */
export function fightOutcome(state: CombatState): FightOutcome {
  const playerDown = state.player.defeated;
  const opponentDown = state.dummy.defeated;
  if (playerDown && opponentDown) return 'draw';
  if (opponentDown) return 'player';
  if (playerDown) return 'opponent';
  return null;
}

/** Convenience mapping for UI/tests that think in `CombatantId`s. */
export const winnerId = (outcome: FightOutcome): CombatantId | null =>
  outcome === 'player' ? 'player' : outcome === 'opponent' ? 'dummy' : null;
