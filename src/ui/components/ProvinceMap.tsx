import { MAX_CONTROL } from '../../core/constants';
import type { BarbarianStance, GameState, ProvinceId } from '../../core/types';
import { FACTION_LABELS, PROVINCE_LABELS, STANCE_LABELS } from '../catalogue';
import {
  EAST_ROMAN_LABEL_POINT,
  MAP_VIEWBOX,
  PERSIA_LABEL_POINT,
  PROVINCE_PATHS,
} from '../mapPaths';
import {
  CoastShadow,
  EastRomanTerritory,
  PersiaTerritory,
  ProvinceBorders,
  TerrainDefs,
  TerrainLayers,
} from './MapTerrain';
import {
  BattleSprite,
  FactionToken,
  LegionSprite,
  UnitSpriteDefs,
  WarbandSprite,
} from './UnitSprite';
import {
  NO_MOTION,
  PROVINCE_POINTS,
  deriveFactionMarkers,
  settledProvinces,
  type FactionMarker,
  type MapBattle,
  type MapMarch,
  type TurnMotion,
} from '../movements';

/** 支配度の帯で塗り分ける。段階なので補間の計算を持たない */
function fillFor(control: number): string {
  if (control <= 0) return '#6b7280';
  if (control < MAX_CONTROL * 0.25) return '#c81e3c';
  if (control < MAX_CONTROL * 0.5) return '#e06617';
  if (control < MAX_CONTROL * 0.75) return '#e0a80c';
  return '#1f9d4d';
}

/**
 * 蛮族の駒の色。態度で塗り分ける。
 * 同盟（フォエデラティ）は自軍として戦うので、敵対とは別の色にする
 */
const STANCE_COLORS: Record<BarbarianStance, { fill: string; rim: string }> = {
  hostile: { fill: '#b91c1c', rim: '#fca5a5' },
  foederati: { fill: '#b45309', rim: '#fcd34d' },
  settled: { fill: '#5b4636', rim: '#c8b394' },
};

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
  const markers = deriveFactionMarkers(state);
  const settled = settledProvinces(state);

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

        {/* 定住された土地の斜線。恒久的に失われた税基盤を示す */}
        <pattern
          id="settledHatch"
          width={8}
          height={8}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width={8} height={8} fill="none" />
          <rect width={3} height={8} fill="#3f2d1c" />
        </pattern>
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

      {/* 定住された属州。斜線で「取られた土地」だと示す */}
      {ids
        .filter((id) => settled.has(id))
        .map((id) => (
          <path
            key={`${id}-settled`}
            d={PROVINCE_PATHS[id]}
            fill="url(#settledHatch)"
            opacity={0.5}
            pointerEvents="none"
          />
        ))}

      {/* 東ローマとペルシア。西の属州とは別の塗り分けにする */}
      <EastRomanTerritory />
      <PersiaTerritory />

      {/* 海岸線の内側の影と、光彩を添えた点線の境界 */}
      <CoastShadow />
      <ProvinceBorders selected={selectedProvince} />

      {/* 蛮族の駒。今どこに誰がいるかを常時出す */}
      {markers.map((marker) => (
        <FactionMarkerToken key={marker.id} marker={marker} />
      ))}

      {/* 進軍。前ターンとの差分から復元した動きを描く */}
      {motion.marches.map((march) => (
        <March key={march.id} march={march} />
      ))}

      {/* 戦闘のあった属州 */}
      {motion.battles.map((battle) => (
        <Battle key={battle.id} battle={battle} />
      ))}

      {/* 隣国の名。属州ラベルより小さくして主役でないことを示す */}
      <NeighbourLabel at={EAST_ROMAN_LABEL_POINT} fill="#ddd6fe" outline="#2e1065">
        東ローマ
      </NeighbourLabel>
      <NeighbourLabel at={PERSIA_LABEL_POINT} fill="#99f6e4" outline="#042f2e">
        ペルシア
      </NeighbourLabel>

      {/* ラベルは属州の上に重ねる */}
      {ids.map((id) => {
        const province = state.provinces[id];
        const [x, y] = PROVINCE_POINTS[id];
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
              fontSize={17}
              fontWeight={700}
            >
              {PROVINCE_LABELS[id]}
            </text>
            <text
              x={x}
              y={y + 18}
              textAnchor="middle"
              fill="#e2e8f0"
              stroke="#0f172a"
              strokeWidth={4}
              paintOrder="stroke"
              fontSize={16}
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

/** 蛮族の駒ひとつ。円章に兵力、その下に勢力名を出す */
function FactionMarkerToken({ marker }: { marker: FactionMarker }) {
  const color = STANCE_COLORS[marker.stance];
  return (
    <g
      className="pointer-events-none select-none"
      transform={`translate(${marker.at[0]},${marker.at[1]})`}
    >
      <FactionToken strength={marker.strength} color={color.fill} rim={color.rim} />
      {/* 名前は駒の上。下に出すと属州の名前とぶつかる */}
      <text
        y={-14}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={700}
        fill={color.rim}
        stroke="#1c1917"
        strokeWidth={2.6}
        paintOrder="stroke"
      >
        {marker.label}
      </text>
    </g>
  );
}

/** 属州ではない隣国の名。プレイヤーが操作できないので控えめに出す */
function NeighbourLabel({
  at,
  fill,
  outline,
  children,
}: {
  at: [number, number];
  fill: string;
  outline: string;
  children: string;
}) {
  return (
    <text
      x={at[0]}
      y={at[1]}
      textAnchor="middle"
      fill={fill}
      stroke={outline}
      strokeWidth={4}
      paintOrder="stroke"
      fontSize={15}
      fontWeight={700}
      className="pointer-events-none select-none"
    >
      {children}
    </text>
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
        y={y2 - 34}
        textAnchor="middle"
        stroke="#0f172a"
        strokeWidth={4}
        paintOrder="stroke"
        fontSize={march.imperial ? 15 : 13}
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
        y={-44}
        textAnchor="middle"
        stroke="#0f172a"
        strokeWidth={4}
        paintOrder="stroke"
        fontSize={march.imperial ? 15 : 13}
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

/**
 * 戦闘のあった属州に、火花と煙を上げる交戦の印を出す。
 * 蛮族の駒より上に置く。同じ高さだと駒を覆い隠してしまうため
 */
const BATTLE_RISE = 64;

function Battle({ battle }: { battle: MapBattle }) {
  const [x, y] = battle.at;
  return (
    <g className="pointer-events-none" transform={`translate(${x},${y - BATTLE_RISE})`}>
      <g
        className="self-origin"
        style={{ animation: 'battle-pop 0.6s ease-out forwards', opacity: 0 }}
      >
        <BattleSprite />
      </g>
    </g>
  );
}

/**
 * 色の凡例。
 * 西ローマは支配度で色が変わり、東ローマは紫の一色、
 * 帝国外は暗く落とす、という3つの塗り分けを言葉で補う。
 * 見本の色は地図と同じ fillFor から作るので、片方だけずれることがない
 */
const CONTROL_LEGEND_STEPS = [1, 0.7, 0.45, 0.2, 0];
/** 地図で重ねている色。凡例には合成後の見えに近い値を置く */
const EAST_SWATCH = '#6b52a8';
const PERSIA_SWATCH = '#2f7d75';
const OUTSIDE_SWATCH = '#474338';

export function MapLegend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-slate-400">
      <span className="flex items-center gap-1.5">
        <span className="flex overflow-hidden rounded-sm ring-1 ring-slate-600">
          {CONTROL_LEGEND_STEPS.map((ratio) => (
            <span
              key={ratio}
              className="w-4 h-3"
              style={{ background: fillFor(ratio * MAX_CONTROL) }}
            />
          ))}
        </span>
        <span>
          <span className="text-slate-200 font-medium">西ローマ</span> 支配 高→低
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="w-4 h-3 rounded-sm ring-1 ring-slate-600"
          style={{ background: EAST_SWATCH }}
        />
        <span className="text-slate-200 font-medium">東ローマ</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="w-4 h-3 rounded-sm ring-1 ring-slate-600"
          style={{ background: PERSIA_SWATCH }}
        />
        <span className="text-slate-200 font-medium">ペルシア</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="w-4 h-3 rounded-sm ring-1 ring-slate-600"
          style={{ background: OUTSIDE_SWATCH }}
        />
        帝国外
      </span>

      {/* 蛮族は面ではなく駒で出るので、丸い見本にする */}
      <span className="basis-full h-0" />
      <span className="text-slate-200 font-medium">蛮族</span>
      {(Object.keys(STANCE_COLORS) as BarbarianStance[]).map((stance) => (
        <span key={stance} className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-full"
            style={{
              background: STANCE_COLORS[stance].fill,
              boxShadow: `0 0 0 1px ${STANCE_COLORS[stance].rim}`,
            }}
          />
          {STANCE_LABELS[stance]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span
          className="w-4 h-3 rounded-sm ring-1 ring-slate-600"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg,#3f2d1c 0 2px,transparent 2px 5px)',
            backgroundColor: '#6b6450',
          }}
        />
        定住された属州
      </span>
    </div>
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
