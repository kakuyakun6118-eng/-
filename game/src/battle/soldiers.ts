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
  /** 動く部分の印。1・2 = 左右の脚(馬は前脚・後脚) / 3 = 武器を持つ腕 */
  part?: number;
  /** 動く部分の付け根の高さ(ここを中心に振れる) */
  pivot?: number;
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
    // 動く部分の印と付け根の高さ。描画のときに、この情報を使って脚や腕を振る
    const limb = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) limb.set([b.part ?? 0, b.pivot ?? 0], i * 2);
    g.setAttribute("limb", new THREE.BufferAttribute(limb, 2));
    g.deleteAttribute("uv");
    return g;
  });
  return mergeGeometries(parts)!;
}

/** 歩く兵士の体(脚2本・すそ・胴・両腕・頭・兜)。前は -z 方向 */
function man(armor: string, tunic: string, helmet: string, y = 0): Box[] {
  return [
    { size: [0.15, 0.78, 0.2], at: [-0.11, y + 0.39, 0], color: CLOTH_DARK, part: 1, pivot: y + 0.78 }, // 左脚
    { size: [0.15, 0.78, 0.2], at: [0.11, y + 0.39, 0], color: CLOTH_DARK, part: 2, pivot: y + 0.78 }, // 右脚
    { size: [0.46, 0.36, 0.32], at: [0, y + 0.92, 0], color: tunic }, // 衣のすそ
    { size: [0.5, 0.5, 0.32], at: [0, y + 1.3, 0], color: armor }, // 胴
    { size: [0.13, 0.5, 0.15], at: [-0.33, y + 1.27, 0], color: tunic }, // 左腕
    { size: [0.13, 0.5, 0.15], at: [0.33, y + 1.27, -0.04], color: tunic, part: 3, pivot: y + 1.5 }, // 右腕(武器を持つ)
    { size: [0.26, 0.26, 0.26], at: [0, y + 1.7, 0], color: SKIN }, // 頭
    { size: [0.3, 0.14, 0.3], at: [0, y + 1.86, 0], color: helmet }, // 兜
  ];
}

/** 武器(木と鉄でできた、体の右側にある部品)を、武器を持つ腕と一緒に動くようにする */
function armed(boxes: Box[], pivot: number): Box[] {
  return boxes.map((b) => ((b.color === WOOD || b.color === IRON) && b.at[0] > 0.25 ? { ...b, part: 3, pivot } : b));
}

/** 馬。乗り手の腰が y = 1.4 あたりに来る。前脚と後脚を別々に動かす */
function horse(coat: string, cloth: string, barding: boolean): Box[] {
  const legs: Box[] = [[-0.2, -0.6], [0.2, -0.6], [-0.2, 0.6], [0.2, 0.6]].map(([x, z]) => ({
    size: [0.14, 0.8, 0.14] as [number, number, number], at: [x, 0.4, z] as [number, number, number], color: coat,
    part: z < 0 ? 1 : 2, pivot: 0.8,
  }));
  return [
    ...legs,
    { size: [0.56, 0.6, 1.7], at: [0, 1.05, 0], color: coat }, // 胴
    { size: [0.3, 0.7, 0.4], at: [0, 1.55, -0.85], color: coat }, // 首
    { size: [0.26, 0.3, 0.5], at: [0, 1.9, -1.1], color: coat }, // 頭
    { size: [0.1, 0.5, 0.1], at: [0, 1.0, 0.9], color: CLOTH_DARK }, // 尾
    { size: [0.62, 0.12, 0.85], at: [0, 1.38, 0.05], color: cloth }, // 鞍掛け
    ...(barding ? [{ size: [0.62, 0.5, 0.25] as [number, number, number], at: [0, 1.05, -0.8] as [number, number, number], color: cloth }] : []),
  ];
}

function rider(armor: string, helmet: string): Box[] {
  return [
    { size: [0.13, 0.46, 0.15], at: [-0.32, 1.72, 0.05], color: armor }, // 左腕
    { size: [0.13, 0.46, 0.15], at: [0.32, 1.72, 0.0], color: armor, part: 3, pivot: 1.95 }, // 右腕(武器を持つ)
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
  // ----- 攻城兵器(1台を1つの形として描く) -----
  // 衝車:屋根の付いた車に、先のとがった丸太を吊るす
  ram: () => [
    { size: [3.2, 0.5, 6.5], at: [0, 0.9, 0], color: WOOD },
    { size: [3.6, 0.3, 7.0], at: [0, 3.3, 0], color: LEATHER },
    { size: [0.3, 2.3, 0.3], at: [-1.4, 2.1, -2.8], color: WOOD }, { size: [0.3, 2.3, 0.3], at: [1.4, 2.1, -2.8], color: WOOD },
    { size: [0.3, 2.3, 0.3], at: [-1.4, 2.1, 2.8], color: WOOD }, { size: [0.3, 2.3, 0.3], at: [1.4, 2.1, 2.8], color: WOOD },
    { size: [0.7, 0.7, 8.5], at: [0, 2.0, -1.0], color: "#4d3a28" },
    { size: [0.9, 0.9, 0.9], at: [0, 2.0, -5.5], color: IRON },
    { size: [0.4, 1.4, 1.4], at: [-1.8, 0.7, -2], color: CLOTH_DARK }, { size: [0.4, 1.4, 1.4], at: [1.8, 0.7, -2], color: CLOTH_DARK },
    { size: [0.4, 1.4, 1.4], at: [-1.8, 0.7, 2], color: CLOTH_DARK }, { size: [0.4, 1.4, 1.4], at: [1.8, 0.7, 2], color: CLOTH_DARK },
  ],
  // 投石機:台の上の支柱と、長い腕
  catapult: () => [
    { size: [3.4, 0.5, 5.0], at: [0, 0.6, 0], color: WOOD },
    { size: [0.4, 4.2, 0.4], at: [-1.2, 2.9, 0], color: WOOD }, { size: [0.4, 4.2, 0.4], at: [1.2, 2.9, 0], color: WOOD },
    { size: [2.8, 0.35, 0.35], at: [0, 5.0, 0], color: WOOD },
    { size: [0.3, 0.3, 8.0], at: [0, 5.2, 1.2], color: "#4d3a28" },
    { size: [1.1, 1.1, 1.1], at: [0, 5.0, -2.6], color: IRON },
    { size: [0.9, 0.5, 0.9], at: [0, 5.3, 5.0], color: LEATHER },
  ],
  // 櫓(攻城塔):城壁と同じ高さの、板で覆った塔
  siegeTower: () => [
    { size: [4.2, 0.6, 4.2], at: [0, 0.7, 0], color: WOOD },
    { size: [3.6, 9.0, 3.6], at: [0, 5.4, 0], color: "#5e4a35" },
    { size: [4.2, 0.4, 4.2], at: [0, 10.0, 0], color: WOOD },
    { size: [4.2, 1.0, 0.3], at: [0, 10.6, -2.0], color: LEATHER },
    { size: [0.2, 2.4, 0.2], at: [1.7, 11.4, 1.7], color: CLOTH_DARK },
    { size: [1.6, 1.0, 0.1], at: [2.5, 12.0, 1.7], color: TINT },
  ],
  // 雲梯:車に載せた、斜めの長い梯子
  ladder: () => [
    { size: [2.4, 0.4, 4.0], at: [0, 0.6, 0], color: WOOD },
    { size: [0.2, 9.5, 0.2], at: [-0.7, 5.0, -1.2], color: WOOD }, { size: [0.2, 9.5, 0.2], at: [0.7, 5.0, -1.2], color: WOOD },
    ...[1.5, 3, 4.5, 6, 7.5, 9].map((y) => ({ size: [1.4, 0.15, 0.15] as [number, number, number], at: [0, y, -1.2] as [number, number, number], color: WOOD })),
  ],
  // 倒れた兵
  fallen: () => [{ size: [0.5, 0.18, 1.5], at: [0, 0.09, 0], color: "#4a3f36" }],
};

/** 兵士の動きに使う時刻。会戦の表示側が、毎フレーム書き換える */
export const soldierClock = { value: 0 };

/**
 * 兵士用の質感。頂点の色を使い、印の付いた部分だけ勢力の色で染める。
 * 脚と武器を持つ腕は、兵士ごとの「動きの種類」に合わせて振る(計算は画像処理チップが行うので軽い)。
 *   動きの種類: 0 = 立つ / 1 = 歩く / 2 = 走る / 3 = 武器を振るう / 4 = 射る
 */
function createMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSoldierTime = soldierClock;
    shader.vertexShader = `attribute float tintMask;\nattribute vec2 limb;\nattribute vec2 anim;\nuniform float uSoldierTime;\n${shader.vertexShader}`
      .replace(
        "#include <color_vertex>",
        THREE.ShaderChunk.color_vertex.replace(
          "vColor.rgb *= instanceColor.rgb;",
          "vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, tintMask );",
        ),
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        if ( limb.x > 0.5 ) {
          float gMode = anim.y;
          float gRun = step( 1.5, gMode ) * step( gMode, 2.5 );
          float gWalk = step( 0.5, gMode ) * step( gMode, 1.5 );
          float gStride = gRun * 0.95 + gWalk * 0.55;
          float gBeat = uSoldierTime * mix( 7.0, 11.0, gRun ) + anim.x;
          float gAngle = 0.0;
          if ( limb.x < 1.5 ) gAngle = sin( gBeat ) * gStride;
          else if ( limb.x < 2.5 ) gAngle = -sin( gBeat ) * gStride;
          else if ( gMode > 3.5 ) gAngle = -0.55 - 0.3 * sin( uSoldierTime * 2.2 + anim.x );
          else if ( gMode > 2.5 ) gAngle = -( 0.2 + 1.0 * abs( sin( uSoldierTime * 4.5 + anim.x ) ) );
          else gAngle = sin( gBeat ) * gStride * 0.35;
          float gCos = cos( gAngle );
          float gSin = sin( gAngle );
          vec3 gRel = transformed - vec3( 0.0, limb.y, 0.0 );
          transformed = vec3( gRel.x, gRel.y * gCos - gRel.z * gSin, gRel.y * gSin + gRel.z * gCos ) + vec3( 0.0, limb.y, 0.0 );
        }`,
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
          // 歩兵の武器は肩の高さ、騎兵の武器は乗り手の肩の高さを中心に振る
          const mounted = shape === "lightCavalry" || shape === "heavyCavalry" || shape === "guard" || shape === "general";
          const engine = shape === "ram" || shape === "catapult" || shape === "siegeTower" || shape === "ladder";
          g = build(engine ? SHAPES[shape]() : armed(SHAPES[shape](), mounted ? 1.95 : 1.5));
          cache.set(shape, g);
        }
        return g;
      },
      material: createMaterial(),
    };
  }
  return library;
}
