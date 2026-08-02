import { chiefMilitary } from '../../core/homelands';
import { eastCommanderAt, persiaCommanderAt } from '../../core/east';
import type { GameState } from '../../core/types';
import {
  EAST_OWNER_LABELS,
  EAST_PROVINCE_LABELS,
  FACTION_LABELS,
  PROVINCE_LABELS,
  STANCE_LABELS,
} from '../catalogue';
import {
  eastEmperorAge,
  eastEmperorName,
  factionLeaderName,
  factionPortraitFile,
  persianKingAge,
  persianKingName,
} from '../leaders';
import { LeaderFigure } from './Portrait';
import type { InspectTarget } from './ProvinceMap';

/**
 * 地図で触れた相手の素性。
 *
 * 「諸国の顔ぶれ」は全勢力を一覧にするが、地図から辿れないと
 * どの色の土地が誰のものなのかが結び付かない。触れた土地の主を
 * その場で出すための札で、**表示だけの部品**。値はすべて
 * `GameState` と `core/` の関数から引く
 */
export function PowerCard({
  state,
  target,
  onClose,
}: {
  state: GameState;
  target: InspectTarget;
  onClose: () => void;
}) {
  const view = describe(state, target);

  return (
    <div
      className="roman-panel mt-2 rounded-sm p-3"
      style={{ borderColor: view.hostile ? 'var(--oxblood)' : 'var(--bronze)' }}
    >
      <div className="flex gap-3">
        {view.portrait && (
          <div
            className="shrink-0 w-20 rounded-sm overflow-hidden self-start"
            style={{ border: '1px solid var(--bronze)', background: 'var(--parchment)' }}
          >
            <LeaderFigure
              role={view.portrait.role}
              origin={view.portrait.origin}
              age={view.portrait.age}
              seedId={view.portrait.seedId}
              file={view.portrait.file}
              alt={`${view.name}の肖像`}
              className="w-full h-auto block"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>
                {view.title}
              </div>
              <div className="roman-heading text-sm truncate">{view.name}</div>
            </div>
            <button
              onClick={onClose}
              className="roman-panel shrink-0 rounded-sm px-2 py-1 text-[11px]"
              style={{ color: 'var(--ink-soft)' }}
            >
              閉じる
            </button>
          </div>

          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            {view.rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt style={{ color: 'var(--ink-soft)' }}>{label}</dt>
                <dd className="font-semibold" style={{ color: 'var(--ink)' }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {view.commander && (
            <div
              className="mt-2 rounded-sm px-2 py-1 text-[11px]"
              style={{ background: 'var(--parchment-dim)', color: 'var(--ink-soft)' }}
            >
              軍司令官{' '}
              <span className="font-semibold" style={{ color: 'var(--purple-deep)' }}>
                {view.commander.name}
              </span>
              <span> ・ 軍事 {view.commander.military}</span>
            </div>
          )}

          {view.note && (
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
              {view.note}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface CardView {
  title: string;
  name: string;
  hostile: boolean;
  rows: [string, string][];
  commander?: { name: string; military: number };
  note?: string;
  portrait?: {
    role: 'chief' | 'eastemperor' | 'shah';
    origin: 'barbarian' | 'hun' | 'east' | 'persia';
    age: 'youth' | 'adult' | 'elder';
    seedId: string;
    file?: string | null;
  };
}

/** 強大な勢力ほど老練な族長に見せる。「諸国の顔ぶれ」と同じ割り当て */
function chiefAge(strength: number): 'youth' | 'adult' | 'elder' {
  if (strength < 30) return 'youth';
  return strength >= 60 ? 'elder' : 'adult';
}

function describe(state: GameState, target: InspectTarget): CardView {
  if (target.kind === 'faction') {
    const faction = state.factions[target.id];
    const homeland = state.homelands[target.id];
    const age = chiefAge(faction.strength);
    const isHun = target.id === 'Huns';
    return {
      title: `${FACTION_LABELS[target.id]}の族長`,
      name: factionLeaderName(target.id, state.year),
      hostile: faction.stance === 'hostile',
      rows: [
        ['軍事', String(chiefMilitary(target.id, state.year))],
        ['戦力', String(Math.round(faction.strength))],
        ['態度', STANCE_LABELS[faction.stance]],
        [
          '所在',
          faction.location === 'exterior'
            ? homeland.name
            : PROVINCE_LABELS[faction.location],
        ],
        ['郷里', homeland.name],
        [
          '郷里の支配',
          homeland.owner === 'west'
            ? `自国 ${Math.round(homeland.control)}`
            : String(Math.round(homeland.control)),
        ],
      ],
      note:
        homeland.owner === 'west'
          ? '郷里を失った勢力は人が集まらず、戦力が伸びにくい'
          : '「軍事 → 蛮族の郷里へ遠征」でこの土地を攻められる。他の敵対勢力が加勢に来る',
      portrait: {
        role: 'chief',
        origin: isHun ? 'hun' : 'barbarian',
        age,
        seedId: `${target.id}:${factionLeaderName(target.id, state.year)}`,
        file: isHun ? null : factionPortraitFile(target.id, age),
      },
    };
  }

  if (target.kind === 'east') {
    const { east } = state;
    const held = east.provinces.filter((p) => p.owner === 'east');
    return {
      title: '東ローマ皇帝',
      name: eastEmperorName(state.year),
      hostile: east.stance === 'war',
      rows: [
        ['関係', String(Math.round(state.eastRelations))],
        ['状態', east.stance === 'war' ? '交戦中' : '和平'],
        ['野戦軍', east.provinces.length > 0 ? String(Math.round(east.army)) : '—'],
        [
          '東方属州',
          east.provinces.length > 0
            ? `${held.length} / ${east.provinces.length}`
            : '—',
        ],
      ],
      commander: eastCommanderAt(state.year),
      note:
        east.provinces.length > 0
          ? east.provinces
              .map((p) => `${EAST_PROVINCE_LABELS[p.id]}: ${EAST_OWNER_LABELS[p.owner]}`)
              .join(' / ')
          : '史実シナリオの東ローマは属州も軍も持たず、関係の数値としてだけ働く',
      portrait: {
        role: 'eastemperor',
        origin: 'east',
        age: eastEmperorAge(state.year),
        seedId: `east${eastEmperorName(state.year)}`,
      },
    };
  }

  const { persia } = state;
  return {
    title: 'サーサーン朝ペルシア王',
    name: persianKingName(state.year),
    hostile: persia.intervened,
    rows: [
      ['戦力', persia.intervened ? String(Math.round(persia.strength)) : '—'],
      ['動向', persia.intervened ? '介入中' : '静観'],
      ['介入年', persia.interventionYear === null ? '—' : `${persia.interventionYear}年`],
      ['奪った属州', String(persia.seizedProvinces.length)],
    ],
    commander: persiaCommanderAt(state.year),
    note: persia.intervened
      ? '一度動き出したペルシアは、東ローマと講和しても引かない'
      : 'ローマ同士が長く争っているのを見てから動き出す',
    portrait: {
      role: 'shah',
      origin: 'persia',
      age: persianKingAge(state.year),
      seedId: `persia${persianKingName(state.year)}`,
    },
  };
}
