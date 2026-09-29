import { describe, expect, it } from 'vitest';
import { createFighter, FighterInput } from '../src/sim';
import { FighterStorage, FIGHTER_SAVE_KEY } from '../src/storage';

const input: FighterInput = { name: 'Save Test', origin: 'North', species: 'Human', background: 'Past', primaryStyle: 'Staff', secondaryStyles: [], powerSystem: 'Breath', weapons: [], equipment: [], specialAbilities: [] };
function store() { const values = new Map<string, string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }; }

describe('fighter storage', () => {
  it('save then load returns an identical fighter', () => { const memory = store(); const storage = new FighterStorage(memory); const fighter = createFighter(input, 77); storage.save(fighter); expect(storage.load()).toEqual(fighter); });
  it('returns no save for missing, corrupt, or unknown schema data', () => { const memory = store(); const storage = new FighterStorage(memory); expect(storage.load()).toBeNull(); memory.values.set(FIGHTER_SAVE_KEY, '{bad'); expect(storage.load()).toBeNull(); memory.values.set(FIGHTER_SAVE_KEY, JSON.stringify({ meta: { schemaVersion: 999 } })); expect(storage.load()).toBeNull(); });
});

describe('loader structure checks', () => {
  const valid = createFighter(input, 12);

  function loadFrom(value: unknown) {
    const memory = store();
    memory.values.set(FIGHTER_SAVE_KEY, JSON.stringify(value));
    return new FighterStorage(memory).load();
  }

  it('loads a save whose text is longer than the current validation limits', () => {
    const legacy = { ...valid, name: 'N'.repeat(120), background: 'B'.repeat(900), weapons: ['W'.repeat(400)] };
    expect(loadFrom(legacy)).toEqual(legacy);
  });

  it('treats a save with a missing field as no save', () => {
    const { hiddenTraits, ...missingTraits } = valid;
    expect(loadFrom(missingTraits)).toBeNull();
    const { progression, ...missingProgression } = valid;
    expect(loadFrom(missingProgression)).toBeNull();
    expect(loadFrom({ ...valid, meta: { id: 'x', schemaVersion: 1 } })).toBeNull();
  });

  it('treats a save with wrongly typed fields as no save', () => {
    expect(loadFrom({ ...valid, name: 5 })).toBeNull();
    expect(loadFrom({ ...valid, permanentDeath: 'true' })).toBeNull();
    expect(loadFrom({ ...valid, weapons: 'sword, axe' })).toBeNull();
    expect(loadFrom({ ...valid, hiddenStats: { ...valid.hiddenStats, health: null } })).toBeNull();
    expect(loadFrom({ ...valid, condition: { injuries: ['cut'], scars: 'none' } })).toBeNull();
    expect(loadFrom({ ...valid, progression: { ...valid.progression, rank: 7 } })).toBeNull();
  });

  it('never throws for junk payloads', () => {
    for (const value of [null, 3, 'text', [], { meta: null }, {}]) {
      expect(() => loadFrom(value)).not.toThrow();
      expect(loadFrom(value)).toBeNull();
    }
  });

  it('still rejects an unknown schema version', () => {
    expect(loadFrom({ ...valid, meta: { ...valid.meta, schemaVersion: 2 } })).toBeNull();
  });

  it('survives a store that throws while reading', () => {
    const storage = new FighterStorage({ getItem() { throw new Error('denied'); }, setItem() {} });
    expect(storage.load()).toBeNull();
  });
});
