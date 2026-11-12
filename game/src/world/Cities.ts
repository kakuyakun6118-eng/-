// 都市を3D空間に置く。
// 規模(level)のデータがある都市は、城壁や建物のある3D都市として表示する。
// まだデータのない都市は、従来の簡単な目印のまま表示する。
import * as THREE from "three";
import { toWorld } from "../core/geo";
import { resolveCityLayout } from "../data";
import type { City, CityRank, Faction } from "../data/types";
import { buildCity } from "./city/CityBuilder";
import { CityModel } from "./city/CityModel";

const RANK_SIZE: Record<CityRank, number> = { capital: 1.0, major: 0.78, town: 0.6 };

export interface CityMarker {
  city: City;
  faction: Faction | undefined;
  group: THREE.Group;
  /** 3D都市のモデル(従来の目印の都市では null) */
  model: CityModel | null;
  /** 都市の半径(拡大率1のとき)。タップの当たり判定と選択の輪に使う */
  radius: number;
  /** 都市の高さ(拡大率1のとき) */
  height: number;
  /** 名前ラベルを出す位置(都市の少し上) */
  labelAnchor: THREE.Vector3;
}

export class Cities {
  readonly group = new THREE.Group();
  readonly markers: CityMarker[] = [];
  private readonly ring: THREE.Mesh;
  private selected: CityMarker | null = null;

  constructor() {
    // 選択中の都市を囲む輪(半径1。都市の大きさに合わせて拡大する)
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.1, 64),
      new THREE.MeshBasicMaterial({ color: 0xf2d489, transparent: true, opacity: 0.95, depthTest: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 2;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  /** 都市を1つ追加する。heightAt は、ある地点(緯度経度)の地面の高さを返す関数 */
  add(city: City, faction: Faction | undefined, heightAt: (lon: number, lat: number) => number): void {
    const { x, z } = toWorld(city.lon, city.lat);
    const layout = resolveCityLayout(city);
    let group: THREE.Group;
    let model: CityModel | null = null;
    let radius: number;
    let height: number;
    let groundY = heightAt(city.lon, city.lat);

    if (layout) {
      model = new CityModel(buildCity(layout, city.id, faction ? faction.color : "#d8d2c4"));
      group = model.group;
      radius = model.radius;
      height = model.height;
      // 足もとの地面は Terrain が平らにならしてあるので、そのまま少しだけ浮かせて置く
      groundY += 0.015;
    } else {
      group = this.createSimpleMarker(city, faction);
      radius = 1.4;
      height = 2.1;
    }

    group.position.set(x, groundY, z);
    this.group.add(group);
    this.markers.push({ city, faction, group, model, radius, height, labelAnchor: new THREE.Vector3(x, groundY, z) });
  }

  /** 従来の簡単な目印(まだ3D都市のデータがない都市用) */
  private createSimpleMarker(city: City, faction: Faction | undefined): THREE.Group {
    const size = RANK_SIZE[city.rank];
    const group = new THREE.Group();
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(size, size * 1.12, 0.5, 8),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(faction ? faction.color : "#9a9a9a") }),
    );
    wall.position.y = 0.25;
    group.add(wall);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(size * 0.62, size * 0.9, 4),
      new THREE.MeshLambertMaterial({ color: 0x2e2a28 }),
    );
    roof.position.y = 0.5 + size * 0.45;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    if (city.rank === "capital") {
      const top = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xf2d489 }),
      );
      top.position.y = 0.5 + size * 0.9 + 0.15;
      group.add(top);
    }
    return group;
  }

  /** いまの拡大率(カメラが遠いほど大きくして、見失わないようにする) */
  scaleOf(marker: CityMarker, cameraDistance: number): number {
    return marker.model
      ? Math.max(1, Math.min(2.4, cameraDistance / 50))
      : Math.max(0.3, Math.min(2.6, cameraDistance / 55));
  }

  /** カメラの距離に合わせて、大きさと細かさを調整する */
  update(cameraDistance: number): void {
    for (const m of this.markers) {
      const s = this.scaleOf(m, cameraDistance);
      m.group.scale.setScalar(s);
      m.labelAnchor.y = m.group.position.y + (m.height + (m.model ? 0.12 : 0)) * s;
      m.model?.setCameraDistance(cameraDistance);
    }
    if (this.selected) {
      this.ring.scale.setScalar(this.selected.radius * this.scaleOf(this.selected, cameraDistance));
    }
  }

  /** 選択中の都市に輪を表示する(null で消す) */
  select(marker: CityMarker | null): void {
    this.selected = marker;
    this.ring.visible = marker !== null;
    if (marker) {
      this.ring.position.copy(marker.group.position);
      this.ring.position.y += 0.03;
    }
  }
}
