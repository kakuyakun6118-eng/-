import { MAX_CONTROL } from '../../core/constants';
import type { GameState, ProvinceId } from '../../core/types';
import { FACTION_LABELS, PROVINCE_LABELS } from '../catalogue';
import { MAP_VIEWBOX, PROVINCE_LABEL_POINTS, PROVINCE_PATHS } from '../mapPaths';
import {
  CoastShadow,
  ProvinceBorders,
  TerrainDefs,
  TerrainLayers,
} from './MapTerrain';
import {
  BattleSprite,
  LegionSprite,
  UnitSpriteDefs,
  WarbandSprite,
} from './UnitSprite';
import { NO_MOTION, type MapBattle, type MapMarch, type TurnMotion } from '../movements';

/**
 * 自動生成した重心では収まりが悪い属州だけ手で置き直す。
 * アフリカはアルジェリアの内陸に寄ってしまうため沿岸へ寄せる
 */
const LABEL_OVERRIDES: Partial<Record<ProvinceId, [number, number]>> = {
  Africa: [360, 655],
};

/** 支配度の帯で塗り分ける。段階なので補間の計算を持たない */
function fillFor(control: number): string {
  if (control <= 0) return '#6b7280';
  if (control < MAX_CONTROL * 0.25) return '#c81e3c';
  if (control < MAX_CONTROL * 0.5) return '#e06617';
  if (control < MAX_CONTROL * 0.75) return '#e0a80c';
  return '#1f9d4d';
}

/**
 * 勢力色の不透明度。下地の山脈・河川・砂漠が透けて見える濃さにする。
 * 失った属州はさらに薄くして色を主張させない
 */
const CONTROL_FILL_OPACITY = 0.55;
const LOST_FILL_OPACITY = 0.3;

/** 進軍にかける時間（秒） */
const MARCH_SECONDS = 2.2;
/** 隊列に見せるため、後続をこの秒数ずつ遅らせる */
const COLUMN_STAGGER = 0.22;

interface Props {
  state: GameState;
  selectedProvince: ProvinceId | null;
  onSelect: (id: ProvinceId) => void;
  motion?: TurnMotion;
}

export function ProvinceMap({ state, selectedProvince, onSelect, motion = NO_MOTION }: Props) {
  const ids = Object.keys(PROVINCE_PATHS) as ProvinceId[];

  return (
    <svg
      viewBox={MAP_VIEWBOX}
      className="w-full h-auto rounded-lg ring-1 ring-slate-700"
      role="img"
      aria-label="属州の支配状況"
    >
      <defs>
        <TerrainDefs />
        <UnitSpriteDefs />
        {/* 親征の軍旗を光らせる */}
        <filter id="imperialGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 海・陸の下地・山脈の陰影・砂漠・河川 */}
      <TerrainLayers />

      {/* 属州の勢力色。下地の地形が透けるよう不透明度を落とす */}
      {ids.map((id) => {
        const province = state.provinces[id];
        return (
          <path
            key={id}
            d={PROVINCE_PATHS[id]}
            fill={fillFor(province.control)}
            opacity={province.control <= 0 ? LOST_FILL_OPACITY : CONTROL_FILL_OPACITY}
            style={{ mixBlendMode: 'multiply' }}
            onClick={() => onSelect(id)}
            className="cursor-pointer"
          />
        );
      })}

      {/* 海岸線の内側の影と、光彩を添えた点線の境界 */}
      <CoastShadow />
      <ProvinceBorders selected={selectedProvince} />

      {/* 進軍。前ターンとの差分から復元した動きを描く */}
      {motion.marches.map((march) => (
        <March key={march.id} march={march} />
      ))}

      {/* 戦闘のあった属州 */}
      {motion.battles.map((battle) => (
        <Battle key={battle.id} battle={battle} />
      ))}

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

/** 進軍する軍勢。行軍路と、隊列に見えるよう時間差で進む部隊を描く */
function March({ march }: { march: MapMarch }) {
  const [x1, y1] = march.from;
  const [x2, y2] = march.to;
  const isLegion = march.kind === 'legion';
  const color = isLegion ? '#fbbf24' : '#dc2626';
  // 親征は隊列を長くして、軍旗を掲げた行列に見せる
  const columnSize = march.imperial ? 4 : 3;
  /*
   * 兵力の軍旗を掲げる位置。隊列全体に出すと同じ数字が並ぶので1つに絞る。
   * 親征のときは先頭が金のローマ旗なので、その次の部隊に持たせる
   */
  const bannerIndex = isLegion && march.imperial ? 1 : 0;

  /*
   * 首都と同じ属州へ派遣した場合は距離がゼロになる。
   * 行軍ではなくその場での布陣として、旗を立てて示す
   */
  if (Math.hypot(x2 - x1, y2 - y1) < 4) {
    return <Encampment march={march} />;
  }

  return (
    <g className="pointer-events-none">
      {/* 行軍路。破線を流して進行方向を示す */}
      <path
        d={`M${x1},${y1} L${x2},${y2}`}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray="10 10"
        style={{
          animation: `route-appear 0.5s ease-out forwards, route-flow 0.8s linear infinite`,
        }}
      />

      {/* 先頭を最後に描く。軍旗が後続の盾に隠れないようにするため */}
      {Array.from({ length: columnSize }, (_, i) => columnSize - 1 - i).map((index) => {
        const delay = index * COLUMN_STAGGER;
        return (
          <g key={index} transform={`translate(${x1},${y1})`}>
            <g
              className="march-mover"
              style={{
                ['--march-dx' as string]: `${x2 - x1}px`,
                ['--march-dy' as string]: `${y2 - y1}px`,
                animation:
                  `march-advance ${MARCH_SECONDS}s linear ${delay}s forwards, ` +
                  `march-fade ${MARCH_SECONDS}s linear ${delay}s forwards`,
                opacity: 0,
              }}
            >
              {isLegion ? (
                march.imperial && index === 0 ? (
                  <ImperialBanner />
                ) : (
                  <LegionSprite
                    strength={index === bannerIndex ? march.strength : undefined}
                    imperial={march.imperial}
                  />
                )
              ) : (
                <WarbandSprite strength={index === bannerIndex ? march.strength : undefined} />
              )}
            </g>
          </g>
        );
      })}

      {/* 到着地点に軍勢の名を出す */}
      <text
        x={x2}
        y={y2 - 46}
        textAnchor="middle"
        stroke="#0f172a"
        strokeWidth={4}
        paintOrder="stroke"
        fontSize={march.imperial ? 19 : 17}
        fontWeight={700}
        fill={march.imperial ? '#fde68a' : '#f8fafc'}
        style={{ animation: `label-appear ${MARCH_SECONDS}s ease-out forwards`, opacity: 0 }}
      >
        {march.label}
      </text>
    </g>
  );
}

/** その場に布陣する軍。旗を立てて留まっていることを示す */
function Encampment({ march }: { march: MapMarch }) {
  const [x, y] = march.to;
  return (
    <g className="pointer-events-none" transform={`translate(${x},${y - 8})`}>
      <g
        className="self-origin"
        style={{ animation: 'standard-raise 0.6s ease-out forwards', opacity: 0 }}
      >
        {march.imperial ? (
          <>
            <ImperialBanner />
            {/* 金の旗は兵力を示さないので、その脇に部隊を立てる */}
            <g transform="translate(-16,-8)">
              <LegionSprite strength={march.strength} imperial />
            </g>
          </>
        ) : (
          <g transform="translate(0,-8)">
            <LegionSprite strength={march.strength} imperial={false} />
          </g>
        )}
      </g>
      <text
        y={-58}
        textAnchor="middle"
        stroke="#0f172a"
        strokeWidth={4}
        paintOrder="stroke"
        fontSize={march.imperial ? 19 : 17}
        fontWeight={700}
        fill={march.imperial ? '#fde68a' : '#f8fafc'}
        style={{ animation: 'standard-raise 0.7s ease-out forwards', opacity: 0 }}
      >
        {march.label}
      </text>
    </g>
  );
}

/**
 * 皇帝の親征を示す金色のローマ旗。
 * 竿の先に鷲章、その下に横木から吊るした旗（ウェクシッルム）を掛ける
 */
function ImperialBanner() {
  return (
    <g filter="url(#imperialGlow)">
      {/* 竿 */}
      <rect x={-1.6} y={-32} width={3.2} height={36} fill="#fde68a" />
      {/* 鷲章 */}
      <circle cx={0} cy={-34} r={3.6} fill="#fef3c7" stroke="#a16207" strokeWidth={1} />
      <path d="M-6,-33 L0,-36.5 L6,-33 L0,-30.5 Z" fill="#fef3c7" />
      {/* 横木 */}
      <rect x={-1} y={-28} width={19} height={2.6} fill="#fde68a" />
      {/* 旗。風になびかせる */}
      <g style={{ animation: 'banner-wave 1.2s ease-in-out infinite' }}>
        <path
          d="M1,-25 L18,-25 L18,-8 L9.5,-11.5 L1,-8 Z"
          fill="#f59e0b"
          stroke="#78350f"
          strokeWidth={1.3}
        />
        <path d="M4.5,-21.5 L14.5,-21.5 M4.5,-17.5 L14.5,-17.5" stroke="#fef3c7" strokeWidth={1.5} />
      </g>
    </g>
  );
}

/** 戦闘のあった属州に、火花と煙を上げる交戦の印を出す */
function Battle({ battle }: { battle: MapBattle }) {
  const [x, y] = battle.at;
  return (
    <g className="pointer-events-none" transform={`translate(${x},${y - 40})`}>
      <g
        className="self-origin"
        style={{ animation: 'battle-pop 0.6s ease-out forwards', opacity: 0 }}
      >
        <BattleSprite strength={battle.strength} />
      </g>
    </g>
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
