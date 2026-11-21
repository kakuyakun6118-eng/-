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
import { ART_GIFT, ART_LABEL, confessLine, GIFT_COST, GIFT_LABEL, giftLine, HOPE_LABEL, inviteLine, pick, talkLines, TEMPER_LABEL, type Art, type Gift, type Hope, type Temper } from "./palaceText";

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
}

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
  }

  /** 宮にいる成人の人物(交流できる人) */
  present(): PalaceNpc[] {
    return this.npcs.filter((n) => !n.left && this.ageOf(n) >= 18);
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
    if (n.rank === "dowager" || n.rank === "royal") return "皇族の女性とは、恋愛の関係になりません";
    const p = n.personId ? persons.find((x) => x.id === n.personId) : undefined;
    if (p && this.c.court.isCloseKin(ruler, p)) return "近親とは、恋愛の関係になりません";
    if (p && this.c.court.spousesOf(p.id).some((h) => h.id !== ruler.id)) return "ほかの人の妻です";
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

  // ===================== セーブ =====================

  serialize(): PalaceSave {
    return JSON.parse(JSON.stringify({ active: this.active, factionId: this.factionId, slot: this.slot, npcs: this.npcs, reports: this.reports, newsSeen: this.newsSeen, log: this.log, avatar: this.avatar, festivals: this.festivals, nextId: this.nextId })) as PalaceSave;
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
  }
}
