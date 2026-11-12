// 兵士と騎馬の形。箱を組み合わせて、兵科ごとに1つの形にまとめる。
// 「勢力の色で染める部分」(衣・盾・馬衣など)に印を付けておき、同じ形を両軍で色違いに使い回す。
// 将来、勢力ごとに服装や鎧を変えたいときは、ここに形を足して選び分ければよい。
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { UnitClassId } from "./types";

const SKIN = "#d9b38c";
const CLOTH_DARK = "#3a3530";
const WOOD = "#6a4a30";
const IRON = "#9a9da0";
const LEATHER = "#6b5136";
const LAMELLAR = "#4a4540";
const STEEL = "#7c8084";
const GOLD = "#e3c060";
/** 勢力の色で染める部分は、白で作っておく */
const TINT = "#ffffff";

interface Box {
  size: [number, number, number];
  at: [number, number, number];
  color: string;
}

/** 箱の一覧を、1つの形にまとめる。色と「染める印」を頂点ごとに持たせる */
function build(boxes: Box[]): THREE.BufferGeometry {
  const parts = boxes.map((b) => {
    const g = new THREE.BoxGeometry(...b.size).translate(...b.at);
    const n = g.getAttribute("position").count;
    const c = new THREE.Color(b.color);
    const colors = new Float32Array(n * 3);
    const mask = new Float32Array(n).fill(b.color === TINT ? 1 : 0);
    for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("tintMask", new THREE.BufferAttribute(mask, 1));
    g.deleteAttribute("uv");
    return g;
  });
  return mergeGeometries(parts)!;
}

/** 歩く兵士の体。前は -z 方向 */
function man(armor: string, tunic: string, helmet: string, y = 0): Box[] {
  return [
    { size: [0.34, 0.75, 0.26], at: [0, y + 0.375, 0], color: CLOTH_DARK }, // 脚
    { size: [0.46, 0.4, 0.32], at: [0, y + 0.9, 0], color: tunic }, // 衣のすそ
    { size: [0.52, 0.5, 0.34], at: [0, y + 1.3, 0], color: armor }, // 胴
    { size: [0.26, 0.26, 0.26], at: [0, y + 1.7, 0], color: SKIN }, // 頭
    { size: [0.3, 0.14, 0.3], at: [0, y + 1.86, 0], color: helmet }, // 兜
  ];
}

/** 馬。乗り手の腰が y = 1.4 あたりに来る */
function horse(coat: string, cloth: string, barding: boolean): Box[] {
  const legs: Box[] = [[-0.2, -0.6], [0.2, -0.6], [-0.2, 0.6], [0.2, 0.6]].map(([x, z]) => ({
    size: [0.14, 0.8, 0.14] as [number, number, number], at: [x, 0.4, z] as [number, number, number], color: coat,
  }));
  return [
    ...legs,
    { size: [0.56, 0.6, 1.7], at: [0, 1.05, 0], color: coat }, // 胴
    { size: [0.3, 0.7, 0.4], at: [0, 1.55, -0.85], color: coat }, // 首
    { size: [0.26, 0.3, 0.5], at: [0, 1.9, -1.1], color: coat }, // 頭
    { size: [0.62, 0.12, 0.85], at: [0, 1.38, 0.05], color: cloth }, // 鞍掛け
    ...(barding ? [{ size: [0.62, 0.5, 0.25] as [number, number, number], at: [0, 1.05, -0.8] as [number, number, number], color: cloth }] : []),
  ];
}

function rider(armor: string, helmet: string): Box[] {
  return [
    { size: [0.5, 0.55, 0.34], at: [0, 1.75, 0.05], color: armor },
    { size: [0.26, 0.26, 0.26], at: [0, 2.18, 0.05], color: SKIN },
    { size: [0.3, 0.14, 0.3], at: [0, 2.34, 0.05], color: helmet },
  ];
}

const SHAPES: Record<UnitClassId | "general" | "fallen", () => Box[]> = {
  // 槍兵:革の鎧に長い槍
  spearmen: () => [
    ...man(LEATHER, TINT, LAMELLAR),
    { size: [0.05, 2.7, 0.05], at: [0.32, 1.45, -0.1], color: WOOD },
    { size: [0.08, 0.3, 0.08], at: [0.32, 2.9, -0.1], color: IRON },
  ],
  // 剣盾兵:札甲に、勢力の色の盾と剣
  swordsmen: () => [
    ...man(LAMELLAR, TINT, LAMELLAR),
    { size: [0.5, 0.72, 0.08], at: [-0.16, 1.15, -0.24], color: TINT },
    { size: [0.06, 0.8, 0.06], at: [0.34, 1.45, -0.05], color: IRON },
  ],
  // 重装歩兵:鉄の鎧に大盾と戟。兜に勢力の色の飾り
  heavyInfantry: () => [
    ...man(STEEL, TINT, STEEL),
    { size: [0.56, 0.95, 0.09], at: [-0.14, 1.05, -0.26], color: TINT },
    { size: [0.06, 2.3, 0.06], at: [0.36, 1.3, -0.05], color: WOOD },
    { size: [0.3, 0.1, 0.06], at: [0.36, 2.35, -0.05], color: IRON },
    { size: [0.1, 0.22, 0.1], at: [0, 2.04, 0], color: TINT },
  ],
  // 弓兵:鎧を着ず、勢力の色の衣に弓
  archers: () => [
    { size: [0.34, 0.75, 0.26], at: [0, 0.375, 0], color: CLOTH_DARK },
    { size: [0.48, 0.9, 0.32], at: [0, 1.1, 0], color: TINT },
    { size: [0.26, 0.26, 0.26], at: [0, 1.7, 0], color: SKIN },
    { size: [0.3, 0.1, 0.3], at: [0, 1.85, 0], color: LEATHER },
    { size: [0.05, 1.3, 0.05], at: [0.3, 1.3, -0.2], color: WOOD },
    { size: [0.12, 0.5, 0.12], at: [-0.2, 1.2, 0.22], color: LEATHER }, // 矢筒
  ],
  // 弩兵:勢力の色の衣に、横に構えた弩
  crossbowmen: () => [
    { size: [0.34, 0.75, 0.26], at: [0, 0.375, 0], color: CLOTH_DARK },
    { size: [0.48, 0.9, 0.32], at: [0, 1.1, 0], color: TINT },
    { size: [0.26, 0.26, 0.26], at: [0, 1.7, 0], color: SKIN },
    { size: [0.3, 0.14, 0.3], at: [0, 1.86, 0], color: LAMELLAR },
    { size: [0.8, 0.06, 0.1], at: [0, 1.3, -0.45], color: WOOD },
    { size: [0.08, 0.08, 0.6], at: [0, 1.3, -0.2], color: WOOD },
  ],
  // 軽騎兵:軽い鎧に槍
  lightCavalry: () => [
    ...horse("#6b4a32", TINT, false),
    ...rider(LEATHER, LAMELLAR),
    { size: [0.05, 2.6, 0.05], at: [0.38, 2.1, -0.2], color: WOOD },
  ],
  // 重騎兵:馬にも鎧(勢力の色の馬衣)を着せ、長い矛を持つ
  heavyCavalry: () => [
    ...horse("#3a2f28", TINT, true),
    ...rider(STEEL, STEEL),
    { size: [0.06, 3.0, 0.06], at: [0.4, 2.2, -0.2], color: WOOD },
    { size: [0.1, 0.4, 0.1], at: [0.4, 3.8, -0.2], color: IRON },
  ],
  // 本陣の護衛
  guard: () => [
    ...horse("#2c2622", TINT, true),
    ...rider(STEEL, GOLD),
    { size: [0.06, 2.8, 0.06], at: [0.4, 2.2, -0.2], color: WOOD },
    { size: [0.1, 0.36, 0.1], at: [0.4, 3.7, -0.2], color: IRON },
  ],
  // 指揮官:金の鎧に、勢力の色の外套。ひと回り大きく描く
  general: () => [
    ...horse("#e8e2d4", TINT, true),
    ...rider(GOLD, GOLD),
    { size: [0.6, 0.8, 0.08], at: [0, 1.75, 0.3], color: TINT },
    { size: [0.1, 0.3, 0.1], at: [0, 2.56, 0.05], color: TINT },
  ],
  // 倒れた兵
  fallen: () => [{ size: [0.5, 0.18, 1.5], at: [0, 0.09, 0], color: "#4a3f36" }],
};

/** 兵士用の質感:頂点の色を使い、印の付いた部分だけ勢力の色で染める */
function createMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float tintMask;\n${shader.vertexShader}`.replace(
      "#include <color_vertex>",
      THREE.ShaderChunk.color_vertex.replace(
        "vColor.rgb *= instanceColor.rgb;",
        "vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, tintMask );",
      ),
    );
  };
  return material;
}

export type SoldierShape = keyof typeof SHAPES;

export interface SoldierLibrary {
  geometry(shape: SoldierShape): THREE.BufferGeometry;
  material: THREE.MeshLambertMaterial;
}

let library: SoldierLibrary | null = null;

/** 兵士の形と質感。最初に呼ばれたときに一度だけ作る */
export function getSoldiers(): SoldierLibrary {
  if (!library) {
    const cache = new Map<SoldierShape, THREE.BufferGeometry>();
    library = {
      geometry(shape) {
        let g = cache.get(shape);
        if (!g) {
          g = build(SHAPES[shape]());
          cache.set(shape, g);
        }
        return g;
      },
      material: createMaterial(),
    };
  }
  return library;
}
