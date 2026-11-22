// 後宮の主要な6人の、個別の物語(Version 53)。各5段階:出会い → 相互理解 → 個人的な問題 → 重要な選択 → 結末とその後。
// 段階の条件は、親密度だけでなく、信頼・時刻・季節・前の選択・約束を果たしたか・国の情勢(戦況・派閥・外戚・後継)を使う。
// 結末は、恋だけでなく、友情・昇進・帰郷・旅立ち・疎遠などに分かれる。恋の結末は、本人の同意(後宮の決まり)を通す。
// 物語の文はゲームのための創作で、史料の言葉ではない(4世紀の宮廷の暮らしを参考にした推定)。
import type { Expr } from "./palaceText";

export type Arc = "scholar" | "ambitious" | "provincial" | "attendant" | "consort" | "free";
export const ARC_TITLE: Record<Arc, string> = {
  scholar: "筆の跡", ambitious: "階(きざはし)", provincial: "故郷の便り", attendant: "主への忠", consort: "宮の灯", free: "籠の外",
};
export const ARC_ROLE: Record<Arc, string> = {
  scholar: "詩歌を愛する女官", ambitious: "出世を望む女官", provincial: "地方出身の女官", attendant: "主に仕える女官", consort: "妃", free: "宮の外を望む女官",
};

export interface StoryState {
  arc: Arc;
  /** 終えた段階(0〜5)。5 で結末 */
  stage: number;
  flags: Record<string, string | number | boolean>;
  ending?: string;
  /** 最後に段階を進めた日 */
  last: number;
  /** 結末のあとの便りを出した日 */
  letter?: number;
}

/** 物語の場面で使う、ゲームの状態の見方(palace.ts が用意する) */
export interface StoryCtx {
  name: string;
  emperor: string;
  slot: number;
  month: number;
  day: number;
  intimacy: number;
  trust: number;
  romance: number;
  regard: number;
  jealousy: number;
  flags: StoryState["flags"];
  since: number;
  /** 恋愛の選択肢が出せない理由(出せるなら null) */
  romanceBlock: string | null;
  /** 約束の状態(種類ごと) */
  promise(kind: string): "none" | "open" | "doing" | "kept" | "broken";
  promiseResult(kind: string): string | undefined;
  // 国の情勢
  origin: string;
  /** 出身の都市の様子:自国で無事 / 近くに敵 / 敵に奪われた */
  home: "safe" | "war" | "lost";
  atWar: boolean;
  mistress?: string;
  mistressJealous: boolean;
  /** 一族の臣下(外戚)の名。いなければ undefined */
  kin?: string;
  son?: string;
  sonIsHeir: boolean;
  hasEmpress: boolean;
  strongFaction?: string;
  recentHistory?: string;
  sickName?: string;
}

export interface StoryLine { t: string; e?: Expr }
export interface StoryChoice { id: string; label: string; need?: (x: StoryCtx) => string | null }
export interface StoryScene { title: string; lines: StoryLine[]; choices: StoryChoice[] }
export interface StageDef {
  /** 進める条件(満たさなければ、その理由の手がかり) */
  cond(x: StoryCtx): string | null;
  scene(x: StoryCtx): StoryScene;
}

const L = (t: string, e?: Expr): StoryLine => ({ t, e });
const day = (x: StoryCtx, d: number): string | null => (x.day - x.since >= d ? null : `前の出来事から、まだ日が浅い(あと${d - (x.day - x.since)}日ほど)`);
const need = (ok: boolean, why: string): string | null => (ok ? null : why);
const all = (...xs: (string | null)[]): string | null => xs.find((v) => v !== null) ?? null;
const SL = ["朝", "昼", "夕", "夜"];
const at = (x: StoryCtx, slots: number[]): string | null => need(slots.includes(x.slot), `${slots.map((s) => SL[s]).join("か")}に会うと、話が進みそうだ`);

export const ARCS: Record<Arc, StageDef[]> = {
  // ===== A:詩歌を愛する女官 =====
  scholar: [
    {
      cond: (x) => at(x, [1, 2]),
      scene: (x) => ({
        title: "回廊の詩", lines: [L(`回廊の柱の影で、${x.name}が筆を走らせていた。陛下に気づくと、慌てて紙を伏せる。`, "surprised"), L("「も、申し訳ございません。務めの合間に、つい……」", "shy")],
        choices: [{ id: "praise", label: "続きを聞かせてほしいと言う" }, { id: "reply", label: "自分も一句を返す" }, { id: "duty", label: "務めに戻るよう促す" }],
      }),
    },
    {
      cond: (x) => all(day(x, 2), need(x.intimacy >= 18 && x.trust >= 15, "もう少し打ち解けてから"), at(x, [1, 2])),
      scene: (x) => ({
        title: "書庫の夢", lines: [
          L(x.flags.s1 === "reply" ? "「先日の陛下の句、忘れられません。あの一字の選び方……」" : x.flags.s1 === "duty" ? "「先日は、失礼をいたしました。……でも、書くことはやめられないのです」" : "「先日は、拙い詩をお聞きくださって」", x.flags.s1 === "duty" ? "sad" : "smile"),
          L("「宮中の書庫には、左思の『三都賦』の写しもあると聞きました。一度でいいから、読んでみたいのです」", "normal")],
        choices: [{ id: "lend", label: "書庫の書を届けると約束する" }, { id: "salon", label: "皆で詩の会を開こうと誘う" }, { id: "duty", label: "学問より務めが大切だと言う" }],
      }),
    },
    {
      cond: (x) => all(day(x, 3), need(x.trust >= 30, "まだ悩みを打ち明けるほどの信頼がない"), need(x.flags.s2 !== "lend" || x.promise("books") === "kept" || x.promise("books") === "broken", "約束した書を、まだ届けていない")),
      scene: (x) => ({
        title: "年季の明ける日", lines: [
          x.promise("books") === "broken" ? L("「……書のお約束のことは、もうよいのです」", "sad") : x.promise("books") === "kept" ? L("「いただいた書、毎晩読んでおります。墨の香りまで覚えてしまいました」", "joy") : L("「詩の会、楽しゅうございました」", "smile"),
          L("「実は、来年で宮仕えの年季が明けます。家では縁談を決めてしまったようで……嫁げば、もう筆は持てないでしょう」", "sad")],
        choices: [{ id: "post", label: "宮中の女史(記録の役)に取り立て、学問を続けられるようにする" }, { id: "marry", label: "家の決めた道に従うよう勧める" }, { id: "heart", label: "自分の気持ちを打ち明ける", need: (y) => y.romanceBlock ?? (y.romance >= 35 ? null : "まだ、恋の気持ちを伝えるほどではない") }],
      }),
    },
    {
      cond: (x) => all(day(x, 5), need([3, 4, 9, 10].includes(x.month) || x.day - x.since >= 30, "春か秋の詩の季節(または、ひと月ほどのち)に"), need(x.trust >= 40, "信頼がもう少し要る")),
      scene: (x) => ({
        title: "選ぶ道", lines: [
          L(x.flags.s3 === "post" ? "「女史の務め、ありがたく務めております。宮の出来事を書き留めるのは、詩とはまた違う喜びです」" : x.flags.s3 === "heart" ? "「先日のお言葉、ずっと胸の中で繰り返しております」" : "「縁談の日取りが決まりました」", x.flags.s3 === "heart" ? "shy" : "normal"),
          ...(x.recentHistory ? [L(`「${x.recentHistory}のことも、いつか誰かが書き残さねばなりません」`, "normal")] : []),
          L("「陛下。わたくしは、どの道を選べばよいのでしょう」", "puzzled")],
        choices: [{ id: "respect", label: "「あなたの望む道を選んでほしい」と伝える" }, { id: "compile", label: "共に、宮の詩と記録をまとめようと誘う" }, { id: "free", label: "宮を出て学ぶことを許す" }],
      }),
    },
    {
      cond: (x) => day(x, 3),
      scene: (x) => ({ title: "結末", lines: [L(`${x.name}は、静かに頭を下げた。`, "smile")], choices: [{ id: "end", label: "その答えを聞く" }] }),
    },
  ],
  // ===== B:出世を望む女官 =====
  ambitious: [
    {
      cond: (x) => at(x, [0, 1]),
      scene: (x) => ({
        title: "帳簿の女官", lines: [L(`${x.name}は、絹の出し入れの帳簿を手早く改めていた。`, "normal"), L("「陛下。近ごろ、尚服の倉の絹が合わぬのです。……こういうことは、上の方々は気にも留めませんけれど」", "puzzled")],
        choices: [{ id: "task", label: "その才を認め、倉の改めを任せる" }, { id: "politics", label: "宮中の事情を詳しく聞く" }, { id: "limit", label: "女官の分を守るよう言う" }],
      }),
    },
    {
      cond: (x) => all(day(x, 2), need(x.intimacy >= 18 && x.trust >= 15, "もう少し打ち解けてから")),
      scene: (x) => ({
        title: "派閥の誘い", lines: [
          L(x.flags.s1 === "limit" ? "「分は心得ております。……でも、分を守るだけでは、何も変わりません」" : "「先日は、聞いてくださってありがとうございました」", x.flags.s1 === "limit" ? "angry" : "smile"),
          L(x.strongFaction ? `「${x.strongFaction}の方から、仲間に入らぬかと声をかけられました。力のある方につくのが、宮で生きる知恵だと」` : "「女官たちの中にも、徒党を組む者がおります。わたくしにも声がかかりました」", "puzzled")],
        choices: [{ id: "neutral", label: "どの派閥にも与しないよう諭す" }, { id: "side", label: "力のある派閥につくのは賢いと言う" }, { id: "spy", label: "派閥の動きを知らせてほしいと頼む" }],
      }),
    },
    {
      cond: (x) => all(day(x, 3), need(x.trust >= 25, "信頼がもう少し要る")),
      scene: (x) => ({
        title: "絹の噂", lines: [L(`${x.name}が、目を赤くして待っていた。「陛下……わたくしが倉の絹を横流ししたという噂が立っております」`, "sad"), L("「誓って、そのようなことは。……けれど、ある方をかばっていることがあって、すべては申し上げられないのです」", "puzzled")],
        choices: [{ id: "investigate", label: "内侍に、ひそかに調べさせると約束する" }, { id: "trust", label: "信じると告げ、かばう" }, { id: "blame", label: "噂が立つこと自体が不始末だと叱る" }],
      }),
    },
    {
      cond: (x) => all(day(x, 4), need(x.flags.s3 !== "investigate" || ["kept", "broken"].includes(x.promise("investigate")), "調べの結果を、まだ受け取っていない"), need(x.trust >= 35 || x.flags.s3 === "blame", "信頼がもう少し要る")),
      scene: (x) => ({
        title: "尚宮の座", lines: [
          x.promiseResult("investigate") ? L(`「調べてくださったのですね。${x.promiseResult("investigate")}……わたくしの名は晴れました」`, "joy") : x.flags.s3 === "blame" ? L("「……お叱りは、身に沁みました」", "sad") : L("「かばってくださったこと、一生忘れません」", "joy"),
          L("「尚宮さまが年老いて退かれるそうです。次の尚宮に、わたくしの名が挙がっていると……」", "normal")],
        choices: [{ id: "chief", label: "次の尚宮に推す" }, { id: "consort", label: "妃として迎えたいと伝える", need: (y) => y.romanceBlock ?? (y.romance >= 45 ? null : "まだ、そこまでの想いは通っていない") }, { id: "own", label: "派閥から離れ、自分の道を考えるよう勧める" }],
      }),
    },
    { cond: (x) => day(x, 3), scene: (x) => ({ title: "結末", lines: [L(`${x.name}は、背筋を伸ばして陛下を見上げた。`, "normal")], choices: [{ id: "end", label: "その答えを聞く" }] }) },
  ],
  // ===== C:地方出身の女官 =====
  provincial: [
    {
      cond: (x) => at(x, [2, 3]),
      scene: (x) => ({
        title: "夕暮れの北の空", lines: [L(`${x.name}が、回廊から遠くの空を見ていた。`, "sad"), L(`「……${x.origin}は、あちらの方角でしょうか。都に来てから、まだ一度も帰っていないのです」`, "sad")],
        choices: [{ id: "ask", label: "故郷のことを尋ねる" }, { id: "cheer", label: "宮の暮らしに慣れるよう励ます" }, { id: "pass", label: "そっとしておく" }],
      }),
    },
    {
      cond: (x) => all(day(x, 2), need(x.intimacy >= 15, "もう少し打ち解けてから")),
      scene: (x) => ({
        title: "母と兄", lines: [L(x.flags.s1 === "ask" ? "「先日は、故郷のことを聞いてくださって」" : "「陛下……あの、少しよろしいですか」", "shy"), L(`「${x.origin}には母と兄がおります。兄は兵に取られたと便りがあって……${x.atWar ? "いまも戦が続いていると聞き、眠れぬ夜がございます" : "その後の便りがありません"}」`, "sad")],
        choices: [{ id: "family", label: "家族の様子を調べさせると約束する" }, { id: "letter", label: "文を届ける手配をする(金20)" }, { id: "honest", label: "いまは手立てがないと正直に告げる" }],
      }),
    },
    {
      cond: (x) => all(day(x, 3), need(x.flags.s2 !== "family" || ["kept", "broken"].includes(x.promise("family")), "家族の様子を、まだ調べ終えていない"), need(x.trust >= 25, "信頼がもう少し要る")),
      scene: (x) => {
        const r = x.promiseResult("family") ?? (x.home === "lost" ? "lost" : x.home === "war" ? "war" : "safe");
        return {
          title: "故郷の知らせ", lines: [
            x.promise("family") === "broken" ? L("「……調べてくださるとおっしゃったのに」", "sad") : x.promise("family") === "kept" ? L("「使者を送ってくださったのですね。本当に……」", "joy") : L("「文が届いたようです」", "normal"),
            r === "lost" ? L(`「${x.origin}は、敵の手に落ちたと……母も兄も、行方が知れません」`, "sad") : r === "war" ? L(`「${x.origin}のそばまで敵が迫っていると。母は病で、兄は城を守っているそうです」`, "sad") : L(`「${x.origin}は無事で、母も元気だと。ただ、兄が足を痛めて、畑が荒れているそうです」`, "smile")],
          choices: [{ id: "help", label: r === "lost" ? "行方を探させる(金80)" : "薬と見舞いの品を送る(金40)" }, { id: "visit", label: "しばらく故郷へ帰ることを許す", need: (y) => (y.home === "lost" ? "故郷は敵の手にあり、いまは帰れない" : null) }, { id: "stay", label: "宮にとどまってほしいと頼む" }],
        };
      },
    },
    {
      cond: (x) => all(day(x, 5), need(x.trust >= 35, "信頼がもう少し要る")),
      scene: (x) => ({
        title: "これからの暮らし", lines: [L(x.flags.s3 === "visit" ? "「故郷の土の匂いを嗅いで、やっと胸のつかえが下りました」" : x.flags.s3 === "help" ? "「陛下のおかげで、家族に手を差しのべられました」" : "「宮にとどまると決めました。……でも、心は半分故郷にあります」", x.flags.s3 === "stay" ? "sad" : "smile"), L("「陛下。わたくしは、これから、どこで生きればよいのでしょう」", "puzzled")],
        choices: [{ id: "home", label: "故郷へ帰り、家族を支えることを勧める", need: (y) => (y.home === "lost" ? "故郷は敵の手にあり、いまは帰れない" : null) }, { id: "bring", label: "家族を都へ呼び寄せる(金200)" }, { id: "heart", label: "そばにいてほしいと気持ちを伝える", need: (y) => y.romanceBlock ?? (y.romance >= 40 ? null : "まだ、そこまでの想いは通っていない") }],
      }),
    },
    { cond: (x) => day(x, 3), scene: (x) => ({ title: "結末", lines: [L(`${x.name}は、手を胸の前で重ねた。`, "normal")], choices: [{ id: "end", label: "その答えを聞く" }] }) },
  ],
  // ===== D:主に仕える女官 =====
  attendant: [
    {
      cond: (x) => at(x, [0, 1]),
      scene: (x) => ({
        title: "控えの間", lines: [L(`${x.name}は、${x.mistress ?? "主"}の衣を整えて控えていた。陛下に気づくと、深く拝礼する。`, "normal"), L(`「${x.mistress ?? "主"}さまに、ご用でございますか」`, "normal")],
        choices: [{ id: "ask", label: `${x.mistress ?? "主"}の様子を尋ねる` }, { id: "self", label: "彼女自身のことを尋ねる" }, { id: "secret", label: "主には内密に話したいと言う" }],
      }),
    },
    {
      cond: (x) => all(day(x, 2), need(x.intimacy >= 15 && x.trust >= 15, "もう少し打ち解けてから")),
      scene: (x) => ({
        title: "主の憂い", lines: [
          L(x.flags.s1 === "secret" ? "「先日のこと……主に隠しごとはできません。お許しください」" : "「先日はお声をかけてくださって」", x.flags.s1 === "secret" ? "puzzled" : "smile"),
          L(x.mistressJealous ? `「${x.mistress}さまは、近ごろお心が晴れません。陛下が、ほかの方のもとへばかりお運びになると……」` : `「${x.mistress}さまは、陛下のお越しを心待ちにしておいでです」`, x.mistressJealous ? "sad" : "smile")],
        choices: [{ id: "visit", label: `近いうちに${x.mistress}を訪ねると約束する` }, { id: "cold", label: "後宮の争いは常のことだと言う" }, { id: "mediate", label: "皇帝として、角が立たぬよう計らうと言う" }],
      }),
    },
    {
      cond: (x) => all(day(x, 3), need(x.flags.s2 !== "visit" || ["kept", "broken"].includes(x.promise("visit")), `${x.mistress}を訪ねる約束が、まだ果たされていない`), need(x.trust >= 25, "信頼がもう少し要る")),
      scene: (x) => ({
        title: "密告の誘い", lines: [
          x.promise("visit") === "kept" ? L(`「陛下がお運びくださって、${x.mistress}さまは久しぶりにお笑いになりました」`, "joy") : x.promise("visit") === "broken" ? L(`「……${x.mistress}さまは、ずっとお待ちでした」`, "sad") : L("「お心遣い、ありがとうございます」", "normal"),
          L(`「実は……別の方の侍女から、${x.mistress}さまのご様子を知らせよと、銀を渡されそうになりました」`, "puzzled")],
        choices: [{ id: "loyal", label: "主に誠実に仕えるよう励ます" }, { id: "report", label: "その動きを自分に知らせてほしいと頼む" }, { id: "transfer", label: "板挟みにならぬよう、勤め先を寝殿に移す" }],
      }),
    },
    {
      cond: (x) => all(day(x, 4), need(x.trust >= 35, "信頼がもう少し要る")),
      scene: (x) => ({
        title: "証言", lines: [L(`「${x.mistress}さまに、呪詛をしたという訴えが出ております。わたくしにも、取り調べで話せと……」`, "surprised"), L("「本当のことを申せば、主を傷つけるかもしれません。黙っていれば、主を守れるかもしれません」", "sad")],
        choices: [{ id: "truth", label: "見たままを語るよう求める" }, { id: "protect", label: "主を守るよう求める" }, { id: "own", label: "彼女自身の判断に任せる" }],
      }),
    },
    { cond: (x) => day(x, 3), scene: (x) => ({ title: "結末", lines: [L(`${x.name}は、しばらく黙っていた。`, "normal")], choices: [{ id: "end", label: "その答えを聞く" }] }) },
  ],
  // ===== E:妃 =====
  consort: [
    {
      cond: (x) => at(x, [2, 3]),
      scene: (x) => ({
        title: "灯のもとで", lines: [L(`${x.name}は、灯のもとで刺繍をしていた。`, "smile"), L(x.kin ? `「兄の${x.kin}が、近ごろ宮へよく参ります。陛下のお役に立ちたいと、口癖のように」` : "「宮の夜は、長うございますね」", "normal")],
        choices: [{ id: "kin", label: "家門の話を聞く" }, { id: "life", label: "宮の暮らしで不自由はないかと尋ねる" }, { id: "nopol", label: "政の話はしないでほしいと言う" }],
      }),
    },
    {
      cond: (x) => all(day(x, 3), need(x.intimacy >= 25 && x.trust >= 20, "もう少し心を通わせてから")),
      scene: (x) => ({
        title: x.kin ? "外戚の願い" : "母への便り", lines: [
          L(x.flags.s1 === "nopol" ? "「政の話はいたしません。……ただ、これだけは」" : "「陛下。ひとつ、お願いがございます」", "puzzled"),
          L(x.kin ? `「${x.kin}を、どこかの郡の太守に取り立てていただけないでしょうか。家門の者たちが、それを望んでおります」` : "「母が病がちで……一度、宮へ呼んで顔を見せてもよろしいでしょうか」", "normal")],
        choices: x.kin
          ? [{ id: "appoint", label: `${x.kin}を太守に取り立てる` }, { id: "refuse", label: "外戚を重く用いるのは国のためにならないと断る" }, { id: "chancellor", label: "宰相に諮ると約束する" }]
          : [{ id: "mother", label: "母を宮へ招くことを許す" }, { id: "refuse", label: "いまは宮の出入りを控えるよう言う" }, { id: "gift", label: "母に見舞いの品を送る(金40)" }],
      }),
    },
    {
      cond: (x) => all(day(x, 4), need(x.flags.s2 !== "chancellor" || ["kept", "broken"].includes(x.promise("chancellor")), "宰相の意見を、まだ聞いていない"), need(x.trust >= 30, "信頼がもう少し要る")),
      scene: (x) => ({
        title: x.son ? "子の行く末" : "寵愛の影", lines: [
          x.promiseResult("chancellor") ? L(`「宰相さまは、${x.promiseResult("chancellor")}と……」`, "normal") : L(x.flags.s2 === "appoint" || x.flags.s2 === "mother" ? "「先日は、願いを聞き届けてくださって」" : "「先日のこと、わきまえました」", x.flags.s2 === "refuse" ? "sad" : "smile"),
          L(x.son ? `「${x.son}も大きくなりました。……あの子の行く末を思うと、夜も眠れぬことがございます」` : "「宮の者たちが、陛下の寵愛はもう移ったと噂しております」", "sad")],
        choices: x.son
          ? [{ id: "promiseSon", label: `${x.son}を大切に思っていると告げる` }, { id: "tutor", label: `${x.son}に良い師をつけると言う` }, { id: "talent", label: "後継は才で選ぶと正直に言う" }]
          : [{ id: "reassure", label: "噂など気にするなと安心させる" }, { id: "time", label: "共に過ごす時を増やすと言う" }, { id: "honest", label: "正直な気持ちを話し合う" }],
      }),
    },
    {
      cond: (x) => all(day(x, 5), need(x.trust >= 40, "信頼がもう少し要る")),
      scene: (x) => ({
        title: "宮の行方", lines: [L(x.strongFaction ? `「宮中は、${x.strongFaction}とそうでない者に分かれております」` : "「宮中の者たちが、陛下のお考えを知りたがっております」", "puzzled"),
          L(x.son && !x.sonIsHeir ? `「陛下。${x.son}を、お世継ぎとしてお認めいただけませんか」` : !x.hasEmpress ? "「陛下。わたくしは、陛下のおそばで、もっと重い務めを果たしたいのです」" : "「陛下。わたくしは、このままでよいのでしょうか」", "normal")],
        choices: [
          ...(x.son && !x.sonIsHeir ? [{ id: "heir", label: `${x.son}を後継者に指名する` }] : []),
          ...(!x.hasEmpress ? [{ id: "empress", label: "皇后に立てたいと伝える" }] : []),
          { id: "quiet", label: "いまのまま、穏やかに暮らしてほしいと言う" },
          { id: "distance", label: "しばらく距離を置きたいと告げる" },
        ],
      }),
    },
    { cond: (x) => day(x, 3), scene: (x) => ({ title: "結末", lines: [L(`${x.name}は、陛下の言葉を静かに受け止めた。`, "normal")], choices: [{ id: "end", label: "その答えを聞く" }] }) },
  ],
  // ===== F:宮の外を望む女官 =====
  free: [
    {
      cond: (x) => at(x, [1]),
      scene: (x) => ({
        title: "薬草園", lines: [L(`庭園の隅で、${x.name}が土にまみれて草を摘んでいた。`, "joy"), L("「この草は熱を下げ、こちらは傷によいのです。……宮の外の野には、もっとたくさん生えているでしょうね」", "smile")],
        choices: [{ id: "learn", label: "薬草のことを教えてもらう" }, { id: "outside", label: "宮の外の話をする" }, { id: "scold", label: "外に出たいなど不敬だと咎める" }],
      }),
    },
    {
      cond: (x) => all(day(x, 2), need(x.intimacy >= 15, "もう少し打ち解けてから")),
      scene: (x) => ({
        title: "侍医への願い", lines: [L(x.flags.s1 === "scold" ? "「……先日は、出過ぎたことを申しました」" : "「陛下。お願いがございます」", x.flags.s1 === "scold" ? "sad" : "normal"), L("「侍医さまに、医の道を教わりたいのです。女の身でも、人の命を救えるなら」", "normal")],
        choices: [{ id: "doctor", label: "侍医に教えを受けることを許す" }, { id: "decide", label: "侍医に話を通しておくと約束する" }, { id: "no", label: "女官の務めではないと退ける" }],
      }),
    },
    {
      cond: (x) => all(day(x, 3), need(x.flags.s2 !== "decide" || ["kept", "broken"].includes(x.promise("doctor")), "侍医に、まだ話を通していない"), need(x.trust >= 25, "信頼がもう少し要る")),
      scene: (x) => ({
        title: "病の床", lines: [
          x.promise("doctor") === "broken" ? L("「侍医さまのこと……もう待つのはやめました。ひとりで書を読んでおります」", "angry") : L(x.flags.s2 === "no" ? "「務めではないと言われましたが……見過ごせないのです」" : "「侍医さまから、脈の取り方を教わりました」", "normal"),
          L(x.sickName ? `「${x.sickName}さまが病で伏せっておいでです。看病を、わたくしに任せていただけませんか」` : x.atWar ? "「戦で傷を負った兵が、都に運ばれてきていると聞きました。手当てを手伝いたいのです」" : "「宮の外の村で、熱の病がはやっていると聞きました」", "puzzled")],
        choices: [{ id: "nurse", label: "看病・手当てを任せる" }, { id: "stop", label: "危ないのでやめるよう言う" }, { id: "together", label: "共に見舞いに行く" }],
      }),
    },
    {
      cond: (x) => all(day(x, 5), need(x.trust >= 35, "信頼がもう少し要る")),
      scene: (x) => ({
        title: "籠の扉", lines: [L(x.flags.s3 === "stop" ? "「……あの時、止められて、わたくしは悔しゅうございました」" : "「看た方が、元気になられました。あの時の嬉しさは、何にも代えられません」", x.flags.s3 === "stop" ? "sad" : "joy"), L("「郡の医官が、女の弟子を探しているそうです。宮を出て、そこで学びたいのです」", "normal")],
        choices: [{ id: "go", label: "宮を出て医の道へ進むことを許す" }, { id: "stay", label: "宮の医女として残ってほしいと頼む" }, { id: "heart", label: "そばにいてほしいと気持ちを伝える", need: (y) => y.romanceBlock ?? (y.romance >= 40 ? null : "まだ、そこまでの想いは通っていない") }],
      }),
    },
    { cond: (x) => day(x, 3), scene: (x) => ({ title: "結末", lines: [L(`${x.name}は、まっすぐに陛下を見つめた。`, "normal")], choices: [{ id: "end", label: "その答えを聞く" }] }) },
  ],
};

/** 結末の名前 */
export const ENDING_LABEL: Record<string, string> = {
  lover: "想いの通う間柄", consort: "妃として", empress: "皇后として", scholar: "女史として学問の道へ", leave: "宮を出て自分の道へ", colleague: "信頼で結ばれた仲間",
  chief: "尚宮として宮を束ねる", own: "派閥を離れ自分の道へ", distant: "心の離れた間柄", home: "故郷へ帰り家族のもとへ", family: "都で家族と暮らす",
  loyal: "主に仕え続ける忠臣", confidant: "皇帝の腹心", healer_out: "旅立つ医女", healer_in: "宮の医女", heir: "後継の母として", quiet: "穏やかな日々", friend: "心を許した友",
};
