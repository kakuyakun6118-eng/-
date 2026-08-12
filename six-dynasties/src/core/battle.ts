import {
  AUXILIARY_DEFENSE_SHARE,
  BATTLE_ARMY_SHARE,
  BATTLE_CAPTURE_PROBABILITY,
  BATTLE_LOSS_MANDATE,
  BATTLE_ROUT_RATIO,
  BATTLE_SOVEREIGN_MIN_MILITARY,
  BATTLE_WIN_MANDATE,
  DEFENSE_MULTIPLIER,
  DEPLOY_SHARE,
  INSPECTOR_DEFENSE_PER_POINT,
  MARSHAL_MILITARY_PER_POINT,
  MARSHAL_VACANT_PENALTY,
  MOBILIZE_EFFICIENCY,
  MOBILIZE_GARRISON_SHARE,
  MOBILIZE_MAX_PROVINCES,
  SOVEREIGN_MILITARY_PER_POINT,
} from './constants';
import type { BattleFoe, BattleLeader, GameState, ProvinceId } from './types';
import { clamp100 } from './util';

/**
 * 守る側の戦力。
 *
 * 州兵 ＋ 刺史の補正 ＋ 差し向けた中軍 ＋ 義従胡の加勢に、
 * 君主と都督の軍事能力が掛かる。**新しい資源は足さず、
 * すべて既存の数値への補正としてのみ働かせる**
 */
export function defenceStrength(
  state: GameState,
  provinceId: ProvinceId,
  reinforced: ReadonlySet<ProvinceId>,
): number {
  const province = state.provinces[provinceId];
  if (province === undefined) return 0;

  const inspector = state.inspectors[provinceId];
  let power = province.garrison * (1 + (inspector?.competence ?? 0) * INSPECTOR_DEFENSE_PER_POINT);

  if (reinforced.has(provinceId)) power += state.centralArmy * DEPLOY_SHARE;

  // 義従胡はその年の戦線に加わる。安く戦線を埋められる代わりに給が要る
  const auxiliaries = Object.values(state.factions).filter((f) => f.stance === 'auxiliary');
  power += auxiliaries.reduce((sum, f) => sum + f.strength, 0) * AUXILIARY_DEFENSE_SHARE;

  const sovereign = 1 + state.dynasty.ruler.abilities.military * SOVEREIGN_MILITARY_PER_POINT;
  const marshal = state.marshal.holder;
  const marshalFactor =
    marshal === null
      ? MARSHAL_VACANT_PENALTY
      : 1 + marshal.competence * MARSHAL_MILITARY_PER_POINT;

  return power * sovereign * marshalFactor * DEFENSE_MULTIPLIER;
}

// ── 会戦 ──────────────────────────────────────────────

/** 会戦の相手として戦場に出ている者を列挙する */
export function availableFoes(state: GameState): BattleFoe[] {
  const foes: BattleFoe[] = [];
  for (const faction of Object.values(state.factions)) {
    if (faction.stance !== 'hostile') continue;
    if (faction.location === 'exterior') continue;
    foes.push({ kind: 'faction', factionId: faction.id });
  }
  if (state.north !== null && state.north.offensiveSince !== null) foes.push({ kind: 'north' });
  for (const prince of state.princes) {
    if (prince.inRevolt) foes.push({ kind: 'prince', princeId: prince.id });
  }
  return foes;
}

export function canGiveBattle(state: GameState, foe: BattleFoe): boolean {
  return availableFoes(state).some((candidate) => sameFoe(candidate, foe));
}

export function sameFoe(a: BattleFoe, b: BattleFoe): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'faction' && b.kind === 'faction') return a.factionId === b.factionId;
  if (a.kind === 'prince' && b.kind === 'prince') return a.princeId === b.princeId;
  return true;
}

/**
 * 率いられる者。
 *
 * 軍を率いたのは皇帝ではなく都督だった、というこの時代の形を
 * そのまま条件にする。皇帝は軍事6以上なければ親征できない
 */
export function availableBattleLeaders(state: GameState): BattleLeader[] {
  const leaders: BattleLeader[] = [];
  if (state.dynasty.ruler.abilities.military >= BATTLE_SOVEREIGN_MIN_MILITARY) {
    leaders.push('sovereign');
  }
  if (state.marshal.holder !== null) leaders.push('marshal');
  return leaders;
}

export function leaderName(state: GameState, leader: BattleLeader): string {
  return leader === 'sovereign'
    ? state.dynasty.ruler.name
    : (state.marshal.holder?.name ?? '（空位）');
}

export function leaderMilitary(state: GameState, leader: BattleLeader): number {
  return leader === 'sovereign'
    ? state.dynasty.ruler.abilities.military
    : (state.marshal.holder?.competence ?? 0);
}

/** 相手の戦力 */
export function foeStrength(state: GameState, foe: BattleFoe): number {
  if (foe.kind === 'faction') return state.factions[foe.factionId]?.strength ?? 0;
  if (foe.kind === 'north') return state.north?.strength ?? 0;
  return state.princes.find((p) => p.id === foe.princeId)?.troops ?? 0;
}

export function foeMilitary(state: GameState, foe: BattleFoe): number {
  if (foe.kind === 'north') return state.north?.rulerMilitary ?? 5;
  return 5;
}

/**
 * 会戦に呼び寄せる州兵。
 *
 * **新しい兵は生まれない。** 守備隊の半分が動くだけで、
 * 動員した州はその年のあいだ守りが薄くなる。
 * 会戦はたいてい侵入してきた敵と戦う年に選ぶので、
 * **手薄にした州がそのまま狙われる**という取引になる
 */
export function mobilizedStrength(state: GameState, mobilize: readonly ProvinceId[]): number {
  return mobilize
    .slice(0, MOBILIZE_MAX_PROVINCES)
    .reduce((sum, id) => {
      const province = state.provinces[id];
      if (province === undefined || province.holder !== null) return sum;
      return sum + province.garrison * MOBILIZE_GARRISON_SHARE * MOBILIZE_EFFICIENCY;
    }, 0);
}

export interface BattleResult {
  state: GameState;
  won: boolean;
  rout: boolean;
}

/**
 * 会戦の解決。
 *
 * 中軍の85%を投じるので、勝てば相手の主力を大きく削れるが、
 * 負ければ朝廷の主力が一度に失われる。
 * 差が大きい負けは大敗になり、州が動揺する
 */
export function giveBattle(
  state: GameState,
  foe: BattleFoe,
  leader: BattleLeader,
  rng: () => number,
  tactics: number,
  mobilize: readonly ProvinceId[],
): BattleResult {
  if (!canGiveBattle(state, foe) || !availableBattleLeaders(state).includes(leader)) {
    return { state, won: false, rout: false };
  }

  const committed = state.centralArmy * BATTLE_ARMY_SHARE;
  const mobilized = mobilizedStrength(state, mobilize);
  const ours =
    (committed + mobilized) *
    (1 + leaderMilitary(state, leader) * MARSHAL_MILITARY_PER_POINT) *
    tactics;
  const theirs = foeStrength(state, foe) * (1 + foeMilitary(state, foe) * 0.03);

  const total = ours + theirs;
  const won = rng() < (total <= 0 ? 0.5 : ours / total);
  const ratio = total <= 0 ? 1 : (won ? theirs / ours : ours / theirs);
  const rout = ratio < BATTLE_ROUT_RATIO;

  // 動員した州はその年のあいだ守りが薄くなる
  let provinces = state.provinces;
  for (const id of mobilize.slice(0, MOBILIZE_MAX_PROVINCES)) {
    const province = provinces[id];
    if (province === undefined || province.holder !== null) continue;
    provinces = {
      ...provinces,
      [id]: { ...province, garrison: province.garrison * (1 - MOBILIZE_GARRISON_SHARE) },
    };
  }

  const ourLosses = committed * (won ? (rout ? 0.15 : 0.28) : rout ? 0.72 : 0.5);
  let next: GameState = {
    ...state,
    provinces,
    centralArmy: Math.max(0, state.centralArmy - ourLosses),
    mandate: clamp100(state.mandate + (won ? BATTLE_WIN_MANDATE : -BATTLE_LOSS_MANDATE)),
    turnEvents: [...state.turnEvents, won ? 'battle_won' : 'battle_lost'],
  };

  // 相手の損害
  const foeLossShare = won ? (rout ? 0.55 : 0.34) : 0.12;
  if (foe.kind === 'faction') {
    const faction = next.factions[foe.factionId];
    next = {
      ...next,
      factions: {
        ...next.factions,
        [foe.factionId]: { ...faction, strength: faction.strength * (1 - foeLossShare) },
      },
    };
    // 撃退された勢力はその年のうちに引き揚げる
    if (won && rout && !faction.interior) {
      next = {
        ...next,
        factions: {
          ...next.factions,
          [foe.factionId]: {
            ...next.factions[foe.factionId],
            location: 'exterior',
          },
        },
      };
    }
  } else if (foe.kind === 'north' && next.north !== null) {
    next = {
      ...next,
      north: { ...next.north, strength: next.north.strength * (1 - foeLossShare) },
    };
  } else if (foe.kind === 'prince') {
    next = {
      ...next,
      princes: next.princes.map((p) =>
        p.id === foe.princeId ? { ...p, troops: p.troops * (1 - foeLossShare) } : p,
      ),
    };
    if (won && rout) {
      const prince = next.princes.find((p) => p.id === foe.princeId);
      next = {
        ...next,
        princes: next.princes.filter((p) => p.id !== foe.princeId),
        turnEvents: [...next.turnEvents, 'prince_suppressed'],
      };
      if (prince) {
        const province = next.provinces[prince.province];
        if (province?.holder === 'prince') {
          next = {
            ...next,
            provinces: {
              ...next.provinces,
              [prince.province]: { ...province, holder: null, control: Math.max(20, province.control) },
            },
          };
        }
      }
    }
  }

  // 大敗した年、親征した君主は捕らわれることがある
  if (!won && rout && leader === 'sovereign' && rng() < BATTLE_CAPTURE_PROBABILITY) {
    next = {
      ...next,
      mandate: clamp100(next.mandate - 14),
      turnEvents: [...next.turnEvents, 'sovereign_captured'],
    };
  }

  return { state: next, won, rout };
}
