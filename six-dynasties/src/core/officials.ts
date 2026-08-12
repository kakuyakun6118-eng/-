import officialsData from '../data/officials.json';
import leadersData from '../data/leaders.json';
import {
  APPOINT_COST,
  CANDIDATE_COUNT,
  DISMISS_ARMY_LOSS,
  DISMISS_MANDATE_GAIN,
  EXCEPTIONAL_MARSHAL_PROBABILITY,
  INSPECTOR_REVOLT_AMBITION_PER_POINT,
  INSPECTOR_REVOLT_BASE,
  OFFICIAL_MAX_TENURE,
  OFFICIAL_MIN_TENURE,
  USURPATION_THRESHOLD,
} from './constants';
import type { GameState, Official, ProvinceId } from './types';
import { clamp100, heldProvinceIds, pick, randomInt } from './util';

const SURNAMES = officialsData.surnames as string[];
const GIVEN_NAMES = officialsData.givenNames as string[];
const HISTORICAL_MARSHALS = leadersData.marshals as {
  name: string;
  from: number;
  to: number;
  military: number;
}[];

/** 史実の将を迎えるとき、残り任期がこれを切るなら通常の抽選に落とす */
const MIN_REMAINING_TENURE = 5;

export function randomName(rng: () => number): string {
  return `${pick(rng, SURNAMES) ?? '王'}${pick(rng, GIVEN_NAMES) ?? '導'}`;
}

/** 候補を1人こしらえる。能力と野心は別の軸で引く */
export function makeCandidate(rng: () => number, seedId: number): Official {
  return {
    id: `cand_${seedId}`,
    name: randomName(rng),
    competence: randomInt(rng, 3, 9),
    ambition: randomInt(rng, 1, 10),
    tenure: randomInt(rng, OFFICIAL_MIN_TENURE, OFFICIAL_MAX_TENURE),
    gentryBorn: rng() < 0.65,
  };
}

/** 任命の候補は毎年入れ替える。3人から選ぶので「能力か野心か」が判断になる */
export function refreshCandidates(state: GameState, rng: () => number): GameState {
  const candidates: Official[] = [];
  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    candidates.push(makeCandidate(rng, state.turn * 10 + i));
  }
  return { ...state, candidates };
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
  const official = state.candidates.find((c) => c.id === officialId);
  if (official === undefined) return state;
  if (state.treasury < APPOINT_COST) return state;
  return {
    ...state,
    treasury: state.treasury - APPOINT_COST,
    chancellor: { ...official, id: `chan_${state.turn}` },
    candidates: state.candidates.filter((c) => c.id !== officialId),
  };
}

/** 解任は行動枠を消費する。天命が戻る政治的な行為なので無料の上振れにしない */
export function dismissChancellor(state: GameState): GameState {
  if (state.chancellor === null) return state;
  return {
    ...state,
    chancellor: null,
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
  const official = state.candidates.find((c) => c.id === officialId);
  if (official === undefined) return state;
  const province = state.provinces[provinceId];
  if (province === undefined || province.holder !== null) return state;
  if (state.treasury < APPOINT_COST) return state;

  return {
    ...state,
    treasury: state.treasury - APPOINT_COST,
    inspectors: { ...state.inspectors, [provinceId]: { ...official, id: `insp_${provinceId}_${state.turn}` } },
    candidates: state.candidates.filter((c) => c.id !== officialId),
  };
}

export function dismissInspector(state: GameState, provinceId: ProvinceId): GameState {
  if (state.inspectors[provinceId] === undefined) return state;
  const inspectors = { ...state.inspectors };
  delete inspectors[provinceId];
  return { ...state, inspectors, mandate: clamp100(state.mandate + DISMISS_MANDATE_GAIN) };
}

// ── 都督中外諸軍事 ────────────────────────────────────

/**
 * 都督を任命する。
 *
 * **史実の将はその在職の年に迎える。** 桓温・謝玄・劉裕・陳慶之は
 * その年に任命すれば来る。一度仕えた将は二度は出ない。
 * 史実の将がいない年は通常の抽選だが、12%で軍事10の将が出る
 */
export function appointMarshal(state: GameState, rng: () => number): GameState {
  if (state.treasury < APPOINT_COST) return state;

  const historical = HISTORICAL_MARSHALS.find(
    (entry) =>
      state.year >= entry.from &&
      state.year <= entry.to &&
      entry.to - state.year >= MIN_REMAINING_TENURE &&
      !state.marshal.hiredHistorical.includes(entry.name),
  );

  const official: Official =
    historical !== undefined
      ? {
          id: `marshal_${state.turn}`,
          name: historical.name,
          competence: historical.military,
          ambition: randomInt(rng, 4, 9),
          tenure: historical.to - state.year,
          gentryBorn: true,
        }
      : {
          id: `marshal_${state.turn}`,
          name: randomName(rng),
          competence:
            rng() < EXCEPTIONAL_MARSHAL_PROBABILITY ? 10 : randomInt(rng, 3, 8),
          ambition: randomInt(rng, 2, 10),
          tenure: randomInt(rng, OFFICIAL_MIN_TENURE, OFFICIAL_MAX_TENURE),
          gentryBorn: rng() < 0.5,
        };

  return {
    ...state,
    treasury: state.treasury - APPOINT_COST,
    marshal: {
      holder: official,
      hiredHistorical:
        historical === undefined
          ? state.marshal.hiredHistorical
          : [...state.marshal.hiredHistorical, historical.name],
    },
  };
}

/** 解任すると天命は戻るが、その将に従っていた兵は離れる */
export function dismissMarshal(state: GameState): GameState {
  if (state.marshal.holder === null) return state;
  return {
    ...state,
    marshal: { ...state.marshal, holder: null },
    centralArmy: state.centralArmy * (1 - DISMISS_ARMY_LOSS),
    mandate: clamp100(state.mandate + DISMISS_MANDATE_GAIN),
  };
}

// ── 任期と反乱 ────────────────────────────────────────

/** 任期。退任しても後任は自動では決まらない */
export function updateOfficials(state: GameState): GameState {
  let next = state;

  if (next.chancellor !== null) {
    const tenure = next.chancellor.tenure - 1;
    next = { ...next, chancellor: tenure <= 0 ? null : { ...next.chancellor, tenure } };
  }
  if (next.marshal.holder !== null) {
    const tenure = next.marshal.holder.tenure - 1;
    next = {
      ...next,
      marshal: {
        ...next.marshal,
        holder: tenure <= 0 ? null : { ...next.marshal.holder, tenure },
      },
    };
  }

  const inspectors = { ...next.inspectors };
  let changed = false;
  for (const id of Object.keys(inspectors) as ProvinceId[]) {
    const inspector = inspectors[id];
    if (inspector === undefined) continue;
    const tenure = inspector.tenure - 1;
    if (tenure <= 0) {
      delete inspectors[id];
    } else {
      inspectors[id] = { ...inspector, tenure };
    }
    changed = true;
  }
  return changed ? { ...next, inspectors } : next;
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
