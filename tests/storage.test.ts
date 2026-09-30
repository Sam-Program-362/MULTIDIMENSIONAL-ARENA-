import { describe, expect, it } from 'vitest';
import { createFighter, FighterInput, Injury } from '../src/sim';
import { FighterStorage, FIGHTER_SAVE_KEY, SAVE_KEY, SAVE_KEY_V2 } from '../src/storage';
import { defaultCareer, createOffers, startMatch, Grudge } from '../src/sim/career';

const input: FighterInput = {
  name: 'Save Test',
  origin: 'North',
  species: 'Human',
  background: 'Past',
  primaryStyle: 'Staff',
  secondaryStyles: [],
  powerSystem: 'Breath',
  weapons: [],
  equipment: [],
  specialAbilities: [],
};

function store() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('fighter storage and schema migrations', () => {
  it('save then load returns an identical fighter', () => {
    const memory = store();
    const storage = new FighterStorage(memory);
    const fighter = createFighter(input, 77);
    storage.save(fighter);
    expect(storage.load()).toEqual(fighter);
  });

  it('returns null for structurally invalid saves without throwing', () => {
    const memory = store();
    const storage = new FighterStorage(memory);
    for (const value of [
      { meta: { schemaVersion: 1 } },
      { meta: { schemaVersion: 1, id: 'x', seed: 1, createdAt: 'x' }, name: 4 },
      { ...createFighter(input, 2), hiddenStats: { health: 'bad' } },
    ]) {
      memory.values.set(FIGHTER_SAVE_KEY, JSON.stringify(value));
      expect(() => storage.load()).not.toThrow();
      expect(storage.load()).toBeNull();
    }
  });

  it('loads an older valid save even when text exceeds current input limits', () => {
    const memory = store();
    const storage = new FighterStorage(memory);
    const fighter = createFighter(input, 3);
    memory.values.set(
      FIGHTER_SAVE_KEY,
      JSON.stringify({ ...fighter, name: 'n'.repeat(100), background: 'b'.repeat(300) }),
    );
    expect(storage.load()?.name).toHaveLength(100);
    expect(storage.load()?.background).toHaveLength(300);
  });

  it('returns no save for missing, corrupt, or unknown schema data', () => {
    const memory = store();
    const storage = new FighterStorage(memory);
    expect(storage.load()).toBeNull();
    memory.values.set(FIGHTER_SAVE_KEY, '{bad');
    expect(storage.load()).toBeNull();
    memory.values.set(FIGHTER_SAVE_KEY, JSON.stringify({ meta: { schemaVersion: 999 } }));
    expect(storage.load()).toBeNull();
  });

  it('rounds fractional currency and history values while loading v2', () => {
    const memory = store();
    const storage = new FighterStorage(memory);
    const fighter = createFighter(input, 9);
    memory.values.set(
      SAVE_KEY_V2,
      JSON.stringify({
        schemaVersion: 2,
        fighter: { ...fighter, progression: { ...fighter.progression, currency: 12.7 } },
        career: {
          ...defaultCareer(1),
          history: [
            {
              opponent: 'x',
              tier: 'rookie',
              outcome: 'win',
              fee: 20,
              payout: 37.8,
              netCurrency: 17.8,
              rankPointsDelta: 1,
              durationSeconds: 1,
            },
          ],
        },
      }),
    );
    const loaded = storage.loadGame()!;
    expect(loaded.fighter.progression.currency).toBe(13);
    expect(loaded.career.history[0].payout).toBe(38);
    expect(loaded.career.history[0].netCurrency).toBe(18);
  });

  it('round trips v3 career state including pending match, injuries, and grudges', () => {
    const memory = store();
    const storage = new FighterStorage(memory);
    const fighter = createFighter(input, 8);
    const injury: Injury = {
      id: 'inj-1',
      area: 'ribs',
      name: 'cracked ribs',
      severity: 'moderate',
      daysRemaining: 4.5,
      treated: true,
      day: 2,
    };
    fighter.condition.injuries = [injury];

    const grudge: Grudge = {
      opponentId: 'orrin-vale',
      name: 'Orrin Vale',
      temperament: 'brutal',
      tier: 'rookie',
      harm: ['cracked ribs (moderate)'],
      timesBeatenBy: 1,
      sinceDay: 2,
      status: 'active',
    };

    const career = {
      ...defaultCareer(12),
      day: 3,
      grudges: [grudge],
    };

    const offer = createOffers(12, fighter, career)[1];
    const state = startMatch({ fighter, career }, offer);
    storage.saveGame(state);

    const loaded = storage.loadGame()!;
    expect(loaded).toEqual(state);
    expect(loaded.career.day).toBe(3);
    expect(loaded.fighter.condition.injuries[0].treated).toBe(true);
    expect(loaded.career.grudges[0].opponentId).toBe('orrin-vale');
    expect(loaded.career.pendingMatch).toBeDefined();
  });

  it('new fighter starts fresh career instead of inheriting progress', () => {
    const memory = store();
    const storage = new FighterStorage(memory);
    const old = createFighter(input, 20);
    const career = defaultCareer(20);
    career.rankPoints = 30;
    career.history = [
      {
        offerId: 'rookie-bout',
        label: 'Rookie bout',
        day: 1,
        opponent: 'x',
        tier: 'rookie',
        outcome: 'win',
        fee: 0,
        payout: 1,
        netCurrency: 1,
        rankPointsDelta: 1,
        durationSeconds: 1,
        aftermath: ['Won cleanly.'],
      },
    ];
    storage.saveGame({ fighter: old, career });
    const fresh = createFighter(input, 21);
    storage.save(fresh);
    const loaded = storage.loadGame()!;
    expect(loaded.career.rankPoints).toBe(0);
    expect(loaded.career.history).toEqual([]);
    expect(loaded.career.pendingMatch).toBeNull();
  });

  it('migrates v1 fighter save to v3 with empty injuries, day 1, and empty grudges', () => {
    const memory = store();
    const storage = new FighterStorage(memory);
    const v1Fighter = createFighter(input, 40);
    // Legacy string injuries in v1 if any
    (v1Fighter.condition as any).injuries = ['old-string-injury'];
    memory.values.set(FIGHTER_SAVE_KEY, JSON.stringify(v1Fighter));

    const loaded = storage.loadGame()!;
    expect(loaded.fighter.condition.injuries).toEqual([]);
    expect(loaded.career.day).toBe(1);
    expect(loaded.career.grudges).toEqual([]);
    expect(loaded.career.rankPoints).toBe(0);
  });

  it('migrates v2 save to v3 dropping legacy string injuries and inferring history labels', () => {
    const memory = store();
    const storage = new FighterStorage(memory);
    const fighter = createFighter(input, 50);
    (fighter.condition as any).injuries = ['bruised ribs'];

    memory.values.set(
      SAVE_KEY_V2,
      JSON.stringify({
        schemaVersion: 2,
        fighter,
        career: {
          rankPoints: 15,
          wins: 5,
          losses: 2,
          draws: 0,
          offerSeed: 123,
          history: [
            {
              opponent: 'Mara Venn',
              tier: 'rookie',
              outcome: 'win',
              fee: 20,
              payout: 40,
              netCurrency: 20,
              rankPointsDelta: 1,
              durationSeconds: 30,
            },
            {
              opponent: 'Sable Rook',
              tier: 'veteran',
              outcome: 'loss',
              fee: 40,
              payout: 0,
              netCurrency: -40,
              rankPointsDelta: -1,
              durationSeconds: 45,
            },
          ],
          pendingMatch: null,
        },
      }),
    );

    const loaded = storage.loadGame()!;
    expect(loaded.fighter.condition.injuries).toEqual([]);
    expect(loaded.career.day).toBe(1);
    expect(loaded.career.grudges).toEqual([]);
    expect(loaded.career.history[0].offerId).toBe('rookie-bout');
    expect(loaded.career.history[0].label).toBe('Rookie bout');
    expect(loaded.career.history[1].offerId).toBe('veteran-bout');
    expect(loaded.career.history[1].label).toBe('Veteran bout');
  });

  it('returns null on corrupt or partial v3 save without throwing', () => {
    const memory = store();
    const storage = new FighterStorage(memory);

    // Partial v3 (missing day or grudges)
    memory.values.set(
      SAVE_KEY,
      JSON.stringify({
        schemaVersion: 3,
        fighter: createFighter(input, 99),
        career: { rankPoints: 0 }, // Partial
      }),
    );
    expect(storage.loadGame()).toBeNull();

    // Corrupt JSON
    memory.values.set(SAVE_KEY, '{invalid-json');
    expect(storage.loadGame()).toBeNull();
  });
});
