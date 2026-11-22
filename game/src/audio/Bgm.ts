// 場面ごとの音楽(Version 41)。外部の音源ファイルは使わず、Web Audio で本作のために作った旋律を、その場で合成して鳴らす。
// 著作権:この旋律と音色の設計は本作のオリジナル(既存の楽曲・ゲーム音楽からの流用はない)。
// 音色は、古琴・琵琶に似せた撥弦(はつげん)、笙に似せた持続音、太鼓・銅鑼の打楽器を、簡単な合成で近づけたもの。
// ブラウザは、利用者の操作(タップ・クリック・キー)があるまで音を出せないので、最初の操作のときに鳴らし始める。
export type BgmScene = "title" | "map" | "court" | "field" | "siege" | "victory" | "defeat";

export const BGM_LABEL: Record<BgmScene, string> = {
  title: "題字(開幕)", map: "戦略マップ", court: "外交・宮廷", field: "野戦", siege: "攻城戦", victory: "勝利", defeat: "敗北",
};

/** 五音音階(宮・商・角・徴・羽)を、半音の数で */
const GONG = [0, 2, 4, 7, 9];
/** 羽調(短調ふう):悲しみ・緊張 */
const YU = [0, 3, 5, 7, 10];

interface Pattern {
  /** 1拍の秒数 */
  beat: number;
  /** 主音(MIDI 番号) */
  root: number;
  scale: number[];
  /** 旋律:音階の段(null は休み)。1要素 = 1拍。長さが小節の繰り返しの長さになる */
  melody: (number | null)[];
  /** 低音:音階の段。1要素 = 2拍 */
  bass: number[];
  /** 太鼓:1拍ごとの強さ(0〜1) */
  drum: number[];
  /** 持続音(笙)を重ねるか */
  pad: boolean;
  /** 銅鑼を、何小節ごとに鳴らすか(0 は鳴らさない) */
  gong: number;
  /** 1回だけ鳴らして終える(勝利・敗北) */
  once?: boolean;
  /** 撥弦の明るさ(フィルタの周波数) */
  bright: number;
}

const PATTERNS: Record<BgmScene, Pattern> = {
  // 題字:ゆったりした古琴ふうの独奏に、笙の持続音
  title: { beat: 0.62, root: 57, scale: GONG, pad: true, gong: 4, bright: 2400,
    melody: [4, null, 3, 2, 3, null, null, null, 2, 1, 0, 1, 2, null, null, null, 5, null, 4, 3, 2, null, 3, null, 2, 1, 0, null, null, null, null, null],
    bass: [0, 0, 3, 3, 0, 0, 4, 2, 3, 3, 0, 0, 2, 4, 0, 0], drum: [0.5, 0, 0, 0, 0, 0, 0, 0] },
  // 戦略マップ:落ち着いた行進の歩み
  map: { beat: 0.5, root: 55, scale: GONG, pad: true, gong: 8, bright: 2000,
    melody: [0, 2, 3, null, 4, 3, 2, null, 1, 2, 0, null, null, null, null, null, 2, 3, 4, null, 5, 4, 3, null, 2, 3, 1, null, 0, null, null, null],
    bass: [0, 0, 3, 3, 4, 4, 0, 0, 3, 3, 4, 4, 2, 2, 0, 0], drum: [0.35, 0, 0.15, 0, 0.3, 0, 0.15, 0] },
  // 外交・宮廷:静かで、間の多い調べ
  court: { beat: 0.72, root: 60, scale: GONG, pad: true, gong: 0, bright: 1800,
    melody: [2, null, null, 4, 3, null, 2, null, null, null, 1, null, 2, null, null, null, 4, null, 5, null, 4, 3, null, null, 2, null, null, 1, 0, null, null, null],
    bass: [0, 0, 4, 4, 3, 3, 0, 0], drum: [0, 0, 0, 0, 0, 0, 0, 0] },
  // 野戦:速い太鼓と、短調の緊張した旋律
  field: { beat: 0.3, root: 52, scale: YU, pad: false, gong: 4, bright: 3200,
    melody: [0, 0, 2, 3, 4, null, 3, 2, 3, 3, 4, 5, 4, null, 2, null, 0, 0, 2, 3, 4, null, 5, 4, 3, 2, 1, 2, 0, null, null, null],
    bass: [0, 0, 0, 0, 3, 3, 4, 4, 0, 0, 0, 0, 4, 4, 3, 1], drum: [1, 0.3, 0.6, 0.3, 0.9, 0.3, 0.6, 0.5] },
  // 攻城戦:重い太鼓と低い持続音。ゆっくり押し寄せる
  siege: { beat: 0.42, root: 45, scale: YU, pad: true, gong: 2, bright: 1500,
    melody: [0, null, null, 1, 2, null, null, null, 2, null, 3, 2, 1, null, 0, null, 3, null, null, 4, 3, null, null, null, 2, null, 1, null, 0, null, null, null],
    bass: [0, 0, 0, 0, 1, 1, 0, 0], drum: [1, 0, 0, 0.5, 0.8, 0, 0.4, 0] },
  // 勝利:明るい上昇の旋律を一度
  victory: { beat: 0.34, root: 60, scale: GONG, pad: true, gong: 1, bright: 3600, once: true,
    melody: [0, 1, 2, 3, 4, null, 5, null, 7, null, null, null, 5, 7, 9, null, 10, null, null, null, null, null, null, null],
    bass: [0, 0, 3, 3, 5, 5, 5, 5, 0, 0, 0, 0], drum: [1, 0, 0.5, 0, 1, 0, 0.5, 0] },
  // 敗北:沈んでいく短調の旋律を一度
  defeat: { beat: 0.7, root: 50, scale: YU, pad: true, gong: 1, bright: 1200, once: true,
    melody: [4, null, 3, null, 2, null, null, null, 1, null, 0, null, -1, null, null, null, -2, null, null, null, null, null, null, null],
    bass: [0, 0, -1, -1, -2, -2, -2, -2, -2, -2, -2, -2], drum: [0.6, 0, 0, 0, 0, 0, 0, 0] },
};

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export class Bgm {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private current: { scene: BgmScene; bus: GainNode; timer: number; next: number; step: number } | null = null;
  private wanted: BgmScene | null = null;
  private volume = 0.5;
  private muted = false;
  /** 利用者の操作を待っている(ブラウザの自動再生の制限) */
  locked = true;
  onLockChange?: (locked: boolean) => void;

  constructor() {
    try {
      this.volume = Number(localStorage.getItem("goko-bgm-volume") ?? "0.5");
      this.muted = localStorage.getItem("goko-bgm-muted") === "1";
    } catch {
      /* 読めなければ初期値 */
    }
    if (!Number.isFinite(this.volume)) this.volume = 0.5;
    const unlock = (): void => {
      void this.unlock();
    };
    for (const t of ["pointerdown", "keydown", "touchend"]) window.addEventListener(t, unlock, { capture: true, passive: true });
  }

  /** 環境音などが同じ音の出口(音量・消音の設定)を使うための、音の文脈と出口。まだ鳴らせなければ null */
  audio(): { ctx: AudioContext; out: GainNode } | null {
    return this.ctx && this.master && !this.locked ? { ctx: this.ctx, out: this.master } : null;
  }

  get state(): { volume: number; muted: boolean; scene: BgmScene | null; locked: boolean } {
    return { volume: this.volume, muted: this.muted, scene: this.current?.scene ?? this.wanted, locked: this.locked };
  }

  /** 最初の操作で、音を出せるようにする */
  async unlock(): Promise<void> {
    if (!this.locked && this.ctx?.state === "running") return;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx ??= new AC();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      if (!this.master) {
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        // 余韻(簡単なエコー)
        const delay = this.ctx.createDelay(1);
        delay.delayTime.value = 0.28;
        const fb = this.ctx.createGain();
        fb.gain.value = 0.28;
        const wet = this.ctx.createGain();
        wet.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
        this.master.connect(delay);
        delay.connect(fb).connect(delay);
        delay.connect(wet).connect(this.ctx.destination);
      }
      this.locked = this.ctx.state !== "running";
      this.onLockChange?.(this.locked);
      if (!this.locked && this.wanted && !this.current) this.play(this.wanted);
    } catch {
      /* 音を出せない環境では、黙って何もしない */
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem("goko-bgm-volume", String(this.volume)); } catch { /* 保存できなくても続ける */ }
    if (this.master && this.ctx && !this.muted) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try { localStorage.setItem("goko-bgm-muted", m ? "1" : "0"); } catch { /* 保存できなくても続ける */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.1);
  }

  /** 場面の音楽に切り替える(前の曲は2秒かけて消え、新しい曲は2秒かけて入る) */
  play(scene: BgmScene): void {
    this.wanted = scene;
    if (this.current?.scene === scene) return;
    const ctx = this.ctx;
    if (!ctx || !this.master || this.locked) return;
    const old = this.current;
    if (old) {
      old.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
      window.clearInterval(old.timer);
      window.setTimeout(() => old.bus.disconnect(), 3000);
    }
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(1, ctx.currentTime + 0.2, 0.7);
    bus.connect(this.master);
    const cur = { scene, bus, timer: 0, next: ctx.currentTime + 0.3, step: 0 };
    this.current = cur;
    // 先読みして、0.25秒ごとに次の0.6秒ぶんの音を予約する
    cur.timer = window.setInterval(() => this.schedule(cur), 250);
    this.schedule(cur);
  }

  stop(): void {
    this.wanted = null;
    if (!this.current || !this.ctx) return;
    const old = this.current;
    this.current = null;
    old.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    window.clearInterval(old.timer);
    window.setTimeout(() => old.bus.disconnect(), 2500);
  }

  private schedule(cur: NonNullable<Bgm["current"]>): void {
    const ctx = this.ctx!;
    const p = PATTERNS[cur.scene];
    const len = p.melody.length;
    while (cur.next < ctx.currentTime + 0.6) {
      if (p.once && cur.step >= len) {
        window.clearInterval(cur.timer);
        return;
      }
      const i = cur.step % len;
      const t = cur.next;
      const deg = p.melody[i];
      if (deg !== null) this.pluck(cur.bus, t, this.note(p, deg, 12), p.beat * 1.8, p.bright, 0.22);
      if (i % 2 === 0) {
        const b = p.bass[(i / 2) % p.bass.length];
        this.pluck(cur.bus, t, this.note(p, b, -12), p.beat * 3, p.bright * 0.4, 0.2);
        if (p.pad && i % 8 === 0) this.pad(cur.bus, t, [this.note(p, b, 0), this.note(p, b + 2, 0), this.note(p, b + 4, 0)], p.beat * 8);
      }
      const dr = p.drum[i % p.drum.length];
      if (dr > 0) this.drum(cur.bus, t, dr);
      if (p.gong > 0 && i === 0 && Math.floor(cur.step / len) % p.gong === 0) this.gong(cur.bus, t);
      cur.step++;
      cur.next += p.beat;
    }
  }

  /** 音階の段から周波数(段が音階の長さを超えたら、オクターブ上・下へ) */
  private note(p: Pattern, deg: number, shift: number): number {
    const n = p.scale.length;
    const oct = Math.floor(deg / n);
    const k = ((deg % n) + n) % n;
    return midi(p.root + shift + oct * 12 + p.scale[k]);
  }

  /** 撥弦:三角波と鋸歯状波を、すばやく減衰させ、低域通過で丸める(古琴・琵琶ふう) */
  private pluck(bus: GainNode, t: number, f: number, dur: number, bright: number, vol: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(bright, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, bright * 0.25), t + dur * 0.6);
    for (const [type, mul, v] of [["triangle", 1, 1], ["sawtooth", 2, 0.25]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    lp.connect(g).connect(bus);
  }

  /** 持続音(笙ふう):ゆっくり立ち上がる正弦波の和音 */
  private pad(bus: GainNode, t: number, fs: number[], dur: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    for (const f of fs) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    g.connect(bus);
  }

  /** 太鼓:低い正弦波を急に下げ、雑音を少し混ぜる */
  private drum(bus: GainNode, t: number, v: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.4);
  }

  /** 銅鑼:うなりのある高めの音を、長く残す */
  private gong(bus: GainNode, t: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
    for (const f of [190, 287, 403, 531]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f * 1.01, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 1.5);
      o.connect(g);
      o.start(t);
      o.stop(t + 3.6);
    }
    g.connect(bus);
  }
}
