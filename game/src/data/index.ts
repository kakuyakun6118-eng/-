// データの入口。地域やシナリオを増やすときは、ここに登録する。
import type { City, Faction, RegionData, RegionInfo, River, Scenario, TerrainData } from "./types";

import ncRegion from "./regions/north-china/region.json";
import ncTerrain from "./regions/north-china/terrain.json";
import ncRivers from "./regions/north-china/rivers.json";
import ncCities from "./regions/north-china/cities.json";
import s317 from "./scenarios/s317.json";

const northChina: RegionData = {
  info: ncRegion as RegionInfo,
  terrain: ncTerrain as unknown as TerrainData,
  rivers: ncRivers as unknown as River[],
  cities: ncCities as City[],
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
