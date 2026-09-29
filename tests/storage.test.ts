import { describe, expect, it } from 'vitest';
import { createFighter, FighterInput } from '../src/sim';
import { FighterStorage, FIGHTER_SAVE_KEY } from '../src/storage';

const input: FighterInput = { name: 'Save Test', origin: 'North', species: 'Human', background: 'Past', primaryStyle: 'Staff', secondaryStyles: [], powerSystem: 'Breath', weapons: [], equipment: [], specialAbilities: [] };
function store() { const values = new Map<string, string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }; }

describe('fighter storage', () => {
  it('save then load returns an identical fighter', () => { const memory = store(); const storage = new FighterStorage(memory); const fighter = createFighter(input, 77); storage.save(fighter); expect(storage.load()).toEqual(fighter); });
  it('returns no save for missing, corrupt, or unknown schema data', () => { const memory = store(); const storage = new FighterStorage(memory); expect(storage.load()).toBeNull(); memory.values.set(FIGHTER_SAVE_KEY, '{bad'); expect(storage.load()).toBeNull(); memory.values.set(FIGHTER_SAVE_KEY, JSON.stringify({ meta: { schemaVersion: 999 } })); expect(storage.load()).toBeNull(); });
});
