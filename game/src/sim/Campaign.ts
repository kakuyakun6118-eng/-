// ゲームの進行を計算する。日付を進め、軍団の行軍・食糧・疲労・士気・敵との接触を扱う。
// ここは計算だけで、3D表示のことは知らない。変化があったら、登録された関数で知らせる。
import { cityLevelOf, persons, personById, resolveCityLayout, scenario, totalTroops } from "../data";
import successionRules from "../data/rules/succession.json";
import relationRules from "../data/rules/diplomacyStart.json";
import { autoResolve } from "./autoBattle";
import { createBattleSetup, governorIdOf, initialCityState, placeName } from "./battle";
import { StrategyAi, strategyRules } from "./strategy";
import { addToGarrison, sumTroops, takeFromGarrison, type Troops } from "./garrison";
import { Placement } from "./placement";
import capitalData from "../data/scenarios/capitals.json";
import { chance, getGameSeed, setCurrentSpoils, setGameSeed, Spoils, type CaptureRecord, type PendingCapture } from "./spoils";
import { affinity, isKin, LoyaltySystem } from "./loyalty";
import { cityEcon, Economy } from "./economy";
import { Diplomacy, type DiploCommand } from "./diplomacy";
import { Court } from "./court";
import { HistorySystem } from "./history";
import { TradeSystem } from "./trade";
import { seasonOf, type ArmyOpRecord, type CampaignSave, type DynastySave, type Relation } from "./save";
import type { BattleResult, CommanderFate, SideResult } from "../battle/types";
import type { Army, ArmyStatus, BattleEvent, City, CityState, Faction, Person, PersonRole, PersonStatus, UnitTypeId } from "../data/types";
import { distanceKm, findRoute, type Route, type RoutePoint } from "./pathfinding";
import { reliefArrivalSeconds } from "./relief";
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
/** 軍団結合で、その場で1つにできる近さ(km。Version 51) */
const MERGE_KM = 40;
/** 首都の陥落の確率(ゲーム上の初期設定値。史実の確率ではない) */
export const capitalRules = { captureRate: 0.8, fallRate: 0.9 };

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
  /** 帰城先の都市(Version 51。着いたら兵・武将・兵糧を都市へ移して、軍団は消える) */
  returnCityId?: string;
  /** 結合の相手(Version 51。この軍団は相手のそばまで進み、着いたら相手の軍団に合流する) */
  mergeInto?: string;
  /** 結合後の総指揮官(Version 51) */
  mergeCommander?: string;
  /** 帰城・結合で、道を探し直した回数 */
  opTries?: number;
  /** 帰城・結合の待ち・取り消しの理由(画面に出す) */
  opNote?: string;
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
  /** 首都が変わった(遷都・建国) */
  onCapitalChanged?(factionId: string, cityId: string): void;
  /** 歴史の事件の結果、戦略マップが変わった(Version 41) */
  onEventChanges?(eventId: string, diff: import("./eventDiff").EventDiff): void;
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
    readonly listener: CampaignListener,
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
    this.initCapitals();
    this.placement.init(true);
  }

  // ===== 首都(Version 41) =====
  /** シナリオの首都の表から、首都を決める。表にない国は、いちばん格の高い都市(推定) */
  initCapitals(): void {
    this.capitals = {};
    const table = (capitalData.scenarios as Record<string, Record<string, { city: string; certainty: string; note: string }>>)[scenario.id] ?? {};
    for (const f of scenario.factions) {
      const t = table[f.id];
      if (t && scenario.cityOwners[t.city] === f.id) this.capitals[f.id] = { cityId: t.city, certainty: t.certainty, note: t.note };
      else this.ensureCapital(f.id, t ? `表の首都(${this.cities.find((c) => c.id === t.city)?.name ?? t.city})をこの国が持たないため、主な都市を暫定の首都とする` : "主な政治拠点を暫定の首都とする");
    }
  }

  /** 首都が無い・失われた国に、いちばん格の高い(同じなら守備兵の多い)都市を首都として決める */
  private ensureCapital(f: string, note: string): City | undefined {
    const mine = this.cities.filter((c) => c.kind !== "pass" && scenario.cityOwners[c.id] === f);
    if (!mine.length) {
      delete this.capitals[f];
      return undefined;
    }
    const best = [...mine].sort((a, b) => (b.rank === "capital" ? 10 : 0) + cityLevelOf(b) - ((a.rank === "capital" ? 10 : 0) + cityLevelOf(a)) || this.cityState(b).garrison - this.cityState(a).garrison)[0];
    this.capitals[f] = { cityId: best.id, certainty: "推定", note };
    return best;
  }

  /** その国の首都(都市)。首都を失っていれば、残る都市から決め直す */
  capitalCityOf(f: string): City | undefined {
    const c = this.capitals[f];
    if (c && scenario.cityOwners[c.cityId] === f) return this.cities.find((x) => x.id === c.cityId);
    if (!this.cities.some((x) => x.kind !== "pass" && scenario.cityOwners[x.id] === f)) return undefined;
    return this.ensureCapital(f, c ? "前の首都を失い、残る都市を暫定の首都とした" : "主な政治拠点を暫定の首都とする");
  }

  /**
   * 新しく建った国の蓄え(Version 42):元の国から分けた分が、その国の収入の3か月分(シナリオ開始時と同じ決まり)に
   * 足りなければ、拠点の地元の蔵の分として、そこまで補う。建国してすぐ給与を払えず軍が崩れるのを防ぐ。
   */
  seedTreasury(id: string): void {
    const st = (this.factionStates[id] ??= { gold: 0, grain: 0 });
    const r = this.economy.report(id);
    st.gold = Math.max(st.gold, Math.round(r.income.total * 3));
    st.grain = Math.max(st.grain, Math.round(r.income.grain * 3));
  }

  /** 2点のあいだの、通れる地形の道のり(人物の移動用。Version 42) */
  pathBetween(from: { lon: number; lat: number }, to: { lon: number; lat: number }): Route | null {
    return findRoute(this.grid, from, to);
  }

  /** 人物の移動の1日分:着いた・捕まった(捕まった君主は、国の滅亡の処理へ) */
  private tickTravels(): void {
    const r = this.placement.tickTravel();
    for (const id of r.arrived) {
      const p = personById(id);
      const t = p ? this.cities.find((c) => c.id === this.placement.homes[id]?.cityId) : undefined;
      if (p && t) this.addNews(`${p.name}が${t.name}に着きました`);
    }
    for (const { id, by } of r.caught) {
      const p = personById(id);
      if (!p || chance(`${id}|${Math.floor(this.day)}|intercept`) >= 0.4) continue;
      delete this.placement.travels[id];
      this.personStates[id] = "captured";
      this.vacatePosts(id);
      this.spoils.addCaptive(id, by, p.factionId, Math.floor(this.day));
      this.addNews(`${p.name}は移動の途中で${factionName(by)}の軍に捕らえられました`);
      this.strategy.noteCaught?.(p.factionId);
      if (p.role === "ruler") this.checkRulers();
    }
  }

  /** 首都か */
  isCapital(cityId: string): boolean {
    const o = scenario.cityOwners[cityId];
    return !!o && this.capitals[o]?.cityId === cityId;
  }

  /** 遷都 */
  moveCapital(f: string, cityId: string, why: string): void {
    const city = this.cities.find((c) => c.id === cityId);
    if (!city || scenario.cityOwners[cityId] !== f) return;
    const prev = this.capitals[f]?.cityId;
    this.capitals[f] = { cityId, certainty: "ゲーム中の遷都", note: why };
    if (prev !== cityId) {
      this.addNews(`${factionName(f)}が${city.name}へ遷都しました(${why})`);
      this.history?.log("state", `${factionName(f)}が${city.name}へ遷都(${why})`);
      this.listener.onCapitalChanged?.(f, cityId);
    }
  }

  /**
   * 首都の陥落(攻城戦で落ちたとき)。君主が首都にいれば、80%で捕虜、20%で脱出。
   * 捕虜になれば90%で滅亡、10%で後継者が即位して存続(後継者と残る都市があるときだけ)。
   * 君主が首都にいなければ、陥落だけでは捕らえない(遷都する)。判定は会戦ごとに決まる乱数で、1度だけ行う。
   */
  private capitalFallen(def: string, city: City, captor: string, battleId: string, governorId: string | null | undefined, histRule?: { capture: "ifPresent"; survive: boolean }): { rulerCaptured: boolean; rulerEscaped: boolean; rulerId?: string } {
    const ruler = this.rulerOf(def);
    if (!ruler || this.capitalLog.some((l) => l.battleId === battleId)) return { rulerCaptured: false, rulerEscaped: false };
    const loc = this.placement.locationOf(ruler.id);
    // 首都にいるか:いまの所在で決める(太守を兼ねていても、出陣中なら首都にはいない。首都に駐屯する軍団の中なら、いる)
    void governorId;
    const here = (loc.kind === "city" || loc.kind === "court" || loc.kind === "army") && loc.cityId === city.id;
    const rule = capitalRules;
    const entry: Campaign["capitalLog"][number] = { day: Math.floor(this.day), date: this.dateText(), factionId: def, cityId: city.id, captor, rulerId: ruler.id, rulerAtCapital: here, captured: false, escaped: false, fell: false, survived: false, battleId, hist: histRule ? { survive: histRule.survive } : undefined, wasCapital: this.isCapital(city.id) };
    this.capitalLog.push(entry);
    this.capitalFallPending = battleId;
    if (this.capitalLog.length > 200) this.capitalLog.splice(0, this.capitalLog.length - 200);
    if (!here) return { rulerCaptured: false, rulerEscaped: false, rulerId: ruler.id };
    // 事件の決まり:君主がいれば、必ず捕らえる(史料に明示された結果)
    if (histRule || chance(`${battleId}|capital|capture`) < rule.captureRate) {
      entry.captured = true;
      return { rulerCaptured: true, rulerEscaped: false, rulerId: ruler.id };
    }
    entry.escaped = true;
    return { rulerCaptured: false, rulerEscaped: true, rulerId: ruler.id };
  }

  /** 首都の陥落のあとの処理(都市の持ち主が変わったあと):遷都・脱出・存続の判定 */
  private capitalAftermath(def: string, battleId: string): void {
    this.capitalFallPending = null;
    const entry = this.capitalLog.find((l) => l.battleId === battleId);
    if (!entry || entry.factionId !== def) return;
    const ruler = entry.rulerId ? personById(entry.rulerId) : undefined;
    const remaining = this.cities.filter((c) => c.kind !== "pass" && scenario.cityOwners[c.id] === def);
    const lost = this.cities.find((c) => c.id === entry.cityId)!;
    // 落ちた都市が首都でなかった(歴史の事件の攻城戦)なら、首都はそのまま
    const keepCap = entry.wasCapital === false ? this.capitalCityOf(def) : undefined;
    const pickCapital = (): City | undefined => keepCap ?? [...remaining].sort((a, b) => cityLevelOf(b) * 1000 - distanceKm(b, lost) / 10 - (cityLevelOf(a) * 1000 - distanceKm(a, lost) / 10))[0];
    if (!entry.captured && !remaining.length && ruler) {
      // 最後の都市を失った:君主は落ち延びたが、国を保つ都市がない。国は滅びる(君主は捕らえられていない)
      entry.fell = true;
      this.addNews(`${factionName(def)}の君主${ruler.name}は${lost.name}から落ち延びましたが、国を保つ都市はもうありません`);
      this.fallFaction(def, ruler, null);
      return;
    }
    if (!entry.captured) {
      // 君主は首都にいなかったか、脱出した:残る都市へ遷都する(君主のいる都市があればそこへ)
      const at = ruler ? this.placement.locationOf(ruler.id) : undefined;
      const atCity = at?.cityId && scenario.cityOwners[at.cityId] === def ? this.cities.find((c) => c.id === at.cityId) : undefined;
      const next = entry.escaped ? pickCapital() : atCity ?? pickCapital();
      if (next) {
        if (entry.escaped && ruler) this.placement.moveTo(ruler.id, next.id, "court", `${lost.name}の陥落から脱出`);
        this.moveCapital(def, next.id, `${lost.name}の陥落`);
        entry.newCapital = next.id;
      }
      this.court.addStability(def, entry.escaped ? -20 : -12);
      this.loyalty.noteDefeat(def);
      if (entry.escaped && ruler) {
        this.addNews(`${factionName(def)}の君主${ruler.name}は、${lost.name}の陥落から脱出しました`);
        // 有力な将の離反の見込み:忠誠を下げる(離反するかは、忠誠の仕組みで決まる)
        for (const p of persons.filter((x) => x.factionId === def && x.role !== "ruler" && this.postOf(x.id))) this.loyalty.add(p.id, -6, `${lost.name}の陥落と君主の逃亡`);
      }
      return;
    }
    // 捕虜:90%で滅亡、10%で存続(後継者と残る都市があるときだけ)
    // 存続か滅亡か:事件の決まりがあればそれに従い、なければ 10% で存続
    const stay = entry.hist ? entry.hist.survive : chance(`${battleId}|capital|survive`) >= capitalRules.fallRate;
    const heir = ruler && remaining.length ? this.successionCandidates(def, ruler).map((x) => x.p).find((p) => this.personStatus(p.id) === "active" && !this.spoils.custodyOf(p.id) && !this.court.isMinor(p)) : undefined;
    if (!stay || !heir || !ruler) {
      entry.fell = true;
      return; // 滅亡は、すぐあとの checkRulers(君主の捕縛 → fallFaction)が一度だけ行う
    }
    entry.survived = true;
    entry.newRuler = heir.id;
    this.replaceRuler(def, ruler, heir);
    const next = pickCapital();
    if (next) {
      this.moveCapital(def, next.id, `${lost.name}の陥落と君主${ruler.name}の捕縛`);
      this.placement.moveTo(heir.id, next.id, "court", "新しい君主として即位");
      entry.newCapital = next.id;
    }
    this.court.addStability(def, -35);
    this.loyalty.noteDefeat(def);
    for (const p of persons.filter((x) => x.factionId === def && x.role !== "ruler")) this.loyalty.add(p.id, -12, `君主${ruler.name}の捕縛`);
    // 残る軍団:忠誠の低い指揮官は、捕らえた国に降る
    for (const a of this.armies.filter((x) => x.army.factionId === def)) {
      const cmd = a.army.commanderId;
      if (cmd && (this.loyalty.loyalty[cmd] ?? 60) < 35 && chance(`${battleId}|${cmd}|surrender`) < 0.5) this.defect(cmd, entry.captor, `君主${ruler.name}の捕縛ののち降る`);
    }
    this.addNews(`${factionName(def)}の君主${ruler.name}は捕らえられましたが、${heir.name}が即位し、国は${next ? `${next.name}に都を移して` : ""}存続しました`);
    this.history?.log("ruler", `${factionName(def)}:君主${ruler.name}が捕らえられ、${heir.name}が即位して国は存続`);
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
    // 戦死は、死亡の処理に回す(捕虜の記録・指揮・任地も外す。Version 42:捕虜の記録が残る不具合を直した)
    if (fate === "killed") {
      this.dieNaturally(personId, "battle");
      this.court?.recordCause(personId, "battle", "会戦で討たれる");
    }
    else if (fate === "captured") {
      // すでに捕虜・保護の人は、重ねて捕らえない(Version 51:捕虜の記録が二重になる原因だった)
      // (会戦では、捕虜の記録を先に作ってから状態を書くので、状態がまだ捕虜・保護でなければ書く)
      if (this.spoils.custodyOf(personId) && ["captured", "protected"].includes(this.personStatus(personId))) return;
      this.personStates[personId] = "captured";
      this.vacatePosts(personId);
    }
    else if (fate === "wounded" && !this.spoils.custodyOf(personId)) this.personStates[personId] = "wounded";
  }

  /**
   * 捕虜・保護・死亡になった人の役目を外す(Version 51):軍団の指揮官・副将・配下武将と、都市の太守・守将。
   * これが無いと、捕虜になった人が別の都市の太守のまま残り、その都市が落ちたときに2度目の捕縛を受けて、
   * 捕虜の記録が二重になっていた(捕虜の記録と人物の状態がずれる問題の根の原因)
   */
  vacatePosts(personId: string): void {
    for (const s of this.armies) {
      if (s.army.commanderId === personId) s.army.commanderId = "";
      if (s.army.deputyId === personId) delete s.army.deputyId;
      this.dropOfficer(s.army, personId);
    }
    for (const c of this.cities) if (governorIdOf(c, this.cityStates[c.id]) === personId) this.cityStates[c.id] = { ...this.cityState(c), governorId: null };
  }

  /**
   * その人が、いま実際にその都市にいるか(Version 51:落城で捕らえるのは、その場にいた人だけ。
   * 以前は「住まい」がその都市の人を、別の都市の太守や出陣中の武将でも捕らえていた)
   */
  presentAt(personId: string, cityId: string): boolean {
    const l = this.placement.locationOf(personId);
    return l.cityId === cityId && (l.kind === "city" || l.kind === "court" || l.kind === "pass");
  }

  /** 捕虜の記録の整合を、毎月の片づけで直した件数(Version 51:根の原因を直したので、0のはず。テストで確かめる) */
  custodyRepairs: { day: number; personId: string; status: string }[] = [];

  /** その人物の、いまの役目(太守・守将か、軍団の指揮官)。無ければ null */
  postOf(personId: string): { kind: "city" | "army" | "deputy"; id: string; label: string } | null {
    const army = this.armies.find((s) => s.army.commanderId === personId);
    if (army) return { kind: "army", id: army.army.id, label: `${army.army.name} 指揮官` };
    const dep = this.armies.find((s) => s.army.deputyId === personId);
    if (dep) return { kind: "deputy", id: dep.army.id, label: `${dep.army.name} 副将` };
    // 配下武将(Version 51:軍団結合で加わった武将)。役目の種類は副将と同じに扱う
    const off = this.armies.find((s) => s.army.officers?.includes(personId));
    if (off) return { kind: "deputy", id: off.army.id, label: `${off.army.name} 配下武将` };
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
      this.dropOfficer(s.army, personId);
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
  /** 国家の首都(Version 41):勢力 → 都市・確かさ・由来 */
  capitals: Record<string, { cityId: string; certainty: string; note: string }> = {};
  /** 首都の陥落の記録(捕縛・滅亡・存続の判定は1回の陥落につき1度だけ。セーブにも残る) */
  /** 攻城での首都の陥落を処理している最中(都市の移転で、二重に遷都しないように) */
  private capitalFallPending: string | null = null;
  capitalLog: { day: number; date: string; factionId: string; cityId: string; captor: string; rulerId?: string; rulerAtCapital: boolean; captured: boolean; escaped: boolean; fell: boolean; survived: boolean; newRuler?: string; newCapital?: string; battleId: string; hist?: { survive: boolean }; wasCapital?: boolean }[] = [];
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
  readonly logistics: { attrition: Record<string, number>; expeditions: Record<string, number>; losses?: Record<string, Record<string, number>> } = { attrition: {}, expeditions: {}, losses: {} };

  /** 兵の損失を、原因ごとに数える(報告用。同じ損失を二度数えない:会戦は会戦の結果で、消耗は日々の消耗で) */
  addLoss(factionId: string, cause: string, n: number): void {
    if (n <= 0) return;
    const L = ((this.logistics.losses ??= {})[factionId] ??= {});
    L[cause] = (L[cause] ?? 0) + n;
  }

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
    // 人口に見合う兵まで:この都市で新しく集められるのは、守備兵が人口の6%になるまで。
    // (Version 51:都市の規模ごとの守備兵の固定の上限は撤廃した。帰城した軍団の兵は、この上限に関係なく駐屯できる)
    const popCap = Math.floor(e.pop * 0.06);
    const n = Math.floor(Math.min(troops, popCap - state.garrison));
    if (n < 100) return `人口に対して兵が多すぎて、新しくは集まりません(人口${e.pop.toLocaleString("ja-JP")}人では、募兵できるのは守備兵が${popCap.toLocaleString("ja-JP")}人になるまで。帰城した兵は、これを超えて駐屯できます)`;
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
  raiseArmy(cityId: string, troops: number, commanderId?: string, minTroops: number = strategyRules.costs.minArmy): ArmyState | string {
    const city = this.cities.find((c) => c.id === cityId);
    const owner = city ? scenario.cityOwners[city.id] : undefined;
    const st = owner ? this.factionStates[owner] : undefined;
    if (!city || !owner || !st) return "都市が見つかりません";
    const state = this.cityState(city);
    const n = Math.floor(troops);
    if (n < minTroops) return `軍団は ${minTroops.toLocaleString("ja-JP")}人以上で編成します`;
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
    // 兵種の割合:守備兵の内訳を記録している都市(帰城した兵がいる都市。Version 51)は、その割合で出す。
    // そうでなければ、これまでどおり、遊牧の勢力は騎兵が多い(ゲーム上の設定)
    let mix: Troops;
    if (state.garrisonMix) {
      const t = takeFromGarrison(state, n);
      this.cityStates[city.id] = t.state;
      mix = t.troops;
    } else {
      this.cityStates[city.id] = { ...state, garrison: state.garrison - n };
      const people = scenario.factions.find((f) => f.id === owner)?.people ?? "";
      const nomad = /匈奴|鮮卑|羯/.test(people);
      const cavalry = Math.round(n * (nomad ? 0.5 : 0.15));
      const archer = Math.round(n * (nomad ? 0.15 : 0.25));
      mix = { infantry: n - cavalry - archer, cavalry, archer };
    }
    const pick = personById(commanderId);
    const commander = pick && !this.court?.isMinor(pick) ? pick : undefined;
    const id = `army_n${this.nextArmyId++}`;
    const army: Army = {
      id, name: commander ? `${commander.name}軍` : `${city.name}の軍`, factionId: owner, commanderId: commander?.id ?? "",
      lon: spot.lon, lat: spot.lat, facing: 0,
      troops: mix, morale: 70, fatigue: 0, food: 45, originCityId: city.id,
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
    // Version 51:兵種別の人数・兵糧・武将も、帰城と同じ処理で都市へ移す
    const r = this.absorbIntoCity(s, city, "disband");
    if (r) return r;
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
    if (state.garrisonMix) {
      // 守備兵の内訳を記録している都市(Version 51)は、その割合で兵を出す
      const t = takeFromGarrison(state, n);
      this.cityStates[city.id] = t.state;
      for (const k of ["infantry", "cavalry", "archer"] as const) s.army.troops[k] += t.troops[k];
    } else {
      this.cityStates[city.id] = { ...state, garrison: state.garrison - n };
      s.army.troops.infantry += n;
    }
    this.listener.onArmyChanged(s, false);
    return null;
  }

  // ===== Version 51:軍団の帰城・軍団結合 =====

  /** 帰城・結合の記録(AIの利用実績の報告とテストに使う。セーブに残す) */
  armyOpsLog: ArmyOpRecord[] = [];

  private logArmyOp(kind: ArmyOpRecord["kind"], factionId: string, troops: number, text: string): void {
    this.armyOpsLog.push({ day: Math.floor(this.day), date: this.dateText(), kind, factionId, ai: factionId !== this.playerFactionId, troops, text });
    if (this.armyOpsLog.length > 600) this.armyOpsLog.splice(0, this.armyOpsLog.length - 600);
  }

  /** 配下武将から外す */
  private dropOfficer(a: Army, personId: string): void {
    if (!a.officers) return;
    a.officers = a.officers.filter((x) => x !== personId);
    if (!a.officers.length) delete a.officers;
  }

  /**
   * 配下武将の整理(毎日):死亡・捕虜・寝返り(国が変わった)・ほかの役目についた武将は、配下から外す。
   * 外れた健在の武将は、軍団のそばの自国の都市(無ければ都)にいることになる
   */
  private tidyOfficers(): void {
    for (const s of this.armies) {
      // 副将も、死亡・捕虜・寝返りなら外す(Version 51:政変で殺された人が副将のまま残る不具合があった)
      const dep = s.army.deputyId;
      if (dep && (!["active", "wounded"].includes(this.personStatus(dep)) || personById(dep)?.factionId !== s.army.factionId)) delete s.army.deputyId;
      const list = s.army.officers;
      if (!list) continue;
      const keep = list.filter((id, i) => list.indexOf(id) === i && ["active", "wounded"].includes(this.personStatus(id)) && personById(id)?.factionId === s.army.factionId
        && id !== s.army.commanderId && id !== s.army.deputyId && !this.armies.some((o) => o !== s && this.membersOf(o.army).includes(id))
        && !this.cities.some((c) => governorIdOf(c, this.cityStates[c.id]) === id));
      if (keep.length) s.army.officers = keep;
      else delete s.army.officers;
      // 副将がいなければ、配下武将の筆頭が副将になる
      if (!s.army.deputyId && s.army.officers?.length) {
        s.army.deputyId = s.army.officers.shift();
        if (!s.army.officers.length) delete s.army.officers;
      }
    }
  }

  /** 帰城・結合の命令を取り消す(新しい移動の命令・停止のとき) */
  private clearArmyOp(s: ArmyState): void {
    delete s.returnCityId;
    delete s.mergeInto;
    delete s.mergeCommander;
    delete s.opTries;
    delete s.opNote;
  }

  /** その軍団に属する武将(指揮官・副将・配下武将) */
  membersOf(a: Army): string[] {
    return [a.commanderId, a.deputyId, ...(a.officers ?? [])].filter((x, i, l): x is string => !!x && l.indexOf(x) === i);
  }

  /** 都市が包囲されているか(まだ決着していない攻城戦がある) */
  private besieged(cityId: string): boolean {
    return this.events.some((e) => e.defenderCityId === cityId && (e.status === "pending" || e.status === "preparing" || e.status === "in_progress"));
  }

  /** 帰城で、都市に着いたとみなす近さ(度)。行軍の終点は、都市のまわりの空いた所になる */
  private nearCity(s: ArmyState, city: City, extra: number): boolean {
    return Math.hypot(city.lon - s.army.lon, city.lat - s.army.lat) <= this.cityReach(city) + extra;
  }

  /**
   * 帰城先の候補(Version 51):出発元の都市・いちばん近い自国の都市・首都と、ほかの自国の都市(近い順)。
   * それぞれ、実際の道のりの距離・日数・兵糧の見込みを付ける。道が無い都市は出さない。
   */
  returnOptions(armyId: string, limit = 10): { cityId: string; name: string; tags: string[]; km: number; days: number; foodUse: number; foodLeft: number; besieged: boolean; route: Route | null }[] {
    const s = this.stateOf(armyId);
    if (!s) return [];
    const f = s.army.factionId;
    const mine = this.cities.filter((c) => scenario.cityOwners[c.id] === f).sort((a, b) => distanceKm(a, s.army) - distanceKm(b, s.army));
    if (!mine.length) return [];
    const cap = this.capitalCityOf(f);
    const origin = s.army.originCityId && scenario.cityOwners[s.army.originCityId] === f ? s.army.originCityId : undefined;
    const pick = [...new Set([origin, mine[0].id, cap?.id, ...mine.slice(0, limit).map((c) => c.id)].filter((x): x is string => !!x))];
    const out: ReturnType<Campaign["returnOptions"]> = [];
    for (const id of pick) {
      const c = this.cities.find((x) => x.id === id)!;
      const tags = [id === origin ? "出発元" : "", id === mine[0].id ? "最寄り" : "", id === cap?.id ? "首都" : ""].filter(Boolean);
      if (this.nearCity(s, c, 0.35)) {
        out.push({ cityId: id, name: c.name, tags, km: Math.round(distanceKm(c, s.army)), days: 0, foodUse: 0, foodLeft: Math.round(s.army.food), besieged: this.besieged(id), route: null });
        continue;
      }
      const route = this.planRoute(armyId, { lon: c.lon, lat: c.lat }, 6);
      if (!route) continue;
      const est = this.estimateRoute(armyId, route);
      out.push({ cityId: id, name: c.name, tags, km: Math.round(route.km), days: est.days, foodUse: est.foodUse, foodLeft: est.foodLeft, besieged: this.besieged(id), route });
    }
    return out;
  }

  /**
   * 帰城の命令(Version 51)。自国の都市へ、道・地形・補給に従って進む(瞬間移動はしない)。
   * すでに都市のすぐそば(約35km以内)にいれば、その場で入城する。着いたら兵・武将・兵糧を都市へ移し、軍団は消える。
   */
  orderReturn(armyId: string, cityId: string, route?: Route | null): string | null {
    const s = this.stateOf(armyId);
    const city = this.cities.find((c) => c.id === cityId);
    if (!s || !city) return "軍団か都市が見つかりません";
    if (scenario.cityOwners[city.id] !== s.army.factionId) return "自国の都市にしか帰城できません";
    if (s.status === "fighting") return "戦闘中の軍団は帰城できません(会戦の決着か離脱のあとで)";
    if (this.nearCity(s, city, 0.35) && !this.besieged(city.id)) {
      if (s.status === "marching") this.halt(armyId);
      return this.absorbIntoCity(s, city, "return");
    }
    const r = route ?? this.planRoute(armyId, { lon: city.lon, lat: city.lat }, 8);
    if (!r) return `${city.name}への道が見つかりません(敵の関所や地形で塞がれています)`;
    this.orderMove(armyId, r);
    s.returnCityId = city.id;
    s.opTries = 0;
    s.opNote = `${city.name}へ帰城中`;
    this.listener.onArmyChanged(s, false);
    return null;
  }

  /**
   * 軍団を都市に入れる(帰城・解散。Version 51)。兵は兵種別に守備兵へ、兵糧は国の蔵へ、武将は都市へ移す。
   * 移し終えたことを確かめてから、軍団を地図から消す。都市の守備兵には固定の上限は無い。
   */
  private absorbIntoCity(s: ArmyState, city: City, kind: "return" | "disband"): string | null {
    const a = s.army;
    if (scenario.cityOwners[city.id] !== a.factionId) return "自国の都市ではありません";
    if (!this.armies.includes(s)) return "軍団がありません";
    const add: Troops = { infantry: Math.max(0, Math.round(a.troops.infantry)), cavalry: Math.max(0, Math.round(a.troops.cavalry)), archer: Math.max(0, Math.round(a.troops.archer)) };
    const n = sumTroops(add);
    const before = this.cityState(city);
    let next = addToGarrison(before, add);
    // 士気:兵数で重みをつけて平均する。疲れた兵(疲労)は、そのぶん士気を下げて加わる(城内で休めば、日ごとに戻る)
    const g0 = before.garrison;
    const armyMorale = Math.max(0, a.morale - a.fatigue / 5);
    next = { ...next, morale: Math.round(((before.morale * g0 + armyMorale * n) / Math.max(1, g0 + n)) * 10) / 10 };
    // 兵糧:軍団の残りの食糧(日数×兵)を、国の蔵の兵糧に戻す(出陣のときは 100人あたり1で45日分。同じ割合で戻す)
    const grain = (Math.max(0, a.food) * n) / 4500;
    const fs = (this.factionStates[a.factionId] ??= { gold: 0, grain: 0 });
    const grain0 = fs.grain;
    // 確かめ:守備兵の増え方が、軍団の兵の数と一致すること
    if (next.garrison !== g0 + n) return "兵の移し替えが合いません(帰城を取りやめました)";
    this.cityStates[city.id] = next;
    fs.grain = grain0 + grain;
    // 武将:指揮官・副将・配下武将を、その都市へ戻す(健在・負傷の人だけ。捕虜・死者は動かさない)
    const people = this.membersOf(a).filter((id) => ["active", "wounded"].includes(this.personStatus(id)) && personById(id)?.factionId === a.factionId);
    for (const id of people) this.placement.moveTo(id, city.id, "court", `${a.name}とともに${city.name}へ${kind === "return" ? "帰城" : "戻った"}`);
    a.commanderId = "";
    delete a.deputyId;
    delete a.officers;
    // 確かめてから、軍団を消す
    const ok = this.cityState(city).garrison === g0 + n && people.every((id) => !this.postOf(id) || this.postOf(id)?.kind === "city" || this.placement.homes[id]?.cityId === city.id);
    if (!ok) return "移し替えを確かめられませんでした";
    this.armies.splice(this.armies.indexOf(s), 1);
    this.listener.onArmyRemoved(s);
    const names = people.map((id) => personById(id)?.name).filter(Boolean).join("・");
    const text = `${a.name}(${n.toLocaleString("ja-JP")}人)が${city.name}に${kind === "return" ? "帰城" : "戻った"}。守備兵 ${g0.toLocaleString("ja-JP")} → ${(g0 + n).toLocaleString("ja-JP")}人、兵糧 +${Math.round(grain)}${names ? `、武将:${names}` : ""}`;
    this.logArmyOp(kind, a.factionId, n, text);
    if (kind === "return") this.addNews(`${factionName(a.factionId)}:${text}`);
    return null;
  }

  /**
   * 軍団結合の見込み(Version 51):結合後の兵力(兵種別)・兵糧・士気・疲労・指揮官と、離れた軍団が合流するまでの日数。
   * できないときは、理由を文字で返す。
   */
  mergePreview(targetId: string, otherIds: string[], commanderId?: string): string | {
    troops: Troops; total: number; food: number; morale: number; fatigue: number; commanderId: string; deputyId?: string; officers: string[];
    candidates: string[]; far: { armyId: string; name: string; km: number; days: number | null }[]; speed: number;
  } {
    const t = this.stateOf(targetId);
    if (!t) return "軍団が見つかりません";
    const others = otherIds.filter((id) => id !== targetId).map((id) => this.stateOf(id));
    if (!others.length) return "結合する軍団を選んでください";
    if (others.some((o) => !o)) return "見つからない軍団があります";
    const all = [t, ...(others as ArmyState[])];
    if (all.some((x) => x.army.factionId !== t.army.factionId)) return "同じ国の軍団だけを結合できます";
    if (all.some((x) => x.status === "fighting")) return "戦闘中の軍団は結合できません";
    const troops: Troops = { infantry: 0, cavalry: 0, archer: 0 };
    let food = 0;
    let morale = 0;
    let fatigue = 0;
    for (const x of all) {
      const n = totalTroops(x.army);
      for (const k of ["infantry", "cavalry", "archer"] as const) troops[k] += x.army.troops[k];
      food += x.army.food * n;
      morale += x.army.morale * n;
      fatigue += x.army.fatigue * n;
    }
    const total = sumTroops(troops);
    const candidates = all.flatMap((x) => this.membersOf(x.army)).filter((id, i, l) => l.indexOf(id) === i && this.personStatus(id) === "active" && !this.court?.isMinor(personById(id)!));
    const cmd = commanderId && candidates.includes(commanderId) ? commanderId : t.army.commanderId && candidates.includes(t.army.commanderId) ? t.army.commanderId : candidates[0] ?? "";
    const rest = all.flatMap((x) => this.membersOf(x.army)).filter((id, i, l) => l.indexOf(id) === i && id !== cmd && ["active", "wounded"].includes(this.personStatus(id)));
    const deputyId = t.army.deputyId && rest.includes(t.army.deputyId) ? t.army.deputyId : rest[0];
    const officers = rest.filter((id) => id !== deputyId);
    const far = (others as ArmyState[]).filter((o) => distanceKm(o.army, t.army) > MERGE_KM).map((o) => {
      const r = this.planRoute(o.army.id, { lon: t.army.lon, lat: t.army.lat }, 6);
      return { armyId: o.army.id, name: o.army.name, km: Math.round(distanceKm(o.army, t.army)), days: r ? Math.max(1, Math.ceil(this.daysFor(o, r))) : null };
    });
    const div = Math.max(1, total);
    const probe: ArmyState = { ...t, army: { ...t.army, troops, commanderId: cmd, fatigue: fatigue / div, food: food / div } };
    return { troops, total, food: Math.round(food / div), morale: Math.round(morale / div), fatigue: Math.round(fatigue / div), commanderId: cmd, deputyId, officers, candidates, far, speed: this.marchSpeed(probe) };
  }

  /**
   * 軍団結合の命令(Version 51)。近く(約40km以内)の軍団は、その場で結合する。離れた軍団は、結合先の軍団のそばまで
   * 進み、着いてから結合する(瞬間的な結合はしない)。commanderId は、結合後の総指揮官。
   */
  orderMerge(targetId: string, otherIds: string[], commanderId?: string): string | null {
    const pv = this.mergePreview(targetId, otherIds, commanderId);
    if (typeof pv === "string") return pv;
    const t = this.stateOf(targetId)!;
    const near = otherIds.filter((id) => id !== targetId && distanceKm(this.stateOf(id)!.army, t.army) <= MERGE_KM);
    for (const id of near) {
      const r = this.mergeNow(t, this.stateOf(id)!, commanderId);
      if (r) return r;
    }
    for (const f of pv.far) {
      const o = this.stateOf(f.armyId)!;
      const route = this.planRoute(o.army.id, { lon: t.army.lon, lat: t.army.lat }, 8);
      if (!route) return `${o.army.name}から${t.army.name}への道が見つかりません`;
      this.orderMove(o.army.id, route);
      o.mergeInto = t.army.id;
      o.mergeCommander = commanderId;
      o.opTries = 0;
      o.opNote = `${t.army.name}と結合するため合流中`;
      this.listener.onArmyChanged(o, false);
    }
    // 結合先は、合流を待つあいだ止まる(行軍中なら野営)
    if (pv.far.length && t.status === "marching") {
      t.route = null;
      this.setStatus(t, "camping");
    }
    if (pv.far.length) {
      t.opNote = `${pv.far.map((x) => x.name).join("・")}の合流を待っています`;
      this.listener.onArmyChanged(t, false);
    }
    return null;
  }

  /** 2つの軍団を、いまこの場で1つにする(近くにいることを確かめてから。Version 51) */
  private mergeNow(t: ArmyState, o: ArmyState, commanderId?: string): string | null {
    if (t === o) return "同じ軍団です";
    if (t.army.factionId !== o.army.factionId) return "同じ国の軍団だけを結合できます";
    if (t.status === "fighting" || o.status === "fighting") return "戦闘中の軍団は結合できません";
    if (distanceKm(t.army, o.army) > MERGE_KM * 1.5) return "離れすぎています";
    const a = t.army, b = o.army;
    const na = totalTroops(a), nb = totalTroops(b);
    const n = na + nb;
    const sum: Troops = { infantry: a.troops.infantry + b.troops.infantry, cavalry: a.troops.cavalry + b.troops.cavalry, archer: a.troops.archer + b.troops.archer };
    const avg = (x: number, y: number): number => (n > 0 ? (x * na + y * nb) / n : (x + y) / 2);
    // 武将:総指揮官を選び、ほかの武将は副将・配下武将になる
    const members = [...this.membersOf(a), ...this.membersOf(b)].filter((id, i, l) => l.indexOf(id) === i && ["active", "wounded"].includes(this.personStatus(id)) && personById(id)?.factionId === a.factionId);
    const able = (id: string | undefined): boolean => !!id && members.includes(id) && this.personStatus(id) === "active" && !this.court?.isMinor(personById(id)!);
    const cmd = able(commanderId) ? commanderId! : able(a.commanderId) ? a.commanderId : able(b.commanderId) ? b.commanderId : members.find(able) ?? "";
    const rest = members.filter((id) => id !== cmd);
    const deputy = a.deputyId && rest.includes(a.deputyId) ? a.deputyId : rest[0];
    const oldName = a.name;
    const oldCmd = a.commanderId;
    a.troops = sum;
    a.food = Math.max(0, Math.min(FOOD_CAP, avg(a.food, b.food)));
    a.morale = Math.round(avg(a.morale, b.morale));
    a.fatigue = Math.round(avg(a.fatigue, b.fatigue));
    a.commanderId = cmd;
    if (deputy) a.deputyId = deputy;
    else delete a.deputyId;
    const officers = rest.filter((id) => id !== deputy);
    if (officers.length) a.officers = officers;
    else delete a.officers;
    // 名前:指揮官が替われば「(指揮官)軍」にする
    if (cmd && cmd !== oldCmd) a.name = `${personById(cmd)!.name}軍`;
    // 確かめ:兵の合計が合うこと(消えたり、二重に増えたりしない)
    if (totalTroops(a) !== n) return "兵の合計が合いません";
    // 結合した軍団の、事件の印(歴史の会戦)は、結合先へ移す
    for (const tag of this.history?.tags ?? []) {
      if (tag.a === b.id) tag.a = a.id;
      if (tag.b === b.id) tag.b = a.id;
    }
    b.commanderId = "";
    delete b.deputyId;
    delete b.officers;
    b.troops = { infantry: 0, cavalry: 0, archer: 0 };
    this.armies.splice(this.armies.indexOf(o), 1);
    this.listener.onArmyRemoved(o);
    delete t.opNote;
    this.listener.onArmyChanged(t, false);
    const text = `${b.name}(${nb.toLocaleString("ja-JP")}人)を${oldName}(${na.toLocaleString("ja-JP")}人)に結合 → ${a.name} ${n.toLocaleString("ja-JP")}人(総指揮官 ${personById(cmd)?.name ?? "なし"})`;
    this.logArmyOp("merge", a.factionId, n, text);
    this.addNews(`${factionName(a.factionId)}:${text}`);
    return null;
  }

  /**
   * 毎日:帰城・結合の命令を進める(Version 51)。帰城先を奪われた・道が無い・相手が消えたときは取り消す。
   * 途中で敵と出会えば、ふつうの会戦になる。決着したあと、生き残っていれば、道を探し直して続ける。
   */
  private tickArmyOps(): void {
    for (const s of [...this.armies]) {
      if (!this.armies.includes(s)) continue;
      if (s.returnCityId) {
        const city = this.cities.find((c) => c.id === s.returnCityId);
        if (!city || scenario.cityOwners[city.id] !== s.army.factionId) {
          this.cancelArmyOp(s, `帰城先の${city?.name ?? "都市"}が${city ? factionName(scenario.cityOwners[city.id] ?? "") : ""}に奪われたため、帰城を取り消しました。別の帰城先を選んでください`);
          continue;
        }
        if (s.status === "fighting" || s.status === "marching") continue;
        if (this.nearCity(s, city, (s.opTries ?? 0) >= 2 ? 1.0 : 0.6)) {
          if (this.besieged(city.id)) {
            s.opNote = `${city.name}が包囲されているため、城外で待機(救援に加わります)`;
            continue;
          }
          const r = this.absorbIntoCity(s, city, "return");
          if (r) this.cancelArmyOp(s, r);
          continue;
        }
        // 途中で止まった(会戦のあと・道が塞がれた):探し直す
        s.opTries = (s.opTries ?? 0) + 1;
        const route = s.opTries <= 4 ? this.planRoute(s.army.id, { lon: city.lon, lat: city.lat }, 8) : null;
        if (!route) {
          this.cancelArmyOp(s, `${city.name}への道が塞がれていて、帰城できません。別の帰城先を選んでください`);
          continue;
        }
        const keep = { returnCityId: s.returnCityId, opTries: s.opTries };
        this.orderMove(s.army.id, route);
        Object.assign(s, keep, { opNote: `${city.name}へ帰城中(道を探し直した)` });
        continue;
      }
      if (s.mergeInto) {
        const t = this.stateOf(s.mergeInto);
        if (!t || t.army.factionId !== s.army.factionId) {
          this.cancelArmyOp(s, "結合の相手の軍団がいなくなったため、結合を取り消しました");
          continue;
        }
        if (s.status === "fighting" || s.status === "marching" || t.status === "fighting") continue;
        if (distanceKm(s.army, t.army) <= MERGE_KM * 1.5) {
          const cmd = s.mergeCommander;
          this.clearArmyOp(s);
          const r = this.mergeNow(t, s, cmd);
          if (r) this.cancelArmyOp(s, r);
          continue;
        }
        s.opTries = (s.opTries ?? 0) + 1;
        const route = s.opTries <= 6 ? this.planRoute(s.army.id, { lon: t.army.lon, lat: t.army.lat }, 8) : null;
        if (!route) {
          this.cancelArmyOp(s, `${t.army.name}への道が見つからず、結合を取り消しました`);
          continue;
        }
        const keep = { mergeInto: s.mergeInto, mergeCommander: s.mergeCommander, opTries: s.opTries };
        this.orderMove(s.army.id, route);
        Object.assign(s, keep, { opNote: `${t.army.name}と結合するため合流中` });
      }
    }
  }

  private cancelArmyOp(s: ArmyState, why: string): void {
    this.clearArmyOp(s);
    s.opNote = why;
    this.logArmyOp("cancel", s.army.factionId, totalTroops(s.army), `${s.army.name}:${why}`);
    if (s.army.factionId === this.playerFactionId) this.addNews(`${s.army.name}:${why}`);
    this.listener.onArmyChanged(s, false);
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
        returnCityId: s.returnCityId, mergeInto: s.mergeInto, mergeCommander: s.mergeCommander, opTries: s.opTries, opNote: s.opNote,
      })),
      armyOpsLog: this.armyOpsLog,
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
      capitals: this.capitals,
      capitalLog: this.capitalLog,
      seed: getGameSeed() || undefined,
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
      if ((e.status === "preparing" || e.status === "in_progress") && e.autoSiegeUntil === undefined) e.status = "pending";
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
    this.logistics.losses = JSON.parse(JSON.stringify(data.logistics?.losses ?? {}));
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
      // セーブに無い任意の項目は消してから書き戻す(副将・配下武将・出発元が、前の状態から残らないように)
      delete s.army.deputyId;
      delete s.army.officers;
      delete s.army.originCityId;
      Object.assign(s.army, a.army);
      s.returnCityId = a.returnCityId;
      s.mergeInto = a.mergeInto;
      s.mergeCommander = a.mergeCommander;
      s.opTries = a.opTries;
      s.opNote = a.opNote;
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
    if (data.capitals) this.capitals = JSON.parse(JSON.stringify(data.capitals));
    else this.initCapitals();
    this.capitalLog = JSON.parse(JSON.stringify(data.capitalLog ?? []));
    this.armyOpsLog = JSON.parse(JSON.stringify(data.armyOpsLog ?? []));
    setGameSeed(data.seed ?? "");
  }

  /** 都市の、いまの状態(まだ戦いを受けていなければ、最初の状態) */
  cityState(city: City): CityState {
    return this.cityStates[city.id] ?? initialCityState(city);
  }

  /** 城壁と城門の損傷は、日数をかけて少しずつ直る(修復に資金がかかる仕組みは、まだ無い) */
  private repairCities(): void {
    for (const [id, state] of Object.entries(this.cityStates)) {
      // 過密(Version 51):人口の6%を超える兵がいる都市は、治安・繁栄が平常の値まで戻らない(過密の度合いで、戻る上限が下がる)
      const pop = state.pop ?? 0;
      const crowd = pop > 0 ? Math.max(0, state.garrison - pop * 0.06) / pop : 0;
      // 上限を超えているときは、急に下げず、少しずつ下がる
      const toward = (v: number, cap: number, step: number): number => (v > cap ? Math.max(cap, v - step) : Math.min(cap, v + step));
      if (state.prosperity !== undefined) state.prosperity = toward(state.prosperity, 100 - Math.min(30, crowd * 30), 0.05);
      if (state.order !== undefined) state.order = toward(state.order, 70 - Math.min(25, crowd * 25), 0.1);
      state.wallDamage = Math.max(0, state.wallDamage - 0.004);
      state.gateDamage = Math.max(0, state.gateDamage - 0.01);
      // 兵糧が尽きた国の都市では、守備兵の士気は戻らない(Version 51)
      const owner = scenario.cityOwners[id];
      if (!owner || (this.factionStates[owner]?.grain ?? 1) > 0) state.morale = Math.min(70, state.morale + 0.5);
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
    // 大軍団(Version 51):2万人を超えると、道が混み、行軍が遅くなる。統率の高い指揮官ほど、遅れは小さい。
    // 山地では、さらに遅い(狭い道を長い列で進む)
    const n = total;
    if (n > 20000) {
      const lead = personById(s.army.commanderId)?.leadership ?? 0;
      const slow = ((n - 20000) / 150000) * (1.2 - lead / 125) * (kind === "mountain" || kind === "highMountain" ? 1.5 : 1);
      k *= Math.max(0.55, 1 - slow);
    }
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

  /**
   * 指やマウスで描いた線から、経路を作る(Version 41)。描いた線を経由点に分け、経由点どうしを
   * 通れる地形の最短経路(川・山・関所・敵の拠点を考える)でつなぐ。通れない経由点は飛ばす。最後の点は目的地。
   */
  planRouteVia(armyId: string, waypoints: RoutePoint[]): Route | null {
    const s = this.stateOf(armyId);
    if (!s || !waypoints.length) return null;
    const closed = this.closedFor(s.army);
    let from: RoutePoint = { lon: s.army.lon, lat: s.army.lat };
    const out: Route = { points: [], km: 0, effort: [] };
    const last = waypoints.length - 1;
    for (let i = 0; i <= last; i++) {
      let seg: Route | null = null;
      if (i === last) {
        for (const spot of this.freeSpots(waypoints[i], s).slice(0, 12)) {
          seg = findRoute(this.grid, from, spot, closed);
          if (seg && seg.points.length >= 2) break;
          seg = null;
        }
        if (!seg) return out.points.length >= 2 ? { ...out, intent: out.points[out.points.length - 1] } : null;
      } else seg = findRoute(this.grid, from, waypoints[i], closed);
      if (!seg || seg.points.length < 2) continue;
      const base = out.effort.length ? out.effort[out.effort.length - 1] : 0;
      const skip = out.points.length ? 1 : 0;
      for (let k = skip; k < seg.points.length; k++) {
        out.points.push(seg.points[k]);
        out.effort.push(base + seg.effort[k] - seg.effort[0]);
      }
      out.km += seg.km;
      from = seg.points[seg.points.length - 1];
    }
    if (out.points.length < 2) return null;
    out.intent = { ...waypoints[last] };
    return out;
  }

  /**
   * 経路の食糧の見積もり(Version 41)。行軍の日ごとの消費(dailyUpkeep と同じ式:補給の届く所では+0.5、
   * 届かない所では-1、砂漠の補給なしは-1.2、冬の高山は-0.5)を、経路に沿って足し合わせる。
   */
  estimateRoute(armyId: string, route: Route): { days: number; foodUse: number; foodLeft: number; unsuppliedDays: number } {
    const s = this.stateOf(armyId);
    const days = s ? Math.max(1, Math.ceil(this.daysFor(s, route))) : 0;
    if (!s) return { days, foodUse: 0, foodLeft: 0, unsuppliedDays: 0 };
    const total = route.effort[route.effort.length - 1] || 1;
    const month = this.calendar().month;
    let food = s.army.food;
    let use = 0;
    let unsupplied = 0;
    for (let d = 0; d < days; d++) {
      const e = (total * (d + 0.5)) / days;
      let k = route.effort.findIndex((x) => x >= e);
      if (k < 1) k = Math.max(1, k === -1 ? route.points.length - 1 : 1);
      const a = route.points[k - 1], b = route.points[k];
      const t = route.effort[k] > route.effort[k - 1] ? (e - route.effort[k - 1]) / (route.effort[k] - route.effort[k - 1]) : 0;
      const pt = { lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t };
      const supplied = this.nearFriendlyCity({ ...s, army: { ...s.army, lon: pt.lon, lat: pt.lat } });
      const kind = this.grid.kindAt(pt.lon, pt.lat);
      let delta = supplied ? 0.5 : -1;
      if (!supplied && kind === "desert") delta -= 1.2;
      if (kind === "highMountain" && (month >= 11 || month <= 2)) delta -= 0.5;
      if (!supplied) unsupplied++;
      if (delta < 0) use -= delta;
      food = Math.max(0, Math.min(FOOD_CAP, food + delta));
    }
    return { days, foodUse: Math.round(use), foodLeft: Math.round(food), unsuppliedDays: unsupplied };
  }

  /** 退却:いちばん近い自国の都市へ(Version 41) */
  planRetreat(armyId: string): Route | null {
    const s = this.stateOf(armyId);
    if (!s) return null;
    const mine = this.cities.filter((c) => scenario.cityOwners[c.id] === s.army.factionId).sort((a, b) => distanceKm(a, s.army) - distanceKm(b, s.army));
    for (const c of mine.slice(0, 4)) {
      const r = this.planRoute(armyId, { lon: c.lon, lat: c.lat });
      if (r) return r;
    }
    return null;
  }

  /** 経路に沿って行軍を始める */
  orderMove(armyId: string, route: Route): void {
    const s = this.stateOf(armyId);
    if (!s) return;
    this.withdraw(s);
    // 新しい移動の命令は、帰城・結合の命令を取り消す(帰城・結合は、この関数のあとで付け直す)
    this.clearArmyOp(s);
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
    this.clearArmyOp(s);
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
      this.tidyOfficers();
      this.tickArmyOps();
      this.tickTravels();
      this.tickAutoSieges();
      this.repairCities();
      if ((d + 1) % 30 === 0) {
        this.trade.monthly();
        this.collectIncome();
        this.trimEvents();
        this.loyalty.monthly();
        // 捕虜の記録の整合(Version 42):本人が捕虜・保護下でない(健在・死亡)のに残る記録を片づける
        // (Version 51:根の原因を直した。この片づけは安全策として残し、直した件数を数える)
        for (let i = this.spoils.custody.length - 1; i >= 0; i--) {
          const id = this.spoils.custody[i].personId;
          const dupe = this.spoils.custody.findIndex((x) => x.personId === id) !== i;
          if (dupe || !["captured", "protected"].includes(this.personStatus(id))) {
            this.custodyRepairs.push({ day: Math.floor(this.day), personId: id, status: dupe ? "二重の記録" : this.personStatus(id) });
            this.spoils.custody.splice(i, 1);
          }
        }
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
        this.vacatePosts(id);
      },
      (id) => this.personStatus(id));
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
  private readonly initialNames = new Map(scenario.factions.map((f) => [f.id, f.name]));

  /** 国号の中の君主の名(「漢(劉淵)」の「劉淵」)を、新しい君主の名に直す(Version 42。セーブに残す) */
  private renameForRuler(f: Faction, oldName: string, newName: string): void {
    if (!f.name.includes(`(${oldName})`)) return;
    f.name = f.name.replace(`(${oldName})`, `(${newName})`);
    (this.dynasty.names ??= {})[f.id] = f.name;
  }
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
    this.capitals[id] = { cityId: base.city.id, certainty: "ゲーム中の建国", note: `${p.name}が${base.city.name}で自立` };
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
    this.seedTreasury(id);
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
    this.renameForRuler(f, old.name, next.p.name);
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
      this.dropOfficer(s.army, personId);
    }
    for (const c of this.cities) if (governorIdOf(c, this.cityStates[c.id]) === personId) this.cityStates[c.id] = { ...this.cityState(c), governorId: null };
    this.spoils.release(personId);
    const label = { illness: "病死", old_age: "老衰", battle: "戦死", execution: "処刑", assassination: "暗殺", suicide: "自害", unknown: "不明" }[cause] ?? cause;
    if (p.role === "ruler" || (this.loyalty.fame[personId] ?? 0) >= 60) this.addNews(`${factionName(p.factionId)}の${p.name}が亡くなりました(${label}${p.fictional ? "" : p.died ? `。史実では${p.died}年に没` : ""})`);
  }

  /** 都市の持ち主を変える(歴史の事件などで使う。太守は外す) */
  transferCity(cityId: string, to: string): void {
    const city = this.cities.find((c) => c.id === cityId);
    if (!city) return;
    const prev = scenario.cityOwners[cityId];
    const wasCapital = !!prev && this.capitals[prev]?.cityId === cityId;
    scenario.cityOwners[cityId] = to;
    const g = personById(governorIdOf(city, this.cityStates[cityId]) ?? undefined);
    if (g && g.factionId !== to) this.cityStates[cityId] = { ...this.cityState(city), governorId: null };
    this.listener.onCityCaptured(cityId, to);
    // 首都を事件や割譲で失った国は、残る都市へ都を移す(Version 41:歴史の事件と首都を結びつける)
    if (wasCapital && prev && prev !== to && !this.capitalFallPending) {
      const next = this.cities.filter((c) => c.kind !== "pass" && scenario.cityOwners[c.id] === prev).sort((a, b) => cityLevelOf(b) - cityLevelOf(a) || distanceKm(a, city) - distanceKm(b, city))[0];
      if (next) this.moveCapital(prev, next.id, `${city.name}を失ったため`);
      else delete this.capitals[prev];
    }
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
    this.capitals[id] = { cityId, certainty: "ゲーム中の建国", note: `${p.name}が${city.name}で${state}を建てる` };
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
    this.seedTreasury(id);
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
    this.renameForRuler(f, old.name, next.name);
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
    { const i = this.spoils.custody.findIndex((x) => x.personId === old.id); if (i >= 0) this.spoils.custody.splice(i, 1); }
    this.vacatePosts(old.id); // 指揮官・副将・配下武将・太守の任を外す(Version 51:副将が残る不具合を直した)
    this.setRole(usurper.id, "ruler");
    f.ruler = usurper.name;
    this.dynasty.rulers[factionId] = usurper.name;
    this.renameForRuler(f, old.name, usurper.name);
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
    // 都市を分ける:近い後継国家(600km以内)へ。どこにも近くなければ、捕らえた勢力か近くの国へ
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
    const myCities = this.cities.filter((c) => scenario.cityOwners[c.id] === factionId);
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
      if (best) return best;
      // 遠い都市は、無条件に捕らえた勢力のものにしない(Version 41):捕らえた勢力の都市が400km以内に無ければ、
      // 近くの国(400km以内)へ降る。どこも無ければ、捕らえた勢力へ降る
      const near = (g: string): number => Math.min(Infinity, ...this.cities.filter((k) => scenario.cityOwners[k.id] === g && !myCities.includes(k)).map((k) => distanceKm({ lon, lat }, k)));
      if (fallback && near(fallback) <= 400) return fallback;
      const other = scenario.factions.filter((g) => g.id !== factionId && !g.fallen && !this.dynasty.fallen[g.id] && g.id !== this.playerFactionId).map((g) => ({ g: g.id, d: near(g.id) })).filter((x) => x.d <= 400).sort((a, b) => a.d - b.d)[0];
      return other?.g ?? fallback;
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
      if (s.base.city && scenario.cityOwners[s.base.city.id] === newIds[i]) this.capitals[newIds[i]] = { cityId: s.base.city.id, certainty: "ゲーム中の建国", note: `${f.name}の滅亡ののち、${s.p.name}が${s.base.city.name}で自立` };
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
        this.vacatePosts(p.id);
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
    for (const id of newIds) this.seedTreasury(id);
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
      f.name = this.initialNames.get(f.id) ?? f.name;
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
    for (const [id, nm] of Object.entries(d.names ?? {})) {
      const f = scenario.factions.find((y) => y.id === id);
      if (f) f.name = nm;
    }
    this.dynasty = { added: d.added.map((f) => ({ ...f })), fallen: { ...d.fallen }, roles: { ...d.roles }, rulers: { ...d.rulers }, names: { ...(d.names ?? {}) } };
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
      // 攻城戦は、戦略マップの上で包囲の日数をかけて決着する(Version 42)。見積もりの日数のあいだ、包囲が続く
      if (event.battleType === "siege_battle" && event.autoSiegeUntil === undefined) {
        const est = autoResolve(setup);
        event.autoSiegeUntil = Math.floor(this.day) + Math.max(3, Math.min(60, est.siege?.days ?? 7));
        event.status = "in_progress";
        this.addNews(`${setup.attacker.name}が${event.location.name}を包囲しました(落とすまで約${event.autoSiegeUntil - Math.floor(this.day)}日の見込み)`);
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

  /** 包囲の日数が過ぎた自動の攻城戦を、いまの状態(着いた救援軍を含む)で決着させる(Version 42) */
  private tickAutoSieges(): void {
    const day = Math.floor(this.day);
    for (const ev of this.events.filter((e) => e.autoSiegeUntil !== undefined && e.status === "in_progress")) {
      const att = this.stateOf(ev.attackerArmyId);
      // 攻める側の軍団が消えた・持ち主が変わった・戦争でなくなった:包囲は解ける
      const owner = ev.defenderCityId ? scenario.cityOwners[ev.defenderCityId] : undefined;
      if (!att || !owner || owner !== ev.defenderFactionId || !this.atWar(att.army.factionId, owner)) {
        ev.status = "cancelled";
        if (att) this.setStatus(att, "camping");
        for (const sup of ev.supporters ?? []) {
          const s = this.stateOf(sup.armyId);
          if (s && s.status === "fighting") this.setStatus(s, "camping");
        }
        continue;
      }
      if (day < ev.autoSiegeUntil!) continue;
      ev.status = "pending";
      this.pendingAuto.push(ev);
    }
    if (this.pendingAuto.length) this.resolveAutoBattles();
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
    // 攻城戦の救援軍(Version 41):包囲された都市の近く(約0.8度)にいる、守る側の国と同盟国の手の空いた軍団が、城の救援に加わる
    if (!defender && event.defenderCityId) {
      const city = this.cities.find((c) => c.id === event.defenderCityId);
      for (const o of this.armies) {
        if (!city || used.has(o.army.id) || o.status === "fighting" || totalTroops(o.army) <= 0) continue;
        const km = distanceKm(o.army, city);
        if (km > 80) continue;
        const own = o.army.factionId === event.defenderFactionId;
        const ally = ["alliance", "vassal"].includes(this.relationOf(o.army.factionId, event.defenderFactionId));
        if ((!own && !ally) || !this.hostileTo(o.army, event.attackerFactionId)) continue;
        const efficiency = own ? 1 : 0.8;
        // 到着の時刻と妨害(Version 42:手動・自動の攻城戦で同じ決まり)。道は地形を考えた経路で測る
        const path = findRoute(this.grid, { lon: o.army.lon, lat: o.army.lat }, city);
        const effort = path ? path.effort[path.effort.length - 1] : km * 1.3;
        const blocker = path ? this.armies.find((x) => x.army.id !== attacker.army.id && this.hostileTo(x.army, event.defenderFactionId) && x.army.factionId !== event.defenderFactionId
          && path.points.some((pt) => distanceKm(pt, city) > 30 && distanceKm(pt, x.army) < 20)) : undefined;
        if (blocker) {
          this.addNews(`${o.army.name}は${city.name}の救援に向かおうとしましたが、${blocker.army.name}に道を阻まれました`);
          (event.reliefBlocked ??= []).push({ armyId: o.army.id, by: blocker.army.id });
          continue;
        }
        (event.supporters ??= []).push({ side: "defender", armyId: o.army.id, efficiency, relief: true, km: Math.round(km), arriveSec: reliefArrivalSeconds(effort) });
        used.add(o.army.id);
        o.route = null;
        this.setStatus(o, "fighting");
      }
    }
    for (const [side, main, mine, foe] of sides) {
      if (!main) continue; // 都市の守りへの加勢は、上の救援軍として扱う
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
      // 3Dの攻城戦の救援軍は、部隊ごとの結果を使う。自動戦闘や野戦の加勢は、陣営の損害の割合で分ける
      const exact = sup.relief ? result.relief?.[sup.armyId] : undefined;
      for (const k of ["infantry", "cavalry", "archer"] as const) {
        const rate = r.before[k] > 0 ? r.after[k] / r.before[k] : 1;
        after[k] = Math.max(0, Math.min(s.army.troops[k], exact ? exact.after[k] : Math.round(s.army.troops[k] * rate)));
        r.before[k] = Math.max(0, r.before[k] - s.army.troops[k]);
        r.after[k] = Math.max(0, r.after[k] - after[k]);
      }
      s.army.troops = after;
      s.army.morale = exact ? exact.morale : r.morale;
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
      // 損失の内訳(Version 40.1):会戦で失った兵を、敗走・撤退した側とそれ以外に分けて数える(兵糧不足の消耗とは別)
      {
        const lost = Math.max(0, totalTroops({ troops: r.before } as Army) - totalTroops({ troops: r.after } as Army));
        const cause = r.outcome === "routed" || r.outcome === "retreated" || r.outcome === "annihilated" ? "会戦で敗走・撤退した側の損失" : "会戦の損失(勝ち・引き分け・持ちこたえた側)";
        this.addLoss(a.factionId, cause, lost);
      }
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
        // 兵種の内訳も残す(Version 51)
        garrisonMix: { cavalry: Math.max(0, Math.round(d.after.cavalry)), archer: Math.max(0, Math.round(d.after.archer)) },
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
      // 首都の陥落:君主の捕縛・脱出の判定(君主が太守を兼ねていても、この判定で決める)
      const def = event.defenderFactionId;
      // 歴史の事件の攻城戦で、事件に陥落の決まりがあれば、首都でなくても、その決まりで君主の捕縛を扱う(Version 42)
      const histRule = event.histId ? this.history?.def(event.histId)?.fallRule : undefined;
      const cap = result.siege.captured && (this.isCapital(city.id) || !!histRule) && scenario.cityOwners[city.id] === def ? this.capitalFallen(def, city, event.attackerFactionId, event.battleId, governorId, histRule) : null;
      const rulerGov = !!cap?.rulerId && governorId === cap.rulerId;
      if (!rulerGov) this.recordFate(governorId, d.commander);
      if (d.commander === "killed" || d.commander === "captured") state.governorId = null;
      if (cap?.rulerCaptured && !rulerGov && cap.rulerId) {
        this.recordFate(cap.rulerId, "captured");
        this.spoils.addCaptive(cap.rulerId, event.attackerFactionId, def, Math.floor(this.day));
      }
      if (result.siege.captured) {
        // 落城:攻撃側の勢力のものになる。守備隊は、仮に攻撃側の兵から1,000人を置いたものとする(軍団の兵力は減らさない)
        state.garrison = 1000;
        delete state.garrisonMix;
        state.morale = 60;
        // 太守の運命(君主が太守のときは、首都の陥落の判定に従う:捕虜か脱出)
        const govFate = rulerGov ? (cap!.rulerCaptured ? "captured" : "escaped") : d.commander === "killed" ? "killed" : "captured";
        if (govFate !== "escaped") this.recordFate(governorId, govFate);
        state.governorFate = "healthy"; // 新しい持ち主のもとでは、太守はまだいない
        state.governorId = null;
        // 名声と忠誠:攻め落とした指揮官は名声が上がり、都市を失った側の人々は忠誠が下がる
        if (ca) this.loyalty.addFame(ca, 5);
        for (const p of persons.filter((x) => x.factionId === event.defenderFactionId && x.role !== "ruler")) this.loyalty.add(p.id, -2, `${city.name}の喪失`);
        // 戦利品:その場にいた人物と、蔵の名品を調べる(持ち主が変わる前に)
        const pc = this.spoils.onCityCaptured(city, event.attackerFactionId, event.defenderFactionId, govFate === "escaped" ? undefined : governorId ?? undefined, govFate === "escaped" ? "captured" : govFate,
          Math.max(result.siege.wallDamage, result.siege.gateDamage), Math.floor(this.day), (id) => this.personStatus(id), (id) => this.presentAt(id, city.id));
        this.cityStates[city.id] = state;
        this.listener.onCityCaptured(city.id, event.attackerFactionId);
        this.handleCapture(pc);
        if (cap) this.capitalAftermath(def, event.battleId);
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
    // 歴史の会戦の結果:都市の持ち主・人物・首都の処理がすべて終わってから読む(Version 42:持ち主が変わる前に読んで、
    // 「洛陽は持ちこたえた」と誤る不具合を直した)
    this.history?.onBattle(event, result);
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
    // 大軍団の補給の負担(Version 51):3万人を超えると、補給の届かない所では食糧の減りが速く、補給の届く所でも蓄えの戻りが遅い
    const big = Math.max(0, totalTroops(a) - 30000) / 60000;
    if (marching) {
      // 補給の届く範囲の行軍は、道中で補給を受ける(Version 40:味方の領内の長い山道で飢えないように)
      a.food += s.supplied ? 0.5 / (1 + big) : -1 * (1 + Math.min(1, big * 0.5));
      a.fatigue += 3 * Math.min(2, this.grid.costAt(a.lon, a.lat) || 1);
    } else {
      a.fatigue -= 8;
      // 味方の都市の近くなら補給を受ける。離れていれば、現地調達で消費を半分に抑える
      a.food += s.supplied ? 3 / (1 + big) : -0.5 * (1 + Math.min(1, big * 0.5));
    }
    a.food = Math.max(0, Math.min(FOOD_CAP, a.food));
    a.fatigue = Math.max(0, Math.min(100, a.fatigue));

    if (a.food <= 0) {
      a.morale -= 5;
      // 補給の届く範囲では、兵糧が尽きても兵は飢えて逃げない(冬の高山の行軍で、補給と消費が釣り合ったときなど)
      if ((a.morale < 35 || kind === "desert") && !s.supplied) {
        // 食糧が尽きたまま士気が下がると、兵が逃げ出す。砂漠では、渇きで士気に関係なく兵を失う
        const before = totalTroops(a);
        for (const k of Object.keys(a.troops) as UnitTypeId[]) a.troops[k] = Math.floor(a.troops[k] * (kind === "desert" ? 0.95 : 0.97));
        this.logistics.attrition[a.factionId] = (this.logistics.attrition[a.factionId] ?? 0) + before - totalTroops(a);
        // 兵糧不足の消耗の内訳:呂光の遠征 / 砂漠 / 山岳 / それ以外。撤退中かどうかも分ける(1日に1回だけ数える)
        const lv = a.commanderId === "lv_guang" || /西域遠征/.test(a.name);
        const retreating = this.strategy.opOf(a.id)?.status === "retreating";
        const where = lv ? "呂光の西域遠征(兵糧・水の不足)" : kind === "desert" ? "砂漠での兵糧・水の不足" : kind === "highMountain" || kind === "mountain" || kind === "hill" ? "山岳での兵糧不足" : "平地での兵糧不足";
        this.addLoss(a.factionId, `${where}${retreating && !lv ? "(撤退中)" : ""}${s.supplied ? "(補給範囲内)" : ""}`, before - totalTroops(a));
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
