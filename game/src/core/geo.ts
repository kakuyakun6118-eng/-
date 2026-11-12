// 緯度経度 ⇔ 3D座標 の変換。ゲーム全体でここだけが変換を担当する。
// 地図の描き方(投影法)を変えたくなったら、このファイルだけ直せばよい。

/** 地図の基準点。ここが3D空間の原点(0, 0)になる */
const ORIGIN_LON = 112;
const ORIGIN_LAT = 36;

/** 緯度1度を3D空間でいくつの長さにするか */
export const UNITS_PER_DEGREE = 10;

/** 経度1度は緯度1度より短いので、その比率(基準緯度での値) */
export const LON_SCALE = Math.cos((ORIGIN_LAT * Math.PI) / 180);

/**
 * 標高(メートル)を3D空間の高さに直す。
 * 実際の比率だと山がほとんど平らに見えるので、約14倍に強調している。
 */
export function metersToWorld(meters: number): number {
  return meters * 0.0013;
}

/** 緯度経度 → 3D空間の位置。東が +x、北が -z(画面の奥) */
export function toWorld(lon: number, lat: number): { x: number; z: number } {
  return {
    x: (lon - ORIGIN_LON) * LON_SCALE * UNITS_PER_DEGREE,
    z: -(lat - ORIGIN_LAT) * UNITS_PER_DEGREE,
  };
}

/** 3D空間の位置 → 緯度経度 */
export function toLonLat(x: number, z: number): { lon: number; lat: number } {
  return {
    lon: x / (LON_SCALE * UNITS_PER_DEGREE) + ORIGIN_LON,
    lat: -z / UNITS_PER_DEGREE + ORIGIN_LAT,
  };
}
