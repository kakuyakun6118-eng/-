// 外交:国どうしの関係・友好度・条約・従属・婚姻同盟・援軍・外交の履歴・AIの外交。
// 関係:戦争 / 敵対 / 中立 / 友好 / 不可侵 / 同盟 / 従属。戦ってよいのは「戦争」のときだけ。
// 友好度(-100〜100)は、親善・贈答・婚姻・援軍で上がり、宣戦・裏切りで下がる。
import { personMult, prodOf, factionTraitEffects, LIMITS } from "./virtualTraits";
import { persons, scenario, totalTroops } from "../data";
import type { Person } from "../data/types";
import type { ArmyState, Campaign } from "./Campaign";
import { affinity, isKin } from "./loyalty";
import { distanceKm } from "./pathfinding";
import type { Relation } from "./save";
import { chance } from "./spoils";
import relationRules from "../data/rules/diplomacyStart.json";
import familyData from "../data/rules/family.json";

type RelationNote = { rel: string; basis: "史実" | "推定"; note: string; overlord?: string };
/** そのシナリオの開始時の関係の根拠(史実/推定と、説明) */
export function relationNote(a: string, b: string): RelationNote | undefined {
  return ((relationRules as unknown as Record<string, Record<string, RelationNote>>)[scenario.id] ?? {})[[a, b].sort().join("|")];
}

export type DiploCommand = "goodwill" | "gift" | "trade" | "alliance" | "nonaggression" | "ceasefire" | "peace" | "aid" | "marriage" | "surrender" | "vassal" | "war";
export const COMMAND_LABEL: Record<DiploCommand, string> = {
  goodwill: "親善", gift: "贈答", trade: "交易協定", alliance: "同盟", nonaggression: "不可侵条約", ceasefire: "停戦", peace: "和平",
  aid: "援軍要請", marriage: "婚姻同盟", surrender: "降伏勧告", vassal: "従属要求", war: "宣戦",
};
export const RELATION_LABEL: Record<string, string> = {
  war: "戦争", hostile: "敵対", neutral: "中立", peace: "中立", friendly: "友好", nonaggression: "不可侵", alliance: "同盟", vassal: "従属",
};
export interface Marriage {
  husband: string;
  wife: string;
  kind: "primary" | "secondary";
  /** 史実の婚姻か、ゲームの中で結ばれた婚姻か */
  historic: boolean;
  day: number;
  /** 婚姻同盟のとき、結んだ2つの勢力 */
  alliance?: [string, string];
}
export interface AidMission {
  armyId: string;
  from: string;
  /** 助ける相手 */
  forFaction: string;
  target: { lon: number; lat: number; name: string };
  until: number;
  returning?: boolean;
}
export interface DiplomacySave {
  amity: Record<string, number>;
  treaties: Record<string, { kind: "alliance" | "nonaggression"; until: number }>;
  overlord: Record<string, string>;
  history: Record<string, { day: number; text: string }[]>;
  marriages: Marriage[];
  aid: AidMission[];
  counts: DiploCounts;
}
export interface DiploCounts {
  alliances: number; nonaggression: number; wars: number; peaces: number; aids: number; marriages: number; vassals: number; betrayals: number;
}

/** 史実の婚姻(人物IDの組)。ゲーム開始時に、両方が登場するシナリオで記録する */
const HISTORIC_MARRIAGES: [string, string, "primary" | "secondary"][] = [
  ["liu_yao", "yang_xianrong", "primary"], ["shi_le", "liu_shile", "primary"], ["sima_rui", "zheng_achun", "secondary"],
  ["sima_shao", "yu_wenjun", "primary"], ["liu_cong", "huyan_hou", "primary"], ["liu_cong", "liu_e", "secondary"], ["liu_cong", "jin_yuehua", "secondary"],
  ["li_xiong", "ren_lixiong", "primary"], ["tuoba_yulv", "wang_yulv", "primary"], ["shi_hu", "zheng_yingtao", "secondary"],
  ["huan_wen", "sima_xingnan", "primary"], ["huan_wen", "li_shimei", "secondary"], ["xie_an", "liu_xiean", "primary"],
  ["wang_xizhi", "xi_xuan", "primary"], ["murong_jun", "kezuhun", "primary"], ["murong_chui", "duan_chui", "primary"],
  ["sima_dan", "he_fani", "primary"], ["fu_jian", "zhang_furen", "secondary"], ["sima_yu", "li_lingrong", "secondary"],
  ...(familyData.marriages as [string, string, "primary" | "secondary", string][]).map(([h, w, k]) => [h, w, k] as [string, string, "primary" | "secondary"]),
];

const key = (a: string, b: string): string => [a, b].sort().join("|");

export class Diplomacy {
  amity: Record<string, number> = {};
  treaties: DiplomacySave["treaties"] = {};
  overlord: Record<string, string> = {};
  history: DiplomacySave["history"] = {};
  marriages: Marriage[] = [];
  aid: AidMission[] = [];
  counts: DiploCounts = { alliances: 0, nonaggression: 0, wars: 0, peaces: 0, aids: 0, marriages: 0, vassals: 0, betrayals: 0 };
  private readonly scenarioPairs = new Set([...Object.keys(scenario.relations ?? {}), ...Object.keys((relationRules as unknown as Record<string, object>)[scenario.id] ?? {})]);

  constructor(private readonly c: Campaign) {
    this.init();
  }

  private init(): void {
    this.amity = {};
    this.treaties = {};
    this.overlord = {};
    this.history = {};
    this.aid = [];
    this.counts = { alliances: 0, nonaggression: 0, wars: 0, peaces: 0, aids: 0, marriages: 0, vassals: 0, betrayals: 0 };
    this.marriages = HISTORIC_MARRIAGES.filter(([h, w]) => persons.some((p) => p.id === h) && persons.some((p) => p.id === w))
      .map(([husband, wife, kind]) => ({ husband, wife, kind, historic: true, day: 0 }));
    // 友好度の初期値:関係と、君主どうしの相性(史料の関係があればそれ)から
    const fs = scenario.factions.filter((f) => !f.passive);
    for (const a of fs) for (const b of fs) {
      if (a.id >= b.id) continue;
      const rel = this.c.relationOf(a.id, b.id);
      const base = { war: -60, hostile: -30, neutral: 0, peace: 0, friendly: 30, nonaggression: 15, alliance: 60, vassal: 40 }[rel] ?? 0;
      const ra = this.c.rulerOf(a.id);
      const rb = this.c.rulerOf(b.id);
      const aff = ra && rb ? affinity(ra, rb).value - 50 : 0;
      this.amity[key(a.id, b.id)] = Math.max(-100, Math.min(100, Math.round(base + aff * 0.4)));
      if (rel === "alliance") this.treaties[key(a.id, b.id)] = { kind: "alliance", until: 360 * 3 };
      const n = relationNote(a.id, b.id);
      if (rel === "vassal" && n?.overlord) this.overlord[n.overlord === a.id ? b.id : a.id] = n.overlord;
    }
  }

  /** 開始時の関係が史料にもとづくか(シナリオに書かれた組か)。書かれていない組は推定の中立 */
  isRecorded(a: string, b: string): boolean {
    return this.scenarioPairs.has(key(a, b));
  }

  amityOf(a: string, b: string): number {
    return this.amity[key(a, b)] ?? 0;
  }

  addAmity(a: string, b: string, d: number): void {
    // 仮想シナリオ:絶世の英姿(君主)・弁舌の士(家臣)で、友好度の上がり方が大きくなる(2倍まで。下がり方は変えない)
    if (d > 0 && scenario.virtual) {
      const day = Math.floor(this.c.day);
      const m = (f: string): number => personMult(this.c.rulerOf(f), "amity") * prodOf(factionTraitEffects(f, day), "amity");
      d *= Math.min(LIMITS.amity, Math.max(m(a), m(b)));
    }
    this.amity[key(a, b)] = Math.max(-100, Math.min(100, this.amityOf(a, b) + d));
  }

  log(a: string, b: string, text: string): void {
    const l = (this.history[key(a, b)] ??= []);
    l.push({ day: Math.floor(this.c.day), text: `${this.c.dateText()} ${text}` });
    if (l.length > 12) l.shift();
  }

  /** 関係が変わったときに呼ばれる(友好度の変化と、条約の後始末) */
  onRelation(a: string, b: string, before: Relation, after: Relation): void {
    const k = key(a, b);
    if (after === "war") {
      // 同盟・不可侵・従属を破っての宣戦は、裏切り(相手は強く恨み、ほかの国からの信用も落ちる)
      if (["alliance", "nonaggression", "vassal"].includes(before)) {
        this.addAmity(a, b, -50);
        for (const f of scenario.factions) if (f.id !== a && f.id !== b) this.addAmity(a, f.id, -10);
        this.counts.betrayals++;
        this.log(a, b, "条約を破っての宣戦(裏切り)");
      } else this.addAmity(a, b, -25);
      delete this.treaties[k];
      if (this.overlord[a] === b) delete this.overlord[a];
      if (this.overlord[b] === a) delete this.overlord[b];
      this.counts.wars++;
    }
    if (before === "war" && after !== "war") this.counts.peaces++;
  }

  /** 婚姻でつながっている2つの勢力の組(君主の一族どうし) */
  marriageLinks(a: string, b: string): Marriage[] {
    return this.marriages.filter((m) => {
      const h = persons.find((p) => p.id === m.husband);
      const w = persons.find((p) => p.id === m.wife);
      return h && w && ((h.factionId === a && w.factionId === b) || (h.factionId === b && w.factionId === a) || (m.alliance && key(m.alliance[0], m.alliance[1]) === key(a, b)));
    });
  }

  spouseOf(personId: string): Person[] {
    return this.marriages.filter((m) => m.husband === personId || m.wife === personId)
      .map((m) => persons.find((p) => p.id === (m.husband === personId ? m.wife : m.husband))!).filter(Boolean);
  }

  /** 婚姻できるか(女性は未婚・夫の死別。年齢14以上。一族どうしは不可) */
  canMarry(h: Person, w: Person): string | null {
    if (h.gender === "female" || w.gender !== "female") return "夫となる男性と、妻となる女性を選んでください";
    if (this.marriages.some((m) => m.wife === w.id && this.c.personStatus(m.husband) !== "dead")) return `${w.name}はすでに嫁いでいます`;
    if (this.marriages.some((m) => m.husband === h.id && m.wife === w.id)) return "すでに夫婦です";
    const year = this.c.calendar().year;
    for (const p of [h, w]) if (p.born !== null && year - p.born < 14) return `${p.name}はまだ幼い(${year - p.born}歳)`;
    if (isKin(h, w)) return "同じ一族どうしの婚姻はできません";
    if (this.c.court?.isCloseKin(h, w)) return "近親どうしの婚姻はできません";
    for (const p of [h, w]) if (this.c.court?.isMinor(p)) return `${p.name}は未成年です`;
    for (const p of [h, w]) if (this.c.personStatus(p.id) !== "active" || this.c.spoils.custodyOf(p.id)) return `${p.name}は、いま婚姻できる状態ではありません`;
    return null;
  }

  /** 国力(兵と都市)。比べるための値 */
  power(f: string): number {
    return this.c.strengthOf(f) + this.c.cities.filter((x) => scenario.cityOwners[x.id] === f).length * 3000;
  }

  /** 2つの勢力が隣り合っているか(都市が400km以内) */
  neighbors(a: string, b: string): boolean {
    const ca = this.c.cities.filter((x) => scenario.cityOwners[x.id] === a);
    const cb = this.c.cities.filter((x) => scenario.cityOwners[x.id] === b);
    return ca.some((x) => cb.some((y) => distanceKm(x, y) < 400));
  }

  /** いちばん手ごわい敵(戦争中で、兵の多い相手) */
  private threatOf(f: string): string | undefined {
    return scenario.factions.filter((g) => !g.fallen && this.c.atWar(f, g.id)).sort((x, y) => this.power(y.id) - this.power(x.id))[0]?.id;
  }

  /**
   * 交渉が成り立つ見込み(0〜1)と、その内訳。
   * 君主の魅力・威信、使者の知力・政治・魅力、友好度、国力差、共通の脅威、民族、婚姻、裏切りの履歴、君主どうしの相性。
   */
  odds(me: string, target: string, cmd: DiploCommand, envoyId?: string): { p: number; parts: string[] } {
    const parts: string[] = [];
    const am = this.amityOf(me, target);
    const rm = this.c.rulerOf(me);
    const rt = this.c.rulerOf(target);
    const envoy = persons.find((x) => x.id === envoyId && x.factionId === me);
    const base: Record<DiploCommand, number> = { goodwill: 0.75, gift: 0.9, trade: 0.6, alliance: 0.3, nonaggression: 0.45, ceasefire: 0.35, peace: 0.3, aid: 0.5, marriage: 0.35, surrender: 0.05, vassal: 0.1, war: 1 };
    let p = base[cmd];
    p += am / 200;
    parts.push(`友好度${am}`);
    if (rm) p += (rm.charisma - 60) / 250;
    p += (this.c.loyalty.prestige(me) - this.c.loyalty.prestige(target)) / 400;
    if (envoy) {
      const skill = (envoy.intelligence + envoy.politics + envoy.charisma) / 3;
      p += (skill - 60) / 160;
      parts.push(`使者 ${envoy.name}(${Math.round(skill)})`);
    } else parts.push("使者なし");
    const ratio = this.power(me) / Math.max(1, this.power(target));
    if (cmd === "surrender" || cmd === "vassal") {
      p += Math.min(0.5, Math.max(0, (ratio - 3) * 0.08));
      parts.push(`国力の差 ${ratio.toFixed(1)}倍`);
      if (ratio < 3) p -= 0.3;
      // 大きな国は、使者の言葉だけでは臣従しない(都市5以上は応じない。降伏は都市2以下のとき)
      const tc = this.c.cities.filter((x) => scenario.cityOwners[x.id] === target && x.kind !== "pass").length;
      if (tc > (cmd === "vassal" ? 4 : 2)) {
        p = 0;
        parts.push(`相手は都市${tc}を持つ大国`);
      }
    } else if (cmd === "ceasefire" || cmd === "peace") {
      p += Math.max(-0.2, Math.min(0.25, (ratio - 1) * 0.15));
      const t2 = this.threatOf(target);
      if (t2 && t2 !== me) {
        p += 0.15;
        parts.push("相手はほかにも敵を抱えている");
      }
    } else if (cmd === "alliance" || cmd === "marriage" || cmd === "aid") {
      // 共通の敵(脅威)があれば応じやすい。能力だけでは、敵対する国とは結べない
      const common = scenario.factions.some((g) => !g.fallen && this.c.atWar(me, g.id) && this.c.atWar(target, g.id));
      if (common) {
        p += 0.2;
        parts.push("共通の敵がいる");
      }
      if (am < 20) {
        p -= 0.35;
        parts.push("友好度が20未満");
      }
    }
    if (rm && rt) {
      const aff = affinity(rm, rt).value;
      p += (aff - 50) / 250;
      if ((rm.people ?? "漢") === (rt.people ?? "漢")) p += 0.04;
    }
    if (this.marriageLinks(me, target).length) {
      p += 0.15;
      parts.push("婚姻でつながっている");
    }
    const betrayed = (this.history[key(me, target)] ?? []).filter((h) => h.text.includes("裏切り")).length;
    if (betrayed) {
      p -= 0.15 * betrayed;
      parts.push(`過去の裏切り${betrayed}回`);
    }
    const r = this.c.relationOf(me, target);
    if (r === "war" && !["ceasefire", "peace", "surrender", "vassal", "goodwill", "gift"].includes(cmd)) p = 0;
    return { p: Math.max(0, Math.min(0.95, p)), parts };
  }

  /**
   * 外交を行う(プレイヤーとAIの共通の入口)。成否と理由の文を返す。
   * 使者の費用(金50)と、贈答の品はここで払う。
   */
  act(me: string, target: string, cmd: DiploCommand, opts: { envoyId?: string; gold?: number; grain?: number; treasureId?: string; husbandId?: string; wifeId?: string; destination?: { lon: number; lat: number; name: string } } = {}): { ok: boolean; text: string } {
    const name = scenario.factions.find((f) => f.id === target)?.name ?? target;
    const me_ = scenario.factions.find((f) => f.id === me)?.name ?? me;
    const purse = this.c.factionStates[me];
    const rel = this.c.relationOf(me, target);
    if (me === target) return { ok: false, text: "自分の国とは交渉できません" };
    if (scenario.factions.find((f) => f.id === target)?.fallen) return { ok: false, text: `${name}はすでに滅びています` };
    if (cmd === "war") {
      if (rel === "war") return { ok: false, text: "すでに戦争中です" };
      this.c.setRelation(me, target, "war");
      this.c.addNews(`${me_}が${name}に宣戦しました${["alliance", "nonaggression"].includes(rel) ? "(条約を破って)" : ""}`);
      this.log(me, target, `${me_}が宣戦`);
      return { ok: true, text: `${name}に宣戦しました` };
    }
    if (!purse || purse.gold < 50) return { ok: false, text: "使者を送る金(50)がありません" };
    purse.gold -= 50;
    const fail = (why: string): { ok: boolean; text: string } => {
      this.log(me, target, `${COMMAND_LABEL[cmd]}を断られる`);
      return { ok: false, text: `${name}は${COMMAND_LABEL[cmd]}を断りました(${why})` };
    };
    const { p, parts } = this.odds(me, target, cmd, opts.envoyId);
    const roll = chance(`${Math.floor(this.c.day)}|${me}|${target}|${cmd}|${opts.envoyId ?? ""}`);
    const why = `見込み${Math.round(p * 100)}%:${parts.join("・")}`;
    const envoy = persons.find((x) => x.id === opts.envoyId);
    const until = (years: number): number => Math.floor(this.c.day) + 360 * years;
    switch (cmd) {
      case "goodwill": {
        if (roll >= p) return fail(why);
        const up = 6 + (envoy ? Math.round((envoy.charisma + envoy.politics) / 40) : 2);
        this.addAmity(me, target, up);
        this.log(me, target, `親善(友好度+${up})`);
        if (rel === "hostile" && this.amityOf(me, target) > -10) this.c.setRelation(me, target, "neutral");
        else if (rel === "neutral" && this.amityOf(me, target) >= 40) this.c.setRelation(me, target, "friendly");
        return { ok: true, text: `${name}との親善に成功しました(友好度+${up}、いま${this.amityOf(me, target)})` };
      }
      case "gift": {
        const gold = Math.max(0, Math.min(opts.gold ?? 0, purse.gold));
        const grain = Math.max(0, Math.min(opts.grain ?? 0, purse.grain));
        const t = opts.treasureId ? this.c.spoils.treasure(opts.treasureId) : undefined;
        if (!gold && !grain && !t) return { ok: false, text: "贈る物を選んでください" };
        if (t && (this.c.spoils.state[t.id].cityId || this.c.spoils.state[t.id].owner !== me)) return { ok: false, text: `${t.name}は収蔵品ではありません` };
        purse.gold -= gold;
        purse.grain -= grain;
        const theirs = (this.c.factionStates[target] ??= { gold: 0, grain: 0 });
        theirs.gold += gold;
        theirs.grain += grain;
        if (t) Object.assign(this.c.spoils.state[t.id], { owner: target, holderId: null });
        const up = Math.round(Math.min(25, gold / 60 + grain / 150 + (t ? t.rarity * 4 : 0)));
        this.addAmity(me, target, up);
        this.log(me, target, `贈答(金${gold}・兵糧${grain}${t ? `・${t.name}` : ""}、友好度+${up})`);
        return { ok: true, text: `${name}に贈り物をしました(友好度+${up})` };
      }
      case "trade": {
        if (rel === "war") return { ok: false, text: "戦争中の相手とは交易できません" };
        if (this.c.trade.hasPact(me, target)) return { ok: false, text: "すでに交易協定を結んでいます" };
        if (!this.c.trade.linked(me, target)) return { ok: false, text: "交易路の上で隣り合っていないため、協定の意味がありません" };
        if (roll >= p) return fail(why);
        this.c.trade.pact(me, target);
        this.addAmity(me, target, 8);
        this.log(me, target, "交易協定(3年)");
        this.c.addNews(`${me_}と${name}が交易協定を結びました(3年)`);
        return { ok: true, text: `${name}と交易協定を結びました(3年。間の区間の交易収入が2割5分増える)` };
      }
      case "alliance":
      case "nonaggression": {
        if (rel === "war") return { ok: false, text: "戦争中の相手とは、先に停戦か和平が必要です" };
        if (rel === cmd) return { ok: false, text: "すでに結んでいます" };
        const myAllies = scenario.factions.filter((f) => this.c.relationOf(me, f.id) === "alliance").length;
        if (cmd === "alliance" && myAllies >= 5) return { ok: false, text: "同盟は5か国までです" };
        if (roll >= p) return fail(why);
        const years = cmd === "alliance" ? 3 + this.marriageLinks(me, target).length * 2 : 2;
        this.c.setRelation(me, target, cmd);
        this.treaties[key(me, target)] = { kind: cmd, until: until(years) };
        this.addAmity(me, target, cmd === "alliance" ? 15 : 8);
        this.counts[cmd === "alliance" ? "alliances" : "nonaggression"]++;
        this.log(me, target, `${COMMAND_LABEL[cmd]}(${years}年)`);
        this.c.addNews(`${me_}と${name}が${COMMAND_LABEL[cmd]}を結びました(${years}年)`);
        return { ok: true, text: `${name}と${COMMAND_LABEL[cmd]}を結びました(${years}年)` };
      }
      case "ceasefire":
      case "peace": {
        if (rel !== "war") return { ok: false, text: "戦争中ではありません" };
        if (this.c.relationAge(me, target) < 60) return { ok: false, text: "開戦したばかりで、相手は交渉に応じません(60日たってから)" };
        if (roll >= p) return fail(why);
        this.c.setRelation(me, target, cmd === "ceasefire" ? "nonaggression" : "neutral");
        if (cmd === "ceasefire") this.treaties[key(me, target)] = { kind: "nonaggression", until: until(1) };
        this.addAmity(me, target, cmd === "peace" ? 20 : 10);
        this.log(me, target, cmd === "ceasefire" ? "停戦(1年)" : "和平");
        this.c.addNews(`${me_}と${name}が${cmd === "ceasefire" ? "停戦" : "和平"}しました`);
        const r = this.c.rulerOf(me);
        if (r) this.c.loyalty.addFame(r.id, 2);
        return { ok: true, text: `${name}と${cmd === "ceasefire" ? "1年の停戦" : "和平"}が成りました` };
      }
      case "aid": {
        if (rel !== "alliance") return { ok: false, text: "援軍は同盟国にだけ求められます" };
        const ok = this.dispatchAid(target, me, opts.destination);
        if (!ok.ok) {
          this.log(me, target, "援軍を断られる");
          return { ok: false, text: `${name}は援軍を出せません(${ok.text})` };
        }
        return { ok: true, text: ok.text };
      }
      case "marriage": {
        const h = persons.find((x) => x.id === opts.husbandId);
        const w = persons.find((x) => x.id === opts.wifeId);
        if (!h || !w) return { ok: false, text: "婚姻する2人を選んでください" };
        // 皇帝生活モードの皇帝の婚姻は、後宮で本人どうしが決める(重臣・他国のAIは決めない)
        if (this.c.palace.active && this.c.palace.ruler()?.id === h.id) return { ok: false, text: "皇帝の婚姻は、皇帝自身が後宮で決めます" };
        if (!((h.factionId === me && w.factionId === target) || (h.factionId === target && w.factionId === me))) return { ok: false, text: "2つの国の人物を1人ずつ選んでください" };
        const err = this.canMarry(h, w);
        if (err) return { ok: false, text: err };
        if (rel === "war") return { ok: false, text: "戦争中の相手とは婚姻できません" };
        if (roll >= p) return fail(why);
        const hasPrimary = this.marriages.some((m) => m.husband === h.id && m.kind === "primary" && this.c.personStatus(m.wife) !== "dead");
        this.marriages.push({ husband: h.id, wife: w.id, kind: hasPrimary ? "secondary" : "primary", historic: false, day: Math.floor(this.c.day), alliance: [me, target] });
        // 妻は夫の国へ移る
        if (w.factionId !== h.factionId) this.c.spoils.setFaction(w.id, h.factionId);
        this.addAmity(me, target, 30);
        if (rel !== "alliance") {
          this.c.setRelation(me, target, "alliance");
          this.treaties[key(me, target)] = { kind: "alliance", until: until(5) };
          this.counts.alliances++;
        } else this.treaties[key(me, target)] = { kind: "alliance", until: Math.max(this.treaties[key(me, target)]?.until ?? 0, until(5)) };
        this.counts.marriages++;
        this.log(me, target, `婚姻同盟(${h.name}と${w.name})`);
        this.c.addNews(`${h.name}が${w.name}を${hasPrimary ? "側室" : "正室"}に迎え、${me_}と${name}が婚姻同盟を結びました`);
        return { ok: true, text: `${h.name}と${w.name}の婚姻が成り、${name}と婚姻同盟を結びました(5年)` };
      }
      case "vassal":
      case "surrender": {
        if (roll >= p) return fail(why);
        if (cmd === "vassal") {
          this.overlord[target] = me;
          this.c.setRelation(me, target, "vassal");
          delete this.treaties[key(me, target)];
          this.counts.vassals++;
          this.log(me, target, `${name}が${me_}に従属`);
          this.c.addNews(`${name}が${me_}に臣従しました`);
          return { ok: true, text: `${name}は臣従しました(毎月、収入の1割を貢ぎます)` };
        }
        // 降伏:都市・軍団・人物がこちらの国に加わる。君主は臣下となる
        this.c.annex(target, me);
        this.log(me, target, `${name}が${me_}に降伏`);
        return { ok: true, text: `${name}は降伏し、${me_}に加わりました` };
      }
    }
    return { ok: false, text: "できません" };
  }

  /**
   * 援軍を出す:同盟国が、自国の兵力・国境の安全・財政・兵糧・関係・距離を考えて決める。
   * 出すときは、目的地に近い都市から新しい軍団を作るか、手の空いた軍団を向かわせる。
   */
  dispatchAid(from: string, forFaction: string, dest?: { lon: number; lat: number; name: string }): { ok: boolean; text: string } {
    const purse = this.c.factionStates[from] ?? { gold: 0, grain: 0 };
    const rep = this.c.economy.report(from);
    if (this.aid.some((x) => x.from === from && x.forFaction === forFaction && !x.returning)) return { ok: false, text: "すでに援軍を送っています" };
    if (purse.gold < rep.expense.total * 2) return { ok: false, text: "財政に余裕がない" };
    if (purse.grain < 300) return { ok: false, text: "兵糧が足りない" };
    if (this.amityOf(from, forFaction) < 20) return { ok: false, text: "友好度が低い" };
    // 自国が劣勢の戦争を抱えていれば出さない(国境の安全)
    const threat = this.threatOf(from);
    if (threat && this.power(threat) > this.power(from) * 1.2) return { ok: false, text: "自国の守りで手いっぱい" };
    // 目的地:指定が無ければ、求めた国の、敵にいちばん近い都市
    const target = dest ?? (() => {
      const mine = this.c.cities.filter((x) => scenario.cityOwners[x.id] === forFaction && x.kind !== "pass");
      const foes = this.c.cities.filter((x) => this.c.atWar(forFaction, scenario.cityOwners[x.id]));
      const c = mine.sort((a, b) => Math.min(...foes.map((f) => distanceKm(a, f)), 9999) - Math.min(...foes.map((f) => distanceKm(b, f)), 9999))[0];
      return c ? { lon: c.lon, lat: c.lat, name: c.name } : null;
    })();
    if (!target) return { ok: false, text: "向かう先がない" };
    const idle = this.c.armies.filter((s) => s.army.factionId === from && s.status !== "fighting" && s.status !== "marching" && !this.aid.some((a) => a.armyId === s.army.id) && totalTroops(s.army) >= 3000)
      .sort((a, b) => distanceKm(a.army, target) - distanceKm(b.army, target))[0];
    let army: ArmyState | undefined = idle;
    if (!army || distanceKm(army.army, target) > 900) {
      const base = this.c.cities.filter((x) => scenario.cityOwners[x.id] === from && x.kind !== "pass").sort((a, b) => distanceKm(a, target) - distanceKm(b, target))[0];
      if (!base || distanceKm(base, target) > 900) return { ok: false, text: "遠すぎる" };
      const troops = Math.min(8000, this.c.cityState(base).garrison - 2000);
      const cmd = persons.filter((p) => p.factionId === from && p.role === "general" && this.c.personStatus(p.id) === "active" && !this.c.postOf(p.id) && !this.c.spoils.custodyOf(p.id))
        .sort((a, b) => b.leadership - a.leadership)[0];
      const r = this.c.raiseArmy(base.id, troops, cmd?.id);
      if (typeof r === "string") return { ok: false, text: r };
      army = r;
    }
    const route = this.c.planRoute(army.army.id, target);
    if (!route) return { ok: false, text: "道がない" };
    this.c.orderMove(army.army.id, route);
    this.aid.push({ armyId: army.army.id, from, forFaction, target, until: Math.floor(this.c.day) + 240 });
    army.army.name = army.army.name.includes("援軍") ? army.army.name : `${army.army.name}(援軍)`;
    this.addAmity(from, forFaction, 8);
    this.counts.aids++;
    const days = Math.round(this.c.daysFor(army, route));
    const cmdName = persons.find((p) => p.id === army!.army.commanderId)?.name ?? "指揮官なし";
    this.log(from, forFaction, `援軍(${army.army.name}・${totalTroops(army.army)}人)`);
    const fromName = scenario.factions.find((f) => f.id === from)?.name;
    this.c.addNews(`${fromName}が${scenario.factions.find((f) => f.id === forFaction)?.name}へ援軍を送りました(${cmdName}・${totalTroops(army.army).toLocaleString("ja-JP")}人、${target.name}まで約${days}日)`);
    return { ok: true, text: `${fromName}が援軍を送りました:指揮官${cmdName}・${totalTroops(army.army).toLocaleString("ja-JP")}人・${target.name}まで約${days}日` };
  }

  /** 援軍の軍団か。援軍は、助けている国の敵とも戦う */
  aidOf(armyId: string): AidMission | undefined {
    return this.aid.find((a) => a.armyId === armyId);
  }

  /** 毎日:援軍の帰還、毎月:条約の期限・従属の貢ぎ物・友好度の自然な変化 */
  daily(): void {
    const day = Math.floor(this.c.day);
    for (const m of [...this.aid]) {
      const s = this.c.stateOf(m.armyId);
      if (!s) {
        this.aid.splice(this.aid.indexOf(m), 1);
        continue;
      }
      // 期限が来たか、同盟が切れたら、引き揚げる
      if (!m.returning && (day >= m.until || this.c.relationOf(m.from, m.forFaction) !== "alliance") && s.status !== "fighting") {
        const home = this.c.cities.filter((x) => scenario.cityOwners[x.id] === m.from && x.kind !== "pass").sort((a, b) => distanceKm(a, s.army) - distanceKm(b, s.army))[0];
        const route = home ? this.c.planRoute(s.army.id, home) : null;
        if (route) this.c.orderMove(s.army.id, route);
        m.returning = true;
        this.c.addNews(`${s.army.name}が作戦を終えて引き揚げます`);
      }
      // 帰り着いたら、ふつうの軍団に戻る
      if (m.returning && s.status !== "marching" && s.status !== "fighting") {
        s.army.name = s.army.name.replace("(援軍)", "");
        this.aid.splice(this.aid.indexOf(m), 1);
      }
    }
  }

  monthly(): void {
    const day = Math.floor(this.c.day);
    for (const [k, t] of Object.entries(this.treaties)) {
      if (day < t.until) continue;
      const [a, b] = k.split("|");
      delete this.treaties[k];
      if (this.c.relationOf(a, b) === t.kind) this.c.setRelation(a, b, this.amityOf(a, b) >= 30 ? "friendly" : "neutral");
      this.log(a, b, `${t.kind === "alliance" ? "同盟" : "不可侵条約"}の期限切れ`);
    }
    // 従属:毎月、宗主に収入の1割を貢ぐ。宗主が弱まる(国力が従属国の2倍を下回る)か、友好度が-20を下回れば、離れる
    for (const [v, o] of Object.entries(this.overlord)) {
      if (this.c.relationOf(v, o) !== "vassal" || scenario.factions.find((f) => f.id === v)?.fallen || scenario.factions.find((f) => f.id === o)?.fallen) {
        delete this.overlord[v];
        if (this.c.relationOf(v, o) === "vassal") this.c.setRelation(v, o, "neutral");
        continue;
      }
      if (this.power(o) < this.power(v) * 2 || this.amityOf(v, o) < -20) {
        delete this.overlord[v];
        this.c.setRelation(v, o, "hostile");
        this.log(v, o, "従属を離れる");
        this.c.addNews(`${scenario.factions.find((f) => f.id === v)?.name}が${scenario.factions.find((f) => f.id === o)?.name}への臣従をやめました`);
        continue;
      }
      const tribute = Math.max(0, Math.round(this.c.economy.report(v).income.total * 0.1));
      const pv = this.c.factionStates[v];
      if (pv && pv.gold > tribute) {
        pv.gold -= tribute;
        (this.c.factionStates[o] ??= { gold: 0, grain: 0 }).gold += tribute;
      }
    }
    // 友好度は、関係に見合う値へゆっくり戻る(戦争中は下がり、同盟中は上がる)
    for (const k of Object.keys(this.amity)) {
      const [a, b] = k.split("|");
      const r = this.c.relationOf(a, b);
      const t = { war: -50, hostile: -25, neutral: 0, peace: 0, friendly: 30, nonaggression: 15, alliance: 55, vassal: 40 }[r] ?? 0;
      this.amity[k] += Math.sign(t - this.amity[k]) * Math.min(1, Math.abs(t - this.amity[k]));
    }
  }

  /**
   * AIの外交(3か月に1度):劣勢なら和平を求め、強い敵には同盟で対抗し、隣国と親善し、
   * 同盟国が劣勢なら援軍を送り、ときに婚姻同盟を結ぶ。財政難のときは贈答をしない。
   * 同盟は1国につき2つまでとし、条件の合わない同盟は結ばない。
   */
  /**
   * 仮想シナリオの覇者への対応(3か月に1度)。覇者 = 全体の国力の35%以上を持つ国。
   * ・隣り合う、国力が覇者の1/6未満の国:12%の見込みで臣従する(降伏。君主は残る)
   * ・それ以外で覇者と隣り合う国:覇者と同盟していなければ、覇者と隣り合うほかの国と対抗の同盟を結ぶ(同盟は2つまで)
   * 何かをしたら true(その国の、この回のほかの外交はしない)
   */
  private virtualHegemon(me: string, alive: typeof scenario.factions, myPower: number, envoy: string | undefined, rnd: (s: string) => number): boolean {
    const total = alive.reduce((s, g) => s + this.power(g.id), 0);
    const hg = alive.find((g) => g.id !== me && this.power(g.id) >= total * 0.35);
    if (!hg || !this.neighbors(me, hg.id) || ["alliance", "vassal"].includes(this.c.relationOf(me, hg.id))) return false;
    // 漢の都(洛陽・長安)を持つ国は、劉皓の国には降らない(都を明け渡すことになるため。戦うか、ほかの国と結ぶ)
    const holdsHanCapital = ["luoyang", "changan"].some((id) => scenario.cityOwners[id] === me);
    if (myPower < this.power(hg.id) / 6 && !holdsHanCapital && rnd("vh_submit") < 0.12) {
      this.overlord[me] = hg.id;
      this.c.setRelation(me, hg.id, "vassal");
      this.counts.vassals++;
      this.log(me, hg.id, `${scenario.factions.find((g) => g.id === me)?.name}が大国の${hg.name}に降る`);
      this.c.addNews(`${scenario.factions.find((g) => g.id === me)?.name}が、${hg.name}の強大さを見て臣従しました`);
      return true;
    }
    const allies = alive.filter((g) => this.c.relationOf(me, g.id) === "alliance").length;
    if (allies >= 2 || rnd("vh_coal") > 0.4) return false;
    const cand = alive.filter((g) => g.id !== me && g.id !== hg.id && g.id !== this.c.playerFactionId && this.neighbors(g.id, hg.id) && !["war", "vassal", "alliance"].includes(this.c.relationOf(me, g.id)) && this.c.relationOf(g.id, hg.id) !== "alliance" && this.c.relationOf(g.id, hg.id) !== "vassal")
      .sort((a, b) => this.power(b.id) - this.power(a.id))[0];
    if (!cand) return false;
    const r = this.act(me, cand.id, "alliance", { envoyId: envoy });
    if (r.ok) {
      this.log(me, cand.id, `${hg.name}に対抗する連合`);
      this.c.addNews(`${scenario.factions.find((g) => g.id === me)?.name}と${cand.name}が、${hg.name}に対抗する同盟を結びました(対抗連合)`);
    }
    return r.ok;
  }

  aiQuarter(aggression: number, warRatio: number): void {
    const day = Math.floor(this.c.day);
    const alive = scenario.factions.filter((f) => !f.passive && !f.fallen && this.c.cities.some((x) => scenario.cityOwners[x.id] === f.id));
    for (const f of alive) {
      if (f.id === this.c.playerFactionId) continue;
      const me = f.id;
      const purse = this.c.factionStates[me] ?? { gold: 0, grain: 0 };
      const rep = this.c.economy.report(me);
      const rich = purse.gold > rep.expense.total * 4;
      const envoy = persons.filter((p) => p.factionId === me && p.role !== "ruler" && this.c.personStatus(p.id) === "active").sort((a, b) => b.politics + b.charisma - (a.politics + a.charisma))[0]?.id;
      const myPower = this.power(me);
      const rnd = (s: string): number => chance(`${day}|${me}|${s}`);
      // 0) 交易:交易路の上で隣り合う国と、交易協定を結ぶ(戦争中でなく、友好度が0以上)
      for (const g of alive) {
        if (g.id === me || g.id === this.c.playerFactionId || this.c.atWar(me, g.id) || this.c.trade.hasPact(me, g.id) || !this.c.trade.linked(me, g.id)) continue;
        if (this.amityOf(me, g.id) >= 0 && rnd("tp" + g.id) < 0.3) this.act(me, g.id, "trade", { envoyId: envoy });
      }
      // 西域の小国:国力が4倍以上の隣の大国があり、宗主がいなければ、自ら臣従を申し出ることがある(自治は保つ)
      const myCities = this.c.cities.filter((x) => scenario.cityOwners[x.id] === me);
      if (myCities.length && myCities.every((x) => x.lon < 96) && !this.overlord[me]) {
        const big = alive.filter((g) => g.id !== me && this.power(g.id) > myPower * 4 && this.neighbors(me, g.id) && !this.c.atWar(me, g.id)).sort((x, y) => this.power(y.id) - this.power(x.id))[0];
        if (big && rnd("sub") < 0.12 && this.amityOf(me, big.id) >= -10) {
          this.overlord[me] = big.id;
          this.c.setRelation(me, big.id, "vassal");
          this.counts.vassals++;
          this.log(me, big.id, `${f.name}が自ら臣従を申し出る`);
          this.c.addNews(`${f.name}が${big.name}に臣従しました(自治は保つ)`);
        }
      }
      // 仮想シナリオ:天下の4割近い国力を持つ大国(覇者)に対し、小国は降るか、ほかの国と対抗の同盟を結ぶ
      if (scenario.virtual && this.virtualHegemon(me, alive, myPower, envoy, rnd)) continue;
      // 1) 劣勢の戦争は、停戦か和平を求める
      const threat = this.threatOf(me);
      if (threat && this.power(threat) > myPower * 1.6 && Math.min(this.c.relationAge(me, threat), day) >= 360) {
        if (threat === this.c.playerFactionId) this.c.propose(me, "peace");
        else {
          const ok = this.act(me, threat, rnd("cf") < 0.5 ? "ceasefire" : "peace", { envoyId: envoy });
          if (ok.ok) continue;
        }
      }
      // 2) 強い敵に対抗する同盟(共通の敵を持つ国と)。同盟は2つまで
      const allies = alive.filter((g) => this.c.relationOf(me, g.id) === "alliance").length;
      if (threat && allies < 2 && rnd("al") < 0.5) {
        const cand = alive.filter((g) => g.id !== me && g.id !== threat && ["neutral", "friendly", "nonaggression", "peace"].includes(this.c.relationOf(me, g.id)) && this.c.atWar(g.id, threat))
          .sort((a, b) => this.amityOf(me, b.id) - this.amityOf(me, a.id))[0];
        if (cand) {
          if (cand.id === this.c.playerFactionId) this.c.propose(me, "alliance");
          else if (this.odds(cand.id, me, "alliance").p > 0.25) {
            // 同盟国の側にも、組む理由があること(相手から見た見込みも確かめる)
            const r = this.act(me, cand.id, rnd("mar") < 0.3 ? "marriage" : "alliance", { envoyId: envoy, ...this.marriagePair(me, cand.id) });
            if (!r.ok && r.text.includes("選んで")) this.act(me, cand.id, "alliance", { envoyId: envoy });
          }
        }
      }
      // 3) 同盟国が劣勢なら、援軍を送る(半年に1度まで)
      for (const g of alive.filter((x) => this.c.relationOf(me, x.id) === "alliance")) {
        const t = this.threatOf(g.id);
        if (t && this.power(t) > this.power(g.id) && rnd("aid" + g.id) < 0.35) this.dispatchAid(me, g.id);
      }
      // 4) 隣国との親善(財政に余裕のあるとき)、関係の悪い隣国とは不可侵条約
      if (rich) {
        const n = alive.filter((g) => g.id !== me && !this.c.atWar(me, g.id) && this.neighbors(me, g.id) && this.amityOf(me, g.id) < 40).sort((a, b) => this.power(b.id) - this.power(a.id))[0];
        if (n && rnd("gw") < 0.5 && n.id !== this.c.playerFactionId) {
          this.act(me, n.id, this.amityOf(me, n.id) < -10 && this.power(n.id) > myPower ? "nonaggression" : "goodwill", { envoyId: envoy });
        }
      }
      // 5) 宣戦:兵力で大きく上回る隣国に(同盟・不可侵・従属の相手には、まずしない)
      const wars = alive.filter((g) => this.c.atWar(me, g.id)).length;
      if (wars <= 1) {
        for (const g of alive) {
          if (g.id === me || ["war", "alliance", "nonaggression", "vassal"].includes(this.c.relationOf(me, g.id)) || this.c.relationAge(me, g.id) < 720) continue;
          if (!this.neighbors(me, g.id) || myPower < this.power(g.id) * warRatio) continue;
          if (this.c.strategy.interestIn(me, g.id) < 0.3) continue; // 戦略的な関心の外(Version 42)
          if (rnd("war" + g.id) >= aggression * (this.amityOf(me, g.id) < 0 ? 1.5 : 0.7)) continue;
          // 小さな隣国には、まず従属を求める
          if (myPower > this.power(g.id) * 4 && g.id !== this.c.playerFactionId && rnd("vs" + g.id) < 0.5 && this.act(me, g.id, "vassal", { envoyId: envoy }).ok) break;
          this.act(me, g.id, "war");
          break;
        }
      }
    }
  }

  /** 婚姻同盟の組(AI用):片方の国の未婚の女性と、もう片方の国の君主か一族の男性 */
  marriagePair(a: string, b: string): { husbandId?: string; wifeId?: string } {
    for (const [hf, wf] of [[a, b], [b, a]]) {
      const ruler = this.c.rulerOf(hf);
      const men = persons.filter((p) => p.factionId === hf && p.gender !== "female" && (p.role === "ruler" || (ruler && isKin(p, ruler))));
      const women = persons.filter((p) => p.factionId === wf && p.gender === "female");
      for (const h of men) for (const w of women) if (this.canMarry(h, w) === null) return { husbandId: h.id, wifeId: w.id };
    }
    return {};
  }

  serialize(): DiplomacySave {
    return JSON.parse(JSON.stringify({ amity: this.amity, treaties: this.treaties, overlord: this.overlord, history: this.history, marriages: this.marriages, aid: this.aid, counts: this.counts })) as DiplomacySave;
  }

  restore(save: DiplomacySave | undefined): void {
    this.init();
    if (!save) return;
    this.amity = { ...save.amity };
    this.treaties = { ...save.treaties };
    this.overlord = { ...save.overlord };
    this.history = { ...save.history };
    this.marriages = [...save.marriages];
    this.aid = [...save.aid];
    this.counts = { ...this.counts, ...save.counts };
  }
}
