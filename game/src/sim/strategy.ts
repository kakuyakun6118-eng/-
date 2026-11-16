// 敵勢力の戦略AI(Version 40で全面改修)。
// 操作していない勢力が、毎月の情勢分析 → 戦略方針 → 攻撃目標の評価 → 軍団の編成・出兵 → 野戦・攻城 → 占領・撤退 を自分で行う。
// 資金や兵を無から増やすことはしない。使えるのは、その勢力の収入と守備兵だけ。
// 判断の理由は、開発用のログ(log)に残す(通常のプレイでは表示しない)。
import { cityLevelOf, persons, scenario, totalTroops } from "../data";
import rules from "../data/rules/strategyAi.json";
import type { BattleEvent, City, Person } from "../data/types";
import type { BattleResult } from "../battle/types";
import type { ArmyState, Campaign } from "./Campaign";
import { wallBonus } from "./autoBattle";
import { distanceKm } from "./pathfinding";
import { cityEcon } from "./economy";
import { affinity } from "./loyalty";
import { chance } from "./spoils";

export type StrategyProfile = (typeof rules.profiles)["normal"];
export const strategyRules = rules;

/** 都市に置ける守備兵の上限 */
export function garrisonCap(city: City): number {
  return city.kind === "pass" ? rules.garrisonCap.pass : rules.garrisonCap.levels[cityLevelOf(city)];
}

/** 国家の戦略方針 */
export type Posture = "invade" | "expand" | "defend" | "develop" | "diplomacy" | "unify";
export const POSTURE_LABEL: Record<Posture, string> = {
  invade: "侵攻重視", expand: "領土拡大", defend: "防衛重視", develop: "内政重視", diplomacy: "外交重視", unify: "統一志向",
};

/** AIの性格(ゲームAIの性格付け。史実の人物評価ではない) */
export interface Personality { aggr: number; caution: number; logistics: number; mobility: number; diplomacy: number; unify: number; label: string }

/** 作戦(1つの軍団に与えた任務) */
export interface Operation {
  id: number;
  factionId: string;
  armyId: string;
  kind: "attack" | "support" | "intercept" | "cover" | "reserve";
  targetCityId?: string;
  targetArmyId?: string;
  /** 主作戦(支援・援護・予備のとき) */
  leadId?: number;
  startDay: number;
  status: "marching" | "arrived" | "retreating";
  troops0: number;
  arrived: boolean;
  /** 出発のときの指揮官(指揮官を失ったかを見るため) */
  commander0?: string;
  /** 到着してから戦いが始まらないまま過ぎた日数を数えるための日付 */
  idleSince?: number;
  vsPlayer: boolean;
  reason: string;
}

/** AIの行動の記録(数) */
export interface AiStats {
  planned: number;
  dispatched: number;
  arrived: number;
  fieldBattles: number;
  sieges: number;
  captures: number;
  retreats: number;
  /** 軍団の移動命令の数 */
  moves: number;
  /** プレイヤーの国家への侵攻(出兵)・攻城・占領 */
  vsPlayer: number;
  vsPlayerSieges: number;
  vsPlayerCaptures: number;
  /** 出兵を見送った理由(計画の段階) */
  notLaunched: Record<string, number>;
  /** 出兵のあとで作戦をやめた理由 */
  aborted: Record<string, number>;
  /** 宣戦 */
  wars: number;
  /** 複数軍団の連携(共同攻撃・援護・予備の投入)と、首都の守りに残した回数 */
  coordinated: number;
  guards: number;
}

export interface AiLogEntry { day: number; date: string; factionId: string; text: string }

export interface StrategySave {
  ops: Operation[];
  stats: Record<string, AiStats>;
  posture: Record<string, { posture: Posture; reason: string; since: number }>;
  log: AiLogEntry[];
  nextOp: number;
}

const emptyStats = (): AiStats => ({ planned: 0, dispatched: 0, arrived: 0, fieldBattles: 0, sieges: 0, captures: 0, retreats: 0, moves: 0, vsPlayer: 0, vsPlayerSieges: 0, vsPlayerCaptures: 0, notLaunched: {}, aborted: {}, wars: 0, coordinated: 0, guards: 0 });
const clamp = (v: number, lo = -1, hi = 1): number => Math.max(lo, Math.min(hi, v));
const TERRAIN_DIFFICULTY: Record<string, number> = { highMountain: 1.8, mountain: 1.45, desert: 1.3, hill: 1.15, forest: 1.1, crossing: 1.2, river: 1.1 };

export class StrategyAi {
  ops: Operation[] = [];
  stats: Record<string, AiStats> = {};
  posture: Record<string, { posture: Posture; reason: string; since: number }> = {};
  log: AiLogEntry[] = [];
  private nextOp = 1;

  constructor(private readonly c: Campaign) {}

  // ===== 共通 =====
  private profile(): StrategyProfile {
    return rules.profiles[this.c.difficulty] ?? rules.profiles.normal;
  }

  private st(f: string): AiStats {
    return (this.stats[f] ??= emptyStats());
  }

  /** 全勢力の合計(報告用) */
  totals(): AiStats {
    const t = emptyStats();
    for (const s of Object.values(this.stats)) {
      for (const k of Object.keys(t) as (keyof AiStats)[]) {
        if (typeof t[k] === "number") (t as unknown as Record<string, number>)[k] += s[k] as number;
      }
      for (const [k, v] of Object.entries(s.notLaunched)) t.notLaunched[k] = (t.notLaunched[k] ?? 0) + v;
      for (const [k, v] of Object.entries(s.aborted)) t.aborted[k] = (t.aborted[k] ?? 0) + v;
    }
    return t;
  }

  private name(f: string | undefined): string {
    return scenario.factions.find((x) => x.id === f)?.name ?? f ?? "";
  }

  /** 開発用のログ(同じ勢力の同じ文は、30日のうちに繰り返さない) */
  note(f: string, text: string): void {
    const day = Math.floor(this.c.day);
    if (this.log.some((l) => l.factionId === f && l.text === text && day - l.day < 30)) return;
    this.log.push({ day, date: this.c.dateText(), factionId: f, text: `${this.name(f)}:${text}` });
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
  }

  private armyPower(s: ArmyState): number {
    return totalTroops(s.army) * (0.5 + s.army.morale / 200);
  }

  private citiesOf(factionId: string): City[] {
    return this.c.cities.filter((c) => scenario.cityOwners[c.id] === factionId);
  }

  /** 勢力の兵の総数(軍団と守備兵) */
  strengthOf(factionId: string): number {
    const armies = this.c.armies.filter((s) => s.army.factionId === factionId).reduce((sum, s) => sum + totalTroops(s.army), 0);
    return armies + this.citiesOf(factionId).reduce((sum, c) => sum + this.c.cityState(c).garrison, 0);
  }

  /** 首都(いちばん格の高い自国の都市) */
  capitalOf(f: string): City | undefined {
    return this.citiesOf(f).filter((c) => c.kind !== "pass").sort((a, b) => (b.rank === "capital" ? 10 : 0) + cityLevelOf(b) - ((a.rank === "capital" ? 10 : 0) + cityLevelOf(a)))[0];
  }

  /** 人物の性格(表にない人物は、能力値から決める) */
  personalityOf(p: Person | undefined): Personality {
    const table = rules.personalities.people as Record<string, Personality>;
    if (p && table[p.id]) return table[p.id];
    if (!p) return { aggr: 0, caution: 0, logistics: 0, mobility: 0, diplomacy: 0, unify: 0, label: "標準" };
    return {
      aggr: clamp((p.war + p.leadership - p.politics - p.intelligence) / 120),
      caution: clamp((p.intelligence - 60) / 60),
      logistics: clamp((p.politics - 60) / 60),
      mobility: clamp((p.leadership - 60) / 60),
      diplomacy: clamp((p.charisma + p.politics - 120) / 80),
      unify: clamp((p.charisma - 70) / 60),
      label: "能力値による",
    };
  }

  /** 国家の性格:君主に、重臣(王猛など、表にある文官・軍師)の考えを少し混ぜる */
  factionPersonality(f: string): Personality {
    const ruler = this.c.rulerOf(f);
    const base = { ...this.personalityOf(ruler) };
    const table = rules.personalities.people as Record<string, Personality>;
    const adviser = persons.find((p) => p.factionId === f && p.id !== ruler?.id && (p.role === "minister" || p.role === "strategist") && table[p.id] && this.c.personStatus(p.id) === "active");
    if (adviser) {
      const a = table[adviser.id];
      for (const k of ["aggr", "caution", "logistics", "mobility", "diplomacy", "unify"] as const) base[k] = base[k] * 0.65 + a[k] * 0.35;
      base.label = `${base.label}+${adviser.name}(${a.label})`;
    }
    return base;
  }

  private enemyCitiesOf(f: string): City[] {
    return this.c.cities.filter((c) => this.c.atWar(f, scenario.cityOwners[c.id]));
  }

  // ===== 毎日 =====
  /** 1日に1度呼ぶ。勢力ごとに、月に1度の情勢分析と、難易度で決まる間隔の行動 */
  daily(day: number): void {
    const p = this.profile();
    scenario.factions.forEach((f, i) => {
      if (f.id === this.c.playerFactionId || f.passive || f.fallen) return;
      if (this.citiesOf(f.id).length === 0) return;
      if ((day + i) % rules.plan.analyzeEvery === 0) this.analyze(f.id, p, day);
      if ((day + i) % p.interval !== 0) return;
      this.act(f.id, p);
    });
    if (day % 90 === 45) this.c.diplo.aiQuarter(p.aggression, p.warRatio);
  }

  // ===== 情勢分析と戦略方針(月に1度) =====
  private analyze(f: string, p: StrategyProfile, day: number): void {
    const mine = this.citiesOf(f);
    const pers = this.factionPersonality(f);
    const power = this.strengthOf(f);
    const rep = this.c.economy.report(f);
    const purse = this.c.factionStates[f] ?? { gold: 0, grain: 0 };
    const enemies = scenario.factions.filter((g) => !g.fallen && g.id !== f && this.c.atWar(f, g.id));
    const enemyPower = enemies.reduce((s, g) => s + this.strengthOf(g.id), 0);
    const cap = this.capitalOf(f);
    // 国境の脅威:自国の都市に近い敵の軍団の力
    const threat = this.c.armies.filter((o) => this.c.atWar(f, o.army.factionId) && mine.some((m) => distanceKm(m, o.army) < rules.plan.homeGuardKm)).reduce((s, o) => s + this.armyPower(o), 0);
    const stability = this.c.court.stability[f] ?? 60;
    const broke = rep.net < 0 && purse.gold < rep.expense.total * 2;
    const hungry = purse.grain < rep.expense.grain * 2;
    const weakestEnemy = enemies.map((g) => ({ g, pw: this.strengthOf(g.id) })).sort((a, b) => a.pw - b.pw)[0];
    // 同盟国・属国の動き:同盟国が戦っている相手は、共通の敵になる
    const allies = scenario.factions.filter((g) => !g.fallen && g.id !== f && ["alliance", "vassal"].includes(this.c.relationOf(f, g.id)));
    const share = power / Math.max(1, scenario.factions.filter((g) => !g.fallen).reduce((s, g) => s + this.strengthOf(g.id), 0));

    let posture: Posture;
    let reason: string;
    if (threat > power * (0.55 - 0.15 * pers.aggr + 0.15 * pers.caution) || stability < 25) {
      posture = "defend";
      reason = stability < 25 ? `国内が不安定(安定度${Math.round(stability)})なため守りを固める` : `国境に敵の軍団(兵力の目安${Math.round(threat)})が迫るため防衛を優先`;
    } else if (broke || hungry) {
      posture = "develop";
      reason = broke ? "財政が赤字で蓄えも乏しいため内政を優先" : "兵糧が乏しいため内政を優先";
    } else if (enemies.length && weakestEnemy && power > weakestEnemy.pw * (1.1 - 0.3 * pers.aggr)) {
      posture = pers.unify > 0.5 && share > 0.3 ? "unify" : "invade";
      reason = `${this.name(weakestEnemy.g.id)}より兵力で優る(${Math.round(power)}対${Math.round(weakestEnemy.pw)})ため攻勢に出る`;
    } else if (enemies.length) {
      posture = "defend";
      reason = `敵(${enemies.map((g) => this.name(g.id)).join("・")})の兵力(${Math.round(enemyPower)})が大きいため守勢`;
    } else if (pers.diplomacy > 0.35 && pers.aggr < 0.2) {
      posture = "diplomacy";
      reason = `戦争をしておらず、君主の性格(${pers.label})から外交で勢力を保つ`;
    } else if (pers.aggr + pers.unify * 0.5 > 0.15 || rep.net > rep.expense.total * 0.3) {
      posture = pers.unify > 0.5 && share > 0.3 ? "unify" : "expand";
      reason = `財政に余裕があり(収支${Math.round(rep.net)})、勢力の拡大をねらう`;
    } else {
      posture = "develop";
      reason = "戦争がなく、内政で国力を蓄える";
    }
    const prev = this.posture[f];
    if (!prev || prev.posture !== posture) {
      this.posture[f] = { posture, reason, since: day };
      this.note(f, `方針を「${POSTURE_LABEL[posture]}」にする — ${reason}`);
    } else prev.reason = reason;

    // 宣戦:拡大・統一の方針で、戦う相手がいないか少ないとき、弱い隣国を選ぶ(同盟・不可侵・従属の相手は除く)
    const wars = enemies.length;
    if ((posture === "expand" || posture === "unify" || (posture === "invade" && wars === 0)) && wars < (posture === "unify" ? 2 : 1) && cap) {
      const ratioNeed = p.warRatio * (1 - 0.25 * pers.aggr + 0.15 * pers.caution);
      const cands = scenario.factions
        .filter((g) => !g.fallen && !g.passive && g.id !== f && !allies.includes(g))
        .filter((g) => !["war", "alliance", "nonaggression", "vassal"].includes(this.c.relationOf(f, g.id)) && this.c.diplo.overlord[g.id] !== f && this.c.diplo.overlord[f] !== g.id)
        .filter((g) => this.c.relationAge(f, g.id) >= 360)
        .map((g) => {
          const theirs = this.citiesOf(g.id);
          const near = theirs.length ? Math.min(...theirs.map((t) => Math.min(...mine.map((m) => distanceKm(m, t))))) : 9999;
          return { g, pw: this.strengthOf(g.id), near, cities: theirs.length };
        })
        .filter((x) => x.cities > 0 && x.near < p.reachKm * 1.2 && power >= x.pw * ratioNeed)
        // 西域の小国は、遠い中国本土の国には仕掛けない
        .filter((x) => !(mine.every((m) => m.lon < 96) && this.citiesOf(x.g.id).every((t) => t.lon >= 96)))
        .sort((a, b) => a.pw / (power + 1) + a.near / 1000 - (b.pw / (power + 1) + b.near / 1000));
      const t = cands[0];
      const odds = p.aggression * (1 + pers.aggr) * (1 + 0.5 * pers.unify);
      if (t && chance(`${day}|${f}|declare|${t.g.id}`) < odds) {
        const r = this.c.diplo.act(f, t.g.id, "war");
        if (r.ok) {
          this.st(f).wars++;
          this.note(f, `${this.name(t.g.id)}に宣戦 — 兵力${Math.round(power)}対${Math.round(t.pw)}、国境まで${Math.round(t.near)}km(方針:${POSTURE_LABEL[posture]}、性格:${pers.label})`);
        }
      } else if (t) this.note(f, `${this.name(t.g.id)}への宣戦を見送る(今月は機が熟さない)`);
    }
  }

  // ===== 行動(数日に1度) =====
  private act(factionId: string, p: StrategyProfile): void {
    const mine = this.citiesOf(factionId);
    if (mine.length === 0) return;
    const enemies = this.enemyCitiesOf(factionId);
    const front = (c: City): number => enemies.reduce((best, e) => Math.min(best, distanceKm(c, e)), 9999);
    const posture = this.posture[factionId]?.posture ?? "develop";

    // 予算:維持費と俸禄を先に確保する。蓄えが支出の3か月分を超えた分だけを、募兵・編成・内政に回す
    const rep = this.c.economy.report(factionId);
    const purse = this.c.factionStates[factionId] ?? { gold: 0, grain: 0 };
    const reserve = rep.expense.total * 3;
    const arrears = this.c.economy.arrearsOf(factionId);
    // 財政難:募兵と開発を止め、未払いが2か月続けば、いちばん小さい軍団を都市に戻す
    if (arrears >= 2) {
      const small = this.c.armies.filter((s) => s.army.factionId === factionId && s.status !== "fighting" && s.status !== "marching" && !this.opOf(s.army.id)).sort((x, y) => totalTroops(x.army) - totalTroops(y.army))[0];
      if (small) {
        this.c.disbandArmy(small.army.id);
        this.note(factionId, `給与の未払いが続くため、${small.army.name}を解散して都市に戻す`);
      }
      return this.military(factionId, p, mine, enemies);
    }
    const spare = purse.gold - reserve;
    const atWar = enemies.length > 0;
    // 募兵:戦争中か、拡大・統一の方針で、蓄えに余裕があるとき。敵に近い都市から、守備兵を上限の6割まで
    let recruited = 0;
    const wantsArmy = atWar || posture === "expand" || posture === "unify" || posture === "defend";
    if (wantsArmy && spare > 0 && rep.net > -rep.expense.total * 0.15 && purse.grain > rep.expense.grain * 2) {
      for (const city of [...mine].sort((a, b) => front(a) - front(b))) {
        if (recruited >= (posture === "defend" || posture === "unify" ? 3 : 2)) break;
        const want = garrisonCap(city) * 0.6 - this.c.cityState(city).garrison;
        if (want < 100) continue;
        if (this.c.recruit(city.id, Math.min(want, p.recruitPerTurn)) === null) recruited++;
      }
    }
    // 内政:さらに余裕があれば都市を開発する(内政重視の方針なら1都市多く)
    const extra = posture === "develop" || posture === "diplomacy" ? 1 : 0;
    const projects = Math.min(4, (purse.gold - reserve > 3000 ? 3 : purse.gold - reserve > 1200 ? 2 : purse.gold - reserve > 400 ? 1 : 0) + (purse.gold - reserve > 400 ? extra : 0));
    const ready = [...mine].filter((c) => c.kind !== "pass").sort((a, b) => (b.economy ?? 0) + (b.food ?? 0) - ((a.economy ?? 0) + (a.food ?? 0)))
      .filter((c) => { const st = this.c.cityStates[c.id]; return st?.devDay === undefined || Math.floor(this.c.day) - st.devDay >= 60; });
    for (const target of ready.slice(0, projects)) {
      const st = this.c.cityState(target);
      const e = cityEcon(target, st);
      const kind = e.order < 50 ? "order" : st.wallDamage > 0.3 ? "walls" : e.pop < (target.population ?? 0) * 0.85 ? "population" : e.commerce <= e.agri ? "commerce" : "agri";
      const done = (kind === "agri" && e.agri >= 100) || (kind === "commerce" && e.commerce >= 100);
      this.c.economy.develop(target.id, done ? (e.fortify < 20 ? "walls" : "granary") : kind);
    }
    // 軍団の維持費をまかなえないなら、新しい軍団は作らない
    const canAffordArmy = rep.net > 120 && spare > 300;

    // 軍団の編成:守備兵に余裕のある都市から出す(侵攻・統一の方針なら、1軍団多く持つ)
    const armies = this.c.armies.filter((s) => s.army.factionId === factionId);
    const maxArmies = 1 + Math.floor(mine.length / 5) + p.extraArmies + (posture === "unify" || posture === "invade" ? 1 : 0);
    if (armies.length < maxArmies && canAffordArmy && wantsArmy) {
      const base = [...mine].filter((c) => c.kind !== "pass").sort((a, b) => this.c.cityState(b).garrison - this.c.cityState(a).garrison)[0];
      if (base) {
        const free2 = this.c.cityState(base).garrison - Math.max(rules.costs.minGarrison * 2, garrisonCap(base) * 0.25);
        const troops = Math.min(free2, rules.costs.maxArmy);
        if (troops >= rules.costs.minArmy) {
          // 軍団長:役目のない武将のうち、統率と武力の高い人(機動戦を好む君主なら統率を重んじる)
          const free = persons
            .filter((x) => x.factionId === factionId && x.role !== "strategist" && x.role !== "minister" && x.role !== "ruler" && this.c.personStatus(x.id) === "active" && !this.c.postOf(x.id))
            .sort((a, b) => b.leadership * 1.2 + b.war - (a.leadership * 1.2 + a.war))[0];
          const raised = this.c.raiseArmy(base.id, troops, free?.id);
          if (typeof raised !== "string") {
            this.note(factionId, `${base.name}で軍団を編成(${Math.round(troops)}人、軍団長:${free?.name ?? "なし"})`);
            // 副将:指揮官と相性のよい、役目のない人
            if (free) {
              const dep = persons.filter((x) => x.factionId === factionId && x.role === "general" && x.id !== free.id && this.c.personStatus(x.id) === "active" && !this.c.postOf(x.id))
                .sort((a, b) => affinity(free, b).value - affinity(free, a).value)[0];
              if (dep && affinity(free, dep).value >= 55) this.c.appoint(dep.id, { kind: "deputy", id: raised.army.id });
            }
          }
        }
      }
    }

    this.military(factionId, p, mine, enemies);
  }

  // ===== 軍事 =====
  opOf(armyId: string): Operation | undefined {
    return this.ops.find((o) => o.armyId === armyId);
  }

  private goTo(s: ArmyState, lon: number, lat: number): boolean {
    const route = this.c.planRoute(s.army.id, { lon, lat }, 3);
    if (!route) return false;
    this.c.orderMove(s.army.id, route);
    this.st(s.army.factionId).moves++;
    return true;
  }

  private homeOf(s: ArmyState, mine: City[]): City {
    return [...mine].sort((x, y) => distanceKm(x, s.army) - distanceKm(y, s.army))[0];
  }

  private endOp(op: Operation): void {
    const i = this.ops.indexOf(op);
    if (i >= 0) this.ops.splice(i, 1);
  }

  private retreat(op: Operation, s: ArmyState, mine: City[], why: string, key = why): void {
    const home = this.homeOf(s, mine);
    op.status = "retreating";
    this.st(op.factionId).retreats++;
    this.st(op.factionId).aborted[key] = (this.st(op.factionId).aborted[key] ?? 0) + 1;
    const target = op.targetCityId ? this.c.cities.find((c) => c.id === op.targetCityId)?.name : undefined;
    this.note(op.factionId, `${s.army.name}が${target ? `${target}への作戦を中止し、` : ""}${home.name}へ撤退 — ${why}`);
    if (!this.goTo(s, home.lon, home.lat)) this.endOp(op);
  }

  /** 進行中の作戦の見直し(到着・占領・撤退の判断) */
  private updateOps(f: string, p: StrategyProfile, mine: City[]): void {
    const day = Math.floor(this.c.day);
    const cap = this.capitalOf(f);
    for (const op of this.ops.filter((o) => o.factionId === f)) {
      const s = this.c.stateOf(op.armyId);
      if (!s) {
        this.st(f).aborted["軍団の壊滅"] = (this.st(f).aborted["軍団の壊滅"] ?? 0) + 1;
        this.note(f, `作戦中の軍団を失った`);
        this.endOp(op);
        continue;
      }
      if (op.status === "retreating") {
        if (s.status !== "marching" && s.supplied) this.endOp(op);
        else if (s.status === "camping" && !s.supplied) this.goTo(s, this.homeOf(s, mine).lon, this.homeOf(s, mine).lat);
        continue;
      }
      if (s.status === "fighting") continue;
      const city = op.targetCityId ? this.c.cities.find((c) => c.id === op.targetCityId) : undefined;
      // 目標の都市を落とした・相手と和平した・目標の軍団が消えた
      if (city && scenario.cityOwners[city.id] === f) {
        this.endOp(op);
        continue;
      }
      if (city && !this.c.atWar(f, scenario.cityOwners[city.id])) {
        this.st(f).aborted["和平・停戦"] = (this.st(f).aborted["和平・停戦"] ?? 0) + 1;
        this.note(f, `${city.name}の持ち主と戦争でなくなったため、作戦を終える`);
        this.endOp(op);
        continue;
      }
      if (op.targetArmyId && !this.c.stateOf(op.targetArmyId)) {
        this.endOp(op);
        continue;
      }
      // 到着
      if (city && !op.arrived && distanceKm(s.army, city) < 45) {
        op.arrived = true;
        op.status = "arrived";
        op.idleSince = day;
        this.st(f).arrived++;
        this.note(f, `${s.army.name}が${city.name}に到着`);
      }
      // 撤退の判断(性格で、粘り強さが変わる)
      const pers = this.personalityOf(this.c.rulerOf(f));
      const cmd = this.personalityOf(persons.find((x) => x.id === s.army.commanderId));
      const lossLimit = rules.plan.retreatLoss * (1 + 0.3 * (pers.aggr + cmd.aggr) / 2 - 0.3 * (pers.caution + cmd.caution) / 2);
      const troops = totalTroops(s.army);
      const home = this.homeOf(s, mine);
      const backDays = distanceKm(home, s.army) / rules.plan.marchKmPerDay;
      const near = this.c.armies.filter((o) => this.c.atWar(f, o.army.factionId) && distanceKm(o.army, s.army) < 150);
      const relief = near.reduce((sum, o) => sum + this.armyPower(o), 0);
      const capThreat = cap ? this.c.armies.filter((o) => this.c.atWar(f, o.army.factionId) && distanceKm(o.army, cap) < 120).reduce((sum, o) => sum + this.armyPower(o), 0) : 0;
      let why: string | null = null;
      let key = "";
      if (troops < op.troops0 * (1 - lossLimit)) [why, key] = [`兵力が大きく減った(${op.troops0}→${troops})`, "兵力の大幅な減少"];
      else if (!s.supplied && s.army.food < backDays + 3) [why, key] = [`兵糧が尽きかけている(残り${Math.round(s.army.food)}日分)`, "兵糧不足"];
      else if (op.commander0 && !s.army.commanderId) [why, key] = ["指揮官を失った", "指揮官の喪失"];
      else if (relief > this.armyPower(s) * (1.3 + 0.4 * cmd.aggr)) [why, key] = [`敵の援軍が接近(兵力の目安${Math.round(relief)})`, "敵援軍の接近"];
      else if (cap && capThreat > this.c.cityState(cap).garrison * 1.2 && distanceKm(cap, s.army) > 150 && op.kind !== "intercept") [why, key] = [`首都${cap.name}に敵が迫った`, "首都への敵侵攻"];
      else if ((this.c.court.stability[f] ?? 60) < 15) [why, key] = ["国内で反乱の恐れが高まった", "国内の反乱"];
      else if (day - op.startDay > 300) [why, key] = ["作戦が長引いた", "作戦の長期化"];
      if (why) {
        this.retreat(op, s, mine, why, key);
        continue;
      }
      // 都市の前で止まったまま、戦いが始まらない:攻城をやり直す(それでも始まらなければ作戦を終える)
      if (city && op.arrived && s.status === "camping") {
        if (day - (op.idleSince ?? day) > 20) {
          this.st(f).aborted["攻城が始められない"] = (this.st(f).aborted["攻城が始められない"] ?? 0) + 1;
          this.endOp(op);
          continue;
        }
        this.goTo(s, city.lon, city.lat);
        continue;
      }
      // 行軍が止まってしまった(経路の途中で野営):目的地へ向かい直す
      if (city && s.status === "camping" && !op.arrived) {
        if (!this.goTo(s, city.lon, city.lat)) {
          this.st(f).aborted["経路が見つからない"] = (this.st(f).aborted["経路が見つからない"] ?? 0) + 1;
          this.endOp(op);
        }
      }
      if (op.targetArmyId && s.status === "camping") {
        const t = this.c.stateOf(op.targetArmyId)!;
        if (distanceKm(t.army, s.army) > p.reachKm || !this.goTo(s, t.army.lon, t.army.lat)) this.endOp(op);
      }
    }
  }

  private military(f: string, p: StrategyProfile, mine: City[], enemyCities: City[]): void {
    this.updateOps(f, p, mine);
    const posture = this.posture[f]?.posture ?? "develop";
    const pers = this.factionPersonality(f);
    const cap = this.capitalOf(f);
    const all = this.c.armies.filter((s) => s.army.factionId === f);
    const free = (): ArmyState[] =>
      all.filter((s) => this.c.armies.includes(s) && s.status !== "fighting" && !this.opOf(s.army.id) && !this.c.diplo.aidOf(s.army.id) && !this.c.history?.reservedArmy(s.army.commanderId) && !this.c.history?.taggedArmy(s.army.id));

    // 歴史の会戦の前:主力(大きい2軍団)は、戦場に近い自国の都市に集結する
    const stage = this.c.history?.stagingFor(f);
    const staged = new Set<ArmyState>();
    if (stage) {
      for (const s of all.filter((x) => distanceKm(x.army, stage) < 800).sort((x, y) => totalTroops(y.army) - totalTroops(x.army)).slice(0, 2)) {
        if (s.status === "fighting" || this.opOf(s.army.id)) continue;
        staged.add(s);
        if (distanceKm(s.army, stage) > 80 && s.status !== "marching") this.goTo(s, stage.lon, stage.lat);
      }
    }
    const idle = (): ArmyState[] => free().filter((s) => !staged.has(s) && s.status !== "marching");

    // 1) 補給:食糧・士気・疲労が悪い軍団は、味方の都市へ戻って休む。そばの都市から兵を補う
    for (const s of idle()) {
      const a = s.army;
      const desertLow = !s.supplied && a.food < 18 && this.c.terrainOf(s) === "desert";
      const home = this.homeOf(s, mine);
      if (a.food < 8 || a.morale < 40 || a.fatigue > 70 || desertLow) {
        if (!s.supplied) this.goTo(s, home.lon, home.lat);
        continue;
      }
      if (s.supplied && distanceKm(home, a) < 60 && totalTroops(a) < rules.costs.maxArmy * rules.costs.armyGrowth && this.c.cityState(home).garrison > garrisonCap(home) * 0.45) {
        this.c.reinforce(a.id, home.id, 1500);
      }
    }

    // 2) 迎撃:自国の都市に近づいた敵の軍団へ(勝てそうなときだけ)
    const threats = this.c.armies.filter((o) => this.c.atWar(f, o.army.factionId) && mine.some((c) => distanceKm(c, o.army) < p.defendKm * (posture === "defend" ? 1.3 : 1)));
    for (const t of threats) {
      if (this.ops.some((o) => o.targetArmyId === t.army.id && o.factionId === f)) continue;
      const cand = idle().filter((s) => this.ready(s) && distanceKm(s.army, t.army) < p.reachKm && this.armyPower(s) >= this.armyPower(t) * p.interceptRatio * (1 + 0.2 * pers.caution))
        .sort((x, y) => distanceKm(x.army, t.army) - distanceKm(y.army, t.army))[0];
      if (cand && this.goTo(cand, t.army.lon, t.army.lat)) {
        this.addOp(f, cand, "intercept", { targetArmyId: t.army.id, reason: `${t.army.name}が国境に接近` });
        this.note(f, `${cand.army.name}を、接近する${this.name(t.army.factionId)}の${t.army.name}の迎撃に向ける`);
      }
    }

    // 3) 首都の守り:敵が近いときは、首都にいちばん近い軍団を1つ残す(軍団が2つ以上あるとき)
    let guard: ArmyState | undefined;
    if (cap && all.length >= 2) {
      const danger = this.c.armies.some((o) => this.c.atWar(f, o.army.factionId) && distanceKm(o.army, cap) < rules.plan.homeGuardKm);
      if (danger || posture === "defend") {
        guard = idle().sort((x, y) => distanceKm(x.army, cap) - distanceKm(y.army, cap))[0];
        if (guard) {
          this.st(f).guards++;
          if (distanceKm(guard.army, cap) > 60 && this.goTo(guard, cap.lon, cap.lat)) this.note(f, `${guard.army.name}を首都${cap.name}の守りに戻す`);
        }
      }
    }

    // 4) 主作戦の援護:作戦中の軍団に敵の軍団が迫れば、手の空いた軍団で援護・予備として送る
    for (const op of this.ops.filter((o) => o.factionId === f && o.kind === "attack" && o.status !== "retreating")) {
      const lead = this.c.stateOf(op.armyId);
      if (!lead) continue;
      const foe = this.c.armies.find((o) => this.c.atWar(f, o.army.factionId) && distanceKm(o.army, lead.army) < 180 && o.status !== "fighting");
      const weak = totalTroops(lead.army) < op.troops0 * 0.7;
      if (!foe && !weak) continue;
      if (this.ops.some((o) => o.leadId === op.id && (o.kind === "cover" || o.kind === "reserve"))) continue;
      const helper = idle().filter((s) => s !== guard && this.ready(s) && distanceKm(s.army, lead.army) < 320).sort((x, y) => distanceKm(x.army, lead.army) - distanceKm(y.army, lead.army))[0];
      if (!helper) continue;
      if (foe && this.goTo(helper, foe.army.lon, foe.army.lat)) {
        this.addOp(f, helper, "cover", { targetArmyId: foe.army.id, leadId: op.id, reason: "主力への敵の援軍を阻む" });
        this.st(f).coordinated++;
        this.note(f, `${helper.army.name}が、主力(${lead.army.name})に迫る${foe.army.name}を迎え撃つ(援護)`);
      } else if (weak && op.targetCityId) {
        const city = this.c.cities.find((c) => c.id === op.targetCityId)!;
        if (this.goTo(helper, city.lon, city.lat)) {
          this.addOp(f, helper, "reserve", { targetCityId: city.id, leadId: op.id, reason: "損耗した主力に予備を投入" });
          this.st(f).coordinated++;
          this.note(f, `主力が損耗したため、予備の${helper.army.name}を${city.name}へ投入`);
        }
      }
    }

    // 5) 侵攻:方針が攻めのとき(守勢でも、すぐそばに落とせる都市があれば)
    const offensive = posture === "invade" || posture === "unify" || posture === "expand";
    if (enemyCities.length && (offensive || posture === "defend" || posture === "develop" || posture === "diplomacy")) {
      for (const s of idle()) {
        if (s === guard || !this.ready(s)) continue;
        if (this.opOf(s.army.id)) continue;
        this.planAttack(f, s, p, pers, posture, mine, enemyCities, idle().filter((x) => x !== s && x !== guard));
      }
    }

    // 6) することがなければ、補給の届く所へ戻る
    for (const s of idle()) if (!s.supplied && s !== guard && !this.opOf(s.army.id)) this.goTo(s, this.homeOf(s, mine).lon, this.homeOf(s, mine).lat);
  }

  /** 1つの軍団への命令(補給 → 侵攻の判断)。テストと、古い呼び出し方のために残す */
  orderArmy(s: ArmyState, p: StrategyProfile, mine: City[], enemyCities: City[]): void {
    const a = s.army;
    const desertLow = !s.supplied && a.food < 18 && this.c.terrainOf(s) === "desert";
    if (a.food < 8 || a.morale < 40 || a.fatigue > 70 || desertLow) {
      if (!s.supplied) {
        const home = this.homeOf(s, mine);
        this.goTo(s, home.lon, home.lat);
      }
      return;
    }
    if (!this.ready(s)) return;
    this.planAttack(a.factionId, s, p, this.factionPersonality(a.factionId), "invade", mine, enemyCities, []);
  }

  private ready(s: ArmyState): boolean {
    return s.army.food >= 20 && s.army.morale >= 55 && s.army.fatigue <= 60;
  }

  private addOp(f: string, s: ArmyState, kind: Operation["kind"], o: Partial<Operation>): Operation {
    const owner = o.targetCityId ? scenario.cityOwners[o.targetCityId] : o.targetArmyId ? this.c.stateOf(o.targetArmyId)?.army.factionId : undefined;
    const op: Operation = { id: this.nextOp++, factionId: f, armyId: s.army.id, kind, startDay: Math.floor(this.c.day), status: "marching", troops0: totalTroops(s.army), arrived: false, commander0: s.army.commanderId || undefined, vsPlayer: !!owner && owner === this.c.playerFactionId, reason: "", ...o };
    this.ops.push(op);
    return op;
  }

  /**
   * 攻撃目標の評価:勝算・必要な兵力と兵糧・到着までの日数・地形・都市の価値・戦略上の重要さ・
   * 敵の援軍の見込み・自国の守りの手薄さ・戦後に保てるか、から点数を付けて選ぶ。
   */
  private planAttack(f: string, s: ArmyState, p: StrategyProfile, pers: Personality, posture: Posture, mine: City[], enemyCities: City[], partners: ArmyState[]): void {
    const a = s.army;
    const st = this.st(f);
    const cmd = this.personalityOf(persons.find((x) => x.id === a.commanderId));
    const reach = p.reachKm * (1 + 0.25 * Math.max(pers.mobility, cmd.mobility)) * (posture === "unify" ? 1.2 : 1);
    const attackRatio = p.attackRatio * (1 - 0.15 * pers.aggr + 0.12 * pers.caution) * (posture === "defend" || posture === "develop" || posture === "diplomacy" ? 1.6 : 1);
    const foodMargin = rules.plan.foodMargin * (1 + 0.3 * pers.logistics);
    const cap = this.capitalOf(f);
    const power = this.armyPower(s);
    const reasons: Record<string, number> = {};
    const reject = (r: string): void => void (reasons[r] = (reasons[r] ?? 0) + 1);
    type Cand = { city: City; score: number; ratio: number; days: number; need: number; why: string; partner?: ArmyState };
    let best: Cand | null = null;
    const near = [...enemyCities].sort((x, y) => Math.min(distanceKm(x, a), ...mine.map((m) => distanceKm(m, x))) - Math.min(distanceKm(y, a), ...mine.map((m) => distanceKm(m, y)))).slice(0, rules.plan.maxTargets);
    for (const city of near) {
      const dist = distanceKm(city, a);
      // 遠さは、自国のいちばん近い都市から測る(軍団は前線へ進んでから攻める)。軍団からは、その倍まで
      const nearestMine = Math.min(...mine.map((m) => distanceKm(m, city)));
      if (nearestMine > reach || dist > reach * 2.2) { reject("目標が遠すぎる"); continue; }
      // 西域の小国は、遠い中国本土へは攻め込まない(自国の都市から600km以内だけ)
      if (mine.every((m) => m.lon < 96) && city.lon >= 96 && nearestMine > 600) { reject("小国の遠征は無謀"); continue; }
      // 到着までの日数(地形の難しさで延びる)
      const terrain = this.c.terrainKindAt(city.lon, city.lat);
      const difficulty = TERRAIN_DIFFICULTY[terrain] ?? 1;
      const days = (dist * difficulty) / (rules.plan.marchKmPerDay * (1 + 0.15 * cmd.mobility));
      // 兵糧:補給の届かない区間を歩く日数ぶん(往きと、包囲の日数)を持っていること
      const gap = Math.max(0, nearestMine - this.c.supplyRangeKm);
      const foodNeed = (gap / rules.plan.marchKmPerDay) * foodMargin * 2 + rules.plan.foodReserveDays;
      if (gap > 0 && a.food < foodNeed) { reject("兵糧不足"); continue; }
      // 守りの強さ(自動戦闘と同じ式)+ 敵の援軍の見込み
      const cs = this.c.cityState(city);
      const owner = scenario.cityOwners[city.id];
      const guards = this.c.armies.filter((o) => o.army.factionId === owner && distanceKm(o.army, city) < 60).reduce((sum, o) => sum + this.armyPower(o), 0);
      const relief = this.c.armies.filter((o) => o.army.factionId === owner && distanceKm(o.army, city) >= 60 && distanceKm(o.army, city) < rules.plan.reliefKm).reduce((sum, o) => sum + this.armyPower(o), 0);
      const defense = cs.garrison * (0.55 + cs.morale / 220) * wallBonus(city.defense ?? 40) + guards + relief * 0.5;
      let ratio = power / Math.max(1, defense);
      let partner: ArmyState | undefined;
      // 1軍団で足りなければ、近くの手の空いた軍団と共同で攻める
      if (ratio < attackRatio) {
        partner = partners.filter((x) => this.ready(x) && distanceKm(x.army, city) < reach && !this.opOf(x.army.id)).sort((x, y) => distanceKm(x.army, city) - distanceKm(y.army, city))[0];
        if (partner) ratio = (power + this.armyPower(partner)) / Math.max(1, defense);
        if (ratio < attackRatio) { reject(relief > guards + 1 ? "敵の援軍が見込まれる" : "兵力不足"); continue; }
      }
      // 価値:経済・食糧・都市の格。首都と関所は戦略上重い。統一志向なら敵の首都をいっそう重んじる
      let value = 40 + (city.economy ?? 0) + (city.food ?? 0) * 0.5 + (city.kind === "pass" ? 60 : cityLevelOf(city) * 40);
      if (city.rank === "capital") value *= posture === "unify" ? 1.8 : 1.3;
      // 戦後に保てるか:自国の都市から近いほどよい
      const sustain = 1 / (1 + nearestMine / 300);
      // 自国の守りの手薄さ:首都を守る軍団がこれだけなら、首都から遠い目標は控える
      const exposure = cap && this.c.armies.filter((x) => x.army.factionId === f).length <= 1 && distanceKm(cap, city) > 300 ? 0.6 : 1;
      const score = (value * Math.min(ratio, 3) * sustain * exposure) / (days + 5) / difficulty;
      const why = `${city.name}(${this.name(owner)})の守りが${ratio >= 2.5 ? "薄い" : "崩せる"}ため攻撃目標に設定(勝算${ratio.toFixed(1)}倍・到着約${Math.round(days)}日${partner ? `・${partner.army.name}と共同` : ""}${relief > 0 ? "・援軍の見込みあり" : ""})`;
      if (!best || score > best.score) best = { city, score, ratio, days, need: defense * attackRatio, why, partner };
    }
    if (!best) {
      // 見送りの理由を記録する(いちばん多い理由)
      const top = Object.entries(reasons).sort((x, y) => y[1] - x[1])[0];
      if (top) {
        st.notLaunched[top[0]] = (st.notLaunched[top[0]] ?? 0) + 1;
        // 目標が遠いだけなら、前線の自国の都市まで進んで集結する(攻めの方針のときだけ)
        if (top[0] === "目標が遠すぎる" && (posture === "invade" || posture === "unify" || posture === "expand")) {
          const front = [...mine].filter((m) => m.kind !== "pass")
            .map((m) => ({ m, d: Math.min(...enemyCities.map((e) => distanceKm(m, e))) }))
            .sort((x, y) => x.d - y.d)[0];
          if (front && distanceKm(front.m, a) > 120 && front.d < distanceKm(a, near[0] ?? front.m) && this.goTo(s, front.m.lon, front.m.lat)) {
            this.note(f, `${a.name}を前線の${front.m.name}へ進めて集結させる(敵の都市まで${Math.round(front.d)}km)`);
            return;
          }
        }
        this.note(f, `${a.name}の出兵を見送る — ${top[0]}`);
      }
      return;
    }
    st.planned++;
    const route = this.c.planRoute(a.id, best.city, 3);
    if (!route) {
      st.notLaunched["経路が見つからない"] = (st.notLaunched["経路が見つからない"] ?? 0) + 1;
      this.note(f, `${best.city.name}への道が見つからず、出兵を中止`);
      return;
    }
    this.c.orderMove(a.id, route);
    st.moves++;
    st.dispatched++;
    const op = this.addOp(f, s, "attack", { targetCityId: best.city.id, reason: best.why });
    if (op.vsPlayer) st.vsPlayer++;
    if (best.city.lon < 96 && !mine.some((m) => m.lon < 96)) this.c.logistics.expeditions[f] = (this.c.logistics.expeditions[f] ?? 0) + 1;
    this.note(f, `${a.name}(${a.commanderId ? persons.find((x) => x.id === a.commanderId)?.name : "指揮官なし"})を出兵 — ${best.why}`);
    if (best.partner && this.goTo(best.partner, best.city.lon, best.city.lat)) {
      this.addOp(f, best.partner, "support", { targetCityId: best.city.id, leadId: op.id, reason: "共同攻撃" });
      st.dispatched++;
      st.coordinated++;
      if (op.vsPlayer) st.vsPlayer++;
    }
  }

  // ===== 戦闘の記録(Campaign から呼ぶ) =====
  onBattleStart(e: BattleEvent): void {
    const ai = (f: string): boolean => f !== this.c.playerFactionId;
    const sides = [e.attackerFactionId, e.defenderFactionId].filter(ai);
    for (const f of new Set(sides)) {
      if (e.battleType === "siege_battle") this.st(f).sieges++;
      else this.st(f).fieldBattles++;
    }
    const op = this.opOf(e.attackerArmyId);
    if (op && e.battleType === "siege_battle" && !op.arrived) {
      op.arrived = true;
      op.status = "arrived";
      this.st(op.factionId).arrived++;
    }
    if (op && e.battleType === "siege_battle" && e.defenderFactionId === this.c.playerFactionId && ai(e.attackerFactionId)) this.st(op.factionId).vsPlayerSieges++;
  }

  onBattleResult(e: BattleEvent, r: BattleResult): void {
    const f = e.attackerFactionId;
    if (f === this.c.playerFactionId) return;
    if (r.siege?.captured) {
      this.st(f).captures++;
      if (e.defenderFactionId === this.c.playerFactionId) this.st(f).vsPlayerCaptures++;
      this.note(f, `${e.location.name}を攻め落とした`);
      const op = this.opOf(e.attackerArmyId);
      if (op) this.endOp(op);
    } else if (r.winner === "defender") {
      const op = this.opOf(e.attackerArmyId);
      const s = this.c.stateOf(e.attackerArmyId);
      if (op && s && op.status !== "retreating") {
        const mine = this.citiesOf(f);
        if (mine.length) this.retreat(op, s, mine, `${e.location.name}の戦いに敗れた`, "戦いに敗れた");
      }
    }
  }

  // ===== 保存 =====
  serialize(): StrategySave {
    return JSON.parse(JSON.stringify({ ops: this.ops, stats: this.stats, posture: this.posture, log: this.log.slice(-150), nextOp: this.nextOp })) as StrategySave;
  }

  restore(save: StrategySave | undefined): void {
    this.ops = [];
    this.stats = {};
    this.posture = {};
    this.log = [];
    this.nextOp = 1;
    if (!save) return;
    this.ops = (save.ops ?? []).filter((o) => this.c.stateOf(o.armyId));
    this.stats = save.stats ?? {};
    for (const s of Object.values(this.stats)) Object.assign(s, { ...emptyStats(), ...s });
    this.posture = save.posture ?? {};
    this.log = save.log ?? [];
    this.nextOp = save.nextOp ?? 1;
  }
}
