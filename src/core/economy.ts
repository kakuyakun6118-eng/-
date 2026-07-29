import type { BarbarianFaction, GameState, Province } from './types';
import {
  ARMY_UPKEEP_PER_UNIT,
  COURT_UPKEEP,
  INITIAL_EAST_RELATIONS,
  INITIAL_FIELD_ARMY,
  INITIAL_FOEDERATI_LOYALTY,
  INITIAL_LEGITIMACY,
  INITIAL_SENATE_SUPPORT,
  INITIAL_TAX_BASE,
  INITIAL_TREASURY,
  STARTING_YEAR,
  TAX_RATE,
} from './constants';

export function createInitialState(
  provinces: Province[],
  factions: BarbarianFaction[],
): GameState {
  return {
    turn: 0,
    year: STARTING_YEAR,
    treasury: INITIAL_TREASURY,
    taxBase: INITIAL_TAX_BASE,
    fieldArmy: INITIAL_FIELD_ARMY,
    legitimacy: INITIAL_LEGITIMACY,
    senateSupport: INITIAL_SENATE_SUPPORT,
    eastRelations: INITIAL_EAST_RELATIONS,
    foederatiLoyalty: INITIAL_FOEDERATI_LOYALTY,
    provinces: Object.fromEntries(provinces.map((p) => [p.id, p])) as GameState['provinces'],
    factions: Object.fromEntries(factions.map((f) => [f.id, f])) as GameState['factions'],
    firedEventIds: [],
    africaLost: false,
    status: 'ongoing',
  };
}

export function calculateIncome(state: GameState): number {
  const provinceIncome = Object.values(state.provinces).reduce(
    (sum, province) => sum + (province.control / 100) * province.baseTax,
    0,
  );
  return provinceIncome * (state.taxBase / 100) * TAX_RATE;
}

export function calculateExpenses(state: GameState): number {
  const armyUpkeep = state.fieldArmy * ARMY_UPKEEP_PER_UNIT;
  const tribute = Object.values(state.factions)
    .filter((faction) => faction.stance === 'foederati')
    .reduce((sum, faction) => sum + (faction.demand?.amount ?? 0), 0);
  return armyUpkeep + tribute + COURT_UPKEEP;
}
