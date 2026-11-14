// 都市名のラベル。3Dではなく普通の文字(HTML)を地図の上に重ねるので、くっきり読める。
import * as THREE from "three";
import { cityLevelOf } from "../data";
import type { CityMarker } from "../world/Cities";

export class CityLabels {
  private readonly items: { marker: CityMarker; el: HTMLDivElement }[] = [];
  private readonly v = new THREE.Vector3();

  constructor(layer: HTMLElement, markers: CityMarker[]) {
    for (const marker of markers) {
      const el = document.createElement("div");
      el.className = `city-label rank-${marker.city.rank}${marker.city.kind === "pass" ? " pass" : ""}`;
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
  update(camera: THREE.Camera, width: number, height: number, selected: CityMarker | null, cameraDistance = 0): void {
    for (const { marker, el } of this.items) {
      this.v.copy(marker.labelAnchor).project(camera);
      // 広域では、小さい都市の名前を隠して、文字が重ならないようにする(選択中の都市は出す)
      // 広域では、小さい都市と関所の名前を出さない(関所は都市のすぐそばにあり、重なりやすいので早めに消す)
      const minor = marker !== selected && (marker.city.kind === "pass" ? cameraDistance > 42 : cityLevelOf(marker.city) <= 2 && cameraDistance > 78);
      const visible = !minor && this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      el.hidden = !visible;
      if (!visible) continue;
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      el.classList.toggle("selected", marker === selected);
    }
  }
}
