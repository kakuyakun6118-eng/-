// ゲーム全体のまとめ役。地形・都市・カメラ・入力・画面表示をつなぐ。
import * as THREE from "three";
import { MapCamera, type WorldRect } from "../camera/MapCamera";
import { factionOfCity, regions } from "../data";
import { InputController } from "../input/InputController";
import { CityLabels } from "../ui/CityLabels";
import { InfoPanel } from "../ui/InfoPanel";
import { Cities, type CityMarker } from "../world/Cities";
import { Terrain } from "../world/Terrain";
import { HAZE_COLOR } from "../world/terrainMaterial";
import { toLonLat, toWorld } from "./geo";

/** 指で押しやすいように、都市の周りこの距離(ピクセル)までをタップ範囲にする */
const PICK_RADIUS = 34;

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly mapCamera: MapCamera;
  private readonly cities = new Cities();
  private readonly labels: CityLabels;
  private readonly panel: InfoPanel;
  private selected: CityMarker | null = null;
  private width = 1;
  private height = 1;
  /** 画面を描き直す必要があるか。動きがないときは描かず、電池を節約する */
  private dirty = true;

  /** 地形ファイルを読み込んでからゲームを始める */
  static async create(root: HTMLElement): Promise<Game> {
    const terrains = await Promise.all(regions.map((region) => Terrain.create(region)));
    return new Game(root, terrains);
  }

  private constructor(private readonly root: HTMLElement, private readonly terrains: Terrain[]) {
    const canvas = root.querySelector("#map") as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = HAZE_COLOR;

    // 都市マーカー用の光(地形の陰影は world/terrainMaterial.ts が自分で計算する)
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
        this.cities.add(city, factionOfCity(city.id), terrain.heightAt(city.lon, city.lat));
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

    // 地図の外側が見えすぎないよう、見られる範囲を少し内側にする
    const insetX = (limits.maxX - limits.minX) * 0.2;
    const insetZ = (limits.maxZ - limits.minZ) * 0.2;
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
    this.panel = new InfoPanel(root.querySelector("#info") as HTMLElement, () => this.select(null));

    new InputController(canvas, {
      onPan: (fx, fy, tx, ty) => {
        this.mapCamera.pan(this.toNdc(fx, fy), this.toNdc(tx, ty));
        this.dirty = true;
      },
      onZoom: (factor, x, y) => {
        this.mapCamera.zoom(factor, this.toNdc(x, y));
        this.dirty = true;
      },
      onTap: (x, y) => this.select(this.pick(x, y)),
    });

    new ResizeObserver(() => this.resize()).observe(root);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
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

  /** タップした位置に一番近い都市を探す。近くになければ null */
  private pick(x: number, y: number): CityMarker | null {
    const v = new THREE.Vector3();
    let best: CityMarker | null = null;
    let bestDist = PICK_RADIUS;
    for (const marker of this.cities.markers) {
      v.copy(marker.group.position).project(this.mapCamera.camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * this.width;
      const sy = (-v.y * 0.5 + 0.5) * this.height;
      // マーカー本体と、その上のラベルのどちらを押しても選べるようにする
      const d = Math.min(Math.hypot(sx - x, sy - y), Math.hypot(sx - x, sy - 22 - y));
      if (d < bestDist) {
        bestDist = d;
        best = marker;
      }
    }
    return best;
  }

  private select(marker: CityMarker | null): void {
    this.selected = marker;
    this.cities.select(marker);
    if (marker) this.panel.show(marker.city, marker.faction);
    else this.panel.hide();
    this.dirty = true;
  }

  private resize(): void {
    this.width = Math.max(1, this.root.clientWidth);
    this.height = Math.max(1, this.root.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.mapCamera.setViewport(this.width, this.height);
    this.dirty = true;
  }

  private frame(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.cities.updateScale(this.mapCamera.distance);
    for (const terrain of this.terrains) terrain.setCameraDistance(this.mapCamera.distance);
    this.renderer.render(this.scene, this.mapCamera.camera);
    this.labels.update(this.mapCamera.camera, this.width, this.height, this.selected);
  }
}
