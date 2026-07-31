import {
  ABILITY_NEUTRAL,
  GENERAL_ABILITY_ROLL_MAX,
  GENERAL_ABILITY_ROLL_MIN,
  GENERAL_APPOINT_COST,
  GENERAL_DEFENSE_PER_POINT,
  GENERAL_DISMISS_ARMY_LOSS_RATE,
  GENERAL_DISMISS_LEGITIMACY_GAIN,
  GENERAL_LEGITIMACY_DRAIN_PER_POINT,
  GENERAL_MAX_TERM,
  GENERAL_MIN_TERM,
  GENERAL_USURPER_BONUS_PER_POINT,
  GENERAL_VACANT_DEFENSE_PENALTY,
  GENERAL_VICTORY_CREDIT_PER_POINT,
  MAX_LEGITIMACY,
  MIN_LEGITIMACY,
} from './constants';
import type { GameState, General, GeneralEnd } from './types';
import { clamp } from './util';

/**
 * マギステル・ミリトゥム（軍司令官）。
 *
 * この時代の西ローマを実際に動かしていたのは皇帝ではなくこの職だった。
 * 君主能力と同じく新しい資源ではなく、既存の計算式に対する補正としてのみ
 * 作用する。作用先は3つ:
 *
 * - 戦闘解決の防御側戦力（有能なら強く、空位なら弱い）
 * - legitimacy の自然減（有能なほど軍は皇帝ではなく将軍に従う）
 * - 簒奪者の確率（有能なほど帝位に手が届く）
 *
 * 強い将軍は帝国を守るが帝位を痩せさせる。解任すれば正統性は戻るが
 * 軍が崩れる。この綱引きが「短期と長期の取引」のもうひとつの形になる
 */

function rollInRange(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** 新しい将軍を生成する。乱数は seed 由来の rng のみ */
export function rollGeneral(state: GameState, rng: () => number): General {
  return {
    id: `g${state.year}_${Math.floor(rng() * 100000)}`,
    military: rollInRange(rng, GENERAL_ABILITY_ROLL_MIN, GENERAL_ABILITY_ROLL_MAX),
    appointedYear: state.year,
    retiresYear: state.year + rollInRange(rng, GENERAL_MIN_TERM, GENERAL_MAX_TERM),
  };
}

/** ABILITY_NEUTRAL を基準にした、将軍の能力の過不足 */
function abilityGap(general: General | null): number {
  return general === null ? 0 : general.military - ABILITY_NEUTRAL;
}

/**
 * 戦闘の防御側戦力にかかる補正。
 * 君主の軍事能力とは別に、掛け算で重ねる
 */
export function generalDefenseModifier(state: GameState): number {
  const general = state.general.current;
  if (general === null) return 1 - GENERAL_VACANT_DEFENSE_PENALTY;
  return 1 + abilityGap(general) * GENERAL_DEFENSE_PER_POINT;
}

/**
 * 有能な将軍が毎年削る正統性。
 * 凡庸（ABILITY_NEUTRAL 以下）なら削らない。空位でも削らない
 */
export function generalLegitimacyDrain(state: GameState): number {
  return Math.max(0, abilityGap(state.general.current)) * GENERAL_LEGITIMACY_DRAIN_PER_POINT;
}

/**
 * 撃退の手柄のうち、皇帝の取り分。
 * 名将ほど戦勝は将軍のものになり、帝位は輝かない
 */
export function generalVictoryCreditShare(state: GameState): number {
  const taken = Math.max(0, abilityGap(state.general.current)) * GENERAL_VICTORY_CREDIT_PER_POINT;
  return Math.max(0, 1 - taken);
}

/** 将軍の存在が簒奪者の確率に上乗せする分 */
export function generalUsurperBonus(state: GameState): number {
  return Math.max(0, abilityGap(state.general.current)) * GENERAL_USURPER_BONUS_PER_POINT;
}

/** 現職を記録に移して空位にする */
export function vacateSeat(state: GameState, end: GeneralEnd): GameState {
  const general = state.general.current;
  if (general === null) return state;
  return {
    ...state,
    general: {
      current: null,
      history: [
        ...state.general.history,
        {
          generalId: general.id,
          military: general.military,
          fromYear: general.appointedYear,
          toYear: state.year,
          end,
        },
      ],
    },
  };
}

/**
 * 軍司令官の1年分の更新（コアループ ステップ8）。
 * 任期を終えた将軍は職を退き、後任は自動では決まらない。
 * 空位のまま放置すると防衛が弱くなるので、任命はプレイヤーの判断になる
 */
export function updateGeneral(state: GameState): GameState {
  const general = state.general.current;
  if (general === null || state.year < general.retiresYear) return state;
  const vacated = vacateSeat(state, 'retired');
  return { ...vacated, turnEvents: [...vacated.turnEvents, 'general_retired'] };
}

/** 空位に将軍を任命する */
export function appointGeneral(state: GameState, rng: () => number): GameState {
  if (state.general.current !== null) return state;
  if (state.treasury < GENERAL_APPOINT_COST) return state;
  return {
    ...state,
    treasury: state.treasury - GENERAL_APPOINT_COST,
    general: { ...state.general, current: rollGeneral(state, rng) },
  };
}

/**
 * 軍司令官を解任する。
 * 正統性は戻るが、その将に従っていた兵は離れる
 */
export function dismissGeneral(state: GameState): GameState {
  if (state.general.current === null) return state;
  const vacated = vacateSeat(state, 'dismissed');
  return {
    ...vacated,
    fieldArmy: vacated.fieldArmy * (1 - GENERAL_DISMISS_ARMY_LOSS_RATE),
    legitimacy: clamp(
      vacated.legitimacy + GENERAL_DISMISS_LEGITIMACY_GAIN,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
  };
}
