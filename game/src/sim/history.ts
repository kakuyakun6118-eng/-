// 歴史の重大事件(Version 37)。三國志14の歴史イベントのように、その年月になれば必ずプレイヤーに示す。
// 史実の条件がそろえば史実の事件として起こり、そろわなければ「歴史の分岐」として示す(存在しない国や軍団は出さない)。
// 関係する勢力は、選択肢(史実どおり・合理的な別案・大胆な改変)を選ぶ。プレイヤーの国はプレイヤーが、ほかはAIが選ぶ。
// 結果は国・都市・軍団・人物に反映し、年表に史実との違いとともに残す。同じ事件は二重に起こさない。
import { ledgerPerson, persons, scenario, totalTroops } from "../data";
import type { BattleEvent, Person } from "../data/types";
import type { BattleResult } from "../battle/types";
import type { ArmyState, Campaign } from "./Campaign";
import { distanceKm } from "./pathfinding";
import { chance } from "./spoils";
import { EXTRA_EVENTS } from "./historyEvents2";
import { diffSnapshots, snapshot, type EventDiff } from "./eventDiff";

/** 歴史の会戦・攻城戦を、その場で始めてよい距離(これより遠い軍団は、戦場まで進軍させる) */
const NEAR_KM = 45;

export type ChoiceKind = "historic" | "alt" | "bold";
export const KIND_LABEL: Record<ChoiceKind, string> = { historic: "史実どおり", alt: "合理的な別案", bold: "大胆な改変" };
export interface HistChoice {
  id: string;
  label: string;
  kind: ChoiceKind;
  desc: string;
  /** 予想される影響(画面に出す) */
  preview: string;
}
export type HistStatus = "pending" | "past" | "awaiting" | "occurred" | "branched" | "duplicate";
export const STATUS_LABEL: Record<HistStatus, string> = { pending: "未発生", past: "開始前に発生(史実)", awaiting: "選択待ち", occurred: "発生(史実どおり)", branched: "分岐", duplicate: "発生済み(ほかの形で)" };
export interface HistRecord {
  status: HistStatus;
  day?: number;
  date?: string;
  ready?: boolean;
  picks: Record<string, { choice: string; by: "player" | "ai" }>;
  result?: string;
  /** 史実と同じ結果になったか */
  historic?: boolean;
  /** 起きたときの役(会戦の決着のときに使う) */
  roles?: Record<string, string | undefined>;
  /** プレイヤーが一覧から発動した(Version 40)。一度発動した事件は、もう発動できない */
  manual?: boolean;
  /** 事件の結果、戦略マップで変わった所(Version 41) */
  changes?: EventDiff["changes"];
  /** 決まりに反した所(瞬間移動・存在しない人物)。空が正しい */
  violations?: string[];
}

/** 発動の条件の1行(満たしているか・満たしていない理由) */
export interface CondItem { label: string; ok: boolean; why?: string; info?: boolean }
/** 一覧での状態 */
export type ListState = "available" | "unmet" | "occurred" | "branched" | "past" | "awaiting";
export const LIST_STATE_LABEL: Record<ListState, string> = { available: "発動可能", unmet: "条件未達", occurred: "発生済み", branched: "分岐済み", past: "開始前の史実", awaiting: "選択待ち" };
export type EventCategory = "military" | "politics" | "diplomacy" | "founding";
export const CATEGORY_LABEL: Record<EventCategory, string> = { military: "軍事", politics: "政治", diplomacy: "外交", founding: "建国・滅亡" };
/** 外交の色の濃い事件(入朝・亡命・連合・服属・和親) */
const DIPLOMACY_EVENTS = new Set(["xiyu382", "chui369", "murong319", "yangxuan345", "changan313", "unify376"]);
/** 事件の種類(複数あり得る。一覧の絞り込み用):会戦のある事件は軍事、建国・滅亡・自立は建国・滅亡、入朝・亡命などは外交、残りは政治 */
export function categoriesOf(d: HistEventDef): EventCategory[] {
  const out: EventCategory[] = [];
  if (d.battle || /戦い|乱|遠征|北伐|陥落|征伐|攻略|反攻/.test(d.name)) out.push("military");
  if (/建国|成立|滅亡|自立|独立|称する|国号|簒奪|再興|分裂|崩壊|最期/.test(d.name)) out.push("founding");
  if (DIPLOMACY_EVENTS.has(d.id)) out.push("diplomacy");
  if (out.length === 0 || /即位|廃位|廃立|廃太子|権力|改革|暴政|継承|内紛|台頭/.test(d.name)) out.push("politics");
  return out;
}
/** 主な種類(一覧に出す1つ) */
export function categoryOf(d: HistEventDef): EventCategory {
  return categoriesOf(d)[0];
}
export interface TimelineEntry {
  day: number;
  date: string;
  kind: "history" | "choice" | "state" | "fall" | "crown" | "ruler" | "battle" | "past";
  text: string;
  /** 史実との違い(あれば) */
  diff?: string;
  eventId?: string;
}
export interface HistorySave {
  records: Record<string, HistRecord>;
  flags: Record<string, string>;
  timeline: TimelineEntry[];
  queue: { id: string; mode: "decide" | "news" | "branch" }[];
  tags?: { a: string; b?: string; city?: string; histId: string; until: number; tactics?: BattleEvent["tactics"] }[];
  prep?: Record<string, string[]>;
}

/** 史実で、ある年にある国に加わる人物 */
const JOINS: { id: string; year: number; month: number; label: string; note: string; to: (c: Campaign) => string | undefined; army?: number }[] = [
  { id: "shi_le", year: 307, month: 9, label: "漢", note: "307年、汲桑の敗死ののち、石勒は劉淵に帰順した", to: (c) => hanOf(c), army: 6000 },
  { id: "kui_an", year: 307, month: 9, label: "石勒の軍", note: "石勒の「十八騎」の一人", to: (c) => factionOfPersons(c, ["shi_le"]) },
  { id: "zhi_xiong", year: 307, month: 9, label: "石勒の軍", note: "石勒の「十八騎」の一人", to: (c) => factionOfPersons(c, ["shi_le"]) },
  { id: "kong_chang", year: 307, month: 9, label: "石勒の軍", note: "石勒の「十八騎」の一人", to: (c) => factionOfPersons(c, ["shi_le"]) },
  { id: "tao_bao", year: 307, month: 9, label: "石勒の軍", note: "石勒の「十八騎」の一人", to: (c) => factionOfPersons(c, ["shi_le"]) },
  { id: "lu_ming", year: 307, month: 9, label: "石勒の軍", note: "石勒の「十八騎」の一人", to: (c) => factionOfPersons(c, ["shi_le"]) },
  { id: "zhi_quliu", year: 307, month: 9, label: "石勒の軍", note: "石勒の「十八騎」の一人", to: (c) => factionOfPersons(c, ["shi_le"]) },
  { id: "zhang_bin", year: 308, month: 1, label: "石勒の軍", note: "張賓は石勒の謀主となった", to: (c) => factionOfPersons(c, ["shi_le"]) },
  { id: "wang_mi", year: 308, month: 5, label: "漢", note: "308年、王弥は青州の乱ののち劉淵に帰順した", to: (c) => hanOf(c), army: 5000 },
  { id: "liu_yao", year: 304, month: 11, label: "漢", note: "劉曜は劉淵の族子として漢に仕えた", to: (c) => hanOf(c) },
];

/** 人物がいない理由(亡くなった・捕らわれた・ほかの国にいる・まだいない) */
export function absent(c: Campaign, id: string, want?: string): string {
  const p = P(id);
  const nm = ledgerPerson(id)?.name ?? id;
  if (!p) return `${nm}はこの時点でゲームにいない`;
  const st = c.personStatus(id);
  if (st === "dead") return `${p.name}はすでに亡くなっている(${({ illness: "病死", old_age: "老衰", battle: "戦死", execution: "処刑", assassination: "暗殺", suicide: "自害", unknown: "死因不明" } as Record<string, string>)[c.court.causeOf(id)?.cause ?? "unknown"]})`;
  const cu = c.spoils.custodyOf(id);
  if (cu) return `${p.name}は${name(cu.holder)}に捕らわれている`;
  if (want && p.factionId !== want) return `${p.name}は${name(p.factionId)}に身を寄せている`;
  if (p.role !== "ruler") return `${p.name}は${name(p.factionId)}の臣下で、君主ではない`;
  if (st === "wounded") return `${p.name}は負傷している`;
  return `${p.name}は${name(p.factionId)}の君主だが、条件がそろっていない`;
}

/** 事件の定義 */
export interface Ctx {
  h: HistorySystem;
  c: Campaign;
}
export interface HistEventDef {
  id: string;
  name: string;
  year: number;
  month: number;
  importance: "major" | "critical";
  place: { name: string; lon: number; lat: number };
  persons: string[];
  background: string;
  history: string;
  sources: string[];
  /** 関係する国(画面に出す。いまのゲームで、その役にあたる国を探す) */
  roles: (x: Ctx) => Record<string, string | undefined>;
  /** すでに別の形で起きている(簒奪・滅亡などがほかの仕組みで済んでいる)とき true */
  done?: (x: Ctx, r: Record<string, string | undefined>) => boolean;
  /** 史実の条件がそろっているか。そろっていなければ、理由の文 */
  ready: (x: Ctx, r: Record<string, string | undefined>) => true | string;
  /** 選ぶ側(役の名前)と、その選択肢 */
  choices: Record<string, HistChoice[]>;
  /** AIの選び方(役ごと)。返すのは選択肢のID */
  ai?: (x: Ctx, r: Record<string, string | undefined>, role: string) => string;
  /** 結果を反映し、結果の文を返す */
  apply: (x: Ctx, r: Record<string, string | undefined>, picks: Record<string, string>) => string;
  /** 発生の条件(一覧に出す文) */
  cond?: string;
  /** 会戦の事件:戦う2つの役(イベント前の集結に使う) */
  battle?: string[];
  /** この事件のために取っておく軍団の指揮官(呂光の遠征軍など。AIはほかの用に使わない) */
  reserve?: string[];
  /** 歴史の会戦が決着したときの結果(勝った役。引き分けは null) */
  onBattle?: (x: Ctx, r: Record<string, string | undefined>, winner: string | null) => string;
  /**
   * この事件の攻城戦で都市が落ちたときの決まり(Version 42)。史料に明示された結果を、首都の陥落の処理(捕縛80%・滅亡90%)の
   * 代わりに使う。capture:君主がその都市に実際にいれば捕らえる(いなければ捕らえない)。survive:捕らえても、
   * 後継者と残る都市があれば国は続く(なければ滅びる)。首都でない都市でも、この決まりで君主の捕縛を扱う
   */
  fallRule?: { capture: "ifPresent"; survive: boolean };
}

// ---------------- 勢力の見つけ方 ----------------
export const live = (c: Campaign, f: string | undefined): boolean => !!f && !scenario.factions.find((x) => x.id === f)?.fallen && c.cities.some((x) => scenario.cityOwners[x.id] === f);
/** 人物たちのうち、生きている最初の人の国 */
export function factionOfPersons(c: Campaign, ids: string[], rulerOnly = false): string | undefined {
  for (const id of ids) {
    const p = persons.find((x) => x.id === id);
    if (p && c.personStatus(p.id) !== "dead" && !c.spoils.custodyOf(p.id) && live(c, p.factionId) && (!rulerOnly || p.role === "ruler")) return p.factionId;
  }
  return undefined;
}
export const pick = (c: Campaign, ...ids: (string | undefined)[]): string | undefined => ids.find((f) => live(c, f));
/** 漢(前趙):劉氏の君主の国 */
export const hanOf = (c: Campaign): string | undefined => factionOfPersons(c, ["liu_yuan", "liu_cong", "liu_can", "liu_yao", "liu_xi", "liu_yin"], true) ?? pick(c, "han_zhao", c.history?.flags.han_founded);
export const shiOf = (c: Campaign): string | undefined => factionOfPersons(c, ["shi_le", "shi_hong", "shi_hu", "shi_shi", "shi_zun", "shi_jian2", "shi_zhi"], true) ?? pick(c, "shile");
export const jinOf = (c: Campaign): string | undefined => pick(c, "jin", "jin_rui") ?? factionOfPersons(c, ["sima_rui", "sima_shao", "sima_yan", "sima_yao"], true);
export const qinOf = (c: Campaign): string | undefined => factionOfPersons(c, ["fu_jian_jian", "fu_sheng", "fu_jian", "fu_pi", "fu_deng"], true) ?? pick(c, "qianqin");
export const owner = (id: string): string | undefined => scenario.cityOwners[id];
export const P = (id: string): Person | undefined => persons.find((x) => x.id === id);
export const alive = (c: Campaign, id: string): boolean => !!P(id) && c.personStatus(id) === "active" && !c.spoils.custodyOf(id);
export const name = (f: string | undefined): string => scenario.factions.find((x) => x.id === f)?.name ?? "(なし)";

export class HistorySystem {
  records: Record<string, HistRecord> = {};
  flags: Record<string, string> = {};
  timeline: TimelineEntry[] = [];
  /** プレイヤーに見せる順番待ち(decide:選択、news:結果の知らせ、branch:分岐の説明) */
  queue: { id: string; mode: "decide" | "news" | "branch" }[] = [];
  readonly defs: HistEventDef[] = [...EVENTS, ...EXTRA_EVENTS].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  /** 進軍中の歴史の会戦の目印(出会ったとき・城に着いたときの戦いに、事件のIDを付ける) */
  tags: { a: string; b?: string; city?: string; histId: string; until: number; tactics?: BattleEvent["tactics"] }[] = [];
  /** イベント前の準備行動の記録(集結・兵糧・援軍・防備・偵察) */
  prep: Record<string, string[]> = {};

  /** 戦いが始まるとき:進軍中の歴史の会戦なら、その事件のID */
  tagFor(att: string, def?: string, city?: string): { histId: string; tactics?: BattleEvent["tactics"] } | undefined {
    const day = Math.floor(this.c.day);
    const t = this.tags.find((x) => x.until >= day && ((x.a === att && (x.b ? x.b === def : x.city === city)) || (x.b === att && x.a === def)));
    if (t) this.tags.splice(this.tags.indexOf(t), 1);
    return t;
  }

  /**
   * 毎日:歴史の会戦へ向かっている2つの軍団が、戦場で近づいたら会戦を始める(進軍してから戦う。瞬間移動はしない)。
   * 片方がまだ遠ければ待つ。片方が来なくなったら(滅亡・壊滅)、印を外す。
   */
  daily(): void {
    const day = Math.floor(this.c.day);
    for (const t of [...this.tags]) {
      if (t.until < day) {
        this.tags.splice(this.tags.indexOf(t), 1);
        continue;
      }
      if (!t.b) continue;
      const a = this.c.stateOf(t.a);
      const b = this.c.stateOf(t.b);
      if (!a || !b) {
        this.tags.splice(this.tags.indexOf(t), 1);
        continue;
      }
      if (a.status === "fighting" || b.status === "fighting") continue;
      if (distanceKm(a.army, b.army) > NEAR_KM * 1.6) continue;
      // 戦場で向かい合った:会戦を始める(startEventAt が印を外す)
      a.route = null;
      b.route = null;
      const ev = this.c.startEventAt(a, b, t.histId, t.tactics);
      const d = this.def(t.histId);
      if (ev && d) ev.location.name = d.place.name;
    }
  }

  /**
   * 会戦の事件の前の半年:関係する国のAIは、戦争を止めずに準備をする。
   * 主力の集結先(戦場にいちばん近い自国の都市)を返す。ほかの軍団は、ふだんどおり戦う。
   */
  stagingFor(f: string): { city: string; lon: number; lat: number; eventId: string } | undefined {
    const { year, month } = this.c.calendar();
    const now = year * 12 + month;
    for (const d of this.defs) {
      // 遠征の事件(専用の軍団を取っておくもの)は、主力の集結には使わない
      if (!d.battle || d.reserve || this.records[d.id]?.status !== "pending") continue;
      const at = d.year * 12 + d.month;
      if (now > at || at - now > 6) continue;
      const roles = d.roles(this.ctx());
      if (!d.battle.some((r) => roles[r] === f)) continue;
      const city = this.c.cities.filter((x) => x.kind !== "pass" && owner(x.id) === f).sort((a, b) => distanceKm(a, d.place) - distanceKm(b, d.place))[0];
      if (city && distanceKm(city, d.place) < 700) return { city: city.id, lon: city.lon, lat: city.lat, eventId: d.id };
    }
    return undefined;
  }

  /** 準備行動(毎月):兵糧の輸送・援軍の要請・国境の防備・偵察。記録を残す */
  private prepare(): void {
    const day = Math.floor(this.c.day);
    for (const f of scenario.factions) {
      if (f.passive || f.fallen || f.id === this.c.playerFactionId) continue;
      const st = this.stagingFor(f.id);
      if (!st) continue;
      const d = this.def(st.eventId)!;
      const log = (this.prep[`${d.id}|${f.id}`] ??= []);
      const add = (t: string): void => {
        if (!log.includes(t)) {
          log.push(t);
          this.log("history", `${f.name}:${d.name}に備えて${t}`, undefined, d.id);
        }
      };
      const near = this.c.armies.filter((s) => s.army.factionId === f.id && distanceKm(s.army, st) < 120);
      if (near.length) add(`${near.length}つの軍団を${this.c.cities.find((x) => x.id === st.city)?.name}に集結`);
      // 兵糧の輸送:集結した軍団の食糧を満たす(国の兵糧を使う)
      const purse = this.c.factionStates[f.id];
      for (const s of near) if (purse && s.army.food < 60 && purse.grain > 300) {
        purse.grain -= 100;
        s.army.food = 60;
        add("兵糧を前線へ輸送");
      }
      // 国境の防備:集結先の守備兵を増やす(1度だけ)
      const city = this.c.cities.find((x) => x.id === st.city)!;
      if (!log.some((t) => t.startsWith("国境")) && purse && purse.gold > 800) {
        purse.gold -= 400;
        const cs = this.c.cityState(city);
        this.c.cityStates[city.id] = { ...cs, garrison: cs.garrison + 3000 };
        add(`国境の防備(${city.name}の守備兵+3000)`);
      }
      // 援軍の要請:同盟国に(1度だけ)
      if (!log.some((t) => t.startsWith("援軍"))) {
        const ally = scenario.factions.find((g) => this.c.relationOf(f.id, g.id) === "alliance" && !g.fallen);
        if (ally && ally.id !== this.c.playerFactionId && this.c.diplo.dispatchAid(ally.id, f.id, { lon: st.lon, lat: st.lat, name: city.name }).ok) add(`援軍を要請(${ally.name})`);
      }
      // 偵察:敵の主力の位置
      if (!log.some((t) => t.startsWith("偵察"))) {
        const foeRole = d.battle!.find((r) => d.roles(this.ctx())[r] !== f.id);
        const foe = foeRole ? d.roles(this.ctx())[foeRole] : undefined;
        const fa = foe ? this.largestArmy(foe) : undefined;
        if (fa) add(`偵察(敵の主力 ${fa.army.name}・${Math.round(totalTroops(fa.army) / 1000)}千は${this.c.placeNameAt(fa.army.lon, fa.army.lat)})`);
      }
      void day;
    }
  }

  /** 史実で、ある年にある国に加わる人物(石勒・王弥らが漢に加わるなど)。生まれていない人・亡くなった人は出さない */
  private joins(): void {
    const { year, month } = this.c.calendar();
    for (const j of JOINS) {
      if (this.flags[`join_${j.id}`] || year * 12 + month < j.year * 12 + j.month) continue;
      this.flags[`join_${j.id}`] = "1";
      if (persons.some((x) => x.id === j.id)) continue;
      const base = ledgerPerson(j.id);
      if (!base || (base.born !== null && base.born > year - 14) || (base.died !== null && base.died < year)) continue;
      const f = j.to(this.c);
      if (!f || !live(this.c, f)) {
        this.log("history", `${base.name}は、史実では${j.year}年に${j.label}に加わったが、その国がないため現れなかった`, "史実と異なる");
        continue;
      }
      const p: Person = { ...base, factionId: f, role: base.role === "ruler" ? "general" : base.role };
      persons.push(p);
      this.c.court.added.push(p);
      this.c.loyalty.fame[p.id] = Math.max(30, this.c.loyalty.fame[p.id] ?? 0);
      this.c.loyalty.loyalty[p.id] = 75;
      if (j.army) {
        const city = this.c.cities.filter((x) => x.kind !== "pass" && owner(x.id) === f).sort((a, b) => this.c.cityState(b).garrison - this.c.cityState(a).garrison)[0];
        if (city) {
          const st = this.c.cityState(city);
          this.c.cityStates[city.id] = { ...st, garrison: st.garrison + j.army };
          // 加わる軍勢は、自分の兵糧を持ってくる
          const purse = (this.c.factionStates[f] ??= { gold: 0, grain: 0 });
          purse.grain += j.army / 10;
          const res = this.c.raiseArmy(city.id, j.army, p.id);
          if (typeof res === "string") this.log("history", `${base.name}の軍勢は軍団にならなかった(${res})`);
        }
      }
      this.log("history", `${base.name}が${name(f)}に加わる(史実:${j.note})`);
      this.c.addNews(`【歴史】${base.name}が${name(f)}に加わりました(${j.note})`);
    }
  }

  /** 歴史の会戦・攻城戦へ向かっている軍団か(AIはほかの用に使わない) */
  taggedArmy(armyId: string): boolean {
    const day = Math.floor(this.c.day);
    return this.tags.some((t) => t.until >= day && (t.a === armyId || t.b === armyId));
  }

  /** 事件のために取っておく軍団か(1年以内の事件の reserve の人物が率いる軍団) */
  reservedArmy(commanderId: string): boolean {
    if (!commanderId) return false;
    const { year, month } = this.c.calendar();
    const now = year * 12 + month;
    return this.defs.some((d) => d.reserve?.includes(commanderId) && this.records[d.id]?.status === "pending" && d.year * 12 + d.month - now <= 12);
  }

  /** これから起こる事件(1年以内)の主役か */
  awaitsPerson(id: string): boolean {
    const { year, month } = this.c.calendar();
    const now = year * 12 + month;
    return this.defs.some((d) => ["pending", "awaiting"].includes(this.records[d.id]?.status) && d.persons.slice(0, 2).includes(id) && d.year * 12 + d.month - now <= 12 && d.year * 12 + d.month >= now);
  }

  /** 宮廷の簒奪の表のうち、ここで扱う人物(二重に起こさない) */
  readonly coveredUsurpers = new Set(["jin_zhun", "shi_hu", "fu_jian", "ran_min", "zhang_zuo", "liu_cong", "huan_xuan2"]);
  /** 画面に知らせる(UIがつなぐ) */
  onPrompt: (() => void) | null = null;

  constructor(private readonly c: Campaign) {
    this.init();
  }

  private init(): void {
    this.records = {};
    this.flags = {};
    this.timeline = [];
    this.queue = [];
    this.tags = [];
    this.prep = {};
    const startM = scenario.startMonth ?? 3;
    for (const d of this.defs) {
      const past = d.year < scenario.year || (d.year === scenario.year && d.month < startM);
      this.records[d.id] = { status: past ? "past" : "pending", picks: {} };
      if (past) this.timeline.push({ day: -1, date: `${d.year}年${d.month}月`, kind: "past", text: `${d.name}(開始前の史実):${d.history}`, eventId: d.id });
    }
  }

  get awaiting(): HistEventDef | undefined {
    const q = this.queue.find((x) => x.mode === "decide");
    return q ? this.defs.find((d) => d.id === q.id) : undefined;
  }

  def(id: string): HistEventDef | undefined {
    return this.defs.find((d) => d.id === id);
  }

  ctx(): Ctx {
    return { h: this, c: this.c };
  }

  flag(k: string, v?: string): string | undefined {
    if (v !== undefined) this.flags[k] = v;
    return this.flags[k];
  }

  log(kind: TimelineEntry["kind"], text: string, diff?: string, eventId?: string): void {
    this.timeline.push({ day: Math.floor(this.c.day), date: this.c.dateText(), kind, text, diff, eventId });
    if (this.timeline.length > 400) this.timeline.splice(0, this.timeline.length - 400);
  }

  /** 毎月:年月が来た事件を調べる */
  monthly(): void {
    this.joins();
    this.prepare();
    const { year, month } = this.c.calendar();
    for (const d of this.defs) {
      const rec = this.records[d.id];
      if (rec.status !== "pending") continue;
      if (year < d.year || (year === d.year && month < d.month)) continue;
      this.trigger(d);
    }
  }

  /** 事件を起こす(または分岐として示す)。年月が来たら必ず呼ばれる */
  trigger(d: HistEventDef, manual = false): void {
    const x = this.ctx();
    const rec = this.records[d.id];
    const roles = d.roles(x);
    rec.day = Math.floor(this.c.day);
    rec.date = this.c.dateText();
    if (d.done?.(x, roles)) {
      rec.status = "duplicate";
      rec.result = "この事件は、すでにゲームの中で別の形で起きています(二重には起こしません)";
      this.log("history", `${d.name}:${rec.result}`, undefined, d.id);
      this.queue.push({ id: d.id, mode: "branch" });
      this.onPrompt?.();
      return;
    }
    const ok = d.ready(x, roles);
    rec.ready = ok === true;
    if (ok !== true) {
      rec.status = "branched";
      rec.historic = false;
      rec.result = `歴史の分岐:${ok}。史実では、この年に${d.name}が起きました(${d.history})`;
      this.log("history", `${d.name}は起きなかった(${ok})`, "史実と異なる", d.id);
      this.queue.push({ id: d.id, mode: "branch" });
      this.onPrompt?.();
      return;
    }
    // 選ぶ側:プレイヤーの国が含まれていれば、プレイヤーの選択を待つ(時間を止める)
    const me = this.c.playerFactionId;
    const sides = Object.keys(d.choices).filter((role) => roles[role]);
    // 観賞・編集モード(操作する勢力が「すべて」)で一覧から発動したときは、プレイヤーが最初の役の選択をする
    if ((me && sides.some((role) => roles[role] === me)) || (manual && me === null && sides.length > 0)) {
      rec.status = "awaiting";
      this.queue.push({ id: d.id, mode: "decide" });
      this.c.speed = 0;
      this.onPrompt?.();
      return;
    }
    this.resolve(d, {});
  }

  /** プレイヤーの選択(役ごとに1つ)。ほかの役はAIが選ぶ */
  choose(id: string, choiceId: string): string {
    const d = this.def(id);
    const rec = this.records[id];
    if (!d || rec.status !== "awaiting") return "選べる事件がありません";
    const roles = d.roles(this.ctx());
    const role = Object.keys(d.choices).find((r) => (this.c.playerFactionId === null ? !!roles[r] : roles[r] === this.c.playerFactionId));
    if (!role || !d.choices[role].some((ch) => ch.id === choiceId)) return "その選択肢はありません";
    const i = this.queue.findIndex((q) => q.id === id && q.mode === "decide");
    if (i >= 0) this.queue.splice(i, 1);
    return this.resolve(d, { [role]: choiceId });
  }

  private resolve(d: HistEventDef, playerPicks: Record<string, string>): string {
    const x = this.ctx();
    const rec = this.records[d.id];
    const roles = d.roles(x);
    const picks: Record<string, string> = {};
    for (const role of Object.keys(d.choices)) {
      if (!roles[role]) continue;
      if (playerPicks[role]) {
        picks[role] = playerPicks[role];
        rec.picks[role] = { choice: playerPicks[role], by: "player" };
      } else {
        picks[role] = this.aiPick(d, roles, role);
        rec.picks[role] = { choice: picks[role], by: "ai" };
      }
    }
    rec.roles = roles;
    rec.result = undefined;
    const before = snapshot(this.c);
    this.notDone = null;
    const text = d.apply(x, roles, picks);
    // 戦略マップの変化(Version 41):変わった所を記録し、地図で光らせる
    const diff = diffSnapshots(this.c, before, snapshot(this.c));
    rec.changes = diff.changes;
    rec.violations = diff.violations;
    this.c.listener.onEventChanges?.(d.id, diff);
    // 事件の会戦・攻城戦を始められなかった(軍団がない等)なら、史実どおりには起きていない(Version 42)
    const historic = !this.notDone && Object.entries(picks).every(([role, id]) => d.choices[role].find((ch) => ch.id === id)?.kind === "historic");
    rec.status = historic ? "occurred" : "branched";
    rec.historic = historic;
    // 会戦がその場で決着した場合は、onBattle が書いた結果を後ろにつなぐ
    rec.result = rec.result ? `${text}${rec.result}` : text;
    const chosen = Object.entries(picks).map(([role, id]) => `${name(roles[role])}:「${d.choices[role].find((ch) => ch.id === id)?.label}」(${rec.picks[role].by === "player" ? "プレイヤー" : "AI"})`).join("、");
    this.log("choice", `${d.name}:${chosen}`, undefined, d.id);
    this.log("history", `${d.name}の結果:${text}`, historic ? undefined : "史実と異なる選択", d.id);
    this.c.addNews(`【歴史】${d.name}:${text}`);
    if (!Object.keys(playerPicks).length) this.queue.push({ id: d.id, mode: "news" });
    else this.queue.push({ id: d.id, mode: "news" });
    this.onPrompt?.();
    return text;
  }

  // ================= 一覧からの発動(Version 40) =================
  /** その事件に、プレイヤーの国が関わっているか */
  involves(d: HistEventDef, f: string | null = this.c.playerFactionId): boolean {
    if (!f) return false;
    const roles = d.roles(this.ctx());
    return Object.keys(d.choices).some((r) => roles[r] === f);
  }

  /** 発動の条件を1つずつ調べる(満たしているか・満たしていない理由) */
  conditions(d: HistEventDef): CondItem[] {
    const x = this.ctx();
    const c = this.c;
    const rec = this.records[d.id];
    const roles = d.roles(x);
    const out: CondItem[] = [];
    const { year, month } = c.calendar();
    const now = year * 12 + month;
    const hist = d.year * 12 + d.month;
    const mode = c.historyMode;
    // 1) 時期
    if (now >= hist) out.push({ label: `史実の年月(${d.year}年${d.month}月)に達している`, ok: true });
    else if (mode === "free") {
      const early = hist - now <= 15 * 12;
      out.push({ label: `自由歴史:史実(${d.year}年${d.month}月)より早い発動(15年前まで)`, ok: early, why: early ? undefined : `史実の年月まで${Math.ceil((hist - now) / 12)}年あり、早すぎる` });
      // 早い発動では、主要人物が成人(15歳以上)していること(子どもが国を建てたりしない)
      for (const id of d.persons.slice(0, 2)) {
        const p = P(id);
        const age = p?.born != null ? year - p.born : null;
        if (age !== null && age < 15) out.push({ label: `早い発動:主要人物の${p!.name}が成人している`, ok: false, why: `${p!.name}はまだ${age}歳(史実の年には${d.year - p!.born!}歳)` });
      }
    } else out.push({ label: `史実の年月(${d.year}年${d.month}月)に達している`, ok: false, why: `まだ${c.dateText()}。${mode === "historic" ? "史実重視" : "通常"}のモードでは、史実の年月より前には発動できない(自由歴史では早めの発動ができる)` });
    // 2) 関係国家が存在する
    for (const role of Object.keys(d.choices)) {
      const f = roles[role];
      out.push({ label: `関係国家(${role}):${f ? name(f) : "該当する国"}が存在する`, ok: !!f && live(c, f), why: !f ? "この役にあたる国が、いまのゲームにない" : live(c, f) ? undefined : `${name(f)}は滅んでいるか、都市を持っていない` });
    }
    // 3) 会戦の事件:戦争状態か、戦争に至りうる関係か。関係する軍団がいるか
    if (d.battle && d.battle.length >= 2) {
      const [a, b] = d.battle.map((r) => roles[r]);
      if (a && b) {
        const rel = c.relationOf(a, b);
        const can = c.atWar(a, b) || !["alliance", "vassal"].includes(rel);
        out.push({ label: `${name(a)}と${name(b)}が戦争状態、または戦争に至りうる関係`, ok: can, why: can ? undefined : `${name(a)}と${name(b)}は${rel === "alliance" ? "同盟" : "従属"}の関係にある` });
      }
      for (const r of d.battle) {
        const f = roles[r];
        const army = f ? this.largestArmy(f) : undefined;
        out.push({ label: `${f ? name(f) : r}の軍団が存在する`, ok: !!army, why: army ? undefined : f ? `${name(f)}に、出せる軍団がない` : "その国がない" });
      }
    }
    // 4) 主要人物(いなければ、代わりの人物で起こる事件もある。最終的な判断は「史実の前提条件」)
    for (const id of d.persons.slice(0, 2)) {
      const p = P(id);
      const ok = !!p && alive(c, id);
      out.push({ label: `主要人物:${ledgerPerson(id)?.name ?? id}が健在`, ok, why: ok ? undefined : absent(c, id), info: true });
    }
    // 5) 史実の前提条件(事件ごとの条件。代わりの指揮官・人物で足りるかもここで見る)
    const r = d.ready(x, roles);
    out.push({ label: `前提条件${d.cond ? `:${d.cond}` : ""}`, ok: r === true, why: r === true ? undefined : r });
    // 6) 二重に起こさない・一度だけ
    const dup = d.done?.(x, roles) ?? false;
    out.push({ label: "ほかの形で、すでに起きていない", ok: !dup, why: dup ? "同じことがゲームの中で別の形で起きている" : undefined });
    const unused = rec.status === "pending" || (rec.status === "branched" && rec.ready === false && !rec.manual && Object.keys(rec.picks).length === 0);
    out.push({ label: "この事件はまだ発生していない(一度だけ発動できる)", ok: unused && !rec.manual, why: unused ? undefined : `すでに「${STATUS_LABEL[rec.status]}」` });
    // 分岐のあとの発動:史実の年月に条件がそろわなかった事件は、通常・自由歴史では10年のうちなら、条件がそろえば発動できる
    if (rec.status === "branched" && rec.ready === false) {
      const late = now - hist <= 120 && mode !== "historic";
      out.push({ label: "分岐した事件を、条件がそろったあとで発動できる(史実の年月から10年以内・史実重視では不可)", ok: late, why: late ? undefined : mode === "historic" ? "史実重視のモードでは、史実の年月を過ぎた事件は発動しない" : "史実の年月から10年を過ぎた" });
    }
    return out;
  }

  /** 一覧での状態と、いま発動できるか(できない理由) */
  listState(d: HistEventDef): { state: ListState; can: boolean; reasons: string[]; conds: CondItem[] } {
    const rec = this.records[d.id];
    if (rec.status === "past") return { state: "past", can: false, reasons: ["シナリオ開始の前に、史実で起きた"], conds: [] };
    if (rec.status === "awaiting") return { state: "awaiting", can: false, reasons: ["選択を待っている"], conds: [] };
    if (rec.status === "occurred" || rec.status === "duplicate") return { state: "occurred", can: false, reasons: [STATUS_LABEL[rec.status]], conds: [] };
    const conds = this.conditions(d);
    const unmet = conds.filter((x) => !x.ok && !x.info).map((x) => x.why ?? x.label);
    const me = this.c.playerFactionId;
    const watching = me === null;
    if (unmet.length === 0 && !watching && !this.involves(d)) unmet.push("あなたの国が関わらない事件は、AIの国が判断する(観賞・編集モード=操作する勢力「すべての勢力」では発動できる)");
    const can = unmet.length === 0;
    if (rec.status === "branched" && !can) return { state: "branched", can: false, reasons: unmet, conds };
    return { state: can ? "available" : "unmet", can, reasons: unmet, conds };
  }

  /** 一覧から発動する。条件を満たさなければ、理由を返して何もしない */
  fire(id: string): string {
    const d = this.def(id);
    if (!d) return "その事件はありません";
    const st = this.listState(d);
    if (!st.can) return `発動できません:${st.reasons.join("/")}`;
    const rec = this.records[d.id];
    rec.manual = true;
    rec.status = "pending";
    rec.picks = {};
    this.log("history", `${d.name}を発動(${this.c.historyMode === "free" ? "自由歴史" : this.c.historyMode === "historic" ? "史実重視" : "通常"}のモード・${this.c.dateText()})`, undefined, d.id);
    this.trigger(d, true);
    return STATUS_LABEL[this.records[d.id].status];
  }

  /** AIの選択:史実の条件がそろっていれば史実の行動を選びやすい。国力・兵力・財政・君主の性格・外交で変わる */
  aiPick(d: HistEventDef, roles: Record<string, string | undefined>, role: string): string {
    const custom = d.ai?.(this.ctx(), roles, role);
    if (custom) return custom;
    const list = d.choices[role];
    const f = roles[role]!;
    const r = this.c.rulerOf(f);
    const rich = (this.c.factionStates[f]?.gold ?? 0) > this.c.economy.report(f).expense.total * 4;
    const bold = r ? (r.war + r.leadership - r.intelligence - r.politics) / 200 : 0;
    // 史実重視モード:史実の行動を強く選ぶ。自由歴史モード:別案・改変も選びやすい
    const mode = this.c.historyMode;
    const free = mode === "free";
    // 通常のモードは、史実重視と自由歴史の中間
    const W = mode === "free" ? [0.45, 0.33, 0.18, 0.5] : mode === "normal" ? [0.65, 0.24, 0.08, 0.35] : [0.85, 0.12, 0.03, 0.2];
    const w = list.map((ch) => (ch.kind === "historic" ? W[0] : ch.kind === "alt" ? W[1] + (rich ? 0.04 : 0) : W[2] + Math.max(0, bold) * W[3]));
    void free;
    let v = chance(`${Math.floor(this.c.day)}|${d.id}|${role}|ai`) * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) {
      v -= w[i];
      if (v <= 0) return list[i].id;
    }
    return list[0].id;
  }

  /** 画面で知らせを閉じる */
  dismiss(id: string, mode: "news" | "branch"): void {
    const i = this.queue.findIndex((q) => q.id === id && q.mode === mode);
    if (i >= 0) this.queue.splice(i, 1);
  }

  /** 会戦の結果(歴史の会戦なら、旗を立てる)。主な会戦は年表に残す */
  onBattle(event: BattleEvent, result: BattleResult): void {
    const total = result.sides.attacker.before.infantry + result.sides.attacker.before.cavalry + result.sides.attacker.before.archer + result.sides.defender.before.infantry + result.sides.defender.before.cavalry + result.sides.defender.before.archer;
    const win = result.winner === "attacker" ? event.attackerFactionId : result.winner === "defender" ? event.defenderFactionId : null;
    const hd = event.histId ? this.def(event.histId) : undefined;
    if (hd?.onBattle) {
      const rec = this.records[hd.id];
      const roles = rec.roles ?? hd.roles(this.ctx());
      const winRole = win ? Object.keys(roles).find((k) => roles[k] === win) ?? null : null;
      const text = hd.onBattle(this.ctx(), roles, winRole);
      rec.result = `${rec.result ?? ""} → 会戦:${win ? `${name(win)}の勝利` : "引き分け"}。${text}`;
      // 会戦の結果が史実と違った(守り切った・君主がいなかった・脱出した)なら、事件の記録を「分岐」にする(Version 42)
      if (/史実との分岐/.test(text)) {
        rec.status = "branched";
        rec.historic = false;
      }
      this.log("battle", `${hd.name}の会戦:${win ? `${name(win)}の勝利` : "引き分け"}(${event.location.name})。${text}`, undefined, hd.id);
      this.c.addNews(`【歴史】${hd.name}:${text}`);
    }
    if (event.histId === "feishui383") {
      this.flag("feishui_winner", win ?? "draw");
      const qin = event.attackerFactionId === "jin" || name(event.attackerFactionId).includes("晋") ? event.defenderFactionId : event.attackerFactionId;
      const loser = win === null ? null : win === qin ? scenario.factions.find((f) => f.id !== qin && (f.id === event.attackerFactionId || f.id === event.defenderFactionId))?.id : qin;
      if (loser) {
        this.c.court.addStability(loser, -20);
        // 前秦が敗れれば、鮮卑・羌の将の心が離れる(史実の分裂の下地)
        if (loser === qin) for (const p of persons) if (p.factionId === qin && (p.people === "鮮卑" || p.people === "羌")) this.c.loyalty.add(p.id, -15, "淝水の敗戦");
      }
      const r = this.records.feishui383;
      if (r) r.result = `${r.result ?? ""} → 会戦の結果:${win ? `${name(win)}の勝利` : "引き分け"}`;
      this.log("battle", `淝水の戦い:${win ? `${name(win)}が勝利` : "引き分け"}(${event.location.name})`, win === qin ? "史実では東晋が勝った" : undefined, "feishui383");
    } else if (event.histId === "canhe395") {
      this.flag("canhe_winner", win ?? "draw");
      this.log("battle", `参合陂の戦い:${win ? `${name(win)}が勝利` : "引き分け"}`, undefined, "canhe395");
    } else if (total >= 30000) {
      this.log("battle", `${event.location.name}の戦い(${name(event.attackerFactionId)} 対 ${name(event.defenderFactionId)}、兵${Math.round(total / 1000)}千):${win ? `${name(win)}の勝利` : "引き分け"}`);
    }
  }

  serialize(): HistorySave {
    return JSON.parse(JSON.stringify({ records: this.records, flags: this.flags, timeline: this.timeline, queue: this.queue, tags: this.tags, prep: this.prep })) as HistorySave;
  }

  /** 古いセーブ(歴史の記録なし)は、いまの日付までの事件を「開始前の史実」と同じに扱わず、未発生のまま残す */
  restore(save: HistorySave | undefined): void {
    this.init();
    if (!save) {
      // 古いセーブ:その日付より前の事件は、すでに過ぎたものとして扱う(遅れて起こさない)
      const { year, month } = this.c.calendar();
      for (const d of this.defs) {
        const r = this.records[d.id];
        if (r.status === "pending" && d.year * 12 + d.month < year * 12 + month) {
          r.status = "past";
          this.timeline.push({ day: -1, date: `${d.year}年${d.month}月`, kind: "past", text: `${d.name}(古いセーブのため記録なし):${d.history}`, eventId: d.id });
        }
      }
      return;
    }
    for (const [id, r] of Object.entries(save.records)) if (this.records[id]) this.records[id] = r;
    this.flags = { ...save.flags };
    this.timeline = [...save.timeline];
    this.queue = [...(save.queue ?? [])];
    this.tags = [...(save.tags ?? [])];
    this.prep = { ...(save.prep ?? {}) };
  }

  /** 事件の会戦・攻城戦を始められなかった理由(resolve のあいだだけ) */
  private notDone: string | null = null;

  // ================= 事件で使う操作 =================
  /** 都市を移す */
  give(cityId: string, to: string): boolean {
    const city = this.c.cities.find((x) => x.id === cityId);
    if (!city || !live(this.c, to) || owner(cityId) === to) return false;
    this.c.transferCity(cityId, to);
    return true;
  }

  /** 人物を捕らえる(君主なら、国は滅び、後継国家ができる) */
  capture(id: string, holder: string): boolean {
    const p = P(id);
    if (!p || this.c.personStatus(id) === "dead" || this.c.spoils.custodyOf(id)) return false;
    this.c.personStates[id] = "captured";
    this.c.spoils.addCaptive(id, holder, p.factionId, Math.floor(this.c.day));
    this.c.vacatePosts(id);
    this.c.checkRulers();
    return true;
  }

  /** 兵を増減する(軍団と守備兵を同じ割合で) */
  troops(f: string, ratio: number): void {
    for (const s of this.c.armies) if (s.army.factionId === f) for (const k of ["infantry", "cavalry", "archer"] as const) s.army.troops[k] = Math.max(0, Math.round(s.army.troops[k] * ratio));
    for (const city of this.c.cities) if (owner(city.id) === f) {
      const st = this.c.cityState(city);
      this.c.cityStates[city.id] = { ...st, garrison: Math.max(500, Math.round(st.garrison * ratio)) };
    }
  }

  loyaltyAll(f: string, d: number, text: string, filter: (p: Person) => boolean = () => true): void {
    for (const p of persons) if (p.factionId === f && p.role !== "ruler" && filter(p)) this.c.loyalty.add(p.id, d, text);
  }

  /** 国を建てる(人物が、指定の都市で自立する)。都市がその人物の国のものでなければ、できない */
  found(id: string, cityId: string, state: string, title: string): string | undefined {
    const p = P(id);
    if (!p || this.c.personStatus(id) !== "active" || this.c.spoils.custodyOf(id) || p.role === "ruler") return undefined;
    const f = this.c.foundState(id, cityId, state, title);
    if (f) return f;
    // 都市が使えなければ、ふつうの独立(拠点と兵があれば)
    return this.c.secede(id, "史実の事件として自立し") ? p.factionId : undefined;
  }

  /**
   * 歴史の攻城戦:攻める軍団が都市から km 以内なら、都市の前に陣を敷いて攻城戦を始める(3Dの攻城戦と同じ流れ)。
   * 遠ければ、都市へ向けて進軍させ、着いたときの攻城戦にこの事件の印を付ける。
   */
  siege(att: ArmyState | undefined, cityId: string, histId: string, km = 420): string {
    const city = this.c.cities.find((x) => x.id === cityId);
    if (!att || !city) { this.notDone = "攻城に出る軍団がない"; return "攻城に出る軍団がない"; }
    // 瞬間移動はさせない:都市のすぐそば(45km以内)にいるときだけ、その場で攻城戦を始める(Version 40)
    if (distanceKm(att.army, city) > Math.min(km, NEAR_KM)) {
      const route = this.c.planRoute(att.army.id, city);
      if (route) this.c.orderMove(att.army.id, route);
      this.tags.push({ a: att.army.id, city: cityId, histId, until: Math.floor(this.c.day) + 240 });
      return `${att.army.name}が${city.name}へ向かいます(着いてから攻城戦になります)`;
    }
    att.army.lon = city.lon - 0.35;
    att.army.lat = city.lat;
    att.route = null;
    const ev = this.c.startSiegeAt(att, city, histId);
    if (!ev) this.notDone = "攻城戦を始められなかった";
    return ev ? `${city.name}の攻城戦が始まります(${att.army.name})` : "攻城戦を始められませんでした";
  }

  largestArmy(f: string, near?: { lon: number; lat: number }, km = 9999): ArmyState | undefined {
    return this.c.armies.filter((s) => s.army.factionId === f && s.status !== "fighting" && totalTroops(s.army) > 0 && (!near || distanceKm(s.army, near) <= km))
      .sort((a, b) => totalTroops(b.army) - totalTroops(a.army))[0];
  }

  /**
   * 歴史の会戦:両軍が戦場から km 以内にいれば、戦場に向かい合わせて会戦を始める(3Dの会戦と同じ流れ)。
   * 遠ければ、戦場へ向けて進軍させるだけ(瞬間移動はさせない)。
   */
  battle(att: ArmyState | undefined, def: ArmyState | undefined, place: { name: string; lon: number; lat: number }, histId: string, km = 420, tactics?: BattleEvent["tactics"]): string {
    if (!att || !def) { this.notDone = "会戦に出る軍団がない"; return "会戦に出る軍団がない"; }
    // 瞬間移動はさせない:両軍が戦場のすぐそば(45km以内)にいるときだけ、その場で会戦を始める(Version 40)
    const far = distanceKm(att.army, place) > Math.min(km, NEAR_KM) || distanceKm(def.army, place) > Math.min(km, NEAR_KM);
    if (far) {
      for (const s of [att, def]) {
        const route = this.c.planRoute(s.army.id, place);
        if (route) this.c.orderMove(s.army.id, route);
        // 戦場へ向かう行軍:途中や戦場のそばの都市を攻めるのではなく、相手の軍団と会戦する
        s.targetCityId = null;
      }
      this.tags.push({ a: att.army.id, b: def.army.id, histId, until: Math.floor(this.c.day) + 240, tactics });
      this.flag(`${histId}_march`, "1");
      return `両軍が${place.name}へ向かいます(遠いため、着いてから戦いになります)`;
    }
    att.army.lon = place.lon - 0.12;
    att.army.lat = place.lat;
    def.army.lon = place.lon + 0.12;
    def.army.lat = place.lat;
    att.route = null;
    def.route = null;
    const ev = this.c.startEventAt(att, def, histId, tactics);
    if (ev) ev.location.name = place.name;
    if (!ev) this.notDone = "会戦を始められなかった";
    return ev ? `${place.name}で会戦が始まります(${att.army.name} 対 ${def.army.name})` : "会戦を始められませんでした";
  }
}

// ================= 事件の一覧(17件) =================
export const H = (x: Ctx): HistorySystem => x.h;
export const roll = (x: Ctx, s: string): number => chance(`${Math.floor(x.c.day)}|${s}`);
export const pw = (x: Ctx, f: string | undefined): number => (f ? x.c.diplo.power(f) : 0);

export const EVENTS: HistEventDef[] = [
  {
    id: "han304", name: "漢の建国(劉淵の自立)", year: 304, month: 10, importance: "major",
    cond: "劉淵が生きていて、どこかの国に仕えている(君主でない)",
    place: { name: "離石(左国城)", lon: 111.13, lat: 37.52 }, persons: ["liu_yuan", "liu_cong", "liu_xuan", "sima_ying"],
    background: "八王の乱のさなか、成都王司馬穎に仕えていた匈奴の劉淵は、北方の并州が乱れるのを機に、匈奴の五部に推されて帰郷を願い出た。",
    history: "304年、劉淵は離石(左国城)で大単于、ついで漢王を称し、漢(のちの前趙)を建てた。五胡十六国の幕開けとされる。",
    sources: ["『晋書』劉元海載記", "『資治通鑑』巻85"],
    roles: (x) => ({ holder: factionOfPersons(x.c, ["liu_yuan"]) }),
    done: (_x) => P("liu_yuan")?.role === "ruler",
    ready: (x, r) => (!alive(x.c, "liu_yuan") ? "劉淵がいない(死亡・捕虜)" : !r.holder ? "劉淵の仕える国がない" : true),
    choices: {
      holder: [
        { id: "release", label: "劉淵の帰郷を許す", kind: "historic", desc: "匈奴の兵で北の乱を鎮めると申し出た劉淵を、并州へ帰す。", preview: "劉淵が離石で漢を建てて自立する。西晋と戦争になる" },
        { id: "keep", label: "劉淵を手元に引き留める", kind: "alt", desc: "劉淵の才を惜しみ、都に留め置く。", preview: "漢は建国されない。劉淵の忠誠が大きく下がる" },
        { id: "seize", label: "劉淵を捕らえ、匈奴の自立を封じる", kind: "bold", desc: "危険な人物として捕らえる。", preview: "劉淵は処刑される。匈奴の人物の忠誠が下がり、君主の名声が下がる" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      if (p.holder === "release") {
        const f = h.found("liu_yuan", "lishi", "漢", "漢王");
        if (!f) return "劉淵は帰郷したが、拠点が得られず、自立はできなかった";
        h.flag("han_founded", f);
        // 劉氏の一族(劉聡・劉和・劉曜ら)と匈奴の将は、劉淵のもとへ移る(史実)
        for (const id of ["liu_he", "liu_cong", "liu_yi", "liu_yao", "liu_xuan", "liu_can", "huyan_yi", "chen_yuanda", "huyan_yan"]) {
          const q = P(id);
          if (q && q.factionId === r.holder && x.c.personStatus(id) !== "dead" && !x.c.spoils.custodyOf(id)) {
            x.c.vacatePosts(id); // 指揮官・副将・配下武将・太守の任を外す(Version 51)
            x.c.spoils.setFaction(id, f);
          }
        }
        const jin = pick(x.c, "jin");
        if (jin && jin !== f) x.c.setRelation(f, jin, "war");
        return `劉淵が離石で漢を建て、漢王を称した(「${name(f)}」)`;
      }
      if (p.holder === "keep") {
        x.c.loyalty.add("liu_yuan", -30, "帰郷を許されない");
        h.flag("han_held", "1");
        return "劉淵は都に留め置かれ、漢は建国されなかった";
      }
      x.c.court.kill("liu_yuan", "execution", "自立を恐れた主君に処刑される");
      for (const q of persons) if (q.people === "匈奴") x.c.loyalty.add(q.id, -20, "劉淵の処刑");
      const rr = x.c.rulerOf(r.holder!);
      if (rr) x.c.loyalty.addFame(rr.id, -5);
      h.flag("han_held", "1");
      return "劉淵は捕らえられ処刑された。匈奴の人々の心は離れた";
    },
  },
  {
    id: "yongjia311", name: "永嘉の乱(洛陽の陥落)", year: 311, month: 6, importance: "critical", battle: ["jin", "han"],
    cond: "漢(劉氏の国)と西晋があり、洛陽が西晋のもので、両国が同盟していない",
    place: { name: "洛陽", lon: 112.6, lat: 34.72 }, persons: ["liu_cong", "liu_yao", "shi_le", "wang_mi", "sima_chi", "sima_yue"],
    background: "漢の劉聡は、劉曜・王弥・石勒を送って西晋の都・洛陽に迫った。東海王司馬越は大軍を率いて都を出たまま病死し、その軍は石勒に寧平城で全滅させられた。洛陽は孤立している。",
    history: "311年6月、劉曜・王弥が洛陽を攻め落とし、懐帝(司馬熾)を捕らえた。宮殿は焼かれ、王公・官人の多くが殺された。中原の人々は江南へ逃れた(永嘉の乱)。",
    sources: ["『晋書』孝懐帝紀", "『晋書』劉聡載記", "『資治通鑑』巻87"],
    roles: (x) => ({ jin: owner("luoyang") && (owner("luoyang") === "jin" || /晋/.test(name(owner("luoyang")))) ? owner("luoyang") : pick(x.c, "jin"), han: hanOf(x.c) }),
    done: (_x, r) => !!r.han && owner("luoyang") === r.han,
    ready: (x, r) => (!r.han ? "漢(劉氏の国)がない" : !r.jin ? "西晋がない" : owner("luoyang") !== r.jin ? "洛陽が西晋のものではない" : x.c.relationOf(r.jin, r.han) === "alliance" ? "西晋と漢が同盟している" : true),
    choices: {
      jin: [
        { id: "stay", label: "洛陽にとどまる", kind: "historic", desc: "皇帝は都を離れず、守りを固める。", preview: "漢が総攻撃すれば洛陽は落ち、君主が捕らえられて国が滅ぶ(後継の国が残る)" },
        { id: "retreat", label: "長安へ遷都する", kind: "alt", desc: "洛陽を捨て、関中へ逃れて再起を図る。", preview: "洛陽は失うが、君主は無事。兵の1割を失い、安定が下がる" },
        { id: "call", label: "諸侯に援軍を求め、洛陽で決戦する", kind: "bold", desc: "王浚・劉琨らに急使を送り、都を死守する。", preview: "金1,500で洛陽の守備兵+8,000。洛陽の攻城戦で勝敗が決まる(敗れれば君主も捕らわれる)" },
      ],
      han: [
        { id: "storm", label: "洛陽を総攻撃する", kind: "historic", desc: "劉曜・王弥・石勒の軍を合わせて都を攻める。", preview: "主力の士気+8で洛陽の攻城戦を始める。落とせば晋の君主を捕らえる" },
        { id: "siege", label: "包囲して降伏を待つ", kind: "alt", desc: "兵を損なわず、都の飢えを待つ。", preview: "洛陽の守備兵が半減し、晋の兵が減る。都はまだ落ちない" },
        { id: "divert", label: "洛陽を避け、関中・長安を狙う", kind: "bold", desc: "都を捨て置き、西の要地を先に取る。", preview: "洛陽は陥落しない。漢の名声が下がる" },
      ],
    },
    ai: (x, r, role) => {
      if (role === "han") return pw(x, r.han) > pw(x, r.jin) * 0.9 ? (roll(x, "yj-h") < 0.75 ? "storm" : "siege") : roll(x, "yj-h2") < 0.5 ? "siege" : "divert";
      return pw(x, r.jin) > pw(x, r.han) * 1.1 ? "call" : roll(x, "yj-j") < 0.6 ? "stay" : "retreat";
    },
    apply: (x, r, p) => {
      const h = H(x);
      const jin = r.jin!;
      const han = r.han!;
      const ruler = x.c.rulerOf(jin);
      if (p.han !== "divert" && !x.c.atWar(jin, han)) x.c.setRelation(jin, han, "war");
      if (p.han === "divert") {
        x.c.loyalty.addFame(x.c.rulerOf(han)?.id ?? "", -4);
        h.flag("luoyang_held", "1");
        return "漢は洛陽を攻めず、都は残った(永嘉の乱は起きなかった)";
      }
      if (p.jin === "retreat") {
        const cap = owner("changan") === jin ? "changan" : undefined;
        if (ruler && cap) ruler.residence = cap;
        h.give("luoyang", han);
        h.troops(jin, 0.9);
        x.c.court.addStability(jin, -10);
        h.flag("luoyang_lost", "1");
        h.flag("emperor_safe", "1");
        return `晋は洛陽を捨てて${cap ? "長安へ遷った" : "逃れた"}。洛陽は漢のものとなったが、君主は無事`;
      }
      if (p.jin === "call") {
        const purse = x.c.factionStates[jin];
        if (purse) purse.gold = Math.max(0, purse.gold - 1500);
        for (const f of ["wang_jun", "liu_kun"]) if (live(x.c, f)) x.c.diplo.addAmity(jin, f, 15);
        const city = x.c.cities.find((k) => k.id === "luoyang")!;
        const st = x.c.cityState(city);
        x.c.cityStates.luoyang = { ...st, garrison: st.garrison + 8000 };
      }
      if (p.han === "siege" && p.jin !== "call") {
        const city = x.c.cities.find((k) => k.id === "luoyang")!;
        const st = x.c.cityState(city);
        x.c.cityStates.luoyang = { ...st, garrison: Math.round(st.garrison * 0.5) };
        h.troops(jin, 0.9);
        h.flag("luoyang_siege", "1");
        return "漢は洛陽を包囲した。都の守備兵は飢えで半減したが、まだ落ちていない";
      }
      // 洛陽の攻城戦(3Dの攻城戦と同じ)。勝敗は戦いで決まる
      const att = h.largestArmy(han, { lon: 112.6, lat: 34.72 }, 900);
      if (att) att.army.morale = Math.min(100, att.army.morale + (p.han === "storm" ? 8 : 0));
      return `漢が洛陽に迫った${p.jin === "call" ? "(晋は諸侯の援軍で守りを固めた)" : ""}。${h.siege(att, "luoyang", "yongjia311")}`;
    },
    // 洛陽が落ちたとき:懐帝が洛陽に実際にいれば捕らえる。西晋は、後継者と残る都市があれば続く(史実では長安で316年まで)
    fallRule: { capture: "ifPresent", survive: true },
    onBattle: (x, r) => {
      const h = H(x);
      const jin = r.jin!;
      const han = r.han!;
      if (owner("luoyang") === han) {
        h.flag("luoyang_lost", "1");
        // 君主の捕縛は、攻城戦の処理(この事件の決まり)が一度だけ行う。ここでは結果を読むだけ
        const e = [...x.c.capitalLog].reverse().find((l) => l.factionId === jin && l.cityId === "luoyang");
        const who = e?.rulerId ? P(e.rulerId)?.name ?? "" : "";
        if (e?.captured) {
          h.flag("emperor_captured", "1");
          const next = e.newRuler ? P(e.newRuler)?.name : undefined;
          return `洛陽は陥落し、${who}は漢に捕らえられた${next ? `。${next}が即位し、晋は残る都市で続く` : e.fell ? "。晋は滅びた" : ""}`;
        }
        if (e && !e.rulerAtCapital) return `洛陽は陥落したが、${who}は洛陽にいなかったので捕らえられなかった(史実との分岐)`;
        if (e?.escaped) return `洛陽は陥落したが、${who}は脱出した(史実との分岐)`;
        return "洛陽は陥落した";
      }
      h.flag("luoyang_held", "1");
      return "洛陽は持ちこたえた(史実との分岐)";
    },
  },
  {
    id: "changan316", name: "長安の陥落・西晋の滅亡", year: 316, month: 11, importance: "major",
    cond: "洛陽を守り切っておらず、漢があり、長安に晋の朝廷がある",
    place: { name: "長安", lon: 108.87, lat: 34.31 }, persons: ["liu_yao", "sima_ye", "qu_yun", "suo_chen"],
    background: "洛陽を失った晋の残る朝廷は、長安で愍帝(司馬鄴)を立てた。劉曜の軍が関中を囲み、城内は飢えに苦しんでいる。",
    history: "316年11月、愍帝は長安を出て劉曜に降り、西晋は滅んだ。江南の司馬睿が晋の再興を担うことになる。",
    sources: ["『晋書』孝愍帝紀", "『資治通鑑』巻89"],
    roles: (x) => {
      const o = owner("changan");
      const jinW = o && o !== hanOf(x.c) && /晋|司馬/.test(name(o) + (x.c.rulerOf(o)?.name ?? "")) && o !== "jin_rui" ? o : undefined;
      return { jin: jinW, han: hanOf(x.c) };
    },
    done: (_x, r) => !!r.han && owner("changan") === r.han,
    ready: (x, r) => (x.h.flags.luoyang_held ? "洛陽を守り切ったため、西晋は長安へ追い詰められていない" : !r.han ? "漢(劉氏の国)がない" : !r.jin ? "長安に晋の朝廷がない" : x.c.relationOf(r.jin, r.han) === "alliance" ? "長安の晋と漢が同盟している" : true),
    choices: {
      jin: [
        { id: "surrender", label: "降伏する", kind: "historic", desc: "飢えた民を救うため、皇帝は城を出て降る。", preview: "長安を失い、君主は捕らえられる(国は滅ぶ)" },
        { id: "flee", label: "長安を捨てて秦州(上邽)へ", kind: "alt", desc: "司馬保を頼って西へ逃れる。", preview: "長安は失うが、君主は無事。兵の2割を失う" },
        { id: "hold", label: "籠城して援軍を待つ", kind: "bold", desc: "江南・涼州の援軍を信じて耐える。", preview: "国力しだいで持ちこたえる。敗れれば君主も捕らわれる" },
      ],
      han: [
        { id: "press", label: "包囲を続け、降伏させる", kind: "historic", desc: "劉曜に関中の平定を続けさせる。", preview: "長安を得て、晋の君主を捕らえる" },
        { id: "withdraw", label: "包囲を解き、平陽を固める", kind: "alt", desc: "宮廷の乱れを恐れて兵を返す。", preview: "長安は落ちない" },
        { id: "sweep", label: "長安を落とし、秦州まで追撃する", kind: "bold", desc: "関中と隴右を一気に平定する。", preview: "長安を得て、さらに上邽が晋のものなら奪う。兵の1割を失う" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const jin = r.jin!;
      const han = r.han!;
      if (p.han === "withdraw") return "漢は長安の包囲を解いた。西晋は命脈を保った";
      if (p.han === "sweep") {
        h.troops(han, 0.9);
        if (owner("shanggui") === jin) h.give("shanggui", han);
      }
      if (!x.c.atWar(jin, han)) x.c.setRelation(jin, han, "war");
      const ruler = x.c.rulerOf(jin);
      if (p.jin === "flee") {
        h.give("changan", han);
        h.troops(jin, 0.8);
        if (ruler && owner("shanggui") === jin) ruler.residence = "shanggui";
        return "晋の朝廷は長安を捨てて西へ逃れた。長安は漢のものとなった";
      }
      if (p.jin === "hold" && roll(x, "ca-res") < (pw(x, jin) * 1.4) / (pw(x, jin) * 1.4 + pw(x, han))) {
        h.troops(han, 0.85);
        return "長安は持ちこたえ、漢の軍は退いた";
      }
      h.give("changan", han);
      if (ruler) h.capture(ruler.id, han);
      h.flag("west_jin_fallen", "1");
      return `長安は落ち${ruler ? `、${ruler.name}は漢に降った` : ""}。西晋は滅んだ`;
    },
  },
  {
    id: "dongjin318", name: "東晋の成立(司馬睿の即位)", year: 318, month: 3, importance: "major",
    cond: "司馬睿が君主の国がある",
    place: { name: "建康", lon: 118.8, lat: 32.05 }, persons: ["sima_rui", "wang_dao", "wang_dun", "zu_ti"],
    background: "愍帝の死が江南に伝わった。琅邪王司馬睿は晋王を称していたが、王導・王敦ら琅邪王氏の支えのもとで、帝位に即くよう勧められている。「王と馬、天下を共にす」と言われた。",
    history: "318年3月、司馬睿は建康で皇帝に即位した(元帝)。東晋の始まりである。",
    sources: ["『晋書』元帝紀", "『晋書』王導伝", "『世説新語』"],
    roles: (x) => ({ jin: factionOfPersons(x.c, ["sima_rui"], true) }),
    done: (x, r) => !!r.jin && x.c.court.rankOf(r.jin) === "emperor",
    ready: (_x, r) => (!r.jin ? "司馬睿が君主の国がない" : true),
    choices: {
      jin: [
        { id: "crown", label: "皇帝に即位する(王導らの推戴)", kind: "historic", desc: "王氏の支えで帝位に即き、晋の正統を継ぐ。", preview: "皇帝となり威信・名声が上がる。王導・王敦の忠誠が上がる" },
        { id: "wait", label: "晋王のまま、北伐を優先する", kind: "alt", desc: "中原の回復を先にし、即位は後にする。", preview: "祖逖の忠誠が上がり、名声が少し上がる。安定はやや下がる" },
        { id: "curb", label: "王氏の力を抑え、劉隗・刁協を重く用いる", kind: "bold", desc: "皇帝の権威を王氏から取り戻す。", preview: "王敦・王導の忠誠が大きく下がる(のちの王敦の乱の火種)" },
      ],
    },
    apply: (x, r, p) => {
      const jin = r.jin!;
      const L = x.c.loyalty;
      if (p.jin === "crown") {
        x.c.court.ranks[jin] = "emperor";
        const f = scenario.factions.find((y) => y.id === jin)!;
        f.title = "皇帝";
        x.c.court.addStability(jin, 10);
        L.addFame("sima_rui", 10);
        for (const id of ["wang_dao", "wang_dun"]) L.add(id, 5, "元帝の即位を支える");
        x.h.log("crown", "司馬睿が皇帝に即位(東晋の成立)", undefined, "dongjin318");
        return "司馬睿が建康で皇帝に即位した(東晋の成立)";
      }
      if (p.jin === "wait") {
        L.add("zu_ti", 10, "北伐を重んじられる");
        L.addFame("sima_rui", 3);
        x.c.court.addStability(jin, -5);
        return "司馬睿は晋王のまま、北伐を先にした";
      }
      L.add("wang_dun", -30, "権力を削られる");
      L.add("wang_dao", -10, "王氏が退けられる");
      for (const id of ["liu_wei", "diao_xie"]) L.add(id, 10, "重く用いられる");
      x.c.court.addStability(jin, -10);
      x.h.flag("wang_curbed", "1");
      return "司馬睿は王氏を抑え、劉隗・刁協を重く用いた。王敦は不満を募らせている";
    },
  },
  {
    id: "jinzhun318", name: "靳準の乱", year: 318, month: 8, importance: "major",
    cond: "劉粲が漢の君主で、靳準が漢の宮廷にいる",
    place: { name: "平陽", lon: 111.52, lat: 36.08 }, persons: ["jin_zhun", "liu_can", "liu_yao", "shi_le", "jin_yuehua"],
    background: "劉聡が没し、子の劉粲が即位した。外戚の靳準は国政を握り、劉氏の一族を除こうとしている。",
    history: "318年8月、靳準は劉粲と劉氏の一族を殺し、漢天王を称した。劉曜は長安で即位し、石勒とともに平陽を攻めた。靳準は一族に殺された。",
    sources: ["『晋書』劉聡載記・劉曜載記", "『資治通鑑』巻90"],
    roles: (x) => ({ han: hanOf(x.c) }),
    done: () => P("jin_zhun")?.role === "ruler",
    ready: (x, r) => (!r.han ? "漢(劉氏の国)がない" : x.c.rulerOf(r.han)?.id !== "liu_can" ? "劉粲が君主ではない" : !alive(x.c, "jin_zhun") || P("jin_zhun")!.factionId !== r.han ? "靳準が漢の宮廷にいない" : true),
    choices: {
      han: [
        { id: "trust", label: "靳準に政務を任せる", kind: "historic", desc: "外戚の靳準を信じ、宮中を委ねる。", preview: "靳準が政変を起こし、劉粲は殺される。劉曜が皇位を主張して自立する" },
        { id: "recall", label: "靳準を遠ざけ、劉曜を呼び戻す", kind: "alt", desc: "宗室の重鎮に都を固めさせる。", preview: "靳準の忠誠が大きく下がり、劉曜の忠誠が上がる。安定が少し上がる" },
        { id: "purge", label: "靳準の一族を誅殺する", kind: "bold", desc: "先手を打って外戚を除く。", preview: "靳準・靳康・靳明が処刑される。安定はやや下がる" },
      ],
    },
    apply: (x, r, p) => {
      const han = r.han!;
      if (p.han === "trust") {
        const old = x.c.rulerOf(han)!;
        x.c.usurp(han, old, P("jin_zhun")!);
        x.c.court.recordCause(old.id, "assassination", "靳準の乱");
        x.c.court.counts.usurpations++;
        x.c.court.addStability(han, -30);
        x.h.log("ruler", "靳準が劉粲を殺して位を奪う", undefined, "jinzhun318");
        let claim = "";
        if (alive(x.c, "liu_yao") && P("liu_yao")!.factionId === han && x.c.secede("liu_yao", "皇位を主張して")) claim = "。劉曜が皇位を主張して自立した";
        return `靳準が劉粲を殺し、位を奪った${claim}`;
      }
      if (p.han === "recall") {
        x.c.loyalty.add("jin_zhun", -30, "遠ざけられる");
        x.c.loyalty.add("liu_yao", 15, "都に呼び戻される");
        x.c.court.addStability(han, 5);
        return "靳準は遠ざけられ、劉曜が都を固めた";
      }
      for (const id of ["jin_zhun", "jin_kang", "jin_ming"]) if (P(id) && P(id)!.factionId === han) x.c.court.kill(id, "execution", "外戚の誅殺");
      x.c.court.addStability(han, -5);
      return "靳準の一族は誅殺された";
    },
  },
  {
    id: "houzhao319", name: "後趙の成立(石勒の自立)", year: 319, month: 11, importance: "major",
    cond: "石勒が君主の国がある",
    place: { name: "襄国", lon: 114.5, lat: 37.07 }, persons: ["shi_le", "zhang_bin", "shi_hu", "liu_yao"],
    background: "劉曜は長安で即位して国号を趙(前趙)とし、石勒に趙公を授けた。しかし石勒の使者が殺され、両者の間に溝が生じている。",
    history: "319年11月、石勒は襄国で趙王を称し、前趙から独立した(後趙)。以後、二つの趙が華北を争う。",
    sources: ["『晋書』石勒載記", "『資治通鑑』巻91"],
    roles: (x) => ({ shi: factionOfPersons(x.c, ["shi_le"], true), han: hanOf(x.c) }),
    done: (x, r) => !!r.shi && ["king", "emperor"].includes(x.c.court.rankOf(r.shi)),
    ready: (_x, r) => (!r.shi ? "石勒が君主の国がない" : true),
    choices: {
      shi: [
        { id: "king", label: "趙王を称し、前趙と決別する", kind: "historic", desc: "張賓の策に従い、襄国を都として自立する。", preview: "王の位に上がり、国の名を「趙(後趙)」とする。前趙と戦争になる" },
        { id: "vassal", label: "前趙の臣として留まる", kind: "alt", desc: "劉曜と和を保ち、東の平定を先にする。", preview: "前趙との友好度が上がり、同盟を保つ。張賓の忠誠が少し下がる" },
        { id: "emperor", label: "皇帝を称し、天下に号令する", kind: "bold", desc: "一気に帝位に即く。", preview: "皇帝となる。安定が大きく下がり、ほかの皇帝の国との関係が悪化する" },
      ],
    },
    apply: (x, r, p) => {
      const shi = r.shi!;
      const f = scenario.factions.find((y) => y.id === shi)!;
      if (p.shi === "vassal") {
        if (r.han) {
          x.c.diplo.addAmity(shi, r.han, 20);
          if (!x.c.atWar(shi, r.han)) x.c.setRelation(shi, r.han, "alliance");
        }
        x.c.loyalty.add("zhang_bin", -5, "自立の策が退けられる");
        return "石勒は前趙の臣として留まった";
      }
      const rank = p.shi === "king" ? "king" : "emperor";
      x.c.court.ranks[shi] = rank;
      f.title = rank === "king" ? "趙王" : "皇帝";
      f.name = "趙(後趙)";
      x.c.loyalty.addFame("shi_le", rank === "king" ? 8 : 12);
      if (rank === "emperor") {
        x.c.court.addStability(shi, -20);
        for (const g of scenario.factions) if (g.id !== shi && x.c.court.rankOf(g.id) === "emperor") x.c.diplo.addAmity(shi, g.id, -30);
      }
      if (r.han && r.han !== shi) x.c.setRelation(shi, r.han, "war");
      x.h.log("state", `石勒が${f.title}を称し、後趙が成立`, rank === "emperor" ? "史実では趙王(330年に皇帝)" : undefined, "houzhao319");
      return `石勒が${f.title}を称し、「趙(後趙)」が成立した${r.han ? "。前趙と戦争になった" : ""}`;
    },
  },
  {
    id: "qianzhao329", name: "前趙の滅亡(洛陽の戦い)", year: 329, month: 9, importance: "major", battle: ["han", "shi"],
    cond: "前趙と後趙があり、同盟・従属の関係にない",
    place: { name: "洛陽", lon: 112.6, lat: 34.72 }, persons: ["liu_yao", "liu_xi", "shi_le", "shi_hu"],
    background: "前趙の劉曜は洛陽を囲んだが、石勒は自ら大軍を率いて救援に向かった。劉曜は酒に酔って戦いに臨んだと伝えられる。",
    history: "328年12月、洛陽の戦いで劉曜は落馬して捕らえられ、のちに殺された。329年9月、太子の劉熙らが守る上邽が石虎に落とされ、前趙は滅んだ。",
    sources: ["『晋書』劉曜載記・石勒載記", "『資治通鑑』巻94"],
    roles: (x) => ({ han: hanOf(x.c), shi: shiOf(x.c) }),
    done: (_x, r) => !r.han && !!scenario.factions.find((f) => f.id === "han_zhao")?.fallen,
    ready: (x, r) => (!r.han ? "前趙がない" : !r.shi ? "後趙がない" : ["alliance", "vassal"].includes(x.c.relationOf(r.han, r.shi)) ? "前趙と後趙が同盟・従属の関係にある" : true),
    choices: {
      han: [
        { id: "fight", label: "洛陽で石勒と決戦する", kind: "historic", desc: "全軍で石勒を迎え撃つ。", preview: "君主みずから主力を率いて洛陽の会戦。敗れれば君主が捕らえられ国が滅ぶ" },
        { id: "west", label: "関中に退き、上邽・長安を守る", kind: "alt", desc: "東の都市を捨てて西で守りを固める。", preview: "洛陽より東の都市を後趙に渡すが、国は保つ" },
        { id: "peace", label: "後趙に和を請い、成漢・前涼と結ぶ", kind: "bold", desc: "外交で生き残りを図る。", preview: "後趙が和を受ければ停戦。受けなければ戦いが続く" },
      ],
      shi: [
        { id: "crush", label: "全軍で前趙を討つ", kind: "historic", desc: "石勒自ら洛陽へ向かう。", preview: "主力の士気+8で洛陽の会戦。勝てば前趙の君主を捕らえる" },
        { id: "hold", label: "守りを固め、前趙の自滅を待つ", kind: "alt", desc: "無理な決戦を避ける。", preview: "決戦は起きない" },
        { id: "turn", label: "前趙と和し、東晋を討つ", kind: "bold", desc: "西を固めて南へ向かう。", preview: "前趙と不可侵、東晋と戦争" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const han = r.han!;
      const shi = r.shi!;
      if (p.han === "peace" && (p.shi === "hold" || roll(x, "qz-p") < 0.3)) {
        x.c.setRelation(han, shi, "nonaggression");
        x.c.diplo.treaties[[han, shi].sort().join("|")] = { kind: "nonaggression", until: Math.floor(x.c.day) + 360 };
        return "前趙と後趙は停戦した(前趙は滅びなかった)";
      }
      if (p.han === "west") {
        const moved = x.c.cities.filter((k) => owner(k.id) === han && k.lon > 110.3).map((k) => k.id);
        for (const id of moved) h.give(id, shi);
        return `前趙は関中に退いた(${moved.length}の都市を後趙に渡した)`;
      }
      if (p.shi === "hold") return "後趙は決戦を避けた。前趙は滅びなかった";
      if (p.shi === "turn") {
        x.c.setRelation(han, shi, "nonaggression");
        const jin = jinOf(x.c);
        if (jin) x.c.setRelation(shi, jin, "war");
        return "後趙は前趙と和し、矛先を東晋に向けた";
      }
      if (!x.c.atWar(han, shi)) x.c.setRelation(han, shi, "war");
      // 洛陽の戦い(3Dの会戦と同じ)。前趙が決戦を選べば、君主みずから軍を率いる
      const ha = h.largestArmy(han, { lon: 112.6, lat: 34.72 }, 900);
      const sa = h.largestArmy(shi, { lon: 112.6, lat: 34.72 }, 900);
      const hr = x.c.rulerOf(han);
      if (ha && hr && p.han === "fight" && alive(x.c, hr.id) && !x.c.postOf(hr.id)) x.c.appoint(hr.id, { kind: "army", id: ha.army.id });
      if (sa && p.shi === "crush") sa.army.morale = Math.min(100, sa.army.morale + 8);
      return h.battle(sa, ha, { name: "洛陽", lon: 112.6, lat: 34.72 }, "qianzhao329");
    },
    onBattle: (x, r, win) => {
      const h = H(x);
      if (win !== "shi") return "前趙は持ちこたえた";
      const ruler = x.c.rulerOf(r.han!);
      if (owner("luoyang") === r.han) h.give("luoyang", r.shi!);
      if (ruler && alive(x.c, ruler.id)) {
        h.capture(ruler.id, r.shi!);
        return `${ruler.name}は落馬して捕らえられた${scenario.factions.find((f) => f.id === r.han)?.fallen ? "。前趙は滅んだ" : ""}`;
      }
      return "後趙が洛陽を取った";
    },
  },
  {
    id: "shihu334", name: "後趙の継承争い(石虎の簒奪)", year: 334, month: 11, importance: "major",
    cond: "石弘が後趙の君主で、石虎が後趙の宮廷にいる",
    place: { name: "襄国", lon: 114.5, lat: 37.07 }, persons: ["shi_hong", "shi_hu", "cheng_xia", "xu_guang"],
    background: "333年に石勒が没し、世子の石弘が継いだ。しかし兵権を握る石虎は丞相・魏王となり、石弘の側近の程遐・徐光を殺した。",
    history: "334年11月、石虎は石弘を廃して自ら居摂趙天王となり、石弘はまもなく殺された。",
    sources: ["『晋書』石季龍載記", "『資治通鑑』巻95"],
    roles: (x) => ({ shi: factionOfPersons(x.c, ["shi_hong"], true) }),
    done: (x) => P("shi_hu")?.role === "ruler" || x.c.personStatus("shi_hu") === "dead",
    ready: (x, r) => (!r.shi ? "石弘が君主ではない" : !alive(x.c, "shi_hu") || P("shi_hu")!.factionId !== r.shi ? "石虎が後趙の宮廷にいない" : true),
    choices: {
      shi: [
        { id: "yield", label: "石虎に政務を委ねる", kind: "historic", desc: "兵権を握る石虎に逆らえない。", preview: "石虎が石弘を廃して位につく(石弘は殺される)" },
        { id: "curb", label: "程遐・徐光の策で石虎の兵権を削る", kind: "alt", desc: "石虎の軍を他の将に分け与える。", preview: "石虎の忠誠が大きく下がる。拠点があれば自立するおそれ" },
        { id: "strike", label: "先手を打って石虎を誅殺する", kind: "bold", desc: "宮中で石虎を除く。", preview: "成功すれば石虎は処刑される。失敗すれば、ただちに簒奪される" },
      ],
    },
    apply: (x, r, p) => {
      const shi = r.shi!;
      const hong = x.c.rulerOf(shi)!;
      const doUsurp = (): string => {
        x.c.usurp(shi, hong, P("shi_hu")!);
        x.c.court.recordCause(hong.id, "execution", "石虎の簒奪");
        x.c.court.counts.usurpations++;
        x.c.court.addStability(shi, -20);
        x.h.log("ruler", "石虎が石弘を廃して位につく", undefined, "shihu334");
        return "石虎が石弘を廃して位についた";
      };
      if (p.shi === "yield") return doUsurp();
      if (p.shi === "curb") {
        x.c.loyalty.add("shi_hu", -35, "兵権を削られる");
        const army = x.c.armies.find((s) => s.army.commanderId === "shi_hu");
        if (army) army.army.commanderId = "";
        x.c.court.addStability(shi, -5);
        const sec = x.c.secede("shi_hu", "兵権を削られて");
        return sec ? "石虎は兵権を削られ、自立した(内乱)" : "石虎の兵権は削られた。石虎は深く恨んでいる";
      }
      const armed = x.c.postOf("shi_hu")?.kind === "army";
      if (roll(x, "sh-strike") < (armed ? 0.35 : 0.6)) {
        x.c.court.kill("shi_hu", "execution", "石弘の先制");
        x.c.court.addStability(shi, -10);
        return "石虎は宮中で誅殺された。石弘は位を保った";
      }
      return `誅殺は失敗した。${doUsurp()}`;
    },
  },
  {
    id: "ranmin350", name: "後趙の崩壊・冉閔の台頭", year: 350, month: 2, importance: "major",
    cond: "冉閔が後趙(石氏の国)にいる",
    place: { name: "鄴", lon: 114.35, lat: 36.33 }, persons: ["ran_min", "shi_jian2", "shi_zhi", "shi_zun"],
    background: "349年に石虎が没すると、石世・石遵・石鑑と短い間に君主が替わった。石虎の養孫である冉閔が兵を握っている。",
    history: "350年閏2月、冉閔は石鑑を殺して魏(冉魏)を建て、胡人の殺戮を命じた。後趙は石祗のもとで襄国に残ったが、351年に滅んだ。",
    sources: ["『晋書』石季龍載記附冉閔伝", "『資治通鑑』巻98"],
    roles: (x) => ({ shi: factionOfPersons(x.c, ["ran_min"]) }),
    done: (_x) => P("ran_min")?.role === "ruler",
    ready: (x, r) => (!alive(x.c, "ran_min") ? "冉閔がいない" : !r.shi || !/趙|石/.test(name(r.shi) + (x.c.rulerOf(r.shi)?.name ?? "")) ? "冉閔が後趙にいない" : true),
    choices: {
      shi: [
        { id: "rise", label: "冉閔が鄴で魏を建てる", kind: "historic", desc: "冉閔は君主を殺して自立する。", preview: "冉閔が鄴で魏(冉魏)を建てる。君主が石鑑なら殺される" },
        { id: "honor", label: "冉閔を重く用い、胡漢の融和を図る", kind: "alt", desc: "大将軍として遇し、反乱の芽を摘む。", preview: "冉閔の忠誠が上がり、安定が少し上がる" },
        { id: "kill", label: "冉閔を誅殺する", kind: "bold", desc: "危険を除く。", preview: "成功すれば冉閔は処刑。失敗すれば冉閔は自立する" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const shi = r.shi!;
      if (p.shi === "honor") {
        x.c.loyalty.add("ran_min", 25, "重く用いられる");
        x.c.court.addStability(shi, 5);
        return "冉閔は重く用いられ、自立しなかった";
      }
      if (p.shi === "kill" && roll(x, "rm") < 0.5) {
        x.c.court.kill("ran_min", "execution", "誅殺");
        return "冉閔は誅殺された";
      }
      const ruler = x.c.rulerOf(shi);
      const f = h.found("ran_min", owner("ye") === shi ? "ye" : "xiangguo", "魏(冉魏)", "天王");
      if (ruler?.id === "shi_jian2" && f) x.c.court.kill("shi_jian2", "execution", "冉閔に殺される");
      return f ? "冉閔が魏(冉魏)を建てた" : "冉閔は自立を図ったが、拠点を得られなかった";
    },
  },
  {
    id: "huanwen354", name: "桓温の北伐(関中への遠征)", year: 354, month: 2, importance: "major", battle: ["jin", "qin"],
    cond: "桓温が東晋にいて、前秦がある",
    place: { name: "灞上", lon: 109.1, lat: 34.3 }, persons: ["huan_wen", "fu_jian_jian", "fu_chang2", "wang_meng"],
    background: "東晋の桓温は、荊州の兵を率いて武関から関中に入り、前秦の都・長安に迫ろうとしている。",
    history: "354年、桓温は灞上まで進んだが、前秦が麦を刈り取って兵糧を断ったため、補給が続かずに退いた。王猛が桓温を訪ねたのはこのときである。",
    sources: ["『晋書』桓温伝", "『晋書』苻健載記", "『資治通鑑』巻99"],
    roles: (x) => ({ jin: factionOfPersons(x.c, ["huan_wen"]) && /晋/.test(name(factionOfPersons(x.c, ["huan_wen"]))) ? factionOfPersons(x.c, ["huan_wen"]) : undefined, qin: qinOf(x.c) }),
    ready: (_x, r) => (!r.jin ? "桓温が晋にいない" : !r.qin ? "前秦がない" : true),
    choices: {
      jin: [
        { id: "march", label: "桓温に関中への北伐を命じる", kind: "historic", desc: "長安を目指して進む。補給は長い道のりを運ぶ。", preview: "いちばん大きな軍団が長安へ進む。前秦と戦争になる" },
        { id: "supply", label: "補給を整えてから進む", kind: "alt", desc: "兵糧を積み上げ、渭水の水運を整える。", preview: "金800を使い、軍団の食糧が増えてから進む" },
        { id: "stay", label: "北伐を見送り、内政を固める", kind: "bold", desc: "遠征の費用を内政に回す。", preview: "安定が上がる。北伐は起きない" },
      ],
      qin: [
        { id: "scorch", label: "麦を刈り取り、補給を断つ", kind: "historic", desc: "堅壁清野で晋軍を飢えさせる。", preview: "晋の遠征軍の食糧が大きく減る。前秦の兵糧も減る" },
        { id: "meet", label: "灞上で迎え撃つ", kind: "alt", desc: "主力を出して決戦する。", preview: "前秦のいちばん大きな軍団が灞上へ向かう" },
        { id: "sue", label: "晋に和を請う", kind: "bold", desc: "戦いを避ける。", preview: "晋が受ければ停戦" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const jin = r.jin!;
      const qin = r.qin!;
      if (p.jin === "stay") {
        x.c.court.addStability(jin, 5);
        return "東晋は北伐を見送った";
      }
      if (p.qin === "sue" && roll(x, "hw-p") < 0.4) {
        x.c.setRelation(jin, qin, "nonaggression");
        return "前秦が和を請い、東晋はこれを受けた";
      }
      x.c.setRelation(jin, qin, "war");
      const army = h.largestArmy(jin);
      if (army) {
        if (alive(x.c, "huan_wen") && !x.c.postOf("huan_wen")) x.c.appoint("huan_wen", { kind: "army", id: army.army.id });
        if (p.jin === "supply") {
          army.army.food += 40;
          const purse = x.c.factionStates[jin];
          if (purse) purse.gold = Math.max(0, purse.gold - 800);
        }
        if (p.qin === "scorch") army.army.food = Math.max(5, army.army.food * 0.5);
      }
      if (p.qin === "scorch") {
        const st = x.c.factionStates[qin];
        if (st) st.grain *= 0.8;
      }
      // 灞上の戦い(3Dの会戦と同じ)。遠ければ、両軍が灞上へ向かう。補給(食糧)が戦いを左右する
      const qa = h.largestArmy(qin);
      if (qa && p.qin === "meet") qa.army.morale = Math.min(100, qa.army.morale + 5);
      const res = h.battle(army, qa, { name: "灞上", lon: 109.1, lat: 34.3 }, "huanwen354", p.qin === "meet" ? 600 : 300);
      return `東晋の軍${army ? `(${army.army.name})` : ""}が関中へ向かった${p.qin === "scorch" ? "。前秦は麦を刈り取り、晋軍の兵糧は乏しい" : ""}。${res}`;
    },
    onBattle: (x, r, win) => {
      if (win === "jin") {
        x.c.loyalty.addFame("huan_wen", 10);
        x.c.diplo.log(r.jin!, r.qin!, "灞上で晋軍が勝つ");
        return "桓温は灞上で勝ち、関中の民は晋軍を迎えた";
      }
      x.c.loyalty.addFame("huan_wen", -4);
      return "桓温は勝てず、兵糧も乏しくなって退いた";
    },
  },
  {
    id: "fujian357", name: "苻堅の即位(苻生の廃位)", year: 357, month: 6, importance: "major",
    cond: "苻生が前秦の君主で、苻堅が前秦の宮廷にいる",
    place: { name: "長安", lon: 108.87, lat: 34.31 }, persons: ["fu_sheng", "fu_jian", "wang_meng", "lv_polou", "fu_fa"],
    background: "前秦の苻生は暴虐で、臣下を次々に殺している。苻堅のもとには、王猛・呂婆楼・権翼らが集まり、苻生を除くよう勧めている。",
    history: "357年6月、苻堅は苻法らと兵を挙げて苻生を廃し(のち殺す)、大秦天王を称した。王猛を重く用いて国を立て直した。",
    sources: ["『晋書』苻生載記・苻堅載記", "『資治通鑑』巻100"],
    roles: (x) => ({ qin: factionOfPersons(x.c, ["fu_sheng"], true) }),
    done: (_x) => P("fu_jian")?.role === "ruler",
    ready: (x, r) => (!r.qin ? "苻生が君主ではない" : !alive(x.c, "fu_jian") || P("fu_jian")!.factionId !== r.qin ? "苻堅が前秦の宮廷にいない" : true),
    choices: {
      qin: [
        { id: "depose", label: "苻堅を推戴し、苻生を廃する", kind: "historic", desc: "王猛らの勧めで、苻堅が立つ。", preview: "苻堅が即位し、苻生は殺される。王猛の忠誠が上がる" },
        { id: "remonstrate", label: "苻生を諫めて改めさせる", kind: "alt", desc: "重臣が命がけで諫める。", preview: "苻生が君主のまま。安定が下がり、苻堅の忠誠が下がる" },
        { id: "remove", label: "苻生が先に苻堅を除く", kind: "bold", desc: "暴君が危険を察する。", preview: "成功すれば苻堅は処刑。失敗すれば苻堅が即位する" },
      ],
    },
    apply: (x, r, p) => {
      const qin = r.qin!;
      const sheng = x.c.rulerOf(qin)!;
      const depose = (): string => {
        x.c.usurp(qin, sheng, P("fu_jian")!);
        x.c.court.recordCause(sheng.id, "execution", "苻堅の挙兵");
        x.c.court.counts.usurpations++;
        x.c.loyalty.add("wang_meng", 15, "苻堅の即位");
        x.c.loyalty.addFame("fu_jian", 10);
        x.c.court.addStability(qin, 5);
        x.h.log("ruler", "苻堅が苻生を廃して即位", undefined, "fujian357");
        return "苻堅が苻生を廃して即位した";
      };
      if (p.qin === "depose") return depose();
      if (p.qin === "remonstrate") {
        x.c.court.addStability(qin, -10);
        x.c.loyalty.add("fu_jian", -10, "苻生が位にとどまる");
        return "苻生は君主のままとなった";
      }
      if (roll(x, "fj") < 0.4) {
        x.c.court.kill("fu_jian", "execution", "苻生に先手を打たれる");
        return "苻生が先に苻堅を除いた";
      }
      return `苻生の企ては漏れた。${depose()}`;
    },
  },
  {
    id: "qianyan370", name: "前燕の滅亡(王猛の遠征)", year: 370, month: 11, importance: "major", battle: ["qin", "yan"],
    cond: "前秦と前燕があり、同盟・従属の関係にない",
    place: { name: "鄴", lon: 114.35, lat: 36.33 }, persons: ["wang_meng", "murong_wei", "murong_ping", "murong_chui", "fu_jian"],
    background: "前燕は慕容恪の死後、太傅の慕容評が権を握って腐敗し、名将の慕容垂は前秦へ亡命した。前秦の王猛が大軍を率いて東へ向かう。",
    history: "370年、王猛は潞川で慕容評の大軍を破り、鄴を落とした。慕容暐は捕らえられ、前燕は滅んだ。慕容氏の一族は長安へ移された。",
    sources: ["『晋書』苻堅載記・慕容暐載記", "『資治通鑑』巻102"],
    roles: (x) => ({ qin: qinOf(x.c), yan: factionOfPersons(x.c, ["murong_wei", "murong_jun"], true) ?? pick(x.c, "qianyan") }),
    done: (_x, r) => !r.yan && !!scenario.factions.find((f) => f.id === "qianyan")?.fallen,
    ready: (x, r) => (!r.qin ? "前秦がない" : !r.yan ? "前燕がない" : ["alliance", "vassal"].includes(x.c.relationOf(r.qin, r.yan)) ? "前秦と前燕が同盟・従属の関係にある" : true),
    choices: {
      qin: [
        { id: "attack", label: "王猛に鄴を攻めさせる", kind: "historic", desc: "潞川で決戦し、一気に鄴へ。", preview: "国力で上回れば、前燕の君主を捕らえて滅ぼす" },
        { id: "wait", label: "国境を固め、前燕の内紛を待つ", kind: "alt", desc: "無理をせず、敵の自壊を待つ。", preview: "前燕の安定が下がる" },
        { id: "vassal", label: "前燕を属国にする", kind: "bold", desc: "和を結び、貢ぎ物を出させる。", preview: "前燕が従属を受ければ、戦争は終わる" },
      ],
      yan: [
        { id: "ping", label: "慕容評に迎え撃たせる", kind: "historic", desc: "太傅が大軍を率いる。", preview: "国力しだいで、敗れれば君主が捕らわれる" },
        { id: "chui", label: "名将に防衛を任せる", kind: "alt", desc: "有能な将に全権を委ねる。", preview: "慕容垂(いなければ慕容恪・慕容徳)が指揮し、士気+10" },
        { id: "cede", label: "洛陽を割いて和を請う", kind: "bold", desc: "領土を差し出して生き残る。", preview: "洛陽を前秦に渡して停戦" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const qin = r.qin!;
      const yan = r.yan!;
      if (p.yan === "cede") {
        h.give("luoyang", qin);
        x.c.setRelation(qin, yan, "nonaggression");
        return "前燕は洛陽を割いて和を請い、停戦した";
      }
      if (p.qin === "wait") {
        x.c.court.addStability(yan, -10);
        return "前秦は国境を固めて待った。前燕は内紛で揺れている";
      }
      if (p.qin === "vassal") {
        const res = x.c.diplo.act(qin, yan, "vassal");
        return res.ok ? "前燕は前秦に臣従した" : `前燕は従属を拒んだ(${res.text})`;
      }
      if (!x.c.atWar(qin, yan)) x.c.setRelation(qin, yan, "war");
      // 潞川の戦い(3Dの会戦と同じ)。王猛が率い、前燕は慕容評か名将が迎え撃つ
      const place = { name: "潞川", lon: 113.1, lat: 36.3 };
      const qa = h.largestArmy(qin, place, 900);
      const ya = h.largestArmy(yan, place, 900);
      if (qa && alive(x.c, "wang_meng") && P("wang_meng")!.factionId === qin && qa.army.commanderId !== "wang_meng") x.c.appoint("wang_meng", { kind: "army", id: qa.army.id });
      const gen = p.yan === "chui" ? ["murong_chui", "murong_ke", "murong_de"].find((id) => alive(x.c, id) && P(id)!.factionId === yan) : ["murong_ping"].find((id) => alive(x.c, id) && P(id)!.factionId === yan);
      if (ya && gen && ya.army.commanderId !== gen) x.c.appoint(gen, { kind: "army", id: ya.army.id });
      if (ya && p.yan === "chui") ya.army.morale = Math.min(100, ya.army.morale + 10);
      if (ya && p.yan === "ping") ya.army.morale = Math.max(10, ya.army.morale - 5);
      return h.battle(qa, ya, place, "qianyan370");
    },
    onBattle: (x, r, win) => {
      const h = H(x);
      if (win !== "qin") return "前燕は前秦の遠征を退けた";
      const ruler = x.c.rulerOf(r.yan!);
      if (owner("ye") === r.yan) h.give("ye", r.qin!);
      if (ruler && alive(x.c, ruler.id)) h.capture(ruler.id, r.qin!);
      return `前秦が鄴を落とした${ruler ? `。${ruler.name}は捕らえられた` : ""}`;
    },
  },
  {
    id: "unify376", name: "前秦の華北統一(前涼・代の征服)", year: 376, month: 8, importance: "major",
    cond: "前秦があり、前涼か代が残っている",
    place: { name: "姑臧", lon: 102.63, lat: 37.93 }, persons: ["fu_jian", "zhang_tianxi", "shiyijian", "liu_weichen"],
    background: "前燕を滅ぼした前秦は、西の前涼と北の代を残すのみとなった。苻堅は両国に使者を送り、服属を求めた。",
    history: "376年8月、前秦は前涼を滅ぼし(張天錫は降伏)、同年12月には代を滅ぼした。華北は前秦のもとに統一された。",
    sources: ["『晋書』苻堅載記・張天錫伝", "『魏書』序紀", "『資治通鑑』巻104"],
    roles: (x) => ({ qin: qinOf(x.c), liang: pick(x.c, "qianliang"), dai: pick(x.c, "dai") }),
    ready: (_x, r) => (!r.qin ? "前秦がない" : !r.liang && !r.dai ? "前涼も代もすでにない" : true),
    choices: {
      qin: [
        { id: "conquer", label: "前涼・代を征服する", kind: "historic", desc: "大軍を西と北へ送る。", preview: "国力で大きく上回れば、両国を併合する。足りなければ戦争" },
        { id: "tribute", label: "朝貢させて属国にする", kind: "alt", desc: "戦わずに従わせる。", preview: "両国に従属を求める" },
        { id: "south", label: "東晋攻めを優先する", kind: "bold", desc: "西北を捨て置き、南へ向かう。", preview: "東晋と戦争になる" },
      ],
      liang: [
        { id: "yield", label: "降伏する", kind: "historic", desc: "張天錫は抗えない。", preview: "前秦が征服を選べば、国は併合される" },
        { id: "resist", label: "徹底抗戦する", kind: "alt", desc: "河西の守りに賭ける。", preview: "併合されず、戦争になる" },
        { id: "ally", label: "東晋と結んで挟み撃ちを図る", kind: "bold", desc: "遠い東晋に使者を送る。", preview: "東晋と同盟(友好度+30)し、前秦と戦争" },
      ],
      dai: [
        { id: "yield", label: "降伏する", kind: "historic", desc: "代王は老い、内紛もある。", preview: "前秦が征服を選べば、国は併合される" },
        { id: "resist", label: "草原へ退いて抵抗する", kind: "alt", desc: "遊牧の機動力で戦う。", preview: "併合されず、戦争になる" },
        { id: "ally", label: "鉄弗部・東晋と結ぶ", kind: "bold", desc: "敵の敵と手を組む。", preview: "東晋と同盟(友好度+30)し、前秦と戦争" },
      ],
    },
    apply: (x, r, p) => {
      const qin = r.qin!;
      const out: string[] = [];
      if (p.qin === "south") {
        const jin = jinOf(x.c);
        if (jin) x.c.setRelation(qin, jin, "war");
        return "前秦は西北を後回しにし、東晋に宣戦した";
      }
      for (const role of ["liang", "dai"] as const) {
        const f = r[role];
        if (!f) continue;
        if (p.qin === "tribute") {
          const res = x.c.diplo.act(qin, f, "vassal");
          out.push(`${name(f)}は${res.ok ? "臣従した" : "従属を拒んだ"}`);
        } else if (p[role] === "ally") {
          const jin = jinOf(x.c);
          if (jin) {
            x.c.diplo.addAmity(f, jin, 30);
            x.c.setRelation(f, jin, "alliance");
          }
          x.c.setRelation(qin, f, "war");
          out.push(`${name(f)}は東晋と結んで抵抗した`);
        } else if (p[role] === "yield" && pw(x, qin) > pw(x, f) * 3) {
          const n = name(f);
          x.c.annex(f, qin);
          out.push(`${n}は降伏し、前秦に併合された`);
        } else {
          x.c.setRelation(qin, f, "war");
          out.push(`${name(f)}は抵抗し、戦争になった`);
        }
      }
      return out.join("。");
    },
  },
  {
    id: "feishui383", name: "淝水の戦い", year: 383, month: 11, importance: "critical", battle: ["qin", "jin"],
    cond: "前秦と東晋が戦争していて、両国に軍団がある",
    place: { name: "淝水(寿春の東)", lon: 116.7, lat: 32.6 }, persons: ["fu_jian", "fu_rong", "zhu_xu", "xie_an", "xie_xuan", "xie_shi", "liu_laozhi"],
    background: "華北を統一した苻堅は、「投鞭断流(鞭を投げ込めば流れも止まる)」と号する大軍で東晋に向かった。先鋒の苻融は寿春を落とし、淝水の西岸に陣を敷いた。東晋は謝安が指揮を執り、謝石・謝玄と北府兵の劉牢之が東岸に迫る。",
    history: "383年11月、謝玄は苻融に「少し退いて我々を渡らせよ」と求めた。前秦軍が後退すると、捕らわれていた晋将朱序が「秦軍敗れたり」と叫び、全軍が崩れた。苻融は戦死し、苻堅は流れ矢を受けて敗走した。",
    sources: ["『晋書』苻堅載記・謝玄伝・謝安伝", "『資治通鑑』巻105"],
    roles: (x) => ({ qin: qinOf(x.c), jin: jinOf(x.c) }),
    done: (x) => x.c.events.some((e) => e.status === "completed" && e.histId === "feishui383"),
    ready: (x, r) => (!r.qin ? "前秦がない" : !r.jin ? "東晋がない" : !x.c.atWar(r.qin, r.jin) ? "前秦と東晋が戦争していない" : !x.h.largestArmy(r.qin) || !x.h.largestArmy(r.jin) ? "両国の軍団がそろっていない" : true),
    choices: {
      qin: [
        { id: "cross", label: "淝水の渡河を許し、決戦する", kind: "historic", desc: "晋軍を渡らせ、半ば渡ったところを討つ策。ただし後退は混乱を招く。", preview: "淝水で会戦が始まる。後退の混乱で前秦の士気が下がる(朱序が軍中にいれば、さらに下がる)" },
        { id: "careful", label: "補給を整えて慎重に進軍する", kind: "alt", desc: "後続の大軍と兵糧を待ってから進む。", preview: "前秦の軍の食糧と士気が上がる。寿春へ向けて進み、会戦は出会ったときに起こる" },
        { id: "west", label: "主力を温存し、荊州(襄陽)へ向かう", kind: "bold", desc: "淝水での決戦を避け、西から長江を目指す。", preview: "淝水の会戦は起きない。主力は襄陽へ向かう" },
      ],
      jin: [
        { id: "decisive", label: "謝玄らに決戦を命じる", kind: "historic", desc: "北府兵の精鋭で淝水を渡る。", preview: "謝玄が指揮官、劉牢之が副将となり、士気が上がる。会戦が始まる" },
        { id: "defend", label: "寿春・合肥の守りを固め、長期戦にする", kind: "alt", desc: "大軍の兵糧が尽きるのを待つ。", preview: "寿春・合肥の守備兵が増える。晋からは決戦を挑まない" },
        { id: "raid", label: "前秦の補給線を襲う(劉牢之)", kind: "bold", desc: "洛澗の勝利のように、敵の後方を突く。", preview: "前秦の軍の食糧が半減し、疲労がたまり、士気が下がる" },
      ],
    },
    ai: (x, r, role) => {
      if (role === "qin") return pw(x, r.qin) > pw(x, r.jin) * 1.5 ? (roll(x, "fs-q") < 0.65 ? "cross" : "careful") : roll(x, "fs-q2") < 0.5 ? "careful" : "west";
      return roll(x, "fs-j") < 0.7 ? "decisive" : roll(x, "fs-j2") < 0.5 ? "raid" : "defend";
    },
    apply: (x, r, p) => {
      const h = H(x);
      const qin = r.qin!;
      const jin = r.jin!;
      const place = { name: "淝水", lon: 116.7, lat: 32.6 };
      const qa = h.largestArmy(qin, place, 900);
      const ja = h.largestArmy(jin, place, 900);
      const notes: string[] = [];
      if (ja && p.jin === "decisive") {
        if (alive(x.c, "xie_xuan") && P("xie_xuan")!.factionId === jin && ja.army.commanderId !== "xie_xuan") x.c.appoint("xie_xuan", { kind: "army", id: ja.army.id });
        if (alive(x.c, "liu_laozhi") && P("liu_laozhi")!.factionId === jin && !x.c.postOf("liu_laozhi")) x.c.appoint("liu_laozhi", { kind: "deputy", id: ja.army.id });
        ja.army.morale = Math.min(100, ja.army.morale + 10);
        notes.push("謝玄が北府兵を率いる");
      }
      if (p.jin === "defend") {
        for (const id of ["shouchun", "hefei"]) {
          const city = x.c.cities.find((k) => k.id === id);
          if (city && owner(id) === jin) {
            const st = x.c.cityState(city);
            x.c.cityStates[id] = { ...st, garrison: st.garrison + 6000 };
          }
        }
        notes.push("東晋は寿春・合肥の守りを固めた");
      }
      if (qa && p.jin === "raid") {
        qa.army.food = Math.max(3, qa.army.food * 0.5);
        qa.army.fatigue = Math.min(100, qa.army.fatigue + 25);
        qa.army.morale = Math.max(10, qa.army.morale - 5);
        notes.push("劉牢之が前秦の補給線を襲った");
      }
      if (qa && p.qin === "careful") {
        qa.army.food += 40;
        qa.army.morale = Math.min(100, qa.army.morale + 5);
      }
      if (p.qin === "west") {
        const route = qa ? x.c.planRoute(qa.army.id, { lon: 112.14, lat: 32.02 }) : null;
        if (qa && route) x.c.orderMove(qa.army.id, route);
        h.flag("feishui_avoided", "1");
        notes.push("前秦の主力は淝水を避け、襄陽へ向かった");
        return notes.join("。");
      }
      const fight = p.qin === "cross" || p.jin === "decisive";
      if (!fight) {
        if (qa) {
          const route = x.c.planRoute(qa.army.id, { lon: 116.6, lat: 32.6 });
          if (route) x.c.orderMove(qa.army.id, route);
        }
        notes.push("決戦は起きず、両軍は淝水をはさんでにらみ合う");
        return notes.join("。");
      }
      if (qa && p.qin === "cross") {
        qa.army.morale = Math.max(10, qa.army.morale - 8 - (P("zhu_xu")?.factionId === qin && alive(x.c, "zhu_xu") ? 5 : 0));
        notes.push(`前秦は渡河を許すため後退する${P("zhu_xu")?.factionId === qin ? "(軍中には晋の降将・朱序がいる)" : ""}`);
      }
      // 作戦の補正:
      //  ・前秦が渡河を許して退けば、川の守りの利がなく、退くときに陣が崩れるおそれがある(朱序がいれば大きい)
      //  ・前秦の大軍は諸族の寄せ集めで、連携が悪い(6万を超えると強さ×0.88)
      //  ・北府兵は精鋭で、謝玄と劉牢之がそろえば連携がよい(×1.12)
      const jinAtt = p.jin === "decisive";
      const qinSide = jinAtt ? "defender" : "attacker";
      const zhu = P("zhu_xu")?.factionId === qin && alive(x.c, "zhu_xu");
      const qinTroops = qa ? totalTroops(qa.army) : 0;
      const qinMul = qinTroops > 60000 ? 0.88 : 1;
      const beifu = ja && ja.army.commanderId === "xie_xuan" && ja.army.deputyId === "liu_laozhi" ? 1.12 : ja?.army.commanderId === "xie_xuan" ? 1.06 : 1;
      const tnotes = [qinMul < 1 ? "前秦の大軍は諸族の寄せ集めで連携が悪い(×0.88)" : "", beifu > 1 ? `北府兵の精鋭(×${beifu})` : ""].filter(Boolean);
      const tactics = {
        attacker: jinAtt ? beifu : qinMul,
        defender: jinAtt ? qinMul : beifu,
        noRiverBonus: p.qin === "cross",
        panic: p.qin === "cross" ? qinSide as "attacker" | "defender" : undefined,
        panicRisk: p.qin === "cross" ? (zhu ? 0.6 : 0.4) : undefined,
        notes: tnotes,
      };
      // 史実では東晋が渡河して攻めた。前秦が慎重策なら、前秦が受けて立つ
      const res = jinAtt ? h.battle(ja, qa, place, "feishui383", 420, tactics) : h.battle(qa, ja, place, "feishui383", 420, tactics);
      notes.push(res);
      return notes.join("。");
    },
  },
  {
    id: "split384", name: "前秦の分裂(慕容垂の自立・後燕の建国)", year: 384, month: 1, importance: "major",
    cond: "前秦が淝水で敗れたか不安定で、慕容垂が前秦にいて、前秦に亡命していること",
    place: { name: "長安", lon: 108.87, lat: 34.31 }, persons: ["murong_chui", "yao_chang", "murong_chong", "murong_hong", "fu_jian"],
    background: "淝水の敗戦で、前秦に服していた諸族の心は離れた。慕容垂は河北の鎮撫を願い出て、姚萇・慕容沖らも機をうかがっている。",
    history: "384年、慕容垂は燕王を称し(後燕)、姚萇は万年秦王を称し(後秦)、慕容泓・慕容沖は関中で挙兵した(西燕)。385年、苻堅は姚萇に捕らえられ殺された。",
    sources: ["『晋書』苻堅載記・慕容垂載記・姚萇載記", "『資治通鑑』巻105-106"],
    roles: (x) => ({ qin: qinOf(x.c) }),
    ready: (x, r) => {
      if (!r.qin) return "前秦がない";
      if (x.h.flags.feishui_winner === r.qin) return "前秦は淝水で勝ち、安定している";
      const weak = x.h.flags.feishui_winner && x.h.flags.feishui_winner !== r.qin || (x.c.court.stability[r.qin] ?? 60) < 40;
      if (!weak) return "前秦は弱っていない(淝水の敗戦が起きていない)";
      if (x.h.flags.chui_stayed) return "慕容垂は前燕に留まったため(369年の選択)、前秦にいない";
      if (!(alive(x.c, "murong_chui") && P("murong_chui")!.factionId === r.qin)) return absent(x.c, "murong_chui", r.qin);
      return true;
    },
    choices: {
      qin: [
        { id: "allow", label: "慕容垂の河北行きを許す", kind: "historic", desc: "苻堅は恩義を信じ、慕容垂を送り出す。", preview: "慕容垂が鄴・中山で「燕(後燕)」を建てて自立する" },
        { id: "reward", label: "慕容垂を恩賞で引き留める", kind: "alt", desc: "金と官位で慕容垂をつなぎとめる。", preview: "金1,500。慕容垂の忠誠+30。後燕は生まれない" },
        { id: "purge", label: "慕容氏を粛清する", kind: "bold", desc: "王猛の遺言に従い、慕容氏を除く。", preview: "慕容暐・慕容垂らを処刑。鮮卑の人々の忠誠が大きく下がる" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const qin = r.qin!;
      const out: string[] = [];
      const tryFound = (id: string, cities: string[], state: string, title: string): void => {
        if (!alive(x.c, id) || P(id)!.factionId !== qin) return;
        const city = cities.find((c) => owner(c) === qin);
        const f = city ? h.found(id, city, state, title) : (x.c.secede(id, "自立し") ? "1" : undefined);
        if (f) out.push(`${P(id)!.name}が${state}を建てた`);
      };
      if (p.qin === "purge") {
        for (const id of ["murong_wei", "murong_chui", "murong_chong", "murong_hong"]) if (alive(x.c, id) && P(id)!.factionId === qin) x.c.court.kill(id, "execution", "慕容氏の粛清");
        for (const q of persons) if (q.people === "鮮卑") x.c.loyalty.add(q.id, -30, "慕容氏の粛清");
        x.c.court.addStability(qin, -15);
        return "慕容氏は粛清された(鮮卑の人々の心は離れた)";
      }
      if (p.qin === "reward") {
        const purse = x.c.factionStates[qin];
        if (purse) purse.gold = Math.max(0, purse.gold - 1500);
        x.c.loyalty.add("murong_chui", 30, "恩賞で引き留められる");
        return "慕容垂は引き留められた";
      }
      tryFound("murong_chui", ["ye", "zhongshan", "xindu"], "燕(後燕)", "燕王");
      return out.length ? out.join("。") : "自立を図る者はいたが、拠点を得られなかった";
    },
  },
  {
    id: "beiwei386", name: "北魏の成立(拓跋珪の代の再興)", year: 386, month: 1, importance: "major",
    cond: "拓跋珪が生きていて、どこかの国に仕えている",
    place: { name: "盛楽", lon: 111.8, lat: 40.4 }, persons: ["tuoba_gui", "liu_kuren"],
    background: "代が前秦に滅ぼされたのち、什翼犍の孫の拓跋珪は独孤部の劉庫仁のもとで育った。前秦の崩壊を機に、諸部が拓跋珪を推している。",
    history: "386年正月、拓跋珪は牛川で代王に即き、4月に魏王と改めた(北魏)。",
    sources: ["『魏書』太祖紀", "『資治通鑑』巻106"],
    roles: (x) => ({ holder: factionOfPersons(x.c, ["tuoba_gui"]) }),
    done: (_x) => P("tuoba_gui")?.role === "ruler",
    ready: (x, r) => (!alive(x.c, "tuoba_gui") ? "拓跋珪がいない" : !r.holder ? "拓跋珪の仕える国がない" : true),
    choices: {
      holder: [
        { id: "release", label: "拓跋珪の自立を認める", kind: "historic", desc: "草原の諸部に推された拓跋珪を引き留めない。", preview: "拓跋珪が盛楽(または平城)で魏を建てる" },
        { id: "keep", label: "拓跋珪を臣として重く用いる", kind: "alt", desc: "官職を与えて手元に置く。", preview: "拓跋珪の忠誠が上がる。魏は建国されない" },
        { id: "confine", label: "拓跋珪を幽閉する", kind: "bold", desc: "危険な若者を閉じ込める。", preview: "拓跋珪は捕らわれ、鮮卑の人々の忠誠が下がる" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      if (p.holder === "keep") {
        x.c.loyalty.add("tuoba_gui", 20, "重く用いられる");
        return "拓跋珪は臣として用いられ、魏は建国されなかった";
      }
      if (p.holder === "confine") {
        h.capture("tuoba_gui", r.holder!);
        for (const q of persons) if (q.people === "鮮卑") x.c.loyalty.add(q.id, -10, "拓跋珪の幽閉");
        return "拓跋珪は幽閉された";
      }
      const city = ["shengle", "pingcheng"].find((c) => owner(c) === r.holder);
      const f = city ? h.found("tuoba_gui", city, "魏(北魏)", "魏王") : (x.c.secede("tuoba_gui", "諸部に推されて自立し") ? "1" : undefined);
      return f ? "拓跋珪が魏(北魏)を建てた" : "拓跋珪は自立を図ったが、拠点を得られなかった";
    },
  },
  {
    id: "canhe395", name: "参合陂の戦い", year: 395, month: 11, importance: "major", battle: ["yan", "wei"],
    cond: "後燕(慕容垂・慕容宝の国)と北魏(拓跋珪の国)がある",
    place: { name: "参合陂", lon: 113.6, lat: 40.5 }, persons: ["murong_bao", "murong_chui", "tuoba_gui", "murong_lin"],
    background: "後燕の慕容垂は、太子の慕容宝に大軍を授けて北魏を討たせた。北魏の拓跋珪は兵を退き、後燕軍が疲れて引き返すのを待っている。",
    history: "395年11月、引き返す後燕軍は参合陂で北魏の奇襲を受けて大敗し、数万の兵が坑殺された。後燕は大きく傾いた。",
    sources: ["『魏書』太祖紀", "『晋書』慕容宝載記", "『資治通鑑』巻108"],
    roles: (x) => ({ yan: factionOfPersons(x.c, ["murong_chui", "murong_bao"], true), wei: factionOfPersons(x.c, ["tuoba_gui"], true) }),
    done: (x) => x.c.events.some((e) => e.histId === "canhe395" && e.status === "completed"),
    ready: (_x, r) => (!r.yan ? "後燕がない" : !r.wei ? "北魏がない" : true),
    choices: {
      yan: [
        { id: "expedition", label: "慕容宝に北魏遠征を命じる", kind: "historic", desc: "太子に大軍を授けて北へ。", preview: "北魏と戦争になり、大軍が北へ向かう。帰り道で奇襲を受けるおそれ" },
        { id: "defend", label: "国境を守り、北魏の出方を見る", kind: "alt", desc: "遠征を避ける。", preview: "会戦は起きない" },
        { id: "all", label: "慕容垂みずから全軍で親征する", kind: "bold", desc: "老将が自ら北へ向かう。", preview: "慕容垂が指揮し士気+10で北へ。奇襲されにくい(士気の低下が半分)" },
      ],
      wei: [
        { id: "ambush", label: "退いて誘い、参合陂で奇襲する", kind: "historic", desc: "敵の疲れを待ち、夜に襲う。", preview: "後燕の軍の士気が下がり、疲労がたまった状態で会戦になる" },
        { id: "hold", label: "盛楽を守る", kind: "alt", desc: "正面から守る。", preview: "会戦は、軍が出会ったときに起こる" },
        { id: "peace", label: "後燕に和を請う", kind: "bold", desc: "戦いを避ける。", preview: "後燕が遠征しなければ停戦" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const yan = r.yan!;
      const wei = r.wei!;
      if (p.yan === "defend") {
        if (p.wei === "peace") x.c.setRelation(yan, wei, "nonaggression");
        return p.wei === "peace" ? "後燕と北魏は和を結んだ" : "後燕は遠征を見送った";
      }
      x.c.setRelation(yan, wei, "war");
      const place = { name: "参合陂", lon: 113.6, lat: 40.5 };
      const ya = h.largestArmy(yan, place, 900);
      const wa = h.largestArmy(wei, place, 900);
      const leader = p.yan === "all" ? "murong_chui" : "murong_bao";
      if (ya && alive(x.c, leader) && P(leader)!.factionId === yan && ya.army.commanderId !== leader) x.c.appoint(leader, { kind: "army", id: ya.army.id });
      if (ya && p.yan === "all") ya.army.morale = Math.min(100, ya.army.morale + 10);
      if (p.wei === "ambush" && ya) {
        ya.army.morale = Math.max(10, ya.army.morale - (p.yan === "all" ? 8 : 15));
        ya.army.fatigue = Math.min(100, ya.army.fatigue + (p.yan === "all" ? 15 : 30));
        return `北魏は退いて後燕軍を誘った。${h.battle(wa, ya, place, "canhe395", 500)}`;
      }
      if (ya) {
        const route = x.c.planRoute(ya.army.id, place);
        if (route) x.c.orderMove(ya.army.id, route);
      }
      return "後燕の大軍が北へ向かった";
    },
  },
];
