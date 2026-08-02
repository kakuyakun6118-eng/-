import {
  ADVANCE_PROBABILITY,
  ATTACKER_LOSS_FACTOR,
  COMBAT_RANDOMNESS,
  DEFENSE_MULTIPLIER,
  DEPLOY_ARMY_DEFENSE_SHARE,
  DEMAND_REFUSAL_POWER_BONUS,
  DEMAND_REFUSAL_SETTLE_CONTROL_BONUS,
  DIFFICULTY_SETTINGS,
  EXTERIOR_GROWTH_RATE,
  FIELD_ARMY_DEFENSE_SHARE,
  FOEDERATI_DEFECTION_LOYALTY_THRESHOLD,
  FOEDERATI_DEFENSE_SHARE,
  GARRISON_LOSS_FACTOR,
  GARRISON_LOSS_FACTOR_ON_VICTORY,
  ITALIA_GRAIN_LOSS_PENALTY,
  LEGITIMACY_GAIN_PER_VICTORY,
  LEGITIMACY_LOSS_PER_PROVINCE_LOST,
  LEGITIMACY_LOSS_PER_SETTLEMENT,
  MAX_CONTROL,
  MAX_LEGITIMACY,
  MAX_TAX_BASE,
  MIN_CONTROL,
  MIN_LEGITIMACY,
  MIN_STRENGTH_TO_ADVANCE,
  MIN_TAX_BASE,
  RAID_CONTROL_DAMAGE,
  RAIDER_MAX_STRENGTH,
  RAIDER_MIN_CONTROL,
  RAID_TAX_BASE_LOSS,
  RAID_TREASURY_LOOT,
  SETTLE_CONTROL_THRESHOLD,
  SETTLE_STRENGTH_MULTIPLIER,
  SETTLE_TAX_BASE_LOSS,
} from './constants';
import { militaryModifier } from './dynasty';
import { generalDefenseModifier, generalVictoryCreditShare } from './general';
import { chiefPowerModifier } from './homelands';
import { governorDefenseModifier } from './officials';
import { resolveCombat } from './military';
import type { BarbarianFactionId, GameState, ProvinceId, TurnModifiers } from './types';
import { clamp } from './util';

function randomizedPower(base: number, rng: () => number): number {
  return base * (1 + (rng() * 2 - 1) * COMBAT_RANDOMNESS);
}

/**
 * 各蛮族勢力の行動（移動・略奪・定住・侵攻・寝返り）を評価し、
 * 戦闘解決と、その結果による税基盤・正統性の変動までを行う。
 */
export function applyBarbarianActions(
  state: GameState,
  rng: () => number,
  modifiers: TurnModifiers,
): GameState {
  const provinces = { ...state.provinces };
  const factions = { ...state.factions };
  let treasury = state.treasury;
  let taxBase = state.taxBase;
  let legitimacy = state.legitimacy;
  let africaLost = state.africaLost;

  /** その属州に駐屯するフォエデラティが防衛に加える戦力 */
  const foederatiDefenseAt = (provinceId: ProvinceId): number =>
    Object.values(factions)
      .filter((f) => f.stance === 'foederati' && f.location === provinceId)
      .reduce((sum, f) => sum + f.strength * FOEDERATI_DEFENSE_SHARE, 0);

  for (const factionId of Object.keys(factions) as BarbarianFactionId[]) {
    const faction = factions[factionId];

    if (faction.stance === 'settled') continue;

    if (faction.stance === 'foederati') {
      if (state.foederatiLoyalty < FOEDERATI_DEFECTION_LOYALTY_THRESHOLD) {
        factions[factionId] = { ...faction, stance: 'hostile', demand: null };
      }
      continue;
    }

    // stance === 'hostile'
    if (modifiers.pacified.has(factionId)) continue;

    const location = faction.location;

    if (location === 'exterior') {
      const nextTarget = faction.route[faction.routeIndex];
      if (nextTarget && faction.strength >= MIN_STRENGTH_TO_ADVANCE && rng() < ADVANCE_PROBABILITY) {
        factions[factionId] = { ...faction, location: nextTarget };
      } else {
        /*
         * 略奪する民は毎年境外へ戻るので、上限を置かないと
         * 成長がかかり続けて最大の脅威になってしまう
         */
        const grown = faction.strength * (1 + EXTERIOR_GROWTH_RATE);
        factions[factionId] = {
          ...faction,
          strength: faction.raider === true ? Math.min(grown, RAIDER_MAX_STRENGTH) : grown,
        };
      }
      continue;
    }

    const province = provinces[location];
    /*
     * 突きつけた要求を無視されている勢力は、返事を待たずに
     * その土地に住み着こうとする。拒否の代償を恒久的なものにする
     */
    const settleThreshold =
      SETTLE_CONTROL_THRESHOLD +
      (faction.demand !== null ? DEMAND_REFUSAL_SETTLE_CONTROL_BONUS : 0);
    const canSettle =
      // 略奪だけの民は土地に住み着かない
      faction.raider !== true &&
      province.control < settleThreshold &&
      faction.strength > province.garrison * SETTLE_STRENGTH_MULTIPLIER;

    if (canSettle) {
      /*
       * 恒久的に失うのはその属州の税基盤なので、失えるのは一度きり。
       * すでに他の勢力が住み着いて baseTax が尽きている土地に
       * もうひとつ住み着いても、帝国がさらに差し出すものは無い。
       *
       * 二重に取っていたときは、勢力を8から13に増やしただけで
       * 1局あたりの定住が 4.2 → 8.9 件に増え、そのぶん taxBase と
       * legitimacy が二重に削られていた
       */
      const firstSettlement = province.baseTax > 0;
      provinces[location] = { ...province, baseTax: 0 };
      factions[factionId] = { ...faction, stance: 'settled' };
      if (firstSettlement) {
        taxBase = clamp(taxBase - SETTLE_TAX_BASE_LOSS, MIN_TAX_BASE, MAX_TAX_BASE);
        legitimacy = clamp(
          legitimacy - LEGITIMACY_LOSS_PER_SETTLEMENT,
          MIN_LEGITIMACY,
          MAX_LEGITIMACY,
        );
      }
      continue;
    }

    const armyShare = modifiers.reinforced.has(location)
      ? DEPLOY_ARMY_DEFENSE_SHARE
      : FIELD_ARMY_DEFENSE_SHARE;
    // 総督は自分の属州の守備隊にだけ効く。野戦軍やフォエデラティには効かない
    const defenseBase =
      province.garrison * governorDefenseModifier(state, location) +
      state.fieldArmy * armyShare +
      foederatiDefenseAt(location);

    /*
     * 突きつけた要求に答えを得られていない勢力は、その年の攻撃が重くなる。
     * 拒否の代償をここで受けるので、放置した年数で複利に膨らむことはない
     */
    const refusalBonus = faction.demand !== null ? 1 + DEMAND_REFUSAL_POWER_BONUS : 1;
    /*
     * 族長の力量を攻撃側に掛ける。アッティラやガイセリックの下では
     * 同じ兵力でも重くなる。史実の名を並べるだけでなく数値にも効かせる
     */
    const attackerPower = randomizedPower(
      faction.strength *
        DIFFICULTY_SETTINGS[state.difficulty].barbarianPowerMultiplier *
        refusalBonus *
        chiefPowerModifier(state, factionId),
      rng,
    );
    // 君主の軍事能力は防御側戦力の補正としてのみ作用する
    const defenderPower = randomizedPower(
      defenseBase * DEFENSE_MULTIPLIER * militaryModifier(state) * generalDefenseModifier(state),
      rng,
    );
    const { attackerWins, margin } = resolveCombat(attackerPower, defenderPower);

    if (attackerWins) {
      /*
       * 略奪だけの民は土地を奪い切らない。掠めるだけなので
       * 支配度は RAIDER_MIN_CONTROL より下へは落ちない
       */
      const controlFloor = faction.raider === true ? RAIDER_MIN_CONTROL : MIN_CONTROL;
      const newControl = clamp(
        province.control - RAID_CONTROL_DAMAGE,
        Math.min(controlFloor, province.control),
        MAX_CONTROL,
      );
      provinces[location] = {
        ...province,
        control: newControl,
        garrison: Math.max(0, province.garrison - margin * GARRISON_LOSS_FACTOR),
      };
      treasury -= RAID_TREASURY_LOOT;
      taxBase = clamp(taxBase - RAID_TAX_BASE_LOSS, MIN_TAX_BASE, MAX_TAX_BASE);

      if (newControl <= MIN_CONTROL && province.control > MIN_CONTROL) {
        legitimacy = clamp(
          legitimacy - LEGITIMACY_LOSS_PER_PROVINCE_LOST,
          MIN_LEGITIMACY,
          MAX_LEGITIMACY,
        );
      }

      if (location === 'Africa' && newControl <= MIN_CONTROL && !africaLost) {
        africaLost = true;
        const italia = provinces.Italia;
        provinces.Italia = {
          ...italia,
          control: clamp(
            italia.control - ITALIA_GRAIN_LOSS_PENALTY,
            MIN_CONTROL,
            MAX_CONTROL,
          ),
        };
      }

      const nextIndex = faction.routeIndex + 1;
      const advanceFurther = nextIndex < faction.route.length;
      factions[factionId] = {
        ...faction,
        strength: Math.max(0, faction.strength - margin * ATTACKER_LOSS_FACTOR),
        // 略奪だけの民は奥へ進まず、掠めたその年のうちに引き揚げる
        routeIndex: faction.raider === true || !advanceFurther ? faction.routeIndex : nextIndex,
        location:
          faction.raider === true
            ? 'exterior'
            : advanceFurther
              ? faction.route[nextIndex]
              : location,
      };
    } else {
      factions[factionId] = {
        ...faction,
        strength: Math.max(0, faction.strength - margin * ATTACKER_LOSS_FACTOR),
        // 撃退されても同じ。襲撃は一度の出撃であって駐留ではない
        location: faction.raider === true ? 'exterior' : faction.location,
      };
      provinces[location] = {
        ...province,
        garrison: Math.max(0, province.garrison - margin * GARRISON_LOSS_FACTOR_ON_VICTORY),
      };
      // 勝利の名声は、有能な将軍がいるほど皇帝ではなく将軍のものになる
      legitimacy = clamp(
        legitimacy + LEGITIMACY_GAIN_PER_VICTORY * generalVictoryCreditShare(state),
        MIN_LEGITIMACY,
        MAX_LEGITIMACY,
      );
    }
  }

  return { ...state, provinces, factions, treasury, taxBase, legitimacy, africaLost };
}
