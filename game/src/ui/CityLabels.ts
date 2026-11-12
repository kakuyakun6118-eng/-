// 都市名のラベル。3Dではなく普通の文字(HTML)を地図の上に重ねるので、くっきり読める。
import * as THREE from "three";
import type { CityMarker } from "../world/Cities";

export class CityLabels {
  private readonly items: { marker: CityMarker; el: HTMLDivElement }[] = [];
  private readonly v = new THREE.Vector3();

  constructor(layer: HTMLElement, markers: CityMarker[]) {
    for (const marker of markers) {
      const el = document.createElement("div");
      el.className = `city-label rank-${marker.city.rank}`;
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = marker.faction ? marker.faction.color : "#9a9a9a";
      const name = document.createElement("span");
      name.textContent = marker.city.name;
      el.append(dot, name);
      layer.appendChild(el);
      this.items.push({ marker, el });
    }
  }

  /** 都市の所属が変わったときに、ラベルの丸の色を直す */
  refresh(marker: CityMarker): void {
    const item = this.items.find((i) => i.marker === marker);
    const dot = item?.el.querySelector(".dot") as HTMLElement | null;
    if (dot) dot.style.background = marker.faction ? marker.faction.color : "#9a9a9a";
  }

  /** カメラが動くたびに、ラベルを都市の真上に置き直す */
  update(camera: THREE.Camera, width: number, height: number, selected: CityMarker | null): void {
    for (const { marker, el } of this.items) {
      this.v.copy(marker.labelAnchor).project(camera);
      const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      el.hidden = !visible;
      if (!visible) continue;
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      el.classList.toggle("selected", marker === selected);
    }
  }
}
