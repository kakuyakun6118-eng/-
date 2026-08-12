import {
  ADMIN_DECAY_RELIEF,
  ADMIN_INCOME_PER_POINT,
  ARMY_UPKEEP,
  CAPITAL_MANDATE_BONUS,
  CAPITAL_NAMES,
  CHANCELLOR_GENTRY_RELIEF,
  CHANCELLOR_INCOME_PER_POINT,
  CHARISMA_LOYALTY_RELIEF,
  CONTROL_MAX,
  CONTROL_RECOVERY,
  CONTROL_RECOVERY_MIN_CONTROL,
  CONVERSATION_COST,
  CONVERSATION_GENTRY_GAIN,
  CONVERSATION_MANDATE_GAIN,
  COURT_COST,
  DEVELOPMENT_CAPITAL_BONUS,
  DEVELOPMENT_RATE_NORTH,
  DEVELOPMENT_RATE_SOUTH,
  GARRISON_UPKEEP,
  GENTRY_DECAY,
  GRANT_RANK_GENTRY_GAIN,
  GRANT_RANK_MANDATE_LOSS,
  INSPECTOR_RECOVERY_PER_POINT,
  MANDATE_DECAY,
  MARSHAL_DECAY_PER_POINT,
  MOVE_CAPITAL_COST,
  MOVE_CAPITAL_MANDATE_LOSS,
  PRINCE_LOYALTY_DECAY,
  PRIVILEGE_GENTRY_GAIN,
  PRIVILEGE_MANDATE_GAIN,
  PRIVILEGE_TAX_BASE_LOSS,
  RAISE_TAXES_GENTRY_LOSS,
  RAISE_TAXES_MANDATE_LOSS,
  RAISE_TAXES_MULTIPLIER,
  REGISTER_COST,
  REGISTER_GENTRY_LOSS,
  REGISTER_TAX_BASE_GAIN,
  SETTLE_COST,
  SETTLE_GENTRY_LOSS,
  SETTLE_TAX_BASE_GAIN,
  START_YEAR,
  TAX_BASE_MAX,
  TAX_BASE_RECOVERY,
  TAX_BASE_REFERENCE,
  WALL_REPAIR,
  WALL_REPAIR_PER_POINT,
  TAX_RATE,
  modifiersOf,
} from './constants';
import type {
  Difficulty,
  Dynasty,
  Faction,
  GameState,
  Homeland,
  HomelandId,
  Official,
  Prince,
  Province,
  ProvinceId,
} from './types';
import { clamp, clamp100, heldProvinces } from './util';

/**
 * 291年の初期状態を組む。
 *
 * 7パラメータの初期値はここに置く。データ側（JSON）は州・胡族・
 * 宗室・王朝といった「顔ぶれ」だけを持ち、朝廷そのものの数値は
 * コードの側で一箇所にまとめる
 */
export function createInitialState(
  provinces: Province[],
  factions: Faction[],
  homelands: Homeland[],
  princes: Prince[],
  dynasty: Dynasty,
  chancellor: Official,
  inspectors: { provinceId: ProvinceId; official: Official }[],
  difficulty: Difficulty,
): GameState {
  const provinceMap = {} as Record<ProvinceId, Province>;
  for (const province of provinces) provinceMap[province.id] = { ...province };

  const factionMap = {} as Record<string, Faction>;
  for (const faction of factions) factionMap[faction.id] = { ...faction };

  const homelandMap = {} as Record<HomelandId, Homeland>;
  for (const homeland of homelands) homelandMap[homeland.id] = { ...homeland };

  const inspectorMap: Partial<Record<ProvinceId, Official>> = {};
  for (const seat of inspectors) inspectorMap[seat.provinceId] = { ...seat.official };

  return {
    turn: 0,
    year: START_YEAR,

    treasury: 640,
    taxBase: 88,
    centralArmy: 130,
    mandate: 72,
    gentry: 62,
    princeLoyalty: 58,
    tribalLoyalty: 46,

    provinces: provinceMap,
    factions: factionMap as GameState['factions'],
    homelands: homelandMap,
    princes: princes.map((p) => ({ ...p })),
    dynasty,
    marshal: { holder: null, hiredHistorical: [] },
    chancellor,
    inspectors: inspectorMap,
    candidates: [],
    north: null,
    battlefield: null,

    capital: 'Si',
    capitalName: CAPITAL_NAMES.Si ?? '洛陽',
    crossedSouthYear: null,
    fragmentedYear: null,
    unifiedYear: null,

    difficulty,
    retiredPrinceIds: [],
    firedEventIds: [],
    turnEvents: [],
    status: 'ongoing',
  };
}

// ── 収入と支出 ────────────────────────────────────────

/**
 * 税収 = Σ(州の支配度 × 戸口の豊かさ × 徴税率) × 戸口 × 能力補正。
 *
 * 州をひとつ失うと収入が落ち、収入が落ちると兵が養えず、
 * 兵が減れば次の州を失う。**循環の罠はこの式から始まる**
 */
export function calculateIncome(state: GameState): number {
  const raw = heldProvinces(state).reduce(
    (sum, province) => sum + (province.control / 100) * province.baseTax * TAX_RATE,
    0,
  );
  // 併合した郷里も収入に数える。ただし州ほどの実入りにはならない
  const fromHomelands = Object.values(state.homelands)
    .filter((h) => h.owner === 'court')
    .reduce((sum, h) => sum + (h.control / 100) * h.baseTax * TAX_RATE, 0);

  /*
   * 戸口は税収を丸ごと掛け算する数ではなく、基準のまわりで振れる補正にする。
   *
   * 州を失えば上の合計そのものが減るので、そこに戸口の割合まで
   * そのまま掛けると同じ損を二度数えることになる。実測では
   * 戸口が28まで落ちて収入が三割になり、どの局も脱走から滅んだ
   */
  const householdFactor = 0.5 + state.taxBase / (TAX_BASE_REFERENCE * 2);
  const adminBonus = 1 + state.dynasty.ruler.abilities.administration * ADMIN_INCOME_PER_POINT;
  const chancellorBonus =
    1 + (state.chancellor?.competence ?? 0) * CHANCELLOR_INCOME_PER_POINT;

  return (
    (raw + fromHomelands) *
    householdFactor *
    adminBonus *
    chancellorBonus *
    modifiersOf(state.difficulty).incomeMultiplier
  );
}

/** 支出 = 中軍の維持費 + 州兵の維持費 + 宮廷費 */
export function calculateExpenses(state: GameState): number {
  const garrisons = heldProvinces(state).reduce((sum, p) => sum + p.garrison, 0);
  return state.centralArmy * ARMY_UPKEEP + garrisons * GARRISON_UPKEEP + COURT_COST;
}

// ── 支配度 ────────────────────────────────────────────

/**
 * 支配度の自然回復。敵の踏み込んでいない州だけが戻る。
 * 刺史がいれば戻りが速い
 */
export function updateControl(state: GameState): GameState {
  const occupied = new Set(
    Object.values(state.factions)
      .filter((f) => f.stance === 'hostile' && f.location !== 'exterior')
      .map((f) => f.location as ProvinceId),
  );
  const revolted = new Set(state.princes.filter((p) => p.inRevolt).map((p) => p.province));

  const provinces = { ...state.provinces };
  for (const id of Object.keys(provinces) as ProvinceId[]) {
    const province = provinces[id];
    if (province.holder !== null) continue;
    if (province.control < CONTROL_RECOVERY_MIN_CONTROL) continue;
    if (occupied.has(id) || revolted.has(id)) continue;

    const inspector = state.inspectors[id];
    const recovery =
      CONTROL_RECOVERY * (1 + (inspector?.competence ?? 0) * INSPECTOR_RECOVERY_PER_POINT);
    provinces[id] = { ...province, control: clamp(province.control + recovery, 0, CONTROL_MAX) };
  }
  return { ...state, provinces };
}

/**
 * 城の修復。囲まれていない年に少しずつ耐久が戻る。
 *
 * 刺史がいれば戻りが速い。囲まれているあいだは戻らないので、
 * 攻め続けられている城は年ごとに削られていく
 */
export function repairWalls(state: GameState, besieged: ReadonlySet<ProvinceId>): GameState {
  const provinces = { ...state.provinces };
  let changed = false;

  for (const id of Object.keys(provinces) as ProvinceId[]) {
    const province = provinces[id];
    if (province.holder !== null || besieged.has(id)) continue;
    if (province.wall >= province.wallMax) continue;

    const inspector = state.inspectors[id];
    const repair = WALL_REPAIR * (1 + (inspector?.competence ?? 0) * WALL_REPAIR_PER_POINT);
    provinces[id] = { ...province, wall: Math.min(province.wallMax, province.wall + repair) };
    changed = true;
  }
  return changed ? { ...state, provinces } : state;
}

/**
 * 開発。朝廷が保っている州の戸口の豊かさが年ごとに伸びる。
 *
 * 江南はこの三百年で天下の穀倉に変わった。**これが無いと、
 * 北を失った朝廷は軍の維持費を払えず、東晋も宋も成立しない**
 * （実測では南渡した局がすべて数十年で軍の脱走から滅んだ）。
 * 伸びるのは実際に治めている州だけで、失った州は伸びない
 */
export function developProvinces(state: GameState): GameState {
  const capitalRegion = state.provinces[state.capital]?.region;
  const provinces = { ...state.provinces };

  for (const id of Object.keys(provinces) as ProvinceId[]) {
    const province = provinces[id];
    if (province.holder !== null || province.control <= 0) continue;
    if (province.baseTax >= province.baseTaxMax) continue;

    const rate =
      (province.region === 'south' ? DEVELOPMENT_RATE_SOUTH : DEVELOPMENT_RATE_NORTH) +
      (province.region === capitalRegion ? DEVELOPMENT_CAPITAL_BONUS : 0);
    provinces[id] = {
      ...province,
      // 荒れた州は開発も進まない。支配度がそのまま伸びに掛かる
      baseTax: Math.min(
        province.baseTaxMax,
        province.baseTax * (1 + rate * (province.control / 100)),
      ),
    };
  }
  return { ...state, provinces };
}

/**
 * 戸口の自然な戻り。逃散した戸が帳簿へ戻ってくる。
 *
 * 戻るのは平らかな年だけ。胡族が州に踏み込んでいるあいだは戻らない
 */
export function recoverHouseholds(state: GameState): GameState {
  if (state.taxBase >= TAX_BASE_MAX) return state;
  /*
   * 戻りは細いが、**止めない。**
   *
   * 「胡族が州に踏み込んでいない年だけ」に絞っていたときは、
   * この時代にそんな年はほとんど無く、戸口は終局まで 1 のまま張り付いた。
   * 戻りは失う量よりずっと小さい（州をひとつ失えば 2.5 減り、
   * 取り返すには十年近くかかる）ので、これで痩せなくなることはない
   */
  return { ...state, taxBase: clamp(state.taxBase + TAX_BASE_RECOVERY, 0, TAX_BASE_MAX) };
}

/**
 * 天命・士族の支持・宗室の帰順の自然減。
 *
 * 何もしなければ年ごとに削れていく。「機嫌を取る」手が
 * 死んだ選択肢にならないよう、放置には必ず代償を置く
 */
export function applyDecay(state: GameState): GameState {
  const ruler = state.dynasty.ruler.abilities;
  const marshalMilitary = state.marshal.holder?.competence ?? 0;

  const mandateDecay =
    MANDATE_DECAY -
    ruler.administration * ADMIN_DECAY_RELIEF +
    marshalMilitary * MARSHAL_DECAY_PER_POINT -
    // 都を保っているあいだは威信が下支えする
    (state.provinces[state.capital].holder === null ? CAPITAL_MANDATE_BONUS : 0);

  const gentryDecay =
    GENTRY_DECAY - (state.chancellor?.competence ?? 0) * CHANCELLOR_GENTRY_RELIEF;
  const loyaltyRelief = ruler.charisma * CHARISMA_LOYALTY_RELIEF;

  return {
    ...state,
    mandate: clamp100(state.mandate - Math.max(0, mandateDecay)),
    gentry: clamp100(state.gentry - Math.max(0, gentryDecay)),
    princeLoyalty: clamp100(state.princeLoyalty - Math.max(0, PRINCE_LOYALTY_DECAY - loyaltyRelief)),
  };
}

// ── 内政の手 ──────────────────────────────────────────

/** 増税。その年の収入が増えるが士族が離れる */
export function raiseTaxes(state: GameState): GameState {
  const extra = calculateIncome(state) * (RAISE_TAXES_MULTIPLIER - 1);
  return {
    ...state,
    treasury: state.treasury + extra,
    gentry: clamp100(state.gentry - RAISE_TAXES_GENTRY_LOSS),
    mandate: clamp100(state.mandate - RAISE_TAXES_MANDATE_LOSS),
  };
}

/**
 * 士族の機嫌を取る三手。**差し出すものがそれぞれ違う。**
 * どれか1つが常に得になってはいけない
 */

/** 免税特権の追認。戸口を恒久的に削って支持を買う */
export function confirmPrivilege(state: GameState): GameState {
  return {
    ...state,
    taxBase: clamp(state.taxBase - PRIVILEGE_TAX_BASE_LOSS, 0, TAX_BASE_MAX),
    gentry: clamp100(state.gentry + PRIVILEGE_GENTRY_GAIN),
    mandate: clamp100(state.mandate + PRIVILEGE_MANDATE_GAIN),
  };
}

/** 清談の会を催す。金で買う。国庫が空の年には選べない */
export function holdConversation(state: GameState): GameState {
  if (state.treasury < CONVERSATION_COST) return state;
  return {
    ...state,
    treasury: state.treasury - CONVERSATION_COST,
    gentry: clamp100(state.gentry + CONVERSATION_GENTRY_GAIN),
    mandate: clamp100(state.mandate + CONVERSATION_MANDATE_GAIN),
  };
}

/**
 * 郷品を授ける（九品官人法の上位の品）。
 *
 * 金も土地も要らない代わりに、**その年の栄誉は朝廷ではなくその家のものになる。**
 * 撃退の功を都督が持っていくのと同じ構図を、士族に対して作っている
 */
export function grantRank(state: GameState): GameState {
  return {
    ...state,
    gentry: clamp100(state.gentry + GRANT_RANK_GENTRY_GAIN),
    mandate: clamp100(state.mandate - GRANT_RANK_MANDATE_LOSS),
  };
}

/**
 * 流民を屯田に入れる。戸口を戻せる手のひとつ。
 *
 * 荒れた大土地を国家が接収して分け与えるので、その地を握っていた
 * 士族の支持を失う。免税特権の追認のちょうど逆向きの取引になる
 */
export function settleRefugees(state: GameState): GameState {
  if (state.treasury < SETTLE_COST) return state;
  if (state.taxBase >= TAX_BASE_MAX) return state;
  return {
    ...state,
    treasury: state.treasury - SETTLE_COST,
    gentry: clamp100(state.gentry - SETTLE_GENTRY_LOSS),
    taxBase: clamp(state.taxBase + SETTLE_TAX_BASE_GAIN, 0, TAX_BASE_MAX),
  };
}

/**
 * 土断。僑州僑郡の戸を土地に結び直す。
 *
 * **南渡したあとにだけ選べる。** 北から逃れてきた戸は僑郡の帳簿に
 * 載るだけで課役を負わなかった。それを現住の地に結び直すのが土断で、
 * 戸口は大きく戻るが、隠していた家の恨みを買う
 */
export function registerHouseholds(state: GameState): GameState {
  if (state.crossedSouthYear === null) return state;
  if (state.treasury < REGISTER_COST) return state;
  if (state.taxBase >= TAX_BASE_MAX) return state;
  return {
    ...state,
    treasury: state.treasury - REGISTER_COST,
    taxBase: clamp(state.taxBase + REGISTER_TAX_BASE_GAIN, 0, TAX_BASE_MAX),
    gentry: clamp100(state.gentry - REGISTER_GENTRY_LOSS),
  };
}

/** 都を移せる州か。都城の名を持ち、朝廷が保っている州だけ */
export function canMoveCapital(state: GameState, provinceId: ProvinceId): boolean {
  if (provinceId === state.capital) return false;
  if (CAPITAL_NAMES[provinceId] === undefined) return false;
  const province = state.provinces[provinceId];
  return province.holder === null && province.control > 30;
}

/** 遷都。迫られた都から逃れられるが、天命を失う */
export function moveCapital(state: GameState, provinceId: ProvinceId): GameState {
  if (!canMoveCapital(state, provinceId)) return state;
  if (state.treasury < MOVE_CAPITAL_COST) return state;
  return {
    ...state,
    treasury: state.treasury - MOVE_CAPITAL_COST,
    capital: provinceId,
    capitalName: CAPITAL_NAMES[provinceId] ?? '',
    mandate: clamp100(state.mandate - MOVE_CAPITAL_MANDATE_LOSS),
    turnEvents: [...state.turnEvents, 'capital_moved'],
  };
}
