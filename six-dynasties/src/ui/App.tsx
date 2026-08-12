import { useState } from 'react';

import { MAX_ACTIONS_PER_TURN } from '../core/constants';
import { consumesActionSlot } from '../core/tick';
import type { GameState, ProvinceId } from '../core/types';
import { ActionPanel } from './components/ActionPanel';
import { BattleScreen } from './components/BattleScreen';
import { ChinaMap, MapLegend, type InspectTarget } from './components/ChinaMap';
import {
  ChroniclePanel,
  NorthPanel,
  OfficersPanel,
  PrincePanel,
  RulerPanel,
  TribePanel,
} from './components/CourtPanel';
import { ResultScreen, TitleScreen } from './components/Screens';
import { StatusBar } from './components/StatusBar';
import {
  DEMAND_DETAILS,
  DEMAND_LABELS,
  FACTION_LABELS,
  PROVINCE_LABELS,
  PROVINCE_NOTES,
  PROVINCE_SEATS,
} from './catalogue';
import { useGame } from './useGame';

type Tab = 'map' | 'court' | 'act' | 'log';

const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: '天下' },
  { id: 'court', label: '朝廷' },
  { id: 'act', label: '行動' },
  { id: 'log', label: '記録' },
];

/**
 * 突きつけられている要求。行動枠を消費せずに答えられるので、
 * 行動の一覧とは別に、見落とさない場所へ出す
 */
function DemandPanel({ state }: { state: GameState }) {
  const demands = Object.values(state.factions).filter(
    (faction) => faction.stance === 'hostile' && faction.demand !== null,
  );
  if (demands.length === 0) return null;

  return (
    <section className="han-panel-alert rounded-sm px-3 py-2">
      <h2 className="han-heading text-sm" style={{ color: 'var(--cinnabar)' }}>
        突きつけられている要求
      </h2>
      <ul className="mt-1.5 space-y-1.5">
        {demands.map((faction) => {
          const demand = faction.demand;
          if (demand === null) return null;
          return (
            <li key={faction.id} className="text-[12px]">
              <span className="font-semibold">{FACTION_LABELS[faction.id]}</span>
              <span style={{ color: 'var(--ink-soft)' }}>
                {faction.location !== 'exterior' && `（${PROVINCE_LABELS[faction.location]}）`} —{' '}
              </span>
              <span className="font-semibold" style={{ color: 'var(--imperial)' }}>
                {DEMAND_LABELS[demand.type]}
                {demand.type === 'gold' && ` ${Math.round(demand.amount)}`}
                {demand.type === 'land' &&
                  demand.targetProvince &&
                  `（${PROVINCE_LABELS[demand.targetProvince]}）`}
              </span>
              <div style={{ color: 'var(--ink-soft)' }}>{DEMAND_DETAILS[demand.type]}</div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--cinnabar)' }}>
        答えるまで、その勢力は戦いを有利に進める。「胡族 → 要求を飲む」で応じる（行動枠は消費しない）
      </p>
    </section>
  );
}

/** 戦線 — いま敵が踏み込んでいる州 */
function FrontsPanel({ state }: { state: GameState }) {
  const fronts = (Object.keys(state.provinces) as ProvinceId[])
    .map((id) => ({
      id,
      province: state.provinces[id],
      foes: Object.values(state.factions).filter(
        (f) => f.location === id && f.stance === 'hostile',
      ),
      revolt: state.princes.some((p) => p.inRevolt && p.province === id),
    }))
    .filter((row) => row.province.holder === null && (row.foes.length > 0 || row.revolt));

  if (fronts.length === 0) {
    return (
      <section className="han-panel rounded-sm px-3 py-2">
        <h2 className="han-heading text-sm">戦線</h2>
        <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
          いま朝廷の州に踏み込んでいる敵はいない
        </p>
      </section>
    );
  }

  return (
    <section className="han-panel-alert rounded-sm px-3 py-2">
      <h2 className="han-heading text-sm" style={{ color: 'var(--cinnabar)' }}>
        戦線 {fronts.length} 州
      </h2>
      <ul className="mt-1 space-y-1">
        {fronts.map((row) => (
          <li key={row.id} className="text-[12px] flex items-baseline gap-1.5">
            <span className="font-semibold shrink-0">{PROVINCE_LABELS[row.id]}</span>
            <span className="tabular-nums shrink-0" style={{ color: 'var(--ink-soft)' }}>
              支配 {Math.round(row.province.control)}／州兵 {Math.round(row.province.garrison)}
            </span>
            <span className="truncate" style={{ color: 'var(--cinnabar)' }}>
              {row.revolt && '宗室の挙兵 '}
              {row.foes
                .map((f) => `${FACTION_LABELS[f.id]} ${Math.round(f.strength)}`)
                .join('、')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TabBar({
  current,
  onSelect,
  badges,
}: {
  current: Tab;
  onSelect: (tab: Tab) => void;
  badges: Partial<Record<Tab, number>>;
}) {
  return (
    <nav className="han-tablet" style={{ borderWidth: '0 0 1px 0' }}>
      <div className="max-w-lg mx-auto grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.id === current;
          const badge = badges[tab.id] ?? 0;
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className="relative py-2 text-[13px]"
              style={{
                color: active ? 'var(--imperial-deep)' : 'var(--ink-soft)',
                fontWeight: active ? 700 : 400,
                letterSpacing: '0.1em',
                borderBottom: `2px solid ${active ? 'var(--imperial)' : 'transparent'}`,
              }}
            >
              {tab.label}
              {badge > 0 && (
                <span
                  className="ml-1 inline-block rounded-full px-1 text-[10px] align-top"
                  style={{ background: 'var(--cinnabar)', color: 'var(--silk)' }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function App() {
  const {
    state,
    previous,
    selected,
    log,
    score,
    loadError,
    resumable,
    start,
    resume,
    toggleAction,
    rename,
    endTurn,
    deploy,
    fight,
    finishBattle,
    quit,
    save,
    load,
  } = useGame();
  const [tab, setTab] = useState<Tab>('map');
  const [focused, setFocused] = useState<ProvinceId | null>(null);
  const [inspected, setInspected] = useState<InspectTarget | null>(null);

  if (state === null) {
    return (
      <TitleScreen
        onStart={start}
        onLoad={load}
        onResume={resume}
        resumable={resumable}
        loadError={loadError}
      />
    );
  }
  if (state.status !== 'ongoing' && score !== null) {
    return <ResultScreen score={score} state={state} onRestart={quit} />;
  }
  // 会戦のあいだは戦闘専用の画面に切り替える。その年はまだ進んでいない
  if (state.battlefield !== null) {
    return (
      <BattleScreen
        state={state}
        field={state.battlefield}
        onDeploy={deploy}
        onFight={fight}
        onFinish={finishBattle}
      />
    );
  }

  const demandCount = Object.values(state.factions).filter(
    (faction) => faction.stance === 'hostile' && faction.demand !== null,
  ).length;
  const revoltCount = state.princes.filter((p) => p.inRevolt).length;
  const usedSlots = selected.filter(consumesActionSlot).length;
  const province = focused ? state.provinces[focused] : null;

  return (
    <div className="min-h-dvh pb-28">
      {/* 状況表示と区切りは一体で貼り付ける。別々に sticky にすると重なる */}
      <div className="sticky top-0 z-20">
        <StatusBar state={state} previous={previous} />
        <TabBar
          current={tab}
          onSelect={setTab}
          badges={{ act: demandCount + revoltCount }}
        />
      </div>

      <main className="max-w-lg mx-auto px-3 py-3 space-y-3">
        <section hidden={tab !== 'map'}>
          <ChinaMap
            state={state}
            selected={focused}
            onSelect={(id) => {
              setInspected(null);
              setFocused((current) => (current === id ? null : id));
            }}
            onInspect={(target) => {
              setFocused(null);
              setInspected(target);
            }}
          />
          <MapLegend state={state} />

          {province && focused && (
            <div className="han-panel mt-2 rounded-sm px-3 py-2">
              <div className="text-[13px]">
                <span className="han-heading">{PROVINCE_LABELS[focused]}</span>
                <span style={{ color: 'var(--ink-soft)' }}>
                  {' '}
                  — 治所 {PROVINCE_SEATS[focused]}／{province.region === 'north' ? '淮北' : '江南'}
                </span>
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                {province.holder === null
                  ? `支配 ${Math.round(province.control)}／戸口 ${Math.round(province.baseTax)}／州兵 ${Math.round(province.garrison)}`
                  : province.holder === 'north'
                    ? `${state.north?.name ?? '北朝'}の手にある`
                    : province.holder === 'prince'
                      ? '挙兵した王が拠っている'
                      : `${FACTION_LABELS[province.holder]}の手にある`}
              </div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--ink-soft)' }}>
                {PROVINCE_NOTES[focused]}
              </div>
            </div>
          )}

          {inspected && inspected.kind === 'faction' && (
            <div className="han-panel mt-2 rounded-sm px-3 py-2 text-[12px]">
              <span className="han-heading">{FACTION_LABELS[inspected.id]}</span>
              <span style={{ color: 'var(--ink-soft)' }}>
                {' '}
                — 兵 {Math.round(state.factions[inspected.id].strength)}
              </span>
            </div>
          )}

          <div className="mt-2 space-y-2">
            <FrontsPanel state={state} />
            <NorthPanel state={state} />
          </div>
        </section>

        {tab === 'court' && (
          <>
            <RulerPanel state={state} onRename={rename} />
            <OfficersPanel state={state} />
            <PrincePanel state={state} />
            <TribePanel state={state} />
            <ChroniclePanel state={state} />
          </>
        )}

        {tab === 'act' && (
          <>
            {/* 要求は行動枠を消費せずに答えられる。行動の一覧より先に出す */}
            <DemandPanel state={state} />
            <section>
              <h2 className="han-heading text-sm mb-2">
                この年の行動
                <span className="ml-2 text-[12px] font-normal" style={{ color: 'var(--ink-soft)' }}>
                  {usedSlots} / {MAX_ACTIONS_PER_TURN}
                </span>
              </h2>
              <ActionPanel state={state} selected={selected} onToggle={toggleAction} />
            </section>
          </>
        )}

        {tab === 'log' && (
          <>
            <section>
              <h2 className="han-heading text-sm mb-2">記録</h2>
              {log.length === 0 ? (
                <p className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                  まだ何も起きていない
                </p>
              ) : (
                <ul className="space-y-1">
                  {log.map((entry, i) => (
                    <li
                      key={i}
                      className="text-[12px] pl-2"
                      style={{ color: 'var(--ink-soft)', borderLeft: '2px solid var(--gold)' }}
                    >
                      {entry}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex gap-2">
              <button onClick={save} className="han-panel flex-1 rounded-sm py-2 text-[12px]">
                この時点を書き出す
              </button>
              <button
                onClick={quit}
                className="han-panel flex-1 rounded-sm py-2 text-[12px]"
                style={{ color: 'var(--ink-soft)' }}
              >
                中断して題へ戻る
              </button>
            </section>
            <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
              年を送るたびに端末へ控えが残るので、閉じても続きから遊べる
            </p>
          </>
        )}
      </main>

      <div className="han-tablet fixed bottom-0 inset-x-0 z-20 pb-[env(safe-area-inset-bottom)]">
        <div className="han-fret" />
        <div className="max-w-lg mx-auto px-3 py-2.5">
          <div
            className="flex items-center justify-between text-[11px] mb-1.5"
            style={{ color: 'var(--ink-soft)' }}
          >
            <span>
              行動 {usedSlots} / {MAX_ACTIONS_PER_TURN}
              {selected.length > usedSlots && `（＋枠外 ${selected.length - usedSlots}）`}
            </span>
            {demandCount + revoltCount > 0 && tab !== 'act' && (
              <button onClick={() => setTab('act')} style={{ color: 'var(--cinnabar)' }}>
                {revoltCount > 0 && `挙兵 ${revoltCount} 件 `}
                {demandCount > 0 && `未応答 ${demandCount} 件`} →
              </button>
            )}
          </div>
          <button onClick={endTurn} className="han-button w-full rounded-sm py-3.5">
            次の年へ（{state.year + 1}年）
          </button>
        </div>
      </div>
    </div>
  );
}
