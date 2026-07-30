import { ENDING_YEAR } from '../../core/constants';
import type { GameState } from '../../core/types';
import { DIFFICULTY_LABELS } from '../catalogue';

interface Stat {
  label: string;
  value: string;
  tone: string;
}

function tone(value: number, warn: number, danger: number): string {
  if (value <= danger) return 'text-red-400';
  if (value <= warn) return 'text-amber-400';
  return 'text-slate-100';
}

export function StatusBar({ state }: { state: GameState }) {
  const stats: Stat[] = [
    { label: '国庫', value: Math.round(state.treasury).toLocaleString(), tone: tone(state.treasury, 200, 0) },
    { label: '税基盤', value: state.taxBase.toFixed(0), tone: tone(state.taxBase, 40, 20) },
    { label: '野戦軍', value: state.fieldArmy.toFixed(0), tone: tone(state.fieldArmy, 30, 10) },
    { label: '正統性', value: state.legitimacy.toFixed(0), tone: tone(state.legitimacy, 35, 20) },
    { label: '元老院', value: state.senateSupport.toFixed(0), tone: tone(state.senateSupport, 30, 15) },
    { label: '東帝国', value: state.eastRelations.toFixed(0), tone: tone(state.eastRelations, 30, 15) },
    { label: '傭兵忠誠', value: state.foederatiLoyalty.toFixed(0), tone: tone(state.foederatiLoyalty, 35, 20) },
  ];

  return (
    <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800">
      <div className="flex items-baseline justify-between px-3 pt-2">
        <div className="text-lg font-bold text-slate-100">
          {state.year}
          <span className="text-xs font-normal text-slate-400 ml-1">年 / {ENDING_YEAR}</span>
        </div>
        <div className="text-xs text-slate-400">
          {DIFFICULTY_LABELS[state.difficulty]}
          {state.dynasty.abilitiesAdjusted && ' ・調整済み'}
        </div>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-x-2 gap-y-1 px-3 py-2">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <div className="text-[10px] leading-tight text-slate-400 truncate">{s.label}</div>
            <div className={`text-sm font-semibold tabular-nums ${s.tone}`}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
