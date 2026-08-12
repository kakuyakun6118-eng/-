/*
 * Natural Earth の行政区画データから、州ごとの SVG パスを生成して
 * src/ui/mapPaths.ts に書き出す。
 *
 * 実行時には地図ライブラリを一切使わない。ここで静的な path 文字列に
 * 変換してしまい、UI はそれを <path d=...> に流し込むだけにする。
 *   npm run map
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
// 中国以外の国（ヴェトナム・朝鮮・モンゴル）と背景の陸地は国単位で足りる
const topo = require('world-atlas/countries-50m.json');

/**
 * 地形と行政区画は Natural Earth の公開データから取る。
 * 手描きの近似ではなく実地形なので、秦嶺も黄河も実際の位置に出る。
 * 再生成にはネットワークが要る（生成物は mapPaths.ts に固定される）
 */
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
async function fetchGeo(name: string): Promise<any> {
  const res = await fetch(`${NE}/${name}.geojson`);
  if (!res.ok) throw new Error(`${name} の取得に失敗: ${res.status}`);
  return res.json();
}

/**
 * 表示範囲（経度・緯度）。
 *
 * 西は 73°E まで取って涼州の西端（西域）を、東は 135°E まで取って
 * 遼東と朝鮮を収める。南は 8°N まで下げて交州（現在のヴェトナム）を、
 * 北は 52°N まで上げて柔然と拓跋鮮卑の草原を収める。
 * この時代の「天下」はこの枠にほぼ収まる
 */
const LON_MIN = 73, LON_MAX = 136, LAT_MIN = 8, LAT_MAX = 52;
const WIDTH = 900;

/**
 * 州に対応する現代の行政区画。魏晋の州域の近似として使う。
 *
 * 州の境と省の境は当然ぴったりは重ならないが、省を割ることは
 * できないので **1つの省はどれか1つの州にだけ属す** ように配る。
 * 地図の色分けとデータが食い違わないことを優先する
 */
const PROVINCE_REGIONS: Record<string, string[]> = {
  // 司隷。都の洛陽を擁する天下の中心
  Si: ['Henan'],
  // 雍州。長安と関中
  Yong: ['Shaanxi', 'Ningxia'],
  // 涼州。河西回廊と西域
  Liang: ['Gansu', 'Qinghai', 'Xinjiang'],
  // 并州。汾水の谷。南匈奴が内徙した地
  Bing: ['Shanxi'],
  // 冀州。河北平原。鄴を擁する
  Ji: ['Hebei', 'Tianjin'],
  // 幽州。薊と遼西
  You: ['Beijing', 'Liaoning'],
  // 青州。山東半島
  Qing: ['Shandong'],
  // 豫州。淮水の北。南北の争奪点
  Yu: ['Anhui'],
  // 揚州。建康を擁する江南の中枢
  Yang: ['Jiangsu', 'Shanghai', 'Zhejiang'],
  // 荊州。江漢。上流から建康を睨む方鎮の地
  Jing: ['Hubei', 'Hunan'],
  // 江州。鄱陽湖と閩
  Jiang: ['Jiangxi', 'Fujian'],
  // 益州。蜀。四塞の地
  Yi: ['Sichuan', 'Chongqing'],
  // 寧州。南中
  Ning: ['Yunnan', 'Guizhou'],
  // 広州。嶺南
  Guang: ['Guangdong', 'Guangxi', 'Hainan'],
};

/** ラベルを置く区画。表示範囲に確実に入る大きなものを選ぶ */
const PROVINCE_LABEL_REGION: Record<string, string> = {
  Si: 'Henan',
  Yong: 'Shaanxi',
  Liang: 'Gansu',
  Bing: 'Shanxi',
  Ji: 'Hebei',
  You: 'Liaoning',
  Qing: 'Shandong',
  Yu: 'Anhui',
  Yang: 'Jiangsu',
  Jing: 'Hunan',
  Jiang: 'Jiangxi',
  Yi: 'Sichuan',
  Ning: 'Yunnan',
  Guang: 'Guangxi',
};

/** 交州だけは中国の外（現在のヴェトナム北部）なので国単位で取る */
const JIAO_COUNTRIES = ['Vietnam'];

/*
 * 胡族の郷里。中華の外に本拠を持つ勢力だけが面を持つ。
 *
 * 匈奴・羯・氐・羌・巴氐・盧水胡・丁零・乞伏はこの時代すでに
 * 塞内へ移り住んでいて（内徙）、州の中に暮らしている。
 * 帝国の外に攻め戻る郷里を持たないので、面では描かない。
 * **敵はすでに垣の内にいる** ことがこの時代の形なので、
 * 地図でもそのとおりに表す
 */
const HOMELAND_REGIONS: Record<string, string[]> = {
  // 盛楽。のちの北魏
  Tuoba: ['Inner Mongol'],
  // 遼東の北。慕容部の出た地
  Murong: ['Jilin'],
  // 松嫩平原。宇文部
  Yuwen: ['Heilongjiang'],
  // 青蔵高原の東北縁。吐谷渾
  Tuyuhun: ['Xizang'],
};

const HOMELAND_LABEL_REGION: Record<string, string> = {
  Tuoba: 'Inner Mongol',
  Murong: 'Jilin',
  Yuwen: 'Heilongjiang',
  Tuyuhun: 'Xizang',
};

/** 国単位で取る郷里。Natural Earth の 50m 行政区画に無い国 */
const HOMELAND_COUNTRIES: Record<string, string[]> = {
  // 漠北の草原
  Rouran: ['Mongolia'],
  // 高句麗。丸都・平壌
  Goguryeo: ['North Korea', 'South Korea'],
};

const HOMELAND_LABEL_COUNTRY: Record<string, string> = {
  Rouran: 'Mongolia',
  Goguryeo: 'North Korea',
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

/** 表示範囲にかかるリングだけ残す */
function ringInView(ring: number[][]): boolean {
  return ring.some(
    ([lon, lat]) =>
      lon >= LON_MIN - 4 && lon <= LON_MAX + 4 && lat >= LAT_MIN - 4 && lat <= LAT_MAX + 4,
  );
}

/**
 * 投影後の座標で、この距離より近い連続点は間引く（px）。
 * 州の輪郭は画面上でそのまま見えるので細かく、
 * 背景の陸地や支流は粗くと、用途ごとに切り替える
 */
let MIN_POINT_DISTANCE = 1.1;
/** 投影後の外接矩形がこれより小さいリングは捨てる（px） */
let MIN_RING_SIZE = 3;

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
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= MIN_POINT_DISTANCE) {
      kept.push(point);
    }
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
  let best: number[][] | null = null;
  let bestArea = -1;
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring || !ringInView(ring)) continue;
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    area = Math.abs(area / 2);
    if (area > bestArea) {
      bestArea = area;
      best = ring;
    }
  }
  if (!best) return [0, 0];
  const pts = best.map(project);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [Number(cx.toFixed(1)), Number(cy.toFixed(1))];
}

// ── 行政区画（中国の省）と国 ──────────────────────────────

const admin1 = await fetchGeo('ne_50m_admin_1_states_provinces');
const regionByName = new Map<string, any>();
for (const f of admin1.features) {
  if (f.properties.admin !== 'China') continue;
  regionByName.set(f.properties.name, f);
}

const countriesFc: any = feature(topo, topo.objects.countries);
const countryByName = new Map<string, any>();
for (const f of countriesFc.features) countryByName.set(f.properties.name, f);

/** 面を取った区画。背景の陸地から除くために覚えておく */
const usedRegions = new Set<string>();
const usedCountries = new Set<string>();

function pickRegionSet(names: string[], labelName: string) {
  const parts: string[] = [];
  let labelGeom: any = null;
  for (const name of names) {
    const f = regionByName.get(name);
    if (!f) {
      console.warn(`  見つからない区画: ${name}`);
      continue;
    }
    usedRegions.add(name);
    const d = geometryToPath(f.geometry);
    if (d) parts.push(d);
    if (name === labelName) labelGeom = f.geometry;
  }
  return {
    path: parts.join(''),
    label: (labelGeom ? labelPoint(labelGeom) : [0, 0]) as [number, number],
  };
}

function pickCountrySet(names: string[], labelName: string) {
  const parts: string[] = [];
  let labelGeom: any = null;
  for (const name of names) {
    const f = countryByName.get(name);
    if (!f) {
      console.warn(`  見つからない国: ${name}`);
      continue;
    }
    usedCountries.add(name);
    const d = geometryToPath(f.geometry);
    if (d) parts.push(d);
    if (name === labelName) labelGeom = f.geometry;
  }
  return {
    path: parts.join(''),
    label: (labelGeom ? labelPoint(labelGeom) : [0, 0]) as [number, number],
  };
}

const provincePaths: Record<string, string> = {};
const provinceLabels: Record<string, [number, number]> = {};

for (const [id, regions] of Object.entries(PROVINCE_REGIONS)) {
  const r = pickRegionSet(regions, PROVINCE_LABEL_REGION[id]);
  provincePaths[id] = r.path;
  provinceLabels[id] = r.label;
}
// 交州だけは国単位
{
  const r = pickCountrySet(JIAO_COUNTRIES, 'Vietnam');
  provincePaths.Jiao = r.path;
  provinceLabels.Jiao = r.label;
}

const homelandPaths: Record<string, string> = {};
const homelandLabels: Record<string, [number, number]> = {};
for (const [id, regions] of Object.entries(HOMELAND_REGIONS)) {
  const r = pickRegionSet(regions, HOMELAND_LABEL_REGION[id]);
  homelandPaths[id] = r.path;
  homelandLabels[id] = r.label;
}
for (const [id, countries] of Object.entries(HOMELAND_COUNTRIES)) {
  const r = pickCountrySet(countries, HOMELAND_LABEL_COUNTRY[id]);
  homelandPaths[id] = r.path;
  homelandLabels[id] = r.label;
}

/*
 * 州にも郷里にも属さない陸地（背景として暗く描く）。
 * 中国の省で取り残したものと、周辺の国をまとめて敷く
 */
MIN_POINT_DISTANCE = 2.4;
const contextParts: string[] = [];
for (const f of admin1.features) {
  if (f.properties.admin !== 'China') continue;
  if (usedRegions.has(f.properties.name)) continue;
  const d = geometryToPath(f.geometry);
  if (d) contextParts.push(d);
}
for (const f of countriesFc.features) {
  if (f.properties.name === 'China' || usedCountries.has(f.properties.name)) continue;
  const d = geometryToPath(f.geometry);
  if (d) contextParts.push(d);
}

// ── 地形（山脈・高原・平原・砂漠・湖・河川） ──────────────
/*
 * 地形は 1:10m を使う。1:50m だと表示範囲内の山地が数件しか無く、
 * 秦嶺や大別山といった南北を分ける中規模の山地が抜け落ちる。
 * 頂点は投影後に間引くので、描画負荷は元データの解像度ではなく
 * 下の MIN_POINT_DISTANCE で決まる
 */
MIN_POINT_DISTANCE = 1.3;
const regionPolys = await fetchGeo('ne_10m_geography_regions_polys');
const lakes = await fetchGeo('ne_50m_lakes');
const rivers = await fetchGeo('ne_10m_rivers_lake_centerlines');

const pickGeoRegions = (classes: string[]): string => {
  const parts: string[] = [];
  for (const f of regionPolys.features) {
    const cls = f.properties.featurecla ?? f.properties.FEATURECLA;
    if (!classes.includes(cls)) continue;
    const d = geometryToPath(f.geometry);
    if (d) parts.push(d);
  }
  return parts.join('');
};

const mountainPath = pickGeoRegions(['Range/mtn']);

/*
 * 山脈以外の面は輪郭をそのまま見せず色の帯として敷くだけなので、
 * 粗く間引いてよい
 */
MIN_POINT_DISTANCE = 1.8;
const desertPath = pickGeoRegions(['Desert']);
const plateauPath = pickGeoRegions(['Plateau']);
const plainPath = pickGeoRegions(['Plain', 'Basin', 'Lowland', 'Valley']);

// 湖。小さいものが多いので最小サイズを緩める
MIN_POINT_DISTANCE = 1.2;
MIN_RING_SIZE = 1.5;
const lakeParts: string[] = [];
for (const f of lakes.features) {
  const d = geometryToPath(f.geometry);
  if (d) lakeParts.push(d);
}
const lakePath = lakeParts.join('');

/*
 * 河川は主流と支流に分ける。太さと不透明度を変えて描くと水系の広がりが出る。
 * この時代の争いは黄河と長江と淮水の線で起きるので、大河は太く描く
 */
const MAJOR_RIVER_MAX_RANK = 5;
const majorParts: string[] = [];
const minorParts: string[] = [];
for (const f of rivers.features) {
  const rank = f.properties.scalerank ?? f.properties.SCALERANK ?? 9;
  const major = rank <= MAJOR_RIVER_MAX_RANK;
  MIN_POINT_DISTANCE = major ? 1.3 : 3;
  const d = linesToPath(f.geometry);
  if (!d) continue;
  (major ? majorParts : minorParts).push(d);
}
const riverPath = majorParts.join('');
const minorRiverPath = minorParts.join('');

const kb = (s: string) => (s.length / 1024).toFixed(0) + 'KB';
console.log(
  `山地 ${kb(mountainPath)} / 高原 ${kb(plateauPath)} / 平原 ${kb(plainPath)} / ` +
    `砂漠 ${kb(desertPath)} / 湖 ${kb(lakePath)} / 河川 ${kb(riverPath)}+${kb(minorRiverPath)}`,
);

const out = `// 自動生成。手で編集しない。
// 生成元: Natural Earth 1:50m / 1:10m, npm world-atlas / scripts/generate-map.ts
// 実行時に地図ライブラリは使わず、この静的なパス文字列だけを描画する。
// 州の領域は魏晋期の近似として現代の行政区画を組み合わせている。
import type { ProvinceId } from '../core/types';

export const MAP_VIEWBOX = '0 0 ${WIDTH} ${HEIGHT}';

/** 州にも郷里にも属さない陸地。背景として描く */
export const CONTEXT_LAND_PATH = ${JSON.stringify(contextParts.join(''))};

/**
 * 経緯度をこの地図の座標へ写す。州の輪郭と同じ投影を使うので、
 * 表示範囲を変えてもここを通した座標はずれない。
 * 手で置いた地点（都城・胡族の待機位置など）は必ずこれを通すこと
 */
const LON_MIN_RAD = ${rad(LON_MIN).toFixed(10)};
const MERC_Y_TOP = ${yTop.toFixed(10)};
const MAP_SCALE = ${scale.toFixed(6)};

export function projectLonLat(lon: number, lat: number): [number, number] {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const mercator = (deg: number) => Math.log(Math.tan(Math.PI / 4 + toRad(deg) / 2));
  return [(toRad(lon) - LON_MIN_RAD) * MAP_SCALE, (MERC_Y_TOP - mercator(lat)) * MAP_SCALE];
}

/** 山地。起伏の陰影を付ける下地に使う（Natural Earth Range/mtn） */
export const MOUNTAIN_PATH = ${JSON.stringify(mountainPath)};

/** 高原。山地と平地の中間の色味にする（Natural Earth Plateau） */
export const PLATEAU_PATH = ${JSON.stringify(plateauPath)};

/** 平原・盆地・低地。緑を強めて肥沃に見せる */
export const PLAIN_PATH = ${JSON.stringify(plainPath)};

/** 砂漠。地形の色味を変える（Natural Earth Desert） */
export const DESERT_PATH = ${JSON.stringify(desertPath)};

/** 湖（Natural Earth 1:50m lakes） */
export const LAKE_PATH = ${JSON.stringify(lakePath)};

/** 主要な河川（scalerank ${MAJOR_RIVER_MAX_RANK} 以下）。黄河・長江・淮水 */
export const RIVER_PATH = ${JSON.stringify(riverPath)};

/** 支流。細く薄く描いて水系の広がりを出す */
export const MINOR_RIVER_PATH = ${JSON.stringify(minorRiverPath)};

/** 胡族の郷里。中華の外に本拠を持つ勢力だけが面を持つ */
export const HOMELAND_PATHS: Record<string, string> = ${JSON.stringify(homelandPaths, null, 2)};

export const HOMELAND_LABEL_POINTS: Record<string, [number, number]> = ${JSON.stringify(homelandLabels, null, 2)};

export const PROVINCE_PATHS: Record<ProvinceId, string> = ${JSON.stringify(provincePaths, null, 2)} as Record<ProvinceId, string>;

/** ラベルを置く座標 */
export const PROVINCE_LABEL_POINTS: Record<ProvinceId, [number, number]> = ${JSON.stringify(provinceLabels, null, 2)} as Record<ProvinceId, [number, number]>;
`;
writeFileSync('src/ui/mapPaths.ts', out);
console.log(`viewBox 0 0 ${WIDTH} ${HEIGHT}`);
console.log(`出力サイズ: ${(out.length / 1024).toFixed(0)} KB`);
