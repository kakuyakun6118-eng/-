import { ENDING_YEAR, STARTING_YEAR } from '../../core/constants';
import type { Difficulty, ScoreResult } from '../../core/types';
import { DIFFICULTY_LABELS } from '../catalogue';

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
  onStart: (difficulty: Difficulty) => void;
  onLoad: (file: File) => void;
  loadError: string | null;
}) {
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

      <div className="mt-8 space-y-2">
        {(['beginner', 'standard', 'veteran'] as Difficulty[]).map((difficulty) => (
          <button
            key={difficulty}
            onClick={() => onStart(difficulty)}
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
  onRestart,
}: {
  score: ScoreResult;
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

      <button
        onClick={onRestart}
        className="mt-8 w-full rounded-lg bg-amber-500 text-slate-950 font-semibold py-3 active:bg-amber-400"
      >
        もう一度
      </button>
    </div>
  );
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
