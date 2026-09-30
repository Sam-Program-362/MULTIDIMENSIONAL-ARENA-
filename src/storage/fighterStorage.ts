import { FIGHTER_SCHEMA_VERSION, Fighter, Injury } from '../sim/fighter';
import { Career, CareerState, defaultCareer, Grudge, HistoryEntry, PendingMatch, getOfferLabel } from '../sim/career';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const FIGHTER_SAVE_KEY = 'multidimensional-arena:fighter:v1';
export const SAVE_KEY_V2 = 'multidimensional-arena:career:v2';
export const SAVE_KEY = 'multidimensional-arena:career:v3';

export class FighterStorage {
  constructor(private readonly store: KeyValueStore) {}

  save(fighter: Fighter): void {
    const current = this.loadGame();
    const career = current && current.fighter.meta.id === fighter.meta.id
      ? current.career
      : defaultCareer(fighter.meta.seed);
    this.saveGame({ fighter, career });
  }

  saveGame(state: CareerState): void {
    this.store.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 3, ...state }));
  }

  loadGame(): CareerState | null {
    try {
      // 1. Try v3 save key
      const rawV3 = this.store.getItem(SAVE_KEY);
      if (rawV3) {
        const x = JSON.parse(rawV3);
        if (x?.schemaVersion === 3 && isFighterV3(x.fighter) && isCareerV3(x.career)) {
          return normalizeState({ fighter: x.fighter, career: x.career });
        }
        if (x?.schemaVersion === 2 && isFighterV2OrLegacy(x.fighter) && isCareerV2OrLegacy(x.career)) {
          const migrated = migrateV2ToV3(x.fighter, x.career);
          const state = normalizeState(migrated);
          this.saveGame(state);
          return state;
        }
        return null;
      }

      // 2. Try v2 save key
      const rawV2 = this.store.getItem(SAVE_KEY_V2);
      if (rawV2) {
        const x = JSON.parse(rawV2);
        if (x?.schemaVersion === 2 && isFighterV2OrLegacy(x.fighter) && isCareerV2OrLegacy(x.career)) {
          const migrated = migrateV2ToV3(x.fighter, x.career);
          const state = normalizeState(migrated);
          this.saveGame(state);
          return state;
        }
        return null;
      }

      // 3. Try v1 save key
      const rawV1 = this.store.getItem(FIGHTER_SAVE_KEY);
      if (!rawV1) return null;
      const fighter = JSON.parse(rawV1);
      if (!isFighterV2OrLegacy(fighter)) return null;
      const migrated = migrateV1ToV3(fighter);
      const state = normalizeState(migrated);
      this.saveGame(state);
      return state;
    } catch {
      return null;
    }
  }

  load(): Fighter | null {
    return this.loadGame()?.fighter ?? null;
  }
}

function normalizeState(state: CareerState): CareerState {
  return {
    fighter: {
      ...state.fighter,
      progression: {
        ...state.fighter.progression,
        currency: Math.round(state.fighter.progression.currency),
      },
      condition: {
        ...state.fighter.condition,
        injuries: (state.fighter.condition.injuries ?? []).map((i) => ({
          ...i,
          daysRemaining: Math.round(i.daysRemaining * 100) / 100,
        })),
      },
    },
    career: {
      ...state.career,
      history: (state.career.history ?? []).map((h) => ({
        ...h,
        payout: Math.round(h.payout),
        netCurrency: Math.round(h.netCurrency),
      })),
    },
  };
}

function migrateV1ToV3(fighter: any): CareerState {
  const normalizedFighter: Fighter = {
    ...fighter,
    condition: {
      injuries: [],
      scars: Array.isArray(fighter.condition?.scars) ? fighter.condition.scars : [],
    },
  };
  return {
    fighter: normalizedFighter,
    career: defaultCareer(fighter.meta?.seed ?? Date.now()),
  };
}

function migrateV2ToV3(fighter: any, career: any): CareerState {
  const normalizedFighter: Fighter = {
    ...fighter,
    condition: {
      injuries: [],
      scars: Array.isArray(fighter.condition?.scars) ? fighter.condition.scars : [],
    },
  };

  const history: HistoryEntry[] = Array.isArray(career.history)
    ? career.history.map((h: any) => {
        const offerId = typeof h.offerId === 'string' ? h.offerId : (h.tier === 'veteran' ? 'veteran-bout' : 'rookie-bout');
        const label = typeof h.label === 'string' ? h.label : getOfferLabel(offerId, h.tier);
        const day = typeof h.day === 'number' ? h.day : 1;
        const aftermath = Array.isArray(h.aftermath) ? h.aftermath : [];
        return {
          offerId,
          label,
          day,
          opponent: String(h.opponent ?? 'Unknown'),
          opponentId: h.opponentId ? String(h.opponentId) : undefined,
          tier: h.tier === 'veteran' ? 'veteran' : 'rookie',
          outcome: ['win', 'loss', 'draw', 'forfeit'].includes(h.outcome) ? h.outcome : 'loss',
          fee: Number(h.fee ?? 0),
          payout: Number(h.payout ?? 0),
          netCurrency: Number(h.netCurrency ?? 0),
          rankPointsDelta: Number(h.rankPointsDelta ?? 0),
          durationSeconds: Number(h.durationSeconds ?? 0),
          ...(h.promotedTo ? { promotedTo: String(h.promotedTo) } : {}),
          aftermath,
          ...(Array.isArray(h.injuriesTaken) ? { injuriesTaken: h.injuriesTaken } : {}),
          ...(h.grudgeCreated ? { grudgeCreated: true } : {}),
          ...(h.grudgeSettled ? { grudgeSettled: true } : {}),
        };
      })
    : [];

  const pendingMatch: PendingMatch | null = career.pendingMatch
    ? {
        id: String(career.pendingMatch.id ?? 'rookie-bout'),
        tier: career.pendingMatch.tier === 'veteran' ? 'veteran' : 'rookie',
        opponent: String(career.pendingMatch.opponent ?? 'Unknown'),
        opponentId: String(career.pendingMatch.opponentId ?? 'unknown'),
        temperament: ['professional', 'brutal', 'ruthless'].includes(career.pendingMatch.temperament)
          ? career.pendingMatch.temperament
          : 'professional',
        fee: Number(career.pendingMatch.fee ?? 0),
        purse: Number(career.pendingMatch.purse ?? 0),
        rankPointsOnWin: Number(career.pendingMatch.rankPointsOnWin ?? 1),
        matchSeed: Number(career.pendingMatch.matchSeed ?? 0),
        acceptedAt: Number(career.pendingMatch.acceptedAt ?? 0),
        ...(career.pendingMatch.exhibition ? { exhibition: true } : {}),
        ...(career.pendingMatch.dangerous ? { dangerous: true } : {}),
        ...(career.pendingMatch.revenge ? { revenge: true } : {}),
      }
    : null;

  const grudges: Grudge[] = Array.isArray(career.grudges)
    ? career.grudges.filter(isValidGrudge)
    : [];

  const normalizedCareer: Career = {
    day: typeof career.day === 'number' && Number.isFinite(career.day) && career.day >= 1 ? career.day : 1,
    rankPoints: typeof career.rankPoints === 'number' && Number.isFinite(career.rankPoints) ? career.rankPoints : 0,
    wins: typeof career.wins === 'number' && Number.isFinite(career.wins) ? career.wins : 0,
    losses: typeof career.losses === 'number' && Number.isFinite(career.losses) ? career.losses : 0,
    draws: typeof career.draws === 'number' && Number.isFinite(career.draws) ? career.draws : 0,
    grudges,
    history,
    offerSeed: typeof career.offerSeed === 'number' && Number.isFinite(career.offerSeed) ? career.offerSeed : 0,
    pendingMatch,
  };

  return {
    fighter: normalizedFighter,
    career: normalizedCareer,
  };
}

function isValidInjury(i: any): i is Injury {
  return (
    i &&
    typeof i === 'object' &&
    typeof i.id === 'string' &&
    ['head', 'ribs', 'arm', 'leg'].includes(i.area) &&
    typeof i.name === 'string' &&
    ['minor', 'moderate', 'severe'].includes(i.severity) &&
    typeof i.daysRemaining === 'number' &&
    Number.isFinite(i.daysRemaining) &&
    typeof i.treated === 'boolean' &&
    typeof i.day === 'number' &&
    Number.isFinite(i.day) &&
    (i.sourceOpponentId === undefined || typeof i.sourceOpponentId === 'string')
  );
}

function isValidGrudge(g: any): g is Grudge {
  return (
    g &&
    typeof g === 'object' &&
    typeof g.opponentId === 'string' &&
    typeof g.name === 'string' &&
    ['professional', 'brutal', 'ruthless'].includes(g.temperament) &&
    ['rookie', 'veteran'].includes(g.tier) &&
    Array.isArray(g.harm) &&
    g.harm.every((item: any) => typeof item === 'string') &&
    typeof g.timesBeatenBy === 'number' &&
    Number.isFinite(g.timesBeatenBy) &&
    typeof g.sinceDay === 'number' &&
    Number.isFinite(g.sinceDay) &&
    ['active', 'settled'].includes(g.status)
  );
}

function isValidHistoryEntry(h: any): h is HistoryEntry {
  return (
    h &&
    typeof h === 'object' &&
    typeof h.offerId === 'string' &&
    typeof h.label === 'string' &&
    typeof h.day === 'number' &&
    Number.isFinite(h.day) &&
    typeof h.opponent === 'string' &&
    ['rookie', 'veteran'].includes(h.tier) &&
    ['win', 'loss', 'draw', 'forfeit'].includes(h.outcome) &&
    [h.fee, h.payout, h.netCurrency, h.rankPointsDelta, h.durationSeconds].every(
      (n) => typeof n === 'number' && Number.isFinite(n),
    ) &&
    (h.opponentId === undefined || typeof h.opponentId === 'string') &&
    (h.promotedTo === undefined || typeof h.promotedTo === 'string') &&
    (h.aftermath === undefined || (Array.isArray(h.aftermath) && h.aftermath.every((s: any) => typeof s === 'string'))) &&
    (h.injuriesTaken === undefined || (Array.isArray(h.injuriesTaken) && h.injuriesTaken.every((s: any) => typeof s === 'string'))) &&
    (h.grudgeCreated === undefined || typeof h.grudgeCreated === 'boolean') &&
    (h.grudgeSettled === undefined || typeof h.grudgeSettled === 'boolean')
  );
}

function isValidPendingMatch(p: any): p is PendingMatch {
  return (
    p &&
    typeof p === 'object' &&
    typeof p.id === 'string' &&
    ['rookie', 'veteran'].includes(p.tier) &&
    typeof p.opponent === 'string' &&
    [p.fee, p.purse, p.rankPointsOnWin, p.matchSeed, p.acceptedAt].every(
      (n) => typeof n === 'number' && Number.isFinite(n),
    ) &&
    (p.opponentId === undefined || typeof p.opponentId === 'string') &&
    (p.temperament === undefined || ['professional', 'brutal', 'ruthless'].includes(p.temperament)) &&
    (p.exhibition === undefined || typeof p.exhibition === 'boolean') &&
    (p.dangerous === undefined || typeof p.dangerous === 'boolean') &&
    (p.revenge === undefined || typeof p.revenge === 'boolean')
  );
}

function isFighterV3(v: unknown): v is Fighter {
  if (!v || typeof v !== 'object') return false;
  const x = v as any;
  const strings = ['name', 'origin', 'species', 'background', 'primaryStyle', 'powerSystem'];
  const lists = ['secondaryStyles', 'weapons', 'equipment', 'specialAbilities'];

  return (
    strings.every((k) => typeof x[k] === 'string') &&
    lists.every((k) => Array.isArray(x[k]) && x[k].every((item: any) => typeof item === 'string')) &&
    x.meta?.schemaVersion === 1 &&
    typeof x.meta.id === 'string' &&
    typeof x.meta.seed === 'number' &&
    typeof x.meta.createdAt === 'string' &&
    typeof x.permanentDeath === 'boolean' &&
    typeof x.undergroundAccess === 'boolean' &&
    x.progression &&
    typeof x.progression.currency === 'number' &&
    typeof x.progression.rank === 'string' &&
    typeof x.progression.reputation === 'string' &&
    Array.isArray(x.progression.titles) &&
    typeof x.progression.housing === 'string' &&
    x.condition &&
    Array.isArray(x.condition.injuries) &&
    x.condition.injuries.every(isValidInjury) &&
    Array.isArray(x.condition.scars) &&
    x.condition.scars.every((i: any) => typeof i === 'string') &&
    x.hiddenStats &&
    Object.values(x.hiddenStats).every((n) => typeof n === 'number') &&
    x.hiddenTraits &&
    Object.values(x.hiddenTraits).every((n) => typeof n === 'number')
  );
}

function isFighterV2OrLegacy(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const x = v as any;
  const strings = ['name', 'origin', 'species', 'background', 'primaryStyle', 'powerSystem'];
  const lists = ['secondaryStyles', 'weapons', 'equipment', 'specialAbilities'];

  return (
    strings.every((k) => typeof x[k] === 'string') &&
    lists.every((k) => Array.isArray(x[k]) && x[k].every((item: any) => typeof item === 'string')) &&
    x.meta?.schemaVersion === 1 &&
    typeof x.meta.id === 'string' &&
    typeof x.meta.seed === 'number' &&
    typeof x.meta.createdAt === 'string' &&
    typeof x.permanentDeath === 'boolean' &&
    typeof x.undergroundAccess === 'boolean' &&
    x.progression &&
    typeof x.progression.currency === 'number' &&
    typeof x.progression.rank === 'string' &&
    typeof x.progression.reputation === 'string' &&
    Array.isArray(x.progression.titles) &&
    typeof x.progression.housing === 'string' &&
    x.condition &&
    Array.isArray(x.condition.injuries) &&
    Array.isArray(x.condition.scars) &&
    x.hiddenStats &&
    Object.values(x.hiddenStats).every((n) => typeof n === 'number') &&
    x.hiddenTraits &&
    Object.values(x.hiddenTraits).every((n) => typeof n === 'number')
  );
}

function isCareerV3(v: unknown): v is Career {
  const x = v as any;
  if (
    !x ||
    !Number.isFinite(x.day) ||
    x.day < 1 ||
    !Number.isFinite(x.rankPoints) ||
    !Number.isFinite(x.wins) ||
    !Number.isFinite(x.losses) ||
    !Number.isFinite(x.draws) ||
    !Number.isFinite(x.offerSeed) ||
    !Array.isArray(x.grudges) ||
    !Array.isArray(x.history) ||
    !('pendingMatch' in x)
  ) {
    return false;
  }

  if (!x.grudges.every(isValidGrudge)) return false;
  if (!x.history.every(isValidHistoryEntry)) return false;
  if (x.pendingMatch !== null && !isValidPendingMatch(x.pendingMatch)) return false;

  return true;
}

function isCareerV2OrLegacy(v: unknown): boolean {
  const x = v as any;
  if (
    !x ||
    !Number.isFinite(x.rankPoints) ||
    !Number.isFinite(x.wins) ||
    !Number.isFinite(x.losses) ||
    !Number.isFinite(x.draws) ||
    !Number.isFinite(x.offerSeed) ||
    !Array.isArray(x.history) ||
    !('pendingMatch' in x)
  ) {
    return false;
  }
  return true;
}

export function browserStorage(): FighterStorage {
  return new FighterStorage(window.localStorage);
}
