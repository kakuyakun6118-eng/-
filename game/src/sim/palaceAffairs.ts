// Version 53 第4工程:後宮の人間関係の種類・寵愛への反応(性格で違う)・皇后と妃の立場・宮廷の事件・皇后の廃立。
// 事件は、乱数だけでは起こさない。人物の気持ち・立場・皇帝の行い・国の様子が「条件」を満たしたときに起こり得る。
// 選んだ結果は、宮の中の気持ちだけでなく、国の安定度・臣下の忠誠・国庫・官職・後継の能力に反映する。
// 皇后の廃立は、婚姻の記録(正室→側室)と後宮の身分だけを変える。人物・婚姻・子・家系図は消さない。
import { persons, scenario } from "../data";
import type { Person } from "../data/types";
import type { Campaign } from "./Campaign";
import { surnameOf } from "./loyalty";
import { chance } from "./spoils";
import type { PalaceNpc, PalaceSystem } from "./palace";

export type TieKind = "friend" | "trust" | "rival" | "jealous" | "faction" | "kin" | "master" | "servant";
export const TIE_LABEL: Record<TieKind, string> = { friend: "親しい", trust: "信頼している", rival: "張り合う", jealous: "妬んでいる", faction: "同じ派閥", kin: "一族", master: "仕えている主", servant: "仕えてくれる人" };

export type IncidentKind = "ladyConflict" | "empressConsort" | "rumor" | "gift" | "inlaw" | "heirEdu" | "inform" | "remonstrance" | "deposition";
export const INCIDENT_LABEL: Record<IncidentKind, string> = {
  ladyConflict: "女官どうしの対立", empressConsort: "皇后と妃の対立", rumor: "後宮の噂", gift: "贈り物をめぐる騒ぎ", inlaw: "外戚の任官の求め",
  heirEdu: "後継の教育をめぐる争い", inform: "密告", remonstrance: "重臣の諫言", deposition: "皇后の廃立の問題",
};
export const INCIDENT_KINDS = Object.keys(INCIDENT_LABEL) as IncidentKind[];

export interface PalaceIncident {
  id: string;
  kind: IncidentKind;
  day: number;
  /** この日までに決めなければ、放っておいた結果になる */
  due: number;
  /** 起きた理由(条件) */
  cause: string;
  /** 関わる後宮の人物 */
  people: string[];
  /** 関わる臣下・皇子(人物の台帳のID) */
  persons: string[];
  text: string;
  choices: { id: string; label: string }[];
  status: "open" | "resolved" | "lapsed";
  chose?: string;
  result?: string;
  /** 国の数字に反映したこと */
  effects: string[];
}

export type FavorReaction = "jealous" | "sad" | "glad" | "ally" | "calm" | "rival";
export const REACTION_LABEL: Record<FavorReaction, string> = { jealous: "嫉妬した", sad: "寂しく思った", glad: "喜んだ", ally: "近づこうとした", calm: "気にしなかった", rival: "張り合う気持ちを強めた" };

export interface AffairsSave {
  incidents: PalaceIncident[];
  trust: Record<string, Record<string, number>>;
  serves: Record<string, string>;
  deposed: { npc: string; person?: string; day: number }[];
  spend: { day: number; gold: number }[];
  palaceDays: number;
  lastInc: Partial<Record<IncidentKind, number>>;
  lastGift?: { npc: string; day: number };
  counts: Record<string, number>;
  nextId: number;
}

const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, v));

export class PalaceAffairs {
  incidents: PalaceIncident[] = [];
  /** 人物どうしの信頼(-100〜100。好き嫌いの relations とは別) */
  trust: Record<string, Record<string, number>> = {};
  /** 女官が仕えている主(皇后・妃)の後宮のID */
  serves: Record<string, string> = {};
  deposed: { npc: string; person?: string; day: number }[] = [];
  spend: { day: number; gold: number }[] = [];
  palaceDays = 0;
  lastInc: Partial<Record<IncidentKind, number>> = {};
  lastGift?: { npc: string; day: number };
  counts: Record<string, number> = {};
  nextId = 1;
  /** 最後の寵愛への、周りの反応(画面と確かめ用) */
  lastReactions: { id: string; name: string; reaction: FavorReaction }[] = [];

  constructor(private readonly P: PalaceSystem, private readonly c: Campaign) {}

  private get day(): number {
    return Math.floor(this.c.day);
  }
  private get f(): string | null {
    return this.P.factionId;
  }
  private person(id?: string): Person | undefined {
    return id ? persons.find((x) => x.id === id) : undefined;
  }
  private name(id: string): string {
    return this.P.npc(id)?.name ?? this.person(id)?.name ?? "?";
  }
  private count(k: string): void {
    this.counts[k] = (this.counts[k] ?? 0) + 1;
  }

  // ===================== 人間関係の種類 =====================

  trustOf(a: PalaceNpc, b: PalaceNpc): number {
    const t = this.trust[a.id]?.[b.id];
    if (t !== undefined) return t;
    const v = clamp(Math.round((a.relations[b.id] ?? 0) * 0.6 + (this.isKin(a, b) ? 25 : 0) + (this.serves[a.id] === b.id || this.serves[b.id] === a.id ? 20 : 0)), -100, 100);
    (this.trust[a.id] ??= {})[b.id] = v;
    return v;
  }
  addTrust(a: PalaceNpc, b: PalaceNpc, d: number): void {
    (this.trust[a.id] ??= {})[b.id] = clamp(this.trustOf(a, b) + d, -100, 100);
  }

  /** 一族:台帳の血縁(4親等まで)、または同じ姓で同じ出身(架空の女官どうし) */
  isKin(a: PalaceNpc, b: PalaceNpc): boolean {
    if (a.personId && b.personId) {
      const d = this.c.court.bloodDistance(a.personId, b.personId);
      if (d !== null && d <= 4) return true;
    }
    return a.name[0] === b.name[0] && a.origin === b.origin;
  }

  private heads(): PalaceNpc[] {
    return this.P.present().filter((n) => n.rank === "empress" || n.rank === "consort");
  }

  /** 女官が仕える主:物語で決まった主、または、いちばん気持ちの近い皇后・妃 */
  private assignServes(): void {
    const heads = this.heads();
    for (const n of this.P.present()) {
      if (n.rank !== "lady") {
        delete this.serves[n.id];
        continue;
      }
      const cur = this.serves[n.id] ? this.P.npc(this.serves[n.id]) : undefined;
      if (cur && !cur.left && heads.includes(cur)) continue;
      const want = n.story?.flags.mistress as string | undefined;
      const pickH = (want && heads.find((h) => h.id === want)) || [...heads].sort((x, y) => (n.relations[y.id] ?? 0) - (n.relations[x.id] ?? 0))[0];
      if (pickH) this.serves[n.id] = pickH.id;
      else delete this.serves[n.id];
    }
  }

  tiesOf(a: PalaceNpc, b: PalaceNpc): TieKind[] {
    const out: TieKind[] = [];
    const rel = a.relations[b.id] ?? 0;
    if (this.isKin(a, b)) out.push("kin");
    if (this.serves[a.id] === b.id) out.push("master");
    if (this.serves[b.id] === a.id) out.push("servant");
    if (rel >= 40) out.push("friend");
    if (this.trustOf(a, b) >= 55) out.push("trust");
    const headA = a.rank === "empress" || a.rank === "consort", headB = b.rank === "empress" || b.rank === "consort";
    if ((headA && headB && rel < 10) || rel <= -30) out.push("rival");
    if (a.jealousy >= 40 && rel < 0 && b.romance >= 50) out.push("jealous");
    const g = this.P.factions();
    const ga = g.find((x) => x.leader === a || x.members.includes(a)), gb = g.find((x) => x.leader === b || x.members.includes(b));
    if (ga && ga === gb) out.push("faction");
    return out;
  }

  /** ある人物から見た、ほかの人との関係(気持ち・信頼・種類) */
  relationsOf(n: PalaceNpc): { id: string; name: string; affection: number; trust: number; ties: TieKind[] }[] {
    return this.P.present().filter((o) => o !== n).map((o) => ({ id: o.id, name: o.name, affection: Math.round(n.relations[o.id] ?? 0), trust: Math.round(this.trustOf(n, o)), ties: this.tiesOf(n, o) }))
      .filter((r) => r.ties.length || Math.abs(r.affection) >= 25).sort((a, b) => b.ties.length - a.ties.length || Math.abs(b.affection) - Math.abs(a.affection));
  }

  // ===================== 寵愛への反応(性格・関係で違う) =====================

  reactToFavor(n: PalaceNpc, amount: number): void {
    const out: typeof this.lastReactions = [];
    const myFaction = this.P.factions().find((g) => g.leader === n || g.members.includes(n));
    for (const o of this.P.present()) {
      if (o === n || this.P.ageOf(o) < 18 || o.rank === "dowager") continue;
      const rel = o.relations[n.id] ?? 0;
      const ties = this.tiesOf(o, n);
      let r: FavorReaction = "calm";
      const setRel = (d: number): void => void (o.relations[n.id] = clamp(rel + d, -100, 100));
      if (ties.includes("kin") || ties.includes("master")) {
        // 一族・仕える主が寵愛を受けるのは、わがことのように嬉しい
        o.mood = clamp(o.mood + amount * 0.8);
        setRel(amount * 0.3);
        r = "glad";
      } else if (o.romance >= 40 || o.bond !== "none") {
        const friend = rel >= 40;
        switch (o.temper) {
          case "proud": o.jealousy = clamp(o.jealousy + amount * 1.6); setRel(-amount * 0.6); r = rel < 0 ? "rival" : "jealous"; break;
          case "devoted": o.jealousy = clamp(o.jealousy + amount * 1.2); o.mood = clamp(o.mood - amount * 0.3); r = "jealous"; break;
          case "shy": o.mood = clamp(o.mood - amount * 0.6); o.jealousy = clamp(o.jealousy + amount * 0.2); r = "sad"; break;
          case "gentle": o.jealousy = clamp(o.jealousy + amount * 0.3); if (friend) { o.mood = clamp(o.mood + amount * 0.2); r = "glad"; } else r = "calm"; break;
          case "cheerful": if (friend) { o.mood = clamp(o.mood + amount * 0.3); r = "glad"; } else { o.jealousy = clamp(o.jealousy + amount * 0.7); r = "jealous"; } break;
          case "clever":
            if (myFaction && myFaction.members.includes(o)) { setRel(amount * 0.3); r = "ally"; }
            else { o.jealousy = clamp(o.jealousy + amount * 0.6); setRel(-amount * 0.3); r = "rival"; }
            break;
        }
      } else {
        // 皇帝に想いのない人:親しい人なら喜び、賢い人は寵愛を受ける人に近づく
        if (rel >= 40) { o.mood = clamp(o.mood + amount * 0.3); r = "glad"; }
        // 誇り高い人・出世を望む人は、想いがなくても、寵愛を受ける人の身分を妬む
        else if (o.temper === "proud" || o.hope === "chief") { o.jealousy = clamp(o.jealousy + amount * 0.8); setRel(-amount * 0.3); r = "jealous"; }
        else if (o.temper === "clever" && (n.rank === "empress" || n.rank === "consort")) { setRel(amount * 0.4); r = "ally"; }
      }
      out.push({ id: o.id, name: o.name, reaction: r });
    }
    this.lastReactions = out;
  }

  // ===================== 皇后・妃の立場 =====================

  /** 一族(外戚):同じ姓・同じ民族の、自国の男性の臣下 */
  familyOf(n: PalaceNpc): Person[] {
    const p = this.person(n.personId);
    if (!p || !this.f) return [];
    return persons.filter((x) => x.factionId === this.f && x.role !== "ruler" && x.gender !== "female" && x.id !== p.id && this.c.personStatus(x.id) === "active" && surnameOf(x) === surnameOf(p) && x.people === p.people && !this.c.court.isCloseKin(this.P.ruler()!, x));
  }

  sonsOf(n: PalaceNpc): Person[] {
    const ruler = this.P.ruler();
    if (!ruler || !n.personId) return [];
    return this.c.court.childrenOf(ruler.id).filter((k) => this.c.court.motherOf(k.id) === n.personId && k.gender !== "female" && this.c.personStatus(k.id) !== "dead");
  }

  isDeposed(id: string): boolean {
    return this.deposed.some((d) => d.npc === id);
  }

  standing(n: PalaceNpc): { authority: number; sons: string[]; heirMother: boolean; family: string[]; offices: number; deposed: boolean } {
    const sons = this.sonsOf(n);
    const heir = this.f ? this.c.court.heirOf(this.f) : undefined;
    const heirMother = !!heir && sons.some((s) => s.id === heir.id);
    const fam = this.familyOf(n);
    const offices = fam.filter((x) => this.c.economy.officeOf(x.id)).length;
    const deposed = this.isDeposed(n.id);
    const base = n.rank === "empress" ? 50 : n.rank === "consort" ? 20 : n.rank === "dowager" ? 40 : 0;
    const authority = Math.round(clamp(base + sons.length * 10 + (heirMother ? 20 : 0) + Math.min(20, fam.length * 3 + offices * 3) + n.romance / 5 - (deposed ? 30 : 0)));
    return { authority, sons: sons.map((s) => s.name), heirMother, family: fam.map((x) => x.name), offices, deposed };
  }

  // ===================== 後宮が国に与える揺れ(戦略AIが読む) =====================

  /** 0〜1:開いている事件・最近の廃立・後継の争い・後宮の気分 */
  unrest(): number {
    const open = this.incidents.filter((i) => i.status === "open").length;
    const recentDepose = this.deposed.some((d) => this.day - d.day < 180) ? 0.45 : 0;
    const heirs = this.P.factions().filter((g) => g.sons.length > 0).length >= 2 ? 0.15 : 0;
    const list = this.P.present();
    const mood = list.length ? list.reduce((s, n) => s + n.mood, 0) / list.length : 60;
    return Math.min(1, open * 0.15 + recentDepose + heirs + (mood < 40 ? 0.2 : 0));
  }

  spent(gold: number): void {
    this.spend.push({ day: this.day, gold });
    this.spend = this.spend.filter((s) => this.day - s.day <= 30);
  }
  private spend30(): number {
    return this.spend.filter((s) => this.day - s.day <= 30).reduce((a, s) => a + s.gold, 0);
  }

  // ===================== 事件 =====================

  open(): PalaceIncident[] {
    return this.incidents.filter((i) => i.status === "open");
  }

  /** 事件の起こる条件を確かめる。force なら確率を省く(条件は省かない。確かめ用) */
  check(kind: IncidentKind, force = false): PalaceIncident | null {
    if (!this.f || !this.P.ruler()) return null;
    if (this.open().some((i) => i.kind === kind)) return null;
    // 同じ種類の事件は時を置く(諫言は半年、廃立の議は一年。くり返しばかりにならないように)
    const cool = kind === "remonstrance" ? 180 : kind === "deposition" ? 365 : kind === "ladyConflict" || kind === "inform" ? 120 : 60;
    if (!force && this.day - (this.lastInc[kind] ?? -9999) < cool) return null;
    const roll = (p: number): boolean => force || chance(`${kind}|${this.day}|inc`) < p;
    const list = this.P.present().filter((n) => this.P.ageOf(n) >= 18);
    const mk = (o: Omit<PalaceIncident, "id" | "kind" | "day" | "due" | "status" | "effects" | "persons"> & { persons?: string[] }): PalaceIncident => {
      const inc: PalaceIncident = { id: `inc${this.nextId++}`, kind, day: this.day, due: this.day + 10, status: "open", effects: [], persons: [], ...o };
      this.incidents.push(inc);
      if (this.incidents.length > 60) this.incidents.splice(0, this.incidents.length - 60);
      this.lastInc[kind] = this.day;
      this.count(kind);
      this.P.report("palace", `【${INCIDENT_LABEL[kind]}】${o.text}`);
      for (const id of o.people) { const n = this.P.npc(id); if (n) this.P.remember(n, "event", `${INCIDENT_LABEL[kind]}:${o.text}`); }
      return inc;
    };
    const empress = list.find((n) => n.rank === "empress" && n.bond === "spouse");
    const consorts = list.filter((n) => n.rank === "consort" && n.bond === "spouse");
    switch (kind) {
      case "ladyConflict": {
        const ladies = list.filter((n) => n.rank === "lady");
        for (const a of ladies) for (const b of ladies) {
          if (a === b || (a.relations[b.id] ?? 0) > -30 || (b.relations[a.id] ?? 0) > -20) continue;
          // 同じ二人の対立は、一年は蒸し返さない
          if (!force && this.incidents.some((i) => i.kind === "ladyConflict" && i.people.includes(a.id) && i.people.includes(b.id) && this.day - i.day < 365)) continue;
          if (!roll(0.15)) return null;
          return mk({ people: [a.id, b.id], cause: `${a.name}と${b.name}の仲が悪い(気持ち ${Math.round(a.relations[b.id])} / ${Math.round(b.relations[a.id])})`, text: `女官の${a.name}と${b.name}が、勤めの割り振りをめぐって激しく言い争っています。`,
            choices: [{ id: "mediate", label: "二人の話を聞き、仲を取り持つ" }, { id: "sideA", label: `${a.name}の言い分を認める` }, { id: "separate", label: "勤め先を分ける" }] });
        }
        return null;
      }
      case "empressConsort": {
        if (!empress) return null;
        const c = consorts.find((x) => x.romance - empress.romance >= 15 || (empress.jealousy >= 50 && (empress.relations[x.id] ?? 0) < 0));
        if (!c || !roll(0.12)) return null;
        return mk({ people: [empress.id, c.id], cause: `皇帝の寵愛が${c.name}に傾いている(恋愛 ${Math.round(c.romance)} 対 ${Math.round(empress.romance)})/皇后の嫉妬 ${Math.round(empress.jealousy)}`,
          text: `皇后${empress.name}が、${c.name}の振る舞いが後宮の礼にかなわないと訴えています。${c.name}は「陛下のお召しに従っただけ」と言います。`,
          choices: [{ id: "empress", label: "皇后の言い分を認め、後宮の秩序を守る" }, { id: "consort", label: `${c.name}をかばう` }, { id: "reconcile", label: "宴を開いて二人を和解させる(金200)" }] });
      }
      case "rumor": {
        const s = list.find((x) => x.jealousy >= 55 && Object.entries(x.relations).some(([id, v]) => v <= -20 && this.P.npc(id) && !this.P.npc(id)!.left));
        if (!s) return null;
        const tid = Object.entries(s.relations).filter(([id, v]) => v <= -20 && this.P.npc(id) && !this.P.npc(id)!.left).sort((a, b) => a[1] - b[1])[0][0];
        const t = this.P.npc(tid)!;
        if (!roll(0.2)) return null;
        return mk({ people: [s.id, t.id], cause: `${s.name}の嫉妬が強く(${Math.round(s.jealousy)})、${t.name}を嫌っている`, text: `「${t.name}が、夜ごと宮の外の者と文を交わしている」という噂が、後宮に広まっています。`,
          choices: [{ id: "investigate", label: "噂の出どころを調べさせる(金30)" }, { id: "ban", label: "噂を口にすることを禁じる" }, { id: "ignore", label: "取り合わない" }] });
      }
      case "gift": {
        const g = this.lastGift && this.day - this.lastGift.day <= 5 ? this.P.npc(this.lastGift.npc) : undefined;
        if (!g) return null;
        const o = list.find((x) => x !== g && x.jealousy >= 40 && (x.relations[g.id] ?? 0) < 0);
        if (!o || !roll(0.25)) return null;
        return mk({ people: [g.id, o.id], cause: `${g.name}が陛下から贈り物を受けたばかりで、${o.name}がそれを妬んでいる(嫉妬 ${Math.round(o.jealousy)})`, text: `陛下が${g.name}に贈った品が、居所から無くなりました。${g.name}の侍女は、${o.name}の侍女を疑っています。`,
          choices: [{ id: "replace", label: "同じ品を贈り直す(金50)" }, { id: "investigate", label: "誰の仕業か調べさせる" }, { id: "dismiss", label: "騒ぎを収めるよう命じる" }] });
      }
      case "inlaw": {
        for (const h of [empress, ...consorts]) {
          if (!h || h.romance < 55) continue;
          const kin = this.familyOf(h).find((x) => !this.c.economy.officeOf(x.id));
          if (!kin || !roll(0.06)) continue;
          return mk({ people: [h.id], persons: [kin.id], cause: `${h.name}が寵愛を受け(恋愛 ${Math.round(h.romance)})、一族の${kin.name}が官職に就いていない`, text: `${h.name}の一族の${kin.name}が、官職を求めています。${h.name}も、それとなく口添えしています。`,
            choices: [{ id: "appoint", label: `${kin.name}を官職に就ける` }, { id: "gold", label: "官職ではなく、金品で報いる(金100)" }, { id: "refuse", label: "外戚の任官は認めない" }] });
        }
        return null;
      }
      case "heirEdu": {
        const heir = this.c.court.heirOf(this.f);
        const age = heir ? this.c.court.age(heir) : null;
        if (!heir || age === null || age < 6 || age > 15) return null;
        const mom = list.find((n) => n.personId === this.c.court.motherOf(heir.id));
        if (!mom || !roll(0.05)) return null;
        return mk({ people: [mom.id], persons: [heir.id], cause: `後継者${heir.name}(${age}歳)の教育を、母の${mom.name}と重臣が争っている`, text: `${mom.name}は${heir.name}に武芸を学ばせたいと願い、重臣たちは儒学の師を付けるべきだと言います。`,
          choices: [{ id: "scholar", label: "儒学の師を付ける(重臣の意見)" }, { id: "martial", label: "武芸の師を付ける(母の願い)" }, { id: "both", label: "両方を学ばせる(金80)" }] });
      }
      case "inform": {
        for (const i of list) for (const [xid, v] of Object.entries(i.relations)) {
          const x = this.P.npc(xid);
          if (!x || x.left || v > -25 || x.regard >= 35) continue;
          if (!force && this.incidents.some((k) => k.kind === "inform" && k.people[1] === x.id && this.day - k.day < 365)) continue;
          if (!roll(0.1)) return null;
          return mk({ people: [i.id, x.id], cause: `${x.name}が皇帝に不満を持ち(評価 ${Math.round(x.regard)})、${i.name}は${x.name}を嫌っている`, text: `${i.name}が密かに、「${x.name}が陛下への不満を漏らしている」と告げてきました。`,
            choices: [{ id: "believe", label: `${i.name}の言葉を信じ、${x.name}を遠ざける` }, { id: "verify", label: `${x.name}に会って、自ら確かめる` }, { id: "reprimand", label: "告げ口をたしなめる" }] });
        }
        return null;
      }
      case "remonstrance": {
        const s30 = this.spend30();
        if (this.palaceDays < 45 && s30 < 800) return null;
        const m = this.P.ministers()[0]?.person;
        if (!m || !roll(0.2)) return null;
        return mk({ people: [], persons: [m.id], cause: this.palaceDays >= 45 ? `皇帝が${this.palaceDays}日のあいだ後宮にとどまっている` : `この30日の後宮の出費が金${s30}に上る`, text: `${m.name}が上奏しました。「陛下、後宮に心を傾けすぎては、天下が乱れます。政務にお戻りください」`,
          choices: [{ id: "accept", label: "諫言を聞き入れ、出費を控える" }, { id: "praise", label: "忠言を褒めて、褒美を与える(金50)" }, { id: "reject", label: "退ける" }] });
      }
      case "deposition": {
        if (!empress || this.isDeposed(empress.id)) return null;
        const st = this.standing(empress);
        const rival = consorts.map((x) => ({ x, s: this.standing(x) })).sort((a, b) => b.s.authority - a.s.authority)[0];
        const weak = empress.regard <= 25 || empress.trust <= 20 || (rival && rival.s.authority > st.authority + 10);
        const strife = (empress.relations[rival?.x.id ?? ""] ?? 0) < -20 || this.incidents.some((i) => i.kind === "empressConsort" && this.day - i.day < 365);
        if (!rival || !weak || !strife || !roll(0.08)) return null;
        const m = this.P.ministers()[0]?.person;
        return mk({ people: [empress.id, rival.x.id], persons: m ? [m.id] : [], cause: `皇后${empress.name}の立場が弱まり(権威 ${st.authority}・評価 ${Math.round(empress.regard)})、${rival.x.name}の権威(${rival.s.authority})が上回る。皇后と妃の争いが続いている`,
          text: `宮廷で、皇后${empress.name}を廃すべきだという声が上がっています。${rival.x.name}を推す者もいます。廃すれば、宮廷が大きく揺れます。`,
          choices: [{ id: "depose", label: `${empress.name}を皇后から廃する(人物・婚姻・子はそのまま)` }, { id: "keep", label: "皇后を支え、廃立の議を退ける" }, { id: "wait", label: "いまは決めない" }] });
      }
    }
    return null;
  }

  /** 事件の選択:結果を、後宮の気持ちと国の数字に反映する */
  resolve(id: string, choice: string): string {
    const inc = this.incidents.find((i) => i.id === id && i.status === "open");
    if (!inc || !this.f) return "その件は、もう終わっています";
    if (!inc.choices.some((c) => c.id === choice) && choice !== "__lapse") return "その選択はできません";
    const f = this.f;
    const fs = this.c.factionStates[f];
    const [A, B] = inc.people.map((x) => this.P.npc(x));
    const eff = inc.effects;
    const stab = (d: number): void => { this.c.court.addStability(f, d); eff.push(`安定度${d > 0 ? "+" : ""}${d}`); };
    const loyal = (pid: string | undefined, d: number, why: string): void => { if (!pid) return; this.c.loyalty.add(pid, d, why); eff.push(`${this.name(pid)}の忠誠${d > 0 ? "+" : ""}${d}`); };
    const pay = (g: number): boolean => { if (!fs || fs.gold < g) return false; fs.gold -= g; this.spent(g); eff.push(`国庫 金-${g}`); return true; };
    const rel = (a: PalaceNpc | undefined, b: PalaceNpc | undefined, d: number): void => { if (a && b) a.relations[b.id] = clamp((a.relations[b.id] ?? 0) + d, -100, 100); };
    const mood = (n: PalaceNpc | undefined, d: number): void => { if (n) n.mood = clamp(n.mood + d); };
    let res = "";
    switch (inc.kind) {
      case "ladyConflict":
        if (choice === "mediate") { rel(A, B, 25); rel(B, A, 25); this.addTrust(A!, B!, 10); A!.trust = clamp(A!.trust + 3); B!.trust = clamp(B!.trust + 3); res = "二人は言い分を聞いてもらい、わだかまりが少し解けた"; }
        else if (choice === "sideA") { A!.trust = clamp(A!.trust + 6); B!.trust = clamp(B!.trust - 8); mood(B, -15); rel(B, A, -10); res = `${A!.name}は感謝し、${B!.name}は不満を抱いた`; }
        else if (choice === "separate") { mood(A, -3); mood(B, -3); rel(A, B, 5); rel(B, A, 5); res = "顔を合わせることが減り、騒ぎは収まった"; }
        else { rel(A, B, -10); rel(B, A, -10); stab(-1); res = "放っておかれ、二人の仲はさらに悪くなった"; }
        break;
      case "empressConsort": {
        const eKin = this.familyOf(A!)[0], cKin = this.familyOf(B!)[0];
        if (choice === "empress") { A!.regard = clamp(A!.regard + 8); mood(A, 10); mood(B, -15); B!.jealousy = clamp(B!.jealousy + 10); stab(2); loyal(cKin?.id, -4, "一族の妃が退けられる"); res = "皇后の権威が保たれ、後宮の秩序は守られた。妃は悔しく思っている"; }
        else if (choice === "consort") { mood(B, 10); A!.regard = clamp(A!.regard - 12); A!.jealousy = clamp(A!.jealousy + 15); rel(A, B, -15); stab(-3); loyal(eKin?.id, -8, "皇后が軽んじられる"); res = "妃はかばわれたが、皇后の面目は失われ、宮廷にささやきが広がった"; }
        else if (choice === "reconcile") { if (!pay(200)) return "国庫の金が足りません(金200)"; rel(A, B, 15); rel(B, A, 15); A!.jealousy = clamp(A!.jealousy - 15); B!.jealousy = clamp(B!.jealousy - 15); stab(1); res = "宴の席で、二人は杯を交わした"; }
        else { rel(A, B, -10); rel(B, A, -10); stab(-2); res = "放っておかれ、皇后と妃の溝は深まった"; }
        break;
      }
      case "rumor":
        if (choice === "investigate") { if (!pay(30)) return "国庫の金が足りません(金30)"; A!.regard = clamp(A!.regard - 5); mood(A, -10); A!.jealousy = clamp(A!.jealousy - 20); B!.trust = clamp(B!.trust + 8); mood(B, 6); for (const o of this.P.present()) if (o !== A) rel(o, A, -5); res = `噂の出どころは${A!.name}の周りだと分かった。${B!.name}の潔白が明らかになった`; }
        else if (choice === "ban") { for (const o of this.P.present()) mood(o, -2); mood(B, 3); stab(1); res = "噂は表向き消えたが、人々は口をつぐんだ"; }
        else { mood(B, -12); for (const o of this.P.present()) if (o !== B && o !== A) rel(o, B, -5); res = `噂は広まり、${B!.name}は肩身の狭い思いをしている`; }
        break;
      case "gift": {
        const guilty = B!.jealousy >= 60;
        if (choice === "replace") { if (!pay(50)) return "国庫の金が足りません(金50)"; mood(A, 10); res = `${A!.name}は新しい品を喜んだ。盗んだ者は分からないまま`; }
        else if (choice === "investigate") { if (guilty) { B!.regard = clamp(B!.regard - 8); mood(B, -12); rel(A, B, -15); res = `${B!.name}の侍女の仕業と分かった。${B!.name}は面目を失った`; } else { B!.trust = clamp(B!.trust + 5); rel(A, B, 6); rel(B, A, 6); res = `品は${A!.name}の居所の棚の奥から見つかった。${B!.name}への疑いは晴れた`; } }
        else { mood(A, -10); rel(A, B, -10); res = `騒ぎは収まったが、${A!.name}は${B!.name}を疑ったままだ`; }
        break;
      }
      case "inlaw": {
        const kin = this.person(inc.persons[0]);
        if (choice === "appoint" && kin) {
          const sys = this.c.economy.systemOf(f).offices;
          const free = sys.find((o) => !this.c.economy.canHold(kin, o) && !Object.values(this.c.economy.offices).includes(o.id)) ?? sys.find((o) => !this.c.economy.canHold(kin, o));
          const err = free ? this.c.economy.setOffice(kin.id, free.id) : "官職がない";
          if (err) { if (!pay(100)) return "就ける官職がなく、金品で報いる国庫の金も足りません"; loyal(kin.id, 6, "外戚として金品を賜る"); res = `就ける官職がなく、金品で報いた(${err})`; }
          else { eff.push(`${kin.name}が${free!.name}に就任`); loyal(kin.id, 15, "外戚として官職に就く"); mood(A, 12); stab(-3); for (const m of this.P.ministers().slice(0, 3)) if (m.person && m.person.id !== kin.id) loyal(m.person.id, -4, "外戚の重用を快く思わない"); res = `${kin.name}は${free!.name}に就いた。${A!.name}は喜んだが、重臣たちは外戚の重用を快く思っていない`; }
        } else if (choice === "gold") { if (!pay(100)) return "国庫の金が足りません(金100)"; loyal(kin?.id, 6, "外戚として金品を賜る"); mood(A, 4); res = "金品を賜り、一族はひとまず満足した"; }
        else { loyal(kin?.id, -10, "官職を求めて退けられる"); mood(A, -10); A!.regard = clamp(A!.regard - 5); stab(choice === "refuse" ? 1 : 0); res = choice === "refuse" ? "外戚の任官を認めなかった。重臣は安堵し、一族は不満を抱いた" : "返事をせずにいるうち、一族の不満がつのった"; }
        break;
      }
      case "heirEdu": {
        const heir = this.person(inc.persons[0]);
        if (!heir) { res = "後継者が、もういない"; break; }
        const up = (k: "intelligence" | "politics" | "war" | "leadership" | "charisma", d: number): void => { heir[k] = Math.min(100, heir[k] + d); eff.push(`${heir.name}の${({ intelligence: "知力", politics: "政治", war: "武力", leadership: "統率", charisma: "魅力" } as const)[k]}+${d}`); };
        if (choice === "scholar") { up("intelligence", 3); up("politics", 2); mood(A, -8); stab(1); res = `${heir.name}は儒学を学び始めた。母は少し不満そうだ`; }
        else if (choice === "martial") { up("war", 3); up("leadership", 2); mood(A, 12); A!.trust = clamp(A!.trust + 5); stab(-1); res = `${heir.name}は武芸を学び始めた。母は喜び、重臣は渋い顔をしている`; }
        else if (choice === "both") { if (!pay(80)) return "国庫の金が足りません(金80)"; up("intelligence", 2); up("war", 2); mood(A, 4); res = `${heir.name}は文武の両方を学ぶことになった`; }
        else { mood(A, -5); stab(-1); res = "決まらないまま、教育の争いが長引いた"; }
        break;
      }
      case "inform": {
        const truth = B!.regard < 35;
        if (choice === "believe") { B!.trust = clamp(B!.trust - 12); mood(B, -12); A!.trust = clamp(A!.trust + 5); rel(B, A, -20); res = `${B!.name}は遠ざけられ、${A!.name}を恨んでいる`; }
        else if (choice === "verify") { if (truth) { B!.regard = clamp(B!.regard + 8); B!.trust = clamp(B!.trust + 4); res = `${B!.name}に不満があったのは本当だった。じかに話を聞き、気持ちが和らいだ`; } else { A!.trust = clamp(A!.trust - 8); res = `${B!.name}に不満はなかった。${A!.name}の告げ口だった`; } }
        else { A!.trust = clamp(A!.trust - 6); mood(A, -8); for (const o of this.P.present()) if (o !== A) o.trust = clamp(o.trust + 1); res = "告げ口はたしなめられ、後宮の人々は安堵した"; }
        break;
      }
      case "remonstrance": {
        const m = inc.persons[0];
        if (choice === "accept") { loyal(m, 6, "諫言が聞き入れられる"); stab(3); this.spend = []; this.palaceDays = 0; res = "諫言を聞き入れた。重臣は安心し、宮廷は落ち着いた"; }
        else if (choice === "praise") { if (!pay(50)) return "国庫の金が足りません(金50)"; loyal(m, 8, "忠言を褒められる"); stab(2); this.palaceDays = 0; res = "忠言を褒め、褒美を与えた"; }
        else { loyal(m, -8, "諫言を退けられる"); stab(-3); res = "諫言を退けた。重臣たちは口を閉ざした"; }
        break;
      }
      case "deposition": {
        const E = A!, R = B;
        if (choice === "depose") { const r = this.depose(E); if (r) return r; for (const x of this.familyOf(E)) loyal(x.id, -20, "一族の皇后が廃される"); stab(-10);
          const heir = this.c.court.heirOf(f);
          if (heir && this.c.court.motherOf(heir.id) === E.personId) { loyal(heir.id, -10, "母が皇后を廃される"); stab(-5); eff.push(`後継者${heir.name}の立場が揺らぐ`); }
          if (R) { R.jealousy = clamp(R.jealousy - 10); mood(R, 8); }
          for (const o of this.P.present()) if (o !== E && o.bond === "spouse") o.jealousy = clamp(o.jealousy + 6);
          res = `${E.name}は皇后を廃された。宮廷は大きく揺れている。${E.name}は妃として後宮に残り、子との縁・家系図は変わらない`; }
        else if (choice === "keep") { E.regard = clamp(E.regard + 5); E.trust = clamp(E.trust + 6); mood(E, 10); stab(2); loyal(inc.persons[0], -2, "廃立の議を退けられる"); if (R) R.jealousy = clamp(R.jealousy + 8); res = `廃立の議を退けた。${E.name}は陛下の信に感謝している`; }
        else { stab(-1); res = "決めずにおいた。廃立の議は、くすぶり続けている"; }
        break;
      }
    }
    // 関わった人の表情:気分で決まる(会話の画面の肖像に出る)
    for (const id of inc.people) { const n = this.P.npc(id); if (n) n.expr = n.mood < 35 ? "sad" : n.mood > 70 ? "smile" : n.jealousy > 60 ? "angry" : "normal"; }
    inc.status = choice === "__lapse" ? "lapsed" : "resolved";
    inc.chose = choice;
    inc.result = res;
    for (const id of inc.people) { const n = this.P.npc(id); if (n) this.P.remember(n, "event", `${INCIDENT_LABEL[inc.kind]}の結末:${res}`); }
    this.P.report("palace", `【${INCIDENT_LABEL[inc.kind]}・結末】${res}${eff.length ? `(${eff.join("・")})` : ""}`);
    this.P.note(`${INCIDENT_LABEL[inc.kind]}:${res}`);
    return res;
  }

  /** 皇后を廃する:婚姻の記録を正室から側室に変えるだけ(人物・婚姻・子・家系図は消さない) */
  depose(n: PalaceNpc): string | null {
    const ruler = this.P.ruler();
    if (!ruler || !n.personId || !this.f) return "廃立できる皇后がいません";
    const m = this.c.diplo.marriages.find((x) => x.husband === ruler.id && x.wife === n.personId && x.kind === "primary");
    if (!m) return `${n.name}は皇后(正室)ではありません`;
    m.kind = "secondary";
    this.deposed.push({ npc: n.id, person: n.personId, day: this.day });
    n.rank = "consort";
    n.title = "廃后(もとの皇后)";
    n.mood = clamp(n.mood - 40);
    n.regard = clamp(n.regard - 30);
    this.P.remember(n, "event", "皇后の位を廃された");
    this.c.court.note(this.f, `${n.name}を皇后から廃する(妃として後宮に残る)`);
    this.c.addNews(`${scenario.factions.find((x) => x.id === this.f)?.name}で、皇后${n.name}が廃されました`);
    this.count("deposed");
    return null;
  }

  /** 毎日:女官の主を決め、事件の起こる条件を確かめ、期限を過ぎた事件を放っておいた結果にする */
  daily(): void {
    if (!this.f) return;
    this.palaceDays++;
    this.assignServes();
    // 信頼は、親しい間柄が続くと少しずつ育ち、仲の悪い間柄では少しずつ失われる
    const list = this.P.present();
    for (const a of list) for (const o of list) {
      if (a === o) continue;
      const r = a.relations[o.id] ?? 0;
      if (r >= 40) this.addTrust(a, o, 1);
      else if (r <= -30) this.addTrust(a, o, -1);
    }
    // 出世や寵愛を望むのに、長く顧みられない人は、皇帝への評価が少しずつ下がる
    for (const n of list) if ((n.hope === "chief" || n.hope === "favor") && n.bond === "none" && this.day - n.seen > 120) n.regard = clamp(n.regard - 0.1);
    // ふだんの付き合い:昼に同じ区画で過ごす人どうしは、気が合えば親しくなり、合わなければ溝が深まる
    const where = new Map(list.map((n) => [n.id, this.P.whereAt(n, 1).area]));
    for (const a of list) for (const o of list) {
      if (a === o || where.get(a.id) !== where.get(o.id)) continue;
      const r = a.relations[o.id] ?? 0;
      const x = chance(`${a.id}|${o.id}|${this.day}|mix`);
      const d = (r >= 0 ? 0.25 : -0.25) + (x - 0.5) * 0.6 - (a.jealousy >= 50 && o.romance >= 50 ? 0.3 : 0);
      a.relations[o.id] = clamp(r + d, -100, 100);
    }
    for (const inc of this.open()) if (this.day > inc.due) this.resolve(inc.id, "__lapse");
    // 事件は、7日に一つまで(宮の暮らしが事件ばかりにならないように)
    if (this.incidents.some((i) => this.day - i.day < 7)) return;
    const order = [...INCIDENT_KINDS].sort((a, b) => chance(`${a}|${this.day}|ord`) - chance(`${b}|${this.day}|ord`));
    for (const k of order) if (this.check(k)) break;
  }

  serialize(): AffairsSave {
    return JSON.parse(JSON.stringify({ incidents: this.incidents, trust: this.trust, serves: this.serves, deposed: this.deposed, spend: this.spend, palaceDays: this.palaceDays, lastInc: this.lastInc, lastGift: this.lastGift, counts: this.counts, nextId: this.nextId })) as AffairsSave;
  }

  restore(s: AffairsSave | undefined): void {
    this.incidents = s?.incidents ?? [];
    this.trust = s?.trust ?? {};
    this.serves = s?.serves ?? {};
    this.deposed = s?.deposed ?? [];
    this.spend = s?.spend ?? [];
    this.palaceDays = s?.palaceDays ?? 0;
    this.lastInc = s?.lastInc ?? {};
    this.lastGift = s?.lastGift;
    this.counts = s?.counts ?? {};
    this.nextId = s?.nextId ?? 1;
  }
}
