// ゲームの進行を計算する。日付を進め、軍団の行軍・食糧・疲労・士気・敵との接触を扱う。
// ここは計算だけで、3D表示のことは知らない。変化があったら、登録された関数で知らせる。
import { cityLevelOf, persons, personById, resolveCityLayout, scenario, totalTroops } from "../data";
import successionRules from "../data/rules/succession.json";
import relationRules from "../data/rules/diplomacyStart.json";
import { autoResolve } from "./autoBattle";
import { createBattleSetup, governorIdOf, initialCityState, placeName } from "./battle";
import { garrisonCap, StrategyAi, strategyRules } from "./strategy";
import { Placement } from "./placement";
import { chance, setCurrentSpoils, Spoils, type CaptureRecord, type PendingCapture } from "./spoils";
import { affinity, isKin, LoyaltySystem } from "./loyalty";
import { cityEcon, Economy } from "./economy";
import { Diplomacy, type DiploCommand } from "./diplomacy";
import { Court } from "./court";
import { HistorySystem } from "./history";
import { TradeSystem } from "./trade";
import { seasonOf, type CampaignSave, type DynastySave, type Relation } from "./save";
import type { BattleResult, CommanderFate, SideResult } from "../battle/types";
import type { Army, ArmyStatus, BattleEvent, City, CityState, Faction, Person, PersonRole, PersonStatus, UnitTypeId } from "../data/types";
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
  /** 国が滅びた(successors は独立した後継国家) */
  onFactionFallen?(info: { factionId: string; successors: string[]; captor: string | null }): void;
  /** プレイヤーの勢力が都市を落とし、処置(略奪・保全)を選ぶのを待っている */
  onCapturePending?(pc: PendingCapture): void;
}

/** 開始時の関係:シナリオの戦争・同盟に、史料にもとづく(または推定の)敵対・友好・従属を重ねる */
export function initialRelations(): Record<string, Relation> {
  const extra = (relationRules as unknown as Record<string, Record<string, { rel: Relation }>>)[scenario.id] ?? {};
  const out: Record<string, Relation> = {};
  for (const [k, v] of Object.entries(extra)) out[k] = v.rel;
  return { ...out, ...(scenario.relations as Record<string, Relation> | undefined) };
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
    this.spoils = new Spoils(cities, (id) => scenario.cityOwners[id]);
    setCurrentSpoils(this.spoils);
    // 勢力の蓄え:最初は、支配する都市の3か月分の収入(支出を引く前)を持っている
    for (const f of scenario.factions) this.factionStates[f.id] = { gold: 0, grain: 0 };
    this.loyalty = new LoyaltySystem(this);
    this.economy = new Economy(this);
    for (const f of scenario.factions) {
      const r = this.economy.report(f.id);
      this.factionStates[f.id] = { gold: r.income.total * 3, grain: r.income.grain * 3 };
    }
    this.diplo = new Diplomacy(this);
    this.court = new Court(this);
    this.history = new HistorySystem(this);
    this.trade = new TradeSystem(this);
    this.placement.init(true);
  }

  /** 勢力の、1か月の収入(支出を引く前) */
  incomeOf(factionId: string): { gold: number; grain: number } {
    const r = this.economy.report(factionId);
    return { gold: r.income.total, grain: r.income.grain };
  }

  /** 月に1度、各勢力に収入を入れる。軍団の兵は糧を食べる(1,000人で月に2) */
  private collectIncome(): void {
    this.economy.monthly();
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
    if (fate === "killed") {
      this.personStates[personId] = "dead";
      this.court?.recordCause(personId, "battle", "会戦で討たれる");
    }
    else if (fate === "captured") this.personStates[personId] = "captured";
    else if (fate === "wounded") this.personStates[personId] = "wounded";
  }

  /** その人物の、いまの役目(太守・守将か、軍団の指揮官)。無ければ null */
  postOf(personId: string): { kind: "city" | "army" | "deputy"; id: string; label: string } | null {
    const army = this.armies.find((s) => s.army.commanderId === personId);
    if (army) return { kind: "army", id: army.army.id, label: `${army.army.name} 指揮官` };
    const dep = this.armies.find((s) => s.army.deputyId === personId);
    if (dep) return { kind: "deputy", id: dep.army.id, label: `${dep.army.name} 副将` };
    const city = this.cities.find((c) => governorIdOf(c, this.cityStates[c.id]) === personId);
    if (city) return { kind: "city", id: city.id, label: `${city.name} ${personById(personId)?.role === "ruler" ? "在城(君主)" : city.kind === "pass" ? "守将" : "太守"}` };
    return null;
  }

  /**
   * 人物を、太守・守将か軍団の指揮官に任命する(target が null なら、任を解く)。
   * できないときは、理由を文字で返す。できたときは null。
   */
  appoint(personId: string, target: { kind: "city" | "army" | "deputy"; id: string } | null): string | null {
    const person = personById(personId);
    if (!person) return "人物が見つかりません";
    if (this.personStatus(personId) !== "active") return "負傷・捕虜・死亡の人物は任命できません";
    if (target && this.court?.isMinor(person)) return `${person.name}は未成年(${this.court.age(person)}歳)のため、任命できません(15歳から)`;
    const city = target?.kind === "city" ? this.cities.find((c) => c.id === target.id) : undefined;
    const army = target?.kind === "army" || target?.kind === "deputy" ? this.stateOf(target.id) : undefined;
    if (target && !city && !army) return "任命先が見つかりません";
    if (city && scenario.cityOwners[city.id] !== person.factionId) return "ほかの勢力の都市には任命できません";
    if (army && army.army.factionId !== person.factionId) return "ほかの勢力の軍団には任命できません";
    if (army && army.status === "fighting") return "戦闘中の軍団の指揮官は替えられません";
    // いまの役目を解く(1人が持てる役目は1つ)
    for (const s of this.armies) {
      if (s.army.commanderId === personId) s.army.commanderId = "";
      if (s.army.deputyId === personId) delete s.army.deputyId;
    }
    for (const c of this.cities) {
      if (governorIdOf(c, this.cityStates[c.id]) === personId) this.cityStates[c.id] = { ...this.cityState(c), governorId: null };
    }
    if (city) {
      this.cityStates[city.id] = { ...this.cityState(city), governorId: personId, governorFate: "healthy" };
      this.placement.moveTo(personId, city.id, "city", `${city.name}の${city.kind === "pass" ? "守将" : "太守"}に任命`);
    }
    if (army && target?.kind === "deputy") army.army.deputyId = personId;
    else if (army) army.army.commanderId = personId;
    if (city || army) this.loyalty?.add(personId, 5, city ? `${city.name}の太守に任命` : `${army!.army.name}の${target?.kind === "deputy" ? "副将" : "指揮官"}に任命`);
    return null;
  }

  /** 勢力の組ごとの関係。書かれていない組は和平 */
  readonly relations: Record<string, Relation> = initialRelations();
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
  readonly strategy = new StrategyAi(this);
  /** 人物の所在(Version 40) */
  readonly placement = new Placement(this);
  /** 名品・捕虜・保護・陥落の記録 */
  readonly spoils!: Spoils;
  /** 忠誠度・相性・名声 */
  readonly loyalty!: LoyaltySystem;
  /** 財政・官職・内政 */
  readonly economy!: Economy;
  /** 外交(友好度・条約・婚姻・援軍) */
  readonly diplo!: Diplomacy;
  /** 皇室(家系・婚姻・子女・後継者・即位) */
  readonly court!: Court;
  /** 歴史の重大事件と年表 */
  readonly history!: HistorySystem;
  /** シルクロードの交易 */
  readonly trade!: TradeSystem;
  /** 歴史の流れ:史実重視か自由歴史か(AIの選択の重みが変わる。国の復活やプレイヤーの選択の取り消しはしない) */
  /** 歴史の流れ:通常・史実重視・自由歴史(Version 40で「通常」を追加) */
  historyMode: "normal" | "historic" | "free" = "historic";
  /** 兵站の記録:補給が尽きて失った兵(国ごと)・砂漠や山での損耗 */
  readonly logistics: { attrition: Record<string, number>; expeditions: Record<string, number> } = { attrition: {}, expeditions: {} };

  relationOf(a: string, b: string): Relation {
    const r = this.relations[[a, b].sort().join("|")] ?? "neutral";
    return r === "peace" ? "neutral" : r;
  }

  atWar(a: string, b: string | undefined): boolean {
    return b !== undefined && a !== b && this.relationOf(a, b) === "war";
  }

  setRelation(a: string, b: string, relation: Relation): void {
    const key = [a, b].sort().join("|");
    const before = this.relationOf(a, b);
    const after = relation === "peace" ? "neutral" : relation;
    this.relations[key] = after;
    this.relationSince[key] = Math.floor(this.day);
    if (before !== after) this.diplo?.onRelation(a, b, before, after);
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
      this.setRelation(from, this.playerFactionId, x.kind === "peace" ? "neutral" : "alliance");
      if (x.kind === "alliance") {
        this.diplo.treaties[[from, this.playerFactionId].sort().join("|")] = { kind: "alliance", until: Math.floor(this.day) + 360 * 3 };
        this.diplo.counts.alliances++;
      }
      this.diplo.addAmity(from, this.playerFactionId, 15);
      this.diplo.log(from, this.playerFactionId, x.kind === "peace" ? "和平(申し入れを受ける)" : "同盟(申し入れを受ける)");
      this.addNews(`${factionName(from)}と${x.kind === "peace" ? "和睦" : "同盟"}しました`);
    }
  }

  /**
   * プレイヤーからの外交(画面の入口)。使者・贈り物・婚姻の2人などは opts で渡す。
   * 結果を、画面に出す文で返す。古い呼び方("peace")は和平として扱う。
   */
  diplomacy(target: string, action: DiploCommand | "peace", opts: Parameters<Diplomacy["act"]>[3] = {}): string {
    const me = this.playerFactionId;
    if (!me || me === target) return "操作する勢力を選んでください";
    return this.diplo.act(me, target, action, opts).text;
  }

  /** 戦ってよい相手か:戦争中の国。援軍の軍団は、助けている国の敵とも戦う(条約のある国とは戦わない) */
  hostileTo(a: Army, factionId: string | undefined): boolean {
    if (factionId === undefined || factionId === a.factionId) return false;
    if (this.atWar(a.factionId, factionId)) return true;
    const m = this.diplo?.aidOf(a.id);
    return !!m && !m.returning && m.forFaction !== factionId && this.atWar(m.forFaction, factionId) && !["alliance", "vassal", "nonaggression"].includes(this.relationOf(a.factionId, factionId));
  }

  /** 降伏:相手の国の都市・軍団・人物を、こちらの国に加える。君主は臣下になる */
  annex(target: string, into: string): void {
    const oldRuler = this.rulerOf(target);
    for (const c of this.cities) if (scenario.cityOwners[c.id] === target) {
      scenario.cityOwners[c.id] = into;
      this.listener.onCityCaptured(c.id, into);
    }
    for (const s of this.armies) if (s.army.factionId === target) {
      this.listener.onArmyRemoved(s);
      s.army.factionId = into;
      this.listener.onArmyAdded(s);
    }
    for (const p of persons) if (p.factionId === target && this.personStatus(p.id) !== "dead") this.spoils.setFaction(p.id, into);
    if (oldRuler) {
      this.setRole(oldRuler.id, "general");
      this.loyalty.rebase(oldRuler.id, "降伏して臣下となる", 45);
    }
    for (const [id, s] of Object.entries(this.spoils.state)) if (!s.cityId && s.owner === target) Object.assign(this.spoils.state[id], { owner: into, holderId: null });
    const a = this.factionStates[target];
    const b = (this.factionStates[into] ??= { gold: 0, grain: 0 });
    if (a) {
      b.gold += a.gold;
      b.grain += a.grain;
      a.gold = 0;
      a.grain = 0;
    }
    const f = scenario.factions.find((x) => x.id === target);
    if (f) {
      const day = Math.floor(this.day);
      this.dynasty.fallen[target] = { day, by: into };
      f.fallen = { day, by: into };
    }
    this.addNews(`${factionName(target)}が${factionName(into)}に降伏し、その国に加わりました`);
  }

  /** 徴兵:金を払って、都市の守備兵を増やす。できないときは理由を返す */
  recruit(cityId: string, troops: number): string | null {
    const city = this.cities.find((c) => c.id === cityId);
    const owner = city ? scenario.cityOwners[city.id] : undefined;
    const st = owner ? this.factionStates[owner] : undefined;
    if (!city || !st || !owner) return "都市が見つかりません";
    const state = { ...this.cityState(city) };
    const e = cityEcon(city, state);
    if (e.order < 20) return "治安が悪く、兵が集まりません(治安20以上が必要)";
    if (e.support < 20) return "民の心が離れていて、兵が集まりません(民忠20以上が必要)";
    // 人口に見合う兵まで:守備兵は人口の6%まで(規模ごとの上限もある)
    const popCap = Math.floor(e.pop * 0.06);
    const n = Math.floor(Math.min(troops, garrisonCap(city) - state.garrison, popCap - state.garrison));
    if (n < 100) return popCap - state.garrison < 100 ? `人口に対して兵が多すぎます(人口${e.pop.toLocaleString("ja-JP")}人では、守備兵は${popCap.toLocaleString("ja-JP")}人まで)` : "守備兵は、これ以上置けません";
    const gov = persons.find((p) => p.id === (this.cityStates[city.id]?.governorId ?? city.governorId) && p.factionId === owner);
    const skill = gov ? (gov.leadership + gov.politics) / 200 : 0.4;
    const cost = (n / 100) * strategyRules.costs.goldPer100Troops * (1.15 - skill * 0.3);
    const grain = (n / 100) * 2;
    if (st.gold < cost) return `金が足りません(必要 ${Math.ceil(cost)})`;
    if (st.grain < grain) return `兵糧が足りません(必要 ${Math.ceil(grain)})`;
    st.gold -= cost;
    st.grain -= grain;
    // 90日のあいだにたくさん集めるほど、治安と民忠が下がる
    const day = Math.floor(this.day);
    const recent = state.recruitDay !== undefined && day - state.recruitDay < 90 ? state.recruitRecent ?? 0 : 0;
    const total = recent + n;
    const strain = (total / Math.max(1, e.pop)) * 100;
    state.order = Math.max(0, e.order - Math.round(strain * 6 * (1.1 - skill)));
    state.support = Math.max(0, e.support - Math.round(strain * 8 * (1.1 - skill)));
    state.pop = e.pop - n;
    state.recruitRecent = total;
    state.recruitDay = day;
    state.garrison += n;
    this.cityStates[city.id] = state;
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
    const pick = personById(commanderId);
    const commander = pick && !this.court?.isMinor(pick) ? pick : undefined;
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

  /** 軍団を解散して、いちばん近い自国の都市の守備兵に戻す(財政難のときの再編) */
  disbandArmy(armyId: string): string | null {
    const s = this.stateOf(armyId);
    if (!s || s.status === "fighting") return "解散できません";
    const city = this.cities.filter((c) => scenario.cityOwners[c.id] === s.army.factionId && c.kind !== "pass").sort((a, b) => distanceKm(a, s.army) - distanceKm(b, s.army))[0];
    if (!city) return "戻る都市がありません";
    const st = this.cityState(city);
    this.cityStates[city.id] = { ...st, garrison: st.garrison + totalTroops(s.army) };
    this.armies.splice(this.armies.indexOf(s), 1);
    this.listener.onArmyRemoved(s);
    this.addNews(`${factionName(s.army.factionId)}が${s.army.name}を解散し、兵を${city.name}に戻しました`);
    return null;
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
    const month = (Math.floor((START_OFFSET + d) / 30) % 12) + 1;
    return { year: scenario.year + Math.floor((START_OFFSET + d) / 360), month, season: seasonOf(month) };
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
      spoils: this.spoils.serialize(),
      dynasty: this.serializeDynasty(),
      economy: this.economy.serialize(),
      loyalty: this.loyalty.serialize(),
      diplomacy: this.diplo.serialize(),
      court: this.court.serialize(),
      history: this.history.serialize(),
      trade: this.trade.serialize(),
      logistics: this.logistics,
      strategy: this.strategy.serialize(),
      placement: this.placement.serialize(),
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
    Object.assign(this.relations, initialRelations(), data.relations);
    this.relationSince = { ...data.relationSince };
    this.news.length = 0;
    this.news.push(...(data.news ?? []));
    this.proposals.length = 0;
    this.proposals.push(...(data.proposals ?? []));
    this.nextArmyId = data.nextArmyId ?? 1;
    this.restoreFactions(data);
    this.court.restore(data.court);
    this.spoils.restore(data.spoils);
    this.restoreRoles(data);
    this.economy.restore(data.economy);
    this.loyalty.restore(data.loyalty);
    this.diplo.restore(data.diplomacy);
    this.history.restore(data.history);
    this.trade.restore(data.trade);
    this.logistics.attrition = { ...(data.logistics?.attrition ?? {}) };
    this.logistics.expeditions = { ...(data.logistics?.expeditions ?? {}) };
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
    // 戦略AIの作戦は、軍団を戻したあとで(いない軍団の作戦は捨てる)
    this.strategy.restore(data.strategy);
    this.placement.restore(data.placement);
  }

  /** 都市の、いまの状態(まだ戦いを受けていなければ、最初の状態) */
  cityState(city: City): CityState {
    return this.cityStates[city.id] ?? initialCityState(city);
  }

  /** 城壁と城門の損傷は、日数をかけて少しずつ直る(修復に資金がかかる仕組みは、まだ無い) */
  private repairCities(): void {
    for (const state of Object.values(this.cityStates)) {
      if (state.prosperity !== undefined) state.prosperity = Math.min(100, state.prosperity + 0.05);
      if (state.order !== undefined) state.order = Math.min(70, state.order + 0.1);
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
    const year = scenario.year + Math.floor((START_OFFSET + d) / 360);
    const month = (Math.floor((START_OFFSET + d) / 30) % 12) + 1;
    return `${year}年${month}月${(d % 30) + 1}日`;
  }

  /** 行軍の速さ(km/日)。騎兵だけの軍は速く、疲労や食糧不足で遅くなる */
  marchSpeed(s: ArmyState): number {
    const t = s.army.troops;
    const base = t.infantry + t.archer > 0 ? 30 : 52;
    // 地形と季節:山地は遅く、冬の険しい山はさらに遅い。騎兵の多い軍は、山では遅く、草原・砂漠では速い
    const kind = this.grid.kindAt(s.army.lon, s.army.lat);
    const total = t.infantry + t.cavalry + t.archer || 1;
    const cav = t.cavalry / total;
    const month = this.calendar().month;
    const winter = month >= 11 || month <= 2;
    let k = 1;
    if (kind === "highMountain") k *= winter ? 0.45 : 0.7;
    else if (kind === "mountain") k *= winter ? 0.7 : 0.85;
    if ((kind === "highMountain" || kind === "mountain") && cav > 0.5) k *= 0.8;
    if ((kind === "desert" || kind === "grassland") && cav > 0.5) k *= 1.1;
    if (kind === "desert") k *= 0.85;
    return Math.round(base * k * (1 - s.army.fatigue / 250) * (s.army.food <= 0 ? 0.7 : 1));
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
    return this.hostileTo(a, factionId);
  }

  /** 都市の大きさ(度)。軍団が都市の中に入り込まないために使う */
  private cityReach(city: City): number {
    const size = resolveCityLayout(city).size;
    return Math.max(size[0], size[1]) / 2 / 10 + 0.12;
  }

  private nearFriendlyCity(s: ArmyState): boolean {
    // 自国の都市のほか、同盟国・従属国・宗主国のオアシスでも、水と兵糧を得られる
    return this.cities.some((c) => {
      const o = scenario.cityOwners[c.id];
      if (distanceKm(c, s.army) > SUPPLY_RANGE_KM || !o) return false;
      if (o === s.army.factionId) return true;
      return !!c.oasis && ["alliance", "vassal"].includes(this.relationOf(o, s.army.factionId));
    });
  }

  /** 補給を受けられる範囲(km) */
  get supplyRangeKm(): number {
    return SUPPLY_RANGE_KM;
  }

  /** 軍団のいる場所の地形(砂漠・山地など) */
  /** その地点の地形の種類(戦略AIの見積もり用) */
  terrainKindAt(lon: number, lat: number): string {
    return this.grid.kindAt(lon, lat);
  }

  terrainOf(s: ArmyState): string {
    return this.grid.kindAt(s.army.lon, s.army.lat);
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
      if (owner === undefined || owner === army.factionId) return false;
      const r = this.relationOf(army.factionId, owner);
      return r !== "alliance" && r !== "vassal";
    };
  }

  /** 移動先までの経路を調べる(まだ動かさない)。行けないときは null */
  planRoute(armyId: string, target: RoutePoint, maxSpots = 12): Route | null {
    const s = this.stateOf(armyId);
    if (!s) return null;
    const closed = this.closedFor(s.army);
    for (const spot of this.freeSpots(target, s).slice(0, maxSpots)) {
      const route = findRoute(this.grid, { lon: s.army.lon, lat: s.army.lat }, spot, closed);
      if (route && route.points.length >= 2) {
        route.intent = { lon: target.lon, lat: target.lat };
        return route;
      }
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
    // 都市と関所が近くに並んでいるときは、指定された地点にいちばん近いほうを選ぶ
    const aim = route.intent ?? end;
    const target = this.cities
      .filter((c) => this.hostile(s.army, scenario.cityOwners[c.id]) && Math.hypot(c.lon - end.lon, c.lat - end.lat) < this.cityReach(c) + 0.3)
      .sort((x, y) => Math.hypot(x.lon - aim.lon, x.lat - aim.lat) - Math.hypot(y.lon - aim.lon, y.lat - aim.lat))[0];
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
    if (this.speed === 0 || this.gameOver) return;
    const before = Math.floor(this.day);
    const days = (Math.min(dt, 0.25) / SECONDS_PER_DAY) * this.speed;
    this.day += days;

    for (const s of this.armies) {
      if (s.status === "marching" && s.route) this.advance(s, days);
    }
    for (let d = before; d < Math.floor(this.day); d++) {
      for (const s of this.armies) this.dailyUpkeep(s);
      this.repairCities();
      if ((d + 1) % 30 === 0) {
        this.trade.monthly();
        this.collectIncome();
        this.trimEvents();
        this.loyalty.monthly();
        this.diplo.monthly();
        this.court.monthly();
        this.checkRulers();
        this.history.monthly();
        if (this.playerFactionId !== null && (d + 1) % 360 === 210) this.court.aiYearly();
      }
      this.diplo.daily();
      this.history.daily();
      if (this.playerFactionId !== null) this.strategy.daily(d + 1);
      this.listener.onDayChanged(d + 1);
    }
    this.resolveAutoBattles();
  }

  /**
   * 陥落の処置。プレイヤーの勢力が落としたときは、選んでもらうまで待つ(時間を止める)。
   * AIの勢力が落としたときは、その場で決める。
   */
  private handleCapture(pc: PendingCapture): void {
    const mine = this.playerFactionId === null || pc.captor === this.playerFactionId;
    if (mine) {
      // 前の処置がまだ決まっていなければ、保全で決めてしまう(2つ同時には待たない)
      if (this.spoils.pending) this.resolveCapture("preserve", true);
      this.spoils.pending = pc;
      this.speed = 0;
      this.listener.onCapturePending?.(pc);
      return;
    }
    // AI:大きな都市は保全して名品を接収する。小さな都市は、攻める気の強い難易度ほど略奪しやすい
    const city = this.cities.find((c) => c.id === pc.cityId)!;
    const p = strategyRules.profiles[this.difficulty] ?? strategyRules.profiles.normal;
    const loot = cityLevelOf(city) <= 2 && chance(`${pc.day}|${pc.cityId}|ai`) < p.aggression * 1.5;
    this.spoils.pending = pc;
    const rec = this.resolveCapture(loot ? "loot" : "preserve", true);
    // 捕虜には、一度だけ登用を持ちかける
    for (const id of rec?.captives ?? []) this.custodyAction(id, "recruit");
  }

  /** 陥落の処置を決める(待っている処置に対して) */
  resolveCapture(choice: "loot" | "preserve", confiscate: boolean): CaptureRecord | null {
    const pc = this.spoils.pending;
    if (!pc) return null;
    this.spoils.pending = null;
    const city = this.cities.find((c) => c.id === pc.cityId)!;
    // 同じ入れ物を書き換える(落城の処理の中で、あとから同じ入れ物が都市の状態として置かれるため)
    const state = this.cityStates[city.id] ?? (this.cityStates[city.id] = { ...this.cityState(city) });
    const rec = this.spoils.resolveCapture(pc, choice, confiscate, city, state, this.dateText(),
      (f, gold, grain) => {
        const st = (this.factionStates[f] ??= { gold: 0, grain: 0 });
        st.gold += gold;
        st.grain += grain;
      },
      (id, s) => {
        this.personStates[id] = s;
      });
    this.checkRulers();
    const names = (ids: string[]): string => ids.map((id) => personById(id)?.name ?? id).join("・");
    const items = rec.treasures.map((id) => this.spoils.treasure(id)?.name).filter(Boolean).join("・");
    this.addNews(`${factionName(pc.captor)}が${city.name}を${choice === "loot" ? "略奪" : "保全"}しました(金${rec.gold}・糧${rec.grain}${items ? `、名品:${items}` : ""}${rec.captives.length ? `、捕虜:${names(rec.captives)}` : ""}${rec.protected.length ? `、保護:${names(rec.protected)}` : ""})`);
    return rec;
  }

  /**
   * 捕虜・保護している人物への処置。結果を、画面に出す文で返す。
   * 本人の意思と立場(元の勢力の王族か、元の勢力が残っているか)によって、応じるかどうかが変わる。
   */
  custodyAction(personId: string, action: "keep" | "recruit" | "court" | "release" | "return" | "ransom" | "negotiate"): string {
    const c = this.spoils.custodyOf(personId);
    const p = personById(personId);
    if (!c || !p) return "その人物は、捕虜でも保護中でもありません";
    const day = Math.floor(this.day);
    const holder = c.holder;
    const from = c.from;
    const fromAlive = this.cities.some((x) => scenario.cityOwners[x.id] === from);
    const free = (factionId: string): void => {
      this.spoils.release(personId);
      delete this.personStates[personId];
      this.spoils.setFaction(personId, factionId);
      p.residence = undefined;
    };
    const royal = p.role === "ruler" || /后|妃|公主|皇太|夫人|母|世子|太子/.test(p.title);
    switch (action) {
      case "keep":
        return `${p.name}を、引き続き${c.kind === "captive" ? "捕虜としておきます" : "保護します"}`;
      case "release":
      case "return": {
        if (!fromAlive && action === "return") return `${factionName(from)}は、もう都市を持っていません。解放することはできます`;
        free(fromAlive ? from : holder === from ? from : p.factionId);
        let extra = "";
        // 帰還させると、相手が恩に感じて、戦をやめることがある
        if (action === "return" && this.atWar(holder, from) && chance(`${day}|${personId}|return`) < 0.25 + (royal ? 0.15 : 0)) {
          this.setRelation(holder, from, "peace");
          extra = `。${factionName(from)}は感謝し、和睦に応じました`;
        }
        this.addNews(`${factionName(holder)}が${p.name}を${action === "return" ? `${factionName(from)}へ帰還させました` : "解放しました"}${extra}`);
        return `${p.name}を${action === "return" ? "帰還させました" : "解放しました"}${extra}`;
      }
      case "ransom": {
        if (c.kind !== "captive") return "身代金は、捕虜についてだけ求められます";
        if (!fromAlive) return `${factionName(from)}は、もう都市を持っていません`;
        const price = Math.round((p.leadership + p.war + p.intelligence + p.politics) * (royal ? 8 : 4));
        const purse = this.factionStates[from];
        if (!purse || purse.gold < price) return `${factionName(from)}には、身代金(金${price})を払う余裕がありません`;
        purse.gold -= price;
        (this.factionStates[holder] ??= { gold: 0, grain: 0 }).gold += price;
        free(from);
        this.addNews(`${factionName(from)}が金${price}を払い、${p.name}を引き取りました`);
        return `${factionName(from)}が金${price}を払い、${p.name}を引き取りました`;
      }
      case "negotiate": {
        if (!fromAlive) return `${factionName(from)}は、もう都市を持っていません`;
        if (!this.atWar(holder, from)) {
          free(from);
          return `${p.name}を${factionName(from)}へ送り返しました(戦争中ではないので、関係は変わりません)`;
        }
        const weight = (p.politics + p.charisma) / 400 + (royal ? 0.25 : 0);
        if (chance(`${day}|${personId}|nego`) < 0.25 + weight) {
          free(from);
          this.setRelation(holder, from, "peace");
          this.addNews(`${p.name}の返還を条件に、${factionName(holder)}と${factionName(from)}が和睦しました`);
          return `${p.name}を返すことを条件に、${factionName(from)}と和睦しました`;
        }
        c.lastTry = day;
        return `${factionName(from)}は、${p.name}の返還を条件とした和睦に応じませんでした`;
      }
      case "recruit":
      case "court": {
        // 同じ人に持ちかけられるのは、30日に1度まで(毎日持ちかけて、いつか応じさせることはできない)
        if (c.lastTry !== undefined && day - c.lastTry < 30) return `${p.name}には最近持ちかけたばかりです(あと${30 - (day - c.lastTry)}日たってから)`;
        c.lastTry = day;
        if (p.role === "ruler") return `${p.name}は${factionName(from)}の君主です。仕えることはありません`;
        const pr = this.recruitChance(personId, holder, action);
        if (chance(`${day}|${personId}|${action}`) < pr) {
          free(holder);
          this.loyalty.rebase(personId, action === "court" ? "宮廷に迎えられる" : "登用");
          if (action === "court") p.title = `${factionName(holder)}の宮廷に仕える`;
          this.addNews(`${p.name}が${factionName(holder)}に${action === "court" ? "迎えられました" : "仕えることになりました"}`);
          return `${p.name}は応じました(見込み${Math.round(pr * 100)}%)`;
        }
        return `${p.name}は応じませんでした(見込み${Math.round(pr * 100)}%。日をあらためると、また持ちかけられます)`;
      }
    }
  }


  // ===================== 君主の捕縛・国の滅亡・独立 =====================

  /** 後継国家として加わった勢力と、君主の役の付け替え(セーブに残す) */
  private dynasty: DynastySave = { added: [], fallen: {}, roles: {}, rulers: {} };
  private readonly initialRoles = new Map(persons.map((p) => [p.id, p.role]));
  private readonly initialRulers = new Map(scenario.factions.map((f) => [f.id, f.ruler]));
  /** プレイヤーの国が滅び、続ける国が無いとき true(時間は進まない) */
  gameOver = false;

  rulerOf(factionId: string): Person | undefined {
    return persons.find((p) => p.factionId === factionId && p.role === "ruler");
  }

  isFallen(factionId: string): boolean {
    return !!this.dynasty.fallen[factionId];
  }

  /**
   * 君主の状態を調べる。捕らえられていれば国は滅び、条件を満たす武将が独立する。
   * 戦死していれば、国はそのままで、後継の人物が君主になる。
   */
  checkRulers(): void {
    for (const f of [...scenario.factions]) {
      if (f.passive || this.dynasty.fallen[f.id]) continue;
      const ruler = this.rulerOf(f.id);
      if (!ruler) continue;
      const st = this.personStatus(ruler.id);
      if (st === "captured" || st === "protected") {
        const holder = this.spoils.custodyOf(ruler.id)?.holder ?? null;
        this.fallFaction(f.id, ruler, holder);
      } else if (st === "dead") {
        this.succeedRuler(f.id, ruler);
      }
    }
  }

  /** 候補の順位:1.史実の独立者・後継者(表の順) 2.同じ姓の一族 3.統率・魅力・武力の高い人 */
  private successionCandidates(factionId: string, old: Person): { p: Person; rule?: SuccessionRule }[] {
    const rules = (successionRules.rules as Record<string, SuccessionRule[]>)[factionId] ?? [];
    const alive = persons.filter((p) => p.factionId === factionId && p.id !== old.id && this.personStatus(p.id) === "active" && !this.spoils.custodyOf(p.id) && p.role !== "minister" && p.gender !== "female");
    const surname = old.name.slice(0, old.name.startsWith("司馬") || old.name.startsWith("慕容") || old.name.startsWith("拓跋") || old.name.startsWith("宇文") ? 2 : 1);
    const rank = (p: Person): number => {
      const i = rules.findIndex((r) => r.person === p.id);
      if (i >= 0) return i;
      if (p.name.startsWith(surname)) return 100;
      return 200;
    };
    return alive
      .map((p) => ({ p, rule: rules.find((r) => r.person === p.id) }))
      .sort((a, b) => rank(a.p) - rank(b.p) || this.standing(b.p) - this.standing(a.p));
  }

  /** 人物の拠点(太守をしている都市か、率いている軍団のいる場所)と、手元の兵 */
  private powerBase(p: Person, factionId: string): { lon: number; lat: number; troops: number; city: City | null } | null {
    const city = this.cities.find((c) => c.kind !== "pass" && scenario.cityOwners[c.id] === factionId && governorIdOf(c, this.cityStates[c.id]) === p.id && cityLevelOf(c) >= 2) ?? null;
    const army = this.armies.find((s) => s.army.factionId === factionId && s.army.commanderId === p.id);
    if (!city && !army) return null;
    const at = city ?? army!.army;
    // 軍団だけのときは、近く(80km)の自国の都市を拠点にする
    const base = city ?? this.cities.filter((c) => c.kind !== "pass" && scenario.cityOwners[c.id] === factionId && cityLevelOf(c) >= 2 && distanceKm(c, army!.army) < 80)
      .sort((a, b) => distanceKm(a, army!.army) - distanceKm(b, army!.army))[0] ?? null;
    if (!base) return null;
    const troops = (army ? totalTroops(army.army) : 0) + this.cityState(base).garrison;
    return { lon: at.lon, lat: at.lat, troops, city: base };
  }

  /** 独立・後継で人物を比べるときの値:統率・魅力・武力と名声 */
  private standing(p: Person): number {
    return p.leadership + p.charisma + p.war / 2 + (this.loyalty?.fame[p.id] ?? 50);
  }

  /**
   * 捕虜・保護している人を登用できる見込み。
   * 元の勢力への忠誠・元の君主の生死・元の国が残っているか・持ちかける君主との相性・民族と一族・名声・とどめた日数で決まる。
   * 忠臣や王族は、簡単には応じない。
   */
  recruitChance(personId: string, holder: string, action: "recruit" | "court" = "recruit"): number {
    const p = personById(personId);
    const c = this.spoils.custodyOf(personId);
    if (!p || !c) return 0;
    const day = Math.floor(this.day);
    const from = c.from;
    const fromAlive = !this.isFallen(from) && this.cities.some((x) => scenario.cityOwners[x.id] === from);
    const oldRuler = this.rulerOf(from);
    const oldRulerFree = !!oldRuler && this.personStatus(oldRuler.id) === "active" && !this.spoils.custodyOf(oldRuler.id);
    const ruler = this.rulerOf(holder);
    const loyal = this.loyalty.loyalty[personId] ?? 60;
    const royal = p.role === "ruler" || /后|妃|公主|皇太|夫人|母|世子|太子/.test(p.title) || (!!oldRuler && isKin(p, oldRuler));
    let pr = (action === "court" ? 0.5 : 0.45) - ((loyal - 50) / 100) * 0.8;
    if (ruler) pr += (affinity(p, ruler).value - 50) / 150 + ((this.loyalty.fame[ruler.id] ?? 50) - 50) / 250;
    if (ruler?.people && ruler.people === p.people) pr += 0.05;
    pr -= ((this.loyalty.fame[personId] ?? 50) - 50) / 400;
    pr += Math.min(0.15, (day - c.day) / 600);
    if (fromAlive) pr -= 0.1;
    else pr += 0.12;
    if (!oldRulerFree) pr += 0.08;
    if (royal) pr -= 0.3;
    if (this.atWar(holder, from)) pr -= 0.05;
    pr += this.economy.talentBonus(holder);
    // 忠臣(忠誠85以上)は、さらに応じにくい
    if (loyal >= 85) pr *= 0.5;
    return Math.max(0.02, Math.min(0.85, pr));
  }

  /**
   * 寝返り:人物が、別の勢力へ移る。太守なら都市ごと(君主がいる都市は除く)、指揮官なら軍団ごと。
   */
  defect(personId: string, toFaction: string, why: string): boolean {
    const p = personById(personId);
    if (!p || p.role === "ruler" || p.factionId === toFaction) return false;
    const from = p.factionId;
    const ruler = this.rulerOf(from);
    const city = this.cities.find((x) => scenario.cityOwners[x.id] === from && governorIdOf(x, this.cityStates[x.id]) === personId);
    const rulerThere = city && ruler && (ruler.residence === city.id || governorIdOf(city, this.cityStates[city.id]) === ruler.id);
    const army = this.armies.find((s) => s.army.factionId === from && s.army.commanderId === personId);
    this.spoils.setFaction(personId, toFaction);
    this.loyalty.rebase(personId, `${factionName(from)}から寝返る`, 60);
    this.loyalty.addFame(personId, -8);
    if (city && !rulerThere) {
      scenario.cityOwners[city.id] = toFaction;
      this.listener.onCityCaptured(city.id, toFaction);
    } else if (city) {
      this.cityStates[city.id] = { ...this.cityState(city), governorId: null };
    }
    if (army) {
      this.listener.onArmyRemoved(army);
      army.army.factionId = toFaction;
      this.listener.onArmyAdded(army);
    }
    this.addNews(`${factionName(from)}の${p.name}が、${why}${factionName(toFaction)}へ寝返りました${city && !rulerThere ? `(${city.name}ごと)` : ""}${army ? `(${army.army.name}を率いて)` : ""}`);
    for (const x of persons.filter((y) => y.factionId === from && y.role !== "ruler")) this.loyalty.add(x.id, -1, `${p.name}の寝返り`);
    return true;
  }

  /**
   * 反乱・独立:忠誠の低い人物が、拠点(規模2以上の都市)と兵4,000以上を持っていれば、自立して国を建てる。
   * 史実で独立した人物なら、史実の国号と称号を使う(succession.json)。条件が足りなければ、何もしない。
   */
  secede(personId: string, why = "反乱を起こし"): boolean {
    const p = personById(personId);
    if (!p || p.role === "ruler") return false;
    const from = p.factionId;
    const base = this.powerBase(p, from);
    if (!base || !base.city || base.troops < 4000) return false;
    const ruler = this.rulerOf(from);
    if (ruler && (ruler.residence === base.city.id || governorIdOf(base.city, this.cityStates[base.city.id]) === ruler.id)) return false;
    const old = scenario.factions.find((f) => f.id === from)!;
    const rule = ((successionRules.rules as Record<string, SuccessionRule[]>)[from] ?? []).find((r) => r.person === personId);
    const id = `${from}_n${this.dynasty.added.length + 1}`;
    const title = rule?.title ?? "皇帝";
    const nf: Faction = {
      id, name: rule?.state ?? `${old.name.replace(/\(.*\)$/, "")}(${p.name})`, people: old.people, ruler: p.name,
      color: ["#c46a3a", "#4a8a8c", "#8c5ab4", "#b4a03c", "#5a7a3c", "#a04a6a", "#3c6aa0"][this.dynasty.added.length % 7], title, founded: { from, day: Math.floor(this.day) },
    };
    this.dynasty.added.push(nf);
    scenario.factions.push(nf);
    for (const g of scenario.factions) {
      if (g.id === id || g.id === from) continue;
      const r = this.relations[[from, g.id].sort().join("|")];
      if (r) this.relations[[id, g.id].sort().join("|")] = r;
    }
    this.setRelation(id, from, "war");
    this.spoils.setFaction(personId, id);
    this.setRole(personId, "ruler");
    scenario.cityOwners[base.city.id] = id;
    this.listener.onCityCaptured(base.city.id, id);
    const army = this.armies.find((s) => s.army.factionId === from && s.army.commanderId === personId);
    if (army) {
      this.listener.onArmyRemoved(army);
      army.army.factionId = id;
      this.listener.onArmyAdded(army);
    }
    const purse = this.factionStates[from] ?? { gold: 0, grain: 0 };
    const share = { gold: Math.round(purse.gold * 0.15), grain: Math.round(purse.grain * 0.15) };
    purse.gold -= share.gold;
    purse.grain -= share.grain;
    this.factionStates[id] = share;
    this.loyalty.addFame(personId, 12);
    this.loyalty.reevaluate(from, `${p.name}の反乱`);
    this.loyalty.noteRulerChange(from);
    this.addNews(`${old.name}の${p.name}が${base.city.name}で${why}、「${nf.name}」を建てて${title}を称しました`);
    this.history?.log("state", `${p.name}が${base.city.name}で${why}「${nf.name}」を建てた`);
    return true;
  }

  /** 戦死した君主の後を継ぐ(国はそのまま) */
  private succeedRuler(factionId: string, old: Person): void {
    // 皇位継承:史実の後継者(指名済みの皇太子)→ 正室の子 → 側室の子 → 兄弟 → 一族 → 有力な武将。
    // 一族が誰もいなければ、これまでどおり史実の後継の表と武将の順位から選ぶ
    const viaCourt = this.court.succeed(factionId, old);
    const next = viaCourt ? { p: viaCourt } : this.successionCandidates(factionId, old)[0];
    const f = scenario.factions.find((x) => x.id === factionId)!;
    if (!next) {
      this.fallFaction(factionId, old, null);
      return;
    }
    this.setRole(old.id, "general");
    this.setRole(next.p.id, "ruler");
    f.ruler = next.p.name;
    this.dynasty.rulers[factionId] = next.p.name;
    this.addNews(`${f.name}の君主${old.name}が亡くなり、${next.p.name}が後を継ぎました${this.court.isMinor(next.p) ? `(${this.court.age(next.p)}歳の幼君)` : ""}`);
    this.loyalty.addFame(next.p.id, 5);
    this.loyalty.reevaluate(factionId, `君主${old.name}の死と、${next.p.name}の継承`);
    this.loyalty.noteRulerChange(factionId);
    this.court.resolveClaim();
    this.history?.log("ruler", `${f.name}:${old.name}の死去により${next.p.name}が即位`);
  }

  /** 寿命による死(病死)。役目を解き、君主なら、次の月の調べで継承が起こる */
  dieNaturally(personId: string, cause = "illness"): void {
    const p = personById(personId);
    if (!p || this.personStatus(personId) === "dead") return;
    this.personStates[personId] = "dead";
    for (const s of this.armies) {
      if (s.army.commanderId === personId) s.army.commanderId = "";
      if (s.army.deputyId === personId) delete s.army.deputyId;
    }
    for (const c of this.cities) if (governorIdOf(c, this.cityStates[c.id]) === personId) this.cityStates[c.id] = { ...this.cityState(c), governorId: null };
    const i = this.spoils.custody.findIndex((x) => x.personId === personId);
    if (i >= 0) this.spoils.custody.splice(i, 1);
    const label = { illness: "病死", old_age: "老衰", battle: "戦死", execution: "処刑", assassination: "暗殺", suicide: "自害", unknown: "不明" }[cause] ?? cause;
    if (p.role === "ruler" || (this.loyalty.fame[personId] ?? 0) >= 60) this.addNews(`${factionName(p.factionId)}の${p.name}が亡くなりました(${label}${p.fictional ? "" : p.died ? `。史実では${p.died}年に没` : ""})`);
  }

  /** 都市の持ち主を変える(歴史の事件などで使う。太守は外す) */
  transferCity(cityId: string, to: string): void {
    const city = this.cities.find((c) => c.id === cityId);
    if (!city) return;
    scenario.cityOwners[cityId] = to;
    const g = personById(governorIdOf(city, this.cityStates[cityId]) ?? undefined);
    if (g && g.factionId !== to) this.cityStates[cityId] = { ...this.cityState(city), governorId: null };
    this.listener.onCityCaptured(cityId, to);
  }

  /** 指定の都市で国を建てる(史実の建国。都市はその人物の国のものであること)。新しい国のIDを返す */
  foundState(personId: string, cityId: string, state: string, title: string): string | undefined {
    const p = personById(personId);
    const city = this.cities.find((c) => c.id === cityId);
    // 都市は、その人物の国のものか、プレイヤーではないほかの国のもの(史実の蜂起の地。例:劉淵の離石)
    const prevOwner = scenario.cityOwners[cityId];
    if (!p || !city || p.role === "ruler" || !prevOwner || (prevOwner !== p.factionId && prevOwner === this.playerFactionId)) return undefined;
    const from = p.factionId;
    const old = scenario.factions.find((f) => f.id === from)!;
    const id = `${from}_n${this.dynasty.added.length + 1}`;
    const nf: Faction = {
      id, name: state, people: p.people ?? old.people, ruler: p.name,
      color: ["#c46a3a", "#4a8a8c", "#8c5ab4", "#b4a03c", "#5a7a3c", "#a04a6a", "#3c6aa0"][this.dynasty.added.length % 7], title, founded: { from, day: Math.floor(this.day) },
    };
    this.dynasty.added.push(nf);
    scenario.factions.push(nf);
    for (const g of scenario.factions) {
      if (g.id === id || g.id === from) continue;
      const r = this.relations[[from, g.id].sort().join("|")];
      if (r) this.relations[[id, g.id].sort().join("|")] = r;
    }
    this.setRelation(id, from, "war");
    if (prevOwner !== from) this.setRelation(id, prevOwner, "war");
    this.spoils.setFaction(personId, id);
    this.setRole(personId, "ruler");
    this.transferCity(cityId, id);
    const st = this.cityState(city);
    this.cityStates[cityId] = { ...st, garrison: Math.max(st.garrison, 6000), governorId: personId };
    const army = this.armies.find((s) => s.army.factionId === from && s.army.commanderId === personId);
    if (army) {
      this.listener.onArmyRemoved(army);
      army.army.factionId = id;
      this.listener.onArmyAdded(army);
    }
    const purse = this.factionStates[from] ?? { gold: 0, grain: 0 };
    const share = { gold: Math.round(purse.gold * 0.1), grain: Math.round(purse.grain * 0.1) };
    purse.gold -= share.gold;
    purse.grain -= share.grain;
    this.factionStates[id] = share;
    this.court.ranks[id] = /皇帝|天王/.test(title) ? "emperor" : /王/.test(title) ? "king" : /公/.test(title) ? "duke" : "lord";
    this.court.stability[id] = 55;
    this.loyalty.addFame(personId, 12);
    this.loyalty.reevaluate(from, `${p.name}の自立`);
    this.history?.log("state", `${p.name}が${city.name}で「${state}」を建て、${title}を称した`);
    this.addNews(`${old.name}の${p.name}が${city.name}で「${state}」を建て、${title}を称しました`);
    return id;
  }

  /** 決めた2つの軍団で会戦を始める(歴史の事件の会戦) */
  startEventAt(att: ArmyState, def: ArmyState, histId: string, tactics?: BattleEvent["tactics"]): BattleEvent | null {
    const n = this.events.length;
    this.pendingTactics = tactics;
    this.startEvent(att, "field_battle", def, null);
    this.pendingTactics = undefined;
    const ev = this.events.length > n ? this.events[this.events.length - 1] : null;
    if (ev) ev.histId = histId;
    this.resolveAutoBattles();
    return ev;
  }

  private pendingTactics: BattleEvent["tactics"] | undefined;

  /** 歴史の攻城戦を始める */
  startSiegeAt(att: ArmyState, city: City, histId: string): BattleEvent | null {
    const n = this.events.length;
    this.startEvent(att, "siege_battle", null, city);
    const ev = this.events.length > n ? this.events[this.events.length - 1] : null;
    if (ev) ev.histId = histId;
    this.resolveAutoBattles();
    return ev;
  }

  /** 地名(近くの都市からの方角と距離) */
  placeNameAt(lon: number, lat: number): string {
    return placeName(this.cities, lon, lat);
  }

  /** 廃立:君主 old を退け(生きたまま臣下に)、ほかの人物 next を君主にする */
  replaceRuler(factionId: string, old: Person, next: Person): void {
    const f = scenario.factions.find((x) => x.id === factionId)!;
    this.setRole(old.id, "general");
    this.setRole(next.id, "ruler");
    f.ruler = next.name;
    this.dynasty.rulers[factionId] = next.name;
    delete this.court.heirs[factionId];
    delete this.court.regents[factionId];
    this.loyalty.reevaluate(factionId, `${old.name}の廃位と${next.name}の即位`);
    this.loyalty.noteRulerChange(factionId);
  }

  /** 簒奪:usurper が君主 old を廃して位につく(前の君主は殺される。史実の簒奪の多くと同じ) */
  usurp(factionId: string, old: Person, usurper: Person): void {
    const f = scenario.factions.find((x) => x.id === factionId)!;
    this.setRole(old.id, "general");
    this.personStates[old.id] = "dead";
    for (const s of this.armies) if (s.army.commanderId === old.id) s.army.commanderId = "";
    this.setRole(usurper.id, "ruler");
    f.ruler = usurper.name;
    this.dynasty.rulers[factionId] = usurper.name;
    delete this.court.heirs[factionId];
    this.loyalty.addFame(usurper.id, 5);
    this.loyalty.reevaluate(factionId, `${usurper.name}の簒奪`);
    this.history?.log("ruler", `${f.name}:${usurper.name}が${old.name}を廃して位を奪う(簒奪)`);
    this.loyalty.noteRulerChange(factionId);
  }

  private setRole(personId: string, role: PersonRole): void {
    const p = persons.find((x) => x.id === personId);
    if (!p) return;
    p.role = role;
    this.dynasty.roles[personId] = role;
  }

  /**
   * 国の滅亡。独立できる武将がいれば、その数だけ後継国家ができる(最大3つ)。
   * 都市は近い後継国家へ、残りは君主を捕らえた勢力へ。軍団・人物・金・兵糧・名品も分ける。
   * 同じ人物が2つの国に属することはない(人物は1つの勢力にだけ移す)。
   */
  fallFaction(factionId: string, old: Person, captor: string | null): void {
    const f = scenario.factions.find((x) => x.id === factionId);
    if (!f || this.dynasty.fallen[factionId]) return;
    const day = Math.floor(this.day);
    const purse = this.factionStates[factionId] ?? { gold: 0, grain: 0 };
    // 独立の条件:拠点(規模2以上の都市)と、兵5,000以上。国を保つ蓄えがあること
    const successors: { p: Person; rule?: SuccessionRule; base: NonNullable<ReturnType<Campaign["powerBase"]>> }[] = [];
    if (purse.gold + purse.grain >= 200) {
      for (const c of this.successionCandidates(factionId, old)) {
        if (successors.length >= 3) break;
        const base = this.powerBase(c.p, factionId);
        if (!base || base.troops < 5000) continue;
        if (successors.some((s) => s.base.city?.id === base.city?.id)) continue;
        successors.push({ ...c, base });
      }
    }
    // 都市を分ける:近い後継国家(600km以内)へ。どこにも近くなければ、捕らえた勢力へ
    const myCities = this.cities.filter((c) => scenario.cityOwners[c.id] === factionId);
    const newIds: string[] = [];
    const palette = ["#c46a3a", "#4a8a8c", "#8c5ab4", "#b4a03c", "#5a7a3c", "#a04a6a", "#3c6aa0"];
    for (const [i, s] of successors.entries()) {
      const id = `${factionId}_n${this.dynasty.added.length + 1}`;
      const title = s.rule?.title ?? "皇帝";
      const nf: Faction = {
        id, name: s.rule?.state ?? `${f.name.replace(/\(.*\)$/, "")}(${s.p.name})`, people: f.people, ruler: s.p.name,
        color: palette[(this.dynasty.added.length + i) % palette.length], title, founded: { from: factionId, day },
      };
      this.dynasty.added.push(nf);
      scenario.factions.push(nf);
      newIds.push(id);
      // 外交:もとの国の関係を受け継ぐ。捕らえた勢力とは戦争、兄弟の国どうしは和平
      for (const g of scenario.factions) {
        if (g.id === id || g.id === factionId) continue;
        const r = this.relations[[factionId, g.id].sort().join("|")];
        if (r) this.relations[[id, g.id].sort().join("|")] = r;
      }
      if (captor) this.setRelation(id, captor, "war");
    }
    for (const a of newIds) for (const b of newIds) if (a < b) this.setRelation(a, b, "neutral");
    const fallback = captor ?? newIds[0] ?? null;
    const claim = (lon: number, lat: number): string | null => {
      let best: string | null = null;
      let bd = 600;
      successors.forEach((s, i) => {
        const d = distanceKm({ lon, lat }, s.base);
        if (d < bd) {
          bd = d;
          best = newIds[i];
        }
      });
      return best ?? fallback;
    };
    const shares: Record<string, number> = {};
    for (const c of myCities) {
      const to = claim(c.lon, c.lat);
      if (!to) continue;
      shares[to] = (shares[to] ?? 0) + 1;
      // 太守は、移る先の勢力の人でなければ外す(あとで人物の行き先を決める)
      scenario.cityOwners[c.id] = to;
      this.listener.onCityCaptured(c.id, to);
    }
    // 人物の行き先:独立した人はその国の君主。ほかの人は、いる場所に近い国へ。行き先が無ければ、捕らえた勢力の捕虜・保護
    successors.forEach((s, i) => {
      this.spoils.setFaction(s.p.id, newIds[i]);
      this.setRole(s.p.id, "ruler");
      this.loyalty.addFame(s.p.id, 15 + ((s.rule?.title ?? "皇帝") === "皇帝" ? 5 : 0));
    });
    for (const p of persons.filter((x) => x.factionId === factionId && x.id !== old.id)) {
      if (this.personStatus(p.id) === "dead" || this.spoils.custodyOf(p.id)) continue;
      const where = this.whereIs(p, factionId);
      const to = where ? claim(where.lon, where.lat) : newIds[0] ?? null;
      if (to && newIds.includes(to)) {
        this.spoils.setFaction(p.id, to);
        this.loyalty.rebase(p.id, "後継国家に仕える", Math.min(70, this.loyalty.target(p).value));
      } else if (captor) {
        this.spoils.custody.push({ personId: p.id, kind: p.role === "general" && p.gender !== "female" ? "captive" : "protected", holder: captor, from: factionId, cityId: p.residence ?? null, day });
        this.personStates[p.id] = p.role === "general" && p.gender !== "female" ? "captured" : "protected";
      }
    }
    // 太守:新しい持ち主の人でなければ外す
    for (const c of myCities) {
      const gid = governorIdOf(c, this.cityStates[c.id]);
      const g = gid ? persons.find((x) => x.id === gid) : undefined;
      if (g && g.factionId !== scenario.cityOwners[c.id]) this.cityStates[c.id] = { ...this.cityState(c), governorId: null };
    }
    // 軍団:指揮官の国へ。指揮官が移らなければ近い国へ。どこにも行けなければ解散
    for (const s of [...this.armies.filter((x) => x.army.factionId === factionId)]) {
      const cmd = persons.find((x) => x.id === s.army.commanderId);
      const to = cmd && cmd.factionId !== factionId && newIds.includes(cmd.factionId) ? cmd.factionId : claim(s.army.lon, s.army.lat);
      this.listener.onArmyRemoved(s);
      if (to && newIds.includes(to)) {
        s.army.factionId = to;
        if (cmd && cmd.factionId !== to) s.army.commanderId = "";
        this.listener.onArmyAdded(s);
      } else {
        this.armies.splice(this.armies.indexOf(s), 1);
      }
    }
    // 金・兵糧:受け継いだ都市の人口に応じて分ける。ただし、その国の収入の1年半分まで(残りは戦乱で散逸する)。
    // 小さな後継国家が、もとの国の蓄えを丸ごと抱え込まないように。名品と捕虜は、いちばん大きい後継国家(無ければ捕らえた勢力)へ
    const popOf: Record<string, number> = {};
    for (const c of myCities) {
      const to = scenario.cityOwners[c.id];
      if (shares[to]) popOf[to] = (popOf[to] ?? 0) + Math.max(1, cityEcon(c, this.cityState(c)).pop);
    }
    const total = Object.values(popOf).reduce((a, b) => a + b, 0) || 1;
    let scattered = 0;
    for (const [to, n] of Object.entries(popOf)) {
      const st = (this.factionStates[to] ??= { gold: 0, grain: 0 });
      const inc = this.economy.report(to).income;
      const g = Math.round(purse.gold * n / total);
      const gr = Math.round(purse.grain * n / total);
      const capG = Math.max(1500, inc.total * 18);
      const capR = Math.max(1500, inc.grain * 18);
      st.gold += Math.min(g, capG);
      st.grain += Math.min(gr, capR);
      scattered += Math.max(0, g - capG);
    }
    if (scattered > 0) this.dynasty.scattered = (this.dynasty.scattered ?? 0) + scattered;
    this.factionStates[factionId] = { gold: 0, grain: 0 };
    const heir = newIds[0] ?? captor;
    if (heir) {
      for (const [id, s] of Object.entries(this.spoils.state)) if (!s.cityId && s.owner === factionId) Object.assign(this.spoils.state[id], { owner: heir, holderId: null });
      for (const c of this.spoils.custody) if (c.holder === factionId) c.holder = heir;
    }
    this.dynasty.fallen[factionId] = { day, by: captor };
    f.fallen = { day, by: captor };
    // 捕らえられた君主は、君主の身分のまま(登用には応じない)
    const names = successors.map((s, i) => `${s.p.name}が「${scenario.factions.find((x) => x.id === newIds[i])!.name}」を建て、${scenario.factions.find((x) => x.id === newIds[i])!.title}を称しました`);
    this.addNews(`${f.name}の君主${old.name}が${captor ? `${factionName(captor)}に` : ""}捕らえられ、${f.name}は滅びました。${names.length ? names.join("。") : "独立する者はいませんでした"}`);
    this.listener.onFactionFallen?.({ factionId, successors: newIds, captor });
    this.history?.log("fall", `${f.name}が滅亡${captor ? `(${factionName(captor)}が君主${old.name}を捕らえる)` : ""}${newIds.length ? `。後継:${newIds.map((i) => factionName(i)).join("・")}` : ""}`);
  }

  /** 人物のいる場所(太守の都市・率いる軍団・滞在する都市) */
  private whereIs(p: Person, factionId: string): { lon: number; lat: number } | null {
    const army = this.armies.find((s) => s.army.factionId === factionId && s.army.commanderId === p.id);
    if (army) return army.army;
    const c = this.cities.find((x) => governorIdOf(x, this.cityStates[x.id]) === p.id) ?? this.cities.find((x) => x.id === p.residence);
    return c ?? null;
  }

  /** セーブに残す、勢力の変化 */
  private serializeDynasty(): DynastySave {
    return JSON.parse(JSON.stringify({ ...this.dynasty, gameOver: this.gameOver })) as DynastySave;
  }

  /**
   * 勢力の一覧を、セーブの時点に戻す(後継国家を加え直す)。都市の所属を戻す前に呼ぶ。
   * 人物の所属は spoils が戻すので、ここでは君主の役と、勢力の情報だけを戻す。
   */
  restoreFactions(save: CampaignSave | undefined): void {
    const d = save?.dynasty;
    // いま加わっている後継国家を外してから、セーブにあるものを加え直す
    for (let i = scenario.factions.length - 1; i >= 0; i--) if (scenario.factions[i].founded) scenario.factions.splice(i, 1);
    for (const f of scenario.factions) {
      f.ruler = this.initialRulers.get(f.id) ?? f.ruler;
      delete f.fallen;
    }
    this.dynasty = { added: [], fallen: {}, roles: {}, rulers: {} };
    if (!d) return;
    for (const f of d.added) scenario.factions.push({ ...f });
    for (const [id, x] of Object.entries(d.fallen)) {
      const f = scenario.factions.find((y) => y.id === id);
      if (f) f.fallen = x;
    }
    for (const [id, name] of Object.entries(d.rulers)) {
      const f = scenario.factions.find((y) => y.id === id);
      if (f) f.ruler = name;
    }
    this.dynasty = { added: d.added.map((f) => ({ ...f })), fallen: { ...d.fallen }, roles: { ...d.roles }, rulers: { ...d.rulers } };
  }

  /** 君主の役を戻す(spoils が人物の所属を戻したあとに呼ぶ) */
  private restoreRoles(save: CampaignSave | undefined): void {
    for (const p of persons) p.role = this.initialRoles.get(p.id) ?? p.role;
    for (const [id, role] of Object.entries(save?.dynasty?.roles ?? {})) {
      const p = persons.find((x) => x.id === id);
      if (p) p.role = role;
    }
    this.gameOver = !!save?.dynasty?.gameOver;
  }

  /** 古い戦闘の記録を捨てる(長く遊ぶと、記録が増え続けてセーブが大きくなるため)。新しい60件と、決着していないものは残す */
  private trimEvents(): void {
    const closed = this.events.filter((e) => e.status === "completed" || e.status === "cancelled");
    if (closed.length <= 60) return;
    const drop = new Set(closed.slice(0, closed.length - 60));
    for (let i = this.events.length - 1; i >= 0; i--) if (drop.has(this.events[i])) this.events.splice(i, 1);
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
      if (d < CONTACT_RANGE && (this.hostileTo(s.army, o.army.factionId) || this.hostileTo(o.army, s.army.factionId))) {
        this.startEvent(s, "field_battle", o, null);
        return true;
      }
    }
    for (const c of this.cities) {
      if (c.id !== s.targetCityId) continue;
      const owner = scenario.cityOwners[c.id];
      if (!this.hostileTo(s.army, owner)) continue;
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
    // 進軍中の歴史の会戦なら、事件の印と作戦を付ける
    const tag = this.history?.tagFor(attacker.army.id, defender?.army.id, city?.id);
    if (tag) {
      event.histId = tag.histId;
      if (tag.tactics) event.tactics = tag.tactics;
    }
    if (this.pendingTactics) event.tactics = this.pendingTactics;
    this.addSupporters(event, attacker, defender);
    this.events.push(event);
    this.strategy.onBattleStart(event);
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
   * 共同作戦:戦いの場の近く(約0.8度)にいて、手の空いている同盟国・援軍の軍団が加勢する。
   * 連携の度合いは、指揮官どうしの相性・加勢する指揮官の統率と名声で決まる(0.5〜1)。離れた軍団は加わらない。
   */
  private addSupporters(event: BattleEvent, attacker: ArmyState, defender: ArmyState | null): void {
    const sides: ["attacker" | "defender", ArmyState | null, string, string][] = [
      ["attacker", attacker, event.attackerFactionId, event.defenderFactionId],
      ["defender", defender, event.defenderFactionId, event.attackerFactionId],
    ];
    const used = new Set([attacker.army.id, defender?.army.id]);
    for (const [side, main, mine, foe] of sides) {
      if (!main) continue; // 都市の守りには、加勢を入れない(守備兵の計算を分けないため)
      const lead = persons.find((p) => p.id === main.army.commanderId);
      for (const o of this.armies) {
        if (used.has(o.army.id) || o.status === "fighting" || totalTroops(o.army) <= 0) continue;
        if (o.army.factionId === mine) continue; // 同じ国の軍団は、これまでどおり別々に戦う
        if (Math.hypot(o.army.lon - event.location.lon, o.army.lat - event.location.lat) > 0.8) continue;
        const aid = this.diplo.aidOf(o.army.id);
        const friend = (aid && !aid.returning && aid.forFaction === mine) || ["alliance", "vassal"].includes(this.relationOf(o.army.factionId, mine));
        if (!friend || !this.hostileTo(o.army, foe)) continue;
        const c = persons.find((p) => p.id === o.army.commanderId);
        const aff = c && lead ? affinity(c, lead).value : 50;
        const efficiency = Math.max(0.5, Math.min(1, 0.45 + aff / 250 + (c ? c.leadership / 400 + (this.loyalty.fame[c.id] ?? 0) / 1000 : 0)));
        (event.supporters ??= []).push({ side, armyId: o.army.id, efficiency: Math.round(efficiency * 100) / 100 });
        used.add(o.army.id);
        o.route = null;
        this.setStatus(o, "fighting");
      }
    }
    if (event.supporters?.length) {
      const names = event.supporters.map((x) => this.stateOf(x.armyId)?.army.name).filter(Boolean).join("・");
      this.addNews(`${event.location.name}の戦いに、${names}が加勢しました(共同作戦)`);
    }
  }

  /** 共同作戦の結果:陣営の損害を、兵の割合で加勢した軍団にも分ける。本隊の結果からは、その分を引く */
  private splitSupporters(event: BattleEvent, result: BattleResult): void {
    for (const sup of event.supporters ?? []) {
      const s = this.stateOf(sup.armyId);
      const r = result.sides[sup.side];
      if (!s || !r) continue;
      const after = { ...s.army.troops };
      for (const k of ["infantry", "cavalry", "archer"] as const) {
        const rate = r.before[k] > 0 ? r.after[k] / r.before[k] : 1;
        after[k] = Math.max(0, Math.min(s.army.troops[k], Math.round(s.army.troops[k] * rate)));
        r.before[k] = Math.max(0, r.before[k] - s.army.troops[k]);
        r.after[k] = Math.max(0, r.after[k] - after[k]);
      }
      s.army.troops = after;
      s.army.morale = r.morale;
      s.army.fatigue = r.fatigue;
      s.route = null;
      if (totalTroops(s.army) <= 0) {
        this.armies.splice(this.armies.indexOf(s), 1);
        this.listener.onArmyRemoved(s);
        continue;
      }
      this.setStatus(s, "camping");
      const ally = factionName(s.army.factionId);
      const helped = sup.side === "attacker" ? event.attackerFactionId : event.defenderFactionId;
      const won = result.winner === sup.side;
      if (won) this.diplo.addAmity(s.army.factionId, helped, 5);
      this.diplo.log(s.army.factionId, helped, `${event.location.name}の戦いで共同作戦(${won ? "勝利" : result.winner === "draw" ? "引き分け" : "敗北"})`);
      void ally;
    }
  }

  /**
   * 会戦の結果を、戦略マップの軍団へ書き戻す。会戦側のデータを反映する入口は、ここだけにする。
   * 兵力・士気・疲労・食糧・指揮官の状態を更新し、イベントを決着済みにして記録を残す。
   * 壊滅した軍団は地図から消え、敗れた軍団は勝者から離れる方向へ後退する。
   */
  applyBattleResult(result: BattleResult): void {
    const event = this.eventOf(result.battleId);
    if (!event || event.status === "completed") return;
    this.splitSupporters(event, result);
    this.history?.onBattle(event, result);
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
    // 会戦で捕らえられた指揮官は、勝った側の捕虜になる(apply で指揮官が外れる前に控える)
    const captured: [string, string, string][] = [];
    const cmdOf = (id: string | null): string | undefined => (id ? this.stateOf(id)?.army.commanderId : undefined) || undefined;
    const ca = cmdOf(event.attackerArmyId);
    const cd = cmdOf(event.defenderArmyId);
    if (ca && result.sides.attacker.commander === "captured") captured.push([ca, event.defenderFactionId, event.attackerFactionId]);
    if (cd && result.sides.defender.commander === "captured") captured.push([cd, event.attackerFactionId, event.defenderFactionId]);
    for (const [pid, holder, from] of captured) this.spoils.addCaptive(pid, holder, from, Math.floor(this.day));
    // 名声と忠誠:勝った指揮官は名声と忠誠が上がり、大敗した指揮官は下がる。敵将を捕らえれば、さらに名声
    const winSide = result.winner === "attacker" ? ca : result.winner === "defender" ? cd : undefined;
    const loseSide = result.winner === "attacker" ? cd : result.winner === "defender" ? ca : undefined;
    const loseResult = result.winner === "attacker" ? result.sides.defender : result.sides.attacker;
    if (winSide) {
      this.loyalty.addFame(winSide, 3 + captured.length * 4);
      this.loyalty.add(winSide, 3, "戦勝");
    }
    // 大敗(5,000人以上の軍が壊滅・敗走):負けた国の政治が揺らぐ
    const loseFaction = result.winner === "attacker" ? event.defenderFactionId : result.winner === "defender" ? event.attackerFactionId : null;
    if (loseFaction && (loseResult.outcome === "annihilated" || loseResult.outcome === "routed") && totalTroops({ troops: loseResult.before } as Army) >= 5000) this.loyalty.noteDefeat(loseFaction);
    if (loseSide && (loseResult.outcome === "annihilated" || loseResult.outcome === "routed")) {
      this.loyalty.addFame(loseSide, -3);
      this.loyalty.add(loseSide, -3, "大敗");
    }
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
        prosperity: prev.prosperity,
        order: prev.order,
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
        // 名声と忠誠:攻め落とした指揮官は名声が上がり、都市を失った側の人々は忠誠が下がる
        if (ca) this.loyalty.addFame(ca, 5);
        for (const p of persons.filter((x) => x.factionId === event.defenderFactionId && x.role !== "ruler")) this.loyalty.add(p.id, -2, `${city.name}の喪失`);
        // 戦利品:その場にいた人物と、蔵の名品を調べる(持ち主が変わる前に)
        const pc = this.spoils.onCityCaptured(city, event.attackerFactionId, event.defenderFactionId, governorId, d.commander === "killed" ? "killed" : "captured",
          Math.max(result.siege.wallDamage, result.siege.gateDamage), Math.floor(this.day), (id) => this.personStatus(id));
        this.cityStates[city.id] = state;
        this.listener.onCityCaptured(city.id, event.attackerFactionId);
        this.handleCapture(pc);
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

    // 君主が捕らえられたり、討たれたりしていないか
    this.checkRulers();
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
    // 戦略AIの記録と、敗れたAIの軍団の撤退の判断
    this.strategy.onBattleResult(event, result);
  }

  /** 1日ごとの消耗と回復 */
  private dailyUpkeep(s: ArmyState): void {
    const a = s.army;
    s.supplied = this.nearFriendlyCity(s);
    const marching = s.status === "marching";
    // 砂漠:水の分も兵糧と同じ「食糧(日数)」でまとめて数える(水を別に数えない)。補給がなければ消費が増え、疲れ、士気が落ちる
    const kind = this.grid.kindAt(a.lon, a.lat);
    const month = this.calendar().month;
    if (!s.supplied && kind === "desert") {
      a.food -= marching ? 1.2 : 0.8;
      a.fatigue += 2;
      if (a.food < 15) a.morale -= 1;
    }
    if (kind === "highMountain" && (month >= 11 || month <= 2) && marching) {
      a.fatigue += 3;
      a.food -= 0.5;
    }
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
      if (a.morale < 35 || kind === "desert") {
        // 食糧が尽きたまま士気が下がると、兵が逃げ出す。砂漠では、渇きで士気に関係なく兵を失う
        const before = totalTroops(a);
        for (const k of Object.keys(a.troops) as UnitTypeId[]) a.troops[k] = Math.floor(a.troops[k] * (kind === "desert" ? 0.95 : 0.97));
        this.logistics.attrition[a.factionId] = (this.logistics.attrition[a.factionId] ?? 0) + before - totalTroops(a);
      }
    } else if (a.fatigue > 75) {
      a.morale -= 2;
    } else if (!marching && a.morale < 85) {
      a.morale += 1;
    }
    a.morale = Math.max(0, Math.min(100, a.morale));

    let statusChanged = false;
    // 対峙の相手がもういないのに「戦闘中」のまま残った軍団は、野営に戻す(動けなくなるのを防ぐ安全策)
    if (s.status === "fighting" && !this.openEventOfArmy(a.id)) {
      s.status = "camping";
      statusChanged = true;
    }
    if (s.status === "camping" || s.status === "resupplying" || s.status === "idle") {
      const next: ArmyStatus = s.supplied && a.food < FOOD_CAP ? "resupplying" : "camping";
      statusChanged = next !== s.status;
      s.status = next;
    }
    if (totalTroops(a) <= 0) a.morale = 0;
    this.listener.onArmyChanged(s, statusChanged);
  }
}

/** 開始の月から決まる、年初からの日数(3月開始なら60) */
const START_OFFSET = ((scenario.startMonth ?? 3) - 1) * 30;

interface SuccessionRule {
  person: string;
  state?: string;
  title?: string;
  note?: string;
}

function factionName(id: string): string {
  return scenario.factions.find((f) => f.id === id)?.name ?? "不明の勢力";
}
