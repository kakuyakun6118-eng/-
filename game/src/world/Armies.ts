// 軍団を3D空間に置き、進行(sim/Campaign)の状態に合わせて位置・向き・姿を更新する。
// 行軍中は陣形、止まっているときは野営の姿に作り替える。
import * as THREE from "three";
import { toLonLat, toWorld } from "../core/geo";
import { totalTroops } from "../data";
import type { Faction, Officer } from "../data/types";
import type { ArmyState } from "../sim/Campaign";
import { buildArmy } from "./army/ArmyBuilder";
import { ArmyModel } from "./army/ArmyModel";
import { buildCamp } from "./army/CampBuilder";

/** 広域表示で、どの軍団も最低これくらいの大きさ(3D空間での長さ)に見えるようにする */
const FAR_MIN_SIZE = 3.2;
/** 軍団の基本の拡大率。実寸だと兵士が小さすぎて見えないので、ゲームとして見やすい大きさにする */
const ARMY_SCALE = 2.3;

export interface ArmyMarker {
  state: ArmyState;
  faction: Faction | undefined;
  commander: Officer | undefined;
  /** 位置と向きを持つ入れ物。中身のモデルは状態に応じて作り替える */
  group: THREE.Group;
  model: ArmyModel;
  /** いまのモデルが野営の姿か */
  camp: boolean;
  /** いまのモデルを作ったときの総兵力(大きく減ったら作り直す) */
  builtTroops: number;
  maxScale: number;
  /** 名前ラベルを出す位置(軍団旗の上) */
  labelAnchor: THREE.Vector3;
}

export class Armies {
  readonly group = new THREE.Group();
  readonly markers: ArmyMarker[] = [];
  private readonly ring: THREE.Mesh;
  private selected: ArmyMarker | null = null;

  constructor(private readonly heightAt: (lon: number, lat: number) => number) {
    // 選択中の軍団の足もとに出す、細い輪
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.06, 64),
      new THREE.MeshBasicMaterial({ color: 0xf2d489, transparent: true, opacity: 0.6, depthTest: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 2;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  add(state: ArmyState, faction: Faction | undefined, commander: Officer | undefined): ArmyMarker {
    const marker: ArmyMarker = {
      state,
      faction,
      commander,
      group: new THREE.Group(),
      model: null as unknown as ArmyModel,
      camp: false,
      builtTroops: 0,
      maxScale: 1,
      labelAnchor: new THREE.Vector3(),
    };
    this.group.add(marker.group);
    this.markers.push(marker);
    this.rebuild(marker);
    return marker;
  }

  markerOf(armyId: string): ArmyMarker | undefined {
    return this.markers.find((m) => m.state.army.id === armyId);
  }

  /** いまの状態に合った姿(陣形か野営)に作り直す */
  rebuild(marker: ArmyMarker): void {
    const army = marker.state.army;
    const camp = marker.state.status !== "marching";
    const color = marker.faction ? marker.faction.color : "#d8d2c4";
    this.place(marker);
    const { x, z } = toWorld(army.lon, army.lat);
    const baseY = marker.group.position.y;
    const angle = marker.group.rotation.y;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // 野営は、天幕や兵士を1つずつ足もとの地形に合わせる。
    // 行軍中は場所が変わり続けるので、平らなまま全体を地面の少し上に置く
    const ground = camp
      ? (lx: number, lz: number): number => {
          const wx = lx * ARMY_SCALE;
          const wz = lz * ARMY_SCALE;
          const p = toLonLat(x + wx * cos + wz * sin, z - wx * sin + wz * cos);
          return (this.heightAt(p.lon, p.lat) - baseY) / ARMY_SCALE;
        }
      : (): number => 0;

    if (marker.model) {
      marker.group.remove(marker.model.group);
      marker.model.dispose();
    }
    marker.model = new ArmyModel(camp ? buildCamp(army, color, ground) : buildArmy(army, color, ground));
    marker.group.add(marker.model.group);
    marker.camp = camp;
    marker.builtTroops = totalTroops(army);
    marker.maxScale = Math.min(3, Math.max(1.5, FAR_MIN_SIZE / (marker.model.radius * 2 * ARMY_SCALE)));
  }

  /** 軍団の位置と向きを、いまの状態に合わせる */
  place(marker: ArmyMarker): void {
    const army = marker.state.army;
    const { x, z } = toWorld(army.lon, army.lat);
    let y = this.heightAt(army.lon, army.lat);
    if (marker.state.status === "marching") {
      // 行軍中は、足もとのいちばん高い地面に合わせる(斜面に埋まらないように)
      const r = 0.04;
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
        y = Math.max(y, this.heightAt(army.lon + dx, army.lat + dy));
      }
    }
    marker.group.position.set(x, y + 0.01, z);
    // 向き:0 = 北、90 = 東。モデルの前(-z)がその方角を向くように回す。野営は北向きに固定
    marker.group.rotation.y = marker.state.status === "marching" ? -THREE.MathUtils.degToRad(army.facing) : 0;
  }

  /** 状態や兵力が変わったときに呼ぶ。姿を変える必要があれば作り直す */
  sync(marker: ArmyMarker): void {
    const camp = marker.state.status !== "marching";
    const troops = totalTroops(marker.state.army);
    if (camp !== marker.camp || Math.abs(troops - marker.builtTroops) > marker.builtTroops * 0.08) {
      this.rebuild(marker);
    }
  }

  select(marker: ArmyMarker | null): void {
    this.selected = marker;
    this.ring.visible = marker !== null;
  }

  /** 軍団のいまの見かけの拡大率 */
  scaleOf(marker: ArmyMarker): number {
    return marker.group.scale.x;
  }

  /** カメラの距離に合わせて、大きさと細かさを調整する */
  update(cameraDistance: number): void {
    for (const m of this.markers) {
      const s = Math.max(1, Math.min(m.maxScale, cameraDistance / 32));
      m.group.scale.setScalar(s * ARMY_SCALE);
      m.labelAnchor.set(
        m.group.position.x,
        m.group.position.y + (m.model.height + 0.03) * s * ARMY_SCALE,
        m.group.position.z,
      );
      m.model.setCameraDistance(cameraDistance);
    }
    if (this.selected) {
      const m = this.selected;
      this.ring.position.copy(m.group.position);
      this.ring.position.y += 0.02;
      this.ring.scale.setScalar(m.model.radius * this.scaleOf(m) * 1.08);
    }
  }
}
