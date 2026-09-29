import { describe, expect, it } from 'vitest';
import { createFighter, validateFighterInput, FighterInput } from '../src/sim';

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
