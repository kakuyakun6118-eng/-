// 会戦用のカメラ。見ている地点のまわりを回りながら、移動・拡大縮小・回転ができる。
import * as THREE from "three";
import { FIELD } from "./deploy";
import type { FieldMap } from "./fieldData";

const MIN_DISTANCE = 22;
const MAX_DISTANCE = 620;

export class BattleCamera {
  readonly camera = new THREE.PerspectiveCamera(42, 1, 1, 7000);
  readonly target = new THREE.Vector3();
  distance = 170;
  /** 水平の向き(ラジアン)。0 で攻撃側の後ろから防御側を見る */
  yaw = 0;
  /** 見下ろす角度(ラジアン) */
  pitch = 0.72;
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private readonly field: FieldMap) {
    this.overview();
  }

  setViewport(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** 全景のときの向き(防御側を指揮するときは、反対側から見る) */
  homeYaw = 0;

  /** 戦場全体が見える位置に戻す */
  overview(): void {
    this.target.set(0, 0, 8);
    this.distance = 215;
    this.yaw = this.homeYaw;
    this.pitch = 0.78;
    this.update();
  }

  update(): void {
    this.distance = THREE.MathUtils.clamp(this.distance, MIN_DISTANCE, MAX_DISTANCE);
    this.pitch = THREE.MathUtils.clamp(this.pitch, 0.22, 1.35);
    this.target.x = THREE.MathUtils.clamp(this.target.x, -FIELD.width / 2, FIELD.width / 2);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -FIELD.depth / 2, FIELD.depth / 2);
    this.target.y = this.field.heightAt(this.target.x, this.target.z);
    this.plane.constant = -this.target.y;
    const flat = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * flat,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * flat,
    );
    // 手前の山にめり込まないよう、カメラの真下の地面より必ず上にいる
    const floor = this.field.heightAt(this.camera.position.x, this.camera.position.z) + 4;
    if (this.camera.position.y < floor) this.camera.position.y = floor;
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** 画面上の点(-1〜1)から伸びる視線 */
  ray(ndc: THREE.Vector2): THREE.Ray {
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray;
  }

  private groundPoint(ndc: THREE.Vector2): THREE.Vector3 | null {
    return this.ray(ndc).intersectPlane(this.plane, new THREE.Vector3());
  }

  /** つかんだ地面が指に付いてくるように動かす */
  pan(from: THREE.Vector2, to: THREE.Vector2): void {
    const a = this.groundPoint(from);
    const b = this.groundPoint(to);
    if (!a || !b) return;
    this.target.x += a.x - b.x;
    this.target.z += a.z - b.z;
    this.update();
  }

  zoom(factor: number, at: THREE.Vector2): void {
    const before = this.groundPoint(at);
    this.distance *= factor;
    this.update();
    const after = this.groundPoint(at);
    if (before && after) {
      this.target.x += before.x - after.x;
      this.target.z += before.z - after.z;
      this.update();
    }
  }

  /** 水平に回す(ラジアン) */
  rotate(angle: number): void {
    this.yaw += angle;
    this.update();
  }

  /** 見下ろす角度を変える */
  tilt(angle: number): void {
    this.pitch += angle;
    this.update();
  }

  /** 指定した地点を見る(部隊の追従に使う) */
  lookAt(x: number, z: number, smooth = 1): void {
    this.target.x += (x - this.target.x) * smooth;
    this.target.z += (z - this.target.z) * smooth;
    this.update();
  }
}
