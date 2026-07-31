import { ENDING_YEAR } from '../../core/constants';
import type { GameState } from '../../core/types';
import { DIFFICULTY_LABELS } from '../catalogue';

interface Stat {
  label: string;
  value: string;
  tone: string;
}

/** 危険域は赤、警戒域は錆色、平時は墨色 */
function tone(value: number, warn: number, danger: number): string {
  if (value <= danger) return 'var(--oxblood)';
  if (value <= warn) return '#9a6b12';
  return 'var(--ink)';
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
    <div className="roman-tablet sticky top-0 z-20">
      <div className="flex items-baseline justify-between px-3 pt-2">
        <div className="roman-title text-lg">
          {state.year}
          <span className="text-xs font-normal ml-1" style={{ color: 'var(--ink-soft)' }}>
            年 / {ENDING_YEAR}
          </span>
        </div>
        <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>
          {DIFFICULTY_LABELS[state.difficulty]}
          {state.dynasty.abilitiesAdjusted && ' ・調整済み'}
        </div>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-x-2 gap-y-1 px-3 py-2">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <div
              className="text-[10px] leading-tight truncate tracking-wider"
              style={{ color: 'var(--ink-soft)' }}
            >
              {s.label}
            </div>
            <div className="text-sm font-semibold tabular-nums" style={{ color: s.tone }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
      <div className="roman-meander" />
    </div>
  );
}
