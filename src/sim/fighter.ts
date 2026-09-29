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
const listFields = ['secondaryStyles', 'weapons', 'equipment', 'specialAbilities'] as const;
const statKeys: (keyof HiddenStats)[] = ['health', 'stamina', 'reaction', 'skill', 'willpower'];
const traitKeys: (keyof HiddenTraits)[] = ['aggression', 'fear', 'discipline', 'confidence', 'caution', 'patience', 'impulsiveness', 'adaptability', 'composure', 'riskTolerance'];

/**
 * Maximum text lengths accepted when creating a fighter. They are validation limits only:
 * saves written before the limits existed keep loading, so no save migration is needed.
 */
export const TEXT_LIMITS = { name: 40, singleLine: 60, background: 200, listItem: 60 } as const;

const fieldLabels: Record<string, string> = { name: 'Name', origin: 'Origin', species: 'Species', background: 'Background', primaryStyle: 'Primary style', powerSystem: 'Power system', secondaryStyles: 'Secondary styles', weapons: 'Weapons', equipment: 'Equipment', specialAbilities: 'Special abilities' };

/** The limit for one single-line field: name and background get their own. */
export function textLimitFor(field: keyof FighterInput): number {
  if (field === 'name') return TEXT_LIMITS.name;
  if (field === 'background') return TEXT_LIMITS.background;
  return TEXT_LIMITS.singleLine;
}

export function validateFighterInput(input: FighterInput): void {
  if (!input || typeof input !== 'object') throw new Error('Fighter input is required.');
  for (const field of requiredFields) {
    if (typeof input[field] !== 'string' || input[field].trim().length === 0) throw new Error(`${field} is required.`);
    const limit = textLimitFor(field);
    if (input[field].trim().length > limit) throw new Error(`${fieldLabels[field]} must be ${limit} characters or fewer.`);
  }
  for (const field of listFields) {
    if (!Array.isArray(input[field]) || input[field].some((value) => typeof value !== 'string')) throw new Error(`${field} must be a list.`);
    if (input[field].some((value) => value.trim().length > TEXT_LIMITS.listItem)) throw new Error(`Each ${fieldLabels[field].toLowerCase()} entry must be ${TEXT_LIMITS.listItem} characters or fewer.`);
  }
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hasNumbers = (value: unknown, keys: readonly string[]): boolean => isRecord(value) && keys.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key] as number));

/**
 * Structural check for data that claims to be a saved fighter. It only checks that every
 * required field exists with the right type; it deliberately does not apply text limits,
 * so saves written before {@link TEXT_LIMITS} existed still load.
 */
export function isFighter(value: unknown): value is Fighter {
  if (!isRecord(value)) return false;
  if (!requiredFields.every((field) => typeof value[field] === 'string')) return false;
  if (!listFields.every((field) => isStringArray(value[field]))) return false;
  if (typeof value.permanentDeath !== 'boolean' || typeof value.undergroundAccess !== 'boolean') return false;
  if (!hasNumbers(value.hiddenStats, statKeys) || !hasNumbers(value.hiddenTraits, traitKeys)) return false;
  const { progression, condition, meta } = value;
  if (!isRecord(progression) || typeof progression.rank !== 'string' || typeof progression.reputation !== 'string'
    || !isStringArray(progression.titles) || typeof progression.currency !== 'number' || typeof progression.housing !== 'string') return false;
  if (!isRecord(condition) || !isStringArray(condition.injuries) || !isStringArray(condition.scars)) return false;
  if (!isRecord(meta) || typeof meta.id !== 'string' || typeof meta.schemaVersion !== 'number'
    || typeof meta.createdAt !== 'string' || typeof meta.seed !== 'number') return false;
  return true;
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
