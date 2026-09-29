import { FIGHTER_SCHEMA_VERSION, Fighter } from '../sim/fighter';

export interface KeyValueStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void; }
export const FIGHTER_SAVE_KEY = `multidimensional-arena:fighter:v${FIGHTER_SCHEMA_VERSION}`;

export class FighterStorage {
  constructor(private readonly store: KeyValueStore) {}

  save(fighter: Fighter): void {
    this.store.setItem(FIGHTER_SAVE_KEY, JSON.stringify(fighter));
  }

  load(): Fighter | null {
    try {
      const raw = this.store.getItem(FIGHTER_SAVE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isFighterSave(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}

function isFighterSave(value: unknown): value is Fighter {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<Fighter>;
  const strings = ['name','origin','species','background','primaryStyle','powerSystem'] as const;
  const lists = ['secondaryStyles','weapons','equipment','specialAbilities'] as const;
  const meta = c.meta; const progression = c.progression; const condition = c.condition;
  return !!meta && meta.schemaVersion === FIGHTER_SCHEMA_VERSION && typeof meta.id === 'string' && typeof meta.seed === 'number' && typeof meta.createdAt === 'string'
    && strings.every((key) => typeof c[key] === 'string') && lists.every((key) => Array.isArray(c[key]) && c[key].every((item) => typeof item === 'string'))
    && typeof c.permanentDeath === 'boolean' && typeof c.undergroundAccess === 'boolean'
    && !!c.hiddenStats && Object.values(c.hiddenStats).every((n) => typeof n === 'number')
    && !!c.hiddenTraits && Object.values(c.hiddenTraits).every((n) => typeof n === 'number')
    && !!progression && Array.isArray(progression.titles) && typeof progression.currency === 'number' && typeof progression.rank === 'string' && typeof progression.reputation === 'string' && typeof progression.housing === 'string'
    && !!condition && Array.isArray(condition.injuries) && Array.isArray(condition.scars);
}

export function browserStorage(): FighterStorage {
  return new FighterStorage(window.localStorage);
}
