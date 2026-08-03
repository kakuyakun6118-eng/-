import {
  ABILITY_MODIFIER_PER_POINT,
  ABILITY_NEUTRAL,
  ABILITY_ROLL_MAX,
  ABILITY_ROLL_MIN,
  ADULT_AGE,
  ASSASSINATION_BASE_PROBABILITY,
  ASSASSINATION_MAX_BONUS,
  CHILD_BIRTH_PROBABILITY,
  MAX_ABILITY,
  MAX_DYNASTY_MEMBERS,
  MAX_LEGITIMACY,
  MAX_LIFESPAN,
  MIN_ABILITY,
  MIN_LEGITIMACY,
  MIN_LIFESPAN,
  MIN_REIGN_YEARS,
  MIXED_BLOOD_LEGITIMACY_PENALTY,
  SUCCESSION_CRISIS_DURATION,
  SUCCESSION_LEGITIMACY_FLOOR,
  SUCCESSION_LEGITIMACY_LOSS_CRISIS,
  SUCCESSION_LEGITIMACY_LOSS_HEIR,
} from './constants';
import type {
  DynastyMember,
  GameState,
  Ruler,
  RulerAbilities,
  SuccessionOutcome,
} from './types';
import { partitionOnSuccession } from './partition';
import { clamp } from './util';

// ── 能力補正 ──────────────────────────────────────────

/**
 * 能力値を既存の計算式に掛ける補正倍率に変換する。
 * ABILITY_NEUTRAL で 1.0 になるため、平均的な君主のときは
 * 既存の数値バランスがそのまま維持される。
 * 能力は資源ではなく、あくまでこの倍率としてのみ作用する
 */
export function abilityModifier(ability: number): number {
  return 1 + (ability - ABILITY_NEUTRAL) * ABILITY_MODIFIER_PER_POINT;
}

/** 軍事 — 戦闘解決の防御側戦力にかかる補正 */
export function militaryModifier(state: GameState): number {
  return abilityModifier(state.dynasty.ruler.abilities.military);
}

/** 統治 — 税収にかかる補正 */
export function governanceModifier(state: GameState): number {
  return abilityModifier(state.dynasty.ruler.abilities.governance);
}

/** 交渉 — 貢納コストと交渉成功率にかかる補正 */
export function diplomacyModifier(state: GameState): number {
  return abilityModifier(state.dynasty.ruler.abilities.diplomacy);
}

// ── 生成 ──────────────────────────────────────────────

function rollInRange(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** 能力を生成する。極端な値が出ないよう ROLL の範囲に絞る */
export function rollAbilities(rng: () => number): RulerAbilities {
  return {
    military: rollInRange(rng, ABILITY_ROLL_MIN, ABILITY_ROLL_MAX),
    governance: rollInRange(rng, ABILITY_ROLL_MIN, ABILITY_ROLL_MAX),
    diplomacy: rollInRange(rng, ABILITY_ROLL_MIN, ABILITY_ROLL_MAX),
  };
}

/** 寿命を決める。seed 由来の rng のみを使い副作用を持たない */
export function rollLifespan(rng: () => number): number {
  return rollInRange(rng, MIN_LIFESPAN, MAX_LIFESPAN);
}

function nextMemberId(state: GameState, rng: () => number): string {
  return `p${state.year}_${Math.floor(rng() * 100000)}`;
}

/**
 * 後継者の名前を候補から引く。引いた名は候補から取り除く。
 *
 * 引きっぱなしにすると1回のプレイで同じ名の皇帝が何人も出て、
 * 年代記が読めなくなる。候補が尽きた場合でも遊べるよう、
 * 空なら生年を名にする
 */
function drawName(state: GameState, rng: () => number): { name: string; pool: string[] } {
  const pool = state.dynasty.namePool;
  if (pool.length === 0) return { name: `${state.year}年生`, pool };
  const index = Math.floor(rng() * pool.length);
  return { name: pool[index], pool: pool.filter((_, i) => i !== index) };
}

/**
 * 君主の名を付け替える。
 * 表示だけの変更で、どの計算式にも影響しないためフラグは立てない
 */
export function renameRuler(state: GameState, name: string): GameState {
  const trimmed = name.trim();
  if (trimmed.length === 0) return state;
  return {
    ...state,
    dynasty: { ...state.dynasty, ruler: { ...state.dynasty.ruler, name: trimmed } },
  };
}

// ── 死亡判定 ──────────────────────────────────────────

/** legitimacy が低いほど暗殺されやすい */
export function assassinationProbability(legitimacy: number): number {
  const shortfall = (MAX_LEGITIMACY - legitimacy) / MAX_LEGITIMACY;
  return ASSASSINATION_BASE_PROBABILITY + ASSASSINATION_MAX_BONUS * shortfall;
}

/**
 * 王朝の1年分の更新（コアループ ステップ8）。
 * 加齢・出生・寿命と暗殺の判定・継承処理をこの順で行う。
 * 乱数は引数の rng のみ。state を破壊しない
 */
export function updateDynasty(state: GameState, rng: () => number): GameState {
  let next = advanceCrisis(state);
  next = maybeBearChild(next, rng);

  const ruler = next.dynasty.ruler;
  const reignYears = next.year - ruler.accessionYear;

  // 最低在位年数の間は死なない。極端に短い連続交代を避ける
  if (reignYears < MIN_REIGN_YEARS) return next;

  const diedNaturally = next.year >= ruler.fatedDeathYear;
  const assassinated =
    !diedNaturally && rng() < assassinationProbability(next.legitimacy);

  if (!diedNaturally && !assassinated) return next;

  return succeed(next, assassinated ? 'assassination' : 'natural', rng);
}

function advanceCrisis(state: GameState): GameState {
  if (state.dynasty.crisisYearsRemaining <= 0) return state;
  return {
    ...state,
    dynasty: {
      ...state.dynasty,
      crisisYearsRemaining: state.dynasty.crisisYearsRemaining - 1,
    },
  };
}

/**
 * 子の誕生。
 * 外国との婚姻がなくてもローマ貴族との婚姻は前提とするため、
 * 配偶者の有無にかかわらず子は生まれる。
 * 配偶者がいる場合のみ混血の後継者となり、請求権を得る
 */
function maybeBearChild(state: GameState, rng: () => number): GameState {
  const { dynasty } = state;
  if (dynasty.members.length >= MAX_DYNASTY_MEMBERS) return state;
  if (rng() >= CHILD_BIRTH_PROBABILITY) return state;

  const spouseOrigin = dynasty.ruler.spouse?.origin ?? null;
  const drawn = drawName(state, rng);
  const child: DynastyMember = {
    id: nextMemberId(state, rng),
    name: drawn.name,
    birthYear: state.year,
    abilities: rollAbilities(rng),
    lineage:
      spouseOrigin === null
        ? 'roman'
        : spouseOrigin.kind === 'east'
          ? 'east'
          : spouseOrigin.factionId,
    legitimate: true,
    mixedBlood: spouseOrigin !== null,
    // 混血の後継者はその勢力に対する請求権を得る
    claims: spouseOrigin?.kind === 'barbarian' ? [spouseOrigin.factionId] : [],
  };

  return {
    ...state,
    dynasty: {
      ...dynasty,
      namePool: drawn.pool,
      members: [...dynasty.members, child],
      ruler: { ...dynasty.ruler, childIds: [...dynasty.ruler.childIds, child.id] },
    },
  };
}

/** 継承。成人した嫡子がいれば継承、いなければ継承危機 */
function succeed(
  state: GameState,
  cause: 'natural' | 'assassination',
  rng: () => number,
): GameState {
  const { dynasty } = state;
  const heir = dynasty.members
    .filter((m) => m.legitimate && state.year - m.birthYear >= ADULT_AGE)
    .sort((a, b) => a.birthYear - b.birthYear)[0];

  const outcome: SuccessionOutcome = heir ? 'heir' : 'crisis';
  const deadRuler: Ruler = { ...dynasty.ruler, deathYear: state.year };

  /*
   * 嫡子がいれば生まれたときの名をそのまま使うので候補は消費しない。
   * いない場合だけ、王朝外から担ぎ出される人物に名を引く
   */
  const outsider = heir === undefined ? drawName(state, rng) : null;
  const successor: DynastyMember =
    heir ??
    {
      id: nextMemberId(state, rng),
      name: outsider === null ? '' : outsider.name,
      birthYear: state.year - ADULT_AGE * 2,
      abilities: rollAbilities(rng),
      lineage: 'roman',
      legitimate: false,
      mixedBlood: false,
      claims: [],
    };

  const newRuler: Ruler = {
    ...successor,
    accessionYear: state.year,
    fatedDeathYear: state.year + rollLifespan(rng) - (state.year - successor.birthYear),
    deathYear: null,
    spouse: null,
    childIds: [],
  };

  let legitimacyLoss =
    outcome === 'heir'
      ? SUCCESSION_LEGITIMACY_LOSS_HEIR
      : SUCCESSION_LEGITIMACY_LOSS_CRISIS;
  if (successor.mixedBlood) legitimacyLoss += MIXED_BLOOD_LEGITIMACY_PENALTY;

  /*
   * 減衰装置: 継承による低下は SUCCESSION_LEGITIMACY_FLOOR までに留める。
   * 継承危機が「正統性低下→暗殺→継承危機」の無限スパイラルで
   * 帝国を単独で殺すのを防ぐ。すでに床を割っている場合は追加で下げない
   */
  const flooredLegitimacy = Math.max(
    Math.min(state.legitimacy, SUCCESSION_LEGITIMACY_FLOOR),
    state.legitimacy - legitimacyLoss,
  );

  const succeeded: GameState = {
    ...state,
    legitimacy: clamp(flooredLegitimacy, MIN_LEGITIMACY, MAX_LEGITIMACY),
    dynasty: {
      ...dynasty,
      namePool: outsider?.pool ?? dynasty.namePool,
      ruler: newRuler,
      members: dynasty.members.filter((m) => m.id !== successor.id),
      history: [
        ...dynasty.history,
        { rulerId: deadRuler.id, name: deadRuler.name, year: state.year, cause, outcome },
      ],
      crisisYearsRemaining:
        outcome === 'crisis' ? SUCCESSION_CRISIS_DURATION : dynasty.crisisYearsRemaining,
    },
  };

  /*
   * 統一を果たしていた場合、残った成人の後継者が複数いれば帝国は割れる。
   * 継承者を1人に絞った皇帝だけが全土をそのまま渡せる
   */
  return partitionOnSuccession(succeeded, ADULT_AGE);
}

// ── Task 4: 能力の変更口 ──────────────────────────────

/**
 * 設定から現君主の能力を変更する。
 * 変更したセーブには abilitiesAdjusted が立ち、スコア結果に
 * 「調整済み」として記録される。記録がないとスコア比較が
 * 意味を失うため、このフラグは解除できない
 */
export function adjustRulerAbilities(
  state: GameState,
  abilities: Partial<RulerAbilities>,
): GameState {
  const current = state.dynasty.ruler.abilities;
  const applied: RulerAbilities = {
    military: clamp(abilities.military ?? current.military, MIN_ABILITY, MAX_ABILITY),
    governance: clamp(abilities.governance ?? current.governance, MIN_ABILITY, MAX_ABILITY),
    diplomacy: clamp(abilities.diplomacy ?? current.diplomacy, MIN_ABILITY, MAX_ABILITY),
  };
  return {
    ...state,
    dynasty: {
      ...state.dynasty,
      ruler: { ...state.dynasty.ruler, abilities: applied },
      abilitiesAdjusted: true,
    },
  };
}
