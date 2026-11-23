// Version 54(2D化):皇帝生活モードの2Dの画面(背景画・人物の肖像・場所の一覧)。会話・選択肢は PalaceHud が出す。
// 3Dの宮殿(src/palace/PalaceScreen.ts)の代わり。WebGL は使わず、HTML の画像と CSS の演出だけで描く。
import { AREA_LABEL, type Area, type PalaceNpc, type PalaceSystem } from "../sim/palace";
import { moodExpr, type Expr } from "../sim/palaceText";
import { bgUrl, eventUrl, ImageCache, placeholderBg, placeholderPortrait, portraitUrl, TIME_KEYS, type TimeKey } from "./assets";

export const AREAS: Area[] = ["emperorHall", "empressPalace", "consortQuarters", "ladiesStation", "garden", "bath", "banquet", "corridor"];
/** 場所の一覧の並び(地図の上の位置:北が上) */
const MAP_POS: Record<Area, [number, number]> = {
  emperorHall: [52, 6], empressPalace: [52, 24], consortQuarters: [84, 40], ladiesStation: [20, 40], bath: [18, 8], corridor: [52, 44], garden: [58, 68], banquet: [20, 70],
};

export interface Palace2DEvents {
  onPickNpc(id: string): void;
  onArea(a: Area): void;
}

export class Palace2DScreen {
  readonly root: HTMLElement;
  private readonly bgA: HTMLDivElement;
  private readonly bgB: HTMLDivElement;
  private bgFront = 0;
  private readonly tint: HTMLDivElement;
  private readonly people: HTMLDivElement;
  private readonly focus: HTMLDivElement;
  private readonly focusImgs: [HTMLImageElement, HTMLImageElement];
  private focusFront = 0;
  private readonly eventBox: HTMLDivElement;
  private readonly mapBox: HTMLDivElement;
  readonly cache = new ImageCache(24);
  private talking: string | null = null;
  private shownExpr = "";
  private shownBg = "";
  private shownPeople = "";
  private lastEnd: Record<string, string> = {};
  /** 演出の計測(確かめ用) */
  readonly counts = { bgChanges: 0, exprChanges: 0, moves: 0, events: 0 };
  walking = false;

  constructor(parent: HTMLElement, private readonly palace: PalaceSystem, private readonly ev: Palace2DEvents) {
    const r = document.createElement("div");
    r.className = "p2-stage";
    r.innerHTML = `<div class="p2-bg"></div><div class="p2-bg"></div><div class="p2-tint"></div>
      <div class="p2-people"></div><div class="p2-focus" hidden><img alt="" /><img alt="" /></div>
      <nav class="p2-map" aria-label="後宮の場所"></nav><div class="p2-event" hidden><img alt="" /><p></p></div>`;
    parent.before(r);
    this.root = r;
    const bgs = r.querySelectorAll<HTMLDivElement>(".p2-bg");
    this.bgA = bgs[0];
    this.bgB = bgs[1];
    this.tint = r.querySelector(".p2-tint")!;
    this.people = r.querySelector(".p2-people")!;
    this.focus = r.querySelector(".p2-focus")!;
    const fi = this.focus.querySelectorAll("img");
    this.focusImgs = [fi[0], fi[1]];
    this.eventBox = r.querySelector(".p2-event")!;
    this.eventBox.addEventListener("click", () => this.hideEvent());
    this.mapBox = r.querySelector(".p2-map")!;
    this.buildMap();
    palace.ensurePortraits();
    this.refresh(true);
  }

  get currentArea(): Area {
    return this.palace.area;
  }
  get areaLabel(): string {
    return AREA_LABEL[this.palace.area];
  }
  time(): TimeKey {
    return TIME_KEYS[this.palace.slot] ?? "day";
  }

  /** いまの区画にいる人(時刻の予定で決まる。いない人は出さない) */
  here(area = this.palace.area): PalaceNpc[] {
    return this.palace.present().filter((n) => this.palace.whereAt(n).area === area);
  }

  private buildMap(): void {
    this.mapBox.replaceChildren();
    const title = document.createElement("b");
    title.textContent = "後宮の地図";
    this.mapBox.append(title);
    for (const a of AREAS) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.area = a;
      b.style.left = `${MAP_POS[a][0]}%`;
      b.style.top = `${MAP_POS[a][1] + 12}%`;
      b.addEventListener("click", () => this.moveTo(a));
      this.mapBox.append(b);
    }
  }

  /** 区画へ移る(背景を切り替え、その区画にいる人を出す) */
  moveTo(a: Area): void {
    if (this.palace.area === a) return;
    this.palace.area = a;
    this.counts.moves++;
    this.setTalking(null);
    this.ev.onArea(a);
    this.refresh(true);
  }

  /** 時刻が変わった:背景の光と、いる人を替える */
  onSlotChanged(_skip = false): void {
    this.refresh(true);
  }

  setTalking(id: string | null): void {
    this.talking = id;
    this.shownExpr = "";
    this.focus.hidden = !id;
    this.root.classList.toggle("p2-talking", !!id);
    this.refresh(false);
  }

  private exprOf(n: PalaceNpc): Expr {
    return n.expr ?? moodExpr(n.mood, n.jealousy, n.romance);
  }

  private portraitSrc(n: PalaceNpc, expr: Expr): string {
    const p = portraitUrl(n.portrait, expr);
    return p ? p.url : placeholderPortrait(n, expr);
  }

  /** 表示を最新にする(背景・人物の並び・会話の相手の表情) */
  refresh(force: boolean): void {
    const area = this.palace.area;
    const time = this.time();
    // 背景:2枚を重ねて、ゆっくり入れ替える
    const bg = bgUrl(area, time);
    const bgSrc = bg ? bg.url : placeholderBg(area);
    if (bgSrc !== this.shownBg) {
      this.shownBg = bgSrc;
      const next = this.bgFront === 0 ? this.bgB : this.bgA;
      const prev = this.bgFront === 0 ? this.bgA : this.bgB;
      const apply = (): void => {
        next.style.backgroundImage = `url("${bgSrc}")`;
        next.classList.add("on");
        prev.classList.remove("on");
        this.bgFront = 1 - this.bgFront;
      };
      if (bg) void this.cache.get(bgSrc).then(apply);
      else apply();
      this.counts.bgChanges++;
    }
    // 時刻の光:絵が朝・夕・夜の版でなければ、色を重ねて雰囲気を出す
    this.tint.dataset.time = time;
    this.tint.dataset.native = bg && bg.time === time ? "1" : "0";
    this.root.dataset.time = time;
    this.root.dataset.area = area;
    // 地図:場所ごとにいる人の数
    for (const b of this.mapBox.querySelectorAll<HTMLButtonElement>("button[data-area]")) {
      const a = b.dataset.area as Area;
      const n = this.here(a).length;
      b.textContent = `${AREA_LABEL[a]}${n ? `(${n})` : ""}`;
      b.classList.toggle("here", a === area);
    }
    // いる人:立ち姿の肖像を並べる(会話中は、相手を大きく)
    const list = this.here();
    const key = list.map((n) => `${n.id}:${n.portrait}:${this.exprOf(n)}`).join("|") + `|${this.talking}`;
    if (force || key !== this.shownPeople) {
      this.shownPeople = key;
      this.people.replaceChildren();
      list.forEach((n, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "p2-person";
        b.dataset.npc = n.id;
        b.style.setProperty("--i", String(i));
        b.style.setProperty("--n", String(list.length));
        if (this.talking === n.id) b.classList.add("talking");
        const img = document.createElement("img");
        img.alt = n.name;
        img.src = this.portraitSrc(n, this.exprOf(n));
        img.decoding = "async";
        img.loading = "lazy";
        const label = document.createElement("span");
        label.textContent = `${n.name}`;
        const doing = document.createElement("small");
        doing.textContent = this.palace.whereAt(n).doing.split("・").pop() ?? "";
        b.append(img, label, doing);
        b.addEventListener("click", () => this.ev.onPickNpc(n.id));
        this.people.append(b);
      });
      if (!list.length) {
        const p = document.createElement("p");
        p.className = "p2-empty";
        p.textContent = "いまは、ここには誰もいません。地図から、ほかの場所へ移れます";
        this.people.append(p);
      }
      // 次に使いそうな画像を先に読む(ほかの場所の背景)
      const pre = AREAS.map((a) => bgUrl(a, time)?.url).filter(Boolean) as string[];
      this.cache.preload(pre.slice(0, 4));
    }
    // 会話の相手:大きく出し、表情が変わったら重ねて入れ替える
    const t = this.talking ? this.palace.npc(this.talking) : undefined;
    if (t) {
      const e = this.exprOf(t);
      const src = this.portraitSrc(t, e);
      if (src !== this.shownExpr) {
        this.shownExpr = src;
        const next = this.focusImgs[1 - this.focusFront];
        const prev = this.focusImgs[this.focusFront];
        next.src = src;
        next.alt = t.name;
        next.dataset.npc = t.id;
        next.dataset.expr = e;
        next.dataset.cast = t.portrait ?? "";
        next.classList.add("on");
        prev.classList.remove("on");
        this.focusFront = 1 - this.focusFront;
        this.counts.exprChanges++;
      }
      // 物語の結末:一枚絵があれば出す(一度だけ)
      const st = t.story;
      if (st?.ending && this.lastEnd[t.id] !== st.ending) {
        this.lastEnd[t.id] = st.ending;
        const url = eventUrl(st.arc);
        if (url) this.showEvent(url, `${t.name}の物語、結末`);
      }
    }
  }

  showEvent(url: string, caption: string): void {
    const img = this.eventBox.querySelector("img")!;
    img.src = url;
    this.eventBox.querySelector("p")!.textContent = `${caption}(押すと閉じます)`;
    this.eventBox.hidden = false;
    this.counts.events++;
  }
  /** 一枚絵(名前で):無ければ何もしない */
  showEventKey(key: string, caption: string): boolean {
    const url = eventUrl(key);
    if (!url) return false;
    this.showEvent(url, caption);
    return true;
  }
  hideEvent(): void {
    this.eventBox.hidden = true;
  }

  private acc = 0;
  update(dt: number): void {
    // 表情・時刻の変化を、少しの間隔で見る(画像の入れ替えは変わったときだけ)
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    this.refresh(false);
  }

  render(): void {
    // 2D:描くのはブラウザ(何もしない)
  }
  resize(): void {
    // CSS で合わせる
  }

  /** 確かめ用:表示の様子 */
  stats(): { area: Area; time: TimeKey; people: number; images: number; cached: number; released: number; talking: string | null; focusCast: string | null; focusExpr: string | null } {
    const f = this.focusImgs[this.focusFront];
    return { area: this.palace.area, time: this.time(), people: this.here().length, images: this.root.querySelectorAll("img").length, cached: this.cache.size, released: this.cache.released, talking: this.talking, focusCast: this.talking ? f.dataset.cast ?? null : null, focusExpr: this.talking ? f.dataset.expr ?? null : null };
  }

  dispose(): void {
    this.cache.clear();
    for (const img of this.root.querySelectorAll("img")) img.src = "";
    this.root.remove();
  }
}
