import { useRef, useState } from 'react';

import { DIFFICULTY_LABELS, ENDING_YEAR, START_YEAR } from '../../core/constants';
import type { Difficulty, GameState, ScoreResult } from '../../core/types';

const DIFFICULTY_NOTES: Record<Difficulty, string> = {
  beginner: '災厄はめったに起きず、収入も多い。まず三百年の形を掴むために',
  standard: '調整の基準。史実より朝廷に有利で、災厄は半分ほどしか起きない',
  veteran: '史実に近い。永嘉の乱も侯景の乱もほぼ確実に起き、南朝は呑まれていく',
};

export function TitleScreen({
  onStart,
  onLoad,
  onResume,
  resumable,
  loadError,
}: {
  onStart: (difficulty: Difficulty, rulerName: string) => void;
  onLoad: (file: File) => void;
  onResume: () => void;
  resumable: GameState | null;
  loadError: string | null;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [name, setName] = useState('恵帝衷');
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="han-fret" />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-4">
        <header className="text-center">
          <h1 className="han-title text-2xl">天下分裂</h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            {START_YEAR}年 八王の乱 — {ENDING_YEAR}年 隋の統一
          </p>
          <div className="han-rule my-3" />
          <p className="text-[12px] leading-relaxed text-left" style={{ color: 'var(--ink-soft)' }}>
            <strong style={{ color: 'var(--ink)' }}>あなたは中華の皇帝である。</strong>
            晋は魏の孤立を戒めて宗室に兵を与えた。国境はそれで守れたが、
            与えた兵はそのまま帝位を狙う手勢になった。
            塞内にはすでに匈奴・羯・氐・羌が住んでいる。
            <br />
            <br />
            打てる手は1年に2つだけ。
            <strong style={{ color: 'var(--ink)' }}>
              中央が兵を握れば辺境が落ち、辺境に兵を預ければ中央が倒れる。
            </strong>
            {' '}胡族を義従として雇えば戦線は安く埋まるが、給が絶えれば寝返る。
            <br />
            <br />
            都を失えば朝廷は江南へ移る。それは敗北ではない — 東晋はそこから百年続いた。
            <br />
            <br />
            <strong style={{ color: 'var(--ink)' }}>藩王が洛陽を陥とせば、その王が帝位に即く。</strong>
            異民族の首長も、州を得れば帝を称して国号を号する — 野心の高い民は一州で、
            低い民も三州で必ず。天下に帝が並び立つのがこの三百年である。
            <br />
            <br />
            589年までに天下をひとつにできなければ、統一するのは北の隋になる。
          </p>
        </header>

        {resumable !== null && (
          <section className="han-panel-alert rounded-sm px-3 py-2.5">
            <div className="text-[13px] font-semibold">
              続きが残っている — {resumable.dynasty.houseName}・{resumable.year}年
            </div>
            <button onClick={onResume} className="han-button w-full rounded-sm py-2.5 mt-2">
              続きから
            </button>
          </section>
        )}

        <section className="han-panel rounded-sm px-3 py-2.5">
          <h2 className="han-heading text-sm">難易度</h2>
          <div className="grid grid-cols-3 gap-1.5 mt-1.5">
            {(['beginner', 'standard', 'veteran'] as Difficulty[]).map((id) => (
              <button
                key={id}
                onClick={() => setDifficulty(id)}
                className="py-2 rounded-[2px] text-[13px]"
                style={{
                  backgroundColor: difficulty === id ? 'var(--imperial)' : 'rgba(0,0,0,0.05)',
                  color: difficulty === id ? 'var(--silk)' : 'var(--ink-soft)',
                  border: '1px solid var(--bamboo)',
                  fontWeight: difficulty === id ? 700 : 400,
                }}
              >
                {DIFFICULTY_LABELS[id]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            {DIFFICULTY_NOTES[difficulty]}
          </p>
        </section>

        <section className="han-panel rounded-sm px-3 py-2.5">
          <h2 className="han-heading text-sm">初代の名</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1.5 rounded-[2px] px-2 py-1.5 text-[14px]"
            style={{
              backgroundColor: 'rgba(255,255,255,0.6)',
              border: '1px solid var(--bamboo)',
              color: 'var(--ink)',
            }}
          />
          <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            291年の帝は恵帝。史書に「何ぞ肉糜を食らわざる」と伝わる人物で、
            軍事・統治・人望のいずれも最低に置いてある
          </p>
        </section>

        <button
          onClick={() => onStart(difficulty, name)}
          className="han-button w-full rounded-sm py-3.5"
        >
          {START_YEAR}年から始める
        </button>

        <div className="text-center">
          <button
            onClick={() => fileInput.current?.click()}
            className="text-[12px] underline"
            style={{ color: 'var(--ink-soft)' }}
          >
            保存した記録を読み込む
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onLoad(file);
            }}
          />
          {loadError && (
            <p className="mt-1 text-[12px]" style={{ color: 'var(--cinnabar)' }}>
              {loadError}
            </p>
          )}
        </div>
      </main>
      <div className="han-fret" />
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
  const title =
    score.status === 'unified'
      ? '天下統一'
      : score.status === 'survived'
        ? '存続 — されど天下は隋のものに'
        : '滅亡';

  const verdict =
    score.status === 'unified'
      ? `${score.unifiedYear}年、${score.houseName}は割れた天下をふたたびひとつにした。史実で隋がこれを成し遂げたのは589年である。`
      : score.status === 'survived'
        ? `${score.houseName}は589年まで保った。だが天下をひとつにしたのは北の隋であり、南朝はやがて呑まれる。史実の陳と同じ結末である。`
        : `${score.finalYear}年、${score.houseName}は絶えた。${
            score.crossedSouthYear !== null
              ? `${score.crossedSouthYear}年に江南へ移ってから、`
              : '北の都を保ったまま、'
          }ここで途切れたことになる。`;

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="han-fret" />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-3">
        <h1 className="han-title text-2xl text-center">{title}</h1>
        <div className="han-rule" />
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          {verdict}
        </p>

        <section className="han-panel rounded-sm px-3 py-2.5">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
            <dt style={{ color: 'var(--ink-soft)' }}>終局の年</dt>
            <dd className="tabular-nums text-right">{score.finalYear}年</dd>
            <dt style={{ color: 'var(--ink-soft)' }}>保った州</dt>
            <dd className="tabular-nums text-right">{score.provincesHeld} / 15</dd>
            <dt style={{ color: 'var(--ink-soft)' }}>戸口</dt>
            <dd className="tabular-nums text-right">{Math.round(score.taxBase)}</dd>
            <dt style={{ color: 'var(--ink-soft)' }}>天命</dt>
            <dd className="tabular-nums text-right">{Math.round(score.mandate)}</dd>
            <dt style={{ color: 'var(--ink-soft)' }}>経た帝</dt>
            <dd className="tabular-nums text-right">{score.rulerCount}代</dd>
            <dt style={{ color: 'var(--ink-soft)' }}>王朝の交替</dt>
            <dd className="tabular-nums text-right">{score.houseChanges}回</dd>
            <dt style={{ color: 'var(--ink-soft)' }}>南渡</dt>
            <dd className="tabular-nums text-right">
              {score.crossedSouthYear === null ? 'せず' : `${score.crossedSouthYear}年`}
            </dd>
            <dt style={{ color: 'var(--ink-soft)' }}>難易度</dt>
            <dd className="text-right">{DIFFICULTY_LABELS[score.difficulty]}</dd>
          </dl>
          <div className="han-rule my-2" />
          <div className="flex items-baseline justify-between">
            <span className="han-heading text-sm">功業</span>
            <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--gold)' }}>
              {score.score.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            保った州 × 戸口 × 天命。難易度が違えば比べられない
          </p>
        </section>

        {state.dynasty.history.length > 0 && (
          <section className="han-panel rounded-sm px-3 py-2.5">
            <h2 className="han-heading text-sm">経てきた王朝</h2>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
              {[
                ...new Set([
                  ...state.dynasty.history.map((h) => h.houseName),
                  state.dynasty.houseName,
                ]),
              ].join(' → ')}
            </p>
          </section>
        )}

        <button onClick={onRestart} className="han-button w-full rounded-sm py-3.5">
          もう一度
        </button>
      </main>
      <div className="han-fret" />
    </div>
  );
}
