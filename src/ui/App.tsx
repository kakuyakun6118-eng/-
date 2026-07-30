import { useState } from 'react';

import { MAX_ACTIONS_PER_TURN } from '../core/constants';
import type { ProvinceId } from '../core/types';
import { ActionPanel } from './components/ActionPanel';
import { ProvinceMap, occupierNames } from './components/ProvinceMap';
import { RulerPanel } from './components/RulerPanel';
import { ResultScreen, TitleScreen } from './components/Screens';
import { StatusBar } from './components/StatusBar';
import { PROVINCE_LABELS } from './catalogue';
import { useGame } from './useGame';

export function App() {
  const { state, selected, log, score, loadError, start, toggleAction, endTurn, quit, save, load } =
    useGame();
  const [focused, setFocused] = useState<ProvinceId | null>(null);

  if (state === null) return <TitleScreen onStart={start} onLoad={load} loadError={loadError} />;
  if (state.status !== 'ongoing' && score !== null) {
    return <ResultScreen score={score} onRestart={quit} />;
  }

  const occupiers = focused ? occupierNames(state, focused) : [];

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 pb-28">
      <StatusBar state={state} />

      <main className="max-w-lg mx-auto px-3 py-3 space-y-3">
        <section>
          <ProvinceMap
            state={state}
            selectedProvince={focused}
            onSelect={(id) => setFocused((current) => (current === id ? null : id))}
          />
          {focused && (
            <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs">
              <span className="font-semibold text-slate-100">{PROVINCE_LABELS[focused]}</span>
              <span className="text-slate-400">
                {' '}— 支配 {Math.round(state.provinces[focused].control)} / 税収基礎{' '}
                {Math.round(state.provinces[focused].baseTax)} / 守備{' '}
                {Math.round(state.provinces[focused].garrison)}
              </span>
              {occupiers.length > 0 && (
                <div className="text-slate-400 mt-1">駐留: {occupiers.join('、')}</div>
              )}
            </div>
          )}
        </section>

        <RulerPanel state={state} />

        <section>
          <h2 className="text-sm font-semibold text-slate-100 mb-2">
            この年の行動
            <span className="ml-2 text-xs font-normal text-slate-400">
              {selected.length} / {MAX_ACTIONS_PER_TURN}
            </span>
          </h2>
          <ActionPanel state={state} selected={selected} onToggle={toggleAction} />
        </section>

        <section className="flex gap-2">
          <button
            onClick={save}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 py-2 text-xs font-medium text-slate-200 active:bg-slate-800"
          >
            この時点を保存
          </button>
          <button
            onClick={quit}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 py-2 text-xs font-medium text-slate-400 active:bg-slate-800"
          >
            中断してタイトルへ
          </button>
        </section>

        {log.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-100 mb-2">記録</h2>
            <ul className="space-y-1">
              {log.map((entry, i) => (
                <li key={i} className="text-xs text-slate-400 border-l-2 border-slate-700 pl-2">
                  {entry}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 z-20 bg-slate-950/95 backdrop-blur border-t border-slate-800 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto px-3 py-3">
          <button
            onClick={endTurn}
            className="w-full rounded-lg bg-amber-500 text-slate-950 font-bold py-3.5 active:bg-amber-400 transition"
          >
            次の年へ（{state.year + 1}年）
          </button>
        </div>
      </div>
    </div>
  );
}
