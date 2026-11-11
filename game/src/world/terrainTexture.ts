// 地形の表面に貼る「絵」を作る。高さで色を塗り分け、その上に海と川を描く。
// 川を絵として描くので、3Dの部品が重なってちらつくことがない。
import * as THREE from "three";
import { fbm } from "../core/noise";
import type { LonLatPair, RegionData } from "../data/types";
import type { HeightField } from "./heightField";

type RGB = [number, number, number];

const PLAIN: RGB = [128, 160, 92];
const PLAIN_SOUTH: RGB = [98, 146, 84];
const STEPPE: RGB = [196, 180, 122];
const HILL: RGB = [172, 154, 104];
const MOUNTAIN: RGB = [134, 108, 80];
const ROCK: RGB = [122, 112, 106];
const SNOW: RGB = [238, 240, 242];
const SEA = "#3b6c94";
const COAST = "rgba(190, 215, 225, 0.55)";
const RIVER = "#4d8fc2";

function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function landColor(h: number, lon: number, lat: number): RGB {
  // 北と西ほど乾いた草原・砂漠の色、南ほど濃い緑にする
  const dry = Math.max(0, Math.min(1, (lat - 38.5) / 3.5 + (107 - lon) / 7));
  const south = Math.max(0, Math.min(1, (34 - lat) / 3));
  let c = mix(mix(PLAIN, PLAIN_SOUTH, south), STEPPE, dry);
  c = mix(c, mix(HILL, STEPPE, dry * 0.6), (h - 0.35) / 0.6);
  c = mix(c, MOUNTAIN, (h - 1.0) / 0.9);
  c = mix(c, ROCK, (h - 2.2) / 1.0);
  c = mix(c, SNOW, (h - 3.4) / 0.7);
  return c;
}

export function createTerrainTexture(field: HeightField, region: RegionData): THREE.CanvasTexture {
  const { bounds } = region.info;
  const W = 2048;
  const H = Math.round((W * (field.rows - 1)) / (field.cols - 1));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // 1. 高さに応じて陸地の色を塗る
  const img = ctx.createImageData(W, H);
  const lonSpan = bounds.east - bounds.west;
  const latSpan = bounds.north - bounds.south;
  for (let y = 0; y < H; y++) {
    const lat = bounds.north - (y / (H - 1)) * latSpan;
    for (let x = 0; x < W; x++) {
      const lon = bounds.west + (x / (W - 1)) * lonSpan;
      const h = field.sample(lon, lat);
      const c = landColor(h, lon, lat);
      const grain = 0.92 + 0.16 * fbm(lon * 9, lat * 9, 2);
      const p = (y * W + x) * 4;
      img.data[p] = c[0] * grain;
      img.data[p + 1] = c[1] * grain;
      img.data[p + 2] = c[2] * grain;
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const px = (p: LonLatPair): [number, number] => [
    ((p[0] - bounds.west) / lonSpan) * W,
    ((bounds.north - p[1]) / latSpan) * H,
  ];

  // 2. 海を塗る
  for (const sea of region.terrain.seas) {
    ctx.beginPath();
    sea.polygon.forEach((p, i) => {
      const [x, y] = px(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = SEA;
    ctx.fill();
    ctx.strokeStyle = COAST;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  // 3. 川を描く(点と点の間をなめらかな曲線でつなぐ)
  ctx.strokeStyle = RIVER;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const river of region.rivers) {
    const pts = river.points.map(px);
    ctx.lineWidth = river.width * 2.2;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
