// 3Dの後宮の画面(皇帝生活モード)。皇帝を歩かせ、人物を時刻に合わせて動かし、光を朝・昼・夕・夜で変える。
// 操作:PCは WASD・矢印キーで歩く、クリックした所へ歩く、ドラッグで視点を回す、ホイールで寄る・引く。
//       iPhone はタップした所へ歩く、1本指のドラッグで視点を回す、2本指で寄る・引く。人物をタップ(クリック)すると話しかける。
import * as THREE from "three";
import type { PalaceNpc, PalaceSystem } from "../sim/palace";
import { AREA_LABEL, type Area } from "../sim/palace";
import { buildFigure, buildPalace, type PalaceWorld, type Rect } from "./PalaceWorld";

interface NpcView { npc: PalaceNpc; fig: THREE.Group; path: { x: number; z: number }[]; label: HTMLDivElement; phase: number }

const LIGHT: { sky: number; ground: number; sun: number; sunI: number; hemiI: number; fog: number; pos: [number, number, number]; lamp: number }[] = [
  { sky: 0xcfe0f0, ground: 0x8a7a60, sun: 0xffe2b8, sunI: 1.5, hemiI: 0.95, fog: 0xd8dde0, pos: [60, 40, 40], lamp: 0 }, // 朝
  { sky: 0xe4eef8, ground: 0x9a8a6a, sun: 0xffffff, sunI: 2.0, hemiI: 1.1, fog: 0xe4e8ea, pos: [20, 90, 20], lamp: 0 }, // 昼
  { sky: 0xf0b888, ground: 0x6a4a3a, sun: 0xff9a50, sunI: 1.4, hemiI: 0.8, fog: 0xd8a888, pos: [-70, 25, 30], lamp: 0.6 }, // 夕
  { sky: 0x2a3550, ground: 0x18140f, sun: 0x8aa0d0, sunI: 0.35, hemiI: 0.45, fog: 0x1a2030, pos: [-30, 60, -40], lamp: 1 }, // 夜
];

export interface PalaceScreenEvents {
  /** 人物をタップした(近ければ話しかける) */
  onPickNpc(id: string): void;
  /** いる区画が変わった */
  onArea(area: Area): void;
  /** いちばん近い人物(3.5m以内)が変わった */
  onNear(id: string | null): void;
}

export class PalaceScreen {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.3, 600);
  readonly world: PalaceWorld;
  private readonly avatar: THREE.Group;
  pos = new THREE.Vector3(8, 0, 76);
  facing = Math.PI;
  private target: { x: number; z: number } | null = null;
  private walkNpc: string | null = null;
  private readonly keys = new Set<string>();
  yaw = 0;
  pitch = 0.42;
  dist = 11;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly lampLight: THREE.PointLight;
  private readonly views = new Map<string, NpcView>();
  private readonly labels: HTMLDivElement;
  private area: Area | null = null;
  private near: string | null = null;
  private width = 1;
  private height = 1;
  private readonly ray = new THREE.Raycaster();
  private readonly cleanup: (() => void)[] = [];
  /** 1秒あたりのフレーム数の目安(性能の確かめ用) */
  fps = 0;
  private frames = 0;
  private fpsAt = performance.now();

  constructor(
    private readonly renderer: THREE.WebGLRenderer, private readonly canvas: HTMLCanvasElement, labelRoot: HTMLElement,
    private readonly palace: PalaceSystem, private readonly events: PalaceScreenEvents,
  ) {
    this.world = buildPalace();
    this.scene.add(this.world.group);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x806040, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    // 影は、タッチ操作の端末(iPhone など)では切る(重いため)。PCでは付ける
    this.sun.castShadow = !(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 260;
    this.scene.add(this.sun, this.sun.target);
    this.lampLight = new THREE.PointLight(0xffc870, 0, 30, 1.6);
    this.scene.add(this.lampLight);
    this.scene.fog = new THREE.Fog(0xdde2e6, 90, 260);
    this.avatar = buildFigure({ robe: "#1c1a22", trim: "#b0302a", hair: 0, height: 1.72 }, true);
    this.scene.add(this.avatar);
    const saved = palace.avatar;
    if (saved) {
      this.pos.set(saved.x, 0, saved.z);
      this.facing = saved.facing;
    }
    this.labels = document.createElement("div");
    this.labels.className = "palace-labels";
    labelRoot.append(this.labels);
    this.syncNpcs(true);
    this.applyLight(palace.slot);
    this.bindInput();
  }

  // ===================== 人物 =====================

  /** 名簿に合わせて、人物の姿を出す・消す。first のときは、それぞれの居場所に置く(歩かせない) */
  syncNpcs(first = false): void {
    const list = this.palace.present();
    for (const [id, v] of [...this.views]) {
      if (list.some((n) => n.id === id)) continue;
      this.scene.remove(v.fig);
      v.label.remove();
      this.views.delete(id);
    }
    for (const n of list) {
      let v = this.views.get(n.id);
      const spot = this.spotOf(n);
      if (!v) {
        const fig = buildFigure(n.looks);
        fig.userData.npc = n.id;
        fig.traverse((o) => (o.userData.npc = n.id));
        fig.position.set(spot.x, this.world.floorAt(spot.x, spot.z), spot.z);
        this.scene.add(fig);
        const label = document.createElement("div");
        label.className = "palace-label";
        this.labels.append(label);
        v = { npc: n, fig, path: [], label, phase: Math.random() * 6 };
        this.views.set(n.id, v);
      }
      v.npc = n;
      v.label.textContent = n.name;
      v.label.dataset.rank = n.rank;
      if (first) {
        v.fig.position.set(spot.x, this.world.floorAt(spot.x, spot.z), spot.z);
        v.path = [];
      } else {
        // 時刻が変わった:区画の入口を通って、新しい居場所へ歩く
        const from = this.world.areaAt(v.fig.position.x, v.fig.position.z);
        const to = this.palace.whereAt(n).area;
        v.path = from === to ? [spot] : [this.world.doors[from], { x: 0, z: -12 }, this.world.doors[to], spot];
      }
    }
  }

  private spotOf(n: PalaceNpc): { x: number; z: number } {
    const where = this.palace.whereAt(n);
    const list = this.world.spots[where.area];
    let h = 0;
    for (let i = 0; i < n.id.length; i++) h = (h * 31 + n.id.charCodeAt(i)) >>> 0;
    const s = list[(h + this.palace.slot) % list.length];
    // 同じ所に重ならないよう、少しずらす
    const a = ((h % 360) * Math.PI) / 180;
    return { x: s.x + Math.cos(a) * 1.6, z: s.z + Math.sin(a) * 1.6 };
  }

  /** 人物の、いまの位置(テスト・会話の距離の判定用) */
  npcPos(id: string): THREE.Vector3 | null {
    return this.views.get(id)?.fig.position ?? null;
  }

  npcCount(): number {
    return this.views.size;
  }

  // ===================== 時刻と光 =====================

  applyLight(slot: number): void {
    const L = LIGHT[slot] ?? LIGHT[1];
    this.hemi.color.setHex(L.sky);
    this.hemi.groundColor.setHex(L.ground);
    this.hemi.intensity = L.hemiI;
    this.sun.color.setHex(L.sun);
    this.sun.intensity = L.sunI;
    this.sun.position.set(...L.pos);
    (this.scene.fog as THREE.Fog).color.setHex(L.fog);
    this.scene.background = new THREE.Color(L.fog);
    this.lampLight.intensity = L.lamp * 3;
    for (const l of this.world.lamps) (l.material as THREE.MeshLambertMaterial).emissive.setHex(L.lamp > 0 ? 0xffb040 : 0x000000);
  }

  /** 時刻が変わった(光・人物の居場所) */
  onSlotChanged(): void {
    this.applyLight(this.palace.slot);
    this.syncNpcs(false);
  }

  // ===================== 操作 =====================

  private bindInput(): void {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, type: K | string, fn: (e: never) => void, opt?: AddEventListenerOptions): void => {
      el.addEventListener(type, fn as EventListener, opt);
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener, opt));
    };
    on(window, "keydown", (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "q", "e"].includes(k)) {
        this.keys.add(k);
        this.target = null;
        this.route = [];
        e.preventDefault();
      }
    });
    on(window, "keyup", (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase()));
    on(window, "blur", () => this.keys.clear());
    const pts = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    let pinch = 0;
    let moved = false;
    on(c, "pointerdown", (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      moved = false;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
      c.setPointerCapture?.(e.pointerId);
    });
    on(c, "pointermove", (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) moved = true;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.dist = Math.max(3.5, Math.min(40, this.dist * (pinch / d)));
        pinch = d;
        return;
      }
      if (moved) {
        this.yaw -= dx * 0.006;
        this.pitch = Math.max(0.12, Math.min(1.25, this.pitch + dy * 0.004));
      }
    });
    const up = (e: PointerEvent): void => {
      const was = pts.size;
      pts.delete(e.pointerId);
      if (was === 1 && !moved) this.tap(e.clientX, e.clientY);
      if (pts.size < 2) pinch = 0;
    };
    on(c, "pointerup", up);
    on(c, "pointercancel", (e: PointerEvent) => pts.delete(e.pointerId));
    on(c, "wheel", (e: WheelEvent) => {
      this.dist = Math.max(3.5, Math.min(40, this.dist * (1 + Math.sign(e.deltaY) * 0.1)));
      e.preventDefault();
    }, { passive: false });
  }

  /** タップ・クリック:人物なら話しかけ(遠ければ近くまで歩く)、地面ならそこへ歩く */
  tap(clientX: number, clientY: number): void {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const figs = [...this.views.values()].map((v) => v.fig);
    const hit = this.ray.intersectObjects(figs, true)[0];
    const id = hit?.object.userData.npc as string | undefined;
    if (id) {
      const p = this.views.get(id)!.fig.position;
      if (p.distanceTo(this.pos) < 4) this.events.onPickNpc(id);
      else this.setTarget(p.x, p.z, id);
      return;
    }
    const g = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), g)) this.setTarget(g.x, g.z, null);
  }

  /** 指定した所へ歩かせる(テスト・案内用) */
  walkTo(x: number, z: number): void {
    this.setTarget(x, z, null);
  }

  /** 行き先を決める:升目(1m)で道を探し、曲がり角を経由点にする。道が無ければ、まっすぐ向かう */
  private setTarget(x: number, z: number, npc: string | null): void {
    this.walkNpc = npc;
    const path = this.findPath(this.pos.x, this.pos.z, x, z);
    this.route = path ?? [];
    this.target = this.route.shift() ?? { x, z };
  }

  private route: { x: number; z: number }[] = [];
  private grid: Uint8Array | null = null;

  private findPath(sx: number, sz: number, tx: number, tz: number): { x: number; z: number }[] | null {
    const b = this.world.bounds;
    const W = Math.ceil(b.x1 - b.x0), H = Math.ceil(b.z1 - b.z0);
    if (!this.grid) {
      this.grid = new Uint8Array(W * H);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) this.grid[j * W + i] = this.blocked(b.x0 + i + 0.5, b.z0 + j + 0.5, 0.45) ? 1 : 0;
    }
    const G = this.grid;
    const cell = (x: number, z: number): number => {
      const i = Math.max(0, Math.min(W - 1, Math.floor(x - b.x0))), j = Math.max(0, Math.min(H - 1, Math.floor(z - b.z0)));
      return j * W + i;
    };
    const start = cell(sx, sz);
    let goal = cell(tx, tz);
    if (G[goal]) {
      // 行き先が通れない所なら、いちばん近い通れる升目へ
      let best = -1, bd = 1e9;
      for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
        const k = goal + dj * W + di;
        if (k >= 0 && k < G.length && !G[k] && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = k; }
      }
      if (best < 0) return null;
      goal = best;
    }
    const cost = new Float32Array(W * H).fill(Infinity);
    const from = new Int32Array(W * H).fill(-1);
    const open: number[] = [start];
    cost[start] = 0;
    const hx = goal % W, hz = Math.floor(goal / W);
    const h = (k: number): number => Math.hypot((k % W) - hx, Math.floor(k / W) - hz);
    let guard = 0;
    while (open.length && guard++ < 60000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (cost[open[i]] + h(open[i]) < cost[open[bi]] + h(open[bi])) bi = i;
      const k = open.splice(bi, 1)[0];
      if (k === goal) break;
      const ki = k % W, kj = Math.floor(k / W);
      for (const [di, dj, c] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]) {
        const ni = ki + di, nj = kj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const n = nj * W + ni;
        if (G[n] || (di && dj && (G[kj * W + ni] || G[nj * W + ki]))) continue;
        const nc = cost[k] + c;
        if (nc < cost[n]) {
          if (cost[n] === Infinity) open.push(n);
          cost[n] = nc;
          from[n] = k;
        }
      }
    }
    if (from[goal] < 0 && goal !== start) return null;
    const cells: number[] = [];
    for (let k = goal; k !== start && k >= 0; k = from[k]) cells.push(k);
    cells.reverse();
    // 曲がり角だけを経由点にする
    const pts: { x: number; z: number }[] = [];
    let dir = "";
    for (let i = 0; i < cells.length; i++) {
      const k = cells[i], p0 = i ? cells[i - 1] : start;
      const d = `${(k % W) - (p0 % W)},${Math.floor(k / W) - Math.floor(p0 / W)}`;
      if (d !== dir && i > 0) pts.push({ x: b.x0 + (p0 % W) + 0.5, z: b.z0 + Math.floor(p0 / W) + 0.5 });
      dir = d;
    }
    pts.push({ x: tx, z: tz });
    return pts;
  }

  /** 押しているキーを、外から入れる(テスト用) */
  press(key: string, down: boolean): void {
    if (down) this.keys.add(key);
    else this.keys.delete(key);
  }

  // ===================== 毎フレーム =====================

  private blocked(x: number, z: number, r = 0.35): boolean {
    const b = this.world.bounds;
    if (x < b.x0 + 1.4 || x > b.x1 - 1.4 || z < b.z0 + 1.4 || z > b.z1 - 1.4) return true;
    return this.world.obstacles.some((o: Rect) => x + r > o.x0 && x - r < o.x1 && z + r > o.z0 && z - r < o.z1);
  }

  /** 壁に沿って滑るように動かす。行き先へ歩いているときは、ふさがれたら少し角度を変えて回り込む */
  private moveBy(dx: number, dz: number): void {
    const x = this.pos.x, z = this.pos.z;
    if (!this.blocked(x + dx, z + dz)) return void this.pos.set(x + dx, 0, z + dz);
    if (this.target) {
      const l = Math.hypot(dx, dz);
      const a = Math.atan2(dx, dz);
      for (const t of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
        const ex = Math.sin(a + t * this.side) * l, ez = Math.cos(a + t * this.side) * l;
        if (!this.blocked(x + ex, z + ez)) {
          this.pos.set(x + ex, 0, z + ez);
          if (Math.abs(t) >= 1.5) this.side = -this.side;
          return;
        }
      }
    }
    if (!this.blocked(x + dx, z)) this.pos.set(x + dx, 0, z);
    else if (!this.blocked(x, z + dz)) this.pos.set(x, 0, z + dz);
    else this.target = null;
  }

  /** 回り込む向き(右回り・左回り) */
  private side = 1;

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    const speed = (this.keys.has("shift") ? 7 : 4.2) * dt;
    let mx = 0, mz = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) mz -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) mz += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) mx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) mx += 1;
    if (this.keys.has("q")) this.yaw += dt * 1.6;
    if (this.keys.has("e")) this.yaw -= dt * 1.6;
    let walking = false;
    if (mx || mz) {
      const l = Math.hypot(mx, mz);
      // カメラの向きに合わせて(前 = カメラの見ている方)
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const wx = (mx * c + mz * s) / l, wz = (-mx * s + mz * c) / l;
      this.moveBy(wx * speed, wz * speed);
      this.facing = Math.atan2(wx, wz);
      walking = true;
    } else if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const last = this.route.length === 0;
      const stop = last ? (this.walkNpc ? 2.2 : 0.2) : 0.5;
      if (d <= stop && !last) this.target = this.route.shift()!;
      else if (d <= stop) {
        this.target = null;
        if (this.walkNpc) {
          this.events.onPickNpc(this.walkNpc);
          this.walkNpc = null;
        }
      } else {
        const st = Math.min(speed, d - stop + 0.01);
        this.moveBy((dx / d) * st, (dz / d) * st);
        this.facing = Math.atan2(dx, dz);
        walking = true;
      }
    }
    const floor = this.world.floorAt(this.pos.x, this.pos.z);
    this.avatar.position.set(this.pos.x, floor + (walking ? Math.abs(Math.sin(performance.now() / 160)) * 0.05 : 0), this.pos.z);
    this.avatar.rotation.y = this.facing;
    this.palace.avatar = { x: Math.round(this.pos.x * 10) / 10, z: Math.round(this.pos.z * 10) / 10, facing: Math.round(this.facing * 100) / 100 };

    // 人物:道に沿って歩く。止まっているときは、ゆっくり揺れる
    const t = performance.now() / 1000;
    let nearest: string | null = null;
    let nd = 3.5;
    for (const v of this.views.values()) {
      const p = v.fig.position;
      const next = v.path[0];
      if (next) {
        const dx = next.x - p.x, dz = next.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) v.path.shift();
        else {
          const st = Math.min(d, 1.6 * dt);
          p.x += (dx / d) * st;
          p.z += (dz / d) * st;
          v.fig.rotation.y = Math.atan2(dx, dz);
        }
        p.y = this.world.floorAt(p.x, p.z) + Math.abs(Math.sin(t * 5 + v.phase)) * 0.03;
      } else {
        p.y = this.world.floorAt(p.x, p.z);
        // 皇帝が近くにいれば、そちらを向く
        if (p.distanceTo(this.pos) < 5) v.fig.rotation.y = Math.atan2(this.pos.x - p.x, this.pos.z - p.z);
        const sl = v.fig.getObjectByName("sleeveL");
        if (sl) sl.rotation.x = Math.sin(t * 1.3 + v.phase) * 0.06;
      }
      const d = p.distanceTo(this.pos);
      if (d < nd) {
        nd = d;
        nearest = v.npc.id;
      }
    }
    if (nearest !== this.near) {
      this.near = nearest;
      this.events.onNear(nearest);
    }
    const area = this.world.areaAt(this.pos.x, this.pos.z);
    if (area !== this.area) {
      this.area = area;
      this.events.onArea(area);
    }
    // 中に入った殿舎の屋根は消す(中が見えるように)
    for (const r of this.world.roofs) r.mesh.visible = !(this.pos.x > r.rect.x0 && this.pos.x < r.rect.x1 && this.pos.z > r.rect.z0 && this.pos.z < r.rect.z1);
    // 夜の灯り:皇帝のそばを照らす
    this.lampLight.position.set(this.pos.x, 3.5, this.pos.z + 1);
    // カメラ:皇帝の後ろ上から。あいだに壁があれば、壁の手前まで寄せる(壁の中に入り込まない)
    let dist = this.dist;
    for (let i = 1; i <= 16; i++) {
      const d = (this.dist * i) / 16;
      const x = this.pos.x + Math.sin(this.yaw) * Math.cos(this.pitch) * d;
      const z = this.pos.z + Math.cos(this.yaw) * Math.cos(this.pitch) * d;
      const y = floor + 1.5 + Math.sin(this.pitch) * d;
      const wall = y < 6.5 && this.world.obstacles.some((o) => x > o.x0 - 0.2 && x < o.x1 + 0.2 && z > o.z0 - 0.2 && z < o.z1 + 0.2);
      // 殿舎の屋根の下(皇帝が入っていない殿舎)にもカメラを入れない
      const roof = y < 14 && this.world.roofs.some((r) => r.mesh.visible && x > r.rect.x0 - 2 && x < r.rect.x1 + 2 && z > r.rect.z0 - 2 && z < r.rect.z1 + 2 && !(this.pos.x > r.rect.x0 - 2 && this.pos.x < r.rect.x1 + 2 && this.pos.z > r.rect.z0 - 2 && this.pos.z < r.rect.z1 + 2));
      if (wall || roof) {
        dist = Math.max(2.5, (this.dist * (i - 1)) / 16);
        break;
      }
    }
    const cx = this.pos.x + Math.sin(this.yaw) * Math.cos(this.pitch) * dist;
    const cz = this.pos.z + Math.cos(this.yaw) * Math.cos(this.pitch) * dist;
    const cy = floor + 1.5 + Math.sin(this.pitch) * dist;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.pos.x, floor + 1.4, this.pos.z);
    this.sun.target.position.set(this.pos.x, 0, this.pos.z);
    const L = LIGHT[this.palace.slot] ?? LIGHT[1];
    this.sun.position.set(this.pos.x + L.pos[0], L.pos[1], this.pos.z + L.pos[2]);
    this.frames++;
    const now = performance.now();
    if (now - this.fpsAt > 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsAt);
      this.frames = 0;
      this.fpsAt = now;
    }
  }

  get currentArea(): Area {
    return this.world.areaAt(this.pos.x, this.pos.z);
  }

  get areaLabel(): string {
    return AREA_LABEL[this.currentArea];
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
    // 名札:画面の上に重ねる(遠い人・後ろの人は出さない)
    const v3 = new THREE.Vector3();
    for (const v of this.views.values()) {
      v3.copy(v.fig.position);
      v3.y += v.npc.looks.height + 0.35;
      const d = v.fig.position.distanceTo(this.pos);
      v3.project(this.camera);
      const show = v3.z < 1 && d < 28 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
      v.label.hidden = !show;
      if (!show) continue;
      v.label.style.transform = `translate(${((v3.x + 1) / 2) * this.width}px, ${((1 - v3.y) / 2) * this.height}px) translate(-50%, -100%)`;
      v.label.classList.toggle("near", v.npc.id === this.near);
    }
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    for (const f of this.cleanup) f();
    this.labels.remove();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
