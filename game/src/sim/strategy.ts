// 敵勢力の戦略AI(Version 40で全面改修)。
// 操作していない勢力が、毎月の情勢分析 → 戦略方針 → 攻撃目標の評価 → 軍団の編成・出兵 → 野戦・攻城 → 占領・撤退 を自分で行う。
// 資金や兵を無から増やすことはしない。使えるのは、その勢力の収入と守備兵だけ。
// 判断の理由は、開発用のログ(log)に残す(通常のプレイでは表示しない)。
import { cityLevelOf, initialCityOwners, personById, persons, scenario, totalTroops } from "../data";
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
/** AIの帰城・軍団結合の使い方(Version 51。調整と確かめのために、場面ごとに切り替えられる) */
export const armyOpsRules = { reorgMerge: true, wornReturn: true, idleReturn: true, rearReturn: true, capitalMerge: true, assemble: true };

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
  kind: "attack" | "support" | "intercept" | "cover" | "reserve" | "blockade";
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
  /** この作戦で行った攻城戦の数(落とせないまま3回で、攻城をあきらめる) */
  sieges?: number;
  /** 西域への遠征の作戦か */
  expedition?: boolean;
  /** 包囲(兵糧攻め)を始めた日。包囲は1つの作戦で1度だけ */
  blockadeStart?: number;
  blockaded?: boolean;
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
  /** 迎撃・援護の出動(都市を攻める出兵とは別に数える) */
  intercepts: number;
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
  /** 戦略方針を変えた回数 */
  postureChanges: number;
  /** 膠着した戦争での和平・停戦の申し入れ、従属の要求 */
  peaceTries: number;
  vassalDemands: number;
  /** 軍団の再編成(小さな軍団をまとめる)・包囲(兵糧攻め)・軍備増強 */
  reorganized: number;
  blockades: number;
  buildUps: number;
  /** 長く従えた小さな属国を、併合した数 */
  annexed: number;
  /** 西域への自主的な遠征:計画・従属の要求・従属・出発・到着・占領・失敗・外交での決着 */
  westPlans: number;
  westVassalTries: number;
  westVassals: number;
  westDispatched: number;
  /** 首都(Version 41):敵の首都への出兵・自国の首都の守り・首都の救援・遷都 */
  capitalAttacks: number;
  capitalGuards: number;
  capitalRelief: number;
  capitalMoves: number;
  /** 首都の防衛(Version 42):首都の増兵・軍団の呼び戻し・君主の退避(退避中に捕まった数)・停戦の申し入れ */
  capitalReinforce: number;
  capitalRecall: number;
  rulerEvacuations: number;
  rulerCaught: number;
  capitalPeace: number;
  capitalHoldout: number;
  westArrived: number;
  westWon: number;
  westFailed: number;
  westDiplomatic: number;
}

export interface AiLogEntry { day: number; date: string; factionId: string; text: string }

export interface StrategySave {
  ops: Operation[];
  stats: Record<string, AiStats>;
  posture: Record<string, { posture: Posture; reason: string; since: number }>;
  log: AiLogEntry[];
  nextOp: number;
  failed?: Record<string, number>;
  lastCapture?: Record<string, number>;
  expeditions?: StrategyAi["expeditions"];
  capitalMoved?: Record<string, number>;
}

const emptyStats = (): AiStats => ({ planned: 0, dispatched: 0, arrived: 0, fieldBattles: 0, sieges: 0, captures: 0, retreats: 0, moves: 0, vsPlayer: 0, vsPlayerSieges: 0, vsPlayerCaptures: 0, notLaunched: {}, aborted: {}, wars: 0, coordinated: 0, guards: 0, intercepts: 0, postureChanges: 0, peaceTries: 0, vassalDemands: 0, reorganized: 0, blockades: 0, buildUps: 0, annexed: 0, westPlans: 0, westVassalTries: 0, westVassals: 0, westDispatched: 0, westArrived: 0, westWon: 0, westFailed: 0, westDiplomatic: 0, capitalAttacks: 0, capitalGuards: 0, capitalRelief: 0, capitalMoves: 0, capitalReinforce: 0, capitalRecall: 0, rulerEvacuations: 0, rulerCaught: 0, capitalPeace: 0, capitalHoldout: 0 });
const clamp = (v: number, lo = -1, hi = 1): number => Math.max(lo, Math.min(hi, v));
/** 外交を好む・慎重な性格なら、優勢でも膠着した戦争をやめやすい */
const posture_hint = (p: { diplomacy: number; caution: number }): boolean => p.diplomacy + p.caution > 0.6;
const TERRAIN_DIFFICULTY: Record<string, number> = { highMountain: 1.8, mountain: 1.45, desert: 1.3, hill: 1.15, forest: 1.1, crossing: 1.2, river: 1.1 };

/** 関中の都市(夏の赫連勃勃が狙う。劉裕の北伐の追加) */
const GUANZHONG = ["changan", "fengyi", "anding", "chencang", "shanggui", "puban", "hongnong", "gaonu"];

export class StrategyAi {
  ops: Operation[] = [];
  stats: Record<string, AiStats> = {};
  posture: Record<string, { posture: Posture; reason: string; since: number }> = {};
  log: AiLogEntry[] = [];
  private nextOp = 1;
  /** 攻めて失敗した目標(勢力|都市 → 日)。1年は同じ目標を選ばない */
  failed: Record<string, number> = {};
  /** 出兵の判断の記録(Version 42。セーブには残さない) */
  decisions: { date: string; faction: string; army: string; from: string; target: string; owner: string; routeKm: number; straightKm: number; days: number; foodNeed: number; food: number; value: number; ratio: number; score: number; nearestMine: number; posture: string; homeGuards: number; others: string[] }[] = [];
  /** 遷都した日(勢力ごと。1年に1度まで) */
  capitalMoved: Record<string, number> = {};
  /** 2つの国のあいだで、最後に都市が奪われた日(膠着の判断に使う) */
  lastCapture: Record<string, number> = {};
  /** 兵力不足で出兵を見送った回数の、前の月の値(増えていれば軍備を増強する) */
  private shortSeen: Record<string, number> = {};
  /** 軍備増強中の勢力(月ごとに見直す) */
  buildUp: Record<string, boolean> = {};
  /** 軍団を編成した日(できたばかりの軍団を、すぐ再編成でまとめないため) */
  raised: Record<string, number> = {};
  /** 西域への遠征(勢力ごとに1つ):目標の国・都市、出す軍団、段階(集結→進軍) */
  expeditions: Record<string, { target: string; cityId: string; gateId: string; armyId: string; since: number; state: "gather" | "march"; foodNeed: number }> = {};

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
    const line = `${this.name(f)}:${text}`;
    if (this.log.some((l) => l.factionId === f && l.text === line && day - l.day < 30)) return;
    this.log.push({ day, date: this.c.dateText(), factionId: f, text: line });
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
  /** 国の中心(都市の格で重みを付けた重心。首都は重く) */
  coreOf(f: string): { lon: number; lat: number } | null {
    const mine = this.citiesOf(f).filter((c) => c.kind !== "pass");
    if (!mine.length) return null;
    const cap = this.c.capitalCityOf?.(f);
    let w = 0, lon = 0, lat = 0;
    for (const c of mine) {
      const k = Math.pow(cityLevelOf(c) + 1, 2) * (c.id === cap?.id ? 3 : 1);
      w += k;
      lon += c.lon * k;
      lat += c.lat * k;
    }
    return { lon: lon / w, lat: lat / w };
  }

  /**
   * 戦略的な関心(Version 42):0〜1。国の中心と前線からの近さ、もとの自国の地(シナリオ開始時の持ち主)、国内の安定、
   * 歴史のモード(史実重視ほど本拠から遠い所に関心が薄い)で決める。遠い目標を一律には禁じない(関心が薄いだけ)。
   */
  interest(f: string, city: { id: string; lon: number; lat: number }): number {
    const mine = this.citiesOf(f);
    const core = this.coreOf(f);
    if (!mine.length || !core) return 0;
    const dNear = Math.min(...mine.map((m) => distanceKm(m, city)));
    const dCore = distanceKm(core, city);
    const mode = this.c.historyMode === "historic" ? 1.35 : this.c.historyMode === "free" ? 0.75 : 1;
    let v = Math.exp(-Math.max(0, dNear - 200) / (650 / mode)) * Math.exp(-Math.max(0, dCore - 700) / (900 / mode));
    if (initialCityOwners[city.id] === f) v = Math.min(1, v * 1.5 + 0.1); // もとの自国の地
    const stab = this.c.court.stability[f] ?? 60;
    if (stab < 45 && dCore > 500) v *= 0.6; // 国内が揺れているときは、遠くへ手を伸ばさない
    // 本拠の近くで戦争が続いているとき(内乱など)は、遠い所への関心がさらに薄い
    const homeWar = scenario.factions.some((g) => !g.fallen && g.id !== f && this.c.atWar(f, g.id) && this.citiesOf(g.id).some((t) => distanceKm(t, core) < 600));
    if (homeWar && dCore > 900) v *= 0.5;
    return Math.max(0, Math.min(1, v));
  }

  /** 退避中の君主が捕まった(記録用) */
  noteCaught(f: string): void {
    this.st(f).rulerCaught++;
  }

  /** 首都の危うさ:首都へ向かう・首都のそばにいる敵の力 ÷ 首都の守り(守備兵と、そばの自国の軍団) */
  capitalDanger(f: string, cap: City): { level: number; foes: ArmyState[]; foePower: number; own: number } {
    // 首都へ向かう敵・首都のそばの敵は重み1。首都から300km以内にいる戦争相手の軍団は、これから向かいうるので重み0.4
    let foePower = 0;
    const foes: ArmyState[] = [];
    for (const o of this.c.armies) {
      if (!this.c.atWar(f, o.army.factionId)) continue;
      const d = distanceKm(o.army, cap);
      if (d > 350) continue;
      const end = o.route?.points[o.route.points.length - 1];
      const heading = d < 150 || (!!end && distanceKm(end, cap) < 80) || this.opOf(o.army.id)?.targetCityId === cap.id || o.targetCityId === cap.id;
      if (heading) foes.push(o);
      if (heading || d < 300) foePower += this.armyPower(o) * (heading ? 1 : 0.4);
    }
    const cs = this.c.cityState(cap);
    const own = cs.garrison * (0.55 + cs.morale / 220) * wallBonus(cap.defense ?? 40) + this.c.armies.filter((x) => x.army.factionId === f && distanceKm(x.army, cap) < 80).reduce((s2, x) => s2 + this.armyPower(x), 0);
    return { level: foePower / Math.max(1, own), foes, foePower, own };
  }

  private capDefDay: Record<string, Record<string, number>> = {};
  private capitalDefense(f: string, _p: StrategyProfile, mine: City[], cap: City, idle: () => ArmyState[], guard: ArmyState | undefined): void {
    const d = this.capitalDanger(f, cap);
    if (d.level < 0.6) return;
    // 迫る敵がまだいない(近くにいるだけ)なら、増兵と籠城の備えだけをする
    if (!d.foes.length) {
      const near0 = this.c.armies.filter((o) => this.c.atWar(f, o.army.factionId)).sort((x, y) => distanceKm(x.army, cap) - distanceKm(y.army, cap))[0];
      if (near0) d.foes.push(near0);
      else return;
    }
    const day = Math.floor(this.c.day);
    const last = (this.capDefDay[f] ??= {});
    const due = (k: string, every: number): boolean => {
      if (day - (last[k] ?? -9999) < every) return false;
      last[k] = day;
      return true;
    };
    const near = d.foes.sort((x, y) => distanceKm(x.army, cap) - distanceKm(y.army, cap))[0];
    // 1) 首都の増兵(金があれば)
    if (due("recruit", 30) && this.c.recruit(cap.id, 2000) === null) {
      this.st(f).capitalReinforce++;
      this.note(f, `${near.army.name}が首都${cap.name}に迫るため、首都で兵を募る(危うさ${d.level.toFixed(1)})`);
    }
    // 2) 近くの軍団を呼び戻し、迫る敵を迎え撃つ(勝算がやや低くても)
    if (due("recall", 20)) {
      for (const r of idle().filter((x) => x !== guard && this.ready(x) && distanceKm(x.army, cap) < 600).sort((x, y) => distanceKm(x.army, cap) - distanceKm(y.army, cap)).slice(0, 2)) {
        if (this.ops.some((o) => o.factionId === f && o.targetArmyId === near.army.id)) break;
        // 迎え撃つのは、迫る敵に野戦で勝てそう(1.1倍以上)なときだけ。勝てなければ首都へ戻って籠城する
        const toFoe = this.armyPower(r) >= this.armyPower(near) * 1.1;
        if (toFoe ? this.goTo(r, near.army.lon, near.army.lat) : distanceKm(r.army, cap) > 40 && this.goTo(r, cap.lon, cap.lat)) {
          if (toFoe) this.addOp(f, r, "intercept", { targetArmyId: near.army.id, reason: `首都${cap.name}へ迫る敵の迎撃` });
          this.st(f).guards++; // 首都へ迫る敵の迎撃も、首都の守りに戻すのも、首都の守り
          this.st(f).capitalRecall++;
          this.note(f, `${r.army.name}を${toFoe ? `首都${cap.name}へ迫る${near.army.name}の迎撃` : `首都${cap.name}の守り`}に向ける`);
        }
      }
    }
    // 2b) 籠城:首都のそばまで戻った軍団は、敵が強いあいだ、兵を城に入れて守備兵にする(城壁の利で守る)
    if (d.level >= 1 && d.foePower > d.own * 0.8) {
      for (const r of this.c.armies.filter((x) => x.army.factionId === f && x.status === "camping" && distanceKm(x.army, cap) < 30 && !this.opOf(x.army.id))) {
        if (this.armyPower(r) * 1.1 > this.armyPower(near)) continue; // 野戦で勝てるなら、軍団のまま
        const n = totalTroops(r.army);
        if (this.c.disbandArmy(r.army.id) === null) {
          this.st(f).capitalHoldout++;
          this.st(f).guards++;
          this.note(f, `${r.army.name}(${n}人)を首都${cap.name}に入れて籠城する(迫る${near.army.name}が強いため)`);
        }
      }
    }
    // 3) 君主の退避:守りきれない見込み(危うさ1.3以上)で、君主が首都にいれば、敵から離れた自国の都市へ、道に沿って移る
    const ruler = this.c.rulerOf(f);
    if (ruler && d.level >= 1.3 && !this.c.placement.travels[ruler.id] && due("evac", 60)) {
      const loc = this.c.placement.locationOf(ruler.id);
      const atCap = (loc.kind === "court" || loc.kind === "city") && loc.cityId === cap.id;
      if (atCap) {
        // 退避先:敵から150km以上離れ、首都より敵から遠い自国の都市(格の高い順)
        // 敵の軍団すべて(首都へ向かう敵だけでなく、近くにいる戦争相手の軍団)から離れていること
        const hostile = this.c.armies.filter((o) => this.c.atWar(f, o.army.factionId) && distanceKm(o.army, cap) < 600);
        const foeDist = (m: { lon: number; lat: number }): number => Math.min(9999, ...hostile.map((o) => distanceKm(o.army, m)));
        // 候補を格の高い順に見て、道が敵の近く(30km以内。移動中に捕まりうる距離25kmに余裕をみた)を通らない最初の都市へ退避する
        // (首都のすぐそば20km以内は、包囲の中を抜けるので避けられない。そこで捕まるおそれは、移動の処理が受け持つ)
        let safe: City | undefined;
        let path: ReturnType<Campaign["pathBetween"]> = null;
        for (const m of mine.filter((x) => x.id !== cap.id && x.kind !== "pass" && foeDist(x) > 150 && foeDist(x) > foeDist(cap) + 60)
          .sort((x, y) => cityLevelOf(y) - cityLevelOf(x) || foeDist(y) - foeDist(x))) {
          const pth = this.c.pathBetween(cap, m);
          if (!pth || pth.points.some((pt) => distanceKm(pt, cap) > 20 && hostile.some((o) => distanceKm(o.army, pt) < 30))) continue;
          safe = m;
          path = pth;
          break;
        }
        if (safe && path) {
          this.c.placement.startTravel(ruler.id, cap.id, safe.id, path.points, path.km, `首都${cap.name}の危機を避けて退避`);
          // 首都の太守を兼ねていれば、その任を離れる(退避先が、いる所になる)
          if (this.c.postOf(ruler.id)?.id === cap.id) this.c.cityStates[cap.id] = { ...this.c.cityState(cap), governorId: null };
          this.st(f).rulerEvacuations++;
          this.note(f, `君主${ruler.name}が、首都${cap.name}の危機を避けて${safe.name}へ退避を始める(道のり${Math.round(path.km)}km)`);
          this.c.addNews(`${this.name(f)}の君主${ruler.name}が、${cap.name}から${safe.name}へ退避を始めました`);
        }
      }
    }
    // 4) 停戦の申し入れ:敵の力が首都の守りの2倍を超え、国全体でも劣るとき(半年に1度)
    if (d.level >= 2 && this.strengthOf(f) < this.strengthOf(near.army.factionId) && due("peace", 180)) {
      const r = this.c.diplo.act(f, near.army.factionId, "ceasefire");
      this.st(f).capitalPeace++;
      this.note(f, `首都${cap.name}の危機のため、${this.name(near.army.factionId)}に停戦を申し入れる(${r.ok ? "成立" : "不成立"})`);
    }
  }

  /** その国への関心(相手の都市のうち、いちばん関心の強い都市) */
  interestIn(f: string, g: string): number {
    return Math.max(0, ...this.citiesOf(g).map((c) => this.interest(f, c)));
  }

  capitalOf(f: string): City | undefined {
    const cap = this.c.capitalCityOf?.(f);
    if (cap) return cap;
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

  /** 生きている国か(滅亡しておらず、都市を持っている) */
  isLive(f: string): boolean {
    return !scenario.factions.find((x) => x.id === f)?.fallen && this.c.cities.some((c) => scenario.cityOwners[c.id] === f);
  }

  private pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
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
      // 首都の見張り(Version 42):3日ごとに、首都へ迫る敵を調べ、増兵・呼び戻し・君主の退避・停戦を考える
      if ((day + i) % 3 === 0) {
        const cap = this.capitalOf(f.id);
        if (cap) {
          const all = this.c.armies.filter((s) => s.army.factionId === f.id);
          const idle = (): ArmyState[] => all.filter((s) => this.c.armies.includes(s) && s.status !== "fighting" && s.status !== "marching" && !s.returnCityId && !s.mergeInto && !this.opOf(s.army.id) && !this.c.diplo.aidOf(s.army.id) && !this.c.history?.taggedArmy(s.army.id));
          this.capitalDefense(f.id, p, this.citiesOf(f.id), cap, idle, undefined);
        }
      }
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
    // 戦争の相手は、生きている国だけ(都市を失った国との戦争は、数えない。これが300年開始の膠着の原因だった)
    const enemies = scenario.factions.filter((g) => g.id !== f && this.c.atWar(f, g.id) && this.isLive(g.id));
    const enemyPower = enemies.reduce((s, g) => s + this.strengthOf(g.id), 0);
    const cap = this.capitalOf(f);
    // 国境の脅威:自国の都市に近い敵の軍団の力
    const threat = this.c.armies.filter((o) => this.c.atWar(f, o.army.factionId) && mine.some((m) => distanceKm(m, o.army) < rules.plan.homeGuardKm)).reduce((s, o) => s + this.armyPower(o), 0);
    const stability = this.c.court.stability[f] ?? 60;
    const broke = rep.net < 0 && purse.gold < rep.expense.total * 2;
    const hungry = purse.grain < rep.expense.grain * 2;
    const weakestEnemy = enemies.map((g) => ({ g, pw: this.strengthOf(g.id) })).sort((a, b) => a.pw - b.pw)[0];
    // 同盟国・属国の動き:同盟国が戦っている相手は、共通の敵になる
    const allies = scenario.factions.filter((g) => this.isLive(g.id) && g.id !== f && ["alliance", "vassal"].includes(this.c.relationOf(f, g.id)));
    const share = power / Math.max(1, scenario.factions.filter((g) => this.isLive(g.id)).reduce((s, g) => s + this.strengthOf(g.id), 0));

    // 軍備増強:前の月より「兵力不足」での見送りが増えていれば、この月は募兵と軍団の編成を増やす
    const short = this.st(f).notLaunched["兵力不足"] ?? 0;
    const wasBuild = this.buildUp[f];
    this.buildUp[f] = short - (this.shortSeen[f] ?? short) >= 3 && !(rep.net < 0);
    this.shortSeen[f] = short;
    if (this.buildUp[f] && !wasBuild) {
      this.st(f).buildUps++;
      this.note(f, "兵が足りず出兵できないため、軍備を増強する(募兵と軍団の編成を増やす)");
    }

    // 膠着した戦争:3年以上戦って、どちらも都市を奪えていなければ、和平・停戦を申し入れる。ずっと小さな相手には従属を求める
    for (const g of enemies) {
      const age = this.c.relationAge(f, g.id);
      const last = this.lastCapture[this.pairKey(f, g.id)] ?? -99999;
      if (Math.min(age, day) < 1080 || day - last < 1080) continue;
      if (chance(`${day}|${f}|${g.id}|stale`) > 0.25) continue;
      const theirs = this.strengthOf(g.id);
      if (g.id === this.c.playerFactionId) {
        this.c.propose(f, "peace");
        this.st(f).peaceTries++;
        this.note(f, `${this.name(g.id)}との戦争が3年以上膠着したため、和平を申し入れる`);
        continue;
      }
      if (power > theirs * 4) {
        const r = this.c.diplo.act(f, g.id, "vassal");
        this.st(f).vassalDemands++;
        this.note(f, `膠着した${this.name(g.id)}に従属を求める(${r.ok ? "受け入れ" : "拒否"})`);
        if (r.ok) continue;
      }
      if (power < theirs * 1.5 || posture_hint(pers) ) {
        const r = this.c.diplo.act(f, g.id, chance(`${day}|${f}|${g.id}|cf`) < 0.5 ? "ceasefire" : "peace");
        this.st(f).peaceTries++;
        this.note(f, `${this.name(g.id)}との戦争が3年以上膠着したため、${r.ok ? "和平・停戦を結んだ" : "和平・停戦を申し入れたが断られた"}`);
      }
    }

    let posture: Posture;
    let reason: string;
    if (threat > power * (0.55 - 0.15 * pers.aggr + 0.15 * pers.caution) || stability < 25) {
      posture = "defend";
      reason = stability < 25 ? `国内が不安定(安定度${Math.round(stability)})なため守りを固める` : `国境に敵の軍団(兵力の目安${Math.round(threat)})が迫るため防衛を優先`;
    } else if (this.c.palace.active && this.c.palace.factionId === f && this.c.palace.affairs.unrest() >= 0.6) {
      // 皇帝生活モード:後宮の争い・皇后の廃立で宮廷が揺れているあいだは、重臣(戦略AI)は外征を控えて内を固める
      posture = "develop";
      reason = `後宮の争いで宮廷が揺れている(揺れ ${Math.round(this.c.palace.affairs.unrest() * 100)})ため、外征を控えて内を固める`;
    } else if (broke || hungry) {
      posture = "develop";
      reason = broke ? "財政が赤字で蓄えも乏しいため内政を優先" : "兵糧が乏しいため内政を優先";
    } else if (enemies.length && weakestEnemy && power > weakestEnemy.pw * (1.1 - 0.3 * pers.aggr)) {
      posture = (pers.unify > 0.5 && share > 0.3) || share > 0.5 ? "unify" : "invade";
      reason = `${this.name(weakestEnemy.g.id)}より兵力で優る(${Math.round(power)}対${Math.round(weakestEnemy.pw)})ため攻勢に出る`;
    } else if (enemies.length) {
      posture = "defend";
      reason = `敵(${enemies.map((g) => this.name(g.id)).join("・")})の兵力(${Math.round(enemyPower)})が大きいため守勢`;
    } else if (pers.diplomacy > 0.35 && pers.aggr < 0.2) {
      posture = "diplomacy";
      reason = `戦争をしておらず、君主の性格(${pers.label})から外交で勢力を保つ`;
    } else if (pers.aggr + pers.unify * 0.5 > 0.15 || rep.net > rep.expense.total * 0.3) {
      posture = (pers.unify > 0.5 && share > 0.3) || share > 0.5 ? "unify" : "expand";
      reason = `財政に余裕があり(収支${Math.round(rep.net)})、勢力の拡大をねらう`;
    } else {
      posture = "develop";
      reason = "戦争がなく、内政で国力を蓄える";
    }
    const prev = this.posture[f];
    if (!prev || prev.posture !== posture) {
      if (prev) this.st(f).postureChanges++;
      this.posture[f] = { posture, reason, since: day };
      this.note(f, `方針を「${POSTURE_LABEL[posture]}」にする — ${reason}`);
    } else prev.reason = reason;

    this.westPlan(f, power, posture, pers, day, rep.net > 0 && purse.gold > rep.expense.total * 4);

    // 属国の併合:5年以上従えた、国力が1割5分に満たない属国は、平和のうちに併合することがある(西域の小国は自治を保つので除く)
    for (const [v, o] of Object.entries(this.c.diplo.overlord)) {
      if (o !== f || v === this.c.playerFactionId || !this.isLive(v)) continue;
      const vc = this.citiesOf(v);
      if (vc.every((k) => k.lon < 96)) continue;
      if (this.c.relationAge(f, v) < 1800 || this.strengthOf(v) > power * 0.15) continue;
      if (chance(`${day}|${f}|${v}|annex`) > 0.08) continue;
      const vn = this.name(v);
      this.c.annex(v, f);
      this.st(f).annexed++;
      this.note(f, `長く従えてきた${vn}を併合した`);
      this.c.addNews(`${this.name(f)}が属国の${vn}を併合しました`);
    }

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
        .filter((x) => x.cities > 0 && x.near < p.reachKm * (posture === "unify" ? 2 : 1.2) && power >= x.pw * ratioNeed)
        // 戦略的な関心の外の国には、宣戦しない(Version 42:本拠から遠い飛び地のそばの小国など)
        .filter((x) => this.interestIn(f, x.g.id) >= 0.3)
        // 西域の小国は、遠い中国本土の国には仕掛けない
        .filter((x) => !(mine.every((m) => m.lon < 96) && this.citiesOf(x.g.id).every((t) => t.lon >= 96)))
        // 好機(劉裕の北伐の追加):君主の死・内紛で揺れる国、手薄な関中を持つ国を、先に選ぶ
        .sort((a, b) => a.pw / (power + 1) + a.near / 1000 - this.warOpportunity(f, a.g.id) - (b.pw / (power + 1) + b.near / 1000 - this.warOpportunity(f, b.g.id)));
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
        const build = this.buildUp[factionId];
        if (recruited >= (posture === "defend" || posture === "unify" ? 3 : 2) + (build ? 2 : 0)) break;
        const want = garrisonCap(city) * (build ? 0.85 : 0.6) - this.c.cityState(city).garrison;
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
    // (小国でも、収支に見合えば軍団を持てるように:支出の8%か25の、大きいほうの黒字があればよい)
    const canAffordArmy = rep.net > Math.max(25, rep.expense.total * 0.08) && spare > 150;

    // 軍団の編成:守備兵に余裕のある都市から出す(侵攻・統一の方針なら、1軍団多く持つ)
    const armies = this.c.armies.filter((s) => s.army.factionId === factionId);
    const maxArmies = 1 + Math.floor(mine.length / 5) + p.extraArmies + (posture === "unify" || posture === "invade" ? 1 : 0) + (this.buildUp[factionId] ? 1 : 0);
    if (armies.length < maxArmies && canAffordArmy && wantsArmy) {
      const base = [...mine].filter((c) => c.kind !== "pass").sort((a, b) => this.c.cityState(b).garrison - this.c.cityState(a).garrison)[0];
      // そばに手の空いた軍団があれば、新しく作らず、その軍団に兵を足す(編成してすぐ合流させる無駄をしない)
      const idleNear = base ? armies.find((x) => x.status !== "fighting" && x.status !== "marching" && !this.opOf(x.army.id) && distanceKm(x.army, base) < 60) : undefined;
      if (base && idleNear) {
        if (totalTroops(idleNear.army) < rules.costs.maxArmy * rules.costs.armyGrowth && this.c.cityState(base).garrison > garrisonCap(base) * 0.45) this.c.reinforce(idleNear.army.id, base.id, 1500);
      } else if (base) {
        const free2 = this.c.cityState(base).garrison - Math.max(rules.costs.minGarrison * 2, garrisonCap(base) * 0.25);
        const troops = Math.min(free2, rules.costs.maxArmy);
        // 都市が3つ以下の小国は、1,500人から軍団を作れる(大国は3,000人から)
        const minTroops = mine.length <= 3 ? 1500 : rules.costs.minArmy;
        if (troops >= minTroops) {
          // 軍団長:役目のない武将のうち、統率と武力の高い人(機動戦を好む君主なら統率を重んじる)
          const free = persons
            .filter((x) => x.factionId === factionId && x.role !== "strategist" && x.role !== "minister" && x.role !== "ruler" && this.c.personStatus(x.id) === "active" && !this.c.postOf(x.id))
            .sort((a, b) => b.leadership * 1.2 + b.war - (a.leadership * 1.2 + a.war))[0];
          const raised = this.c.raiseArmy(base.id, troops, free?.id, minTroops);
          if (typeof raised !== "string") {
            this.raised[raised.army.id] = Math.floor(this.c.day);
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

  /**
   * 軍団を行かせる。siege を付けたときだけ、行き先のそばの敵の都市を攻める(Version 42:
   * 迎撃・呼び戻し・集結などの行軍が、たまたま行き先のそばにある敵の都市の攻城にならないように)
   */
  private goTo(s: ArmyState, lon: number, lat: number, siege = false): boolean {
    const route = this.c.planRoute(s.army.id, { lon, lat }, 3);
    if (!route) return false;
    this.c.orderMove(s.army.id, route);
    if (!siege) s.targetCityId = null;
    this.st(s.army.factionId).moves++;
    return true;
  }

  /** 結合後の総指揮官:2つの軍団の指揮官のうち、統率の高いほう(Version 51) */
  private betterCommander(a: ArmyState, b: ArmyState): string | undefined {
    const ca = personById(a.army.commanderId), cb = personById(b.army.commanderId);
    return ca && cb ? (cb.leadership > ca.leadership ? cb.id : ca.id) : ca?.id ?? cb?.id;
  }

  /** 大軍団の編成をした日(国ごと。Version 51) */
  private mergedDay: Record<string, number> = {};

  private homeOf(s: ArmyState, mine: City[]): City {
    return [...mine].sort((x, y) => distanceKm(x, s.army) - distanceKm(y, s.army))[0];
  }

  private endOp(op: Operation): void {
    const i = this.ops.indexOf(op);
    if (i >= 0) this.ops.splice(i, 1);
  }

  private retreat(op: Operation, s: ArmyState, mine: City[], why: string, key = why): void {
    const home = this.homeOf(s, mine);
    if (op.targetCityId) this.failed[`${op.factionId}|${op.targetCityId}`] = Math.floor(this.c.day);
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
        if (op.expedition) this.st(f).westArrived++;
        this.note(f, `${s.army.name}が${city.name}に到着${op.expedition ? "(西域遠征)" : ""}`);
      }
      // 包囲(兵糧攻め):都市のそばに留まり、城の兵糧と士気を削る。士気が落ちるか、120日たてば、もう一度攻める
      if (op.kind === "blockade" && city) {
        if (distanceKm(s.army, city) < 70) {
          const cs = this.c.cityState(city);
          const iv = this.profile().interval;
          const food = Math.max(0, cs.food - iv * 2);
          const garrison = food <= 0 ? Math.floor(cs.garrison * 0.97) : cs.garrison;
          this.c.cityStates[city.id] = { ...cs, food, morale: Math.max(10, cs.morale - iv * 0.6), garrison };
          if (cs.morale < 40 || day - (op.blockadeStart ?? day) > 120) {
            op.kind = "attack";
            op.sieges = 0;
            this.note(f, `${city.name}の包囲で守りが弱った(士気${Math.round(cs.morale)}・兵糧${Math.round(cs.food)})ため、ふたたび攻める`);
            this.goTo(s, city.lon, city.lat, true);
            continue;
          }
        } else if (s.status === "camping" && distanceKm(s.army, city) >= 70) {
          this.goTo(s, city.lon + (s.army.lon > city.lon ? 0.35 : -0.35), city.lat);
        }
      }
      // 撤退の判断(性格で、粘り強さが変わる)
      const pers = this.personalityOf(this.c.rulerOf(f));
      const cmd = this.personalityOf(persons.find((x) => x.id === s.army.commanderId));
      const lossLimit = rules.plan.retreatLoss * (1 + 0.3 * (pers.aggr + cmd.aggr) / 2 - 0.3 * (pers.caution + cmd.caution) / 2);
      const troops = totalTroops(s.army);
      const home = this.homeOf(s, mine);
      const backDays = (distanceKm(home, s.army) * (TERRAIN_DIFFICULTY[this.c.terrainOf(s)] ?? 1) ** 2) / rules.plan.marchKmPerDay;
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
      else if ((op.sieges ?? 0) >= 3) [why, key] = [`${city?.name ?? "目標"}の攻城を3度試みても落とせない`, "攻城の失敗が続いた"];
      if (why) {
        this.retreat(op, s, mine, why, key);
        continue;
      }
      // 都市の前で止まったまま、戦いが始まらない:攻城をやり直す(それでも始まらなければ作戦を終える)
      if (city && op.arrived && s.status === "camping" && op.kind !== "blockade") {
        if (day - (op.idleSince ?? day) > 20) {
          this.st(f).aborted["攻城が始められない"] = (this.st(f).aborted["攻城が始められない"] ?? 0) + 1;
          this.endOp(op);
          continue;
        }
        this.goTo(s, city.lon, city.lat, true);
        continue;
      }
      // 行軍が止まってしまった(経路の途中で野営):目的地へ向かい直す
      if (city && s.status === "camping" && !op.arrived && op.kind !== "blockade") {
        if (!this.goTo(s, city.lon, city.lat, true)) {
          this.st(f).aborted["経路が見つからない"] = (this.st(f).aborted["経路が見つからない"] ?? 0) + 1;
          this.endOp(op);
        }
      }
      if (op.targetArmyId && s.status === "camping") {
        const t = this.c.stateOf(op.targetArmyId)!;
        // 迎撃・援護は守りの作戦:相手が自国の都市から離れ(守りの範囲の1.5倍より遠く)、自分の領内(自国の都市から80km以内)へ
        // 退いたなら、撃退できたとして作戦を終える。敵の首都の近くまで追い続けない(Version 42)
        const mineNow = this.citiesOf(f);
        const farFromUs = Math.min(9999, ...mineNow.map((m) => distanceKm(m, t.army))) > p.defendKm * 1.5;
        const homeOfThem = this.citiesOf(t.army.factionId).some((m) => distanceKm(m, t.army) < 80);
        if ((op.kind === "intercept" || op.kind === "cover") && farFromUs && homeOfThem) {
          this.note(f, `${s.army.name}は、${t.army.name}を撃退したので、追うのをやめる`);
          this.endOp(op);
        } else if (distanceKm(t.army, s.army) > p.reachKm || !this.goTo(s, t.army.lon, t.army.lat)) this.endOp(op);
      }
    }
  }

  private military(f: string, p: StrategyProfile, mine: City[], enemyCities: City[]): void {
    this.updateOps(f, p, mine);
    this.handleExpedition(f);
    const posture = this.posture[f]?.posture ?? "develop";
    const pers = this.factionPersonality(f);
    const cap = this.capitalOf(f);
    const all = this.c.armies.filter((s) => s.army.factionId === f);
    const free = (): ArmyState[] =>
      all.filter((s) => this.c.armies.includes(s) && s.status !== "fighting" && !s.returnCityId && !s.mergeInto && !this.opOf(s.army.id) && !this.c.diplo.aidOf(s.army.id) && !this.c.history?.reservedArmy(s.army.commanderId) && !this.c.history?.taggedArmy(s.army.id) && this.expeditions[f]?.armyId !== s.army.id);

    // 歴史の会戦の前:主力(大きい2軍団)は、戦場に近い自国の都市に集結する
    const stage = this.c.history?.stagingFor(f);
    const staged = new Set<ArmyState>();
    if (stage) {
      for (const s of all.filter((x) => distanceKm(x.army, stage) < 800).sort((x, y) => totalTroops(y.army) - totalTroops(x.army)).slice(0, 2)) {
        if (s.status === "fighting" || this.opOf(s.army.id)) continue;
        // すでに戦場へ向かっている(事件の印がある)軍団や、集結先より戦場に近い軍団は、後ろへ呼び戻さない
        // (劉裕の北伐の追加:臨朐へ進んだ軍団が、集結のために下邳へ戻されていた)
        if (this.c.history?.taggedArmy(s.army.id) || distanceKm(s.army, stage.place) < distanceKm(stage, stage.place) - 20) {
          staged.add(s);
          continue;
        }
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

    const V = armyOpsRules;
    // 1b) 再編成(Version 51:軍団結合を使う):同じ都市のそばで手の空いた小さな軍団が2つあれば、1つに結合する
    //     (以前は、小さいほうを解散して兵だけ移していた。いまは兵種・武将・兵糧をそのまま引き継ぐ)
    {
      const small = idle().filter((x) => x.supplied && totalTroops(x.army) < rules.costs.maxArmy * 0.6 && Math.floor(this.c.day) - (this.raised[x.army.id] ?? -999) > 90);
      for (let i = 0; i < small.length && V.reorgMerge; i++) {
        const a1 = small[i];
        // 近く(40km以内。以前の再編成と同じ範囲)の小さな軍団。範囲を広げると大国が強くなりすぎたので、以前と同じにした
        const b1 = small.slice(i + 1).find((x) => distanceKm(x.army, a1.army) < 40);
        if (!b1) continue;
        const [big, little] = totalTroops(a1.army) >= totalTroops(b1.army) ? [a1, b1] : [b1, a1];
        const n = totalTroops(little.army);
        if (this.c.orderMerge(big.army.id, [little.army.id], this.betterCommander(big, little)) !== null) continue;
        this.st(f).reorganized++;
        this.note(f, `${little.army.name}を${big.army.name}に結合し、軍団を再編成(${n}人)`);
        break;
      }
    }

    // 1c) 帰城(Version 51):消耗した小さな軍団(兵が最小の軍団の7割未満)は、近くの自国の都市へ帰城して守備兵に戻る。
    //     戦争の相手がいない国は、出陣から半年たった小さな軍団(1万人の半分未満)を帰城させる(最も大きい軍団は残す)。
    //     首都を守る軍団が無くならないよう、軍団が2つ以上あるときだけ
    {
      const atPeace = !scenario.factions.some((g) => g.id !== f && this.c.atWar(f, g.id) && this.isLive(g.id));
      // 後方:300km以内に戦争の相手の軍団も都市もない所
      const rear = (s: ArmyState): boolean => !this.c.armies.some((o) => this.c.atWar(f, o.army.factionId) && distanceKm(o.army, s.army) < 300)
        && !this.c.cities.some((k) => this.c.atWar(f, scenario.cityOwners[k.id]) && distanceKm(k, s.army) < 300);
      const list = idle();
      const largest = [...all].sort((x, y) => totalTroops(y.army) - totalTroops(x.army))[0];
      for (const s of list) {
        if (all.filter((x) => this.c.armies.includes(x)).length < 2 || s === largest) break;
        const n = totalTroops(s.army);
        const worn = n < rules.costs.minArmy * 0.7;
        const spare = V.idleReturn && (atPeace || (V.rearReturn && rear(s))) && n < rules.costs.maxArmy * 0.5 && Math.floor(this.c.day) - (this.raised[s.army.id] ?? -999) > 180;
        if ((!worn || !V.wornReturn) && !spare) continue;
        const home = this.homeOf(s, mine);
        if (!home || distanceKm(home, s.army) > 400) continue;
        if (this.c.orderReturn(s.army.id, home.id) === null) {
          this.note(f, `${s.army.name}(${n}人)を${home.name}へ帰城させる(${worn ? "消耗したため" : atPeace ? "戦争が無いため" : "後方で手が空いているため"})`);
          break;
        }
      }
    }

    // 1c2) 首都の防衛のための集結(Version 51):首都の300km以内に敵の軍団が迫っているとき、首都から200km以内の手の空いた
    //      2つの軍団を、首都に近いほうへ結合する(合わせて4万人まで)。首都の守備兵には手を付けない
    if (V.capitalMerge && cap && this.c.armies.some((o) => this.c.atWar(f, o.army.factionId) && distanceKm(o.army, cap) < 300)) {
      const near = idle().filter((x) => distanceKm(x.army, cap) < 300).sort((x, y) => distanceKm(x.army, cap) - distanceKm(y.army, cap));
      if (near.length >= 2 && totalTroops(near[0].army) + totalTroops(near[1].army) <= 40000) {
        if (this.c.orderMerge(near[0].army.id, [near[1].army.id], this.betterCommander(near[0], near[1])) === null) this.note(f, `首都${cap.name}の守りのため、${near[1].army.name}を${near[0].army.name}に集めて結合`);
      }
    }

    // 1d) 大軍団の編成(Version 51):攻めの方針(侵攻・拡大・統一)のとき、いちばん大きい手の空いた軍団(3万人未満)のもとへ、
    //     400km以内の手の空いた軍団(3千人以上)を呼び寄せて結合し、攻め手を厚くする。結合後は5万人まで。
    //     軍団が3つ以上あるときだけ(すべてを1つにはしない)。首都の近く(80km以内)の軍団は呼ばない。国ごとに半年に1度まで
    if (V.assemble && (posture === "invade" || posture === "expand" || posture === "unify") && Math.floor(this.c.day) - (this.mergedDay[f] ?? -9999) > 180) {
      const live = all.filter((x) => this.c.armies.includes(x));
      const ready = idle().filter((x) => this.ready(x) && totalTroops(x.army) >= 3000).sort((x, y) => totalTroops(y.army) - totalTroops(x.army));
      const lead = ready[0];
      if (live.length >= 3 && lead && totalTroops(lead.army) < 30000) {
        const join = ready.slice(1).find((x) => distanceKm(x.army, lead.army) < 400 && totalTroops(x.army) + totalTroops(lead.army) <= 50000 && (!cap || distanceKm(x.army, cap) > 80));
        if (join && this.c.orderMerge(lead.army.id, [join.army.id], this.betterCommander(lead, join)) === null) {
          this.mergedDay[f] = Math.floor(this.c.day);
          this.note(f, `${join.army.name}を${lead.army.name}のもとへ呼び寄せて結合し、大軍団を編成`);
        }
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
        this.st(f).intercepts++;
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
          this.st(f).capitalGuards++;
          if (distanceKm(guard.army, cap) > 60 && this.goTo(guard, cap.lon, cap.lat)) this.note(f, `${guard.army.name}を首都${cap.name}の守りに戻す`);
        }
      }
    }
    // 3a) 首都の防衛(Version 42):首都へ迫る敵を早めに見つけ、首都の増兵・軍団の呼び戻し・君主の退避・停戦の申し入れを考える
    if (cap) this.capitalDefense(f, p, mine, cap, idle, guard);

    // 3b) 首都の救援(Version 41):首都が包囲されている(敵の軍団が首都のすぐそばにいる)なら、
    // 勝算が低めでも、手の空いた近くの軍団を救援に向ける。救えそうになく、ほかに大きな都市があれば遷都する
    if (cap) {
      const besiegers = this.c.armies.filter((o) => this.c.atWar(f, o.army.factionId) && distanceKm(o.army, cap) < 60);
      if (besiegers.length) {
        const foe = besiegers.reduce((sum, o) => sum + this.armyPower(o), 0);
        const cs = this.c.cityState(cap);
        const held = cs.garrison * (0.55 + cs.morale / 220) * wallBonus(cap.defense ?? 40);
        let sent = 0;
        for (const r of idle().filter((x) => x !== guard && this.ready(x) && distanceKm(x.army, cap) < p.reachKm * 1.3).sort((x, y) => distanceKm(x.army, cap) - distanceKm(y.army, cap))) {
          if (this.ops.some((o) => o.factionId === f && o.targetArmyId === besiegers[0].army.id)) break;
          if (sent + held >= foe * 1.1) break;
          if (this.goTo(r, besiegers[0].army.lon, besiegers[0].army.lat)) {
            this.addOp(f, r, "intercept", { targetArmyId: besiegers[0].army.id, reason: `首都${cap.name}の救援` });
            this.st(f).capitalRelief++;
            this.st(f).intercepts++;
            sent += this.armyPower(r);
            this.note(f, `${r.army.name}を、包囲された首都${cap.name}の救援に向ける`);
          }
        }
        // 救援を合わせても守れない見込みなら、首都から離れた大きな都市へ遷都する(1年に1度まで)
        const lastMove = this.capitalMoved[f] ?? -9999;
        if (sent + held < foe * 0.6 && this.c.day - lastMove > 360) {
          const alt0 = mine.filter((m) => m.id !== cap.id && m.kind !== "pass" && cityLevelOf(m) >= Math.max(2, cityLevelOf(cap) - 1) && distanceKm(m, cap) > 200 && !this.c.armies.some((o) => this.c.atWar(f, o.army.factionId) && distanceKm(o.army, m) < 150))
            .sort((x, y) => cityLevelOf(y) - cityLevelOf(x) || distanceKm(y, cap) - distanceKm(x, cap))[0];
          const ruler = this.c.rulerOf(f);
          // 君主がすでに退避の途中なら、その行き先を新しい都にする(君主のいない所へ遷都しない)
          const going = ruler ? this.c.placement.travels[ruler.id]?.to : undefined;
          const alt = (going && mine.find((m) => m.id === going)) || alt0;
          if (alt && ruler) {
            this.capitalMoved[f] = this.c.day;
            this.c.moveCapital(f, alt.id, `${cap.name}が包囲され、守りきれない見込みのため`);
            // 君主と宮廷が新しい都へ移る(遷都)。瞬間移動はさせず、道に沿って日数をかけて移る(途中で捕まることもある)
            const loc = this.c.placement.locationOf(ruler.id);
            if (loc.cityId === cap.id && (loc.kind === "court" || loc.kind === "city") && !this.c.placement.travels[ruler.id]) {
              const path = this.c.pathBetween(cap, alt);
              if (path) {
                this.c.placement.startTravel(ruler.id, cap.id, alt.id, path.points, path.km, `${alt.name}への遷都`);
                if (this.c.postOf(ruler.id)?.id === cap.id) this.c.cityStates[cap.id] = { ...this.c.cityState(cap), governorId: null };
              }
            }
            this.st(f).capitalMoves++;
            this.note(f, `首都${cap.name}が包囲され救えない見込みのため、${alt.name}へ遷都`);
          }
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
        this.st(f).intercepts++;
        this.st(f).coordinated++;
        this.note(f, `${helper.army.name}が、主力(${lead.army.name})に迫る${foe.army.name}を迎え撃つ(援護)`);
      } else if (weak && op.targetCityId) {
        const city = this.c.cities.find((c) => c.id === op.targetCityId)!;
        if (this.goTo(helper, city.lon, city.lat, true)) {
          this.addOp(f, helper, "reserve", { targetCityId: city.id, leadId: op.id, reason: "損耗した主力に予備を投入" });
          this.st(f).coordinated++;
          this.st(f).dispatched++;
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

  /**
   * 好機の見極め(劉裕の北伐の追加)。目標の価値にかける倍率と、その理由。
   * ・北伐の雄(劉裕など)のいる国:相手の国の君主が代わったばかり・安定が低い・君主が幼い・史実の後継争い(後秦)があれば、その国を狙う。
   *   北方の統一を目指すと決めていれば(事件の選択)、北の都市をさらに重んじる。
   * ・赫連勃勃の夏:関中の都市の持ち主が、遠い国(首都から700km超)か、守りが手薄(守備兵6,000未満)で、劉裕が近くにいなければ狙う。
   */
  opportunity(f: string, owner: string, city: City, s: ArmyState): { mult: number; why: string } {
    let mult = 1;
    const why: string[] = [];
    if (!owner) return { mult, why: "" };
    const mine = persons.filter((p) => p.factionId === f && this.c.personStatus(p.id) === "active");
    const hero = mine.some((p) => p.traits?.includes("北伐の雄")) || !!persons.find((p) => p.id === s.army.commanderId)?.traits?.includes("北伐の雄");
    if (hero) {
      const st = this.c.court.stability[owner] ?? 60;
      const r = this.c.rulerOf(owner);
      if (st < 40) { mult *= 1.4; why.push(`${this.name(owner)}は国内が揺れている(安定${Math.round(st)})`); }
      if (r && this.c.court.isMinor(r)) { mult *= 1.2; why.push(`${this.name(owner)}の君主が幼い`); }
      if (this.c.history?.flags.houqin_weak && persons.some((p) => p.factionId === owner && /^姚/.test(p.name) && p.role === "ruler")) { mult *= 1.5; why.push("後秦は姚興の死で揺れている"); }
      if (this.c.history?.flags.liuyu_unify && city.lat > 33.5) { mult *= 1.3; why.push("北方の統一を目指す"); }
    }
    const xia = persons.find((p) => p.id === "helian_bobo" && p.factionId === f && p.role === "ruler" && this.c.personStatus(p.id) === "active");
    if (xia && GUANZHONG.includes(city.id)) {
      const oc = this.capitalOf(owner);
      const far = !oc || distanceKm(oc, city) > 700;
      const weak = this.c.cityState(city).garrison < 6000;
      const liuNear = this.c.armies.some((x) => x.army.commanderId === "liu_yu_song" && x.army.factionId === owner && distanceKm(x.army, city) < 300);
      if ((far || weak) && !liuNear) { mult *= far ? 1.8 : 1.4; why.push(`関中の${city.name}は${far ? "持ち主の都から遠い" : "守りが手薄"}`); }
    }
    return { mult, why: why.join("・") };
  }

  /** 宣戦の相手を選ぶときの好機の重み(0〜0.6。劉裕の北伐の追加。opportunity と同じ考え方) */
  warOpportunity(f: string, g: string): number {
    const cities = this.citiesOf(g);
    if (!cities.length) return 0;
    let best = 0;
    for (const k of cities.slice(0, 12)) {
      const probe = this.c.armies.find((x) => x.army.factionId === f);
      if (!probe) break;
      best = Math.max(best, this.opportunity(f, g, k, probe).mult);
    }
    return Math.min(0.6, (best - 1) * 0.5);
  }

  private ready(s: ArmyState): boolean {
    return s.army.food >= 20 && s.army.morale >= 55 && s.army.fatigue <= 60;
  }

  private addOp(f: string, s: ArmyState, kind: Operation["kind"], o: Partial<Operation>): Operation {
    const owner = o.targetCityId ? scenario.cityOwners[o.targetCityId] : o.targetArmyId ? this.c.stateOf(o.targetArmyId)?.army.factionId : undefined;
    const op: Operation = { id: this.nextOp++, factionId: f, armyId: s.army.id, kind, startDay: Math.floor(this.c.day), status: "marching", troops0: totalTroops(s.army), arrived: false, commander0: s.army.commanderId || undefined, vsPlayer: !!owner && owner === this.c.playerFactionId, reason: "", ...o };
    this.ops.push(op);
    // 迎撃・援護・予備の行軍は、相手の軍団を追うもので、行き先のそばの都市を攻める意思ではない(Version 42:
    // 迎撃のつもりが、敵の首都の攻城になってしまうのを防ぐ。都市を攻めるのは、攻撃目標として評価したときだけ)
    if (kind !== "attack" && !o.targetCityId) s.targetCityId = null;
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
    const reach = p.reachKm * (1 + 0.25 * Math.max(pers.mobility, cmd.mobility)) * (posture === "unify" ? 1.35 : posture === "invade" ? 1.15 : 1);
    const attackRatio = p.attackRatio * (1 - 0.15 * pers.aggr + 0.12 * pers.caution) * (posture === "defend" || posture === "develop" || posture === "diplomacy" ? 1.6 : posture === "invade" || posture === "unify" ? 0.9 : 1);
    const foodMargin = rules.plan.foodMargin * (1 + 0.3 * pers.logistics);
    const cap = this.capitalOf(f);
    const power = this.armyPower(s);
    const reasons: Record<string, number> = {};
    const reject = (r: string): void => void (reasons[r] = (reasons[r] ?? 0) + 1);
    type Cand = { city: City; score: number; ratio: number; days: number; need: number; why: string; partner?: ArmyState; partner2?: ArmyState; value?: number; foodNeed?: number; nearestMine?: number };
    const cands: Cand[] = [];
    const capLevel = cap ? this.capitalDanger(f, cap).level : 0;
    // 首都の守りのために、この軍団を残したか(1回の計画につき1回、首都の守りに残した回数に数える)
    let keptHome = false;
    // 主な敵(Version 42):戦争中の相手のうち、自国の半分以上の力を持つ最強の国。いれば、その国を攻めることを重んじ、
    // 弱い周辺の国への攻撃は控える(力を分散しない。内乱の最中に、周りの小国に手を出さない)。史実重視のモードほど強く
    const myPow = this.strengthOf(f);
    const rival = scenario.factions.filter((g) => !g.fallen && g.id !== f && this.c.atWar(f, g.id)).map((g) => ({ id: g.id, pw: this.strengthOf(g.id) })).sort((x, y) => y.pw - x.pw)[0];
    // 史実重視のモードでは、自国の2割以上の力を持つ相手でも「主な敵」とみなす(内乱の相手を重く見る)
    const focus = rival && rival.pw >= myPow * (this.c.historyMode === "historic" ? 0.2 : 0.5) ? rival.id : null;
    const hist = this.c.historyMode === "historic" ? 1.5 : this.c.historyMode === "free" ? 0.6 : 1;
    // 周りの敵が強大(Version 42):本拠から400km以内の戦争相手の軍団の力が、自国の力のこの倍を超えるあいだは、
    // 本拠から150km超の所へは攻めに出ない(弱い国が、強い敵に囲まれて軍を失い、首都を落とされるのを防ぐ)
    const odds = this.c.historyMode === "historic" ? 2 : this.c.historyMode === "free" ? 3.5 : 2.5;
    const around = cap ? this.c.armies.filter((o) => this.c.atWar(f, o.army.factionId) && distanceKm(o.army, cap) < 400).reduce((s2, o) => s2 + this.armyPower(o), 0) : 0;
    const besetting = !!cap && around > Math.max(1, this.c.armies.filter((x) => x.army.factionId === f).reduce((s2, x) => s2 + this.armyPower(x), 0) + this.c.cityState(cap).garrison) * odds;
    let best: Cand | null = null;
    let shortOf: { city: City; need: number } | null = null;
    const near = [...enemyCities].sort((x, y) => Math.min(distanceKm(x, a), ...mine.map((m) => distanceKm(m, x))) - Math.min(distanceKm(y, a), ...mine.map((m) => distanceKm(m, y)))).slice(0, rules.plan.maxTargets);
    for (const city of near) {
      const dist = distanceKm(city, a);
      // 遠さは、自国のいちばん近い都市から測る(軍団は前線へ進んでから攻める)。軍団からは、その倍まで
      const nearestMine = Math.min(...mine.map((m) => distanceKm(m, city)));
      if (nearestMine > reach || dist > reach * 2.2) { reject("目標が遠すぎる"); continue; }
      // 最近(1年以内に)攻めて失敗した目標は、しばらく選ばない
      const failedAt = this.failed[`${f}|${city.id}`];
      if (failedAt !== undefined && this.c.day - failedAt < 360) { reject("最近失敗した目標"); continue; }
      // 西域の小国は、遠い中国本土へは攻め込まない(自国の都市から600km以内だけ)
      if (mine.every((m) => m.lon < 96) && city.lon >= 96 && nearestMine > 600) { reject("小国の遠征は無謀"); continue; }
      // 到着までの日数(地形の難しさで延びる)
      const terrain = this.c.terrainKindAt(city.lon, city.lat);
      const difficulty = TERRAIN_DIFFICULTY[terrain] ?? 1;
      const days = (dist * difficulty) / (rules.plan.marchKmPerDay * (1 + 0.15 * cmd.mobility));
      // 兵糧:補給の届かない区間を歩く日数ぶん(往きと、包囲の日数)を持っていること
      const gap = Math.max(0, nearestMine - this.c.supplyRangeKm);
      // 山地・高山・砂漠では歩みが遅いので、その分の日数で見積もる
      const foodNeed = ((gap * difficulty * difficulty) / rules.plan.marchKmPerDay) * foodMargin * 2 + rules.plan.foodReserveDays;
      if (gap > 0 && a.food < foodNeed) { reject("兵糧不足"); continue; }
      // 守りの強さ(自動戦闘と同じ式)+ 敵の援軍の見込み
      const cs = this.c.cityState(city);
      const owner = scenario.cityOwners[city.id];
      const guards = this.c.armies.filter((o) => o.army.factionId === owner && distanceKm(o.army, city) < 60).reduce((sum, o) => sum + this.armyPower(o), 0);
      // 援軍の見込み:手の空いている(戦っていない・ほかへ出ていない)敵の軍団だけを、距離で割り引いて数える
      const relief = this.c.armies.filter((o) => o.army.factionId === owner && o.status !== "fighting" && o.status !== "marching" && distanceKm(o.army, city) >= 60 && distanceKm(o.army, city) < rules.plan.reliefKm)
        .reduce((sum, o) => sum + this.armyPower(o) * (1 - distanceKm(o.army, city) / rules.plan.reliefKm), 0);
      const defense = cs.garrison * (0.55 + cs.morale / 220) * wallBonus(city.defense ?? 40) + guards + relief * 0.4;
      let ratio = power / Math.max(1, defense);
      let partner: ArmyState | undefined;
      let partner2: ArmyState | undefined;
      // 1軍団で足りなければ、近くの手の空いた軍団(2つまで)と共同で攻める
      if (ratio < attackRatio) {
        const near2 = partners.filter((x) => this.ready(x) && distanceKm(x.army, city) < reach && !this.opOf(x.army.id)).sort((x, y) => distanceKm(x.army, city) - distanceKm(y.army, city));
        partner = near2[0];
        if (partner) ratio = (power + this.armyPower(partner)) / Math.max(1, defense);
        if (ratio < attackRatio && near2[1] && posture !== "defend") {
          partner2 = near2[1];
          ratio = (power + this.armyPower(partner) + this.armyPower(partner2)) / Math.max(1, defense);
        }
        if (ratio < attackRatio) {
          if (!best) shortOf = { city, need: defense * attackRatio - power };
          reject(relief > guards + 1 ? "敵の援軍が見込まれる" : "兵力不足");
          continue;
        }
      }
      // 価値:経済・食糧・都市の格。首都と関所は戦略上重い。統一志向なら敵の首都をいっそう重んじる
      let value = 40 + (city.economy ?? 0) + (city.food ?? 0) * 0.5 + (city.kind === "pass" ? 60 : cityLevelOf(city) * 40);
      // 首都(Version 41):国家の首都はいっそう重い(落とせば君主を捕らえ、国を滅ぼせる見込みがある)
      const enemyCapital = this.c.isCapital?.(city.id);
      // 重みは国の大きさに比べる:都市が1つ2つの小国の首都を、大国の首都と同じには重んじない(遠くの小国への無謀な遠征を防ぐ)
      if (enemyCapital) {
        const size = Math.min(1, Math.max(0, (this.citiesOf(owner ?? "").filter((k) => k.kind !== "pass").length - 1) / 4));
        value *= 1 + (posture === "unify" ? 1.2 : 0.6) * size;
        const r = this.c.rulerOf(owner ?? "");
        if (size > 0 && r && this.c.placement.locationOf(r.id).cityId === city.id) value *= 1 + 0.15 * size;
      } else if (city.rank === "capital") value *= posture === "unify" ? 1.4 : 1.15;
      if (focus) {
        const ow = owner ?? "";
        if (ow === focus) value *= 1 + 0.4 * hist;
        // 主な敵と争っているあいだ、弱い周辺の国への攻撃は控える(自国の首都のそば150km以内の目標は除く)。
        // 史実重視のモードでは、いっそう強く控える(八王の乱の最中の晋が、周りの小勢力に手を回せなかったように)
        else if (this.strengthOf(ow) < myPow * 0.3 && !(cap && distanceKm(cap, city) < 150)) value *= this.c.historyMode === "historic" ? 0.15 : this.c.historyMode === "free" ? 0.8 : 0.5;
      }
      // 反乱で生まれた勢力(自国から独立した勢力など)は、早めに討つ
      if (/_n\d+$/.test(owner ?? "")) value *= 1.5;
      // 好機(劉裕の北伐の追加):北伐の雄は、君主の死・内紛で揺れる国を狙う。夏は、手薄な関中を狙う
      const opp = this.opportunity(f, owner ?? "", city, s);
      value *= opp.mult;
      // 戦後に保てるか:自国の都市から近いほどよい
      const sustain = 1 / (1 + nearestMine / 300);
      // 自国の守りの手薄さ:首都を守る軍団がこれだけなら、首都から遠い目標は控える
      const exposure = cap && this.c.armies.filter((x) => x.army.factionId === f).length <= 1 && distanceKm(cap, city) > 300 ? 0.6 : 1;
      // 首都の守りを空にしない(Version 41):この軍団が首都の唯一の守りで、敵が首都に迫っているなら、遠い目標は大きく控える
      const capGuards = cap ? this.c.armies.filter((x) => x.army.factionId === f && x !== s && distanceKm(x.army, cap) < rules.plan.homeGuardKm).length : 1;
      const capDanger = cap ? this.c.armies.some((o) => this.c.atWar(f, o.army.factionId) && distanceKm(o.army, cap) < rules.plan.homeGuardKm * 1.5) : false;
      const reserve = cap && capGuards === 0 && capDanger && distanceKm(cap, a) < rules.plan.homeGuardKm && distanceKm(cap, city) > 250 ? 0.4 : 1;
      // 首都が危うい(敵の力が首都の守りの8割以上)ときは、首都を守れる唯一の軍団を、首都から100km超の目標へは出さない(Version 42)
      if (cap && capGuards === 0 && distanceKm(cap, a) < rules.plan.homeGuardKm && distanceKm(cap, city) > 100 && capLevel >= 0.8) { reject("首都の守りを空けられない"); keptHome = true; continue; }
      if (besetting && cap && distanceKm(cap, city) > 150) { reject("周りの敵が強大で、本拠を離れられない"); keptHome = true; continue; }
      // 戦略的な関心(Version 42):関心の薄い遠い目標は、勝算が大きく(3倍以上)価値も高い(200以上)ときだけ選ぶ
      const intr = this.interest(f, city);
      if (intr < 0.25 && (ratio < 3 || value < 200)) { reject("戦略的な関心の外(遠く、得るものが少ない)"); continue; }
      const score = (value * Math.min(ratio, 3) * sustain * exposure * reserve * (0.3 + 0.7 * intr)) / (days + 5) / difficulty;
      const why = `${city.name}(${this.name(owner)})の守りが${ratio >= 2.5 ? "薄い" : "崩せる"}ため攻撃目標に設定(${opp.why ? `${opp.why}・` : ""}勝算${ratio.toFixed(1)}倍・到着約${Math.round(days)}日${partner ? `・${partner.army.name}と共同` : ""}${relief > 0 ? "・援軍の見込みあり" : ""})`;
      const cand: Cand = { city, score, ratio, days, need: defense * attackRatio, why, partner, partner2, value: Math.round(value), foodNeed: Math.round(foodNeed), nearestMine: Math.round(nearestMine) };
      cands.push(cand);
      if (!best || score > best.score) best = cand;
    }
    // 実際の道のり(Version 42):上位3つの候補を、軍団からの経路で見直す。遠回り(直線の2.2倍超)や、
    // 道のりが行動範囲の2.5倍(統一の方針は3倍)を超える目標は選ばない。日数も経路の長さで見積もり直す
    let chosenRoute: ReturnType<Campaign["planRoute"]> = null;
    if (best) {
      const limit = reach * (posture === "unify" ? 3 : 2.5);
      let pick: Cand | null = null;
      let pickScore = -1;
      for (const cnd of [...cands].sort((x, y) => y.score - x.score).slice(0, 3)) {
        const r = this.c.planRoute(a.id, cnd.city, 3);
        if (!r) { reject("経路が見つからない"); continue; }
        const straight = Math.max(1, distanceKm(a, cnd.city));
        if (r.km > limit || (r.km > straight * 2.2 && r.km > 400)) { reject("実際の道のりが遠すぎる"); continue; }
        const rdays = (cnd.days * r.km) / straight;
        const sc = (cnd.score * (cnd.days + 5)) / (rdays + 5);
        if (sc > pickScore) { pick = { ...cnd, days: rdays, score: sc }; pickScore = sc; chosenRoute = r; }
      }
      best = pick;
    }
    if (keptHome && !best) st.guards++;
    if (!best) {
      // 兵が足りないだけなら、そばの自国の都市で兵を集めてから攻める(守備兵の余りを軍団に加える)
      if (shortOf && s.supplied && (posture === "invade" || posture === "unify" || posture === "expand")) {
        const home = this.homeOf(s, mine);
        const spare = this.c.cityState(home).garrison - Math.max(rules.costs.minGarrison * 2, garrisonCap(home) * 0.3);
        if (distanceKm(home, a) < 60 && spare >= 1000 && totalTroops(a) < rules.costs.maxArmy * rules.costs.armyGrowth) {
          const n = Math.min(spare, shortOf.need * 1.2, 6000);
          if (this.c.reinforce(a.id, home.id, n) === null) {
            this.note(f, `${shortOf.city.name}を攻める兵が足りないため、${home.name}で${a.name}に${Math.round(n)}人を加える`);
            return;
          }
        }
      }
      // 見送りの理由を記録する(いちばん多い理由)
      const top = Object.entries(reasons).sort((x, y) => y[1] - x[1])[0];
      if (top) {
        st.notLaunched[top[0]] = (st.notLaunched[top[0]] ?? 0) + 1;
        // 目標が遠いだけなら、前線の自国の都市まで進んで集結する(攻めの方針のときだけ)
        if (top[0] === "目標が遠すぎる" && (posture === "invade" || posture === "unify" || posture === "expand")) {
          const front = [...mine].filter((m) => m.kind !== "pass")
            .map((m) => ({ m, d: Math.min(...enemyCities.map((e) => distanceKm(m, e))) }))
            .sort((x, y) => x.d - y.d)[0];
          // ただし、遠すぎる前線(900km超)へは送らない。同じ前線に集める軍団は2つまで。
          // 中国本土の軍団を、補給の届かない西域の前線へ大移動させることはしない(大国の無謀な遠征の防止)
          const heading = front ? this.c.armies.filter((x) => x.army.factionId === f && x !== s && distanceKm(x.army, front.m) < 120).length : 0;
          const crossRegion = front ? (a.lon >= 96) !== (front.m.lon >= 96) : false;
          if (front && !crossRegion && heading < 2 && distanceKm(front.m, a) > 120 && distanceKm(front.m, a) < 900 && front.d < distanceKm(a, near[0] ?? front.m) && this.goTo(s, front.m.lon, front.m.lat)) {
            this.note(f, `${a.name}を前線の${front.m.name}へ進めて集結させる(敵の都市まで${Math.round(front.d)}km)`);
            return;
          }
        }
        this.note(f, `${a.name}の出兵を見送る — ${top[0]}`);
      }
      return;
    }
    st.planned++;
    const route = chosenRoute;
    if (!route) {
      st.notLaunched["経路が見つからない"] = (st.notLaunched["経路が見つからない"] ?? 0) + 1;
      this.note(f, `${best.city.name}への道が見つからず、出兵を中止`);
      return;
    }
    this.c.orderMove(a.id, route);
    st.moves++;
    st.dispatched++;
    const op = this.addOp(f, s, "attack", { targetCityId: best.city.id, reason: best.why });
    // 出兵の判断の記録(Version 42):出発・目標・経路・兵糧・価値・自国の守り・ほかの候補
    {
      const home = this.homeOf(s, mine);
      const capN = cap ? this.c.armies.filter((x) => x.army.factionId === f && x !== s && distanceKm(x.army, cap) < rules.plan.homeGuardKm).length : 0;
      this.decisions.push({
        date: this.c.dateText(), faction: f, army: a.name, from: home.name, target: best.city.name, owner: this.name(scenario.cityOwners[best.city.id]),
        routeKm: Math.round(route.km), straightKm: Math.round(distanceKm(a, best.city)), days: Math.round(best.days), foodNeed: best.foodNeed ?? 0, food: Math.round(a.food),
        value: best.value ?? 0, ratio: Math.round(best.ratio * 10) / 10, score: Math.round(best.score * 100) / 100, nearestMine: best.nearestMine ?? 0, posture,
        homeGuards: capN, others: cands.filter((x) => x !== best).sort((x, y) => y.score - x.score).slice(0, 4).map((x) => `${x.city.name}(${Math.round(x.score * 100) / 100})`),
      });
      if (this.decisions.length > 400) this.decisions.splice(0, this.decisions.length - 400);
    }
    if (this.c.isCapital?.(best.city.id)) st.capitalAttacks++;
    if (op.vsPlayer) st.vsPlayer++;
    if (best.city.lon < 96 && !mine.some((m) => m.lon < 96)) this.c.logistics.expeditions[f] = (this.c.logistics.expeditions[f] ?? 0) + 1;
    this.note(f, `${a.name}(${a.commanderId ? persons.find((x) => x.id === a.commanderId)?.name : "指揮官なし"})を出兵 — ${best.why}`);
    for (const pt of [best.partner, best.partner2]) {
      if (pt && this.goTo(pt, best.city.lon, best.city.lat, true)) {
        this.addOp(f, pt, "support", { targetCityId: best.city.id, leadId: op.id, reason: "共同攻撃" });
        st.dispatched++;
        st.coordinated++;
        if (op.vsPlayer) st.vsPlayer++;
      }
    }
  }

  // ===== 西域への自主的な遠征(Version 40.1) =====
  /** 補給に使える拠点:自国・同盟国・属国のオアシスと河西の都市 */
  private westBases(f: string): City[] {
    return this.c.cities.filter((k) => {
      const o = scenario.cityOwners[k.id];
      if (!o || (!k.oasis && k.lon >= 101)) return false;
      return o === f || ["alliance", "vassal"].includes(this.c.relationOf(f, o)) || this.c.diplo.overlord[o] === f;
    });
  }

  /**
   * 河西(敦煌・酒泉・張掖など)を持つ国が、西域の国への遠征を考える(月に1度)。
   * 交易路の価値・敵の兵力・オアシスでの補給の届かない区間・遠征の兵糧と兵を見比べ、
   * まず従属を求め、断られて割に合えば、軍団を集結地(オアシス)に集め、兵糧を満たしてから出発させる。
   */
  private westPlan(f: string, power: number, posture: Posture, pers: Personality, day: number, rich: boolean): void {
    const mine = this.citiesOf(f);
    if (this.c.diplo.overlord[f] || mine.every((k) => k.lon < 96) || !mine.some((k) => k.lon < 101)) return;
    if (this.expeditions[f]) return;
    if (!(posture === "expand" || posture === "invade" || posture === "unify" || (posture === "develop" && rich))) return;
    if (chance(`${day}|${f}|west`) > 0.35 + 0.3 * pers.unify + 0.2 * pers.aggr) return;
    const bases = this.westBases(f);
    if (!bases.length) return;
    type W = { g: string; city: City; gate: City; gap: number; trade: number; pw: number; score: number; foodNeed: number };
    let best: W | null = null;
    for (const fac of scenario.factions) {
      const g = fac.id;
      if (g === f || g === this.c.playerFactionId || !this.isLive(g)) continue;
      const theirs = this.citiesOf(g);
      if (!theirs.every((k) => k.lon < 96)) continue;
      if (["alliance", "vassal"].includes(this.c.relationOf(f, g)) || this.c.diplo.overlord[g] === f) continue;
      // 目標の都市:補給の拠点にいちばん近い都市。集結地:その都市にいちばん近い拠点
      let city = theirs[0];
      let gate = bases[0];
      let dmin = Infinity;
      for (const t of theirs) for (const b of bases) { const d = distanceKm(b, t); if (d < dmin) { dmin = d; city = t; gate = b; } }
      const gap = Math.max(0, dmin - this.c.supplyRangeKm);
      if (dmin > 700) continue;
      const trade = theirs.reduce((sum, t) => sum + this.c.trade.market(t), 0);
      // 敵の兵力:国全体ではなく、目標の都市の守り(城壁込み)と、300km以内の敵の軍団
      const cs = this.c.cityState(city);
      const pw = cs.garrison * (0.55 + cs.morale / 220) * wallBonus(city.defense ?? 40) + this.c.armies.filter((o) => o.army.factionId === g && distanceKm(o.army, city) < 300).reduce((sum, o) => sum + this.armyPower(o), 0);
      // 砂漠は歩みが遅く、食糧(水を含む)を多く使う:補給の届かない区間の日数 × 2.4 + 余裕10日
      const foodNeed = Math.min(88, (gap / (rules.plan.marchKmPerDay * 0.85)) * 2.4 + 10);
      const score = (trade * 8 + theirs.length * 40) / (pw / 800 + gap / 120 + 1);
      if (!best || score > best.score) best = { g, city, gate, gap, trade, pw, score, foodNeed };
    }
    if (!best) return;
    const st = this.st(f);
    st.westPlans++;
    const gn = this.name(best.g);
    this.note(f, `西域経略を検討:${gn}(${best.city.name})— 交易の価値${Math.round(best.trade)}・敵の兵力${Math.round(best.pw)}・補給の届かない区間${Math.round(best.gap)}km・必要な兵糧${Math.round(best.foodNeed)}日分・集結地${best.gate.name}`);
    // 1) まず従属を求める(国力が相手の国全体の4倍以上なら)
    if (power > this.strengthOf(best.g) * 4) {
      st.westVassalTries++;
      const r = this.c.diplo.act(f, best.g, "vassal");
      if (r.ok) {
        st.westVassals++;
        this.note(f, `${gn}が従属を受け入れた(戦わずに西域へ勢力を広げる)`);
        return;
      }
      this.note(f, `${gn}は従属を断った`);
    }
    // 2) 遠征の軍団:敵の兵力の1.8倍以上の、手の空いた軍団(集結地から1,500km以内)
    const army = this.c.armies.filter((s) => s.army.factionId === f && s.status !== "fighting" && !this.opOf(s.army.id) && !this.c.history?.taggedArmy(s.army.id) && !this.c.history?.reservedArmy(s.army.commanderId) && distanceKm(s.army, best!.gate) < 2600 && this.armyPower(s) >= best!.pw * 1.6)
      .sort((x, y) => distanceKm(x.army, best!.gate) - distanceKm(y.army, best!.gate))[0] ?? this.raiseExpedition(f, best.gate, best.pw * 1.6);
    if (!army) {
      st.notLaunched["西域遠征の兵が足りない"] = (st.notLaunched["西域遠征の兵が足りない"] ?? 0) + 1;
      // 国力では十分に勝るなら、遠征のために兵を集める(募兵と軍団の編成を増やす)
      if (power > this.strengthOf(best.g) * 1.5 && !this.buildUp[f]) {
        this.buildUp[f] = true;
        this.shortSeen[f] = (st.notLaunched["兵力不足"] ?? 0) - 3;
        st.buildUps++;
        this.note(f, `${gn}への遠征に出せる軍団がないため、兵を集める(敵の守り${Math.round(best.pw)})`);
      } else this.note(f, `${gn}への遠征は、出せる軍団がないため見送る`);
      return;
    }
    if (!this.c.atWar(f, best.g)) {
      const r = this.c.diplo.act(f, best.g, "war");
      if (!r.ok) return;
      st.wars++;
    }
    this.expeditions[f] = { target: best.g, cityId: best.city.id, gateId: best.gate.id, armyId: army.army.id, since: day, state: "gather", foodNeed: best.foodNeed };
    this.note(f, `${gn}への西域遠征を決定:${army.army.name}を${best.gate.name}に集結させる`);
  }

  /** 遠征の軍団を、河西・西域の自国の都市の守備兵から編成する(足りなければ undefined) */
  private raiseExpedition(f: string, gate: City, need: number): ArmyState | undefined {
    const near = this.citiesOf(f).filter((k) => k.kind !== "pass" && k.lon < 104).sort((a, b) => distanceKm(a, gate) - distanceKm(b, gate));
    for (const k of near) {
      const spare = this.c.cityState(k).garrison - Math.max(rules.costs.minGarrison, garrisonCap(k) * 0.25);
      const troops = Math.min(spare, rules.costs.maxArmy);
      if (troops < Math.max(1500, need * 1.1)) continue;
      const cmd = persons.filter((x) => x.factionId === f && x.role === "general" && this.c.personStatus(x.id) === "active" && !this.c.postOf(x.id)).sort((a, b) => b.leadership + b.war - (a.leadership + a.war))[0];
      const r = this.c.raiseArmy(k.id, troops, cmd?.id, 1500);
      if (typeof r === "string") continue;
      this.note(f, `${k.name}で西域遠征の軍団を編成(${Math.round(troops)}人、軍団長:${cmd?.name ?? "なし"})`);
      return r;
    }
    return undefined;
  }

  /** 遠征の進み具合を見る(集結 → 兵糧を満たして出発 → 到着・攻城 → 占領か失敗) */
  private handleExpedition(f: string): void {
    const e = this.expeditions[f];
    if (!e) return;
    const st = this.st(f);
    const day = Math.floor(this.c.day);
    const city = this.c.cities.find((k) => k.id === e.cityId)!;
    const gate = this.c.cities.find((k) => k.id === e.gateId)!;
    const s = this.c.stateOf(e.armyId);
    const owner = scenario.cityOwners[city.id];
    const end = (why: string): void => {
      delete this.expeditions[f];
      this.note(f, `西域遠征(${city.name}):${why}`);
    };
    if (owner === f) { st.westWon++; return end("占領した"); }
    if (!this.c.atWar(f, e.target) || this.c.diplo.overlord[e.target] === f) { st.westDiplomatic++; return end(`${this.name(e.target)}と和平・従属で決着した`); }
    if (!s) { st.westFailed++; return end("遠征軍を失った"); }
    if (e.state === "gather") {
      if (day - e.since > 360) { st.westFailed++; return end("集結が1年を過ぎたため取りやめた"); }
      if (s.status === "fighting") return;
      if (distanceKm(s.army, gate) > 60) {
        if (s.status !== "marching") this.goTo(s, gate.lon, gate.lat);
        return;
      }
      // 集結地で兵糧を満たしてから出発する(オアシスでの補給)
      if (s.army.food < e.foodNeed || !s.supplied) return;
      const route = this.c.planRoute(s.army.id, city, 3);
      if (!route) { st.westFailed++; return end("道が見つからない"); }
      this.c.orderMove(s.army.id, route);
      st.moves++;
      st.dispatched++;
      st.westDispatched++;
      const op = this.addOp(f, s, "attack", { targetCityId: city.id, reason: "西域遠征", expedition: true });
      if (op.vsPlayer) st.vsPlayer++;
      this.c.logistics.expeditions[f] = (this.c.logistics.expeditions[f] ?? 0) + 1;
      e.state = "march";
      this.note(f, `${s.army.name}が${gate.name}から${city.name}へ出発(兵糧${Math.round(s.army.food)}日分・西域遠征)`);
      return;
    }
    // 進軍中:作戦が終わっていれば(撤退・中止)、遠征は失敗
    if (!this.opOf(s.army.id)) { st.westFailed++; return end("遠征軍が引き返した"); }
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
    if (op && e.battleType === "siege_battle") op.sieges = (op.sieges ?? 0) + 1;
    if (op && op.targetCityId && e.battleType === "siege_battle" && !op.arrived) {
      op.arrived = true;
      op.status = "arrived";
      this.st(op.factionId).arrived++;
      if (op.expedition) this.st(op.factionId).westArrived++;
    }
    // プレイヤーの都市への攻城は、どの任務(攻撃・迎撃の追撃など)から起きたものでも数える
    if (e.battleType === "siege_battle" && e.defenderFactionId === this.c.playerFactionId && ai(e.attackerFactionId)) this.st(e.attackerFactionId).vsPlayerSieges++;
  }

  onBattleResult(e: BattleEvent, r: BattleResult): void {
    const f = e.attackerFactionId;
    if (r.siege?.captured) this.lastCapture[this.pairKey(f, e.defenderFactionId)] = Math.floor(this.c.day);
    if (f === this.c.playerFactionId) return;
    if (r.siege?.captured) {
      this.lastCapture[this.pairKey(f, e.defenderFactionId)] = Math.floor(this.c.day);
      this.st(f).captures++;
      if (e.defenderFactionId === this.c.playerFactionId) this.st(f).vsPlayerCaptures++;
      this.note(f, `${e.location.name}を攻め落とした`);
      const op = this.opOf(e.attackerArmyId);
      if (op) this.endOp(op);
      // 落とした城に兵を残す(劉裕の北伐の追加):北伐の雄の軍は、自国の都市から250km以上離れた城を落としたとき、
      // 軍団の兵の15%(最大4,000)を守備兵として残す(落とした城がすぐ奪い返されないように)
      const s = this.c.stateOf(e.attackerArmyId);
      const city = e.defenderCityId ? this.c.cities.find((k) => k.id === e.defenderCityId) : undefined;
      if (s && city && persons.find((p) => p.id === s.army.commanderId)?.traits?.includes("北伐の雄")) {
        const others = this.citiesOf(f).filter((k) => k.id !== city.id && k.kind !== "pass");
        const far = !others.length || Math.min(...others.map((k) => distanceKm(k, city))) > 250;
        const n = Math.min(4000, Math.floor(totalTroops(s.army) * 0.15));
        if (far && n >= 500) {
          const ratio = n / Math.max(1, totalTroops(s.army));
          for (const k of ["infantry", "cavalry", "archer"] as const) s.army.troops[k] -= Math.floor(s.army.troops[k] * ratio);
          const cs = this.c.cityState(city);
          this.c.cityStates[city.id] = { ...cs, garrison: cs.garrison + n };
          this.note(f, `${city.name}に${n}人を残して守らせる(本国から遠いため)`);
        }
      }
    } else if (r.winner === "defender") {
      let op = this.opOf(e.attackerArmyId);
      const s = this.c.stateOf(e.attackerArmyId);
      // 歴史の事件の攻城戦(広固・長安など)は、AIの作戦を持たない。力攻めに失敗しても兵と兵糧が十分なら、
      // AIの攻城と同じく包囲(兵糧攻め)に移れるよう、ここで攻撃の作戦を持たせる(劉裕の北伐の追加。広固は8か月の包囲で落ちた)
      if (!op && s && e.histId && e.battleType === "siege_battle" && e.defenderCityId) op = this.addOp(f, s, "attack", { targetCityId: e.defenderCityId, reason: "歴史の事件の攻城を続ける", arrived: true, status: "arrived", troops0: Math.round(totalTroops(s.army) / 0.9) });
      // 攻城に失敗しても、兵が6割以上残り、兵糧に余裕があれば、攻め方を変えて包囲(兵糧攻め)に移る(1つの作戦で1度だけ)
      const city = e.defenderCityId ? this.c.cities.find((k) => k.id === e.defenderCityId) : undefined;
      if (op && s && city && e.battleType === "siege_battle" && !op.blockaded && op.status !== "retreating" && totalTroops(s.army) >= op.troops0 * 0.6 && (s.supplied || s.army.food >= 60)) {
        op.kind = "blockade";
        op.blockaded = true;
        op.blockadeStart = Math.floor(this.c.day);
        this.st(f).blockades++;
        this.note(f, `${city.name}を力攻めで落とせないため、攻め方を変えて包囲する(兵糧攻め)`);
        this.goTo(s, city.lon + (s.army.lon > city.lon ? 0.35 : -0.35), city.lat);
        return;
      }
      if (op && s && op.status !== "retreating") {
        const mine = this.citiesOf(f);
        if (mine.length) this.retreat(op, s, mine, `${e.location.name}の戦いに敗れた`, "戦いに敗れた");
      }
    }
  }

  // ===== 保存 =====
  serialize(): StrategySave {
    return JSON.parse(JSON.stringify({ ops: this.ops, stats: this.stats, posture: this.posture, log: this.log.slice(-150), nextOp: this.nextOp, failed: this.failed, lastCapture: this.lastCapture, expeditions: this.expeditions, capitalMoved: this.capitalMoved })) as StrategySave;
  }

  restore(save: StrategySave | undefined): void {
    this.ops = [];
    this.stats = {};
    this.posture = {};
    this.log = [];
    this.nextOp = 1;
    this.failed = {};
    this.capitalMoved = {};
    this.lastCapture = {};
    this.expeditions = {};
    if (!save) return;
    this.ops = (save.ops ?? []).filter((o) => this.c.stateOf(o.armyId));
    this.stats = save.stats ?? {};
    for (const s of Object.values(this.stats)) Object.assign(s, { ...emptyStats(), ...s });
    this.posture = save.posture ?? {};
    this.log = save.log ?? [];
    this.nextOp = save.nextOp ?? 1;
    this.failed = { ...(save.failed ?? {}) };
    this.capitalMoved = { ...(save.capitalMoved ?? {}) };
    this.lastCapture = { ...(save.lastCapture ?? {}) };
    this.expeditions = { ...(save.expeditions ?? {}) };
  }
}
