import { describe, expect, it } from 'vitest';
import { aftermathLines, AftermathContext } from '../src/sim/career';
import { Injury } from '../src/sim/fighter';

describe('aftermath text generator', () => {
  it('is deterministic for identical context and seed', () => {
    const ctx: AftermathContext = {
      outcome: 'win',
      opponentName: 'Mara Venn',
      opponentTemperament: 'professional',
      matchSeed: 12345,
      fee: 20,
      payout: 50,
    };
    expect(aftermathLines(ctx)).toEqual(aftermathLines(ctx));
  });

  it('always returns 1 to 3 non-empty lines', () => {
    for (let seed = 0; seed < 100; seed++) {
      const outcomes: AftermathContext['outcome'][] = ['win', 'loss', 'draw', 'forfeit'];
      const temperaments: AftermathContext['opponentTemperament'][] = ['professional', 'brutal', 'ruthless'];

      for (const outcome of outcomes) {
        for (const temperament of temperaments) {
          const lines = aftermathLines({
            outcome,
            opponentName: 'Test Opponent',
            opponentTemperament: temperament,
            matchSeed: seed,
            fee: outcome === 'win' || outcome === 'loss' ? 20 : 0,
            payout: outcome === 'win' ? 50 : 0,
            grudgeCreated: outcome === 'loss' && seed % 2 === 0,
            grudgeSettled: outcome === 'win' && seed % 3 === 0,
          });

          expect(lines.length).toBeGreaterThanOrEqual(1);
          expect(lines.length).toBeLessThanOrEqual(3);
          expect(lines.every((l) => typeof l === 'string' && l.trim().length > 0)).toBe(true);
        }
      }
    }
  });

  it('reflects settled score line on revenge victory', () => {
    const lines = aftermathLines({
      outcome: 'win',
      opponentName: 'Sable Rook',
      opponentTemperament: 'ruthless',
      matchSeed: 99,
      fee: 40,
      payout: 120,
      grudgeSettled: true,
      isRevenge: true,
    });
    expect(lines[0]).toBe('You settled the score with Sable Rook.');
    expect(lines[1]).toContain('bounty');
  });

  it('mentions new injuries when sustained on win or loss', () => {
    const injury: Injury = {
      id: 'i',
      area: 'ribs',
      name: 'cracked ribs',
      severity: 'moderate',
      daysRemaining: 5,
      treated: false,
      day: 1,
    };
    const lines = aftermathLines({
      outcome: 'loss',
      opponentName: 'Orrin Vale',
      opponentTemperament: 'brutal',
      matchSeed: 77,
      fee: 20,
      payout: 0,
      newInjuries: [injury],
    });

    const combined = lines.join(' ');
    expect(combined).toContain('cracked ribs');
  });

  it('includes entry fee lost on defeat with fee', () => {
    const lines = aftermathLines({
      outcome: 'loss',
      opponentName: 'Kestrel-9',
      opponentTemperament: 'professional',
      matchSeed: 33,
      fee: 20,
      payout: 0,
    });
    expect(lines.some((l) => l.includes('Entry fee lost: 20'))).toBe(true);
  });
});
