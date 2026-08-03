/**
 * 東西の分割相続と、代替わりの動揺。
 *
 * 西が東ローマを平らげれば、その皇帝はローマ全土の帝になる。
 * だがその死に際して**成人した後継者が複数いれば帝国は割れる。**
 * 395年のテオドシウス1世の死がまさにそれで、このゲームの開始点そのもの。
 * 一度統一しても同じことが起きる、という円環をここで閉じる。
 *
 * 後継者が1人なら全土をそのまま引き継ぐ。
 *
 * **プレイヤーは常に西を操作する。** 分割は西に有利な形で行い、
 * 近い属州（トラキア・アシア）は西に残し、遠い東方（オリエンス・
 * エジプト）が新しい東帝国になる。東は軍を分け与えられた側なので
 * 兄の帝国より弱いところから始まる。
 */

import {
  EAST_PARTITION_ARMY_SHARE,
  EAST_PARTITION_CONTROL,
  PARTITION_LEGITIMACY_LOSS,
  MAX_LEGITIMACY,
  MIN_LEGITIMACY,
  SUCCESSION_UNREST_ADVANCE_MULTIPLIER,
  SUCCESSION_UNREST_YEARS,
} from './constants';
import type { EastProvinceId, GameState } from './types';
import { clamp } from './util';

/**
 * 分割で新しい東帝国に渡る属州。
 *
 * 西に近い順に残すので、遠い2州が東になる。
 * 「西ローマ優位」を土地ではなく**軍**で作るため、
 * 州の数そのものは半々にしてある
 */
const PARTITIONED_TO_EAST: EastProvinceId[] = ['Oriens', 'Aegyptus'];

/** 成人した継承候補の数。分割が起きるかはこれで決まる */
function adultHeirCount(state: GameState, adultAge: number): number {
  return state.dynasty.members.filter(
    (m) => m.legitimate && state.year - m.birthYear >= adultAge,
  ).length;
}

/**
 * 代替わりの直後か。
 *
 * 新しい状態を持たせず、君主の即位年から導く。
 * `tick()` の純粋性を壊さずに「代替わりの動揺」を表せる
 */
export function isSuccessionUnrest(state: GameState): boolean {
  return state.year - state.dynasty.ruler.accessionYear < SUCCESSION_UNREST_YEARS;
}

/**
 * 代替わりの年に蛮族の侵入が激しくなる係数。
 * 既存の `ADVANCE_PROBABILITY` に掛かるだけで、新しい仕組みではない
 */
export function successionAdvanceMultiplier(state: GameState): number {
  return isSuccessionUnrest(state) ? SUCCESSION_UNREST_ADVANCE_MULTIPLIER : 1;
}

/**
 * 継承にともなう帝国の分割。
 *
 * `succeed()` の直後に呼ぶ。西が東方属州を持っていて、かつ成人した
 * 後継者が複数いるときだけ割れる。1人なら全土をそのまま引き継ぐ
 */
export function partitionOnSuccession(state: GameState, adultAge: number): GameState {
  // 西が東方属州を握っていなければ分けるものがない
  const westHeld = state.east.provinces.filter((p) => p.owner === 'west');
  if (westHeld.length === 0) return state;
  // 後継者がひとりなら全土を引き継ぐ
  if (adultHeirCount(state, adultAge) < 1) return state;

  const toEast = westHeld.filter((p) => PARTITIONED_TO_EAST.includes(p.id));
  if (toEast.length === 0) return state;

  return {
    ...state,
    east: {
      ...state.east,
      stance: 'peace',
      warStartYear: null,
      /*
       * 分け与えられた側なので、兄の帝国より弱いところから始まる。
       * これが「西ローマ優位」の中身で、土地の数では差を付けていない
       */
      army: Math.max(state.east.army, 1) * EAST_PARTITION_ARMY_SHARE,
      provinces: state.east.provinces.map((p) =>
        toEast.some((t) => t.id === p.id)
          ? { ...p, owner: 'east' as const, control: EAST_PARTITION_CONTROL }
          : p,
      ),
    },
    // 帝国が割れたことは正統性に響く。全土の帝ではなくなる
    legitimacy: clamp(
      state.legitimacy - PARTITION_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    turnEvents: [...state.turnEvents, 'empire_partitioned'],
  };
}
