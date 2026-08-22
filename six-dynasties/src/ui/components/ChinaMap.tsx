import { useMemo } from 'react';

import type { FactionId, GameState, HomelandId, ProvinceId } from '../../core/types';
import {
  FACTION_COLORS,
  FACTION_LABELS,
  HOMELAND_LABELS,
  NORTH_COLOR,
  PROVINCE_LABELS,
  PROVINCE_SEATS,
  SEAT_COORDS,
  holderColor,
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
 * 州の塗り。**勢力の色を、地形の上に透かして乗せる。**
 *
 * かつては不透明な単色で塗り潰していたので、下に敷いた平原・高原・砂漠・山地が
 * 一枚残らず隠れ、地図が15枚の色紙になっていた。しかも胡族はひと色の朱で、
 * 并州の匈奴も遼東の慕容も見分けがつかなかった。
 *
 * 色は持ち主ごと（`holderColor`）、**濃さは支配の固さ**。
 * 朝廷の州は支配度が高いほど濃く塗られ、傾いた州は地形が透けて見える —
 * **塗りの薄さがそのまま「その土地がまだ自分のものになっていない」ことを語る**
 */
function provinceFill(state: GameState, id: ProvinceId): { color: string; opacity: number } {
  const province = state.provinces[id];
  const color = holderColor(province.holder);
  if (province.holder !== null) return { color, opacity: 0.58 };
  const t = Math.max(0, Math.min(1, province.control / 100));
  return { color, opacity: 0.16 + t * 0.46 };
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

/**
 * 主要都市。**城壁の高いところが大城**で、洛陽・長安・鄴・建康・江陵・成都がこれにあたる。
 * 都は旗を立て、大城は二重の輪で描き分ける
 */
const MAJOR_CITIES = new Set<ProvinceId>(['Si', 'Yong', 'Ji', 'Yang', 'Jing', 'Yi']);

/**
 * 城。**点ではなく、城壁の形で描く。**
 *
 * 丸い点で置いていたときは、都市なのか軍なのか勢力の印なのかが図から読めなかった。
 * 版築の壁に楼を二つ立て、門を開ける — 大城には屋根を重ね、都には旗を添える。
 * 城は持ち主の色で塗るので、**州の塗りが薄くても城の色でどちらのものかが分かる。**
 *
 * 耐久の帯と数まで描き込んだときは、城の密な中原で州名・支配度・城名・耐久・
 * 「囲まれている」が四重五重に重なって読めなかった。耐久は図の下の一覧で読ませ、
 * 図では囲まれている城にだけ細い帯を出して危うさを伝える
 */
function City({
  x,
  y,
  name,
  wall,
  wallMax,
  major,
  isCapital,
  besieged,
  color,
}: {
  x: number;
  y: number;
  name: string;
  wall: number;
  wallMax: number;
  major: boolean;
  isCapital: boolean;
  besieged: boolean;
  color: string;
}) {
  const scale = isCapital ? 1.25 : major ? 1.05 : 0.8;
  const ratio = wallMax <= 0 ? 0 : Math.max(0, Math.min(1, wall / wallMax));

  return (
    <g pointerEvents="none">
      <g transform={`translate(${x} ${y}) scale(${scale})`}>
        {/* 城壁。左右に楼を立て、中央に門を開ける */}
        <path
          d="M-6,2 L-6,-3 L-4.2,-3 L-4.2,-5 L-1.6,-5 L-1.6,-3 L1.6,-3 L1.6,-5 L4.2,-5 L4.2,-3 L6,-3 L6,2 Z"
          fill={color}
          stroke="#241f1a"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
        {/* 門 */}
        <path d="M-1.3,2 L-1.3,-0.6 A1.3,1.3 0 0 1 1.3,-0.6 L1.3,2 Z" fill="#f2e8d4" opacity="0.92" />
        {/* 大城には屋根を重ねる */}
        {(major || isCapital) && (
          <path
            d="M-7.4,-5 L0,-8.8 L7.4,-5 Z"
            fill={color}
            stroke="#241f1a"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
        )}
      </g>
      {isCapital && <CapitalBanner x={x + 8} y={y - 2} />}
      {/* 大城と都だけ名を出す。小さな城まで書くと図が字で埋まる */}
      {(major || isCapital) && (
        <text
          x={x}
          y={y - 9 * scale - 2.5}
          textAnchor="middle"
          fontSize="10.5"
          fontWeight="700"
          fill="#241f1a"
          stroke="#f2e8d4"
          strokeWidth="2.4"
          paintOrder="stroke"
        >
          {name}
        </text>
      )}
      {/* 囲まれている城だけ、残りの耐久を細い帯で見せる */}
      {besieged && (
        <>
          <rect x={x - 11} y={y + 3.5} width="22" height="2.4" fill="rgba(20,16,12,0.5)" />
          <rect
            x={x - 11}
            y={y + 3.5}
            width={22 * ratio}
            height="2.4"
            fill={ratio > 0.5 ? 'var(--gold-bright)' : 'var(--cinnabar)'}
          />
        </>
      )}
    </g>
  );
}

/**
 * 出征軍の札。
 *
 * **軍がいまどこにいるかは、図でなければ読めない。** 幟だけを立てていたときは、
 * 将の名が州名や治所の名と重なって、青州の軍がどれなのか読めなかった。
 * 名と兵は下地のある札に載せ、**州の名より上の層**に描く
 */
function CorpsPlate({
  x,
  y,
  name,
  troops,
  besieging,
}: {
  x: number;
  y: number;
  name: string;
  troops: number;
  besieging: boolean;
}) {
  const label = `${name} ${Math.round(troops)}`;
  const width = label.length * 6.4 + 12;
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <line x1="0" y1="0" x2="6" y2="0" stroke="#2c2419" strokeWidth="1" />
      <rect
        x={-width}
        y={-7}
        width={width}
        height="14"
        rx="2"
        fill={besieging ? 'var(--cinnabar-deep)' : 'var(--imperial)'}
        stroke="#f0e6d2"
        strokeWidth="0.8"
      />
      <text
        x={-width / 2}
        y={3.6}
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="700"
        fill="#f6ece0"
      >
        {label}
      </text>
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

  /** 州ごとに、そこに立っている出征軍 */
  const armies = useMemo(() => {
    const map = new Map<ProvinceId, GameState['corps']>();
    for (const corps of state.corps) {
      map.set(corps.at, [...(map.get(corps.at) ?? []), corps]);
    }
    return map;
  }, [state.corps]);

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

        {/* 地形。州の下に敷いて起伏を出す。塗りが透けるので濃く敷く */}
        <g opacity="0.66">
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
            fill={
              homelandOwners.get(id) === 'court'
                ? 'var(--jade)'
                : FACTION_COLORS[id as FactionId]
            }
            fillOpacity="0.5"
            stroke="#4c3f30"
            strokeWidth="0.6"
            onClick={() => onInspect({ kind: 'homeland', id })}
            style={{ cursor: 'pointer' }}
          />
        ))}

        {/*
          州の下地。**色を乗せる前に、絹の色を一枚敷く。**
          地形の上へ直に藍を乗せていたときは、山地の褐色と混ざって
          朝廷の州が一様に濁った鼠色になり、支配度の濃淡が読めなかった。
          顔料は紙の上でこそ発色する
        */}
        {provinceIds.map((id) => (
          <path
            key={`g-${id}`}
            d={PROVINCE_PATHS[id]}
            fill="#efe6d0"
            fillOpacity="0.55"
            pointerEvents="none"
          />
        ))}

        {/* 州。持ち主の色を地形の上に透かして乗せる */}
        {provinceIds.map((id) => {
          const paint = provinceFill(state, id);
          return (
            <path
              key={id}
              d={PROVINCE_PATHS[id]}
              fill={paint.color}
              fillOpacity={paint.opacity}
              stroke={selected === id ? 'var(--gold-bright)' : '#3d3427'}
              strokeWidth={selected === id ? 2.2 : 0.8}
              strokeOpacity={selected === id ? 1 : 0.75}
              onClick={() => onSelect(id)}
              style={{ cursor: 'pointer' }}
            />
          );
        })}

        {/*
          奪われた州の輪郭。**持ち主の色で太く縁取る。**
          朝廷の州にまで同じことをすると、州と州のあいだの境まで藍で塗り潰されて
          十五州が一枚の面になる。縁で語らせるのは**手を離れた州のほう**で、
          そこが天下のどこまで及んでいるかが一目で分かればよい
        */}
        {provinceIds
          .filter((id) => state.provinces[id].holder !== null)
          .map((id) => (
            <path
              key={`o-${id}`}
              d={PROVINCE_PATHS[id]}
              fill="none"
              stroke={holderColor(state.provinces[id].holder)}
              strokeWidth="2"
              strokeOpacity="0.95"
              strokeLinejoin="round"
              pointerEvents="none"
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
              <City
                x={seat[0]}
                y={seat[1]}
                name={PROVINCE_SEATS[id]}
                wall={province.wall}
                wallMax={province.wallMax}
                major={MAJOR_CITIES.has(id)}
                isCapital={isCapital}
                besieged={foes.length > 0 || (armies.has(id) && province.holder !== null)}
                color={holderColor(province.holder)}
              />
              {foes.length > 0 && <ClashMark x={seat[0] + 14} y={seat[1] - 12} />}

              <text
                x={label[0]}
                y={label[1]}
                textAnchor="middle"
                fontSize="14"
                fontWeight="700"
                fill={provinceFill(state, id).opacity > 0.44 ? '#f4ecd9' : '#241f1a'}
                stroke={provinceFill(state, id).opacity > 0.44 ? 'none' : '#f0e6d2'}
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
                fill={provinceFill(state, id).opacity > 0.44 ? '#e2d6bb' : '#4a4034'}
                stroke={provinceFill(state, id).opacity > 0.44 ? 'none' : '#f0e6d2'}
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

        {/* 出征軍の札。州の名の上に重ねる */}
        {[...armies.entries()].flatMap(([id, list]) => {
          const seat = projectLonLat(...SEAT_COORDS[id]);
          return list.map((corps, i) => (
            <CorpsPlate
              key={corps.id}
              x={seat[0] - 7}
              y={seat[1] - 14 - i * 17}
              name={corps.officer.name}
              troops={corps.troops}
              besieging={state.provinces[id].holder !== null}
            />
          ));
        })}

        {/* 行軍の路。まだ着いていない軍から、目指す州へ点線を引く */}
        {state.corps
          .filter((corps) => corps.at !== corps.target)
          .map((corps) => {
            const from = projectLonLat(...SEAT_COORDS[corps.at]);
            const to = projectLonLat(...SEAT_COORDS[corps.target]);
            return (
              <line
                key={`m-${corps.id}`}
                x1={from[0]}
                y1={from[1]}
                x2={to[0]}
                y2={to[1]}
                stroke="var(--imperial)"
                strokeWidth="1.4"
                strokeDasharray="4 3"
                opacity="0.8"
                pointerEvents="none"
              />
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
  /*
   * **凡例には、いま図の上にある勢力だけを出す。**
   * 十四の民をすべて並べていたら、大半の年は一つも州を持っていない民の色で
   * 凡例が埋まる。州を握った民が現れたその年に、その色が凡例に加わる
   */
  const holders = new Set(
    Object.values(state.provinces)
      .map((p) => p.holder)
      .filter((h): h is FactionId => h !== null && h !== 'north' && h !== 'prince'),
  );
  const revolted = Object.values(state.provinces).some((p) => p.holder === 'prince');

  const items: { color: string; label: string }[] = [
    { color: holderColor(null), label: '朝廷（濃いほど支配が固い）' },
    ...[...holders].map((id) => ({
      color: FACTION_COLORS[id],
      label: `${FACTION_LABELS[id]}${state.factions[id].kingdomName ?? ''}`,
    })),
    ...(state.north !== null ? [{ color: NORTH_COLOR, label: state.north.name }] : []),
    ...(revolted ? [{ color: holderColor('prince'), label: '挙兵した王' }] : []),
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
      <span className="text-[11px] w-full" style={{ color: 'var(--ink-soft)' }}>
        城は<strong style={{ color: 'var(--ink)' }}>持ち主の色</strong>で塗る。屋根が重なっているのが大城
        （洛陽・長安・鄴・建康・江陵・成都）で、旗が立っているのが都。
        囲まれている城には残りの耐久が帯で出る。札は出征軍（朱は城を囲んでいる軍）
      </span>
    </div>
  );
}

/**
 * 主要都市の一覧。
 *
 * 城の耐久は図に描き込むと字が重なって読めないので、ここで読ませる。
 * **支配度が尽きてから耐久が削られ、尽きた城が陥ちる**
 */
export function CityPanel({ state }: { state: GameState }) {
  const rows = (Object.keys(PROVINCE_PATHS) as ProvinceId[])
    .map((id) => ({ id, province: state.provinces[id], major: MAJOR_CITIES.has(id) }))
    .sort((a, b) => {
      // 危うい城を上に。次に大城
      const risk = (r: typeof a) =>
        r.province.holder !== null ? 2 : r.province.wall / Math.max(1, r.province.wallMax);
      return risk(a) - risk(b) || (a.major ? 0 : 1) - (b.major ? 0 : 1);
    });

  return (
    <section className="han-panel rounded-sm px-3 py-2">
      <h2 className="han-heading text-sm">主要都市と城の耐久</h2>
      <ul className="mt-1.5 space-y-1">
        {rows.map(({ id, province, major }) => {
          const ratio = province.wallMax <= 0 ? 0 : province.wall / province.wallMax;
          const lost = province.holder !== null;
          const tone = lost
            ? 'var(--ink-soft)'
            : ratio > 0.6
              ? 'var(--jade)'
              : ratio > 0.3
                ? 'var(--gold)'
                : 'var(--cinnabar)';
          return (
            <li key={id} className="flex items-center gap-2 text-[12px]">
              <span className="w-16 shrink-0">
                <span className="font-semibold" style={{ color: major ? 'var(--ink)' : 'var(--ink-soft)' }}>
                  {PROVINCE_SEATS[id]}
                </span>
                {state.capital === id && (
                  <span className="ml-1 text-[10px]" style={{ color: 'var(--gold)' }}>
                    都
                  </span>
                )}
              </span>
              <span className="w-10 shrink-0 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                {PROVINCE_LABELS[id]}
              </span>
              <span className="flex-1 h-2 rounded-[1px]" style={{ backgroundColor: 'rgba(0,0,0,0.12)' }}>
                <span
                  className="block h-2 rounded-[1px]"
                  style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, backgroundColor: tone }}
                />
              </span>
              <span className="w-20 shrink-0 text-right tabular-nums text-[11px]" style={{ color: tone }}>
                {!lost || province.holder === null
                  ? `城 ${Math.round(province.wall)}／${province.wallMax}`
                  : province.holder === 'north'
                    ? (state.north?.name ?? '北朝')
                    : province.holder === 'prince'
                      ? '藩王'
                      : FACTION_LABELS[province.holder]}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        支配度が尽きてから城の耐久が削られ、尽きた城が陥ちて州を失う。
        「軍事 → 守りを固める」で城も繕える
      </p>
    </section>
  );
}

export { PROVINCE_SEATS };
