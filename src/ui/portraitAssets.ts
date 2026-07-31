import type { Ruler, Spouse } from '../core/types';
import manifest from './portraits.json';

/**
 * 事前生成した肖像画像の割り当て。
 *
 * 君主は毎回ランダムに生まれるので「1人1枚」は用意できない。
 * 代わりに属性（役割・出自・年代）で分類した有限枚数を持ち、
 * 人物の id から決定的に1枚を選ぶ。
 * こうすると同じ皇帝は常に同じ肖像になり、セーブして読み直しても変わらない。
 *
 * 画像が1枚も無い場合や読み込みに失敗した場合は
 * components/Portrait.tsx の SVG 肖像にそのまま落ちる
 */

export type PortraitRole = 'emperor' | 'consort';
export type PortraitOrigin = 'roman' | 'east' | 'barbarian';
export type PortraitAge = 'youth' | 'adult' | 'elder';

export interface PortraitEntry {
  /** basePath からの相対ファイル名 */
  file: string;
  role: PortraitRole;
  origin: PortraitOrigin;
  age: PortraitAge;
}

export interface PortraitManifest {
  version: number;
  /** 画像を配信する基点。public/ 以下を指す */
  basePath: string;
  entries: PortraitEntry[];
}

const MANIFEST = manifest as PortraitManifest;

/** 髭が生え、老いと見なす年齢の境目。SVG 肖像と揃えている */
const YOUTH_MAX_AGE = 19;
const ELDER_MIN_AGE = 50;

export function ageBandOf(age: number): PortraitAge {
  if (age <= YOUTH_MAX_AGE) return 'youth';
  if (age < ELDER_MIN_AGE) return 'adult';
  return 'elder';
}

/** 君主の出自。混血や簒奪者も血統から判定する */
export function emperorOriginOf(ruler: Ruler): PortraitOrigin {
  if (ruler.lineage === 'roman') return 'roman';
  if (ruler.lineage === 'east') return 'east';
  return 'barbarian';
}

export function consortOriginOf(spouse: Spouse): PortraitOrigin {
  return spouse.origin.kind === 'east' ? 'east' : 'barbarian';
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 属性に合う肖像を1枚選ぶ。
 * 完全一致が無ければ年代を、それも無ければ出自を順に緩める。
 * 少数の画像から始めて後から足していけるようにするため
 */
export function selectPortrait(
  role: PortraitRole,
  origin: PortraitOrigin,
  age: PortraitAge,
  seedId: string,
): string | null {
  const byRole = MANIFEST.entries.filter((entry) => entry.role === role);
  if (byRole.length === 0) return null;

  const candidates =
    byRole.filter((e) => e.origin === origin && e.age === age).length > 0
      ? byRole.filter((e) => e.origin === origin && e.age === age)
      : byRole.filter((e) => e.origin === origin).length > 0
        ? byRole.filter((e) => e.origin === origin)
        : byRole.filter((e) => e.age === age).length > 0
          ? byRole.filter((e) => e.age === age)
          : byRole;

  const chosen = candidates[hashString(seedId) % candidates.length];
  return `${MANIFEST.basePath}${chosen.file}`;
}
