import { describe, expect, it } from 'vitest';
import { createFighter, FighterInput } from '../src/sim';
import { FighterStorage, FIGHTER_SAVE_KEY, SAVE_KEY } from '../src/storage';
import { defaultCareer, createOffers, startMatch } from '../src/sim/career';

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
  it('rounds fractional currency and history values while loading v2', () => { const memory=store(); const storage=new FighterStorage(memory); const fighter=createFighter(input,9); memory.values.set(SAVE_KEY,JSON.stringify({schemaVersion:2,fighter:{...fighter,progression:{...fighter.progression,currency:12.7}},career:{...defaultCareer(1),history:[{opponent:'x',tier:'rookie',outcome:'win',fee:20,payout:37.8,netCurrency:17.8,rankPointsDelta:1,durationSeconds:1}]}})); const loaded=storage.loadGame()!; expect(loaded.fighter.progression.currency).toBe(13); expect(loaded.career.history[0].payout).toBe(38); expect(loaded.career.history[0].netCurrency).toBe(18); });
  it('round trips v2 career state including pending match', () => { const memory=store(); const storage=new FighterStorage(memory); const fighter=createFighter(input,8); const career=defaultCareer(12); const offer=createOffers(12,fighter,career)[1]; const state=startMatch({fighter,career},offer); storage.saveGame(state); expect(storage.loadGame()).toEqual(state); });
  it('new fighter starts fresh career instead of inheriting progress',()=>{const memory=store(); const storage=new FighterStorage(memory); const old=createFighter(input,20); const career=defaultCareer(20); career.rankPoints=30; career.history=[{opponent:'x',tier:'rookie',outcome:'win',fee:0,payout:1,netCurrency:1,rankPointsDelta:1,durationSeconds:1}]; storage.saveGame({fighter:old,career}); const fresh=createFighter(input,21); storage.save(fresh); const loaded=storage.loadGame()!; expect(loaded.career.rankPoints).toBe(0); expect(loaded.career.history).toEqual([]); expect(loaded.career.pendingMatch).toBeNull();});

});
