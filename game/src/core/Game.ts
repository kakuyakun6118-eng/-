// ゲーム全体のまとめ役。地形・都市・軍団・カメラ・入力・画面表示と、進行の計算(sim)をつなぐ。
import * as THREE from "three";
import { MapCamera, type WorldRect } from "../camera/MapCamera";
import { passes, extraBarriers, armies as armyData, factionById, factionOfCity, initialCityOwners, officerById, persons, regions, resolveCityLayout, scenario } from "../data";
import type { Difficulty } from "../battle/ai";
import { BattleScreen } from "../battle/BattleScreen";
import type { BattleResult } from "../battle/types";
import type { BattleEvent, BattleSetup, City } from "../data/types";
import { InputController } from "../input/InputController";
import { compareSides, createBattleSetup, placeName } from "../sim/battle";
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
import { PersonScreen } from "../ui/PersonScreen";
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
import { toLonLat, toWorld } from "./geo";

/** 指で押しやすいように、都市や軍団の周りこの距離(ピクセル)までをタップ範囲にする */
const PICK_RADIUS = 34;
/** 選んだ都市や軍団へカメラを寄せるのにかける時間(ミリ秒) */
const GLIDE_MS = 600;
/** 時間の進む速さ(倍率)。停止は、別のボタンで切り替える */
const RATES = [1, 2, 4, 8];
/** 何日ごとにオートセーブするか */
const AUTOSAVE_DAYS = 10;

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
  /** 時間の進む倍率(停止していないときの値) */
  private rate = 1;
  /** 操作する勢力(null なら制限なし) */
  private playerFactionId: string | null = null;
  private personScreen!: PersonScreen;
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
    this.grid = new TerrainGrid(terrains[0].field, terrains[0].region.crossings, passes, extraBarriers);

    // 街道:都市をつなぐ道を引く。道の上は進軍が速くなる
    const roads = new Roads(terrains[0].region.roads, this.allCities, this.grid, (lon, lat) => terrains[0].heightAt(lon, lat));
    this.scene.add(roads.group);
    this.roadCount = roads.count;

    // 領土:都市の所属から計算し、地形に重ねて表示する
    this.territory = new Territory(this.grid, scenario.factions.map((f) => f.id));
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
    });
    for (const b of root.querySelectorAll<HTMLElement>(".menu-open")) {
      b.addEventListener("click", () => void this.menu.open());
    }
    // 人物の一覧と任命
    this.personScreen = new PersonScreen(root.querySelector("#persons") as HTMLElement, {
      campaign: () => this.campaign,
      playerFactionId: () => this.playerFactionId,
      onAppointed: () => this.refreshPosts(),
    });
    (root.querySelector("#persons-open") as HTMLElement).addEventListener("click", () => this.personScreen.open());
    // 外交と情勢
    const diplomacy = new DiplomacyScreen(root.querySelector("#diplomacy") as HTMLElement, {
      campaign: () => this.campaign,
      playerFactionId: () => this.playerFactionId,
      onChanged: () => (this.dirty = true),
    });
    (root.querySelector("#diplomacy-open") as HTMLElement).addEventListener("click", () => diplomacy.open());
    // 都市での徴兵と出陣
    (root.querySelector(".info-recruit") as HTMLElement).addEventListener("click", () => this.cityAction("recruit"));
    (root.querySelector(".info-raise") as HTMLElement).addEventListener("click", () => this.cityAction("raise"));
    this.onDayChanged();
    (root.querySelector("#event-close") as HTMLElement).addEventListener("click", () => {
      (root.querySelector("#event") as HTMLElement).hidden = true;
    });

    new InputController(canvas, {
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
  }

  // ===== 領土 =====

  /** いまの都市の所属から、領土を計算し直して表示に反映する */
  private refreshTerritory(): void {
    this.territory.compute(this.allCities, scenario.cityOwners);
    this.territoryTexture.update(this.territory, scenario.factions.map((f) => new THREE.Color(f.color)));
    this.dirty = true;
  }

  /**
   * 都市の所属勢力を変える(将来の都市占領で使う)。
   * 領土が塗り替わり、都市の旗とラベルの色も新しい勢力のものになる。
   */
  setCityOwner(cityId: string, factionId: string): void {
    scenario.cityOwners[cityId] = factionId;
    const marker = this.cities.setFaction(cityId, factionById(factionId));
    if (marker) this.labels.refresh(marker);
    this.refreshTerritory();
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
      const days = Math.max(1, Math.ceil(this.campaign.daysFor(state, route)));
      this.setMode("confirm", `距離 ${Math.round(route.km)}km・到着まで約${days}日`);
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

  private setMode(mode: ArmyPanelMode, message = ""): void {
    this.mode = mode;
    this.armyPanel.setMode(mode, message);
    this.dirty = true;
  }

  private confirmMove(): void {
    if (!this.selectedArmy || !this.pendingRoute) return;
    this.campaign.orderMove(this.selectedArmy.state.army.id, this.pendingRoute);
    this.pendingRoute = null;
    this.setMode("info");
    this.showRouteOfSelected();
  }

  private cancelMove(): void {
    this.pendingRoute = null;
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
      `${kind}:${setup.name}。${setup.attacker.name}が${setup.defender.name}と対峙しました。時間を止めています`;
    (this.root.querySelector("#event") as HTMLElement).hidden = false;
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

  /** 都市での徴兵(金を払って守備兵を増やす)と、出陣(守備兵から軍団を作る) */
  private cityAction(kind: "recruit" | "raise"): void {
    const marker = this.selected;
    if (!marker) return;
    const city = marker.city;
    const owner = scenario.cityOwners[city.id];
    if (kind === "recruit") {
      const error = this.campaign.recruit(city.id, 500);
      this.showNotice(error ?? `${city.name}で徴兵しました(金 ${(500 / 100) * strategyRules.costs.goldPer100Troops} を使いました)`);
    } else {
      // 守備兵を残して、出せるだけ出す。指揮官は、役目のない健在の人物のうち、統率と武力の高い者
      const troops = Math.min(this.campaign.cityState(city).garrison - strategyRules.costs.minGarrison, strategyRules.costs.maxArmy);
      const free = persons
        .filter((p) => p.factionId === owner && p.role !== "strategist" && this.campaign.personStatus(p.id) === "active" && !this.campaign.postOf(p.id))
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
    };
  }

  private changeSettings(change: Partial<GameSettings>): void {
    if (change.playerFactionId !== undefined) this.playerFactionId = change.playerFactionId;
    if (change.difficulty) this.difficulty = change.difficulty;
    // 戦略AIは、操作勢力を選んでいるあいだだけ動く(選んだ勢力以外が自動で動く)
    this.campaign.playerFactionId = this.playerFactionId;
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
    if (data.scenarioId !== scenario.id) throw new Error("別のシナリオのセーブデータです");

    // 開いている会戦や画面を閉じる(会戦の結果は反映しない)
    this.battle?.dispose();
    this.battle = null;
    this.battleSetup = null;
    this.openBattleId = null;
    this.noticeBattleId = null;
    this.battlePrep.hide();
    this.root.classList.remove("in-battle", "battle-open");
    (this.root.querySelector("#event") as HTMLElement).hidden = true;
    this.clearSelection();

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
    this.refreshTerritory();
    this.changeSettings(data.settings);
    this.lastAutosaveDay = this.campaign.day;
    this.lastFrame = performance.now();
    this.onDayChanged();
    this.syncSpeedButton();

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
    this.battlePrep.show(setup, rows, notes);
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
      { playerSide, difficulty: this.difficulty, timeOfDay, city }, (result) => this.finishBattle(result),
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
    this.panel.show(marker.city, marker.faction, this.campaign.cityState(marker.city), scenario.uncertainOwners?.includes(marker.city.id) && scenario.cityOwners[marker.city.id] === initialCityOwners[marker.city.id]);
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

  private resize(): void {
    this.width = Math.max(1, this.root.clientWidth);
    this.height = Math.max(1, this.root.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.mapCamera.setViewport(this.width, this.height);
    this.battle?.resize(this.width, this.height);
    this.dirty = true;
  }

  private frame(): void {
    const now = performance.now();
    const dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    // 会戦中は戦場だけを動かして描く。戦略マップの時間は止まっている
    if (this.battle) {
      this.battle.update(dt);
      this.battle.render();
      return;
    }
    // ゲームの時間を進める
    this.campaign.update(dt);

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
    for (const terrain of this.terrains) terrain.setCameraDistance(this.mapCamera.distance);
    this.renderer.render(this.scene, this.mapCamera.camera);
    this.labels.update(this.mapCamera.camera, this.width, this.height, this.selected, this.mapCamera.distance);
    this.armyLabels.update(this.mapCamera.camera, this.width, this.height);
  }
}
