import { describe, expect, it } from 'vitest';
import { createFighter, FighterInput, Injury } from '../src/sim/fighter';
import {
  CAREER_TUNING,
  CareerState,
  applyBasicCare,
  applyPremiumTreatment,
  defaultCareer,
} from '../src/sim/career';

const fighterInput: FighterInput = {
  name: 'Clinic Patient',
  origin: 'Clinic Station',
  species: 'Cyborg',
  background: 'Needs repairs.',
  primaryStyle: 'Kickboxing',
  secondaryStyles: [],
  powerSystem: 'Battery',
  weapons: [],
  equipment: [],
  specialAbilities: [],
};

const makeState = (credits = 100, injuries: Injury[] = []): CareerState => {
  const f = createFighter(fighterInput, 20);
  f.progression.currency = credits;
  f.condition.injuries = [...injuries];
  return {
    fighter: f,
    career: defaultCareer(1),
  };
};

describe('clinic care and treatments', () => {
  it('applies basic care for free, setting treated = true once', () => {
    const injury: Injury = {
      id: 'inj-1',
      area: 'ribs',
      name: 'cracked ribs',
      severity: 'moderate',
      daysRemaining: 5,
      treated: false,
      day: 1,
    };
    const s = makeState(50, [injury]);
    const treated = applyBasicCare(s, 'inj-1');

    expect(treated.fighter.condition.injuries[0].treated).toBe(true);
    expect(treated.fighter.progression.currency).toBe(50); // Free
    expect(treated.career.day).toBe(1); // Day does not advance

    // Cannot apply basic care twice
    expect(() => applyBasicCare(treated, 'inj-1')).toThrow(/already treated/);
  });

  it('premium treatment completely heals minor and moderate injuries', () => {
    const minor: Injury = {
      id: 'inj-minor',
      area: 'arm',
      name: 'sprained wrist',
      severity: 'minor',
      daysRemaining: 2,
      treated: false,
      day: 1,
    };
    const moderate: Injury = {
      id: 'inj-mod',
      area: 'leg',
      name: 'torn ligament',
      severity: 'moderate',
      daysRemaining: 5,
      treated: false,
      day: 1,
    };

    let s = makeState(100, [minor, moderate]);

    // Treat minor (costs 15)
    s = applyPremiumTreatment(s, 'inj-minor');
    expect(s.fighter.progression.currency).toBe(85);
    expect(s.fighter.condition.injuries).toHaveLength(1);
    expect(s.fighter.condition.injuries[0].id).toBe('inj-mod');

    // Treat moderate (costs 40)
    s = applyPremiumTreatment(s, 'inj-mod');
    expect(s.fighter.progression.currency).toBe(45);
    expect(s.fighter.condition.injuries).toHaveLength(0);
  });

  it('premium treatment reduces severe injury to moderate with half base days and treated=true', () => {
    const severe: Injury = {
      id: 'inj-sev',
      area: 'head',
      name: 'fractured skull',
      severity: 'severe',
      daysRemaining: 10,
      treated: false,
      day: 1,
    };

    let s = makeState(150, [severe]);

    // Treat severe (costs 90)
    s = applyPremiumTreatment(s, 'inj-sev');
    expect(s.fighter.progression.currency).toBe(60);
    expect(s.fighter.condition.injuries).toHaveLength(1);

    const downgraded = s.fighter.condition.injuries[0];
    expect(downgraded.severity).toBe('moderate');
    expect(downgraded.name).toBe(CAREER_TUNING.injuries.names.head.moderate);
    expect(downgraded.daysRemaining).toBe(CAREER_TUNING.injuries.baseDays.moderate / 2); // 2.5
    expect(downgraded.treated).toBe(true);

    // Can be treated again with moderate premium treatment (costs 40)
    s = applyPremiumTreatment(s, 'inj-sev');
    expect(s.fighter.progression.currency).toBe(20);
    expect(s.fighter.condition.injuries).toHaveLength(0);
  });

  it('rejects premium treatment when credits are insufficient and does not deduct funds', () => {
    const severe: Injury = {
      id: 'inj-sev',
      area: 'arm',
      name: 'broken arm',
      severity: 'severe',
      daysRemaining: 10,
      treated: false,
      day: 1,
    };
    const s = makeState(89, [severe]); // Needs 90
    expect(() => applyPremiumTreatment(s, 'inj-sev')).toThrow(/Insufficient credits/);
    expect(s.fighter.progression.currency).toBe(89);
  });

  it('allows premium treatment when credits exactly equal price', () => {
    const minor: Injury = {
      id: 'inj-m',
      area: 'arm',
      name: 'sprained wrist',
      severity: 'minor',
      daysRemaining: 2,
      treated: false,
      day: 1,
    };
    const s = makeState(15, [minor]); // Exactly 15
    const treated = applyPremiumTreatment(s, 'inj-m');
    expect(treated.fighter.progression.currency).toBe(0);
    expect(treated.fighter.condition.injuries).toHaveLength(0);
  });
});
