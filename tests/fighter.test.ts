import { describe, expect, it } from 'vitest';
import { createFighter, validateFighterInput, FighterInput, describeCondition, Injury } from '../src/sim';

const input: FighterInput = {
  name: 'Rin',
  origin: 'Harbor Nine',
  species: 'Human',
  background: 'A courier who learned to fight.',
  primaryStyle: 'Close quarters',
  secondaryStyles: [],
  powerSystem: 'Kinetic focus',
  weapons: [],
  equipment: [],
  specialAbilities: [],
};

describe('fighter generation and condition', () => {
  it('is deterministic for the same seed and input', () => expect(createFighter(input, 42)).toEqual(createFighter(input, 42)));
  it('generates different hidden stats for different seeds', () => expect(createFighter(input, 42).hiddenStats).not.toEqual(createFighter(input, 43).hiddenStats));
  it('rejects an empty name and missing required fields', () => {
    expect(() => createFighter({ ...input, name: '  ' }, 1)).toThrow();
    expect(() => createFighter({ ...input, powerSystem: '' }, 1)).toThrow();
  });
  it('rejects text and list values over their limits while accepting exact limits', () => {
    const exact = { ...input, name: 'n'.repeat(40), origin: 'o'.repeat(60), species: 's'.repeat(60), primaryStyle: 'p'.repeat(60), powerSystem: 'w'.repeat(60), background: 'b'.repeat(200), secondaryStyles: ['l'.repeat(60)] };
    expect(() => createFighter(exact, 8)).not.toThrow();
    expect(() => createFighter({ ...input, name: 'n'.repeat(41) }, 8)).toThrow(/name.*40/);
    expect(() => createFighter({ ...input, origin: 'o'.repeat(61) }, 8)).toThrow(/origin.*60/);
    expect(() => createFighter({ ...input, background: 'b'.repeat(201) }, 8)).toThrow(/background.*200/);
    expect(() => createFighter({ ...input, weapons: ['w'.repeat(61)] }, 8)).toThrow(/weapons.*60/);
  });
  it('keeps optional lists empty and defaults rules off', () => {
    const fighter = createFighter(input, 8);
    expect(fighter.secondaryStyles).toEqual([]);
    expect(fighter.permanentDeath).toBe(false);
    expect(fighter.undergroundAccess).toBe(false);
  });

  it('describes condition from structured injuries and stats', () => {
    const fighter = createFighter(input, 8);
    // Fresh/Steady/Ready without injuries
    const baseCondition = describeCondition(fighter);
    expect(['Steady', 'Ready', 'Fresh']).toContain(baseCondition);

    // 1 minor injury -> Bruised
    const minor: Injury = { id: 'm', area: 'ribs', name: 'bruised ribs', severity: 'minor', daysRemaining: 2, treated: false, day: 1 };
    fighter.condition.injuries = [minor];
    expect(describeCondition(fighter)).toBe('Bruised');

    // 1 moderate injury -> Injured
    const moderate: Injury = { id: 'mod', area: 'arm', name: 'dislocated shoulder', severity: 'moderate', daysRemaining: 5, treated: false, day: 1 };
    fighter.condition.injuries = [moderate];
    expect(describeCondition(fighter)).toBe('Injured');

    // 2 minor injuries -> Injured
    fighter.condition.injuries = [minor, { ...minor, id: 'm2', area: 'leg' }];
    expect(describeCondition(fighter)).toBe('Injured');

    // 1 severe injury -> Badly injured
    const severe: Injury = { id: 'sev', area: 'head', name: 'fractured skull', severity: 'severe', daysRemaining: 10, treated: false, day: 1 };
    fighter.condition.injuries = [severe];
    expect(describeCondition(fighter)).toBe('Badly injured');

    // 3 minor injuries (severity score 3) -> Badly injured
    fighter.condition.injuries = [minor, { ...minor, id: 'm2', area: 'leg' }, { ...minor, id: 'm3', area: 'arm' }];
    expect(describeCondition(fighter)).toBe('Badly injured');
  });
});
