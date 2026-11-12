// 地表に自然なむらを付けるための「ノイズ」の絵を作る。
// 上下左右がつながる(タイル状に並べても継ぎ目が出ない)ように作っている。
import * as THREE from "three";

function hash(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

/** period ごとに繰り返す、なめらかなノイズ */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % period) + period) % period;
  const y0 = ((iy % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function tileableFbm(u: number, v: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = 4;
  for (let i = 0; i < 5; i++) {
    sum += valueNoise(u * period, v * period, period, seed + i) * amp;
    norm += amp;
    amp *= 0.55;
    period *= 2;
  }
  return sum / norm;
}

/** 赤・緑・青にそれぞれ別のノイズを入れた、くり返し貼れる絵 */
export function createNoiseTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;
      data[p] = tileableFbm(u, v, 1) * 255;
      data[p + 1] = tileableFbm(u, v, 20) * 255;
      data[p + 2] = tileableFbm(u, v, 40) * 255;
      data[p + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
