import leadersData from '../data/leaders.json';
import { defenceStrength } from './battle';
import {
  CONTROL_LOSS_PER_ADVANTAGE,
  DEMAND_PROBABILITY,
  EXTERIOR_GROWTH_RATE,
  FACTION_COLLAPSE_DECAY_RATE,
  FOE_REPULSE_LOSS,
  INTERIOR_GROWTH_RATE,
  INVASION_BASE_PROBABILITY,
  KINGDOM_CONTROL_THRESHOLD,
  KINGDOM_PROBABILITY,
  MARSHAL_GLORY_PER_POINT,
  PROCLAIM_MANDATE_LOSS,
  WALL_LOSS_PER_ADVANTAGE,
  provincesToProclaim,
  MIN_STRENGTH_TO_ADVANCE,
  RAIDER_MAX_STRENGTH,
  REPULSE_MANDATE_GAIN,
  TAX_BASE_LOSS_PER_KINGDOM,
  TAX_BASE_LOSS_PER_PROVINCE,
  modifiersOf,
} from './constants';
import type {
  Abilities,
  Demand,
  DemandType,
  Faction,
  FactionId,
  GameState,
  ProvinceId,
  TurnModifiers,
} from './types';
import { clamp, clamp100, heldProvinceIds, pick } from './util';

interface LeaderEntry {
  name: string;
  from: number;
  to: number;
  military: number;
  administration: number;
  charisma: number;
}

const CHIEFTAINS = leadersData.chieftains as Record<string, LeaderEntry[]>;
const KINGDOM_NAMES = leadersData.kingdomNames as Record<string, string>;

/**
 * その年にその勢力を率いている首領。
 *
 * この模型は年ごとの戦力の推移を持たないので、**脅威の山と谷は
 * 開始戦力ではなく首領の能力で表す。** 石勒が河北を席巻した320年代、
 * 苻堅が華北をひとつにした370年代、拓跋燾が長江に迫った440年代は、
 * 同じ勢力でも別物の重さになる
 */
export function chieftainOf(
  factionId: FactionId,
  year: number,
): { name: string; abilities: Abilities } | null {
  const entries = CHIEFTAINS[factionId];
  if (entries === undefined) return null;
  const found = entries.find((entry) => year >= entry.from && year <= entry.to);
  if (found === undefined) return null;
  return {
    name: found.name,
    abilities: {
      military: found.military,
      administration: found.administration,
      charisma: found.charisma,
    },
  };
}

/** 名の伝わらない年の首長。三能力は民ごとに定まった並みの値にする */
export const DEFAULT_CHIEFTAIN_ABILITIES: Abilities = {
  military: 5,
  administration: 5,
  charisma: 5,
};

export function kingdomNameOf(factionId: FactionId): string {
  return KINGDOM_NAMES[factionId] ?? '';
}

/** 攻める側の戦力。首領の能力と難易度が掛かる */
function offenceStrength(state: GameState, faction: Faction): number {
  const chieftain = chieftainOf(faction.id, state.year);
  const leaderFactor = 1 + (chieftain?.abilities.military ?? 5) * 0.035;
  return faction.strength * leaderFactor * modifiersOf(state.difficulty).foePowerMultiplier;
}

/**
 * 胡族の手番。成長 → 移動 → 侵攻 → 建国 の順に解決する。
 *
 * 塞内に住む民（匈奴・羯・氐・羌…）は攻め戻る郷里を持たない。
 * **敵はすでに垣の内にいる**ので、移動の判定を経ずにその州を削り続ける
 */
export function applyFactionActions(
  state: GameState,
  rng: () => number,
  modifiers: TurnModifiers,
): GameState {
  let next = growFactions(state);
  next = moveFactions(next, rng);
  next = resolveInvasions(next, rng, modifiers);
  next = foundKingdoms(next, rng);
  return next;
}

/** 成長と、頂点を過ぎた勢力の崩れ */
function growFactions(state: GameState): GameState {
  const factions = { ...state.factions };
  for (const id of Object.keys(factions) as FactionId[]) {
    const faction = factions[id];
    if (faction.stance === 'enfeoffed') continue;

    let strength = faction.strength;
    if (faction.collapseYear !== null && state.year > faction.collapseYear) {
      // 頂点のあとは砕ける。これが無いと開始戦力のまま何百年も居座る
      strength *= 1 - FACTION_COLLAPSE_DECAY_RATE;
    } else {
      const rate = faction.interior ? INTERIOR_GROWTH_RATE : EXTERIOR_GROWTH_RATE;
      strength *= 1 + rate;
      // その民が史実で届いた高さを超えない
      strength = Math.min(strength, faction.strengthMax);
      // 掠めるだけの民は塞外で育てる上限がさらに低い
      if (faction.raider) strength = Math.min(strength, RAIDER_MAX_STRENGTH);
    }
    factions[id] = { ...faction, strength: Math.max(1, strength) };
  }
  return { ...state, factions };
}

/**
 * 勢力が次に攻める州を選ぶ。
 *
 * いま削っている州がまだ朝廷の手にあるなら、そこに留まって削り続ける。
 * 落とし切ったか、まだどこにも出ていない民だけが次の州を選ぶ。
 *
 * **選べるのは `reach` に載っている州だけ。** 地理を無視して天下じゅうから
 * 弱い州を選ばせていたときは、遼東の慕容部が蜀を取る局が出た
 */
function moveFactions(state: GameState, rng: () => number): GameState {
  const held = new Set(heldProvinceIds(state));
  const factions = { ...state.factions };

  for (const id of Object.keys(factions) as FactionId[]) {
    const faction = factions[id];
    if (faction.stance !== 'hostile') continue;
    if (faction.location !== 'exterior' && held.has(faction.location as ProvinceId)) continue;
    if (faction.strength < MIN_STRENGTH_TO_ADVANCE) continue;

    const targets = faction.reach.filter((provinceId) => held.has(provinceId));
    if (targets.length === 0) {
      // 出られる先が無い。塞外の民はいったん引き揚げる
      if (!faction.interior && faction.location !== 'exterior') {
        factions[id] = { ...faction, location: 'exterior' };
      }
      continue;
    }

    // 手の届く州のうち、守りが薄く豊かなところから狙う
    const scored = targets.map((provinceId) => {
      const province = state.provinces[provinceId];
      const defence = defenceStrength(state, provinceId, new Set());
      return { provinceId, score: province.baseTax / Math.max(8, defence) };
    });
    scored.sort((a, b) => b.score - a.score);
    const shortlist = scored.slice(0, 3).map((s) => s.provinceId);
    const chosen = pick(rng, shortlist);
    if (chosen === null) continue;

    if (rng() < INVASION_BASE_PROBABILITY + (100 - state.mandate) / 260) {
      factions[id] = { ...faction, location: chosen };
    }
  }
  return { ...state, factions };
}

/** 州に踏み込んでいる勢力との戦闘解決 */
function resolveInvasions(
  state: GameState,
  rng: () => number,
  modifiers: TurnModifiers,
): GameState {
  let next = state;
  const provinces = { ...next.provinces };
  const factions = { ...next.factions };
  let mandateGain = 0;

  for (const id of Object.keys(factions) as FactionId[]) {
    const faction = factions[id];
    if (faction.stance !== 'hostile') continue;
    if (faction.location === 'exterior') continue;
    // 要求を飲んで宥めた相手はその年は動かない
    if (modifiers.pacified.has(id)) continue;

    const provinceId = faction.location as ProvinceId;
    const province = provinces[provinceId];
    if (province === undefined || province.holder !== null) continue;

    const attack = offenceStrength(next, faction);
    const defence = defenceStrength(
      { ...next, provinces, factions },
      provinceId,
      modifiers.reinforced,
    );
    const total = attack + defence;
    const advantage = total <= 0 ? 0 : (attack - defence) / total;

    if (advantage > 0) {
      /*
       * 支配度が残っているうちは野を削り、尽きてはじめて城を攻める。
       * **州は城が落ちるまで手放さない**
       */
      const control = clamp100(province.control - advantage * CONTROL_LOSS_PER_ADVANTAGE);
      const wall =
        control > 0
          ? province.wall
          : Math.max(0, province.wall - advantage * WALL_LOSS_PER_ADVANTAGE);
      provinces[provinceId] = {
        ...province,
        control,
        wall,
        garrison: Math.max(0, province.garrison * (1 - advantage * 0.35)),
      };
      // 城を攻めている者を控える。落ちたときに誰の手へ渡るかをここから引く
      modifiers.besieged.set(provinceId, id);
      // 掠めるだけの民は、奪ったその年のうちに塞外へ引き揚げる
      if (faction.raider) factions[id] = { ...faction, location: 'exterior' };
    } else {
      // 撃退。相手は戦力を失い、塞外の民は引き揚げる
      factions[id] = {
        ...faction,
        strength: faction.strength * (1 - FOE_REPULSE_LOSS),
        location: faction.interior ? faction.location : 'exterior',
      };
      // 有能な都督ほど、撃退の功は将のものになって朝廷には入らない
      const marshal = next.marshal.holder?.competence ?? 0;
      mandateGain += Math.max(0, REPULSE_MANDATE_GAIN - marshal * MARSHAL_GLORY_PER_POINT);
    }
  }

  next = { ...next, provinces, factions, mandate: clamp100(next.mandate + mandateGain) };
  return applyProvinceLosses(next, modifiers);
}

/**
 * 城が落ちた州はその年に攻めていた者の手へ渡る。
 *
 * **攻めた者がいなければ落ちない。** 誰が城を攻めたかを見ずに
 * 「支配度が尽きた州は北朝のもの」としていたときは、嶺南の交州が
 * 内から荒れただけで北朝領になる局が出た
 */
export function applyProvinceLosses(state: GameState, modifiers: TurnModifiers): GameState {
  let next = state;
  const provinces = { ...next.provinces };
  let taxBaseLoss = 0;
  let mandateLoss = 0;
  let cityFell = false;

  for (const id of Object.keys(provinces) as ProvinceId[]) {
    const province = provinces[id];
    if (province.holder !== null) continue;
    if (province.control > 0 || province.wall > 0) continue;

    // その年に城を攻めていた者。いなければ踏み込んでいる勢力のうち最も強い者
    const besieger = modifiers.besieged.get(id);
    const claimant =
      besieger ??
      Object.values(next.factions)
        .filter((f) => f.stance === 'hostile' && f.location === id)
        .sort((a, b) => b.strength - a.strength)[0]?.id;

    if (claimant === undefined) {
      // 攻めた者がいない。城は荒れたまま朝廷に残る
      provinces[id] = { ...province, control: 1, wall: Math.max(1, province.wallMax * 0.15) };
      continue;
    }
    provinces[id] = { ...province, control: 0, wall: 0, holder: claimant };
    taxBaseLoss += TAX_BASE_LOSS_PER_PROVINCE;
    mandateLoss += 4;
    cityFell = true;
  }

  if (cityFell) next = { ...next, turnEvents: [...next.turnEvents, 'city_fell'] };

  if (taxBaseLoss === 0) return next;
  return {
    ...next,
    provinces,
    taxBase: clamp(next.taxBase - taxBaseLoss, 0, 100),
    mandate: clamp100(next.mandate - mandateLoss),
  };
}

/**
 * 建国。支配度を奪い切った勢力は、そこに自らの国を建てる。
 *
 * 五胡十六国はこうして生まれた。敵ではなくなる代わりに、
 * その地の戸口は永久に失われる
 */
function foundKingdoms(state: GameState, rng: () => number): GameState {
  const factions = { ...state.factions };
  let taxBase = state.taxBase;
  let mandate = state.mandate;
  let changed = false;

  for (const id of Object.keys(factions) as FactionId[]) {
    const faction = factions[id];
    if (faction.stance !== 'hostile') continue;
    if (faction.raider) continue;
    if (faction.location === 'exterior') continue;

    const province = state.provinces[faction.location as ProvinceId];
    if (province === undefined) continue;
    /*
     * **実際にその州を奪い切った勢力だけが国を建てられる。**
     *
     * 「支配度が閾値を割っていれば」でも建てられるようにしていたときは、
     * 朝廷がまだ握っている州の上に国が建った。建国した勢力は敵ではなくなるので
     * 攻められもせず州も渡さない只の和平になり、1局に11か国が並んで
     * 天下統一が永久に成立しなくなった（統一は敵国が残らないことを要する）
     */
    if (province.holder !== id) continue;
    if (province.control > KINGDOM_CONTROL_THRESHOLD) continue;
    if (rng() >= KINGDOM_PROBABILITY) continue;

    factions[id] = {
      ...faction,
      stance: 'enfeoffed',
      foundedYear: state.year,
      kingdomName: kingdomNameOf(id),
    };
    taxBase -= TAX_BASE_LOSS_PER_KINGDOM;
    mandate -= 3;
    changed = true;
  }

  if (!changed) return state;
  return { ...state, factions, taxBase: clamp(taxBase, 0, 100), mandate: clamp100(mandate) };
}

/**
 * 帝を称する。
 *
 * **野心が高い民は一州を得ただけで帝号を称し、低い民も三州で必ず称する。**
 * 劉淵は并州の一角で漢王を称し、石勒も襄国ひとつから趙王を名乗った。
 * 称された時点で朝廷の天命は削られる — 天下に帝が二人いることになるため
 */
export function checkProclamations(state: GameState): GameState {
  const held = new Map<FactionId, number>();
  for (const province of Object.values(state.provinces)) {
    const holder = province.holder;
    if (holder === null || holder === 'north' || holder === 'prince') continue;
    held.set(holder, (held.get(holder) ?? 0) + 1);
  }

  const factions = { ...state.factions };
  let mandateLoss = 0;
  let proclaimed = false;

  for (const [id, count] of held) {
    const faction = factions[id];
    if (faction === undefined || faction.proclaimedYear !== null) continue;
    if (count < provincesToProclaim(faction.ambition)) continue;

    const chieftain = chieftainOf(id, state.year);
    factions[id] = {
      ...faction,
      proclaimedYear: state.year,
      // 名の伝わらない年に称した帝は null。呼び名は表示側が補う
      emperorName: chieftain?.name ?? null,
      kingdomName: faction.kingdomName ?? kingdomNameOf(id),
    };
    mandateLoss += PROCLAIM_MANDATE_LOSS;
    proclaimed = true;
  }

  if (!proclaimed) return state;
  return {
    ...state,
    factions,
    mandate: clamp100(state.mandate - mandateLoss),
    turnEvents: [...state.turnEvents, 'faction_proclaimed'],
  };
}

/**
 * 州に居座る勢力は要求を突きつける。
 *
 * 相手の手番で出るので、答えられるのは翌年になる
 */
export function updateDemands(state: GameState, rng: () => number): GameState {
  const factions = { ...state.factions };
  let changed = false;

  for (const id of Object.keys(factions) as FactionId[]) {
    const faction = factions[id];
    if (faction.stance !== 'hostile') continue;
    if (faction.location === 'exterior') {
      if (faction.demand !== null) {
        factions[id] = { ...faction, demand: null };
        changed = true;
      }
      continue;
    }
    if (faction.demand !== null) continue;
    if (rng() >= DEMAND_PROBABILITY) continue;

    const types: DemandType[] = ['gold', 'land', 'title'];
    const type = pick(rng, types) ?? 'gold';
    const demand: Demand = {
      type,
      amount: type === 'gold' ? Math.round(faction.strength * 2.4) : 0,
      targetProvince: type === 'land' ? (faction.location as ProvinceId) : undefined,
    };
    factions[id] = { ...faction, demand };
    changed = true;
  }

  return changed ? { ...state, factions } : state;
}
