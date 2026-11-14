// データの入口。地域やシナリオを増やすときは、ここに登録する。
import type {
  Army, City, CityLayout, Crossing, TerrainKind, TerrainRule, CityLevelRule, Faction, LonLatPair, Officer, Pass, Person, RegionData, RegionInfo, River, Scenario, ScenarioEntry, ScenarioFile, UnitType,
} from "./types";

import ncRegion from "./regions/north-china/region.json";
import ncTerrainUrl from "./regions/north-china/terrain.png";
import ncRivers from "./regions/north-china/rivers.json";
import ncCities from "./regions/north-china/cities.json";
import ncCrossings from "./regions/north-china/crossings.json";
import ncRoads from "./regions/north-china/roads.json";
import ncPasses from "./regions/north-china/passes.json";
import terrainCostRules from "./rules/terrainCosts.json";
import catalog from "./scenarios/catalog.json";
import extraPersons from "./scenarios/persons.extra.json";
import s300 from "./scenarios/s300.json";
import s304 from "./scenarios/s304.json";
import s311 from "./scenarios/s311.json";
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
/** シナリオの目録(選択画面に出す8本) */
export const scenarioCatalog = catalog.scenarios as ScenarioEntry[];

/** 収録済みのシナリオ。新しいシナリオを足すときは、ここに登録して、目録の status を ready にする */
const scenarioFiles: Record<string, ScenarioFile> = {
  s300: s300 as unknown as ScenarioFile,
  s304: s304 as unknown as ScenarioFile,
  s311: s311 as unknown as ScenarioFile,
  s317: { ...(s317 as unknown as ScenarioFile), armies: s317Armies as Army[] },
};
/** 人物の台帳:317年の人物と、ほかの年代だけに出る人物 */
const personLedger = new Map<string, Person>();
for (const p of [...(s317Persons.persons as Person[]), ...(extraPersons.persons as unknown as Person[])]) personLedger.set(p.id, p);

/** いま選ばれているシナリオのID。ページのアドレスの「#s=s311」から読む(無ければ317年) */
function chosenScenarioId(): string {
  const m = typeof location === "undefined" ? null : /[#&]s=(s\d+)/.exec(location.hash);
  const id = m ? m[1] : "s317";
  const entry = scenarioCatalog.find((e) => e.id === id);
  return entry && entry.status === "ready" && scenarioFiles[id] ? id : "s317";
}

/** シナリオのファイルから、ゲームが使う形(シナリオ・人物・軍団)を作る */
function buildScenario(file: ScenarioFile): { scenario: Scenario; persons: Person[]; armies: Army[] } {
  const cityOwners: Record<string, string> = {};
  if (file.defaultOwner) for (const c of northChina.cities) cityOwners[c.id] = file.defaultOwner;
  Object.assign(cityOwners, file.cityOwners);
  // 関所の所属:書かれていなければ、その関所が結ぶ1つ目の都市と同じ勢力
  const passOwners: Record<string, string> = {};
  for (const p of passes) passOwners[p.id] = file.passOwners?.[p.id] ?? cityOwners[p.between[0]];
  const list: Person[] = file.roster
    ? Object.entries(file.roster).flatMap(([id, r]) => {
        const base = personLedger.get(id);
        return base ? [{ ...base, factionId: r.factionId, role: r.role ?? base.role, title: r.title ?? base.title, note: r.note ?? base.note }] : [];
      })
    : (s317Persons.persons as Person[]);
  const { roster: _roster, armies: fileArmies, defaultOwner: _default, ...rest } = file;
  return { scenario: { ...rest, cityOwners, passOwners }, persons: list, armies: fileArmies ?? [] };
}

const built = buildScenario(scenarioFiles[chosenScenarioId()]);
export const scenario: Scenario = built.scenario;
// 年代によって違う都市名に直す
for (const c of northChina.cities) {
  const alt = scenario.cityNames?.[c.id];
  if (alt) Object.assign(c, alt);
}

/** 別のシナリオに切り替える(ページを読み込み直して、その年代で始める) */
export function switchScenario(id: string): void {
  location.hash = `s=${id}`;
  location.reload();
}
// 開始時の太守・守将を、都市と関所に書き込む
// (都市データに書かれた太守は317年のもの。ほかの年代では使わない)
for (const c of northChina.cities) c.governorId = scenario.governors?.[c.id] ?? (scenario.id === "s317" ? c.governorId : undefined);

// 肖像画像:portraits/{人物ID}.webp(png・jpg も可)があれば使う。無い人物は、画面側で仮のシルエットを出す
const portraitFiles = import.meta.glob("./portraits/*.{webp,png,jpg,jpeg}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const portraits = new Map<string, string>();
for (const [path, url] of Object.entries(portraitFiles)) {
  const id = path.slice(path.lastIndexOf("/") + 1, path.lastIndexOf("."));
  portraits.set(id, url);
}
export function portraitOf(personId: string): string | undefined {
  return portraits.get(personId);
}

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
export const persons: Person[] = built.persons;
export const officers = persons;

export function personById(id: string | undefined): Person | undefined {
  return id ? persons.find((o) => o.id === id) : undefined;
}

/** シナリオ開始時の、都市の所属(読み込んだセーブに無い都市を補うのに使う) */
export const initialCityOwners: Record<string, string> = { ...scenario.cityOwners };
export const armies: Army[] = built.armies;

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
