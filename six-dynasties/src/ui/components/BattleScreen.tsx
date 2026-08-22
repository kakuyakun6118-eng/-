import { useState } from 'react';

import { MEN_PER_STRENGTH } from '../../core/constants';
import { orderLabel, resolveTarget, wingLabel } from '../../core/battlefield';
import { Portrait, seededAge } from './Portrait';
import type {
  ArmKind,
  BattleDeployment,
  BattleOrders,
  Battlefield,
  BattleUnit,
  GameState,
  WingId,
  WingOrder,
} from '../../core/types';
import { FACTION_LABELS, ORDER_LABELS } from '../catalogue';

const WINGS: WingId[] = ['left', 'center', 'right'];
const ORDERS: WingOrder[] = ['advance', 'flank', 'withdraw'];

const ARM_LABELS: Record<ArmKind, string> = { foot: '歩兵', horse: '騎兵', bow: '弓兵' };

const TERRAIN_LABELS: Record<Battlefield['terrain'], string> = {
  plain: '平野',
  river: '河を挟む',
  hill: '丘陵',
  forest: '林',
  desert: '荒野',
};

const TERRAIN_NOTES: Record<Battlefield['terrain'], string> = {
  plain: '遮るものがない。数がそのまま利く',
  river: '渡って攻める側が不利になる',
  hill: '高みを取れば迂回がよく効く',
  forest: '見通しが悪く、隊の並びが乱れる',
  desert: '水が乏しく、長く相持できない',
};

/** 図の寸法 */
const W = 340;
const H = 260;
const WING_X: Record<WingId, number> = { left: 62, center: 170, right: 278 };
const FOE_Y = 58;
const OUR_Y = 196;
/** 敵は図の上端＝遠くに立つので、兵ひとりを小さく描く */
const FOE_FIGURE_SCALE = 0.78;

/**
 * 地平線。**戦場は真上から見た図ではなく、こちらの陣から見た景色にする。**
 *
 * 真俯瞰の平面に隊を並べていたときは、遠い敵と近い味方が同じ地面の上に
 * 同じ大きさで載っていて、どちらが遠いのかは兵の大きさでしか分からなかった。
 * 上端に空と地平を置き、地面を手前へ広がる台形として描くと、
 * **図そのものが奥行きを持つ**
 */
const HORIZON = 34;
/** 消点。地面の筋も戦列の広がりもここへ収束する */
const VANISH_X = W / 2;

/**
 * 戦列の横位置。**遠い戦列ほど中央へ寄る。**
 * 敵と味方で同じ x に置いていたときは、地面だけが奥行きを持ち、
 * その上の隊は平面に貼り付いたままだった
 */
function wingXOf(wing: WingId, side: 'court' | 'foe'): number {
  const spread = side === 'foe' ? 0.66 : 1;
  return VANISH_X + (WING_X[wing] - VANISH_X) * spread;
}

/**
 * 地面。**空・地平・遠山・畝**の四層で奥行きを作る。
 *
 * 畝は手前ほど間隔を広く取る（等間隔に引くと、ただの横縞になって
 * 奥行きが消える）。縦の筋は消点へ収束させる
 */
function Ground({ terrain }: { terrain: Battlefield['terrain'] }) {
  const furrows = [];
  for (let i = 1; i <= 9; i++) {
    // 手前ほど間隔が広がるように、二乗で割り付ける
    const t = (i / 9) ** 1.9;
    const y = HORIZON + (H - HORIZON) * t;
    furrows.push(
      <line
        key={`f-${i}`}
        x1={VANISH_X - (VANISH_X + 60) * t}
        y1={y}
        x2={VANISH_X + (VANISH_X + 60) * t}
        y2={y}
        stroke="rgba(90, 76, 48, 0.13)"
        strokeWidth={0.4 + t * 0.9}
      />,
    );
  }
  const rays = [];
  for (let i = -4; i <= 4; i++) {
    rays.push(
      <line
        key={`r-${i}`}
        x1={VANISH_X + i * 9}
        y1={HORIZON}
        x2={VANISH_X + i * 74}
        y2={H}
        stroke="rgba(90, 76, 48, 0.08)"
        strokeWidth="0.7"
      />,
    );
  }

  return (
    <g pointerEvents="none">
      {/* 空 */}
      <rect width={W} height={HORIZON + 1} fill="url(#sky)" />
      {/* 遠山の影。地平の向こうに天下が続いていることを示す */}
      <path
        d={`M0,${HORIZON} L26,${HORIZON - 11} L52,${HORIZON - 4} L84,${HORIZON - 15}
            L120,${HORIZON - 6} L158,${HORIZON - 13} L196,${HORIZON - 5} L236,${HORIZON - 14}
            L280,${HORIZON - 6} L316,${HORIZON - 12} L${W},${HORIZON - 3} L${W},${HORIZON} Z`}
        fill="#8e9a92"
        opacity="0.55"
      />
      {/* 地面 */}
      <rect y={HORIZON} width={W} height={H - HORIZON} fill="url(#ground)" />
      {furrows}
      {rays}
      <TerrainFeature terrain={terrain} />
      {/* 地平の靄。遠くを白く飛ばすと距離が出る */}
      <rect y={HORIZON} width={W} height="46" fill="url(#haze)" />
    </g>
  );
}

/**
 * 地形の起伏。**光は左上から当てる。**
 *
 * 同じ形でも、明るい面と暗い面を描き分ければ膨らんで見える。
 * 平面の色違いで済ませていたときは、丘も河も「色の違う帯」でしかなかった
 */
function TerrainFeature({ terrain }: { terrain: Battlefield['terrain'] }) {
  if (terrain === 'river') {
    const top = H * 0.44;
    const bottom = H * 0.56;
    return (
      <g>
        {/* 岸。水際の土は濡れて暗い */}
        <path
          d={`M0,${top - 7} Q${W / 2},${top - 15} ${W},${top - 6} L${W},${bottom + 8} Q${W / 2},${bottom + 16} 0,${bottom + 7} Z`}
          fill="#8f8460"
          opacity="0.45"
        />
        <path
          d={`M0,${top} Q${W / 2},${top - 9} ${W},${top + 1} L${W},${bottom + 2} Q${W / 2},${bottom - 7} 0,${bottom} Z`}
          fill="url(#water)"
        />
        {/* 川面の照り返し */}
        <path
          d={`M14,${(top + bottom) / 2} Q${W * 0.35},${(top + bottom) / 2 - 6} ${W * 0.6},${(top + bottom) / 2 - 1}`}
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1.4"
        />
      </g>
    );
  }

  if (terrain === 'hill') {
    /*
     * 丘は**地面から盛り上がる形**で描く。
     *
     * 楕円を寝かせて置いていたときは、上から見た等高線のように平たく、
     * 「高み」には見えなかった。稜線を上へ膨らませ、左上を明るく、
     * 右下を暗くして、右下へ影を落とす
     */
    const hump = (
      cx: number,
      baseY: number,
      halfW: number,
      height: number,
      fill: string,
      key: string,
    ) => {
      const ridge =
        `M${cx - halfW},${baseY}` +
        ` Q${cx - halfW * 0.5},${baseY - height * 1.3} ${cx},${baseY - height}` +
        ` Q${cx + halfW * 0.55},${baseY - height * 0.72} ${cx + halfW},${baseY}`;
      return (
        <g key={key}>
          {/* 地面との接ぎ目に落ちる影 */}
          <ellipse cx={cx} cy={baseY} rx={halfW} ry={height * 0.16} fill="rgba(58, 46, 26, 0.12)" />
          <path d={`${ridge} Z`} fill={fill} />
          {/*
            陰影は**帯ではなく勾配**で乗せる。明るい半分と暗い半分を
            別々の面として塗っていたときは、稜線のところで縦の断面が立ち、
            丘が二枚の紙を貼り合わせたように見えた
          */}
          <path d={`${ridge} Z`} fill="url(#hillShade)" />
          <path d={ridge} fill="none" stroke="rgba(84, 70, 42, 0.32)" strokeWidth="0.8" />
        </g>
      );
    };

    return (
      <g>
        {/* 遠くの丘。靄に沈むので色を薄く取る */}
        {hump(78, HORIZON + 24, 60, 20, '#9aa08a', 'far-a')}
        {hump(232, HORIZON + 20, 48, 15, '#a2a68e', 'far-b')}
        {/* 手前の高み。ここを取れるかが会戦の勝ち負けを分ける */}
        {hump(150, H * 0.8, 118, 26, '#b0a884', 'near')}
      </g>
    );
  }

  if (terrain === 'forest') {
    // 奥ほど小さく密に。木立の影が地面に落ちる
    const trees = [];
    for (let row = 0; row < 5; row++) {
      const t = (row / 4) ** 1.7;
      const y = HORIZON + 14 + (H - HORIZON - 40) * t;
      const scale = 0.45 + t * 0.95;
      const count = 11 - row;
      for (let i = 0; i < count; i++) {
        const x = VANISH_X + ((i - (count - 1) / 2) / ((count - 1) / 2 || 1)) * (40 + t * 230);
        trees.push(
          <g key={`t-${row}-${i}`} transform={`translate(${x} ${y}) scale(${scale})`}>
            <ellipse cx="0" cy="1" rx="7" ry="2" fill="rgba(60,48,28,0.16)" />
            <path d="M0,-16 L6.5,0 L-6.5,0 Z" fill="#5f7150" />
            <path d="M0,-16 L0,0 L-6.5,0 Z" fill="rgba(30,40,26,0.28)" />
            <rect x="-0.9" y="0" width="1.8" height="3" fill="#5b4a33" />
          </g>,
        );
      }
    }
    return <g opacity="0.85">{trees}</g>;
  }

  if (terrain === 'desert') {
    // 砂丘。稜線の上は明るく、風下は暗い
    const dune = (y: number, amp: number, key: string) => (
      <g key={key}>
        <path
          d={`M0,${y} Q${W * 0.25},${y - amp} ${W * 0.5},${y} T${W},${y} L${W},${y + amp * 1.6} L0,${y + amp * 1.6} Z`}
          fill="rgba(60, 48, 28, 0.09)"
        />
        <path
          d={`M0,${y} Q${W * 0.25},${y - amp} ${W * 0.5},${y} T${W},${y}`}
          fill="none"
          stroke="rgba(255, 250, 226, 0.42)"
          strokeWidth="1.1"
        />
      </g>
    );
    return (
      <g>
        {dune(H * 0.46, 9, 'a')}
        {dune(H * 0.66, 13, 'b')}
        {dune(H * 0.88, 17, 'c')}
      </g>
    );
  }

  /*
   * 平野。**遮るものがないことがこの地形の性質**なので、地面には何も立てない。
   *
   * 草叢を扇形の線で撒いていたときは、草ではなく下向きの矢印が等間隔に並んで
   * 壁紙のように見えた。奥行きは地面の畝と消点へ収束する筋がすでに担っているので、
   * ここでは**手前にだけ低い灌木を疎らに置く** — 遠くはただ開けている
   */
  const scrub = [];
  for (let i = 0; i < 11; i++) {
    // 種を固定した擬似乱数。並びの規則性が読み取れないようにばらす
    const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    const t = 0.45 + r(1) * 0.55;
    const y = HORIZON + (H - HORIZON) * t;
    const x = 14 + r(2) * (W - 28);
    const k = 0.5 + t * 1.4;
    scrub.push(
      <g key={`s-${i}`} transform={`translate(${x} ${y}) scale(${k})`}>
        <ellipse cx="0" cy="0.6" rx="4.6" ry="1.3" fill="rgba(60, 48, 28, 0.13)" />
        <path
          d="M-4,0 Q-2.6,-3.4 -0.4,-1.2 Q0.6,-4.2 2.2,-1.4 Q3.4,-2.6 4,0 Z"
          fill="#7d8a5c"
          opacity="0.7"
        />
        <path d="M-4,0 Q-2.6,-3.4 -0.4,-1.2 L-0.4,0 Z" fill="rgba(255,250,226,0.22)" />
      </g>,
    );
  }
  return <g>{scrub}</g>;
}

/** 兵ひとり。兵科ごとの姿で描く */
function Figure({ arm, scale, tone }: { arm: ArmKind; scale: number; tone: string }) {
  if (arm === 'horse') {
    return (
      <g transform={`scale(${scale})`}>
        <ellipse cx="0" cy="4.6" rx="4" ry="1.1" fill="rgba(0,0,0,0.22)" />
        <path d="M-4,2 L-4,-1 L-1,-2 L3,-2 L4,0 L4,3" fill={tone} />
        <path d="M3,-2 L5,-4 L6,-2 L4,-1 Z" fill={tone} />
        <path d="M-3,3 L-3,5 M-1,3 L-1,5 M2,3 L2,5 M3.5,3 L3.5,5" stroke={tone} strokeWidth="0.7" />
        <circle cx="0" cy="-4" r="1.5" fill={tone} />
        <line x1="1" y1="-6" x2="4" y2="-9" stroke={tone} strokeWidth="0.7" />
      </g>
    );
  }
  if (arm === 'bow') {
    return (
      <g transform={`scale(${scale})`}>
        <ellipse cx="0" cy="4.6" rx="2.4" ry="0.9" fill="rgba(0,0,0,0.22)" />
        <circle cx="0" cy="-3.4" r="1.4" fill={tone} />
        <path d="M0,-2 L0,3.5" stroke={tone} strokeWidth="1.4" />
        <path d="M2.4,-4 Q4.2,-1 2.4,2" fill="none" stroke={tone} strokeWidth="0.7" />
        <line x1="2.4" y1="-4" x2="2.4" y2="2" stroke={tone} strokeWidth="0.4" />
      </g>
    );
  }
  return (
    <g transform={`scale(${scale})`}>
      <ellipse cx="0" cy="4.6" rx="2.4" ry="0.9" fill="rgba(0,0,0,0.22)" />
      <circle cx="0" cy="-3.6" r="1.4" fill={tone} />
      <rect x="-1.9" y="-2" width="3.8" height="5" rx="0.6" fill={tone} />
      <line x1="2.6" y1="-6" x2="2.6" y2="3" stroke={tone} strokeWidth="0.7" />
    </g>
  );
}

/**
 * 隊。**列の幅が兵力**、色が陣営を表す。
 * 数万の兵を1人ずつは描けないので、頭数で兵力を読ませる
 */
function Company({
  unit,
  x,
  y,
  side,
}: {
  unit: BattleUnit;
  x: number;
  y: number;
  side: 'court' | 'foe';
}) {
  const tone = side === 'court' ? '#2e3f57' : '#7d2a1d';
  const scale = side === 'foe' ? FOE_FIGURE_SCALE : 1;
  /*
   * 頭数で兵力を読ませる。
   *
   * 兵力をそのまま割って頭数にしていたときは、小さな隊が縦一列に
   * 潰れて兵に見えなかった（兵力8の隊が1列3人になった）。
   * 平方根で取ると、弱い隊でも列の形が残り、強い隊も画面に収まる
   */
  const count = Math.max(4, Math.min(20, Math.round(2 * Math.sqrt(unit.strength))));
  // 少ない隊は2列、多い隊は3列に組む。弓兵だけは散兵線なので常に2列
  const rows = unit.arm === 'bow' ? 2 : count >= 9 ? 3 : 2;
  const perRow = Math.ceil(count / rows);
  const gap = 6 * scale;

  const figures = [];
  for (let i = 0; i < count; i++) {
    const rowIndex = Math.floor(i / perRow);
    const colIndex = i % perRow;
    const offsetX = (colIndex - (perRow - 1) / 2) * gap + (rowIndex % 2) * (gap / 2);
    const offsetY = rowIndex * 5 * scale;
    figures.push(
      <g key={i} transform={`translate(${offsetX} ${offsetY})`}>
        <Figure arm={unit.arm} scale={scale} tone={tone} />
      </g>,
    );
  }

  return (
    <g transform={`translate(${x} ${y})`} opacity={unit.strength <= 0 ? 0.25 : 1}>
      {/* 踏み荒らした地面 */}
      <ellipse
        cx="0"
        cy={rows * 2.6 * scale}
        rx={(perRow * gap) / 2 + 5}
        ry={7 * scale}
        fill="rgba(90, 72, 44, 0.16)"
      />
      {figures}
      {/* 士気の帯 */}
      <rect
        x={-(perRow * gap) / 4}
        y={rows * 5 * scale + 2}
        width={(perRow * gap) / 2}
        height="2"
        fill="rgba(0,0,0,0.14)"
      />
      <rect
        x={-(perRow * gap) / 4}
        y={rows * 5 * scale + 2}
        width={((perRow * gap) / 2) * Math.max(0, unit.morale / 100)}
        height="2"
        fill={side === 'court' ? 'var(--jade)' : 'var(--cinnabar)'}
      />
    </g>
  );
}

export function BattleScreen({
  state,
  field,
  onDeploy,
  onFight,
  onFinish,
}: {
  state: GameState;
  field: Battlefield;
  onDeploy: (deployment: BattleDeployment) => void;
  onFight: (orders: BattleOrders) => void;
  onFinish: () => void;
}) {
  const [orders, setOrders] = useState<BattleOrders>({
    left: 'advance',
    center: 'advance',
    right: 'advance',
  });
  const [picked, setPicked] = useState<string | null>(null);

  const foe = field.foe;
  const foeName =
    foe.kind === 'faction'
      ? FACTION_LABELS[foe.factionId]
      : foe.kind === 'north'
        ? (state.north?.name ?? '北朝')
        : (state.princes.find((p) => p.id === foe.princeId)?.name ?? '挙兵した王');

  const reserve = field.units.filter((u) => u.side === 'court' && u.wing === null);
  const ourTotal = field.units
    .filter((u) => u.side === 'court')
    .reduce((s, u) => s + u.strength, 0);
  const foeTotal = field.units.filter((u) => u.side === 'foe').reduce((s, u) => s + u.strength, 0);

  const place = (wing: WingId | null) => {
    if (picked === null) return;
    onDeploy({ placements: { [picked]: wing } });
    setPicked(null);
  };

  const men = (strength: number) =>
    `${Math.round((strength * MEN_PER_STRENGTH) / 1000).toLocaleString()}千`;

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="han-fret" />
      <main className="flex-1 max-w-lg mx-auto w-full px-3 py-3 space-y-2.5">
        <header className="text-center">
          <h1 className="han-title text-lg">
            {state.year}年 — {foeName}との会戦
          </h1>
          <p className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>
            {TERRAIN_LABELS[field.terrain]}／{TERRAIN_NOTES[field.terrain]}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {/* 率いる者の顔。帝が自ら出れば冕冠、都督なら兜で分かる */}
            <Portrait
              spec={{
                seed: field.leaderName,
                role: field.leader === 'sovereign' ? 'emperor' : 'marshal',
                age: seededAge(field.leaderName, 28, 62),
              }}
              size={40}
            />
            <p className="text-[12px]">
              <span style={{ color: 'var(--imperial)' }}>我 {men(ourTotal)}</span>
              <span style={{ color: 'var(--ink-soft)' }}> 対 </span>
              <span style={{ color: 'var(--cinnabar)' }}>敵 {men(foeTotal)}</span>
              <span style={{ color: 'var(--ink-soft)' }}>
                {' '}／ {field.leaderName} が率いる（第{field.round + 1}合）
              </span>
            </p>
          </div>
        </header>

        {/* 布陣図 */}
        <div className="han-panel rounded-sm overflow-hidden">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
            <defs>
              {/* 地面は手前ほど暖かく明るい。遠くは霞んで青みに寄る */}
              <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a8a68c" />
                <stop offset="30%" stopColor="#b6ab88" />
                <stop offset="100%" stopColor="#d3c7a1" />
              </linearGradient>
              <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b6c3c8" />
                <stop offset="100%" stopColor="#dfd8c4" />
              </linearGradient>
              <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e6ddc8" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#e6ddc8" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="hillShade" x1="0" y1="0" x2="1" y2="0.75">
                <stop offset="0%" stopColor="#fffae2" stopOpacity="0.5" />
                <stop offset="45%" stopColor="#fffae2" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#3a2e1a" stopOpacity="0.3" />
              </linearGradient>
              <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6f8d9c" />
                <stop offset="55%" stopColor="#87a4b0" />
                <stop offset="100%" stopColor="#6a8794" />
              </linearGradient>
            </defs>

            <Ground terrain={field.terrain} />

            {/* 戦列の名。地平と我が陣の中ほどに置く */}
            {WINGS.map((wing) => (
              <text
                key={`n-${wing}`}
                x={(wingXOf(wing, 'foe') + wingXOf(wing, 'court')) / 2}
                y={H / 2 + 4}
                textAnchor="middle"
                fontSize="11"
                fill="rgba(36,31,26,0.6)"
                stroke="#efe6d0"
                strokeWidth="3"
                paintOrder="stroke"
              >
                {wingLabel(wing)}
              </text>
            ))}

            {/* 命令の矢。交える前に、どの戦列がどこへ向かうかを図の上で読ませる */}
            {field.phase === 'orders' &&
              WINGS.map((wing) => {
                const target = resolveTarget(field, wing, orders[wing]);
                if (target === null) return null;
                const flanking = orders[wing] === 'flank';
                return (
                  <line
                    key={`a-${wing}`}
                    x1={wingXOf(wing, 'court')}
                    y1={OUR_Y - 34}
                    x2={wingXOf(target, 'foe')}
                    y2={FOE_Y + 44}
                    stroke="var(--gold)"
                    strokeWidth="1.1"
                    strokeDasharray={flanking ? '4 3' : undefined}
                    markerEnd="url(#head)"
                    opacity="0.7"
                  />
                );
              })}
            <defs>
              <marker id="head" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--gold)" />
              </marker>
            </defs>

            {/* 敵は上端から下へ、我が軍は下端から上へ積む */}
            {WINGS.map((wing) =>
              field.units
                .filter((u) => u.side === 'foe' && u.wing === wing)
                .map((unit, i) => (
                  <Company
                    key={unit.id}
                    unit={unit}
                    x={wingXOf(wing, 'foe')}
                    y={FOE_Y + i * 20}
                    side="foe"
                  />
                )),
            )}
            {WINGS.map((wing) =>
              field.units
                .filter((u) => u.side === 'court' && u.wing === wing)
                .map((unit, i) => (
                  <g
                    key={unit.id}
                    onClick={
                      field.phase === 'deploy'
                        ? () => onDeploy({ placements: { [unit.id]: null } })
                        : undefined
                    }
                    style={{ cursor: field.phase === 'deploy' ? 'pointer' : 'default' }}
                  >
                    <Company unit={unit} x={wingXOf(wing, 'court')} y={OUR_Y - i * 26} side="court" />
                  </g>
                )),
            )}

            {/* 本陣。率いる者の位置 */}
            <g transform={`translate(${W / 2} ${H - 14})`}>
              <line x1="0" y1="0" x2="0" y2="-14" stroke="#3d3427" strokeWidth="1.4" />
              <path
                className="banner-wave"
                d="M0,-14 L16,-11 L16,-4 L0,-7 Z"
                fill="var(--imperial)"
                stroke="var(--gold)"
                strokeWidth="0.7"
              />
              <text x="22" y="-4" fontSize="10" fill="var(--ink)">
                本陣 — {field.leaderName}
              </text>
            </g>

            {/* 触れて置くための当たり */}
            {/*
              置き場は常に見せる。隊を選ぶまで枠が現れない作りだと、
              どこへ置けるのかが画面から分からなかった
            */}
            {field.phase === 'deploy' &&
              WINGS.map((wing) => (
                <g key={`hit-${wing}`}>
                  {/*
                    置き場も奥へすぼめる。長方形で置いていたときは、
                    地面だけが遠近を持ち、枠がその上に貼り付いた板に見えた
                  */}
                  <path
                    d={(() => {
                      const cx = wingXOf(wing, 'court');
                      const top = H / 2 + 10;
                      const bottom = H - 14;
                      return `M${cx - 40},${top} L${cx + 40},${top} L${cx + 56},${bottom} L${cx - 56},${bottom} Z`;
                    })()}
                    fill={picked === null ? 'rgba(46,63,87,0.05)' : 'rgba(208,166,63,0.18)'}
                    stroke={picked === null ? 'rgba(61,52,39,0.35)' : 'var(--gold)'}
                    strokeWidth={picked === null ? 0.8 : 1.6}
                    strokeDasharray="4 3"
                    onClick={() => place(wing)}
                    style={{ cursor: picked === null ? 'default' : 'pointer' }}
                  />
                  {picked !== null && (
                    <text
                      x={wingXOf(wing, 'court')}
                      y={H - 30}
                      textAnchor="middle"
                      fontSize="10"
                      fill="var(--ink-soft)"
                      pointerEvents="none"
                    >
                      ここへ置く
                    </text>
                  )}
                </g>
              ))}
          </svg>
        </div>

        {field.phase === 'deploy' && (
          <section className="han-panel rounded-sm px-3 py-2">
            <h2 className="han-heading text-sm">布陣</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-soft)' }}>
              控えの隊を選び、図の戦列に触れて置く。置いた隊に触れると控えへ戻る。
              騎は歩に、歩は弓に、弓は騎に強い
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {reserve.map((unit) => (
                <button
                  key={unit.id}
                  onClick={() => setPicked(picked === unit.id ? null : unit.id)}
                  className="text-[11px] px-2 py-1 rounded-[2px]"
                  style={{
                    backgroundColor: picked === unit.id ? 'var(--imperial)' : 'rgba(0,0,0,0.05)',
                    color: picked === unit.id ? 'var(--silk)' : 'var(--ink)',
                    border: '1px solid var(--bamboo)',
                  }}
                >
                  {ARM_LABELS[unit.arm]} {men(unit.strength)}
                </button>
              ))}
              {reserve.length === 0 && (
                <span className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                  控えの隊はもういない
                </span>
              )}
            </div>
            {field.units.some((u) => u.side === 'court' && u.wing !== null) && (
              <button
                onClick={() => onFight(orders)}
                className="han-button w-full rounded-sm py-2.5 mt-2"
              >
                この布陣で戦う
              </button>
            )}
          </section>
        )}

        {field.phase === 'orders' && (
          <section className="han-panel rounded-sm px-3 py-2">
            <h2 className="han-heading text-sm">命令</h2>
            <div className="mt-1.5 space-y-1.5">
              {WINGS.map((wing) => (
                <div key={wing} className="flex items-center gap-1.5">
                  <span className="text-[12px] w-10 shrink-0">{wingLabel(wing)}</span>
                  {ORDERS.map((order) => (
                    <button
                      key={order}
                      onClick={() => setOrders((o) => ({ ...o, [wing]: order }))}
                      className="flex-1 text-[11px] py-1 rounded-[2px]"
                      style={{
                        backgroundColor:
                          orders[wing] === order ? 'var(--imperial)' : 'rgba(0,0,0,0.05)',
                        color: orders[wing] === order ? 'var(--silk)' : 'var(--ink-soft)',
                        border: '1px solid var(--bamboo)',
                      }}
                    >
                      {ORDER_LABELS[order]}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <button
              onClick={() => onFight(orders)}
              className="han-button w-full rounded-sm py-2.5 mt-2"
            >
              第{field.round + 1}合を交える
            </button>
          </section>
        )}

        {field.phase === 'done' && (
          <button onClick={onFinish} className="han-button w-full rounded-sm py-3.5">
            戦を畳み、{state.year + 1}年へ
          </button>
        )}

        {field.log.length > 0 && (
          <section className="han-panel rounded-sm px-3 py-2">
            <h2 className="han-heading text-sm">戦況</h2>
            <ul className="mt-1 space-y-0.5">
              {field.log
                .slice()
                .reverse()
                .map((entry, i) => (
                  <li
                    key={i}
                    className="text-[11px] pl-2"
                    style={{ color: 'var(--ink-soft)', borderLeft: '2px solid var(--gold)' }}
                  >
                    {entry}
                  </li>
                ))}
            </ul>
          </section>
        )}
      </main>
      <div className="han-fret" />
    </div>
  );
}

export { orderLabel };
