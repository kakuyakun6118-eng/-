// 後宮の人物の3Dの姿(Version 53):骨組み(腰・胴・頭・両腕・裾・足)を持つ、低い多角形の人形。
// 魏晋(4世紀)の服の推定:上は交領(衿を重ねる)の衣と大きな袖、下は裾の広い長裙、腰の帯、肩にかける披帛、先の反った履。
// 髪は結い上げた形(4種)と、身分の飾り(皇后:歩揺の冠、妃:玉の簪と垂れ飾り、女官:簡素な簪)。皇帝は黒と朱の衣に冠。
// 顔は、表情(通常・微笑・喜び・悲しみ・怒り・困惑・驚き・照れ)ごとに描いた絵を貼る。動きは関節の回転で作る(静止した形を動かすだけではない)。
import * as THREE from "three";
import type { RealHead } from "./RealHead";
import type { Expr } from "../sim/palaceText";

export type Pose = "stand" | "walk" | "sit" | "bow" | "talk" | "read" | "play" | "eat";
export interface Looks { robe: string; trim: string; hair: number; height: number }
export interface FigureOpts { emperor?: boolean; rank?: string; face?: number; girth?: number; detail?: boolean }

/** 布の模様(衣の色ごとに作る:細い縞と小さな菱の地紋) */
function clothTexture(color: string, trim: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  g.globalAlpha = 0.18;
  g.strokeStyle = trim;
  for (let i = 0; i < 64; i += 8) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.stroke();
  }
  g.globalAlpha = 0.14;
  g.fillStyle = "#ffffff";
  for (let y = 4; y < 64; y += 16) for (let x = 4; x < 64; x += 16) {
    g.beginPath();
    g.moveTo(x, y - 3); g.lineTo(x + 3, y); g.lineTo(x, y + 3); g.lineTo(x - 3, y);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 顔の絵(表情と顔立ち3種)。球の前の面に貼る */
export function faceTexture(expr: Expr, face = 0, skin = "#ecc9a6"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = skin;
  g.fillRect(0, 0, 128, 128);
  // 球の展開図:前の面(+z の向き)は横方向の u=0.25 の位置。目・眉・口を、そこに描く
  const cx = 32, ey = 58, my = 78, ex = 9 + face;
  const line = (pts: number[][], w: number, col: string): void => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
    g.stroke();
  };
  const brow = (dy: number, tilt: number): void => {
    line([[cx - ex - 4, ey - 9 + dy + tilt], [cx - ex + 4, ey - 10 + dy - tilt]], 1.6, "#2a1c16");
    line([[cx + ex - 4, ey - 10 + dy - tilt], [cx + ex + 4, ey - 9 + dy + tilt]], 1.6, "#2a1c16");
  };
  const eyes = (kind: "open" | "smile" | "round" | "down"): void => {
    for (const s of [-1, 1]) {
      const x = cx + s * ex;
      if (kind === "smile") line([[x - 3.5, ey + 1], [x, ey - 2], [x + 3.5, ey + 1]], 1.8, "#1e1410");
      else if (kind === "down") line([[x - 3.5, ey], [x + 3.5, ey + 1]], 1.8, "#1e1410");
      else {
        g.fillStyle = "#1e1410";
        g.beginPath();
        g.ellipse(x, ey, kind === "round" ? 2.8 : 2.2 + face * 0.3, kind === "round" ? 3 : 1.8, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#ffffff";
        g.fillRect(x + 0.5, ey - 1.2, 0.9, 0.9);
      }
    }
  };
  const blush = (a: number): void => {
    g.fillStyle = `rgba(232,120,130,${a})`;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(cx + s * (ex + 3), ey + 9, 5, 2.6, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  const lips = "#b04a48";
  if (expr === "normal") { brow(0, 0); eyes("open"); line([[cx - 3, my], [cx + 3, my]], 2, lips); }
  else if (expr === "smile") { brow(0, 0); eyes("smile"); line([[cx - 4, my - 1], [cx, my + 1.5], [cx + 4, my - 1]], 2, lips); }
  else if (expr === "joy") { brow(-1, 0); eyes("smile"); g.fillStyle = lips; g.beginPath(); g.ellipse(cx, my, 4.5, 3, 0, 0, Math.PI); g.fill(); blush(0.35); }
  else if (expr === "sad") { brow(1, -2); eyes("down"); line([[cx - 3.5, my + 1.5], [cx, my - 0.5], [cx + 3.5, my + 1.5]], 1.8, lips); line([[cx - ex, ey + 3], [cx - ex, ey + 7]], 1.2, "#7ab0d8"); }
  else if (expr === "angry") { brow(1, 2.5); eyes("open"); line([[cx - 4, my + 1], [cx + 4, my + 1]], 2.4, lips); }
  else if (expr === "puzzled") { brow(0, 0); line([[cx + ex - 4, ey - 12], [cx + ex + 4, ey - 9]], 1.6, "#2a1c16"); eyes("open"); line([[cx - 4, my], [cx - 1, my - 1.5], [cx + 2, my + 0.5], [cx + 4, my - 1]], 1.6, lips); }
  else if (expr === "surprised") { brow(-3, 0); eyes("round"); g.fillStyle = lips; g.beginPath(); g.ellipse(cx, my + 0.5, 2.2, 3, 0, 0, Math.PI * 2); g.fill(); }
  else { brow(0, -1); eyes("smile"); line([[cx - 2.5, my], [cx + 2.5, my]], 1.8, lips); blush(0.6); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 骨組みのある人形 */
export class Figure {
  readonly root = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly skirt: THREE.Mesh;
  private readonly footL: THREE.Mesh;
  private readonly footR: THREE.Mesh;
  private readonly faceMat: THREE.MeshLambertMaterial;
  /** 遠くでは隠す細部(髪飾り・披帛):距離による簡略化 */
  private readonly detailObjs: THREE.Object3D[] = [];
  /** 持ち物(書・琴・椀) */
  private readonly props: Record<string, THREE.Object3D> = {};
  pose: Pose = "stand";
  private blend = 0; // 座る姿勢へのなめらかな移り(0 = 立つ、1 = 座る)
  private bowT = 0;
  private phase = Math.random() * 6;
  private walkT = 0;
  expr: Expr = "normal";
  private readonly faceIdx: number;
  private readonly k: number;
  private readonly textures: THREE.Texture[] = [];
  private faceCache = new Map<Expr, THREE.CanvasTexture>();

  constructor(looks: Looks, opts: FigureOpts = {}) {
    const k = (this.k = looks.height / 1.6);
    this.faceIdx = opts.face ?? 0;
    const girth = opts.girth ?? 1;
    const emperor = !!opts.emperor;
    const tex = clothTexture(looks.robe, looks.trim);
    this.textures.push(tex);
    const robe = new THREE.MeshLambertMaterial({ map: tex });
    const robe2 = new THREE.MeshLambertMaterial({ color: new THREE.Color(looks.robe).multiplyScalar(0.75) });
    const trim = new THREE.MeshLambertMaterial({ color: new THREE.Color(looks.trim) });
    const skin = new THREE.MeshLambertMaterial({ color: 0xecc9a6 });
    const hair = new THREE.MeshLambertMaterial({ color: 0x171210 });
    const gold = new THREE.MeshLambertMaterial({ color: 0xd8b050, emissive: 0x201000 });
    this.faceMat = new THREE.MeshLambertMaterial({ map: this.faceTex("normal") });
    const R = this.root;
    // 腰(ここから上下が動く)
    this.hips.position.y = 0.92 * k;
    R.add(this.hips);
    // 長裙:裾の広い回転体。座ると縮んで広がる
    const prof = [new THREE.Vector2(0.01, -0.92), new THREE.Vector2(0.44, -0.92), new THREE.Vector2(0.4, -0.7), new THREE.Vector2(0.3, -0.3), new THREE.Vector2(0.22, 0), new THREE.Vector2(0.01, 0.02)];
    this.skirt = new THREE.Mesh(new THREE.LatheGeometry(prof, 12), robe);
    this.skirt.scale.set(k * girth, k, k * girth);
    this.skirt.castShadow = true;
    this.hips.add(this.skirt);
    // 裾の縁(色の違う縁取り)
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.43 * k * girth, 0.025 * k, 4, 16), trim);
    hem.rotation.x = Math.PI / 2;
    hem.position.y = -0.9 * k;
    this.skirt.add(hem);
    hem.scale.set(1 / (k * girth), 1 / (k * girth), 1 / k);
    // 先の反った履
    const shoe = new THREE.BoxGeometry(0.09 * k, 0.06 * k, 0.2 * k);
    this.footL = new THREE.Mesh(shoe, robe2);
    this.footR = new THREE.Mesh(shoe, robe2);
    for (const [f, s] of [[this.footL, -1], [this.footR, 1]] as const) {
      f.position.set(s * 0.1 * k, -0.89 * k, 0.12 * k);
      this.hips.add(f);
    }
    // 胴(腰の上で前後に傾く:拝礼)
    this.hips.add(this.torso);
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * k * girth, 0.2 * k * girth, 0.42 * k, 10), robe);
    chest.position.y = 0.2 * k;
    chest.castShadow = true;
    this.torso.add(chest);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.205 * k * girth, 0.21 * k * girth, 0.08 * k, 12), trim);
    belt.position.y = 0.03 * k;
    this.torso.add(belt);
    // 交領:衿の重なり(右前)
    const coll = new THREE.Mesh(new THREE.TorusGeometry(0.13 * k, 0.03 * k, 4, 12, Math.PI * 1.2), trim);
    coll.position.set(0, 0.4 * k, 0.03 * k);
    coll.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 1.1);
    this.torso.add(coll);
    // 帯の垂れ
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05 * k, 0.34 * k, 0.01 * k), trim);
    tie.position.set(0.05 * k, -0.15 * k, 0.21 * k);
    this.torso.add(tie);
    // 腕(肩を軸に回る)と大きな袖、手
    for (const [arm, s] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(s * 0.2 * k * girth, 0.38 * k, 0);
      this.torso.add(arm);
      const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * k, 0.17 * k, 0.5 * k, 8, 1, true), robe);
      sl.position.y = -0.24 * k;
      sl.rotation.z = s * 0.12;
      sl.castShadow = true;
      (sl.material as THREE.Material).side = THREE.DoubleSide;
      arm.add(sl);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.165 * k, 0.018 * k, 4, 12), trim);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.49 * k;
      arm.add(cuff);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04 * k, 6, 5), skin);
      hand.position.y = -0.47 * k;
      hand.name = "hand";
      arm.add(hand);
    }
    // 披帛(肩にかける長い薄布):皇帝は無し
    if (!emperor && opts.detail !== false) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.3, -0.5, 0.05), new THREE.Vector3(-0.22, 0.32, -0.12), new THREE.Vector3(0, 0.42, -0.16), new THREE.Vector3(0.22, 0.32, -0.12), new THREE.Vector3(0.3, -0.5, 0.05)].map((v) => v.multiplyScalar(k)));
      const shawl = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.025 * k, 4), new THREE.MeshLambertMaterial({ color: new THREE.Color(looks.trim).lerp(new THREE.Color(0xffffff), 0.4), transparent: true, opacity: 0.85 }));
      this.torso.add(shawl);
      this.detailObjs.push(shawl);
    }
    // 頭(首を軸にうなずく・振り向く)
    this.head.position.y = 0.48 * k;
    this.torso.add(this.head);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.125 * k, 16, 12), this.faceMat);
    headMesh.position.y = 0.12 * k;
    headMesh.scale.set(0.92, 1.05, 0.95);
    this.head.add(headMesh);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * k, 0.05 * k, 0.08 * k, 6), skin);
    neck.position.y = 0.01 * k;
    this.head.add(neck);
    if (emperor) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.17 * k, 0.17 * k, 0.24 * k), new THREE.MeshLambertMaterial({ color: 0x121212 }));
      cap.position.set(0, 0.29 * k, -0.02 * k);
      cap.rotation.x = -0.15;
      this.head.add(cap);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * k, 0.008 * k, 0.42 * k, 5), gold);
      pin.position.set(0, 0.3 * k, -0.02 * k);
      pin.rotation.z = Math.PI / 2;
      this.head.add(pin);
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.128 * k, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
      back.position.y = 0.13 * k;
      this.head.add(back);
    } else {
      // 髪:頭の後ろと上を覆い、結い上げる(4つの形)
      // 髪:顔(前の面)を残して、頭の上と後ろを覆う(前の切れ目は額から下)
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.132 * k, 14, 10, Math.PI * 0.78, Math.PI * 1.44, 0, Math.PI * 0.66), hair);
      back.position.y = 0.13 * k;
      this.head.add(back);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.134 * k, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.2), hair);
      top.position.y = 0.13 * k;
      this.head.add(top);
      const bun = (x: number, y: number, z: number, r: number, sy = 1): void => {
        const b = new THREE.Mesh(new THREE.SphereGeometry(r * k, 10, 8), hair);
        b.position.set(x * k, y * k, z * k);
        b.scale.y = sy;
        this.head.add(b);
      };
      if (looks.hair === 0) bun(0, 0.32, -0.03, 0.085, 1.2);
      else if (looks.hair === 1) { bun(-0.08, 0.3, -0.01, 0.065); bun(0.08, 0.3, -0.01, 0.065); }
      else if (looks.hair === 2) { bun(0, 0.36, -0.04, 0.06, 1.4); bun(0, 0.27, -0.08, 0.08); }
      else { bun(0, 0.22, -0.13, 0.09); bun(0, 0.14, -0.15, 0.06); }
      // 身分の飾り
      const ornament = new THREE.Group();
      if (opts.rank === "empress") {
        // 歩揺の冠(推定):金の台と、揺れる垂れ飾り
        const crown = new THREE.Mesh(new THREE.TorusGeometry(0.11 * k, 0.015 * k, 4, 14), gold);
        crown.rotation.x = Math.PI / 2;
        crown.position.y = 0.27 * k;
        ornament.add(crown);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const d = new THREE.Mesh(new THREE.SphereGeometry(0.014 * k, 5, 4), gold);
          d.position.set(Math.cos(a) * 0.12 * k, 0.21 * k, Math.sin(a) * 0.12 * k);
          d.name = "dangle";
          ornament.add(d);
        }
        const phoenix = new THREE.Mesh(new THREE.ConeGeometry(0.03 * k, 0.1 * k, 4), gold);
        phoenix.position.set(0, 0.38 * k, 0.02 * k);
        ornament.add(phoenix);
      } else if (opts.rank === "consort") {
        for (const s of [-1, 1]) {
          const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.007 * k, 0.007 * k, 0.26 * k, 4), gold);
          pin.position.set(s * 0.06 * k, 0.3 * k, -0.02 * k);
          pin.rotation.z = s * 1.1;
          ornament.add(pin);
          const bead = new THREE.Mesh(new THREE.SphereGeometry(0.015 * k, 5, 4), new THREE.MeshLambertMaterial({ color: 0xb0e0c8 }));
          bead.position.set(s * 0.16 * k, 0.24 * k, -0.02 * k);
          bead.name = "dangle";
          ornament.add(bead);
        }
      } else {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.007 * k, 0.007 * k, 0.24 * k, 4), trim);
        pin.position.set(0.04 * k, 0.32 * k, -0.03 * k);
        pin.rotation.z = 1.2;
        ornament.add(pin);
      }
      this.head.add(ornament);
      this.detailObjs.push(ornament);
    }
    // 持ち物
    const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * k, 0.025 * k, 0.24 * k, 6), new THREE.MeshLambertMaterial({ color: 0xe8dcc0 }));
    scroll.rotation.z = Math.PI / 2;
    scroll.position.set(0, 0.18 * k, 0.32 * k);
    const qin = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9 * k, 0.05 * k, 0.18 * k), new THREE.MeshLambertMaterial({ color: 0x3a2416 }));
    qin.add(board);
    for (let i = 0; i < 7; i++) {
      const str = new THREE.Mesh(new THREE.BoxGeometry(0.86 * k, 0.004 * k, 0.004 * k), new THREE.MeshLambertMaterial({ color: 0xe0d0a0 }));
      str.position.set(0, 0.03 * k, (-0.07 + i * 0.023) * k);
      qin.add(str);
    }
    qin.position.set(0, -0.32 * k, 0.4 * k);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * k, 0.03 * k, 0.04 * k, 8), new THREE.MeshLambertMaterial({ color: 0x8a5a3a }));
    bowl.position.set(0.12 * k, 0.05 * k, 0.28 * k);
    this.props.read = scroll;
    this.props.play = qin;
    this.props.eat = bowl;
    for (const p of Object.values(this.props)) {
      p.visible = false;
      this.torso.add(p);
    }
    R.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
  }

  private faceTex(e: Expr): THREE.CanvasTexture {
    let t = this.faceCache.get(e);
    if (!t) {
      t = faceTexture(e, this.faceIdx);
      this.faceCache.set(e, t);
      this.textures.push(t);
    }
    return t;
  }

  /** 表情を変える */
  /** 写実寄りの頭(Version 54)。付けている間は、これまでの球の頭と髪を隠す */
  real: RealHead | null = null;
  private hiddenHead: THREE.Object3D[] = [];
  attachHead(h: RealHead): void {
    this.detachHead();
    this.hiddenHead = [...this.head.children];
    for (const c of this.hiddenHead) c.visible = false;
    h.root.scale.setScalar(this.k * 1.14);
    h.root.position.set(0, -0.015 * this.k, 0.01 * this.k);
    this.head.add(h.root);
    this.real = h;
    h.setExpr(this.expr);
  }
  detachHead(): RealHead | null {
    const h = this.real;
    if (!h) return null;
    h.root.removeFromParent();
    for (const c of this.hiddenHead) c.visible = true;
    this.hiddenHead = [];
    this.real = null;
    return h;
  }
  /** 顔の位置(世界の座標。会話のカメラ用) */
  faceWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.head.localToWorld(out.set(0, 0.15 * this.k, 0.05 * this.k));
  }

  setExpr(e: Expr): void {
    this.real?.setExpr(e);
    if (this.expr === e) return;
    this.expr = e;
    this.faceMat.map = this.faceTex(e);
    this.faceMat.needsUpdate = true;
  }

  /** 姿勢を変える(座る・立つは、なめらかに移る。拝礼は一度だけ) */
  setPose(p: Pose): void {
    if (p === "bow" && this.pose !== "bow") this.bowT = 0;
    this.pose = p;
  }

  /** 今の関節の角度(テストで、実際に動いているかを確かめる) */
  joints(): { hipsY: number; torsoX: number; armL: number; armR: number; head: number; footL: number; blend: number } {
    return { hipsY: +this.hips.position.y.toFixed(3), torsoX: +this.torso.rotation.x.toFixed(3), armL: +this.armL.rotation.x.toFixed(3), armR: +this.armR.rotation.x.toFixed(3), head: +this.head.rotation.x.toFixed(3), footL: +this.footL.position.z.toFixed(3), blend: +this.blend.toFixed(3) };
  }

  /** 毎フレーム:姿勢に合わせて関節を動かす。speed は歩く速さ(m/秒) */
  update(dt: number, t: number, speed = 0): void {
    if (this.real) {
      this.real.setTalking(this.pose === "talk");
      this.real.update(dt, t);
    }
    const k = this.k;
    const p = this.pose;
    const seated = p === "sit" || p === "read" || p === "play" || p === "eat";
    // 座る・立つ:0.6秒ほどで移る
    this.blend += ((seated ? 1 : 0) - this.blend) * Math.min(1, dt * 4);
    const b = this.blend;
    const ph = t + this.phase;
    let hipsY = 0.92 * k - b * 0.5 * k;
    let torsoX = 0, armL = 0, armR = 0, armLz = 0, armRz = 0, headX = 0, headY = 0, fl = 0.12 * k, fr = 0.12 * k;
    if (p === "walk") {
      this.walkT += dt * (2.2 + speed * 1.2);
      const w = this.walkT;
      hipsY += Math.abs(Math.sin(w)) * 0.025 * k;
      armL = Math.sin(w) * 0.35;
      armR = -Math.sin(w) * 0.35;
      fl = 0.12 * k + Math.sin(w) * 0.12 * k;
      fr = 0.12 * k - Math.sin(w) * 0.12 * k;
      this.torso.rotation.z = Math.sin(w) * 0.03;
    } else this.torso.rotation.z *= 0.9;
    if (p === "stand") { armL = Math.sin(ph * 0.8) * 0.04; armR = -armL; headY = Math.sin(ph * 0.3) * 0.12; }
    if (p === "talk") { armR = -0.6 - Math.max(0, Math.sin(ph * 2.2)) * 0.5; armRz = -0.25; headX = Math.sin(ph * 3) * 0.06; }
    if (p === "bow") {
      // 拝礼(揖):両手を胸の前で合わせ、上体を傾けて、また起こす(1.6秒)
      this.bowT = Math.min(1.6, this.bowT + dt);
      const q = Math.sin((this.bowT / 1.6) * Math.PI);
      torsoX = q * 0.55;
      armL = armR = -1.1;
      armLz = 0.5;
      armRz = -0.5;
      headX = q * 0.2;
      if (this.bowT >= 1.6) this.pose = "stand";
    }
    if (seated) {
      armL = armR = -0.7 * b;
      armLz = 0.25 * b;
      armRz = -0.25 * b;
      if (p === "read") { headX = 0.35; armL = armR = -1.0; }
      if (p === "play") { armL = -0.9 + Math.sin(ph * 4) * 0.12; armR = -0.9 + Math.sin(ph * 4 + 1.3) * 0.12; headX = 0.2; }
      if (p === "eat") { const m = Math.max(0, Math.sin(ph * 1.2)); armR = -0.9 - m * 0.9; armRz = -0.35 - m * 0.3; headX = 0.1 - m * 0.08; }
      fl = fr = -0.05 * k;
    }
    this.hips.position.y = hipsY;
    // 座ると、裾は縮み、横に広がる(跪坐)
    this.skirt.scale.y = k * (1 - b * 0.52);
    this.skirt.position.y = b * 0.02 * k;
    this.torso.rotation.x += (torsoX - this.torso.rotation.x) * Math.min(1, dt * 8);
    this.armL.rotation.x += (armL - this.armL.rotation.x) * Math.min(1, dt * 10);
    this.armR.rotation.x += (armR - this.armR.rotation.x) * Math.min(1, dt * 10);
    this.armL.rotation.z += (armLz - this.armL.rotation.z) * Math.min(1, dt * 10);
    this.armR.rotation.z += (armRz - this.armR.rotation.z) * Math.min(1, dt * 10);
    this.head.rotation.x += (headX - this.head.rotation.x) * Math.min(1, dt * 6);
    this.head.rotation.y += (headY - this.head.rotation.y) * Math.min(1, dt * 3);
    this.footL.position.z = fl;
    this.footR.position.z = fr;
    this.footL.position.y = this.footR.position.y = -0.89 * k + b * 0.43 * k;
    for (const [name, prop] of Object.entries(this.props)) prop.visible = name === p;
    // 垂れ飾りの揺れ(歩揺)
    this.head.traverse((o) => {
      if (o.name === "dangle") o.position.y += Math.sin(ph * 6 + o.position.x * 50) * 0.0004;
    });
  }

  /** 細部を出す・隠す(遠い人は隠して軽くする) */
  setDetail(on: boolean): void {
    // 写実の頭を付けている間は、これまでの頭の飾りは隠したまま
    for (const o of this.detailObjs) o.visible = on && !(this.real && this.hiddenHead.includes(o));
  }

  dispose(): void {
    // 写実寄りの頭は、共有の材質を持つので、先に外して片づける
    this.detachHead()?.dispose();
    for (const t of this.textures) t.dispose();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mm = m.material as THREE.Material;
      mm.dispose();
    });
  }
}
