import { useState } from 'react';

import { MAX_ACTIONS_PER_TURN } from '../core/constants';
import { consumesActionSlot } from '../core/tick';
import type { GameState, ProvinceId } from '../core/types';
import { ActionPanel } from './components/ActionPanel';
import {
  MapLegend,
  ProvinceMap,
  occupierNames,
  type InspectTarget,
} from './components/ProvinceMap';
import { PowerCard } from './components/PowerCard';
import { CourtFigures } from './components/CourtFigures';
import { CourtPanel } from './components/CourtPanel';
import { EastPanel } from './components/EastPanel';
import { RulerPanel } from './components/RulerPanel';
import { ResultScreen, TitleScreen } from './components/Screens';
import { StatusBar } from './components/StatusBar';
import { DEMAND_DETAILS, DEMAND_LABELS, FACTION_LABELS, PROVINCE_LABELS } from './catalogue';
import { useMusic } from './music';
import { useGame } from './useGame';

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
    <section
      className="roman-panel rounded-sm px-3 py-2"
      style={{ borderColor: 'var(--oxblood)', backgroundColor: 'rgba(139, 35, 49, 0.09)' }}
    >
      <h2 className="roman-heading text-sm" style={{ color: 'var(--oxblood)' }}>
        突きつけられている要求
      </h2>
      <ul className="mt-1.5 space-y-1.5">
        {demands.map((faction) => {
          const demand = faction.demand;
          if (demand === null) return null;
          return (
            <li key={faction.id} className="text-xs">
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                {FACTION_LABELS[faction.id]}
              </span>
              <span style={{ color: 'var(--ink-soft)' }}>
                {faction.location !== 'exterior' && `（${PROVINCE_LABELS[faction.location]}）`} —{' '}
              </span>
              <span className="font-semibold" style={{ color: 'var(--purple)' }}>
                {DEMAND_LABELS[demand.type]}
                {demand.type === 'gold' && ` ${Math.round(demand.amount)}`}
                {demand.type === 'land' &&
                  demand.targetProvince &&
                  ` （${PROVINCE_LABELS[demand.targetProvince]}）`}
              </span>
              <div style={{ color: 'var(--ink-soft)' }}>{DEMAND_DETAILS[demand.type]}</div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--oxblood)' }}>
        答えるまで、その勢力は戦いを有利に進め、土地に住み着きやすくなる。
        「交渉 → 要求を飲む」で応じる（行動枠は消費しない）
      </p>
    </section>
  );
}

/** 同じ相手をもう一度触れたら閉じる。属州の選択と同じ操作感にする */
function sameTarget(a: InspectTarget | null, b: InspectTarget): boolean {
  if (a === null) return false;
  if (a.kind !== b.kind) return false;
  return a.kind === 'faction' && b.kind === 'faction' ? a.id === b.id : true;
}

export function App() {
  const {
    state,
    selected,
    log,
    score,
    loadError,
    motion,
    start,
    toggleAction,
    rename,
    endTurn,
    quit,
    save,
    load,
  } = useGame();
  const [focused, setFocused] = useState<ProvinceId | null>(null);
  // 地図で触れた他国。属州の選択とは別に持つ
  const [inspected, setInspected] = useState<InspectTarget | null>(null);
  const music = useMusic();

  if (state === null) {
    return (
      <TitleScreen
        onStart={(difficulty, rulerName, scenario) => {
          // 難易度を選ぶ操作をきっかけに鳴らす。操作なしでは再生できない
          music.startIfAllowed();
          start(difficulty, rulerName, scenario);
        }}
        onLoad={load}
        loadError={loadError}
      />
    );
  }
  if (state.status !== 'ongoing' && score !== null) {
    return <ResultScreen score={score} state={state} onRestart={quit} />;
  }

  const occupiers = focused ? occupierNames(state, focused) : [];

  return (
    <div className="min-h-dvh pb-28">
      <StatusBar state={state} music={music} />

      <main className="max-w-lg mx-auto px-3 py-3 space-y-3">
        <section>
          <ProvinceMap
            state={state}
            motion={motion}
            selectedProvince={focused}
            onSelect={(id) => {
              setInspected(null);
              setFocused((current) => (current === id ? null : id));
            }}
            onInspect={(target) => {
              setFocused(null);
              setInspected((current) => (sameTarget(current, target) ? null : target));
            }}
          />
          <MapLegend />
          {inspected && (
            <PowerCard state={state} target={inspected} onClose={() => setInspected(null)} />
          )}
          {focused && (
            <div className="roman-panel mt-2 rounded-sm px-3 py-2 text-xs">
              <span className="roman-heading">{PROVINCE_LABELS[focused]}</span>
              <span style={{ color: 'var(--ink-soft)' }}>
                {' '}— 支配 {Math.round(state.provinces[focused].control)} / 税収基礎{' '}
                {Math.round(state.provinces[focused].baseTax)} / 守備{' '}
                {Math.round(state.provinces[focused].garrison)}
              </span>
              {occupiers.length > 0 && (
                <div className="mt-1" style={{ color: 'var(--ink-soft)' }}>
                  駐留: {occupiers.join('、')}
                </div>
              )}
            </div>
          )}
        </section>

        <RulerPanel state={state} onRename={rename} />

        <CourtFigures state={state} />

        <CourtPanel state={state} selected={selected} onToggle={toggleAction} />

        <EastPanel state={state} />

        <DemandPanel state={state} />

        <section>
          <h2 className="roman-heading text-sm mb-2">
            この年の行動
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>
              {selected.filter(consumesActionSlot).length} / {MAX_ACTIONS_PER_TURN}
            </span>
          </h2>
          <ActionPanel state={state} selected={selected} onToggle={toggleAction} />
        </section>

        <section className="flex gap-2">
          <button
            onClick={save}
            className="roman-panel flex-1 rounded-sm py-2 text-xs font-medium"
          >
            この時点を保存
          </button>
          <button
            onClick={quit}
            className="roman-panel flex-1 rounded-sm py-2 text-xs font-medium"
            style={{ color: 'var(--ink-soft)' }}
          >
            中断してタイトルへ
          </button>
        </section>

        {log.length > 0 && (
          <section>
            <h2 className="roman-heading text-sm mb-2">記録</h2>
            <ul className="space-y-1">
              {log.map((entry, i) => (
                <li
                  key={i}
                  className="text-xs pl-2"
                  style={{ color: 'var(--ink-soft)', borderLeft: '2px solid var(--gold)' }}
                >
                  {entry}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <div className="roman-tablet fixed bottom-0 inset-x-0 z-20 pb-[env(safe-area-inset-bottom)]">
        <div className="roman-meander" />
        <div className="max-w-lg mx-auto px-3 py-3">
          <button
            onClick={endTurn}
            className="roman-button w-full rounded-sm py-3.5 transition"
          >
            次の年へ（{state.year + 1}年）
          </button>
        </div>
      </div>
    </div>
  );
}
