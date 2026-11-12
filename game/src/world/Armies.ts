// 軍団を3D空間に置く。
import * as THREE from "three";
import { toLonLat, toWorld } from "../core/geo";
import type { Army, Faction, Officer } from "../data/types";
import { buildArmy } from "./army/ArmyBuilder";
import { ArmyModel } from "./army/ArmyModel";

/** 広域表示で、どの軍団も最低これくらいの大きさ(3D空間での長さ)に見えるようにする */
const FAR_MIN_SIZE = 3.2;
/** 軍団の基本の拡大率。実寸だと兵士が小さすぎて見えないので、ゲームとして見やすい大きさにする */
const ARMY_SCALE = 2.3;

export interface ArmyMarker {
  army: Army;
  faction: Faction | undefined;
  commander: Officer | undefined;
  group: THREE.Group;
  model: ArmyModel;
  maxScale: number;
  /** 名前ラベルを出す位置(軍旗の上) */
  labelAnchor: THREE.Vector3;
}

export class Armies {
  readonly group = new THREE.Group();
  readonly markers: ArmyMarker[] = [];

  /** 軍団を1つ追加する。heightAt は、ある地点(緯度経度)の地面の高さを返す関数 */
  add(
    army: Army, faction: Faction | undefined, commander: Officer | undefined,
    heightAt: (lon: number, lat: number) => number,
  ): void {
    const { x, z } = toWorld(army.lon, army.lat);
    const baseY = heightAt(army.lon, army.lat);
    // 向き:0 = 北、90 = 東。モデルの前(-z)がその方角を向くように回す
    const angle = -THREE.MathUtils.degToRad(army.facing);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // 兵士1体ずつの足もとの高さ(軍団の中心との差)
    const ground = (lx: number, lz: number): number => {
      const wx = lx * ARMY_SCALE;
      const wz = lz * ARMY_SCALE;
      const p = toLonLat(x + wx * cos + wz * sin, z - wx * sin + wz * cos);
      return (heightAt(p.lon, p.lat) - baseY) / ARMY_SCALE;
    };
    const model = new ArmyModel(buildArmy(army, faction ? faction.color : "#d8d2c4", ground));
    model.group.position.set(x, baseY + 0.01, z);
    model.group.rotation.y = angle;
    this.group.add(model.group);
    this.markers.push({
      army,
      faction,
      commander,
      group: model.group,
      model,
      maxScale: Math.min(3, Math.max(1.5, FAR_MIN_SIZE / (model.radius * 2 * ARMY_SCALE))),
      labelAnchor: new THREE.Vector3(x, baseY, z),
    });
  }

  /** カメラの距離に合わせて、大きさと細かさを調整する */
  update(cameraDistance: number): void {
    for (const m of this.markers) {
      const s = Math.max(1, Math.min(m.maxScale, cameraDistance / 32));
      m.group.scale.setScalar(s * ARMY_SCALE);
      m.labelAnchor.y = m.group.position.y + (m.model.height + 0.03) * s * ARMY_SCALE;
      m.model.setCameraDistance(cameraDistance);
    }
  }
}
