import { describe, expect, it } from 'vitest';
import { createFighter, FighterInput, Injury } from '../src/sim/fighter';
import {
  CAREER_TUNING,
  CareerState,
  calculateInjuryModifiers,
  createOffers,
  defaultCareer,
  generateMatchInjuries,
  hasSevereInjury,
  healInjuries,
  settleMatch,
  startMatch,
} from '../src/sim/career';
import { createOpponentCombatState, stepCombatantPair, NEUTRAL_COMBAT_INPUT } from '../src/sim/combat';

const fighterInput: FighterInput = {
  name: 'Injured Fighter',
  origin: 'Sector 7',
  species: 'Human',
  background: 'A veteran of the lower rings.',
  primaryStyle: 'Brawling',
  secondaryStyles: [],
  powerSystem: 'Kinetic',
  weapons: [],
  equipment: [],
  specialAbilities: [],
};

const makeState = (credits = 100, points = 0, injuries: Injury[] = []): CareerState => {
  const f = createFighter(fighterInput, 10);
  f.progression.currency = credits;
  f.condition.injuries = [...injuries];
  return {
    fighter: f,
    career: {
      ...defaultCareer(5),
      rankPoints: points,
    },
  };
};

describe('injuries and penalties', () => {
  it('calculates modifiers accurately by area and severity', () => {
    const minorRibs: Injury = {
      id: 'i1',
      area: 'ribs',
      name: 'bruised ribs',
      severity: 'minor',
      daysRemaining: 2,
      treated: false,
      day: 1,
    };
    const mod1 = calculateInjuryModifiers([minorRibs]);
    expect(mod1.maxStamina).toBeCloseTo(0.96);
    expect(mod1.maxHealth).toBe(1.0);
    expect(mod1.attackDamage).toBe(1.0);
    expect(mod1.moveSpeed).toBe(1.0);

    const severeArm: Injury = {
      id: 'i2',
      area: 'arm',
      name: 'broken arm',
      severity: 'severe',
      daysRemaining: 10,
      treated: false,
      day: 1,
    };
    const mod2 = calculateInjuryModifiers([severeArm]);
    expect(mod2.attackDamage).toBeCloseTo(0.80);

    const moderateHead: Injury = {
      id: 'i3',
      area: 'head',
      name: 'concussion',
      severity: 'moderate',
      daysRemaining: 5,
      treated: false,
      day: 1,
    };
    const mod3 = calculateInjuryModifiers([moderateHead]);
    expect(mod3.maxHealth).toBeCloseTo(0.90);
  });

  it('caps penalties at 0.40 per effect and respects 0.60 stat floor', () => {
    // 3 severe leg injuries = 0.60 penalty -> capped at 0.40 -> multiplier 0.60
    const severeLegs: Injury[] = [
      { id: 'l1', area: 'leg', name: 'broken leg', severity: 'severe', daysRemaining: 10, treated: false, day: 1 },
      { id: 'l2', area: 'leg', name: 'broken leg', severity: 'severe', daysRemaining: 10, treated: false, day: 1 },
      { id: 'l3', area: 'leg', name: 'broken leg', severity: 'severe', daysRemaining: 10, treated: false, day: 1 },
    ];
    const mods = calculateInjuryModifiers(severeLegs);
    expect(mods.moveSpeed).toBe(0.60);
    expect(mods.attackDamage).toBe(1.0);
    expect(mods.maxHealth).toBe(1.0);
    expect(mods.maxStamina).toBe(1.0);
  });

  it('handles injuries in all four areas simultaneously', () => {
    const allAreas: Injury[] = [
      { id: 'h', area: 'head', name: 'concussion', severity: 'moderate', daysRemaining: 5, treated: false, day: 1 },
      { id: 'r', area: 'ribs', name: 'cracked ribs', severity: 'moderate', daysRemaining: 5, treated: false, day: 1 },
      { id: 'a', area: 'arm', name: 'dislocated shoulder', severity: 'moderate', daysRemaining: 5, treated: false, day: 1 },
      { id: 'l', area: 'leg', name: 'torn ligament', severity: 'moderate', daysRemaining: 5, treated: false, day: 1 },
    ];
    const mods = calculateInjuryModifiers(allAreas);
    expect(mods.maxHealth).toBeCloseTo(0.90);
    expect(mods.maxStamina).toBeCloseTo(0.90);
    expect(mods.attackDamage).toBeCloseTo(0.90);
    expect(mods.moveSpeed).toBeCloseTo(0.90);
  });

  it('applies modifiers to combat simulation and scales health damage, vitals and movement', () => {
    const mods = { maxHealth: 0.8, maxStamina: 0.8, moveSpeed: 0.7, attackDamage: 0.5 };
    const state = createOpponentCombatState(undefined, mods);

    expect(state.player.maxHealth).toBe(Math.round(95 * 0.8));
    expect(state.player.health).toBe(state.player.maxHealth);
    expect(state.player.maxStamina).toBe(Math.round(95 * 0.8));
    expect(state.player.stamina).toBe(state.player.maxStamina);
    expect(state.player.modifiers.moveSpeed).toBe(0.7);
    expect(state.player.modifiers.attackDamage).toBe(0.5);

    // Opponent is unmodified
    expect(state.dummy.modifiers.attackDamage).toBe(1.0);
    expect(state.dummy.modifiers.moveSpeed).toBe(1.0);
    expect(state.dummy.maxHealth).toBe(95);

    // Test attack damage scaling
    // Step combat with player attacking dummy
    let sim = state;
    // Set player position close to dummy
    sim.player.position = { x: 0, z: 0.5 };
    sim.dummy.position = { x: 0, z: 0 };
    sim.player.facing = { x: 0, z: -1 };
    sim.dummy.facing = { x: 0, z: 1 };

    // Player attacks
    const attackInput = { ...NEUTRAL_COMBAT_INPUT, attackPressed: true };
    const step1 = stepCombatantPair(sim, { player: attackInput, dummy: NEUTRAL_COMBAT_INPUT });
    sim = step1.state;

    // Advance ticks to active hit phase (startup is 6 ticks, active is tick 6)
    for (let t = 0; t < 6; t++) {
      const step = stepCombatantPair(sim, { player: NEUTRAL_COMBAT_INPUT, dummy: NEUTRAL_COMBAT_INPUT });
      sim = step.state;
      const hitEvent = step.events.find((e) => e.type === 'ATTACK_HIT' && e.actorId === 'player');
      if (hitEvent) {
        // Base damage is 18 * 0.5 = 9
        expect(hitEvent.amount).toBe(9);
      }
    }
  });

  it('heals untreated injuries at 0.5/day and treated at 1.0/day, removing at <= 0', () => {
    const injuries: Injury[] = [
      { id: 'u1', area: 'ribs', name: 'bruised ribs', severity: 'minor', daysRemaining: 2, treated: false, day: 1 },
      { id: 't1', area: 'arm', name: 'sprained wrist', severity: 'minor', daysRemaining: 2, treated: true, day: 1 },
    ];

    const day1 = healInjuries(injuries, 1);
    expect(day1).toHaveLength(2);
    expect(day1.find((i) => i.id === 'u1')?.daysRemaining).toBe(1.5);
    expect(day1.find((i) => i.id === 't1')?.daysRemaining).toBe(1.0);

    const day2 = healInjuries(day1, 1);
    expect(day2).toHaveLength(1);
    expect(day2[0].id).toBe('u1');
    expect(day2[0].daysRemaining).toBe(1.0);

    const day3 = healInjuries(day2, 1);
    expect(day3[0].daysRemaining).toBe(0.5);

    const day4 = healInjuries(day3, 1);
    expect(day4).toHaveLength(0);
  });

  it('blocks paid bouts when severe injury exists but allows Open Ring', () => {
    const severeInjury: Injury = {
      id: 'sev',
      area: 'head',
      name: 'fractured skull',
      severity: 'severe',
      daysRemaining: 10,
      treated: false,
      day: 1,
    };
    const s = makeState(100, 0, [severeInjury]);
    expect(hasSevereInjury(s.fighter.condition.injuries)).toBe(true);

    const offers = createOffers(1, s.fighter, s.career);
    const openRing = offers.find((o) => o.id === 'open-ring')!;
    const rookieBout = offers.find((o) => o.id === 'rookie-bout')!;
    const veteranBout = offers.find((o) => o.id === 'veteran-bout')!;

    // Open Ring is allowed
    expect(() => startMatch(s, openRing)).not.toThrow();

    // Paid bouts are blocked
    expect(() => startMatch(s, rookieBout)).toThrow(/Severe injury/);
    expect(() => startMatch(s, veteranBout)).toThrow(/Severe injury/);
  });

  it('deterministic injury generation gives identical results for same seed', () => {
    const s = makeState();
    const offer = createOffers(42, s.fighter, s.career)[1];
    const pending = { ...offer, acceptedAt: 0 };

    const gen1 = generateMatchInjuries(pending, 'loss', { playerHealthRatio: 0, opponentHealthRatio: 1 }, 2);
    const gen2 = generateMatchInjuries(pending, 'loss', { playerHealthRatio: 0, opponentHealthRatio: 1 }, 2);
    expect(gen1).toEqual(gen2);
  });

  it('generates injuries matching temperament distributions over 300 seeds', () => {
    let profMinor = 0;
    let profModerate = 0;
    let profSevere = 0;
    let profTotalInjuries = 0;

    let brutalMinor = 0;
    let brutalModerate = 0;
    let brutalSevere = 0;
    let brutalTotalInjuries = 0;

    let ruthlessMinor = 0;
    let ruthlessModerate = 0;
    let ruthlessSevere = 0;
    let ruthlessTotalInjuries = 0;

    for (let seed = 0; seed < 300; seed++) {
      // Professional (e.g. Mara Venn)
      const profPending = {
        id: 'rookie-bout',
        tier: 'rookie' as const,
        opponent: 'Mara Venn',
        opponentId: 'mara-venn',
        temperament: 'professional' as const,
        fee: 20,
        purse: 100,
        rankPointsOnWin: 1,
        matchSeed: seed,
        acceptedAt: 0,
      };
      const profInjuries = generateMatchInjuries(profPending, 'loss', { playerHealthRatio: 0, opponentHealthRatio: 1 }, 2);
      expect(profInjuries.length).toBeGreaterThanOrEqual(1);
      expect(profInjuries.length).toBeLessThanOrEqual(2);
      profTotalInjuries += profInjuries.length;
      for (const inj of profInjuries) {
        if (inj.severity === 'minor') profMinor++;
        if (inj.severity === 'moderate') profModerate++;
        if (inj.severity === 'severe') profSevere++;
      }

      // Brutal (e.g. Orrin Vale)
      const brutalPending = {
        id: 'veteran-bout',
        tier: 'veteran' as const,
        opponent: 'Orrin Vale',
        opponentId: 'orrin-vale',
        temperament: 'brutal' as const,
        fee: 40,
        purse: 250,
        rankPointsOnWin: 2,
        matchSeed: seed,
        acceptedAt: 0,
      };
      const brutalInjuries = generateMatchInjuries(brutalPending, 'loss', { playerHealthRatio: 0, opponentHealthRatio: 1 }, 2);
      expect(brutalInjuries.length).toBeGreaterThanOrEqual(1);
      expect(brutalInjuries.length).toBeLessThanOrEqual(3);
      brutalTotalInjuries += brutalInjuries.length;
      for (const inj of brutalInjuries) {
        if (inj.severity === 'minor') brutalMinor++;
        if (inj.severity === 'moderate') brutalModerate++;
        if (inj.severity === 'severe') brutalSevere++;
      }

      // Ruthless (e.g. Sable Rook)
      const ruthlessPending = {
        id: 'veteran-bout',
        tier: 'veteran' as const,
        opponent: 'Sable Rook',
        opponentId: 'sable-rook',
        temperament: 'ruthless' as const,
        fee: 40,
        purse: 250,
        rankPointsOnWin: 2,
        matchSeed: seed,
        acceptedAt: 0,
      };
      const ruthlessInjuries = generateMatchInjuries(ruthlessPending, 'loss', { playerHealthRatio: 0, opponentHealthRatio: 1 }, 2);
      expect(ruthlessInjuries.length).toBeGreaterThanOrEqual(2);
      expect(ruthlessInjuries.length).toBeLessThanOrEqual(4);
      ruthlessTotalInjuries += ruthlessInjuries.length;
      for (const inj of ruthlessInjuries) {
        if (inj.severity === 'minor') ruthlessMinor++;
        if (inj.severity === 'moderate') ruthlessModerate++;
        if (inj.severity === 'severe') ruthlessSevere++;
      }
    }

    // Professional should have mostly minor injuries (approx 70% minor)
    expect(profMinor / profTotalInjuries).toBeGreaterThan(0.55);
    expect(profSevere / profTotalInjuries).toBeLessThan(0.10);

    // Brutal should have significant moderate and severe injuries
    expect(brutalModerate / brutalTotalInjuries).toBeGreaterThan(0.30);
    expect(brutalSevere / brutalTotalInjuries).toBeGreaterThan(0.10);

    // Ruthless should have the highest severe fraction (approx 45%)
    expect(ruthlessSevere / ruthlessTotalInjuries).toBeGreaterThan(0.30);
    expect(ruthlessMinor / ruthlessTotalInjuries).toBeLessThan(0.30);
  });

  it('exhibition match only causes at most 1 minor injury on loss with 25% chance and 0 on win/draw', () => {
    let exhibitionLossInjuries = 0;
    for (let seed = 0; seed < 100; seed++) {
      const openPending = {
        id: 'open-ring',
        tier: 'rookie' as const,
        opponent: 'Sable Rook',
        opponentId: 'sable-rook',
        temperament: 'ruthless' as const,
        fee: 0,
        purse: 60,
        rankPointsOnWin: 0,
        matchSeed: seed,
        exhibition: true,
        acceptedAt: 0,
      };

      const winInj = generateMatchInjuries(openPending, 'win', { playerHealthRatio: 1, opponentHealthRatio: 0 }, 2);
      expect(winInj).toHaveLength(0);

      const drawInj = generateMatchInjuries(openPending, 'draw', { playerHealthRatio: 0.5, opponentHealthRatio: 0.5 }, 2);
      expect(drawInj).toHaveLength(0);

      const lossInj = generateMatchInjuries(openPending, 'loss', { playerHealthRatio: 0, opponentHealthRatio: 1 }, 2);
      expect(lossInj.length).toBeLessThanOrEqual(1);
      if (lossInj.length === 1) {
        expect(lossInj[0].severity).toBe('minor');
        exhibitionLossInjuries++;
      }
    }
    // Around 25% chance
    expect(exhibitionLossInjuries).toBeGreaterThanOrEqual(10);
    expect(exhibitionLossInjuries).toBeLessThanOrEqual(45);
  });

  it('forfeit counts as a loss for injury generation', () => {
    const s = makeState();
    const offer = createOffers(55, s.fighter, s.career)[2];
    const pending = { ...offer, acceptedAt: 0 };

    const lossInj = generateMatchInjuries(pending, 'loss', { playerHealthRatio: 0, opponentHealthRatio: 1 }, 2);
    const forfeitInj = generateMatchInjuries(pending, 'forfeit', { playerHealthRatio: 0, opponentHealthRatio: 1 }, 2);
    expect(lossInj).toEqual(forfeitInj);
  });

  it('advancing a match heals existing injuries first before adding new ones', () => {
    const existingInjury: Injury = {
      id: 'existing-1',
      area: 'ribs',
      name: 'bruised ribs',
      severity: 'minor',
      daysRemaining: 1.0,
      treated: true,
      day: 1,
    };
    let s = makeState(100, 0, [existingInjury]);
    s.career.day = 1;

    const offer = createOffers(12, s.fighter, s.career)[1];
    s = startMatch(s, offer);

    // Settle match (1 day passes): existing injury has daysRemaining 1.0 and treated=true -> should heal to 0 and be removed!
    const settled = settleMatch(s, 'win', 60, { playerHealthRatio: 1.0, opponentHealthRatio: 0 });

    expect(settled.state.career.day).toBe(2);
    // Existing injury should not be present
    expect(settled.state.fighter.condition.injuries.find((i) => i.id === 'existing-1')).toBeUndefined();
  });
});
