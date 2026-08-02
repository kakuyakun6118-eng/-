import leadersData from '../data/leaders.json';
import type { BarbarianFactionId } from '../core/types';

/**
 * 人物名の割り当て。**表示のためだけの情報で、どの計算式にも影響しない。**
 *
 * 東ローマ皇帝とサーサーン朝の王は実在の人物を実際の在位年で引く。
 * 蛮族の族長も史料に残る名を年代順に並べてある。
 * 年から引くだけなので `GameState` に持たせる必要がなく、
 * セーブ形式も変わらない。
 *
 * 軍司令官だけは乱数で生まれるので年では引けない。
 * `id` から決定的に名簿を引き、同じ将軍が常に同じ名になるようにする
 * （肖像画の割り当てと同じ考え方）
 */

interface Reign {
  from: number;
  /** この年の**手前**まで。次代の from と重ねて書く */
  to: number;
  name: string;
  /**
   * その時期の見た目。実際の即位年齢と在位の長さに合わせる。
   * 在位が長く見た目が変わる者は、同じ名前のまま区間を分けてある
   * （テオドシウス2世は7歳で即位し49歳で没するので若年→壮年）
   */
  age?: 'youth' | 'adult' | 'elder';
}

const DATA = leadersData as {
  east: Reign[];
  persia: Reign[];
  factions: Record<BarbarianFactionId, Reign[]>;
  generalNames: string[];
  /** データで名が決まっている将軍。開始時のスティリコなど */
  knownGenerals: Record<string, string>;
};

function reignAt(reigns: Reign[], year: number): Reign | undefined {
  // 後ろから探す。区間が重なっていても最後に始まった者が現職になる
  for (let i = reigns.length - 1; i >= 0; i--) {
    if (year >= reigns[i].from) return reigns[i];
  }
  return reigns[0];
}

function nameAt(reigns: Reign[], year: number): string {
  return reignAt(reigns, year)?.name ?? '';
}

function ageAt(reigns: Reign[], year: number): 'youth' | 'adult' | 'elder' {
  return reignAt(reigns, year)?.age ?? 'adult';
}

/** 東ローマ皇帝。395年アルカディウスから476年ゼノンまで */
export function eastEmperorName(year: number): string {
  return nameAt(DATA.east, year);
}

/** サーサーン朝の王 */
export function persianKingName(year: number): string {
  return nameAt(DATA.persia, year);
}

/** 肖像に使う年代。即位年齢と在位の長さから決めてある */
export function eastEmperorAge(year: number): 'youth' | 'adult' | 'elder' {
  return ageAt(DATA.east, year);
}

export function persianKingAge(year: number): 'youth' | 'adult' | 'elder' {
  return ageAt(DATA.persia, year);
}

/** 蛮族の族長 */
export function factionLeaderName(id: BarbarianFactionId, year: number): string {
  const reigns = DATA.factions[id];
  return reigns ? nameAt(reigns, year) : '';
}

/** 文字列から決定的に整数を作る。肖像画の割り当てと同じ手 */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 軍司令官の名。id から引くので同じ将軍は常に同じ名になる。
 * 開始時の将軍のようにデータで名が決まっているものはそれを優先する
 */
export function generalName(generalId: string): string {
  const known = DATA.knownGenerals[generalId];
  if (known !== undefined) return known;
  const pool = DATA.generalNames;
  return pool[hashString(generalId) % pool.length];
}
