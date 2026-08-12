import leadersData from '../data/leaders.json';
import { defenceStrength } from './battle';
import {
  CONTROL_LOSS_PER_ADVANTAGE,
  ENDING_YEAR,
  NORTH_ATTACK_PROBABILITY,
  NORTH_FOUND_MIN_YEAR,
  NORTH_FOUND_PROVINCES,
  NORTH_FOUND_STRENGTH_SHARE,
  NORTH_GROWTH_RATE,
  NORTH_MAX_STRENGTH,
  NORTH_OFFENSIVE_PROBABILITY,
  NORTH_REBUILD,
  NORTH_SPLIT_STRENGTH_LOSS,
  NORTH_TEMPO_PER_POINT,
  modifiersOf,
} from './constants';
import type { FactionId, GameState, NorthernCourt, ProvinceId, TurnModifiers } from './types';
import { clamp100, heldProvinceIds } from './util';

interface RulerEntry {
  name: string;
  from: number;
  to: number;
  military: number;
}

const NORTH_RULERS = leadersData.northRulers as RulerEntry[];
const NORTH_NAMES = leadersData.northNames as Record<string, string>;

/** 隋が立つ年。この年から北朝は隋を名乗る */
const SUI_YEAR = 581;
/** 北魏が東西に裂けた年 */
const SPLIT_YEAR = 534;

/** その年の北朝の君主 */
function rulerOf(year: number): { name: string; military: number } {
  const found = NORTH_RULERS.find((entry) => year >= entry.from && year <= entry.to);
  return found ?? { name: '北朝の主', military: 6 };
}

/**
 * 華北の州をこれだけ握った勢力は、散らばった侵入者ではなく朝廷になる。
 *
 * 前秦が376年に、北魏が439年に、実際にこうして生まれた。
 * 一度これが立つと、州ごとに削り合う相手ではなく
 * **もう一つの朝廷**が南を向くことになる
 */
export function maybeFoundNorthernCourt(state: GameState): GameState {
  if (state.north !== null) return state;
  if (state.year < NORTH_FOUND_MIN_YEAR) return state;

  /*
   * 華北の州が胡族の手に渡った数を、勢力ごとではなく**まとめて**数える。
   *
   * 前秦も北魏も、十六国が分けて持っていた華北を征服してひとつにした。
   * 「1つの勢力が5州を握るまで」を条件にしていたときは、
   * 州が勢力どうしで細かく分かれたまま誰も閾値に届かず、
   * 北朝が一度も立たない局ばかりになった（隋も現れない）
   */
  const counts = new Map<FactionId, number>();
  let takenByTribes = 0;
  for (const province of Object.values(state.provinces)) {
    if (province.region !== 'north') continue;
    const holder = province.holder;
    if (holder === null || holder === 'north' || holder === 'prince') continue;
    counts.set(holder, (counts.get(holder) ?? 0) + 1);
    takenByTribes++;
  }
  if (takenByTribes < NORTH_FOUND_PROVINCES) return state;

  // まとめ上げるのは、そのうち最も多くを握り、最も強い勢力
  let founder: FactionId | null = null;
  let best = -1;
  for (const [id, count] of counts) {
    const weight = count * 100 + (state.factions[id]?.strength ?? 0);
    if (weight > best) {
      best = weight;
      founder = id;
    }
  }
  if (founder === null) return state;

  // 華北の州を握っている勢力の力をまとめて引き継ぐ
  const absorbed = Object.values(state.factions).filter(
    (f) => f.stance === 'enfeoffed' || f.id === founder,
  );
  const strength =
    absorbed.reduce((sum, f) => sum + f.strength, 0) * NORTH_FOUND_STRENGTH_SHARE;
  const ruler = rulerOf(state.year);

  const north: NorthernCourt = {
    founderId: founder,
    name: NORTH_NAMES[founder] ?? '北朝',
    rulerName: ruler.name,
    rulerMilitary: ruler.military,
    strength: Math.min(NORTH_MAX_STRENGTH, strength),
    foundedYear: state.year,
    offensiveSince: null,
    splitYear: null,
  };

  // 華北の州は北朝のものとしてまとめられる
  const provinces = { ...state.provinces };
  for (const id of Object.keys(provinces) as ProvinceId[]) {
    const province = provinces[id];
    if (province.region !== 'north') continue;
    if (province.holder === null || province.holder === 'prince') continue;
    provinces[id] = { ...province, holder: 'north' };
  }

  return {
    ...state,
    provinces,
    north,
    mandate: clamp100(state.mandate - 6),
    turnEvents: [...state.turnEvents, 'north_founded'],
  };
}

/**
 * 北朝の手番。
 *
 * 成長 → 分裂の判定 → 隋への改号 → 南征の判定 → 攻勢 の順に処理する
 */
export function updateNorthernCourt(
  state: GameState,
  rng: () => number,
  modifiers: TurnModifiers,
): GameState {
  if (state.north === null) return state;
  let north = state.north;
  let next = state;

  // 成長。天井を置きつつ、潰されても最低限は立て直す
  north = {
    ...north,
    strength: Math.min(NORTH_MAX_STRENGTH, north.strength * (1 + NORTH_GROWTH_RATE) + NORTH_REBUILD),
  };

  // 534年、北朝は東西に裂ける。これが南に与えられる唯一の猶予になる
  if (north.splitYear === null && state.year >= SPLIT_YEAR) {
    north = {
      ...north,
      splitYear: state.year,
      name: `東${north.name}`,
      strength: north.strength * (1 - NORTH_SPLIT_STRENGTH_LOSS),
    };
    next = { ...next, turnEvents: [...next.turnEvents, 'north_split'] };
  }

  // 581年、北朝に楊堅が立ち、国号を隋と改める
  if (state.year >= SUI_YEAR && north.name !== '隋') {
    north = { ...north, name: '隋', strength: north.strength * 1.25 };
  }

  // その年の君主を引き直す
  const ruler = rulerOf(state.year);
  north = { ...north, rulerName: ruler.name, rulerMilitary: ruler.military };

  // 南征を始めるか
  if (north.offensiveSince === null) {
    if (rng() < NORTH_OFFENSIVE_PROBABILITY) {
      north = { ...north, offensiveSince: state.year };
      next = { ...next, turnEvents: [...next.turnEvents, 'north_offensive'] };
    }
    return { ...next, north };
  }

  // 攻勢。有能な君主は一撃が重いだけでなく、休まず戦役を起こす
  const tempo = NORTH_ATTACK_PROBABILITY * (1 + north.rulerMilitary * NORTH_TEMPO_PER_POINT);
  if (rng() >= tempo) return { ...next, north };

  const targets = heldProvinceIds(next);
  if (targets.length === 0) return { ...next, north };

  // 淮水に近い州から順に攻める。北の州が残っていればそちらが先
  const ordered = targets.sort((a, b) => {
    const rank = (id: ProvinceId) => (next.provinces[id].region === 'north' ? 0 : 1);
    return rank(a) - rank(b);
  });
  const targetId = ordered[0];
  const province = next.provinces[targetId];

  const attack =
    north.strength *
    (1 + north.rulerMilitary * 0.035) *
    modifiersOf(next.difficulty).foePowerMultiplier *
    // 全軍を一州に注ぐわけではない
    0.45;
  const defence = defenceStrength(next, targetId, modifiers.reinforced);
  const total = attack + defence;
  const advantage = total <= 0 ? 0 : (attack - defence) / total;

  if (advantage > 0) {
    return {
      ...next,
      north,
      provinces: {
        ...next.provinces,
        [targetId]: {
          ...province,
          control: clamp100(province.control - advantage * CONTROL_LOSS_PER_ADVANTAGE),
          garrison: Math.max(0, province.garrison * (1 - advantage * 0.4)),
        },
      },
    };
  }

  return {
    ...next,
    north: { ...north, strength: north.strength * 0.92 },
    mandate: clamp100(next.mandate + 2),
  };
}

/**
 * 589年の判定。
 *
 * **この年までに天下を統一できなければ、統一するのは隋のほうになる。**
 * 勝敗の条件そのものがこのゲームの題名になっている
 */
export function suiWouldUnify(state: GameState): boolean {
  return state.year >= ENDING_YEAR && state.north !== null;
}
