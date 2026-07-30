import { ADULT_AGE } from '../../core/constants';
import type { GameState } from '../../core/types';
import { FACTION_LABELS } from '../catalogue';

export function RulerPanel({ state }: { state: GameState }) {
  const { ruler, members, crisisYearsRemaining, history } = state.dynasty;
  const heirs = members.filter((m) => state.year - m.birthYear >= ADULT_AGE);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">
          {state.dynasty.name}朝
          <span className="ml-2 text-xs font-normal text-slate-400">
            在位 {state.year - ruler.accessionYear} 年 / {history.length + 1} 代目
          </span>
        </h2>
        {ruler.spouse && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {ruler.spouse.origin.kind === 'east'
              ? '東ローマと婚姻'
              : `${FACTION_LABELS[ruler.spouse.origin.factionId]}と婚姻`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Ability label="軍事" value={ruler.abilities.military} hint="戦闘の防御" />
        <Ability label="統治" value={ruler.abilities.governance} hint="税収・正統性" />
        <Ability label="交渉" value={ruler.abilities.diplomacy} hint="貢納・成立率" />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>
          後継者{' '}
          <span className={heirs.length > 0 ? 'text-slate-200' : 'text-red-400'}>
            {heirs.length > 0 ? `${heirs.length}人` : 'なし（継承危機の恐れ）'}
          </span>
        </span>
        {ruler.mixedBlood && <span className="text-amber-400">混血の君主</span>}
        {ruler.claims.length > 0 && (
          <span className="text-amber-400">
            請求権: {ruler.claims.map((c) => FACTION_LABELS[c]).join('・')}
          </span>
        )}
        {crisisYearsRemaining > 0 && (
          <span className="text-red-400">継承危機の余波 残り{crisisYearsRemaining}年</span>
        )}
      </div>
    </div>
  );
}

function Ability({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-md bg-slate-800 px-2 py-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-base font-bold text-slate-100 tabular-nums">{value}</span>
      </div>
      <div className="text-[10px] text-slate-500 truncate">{hint}</div>
    </div>
  );
}
