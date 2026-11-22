// 後宮の人物の会話(皇帝生活モード)。性格・好きなこと・将来の希望・皇帝との間柄・時刻で、言うことが変わる。
// 会話はゲームのための創作で、史料の言葉ではない。
export type Temper = "gentle" | "cheerful" | "shy" | "clever" | "proud" | "devoted";
export type Art = "poetry" | "music" | "painting" | "dance" | "embroidery" | "herbs" | "go";
export type Gift = "silk" | "jade" | "incense" | "books" | "score" | "flowers" | "sweets" | "brush";
export type Hope = "family" | "study" | "quiet" | "chief" | "leave" | "serve" | "favor";

export const TEMPER_LABEL: Record<Temper, string> = { gentle: "温和", cheerful: "快活", shy: "内気", clever: "聡明", proud: "気位が高い", devoted: "情が深い" };
export const ART_LABEL: Record<Art, string> = { poetry: "詩歌", music: "琴と笛", painting: "書画", dance: "舞", embroidery: "刺繍", herbs: "薬草と花", go: "囲碁" };
export const GIFT_LABEL: Record<Gift, string> = { silk: "絹の反物", jade: "玉の簪", incense: "香", books: "書物", score: "琴の譜", flowers: "季節の花", sweets: "菓子", brush: "筆と硯" };
export const GIFT_COST: Record<Gift, number> = { silk: 40, jade: 60, incense: 25, books: 30, score: 20, flowers: 5, sweets: 8, brush: 25 };
export const HOPE_LABEL: Record<Hope, string> = {
  family: "故郷の家族を助けたい", study: "学問を深めたい", quiet: "後宮で穏やかに暮らしたい", chief: "女官の長(尚宮)になりたい",
  leave: "いつか宮を出て、自分で道を選びたい", serve: "陛下のお役に立ちたい", favor: "陛下に想われ、妃として仕えたい",
};
/** 好きなことに合う贈り物 */
export const ART_GIFT: Record<Art, Gift> = { poetry: "books", music: "score", painting: "brush", dance: "silk", embroidery: "silk", herbs: "flowers", go: "books" };

const SLOT = ["朝", "昼", "夕", "夜"];

type Lines = Record<Temper, string[]>;

/** あいさつ({slot} は時刻) */
const GREET: Lines = {
  gentle: ["{slot}のご機嫌はいかがでございますか、陛下。", "まあ、陛下。お目にかかれてうれしゅうございます。"],
  cheerful: ["陛下!よいところへ。ちょうどお話ししたいことがございました。", "{slot}の風が気持ちようございますね、陛下。"],
  shy: ["あ……陛下。失礼いたしました、気づかずに。", "……陛下。わたくしなどに、お声を。"],
  clever: ["陛下。今日は何をお考えでございますか。", "{slot}からお出ましとは、お珍しゅうございます。"],
  proud: ["陛下。わざわざお運びくださるとは。", "ごきげんよう、陛下。"],
  devoted: ["陛下……お顔が見られて、ほっといたしました。", "お待ちしておりました、陛下。"],
};

/** 好きなことの話 */
const ART_TALK: Record<Art, string[]> = {
  poetry: ["このごろ、曹子建の詩を書き写しております。言葉の運びが本当に見事で。", "庭の柳を見て、一首まとめかけております。まだ人にお見せできるほどでは。"],
  music: ["琴の弦を張り替えましたら、音が澄んでまいりました。", "夜に笛を吹くと、回廊に音が響いて、少し寂しげに聞こえますの。"],
  painting: ["筆の運びは、書も画も同じだと教わりました。まだまだでございます。", "蘭を描こうとして、葉の一枚に半日かかってしまいました。"],
  dance: ["袖を大きく使う舞を、女官たちと稽古しております。", "宴で舞うのは緊張いたしますが、楽の音に乗ると忘れてしまいます。"],
  embroidery: ["鳳凰の刺繍を仕上げているところです。羽の色合わせが難しくて。", "針を持っていると、心が静まります。"],
  herbs: ["庭の隅に薬草を植えました。熱冷ましになる草でございます。", "季節の花の名を、ひとつずつ覚えております。"],
  go: ["碁は、先を読むほど迷います。陛下は碁をなさいますか。", "昨日は女官に三目負けてしまいました。悔しゅうございます。"],
};

/** 将来の希望の話(信頼がある程度あると打ち明ける) */
const HOPE_TALK: Record<Hope, string> = {
  family: "故郷の母が病がちだと便りがございました。何もできないのが、もどかしくて。",
  study: "もっと書を読みたいのです。女の身でも、学ぶ道があればと。",
  quiet: "争いごとのない、穏やかな日々がいちばんだと思っております。",
  chief: "いつか女官たちをまとめる役を任されるほどになりたいのです。",
  leave: "いつか宮を出て、自分で暮らしを選んでみたいと思うことがございます。",
  serve: "陛下のお役に立てることがあれば、何でもいたしとうございます。",
  favor: "……陛下のおそばに、もっと長くいられたらと。",
};

/** 皇帝への気持ちが表れる言葉(恋愛感情・評価で変わる) */
const FEEL_HIGH: Lines = {
  gentle: ["陛下とお話ししていると、時がたつのを忘れます。"], cheerful: ["陛下がいらっしゃると、後宮が明るくなりますわ。"],
  shy: ["……また、お話しできますか。"], clever: ["陛下のお考えは、聞くたびに新しゅうございます。"],
  proud: ["陛下は、わたくしの話をちゃんと聞いてくださるのですね。"], devoted: ["陛下のことを思うと、胸があたたかくなります。"],
};
const FEEL_LOW: Lines = {
  gentle: ["お忙しいのでございましょう。どうかご無理なさらず。"], cheerful: ["近ごろ、あまりお見かけしませんでしたね。"],
  shy: ["……。"], clever: ["陛下の本心は、まだわかりかねます。"], proud: ["わたくしにも、都合というものがございます。"], devoted: ["少し、寂しゅうございました。"],
};

/** 人どうしの話(仲のよい人・合わない人) */
const FRIEND_TALK = ["{other}さまとは気が合いまして、よくご一緒しております。", "{other}さまが、昨日わたくしに菓子を分けてくださいました。"];
const RIVAL_TALK = ["{other}さまとは……少し、考え方が合いませんの。", "{other}さまのことは、あまりお話ししたくありません。"];

export function pick<T>(list: T[], r: number): T {
  return list[Math.min(list.length - 1, Math.floor(r * list.length))];
}

export interface TalkInput {
  temper: Temper; art: Art; hope: Hope; slot: number; romance: number; regard: number; trust: number;
  friend?: string; rival?: string; r: number[];
}

/** 会話の一続き(2〜3文) */
export function talkLines(x: TalkInput): string[] {
  const out = [pick(GREET[x.temper], x.r[0]).replace("{slot}", SLOT[x.slot] ?? "")];
  const k = x.r[1];
  if (x.trust >= 35 && k < 0.3) out.push(HOPE_TALK[x.hope]);
  else if (k < 0.55 && (x.friend || x.rival)) {
    const fr = x.friend && (!x.rival || x.r[2] < 0.6);
    out.push(pick(fr ? FRIEND_TALK : RIVAL_TALK, x.r[3]).replace("{other}", (fr ? x.friend : x.rival) ?? ""));
  } else out.push(pick(ART_TALK[x.art], x.r[2]));
  if (x.romance >= 55 && x.regard >= 50) out.push(pick(FEEL_HIGH[x.temper], x.r[3]));
  else if (x.regard < 35) out.push(pick(FEEL_LOW[x.temper], x.r[3]));
  return out;
}

/** 贈り物への返事 */
export function giftLine(temper: Temper, liked: boolean, disliked: boolean, gift: Gift): string {
  const g = GIFT_LABEL[gift];
  if (liked) return ({ gentle: `${g}を……ありがとうございます。大切にいたします。`, cheerful: `まあ、${g}!うれしい、ずっとほしかったのです。`, shy: `わ、わたくしに……${g}を。……ありがとうございます。`, clever: `${g}とは、よくおわかりで。ありがたく頂戴いたします。`, proud: `${g}ですか。……悪くございませんわ。`, devoted: `陛下から${g}を……一生の宝にいたします。` } as Record<Temper, string>)[temper];
  if (disliked) return ({ gentle: `お心遣い、ありがとうございます。`, cheerful: `${g}……ええと、ありがとうございます。`, shy: `……ありがとうございます。`, clever: `お気持ちだけ、頂戴いたします。`, proud: `${g}は、あまり好みではございませんの。`, devoted: `陛下のお気持ちがうれしゅうございます。` } as Record<Temper, string>)[temper];
  return `${g}をありがとうございます。`;
}

/** 誘い(庭園・食事)への返事 */
export function inviteLine(temper: Temper, ok: boolean, kind: "garden" | "meal"): string {
  const what = kind === "garden" ? "お庭へ" : "お食事に";
  if (ok) return ({ gentle: `よろこんで、${what}お供いたします。`, cheerful: `ぜひ!${what}まいりましょう。`, shy: `……はい。${what}、ご一緒させてください。`, clever: `${what}ですか。よろこんで。`, proud: `${what}……よろしゅうございますわ。`, devoted: `陛下とご一緒できるなら、どこへでも。` } as Record<Temper, string>)[temper];
  return ({ gentle: `申し訳ございません、いまは手が離せませんの。また次の折に。`, cheerful: `ごめんなさい、今日は先約がございまして。`, shy: `あ、あの……今日は、ご遠慮させてください。`, clever: `ありがたいお話ですが、今日はご辞退いたします。`, proud: `今日は気が向きませんの。`, devoted: `今日は体の具合がすぐれませんので……お許しください。` } as Record<Temper, string>)[temper];
}

/** 想いを伝えたときの返事 */
export function confessLine(temper: Temper, ok: boolean, reason: string): string {
  if (ok) return ({ gentle: "……わたくしも、同じ気持ちでございます。", cheerful: "本当ですか!……わたくしも、ずっと。", shy: "…………はい。わたくしも、お慕いしております。", clever: "そのお言葉、心から信じてもよろしゅうございますか。……はい。", proud: "ずいぶん待たされましたわ。……わたくしもです。", devoted: "うれしい……陛下、わたくしも同じでございます。" } as Record<Temper, string>)[temper];
  return `${({ gentle: "お気持ちはうれしゅうございます。けれど", cheerful: "ありがとうございます。でも", shy: "あの……ごめんなさい。", clever: "お言葉はありがたく存じます。ただ", proud: "急なお話ですこと。", devoted: "陛下のお気持ちは大切に思います。けれど" } as Record<Temper, string>)[temper]}${reason}`;
}

/** 表情(Version 53):通常・微笑・喜び・悲しみ・怒り・困惑・驚き・照れ */
export type Expr = "normal" | "smile" | "joy" | "sad" | "angry" | "puzzled" | "surprised" | "shy";
export const EXPR_LABEL: Record<Expr, string> = { normal: "通常", smile: "微笑", joy: "喜び", sad: "悲しみ", angry: "怒り", puzzled: "困惑", surprised: "驚き", shy: "照れ" };

/** 気持ちから、ふだんの表情を決める */
export function moodExpr(mood: number, jealousy: number, romance: number): Expr {
  if (jealousy >= 60) return "angry";
  if (mood < 35) return "sad";
  if (romance >= 60 && mood >= 60) return "shy";
  if (mood >= 75) return "joy";
  if (mood >= 55) return "smile";
  return "normal";
}
