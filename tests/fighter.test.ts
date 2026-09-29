import { describe, expect, it } from 'vitest';
import { createFighter, isFighter, validateFighterInput, FighterInput, TEXT_LIMITS } from '../src/sim';

const input: FighterInput = { name: 'Rin', origin: 'Harbor Nine', species: 'Human', background: 'A courier who learned to fight.', primaryStyle: 'Close quarters', secondaryStyles: [], powerSystem: 'Kinetic focus', weapons: [], equipment: [], specialAbilities: [] };

describe('fighter generation', () => {
  it('is deterministic for the same seed and input', () => expect(createFighter(input, 42)).toEqual(createFighter(input, 42)));
  it('generates different hidden stats for different seeds', () => expect(createFighter(input, 42).hiddenStats).not.toEqual(createFighter(input, 43).hiddenStats));
  it('rejects an empty name and missing required fields', () => {
    expect(() => createFighter({ ...input, name: '  ' }, 1)).toThrow();
    expect(() => createFighter({ ...input, powerSystem: '' }, 1)).toThrow();
  });
  it('keeps optional lists empty and defaults rules off', () => {
    const fighter = createFighter(input, 8);
    expect(fighter.secondaryStyles).toEqual([]);
    expect(fighter.permanentDeath).toBe(false);
    expect(fighter.undergroundAccess).toBe(false);
  });
});

const times = (count: number, character = 'a') => character.repeat(count);

describe('text limits', () => {
  it('accepts text exactly at each limit', () => {
    expect(() => validateFighterInput({
      ...input,
      name: times(TEXT_LIMITS.name),
      origin: times(TEXT_LIMITS.singleLine),
      species: times(TEXT_LIMITS.singleLine),
      primaryStyle: times(TEXT_LIMITS.singleLine),
      powerSystem: times(TEXT_LIMITS.singleLine),
      background: times(TEXT_LIMITS.background),
      weapons: [times(TEXT_LIMITS.listItem)],
    })).not.toThrow();
  });

  it('rejects a name longer than 40 characters with a clear message', () => {
    expect(() => createFighter({ ...input, name: times(TEXT_LIMITS.name + 1) }, 1))
      .toThrow('Name must be 40 characters or fewer.');
  });

  it('rejects other single-line fields longer than 60 characters', () => {
    for (const field of ['origin', 'species', 'primaryStyle', 'powerSystem'] as const) {
      expect(() => createFighter({ ...input, [field]: times(TEXT_LIMITS.singleLine + 1) }, 1))
        .toThrow('must be 60 characters or fewer.');
    }
  });

  it('rejects a background longer than 200 characters', () => {
    expect(() => createFighter({ ...input, background: times(TEXT_LIMITS.background + 1) }, 1))
      .toThrow('Background must be 200 characters or fewer.');
  });

  it('rejects a list entry longer than 60 characters and names the list', () => {
    expect(() => createFighter({ ...input, weapons: ['Short blade', times(TEXT_LIMITS.listItem + 1)] }, 1))
      .toThrow('Each weapons entry must be 60 characters or fewer.');
    expect(() => createFighter({ ...input, secondaryStyles: [times(TEXT_LIMITS.listItem + 1)] }, 1))
      .toThrow('Each secondary styles entry must be 60 characters or fewer.');
    expect(() => createFighter({ ...input, equipment: [times(TEXT_LIMITS.listItem + 1)] }, 1)).toThrow();
    expect(() => createFighter({ ...input, specialAbilities: [times(TEXT_LIMITS.listItem + 1)] }, 1)).toThrow();
  });
});

describe('isFighter structure check', () => {
  const fighter = createFighter(input, 5);

  it('accepts a generated fighter', () => expect(isFighter(fighter)).toBe(true));

  it('accepts a save whose text is longer than the current limits', () => {
    expect(isFighter({ ...fighter, name: times(300), background: times(4000), weapons: [times(500)] })).toBe(true);
  });

  it('rejects values that are not objects', () => {
    for (const value of [null, undefined, 7, 'fighter', [], true]) expect(isFighter(value)).toBe(false);
  });

  it('rejects missing or wrongly typed fields', () => {
    const broken: unknown[] = [
      { ...fighter, name: 42 },
      { ...fighter, weapons: 'sword' },
      { ...fighter, weapons: [1, 2] },
      { ...fighter, permanentDeath: 'yes' },
      { ...fighter, hiddenStats: { ...fighter.hiddenStats, willpower: '60' } },
      { ...fighter, hiddenTraits: { aggression: 10 } },
      { ...fighter, progression: { ...fighter.progression, currency: '100' } },
      { ...fighter, progression: { ...fighter.progression, titles: [3] } },
      { ...fighter, condition: { injuries: [] } },
      { ...fighter, meta: { ...fighter.meta, seed: 'abc' } },
    ];
    for (const value of broken) expect(isFighter(value)).toBe(false);
    const { hiddenStats, ...withoutStats } = fighter;
    expect(isFighter(withoutStats)).toBe(false);
  });
});
