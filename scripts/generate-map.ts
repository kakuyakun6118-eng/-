/*
 * Natural Earth (world-atlas) の国境データから、属州ごとの SVG パスを
 * 生成して src/ui/mapPaths.ts に書き出す。
 *
 * 実行時には地図ライブラリを一切使わない。ここで静的な path 文字列に
 * 変換してしまい、UI はそれを <path d=...> に流し込むだけにする。
 *   npx tsx scripts/generate-map.ts
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
// 属州は輪郭がそのまま見えるので 50m、帝国外の背景陸地は 110m で足りる
const topo = require('world-atlas/countries-50m.json');
const topoCoarse = require('world-atlas/countries-110m.json');

/**
 * 地形（山脈・砂漠・河川）は Natural Earth の公開データから取る。
 * 手描きの近似ではなく実地形なので、アルプスやピレネーが実際の位置に出る。
 * 再生成にはネットワークが要る（生成物は mapPaths.ts に固定される）
 */
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
async function fetchGeo(name: string): Promise<any> {
  const res = await fetch(`${NE}/${name}.geojson`);
  if (!res.ok) throw new Error(`${name} の取得に失敗: ${res.status}`);
  return res.json();
}

/** 表示範囲（経度・緯度） */
const LON_MIN = -11, LON_MAX = 31, LAT_MIN = 29, LAT_MAX = 59;
const WIDTH = 760;

/** 属州に対応する現代の国。ローマ期の領域の近似として使う */
const PROVINCE_COUNTRIES: Record<string, string[]> = {
  Britannia: ['United Kingdom'],
  Gallia: ['France', 'Belgium', 'Netherlands', 'Luxembourg', 'Switzerland'],
  Hispania: ['Spain', 'Portugal'],
  Italia: ['Italy', 'San Marino'],
  Illyricum: ['Croatia', 'Bosnia and Herz.', 'Serbia', 'Montenegro', 'Albania', 'Slovenia', 'Kosovo', 'Macedonia'],
  Noricum: ['Austria', 'Hungary', 'Slovakia'],
  Africa: ['Tunisia', 'Algeria', 'Libya', 'Morocco'],
};

// メルカトル図法。経度・緯度ともラジアンで扱う
const rad = (deg: number) => (deg * Math.PI) / 180;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
const scale = WIDTH / (rad(LON_MAX) - rad(LON_MIN));
const yTop = mercY(LAT_MAX);
const HEIGHT = Math.round((yTop - mercY(LAT_MIN)) * scale);
const project = ([lon, lat]: number[]): [number, number] => [
  (rad(lon) - rad(LON_MIN)) * scale,
  (yTop - mercY(lat)) * scale,
];

/** 表示範囲にかかるリングだけ残す。フランス海外県などを落とすため */
function ringInView(ring: number[][]): boolean {
  return ring.some(([lon, lat]) =>
    lon >= LON_MIN - 3 && lon <= LON_MAX + 3 && lat >= LAT_MIN - 3 && lat <= LAT_MAX + 3);
}

/** 投影後の座標で、この距離より近い連続点は間引く（px） */
let MIN_POINT_DISTANCE = 1.8;
/** 投影後の外接矩形がこれより小さいリングは捨てる（px） */
const MIN_RING_SIZE = 4;

function ringToPath(ring: number[][]): string | null {
  const projected = ring.map(project);

  const xs = projected.map((p) => p[0]);
  const ys = projected.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  // 表示しても点にしかならない小島は落とす
  if (w < MIN_RING_SIZE && h < MIN_RING_SIZE) return null;

  const kept: [number, number][] = [projected[0]];
  for (const point of projected.slice(1, -1)) {
    const last = kept[kept.length - 1];
    const dx = point[0] - last[0];
    const dy = point[1] - last[1];
    if (dx * dx + dy * dy >= MIN_POINT_DISTANCE * MIN_POINT_DISTANCE) kept.push(point);
  }
  if (kept.length < 3) return null;

  const pts = kept.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`);
  return `M${pts.join('L')}Z`;
}

/** 線分（河川）用。閉じずに描く */
function lineToPath(coords: number[][]): string | null {
  const projected = coords.map(project);
  const kept: [number, number][] = [projected[0]];
  for (const point of projected.slice(1)) {
    const last = kept[kept.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= MIN_POINT_DISTANCE) kept.push(point);
  }
  if (kept.length < 2) return null;
  return `M${kept.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}`;
}

function linesToPath(geom: any): string {
  const lines: number[][][] = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
  const parts: string[] = [];
  for (const line of lines) {
    if (!ringInView(line)) continue;
    const d = lineToPath(line);
    if (d) parts.push(d);
  }
  return parts.join('');
}

function geometryToPath(geom: any): string {
  const polys: number[][][][] = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const parts: string[] = [];
  for (const poly of polys) {
    for (const ring of poly) {
      if (ring.length < 4 || !ringInView(ring)) continue;
      const d = ringToPath(ring);
      if (d) parts.push(d);
    }
  }
  return parts.join('');
}

/** 面積が最大のリングの重心。ラベルの置き場所に使う */
function labelPoint(geom: any): [number, number] {
  const polys: number[][][][] = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let best: number[][] | null = null, bestArea = -1;
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring || !ringInView(ring)) continue;
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    area = Math.abs(area / 2);
    if (area > bestArea) { bestArea = area; best = ring; }
  }
  if (!best) return [0, 0];
  const pts = best.map(project);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [Number(cx.toFixed(1)), Number(cy.toFixed(1))];
}

const fc: any = feature(topo, topo.objects.countries);
const byName = new Map<string, any>();
for (const f of fc.features) byName.set(f.properties.name, f);

const owned = new Set<string>();
const provincePaths: Record<string, string> = {};
const provinceLabels: Record<string, [number, number]> = {};

for (const [province, countries] of Object.entries(PROVINCE_COUNTRIES)) {
  const parts: string[] = [];
  let labelGeom: any = null, labelArea = -1;
  for (const name of countries) {
    const f = byName.get(name);
    if (!f) { console.warn(`  見つからない国: ${name}`); continue; }
    owned.add(name);
    const d = geometryToPath(f.geometry);
    if (d) parts.push(d);
    const approx = JSON.stringify(f.geometry).length;
    if (approx > labelArea) { labelArea = approx; labelGeom = f.geometry; }
  }
  provincePaths[province] = parts.join('');
  provinceLabels[province] = labelPoint(labelGeom);
}

// 属州に属さない陸地（背景として暗く描く）。粗い解像度で十分
MIN_POINT_DISTANCE = 3;
const fcCoarse: any = feature(topoCoarse, topoCoarse.objects.countries);
const contextParts: string[] = [];
for (const f of fcCoarse.features) {
  if (owned.has(f.properties.name)) continue;
  const d = geometryToPath(f.geometry);
  if (d) contextParts.push(d);
}

// ── 地形（山脈・砂漠・河川） ──────────────────────────
MIN_POINT_DISTANCE = 1.2;
const regions = await fetchGeo('ne_50m_geography_regions_polys');
const rivers = await fetchGeo('ne_50m_rivers_lake_centerlines');

const pickRegions = (classes: string[]): string => {
  const parts: string[] = [];
  for (const f of regions.features) {
    if (!classes.includes(f.properties.FEATURECLA)) continue;
    const d = geometryToPath(f.geometry);
    if (d) parts.push(d);
  }
  return parts.join('');
};

const mountainPath = pickRegions(['Range/mtn']);
const desertPath = pickRegions(['Desert']);

MIN_POINT_DISTANCE = 1.6;
const riverParts: string[] = [];
for (const f of rivers.features) {
  const d = linesToPath(f.geometry);
  if (d) riverParts.push(d);
}
const riverPath = riverParts.join('');
console.log(`山脈 ${(mountainPath.length/1024).toFixed(0)}KB / 砂漠 ${(desertPath.length/1024).toFixed(0)}KB / 河川 ${(riverPath.length/1024).toFixed(0)}KB`);

const out = `// 自動生成。手で編集しない。
// 生成元: Natural Earth 1:50m (npm world-atlas) / scripts/generate-map.ts
// 実行時に地図ライブラリは使わず、この静的なパス文字列だけを描画する。
// 属州の領域はローマ期の近似として現代の国境を組み合わせている。
import type { ProvinceId } from '../core/types';

export const MAP_VIEWBOX = '0 0 ${WIDTH} ${HEIGHT}';

/** 属州に属さない陸地。背景として描く */
export const CONTEXT_LAND_PATH = ${JSON.stringify(contextParts.join(''))};

/** 山脈。起伏の陰影を付ける下地に使う（Natural Earth Range/mtn） */
export const MOUNTAIN_PATH = ${JSON.stringify(mountainPath)};

/** 砂漠。地形の色味を変える（Natural Earth Desert） */
export const DESERT_PATH = ${JSON.stringify(desertPath)};

/** 河川（Natural Earth rivers_lake_centerlines） */
export const RIVER_PATH = ${JSON.stringify(riverPath)};

export const PROVINCE_PATHS: Record<ProvinceId, string> = ${JSON.stringify(provincePaths, null, 2)} as Record<ProvinceId, string>;

/** ラベルを置く座標 */
export const PROVINCE_LABEL_POINTS: Record<ProvinceId, [number, number]> = ${JSON.stringify(provinceLabels, null, 2)} as Record<ProvinceId, [number, number]>;
`;
writeFileSync('src/ui/mapPaths.ts', out);
console.log(`viewBox 0 0 ${WIDTH} ${HEIGHT}`);
console.log(`出力サイズ: ${(out.length / 1024).toFixed(0)} KB`);
