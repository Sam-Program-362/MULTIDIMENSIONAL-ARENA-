import { describe, expect, it } from 'vitest';
import { createFighter, FighterInput } from '../src/sim';
import { FighterStorage, FIGHTER_SAVE_KEY } from '../src/storage';

const input: FighterInput = { name: 'Save Test', origin: 'North', species: 'Human', background: 'Past', primaryStyle: 'Staff', secondaryStyles: [], powerSystem: 'Breath', weapons: [], equipment: [], specialAbilities: [] };
function store() { const values = new Map<string, string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }; }

describe('fighter storage', () => {
  it('save then load returns an identical fighter', () => { const memory = store(); const storage = new FighterStorage(memory); const fighter = createFighter(input, 77); storage.save(fighter); expect(storage.load()).toEqual(fighter); });
  it('returns null for structurally invalid saves without throwing', () => {
    const memory = store(); const storage = new FighterStorage(memory);
    for (const value of [{ meta: { schemaVersion: 1 } }, { meta: { schemaVersion: 1, id: 'x', seed: 1, createdAt: 'x' }, name: 4 }, { ...createFighter(input, 2), hiddenStats: { health: 'bad' } }]) {
      memory.values.set(FIGHTER_SAVE_KEY, JSON.stringify(value)); expect(() => storage.load()).not.toThrow(); expect(storage.load()).toBeNull();
    }
  });
  it('loads an older valid save even when text exceeds current input limits', () => {
    const memory = store(); const storage = new FighterStorage(memory); const fighter = createFighter(input, 3);
    memory.values.set(FIGHTER_SAVE_KEY, JSON.stringify({ ...fighter, name: 'n'.repeat(100), background: 'b'.repeat(300) }));
    expect(storage.load()?.name).toHaveLength(100); expect(storage.load()?.background).toHaveLength(300);
  });
  it('returns no save for missing, corrupt, or unknown schema data', () => { const memory = store(); const storage = new FighterStorage(memory); expect(storage.load()).toBeNull(); memory.values.set(FIGHTER_SAVE_KEY, '{bad'); expect(storage.load()).toBeNull(); memory.values.set(FIGHTER_SAVE_KEY, JSON.stringify({ meta: { schemaVersion: 999 } })); expect(storage.load()).toBeNull(); });
});
