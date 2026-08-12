import { useMemo } from 'react';

import type { FactionId, GameState, HomelandId, ProvinceId } from '../../core/types';
import {
  FACTION_LABELS,
  HOMELAND_LABELS,
  PROVINCE_LABELS,
  PROVINCE_SEATS,
  SEAT_COORDS,
} from '../catalogue';
import {
  CONTEXT_LAND_PATH,
  DESERT_PATH,
  HOMELAND_LABEL_POINTS,
  HOMELAND_PATHS,
  LAKE_PATH,
  MAP_VIEWBOX,
  MINOR_RIVER_PATH,
  MOUNTAIN_PATH,
  PLAIN_PATH,
  PLATEAU_PATH,
  PROVINCE_LABEL_POINTS,
  PROVINCE_PATHS,
  RIVER_PATH,
  projectLonLat,
} from '../mapPaths';

export type InspectTarget =
  | { kind: 'faction'; id: FactionId }
  | { kind: 'homeland'; id: HomelandId }
  | { kind: 'north' };

/**
 * 州の色。支配度をそのまま濃さにする。
 *
 * 朝廷の州は藍、胡族の国は朱、北朝は墨、挙兵した王は紫で塗る。
 * **持ち主が一目で分かることを、濃淡より優先する**
 */
function provinceFill(state: GameState, id: ProvinceId): string {
  const province = state.provinces[id];
  if (province.holder === 'north') return '#3a3129';
  if (province.holder === 'prince') return '#5b3f63';
  if (province.holder !== null) return '#8e3323';

  // 朝廷の州。支配度が高いほど濃い藍になる
  const t = Math.max(0, Math.min(1, province.control / 100));
  const light = [206, 198, 176];
  const deep = [46, 63, 87];
  const mix = light.map((c, i) => Math.round(c + (deep[i] - c) * (0.25 + t * 0.75)));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

/** 都に立てる旗。竿と靡く布で描く */
function CapitalBanner({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <line x1="0" y1="0" x2="0" y2="-19" stroke="#f0e6d2" strokeWidth="1.6" />
      <path
        className="banner-wave"
        d="M0,-19 L13,-16 L13,-8 L0,-11 Z"
        fill="var(--gold-bright)"
        stroke="var(--cinnabar-deep)"
        strokeWidth="0.7"
      />
      <circle cx="0" cy="-20.5" r="1.8" fill="var(--gold-bright)" />
    </g>
  );
}

/** 交戦の印。敵が踏み込んでいる州に置く */
function ClashMark({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle className="battle-core" r="7" fill="var(--cinnabar)" opacity="0.6" />
      <path
        d="M-5,-5 L5,5 M5,-5 L-5,5"
        stroke="#f6ece0"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </g>
  );
}

export function ChinaMap({
  state,
  selected,
  onSelect,
  onInspect,
}: {
  state: GameState;
  selected: ProvinceId | null;
  onSelect: (id: ProvinceId) => void;
  onInspect: (target: InspectTarget) => void;
}) {
  /** 州ごとに、いま踏み込んでいる敵 */
  const intruders = useMemo(() => {
    const map = new Map<ProvinceId, FactionId[]>();
    for (const faction of Object.values(state.factions)) {
      if (faction.stance !== 'hostile' || faction.location === 'exterior') continue;
      const id = faction.location as ProvinceId;
      map.set(id, [...(map.get(id) ?? []), faction.id]);
    }
    return map;
  }, [state.factions]);

  /** 塞外で待つ勢力。郷里を持つものはその面に、持たないものは出ない */
  const homelandOwners = useMemo(() => {
    const owners = new Map<string, 'tribe' | 'court'>();
    for (const homeland of Object.values(state.homelands)) owners.set(homeland.id, homeland.owner);
    return owners;
  }, [state.homelands]);

  const provinceIds = Object.keys(PROVINCE_PATHS) as ProvinceId[];

  return (
    <div className="han-panel rounded-sm overflow-hidden">
      <svg viewBox={MAP_VIEWBOX} className="w-full h-auto block" role="img" aria-label="天下の図">
        <defs>
          <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b9c6c4" />
            <stop offset="100%" stopColor="#9fb0b0" />
          </linearGradient>
        </defs>

        {/* 海 */}
        <rect x="0" y="0" width="100%" height="100%" fill="url(#sea)" />

        {/* 天下の外の陸。背景として沈める */}
        <path d={CONTEXT_LAND_PATH} fill="#b5ab90" stroke="none" />

        {/* 地形。州の下に敷いて起伏を出す */}
        <g opacity="0.5">
          <path d={PLAIN_PATH} fill="#a9b184" />
          <path d={PLATEAU_PATH} fill="#b3a683" />
          <path d={DESERT_PATH} fill="#cfc09a" />
          <path d={MOUNTAIN_PATH} fill="#8d8570" />
        </g>

        {/* 胡族の郷里 */}
        {(Object.keys(HOMELAND_PATHS) as HomelandId[]).map((id) => (
          <path
            key={id}
            d={HOMELAND_PATHS[id]}
            fill={homelandOwners.get(id) === 'court' ? '#4a6f5d' : '#7a5a49'}
            fillOpacity="0.75"
            stroke="#4c3f30"
            strokeWidth="0.6"
            onClick={() => onInspect({ kind: 'homeland', id })}
            style={{ cursor: 'pointer' }}
          />
        ))}

        {/* 州 */}
        {provinceIds.map((id) => (
          <path
            key={id}
            d={PROVINCE_PATHS[id]}
            fill={provinceFill(state, id)}
            stroke={selected === id ? 'var(--gold-bright)' : '#3d3427'}
            strokeWidth={selected === id ? 2.2 : 0.7}
            onClick={() => onSelect(id)}
            style={{ cursor: 'pointer' }}
          />
        ))}

        {/* 河川。州の上に描いて南北の境を読ませる */}
        <path d={MINOR_RIVER_PATH} fill="none" stroke="#6f8a97" strokeWidth="0.5" opacity="0.5" />
        <path d={RIVER_PATH} fill="none" stroke="#5c7f90" strokeWidth="1.5" opacity="0.85" />
        <path d={LAKE_PATH} fill="#8fa6ab" stroke="none" opacity="0.8" />

        {/* 郷里の名 */}
        {(Object.keys(HOMELAND_PATHS) as HomelandId[]).map((id) => {
          const point = HOMELAND_LABEL_POINTS[id];
          if (!point) return null;
          return (
            <g key={`h-${id}`} pointerEvents="none">
              <text
                x={point[0]}
                y={point[1]}
                textAnchor="middle"
                fontSize="12"
                fill="#f2e8d6"
                opacity="0.9"
              >
                {FACTION_LABELS[id as FactionId]}
              </text>
              <text
                x={point[0]}
                y={point[1] + 12}
                textAnchor="middle"
                fontSize="10"
                fill="#e8dcc6"
                opacity="0.8"
              >
                {homelandOwners.get(id) === 'court'
                  ? '朝廷が併せた'
                  : `兵 ${Math.round(state.factions[id as FactionId]?.strength ?? 0)}`}
              </text>
            </g>
          );
        })}

        {/* 州の名と治所 */}
        {provinceIds.map((id) => {
          const label = PROVINCE_LABEL_POINTS[id];
          if (!label) return null;
          const province = state.provinces[id];
          const seat = projectLonLat(...SEAT_COORDS[id]);
          const isCapital = state.capital === id;
          const foes = intruders.get(id) ?? [];

          return (
            <g key={`l-${id}`} pointerEvents="none">
              {/* 治所 */}
              <circle
                cx={seat[0]}
                cy={seat[1]}
                r={isCapital ? 3.4 : 2.2}
                fill={isCapital ? 'var(--gold-bright)' : '#f0e6d2'}
                stroke="#2c2419"
                strokeWidth="0.8"
              />
              {isCapital && <CapitalBanner x={seat[0]} y={seat[1]} />}
              {foes.length > 0 && <ClashMark x={seat[0] + 12} y={seat[1] - 10} />}

              <text
                x={label[0]}
                y={label[1]}
                textAnchor="middle"
                fontSize="15"
                fontWeight="700"
                fill={province.holder === null && province.control > 45 ? '#f4ecd9' : '#241f1a'}
                stroke={province.holder === null && province.control > 45 ? 'none' : '#f0e6d2'}
                strokeWidth="2.4"
                paintOrder="stroke"
              >
                {PROVINCE_LABELS[id]}
              </text>
              <text
                x={label[0]}
                y={label[1] + 13}
                textAnchor="middle"
                fontSize="10"
                fill={province.holder === null && province.control > 45 ? '#e2d6bb' : '#4a4034'}
                stroke={province.holder === null && province.control > 45 ? 'none' : '#f0e6d2'}
                strokeWidth="2"
                paintOrder="stroke"
              >
                {province.holder === null
                  ? `${Math.round(province.control)}`
                  : province.holder === 'north'
                    ? (state.north?.name ?? '北朝')
                    : province.holder === 'prince'
                      ? '挙兵'
                      : FACTION_LABELS[province.holder]}
              </text>
            </g>
          );
        })}

        {/*
          塞外の勢力を図の上端に駒でも並べていたが、この時代に郷里を持つ民は
          ちょうど6つの郷里の面と一対一で重なるので、同じものが二度出るだけだった。
          兵力は郷里のラベルに添えてある
        */}
      </svg>
    </div>
  );
}

/** 図の読み方。色と持ち主を結び付ける */
export function MapLegend({ state }: { state: GameState }) {
  const items: { color: string; label: string }[] = [
    { color: '#2e3f57', label: '朝廷の州（濃いほど支配が固い）' },
    { color: '#8e3323', label: '胡族の手に落ちた州' },
    { color: '#3a3129', label: `北朝${state.north ? `（${state.north.name}）` : ''}` },
    { color: '#5b3f63', label: '挙兵した王が拠る州' },
    { color: '#7a5a49', label: '塞外の郷里' },
  ];
  return (
    <div className="han-panel mt-2 rounded-sm px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="text-[11px] flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-[2px]"
            style={{ backgroundColor: item.color, border: '1px solid #3d3427' }}
          />
          <span style={{ color: 'var(--ink-soft)' }}>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

export { PROVINCE_SEATS };
