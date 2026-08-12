import {
  ABDICATION_MIN_INTERVAL,
  ARMY_COLLAPSE_THRESHOLD,
  CONSCRIPT_COST,
  CONSCRIPT_TAX_BASE_LOSS,
  CONSCRIPT_TROOPS,
  DEFEND_COST,
  DEFEND_GARRISON_GAIN,
  DEPLOY_ATTRITION,
  DESERTION_MANDATE_LOSS,
  DESERTION_PER_DEFICIT,
  EXPEDITION_NORTH_SHARE,
  EXPEDITION_RECOVERED_CONTROL,
  PROVINCE_RECRUIT_CONTROL_LOSS,
  PROVINCE_RECRUIT_COST,
  PROVINCE_RECRUIT_GARRISON_SHARE,
  PROVINCE_RECRUIT_PER_BASE_TAX,
  REORGANIZE_COST,
  REORGANIZE_GARRISON_SHARE,
  SUPPRESS_ARMY_SHARE,
  SUPPRESS_MANDATE_GAIN,
  TAX_BASE_MAX,
  USURPATION_BASE,
  USURPATION_MARSHAL_PER_POINT,
  USURPATION_THRESHOLD,
  WALL_REPAIR_ACTION,
} from './constants';
import { defenceStrength } from './battle';
import type { GameState, ProvinceId } from './types';
import { clamp, clamp100, heldProvinces } from './util';

/**
 * 国庫が負なら中軍から兵が脱走する。
 * 給を払えない軍は散る、という循環の罠の入口
 */
export function applyDesertion(state: GameState): GameState {
  if (state.treasury >= 0) return state;
  const deficit = -state.treasury;
  const lost = Math.min(state.centralArmy, deficit * DESERTION_PER_DEFICIT);
  if (lost <= 0) return state;
  return {
    ...state,
    centralArmy: Math.max(0, state.centralArmy - lost),
    treasury: 0,
    mandate: clamp100(state.mandate - DESERTION_MANDATE_LOSS),
    turnEvents: [...state.turnEvents, 'army_deserted'],
  };
}

/** 中軍を差し向けた年の損耗。行軍そのものが兵を減らす */
export function applyDeployAttrition(state: GameState): GameState {
  return { ...state, centralArmy: state.centralArmy * (1 - DEPLOY_ATTRITION) };
}

/** 州の守りを固める */
export function reinforceGarrison(state: GameState, provinceId: ProvinceId): GameState {
  const province = state.provinces[provinceId];
  if (province === undefined || province.holder !== null) return state;
  if (state.treasury < DEFEND_COST) return state;
  return {
    ...state,
    treasury: state.treasury - DEFEND_COST,
    provinces: {
      ...state.provinces,
      [provinceId]: {
        ...province,
        garrison: province.garrison + DEFEND_GARRISON_GAIN,
        // 兵を入れるついでに城も繕う
        wall: Math.min(province.wallMax, province.wall + WALL_REPAIR_ACTION),
      },
    },
  };
}

/** 徴募。金で一律の兵を買う。どの州を持っていても同じだけ増える */
export function conscript(state: GameState): GameState {
  if (state.treasury < CONSCRIPT_COST) return state;
  return {
    ...state,
    treasury: state.treasury - CONSCRIPT_COST,
    centralArmy: state.centralArmy + CONSCRIPT_TROOPS,
    taxBase: clamp(state.taxBase - CONSCRIPT_TAX_BASE_LOSS, 0, TAX_BASE_MAX),
  };
}

/**
 * 州で募兵する。**その土地から兵を取る。**
 *
 * 費用は一律だが得られる兵は「戸口の豊かさ × 支配度」に比例する。
 * 豊かで落ち着いた州ほど兵が出るので、州を失えば兵の出どころそのものが減る。
 * 循環の罠を、徴募の側からも触れる形にしてある
 */
export function recruitInProvince(state: GameState, provinceId: ProvinceId): GameState {
  const province = state.provinces[provinceId];
  if (province === undefined || province.holder !== null) return state;
  if (state.treasury < PROVINCE_RECRUIT_COST) return state;

  const raised = province.baseTax * province.control * PROVINCE_RECRUIT_PER_BASE_TAX;
  const toGarrison = raised * PROVINCE_RECRUIT_GARRISON_SHARE;
  return {
    ...state,
    treasury: state.treasury - PROVINCE_RECRUIT_COST,
    centralArmy: state.centralArmy + (raised - toGarrison),
    provinces: {
      ...state.provinces,
      [provinceId]: {
        ...province,
        garrison: province.garrison + toGarrison,
        control: clamp100(province.control - PROVINCE_RECRUIT_CONTROL_LOSS),
      },
    },
  };
}

/**
 * 軍の再編。**兵は生まれない。** 州兵から中軍への再配分。
 *
 * 単価の調整では発火頻度の差を覆せなかったので、
 * 「兵力は保てるが州が痩せる」取引に作り替えてある
 */
export function reorganizeArmy(state: GameState): GameState {
  if (state.treasury < REORGANIZE_COST) return state;
  const held = heldProvinces(state);
  if (held.length === 0) return state;

  const provinces = { ...state.provinces };
  let moved = 0;
  for (const province of held) {
    const taken = province.garrison * REORGANIZE_GARRISON_SHARE;
    moved += taken;
    provinces[province.id] = { ...province, garrison: province.garrison - taken };
  }
  return {
    ...state,
    treasury: state.treasury - REORGANIZE_COST,
    provinces,
    centralArmy: state.centralArmy + moved,
  };
}

// ── 北伐 ──────────────────────────────────────────────

/** 取り返しに挑める州か。朝廷の手を離れていて、隣に足場がある州 */
export function canRecoverProvince(state: GameState, provinceId: ProvinceId): boolean {
  const province = state.provinces[provinceId];
  if (province === undefined || province.holder === null) return false;
  // 主力を出せない朝廷は北伐そのものを企てられない
  return state.centralArmy > ARMY_COLLAPSE_THRESHOLD * 3;
}

/**
 * 北伐。失われた州を取り返す。
 *
 * 桓温も劉裕もこれを繰り返した。守る側は「その州を握る者の力 ＋ 州兵」で、
 * 中軍の大半を投じても届かないことのほうが多い。
 * **拡大はこの朝廷には本来ずっと重い**、という主題をここに置く
 */
export function recoverProvince(
  state: GameState,
  provinceId: ProvinceId,
  rng: () => number,
): GameState {
  if (!canRecoverProvince(state, provinceId)) return state;
  const province = state.provinces[provinceId];

  const attacking = state.centralArmy * EXPEDITION_NORTH_SHARE;
  const holder = province.holder;
  const defending =
    province.garrison +
    (holder === 'north'
      ? (state.north?.strength ?? 0) * 0.55
      : holder === 'prince' || holder === null
        ? 0
        : (state.factions[holder]?.strength ?? 0) * 0.6);

  const total = attacking + defending;
  const winChance = total <= 0 ? 0 : attacking / total;
  const won = rng() < winChance;

  // 攻めた側は勝っても負けても兵を失う。負けたほうが重い
  const losses = attacking * (won ? 0.3 : 0.6);
  const next: GameState = {
    ...state,
    centralArmy: Math.max(0, state.centralArmy - losses),
  };
  if (!won) {
    return { ...next, mandate: clamp100(next.mandate - 4) };
  }

  // 取り返した州は荒れている。支配度は低いところから始まる
  const factions = { ...next.factions };
  if (holder !== null && holder !== 'north' && holder !== 'prince') {
    const faction = factions[holder];
    if (faction) {
      factions[holder] = {
        ...faction,
        strength: faction.strength * 0.6,
        stance: 'hostile',
        location: 'exterior',
        foundedYear: null,
        kingdomName: null,
      };
    }
  }
  return {
    ...next,
    factions,
    north:
      holder === 'north' && next.north
        ? { ...next.north, strength: next.north.strength * 0.82 }
        : next.north,
    provinces: {
      ...next.provinces,
      [provinceId]: {
        ...province,
        holder: null,
        control: EXPEDITION_RECOVERED_CONTROL,
        wall: Math.max(8, province.wallMax * 0.35),
        garrison: Math.max(6, province.garrison * 0.4),
      },
    },
    mandate: clamp100(next.mandate + 9),
  };
}

// ── 諸王の討伐 ────────────────────────────────────────

/** 挙兵した王を討つ */
export function suppressPrince(
  state: GameState,
  princeId: string,
  rng: () => number,
): GameState {
  const prince = state.princes.find((p) => p.id === princeId && p.inRevolt);
  if (prince === undefined) return state;

  const attacking = state.centralArmy * SUPPRESS_ARMY_SHARE;
  const defending = prince.troops * 1.15;
  const total = attacking + defending;
  const won = rng() < (total <= 0 ? 0 : attacking / total);

  const losses = attacking * (won ? 0.22 : 0.5);
  const next: GameState = { ...state, centralArmy: Math.max(0, state.centralArmy - losses) };

  if (!won) {
    return {
      ...next,
      princes: next.princes.map((p) =>
        p.id === princeId ? { ...p, troops: p.troops * 0.85 } : p,
      ),
      mandate: clamp100(next.mandate - 5),
    };
  }

  const province = next.provinces[prince.province];
  return {
    ...next,
    princes: next.princes.filter((p) => p.id !== princeId),
    retiredPrinceIds: [...next.retiredPrinceIds, princeId],
    provinces:
      province && province.holder === 'prince'
        ? {
            ...next.provinces,
            [prince.province]: { ...province, holder: null, control: Math.max(20, province.control) },
          }
        : next.provinces,
    mandate: clamp100(next.mandate + SUPPRESS_MANDATE_GAIN),
    turnEvents: [...next.turnEvents, 'prince_suppressed'],
  };
}

// ── 簒奪 ──────────────────────────────────────────────

/**
 * 簒奪の判定。天命が閾値を割った年に引く。
 *
 * 都督が有能なほど確率は上がる。実権を握る者がいるということは、
 * 位を奪える者がいるということでもある
 */
export function checkUsurpation(state: GameState, rng: () => number): boolean {
  if (state.mandate >= USURPATION_THRESHOLD) return false;
  // 立ったばかりの家からは位が渡らない
  if (state.year - state.dynasty.foundedYear < ABDICATION_MIN_INTERVAL) return false;
  const pressure = (USURPATION_THRESHOLD - state.mandate) / USURPATION_THRESHOLD;
  const marshal = state.marshal.holder?.competence ?? 0;
  const chance = USURPATION_BASE * (1 + pressure * 4) + marshal * USURPATION_MARSHAL_PER_POINT;
  return rng() < chance;
}

/** 州の守りの強さ。UI の表示と戦闘解決の両方がここを引く */
export function garrisonPower(state: GameState, provinceId: ProvinceId): number {
  return defenceStrength(state, provinceId, new Set());
}
