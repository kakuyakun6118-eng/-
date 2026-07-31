import type {
  BarbarianFactionId,
  GameState,
  PlayerAction,
  ProvinceId,
} from '../core/types';
import { FACTION_LABELS } from './catalogue';
import { PROVINCE_LABEL_POINTS, projectLonLat } from './mapPaths';

/**
 * 地図上の進軍演出のための座標計算。
 * ゲームには個々の部隊の位置が無いため、前ターンと今ターンの
 * 差分から「どこからどこへ動いたか」を復元して描く。
 * これは表示のための解釈であって、状態そのものではない
 */

export type Point = [number, number];

/*
 * 手で置く地点は経緯度で持ち、地図と同じ投影を通す。
 * 座標を直に書くと、地図の表示範囲を変えたときに
 * すべてずれてしまうため
 */

/** 属州の代表点。ラベル位置を流用する */
const PROVINCE_POINTS: Record<ProvinceId, Point> = {
  ...PROVINCE_LABEL_POINTS,
  // 内陸に寄る属州は軍の動きが見えるよう手で寄せる
  Africa: projectLonLat(8.89, 35.58),
};

/** 帝国境外にいる勢力の待機位置。史実の進入方向に合わせて置く */
const EXTERIOR_POINTS: Record<BarbarianFactionId, Point> = {
  Vandals: projectLonLat(9.56, 51.12),
  Alans: projectLonLat(12.21, 51.74),
  Suebi: projectLonLat(7.24, 51.53),
  Franks: projectLonLat(8.45, 49.64),
  Burgundians: projectLonLat(10.99, 49.35),
  Saxons: projectLonLat(4.75, 55.41),
  Huns: projectLonLat(27.13, 47.44),
  Visigoths: projectLonLat(23.15, 45.47),
};

/** 野戦軍が出撃する拠点 */
const CAPITAL: Point = PROVINCE_POINTS.Italia;

function pointOf(faction: BarbarianFactionId, location: ProvinceId | 'exterior'): Point {
  return location === 'exterior' ? EXTERIOR_POINTS[faction] : PROVINCE_POINTS[location];
}

/**
 * 皇帝が自ら軍を率いるとみなす「軍事」能力の下限。
 * これは表示のための解釈であってゲームルールではないため
 * core/constants.ts ではなくここに置く。
 * 軍才ある皇帝は戦場に立ち、凡庸な皇帝は宮廷に留まる、という
 * 史実の対比を既存の能力値だけで表す
 */
const IMPERIAL_CAMPAIGN_MIN_MILITARY = 7;

export interface MapMarch {
  id: string;
  kind: 'legion' | 'barbarian';
  from: Point;
  to: Point;
  label: string;
  /** 軍旗に出す兵力。規模を目で見えるようにする */
  strength: number;
  /** 皇帝の親征。金色のローマ旗を掲げる */
  imperial: boolean;
}

export interface MapBattle {
  id: string;
  at: Point;
  label: string;
  /** 交戦している蛮族の兵力 */
  strength: number;
}

export interface TurnMotion {
  marches: MapMarch[];
  battles: MapBattle[];
}

export const NO_MOTION: TurnMotion = { marches: [], battles: [] };

/**
 * 1ターン分の進軍と戦闘を差分から復元する。
 * key に turn を含めるのは、同じ経路でも年が変われば
 * アニメーションをやり直させるため
 */
export function deriveTurnMotion(
  before: GameState,
  after: GameState,
  actions: readonly PlayerAction[],
): TurnMotion {
  const turn = after.turn;
  const marches: MapMarch[] = [];
  const battles: MapBattle[] = [];

  // 野戦軍の派遣。首都から派遣先へ進む
  const imperial =
    after.dynasty.ruler.abilities.military >= IMPERIAL_CAMPAIGN_MIN_MILITARY;
  for (const action of actions) {
    if (action.type !== 'military_deploy') continue;
    marches.push({
      id: `legion-${turn}-${action.provinceId}`,
      kind: 'legion',
      from: CAPITAL,
      to: PROVINCE_POINTS[action.provinceId],
      label: imperial ? '皇帝親征' : '野戦軍',
      strength: after.fieldArmy,
      imperial,
    });
  }

  for (const id of Object.keys(after.factions) as BarbarianFactionId[]) {
    const was = before.factions[id];
    const now = after.factions[id];

    // 蛮族の移動
    if (was.location !== now.location) {
      marches.push({
        id: `barb-${turn}-${id}`,
        kind: 'barbarian',
        from: pointOf(id, was.location),
        to: pointOf(id, now.location),
        label: FACTION_LABELS[id],
        strength: now.strength,
        imperial: false,
      });
    }

    /*
     * 戦闘。敵対勢力が属州にいて、その属州の支配度が下がった年を
     * 戦闘があった年とみなす。増税による一律の低下を拾わないよう
     * 敵の駐留を条件に入れている
     */
    if (now.stance !== 'hostile' || now.location === 'exterior') continue;
    const province = now.location;
    if (after.provinces[province].control < before.provinces[province].control) {
      battles.push({
        id: `battle-${turn}-${province}`,
        at: PROVINCE_POINTS[province],
        label: province,
        strength: now.strength,
      });
    }
  }

  // 同じ属州で複数勢力が戦っても印はひとつでよい
  const seen = new Set<string>();
  return {
    marches,
    battles: battles.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true))),
  };
}
