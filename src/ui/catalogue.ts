import {
  CONSCRIPT_COST,
  DEFEND_COST,
  EAST_AID_MIN_RELATIONS,
  EAST_TITLE_COST,
  FOEDERATI_HIRE_COST,
  MARRIAGE_COST,
  MARRIAGE_EAST_MIN_RELATIONS,
  REORGANIZE_COST,
} from '../core/constants';
import type {
  BarbarianFactionId,
  GameState,
  PlayerAction,
  ProvinceId,
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
