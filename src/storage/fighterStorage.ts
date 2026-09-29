import { FIGHTER_SCHEMA_VERSION, Fighter, isFighter } from '../sim/fighter';

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

/**
 * A save is only used when it is this schema version and every required field is present
 * with the right type. Anything else is reported as "no save" instead of throwing, so a
 * partial, hand-edited, or foreign payload can never crash the start screen.
 */
function isFighterSave(value: unknown): value is Fighter {
  if (!isFighter(value)) return false;
  return value.meta.schemaVersion === FIGHTER_SCHEMA_VERSION;
}

export function browserStorage(): FighterStorage {
  return new FighterStorage(window.localStorage);
}
