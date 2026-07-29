import {
  ADVANCE_PROBABILITY,
  ATTACKER_LOSS_FACTOR,
  COMBAT_RANDOMNESS,
  DEFENSE_MULTIPLIER,
  EXTERIOR_GROWTH_RATE,
  FOEDERATI_DEFECTION_LOYALTY_THRESHOLD,
  GARRISON_LOSS_FACTOR,
  ITALIA_GRAIN_LOSS_PENALTY,
  MIN_STRENGTH_TO_ADVANCE,
  RAID_CONTROL_DAMAGE,
  RAID_TREASURY_LOOT,
  SETTLE_CONTROL_THRESHOLD,
  SETTLE_STRENGTH_MULTIPLIER,
} from './constants';
import { resolveCombat } from './military';
import type { BarbarianFactionId, GameState } from './types';

function randomizedPower(base: number, rng: () => number): number {
  return base * (1 + (rng() * 2 - 1) * COMBAT_RANDOMNESS);
}

/**
 * 各蛮族勢力の行動（移動・略奪・定住・侵攻・寝返り）を評価し、
 * 戦闘解決・支配度と税基盤の更新までを一括で行う。
 */
export function applyBarbarianActions(state: GameState, rng: () => number): GameState {
  const provinces = { ...state.provinces };
  const factions = { ...state.factions };
  let treasury = state.treasury;
  let africaLost = state.africaLost;

  for (const factionId of Object.keys(factions) as BarbarianFactionId[]) {
    const faction = factions[factionId];

    if (faction.stance === 'settled') continue;

    if (faction.stance === 'foederati') {
      if (state.foederatiLoyalty < FOEDERATI_DEFECTION_LOYALTY_THRESHOLD) {
        factions[factionId] = { ...faction, stance: 'hostile' };
      }
      continue;
    }

    // stance === 'hostile'
    const location = faction.location;

    if (location === 'exterior') {
      const nextTarget = faction.route[faction.routeIndex];
      if (nextTarget && faction.strength >= MIN_STRENGTH_TO_ADVANCE && rng() < ADVANCE_PROBABILITY) {
        factions[factionId] = { ...faction, location: nextTarget };
      } else {
        factions[factionId] = { ...faction, strength: faction.strength * (1 + EXTERIOR_GROWTH_RATE) };
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
      continue;
    }

    const attackerPower = randomizedPower(faction.strength, rng);
    const defenderPower = randomizedPower(province.garrison * DEFENSE_MULTIPLIER, rng);
    const { attackerWins, margin } = resolveCombat(attackerPower, defenderPower);

    if (attackerWins) {
      const newControl = Math.max(0, province.control - RAID_CONTROL_DAMAGE);
      provinces[location] = {
        ...province,
        control: newControl,
        garrison: Math.max(0, province.garrison - margin * GARRISON_LOSS_FACTOR),
      };
      treasury -= RAID_TREASURY_LOOT;

      if (location === 'Africa' && newControl <= 0 && !africaLost) {
        africaLost = true;
        const italia = provinces.Italia;
        provinces.Italia = {
          ...italia,
          control: Math.max(0, italia.control - ITALIA_GRAIN_LOSS_PENALTY),
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
        garrison: Math.max(0, province.garrison - margin * GARRISON_LOSS_FACTOR * 0.5),
      };
    }
  }

  return { ...state, provinces, factions, treasury, africaLost };
}
