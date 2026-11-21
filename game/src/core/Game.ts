// ゲーム全体のまとめ役。地形・都市・軍団・カメラ・入力・画面表示と、進行の計算(sim)をつなぐ。
import * as THREE from "three";
import { MapCamera, type WorldRect } from "../camera/MapCamera";
import { passes, extraBarriers, armies as armyData, factionById, factionOfCity, initialCityOwners, officerById, personById, persons, regions, resolveCityLayout, scenario, scenarioCatalog, totalTroops } from "../data";
import type { Difficulty } from "../battle/ai";
import { BattleScreen } from "../battle/BattleScreen";
import type { BattleResult } from "../battle/types";
import type { BattleEvent, BattleSetup, City, Person } from "../data/types";
import { InputController } from "../input/InputController";
import { compareSides, createBattleSetup, placeName, playerSideOf } from "../sim/battle";
import { Campaign, type ArmyState } from "../sim/Campaign";
import type { Route } from "../sim/pathfinding";
import { migrateSave, SAVE_VERSION, type CitySave, type GameSettings, type SaveData } from "../sim/save";
import { TerrainGrid } from "../sim/TerrainGrid";
import { Territory } from "../sim/Territory";
import { ArmyLabels } from "../ui/ArmyLabels";
import { ArmyPanel, type ArmyPanelMode } from "../ui/ArmyPanel";
import { BattlePrep } from "../ui/BattlePrep";
import { CityLabels } from "../ui/CityLabels";
import { InfoPanel } from "../ui/InfoPanel";
import { DiplomacyScreen } from "../ui/DiplomacyScreen";
import { CourtScreen } from "../ui/CourtScreen";
import { PalaceScreen } from "../palace/PalaceScreen";
import { PalaceHud } from "../ui/PalaceHud";
import { AREA_LABEL } from "../sim/palace";
import { EventsScreen } from "../ui/EventsScreen";
import { HistoryEventScreen, TimelineScreen } from "../ui/HistoryScreen";
import { autoResolve, estimateWinRate } from "../sim/autoBattle";
import { governorIdOf } from "../sim/battle";
import { PersonScreen } from "../ui/PersonScreen";
import { FinanceScreen } from "../ui/FinanceScreen";
import type { DevKind } from "../sim/economy";
import { SpoilsScreen } from "../ui/SpoilsScreen";
import { ScenarioScreen } from "../ui/ScenarioScreen";
import { FactionSelect } from "../ui/FactionSelect";
import { Highlights } from "../world/Highlights";
import { Bgm, BGM_LABEL, type BgmScene } from "../audio/Bgm";
import { strategyRules } from "../sim/strategy";
import { AUTO_SLOT, SaveMenu } from "../ui/SaveMenu";
import { SaveStore } from "./saveStore";
import { Armies, type ArmyMarker } from "../world/Armies";
import { Cities, type CityMarker } from "../world/Cities";
import { Roads } from "../world/Roads";
import { RouteLine } from "../world/RouteLine";
import { Terrain, type TerrainPad } from "../world/Terrain";
import { HAZE_COLOR } from "../world/terrainMaterial";
import { TerritoryTexture } from "../world/territoryTexture";
import { toLonLat, toWorld, UNITS_PER_DEGREE } from "./geo";

/** 指で押しやすいように、都市や軍団の周りこの距離(ピクセル)までをタップ範囲にする */
const PICK_RADIUS = 34;
/** 選んだ都市や軍団へカメラを寄せるのにかける時間(ミリ秒) */
const GLIDE_MS = 600;
/** 時間の進む速さ(倍率)。停止は、別のボタンで切り替える */
const RATES = [1, 2, 4, 8];
/** 何日ごとにオートセーブするか */
const AUTOSAVE_DAYS = 10;

/** 皇帝生活モードで、政治を重臣(AI)に任せているあいだの、操作勢力の代わりの印 */
const COURT_ID = "__court__";

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly mapCamera: MapCamera;
  private readonly cities = new Cities();
  private readonly armies: Armies;
  private readonly route: RouteLine;
  /** ゲームの進行(動作確認のために外からも見られるようにしてある) */
  readonly campaign: Campaign;
  private readonly grid: TerrainGrid;
  private readonly territory: Territory;
  private readonly territoryTexture: TerritoryTexture;
  /** 引けた街道の数(動作確認用) */
  roadCount = 0;
  roadsFailed: string[] = [];
  private territoryVisible = true;
  private territoryButton!: HTMLButtonElement;
  private readonly allCities: City[] = [];
  private readonly labels: CityLabels;
  private readonly armyLabels: ArmyLabels;
  private readonly panel: InfoPanel;
  private readonly armyPanel: ArmyPanel;
  private readonly battlePrep: BattlePrep;
  /** 会戦準備画面で開いている戦闘のID */
  private openBattleId: string | null = null;
  /** 知らせに出している戦闘のID(「会戦準備へ」で開く) */
  private noticeBattleId: string | null = null;
  /**
   * 次段階の3D戦闘へ引き継ぐ、会戦の設定。「戦闘開始」を押すと入る。
   * (動作確認のために外からも見られるようにしてある)
   */
  battleSetup: BattleSetup | null = null;
  /** 進行中の3D会戦(戦略マップを表示しているときは null) */
  battle: BattleScreen | null = null;
  /** 敵AIの難易度(easy / normal / hard) */
  difficulty: Difficulty = "normal";
  private selected: CityMarker | null = null;
  private selectedArmy: ArmyMarker | null = null;
  /** 軍団パネルの段階(通常 / 移動先を選んでいる / 経路を確認している) */
  private mode: ArmyPanelMode = "info";
  /** 確認中の経路(「確定」を押すと、この経路で行軍を始める) */
  private pendingRoute: Route | null = null;
  /** 皇帝生活モード(3Dの後宮)の画面と欄 */
  private palaceScreen: PalaceScreen | null = null;
  private palaceHud: PalaceHud | null = null;
  /** 確認待ちの帰城先(Version 51) */
  private pendingReturn: string | null = null;
  private input!: InputController;
  /** 描いている経路の点(Version 41) */
  private drawPts: { lon: number; lat: number }[] = [];
  /** 時間の進む倍率(停止していないときの値) */
  private rate = 1;
  /** 操作する勢力(null なら制限なし) */
  private playerFactionId: string | null = null;
  /** 自分の国が滅びたとき、どうするか */
  private onFall: "gameover" | "continue" = "gameover";
  private personScreen!: PersonScreen;
  private eventsScreen!: EventsScreen;
  private readonly histRoutes: RouteLine[] = [];
  private readonly histMarks = new THREE.Group();
  /** 交易路・補給範囲の表示 */
  private readonly overlayGroup = new THREE.Group();
  /** 地図の上の強調(勢力の選択・イベントの変化) */
  private highlights!: Highlights;
  private factionSelect!: FactionSelect;
  /** 場面ごとの音楽(Version 41) */
  readonly bgm = new Bgm();
  private bgmTick = 0;
  /** 起動してから、操作する勢力(または観賞・編集モード)を選んだか */
  private factionChosen = false;
  /** 戦略マップの道すじ(会戦の戦場に道を描く。Version 42) */
  private roadLines: { lon: number; lat: number }[][] = [];
  /** 首都の表示を作り直す必要があるか(都市の持ち主が変わったとき) */
  private capitalsStale = true;
  private readonly overlayRoutes: RouteLine[] = [];
  private overlayMode: "trade" | "supply" | null = null;
  private histHeight: (lon: number, lat: number) => number = () => 0;
  /** 皇室の画面を開く(人物を渡すと、その人物の家系図) */
  private openCourt: (personId?: string) => void = () => undefined;
  private spoilsScreen?: SpoilsScreen;
  private territoryOpacity = 1;
  /** セーブデータの保存先(動作確認のために外からも見られるようにしてある) */
  readonly saves = new SaveStore();
  private menu!: SaveMenu;
  private lastAutosaveDay = 0;
  private lastFrame = performance.now();
  private width = 1;
  private height = 1;
  /** 画面を描き直す必要があるか。動きがないときは描かず、電池を節約する */
  private dirty = true;
  /** 選んだ都市や軍団へカメラを寄せている途中の情報 */
  private glide: {
    fromX: number; fromZ: number; fromD: number; toX: number; toZ: number; toD: number; start: number;
  } | null = null;

  /** 地形ファイルを読み込んでからゲームを始める */
  static async create(root: HTMLElement): Promise<Game> {
    const terrains = await Promise.all(
      regions.map((region) => {
        // 3D都市を建てる場所は、あらかじめ地面を平らにしておく
        const pads: TerrainPad[] = [];
        for (const city of region.cities) {
          const layout = resolveCityLayout(city);
          pads.push({ lon: city.lon, lat: city.lat, radius: Math.hypot(...layout.size) / 2 + 0.25 });
        }
        return Terrain.create(region, pads);
      }),
    );
    return new Game(root, terrains);
  }

  private constructor(private readonly root: HTMLElement, private readonly terrains: Terrain[]) {
    const canvas = root.querySelector("#map") as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // 影は会戦の戦場でだけ使う(戦略マップには影を落とす光がないので、負荷は増えない)
    this.renderer.shadowMap.enabled = true;
    this.scene.background = HAZE_COLOR;

    // 都市の建物や兵士用の光(地形の陰影は world/terrainMaterial.ts が自分で計算する)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x54483a, 1.5));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.position.set(-60, 80, -40);
    this.scene.add(sun);

    // 地域ごとに地形を作り、その上に都市を置く
    const limits: WorldRect = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const terrain of terrains) {
      const region = terrain.region;
      this.scene.add(terrain.mesh);
      for (const city of region.cities) {
        this.allCities.push(city);
        this.cities.add(city, factionOfCity(city.id), (lon, lat) => terrain.heightAt(lon, lat));
      }
      const b = region.info.bounds;
      const nw = toWorld(b.west, b.north);
      const se = toWorld(b.east, b.south);
      limits.minX = Math.min(limits.minX, nw.x);
      limits.maxX = Math.max(limits.maxX, se.x);
      limits.minZ = Math.min(limits.minZ, nw.z);
      limits.maxZ = Math.max(limits.maxZ, se.z);
    }
    this.scene.add(this.cities.group);

    // 進軍の計算用の地形のマス(いまは地域が1つなので、その地域の分だけ作る)
    this.grid = new TerrainGrid(terrains[0].field, terrains[0].region.crossings, passes, extraBarriers, terrains[0].region.cities.filter((c) => c.kind !== "pass"));

    // 街道:都市をつなぐ道を引く。道の上は進軍が速くなる
    const roads = new Roads(terrains[0].region.roads, this.allCities, this.grid, (lon, lat) => terrains[0].heightAt(lon, lat));
    this.scene.add(roads.group);
    this.roadCount = roads.count;
    this.roadsFailed = roads.failed;
    this.roadLines = roads.lines;

    // 領土:都市の所属から計算し、地形に重ねて表示する
    this.territory = new Territory(this.grid);
    this.territoryTexture = new TerritoryTexture(this.grid);
    terrains[0].setTerritoryTexture(this.territoryTexture.texture, this.territoryTexture.width);
    this.refreshTerritory();
    const territoryButton = root.querySelector("#territory-toggle") as HTMLButtonElement;
    territoryButton.addEventListener("click", () => {
      this.territoryVisible = !this.territoryVisible;
      territoryButton.setAttribute("aria-pressed", String(this.territoryVisible));
      this.terrains[0].setTerritoryVisible(this.territoryVisible);
      this.dirty = true;
    });
    terrains[0].setTerritoryVisible(true);
    this.territoryButton = territoryButton;

    // 軍団と経路の表示
    const heightAt = (lon: number, lat: number): number => {
      const { x, z } = toWorld(lon, lat);
      return this.groundHeight(x, z);
    };
    this.armies = new Armies(heightAt);
    this.route = new RouteLine(heightAt);
    this.scene.add(this.armies.group, this.route.group);
    // 歴史の事件の地図表示:関係する軍団の進軍経路(国ごとの色)・戦場の印・関係都市の印
    this.histHeight = heightAt;
    // 予測の経路(薄い色)と、確定した命令の経路(濃い色)を分けて描く
    for (const color of [0xe2705c, 0x6fa8dc, 0x9fd28a, 0xf0b0a0, 0xb8d4ee, 0xcde8c2]) {
      const r = new RouteLine(heightAt, color);
      this.histRoutes.push(r);
      this.scene.add(r.group);
    }
    this.overlayGroup.visible = false;
    this.scene.add(this.overlayGroup);
    this.highlights = new Highlights(heightAt);
    this.scene.add(this.highlights.group);
    this.histMarks.visible = false;
    this.scene.add(this.histMarks);
    this.armyLabels = new ArmyLabels(root.querySelector("#labels") as HTMLElement);

    // ゲームの進行。状態が変わるたびに、表示を合わせる
    this.campaign = new Campaign(this.grid, armyData, this.allCities, {
      onArmyMoved: (state) => {
        const marker = this.armies.markerOf(state.army.id);
        if (marker) this.armies.place(marker);
        this.dirty = true;
      },
      onArmyChanged: (state, statusChanged) => this.onArmyChanged(state, statusChanged),
      onBattleEvent: (event) => this.showBattleEvent(event),
      onDayChanged: () => this.onDayChanged(),
      onCityCaptured: (cityId, factionId) => this.setCityOwner(cityId, factionId),
      onFactionFallen: (info) => this.onFactionFallen(info),
      onCapitalChanged: () => (this.capitalsStale = true),
      // 歴史の事件で変わった所を、地図の上でしばらく光らせる(得たものは金、失ったもの・戦いは朱)
      onEventChanges: (_id, diff) => {
        for (const ch of diff.changes) {
          if (ch.lon === undefined || ch.lat === undefined) continue;
          this.highlights.add(ch.lon, ch.lat, ch.tone === "loss" ? "#d4634e" : ch.tone === "gain" ? "#e8c25a" : "#efe6d0", 25, ch.kind === "state" || ch.kind === "capital" ? 2.4 : 1.6);
        }
        this.dirty = true;
      },
      onCapturePending: (pc) => {
        this.spoilsScreen?.showCapture(pc);
        this.syncSpeedButton();
      },
      onNews: (text) => {
        // 会戦の知らせ(「会戦準備へ」のボタンつき)を出している間は、上書きしない
        if ((this.root.querySelector("#event-open") as HTMLElement).hidden) this.showNotice(text);
      },
      onArmyAdded: (state) => {
        const marker = this.armies.add(state, factionById(state.army.factionId), officerById(state.army.commanderId));
        this.armyLabels.add(marker);
      },
      onArmyRemoved: (state) => {
        const marker = this.armies.markerOf(state.army.id);
        if (!marker) return;
        if (marker === this.selectedArmy) this.clearSelection();
        this.armyLabels.remove(marker);
        this.armies.remove(marker);
        this.dirty = true;
      },
    });
    for (const state of this.campaign.armies) {
      const marker = this.armies.add(state, factionById(state.army.factionId), officerById(state.army.commanderId));
      this.armyLabels.add(marker);
    }

    // 地図の外側が見えすぎないよう、見られる範囲を少しだけ内側にする(端に近い都市にも寄れる程度に)
    const insetX = (limits.maxX - limits.minX) * 0.06;
    const insetZ = (limits.maxZ - limits.minZ) * 0.06;
    limits.minX += insetX;
    limits.maxX -= insetX;
    limits.minZ += insetZ;
    limits.maxZ -= insetZ;

    // 最初は長安と洛陽のあたりを見る
    this.mapCamera = new MapCamera(limits, (x, z) => this.groundHeight(x, z));
    const start = toWorld(110.9, 35.1);
    this.mapCamera.target.set(start.x, 0, start.z);
    this.mapCamera.distance = 62;
    this.mapCamera.update();

    this.labels = new CityLabels(root.querySelector("#labels") as HTMLElement, this.cities.markers);
    this.panel = new InfoPanel(
      root.querySelector("#info") as HTMLElement,
      () => this.clearSelection(),
      (d) => this.selected && this.glideTo(this.selected.group.position, d),
    );
    this.armyPanel = new ArmyPanel(root.querySelector("#army") as HTMLElement, {
      onClose: () => this.clearSelection(),
      onMove: () => {
        // 操作する勢力を決めているときは、ほかの勢力の軍団には命令できない
        const owner = this.selectedArmy?.state.army.factionId;
        if (this.playerFactionId && owner !== this.playerFactionId) {
          this.showNotice(`${factionById(owner ?? "")?.name ?? "この勢力"}の軍団には命令できません(操作勢力:${factionById(this.playerFactionId)?.name})`);
          return;
        }
        this.setMode("pick", "移動先を地図の上でタップしてください");
      },
      onDraw: () => {
        const owner = this.selectedArmy?.state.army.factionId;
        if (this.playerFactionId && owner !== this.playerFactionId) {
          this.showNotice(`${factionById(owner ?? "")?.name ?? "この勢力"}の軍団には命令できません(操作勢力:${factionById(this.playerFactionId)?.name})`);
          return;
        }
        this.setMode("draw", "地図の上を指(マウス)でなぞって、進む道を描いてください。2本指で地図を動かせます");
      },
      onRetreat: () => {
        const s = this.selectedArmy?.state;
        if (!s) return;
        if (this.playerFactionId && s.army.factionId !== this.playerFactionId) return this.showNotice("ほかの勢力の軍団には命令できません");
        const route = this.campaign.planRetreat(s.army.id);
        if (!route) return this.showNotice("退却できる自国の都市への道が見つかりません");
        this.pendingRoute = route;
        this.route.show(route);
        this.setMode("confirm", `退却:${this.routeSummary(s.army.id, route)}`);
      },
      onReturn: () => this.openReturnChooser(),
      onMerge: () => this.openMergeChooser(),
      onConfirm: () => this.confirmMove(),
      onCancel: () => this.cancelMove(),
      onHalt: () => this.selectedArmy && this.campaign.halt(this.selectedArmy.state.army.id),
      onBattle: () => {
        const event = this.selectedArmy && this.campaign.openEventOfArmy(this.selectedArmy.state.army.id);
        if (event) this.openBattlePrep(event.battleId);
      },
    });
    this.battlePrep = new BattlePrep(root.querySelector("#battle") as HTMLElement, {
      onStart: (side) => this.startBattle(side),
      onAuto: (mode) => this.autoBattle(mode),
      onBack: () => this.closeBattlePrep(),
    });
    (root.querySelector("#event-open") as HTMLElement).addEventListener("click", () => {
      if (this.noticeBattleId) this.openBattlePrep(this.noticeBattleId);
    });

    // 日付と、時間の進め方(停止・再開と、速さの倍率)
    (root.querySelector("#clock-pause") as HTMLElement).addEventListener("click", () => {
      this.campaign.speed = this.campaign.speed === 0 ? this.rate : 0;
      this.syncSpeedButton();
    });
    (root.querySelector("#clock-speed") as HTMLElement).addEventListener("click", () => {
      this.rate = RATES[(RATES.indexOf(this.rate) + 1) % RATES.length];
      if (this.campaign.speed !== 0) this.campaign.speed = this.rate;
      this.syncSpeedButton();
    });
    this.syncSpeedButton();

    // メニュー(セーブ・ロード・設定)
    this.menu = new SaveMenu(root.querySelector("#menu") as HTMLElement, this.saves, {
      buildSave: () => this.buildSave(),
      applySave: (data) => this.applySave(data),
      settings: () => this.settings(),
      changeSettings: (change) => this.changeSettings(change),
      aiLog: () => this.campaign.strategy.log,
      setFps: (on) => this.setFpsMeter(on),
      openFactionSelect: () => this.openFactionSelect("change"),
      bgm: {
        state: () => this.bgm.state,
        setVolume: (v) => this.bgm.setVolume(v),
        setMuted: (m) => this.bgm.setMuted(m),
        label: (scene) => (scene ? BGM_LABEL[scene as BgmScene] ?? scene : "なし"),
      },
      aiSummary: () => {
        const t = this.campaign.strategy.totals();
        const top = (r: Record<string, number>): string => Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}${v}`).join("・") || "なし";
        return `計画${t.planned}・出兵${t.dispatched}・到着${t.arrived}・野戦${t.fieldBattles}・攻城${t.sieges}・占領${t.captures}・撤退${t.retreats}・宣戦${t.wars}・あなたの国への侵攻${t.vsPlayer}(攻城${t.vsPlayerSieges}・占領${t.vsPlayerCaptures})/見送りの理由:${top(t.notLaunched)}/中止の理由:${top(t.aborted)}`;
      },
    });
    for (const b of root.querySelectorAll<HTMLElement>(".menu-open")) {
      b.addEventListener("click", () => void this.menu.open());
    }
    // 人物の一覧と任命
    this.personScreen = new PersonScreen(root.querySelector("#persons") as HTMLElement, {
      campaign: () => this.campaign,
      playerFactionId: () => this.playerFactionId,
      onAppointed: () => this.refreshPosts(),
      openFamily: (id) => this.openCourt(id),
      focusPlace: (w) => {
        const army = w.armyId ? this.armies.markerOf(w.armyId) : undefined;
        if (army) return this.selectArmy(army);
        const city = this.cities.markers.find((m) => m.city.id === w.cityId);
        if (city) this.selectCity(city);
      },
    });
    (root.querySelector("#persons-open") as HTMLElement).addEventListener("click", () => this.personScreen.open());
    // シナリオの選択(メニューから開く。はじめて開いたときは、起動時にも出す)
    // 閉じたとき、まだ操作する勢力を選んでいなければ(起動したばかり)、勢力の選択へ進む
    const scenarios = new ScenarioScreen(root.querySelector("#scenarios") as HTMLElement, () => {
      if (!this.factionChosen && !navigator.webdriver) this.openFactionSelect("start");
    });
    (root.querySelector("#scenarios-open") as HTMLElement).addEventListener("click", () => {
      this.menu.close();
      scenarios.open();
    });
    // 勢力の選択(シナリオを選んだあと、操作する勢力を選んでから始める。Version 41)
    this.factionSelect = new FactionSelect(root.querySelector("#faction-select") as HTMLElement, {
      campaign: () => this.campaign,
      current: () => this.playerFactionId,
      preview: (id) => this.previewFaction(id),
      onChoose: (id) => {
        this.factionChosen = true;
        const fallen = this.campaign.gameOver;
        this.campaign.gameOver = false;
        (root.querySelector("#gameover") as HTMLElement).hidden = true;
        this.changeSettings({ playerFactionId: id });
        this.showNotice(id ? `${factionById(id)?.name}を操作します${fallen ? "(滅びた国から移りました)" : ""}。時間は止まっています。右上の再生で進めます` : "観賞・編集モードです(すべての国をAIが動かします)");
        if (id) {
          const cap = this.campaign.capitalCityOf(id);
          if (cap) this.glideTo(new THREE.Vector3(toWorld(cap.lon, cap.lat).x, 0, toWorld(cap.lon, cap.lat).z), 24);
        }
      },
    });
    // 自動テスト(navigator.webdriver)のときは、起動時には出さない
    if (!/[#&]s=/.test(location.hash) && !navigator.webdriver) scenarios.open();
    else if (!navigator.webdriver) this.openFactionSelect("start");
    // 外交と情勢
    const diplomacy = new DiplomacyScreen(root.querySelector("#diplomacy") as HTMLElement, {
      campaign: () => this.campaign,
      playerFactionId: () => this.playerFactionId,
      onChanged: () => (this.dirty = true),
    });
    (root.querySelector("#diplomacy-open") as HTMLElement).addEventListener("click", () => diplomacy.open());
    // 名品・戦利品と、陥落の処置
    this.spoilsScreen = new SpoilsScreen(root.querySelector("#spoils") as HTMLElement, root.querySelector("#capture") as HTMLElement, {
      campaign: () => this.campaign,
      playerFactionId: () => this.playerFactionId,
      cityName: (id) => this.allCities.find((c) => c.id === id)?.name ?? id,
      onChanged: () => {
        this.showTreasury();
        this.refreshPosts();
        this.dirty = true;
      },
    });
    this.spoilsScreen.bindCapture((text) => this.showNotice(text));
    (root.querySelector("#spoils-open") as HTMLElement).addEventListener("click", () => this.spoilsScreen?.open());
    // 皇室(家系・妃・子女・後継者・即位)
    const court = new CourtScreen(root.querySelector("#court") as HTMLElement, {
      campaign: () => this.campaign,
      playerFactionId: () => this.playerFactionId,
      onChanged: () => {
        this.showTreasury();
        this.dirty = true;
      },
    });
    (root.querySelector("#court-open") as HTMLElement).addEventListener("click", () => court.open());
    // 皇帝生活モード(後宮へ):皇室の画面とメニューから
    const goPalace = (): void => {
      const err = this.enterPalace();
      if (err) this.showNotice(err);
      else {
        (root.querySelector("#court") as HTMLElement).hidden = true;
        this.menu.close?.();
      }
    };
    (root.querySelector(".court-palace") as HTMLElement).addEventListener("click", goPalace);
    (root.querySelector("#menu-palace") as HTMLElement).addEventListener("click", goPalace);
    this.openCourt = (id?: string) => court.open(id);
    // 歴史の重大事件と年表
    const histScreen = new HistoryEventScreen(root.querySelector("#history-event") as HTMLElement, {
      campaign: () => this.campaign,
      playerFactionId: () => this.playerFactionId,
      focus: (lon, lat) => this.focus(lon, lat, 6),
      showMap: (place, cities, armies) => this.showHistoryMap(place, cities, armies),
      hideMap: () => this.hideHistoryMap(),
      onChanged: () => {
        this.showTreasury();
        this.refreshPosts();
        this.dirty = true;
      },
    });
    this.campaign.history.onPrompt = () => histScreen.showNext();
    histScreen.showNext();
    const timeline = new TimelineScreen(root.querySelector("#timeline") as HTMLElement, () => this.campaign);
    (root.querySelector("#timeline-open") as HTMLElement).addEventListener("click", () => timeline.open());
    // 歴史イベントの一覧(発動の条件と、一覧からの発動)
    this.eventsScreen = new EventsScreen(root.querySelector("#events") as HTMLElement, {
      campaign: () => this.campaign,
      onFired: () => histScreen.showNext(),
    });
    (root.querySelector("#events-open") as HTMLElement).addEventListener("click", () => this.eventsScreen.open());
    // 交易路と補給範囲の表示(地図の上に重ねる。もう一度押すと消える)
    (root.querySelector("#trade-open") as HTMLElement).addEventListener("click", () => this.toggleOverlay("trade"));
    (root.querySelector("#supply-open") as HTMLElement).addEventListener("click", () => this.toggleOverlay("supply"));
    // 国家財政
    const finance = new FinanceScreen(root.querySelector("#finance") as HTMLElement, () => this.campaign, () => this.playerFactionId);
    (root.querySelector("#finance-open") as HTMLElement).addEventListener("click", () => finance.open());
    (root.querySelector(".info-dev") as HTMLSelectElement).addEventListener("change", (e) => {
      const sel = e.target as HTMLSelectElement;
      const kind = sel.value as DevKind;
      sel.value = "";
      if (!kind || !this.selected) return;
      this.showNotice(this.campaign.economy.develop(this.selected.city.id, kind));
      this.selectCity(this.selected);
      this.showTreasury();
    });
    if (this.campaign.spoils.pending) this.spoilsScreen.showCapture(this.campaign.spoils.pending);
    // ゲームオーバーの画面
    (root.querySelector(".gameover-load") as HTMLElement).addEventListener("click", () => void this.menu.open());
    (root.querySelector(".gameover-faction") as HTMLElement).addEventListener("click", () => this.openFactionSelect("fallen"));
    (root.querySelector(".gameover-scenario") as HTMLElement).addEventListener("click", () => {
      (root.querySelector("#gameover") as HTMLElement).hidden = true;
      scenarios.open();
    });
    // 都市での徴兵と出陣
    (root.querySelector(".info-recruit") as HTMLElement).addEventListener("click", () => this.cityAction("recruit"));
    (root.querySelector(".info-raise") as HTMLElement).addEventListener("click", () => this.cityAction("raise"));
    this.onDayChanged();
    (root.querySelector("#event-close") as HTMLElement).addEventListener("click", () => {
      (root.querySelector("#event") as HTMLElement).hidden = true;
    });

    this.input = new InputController(canvas, {
      onDraw: (phase, x, y) => this.onDraw(phase, x, y),
      onPan: (fx, fy, tx, ty) => {
        if (this.battle) return this.battle.onPan(fx, fy, tx, ty);
        this.glide = null; // 手で動かしたら、自動の移動はやめる
        this.mapCamera.pan(this.toNdc(fx, fy), this.toNdc(tx, ty));
        this.dirty = true;
      },
      onZoom: (factor, x, y) => {
        if (this.battle) return this.battle.onZoom(factor, x, y);
        this.glide = null;
        this.mapCamera.zoom(factor, this.toNdc(x, y));
        this.dirty = true;
      },
      onTap: (x, y) => (this.battle ? this.battle.onTap(x, y) : this.onTap(x, y)),
      onRotate: (angle) => this.battle?.onRotate(angle),
    });

    new ResizeObserver(() => this.resize()).observe(root);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
    try { if (localStorage.getItem("goko-fps") === "1") this.setFpsMeter(true); } catch { /* 読めなければ表示しない */ }
  }

  // ===== 領土 =====

  /** いまの都市の所属から、領土を計算し直して表示に反映する */
  /** 領土を計算し直して、色を塗り直す。gradual なら、塗り直しを数フレームに分ける(ゲーム中に画面が止まらないように) */
  private refreshTerritory(gradual = false): void {
    this.territory.compute(this.allCities, scenario.cityOwners);
    const colors = scenario.factions.map((f) => new THREE.Color(f.color));
    if (gradual) {
      this.territoryJob = this.territoryTexture.steps(this.territory, colors);
    } else {
      this.territoryJob = null;
      this.territoryTexture.update(this.territory, colors);
    }
    this.dirty = true;
  }
  private territoryJob: Generator<void> | null = null;

  /**
   * 都市の所属勢力を変える(将来の都市占領で使う)。
   * 領土が塗り替わり、都市の旗とラベルの色も新しい勢力のものになる。
   */
  setCityOwner(cityId: string, factionId: string): void {
    scenario.cityOwners[cityId] = factionId;
    const marker = this.cities.setFaction(cityId, factionById(factionId));
    if (marker) this.labels.refresh(marker);
    this.capitalsStale = true;
    // 領土の計算は重いので、次の描画のときに1度だけ行う(国が滅びて都市がまとめて移るとき、何十回も計算しない)
    this.territory.markStale(() => this.refreshTerritory(true));
    this.dirty = true;
  }

  // ===== 軍団の操作 =====

  private onTap(x: number, y: number): void {
    if (this.battlePrep.visible) return; // 会戦準備画面を開いている間は、地図のタップで選択しない
    // 移動先を選んでいる最中は、タップした地点を目的地にする
    if (this.selectedArmy && this.mode !== "info") {
      const point = this.pickGround(x, y);
      if (!point) return;
      const state = this.selectedArmy.state;
      const route = this.campaign.planRoute(state.army.id, point);
      if (!route) {
        this.pendingRoute = null;
        this.route.hide();
        this.setMode("pick", "そこへは進めません。別の場所をタップしてください");
        return;
      }
      this.pendingRoute = route;
      this.route.show(route);
      this.setMode("confirm", this.routeSummary(state.army.id, route));
      return;
    }
    const army = this.pickArmy(x, y);
    if (army) {
      this.selectArmy(army);
      return;
    }
    const city = this.pick(x, y);
    if (city) this.selectCity(city);
    else this.clearSelection();
  }

  /** 経路の一行の要約:距離・日数・食糧(Version 41) */
  private routeSummary(armyId: string, route: Route): string {
    const est = this.campaign.estimateRoute(armyId, route);
    const s = this.campaign.stateOf(armyId);
    const warn = est.foodLeft <= 0 ? "・途中で食糧が尽きる見込み" : est.foodLeft < 15 ? "・到着時の食糧が少ない" : "";
    return `距離 ${Math.round(route.km)}km・到着まで約${est.days}日・食糧の消費 約${est.foodUse}日分(手持ち${Math.round(s?.army.food ?? 0)}→到着時 約${est.foodLeft})${est.unsuppliedDays ? `・補給の届かない日 約${est.unsuppliedDays}日` : ""}${warn}`;
  }

  /** 経路を描く(Version 41):なぞった線を集め、指を離したら、通れる地形に沿った経路にする */
  private onDraw(phase: "start" | "move" | "end" | "cancel", x: number, y: number): void {
    const s = this.selectedArmy?.state;
    if (!s || this.mode !== "draw") return;
    if (phase === "cancel") {
      this.drawPts = [];
      this.route.hide();
      this.dirty = true;
      return;
    }
    const g = this.pickGround(x, y);
    if (g) {
      const lastPt = this.drawPts[this.drawPts.length - 1];
      if (!lastPt || Math.hypot(g.lon - lastPt.lon, g.lat - lastPt.lat) > 0.02) this.drawPts.push(g);
    }
    if (phase === "start") this.drawPts = g ? [g] : [];
    if (phase !== "end") {
      // 描いている途中の線(そのままの形)
      const pts = [{ lon: s.army.lon, lat: s.army.lat }, ...this.drawPts];
      if (pts.length >= 2) {
        const effort = [0];
        for (let i = 1; i < pts.length; i++) effort.push(effort[i - 1] + Math.hypot(pts[i].lon - pts[i - 1].lon, pts[i].lat - pts[i - 1].lat));
        this.route.show({ points: pts, km: 0, effort });
        this.dirty = true;
      }
      return;
    }
    // 指を離した:経由点にまとめる(約25kmごと、最大24点)
    const way: { lon: number; lat: number }[] = [];
    for (const p of this.drawPts) {
      const prev = way[way.length - 1] ?? { lon: s.army.lon, lat: s.army.lat };
      if (Math.hypot(p.lon - prev.lon, p.lat - prev.lat) >= 0.25) way.push(p);
    }
    const end = this.drawPts[this.drawPts.length - 1];
    if (end && (!way.length || way[way.length - 1] !== end)) way.push(end);
    while (way.length > 24) way.splice(1, way.length - 24 > 1 ? 2 : 1);
    this.drawPts = [];
    const route = way.length ? this.campaign.planRouteVia(s.army.id, way) : null;
    if (!route) {
      this.pendingRoute = null;
      this.route.hide();
      this.setMode("draw", "描いた道では進めません。もう一度なぞってください");
      return;
    }
    this.pendingRoute = route;
    this.route.show(route);
    this.setMode("confirm", `描いた道に沿う経路(通れない所は迂回):${this.routeSummary(s.army.id, route)}`);
  }

  private setMode(mode: ArmyPanelMode, message = ""): void {
    this.mode = mode;
    if (this.input) this.input.drawMode = mode === "draw";
    this.armyPanel.setMode(mode, message);
    this.dirty = true;
  }

  private confirmMove(): void {
    if (!this.selectedArmy || !this.pendingRoute) return;
    if (this.pendingReturn) {
      // 帰城(Version 51):見せた道のりで、帰城の命令を出す
      const err = this.campaign.orderReturn(this.selectedArmy.state.army.id, this.pendingReturn, this.pendingRoute);
      if (err) this.showNotice(err);
    } else this.campaign.orderMove(this.selectedArmy.state.army.id, this.pendingRoute);
    this.pendingRoute = null;
    this.pendingReturn = null;
    this.setMode("info");
    this.showRouteOfSelected();
  }

  private cancelMove(): void {
    this.pendingRoute = null;
    this.pendingReturn = null;
    this.setMode("info");
    this.showRouteOfSelected();
    if (this.selectedArmy) this.refreshArmyPanel();
  }

  /** 選択中の軍団が行軍中なら、残りの経路を表示する。そうでなければ消す */
  private showRouteOfSelected(): void {
    const state = this.selectedArmy?.state;
    if (state && state.status === "marching" && state.route) this.route.show(state.route, state.progress);
    else this.route.hide();
    this.dirty = true;
  }

  private selectArmy(marker: ArmyMarker): void {
    this.clearSelection();
    this.selectedArmy = marker;
    this.armies.select(marker);
    this.armyLabels.refresh(marker, true);
    this.refreshArmyPanel();
    this.setMode("info");
    this.showRouteOfSelected();
  }

  /** 操作できる軍団か(操作勢力の軍団か)。できなければ知らせを出して false */
  private ownArmy(): ArmyState | null {
    const s = this.selectedArmy?.state;
    if (!s) return null;
    if (this.playerFactionId && s.army.factionId !== this.playerFactionId) {
      this.showNotice(`${factionById(s.army.factionId)?.name ?? "この勢力"}の軍団には命令できません(操作勢力:${factionById(this.playerFactionId)?.name})`);
      return null;
    }
    return s;
  }

  /** 帰城先を選ぶ(Version 51) */
  private openReturnChooser(): void {
    const s = this.ownArmy();
    if (!s) return;
    if (this.armyPanel.chooserOpen) return this.armyPanel.closeChooser();
    if (s.status === "fighting") return this.showNotice("戦闘中の軍団は帰城できません(会戦の決着か離脱のあとで)");
    const list = this.campaign.returnOptions(s.army.id);
    this.armyPanel.showReturnChoices(list, (c) => {
      const opt = list.find((x) => x.cityId === c.cityId);
      if (!opt) return;
      this.armyPanel.closeChooser();
      if (!opt.route) {
        const err = this.campaign.orderReturn(s.army.id, opt.cityId);
        this.showNotice(err ?? `${s.army.name}は${opt.name}に入城し、守備兵に加わりました`);
        if (!err) this.clearSelection();
        return;
      }
      this.pendingRoute = opt.route;
      this.pendingReturn = opt.cityId;
      this.route.show(opt.route);
      this.setMode("confirm", `帰城:${opt.name}へ ${opt.km.toLocaleString("ja-JP")}km・約${opt.days}日・兵糧 ${opt.foodUse}日分(着いて残り${opt.foodLeft}日分)。着いたら兵・武将・兵糧を${opt.name}へ移します`);
    });
  }

  /** 軍団結合を選ぶ(Version 51) */
  private openMergeChooser(): void {
    const s = this.ownArmy();
    if (!s) return;
    if (this.armyPanel.chooserOpen) return this.armyPanel.closeChooser();
    if (s.status === "fighting") return this.showNotice("戦闘中の軍団は結合できません");
    const km = (o: ArmyState): number => Math.hypot((o.army.lon - s.army.lon) * 85, (o.army.lat - s.army.lat) * 111);
    const others = this.campaign.armies.filter((o) => o !== s && o.army.factionId === s.army.factionId && o.status !== "fighting").sort((a, b) => km(a) - km(b)).slice(0, 10);
    const nameOf = (id: string): string => personById(id)?.name ?? id;
    this.armyPanel.showMergeChoices(
      others.map((o) => ({ armyId: o.army.id, name: o.army.name, troops: totalTroops(o.army), km: km(o), commander: personById(o.army.commanderId)?.name ?? "" })),
      (ids) => {
        const pv = this.campaign.mergePreview(s.army.id, ids.length ? ids : [], undefined);
        const cands = typeof pv === "string" ? [s.army.commanderId].filter(Boolean) : pv.candidates;
        return cands.map((id) => {
          const p = personById(id);
          return { id, label: p ? `${p.name}(統${p.leadership} 武${p.war} 知${p.intelligence})` : id };
        });
      },
      (ids, cmd) => {
        const pv = this.campaign.mergePreview(s.army.id, ids, cmd || undefined);
        if (typeof pv === "string") return { text: pv, ok: false };
        const n = (v: number): string => Math.round(v).toLocaleString("ja-JP");
        const far = pv.far.length ? `。離れた軍団は合流してから結合:${pv.far.map((f) => `${f.name} ${n(f.km)}km・${f.days === null ? "道が無い" : `約${f.days}日`}`).join("、")}` : "";
        const ok = pv.far.every((f) => f.days !== null);
        return {
          ok,
          text: `結合後:${n(pv.total)}人(歩${n(pv.troops.infantry)}・騎${n(pv.troops.cavalry)}・弓${n(pv.troops.archer)})・兵糧 ${pv.food}日分・士気 ${pv.morale}・疲労 ${pv.fatigue}・行軍 ${pv.speed}km/日。総指揮官 ${pv.commanderId ? nameOf(pv.commanderId) : "なし"}${pv.deputyId ? `・副将 ${nameOf(pv.deputyId)}` : ""}${pv.officers.length ? `・配下 ${pv.officers.map(nameOf).join("・")}` : ""}${far}`,
        };
      },
      (ids, cmd) => {
        const err = this.campaign.orderMerge(s.army.id, ids, cmd || undefined);
        this.armyPanel.closeChooser();
        if (err) return this.showNotice(err);
        this.showNotice("軍団結合を命じました");
        this.refreshArmyPanel();
      },
    );
  }

  private refreshArmyPanel(): void {
    const marker = this.selectedArmy;
    if (!marker) return;
    const state = marker.state;
    this.armyPanel.show(marker, {
      location: this.describeLocation(state.army.lon, state.army.lat),
      terrain: this.grid.kindAt(state.army.lon, state.army.lat),
      speed: this.campaign.marchSpeed(state),
      supply: this.campaign.supplyState(state),
      supplied: state.supplied,
      canBattle: state.status === "fighting" && this.campaign.openEventOfArmy(state.army.id) !== undefined,
      people: [state.army.deputyId ? `副将 ${personById(state.army.deputyId)?.name ?? ""}` : "", state.army.officers?.length ? `配下 ${state.army.officers.map((id) => personById(id)?.name ?? id).join("・")}` : ""].filter(Boolean).join(" / ") || undefined,
      note: state.opNote,
    });
    if (this.mode !== "info") this.armyPanel.setMode(this.mode, (this.root.querySelector(".army-message") as HTMLElement).textContent ?? "");
  }

  private describeLocation(lon: number, lat: number): string {
    return placeName(this.allCities, lon, lat);
  }

  private onArmyChanged(state: ArmyState, statusChanged: boolean): void {
    const marker = this.armies.markerOf(state.army.id);
    if (!marker) return; // 最初の準備中は、まだ表示が作られていない
    marker.commander = officerById(state.army.commanderId); // 会戦で指揮官を失うことがある
    this.armies.sync(marker);
    this.armyLabels.refresh(marker, marker === this.selectedArmy);
    if (marker === this.selectedArmy) {
      this.refreshArmyPanel();
      if (statusChanged && this.mode === "info") this.showRouteOfSelected();
    }
    this.dirty = true;
  }

  private onDayChanged(): void {
    (this.root.querySelector("#clock-date") as HTMLElement).textContent = `${this.campaign.dateText()} ${this.campaign.calendar().season}`;
    this.showTreasury();
    // 一定の日数ごとに、オートセーブする
    if (this.campaign.day - this.lastAutosaveDay >= AUTOSAVE_DAYS) this.autosave();
    // 行軍中の軍団を選んでいるときは、進んだ分だけ経路の点線を短くする
    if (this.mode === "info" && this.selectedArmy?.state.status === "marching") this.showRouteOfSelected();
  }

  // ===== 会戦 =====

  /** 敵と接触して戦闘イベントが発生したことを知らせる。時間は自動で止まる */
  private showBattleEvent(event: BattleEvent): void {
    const setup = createBattleSetup(event, (id) => this.campaign.stateOf(id)?.army, this.allCities, (c) => this.campaign.cityState(c));
    if (!setup) return;
    this.noticeBattleId = event.battleId;
    (this.root.querySelector("#event-open") as HTMLElement).hidden = false;
    const kind = event.battleType === "field_battle" ? "野戦" : "攻城戦";
    (this.root.querySelector("#event-text") as HTMLElement).textContent =
      `${kind}:${setup.name}。${setup.attacker.name}が${setup.defender.name}と対峙しました(攻撃側の勝率の目安 ${Math.round(estimateWinRate(setup).attacker * 100)}%)。時間を止めています`;
    (this.root.querySelector("#event") as HTMLElement).hidden = false;
    this.layoutTopBar();
    this.syncSpeedButton();
    this.dirty = true;
  }

  /** 時間のボタンを、いまの状態(進行側が止めた場合を含む)に合わせる */
  private syncSpeedButton(): void {
    if (this.campaign.speed !== 0) this.rate = this.campaign.speed;
    (this.root.querySelector("#clock-pause") as HTMLElement).textContent = this.campaign.speed === 0 ? "▶ 再開" : "Ⅱ 停止";
    (this.root.querySelector("#clock-speed") as HTMLElement).textContent = `速度 ×${this.rate}`;
  }

  // ===== セーブとロード =====

  /** 操作する勢力を決めているときは、その勢力の蓄え(金・糧)と月の収入を、日付の横に出す */
  private showTreasury(): void {
    const el = this.root.querySelector("#clock-treasury") as HTMLElement;
    const st = this.playerFactionId ? this.campaign.factionStates[this.playerFactionId] : undefined;
    el.hidden = !st;
    if (!st || !this.playerFactionId) return;
    const income = this.campaign.incomeOf(this.playerFactionId);
    el.textContent = `金 ${Math.round(st.gold).toLocaleString("ja-JP")}(+${income.gold}) 糧 ${Math.round(st.grain).toLocaleString("ja-JP")}(+${income.grain})`;
  }

  /** 国が滅びたとき:自分の国なら、設定に応じてゲームオーバーか、後継国家で続ける */
  private onFactionFallen(info: { factionId: string; successors: string[]; captor: string | null }): void {
    this.refreshPosts();
    if (this.playerFactionId !== info.factionId) return;
    // 宮殿にいるあいだに国が滅びたら、宮殿を出る
    if (this.palaceScreen) {
      this.campaign.palace.active = false;
      this.closePalaceScreen();
      this.campaign.playerFactionId = this.playerFactionId;
    }
    const name = factionById(info.factionId)?.name ?? "";
    if (this.onFall === "continue" && info.successors.length > 0) {
      const next = info.successors[0];
      this.changeSettings({ playerFactionId: next });
      const f = factionById(next);
      this.campaign.speed = 0;
      this.syncSpeedButton();
      this.showNotice(`${name}は滅びました。後継国家「${f?.name}」の${f?.ruler}として続けます(時間を止めています)`);
      return;
    }
    this.campaign.gameOver = true;
    this.campaign.speed = 0;
    this.syncSpeedButton();
    this.showGameOver(`${name}の君主が${info.captor ? `${factionById(info.captor)?.name ?? ""}に` : ""}捕らえられ、国は滅びました。${info.successors.length ? `後継国家:${info.successors.map((id) => factionById(id)?.name).join("・")}(設定で「後継国家で続ける」を選ぶと、こちらで続けられます)` : "独立して後を継ぐ国はありませんでした。"}`);
  }

  /** 首都の表示(金の屋根・光・冠)を、いまの首都に合わせる(Version 41) */
  refreshCapitals(): void {
    for (const f of scenario.factions) if (!f.fallen) this.campaign.capitalCityOf(f.id);
    for (const m of this.cities.setCapitals((id) => this.campaign.isCapital(id))) this.labels.refresh(m);
    this.dirty = true;
  }

  /** 勢力の選択を開く(時間を止める) */
  openFactionSelect(mode: "start" | "change" | "fallen"): void {
    this.campaign.speed = 0;
    this.syncSpeedButton();
    this.factionSelect.open(mode);
  }

  /** 勢力の選択で:その国の都市を光らせ、首都へ寄る */
  private previewFaction(id: string | null): void {
    this.highlights.clear();
    this.dirty = true;
    if (!id) return;
    const f = factionById(id);
    const cap = this.campaign.capitalCityOf(id);
    // 領土の広がりが入るように、首都を中心に引く。輪の大きさは、引いた距離に合わせる
    const w = cap ? toWorld(cap.lon, cap.lat) : undefined;
    const spread = w ? Math.max(0, ...this.campaign.cities.filter((c) => scenario.cityOwners[c.id] === id).map((c) => { const v = toWorld(c.lon, c.lat); return Math.hypot(v.x - w.x, v.z - w.z); })) : 0;
    const dist = Math.min(170, Math.max(30, spread * 2.4));
    const k = Math.max(1, dist / 45);
    for (const c of this.campaign.cities) {
      if (c.kind === "pass" || scenario.cityOwners[c.id] !== id) continue;
      this.highlights.add(c.lon, c.lat, c.id === cap?.id ? "#e8c25a" : f?.color ?? "#e8c25a", 0, (c.id === cap?.id ? 2.6 : 1.5) * k);
    }
    if (w) {
      // 横長の小さな画面(スマートフォンの横向き)では、一覧が右にあるので、領土が左に見えるようにずらす
      const shift = window.innerHeight <= 500 ? dist * 0.32 : 0;
      this.glideTo(new THREE.Vector3(w.x + shift, 0, w.z), dist);
    }
  }

  private showGameOver(text: string): void {
    const box = this.root.querySelector("#gameover") as HTMLElement;
    (box.querySelector(".gameover-text") as HTMLElement).textContent = text;
    box.hidden = false;
  }

  /** 都市での徴兵(金を払って守備兵を増やす)と、出陣(守備兵から軍団を作る) */
  private cityAction(kind: "recruit" | "raise"): void {
    const marker = this.selected;
    if (!marker) return;
    const city = marker.city;
    const owner = scenario.cityOwners[city.id];
    if (kind === "recruit") {
      const error = this.campaign.recruit(city.id, 500);
      const st = this.campaign.cityState(city);
      this.showNotice(error ?? `${city.name}で募兵しました(人口${(st.pop ?? 0).toLocaleString("ja-JP")}・治安${st.order}・民忠${st.support})`);
    } else {
      // 守備兵を残して、出せるだけ出す。指揮官は、役目のない健在の人物のうち、統率と武力の高い者
      const troops = Math.min(this.campaign.cityState(city).garrison - strategyRules.costs.minGarrison, strategyRules.costs.maxArmy);
      const free = persons
        .filter((p) => p.factionId === owner && p.role !== "strategist" && p.role !== "minister" && p.role !== "ruler" && this.campaign.personStatus(p.id) === "active" && !this.campaign.postOf(p.id))
        .sort((a, b) => b.leadership + b.war - (a.leadership + a.war))[0];
      const result = this.campaign.raiseArmy(city.id, troops, free?.id);
      this.showNotice(typeof result === "string" ? result : `${result.army.name}(${troops.toLocaleString("ja-JP")}人)が${city.name}から出陣しました`);
    }
    this.selectCity(marker);
    this.showTreasury();
  }

  /** 任命のあと、軍団の旗印(指揮官の名前)と、開いているパネルを合わせる */
  private refreshPosts(): void {
    for (const s of this.campaign.armies) {
      const marker = this.armies.markerOf(s.army.id);
      if (marker) marker.commander = officerById(s.army.commanderId);
    }
    if (this.selected) this.selectCity(this.selected);
    if (this.selectedArmy) this.selectArmy(this.selectedArmy);
  }

  private settings(): GameSettings {
    return {
      playerFactionId: this.playerFactionId,
      difficulty: this.difficulty,
      territoryVisible: this.territoryVisible,
      territoryOpacity: this.territoryOpacity,
      speed: this.rate,
      onFall: this.onFall,
      historyMode: this.campaign.historyMode,
    };
  }

  private changeSettings(change: Partial<GameSettings>): void {
    if (change.playerFactionId !== undefined) this.playerFactionId = change.playerFactionId;
    if (change.onFall) this.onFall = change.onFall;
    if (change.historyMode) this.campaign.historyMode = change.historyMode;
    // 画面で選べるのは4段階。古いセーブの「非常に易しい」は「易しい」として扱う
    if (change.difficulty) this.difficulty = change.difficulty === "veryEasy" ? "easy" : change.difficulty;
    // 戦略AIは、操作勢力を選んでいるあいだだけ動く(選んだ勢力以外が自動で動く)
    this.campaign.playerFactionId = this.playerFactionId;
    // 皇帝生活モード:政治を重臣に任せているあいだは、自国もAIが動かす(操作勢力の代わりの印を入れる)。勢力を変えたら、政務に戻る
    if (this.palaceScreen) {
      if (this.campaign.palace.factionId !== this.playerFactionId) this.exitPalace();
      else this.campaign.playerFactionId = COURT_ID;
    }
    this.campaign.difficulty = this.difficulty;
    if (change.speed && RATES.includes(change.speed)) this.rate = change.speed;
    if (change.territoryOpacity !== undefined) {
      this.territoryOpacity = change.territoryOpacity;
      this.terrains[0].setTerritoryOpacity(this.territoryOpacity);
    }
    if (change.territoryVisible !== undefined) {
      this.territoryVisible = change.territoryVisible;
      this.territoryButton.setAttribute("aria-pressed", String(this.territoryVisible));
      this.terrains[0].setTerritoryVisible(this.territoryVisible);
    }
    this.syncSpeedButton();
    this.showTreasury();
    this.dirty = true;
  }

  /** いまのゲームの状態を、セーブデータにまとめる */
  buildSave(): SaveData {
    const cal = this.campaign.calendar();
    const cities: Record<string, CitySave> = {};
    for (const c of this.allCities) {
      cities[c.id] = { ...this.campaign.cityState(c), ownerId: scenario.cityOwners[c.id] ?? null, population: c.population ?? null };
    }
    // 会戦の最中や準備中に保存したときは、どの会戦を開いていたかを残す(読み込むと、準備画面に戻る)
    const battleId = this.battle ? this.battleSetup?.battleId : this.openBattleId;
    return {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      scenarioId: scenario.id,
      summary: {
        date: this.campaign.dateText(),
        year: cal.year,
        season: cal.season,
        playerFaction: this.playerFactionId ? factionById(this.playerFactionId)?.name ?? "不明" : "全勢力",
      },
      settings: this.settings(),
      factions: scenario.factions.map((f) => ({ id: f.id, name: f.name, color: f.color })),
      cities,
      campaign: this.campaign.serialize(),
      activeBattle: battleId ? { battleId, stage: this.battle ? "fighting" : "preparing" } : null,
    };
  }

  /** セーブデータを読み込んで、ゲームの状態を戻す。読めないデータなら例外を投げる(状態は変えない) */
  applySave(raw: unknown): void {
    const data = migrateSave(raw);
    if (data.scenarioId !== scenario.id) {
      const other = scenarioCatalog.find((e) => e.id === data.scenarioId);
      throw new Error(`別のシナリオ(${other ? `${other.year}年 ${other.title}` : data.scenarioId})のセーブデータです。先に、メニューの「シナリオを選ぶ」でそのシナリオに切り替えてください`);
    }

    // 開いている会戦や画面を閉じる(会戦の結果は反映しない)。宮殿の画面も閉じる(セーブの状態に合わせて開き直す)
    if (this.palaceScreen) this.closePalaceScreen();
    this.battle?.dispose();
    this.battle = null;
    this.battleSetup = null;
    this.openBattleId = null;
    this.noticeBattleId = null;
    this.battlePrep.hide();
    this.root.classList.remove("in-battle", "battle-open");
    (this.root.querySelector("#event") as HTMLElement).hidden = true;
    this.clearSelection();

    // 後継国家を加え直す(都市の所属を戻す前に、その勢力がいるように)
    this.campaign.restoreFactions(data.campaign);
    (this.root.querySelector("#gameover") as HTMLElement).hidden = true;
    // 都市の所属を戻す。変わった都市は、旗とラベルの色を付け替える
    for (const c of this.allCities) {
      // セーブに無い都市(あとから追加された都市)は、シナリオ開始時の所属にする
      const owner = (c.id in data.cities ? data.cities[c.id].ownerId : initialCityOwners[c.id]) ?? undefined;
      if (owner === scenario.cityOwners[c.id]) continue;
      if (owner) scenario.cityOwners[c.id] = owner;
      else delete scenario.cityOwners[c.id];
      const marker = this.cities.setFaction(c.id, owner ? factionById(owner) : undefined);
      if (marker) this.labels.refresh(marker);
    }
    this.campaign.restore(data.campaign);
    this.capitalsStale = true;
    // 処置を待っていた陥落があれば、その画面に戻す
    (this.root.querySelector("#capture") as HTMLElement).hidden = true;
    if (this.campaign.spoils.pending) this.spoilsScreen?.showCapture(this.campaign.spoils.pending);
    this.refreshTerritory();
    this.changeSettings(data.settings);
    // セーブを読み込んだら、そのセーブの勢力で続ける(勢力の選択は閉じる)
    this.factionChosen = true;
    if (this.factionSelect?.visible) this.factionSelect.close();
    if (this.campaign.gameOver) this.showGameOver("保存した時点で、国はすでに滅びていました。");
    this.lastAutosaveDay = this.campaign.day;
    this.lastFrame = performance.now();
    this.onDayChanged();
    this.syncSpeedButton();

    // 皇帝生活モードで保存したデータなら、宮殿に戻る(政治は重臣に任せたまま)
    if (this.campaign.palace.active && this.campaign.palace.factionId === this.playerFactionId && !this.campaign.gameOver) {
      this.openPalaceScreen();
      this.showNotice(`${data.summary.date} のセーブデータを読み込みました(宮殿で)`);
      this.dirty = true;
      return;
    }
    this.campaign.palace.active = false;
    // 会戦の最中や準備中に保存したデータなら、その会戦の準備画面に戻る
    if (data.activeBattle && this.campaign.eventOf(data.activeBattle.battleId)) {
      this.openBattlePrep(data.activeBattle.battleId);
      if (data.activeBattle.stage === "fighting") this.showNotice("会戦の途中経過は保存されません。会戦の準備からやり直します");
    } else {
      this.showNotice(`${data.summary.date} のセーブデータを読み込みました。時間は止まっています`);
    }
    this.dirty = true;
  }

  /** オートセーブ(失敗しても、ゲームは止めない) */
  private autosave(): void {
    this.lastAutosaveDay = this.campaign.day;
    this.saves.put(AUTO_SLOT, this.buildSave()).catch((err) => console.warn("オートセーブに失敗しました", err));
  }

  /** 会戦準備画面を開く。カメラを戦場へ寄せ、両軍の情報を表示する */
  openBattlePrep(battleId: string): void {
    const event = this.campaign.eventOf(battleId);
    if (!event || event.status === "completed" || event.status === "cancelled") return;
    const setup = createBattleSetup(event, (id) => this.campaign.stateOf(id)?.army, this.allCities, (c) => this.campaign.cityState(c));
    if (!setup) return;
    this.clearSelection();
    this.campaign.setEventStatus(battleId, "preparing");
    this.campaign.speed = 0;
    this.syncSpeedButton();
    this.openBattleId = battleId;
    (this.root.querySelector("#event") as HTMLElement).hidden = true;
    const { rows, notes } = compareSides(setup);
    this.battlePrep.show(setup, rows, notes, this.playerFactionId);
    this.root.classList.add("battle-open");
    // 戦場が中央の窓に収まるよう、カメラを寄せる(攻城戦は都市が入るよう少し引く)
    const city = event.defenderCityId ? this.allCities.find((c) => c.id === event.defenderCityId) : undefined;
    const lon = city ? (city.lon + event.location.lon) / 2 : event.location.lon;
    const lat = city ? (city.lat + event.location.lat) / 2 : event.location.lat;
    const w = toWorld(lon, lat);
    this.glideTo(new THREE.Vector3(w.x, 0, w.z), city ? 20 : 15);
    this.dirty = true;
  }

  /** 会戦準備画面を閉じて戦略マップに戻る。戦闘は保留のままで、両軍は対峙を続ける */
  private closeBattlePrep(): void {
    if (this.openBattleId) this.campaign.setEventStatus(this.openBattleId, "pending");
    this.openBattleId = null;
    this.battleSetup = null;
    this.battlePrep.hide();
    this.root.classList.remove("battle-open");
    this.dirty = true;
  }

  /**
   * 「戦闘開始」。会戦の設定を確定し、野戦なら3D戦場へ移る。
   * 攻城戦の3D戦闘はまだ無いので、引き継ぐ内容を表示するところまで行う。
   */
  private startBattle(playerSide: "attacker" | "defender" = "attacker"): void {
    const event = this.openBattleId ? this.campaign.eventOf(this.openBattleId) : undefined;
    if (!event) return;
    const setup = createBattleSetup(event, (id) => this.campaign.stateOf(id)?.army, this.allCities, (c) => this.campaign.cityState(c));
    if (!setup) return;
    // プレイヤーの陣営は、プレイヤーの国と攻撃側・防衛側の国を照らし合わせて決める(Version 42)。
    // 通常のプレイでは、敵の側を指揮することはない(観賞・編集モードだけ、選んだ側を指揮できる)
    const forced = playerSideOf(setup, this.playerFactionId);
    if (forced) playerSide = forced;
    this.campaign.setEventStatus(event.battleId, "in_progress");
    this.battleSetup = setup;
    // 攻撃側から見た防御側の、実際の方角。戦場の「奥」をこの方角に合わせる
    const a = this.campaign.stateOf(event.attackerArmyId)?.army;
    const d = event.defenderArmyId ? this.campaign.stateOf(event.defenderArmyId)?.army : undefined;
    // 攻城戦では、軍団から見た都市の方角にする
    const city = event.defenderCityId ? this.allCities.find((c) => c.id === event.defenderCityId) : undefined;
    const to = d ?? city;
    const bearing = a && to ? Math.atan2((to.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), to.lat - a.lat) : 0;
    // 攻城戦の戦場は、都市のある場所の地形にする
    if (city) setup.location = { ...setup.location, lon: city.lon, lat: city.lat };

    // 光の雰囲気:会戦が起きた時刻(1日のうちのいつか)から決める
    const hour = (this.campaign.day % 1) * 24;
    const timeOfDay = hour < 9 ? "morning" : hour < 17 ? "noon" : "evening";

    this.battlePrep.hide();
    this.root.classList.remove("battle-open");
    const loading = this.root.querySelector("#battle-loading") as HTMLElement;
    loading.hidden = false;
    // 会戦地点の実地形を読み込んでから、戦場へ移る。プレイヤーは、自分が動かした軍団(攻撃側)を指揮する
    BattleScreen.create(
      this.renderer, this.root.querySelector("#battle-hud") as HTMLElement, setup, this.terrains[0].field, bearing,
      { playerSide, difficulty: this.difficulty, timeOfDay, city, roads: this.roadLines, crossings: this.terrains[0].region.crossings, capitalIds: Object.values(this.campaign.capitals).map((c) => c.cityId) }, (result) => this.finishBattle(result),
    )
      .then((battle) => {
        this.root.classList.add("in-battle");
        this.battle = battle;
        battle.resize(this.width, this.height);
      })
      .catch((err) => {
        // 地形を読み込めなかったら、会戦を始めずに保留へ戻す
        console.error(err);
        this.campaign.setEventStatus(event.battleId, "pending");
        this.showNotice("戦場の地形データを読み込めませんでした。会戦は保留に戻しました");
      })
      .finally(() => {
        loading.hidden = true;
      });
  }

  /** 画面上部に、短い知らせを出す */
  private showNotice(text: string): void {
    (this.root.querySelector("#event-open") as HTMLElement).hidden = true;
    (this.root.querySelector("#event-text") as HTMLElement).textContent = text;
    (this.root.querySelector("#event") as HTMLElement).hidden = false;
    this.layoutTopBar();
  }

  /**
   * 自動戦闘・戦闘のスキップ(Version 42)。どちらも、AIどうしの会戦と同じ計算(autoResolve)で結果を決め、
   * 手動の会戦と同じ処理(finishBattle → applyBattleResult)で戦略マップへ反映する。
   * 自動戦闘は結果を準備画面に示してから戻り、スキップはすぐ戻る。
   */
  autoBattle(mode: "auto" | "skip"): BattleResult | null {
    const event = this.openBattleId ? this.campaign.eventOf(this.openBattleId) : undefined;
    if (!event || event.status === "completed") return null;
    const setup = createBattleSetup(event, (id) => this.campaign.stateOf(id)?.army, this.allCities, (c) => this.campaign.cityState(c));
    if (!setup) return null;
    const result = autoResolve(setup);
    // 囲んでいた日数ぶん、攻撃側の食糧が減る(AIどうしの攻城戦と同じ)
    if (result.siege) {
      const s = this.campaign.stateOf(event.attackerArmyId);
      if (s) s.army.food = Math.max(0, s.army.food - result.siege.days * 0.5);
    }
    this.battleSetup = setup;
    this.battlePrep.hide();
    this.root.classList.remove("battle-open");
    this.finishBattle(result);
    if (mode === "auto") {
      const side = playerSideOf(setup, this.playerFactionId);
      const won = side ? result.winner === side : null;
      this.showNotice(`自動戦闘の結果:${setup.name}は${result.winner === "draw" ? "引き分け" : `${(result.winner === "attacker" ? setup.attacker : setup.defender).name}の勝利`}${won === null ? "" : won ? "(あなたの勝ち)" : "(あなたの負け)"}。損害 ${setup.attacker.name} ${result.attackerLosses.toLocaleString("ja-JP")}人・${setup.defender.name} ${result.defenderLosses.toLocaleString("ja-JP")}人${result.siege ? (result.siege.captured ? `・${setup.location.name}は陥落(${result.siege.days}日)` : `・${setup.location.name}は持ちこたえた(${result.siege.days}日)`) : ""}`);
    }
    return result;
  }

  /** 会戦を終えて戦略マップに戻る。結果を軍団へ書き戻し、イベントを決着済みにする */
  private finishBattle(result: BattleResult): void {
    const setup = this.battleSetup;
    this.battle?.dispose();
    this.battle = null;
    this.root.classList.remove("in-battle");
    this.openBattleId = null;
    this.battleSetup = null;
    this.campaign.applyBattleResult(result);
    this.autosave(); // 会戦の結果が出たら、すぐに保存しておく
    // 結果を知らせに出す
    if (setup) {
      const winner = result.siege?.captured
        ? `${setup.location.name}が陥落し、${factionById(setup.attacker.factionId)?.name ?? "攻撃側"}のものになった`
        : result.winner === "draw" ? "引き分け" : `${(result.winner === "attacker" ? setup.attacker : setup.defender).name}の勝利`;
      this.noticeBattleId = null;
      (this.root.querySelector("#event-open") as HTMLElement).hidden = true;
      (this.root.querySelector("#event-text") as HTMLElement).textContent =
        `${setup.name}:${winner}。損害は ${setup.attacker.name} ${result.attackerLosses.toLocaleString("ja-JP")}人、${setup.defender.name} ${result.defenderLosses.toLocaleString("ja-JP")}人`;
      (this.root.querySelector("#event") as HTMLElement).hidden = false;
    this.layoutTopBar();
    }
    this.dirty = true;
  }

  /** タップした画面上の点が、地形のどこ(緯度経度)にあたるかを調べる */
  private pickGround(x: number, y: number): { lon: number; lat: number } | null {
    const ndc = this.toNdc(x, y);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.mapCamera.camera);
    const { origin, direction } = ray.ray;
    // 視線に沿って少しずつ進み、地面より下に入ったところを探す
    const step = Math.max(0.05, this.mapCamera.distance / 400);
    const p = new THREE.Vector3();
    for (let t = 0; t < this.mapCamera.distance * 6; t += step) {
      p.copy(origin).addScaledVector(direction, t);
      if (p.y <= this.groundHeight(p.x, p.z)) return toLonLat(p.x, p.z);
    }
    return null;
  }

  /** タップした位置にある軍団を探す。なければ null */
  private pickArmy(x: number, y: number): ArmyMarker | null {
    const camera = this.mapCamera.camera;
    const v = new THREE.Vector3();
    const pixelsPerUnit =
      this.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * this.mapCamera.distance);
    let best: ArmyMarker | null = null;
    let bestScore = 1;
    for (const marker of this.armies.markers) {
      v.copy(marker.group.position).project(camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * this.width;
      const sy = (-v.y * 0.5 + 0.5) * this.height;
      const reach = Math.max(PICK_RADIUS, marker.model.radius * this.armies.scaleOf(marker) * pixelsPerUnit * 0.8);
      v.copy(marker.labelAnchor).project(camera);
      const lx = (v.x * 0.5 + 0.5) * this.width;
      const ly = (-v.y * 0.5 + 0.5) * this.height - 12;
      const d = Math.min(Math.hypot(sx - x, sy - y) / reach, Math.hypot(lx - x, ly - y) / PICK_RADIUS);
      if (d < bestScore) {
        bestScore = d;
        best = marker;
      }
    }
    return best;
  }

  /** カメラを指定した場所へ向ける(都市へのジャンプなどに使う) */
  /**
   * 歴史の事件を、戦略マップの上に示す:戦場(赤い輪)・関係都市(金の輪)・関係する軍団の進軍経路(国ごとの色の点線)。
   * routes は「軍団 → 戦場」の経路の見込み(実際に軍は動かさない)。
   */
  showHistoryMap(place: { lon: number; lat: number }, cityIds: string[], armyIds: string[][]): { routes: number; cities: number; confirmed: number } {
    this.hideHistoryMap();
    const ring = (lon: number, lat: number, color: number, kind: string): void => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
      const w = toWorld(lon, lat);
      m.position.set(w.x, this.histHeight(lon, lat) + 0.08, w.z);
      m.renderOrder = 4;
      m.userData.kind = kind;
      this.histMarks.add(m);
    };
    ring(place.lon, place.lat, 0xe2705c, "battle");
    let cities = 0;
    for (const id of cityIds) {
      const c = this.allCities.find((x) => x.id === id);
      if (c) {
        ring(c.lon, c.lat, 0xe0c070, "city");
        cities++;
      }
    }
    this.histMarks.visible = true;
    let routes = 0;
    let confirmed = 0;
    armyIds.forEach((ids, i) => {
      for (const id of ids.slice(0, 1)) {
        const s = this.campaign.stateOf(id);
        // すでに進軍の命令が出ている軍団は、その経路(確定)を濃い色で。ほかは経路探索の見込み(予測)を薄い色で
        if (s && s.status === "marching" && s.route && this.histRoutes[i]) {
          this.histRoutes[i].show(s.route, s.progress);
          confirmed++;
          continue;
        }
        const route = this.campaign.planRoute(id, place);
        if (route && this.histRoutes[i + 3]) {
          this.histRoutes[i + 3].show(route);
          routes++;
        }
      }
    });
    this.focus(place.lon, place.lat, 9);
    this.dirty = true;
    return { routes, cities, confirmed };
  }

  /** 交易路(つながっている区間は金、止まっている区間は赤)か、補給範囲(自国の都市から80km)を地図に重ねる */
  toggleOverlay(mode: "trade" | "supply"): void {
    const panel = this.root.querySelector("#overlay-panel") as HTMLElement;
    for (const r of this.overlayRoutes) {
      r.hide();
      this.scene.remove(r.group);
    }
    this.overlayRoutes.length = 0;
    for (const m of [...this.overlayGroup.children]) {
      this.overlayGroup.remove(m);
      (m as THREE.Mesh).geometry.dispose();
    }
    for (const id of ["#trade-open", "#supply-open"]) (this.root.querySelector(id) as HTMLElement).setAttribute("aria-pressed", "false");
    if (this.overlayMode === mode) {
      this.overlayMode = null;
      this.overlayGroup.visible = false;
      panel.hidden = true;
      this.dirty = true;
      return;
    }
    this.overlayMode = mode;
    (this.root.querySelector(mode === "trade" ? "#trade-open" : "#supply-open") as HTMLElement).setAttribute("aria-pressed", "true");
    const c = this.campaign;
    const me = this.playerFactionId;
    const lines: string[] = [];
    if (mode === "trade") {
      for (const { route, segs } of c.trade.status()) {
        let open = 0;
        for (const s of segs) {
          const ok = c.trade.segments[`${s.a.id}>${s.b.id}`] ?? s.open;
          const pts = [{ lon: s.a.lon, lat: s.a.lat }, { lon: s.b.lon, lat: s.b.lat }];
          const r = new RouteLine(this.histHeight, ok ? 0xe0c070 : 0xc4573f);
          r.show({ points: pts, effort: [0, 1] } as never);
          this.overlayRoutes.push(r);
          this.scene.add(r.group);
          if (ok) open++;
        }
        const blocked = segs.filter((s) => !(c.trade.segments[`${s.a.id}>${s.b.id}`] ?? s.open)).map((s) => `${s.a.name}〜${s.b.name}(${s.why ?? "手前で途切れている"})`);
        lines.push(`<b>${route.name}</b>(${route.goods.join("・")}):${open}/${segs.length}区間が通じている${blocked.length ? `。止まっている区間:${blocked.slice(0, 3).join("、")}${blocked.length > 3 ? " ほか" : ""}` : ""}`);
      }
      if (me) {
        const pacts = scenario.factions.filter((f) => c.trade.hasPact(me, f.id)).map((f) => f.name);
        lines.unshift(`<b>あなたの国の交易収入</b>:先月 ${c.trade.incomeOf(me)}(これまで ${c.trade.totals[me] ?? 0})。交易協定:${pacts.join("・") || "なし"}`);
      }
      lines.push("金の点線=品が通っている区間、赤=止まっている区間(戦争・治安・包囲・関所の封鎖)。収入は、市場の大きさ・輸送費(距離)・道中の危険で決まり、上限がある");
      this.focus(88, 40, 46);
    } else {
      const f = me ?? scenario.factions.find((x) => !x.passive)?.id;
      const deg = c.supplyRangeKm / 111;
      for (const city of this.allCities) {
        const o = scenario.cityOwners[city.id];
        const ally = city.oasis && o && f && ["alliance", "vassal"].includes(c.relationOf(o, f));
        if (o !== f && !ally) continue;
        const m = new THREE.Mesh(new THREE.RingGeometry(deg * UNITS_PER_DEGREE * 0.92, deg * UNITS_PER_DEGREE, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: ally ? 0x9fd28a : 0x6fa8dc, transparent: true, opacity: 0.55, depthTest: false, side: THREE.DoubleSide }));
        const w = toWorld(city.lon, city.lat);
        m.position.set(w.x, this.histHeight(city.lon, city.lat) + 0.1, w.z);
        m.renderOrder = 4;
        this.overlayGroup.add(m);
      }
      this.overlayGroup.visible = true;
      for (const s of c.armies.filter((a) => a.army.factionId === f)) {
        const st = c.supplyState(s);
        lines.push(`${s.army.name}:${s.supplied ? "補給あり" : "補給なし"}・食糧${Math.round(s.army.food)}日・${{ desert: "砂漠", highMountain: "険しい山", mountain: "山地", grassland: "草原" }[c.terrainOf(s)] ?? "平地など"}${st === "out" ? "・食糧が尽きている(兵が減る)" : st === "low" ? "・食糧が少ない" : ""}`);
      }
      lines.unshift(`青い輪=自国の都市から${c.supplyRangeKm}kmの補給範囲、緑の輪=同盟国・従属国のオアシス(水と兵糧を得られる)。砂漠では補給がないと食糧(水を含む)の減りが早く、尽きると渇きで兵を失う`);
    }
    panel.innerHTML = `<div class="ov-head">${mode === "trade" ? "交易路" : "補給の状況"}<button type="button" class="ov-close">閉じる</button></div>` + lines.map((l) => `<p>${l}</p>`).join("");
    (panel.querySelector(".ov-close") as HTMLElement).addEventListener("click", () => this.toggleOverlay(mode));
    panel.hidden = false;
    this.dirty = true;
  }

  hideHistoryMap(): void {
    for (const r of this.histRoutes) r.hide();
    for (const m of [...this.histMarks.children]) {
      this.histMarks.remove(m);
      (m as THREE.Mesh).geometry.dispose();
    }
    this.histMarks.visible = false;
    this.dirty = true;
  }

  focus(lon: number, lat: number, distance: number): void {
    this.glide = null;
    const p = toWorld(lon, lat);
    this.mapCamera.target.set(p.x, 0, p.z);
    this.mapCamera.distance = distance;
    this.mapCamera.update();
    this.dirty = true;
  }

  /** 3D空間のある地点の、地面の高さ */
  private groundHeight(x: number, z: number): number {
    const { lon, lat } = toLonLat(x, z);
    for (const terrain of this.terrains) {
      const b = terrain.region.info.bounds;
      if (lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north) {
        return terrain.heightAt(lon, lat);
      }
    }
    return 0;
  }

  /** 画面上のピクセル位置を、-1〜1 の座標に直す */
  private toNdc(x: number, y: number): THREE.Vector2 {
    return new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
  }

  /** タップした位置にある都市を探す。なければ null */
  private pick(x: number, y: number): CityMarker | null {
    const camera = this.mapCamera.camera;
    const v = new THREE.Vector3();
    // 3D空間の長さ1が、画面の中央付近で何ピクセルになるか
    const pixelsPerUnit =
      this.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * this.mapCamera.distance);
    let best: CityMarker | null = null;
    let bestScore = 1;
    for (const marker of this.cities.markers) {
      v.copy(marker.group.position).project(camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * this.width;
      const sy = (-v.y * 0.5 + 0.5) * this.height;
      // 都市が画面上で大きいときは、その大きさ全体をタップ範囲にする
      const scale = marker.group.scale.x;
      const reach = Math.max(PICK_RADIUS, marker.radius * scale * pixelsPerUnit * 0.8);
      // 都市本体と、その上のラベルのどちらを押しても選べるようにする
      v.copy(marker.labelAnchor).project(camera);
      const lx = (v.x * 0.5 + 0.5) * this.width;
      const ly = (-v.y * 0.5 + 0.5) * this.height - 14;
      const d = Math.min(Math.hypot(sx - x, sy - y) / reach, Math.hypot(lx - x, ly - y) / PICK_RADIUS);
      if (d < bestScore) {
        bestScore = d;
        best = marker;
      }
    }
    return best;
  }

  private selectCity(marker: CityMarker): void {
    this.clearSelection();
    this.selected = marker;
    this.cities.select(marker);
    // 滞在している人物:太守・守将と、その都市にいる人(后妃など)。捕虜や保護中の人は除く
    const gov = personById(governorIdOf(marker.city, this.campaign.cityStates[marker.city.id]));
    // 所在がこの都市の人(太守・在住・宮廷)。出陣中の軍団長は入れない
    const here = this.campaign.placement.peopleAt(marker.city.id).map((id) => personById(id)).filter((p): p is Person => !!p);
    // 並び:太守 → 君主 → 后妃・皇族(住まいがこの都市の人)→ ほかの人(地図の札には先頭の6人まで)
    const rank = (p: Person): number => (p.role === "ruler" ? 0 : p.residence === marker.city.id ? 1 : 2);
    const residents = [gov, ...here.filter((p) => p !== gov).sort((a, b) => rank(a) - rank(b))].filter((p): p is Person => !!p);
    this.panel.show(marker.city, marker.faction, this.campaign.cityState(marker.city), scenario.uncertainOwners?.includes(marker.city.id) && scenario.cityOwners[marker.city.id] === initialCityOwners[marker.city.id], residents, this.campaign.spoils.inCity(marker.city.id).length, this.campaign.isCapital(marker.city.id) ? this.campaign.capitals[scenario.cityOwners[marker.city.id]] : undefined);
    this.panel.setStaff(residents.length, () => this.personScreen.open(undefined, marker.city.id));
    // 徴兵と出陣は、その都市の勢力を操作できるときだけ
    const owner = scenario.cityOwners[marker.city.id];
    (this.root.querySelector(".info-actions") as HTMLElement).hidden = !owner || (this.playerFactionId !== null && this.playerFactionId !== owner);
    (this.root.querySelector(".info-raise") as HTMLElement).hidden = marker.city.kind === "pass";
    // 選んだ都市が画面の中ほど(情報パネルに隠れない位置)に来るよう、カメラを静かに寄せる
    this.glideTo(marker.group.position, this.mapCamera.distance);
    this.dirty = true;
  }

  /** 都市と軍団の選択をすべて解除する */
  private clearSelection(): void {
    if (this.selectedArmy) this.armyLabels.refresh(this.selectedArmy, false);
    this.selected = null;
    this.selectedArmy = null;
    this.pendingRoute = null;
    this.mode = "info";
    this.cities.select(null);
    this.armies.select(null);
    this.route.hide();
    this.panel.hide();
    this.armyPanel.hide();
    this.dirty = true;
  }

  /** 指定した地点へ、指定した距離までカメラを静かに動かす */
  private glideTo(p: THREE.Vector3, distance: number): void {
    this.glide = {
      fromX: this.mapCamera.target.x,
      fromZ: this.mapCamera.target.z,
      fromD: this.mapCamera.distance,
      toX: p.x,
      toZ: p.z + distance * 0.07,
      toD: distance,
      start: performance.now(),
    };
  }

  /**
   * 上の帯の配置(Version 42):右の釦の列と左の題字を測り、日付の帯と知らせを、そのあいだの空きに置く。
   * 空きが足りなければ、日付の帯は題字の下へ、知らせは日付の帯の下へ下げる(右の釦の列とは重ならない)。
   */
  layoutTopBar(): void {
    const root = this.root;
    const rect = root.getBoundingClientRect();
    // 画面の拡大(ブラウザのズーム)があっても、CSSの長さで測る
    const k = rect.width > 0 ? root.offsetWidth / rect.width : 1;
    const R = (el: Element): { left: number; right: number; top: number; bottom: number; width: number; height: number } => {
      const b = el.getBoundingClientRect();
      return { left: (b.left - rect.left) * k, right: (b.right - rect.left) * k, top: (b.top - rect.top) * k, bottom: (b.bottom - rect.top) * k, width: b.width * k, height: b.height * k };
    };
    const W = root.offsetWidth;
    const ids = ["credits-open", "territory-toggle", "menu-open", "persons-open", "diplomacy-open", "spoils-open", "finance-open", "court-open", "timeline-open", "events-open", "trade-open", "supply-open"];
    let railLeft = W;
    for (const id of ids) {
      const el = root.querySelector<HTMLElement>(`#${id}`);
      if (!el || el.offsetParent === null) continue;
      railLeft = Math.min(railLeft, R(el).left);
    }
    const title = root.querySelector<HTMLElement>(".title");
    const tr = title && title.offsetParent !== null ? R(title) : null;
    const titleRight = tr && tr.width > 0 ? tr.right : 0;
    const titleBottom = tr && tr.height > 0 ? tr.bottom : 0;
    const clock = root.querySelector<HTMLElement>("#clock");
    const ev = root.querySelector<HTMLElement>("#event");
    if (!clock || !ev) return;
    const gap = 10;
    const safeTop = parseFloat(getComputedStyle(root).getPropertyValue("--safe-top")) || 0;
    const safeLeft = 16;
    clock.style.transform = "none";
    clock.style.maxWidth = "";
    clock.style.flexWrap = "";
    clock.classList.remove("narrow");
    let cw = clock.offsetWidth;
    let clockBottom: number;
    if (cw <= railLeft - titleRight - gap * 2) {
      // 題字と釦の列のあいだに収まる:その空きの真ん中寄りに置く
      const left = Math.max(titleRight + gap, Math.min((W - cw) / 2, railLeft - gap - cw));
      clock.style.left = `${left}px`;
      clock.style.top = `${12 + safeTop}px`;
      clockBottom = 12 + safeTop + clock.offsetHeight;
    } else {
      // 収まらない:題字の下へ。釦の列にかかるなら、文字を縮め、それでも足りなければ2段に折り返す
      clock.style.left = `${safeLeft}px`;
      clock.style.top = `${titleBottom + 6}px`;
      const room = railLeft - gap - safeLeft;
      if (cw > room) {
        clock.classList.add("narrow");
        cw = clock.offsetWidth;
        if (cw > room) {
          clock.style.maxWidth = `${Math.max(140, room)}px`;
          clock.style.flexWrap = "wrap";
        }
      }
      clockBottom = titleBottom + 6 + clock.offsetHeight;
    }
    // 知らせ:題字の右に十分な空きがあればそこへ、なければ題字と日付の帯の下へ。どちらも釦の列の手前まで(最大560px)
    const besideTitle = railLeft - gap - (titleRight + gap) >= 320;
    const left0 = besideTitle ? titleRight + gap : safeLeft;
    const top0 = besideTitle ? clockBottom + 8 : Math.max(clockBottom, titleBottom) + 8;
    const w = Math.max(140, Math.min(560, railLeft - gap - left0));
    ev.style.transform = "none";
    ev.style.width = `${w}px`;
    ev.style.left = `${Math.max(left0, Math.min((W - w) / 2, railLeft - gap - w))}px`;
    ev.style.top = `${top0}px`;
  }

  private resize(): void {
    this.layoutTopBar();
    this.width = Math.max(1, this.root.clientWidth);
    this.height = Math.max(1, this.root.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.mapCamera.setViewport(this.width, this.height);
    this.battle?.resize(this.width, this.height);
    this.palaceScreen?.resize(this.width, this.height);
    this.dirty = true;
  }

  // ===================== 皇帝生活モード(3Dの後宮・重臣への委任) =====================

  /** 宮殿に入る(政治・軍事・外交・財政を重臣に任せる)。入れないときは理由 */
  enterPalace(): string | null {
    const f = this.playerFactionId;
    if (!f) return "先に、操作する勢力を選んでください";
    if (this.battle || this.openBattleId) return "会戦の最中は、宮殿に入れません";
    if (this.campaign.gameOver) return "国が滅びています";
    const ruler = this.campaign.rulerOf(f);
    if (!ruler) return "君主がいません";
    const P = this.campaign.palace;
    if (P.factionId !== f) {
      // 別の国で入るときは、後宮の名簿を作り直す
      P.restore(undefined);
      P.factionId = f;
      P.newsSeen = this.campaign.news.length;
    }
    P.active = true;
    P.begin();
    this.openPalaceScreen();
    this.palaceHud?.refresh();
    return null;
  }

  private openPalaceScreen(): void {
    const P = this.campaign.palace;
    this.campaign.playerFactionId = COURT_ID;
    this.campaign.speed = 0;
    this.syncSpeedButton();
    this.clearSelection();
    for (const id of ["#persons", "#diplomacy", "#spoils", "#finance", "#court", "#timeline", "#events", "#history-event", "#menu", "#overlay-panel"]) {
      const el = this.root.querySelector<HTMLElement>(id);
      if (el && id !== "#menu") el.hidden = true;
    }
    P.slot = Math.floor(((this.campaign.day % 1) + 1e-6) * 4) % 4;
    const hudEl = this.root.querySelector("#palace-hud") as HTMLElement;
    hudEl.hidden = false;
    this.root.classList.add("in-palace");
    const canvas = this.root.querySelector("#map") as HTMLCanvasElement;
    this.palaceHud = new PalaceHud(hudEl, {
      palace: P,
      campaign: this.campaign,
      advance: (n) => this.palaceAdvance(n),
      exit: () => this.exitPalace(),
      walkToNpc: (id) => {
        const p = this.palaceScreen?.npcPos(id);
        if (p) this.palaceScreen!.walkTo(p.x, p.z + 2);
      },
      openMenu: () => void this.menu.open(),
    });
    this.palaceScreen = new PalaceScreen(this.renderer, canvas, hudEl, P, {
      onPickNpc: (id) => this.palaceHud?.openNpc(id),
      onArea: (a) => this.palaceHud?.setArea(AREA_LABEL[a]),
      onNear: (id) => this.palaceHud?.setNear(id),
    });
    this.palaceScreen.resize(this.width, this.height);
    this.palaceHud.setArea(this.palaceScreen.areaLabel);
    this.palaceHud.refresh();
    this.lastFrame = performance.now();
  }

  /** 宮殿の時刻を進める(1刻 = 6時間 = 戦略マップの4分の1日)。そのあいだも、他国と歴史の事件が進む */
  palaceAdvance(slots: number): void {
    const P = this.campaign.palace;
    for (let i = 0; i < slots && this.palaceScreen && !this.campaign.gameOver; i++) {
      this.campaign.runDays(0.25);
      P.slot = Math.floor(((this.campaign.day % 1) + 1e-6) * 4) % 4;
      P.collectReports();
    }
    this.campaign.speed = 0;
    if (!this.palaceScreen) return;
    this.palaceScreen.onSlotChanged();
    this.onDayChanged();
  }

  /** 政務に戻る(委任をやめて、戦略マップへ) */
  exitPalace(): void {
    const P = this.campaign.palace;
    const n = P.reports.length;
    P.active = false;
    this.closePalaceScreen();
    this.campaign.playerFactionId = this.playerFactionId;
    this.campaign.speed = 0;
    this.syncSpeedButton();
    this.showNotice(`政務に戻りました。宮殿にいたあいだの報告 ${n}件は、もう一度宮殿に入ると「上奏」で読めます。時間は止まっています`);
  }

  private closePalaceScreen(): void {
    this.palaceScreen?.dispose();
    this.palaceScreen = null;
    this.palaceHud = null;
    const hudEl = this.root.querySelector("#palace-hud") as HTMLElement;
    hudEl.hidden = true;
    hudEl.replaceChildren();
    this.root.classList.remove("in-palace");
    this.dirty = true;
    this.lastFrame = performance.now();
  }

  /** 皇帝生活モードの画面(テスト用) */
  get palace(): { screen: PalaceScreen | null; hud: PalaceHud | null } {
    return { screen: this.palaceScreen, hud: this.palaceHud };
  }

  /** FPSの計測(実機テスト用):1秒ごとに、描いたフレームの数と、いちばん長かったフレームの時間を出す */
  private fps = { on: false, frames: 0, since: 0, worst: 0, last: 0 };
  setFpsMeter(on: boolean): void {
    this.fps = { on, frames: 0, since: performance.now(), worst: 0, last: performance.now() };
    (this.root.querySelector("#fps-meter") as HTMLElement).hidden = !on;
    try { localStorage.setItem("goko-fps", on ? "1" : ""); } catch { /* 保存できなくても表示はする */ }
  }
  private tickFps(): void {
    if (!this.fps.on) return;
    const now = performance.now();
    this.fps.frames++;
    this.fps.worst = Math.max(this.fps.worst, now - this.fps.last);
    this.fps.last = now;
    if (now - this.fps.since >= 1000) {
      const v = (this.fps.frames * 1000) / (now - this.fps.since);
      (this.root.querySelector("#fps-meter") as HTMLElement).textContent = `FPS ${v.toFixed(1)}・最長フレーム ${Math.round(this.fps.worst)}ms${this.battle ? "(会戦中)" : ""}`;
      this.fps.frames = 0;
      this.fps.worst = 0;
      this.fps.since = now;
    }
  }

  /** いまの場面の音楽を選ぶ(画面の状態を、30コマに1度調べる) */
  private bgmScene(): BgmScene {
    const shown = (sel: string): boolean => !(this.root.querySelector(sel) as HTMLElement | null)?.hidden;
    if (this.battle) {
      const res = this.root.querySelector(".hud-result") as HTMLElement | null;
      if (res && !res.hidden) {
        const o = (this.root.querySelector(".hud-result-title") as HTMLElement | null)?.dataset.outcome;
        if (o === "win") return "victory";
        if (o === "lose") return "defeat";
      }
      return this.battle.isSiege ? "siege" : "field";
    }
    if (shown("#gameover")) return "defeat";
    if (shown("#scenarios") || (this.factionSelect?.visible && !this.factionChosen)) return "title";
    if (shown("#diplomacy") || shown("#court") || shown("#persons")) return "court";
    return "map";
  }

  private frame(): void {
    this.tickFps();
    if (++this.bgmTick % 30 === 0) {
      this.bgm.play(this.bgmScene());
      // 日付や金の桁が増えると帯の幅が変わるので、ときどき置き直す
      if (this.bgmTick % 120 === 0) this.layoutTopBar();
    }
    // 領土の塗り直しの続き(1フレームに1区切り)
    this.territory.ensure();
    if (this.territoryJob) {
      if (this.territoryJob.next().done) this.territoryJob = null;
      this.dirty = true;
    }
    const now = performance.now();
    const dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    // 皇帝生活モード:宮殿だけを動かして描く。戦略マップの時間は、宮殿の時刻が進むときだけ進む
    if (this.palaceScreen && this.palaceHud) {
      this.palaceScreen.update(dt);
      this.palaceHud.tick(dt);
      this.palaceScreen.render();
      return;
    }
    // 会戦中は戦場だけを動かして描く。戦略マップの時間は止まっている
    if (this.battle) {
      this.battle.update(dt);
      this.battle.render();
      return;
    }
    // ゲームの時間を進める
    this.campaign.update(dt);
    if (this.highlights.update()) this.dirty = true;
    if (this.capitalsStale) {
      this.capitalsStale = false;
      this.refreshCapitals();
    }

    if (this.glide) {
      const t = Math.min(1, (performance.now() - this.glide.start) / GLIDE_MS);
      const k = 1 - Math.pow(1 - t, 3); // 最初は速く、終わりはゆっくり
      this.mapCamera.target.x = this.glide.fromX + (this.glide.toX - this.glide.fromX) * k;
      this.mapCamera.target.z = this.glide.fromZ + (this.glide.toZ - this.glide.fromZ) * k;
      // 距離は掛け算でなめらかに変える(拡大縮小の速さが一定に感じられる)
      this.mapCamera.distance = this.glide.fromD * Math.pow(this.glide.toD / this.glide.fromD, k);
      this.mapCamera.update();
      this.dirty = true;
      if (t >= 1) this.glide = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.cities.update(this.mapCamera.distance);
    this.armies.update(this.mapCamera.distance);
    this.route.update(this.mapCamera.distance);
    for (const r of this.histRoutes) r.update(this.mapCamera.distance);
    for (const r of this.overlayRoutes) r.update(this.mapCamera.distance);
    if (this.histMarks.visible) for (const m of this.histMarks.children) m.scale.setScalar(this.mapCamera.distance * (m.userData.kind === "battle" ? 0.03 : 0.018));
    for (const terrain of this.terrains) terrain.setCameraDistance(this.mapCamera.distance);
    this.renderer.render(this.scene, this.mapCamera.camera);
    this.labels.update(this.mapCamera.camera, this.width, this.height, this.selected, this.mapCamera.distance);
    this.armyLabels.update(this.mapCamera.camera, this.width, this.height);
  }
}
