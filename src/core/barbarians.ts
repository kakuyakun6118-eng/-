import {
  ADVANCE_PROBABILITY,
  ATTACKER_LOSS_FACTOR,
  COMBAT_RANDOMNESS,
  DEFENSE_MULTIPLIER,
  DEPLOY_ARMY_DEFENSE_SHARE,
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
  RAID_TAX_BASE_LOSS,
  RAID_TREASURY_LOOT,
  SETTLE_CONTROL_THRESHOLD,
  SETTLE_STRENGTH_MULTIPLIER,
  SETTLE_TAX_BASE_LOSS,
} from './constants';
import { militaryModifier } from './dynasty';
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
        factions[factionId] = {
          ...faction,
          strength: faction.strength * (1 + EXTERIOR_GROWTH_RATE),
        };
      }
      continue;
    }

    const province = provinces[location];
    const canSettle =
      province.control < SETTLE_CONTROL_THRESHOLD &&
      faction.strength > province.garrison * SETTLE_STRENGTH_MULTIPLIER;

    if (canSettle) {
      provinces[location] = { ...province, baseTax: 0 };
      factions[factionId] = { ...faction, stance: 'settled' };
      taxBase = clamp(taxBase - SETTLE_TAX_BASE_LOSS, MIN_TAX_BASE, MAX_TAX_BASE);
      legitimacy = clamp(
        legitimacy - LEGITIMACY_LOSS_PER_SETTLEMENT,
        MIN_LEGITIMACY,
        MAX_LEGITIMACY,
      );
      continue;
    }

    const armyShare = modifiers.reinforced.has(location)
      ? DEPLOY_ARMY_DEFENSE_SHARE
      : FIELD_ARMY_DEFENSE_SHARE;
    const defenseBase =
      province.garrison + state.fieldArmy * armyShare + foederatiDefenseAt(location);

    const attackerPower = randomizedPower(
      faction.strength * DIFFICULTY_SETTINGS[state.difficulty].barbarianPowerMultiplier,
      rng,
    );
    // 君主の軍事能力は防御側戦力の補正としてのみ作用する
    const defenderPower = randomizedPower(
      defenseBase * DEFENSE_MULTIPLIER * militaryModifier(state),
      rng,
    );
    const { attackerWins, margin } = resolveCombat(attackerPower, defenderPower);

    if (attackerWins) {
      const newControl = clamp(province.control - RAID_CONTROL_DAMAGE, MIN_CONTROL, MAX_CONTROL);
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
        routeIndex: advanceFurther ? nextIndex : faction.routeIndex,
        location: advanceFurther ? faction.route[nextIndex] : location,
      };
    } else {
      factions[factionId] = {
        ...faction,
        strength: Math.max(0, faction.strength - margin * ATTACKER_LOSS_FACTOR),
      };
      provinces[location] = {
        ...province,
        garrison: Math.max(0, province.garrison - margin * GARRISON_LOSS_FACTOR_ON_VICTORY),
      };
      legitimacy = clamp(
        legitimacy + LEGITIMACY_GAIN_PER_VICTORY,
        MIN_LEGITIMACY,
        MAX_LEGITIMACY,
      );
    }
  }

  return { ...state, provinces, factions, treasury, taxBase, legitimacy, africaLost };
}
