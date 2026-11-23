// Version 54(2D化):後宮の人物の肖像画の配役。
// ・物語の主要6人(A1〜A6):物語の役ごとに専用の肖像。その役を受け持つ人物に、必ずこの肖像を使う(表情8種)
// ・一般の人物(N・L・S・D):年齢と身分で、空いている肖像を割り当てる。割り当てはセーブに残し、同じ人物の顔が変わらないようにする
// 肖像画は、遊ぶ人が ChatGPT などで作って提供する(docs/v54-2d-image-guide.md)。届くまでは仮の絵を出す。
import type { PalaceNpc } from "../sim/palace";
import type { Arc } from "../sim/palaceStories";
import type { Expr } from "../sim/palaceText";

export const EXPRS: Expr[] = ["normal", "smile", "joy", "sad", "angry", "puzzled", "surprised", "shy"];
export const EXPR_JA: Record<Expr, string> = { normal: "通常", smile: "微笑み", joy: "喜び", sad: "悲しみ", angry: "怒り", puzzled: "困惑", surprised: "驚き", shy: "照れ" };

export interface CastEntry {
  id: string;
  kind: "story" | "noble" | "lady" | "senior" | "dowager";
  arc?: Arc;
  age: number;
  /** 画像の指示(ChatGPT に渡す人物の説明) */
  look: string;
}

export const CAST: CastEntry[] = [
  { id: "A1", kind: "story", arc: "scholar", age: 20, look: "詩歌を愛する女官。知的で穏やか。切れ長の目、細い柳眉、薄化粧。淡い青緑の上襦に白い長裙。簡素な一つまげ(単髻)に銀の簪一本" },
  { id: "A2", kind: "story", arc: "ambitious", age: 24, look: "出世を望む女官。凛として自信に満ちた表情、くっきりした目と整った鼻筋、紅はやや濃い。深紅の上襦。高めに結ったまげに金の簪二本" },
  { id: "A3", kind: "story", arc: "provincial", age: 19, look: "地方から来た女官。素朴で健やか、少し丸みのある顔、血色のよい自然な肌。生成りと藍の素朴な衣。二つに分けて結ったまげ(双丫髻)に木の簪" },
  { id: "A4", kind: "story", arc: "attendant", age: 26, look: "主に仕える誠実な女官。落ち着いた控えめな表情、やや面長。灰紫の衣。きちんとまとめた低いまげに小さな玉の飾り" },
  { id: "A5", kind: "story", arc: "consort", age: 22, look: "妃。柔らかく華やかな美しさ、卵型の顔、澄んだ大きな瞳、桃色の頬と目元の紅(桃花の化粧)。牡丹色の上襦に金糸の刺繍、薄絹の披帛。高く輪を結ったまげ(飛天髻)に金の歩揺と真珠" },
  { id: "A6", kind: "story", arc: "free", age: 21, look: "宮の外の世界を夢見る女官(のちに医女)。意志の強い明るい目、すっきりした顔立ち。浅葱色の動きやすい衣。低い一つまげ、飾りはない" },
  { id: "N01", kind: "noble", age: 30, look: "皇后の格の貴婦人。気品と威厳、穏やかで落ち着いた目。深紅と金の豪華な衣。高く結い上げたまげに金の冠・歩揺・額の真珠の飾り" },
  { id: "N02", kind: "noble", age: 25, look: "妃。艶やかで明るい美しさ。紫の上襦に花の刺繍。左右に輪を結ったまげ(双環髻)に玉の簪" },
  { id: "N03", kind: "noble", age: 28, look: "妃。理知的で涼しげな美しさ、すっと通った鼻筋。白と銀の衣。うねるように結ったまげ(霊蛇髻)に銀と真珠の飾り" },
  { id: "N04", kind: "noble", age: 35, look: "皇族の貴婦人。落ち着いた威厳。濃紺と金の衣。まとめ髪に金の簪と小さな冠" },
  { id: "L01", kind: "lady", age: 18, look: "若い女官。あどけなさの残る丸顔、大きな目。桃色の衣。双丫髻" },
  { id: "L02", kind: "lady", age: 20, look: "女官。細面で涼しい目元。若草色の衣。一つまげ" },
  { id: "L03", kind: "lady", age: 21, look: "女官。えくぼのある明るい顔。浅黄の衣。双丫髻に赤い紐" },
  { id: "L04", kind: "lady", age: 22, look: "女官。物静かで伏し目がち。薄い灰青の衣。低いまげ" },
  { id: "L05", kind: "lady", age: 23, look: "女官。きりりとした眉、意志の強い目。朱色の衣。高めの一つまげ" },
  { id: "L06", kind: "lady", age: 24, look: "女官。ふっくらとした温和な顔。橙茶の衣。まとめ髪" },
  { id: "L07", kind: "lady", age: 25, look: "女官。切れ長の鋭い目、気位が高い。黒に近い深紫の衣。低いまげに銀の簪" },
  { id: "L08", kind: "lady", age: 26, look: "女官。柔らかい卵型の顔、優しい目。藤色の衣。まげから少し髪を垂らす" },
  { id: "L09", kind: "lady", age: 27, look: "女官。理知的で落ち着いた顔。藍色の衣。簡素なまげ" },
  { id: "L10", kind: "lady", age: 29, look: "女官。頼もしい姉のような顔立ち。紅褐色の衣。きちんと結ったまげ" },
  { id: "S01", kind: "senior", age: 42, look: "女官長。厳格で品のある顔、目尻に小じわ。焦げ茶と金の衣。端正なまげに金の簪" },
  { id: "D01", kind: "dowager", age: 55, look: "皇太后。威厳と慈愛。黒と金の衣。白髪まじりのまげに冠" },
];

/** 人物に肖像を割り当てる(物語の役があれば専用、なければ年齢・身分の近い空きの肖像)。割り当ては npc.portrait に残す */
export function assignPortraits(list: PalaceNpc[], ageOf: (n: PalaceNpc) => number): void {
  const used = new Set(list.map((n) => n.portrait).filter(Boolean) as string[]);
  for (const n of list) {
    const arcCast = n.story ? CAST.find((c) => c.arc === n.story!.arc) : undefined;
    if (arcCast) {
      // 物語の役の専用の肖像(前に別の肖像だった人も、物語の役が付いたら専用に替える)
      if (n.portrait !== arcCast.id) {
        if (n.portrait) used.delete(n.portrait);
        n.portrait = arcCast.id;
        used.add(arcCast.id);
      }
      continue;
    }
    if (n.portrait && CAST.some((c) => c.id === n.portrait)) continue;
    const age = ageOf(n);
    const kind: CastEntry["kind"] = n.rank === "dowager" ? "dowager" : n.rank === "empress" || n.rank === "consort" || n.rank === "royal" ? "noble" : age >= 38 ? "senior" : "lady";
    const pool = CAST.filter((c) => c.kind !== "story" && !used.has(c.id));
    const score = (c: CastEntry): number => (c.kind === kind ? 0 : c.kind === "lady" || c.kind === "noble" ? 30 : 60) + Math.abs(c.age - age);
    const best = pool.sort((a, b) => score(a) - score(b))[0];
    if (best) {
      n.portrait = best.id;
      used.add(best.id);
    }
  }
}
