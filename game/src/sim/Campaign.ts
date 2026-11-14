// ゲームの進行を計算する。日付を進め、軍団の行軍・食糧・疲労・士気・敵との接触を扱う。
// ここは計算だけで、3D表示のことは知らない。変化があったら、登録された関数で知らせる。
import { resolveCityLayout, scenario, totalTroops } from "../data";
import { initialCityState, placeName } from "./battle";
import type { BattleResult, CommanderFate, SideResult } from "../battle/types";
import type { Army, ArmyStatus, BattleEvent, City, CityState, UnitTypeId } from "../data/types";
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
  /** 攻めようとしている敵の都市(目的地がその都市のそばのときだけ入る) */
  targetCityId: string | null;
  /** 直近の会戦での指揮官の状態(負傷・捕虜・戦死) */
  commanderFate?: CommanderFate;
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
  /** 軍団が壊滅して、地図から消えた */
  onArmyRemoved(state: ArmyState): void;
  /** 都市が陥落して、支配する勢力が変わった */
  onCityCaptured(cityId: string, factionId: string): void;
}

export class Campaign {
  /** ゲーム開始からの日数(小数。0.5 = 1日目の正午) */
  day = 0;
  /** 進む速さ。0 = 一時停止 */
  speed = 1;
  readonly armies: ArmyState[];
  readonly events: BattleEvent[] = [];
  /** 都市の、いまの状態(守備兵・食糧・士気・損傷)。攻城戦を受けた都市だけが入る */
  readonly cityStates: Record<string, CityState> = {};
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
      targetCityId: null,
    }));
    for (const s of this.armies) s.supplied = this.nearFriendlyCity(s);
  }

  /** 都市の、いまの状態(まだ戦いを受けていなければ、最初の状態) */
  cityState(city: City): CityState {
    return this.cityStates[city.id] ?? initialCityState(city);
  }

  /** 城壁と城門の損傷は、日数をかけて少しずつ直る(修復に資金がかかる仕組みは、まだ無い) */
  private repairCities(): void {
    for (const state of Object.values(this.cityStates)) {
      state.wallDamage = Math.max(0, state.wallDamage - 0.004);
      state.gateDamage = Math.max(0, state.gateDamage - 0.01);
      state.morale = Math.min(70, state.morale + 0.5);
    }
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
    // 目的地が敵の都市のそばなら、その都市を攻める意思があるとみなす。
    // (通りかかっただけの都市とは、攻城戦にならない)
    const end = route.points[route.points.length - 1];
    const target = this.cities.find(
      (c) =>
        this.hostile(s.army, scenario.cityOwners[c.id]) &&
        Math.hypot(c.lon - end.lon, c.lat - end.lat) < this.cityReach(c) + 0.3,
    );
    s.targetCityId = target ? target.id : null;
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

  /** 対峙していた相手から離れる。まだ始まっていない戦闘イベントは取り消しにする */
  private withdraw(s: ArmyState): void {
    if (s.status !== "fighting") return;
    for (const e of this.events) {
      if (e.status !== "pending" && e.status !== "preparing") continue;
      if (e.attackerArmyId !== s.army.id && e.defenderArmyId !== s.army.id) continue;
      e.status = "cancelled";
      const otherId = e.attackerArmyId === s.army.id ? e.defenderArmyId : e.attackerArmyId;
      const other = otherId ? this.stateOf(otherId) : undefined;
      if (other && other.status === "fighting") this.setStatus(other, "camping");
    }
  }

  eventOf(battleId: string): BattleEvent | undefined {
    return this.events.find((e) => e.battleId === battleId);
  }

  /** その軍団が関わっている、まだ決着していない戦闘イベント */
  openEventOfArmy(armyId: string): BattleEvent | undefined {
    return this.events.find(
      (e) =>
        (e.status === "pending" || e.status === "preparing" || e.status === "in_progress") &&
        (e.attackerArmyId === armyId || e.defenderArmyId === armyId),
    );
  }

  /** 戦闘イベントの状態を変える(会戦準備を開く・保留に戻す・開始する) */
  setEventStatus(battleId: string, status: BattleEvent["status"]): void {
    const e = this.eventOf(battleId);
    if (e && e.status !== "completed" && e.status !== "cancelled") e.status = status;
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
      this.repairCities();
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
      if (c.id !== s.targetCityId) continue;
      const owner = scenario.cityOwners[c.id];
      if (!this.hostile(s.army, owner)) continue;
      if (Math.hypot(c.lon - s.army.lon, c.lat - s.army.lat) < this.cityReach(c) + 0.3) {
        this.startEvent(s, "siege_battle", null, c);
        return true;
      }
    }
    return false;
  }

  private startEvent(attacker: ArmyState, type: BattleEvent["battleType"], defender: ArmyState | null, city: City | null): void {
    // 同じ相手との、まだ決着していない戦闘イベントがあれば、重ねて作らない
    const duplicate = this.events.some(
      (e) =>
        (e.status === "pending" || e.status === "preparing" || e.status === "in_progress") &&
        ((defender &&
          ((e.attackerArmyId === attacker.army.id && e.defenderArmyId === defender.army.id) ||
            (e.attackerArmyId === defender.army.id && e.defenderArmyId === attacker.army.id))) ||
          (city && e.attackerArmyId === attacker.army.id && e.defenderCityId === city.id)),
    );
    attacker.route = null;
    if (duplicate) {
      this.setStatus(attacker, "fighting");
      return;
    }
    const lon = defender ? (attacker.army.lon + defender.army.lon) / 2 : attacker.army.lon;
    const lat = defender ? (attacker.army.lat + defender.army.lat) / 2 : attacker.army.lat;
    const event: BattleEvent = {
      battleId: `battle_${this.nextEventId++}`,
      battleType: type,
      attackerArmyId: attacker.army.id,
      defenderArmyId: defender ? defender.army.id : null,
      defenderCityId: city ? city.id : null,
      location: { lon, lat, name: city ? city.name : placeName(this.cities, lon, lat) },
      terrain: this.grid.kindAt(lon, lat),
      attackerFactionId: attacker.army.factionId,
      defenderFactionId: defender ? defender.army.factionId : scenario.cityOwners[city!.id],
      status: "pending",
      createdAt: { day: Math.floor(this.day), text: this.dateText() },
    };
    this.events.push(event);
    // 両軍を止めて対峙させ、時間も止める(プレイヤーが状況を確かめられるように)
    this.setStatus(attacker, "fighting");
    if (defender) {
      defender.route = null;
      this.setStatus(defender, "fighting");
    }
    this.speed = 0;
    this.listener.onBattleEvent(event);
  }

  /**
   * 会戦の結果を、戦略マップの軍団へ書き戻す。会戦側のデータを反映する入口は、ここだけにする。
   * 兵力・士気・疲労・食糧・指揮官の状態を更新し、イベントを決着済みにして記録を残す。
   * 壊滅した軍団は地図から消え、敗れた軍団は勝者から離れる方向へ後退する。
   */
  applyBattleResult(result: BattleResult): void {
    const event = this.eventOf(result.battleId);
    if (!event || event.status === "completed") return;
    event.status = "completed";
    event.record = {
      winner: result.winner,
      reason: result.reason,
      durationSeconds: result.durationSeconds,
      attackerLosses: result.attackerLosses,
      defenderLosses: result.defenderLosses,
    };

    const apply = (armyId: string | null, r: SideResult): ArmyState | null => {
      const s = armyId ? this.stateOf(armyId) : undefined;
      if (!s) return null;
      const a = s.army;
      a.troops = { ...r.after };
      a.morale = r.morale;
      a.fatigue = r.fatigue;
      a.food = Math.max(0, a.food - 1);
      s.commanderFate = r.commander;
      if (r.commander === "killed" || r.commander === "captured") a.commanderId = ""; // 指揮官を失った
      s.route = null;
      if (r.outcome === "annihilated" || totalTroops(a) <= 0) {
        this.armies.splice(this.armies.indexOf(s), 1);
        this.listener.onArmyRemoved(s);
        return null;
      }
      s.status = "fighting"; // いったん状態を確定させてから、野営に切り替える
      this.setStatus(s, "camping");
      return s;
    };
    const attacker = apply(event.attackerArmyId, result.sides.attacker);
    const defender = apply(event.defenderArmyId, result.sides.defender);

    // 攻城戦:都市の守備兵・食糧・損傷・守将の状態を書き換え、落城していれば支配する勢力を変える
    const city = result.siege ? this.cities.find((c) => c.id === result.siege!.cityId) : undefined;
    if (result.siege && city) {
      const d = result.sides.defender;
      const prev = this.cityState(city);
      const state: CityState = {
        garrison: d.after.infantry + d.after.cavalry + d.after.archer,
        food: result.siege.foodLeft,
        morale: d.morale,
        // 損傷は、前からの分と今回の分の大きいほうを残す。占領しても、すぐには直らない
        wallDamage: Math.max(prev.wallDamage, result.siege.wallDamage),
        gateDamage: Math.max(prev.gateDamage, result.siege.gateDamage),
        governorFate: d.commander,
      };
      if (result.siege.captured) {
        // 落城:攻撃側の勢力のものになる。守備隊は、仮に攻撃側の兵から1,000人を置いたものとする(軍団の兵力は減らさない)
        state.garrison = 1000;
        state.morale = 60;
        state.governorFate = "captured";
        this.listener.onCityCaptured(city.id, event.attackerFactionId);
      } else if (attacker) {
        // 攻め落とせなかった軍団は、都市から離れる方向へ退く
        const dx = attacker.army.lon - city.lon;
        const dy = attacker.army.lat - city.lat;
        const len = Math.hypot(dx, dy) || 1;
        const route = this.planRoute(attacker.army.id, { lon: attacker.army.lon + (dx / len) * 0.9, lat: attacker.army.lat + (dy / len) * 0.9 });
        if (route) this.orderMove(attacker.army.id, route);
      }
      this.cityStates[city.id] = state;
    }

    // 敗れた軍団は、勝者から離れる方向へ後退する
    const loser = result.winner === "attacker" ? defender : result.winner === "defender" ? attacker : null;
    const winner = result.winner === "attacker" ? attacker : result.winner === "defender" ? defender : null;
    if (loser && winner) {
      const dx = loser.army.lon - winner.army.lon;
      const dy = loser.army.lat - winner.army.lat;
      const len = Math.hypot(dx, dy) || 1;
      const route = this.planRoute(loser.army.id, { lon: loser.army.lon + (dx / len) * 0.9, lat: loser.army.lat + (dy / len) * 0.9 });
      if (route) this.orderMove(loser.army.id, route);
    }
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
