import { useState } from 'react';

import dynastyData from '../../data/dynasty.json';
import { ENDING_YEAR, STARTING_YEAR } from '../../core/constants';
import { findEvent } from '../../core/events';
import type { Difficulty, GameState, ProvinceId, ScoreResult } from '../../core/types';
import {
  DIFFICULTY_LABELS,
  FACTION_LABELS,
  GENERAL_END_LABELS,
  PROVINCE_LABELS,
} from '../catalogue';

/** 名前が空のまま始めたときに使う既定名。データ側の初期君主に合わせる */
const DEFAULT_RULER_NAME = dynastyData.ruler.name;
/** 画面の収まりのための上限。ゲームルールではないのでここに置く */
const RULER_NAME_MAX_LENGTH = 12;

const DIFFICULTY_DETAIL: Record<Difficulty, string> = {
  beginner: '税収に余裕があり、蛮族の圧力と傭兵の要求も緩い',
  standard: '基準となるバランス',
  veteran: '税収が細り、蛮族は強く、傭兵の要求は速く膨らむ',
};

export function TitleScreen({
  onStart,
  onLoad,
  loadError,
}: {
  onStart: (difficulty: Difficulty, rulerName: string) => void;
  onLoad: (file: File) => void;
  loadError: string | null;
}) {
  // 空のまま始めても遊べるよう、データの既定名を初期値にする
  const [rulerName, setRulerName] = useState(DEFAULT_RULER_NAME);
  return (
    <div className="min-h-dvh flex flex-col justify-center px-5 py-10 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-slate-100">西ローマ帝国末期</h1>
      <p className="text-sm text-slate-400 mt-2">
        {STARTING_YEAR}年から{ENDING_YEAR}年まで、全{ENDING_YEAR - STARTING_YEAR}ターン。
        帝国を1年でも長く保たせることが目的で、拡大は目的ではない。
      </p>
      <p className="text-xs text-slate-500 mt-3">
        1年に選べる手は2つまで。何を諦めるかを選ぶことになる。
      </p>

      <label className="mt-6 block">
        <span className="text-xs text-slate-400">皇帝の名前</span>
        <input
          type="text"
          value={rulerName}
          maxLength={RULER_NAME_MAX_LENGTH}
          onChange={(e) => setRulerName(e.target.value)}
          placeholder={DEFAULT_RULER_NAME}
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
        />
        <span className="mt-1 block text-[11px] text-slate-500">
          代替わりした皇帝の名は自動で付く。在位中はいつでも改名できる
        </span>
      </label>

      <div className="mt-6 space-y-2">
        {(['beginner', 'standard', 'veteran'] as Difficulty[]).map((difficulty) => (
          <button
            key={difficulty}
            onClick={() => onStart(difficulty, rulerName.trim() || DEFAULT_RULER_NAME)}
            className="w-full text-left rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 active:bg-slate-800 transition"
          >
            <div className="text-base font-semibold text-slate-100">
              {DIFFICULTY_LABELS[difficulty]}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{DIFFICULTY_DETAIL[difficulty]}</div>
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="text-xs text-slate-400">セーブデータから再開</span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onLoad(file);
            e.target.value = '';
          }}
          className="mt-1 block w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200"
        />
        {loadError && <span className="block text-xs text-red-400 mt-1">{loadError}</span>}
      </label>
    </div>
  );
}

export function ResultScreen({
  score,
  state,
  onRestart,
}: {
  score: ScoreResult;
  state: GameState;
  onRestart: () => void;
}) {
  const survived = score.status === 'survived';
  return (
    <div className="min-h-dvh flex flex-col justify-center px-5 py-10 max-w-lg mx-auto">
      <div className={`text-3xl font-bold ${survived ? 'text-emerald-400' : 'text-red-400'}`}>
        {survived ? '帝国は存続した' : '帝国は崩壊した'}
      </div>
      <div className="text-sm text-slate-400 mt-1">{score.finalYear}年まで到達</div>

      <dl className="mt-6 space-y-2">
        <Row label="スコア" value={Math.round(score.score).toLocaleString()} strong />
        <Row label="難易度" value={DIFFICULTY_LABELS[score.difficulty]} />
        <Row label="保持属州" value={`${score.provincesHeld}`} />
        <Row label="税基盤" value={score.taxBase.toFixed(0)} />
        <Row label="正統性" value={score.legitimacy.toFixed(0)} />
        <Row label="歴代皇帝" value={`${score.rulerCount}人`} />
        <Row label="継承危機" value={`${score.successionCrises}回`} />
        {score.abilitiesAdjusted && (
          <Row label="記録" value="調整済み（他のスコアと比較不可）" />
        )}
      </dl>

      <Chronicle state={state} />

      <button
        onClick={onRestart}
        className="mt-8 w-full rounded-lg bg-amber-500 text-slate-950 font-semibold py-3 active:bg-amber-400"
      >
        もう一度
      </button>
    </div>
  );
}

/**
 * 年代記。この帝国が何年保ち、誰が死に、何を売り渡したかを並べる。
 *
 * 点数はプレイの良し悪しを1つの数にまとめてしまうが、このゲームの
 * 目的は延命なので「どこまで保ったか」の経過のほうが結果に近い。
 * state から作るのでセーブを読み直しても同じものが出る
 */
function Chronicle({ state }: { state: GameState }) {
  const reigns = reignsOf(state);
  const events = state.firedEventIds
    .map((id) => findEvent(id))
    .filter((event): event is NonNullable<typeof event> => event !== undefined)
    .sort((a, b) => firstYearOf(a) - firstYearOf(b));
  const lost = (Object.keys(state.provinces) as ProvinceId[]).filter(
    (id) => state.provinces[id].control <= 0,
  );
  const settled = Object.values(state.factions).filter((f) => f.stance === 'settled');

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-slate-100">年代記</h2>

      <ol className="mt-2 space-y-1">
        {reigns.map((reign, index) => (
          <li key={index} className="flex gap-2 text-xs">
            <span className="tabular-nums text-slate-400 shrink-0">
              {reign.from}–{reign.to}
            </span>
            <span className="text-slate-200">
              {reign.name}
              <span className="text-slate-400">（{reign.note}）</span>
            </span>
          </li>
        ))}
      </ol>

      {events.length > 0 && (
        <ul className="mt-4 space-y-1">
          {events.map((event) => (
            <li key={event.id} className="text-xs text-amber-300">
              {event.title}
            </li>
          ))}
        </ul>
      )}

      {state.general.history.length > 0 && (
        <ol className="mt-4 space-y-1">
          {state.general.history.map((record, index) => (
            <li key={record.generalId} className="flex gap-2 text-xs">
              <span className="tabular-nums text-slate-400 shrink-0">
                {record.fromYear}–{record.toYear}
              </span>
              <span className="text-slate-300">
                軍司令官 第{index + 1}代（軍事 {record.military}・
                {GENERAL_END_LABELS[record.end]}）
              </span>
            </li>
          ))}
        </ol>
      )}

      <dl className="mt-4 space-y-1 text-xs">
        <ChronicleRow
          label="失った属州"
          value={lost.length > 0 ? lost.map((id) => PROVINCE_LABELS[id]).join('、') : 'なし'}
        />
        <ChronicleRow
          label="定住を許した勢力"
          value={
            settled.length > 0
              ? settled
                  .map(
                    (f) =>
                      `${FACTION_LABELS[f.id]}${
                        f.location === 'exterior' ? '' : `（${PROVINCE_LABELS[f.location]}）`
                      }`,
                  )
                  .join('、')
              : 'なし'
          }
        />
      </dl>
    </section>
  );
}

function ChronicleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-slate-400 shrink-0">{label}</dt>
      <dd className="text-slate-200">{value}</dd>
    </div>
  );
}

interface Reign {
  from: number;
  to: number;
  name: string;
  note: string;
}

/**
 * 歴代の在位期間。
 * history には没年しか無いので、前の代の没年を次の代の即位年とみなす
 */
function reignsOf(state: GameState): Reign[] {
  const reigns: Reign[] = [];
  let from = STARTING_YEAR;
  for (const record of state.dynasty.history) {
    reigns.push({
      from,
      to: record.year,
      name: record.name,
      note: `${record.cause === 'assassination' ? '暗殺' : '崩御'}・${
        record.outcome === 'crisis' ? '継承危機' : '嫡子が継承'
      }`,
    });
    from = record.year;
  }
  reigns.push({
    from,
    to: state.year,
    name: state.dynasty.ruler.name,
    note: state.status === 'collapsed' ? '帝国の終わり' : '在位のまま',
  });
  return reigns;
}

/** 並べ替え用。年が決まっていないイベントは発火可能になる年で見る */
function firstYearOf(event: { condition: { year?: number; minYear?: number } }): number {
  return event.condition.year ?? event.condition.minYear ?? 0;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-slate-800 pb-1.5">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-2xl font-bold text-slate-100' : 'text-sm text-slate-200'}`}>
        {value}
      </dd>
    </div>
  );
}
