// 都市を3D空間に置く。すべての都市を、城壁と建物のある城郭都市として表示する。
import * as THREE from "three";
import { toWorld } from "../core/geo";
import { resolveCityLayout } from "../data";
import type { City, Faction } from "../data/types";
import { buildCity } from "./city/CityBuilder";
import { CityModel } from "./city/CityModel";

/** 広域表示で、どの都市も最低これくらいの大きさ(3D空間での長さ)に見えるようにする */
const FAR_MIN_SIZE = 3.6;

export interface CityMarker {
  city: City;
  faction: Faction | undefined;
  group: THREE.Group;
  model: CityModel;
  /** 都市の半径(拡大率1のとき)。タップの当たり判定に使う */
  radius: number;
  /** 都市の高さ(拡大率1のとき) */
  height: number;
  /** 広域表示での拡大率の上限。小さい都市ほど大きくして、見失わないようにする */
  maxScale: number;
  /** 名前ラベルを出す位置(都市の奥側、北の城壁の上) */
  labelAnchor: THREE.Vector3;
}

export class Cities {
  readonly group = new THREE.Group();
  readonly markers: CityMarker[] = [];
  private selected: CityMarker | null = null;

  /** 都市を1つ追加する。heightAt は、ある地点(緯度経度)の地面の高さを返す関数 */
  add(city: City, faction: Faction | undefined, heightAt: (lon: number, lat: number) => number): void {
    const { x, z } = toWorld(city.lon, city.lat);
    const model = new CityModel(buildCity(resolveCityLayout(city), city.id, faction ? faction.color : "#d8d2c4"));
    // 足もとの地面は Terrain が平らにならしてあるので、そのまま少しだけ浮かせて置く
    model.group.position.set(x, heightAt(city.lon, city.lat) + 0.015, z);
    this.group.add(model.group);
    this.markers.push({
      city,
      faction,
      group: model.group,
      model,
      radius: model.radius,
      height: model.height,
      maxScale: Math.min(3, Math.max(1.9, FAR_MIN_SIZE / Math.max(model.footprint[0], model.footprint[1]))),
      labelAnchor: new THREE.Vector3(x, 0, z),
    });
  }

  /** 都市の所属勢力が変わったとき(占領など)に、旗の色を新しい勢力のものに作り替える */
  setFaction(cityId: string, faction: Faction | undefined): CityMarker | undefined {
    const m = this.markers.find((k) => k.city.id === cityId);
    if (!m) return undefined;
    const position = m.group.position.clone();
    this.group.remove(m.group);
    m.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    m.model = new CityModel(buildCity(resolveCityLayout(m.city), m.city.id, faction ? faction.color : "#d8d2c4"));
    m.model.group.position.copy(position);
    m.model.setSelected(m === this.selected);
    m.group = m.model.group;
    m.faction = faction;
    this.group.add(m.group);
    return m;
  }

  /** カメラの距離に合わせて、大きさと細かさを調整する */
  update(cameraDistance: number): void {
    // 遠いほど、城壁や楼閣を縦に強調して、城郭の輪郭を読み取りやすくする
    const lift = 1 + Math.max(0, Math.min(1, (cameraDistance - 36) / 60)) * 0.9;
    for (const m of this.markers) {
      const s = Math.max(1, Math.min(m.maxScale, cameraDistance / 32));
      m.group.scale.set(s, s * lift, s);
      // ラベルは北の城壁の上に出す(手前の建物と重ならない)
      m.labelAnchor.set(
        m.group.position.x,
        m.group.position.y + m.height * 0.75 * s * lift,
        m.group.position.z - (m.model.footprint[1] / 2) * s,
      );
      m.model.setCameraDistance(cameraDistance);
    }
  }

  /** 都市を選択する(null で解除)。城壁に沿った淡い光と、城門の幟で示す */
  select(marker: CityMarker | null): void {
    this.selected?.model.setSelected(false);
    this.selected = marker;
    marker?.model.setSelected(true);
  }
}
