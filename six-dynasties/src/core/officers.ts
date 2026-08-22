/*
 * 武将。
 *
 * **官職は席であり、武将は人である。** これまでは任命のたびに能力を抽選して
 * 席へ流し込んでいたので、桓温を「都督の能力8」としてしか扱えず、
 * 罷免すればその人物は消えた。名簿を持たせると、
 * 在野から登用し、官に就け、罷免しても配下に留まり、忠誠が尽きれば去る —
 * という**人の出入り**が扱えるようになる。
 *
 *   在野 →（登用）→ 配下・無官 →（任命）→ 官職 →（罷免）→ 配下・無官
 *                        ↓ 忠誠が尽きる            ↓ 没年
 *                      出奔・離反                  退場
 *
 * 五能力と個性を持つが、**新しい資源は作らない。** 個性はすべて
 * 既存の計算式に掛かる補正で、`traitBonus()` から引く
 */
import officersData from '../data/officers.json';
import {
  OFFICER_DEFECT_CONTROL_LOSS,
  OFFICER_DEFECT_MANDATE_LOSS,
  OFFICER_LOYALTY_AMBITION_PER_POINT,
  OFFICER_LOYALTY_DECAY,
  OFFICER_LOYALTY_START,
  OFFICER_POOL_MIN,
  RECRUIT_COST,
  RECRUIT_LOYALTY_GAIN,
  REWARD_COST,
  REWARD_LOYALTY_GAIN,
  TRAIT_LABELS,
} from './constants';
import type { GameState, Official, OfficerAbilities, ProvinceId, TraitId } from './types';
import { clamp100, randomInt } from './util';
import { randomName } from './officials';

interface OfficerEntry {
  name: string;
  from: number;
  to: number;
  lead: number;
  might: number;
  intel: number;
  pol: number;
  charm: number;
  trait: TraitId;
  ambition: number;
}

const ROSTER = officersData.officers as OfficerEntry[];

/** 個性の一覧。表示にも使う */
export const TRAITS = officersData.traits as { id: TraitId; name: string; note: string }[];

export function traitName(trait: TraitId): string {
  return TRAIT_LABELS[trait] ?? trait;
}

export function traitNote(trait: TraitId): string {
  return TRAITS.find((t) => t.id === trait)?.note ?? '';
}

// ── 名簿の出入り ──────────────────────────────────────

function fromEntry(entry: OfficerEntry, year: number): Official {
  return {
    id: `officer_${entry.name}`,
    name: entry.name,
    // 任命のときに席に応じて写し替える。名簿では統率を仮に置く
    competence: entry.lead,
    ambition: entry.ambition,
    tenure: Math.max(1, entry.to - year),
    gentryBorn: entry.pol >= 6,
    abilities: {
      leadership: entry.lead,
      might: entry.might,
      intellect: entry.intel,
      politics: entry.pol,
      charm: entry.charm,
    },
    trait: entry.trait,
    loyalty: OFFICER_LOYALTY_START,
    retained: false,
    untilYear: entry.to,
    historical: true,
  };
}

/** 名簿が薄い年を埋める無名の者。史実の人物だけでは年によって二人しかいない */
function makeUnknown(rng: () => number, year: number, seed: number): Official {
  const abilities: OfficerAbilities = {
    leadership: randomInt(rng, 2, 8),
    might: randomInt(rng, 2, 8),
    intellect: randomInt(rng, 2, 8),
    politics: randomInt(rng, 2, 8),
    charm: randomInt(rng, 2, 8),
  };
  const traits = TRAITS.map((t) => t.id);
  return {
    id: `officer_x${year}_${seed}`,
    name: randomName(rng),
    competence: abilities.leadership,
    ambition: randomInt(rng, 1, 10),
    tenure: randomInt(rng, 8, 26),
    gentryBorn: rng() < 0.55,
    abilities,
    trait: traits[Math.floor(rng() * traits.length)] ?? 'nengli',
    loyalty: OFFICER_LOYALTY_START,
    retained: false,
    untilYear: year + randomInt(rng, 14, 42),
    historical: false,
  };
}

/** いま席に就いている者をすべて拾う */
export function seatedOfficers(state: GameState): Official[] {
  const seated: Official[] = [];
  if (state.marshal.holder !== null) seated.push(state.marshal.holder);
  if (state.chancellor !== null) seated.push(state.chancellor);
  for (const inspector of Object.values(state.inspectors)) {
    if (inspector !== undefined) seated.push(inspector);
  }
  return seated;
}

/**
 * 名簿を年ごとに入れ替える。
 *
 * **史実の人物はその年に現れ、没年に去る。** 桓温は345年に在野として現れ、
 * 登用しなければ373年に何もせず去る。一度名簿に出した者は二度は出さない
 * （`seenOfficers`）ので、去った者が翌年また若返って現れることはない
 */
export function updateOfficerRoster(state: GameState, rng: () => number): GameState {
  const seen = new Set(state.seenOfficers);

  // 舞台を去る年を過ぎた者は名簿から消える
  let candidates = state.candidates.filter((o) => state.year <= o.untilYear);

  for (const entry of ROSTER) {
    if (state.year < entry.from || state.year > entry.to) continue;
    if (seen.has(entry.name)) continue;
    candidates = [...candidates, fromEntry(entry, state.year)];
    seen.add(entry.name);
  }

  // 在野が細ったら無名の者で埋める
  const available = candidates.filter((o) => !o.retained).length;
  for (let i = available; i < OFFICER_POOL_MIN; i++) {
    candidates = [...candidates, makeUnknown(rng, state.year, state.turn * 10 + i)];
  }

  return { ...state, candidates, seenOfficers: [...seen] };
}

/**
 * 登用。**金を積み、帝の魅力で口説く。**
 *
 * 断られても金は戻らない。野心の高い者ほど靡かず、
 * 人望のある帝ほど応じる者が多い
 */
export function recruitOfficer(
  state: GameState,
  officerId: string,
  rng: () => number,
): GameState {
  const officer = state.candidates.find((o) => o.id === officerId);
  if (officer === undefined || officer.retained) return state;
  if (state.treasury < RECRUIT_COST) return state;

  const paid: GameState = { ...state, treasury: state.treasury - RECRUIT_COST };
  const chance = recruitChance(state, officer);
  if (rng() >= chance) return paid;

  return {
    ...paid,
    candidates: paid.candidates.map((o) =>
      o.id === officerId
        ? { ...o, retained: true, loyalty: clamp100(o.loyalty + RECRUIT_LOYALTY_GAIN) }
        : o,
    ),
  };
}

/** 登用に応じる目。表示にも使うので切り出してある */
export function recruitChance(state: GameState, officer: Official): number {
  const charm = state.dynasty.ruler.abilities.charisma;
  const mandate = state.mandate / 100;
  const base = 0.42 + charm * 0.05 + mandate * 0.25 - officer.ambition * 0.03;
  return Math.max(0.05, Math.min(0.95, base));
}

/** 恩賞。忠誠を金で買い戻す */
export function rewardOfficer(state: GameState, officerId: string): GameState {
  if (state.treasury < REWARD_COST) return state;
  const inRoster = state.candidates.some((o) => o.id === officerId && o.retained);
  const seated = seatedOfficers(state).find((o) => o.id === officerId);
  if (!inRoster && seated === undefined) return state;

  const raise = (o: Official): Official =>
    o.id === officerId ? { ...o, loyalty: clamp100(o.loyalty + REWARD_LOYALTY_GAIN) } : o;

  return {
    ...state,
    treasury: state.treasury - REWARD_COST,
    candidates: state.candidates.map(raise),
    marshal: {
      ...state.marshal,
      holder: state.marshal.holder === null ? null : raise(state.marshal.holder),
    },
    chancellor: state.chancellor === null ? null : raise(state.chancellor),
    inspectors: Object.fromEntries(
      Object.entries(state.inspectors).map(([id, o]) => [id, o === undefined ? o : raise(o)]),
    ),
  };
}

/**
 * 忠誠の推移と、尽きた者の去りかた。
 *
 * **野心が高いほど早く冷める。** 帝の人望と、その者の個性（高潔・野心家）で
 * 速さが変わる。尽きた者は、無官なら黙って出奔し、
 * **州を預かっていればその州ごと離れる**（王敦も桓玄も侯景もそうした）
 */
export function updateLoyalty(state: GameState, rng: () => number): GameState {
  const charm = state.dynasty.ruler.abilities.charisma;

  const decayOf = (o: Official): number => {
    if (o.trait === 'gaojie') return 0;
    const base = OFFICER_LOYALTY_DECAY + o.ambition * OFFICER_LOYALTY_AMBITION_PER_POINT;
    const relief = charm * 0.06 + (state.mandate / 100) * 0.5;
    return Math.max(0, (o.trait === 'yexin' ? base * 1.6 : base) - relief);
  };
  const cool = (o: Official): Official => ({ ...o, loyalty: clamp100(o.loyalty - decayOf(o)) });

  let next: GameState = {
    ...state,
    candidates: state.candidates.map((o) => (o.retained ? cool(o) : o)),
    marshal: {
      ...state.marshal,
      holder: state.marshal.holder === null ? null : cool(state.marshal.holder),
    },
    chancellor: state.chancellor === null ? null : cool(state.chancellor),
    inspectors: Object.fromEntries(
      Object.entries(state.inspectors).map(([id, o]) => [id, o === undefined ? o : cool(o)]),
    ),
  };

  // 無官の者は黙って出奔する
  const leaving = next.candidates.filter((o) => o.retained && o.loyalty <= 0);
  if (leaving.length > 0) {
    next = {
      ...next,
      candidates: next.candidates.filter((o) => !(o.retained && o.loyalty <= 0)),
      turnEvents: [...next.turnEvents, 'officer_left'],
    };
  }

  // 都督と録尚書事は席を捨てて去る
  if (next.marshal.holder !== null && next.marshal.holder.loyalty <= 0) {
    next = {
      ...next,
      marshal: { ...next.marshal, holder: null },
      turnEvents: [...next.turnEvents, 'officer_left'],
    };
  }
  if (next.chancellor !== null && next.chancellor.loyalty <= 0) {
    next = { ...next, chancellor: null, turnEvents: [...next.turnEvents, 'officer_left'] };
  }

  // 刺史はその州ごと離れる
  for (const id of Object.keys(next.inspectors) as ProvinceId[]) {
    const inspector = next.inspectors[id];
    if (inspector === undefined || inspector.loyalty > 0) continue;
    const province = next.provinces[id];
    const inspectors = { ...next.inspectors };
    delete inspectors[id];
    next = {
      ...next,
      inspectors,
      provinces:
        province === undefined
          ? next.provinces
          : {
              ...next.provinces,
              [id]: {
                ...province,
                control: clamp100(province.control - OFFICER_DEFECT_CONTROL_LOSS),
                garrison: province.garrison * 0.5,
              },
            },
      mandate: clamp100(next.mandate - OFFICER_DEFECT_MANDATE_LOSS),
      turnEvents: [...next.turnEvents, 'officer_defected'],
    };
  }

  // 使わなかった目を捨てて、次の年の判定がずれないようにする
  rng();
  return next;
}

// ── 個性の補正 ────────────────────────────────────────

/**
 * その個性を持つ者が席に就いていれば 1、いなければ 0 を返す。
 *
 * **効くのは官に就いている者だけ。** 配下に抱えているだけの者は
 * 何も動かさない（抱えるだけで効くなら、任命という手が死ぬ）
 */
export function hasTrait(state: GameState, trait: TraitId): boolean {
  return seatedOfficers(state).some((o) => o.trait === trait);
}

/** その州の刺史がその個性を持っているか */
export function provinceTrait(state: GameState, provinceId: ProvinceId, trait: TraitId): boolean {
  return state.inspectors[provinceId]?.trait === trait;
}

/** 個性の補正。掛ける先は既存の計算式で、ここでは倍率だけを返す */
export function traitBonus(has: boolean, amount: number): number {
  return has ? amount : 0;
}
