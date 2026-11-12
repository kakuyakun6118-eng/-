// 地形ファイル(terrain.png)を読み込み、標高の表として使えるようにする。
// terrain.png は tools/bake_terrain.py が実物の標高データから作ったもの。
//   赤・緑 = 標高(メートル)  青 = 水辺までの距離(128より大きいと水の中)
import type { RegionData } from "../data/types";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("地形ファイルを読み込めませんでした"));
    img.src = url;
  });
}

export class HeightField {
  private constructor(
    readonly region: RegionData,
    /** 表の横・縦の点の数 */
    readonly width: number,
    readonly height: number,
    /** 各点の標高(メートル)。北西の角から、東へ、次に南へと並ぶ */
    readonly meters: Float32Array,
    /** 各点の水辺の値(128より大きいと水の中) */
    readonly water: Uint8Array,
  ) {}

  static async load(region: RegionData): Promise<HeightField> {
    const img = await loadImage(region.terrainUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const n = canvas.width * canvas.height;
    const meters = new Float32Array(n);
    const water = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      meters[i] = px[i * 4] * 256 + px[i * 4 + 1];
      water[i] = px[i * 4 + 2];
    }
    // 画像は読み終わったので、メモリを返す
    canvas.width = canvas.height = 0;
    return new HeightField(region, img.naturalWidth, img.naturalHeight, meters, water);
  }

  /** 好きな地点の標高(メートル)を、まわりの点からなめらかに求める */
  sample(lon: number, lat: number): number {
    const b = this.region.info.bounds;
    const fx = ((lon - b.west) / (b.east - b.west)) * (this.width - 1);
    const fy = ((b.north - lat) / (b.north - b.south)) * (this.height - 1);
    const x = Math.max(0, Math.min(this.width - 1.001, fx));
    const y = Math.max(0, Math.min(this.height - 1.001, fy));
    const i = Math.floor(x);
    const j = Math.floor(y);
    const tx = x - i;
    const ty = y - j;
    const d = this.meters;
    const w = this.width;
    const top = d[j * w + i] * (1 - tx) + d[j * w + i + 1] * tx;
    const bottom = d[(j + 1) * w + i] * (1 - tx) + d[(j + 1) * w + i + 1] * tx;
    return top * (1 - ty) + bottom * ty;
  }
}
