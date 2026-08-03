import { useState } from 'react';

import { BATTLE_ARMS, BATTLE_LANES, battlefieldTactics } from '../../core/battlefield';
import type { BattleDeployment, BattleOrders } from '../../core/battlefield';
import { BATTLE_MAX_ROUNDS } from '../../core/constants';
import type {
  BattleArm,
  BattleLane,
  BattleOrder,
  BattleSide,
  Battlefield,
} from '../../core/types';
import {
  BATTLE_ARM_LABELS,
  BATTLE_ARM_MARKS,
  BATTLE_LANE_LABELS,
  BATTLE_LEADER_LABELS,
  BATTLE_ORDER_DETAILS,
  BATTLE_ORDER_LABELS,
  EAST_PROVINCE_LABELS,
  PROVINCE_LABELS,
  TERRAIN_DETAILS,
  TERRAIN_LABELS,
  battleFoeLabel,
} from '../catalogue';

/** 戦場になった土地の名。属州・東方属州・境外のいずれか */
function placeLabel(placeId: string): string {
  if (placeId === 'exterior') return '境外';
  if (placeId in PROVINCE_LABELS) return PROVINCE_LABELS[placeId as keyof typeof PROVINCE_LABELS];
  if (placeId in EAST_PROVINCE_LABELS) {
    return EAST_PROVINCE_LABELS[placeId as keyof typeof EAST_PROVINCE_LABELS];
  }
  return placeId;
}

function laneStrength(side: BattleSide, lane: BattleLane): number {
  return side.lanes[lane].reduce((sum, u) => sum + u.strength, 0);
}

/** 戦列に並ぶ隊の札。兵科の印・兵力・士気の帯を出す */
function LaneUnits({ side, lane, foe }: { side: BattleSide; lane: BattleLane; foe: boolean }) {
  const units = side.lanes[lane];
  if (units.length === 0) {
    return (
      <div className="text-[10px] py-2 text-center" style={{ color: 'var(--ink-soft)' }}>
        —
      </div>
    );
  }
  return (
    <div className="space-y-1 py-1">
      {units.map((u, i) => (
        <div key={i} className="text-[10px] leading-tight">
          <div className="flex items-baseline justify-between gap-1">
            <span style={{ color: foe ? 'var(--oxblood)' : 'var(--ink)' }}>
              {BATTLE_ARM_MARKS[u.arm]} {BATTLE_ARM_LABELS[u.arm]}
            </span>
            <span style={{ color: 'var(--ink-soft)' }}>{Math.round(u.strength)}</span>
          </div>
          {/* 士気の帯。数字だけでは崩れる寸前が読めない */}
          <div
            className="mt-0.5 h-1 rounded-sm overflow-hidden"
            style={{ backgroundColor: 'rgba(0,0,0,0.12)' }}
          >
            <div
              className="h-full"
              style={{
                width: `${Math.max(0, Math.min(100, u.morale))}%`,
                backgroundColor: foe ? 'var(--oxblood)' : 'var(--gold)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 戦闘画面 — 戦列マップ。
 *
 * 左翼・中央・右翼の3つの戦列に歩兵・騎兵・弓を配り、
 * 激突ごとに前進・迂回・退却を選ぶ。**計算式はここに書かない。**
 * 布陣も解決も core/battlefield.ts の関数に投げるだけ
 */
export function BattleScreen({
  field,
  onDeploy,
  onFight,
  onFinish,
}: {
  field: Battlefield;
  onDeploy: (deployment: BattleDeployment) => void;
  onFight: (orders: BattleOrders) => void;
  onFinish: () => void;
}) {
  const [deployment, setDeployment] = useState<BattleDeployment>({
    infantry: 'center',
    cavalry: 'right',
    archers: 'left',
  });
  const [orders, setOrders] = useState<BattleOrders>({
    left: 'advance',
    center: 'advance',
    right: 'advance',
  });

  const lastRound = field.log.filter((entry) => entry.round === field.round - 1);
  const tactics = battlefieldTactics(field);

  return (
    <div className="min-h-dvh pb-28">
      <header className="roman-tablet sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-3 py-2">
          <h1 className="roman-heading text-sm">
            会戦 — {battleFoeLabel(field.foe)}
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>
              {placeLabel(field.placeId)} / {TERRAIN_LABELS[field.terrain]}
            </span>
          </h1>
          <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            {BATTLE_LEADER_LABELS[field.leader]} — {TERRAIN_DETAILS[field.terrain]}
          </p>
        </div>
        <div className="roman-meander" />
      </header>

      <main className="max-w-lg mx-auto px-3 py-3 space-y-3">
        {/* 戦列。上が敵、下が味方 */}
        <section className="roman-panel rounded-sm px-2 py-2">
          <div className="text-[11px] mb-1" style={{ color: 'var(--oxblood)' }}>
            敵の戦列
          </div>
          <div className="grid grid-cols-3 gap-1">
            {BATTLE_LANES.map((lane) => (
              <div
                key={lane}
                className="rounded-sm px-1.5"
                style={{ backgroundColor: 'rgba(139, 35, 49, 0.08)' }}
              >
                <LaneUnits side={field.theirs} lane={lane} foe />
              </div>
            ))}
          </div>

          <div className="roman-meander my-2" />

          <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
            {BATTLE_LANES.map((lane) => (
              <div key={lane} style={{ color: 'var(--ink-soft)' }}>
                {BATTLE_LANE_LABELS[lane]}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {BATTLE_LANES.map((lane) => (
              <div
                key={lane}
                className="rounded-sm px-1.5"
                style={{ backgroundColor: 'rgba(90, 70, 30, 0.08)' }}
              >
                <LaneUnits side={field.ours} lane={lane} foe={false} />
              </div>
            ))}
          </div>
          <div className="text-[11px] mt-1 text-right" style={{ color: 'var(--ink-soft)' }}>
            我が軍{' '}
            {/* 布陣前は戦列がまだ空なので、投じる兵力そのものを出す */}
            {Math.round(
              field.phase === 'deploy'
                ? field.ourStartStrength
                : BATTLE_LANES.reduce((s, l) => s + laneStrength(field.ours, l), 0),
            )}{' '}
            / 敵 {Math.round(BATTLE_LANES.reduce((s, l) => s + laneStrength(field.theirs, l), 0))}
          </div>
        </section>

        {/* 直前の激突の顛末 */}
        {lastRound.length > 0 && (
          <section className="roman-panel rounded-sm px-3 py-2">
            <h2 className="roman-heading text-xs">第{field.round - 1}戦</h2>
            <ul className="mt-1 space-y-0.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
              {lastRound.map((entry, i) => (
                <li key={i}>
                  {BATTLE_LANE_LABELS[entry.lane]} — {BATTLE_ORDER_LABELS[entry.ourOrder]}
                  {entry.ourTarget !== entry.lane &&
                    `（${BATTLE_LANE_LABELS[entry.ourTarget]}へ回り込む）`}
                  ／ 味方 −{Math.round(entry.ourLoss)}、敵 −{Math.round(entry.theirLoss)}
                  {entry.ourBroke && <span style={{ color: 'var(--oxblood)' }}> 味方の隊が崩れた</span>}
                  {entry.theirBroke && <span style={{ color: 'var(--gold)' }}> 敵の隊が崩れた</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {field.phase === 'deploy' && (
          <section className="roman-panel rounded-sm px-3 py-2">
            <h2 className="roman-heading text-sm">布陣</h2>
            <p className="text-[11px] mb-2" style={{ color: 'var(--ink-soft)' }}>
              兵科を戦列に配る。相性は 騎兵 → 弓 → 歩兵 → 騎兵 の順に強い。
              敵の並びは既に見えている
            </p>
            {BATTLE_ARMS.map((arm: BattleArm) => (
              <div key={arm} className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs w-14" style={{ color: 'var(--ink)' }}>
                  {BATTLE_ARM_MARKS[arm]} {BATTLE_ARM_LABELS[arm]}
                </span>
                <div className="flex gap-1 flex-1">
                  {BATTLE_LANES.map((lane) => (
                    <button
                      key={lane}
                      onClick={() => setDeployment((d) => ({ ...d, [arm]: lane }))}
                      className="roman-panel flex-1 rounded-sm py-1.5 text-[11px]"
                      style={
                        deployment[arm] === lane
                          ? { borderColor: 'var(--gold)', color: 'var(--purple)', fontWeight: 600 }
                          : { color: 'var(--ink-soft)' }
                      }
                    >
                      {BATTLE_LANE_LABELS[lane]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {field.phase === 'engaged' && (
          <section className="roman-panel rounded-sm px-3 py-2">
            <h2 className="roman-heading text-sm">
              第{field.round}戦の命令
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>
                全{BATTLE_MAX_ROUNDS}戦
              </span>
            </h2>
            {BATTLE_LANES.map((lane) => (
              <div key={lane} className="mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs w-14" style={{ color: 'var(--ink)' }}>
                    {BATTLE_LANE_LABELS[lane]}
                  </span>
                  <div className="flex gap-1 flex-1">
                    {(['advance', 'flank', 'withdraw'] as BattleOrder[]).map((order) => (
                      <button
                        key={order}
                        onClick={() => setOrders((o) => ({ ...o, [lane]: order }))}
                        className="roman-panel flex-1 rounded-sm py-1.5 text-[11px]"
                        style={
                          orders[lane] === order
                            ? { borderColor: 'var(--gold)', color: 'var(--purple)', fontWeight: 600 }
                            : { color: 'var(--ink-soft)' }
                        }
                      >
                        {BATTLE_ORDER_LABELS[order]}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] pl-[3.75rem]" style={{ color: 'var(--ink-soft)' }}>
                  {BATTLE_ORDER_DETAILS[orders[lane]]}
                </p>
              </div>
            ))}
          </section>
        )}

        {field.phase === 'done' && (
          <section className="roman-panel rounded-sm px-3 py-2">
            <h2 className="roman-heading text-sm">戦場の趨勢</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>
              戦列での優劣は、この会戦の我が軍の戦力に{' '}
              <span style={{ color: 'var(--purple)', fontWeight: 600 }}>
                ×{tactics.toFixed(2)}
              </span>{' '}
              として掛かる。勝敗はこのあと決まる
            </p>
          </section>
        )}
      </main>

      <div className="roman-tablet fixed bottom-0 inset-x-0 z-20 pb-[env(safe-area-inset-bottom)]">
        <div className="roman-meander" />
        <div className="max-w-lg mx-auto px-3 py-3">
          {field.phase === 'deploy' && (
            <button
              onClick={() => onDeploy(deployment)}
              className="roman-button w-full rounded-sm py-3.5 transition"
            >
              布陣を定めて戦端を開く
            </button>
          )}
          {field.phase === 'engaged' && (
            <button
              onClick={() => onFight(orders)}
              className="roman-button w-full rounded-sm py-3.5 transition"
            >
              第{field.round}戦を交える
            </button>
          )}
          {field.phase === 'done' && (
            <button
              onClick={onFinish}
              className="roman-button w-full rounded-sm py-3.5 transition"
            >
              戦いを終える
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
