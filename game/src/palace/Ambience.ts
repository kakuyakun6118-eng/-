// 後宮の環境音(Version 53):風・鳥・水・足音・宮の生活音(拍子木・鈴)・宴の楽・夜の虫。
// 音声ファイルは使わず、その場で合成して鳴らす(合成音。録音ではない)。音量は、音楽の音量・消音の設定に従う。
export interface AmbienceInput { area: string; slot: number; walking: boolean; pondDist: number; season: string }

export class Ambience {
  private readonly bus: GainNode;
  private readonly wind: GainNode;
  private readonly water: GainNode;
  private readonly noise: AudioBuffer;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private nextBird = 0;
  private nextStep = 0;
  private nextLife = 0;
  private nextMusic = 0;
  private nextCricket = 0;
  private musicStep = 0;
  /** 鳴らした音の数(種類ごと。確かめ用) */
  readonly counts: Record<string, number> = { bird: 0, step: 0, life: 0, music: 0, cricket: 0 };
  private input: AmbienceInput = { area: "garden", slot: 1, walking: false, pondDist: 99, season: "spring" };

  constructor(private readonly ctx: AudioContext, out: AudioNode) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.6;
    this.bus.connect(out);
    // 白い雑音(2秒・くり返し)を、風と水の元にする
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const loop = (filter: BiquadFilterType, freq: number, q: number): GainNode => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filter;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.bus);
      src.start();
      this.sources.push(src);
      return g;
    };
    this.wind = loop("lowpass", 380, 0.7);
    this.water = loop("bandpass", 1400, 1.2);
    // 風の強弱(ゆっくり揺れる)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const depth = ctx.createGain();
    depth.gain.value = 0.03;
    lfo.connect(depth).connect(this.wind.gain);
    lfo.start();
    this.sources.push(lfo);
  }

  private tone(freq: number, freq2: number, dur: number, gain: number, type: OscillatorType = "sine", at = this.ctx.currentTime): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), at + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.bus);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private burst(dur: number, freq: number, gain: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    const at = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(at, Math.random());
    src.stop(at + dur + 0.02);
  }

  /** 毎フレーム:いる場所・時刻・歩いているかで、音を変える */
  update(input: AmbienceInput): void {
    this.input = input;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const night = input.slot === 3;
    const outdoor = input.area === "garden" || input.area === "corridor";
    this.wind.gain.setTargetAtTime((outdoor ? 0.07 : 0.03) * (input.season === "winter" ? 1.6 : 1), now, 0.8);
    this.water.gain.setTargetAtTime(input.pondDist < 30 ? 0.05 * (1 - input.pondDist / 30) : input.area === "bath" ? 0.04 : 0, now, 0.5);
    // 鳥(朝と昼、外で)
    if (!night && input.slot <= 1 && outdoor && now > this.nextBird) {
      this.nextBird = now + 1.5 + Math.random() * 4;
      const f = 2400 + Math.random() * 1600;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(f, f * (1.2 + Math.random() * 0.4), 0.09, 0.05, "sine", now + i * 0.13);
      this.counts.bird++;
    }
    // 足音
    if (input.walking && now > this.nextStep) {
      this.nextStep = now + 0.42;
      this.burst(0.06, outdoor ? 900 : 600, 0.12);
      this.counts.step++;
    }
    // 宮の生活音:遠くの拍子木・鈴(昼と夕)
    if (!night && now > this.nextLife) {
      this.nextLife = now + 6 + Math.random() * 9;
      if (Math.random() < 0.5) this.tone(880, 860, 1.2, 0.03, "sine");
      else { this.tone(320, 300, 0.12, 0.05, "triangle"); this.tone(320, 300, 0.12, 0.05, "triangle", now + 0.25); }
      this.counts.life++;
    }
    // 宴の楽(宴会場の夕と夜):五音の音階で、琴の音をつま弾く
    if (input.area === "banquet" && input.slot >= 2 && now > this.nextMusic) {
      const scale = [0, 2, 4, 7, 9, 12, 14];
      const deg = scale[(this.musicStep * 3 + (this.musicStep % 5)) % scale.length];
      this.musicStep++;
      this.nextMusic = now + 0.45;
      const f = 220 * Math.pow(2, deg / 12);
      this.tone(f, f * 0.995, 1.4, 0.06, "triangle");
      this.counts.music++;
    }
    // 夜の虫
    if (night && outdoor && input.season !== "winter" && now > this.nextCricket) {
      this.nextCricket = now + 0.8 + Math.random() * 1.5;
      for (let i = 0; i < 4; i++) this.tone(4300, 4200, 0.03, 0.015, "sine", now + i * 0.05);
      this.counts.cricket++;
    }
  }

  /** 話しかけたときの小さな鈴の音(合成音) */
  chime(): void {
    const now = this.ctx.currentTime;
    this.tone(1320, 1300, 0.6, 0.035, "sine", now);
    this.tone(1980, 1960, 0.5, 0.02, "sine", now + 0.05);
    this.counts.chime = (this.counts.chime ?? 0) + 1;
  }

  /** 確かめ用:鳴っている音の様子 */
  state(): { running: boolean; area: string; wind: number; water: number; counts: Record<string, number> } {
    return { running: this.ctx.state === "running", area: this.input.area, wind: +this.wind.gain.value.toFixed(3), water: +this.water.gain.value.toFixed(3), counts: { ...this.counts } };
  }

  dispose(): void {
    for (const s of this.sources) {
      try { s.stop(); } catch { /* すでに止まっている */ }
      s.disconnect();
    }
    this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    window.setTimeout(() => this.bus.disconnect(), 400);
  }
}
