// ゲーム全体のまとめ役。地形・都市・軍団・カメラ・入力・画面表示と、進行の計算(sim)をつなぐ。
import * as THREE from "three";
import { MapCamera, type WorldRect } from "../camera/MapCamera";
import { armies as armyData, factionById, factionOfCity, officerById, regions, resolveCityLayout, scenario } from "../data";
import type { BattleEvent, BattleSetup, City } from "../data/types";
import { InputController } from "../input/InputController";
import { compareSides, createBattleSetup, placeName } from "../sim/battle";
import { Campaign, type ArmyState } from "../sim/Campaign";
import type { Route } from "../sim/pathfinding";
import { TerrainGrid } from "../sim/TerrainGrid";
import { Territory } from "../sim/Territory";
import { ArmyLabels } from "../ui/ArmyLabels";
import { ArmyPanel, type ArmyPanelMode } from "../ui/ArmyPanel";
import { BattlePrep } from "../ui/BattlePrep";
import { CityLabels } from "../ui/CityLabels";
import { InfoPanel } from "../ui/InfoPanel";
import { Armies, type ArmyMarker } from "../world/Armies";
import { Cities, type CityMarker } from "../world/Cities";
import { RouteLine } from "../world/RouteLine";
import { Terrain, type TerrainPad } from "../world/Terrain";
import { HAZE_COLOR } from "../world/terrainMaterial";
import { TerritoryTexture } from "../world/territoryTexture";
import { toLonLat, toWorld } from "./geo";

/** 指で押しやすいように、都市や軍団の周りこの距離(ピクセル)までをタップ範囲にする */
const PICK_RADIUS = 34;
/** 選んだ都市や軍団へカメラを寄せるのにかける時間(ミリ秒) */
const GLIDE_MS = 600;
/** 時間の進む速さの切り替え(0 = 一時停止) */
const SPEEDS = [
  { speed: 1, label: "▶ 通常" },
  { speed: 4, label: "▶▶ 早送り" },
  { speed: 0, label: "Ⅱ 停止中" },
];

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
  private territoryVisible = true;
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
  private selected: CityMarker | null = null;
  private selectedArmy: ArmyMarker | null = null;
  /** 軍団パネルの段階(通常 / 移動先を選んでいる / 経路を確認している) */
  private mode: ArmyPanelMode = "info";
  /** 確認中の経路(「確定」を押すと、この経路で行軍を始める) */
  private pendingRoute: Route | null = null;
  private speedIndex = 0;
  private speedButton!: HTMLButtonElement;
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
    this.grid = new TerrainGrid(terrains[0].field, terrains[0].region.crossings);

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
      onMove: () => this.setMode("pick", "移動先を地図の上でタップしてください"),
      onConfirm: () => this.confirmMove(),
      onCancel: () => this.cancelMove(),
      onHalt: () => this.selectedArmy && this.campaign.halt(this.selectedArmy.state.army.id),
      onBattle: () => {
        const event = this.selectedArmy && this.campaign.openEventOfArmy(this.selectedArmy.state.army.id);
        if (event) this.openBattlePrep(event.battleId);
      },
    });
    this.battlePrep = new BattlePrep(root.querySelector("#battle") as HTMLElement, {
      onStart: () => this.startBattle(),
      onBack: () => this.closeBattlePrep(),
    });
    (root.querySelector("#event-open") as HTMLElement).addEventListener("click", () => {
      if (this.noticeBattleId) this.openBattlePrep(this.noticeBattleId);
    });

    // 日付と、時間の進む速さの切り替え
    const speedButton = root.querySelector("#clock-speed") as HTMLButtonElement;
    speedButton.addEventListener("click", () => {
      this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
      this.campaign.speed = SPEEDS[this.speedIndex].speed;
      speedButton.textContent = SPEEDS[this.speedIndex].label;
    });
    speedButton.textContent = SPEEDS[0].label;
    this.speedButton = speedButton;
    this.onDayChanged();
    (root.querySelector("#event-close") as HTMLElement).addEventListener("click", () => {
      (root.querySelector("#event") as HTMLElement).hidden = true;
    });

    new InputController(canvas, {
      onPan: (fx, fy, tx, ty) => {
        this.glide = null; // 手で動かしたら、自動の移動はやめる
        this.mapCamera.pan(this.toNdc(fx, fy), this.toNdc(tx, ty));
        this.dirty = true;
      },
      onZoom: (factor, x, y) => {
        this.glide = null;
        this.mapCamera.zoom(factor, this.toNdc(x, y));
        this.dirty = true;
      },
      onTap: (x, y) => this.onTap(x, y),
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
    this.armies.sync(marker);
    this.armyLabels.refresh(marker, marker === this.selectedArmy);
    if (marker === this.selectedArmy) {
      this.refreshArmyPanel();
      if (statusChanged && this.mode === "info") this.showRouteOfSelected();
    }
    this.dirty = true;
  }

  private onDayChanged(): void {
    (this.root.querySelector("#clock-date") as HTMLElement).textContent = this.campaign.dateText();
    // 行軍中の軍団を選んでいるときは、進んだ分だけ経路の点線を短くする
    if (this.mode === "info" && this.selectedArmy?.state.status === "marching") this.showRouteOfSelected();
  }

  // ===== 会戦 =====

  /** 敵と接触して戦闘イベントが発生したことを知らせる。時間は自動で止まる */
  private showBattleEvent(event: BattleEvent): void {
    const setup = createBattleSetup(event, (id) => this.campaign.stateOf(id)?.army, this.allCities);
    if (!setup) return;
    this.noticeBattleId = event.battleId;
    const kind = event.battleType === "field_battle" ? "野戦" : "攻城戦";
    (this.root.querySelector("#event-text") as HTMLElement).textContent =
      `${kind}:${setup.name}。${setup.attacker.name}が${setup.defender.name}と対峙しました。時間を止めています`;
    (this.root.querySelector("#event") as HTMLElement).hidden = false;
    this.syncSpeedButton();
    this.dirty = true;
  }

  /** 時間の進む速さのボタンを、いまの速さ(進行側が止めた場合を含む)に合わせる */
  private syncSpeedButton(): void {
    const i = SPEEDS.findIndex((s) => s.speed === this.campaign.speed);
    if (i >= 0) this.speedIndex = i;
    this.speedButton.textContent = SPEEDS[this.speedIndex].label;
  }

  /** 会戦準備画面を開く。カメラを戦場へ寄せ、両軍の情報を表示する */
  openBattlePrep(battleId: string): void {
    const event = this.campaign.eventOf(battleId);
    if (!event || event.status === "completed" || event.status === "cancelled") return;
    const setup = createBattleSetup(event, (id) => this.campaign.stateOf(id)?.army, this.allCities);
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
   * 「戦闘開始」。次段階の3D戦闘へ渡す会戦の設定を確定する。
   * 3D戦闘はまだ無いので、引き継ぐ内容を表示するところまで行う。
   */
  private startBattle(): void {
    const event = this.openBattleId ? this.campaign.eventOf(this.openBattleId) : undefined;
    if (!event) return;
    const setup = createBattleSetup(event, (id) => this.campaign.stateOf(id)?.army, this.allCities);
    if (!setup) return;
    this.campaign.setEventStatus(event.battleId, "in_progress");
    this.battleSetup = setup;
    this.battlePrep.showHandOff(setup);
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
    this.panel.show(marker.city, marker.faction);
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
    this.dirty = true;
  }

  private frame(): void {
    // ゲームの時間を進める
    const now = performance.now();
    this.campaign.update((now - this.lastFrame) / 1000);
    this.lastFrame = now;

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
    this.labels.update(this.mapCamera.camera, this.width, this.height, this.selected);
    this.armyLabels.update(this.mapCamera.camera, this.width, this.height);
  }
}
