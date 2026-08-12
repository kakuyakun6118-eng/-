import { useState } from 'react';

import { MEN_PER_STRENGTH } from '../../core/constants';
import { orderLabel, resolveTarget, wingLabel } from '../../core/battlefield';
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
          <p className="text-[12px] mt-0.5">
            <span style={{ color: 'var(--imperial)' }}>我 {men(ourTotal)}</span>
            <span style={{ color: 'var(--ink-soft)' }}> 対 </span>
            <span style={{ color: 'var(--cinnabar)' }}>敵 {men(foeTotal)}</span>
            <span style={{ color: 'var(--ink-soft)' }}>
              {' '}／ {field.leaderName} が率いる（第{field.round + 1}合）
            </span>
          </p>
        </header>

        {/* 布陣図 */}
        <div className="han-panel rounded-sm overflow-hidden">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
            <defs>
              <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a9a184" />
                <stop offset="55%" stopColor="#bdb391" />
                <stop offset="100%" stopColor="#cfc4a0" />
              </linearGradient>
            </defs>
            <rect width={W} height={H} fill="url(#ground)" />
            {field.terrain === 'river' && (
              <path
                d={`M0,${H / 2 - 6} Q${W / 2},${H / 2 - 22} ${W},${H / 2 - 6} L${W},${H / 2 + 8} Q${W / 2},${H / 2 - 8} 0,${H / 2 + 8} Z`}
                fill="#7f9aa6"
                opacity="0.65"
              />
            )}
            {field.terrain === 'hill' && (
              <path
                d={`M0,${H / 2 + 10} Q${W * 0.3},${H / 2 - 26} ${W * 0.6},${H / 2 + 4} Q${W * 0.85},${H / 2 - 12} ${W},${H / 2 + 12} L${W},${H} L0,${H} Z`}
                fill="#9c9878"
                opacity="0.45"
              />
            )}

            {/* 戦列の名 */}
            {WINGS.map((wing) => (
              <text
                key={`n-${wing}`}
                x={WING_X[wing]}
                y={H / 2 + 4}
                textAnchor="middle"
                fontSize="11"
                fill="rgba(36,31,26,0.5)"
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
                    x1={WING_X[wing]}
                    y1={OUR_Y - 34}
                    x2={WING_X[target]}
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
                  <Company key={unit.id} unit={unit} x={WING_X[wing]} y={FOE_Y + i * 26} side="foe" />
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
                    <Company unit={unit} x={WING_X[wing]} y={OUR_Y - i * 26} side="court" />
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
                  <rect
                    x={WING_X[wing] - 50}
                    y={H / 2 + 10}
                    width="100"
                    height={H / 2 - 24}
                    fill={picked === null ? 'rgba(46,63,87,0.05)' : 'rgba(208,166,63,0.18)'}
                    stroke={picked === null ? 'rgba(61,52,39,0.35)' : 'var(--gold)'}
                    strokeWidth={picked === null ? 0.8 : 1.6}
                    strokeDasharray="4 3"
                    onClick={() => place(wing)}
                    style={{ cursor: picked === null ? 'default' : 'pointer' }}
                  />
                  {picked !== null && (
                    <text
                      x={WING_X[wing]}
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
