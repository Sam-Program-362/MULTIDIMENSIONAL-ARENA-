import { describe, expect, it } from 'vitest';
import { createFighter, FighterInput, Injury } from '../src/sim/fighter';
import {
  calculateInjuryModifiers,
  createOffers,
  defaultCareer,
  generateMatchInjuries,
  healInjuries,
  resolveFightResult,
  resolvePendingOnLoad,
  settleMatch,
  startMatch,
  applyPremiumTreatment,
  CareerState,
} from '../src/sim/career';
import { FighterStorage, SAVE_KEY_V2 } from '../src/storage';

const input: FighterInput = {
  name: 'Edge Tester',
  origin: 'Rim',
  species: 'Human',
  background: 'Edge case tester.',
  primaryStyle: 'Boxing',
  secondaryStyles: [],
  powerSystem: 'Kinetic',
  weapons: [],
  equipment: [],
  specialAbilities: [],
};

const makeState = (credits = 100, day = 1, injuries: Injury[] = []): CareerState => {
  const f = createFighter(input, 55);
  f.progression.currency = credits;
  f.condition.injuries = [...injuries];
  return {
    fighter: f,
    career: {
      ...defaultCareer(77),
      day,
    },
  };
};

function memStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('career edge cases', () => {
  it('stacks penalties for two injuries in the same area without exceeding cap', () => {
    const inj1: Injury = { id: 'r1', area: 'ribs', name: 'bruised ribs', severity: 'minor', daysRemaining: 2, treated: false, day: 1 };
    const inj2: Injury = { id: 'r2', area: 'ribs', name: 'cracked ribs', severity: 'moderate', daysRemaining: 5, treated: false, day: 1 };

    // Minor (0.04) + Moderate (0.10) = 0.14 penalty -> maxStamina = 0.86
    const mods = calculateInjuryModifiers([inj1, inj2]);
    expect(mods.maxStamina).toBeCloseTo(0.86);

    const inj3: Injury = { id: 'r3', area: 'ribs', name: 'broken ribs', severity: 'severe', daysRemaining: 10, treated: false, day: 1 };
    // 0.14 + 0.20 = 0.34 penalty -> maxStamina = 0.66
    const mods2 = calculateInjuryModifiers([inj1, inj2, inj3]);
    expect(mods2.maxStamina).toBeCloseTo(0.66);

    const inj4: Injury = { id: 'r4', area: 'ribs', name: 'broken ribs', severity: 'severe', daysRemaining: 10, treated: false, day: 1 };
    // 0.34 + 0.20 = 0.54 -> capped at 0.40 penalty -> maxStamina = 0.60
    const mods3 = calculateInjuryModifiers([inj1, inj2, inj3, inj4]);
    expect(mods3.maxStamina).toBe(0.60);
  });

  it('heals exactly to 0 and removes the injury', () => {
    const inj: Injury = { id: 't', area: 'leg', name: 'strained calf', severity: 'minor', daysRemaining: 1.0, treated: true, day: 1 };
    const after = healInjuries([inj], 1); // 1.0 - 1.0 = 0 -> removed
    expect(after).toHaveLength(0);
  });

  it('allows premium treatment on fractional/last-day injuries', () => {
    const inj: Injury = { id: 'last', area: 'arm', name: 'sprained wrist', severity: 'minor', daysRemaining: 0.1, treated: false, day: 5 };
    const s = makeState(100, 5, [inj]);
    const treated = applyPremiumTreatment(s, 'last');
    expect(treated.fighter.condition.injuries).toHaveLength(0);
    expect(treated.fighter.progression.currency).toBe(85);
  });

  it('handles forfeit with a pending Revenge bout', () => {
    let s = makeState(200);
    s.career.grudges = [
      {
        opponentId: 'orrin-vale',
        name: 'Orrin Vale',
        temperament: 'brutal',
        tier: 'rookie',
        harm: ['cracked ribs (moderate)'],
        timesBeatenBy: 1,
        sinceDay: 1,
        status: 'active',
      },
    ];

    const offers = createOffers(1, s.fighter, s.career);
    const revenge = offers.find((o) => o.id === 'revenge-bout')!;
    s = startMatch(s, revenge);

    // Abandon / forfeit on load
    const resolved = resolvePendingOnLoad(s);
    expect(resolved.summary).not.toBeNull();
    expect(resolved.summary?.outcome).toBe('forfeit');
    expect(resolved.state.career.pendingMatch).toBeNull();
    // Grudge stays active on forfeit
    expect(resolved.state.career.grudges[0].status).toBe('active');
    expect(resolved.state.career.losses).toBe(1);
  });

  it('settles injuries when match ends by timeout with realistic health ratios', () => {
    let s = makeState(100);
    const offer = createOffers(8, s.fighter, s.career)[1];
    s = startMatch(s, offer);

    const outcome = resolveFightResult(70, 40, 7200);
    expect(outcome).toBe('win');

    const result = settleMatch(s, outcome!, 7200, {
      playerHealthRatio: 70 / 95,
      opponentHealthRatio: 40 / 95,
    });
    expect(result.summary.outcome).toBe('win');
    expect(result.state.career.pendingMatch).toBeNull();
  });

  it('prevents double settlement or double injury on result reload', () => {
    const memory = memStore();
    const storage = new FighterStorage(memory);

    let s = makeState(100);
    const offer = createOffers(9, s.fighter, s.career)[1];
    s = startMatch(s, offer);
    storage.saveGame(s);

    // First settlement
    const settled = settleMatch(s, 'win', 60, { playerHealthRatio: 1, opponentHealthRatio: 0 });
    storage.saveGame(settled.state);

    // Simulate page reload
    const reloaded = storage.loadGame()!;
    expect(reloaded.career.pendingMatch).toBeNull();

    const secondResolve = resolvePendingOnLoad(reloaded);
    expect(secondResolve.summary).toBeNull();
    expect(secondResolve.state.career.wins).toBe(1);
    expect(secondResolve.state.career.day).toBe(2);
  });

  it('preserves day counter correctly after v2 migration and advances thereafter', () => {
    const memory = memStore();
    const storage = new FighterStorage(memory);
    const f = createFighter(input, 100);

    memory.values.set(
      SAVE_KEY_V2,
      JSON.stringify({
        schemaVersion: 2,
        fighter: f,
        career: {
          ...defaultCareer(1),
          day: 5,
        },
      }),
    );

    let loaded = storage.loadGame()!;
    expect(loaded.career.day).toBe(5);

    // Play next match
    const offer = createOffers(1, loaded.fighter, loaded.career)[0];
    loaded = startMatch(loaded, offer);
    const settled = settleMatch(loaded, 'win', 60);
    expect(settled.state.career.day).toBe(6);
  });
});
