import { useState } from 'react';

import { MAX_ACTIONS_PER_TURN } from '../../core/constants';
import type {
  BarbarianFactionId,
  EastProvinceId,
  GameState,
  PlayerAction,
  ProvinceId,
} from '../../core/types';
import {
  ACTION_TEMPLATES,
  EAST_OWNER_LABELS,
  EAST_PROVINCE_LABELS,
  FACTION_LABELS,
  MARRIAGE_EAST_REQUIREMENT,
  PROVINCE_LABELS,
  type ActionTemplate,
} from '../catalogue';
import { invadableEastProvinces } from '../../core/east';
import { consumesActionSlot } from '../../core/tick';
import { actionKey } from '../useGame';

interface Props {
  state: GameState;
  selected: PlayerAction[];
  onToggle: (action: PlayerAction, key: string) => void;
}

const CATEGORIES = ['交渉', '雇用', '軍事', '内政', '東帝国'];

export function ActionPanel({ state, selected, onToggle }: Props) {
  const [openCategory, setOpenCategory] = useState<string>('軍事');
  // 要求への応答は枠を消費しないので、枠の残りには数えない
  const full = selected.filter(consumesActionSlot).length >= MAX_ACTIONS_PER_TURN;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setOpenCategory(category)}
            className={
              openCategory === category
                ? 'roman-button px-3 py-1.5 rounded-full text-xs transition'
                : 'roman-panel px-3 py-1.5 rounded-full text-xs font-medium transition'
            }
          >
            {category}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {ACTION_TEMPLATES.filter(
          (t) =>
            t.category === openCategory &&
            // シナリオ指定のある行動は、そのシナリオでだけ出す
            (t.scenario === undefined || t.scenario === state.scenario),
        ).map((template) => (
          <ActionCard
            key={template.id}
            template={template}
            state={state}
            selected={selected}
            full={full}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

function ActionCard({
  template,
  state,
  selected,
  full,
  onToggle,
}: {
  template: ActionTemplate;
  state: GameState;
  selected: PlayerAction[];
  full: boolean;
  onToggle: (action: PlayerAction, key: string) => void;
}) {
  const provinceIds = Object.keys(state.provinces) as ProvinceId[];
  const allFactionIds = Object.keys(state.factions) as BarbarianFactionId[];
  /*
   * 郷里への遠征は、まだ取っていない土地だけが相手になる。
   * 相手の選び方が「勢力を選ぶ」点では他の交渉と同じなので、
   * factionFilter と同じ仕組みで候補を絞る
   */
  const baseIds =
    template.target === 'homeland'
      ? allFactionIds.filter((id) => {
          const homeland = state.homelands[id];
          // 郷里を持たない勢力は攻め込む先が無い
          if (homeland === undefined || homeland.owner === 'west') return false;
          // 給金を払っている相手の郷里は攻められない
          return state.factions[id].stance !== 'foederati';
        })
      : allFactionIds;
  const factionIds = template.factionFilter
    ? baseIds.filter((id) => template.factionFilter!(state, id))
    : baseIds;

  const [province, setProvince] = useState<ProvinceId>('Italia');
  const [eastProvince, setEastProvince] = useState<EastProvinceId>('Thracia');
  /*
   * 攻め込める東方属州は状況で変わる（講和するとペルシアが握る州だけになる）。
   * 選択中の州が候補から外れたら先頭に読み替え、無効な相手を掴んだまま
   * 枠を捨てることがないようにする
   */
  const invadable = invadableEastProvinces(state);
  const eastTarget = invadable.some((p) => p.id === eastProvince)
    ? eastProvince
    : invadable[0]?.id;
  const [faction, setFaction] = useState<BarbarianFactionId>('Visigoths');
  const [east, setEast] = useState(false);

  /*
   * 選択中の相手が候補から外れることがある（要求に答えた直後など）。
   * その場合は先頭の候補に読み替え、無効な相手を掴んだままにしない
   */
  const target = factionIds.includes(faction) ? faction : factionIds[0];

  const blocked = template.blockedReason(state);
  const action = template.build({
    province,
    faction: target,
    east: template.target === 'marriage' ? east : undefined,
    eastProvince: eastTarget,
  });
  const key = action ? actionKey(action) : template.id;
  const isSelected = selected.some((a) => actionKey(a) === key);
  // 枠を消費しない行動は、枠が埋まっていても選べる
  const usesSlot = action === null || consumesActionSlot(action);
  const disabled = blocked !== null || action === null || (full && usesSlot && !isSelected);

  return (
    <div
      className="roman-panel rounded-sm p-3"
      style={
        isSelected
          ? { borderColor: 'var(--gold-bright)', boxShadow: '0 0 0 2px rgba(216, 171, 60, 0.45)' }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="roman-heading text-sm">
            {template.label}
            {template.cost !== null && (
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--gold)' }}>
                {template.cost} ソリドゥス
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
            {template.detail}
          </p>
        </div>
        <button
          onClick={() => action && onToggle(action, key)}
          disabled={disabled}
          className={
            disabled && !isSelected
              ? 'shrink-0 px-3 py-1.5 rounded-sm text-xs font-semibold'
              : 'roman-button shrink-0 px-3 py-1.5 rounded-sm text-xs transition'
          }
          style={
            disabled && !isSelected
              ? { background: 'var(--parchment-dim)', color: '#9a8a6e' }
              : undefined
          }
        >
          {isSelected ? '取消' : '選択'}
        </button>
      </div>

      {blocked && (
        <p className="text-xs mt-2" style={{ color: 'var(--oxblood)' }}>
          {blocked}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-2">
        {(template.target === 'province' || template.target === 'faction-province') && (
          <Select value={province} onChange={(v) => setProvince(v as ProvinceId)}>
            {provinceIds.map((id) => (
              <option key={id} value={id}>
                {PROVINCE_LABELS[id]}（支配 {Math.round(state.provinces[id].control)}）
              </option>
            ))}
          </Select>
        )}

        {template.target === 'east-province' && (
          <Select value={eastTarget ?? ''} onChange={(v) => setEastProvince(v as EastProvinceId)}>
            {invadable.map((p) => (
              <option key={p.id} value={p.id}>
                {EAST_PROVINCE_LABELS[p.id]}（{EAST_OWNER_LABELS[p.owner]}・支配{' '}
                {Math.round(p.control)}）
              </option>
            ))}
          </Select>
        )}

        {template.target === 'marriage' && (
          <Select value={east ? 'east' : 'barbarian'} onChange={(v) => setEast(v === 'east')}>
            <option value="barbarian">蛮族の族長家</option>
            <option value="east">
              東ローマ帝室（関係 {MARRIAGE_EAST_REQUIREMENT} 以上・成立しにくい）
            </option>
          </Select>
        )}

        {template.target === 'homeland' && (
          <Select value={target ?? ''} onChange={(v) => setFaction(v as BarbarianFactionId)}>
            {factionIds.map((id) => {
              const homeland = state.homelands[id];
              if (homeland === undefined) return null;
              return (
                <option key={id} value={id}>
                  {homeland.name}（{FACTION_LABELS[id]}・支配 {Math.round(homeland.control)}・兵{' '}
                  {Math.round(homeland.garrison)}）
                </option>
              );
            })}
          </Select>
        )}

        {(template.target === 'faction' ||
          template.target === 'faction-province' ||
          (template.target === 'marriage' && !east)) && (
          <Select value={target ?? ''} onChange={(v) => setFaction(v as BarbarianFactionId)}>
            {factionIds.map((id) => (
              <option key={id} value={id}>
                {FACTION_LABELS[id]}（
                {state.factions[id].stance === 'foederati'
                  ? '同盟'
                  : state.factions[id].stance === 'settled'
                    ? '定住'
                    : '敵対'}
                ・戦力 {Math.round(state.factions[id].strength)}）
              </option>
            ))}
          </Select>
        )}
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="roman-tablet flex-1 min-w-0 text-xs rounded-sm px-2 py-1.5"
    >
      {children}
    </select>
  );
}
