import type { FactionId, GameState, Province, ProvinceId } from './types';

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/** 0〜100 に収める。7パラメータのうち割合で持つものに使う */
export const clamp100 = (value: number): number => clamp(value, 0, 100);

/** 整数の乱数 [min, max] */
export function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** 配列から1つ引く。空なら null */
export function pick<T>(rng: () => number, items: readonly T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)];
}

/** 朝廷が保っている州 */
export function heldProvinces(state: GameState): Province[] {
  return Object.values(state.provinces).filter((p) => p.control > 0 && p.holder === null);
}

export function heldProvinceIds(state: GameState): ProvinceId[] {
  return heldProvinces(state).map((p) => p.id);
}

/** 朝廷の手を離れた州 */
export function lostProvinces(state: GameState): Province[] {
  return Object.values(state.provinces).filter((p) => p.holder !== null);
}

/** その州に踏み込んでいる敵 */
export function foesIn(state: GameState, provinceId: ProvinceId): FactionId[] {
  return Object.values(state.factions)
    .filter((f) => f.location === provinceId && f.stance === 'hostile')
    .map((f) => f.id);
}

/**
 * GameState 内へのパスで値を読む。歴史イベントの条件判定に使う。
 * 例: "treasury" / "provinces.Si.control"
 */
export function readPath(state: GameState, path: string): unknown {
  let cursor: unknown = state;
  for (const key of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

/**
 * GameState 内へのパスに値を書く。**状態は複製してから書き換える**ので、
 * 呼び出し側は返ってきた状態を使うこと
 */
export function writePath(state: GameState, path: string, value: number | string | boolean): GameState {
  const keys = path.split('.');
  const next: Record<string, unknown> = { ...(state as unknown as Record<string, unknown>) };
  let cursor = next;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const child = cursor[key];
    if (child === null || typeof child !== 'object') return state;
    const copy = Array.isArray(child) ? [...child] : { ...(child as object) };
    cursor[key] = copy;
    cursor = copy as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
  return next as unknown as GameState;
}
