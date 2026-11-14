// データの入口。地域やシナリオを増やすときは、ここに登録する。
import type {
  Army, City, CityLayout, Crossing, TerrainKind, TerrainRule, CityLevelRule, Faction, Officer, Person, RegionData, RegionInfo, River, Scenario, UnitType,
} from "./types";

import ncRegion from "./regions/north-china/region.json";
import ncTerrainUrl from "./regions/north-china/terrain.png";
import ncRivers from "./regions/north-china/rivers.json";
import ncCities from "./regions/north-china/cities.json";
import ncCrossings from "./regions/north-china/crossings.json";
import ncRoads from "./regions/north-china/roads.json";
import terrainCostRules from "./rules/terrainCosts.json";
import s317 from "./scenarios/s317.json";
import s317Armies from "./scenarios/s317.armies.json";
import s317Persons from "./scenarios/s317.persons.json";
import unitTypeList from "./rules/unitTypes.json";
import creditList from "./credits.json";
import cityLevelRules from "./rules/cityLevels.json";

const northChina: RegionData = {
  info: ncRegion as RegionInfo,
  terrainUrl: ncTerrainUrl,
  rivers: ncRivers as unknown as River[],
  cities: ncCities as unknown as City[],
  crossings: ncCrossings as Crossing[],
  roads: ncRoads.links,
};

/** 読み込む地域の一覧。将来は central-asia, europe などをここに足す */
export const regions: RegionData[] = [northChina];

/** 現在のシナリオ */
export const scenario: Scenario = s317 as Scenario;

/** 都市IDから所属勢力を調べる */
export function factionOfCity(cityId: string): Faction | undefined {
  const factionId = scenario.cityOwners[cityId];
  return scenario.factions.find((f) => f.id === factionId);
}

/** データや素材の出典。ゲーム内の「出典」画面に表示する */
export const credits: { title: string; source: string; text: string }[] = creditList;

/** 都市の規模(1〜4)ごとの決まり */
export const cityLevels = cityLevelRules as unknown as Record<string, CityLevelRule>;

/** 都市の規模(1〜4)。データに書かれていなければ、都市の格から決める */
export function cityLevelOf(city: City): 1 | 2 | 3 | 4 {
  if (city.level) return city.level;
  return city.rank === "capital" ? 3 : city.rank === "major" ? 2 : 1;
}

/** 規模ごとの標準の形に、その都市だけの個性を重ねて、設計図を作る */
export function resolveCityLayout(city: City): CityLayout {
  return { ...cityLevels[String(cityLevelOf(city))].layout, ...city.layout };
}

/** 兵種の一覧 */
export const unitTypes = unitTypeList as UnitType[];

/** 現在のシナリオの武将と軍団 */
/** 人物(君主・武将・軍師)の一覧 */
export const persons = s317Persons.persons as Person[];
export const officers = persons;

export function personById(id: string | undefined): Person | undefined {
  return id ? persons.find((o) => o.id === id) : undefined;
}

/** シナリオ開始時の、都市の所属(読み込んだセーブに無い都市を補うのに使う) */
export const initialCityOwners: Record<string, string> = { ...scenario.cityOwners };
export const armies = s317Armies as Army[];

export function factionById(id: string): Faction | undefined {
  return scenario.factions.find((f) => f.id === id);
}

export function officerById(id: string): Officer | undefined {
  return personById(id);
}

/** 軍団の総兵力 */
export function totalTroops(army: Army): number {
  return army.troops.infantry + army.troops.cavalry + army.troops.archer;
}

/** 地形ごとの名前と通りにくさ */
export const terrainRules = terrainCostRules as Record<TerrainKind, TerrainRule>;
