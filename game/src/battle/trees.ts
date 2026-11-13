// 木の形。幹と、いびつな葉のかたまりを組み合わせて、数種類の木を作る。
// 少ない面数で作り、同じ形をまとめて描く(インスタンシング)ので、数千本あってもiPhoneで動く。
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type TreeKind = "broadleafA" | "broadleafB" | "poplar" | "pine" | "shrub";

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** 形に、頂点ごとの色を付ける。高い所ほど明るくして、葉に光が当たっている感じを出す */
function paint(g: THREE.BufferGeometry, color: string, rand: () => number, shadeByHeight: boolean): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  const pos = out.getAttribute("position");
  const c = new THREE.Color(color);
  const colors = new Float32Array(pos.count * 3);
  out.computeBoundingBox();
  const box = out.boundingBox!;
  const span = Math.max(0.001, box.max.y - box.min.y);
  // 面ごとに少し明るさを変える(葉のかたまりの凹凸に見える)
  for (let f = 0; f < pos.count; f += 3) {
    const k0 = 0.82 + rand() * 0.36;
    for (let v = 0; v < 3; v++) {
      const h = shadeByHeight ? 0.72 + 0.4 * ((pos.getY(f + v) - box.min.y) / span) : 1;
      colors.set([c.r * k0 * h, c.g * k0 * h, c.b * k0 * h], (f + v) * 3);
    }
  }
  out.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  out.deleteAttribute("uv");
  out.computeVertexNormals();
  return out;
}

/** いびつな葉のかたまり */
function blob(rand: () => number, rx: number, ry: number, rz: number, x: number, y: number, z: number, color: string): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.getAttribute("position");
  // 同じ位置の頂点は同じだけ動かす(面がばらばらにならないように)
  const moved = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = moved.get(key);
    if (k === undefined) {
      k = 0.78 + rand() * 0.44;
      moved.set(key, k);
    }
    pos.setXYZ(i, pos.getX(i) * rx * k + x, pos.getY(i) * ry * k + y, pos.getZ(i) * rz * k + z);
  }
  return paint(g, color, rand, true);
}

function trunk(rand: () => number, radius: number, height: number, lean: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius * 0.55, radius, height, 5).translate(0, height / 2, 0);
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + (pos.getY(i) / height) * lean);
  return paint(g, "#5b4630", rand, false);
}

const BUILDERS: Record<TreeKind, () => THREE.BufferGeometry[]> = {
  // 広葉樹(楡やナラのような、横に広がる樹冠)
  broadleafA: () => {
    const r = seeded(11);
    return [
      trunk(r, 0.32, 3.2, 0.25),
      blob(r, 2.3, 2.0, 2.2, 0.2, 4.7, 0, "#557a36"),
      blob(r, 1.6, 1.3, 1.6, -1.3, 3.7, 0.6, "#476a2e"),
      blob(r, 1.5, 1.2, 1.5, 1.2, 3.6, -0.8, "#5a7d38"),
    ];
  },
  // 広葉樹(柳のような、丸く垂れた樹冠)
  broadleafB: () => {
    const r = seeded(23);
    return [
      trunk(r, 0.28, 2.4, -0.3),
      blob(r, 2.0, 1.9, 1.9, -0.2, 3.4, 0, "#5d8040"),
      blob(r, 1.4, 1.6, 1.4, 1.0, 2.9, 0.7, "#547838"),
      blob(r, 1.3, 1.5, 1.3, -1.0, 2.8, -0.6, "#678a46"),
    ];
  },
  // ポプラ(細く背の高い樹冠)
  poplar: () => {
    const r = seeded(37);
    return [
      trunk(r, 0.22, 3.0, 0.1),
      blob(r, 0.95, 2.6, 0.95, 0, 4.6, 0, "#557a36"),
      blob(r, 0.75, 1.9, 0.75, 0.1, 6.6, 0.1, "#62863e"),
    ];
  },
  // 松・柏(層になった、暗い色の枝葉)
  pine: () => {
    const r = seeded(51);
    const tier = (radius: number, height: number, y: number, color: string): THREE.BufferGeometry => {
      const g = new THREE.ConeGeometry(radius, height, 6, 1, true).translate(0, y + height / 2, 0);
      const pos = g.getAttribute("position");
      // 枝先を不ぞろいにして、整った円錐に見えないようにする
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) < y + 0.01) {
          const k = 0.75 + r() * 0.5;
          pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) - r() * 0.35, pos.getZ(i) * k);
        }
      }
      return paint(g, color, r, true);
    };
    return [
      trunk(r, 0.24, 2.6, 0.15),
      tier(2.0, 1.5, 2.0, "#2f4a2c"),
      tier(1.6, 1.4, 3.1, "#35522f"),
      tier(1.15, 1.4, 4.2, "#3b5a33"),
      tier(0.7, 1.5, 5.3, "#426238"),
    ];
  },
  // 低木の茂み
  shrub: () => {
    const r = seeded(67);
    return [
      blob(r, 1.1, 0.75, 1.0, 0, 0.6, 0, "#5c7338"),
      blob(r, 0.8, 0.6, 0.8, 0.8, 0.45, 0.3, "#6b8040"),
      blob(r, 0.7, 0.55, 0.75, -0.7, 0.4, -0.4, "#536a32"),
    ];
  },
};

const cache = new Map<TreeKind, THREE.BufferGeometry>();

/** 木の形(最初に使うときに一度だけ作る) */
export function treeGeometry(kind: TreeKind): THREE.BufferGeometry {
  let g = cache.get(kind);
  if (!g) {
    g = mergeGeometries(BUILDERS[kind]())!;
    cache.set(kind, g);
  }
  return g;
}
