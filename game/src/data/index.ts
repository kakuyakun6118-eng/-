// データの入口。地域やシナリオを増やすときは、ここに登録する。
import type { City, CityLayout, CityLevelRule, Faction, RegionData, RegionInfo, River, Scenario } from "./types";

import ncRegion from "./regions/north-china/region.json";
import ncTerrainUrl from "./regions/north-china/terrain.png";
import ncRivers from "./regions/north-china/rivers.json";
import ncCities from "./regions/north-china/cities.json";
import s317 from "./scenarios/s317.json";
import creditList from "./credits.json";
import cityLevelRules from "./rules/cityLevels.json";

const northChina: RegionData = {
  info: ncRegion as RegionInfo,
  terrainUrl: ncTerrainUrl,
  rivers: ncRivers as unknown as River[],
  cities: ncCities as unknown as City[],
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
