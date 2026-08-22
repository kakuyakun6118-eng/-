import officialsData from '../data/officials.json';
import {
  APPOINT_COST,
  DISMISS_ARMY_LOSS,
  DISMISS_MANDATE_GAIN,
  INSPECTOR_REVOLT_AMBITION_PER_POINT,
  INSPECTOR_REVOLT_BASE,
  USURPATION_THRESHOLD,
} from './constants';
import type { GameState, Official, ProvinceId } from './types';
import { clamp100, heldProvinceIds, pick } from './util';

const SURNAMES = officialsData.surnames as string[];
const GIVEN_NAMES = officialsData.givenNames as string[];
export function randomName(rng: () => number): string {
  return `${pick(rng, SURNAMES) ?? '王'}${pick(rng, GIVEN_NAMES) ?? '導'}`;
}

/**
 * 名簿から一人を席に就ける。
 *
 * **席によって問われる能力が違う。** `competence` はその席の能力の写しで、
 * 都督なら統率、文官なら政治を取る。既存の計算式はこれを見ているので、
 * 五能力を足しても式を書き換えずに済む
 */
function seat(officer: Official, ability: 'leadership' | 'politics'): Official {
  return { ...officer, competence: officer.abilities[ability] };
}

/** 席を降りた者は配下に戻る。二度と会えないわけではない */
function returnToRoster(state: GameState, officer: Official | null): Official[] {
  if (officer === null) return state.candidates;
  if (state.year > officer.untilYear) return state.candidates;
  return [...state.candidates, { ...officer, retained: true }];
}

// ── 録尚書事 ──────────────────────────────────────────

/**
 * 任命は行動枠を消費しない。
 *
 * 録尚書事1人と刺史15人は任期がばらばらに切れるので、枠を食わせると
 * ほぼ毎年どちらかの任命に追われ、派遣も徴募もできなくなる。
 * 任命は詔一本の話であって1年を費やす行動ではない。
 * 無償ではない — 金がかかり、野心の高い者を選べば反乱が増える
 */
export function appointChancellor(state: GameState, officialId: string): GameState {
  const official = state.candidates.find((c) => c.id === officialId && c.retained);
  if (official === undefined) return state;
  if (state.treasury < APPOINT_COST) return state;
  const rest = state.candidates.filter((c) => c.id !== officialId);
  return {
    ...state,
    treasury: state.treasury - APPOINT_COST,
    chancellor: seat(official, 'politics'),
    candidates: returnToRoster({ ...state, candidates: rest }, state.chancellor),
  };
}

/** 解任は行動枠を消費する。天命が戻る政治的な行為なので無料の上振れにしない */
export function dismissChancellor(state: GameState): GameState {
  if (state.chancellor === null) return state;
  return {
    ...state,
    chancellor: null,
    candidates: returnToRoster(state, state.chancellor),
    mandate: clamp100(state.mandate + DISMISS_MANDATE_GAIN),
    gentry: clamp100(state.gentry - 4),
  };
}

// ── 刺史 ──────────────────────────────────────────────

export function appointInspector(
  state: GameState,
  provinceId: ProvinceId,
  officialId: string,
): GameState {
  const official = state.candidates.find((c) => c.id === officialId && c.retained);
  if (official === undefined) return state;
  const province = state.provinces[provinceId];
  if (province === undefined || province.holder !== null) return state;
  if (state.treasury < APPOINT_COST) return state;

  const rest = state.candidates.filter((c) => c.id !== officialId);
  return {
    ...state,
    treasury: state.treasury - APPOINT_COST,
    inspectors: { ...state.inspectors, [provinceId]: seat(official, 'politics') },
    candidates: returnToRoster({ ...state, candidates: rest }, state.inspectors[provinceId] ?? null),
  };
}

export function dismissInspector(state: GameState, provinceId: ProvinceId): GameState {
  const inspector = state.inspectors[provinceId];
  if (inspector === undefined) return state;
  const inspectors = { ...state.inspectors };
  delete inspectors[provinceId];
  return {
    ...state,
    inspectors,
    candidates: returnToRoster(state, inspector),
    mandate: clamp100(state.mandate + DISMISS_MANDATE_GAIN),
  };
}

// ── 都督中外諸軍事 ────────────────────────────────────

/**
 * 都督を任命する。
 *
 * **史実の将はその在職の年に迎える。** 桓温・謝玄・劉裕・陳慶之は
 * その年に任命すれば来る。一度仕えた将は二度は出ない。
 * 史実の将がいない年は通常の抽選だが、12%で軍事10の将が出る
 */
export function appointMarshal(
  state: GameState,
  rng: () => number,
  officerId?: string,
): GameState {
  if (state.treasury < APPOINT_COST) return state;

  /*
   * **都督は名簿から選ぶ。** かつては任命のたびに能力を抽選していたので、
   * 桓温は「軍事8の誰か」でしかなく、罷免すればその人物ごと消えた。
   * いまは在野から登用した者のうち、統率の高い者を推す
   */
  const retained = state.candidates.filter((c) => c.retained);
  const chosen =
    officerId === undefined
      ? [...retained].sort((a, b) => b.abilities.leadership - a.abilities.leadership)[0]
      : retained.find((c) => c.id === officerId);
  if (chosen === undefined) return state;

  const rest = state.candidates.filter((c) => c.id !== chosen.id);
  return {
    ...state,
    treasury: state.treasury - APPOINT_COST,
    marshal: { ...state.marshal, holder: seat(chosen, 'leadership') },
    candidates: returnToRoster({ ...state, candidates: rest }, state.marshal.holder),
  };
}

/** 解任すると天命は戻るが、その将に従っていた兵は離れる */
export function dismissMarshal(state: GameState): GameState {
  if (state.marshal.holder === null) return state;
  return {
    ...state,
    marshal: { ...state.marshal, holder: null },
    candidates: returnToRoster(state, state.marshal.holder),
    centralArmy: state.centralArmy * (1 - DISMISS_ARMY_LOSS),
    mandate: clamp100(state.mandate + DISMISS_MANDATE_GAIN),
  };
}

// ── 任期と反乱 ────────────────────────────────────────

/**
 * 席の年ごとの更新。
 *
 * **武将は没年まで仕える。** かつては「任期」を数えて勝手に辞めさせていたが、
 * それは任命のたびに人物を抽選していた頃の名残で、名簿を持たせたいまは
 * 席が空く理由が無いのに空いた（実測で都督が居る年が26%しかなかった）。
 * 席を降りるのは、没したとき・罷免したとき・忠誠が尽きたときだけである。
 * `tenure` は残りの年数を写した表示用の数に変えた
 */
export function updateOfficials(state: GameState): GameState {
  const age = (official: Official | null): Official | null => {
    if (official === null) return null;
    if (state.year > official.untilYear) return null;
    return { ...official, tenure: Math.max(0, official.untilYear - state.year) };
  };

  const inspectors: GameState['inspectors'] = {};
  for (const id of Object.keys(state.inspectors) as ProvinceId[]) {
    const kept = age(state.inspectors[id] ?? null);
    if (kept !== null) inspectors[id] = kept;
  }

  return {
    ...state,
    marshal: { ...state.marshal, holder: age(state.marshal.holder) },
    chancellor: age(state.chancellor),
    inspectors,
  };
}

/**
 * 刺史の反乱。**天命に関わらず毎年判定する。**
 *
 * 天命の低さは確率を押し上げる要因として効かせる。
 * 王敦も桓玄も侯景も、崩壊は中央からではなく方鎮から始まった
 */
export function checkInspectorRevolts(state: GameState, rng: () => number): GameState {
  const pressure =
    state.mandate >= USURPATION_THRESHOLD * 2
      ? 0
      : (USURPATION_THRESHOLD * 2 - state.mandate) / (USURPATION_THRESHOLD * 2);

  let next = state;
  for (const provinceId of heldProvinceIds(state)) {
    const inspector = next.inspectors[provinceId];
    if (inspector === undefined) continue;
    const chance =
      INSPECTOR_REVOLT_BASE *
      (1 + inspector.ambition * INSPECTOR_REVOLT_AMBITION_PER_POINT) *
      (1 + pressure * 5);
    if (rng() >= chance) continue;

    const province = next.provinces[provinceId];
    const inspectors = { ...next.inspectors };
    delete inspectors[provinceId];
    next = {
      ...next,
      inspectors,
      provinces: {
        ...next.provinces,
        [provinceId]: {
          ...province,
          control: clamp100(province.control - 25),
          garrison: province.garrison * 0.5,
        },
      },
      mandate: clamp100(next.mandate - 5),
    };
  }
  return next;
}
