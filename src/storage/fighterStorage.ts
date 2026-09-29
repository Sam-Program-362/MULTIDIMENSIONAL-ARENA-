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
  const candidate = value as Partial<Fighter>;
  return candidate.meta?.schemaVersion === FIGHTER_SCHEMA_VERSION
    && typeof candidate.meta.id === 'string'
    && typeof candidate.meta.seed === 'number'
    && typeof candidate.name === 'string'
    && !!candidate.progression
    && !!candidate.hiddenStats
    && !!candidate.hiddenTraits
    && !!candidate.condition;
}

export function browserStorage(): FighterStorage {
  return new FighterStorage(window.localStorage);
}
