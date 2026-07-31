import { MAX_CONTROL } from '../../core/constants';
import type { GameState, ProvinceId } from '../../core/types';
import { FACTION_LABELS, PROVINCE_LABELS } from '../catalogue';
import {
  CONTEXT_LAND_PATH,
  MAP_VIEWBOX,
  PROVINCE_LABEL_POINTS,
  PROVINCE_PATHS,
} from '../mapPaths';

/**
 * 自動生成した重心では収まりが悪い属州だけ手で置き直す。
 * アフリカはアルジェリアの内陸に寄ってしまうため沿岸へ寄せる
 */
const LABEL_OVERRIDES: Partial<Record<ProvinceId, [number, number]>> = {
  Africa: [360, 655],
};

/** 支配度の帯で塗り分ける。段階なので補間の計算を持たない */
function fillFor(control: number): string {
  if (control <= 0) return '#4b5563';
  if (control < MAX_CONTROL * 0.25) return '#9f1239';
  if (control < MAX_CONTROL * 0.5) return '#b45309';
  if (control < MAX_CONTROL * 0.75) return '#ca8a04';
  return '#15803d';
}

interface Props {
  state: GameState;
  selectedProvince: ProvinceId | null;
  onSelect: (id: ProvinceId) => void;
}

export function ProvinceMap({ state, selectedProvince, onSelect }: Props) {
  const ids = Object.keys(PROVINCE_PATHS) as ProvinceId[];

  return (
    <svg
      viewBox={MAP_VIEWBOX}
      className="w-full h-auto rounded-lg ring-1 ring-slate-700"
      role="img"
      aria-label="属州の支配状況"
    >
      <defs>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#31506f" />
          <stop offset="100%" stopColor="#22384f" />
        </linearGradient>
      </defs>

      {/* 海 */}
      <rect x="0" y="0" width="100%" height="100%" fill="url(#sea)" />

      {/* 帝国外の陸地。背景として暗く敷く */}
      <path d={CONTEXT_LAND_PATH} fill="#3f4655" stroke="#2b3140" strokeWidth={0.8} />

      {/* 属州 */}
      {ids.map((id) => {
        const province = state.provinces[id];
        const isSelected = selectedProvince === id;
        return (
          <path
            key={id}
            d={PROVINCE_PATHS[id]}
            fill={fillFor(province.control)}
            stroke={isSelected ? '#facc15' : '#1e293b'}
            strokeWidth={isSelected ? 3 : 1}
            opacity={province.control <= 0 ? 0.55 : 0.92}
            onClick={() => onSelect(id)}
            className="cursor-pointer"
          />
        );
      })}

      {/* ラベルは属州の上に重ねる */}
      {ids.map((id) => {
        const province = state.provinces[id];
        const [x, y] = LABEL_OVERRIDES[id] ?? PROVINCE_LABEL_POINTS[id];
        const occupiers = Object.values(state.factions).filter(
          (f) => f.location === id && f.stance !== 'foederati',
        );
        return (
          <g key={`${id}-label`} className="pointer-events-none select-none">
            <text
              x={x}
              y={y}
              textAnchor="middle"
              fill="#f8fafc"
              stroke="#0f172a"
              strokeWidth={4}
              paintOrder="stroke"
              fontSize={22}
              fontWeight={700}
            >
              {PROVINCE_LABELS[id]}
            </text>
            <text
              x={x}
              y={y + 24}
              textAnchor="middle"
              fill="#e2e8f0"
              stroke="#0f172a"
              strokeWidth={4}
              paintOrder="stroke"
              fontSize={20}
            >
              {Math.round(province.control)}
              {occupiers.length > 0 ? ` ⚔${occupiers.length}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function occupierNames(state: GameState, id: ProvinceId): string[] {
  return Object.values(state.factions)
    .filter((f) => f.location === id)
    .map(
      (f) =>
        `${FACTION_LABELS[f.id]}（${
          f.stance === 'foederati' ? '同盟' : f.stance === 'settled' ? '定住' : '敵対'
        }）`,
    );
}
