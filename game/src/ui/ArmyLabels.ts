// 軍団のラベル。軍団名・総兵力・状態を、軍団旗の上に表示する。
import * as THREE from "three";
import { totalTroops } from "../data";
import type { ArmyStatus } from "../data/types";
import type { ArmyMarker } from "../world/Armies";

export const STATUS_TEXT: Record<ArmyStatus, string> = {
  idle: "待機",
  marching: "行軍中",
  camping: "野営中",
  resupplying: "補給中",
  fighting: "対峙中",
};

interface Item {
  marker: ArmyMarker;
  el: HTMLDivElement;
  troops: HTMLSpanElement;
  status: HTMLSpanElement;
}

export class ArmyLabels {
  private readonly items: Item[] = [];
  private readonly v = new THREE.Vector3();

  constructor(private readonly layer: HTMLElement) {}

  add(marker: ArmyMarker): void {
    const el = document.createElement("div");
    el.className = "army-label";
    el.style.setProperty("--faction", marker.faction ? marker.faction.color : "#9a9a9a");
    const name = document.createElement("span");
    name.className = "army-name";
    name.textContent = marker.state.army.name;
    const troops = document.createElement("span");
    troops.className = "army-troops";
    const status = document.createElement("span");
    status.className = "army-status";
    el.append(name, troops, status);
    this.layer.appendChild(el);
    const item = { marker, el, troops, status };
    this.items.push(item);
    this.refresh(marker);
  }

  /** 壊滅した軍団のラベルを消す */
  remove(marker: ArmyMarker): void {
    const i = this.items.findIndex((k) => k.marker === marker);
    if (i < 0) return;
    this.items[i].el.remove();
    this.items.splice(i, 1);
  }

  /** 兵力や状態が変わったときに、文字を書き直す */
  refresh(marker: ArmyMarker, selected = false): void {
    const item = this.items.find((i) => i.marker === marker);
    if (!item) return;
    item.troops.textContent = totalTroops(marker.state.army).toLocaleString("ja-JP");
    item.status.textContent = STATUS_TEXT[marker.state.status];
    item.el.dataset.status = marker.state.status;
    item.el.classList.toggle("selected", selected);
  }

  /** カメラが動くたびに、ラベルを軍団旗の上に置き直す */
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
