import { PackingCategory } from "../types";

export interface PackingSuggestion {
  name: string;
  category: PackingCategory;
  note?: string;
}

/**
 * Starter lists for a late-September New York trip. Nine-ish days out from
 * the equinox the city runs roughly 15〜24°C — warm in the sun, chilly after
 * sunset — so the clothing suggestions are built around layering rather than
 * either summer or winter kit.
 *
 * These are only a starting point: everything can be edited or deleted, and
 * adding them twice won't duplicate anything (see PackingTab).
 */

/** Things only one of the two needs to carry. */
export const SHARED_SUGGESTIONS: PackingSuggestion[] = [
  { name: "eチケット控え(印刷 or スクショ)", category: "documents", note: "機内Wi-Fiがなくても見られるように" },
  { name: "ホテル予約確認書", category: "documents" },
  { name: "海外旅行保険の証書", category: "documents" },
  { name: "US$ 現金", category: "documents", note: "チップ用に$1札を多めに" },
  { name: "USB充電器(複数ポート)", category: "electronics" },
  {
    name: "変換プラグ",
    category: "electronics",
    note: "NYは日本と同じAタイプ120V。3ピンの機器だけ変換が必要です",
  },
  { name: "モバイルバッテリー", category: "electronics", note: "預け荷物は不可。機内持ち込みへ" },
  { name: "折りたたみ傘", category: "other", note: "9月下旬はにわか雨あり" },
  { name: "エコバッグ", category: "other", note: "NYはレジ袋が有料/なしの店が多い" },
  { name: "ジップロック(数枚)", category: "other" },
  { name: "洗濯用洗剤(小分け)", category: "other" },
  { name: "胃腸薬・鎮痛剤", category: "medicine" },
  { name: "絆創膏", category: "medicine", note: "歩く距離が長いので靴擦れ対策に" },
];

/** Added to each person's own list. */
export const PERSONAL_SUGGESTIONS: PackingSuggestion[] = [
  { name: "パスポート", category: "documents", note: "残存期間を確認" },
  { name: "ESTA(承認済みの控え)", category: "documents" },
  { name: "クレジットカード", category: "documents", note: "NYはほぼキャッシュレスで使えます" },
  { name: "スマホ", category: "electronics" },
  { name: "充電ケーブル", category: "electronics" },
  { name: "イヤホン", category: "electronics" },
  { name: "長袖シャツ", category: "clothes", note: "日中は20℃前後" },
  { name: "薄手のジャケット / 羽織り", category: "clothes", note: "朝晩は15℃前後まで下がります" },
  { name: "パンツ・ボトムス", category: "clothes" },
  { name: "下着・靴下(6日分)", category: "clothes" },
  { name: "パジャマ・部屋着", category: "clothes" },
  { name: "歩きやすい靴", category: "clothes", note: "1日2万歩になる日も" },
  { name: "少しきれいめの服", category: "clothes", note: "ディナーやショー用に1着" },
  { name: "歯ブラシ・歯磨き粉", category: "toiletries" },
  { name: "スキンケア用品", category: "toiletries" },
  { name: "日焼け止め", category: "toiletries" },
  { name: "常備薬", category: "medicine" },
  { name: "サングラス", category: "other" },
];
