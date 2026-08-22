import consortsData from '../data/consorts.json';
import housesData from '../data/houses.json';
import {
  AUXILIARY_DEFECT_THRESHOLD,
  AUXILIARY_ESCALATION,
  AUXILIARY_LOYALTY_GAIN,
  AUXILIARY_LOYALTY_LOSS,
  AUXILIARY_PAY_PER_STRENGTH,
  CONSORT_TRIBAL_RELIEF,
  TRAIT_TRIBAL_RELIEF,
  CHARISMA_TRIBUTE_DISCOUNT,
  COALITION_RALLY_PER_HOMELAND,
  EXPEDITION_ARMY_SHARE,
  EXPEDITION_MANDATE_GAIN,
  HOMELAND_DEFENSE_SHARE,
  MARRIAGE_COST,
  MARRIAGE_GENTRY_GAIN,
  MARRIAGE_GENTRY_MANDATE_GAIN,
  MARRIAGE_GENTRY_MIN_SUPPORT,
  MARRIAGE_GENTRY_RATE,
  MARRIAGE_GENTRY_TAX_BASE_LOSS,
  MARRIAGE_HEIR_DELAY,
  MARRIAGE_HEIR_GENTRY_GAIN,
  MARRIAGE_HEIR_TRIBAL_GAIN,
  MARRIAGE_NORTH_MANDATE_GAIN,
  MARRIAGE_NORTH_RATE,
  MARRIAGE_TRIBE_GENTRY_LOSS,
  MARRIAGE_TRIBE_LOYALTY_GAIN,
  MARRIAGE_TRIBE_MANDATE_LOSS,
  MARRIAGE_TRIBE_RATE,
  TAX_BASE_LOSS_PER_KINGDOM,
  TAX_BASE_MAX,
  TRIBUTE_COST_PER_STRENGTH,
  TRIBUTE_STRENGTH_LOSS,
  modifiersOf,
} from './constants';
import { kingdomNameOf } from './factions';
import { hasTrait } from './officers';
import { createRng } from './rng';
import type {
  Consort,
  MarriageKind,
  FactionId,
  GameState,
  HomelandId,
  MarriageAction,
  ProvinceId,
} from './types';
import { clamp, clamp100, pick } from './util';

const HOUSES = housesData.houses as { id: string; name: string }[];
const CONSORT_NAMES = consortsData.names as string[];

export function houseName(houseId: string): string {
  return HOUSES.find((house) => house.id === houseId)?.name ?? houseId;
}

export function allHouses(): { id: string; name: string }[] {
  return HOUSES;
}

// ── 歳幣 ──────────────────────────────────────────────

/** 歳幣で和平を買う費用。人望が高いほど安く済む */
export function tributeCost(state: GameState, factionId: FactionId): number {
  const faction = state.factions[factionId];
  if (faction === undefined) return 0;
  const discount = 1 - state.dynasty.ruler.abilities.charisma * CHARISMA_TRIBUTE_DISCOUNT;
  return Math.round(faction.strength * TRIBUTE_COST_PER_STRENGTH * Math.max(0.5, discount));
}

/**
 * 歳幣を払う。
 *
 * 引き揚げさせるだけでは塞外で毎年育って数年で戻るので、
 * **払った相手の戦力そのものを減らす**。ここが要になっている
 */
export function payTribute(state: GameState, factionId: FactionId): GameState {
  const faction = state.factions[factionId];
  if (faction === undefined || faction.stance !== 'hostile') return state;
  const cost = tributeCost(state, factionId);
  if (state.treasury < cost) return state;

  return {
    ...state,
    treasury: state.treasury - cost,
    factions: {
      ...state.factions,
      [factionId]: {
        ...faction,
        strength: faction.strength * (1 - TRIBUTE_STRENGTH_LOSS),
        location: faction.interior ? faction.location : 'exterior',
        demand: null,
      },
    },
  };
}

// ── 冊封（建国を認める） ──────────────────────────────

/**
 * その勢力の自立を認める。戦線は消えるが、その地の戸口は永久に失われる。
 * 五胡が国を建てていく過程を、朝廷の側から追認する手
 */
export function enfeoffFaction(
  state: GameState,
  factionId: FactionId,
  provinceId: ProvinceId,
): GameState {
  const faction = state.factions[factionId];
  const province = state.provinces[provinceId];
  if (faction === undefined || province === undefined) return state;
  if (faction.stance === 'enfeoffed') return state;

  return {
    ...state,
    factions: {
      ...state.factions,
      [factionId]: {
        ...faction,
        stance: 'enfeoffed',
        location: provinceId,
        demand: null,
        foundedYear: state.year,
        kingdomName: kingdomNameOf(factionId),
      },
    },
    provinces: { ...state.provinces, [provinceId]: { ...province, holder: factionId, control: 0 } },
    taxBase: clamp(state.taxBase - TAX_BASE_LOSS_PER_KINGDOM, 0, TAX_BASE_MAX),
    mandate: clamp100(state.mandate - 6),
    gentry: clamp100(state.gentry - 5),
  };
}

// ── 義従胡（傭兵） ────────────────────────────────────

/** 雇うのに要る金。戦力に比例する */
export function auxiliaryPay(state: GameState, factionId: FactionId): number {
  const faction = state.factions[factionId];
  if (faction === undefined) return 0;
  return Math.round(faction.strength * AUXILIARY_PAY_PER_STRENGTH);
}

/**
 * 義従胡として雇う。
 *
 * 目先の戦線は安く埋まる。だが給は年ごとに膨らみ、
 * 絶えれば寝返る。**今日を凌ぐ判断が、十年後の朝廷を殺す**
 */
export function hireAuxiliary(state: GameState, factionId: FactionId): GameState {
  const faction = state.factions[factionId];
  if (faction === undefined || faction.stance !== 'hostile') return state;
  const pay = auxiliaryPay(state, factionId);
  if (state.treasury < pay) return state;

  return {
    ...state,
    treasury: state.treasury - pay,
    factions: {
      ...state.factions,
      [factionId]: {
        ...faction,
        stance: 'auxiliary',
        location: faction.interior ? faction.location : 'exterior',
        demand: null,
      },
    },
    tribalLoyalty: clamp100(state.tribalLoyalty + 6),
    gentry: clamp100(state.gentry - 4),
  };
}

/**
 * 義従胡の給の清算。毎年払う。
 *
 * 払えた年は帰順が上がり、払えなかった年は大きく落ちる。
 * 帰順が閾値を割ると寝返って敵に戻る
 */
export function settleAuxiliaryPay(state: GameState): GameState {
  const auxiliaries = Object.values(state.factions).filter((f) => f.stance === 'auxiliary');
  if (auxiliaries.length === 0) return state;

  const escalation =
    1 +
    AUXILIARY_ESCALATION *
      modifiersOf(state.difficulty).auxiliaryEscalationMultiplier *
      Math.max(0, state.turn);
  const due = auxiliaries.reduce(
    (sum, f) => sum + f.strength * AUXILIARY_PAY_PER_STRENGTH * escalation,
    0,
  );

  if (state.treasury >= due) {
    return {
      ...state,
      treasury: state.treasury - due,
      tribalLoyalty: clamp100(state.tribalLoyalty + AUXILIARY_LOYALTY_GAIN),
    };
  }

  /*
   * 和親の后は、給が絶えた年の落ち込みを和らげる。
   * 婚姻は「その年の帰順を買う」だけの手ではなく、
   * **迎えているあいだ効き続ける**ものとして扱う
   */
  const relief =
    consortRelief(state, 'tribe') * CONSORT_TRIBAL_RELIEF +
    (hasTrait(state, 'huairou') ? TRAIT_TRIBAL_RELIEF : 0);
  return {
    ...state,
    treasury: Math.max(0, state.treasury - due),
    tribalLoyalty: clamp100(state.tribalLoyalty - Math.max(0, AUXILIARY_LOYALTY_LOSS - relief)),
  };
}

/**
 * 皇后の内助。**出自に見合う帰順にだけ効く。**
 *
 * 士族の女は士族の支持を、和親の后は胡族の帰順を、北朝の公主は天命を支える。
 * 効くのは人望で、迎えているあいだ毎年働く
 */
export function consortRelief(state: GameState, kind: MarriageKind): number {
  const consort = state.dynasty.consort;
  if (consort === null || consort.kind !== kind) return 0;
  return consort.abilities.charisma;
}

/** 帰順が尽きた義従胡は寝返る */
export function checkAuxiliaryDefection(state: GameState): GameState {
  if (state.tribalLoyalty >= AUXILIARY_DEFECT_THRESHOLD) return state;
  const factions = { ...state.factions };
  let defected = false;

  for (const id of Object.keys(factions) as FactionId[]) {
    const faction = factions[id];
    if (faction.stance !== 'auxiliary') continue;
    factions[id] = { ...faction, stance: 'hostile' };
    defected = true;
  }
  if (!defected) return state;

  return {
    ...state,
    factions,
    mandate: clamp100(state.mandate - 6),
    turnEvents: [...state.turnEvents, 'auxiliary_defected'],
  };
}

// ── 要求への応答 ──────────────────────────────────────

/**
 * 突きつけられた要求を飲む。
 *
 * **行動枠を消費しない。** 枠を食わせると毎年ほかの手と競合して常に負け、
 * 「金・土地・天命のどれを差し出すか」ではなく
 * 「軍を動かすか答えるか」を選ばせることになる。
 * 無償ではない — 応答は必ず何かを恒久的に削る
 */
export function acceptDemand(state: GameState, factionId: FactionId): GameState {
  const faction = state.factions[factionId];
  if (faction === undefined || faction.demand === null) return state;
  const demand = faction.demand;

  if (demand.type === 'gold') {
    if (state.treasury < demand.amount) return state;
    return {
      ...state,
      treasury: state.treasury - demand.amount,
      factions: {
        ...state.factions,
        [factionId]: {
          ...faction,
          demand: null,
          strength: faction.strength * (1 - TRIBUTE_STRENGTH_LOSS),
          location: faction.interior ? faction.location : 'exterior',
        },
      },
    };
  }

  if (demand.type === 'land') {
    const provinceId = demand.targetProvince;
    if (provinceId === undefined) return state;
    return enfeoffFaction({ ...state }, factionId, provinceId);
  }

  // 称号（王号）を与える。味方になるが、給は雇うより安いぶん長く尾を引く
  return {
    ...state,
    factions: {
      ...state.factions,
      [factionId]: { ...faction, stance: 'auxiliary', demand: null },
    },
    gentry: clamp100(state.gentry - 9),
    mandate: clamp100(state.mandate - 7),
    tribalLoyalty: clamp100(state.tribalLoyalty + 8),
  };
}

// ── 郷里への遠征 ──────────────────────────────────────

/** 塞外の郷里を討てるか。契約中の義従胡の郷里は攻められない */
export function canSubdueHomeland(state: GameState, homelandId: HomelandId): boolean {
  const homeland = state.homelands[homelandId];
  if (homeland === undefined || homeland.owner === 'court') return false;
  const faction = state.factions[homelandId as FactionId];
  if (faction !== undefined && faction.stance === 'auxiliary') return false;
  return state.centralArmy > 40;
}

/**
 * 郷里への遠征。
 *
 * 守るのは「その地の守備隊 ＋ その勢力の戦力の半分 ＋ 他の敵対勢力の加勢」。
 * 加勢は奪った郷里の数だけ固くなるので、**境外を平らげ続けることはできない**
 */
export function subdueHomeland(
  state: GameState,
  homelandId: HomelandId,
  rng: () => number,
): GameState {
  if (!canSubdueHomeland(state, homelandId)) return state;
  const homeland = state.homelands[homelandId];
  const faction = state.factions[homelandId as FactionId];

  const taken = Object.values(state.homelands).filter((h) => h.owner === 'court').length;
  const coalition = 1 + taken * COALITION_RALLY_PER_HOMELAND;

  const attacking = state.centralArmy * EXPEDITION_ARMY_SHARE;
  const defending =
    (homeland.garrison + (faction?.strength ?? 0) * HOMELAND_DEFENSE_SHARE) * coalition;

  const total = attacking + defending;
  const won = rng() < (total <= 0 ? 0 : attacking / total);
  const losses = attacking * (won ? 0.3 : 0.58);

  const next: GameState = { ...state, centralArmy: Math.max(0, state.centralArmy - losses) };
  if (!won) return { ...next, mandate: clamp100(next.mandate - 3) };

  return {
    ...next,
    homelands: {
      ...next.homelands,
      [homelandId]: { ...homeland, owner: 'court', control: 40 },
    },
    factions:
      faction === undefined
        ? next.factions
        : {
            ...next.factions,
            [homelandId as FactionId]: { ...faction, strength: faction.strength * 0.55 },
          },
    mandate: clamp100(next.mandate + EXPEDITION_MANDATE_GAIN),
  };
}

/** 併合した郷里の落ち着きと、元の主による奪還 */
export function updateHomelands(state: GameState, rng: () => number): GameState {
  const homelands = { ...state.homelands };
  let changed = false;

  for (const id of Object.keys(homelands) as HomelandId[]) {
    const homeland = homelands[id];
    if (homeland.owner !== 'court') continue;
    const faction = state.factions[id as FactionId];
    // 元の主が取り返しに来る。支配度が高いほど守り切れる
    const recapture = 0.1 * (1 - homeland.control / 140) * (1 + (faction?.strength ?? 0) / 220);
    if (rng() < recapture) {
      homelands[id] = { ...homeland, owner: 'tribe', control: 100 };
      changed = true;
      continue;
    }
    if (homeland.control < 100) {
      homelands[id] = { ...homeland, control: Math.min(100, homeland.control + 4) };
      changed = true;
    }
  }
  return changed ? { ...state, homelands } : state;
}

// ── 婚姻 ──────────────────────────────────────────────

/**
 * 婚姻。相手は士族の家門・胡族の族長家・北朝の帝室のいずれか。
 *
 * **行動枠を消費する。** 無償にすると純粋な上振れだけの選択肢になり、
 * すでに傾いている行動経済をさらに壊す
 */
/**
 * 差し出される女。**申し出の一覧に出す顔と、迎えたあとの皇后は同じ人物にする。**
 *
 * 迎えてから抽選していたときは、選ぶときに見た顔・年・人望と
 * 皇后になった人物が別人になった。行動の一覧はここを呼んで下見を描き、
 * `arrangeMarriage` は成立したときに同じものを受け取る。
 *
 * 種は「家門（または勢力）と、いまの王朝」から作る。代が替われば
 * 差し出される娘も替わり、同じ代のあいだは替わらない
 */
export function brideFor(state: GameState, target: MarriageAction['target']): Consort {
  const key =
    target.kind === 'gentry'
      ? target.houseId
      : target.kind === 'tribe'
        ? target.factionId
        : 'north';
  const id = `consort_${target.kind}_${key}_${state.dynasty.foundedYear}`;

  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const rng = createRng(hash >>> 0);
  const given = CONSORT_NAMES[Math.floor(rng() * CONSORT_NAMES.length)] ?? '徽音';
  const roll = (low: number, high: number) => low + Math.floor(rng() * (high - low + 1));

  return {
    id,
    name: target.kind === 'gentry' ? `${houseName(target.houseId)}の${given}` : given,
    age: roll(15, 27),
    abilities: {
      military: roll(1, 6),
      administration: roll(2, 9),
      charisma: roll(3, 10),
    },
    kind: target.kind,
    factionId: target.kind === 'tribe' ? target.factionId : null,
    houseId: target.kind === 'gentry' ? target.houseId : null,
    marriedYear: state.year,
  };
}

export function arrangeMarriage(
  state: GameState,
  target: MarriageAction['target'],
  rng: () => number,
): GameState {
  if (state.dynasty.consort !== null) return state;
  if (state.treasury < MARRIAGE_COST) return state;

  const charisma = state.dynasty.ruler.abilities.charisma;
  const base =
    target.kind === 'gentry'
      ? MARRIAGE_GENTRY_RATE
      : target.kind === 'tribe'
        ? MARRIAGE_TRIBE_RATE
        : MARRIAGE_NORTH_RATE;
  // 娘を出すのは朝廷を後ろ盾と見なす家だけ
  if (target.kind === 'gentry' && state.gentry < MARRIAGE_GENTRY_MIN_SUPPORT) return state;
  if (target.kind === 'north' && state.north === null) return state;

  const paid: GameState = { ...state, treasury: state.treasury - MARRIAGE_COST };
  if (rng() >= Math.min(0.95, base + charisma * 0.012)) return paid;

  const consort = brideFor(state, target);

  let next: GameState = {
    ...paid,
    dynasty: {
      ...paid.dynasty,
      consort,
      pendingMarriages: [
        ...paid.dynasty.pendingMarriages,
        {
          kind: target.kind,
          factionId: consort.factionId,
          dueYear: state.year + MARRIAGE_HEIR_DELAY,
        },
      ],
    },
  };

  if (target.kind === 'gentry') {
    next = {
      ...next,
      gentry: clamp100(next.gentry + MARRIAGE_GENTRY_GAIN),
      mandate: clamp100(next.mandate + MARRIAGE_GENTRY_MANDATE_GAIN),
      taxBase: clamp(next.taxBase - MARRIAGE_GENTRY_TAX_BASE_LOSS, 0, TAX_BASE_MAX),
    };
  } else if (target.kind === 'tribe') {
    const faction = next.factions[target.factionId];
    next = {
      ...next,
      tribalLoyalty: clamp100(next.tribalLoyalty + MARRIAGE_TRIBE_LOYALTY_GAIN),
      gentry: clamp100(next.gentry - MARRIAGE_TRIBE_GENTRY_LOSS),
      mandate: clamp100(next.mandate - MARRIAGE_TRIBE_MANDATE_LOSS),
      factions:
        faction === undefined
          ? next.factions
          : {
              ...next.factions,
              [target.factionId]: {
                ...faction,
                stance: faction.stance === 'hostile' ? 'auxiliary' : faction.stance,
              },
            },
    };
  } else {
    next = { ...next, mandate: clamp100(next.mandate + MARRIAGE_NORTH_MANDATE_GAIN) };
  }

  return next;
}

/** 子が生まれてはじめて発生する婚姻の効果を清算する */
export function settlePendingMarriages(state: GameState): GameState {
  const due = state.dynasty.pendingMarriages.filter((m) => m.dueYear <= state.year);
  if (due.length === 0) return state;

  let gentry = state.gentry;
  let tribal = state.tribalLoyalty;
  for (const marriage of due) {
    if (marriage.kind === 'gentry') gentry += MARRIAGE_HEIR_GENTRY_GAIN;
    if (marriage.kind === 'tribe') tribal += MARRIAGE_HEIR_TRIBAL_GAIN;
  }

  return {
    ...state,
    gentry: clamp100(gentry),
    tribalLoyalty: clamp100(tribal),
    dynasty: {
      ...state.dynasty,
      pendingMarriages: state.dynasty.pendingMarriages.filter((m) => m.dueYear > state.year),
    },
  };
}

/** 婚姻の相手として選べる胡族 */
export function marriageableFactions(state: GameState): FactionId[] {
  return Object.values(state.factions)
    .filter((f) => f.stance !== 'enfeoffed')
    .map((f) => f.id);
}

/** 縁組を申し込める家門を1つ引く。表示のためだけの候補 */
export function suggestHouse(rng: () => number): string {
  return pick(rng, HOUSES)?.id ?? HOUSES[0].id;
}
