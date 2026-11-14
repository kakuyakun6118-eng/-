// 敵勢力の戦略AI。操作していない勢力が、徴兵・軍団の編成・迎撃・侵攻・補給・外交を自分で行う。
// 資金や兵を無から増やすことはしない。使えるのは、その勢力の収入と守備兵だけ。
import { cityLevelOf, persons, scenario, totalTroops } from "../data";
import rules from "../data/rules/strategyAi.json";
import type { City } from "../data/types";
import type { ArmyState, Campaign } from "./Campaign";
import { distanceKm } from "./pathfinding";

export type StrategyProfile = (typeof rules.profiles)["normal"];
export const strategyRules = rules;

/** 都市に置ける守備兵の上限 */
export function garrisonCap(city: City): number {
  return city.kind === "pass" ? rules.garrisonCap.pass : rules.garrisonCap.levels[cityLevelOf(city)];
}

/** 日付と名前から決まる乱数(同じ状況なら同じ判断になる) */
function chance(seed: string): number {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 16777619);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  return ((a ^ (a >>> 13)) >>> 0) / 4294967296;
}

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
      if (f.id === this.c.playerFactionId) return;
      if ((day + i) % p.interval !== 0) return;
      this.act(f.id, p);
    });
    if (day % 90 === 45) this.diplomacy(p, day);
  }

  private act(factionId: string, p: StrategyProfile): void {
    const mine = this.citiesOf(factionId);
    if (mine.length === 0) return;
    const enemies = this.c.cities.filter((c) => this.c.atWar(factionId, scenario.cityOwners[c.id]));
    const front = (c: City): number => enemies.reduce((best, e) => Math.min(best, distanceKm(c, e)), 9999);

    // 徴兵:敵に近い都市から、守備兵を上限の6割まで補う(1回に2都市まで。金が要る)
    let recruited = 0;
    for (const city of [...mine].sort((a, b) => front(a) - front(b))) {
      if (recruited >= 2) break;
      const want = garrisonCap(city) * 0.6 - this.c.cityState(city).garrison;
      if (want < 100) continue;
      if (this.c.recruit(city.id, Math.min(want, p.recruitPerTurn)) === null) recruited++;
    }

    // 軍団の編成:守備兵に余裕のある都市から出す
    const armies = this.c.armies.filter((s) => s.army.factionId === factionId);
    const maxArmies = 1 + Math.floor(mine.length / 5) + p.extraArmies;
    if (armies.length < maxArmies) {
      const base = [...mine].filter((c) => c.kind !== "pass").sort((a, b) => this.c.cityState(b).garrison - this.c.cityState(a).garrison)[0];
      if (base) {
        const spare = this.c.cityState(base).garrison - Math.max(rules.costs.minGarrison * 2, garrisonCap(base) * 0.25);
        const troops = Math.min(spare, rules.costs.maxArmy);
        if (troops >= rules.costs.minArmy) {
          const free = persons
            .filter((x) => x.factionId === factionId && x.role !== "strategist" && this.c.personStatus(x.id) === "active" && !this.c.postOf(x.id))
            .sort((a, b) => b.leadership + b.war - (a.leadership + a.war))[0];
          this.c.raiseArmy(base.id, troops, free?.id);
        }
      }
    }

    for (const s of this.c.armies) {
      if (s.army.factionId !== factionId || s.status === "fighting" || s.status === "marching") continue;
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
    if (s.supplied && totalTroops(a) < rules.costs.minArmy && distanceKm(home, a) < 60) this.c.reinforce(a.id, home.id, 1000);

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
        const defense = st.garrison * (1 + (city.defense ?? 40) / 50) + guards;
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

  /** 3か月に1度の外交:劣勢なら和睦を求め、優勢で手が空いていれば、隣の勢力に宣戦する */
  private diplomacy(p: StrategyProfile, day: number): void {
    const alive = scenario.factions.filter((f) => this.citiesOf(f.id).length > 0);
    for (const f of alive) {
      if (f.id === this.c.playerFactionId) continue;
      const mine = this.strengthOf(f.id);
      const wars = alive.filter((g) => g.id !== f.id && this.c.relationOf(f.id, g.id) === "war");
      const strongest = [...wars].sort((x, y) => this.strengthOf(y.id) - this.strengthOf(x.id))[0];
      // 和睦を求めるのは、戦いが1年以上続き、相手がずっと強いか、敵が多すぎるとき
      if (strongest && (wars.length >= 4 || this.strengthOf(strongest.id) > mine * 2) && this.c.relationAge(f.id, strongest.id) >= 360) {
        // 和睦の申し入れ。相手がプレイヤーなら、返事を待つ
        if (strongest.id === this.c.playerFactionId) {
          this.c.propose(f.id, "peace");
        } else {
          const theirWars = alive.filter((g) => g.id !== strongest.id && this.c.relationOf(strongest.id, g.id) === "war").length;
          if (theirWars >= 2 || chance(`${day}${f.id}${strongest.id}`) < 0.25) {
            this.c.setRelation(f.id, strongest.id, "peace");
            this.c.addNews(`${f.name}と${strongest.name}が和睦しました`);
          }
        }
        continue;
      }
      if (wars.length > 1) continue;
      // 宣戦:都市が近く、兵力で上回る相手に(同盟の相手には宣戦しない)
      const myCities = this.citiesOf(f.id);
      for (const g of alive) {
        if (g.id === f.id || this.c.relationOf(f.id, g.id) !== "peace" || this.c.relationAge(f.id, g.id) < 720) continue;
        const close = this.citiesOf(g.id).some((gc) => myCities.some((mc) => distanceKm(gc, mc) < 300));
        if (!close || mine < this.strengthOf(g.id) * p.warRatio) continue;
        if (chance(`${day}${f.id}${g.id}war`) >= p.aggression) continue;
        this.c.setRelation(f.id, g.id, "war");
        this.c.addNews(`${f.name}が${g.name}に宣戦しました`);
        break;
      }
    }
  }
}
