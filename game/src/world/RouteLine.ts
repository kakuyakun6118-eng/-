// 進軍の経路を、地面の上の点線で表示する。終点には目印を立てる。
import * as THREE from "three";
import { toWorld } from "../core/geo";
import type { Route } from "../sim/pathfinding";

const MAX_DOTS = 400;

export class RouteLine {
  readonly group = new THREE.Group();
  private readonly dots: THREE.InstancedMesh;
  private readonly goal: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private positions: THREE.Vector3[] = [];

  constructor(private readonly heightAt: (lon: number, lat: number) => number) {
    this.material = new THREE.MeshBasicMaterial({ color: 0xf2d489, transparent: true, opacity: 0.95, depthTest: false });
    this.dots = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), this.material, MAX_DOTS);
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 3;
    // 終点の目印:逆さの円すい
    this.goal = new THREE.Mesh(new THREE.ConeGeometry(1, 2.2, 4).rotateX(Math.PI).translate(0, 1.1, 0), this.material);
    this.goal.renderOrder = 3;
    this.group.add(this.dots, this.goal);
    this.group.visible = false;
  }

  /** 経路を表示する。fromEffort を指定すると、すでに進んだ部分は描かない */
  show(route: Route, fromEffort = 0): void {
    // 経路に沿って、ほぼ等間隔に点を置く
    const pts: THREE.Vector3[] = [];
    const spacing = 0.035; // 度
    let carry = 0;
    for (let k = 1; k < route.points.length; k++) {
      if (route.effort[k] < fromEffort) continue;
      const a = route.points[k - 1];
      const b = route.points[k];
      const len = Math.hypot(b.lon - a.lon, b.lat - a.lat);
      for (let d = carry; d < len; d += spacing) {
        const t = d / len;
        const lon = a.lon + (b.lon - a.lon) * t;
        const lat = a.lat + (b.lat - a.lat) * t;
        const w = toWorld(lon, lat);
        pts.push(new THREE.Vector3(w.x, this.heightAt(lon, lat) + 0.06, w.z));
      }
      carry = (carry - len) % spacing;
      if (carry < 0) carry += spacing;
    }
    // 点が多すぎるときは間引く
    const stride = Math.max(1, Math.ceil(pts.length / MAX_DOTS));
    this.positions = pts.filter((_, i) => i % stride === 0);
    const end = route.points[route.points.length - 1];
    const w = toWorld(end.lon, end.lat);
    this.goal.position.set(w.x, this.heightAt(end.lon, end.lat) + 0.05, w.z);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  /** カメラの距離に合わせて、点の大きさを変える(どの縮尺でも同じくらいに見えるように) */
  update(cameraDistance: number): void {
    if (!this.group.visible) return;
    const r = cameraDistance * 0.0045;
    const m = new THREE.Matrix4();
    this.positions.forEach((p, i) => {
      m.makeScale(r, r, r).setPosition(p);
      this.dots.setMatrixAt(i, m);
    });
    this.dots.count = this.positions.length;
    this.dots.instanceMatrix.needsUpdate = true;
    this.goal.scale.setScalar(cameraDistance * 0.011);
  }
}
