// 地形の「塗り方」を決める部分。
// 標高・斜面の急さ・気候から、草原・森林・岩肌・砂地・雪を自動で塗り分け、
// 日差しによる陰影と、遠くのかすみを付ける。計算はiPhoneの画像処理チップ(GPU)が行う。
import * as THREE from "three";
import { LON_SCALE, UNITS_PER_DEGREE } from "../core/geo";
import { createNoiseTexture } from "../core/noise";
import type { HeightField } from "./heightField";

/** 陰影を付けるときに、斜面をどれだけ強調するか(実際の何倍か) */
const SHADING_EXAGGERATION = 5;
/** 標高をこの値で割ってから絵に入れる(メートル) */
const MAX_METERS = 7000;

/** 霞(かすみ)の色。画面の背景にも同じ色を使う */
export const HAZE_COLOR = new THREE.Color(0.71, 0.77, 0.8);

/**
 * 標高の表から、塗り分けに使う絵を作る。
 * 赤・緑 = 地面の向き(陰影用) / 青 = 標高 / 透明度 = 水辺の値
 */
function createDataTexture(field: HeightField): THREE.DataTexture {
  const { width: W, height: H, meters, water } = field;
  const b = field.region.info.bounds;
  // 隣の点までの距離(3D空間での長さ)
  const dx = ((b.east - b.west) / (W - 1)) * LON_SCALE * UNITS_PER_DEGREE;
  const dz = ((b.north - b.south) / (H - 1)) * UNITS_PER_DEGREE;
  // 標高1mが3D空間でいくつになるか(実際の比率 × 強調)
  const k = (UNITS_PER_DEGREE / 111190) * SHADING_EXAGGERATION;

  const data = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    const jn = Math.max(0, j - 1);
    const js = Math.min(H - 1, j + 1);
    for (let i = 0; i < W; i++) {
      const iw = Math.max(0, i - 1);
      const ie = Math.min(W - 1, i + 1);
      const sx = ((meters[j * W + ie] - meters[j * W + iw]) * k) / ((ie - iw) * dx);
      const sz = ((meters[js * W + i] - meters[jn * W + i]) * k) / ((js - jn) * dz);
      const inv = 1 / Math.sqrt(sx * sx + 1 + sz * sz);
      const p = (j * W + i) * 4;
      data[p] = (-sx * inv * 0.5 + 0.5) * 255;
      data[p + 1] = (-sz * inv * 0.5 + 0.5) * 255;
      data[p + 2] = Math.sqrt(Math.min(1, meters[j * W + i] / MAX_METERS)) * 255;
      data[p + 3] = water[j * W + i];
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D tData;
  uniform sampler2D tNoise;
  uniform vec4 uBounds;   // 西端の経度, 北端の緯度, 東西の幅, 南北の幅
  uniform vec3 uSun;      // 太陽の方向
  uniform vec3 uHaze;     // かすみの色
  uniform float uHazeDistance;
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vec4 d = texture2D(tData, vUv);
    float meters = d.b * d.b * ${MAX_METERS.toFixed(1)};
    vec3 n;
    n.xz = d.rg * 2.0 - 1.0;
    n.y = sqrt(max(0.0, 1.0 - dot(n.xz, n.xz)));
    float slope = 1.0 - n.y; // 0 = 平ら、大きいほど急

    float lon = uBounds.x + vUv.x * uBounds.z;
    float lat = uBounds.y - vUv.y * uBounds.w;

    // 大きさの違うむらを4種類用意する(遠くからでも近くからでも単調に見えないように)
    vec2 wp = vWorld.xz;
    float nHuge = texture2D(tNoise, wp * 0.013).r;
    float nBig = texture2D(tNoise, wp * 0.09).g;
    float nMid = texture2D(tNoise, wp * 0.55).b;
    vec3 nFine = texture2D(tNoise, wp * 2.7).rgb;

    // --- 気候:北西ほど乾燥、南ほど湿潤 ---
    float dry = clamp((lat - 36.5) * 0.16 + (110.0 - lon) * 0.09 + (nHuge - 0.5) * 0.5, 0.0, 1.0);
    float south = smoothstep(35.5, 31.0, lat);

    // --- 平地の色:草原・農地 → 乾いた草原 → 砂漠 ---
    vec3 grass = mix(vec3(0.38, 0.48, 0.22), vec3(0.56, 0.58, 0.30), nBig * 0.6 + nHuge * 0.4);
    grass = mix(grass, vec3(0.31, 0.45, 0.20), south * 0.7);
    grass *= 0.9 + 0.2 * nMid;
    vec3 steppe = mix(vec3(0.60, 0.57, 0.36), vec3(0.68, 0.62, 0.40), nMid);
    vec3 sand = mix(vec3(0.74, 0.63, 0.42), vec3(0.86, 0.76, 0.54), nMid * 0.6 + nBig * 0.4);
    vec3 col = mix(grass, steppe, smoothstep(0.22, 0.55, dry));
    col = mix(col, sand, smoothstep(0.62, 0.92, dry));

    // --- 黄土高原:黄色っぽい土 ---
    float loess = smoothstep(650.0, 1050.0, meters) * (1.0 - smoothstep(1800.0, 2300.0, meters))
      * smoothstep(103.0, 105.0, lon) * (1.0 - smoothstep(111.5, 113.0, lon))
      * smoothstep(34.4, 35.2, lat) * (1.0 - smoothstep(38.8, 40.0, lat));
    col = mix(col, mix(vec3(0.60, 0.56, 0.34), vec3(0.70, 0.63, 0.42), nMid), loess * 0.6);

    // --- 森林:湿った地域の丘や山 ---
    float treeline = 3300.0 + (nBig - 0.5) * 500.0;
    float forest = smoothstep(0.012, 0.07, slope + (nBig - 0.5) * 0.03)
      * (1.0 - smoothstep(0.35, 0.7, dry))
      * (1.0 - smoothstep(treeline - 500.0, treeline, meters))
      * (1.0 - loess * 0.6);
    forest *= smoothstep(0.25, 0.55, nMid * 0.6 + nBig * 0.4 + south * 0.25 + slope * 1.5);
    vec3 forestCol = mix(vec3(0.11, 0.22, 0.10), vec3(0.22, 0.34, 0.15), nFine.r);
    forestCol *= 0.8 + 0.4 * nFine.g; // 木々のこんもりした濃淡
    col = mix(col, forestCol, forest * 0.92);

    // --- 高山:森林限界より上は草地、さらに上は雪 ---
    float alpine = smoothstep(treeline - 300.0, treeline + 300.0, meters);
    col = mix(col, mix(vec3(0.50, 0.47, 0.32), vec3(0.58, 0.54, 0.40), nMid), alpine * (1.0 - dry * 0.5));

    // --- 岩肌:急な斜面 ---
    float rock = smoothstep(0.22, 0.42, slope + (nMid - 0.5) * 0.12 + dry * 0.06);
    vec3 rockCol = mix(vec3(0.42, 0.38, 0.33), vec3(0.60, 0.56, 0.50), nFine.b);
    rockCol = mix(rockCol, vec3(0.62, 0.50, 0.37), dry * 0.6);
    col = mix(col, rockCol, rock * 0.85);

    float snow = smoothstep(4500.0, 5100.0, meters + (nBig - 0.5) * 600.0) * (1.0 - rock * 0.5);
    col = mix(col, vec3(0.93, 0.95, 0.97), snow);

    // --- 細かな凹凸:近づいたときに地面がのっぺりしないように ---
    float rough = mix(0.05, 0.3, clamp(slope * 5.0 + forest * 0.5, 0.0, 1.0));
    n.xz += (nFine.rg - 0.5) * rough + (vec2(nMid, nBig) - 0.5) * rough * 0.6;
    n = normalize(n);

    // --- 水:海・湖・川 ---
    float w = d.a + (nFine.b - 0.5) * 0.006;
    float aw = fwidth(d.a) * 0.75 + 0.003;
    float waterAmt = smoothstep(0.502 - aw, 0.502 + aw, w);
    // 岸辺は湿った土の色にする
    col = mix(col, vec3(0.47, 0.45, 0.33), smoothstep(0.42, 0.5, w) * 0.45 * (1.0 - waterAmt));

    // --- 日差しと陰影 ---
    float diff = max(dot(n, uSun), 0.0);
    vec3 light = vec3(0.46, 0.52, 0.62) * (0.55 + 0.45 * n.y) + vec3(1.0, 0.93, 0.80) * diff * 1.15;
    col *= light;

    if (waterAmt > 0.0) {
      vec3 view = normalize(cameraPosition - vWorld);
      float sea = 1.0 - step(0.5, meters);
      vec3 shallow = mix(vec3(0.23, 0.42, 0.47), vec3(0.24, 0.50, 0.55), sea);
      vec3 deep = mix(vec3(0.16, 0.33, 0.42), vec3(0.09, 0.27, 0.41), sea);
      vec3 waterCol = mix(shallow, deep, smoothstep(0.52, mix(0.62, 1.0, sea), d.a));
      // さざ波による光の反射
      vec3 wn = normalize(vec3((nFine.r - 0.5) * 0.35, 1.0, (nFine.g - 0.5) * 0.35));
      float glint = pow(max(dot(reflect(-uSun, wn), view), 0.0), 60.0);
      float fresnel = pow(1.0 - max(dot(wn, view), 0.0), 3.0);
      waterCol = mix(waterCol, uHaze, fresnel * 0.18) + vec3(1.0, 0.95, 0.85) * glint * 0.3;
      col = mix(col, waterCol, waterAmt);
    }

    // --- 遠くのかすみ。地図の端は霧の中に消えるようにする ---
    float dist = length(cameraPosition - vWorld);
    float haze = 1.0 - exp(-pow(dist / uHazeDistance, 2.0));
    vec2 e = min(vUv, 1.0 - vUv);
    float edge = 1.0 - smoothstep(0.0, 0.035, min(e.x, e.y));
    col = mix(col, uHaze, clamp(max(haze * 0.9, edge), 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createTerrainMaterial(field: HeightField): THREE.ShaderMaterial {
  const b = field.region.info.bounds;
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tData: { value: createDataTexture(field) },
      tNoise: { value: createNoiseTexture() },
      uBounds: { value: new THREE.Vector4(b.west, b.north, b.east - b.west, b.north - b.south) },
      // 北西のやや低い位置から照らすと、山のひだが一番はっきり見える
      uSun: { value: new THREE.Vector3(-0.62, 0.52, -0.58).normalize() },
      uHaze: { value: HAZE_COLOR },
      uHazeDistance: { value: 400 },
    },
  });
}
