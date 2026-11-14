// 会戦に関する計算。戦闘イベントから、会戦準備画面や3D戦闘に渡す「会戦の設定」を組み立てる。
// ここは計算だけで、画面のことは知らない。
import { cityLevelOf, cityLevels, officerById, resolveCityLayout, terrainRules } from "../data";
import type { Army, BattleEvent, BattleSetup, BattleSide, City, CityState, Fortification, Officer, TerrainKind } from "../data/types";

const KM_PER_DEGREE = 111.19;
const DIRECTIONS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
/** 守備兵力をデータに書いていない都市の、規模ごとの目安 */
const DEFAULT_GARRISON = [0, 1500, 4000, 8000, 15000];

function km(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const dx = (bLon - aLon) * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  return Math.hypot(dx, bLat - aLat) * KM_PER_DEGREE;
}

/** いちばん近い都市と、そこからの方角・距離 */
function nearestCity(cities: City[], lon: number, lat: number): { city: City; km: number; direction: string } | null {
  let best: City | null = null;
  let bestKm = Infinity;
  for (const c of cities) {
    const d = km(c.lon, c.lat, lon, lat);
    if (d < bestKm) {
      bestKm = d;
      best = c;
    }
  }
  if (!best) return null;
  const dx = (lon - best.lon) * Math.cos(lat * (Math.PI / 180));
  const angle = (Math.atan2(dx, lat - best.lat) * 180) / Math.PI;
  return { city: best, km: bestKm, direction: DIRECTIONS[Math.round(((angle + 360) % 360) / 45) % 8] };
}

/** 「長安の東 60km」のように、いちばん近い都市からの方角と距離で場所を表す */
export function placeName(cities: City[], lon: number, lat: number): string {
  const n = nearestCity(cities, lon, lat);
  if (!n) return "不明";
  if (n.km < 25) return `${n.city.name}の近郊`;
  return `${n.city.name}の${n.direction} ${Math.round(n.km / 10) * 10}km`;
}

/** 戦闘の名称。野戦は「襄国南東の戦い」、攻城戦は「洛陽攻城戦」の形にする */
function battleName(event: BattleEvent, cities: City[]): string {
  if (event.battleType === "siege_battle") return `${event.location.name}攻城戦`;
  const n = nearestCity(cities, event.location.lon, event.location.lat);
  if (!n) return "野戦";
  return n.km < 25 ? `${n.city.name}の戦い` : `${n.city.name}${n.direction}の戦い`;
}

/** 都市の、戦いを受ける前の状態(守備兵・食糧・士気は、データか規模から決める) */
export function initialCityState(city: City): CityState {
  return {
    garrison: city.garrison ?? DEFAULT_GARRISON[cityLevelOf(city)],
    food: city.fort?.food ?? 30 + cityLevelOf(city) * 15,
    morale: city.fort?.morale ?? 70,
    wallDamage: 0,
    gateDamage: 0,
    governorFate: "healthy",
  };
}

/** 都市の守り:城壁の規模・耐久・防御施設を、都市の設計図と、いまの状態(損傷)から読み取る */
export function fortificationOf(city: City, state: CityState = initialCityState(city)): Fortification {
  const layout = resolveCityLayout(city);
  const level = cityLevelOf(city);
  const facilities: string[] = [];
  const gates = layout.gates.n + layout.gates.s + layout.gates.e + layout.gates.w;
  facilities.push(`城門${gates}`);
  if (layout.cornerTowers) facilities.push("角楼");
  if (layout.wallTowers > 0) facilities.push(`望楼${layout.wallTowers * 4}`);
  if (layout.moat) facilities.push("水濠");
  if (layout.palaces?.some((p) => p.fortified)) facilities.push(level >= 4 ? "宮城" : "内城");
  if (layout.citadel) facilities.push("小城");
  if (layout.terraces) facilities.push("高台");
  const defense = city.defense ?? 50;
  return {
    scale: `${cityLevels[String(level)].label}(レベル${level})`,
    defense,
    facilities,
    wallHeight: layout.wallHeight,
    wallThickness: layout.wallThickness,
    gates: Math.max(1, layout.gates.s),
    // 耐久力:城防御力と、城壁の厚さから決める(都市ごとに fort で上書きできる)
    wallHp: city.fort?.wallHp ?? Math.round((1700 + defense * 42) * (layout.wallThickness / 0.1)),
    gateHp: city.fort?.gateHp ?? Math.round(1100 + defense * 24),
    food: state.food,
    morale: state.morale,
    wallDamage: state.wallDamage,
    gateDamage: state.gateDamage,
  };
}

function armySide(role: BattleSide["role"], army: Army): BattleSide {
  return {
    role,
    kind: "army",
    factionId: army.factionId,
    armyId: army.id,
    cityId: null,
    name: army.name,
    commander: officerById(army.commanderId) ?? null,
    troops: { ...army.troops },
    morale: army.morale,
    fatigue: army.fatigue,
    food: army.food,
    fortification: null,
  };
}

function citySide(city: City, factionId: string, state: CityState): BattleSide {
  // 守備兵は歩兵と弓兵で構成する(城を守るのに騎兵は使わない)
  const garrison = state.garrison;
  // 守将:都市データに名前があれば、能力値は仮の値で指揮官とする(戦死・捕虜になっていれば不在)
  const lost = state.governorFate === "killed" || state.governorFate === "captured";
  const governor: Officer | null =
    city.governor && !lost
      ? { id: `gov_${city.id}`, name: city.governor, reading: "", factionId, leadership: 65, valor: 60, intelligence: 60 }
      : null;
  return {
    role: "defender",
    kind: "city",
    factionId,
    armyId: null,
    cityId: city.id,
    name: `${city.name}守備隊`,
    commander: governor,
    troops: { infantry: Math.round(garrison * 0.7), cavalry: 0, archer: Math.round(garrison * 0.3) },
    morale: state.morale,
    fatigue: 0,
    food: state.food,
    fortification: fortificationOf(city, state),
  };
}

/**
 * 戦闘イベントから、会戦の設定を組み立てる。
 * armyOf は、軍団IDからいまの軍団データを返す関数。
 */
export function createBattleSetup(
  event: BattleEvent, armyOf: (id: string) => Army | undefined, cities: City[],
  cityStateOf: (city: City) => CityState = initialCityState,
): BattleSetup | null {
  const attacker = armyOf(event.attackerArmyId);
  if (!attacker) return null;
  let defender: BattleSide | null = null;
  if (event.battleType === "field_battle" && event.defenderArmyId) {
    const army = armyOf(event.defenderArmyId);
    if (army) defender = armySide("defender", army);
  } else if (event.defenderCityId) {
    const city = cities.find((c) => c.id === event.defenderCityId);
    if (city) defender = citySide(city, event.defenderFactionId, cityStateOf(city));
  }
  if (!defender) return null;
  return {
    battleId: event.battleId,
    battleType: event.battleType,
    name: battleName(event, cities),
    location: { ...event.location },
    terrain: event.terrain,
    createdAt: { ...event.createdAt },
    attacker: armySide("attacker", attacker),
    defender,
  };
}

/** 両軍を比べる項目の1行 */
export interface ComparisonRow {
  label: string;
  attacker: number;
  defender: number;
  unit: string;
  /** どちらが優っているか(差が小さいときは null) */
  lead: "attacker" | "defender" | null;
}

const TERRAIN_NOTES: Partial<Record<TerrainKind, string>> = {
  plain: "開けた土地で、騎兵が力を発揮しやすい",
  grassland: "見通しがよく、騎兵が力を発揮しやすい",
  desert: "乾いた砂地で、疲労がたまりやすい",
  forest: "騎兵は動きにくく、守る側が隠れやすい",
  hill: "高所を取る守る側が戦いやすい",
  mountain: "大軍を広げにくく、守る側が戦いやすい",
  highMountain: "大軍を広げにくく、守る側が戦いやすい",
  river: "渡る側は陣形が乱れやすい",
  crossing: "渡る側は陣形が乱れやすい",
};

/** 両軍の比較。優劣の目安を示すだけで、勝敗の予測はしない */
export function compareSides(setup: BattleSetup): { rows: ComparisonRow[]; notes: string[] } {
  const a = setup.attacker;
  const d = setup.defender;
  const total = (s: BattleSide): number => s.troops.infantry + s.troops.cavalry + s.troops.archer;
  const row = (label: string, x: number, y: number, unit: string, higherIsBetter = true): ComparisonRow => {
    const big = Math.max(x, y);
    const close = big === 0 || Math.abs(x - y) / big < 0.1;
    const attackerLeads = higherIsBetter ? x > y : x < y;
    return { label, attacker: Math.round(x), defender: Math.round(y), unit, lead: close ? null : attackerLeads ? "attacker" : "defender" };
  };
  const rows = [
    row("総兵力", total(a), total(d), "人"),
    row("歩兵", a.troops.infantry, d.troops.infantry, "人"),
    row("騎兵", a.troops.cavalry, d.troops.cavalry, "人"),
    row("弓兵", a.troops.archer, d.troops.archer, "人"),
    row("士気", a.morale, d.morale, ""),
    row("疲労", a.fatigue, d.fatigue, "", false),
    row("食糧", a.food, d.food, "日"),
  ];

  const notes: string[] = [];
  const terrainNote = TERRAIN_NOTES[setup.terrain];
  notes.push(`地形は${terrainRules[setup.terrain].name}${terrainNote ? `。${terrainNote}` : ""}`);
  if (d.fortification) {
    notes.push(`防御側は城壁に守られている(城防御 ${d.fortification.defense})`);
  }
  if (a.fatigue >= 60) notes.push("攻撃側は行軍の疲れが残っている");
  if (a.food <= 5) notes.push("攻撃側は食糧が尽きかけている");
  if (d.kind === "army" && d.food <= 5) notes.push("防御側は食糧が尽きかけている");
  return { rows, notes };
}
