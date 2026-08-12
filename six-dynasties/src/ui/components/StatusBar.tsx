import { ENDING_YEAR, START_YEAR } from '../../core/constants';
import type { GameState } from '../../core/types';
import { PARAMETER_NOTES } from '../catalogue';

/** 前年からの増減。表示のためだけの派生値 */
function Delta({ value }: { value: number }) {
  const rounded = Math.round(value);
  if (rounded === 0) return null;
  return (
    <span
      className="ml-0.5 text-[9px] align-super"
      style={{ color: rounded > 0 ? 'var(--jade)' : 'var(--cinnabar)' }}
    >
      {rounded > 0 ? '+' : ''}
      {rounded}
    </span>
  );
}

function Gauge({
  label,
  value,
  previous,
  note,
  tone,
}: {
  label: string;
  value: number;
  previous: number | undefined;
  note: string;
  tone: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div title={note} className="min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] truncate" style={{ color: 'var(--ink-soft)' }}>
          {label}
        </span>
        <span className="text-[11px] tabular-nums font-semibold">
          {Math.round(value)}
          {previous !== undefined && <Delta value={value - previous} />}
        </span>
      </div>
      <div className="h-1 mt-0.5 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.14)' }}>
        <div
          className="h-1 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: tone }}
        />
      </div>
    </div>
  );
}

export function StatusBar({
  state,
  previous,
}: {
  state: GameState;
  previous: GameState | null;
}) {
  const elapsed = ((state.year - START_YEAR) / (ENDING_YEAR - START_YEAR)) * 100;

  return (
    <header className="han-tablet" style={{ borderWidth: '0 0 1px 0' }}>
      <div className="max-w-lg mx-auto px-3 pt-2 pb-1.5">
        <div className="flex items-baseline gap-2">
          <span className="han-seal rounded-[2px] px-1.5 py-0.5 text-[11px] font-bold">
            {state.dynasty.houseName}
          </span>
          <span className="han-title text-base tabular-nums">{state.year}年</span>
          <span className="text-[11px] truncate" style={{ color: 'var(--ink-soft)' }}>
            {state.dynasty.ruler.name}／都は{state.capitalName}
          </span>
        </div>

        {/* 291年から589年までのどこにいるか */}
        <div
          className="h-[3px] mt-1 rounded-full overflow-hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.16)' }}
        >
          <div
            className="h-full"
            style={{ width: `${elapsed}%`, backgroundColor: 'var(--cinnabar)' }}
          />
        </div>

        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px]">
          <span title={PARAMETER_NOTES.treasury}>
            <span style={{ color: 'var(--ink-soft)' }}>国庫 </span>
            <span className="tabular-nums font-semibold">{Math.round(state.treasury)}</span>
            {previous && <Delta value={state.treasury - previous.treasury} />}
          </span>
          <span title={PARAMETER_NOTES.centralArmy}>
            <span style={{ color: 'var(--ink-soft)' }}>中軍 </span>
            <span className="tabular-nums font-semibold">{Math.round(state.centralArmy)}</span>
            {previous && <Delta value={state.centralArmy - previous.centralArmy} />}
          </span>
          <span title={PARAMETER_NOTES.taxBase}>
            <span style={{ color: 'var(--ink-soft)' }}>戸口 </span>
            <span className="tabular-nums font-semibold">{Math.round(state.taxBase)}</span>
            {previous && <Delta value={state.taxBase - previous.taxBase} />}
          </span>
        </div>

        <div className="mt-1.5 grid grid-cols-4 gap-2">
          <Gauge
            label="天命"
            value={state.mandate}
            previous={previous?.mandate}
            note={PARAMETER_NOTES.mandate}
            tone="var(--gold)"
          />
          <Gauge
            label="士族"
            value={state.gentry}
            previous={previous?.gentry}
            note={PARAMETER_NOTES.gentry}
            tone="var(--imperial)"
          />
          <Gauge
            label="宗室"
            value={state.princeLoyalty}
            previous={previous?.princeLoyalty}
            note={PARAMETER_NOTES.princeLoyalty}
            tone="#7b5a86"
          />
          <Gauge
            label="胡族"
            value={state.tribalLoyalty}
            previous={previous?.tribalLoyalty}
            note={PARAMETER_NOTES.tribalLoyalty}
            tone="var(--jade)"
          />
        </div>
      </div>
    </header>
  );
}
