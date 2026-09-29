import { createRng } from './rng';

export const FIGHTER_SCHEMA_VERSION = 1;

export interface FighterInput {
  name: string;
  origin: string;
  species: string;
  background: string;
  primaryStyle: string;
  secondaryStyles: string[];
  powerSystem: string;
  weapons: string[];
  equipment: string[];
  specialAbilities: string[];
  permanentDeath?: boolean;
  undergroundAccess?: boolean;
}

export interface HiddenStats { health: number; stamina: number; reaction: number; skill: number; willpower: number; }
export interface HiddenTraits { aggression: number; fear: number; discipline: number; confidence: number; caution: number; patience: number; impulsiveness: number; adaptability: number; composure: number; riskTolerance: number; }
export interface Fighter extends FighterInput {
  permanentDeath: boolean;
  undergroundAccess: boolean;
  hiddenStats: HiddenStats;
  hiddenTraits: HiddenTraits;
  progression: { rank: 'Rookie'; reputation: 'Unknown'; titles: string[]; currency: number; housing: string };
  condition: { injuries: string[]; scars: string[] };
  meta: { id: string; schemaVersion: number; createdAt: string; seed: number };
}

const requiredFields: (keyof FighterInput)[] = ['name', 'origin', 'species', 'background', 'primaryStyle', 'powerSystem'];
const statKeys: (keyof HiddenStats)[] = ['health', 'stamina', 'reaction', 'skill', 'willpower'];
const traitKeys: (keyof HiddenTraits)[] = ['aggression', 'fear', 'discipline', 'confidence', 'caution', 'patience', 'impulsiveness', 'adaptability', 'composure', 'riskTolerance'];

export function validateFighterInput(input: FighterInput): void {
  if (!input || typeof input !== 'object') throw new Error('Fighter input is required.');
  for (const field of requiredFields) {
    if (typeof input[field] !== 'string' || input[field].trim().length === 0) throw new Error(`${field} is required.`);
  }
  for (const field of ['secondaryStyles', 'weapons', 'equipment', 'specialAbilities'] as const) {
    if (!Array.isArray(input[field]) || input[field].some((value) => typeof value !== 'string')) throw new Error(`${field} must be a list.`);
  }
}

function bounded(rng: () => number, minimum: number, maximum: number): number {
  return minimum + Math.floor(rng() * (maximum - minimum + 1));
}

export function createFighter(input: FighterInput, seed: number): Fighter {
  validateFighterInput(input);
  const rng = createRng(seed);
  const hiddenStats = {} as HiddenStats;
  const hiddenTraits = {} as HiddenTraits;
  for (const key of statKeys) hiddenStats[key] = bounded(rng, 45, 85);
  for (const key of traitKeys) hiddenTraits[key] = bounded(rng, 20, 80);
  const normalized = { ...input, name: input.name.trim(), permanentDeath: input.permanentDeath ?? false, undergroundAccess: input.undergroundAccess ?? false };
  const id = `fighter-${(seed >>> 0).toString(16).padStart(8, '0')}`;
  const createdAt = new Date(1600000000000 + ((seed >>> 0) % 1000000000)).toISOString();
  return {
    ...normalized,
    hiddenStats,
    hiddenTraits,
    progression: { rank: 'Rookie', reputation: 'Unknown', titles: [], currency: 100, housing: 'Shared quarters' },
    condition: { injuries: [], scars: [] },
    meta: { id, schemaVersion: FIGHTER_SCHEMA_VERSION, createdAt, seed: seed >>> 0 },
  };
}

export function describeCondition(fighter: Pick<Fighter, 'condition' | 'hiddenStats'>): string {
  if (fighter.condition.injuries.length > 0) return fighter.condition.injuries.length === 1 ? 'Recovering' : 'Badly hurt';
  if (fighter.condition.scars.length > 0) return 'Weathered';
  const average = Object.values(fighter.hiddenStats).reduce((sum, value) => sum + value, 0) / 5;
  return average >= 70 ? 'Ready' : average >= 55 ? 'Steady' : 'Fresh';
}
