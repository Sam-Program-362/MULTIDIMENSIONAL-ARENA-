import { describe, expect, it } from 'vitest';
import { createFighter, FighterInput, Injury } from '../src/sim/fighter';
import {
  CAREER_TUNING,
  CareerState,
  createOffers,
  defaultCareer,
  settleMatch,
  startMatch,
  applyPremiumTreatment,
} from '../src/sim/career';

const fighterInput: FighterInput = {
  name: 'Grudge Target',
  origin: 'Rust Belt',
  species: 'Human',
  background: 'Looking for payback.',
  primaryStyle: 'Muay Thai',
  secondaryStyles: [],
  powerSystem: 'Kinetic',
  weapons: [],
  equipment: [],
  specialAbilities: [],
};

const makeState = (credits = 100, points = 0): CareerState => {
  const f = createFighter(fighterInput, 30);
  f.progression.currency = credits;
  return {
    fighter: f,
    career: {
      ...defaultCareer(1),
      rankPoints: points,
    },
  };
};

describe('grudges and revenge bouts', () => {
  it('creates grudge when severity score reaches 3 on a loss', () => {
    let s = makeState(100);
    const offer = createOffers(3, s.fighter, s.career).find((o) => o.id === 'veteran-bout')!;
    s = startMatch(s, offer);

    const result = settleMatch(s, 'loss', 60, { playerHealthRatio: 0, opponentHealthRatio: 1 });
    const injuries = result.summary.newInjuries;
    const score = injuries.reduce((sum, i) => sum + (i.severity === 'severe' ? 3 : i.severity === 'moderate' ? 2 : 1), 0);

    if (score >= 3 || (offer.temperament === 'ruthless' && injuries.some((i) => i.severity !== 'minor'))) {
      expect(result.summary.grudgeCreated).toBe(true);
      expect(result.state.career.grudges).toHaveLength(1);
      const grudge = result.state.career.grudges[0];
      expect(grudge.opponentId).toBe(offer.opponentId);
      expect(grudge.name).toBe(offer.opponent);
      expect(grudge.status).toBe('active');
      expect(grudge.timesBeatenBy).toBe(1);
      expect(grudge.harm.length).toBeGreaterThan(0);
    }
  });

  it('ruthless opponent creates grudge on moderate injury even if score < 3', () => {
    let s = makeState(100);
    const ruthlessOffer = {
      id: 'veteran-bout',
      tier: 'veteran' as const,
      opponent: 'Sable Rook',
      opponentId: 'sable-rook',
      temperament: 'ruthless' as const,
      fee: 40,
      purse: 250,
      rankPointsOnWin: 2,
      matchSeed: 12345,
    };
    s = startMatch(s, ruthlessOffer);

    const result = settleMatch(s, 'loss', 60, { playerHealthRatio: 0, opponentHealthRatio: 1 });
    expect(result.state.career.grudges.length).toBeGreaterThanOrEqual(1);
    const grudge = result.state.career.grudges.find((g) => g.opponentId === 'sable-rook');
    expect(grudge).toBeDefined();
    expect(grudge?.status).toBe('active');
  });

  it('updates harm and timesBeatenBy on repeat defeat by grudge opponent', () => {
    let s = makeState(500);
    const ruthlessOffer = {
      id: 'veteran-bout',
      tier: 'veteran' as const,
      opponent: 'Sable Rook',
      opponentId: 'sable-rook',
      temperament: 'ruthless' as const,
      fee: 40,
      purse: 250,
      rankPointsOnWin: 2,
      matchSeed: 10,
    };

    s = startMatch(s, ruthlessOffer);
    s = settleMatch(s, 'loss', 60, { playerHealthRatio: 0, opponentHealthRatio: 1 }).state;
    expect(s.career.grudges).toHaveLength(1);
    expect(s.career.grudges[0].timesBeatenBy).toBe(1);

    // Clear severe injuries via clinic so fighter is eligible for the paid rematch
    for (const injury of [...s.fighter.condition.injuries]) {
      if (injury.severity === 'severe') {
        s = applyPremiumTreatment(s, injury.id);
        if (s.fighter.condition.injuries.some((i) => i.id === injury.id)) {
          s = applyPremiumTreatment(s, injury.id);
        }
      }
    }

    // Second defeat
    const secondOffer = { ...ruthlessOffer, matchSeed: 20 };
    s = startMatch(s, secondOffer);
    s = settleMatch(s, 'loss', 60, { playerHealthRatio: 0, opponentHealthRatio: 1 }).state;
    expect(s.career.grudges).toHaveLength(1);
    expect(s.career.grudges[0].timesBeatenBy).toBe(2);
  });

  it('caps active grudges at 3 and replaces the oldest active grudge', () => {
    let s = makeState(500);
    s.career.grudges = [
      { opponentId: 'opp-1', name: 'Opponent 1', temperament: 'brutal', tier: 'rookie', harm: ['cracked ribs (moderate)'], timesBeatenBy: 1, sinceDay: 1, status: 'active' },
      { opponentId: 'opp-2', name: 'Opponent 2', temperament: 'brutal', tier: 'rookie', harm: ['broken arm (severe)'], timesBeatenBy: 1, sinceDay: 2, status: 'active' },
      { opponentId: 'opp-3', name: 'Opponent 3', temperament: 'ruthless', tier: 'veteran', harm: ['concussion (moderate)'], timesBeatenBy: 1, sinceDay: 3, status: 'active' },
    ];
    s.career.day = 4;

    const newOffer = {
      id: 'veteran-bout',
      tier: 'veteran' as const,
      opponent: 'Brakka Gorr',
      opponentId: 'brakka-gorr',
      temperament: 'brutal' as const,
      fee: 40,
      purse: 250,
      rankPointsOnWin: 2,
      matchSeed: 99,
    };

    s = startMatch(s, newOffer);
    s = settleMatch(s, 'loss', 60, { playerHealthRatio: 0, opponentHealthRatio: 1 }).state;

    const active = s.career.grudges.filter((g) => g.status === 'active');
    expect(active).toHaveLength(3);
    // Oldest active (opp-1, sinceDay 1) was replaced
    expect(active.find((g) => g.opponentId === 'opp-1')).toBeUndefined();
    expect(active.find((g) => g.opponentId === 'brakka-gorr')).toBeDefined();
  });

  it('adds Revenge Bout card with 1.5x purse, +1 rank, +25 bounty when active grudge exists', () => {
    let s = makeState(100);
    s.career.grudges = [
      {
        opponentId: 'orrin-vale',
        name: 'Orrin Vale',
        temperament: 'brutal',
        tier: 'rookie',
        harm: ['broken arm (severe)'],
        timesBeatenBy: 1,
        sinceDay: 2,
        status: 'active',
      },
    ];

    const offers = createOffers(5, s.fighter, s.career);
    expect(offers).toHaveLength(4);

    const revenge = offers.find((o) => o.id === 'revenge-bout')!;
    expect(revenge).toBeDefined();
    expect(revenge.opponent).toBe('Orrin Vale');
    expect(revenge.opponentId).toBe('orrin-vale');
    expect(revenge.fee).toBe(CAREER_TUNING.offers.rookieFee);
    expect(revenge.purse).toBe(Math.round(CAREER_TUNING.offers.rookiePurse * 1.5)); // 150
    expect(revenge.rankPointsOnWin).toBe(CAREER_TUNING.offers.rookieWin + 1); // 2
    expect(revenge.revenge).toBe(true);
  });

  it('winning a Revenge Bout marks grudge settled and awards +25 bounty', () => {
    let s = makeState(100, 0);
    s.career.grudges = [
      {
        opponentId: 'orrin-vale',
        name: 'Orrin Vale',
        temperament: 'brutal',
        tier: 'rookie',
        harm: ['broken arm (severe)'],
        timesBeatenBy: 1,
        sinceDay: 2,
        status: 'active',
      },
    ];

    const offers = createOffers(5, s.fighter, s.career);
    const revenge = offers.find((o) => o.id === 'revenge-bout')!;
    s = startMatch(s, revenge);

    const result = settleMatch(s, 'win', 60, { playerHealthRatio: 1, opponentHealthRatio: 0 });
    expect(result.summary.grudgeSettled).toBe(true);
    expect(result.state.career.grudges[0].status).toBe('settled');
    const net = result.state.career.history[0].netCurrency;
    expect(net).toBeGreaterThanOrEqual(60);
    expect(net).toBeLessThanOrEqual(75);
    expect(result.summary.breakdown).toContain('Bounty: 25');
  });

  it('losing a Revenge Bout keeps grudge active and updates harm', () => {
    let s = makeState(100, 0);
    s.career.grudges = [
      {
        opponentId: 'sable-rook',
        name: 'Sable Rook',
        temperament: 'ruthless',
        tier: 'veteran',
        harm: ['concussion (moderate)'],
        timesBeatenBy: 1,
        sinceDay: 2,
        status: 'active',
      },
    ];

    const offers = createOffers(5, s.fighter, s.career);
    const revenge = offers.find((o) => o.id === 'revenge-bout')!;
    s = startMatch(s, revenge);

    const result = settleMatch(s, 'loss', 60, { playerHealthRatio: 0, opponentHealthRatio: 1 });
    expect(result.state.career.grudges[0].status).toBe('active');
    expect(result.state.career.grudges[0].timesBeatenBy).toBe(2);
  });
});
