// 肖像の表示。人物の詳細・一覧・任命の画面・君主の一覧で、同じ処理を使う。
// 画像(public/portraits/<人物ID>.webp)があればそれを、無ければ勢力の色を背景にした仮のシルエットを出す。
import { factionById, personById, portraitOf, scenario } from "../data";
import type { Person } from "../data/types";

/** 仮のシルエット(冠をかぶった胸像の影) */
function silhouette(color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#1a1411"/><rect width="96" height="96" fill="${color}" opacity="0.28"/>` +
    `<path d="M48 16c-9 0-15 7-15 17 0 7 3 13 8 16l-2 6c-12 3-21 9-25 20v21h68V75c-4-11-13-17-25-20l-2-6c5-3 8-9 8-16 0-10-6-17-15-17z" fill="#0b0807" opacity="0.88"/>` +
    `<path d="M40 14h16l3 6H37z" fill="#0b0807" opacity="0.88"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 肖像の絵の場所と、本物の画像かどうか */
export function portraitFor(person: Person | undefined): { src: string; real: boolean } {
  const url = person ? portraitOf(person.id) : undefined;
  if (url) return { src: url, real: true };
  return { src: silhouette((person && factionById(person.factionId)?.color) || "#777777"), real: false };
}

/** 画像の要素に肖像を入れる。読み込みに失敗したら、仮のシルエットに戻す */
export function fillPortrait(img: HTMLImageElement, person: Person | undefined): boolean {
  const p = portraitFor(person);
  img.onerror = () => {
    img.onerror = null;
    img.src = portraitFor(undefined).src;
  };
  img.src = p.src;
  img.dataset.real = String(p.real);
  return p.real;
}

/** 勢力の君主(いまのシナリオの名簿で、君主の役の人物) */
export function rulerOf(factionId: string): Person | undefined {
  const f = scenario.factions.find((x) => x.id === factionId);
  if (!f) return undefined;
  return personById(scenario.governors ? Object.values(scenario.governors).find((id) => personById(id)?.factionId === factionId && personById(id)?.role === "ruler") : undefined);
}
