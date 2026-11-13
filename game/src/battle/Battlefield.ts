// 戦場の3D表示。実地形のデータ(FieldMap)から、地面・地表の質感・水辺・森・遠景・空・光と影を作る。
//
// 高さ・土地被覆・水域は実データのまま使う。色合いや樹種などの「見た目の演出」は、
// 地域ごとの景観の設定(data/rules/landscapes.json)で決めており、史実の再現ではない。
import * as THREE from "three";
import { createNoiseTexture } from "../core/noise";
import landscapeList from "../data/rules/landscapes.json";
import { FIELD } from "./deploy";
import { COVER, fbm, FieldMap, VIEW_HALF } from "./fieldData";
import { treeGeometry, type TreeKind } from "./trees";

/** 地域ごとの景観の設定 */
export interface Landscape {
  id: string;
  name: string;
  /** この設定の根拠(史実ではなく設定であることを明記する) */
  basis: string;
  match: { west?: number; east?: number; south?: number; north?: number; minMeanMeters?: number };
  grassA: string; grassB: string; dryGrass: string; soil: string; sand: string;
  rock: string; rockDark: string; forestFloor: string; shrub: string; wetland: string;
  /** 土の見える割合・乾いた草の割合の調整 */
  soilBias: number;
  dryBias: number;
  /** この標高(メートル)から上では、松や柏が増える */
  pineFrom: number;
  /** 樹林でない所に、まばらに木を立てる割合 */
  scatter: number;
}

/** 会戦地点と平均の標高から、景観の設定を選ぶ(一覧の上から順に、条件に合う最初のもの) */
export function pickLandscape(lon: number, lat: number, meanMeters: number): Landscape {
  const list = landscapeList as Landscape[];
  return (
    list.find((l) => {
      const m = l.match;
      if (m.west !== undefined && lon < m.west) return false;
      if (m.east !== undefined && lon > m.east) return false;
      if (m.south !== undefined && lat < m.south) return false;
      if (m.north !== undefined && lat > m.north) return false;
      if (m.minMeanMeters !== undefined && meanMeters < m.minMeanMeters) return false;
      return true;
    }) ?? list[list.length - 1]
  );
}

const HORIZON = new THREE.Color("#c6d4da");
const ZENITH = new THREE.Color("#6d9bcb");
/** 地面の格子の、1辺の点の数。中心ほど細かく、外側ほど粗くする */
const GRID = 221;
/** 遠景(戦略マップの実標高)を作る範囲の半分 */
const FAR_HALF = 3000;
const FAR_GRID = 51;
const MAX_TREES = 1600;
/** 傾きを絵に入れるときの上限(これ以上は同じ値になる) */
const SLOPE_MAX = 1.2;

/** 太陽の方向(北西のやや低い位置から照らすと、尾根と谷の陰影がはっきり出る) */
const SUN = new THREE.Vector3(-0.6, 0.5, -0.38).normalize();

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 表をぼかして、土地被覆の境目をなだらかにする */
function blur(src: Float32Array, n: number, passes: number): Float32Array {
  let a = src;
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let sum = 0;
        let count = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const x = i + di;
            const y = j + dj;
            if (x < 0 || y < 0 || x >= n || y >= n) continue;
            sum += a[y * n + x];
            count++;
          }
        }
        out[j * n + i] = sum / count;
      }
    }
    a = out;
  }
  return a;
}

function dataTexture(data: Uint8Array, size: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * 地形データを、描画用の3枚の絵にする。
 *   形 :地面の向き(x, z)・傾き・凹凸(尾根か谷か)
 *   被覆:樹林・裸地・湿地・水の深さ
 *   補助:標高・低木
 */
function createTerrainTextures(field: FieldMap): { shape: THREE.DataTexture; cover: THREE.DataTexture; aux: THREE.DataTexture } {
  const n = FieldMap.GRID;
  const cell = FieldMap.CELL;
  const at = (i: number, j: number): [number, number] => [i * cell - VIEW_HALF, j * cell - VIEW_HALF];
  const h = new Float32Array(n * n);
  const forest = new Float32Array(n * n);
  const bare = new Float32Array(n * n);
  const wet = new Float32Array(n * n);
  const water = new Float32Array(n * n);
  const shrub = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [x, z] = at(i, j);
      const k = j * n + i;
      h[k] = field.heightAt(x, z);
      const c = field.coverAt(x, z);
      forest[k] = c === COVER.tree ? 1 : 0;
      bare[k] = c === COVER.bare ? 1 : 0;
      wet[k] = c === COVER.wetland ? 1 : 0;
      shrub[k] = c === COVER.shrub ? 1 : 0;
      water[k] = field.waterAt(x, z); // 0 = 陸、0.5 = 浅瀬、1 = 深い水
    }
  }
  const forestB = blur(forest, n, 1);
  const bareB = blur(bare, n, 2);
  const wetB = blur(wet, n, 2);
  const shrubB = blur(shrub, n, 2);
  const waterB = blur(water, n, 1);

  const info = field.info;
  const span = Math.max(1, info.maxMeters - info.minMeters);
  const shape = new Uint8Array(n * n * 4);
  const cover = new Uint8Array(n * n * 4);
  const aux = new Uint8Array(n * n * 4);
  const hAt = (i: number, j: number): number => h[Math.max(0, Math.min(n - 1, j)) * n + Math.max(0, Math.min(n - 1, i))];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const dx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * cell);
      const dz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * cell);
      const inv = 1 / Math.hypot(dx, 1, dz);
      // 凹凸:まわりより高ければ尾根(明るく)、低ければ谷(暗く)。色の濃淡にだけ使い、高さは変えない
      const around = (hAt(i + 3, j) + hAt(i - 3, j) + hAt(i, j + 3) + hAt(i, j - 3)) / 4;
      const [x, z] = at(i, j);
      shape[k * 4] = (-dx * inv * 0.5 + 0.5) * 255;
      shape[k * 4 + 1] = (-dz * inv * 0.5 + 0.5) * 255;
      shape[k * 4 + 2] = Math.min(1, field.slopeAt(x, z) / SLOPE_MAX) * 255;
      shape[k * 4 + 3] = Math.max(0, Math.min(1, 0.5 + (h[k] - around) * 0.22)) * 255;
      cover[k * 4] = forestB[k] * 255;
      cover[k * 4 + 1] = bareB[k] * 255;
      cover[k * 4 + 2] = wetB[k] * 255;
      cover[k * 4 + 3] = waterB[k] * 255;
      aux[k * 4] = Math.max(0, Math.min(1, (field.metersAt(x, z) - info.minMeters) / span)) * 255;
      aux[k * 4 + 1] = shrubB[k] * 255;
      aux[k * 4 + 3] = 255;
    }
  }
  return { shape: dataTexture(shape, n), cover: dataTexture(cover, n), aux: dataTexture(aux, n) };
}

// ----- 地面の描き方(画面の1点ごとに、色と地面の向きを計算する) -----
const GROUND_PARS = /* glsl */ `
  uniform sampler2D tShape;
  uniform sampler2D tCover;
  uniform sampler2D tAux;
  uniform sampler2D tNoise;
  uniform vec3 uGrassA; uniform vec3 uGrassB; uniform vec3 uDryGrass; uniform vec3 uSoil; uniform vec3 uSand;
  uniform vec3 uRock; uniform vec3 uRockDark; uniform vec3 uForestFloor; uniform vec3 uShrub; uniform vec3 uWetland;
  uniform float uSoilBias; uniform float uDryBias; uniform float uHighland;
  uniform vec3 uSunDir;
  uniform float uTime;
  varying vec3 vGroundPos;
  vec3 gNormalW;
  float gWaterAmt;
`;

const GROUND_COLOR = /* glsl */ `
  vec2 gp = vGroundPos.xz;
  vec2 gUv = (gp + ${VIEW_HALF.toFixed(1)}) / ${(VIEW_HALF * 2).toFixed(1)};
  vec4 gShape = texture2D( tShape, gUv );
  vec4 gCover = texture2D( tCover, gUv );
  vec4 gAux = texture2D( tAux, gUv );
  float gSlope = gShape.b * ${SLOPE_MAX.toFixed(2)};

  // 大きさの違う模様を、向きを変えて重ねる(同じ模様の繰り返しが見えないように)
  vec2 gq = vec2( gp.x * 0.83 - gp.y * 0.56, gp.x * 0.56 + gp.y * 0.83 );
  vec2 gr = vec2( gp.x * 0.39 + gp.y * 0.92, -gp.x * 0.92 + gp.y * 0.39 );
  float nHuge = texture2D( tNoise, gp * 0.0031 ).r;
  float nBig = texture2D( tNoise, gq * 0.013 + 0.37 ).g;
  float nMid = texture2D( tNoise, gr * 0.061 + 0.11 ).b;
  float nSmall = texture2D( tNoise, gq * 0.29 ).r;
  vec3 nFine = texture2D( tNoise, gp * 1.37 ).rgb;
  float nGrain = texture2D( tNoise, gr * 5.3 ).g;

  // --- 草地:緑の草と乾いた草が、大きなまだらになる。近くでは草むらの濃淡が見える ---
  vec3 gCol = mix( uGrassA, uGrassB, nBig );
  gCol = mix( gCol, uDryGrass, smoothstep( 0.42, 0.72, nHuge * 0.55 + nMid * 0.45 + uDryBias ) );
  gCol *= 0.74 + 0.3 * nSmall + 0.3 * nFine.g * nGrain * 1.6;
  // --- 土:草の薄い所に、土がまだらに見える ---
  float gSoilAmt = smoothstep( 0.56, 0.74, nMid * 0.55 + nSmall * 0.3 + nFine.r * 0.15 + uSoilBias );
  vec3 gSoilCol = uSoil * ( 0.8 + 0.3 * nFine.b + 0.2 * nGrain );
  gCol = mix( gCol, gSoilCol, gSoilAmt * 0.85 );
  // --- 低木の斜面・湿地・裸地(砂や礫) ---
  gCol = mix( gCol, uShrub * ( 0.65 + 0.7 * nFine.g ), gAux.g * smoothstep( 0.3, 0.6, nSmall ) * 0.85 );
  gCol = mix( gCol, uWetland * ( 0.8 + 0.3 * nSmall ), gCover.b * 0.85 );
  gCol = mix( gCol, uSand * ( 0.86 + 0.2 * nFine.b + 0.12 * nGrain ), gCover.g * 0.9 );
  // --- 樹林:暗い林床。遠くからは、濃淡のある樹冠のまとまりに見える ---
  float gForest = smoothstep( 0.25, 0.7, gCover.r + ( nSmall - 0.5 ) * 0.35 );
  gCol = mix( gCol, uForestFloor * ( 0.55 + 0.8 * nFine.g * nSmall * 1.8 ), gForest * 0.9 );
  // --- 高地:標高が上がるほど、草が薄く土と岩が増える ---
  gCol = mix( gCol, mix( uDryGrass, uSoil, nMid ), gAux.r * uHighland * 0.45 * ( 1.0 - gForest ) );
  // --- 斜面:ゆるい斜面は土が露出し、急な斜面は岩肌になる。岩には横の縞(地層)を入れる ---
  float gExposed = smoothstep( 0.13, 0.3, gSlope + ( nMid - 0.5 ) * 0.1 ) * ( 1.0 - gForest * 0.6 );
  gCol = mix( gCol, gSoilCol, gExposed * 0.6 );
  float gRockAmt = smoothstep( 0.3, 0.58, gSlope + ( nSmall - 0.5 ) * 0.16 );
  float gStrata = texture2D( tNoise, vec2( gq.x * 0.02, vGroundPos.y * 0.31 ) ).r;
  vec3 gRockCol = mix( uRock, uRockDark, nFine.r * 0.6 + gStrata * 0.4 ) * ( 0.82 + 0.3 * nGrain );
  gCol = mix( gCol, gRockCol, gRockAmt );
  // --- 尾根は少し明るく、谷筋は少し暗くして、地形の形を読み取りやすくする ---
  gCol *= 0.72 + 0.56 * gShape.a;

  // --- 地面の向き:標高データから求めた向きに、細かな凹凸を足す ---
  gNormalW.xz = gShape.rg * 2.0 - 1.0;
  gNormalW.y = sqrt( max( 0.05, 1.0 - dot( gNormalW.xz, gNormalW.xz ) ) );
  float gRough = 0.1 + 0.5 * gRockAmt + 0.15 * gSoilAmt;
  gNormalW.xz += ( nFine.rb - 0.5 ) * gRough + ( vec2( nSmall, nGrain ) - 0.5 ) * gRough * 0.6;

  // --- 水辺:岸は湿った土。浅瀬は川底が透け、深い所は暗い色になる ---
  float gW = gCover.a + ( nSmall - 0.5 ) * 0.06;
  float gShore = smoothstep( 0.05, 0.22, gW );
  gCol = mix( gCol, uSoil * vec3( 0.52, 0.5, 0.42 ), gShore * 0.7 );
  gWaterAmt = smoothstep( 0.22, 0.32, gW );
  if ( gWaterAmt > 0.0 ) {
    vec2 gFlow = uTime * vec2( 0.035, 0.021 );
    vec3 gRip = texture2D( tNoise, gq * 0.21 + gFlow ).rgb + texture2D( tNoise, gr * 0.47 - gFlow * 1.7 ).gbr - 1.0;
    float gDepth = smoothstep( 0.38, 0.95, gW );
    vec3 gBed = mix( uSand, uSoil, nMid ) * 0.55;
    vec3 gWaterCol = mix( mix( gBed, vec3( 0.26, 0.4, 0.36 ), 0.55 ), vec3( 0.09, 0.22, 0.27 ), gDepth );
    gWaterCol += gRip.r * 0.035;
    gCol = mix( gCol, gWaterCol, gWaterAmt );
    gNormalW = mix( gNormalW, vec3( gRip.r * 0.22, 1.0, gRip.g * 0.22 ), gWaterAmt );
  }
  gNormalW = normalize( gNormalW );
  diffuseColor.rgb = gCol;
`;

const GROUND_NORMAL = /* glsl */ `
  normal = normalize( ( viewMatrix * vec4( gNormalW, 0.0 ) ).xyz );
  // 水面:太陽の反射と、浅い角度で見たときの空の映り込み
  if ( gWaterAmt > 0.0 ) {
    vec3 gView = normalize( vViewPosition );
    vec3 gSunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
    float gGlint = pow( max( dot( reflect( -gSunV, normal ), gView ), 0.0 ), 70.0 );
    float gFresnel = pow( 1.0 - max( dot( normal, gView ), 0.0 ), 4.0 );
    totalEmissiveRadiance += ( vec3( 1.0, 0.94, 0.82 ) * gGlint * 0.9 + vec3( 0.5, 0.6, 0.66 ) * gFresnel * 0.5 ) * gWaterAmt;
  }
`;

interface TreeBatch {
  mesh: THREE.InstancedMesh;
  total: number;
}

export class Battlefield {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  /** この戦場に使った景観の設定 */
  readonly landscape: Landscape;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly trees: TreeBatch[] = [];
  private readonly textures: THREE.Texture[] = [];
  private time = 0;

  constructor(readonly field: FieldMap) {
    const land = pickLandscape(field.lon, field.lat, field.info.meanMeters);
    this.landscape = land;
    const col = (hex: string): THREE.Color => new THREE.Color(hex);

    // ----- 地面:中心ほど細かい格子。実標高をそのまま高さにする -----
    // 格子の位置を曲げて、操作する範囲の近くに点を集める(遠くは粗くてよい)
    const warp = (s: number): number => VIEW_HALF * Math.sign(s) * (0.35 * Math.abs(s) + 0.65 * Math.abs(s) ** 2.2);
    const positions = new Float32Array(GRID * GRID * 3);
    for (let j = 0; j < GRID; j++) {
      const z = warp((j / (GRID - 1)) * 2 - 1);
      for (let i = 0; i < GRID; i++) {
        const x = warp((i / (GRID - 1)) * 2 - 1);
        positions.set([x, field.heightAt(x, z), z], (j * GRID + i) * 3);
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
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    const tex = createTerrainTextures(field);
    const noise = createNoiseTexture(256);
    this.textures.push(tex.shape, tex.cover, tex.aux, noise);
    this.uniforms = {
      tShape: { value: tex.shape },
      tCover: { value: tex.cover },
      tAux: { value: tex.aux },
      tNoise: { value: noise },
      uGrassA: { value: col(land.grassA) },
      uGrassB: { value: col(land.grassB) },
      uDryGrass: { value: col(land.dryGrass) },
      uSoil: { value: col(land.soil) },
      uSand: { value: col(land.sand) },
      uRock: { value: col(land.rock) },
      uRockDark: { value: col(land.rockDark) },
      uForestFloor: { value: col(land.forestFloor) },
      uShrub: { value: col(land.shrub) },
      uWetland: { value: col(land.wetland) },
      uSoilBias: { value: land.soilBias },
      uDryBias: { value: land.dryBias },
      // 高低差の大きい戦場でだけ、標高による植生の変化を付ける
      uHighland: { value: smooth(150, 600, field.info.maxMeters - field.info.minMeters) },
      uSunDir: { value: SUN },
      uTime: { value: 0 },
    };
    // 光・影・かすみは標準の仕組みをそのまま使い、色と地面の向きの計算だけを差し替える
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = `varying vec3 vGroundPos;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  vGroundPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;",
      );
      shader.fragmentShader = `${GROUND_PARS}\n${shader.fragmentShader}`
        .replace("#include <map_fragment>", GROUND_COLOR)
        .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>\n${GROUND_NORMAL}`);
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
    const grass = col(land.grassA).lerp(col(land.grassB), 0.5).lerp(col(land.dryGrass), 0.3).multiplyScalar(0.92);
    const rock = col(land.rock).lerp(col(land.soil), 0.4);
    const c = new THREE.Color();
    for (let j = 0; j < FAR_GRID; j++) {
      for (let i = 0; i < FAR_GRID; i++) {
        const at = (ii: number, jj: number): number =>
          heights[Math.max(0, Math.min(FAR_GRID - 1, jj)) * FAR_GRID + Math.max(0, Math.min(FAR_GRID - 1, ii))];
        const slope = Math.hypot(at(i - 1, j) - at(i + 1, j), at(i, j - 1) - at(i, j + 1)) / (2 * farStep);
        const fx = -FAR_HALF + i * farStep;
        const fz = -FAR_HALF + j * farStep;
        c.copy(grass).multiplyScalar(0.85 + 0.3 * fbm(fx / 300, fz / 300, 3)).lerp(rock, smooth(0.1, 0.4, slope));
        fc.push(c.r, c.g, c.b);
        if (i === FAR_GRID - 1 || j === FAR_GRID - 1) continue;
        // 細かい地面と重なる部分は作らない
        const inside = (v: number): boolean => v > -VIEW_HALF + 30 && v + farStep < VIEW_HALF - 30;
        if (inside(fx) && inside(fz)) continue;
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

    this.plantTrees(land);

    // ----- 空:地平線は白っぽく、天頂へ向かって青くなる -----
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(5200, 20, 10),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uHorizon: { value: HORIZON }, uZenith: { value: ZENITH }, uSunDir: { value: SUN } },
        vertexShader: "varying vec3 vDir; void main() { vDir = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }",
        fragmentShader: `
          uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSunDir; varying vec3 vDir;
          void main() {
            vec3 d = normalize( vDir );
            vec3 skyCol = mix( uHorizon, uZenith, pow( clamp( d.y, 0.0, 1.0 ), 0.55 ) );
            // 太陽のまわりは、少し明るくかすむ
            skyCol += vec3( 1.0, 0.9, 0.72 ) * pow( max( dot( d, uSunDir ), 0.0 ), 24.0 ) * 0.35;
            gl_FragColor = vec4( skyCol, 1.0 );
          }`,
      }),
    );
    sky.renderOrder = -1;
    this.group.add(sky);

    // ----- 光:空からの柔らかい光と、影を落とす太陽 -----
    this.group.add(new THREE.HemisphereLight(0xdde9f5, 0x6f6650, 1.25));
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
    this.sun.position.copy(SUN).multiplyScalar(340);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const cam = this.sun.shadow.camera;
    cam.left = -FIELD.width * 0.62;
    cam.right = FIELD.width * 0.62;
    cam.top = FIELD.depth * 0.8;
    cam.bottom = -FIELD.depth * 0.8;
    cam.near = 20;
    cam.far = 760;
    this.sun.shadow.bias = -0.002;
    this.group.add(this.sun, this.sun.target);
  }

  /**
   * 木を立てる。樹林の土地被覆には密に、低木の被覆には茂みを置く。
   * それ以外の所にも、設定に応じてまばらに木立を置く(水辺には少し多めに)。
   */
  private plantTrees(land: Landscape): void {
    const field = this.field;
    const lists: Record<TreeKind, number[]> = { broadleafA: [], broadleafB: [], poplar: [], pine: [], shrub: [] };
    let seed = 12345;
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let count = 0;
    const REACH = 470;
    const STEP = 4.6;
    for (let z = -REACH; z <= REACH; z += STEP) {
      for (let x = -REACH; x <= REACH; x += STEP) {
        const px = x + (rand() - 0.5) * STEP * 1.6;
        const pz = z + (rand() - 0.5) * STEP * 1.6;
        const r = rand();
        const cover = field.coverAt(px, pz);
        if (field.waterAt(px, pz) > 0 || field.slopeAt(px, pz) > 0.75) continue;
        // 両軍が並ぶ場所の真上には立てない(兵士が見えなくなるため)
        if (Math.abs(px) < 120 && Math.abs(Math.abs(pz) - 62) < 20) continue;
        const nearWater =
          field.waterAt(px + 10, pz) + field.waterAt(px - 10, pz) + field.waterAt(px, pz + 10) + field.waterAt(px, pz - 10) > 0;
        // 木立がかたまって生えるよう、ゆるやかな濃淡を掛ける
        const clump = fbm(px / 38, pz / 38, 17);
        let kind: TreeKind | null = null;
        if (cover === COVER.tree) {
          if (r > 0.8 + (clump - 0.5) * 0.3) continue;
          const pine = smooth(land.pineFrom, land.pineFrom + 450, field.metersAt(px, pz)) * 0.8 + smooth(0.25, 0.5, field.slopeAt(px, pz)) * 0.3;
          const pick = rand();
          kind = pick < pine ? "pine" : pick < pine + (1 - pine) * 0.45 ? "broadleafA" : pick < pine + (1 - pine) * 0.8 ? "broadleafB" : pick < 0.97 ? "poplar" : "shrub";
        } else if (cover === COVER.shrub) {
          if (r > 0.45) continue;
          kind = "shrub";
        } else if (cover === COVER.grass || cover === COVER.wetland) {
          const chance = (nearWater ? 0.1 : land.scatter) * (0.3 + clump * 1.6);
          if (r > chance) continue;
          const pick = rand();
          kind = nearWater ? (pick < 0.7 ? "broadleafB" : "poplar") : pick < 0.4 ? "broadleafA" : pick < 0.6 ? "poplar" : pick < 0.75 ? "broadleafB" : "shrub";
        }
        if (!kind) continue;
        // 位置(x, 高さ, z)、大きさ、向き、色の濃淡
        lists[kind].push(px, field.heightAt(px, pz) - 0.12, pz, 0.75 + rand() * 0.7, rand() * Math.PI * 2, 0.8 + rand() * 0.4);
        count++;
      }
    }

    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    for (const kind of Object.keys(lists) as TreeKind[]) {
      // 並び順をばらばらにしてから、上限を超える分を間引く(どの方角からも均等に減る)
      const all = lists[kind];
      const order = Array.from({ length: all.length / 6 }, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const total = Math.ceil(order.length * Math.min(1, MAX_TREES / Math.max(1, count)));
      if (total === 0) continue;
      const data: number[] = [];
      for (let i = 0; i < total; i++) data.push(...all.slice(order[i] * 6, order[i] * 6 + 6));
      const mesh = new THREE.InstancedMesh(treeGeometry(kind), material, total);
      for (let i = 0; i < total; i++) {
        const s = data[i * 6 + 3];
        dummy.position.set(data[i * 6], data[i * 6 + 1], data[i * 6 + 2]);
        dummy.rotation.set(0, data[i * 6 + 4], 0);
        // 高さと幅を別々に変えて、同じ形に見えないようにする
        dummy.scale.set(s * (0.85 + ((i * 7) % 10) * 0.03), s, s * (0.85 + ((i * 3) % 10) * 0.03));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const k = data[i * 6 + 5];
        mesh.setColorAt(i, tint.setRGB(k, k * (0.96 + ((i * 5) % 7) * 0.012), k * 0.92));
      }
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.trees.push({ mesh, total });
    }
  }

  /** 空と、遠くがかすむ空気をシーンに設定する */
  applyTo(scene: THREE.Scene): void {
    scene.background = HORIZON;
    scene.fog = new THREE.Fog(HORIZON, 380, 3000);
    scene.add(this.group);
  }

  /**
   * 毎フレーム呼ぶ。水面を動かし、カメラが遠いときは木の数を減らして軽くする。
   * (木は場所がばらばらな順に並べてあるので、先頭から一部だけ描いても、まんべんなく間引かれる)
   */
  update(dt: number, cameraDistance: number): void {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    const keep = cameraDistance < 150 ? 1 : cameraDistance < 300 ? 0.75 : 0.5;
    for (const t of this.trees) t.mesh.count = Math.ceil(t.total * keep);
  }

  /** 戦闘が終わったら、絵と形が使っていたメモリを返す */
  dispose(): void {
    for (const t of this.textures) t.dispose();
    for (const t of this.trees) t.mesh.dispose();
    this.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    });
  }
}
