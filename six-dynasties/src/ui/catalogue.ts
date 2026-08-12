/*
 * 画面に出す日本語の一覧。
 *
 * core 側は id しか持たない。日本語をここに集めておくと、
 * 計算のある場所に表示の都合が混ざらない
 */
import type {
  DemandType,
  FactionId,
  FactionStance,
  HomelandId,
  ProvinceId,
  TurnEventId,
  WingOrder,
} from '../core/types';

export const PROVINCE_LABELS: Record<ProvinceId, string> = {
  Si: '司州',
  Yong: '雍州',
  Liang: '涼州',
  Bing: '并州',
  Ji: '冀州',
  You: '幽州',
  Qing: '青州',
  Yu: '豫州',
  Yang: '揚州',
  Jing: '荊州',
  Jiang: '江州',
  Yi: '益州',
  Ning: '寧州',
  Guang: '広州',
  Jiao: '交州',
};

/** その州の治所。地図に点で置く */
export const PROVINCE_SEATS: Record<ProvinceId, string> = {
  Si: '洛陽',
  Yong: '長安',
  Liang: '姑臧',
  Bing: '晋陽',
  Ji: '鄴',
  You: '薊',
  Qing: '臨淄',
  Yu: '寿春',
  Yang: '建康',
  Jing: '江陵',
  Jiang: '尋陽',
  Yi: '成都',
  Ning: '味県',
  Guang: '番禺',
  Jiao: '龍編',
};

/** 治所の経緯度。地図の投影を通して置く */
export const SEAT_COORDS: Record<ProvinceId, [number, number]> = {
  Si: [112.45, 34.68],
  Yong: [108.94, 34.34],
  Liang: [102.63, 37.93],
  Bing: [112.55, 37.87],
  Ji: [114.3, 36.1],
  You: [116.4, 39.9],
  Qing: [118.3, 36.85],
  Yu: [116.8, 32.6],
  Yang: [118.79, 32.06],
  Jing: [112.19, 30.35],
  Jiang: [115.99, 29.71],
  Yi: [104.07, 30.67],
  Ning: [103.7, 25.5],
  Guang: [113.26, 23.13],
  Jiao: [106.0, 21.1],
};

export const PROVINCE_NOTES: Record<ProvinceId, string> = {
  Si: '洛陽を擁する天下の中心。ここを失えば北の朝廷は終わる',
  Yong: '関中と長安。四塞の地だが、氐羌がすでに内に住む',
  Liang: '河西回廊と西域。遠く、痩せているが、涼州の兵は強い',
  Bing: '汾水の谷。南匈奴が内徙した地。劉淵はここから起こる',
  Ji: '河北平原と鄴。天下でもっとも戸口が多い',
  You: '薊と遼西。北は鮮卑、東は高句麗に接する',
  Qing: '山東。海に臨み、淮北の争奪に巻き込まれ続ける',
  Yu: '淮水の北。南北の朝廷がここで押し合う',
  Yang: '建康と三呉。南渡した朝廷の都が置かれる',
  Jing: '江漢と江陵。上流から都を睨む方鎮の地',
  Jiang: '鄱陽湖と閩。都の後ろ盾になる',
  Yi: '蜀。四塞の地で、独立の国が立ちやすい',
  Ning: '南中。遠く、痩せている',
  Guang: '嶺南と番禺。海の交易で潤う',
  Jiao: '日南。天下の南端',
};

export const FACTION_LABELS: Record<FactionId, string> = {
  Xiongnu: '匈奴',
  Jie: '羯',
  Di: '氐',
  Qiang: '羌',
  Ba: '巴氐',
  Lushui: '盧水胡',
  Dingling: '丁零',
  Qifu: '乞伏鮮卑',
  Tuoba: '拓跋鮮卑',
  Murong: '慕容鮮卑',
  Yuwen: '宇文鮮卑',
  Rouran: '柔然',
  Goguryeo: '高句麗',
  Tuyuhun: '吐谷渾',
};

export const FACTION_NOTES: Record<FactionId, string> = {
  Xiongnu: '并州に内徙した南匈奴。劉淵が漢を称し、洛陽を陥れる',
  Jie: '匈奴に従って来た西域系の民。石勒が奴隷から身を起こす',
  Di: '関中と隴西の民。苻氏が前秦を建て、華北をひとつにする',
  Qiang: '関中の民。姚氏が後秦を建てる',
  Ba: '蜀に流れ込んだ巴の氐。李氏が成漢を建てる',
  Lushui: '河西の雑胡。沮渠氏が北涼を建てる',
  Dingling: '高車の一部。翟氏が河南に拠る',
  Qifu: '隴西の鮮卑。西秦を建てる',
  Tuoba: '盛楽の鮮卑。のちの北魏。この時代の終わりまで残る唯一の勢力',
  Murong: '遼西の鮮卑。前燕・後燕を建て、慕容垂は当代随一の将',
  Yuwen: '松嫩の鮮卑。慕容部に敗れて散る',
  Rouran: '漠北の遊牧。掠めては引き揚げ、土地には住み着かない',
  Goguryeo: '遼東を東から押す。楽浪を併呑して大国になる',
  Tuyuhun: '青海の鮮卑。隴右と河西を脅かす',
};

export const HOMELAND_LABELS: Record<HomelandId, string> = {
  Tuoba: '盛楽（拓跋の郷里）',
  Murong: '遼東の北（慕容の郷里）',
  Yuwen: '松嫩（宇文の郷里）',
  Rouran: '漠北（柔然の草原）',
  Goguryeo: '丸都（高句麗）',
  Tuyuhun: '青海（吐谷渾）',
};

export const STANCE_LABELS: Record<FactionStance, string> = {
  hostile: '敵対',
  auxiliary: '帰順',
  enfeoffed: '建国',
};

export const DEMAND_LABELS: Record<DemandType, string> = {
  gold: '歳幣',
  land: '土地の割譲',
  title: '王号の授与',
};

export const DEMAND_DETAILS: Record<DemandType, string> = {
  gold: '国庫から払う。相手は兵の一部を解いて引き揚げる',
  land: 'その州を与えて国を建てさせる。戦線は消えるが戸口を永久に失う',
  title: '王に封じる。義従として兵を出すが、士族の支持と天命を損なう',
};

export const ORDER_LABELS: Record<WingOrder, string> = {
  advance: '前進',
  flank: '迂回',
  withdraw: '退却',
};

export const TURN_EVENT_LABELS: Record<TurnEventId, string> = {
  crossed_south: '衣冠南渡 — 朝廷は江南へ移った',
  capital_fell: '都が陥ちた',
  capital_moved: '遷都した',
  north_founded: '北朝が立った',
  north_split: '北朝が東西に裂けた',
  north_offensive: '北朝が南征を始めた',
  prince_revolt: '宗室が兵を挙げた',
  prince_suppressed: '挙兵した王を討った',
  usurpation: '簒奪',
  abdication: '禅譲 — 位が渡り、王朝が替わった',
  succession_crisis: '継承危機',
  auxiliary_defected: '義従胡が寝返った',
  army_deserted: '給が絶え、兵が散った',
  battle_won: '会戦に勝った',
  battle_lost: '会戦に敗れた',
  sovereign_captured: '帝が捕らわれた',
  unified: '天下統一',
  sui_unified: '隋が天下を統一した',
};

/** 7つのパラメータの説明。状況表示で長押ししたときに出す */
export const PARAMETER_NOTES = {
  treasury: '国庫。税収から軍の維持費・歳幣・宮廷費を引いた残り。負になると兵が散る',
  taxBase: '戸口。帳簿に載っている民の数。州を失うと減り、屯田と土断で戻る',
  centralArmy: '中軍。朝廷が直接握る兵。維持費が最大の支出',
  mandate: '天命。尽きれば位は実権を握る者へ渡る（禅譲）',
  gentry: '士族の支持。門閥貴族。増税で下がり、免税特権の追認で上がる',
  princeLoyalty: '宗室の帰順。削藩で下がり、鎮撫で上がる。低いほど諸王が兵を挙げる',
  tribalLoyalty: '胡族の帰順。義従胡への給の払い実績に連なる。絶えると寝返る',
} as const;
