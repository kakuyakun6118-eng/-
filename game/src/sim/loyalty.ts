// 忠誠度・相性・名声。
// - 相性:史料にある関係は relations.json の値。ほかは、2人のIDから決まる固定の値(同じ一族・同じ民族なら少し高い)。
// - 忠誠度:君主への忠誠(0〜100)。毎月、目安の値に少しずつ近づき、出来事で上下する。
// - 名声:人物の評判(0〜100)。戦い・攻略・外交・建国で上下する。君主の威信(勢力の値)とは別に持つ。
import { distanceKm } from "./pathfinding";
import { initialCityOwners, persons, scenario } from "../data";
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
  crisis?: Record<string, { defeat?: number; ruler?: number; cities: number[] }>;
  counts?: { rebellions: number; defections: number };
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
  /** 政治の混乱の記録:大敗・君主の交代の日、1年前からの都市の数 */
  crisis: Record<string, { defeat?: number; ruler?: number; dispute?: number; cities: number[] }> = {};
  /** 反乱・寝返りの件数(検証と画面のため) */
  counts = { rebellions: 0, defections: 0 };

  constructor(private readonly c: Campaign) {
    this.init();
  }

  private init(): void {
    this.loyalty = {};
    this.fame = {};
    this.log = {};
    this.lastUnrest = {};
    this.lastGlobalUnrest = -9999;
    this.crisis = {};
    this.counts = { rebellions: 0, defections: 0 };
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
    const v = 15 + cities * 2 + this.c.spoils.factionEffects(factionId).prestige * 0.5 + (r ? this.fame[r.id] * 0.3 : 0) + (this.c.court?.rankBonus(factionId) ?? 0);
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
    // 官職:高いほど忠誠が上がる。名声が高いのに官職が低ければ不満
    const office = this.c.economy?.officeOf(p.id);
    if (office) {
      v += (7 - office.rank) * 1.5;
      parts.push(`官職 ${office.name}`);
    }
    if ((this.fame[p.id] ?? 0) >= 65 && (!office || office.rank >= 4)) {
      v -= 6;
      parts.push("功績に比べて官職が低い");
    }
    // 俸禄:未払いが続くほど不満
    const arrears = this.c.economy?.arrearsOf(p.factionId) ?? 0;
    if (arrears > 0) {
      v -= Math.min(16, arrears * 4);
      parts.push(`俸禄の未払い(${arrears}か月)`);
    }
    // 名声が君主より高い野心家は、不満を持ちやすい
    if (this.fame[p.id] > this.fame[r.id] + 15) {
      v -= 5;
      parts.push("君主より名声が高い");
    }
    // 国の危機(Version 40.1):大敗・君主の交代・継承争い・領土の急な縮小・国内の不安定は、忠誠そのものを下げる
    const day = Math.floor(this.c.day);
    const cr = this.crisis[p.factionId];
    if (cr?.defeat !== undefined && day - cr.defeat < 180) {
      v -= 6;
      parts.push("大敗の直後");
    }
    if (cr?.ruler !== undefined && day - cr.ruler < 360) {
      v -= isKin(p, r) ? 3 : 7;
      parts.push("君主の交代の直後(新しい君主への不安)");
    }
    if (cr?.dispute !== undefined && day - cr.dispute < 360) {
      v -= 6;
      parts.push("継承争い");
    }
    const now = this.c.cities.filter((x) => scenario.cityOwners[x.id] === p.factionId).length;
    if (cr && cr.cities.length >= 12 && now < cr.cities[0] * 0.7) {
      v -= 6;
      parts.push("領土の急な縮小");
    }
    const stab = this.c.court?.stability[p.factionId] ?? 60;
    if (stab < 40) {
      v -= (40 - stab) * 0.25;
      parts.push(`国内の不安定(安定度${Math.round(stab)})`);
    }
    // 大国の統治の難しさ:都市が30を超える国では、都から800km以上離れた任地の太守・将は、都の目が届かず自立心を持ちやすい
    const post = this.c.postOf(p.id);
    if (now > 30 && post) {
      // 広すぎる領土(Version 42):国が大きいほど、任地の者は都の目が届かないと感じる
      v -= Math.min(8, (now - 30) * 0.1);
      parts.push("広すぎる領土");
      const cap = this.c.strategy.capitalOf(p.factionId);
      const at = post.kind === "city" ? this.c.cities.find((k) => k.id === post.id) : this.c.armies.find((s) => s.army.id === post.id)?.army;
      if (cap && at && distanceKm(cap, at) > 500) {
        v -= Math.min(10, (now - 30) * 0.12 + 3);
        parts.push("都から遠い任地(大国の統治の難しさ)");
      }
      // 新しく従えた地(シナリオ開始時に自国の都市でなかった所)の太守は、地元の支えが薄い
      if (post.kind === "city" && initialCityOwners[post.id] !== p.factionId) {
        v -= 3;
        parts.push("新しく従えた地の任地");
      }
    }
    // 野心:大軍(8,000人以上)を率いる、武勇と名声のある将は、君主を軽んじやすい
    const army = this.c.armies.find((s) => s.army.commanderId === p.id && s.army.factionId === p.factionId);
    if (army && army.army.troops.infantry + army.army.troops.cavalry + army.army.troops.archer >= 8000 && p.war + p.leadership >= 160 && (this.fame[p.id] ?? 0) >= 60) {
      v -= 5;
      parts.push("野心(大軍を率いる有力な将)");
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
    // 1年のうちに褒賞を重ねるほど、効き目は薄れる(Version 42:領土の広さや遠い任地のような根の深い不満は、
    // 褒賞を繰り返しても消えきらない)。直近1年の褒賞の回数 n に対して、1/(1+n)
    const day = Math.floor(this.c.day);
    const n = (this.log[p.id] ?? []).filter((e) => e.text.startsWith("褒賞") && day - e.day < 360).length;
    const up = (Math.min(12, gold / 12) * (this.loyalty[p.id] > 80 ? 0.3 : 1)) / (1 + n);
    this.add(personId, up, `褒賞(金${gold})`);
    return null;
  }

  noteDefeat(factionId: string): void {
    (this.crisis[factionId] ??= { cities: [] }).defeat = Math.floor(this.c.day);
  }

  noteDispute(factionId: string): void {
    (this.crisis[factionId] ??= { cities: [] }).dispute = Math.floor(this.c.day);
  }

  noteRulerChange(factionId: string): void {
    (this.crisis[factionId] ??= { cities: [] }).ruler = Math.floor(this.c.day);
  }

  /** 政治の混乱の度合い(1が平時)と、その理由。反乱の起きやすさに掛かる */
  crisisOf(factionId: string): { factor: number; why: string[] } {
    const day = Math.floor(this.c.day);
    const cr = this.crisis[factionId] ?? { cities: [] };
    const why: string[] = [];
    let f = 1;
    const a = this.c.economy?.arrearsOf(factionId) ?? 0;
    if (a >= 3) {
      f += 2;
      why.push(`俸禄の未払い${a}か月`);
    } else if (a >= 1) {
      f += 0.5;
      why.push("俸禄の遅れ");
    }
    if (cr.defeat !== undefined && day - cr.defeat < 120) {
      f += 1;
      why.push("大敗の直後");
    }
    if (cr.ruler !== undefined && day - cr.ruler < 180) {
      f += 1.5;
      why.push("君主の交代の直後");
    }
    if (cr.dispute !== undefined && day - cr.dispute < 360) {
      f += 1;
      why.push("継承争い");
    }
    const now = this.c.cities.filter((x) => scenario.cityOwners[x.id] === factionId).length;
    if (cr.cities.length >= 12 && now < cr.cities[0] * 0.7) {
      f += 1;
      why.push("領土の急な縮小");
    }
    return { factor: f, why };
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
      const cr = (this.crisis[f.id] ??= { cities: [] });
      cr.cities.push(this.c.cities.filter((x) => scenario.cityOwners[x.id] === f.id).length);
      if (cr.cities.length > 12) cr.cities.shift();
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
      .filter((p) => p.role !== "ruler" && (this.loyalty[p.id] ?? 100) < 45 && this.c.personStatus(p.id) === "active" && !this.c.spoils.custodyOf(p.id) && this.c.postOf(p.id))
      .filter((p) => !scenario.factions.find((f) => f.id === p.factionId)?.passive && day - (this.lastUnrest[p.factionId] ?? -9999) >= 180)
      .sort((a, b) => this.loyalty[a.id] - this.loyalty[b.id]);
    for (const p of cand) {
      const pr = this.unrestChance(p);
      if (chance(`${day}|${p.id}|unrest`) >= pr) continue;
      this.lastGlobalUnrest = day;
      this.lastUnrest[p.factionId] = day;
      // 大きな都市と兵を握っていれば独立、そうでなければ、戦争中の隣国へ寝返る
      if (this.c.secede(p.id)) {
        this.counts.rebellions++;
        return;
      }
      const to = scenario.factions
        .filter((f) => !f.passive && !f.fallen && this.c.atWar(p.factionId, f.id) && this.ruler(f.id))
        .sort((a, b) => affinity(p, this.ruler(b.id)!).value - affinity(p, this.ruler(a.id)!).value)[0];
      if (to && this.c.defect(p.id, to.id, "不満から")) this.counts.defections++;
      return;
    }
  }

  /**
   * 1か月のうちに離反する見込み。忠誠が低く(45未満)、任務についている人だけ。
   * 君主との相性の悪さ・名声と武勇・率いる兵の多さで上がり、君主の魅力で下がる。
   * 政治の混乱(俸禄の未払い・大敗・君主の交代・領土の急な縮小)があると、何倍にもなる。
   */
  unrestChance(p: Person): number {
    const loy = this.loyalty[p.id] ?? 100;
    if (loy >= 45 || p.role === "ruler") return 0;
    const r = this.ruler(p.factionId);
    let pr = ((45 - loy) / 100) * 0.12;
    if (r && affinity(p, r).value < 35) pr *= 1.4;
    pr *= 1 + ((this.fame[p.id] ?? 50) - 50) / 100 + Math.max(0, p.war + p.leadership - 140) / 200;
    const army = this.c.armies.find((s) => s.army.commanderId === p.id && s.army.factionId === p.factionId);
    if (army && army.army.troops.infantry + army.army.troops.cavalry + army.army.troops.archer >= 8000) pr *= 1.3;
    pr *= 1 - (r?.charisma ?? 60) / 220;
    pr *= this.crisisOf(p.factionId).factor;
    // プレイヤーの国の中でだけ、難易度に応じて起こりやすくする(易しい1倍・普通1.5倍・難しい2.5倍・最高難度3.5倍)
    if (p.factionId === this.c.playerFactionId) pr *= ({ easy: 1, normal: 1.5, hard: 2.5, veryHard: 3.5 } as Record<string, number>)[this.c.difficulty] ?? 1.5;
    return Math.max(0, Math.min(0.5, pr));
  }

  serialize(): LoyaltySave {
    return JSON.parse(JSON.stringify({ loyalty: this.loyalty, fame: this.fame, log: this.log, lastUnrest: this.lastUnrest, lastGlobalUnrest: this.lastGlobalUnrest, crisis: this.crisis, counts: this.counts })) as LoyaltySave;
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
    this.crisis = { ...(save.crisis ?? {}) };
    this.counts = { ...(save.counts ?? { rebellions: 0, defections: 0 }) };
  }
}
