import { useState } from 'react';

import { MAX_ACTIONS_PER_TURN } from '../../core/constants';
import type { BarbarianFactionId, GameState, PlayerAction, ProvinceId } from '../../core/types';
import {
  ACTION_TEMPLATES,
  FACTION_LABELS,
  MARRIAGE_EAST_REQUIREMENT,
  PROVINCE_LABELS,
  type ActionTemplate,
} from '../catalogue';
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
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              openCategory === category
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 active:bg-slate-700'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {ACTION_TEMPLATES.filter((t) => t.category === openCategory).map((template) => (
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
  const factionIds = template.factionFilter
    ? allFactionIds.filter((id) => template.factionFilter!(state, id))
    : allFactionIds;

  const [province, setProvince] = useState<ProvinceId>('Italia');
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
  });
  const key = action ? actionKey(action) : template.id;
  const isSelected = selected.some((a) => actionKey(a) === key);
  // 枠を消費しない行動は、枠が埋まっていても選べる
  const usesSlot = action === null || consumesActionSlot(action);
  const disabled = blocked !== null || action === null || (full && usesSlot && !isSelected);

  return (
    <div
      className={`rounded-lg border p-3 ${
        isSelected ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100">
            {template.label}
            {template.cost !== null && (
              <span className="ml-2 text-xs font-normal text-amber-300">{template.cost} ソリドゥス</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{template.detail}</p>
        </div>
        <button
          onClick={() => action && onToggle(action, key)}
          disabled={disabled}
          className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
            isSelected
              ? 'bg-amber-500 text-slate-950'
              : disabled
                ? 'bg-slate-800 text-slate-600'
                : 'bg-slate-700 text-slate-100 active:bg-slate-600'
          }`}
        >
          {isSelected ? '取消' : '選択'}
        </button>
      </div>

      {blocked && <p className="text-xs text-red-400 mt-2">{blocked}</p>}

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

        {template.target === 'marriage' && (
          <Select value={east ? 'east' : 'barbarian'} onChange={(v) => setEast(v === 'east')}>
            <option value="barbarian">蛮族の族長家</option>
            <option value="east">
              東ローマ帝室（関係 {MARRIAGE_EAST_REQUIREMENT} 以上・成立しにくい）
            </option>
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
      className="flex-1 min-w-0 bg-slate-800 text-slate-100 text-xs rounded-md px-2 py-1.5 border border-slate-700"
    >
      {children}
    </select>
  );
}
