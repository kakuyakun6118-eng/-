// 都市のマーカー(城の形をした目印)を3D空間に置く。
import * as THREE from "three";
import { toWorld } from "../core/geo";
import type { City, CityRank, Faction } from "../data/types";

const RANK_SIZE: Record<CityRank, number> = { capital: 1.0, major: 0.78, town: 0.6 };

export interface CityMarker {
  city: City;
  faction: Faction | undefined;
  group: THREE.Group;
  /** 名前ラベルを出す位置(マーカーの少し上) */
  labelAnchor: THREE.Vector3;
}

export class Cities {
  readonly group = new THREE.Group();
  readonly markers: CityMarker[] = [];
  private readonly ring: THREE.Mesh;

  constructor() {
    // 選択中の都市を囲む輪
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.55, 48),
      new THREE.MeshBasicMaterial({ color: 0xf2d489, transparent: true, opacity: 0.95, depthTest: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 2;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  /** 都市を1つ追加する。groundY はその地点の地面の高さ */
  add(city: City, faction: Faction | undefined, groundY: number): void {
    const size = RANK_SIZE[city.rank];
    const color = new THREE.Color(faction ? faction.color : "#9a9a9a");
    const group = new THREE.Group();

    // 城壁(勢力の色)
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(size, size * 1.12, 0.5, 8),
      new THREE.MeshLambertMaterial({ color }),
    );
    wall.position.y = 0.25;
    group.add(wall);

    // 屋根
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(size * 0.62, size * 0.9, 4),
      new THREE.MeshLambertMaterial({ color: 0x2e2a28 }),
    );
    roof.position.y = 0.5 + size * 0.45;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    // 都(みやこ)には金色の飾りを付けて区別する
    if (city.rank === "capital") {
      const top = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xf2d489 }),
      );
      top.position.y = 0.5 + size * 0.9 + 0.15;
      group.add(top);
    }

    const { x, z } = toWorld(city.lon, city.lat);
    group.position.set(x, groundY, z);
    this.group.add(group);
    this.markers.push({ city, faction, group, labelAnchor: new THREE.Vector3(x, groundY, z) });
  }

  /** カメラが遠いときはマーカーを大きくして、見失わないようにする */
  updateScale(cameraDistance: number): void {
    const s = Math.max(0.7, Math.min(2.6, cameraDistance / 55));
    for (const m of this.markers) {
      m.group.scale.setScalar(s);
      m.labelAnchor.y = m.group.position.y + 2.1 * s;
    }
    this.ring.scale.setScalar(s);
  }

  /** 選択中の都市に輪を表示する(null で消す) */
  select(marker: CityMarker | null): void {
    this.ring.visible = marker !== null;
    if (marker) {
      this.ring.position.copy(marker.group.position);
      this.ring.position.y += 0.12;
    }
  }
}
