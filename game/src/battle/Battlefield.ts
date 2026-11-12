// 戦場の3D表示。地形のデータ(FieldMap)から、地面・森・川・遠景の山・空・太陽の光と影を作る。
import * as THREE from "three";
import type { TerrainKind } from "../data/types";
import { FIELD } from "./deploy";
import { fbm, type FieldMap } from "./fieldData";

const SKY = new THREE.Color("#b9cfe0");
/** 遠景の山の高さ(まわりの地形の種類ごと) */
const BACKDROP_HEIGHT: Partial<Record<TerrainKind, number>> = {
  plain: 5, grassland: 6, desert: 8, forest: 12, hill: 30, mountain: 70, highMountain: 95,
  river: 4, crossing: 4, greatRiver: 2, water: 0,
};

export class Battlefield {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;

  /**
   * surroundings は、戦場のまわり8方向(正面=防御側の奥から時計回り)の、戦略マップ上の地形。
   * 遠景の山並みに反映して、戦略マップの地形とつじつまを合わせる。
   */
  constructor(readonly field: FieldMap, surroundings: TerrainKind[]) {
    const dry = field.dry;
    const desert = field.terrain === "desert";

    // ----- 地面:戦場より広く作り、外側は霧の中へ続かせる -----
    const W = FIELD.width * 2.6;
    const D = FIELD.depth * 2.6;
    const geo = new THREE.PlaneGeometry(W, D, 150, 120).rotateX(-Math.PI / 2);
    const pos = geo.getAttribute("position");
    const colors = new Float32Array(pos.count * 3);
    const grass = new THREE.Color(desert ? "#c9b27c" : dry ? "#a3a25c" : "#7e9a4c");
    const grass2 = new THREE.Color(desert ? "#d8c592" : dry ? "#b8ad68" : "#93a858");
    const dirt = new THREE.Color("#8f7a55");
    const floor = new THREE.Color("#55693a");
    const bed = new THREE.Color("#7d7a5c");
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // 戦場の外は、端の高さからなだらかに続ける
      const cx = Math.max(-FIELD.width / 2, Math.min(FIELD.width / 2, x));
      const cz = Math.max(-FIELD.depth / 2, Math.min(FIELD.depth / 2, z));
      const out = Math.hypot(x - cx, z - cz);
      const h = field.heightAt(cx, cz) + (fbm(x / 90, z / 90, field.seed + 40) - 0.5) * Math.min(14, out * 0.12);
      pos.setY(i, h);
      const n = fbm(x / 22, z / 22, field.seed + 5);
      c.copy(grass).lerp(grass2, n);
      if (fbm(x / 9, z / 9, field.seed + 9) > 0.66) c.lerp(dirt, 0.55); // 土の見える所
      if (field.inForest(x, z)) c.lerp(floor, 0.75);
      if (field.riverWidth > 0) {
        const d = Math.abs(z - field.riverCenter(x));
        if (d < field.riverWidth * 1.3) c.lerp(bed, 1 - d / (field.riverWidth * 1.3));
      }
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    ground.receiveShadow = true;
    this.group.add(ground);

    // ----- 川:川筋に沿った水面の帯 -----
    if (field.riverWidth > 0) {
      const n = 80;
      const p: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= n; i++) {
        const x = -W / 2 + (W * i) / n;
        const zc = field.riverCenter(x);
        p.push(x, -0.55, zc - field.riverWidth * 0.85, x, -0.55, zc + field.riverWidth * 0.85);
        if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const water = new THREE.BufferGeometry();
      water.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      water.setIndex(idx);
      water.computeVertexNormals();
      this.group.add(new THREE.Mesh(water, new THREE.MeshLambertMaterial({ color: "#4f86a4", transparent: true, opacity: 0.82 })));
    }

    // ----- 森:木を1本ずつ。同じ形をまとめて描く -----
    const trees: [number, number, number][] = [];
    for (let z = -D / 2 + 20; z < D / 2 - 20; z += 5) {
      for (let x = -W / 2 + 20; x < W / 2 - 20; x += 5) {
        const inside = Math.abs(x) <= FIELD.width / 2 && Math.abs(z) <= FIELD.depth / 2;
        const wooded = inside ? field.inForest(x, z) : fbm(x / 45 + 30, z / 45 + 30, field.seed + 21) > (desert ? 2 : 0.7);
        if (!wooded) continue;
        const jx = x + (fbm(x * 3.1, z * 2.3, 1) - 0.5) * 5;
        const jz = z + (fbm(x * 1.7, z * 3.7, 2) - 0.5) * 5;
        trees.push([jx, jz, 0.75 + fbm(x * 5, z * 5, 3) * 0.7]);
        if (trees.length >= 1400) break;
      }
      if (trees.length >= 1400) break;
    }
    if (trees.length > 0) {
      const crown = new THREE.InstancedMesh(
        new THREE.ConeGeometry(2.2, 6, 6).translate(0, 5, 0),
        new THREE.MeshLambertMaterial({ color: "#ffffff" }), trees.length,
      );
      const trunk = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.3, 0.4, 2.4, 5).translate(0, 1.2, 0),
        new THREE.MeshLambertMaterial({ color: "#5a4632" }), trees.length,
      );
      const m = new THREE.Matrix4();
      const col = new THREE.Color();
      trees.forEach(([x, z, s], i) => {
        const cx = Math.max(-FIELD.width / 2, Math.min(FIELD.width / 2, x));
        const cz = Math.max(-FIELD.depth / 2, Math.min(FIELD.depth / 2, z));
        m.makeScale(s, s, s).setPosition(x, field.heightAt(cx, cz) - 0.2, z);
        crown.setMatrixAt(i, m);
        trunk.setMatrixAt(i, m);
        crown.setColorAt(i, col.setHSL(0.27 + 0.05 * fbm(x, z, 4), 0.42, 0.2 + 0.1 * fbm(z, x, 5)));
      });
      crown.castShadow = true;
      this.group.add(crown, trunk);
    }

    // ----- 遠景の山並み:戦略マップでまわりにある地形に応じた高さにする -----
    const ring = 96;
    const radius = 560;
    const mp: number[] = [];
    const mc: number[] = [];
    const mi: number[] = [];
    const low = new THREE.Color("#8fa6a0");
    const high = new THREE.Color("#a9b9c6");
    for (let i = 0; i <= ring; i++) {
      const a = (i / ring) * Math.PI * 2;
      // 8方向の高さを、なめらかにつなぐ
      const f = (i / ring) * 8;
      const k = Math.floor(f) % 8;
      const t = f - Math.floor(f);
      const h0 = BACKDROP_HEIGHT[surroundings[k]] ?? 6;
      const h1 = BACKDROP_HEIGHT[surroundings[(k + 1) % 8]] ?? 6;
      const base = h0 + (h1 - h0) * (t * t * (3 - 2 * t));
      const h = base * (0.55 + 0.9 * fbm(i / 5, 3, field.seed + 60)) + 3;
      // 正面(防御側の奥)は -z 方向
      const x = Math.sin(a) * radius;
      const z = -Math.cos(a) * radius;
      mp.push(x, -6, z, x * 0.9, h, z * 0.9, x * 1.15, -6, z * 1.15);
      for (const col of [low, high, low]) mc.push(col.r, col.g, col.b);
      if (i < ring) {
        const b = i * 3;
        mi.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
      }
    }
    const mountains = new THREE.BufferGeometry();
    mountains.setAttribute("position", new THREE.Float32BufferAttribute(mp, 3));
    mountains.setAttribute("color", new THREE.Float32BufferAttribute(mc, 3));
    mountains.setIndex(mi);
    mountains.computeVertexNormals();
    this.group.add(new THREE.Mesh(mountains, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false })));

    // ----- 光:空からの柔らかい光と、影を落とす太陽 -----
    this.group.add(new THREE.HemisphereLight(0xdfe9f2, 0x6b6248, 1.25));
    this.sun = new THREE.DirectionalLight(0xfff0d2, 2.4);
    this.sun.position.set(-150, 190, 90);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const cam = this.sun.shadow.camera;
    cam.left = -FIELD.width * 0.6;
    cam.right = FIELD.width * 0.6;
    cam.top = FIELD.depth * 0.7;
    cam.bottom = -FIELD.depth * 0.7;
    cam.near = 20;
    cam.far = 520;
    this.sun.shadow.bias = -0.002;
    this.group.add(this.sun, this.sun.target);
  }

  /** 空と霧をシーンに設定する */
  applyTo(scene: THREE.Scene): void {
    scene.background = SKY;
    scene.fog = new THREE.Fog(SKY, 260, 640);
    scene.add(this.group);
  }
}
