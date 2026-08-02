/**
 * 東ローマ帝国とサーサーン朝ペルシア。
 *
 * 史実シナリオ(`historical`)では東は属州も軍も持たず、
 * 従来どおり `eastRelations` という数値としてだけ働く。
 * この系統が動くのは統一シナリオ(`reunification`)だけで、
 * 史実側の調整済みバランスには一切影響させない。
 */

import {
  COMBAT_RANDOMNESS,
  CONTROL_RECOVERY_PER_TURN,
  DEFENSE_MULTIPLIER,
  EAST_ARMY_GROWTH_RATE,
  EAST_ARMY_LOSS_FACTOR,
  EAST_CONQUEST_CONTROL,
  EAST_COUNTERATTACK_PROBABILITY,
  EAST_DECLARE_WAR_LEGITIMACY_LOSS,
  EAST_DECLARE_WAR_SENATE_LOSS,
  EAST_DEFENSE_ARMY_SHARE,
  EAST_IMPROVE_COST,
  EAST_IMPROVE_RELATIONS_GAIN,
  EAST_INVADE_ARMY_SHARE,
  EAST_INVADE_ATTRITION_RATE,
  EAST_INVADE_CONTROL_DAMAGE,
  EAST_PEACE_MIN_WAR_YEARS,
  EAST_PEACE_RELATIONS,
  EAST_WAR_LEGITIMACY_DRAIN,
  MAX_CONTROL,
  MAX_EAST_RELATIONS,
  MAX_LEGITIMACY,
  MAX_SENATE_SUPPORT,
  MIN_CONTROL,
  MIN_EAST_RELATIONS,
  MIN_LEGITIMACY,
  MIN_SENATE_SUPPORT,
  PERSIA_ATTACK_CONTROL_DAMAGE,
  PERSIA_ATTACK_PROBABILITY,
  PERSIA_ATTACK_SHARE,
  PERSIA_DEFENSE_SHARE,
  PERSIA_GROWTH_RATE,
  PERSIA_HOLD_CONTROL,
  PERSIA_INTERVENTION_PROBABILITY,
  PERSIA_LOSS_FACTOR,
  PERSIA_MIN_WAR_YEARS,
  PERSIA_SEIZE_CONTROL_THRESHOLD,
  PERSIA_SEIZE_STRENGTH_GAIN,
  WEST_ARMY_LOSS_FACTOR,
} from './constants';
import { diplomacyModifier, militaryModifier } from './dynasty';
import { generalDefenseModifier } from './general';
import { resolveCombat } from './military';
import type { EastProvince, EastProvinceId, GameState } from './types';
import { clamp } from './util';

function randomizedPower(base: number, rng: () => number): number {
  return base * (1 + (rng() * 2 - 1) * COMBAT_RANDOMNESS);
}

/** 統一シナリオかどうか。史実シナリオではこの系統を丸ごと素通りさせる */
export function isReunification(state: GameState): boolean {
  return state.scenario === 'reunification';
}

/**
 * 東への修好。使者と贈り物で関係を戻す。
 * 交渉能力が高い君主ほど同じ金額で多く戻せる
 */
export function improveEastRelations(state: GameState): GameState {
  if (state.treasury < EAST_IMPROVE_COST) return state;
  // 交戦中に贈り物は通らない
  if (state.east.stance === 'war') return state;
  return {
    ...state,
    treasury: state.treasury - EAST_IMPROVE_COST,
    eastRelations: clamp(
      state.eastRelations + EAST_IMPROVE_RELATIONS_GAIN * diplomacyModifier(state),
      MIN_EAST_RELATIONS,
      MAX_EAST_RELATIONS,
    ),
  };
}

/** 東ローマに宣戦する。ローマ人同士の戦なので正統性と元老院支持を先払いする */
export function declareWarOnEast(state: GameState, year: number): GameState {
  if (!isReunification(state)) return state;
  if (state.east.stance === 'war') return state;
  return {
    ...state,
    eastRelations: MIN_EAST_RELATIONS,
    legitimacy: clamp(
      state.legitimacy - EAST_DECLARE_WAR_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    senateSupport: clamp(
      state.senateSupport - EAST_DECLARE_WAR_SENATE_LOSS,
      MIN_SENATE_SUPPORT,
      MAX_SENATE_SUPPORT,
    ),
    east: { ...state.east, stance: 'war', warStartYear: year },
    turnEvents: [...state.turnEvents, 'east_war_declared'],
  };
}

/** 講和。奪った属州は保持したまま戦端だけ閉じる */
export function makePeaceWithEast(state: GameState): GameState {
  const { east } = state;
  if (east.stance !== 'war' || east.warStartYear === null) return state;
  if (state.year - east.warStartYear < EAST_PEACE_MIN_WAR_YEARS) return state;
  return {
    ...state,
    eastRelations: EAST_PEACE_RELATIONS,
    east: { ...east, stance: 'peace', warStartYear: null },
    turnEvents: [...state.turnEvents, 'east_peace'],
  };
}

/**
 * 東方属州への侵攻。
 * 西の野戦軍を遠征に振り向け、支配度を削り、0まで落とすと自分のものになる
 */
export function invadeEastProvince(
  state: GameState,
  provinceId: EastProvinceId,
  rng: () => number,
): GameState {
  const { east } = state;
  if (east.stance !== 'war') return state;
  const index = east.provinces.findIndex((p) => p.id === provinceId);
  if (index < 0) return state;
  const target = east.provinces[index];
  if (target.owner === 'west') return state;

  const attacker = randomizedPower(
    state.fieldArmy * EAST_INVADE_ARMY_SHARE * militaryModifier(state),
    rng,
  );
  // 守る側が誰かで防御戦力が変わる。ペルシアが握っている属州は固い
  const defenseBase =
    target.owner === 'persia'
      ? target.garrison + state.persia.strength * PERSIA_DEFENSE_SHARE
      : target.garrison + east.army * EAST_DEFENSE_ARMY_SHARE;
  const defender = randomizedPower(defenseBase * DEFENSE_MULTIPLIER, rng);

  const { attackerWins, margin } = resolveCombat(attacker, defender);
  const provinces = [...east.provinces];
  const turnEvents = [...state.turnEvents];
  let fieldArmy = state.fieldArmy * (1 - EAST_INVADE_ATTRITION_RATE);
  let eastArmy = east.army;
  let persiaStrength = state.persia.strength;
  let seized = state.persia.seizedProvinces;

  if (attackerWins) {
    const control = clamp(
      target.control - EAST_INVADE_CONTROL_DAMAGE,
      MIN_CONTROL,
      MAX_CONTROL,
    );
    if (target.owner === 'persia') {
      persiaStrength = Math.max(0, persiaStrength - margin * PERSIA_LOSS_FACTOR);
    } else {
      eastArmy = Math.max(0, eastArmy - margin * EAST_ARMY_LOSS_FACTOR);
    }

    if (control <= MIN_CONTROL) {
      // 征服。奪ったばかりの土地なので支配度は低いところから始まる
      provinces[index] = {
        ...target,
        owner: 'west',
        control: EAST_CONQUEST_CONTROL,
        garrison: 0,
      };
      seized = seized.filter((id) => id !== target.id);
      turnEvents.push('east_province_taken');
    } else {
      provinces[index] = {
        ...target,
        control,
        garrison: Math.max(0, target.garrison - margin * EAST_ARMY_LOSS_FACTOR),
      };
    }
  } else {
    fieldArmy = Math.max(0, fieldArmy - margin * WEST_ARMY_LOSS_FACTOR);
  }

  return {
    ...state,
    fieldArmy,
    east: { ...east, army: eastArmy, provinces },
    persia: { ...state.persia, strength: persiaStrength, seizedProvinces: seized },
    turnEvents,
  };
}

/**
 * 東ローマの手番。交戦中なら攻め返してくる。
 * 西が奪った東方属州を取り返しに来る
 */
function eastCounterattack(state: GameState, rng: () => number): GameState {
  const { east } = state;
  if (east.stance !== 'war') return state;
  if (rng() >= EAST_COUNTERATTACK_PROBABILITY) return state;

  // 取り返す相手は、西が握っている東方属州のうち最も支配度が低いもの
  const targets = east.provinces
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.owner === 'west')
    .sort((a, b) => a.p.control - b.p.control);
  if (targets.length === 0) return state;

  const { p: target, i: index } = targets[0];
  const attacker = randomizedPower(east.army * EAST_DEFENSE_ARMY_SHARE, rng);
  const defender = randomizedPower(
    (target.garrison + state.fieldArmy * EAST_INVADE_ARMY_SHARE) *
      DEFENSE_MULTIPLIER *
      militaryModifier(state) *
      generalDefenseModifier(state),
    rng,
  );
  const { attackerWins, margin } = resolveCombat(attacker, defender);

  const provinces = [...east.provinces];
  const turnEvents = [...state.turnEvents];
  if (attackerWins) {
    const control = clamp(
      target.control - EAST_INVADE_CONTROL_DAMAGE,
      MIN_CONTROL,
      MAX_CONTROL,
    );
    if (control <= MIN_CONTROL) {
      provinces[index] = { ...target, owner: 'east', control: EAST_CONQUEST_CONTROL };
      turnEvents.push('east_province_lost');
    } else {
      provinces[index] = { ...target, control };
    }
    return {
      ...state,
      fieldArmy: Math.max(0, state.fieldArmy - margin * WEST_ARMY_LOSS_FACTOR),
      east: { ...east, provinces },
      turnEvents,
    };
  }

  return {
    ...state,
    east: { ...east, army: Math.max(0, east.army - margin * EAST_ARMY_LOSS_FACTOR) },
  };
}

/**
 * ペルシアの手番。
 *
 * ローマ同士が交戦している年に介入を始める。いったん動き出すと
 * 講和しても引かない。東方属州を次々に奪い、奪うたびに強くなる。
 * 統一の最後の関門になる
 */
function persianTurn(state: GameState, rng: () => number): GameState {
  const { persia, east } = state;

  if (!persia.intervened) {
    // ローマ同士が潰し合っている隙にだけ動き出す
    if (east.stance !== 'war' || east.warStartYear === null) return state;
    // 緒戦のうちは静観する。内戦が長引いたのを見てから動く
    if (state.year - east.warStartYear < PERSIA_MIN_WAR_YEARS) return state;
    if (rng() >= PERSIA_INTERVENTION_PROBABILITY) return state;

    /*
     * 介入は宣言だけで終わらせず、その年のうちに橋頭堡を確保させる。
     *
     * 確率的に削るだけにしていたときは、西が東を平らげるほうが速く、
     * 統一した58局のうちペルシアと属州を争ったのは2局しかなかった。
     * それではラスボスではなく、間に合えば無視できる背景になる。
     * 介入した時点で必ず1州を握らせ、統一するなら必ず
     * ペルシアを打ち破らなければならない形にする
     */
    const beachhead = east.provinces
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.owner !== 'persia')
      .sort((a, b) => a.p.control - b.p.control)[0];
    if (beachhead === undefined) {
      return {
        ...state,
        persia: { ...persia, intervened: true, interventionYear: state.year },
        turnEvents: [...state.turnEvents, 'persia_intervened'],
      };
    }
    const provinces = [...east.provinces];
    provinces[beachhead.i] = {
      ...beachhead.p,
      owner: 'persia',
      control: PERSIA_HOLD_CONTROL,
    };
    return {
      ...state,
      east: { ...east, provinces },
      persia: {
        ...persia,
        intervened: true,
        interventionYear: state.year,
        strength: persia.strength + PERSIA_SEIZE_STRENGTH_GAIN,
        seizedProvinces: [...persia.seizedProvinces, beachhead.p.id],
      },
      turnEvents: [...state.turnEvents, 'persia_intervened'],
    };
  }

  const grown = persia.strength * (1 + PERSIA_GROWTH_RATE);
  if (rng() >= PERSIA_ATTACK_PROBABILITY) {
    return { ...state, persia: { ...persia, strength: grown } };
  }

  // 狙うのはペルシアの持ち物でない東方属州のうち、最も支配度が低いもの
  const targets = east.provinces
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.owner !== 'persia')
    .sort((a, b) => a.p.control - b.p.control);
  if (targets.length === 0) return { ...state, persia: { ...persia, strength: grown } };

  const { p: target, i: index } = targets[0];
  const attacker = randomizedPower(grown * PERSIA_ATTACK_SHARE, rng);
  // 西が持っている属州は西の野戦軍が、東の属州は東の軍が守る
  const defenseBase =
    target.owner === 'west'
      ? target.garrison + state.fieldArmy * EAST_INVADE_ARMY_SHARE
      : target.garrison + east.army * EAST_DEFENSE_ARMY_SHARE;
  const defenderModifier =
    target.owner === 'west' ? militaryModifier(state) * generalDefenseModifier(state) : 1;
  const defender = randomizedPower(defenseBase * DEFENSE_MULTIPLIER * defenderModifier, rng);

  const { attackerWins, margin } = resolveCombat(attacker, defender);
  if (!attackerWins) {
    return {
      ...state,
      persia: { ...persia, strength: Math.max(0, grown - margin * PERSIA_LOSS_FACTOR) },
    };
  }

  const provinces = [...east.provinces];
  const turnEvents = [...state.turnEvents];
  let fieldArmy = state.fieldArmy;
  let eastArmy = east.army;
  let seized = persia.seizedProvinces;
  let strength = grown;

  const control = clamp(
    target.control - PERSIA_ATTACK_CONTROL_DAMAGE,
    MIN_CONTROL,
    MAX_CONTROL,
  );
  if (target.owner === 'west') {
    fieldArmy = Math.max(0, fieldArmy - margin * WEST_ARMY_LOSS_FACTOR);
  } else {
    eastArmy = Math.max(0, eastArmy - margin * EAST_ARMY_LOSS_FACTOR);
  }

  if (control <= PERSIA_SEIZE_CONTROL_THRESHOLD) {
    provinces[index] = { ...target, owner: 'persia', control: PERSIA_HOLD_CONTROL };
    seized = seized.includes(target.id) ? seized : [...seized, target.id];
    strength += PERSIA_SEIZE_STRENGTH_GAIN;
    turnEvents.push('persia_offensive');
  } else {
    provinces[index] = { ...target, control };
  }

  return {
    ...state,
    fieldArmy,
    east: { ...east, army: eastArmy, provinces },
    persia: { ...persia, strength, seizedProvinces: seized },
    turnEvents,
  };
}

/**
 * 東方戦線の1年ぶんの処理。コアループから呼ぶ。
 * 統一シナリオでなければ何もしない
 */
export function updateEasternFront(state: GameState, rng: () => number): GameState {
  if (!isReunification(state)) return state;

  let next = state;

  // 同胞と戦い続ける年は正統性が余分に減る
  if (next.east.stance === 'war') {
    next = {
      ...next,
      legitimacy: clamp(
        next.legitimacy - EAST_WAR_LEGITIMACY_DRAIN,
        MIN_LEGITIMACY,
        MAX_LEGITIMACY,
      ),
    };
  }

  next = eastCounterattack(next, rng);
  next = persianTurn(next, rng);

  /*
   * 東方属州の支配度の回復。
   *
   * 西の属州は updateControl が面倒を見るが、east.provinces は
   * そこを通らない。入れ忘れていたときは、征服した属州が
   * EAST_CONQUEST_CONTROL のまま永久に回復せず、
   * ペルシアに削られて必ず奪われていた。
   *
   * 回復するのは西が押さえた属州だけにする。西の属州で
   * 「敵がいる属州は回復しない」のと同じ理屈で、攻められている
   * 東方属州が毎年立ち直ると攻略がまったく進まなくなる
   */
  const provinces = next.east.provinces.map((p) =>
    p.owner === 'west' && p.control < MAX_CONTROL
      ? { ...p, control: clamp(p.control + CONTROL_RECOVERY_PER_TURN, MIN_CONTROL, MAX_CONTROL) }
      : p,
  );

  // 東の軍は毎年少しずつ立て直す
  return {
    ...next,
    east: {
      ...next.east,
      army: next.east.army * (1 + EAST_ARMY_GROWTH_RATE),
      provinces,
    },
  };
}

/** 西が持っている東方属州。収入計算に加える */
export function westHeldEastProvinces(state: GameState): EastProvince[] {
  return state.east.provinces.filter((p) => p.owner === 'west');
}

/**
 * 統一が成立しているか。
 * 東方属州をすべて西のものにし、ペルシアの手に渡ったものが無いこと
 */
export function isUnified(state: GameState): boolean {
  if (!isReunification(state)) return false;
  return state.east.provinces.every((p) => p.owner === 'west');
}
