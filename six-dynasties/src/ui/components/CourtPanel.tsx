import { useState } from 'react';

import { DEFAULT_CHIEFTAIN_ABILITIES, chieftainOf } from '../../core/factions';
import { provincesToProclaim } from '../../core/constants';
import { houseName } from '../../core/diplomacy';
import { traitName, traitNote } from '../../core/officers';
import type {
  Abilities,
  GameState,
  OfficerAbilities,
  Official,
  ProvinceId,
} from '../../core/types';
import { FACTION_LABELS, PROVINCE_LABELS, STANCE_LABELS } from '../catalogue';
import { Portrait, officerRole, seededAge } from './Portrait';

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

/** 武将の五能力。統率・武力・知力・政治・魅力を小さく並べる */
export function FiveRow({ abilities }: { abilities: OfficerAbilities }) {
  const cells: [string, number][] = [
    ['統', abilities.leadership],
    ['武', abilities.might],
    ['知', abilities.intellect],
    ['政', abilities.politics],
    ['魅', abilities.charm],
  ];
  return (
    <span className="inline-flex gap-1 align-middle">
      {cells.map(([label, value]) => (
        <span
          key={label}
          className="text-[10px] tabular-nums px-1 rounded-[2px]"
          style={{
            backgroundColor: value >= 9 ? 'rgba(208,166,63,0.3)' : 'rgba(0,0,0,0.06)',
            border: '1px solid var(--bamboo)',
            fontWeight: value >= 9 ? 700 : 400,
          }}
        >
          {label}
          {value}
        </span>
      ))}
    </span>
  );
}

/** 忠誠の帯。細っているものだけ朱にする */
function LoyaltyBar({ loyalty }: { loyalty: number }) {
  const low = loyalty < 30;
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span
        className="inline-block rounded-[1px]"
        style={{ width: 34, height: 5, backgroundColor: 'rgba(0,0,0,0.12)' }}
      >
        <span
          className="block rounded-[1px]"
          style={{
            width: `${Math.max(0, Math.min(100, loyalty))}%`,
            height: '100%',
            backgroundColor: low ? 'var(--cinnabar)' : 'var(--jade)',
          }}
        />
      </span>
      <span
        className="text-[10px] tabular-nums"
        style={{ color: low ? 'var(--cinnabar)' : 'var(--ink-soft)' }}
      >
        忠{Math.round(loyalty)}
      </span>
    </span>
  );
}

/** 武将の一行。名簿でも席でも使い回す */
export function OfficerLine({ officer, post }: { officer: Official; post?: string }) {
  return (
    <li className="text-[12px] flex gap-2">
      {/* 顔は席ではなく人で決まる。官職は下の札のほうで見せる */}
      <Portrait
        spec={{
          seed: officer.id,
          role: officerRole(officer.abilities),
          age: seededAge(officer.id, 26, 64),
        }}
        size={38}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="font-semibold shrink-0">{officer.name}</span>
          {post !== undefined && (
            <span className="text-[10px] px-1 rounded-[2px] han-seal">{post}</span>
          )}
          <FiveRow abilities={officer.abilities} />
          <span
            className="text-[10px] px-1 rounded-[2px]"
            style={{ border: '1px solid var(--gold)', color: 'var(--gold)' }}
            title={traitNote(officer.trait)}
          >
            {traitName(officer.trait)}
          </span>
          <LoyaltyBar loyalty={officer.loyalty} />
        </div>
        <div className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
          野心{officer.ambition}／{officer.historical ? '史実の人物' : '無名の士'}／
          あと{officer.tenure}年
        </div>
      </div>
    </li>
  );
}

/**
 * 武将の名簿。
 *
 * **官に就いている者と、配下だが無官の者を分けて並べる。**
 * 個性が効くのは官に就いている者だけなので、そこが見えないと
 * 「抱えているのに何も起きない」理由が分からない
 */
export function RosterPanel({ state }: { state: GameState }) {
  const idle = state.candidates.filter((o) => o.retained);
  const marshal = state.marshal.holder;
  const chancellor = state.chancellor;
  const inspectors = (Object.keys(state.inspectors) as ProvinceId[])
    .map((id) => ({ id, officer: state.inspectors[id] }))
    .filter((x): x is { id: ProvinceId; officer: Official } => x.officer !== undefined);

  if (marshal === null && chancellor === null && inspectors.length === 0 && idle.length === 0) {
    return (
      <section className="han-panel rounded-sm px-3 py-2">
        <h2 className="han-heading text-sm">武将</h2>
        <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
          仕えている者がいない。「行動 → 人事」から在野の士を登用できる。
          個性が効くのは官に就けた者だけで、抱えているだけでは何も動かない
        </p>
      </section>
    );
  }

  return (
    <section className="han-panel rounded-sm px-3 py-2">
      <h2 className="han-heading text-sm">武将</h2>
      <ul className="mt-1.5 space-y-1.5">
        {marshal !== null && <OfficerLine officer={marshal} post="都督" />}
        {chancellor !== null && (
          <OfficerLine officer={chancellor} post="録尚書事" />
        )}
        {inspectors.map(({ id, officer }) => (
          <OfficerLine key={id} officer={officer} post={`${PROVINCE_LABELS[id]}刺史`} />
        ))}
        {idle.map((officer) => (
          <OfficerLine key={officer.id} officer={officer} post="無官" />
        ))}
      </ul>
      {marshal !== null && marshal.competence >= 8 && (
        <p className="mt-1.5 text-[11px]" style={{ color: 'var(--cinnabar)' }}>
          有能な将ほど戦勝の名を持ち去り、天命を余分に削り、位を狙う目も増える
        </p>
      )}
      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        統＝統率、武＝武力、知＝知力、政＝政治、魅＝魅力。
        都督は統率が、刺史と録尚書事は政治が問われる。
        **個性が効くのは官に就けた者だけ。**
        忠誠は年ごとに冷め、尽きれば去る（州を預けていればその州ごと離れる）
      </p>
    </section>
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
      <div className="flex items-start justify-between gap-2">
        <Portrait
          spec={{
            seed: ruler.id,
            role: 'emperor',
            age: ruler.age,
            hu: ruler.lineage === 'mixed',
          }}
          size={64}
        />
        <div className="min-w-0 flex-1">
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

/**
 * 皇后。
 *
 * **迎えているあいだ毎年働く。** 婚姻を「その年の帰順を買う手」に留めると、
 * 士族に爵位を配ることと王氏の女を娶ることの区別がつかない。
 * 后の人望は、その出自に見合う帰順の減りだけを和らげる
 */
export function ConsortPanel({ state }: { state: GameState }) {
  const consort = state.dynasty.consort;
  if (consort === null) {
    return (
      <section className="han-panel rounded-sm px-3 py-2">
        <h2 className="han-heading text-sm">皇后</h2>
        <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
          空位。「行動 → 官職」から士族の家門・胡族・北朝のいずれかと婚姻を結べる。
          迎えた后は毎年その出自の帰順を支え、子が生まれた年にもう一度効く
        </p>
      </section>
    );
  }

  const origin =
    consort.kind === 'gentry'
      ? `士族 ${consort.houseId === null ? '' : houseName(consort.houseId)}`
      : consort.kind === 'tribe'
        ? `和親 ${consort.factionId === null ? '' : FACTION_LABELS[consort.factionId]}`
        : '北朝の公主';
  const effect =
    consort.kind === 'gentry'
      ? '士族の支持の自然減を和らげている'
      : consort.kind === 'tribe'
        ? '給が絶えた年の胡族の帰順の落ちを和らげている'
        : '天命の自然減を和らげている';

  return (
    <section className="han-panel rounded-sm px-3 py-2">
      <h2 className="han-heading text-sm">皇后</h2>
      <div className="mt-1.5 flex gap-2 items-start">
        <Portrait
          spec={{
            seed: consort.id,
            role: 'empress',
            age: consort.age + (state.year - consort.marriedYear),
            female: true,
            hu: consort.kind !== 'gentry',
          }}
          size={52}
        />
        <div className="min-w-0 flex-1 text-[12px]">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="font-semibold">{consort.name}</span>
            <AbilityRow abilities={consort.abilities} />
            <span className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>
              {consort.age + (state.year - consort.marriedYear)}歳
            </span>
          </div>
          <div className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            {origin}／{consort.marriedYear}年に迎えた
          </div>
          <div className="text-[11px]" style={{ color: 'var(--jade)' }}>
            人望{consort.abilities.charisma} — {effect}
          </div>
          {state.dynasty.pendingMarriages.length > 0 && (
            <div className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
              {state.dynasty.pendingMarriages[0].dueYear}年に子が生まれれば、縁はもう一度効く
            </div>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        代が替われば后も替わる。皇后を迎えているあいだは子の生まれる目も上がる
      </p>
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
          <li key={prince.id} className="text-[12px] flex gap-2">
            <Portrait
              spec={{ seed: prince.id, role: 'prince', age: seededAge(prince.id, 19, 58) }}
              size={38}
            />
            <div className="min-w-0 flex-1">
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
            </div>
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
            <li key={faction.id} className="text-[12px] flex gap-2">
              <Portrait
                spec={{
                  seed: chieftain?.name ?? faction.id,
                  role: 'chieftain',
                  age: seededAge(chieftain?.name ?? faction.id, 24, 62),
                  hu: true,
                }}
                size={40}
              />
              <div className="min-w-0 flex-1">
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
      <div className="mt-1 flex gap-2 items-start">
        <Portrait
          spec={{
            seed: north.rulerName,
            role: 'northRuler',
            age: seededAge(north.rulerName, 26, 60),
            hu: true,
          }}
          size={44}
        />
        <p className="text-[12px]">
          <span style={{ color: 'var(--ink-soft)' }}>主 </span>
          {north.rulerName}（軍事{north.rulerMilitary}）
          <span style={{ color: 'var(--ink-soft)' }}> ／ 兵 </span>
          <span className="tabular-nums font-semibold">{Math.round(north.strength)}</span>
        </p>
      </div>
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
            <li
              key={i}
              className="text-[11px] flex items-center gap-1.5"
              style={{ color: 'var(--ink-soft)' }}
            >
              {/* 顔は在位中に見たものと同じ。並べると代の移りが読める */}
              <Portrait
                spec={{
                  seed: record.id,
                  role: 'emperor',
                  age: record.age,
                }}
                size={26}
              />
              <span>
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
              </span>
            </li>
          ))}
      </ul>
    </section>
  );
}
