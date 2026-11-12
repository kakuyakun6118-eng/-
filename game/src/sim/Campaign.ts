// ゲームの進行を計算する。日付を進め、軍団の行軍・食糧・疲労・士気・敵との接触を扱う。
// ここは計算だけで、3D表示のことは知らない。変化があったら、登録された関数で知らせる。
import { resolveCityLayout, scenario, totalTroops } from "../data";
import type { Army, ArmyStatus, BattleEvent, City, UnitTypeId } from "../data/types";
import { distanceKm, findRoute, type Route, type RoutePoint } from "./pathfinding";
import type { TerrainGrid } from "./TerrainGrid";

/** 1日が現実の何秒か(速さ1のとき) */
const SECONDS_PER_DAY = 1.2;
/** 軍団どうしが重ならないための最小の間隔(度) */
const MIN_SEPARATION = 0.34;
/** 敵軍団とこの距離(度)まで近づくと接触とみなす */
const CONTACT_RANGE = 0.42;
/** 味方の都市からこの距離(km)までなら補給を受けられる */
const SUPPLY_RANGE_KM = 80;
/** 食糧の備蓄の上限(日数) */
const FOOD_CAP = 90;

export type SupplyState = "good" | "low" | "out";

/** 軍団の「いまの状態」。army の中身(兵力・士気など)は進行に応じて書き換わる */
export interface ArmyState {
  army: Army;
  status: ArmyStatus;
  /** 進んでいる経路(行軍中だけ) */
  route: Route | null;
  /** 経路のうち、進み終えた「手間」 */
  progress: number;
  /** 味方の都市から補給を受けられる位置にいるか */
  supplied: boolean;
  /** 接触判定をしない相手(離脱中に、同じ相手とすぐ再接触しないため) */
  ignore: Set<string>;
}

export interface CampaignListener {
  /** 軍団が動いた(毎フレーム) */
  onArmyMoved(state: ArmyState): void;
  /** 軍団の状態や数値が変わった(行軍開始・到着・日々の消耗など) */
  onArmyChanged(state: ArmyState, statusChanged: boolean): void;
  /** 戦闘イベントが発生した */
  onBattleEvent(event: BattleEvent): void;
  /** 日付が変わった */
  onDayChanged(day: number): void;
}

export class Campaign {
  /** ゲーム開始からの日数(小数。0.5 = 1日目の正午) */
  day = 0;
  /** 進む速さ。0 = 一時停止 */
  speed = 1;
  readonly armies: ArmyState[];
  readonly events: BattleEvent[] = [];
  private nextEventId = 1;

  constructor(
    private readonly grid: TerrainGrid,
    armies: Army[],
    private readonly cities: City[],
    private readonly listener: CampaignListener,
  ) {
    // 元のデータを書き換えないよう、写しを取って使う
    this.armies = armies.map((a) => ({
      army: { ...a, troops: { ...a.troops } },
      status: a.status ?? "camping",
      route: null,
      progress: 0,
      supplied: false,
      ignore: new Set<string>(),
    }));
    for (const s of this.armies) s.supplied = this.nearFriendlyCity(s);
  }

  stateOf(armyId: string): ArmyState | undefined {
    return this.armies.find((s) => s.army.id === armyId);
  }

  /** いまの日付(1か月を30日として数える) */
  dateText(): string {
    const d = Math.floor(this.day);
    const year = scenario.year + Math.floor((60 + d) / 360);
    const month = (Math.floor((60 + d) / 30) % 12) + 1;
    return `${year}年${month}月${(d % 30) + 1}日`;
  }

  /** 行軍の速さ(km/日)。騎兵だけの軍は速く、疲労や食糧不足で遅くなる */
  marchSpeed(s: ArmyState): number {
    const t = s.army.troops;
    const base = t.infantry + t.archer > 0 ? 30 : 52;
    return Math.round(base * (1 - s.army.fatigue / 250) * (s.army.food <= 0 ? 0.7 : 1));
  }

  supplyState(s: ArmyState): SupplyState {
    if (s.army.food <= 0) return "out";
    return s.army.food < 15 && !s.supplied ? "low" : "good";
  }

  /** ある経路を進むのにかかる日数の見込み */
  daysFor(s: ArmyState, route: Route): number {
    return route.effort[route.effort.length - 1] / Math.max(1, this.marchSpeed(s));
  }

  private hostile(a: Army, factionId: string | undefined): boolean {
    return factionId !== undefined && a.factionId !== factionId;
  }

  /** 都市の大きさ(度)。軍団が都市の中に入り込まないために使う */
  private cityReach(city: City): number {
    const size = resolveCityLayout(city).size;
    return Math.max(size[0], size[1]) / 2 / 10 + 0.12;
  }

  private nearFriendlyCity(s: ArmyState): boolean {
    return this.cities.some(
      (c) => scenario.cityOwners[c.id] === s.army.factionId && distanceKm(c, s.army) <= SUPPLY_RANGE_KM,
    );
  }

  /** 行きたい場所の近くで、ほかの軍団や都市と重ならず、通れる場所を探す */
  private freeSpot(target: RoutePoint, self: ArmyState): RoutePoint | null {
    const ok = (p: RoutePoint): boolean =>
      isFinite(this.grid.costAt(p.lon, p.lat)) &&
      this.armies.every((o) => o === self || Math.hypot(o.army.lon - p.lon, o.army.lat - p.lat) >= MIN_SEPARATION) &&
      this.cities.every((c) => Math.hypot(c.lon - p.lon, c.lat - p.lat) >= this.cityReach(c) + 0.1);
    if (ok(target)) return target;
    for (let ring = 1; ring <= 6; ring++) {
      const r = ring * 0.18;
      for (let k = 0; k < ring * 8; k++) {
        const a = (k / (ring * 8)) * Math.PI * 2;
        const p = { lon: target.lon + Math.cos(a) * r, lat: target.lat + Math.sin(a) * r };
        if (ok(p)) return p;
      }
    }
    return null;
  }

  /** 移動先までの経路を調べる(まだ動かさない)。行けないときは null */
  planRoute(armyId: string, target: RoutePoint): Route | null {
    const s = this.stateOf(armyId);
    if (!s) return null;
    const spot = this.freeSpot(target, s);
    if (!spot) return null;
    const route = findRoute(this.grid, { lon: s.army.lon, lat: s.army.lat }, spot);
    return route && route.points.length >= 2 ? route : null;
  }

  /** 経路に沿って行軍を始める */
  orderMove(armyId: string, route: Route): void {
    const s = this.stateOf(armyId);
    if (!s) return;
    this.withdraw(s);
    s.route = route;
    s.progress = 0;
    // いま近くにいる敵とは、離れるまで接触判定をしない(その場から動けなくなるのを防ぐ)
    s.ignore.clear();
    for (const o of this.armies) {
      if (o !== s && Math.hypot(o.army.lon - s.army.lon, o.army.lat - s.army.lat) < CONTACT_RANGE * 1.2) s.ignore.add(o.army.id);
    }
    this.setStatus(s, "marching");
  }

  /** 行軍をやめて、その場で野営する */
  halt(armyId: string): void {
    const s = this.stateOf(armyId);
    if (!s || s.status !== "marching") return;
    s.route = null;
    this.setStatus(s, "camping");
  }

  /** 対峙していた相手から離れる。開始待ちの戦闘イベントは不成立にする */
  private withdraw(s: ArmyState): void {
    if (s.status !== "fighting") return;
    for (const e of this.events) {
      if (e.status !== "pending") continue;
      if (e.attackerArmyId !== s.army.id && e.defenderArmyId !== s.army.id) continue;
      e.status = "withdrawn";
      const otherId = e.attackerArmyId === s.army.id ? e.defenderArmyId : e.attackerArmyId;
      const other = otherId ? this.stateOf(otherId) : undefined;
      if (other && other.status === "fighting") this.setStatus(other, "camping");
    }
  }

  private setStatus(s: ArmyState, status: ArmyStatus): void {
    const changed = s.status !== status;
    s.status = status;
    this.listener.onArmyChanged(s, changed);
  }

  /** 時間を進める。dt は前回からの現実の秒数 */
  update(dt: number): void {
    if (this.speed === 0) return;
    const before = Math.floor(this.day);
    const days = (Math.min(dt, 0.25) / SECONDS_PER_DAY) * this.speed;
    this.day += days;

    for (const s of this.armies) {
      if (s.status === "marching" && s.route) this.advance(s, days);
    }
    for (let d = before; d < Math.floor(this.day); d++) {
      for (const s of this.armies) this.dailyUpkeep(s);
      this.listener.onDayChanged(d + 1);
    }
  }

  /** 行軍中の軍団を、経路に沿って進める */
  private advance(s: ArmyState, days: number): void {
    const route = s.route!;
    const end = route.effort[route.effort.length - 1];
    s.progress = Math.min(end, s.progress + this.marchSpeed(s) * days);
    // 進み具合から、経路上のいまの位置を求める
    let k = 1;
    while (k < route.effort.length - 1 && route.effort[k] < s.progress) k++;
    const span = route.effort[k] - route.effort[k - 1];
    const t = span > 0 ? (s.progress - route.effort[k - 1]) / span : 1;
    const a = route.points[k - 1];
    const b = route.points[k];
    s.army.lon = a.lon + (b.lon - a.lon) * t;
    s.army.lat = a.lat + (b.lat - a.lat) * t;
    // 進行方向(0 = 北、90 = 東)
    const dx = (b.lon - a.lon) * Math.cos(a.lat * (Math.PI / 180));
    const dy = b.lat - a.lat;
    if (dx !== 0 || dy !== 0) s.army.facing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    this.listener.onArmyMoved(s);

    if (this.checkContact(s)) return;
    if (s.progress >= end) {
      s.route = null;
      this.setStatus(s, "camping");
    }
  }

  /** 敵軍団や敵の都市に接触したら、戦闘イベントを作って止まる */
  private checkContact(s: ArmyState): boolean {
    for (const o of this.armies) {
      if (o === s) continue;
      const d = Math.hypot(o.army.lon - s.army.lon, o.army.lat - s.army.lat);
      if (s.ignore.has(o.army.id)) {
        if (d > CONTACT_RANGE * 1.4) s.ignore.delete(o.army.id);
        continue;
      }
      if (d < CONTACT_RANGE && this.hostile(s.army, o.army.factionId)) {
        this.startEvent(s, "field_battle", o, null);
        return true;
      }
    }
    for (const c of this.cities) {
      const owner = scenario.cityOwners[c.id];
      if (!this.hostile(s.army, owner)) continue;
      if (Math.hypot(c.lon - s.army.lon, c.lat - s.army.lat) < this.cityReach(c) + 0.3) {
        this.startEvent(s, "siege_battle", null, c);
        return true;
      }
    }
    return false;
  }

  private startEvent(attacker: ArmyState, type: BattleEvent["type"], defender: ArmyState | null, city: City | null): void {
    const event: BattleEvent = {
      id: `battle_${this.nextEventId++}`,
      type,
      attackerArmyId: attacker.army.id,
      defenderArmyId: defender ? defender.army.id : null,
      defenderCityId: city ? city.id : null,
      lon: attacker.army.lon,
      lat: attacker.army.lat,
      status: "pending",
      day: Math.floor(this.day),
    };
    this.events.push(event);
    attacker.route = null;
    this.setStatus(attacker, "fighting");
    if (defender) {
      defender.route = null;
      this.setStatus(defender, "fighting");
    }
    this.listener.onBattleEvent(event);
  }

  /** 1日ごとの消耗と回復 */
  private dailyUpkeep(s: ArmyState): void {
    const a = s.army;
    s.supplied = this.nearFriendlyCity(s);
    const marching = s.status === "marching";
    if (marching) {
      a.food -= 1;
      a.fatigue += 3 * Math.min(2, this.grid.costAt(a.lon, a.lat) || 1);
    } else {
      a.fatigue -= 8;
      // 味方の都市の近くなら補給を受ける。離れていれば、現地調達で消費を半分に抑える
      a.food += s.supplied ? 3 : -0.5;
    }
    a.food = Math.max(0, Math.min(FOOD_CAP, a.food));
    a.fatigue = Math.max(0, Math.min(100, a.fatigue));

    if (a.food <= 0) {
      a.morale -= 5;
      if (a.morale < 35) {
        // 食糧が尽きたまま士気が下がると、兵が逃げ出す
        for (const k of Object.keys(a.troops) as UnitTypeId[]) a.troops[k] = Math.floor(a.troops[k] * 0.97);
      }
    } else if (a.fatigue > 75) {
      a.morale -= 2;
    } else if (!marching && a.morale < 85) {
      a.morale += 1;
    }
    a.morale = Math.max(0, Math.min(100, a.morale));

    let statusChanged = false;
    if (s.status === "camping" || s.status === "resupplying" || s.status === "idle") {
      const next: ArmyStatus = s.supplied && a.food < FOOD_CAP ? "resupplying" : "camping";
      statusChanged = next !== s.status;
      s.status = next;
    }
    if (totalTroops(a) <= 0) a.morale = 0;
    this.listener.onArmyChanged(s, statusChanged);
  }
}
