// Version 54:写実寄りの3Dの頭(MakeHuman の CC0 の素材から tools/v54/build_heads.py で作った GLB)。
// ・顔の形(輪郭・頬・顎・鼻・唇・目・眉・年齢)は、人ごとの量でモーフを混ぜ、頂点に焼き込む(実行時の負荷を減らす)
// ・表情(8つ)・まばたき・話す口は、モーフターゲットで動かす
// ・髪は、頭の形に沿った殻(GLB)と、身分ごとの結い髪(ここで作る)。髪飾り(金・真珠・玉)も身分で変える
// 2Dの絵を貼るのではなく、形を持った3Dの頭。近くの人だけに使い(距離による切り替え)、遠くはこれまでの簡単な形のまま。
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Expr } from "../sim/palaceText";
import headsUrl from "../assets/heads.glb?url";

export type HeadStyle = "empress" | "consort" | "lady";
export const EXPR_MORPH: Record<Expr, string | null> = { normal: null, smile: "smile", joy: "joy", sad: "sad", angry: "angry", puzzled: "puzzled", surprised: "surprised", shy: "shy" };
const ACTIVE = ["smile", "joy", "shy", "sad", "angry", "puzzled", "surprised", "blink", "talkA", "talkO"];
export const SHAPE_KEYS = ["oval", "round", "heart", "square", "cheekbone", "cheekfull", "chinNarrow", "chinLong", "noseNarrow", "noseHigh", "noseSmall", "lipsThin", "lipsFull", "mouthSmall", "eyesLarge", "eyesUp", "eyesFold", "browArch", "older", "jawSoft"] as const;
export type Shape = Partial<Record<(typeof SHAPE_KEYS)[number], number>>;

interface Part { name: string; geometry: THREE.BufferGeometry; material: THREE.Material; renderOrder: number }

/** 読み込んだ頭の素(全員で共有する形・絵・材質) */
export class HeadKit {
  private static loading: Promise<HeadKit> | null = null;
  readonly parts: Part[] = [];
  readonly skinMats: Record<HeadStyle, THREE.MeshPhysicalMaterial>;
  readonly hairMat: THREE.MeshPhysicalMaterial;
  readonly hairTubeMat: THREE.MeshPhysicalMaterial;
  readonly gold: THREE.MeshStandardMaterial;
  readonly pearl: THREE.MeshPhysicalMaterial;
  readonly jade: THREE.MeshPhysicalMaterial;
  readonly landmarks: { eyeL: number[]; eyeR: number[]; jaw: number[]; top: number; chin: number };
  private readonly names: string[];
  private readonly textures: THREE.Texture[] = [];
  /** 作った頭の数(資源の確かめ用) */
  live = 0;

  static load(): Promise<HeadKit> {
    HeadKit.loading ??= new Promise((res, rej) => new GLTFLoader().load(headsUrl, (g) => res(new HeadKit(g)), undefined, rej));
    return HeadKit.loading;
  }

  private constructor(g: { scene: THREE.Group; parser: { json: { meshes: { extras: { targetNames: string[]; landmarks: HeadKit["landmarks"]; skinTextures: Record<HeadStyle, number> } }[] } }; parser2?: unknown } & { parser: { getDependency(t: string, i: number): Promise<THREE.Texture> } }) {
    const ex = g.parser.json.meshes[0].extras;
    this.names = ex.targetNames;
    this.landmarks = ex.landmarks;
    let skinMap: THREE.Texture | null = null;
    let roughMap: THREE.Texture | null = null;
    let hairMap: THREE.Texture | null = null;
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      const name = mat.name;
      if (name === "skin") {
        skinMap = mat.map;
        roughMap = mat.roughnessMap;
      }
      if (name === "hair") hairMap = mat.map;
      let material: THREE.Material = mat;
      let order = 0;
      if (name === "eyes") {
        mat.roughness = 0.5;
      } else if (name === "cornea") {
        material = new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.12, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false });
        order = 2;
      } else if (name === "lashes") {
        if (mat.map) {
          mat.map.wrapS = THREE.RepeatWrapping;
          mat.map.wrapT = THREE.ClampToEdgeWrapping;
        }
        mat.transparent = true;
        mat.alphaTest = 0.05;
        mat.depthWrite = false;
        mat.side = THREE.DoubleSide;
        order = 3;
      } else if (name === "mouth") {
        mat.color.set(0xd8cbbd);
      }
      this.parts.push({ name, geometry: m.geometry, material, renderOrder: order });
    });
    const skinTex: Record<string, THREE.Texture> = {};
    // 3種の化粧の絵(GLB の中の絵の番号)。読み込み済みの絵を、番号で取り出す
    const json = g.parser.json as unknown as { textures: { name: string }[] };
    const mk = (style: HeadStyle): THREE.MeshPhysicalMaterial => {
      const m = new THREE.MeshPhysicalMaterial({ map: skinMap, roughnessMap: roughMap, roughness: 1, sheen: 0.25, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffc8b0) });
      m.name = "skin_" + style;
      const idx = ex.skinTextures[style];
      void g.parser.getDependency("texture", idx).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.flipY = false;
        m.map = t;
        m.needsUpdate = true;
        skinTex[style] = t;
        this.textures.push(t);
      });
      void json;
      return m;
    };
    this.skinMats = { empress: mk("empress"), consort: mk("consort"), lady: mk("lady") };
    this.hairMat = new THREE.MeshPhysicalMaterial({ map: hairMap, color: 0x17100d, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.5, sheen: 0.3, sheenColor: new THREE.Color(0x6a5040), sheenRoughness: 0.35 });
    // 結い髪の筒:毛の向きを筒の長さに合わせる(絵を90度回す)
    const tubeMap = hairMap ? (hairMap as THREE.Texture).clone() : null;
    if (tubeMap) {
      tubeMap.wrapS = tubeMap.wrapT = THREE.RepeatWrapping;
      tubeMap.rotation = Math.PI / 2;
      tubeMap.repeat.set(3, 6);
      tubeMap.needsUpdate = true;
      this.textures.push(tubeMap);
    }
    this.hairTubeMat = new THREE.MeshPhysicalMaterial({ map: tubeMap, color: 0x1c1410, roughness: 0.48, sheen: 0.35, sheenColor: new THREE.Color(0x7a5c48), sheenRoughness: 0.3 });
    // 髪のつやは控えめに(灯火の強い光で、白っぽく光らないように)
    this.hairMat.specularIntensity = 0.25;
    this.hairTubeMat.specularIntensity = 0.3;
    this.hairMat.roughness = 0.7;
    this.hairMat.envMapIntensity = 0.12;
    this.hairMat.sheen = 0.12;
    this.hairTubeMat.envMapIntensity = 0.15;
    this.hairTubeMat.sheen = 0.15;
    for (const m of Object.values(this.skinMats)) m.envMapIntensity = 0.5;
    this.gold = new THREE.MeshStandardMaterial({ color: 0xe0b860, metalness: 1, roughness: 0.28 });
    this.pearl = new THREE.MeshPhysicalMaterial({ color: 0xf4efe6, roughness: 0.18, clearcoat: 0.6, iridescence: 0.4, sheen: 0.3 });
    this.jade = new THREE.MeshPhysicalMaterial({ color: 0x5fae8c, roughness: 0.15, clearcoat: 1, transmission: 0 });
  }

  index(name: string): number {
    return this.names.indexOf(name);
  }

  dispose(): void {
    for (const p of this.parts) {
      p.geometry.dispose();
      p.material.dispose();
    }
    for (const m of [...Object.values(this.skinMats), this.hairMat, this.hairTubeMat, this.gold, this.pearl, this.jade]) m.dispose();
    for (const t of this.textures) t.dispose();
    HeadKit.loading = null;
  }
}

/** 人ひとりの頭 */
export class RealHead {
  readonly root = new THREE.Group();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly owned: THREE.BufferGeometry[] = [];
  private readonly ownedMats: THREE.Material[] = [];
  private readonly act: number[];
  private expr: Expr = "normal";
  private exprW = 0;
  private readonly want: Record<string, number> = {};
  private nextBlink = 0;
  private blinkT = -1;
  private talk = false;
  private teeth: THREE.Mesh | null = null;
  readonly style: HeadStyle;
  readonly shape: Shape;

  constructor(private readonly kit: HeadKit, style: HeadStyle, shape: Shape, seed = 0) {
    this.style = style;
    this.shape = shape;
    this.act = ACTIVE.map((n) => kit.index(n));
    for (const p of kit.parts) {
      // 顔の形を焼き込んだ位置だけを、人ごとに持つ(法線・表情のモーフ・UV は共有)
      const g = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(p.geometry.attributes)) g.setAttribute(k, a);
      g.setIndex(p.geometry.index);
      const base = p.geometry.attributes.position as THREE.BufferAttribute;
      const pos = new Float32Array(base.array as Float32Array);
      const morphs = p.geometry.morphAttributes.position ?? [];
      for (const [k, w] of Object.entries(shape)) {
        const i = kit.index(k);
        const m = morphs[i] as THREE.BufferAttribute | undefined;
        if (!m || !w) continue;
        const arr = m.array as Float32Array;
        for (let j = 0; j < pos.length; j++) pos[j] += arr[j] * w;
      }
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.morphAttributes.position = this.act.map((i) => morphs[i]).filter(Boolean);
      const mn = p.geometry.morphAttributes.normal;
      if (mn) g.morphAttributes.normal = this.act.map((i) => mn[i]).filter(Boolean);
      g.morphTargetsRelative = true;
      g.computeBoundingSphere();
      this.owned.push(g);
      const mat = p.name === "skin" ? kit.skinMats[style] : p.name === "hair" ? kit.hairMat : p.material;
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = p.renderOrder;
      mesh.morphTargetInfluences = new Array(g.morphAttributes.position.length).fill(0);
      mesh.castShadow = p.name === "skin" || p.name === "hair";
      mesh.name = p.name;
      if (p.name === "mouth") {
        this.teeth = mesh;
        mesh.visible = false;
      }
      this.meshes.push(mesh);
      this.root.add(mesh);
    }
    this.buildHair(style, seed);
    this.nextBlink = 1 + (seed % 7) * 0.4;
  }

  /** 結い髪と髪飾り(身分で違う) */
  private buildHair(style: HeadStyle, seed: number): void {
    const K = this.kit;
    const top = K.landmarks.top;
    const eyeY = K.landmarks.eyeL[1];
    const tube = (pts: number[][], r: number, closed = false, mat: THREE.Material = K.hairTubeMat): THREE.Mesh => {
      const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed, "centripetal");
      const g = new THREE.TubeGeometry(c, 40, r, 10, closed);
      this.owned.push(g);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      this.root.add(m);
      return m;
    };
    const ball = (x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material = K.hairTubeMat): THREE.Mesh => {
      const g = new THREE.SphereGeometry(1, 20, 14);
      this.owned.push(g);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      this.root.add(m);
      return m;
    };
    const pearls = (pts: THREE.Vector3[], r: number): void => {
      const g = new THREE.SphereGeometry(r, 8, 6);
      this.owned.push(g);
      const im = new THREE.InstancedMesh(g, K.pearl, pts.length);
      const mtx = new THREE.Matrix4();
      pts.forEach((p, i) => im.setMatrixAt(i, mtx.makeTranslation(p.x, p.y, p.z)));
      this.root.add(im);
    };
    const chain = (a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number): THREE.Vector3[] => {
      const out: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * sag;
        p.z += Math.sin(t * Math.PI) * sag * 0.35;
        out.push(p);
      }
      return out;
    };
    // 頭頂の後ろのまげの土台(全員)
    const bz = -0.02;
    // 鬢(こめかみの髪):生え際から耳の上を通って、後ろのまげへ流す。殻の上に重ねて厚みを出す
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const y0 = eyeY + 0.03 + k * 0.012;
        tube([[sd * 0.06, y0, 0.06 - k * 0.004], [sd * 0.074, y0 - 0.008, 0.02], [sd * 0.072, y0 - 0.006, -0.025], [sd * 0.05, y0 + 0.01, -0.065], [sd * 0.015, top - 0.04 - k * 0.01, -0.08]], 0.009 - k * 0.0015, false);
      }
    }
    if (style === "empress") {
      // 高髻:高く結い上げ、二つの輪を立てる。金の冠と歩揺、額に真珠の飾り
      ball(0, top - 0.005, bz, 0.06, 0.035, 0.06);
      tube([[-0.035, top, bz], [-0.05, top + 0.06, bz - 0.01], [-0.02, top + 0.1, bz], [0.0, top + 0.04, bz]], 0.016, false);
      tube([[0.035, top, bz], [0.05, top + 0.06, bz - 0.01], [0.02, top + 0.1, bz], [0.0, top + 0.04, bz]], 0.016, false);
      const crownG = new THREE.TorusGeometry(0.058, 0.006, 8, 40, Math.PI * 1.3);
      this.owned.push(crownG);
      const crown = new THREE.Mesh(crownG, K.gold);
      crown.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI * 0.85);
      crown.position.set(0, top - 0.01, bz + 0.004);
      this.root.add(crown);
      // 歩揺:左右の金の簪から、真珠の房が下がる
      for (const s of [-1, 1]) {
        tube([[s * 0.03, top + 0.005, bz + 0.03], [s * 0.075, top + 0.03, bz + 0.035]], 0.0025, false, K.gold);
        for (let k = 0; k < 3; k++) pearls(chain(new THREE.Vector3(s * (0.06 + k * 0.007), top + 0.025, bz + 0.04), new THREE.Vector3(s * (0.065 + k * 0.007), top - 0.02 - k * 0.008, bz + 0.05), 0.002, 6), 0.0022);
      }
      // 額の真珠(添付の絵のような、こめかみからこめかみへの弧)
      const L = new THREE.Vector3(-0.058, eyeY + 0.05, 0.075), Rr = new THREE.Vector3(0.058, eyeY + 0.05, 0.075);
      pearls(chain(L, Rr, 0.012, 26), 0.0019);
      pearls(chain(L.clone().add(new THREE.Vector3(0.004, 0.006, -0.003)), Rr.clone().add(new THREE.Vector3(-0.004, 0.006, -0.003)), 0.006, 22), 0.0016);
      ball(0, eyeY + 0.038, 0.108, 0.004, 0.006, 0.003, K.jade);
    } else if (style === "consort") {
      // 双環の髻:頭の上の左右に輪。玉の簪と、額に細い真珠
      ball(0, top - 0.01, bz - 0.01, 0.055, 0.03, 0.055);
      for (const s of [-1, 1]) {
        tube([[s * 0.02, top - 0.005, bz], [s * 0.065, top + 0.03, bz], [s * 0.075, top + 0.07, bz - 0.01], [s * 0.04, top + 0.065, bz], [s * 0.025, top + 0.01, bz]], 0.014, false);
        tube([[s * 0.035, top - 0.005, bz + 0.04], [s * 0.07, top + 0.02, bz + 0.045]], 0.0022, false, K.gold);
        ball(s * 0.072, top + 0.022, bz + 0.046, 0.007, 0.007, 0.007, K.jade);
      }
      const L = new THREE.Vector3(-0.052, eyeY + 0.052, 0.078), Rr = new THREE.Vector3(0.052, eyeY + 0.052, 0.078);
      pearls(chain(L, Rr, 0.01, 22), 0.0016);
      ball(0, eyeY + 0.043, 0.104, 0.0035, 0.0045, 0.0025, K.pearl);
    } else {
      // 女官:後ろで低く一つに結い、銀の簪を一本
      ball(0, top - 0.05, bz - 0.045, 0.045, 0.036, 0.04);
      tube([[-0.045, top - 0.05, bz - 0.065], [0, top - 0.04, bz - 0.09], [0.045, top - 0.05, bz - 0.065]], 0.002, false, new THREE.MeshStandardMaterial({ color: 0xc8c8cc, metalness: 1, roughness: 0.3 }));
      this.ownedMats.push((this.root.children[this.root.children.length - 1] as THREE.Mesh).material as THREE.Material);
      void seed;
    }
  }

  setExpr(e: Expr): void {
    if (e !== this.expr) {
      this.expr = e;
      this.exprW = 0;
    }
  }

  setTalking(on: boolean): void {
    this.talk = on;
  }

  /** 確かめ用:いまのモーフの量 */
  influences(): Record<string, number> {
    const m = this.meshes[0];
    return Object.fromEntries(ACTIVE.map((n, i) => [n, +(m.morphTargetInfluences?.[i] ?? 0).toFixed(3)]));
  }

  update(dt: number, t: number): void {
    // 表情:ゆっくり移る
    this.exprW = Math.min(1, this.exprW + dt * 3);
    for (const n of ["smile", "joy", "shy", "sad", "angry", "puzzled", "surprised"]) this.want[n] = 0;
    const em = EXPR_MORPH[this.expr];
    if (em) this.want[em] = this.exprW * (this.expr === "surprised" || this.expr === "joy" ? (this.talk ? 0.45 : 0.75) : 1);
    // まばたき(3〜6秒に一度、0.15秒)
    if (this.blinkT < 0 && t > this.nextBlink) {
      this.blinkT = 0;
      this.nextBlink = t + 3 + ((t * 7.3) % 3);
    }
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      blink = Math.sin(Math.min(1, this.blinkT / 0.16) * Math.PI);
      if (this.blinkT > 0.16) this.blinkT = -1;
    }
    this.want.blink = Math.max(blink, this.expr === "shy" ? 0.15 : 0);
    // 話す:口を開け閉めする(あ・お)
    this.want.talkA = this.talk ? Math.max(0, Math.sin(t * 11)) * 0.4 : 0;
    this.want.talkO = this.talk ? Math.max(0, Math.sin(t * 7 + 1)) * 0.35 : 0;
    const open = this.want.talkA + this.want.talkO + (this.want.joy ?? 0) * 0.3 + (this.want.surprised ?? 0) * 0.5;
    if (this.teeth) this.teeth.visible = open > 0.08;
    for (const m of this.meshes) {
      const inf = m.morphTargetInfluences;
      if (!inf) continue;
      ACTIVE.forEach((n, i) => {
        if (i < inf.length) inf[i] += ((this.want[n] ?? 0) - inf[i]) * Math.min(1, dt * (n === "blink" || n.startsWith("talk") ? 30 : 8));
      });
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.owned) g.dispose();
    for (const m of this.ownedMats) m.dispose();
    this.kit.live--;
  }
}

/** 人ごとの顔の形(種から決める。極端にしない) */
export function shapeFor(seed: number, age: number, style: HeadStyle): Shape {
  let h = seed >>> 0;
  const r = (): number => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
  const faceKind = Math.floor(r() * 4);
  const s: Shape = {
    oval: faceKind === 0 ? 0.6 : 0.2, round: faceKind === 1 ? 0.5 : 0, heart: faceKind === 2 ? 0.5 : 0, square: faceKind === 3 ? 0.3 : 0,
    cheekbone: r() * 0.5, cheekfull: r() * 0.4, chinNarrow: r() * 0.5, chinLong: 0.1 + r() * 0.3, noseNarrow: r() * 0.5, noseHigh: r() * 0.5, noseSmall: r() * 0.5,
    lipsThin: r() < 0.5 ? r() * 0.4 : 0, lipsFull: r() < 0.5 ? r() * 0.4 : 0, mouthSmall: r() * 0.4, eyesLarge: 0.2 + r() * 0.5, eyesUp: r() * 0.6, eyesFold: r() * 0.6, browArch: r() * 0.5, jawSoft: 0.3 + r() * 0.4,
    older: Math.max(0, Math.min(1, (age - 26) / 30)),
  };
  if (style === "empress") s.cheekbone = Math.max(s.cheekbone ?? 0, 0.3);
  return s;
}
