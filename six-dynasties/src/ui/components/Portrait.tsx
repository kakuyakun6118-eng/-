/*
 * 人物の顔。
 *
 * 写真ではなく**絹本の肖像**として描く。この画面は絹地に墨と朱で書かれた
 * 帳簿の体裁なので、写実の顔を貼るとそこだけが浮く。輪郭と冠だけを線で取り、
 * 色はこのアプリの七色（絹・墨・金・朱・紺・碧）から出さない。
 *
 * **顔は素性から決まる。** 同じ人物はいつ描いても同じ顔になるように、
 * 人物の id を種にして特徴を引く（`createRng`）。年が変われば髭と白髪だけが
 * 変わり、顔立ちは変わらない。
 *
 * 冠は身分そのものである。冕冠の旒は天子にしか許されず、諸王は遠遊冠、
 * 文官は進賢冠、武人は兜、胡族の首長は貂の帽をかぶる。
 * **冠を見ればその人物が何者かが分かる**ようにしてある
 */
import { createRng } from '../../core/rng';

export type PortraitRole =
  | 'emperor'
  | 'empress'
  | 'prince'
  | 'chancellor'
  | 'inspector'
  | 'marshal'
  | 'chieftain'
  | 'northRuler';

export interface PortraitSpec {
  /** 顔を決める種。人物の id を渡す */
  seed: string;
  role: PortraitRole;
  age: number;
  /** 女性として描く。皇后と女性の首長 */
  female?: boolean;
  /** 胡風に描く。弁髪・毛皮・左衽 */
  hu?: boolean;
}

/** 種の文字列を数にする（FNV-1a）。同じ名なら同じ顔になる */
function hashOf(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 年の分からない人物に、種から年を当てる。
 *
 * 首長も諸王も生年を持たないので、そのままでは全員が同じ年格好になり、
 * 十四の胡族が**同じ白鬚の老人ばかり**になった。顔と同じ種から引けば、
 * 同じ人物はいつ見ても同じ年格好で、隣の人物とは違う
 */
export function seededAge(seed: string, low: number, high: number): number {
  return low + (hashOf(`${seed}:age`) % (high - low + 1));
}

const SKINS = ['#e3c2a0', '#d8b189', '#c69c74'];
const FURS = ['#6b543a', '#4f4033', '#7d6142', '#584535'];
const FURS_DARK = ['#4a3a2a', '#332a22', '#59432d', '#3b2f24'];
const HAIR_BLACK = '#241c15';
const HAIR_GREY = '#8b8375';
const HAIR_WHITE = '#cdc6b6';

/** 役ごとの衣。上が表、下が襟の裏 */
const ROBES: Record<PortraitRole, { cloth: string[]; collar: string; trim: string }> = {
  emperor: { cloth: ['#1b2637', '#2e3f57'], collar: '#9b2d20', trim: '#d0a63f' },
  empress: { cloth: ['#6d1d15', '#4a2b52'], collar: '#e7dcc6', trim: '#d0a63f' },
  prince: { cloth: ['#4a2b52', '#5d3a2a'], collar: '#e7dcc6', trim: '#9c7a26' },
  chancellor: { cloth: ['#3b4a63', '#4a6f5d'], collar: '#e7dcc6', trim: '#9c7a26' },
  inspector: { cloth: ['#4a6f5d', '#5c5044'], collar: '#e7dcc6', trim: '#9c7a26' },
  marshal: { cloth: ['#4c4640', '#3c3a38'], collar: '#9b2d20', trim: '#b9a88c' },
  chieftain: { cloth: ['#5d4632', '#6b543a'], collar: '#3b2f24', trim: '#9c7a26' },
  northRuler: { cloth: ['#2b2f3f', '#40352c'], collar: '#9b2d20', trim: '#d0a63f' },
};

export function Portrait({ spec, size = 44 }: { spec: PortraitSpec; size?: number }) {
  const rng = createRng(hashOf(spec.seed));
  const pick = <T,>(list: T[]): T => list[Math.floor(rng() * list.length)];

  const skin = pick(SKINS);
  // 顔の幅と顎の丸み。ここだけで顔立ちの大半が決まる
  const width = 10.6 + rng() * 2.2;
  const jaw = 0.5 + rng() * 0.35;
  const browTilt = -1.6 + rng() * 3.2;
  const eyeOpen = 1.5 + rng() * 1.1;
  const mouth = 3.4 + rng() * 2.2;

  const hair = spec.age >= 64 ? HAIR_WHITE : spec.age >= 50 ? HAIR_GREY : HAIR_BLACK;
  // 毛皮は民ごとに色が違う。十四の民を小さく並べても見分けがつくように
  const furIndex = Math.floor(rng() * FURS.length);
  const fur = FURS[furIndex];
  const furDark = FURS_DARK[furIndex];
  const robe = ROBES[spec.role];
  const cloth = pick(robe.cloth);

  /*
   * 髭。**年が決め、種は形だけを決める。**
   * 若い帝が長鬚を垂らしていたり、老いた帝が総髪だったりすると
   * 「代が替わった」ことが顔で読めなくなる
   */
  const beard: 'none' | 'moustache' | 'short' | 'long' =
    spec.female === true || spec.age < 22
      ? 'none'
      : spec.age < 32
        ? pick(['moustache', 'short'] as const)
        : spec.age < 50
          ? pick(['short', 'short', 'long'] as const)
          : 'long';

  const chin = 45 + jaw * 3;

  return (
    <svg
      viewBox="0 0 60 70"
      width={size}
      height={Math.round((size * 70) / 60)}
      role="img"
      aria-label={ROLE_LABELS[spec.role]}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* 絹地。役ごとにわずかに色を変え、並べたとき身分で色が分かれるようにする */}
      <rect x="0" y="0" width="60" height="70" fill={BACKDROPS[spec.role]} />
      <rect x="0" y="0" width="60" height="70" fill="none" stroke="#9c7a26" strokeWidth="1.2" />

      {/* 衣と襟。胡服は左衽（襟を逆に合わせる）にして漢服と描き分ける */}
      <path d={`M2,70 L10,56 Q30,50 50,56 L58,70 Z`} fill={cloth} />
      <path
        d={
          spec.hu === true
            ? `M30,52 L20,70 L27,70 L34,56 Z`
            : `M30,52 L40,70 L33,70 L26,56 Z`
        }
        fill={robe.collar}
      />
      <path d={`M30,52 L22,70 M30,52 L38,70`} stroke={robe.trim} strokeWidth="1" fill="none" />

      {spec.role === 'marshal' && <ScaleArmour />}
      {(spec.hu === true || spec.role === 'chieftain') && <FurCollar />}

      {/* 首 */}
      <path d={`M25,44 L25,56 Q30,58 35,56 L35,44 Z`} fill={skin} />
      <path d={`M25,48 Q30,52 35,48`} fill="rgba(0,0,0,0.12)" />

      {/* 顔の輪郭 */}
      <path
        d={
          `M${30 - width},28 ` +
          `C${30 - width},17 ${30 - width * 0.62},12.5 30,12.5 ` +
          `C${30 + width * 0.62},12.5 ${30 + width},17 ${30 + width},28 ` +
          `C${30 + width},${36 + jaw * 4} ${30 + width * 0.6},${chin} 30,${chin} ` +
          `C${30 - width * 0.6},${chin} ${30 - width},${36 + jaw * 4} ${30 - width},28 Z`
        }
        fill={skin}
        stroke="rgba(70,48,30,0.45)"
        strokeWidth="0.7"
      />
      <ellipse cx={30 - width} cy="29" rx="1.6" ry="2.6" fill={skin} />
      <ellipse cx={30 + width} cy="29" rx="1.6" ry="2.6" fill={skin} />

      {/* 髪。冠の下から覗く分だけを描く */}
      <Hair hair={hair} width={width} female={spec.female === true} hu={spec.hu === true} />

      {/* 眉・目・鼻・口。線は細くしすぎない（小さく置いても消えないように） */}
      <path
        d={`M${30 - 7.4},${24 + browTilt * 0.2} q3.4,${-1.4 - browTilt * 0.3} 6.4,0`}
        stroke={hair}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M${30 + 1},${24 - browTilt * 0.3} q3,${-1.4 + browTilt * 0.3} 6.4,${browTilt * 0.2}`}
        stroke={hair}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <Eye cx={30 - 5} open={eyeOpen} />
      <Eye cx={30 + 5} open={eyeOpen} />
      <path
        d={`M30,30 L${29.2},36 q0.8,0.9 1.8,0.2`}
        stroke="rgba(60,40,26,0.5)"
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M${30 - mouth / 2},40.5 q${mouth / 2},${spec.female === true ? 1.4 : 0.9} ${mouth},0`}
        stroke={spec.female === true ? '#9b2d20' : 'rgba(90,40,30,0.75)'}
        strokeWidth={spec.female === true ? 1.6 : 1.1}
        fill="none"
        strokeLinecap="round"
      />

      <Beard style={beard} hair={hair} width={width} chin={chin} hu={spec.hu === true} />

      {/* 冠。身分そのもの */}
      <Headwear role={spec.role} hu={spec.hu === true} fur={fur} furDark={furDark} />
    </svg>
  );
}

const ROLE_LABELS: Record<PortraitRole, string> = {
  emperor: '帝',
  empress: '皇后',
  prince: '藩王',
  chancellor: '録尚書事',
  inspector: '刺史',
  marshal: '都督',
  chieftain: '胡族の首長',
  northRuler: '北朝の主',
};

/** 背景の絹地。身分ごとに地の色を変える */
const BACKDROPS: Record<PortraitRole, string> = {
  emperor: '#2c3a4f',
  empress: '#4a2b3f',
  prince: '#54465e',
  chancellor: '#4a5648',
  inspector: '#575043',
  marshal: '#4d443c',
  chieftain: '#5b4a35',
  northRuler: '#3b3547',
};

function Eye({ cx, open }: { cx: number; open: number }) {
  return (
    <g>
      <path
        d={`M${cx - 3.4},29 q3.4,${-open} 6.8,0 q-3.4,${open} -6.8,0`}
        fill="#fbf6ea"
        stroke="rgba(40,30,20,0.8)"
        strokeWidth="0.8"
      />
      <circle cx={cx} cy="29" r={Math.min(1.5, open * 0.8)} fill="#241c15" />
    </g>
  );
}

/** 髪。冠に隠れない側頭部と、女性の垂髪を描く */
function Hair({
  hair,
  width,
  female,
  hu,
}: {
  hair: string;
  width: number;
  female: boolean;
  hu: boolean;
}) {
  return (
    <g fill={hair}>
      {/* 生え際 */}
      <path
        d={
          `M${30 - width},27 ` +
          `C${30 - width},16 ${30 - width * 0.6},11.5 30,11.5 ` +
          `C${30 + width * 0.6},11.5 ${30 + width},16 ${30 + width},27 ` +
          `L${30 + width - 1.4},27 ` +
          `C${30 + width - 1.6},20 ${30 + 4},18.6 30,18.8 ` +
          `C${30 - 4},18.6 ${30 - width + 1.6},20 ${30 - width + 1.4},27 Z`
        }
      />
      {female && (
        <>
          {/* 垂髪。肩まで落とす */}
          <path d={`M${30 - width},24 q-3,14 -1.5,26 l4,0 q-2.5,-12 -0.5,-24 Z`} />
          <path d={`M${30 + width},24 q3,14 1.5,26 l-4,0 q2.5,-12 0.5,-24 Z`} />
        </>
      )}
      {hu && !female && (
        <>
          {/* 弁髪。耳の後ろから細く垂らす */}
          <path d={`M${30 - width - 0.6},28 q-2.6,10 -1,20 l2.6,0 q-1.4,-10 0.4,-19 Z`} />
          <path d={`M${30 + width + 0.6},28 q2.6,10 1,20 l-2.6,0 q1.4,-10 -0.4,-19 Z`} />
        </>
      )}
    </g>
  );
}

function Beard({
  style,
  hair,
  width,
  chin,
  hu,
}: {
  style: 'none' | 'moustache' | 'short' | 'long';
  hair: string;
  width: number;
  chin: number;
  hu: boolean;
}) {
  if (style === 'none') return null;
  const moustache = (
    <path
      d={`M${30 - 4.4},39 q4.4,-2 8.8,0 q-4.4,1.4 -8.8,0`}
      fill={hair}
      opacity="0.92"
    />
  );
  if (style === 'moustache') return moustache;

  const reach = style === 'long' ? (hu ? 15 : 17) : 8;
  return (
    <g>
      {moustache}
      {/* 頬から顎へ。輪郭に沿わせ、先を細く絞る */}
      <path
        d={
          `M${30 - width * 0.86},${chin - 9} ` +
          `C${30 - width * 0.8},${chin - 1} ${30 - 3.6},${chin + reach} 30,${chin + reach} ` +
          `C${30 + 3.6},${chin + reach} ${30 + width * 0.8},${chin - 1} ${30 + width * 0.86},${chin - 9} ` +
          `C${30 + width * 0.5},${chin - 4} ${30 - width * 0.5},${chin - 4} ${30 - width * 0.86},${chin - 9} Z`
        }
        fill={hair}
        opacity="0.95"
      />
    </g>
  );
}

/** 甲。鎖の目を点で示すだけにする（小さく置くので粒は数個で足りる） */
function ScaleArmour() {
  const rows = [58, 62, 66];
  return (
    <g fill="rgba(231,220,198,0.28)">
      {rows.map((y, r) =>
        [10, 16, 22, 38, 44, 50].map((x) => (
          <circle key={`${y}-${x}`} cx={x + (r % 2) * 3} cy={y} r="1.5" />
        )),
      )}
    </g>
  );
}

/** 毛皮の襟。胡服の胸元 */
function FurCollar() {
  return (
    <g fill="#4a3a2a">
      {[8, 13, 18, 42, 47, 52].map((x) => (
        <circle key={x} cx={x} cy={57} r="4.2" />
      ))}
      <path d="M8,57 Q30,52 52,57 L52,62 Q30,58 8,62 Z" opacity="0.6" />
    </g>
  );
}

/**
 * 冠。**この画の主題である。**
 *
 * 顔立ちの違いより、冕冠か進賢冠かのほうがずっと強く身分を語る。
 * 小さく置いても冠だけは形が崩れないように、線を太めに取ってある
 */
function Headwear({
  role,
  hu,
  fur,
  furDark,
}: {
  role: PortraitRole;
  hu: boolean;
  fur: string;
  furDark: string;
}) {
  switch (role) {
    case 'emperor':
    case 'northRuler':
      return <Mianguan fur={role === 'northRuler' || hu} />;
    case 'empress':
      return <Fengguan />;
    case 'prince':
      return (
        <g>
          <path d="M17,14 Q30,4 43,14 L43,17 Q30,12 17,17 Z" fill="#2a2320" />
          <path d="M17,17 Q30,12 43,17 L43,19.5 Q30,14.5 17,19.5 Z" fill="#9c7a26" />
          <path d="M28,4.5 Q30,1 32,4.5 Q30,6.5 28,4.5 Z" fill="#d0a63f" />
        </g>
      );
    case 'chancellor':
    case 'inspector':
      return (
        <g>
          {/* 進賢冠。前が低く後ろが高い、文官の冠 */}
          <path d="M18,18 L18,12 L30,7 L42,12 L42,18 Q30,13 18,18 Z" fill="#26211c" />
          <path d="M24,10.5 L30,7 L36,10.5" stroke="#4a4239" strokeWidth="1" fill="none" />
          <path d="M18,18 Q30,13 42,18 L42,20 Q30,15 18,20 Z" fill="#5c5044" />
        </g>
      );
    case 'marshal':
      return (
        <g>
          {/* 兜。頂に朱の纓を立て、頬当てを垂らす */}
          <path d="M16,20 Q16,5 30,5 Q44,5 44,20 Q30,14 16,20 Z" fill="#48423b" />
          <path d="M16,20 Q30,14 44,20 L44,23 Q30,17 16,23 Z" fill="#9c7a26" />
          <path d="M29,6 L29,3 L31,3 L31,6 Z" fill="#6d1d15" />
          <path d="M26.5,3.4 Q30,-0.4 33.5,3.4 Q30,5.6 26.5,3.4 Z" fill="#9b2d20" />
          <path d="M16,21 L14,36 L19,36 L20,22 Z" fill="#48423b" />
          <path d="M44,21 L46,36 L41,36 L40,22 Z" fill="#48423b" />
        </g>
      );
    case 'chieftain':
      return (
        <g>
          {/* 貂の帽。毛皮の縁を粒で示し、後ろへ尾を垂らす */}
          <path d="M17,18 Q17,4 30,4 Q43,4 43,18 Q30,13 17,18 Z" fill={fur} />
          {[18, 23, 28, 33, 38, 42].map((x) => (
            <circle key={x} cx={x} cy={18} r="3" fill={furDark} />
          ))}
          <path d="M43,16 q6,3 5,12 l-4,-1 q1,-7 -3,-9 Z" fill={furDark} />
          <path d="M28,5 Q30,1.5 32,5 Q30,7 28,5 Z" fill="#9c7a26" />
        </g>
      );
  }
}

/**
 * 冕冠。**旒（垂れた玉）は天子の印である。**
 *
 * 板を前に傾け、五本の旒を顔にかける。史実では十二旒だが、
 * 小さく描くと潰れて縞に見えるので数を減らしてある
 */
function Mianguan({ fur }: { fur: boolean }) {
  const strings = [21, 25.5, 30, 34.5, 39];
  return (
    <g>
      <path d="M17,16 Q17,7 30,7 Q43,7 43,16 Q30,11 17,16 Z" fill={fur ? '#3a3129' : '#1d1a17'} />
      {fur &&
        [18, 24, 30, 36, 42].map((x) => <circle key={x} cx={x} cy={16} r="2.6" fill="#4a3a2a" />)}
      {/* 板（延）。前へ傾ける */}
      <path d="M10,11 L50,7 L50,11.5 L10,15.5 Z" fill="#1d1a17" />
      <path d="M10,11 L50,7" stroke="#d0a63f" strokeWidth="1.2" fill="none" />
      {/* 旒 */}
      {strings.map((x, i) => (
        <g key={x}>
          <path
            d={`M${x},${14 - i * 0.4} L${x},${24 - i * 0.4}`}
            stroke="#d0a63f"
            strokeWidth="0.7"
          />
          {[16, 19.5, 23].map((y, j) => (
            <circle
              key={y}
              cx={x}
              cy={y - i * 0.4}
              r="1.3"
              fill={j % 2 === 0 ? '#9b2d20' : '#e7dcc6'}
            />
          ))}
        </g>
      ))}
    </g>
  );
}

/**
 * 鳳冠（花釵冠）。
 *
 * 金の歩揺を挿し、両脇に真珠を垂らす。皇后の冠は帝の冕冠と対になるもので、
 * 大きさも同じだけ取る — **この画面で皇后を帝の隣に並べるための冠である**
 */
function Fengguan() {
  const buds = [
    [21, 8],
    [25, 5.5],
    [30, 4.2],
    [35, 5.5],
    [39, 8],
  ];
  return (
    <g>
      <path d="M17,17 Q17,8 30,8 Q43,8 43,17 Q30,12 17,17 Z" fill="#241c15" />
      <path d="M17,15 Q30,10 43,15 L43,18 Q30,13 17,18 Z" fill="#d0a63f" />
      {buds.map(([x, y]) => (
        <g key={x}>
          <path d={`M${x},14 L${x},${y}`} stroke="#d0a63f" strokeWidth="0.9" />
          <circle cx={x} cy={y} r="2.4" fill="#d0a63f" />
          <circle cx={x} cy={y} r="1" fill="#e7dcc6" />
        </g>
      ))}
      {/* 両脇の垂珠 */}
      {[17.5, 42.5].map((x) => (
        <g key={x}>
          {[19, 22.5, 26].map((y) => (
            <circle key={y} cx={x} cy={y} r="1.3" fill="#e7dcc6" stroke="#9c7a26" strokeWidth="0.4" />
          ))}
        </g>
      ))}
    </g>
  );
}
