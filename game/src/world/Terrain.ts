// 1つの地域の地形を3Dの立体として作る。
import * as THREE from "three";
import { metersToWorld, toWorld } from "../core/geo";
import type { RegionData } from "../data/types";
import { HeightField } from "./heightField";
import { createTerrainMaterial } from "./terrainMaterial";

export class Terrain {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  private constructor(readonly region: RegionData, readonly field: HeightField) {
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
        positions[k * 3 + 1] = metersToWorld(field.sample(lon, lat));
        positions[k * 3 + 2] = z;
        uvs[k * 2] = i / (cols - 1);
        uvs[k * 2 + 1] = j / (rows - 1);
      }
    }

    // 格子の四角を、三角形2枚ずつでつなぐ
    const indices = new Uint32Array((cols - 1) * (rows - 1) * 6);
    let n = 0;
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
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

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    this.material = createTerrainMaterial(field);
    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  /** 地形ファイルを読み込んでから地形を作る */
  static async create(region: RegionData): Promise<Terrain> {
    return new Terrain(region, await HeightField.load(region));
  }

  /** カメラが遠いほど、かすみ始める距離も遠くする */
  setCameraDistance(distance: number): void {
    this.material.uniforms.uHazeDistance.value = distance * 3.4 + 40;
  }

  /** その地点の地面の高さ(3D空間での値) */
  heightAt(lon: number, lat: number): number {
    return metersToWorld(this.field.sample(lon, lat));
  }
}
