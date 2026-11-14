// データの入口。地域やシナリオを増やすときは、ここに登録する。
import type {
  Army, City, CityLayout, Crossing, TerrainKind, TerrainRule, CityLevelRule, Faction, LonLatPair, Officer, Pass, Person, RegionData, RegionInfo, River, Scenario, UnitType,
} from "./types";

import ncRegion from "./regions/north-china/region.json";
import ncTerrainUrl from "./regions/north-china/terrain.png";
import ncRivers from "./regions/north-china/rivers.json";
import ncCities from "./regions/north-china/cities.json";
import ncCrossings from "./regions/north-china/crossings.json";
import ncRoads from "./regions/north-china/roads.json";
import ncPasses from "./regions/north-china/passes.json";
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

/** 関所・要衝の一覧(都市とは別のデータ) */
export const passes = ncPasses.passes as unknown as Pass[];
/** 関所に属さない塞ぐ線(川岸など) */
export const extraBarriers = ncPasses.extraBarriers as unknown as LonLatPair[][];

/**
 * 関所を、都市と同じ形の「拠点」に直す。
 * 地図の表示・攻城戦・占領・セーブを、都市と同じ仕組みで扱えるようにするため。
 */
function passAsStronghold(p: Pass): City {
  return {
    id: p.id, name: p.name, reading: p.reading, lon: p.lon, lat: p.lat, rank: "town",
    description: `${p.connects}を押さえる関所。${p.note}`,
    kind: "pass", pass: p, level: 1, defense: p.defense, garrison: p.garrison, governorId: p.governorId,
    // 小さな関城:南北に門、四隅に角楼、中に兵舎と望楼
    layout: {
      size: [0.72, 0.5], wallHeight: 0.13, wallThickness: 0.1, gates: { n: 1, s: 1, e: 0, w: 0 }, gateStoreys: 2,
      cornerTowers: true, wallTowers: 1, density: 0.3, wardSize: 0.3, landmarks: 0, markets: 0, offices: 0, centerpiece: "tower", barracks: 4,
    },
  };
}
northChina.cities.push(...passes.map(passAsStronghold));

/** 読み込む地域の一覧。将来は central-asia, europe などをここに足す */
export const regions: RegionData[] = [northChina];

/** 現在のシナリオ */
export const scenario: Scenario = s317 as Scenario;
// 関所の所属も、都市と同じ表で引けるようにする
Object.assign(scenario.cityOwners, scenario.passOwners ?? {});

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
