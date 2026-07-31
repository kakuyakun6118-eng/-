import type { MarriageOrigin, Ruler, Spouse } from '../../core/types';

/**
 * 君主と皇后の肖像。画像素材を持たず、SVG を組み立てて描く。
 * 見た目は id から決定的に決まるので、同じ人物なら常に同じ顔になり、
 * 代替わりすれば顔が変わる
 */

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** id から決まる擬似乱数。描画のためだけに使う */
function picker(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const pick = <T,>(rng: () => number, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)];

const SKIN = ['#e6b892', '#d9a273', '#c68a5c', '#b0754a'] as const;
const HAIR = ['#241a12', '#3d2a18', '#5a3d22', '#7a5a30'] as const;
const GREY = '#c9c3b6';

interface Look {
  skin: string;
  hair: string;
  /** 白髪まじりか */
  aged: boolean;
  /** 髭を蓄えているか */
  beard: boolean;
  browTilt: number;
}

function lookOf(id: string, age: number, allowBeard: boolean): Look {
  const rng = picker(hashString(id));
  const aged = age >= 50;
  return {
    skin: pick(rng, SKIN),
    hair: aged ? GREY : pick(rng, HAIR),
    aged,
    beard: allowBeard && rng() < 0.55,
    browTilt: rng() < 0.5 ? -1 : 1,
  };
}

/** 顔の共通部分。冠や髪型は呼び出し側が重ねる */
function Face({ look }: { look: Look }) {
  return (
    <g>
      {/* 首 */}
      <path d="M42,62 L58,62 L58,82 L42,82 Z" fill={look.skin} />
      <path d="M42,72 Q50,80 58,72 L58,82 L42,82 Z" fill="#00000022" />
      {/* 顔 */}
      <ellipse cx={50} cy={46} rx={20} ry={24} fill={look.skin} />
      {/* 耳 */}
      <ellipse cx={29.5} cy={48} rx={4} ry={6} fill={look.skin} />
      <ellipse cx={70.5} cy={48} rx={4} ry={6} fill={look.skin} />
      {/* 眉 */}
      <path
        d={`M38,${39 + look.browTilt} Q43,36 47,${39 - look.browTilt}`}
        stroke={look.hair}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M53,${39 - look.browTilt} Q57,36 62,${39 + look.browTilt}`}
        stroke={look.hair}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
      />
      {/* 目 */}
      <ellipse cx={42.5} cy={45} rx={3.6} ry={2.4} fill="#fdfdfd" />
      <ellipse cx={57.5} cy={45} rx={3.6} ry={2.4} fill="#fdfdfd" />
      <circle cx={42.8} cy={45} r={1.7} fill="#2a2118" />
      <circle cx={57.8} cy={45} r={1.7} fill="#2a2118" />
      {/* 鼻 */}
      <path d="M50,46 L47.5,54 Q50,55.5 52.5,54" stroke="#00000033" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {/* 口 */}
      <path d="M45,60 Q50,63 55,60" stroke="#8d4f42" strokeWidth={2} fill="none" strokeLinecap="round" />
      {/* 加齢の陰影 */}
      {look.aged && (
        <g stroke="#00000022" strokeWidth={1.2} fill="none" strokeLinecap="round">
          <path d="M34,52 Q36,55 34,58" />
          <path d="M66,52 Q64,55 66,58" />
        </g>
      )}
    </g>
  );
}

function Frame({ tint }: { tint: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`niche-${tint.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tint} />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      <path
        d="M2,118 L2,50 A48,44 0 0 1 98,50 L98,118 Z"
        fill={`url(#niche-${tint.slice(1)})`}
        stroke="#64748b"
        strokeWidth={2}
      />
    </>
  );
}

/** 皇帝。月桂冠を戴き、紫の縁取りのトガをまとう */
export function EmperorPortrait({
  ruler,
  year,
  className,
}: {
  ruler: Ruler;
  year: number;
  className?: string;
}) {
  const look = lookOf(ruler.id, year - ruler.birthYear, true);

  return (
    <svg viewBox="0 0 100 120" className={className} role="img" aria-label="皇帝の肖像">
      <Frame tint="#3b3054" />

      {/* トガ */}
      <path d="M10,118 Q16,86 38,78 L62,78 Q84,86 90,118 Z" fill="#f1f5f9" />
      <path d="M38,78 L50,100 L62,78 Q74,82 80,96 L62,118 L38,118 Z" fill="#7f1d3f" />
      <path d="M38,78 L50,100 L62,78" stroke="#facc15" strokeWidth={2.4} fill="none" />

      {/* 髪 */}
      <path
        d="M28,44 Q30,20 50,20 Q70,20 72,44 Q68,34 50,32 Q34,32 28,44 Z"
        fill={look.hair}
      />
      <Face look={look} />
      {look.beard && (
        <path
          d="M33,50 Q34,70 50,72 Q66,70 67,50 Q62,62 50,63 Q38,62 33,50 Z"
          fill={look.hair}
          opacity={0.95}
        />
      )}

      {/* 月桂冠 */}
      <g stroke="#facc15" strokeWidth={2.6} fill="none" strokeLinecap="round">
        <path d="M28,38 Q50,24 72,38" />
      </g>
      <g fill="#fde047">
        {[
          [31, 39],
          [37, 34],
          [44, 30.5],
          [56, 30.5],
          [63, 34],
          [69, 39],
        ].map(([x, y]) => (
          <ellipse
            key={x}
            cx={x}
            cy={y}
            rx={3.6}
            ry={2}
            transform={`rotate(${x < 50 ? -40 : 40} ${x} ${y})`}
          />
        ))}
      </g>
      <circle cx={50} cy={26} r={3.2} fill="#fde047" stroke="#a16207" strokeWidth={0.8} />
    </svg>
  );
}

/**
 * 皇后。出自によって装いが変わる。
 * 東ローマ帝室なら真珠の宝冠、蛮族の族長家なら編み込みと肩留め
 */
export function ConsortPortrait({
  spouse,
  className,
}: {
  spouse: Spouse;
  className?: string;
}) {
  const look = lookOf(spouse.id, 30, false);
  const east = spouse.origin.kind === 'east';

  return (
    <svg viewBox="0 0 100 120" className={className} role="img" aria-label="皇后の肖像">
      <Frame tint={east ? '#1e3a5f' : '#4a3520'} />

      {/* ストラ */}
      <path d="M10,118 Q16,88 38,80 L62,80 Q84,88 90,118 Z" fill={east ? '#c7d2fe' : '#d6c3a5'} />
      <path
        d="M38,80 Q50,96 62,80 Q74,86 78,102 L62,118 L38,118 Z"
        fill={east ? '#4338ca' : '#7c4a2a'}
      />

      {/*
        後ろ髪。顔の外側に広がる形にして、顎の下は塗らない。
        中央を塗ると髭のように見えてしまうため
      */}
      <ellipse cx={50} cy={46} rx={26} ry={29} fill={look.hair} />
      <path d="M24,50 Q20,78 27,94 L37,94 Q31,74 31,52 Z" fill={look.hair} />
      <path d="M76,50 Q80,78 73,94 L63,94 Q69,74 69,52 Z" fill={look.hair} />
      <Face look={look} />

      {/* 結い上げた髪 */}
      <path d="M27,46 Q28,18 50,18 Q72,18 73,46 Q68,30 50,28 Q32,30 27,46 Z" fill={look.hair} />
      {east ? (
        <>
          {/* 束ねた髷 */}
          <ellipse cx={50} cy={17} rx={13} ry={8} fill={look.hair} />
          {/* 真珠の宝冠 */}
          <path d="M28,34 Q50,22 72,34" stroke="#fde68a" strokeWidth={3} fill="none" />
          <g fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.6}>
            {[31, 38, 45, 52, 59, 66, 69].map((x, i) => (
              <circle key={x} cx={x} cy={i === 3 ? 25 : 30 - Math.abs(3 - i) * 0.6} r={2.4} />
            ))}
          </g>
          {/* 垂れ飾り */}
          <g fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.5}>
            <circle cx={27} cy={44} r={2} />
            <circle cx={27} cy={51} r={2} />
            <circle cx={73} cy={44} r={2} />
            <circle cx={73} cy={51} r={2} />
          </g>
        </>
      ) : (
        <>
          {/* 編み込み */}
          <g fill={look.hair} stroke="#00000033" strokeWidth={0.8}>
            {[0, 1, 2, 3].map((i) => (
              <ellipse key={i} cx={24} cy={54 + i * 9} rx={5} ry={5.4} />
            ))}
            {[0, 1, 2, 3].map((i) => (
              <ellipse key={`r${i}`} cx={76} cy={54 + i * 9} rx={5} ry={5.4} />
            ))}
          </g>
          {/* 金の環 */}
          <path d="M29,33 Q50,24 71,33" stroke="#eab308" strokeWidth={3.2} fill="none" />
          {/* 肩留め */}
          <circle cx={35} cy={92} r={4.2} fill="#eab308" stroke="#78350f" strokeWidth={1} />
        </>
      )}
    </svg>
  );
}

/** 婚姻相手の呼び名 */
export function consortOriginLabel(origin: MarriageOrigin, factionLabel: string): string {
  return origin.kind === 'east' ? '東ローマ帝室' : `${factionLabel}の族長家`;
}
