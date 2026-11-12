// 会戦の設定(BattleSetup)から、戦場に並べる部隊の一覧を作る。
// 歩兵を前衛、弓兵を後衛、騎兵を両翼、指揮官の本陣を後方に置く。
import unitClassData from "../data/rules/battleUnits.json";
import type { BattleSetup, BattleSide, UnitTypeId } from "../data/types";
import type { BattleUnit, SideId, UnitClass, UnitClassId } from "./types";

export const unitClasses = unitClassData as unknown as Record<UnitClassId, UnitClass>;

/** 戦場の大きさ(横・奥行き) */
export const FIELD = { width: 340, depth: 250 };
/** 両軍の最初の距離の半分 */
const START_Z = 62;
/** 戦場に出す兵士の人形の数の上限(両軍あわせて)。iPhoneでも動く数に抑える */
const MAX_FIGURES = 1300;
/** 1部隊の人数がこれを超えたら、2部隊に分ける */
const SPLIT_SIZE = 2600;

/** 兵種(歩兵・騎兵・弓兵)を、どの兵科にどの割合で分けるか */
const COMPOSITION: Record<UnitTypeId, [UnitClassId, number][]> = {
  infantry: [["spearmen", 0.4], ["swordsmen", 0.35], ["heavyInfantry", 0.25]],
  cavalry: [["lightCavalry", 0.6], ["heavyCavalry", 0.4]],
  archer: [["archers", 0.65], ["crossbowmen", 0.35]],
};

export interface Deployment {
  units: BattleUnit[];
  /** 兵士の人形1体が、何人分にあたるか */
  menPerFigure: number;
}

/** 部隊の人数から、隊列の横の人数と、幅・奥行きを決める */
export function shapeUnit(u: BattleUnit, menPerFigure: number): void {
  const cls = unitClasses[u.classId];
  const figures = Math.max(1, Math.ceil(u.men / menPerFigure));
  // 最初に決めた横の人数は変えず、減った分だけ後ろの列から薄くなる
  if (u.columns === 0) u.columns = Math.max(3, Math.ceil(Math.sqrt(figures * (cls.category === "cavalry" ? 2.2 : 3))));
  const rows = Math.ceil(figures / u.columns);
  u.width = Math.min(figures, u.columns) * cls.spacing;
  u.depth = rows * cls.spacing * (cls.category === "cavalry" ? 1.5 : 1);
}

function makeUnits(side: BattleSide, sideId: SideId): BattleUnit[] {
  const units: BattleUnit[] = [];
  const troops = { ...side.troops };
  const total = troops.infantry + troops.cavalry + troops.archer;
  const make = (classId: UnitClassId, men: number, source: UnitTypeId, isCommand = false): void => {
    const n = units.filter((u) => u.classId === classId).length;
    units.push({
      id: `${sideId}-${classId}-${n + 1}`,
      side: sideId,
      classId,
      name: isCommand
        ? `${side.commander ? side.commander.name : side.name}本陣`
        : `${unitClasses[classId].name}${["一", "二", "三", "四"][n] ?? n + 1}番隊`,
      source,
      isCommand,
      men,
      maxMen: men,
      x: 0,
      z: 0,
      facing: sideId === "attacker" ? 0 : Math.PI,
      columns: 0,
      width: 1,
      depth: 1,
      morale: side.morale,
      baseMorale: side.morale,
      fatigue: side.fatigue * 0.6, // 戦場に着くまでに少し休めたとみなす
      state: "idle",
      order: { kind: "hold" },
      engaged: [],
      running: false,
      reloadLeft: 0,
      recentLoss: 0,
      calm: 99,
      escaped: false,
    });
  };

  // 本陣:指揮官と護衛。騎兵から(いなければ歩兵から)少数を割く
  const guardSource: UnitTypeId = troops.cavalry > 0 ? "cavalry" : troops.infantry > 0 ? "infantry" : "archer";
  const guard = Math.min(troops[guardSource], Math.max(40, Math.min(400, Math.round(total * 0.03))));
  troops[guardSource] -= guard;

  for (const type of ["infantry", "cavalry", "archer"] as UnitTypeId[]) {
    let left = troops[type];
    COMPOSITION[type].forEach(([classId, share], i, list) => {
      const men = i === list.length - 1 ? left : Math.round(troops[type] * share);
      left -= men;
      if (men <= 0) return;
      const parts = men > SPLIT_SIZE ? 2 : 1;
      for (let k = 0; k < parts; k++) make(classId, k === 0 ? Math.ceil(men / parts) : Math.floor(men / parts), type);
    });
  }
  if (guard > 0) make("guard", guard, guardSource, true);
  return units;
}

/** 横一列に、中心をそろえて並べる */
function lineUp(units: BattleUnit[], z: number, dir: number, gap = 5): void {
  const totalWidth = units.reduce((s, u) => s + u.width, 0) + gap * Math.max(0, units.length - 1);
  let x = -totalWidth / 2;
  for (const u of units) {
    u.x = (x + u.width / 2) * dir;
    u.z = z;
    x += u.width + gap;
  }
}

export function deploy(setup: BattleSetup): Deployment {
  const attacker = makeUnits(setup.attacker, "attacker");
  const defender = makeUnits(setup.defender, "defender");
  const units = [...attacker, ...defender];
  const totalMen = units.reduce((s, u) => s + u.men, 0);
  const menPerFigure = Math.max(6, Math.ceil(totalMen / MAX_FIGURES));
  for (const u of units) shapeUnit(u, menPerFigure);

  for (const [list, sign] of [[attacker, 1], [defender, -1]] as [BattleUnit[], number][]) {
    const of = (cat: UnitTypeId): BattleUnit[] => list.filter((u) => !u.isCommand && unitClasses[u.classId].category === cat);
    const infantry = of("infantry");
    const cavalry = of("cavalry");
    const archers = of("archer");
    const frontZ = START_Z * sign;
    // 前衛:歩兵。重装歩兵を中央に置く
    infantry.sort((a, b) => (a.classId === "heavyInfantry" ? 0 : 1) - (b.classId === "heavyInfantry" ? 0 : 1));
    const centre = [infantry[1], infantry[0], ...infantry.slice(2)].filter(Boolean);
    lineUp(centre.length > 0 ? centre : cavalry, frontZ, sign);
    // 後衛:弓兵・弩兵
    lineUp(archers, frontZ + 16 * sign, sign);
    // 両翼:騎兵(歩兵がいるときだけ。いなければ騎兵が前衛になっている)
    if (centre.length > 0) {
      const half = centre.reduce((s, u) => s + u.width, 0) / 2 + 5 * centre.length;
      cavalry.forEach((u, i) => {
        const wing = i % 2 === 0 ? -1 : 1;
        u.x = wing * (half + 14 + Math.floor(i / 2) * (u.width + 6) + u.width / 2);
        u.z = frontZ + 4 * sign;
      });
    }
    // 本陣:後方の中央
    for (const u of list.filter((k) => k.isCommand)) {
      u.x = 0;
      u.z = frontZ + 34 * sign;
    }
  }
  return { units, menPerFigure };
}
