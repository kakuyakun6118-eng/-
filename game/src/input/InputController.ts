// マウスと指の操作を、ゲーム用の3つの命令「移動・拡大縮小・タップ」に変換する。
// Pointer Events を使うので、マウスも指も同じコードで扱える。

export interface InputHandlers {
  /** 画面上を (fromX, fromY) から (toX, toY) へドラッグした */
  onPan(fromX: number, fromY: number, toX: number, toY: number): void;
  /** (x, y) を中心に拡大縮小する。factor が1より小さいと拡大 */
  onZoom(factor: number, x: number, y: number): void;
  /** (x, y) をタップ(クリック)した */
  onTap(x: number, y: number): void;
}

/** これ以上動いたら「タップ」ではなく「ドラッグ」とみなす距離(ピクセル) */
const TAP_MOVE_LIMIT = 10;
/** これより長く押したらタップとみなさない(ミリ秒) */
const TAP_TIME_LIMIT = 600;

interface Pointer {
  x: number;
  y: number;
}

export class InputController {
  private readonly pointers = new Map<number, Pointer>();
  private tapStart: { x: number; y: number; time: number } | null = null;

  constructor(private readonly el: HTMLElement, private readonly handlers: InputHandlers) {
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onCancel);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    // iPhone Safari がページ自体を拡大しようとするのを止める
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      el.addEventListener(type, (e) => e.preventDefault());
    }
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** 画面全体での位置を、地図の左上を(0,0)とした位置に直す */
  private local(e: { clientX: number; clientY: number }): Pointer {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent): void => {
    this.el.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    // 1本目の指ならタップの候補にする。2本目が触れたらタップではない
    this.tapStart = this.pointers.size === 1 ? { ...p, time: performance.now() } : null;
  };

  private onMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = this.local(e);

    if (this.pointers.size === 1) {
      // 指1本(マウスのドラッグ):地図を動かす
      if (this.tapStart) {
        const moved = Math.hypot(cur.x - this.tapStart.x, cur.y - this.tapStart.y);
        if (moved < TAP_MOVE_LIMIT) return; // まだタップかもしれないので動かさない
        this.tapStart = null;
      }
      this.handlers.onPan(prev.x, prev.y, cur.x, cur.y);
      this.pointers.set(e.pointerId, cur);
    } else if (this.pointers.size === 2) {
      // 指2本:ピンチで拡大縮小しつつ、2本の真ん中の動きで地図も動かす
      const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
      const prevDist = Math.hypot(prev.x - other.x, prev.y - other.y);
      const curDist = Math.hypot(cur.x - other.x, cur.y - other.y);
      const prevMid = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
      const curMid = { x: (cur.x + other.x) / 2, y: (cur.y + other.y) / 2 };
      this.handlers.onPan(prevMid.x, prevMid.y, curMid.x, curMid.y);
      if (prevDist > 0 && curDist > 0) {
        this.handlers.onZoom(prevDist / curDist, curMid.x, curMid.y);
      }
      this.pointers.set(e.pointerId, cur);
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.tapStart && performance.now() - this.tapStart.time < TAP_TIME_LIMIT) {
      this.handlers.onTap(this.tapStart.x, this.tapStart.y);
    }
    this.tapStart = null;
  };

  private onCancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.tapStart = null;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.local(e);
    // トラックパッドのピンチ(ctrlKey付き)は動きが小さいので強める
    const speed = e.ctrlKey ? 0.01 : 0.0015;
    this.handlers.onZoom(Math.exp(e.deltaY * speed), p.x, p.y);
  };
}
