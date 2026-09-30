import { describe, expect, it } from 'vitest';
import { createFighter, FighterInput } from '../src/sim/fighter';
import {
  createOffers,
  defaultCareer,
  startMatch,
  settleMatch,
  resolvePendingOnLoad,
  resolveFightResult,
  restDay,
  CAREER_TUNING,
  CareerState,
  OPPONENT_ROSTER,
  getOfferLabel,
  getOpponentById,
} from '../src/sim/career';

const input: FighterInput = {
  name: 'Test',
  origin: 'x',
  species: 'human',
  background: 'x',
  primaryStyle: 'x',
  secondaryStyles: [],
  powerSystem: 'x',
  weapons: [],
  equipment: [],
  specialAbilities: [],
};

const state = (credits = 100, points = 0): CareerState => {
  const f = createFighter(input, 7);
  f.progression.currency = credits;
  return {
    fighter: f,
    career: {
      ...defaultCareer(3),
      rankPoints: points,
    },
  };
};

describe('career offers and lifecycle', () => {
  it('returns exactly three deterministic offers and free Open Ring', () => {
    const s = state();
    expect(createOffers(4, s.fighter, s.career)).toEqual(createOffers(4, s.fighter, s.career));
    expect(createOffers(4, s.fighter, s.career)).toHaveLength(3);
    expect(createOffers(4, s.fighter, s.career)[0]).toMatchObject({
      id: 'open-ring',
      fee: 0,
      exhibition: true,
    });
  });

  it('deducts fees, stores pending, rejects unaffordable, allows free at zero', () => {
    const s = state(20);
    const o = createOffers(1, s.fighter, s.career)[1];
    expect(startMatch(s, o).fighter.progression.currency).toBe(0);
    expect(startMatch(s, o).career.pendingMatch).toEqual(expect.objectContaining(o));
    expect(() => startMatch(state(19), o)).toThrow();

    const free = createOffers(1, state(0).fighter, state(0).career)[0];
    expect(startMatch(state(0), free).fighter.progression.currency).toBe(0);
  });

  it('settles win deterministically with purse share and advances seed', () => {
    const s = startMatch(state(), createOffers(9, state().fighter, state().career)[1]);
    const a = settleMatch(s, 'win', 60);
    const b = settleMatch(s, 'win', 60);
    expect(a).toEqual(b);
    expect(a.state.career.pendingMatch).toBeNull();
    expect(a.state.career.offerSeed).toBe((s.career.offerSeed + 1) >>> 0);
    expect(a.state.career.history[0].payout).toBeGreaterThanOrEqual(40 + 10);
    expect(a.state.career.history[0].payout).toBeLessThanOrEqual(40 + 20 + 40 + 40);
  });

  it('settles loss, draw and exhibition rules', () => {
    const paid = createOffers(2, state().fighter, state().career)[1];
    const loss = settleMatch(startMatch(state(), paid), 'loss', 1).state;
    expect(loss.fighter.progression.currency).toBe(80);
    expect(loss.career.rankPoints).toBe(0);

    const draw = settleMatch(startMatch(state(), paid), 'draw', 1).state;
    expect(draw.fighter.progression.currency).toBe(100);

    const open = createOffers(2, state().fighter, state().career)[0];
    expect(settleMatch(startMatch(state(), open), 'loss', 1).state.career.losses).toBe(1);
    expect(settleMatch(startMatch(state(), open), 'loss', 1).state.career.rankPoints).toBe(0);
  });

  it('caps history and never demotes', () => {
    let s = state(1000, 5);
    for (let i = 0; i < 51; i++) {
      const o = createOffers(i, s.fighter, s.career)[1];
      s = startMatch(s, o);
      s = settleMatch(s, 'win', 1).state;
    }
    expect(s.career.history).toHaveLength(50);
    expect(s.fighter.progression.rank).toBe('Platinum');
  });

  it('promotes and does not demote', () => {
    let s = state(100, 4);
    let o = createOffers(1, s.fighter, s.career)[2];
    s = settleMatch(startMatch(s, o), 'win', 1).state;
    expect(s.fighter.progression.rank).toBe('Bronze');

    s = state(100, 4);
    o = createOffers(1, s.fighter, s.career)[2];
    s = settleMatch(startMatch(s, o), 'win', 1).state;
    expect(s.career.rankPoints).toBe(6);
    expect(s.fighter.progression.rank).toBe('Bronze');
  });

  it('maps fight outcomes and timeout', () => {
    expect(resolveFightResult(0, 0, 1)).toBe('draw');
    expect(resolveFightResult(1, 0, 1)).toBe('win');
    expect(resolveFightResult(0, 1, 1)).toBe('loss');
    expect(resolveFightResult(60, 40, 7200)).toBe('win');
    expect(resolveFightResult(40, 60, 7200)).toBe('loss');
    expect(resolveFightResult(50, 50, 7200)).toBe('draw');
    expect(resolveFightResult(50, 50, 7199)).toBeNull();
  });

  it('forfeits pending once on load', () => {
    const o = createOffers(2, state().fighter, state().career)[1];
    const s = startMatch(state(), o);
    const first = resolvePendingOnLoad(s);
    expect(first.state.career.pendingMatch).toBeNull();
    expect(first.state.career.losses).toBe(1);
    expect(resolvePendingOnLoad(first.state).summary).toBeNull();
  });

  it('keeps all win currency, payouts, and net changes whole and in range across 200 seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const base = state(1000);
      for (const offer of createOffers(seed, base.fighter, base.career)) {
        const result = settleMatch(startMatch(base, offer), 'win', 1);
        const h = result.state.career.history[0];
        expect(Number.isInteger(result.state.fighter.progression.currency)).toBe(true);
        expect(Number.isInteger(h.payout)).toBe(true);
        expect(Number.isInteger(h.netCurrency)).toBe(true);
        const range = offer.id === 'open-ring' ? [6, 12] : offer.id === 'rookie-bout' ? [30, 40] : [65, 90];
        expect(h.netCurrency).toBeGreaterThanOrEqual(range[0]);
        expect(h.netCurrency).toBeLessThanOrEqual(range[1]);
      }
    }
  });

  it('loss at Bronze threshold keeps Bronze while points drop', () => {
    let s = state(100, 5);
    s.fighter.progression.rank = 'Bronze';
    const offer = createOffers(1, s.fighter, s.career)[1];
    s = settleMatch(startMatch(s, offer), 'loss', 1).state;
    expect(s.career.rankPoints).toBe(4);
    expect(s.fighter.progression.rank).toBe('Bronze');
  });

  it('a multi-point win can skip ranks', () => {
    let s = state(100, 29);
    const offer = createOffers(1, s.fighter, s.career)[2];
    s = settleMatch(startMatch(s, offer), 'win', 1).state;
    expect(s.fighter.progression.rank).toBe('Gold');
  });

  it('history entries record offerId, label, and day, distinguishing Open Ring from Rookie bout', () => {
    let s = state(100);
    const openOffer = createOffers(1, s.fighter, s.career).find((o) => o.id === 'open-ring')!;
    s = startMatch(s, openOffer);
    s = settleMatch(s, 'win', 60).state;

    const rookieOffer = createOffers(2, s.fighter, s.career).find((o) => o.id === 'rookie-bout')!;
    s = startMatch(s, rookieOffer);
    s = settleMatch(s, 'win', 60).state;

    expect(s.career.history).toHaveLength(2);
    expect(s.career.history[0].offerId).toBe('open-ring');
    expect(s.career.history[0].label).toBe('Open Ring');
    expect(s.career.history[0].day).toBe(2);

    expect(s.career.history[1].offerId).toBe('rookie-bout');
    expect(s.career.history[1].label).toBe('Rookie bout');
    expect(s.career.history[1].day).toBe(3);
  });

  it('breakdown includes "Entry fee lost: N" on defeat or forfeit with fee', () => {
    const s = state(100);
    const offer = createOffers(1, s.fighter, s.career).find((o) => o.id === 'rookie-bout')!; // Fee 20
    const lossResult = settleMatch(startMatch(s, offer), 'loss', 60);
    expect(lossResult.summary.breakdown).toContain('Entry fee lost: 20');

    const forfeitResult = settleMatch(startMatch(s, offer), 'forfeit', 0);
    expect(forfeitResult.summary.breakdown).toContain('Entry fee lost: 20');
  });

  it('day counter starts at 1, advances on match settlement and restDay', () => {
    let s = state(100);
    expect(s.career.day).toBe(1);

    // Rest a day
    const initialOfferSeed = s.career.offerSeed;
    s = restDay(s);
    expect(s.career.day).toBe(2);
    expect(s.career.offerSeed).toBe((initialOfferSeed + 1) >>> 0);

    // Match settlement
    const offer = createOffers(s.career.offerSeed, s.fighter, s.career)[0];
    s = startMatch(s, offer);
    s = settleMatch(s, 'win', 60).state;
    expect(s.career.day).toBe(3);
  });

  it('fixed opponent roster has 8 entries with immutable temperaments', () => {
    expect(OPPONENT_ROSTER).toHaveLength(8);
    expect(getOpponentById('mara-venn')?.temperament).toBe('professional');
    expect(getOpponentById('kestrel-9')?.temperament).toBe('professional');
    expect(getOpponentById('toma-ash')?.temperament).toBe('professional');
    expect(getOpponentById('orrin-vale')?.temperament).toBe('brutal');
    expect(getOpponentById('sable-rook')?.temperament).toBe('ruthless');
    expect(getOpponentById('corin-vance')?.temperament).toBe('professional');
    expect(getOpponentById('lyra-sol')?.temperament).toBe('professional');
    expect(getOpponentById('brakka-gorr')?.temperament).toBe('brutal');

    // All offers carry opponentId and temperament
    const s = state();
    const offers = createOffers(10, s.fighter, s.career);
    for (const offer of offers) {
      expect(offer.opponentId).toBeDefined();
      expect(['professional', 'brutal', 'ruthless']).toContain(offer.temperament);
    }
  });

  it('labels correctly for all offer types with getOfferLabel', () => {
    expect(getOfferLabel('open-ring', 'rookie')).toBe('Open Ring');
    expect(getOfferLabel('rookie-bout', 'rookie')).toBe('Rookie bout');
    expect(getOfferLabel('veteran-bout', 'veteran')).toBe('Veteran bout');
    expect(getOfferLabel('revenge-bout', 'rookie')).toBe('Revenge bout');
  });
});
