import { MAX_CONTROL } from '../../core/constants';
import type { GameState, ProvinceId } from '../../core/types';
import { FACTION_LABELS, PROVINCE_LABELS } from '../catalogue';

/** 属州のおおまかな形。地図ライブラリは使わず手書きのポリゴンで持つ */
const SHAPES: Record<ProvinceId, string> = {
  Britannia: '78,14 116,10 128,44 108,66 76,58 66,34',
  Gallia: '92,84 168,74 192,104 180,144 120,152 92,124',
  Hispania: '38,166 116,158 130,196 104,240 46,236 26,198',
  Italia: '196,120 224,116 238,150 232,206 206,214 194,166',
  Noricum: '200,74 262,70 274,100 246,112 202,108',
  Illyricum: '272,80 342,88 356,132 330,172 282,166 266,124',
  Africa: '120,254 300,248 330,272 316,294 138,296 108,276',
};

/** 支配度の帯で塗り分ける。段階なので補間の計算を持たない */
function fillFor(control: number): string {
  if (control <= 0) return '#3f3f46';
  if (control < MAX_CONTROL * 0.25) return '#b91c1c';
  if (control < MAX_CONTROL * 0.5) return '#c2410c';
  if (control < MAX_CONTROL * 0.75) return '#a16207';
  return '#15803d';
}

interface Props {
  state: GameState;
  selectedProvince: ProvinceId | null;
  onSelect: (id: ProvinceId) => void;
}

export function ProvinceMap({ state, selectedProvince, onSelect }: Props) {
  const ids = Object.keys(SHAPES) as ProvinceId[];

  return (
    <svg
      viewBox="0 0 380 310"
      className="w-full h-auto rounded-lg bg-slate-900 ring-1 ring-slate-700"
      role="img"
      aria-label="属州の支配状況"
    >
      {ids.map((id) => {
        const province = state.provinces[id];
        const occupiers = Object.values(state.factions).filter(
          (f) => f.location === id && f.stance !== 'foederati',
        );
        const isSelected = selectedProvince === id;
        return (
          <g key={id} onClick={() => onSelect(id)} className="cursor-pointer">
            <polygon
              points={SHAPES[id]}
              fill={fillFor(province.control)}
              stroke={isSelected ? '#facc15' : '#0f172a'}
              strokeWidth={isSelected ? 3 : 1.5}
              opacity={province.control <= 0 ? 0.5 : 0.9}
            />
            <text
              x={centroidX(SHAPES[id])}
              y={centroidY(SHAPES[id])}
              textAnchor="middle"
              className="pointer-events-none select-none"
              fill="#f8fafc"
              fontSize="11"
              fontWeight="600"
            >
              {PROVINCE_LABELS[id]}
            </text>
            <text
              x={centroidX(SHAPES[id])}
              y={centroidY(SHAPES[id]) + 13}
              textAnchor="middle"
              className="pointer-events-none select-none"
              fill="#e2e8f0"
              fontSize="10"
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

function points(shape: string): number[][] {
  return shape.split(' ').map((pair) => pair.split(',').map(Number));
}
function centroidX(shape: string): number {
  const p = points(shape);
  return p.reduce((sum, [x]) => sum + x, 0) / p.length;
}
function centroidY(shape: string): number {
  const p = points(shape);
  return p.reduce((sum, [, y]) => sum + y, 0) / p.length;
}

export function occupierNames(state: GameState, id: ProvinceId): string[] {
  return Object.values(state.factions)
    .filter((f) => f.location === id)
    .map((f) => `${FACTION_LABELS[f.id]}（${f.stance === 'foederati' ? '同盟' : f.stance === 'settled' ? '定住' : '敵対'}）`);
}
