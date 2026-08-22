import {
  BATTLE_ARMY_SHARE,
  BATTLE_UNITS_PER_WING,
  FLANK_BONUS,
  TACTICS_MAX,
  TRAIT_ATTACK_BONUS,
  TRAIT_CASUALTY_RELIEF,
  TACTICS_MIN,
  WITHDRAW_RELIEF,
} from './constants';
import { foeStrength, leaderMilitary, leaderName, mobilizedStrength } from './battle';
import type {
  ArmKind,
  BattleDeployment,
  BattleFoe,
  BattleLeader,
  Battlefield,
  BattleOrders,
  BattleUnit,
  GameState,
  ProvinceId,
  WingId,
  WingOrder,
} from './types';

export type { BattleDeployment, BattleOrders } from './types';

const WINGS: WingId[] = ['left', 'center', 'right'];

/** 兵科の相性。騎は歩に強く、歩は弓に強く、弓は騎に強い */
const ARM_ADVANTAGE: Record<ArmKind, ArmKind> = {
  horse: 'foot',
  foot: 'bow',
  bow: 'horse',
};
const ARM_BONUS = 1.25;

/** 決着までの激突の回数 */
const MAX_ROUNDS = 4;

function makeUnits(
  side: 'court' | 'foe',
  total: number,
  count: number,
  rng: () => number,
): BattleUnit[] {
  const arms: ArmKind[] = ['foot', 'horse', 'bow'];
  const units: BattleUnit[] = [];
  // 歩を厚く、騎と弓を薄く配る。この時代の軍の組み方に寄せる
  const weights = [0.5, 0.3, 0.2];
  for (let i = 0; i < count; i++) {
    const arm = arms[i % arms.length];
    const share = weights[i % weights.length] / Math.ceil(count / arms.length);
    units.push({
      id: `${side}_${i}`,
      arm,
      strength: Math.max(1, total * share * (0.85 + rng() * 0.3)),
      morale: 100,
      side,
      // 我が軍は控えから置く。敵は最初から戦列に並んでいる
      wing: side === 'foe' ? WINGS[i % WINGS.length] : null,
    });
  }
  return units;
}

/**
 * 州ごとに出うる地形。**戦場の絵はここから引く。**
 *
 * 一様に抽選していたときは、蜀の山中で砂漠の会戦が起き、
 * 河西回廊で林の会戦が起きた。土地には土地の姿がある。
 * 三つ並べてあるのは重みで、同じものを二度書けばそれだけ出やすい
 */
const PROVINCE_TERRAIN: Record<ProvinceId, Battlefield['terrain'][]> = {
  // 洛陽の周り。黄河と伊洛の平地に、南は嵩山
  Si: ['plain', 'river', 'hill'],
  // 関中の平野と、南に立ちはだかる秦嶺
  Yong: ['plain', 'mountain', 'hill'],
  // 河西回廊。祁連の南は砂
  Liang: ['desert', 'desert', 'mountain'],
  // 汾水の谷。東は太行の壁
  Bing: ['mountain', 'hill', 'plain'],
  // 河北平原。遮るものがない
  Ji: ['plain', 'plain', 'river'],
  // 薊と遼西。北は燕山、東は林
  You: ['plain', 'mountain', 'forest'],
  // 山東。丘陵と平地
  Qing: ['plain', 'plain', 'hill'],
  // 淮水の北。南北の争奪点
  Yu: ['plain', 'river', 'plain'],
  // 建康と長江
  Yang: ['river', 'river', 'plain'],
  // 江漢。雲夢の沢と林
  Jing: ['river', 'forest', 'plain'],
  // 鄱陽湖と閩の山林
  Jiang: ['forest', 'river', 'hill'],
  // 蜀。四塞の地
  Yi: ['mountain', 'mountain', 'forest'],
  // 南中。横断山脈の南
  Ning: ['mountain', 'forest', 'forest'],
  // 嶺南
  Guang: ['forest', 'forest', 'river'],
  // 日南。天下の南端
  Jiao: ['forest', 'river', 'forest'],
};

/** 会戦の起きた州。相手のいるところで戦う */
export function battleProvince(state: GameState, foe: BattleFoe): ProvinceId | null {
  if (foe.kind === 'faction') {
    const where = state.factions[foe.factionId]?.location;
    return where === undefined || where === 'exterior' ? null : where;
  }
  if (foe.kind === 'prince') {
    return state.princes.find((p) => p.id === foe.princeId)?.province ?? null;
  }
  // 北朝の南征。境の州で受ける。無ければ都で
  const front = (Object.keys(state.provinces) as ProvinceId[]).find(
    (id) => state.provinces[id].holder === null && state.provinces[id].region === 'north',
  );
  return front ?? state.capital;
}

/** 地形を引く。戦場の絵と、迂回の効きに掛かる */
function rollTerrain(provinceId: ProvinceId | null, rng: () => number): Battlefield['terrain'] {
  const kinds = provinceId === null ? (['plain', 'river', 'hill'] as const) : PROVINCE_TERRAIN[provinceId];
  return kinds[Math.floor(rng() * kinds.length)];
}

/** 戦場を開く。まだ年は進まない */
export function openBattlefield(
  state: GameState,
  foe: BattleFoe,
  leader: BattleLeader,
  rng: () => number,
  mobilize: readonly ProvinceId[],
): Battlefield {
  const ours = state.centralArmy * BATTLE_ARMY_SHARE + mobilizedStrength(state, mobilize);
  const theirs = foeStrength(state, foe);

  return {
    foe,
    leader,
    leaderName: leaderName(state, leader),
    leaderMilitary: leaderMilitary(state, leader),
    // 帝が自ら率いるときは個性を持たない。個性は武将のものだから
    leaderTrait: leader === 'marshal' ? (state.marshal.holder?.trait ?? null) : null,
    province: battleProvince(state, foe),
    terrain: rollTerrain(battleProvince(state, foe), rng),
    units: [
      ...makeUnits('court', ours, 6, rng),
      ...makeUnits('foe', theirs, 6, rng),
    ],
    round: 0,
    phase: 'deploy',
    mobilized: [...mobilize],
    log: [],
    pendingActions: [],
  };
}

/** 布陣する。控えの隊を戦列に置く */
export function deployBattlefield(
  field: Battlefield,
  deployment: BattleDeployment,
): Battlefield {
  const units = field.units.map((unit) => {
    if (unit.side !== 'court') return unit;
    const placement = deployment.placements[unit.id];
    if (placement === undefined) return unit;
    return { ...unit, wing: placement };
  });

  // 1つの戦列に置ける隊の数を超えたぶんは控えに戻す
  const trimmed = units.map((unit) => {
    if (unit.side !== 'court' || unit.wing === null) return unit;
    const sameWing = units.filter((u) => u.side === 'court' && u.wing === unit.wing);
    const index = sameWing.findIndex((u) => u.id === unit.id);
    return index >= BATTLE_UNITS_PER_WING ? { ...unit, wing: null } : unit;
  });

  /*
   * **布陣の段はここで終わらせない。**
   *
   * 一隊置いた時点で命令の段へ移していたときは、控えの一覧が消えて
   * 残り五隊を置けないまま戦いが始まった。段を進めるのは
   * 「この布陣で戦う」を押したとき、つまり最初の激突を解決したときだけ
   */
  return { ...field, units: trimmed };
}

/**
 * 命令の向かう先。
 *
 * 正面の敵がいなければ隣の戦列へ回り込む。
 * **表示側で引き写さず、必ずこの関数を引くこと**（回り込む規則を
 * 描き落とすと、図と実際の当たりがずれる）
 */
export function resolveTarget(field: Battlefield, wing: WingId, order: WingOrder): WingId | null {
  if (order === 'withdraw') return null;
  const occupied = (target: WingId) =>
    field.units.some((u) => u.side === 'foe' && u.wing === target && u.strength > 0);

  if (order === 'advance') {
    if (occupied(wing)) return wing;
    // 正面が空いたら隣へ流れる
    const neighbours = wing === 'center' ? (['left', 'right'] as WingId[]) : (['center'] as WingId[]);
    return neighbours.find(occupied) ?? null;
  }

  // 迂回。両翼は反対の翼へ、中央は左翼へ回り込む
  const flankTarget: Record<WingId, WingId> = { left: 'right', center: 'left', right: 'left' };
  const target = flankTarget[wing];
  return occupied(target) ? target : (occupied(wing) ? wing : null);
}

function wingStrength(field: Battlefield, side: 'court' | 'foe', wing: WingId): number {
  return field.units
    .filter((u) => u.side === side && u.wing === wing)
    .reduce((sum, u) => sum + u.strength * (u.morale / 100), 0);
}

/** その戦列の主な兵科。相性の判定に使う */
function wingArm(field: Battlefield, side: 'court' | 'foe', wing: WingId): ArmKind | null {
  const units = field.units.filter((u) => u.side === side && u.wing === wing && u.strength > 0);
  if (units.length === 0) return null;
  return units.sort((a, b) => b.strength - a.strength)[0].arm;
}

/** 一度の激突を解決する */
export function battleRound(
  field: Battlefield,
  orders: BattleOrders,
  rng: () => number,
): Battlefield {
  if (field.phase === 'done') return field;

  let units = [...field.units];
  const log: string[] = [];

  for (const wing of WINGS) {
    const order = orders[wing];
    const target = resolveTarget(field, wing, order);
    const ours = wingStrength(field, 'court', wing);
    if (ours <= 0) continue;

    if (target === null) {
      if (order === 'withdraw') log.push(`我が${wingLabel(wing)}は退いて兵を保った`);
      continue;
    }

    const theirs = wingStrength(field, 'foe', target);
    const ourArm = wingArm(field, 'court', wing);
    const theirArm = wingArm(field, 'foe', target);

    // 猛将が率いると打撃が重い
    let ourPower =
      ours *
      (1 + field.leaderMilitary * 0.03 + (field.leaderTrait === 'mengjiang' ? TRAIT_ATTACK_BONUS : 0));
    if (order === 'flank') ourPower *= FLANK_BONUS;
    if (ourArm !== null && theirArm !== null && ARM_ADVANTAGE[ourArm] === theirArm) {
      ourPower *= ARM_BONUS;
    }
    // 河を渡る戦いは攻める側が不利になる
    if (field.terrain === 'river' && order !== 'withdraw') ourPower *= 0.9;
    if (field.terrain === 'hill' && order === 'flank') ourPower *= 1.08;
    /*
     * 山地は**道が細い。** 隊を横に並べられないので、正面から押す手が効かない。
     * 迂回にも補正を付けないので、山では数の差がそのまま出にくくなる
     */
    if (field.terrain === 'mountain' && order === 'advance') ourPower *= 0.9;

    const total = ourPower + theirs;
    const swing = total <= 0 ? 0 : (ourPower - theirs) / total;
    const noise = 0.85 + rng() * 0.3;

    const foeDamage = Math.max(0, swing) * theirs * 0.55 * noise;
    // 神算が率いると受ける損害が軽い
    const ourDamage =
      Math.max(0, -swing) *
      ours *
      0.55 *
      noise *
      (order === 'withdraw' ? WITHDRAW_RELIEF : 1) *
      (field.leaderTrait === 'shensuan' ? 1 - TRAIT_CASUALTY_RELIEF : 1);

    units = applyDamage(units, 'foe', target, foeDamage);
    units = applyDamage(units, 'court', wing, ourDamage);

    /*
     * **どちらの戦列かを必ず書く。**
     * 両軍とも左翼・中軍・右翼を持つので、「右翼が前進して右翼を崩した」では
     * どちらがどちらを崩したのか読めなかった
     */
    const ours_ = `我が${wingLabel(wing)}`;
    const theirs_ = `敵の${wingLabel(target)}`;
    log.push(
      swing > 0.15
        ? `${ours_}が${orderLabel(order)}して${theirs_}を崩した`
        : swing < -0.15
          ? `${ours_}は${theirs_}に押し返された`
          : `${ours_}と${theirs_}は相持したまま動かない`,
    );
  }

  const round = field.round + 1;
  const foeLeft = units
    .filter((u) => u.side === 'foe')
    .reduce((sum, u) => sum + u.strength * (u.morale / 100), 0);
  const ourLeft = units
    .filter((u) => u.side === 'court')
    .reduce((sum, u) => sum + u.strength * (u.morale / 100), 0);

  const done = round >= MAX_ROUNDS || foeLeft <= 0 || ourLeft <= 0;
  return {
    ...field,
    units,
    round,
    phase: done ? 'done' : 'orders',
    log: [...field.log, ...log],
  };
}

function applyDamage(
  units: BattleUnit[],
  side: 'court' | 'foe',
  wing: WingId,
  damage: number,
): BattleUnit[] {
  const targets = units.filter((u) => u.side === side && u.wing === wing && u.strength > 0);
  if (targets.length === 0 || damage <= 0) return units;
  const total = targets.reduce((sum, u) => sum + u.strength, 0);

  return units.map((unit) => {
    if (unit.side !== side || unit.wing !== wing || unit.strength <= 0) return unit;
    const share = unit.strength / total;
    const hit = damage * share;
    return {
      ...unit,
      strength: Math.max(0, unit.strength - hit),
      morale: Math.max(0, unit.morale - (hit / Math.max(1, unit.strength)) * 60),
    };
  });
}

/** 布陣も命令もされないまま送られた戦場を、中庸の指し手で決着させる */
export function autoResolveBattlefield(field: Battlefield, rng: () => number): Battlefield {
  let current = field;
  if (current.phase === 'deploy') {
    const placements: Record<string, WingId | null> = {};
    const ours = current.units.filter((u) => u.side === 'court');
    ours.forEach((unit, index) => {
      placements[unit.id] = WINGS[index % WINGS.length];
    });
    current = deployBattlefield(current, { placements });
  }
  while (current.phase !== 'done') {
    current = battleRound(current, { left: 'advance', center: 'advance', right: 'advance' }, rng);
  }
  return current;
}

/**
 * 戦場で積んだ優劣を1つの倍率にする。
 * 戦場そのものは tick() に渡る前に消え、残るのはこの数だけ
 */
export function battlefieldTactics(field: Battlefield): number {
  const ours = field.units
    .filter((u) => u.side === 'court')
    .reduce((sum, u) => sum + u.strength, 0);
  const theirs = field.units
    .filter((u) => u.side === 'foe')
    .reduce((sum, u) => sum + u.strength, 0);
  const total = ours + theirs;
  if (total <= 0) return 1;

  // 五分なら 1.0。押し切っていれば上限、押し切られていれば下限へ寄る
  const swing = (ours - theirs) / total;
  const scaled = 1 + swing * (swing > 0 ? TACTICS_MAX - 1 : 1 - TACTICS_MIN);
  return Math.max(TACTICS_MIN, Math.min(TACTICS_MAX, scaled));
}

export function wingLabel(wing: WingId): string {
  return wing === 'left' ? '左翼' : wing === 'center' ? '中軍' : '右翼';
}

export function orderLabel(order: WingOrder): string {
  return order === 'advance' ? '前進' : order === 'flank' ? '迂回' : '退却';
}
