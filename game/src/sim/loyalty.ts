// 忠誠度・相性・名声。
// - 相性:史料にある関係は relations.json の値。ほかは、2人のIDから決まる固定の値(同じ一族・同じ民族なら少し高い)。
// - 忠誠度:君主への忠誠(0〜100)。毎月、目安の値に少しずつ近づき、出来事で上下する。
// - 名声:人物の評判(0〜100)。戦い・攻略・外交・建国で上下する。君主の威信(勢力の値)とは別に持つ。
import { persons, scenario } from "../data";
import rel from "../data/rules/relations.json";
import type { Person } from "../data/types";
import type { Campaign } from "./Campaign";
import { chance } from "./spoils";

export interface LoyaltySave {
  loyalty: Record<string, number>;
  fame: Record<string, number>;
  log: Record<string, { day: number; delta: number; text: string }[]>;
  lastUnrest: Record<string, number>;
  lastGlobalUnrest: number;
}

const PAIRS = new Map<string, { value: number; note: string }>();
for (const p of rel.pairs) PAIRS.set([p.a, p.b].sort().join("|"), { value: p.value, note: p.note });
const LOYAL = rel.loyalty as Record<string, { base: number; note: string }>;
const COMPOUND = ["司馬", "慕容", "拓跋", "宇文", "諸葛", "皇甫", "呼延", "乞伏", "可足"];

export function surnameOf(p: Person): string {
  return COMPOUND.find((s) => p.name.startsWith(s)) ?? p.name.slice(0, 1);
}

/** 同じ一族か(同じ姓で、同じ民族) */
export function isKin(a: Person, b: Person): boolean {
  return surnameOf(a) === surnameOf(b) && (a.people ?? "漢") === (b.people ?? "漢") && !a.name.endsWith("氏") && !b.name.endsWith("氏");
}

/** 2人の相性(0〜100)と、その理由 */
export function affinity(a: Person, b: Person): { value: number; note: string } {
  if (a.id === b.id) return { value: 100, note: "" };
  const h = PAIRS.get([a.id, b.id].sort().join("|"));
  if (h) return h;
  // 史料に関係が無い2人:固定のシードで35〜65。同じ一族なら+20、同じ民族なら+6
  let v = 35 + Math.floor(chance([a.id, b.id].sort().join("|") + "|aff") * 31);
  let note = "史料に関係の記録なし(固定の値)";
  if (isKin(a, b)) {
    v += 20;
    note = "同じ一族";
  } else if ((a.people ?? "漢") === (b.people ?? "漢")) {
    v += 6;
    note = "同じ民族(史料に関係の記録なし)";
  }
  return { value: Math.min(100, v), note };
}

export function loyaltyBand(v: number): { label: string; risk: "なし" | "低い" | "中くらい" | "高い" | "非常に高い" } {
  if (v >= 90) return { label: "極めて忠実", risk: "なし" };
  if (v >= 70) return { label: "忠実", risk: "低い" };
  if (v >= 50) return { label: "不満あり", risk: "中くらい" };
  if (v >= 30) return { label: "離反の危険", risk: "高い" };
  return { label: "独立・寝返りの危険大", risk: "非常に高い" };
}

export class LoyaltySystem {
  loyalty: Record<string, number> = {};
  fame: Record<string, number> = {};
  log: Record<string, { day: number; delta: number; text: string }[]> = {};
  private lastUnrest: Record<string, number> = {};
  private lastGlobalUnrest = -9999;

  constructor(private readonly c: Campaign) {
    this.init();
  }

  private init(): void {
    this.loyalty = {};
    this.fame = {};
    this.log = {};
    this.lastUnrest = {};
    this.lastGlobalUnrest = -9999;
    for (const p of persons) {
      this.fame[p.id] = this.initialFame(p);
    }
    for (const p of persons) this.loyalty[p.id] = Math.round(this.target(p).value);
  }

  private initialFame(p: Person): number {
    const avg = (p.leadership + p.war + p.intelligence + p.politics + p.charisma) / 5;
    let v = (avg - 35) * 1.3 + (p.role === "ruler" ? 20 : 0) + Math.max(p.leadership, p.war, p.intelligence, p.politics) / 10;
    return Math.round(Math.max(5, Math.min(95, v)));
  }

  ruler(factionId: string): Person | undefined {
    return persons.find((p) => p.factionId === factionId && p.role === "ruler");
  }

  /** 君主の威信(勢力の値。名声とは別):都市の数・名品・君主の名声から */
  prestige(factionId: string): number {
    const cities = this.c.cities.filter((x) => x.kind !== "pass" && scenario.cityOwners[x.id] === factionId).length;
    const r = this.ruler(factionId);
    const v = 15 + cities * 2 + this.c.spoils.factionEffects(factionId).prestige * 0.5 + (r ? this.fame[r.id] * 0.3 : 0);
    return Math.round(Math.max(0, Math.min(100, v)));
  }

  /** 忠誠の目安(この値へ毎月少しずつ近づく)と、その内訳 */
  target(p: Person): { value: number; parts: string[] } {
    const r = this.ruler(p.factionId);
    if (!r || r.id === p.id) return { value: 100, parts: ["君主"] };
    const parts: string[] = [];
    const hist = LOYAL[p.id];
    let v = hist ? hist.base : 60;
    parts.push(hist ? `史実の基準 ${hist.base}${hist.note ? `(${hist.note})` : ""}` : "基準 60");
    const aff = affinity(p, r);
    const ka = hist ? 0.2 : 0.45;
    v += (aff.value - 50) * ka;
    parts.push(`君主との相性 ${aff.value}`);
    if (isKin(p, r)) {
      v += hist ? 5 : 15;
      parts.push("君主の一族");
    }
    if ((p.people ?? "漢") === (r.people ?? "漢")) {
      v += 3;
      parts.push("同じ民族");
    }
    if (this.c.postOf(p.id)) {
      v += 5;
      parts.push("官職・任務あり");
    }
    const pr = this.prestige(p.factionId);
    v += (pr - 50) * 0.12;
    parts.push(`君主の威信 ${pr}`);
    v += (r.charisma - 60) * 0.12;
    // 俸禄:金が足りなければ不満
    const purse = this.c.factionStates[p.factionId]?.gold ?? 0;
    const staff = persons.filter((x) => x.factionId === p.factionId).length;
    if (purse < staff * 5) {
      v -= 8;
      parts.push("俸禄の不足");
    }
    // 名声が君主より高い野心家は、不満を持ちやすい
    if (this.fame[p.id] > this.fame[r.id] + 15) {
      v -= 5;
      parts.push("君主より名声が高い");
    }
    return { value: Math.max(0, Math.min(100, v)), parts };
  }

  add(personId: string, delta: number, text: string): void {
    if (this.loyalty[personId] === undefined) return;
    this.loyalty[personId] = Math.max(0, Math.min(100, this.loyalty[personId] + delta));
    const list = (this.log[personId] ??= []);
    list.push({ day: Math.floor(this.c.day), delta: Math.round(delta), text });
    if (list.length > 6) list.shift();
  }

  addFame(personId: string, delta: number): void {
    if (this.fame[personId] === undefined) return;
    this.fame[personId] = Math.max(0, Math.min(100, this.fame[personId] + delta));
  }

  /** 所属が変わった人(登用・寝返り・独立)の忠誠を、新しい君主に合わせて作り直す */
  rebase(personId: string, text: string, start?: number): void {
    const p = persons.find((x) => x.id === personId);
    if (!p) return;
    const t = this.target(p).value;
    this.loyalty[personId] = Math.round(start ?? Math.min(t, 55));
    this.log[personId] = [{ day: Math.floor(this.c.day), delta: 0, text }];
  }

  /** 君主が代わったとき:配下全員の忠誠を、新しい君主との関係で見直す */
  reevaluate(factionId: string, text: string): void {
    for (const p of persons.filter((x) => x.factionId === factionId && x.role !== "ruler")) {
      const t = this.target(p).value;
      const before = this.loyalty[p.id] ?? t;
      const after = Math.round((before + t) / 2 - 3);
      this.add(p.id, after - before, text);
    }
  }

  /** 褒賞:金を与えて忠誠を上げる。上げ幅は金に応じるが、上限あり */
  reward(personId: string, gold: number): string | null {
    const p = persons.find((x) => x.id === personId);
    if (!p || p.role === "ruler") return "君主には褒賞を与えられません";
    const purse = this.c.factionStates[p.factionId];
    if (!purse || purse.gold < gold) return `金が足りません(必要 ${gold})`;
    purse.gold -= gold;
    const up = Math.min(12, gold / 12) * (this.loyalty[p.id] > 80 ? 0.3 : 1);
    this.add(personId, up, `褒賞(金${gold})`);
    return null;
  }

  /** 毎月:忠誠を目安へ近づけ、AIの褒賞・任命・捕虜の登用・調略、離反の判定をする */
  monthly(): void {
    for (const p of persons) {
      if (p.role === "ruler" || this.c.personStatus(p.id) === "dead" || this.c.spoils.custodyOf(p.id)) continue;
      const t = this.target(p).value;
      const cur = this.loyalty[p.id] ?? t;
      const step = (t - cur) * 0.12;
      if (Math.abs(step) >= 0.5) this.loyalty[p.id] = Math.max(0, Math.min(100, cur + step));
    }
    for (const f of scenario.factions) {
      if (f.passive || f.fallen || f.id === this.c.playerFactionId || this.c.playerFactionId === null) continue;
      this.aiCare(f.id);
    }
    if (this.c.playerFactionId !== null) this.unrest();
  }

  /** AI君主の人の扱い:褒賞(予算に上限)・空いた都市への任命・捕虜の登用・敵将の調略 */
  private aiCare(factionId: string): void {
    const purse = this.c.factionStates[factionId];
    if (!purse) return;
    const mine = persons.filter((p) => p.factionId === factionId && p.role !== "ruler" && this.c.personStatus(p.id) === "active" && !this.c.spoils.custodyOf(p.id));
    // 褒賞:忠誠が55未満で、任務についている人を優先。1か月の予算は蓄えの8%まで、2人まで
    let budget = purse.gold >= 300 ? Math.min(400, Math.max(100, purse.gold * 0.08)) : 0;
    for (const p of mine.filter((x) => this.loyalty[x.id] < 55).sort((a, b) => (this.c.postOf(b.id) ? 1 : 0) - (this.c.postOf(a.id) ? 1 : 0) || this.loyalty[a.id] - this.loyalty[b.id]).slice(0, 2)) {
      if (budget < 100) break;
      if (this.reward(p.id, 100) === null) budget -= 100;
    }
    // 任命:太守のいない都市に、役目のない人を(政治の高い人から)
    const free = mine.filter((p) => !this.c.postOf(p.id) && p.role !== "general").concat(mine.filter((p) => !this.c.postOf(p.id) && p.role === "general"));
    for (const city of this.c.cities.filter((x) => scenario.cityOwners[x.id] === factionId && x.kind !== "pass")) {
      if (free.length === 0) break;
      const st = this.c.cityStates[city.id];
      if (st?.governorId !== null && (st?.governorId || city.governorId)) continue;
      free.sort((a, b) => b.politics - a.politics);
      const p = free.shift()!;
      this.c.appoint(p.id, { kind: "city", id: city.id });
    }
    // 捕虜:月に1人まで登用を持ちかける
    const captive = this.c.spoils.custody.find((x) => x.holder === factionId && x.kind === "captive" && x.lastTry !== Math.floor(this.c.day));
    if (captive) this.c.custodyAction(captive.personId, "recruit");
    // 調略:戦争中の相手の、不満の大きい将(忠誠30未満)に、金300で寝返りを持ちかける(半年に1度まで)
    const day = Math.floor(this.c.day);
    if (purse.gold > 1500 && day - (this.lastUnrest["sub|" + factionId] ?? -9999) > 180) {
      const target = persons.find((p) => p.role !== "ruler" && this.c.atWar(factionId, p.factionId) && (this.loyalty[p.id] ?? 100) < 30 && this.c.postOf(p.id) && this.c.personStatus(p.id) === "active" && !this.c.spoils.custodyOf(p.id));
      if (target) {
        this.lastUnrest["sub|" + factionId] = day;
        purse.gold -= 300;
        const r = this.ruler(factionId);
        const pr = 0.25 + (r ? (affinity(target, r).value - 50) / 150 : 0) + (30 - this.loyalty[target.id]) / 100;
        if (chance(`${day}|${target.id}|sub`) < pr) this.c.defect(target.id, factionId, "調略に応じて");
      }
    }
  }

  /**
   * 離反の判定。忠誠が30未満で、太守か軍団の指揮官である人だけが対象。
   * 起きるのは、全体で1か月に1件まで、同じ勢力では半年に1件まで。確率は小さく、君主の魅力で下がる。
   */
  private unrest(): void {
    const day = Math.floor(this.c.day);
    if (day - this.lastGlobalUnrest < 30) return;
    const cand = persons
      .filter((p) => p.role !== "ruler" && (this.loyalty[p.id] ?? 100) < 30 && this.c.personStatus(p.id) === "active" && !this.c.spoils.custodyOf(p.id) && this.c.postOf(p.id))
      .filter((p) => !scenario.factions.find((f) => f.id === p.factionId)?.passive && day - (this.lastUnrest[p.factionId] ?? -9999) >= 180)
      .sort((a, b) => this.loyalty[a.id] - this.loyalty[b.id]);
    for (const p of cand) {
      const r = this.ruler(p.factionId);
      const pr = ((30 - this.loyalty[p.id]) / 100) * 0.35 * (1 - (r?.charisma ?? 60) / 220);
      if (chance(`${day}|${p.id}|unrest`) >= pr) continue;
      this.lastGlobalUnrest = day;
      this.lastUnrest[p.factionId] = day;
      // 大きな都市と兵を握っていれば独立、そうでなければ、戦争中の隣国へ寝返る
      if (this.c.secede(p.id)) return;
      const to = scenario.factions
        .filter((f) => !f.passive && !f.fallen && this.c.atWar(p.factionId, f.id) && this.ruler(f.id))
        .sort((a, b) => affinity(p, this.ruler(b.id)!).value - affinity(p, this.ruler(a.id)!).value)[0];
      if (to) this.c.defect(p.id, to.id, "不満から");
      return;
    }
  }

  serialize(): LoyaltySave {
    return JSON.parse(JSON.stringify({ loyalty: this.loyalty, fame: this.fame, log: this.log, lastUnrest: this.lastUnrest, lastGlobalUnrest: this.lastGlobalUnrest })) as LoyaltySave;
  }

  /** 古いセーブ(忠誠の無いもの)は、いまの状況から作り直す */
  restore(save: LoyaltySave | undefined): void {
    this.init();
    if (!save) return;
    Object.assign(this.loyalty, save.loyalty);
    Object.assign(this.fame, save.fame);
    this.log = { ...save.log };
    this.lastUnrest = { ...save.lastUnrest };
    this.lastGlobalUnrest = save.lastGlobalUnrest ?? -9999;
  }
}
