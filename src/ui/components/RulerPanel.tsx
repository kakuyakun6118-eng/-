import { useState } from 'react';

import { ABILITY_NEUTRAL, ADULT_AGE } from '../../core/constants';
import type { GameState, Ruler } from '../../core/types';
import { FACTION_LABELS } from '../catalogue';
import { ConsortFigure, EmperorFigure, consortOriginLabel } from './Portrait';

/** 画面の収まりのための上限。ゲームルールではないのでここに置く */
const RULER_NAME_MAX_LENGTH = 12;

export function RulerPanel({
  state,
  onRename,
}: {
  state: GameState;
  onRename: (name: string) => void;
}) {
  const { ruler, members, crisisYearsRemaining, history } = state.dynasty;
  const heirs = members.filter((m) => state.year - m.birthYear >= ADULT_AGE);
  const spouse = ruler.spouse;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2">
      <div className="flex gap-3">
        <figure className="shrink-0 text-center">
          <EmperorFigure
            ruler={ruler}
            year={state.year}
            className="w-20 h-auto rounded-md ring-1 ring-amber-700/50"
          />
          <figcaption className="text-[10px] text-slate-400 mt-0.5">
            皇帝 {state.year - ruler.birthYear}歳
          </figcaption>
        </figure>

        {spouse && (
          <figure className="shrink-0 text-center">
            <ConsortFigure
              spouse={spouse}
              year={state.year}
              className="w-20 h-auto rounded-md ring-1 ring-amber-700/50"
            />
            <figcaption className="text-[10px] text-slate-400 mt-0.5">皇后</figcaption>
          </figure>
        )}

        <div className="min-w-0 flex-1">
          <RulerName ruler={ruler} onRename={onRename} />
          <p className="text-xs text-slate-400">
            {state.dynasty.name}朝 / 在位 {state.year - ruler.accessionYear} 年 /{' '}
            {history.length + 1} 代目
          </p>
          {spouse && (
            <p className="text-[11px] text-amber-300 mt-1 truncate">
              {consortOriginLabel(
                spouse.origin,
                spouse.origin.kind === 'east' ? '' : FACTION_LABELS[spouse.origin.factionId],
              )}
              と婚姻
            </p>
          )}
          <p className="text-xs mt-1">
            後継者{' '}
            <span className={heirs.length > 0 ? 'text-slate-200' : 'text-red-400'}>
              {heirs.length > 0 ? `${heirs.length}人` : 'なし'}
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Ability label="軍事" value={ruler.abilities.military} hint="戦闘の防御" />
        <Ability label="統治" value={ruler.abilities.governance} hint="税収・正統性" />
        <Ability label="交渉" value={ruler.abilities.diplomacy} hint="貢納・成立率" />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        {heirs.length === 0 && <span className="text-red-400">継承危機の恐れ</span>}
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

      <GeneralRow state={state} />
    </div>
  );
}

/**
 * 皇帝の名。触ると書き換えられる。
 * 代替わりのたびに名を付け直せるよう、開始時だけでなく在位中も開く
 */
function RulerName({ ruler, onRename }: { ruler: Ruler; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ruler.name);

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(ruler.name);
          setEditing(true);
        }}
        className="flex items-baseline gap-1.5 text-left"
      >
        <h2 className="text-sm font-semibold text-slate-100">{ruler.name}</h2>
        <span className="text-[10px] text-slate-500">改名</span>
      </button>
    );
  }

  const commit = () => {
    onRename(draft);
    setEditing(false);
  };

  return (
    <input
      autoFocus
      type="text"
      value={draft}
      maxLength={RULER_NAME_MAX_LENGTH}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="w-full rounded border border-amber-600 bg-slate-950 px-1.5 py-0.5 text-sm font-semibold text-slate-100"
    />
  );
}

/**
 * 軍司令官。皇帝と並べて出す。
 * この時代の実権は皇帝ではなくこの職にあったので、
 * 王朝の欄の中に置いて「宮廷の顔ぶれ」として見せる
 */
function GeneralRow({ state }: { state: GameState }) {
  const general = state.general.current;

  if (general === null) {
    return (
      <div className="rounded-md border border-red-800/60 bg-red-950/30 px-2.5 py-1.5 text-xs">
        <span className="font-semibold text-red-200">軍司令官 空位</span>
        <span className="text-slate-400"> — 指揮官のいない軍は戦いに弱い</span>
      </div>
    );
  }

  const gap = general.military - ABILITY_NEUTRAL;
  return (
    <div className="rounded-md border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-xs">
      <span className="font-semibold text-slate-100">
        軍司令官 <span className="text-amber-300">軍事 {general.military}</span>
      </span>
      <span className="text-slate-400">
        {' '}— 在職 {state.year - general.appointedYear} 年 / 第
        {state.general.history.length + 1} 代
      </span>
      {gap > 0 && (
        <div className="text-amber-400 mt-0.5">
          戦勝の名声が皇帝に入りにくく、正統性が余分に減る
        </div>
      )}
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
