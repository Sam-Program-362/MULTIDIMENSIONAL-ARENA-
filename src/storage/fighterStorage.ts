import { FIGHTER_SCHEMA_VERSION, Fighter } from '../sim/fighter';
import { Career, CareerState, defaultCareer } from '../sim/career';
export interface KeyValueStore { getItem(key:string):string|null; setItem(key:string,value:string):void; removeItem?(key:string):void; }
export const FIGHTER_SAVE_KEY='multidimensional-arena:fighter:v1';
export const SAVE_KEY='multidimensional-arena:career:v2';
export class FighterStorage {
 constructor(private readonly store:KeyValueStore){}
 save(fighter:Fighter):void { const current=this.loadGame(); const career = current && current.fighter.meta.id === fighter.meta.id ? current.career : defaultCareer(fighter.meta.seed); this.saveGame({ fighter, career }); }
 saveGame(state:CareerState):void { this.store.setItem(SAVE_KEY,JSON.stringify({schemaVersion:2,...state})); }
 loadGame():CareerState|null { try { const raw=this.store.getItem(SAVE_KEY); if(raw){const x=JSON.parse(raw); if(x?.schemaVersion!==2||!isFighter(x.fighter)||!isCareer(x.career))return null; return normalizeState({fighter:x.fighter,career:x.career});} const old=this.store.getItem(FIGHTER_SAVE_KEY); if(!old)return null; const fighter=JSON.parse(old); if(!isFighter(fighter))return null; const state=normalizeState({fighter,career:defaultCareer(fighter.meta.seed)}); this.saveGame(state); return state; }catch{return null;} }
 load():Fighter|null{return this.loadGame()?.fighter??null;}
}
function normalizeState(state:CareerState):CareerState { return { fighter:{...state.fighter,progression:{...state.fighter.progression,currency:Math.round(state.fighter.progression.currency)}}, career:{...state.career,history:state.career.history.map((h)=>({...h,payout:Math.round(h.payout),netCurrency:Math.round(h.netCurrency)}))} }; }
function isFighter(v:unknown):v is Fighter {
 if(!v||typeof v!=='object') return false;
 const x=v as any;
 const strings=['name','origin','species','background','primaryStyle','powerSystem'];
 const lists=['secondaryStyles','weapons','equipment','specialAbilities'];
 return strings.every((k)=>typeof x[k]==='string') && lists.every((k)=>Array.isArray(x[k])&&x[k].every((item:any)=>typeof item==='string')) &&
  x.meta?.schemaVersion===1 && typeof x.meta.id==='string' && typeof x.meta.seed==='number' && typeof x.meta.createdAt==='string' &&
  typeof x.permanentDeath==='boolean' && typeof x.undergroundAccess==='boolean' && x.progression && typeof x.progression.currency==='number' &&
  typeof x.progression.rank==='string' && typeof x.progression.reputation==='string' && Array.isArray(x.progression.titles) && typeof x.progression.housing==='string' &&
  x.condition && Array.isArray(x.condition.injuries)&&x.condition.injuries.every((i:any)=>typeof i==='string')&&Array.isArray(x.condition.scars)&&x.condition.scars.every((i:any)=>typeof i==='string') &&
  x.hiddenStats&&Object.values(x.hiddenStats).every((n)=>typeof n==='number')&&x.hiddenTraits&&Object.values(x.hiddenTraits).every((n)=>typeof n==='number');
}
function isCareer(v:unknown):boolean {
 const x=v as any;
 if(!x||!Number.isFinite(x.rankPoints)||!Number.isFinite(x.wins)||!Number.isFinite(x.losses)||!Number.isFinite(x.draws)||!Number.isFinite(x.offerSeed)||!Array.isArray(x.history)||!('pendingMatch' in x)) return false;
 const validHistory=(h:any)=>h&&typeof h.opponent==='string'&&(h.tier==='rookie'||h.tier==='veteran')&&['win','loss','draw','forfeit'].includes(h.outcome)&&[h.fee,h.payout,h.netCurrency,h.rankPointsDelta,h.durationSeconds].every((n)=>typeof n==='number'&&Number.isFinite(n));
 if(!x.history.every(validHistory)|| (x.pendingMatch!==null && !validHistory({...x.pendingMatch,outcome:'draw',payout:0,netCurrency:0,rankPointsDelta:0,durationSeconds:0}))) return false;
 return true;
}
export function browserStorage():FighterStorage{return new FighterStorage(window.localStorage);}
