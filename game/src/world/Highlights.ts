// 地図の上の強調表示:脈打つ輪(都市・軍団・国の変化の場所や、勢力選択のときの領土)。
// 一定の時間がたつと、ゆっくり消える。描画は輪の板だけなので軽い。
import * as THREE from "three";
import { toWorld } from "../core/geo";

interface Mark { mesh: THREE.Mesh; born: number; life: number; size: number }

export class Highlights {
  readonly group = new THREE.Group();
  private marks: Mark[] = [];
  private readonly geo = new THREE.RingGeometry(0.84, 1, 48);

  constructor(private readonly heightAt: (x: number, z: number) => number) {
    this.group.renderOrder = 20;
  }

  /** 強調を足す(seconds 秒で消える。0 なら消えない) */
  add(lon: number, lat: number, color: string, seconds = 20, size = 1.6): void {
    const w = toWorld(lon, lat);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(w.x, this.heightAt(w.x, w.z) + 0.25, w.z);
    mesh.scale.setScalar(size);
    this.group.add(mesh);
    this.marks.push({ mesh, born: performance.now(), life: seconds * 1000, size });
  }

  clear(): void {
    for (const m of this.marks) {
      this.group.remove(m.mesh);
      (m.mesh.material as THREE.Material).dispose();
    }
    this.marks = [];
  }

  get active(): boolean {
    return this.marks.length > 0;
  }

  /** 毎フレーム:脈打たせ、時間の切れたものを消す。描き直しが要るなら true */
  update(): boolean {
    if (!this.marks.length) return false;
    const now = performance.now();
    for (const m of [...this.marks]) {
      const age = now - m.born;
      if (m.life > 0 && age > m.life) {
        this.group.remove(m.mesh);
        (m.mesh.material as THREE.Material).dispose();
        this.marks.splice(this.marks.indexOf(m), 1);
        continue;
      }
      const pulse = 1 + 0.25 * Math.sin(age / 260);
      m.mesh.scale.setScalar(m.size * pulse);
      const fade = m.life > 0 ? Math.min(1, (m.life - age) / 3000) : 1;
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade;
    }
    return true;
  }
}
