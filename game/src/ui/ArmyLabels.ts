// 軍団のラベル。軍団名と総兵力を、軍旗の上に表示する。
import * as THREE from "three";
import { totalTroops } from "../data";
import type { ArmyMarker } from "../world/Armies";

export class ArmyLabels {
  private readonly items: { marker: ArmyMarker; el: HTMLDivElement }[] = [];
  private readonly v = new THREE.Vector3();

  constructor(layer: HTMLElement, markers: ArmyMarker[]) {
    for (const marker of markers) {
      const el = document.createElement("div");
      el.className = "army-label";
      el.style.setProperty("--faction", marker.faction ? marker.faction.color : "#9a9a9a");
      const name = document.createElement("span");
      name.className = "army-name";
      name.textContent = marker.army.name;
      const troops = document.createElement("span");
      troops.className = "army-troops";
      troops.textContent = totalTroops(marker.army).toLocaleString("ja-JP");
      el.append(name, troops);
      layer.appendChild(el);
      this.items.push({ marker, el });
    }
  }

  /** カメラが動くたびに、ラベルを軍旗の上に置き直す */
  update(camera: THREE.Camera, width: number, height: number): void {
    for (const { marker, el } of this.items) {
      this.v.copy(marker.labelAnchor).project(camera);
      const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      el.hidden = !visible;
      if (!visible) continue;
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
}
