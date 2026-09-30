import { createRng } from './rng';
import type { Fighter, Injury, InjuryArea, InjurySeverity } from './fighter';

export const CAREER_TUNING = {
  ranks: {
    Rookie: 0,
    Bronze: 5,
    Silver: 15,
    Gold: 30,
    Platinum: 50,
    Elite: 80,
    Champion: 120,
  } as const,
  matchTimeLimitTicks: 7200,
  tickRate: 60,
  offers: {
    openFee: 0,
    openPurse: 60,
    rookieFee: 20,
    rookiePurse: 100,
    veteranFee: 40,
    veteranPurse: 250,
    lossRank: 1,
    rookieWin: 1,
    veteranWin: 2,
    revengePurseMultiplier: 1.5,
    revengeExtraRankPoints: 1,
    revengeBounty: 25,
  },
  injuries: {
    baseDays: {
      minor: 2,
      moderate: 5,
      severe: 10,
    },
    healPerDay: {
      untreated: 0.5,
      treated: 1.0,
    },
    penalty: {
      minor: 0.04,
      moderate: 0.10,
      severe: 0.20,
    },
    maxPenaltyPerEffect: 0.40,
    minStatFloorRatio: 0.60,
    areaEffects: {
      head: 'maxHealth',
      ribs: 'maxStamina',
      arm: 'attackDamage',
      leg: 'moveSpeed',
    } as const,
    names: {
      head: {
        minor: 'dazed head',
        moderate: 'concussion',
        severe: 'fractured skull',
      },
      ribs: {
        minor: 'bruised ribs',
        moderate: 'cracked ribs',
        severe: 'broken ribs',
      },
      arm: {
        minor: 'sprained wrist',
        moderate: 'dislocated shoulder',
        severe: 'broken arm',
      },
      leg: {
        minor: 'strained calf',
        moderate: 'torn ligament',
        severe: 'broken leg',
      },
    } as const,
    clinic: {
      premiumPrices: {
        minor: 15,
        moderate: 40,
        severe: 90,
      },
    },
  },
} as const;

export type Outcome = 'win' | 'loss' | 'draw' | 'forfeit';
export type Tier = 'rookie' | 'veteran';
export type Rank = keyof typeof CAREER_TUNING.ranks;
export type OpponentTemperament = 'professional' | 'brutal' | 'ruthless';

export interface RosterOpponent {
  id: string;
  name: string;
  temperament: OpponentTemperament;
}

export const OPPONENT_ROSTER: readonly RosterOpponent[] = [
  { id: 'mara-venn', name: 'Mara Venn', temperament: 'professional' },
  { id: 'kestrel-9', name: 'Kestrel-9', temperament: 'professional' },
  { id: 'toma-ash', name: 'Toma Ash', temperament: 'professional' },
  { id: 'orrin-vale', name: 'Orrin Vale', temperament: 'brutal' },
  { id: 'sable-rook', name: 'Sable Rook', temperament: 'ruthless' },
  { id: 'corin-vance', name: 'Corin Vance', temperament: 'professional' },
  { id: 'lyra-sol', name: 'Lyra Sol', temperament: 'professional' },
  { id: 'brakka-gorr', name: 'Brakka Gorr', temperament: 'brutal' },
] as const;

export function getOpponentById(id: string): RosterOpponent | undefined {
  return OPPONENT_ROSTER.find((o) => o.id === id);
}

export function getOpponentByName(name: string): RosterOpponent | undefined {
  return OPPONENT_ROSTER.find((o) => o.name === name);
}

export interface Offer {
  id: string;
  tier: Tier;
  opponent: string;
  opponentId: string;
  temperament: OpponentTemperament;
  fee: number;
  purse: number;
  rankPointsOnWin: number;
  matchSeed: number;
  exhibition?: boolean;
  dangerous?: boolean;
  revenge?: boolean;
}

export interface PendingMatch extends Offer {
  acceptedAt: number;
}

export interface Grudge {
  opponentId: string;
  name: string;
  temperament: OpponentTemperament;
  tier: Tier;
  harm: string[];
  timesBeatenBy: number;
  sinceDay: number;
  status: 'active' | 'settled';
}

export interface HistoryEntry {
  offerId: string;
  label: string;
  day: number;
  opponent: string;
  opponentId?: string;
  tier: Tier;
  outcome: Outcome;
  fee: number;
  payout: number;
  netCurrency: number;
  rankPointsDelta: number;
  durationSeconds: number;
  promotedTo?: string;
  aftermath: string[];
  injuriesTaken?: string[];
  grudgeCreated?: boolean;
  grudgeSettled?: boolean;
}

export interface Career {
  day: number;
  rankPoints: number;
  wins: number;
  losses: number;
  draws: number;
  grudges: Grudge[];
  history: HistoryEntry[];
  offerSeed: number;
  pendingMatch: PendingMatch | null;
}

export interface CareerState {
  fighter: Fighter;
  career: Career;
}

export interface FightStats {
  playerHealthRatio: number;
  opponentHealthRatio: number;
}

export interface MatchSettlementSummary {
  outcome: Outcome;
  breakdown: string[];
  promotedTo?: string;
  aftermath: string[];
  newInjuries: Injury[];
  grudgeCreated?: boolean;
  grudgeSettled?: boolean;
  opponentName: string;
  [key: string]: unknown;
}

export interface MatchSettlementResult {
  state: CareerState;
  summary: MatchSettlementSummary;
}

export const defaultCareer = (seed = Date.now()): Career => ({
  day: 1,
  rankPoints: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  grudges: [],
  history: [],
  offerSeed: seed >>> 0,
  pendingMatch: null,
});

export function getOfferLabel(offerId: string, tier: Tier): string {
  if (offerId === 'open-ring') return 'Open Ring';
  if (offerId === 'rookie-bout') return 'Rookie bout';
  if (offerId === 'veteran-bout') return 'Veteran bout';
  if (offerId.startsWith('revenge') || offerId === 'revenge-bout') return 'Revenge bout';
  return tier === 'veteran' ? 'Veteran bout' : 'Rookie bout';
}

export function calculateInjuryModifiers(injuries: Injury[]): {
  maxHealth: number;
  maxStamina: number;
  moveSpeed: number;
  attackDamage: number;
} {
  const penalties = {
    head: 0,
    ribs: 0,
    arm: 0,
    leg: 0,
  };

  for (const injury of injuries) {
    const penaltyAmount = CAREER_TUNING.injuries.penalty[injury.severity] ?? 0;
    penalties[injury.area] += penaltyAmount;
  }

  const { maxPenaltyPerEffect, minStatFloorRatio } = CAREER_TUNING.injuries;

  const clampMultiplier = (totalPenalty: number) => {
    const cappedPenalty = Math.min(maxPenaltyPerEffect, totalPenalty);
    return Math.max(minStatFloorRatio, 1 - cappedPenalty);
  };

  return {
    maxHealth: clampMultiplier(penalties.head),
    maxStamina: clampMultiplier(penalties.ribs),
    attackDamage: clampMultiplier(penalties.arm),
    moveSpeed: clampMultiplier(penalties.leg),
  };
}

export function hasSevereInjury(injuries: Injury[]): boolean {
  return injuries.some((injury) => injury.severity === 'severe');
}

export function healInjuries(injuries: Injury[], days: number): Injury[] {
  const { healPerDay } = CAREER_TUNING.injuries;
  const result: Injury[] = [];

  for (const injury of injuries) {
    const rate = injury.treated ? healPerDay.treated : healPerDay.untreated;
    const remaining = injury.daysRemaining - rate * days;
    if (remaining > 0) {
      result.push({
        ...injury,
        daysRemaining: Math.round(remaining * 100) / 100,
      });
    }
  }

  return result;
}

export function restDay(state: CareerState): CareerState {
  const nextDay = (state.career.day ?? 1) + 1;
  const healedInjuries = healInjuries(state.fighter.condition.injuries, 1);

  return {
    fighter: {
      ...state.fighter,
      condition: {
        ...state.fighter.condition,
        injuries: healedInjuries,
      },
    },
    career: {
      ...state.career,
      day: nextDay,
      offerSeed: (state.career.offerSeed + 1) >>> 0,
    },
  };
}

export function applyBasicCare(state: CareerState, injuryId: string): CareerState {
  const index = state.fighter.condition.injuries.findIndex((i) => i.id === injuryId);
  if (index === -1) {
    throw new Error('Injury not found');
  }
  const injury = state.fighter.condition.injuries[index];
  if (injury.treated) {
    throw new Error('Injury already treated');
  }

  const injuries = [...state.fighter.condition.injuries];
  injuries[index] = {
    ...injury,
    treated: true,
  };

  return {
    ...state,
    fighter: {
      ...state.fighter,
      condition: {
        ...state.fighter.condition,
        injuries,
      },
    },
  };
}

export function applyPremiumTreatment(state: CareerState, injuryId: string): CareerState {
  const index = state.fighter.condition.injuries.findIndex((i) => i.id === injuryId);
  if (index === -1) {
    throw new Error('Injury not found');
  }
  const injury = state.fighter.condition.injuries[index];
  const price = CAREER_TUNING.injuries.clinic.premiumPrices[injury.severity];
  if (state.fighter.progression.currency < price) {
    throw new Error('Insufficient credits');
  }

  const injuries = [...state.fighter.condition.injuries];
  if (injury.severity === 'minor' || injury.severity === 'moderate') {
    injuries.splice(index, 1);
  } else if (injury.severity === 'severe') {
    const moderateBaseDays = CAREER_TUNING.injuries.baseDays.moderate;
    injuries[index] = {
      ...injury,
      severity: 'moderate',
      name: CAREER_TUNING.injuries.names[injury.area].moderate,
      daysRemaining: moderateBaseDays / 2,
      treated: true,
    };
  }

  return {
    ...state,
    fighter: {
      ...state.fighter,
      progression: {
        ...state.fighter.progression,
        currency: state.fighter.progression.currency - price,
      },
      condition: {
        ...state.fighter.condition,
        injuries,
      },
    },
  };
}

const INJURY_AREAS: InjuryArea[] = ['head', 'ribs', 'arm', 'leg'];

export function generateMatchInjuries(
  pending: PendingMatch,
  outcome: Outcome,
  fightStats: FightStats,
  currentDay: number,
): Injury[] {
  const rng = createRng((pending.matchSeed ^ 0x5a1f8c3d) >>> 0);
  const injuries: Injury[] = [];
  const opponentId = pending.opponentId || getOpponentByName(pending.opponent)?.id || 'unknown';
  const temperament = pending.temperament || getOpponentByName(pending.opponent)?.temperament || 'professional';

  const pickArea = (): InjuryArea => INJURY_AREAS[Math.floor(rng() * INJURY_AREAS.length)];

  if (pending.exhibition) {
    // Exhibition (Open Ring): at most ONE minor injury, only on a loss/forfeit, with 25 percent chance.
    if (outcome === 'loss' || outcome === 'forfeit') {
      if (rng() < 0.25) {
        const area = pickArea();
        injuries.push({
          id: `injury-${currentDay}-${pending.matchSeed}-0`,
          area,
          name: CAREER_TUNING.injuries.names[area].minor,
          severity: 'minor',
          daysRemaining: CAREER_TUNING.injuries.baseDays.minor,
          treated: false,
          sourceOpponentId: opponentId,
          day: currentDay,
        });
      }
    }
    return injuries;
  }

  if (outcome === 'win') {
    // Win: chance of ONE injury = 10 percent + 50 percent * (1 - playerHealthRatio); severity minor (moderate if playerHealthRatio < 0.25 with 25 percent chance).
    const clampedHealth = Math.max(0, Math.min(1, fightStats.playerHealthRatio));
    const chance = 0.10 + 0.50 * (1 - clampedHealth);
    if (rng() < chance) {
      const area = pickArea();
      let severity: InjurySeverity = 'minor';
      if (clampedHealth < 0.25 && rng() < 0.25) {
        severity = 'moderate';
      }
      injuries.push({
        id: `injury-${currentDay}-${pending.matchSeed}-0`,
        area,
        name: CAREER_TUNING.injuries.names[area][severity],
        severity,
        daysRemaining: CAREER_TUNING.injuries.baseDays[severity],
        treated: false,
        sourceOpponentId: opponentId,
        day: currentDay,
      });
    }
  } else if (outcome === 'draw') {
    // Draw: 30 percent chance of one minor injury.
    if (rng() < 0.30) {
      const area = pickArea();
      injuries.push({
        id: `injury-${currentDay}-${pending.matchSeed}-0`,
        area,
        name: CAREER_TUNING.injuries.names[area].minor,
        severity: 'minor',
        daysRemaining: CAREER_TUNING.injuries.baseDays.minor,
        treated: false,
        sourceOpponentId: opponentId,
        day: currentDay,
      });
    }
  } else if (outcome === 'loss' || outcome === 'forfeit') {
    // Loss AND forfeit: count and severity by opponent's temperament.
    let count = 1;
    let getSeverity: () => InjurySeverity;

    if (temperament === 'professional') {
      // 1 injury (70 percent) or 2 (30 percent); severity weights minor 70 / moderate 27 / severe 3.
      count = rng() < 0.70 ? 1 : 2;
      getSeverity = () => {
        const roll = rng();
        if (roll < 0.70) return 'minor';
        if (roll < 0.97) return 'moderate';
        return 'severe';
      };
    } else if (temperament === 'brutal') {
      // 1-3 injuries; severity minor 35 / moderate 45 / severe 20.
      count = 1 + Math.floor(rng() * 3);
      getSeverity = () => {
        const roll = rng();
        if (roll < 0.35) return 'minor';
        if (roll < 0.80) return 'moderate';
        return 'severe';
      };
    } else {
      // ruthless: 2-4 injuries; severity minor 15 / moderate 40 / severe 45.
      count = 2 + Math.floor(rng() * 3);
      getSeverity = () => {
        const roll = rng();
        if (roll < 0.15) return 'minor';
        if (roll < 0.55) return 'moderate';
        return 'severe';
      };
    }

    for (let i = 0; i < count; i++) {
      const area = pickArea();
      const severity = getSeverity();
      injuries.push({
        id: `injury-${currentDay}-${pending.matchSeed}-${i}`,
        area,
        name: CAREER_TUNING.injuries.names[area][severity],
        severity,
        daysRemaining: CAREER_TUNING.injuries.baseDays[severity],
        treated: false,
        sourceOpponentId: opponentId,
        day: currentDay,
      });
    }
  }

  return injuries;
}

export interface AftermathContext {
  outcome: Outcome;
  opponentName: string;
  opponentTemperament: OpponentTemperament;
  matchSeed: number;
  newInjuries?: Injury[];
  fee: number;
  payout: number;
  grudgeCreated?: boolean;
  grudgeSettled?: boolean;
  exhibition?: boolean;
  isRevenge?: boolean;
}

export function aftermathLines(context: AftermathContext): string[] {
  const rng = createRng((context.matchSeed ^ 0x8f2d4e61) >>> 0);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const lines: string[] = [];
  const {
    outcome,
    opponentName,
    opponentTemperament,
    newInjuries,
    fee,
    payout,
    grudgeSettled,
    grudgeCreated,
    isRevenge,
  } = context;

  if (outcome === 'win') {
    if (grudgeSettled) {
      lines.push(`You settled the score with ${opponentName}.`);
    } else if (opponentTemperament === 'professional') {
      lines.push(pick([
        `${opponentName} offers a curt nod of respect.`,
        `A hard-fought victory against ${opponentName}.`,
        `${opponentName} steps back and accepts the decision.`,
      ]));
    } else if (opponentTemperament === 'brutal') {
      lines.push(pick([
        `You weathered the storm and brought down ${opponentName}.`,
        `${opponentName} crashes to the floor, breathing heavily.`,
        `You silenced ${opponentName}'s relentless assault.`,
      ]));
    } else {
      lines.push(pick([
        `${opponentName} glares in disbelief as you take the victory.`,
        `You outfought ${opponentName} in a punishing battle.`,
        `The crowd roars as ${opponentName} finally falls.`,
      ]));
    }

    if (isRevenge) {
      lines.push(`You claim the purse and a 25 credit bounty.`);
    } else {
      lines.push(`You collect ${payout} credits from the purse.`);
    }

    if (newInjuries && newInjuries.length > 0) {
      lines.push(`You leave the ring with ${newInjuries.map((i) => i.name).join(' and ')}.`);
    }
  } else if (outcome === 'draw') {
    lines.push(pick([
      `Neither fighter could find the decisive blow.`,
      `A grueling stalemate against ${opponentName}.`,
      `The bell rings with both fighters still standing.`,
    ]));
    if (fee > 0) {
      lines.push(`Entry fee of ${fee} credits is returned.`);
    }
    if (newInjuries && newInjuries.length > 0) {
      lines.push(`You sustained ${newInjuries.map((i) => i.name).join(' and ')}.`);
    }
  } else {
    // loss or forfeit
    if (outcome === 'forfeit') {
      lines.push(pick([
        `${opponentName} takes your forfeited fee with a scornful look.`,
        `You walked away. ${opponentName} claims the forfeit without breaking a sweat.`,
      ]));
    } else if (opponentTemperament === 'professional') {
      lines.push(pick([
        `${opponentName} steps back cleanly as the bout ends.`,
        `${opponentName} takes the victory with clinical precision.`,
        `${opponentName} collects the purse without fanfare.`,
      ]));
    } else if (opponentTemperament === 'brutal') {
      lines.push(pick([
        `${opponentName} leaves you on the floor${newInjuries && newInjuries.length > 0 ? ` with ${newInjuries[0].name}` : ''}.`,
        `${opponentName} hammers you into submission.`,
        `${opponentName} laughs as you struggle back to your feet.`,
      ]));
    } else {
      lines.push(pick([
        `${opponentName} takes your fee and does not look back.`,
        `${opponentName} showed no mercy in the ring.`,
        `${opponentName} walks away, indifferent to the damage left behind.`,
      ]));
    }

    if (grudgeCreated) {
      lines.push(`${opponentName} is now on your list.`);
    } else if (newInjuries && newInjuries.length > 0) {
      lines.push(`You sustained ${newInjuries.map((i) => `${i.name} (${i.severity})`).join(' and ')}.`);
    }

    if (fee > 0) {
      lines.push(`Entry fee lost: ${fee} credits.`);
    }
  }

  return lines.slice(0, 3);
}

export function createOffers(seed: number, _fighter: Fighter, career: Career): Offer[] {
  const rng = createRng(seed);
  const roster = OPPONENT_ROSTER;
  const pick = () => roster[Math.floor(rng() * roster.length)];

  const openOpponent = pick();
  const rookieOpponent = pick();
  const veteranOpponent = pick();

  const offers: Offer[] = [
    {
      id: 'open-ring',
      tier: 'rookie',
      opponent: openOpponent.name,
      opponentId: openOpponent.id,
      temperament: openOpponent.temperament,
      fee: CAREER_TUNING.offers.openFee,
      purse: CAREER_TUNING.offers.openPurse,
      rankPointsOnWin: 0,
      matchSeed: (rng() * 0xffffffff) >>> 0,
      exhibition: true,
    },
    {
      id: 'rookie-bout',
      tier: 'rookie',
      opponent: rookieOpponent.name,
      opponentId: rookieOpponent.id,
      temperament: rookieOpponent.temperament,
      fee: CAREER_TUNING.offers.rookieFee,
      purse: CAREER_TUNING.offers.rookiePurse,
      rankPointsOnWin: CAREER_TUNING.offers.rookieWin,
      matchSeed: (rng() * 0xffffffff) >>> 0,
    },
    {
      id: 'veteran-bout',
      tier: 'veteran',
      opponent: veteranOpponent.name,
      opponentId: veteranOpponent.id,
      temperament: veteranOpponent.temperament,
      fee: CAREER_TUNING.offers.veteranFee,
      purse: CAREER_TUNING.offers.veteranPurse,
      rankPointsOnWin: CAREER_TUNING.offers.veteranWin,
      matchSeed: (rng() * 0xffffffff) >>> 0,
      dangerous: true,
    },
  ];

  // If there is an active grudge, add a fourth card "Revenge bout"
  const activeGrudges = career?.grudges ? career.grudges.filter((g) => g.status === 'active') : [];
  if (activeGrudges.length > 0) {
    const targetGrudge = activeGrudges.slice().sort((a, b) => b.sinceDay - a.sinceDay)[0];
    const baseFee = targetGrudge.tier === 'veteran' ? CAREER_TUNING.offers.veteranFee : CAREER_TUNING.offers.rookieFee;
    const basePurse = targetGrudge.tier === 'veteran' ? CAREER_TUNING.offers.veteranPurse : CAREER_TUNING.offers.rookiePurse;
    const baseRank = targetGrudge.tier === 'veteran' ? CAREER_TUNING.offers.veteranWin : CAREER_TUNING.offers.rookieWin;

    offers.push({
      id: 'revenge-bout',
      tier: targetGrudge.tier,
      opponent: targetGrudge.name,
      opponentId: targetGrudge.opponentId,
      temperament: targetGrudge.temperament,
      fee: baseFee,
      purse: Math.round(basePurse * CAREER_TUNING.offers.revengePurseMultiplier),
      rankPointsOnWin: baseRank + CAREER_TUNING.offers.revengeExtraRankPoints,
      matchSeed: (rng() * 0xffffffff) >>> 0,
      revenge: true,
      dangerous: targetGrudge.tier === 'veteran',
    });
  }

  return offers;
}

export function startMatch(state: CareerState, offer: Offer): CareerState {
  if (state.fighter.progression.currency < offer.fee) {
    throw new Error('Insufficient credits');
  }
  if (offer.fee > 0 && hasSevereInjury(state.fighter.condition.injuries)) {
    throw new Error('Severe injury - visit the clinic or rest');
  }

  return {
    fighter: {
      ...state.fighter,
      progression: {
        ...state.fighter.progression,
        currency: state.fighter.progression.currency - offer.fee,
      },
    },
    career: {
      ...state.career,
      pendingMatch: {
        ...offer,
        acceptedAt: 0,
      },
    },
  };
}

function rankAt(points: number): Rank {
  const ranks = Object.keys(CAREER_TUNING.ranks).reverse() as Rank[];
  return ranks.find((k) => points >= CAREER_TUNING.ranks[k]) || 'Rookie';
}

function calculatePayoutAndRankDelta(
  pending: PendingMatch,
  outcome: Outcome,
  currentRankPoints: number,
  isRevenge: boolean,
): { payout: number; delta: number } {
  let payout = 0;
  let delta = 0;

  if (outcome === 'win') {
    const share = 0.10 + createRng(pending.matchSeed)() * 0.10;
    payout = pending.fee + pending.fee + Math.round(pending.purse * share);
    if (isRevenge) {
      payout += CAREER_TUNING.offers.revengeBounty;
    }
    delta = pending.rankPointsOnWin;
  } else if (outcome === 'draw') {
    payout = pending.fee;
  } else if (!pending.exhibition) {
    delta = -Math.min(1, currentRankPoints);
  }

  return { payout, delta };
}

function calculateNewRank(oldRank: Rank, points: number): { finalRank: Rank; promotedTo?: string } {
  const candidateRank = rankAt(points);
  const rankOrder = Object.keys(CAREER_TUNING.ranks) as Rank[];
  const currentIndex = rankOrder.indexOf(oldRank);
  const candidateIndex = rankOrder.indexOf(candidateRank);
  const finalRank = rankOrder[Math.max(currentIndex, candidateIndex)];
  const promotedTo = finalRank !== oldRank && rankOrder.indexOf(finalRank) > currentIndex ? finalRank : undefined;
  return { finalRank, promotedTo };
}

function buildSettlementBreakdown(
  pending: PendingMatch,
  outcome: Outcome,
  payout: number,
  isRevenge: boolean,
): string[] {
  const lines: string[] = [];
  if (outcome === 'win') {
    lines.push(`Fee returned: ${pending.fee}`);
    lines.push(`Opponent fee: ${pending.fee}`);
    const purePurseShare = Math.round(payout - 2 * pending.fee - (isRevenge ? CAREER_TUNING.offers.revengeBounty : 0));
    lines.push(`Purse share: ${purePurseShare}`);
    if (isRevenge) {
      lines.push(`Bounty: ${CAREER_TUNING.offers.revengeBounty}`);
    }
    lines.push(`Net change: ${payout - pending.fee}`);
  } else if (outcome === 'draw') {
    lines.push(`Fee returned: ${pending.fee}`);
    lines.push(`Net change: 0`);
  } else {
    if (pending.fee > 0) {
      lines.push(`Entry fee lost: ${pending.fee}`);
    }
    lines.push(`Net change: -${pending.fee}`);
  }
  return lines;
}

export function settleMatch(
  state: CareerState,
  outcome: Outcome,
  durationTicks: number,
  fightStats?: FightStats,
): MatchSettlementResult {
  const pending = state.career.pendingMatch;
  if (!pending) {
    throw new Error('No pending match');
  }

  const isRevenge = Boolean(pending.revenge || pending.id === 'revenge-bout');
  const opponentId = pending.opponentId || getOpponentByName(pending.opponent)?.id || 'unknown';
  const opponentTemperament = pending.temperament || getOpponentByName(pending.opponent)?.temperament || 'professional';

  // 1. Advance day and heal existing injuries first
  const healedInjuries = healInjuries(state.fighter.condition?.injuries ?? [], 1);
  const nextDay = (state.career.day ?? 1) + 1;

  // 2. Generate new injuries from match
  const stats: FightStats = fightStats ?? {
    playerHealthRatio: outcome === 'win' ? 1 : 0,
    opponentHealthRatio: outcome === 'win' ? 0 : 1,
  };
  const newInjuries = generateMatchInjuries(pending, outcome, stats, nextDay);
  const finalInjuries = [...healedInjuries, ...newInjuries];

  // 3. Payout and rank delta
  const { payout, delta } = calculatePayoutAndRankDelta(pending, outcome, state.career.rankPoints, isRevenge);
  const points = Math.max(0, state.career.rankPoints + delta);
  const oldRank = state.fighter.progression.rank as Rank;
  const { finalRank, promotedTo } = calculateNewRank(oldRank, points);

  // 4. Grudge updates
  let grudgeCreated = false;
  let grudgeSettled = false;
  let updatedGrudges = [...(state.career.grudges ?? [])];

  if (isRevenge && outcome === 'win') {
    grudgeSettled = true;
    updatedGrudges = updatedGrudges.map((g) => {
      if (g.opponentId === opponentId || g.name === pending.opponent) {
        return { ...g, status: 'settled' as const };
      }
      return g;
    });
  } else if (outcome === 'loss' || outcome === 'forfeit') {
    const severityScore = newInjuries.reduce(
      (sum, i) => sum + (i.severity === 'severe' ? 3 : i.severity === 'moderate' ? 2 : 1),
      0,
    );
    const hasModerateOrWorse = newInjuries.some((i) => i.severity === 'moderate' || i.severity === 'severe');
    const shouldGrudge = severityScore >= 3 || (opponentTemperament === 'ruthless' && hasModerateOrWorse);

    if (shouldGrudge) {
      grudgeCreated = true;
      const harmItems = newInjuries.map((i) => `${i.name} (${i.severity})`);
      const existingIdx = updatedGrudges.findIndex((g) => g.opponentId === opponentId || g.name === pending.opponent);

      if (existingIdx !== -1) {
        const existing = updatedGrudges[existingIdx];
        updatedGrudges[existingIdx] = {
          ...existing,
          harm: Array.from(new Set([...existing.harm, ...harmItems])),
          timesBeatenBy: existing.timesBeatenBy + 1,
          tier: pending.tier,
          status: 'active',
        };
      } else {
        const newGrudge: Grudge = {
          opponentId,
          name: pending.opponent,
          temperament: opponentTemperament,
          tier: pending.tier,
          harm: harmItems,
          timesBeatenBy: 1,
          sinceDay: nextDay,
          status: 'active',
        };
        const activeGrudges = updatedGrudges.filter((g) => g.status === 'active');
        if (activeGrudges.length >= 3) {
          const oldestActive = activeGrudges.sort((a, b) => a.sinceDay - b.sinceDay)[0];
          updatedGrudges = updatedGrudges.filter((g) => g !== oldestActive);
        }
        updatedGrudges.push(newGrudge);
      }
    }
  }

  // 5. Aftermath lines
  const aftermath = aftermathLines({
    outcome,
    opponentName: pending.opponent,
    opponentTemperament,
    matchSeed: pending.matchSeed,
    newInjuries,
    fee: pending.fee,
    payout,
    grudgeCreated,
    grudgeSettled,
    exhibition: pending.exhibition,
    isRevenge,
  });

  // 6. Breakdown
  const breakdown = buildSettlementBreakdown(pending, outcome, payout, isRevenge);

  // 7. History entry
  const label = getOfferLabel(pending.id, pending.tier);
  const historyEntry: HistoryEntry = {
    offerId: pending.id,
    label,
    day: nextDay,
    opponent: pending.opponent,
    opponentId,
    tier: pending.tier,
    outcome,
    fee: pending.fee,
    payout,
    netCurrency: payout - pending.fee,
    rankPointsDelta: delta,
    durationSeconds: durationTicks / CAREER_TUNING.tickRate,
    ...(promotedTo ? { promotedTo } : {}),
    aftermath,
    injuriesTaken: newInjuries.map((i) => `${i.name} (${i.severity})`),
    ...(grudgeCreated ? { grudgeCreated: true } : {}),
    ...(grudgeSettled ? { grudgeSettled: true } : {}),
  };

  const history = [...(state.career.history ?? []), historyEntry].slice(-50);

  const fighter: Fighter = {
    ...state.fighter,
    progression: {
      ...state.fighter.progression,
      currency: state.fighter.progression.currency + payout,
      rank: finalRank,
    },
    condition: {
      ...state.fighter.condition,
      injuries: finalInjuries,
    },
  };

  const career: Career = {
    ...state.career,
    day: nextDay,
    rankPoints: points,
    wins: state.career.wins + (outcome === 'win' ? 1 : 0),
    losses: state.career.losses + (['loss', 'forfeit'].includes(outcome) ? 1 : 0),
    draws: state.career.draws + (outcome === 'draw' ? 1 : 0),
    grudges: updatedGrudges,
    history,
    offerSeed: (state.career.offerSeed + 1) >>> 0,
    pendingMatch: null,
  };

  return {
    state: { fighter, career },
    summary: {
      outcome,
      breakdown,
      ...(promotedTo ? { promotedTo } : {}),
      aftermath,
      newInjuries,
      grudgeCreated,
      grudgeSettled,
      opponentName: pending.opponent,
    },
  };
}

export function resolvePendingOnLoad(state: CareerState): { state: CareerState; summary: MatchSettlementSummary | null } {
  return state.career.pendingMatch ? settleMatch(state, 'forfeit', 0) : { state, summary: null };
}

export function resolveFightResult(
  playerHealth: number,
  opponentHealth: number,
  ticks: number,
  limit = CAREER_TUNING.matchTimeLimitTicks,
): Outcome | null {
  if (playerHealth <= 0 && opponentHealth <= 0) return 'draw';
  if (opponentHealth <= 0) return 'win';
  if (playerHealth <= 0) return 'loss';
  if (ticks >= limit) {
    const a = playerHealth;
    const b = opponentHealth;
    return a === b ? 'draw' : a > b ? 'win' : 'loss';
  }
  return null;
}
