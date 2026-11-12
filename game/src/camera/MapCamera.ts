// 地図を斜め上から見るカメラ。「見ている地点」と「距離」だけで位置が決まる。
import * as THREE from "three";

export interface WorldRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const MIN_DISTANCE = 5;
const MAX_DISTANCE = 125;
/** 近づくほど低い角度から、遠ざかるほど真上に近い角度から見る */
const PITCH_NEAR = THREE.MathUtils.degToRad(43);
const PITCH_FAR = THREE.MathUtils.degToRad(60);

export class MapCamera {
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1200);
  /** カメラが見ている地面の点 */
  readonly target = new THREE.Vector3();
  distance = 120;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /**
   * heightAt は、その地点の地面の高さを返す関数。
   * 高原の上でもカメラが地面にめり込まないよう、見ている地点の高さに合わせる。
   */
  constructor(
    private readonly limits: WorldRect,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.update();
  }

  setViewport(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** target と distance から、カメラの位置と向きを決める */
  update(): void {
    this.distance = THREE.MathUtils.clamp(this.distance, MIN_DISTANCE, MAX_DISTANCE);
    this.target.x = THREE.MathUtils.clamp(this.target.x, this.limits.minX, this.limits.maxX);
    this.target.z = THREE.MathUtils.clamp(this.target.z, this.limits.minZ, this.limits.maxZ);
    this.target.y = this.heightAt(this.target.x, this.target.z);
    this.ground.constant = -this.target.y;
    const t = (this.distance - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE);
    const pitch = THREE.MathUtils.lerp(PITCH_NEAR, PITCH_FAR, t);
    this.camera.position.set(
      this.target.x,
      this.target.y + Math.sin(pitch) * this.distance,
      this.target.z + Math.cos(pitch) * this.distance,
    );
    // カメラの真下の地面より必ず上にいるようにする(手前の山にめり込まないように)
    const floor = this.heightAt(this.camera.position.x, this.camera.position.z) + 1.2;
    if (this.camera.position.y < floor) this.camera.position.y = floor;
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** 画面上の点(-1〜1)が、地面のどこを指しているか */
  private groundPoint(ndcX: number, ndcY: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  /** 指(マウス)でつかんだ地面が、指に付いてくるように地図を動かす */
  pan(fromNdc: THREE.Vector2, toNdc: THREE.Vector2): void {
    const a = this.groundPoint(fromNdc.x, fromNdc.y);
    const b = this.groundPoint(toNdc.x, toNdc.y);
    if (!a || !b) return;
    this.target.x += a.x - b.x;
    this.target.z += a.z - b.z;
    this.update();
  }

  /** 指している地点を中心に拡大・縮小する。factor が1より小さいと近づく */
  zoom(factor: number, atNdc: THREE.Vector2): void {
    const before = this.groundPoint(atNdc.x, atNdc.y);
    this.distance *= factor;
    this.update();
    const after = this.groundPoint(atNdc.x, atNdc.y);
    if (before && after) {
      this.target.x += before.x - after.x;
      this.target.z += before.z - after.z;
      this.update();
    }
  }
}
