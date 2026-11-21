// 都市の守備兵の兵種の内訳(Version 51)。
// 守備兵の総数(garrison)は、これまでどおり1つの数で持つ。内訳は garrisonMix(騎兵・弓兵の人数)で持ち、残りを歩兵とする。
// 内訳を持たない都市は、これまでどおり歩兵7割・弓兵3割とみなす(城を守る兵の既定の構成)。
// 総数だけを変える処理(募兵・事件・帰農など)のあとも、内訳が総数を超えないように、読むときに比例して縮める。
import type { CityState, UnitTypeId } from "../data/types";

export type Troops = Record<UnitTypeId, number>;

/** 都市の守備兵の兵種別の人数(合計は必ず garrison に等しい) */
export function garrisonTroops(state: CityState): Troops {
  const g = Math.max(0, Math.round(state.garrison));
  const mix = state.garrisonMix;
  if (!mix) {
    const archer = Math.round(g * 0.3);
    return { infantry: g - archer, cavalry: 0, archer };
  }
  let cavalry = Math.max(0, Math.round(mix.cavalry));
  let archer = Math.max(0, Math.round(mix.archer));
  if (cavalry + archer > g) {
    const k = g / Math.max(1, cavalry + archer);
    cavalry = Math.floor(cavalry * k);
    archer = Math.floor(archer * k);
  }
  return { infantry: g - cavalry - archer, cavalry, archer };
}

/** 兵種別の人数で、守備兵を置き換えた新しい状態(内訳も記録する) */
export function withGarrison(state: CityState, t: Troops): CityState {
  const infantry = Math.max(0, Math.round(t.infantry));
  const cavalry = Math.max(0, Math.round(t.cavalry));
  const archer = Math.max(0, Math.round(t.archer));
  return { ...state, garrison: infantry + cavalry + archer, garrisonMix: { cavalry, archer } };
}

/** 守備兵に兵を加える(帰城・解散)。兵種ごとに足す */
export function addToGarrison(state: CityState, add: Troops): CityState {
  const now = garrisonTroops(state);
  return withGarrison(state, { infantry: now.infantry + add.infantry, cavalry: now.cavalry + add.cavalry, archer: now.archer + add.archer });
}

/** 守備兵から n 人を、いまの内訳の割合で取り出す(出陣)。取り出した兵と、残りの状態を返す */
export function takeFromGarrison(state: CityState, n: number): { troops: Troops; state: CityState } {
  const now = garrisonTroops(state);
  const total = now.infantry + now.cavalry + now.archer;
  const take = Math.max(0, Math.min(total, Math.floor(n)));
  const cavalry = total > 0 ? Math.floor((now.cavalry * take) / total) : 0;
  const archer = total > 0 ? Math.floor((now.archer * take) / total) : 0;
  const troops = { infantry: take - cavalry - archer, cavalry, archer };
  return { troops, state: withGarrison(state, { infantry: now.infantry - troops.infantry, cavalry: now.cavalry - cavalry, archer: now.archer - archer }) };
}

/** 兵の合計 */
export function sumTroops(t: Troops): number {
  return t.infantry + t.cavalry + t.archer;
}

/**
 * 城壁の上と城門に、同時に立って戦える兵の数の目安(Version 51)。城の規模(防御力)と城門の数で決まる。
 * 守備兵の総数(駐屯兵力)とは別の数。これを超えた兵は、城内の予備として交代で加わる(戦いへの効き目は小さい)。
 */
export function wallCapacity(fort: { defense: number; gates: number }): number {
  return Math.round(6000 + Math.max(1, fort.gates) * 6000 + fort.defense * 300);
}

/**
 * 指揮官が十分に動かせる兵の数の目安(Version 51)。統率が高いほど大軍を動かせる。指揮官がいなければ2万人。
 * これを超えた兵は、展開が難しく、戦いへの効き目が下がる(大軍団ほど必ず有利、にはならない)。
 */
export function commandSpan(leadership: number | undefined): number {
  return 20000 + Math.max(0, leadership ?? 0) * 400;
}

/** 上限を超えた分を割り引いた、実際に効く兵の数 */
export function effectiveTroops(n: number, cap: number, rest: number): number {
  return n <= cap ? n : cap + (n - cap) * rest;
}
