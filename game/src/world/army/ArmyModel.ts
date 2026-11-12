// 軍団の部品の一覧を、実際に描ける3Dモデルにする。
import * as THREE from "three";
import { createPartGroups } from "../parts/instancing";
import type { ArmyBlueprint } from "./ArmyBuilder";

/** これより近いと兵士を1体ずつ表示し、遠いと隊ごとの色の板で表す */
const NEAR_DISTANCE = 40;

export class ArmyModel {
  readonly group = new THREE.Group();
  readonly radius: number;
  readonly height: number;
  private readonly tiers: THREE.Group[];

  constructor(blueprint: ArmyBlueprint) {
    this.radius = blueprint.radius;
    this.height = blueprint.height;
    this.tiers = createPartGroups(blueprint.parts);
    this.tiers.forEach((t) => this.group.add(t));
    this.tiers[4].visible = false;
  }

  /** 作り直すときに、古いモデルが使っていたメモリを返す */
  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
  }

  setCameraDistance(distance: number): void {
    const near = distance < NEAR_DISTANCE;
    this.tiers[2].visible = near;
    this.tiers[3].visible = !near;
  }
}
