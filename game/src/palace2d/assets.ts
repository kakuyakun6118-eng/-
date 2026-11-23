// Version 54(2D化):後宮の画像(肖像・背景・一枚絵)の登録と読み込み。
// ・画像は public/palace2d/ に置く(tools/palace2d/import_image.py で取り込む)。目録 manifest.json はビルドのたびに作り直す
// ・大きい版(-l)と小さい版(-s、スマートフォン用)。画面の大きさで選ぶ
// ・表情が足りないときは、近い表情で代わりにする。画像が無いときは、仮の絵(登録が必要な ID を書いたもの)
// ・読み込んだ画像は、新しく使った順に一定の数だけ残し、古いものは手放す(メモリを抑える)
import type { Area, PalaceNpc } from "../sim/palace";
import type { Expr } from "../sim/palaceText";
import { CAST, EXPR_JA } from "./cast";
import manifest from "./manifest.json";

export type TimeKey = "morning" | "day" | "evening" | "night";
export const TIME_KEYS: TimeKey[] = ["morning", "day", "evening", "night"];
const M = manifest as { portraits: Record<string, Record<string, number>>; bg: Record<string, Record<string, number>>; ev: Record<string, number>; count: number; bytes: number };

const FALLBACK: Record<Expr, Expr[]> = {
  normal: [], smile: ["normal"], joy: ["smile", "normal"], shy: ["smile", "normal"], sad: ["normal"], angry: ["normal"], puzzled: ["normal"], surprised: ["normal"],
};

/** 画面の大きさで、大きい版・小さい版を選ぶ */
export function sizeTag(): "l" | "s" {
  const px = Math.min(innerWidth, innerHeight) * (devicePixelRatio || 1);
  return px < 900 ? "s" : "l";
}

export function registered(): { portraits: number; bg: number; ev: number; total: number; perCast: Record<string, number> } {
  const perCast: Record<string, number> = {};
  for (const c of CAST) perCast[c.id] = Object.keys(M.portraits[c.id] ?? {}).length;
  const bg = Object.values(M.bg).reduce((a, x) => a + Object.keys(x).length, 0);
  return { portraits: Object.values(perCast).reduce((a, b) => a + b, 0), bg, ev: Object.keys(M.ev).length, total: M.count, perCast };
}

/** 肖像の画像:表情が無ければ近い表情、それも無ければ null */
export function portraitUrl(castId: string | undefined, expr: Expr): { url: string; expr: Expr } | null {
  if (!castId) return null;
  const has = M.portraits[castId];
  if (!has) return null;
  for (const e of [expr, ...FALLBACK[expr]]) if (has[e]) return { url: `palace2d/p/${castId}_${e}-${sizeTag()}.webp`, expr: e };
  return null;
}

/** 時刻(朝・昼・夕・夜)の背景。朝・夕が無ければ昼、夜が無ければ昼(色は画面で変える) */
export function bgUrl(area: Area, time: TimeKey): { url: string; time: TimeKey } | null {
  const has = M.bg[area];
  if (!has) return null;
  for (const t of [time, "day", "night"] as TimeKey[]) if (has[t]) return { url: `palace2d/bg/${area}_${t}-${sizeTag()}.webp`, time: t };
  return null;
}

export function eventUrl(key: string): string | null {
  return M.ev[key] ? `palace2d/ev/ev_${key}-${sizeTag()}.webp` : null;
}

/** 仮の肖像(画像が届くまで):衣の色の影絵に、名前と、登録が必要な ID を書く */
export function placeholderPortrait(n: PalaceNpc, expr: Expr): string {
  const id = n.portrait ?? "?";
  const robe = n.looks.robe, trim = n.looks.trim;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 600'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${robe}' stop-opacity='0.95'/><stop offset='1' stop-color='${robe}' stop-opacity='0.75'/></linearGradient></defs>` +
    `<path d='M60 600c6-150 50-250 140-262c90 12 134 112 140 262z' fill='url(#g)'/>` +
    `<path d='M150 360l50 70 50-70' stroke='${trim}' stroke-width='14' fill='none'/>` +
    `<path d='M60 600c10-90 30-150 60-190' stroke='${trim}' stroke-width='6' fill='none' opacity='0.7'/><path d='M340 600c-10-90-30-150-60-190' stroke='${trim}' stroke-width='6' fill='none' opacity='0.7'/>` +
    `<rect x='182' y='282' width='36' height='50' rx='12' fill='#d9b89a'/>` +
    `<ellipse cx='200' cy='220' rx='62' ry='76' fill='#e6c6a6'/>` +
    `<path d='M136 214c0-70 40-102 64-102s64 32 64 102c-14-40-40-56-64-56s-50 16-64 56z' fill='#1b1411'/>` +
    `<ellipse cx='200' cy='112' rx='46' ry='34' fill='#1b1411'/>` +
    `<rect x='90' y='16' width='220' height='60' rx='10' fill='rgba(20,12,8,0.6)'/>` +
    `<text x='200' y='42' font-size='22' fill='#f0dcb0' text-anchor='middle' font-family='serif'>${esc(n.name)}</text>` +
    `<text x='200' y='66' font-size='15' fill='#d8c4a0' text-anchor='middle' font-family='sans-serif'>画像未登録 ${id}・${EXPR_JA[expr]}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const AREA_SKY: Record<Area, [string, string, string]> = {
  // [上, 中, 床] の色(仮の背景)
  emperorHall: ["#3a1a14", "#6a2a1e", "#4a3424"], empressPalace: ["#4a1e24", "#7a3440", "#503428"], consortQuarters: ["#3a2434", "#6a4458", "#4a3830"],
  ladiesStation: ["#2e2620", "#5a4a3a", "#463a2c"], garden: ["#7ab0d8", "#a8cce0", "#5f7a45"], bath: ["#30383c", "#5c686a", "#6a6660"],
  banquet: ["#3a1810", "#7a3a1c", "#5a3a24"], corridor: ["#8ab4d4", "#c0d4e0", "#8a8478"],
};

/** 仮の背景(画像が届くまで):区画ごとの色と、柱・屋根・池などの影絵 */
export function placeholderBg(area: Area): string {
  const [a, b, c] = AREA_SKY[area];
  const outdoor = area === "garden" || area === "corridor";
  let deco = "";
  if (outdoor) {
    deco += `<path d='M0 300 L120 250 L260 280 L420 230 L600 270 L800 240 L1000 280 L1200 250 L1200 420 L0 420z' fill='#3a4a3a' opacity='0.35'/>`;
    deco += `<path d='M200 260 h800 l-60 -40 h-680z' fill='#3a3c40'/><rect x='240' y='260' width='720' height='120' fill='#efe4cc' opacity='0.8'/>`;
    for (let i = 0; i < 10; i++) deco += `<rect x='${250 + i * 78}' y='260' width='14' height='130' fill='#9a2c1f'/>`;
    if (area === "garden") deco += `<ellipse cx='600' cy='640' rx='420' ry='70' fill='#5a8ab0' opacity='0.8'/><path d='M420 640 q180 -90 360 0' stroke='#9a2c1f' stroke-width='14' fill='none'/>`;
    else for (let i = 0; i < 8; i++) deco += `<rect x='${40 + i * 160}' y='120' width='30' height='560' fill='#9a2c1f'/>` + `<rect x='0' y='100' width='1200' height='40' fill='#3a3c40'/>`;
  } else {
    deco += `<rect x='0' y='0' width='1200' height='60' fill='#2a1a12' opacity='0.8'/>`;
    for (let i = 0; i < 6; i++) deco += `<rect x='${60 + i * 220}' y='40' width='34' height='520' fill='#7a2418'/>`;
    deco += `<rect x='360' y='220' width='480' height='260' fill='#efe0c0' opacity='0.55'/><path d='M360 220h480M520 220v260M680 220v260' stroke='#6a3a20' stroke-width='6'/>`;
    if (area === "bath") deco += `<rect x='300' y='520' width='600' height='120' rx='20' fill='#8a9a9c'/><ellipse cx='600' cy='540' rx='280' ry='30' fill='#b8d0d8' opacity='0.8'/>`;
    if (area === "banquet") for (let i = 0; i < 5; i++) deco += `<rect x='${170 + i * 190}' y='600' width='140' height='30' fill='#5a2a14'/>`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'>` +
    `<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='0.55' stop-color='${b}'/><stop offset='0.56' stop-color='${c}'/><stop offset='1' stop-color='${c}'/></linearGradient></defs>` +
    `<rect width='1200' height='800' fill='url(#s)'/>${deco}` +
    `<text x='1180' y='786' font-size='18' fill='rgba(255,255,255,0.55)' text-anchor='end' font-family='sans-serif'>仮の背景(画像未登録 bg_${area})</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

/** 読み込んだ画像の手元の控え(新しく使った順に max 枚まで。古いものは手放す) */
export class ImageCache {
  private readonly map = new Map<string, HTMLImageElement>();
  loaded = 0;
  released = 0;
  constructor(private readonly max = 24) {}
  get(url: string): Promise<HTMLImageElement> {
    const hit = this.map.get(url);
    if (hit) {
      this.map.delete(url);
      this.map.set(url, hit);
      return hit.decode().then(() => hit, () => hit);
    }
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    this.map.set(url, img);
    this.loaded++;
    while (this.map.size > this.max) {
      const [k, old] = this.map.entries().next().value as [string, HTMLImageElement];
      this.map.delete(k);
      old.src = "";
      this.released++;
    }
    return img.decode().then(() => img, () => img);
  }
  /** 先に読んでおく(次に使いそうな画像) */
  preload(urls: string[]): void {
    for (const u of urls) if (!this.map.has(u)) void this.get(u);
  }
  get size(): number {
    return this.map.size;
  }
  clear(): void {
    for (const img of this.map.values()) img.src = "";
    this.released += this.map.size;
    this.map.clear();
  }
}
