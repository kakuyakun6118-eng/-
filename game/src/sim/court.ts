// 皇室・王族:家系(父・母・配偶者・子女・兄弟)、正室と側室、子女の誕生と成長、後継者(皇太子)、
// 君主の死と皇位継承、継承争いと内乱、皇帝即位、宮廷政治(安定度・外戚・廃立・簒奪)、寿命による死。
// 血縁はすべて人物IDで記録する。史料にある親子・兄弟・婚姻は family.json、ゲーム内で生まれた人物は架空として区別する。
import { effectsOf, factionFlat, factionMult, factionTraitEffects, LIMITS, prodOf, setLegitimacyHook } from "./virtualTraits";
import familyData from "../data/rules/family.json";
import hanDynastyData from "../data/rules/hanDynasty.json";
import successionRules from "../data/rules/succession.json";
import deathData from "../data/rules/deaths.json";
import { ledgerPerson, persons, scenario, statCap } from "../data";
import type { Person } from "../data/types";
import type { Campaign } from "./Campaign";
import type { Marriage } from "./diplomacy";
import { affinity, surnameOf } from "./loyalty";
import { chance } from "./spoils";

export type Rank = "emperor" | "king" | "duke" | "chief" | "lord";
export const RANK_LABEL: Record<Rank, string> = { emperor: "皇帝", king: "王", duke: "公", chief: "族長", lord: "君主" };
type Stats = { leadership: number; war: number; intelligence: number; politics: number; charisma: number };
const STAT_KEYS = ["leadership", "war", "intelligence", "politics", "charisma"] as const;

interface FamilyFile {
  parents: Record<string, { father?: string; mother?: string; note?: string; adopted?: boolean; conditional?: boolean }>;
  /** 決まった夫婦(仮想シナリオの劉承と韓瑤など):ともに生きて minAge 歳になれば結ばれる */
  plannedMarriages?: { husband: string; wife: string; kind: "primary" | "secondary"; minAge: number; scenarios?: string[]; note?: string }[];
  siblings: string[][];
  marriages: [string, string, "primary" | "secondary", string][];
  heirs: Record<string, Record<string, string>>;
  heirNotes: Record<string, string>;
  ranks: Record<string, Record<string, Rank>>;
  historicCrown: Record<string, number>;
  usurpations: { scenario: string; faction: string; usurper: string; victim: string; year: number; note: string }[];
  depositions: { faction: string; by: string; victim: string; replacement: string; year: number; note: string }[];
}

/** 途中から登場する史実の人物(family.json の debuts) */
interface Debut { person: string; year: number; follow?: string[]; faction?: string; title?: string; city?: string; note?: string }

/** 劉皓の8つの固有能力(子孫が一部を受け継ぐ) */
export const LIU_HAO_TRAITS = ["天命覇王", "炎漢正統", "軍神降臨", "神算鬼謀", "盛世創造", "英傑帰心", "不敗の軍略", "絶世の英姿"];
const BLOOD_TYPES = {
  万能: { leadership: 3, war: 3, intelligence: 3, politics: 3, charisma: 3 },
  軍事: { leadership: 8, war: 10, intelligence: -6, politics: -8, charisma: 0 },
  知略: { leadership: 0, war: -8, intelligence: 10, politics: 5, charisma: 0 },
  政治: { leadership: -4, war: -8, intelligence: 4, politics: 10, charisma: 5 },
} as const;
export const TYPE_TRAITS: Record<keyof typeof BLOOD_TYPES, string[]> = { 万能: ["帝王之器", "文武双全"], 軍事: ["武神", "破軍", "遠征無双"], 知略: ["王佐之才", "神算鬼謀"], 政治: ["仁政", "富国強兵", "人心掌握"] };

/**
 * 宣帝の血統の子の能力と特殊能力(仮想シナリオ)。成人時の目標の値を返す(年少のあいだは成長の計算で小さく出る)。
 * ・各能力 = 父母の高いほう6割+平均4割に、個人差(±10)と、型(万能・軍事・知略・政治)の得手不得手を加える。40〜120に収める
 *   → 合計は多くが500前後以上になる(劉皓の子孫は成人時に総合500以上となりやすい)
 * ・7%の見込みで「天賦の才」:全能力112以上(劉皓に匹敵)で、劉皓の固有能力を3つ受け継ぐ
 * ・特殊能力:父母の能力をそれぞれ35%(劉皓の固有能力は15%)、劉皓の固有能力が5%ずつ、型の能力を1つ(4つまで)
 */
export function inheritXuandi(f: Person, m: Person, mStat: (k: (typeof STAT_KEYS)[number]) => number, seed: string): { stats: Stats; traits: string[]; type: string; prodigy: boolean } {
  const types = Object.keys(BLOOD_TYPES) as (keyof typeof BLOOD_TYPES)[];
  const type = types[Math.floor(chance(seed + "|type") * types.length)];
  const prodigy = chance(seed + "|prodigy") < 0.07;
  const stats = {} as Stats;
  for (const k of STAT_KEYS) {
    const a = f[k], b = mStat(k);
    let v = 0.6 * Math.max(a, b) + 0.4 * ((a + b) / 2) + (chance(`${seed}|${k}`) - 0.5) * 20 + BLOOD_TYPES[type][k];
    if (prodigy) v = Math.max(v, 112 + chance(`${seed}|p${k}`) * 8);
    stats[k] = Math.round(Math.max(40, Math.min(120, v)));
  }
  const traits: string[] = [];
  const addT = (t: string): void => { if (!traits.includes(t) && traits.length < 4) traits.push(t); };
  // 型の能力を先に1つ(上限4つで消えないように)
  const tt = TYPE_TRAITS[type];
  addT(tt[Math.floor(chance(seed + "|tt") * tt.length)]);
  if (prodigy) {
    const pool = [...LIU_HAO_TRAITS];
    for (let i = 0; i < 3; i++) addT(pool.splice(Math.floor(chance(`${seed}|pt${i}`) * pool.length), 1)[0]);
  }
  // 父母の能力:ふつうは35%、劉皓の固有能力は15%(一部だけ受け継ぐ)。さらに劉皓の固有能力が、どの子にも5%ずつ現れる
  for (const t of [...f.traits, ...m.traits]) if (chance(`${seed}|i${t}`) < (LIU_HAO_TRAITS.includes(t) ? 0.15 : 0.35)) addT(t);
  for (const t of LIU_HAO_TRAITS) if (chance(`${seed}|h${t}`) < 0.05) addT(t);
  return { stats, traits, type, prodigy };
}

export type DeathCause = "illness" | "old_age" | "battle" | "execution" | "assassination" | "suicide" | "unknown";
export const CAUSE_LABEL: Record<DeathCause, string> = { illness: "病死", old_age: "老衰", battle: "戦死", execution: "処刑", assassination: "暗殺", suicide: "自害", unknown: "不明" };
type DeathRecord = { cause: DeathCause; basis: string; by?: string; note?: string; month?: number };
const DEATHS = (deathData as unknown as { deaths: Record<string, DeathRecord> }).deaths;
/** 史実の死因(書かれていなければ、没年のある人は病死・推定) */
export function historicDeath(p: Person): DeathRecord | null {
  return DEATHS[p.id] ?? (p.died !== null && !p.fictional ? { cause: "illness", basis: "推定" } : null);
}
export type EduPolicy = "war" | "study" | "politics" | "command" | "balanced";
export const EDU_LABEL: Record<EduPolicy, string> = { war: "武芸", study: "学問", politics: "政治", command: "統率", balanced: "均衡" };
const EDU_STATS: Record<EduPolicy, (typeof STAT_KEYS)[number][]> = { war: ["war"], study: ["intelligence"], politics: ["politics"], command: ["leadership"], balanced: ["leadership", "war", "intelligence", "politics", "charisma"] };
const FAMILY = familyData as unknown as FamilyFile;

export interface CourtCounts {
  births: number; historicBirths: number; debuts?: number; primaries: number; concubines: number; successions: number;
  disputes: number; civilWars: number; crowns: number; heirChanges: number; deaths: number; usurpations: number;
  regents: number; personalRule: number; depositions: number; eduGain: number; violentDeaths: number;
}
/** 歴代皇帝の記録(仮想シナリオの漢)。代替わりごとに1件 */
export interface EmperorRecord {
  gen: number;
  factionId: string;
  personId: string;
  name: string;
  era: string;
  born: number | null;
  died: number | null;
  accYear: number;
  accDate: string;
  endYear: number | null;
  endDate: string | null;
  /** 崩御・退位・国の滅亡など */
  endReason: string | null;
  citiesStart: number;
  citiesEnd: number | null;
  wins: number;
  losses: number;
  captures: number;
  lost: number;
  achievements: string[];
  empress: string | null;
  heir: string | null;
  successor: string | null;
  templeName: string | null;
  posthumous: string | null;
  stabilityEnd: number | null;
  founder: boolean;
  // ---- Version 67(前の版のセーブには無い) ----
  /** 皇帝の型・個人の固有特性・漢の正統の保有・即位時の能力値 */
  type?: string;
  typeLabel?: string;
  traits?: string[];
  legit?: boolean;
  stats?: string;
  /** 治世の国家目標(1つ目が主な目標。毎月、国の情勢で見直す) */
  goals?: string[];
  /** 即位時と終わりの人口・金・兵力 */
  popStart?: number;
  popEnd?: number | null;
  goldStart?: number;
  goldEnd?: number | null;
  troopsStart?: number;
  troopsEnd?: number | null;
  /** 征服した都市・属国にした国・主な遠征 */
  conquered?: string[];
  vassalsStart?: string[];
  vassalized?: string[];
  expeditions?: Record<string, number>;
  /** 治世の総合評価(0〜100)と、その言葉 */
  score?: number | null;
  grade?: string | null;
}
/** 皇帝の型(hanDynasty.json) */
export const HAN_TYPES = (hanDynastyData as unknown as { types: Record<string, { label: string; traits: string[]; goals: string[] }> }).types;
const HAN_FIXED = (hanDynastyData as unknown as { fixed: Record<string, { type: string; label: string; add: string[] }> }).fixed;
/** 遠征の地域(征服した都市の場所) */
export function regionOf(c: { id: string; lon: number; lat: number }): string | null {
  if (["wandu", "pyongyang", "hanseong", "geumseong"].includes(c.id)) return "朝鮮半島";
  if (c.lon < 96) return "西域";
  if (c.lat >= 41) return "北方";
  if (c.lat < 25) return "南方";
  return null;
}
/** 元号(初代は建武。そのあとは順に) */
export const ERA_NAMES = ["建武", "永平", "章和", "元康", "太和", "永昌", "嘉平", "正始", "景元", "泰始", "咸寧", "太康", "元熙", "承平", "景和", "延興", "昭明", "鳳翔", "天統", "神鼎", "寧康", "太元", "隆安", "義寧", "天和", "嘉禾", "黄龍", "赤烏", "神鳳", "永安", "甘露", "宝鼎", "鳳凰", "天紀", "太初", "延昌", "熙平", "神亀", "正光", "孝昌"];

export interface CourtSave {
  /** 歴代皇帝の型と固有特性(Version 67。セーブ・ロードで変わらないよう残す) */
  emperorTraits?: Record<string, string[]>;
  emperorTypes?: Record<string, string>;
  lostCities?: Record<string, string[]>;
  /** 歴代皇帝の記録と、皇統の称号・戦績の集計(仮想シナリオ。Version 65) */
  emperors?: EmperorRecord[];
  titles?: Record<string, string>;
  tally?: Record<string, { wins: number; losses: number; captures: number; lost: number }>;
  heirs: Record<string, string>;
  stability: Record<string, number>;
  ranks: Record<string, Rank>;
  added: Person[];
  parents: Record<string, { father?: string; mother?: string }>;
  base: Record<string, Stats>;
  lifespan: Record<string, number>;
  assumedBorn: Record<string, number>;
  log: Record<string, { day: number; text: string }[]>;
  counts: CourtCounts;
  nextId: number;
  regents?: Record<string, string>;
  causes?: Record<string, { cause: DeathCause; day: number; text: string }>;
  edu?: Record<string, { policy: EduPolicy; tutor?: string; gain: Partial<Stats> }>;
}

const BOY = ["弘", "昭", "遵", "寧", "宣", "恢", "昌", "恭", "範", "紹", "康", "泰", "順", "盛", "穆", "徳", "冲", "朗", "敬", "雅", "安", "熙", "暉", "超", "勲", "璋", "瑾", "粛", "猛", "威"];
const GIRL = ["華", "蓉", "蘭", "婉", "英", "容", "玉", "瑤", "芳", "月", "姜", "嫣", "珠", "蕙", "瑛", "柔", "静", "秀", "貞", "淑"];
const FICTION_NOTE = "架空の人物(ゲームの中で生まれた・迎えた人物。史実の人物ではありません)";

export class Court {
  heirs: Record<string, string> = {};
  stability: Record<string, number> = {};
  ranks: Record<string, Rank> = {};
  /** ゲームの中で加わった人物(誕生・史実の子女の誕生・迎えた妃) */
  added: Person[] = [];
  /** ゲームの中で決まった親子(架空の子女) */
  parents: Record<string, { father?: string; mother?: string }> = {};
  /** 成長前の能力(年齢による変化のもと) */
  base: Record<string, Stats> = {};
  lifespan: Record<string, number> = {};
  /** 生年の分からない妃の、仮の生年 */
  assumedBorn: Record<string, number> = {};
  log: Record<string, { day: number; text: string }[]> = {};
  counts: CourtCounts = Court.zero();
  nextId = 1;
  /** 摂政(幼い君主の代わりに政務を見る人) */
  regents: Record<string, string> = {};
  /** 亡くなった人の死因 */
  causes: Record<string, { cause: DeathCause; day: number; text: string }> = {};
  /** 子女の教育(方針・担当・これまでの伸び) */
  edu: Record<string, { policy: EduPolicy; tutor?: string; gain: Partial<Stats> }> = {};

  static zero(): CourtCounts {
    return { births: 0, historicBirths: 0, primaries: 0, concubines: 0, successions: 0, disputes: 0, civilWars: 0, crowns: 0, heirChanges: 0, deaths: 0, usurpations: 0, regents: 0, personalRule: 0, depositions: 0, eduGain: 0, violentDeaths: 0 };
  }

  constructor(private readonly c: Campaign) {
    // 漢の正統(Version 67):劉皓と直系の子孫が、漢の正式な皇帝として在位しているときだけ
    setLegitimacyHook((f) => this.isLegitEmperor(f));
    this.init();
  }

  /** 歴代皇帝の記録(仮想シナリオの漢) */
  emperors: EmperorRecord[] = [];
  /** 皇統の称号(漢皇帝・太上皇・諡号など。人物の称号はセーブに残らないため、ここに残す) */
  titles: Record<string, string> = {};
  /** 勢力ごとの戦績の集計(会戦の勝ち負け・城の攻略と喪失) */
  tally: Record<string, { wins: number; losses: number; captures: number; lost: number }> = {};
  /** 皇帝の固有特性(即位のときに決めたもの)と型 */
  emperorTraits: Record<string, string[]> = {};
  emperorTypes: Record<string, string> = {};
  /** 国ごとの、奪われた都市(取り戻したら消す) */
  lostCities: Record<string, string[]> = {};

  private init(): void {
    this.lostCities = {};
    this.emperorTraits = {};
    this.emperorTypes = {};
    this.removeAdded();
    this.emperors = [];
    this.titles = {};
    this.tally = {};
    this.heirs = {};
    this.stability = {};
    this.ranks = {};
    this.parents = {};
    this.base = {};
    this.lifespan = {};
    this.assumedBorn = {};
    this.log = {};
    this.counts = Court.zero();
    this.nextId = 1;
    this.regents = {};
    this.causes = {};
    this.edu = {};
    const startRanks = FAMILY.ranks[scenario.id] ?? {};
    for (const f of scenario.factions) {
      if (f.passive) continue;
      this.ranks[f.id] = startRanks[f.id] ?? this.rankFromTitle(f.title);
      this.stability[f.id] = 60;
    }
    this.addLivingChildren();
    for (const [fid, pid] of Object.entries(FAMILY.heirs[scenario.id] ?? {})) {
      const p = persons.find((x) => x.id === pid);
      if (p && p.factionId === fid) this.heirs[fid] = pid;
    }
    for (const p of persons) this.snapshot(p);
    // 仮想シナリオ:開始時から、子の能力を年齢に合わせて出す(劉承・劉威など。成人時の値が記録されているため)
    if (scenario.virtual) this.applyGrowth();
  }

  /**
   * 開始時にすでに生まれているが、名簿にいない子女(石弘など)を、親のもとに加える。
   * 20歳以下で、親がゲームにいる史実の人物だけ(大人はほかの所にいた可能性があるため加えない)。
   */
  private addLivingChildren(): void {
    // 生年が分からないが、開始時に宮廷にいたと考えられる王族(family.json の addRoyals)
    const extra = (familyData as unknown as { addRoyals?: Record<string, Record<string, string[]>> }).addRoyals?.[scenario.id] ?? {};
    for (const [fid, ids] of Object.entries(extra)) {
      if (!scenario.factions.some((x) => x.id === fid)) continue;
      for (const id of ids) {
        if (persons.some((p) => p.id === id)) continue;
        const base = ledgerPerson(id);
        if (!base || (base.died !== null && base.died < scenario.year)) continue;
        const ruler = persons.find((x) => x.factionId === fid && x.role === "ruler");
        const p: Person = { ...base, factionId: fid, role: base.role === "ruler" ? "general" : base.role, residence: ruler?.residence };
        persons.push(p);
        this.added.push(p);
        const L = this.c.loyalty;
        if (L) {
          L.fame[p.id] = 30;
          L.loyalty[p.id] = 80;
        }
      }
    }
    for (const [child, fam] of Object.entries(FAMILY.parents)) {
      if (fam.conditional || persons.some((p) => p.id === child)) continue;
      const base = ledgerPerson(child);
      if (!base || base.born === null || base.born > scenario.year || scenario.year - base.born > 20 || (base.died !== null && base.died < scenario.year)) continue;
      const parent = [fam.father, fam.mother].map((id) => persons.find((p) => p.id === id)).find((p) => !!p);
      if (!parent) continue;
      const p: Person = { ...base, factionId: parent.factionId, role: base.role === "ruler" ? "general" : base.role, residence: parent.residence, title: base.title };
      persons.push(p);
      this.added.push(p);
      const L = this.c.loyalty;
      if (L) {
        L.fame[p.id] = 10;
        L.loyalty[p.id] = 80;
      }
    }
  }

  private rankFromTitle(t: string | undefined): Rank {
    if (!t) return "lord";
    if (/皇帝|天王/.test(t)) return "emperor";
    if (/王/.test(t)) return "king";
    if (/公/.test(t)) return "duke";
    if (/単于|可汗|大人/.test(t)) return "chief";
    return "lord";
  }

  /** 年齢で変わる能力のもとを控える(若い人物と、架空の人物) */
  private snapshot(p: Person): void {
    if (this.base[p.id]) return;
    const a = this.age(p);
    if (a !== null && a < 22) this.base[p.id] = { leadership: p.leadership, war: p.war, intelligence: p.intelligence, politics: p.politics, charisma: p.charisma };
  }

  private removeAdded(): void {
    for (const a of this.added ?? []) {
      const i = persons.findIndex((p) => p.id === a.id);
      if (i >= 0) persons.splice(i, 1);
    }
    this.added = [];
  }

  year(): number {
    return this.c.calendar().year;
  }

  // ---------------- 家系 ----------------
  fatherOf(id: string): string | undefined {
    return this.parents[id]?.father ?? FAMILY.parents[id]?.father;
  }

  motherOf(id: string): string | undefined {
    return this.parents[id]?.mother ?? FAMILY.parents[id]?.mother;
  }

  parentNote(id: string): string | undefined {
    const f = FAMILY.parents[id];
    return f ? [f.adopted ? "養子" : "", f.note ?? ""].filter(Boolean).join("・") || undefined : undefined;
  }

  /** いまゲームにいる人物だけを返す */
  private present(ids: (string | undefined)[]): Person[] {
    return ids.filter((x): x is string => !!x).map((id) => persons.find((p) => p.id === id)).filter((p): p is Person => !!p);
  }

  childrenOf(id: string): Person[] {
    return persons.filter((p) => this.fatherOf(p.id) === id || this.motherOf(p.id) === id).sort((a, b) => (a.born ?? 0) - (b.born ?? 0));
  }

  siblingsOf(id: string): Person[] {
    const f = this.fatherOf(id);
    const m = this.motherOf(id);
    const set = new Set<string>();
    for (const p of persons) if (p.id !== id && ((f && this.fatherOf(p.id) === f) || (m && this.motherOf(p.id) === m))) set.add(p.id);
    for (const g of FAMILY.siblings) if (g.includes(id)) for (const x of g) if (x !== id) set.add(x);
    return this.present([...set]);
  }

  marriagesOf(id: string): Marriage[] {
    return this.c.diplo.marriages.filter((m) => m.husband === id || m.wife === id);
  }

  spousesOf(id: string): Person[] {
    return this.present(this.marriagesOf(id).map((m) => (m.husband === id ? m.wife : m.husband)));
  }

  /** 生きている正室(夫から見て) */
  primaryOf(husband: string): Person | undefined {
    const m = this.c.diplo.marriages.find((x) => x.husband === husband && x.kind === "primary" && this.alive(x.wife));
    return m ? persons.find((p) => p.id === m.wife) : undefined;
  }

  concubinesOf(husband: string): Person[] {
    return this.present(this.c.diplo.marriages.filter((x) => x.husband === husband && x.kind === "secondary" && this.alive(x.wife)).map((x) => x.wife));
  }

  private alive(id: string): boolean {
    return this.c.personStatus(id) !== "dead" && persons.some((p) => p.id === id);
  }

  /** 血のつながり(親・子・兄弟・祖父母・孫・おじ・おい・いとこ)の近さ。無ければ null */
  bloodDistance(a: string, b: string): number | null {
    if (a === b) return 0;
    const up = (id: string): Map<string, number> => {
      // 兄弟の組(親が台帳にいない兄弟)は、仮の親(sib:…)を共有するものとして扱う
      const m = new Map<string, number>([[id, 0]]);
      const sib = (x: string, d: number): void => {
        for (const g of FAMILY.siblings) if (g.includes(x) && !m.has(`sib:${g[0]}`)) m.set(`sib:${g[0]}`, d + 1);
      };
      sib(id, 0);
      let frontier = [id];
      for (let d = 1; d <= 3; d++) {
        const next: string[] = [];
        for (const x of frontier) for (const pa of [this.fatherOf(x), this.motherOf(x)]) if (pa && !m.has(pa)) {
          m.set(pa, d);
          sib(pa, d);
          next.push(pa);
        }
        frontier = next;
      }
      return m;
    };
    const ua = up(a);
    const ub = up(b);
    let best: number | null = null;
    for (const [k, da] of ua) {
      const db = ub.get(k);
      if (db !== undefined) best = best === null ? da + db : Math.min(best, da + db);
    }
    return best;
  }

  /** 近親か(血のつながりが4親等以内) */
  isCloseKin(a: Person, b: Person): boolean {
    const d = this.bloodDistance(a.id, b.id);
    return d !== null && d <= 4;
  }

  // ---------------- 年齢と成長 ----------------
  bornOf(p: Person): number | null {
    return p.born ?? this.assumedBorn[p.id] ?? null;
  }

  age(p: Person): number | null {
    const b = this.bornOf(p);
    return b === null ? null : this.year() - b;
  }

  /** 15歳未満(軍団・官職・婚姻はできない) */
  isMinor(p: Person): boolean {
    const a = this.age(p);
    return a !== null && a < 15;
  }

  stageOf(p: Person): string {
    const a = this.age(p);
    if (a === null) return "成人(生年不明)";
    return a < 10 ? "幼少" : a < 15 ? "少年(教育中)" : a >= 60 ? "老年" : "成人";
  }

  /** 年齢による能力の割合(幼少0.2 → 15歳0.75 → 20歳で1) */
  private growth(age: number): number {
    if (age < 6) return 0.2;
    if (age < 15) return 0.2 + (age - 6) * 0.061;
    if (age < 20) return 0.75 + (age - 15) * 0.05;
    return 1;
  }

  private applyGrowth(): void {
    for (const [id, b] of Object.entries(this.base)) {
      const p = persons.find((x) => x.id === id);
      const a = p ? this.age(p) : null;
      if (!p || a === null) continue;
      const g = this.growth(a);
      const e = this.edu[id]?.gain ?? {};
      // 上限はシナリオの上限(仮想シナリオは120)。もとの値が上限より高くても切り捨てない
      for (const k of STAT_KEYS) p[k] = Math.max(1, Math.min(Math.max(statCap(), b[k]), Math.round((b[k] + (e[k] ?? 0)) * g)));
    }
  }

  // ---------------- 身分 ----------------
  rankOf(f: string): Rank {
    return this.ranks[f] ?? "lord";
  }

  rankLabel(f: string): string {
    return RANK_LABEL[this.rankOf(f)];
  }

  /** 威信への上乗せ(皇帝+15・王+8・公+4) */
  rankBonus(f: string): number {
    return { emperor: 15, king: 8, duke: 4, chief: 2, lord: 0 }[this.rankOf(f)];
  }

  /** 皇族・王族などの身分(画面に出す) */
  royalTitle(p: Person): string {
    const ruler = this.c.rulerOf(p.factionId);
    const rank = this.rankOf(p.factionId);
    const imp = rank === "emperor";
    const kg = rank === "king";
    if (!ruler) return "";
    if (p.id === ruler.id) return RANK_LABEL[rank];
    const m = this.c.diplo.marriages.find((x) => x.husband === ruler.id && x.wife === p.id);
    if (m && this.alive(p.id)) return m.kind === "primary" ? (imp ? "皇后" : kg ? "王后" : rank === "chief" ? "可敦(正室)" : "夫人(正室)") : imp ? "夫人(側室)" : "側室";
    if (this.heirs[p.factionId] === p.id) return imp ? "皇太子" : kg ? "王太子" : "世子";
    const dist = this.bloodDistance(p.id, ruler.id);
    if (this.fatherOf(p.id) === ruler.id || this.motherOf(p.id) === ruler.id) return p.gender === "female" ? (imp || kg ? "公主" : "君主の娘") : imp ? "皇子" : kg ? "王子" : "公子";
    if (dist !== null && dist <= 4) return imp ? "皇族" : kg ? "王族" : "公族";
    return "";
  }

  /** 君主から見た続柄 */
  relationToRuler(p: Person): string {
    const r = this.c.rulerOf(p.factionId);
    if (!r) return "";
    if (r.id === p.id) return "本人(君主)";
    if (this.spousesOf(r.id).some((x) => x.id === p.id)) return "妻";
    if (this.fatherOf(p.id) === r.id || this.motherOf(p.id) === r.id) return p.gender === "female" ? "娘" : "息子";
    if (this.fatherOf(r.id) === p.id) return "父";
    if (this.motherOf(r.id) === p.id) return "母";
    if (this.siblingsOf(r.id).some((x) => x.id === p.id)) return p.gender === "female" ? "姉妹" : "兄弟";
    const d = this.bloodDistance(p.id, r.id);
    return d !== null ? `一族(${d}親等)` : surnameOf(p) === surnameOf(r) && p.people === r.people ? "同姓(血縁は不明)" : "血縁なし";
  }

  /** 君主の一族か(血縁4親等以内) */
  isRoyal(p: Person): boolean {
    const r = this.c.rulerOf(p.factionId);
    if (!r || r.id === p.id) return !!r;
    const d = this.bloodDistance(p.id, r.id);
    return d !== null && d <= 4;
  }

  // ---------------- 後継 ----------------
  heirOf(f: string): Person | undefined {
    const id = this.heirs[f];
    const p = id ? persons.find((x) => x.id === id) : undefined;
    return p && p.factionId === f && this.c.personStatus(p.id) === "active" && !this.c.spoils.custodyOf(p.id) ? p : undefined;
  }

  /**
   * 後継順位:1.指名された皇太子 2.正室の子(年長順) 3.側室の子 4.兄弟 5.ほかの一族 6.有力な武将。
   * 未成年は、指名されていなければ順位を下げる。
   */
  successionOrder(f: string, exclude?: string): { p: Person; reason: string; score: number }[] {
    const ruler = this.c.rulerOf(f);
    const rid = exclude ?? ruler?.id;
    // 仮想シナリオの劉氏の皇統(宣帝の血統):決まった順位で継ぐ。劉氏の皇族がいる限り、家臣は継がない
    const old = rid ? persons.find((p) => p.id === rid) : undefined;
    if (scenario.virtual && old?.bloodline === "xuandi") {
      const d = this.dynasticOrder(f, old);
      if (d.length) return d;
    }
    const out: { p: Person; reason: string; score: number }[] = [];
    for (const p of persons) {
      if (p.factionId !== f || p.id === rid || p.gender === "female" || this.c.personStatus(p.id) !== "active" || this.c.spoils.custodyOf(p.id)) continue;
      let score = 0;
      let reason = "";
      const age = this.age(p) ?? 30;
      if (this.heirs[f] === p.id) {
        score = 1000;
        reason = "指名された後継者";
      } else if (rid && this.fatherOf(p.id) === rid) {
        // 母が記録にない史実の子は、正室の子と同じ扱い(史料に母の名が残らないことが多いため)
        const mom = this.motherOf(p.id);
        const primary = this.c.diplo.marriages.some((m) => m.husband === rid && m.wife === mom && m.kind === "primary") || (!mom && !p.fictional);
        score = (primary ? 620 : 520) + Math.min(60, age);
        reason = primary ? "正室の子" : "側室の子";
      } else if (rid && ruler && this.historicSuccessor(f, p, ruler)) {
        score = 450;
        reason = "史実の後継者";
      } else if (rid && this.siblingsOf(rid).some((x) => x.id === p.id)) {
        score = 400 + Math.min(40, age / 2);
        reason = "兄弟";
      } else if (rid && ruler && (this.bloodDistance(p.id, rid) ?? 99) <= 4 && surnameOf(p) === surnameOf(ruler)) {
        // 継承は父系(同じ姓)の一族だけ。母方の一族(外戚)は継がない
        score = 300 - (this.bloodDistance(p.id, rid) ?? 4) * 10;
        reason = "一族";
      } else if (p.role !== "minister") {
        score = (p.leadership + p.charisma + (this.c.loyalty.fame[p.id] ?? 50)) / 6;
        reason = "有力な武将";
      } else continue;
      if (this.isMinor(p) && this.heirs[f] !== p.id) {
        score -= 250;
        reason += "・未成年";
      }
      // そのほかの評価:架空の人物は史実の人物より後ろ、君主との相性・官職・軍団・名声(宮廷での支持)
      if (this.heirs[f] !== p.id) {
        if (p.fictional) score -= 80;
        if (ruler) score += (affinity(p, ruler).value - 50) / 5;
        if (this.c.economy.officeOf(p.id)) score += 10;
        if (this.c.postOf(p.id)?.kind === "army") score += 10;
        score += ((this.c.loyalty.fame[p.id] ?? 30) - 30) / 5;
      }
      out.push({ p, reason, score });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /**
   * 皇統の継承順位(仮想シナリオの劉氏。楚王の時代も同じ):
   * 1 指名された皇太子・世子 → 2 嫡長子(正室の子の長子) → 3 ほかの実子 → 4 孫・曾孫など直系の子孫 → 5 兄弟とその子
   * → 6 父・祖父など存命の皇族 → 7 そのほかの劉氏の一族。幼い後継者も順位どおり継ぐ(摂政が政治と軍事を代わる)。
   * 女性・亡くなった人・捕らわれた人・ほかの国にいる人は継がない。劉氏の皇族がひとりもいなければ空(ふつうの継承の順に戻る)
   */
  dynasticOrder(f: string, old: Person): { p: Person; reason: string; score: number }[] {
    const ok = (p: Person): boolean => p.factionId === f && p.id !== old.id && p.gender !== "female" && this.c.personStatus(p.id) === "active" && !this.c.spoils.custodyOf(p.id);
    const out: { p: Person; reason: string; score: number }[] = [];
    const seen = new Set<string>();
    const add = (p: Person, reason: string, score: number): void => {
      if (seen.has(p.id) || !ok(p)) return;
      seen.add(p.id);
      out.push({ p, reason: reason + (this.isMinor(p) ? "・幼少(摂政が補佐)" : ""), score });
    };
    const byBirth = (xs: Person[]): Person[] => [...xs].sort((a, b) => (a.born ?? 9999) - (b.born ?? 9999));
    const heir = this.heirs[f] ? persons.find((p) => p.id === this.heirs[f]) : undefined;
    if (heir) add(heir, "指名された皇太子・世子", 1000);
    const sons = byBirth(this.childrenOf(old.id).filter((p) => p.gender !== "female"));
    const primaryWife = this.primaryOf(old.id)?.id;
    const legit = sons.filter((s) => this.motherOf(s.id) === primaryWife || (!this.motherOf(s.id) && !s.fictional));
    if (legit[0]) add(legit[0], "嫡長子", 900);
    sons.forEach((s, i) => add(s, "実子", 800 - i));
    // 直系の子孫(孫・曾孫):亡くなった息子の系統も含め、生まれの早い系統から
    let gen = sons;
    for (let depth = 2; depth <= 4; depth++) {
      const next = byBirth(gen.flatMap((s) => this.childrenOf(s.id).filter((p) => p.gender !== "female")));
      next.forEach((g, i) => add(g, depth === 2 ? "孫" : depth === 3 ? "曾孫" : "玄孫", 700 - depth * 20 - i));
      gen = next;
      if (!gen.length) break;
    }
    const bros = byBirth(this.siblingsOf(old.id).filter((p) => p.gender !== "female"));
    bros.forEach((b, i) => add(b, "兄弟", 600 - i));
    bros.forEach((b) => byBirth(this.childrenOf(b.id).filter((p) => p.gender !== "female")).forEach((n, i) => add(n, "甥", 560 - i)));
    for (let a = this.fatherOf(old.id), d = 1; a && d <= 3; a = this.fatherOf(a), d++) {
      const anc = persons.find((p) => p.id === a);
      if (anc) add(anc, d === 1 ? "父" : d === 2 ? "祖父" : "曾祖父", 500 - d);
    }
    for (const p of persons) if (p.bloodline === "xuandi" || ((this.bloodDistance(p.id, old.id) ?? 99) <= 6 && surnameOf(p) === surnameOf(old))) add(p, "劉氏の一族", 400 - (this.bloodDistance(p.id, old.id) ?? 6) * 10);
    return out.sort((a, b) => b.score - a.score);
  }

  /** 史実の後継の表(succession.json)にあり、君主と同姓の人物(劉曜・石虎など) */
  private historicSuccessor(f: string, p: Person, ruler: Person): boolean {
    const rules = (successionRules.rules as Record<string, { person: string }[]>)[f] ?? [];
    return rules.some((r) => r.person === p.id) && surnameOf(p) === surnameOf(ruler);
  }

  /** 後継者を指名する(廃立なら、宮廷が揺れる)。結果の文を返す */
  designateHeir(f: string, id: string): string {
    const p = persons.find((x) => x.id === id);
    const ruler = this.c.rulerOf(f);
    if (!p || !ruler || p.factionId !== f) return "その人物は指名できません";
    if (p.gender === "female") return "後継者には男性を指名します(この時代の慣行)";
    if (p.id === ruler.id) return "君主本人は指名できません";
    if (this.c.personStatus(p.id) !== "active" || this.c.spoils.custodyOf(p.id)) return `${p.name}は、いま指名できる状態ではありません`;
    const kin = (this.bloodDistance(p.id, ruler.id) ?? 99) <= 4;
    const prev = this.heirOf(f);
    if (prev?.id === p.id) return `${p.name}はすでに後継者です`;
    this.heirs[f] = p.id;
    const title = this.rankOf(f) === "emperor" ? "皇太子" : this.rankOf(f) === "king" ? "王太子" : "世子";
    const L = this.c.loyalty;
    if (prev) {
      // 廃立:前の後継者と、その母の一族が恨む。安定度が下がる
      this.counts.heirChanges++;
      this.addStability(f, -15);
      L.add(prev.id, -25, "後継者の地位を廃される");
      const mom = this.motherOf(prev.id);
      if (mom) L.add(mom, -15, "子が廃される");
      this.note(f, `${prev.name}を廃し、${p.name}を${title}に立てる(廃立)`);
    } else {
      this.addStability(f, this.isMinor(p) ? 4 : 10);
      this.note(f, `${p.name}を${title}に立てる`);
    }
    if (!kin) this.addStability(f, -10);
    // 外戚:後継者の母の一族は支持し、ほかの王子と、その母の一族は不満を持つ
    const mom = this.motherOf(p.id);
    const momP = mom ? persons.find((x) => x.id === mom) : undefined;
    if (momP) {
      L.add(momP.id, 8, "子が後継者となる");
      for (const x of persons) if (x.factionId === f && x.id !== momP.id && surnameOf(x) === surnameOf(momP) && x.people === momP.people) L.add(x.id, 4, "外戚として重んじられる");
    }
    for (const s of this.childrenOf(ruler.id)) if (s.id !== p.id && s.gender !== "female" && !this.isMinor(s)) L.add(s.id, -6, `${p.name}が後継者となる`);
    // 有力な武将の支持:後継者との相性と名声しだい
    for (const g of persons.filter((x) => x.factionId === f && x.role === "general" && (L.fame[x.id] ?? 0) >= 60)) {
      L.add(g.id, Math.round((affinity(g, p).value - 50) / 12 + ((L.fame[p.id] ?? 40) - 50) / 20), `${p.name}の立太子`);
    }
    L.addFame(p.id, 4);
    this.c.addNews(`${scenario.factions.find((x) => x.id === f)?.name}で、${p.name}が${title}に立てられました${prev ? `(${prev.name}は廃されました)` : ""}`);
    return `${p.name}を${title}に立てました${prev ? `(${prev.name}を廃しました。宮廷が揺れています)` : ""}${kin ? "" : "(一族ではないため、皇室の安定が下がります)"}`;
  }

  addStability(f: string, d: number): void {
    this.stability[f] = Math.max(0, Math.min(100, (this.stability[f] ?? 60) + d));
  }

  note(f: string, text: string): void {
    const l = (this.log[f] ??= []);
    l.push({ day: Math.floor(this.c.day), text: `${this.c.dateText()} ${text}` });
    if (l.length > 30) l.shift();
  }

  // ---------------- 婚姻 ----------------
  maxConcubines(f: string): number {
    const r = this.c.rulerOf(f);
    const cities = this.c.cities.filter((x) => x.kind !== "pass" && scenario.cityOwners[x.id] === f).length;
    const v = Math.floor(this.c.loyalty.prestige(f) / 20 + cities / 10 + (r && r.charisma >= 75 ? 1 : 0));
    return Math.max(0, Math.min(6, v));
  }

  /** 迎えられる女性(自国の未婚の成人女性) */
  brideCandidates(husband: Person): Person[] {
    return persons.filter((w) => w.gender === "female" && w.factionId === husband.factionId && this.c.diplo.canMarry(husband, w) === null);
  }

  /**
   * 婚姻(国内):正室は1人まで。側室は君主の魅力・威信・国力しだいで、上限まで。
   * kind が primary で正室がいるときは断る。
   */
  marry(husbandId: string, wifeId: string, kind: "primary" | "secondary"): string {
    const h = persons.find((x) => x.id === husbandId);
    const w = persons.find((x) => x.id === wifeId);
    if (!h || !w) return "人物が見つかりません";
    const err = this.c.diplo.canMarry(h, w);
    if (err) return err;
    if (this.isCloseKin(h, w)) return "近親どうしの婚姻はできません";
    if (kind === "primary" && this.primaryOf(h.id)) return `${h.name}にはすでに正室(${this.primaryOf(h.id)!.name})がいます。正室は1人までです`;
    if (kind === "secondary") {
      if (!this.primaryOf(h.id) && h.role === "ruler") return "先に正室を迎えてください";
      const f = h.factionId;
      if (h.role === "ruler" && this.concubinesOf(h.id).length >= this.maxConcubines(f)) return `側室は、いまの威信と国力では${this.maxConcubines(f)}人までです`;
    }
    // ほかの国の女性なら、婚姻でその国とつながる(友好度+20。同盟は外交の画面の「婚姻同盟」で結ぶ)
    const other = w.factionId !== h.factionId ? w.factionId : null;
    this.c.diplo.marriages.push({ husband: h.id, wife: w.id, kind, historic: false, day: Math.floor(this.c.day), ...(other ? { alliance: [h.factionId, other] as [string, string] } : {}) });
    if (other) {
      this.c.spoils.setFaction(w.id, h.factionId);
      this.c.diplo.addAmity(h.factionId, other, 20);
      this.c.diplo.log(h.factionId, other, `婚姻(${h.name}と${w.name})`);
    }
    this.afterMarriage(h, w, kind);
    return `${h.name}が${w.name}を${kind === "primary" ? "正室" : "側室"}に迎えました`;
  }

  private afterMarriage(h: Person, w: Person, kind: "primary" | "secondary"): void {
    const f = h.factionId;
    if (kind === "primary") {
      this.counts.primaries++;
      this.addStability(f, 5);
    } else this.counts.concubines++;
    this.c.diplo.counts.marriages++;
    // 妃の出身の家門(同じ姓の臣下)は、宮廷で重んじられる(外戚)
    for (const x of persons) if (x.factionId === f && x.id !== w.id && x.role !== "ruler" && surnameOf(x) === surnameOf(w) && x.people === w.people) this.c.loyalty.add(x.id, kind === "primary" ? 6 : 3, "一族の娘が嫁ぐ(外戚)");
    this.c.loyalty.add(w.id, 10, "婚姻");
    this.note(f, `${h.name}が${w.name}を${kind === "primary" ? "正室" : "側室"}に迎える`);
    if (h.role === "ruler") this.c.addNews(`${scenario.factions.find((x) => x.id === f)?.name}の${h.name}が、${w.name}を${kind === "primary" ? "正室" : "側室"}に迎えました`);
  }

  /**
   * 名家から妃を迎える(架空の人物):臣下 sponsor の一族の娘。家門の臣下の忠誠が上がり、外戚が台頭する。
   */
  takeNobleConsort(f: string, sponsorId: string, kind: "primary" | "secondary"): string {
    const ruler = this.c.rulerOf(f);
    const sp = persons.find((x) => x.id === sponsorId && x.factionId === f);
    if (!ruler || !sp) return "家門を選んでください";
    if (sp.role === "ruler" || (this.bloodDistance(sp.id, ruler.id) ?? 99) <= 4 || surnameOf(sp) === surnameOf(ruler)) return "君主と同じ一族の家から妃は迎えられません";
    if (kind === "primary" && this.primaryOf(ruler.id)) return `すでに正室(${this.primaryOf(ruler.id)!.name})がいます。正室は1人までです`;
    if (kind === "secondary" && this.concubinesOf(ruler.id).length >= this.maxConcubines(f)) return `側室は、いまの威信と国力では${this.maxConcubines(f)}人までです`;
    if (kind === "secondary" && !this.primaryOf(ruler.id)) return "先に正室を迎えてください";
    const purse = this.c.factionStates[f];
    if (!purse || purse.gold < 300) return "婚礼の費用(金300)がありません";
    purse.gold -= 300;
    const sur = surnameOf(sp);
    const ra = this.age(ruler) ?? 30;
    const born = this.year() - Math.max(16, Math.min(24, Math.round(ra * 0.6)));
    const w = this.newPerson({ name: `${sur}氏`, gender: "female", born, factionId: f, role: "minister", people: sp.people, seed: `${sp.id}|${this.c.day}`,
      bio: `${sp.name}の一族の娘。${FICTION_NOTE}`, title: kind === "primary" ? "正室" : "側室", stats: { leadership: 20, war: 10, intelligence: 50, politics: 50, charisma: 60 } });
    this.c.diplo.marriages.push({ husband: ruler.id, wife: w.id, kind, historic: false, day: Math.floor(this.c.day) });
    this.afterMarriage(ruler, w, kind);
    this.c.loyalty.add(sp.id, kind === "primary" ? 12 : 6, "一族の娘が君主に嫁ぐ");
    return `${sp.name}の一族の娘(${w.name}・架空の人物)を${kind === "primary" ? "正室" : "側室"}に迎えました`;
  }

  /** 側室を正室に昇格させる(正室がいないときだけ) */
  promote(f: string, wifeId: string): string {
    const ruler = this.c.rulerOf(f);
    if (!ruler) return "君主がいません";
    if (this.primaryOf(ruler.id)) return "正室がいるため、側室を正室にはできません(正室は1人まで)";
    const m = this.c.diplo.marriages.find((x) => x.husband === ruler.id && x.wife === wifeId && x.kind === "secondary");
    if (!m) return "側室ではありません";
    m.kind = "primary";
    this.addStability(f, 4);
    const w = persons.find((x) => x.id === wifeId)!;
    this.note(f, `${w.name}を正室に立てる(冊立)`);
    this.c.addNews(`${scenario.factions.find((x) => x.id === f)?.name}で、${w.name}が正室に立てられました`);
    return `${w.name}を正室に立てました`;
  }

  /**
   * 後宮の女官を、妃として人物の台帳に加える(皇帝生活モード)。架空の人物として扱う。
   */
  addPalaceLady(f: string, o: { name: string; born: number; people?: string; seed: string; bio: string; title: string }): Person {
    return this.newPerson({ name: o.name, gender: "female", born: o.born, factionId: f, role: "minister", people: o.people, seed: o.seed, bio: o.bio, title: o.title,
      stats: { leadership: 15, war: 8, intelligence: 50, politics: 40, charisma: 65 }, residence: this.c.capitalCityOf(f)?.id });
  }

  /**
   * 後宮から妃(側室)を迎える(皇帝生活モード)。本人の同意は後宮の側で確かめてから呼ぶ。
   * 側室の数は、いまの威信と国力の上限まで。正室がいなくても、妃として迎えられる(皇后の冊立は別に行う)。
   */
  palaceConsort(f: string, wifeId: string): string | null {
    const h = this.c.rulerOf(f);
    const w = persons.find((x) => x.id === wifeId);
    if (!h || !w) return "人物が見つかりません";
    if (this.spousesOf(h.id).some((x) => x.id === w.id)) return "すでに妃です";
    if (this.isCloseKin(h, w)) return "近親どうしの婚姻はできません";
    if (this.concubinesOf(h.id).length >= this.maxConcubines(f)) return `妃は、いまの威信と国力では${this.maxConcubines(f)}人までです`;
    this.c.diplo.marriages.push({ husband: h.id, wife: w.id, kind: "secondary", historic: false, day: Math.floor(this.c.day) });
    this.afterMarriage(h, w, "secondary");
    return null;
  }

  /** 新しい人物(架空)を作って台帳に加える */
  private newPerson(o: { name: string; gender: "male" | "female"; born: number; factionId: string; role: Person["role"]; people?: string; seed: string; bio: string; title: string; stats: Stats; father?: string; mother?: string; residence?: string }): Person {
    const id = `born_${this.nextId++}`;
    const p: Person = {
      id, name: o.name, reading: "(架空)", born: o.born, died: null, factionId: o.factionId, role: o.role, title: o.title,
      ...o.stats, traits: [], favoredUnit: null, bio: o.bio, gender: o.gender, people: o.people, residence: o.residence, note: FICTION_NOTE, fictional: true,
    };
    persons.push(p);
    this.added.push(p);
    if (o.father || o.mother) this.parents[id] = { father: o.father, mother: o.mother };
    this.lifespan[id] = 45 + Math.floor(chance(o.seed + "|life") * 31);
    const L = this.c.loyalty;
    L.fame[id] = 10;
    L.loyalty[id] = 75;
    this.snapshot(p);
    if (this.base[id]) this.applyGrowth();
    return p;
  }

  // ---------------- 宮廷費 ----------------
  /** 宮廷費(月):正室6・側室5・未成年の子女2・成人の王族1。皇帝は1.5倍、王は1.2倍 */
  courtCost(f: string): number {
    const r = this.c.rulerOf(f);
    if (!r) return 0;
    const wives = this.spousesOf(r.id).filter((w) => this.alive(w.id));
    const cost = wives.reduce((s, w) => s + (this.primaryOf(r.id)?.id === w.id ? 6 : 5), 0);
    const kids = this.childrenOf(r.id).filter((k) => this.alive(k.id));
    const v = cost + kids.reduce((s, k) => s + (this.isMinor(k) ? 2 : 1), 0);
    return Math.round(v * ({ emperor: 1.5, king: 1.2, duke: 1, chief: 0.8, lord: 1 }[this.rankOf(f)]));
  }

  // ---------------- 皇帝即位 ----------------
  /** 次の称号と、条件を満たしているか(満たしていない条件の一覧) */
  crownCheck(f: string): { next: Rank | null; ok: boolean; missing: string[] } {
    const rank = this.rankOf(f);
    if (rank === "emperor") return { next: null, ok: false, missing: ["すでに皇帝です"] };
    const fac = scenario.factions.find((x) => x.id === f);
    const korea = ["goguryeo", "baekje", "silla", "shanshan", "yutian", "shule", "qiuci", "yanqi", "jushi"].includes(fac?.founded?.from ?? f);
    const next: Rank = rank === "chief" || rank === "lord" && this.c.economy.systemOf(f).id === "steppe" ? "king" : rank === "duke" || rank === "lord" ? "king" : "emperor";
    if (korea && next === "emperor") return { next: null, ok: false, missing: ["朝鮮三国・西域の王は、この時代は皇帝を称しません(史実の慣行)"] };
    const cities = this.c.cities.filter((x) => x.kind !== "pass" && scenario.cityOwners[x.id] === f).length;
    const r = this.c.rulerOf(f);
    const need = next === "emperor" ? { cities: 10, prestige: 55, fame: 55, stab: 45, troops: 60000 } : { cities: 4, prestige: 38, fame: 40, stab: 35, troops: 15000 };
    const missing: string[] = [];
    if (cities < need.cities) missing.push(`都市${need.cities}以上(いま${cities})`);
    const pr = this.c.loyalty.prestige(f);
    if (pr < need.prestige) missing.push(`威信${need.prestige}以上(いま${pr})`);
    const fame = r ? Math.round(this.c.loyalty.fame[r.id] ?? 0) : 0;
    if (fame < need.fame) missing.push(`君主の名声${need.fame}以上(いま${fame})`);
    const st = Math.round(this.stability[f] ?? 60);
    if (st < need.stab) missing.push(`皇室の安定${need.stab}以上(いま${st})`);
    const tr = Math.round(this.c.strengthOf(f));
    if (tr < need.troops) missing.push(`兵力${need.troops.toLocaleString("ja-JP")}以上(いま${tr.toLocaleString("ja-JP")})`);
    return { next, ok: missing.length === 0, missing };
  }

  crown(f: string): string {
    const chk = this.crownCheck(f);
    if (!chk.next) return chk.missing.join("");
    if (!chk.ok) return `まだ称せません:${chk.missing.join("・")}`;
    const fac = scenario.factions.find((x) => x.id === f)!;
    const r = this.c.rulerOf(f);
    this.ranks[f] = chk.next;
    fac.title = RANK_LABEL[chk.next];
    this.counts.crowns++;
    this.addStability(f, 6);
    if (r) this.c.loyalty.addFame(r.id, chk.next === "emperor" ? 12 : 6);
    // 周りの国:皇帝を称すれば、ほかの皇帝の国は認めず、友好度が下がる
    for (const g of scenario.factions) {
      if (g.id === f || g.passive || g.fallen) continue;
      if (chk.next === "emperor" && this.rankOf(g.id) === "emperor") {
        this.c.diplo.addAmity(f, g.id, -20);
        this.c.diplo.log(f, g.id, `${fac.name}の皇帝即位を認めず`);
      } else if (this.c.diplo.neighbors(f, g.id)) this.c.diplo.addAmity(f, g.id, -5);
    }
    const t = chk.next === "emperor" ? "皇帝に即位" : "王を称";
    this.note(f, `${r?.name ?? ""}が${t}する`);
    this.c.history?.log("crown", `${fac.name}の${r?.name ?? ""}が${t}する`);
    this.c.addNews(`${fac.name}の${r?.name ?? "君主"}が${t}しました`);
    return `${r?.name ?? "君主"}が${t}しました(威信と名声が上がり、ほかの皇帝の国との関係が悪くなりました)`;
  }

  // ---------------- 君主の死と継承 ----------------
  /**
   * 継承:後継順位の1位が即位する。継承争いの危険を調べ、起これば、有力な王族が皇位を主張して自立する(内乱)。
   * 返り値は新しい君主(いなければ null)。
   */
  succeed(f: string, old: Person): Person | null {
    const order = this.successionOrder(f, old.id);
    if (!order[0] && !scenario.factions.find((x) => x.id === f)?.fallen) {
      // 継げる人物が誰もいない小国:史料に名の残らない一族の者(架空)が立つ(国がいきなり消えないように)
      const k = this.kinsman(f, old);
      order.push({ p: k, reason: "一族(架空)", score: 100 });
    }
    const next = order[0]?.p;
    if (!next) return null;
    this.counts.successions++;
    delete this.heirs[f];
    const risk = this.disputeRisk(f, next, order);
    // 皇統継承(仮想シナリオの特殊能力):継承争いが起きず、宮廷の揺れが半分
    const smooth = effectsOf(next).some((x) => x.e.succession);
    if (smooth) risk.value = 0;
    // 反乱の起こりやすさ(仮想シナリオ:漢の正統など)は、継承争いにもかかる
    if (scenario.virtual) risk.value *= factionMult(factionTraitEffects(f, Math.floor(this.c.day)), "rebellion", LIMITS.rebellion, 1);
    this.addStability(f, smooth ? -5 : -10);
    this.note(f, `${old.name}の死去により、${next.name}が即位(${order[0].reason})`);
    // 皇位を争う者:成人の王族。いなければ、軍団を持ち、名声が高く忠誠の低い権臣
    const L = this.c.loyalty;
    const claimant = order.slice(1).find((o) => !o.reason.startsWith("有力な武将") && !this.isMinor(o.p) && o.p.role !== "minister")
      ?? order.find((o) => o.reason.startsWith("有力な武将") && o.p.id !== next.id && this.c.postOf(o.p.id)?.kind === "army" && (L.fame[o.p.id] ?? 0) >= 60 && (L.loyalty[o.p.id] ?? 60) < 50);
    if (claimant && chance(`${Math.floor(this.c.day)}|${f}|dispute`) < risk.value) {
      this.counts.disputes++;
      this.c.loyalty.noteDispute(f);
      this.addStability(f, -15);
      this.c.loyalty.add(claimant.p.id, -25, `${next.name}の即位に不満(継承争い)`);
      this.note(f, `継承争い:${claimant.p.name}が${next.name}の即位を認めない(${risk.parts.join("・")})`);
      this.c.addNews(`${scenario.factions.find((x) => x.id === f)?.name}で継承争いが起こりました:${claimant.p.name}が${next.name}の即位を認めません`);
      // 内乱:君主の入れ替えのあとで、皇位を主張して自立する(拠点と兵がなければ、宮廷の対立にとどまる)
      this.pendingClaim = { f, claimant: claimant.p.id };
    }
    return next;
  }

  /** 史料に名の残らない一族の男子(架空・成人) */
  private kinsman(f: string, old: Person): Person {
    const clan: Record<string, string> = { goguryeo: "高", baekje: "扶余", silla: "金", tuyuhun: "慕容", tiefu: "劉", yuwen: "宇文", duan: "段", chouchi: "楊", dai: "拓跋" };
    const root = scenario.factions.find((x) => x.id === f)?.founded?.from ?? f;
    const sur = clan[root] ?? surnameOf(old);
    const used = new Set(persons.map((p) => p.name));
    const day = Math.floor(this.c.day);
    let name = "";
    for (let i = 0; i < BOY.length && !name; i++) {
      const n = sur + BOY[(Math.floor(chance(`${day}|${f}|kin`) * BOY.length) + i) % BOY.length];
      if (!used.has(n)) name = n;
    }
    const st = (k: string): number => 45 + Math.floor(chance(`${day}|${f}|${k}`) * 25);
    return this.newPerson({
      name: name || `${sur}氏の者`, gender: "male", born: this.year() - 25 - Math.floor(chance(`${day}|${f}|age`) * 15), factionId: f, role: "general", people: old.people, seed: `${day}|${f}|kinsman`,
      bio: `${old.name}の一族の者。${FICTION_NOTE}`, title: "", stats: { leadership: st("l"), war: st("w"), intelligence: st("i"), politics: st("p"), charisma: st("c") }, residence: old.residence,
    });
  }

  /** 継承のあとで処理する内乱(Campaign が君主を入れ替えたあとに呼ぶ) */
  pendingClaim: { f: string; claimant: string } | null = null;

  resolveClaim(): void {
    const pc = this.pendingClaim;
    this.pendingClaim = null;
    if (!pc) return;
    const cl = persons.find((x) => x.id === pc.claimant);
    if (!cl || cl.factionId !== pc.f) return;
    if (this.c.secede(cl.id, "皇位を主張して")) {
      this.counts.civilWars++;
      this.note(pc.f, `内乱:${cl.name}が皇位を主張して自立`);
      const nf = scenario.factions.find((x) => x.ruler === cl.name && x.founded?.from === pc.f);
      if (nf) {
        this.ranks[nf.id] = this.rankOf(pc.f);
        nf.title = RANK_LABEL[this.rankOf(pc.f)];
        this.stability[nf.id] = 45;
      }
    }
  }

  /** 継承争いの起こりやすさ(0〜0.9)と、その理由 */
  disputeRisk(f: string, next: Person, order = this.successionOrder(f)): { value: number; parts: string[] } {
    const parts: string[] = [];
    let v = 0.05;
    if (!this.heirs[f]) {
      v += 0.15;
      parts.push("後継者が未指名");
    }
    if (this.isMinor(next)) {
      v += 0.25;
      parts.push("新君主が未成年");
    }
    const sons = order.filter((o) => o.reason.startsWith("正室の子") || o.reason.startsWith("側室の子"));
    if (sons.some((o) => o.reason.startsWith("正室")) && sons.some((o) => o.reason.startsWith("側室")) && !this.isMinor(sons[1]?.p ?? next)) {
      v += 0.1;
      parts.push("正室の子と側室の子が並ぶ");
    }
    const armed = order.slice(1).find((o) => !o.reason.startsWith("有力な武将") && this.c.postOf(o.p.id)?.kind === "army" && (this.c.loyalty.loyalty[o.p.id] ?? 60) < 65);
    if (armed) {
      v += 0.2;
      parts.push(`${armed.p.name}が軍団を持つ`);
    }
    if (this.c.loyalty.prestige(f) < 40) {
      v += 0.08;
      parts.push("威信が低い");
    }
    const low = persons.filter((x) => x.factionId === f && x.role === "general" && (this.c.loyalty.fame[x.id] ?? 0) >= 60 && (this.c.loyalty.loyalty[x.id] ?? 60) < 40).length;
    if (low) {
      v += 0.08;
      parts.push("有力な武将の忠誠が低い");
    }
    if (this.c.economy.arrearsOf(f) > 0) {
      v += 0.08;
      parts.push("財政難");
    }
    if ((this.stability[f] ?? 60) < 40) {
      v += 0.12;
      parts.push("皇室が不安定");
    }
    const top = this.inLaws(f)[0];
    if (top && top.influence >= 70) {
      v += 0.08;
      parts.push(`外戚(${top.clan}氏)の力が強い`);
    }
    return { value: Math.min(0.9, v), parts };
  }

  // ---------------- 毎月 ----------------
  monthly(): void {
    const year = this.year();
    const month = this.c.calendar().month;
    // 負傷は、月に3割の見込みで治る(これまでは治らなかった)
    // 仁医(仮想シナリオ):その国の負傷者の治る見込みが2倍(90%まで)
    for (const [id, st] of Object.entries(this.c.personStates)) if (st === "wounded" && chance(`${Math.floor(this.c.day)}|${id}|heal`) < Math.min(0.9, 0.3 * prodOf(factionTraitEffects(persons.find((p) => p.id === id)?.factionId ?? "", Math.floor(this.c.day)), "heal"))) delete this.c.personStates[id];
    this.deaths(year, month);
    this.politicalDeaths(year);
    this.depositions(year);
    this.educate();
    this.historicBirths(year, month);
    this.plannedMarriages(year);
    if (month === 2) this.royalMarriages(year);
    this.royalBirths(year, month);
    this.historicDebuts(year);
    this.births(year);
    this.applyGrowth();
    this.dynastyWatch();
    this.monthlyTraitFlats();
    for (const f of scenario.factions) {
      if (f.passive || f.fallen) continue;
      const r = this.c.rulerOf(f.id);
      if (!r) continue;
      // 安定度は目安へ少しずつ近づく:後継者(成人+10・未成年-5・未指名-15)、威信、財政難
      const heir = this.heirOf(f.id);
      let target = 55 + (heir ? (this.isMinor(heir) ? -5 : 10) : -15) + (this.c.loyalty.prestige(f.id) - 50) / 5 - Math.min(20, this.c.economy.arrearsOf(f.id) * 5);
      if (this.isMinor(r)) {
        // 幼君:摂政がいなければ、いちばんの候補を立てる(プレイヤーは画面で替えられる)。摂政の政治と名声で安定が変わる
        if (!this.regentOf(f.id)) {
          const best = this.regentCandidates(f.id)[0];
          if (best) this.appointRegent(f.id, best.p.id);
        }
        const reg = this.regentOf(f.id);
        target -= reg ? 15 - (reg.politics - 50) / 5 - (this.c.loyalty.fame[reg.id] ?? 30) / 20 : 15;
      } else if (this.regentOf(f.id) && f.id !== this.c.playerFactionId && (this.age(r) ?? 99) >= 16) this.personalRule(f.id);
      // 外戚が強すぎるとき(影響力70以上)、宮廷が不安定なら対立が起こる(外戚だからといって必ず反乱するわけではない)
      const top = this.inLaws(f.id)[0];
      if (top && top.influence >= 70) {
        target -= (top.influence - 70) / 3;
        if ((this.stability[f.id] ?? 60) < 45) for (const o of this.successionOrder(f.id).slice(0, 3)) if (!o.reason.startsWith("有力な武将")) this.c.loyalty.add(o.p.id, -1, `外戚(${top.clan}氏)の台頭`);
      }
      target = Math.max(5, Math.min(95, target));
      const s = this.stability[f.id] ?? 60;
      this.stability[f.id] = s + Math.sign(target - s) * Math.min(1.5, Math.abs(target - s));
      // 宮廷の対立:不安定なとき、後継者でない成人の王子・兄弟の忠誠が下がる
      if ((this.stability[f.id] ?? 60) < 30) {
        for (const o of this.successionOrder(f.id).slice(1, 4)) if (!o.reason.startsWith("有力な武将") && !this.isMinor(o.p)) this.c.loyalty.add(o.p.id, -1, "宮廷の対立");
      }
      if (heir && heir.id !== this.heirs[f.id]) delete this.heirs[f.id];
    }
    this.usurp(year);
  }

  /** 寿命:史実の没年を過ぎれば亡くなる(月は人物ごとに決まる)。架空の人物は45〜75歳 */
  /**
   * 死:病死・老衰・不明の人は、史実の没年(月は人物ごと)に亡くなる。
   * 戦死・処刑・暗殺・自害の人は、没年が来ても、それを起こす出来事(会戦・政変)がなければ死なない。
   * そのかわり、没年を過ぎると年齢に応じた見込みで自然に亡くなることがある(史実と違う展開で生き延びる余地)。
   * 架空の人物は45〜75歳。生没年の分からない人は78歳で亡くなる。
   */
  private deaths(year: number, month: number): void {
    const day = Math.floor(this.c.day);
    for (const p of [...persons]) {
      if (this.c.personStatus(p.id) === "dead") continue;
      const life = this.lifespan[p.id];
      const b = this.bornOf(p);
      const h = historicDeath(p);
      let cause: DeathCause | null = null;
      if (p.died !== null && p.died >= scenario.year && h && ["illness", "old_age", "unknown"].includes(h.cause)) {
        // 亡くなる月:史料で分かる人はその月(劉聡7月・石勒7月など)、ほかは人物ごとに決まる月
        if (year > p.died || (year === p.died && month >= (h.month ?? 1 + Math.floor(chance(p.id + "|dm") * 12)))) cause = h.cause;
      } else if (p.died !== null && p.died >= scenario.year && year > p.died) {
        const age = b !== null ? year - b : 50 + (year - p.died);
        // 史実の死(戦死・処刑など)を起こす出来事がなかった人も、いつまでも生き続けはしない(Version 40:主役の不死化の解消)。
        // 没年を過ぎた年数に応じて、亡くなる見込みを上げる(1年ごとに+4%、上限50%)
        const over = Math.min(0.5, 0.04 * (year - p.died));
        const annual = Math.max(over, age < 40 ? 0.01 : age < 50 ? 0.02 : age < 60 ? 0.04 : age < 70 ? 0.08 : age < 80 ? 0.15 : 0.3);
        if (chance(`${day}|${p.id}|mort`) < annual / 12) cause = age >= 70 ? "old_age" : "illness";
      }
      if (life !== undefined && b !== null && year - b >= life) cause = year - b >= 65 ? "old_age" : "illness";
      if (p.died === null && life === undefined && b !== null && year - b >= 78) cause = "old_age";
      if (!cause) continue;
      this.kill(p.id, cause);
    }
  }

  /** 人物が亡くなる(死因を記録する) */
  kill(id: string, cause: DeathCause, text = ""): void {
    const p = persons.find((x) => x.id === id);
    if (!p || this.c.personStatus(id) === "dead") return;
    this.c.dieNaturally(id, cause);
    this.recordCause(id, cause, text);
  }

  recordCause(id: string, cause: DeathCause, text = ""): void {
    if (this.causes[id]) return;
    this.causes[id] = { cause, day: Math.floor(this.c.day), text };
    this.counts.deaths++;
    if (!["illness", "old_age", "unknown"].includes(cause)) this.counts.violentDeaths++;
    // 摂政が亡くなれば、空きにする
    for (const [f, r] of Object.entries(this.regents)) if (r === id) delete this.regents[f];
  }

  causeOf(id: string): { cause: DeathCause; day: number; text: string } | undefined {
    return this.causes[id];
  }

  /**
   * 史実の政変による死(処刑・暗殺・自害):手を下した人物がゲームにいて、同じ国にいるか、
   * 被害者をその国が捕らえているときだけ、没年から3年のあいだに起こる見込みがある。
   */
  private politicalDeaths(year: number): void {
    const day = Math.floor(this.c.day);
    for (const [id, d] of Object.entries(DEATHS)) {
      if (!d.by || !["execution", "assassination", "suicide"].includes(d.cause)) continue;
      const v = persons.find((x) => x.id === id);
      if (!v || v.died === null || year < v.died || year > v.died + 3 || this.c.personStatus(id) === "dead") continue;
      // まだ起きていない歴史の事件の主役(靳準など)は、その事件より先には死なせない
      if (this.c.history?.awaitsPerson(id)) continue;
      const by = persons.find((x) => x.id === d.by);
      if (!by || this.c.personStatus(by.id) !== "active" || this.c.spoils.custodyOf(by.id)) continue;
      const held = this.c.spoils.custodyOf(id)?.holder === by.factionId;
      if (!(held || v.factionId === by.factionId)) continue;
      // 君主を殺す政変は、簒奪の表で扱う(ここでは臣下・捕虜・王族)
      if (v.role === "ruler" && !held) continue;
      if (chance(`${day}|${id}|pol`) >= 0.15) continue;
      this.kill(id, d.cause, `${by.name}による(史実:${d.note ?? ""})`);
      this.note(by.factionId, `${v.name}が${by.name}によって${CAUSE_LABEL[d.cause]}される(史実の政変)`);
      this.c.addNews(`${v.name}が${by.name}によって${CAUSE_LABEL[d.cause] === "自害" ? "自害に追い込まれ" : CAUSE_LABEL[d.cause] + "され"}ました(史実の政変)`);
    }
  }

  /** 史実の子女:生年になり、親がゲームにいれば生まれる(史実の人物として加わる) */
  private historicBirths(year: number, month: number): void {
    if (month !== 1 + (year % 6)) return;
    for (const [child, fam] of Object.entries(FAMILY.parents)) {
      // 条件つきの子(仮想シナリオの皇族)は royalBirths で扱う(二重に生まれないように)
      if (fam.conditional || persons.some((p) => p.id === child)) continue;
      const base = ledgerPerson(child);
      if (!base || base.born === null || base.born > year || base.born <= scenario.year) continue;
      const parent = [fam.father, fam.mother].map((id) => persons.find((p) => p.id === id)).find((p) => p && this.c.personStatus(p.id) !== "dead" && !scenario.factions.find((x) => x.id === p.factionId)?.fallen);
      if (!parent) continue;
      const p: Person = { ...base, factionId: parent.factionId, role: base.role === "ruler" ? "general" : base.role, residence: parent.residence, title: "" };
      persons.push(p);
      this.added.push(p);
      const L = this.c.loyalty;
      L.fame[p.id] = 10;
      L.loyalty[p.id] = 80;
      this.snapshot(p);
      this.counts.historicBirths++;
      this.counts.births++;
      this.note(parent.factionId, `${parent.name}の子 ${p.name}が生まれる(史実)`);
      if (parent.role === "ruler") this.c.addNews(`${scenario.factions.find((x) => x.id === parent.factionId)?.name}の${parent.name}に、${p.name}が生まれました(史実の人物)`);
    }
  }

  /**
   * 途中から登場する史実の大人の人物(family.json の debuts)。
   * 早い年代から始めたとき、劉裕などが史実で世に出た年に、ゆかりの人物の勢力へ加わる。
   * ゆかりの人物が死んだ・滅んだ勢力にいるなど、歴史が変わっていれば登場しない(無理に史実へ戻さない)。
   */
  private historicDebuts(year: number): void {
    const list = (familyData as unknown as { debuts?: Debut[] }).debuts ?? [];
    for (const d of list) {
      if (d.year <= scenario.year || d.year > year || persons.some((p) => p.id === d.person)) continue;
      const base = ledgerPerson(d.person);
      if (!base || (base.died !== null && base.died <= year) || (base.born !== null && year - base.born < 15)) continue;
      const live = (f: string | undefined) => !!f && scenario.factions.some((x) => x.id === f && !x.fallen && !x.passive);
      const host = (d.follow ?? []).map((id) => persons.find((p) => p.id === id)).find((p) => p && this.c.personStatus(p.id) !== "dead" && !this.c.spoils.custodyOf(p.id) && live(p.factionId));
      const fid = host?.factionId ?? (live(d.faction) ? d.faction : undefined);
      if (!fid) continue;
      // 1年たっても条件が整わなければ、その人物は登場しない(何十年も遅れて出てこないように)
      if (year > d.year + 1) continue;
      const city = d.city && scenario.cityOwners[d.city] === fid ? d.city : host?.residence ?? this.c.capitalCityOf(fid)?.id;
      const p: Person = { ...base, factionId: fid, role: base.role === "ruler" ? "general" : base.role, residence: city, title: d.title ?? base.title };
      persons.push(p);
      this.added.push(p);
      const L = this.c.loyalty;
      L.fame[p.id] = 25;
      L.loyalty[p.id] = 75;
      this.snapshot(p);
      this.counts.debuts = (this.counts.debuts ?? 0) + 1;
      // 史実の婚姻:相手がすでにゲームにいれば結ぶ
      for (const [h, w, kind] of FAMILY.marriages) {
        if (h !== p.id && w !== p.id) continue;
        const other = h === p.id ? w : h;
        if (!persons.some((x) => x.id === other) || this.c.personStatus(other) === "dead") continue;
        if (this.c.diplo.marriages.some((m) => m.husband === h && m.wife === w)) continue;
        this.c.diplo.marriages.push({ husband: h, wife: w, kind, historic: true, day: Math.floor(this.c.day) });
      }
      const fname = scenario.factions.find((x) => x.id === fid)?.name ?? "";
      this.note(fid, `${p.name}が${fname}に加わる(史実の人物の登場${d.note ? `:${d.note}` : ""})`);
      if (p.id === "liu_yu_song") this.c.addNews(`${fname}に、北府軍の劉裕が現れました(史実の人物の登場)`);
    }
  }

  /** 決まった夫婦(family.json の plannedMarriages):ともに生きて、捕らわれておらず、決まった年齢になれば結ばれる */
  private plannedMarriages(year: number): void {
    for (const m of FAMILY.plannedMarriages ?? []) {
      if (m.scenarios && !m.scenarios.includes(scenario.id)) continue;
      const h = persons.find((p) => p.id === m.husband);
      const w = persons.find((p) => p.id === m.wife);
      if (!h || !w || !this.alive(h.id) || !this.alive(w.id) || this.c.spoils.custodyOf(h.id) || this.c.spoils.custodyOf(w.id)) continue;
      if (this.c.diplo.marriages.some((x) => x.husband === h.id && x.wife === w.id)) continue;
      if ((this.age(h) ?? 0) < m.minAge || (this.age(w) ?? 0) < m.minAge) continue;
      // ほかの人の正室になっている女性は、奪わない
      if (this.c.diplo.marriages.some((x) => x.wife === w.id && x.husband !== h.id && this.alive(x.husband))) continue;
      if (w.factionId !== h.factionId) this.c.spoils.setFaction(w.id, h.factionId);
      this.c.diplo.marriages.push({ husband: h.id, wife: w.id, kind: m.kind, historic: true, day: Math.floor(this.c.day) });
      this.counts.primaries++;
      this.note(h.factionId, `${h.name}と${w.name}が夫婦となる${m.note ? `(${m.note})` : ""}`);
      void year;
    }
  }

  /**
   * 皇族の婚姻(仮想シナリオの宣帝の血統):18〜45歳で正室のいない劉氏の男子は、年に4割の見込みで名家の娘(架空)を正室に迎える。
   * これまでのAIは君主の婚姻だけを扱っていたため、皇子の系統が途絶えないように加えた(子は既存の出生の仕組みで生まれる)
   */
  private royalMarriages(year: number): void {
    if (!scenario.virtual) return;
    const clans = ["王", "謝", "庾", "荀", "鄭", "崔", "盧", "楊", "韋", "裴", "陳", "顧"];
    for (const p of persons) {
      if (p.bloodline !== "xuandi" || p.gender === "female" || !this.alive(p.id) || this.c.spoils.custodyOf(p.id)) continue;
      const a = this.age(p) ?? 0;
      if (a < 18 || a > 45 || this.primaryOf(p.id)) continue;
      if (FAMILY.plannedMarriages?.some((m) => m.husband === p.id && persons.some((w) => w.id === m.wife && this.alive(w.id)))) continue;
      const f = scenario.factions.find((x) => x.id === p.factionId);
      if (!f || f.fallen || f.passive) continue;
      const day = Math.floor(this.c.day);
      if (chance(`${day}|${p.id}|rmar`) >= 0.4) continue;
      const sur = clans[Math.floor(chance(`${day}|${p.id}|clan`) * clans.length)];
      const used = new Set(persons.map((x) => x.name));
      let name = "";
      for (let i = 0; i < GIRL.length && !name; i++) {
        const n = sur + GIRL[(Math.floor(chance(`${day}|${p.id}|wnm`) * GIRL.length) + i) % GIRL.length];
        if (!used.has(n)) name = n;
      }
      const st = (k: string): number => 55 + Math.floor(chance(`${day}|${p.id}|w${k}`) * 40);
      const w = this.newPerson({
        name: name || `${sur}氏`, gender: "female", born: year - Math.max(16, a - 2 - Math.floor(chance(`${day}|${p.id}|wa`) * 4)), factionId: p.factionId, role: "minister", people: "漢", seed: `${day}|${p.id}|wife`,
        bio: `${sur}氏の名家の娘。${p.name}の正室となる。${FICTION_NOTE}`, title: `${p.name}の妃`, stats: { leadership: st("l"), war: st("w") - 20, intelligence: st("i"), politics: st("p"), charisma: st("c") }, residence: p.residence,
      });
      this.c.diplo.marriages.push({ husband: p.id, wife: w.id, kind: "primary", historic: false, day });
      this.counts.primaries++;
      this.note(p.factionId, `${p.name}が${w.name}を正室に迎える(皇族の婚姻)`);
    }
  }

  /**
   * 条件つきの子(family.json の parents の conditional。仮想シナリオの劉睿・劉瑛・劉弘):
   * 生まれる年から2年のうちに、両親がともに生きて捕らわれておらず、夫婦であり、母が15〜42歳のときだけ生まれる。
   * 条件がそろわなければ生まれない(無理に誕生させない)。生まれた年は、実際に生まれた年にする
   */
  private royalBirths(year: number, month: number): void {
    for (const [child, fam] of Object.entries(FAMILY.parents)) {
      if (!fam.conditional || persons.some((p) => p.id === child)) continue;
      const base = ledgerPerson(child);
      if (!base || base.born === null || year < base.born || year > base.born + 2 || base.born <= scenario.year) continue;
      if (month !== 1 + ((year + child.length) % 6)) continue;
      const fa = persons.find((p) => p.id === fam.father);
      const mo = persons.find((p) => p.id === fam.mother);
      if (!fa || !mo || !this.alive(fa.id) || !this.alive(mo.id) || this.c.spoils.custodyOf(fa.id) || this.c.spoils.custodyOf(mo.id)) continue;
      if (!this.c.diplo.marriages.some((m) => m.husband === fa.id && m.wife === mo.id)) continue;
      const ma = this.age(mo) ?? 25;
      if (ma < 15 || ma > 42) continue;
      const p: Person = { ...base, born: year, factionId: fa.factionId, role: base.role === "ruler" ? "general" : base.role, residence: fa.residence, title: "" };
      persons.push(p);
      this.added.push(p);
      this.c.loyalty.fame[p.id] = 10;
      this.c.loyalty.loyalty[p.id] = 85;
      this.snapshot(p);
      this.applyGrowth();
      this.counts.historicBirths++;
      this.counts.births++;
      this.note(fa.factionId, `${fa.name}と${mo.name}に${p.gender === "female" ? "女子" : "男子"} ${p.name}が生まれる(宣帝の血統)`);
      this.c.addNews(`${scenario.factions.find((x) => x.id === fa.factionId)?.name}の${fa.name}に、${p.name}が生まれました`);
    }
  }

  /** 史実の子女がまだ生まれていない父(その父には、架空の子は生まれない) */
  private awaitingHistoric(fatherId: string, year: number): boolean {
    return Object.entries(FAMILY.parents).some(([child, fam]) => fam.father === fatherId && !persons.some((p) => p.id === child) && (ledgerPerson(child)?.born ?? 0) > year);
  }

  /** 架空の子女の誕生:君主とその一族の夫婦だけ。両親の年齢・婚姻の長さ・子の数・健康で決まる */
  private births(year: number): void {
    const day = Math.floor(this.c.day);
    for (const m of [...this.c.diplo.marriages]) {
      const h = persons.find((p) => p.id === m.husband);
      const w = persons.find((p) => p.id === m.wife);
      if (!h || !w || this.c.personStatus(h.id) !== "active" || this.c.personStatus(w.id) !== "active" || this.c.spoils.custodyOf(h.id) || this.c.spoils.custodyOf(w.id)) continue;
      if (!(h.role === "ruler" || this.isRoyal(h))) continue;
      if (w.born === null && this.assumedBorn[w.id] === undefined) this.assumedBorn[w.id] = (m.day > 0 ? year : scenario.year) - 20;
      const wa = this.age(w) ?? 25;
      const ha = this.age(h) ?? 35;
      if (wa < 16 || wa > 40 || ha > 65 || ha < 16) continue;
      if (this.awaitingHistoric(h.id, year)) continue;
      const kids = this.childrenOf(h.id).filter((k) => this.motherOf(k.id) === w.id).length;
      const all = this.childrenOf(h.id).length;
      if (kids >= 6 || all >= 12) continue;
      const fert = wa < 30 ? 1 : wa < 35 ? 0.6 : 0.3;
      const married = day - m.day < 300 && m.day > 0 ? 0.6 : 1;
      // 史実の息子がすでにいる父には、架空の子は生まれにくい(史実の後継者を押しのけないように)
      const histSon = this.childrenOf(h.id).some((k) => !k.fictional && k.gender !== "female" && this.alive(k.id));
      const pr = 0.03 * fert * married / (1 + all * 0.25) * (histSon ? 0.35 : 1);
      if (chance(`${day}|${m.husband}|${m.wife}|birth`) >= pr) continue;
      const male = chance(`${day}|${m.wife}|sex`) < 0.5;
      const sur = surnameOf(h);
      const pool = male ? BOY : GIRL;
      const used = new Set(persons.map((p) => p.name));
      let name = "";
      for (let i = 0; i < pool.length && !name; i++) {
        const n = sur + pool[(Math.floor(chance(`${day}|${h.id}|nm`) * pool.length) + i) % pool.length];
        if (!used.has(n)) name = n;
      }
      // 仮想シナリオの長い王朝:1字の名を使い切ったら、2字の名(弘昭など)にする(番号の付いた名にしない)
      if (!name && scenario.virtual) {
        const o = Math.floor(chance(`${day}|${h.id}|nm2`) * pool.length);
        for (let i = 0; i < pool.length && !name; i++) for (let j = 0; j < pool.length && !name; j++) {
          const a = pool[(o + i) % pool.length], b = pool[(o + i + j + 1) % pool.length];
          if (a !== b && !used.has(sur + a + b)) name = sur + a + b;
        }
      }
      if (!name) name = `${sur}${pool[0]}${this.nextId}`;
      const avg = (k: (typeof STAT_KEYS)[number]): number => Math.round(Math.max(20, Math.min(95, (h[k] + (this.base[w.id]?.[k] ?? w[k])) / 2 + (chance(`${day}|${name}|${k}`) - 0.5) * 30)));
      let stats = { leadership: avg("leadership"), war: avg("war"), intelligence: avg("intelligence"), politics: avg("politics"), charisma: avg("charisma") };
      // 宣帝の血統(仮想シナリオ):父がこの血統なら、子も受け継ぐ。能力と特殊能力を父母から受け継ぐ(成人時の目標の値)
      const blood = scenario.virtual && h.bloodline === "xuandi" ? inheritXuandi(h, w, (k) => this.base[w.id]?.[k] ?? w[k], `${day}|${name}`) : null;
      if (blood) stats = blood.stats;
      const child = this.newPerson({
        name, gender: male ? "male" : "female", born: year, factionId: h.factionId, role: male ? "general" : "minister", people: h.people, seed: `${day}|${name}`,
        bio: `${h.name}と${w.name}の${male ? "子" : "娘"}。${blood ? `宣帝の血統(${blood.type}型${blood.prodigy ? "・天賦の才" : ""})。` : ""}${FICTION_NOTE}`, title: "", stats, father: h.id, mother: w.id, residence: h.residence,
      });
      if (blood) {
        child.bloodline = "xuandi";
        child.traits = blood.traits;
        child.virtual = true;
        this.lifespan[child.id] = 55 + Math.floor(chance(`${day}|${name}|blife`) * 26);
        if (blood.prodigy) this.c.addNews(`${h.name}の${male ? "子" : "娘"} ${name}は、劉皓に匹敵する天賦の才を持って生まれました(宣帝の血統)`);
      }
      this.counts.births++;
      this.note(h.factionId, `${h.name}と${w.name}に${male ? "男子" : "女子"} ${child.name}が生まれる(架空)`);
      if (h.role === "ruler") this.c.addNews(`${scenario.factions.find((x) => x.id === h.factionId)?.name}の${h.name}に、${male ? "男子" : "女子"}${child.name}が生まれました(架空の人物)`);
    }
  }

  /**
   * 簒奪:史実の簒奪(石虎・苻堅など)は、その人物がいて条件がそろえば起こりやすい。
   * そのほか、皇室がとても不安定で、名声が君主より高く忠誠の低い武将が軍団を持てば、まれに起こる。
   */
  private usurp(year: number): void {
    const day = Math.floor(this.c.day);
    for (const f of scenario.factions) {
      if (f.passive || f.fallen) continue;
      const r = this.c.rulerOf(f.id);
      if (!r) continue;
      const hist = FAMILY.usurpations.find((u) => u.faction === f.id && u.victim === r.id && year >= u.year);
      let who: Person | undefined;
      let note = "";
      // 歴史の重大事件で扱う簒奪(靳準・石虎・苻堅・冉閔)は、ここでは起こさない(二重に起こさない)
      if (hist && this.c.history?.coveredUsurpers.has(hist.usurper)) continue;
      if (hist) {
        const u = persons.find((p) => p.id === hist.usurper && p.factionId === f.id && this.c.personStatus(p.id) === "active" && !this.c.spoils.custodyOf(p.id) && !this.isMinor(p));
        // 簒奪は、血縁の順位ではなく力で起こる:軍団を持つか、名声が君主を上回るほど起こりやすい
        const L = this.c.loyalty;
        const power = u ? (this.c.postOf(u.id)?.kind === "army" ? 1 : 0.4) * ((L.fame[u.id] ?? 50) >= (L.fame[r.id] ?? 50) ? 1 : 0.6) * (this.isMinor(r) ? 1.3 : 1) : 0;
        if (u && chance(`${day}|${f.id}|hus`) < 0.25 * power) {
          who = u;
          note = `(史実:${hist.note})`;
        }
      } else if ((this.stability[f.id] ?? 60) < 15 && f.id !== this.c.playerFactionId) {
        const L = this.c.loyalty;
        who = persons.filter((p) => p.factionId === f.id && p.role === "general" && this.c.postOf(p.id)?.kind === "army" && (L.loyalty[p.id] ?? 60) < 25 && (L.fame[p.id] ?? 0) > (L.fame[r.id] ?? 0))
          .sort((a, b) => (L.fame[b.id] ?? 0) - (L.fame[a.id] ?? 0))[0];
        if (who && chance(`${day}|${f.id}|gus`) >= 0.08) who = undefined;
      }
      if (!who) continue;
      this.counts.usurpations++;
      const hc = historicDeath(r);
      const vc: DeathCause = hc && ["execution", "assassination", "suicide"].includes(hc.cause) ? hc.cause : "assassination";
      this.c.usurp(f.id, r, who);
      this.recordCause(r.id, vc, `${who.name}の簒奪`);
      delete this.regents[f.id];
      this.addStability(f.id, -25);
      this.note(f.id, `${who.name}が${r.name}を廃して位を奪う(簒奪)${note}`);
      this.c.addNews(`${f.name}で${who.name}が${r.name}を廃し、位を奪いました${note}`);
      // 前の君主の子・兄弟は恨み、皇位を主張する者が出ることがある
      const rival = this.childrenOf(r.id).concat(this.siblingsOf(r.id)).find((p) => p.factionId === f.id && p.gender !== "female" && this.c.personStatus(p.id) === "active" && !this.isMinor(p) && p.id !== who!.id);
      if (rival) {
        this.c.loyalty.add(rival.id, -30, `${who.name}の簒奪`);
        this.counts.disputes++;
        this.c.loyalty.noteDispute(f.id);
        this.pendingClaim = { f: f.id, claimant: rival.id };
        this.resolveClaim();
      }
    }
  }

  /** 史実の廃立(桓温が廃帝を廃し簡文帝を立てる等):権臣 by が君主を廃し、ほかの王族を立てる。前の君主は生きて退く */
  private depositions(year: number): void {
    const day = Math.floor(this.c.day);
    for (const d of FAMILY.depositions ?? []) {
      // 歴史の重大事件で扱う廃立(桓温の廃立)は、ここでは起こさない
      if (this.c.history?.def(`huanwen${d.year}`)) continue;
      const r = this.c.rulerOf(d.faction);
      if (!r || r.id !== d.victim || year < d.year) continue;
      const by = persons.find((x) => x.id === d.by && x.factionId === d.faction && this.c.personStatus(x.id) === "active");
      const rep = persons.find((x) => x.id === d.replacement && x.factionId === d.faction && this.c.personStatus(x.id) === "active" && !this.isMinor(x));
      if (!by || !rep || chance(`${day}|${d.faction}|dep`) >= 0.2) continue;
      this.c.replaceRuler(d.faction, r, rep);
      this.counts.depositions++;
      this.addStability(d.faction, -12);
      this.c.loyalty.addFame(by.id, 5);
      this.note(d.faction, `${by.name}が${r.name}を廃し、${rep.name}を立てる(廃立。史実:${d.note})`);
      this.c.addNews(`${scenario.factions.find((x) => x.id === d.faction)?.name}で、${by.name}が${r.name}を廃し、${rep.name}を立てました(史実の廃立)`);
    }
  }

  // ---------------- 摂政・皇太后 ----------------
  /** 君主から見た、皇太后・太皇太后(母・祖母で、生きている人) */
  dowagers(f: string): { p: Person; title: string }[] {
    const r = this.c.rulerOf(f);
    if (!r) return [];
    const imp = this.rankOf(f) === "emperor";
    const out: { p: Person; title: string }[] = [];
    const mom = persons.find((x) => x.id === this.motherOf(r.id));
    if (mom && this.alive(mom.id)) out.push({ p: mom, title: imp ? "皇太后" : this.rankOf(f) === "king" ? "王太后" : "太后" });
    const fa = this.fatherOf(r.id);
    for (const g of [this.motherOf(fa ?? ""), this.motherOf(mom?.id ?? "")]) {
      const gp = persons.find((x) => x.id === g);
      if (gp && this.alive(gp.id)) out.push({ p: gp, title: imp ? "太皇太后" : "太王太后" });
    }
    return out;
  }

  regentOf(f: string): Person | undefined {
    const id = this.regents[f];
    const p = id ? persons.find((x) => x.id === id) : undefined;
    return p && this.c.personStatus(p.id) === "active" && !this.c.spoils.custodyOf(p.id) ? p : undefined;
  }

  /** 摂政の候補:皇太后・太皇太后・成人の王族・外戚・重臣(政治・名声・忠誠で順位) */
  regentCandidates(f: string): { p: Person; reason: string; score: number }[] {
    const r = this.c.rulerOf(f);
    if (!r) return [];
    const L = this.c.loyalty;
    const dow = new Map(this.dowagers(f).map((d) => [d.p.id, d.title]));
    const clans = new Set(this.inLaws(f).map((x) => x.clan));
    const out: { p: Person; reason: string; score: number }[] = [];
    for (const p of persons) {
      if (p.id === r.id || this.c.personStatus(p.id) !== "active" || this.c.spoils.custodyOf(p.id) || this.isMinor(p)) continue;
      const dt = dow.get(p.id);
      if (!dt && p.factionId !== f) continue;
      let reason = "";
      let bonus = 0;
      if (dt) {
        reason = dt;
        bonus = dt.startsWith("太") ? 25 : 30;
      } else if ((this.bloodDistance(p.id, r.id) ?? 99) <= 4 && p.gender !== "female" && surnameOf(p) === surnameOf(r)) {
        reason = "王族";
        bonus = 15;
      } else if (clans.has(surnameOf(p)) && p.gender !== "female") {
        reason = "外戚";
        bonus = 10;
      } else if (p.gender !== "female" && (p.politics >= 70 || (L.fame[p.id] ?? 0) >= 70)) {
        reason = "重臣";
      } else continue;
      out.push({ p, reason, score: p.politics * 0.6 + (L.fame[p.id] ?? 30) * 0.3 + (L.loyalty[p.id] ?? 60) * 0.1 + bonus });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /** 摂政を任命する(君主が未成年のときだけ) */
  appointRegent(f: string, id: string): string {
    const r = this.c.rulerOf(f);
    if (!r) return "君主がいません";
    if (!this.isMinor(r)) return `${r.name}は成人しているため、摂政は置けません`;
    const c = this.regentCandidates(f).find((x) => x.p.id === id);
    if (!c) return "その人物は摂政に任命できません";
    const prev = this.regentOf(f);
    if (prev?.id === id) return `${c.p.name}はすでに摂政です`;
    this.regents[f] = id;
    this.counts.regents++;
    if (prev) this.c.loyalty.add(prev.id, -10, "摂政を解かれる");
    this.c.loyalty.add(id, 6, "摂政に任じられる");
    this.c.loyalty.addFame(id, 4);
    this.note(f, `${c.p.name}(${c.reason})が摂政となる`);
    this.c.addNews(`${scenario.factions.find((x) => x.id === f)?.name}で、幼い${r.name}に代わって${c.p.name}(${c.reason})が政務を見ることになりました`);
    return `${c.p.name}を摂政に任命しました`;
  }

  /** 親政:成人した君主が、摂政から政務を取り戻す */
  personalRule(f: string): string {
    const r = this.c.rulerOf(f);
    const reg = this.regentOf(f);
    if (!r || !reg) {
      delete this.regents[f];
      return "摂政はいません";
    }
    if (this.isMinor(r)) return `${r.name}はまだ未成年です(15歳から)`;
    delete this.regents[f];
    this.counts.personalRule++;
    // 野心のある摂政(母でなく、忠誠が低く、名声が高い)は、政権を手放すのを嫌う
    const L = this.c.loyalty;
    const ambitious = !this.dowagers(f).some((d) => d.p.id === reg.id) && (L.loyalty[reg.id] ?? 60) < 50 && (L.fame[reg.id] ?? 0) >= 60;
    if (ambitious) {
      this.addStability(f, -10);
      L.add(reg.id, -15, "摂政を退かされる");
      this.note(f, `${r.name}が親政を始める。${reg.name}は不満を抱く(宮廷の対立)`);
    } else {
      this.addStability(f, 5);
      this.note(f, `${r.name}が親政を始め、${reg.name}は摂政を退く`);
    }
    this.c.addNews(`${scenario.factions.find((x) => x.id === f)?.name}の${r.name}が親政を始めました`);
    return `${r.name}が親政を始めました${ambitious ? `(${reg.name}は不満を抱いています)` : ""}`;
  }

  /** 政務の効率(収入にかかる):成人の君主は1。幼君は、摂政の政治で0.95〜1.05、摂政がいなければ0.85 */
  adminFactor(f: string): number {
    const r = this.c.rulerOf(f);
    if (!r || !this.isMinor(r)) return 1;
    const reg = this.regentOf(f);
    return reg ? Math.max(0.9, Math.min(1.08, 0.85 + reg.politics / 400 + ((this.c.loyalty.fame[reg.id] ?? 40) - 40) / 1000)) : 0.85;
  }

  // ---------------- 外戚・宮廷の勢力 ----------------
  /** 外戚(君主の妃・母・後継者の母の一族)の影響力(0〜100) */
  inLaws(f: string): { clan: string; influence: number; members: Person[]; why: string[] }[] {
    const r = this.c.rulerOf(f);
    if (!r) return [];
    const L = this.c.loyalty;
    const imp = this.primaryOf(r.id);
    const dow = this.dowagers(f).map((d) => d.p);
    const heirMom = persons.find((x) => x.id === this.motherOf(this.heirOf(f)?.id ?? ""));
    const women = [imp, ...this.concubinesOf(r.id), ...dow, heirMom].filter((x): x is Person => !!x && surnameOf(x) !== surnameOf(r));
    const clans = new Map<string, Person[]>();
    for (const w of women) clans.set(surnameOf(w), [...(clans.get(surnameOf(w)) ?? []), w]);
    const out: { clan: string; influence: number; members: Person[]; why: string[] }[] = [];
    for (const [clan, ws] of clans) {
      const members = persons.filter((x) => x.factionId === f && this.alive(x.id) && surnameOf(x) === clan && x.people === ws[0].people && (this.bloodDistance(x.id, r.id) ?? 99) > 4);
      const why: string[] = [];
      let v = 10;
      if (imp && ws.includes(imp)) (v += 20), why.push("皇后・正室の一族");
      if (dow.some((d) => ws.includes(d))) (v += 20), why.push("皇太后の一族");
      if (heirMom && ws.includes(heirMom)) (v += 15), why.push("後継者の母の一族");
      const posts = members.filter((m) => this.c.postOf(m.id));
      const armies = members.filter((m) => this.c.postOf(m.id)?.kind === "army");
      if (posts.length) (v += posts.length * 5), why.push(`役目${posts.length}人`);
      if (armies.length) (v += armies.length * 8), why.push(`軍団${armies.length}`);
      if (members.some((m) => m.id === this.regents[f])) (v += 25), why.push("摂政");
      v += members.reduce((s, m) => s + (L.fame[m.id] ?? 0), 0) / 25;
      const avgAff = members.length ? members.reduce((s, m) => s + affinity(m, r).value, 0) / members.length : 50;
      v += (avgAff - 50) / 5;
      out.push({ clan, influence: Math.round(Math.max(0, Math.min(100, v))), members, why });
    }
    return out.sort((a, b) => b.influence - a.influence);
  }

  /** 宮廷の勢力:皇族・外戚・重臣・武将の、まとまり(人数・平均の忠誠・力) */
  courtParties(f: string): { name: string; count: number; loyalty: number; power: number }[] {
    const r = this.c.rulerOf(f);
    if (!r) return [];
    const L = this.c.loyalty;
    const mine = persons.filter((x) => x.factionId === f && x.id !== r.id && this.c.personStatus(x.id) === "active" && !this.isMinor(x));
    const royals = mine.filter((x) => (this.bloodDistance(x.id, r.id) ?? 99) <= 4 && surnameOf(x) === surnameOf(r));
    const inlawSet = new Set(this.inLaws(f).flatMap((x) => x.members.map((m) => m.id)));
    const inl = mine.filter((x) => inlawSet.has(x.id));
    const used = new Set([...royals, ...inl].map((x) => x.id));
    const ministers = mine.filter((x) => !used.has(x.id) && (x.role === "minister" || x.role === "strategist"));
    const generals = mine.filter((x) => !used.has(x.id) && x.role === "general");
    const group = (name: string, xs: Person[]) => ({
      name, count: xs.length,
      loyalty: xs.length ? Math.round(xs.reduce((s, x) => s + (L.loyalty[x.id] ?? 60), 0) / xs.length) : 0,
      power: Math.round(xs.reduce((s, x) => s + (L.fame[x.id] ?? 0) / 10 + (this.c.postOf(x.id)?.kind === "army" ? 5 : this.c.postOf(x.id) ? 2 : 0), 0)),
    });
    return [group("皇族・王族", royals), group("外戚", inl), group("文官・重臣", ministers), group("武将", generals)];
  }

  // ---------------- 教育 ----------------
  eduOf(id: string): { policy: EduPolicy; tutor?: string; gain: Partial<Stats> } {
    return (this.edu[id] ??= { policy: "balanced", gain: {} });
  }

  setEducation(childId: string, policy: EduPolicy, tutorId?: string): string {
    const ch = persons.find((x) => x.id === childId);
    if (!ch) return "人物が見つかりません";
    const a = this.age(ch);
    if (a === null || a >= 20) return `${ch.name}は教育の年齢(20歳未満)ではありません`;
    const t = tutorId ? persons.find((x) => x.id === tutorId) : undefined;
    if (tutorId && (!t || t.factionId !== ch.factionId || this.isMinor(t) || this.c.personStatus(t.id) !== "active")) return "その人物は教育を担当できません";
    const e = this.eduOf(childId);
    e.policy = policy;
    e.tutor = t?.id;
    if (!this.base[childId]) this.snapshot(ch);
    return `${ch.name}の教育を「${EDU_LABEL[policy]}」にしました${t ? `(担当:${t.name})` : ""}`;
  }

  /** 毎月の教育:6〜19歳。担当者の能力・相性・名声で伸びる。1つの能力の伸びは15まで、能力は100まで */
  private educate(): void {
    const L = this.c.loyalty;
    for (const p of persons) {
      const a = this.age(p);
      if (a === null || a < 6 || a >= 20 || !this.base[p.id] || this.c.personStatus(p.id) === "dead") continue;
      if (!this.isRoyal(p) && !this.edu[p.id]) continue;
      const e = this.eduOf(p.id);
      const t = e.tutor ? persons.find((x) => x.id === e.tutor) : undefined;
      if (t && (this.c.personStatus(t.id) !== "active" || t.factionId !== p.factionId)) e.tutor = undefined;
      const stats = EDU_STATS[e.policy];
      for (const k of stats) {
        const q = t ? Math.max(0, Math.min(1.2, (t[k] - 40) / 50)) * (0.6 + affinity(p, t).value / 250) * (1 + (L.fame[t.id] ?? 0) / 300) : 0.25;
        // 宣帝の血統(仮想シナリオ):帝王教育の伸びは2倍の速さ。能力はシナリオの上限(120)まで
        // 漢の正統(+50%)・太学振興など:皇族の伸びの倍率(上限2.5倍)
        const gx = scenario.virtual && p.bloodline === "xuandi" ? factionMult(factionTraitEffects(p.factionId, Math.floor(this.c.day)), "growth", 1, LIMITS.growth) : 1;
        const step = (e.policy === "balanced" ? 0.04 : 0.12) * q * (scenario.virtual && p.bloodline === "xuandi" ? 2 : 1) * gx;
        const cur = e.gain[k] ?? 0;
        const room = Math.min(15 - cur, statCap() - (this.base[p.id][k] + cur));
        if (room <= 0) continue;
        const add = Math.min(room, step);
        e.gain[k] = cur + add;
        this.counts.eduGain += add;
      }
    }
  }

  // ---------------- AI ----------------
  /** AIの君主(年に1度):婚姻・側室・後継者の指名・皇帝即位・宮廷の慰撫。頻繁には変えない */
  aiYearly(): void {
    const day = Math.floor(this.c.day);
    for (const f of scenario.factions) {
      if (f.passive || f.fallen || f.id === this.c.playerFactionId) continue;
      const r = this.c.rulerOf(f.id);
      if (!r || this.isMinor(r)) continue;
      // 皇帝生活モードの国では、皇帝の婚姻は後宮で本人どうしが決める(AIは妃を迎えない。後継者と教育は、これまでどおり)
      const palaceF = this.c.palace.active && this.c.palace.factionId === f.id;
      const purse = this.c.factionStates[f.id] ?? { gold: 0, grain: 0 };
      const rep = this.c.economy.report(f.id);
      const rnd = (s: string): number => chance(`${day}|${f.id}|${s}`);
      const sponsor = (): Person | undefined => persons.filter((p) => p.factionId === f.id && p.role !== "ruler" && p.gender !== "female" && surnameOf(p) !== surnameOf(r) && (this.bloodDistance(p.id, r.id) ?? 99) > 4)
        .sort((a, b) => (this.c.loyalty.fame[b.id] ?? 0) - (this.c.loyalty.fame[a.id] ?? 0))[Math.floor(rnd("sp") * 3)];
      // 正室がいなければ、迎える(国内の未婚の女性か、名家の娘)
      if (!palaceF && !this.primaryOf(r.id) && (this.age(r) ?? 30) < 60 && rnd("pri") < 0.6) {
        const bride = this.brideCandidates(r).filter((w) => !this.isCloseKin(r, w))[0];
        if (bride) this.marry(r.id, bride.id, "primary");
        else {
          const sp = sponsor();
          if (sp && purse.gold > 600) this.takeNobleConsort(f.id, sp.id, "primary");
        }
      } else if (!palaceF && this.primaryOf(r.id) && this.concubinesOf(r.id).length < this.maxConcubines(f.id) && purse.gold > rep.expense.total * 6 && (this.age(r) ?? 30) < 55 && rnd("con") < 0.2) {
        const sp = sponsor();
        if (sp) this.takeNobleConsort(f.id, sp.id, "secondary");
      }
      // 後継者:いなければ指名する。いても、ごくまれに(5%)より有力な子に替える
      const heir = this.heirOf(f.id);
      const order = this.successionOrder(f.id).filter((o) => !o.reason.startsWith("有力な武将"));
      if (!heir && order[0]) this.designateHeir(f.id, order[0].p.id);
      else if (heir && this.isMinor(heir) && order[1] && order[1].reason.startsWith("正室の子") && !this.isMinor(order[1].p) && rnd("chg") < 0.05) this.designateHeir(f.id, order[1].p.id);
      // 子女の教育:方針は子の得意に合わせ、担当はその能力の高い臣下(相性も見る)
      for (const k of this.childrenOf(r.id)) {
        const a = this.age(k);
        if (a === null || a < 6 || a >= 20 || k.factionId !== f.id || this.edu[k.id]?.tutor) continue;
        const b = this.base[k.id] ?? k;
        const pol: EduPolicy = k.gender === "female" ? "study" : b.war >= b.intelligence && b.war >= b.politics ? (b.leadership > b.war ? "command" : "war") : b.politics > b.intelligence ? "politics" : "study";
        const stat = EDU_STATS[pol][0];
        const tutor = persons.filter((p) => p.factionId === f.id && p.id !== r.id && this.c.personStatus(p.id) === "active" && !this.isMinor(p) && p.gender !== "female")
          .sort((x, y) => y[stat] + affinity(k, y).value / 5 - (x[stat] + affinity(k, x).value / 5))[0];
        this.setEducation(k.id, pol, tutor?.id);
      }
      // 外戚の登用:皇后の一族で役目のない成人を、太守のいない都市に
      const top = this.inLaws(f.id)[0];
      if (top && top.influence < 60 && rnd("inlaw") < 0.3) {
        const m = top.members.find((x) => x.gender !== "female" && !this.c.postOf(x.id) && !this.isMinor(x) && this.c.personStatus(x.id) === "active");
        const city = this.c.cities.find((x) => x.kind !== "pass" && scenario.cityOwners[x.id] === f.id && !this.c.cityStates[x.id]?.governorId && !x.governorId);
        if (m && city && this.c.appoint(m.id, { kind: "city", id: city.id }) === null) this.note(f.id, `外戚の${m.name}を${city.name}の太守に登用する`);
      }
      // 皇帝即位(史実の即位年を過ぎていれば、なりやすい)
      const chk = this.crownCheck(f.id);
      // 仮想シナリオ:劉皓の国は、宮廷のAIでは皇帝を称さない(「大漢皇帝即位」の事件で、国号を漢と改めて即位する)
      const hao = scenario.virtual && r.id === "vh_liu_hao";
      if (!hao && chk.ok && rnd("crown") < ((FAMILY.historicCrown[f.id] ?? 9999) <= this.year() ? 0.6 : 0.15)) this.crown(f.id);
      // 不安定な宮廷を慰撫する(金を配る)
      if ((this.stability[f.id] ?? 60) < 35 && purse.gold > 2000) {
        purse.gold -= 1000;
        this.addStability(f.id, 10);
        this.note(f.id, "宮廷に恩賞を配って慰撫する(金1,000)");
      }
    }
  }

  /** プレイヤーの宮廷の慰撫(金1,000で安定+10) */
  appease(f: string): string {
    const purse = this.c.factionStates[f];
    if (!purse || purse.gold < 1000) return "金が1,000必要です";
    purse.gold -= 1000;
    this.addStability(f, 10);
    this.note(f, "宮廷に恩賞を配って慰撫する(金1,000)");
    return "宮廷に恩賞を配りました(皇室の安定+10)";
  }

  // ---------------- 保存 ----------------
  serialize(): CourtSave {
    return JSON.parse(JSON.stringify({ emperors: this.emperors, titles: this.titles, tally: this.tally, emperorTraits: this.emperorTraits, emperorTypes: this.emperorTypes, lostCities: this.lostCities, heirs: this.heirs, stability: this.stability, ranks: this.ranks, added: this.added, parents: this.parents, base: this.base, lifespan: this.lifespan, assumedBorn: this.assumedBorn, log: this.log, counts: this.counts, nextId: this.nextId, regents: this.regents, causes: this.causes, edu: this.edu })) as CourtSave;
  }

  /** 戻す。ゲームの中で加わった人物を、いったん外してから入れ直す(spoils・忠誠より前に呼ぶ) */
  restore(save: CourtSave | undefined): void {
    this.init();
    if (!save) return;
    this.removeAdded();
    for (const a of save.added) {
      const p = { ...a };
      persons.push(p);
      this.added.push(p);
    }
    this.heirs = { ...save.heirs };
    Object.assign(this.stability, save.stability);
    Object.assign(this.ranks, save.ranks);
    for (const [fid, rk] of Object.entries(this.ranks)) {
      const f = scenario.factions.find((x) => x.id === fid);
      if (f && rk !== (FAMILY.ranks[scenario.id] ?? {})[fid]) f.title = RANK_LABEL[rk];
    }
    this.parents = { ...save.parents };
    const initBase = this.base;
    this.base = { ...save.base };
    for (const [k, v] of Object.entries(initBase)) if (!(k in this.base)) this.base[k] = v;
    this.lifespan = { ...save.lifespan };
    this.assumedBorn = { ...save.assumedBorn };
    this.log = { ...save.log };
    this.counts = { ...Court.zero(), ...save.counts };
    this.nextId = save.nextId ?? 1;
    this.regents = { ...(save.regents ?? {}) };
    this.causes = { ...(save.causes ?? {}) };
    this.edu = JSON.parse(JSON.stringify(save.edu ?? {}));
    // 歴代皇帝の記録と称号(Version 64以前のセーブには無い → 空のまま)
    this.emperors = JSON.parse(JSON.stringify(save.emperors ?? []));
    this.titles = { ...(save.titles ?? {}) };
    this.tally = JSON.parse(JSON.stringify(save.tally ?? {}));
    for (const [id, t] of Object.entries(this.titles)) { const p = persons.find((x) => x.id === id); if (p) p.title = t; }
    // 皇帝の固有特性(Version 67):即位のときに決めた特性に戻す(ロードで変わらない)
    this.emperorTraits = JSON.parse(JSON.stringify(save.emperorTraits ?? {}));
    this.emperorTypes = { ...(save.emperorTypes ?? {}) };
    this.lostCities = JSON.parse(JSON.stringify(save.lostCities ?? {}));
    for (const [id, t] of Object.entries(this.emperorTraits)) { const p = persons.find((x) => x.id === id); if (p) p.traits = [...t]; }
    this.applyGrowth();
  }

  // ---------------- 歴代皇帝(仮想シナリオの漢) ----------------
  /** 称号を付ける(セーブに残す) */
  setTitle(id: string, t: string): void {
    const p = persons.find((x) => x.id === id);
    if (p) p.title = t;
    this.titles[id] = t;
  }

  /** 会戦・攻城の結果を数える(在位中の戦績に使う) */
  noteBattle(win: string | null, lose: string | null, captured: boolean, city?: { id: string; name: string; lon: number; lat: number }): void {
    const t = (f: string) => (this.tally[f] ??= { wins: 0, losses: 0, captures: 0, lost: 0 });
    // 在位中の皇帝の征服した都市と、遠征の地域
    // 失った都市(漢の国家目標「失地回復」に使う。最大40)
    if (captured && lose && city) { const l = (this.lostCities[lose] ??= []); if (!l.includes(city.id)) { l.push(city.id); if (l.length > 40) l.shift(); } }
    if (captured && win && city) { const l = this.lostCities[win]; if (l?.includes(city.id)) l.splice(l.indexOf(city.id), 1); }
    if (captured && win && city) {
      const r = this.openReign(win);
      if (r) {
        (r.conquered ??= []).length < 80 && r.conquered.push(city.name);
        const region = regionOf(city);
        if (region) { r.expeditions ??= {}; r.expeditions[region] = (r.expeditions[region] ?? 0) + 1; }
      }
    }
    // 会戦は勝ち負けを、攻城(城の攻略)は攻略と喪失を数える(二重には数えない)
    if (win) { if (captured) t(win).captures++; else t(win).wins++; }
    if (lose) { if (captured) t(lose).lost++; else t(lose).losses++; }
  }

  private citiesOf(f: string): number {
    return this.c.cities.filter((k) => k.kind !== "pass" && scenario.cityOwners[k.id] === f).length;
  }

  /** いま在位中の皇帝の記録 */
  openReign(f: string): EmperorRecord | undefined {
    return [...this.emperors].reverse().find((r) => r.factionId === f && r.endYear === null);
  }

  /** 元号の年(建武3年など) */
  eraText(f: string): string | null {
    const r = this.openReign(f);
    return r ? `${r.era}${this.year() - r.accYear + 1 === 1 ? "元" : this.year() - r.accYear + 1}年` : null;
  }

  /** 即位を記録する(漢の皇帝として在位を始める)。初代(劉皓)は founder */
  startReign(f: string, p: Person, founder: boolean): EmperorRecord {
    const gen = this.emperors.filter((r) => r.factionId === f).length + 1;
    const era = ERA_NAMES[(gen - 1) % ERA_NAMES.length];
    const t = this.tally[f] ?? { wins: 0, losses: 0, captures: 0, lost: 0 };
    const rec: EmperorRecord = {
      gen, factionId: f, personId: p.id, name: p.name, era, born: p.born, died: null, accYear: this.year(), accDate: this.c.dateText(), endYear: null, endDate: null, endReason: null,
      citiesStart: this.citiesOf(f), citiesEnd: null, wins: -t.wins, losses: -t.losses, captures: -t.captures, lost: -t.lost, achievements: [],
      empress: this.primaryOf(p.id)?.name ?? null, heir: this.heirOf(f)?.name ?? null, successor: null, templeName: null, posthumous: null, stabilityEnd: null, founder,
    };
    // Version 67:皇帝の型・個人の固有特性(3〜5)・漢の正統・即位時の国力
    const pick = this.assignEmperorTraits(f, p);
    rec.type = pick.type;
    rec.typeLabel = pick.label;
    rec.traits = [...(p.traits ?? [])];
    rec.stats = [p.leadership, p.war, p.intelligence, p.politics, p.charisma].join("/");
    const pw = this.powerOf(f);
    rec.popStart = pw.pop; rec.goldStart = pw.gold; rec.troopsStart = pw.troops;
    rec.vassalsStart = Object.entries(this.c.diplo.overlord).filter(([, o]) => o === f).map(([v]) => v);
    rec.conquered = [];
    rec.expeditions = {};
    this.emperors.push(rec);
    rec.legit = this.isLegitEmperor(f);
    rec.goals = this.nationalGoals(f, rec);
    this.setTitle(p.id, "漢皇帝");
    this.note(f, `${p.name}が漢の第${gen}代皇帝に即位(元号 ${era})`);
    return rec;
  }

  /** 在位の終わり:戦績をまとめ、廟号・諡号を決めて称号を付ける */
  endReign(rec: EmperorRecord, reason: string, successor: Person | undefined): void {
    const f = rec.factionId;
    const t = this.tally[f] ?? { wins: 0, losses: 0, captures: 0, lost: 0 };
    rec.wins += t.wins; rec.losses += t.losses; rec.captures += t.captures; rec.lost += t.lost;
    rec.endYear = this.year();
    rec.endDate = this.c.dateText();
    rec.endReason = reason;
    rec.citiesEnd = this.citiesOf(f);
    rec.successor = successor?.name ?? null;
    rec.stabilityEnd = Math.round(this.stability[f] ?? 60);
    const p = persons.find((x) => x.id === rec.personId);
    if (p && this.c.personStatus(p.id) === "dead") rec.died = this.year();
    const delta = rec.citiesEnd - rec.citiesStart;
    // Version 67:人口・財政・兵力の増減、属国にした国、総合評価
    const pw = this.powerOf(f);
    rec.popEnd = pw.pop; rec.goldEnd = pw.gold; rec.troopsEnd = pw.troops;
    rec.vassalized = Object.entries(this.c.diplo.overlord).filter(([v, o]) => o === f && !(rec.vassalsStart ?? []).includes(v)).map(([v]) => scenario.factions.find((g) => g.id === v)?.name ?? v);
    rec.score = this.reignScore(rec);
    rec.grade = rec.score >= 80 ? "名君" : rec.score >= 65 ? "賢君" : rec.score >= 45 ? "守成の君" : rec.score >= 30 ? "凡君" : "暗君";
    const reign = rec.endYear - rec.accYear;
    if (rec.wins) rec.achievements.push(`会戦${rec.wins}勝${rec.losses}敗`);
    if (rec.captures) rec.achievements.push(`城の攻略${rec.captures}`);
    rec.achievements.push(`領土 ${rec.citiesStart}→${rec.citiesEnd}都市`);
    const vassals = Object.entries(this.c.diplo.overlord).filter(([, o]) => o === f).length;
    const allies = scenario.factions.filter((g) => g.id !== f && !g.fallen && this.c.relationOf(f, g.id) === "alliance").length;
    if (vassals) rec.achievements.push(`属国${vassals}国`);
    if (allies) rec.achievements.push(`同盟${allies}国`);
    rec.achievements.push(`皇室の安定${rec.stabilityEnd}`);
    // 廟号・諡号:初代の劉皓は「太祖・宣武皇帝」。2代目からは治世の実際の成績で決める
    const used = new Set(this.emperors.filter((r) => r !== rec && r.factionId === f).flatMap((r) => [r.templeName, r.posthumous]).filter(Boolean));
    const pickName = (list: string[]): string | null => list.find((n) => !used.has(n)) ?? null;
    const age = p && p.born !== null ? this.year() - p.born : null;
    if (rec.founder && rec.personId === "vh_liu_hao") {
      rec.templeName = "太祖";
      rec.posthumous = "宣武皇帝";
    } else {
      const unified = rec.achievements.includes("天下統一");
      rec.templeName = rec.founder ? "太祖"
        : unified ? pickName(["世祖", "太宗", "高宗"])
        : rec.gen === 2 && delta >= 0 && reign >= 5 ? pickName(["太宗", "世宗"])
        : delta >= 10 || rec.wins >= 25 ? pickName(["世宗", "顕宗", "粛宗"])
        : delta >= 3 && rec.lost >= 3 ? pickName(["中宗"])
        : reign >= 15 && rec.stabilityEnd >= 60 ? pickName(["仁宗", "高宗", "孝宗"])
        : reign >= 8 && delta >= 0 ? pickName(["顕宗", "粛宗", "穆宗", "憲宗"])
        : null;
      const ch = age !== null && age < 20 ? ["殤", "沖"]
        : delta <= -8 ? (rec.citiesEnd === 0 ? ["愍", "哀"] : ["哀", "霊"])
        : rec.wins >= 20 || rec.captures >= 10 ? ["武", "烈", "威"]
        : delta >= 5 ? ["明", "章", "宣"]
        : reign >= 10 && rec.stabilityEnd >= 70 ? ["文", "景", "成"]
        : reign >= 10 ? ["章", "和", "順"]
        : ["安", "恭", "順"];
      // 同じ王朝で同じ諡号を使わない。候補が尽きたら、ほかの諡の字から選ぶ
      const ALL = ["武", "文", "明", "章", "和", "安", "順", "成", "景", "宣", "昭", "穆", "恭", "簡", "献", "質", "桓", "霊", "沖", "殤", "哀", "愍", "平", "元", "恵", "荘", "粛", "憲", "睿", "烈", "威", "襄", "定", "康", "節", "靖", "徳", "敬", "仁", "懐", "閔", "孺", "献", "僖", "頃", "戴", "懿", "温", "淳", "端"];
      const c1 = [...ch, ...ALL].find((x) => !used.has(`孝${x}皇帝`)) ?? ch[0];
      rec.posthumous = `孝${c1}皇帝`;
    }
    if (p) this.setTitle(p.id, `漢${rec.templeName ?? ""}${rec.posthumous}`);
    this.note(f, `${rec.name}の治世が終わる(${reason})。${rec.templeName ? `廟号 ${rec.templeName}・` : ""}諡号 ${rec.posthumous}`);
  }

  // ---------------- Version 67:漢の正統・皇帝の型と固有特性・国家目標 ----------------
  /** 劉皓、または劉皓の直系の子孫(父をたどって劉皓に着く) */
  descendsFromHao(id: string): boolean {
    let cur: string | undefined = id;
    for (let n = 0; cur && n < 60; n++) {
      if (cur === "vh_liu_hao") return true;
      cur = this.fatherOf(cur);
    }
    return false;
  }

  /** 漢の正式な皇帝が在位しているか(漢の正統):皇帝の位・劉皓の直系・漢の皇帝の記録がある国 */
  isLegitEmperor(f: string): boolean {
    if (!scenario.virtual || this.rankOf(f) !== "emperor") return false;
    const r = this.c.rulerOf(f);
    if (!r || r.bloodline !== "xuandi" || !this.descendsFromHao(r.id) || this.c.spoils.custodyOf(r.id)) return false;
    return this.emperors.some((x) => x.factionId === f);
  }

  /** 国の人口・金・兵力(軍団と守備兵) */
  powerOf(f: string): { pop: number; gold: number; troops: number } {
    let pop = 0, troops = 0;
    for (const k of this.c.cities) {
      if (scenario.cityOwners[k.id] !== f) continue;
      const st = this.c.cityStates[k.id];
      pop += st?.pop ?? k.population ?? 0;
      troops += st?.garrison ?? 0;
    }
    for (const s of this.c.armies) if (s.army.factionId === f) troops += s.army.troops.infantry + s.army.troops.cavalry + s.army.troops.archer;
    return { pop: Math.round(pop), gold: Math.round(this.c.factionStates[f]?.gold ?? 0), troops: Math.round(troops) };
  }

  /**
   * 即位のときに、皇帝の型と個人の固有特性(原則3〜5)を決める。決まった皇族(劉皓・劉承・劉威・劉睿・劉弘)は台帳どおり。
   * 自動で生まれた皇族は、能力・性格・教育・経歴(失地・国の大きさ)と、すでに持つ特性から型を選び、型の特性を足す。
   * 決めた特性はセーブに残し、ロードで変わらない
   */
  assignEmperorTraits(f: string, p: Person): { type: string; label: string } {
    if (this.emperorTypes[p.id] && this.emperorTraits[p.id]) {
      p.traits = [...this.emperorTraits[p.id]];
      const t0 = this.emperorTypes[p.id];
      return { type: t0, label: HAN_FIXED[p.id]?.label ?? HAN_TYPES[t0]?.label ?? "" };
    }
    const fixed = HAN_FIXED[p.id];
    let type: string;
    if (fixed) type = fixed.type;
    else {
      const [L, W, I, Pl, C] = [p.leadership, p.war, p.intelligence, p.politics, p.charisma];
      const has = (...t: string[]) => (p.traits ?? []).some((x) => t.includes(x)) ? 30 : 0;
      const peak = Math.max(this.citiesOf(f), ...this.emperors.filter((r) => r.factionId === f).map((r) => Math.max(r.citiesStart, r.citiesEnd ?? 0)));
      const lost = peak > 0 ? (peak - this.citiesOf(f)) / peak : 0;
      const share = this.citiesOf(f) / Math.max(1, this.c.cities.filter((k) => k.kind !== "pass").length);
      const e = this.edu[p.id]?.policy;
      const sc: Record<string, number> = {
        覇王型: L + W - 0.4 * (Pl + C) + has("武神", "破軍", "覇王の威", "天下布武") + (e === "command" ? 10 : 0),
        武帝型: 0.9 * (L + W) - 0.3 * (I + Pl) + has("遠征無双", "武帝の軍制", "精兵養成") + (e === "war" ? 10 : 0),
        仁君型: 0.9 * (C + Pl) - 0.3 * W + has("仁政", "万民帰心", "慈愛の治", "人心掌握"),
        明君型: 2 * Math.min(L, W, I, Pl, C) - 20 + has("帝王之器", "文武双全", "文武隆盛", "盛世創造") + (e === "balanced" ? 10 : 0),
        賢帝型: 0.9 * (C + I) - 0.3 * W + has("求賢令", "太学振興", "王佐之才"),
        智帝型: 1.6 * I - 0.2 * W + has("神算鬼謀", "外交無双", "合従連衡") + (e === "study" ? 10 : 0),
        富国型: 1.6 * Pl - 0.2 * W + has("富国強兵", "通商振興", "屯田の制") + (e === "politics" ? 10 : 0),
        中興型: 0.6 * (L + Pl) + lost * 300 + ((this.stability[f] ?? 60) < 40 ? 40 : 0) + has("中興之主", "失地回復"),
        守成型: 0.6 * (Pl + I) + (share > 0.45 ? 40 : 0) + has("守成の徳", "辺境鎮撫"),
      };
      for (const k of Object.keys(sc)) sc[k] += (chance(`${p.id}|etype|${k}`) - 0.5) * 16; // 同じ能力でも少しずつ違う
      type = Object.entries(sc).sort((a, b) => b[1] - a[1])[0][0];
    }
    const info = HAN_TYPES[type];
    const traits = [...(p.traits ?? [])];
    const total = p.leadership + p.war + p.intelligence + p.politics + p.charisma;
    const target = fixed ? 5 : Math.min(5, 3 + (total >= 520 ? 1 : 0) + (total >= 570 ? 1 : 0));
    const addOne = (t: string): void => { if (!traits.includes(t) && traits.length < (p.id === "vh_liu_hao" ? 99 : 5)) traits.push(t); };
    for (const t of fixed?.add ?? []) addOne(t);
    if (!fixed) {
      // 型の特性を1つは必ず持つ。そのあと、目標の数まで型の候補から足す
      if (!traits.some((t) => info.traits.includes(t))) { if (traits.length >= 5) traits.pop(); addOne(info.traits[Math.floor(chance(`${p.id}|tt0`) * info.traits.length)]); }
      for (const t of info.traits) { if (traits.length >= target) break; addOne(t); }
    }
    p.traits = traits;
    this.emperorTraits[p.id] = [...traits];
    this.emperorTypes[p.id] = type;
    return { type, label: fixed?.label ?? info.label };
  }

  /**
   * 治世の国家目標:皇帝の型の目標を、国の情勢で並べ直す。都市を大きく失っていれば失地回復、中国本土を統一していれば
   * 西域遠征・シルクロード・周辺の属国化を先にする(国家AIを止めない)
   */
  nationalGoals(f: string, rec: EmperorRecord): string[] {
    const base = [...(HAN_TYPES[rec.type ?? ""]?.goals ?? ["中国統一", "経済・人口の発展", "国境防衛"])];
    const peak = Math.max(...this.emperors.filter((r) => r.factionId === f).map((r) => Math.max(r.citiesStart, r.citiesEnd ?? 0)), this.citiesOf(f));
    const now = this.citiesOf(f);
    const unified = !!this.c.history?.flags.vh_unified || this.coreShare(f) >= 0.8;
    let g = base;
    if (peak >= 5 && now < peak * 0.8) g = ["失地回復", ...g.filter((x) => x !== "失地回復")];
    if (unified) {
      g = g.map((x) => (x === "中国統一" ? "西域遠征" : x));
      for (const x of ["シルクロードの支配", "周辺勢力の属国化"]) if (!g.includes(x)) g.push(x);
    }
    return [...new Set(g)].slice(0, 4);
  }

  /** 中国本土の都市のうち、その国のものの割合 */
  coreShare(f: string): number {
    const ex = new Set(["wandu", "pyongyang", "hanseong", "geumseong", "tuyuhunting"]);
    const core = this.c.cities.filter((k) => k.kind !== "pass" && k.lon >= 96 && !ex.has(k.id));
    return core.length ? core.filter((k) => scenario.cityOwners[k.id] === f).length / core.length : 0;
  }

  /** 治世の総合評価(0〜100):領土・戦績・皇室の安定・人口・財政・兵力の増減 */
  reignScore(r: EmperorRecord): number {
    const d = (r.citiesEnd ?? r.citiesStart) - r.citiesStart;
    const rate = (a?: number, b?: number | null) => (a && b !== null && b !== undefined ? (b - a) / Math.max(1, a) : 0);
    let v = 50 + Math.max(-30, Math.min(25, d * 1.5)) + Math.max(-10, Math.min(10, (r.wins - r.losses) * 0.4)) + ((r.stabilityEnd ?? 60) - 60) / 4;
    v += Math.max(-8, Math.min(8, rate(r.popStart, r.popEnd) * 40)) + Math.max(-5, Math.min(5, rate(r.goldStart, r.goldEnd) * 5)) + Math.max(-6, Math.min(6, rate(r.troopsStart, r.troopsEnd) * 10));
    v += Math.min(6, (r.vassalized?.length ?? 0) * 2) + (r.achievements.includes("天下統一") ? 10 : 0);
    if ((r.citiesEnd ?? 1) === 0) v = Math.min(v, 10);
    return Math.round(Math.max(0, Math.min(100, v)));
  }

  /** 毎月:国の効果の「毎月の忠誠・治安」(漢の正統+2など)を加える。家臣の忠誠は100、治安は100まで */
  private monthlyTraitFlats(): void {
    if (!scenario.virtual) return;
    const day = Math.floor(this.c.day);
    const L = this.c.loyalty;
    for (const g of scenario.factions) {
      if (g.fallen || g.passive) continue;
      const list = factionTraitEffects(g.id, day, (id) => this.c.personStatus(id));
      const lm = factionFlat(list, "loyaltyMonthly"), om = factionFlat(list, "orderMonthly");
      if (lm > 0 && L) for (const p of persons) if (p.factionId === g.id && p.role !== "ruler" && L.loyalty[p.id] !== undefined && this.c.personStatus(p.id) === "active") L.loyalty[p.id] = Math.min(100, L.loyalty[p.id] + lm);
      if (om > 0) for (const k of this.c.cities) { const st = this.c.cityStates[k.id]; if (scenario.cityOwners[k.id] === g.id && st?.order !== undefined) st.order = Math.min(100, st.order + om); }
    }
  }

  /**
   * 毎月:漢の皇帝の代替わりを記録する(仮想シナリオ)。在位中の皇帝が君主でなくなったら在位を閉じ、
   * 漢(皇帝の位)のまま新しい君主が立っていれば、次の代の在位を始める。国が滅びたら閉じる
   */
  private dynastyWatch(): void {
    if (!scenario.virtual) return;
    // 記録のない皇帝(Version 64 のセーブで、すでに即位していた場合など):いまの皇帝から記録を始める
    for (const g of scenario.factions) {
      if (g.fallen || this.rankOf(g.id) !== "emperor") continue;
      const r = this.c.rulerOf(g.id);
      if (!r || r.bloodline !== "xuandi" || this.openReign(g.id)) continue;
      if (this.emperors.some((x) => x.factionId === g.id && x.personId === r.id)) continue;
      const rec = this.startReign(g.id, r, !this.emperors.some((x) => x.factionId === g.id));
      rec.achievements.push("即位の年は前の版のセーブのため不明(読み込んだ年から記録)");
    }
    for (const rec of this.emperors.filter((r) => r.endYear === null)) {
      const f = rec.factionId;
      const fac = scenario.factions.find((x) => x.id === f);
      const cur = this.c.rulerOf(f);
      // 国家目標は、国の情勢(統一したか・都市を失ったか)で毎月見直す
      if (cur?.id === rec.personId) { rec.goals = this.nationalGoals(f, rec); rec.legit = this.isLegitEmperor(f); }
      const flag = this.c.history?.flags.vh_unified;
      // 天下統一は、成しとげた代(フラグが立ったときに在位していた皇帝)だけに記す
      if (flag === f && !this.emperors.some((r) => r.factionId === f && r.achievements.includes("天下統一"))) rec.achievements.push("天下統一");
      if (fac && !fac.fallen && cur?.id === rec.personId && this.rankOf(f) === "emperor") continue;
      const p = persons.find((x) => x.id === rec.personId);
      const reason = fac?.fallen ? "国の滅亡" : p && this.c.personStatus(p.id) === "dead" ? "崩御" : this.c.spoils.custodyOf(rec.personId) ? "捕らわれる" : "退位";
      this.endReign(rec, reason, cur && cur.id !== rec.personId ? cur : undefined);
      if (fac && !fac.fallen && cur && cur.id !== rec.personId && this.rankOf(f) === "emperor") {
        const nr = this.startReign(f, cur, false);
        // 新しい皇帝の皇太子:決まっていなければ、継承順位の1位
        if (!this.heirOf(f)) { const o = this.successionOrder(f)[0]; if (o) this.heirs[f] = o.p.id; }
        const hr = this.heirOf(f);
        if (hr) this.setTitle(hr.id, "皇太子");
        nr.heir = hr?.name ?? null;
        this.c.addNews(`${fac.name}の第${nr.gen}代皇帝に${cur.name}が即位しました(元号 ${nr.era})`);
      }
    }
  }
}

