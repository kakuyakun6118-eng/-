// 皇帝生活モード(Version 41 の仕様変更):後宮の人物・日々の行動・交流・恋愛・人間関係・重臣への委任・報告。
// 画面(3Dの宮殿)は src/palace/ にあり、ここは計算とセーブだけを持つ。
//
// 守ること:
// ・交流・恋愛の相手は、成人(18歳以上)だけ。未成年の皇子・皇女は、養育の画面だけで扱う(交流の相手にしない)。
// ・恋愛は、成人どうしの自由な意思による。告白・妃への昇格・皇后の冊立は、相手が決める。断られたら、その気持ちを尊重して時を置く。
//   地位を使った強制や、断りを無視して進める選択肢は作らない。
// ・皇帝の近親(娘・姉妹・母など)、ほかの人の妻には、恋愛の選択肢を出さない。
// ・後宮の女官(架空)は、妃に迎えるまで人物の台帳に入れない(俸禄・忠誠などの計算を変えないため)。
import { persons, scenario } from "../data";
import type { Person } from "../data/types";
import type { Campaign } from "./Campaign";
import { surnameOf } from "./loyalty";
import { chance } from "./spoils";
import { ART_GIFT, ART_LABEL, confessLine, GIFT_COST, GIFT_LABEL, giftLine, HOPE_LABEL, inviteLine, moodExpr, pick, talkLines, TEMPER_LABEL, type Art, type Expr, type Gift, type Hope, type Temper } from "./palaceText";
import { ARC_TITLE, ARCS, ENDING_LABEL, type Arc, type StoryCtx, type StoryScene, type StoryState } from "./palaceStories";

export type Area = "emperorHall" | "empressPalace" | "consortQuarters" | "ladiesStation" | "garden" | "bath" | "banquet" | "corridor";
export const AREA_LABEL: Record<Area, string> = {
  emperorHall: "皇帝の寝殿", empressPalace: "皇后の宮殿", consortQuarters: "妃たちの居所", ladiesStation: "女官の詰所",
  garden: "後宮の庭園", bath: "浴殿", banquet: "宴会場", corridor: "回廊",
};
export const SLOT_LABEL = ["朝", "昼", "夕", "夜"];

export type PalaceRank = "empress" | "consort" | "lady" | "royal" | "dowager";
export const RANK_NAME: Record<PalaceRank, string> = { empress: "皇后", consort: "妃", lady: "女官", royal: "皇族の女性", dowager: "皇太后・太后" };

export interface PalaceNpc {
  id: string;
  /** 人物の台帳のID(史実の人物、または妃に迎えた女官) */
  personId?: string;
  name: string;
  born: number;
  origin: string;
  rank: PalaceRank;
  title: string;
  temper: Temper;
  art: Art;
  likes: Gift[];
  dislikes: Gift[];
  hope: Hope;
  /** 3Dの姿(衣の色・縁取りの色・髪の形・背の高さ) */
  looks: { robe: string; trim: string; hair: number; height: number };
  intimacy: number;
  trust: number;
  romance: number;
  /** 皇帝への評価 */
  regard: number;
  jealousy: number;
  mood: number;
  bond: "none" | "lover" | "spouse";
  /** ほかの人物への気持ち(-100〜100) */
  relations: Record<string, number>;
  /** 交流の種類ごとの、最後にした日 */
  last: Record<string, number>;
  /** 断ったあと、時を置く期限の日(この日までは同じ申し出をしない) */
  coolUntil?: number;
  declined: number;
  /** 病で居所にこもっている期限の日 */
  sickUntil?: number;
  /** 宮を出た(本人の望みで) */
  left?: boolean;
  /** 打ち明けている相談(なければ undefined) */
  concern?: Concern;
  fictional: boolean;
  /** 最後に皇帝と過ごした日 */
  seen: number;
  /** 個別の物語(主要な6人。Version 53) */
  story?: StoryState;
  /** 記憶(重要な出来事。上限 30。Version 53) */
  memory?: { day: number; kind: MemoryKind; text: string; data?: string }[];
  /** いまの表情(Version 53) */
  expr?: Expr;
  /** 帰郷など、宮を離れている期限の日 */
  awayUntil?: number;
}

export type MemoryKind = "gift" | "promise" | "story" | "event";
export interface PalacePromise { id: string; npc: string; kind: string; text: string; made: number; due: number; status: "open" | "doing" | "kept" | "broken"; doneDay?: number; result?: string }

export type ConcernKind = "family" | "study" | "chief" | "leave" | "quarrel" | "heir" | "sick";
export interface Concern { kind: ConcernKind; text: string; other?: string; day: number }

export interface PalaceReport { day: number; date: string; kind: "war" | "city" | "court" | "event" | "diplomacy" | "palace" | "finance"; text: string }

export interface PalaceSave {
  active: boolean;
  factionId: string | null;
  slot: number;
  npcs: PalaceNpc[];
  reports: PalaceReport[];
  newsSeen: number;
  log: { day: number; text: string }[];
  avatar?: { x: number; z: number; facing: number };
  festivals: Record<string, number>;
  nextId: number;
  /** Version 53 */
  v?: number;
  promises?: PalacePromise[];
  talkLog?: { day: number; npc: string; text: string }[];
}

/** 交流の種類 */
export type Action = "talk" | "gift" | "garden" | "meal" | "arts" | "consult" | "confess" | "consort" | "empress";
export const ACTION_LABEL: Record<Action, string> = {
  talk: "話す", gift: "贈り物", garden: "庭園へ誘う", meal: "食事に誘う", arts: "詩歌・音楽を楽しむ", consult: "相談を聞く",
  confess: "想いを伝える", consort: "妃に迎えたいと伝える", empress: "皇后に立てたいと伝える",
};

const SURNAMES = ["王", "謝", "庾", "荀", "裴", "衛", "鍾", "陳", "楊", "羊", "杜", "何", "褚", "郗", "陸", "顧", "朱", "張", "孫", "周"];
const GIVEN = ["蘭", "婉", "蓉", "瑤", "芳", "月", "嫣", "珠", "蕙", "瑛", "柔", "静", "秀", "貞", "淑", "華", "玉", "容", "英", "姜", "霞", "綾", "雪", "春"];
const TEMPERS: Temper[] = ["gentle", "cheerful", "shy", "clever", "proud", "devoted"];
const ARTS: Art[] = ["poetry", "music", "painting", "dance", "embroidery", "herbs", "go"];
const GIFTS: Gift[] = ["silk", "jade", "incense", "books", "score", "flowers", "sweets", "brush"];
const HOPES: Hope[] = ["family", "study", "quiet", "chief", "leave", "serve", "favor"];
const ROBES = ["#7f2a2a", "#3e5f7a", "#5a7a4e", "#8a6a3a", "#6a4a7a", "#2f6a6a", "#9a5a5a", "#4a5a8a", "#7a6a4a", "#5a3a5a"];
const TRIMS = ["#d9b25a", "#e8e0d0", "#b07040", "#c8a0c0", "#a0c0b0", "#e0c890"];

const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, v));

export class PalaceSystem {
  active = false;
  factionId: string | null = null;
  slot = 0;
  npcs: PalaceNpc[] = [];
  reports: PalaceReport[] = [];
  newsSeen = 0;
  log: { day: number; text: string }[] = [];
  avatar?: { x: number; z: number; facing: number };
  festivals: Record<string, number> = {};
  nextId = 1;

  constructor(private readonly c: Campaign) {}

  private get day(): number {
    return Math.floor(this.c.day);
  }

  private year(): number {
    return this.c.calendar().year;
  }

  ruler(): Person | undefined {
    return this.factionId ? this.c.rulerOf(this.factionId) : undefined;
  }

  private note(text: string): void {
    this.log.push({ day: this.day, text: `${this.c.dateText()} ${text}` });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
  }

  // ===================== 名簿 =====================

  /** 年齢(数え方は皇室の仕組みと同じ。生年の分からない人は、皇室の仮の生年を使う) */
  ageOf(n: PalaceNpc): number {
    const p = n.personId ? persons.find((x) => x.id === n.personId) : undefined;
    const a = p ? this.c.court.age(p) : null;
    return a ?? this.year() - n.born;
  }

  /** 後宮の名簿を、いまの宮廷に合わせる(史実の女性と、女官)。皇帝生活モードに入るときと、毎日 */
  sync(): void {
    const f = this.factionId;
    const ruler = this.ruler();
    if (!f || !ruler) return;
    const cap = this.c.capitalCityOf(f);
    const court = this.c.court;
    const wives = court.spousesOf(ruler.id);
    const primary = court.primaryOf(ruler.id);
    // 史実の(または台帳にいる)女性:皇帝の妃、都にいる成人の女性
    for (const p of persons) {
      if (p.gender !== "female" || p.factionId !== f || p.id === ruler.id) continue;
      const st = this.c.personStatus(p.id);
      const known = this.npcs.find((x) => x.personId === p.id);
      const wife = wives.some((w) => w.id === p.id);
      const age = court.age(p);
      const here = wife || (cap && this.c.placement.locationOf(p.id).cityId === cap.id);
      const ok = st === "active" && !this.c.spoils.custodyOf(p.id) && here && (age === null ? wife : age >= 18);
      if (!ok) {
        if (known && !known.left) known.left = true;
        continue;
      }
      const kin = court.isCloseKin(ruler, p);
      // 皇族の男性の妻(皇太子の妃など)も「皇族の女性」とする(女官ではない)
      const royalWife = court.spousesOf(p.id).some((h) => h.id !== ruler.id && (court.isRoyal(h) || court.isCloseKin(ruler, h)));
      const rank: PalaceRank = wife ? (primary?.id === p.id ? "empress" : "consort") : kin && (court.motherOf(ruler.id) === p.id || /太后/.test(p.title)) ? "dowager" : kin || royalWife ? "royal" : "lady";
      if (known) {
        known.left = false;
        // 君主が代わり、前の君主の妃だった人は、いまの皇帝の妃ではない(Version 53)
        if (!wife && known.bond === "spouse") known.bond = "none";
        known.rank = rank;
        known.title = this.titleOf(p, rank);
        if (wife) known.bond = "spouse";
        continue;
      }
      this.npcs.push(this.fromPerson(p, rank, wife));
    }
    // 女官(架空):都市の数に応じて8〜14人。宮廷の規模で決まる
    const cities = this.c.cities.filter((x) => x.kind !== "pass" && scenario.cityOwners[x.id] === f).length;
    const want = 8 + Math.min(6, Math.floor(cities / 8));
    const ladies = this.npcs.filter((x) => x.fictional && !x.personId && !x.left).length;
    for (let i = ladies; i < want; i++) this.npcs.push(this.newLady(f, i));
  }

  private titleOf(p: Person, rank: PalaceRank): string {
    if (rank === "empress") return "皇后";
    if (rank === "consort") return p.title && /妃|夫人|貴|嬪|側室/.test(p.title) ? p.title.replace("側室", "妃") : "妃";
    return p.title || RANK_NAME[rank];
  }

  private seedOf(id: string, k: string): number {
    return chance(`${this.factionId}|${id}|${k}`);
  }

  private traitsFor(id: string): Pick<PalaceNpc, "temper" | "art" | "likes" | "dislikes" | "hope" | "looks"> {
    const r = (k: string): number => this.seedOf(id, k);
    const temper = pick(TEMPERS, r("t"));
    const art = pick(ARTS, r("a"));
    const liked = ART_GIFT[art];
    const second = pick(GIFTS.filter((g) => g !== liked), r("g2"));
    const dis = pick(GIFTS.filter((g) => g !== liked && g !== second), r("g3"));
    return {
      temper, art, likes: [liked, second], dislikes: [dis], hope: pick(HOPES, r("h")),
      looks: { robe: pick(ROBES, r("rb")), trim: pick(TRIMS, r("tr")), hair: Math.floor(r("hr") * 4), height: 1.52 + r("ht") * 0.12 },
    };
  }

  private fromPerson(p: Person, rank: PalaceRank, wife: boolean): PalaceNpc {
    const t = this.traitsFor(p.id);
    const loy = this.c.loyalty.loyalty[p.id] ?? 60;
    const city = p.residence ? this.c.cities.find((x) => x.id === p.residence)?.name : undefined;
    const born = p.born ?? this.year() - (this.c.court.age(p) ?? 25);
    return {
      id: `pn_${p.id}`, personId: p.id, name: p.name, born, origin: `${p.people ?? ""}${city ? `・${city}` : ""}` || "不明", rank, title: this.titleOf(p, rank), ...t,
      looks: { ...t.looks, robe: rank === "empress" ? "#8a1f1f" : rank === "dowager" ? "#4a2a5a" : t.looks.robe, trim: rank === "empress" ? "#e8c860" : t.looks.trim },
      intimacy: wife ? 45 : 10, trust: wife ? Math.round(loy * 0.6) : 15, romance: wife ? 40 + Math.round((loy - 50) / 3) : 0, regard: Math.round(40 + (loy - 50) / 2),
      jealousy: 0, mood: 60, bond: wife ? "spouse" : "none", relations: {}, last: {}, declined: 0, fictional: !!p.fictional, seen: this.day,
    };
  }

  private newLady(f: string, i: number): PalaceNpc {
    const id = `lady_${f}_${this.nextId++}`;
    const r = (k: string): number => this.seedOf(id, k);
    const used = new Set(this.npcs.map((x) => x.name));
    let name = "";
    for (let k = 0; k < 40 && !name; k++) {
      const n = pick(SURNAMES, r(`s${k}`)) + pick(GIVEN, r(`g${k}`));
      if (!used.has(n)) name = n;
    }
    const mine = this.c.cities.filter((x) => x.kind !== "pass" && scenario.cityOwners[x.id] === f);
    const origin = mine.length ? pick(mine, r("o")).name : "都";
    const t = this.traitsFor(id);
    return {
      id, name: name || `女官${i + 1}`, born: this.year() - (18 + Math.floor(r("age") * 13)), origin, rank: "lady", title: pick(["女官", "女史", "宮人", "尚服の女官", "尚食の女官"], r("ti")),
      ...t, intimacy: 5, trust: 10, romance: 0, regard: 45 + Math.round(r("rg") * 15), jealousy: 0, mood: 60, bond: "none", relations: {}, last: {}, declined: 0, fictional: true, seen: -999,
    };
  }

  /** 宮殿に入るとき:名簿を合わせ、人どうしの気持ちのはじめの値を決める */
  begin(): void {
    this.sync();
    this.initRelations();
    this.assignStories();
  }

  /** 宮にいる成人の人物(交流できる人) */
  present(): PalaceNpc[] {
    return this.npcs.filter((n) => !n.left && !(n.awayUntil !== undefined && n.awayUntil > this.day) && this.ageOf(n) >= 18);
  }

  npc(id: string): PalaceNpc | undefined {
    return this.npcs.find((n) => n.id === id);
  }

  /** 恋愛の選択肢を出せる相手か(成人どうし・近親でない・ほかの人の妻でない・皇太后などでない)。出せないときは理由 */
  romanceBlock(n: PalaceNpc): string | null {
    const ruler = this.ruler();
    if (!ruler) return "君主がいません";
    if (ruler.gender === "female") return "このモードの恋愛は、いまは男性の君主だけに用意しています";
    const ra = this.c.court.age(ruler);
    if (ra !== null && ra < 18) return "陛下はまだ成人していません";
    if (this.ageOf(n) < 18) return "成人していない人とは、恋愛の関係になりません";
    const p = n.personId ? persons.find((x) => x.id === n.personId) : undefined;
    if (p && this.c.court.spousesOf(p.id).some((h) => h.id !== ruler.id)) return "ほかの人の妻です";
    if (p && this.c.court.isCloseKin(ruler, p)) return "近親とは、恋愛の関係になりません";
    if (n.rank === "dowager" || n.rank === "royal") return "皇族の女性とは、恋愛の関係になりません";
    return null;
  }

  // ===================== 一日の居場所 =====================

  /** その時刻にいる場所と、していること */
  whereAt(n: PalaceNpc, slot = this.slot, day = this.day): { area: Area; doing: string } {
    if (n.sickUntil !== undefined && n.sickUntil >= day) return { area: n.rank === "lady" ? "ladiesStation" : n.rank === "empress" ? "empressPalace" : "consortQuarters", doing: "病で休んでいる" };
    const r = chance(`${n.id}|${day}|${slot}|where`);
    const home: Area = n.rank === "empress" || n.rank === "dowager" || n.rank === "royal" ? "empressPalace" : n.rank === "consort" ? "consortQuarters" : "ladiesStation";
    const artPlace: Area = n.art === "music" || n.art === "dance" ? "banquet" : n.art === "herbs" ? "garden" : n.art === "poetry" || n.art === "painting" ? "corridor" : "garden";
    let area: Area = home;
    if (slot === 0) area = n.rank === "lady" && r < 0.35 ? (r < 0.15 ? "emperorHall" : "bath") : home;
    else if (slot === 1) area = r < 0.45 ? "garden" : r < 0.7 ? artPlace : r < 0.85 ? "corridor" : home;
    else if (slot === 2) area = r < 0.35 ? artPlace : r < 0.6 ? "banquet" : r < 0.8 ? "corridor" : home;
    else area = r < 0.12 ? "corridor" : home;
    const doing = ({
      emperorHall: "寝殿の調度を整えている", empressPalace: n.rank === "lady" ? "皇后の宮で用を務めている" : "宮で書を読んでいる", consortQuarters: "居所でくつろいでいる",
      ladiesStation: pick(["衣を繕っている", "帳簿をつけている", "ほかの女官と話している"], r), garden: n.art === "herbs" ? "薬草の手入れをしている" : pick(["花を眺めている", "池のほとりを歩いている", "木陰で休んでいる"], r),
      bath: "湯殿の支度を整えている", banquet: n.art === "music" ? "琴を弾いている" : n.art === "dance" ? "舞の稽古をしている" : "宴の支度を手伝っている",
      corridor: n.art === "poetry" ? "回廊で詩を口ずさんでいる" : n.art === "painting" ? "柱の影で筆を動かしている" : "回廊を歩いている",
    } as Record<Area, string>)[area];
    return { area, doing: `${ART_LABEL[n.art]}が好き・${doing}` };
  }

  // ===================== 交流 =====================

  /** その交流ができるか。できないときは理由(断りの理由ではなく、選べない理由) */
  canDo(n: PalaceNpc, a: Action): string | null {
    if (n.left) return "宮にいません";
    if (this.ageOf(n) < 18) return "成人していない人とは交流しません(子女は養育の画面で)";
    if (n.sickUntil !== undefined && n.sickUntil >= this.day && a !== "talk") return "病で休んでいます(見舞いの言葉をかけることはできます)";
    if ((a === "garden" || a === "meal") && this.slot === 3) return "夜は誘えません";
    if (a === "consult" && !n.concern) return n.trust < 30 ? "まだ打ち明けるほど打ち解けていません" : "いまは相談ごとはないようです";
    if (a === "confess" || a === "consort" || a === "empress") {
      const b = this.romanceBlock(n);
      if (b) return b;
      if (n.coolUntil !== undefined && n.coolUntil > this.day) return `${n.name}は先日、気持ちを伝えてくれました。その気持ちを尊重し、${n.coolUntil - this.day}日ほど時を置きます`;
    }
    if (a === "confess" && n.bond !== "none") return "すでに想いの通じた間柄です";
    if (a === "confess" && (n.intimacy < 40 || n.trust < 30)) return "まだ、そこまで親しくありません";
    if (a === "consort") {
      if (n.bond === "spouse") return "すでに妃です";
      if (n.bond !== "lover") return "まず、互いの想いが通じてから";
    }
    if (a === "empress") {
      if (n.rank !== "consort") return "妃でなければ、皇后には立てられません";
      const ruler = this.ruler()!;
      const pri = this.c.court.primaryOf(ruler.id);
      if (pri) return `皇后(${pri.name})がいます。皇后は一人だけです`;
    }
    return null;
  }

  private once(n: PalaceNpc, a: string): number {
    // 同じ日の同じ交流は、効き目が小さい(何度も繰り返して上げることはできない)
    const k = n.last[a] === this.day ? 0.2 : 1;
    n.last[a] = this.day;
    n.seen = this.day;
    return k;
  }

  /** 寵愛のしるし:ほかの、皇帝に想いを寄せる人の嫉妬が少し増える */
  private favor(n: PalaceNpc, amount: number): void {
    for (const o of this.present()) {
      if (o === n || o.romance < 40) continue;
      const pride = o.temper === "proud" ? 1.6 : o.temper === "devoted" ? 1.3 : o.temper === "gentle" ? 0.6 : 1;
      o.jealousy = clamp(o.jealousy + amount * pride);
      o.relations[n.id] = clamp((o.relations[n.id] ?? 0) - amount * 0.5, -100, 100);
    }
    // 外戚:寵愛を受ける妃の一族(同じ姓・同じ民族の臣下)の忠誠が少し上がる
    if (n.bond === "spouse" && n.personId && amount >= 2) {
      const p = persons.find((x) => x.id === n.personId);
      if (p) for (const x of persons) if (x.factionId === this.factionId && x.role !== "ruler" && x.gender !== "female" && surnameOf(x) === surnameOf(p) && x.people === p.people) this.c.loyalty.add(x.id, 0.5, "一族の妃が寵愛を受ける(外戚)");
    }
  }

  private r(n: PalaceNpc, k: string): number {
    return chance(`${n.id}|${this.day}|${this.slot}|${k}`);
  }

  /** 話す */
  talk(n: PalaceNpc): { lines: string[]; effect: string } {
    const k = this.once(n, "talk");
    const rel = Object.entries(n.relations).filter(([id]) => this.npc(id) && !this.npc(id)!.left);
    const friend = rel.filter(([, v]) => v >= 30).sort((a, b) => b[1] - a[1])[0];
    const rival = rel.filter(([, v]) => v <= -25).sort((a, b) => a[1] - b[1])[0];
    const lines = talkLines({ temper: n.temper, art: n.art, hope: n.hope, slot: this.slot, romance: n.romance, regard: n.regard, trust: n.trust,
      friend: friend ? this.npc(friend[0])!.name : undefined, rival: rival ? this.npc(rival[0])!.name : undefined, r: [this.r(n, "a"), this.r(n, "b"), this.r(n, "c"), this.r(n, "d")] });
    if (n.sickUntil !== undefined && n.sickUntil >= this.day) {
      lines.splice(1, lines.length - 1, "お見舞い、ありがとうございます。少し楽になりました。");
      n.trust = clamp(n.trust + 3 * k);
    }
    // 記憶:約束・贈り物・物語・戦の情勢を、会話に織りまぜる(Version 53)
    const mem = this.memoryLine(n);
    if (mem) lines.splice(1, 0, mem.replace(/^「|」$/g, ""));
    this.talkLog.push({ day: this.day, npc: n.id, text: lines.join(" ").slice(0, 80) });
    if (this.talkLog.length > 50) this.talkLog.splice(0, this.talkLog.length - 50);
    this.visitMistress(n);
    n.expr = moodExpr(n.mood, n.jealousy, n.romance);
    const shy = n.temper === "shy" ? 0.6 : n.temper === "cheerful" ? 1.3 : 1;
    n.intimacy = clamp(n.intimacy + 3 * k * shy);
    n.trust = clamp(n.trust + 1.5 * k);
    n.regard = clamp(n.regard + 0.5 * k);
    if (n.romance > 0 || n.bond !== "none") n.romance = clamp(n.romance + 0.5 * k);
    this.maybeConcern(n);
    return { lines, effect: k < 1 ? "今日はもう十分に話しました" : "親密度が少し上がった" };
  }

  /** 贈り物(国庫の金を使う) */
  gift(n: PalaceNpc, g: Gift): { line: string; effect: string } | string {
    const purse = this.factionId ? this.c.factionStates[this.factionId] : undefined;
    const cost = GIFT_COST[g];
    if (!purse || purse.gold < cost) return `国庫の金が足りません(${GIFT_LABEL[g]}は金${cost})`;
    purse.gold -= cost;
    const k = this.once(n, "gift");
    const liked = n.likes.includes(g);
    const disliked = n.dislikes.includes(g);
    this.remember(n, "gift", `陛下から${GIFT_LABEL[g]}を贈られた`, g);
    this.visitMistress(n);
    n.expr = liked ? "joy" : disliked ? "puzzled" : "smile";
    const proud = n.temper === "proud";
    const gain = liked ? 8 : disliked ? -3 : proud && cost < 20 ? 0 : 3;
    n.intimacy = clamp(n.intimacy + gain * k);
    n.regard = clamp(n.regard + (liked ? 3 : disliked ? -1 : 1) * k);
    if (n.bond !== "none" || n.romance > 10) n.romance = clamp(n.romance + (liked ? 4 : 1) * k);
    this.favor(n, liked ? 2 : 1);
    return { line: giftLine(n.temper, liked, disliked, g), effect: liked ? "とても喜んだ" : disliked ? "あまり好みではないようだ" : "喜んだ" };
  }

  /** 誘いに応じるか(性格・信頼・機嫌で決まる。断られたら、そのまま受け止める) */
  private accepts(n: PalaceNpc, need: number): boolean {
    const t = n.temper === "cheerful" ? -8 : n.temper === "shy" ? 10 : n.temper === "proud" ? 6 : n.temper === "devoted" ? -5 : 0;
    return n.trust + n.intimacy * 0.5 + (n.mood - 60) * 0.3 >= need + t && n.jealousy < 70;
  }

  /** 庭園・食事への誘い */
  invite(n: PalaceNpc, kind: "garden" | "meal"): { line: string; ok: boolean; effect: string } {
    const ok = this.accepts(n, kind === "garden" ? 30 : 25);
    if (!ok) {
      n.last[kind] = this.day;
      return { line: inviteLine(n.temper, false, kind), ok, effect: "今日は断られた(また別の日に)" };
    }
    const k = this.once(n, kind);
    this.visitMistress(n);
    n.expr = "smile";
    n.intimacy = clamp(n.intimacy + 5 * k);
    n.trust = clamp(n.trust + (kind === "meal" ? 5 : 3) * k);
    n.mood = clamp(n.mood + 6 * k);
    if (kind === "garden" && n.bond !== "none") n.romance = clamp(n.romance + 3 * k);
    else if (kind === "garden" && n.intimacy >= 35) n.romance = clamp(n.romance + (n.temper === "devoted" ? 4 : 2) * k);
    this.favor(n, 2);
    return { line: inviteLine(n.temper, true, kind), ok, effect: kind === "garden" ? "庭園をともに歩いた" : "食事をともにした" };
  }

  /** 詩歌・音楽 */
  arts(n: PalaceNpc): { line: string; effect: string } {
    const k = this.once(n, "arts");
    const fits = n.art === "poetry" || n.art === "music" || n.art === "dance" || n.art === "painting";
    n.regard = clamp(n.regard + (fits ? 4 : 1) * k);
    n.intimacy = clamp(n.intimacy + (fits ? 4 : 2) * k);
    if (fits && n.intimacy >= 30) n.romance = clamp(n.romance + 3 * k);
    this.favor(n, fits ? 2 : 1);
    const line = fits ? ({ poetry: "一首、お聞きくださいますか。……庭の柳に、春の風を詠みました。", music: "では、一曲。……弦の音が、夜にとけてゆくようでございましょう。", dance: "袖をひるがえして舞います。お目汚しでなければ。", painting: "描きかけの蘭をお見せいたします。" } as Record<string, string>)[n.art] : `${ART_LABEL[n.art]}のほうが得意なのですが……今日はお付き合いいたします。`;
    return { line, effect: fits ? "得意な芸を楽しんでもらえて、喜んだ" : "少し打ち解けた" };
  }

  /** 相談ごとが生まれる(信頼がある人の、将来の希望や人間関係から) */
  private maybeConcern(n: PalaceNpc): void {
    if (n.concern || n.trust < 30) return;
    if (chance(`${n.id}|${this.day}|concern`) > 0.25) return;
    const rival = Object.entries(n.relations).filter(([id, v]) => v <= -40 && this.npc(id) && !this.npc(id)!.left)[0];
    if (rival && n.jealousy >= 30) {
      n.concern = { kind: "quarrel", other: rival[0], day: this.day, text: `${this.npc(rival[0])!.name}さまと、うまくいっておりませんの。` };
      return;
    }
    const k: ConcernKind | null = n.hope === "family" ? "family" : n.hope === "study" ? "study" : n.hope === "chief" ? "chief" : n.hope === "leave" ? "leave" : null;
    if (!k) return;
    const text = { family: "故郷の母が病で、薬を送りたいのですが、手立てがなくて……。", study: "書庫の書を、読ませていただくことはできませんか。", chief: "女官たちのまとめ役を、試しにさせていただけないでしょうか。", leave: "いつか宮を出て、自分の暮らしを選びたいのです。お許しいただけますか。" }[k];
    n.concern = { kind: k, day: this.day, text };
  }

  /** 相談の答えの選択肢 */
  consultOptions(n: PalaceNpc): { id: string; label: string }[] {
    const c = n.concern;
    if (!c) return [];
    const base = [{ id: "listen", label: "話を聞いて励ます" }];
    if (c.kind === "family") return [{ id: "help", label: "薬と見舞いの品を送る(金40)" }, ...base];
    if (c.kind === "study") return [{ id: "help", label: "書庫の書を読むことを許す" }, ...base];
    if (c.kind === "chief") return [{ id: "help", label: "女官のまとめ役を任せる" }, ...base];
    if (c.kind === "leave") return [{ id: "help", label: "宮を出ることを許す(本人の望みどおり)" }, { id: "later", label: "まだ決めかねる、と正直に伝える" }];
    if (c.kind === "quarrel") return [{ id: "help", label: "二人のあいだを取り持つ" }, ...base];
    if (c.kind === "heir") return [{ id: "help", label: "その子を後継者に指名する" }, { id: "later", label: "後継のことは、まだ決めないと伝える" }];
    return base;
  }

  consult(n: PalaceNpc, opt: string): { line: string; effect: string } | string {
    const c = n.concern;
    if (!c) return "相談ごとはありません";
    const k = this.once(n, "consult");
    let line = "お話を聞いてくださって、ありがとうございます。";
    let effect = "信頼が上がった";
    if (opt === "help") {
      if (c.kind === "family") {
        const purse = this.c.factionStates[this.factionId!];
        if (!purse || purse.gold < 40) return "国庫の金が足りません(金40)";
        purse.gold -= 40;
        line = "本当に……ありがとうございます。母もきっと喜びます。";
      } else if (c.kind === "study") line = "うれしゅうございます。一冊ずつ、大切に読みます。";
      else if (c.kind === "chief") {
        n.title = "尚宮(女官の長)";
        line = "務めを果たせるよう、励みます。";
      } else if (c.kind === "leave") {
        // 本人の望みどおり、宮を出る(名簿から外れる)
        n.left = true;
        n.bond = n.bond === "lover" ? "none" : n.bond;
        n.concern = undefined;
        this.note(`${n.name}が、本人の望みにより宮を出た`);
        return { line: "陛下……このご恩は忘れません。どうかお元気で。", effect: `${n.name}は宮を出ました(本人の望み)` };
      } else if (c.kind === "quarrel" && c.other) {
        const o = this.npc(c.other);
        if (o) {
          n.relations[o.id] = clamp((n.relations[o.id] ?? 0) + 25, -100, 100);
          o.relations[n.id] = clamp((o.relations[n.id] ?? 0) + 20, -100, 100);
          n.jealousy = clamp(n.jealousy - 20);
          o.jealousy = clamp(o.jealousy - 10);
          line = `${o.name}さまとも、少し話してみます。`;
          effect = `${n.name}と${o.name}の仲が少しよくなった`;
        }
      } else if (c.kind === "heir" && c.other) {
        const res = this.c.court.designateHeir(this.factionId!, c.other);
        line = "ありがとうございます、陛下。";
        effect = res;
        // ほかの、子のいる妃は、心穏やかではない
        for (const o of this.present()) if (o !== n && o.bond === "spouse") o.jealousy = clamp(o.jealousy + 15);
      }
      n.trust = clamp(n.trust + 10 * k);
      n.regard = clamp(n.regard + 6 * k);
      n.mood = clamp(n.mood + 10);
    } else if (opt === "later") {
      line = c.kind === "leave" ? "……正直にお答えくださって、ありがとうございます。" : "わかりました。陛下のお考えがあるのでしょう。";
      n.trust = clamp(n.trust + 2 * k);
      if (c.kind === "heir") n.regard = clamp(n.regard - 3);
      effect = "正直に伝えた";
    } else {
      n.trust = clamp(n.trust + 4 * k);
      n.mood = clamp(n.mood + 4);
    }
    n.concern = undefined;
    return { line, effect };
  }

  /**
   * 想いを伝える・妃に迎えたいと伝える・皇后に立てたいと伝える。相手が決める。
   * 断られたら、その気持ちを尊重して30日は同じ申し出をしない(強制・断りの無視はしない)。
   */
  propose(n: PalaceNpc, a: "confess" | "consort" | "empress"): { ok: boolean; line: string; effect: string } | string {
    const blocked = this.canDo(n, a);
    if (blocked) return blocked;
    const decide = (): { ok: boolean; why: string } => {
      const shy = n.temper === "shy" ? 5 : 0;
      if (a === "confess") {
        if (n.hope === "leave" && n.romance < 80) return { ok: false, why: "わたくしには、いつか宮を出て自分の道を選びたいという思いがございます。" };
        if (n.trust < 40) return { ok: false, why: "まだ、陛下のことをよく存じ上げないのです。" };
        if (n.romance < 50 + shy) return { ok: false, why: "いまは、そのようなお気持ちにお応えできません。" };
        if (n.jealousy >= 70) return { ok: false, why: "いまは、心が乱れております。" };
        return { ok: true, why: "" };
      }
      if (a === "consort") {
        if (n.hope === "leave" || n.hope === "study") return { ok: false, why: n.hope === "leave" ? "妃となれば、宮を出る道は閉ざされます。それは、わたくしの望みではありません。" : "妃となれば、学問の時を持てなくなります。もう少し、このままでいさせてください。" };
        if (n.romance < 70 || n.trust < 55) return { ok: false, why: "そのお話は、もう少し時をいただけませんか。" };
        return { ok: true, why: "" };
      }
      if (n.romance < 75 || n.trust < 65) return { ok: false, why: "皇后の重さを担う覚悟が、まだございません。" };
      if (n.temper === "shy" && n.regard < 70) return { ok: false, why: "わたくしには荷が重うございます。" };
      return { ok: true, why: "" };
    };
    const d = decide();
    if (!d.ok) {
      n.coolUntil = this.day + 30;
      n.declined++;
      n.regard = clamp(n.regard - 1);
      this.note(`${n.name}は、${ACTION_LABEL[a]}ことに対し、断った(本人の意思を尊重し、30日のあいだ同じ申し出はしない)`);
      return { ok: false, line: confessLine(n.temper, false, d.why), effect: "断られた。その気持ちを尊重し、しばらく時を置きます" };
    }
    const ruler = this.ruler()!;
    if (a === "confess") {
      n.bond = "lover";
      n.romance = clamp(n.romance + 10);
      this.favor(n, 6);
      this.note(`${ruler.name}と${n.name}の想いが通じた`);
      return { ok: true, line: confessLine(n.temper, true, ""), effect: "想いが通じた(恋人の間柄に)" };
    }
    if (a === "consort") {
      // 女官なら、人物の台帳に加えてから婚姻(皇室の家系図・皇位継承とつながる)
      let pid = n.personId;
      if (!pid) {
        const p = this.c.court.addPalaceLady(this.factionId!, { name: n.name, born: n.born, people: ruler.people, seed: n.id, bio: `${n.origin}出身の女官。後宮で${ruler.name}と想いを通わせ、妃に迎えられた。架空の人物(ゲームの中で生まれた・迎えた人物。史実の人物ではありません)`, title: "妃" });
        pid = p.id;
      }
      const err = this.c.court.palaceConsort(this.factionId!, pid);
      if (err) {
        if (!n.personId && pid) {
          // 台帳に加えたが婚姻できなかった:台帳から外す
          const i = persons.findIndex((x) => x.id === pid);
          if (i >= 0) persons.splice(i, 1);
          const j = this.c.court.added.findIndex((x) => x.id === pid);
          if (j >= 0) this.c.court.added.splice(j, 1);
        }
        return err;
      }
      n.personId = pid;
      n.bond = "spouse";
      n.rank = "consort";
      n.title = "妃";
      n.fictional = true;
      this.favor(n, 10);
      this.note(`${n.name}を妃に迎えた(本人の同意による)`);
      return { ok: true, line: "……お受けいたします。末永く、おそばに。", effect: `${n.name}を妃に迎えました` };
    }
    const res = this.c.court.promote(this.factionId!, n.personId!);
    if (!/立てました/.test(res)) return res;
    n.rank = "empress";
    n.title = "皇后";
    n.looks.robe = "#8a1f1f";
    n.looks.trim = "#e8c860";
    // 皇后の冊立:ほかの妃の嫉妬、宮廷の安定、外戚
    for (const o of this.present()) if (o !== n && o.bond === "spouse") { o.jealousy = clamp(o.jealousy + 20); o.relations[n.id] = clamp((o.relations[n.id] ?? 0) - 10, -100, 100); }
    this.note(`${n.name}を皇后に立てた(本人の同意による)`);
    return { ok: true, line: "身に余る大任、心してお受けいたします。", effect: `${n.name}を皇后に立てました` };
  }

  /** 宴会:宴会場で、招いた人と(国庫の金200)。季節の節句なら、喜びが大きい */
  banquet(guests: PalaceNpc[]): { text: string; effects: string[] } | string {
    const purse = this.factionId ? this.c.factionStates[this.factionId] : undefined;
    if (!purse || purse.gold < 200) return "国庫の金が足りません(宴は金200)";
    if (this.slot < 2) return "宴は夕か夜に開きます";
    const list = guests.filter((g) => !g.left && this.ageOf(g) >= 18);
    if (!list.length) return "招く人を選んでください";
    purse.gold -= 200;
    const fest = this.festivalToday();
    const bonus = fest ? 1.5 : 1;
    const effects: string[] = [];
    for (const g of list) {
      g.mood = clamp(g.mood + 8 * bonus);
      g.intimacy = clamp(g.intimacy + 3 * bonus);
      g.regard = clamp(g.regard + 2 * bonus);
      g.seen = this.day;
      for (const o of list) if (o !== g) g.relations[o.id] = clamp((g.relations[o.id] ?? 0) + (g.temper === "proud" && o.bond === "spouse" ? -1 : 3), -100, 100);
    }
    // 招かれなかった妃は、心穏やかではない
    for (const o of this.present()) if (!list.includes(o) && o.bond === "spouse") {
      o.jealousy = clamp(o.jealousy + 8);
      effects.push(`${o.name}は招かれず、寂しく思った`);
    }
    if (fest) { this.festivals[fest] = this.year(); effects.unshift(`${fest}の宴として、皆の喜びが大きかった`); }
    this.note(`宴を開いた(${list.map((g) => g.name).join("・")})${fest ? `:${fest}` : ""}`);
    return { text: `宴会場で宴を開きました(${list.length}人)。金200`, effects };
  }

  /** 季節の節句(魏晋の宮廷の年中行事。上巳の曲水の宴・七夕・重陽・元会) */
  festivalToday(): string | undefined {
    const { month } = this.c.calendar();
    const d = (this.day % 30) + 1;
    const f = month === 1 && d <= 5 ? "元会" : month === 3 && d <= 5 ? "上巳(曲水の宴)" : month === 7 && d >= 5 && d <= 9 ? "七夕" : month === 9 && d >= 7 && d <= 11 ? "重陽" : undefined;
    return f && this.festivals[f] !== this.year() ? f : undefined;
  }

  // ===================== 後宮の人間関係 =====================

  /** 人どうしの気持ちのはじめの値(同郷・性格の相性・妃どうしの張り合い) */
  private initRelations(): void {
    const list = this.present();
    const compat = (a: Temper, b: Temper): number => (a === b ? 8 : (a === "proud" && b === "cheerful") || (b === "proud" && a === "cheerful") ? -10 : (a === "gentle" || b === "gentle") ? 6 : (a === "clever" && b === "proud") || (b === "clever" && a === "proud") ? -6 : 0);
    for (const a of list) for (const b of list) {
      if (a === b || a.relations[b.id] !== undefined) continue;
      let v = compat(a.temper, b.temper) + (a.origin === b.origin ? 15 : 0) + Math.round((chance(`${a.id}|${b.id}|rel`) - 0.5) * 30);
      if (a.bond === "spouse" && b.bond === "spouse") v -= 15;
      if (a.rank === "lady" && b.rank === "empress") v += 15;
      a.relations[b.id] = clamp(v, -100, 100);
    }
  }

  /** 派閥:皇后・妃(子があれば強い)を頭に、気持ちの近い人が集まる */
  factions(): { leader: PalaceNpc; members: PalaceNpc[]; sons: string[]; power: number }[] {
    const ruler = this.ruler();
    const list = this.present();
    const heads = list.filter((n) => n.rank === "empress" || n.rank === "consort");
    const out = heads.map((h) => {
      const sons = ruler && h.personId ? this.c.court.childrenOf(ruler.id).filter((k) => this.c.court.motherOf(k.id) === h.personId && k.gender !== "female" && this.c.personStatus(k.id) !== "dead").map((k) => k.name) : [];
      return { leader: h, members: [] as PalaceNpc[], sons, power: (h.rank === "empress" ? 3 : 1) + sons.length * 2 + h.romance / 40 };
    });
    for (const n of list) {
      if (heads.includes(n)) continue;
      const best = out.map((g) => ({ g, v: n.relations[g.leader.id] ?? 0 })).sort((a, b) => b.v - a.v)[0];
      if (best && best.v >= 20) best.g.members.push(n);
    }
    for (const g of out) g.power += g.members.length * 0.5;
    return out.sort((a, b) => b.power - a.power);
  }

  /** 後継をめぐる争い:子のいる妃が2人以上いれば、張り合いが強まる。後継に関わる相談が生まれる */
  private heirTension(): void {
    const ruler = this.ruler();
    if (!ruler) return;
    const heir = this.c.court.heirOf(this.factionId!);
    const groups = this.factions().filter((g) => g.sons.length > 0);
    if (groups.length < 2) return;
    for (const g of groups) {
      const n = g.leader;
      if (n.concern || n.trust < 45) continue;
      const son = this.c.court.childrenOf(ruler.id).find((k) => this.c.court.motherOf(k.id) === n.personId && k.gender !== "female" && this.c.personStatus(k.id) !== "dead");
      if (!son || heir?.id === son.id) continue;
      if (chance(`${n.id}|${this.day}|heir`) > 0.08) continue;
      n.concern = { kind: "heir", other: son.id, day: this.day, text: `${son.name}のことで……。いずれ、後を継ぐ身として認めていただけないでしょうか。` };
      for (const o of groups) if (o !== g) n.relations[o.leader.id] = clamp((n.relations[o.leader.id] ?? 0) - 5, -100, 100);
    }
  }

  // ===================== 一日の流れ =====================

  /** 毎日の変化:嫉妬はゆっくり冷め、会えない日が続く妃は評価が下がる。病・口論・節句・後継の相談 */
  dailyTick(): void {
    this.sync();
    this.initRelations();
    const day = this.day;
    for (const n of this.present()) {
      n.jealousy = clamp(n.jealousy - 1.5);
      n.mood = clamp(n.mood + (60 - n.mood) * 0.05);
      if (n.bond === "spouse" && day - n.seen > 60) n.regard = clamp(n.regard - 0.2);
      if (n.bond === "lover" && n.romance < 30) {
        // 気持ちが離れたら、恋人の間柄は終わる(本人の意思)
        n.bond = "none";
        this.note(`${n.name}の気持ちが離れ、恋人の間柄は終わった`);
        this.report("palace", `${n.name}の気持ちが離れました`);
      }
      if (n.sickUntil === undefined || n.sickUntil < day) {
        if (chance(`${n.id}|${day}|sick`) < 0.004) {
          n.sickUntil = day + 5 + Math.floor(chance(`${n.id}|${day}|sickd`) * 6);
          this.report("palace", `${n.name}が病で伏せっています(見舞えば喜びます)`);
        }
      }
      // 嫉妬が強いと、張り合う相手と口論になる
      if (n.jealousy >= 60) {
        const rival = Object.entries(n.relations).filter(([id, v]) => v < 0 && this.npc(id) && !this.npc(id)!.left).sort((a, b) => a[1] - b[1])[0];
        if (rival && chance(`${n.id}|${day}|quarrel`) < 0.15) {
          const o = this.npc(rival[0])!;
          n.relations[o.id] = clamp((n.relations[o.id] ?? 0) - 10, -100, 100);
          o.relations[n.id] = clamp((o.relations[n.id] ?? 0) - 8, -100, 100);
          n.mood = clamp(n.mood - 10);
          this.report("palace", `${n.name}と${o.name}が口論になったようです`);
          if (!n.concern) n.concern = { kind: "quarrel", other: o.id, day, text: `${o.name}さまと、言い争いになってしまいました……。` };
        }
      }
    }
    this.heirTension();
    this.tickPromises();
    for (const n of this.npcs) {
      // 結末のあと、宮を出た人からの便り(60日ほどのち。一度だけ)
      if (n.left && n.story?.ending && !n.story.letter && this.day - n.story.last >= 60) {
        n.story.letter = this.day;
        this.report("palace", `${n.name}から便りが届きました:「${n.story.ending === "healer_out" ? "郡の医官のもとで、毎日病人を看ております" : n.story.ending === "home" ? `${n.origin}の麦が実りました。家族はみな元気です` : "宮の外で、書を読み続けております"}」`);
      }
    }
    const fest = this.festivalToday();
    if (fest && !this.reports.some((r) => r.day === day && r.text.includes(fest))) this.report("palace", `今日は${fest}です。宴会場で宴を開けば、皆が喜びます`);
  }

  /** 皇帝への報告(重要なことだけ) */
  report(kind: PalaceReport["kind"], text: string): void {
    this.reports.push({ day: this.day, date: this.c.dateText(), kind, text });
    if (this.reports.length > 120) this.reports.splice(0, this.reports.length - 120);
  }

  /** 新しい知らせのうち、自国に関わる重要なものを報告に移す */
  collectReports(): void {
    const f = this.factionId;
    const fname = scenario.factions.find((x) => x.id === f)?.name ?? "";
    const news = this.c.news;
    for (let i = Math.max(0, this.newsSeen); i < news.length; i++) {
      const t = news[i].text;
      if (!fname || !t.includes(fname)) continue;
      const kind: PalaceReport["kind"] | null = /宣戦|戦争|包囲|会戦|勝利|敗/.test(t) ? "war" : /攻め落と|陥落|奪/.test(t) ? "city" : /即位|亡くな|生まれ|正室|側室|後継|摂政/.test(t) ? "court" : /和平|同盟|従属|婚姻|使者/.test(t) ? "diplomacy" : /滅/.test(t) ? "war" : null;
      if (kind) this.reports.push({ day: news[i].day, date: t.split(" ")[0], kind, text: t.slice(t.indexOf(" ") + 1) });
    }
    this.newsSeen = news.length;
    if (this.reports.length > 120) this.reports.splice(0, this.reports.length - 120);
  }

  // ===================== 重臣(政治の委任) =====================

  /** 宰相・将軍・外交官・財政担当(その国の臣下で、いちばん能力の合う人) */
  ministers(): { role: string; person?: Person; summary: string }[] {
    const f = this.factionId;
    if (!f) return [];
    const staff = persons.filter((p) => p.factionId === f && p.role !== "ruler" && this.c.personStatus(p.id) === "active" && !this.c.spoils.custodyOf(p.id) && !this.c.court.isMinor(p) && p.gender !== "female");
    const by = (k: (p: Person) => number, not: Person[] = []): Person | undefined => staff.filter((p) => !not.includes(p)).sort((a, b) => k(b) - k(a))[0];
    const chancellor = by((p) => p.politics * 1.2 + p.intelligence * 0.5 + (p.role === "minister" ? 10 : 0));
    const general = by((p) => p.leadership * 1.2 + p.war * 0.5 + (p.role === "general" ? 10 : 0), [chancellor!].filter(Boolean));
    const envoy = by((p) => (p.diplomacy ?? p.charisma) + p.intelligence * 0.6, [chancellor!, general!].filter(Boolean));
    const treasurer = by((p) => p.politics + p.intelligence * 0.3, [chancellor!, general!, envoy!].filter(Boolean));
    const rep = this.c.economy.report(f);
    const st = this.c.factionStates[f] ?? { gold: 0, grain: 0 };
    const armies = this.c.armies.filter((s) => s.army.factionId === f);
    const wars = scenario.factions.filter((g) => g.id !== f && !g.fallen && this.c.atWar(f, g.id)).map((g) => g.name);
    const allies = scenario.factions.filter((g) => g.id !== f && !g.fallen && ["alliance", "vassal"].includes(this.c.relationOf(f, g.id))).map((g) => g.name);
    const posture = this.c.strategy.posture?.[f]?.posture;
    const stab = Math.round(this.c.court.stability[f] ?? 60);
    const last = this.c.strategy.log.filter((l) => l.factionId === f).slice(-1)[0];
    return [
      { role: "宰相", person: chancellor, summary: `国の安定 ${stab}。方針:${({ invade: "侵攻", expand: "拡大", defend: "防衛", develop: "内政", diplomacy: "外交", unify: "統一" } as Record<string, string>)[posture ?? ""] ?? "—"}` },
      { role: "将軍", person: general, summary: `軍団 ${armies.length}(兵 ${armies.reduce((s, x) => s + x.army.troops.infantry + x.army.troops.cavalry + x.army.troops.archer, 0).toLocaleString("ja-JP")}人)。戦争の相手:${wars.slice(0, 3).join("・") || "なし"}${last ? `。最近:${last.text.slice(0, 40)}` : ""}` },
      { role: "外交官", person: envoy, summary: `同盟・従属:${allies.slice(0, 3).join("・") || "なし"}` },
      { role: "財政担当", person: treasurer, summary: `国庫 金${Math.round(st.gold).toLocaleString("ja-JP")}(月${rep.net >= 0 ? "+" : ""}${rep.net})・糧${Math.round(st.grain).toLocaleString("ja-JP")}(月${rep.netGrain >= 0 ? "+" : ""}${rep.netGrain})` },
    ];
  }

  // ===================== 子女(養育) =====================

  /** 皇帝の子女(未成年は養育だけ。後宮の交流の相手には入れない) */
  children(): { p: Person; age: number | null; minor: boolean; mother?: string; edu?: string; heir: boolean }[] {
    const ruler = this.ruler();
    if (!ruler) return [];
    const heir = this.c.court.heirOf(this.factionId!);
    return this.c.court.childrenOf(ruler.id).filter((k) => this.c.personStatus(k.id) !== "dead").map((k) => {
      const age = this.c.court.age(k);
      const m = this.c.court.motherOf(k.id);
      return { p: k, age, minor: age !== null && age < 18, mother: m ? persons.find((x) => x.id === m)?.name : undefined, edu: this.c.court.edu[k.id]?.policy, heir: heir?.id === k.id };
    });
  }

  // ===================== 表示用 =====================

  /** 人物の札(画面に出す情報) */
  card(n: PalaceNpc): Record<string, string> {
    const rel = Object.entries(n.relations).filter(([id]) => this.npc(id) && !this.npc(id)!.left).sort((a, b) => b[1] - a[1]);
    const nm = (id: string): string => this.npc(id)!.name;
    return {
      名前: n.name, 年齢: `${this.ageOf(n)}歳`, 出身: n.origin, 身分: `${RANK_NAME[n.rank]}(${n.title})`, 性格: TEMPER_LABEL[n.temper],
      好み: `${ART_LABEL[n.art]}・${n.likes.map((g) => GIFT_LABEL[g]).join("・")}`, 苦手: n.dislikes.map((g) => GIFT_LABEL[g]).join("・"),
      将来の希望: n.trust >= 35 ? HOPE_LABEL[n.hope] : "(まだ打ち明けていない)",
      親しい人: rel.filter(([, v]) => v >= 30).slice(0, 2).map(([id]) => nm(id)).join("・") || "—",
      合わない人: rel.filter(([, v]) => v <= -25).slice(-2).map(([id]) => nm(id)).join("・") || "—",
      間柄: n.bond === "spouse" ? "妃(婚姻)" : n.bond === "lover" ? "想いの通じた間柄" : "—",
      出典: n.fictional ? "架空の人物(ゲームの中の人物)" : "史実の人物(性格・好みはゲームの設定)",
    };
  }

  // ===================== Version 53:個別の物語・約束・記憶 =====================

  /** 約束(皇帝が人物にした約束。果たす行動をして日数がたつまで、果たした扱いにしない) */
  promises: PalacePromise[] = [];
  /** ふだんの会話の記録(上限 50。重要な出来事は人物ごとの記憶に構造化して残す) */
  talkLog: { day: number; npc: string; text: string }[] = [];
  /** セーブの版(Version 53 で 53) */
  v = 53;

  /** 人物の記憶に残す(重要な出来事。人物ごとに上限 30) */
  remember(n: PalaceNpc, kind: MemoryKind, text: string, data?: string): void {
    (n.memory ??= []).push({ day: this.day, kind, text, data });
    if (n.memory.length > 30) n.memory.splice(0, n.memory.length - 30);
  }

  /** 主要な6人に、物語の役を割り当てる(女官は役に合う性格・好み・希望にそろえる。妃は史実の人物のまま) */
  assignStories(): void {
    const has = (a: Arc): boolean => this.npcs.some((n) => n.story?.arc === a && !n.left);
    const ladies = (): PalaceNpc[] => this.present().filter((n) => n.rank === "lady" && n.fictional && !n.personId && !n.story);
    const shape: Record<Exclude<Arc, "consort">, Pick<PalaceNpc, "temper" | "art" | "hope">> = {
      scholar: { temper: "clever", art: "poetry", hope: "study" }, ambitious: { temper: "proud", art: "go", hope: "chief" }, provincial: { temper: "shy", art: "embroidery", hope: "family" },
      attendant: { temper: "devoted", art: "music", hope: "serve" }, free: { temper: "cheerful", art: "herbs", hope: "leave" },
    };
    for (const a of ["scholar", "ambitious", "provincial", "attendant", "free"] as const) {
      if (has(a)) continue;
      const n = ladies()[0];
      if (!n) break;
      Object.assign(n, shape[a]);
      n.likes = [ART_GIFT[n.art], n.likes.find((g) => g !== ART_GIFT[n.art]) ?? "sweets"];
      n.dislikes = n.dislikes.filter((g) => !n.likes.includes(g));
      if (!n.dislikes.length) n.dislikes = [GIFTS.find((g) => !n.likes.includes(g))!];
      const flags: StoryState["flags"] = {};
      if (a === "provincial") {
        // 出身:都からいちばん遠い自国の都市(国の情勢が物語に響く)
        const cap = this.c.capitalCityOf(this.factionId!);
        const far = this.c.cities.filter((k) => k.kind !== "pass" && scenario.cityOwners[k.id] === this.factionId).sort((x, y) => (cap ? Math.hypot(y.lon - cap.lon, y.lat - cap.lat) - Math.hypot(x.lon - cap.lon, x.lat - cap.lat) : 0))[0];
        if (far) { n.origin = far.name; flags.originId = far.id; }
      }
      n.story = { arc: a, stage: 0, flags, last: -999 };
    }
    if (!has("consort")) {
      const w = this.present().find((n) => n.bond === "spouse" && !n.story) ?? this.present().find((n) => n.rank === "empress" && !n.story);
      if (w) w.story = { arc: "consort", stage: 0, flags: {}, last: -999 };
    }
    // 主に仕える女官の主:皇后、いなければ最も位の高い妃
    const att = this.npcs.find((n) => n.story?.arc === "attendant");
    if (att && (!att.story!.flags.mistress || !this.npc(String(att.story!.flags.mistress)) || this.npc(String(att.story!.flags.mistress))!.left)) {
      const m = this.present().find((n) => n.rank === "empress") ?? this.present().find((n) => n.bond === "spouse");
      if (m) att.story!.flags.mistress = m.id;
    }
  }

  /** 物語の主要な人物(6人まで) */
  mains(): PalaceNpc[] {
    return this.npcs.filter((n) => n.story);
  }

  private homeState(n: PalaceNpc): "safe" | "war" | "lost" {
    const id = n.story?.flags.originId as string | undefined;
    const city = id ? this.c.cities.find((k) => k.id === id) : undefined;
    if (!city) return "safe";
    if (scenario.cityOwners[city.id] !== this.factionId) return "lost";
    const near = this.c.armies.some((s) => this.c.atWar(this.factionId!, s.army.factionId) && Math.hypot((s.army.lon - city.lon) * 85, (s.army.lat - city.lat) * 111) < 150);
    return near ? "war" : "safe";
  }

  /** 物語の場面に渡す、いまの状態 */
  storyCtx(n: PalaceNpc): StoryCtx {
    const s = n.story!;
    const ruler = this.ruler();
    const mis = s.flags.mistress ? this.npc(String(s.flags.mistress)) : undefined;
    const p = n.personId ? persons.find((x) => x.id === n.personId) : undefined;
    const kin = p ? persons.filter((x) => x.factionId === this.factionId && x.gender !== "female" && x.role !== "ruler" && this.c.personStatus(x.id) === "active" && !this.c.court.isMinor(x) && surnameOf(x) === surnameOf(p) && x.people === p.people && x.id !== ruler?.id)
      .sort((a, b) => (this.c.loyalty.fame[b.id] ?? 0) - (this.c.loyalty.fame[a.id] ?? 0))[0] : undefined;
    const son = ruler && n.personId ? this.c.court.childrenOf(ruler.id).find((k) => this.c.court.motherOf(k.id) === n.personId && k.gender !== "female" && this.c.personStatus(k.id) !== "dead") : undefined;
    const heir = this.factionId ? this.c.court.heirOf(this.factionId) : undefined;
    const fac = this.factions()[0];
    const hist = Object.values(this.c.history.records).filter((r) => r.status === "occurred" && (r.day ?? -9999) > this.day - 360).sort((a, b) => (b.day ?? 0) - (a.day ?? 0))[0];
    const sick = this.present().find((o) => o !== n && o.sickUntil !== undefined && o.sickUntil >= this.day);
    return {
      name: n.name, emperor: ruler?.name ?? "陛下", slot: this.slot, month: this.c.calendar().month, day: this.day,
      intimacy: n.intimacy, trust: n.trust, romance: n.romance, regard: n.regard, jealousy: n.jealousy, flags: s.flags, since: s.last,
      romanceBlock: this.romanceBlock(n),
      promise: (k) => (this.promises.filter((x) => x.npc === n.id && x.kind === k).slice(-1)[0]?.status ?? "none") as ReturnType<StoryCtx["promise"]>,
      promiseResult: (k) => this.promises.filter((x) => x.npc === n.id && x.kind === k && x.status === "kept").slice(-1)[0]?.result,
      origin: n.origin, home: this.homeState(n), atWar: scenario.factions.some((g) => g.id !== this.factionId && !g.fallen && this.c.atWar(this.factionId!, g.id)),
      mistress: mis?.name, mistressJealous: !!mis && mis.jealousy >= 25,
      kin: kin?.name, son: son?.name, sonIsHeir: !!son && heir?.id === son.id, hasEmpress: !!(ruler && this.c.court.primaryOf(ruler.id)),
      strongFaction: fac ? `${fac.leader.name}の派` : undefined, recentHistory: hist ? this.c.history.def(Object.entries(this.c.history.records).find(([, r]) => r === hist)?.[0] ?? "")?.name : undefined,
      sickName: sick?.name,
    };
  }

  /** 物語の状態:次の段階に進めるか(進めないなら手がかり) */
  storyStatus(n: PalaceNpc): { arc?: Arc; title?: string; stage: number; ready: boolean; hint: string; ending?: string } {
    const s = n.story;
    if (!s) return { stage: 0, ready: false, hint: "" };
    if (s.stage >= 5) return { arc: s.arc, title: ARC_TITLE[s.arc], stage: 5, ready: false, hint: "物語は結末を迎えた", ending: s.ending };
    if (n.left) return { arc: s.arc, title: ARC_TITLE[s.arc], stage: s.stage, ready: false, hint: "宮にいない" };
    const why = ARCS[s.arc][s.stage].cond(this.storyCtx(n));
    return { arc: s.arc, title: ARC_TITLE[s.arc], stage: s.stage, ready: !why, hint: why ?? "物語が進められる" };
  }

  storyScene(n: PalaceNpc): StoryScene | null {
    const st = this.storyStatus(n);
    if (!st.ready || !n.story) return null;
    return ARCS[n.story.arc][n.story.stage].scene(this.storyCtx(n));
  }

  /** 物語の選択をする。段階が1つ進み、選択の効き目がゲームの状態に出る。結末の段階では、結末が決まる */
  storyChoose(n: PalaceNpc, choiceId: string): { text: string; expr: Expr; ending?: string } | string {
    const scene = this.storyScene(n);
    if (!scene || !n.story) return "いまは物語を進められません";
    const ch = scene.choices.find((c) => c.id === choiceId);
    if (!ch) return "その選択肢はありません";
    const x = this.storyCtx(n);
    const block = ch.need?.(x);
    if (block) return block;
    const s = n.story;
    const stage = s.stage + 1;
    s.flags[`s${stage}`] = choiceId;
    const r = this.storyEffect(n, s.arc, stage, choiceId);
    s.stage = stage;
    s.last = this.day;
    n.seen = this.day;
    this.remember(n, "story", `${ARC_TITLE[s.arc]} 第${stage}段階:${ch.label}`, `${stage}:${choiceId}`);
    if (r.ending) {
      s.ending = r.ending;
      this.note(`${n.name}の物語「${ARC_TITLE[s.arc]}」が結末を迎えた:${ENDING_LABEL[r.ending] ?? r.ending}`);
      this.report("palace", `${n.name}の物語「${ARC_TITLE[s.arc]}」:${ENDING_LABEL[r.ending] ?? r.ending}`);
    }
    return r;
  }

  private bump(n: PalaceNpc, d: Partial<Record<"intimacy" | "trust" | "romance" | "regard" | "mood" | "jealousy", number>>): void {
    for (const [k, v] of Object.entries(d) as [keyof typeof d, number][]) n[k] = clamp(n[k] + v);
  }

  private spend(gold: number): boolean {
    const purse = this.factionId ? this.c.factionStates[this.factionId] : undefined;
    if (!purse || purse.gold < gold) return false;
    purse.gold -= gold;
    return true;
  }

  /** 恋の結末:本人の同意(後宮の決まり)を通す。断られたら、友として結ぶ */
  private romanceEnd(n: PalaceNpc, fallback: string): { text: string; expr: Expr; ending: string } {
    if (this.romanceBlock(n)) return { text: "二人は、心を許した友として結ばれた。", expr: "smile", ending: fallback };
    if (n.bond === "none") {
      n.coolUntil = undefined;
      const r = this.propose(n, "confess");
      if (typeof r === "string" || !r.ok) return { text: typeof r === "string" ? r : `${r.line}(気持ちを尊重し、友として結ばれた)`, expr: "puzzled", ending: fallback };
      return { text: r.line, expr: "shy", ending: "lover" };
    }
    return { text: "これまでの想いが、いっそう深まった。", expr: "shy", ending: "lover" };
  }

  private storyEffect(n: PalaceNpc, arc: Arc, stage: number, id: string): { text: string; expr: Expr; ending?: string } {
    const f = n.story!.flags;
    const ok = (t: string, e: Expr = "smile"): { text: string; expr: Expr } => ({ text: t, expr: e });
    if (arc === "scholar") {
      if (stage === 1) {
        if (id === "praise") { this.bump(n, { intimacy: 6, trust: 4 }); return ok("「……では、続きを。春の柳を詠んだものです」"); }
        if (id === "reply") { this.bump(n, { regard: 8, intimacy: 4 }); return ok("「陛下も詩をなさるのですね!」", "joy"); }
        this.bump(n, { trust: -3, regard: -2 }); return ok("「……はい。務めに戻ります」", "sad");
      }
      if (stage === 2) {
        if (id === "lend") { this.makePromise(n, "books", "書庫の書を届ける", 20); this.bump(n, { trust: 3 }); return ok("「本当ですか……楽しみにお待ちしております」", "joy"); }
        if (id === "salon") {
          this.bump(n, { mood: 10, intimacy: 5 });
          for (const o of this.present()) if (o !== n && (o.art === "poetry" || o.art === "painting")) { n.relations[o.id] = clamp((n.relations[o.id] ?? 0) + 8, -100, 100); o.relations[n.id] = clamp((o.relations[n.id] ?? 0) + 8, -100, 100); }
          return ok("詩の会が開かれ、詩を好む女官たちとの仲が深まった。", "joy");
        }
        this.bump(n, { trust: -4 }); return ok("「……心得ました」", "sad");
      }
      if (stage === 3) {
        if (id === "post") { n.title = "女史"; this.bump(n, { trust: 10, regard: 6 }); this.c.court.addStability(this.factionId!, 1); return ok("彼女は宮中の女史(記録の役)に取り立てられた。", "joy"); }
        if (id === "marry") { this.bump(n, { trust: -5, romance: -10 }); return ok("「……家の決めたこと、ですものね」", "sad"); }
        this.bump(n, { romance: 10, intimacy: 5 }); return ok("「陛下……」", "shy");
      }
      if (stage === 4) {
        if (id === "respect") this.bump(n, { trust: 8 });
        if (id === "compile") this.bump(n, { trust: 6, regard: 4 });
        return ok(id === "free" ? "「宮を、出てもよいと……」" : "「ありがとうございます」", id === "free" ? "surprised" : "smile");
      }
      // 結末
      const broken = this.promises.some((p) => p.npc === n.id && p.status === "broken");
      if (broken && (f.s1 === "duty" || f.s2 === "duty")) return { ...ok("「陛下には、もう何も申し上げることはございません」", "sad"), ending: "distant" };
      if (f.s4 === "free" || (f.s4 === "respect" && f.s3 === "marry")) { this.leave(n, f.s4 === "free" ? "学問の道を求めて宮を出た" : "家の決めた道へ進み、宮を出た"); return { ...ok(f.s4 === "free" ? "「宮の外で、書を読み続けます。いつか、陛下に一冊をお届けします」" : "「……嫁いでも、筆は捨てません」", "smile"), ending: "leave" }; }
      if (f.s4 === "respect" && f.s3 === "heart") return this.romanceEnd(n, "friend");
      if (f.s4 === "compile") { n.title = "女史"; this.c.court.addStability(this.factionId!, 1); return { ...ok("二人は、宮の詩と記録をまとめる仲間になった。", "joy"), ending: "colleague" }; }
      n.title = n.title === "女史" ? n.title : "女史";
      return { ...ok("彼女は女史として、書と記録の道に生きることを選んだ。", "joy"), ending: "scholar" };
    }
    if (arc === "ambitious") {
      if (stage === 1) {
        if (id === "task") { this.bump(n, { trust: 6, regard: 4 }); return ok("「お任せください。一反残らず改めます」", "joy"); }
        if (id === "politics") { this.bump(n, { intimacy: 6 }); return ok("「宮中は、見えない糸だらけでございます」"); }
        this.bump(n, { regard: -5, trust: -2 }); return ok("「……かしこまりました」", "angry");
      }
      if (stage === 2) {
        const fac = this.factions()[0];
        if (id === "side" && fac) { n.relations[fac.leader.id] = clamp((n.relations[fac.leader.id] ?? 0) + 20, -100, 100); fac.leader.relations[n.id] = clamp((fac.leader.relations[n.id] ?? 0) + 10, -100, 100); return ok(`彼女は${fac.leader.name}の派に近づいた。`, "smile"); }
        if (id === "spy") { this.bump(n, { trust: 2 }); return ok("「……陛下のためなら」", "puzzled"); }
        this.bump(n, { trust: 4 }); return ok("「どこにも属さぬ、というのも勇気が要りますね」");
      }
      if (stage === 3) {
        if (id === "investigate") { this.makePromise(n, "investigate", "絹の噂を調べさせる", 15); return ok("「ありがとうございます……真実が明らかになれば」", "smile"); }
        if (id === "trust") { this.bump(n, { trust: 10 }); this.favor(n, 3); return ok("「陛下……」", "joy"); }
        this.bump(n, { trust: -15, regard: -10 }); return ok("「……」", "sad");
      }
      if (stage === 4) return ok(id === "chief" ? "「わたくしが、尚宮に……」" : id === "consort" ? "「妃に……?」" : "「自分の道、ですか」", id === "consort" ? "surprised" : "puzzled");
      if (f.s3 === "blame" && n.trust < 30) return { ...ok("「陛下のお心は、よくわかりました」", "sad"), ending: "distant" };
      if (f.s4 === "chief") { n.title = "尚宮(女官の長)"; this.c.court.addStability(this.factionId!, 2); this.bump(n, { mood: 15, regard: 8 }); return { ...ok("彼女は尚宮となり、後宮の務めを束ねることになった。", "joy"), ending: "chief" }; }
      if (f.s4 === "consort") {
        // 本人の望みは「務めで認められること」。気持ちが十分でなければ、断る(本人の意思)
        if (n.romance < 65) { this.bump(n, { trust: 3 }); return { ...ok("「お言葉はうれしゅうございます。けれど、わたくしは務めで認められたいのです」(本人の意思で、自分の道を選んだ)", "puzzled"), ending: "own" }; }
        const r = this.romanceEnd(n, "own");
        if (r.ending === "lover") {
          const c2 = this.propose(n, "consort");
          if (typeof c2 !== "string" && c2.ok) return { text: c2.line, expr: "shy", ending: "consort" };
        }
        return r;
      }
      for (const o of this.present()) if (o.rank !== "lady") n.relations[o.id] = clamp((n.relations[o.id] ?? 0) * 0.5, -100, 100);
      return { ...ok("彼女は派閥から離れ、務めに打ち込むことにした。", "smile"), ending: "own" };
    }
    if (arc === "provincial") {
      if (stage === 1) {
        if (id === "ask") { this.bump(n, { intimacy: 7 }); return ok("「麦の畑が、どこまでも続く所です」", "smile"); }
        if (id === "cheer") { this.bump(n, { trust: 3 }); return ok("「はい……慣れるよう、努めます」"); }
        return ok("彼女は、しばらく空を見ていた。", "sad");
      }
      if (stage === 2) {
        if (id === "family") { this.makePromise(n, "family", `${n.origin}の家族の様子を調べさせる`, 30); this.bump(n, { trust: 4 }); return ok("「調べて……くださるのですか」", "joy"); }
        if (id === "letter") { if (!this.spend(20)) return ok("国庫の金が足りず、文を届けられなかった。", "sad"); this.bump(n, { trust: 5 }); return ok("「文が届けば、母も安心します」", "joy"); }
        this.bump(n, { trust: 3 }); return ok("「……正直に言ってくださって、ありがとうございます」", "sad");
      }
      if (stage === 3) {
        if (id === "help") {
          const lost = (this.promises.filter((p) => p.npc === n.id && p.kind === "family" && p.status === "kept").slice(-1)[0]?.result ?? this.homeState(n)) === "lost";
          if (!this.spend(lost ? 80 : 40)) return ok("国庫の金が足りず、手を差しのべられなかった。", "sad");
          this.bump(n, { trust: 10, regard: 5 });
          return ok(lost ? "使者が行方を探し、兄が近くの城に逃れて無事だと分かった。" : "薬と見舞いの品が、故郷へ送られた。", "joy");
        }
        if (id === "visit") { n.sickUntil = undefined; n.awayUntil = this.day + 20; this.bump(n, { trust: 8, mood: 15 }); return ok("彼女は20日のあいだ、故郷へ帰ることになった。", "joy"); }
        this.bump(n, { trust: -3, romance: 3 }); return ok("「……陛下がそうおっしゃるなら」", "sad");
      }
      if (stage === 4) return ok(id === "home" ? "「故郷へ……」" : id === "bring" ? "「家族を、都へ?」" : "「陛下……」", id === "heart" ? "shy" : "surprised");
      if (f.s4 === "home") { this.leave(n, `${n.origin}へ帰り、家族のもとで暮らすことにした`); return { ...ok("「陛下のことは、故郷の空を見るたびに思い出します」", "smile"), ending: "home" }; }
      if (f.s4 === "bring") {
        if (!this.spend(200)) return { ...ok("国庫の金が足りず、家族を呼び寄せられなかった。彼女は宮にとどまっている。", "sad"), ending: "friend" };
        this.bump(n, { mood: 25, trust: 10 }); return { ...ok("家族が都へ移り、彼女は宮仕えを続けながら、休みの日に家族と会えるようになった。", "joy"), ending: "family" };
      }
      return this.romanceEnd(n, "friend");
    }
    if (arc === "attendant") {
      const m = f.mistress ? this.npc(String(f.mistress)) : undefined;
      if (stage === 1) {
        if (id === "ask") { this.bump(n, { trust: 4 }); if (m) n.relations[m.id] = clamp((n.relations[m.id] ?? 0) + 2, -100, 100); return ok(`「${m?.name ?? "主"}さまは、お健やかでございます」`); }
        if (id === "self") { this.bump(n, { intimacy: 6 }); return ok("「わたくしのこと、ですか……」", "shy"); }
        this.bump(n, { trust: -2, regard: 2 }); return ok("「主に隠しごとはいたしません」", "normal");
      }
      if (stage === 2) {
        if (id === "visit" && m) { this.makePromise(n, "visit", `${m.name}を訪ねる`, 10); return ok("「主も、お喜びになります」", "joy"); }
        if (id === "mediate" && m) { m.jealousy = clamp(m.jealousy - 10); this.bump(n, { trust: 5 }); return ok("「お心遣い、ありがとうございます」"); }
        this.bump(n, { trust: -5 }); if (m) m.regard = clamp(m.regard - 3); return ok("「……さようでございますか」", "sad");
      }
      if (stage === 3) {
        if (id === "loyal") { this.bump(n, { trust: 6 }); if (m) n.relations[m.id] = clamp((n.relations[m.id] ?? 0) + 10, -100, 100); return ok("「はい。主を裏切ることはいたしません」"); }
        if (id === "report") { this.bump(n, { trust: -3 }); return ok("「……陛下のお望みなら」", "puzzled"); }
        n.title = "寝殿の女官"; this.bump(n, { trust: 5 }); return ok("彼女は、皇帝の寝殿の務めに移った。", "smile");
      }
      if (stage === 4) return ok("「……考えます」", "puzzled");
      // 結末:訴えの真相(主の嫉妬が強いと、主にも非があった)
      const guilty = !!m && m.jealousy >= 25;
      if (f.s4 === "truth") {
        if (m && guilty) {
          m.regard = clamp(m.regard - 6);
          this.c.court.addStability(this.factionId!, -2);
          const mp = m.personId ? persons.find((x) => x.id === m.personId) : undefined;
          if (mp) for (const x of persons) if (x.factionId === this.factionId && x.gender !== "female" && x.role !== "ruler" && surnameOf(x) === surnameOf(mp) && x.people === mp.people) this.c.loyalty.add(x.id, -3, "一族の妃に呪詛の疑い");
          return { ...ok(`彼女の証言で、${m.name}にも非があったことが分かった。${m.name}の立場は揺らいだが、彼女は陛下の信を得た。`, "sad"), ending: "confidant" };
        }
        if (m) m.regard = clamp(m.regard + 6);
        return { ...ok(`彼女の証言で、${m?.name ?? "主"}の潔白が明らかになった。`, "joy"), ending: "loyal" };
      }
      if (f.s4 === "protect") { if (m) n.relations[m.id] = clamp((n.relations[m.id] ?? 0) + 15, -100, 100); return { ...ok("彼女は主を守り抜き、主との絆はいっそう深まった。", "smile"), ending: "loyal" }; }
      if (f.s3 === "transfer") return { ...ok("寝殿に移った彼女は、陛下の身のまわりを任される腹心となった。", "smile"), ending: "confidant" };
      if (n.trust < 35) { this.leave(n, "板挟みに疲れ、宮仕えを退いた"); return { ...ok("「わたくしは、宮を下がらせていただきます」", "sad"), ending: "leave" }; }
      return { ...ok("彼女は自分の判断で真実を語り、主のもとに残った。", "normal"), ending: "loyal" };
    }
    if (arc === "consort") {
      const x = this.storyCtx(n);
      const kin = x.kin ? persons.find((p) => p.name === x.kin && p.factionId === this.factionId) : undefined;
      if (stage === 1) {
        if (id === "kin") { this.bump(n, { intimacy: 4 }); if (kin) this.c.loyalty.add(kin.id, 1, "妃が一族のことを陛下に話す"); return ok("「家の者たちが聞いたら、喜びます」"); }
        if (id === "life") { this.bump(n, { trust: 5 }); return ok("「お気遣い、うれしゅうございます」", "smile"); }
        this.bump(n, { regard: -3 }); return ok("「心得ております」", "normal");
      }
      if (stage === 2) {
        if (id === "appoint" && kin) {
          // 外戚の取り立て:太守のいない自国の都市(無ければ小さな都市)に任じる。一族の忠誠は上がり、ほかの臣下は不満、国の安定は少し下がる
          const city = this.c.cities.filter((k) => k.kind !== "pass" && scenario.cityOwners[k.id] === this.factionId && !this.c.cityStates[k.id]?.governorId).sort((a, b) => (a.population ?? 0) - (b.population ?? 0))[0];
          const err = city ? this.c.appoint(kin.id, { kind: "city", id: city.id }) : "任じる都市がない";
          if (!err) {
            this.c.loyalty.add(kin.id, 10, "妃の口添えで太守に取り立てられる");
            for (const p of persons.filter((q) => q.factionId === this.factionId && q.role !== "ruler" && q.id !== kin.id && q.gender !== "female").slice(0, 8)) this.c.loyalty.add(p.id, -1, "外戚の取り立て");
            this.c.court.addStability(this.factionId!, -2);
            this.bump(n, { trust: 8, regard: 6 });
            this.report("court", `${kin.name}を${city!.name}の太守に取り立てた(外戚の取り立て)`);
            return ok(`${kin.name}は${city!.name}の太守に取り立てられた。`, "joy");
          }
          return ok(`取り立てはできなかった(${err})。`, "sad");
        }
        if (id === "chancellor") { this.makePromise(n, "chancellor", "宰相に諮る", 15); return ok("「陛下のよいように」"); }
        if (id === "mother") { this.bump(n, { mood: 12, trust: 5 }); return ok("「母も、どんなに喜ぶことか」", "joy"); }
        if (id === "gift") { if (!this.spend(40)) return ok("国庫の金が足りなかった。", "sad"); this.bump(n, { trust: 6 }); return ok("「ありがとうございます」", "joy"); }
        this.bump(n, { regard: n.temper === "clever" ? 0 : -5, trust: n.temper === "clever" ? 3 : 0 }); if (kin) this.c.loyalty.add(kin.id, -5, "取り立てを断られる"); return ok("「……わきまえております」", "sad");
      }
      if (stage === 3) {
        const son = x.son ? persons.find((p) => p.name === x.son) : undefined;
        if (id === "tutor" && son) { const tutor = persons.filter((p) => p.factionId === this.factionId && p.gender !== "female" && p.role !== "ruler" && this.c.personStatus(p.id) === "active" && !this.c.court.isMinor(p)).sort((a, b) => b.intelligence - a.intelligence)[0]; this.c.court.setEducation(son.id, "study", tutor?.id); this.bump(n, { trust: 6 }); return ok(`${son.name}に${tutor?.name ?? "師"}がつけられた。`, "joy"); }
        if (id === "talent") { this.bump(n, { trust: -3, regard: 2 }); return ok("「……陛下は、まっすぐなお方ですね」", "sad"); }
        if (id === "honest") { this.bump(n, { trust: 6 }); return ok("「話してくださって、よかった」", "smile"); }
        this.bump(n, { romance: 4, trust: 3 }); return ok("「……はい」", "shy");
      }
      if (stage === 4) {
        if (id === "heir") { const son = persons.find((p) => p.name === x.son); const r = son ? this.c.court.designateHeir(this.factionId!, son.id) : "子がいない"; for (const o of this.present()) if (o !== n && o.bond === "spouse") o.jealousy = clamp(o.jealousy + 15); this.report("court", `後継の指名:${r}`); return ok(r, "joy"); }
        if (id === "distance") { this.bump(n, { romance: -15, regard: -10 }); return ok("「……かしこまりました」", "sad"); }
        return ok(id === "empress" ? "「皇后に……」" : "「穏やかに、ですか」", id === "empress" ? "surprised" : "smile");
      }
      if (f.s4 === "heir") return { ...ok("彼女の子は後継者となり、彼女は後継の母として重んじられた。", "smile"), ending: "heir" };
      if (f.s4 === "empress") {
        n.coolUntil = undefined;
        const r = this.propose(n, "empress");
        if (typeof r !== "string" && r.ok) return { text: r.line, expr: "joy", ending: "empress" };
        return { text: typeof r === "string" ? `${r}(皇后には立てられず、穏やかな日々を過ごすことになった)` : `${r.line}(本人の意思で、いまの立場にとどまった)`, expr: "puzzled", ending: "quiet" };
      }
      if (f.s4 === "distance") return { ...ok("二人のあいだには、静かな距離ができた。", "sad"), ending: "distant" };
      return { ...ok("彼女は、陛下のそばで穏やかな日々を送ることにした。", "smile"), ending: "quiet" };
    }
    // ===== free =====
    if (stage === 1) {
      if (id === "learn") { this.bump(n, { intimacy: 6, trust: 3 }); return ok("「陛下が草の名を覚えてくださるなんて!」", "joy"); }
      if (id === "outside") { this.bump(n, { intimacy: 5, romance: 2 }); return ok("「川の向こうには、どんな町があるのでしょう」", "smile"); }
      this.bump(n, { trust: -6, regard: -5 }); return ok("「……申し訳ございません」", "sad");
    }
    if (stage === 2) {
      if (id === "doctor") { n.title = "医女見習い"; this.bump(n, { trust: 8 }); return ok("「ありがとうございます!」", "joy"); }
      if (id === "decide") { this.makePromise(n, "doctor", "侍医に話を通す", 15); return ok("「お待ちしております」", "smile"); }
      this.bump(n, { trust: -8 }); return ok("「……そう、ですか」", "angry");
    }
    if (stage === 3) {
      const x = this.storyCtx(n);
      const sick = x.sickName ? this.present().find((o) => o.name === x.sickName) : undefined;
      if (id === "nurse" || id === "together") {
        if (sick) { sick.sickUntil = this.day; sick.relations[n.id] = clamp((sick.relations[n.id] ?? 0) + 20, -100, 100); }
        this.bump(n, id === "together" ? { trust: 8, intimacy: 5 } : { trust: 8 });
        return ok(sick ? `${sick.name}は、彼女の看病で快方に向かった。` : "彼女の手当てで、多くの人が助かった。", "joy");
      }
      this.bump(n, { trust: -6, regard: -6 }); return ok("「……」", "sad");
    }
    if (stage === 4) return ok(id === "go" ? "「本当に、よろしいのですか」" : id === "stay" ? "「宮の医女……」" : "「陛下……」", id === "heart" ? "shy" : "surprised");
    if (f.s4 === "go") { this.leave(n, "郡の医官のもとで医の道を学ぶため、宮を出た"); return { ...ok("「いつか、陛下の病も治してさしあげます」", "joy"), ending: "healer_out" }; }
    if (f.s4 === "stay") {
      if (n.trust >= 50 && f.s3 !== "stop") { n.title = "医女"; this.bump(n, { mood: 10 }); return { ...ok("彼女は宮の医女として残り、後宮の病を看ることになった。", "smile"), ending: "healer_in" }; }
      this.leave(n, "本人の意思で、宮を出て医の道へ進んだ"); return { ...ok("「ごめんなさい。わたくしは、外の世界で学びたいのです」(本人の意思で宮を出た)", "puzzled"), ending: "healer_out" };
    }
    if (n.romance >= 60 && f.s3 !== "stop") return this.romanceEnd(n, "healer_in");
    this.leave(n, "本人の意思で、宮を出て医の道へ進んだ");
    return { ...ok("「陛下のお気持ち、大切に胸にしまっておきます。でも、わたくしは行きます」(本人の意思で宮を出た)", "smile"), ending: "healer_out" };
  }

  /** 宮を出る(本人の望み・結末) */
  private leave(n: PalaceNpc, why: string): void {
    n.left = true;
    if (n.bond === "lover") n.bond = "none";
    this.remember(n, "story", why);
    this.note(`${n.name}が${why}`);
  }

  // ----- 約束 -----

  makePromise(n: PalaceNpc, kind: string, text: string, dueDays: number): PalacePromise {
    const p: PalacePromise = { id: `pr${this.day}_${n.id}_${kind}`, npc: n.id, kind, text, made: this.day, due: this.day + dueDays, status: "open" };
    this.promises.push(p);
    // 済んだ古い約束は消す(上限 60)
    if (this.promises.length > 60) this.promises = this.promises.filter((x, i) => x.status === "open" || x.status === "doing" || i >= this.promises.length - 40);
    this.remember(n, "promise", `陛下が「${text}」と約束した`, kind);
    return p;
  }

  /** 約束を果たす行動(費用・日数)。visit は、主を実際に訪ねる(話す・贈り物など)と果たされる */
  static readonly FULFILL: Record<string, { label: string; gold: number; days: number } | null> = {
    books: { label: "書庫から書を届けさせる", gold: 0, days: 2 },
    family: { label: "使者を故郷へ送る(金60)", gold: 60, days: 10 },
    investigate: { label: "内侍にひそかに調べさせる", gold: 0, days: 5 },
    chancellor: { label: "宰相に諮る", gold: 0, days: 3 },
    doctor: { label: "侍医に話を通す", gold: 0, days: 3 },
    visit: null,
  };

  openPromises(n?: PalaceNpc): PalacePromise[] {
    return this.promises.filter((p) => (!n || p.npc === n.id) && (p.status === "open" || p.status === "doing"));
  }

  /** 約束を果たす行動を始める(すぐには果たされない。日数がたってから) */
  fulfill(promiseId: string): string {
    const p = this.promises.find((x) => x.id === promiseId);
    if (!p || p.status !== "open") return "その約束は、いま果たせません";
    const how = PalaceSystem.FULFILL[p.kind];
    if (!how) return "この約束は、相手を実際に訪ねることで果たされます";
    if (!this.spend(how.gold)) return `国庫の金が足りません(金${how.gold})`;
    p.status = "doing";
    p.doneDay = this.day + how.days;
    return `${how.label}。${how.days}日ほどで結果が届きます`;
  }

  /** 毎日:約束の行動が済んだら結果を出し、期限を過ぎた約束は破られたことになる */
  private tickPromises(): void {
    for (const p of this.promises) {
      const n = this.npc(p.npc);
      if (p.status === "doing" && p.doneDay !== undefined && this.day >= p.doneDay) {
        p.status = "kept";
        if (p.kind === "family" && n) p.result = this.homeState(n);
        if (p.kind === "investigate") p.result = "絹は、病に倒れた同輩の薬代に回されていたと分かりました";
        if (p.kind === "chancellor" && n) {
          const x = this.storyCtx(n);
          const kin = persons.find((q) => q.name === x.kin && q.factionId === this.factionId);
          p.result = kin && (kin.politics >= 55 || kin.leadership >= 60) ? `${kin.name}の才なら取り立てに異論はない` : "外戚を重く用いることには反対している";
        }
        if (n) {
          this.bump(n, { trust: 8, regard: 5 });
          this.remember(n, "promise", `約束「${p.text}」が果たされた`, `kept:${p.kind}`);
          this.report("palace", `${n.name}との約束「${p.text}」を果たしました`);
        }
      } else if (p.status === "open" && this.day > p.due) {
        p.status = "broken";
        if (n) {
          this.bump(n, { trust: -10, regard: -5 });
          this.remember(n, "promise", `約束「${p.text}」は果たされなかった`, `broken:${p.kind}`);
          this.report("palace", `${n.name}との約束「${p.text}」を果たせませんでした`);
        }
      }
    }
  }

  /** 主を訪ねる約束:主と実際に交流すると果たされる */
  private visitMistress(m: PalaceNpc): void {
    for (const p of this.promises) {
      if (p.kind !== "visit" || p.status !== "open") continue;
      const n = this.npc(p.npc);
      if (n?.story?.flags.mistress !== m.id) continue;
      p.status = "kept";
      p.result = `${m.name}を訪ねた`;
      this.bump(n, { trust: 8 });
      this.remember(n, "promise", `陛下は約束どおり${m.name}を訪ねた`, "kept:visit");
    }
  }

  /** 会話に、記憶(贈り物・約束・物語の選択・戦の情勢)を織りまぜる */
  private memoryLine(n: PalaceNpc): string | null {
    const open = this.openPromises(n)[0];
    if (open) return open.status === "doing" ? `「${open.text}のこと、手を打ってくださったと聞きました」` : `「${open.text}というお約束、覚えていらっしゃいますか」`;
    const mem = [...(n.memory ?? [])].reverse();
    const kept = mem.find((m) => m.data?.startsWith("kept:") && this.day - m.day < 40);
    if (kept) return `「${kept.text.replace(/^約束「|」が果たされた$/g, "")}……あのことは、本当にうれしゅうございました」`;
    const broken = mem.find((m) => m.data?.startsWith("broken:") && this.day - m.day < 60);
    if (broken) return "「……お約束のことは、もうよいのです」";
    const gift = mem.find((m) => m.kind === "gift" && this.day - m.day < 30);
    if (gift && chance(`${n.id}|${this.day}|gm`) < 0.6) return `「先日いただいた${gift.data ? GIFT_LABEL[gift.data as Gift] ?? "品" : "品"}、大切にしております」`;
    if (n.story?.arc === "provincial" && this.homeState(n) !== "safe") return `「${n.origin}のあたりで戦があると聞きました。家族は無事でしょうか」`;
    const atWar = scenario.factions.some((g) => g.id !== this.factionId && !g.fallen && this.c.atWar(this.factionId!, g.id));
    if (atWar && (n.temper === "gentle" || n.temper === "devoted") && chance(`${n.id}|${this.day}|war`) < 0.3) return "「戦の知らせを聞くたび、陛下のお体が心配になります」";
    return null;
  }

  // ===================== セーブ =====================

  serialize(): PalaceSave {
    return JSON.parse(JSON.stringify({ active: this.active, factionId: this.factionId, slot: this.slot, npcs: this.npcs, reports: this.reports, newsSeen: this.newsSeen, log: this.log, avatar: this.avatar, festivals: this.festivals, nextId: this.nextId, v: 53, promises: this.promises, talkLog: this.talkLog })) as PalaceSave;
  }

  restore(save: PalaceSave | undefined): void {
    const s = save ? (JSON.parse(JSON.stringify(save)) as PalaceSave) : undefined;
    this.active = s?.active ?? false;
    this.factionId = s?.factionId ?? null;
    this.slot = s?.slot ?? 0;
    this.npcs = s?.npcs ?? [];
    this.reports = s?.reports ?? [];
    this.newsSeen = s?.newsSeen ?? 0;
    this.log = s?.log ?? [];
    this.avatar = s?.avatar;
    this.festivals = s?.festivals ?? {};
    this.nextId = s?.nextId ?? 1;
    // Version 52 のセーブには、物語・約束・記憶が無い:空のまま始め、宮殿に入るときに物語の役を割り当てる
    this.promises = s?.promises ?? [];
    this.talkLog = s?.talkLog ?? [];
    this.v = 53;
  }
}
