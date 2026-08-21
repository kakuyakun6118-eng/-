import { useState } from 'react';

import { DEFAULT_CHIEFTAIN_ABILITIES, chieftainOf } from '../../core/factions';
import { provincesToProclaim } from '../../core/constants';
import type { Abilities, GameState } from '../../core/types';
import { FACTION_LABELS, PROVINCE_LABELS, STANCE_LABELS } from '../catalogue';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-[10px]" style={{ color: 'rgba(231, 220, 198, 0.7)' }}>
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--gold-bright)' }}>
        {value}
      </div>
    </div>
  );
}

/** 能力の三つ組。諸王と首長で使い回す小さな並び */
function AbilityRow({ abilities, ambition }: { abilities: Abilities; ambition?: number }) {
  const cells: { label: string; value: number; tone?: string }[] = [
    { label: '軍', value: abilities.military },
    { label: '政', value: abilities.administration },
    { label: '望', value: abilities.charisma },
  ];
  if (ambition !== undefined) cells.push({ label: '野', value: ambition, tone: 'var(--cinnabar)' });

  return (
    <span className="inline-flex gap-1 align-middle">
      {cells.map((cell) => (
        <span
          key={cell.label}
          className="text-[10px] tabular-nums px-1 rounded-[2px]"
          style={{
            backgroundColor: 'rgba(0,0,0,0.06)',
            border: '1px solid var(--bamboo)',
            color: cell.tone ?? 'var(--ink)',
          }}
        >
          {cell.label}
          {cell.value}
        </span>
      ))}
    </span>
  );
}

/** 帝。名は付け替えられる（表示だけの変更で、どの計算式にも影響しない） */
export function RulerPanel({
  state,
  onRename,
}: {
  state: GameState;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ruler = state.dynasty.ruler;

  return (
    <section className="han-panel-dark rounded-sm px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[11px]" style={{ color: 'rgba(231, 220, 198, 0.7)' }}>
            {state.dynasty.houseName}（{state.dynasty.foundedYear}年〜）
          </span>
          <h2 className="text-base font-bold truncate" style={{ color: 'var(--silk)' }}>
            {ruler.name}
            <span className="ml-2 text-[11px] font-normal">
              {ruler.age}歳{ruler.lineage === 'mixed' && '・混血'}
            </span>
          </h2>
        </div>
        <button
          onClick={() => {
            setDraft(ruler.name);
            setEditing((v) => !v);
          }}
          className="text-[11px] shrink-0 px-1.5 py-0.5 rounded-[2px]"
          style={{ border: '1px solid var(--gold)', color: 'var(--gold-bright)' }}
        >
          改名
        </button>
      </div>

      {editing && (
        <div className="flex gap-1.5 mt-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 min-w-0 rounded-[2px] px-2 py-1 text-[13px]"
            style={{ backgroundColor: 'rgba(231, 220, 198, 0.92)', color: 'var(--ink)' }}
            placeholder="帝の名"
          />
          <button
            onClick={() => {
              onRename(draft);
              setEditing(false);
            }}
            className="han-button rounded-[2px] px-2.5 text-[12px]"
          >
            改める
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mt-2">
        <Stat label="軍事" value={ruler.abilities.military} />
        <Stat label="統治" value={ruler.abilities.administration} />
        <Stat label="人望" value={ruler.abilities.charisma} />
      </div>

      <div className="mt-2 text-[11px]" style={{ color: 'rgba(231, 220, 198, 0.8)' }}>
        軍事は戦の守り、統治は税収と天命の保ち、人望は帰順と交渉に効く。
        新しい資源ではなく、既存の計算に掛かる補正として働く
      </div>
    </section>
  );
}

/** 都督と録尚書事。実権はこの二席にある */
export function OfficersPanel({ state }: { state: GameState }) {
  const marshal = state.marshal.holder;
  const chancellor = state.chancellor;

  return (
    <section className="han-panel rounded-sm px-3 py-2">
      <h2 className="han-heading text-sm">朝廷の要職</h2>
      <ul className="mt-1.5 space-y-1.5 text-[12px]">
        <li>
          <span className="font-semibold">都督中外諸軍事</span>
          <span style={{ color: 'var(--ink-soft)' }}>
            {' — '}
            {marshal
              ? `${marshal.name}（軍事${marshal.competence}・野心${marshal.ambition}・残り${marshal.tenure}年）`
              : '空位。守りが弱くなっている'}
          </span>
          {marshal && marshal.competence >= 8 && (
            <div className="text-[11px]" style={{ color: 'var(--cinnabar)' }}>
              有能な将ほど戦勝の名を持ち去り、天命を余分に削り、位を狙う目も増える
            </div>
          )}
        </li>
        <li>
          <span className="font-semibold">録尚書事</span>
          <span style={{ color: 'var(--ink-soft)' }}>
            {' — '}
            {chancellor
              ? `${chancellor.name}（能力${chancellor.competence}・野心${chancellor.ambition}・残り${chancellor.tenure}年）`
              : '空位'}
          </span>
        </li>
      </ul>
    </section>
  );
}

/** 宗室の諸王。八王の乱の当事者たち */
export function PrincePanel({ state }: { state: GameState }) {
  if (state.princes.length === 0) return null;
  return (
    <section
      className={state.princes.some((p) => p.inRevolt) ? 'han-panel-alert rounded-sm px-3 py-2' : 'han-panel rounded-sm px-3 py-2'}
    >
      <h2 className="han-heading text-sm">宗室の諸王</h2>
      <ul className="mt-1.5 space-y-1">
        {state.princes.map((prince) => (
          <li key={prince.id} className="text-[12px]">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-semibold shrink-0">{prince.name}</span>
              <AbilityRow abilities={prince.abilities} ambition={prince.ambition} />
              <span className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                {PROVINCE_LABELS[prince.province]}／兵 {Math.round(prince.troops)}
              </span>
              {prince.inRevolt && (
                <span className="font-bold" style={{ color: 'var(--cinnabar)' }}>
                  挙兵
                </span>
              )}
            </div>
            {prince.inRevolt && (
              <div className="text-[11px]" style={{ color: 'var(--cinnabar)' }}>
                兵を集めて都を衝く。陥とせばこの王が帝位に即く
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        軍＝軍事、政＝統治、望＝人望、野＝野心。
        兵権を与えれば国境は守れるが、与えた兵はそのまま位を狙う手勢になる。
        削れば中央は強くなるが、帰順が落ちて挙兵を招く
      </p>
    </section>
  );
}

/** 胡族の一覧。いまどこにいて、どういう関係か */
export function TribePanel({ state }: { state: GameState }) {
  const factions = Object.values(state.factions).sort((a, b) => b.strength - a.strength);
  return (
    <section className="han-panel rounded-sm px-3 py-2">
      <h2 className="han-heading text-sm">胡族</h2>
      <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-soft)' }}>
        野心が高い民は一州で帝を称し、低い民も三州を得れば必ず称する
      </p>
      <ul className="mt-1.5 space-y-1">
        {factions.map((faction) => {
          const chieftain = chieftainOf(faction.id, state.year);
          return (
            <li key={faction.id} className="text-[12px]">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-semibold shrink-0">{FACTION_LABELS[faction.id]}</span>
                {faction.proclaimedYear !== null && (
                  <span
                    className="han-seal rounded-[2px] px-1 text-[10px] font-bold shrink-0"
                    title={`${faction.proclaimedYear}年に帝を称した`}
                  >
                    {faction.kingdomName ?? '帝'}
                  </span>
                )}
                <AbilityRow
                  abilities={chieftain?.abilities ?? DEFAULT_CHIEFTAIN_ABILITIES}
                  ambition={faction.ambition}
                />
                <span className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                  兵 {Math.round(faction.strength)}
                </span>
                <span
                  style={{
                    color:
                      faction.stance === 'hostile'
                        ? 'var(--cinnabar)'
                        : faction.stance === 'auxiliary'
                          ? 'var(--jade)'
                          : 'var(--ink-soft)',
                  }}
                >
                  {STANCE_LABELS[faction.stance]}
                </span>
              </div>
              <div className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                {faction.location === 'exterior' ? '塞外' : PROVINCE_LABELS[faction.location]}
                {chieftain && `／首長 ${chieftain.name}`}
                {faction.proclaimedYear === null
                  ? `／${provincesToProclaim(faction.ambition)}州を得れば帝を称する`
                  : `／${faction.emperorName ?? '首長'}が${faction.proclaimedYear}年に帝を称した`}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 北朝。華北をまとめた朝廷 */
export function NorthPanel({ state }: { state: GameState }) {
  if (state.north === null) {
    return (
      <section className="han-panel rounded-sm px-3 py-2">
        <h2 className="han-heading text-sm">北朝</h2>
        <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
          華北はまだ胡族の諸国に分かれている。どれかが北をまとめれば、
          州ごとに削り合う敵ではなく、もう一つの朝廷が南を向く
        </p>
      </section>
    );
  }

  const north = state.north;
  return (
    <section className="han-panel-alert rounded-sm px-3 py-2">
      <h2 className="han-heading text-sm" style={{ color: 'var(--cinnabar)' }}>
        北朝 — {north.name}（{north.foundedYear}年〜）
      </h2>
      <p className="mt-1 text-[12px]">
        <span style={{ color: 'var(--ink-soft)' }}>主 </span>
        {north.rulerName}（軍事{north.rulerMilitary}）
        <span style={{ color: 'var(--ink-soft)' }}> ／ 兵 </span>
        <span className="tabular-nums font-semibold">{Math.round(north.strength)}</span>
      </p>
      <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        {north.offensiveSince === null
          ? 'まだ南征は始まっていない'
          : `${north.offensiveSince}年から南征を続けている`}
        {north.splitYear !== null && `／${north.splitYear}年に東西へ裂けた`}
      </p>
      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--cinnabar)' }}>
        589年までに天下を統一できなければ、統一するのはこちらになる
      </p>
    </section>
  );
}

/** 歴代の帝。家系図の代わりに年代記として読ませる */
export function ChroniclePanel({ state }: { state: GameState }) {
  if (state.dynasty.history.length === 0) return null;
  return (
    <section className="han-panel rounded-sm px-3 py-2">
      <h2 className="han-heading text-sm">歴代</h2>
      <ul className="mt-1.5 space-y-0.5">
        {state.dynasty.history
          .slice()
          .reverse()
          .map((record, i) => (
            <li key={i} className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
              <span className="tabular-nums">{record.year}年</span>{' '}
              <span style={{ color: 'var(--ink)' }}>
                {record.houseName}・{record.name}
              </span>{' '}
              {record.age}歳で
              {record.cause === 'assassination' ? '弑された' : '崩じた'}（
              {record.outcome === 'heir'
                ? '嫡子が継ぐ'
                : record.outcome === 'kin'
                  ? '傍系が継ぐ'
                  : record.outcome === 'usurped'
                    ? '藩王が位を奪う'
                    : '王朝が替わる'}
              ）
            </li>
          ))}
      </ul>
    </section>
  );
}
