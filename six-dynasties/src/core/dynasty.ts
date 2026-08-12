import {
  ABDICATION_CONTROL_LOSS,
  ABDICATION_GENTRY_LOSS,
  ABDICATION_MANDATE_RESTORE,
  ABDICATION_PRINCE_LOSS,
  ADULT_AGE,
  ASSASSINATION_BASE,
  ASSASSINATION_MANDATE_THRESHOLD,
  ASSASSINATION_PRESSURE_MAX,
  BIRTH_CONSORT_BONUS,
  BIRTH_PROBABILITY,
  DYNASTY_MEMBER_MAX,
  EXCEPTIONAL_MIN_ABILITY,
  EXCEPTIONAL_RULER_PROBABILITY,
  MIN_REIGN_YEARS,
  MIXED_BLOOD_MANDATE_PENALTY,
  RULER_MAX_ABILITY,
  RULER_MAX_LIFESPAN,
  RULER_MIN_ABILITY,
  RULER_MIN_LIFESPAN,
  SUCCESSION_CRISIS_MANDATE_LOSS,
  SUCCESSION_HEIR_MANDATE_LOSS,
  SUCCESSION_KIN_MANDATE_LOSS,
} from './constants';
import { randomName } from './officials';
import type {
  Abilities,
  DeathCause,
  DeathRecord,
  GameState,
  Person,
  ProvinceId,
  SuccessionOutcome,
} from './types';
import { clamp100, pick, randomInt } from './util';

/** 在位中の君主の名を付け替える。表示だけの変更でどの計算式にも影響しない */
export function renameRuler(state: GameState, name: string): GameState {
  const trimmed = name.trim();
  if (trimmed === '') return state;
  return {
    ...state,
    dynasty: { ...state.dynasty, ruler: { ...state.dynasty.ruler, name: trimmed } },
  };
}

/**
 * 能力を引く。**10%で能力7〜10の名君**が出る。
 *
 * 通常の抽選は3〜8なので、これが無いと9・10の君主が決して生まれず、
 * 北朝の拓跋燾や宇文邕に対して一方的に不利になる
 */
/** 天寿を引く。人物が生まれたときに一度だけ呼ぶ */
function rollLifespan(rng: () => number): number {
  return randomInt(rng, RULER_MIN_LIFESPAN, RULER_MAX_LIFESPAN);
}

function rollAbilities(rng: () => number): Abilities {
  const exceptional = rng() < EXCEPTIONAL_RULER_PROBABILITY;
  const low = exceptional ? EXCEPTIONAL_MIN_ABILITY : RULER_MIN_ABILITY;
  const high = exceptional ? 10 : RULER_MAX_ABILITY;
  return {
    military: randomInt(rng, low, high),
    administration: randomInt(rng, low, high),
    charisma: randomInt(rng, low, high),
  };
}

/**
 * 王朝の更新。加齢 → 出生 → 寿命と暗殺の判定 → 継承 の順に処理する
 */
export function updateDynasty(state: GameState, rng: () => number): GameState {
  let next = ageEveryone(state);
  next = maybeBirth(next, rng);

  const ruler = next.dynasty.ruler;
  const lastReign = next.dynasty.history[next.dynasty.history.length - 1];
  const reigned = next.year - (lastReign?.year ?? next.dynasty.foundedYear);
  // 在位が極端に短い連続交代を避ける
  if (reigned < MIN_REIGN_YEARS) return next;

  const died = ruler.age >= ruler.lifespan;

  // 暗殺。この時代の帝の死因として自然死より妥当で、既存の天命を機能させられる
  const pressure =
    next.mandate >= ASSASSINATION_MANDATE_THRESHOLD
      ? 0
      : ((ASSASSINATION_MANDATE_THRESHOLD - next.mandate) / ASSASSINATION_MANDATE_THRESHOLD) *
        ASSASSINATION_PRESSURE_MAX;
  const assassinated = rng() < ASSASSINATION_BASE * (1 + pressure);

  if (!died && !assassinated) return next;
  return succeed(next, assassinated ? 'assassination' : 'natural', rng);
}

function ageEveryone(state: GameState): GameState {
  return {
    ...state,
    dynasty: {
      ...state.dynasty,
      ruler: { ...state.dynasty.ruler, age: state.dynasty.ruler.age + 1 },
      members: state.dynasty.members.map((m) => ({ ...m, age: m.age + 1 })),
    },
  };
}

/**
 * 毎年、子が生まれる目を引く。
 *
 * 皇后を迎えていればその分だけ確率が上がるが、迎えていなくても引く。
 * 婚姻を唯一の道にすると、一族が尽きたあとは代替わりのたびに
 * 継承危機になり、王朝が十年ごとに替わってしまう
 */
function maybeBirth(state: GameState, rng: () => number): GameState {
  if (state.dynasty.members.length >= DYNASTY_MEMBER_MAX) return state;
  const consort = state.dynasty.consort;
  const chance = BIRTH_PROBABILITY + (consort === null ? 0 : BIRTH_CONSORT_BONUS);
  if (rng() >= chance) return state;
  const child: Person = {
    id: `child_${state.year}`,
    name: pickName(state) ?? randomName(rng),
    age: 0,
    lifespan: rollLifespan(rng),
    abilities: rollAbilities(rng),
    relation: 'child',
    // 胡族との間に生まれた後継は混血。即位のとき天命に負の補正がつく
    lineage: consort !== null && consort.kind === 'tribe' ? 'mixed' : 'han',
  };

  return {
    ...state,
    dynasty: {
      ...state.dynasty,
      members: [...state.dynasty.members, child],
      namePool: state.dynasty.namePool.filter((n) => n !== child.name),
    },
  };
}

/** 代替わりの名を引く。引いた名は候補から取り除く */
function pickName(state: GameState): string | null {
  return state.dynasty.namePool[0] ?? null;
}

/**
 * 継承。**血の近い順に3段。**
 *
 * | 順位 | 誰が継ぐか | 天命の低下 |
 * |---|---|---|
 * | 1 | 皇帝自身の成人した嫡子 | 3 |
 * | 2 | 子がいなければ兄弟・傍系の一族 | 8 |
 * | 3 | 一族が尽きれば継承危機（王朝の外から担ぎ出す） | 18 |
 */
function succeed(state: GameState, cause: DeathCause, rng: () => number): GameState {
  const dynasty = state.dynasty;
  const adults = dynasty.members.filter((m) => m.age >= ADULT_AGE);
  const heirs = adults.filter((m) => m.relation === 'child');
  const kin = adults.filter((m) => m.relation !== 'child');

  const chosen = heirs.length > 0 ? heirs[0] : kin.length > 0 ? kin[0] : null;
  const outcome: SuccessionOutcome =
    heirs.length > 0 ? 'heir' : kin.length > 0 ? 'kin' : 'crisis';

  const record: DeathRecord = {
    name: dynasty.ruler.name,
    houseName: dynasty.houseName,
    year: state.year,
    age: dynasty.ruler.age,
    cause,
    outcome,
  };

  const mandateLoss =
    outcome === 'heir'
      ? SUCCESSION_HEIR_MANDATE_LOSS
      : outcome === 'kin'
        ? SUCCESSION_KIN_MANDATE_LOSS
        : SUCCESSION_CRISIS_MANDATE_LOSS;

  if (chosen !== null) {
    const remaining = dynasty.members.filter((m) => m.id !== chosen.id);
    const mixedPenalty = chosen.lineage === 'mixed' ? MIXED_BLOOD_MANDATE_PENALTY : 0;
    return {
      ...state,
      mandate: clamp100(state.mandate - mandateLoss - mixedPenalty),
      dynasty: {
        ...dynasty,
        // 継いだ者は皇帝になるので、以後の続柄は 'self'
        ruler: { ...chosen, relation: 'self' },
        members: remaining,
        history: [...dynasty.history, record],
        // 代が替われば皇后も替わる
        consort: null,
      },
      turnEvents: [...state.turnEvents, ...(outcome === 'crisis' ? (['succession_crisis'] as const) : [])],
    };
  }

  return foundNewHouse(state, record, rng);
}

/**
 * 継承危機。嫡子も一族も残らず、王朝の外から担ぎ出された。
 *
 * **そこで前の家の代は途切れている。** 新しい王朝が興り、
 * 担ぎ出された当人の名を負う。晋から宋へ、宋から斉へと
 * 位が渡り続けた六朝の形をそのまま仕組みにしている
 */
function foundNewHouse(state: GameState, record: DeathRecord, rng: () => number): GameState {
  const dynasty = state.dynasty;
  const houseName = dynasty.housePool[0] ?? `${dynasty.houseName}後`;
  const founder: Person = {
    id: `founder_${state.year}`,
    name: dynasty.namePool[0] ?? randomName(rng),
    age: randomInt(rng, 28, 48),
    lifespan: rollLifespan(rng),
    abilities: rollAbilities(rng),
    relation: 'self',
    lineage: 'han',
  };

  return {
    ...state,
    mandate: clamp100(state.mandate - SUCCESSION_CRISIS_MANDATE_LOSS),
    dynasty: {
      ...dynasty,
      houseName,
      foundedYear: state.year,
      ruler: founder,
      members: [],
      history: [...dynasty.history, record],
      namePool: dynasty.namePool.filter((n) => n !== founder.name),
      housePool: dynasty.housePool.filter((h) => h !== houseName),
      consort: null,
    },
    turnEvents: [...state.turnEvents, 'succession_crisis'],
  };
}

/**
 * 禅譲。天命が尽きた朝廷から、実権を握る者へ位が渡る。
 *
 * **これは敗北ではない。** 局は続き、王朝の号が替わり、天命が戻る。
 * 劉裕が晋から、蕭道成が宋から受けたのと同じことが起きる。
 * 代わりに前の家に連なる士族と宗室は離れ、州は動揺する
 */
export function abdicate(state: GameState, rng: () => number): GameState {
  const dynasty = state.dynasty;
  const houseName = dynasty.housePool[0] ?? `${dynasty.houseName}後`;

  // 実権を握っている者が位を受ける。都督がいればその人物
  const marshal = state.marshal.holder;
  const founder: Person = {
    id: `usurper_${state.year}`,
    name: marshal?.name ?? dynasty.namePool[0] ?? randomName(rng),
    age: randomInt(rng, 30, 52),
    lifespan: rollLifespan(rng),
    abilities:
      marshal === null
        ? rollAbilities(rng)
        : {
            military: marshal.competence,
            administration: randomInt(rng, RULER_MIN_ABILITY, RULER_MAX_ABILITY),
            charisma: randomInt(rng, RULER_MIN_ABILITY, RULER_MAX_ABILITY),
          },
    relation: 'self',
    lineage: 'han',
  };

  const record: DeathRecord = {
    name: dynasty.ruler.name,
    houseName: dynasty.houseName,
    year: state.year,
    age: dynasty.ruler.age,
    cause: 'natural',
    outcome: 'crisis',
  };

  // 州が動揺する。位が渡った年は天下が揺れる
  const provinces = { ...state.provinces };
  for (const id of Object.keys(provinces) as ProvinceId[]) {
    const province = provinces[id];
    if (province.holder !== null) continue;
    provinces[id] = { ...province, control: clamp100(province.control - ABDICATION_CONTROL_LOSS) };
  }

  return {
    ...state,
    provinces,
    mandate: clamp100(Math.max(state.mandate, ABDICATION_MANDATE_RESTORE)),
    gentry: clamp100(state.gentry - ABDICATION_GENTRY_LOSS),
    princeLoyalty: clamp100(state.princeLoyalty - ABDICATION_PRINCE_LOSS),
    // 位を受けた将は帝になるので、都督の席は空く
    marshal: { ...state.marshal, holder: null },
    // 前の家の宗室は諸王ではなくなる
    princes: state.princes.filter((p) => p.inRevolt),
    dynasty: {
      ...dynasty,
      houseName,
      foundedYear: state.year,
      ruler: founder,
      members: [],
      history: [...dynasty.history, record],
      namePool: dynasty.namePool.filter((n) => n !== founder.name),
      housePool: dynasty.housePool.filter((h) => h !== houseName),
      consort: null,
      pendingMarriages: [],
    },
    turnEvents: [...state.turnEvents, 'abdication'],
  };
}
