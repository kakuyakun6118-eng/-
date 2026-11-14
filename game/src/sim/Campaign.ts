// ゲームの進行を計算する。日付を進め、軍団の行軍・食糧・疲労・士気・敵との接触を扱う。
// ここは計算だけで、3D表示のことは知らない。変化があったら、登録された関数で知らせる。
import { personById, resolveCityLayout, scenario, totalTroops } from "../data";
import { autoResolve } from "./autoBattle";
import { createBattleSetup, governorIdOf, initialCityState, placeName } from "./battle";
import { garrisonCap, StrategyAi, strategyRules } from "./strategy";
import { seasonOf, type CampaignSave, type Relation } from "./save";
import type { BattleResult, CommanderFate, SideResult } from "../battle/types";
import type { Army, ArmyStatus, BattleEvent, City, CityState, PersonStatus, UnitTypeId } from "../data/types";
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
  /** 軍団が加わった(セーブデータの読み込みで、消えていた軍団が戻ったとき) */
  onArmyAdded(state: ArmyState): void;
  /** 都市が陥落して、支配する勢力が変わった */
  onCityCaptured(cityId: string, factionId: string): void;
  /** 出来事の知らせ(AIの行動や、自動で決着した戦い) */
  onNews?(text: string): void;
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
    readonly cities: City[],
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
    // 勢力の蓄え:最初は、支配する都市の3か月分の収入を持っている
    for (const f of scenario.factions) this.factionStates[f.id] = { gold: 0, grain: 0 };
    for (let i = 0; i < 3; i++) this.collectIncome();
  }

  /** 勢力の、1か月の収入(支配する都市の経済力と食糧生産の合計) */
  incomeOf(factionId: string): { gold: number; grain: number } {
    let gold = 0;
    let grain = 0;
    for (const c of this.cities) {
      if (scenario.cityOwners[c.id] !== factionId) continue;
      gold += c.economy ?? 0;
      grain += c.food ?? 0;
    }
    return { gold, grain };
  }

  /** 月に1度、各勢力に収入を入れる。軍団の兵は糧を食べる(1,000人で月に2) */
  private collectIncome(): void {
    for (const f of scenario.factions) {
      const state = (this.factionStates[f.id] ??= { gold: 0, grain: 0 });
      const income = this.incomeOf(f.id);
      const upkeep = this.armies.filter((s) => s.army.factionId === f.id).reduce((sum, s) => sum + totalTroops(s.army), 0) / 500;
      state.gold += income.gold;
      state.grain = Math.max(0, state.grain + income.grain - upkeep);
    }
  }

  /** 人物の状態(負傷・捕虜・死亡)。健在の人物は入れない */
  readonly personStates: Record<string, PersonStatus> = {};
  /** 勢力の蓄え(金・糧) */
  readonly factionStates: Record<string, { gold: number; grain: number }> = {};

  personStatus(id: string): PersonStatus {
    return this.personStates[id] ?? "active";
  }

  /** 会戦の結果(戦死・捕虜・負傷)を、人物の状態に記録する */
  private recordFate(personId: string | undefined, fate: string | undefined): void {
    if (!personId) return;
    if (fate === "killed") this.personStates[personId] = "dead";
    else if (fate === "captured") this.personStates[personId] = "captured";
    else if (fate === "wounded") this.personStates[personId] = "wounded";
  }

  /** その人物の、いまの役目(太守・守将か、軍団の指揮官)。無ければ null */
  postOf(personId: string): { kind: "city" | "army"; id: string; label: string } | null {
    const army = this.armies.find((s) => s.army.commanderId === personId);
    if (army) return { kind: "army", id: army.army.id, label: `${army.army.name} 指揮官` };
    const city = this.cities.find((c) => governorIdOf(c, this.cityStates[c.id]) === personId);
    if (city) return { kind: "city", id: city.id, label: `${city.name} ${personById(personId)?.role === "ruler" ? "在城(君主)" : city.kind === "pass" ? "守将" : "太守"}` };
    return null;
  }

  /**
   * 人物を、太守・守将か軍団の指揮官に任命する(target が null なら、任を解く)。
   * できないときは、理由を文字で返す。できたときは null。
   */
  appoint(personId: string, target: { kind: "city" | "army"; id: string } | null): string | null {
    const person = personById(personId);
    if (!person) return "人物が見つかりません";
    if (this.personStatus(personId) !== "active") return "負傷・捕虜・死亡の人物は任命できません";
    const city = target?.kind === "city" ? this.cities.find((c) => c.id === target.id) : undefined;
    const army = target?.kind === "army" ? this.stateOf(target.id) : undefined;
    if (target && !city && !army) return "任命先が見つかりません";
    if (city && scenario.cityOwners[city.id] !== person.factionId) return "ほかの勢力の都市には任命できません";
    if (army && army.army.factionId !== person.factionId) return "ほかの勢力の軍団には任命できません";
    if (army && army.status === "fighting") return "戦闘中の軍団の指揮官は替えられません";
    // いまの役目を解く(1人が持てる役目は1つ)
    for (const s of this.armies) if (s.army.commanderId === personId) s.army.commanderId = "";
    for (const c of this.cities) {
      if (governorIdOf(c, this.cityStates[c.id]) === personId) this.cityStates[c.id] = { ...this.cityState(c), governorId: null };
    }
    if (city) this.cityStates[city.id] = { ...this.cityState(city), governorId: personId, governorFate: "healthy" };
    if (army) army.army.commanderId = personId;
    return null;
  }

  /** 勢力の組ごとの関係。書かれていない組は和平 */
  readonly relations: Record<string, Relation> = { ...(scenario.relations as Record<string, Relation> | undefined) };
  private relationSince: Record<string, number> = {};
  /** 操作している勢力。null のあいだは、敵の自動行動(戦略AI)は動かない */
  playerFactionId: string | null = null;
  difficulty: keyof typeof strategyRules.profiles = "normal";
  /** 最近の出来事(新しいものが後ろ) */
  readonly news: { day: number; text: string }[] = [];
  /** プレイヤーへの外交の申し入れ(返事待ち) */
  readonly proposals: { from: string; kind: "peace" | "alliance"; day: number }[] = [];
  private nextArmyId = 1;
  private readonly pendingAuto: BattleEvent[] = [];
  private readonly strategy = new StrategyAi(this);

  relationOf(a: string, b: string): Relation {
    return this.relations[[a, b].sort().join("|")] ?? "peace";
  }

  atWar(a: string, b: string | undefined): boolean {
    return b !== undefined && a !== b && this.relationOf(a, b) === "war";
  }

  setRelation(a: string, b: string, relation: Relation): void {
    const key = [a, b].sort().join("|");
    this.relations[key] = relation;
    this.relationSince[key] = Math.floor(this.day);
  }

  /** 関係が最後に変わってからの日数(開始時からの関係は、十分に長いものとして扱う) */
  relationAge(a: string, b: string): number {
    const since = this.relationSince[[a, b].sort().join("|")];
    return since === undefined ? 9999 : Math.floor(this.day) - since;
  }

  strengthOf(factionId: string): number {
    return this.strategy.strengthOf(factionId);
  }

  addNews(text: string): void {
    this.news.push({ day: Math.floor(this.day), text: `${this.dateText()} ${text}` });
    if (this.news.length > 40) this.news.shift();
    this.listener.onNews?.(text);
  }

  /** AIからプレイヤーへの申し入れ(同じものは重ねない) */
  propose(from: string, kind: "peace" | "alliance"): void {
    if (this.proposals.some((x) => x.from === from && x.kind === kind)) return;
    this.proposals.push({ from, kind, day: Math.floor(this.day) });
    this.addNews(`${factionName(from)}が${kind === "peace" ? "和睦" : "同盟"}を求めています(外交の画面で返事ができます)`);
  }

  /** プレイヤーが、申し入れに返事をする */
  answerProposal(from: string, accept: boolean): void {
    const i = this.proposals.findIndex((x) => x.from === from);
    if (i < 0 || !this.playerFactionId) return;
    const [x] = this.proposals.splice(i, 1);
    if (accept) {
      this.setRelation(from, this.playerFactionId, x.kind === "peace" ? "peace" : "alliance");
      this.addNews(`${factionName(from)}と${x.kind === "peace" ? "和睦" : "同盟"}しました`);
    }
  }

  /**
   * プレイヤーからの外交。宣戦はすぐに成り立つ。和睦と同盟は、相手が受けるかどうかを兵力と状況で決める。
   * 結果を、画面に出す文で返す。
   */
  diplomacy(target: string, action: "war" | "peace" | "alliance"): string {
    const me = this.playerFactionId;
    if (!me || me === target) return "操作する勢力を選んでください";
    const now = this.relationOf(me, target);
    const name = factionName(target);
    if (this.relationAge(me, target) < 90) return `${name}との関係は変わったばかりです(90日たつまで変えられません)`;
    const others = scenario.factions.filter((f) => f.id !== me && f.id !== target);
    if (action === "war") {
      if (now === "war") return "すでに戦争中です";
      this.setRelation(me, target, "war");
      this.addNews(`${factionName(me)}が${name}に宣戦しました`);
      return `${name}に宣戦しました`;
    }
    if (action === "peace") {
      if (now !== "war") return "戦争中ではありません";
      const theirWars = others.filter((f) => this.relationOf(target, f.id) === "war").length;
      if (this.strengthOf(me) >= this.strengthOf(target) * 0.8 || theirWars >= 1) {
        this.setRelation(me, target, "peace");
        this.addNews(`${factionName(me)}と${name}が和睦しました`);
        return `${name}は和睦を受け入れました`;
      }
      return `${name}は和睦を断りました(相手のほうが優勢で、ほかに敵もいません)`;
    }
    if (now !== "peace") return now === "alliance" ? "すでに同盟しています" : "戦争中の相手とは、先に和睦が必要です";
    const common = others.some((f) => this.relationOf(me, f.id) === "war" && this.relationOf(target, f.id) === "war");
    if (!common) return `${name}は同盟を断りました(共通の敵がいません)`;
    this.setRelation(me, target, "alliance");
    this.addNews(`${factionName(me)}と${name}が同盟しました`);
    return `${name}と同盟しました`;
  }

  /** 徴兵:金を払って、都市の守備兵を増やす。できないときは理由を返す */
  recruit(cityId: string, troops: number): string | null {
    const city = this.cities.find((c) => c.id === cityId);
    const owner = city ? scenario.cityOwners[city.id] : undefined;
    const st = owner ? this.factionStates[owner] : undefined;
    if (!city || !st) return "都市が見つかりません";
    const state = this.cityState(city);
    const n = Math.floor(Math.min(troops, garrisonCap(city) - state.garrison));
    if (n < 100) return "守備兵は、これ以上置けません";
    const cost = (n / 100) * strategyRules.costs.goldPer100Troops;
    if (st.gold < cost) return `金が足りません(必要 ${Math.ceil(cost)})`;
    st.gold -= cost;
    this.cityStates[city.id] = { ...state, garrison: state.garrison + n };
    return null;
  }

  /** 出陣:都市の守備兵から、新しい軍団を作る。できないときは理由を返す */
  raiseArmy(cityId: string, troops: number, commanderId?: string): ArmyState | string {
    const city = this.cities.find((c) => c.id === cityId);
    const owner = city ? scenario.cityOwners[city.id] : undefined;
    const st = owner ? this.factionStates[owner] : undefined;
    if (!city || !owner || !st) return "都市が見つかりません";
    const state = this.cityState(city);
    const n = Math.floor(troops);
    if (n < strategyRules.costs.minArmy) return `軍団は ${strategyRules.costs.minArmy.toLocaleString("ja-JP")}人以上で編成します`;
    if (state.garrison - n < strategyRules.costs.minGarrison) return `守備兵を ${strategyRules.costs.minGarrison}人は残す必要があります`;
    const grain = (n / 100) * strategyRules.costs.grainPer100TroopsToRaise;
    if (st.grain < grain) return `糧が足りません(必要 ${Math.ceil(grain)})`;
    // 置き場所:都市のまわりで、通れて、ほかの軍団と重ならない所
    let spot: RoutePoint | null = null;
    for (let ring = 1; ring <= 4 && !spot; ring++) {
      for (let k = 0; k < 8 && !spot; k++) {
        const ang = (k / 8) * Math.PI * 2 + ring;
        const p = { lon: city.lon + Math.cos(ang) * (this.cityReach(city) + 0.12 * ring), lat: city.lat + Math.sin(ang) * (this.cityReach(city) + 0.12 * ring) };
        if (!isFinite(this.grid.costAt(p.lon, p.lat))) continue;
        if (this.armies.some((o) => Math.hypot(o.army.lon - p.lon, o.army.lat - p.lat) < 0.3)) continue;
        spot = p;
      }
    }
    if (!spot) return "軍団を置ける場所がありません";
    st.grain -= grain;
    this.cityStates[city.id] = { ...state, garrison: state.garrison - n };
    // 兵種の割合:遊牧の勢力は騎兵が多い(ゲーム上の設定)
    const people = scenario.factions.find((f) => f.id === owner)?.people ?? "";
    const nomad = /匈奴|鮮卑|羯/.test(people);
    const cavalry = Math.round(n * (nomad ? 0.5 : 0.15));
    const archer = Math.round(n * (nomad ? 0.15 : 0.25));
    const commander = personById(commanderId);
    const id = `army_n${this.nextArmyId++}`;
    const army: Army = {
      id, name: commander ? `${commander.name}軍` : `${city.name}の軍`, factionId: owner, commanderId: commander?.id ?? "",
      lon: spot.lon, lat: spot.lat, facing: 0,
      troops: { infantry: n - cavalry - archer, cavalry, archer }, morale: 70, fatigue: 0, food: 45,
    };
    const s: ArmyState = { army, status: "camping", route: null, progress: 0, supplied: true, ignore: new Set<string>(), targetCityId: null };
    this.armies.push(s);
    this.listener.onArmyAdded(s);
    return s;
  }

  /** 補充:軍団が、そばの味方の都市の守備兵を受け取る */
  reinforce(armyId: string, cityId: string, troops: number): string | null {
    const s = this.stateOf(armyId);
    const city = this.cities.find((c) => c.id === cityId);
    if (!s || !city || scenario.cityOwners[city.id] !== s.army.factionId) return "補充できません";
    if (distanceKm(city, s.army) > SUPPLY_RANGE_KM) return "都市から離れすぎています";
    const state = this.cityState(city);
    const n = Math.floor(Math.min(troops, state.garrison - strategyRules.costs.minGarrison));
    if (n < 100) return "都市に、出せる兵がいません";
    this.cityStates[city.id] = { ...state, garrison: state.garrison - n };
    s.army.troops.infantry += n;
    this.listener.onArmyChanged(s, false);
    return null;
  }

  /** いまの年・月・季節 */
  calendar(): { year: number; month: number; season: string } {
    const d = Math.floor(this.day);
    const month = (Math.floor((60 + d) / 30) % 12) + 1;
    return { year: scenario.year + Math.floor((60 + d) / 360), month, season: seasonOf(month) };
  }

  /** 進行の状態を、保存できる形に書き出す */
  serialize(): CampaignSave {
    const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    return copy({
      day: this.day,
      nextEventId: this.nextEventId,
      armies: this.armies.map((s) => ({
        army: s.army, status: s.status, route: s.route, progress: s.progress, supplied: s.supplied,
        ignore: [...s.ignore], targetCityId: s.targetCityId, commanderFate: s.commanderFate,
      })),
      events: this.events,
      cityStates: this.cityStates,
      relations: this.relations,
      personStates: this.personStates,
      factionStates: this.factionStates,
      relationSince: this.relationSince,
      news: this.news,
      proposals: this.proposals,
      nextArmyId: this.nextArmyId,
    });
  }

  /**
   * 保存した状態に戻す。軍団は、いまの入れ物を使い回して中身を書き換える(表示側とのつながりを保つため)。
   * 消えていた軍団が戻るとき・いる軍団が消えるときは、表示側に知らせる。時間は止めた状態で戻る。
   */
  restore(save: CampaignSave): void {
    const data = JSON.parse(JSON.stringify(save)) as CampaignSave;
    this.day = data.day;
    this.nextEventId = data.nextEventId;
    this.speed = 0;
    this.events.length = 0;
    this.events.push(...data.events);
    // 開いていた会戦は、開始前(保留)に戻す。決着済みのものは、そのまま決着済みとして残る
    for (const e of this.events) {
      if (e.status === "preparing" || e.status === "in_progress") e.status = "pending";
    }
    for (const k of Object.keys(this.cityStates)) delete this.cityStates[k];
    Object.assign(this.cityStates, data.cityStates);
    // 関係は、シナリオの最初の関係に、セーブにある分を重ねる(古いセーブには関係が入っていない)
    for (const k of Object.keys(this.relations)) delete this.relations[k];
    Object.assign(this.relations, scenario.relations, data.relations);
    this.relationSince = { ...data.relationSince };
    this.news.length = 0;
    this.news.push(...(data.news ?? []));
    this.proposals.length = 0;
    this.proposals.push(...(data.proposals ?? []));
    this.nextArmyId = data.nextArmyId ?? 1;
    this.pendingAuto.length = 0;
    for (const k of Object.keys(this.personStates)) delete this.personStates[k];
    Object.assign(this.personStates, data.personStates);
    // 勢力の蓄えは、セーブにある勢力の分だけ上書きする(古いセーブに無い勢力は、いまの値のまま)
    for (const [id, st] of Object.entries(data.factionStates)) this.factionStates[id] = st;

    const saved = new Set(data.armies.map((a) => a.army.id));
    for (const s of [...this.armies]) {
      if (saved.has(s.army.id)) continue;
      this.armies.splice(this.armies.indexOf(s), 1);
      this.listener.onArmyRemoved(s);
    }
    for (const a of data.armies) {
      let s = this.stateOf(a.army.id);
      const added = !s;
      if (!s) {
        s = { army: a.army, status: a.status, route: null, progress: 0, supplied: false, ignore: new Set<string>(), targetCityId: null };
        this.armies.push(s);
      }
      Object.assign(s.army, a.army);
      s.status = a.status;
      s.route = a.route;
      s.progress = a.progress;
      s.supplied = a.supplied;
      s.ignore = new Set(a.ignore);
      s.targetCityId = a.targetCityId;
      s.commanderFate = a.commanderFate;
      if (added) this.listener.onArmyAdded(s);
      else {
        this.listener.onArmyMoved(s);
        this.listener.onArmyChanged(s, true);
      }
    }
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
    return this.atWar(a.factionId, factionId);
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
  private freeSpots(target: RoutePoint, self: ArmyState): RoutePoint[] {
    const ok = (p: RoutePoint): boolean =>
      isFinite(this.grid.costAt(p.lon, p.lat)) &&
      this.armies.every((o) => o === self || Math.hypot(o.army.lon - p.lon, o.army.lat - p.lat) >= MIN_SEPARATION) &&
      this.cities.every((c) => Math.hypot(c.lon - p.lon, c.lat - p.lat) >= this.cityReach(c) + 0.1);
    if (ok(target)) return [target];
    // 空いている場所を、軍団のいまの位置に近い順に並べる(関所の向こう側など、行けない場所を後回しにする)
    // 目的地に近い輪から順に。同じ輪の中では、軍団のいまの位置に近い側を先に(関所の手前側から着けるように)
    const d = (p: RoutePoint): number => Math.hypot(p.lon - self.army.lon, p.lat - self.army.lat);
    const spots: RoutePoint[] = [];
    for (let ring = 1; ring <= 5; ring++) {
      const r = ring * 0.18;
      const found: RoutePoint[] = [];
      for (let k = 0; k < ring * 8; k++) {
        const a = (k / (ring * 8)) * Math.PI * 2;
        const p = { lon: target.lon + Math.cos(a) * r, lat: target.lat + Math.sin(a) * r };
        if (ok(p)) found.push(p);
      }
      spots.push(...found.sort((a, b) => d(a) - d(b)).slice(0, 4));
    }
    return spots.slice(0, 12);
  }

  /**
   * 点検用:関所の両側(塞ぐ線に直角に、35kmほど離れた2点)の間の手間を測る。
   * open は、この関所だけを開けたとき。sealed は、すべての関所を閉じたとき(行けなければ null)。
   */
  passCheck(passId: string): { open: number | null; sealed: number | null } {
    const pass = this.cities.find((c) => c.id === passId)?.pass;
    if (!pass) return { open: null, sealed: null };
    const k = pass.barrier.reduce((best, v, i) => (Math.hypot(v[0] - pass.lon, v[1] - pass.lat) < Math.hypot(pass.barrier[best][0] - pass.lon, pass.barrier[best][1] - pass.lat) ? i : best), 0);
    const p0 = pass.barrier[Math.max(0, k - 1)];
    const p1 = pass.barrier[Math.min(pass.barrier.length - 1, k + 1)];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
    const nx = -(p1[1] - p0[1]) / len;
    const ny = (p1[0] - p0[0]) / len;
    const side = (sign: number): RoutePoint | null => {
      for (const d of [0.35, 0.25, 0.45, 0.55]) {
        const p = { lon: pass.lon + nx * d * sign, lat: pass.lat + ny * d * sign };
        if (isFinite(this.grid.costAt(p.lon, p.lat))) return p;
      }
      return null;
    };
    const a = side(1);
    const b = side(-1);
    if (!a || !b) return { open: null, sealed: null };
    const effort = (closed: (cell: number) => boolean): number | null => {
      const r = findRoute(this.grid, a, b, closed);
      return r ? Math.round(r.effort[r.effort.length - 1]) : null;
    };
    return {
      open: effort((cell) => this.grid.gates.has(cell) && this.grid.gates.get(cell) !== passId),
      sealed: effort((cell) => this.grid.gates.has(cell)),
    };
  }

  /** 関所を閉じたとき、結ぶ2都市の間の道のりがどれだけ遠回りになるか(点検用)。行けないときは null */
  passDetour(passId: string): { open: number | null; closed: number | null } {
    const pass = this.cities.find((c) => c.id === passId)?.pass;
    const a = this.cities.find((c) => c.id === pass?.between[0]);
    const b = this.cities.find((c) => c.id === pass?.between[1]);
    if (!pass || !a || !b) return { open: null, closed: null };
    const effort = (closed?: (cell: number) => boolean): number | null => {
      const r = findRoute(this.grid, a, b, closed);
      return r ? Math.round(r.effort[r.effort.length - 1]) : null;
    };
    return { open: effort(), closed: effort((cell) => this.grid.gates.get(cell) === passId) };
  }

  /** その軍団が、入れないマスか(敵の勢力が守る関所) */
  private closedFor(army: Army): (cell: number) => boolean {
    return (cell) => {
      const passId = this.grid.gates.get(cell);
      // 関所は、持ち主と同盟の勢力だけが通れる(和平の相手でも、通してはもらえない)
      const owner = passId === undefined ? undefined : scenario.cityOwners[passId];
      return owner !== undefined && owner !== army.factionId && this.relationOf(army.factionId, owner) !== "alliance";
    };
  }

  /** 移動先までの経路を調べる(まだ動かさない)。行けないときは null */
  planRoute(armyId: string, target: RoutePoint, maxSpots = 12): Route | null {
    const s = this.stateOf(armyId);
    if (!s) return null;
    const closed = this.closedFor(s.army);
    for (const spot of this.freeSpots(target, s).slice(0, maxSpots)) {
      const route = findRoute(this.grid, { lon: s.army.lon, lat: s.army.lat }, spot, closed);
      if (route && route.points.length >= 2) return route;
    }
    return null;
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
      if ((d + 1) % 30 === 0) this.collectIncome();
      if (this.playerFactionId !== null) this.strategy.daily(d + 1);
      this.listener.onDayChanged(d + 1);
    }
    this.resolveAutoBattles();
  }

  /** AIどうしの戦いを、計算で決着させて地図に反映する */
  private resolveAutoBattles(): void {
    while (this.pendingAuto.length > 0) {
      const event = this.pendingAuto.shift()!;
      if (event.status !== "pending") continue;
      const setup = createBattleSetup(event, (id) => this.stateOf(id)?.army, this.cities, (c) => this.cityState(c));
      if (!setup) {
        event.status = "cancelled";
        continue;
      }
      const result = autoResolve(setup);
      const attackerName = setup.attacker.name;
      const defenderName = setup.defender.name;
      this.applyBattleResult(result);
      if (result.siege) {
        // 囲んでいた日数ぶん、攻撃側の食糧が減る
        const s = this.stateOf(event.attackerArmyId);
        if (s) s.army.food = Math.max(0, s.army.food - result.siege.days * 0.5);
        this.addNews(result.siege.captured ? `${attackerName}が${event.location.name}を攻め落としました` : `${attackerName}は${event.location.name}を落とせず、退きました`);
      } else {
        this.addNews(`${event.location.name}の戦い:${result.winner === "draw" ? `${attackerName}と${defenderName}は引き分けました` : `${result.winner === "attacker" ? attackerName : defenderName}が${result.winner === "attacker" ? defenderName : attackerName}を破りました`}`);
      }
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
    // プレイヤーが関わらない戦い(AIどうし)は、時間を止めずに、計算で決着させる
    if (this.playerFactionId !== null && event.attackerFactionId !== this.playerFactionId && event.defenderFactionId !== this.playerFactionId) {
      this.pendingAuto.push(event);
      return;
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
      this.recordFate(a.commanderId, r.commander);
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
        governorId: governorIdOf(city, prev) ?? null,
      };
      const governorId = governorIdOf(city, prev);
      this.recordFate(governorId, d.commander);
      if (d.commander === "killed" || d.commander === "captured") state.governorId = null;
      if (result.siege.captured) {
        // 落城:攻撃側の勢力のものになる。守備隊は、仮に攻撃側の兵から1,000人を置いたものとする(軍団の兵力は減らさない)
        state.garrison = 1000;
        state.morale = 60;
        this.recordFate(governorId, d.commander === "killed" ? "killed" : "captured");
        state.governorFate = "healthy"; // 新しい持ち主のもとでは、太守はまだいない
        state.governorId = null;
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

function factionName(id: string): string {
  return scenario.factions.find((f) => f.id === id)?.name ?? "不明の勢力";
}
