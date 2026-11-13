// 戦場の3D表示。実地形のデータ(FieldMap)から、地面・地表の色・森・遠景・空・太陽の光と影を作る。
import * as THREE from "three";
import { createNoiseTexture } from "../core/noise";
import { FIELD } from "./deploy";
import { COVER, fbm, VIEW_HALF, type FieldMap } from "./fieldData";

const SKY = new THREE.Color("#bcd0df");
/** 地表の色を描く絵の大きさ(ピクセル)。景色の範囲全体を1枚で覆う */
const TEXTURE_SIZE = 768;
/** 地面の格子の、1辺の点の数。中心ほど細かく、外側ほど粗くする */
const GRID = 221;
/** 遠景(戦略マップの実標高)を作る範囲の半分 */
const FAR_HALF = 3000;
const FAR_GRID = 51;
const MAX_TREES = 2600;

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const GRASS: RGB = [124, 150, 76];
const GRASS_DRY: RGB = [158, 160, 96];
const SOIL: RGB = [156, 134, 96];
const FOREST_FLOOR: RGB = [70, 96, 54];
const SHRUB: RGB = [104, 128, 70];
const BARE: RGB = [176, 160, 128];
const ROCK: RGB = [138, 130, 118];
const ROCK_DARK: RGB = [104, 98, 90];
const SHALLOW: RGB = [98, 146, 160];
const DEEP: RGB = [58, 112, 138];
const BANK: RGB = [134, 128, 96];

/** 太陽の方向(北西のやや高い位置から照らすと、山ひだが見やすい) */
const SUN = new THREE.Vector3(-0.55, 0.62, -0.35).normalize();

/** 地表の色を、標高・傾き・土地被覆・水域から決めて1枚の絵にする */
function createSurfaceTexture(field: FieldMap): THREE.CanvasTexture {
  const S = TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(S, S);
  const step = (VIEW_HALF * 2) / S;
  for (let py = 0; py < S; py++) {
    const z = -VIEW_HALF + (py + 0.5) * step;
    for (let px = 0; px < S; px++) {
      const x = -VIEW_HALF + (px + 0.5) * step;
      const slope = field.slopeAt(x, z);
      const cover = field.coverAt(x, z);
      const water = field.waterAt(x, z);
      const meters = field.metersAt(x, z);
      const n1 = fbm(x / 40, z / 40, 3);
      const n2 = fbm(x / 9, z / 9, 11);

      // 平地:草地に、乾いた草と土の見える所をまだらに混ぜる
      let c = mix(GRASS, GRASS_DRY, n1 * 0.9);
      c = mix(c, SOIL, smooth(0.56, 0.72, n2) * 0.7);
      if (cover === COVER.tree) c = mix(c, FOREST_FLOOR, 0.85);
      else if (cover === COVER.shrub) c = mix(c, SHRUB, 0.8);
      else if (cover === COVER.bare) c = mix(c, BARE, 0.85);
      else if (cover === COVER.wetland) c = mix(c, [96, 122, 84], 0.7);
      // 標高が高いほど、草が薄く岩がちになる
      c = mix(c, [128, 132, 100], smooth(700, 1500, meters) * 0.5);
      // 斜面:ゆるい斜面は土が露出し、急な斜面は岩肌になる
      c = mix(c, SOIL, smooth(0.14, 0.3, slope + (n2 - 0.5) * 0.08) * (cover === COVER.tree ? 0.25 : 0.6));
      c = mix(c, mix(ROCK, ROCK_DARK, n2), smooth(0.34, 0.62, slope + (n2 - 0.5) * 0.12));

      if (water > 0) {
        c = water >= 1 ? DEEP : mix(SHALLOW, BANK, 0.25 + n2 * 0.2);
      } else {
        // 岸辺:水のそばは湿った土の色にする
        const near =
          field.waterAt(x + step * 1.5, z) + field.waterAt(x - step * 1.5, z) +
          field.waterAt(x, z + step * 1.5) + field.waterAt(x, z - step * 1.5);
        if (near > 0) c = mix(c, BANK, 0.6);
      }

      // 陰影:地面の向きと太陽の向きから明るさを決め、遠くの山ひだもはっきり見せる
      const d = step * 1.5;
      const nx = field.heightAt(x - d, z) - field.heightAt(x + d, z);
      const nz = field.heightAt(x, z - d) - field.heightAt(x, z + d);
      const len = Math.hypot(nx, 2 * d, nz);
      const light = water > 0 ? 1 : 0.62 + 0.55 * Math.max(0, (nx * SUN.x + 2 * d * SUN.y + nz * SUN.z) / len);
      const p = (py * S + px) * 4;
      img.data[p] = c[0] * light;
      img.data[p + 1] = c[1] * light;
      img.data[p + 2] = c[2] * light;
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export class Battlefield {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;

  constructor(readonly field: FieldMap) {
    // ----- 地面:中心ほど細かい格子。実標高をそのまま高さにする -----
    // 格子の位置を曲げて、操作する範囲の近くに点を集める(遠くは粗くてよい)
    const warp = (s: number): number => VIEW_HALF * Math.sign(s) * (0.35 * Math.abs(s) + 0.65 * Math.abs(s) ** 2.2);
    const positions = new Float32Array(GRID * GRID * 3);
    const uvs = new Float32Array(GRID * GRID * 2);
    for (let j = 0; j < GRID; j++) {
      const z = warp((j / (GRID - 1)) * 2 - 1);
      for (let i = 0; i < GRID; i++) {
        const x = warp((i / (GRID - 1)) * 2 - 1);
        const k = j * GRID + i;
        positions.set([x, field.heightAt(x, z), z], k * 3);
        uvs.set([(x + VIEW_HALF) / (VIEW_HALF * 2), 1 - (z + VIEW_HALF) / (VIEW_HALF * 2)], k * 2);
      }
    }
    const indices = new Uint32Array((GRID - 1) * (GRID - 1) * 6);
    let n = 0;
    for (let j = 0; j < GRID - 1; j++) {
      for (let i = 0; i < GRID - 1; i++) {
        const a = j * GRID + i;
        indices.set([a, a + GRID, a + 1, a + 1, a + GRID, a + GRID + 1], n);
        n += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    // 質感:地表の色の絵に、近づいたとき用の細かいむら(草や土のざらつき)を掛け合わせる
    const material = new THREE.MeshLambertMaterial({ map: createSurfaceTexture(field) });
    const detail = createNoiseTexture(128);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.tDetail = { value: detail };
      shader.fragmentShader = `uniform sampler2D tDetail;\n${shader.fragmentShader}`.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec3 grain = texture2D( tDetail, vMapUv * 90.0 ).rgb;
        vec3 blotch = texture2D( tDetail, vMapUv * 14.0 ).rgb;
        diffuseColor.rgb *= 0.78 + 0.3 * grain.r + 0.14 * blotch.g;`,
      );
    };
    const ground = new THREE.Mesh(geo, material);
    ground.receiveShadow = true;
    this.group.add(ground);

    // ----- 遠景:景色の範囲の外は、戦略マップの実標高で山並みをつなぐ(粗い格子) -----
    const fp: number[] = [];
    const fc: number[] = [];
    const fi: number[] = [];
    const farStep = (FAR_HALF * 2) / (FAR_GRID - 1);
    const heights: number[] = [];
    for (let j = 0; j < FAR_GRID; j++) {
      for (let i = 0; i < FAR_GRID; i++) {
        const x = -FAR_HALF + i * farStep;
        const z = -FAR_HALF + j * farStep;
        const h = field.farHeightAt(x, z);
        heights.push(h);
        fp.push(x, h - 3, z);
      }
    }
    for (let j = 0; j < FAR_GRID; j++) {
      for (let i = 0; i < FAR_GRID; i++) {
        // 手前の地面と同じ考え方で色を決める:草地を基本に、斜面は土と岩、太陽の向きで陰影を付ける
        const at = (ii: number, jj: number): number =>
          heights[Math.max(0, Math.min(FAR_GRID - 1, jj)) * FAR_GRID + Math.max(0, Math.min(FAR_GRID - 1, ii))];
        const gx = at(i - 1, j) - at(i + 1, j);
        const gz = at(i, j - 1) - at(i, j + 1);
        const slope = Math.hypot(gx, gz) / (2 * farStep);
        const fx = -FAR_HALF + i * farStep;
        const fz = -FAR_HALF + j * farStep;
        let c = mix(GRASS, GRASS_DRY, fbm(fx / 300, fz / 300, 3) * 0.9);
        c = mix(c, SOIL, smooth(0.1, 0.25, slope) * 0.6);
        c = mix(c, ROCK, smooth(0.25, 0.5, slope));
        const len = Math.hypot(gx, 2 * farStep, gz);
        const light = 0.62 + 0.55 * Math.max(0, (gx * SUN.x + 2 * farStep * SUN.y + gz * SUN.z) / len);
        // 絵の色(sRGB)と同じ明るさになるよう、光の計算用の値に直してから渡す
        const col = new THREE.Color().setRGB((c[0] * light) / 255, (c[1] * light) / 255, (c[2] * light) / 255, THREE.SRGBColorSpace);
        fc.push(col.r, col.g, col.b);
        if (i === FAR_GRID - 1 || j === FAR_GRID - 1) continue;
        // 細かい地面と重なる部分は作らない
        const x = -FAR_HALF + i * farStep;
        const z = -FAR_HALF + j * farStep;
        const inside = (v: number): boolean => v > -VIEW_HALF + 30 && v + farStep < VIEW_HALF - 30;
        if (inside(x) && inside(z)) continue;
        const a = j * FAR_GRID + i;
        fi.push(a, a + FAR_GRID, a + 1, a + 1, a + FAR_GRID, a + FAR_GRID + 1);
      }
    }
    const far = new THREE.BufferGeometry();
    far.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
    far.setAttribute("color", new THREE.Float32BufferAttribute(fc, 3));
    far.setIndex(fi);
    far.computeVertexNormals();
    this.group.add(new THREE.Mesh(far, new THREE.MeshLambertMaterial({ vertexColors: true })));

    // ----- 森:土地被覆が樹林の所に、木を立てる。同じ形をまとめて描く -----
    const trees: [number, number, number][] = [];
    for (let z = -460; z <= 460 && trees.length < MAX_TREES; z += 6) {
      for (let x = -460; x <= 460 && trees.length < MAX_TREES; x += 6) {
        const jx = x + (fbm(x * 3.1, z * 2.3, 1) - 0.5) * 6;
        const jz = z + (fbm(x * 1.7, z * 3.7, 2) - 0.5) * 6;
        if (field.coverAt(jx, jz) !== COVER.tree) continue;
        // 両軍が並ぶ場所の真上には立てない(兵士が見えなくなるため)
        if (Math.abs(jx) < 110 && Math.abs(Math.abs(jz) - 62) < 18) continue;
        trees.push([jx, jz, 0.7 + fbm(x * 5, z * 5, 3) * 0.6]);
      }
    }
    if (trees.length > 0) {
      const crown = new THREE.InstancedMesh(
        new THREE.ConeGeometry(1.7, 4.6, 6).translate(0, 3.8, 0),
        new THREE.MeshLambertMaterial({ color: "#ffffff" }), trees.length,
      );
      const trunk = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.22, 0.3, 1.8, 5).translate(0, 0.9, 0),
        new THREE.MeshLambertMaterial({ color: "#5a4632" }), trees.length,
      );
      const m = new THREE.Matrix4();
      const col = new THREE.Color();
      trees.forEach(([x, z, s], i) => {
        m.makeScale(s, s, s).setPosition(x, field.heightAt(x, z) - 0.15, z);
        crown.setMatrixAt(i, m);
        trunk.setMatrixAt(i, m);
        crown.setColorAt(i, col.setHSL(0.27 + 0.05 * fbm(x, z, 4), 0.42, 0.2 + 0.1 * fbm(z, x, 5)));
      });
      crown.castShadow = true;
      this.group.add(crown, trunk);
    }

    // ----- 光:空からの柔らかい光と、影を落とす太陽 -----
    // (地表の絵に陰影を描き込んであるので、地面への光は控えめにする)
    this.group.add(new THREE.HemisphereLight(0xe6eef5, 0x777060, 1.7));
    this.sun = new THREE.DirectionalLight(0xfff0d2, 1.5);
    this.sun.position.copy(SUN).multiplyScalar(320);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const cam = this.sun.shadow.camera;
    cam.left = -FIELD.width * 0.62;
    cam.right = FIELD.width * 0.62;
    cam.top = FIELD.depth * 0.75;
    cam.bottom = -FIELD.depth * 0.75;
    cam.near = 20;
    cam.far = 700;
    this.sun.shadow.bias = -0.002;
    this.group.add(this.sun, this.sun.target);
  }

  /** 空と、遠くがかすむ空気をシーンに設定する */
  applyTo(scene: THREE.Scene): void {
    scene.background = SKY;
    scene.fog = new THREE.Fog(SKY, 420, 2900);
    scene.add(this.group);
  }

  /** 戦闘が終わったら、絵と形が使っていたメモリを返す */
  dispose(): void {
    this.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      const material = o.material as THREE.MeshLambertMaterial;
      material.map?.dispose();
      material.dispose();
    });
  }
}
