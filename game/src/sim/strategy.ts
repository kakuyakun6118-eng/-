// 敵勢力の戦略AI。操作していない勢力が、徴兵・軍団の編成・迎撃・侵攻・補給・外交を自分で行う。
// 資金や兵を無から増やすことはしない。使えるのは、その勢力の収入と守備兵だけ。
import { cityLevelOf, persons, scenario, totalTroops } from "../data";
import rules from "../data/rules/strategyAi.json";
import type { City } from "../data/types";
import type { ArmyState, Campaign } from "./Campaign";
import { wallBonus } from "./autoBattle";
import { distanceKm } from "./pathfinding";
import { cityEcon } from "./economy";
import { affinity } from "./loyalty";

export type StrategyProfile = (typeof rules.profiles)["normal"];
export const strategyRules = rules;

/** 都市に置ける守備兵の上限 */
export function garrisonCap(city: City): number {
  return city.kind === "pass" ? rules.garrisonCap.pass : rules.garrisonCap.levels[cityLevelOf(city)];
}

/** 日付と名前から決まる乱数(同じ状況なら同じ判断になる) */

export class StrategyAi {
  constructor(private readonly c: Campaign) {}

  private profile(): StrategyProfile {
    return rules.profiles[this.c.difficulty] ?? rules.profiles.normal;
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

  /** 1日に1度呼ぶ。勢力ごとに、難易度で決まる間隔で行動する */
  daily(day: number): void {
    const p = this.profile();
    scenario.factions.forEach((f, i) => {
      if (f.id === this.c.playerFactionId || f.passive) return;
      if ((day + i) % p.interval !== 0) return;
      this.act(f.id, p);
    });
    if (day % 90 === 45) this.c.diplo.aiQuarter(p.aggression, p.warRatio);
  }

  private act(factionId: string, p: StrategyProfile): void {
    const mine = this.citiesOf(factionId);
    if (mine.length === 0) return;
    const enemies = this.c.cities.filter((c) => this.c.atWar(factionId, scenario.cityOwners[c.id]));
    const front = (c: City): number => enemies.reduce((best, e) => Math.min(best, distanceKm(c, e)), 9999);

    // 予算:維持費と俸禄(1)(2)を先に確保する。蓄えが支出の3か月分を超えた分だけを、募兵・編成・内政に回す
    const rep = this.c.economy.report(factionId);
    const purse = this.c.factionStates[factionId] ?? { gold: 0, grain: 0 };
    const reserve = rep.expense.total * 3;
    const arrears = this.c.economy.arrearsOf(factionId);
    // 財政難:募兵と開発を止め、未払いが2か月続けば、いちばん小さい軍団を都市に戻す
    if (arrears >= 2) {
      const small = this.c.armies.filter((s) => s.army.factionId === factionId && s.status !== "fighting" && s.status !== "marching").sort((x, y) => totalTroops(x.army) - totalTroops(y.army))[0];
      if (small) this.c.disbandArmy(small.army.id);
      return this.moveArmies(factionId, p, mine, enemies);
    }
    const spare = purse.gold - reserve;
    const atWar = enemies.length > 0;
    // 募兵(4):戦争中で、蓄えに余裕があり、収支が大きく赤字でないとき。敵に近い都市から、守備兵を上限の6割まで
    let recruited = 0;
    if (atWar && spare > 0 && rep.net > -rep.expense.total * 0.15 && purse.grain > rep.expense.grain * 2) {
      for (const city of [...mine].sort((a, b) => front(a) - front(b))) {
        if (recruited >= 2) break;
        const want = garrisonCap(city) * 0.6 - this.c.cityState(city).garrison;
        if (want < 100) continue;
        if (this.c.recruit(city.id, Math.min(want, p.recruitPerTurn)) === null) recruited++;
      }
    }
    // 内政(5):さらに余裕があれば都市を開発する(治安が悪ければ治安、損傷があれば城郭、ほかは弱い方の産業)。
    // 蓄えが多いほど、1回に手がける都市を増やす(最大3都市)。開発しきった都市には、城郭整備と兵糧備蓄
    const projects = purse.gold - reserve > 3000 ? 3 : purse.gold - reserve > 1200 ? 2 : purse.gold - reserve > 400 ? 1 : 0;
    const ready = [...mine].filter((c) => c.kind !== "pass").sort((a, b) => (b.economy ?? 0) + (b.food ?? 0) - ((a.economy ?? 0) + (a.food ?? 0)))
      .filter((c) => { const st = this.c.cityStates[c.id]; return st?.devDay === undefined || Math.floor(this.c.day) - st.devDay >= 60; });
    for (const target of ready.slice(0, projects)) {
      {
        const st = this.c.cityState(target);
        const e = cityEcon(target, st);
        const kind = e.order < 50 ? "order" : st.wallDamage > 0.3 ? "walls" : e.pop < (target.population ?? 0) * 0.85 ? "population" : e.commerce <= e.agri ? "commerce" : "agri";
        const done = (kind === "agri" && e.agri >= 100) || (kind === "commerce" && e.commerce >= 100);
        this.c.economy.develop(target.id, done ? (e.fortify < 20 ? "walls" : "granary") : kind);
      }
    }
    // 軍団の維持費をまかなえないなら、新しい軍団は作らない
    const canAffordArmy = rep.net > 120 && spare > 300;

    // 軍団の編成:守備兵に余裕のある都市から出す
    const armies = this.c.armies.filter((s) => s.army.factionId === factionId);
    const maxArmies = 1 + Math.floor(mine.length / 5) + p.extraArmies;
    if (armies.length < maxArmies && canAffordArmy) {
      const base = [...mine].filter((c) => c.kind !== "pass").sort((a, b) => this.c.cityState(b).garrison - this.c.cityState(a).garrison)[0];
      if (base) {
        const spare = this.c.cityState(base).garrison - Math.max(rules.costs.minGarrison * 2, garrisonCap(base) * 0.25);
        const troops = Math.min(spare, rules.costs.maxArmy);
        if (troops >= rules.costs.minArmy) {
          const free = persons
            .filter((x) => x.factionId === factionId && x.role !== "strategist" && x.role !== "minister" && x.role !== "ruler" && this.c.personStatus(x.id) === "active" && !this.c.postOf(x.id))
            .sort((a, b) => b.leadership + b.war - (a.leadership + a.war))[0];
          const raised = this.c.raiseArmy(base.id, troops, free?.id);
          // 副将:指揮官と相性のよい、役目のない人
          if (typeof raised !== "string" && free) {
            const dep = persons.filter((x) => x.factionId === factionId && x.role === "general" && x.id !== free.id && this.c.personStatus(x.id) === "active" && !this.c.postOf(x.id))
              .sort((a, b) => affinity(free, b).value - affinity(free, a).value)[0];
            if (dep && affinity(free, dep).value >= 55) this.c.appoint(dep.id, { kind: "deputy", id: raised.army.id });
          }
        }
      }
    }

    this.moveArmies(factionId, p, mine, enemies);
  }

  private moveArmies(factionId: string, p: StrategyProfile, mine: City[], enemies: City[]): void {
    for (const s of this.c.armies) {
      if (s.army.factionId !== factionId || s.status === "fighting" || s.status === "marching") continue;
      if (this.c.diplo.aidOf(s.army.id)) continue; // 援軍は、援軍の任務に従う
      // 歴史の会戦の前:主力(大きい2軍団)は、戦場に近い自国の都市に集結する(戦争は止めない。ほかの軍団はふだんどおり)
      const stage = this.c.history?.stagingFor(factionId);
      if (stage && this.c.armies.filter((x) => x.army.factionId === factionId).sort((x, y) => totalTroops(y.army) - totalTroops(x.army)).slice(0, 2).includes(s)) {
        if (distanceKm(s.army, stage) > 80) {
          const route = this.c.planRoute(s.army.id, stage);
          if (route) {
            this.c.orderMove(s.army.id, route);
            continue;
          }
        } else continue;
      }
      this.orderArmy(s, p, mine, enemies);
    }
  }

  private orderArmy(s: ArmyState, p: StrategyProfile, mine: City[], enemyCities: City[]): void {
    const a = s.army;
    const power = this.armyPower(s);
    const home = [...mine].sort((x, y) => distanceKm(x, a) - distanceKm(y, a))[0];
    const goTo = (lon: number, lat: number): boolean => {
      const route = this.c.planRoute(a.id, { lon, lat }, 3);
      if (!route) return false;
      this.c.orderMove(a.id, route);
      return true;
    };

    // 補給:食糧・士気・疲労が悪ければ、味方の都市へ戻って休む
    const tired = a.food < 8 || a.morale < 40 || a.fatigue > 70;
    if (tired) {
      if (!s.supplied) goTo(home.lon, home.lat);
      return;
    }
    // 兵が減っていれば、そばの味方の都市から補充する
    // そばの味方の都市に兵の余裕があれば、軍団を大きくする(上限あり。都市の守備兵は、金を払って徴兵した分)
    if (s.supplied && distanceKm(home, a) < 60 && totalTroops(a) < rules.costs.maxArmy * rules.costs.armyGrowth && this.c.cityState(home).garrison > garrisonCap(home) * 0.45) {
      this.c.reinforce(a.id, home.id, 1500);
    }

    // 迎撃:味方の都市に近づいた敵の軍団へ向かう(勝てそうなときだけ)
    const threats = this.c.armies
      .filter((o) => this.c.atWar(a.factionId, o.army.factionId) && mine.some((c) => distanceKm(c, o.army) < p.defendKm))
      .sort((x, y) => distanceKm(x.army, a) - distanceKm(y.army, a));
    for (const t of threats) {
      if (distanceKm(t.army, a) > p.reachKm) break;
      if (power >= this.armyPower(t) * p.interceptRatio && goTo(t.army.lon, t.army.lat)) return;
    }

    // 侵攻:近い敵の都市・関所のうち、落とせそうで価値の高いものを選ぶ
    if (a.food >= 20 && a.morale >= 55) {
      let best: { city: City; score: number } | null = null;
      const near = [...enemyCities].sort((x, y) => distanceKm(x, a) - distanceKm(y, a)).slice(0, 4);
      for (const city of near) {
        const dist = distanceKm(city, a);
        if (dist > p.reachKm) break;
        const st = this.c.cityState(city);
        const owner = scenario.cityOwners[city.id];
        const guards = this.c.armies.filter((o) => o.army.factionId === owner && distanceKm(o.army, city) < 60).reduce((sum, o) => sum + this.armyPower(o), 0);
        // 守りの強さは、自動戦闘と同じ式で見積もる(見積もりと結果が食い違って、無駄な攻めを繰り返さないように)
        const defense = st.garrison * (0.55 + st.morale / 220) * wallBonus(city.defense ?? 40) + guards;
        const ratio = power / Math.max(1, defense);
        if (ratio < p.attackRatio) continue;
        const value = 40 + (city.economy ?? 0) + (city.food ?? 0) * 0.5 + (city.kind === "pass" ? 60 : cityLevelOf(city) * 40);
        const score = (value / (dist + 60)) * Math.min(ratio, 3);
        if (!best || score > best.score) best = { city, score };
      }
      if (best && goTo(best.city.lon, best.city.lat)) return;
    }

    // することがなければ、補給の届く所へ戻る
    if (!s.supplied) goTo(home.lon, home.lat);
  }
}
