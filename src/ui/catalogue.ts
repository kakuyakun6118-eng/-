import {
  CONSCRIPT_COST,
  DEFEND_COST,
  EAST_AID_MIN_RELATIONS,
  EAST_TITLE_COST,
  FOEDERATI_HIRE_COST,
  GENERAL_APPOINT_COST,
  MARRIAGE_COST,
  MARRIAGE_EAST_MIN_RELATIONS,
  REORGANIZE_COST,
} from '../core/constants';
import type {
  BarbarianDemandType,
  BarbarianFactionId,
  GameState,
  GeneralEnd,
  PlayerAction,
  ProvinceId,
  TurnEventId,
} from '../core/types';

/** 表示名。ゲームロジックではなく画面用のラベル */
export const PROVINCE_LABELS: Record<ProvinceId, string> = {
  Italia: 'イタリア',
  Gallia: 'ガリア',
  Hispania: 'ヒスパニア',
  Britannia: 'ブリタンニア',
  Africa: 'アフリカ',
  Illyricum: 'イリュリクム',
  Noricum: 'ノリクム',
};

export const FACTION_LABELS: Record<BarbarianFactionId, string> = {
  Visigoths: '西ゴート',
  Vandals: 'ヴァンダル',
  Huns: 'フン',
  Franks: 'フランク',
  Burgundians: 'ブルグント',
  Suebi: 'スエビ',
  Alans: 'アラン',
  Saxons: 'サクソン',
};

/** 要求の種類。何を差し出すことになるかを添える */
export const DEMAND_LABELS: Record<BarbarianDemandType, string> = {
  gold: '金',
  land: '土地',
  title: '称号',
};

export const DEMAND_DETAILS: Record<BarbarianDemandType, string> = {
  gold: '国庫で払う。引き揚げさせ、その軍の一部を散らす',
  land: 'その属州を割譲する。税基盤を永久に失う',
  title: '官位を与えて味方に付ける。元老院の支持と正統性で払う',
};

/**
 * 状態の差分からは読み取れない出来事の文言。
 * どちらも野戦軍が減るだけなので、書かないと理由が分からない
 */
export const TURN_EVENT_LABELS: Record<TurnEventId, string> = {
  desertion: '給与が尽き兵が脱走',
  usurper_attempt: '僭称者が立ち軍の一部が離反',
  general_usurped: '軍司令官が帝位を狙って蜂起し、職を離れた',
  general_retired: '軍司令官が任期を終えて職を退いた',
};

/** 軍司令官が職を離れた理由 */
export const GENERAL_END_LABELS: Record<GeneralEnd, string> = {
  retired: '任期満了',
  dismissed: '解任',
  usurped: '蜂起',
};

/**
 * 君主名の長さの上限。画面の収まりのためで、ゲームルールではない。
 * 開始画面と君主の欄の両方で使うのでここに置く
 */
export const RULER_NAME_MAX_LENGTH = 12;

export const STANCE_LABELS = {
  hostile: '敵対',
  foederati: '同盟',
  settled: '定住',
} as const;

export const DIFFICULTY_LABELS = {
  beginner: '初級',
  standard: '中級',
  veteran: '上級',
} as const;

export type TargetKind = 'none' | 'province' | 'faction' | 'faction-province' | 'marriage';

export interface ActionTemplate {
  id: string;
  category: string;
  label: string;
  detail: string;
  cost: number | null;
  target: TargetKind;
  /** 選べない理由。null なら選べる */
  blockedReason: (state: GameState) => string | null;
  /**
   * 相手として選べる勢力を絞る。
   * 省略すると全勢力。要求への応答のように、対象が限られる行動で使う
   */
  factionFilter?: (state: GameState, id: BarbarianFactionId) => boolean;
  build: (target: { province?: ProvinceId; faction?: BarbarianFactionId; east?: boolean }) => PlayerAction | null;
}

const needsGold = (cost: number) => (state: GameState) =>
  state.treasury < cost ? `国庫が不足（${cost} 必要）` : null;

export const ACTION_TEMPLATES: ActionTemplate[] = [
  {
    id: 'negotiate_tribute',
    category: '交渉',
    label: '貢納を贈る',
    detail: '金を払ってこの1年の侵攻を止める。同盟勢力なら忠誠も上がる',
    cost: null,
    target: 'faction',
    blockedReason: () => null,
    build: ({ faction }) =>
      faction ? { type: 'negotiate_tribute', factionId: faction, amount: 60 } : null,
  },
  {
    id: 'negotiate_accept_demand',
    category: '交渉',
    label: '要求を飲む',
    detail: '突きつけられた要求に応じる。金・土地・称号のどれを払うかは相手が決める（行動枠を消費しない）',
    cost: null,
    target: 'faction',
    blockedReason: (state) =>
      Object.values(state.factions).some((f) => f.stance === 'hostile' && f.demand !== null)
        ? null
        : '要求を受けていない',
    factionFilter: (state, id) =>
      state.factions[id].stance === 'hostile' && state.factions[id].demand !== null,
    build: ({ faction }) =>
      faction ? { type: 'negotiate_accept_demand', factionId: faction } : null,
  },
  {
    id: 'negotiate_settle',
    category: '交渉',
    label: '土地を与えて定住させる',
    detail: '戦線は消えるが、その属州の税収と帝国の税基盤を永久に失う',
    cost: null,
    target: 'faction-province',
    blockedReason: () => null,
    build: ({ faction, province }) =>
      faction && province
        ? { type: 'negotiate_settle', factionId: faction, provinceId: province }
        : null,
  },
  {
    id: 'negotiate_marriage',
    category: '交渉',
    label: '婚姻同盟を結ぶ',
    detail: '君主が縁組する。子が生まれて初めて追加の効果が出る',
    cost: MARRIAGE_COST,
    target: 'marriage',
    blockedReason: (state) =>
      state.dynasty.ruler.spouse !== null
        ? '君主はすでに既婚'
        : needsGold(MARRIAGE_COST)(state),
    build: ({ faction, east }) =>
      east
        ? { type: 'negotiate_marriage', target: { kind: 'east' } }
        : faction
          ? { type: 'negotiate_marriage', target: { kind: 'barbarian', factionId: faction } }
          : null,
  },
  {
    id: 'hire_foederati',
    category: '雇用',
    label: 'フォエデラティ契約',
    detail: '敵を傭兵にする。安く戦線が埋まるが給金は年々膨らみ、途切れれば寝返る',
    cost: FOEDERATI_HIRE_COST,
    target: 'faction',
    blockedReason: needsGold(FOEDERATI_HIRE_COST),
    build: ({ faction }) => (faction ? { type: 'hire_foederati', factionId: faction } : null),
  },
  {
    id: 'military_deploy',
    category: '軍事',
    label: '野戦軍を派遣',
    detail: 'その属州の防衛に野戦軍を厚く振り向ける。行軍で軍は少し損耗する',
    cost: null,
    target: 'province',
    blockedReason: () => null,
    build: ({ province }) => (province ? { type: 'military_deploy', provinceId: province } : null),
  },
  {
    id: 'military_defend',
    category: '軍事',
    label: '属州を防備',
    detail: '守備隊を増強する',
    cost: DEFEND_COST,
    target: 'province',
    blockedReason: needsGold(DEFEND_COST),
    build: ({ province }) => (province ? { type: 'military_defend', provinceId: province } : null),
  },
  {
    id: 'military_conscript',
    category: '軍事',
    label: '徴募',
    detail: '金をかけて野戦軍を増やす。徴募の負担で元老院の支持は下がる',
    cost: CONSCRIPT_COST,
    target: 'none',
    blockedReason: needsGold(CONSCRIPT_COST),
    build: () => ({ type: 'military_conscript' }),
  },
  {
    id: 'military_appoint_general',
    category: '軍事',
    label: '軍司令官を任命',
    detail: '空位を埋める。軍は強くなるが、有能な将ほど戦勝の名声は皇帝ではなく将軍のものになる',
    cost: GENERAL_APPOINT_COST,
    target: 'none',
    blockedReason: (state) =>
      state.general.current !== null
        ? '軍司令官は在職中'
        : needsGold(GENERAL_APPOINT_COST)(state),
    build: () => ({ type: 'military_appoint_general' }),
  },
  {
    id: 'military_dismiss_general',
    category: '軍事',
    label: '軍司令官を解任',
    detail: '正統性は戻るが、その将に従っていた兵は離れる',
    cost: null,
    target: 'none',
    blockedReason: (state) => (state.general.current === null ? '軍司令官は空位' : null),
    build: () => ({ type: 'military_dismiss_general' }),
  },
  {
    id: 'domestic_raise_taxes',
    category: '内政',
    label: '徴税を強化',
    detail: '目先の収入を増やすが、元老院の支持と属州の支配度を削る',
    cost: null,
    target: 'none',
    blockedReason: () => null,
    build: () => ({ type: 'domestic_raise_taxes' }),
  },
  {
    id: 'domestic_reorganize_army',
    category: '内政',
    label: '軍を再編',
    detail: '属州の守備隊を野戦軍に組み替える。機動力は増すが属州の守りは薄くなる',
    cost: REORGANIZE_COST,
    target: 'none',
    blockedReason: needsGold(REORGANIZE_COST),
    build: () => ({ type: 'domestic_reorganize_army' }),
  },
  {
    id: 'domestic_appease_senate',
    category: '内政',
    label: '元老院に譲歩',
    detail: '支持と正統性を買う。免税特権の追認で税基盤は永久に減る',
    cost: null,
    target: 'none',
    blockedReason: () => null,
    build: () => ({ type: 'domestic_appease_senate' }),
  },
  {
    id: 'east_request_aid',
    category: '東帝国',
    label: '援軍を要請',
    detail: '東ローマから金と兵を得るが、関係を消耗する',
    cost: null,
    target: 'none',
    blockedReason: (state) =>
      state.eastRelations < EAST_AID_MIN_RELATIONS
        ? `東との関係が不足（${EAST_AID_MIN_RELATIONS} 必要）`
        : null,
    build: () => ({ type: 'east_request_aid' }),
  },
  {
    id: 'east_confirm_title',
    category: '東帝国',
    label: '帝位の承認を得る',
    detail: '東ローマに帝位を認めさせ、正統性を高める',
    cost: EAST_TITLE_COST,
    target: 'none',
    blockedReason: needsGold(EAST_TITLE_COST),
    build: () => ({ type: 'east_confirm_title' }),
  },
];

export const MARRIAGE_EAST_REQUIREMENT = MARRIAGE_EAST_MIN_RELATIONS;
