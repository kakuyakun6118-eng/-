// 1つの地域の地形を3Dの立体として作る。
import * as THREE from "three";
import { metersToWorld, toWorld } from "../core/geo";
import type { RegionData } from "../data/types";
import { HeightField } from "./heightField";
import { createTerrainMaterial } from "./terrainMaterial";

/** 都市を建てるために、地面を平らにならす場所 */
export interface TerrainPad {
  lon: number;
  lat: number;
  /** 完全に平らにする半径(3D空間での長さ)。その外側はなだらかに元の地形へ戻る */
  radius: number;
}

interface PadWorld {
  x: number;
  z: number;
  radius: number;
  height: number;
}

export class Terrain {
  /** 地形の区画(タイル)のまとまり */
  readonly mesh: THREE.Group;
  private readonly material: THREE.ShaderMaterial;
  private readonly pads: PadWorld[];
  private territoryVisible = false;
  private territoryOpacity = 1;

  private constructor(readonly region: RegionData, readonly field: HeightField, pads: TerrainPad[]) {
    this.pads = pads.map((p) => ({
      ...toWorld(p.lon, p.lat),
      radius: p.radius,
      height: metersToWorld(field.sample(p.lon, p.lat)),
    }));
    const { bounds, gridStep } = region.info;
    const cols = Math.round((bounds.east - bounds.west) / gridStep) + 1;
    const rows = Math.round((bounds.north - bounds.south) / gridStep) + 1;

    // 格子の各点に、位置と「絵のどこを貼るか」を入れていく
    const positions = new Float32Array(cols * rows * 3);
    const uvs = new Float32Array(cols * rows * 2);
    for (let j = 0; j < rows; j++) {
      const lat = bounds.north - j * gridStep;
      for (let i = 0; i < cols; i++) {
        const lon = bounds.west + i * gridStep;
        const k = j * cols + i;
        const { x, z } = toWorld(lon, lat);
        positions[k * 3] = x;
        positions[k * 3 + 1] = this.heightAt(lon, lat);
        positions[k * 3 + 2] = z;
        uvs[k * 2] = i / (cols - 1);
        uvs[k * 2 + 1] = j / (rows - 1);
      }
    }

    // 地形を区画(タイル)に分ける。画面に映らない区画は描かない(西域を広げても、華北を見ているときの負荷が増えないように)
    const position = new THREE.BufferAttribute(positions, 3);
    const uv = new THREE.BufferAttribute(uvs, 2);
    this.material = createTerrainMaterial(field);
    this.mesh = new THREE.Group();
    const TILE = 64;
    for (let tj = 0; tj < rows - 1; tj += TILE) {
      for (let ti = 0; ti < cols - 1; ti += TILE) {
        const j1 = Math.min(rows - 1, tj + TILE);
        const i1 = Math.min(cols - 1, ti + TILE);
        const indices = new Uint32Array((j1 - tj) * (i1 - ti) * 6);
        let n = 0;
        const box = new THREE.Box3();
        const v = new THREE.Vector3();
        for (let j = tj; j < j1; j++) {
          for (let i = ti; i < i1; i++) {
            const a = j * cols + i;
            const b = a + 1;
            const c = a + cols;
            const d = c + 1;
            indices[n++] = a;
            indices[n++] = c;
            indices[n++] = b;
            indices[n++] = b;
            indices[n++] = c;
            indices[n++] = d;
          }
        }
        for (const [i, j] of [[ti, tj], [i1, tj], [ti, j1], [i1, j1]]) {
          const k = j * cols + i;
          box.expandByPoint(v.set(positions[k * 3], 0, positions[k * 3 + 2]));
        }
        box.min.y = -1;
        box.max.y = 12;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", position);
        geometry.setAttribute("uv", uv);
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.boundingBox = box;
        geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.userData.tile = true;
        this.mesh.add(mesh);
      }
    }
  }

  /** 地形ファイルを読み込んでから地形を作る */
  static async create(region: RegionData, pads: TerrainPad[] = []): Promise<Terrain> {
    return new Terrain(region, await HeightField.load(region), pads);
  }

  /** 領土の絵を地形に重ねる準備をする */
  setTerritoryTexture(texture: THREE.Texture, width: number): void {
    this.material.uniforms.tTerritory.value = texture;
    this.material.uniforms.uTerritoryWidth.value = width;
  }

  /** 領土表示のON/OFF */
  setTerritoryVisible(visible: boolean): void {
    this.territoryVisible = visible;
    this.material.uniforms.uTerritory.value = visible ? this.territoryOpacity : 0;
  }

  /** 領土の色の濃さ(1 が標準) */
  setTerritoryOpacity(opacity: number): void {
    this.territoryOpacity = opacity;
    this.setTerritoryVisible(this.territoryVisible);
  }

  /** カメラが遠いほど、かすみ始める距離も遠くする */
  setCameraDistance(distance: number): void {
    this.material.uniforms.uHazeDistance.value = distance * 3.4 + 40;
  }

  /** その地点の地面の高さ(3D空間での値)。都市の足もとは平らにならしてある */
  heightAt(lon: number, lat: number): number {
    let h = metersToWorld(this.field.sample(lon, lat));
    if (this.pads.length > 0) {
      const { x, z } = toWorld(lon, lat);
      for (const pad of this.pads) {
        const d = Math.hypot(x - pad.x, z - pad.z);
        if (d < pad.radius * 1.5) {
          const t = Math.max(0, Math.min(1, (d - pad.radius) / (pad.radius * 0.5)));
          const w = 1 - t * t * (3 - 2 * t);
          h = h * (1 - w) + pad.height * w;
        }
      }
    }
    return h;
  }
}
