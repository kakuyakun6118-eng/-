import { BATTLE_LANES, resolveTarget } from '../../core/battlefield';
import type { BattleOrders } from '../../core/battlefield';
import type { BattleArm, BattleLane, BattleUnit, Battlefield, Terrain } from '../../core/types';
import { BATTLE_LANE_LABELS } from '../catalogue';

/**
 * 戦場の地図。
 *
 * 関ヶ原の布陣図と同じ読み方をさせる。地形の上に両軍の隊を**駒**で置き、
 * 駒の幅が兵力、色が陣営、下の帯が士気を表す。命令は駒から伸びる矢で描く。
 *
 * **計算式はここに書かない。** 描くのは `Battlefield` が既に持っている値だけ
 */

const W = 320;
const H = 246;

/** 戦列の左端と幅。左翼・中央・右翼を等分に置く */
const LANE_X: Record<BattleLane, number> = { left: 12, center: 114, right: 216 };
const LANE_W = 92;

const UNIT_H = 15;
const UNIT_GAP = 3;

/**
 * 陣の帯の高さ。3つの兵科がすべて同じ戦列に集まることがあるので、
 * 3隊ぶんが必ず収まる高さを取る（38 にしていたときは3隊目が帯から溢れた）
 */
const BAND_H = 4 + 3 * (UNIT_H + UNIT_GAP) + 2;

/** 敵の陣と我が陣の帯。あいだが戦場になる */
const FOE_Y = 18;
const OUR_Y = H - BAND_H - 16;

const ARM_MARK: Record<BattleArm, string> = {
  infantry: '≡',
  cavalry: '△',
  archers: '↟',
};

function laneStrength(units: BattleUnit[]): number {
  return units.reduce((sum, u) => sum + u.strength, 0);
}

function laneCenter(lane: BattleLane): number {
  return LANE_X[lane] + LANE_W / 2;
}

// ── 地形 ──────────────────────────────────────────────

const TERRAIN_GROUND: Record<Terrain, string> = {
  plain: '#c8c49a',
  hill: '#c2b48c',
  forest: '#a8b294',
  desert: '#ded0a4',
  river: '#c4c6a8',
};

/**
 * 地形の起伏。戦場の帯（両軍のあいだ）に描く。
 * 画像は持たず、線と面だけで描く（地図と同じ方針）
 */
function TerrainFeatures({ terrain }: { terrain: Terrain }) {
  const midY = (FOE_Y + BAND_H + OUR_Y) / 2;
  switch (terrain) {
    case 'hill':
      return (
        <g fill="none" stroke="#8d7a4e" strokeWidth={1} opacity={0.55}>
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M ${30 + i * 95} ${midY + 16} q ${22} ${-26 - i * 3} ${44} 0`}
            />
          ))}
          {[0, 1, 2].map((i) => (
            <path key={`b${i}`} d={`M ${42 + i * 95} ${midY + 16} q ${10} ${-13} ${20} 0`} />
          ))}
        </g>
      );
    case 'forest':
      return (
        <g fill="#5f7150" opacity={0.6}>
          {Array.from({ length: 14 }, (_, i) => {
            const x = 20 + (i % 7) * 42 + (i > 6 ? 20 : 0);
            const y = midY - 10 + (i > 6 ? 20 : 0);
            return <path key={i} d={`M ${x} ${y + 12} l 6 -14 l 6 14 z`} />;
          })}
        </g>
      );
    case 'desert':
      return (
        <g>
          {/* 砂丘。稜線と、その陰になる斜面をひと組で描く */}
          {[0, 1, 2, 3].map((i) => {
            const y = midY + 2 + (i % 2) * 14;
            const x = 4 + i * 78;
            return (
              <g key={i}>
                <path d={`M ${x} ${y} q ${38} ${-13} ${76} 0 l 0 7 q ${-38} ${-11} ${-76} 0 z`} fill="#c9ab68" opacity={0.5} />
                <path d={`M ${x} ${y} q ${38} ${-13} ${76} 0`} fill="none" stroke="#a98846" strokeWidth={1.1} opacity={0.8} />
              </g>
            );
          })}
        </g>
      );
    case 'river':
      // 渡河点。両軍のあいだを川が横切る
      return (
        <g>
          <path
            d={`M -4 ${midY - 6} q 60 12 110 0 q 60 -14 120 2 q 50 12 100 -2 l 0 16 q -50 14 -100 2 q -60 -16 -120 -2 q -50 12 -110 0 z`}
            fill="#7d9db0"
            opacity={0.75}
          />
          <path
            d={`M -4 ${midY - 6} q 60 12 110 0 q 60 -14 120 2 q 50 12 100 -2`}
            fill="none"
            stroke="#5d7d92"
            strokeWidth={0.8}
          />
        </g>
      );
    case 'plain':
      return (
        <g stroke="#8d9455" strokeWidth={1.2} opacity={0.75} strokeLinecap="round">
          {Array.from({ length: 24 }, (_, i) => {
            const x = 12 + (i % 8) * 40 + (Math.floor(i / 8) % 2) * 18;
            const y = midY - 12 + Math.floor(i / 8) * 15;
            return (
              <path key={i} d={`M ${x} ${y + 7} l -2 -6 M ${x + 3} ${y + 7} l 0 -7 M ${x + 6} ${y + 7} l 2 -6`} />
            );
          })}
        </g>
      );
  }
}

// ── 駒 ────────────────────────────────────────────────

/**
 * 隊の駒。**幅が兵力**、下の帯が士気。
 * 関ヶ原の布陣図の兵数札と同じで、大きさを見れば厚みが分かる
 */
function UnitPiece({
  unit,
  x,
  y,
  scale,
  foe,
  dimmed,
}: {
  unit: BattleUnit;
  x: number;
  y: number;
  /** 兵力1あたりの幅。両軍で共通にしないと厚みが比べられない */
  scale: number;
  foe: boolean;
  dimmed?: boolean;
}) {
  const w = Math.max(26, Math.min(LANE_W, unit.strength * scale));
  const fill = foe ? '#8b2331' : '#2f4858';
  const morale = Math.max(0, Math.min(100, unit.morale));
  return (
    <g opacity={dimmed ? 0.45 : 1}>
      <rect
        x={x - w / 2}
        y={y}
        width={w}
        height={UNIT_H}
        rx={1.5}
        fill={fill}
        stroke={foe ? '#5e141d' : '#1b2b35'}
        strokeWidth={0.7}
      />
      <text
        x={x}
        y={y + UNIT_H / 2 + 3.4}
        textAnchor="middle"
        fontSize={8}
        fill="#f2e7cd"
        style={{ letterSpacing: '0.04em' }}
      >
        {ARM_MARK[unit.arm]} {Math.round(unit.strength)}
      </text>
      {/* 士気の帯。尽きるとその隊は崩れる */}
      <rect x={x - w / 2} y={y + UNIT_H} width={w} height={1.8} fill="rgba(0,0,0,0.22)" />
      <rect
        x={x - w / 2}
        y={y + UNIT_H}
        width={(w * morale) / 100}
        height={1.8}
        fill={foe ? '#d98b93' : '#d8ab3c'}
      />
    </g>
  );
}

// ── 命令の矢 ──────────────────────────────────────────

/**
 * その戦列の命令を矢で描く。
 * 前進はまっすぐ、迂回は隣へ弧を描き、退却は後ろへ向く
 */
function OrderArrow({
  lane,
  order,
  target,
}: {
  lane: BattleLane;
  order: BattleOrders[BattleLane];
  target: BattleLane;
}) {
  const from = laneCenter(lane);
  const top = OUR_Y - 4;
  const stroke = order === 'withdraw' ? '#7a6a52' : '#a8801f';

  if (order === 'withdraw') {
    return (
      <g stroke={stroke} strokeWidth={2} fill="none" markerEnd="url(#battle-arrow-dim)">
        <path d={`M ${from} ${OUR_Y + BAND_H - 6} l 0 12`} />
      </g>
    );
  }
  if (order === 'advance' && target === lane) {
    return (
      <g stroke={stroke} strokeWidth={2} fill="none" markerEnd="url(#battle-arrow)">
        <path d={`M ${from} ${top} L ${from} ${FOE_Y + BAND_H + 10}`} />
      </g>
    );
  }

  /*
   * 隣の戦列へ回り込む矢。迂回のときと、前進した先が空いていて
   * 厚い戦列へ向き直したときの両方で描く。破線は迂回のときだけにして、
   * 「側面を突きにいく」のと「正面が空いたので隣へ流れる」のを見分けられるようにする
   */
  const to = laneCenter(target);
  const midY = (FOE_Y + BAND_H + OUR_Y) / 2;
  return (
    <g stroke={stroke} strokeWidth={2} fill="none" markerEnd="url(#battle-arrow)">
      <path
        d={`M ${from} ${top} C ${from} ${midY}, ${to} ${midY + 14}, ${to} ${FOE_Y + BAND_H + 10}`}
        strokeDasharray={order === 'flank' ? '5 3' : undefined}
      />
    </g>
  );
}

// ── 地図本体 ──────────────────────────────────────────

export function BattleMap({
  field,
  /** 布陣の途中。まだ戦列に置かれていない兵科がある */
  pending,
  orders,
  selectedLane,
  onSelectLane,
}: {
  field: Battlefield;
  pending?: { placed: Partial<Record<BattleArm, BattleLane>>; strengthOf: (arm: BattleArm) => number };
  orders?: BattleOrders;
  selectedLane?: BattleLane | null;
  onSelectLane?: (lane: BattleLane) => void;
}) {
  // 両軍で共通の目盛り。これを揃えないと駒の大きさで厚みを比べられない
  const maxStrength = Math.max(
    field.ourStartStrength * 0.6,
    ...BATTLE_LANES.map((l) => laneStrength(field.theirs.lanes[l])),
    1,
  );
  const scale = LANE_W / maxStrength;

  /** 我が軍の駒。布陣中は置いた兵科だけを仮に描く */
  const ourUnits = (lane: BattleLane): BattleUnit[] => {
    if (pending === undefined) return field.ours.lanes[lane];
    return (Object.keys(pending.placed) as BattleArm[])
      .filter((arm) => pending.placed[arm] === lane)
      .map((arm) => ({ arm, strength: pending.strengthOf(arm), morale: 100 }));
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-sm"
      style={{ backgroundColor: TERRAIN_GROUND[field.terrain], touchAction: 'manipulation' }}
      role="img"
      aria-label="戦場の布陣図"
    >
      <defs>
        <marker id="battle-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#a8801f" />
        </marker>
        <marker id="battle-arrow-dim" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#7a6a52" />
        </marker>
      </defs>

      {/* 地の陰。単色の板に見せない */}
      <rect x={0} y={0} width={W} height={H} fill="url(#battle-ground)" />
      <defs>
        <linearGradient id="battle-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,0,0,0.10)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0.10)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.12)" />
        </linearGradient>
      </defs>

      <TerrainFeatures terrain={field.terrain} />

      {/* 戦列の区切り。関ヶ原図の街道のように、縦の道で三つに分ける */}
      {[LANE_X.center - 6, LANE_X.right - 6].map((x) => (
        <path
          key={x}
          d={`M ${x} 8 L ${x} ${H - 8}`}
          stroke="rgba(90,70,40,0.22)"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
      ))}

      {/* 敵の陣 */}
      {BATTLE_LANES.map((lane) => {
        const units = field.theirs.lanes[lane];
        return (
          <g key={`foe-${lane}`}>
            <rect
              x={LANE_X[lane]}
              y={FOE_Y}
              width={LANE_W}
              height={BAND_H}
              fill="rgba(139,35,49,0.10)"
              stroke="rgba(139,35,49,0.35)"
              strokeWidth={0.7}
              rx={2}
            />
            {units.length === 0 && (
              <text
                x={laneCenter(lane)}
                y={FOE_Y + BAND_H / 2 + 3}
                textAnchor="middle"
                fontSize={8}
                fill="#8b2331"
                opacity={0.6}
              >
                {field.round > 1 ? '崩れた' : 'なし'}
              </text>
            )}
            {units.map((u, i) => (
              <UnitPiece
                key={i}
                unit={u}
                x={laneCenter(lane)}
                y={FOE_Y + 4 + i * (UNIT_H + UNIT_GAP)}
                scale={scale}
                foe
              />
            ))}
          </g>
        );
      })}

      <text x={6} y={FOE_Y - 6} fontSize={8} fill="#8b2331" style={{ letterSpacing: '0.1em' }}>
        敵軍
      </text>

      {/* 命令の矢。布陣中は描かない */}
      {orders !== undefined &&
        field.phase === 'engaged' &&
        BATTLE_LANES.filter((lane) => laneStrength(field.ours.lanes[lane]) > 0).map((lane) => {
          /*
           * 向かう先は core の規則をそのまま引く。ここで引き写すと、
           * 正面が空いた戦列が隣へ回り込む規則を描き落とす
           */
          const target = resolveTarget(lane, orders[lane], field.theirs);
          return (
            <OrderArrow
              key={`arrow-${lane}`}
              lane={lane}
              order={orders[lane]}
              target={target ?? lane}
            />
          );
        })}

      {/* 我が陣 */}
      {BATTLE_LANES.map((lane) => {
        const units = ourUnits(lane);
        const selected = selectedLane === lane;
        return (
          <g
            key={`our-${lane}`}
            onClick={() => onSelectLane?.(lane)}
            style={{ cursor: onSelectLane ? 'pointer' : undefined }}
          >
            <rect
              x={LANE_X[lane]}
              y={OUR_Y}
              width={LANE_W}
              height={BAND_H}
              fill={selected ? 'rgba(168,128,31,0.22)' : 'rgba(47,72,88,0.10)'}
              stroke={selected ? '#a8801f' : 'rgba(47,72,88,0.35)'}
              strokeWidth={selected ? 1.8 : 0.7}
              rx={2}
            />
            <text
              x={laneCenter(lane)}
              y={H - 4}
              textAnchor="middle"
              fontSize={8}
              fill="#5d4c37"
              style={{ letterSpacing: '0.1em' }}
            >
              {BATTLE_LANE_LABELS[lane]}
            </text>
            {units.length === 0 && (
              <text
                x={laneCenter(lane)}
                y={OUR_Y + BAND_H / 2 + 3}
                textAnchor="middle"
                fontSize={8}
                fill="#5d4c37"
                opacity={0.65}
              >
                {pending ? 'ここへ置く' : field.round > 1 ? '崩れた' : 'なし'}
              </text>
            )}
            {units.map((u, i) => (
              <UnitPiece
                key={i}
                unit={u}
                x={laneCenter(lane)}
                y={OUR_Y + 4 + i * (UNIT_H + UNIT_GAP)}
                scale={scale}
                foe={false}
                dimmed={pending !== undefined}
              />
            ))}
          </g>
        );
      })}

      <text x={6} y={OUR_Y - 6} fontSize={8} fill="#2f4858" style={{ letterSpacing: '0.1em' }}>
        我が軍
      </text>
    </svg>
  );
}
