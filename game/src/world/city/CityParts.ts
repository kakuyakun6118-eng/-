// 都市を組み立てる「部品」の形と質感。すべての都市で同じものを使い回す。
import * as THREE from "three";

/** 部品の形:箱 / 城壁(下が広い台形) / 寄棟屋根 / 四角錐の屋根 */
export type PartShape = "box" | "wall" | "hip" | "pyramid";
/** 部品の質感:壁や土台 / 瓦屋根 / 水 */
export type PartSurface = "body" | "tile" | "water";

/** 箱。底が y=0、上が y=1 */
function boxGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
}

/** 城壁。版築(土を突き固めた壁)らしく、上に行くほど細くなる */
function wallGeometry(): THREE.BufferGeometry {
  const g = boxGeometry();
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0.5) pos.setZ(i, pos.getZ(i) * 0.7);
  }
  g.computeVertexNormals();
  return g;
}

/** 寄棟(よせむね)屋根。棟は x 方向に通る */
function hipRoofGeometry(): THREE.BufferGeometry {
  const r = 0.28; // 棟の長さの半分
  const A = [-0.5, 0, 0.5];
  const B = [0.5, 0, 0.5];
  const C = [0.5, 0, -0.5];
  const D = [-0.5, 0, -0.5];
  const R1 = [r, 1, 0];
  const R0 = [-r, 1, 0];
  const pos: number[] = [];
  const uv: number[] = [];
  const tri = (p: number[][], t: number[][]) => {
    p.forEach((v) => pos.push(...v));
    t.forEach((v) => uv.push(...v));
  };
  // 南面・北面(台形)
  tri([A, B, R1], [[0, 0], [1, 0], [0.78, 1]]);
  tri([A, R1, R0], [[0, 0], [0.78, 1], [0.22, 1]]);
  tri([C, D, R0], [[0, 0], [1, 0], [0.78, 1]]);
  tri([C, R0, R1], [[0, 0], [0.78, 1], [0.22, 1]]);
  // 東面・西面(三角)
  tri([B, C, R1], [[0, 0], [1, 0], [0.5, 1]]);
  tri([D, A, R0], [[0, 0], [1, 0], [0.5, 1]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** 四角錐の屋根(楼閣や望楼の上) */
function pyramidGeometry(): THREE.BufferGeometry {
  return new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0);
}

/** 小さな絵を描いて、質感として使う */
function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 土壁・石・木に共通の、ざらつきと横縞(土を突き固めた層) */
function bodyTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) {
      ctx.fillStyle = "rgba(0,0,0,0.07)";
      ctx.fillRect(0, y, 64, 1);
    }
    for (let i = 0; i < 500; i++) {
      const v = Math.random() < 0.5 ? 0 : 255;
      ctx.fillStyle = `rgba(${v},${v},${v},0.05)`;
      ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
    }
  });
}

/** 瓦屋根:軒から棟へ向かう瓦の列 */
function tileTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 8) {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(x, 0, 3, 64);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x + 5, 0, 1, 64);
    }
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 56, 64, 8); // 軒先を少し暗く
  });
}

export interface CityPartLibrary {
  shapes: Record<PartShape, THREE.BufferGeometry>;
  surfaces: Record<PartSurface, THREE.Material>;
}

let library: CityPartLibrary | null = null;

/** 部品一式。最初に呼ばれたときに一度だけ作る */
export function getCityParts(): CityPartLibrary {
  if (!library) {
    library = {
      shapes: {
        box: boxGeometry(),
        wall: wallGeometry(),
        hip: hipRoofGeometry(),
        pyramid: pyramidGeometry(),
      },
      surfaces: {
        body: new THREE.MeshLambertMaterial({ map: bodyTexture() }),
        tile: new THREE.MeshLambertMaterial({ map: tileTexture(), side: THREE.DoubleSide }),
        water: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      },
    };
  }
  return library;
}
