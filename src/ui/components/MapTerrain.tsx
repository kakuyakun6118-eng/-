import {
  CONTEXT_LAND_PATH,
  DESERT_PATH,
  EAST_ROMAN_PATH,
  LAKE_PATH,
  MINOR_RIVER_PATH,
  MOUNTAIN_PATH,
  PLAIN_PATH,
  PLATEAU_PATH,
  PROVINCE_PATHS,
  RIVER_PATH,
} from '../mapPaths';
import type { ProvinceId } from '../../core/types';

/**
 * 地形の下地。勢力色の下に敷く。
 *
 * 陰影は SVG フィルタで作る。WebGL のシェーダーを使わないのは、
 * 「地図に外部ライブラリを使わない」という制約を保ったまま
 * 同じ表現ができるためで、描画結果はブラウザ側で一度ラスタ化されて
 * 再利用されるので毎ターンの再描画でも負荷が増えない
 */

const ALL_LAND =
  CONTEXT_LAND_PATH + EAST_ROMAN_PATH + Object.values(PROVINCE_PATHS).join('');

export function TerrainDefs() {
  return (
    <>
      {/* 起伏の陰影。乱流を法線に見立てて斜め上から光を当てる */}
      <filter id="hillshade" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.17"
          numOctaves={4}
          seed={7}
          result="noise"
        />
        <feDiffuseLighting in="noise" lightingColor="#fff8ec" surfaceScale={3.4} result="shade">
          <feDistantLight azimuth={315} elevation={48} />
        </feDiffuseLighting>
        <feComposite in="shade" in2="SourceAlpha" operator="in" />
      </filter>

      {/*
       * 稜線。ヒルシェードより細かい周波数でもう一枚重ねる。
       * 1枚だけだと尾根が塊に見え、山地の向きが出ない。
       * 1:10m の山脈は小さいものが多く、周波数が低いと
       * ひとつの山地が一様に塗られて平らに見えてしまう
       */}
      <filter id="ridge" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.4"
          numOctaves={2}
          seed={11}
          result="noise"
        />
        <feDiffuseLighting in="noise" lightingColor="#fff4e0" surfaceScale={2.2} result="shade">
          <feDistantLight azimuth={315} elevation={38} />
        </feDiffuseLighting>
        <feComposite in="shade" in2="SourceAlpha" operator="in" />
      </filter>

      {/*
       * 山裾。Natural Earth の山脈は多角形なので輪郭が直線的に出る。
       * 太らせてぼかした暖色を下に敷き、地形へなじませる。
       * 暗くしすぎると山地が黒い蛆のように見えるので薄く抑える
       */}
      <filter id="foothill" x="-15%" y="-15%" width="130%" height="130%">
        <feMorphology in="SourceAlpha" operator="dilate" radius={2} result="grow" />
        <feGaussianBlur in="grow" stdDeviation={4.5} result="soft" />
        <feColorMatrix
          in="soft"
          type="matrix"
          values="0 0 0 0 0.31 0 0 0 0 0.26 0 0 0 0 0.17 0 0 0 0.42 0"
        />
      </filter>

      {/* 平野の細かなざらつき */}
      <filter id="grain" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={3} result="n" />
        <feColorMatrix
          in="n"
          type="matrix"
          values="0 0 0 0 0.42 0 0 0 0 0.38 0 0 0 0 0.30 0 0 0 0.5 0"
          result="tex"
        />
        <feComposite in="tex" in2="SourceAlpha" operator="in" />
      </filter>

      {/* 海岸線の内側に落ちる影。陸が浮き上がって見える */}
      <filter id="coastInner" x="-10%" y="-10%" width="120%" height="120%">
        <feOffset dx={0} dy={2} in="SourceAlpha" result="off" />
        <feGaussianBlur in="off" stdDeviation={3} result="blur" />
        <feComposite in="SourceAlpha" in2="blur" operator="out" result="inner" />
        <feColorMatrix
          in="inner"
          type="matrix"
          values="0 0 0 0 0.05 0 0 0 0 0.08 0 0 0 0 0.12 0 0 0 0.55 0"
        />
      </filter>

      {/* 海側へにじむ光。陸の縁を際立たせる */}
      <filter id="coastOuter" x="-12%" y="-12%" width="124%" height="124%">
        <feMorphology in="SourceAlpha" operator="dilate" radius={1.5} result="grow" />
        <feGaussianBlur in="grow" stdDeviation={4} result="glow" />
        <feColorMatrix
          in="glow"
          type="matrix"
          values="0 0 0 0 0.62 0 0 0 0 0.78 0 0 0 0 0.92 0 0 0 0.5 0"
          result="tint"
        />
        <feComposite in="tint" in2="SourceAlpha" operator="out" />
      </filter>

      {/* 国境の点線に添える光彩 */}
      <filter id="borderGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation={1.6} result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <linearGradient id="seaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2f5375" />
        <stop offset="55%" stopColor="#24405e" />
        <stop offset="100%" stopColor="#1b3149" />
      </linearGradient>
      <linearGradient id="landGrad" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stopColor="#6f6a56" />
        <stop offset="100%" stopColor="#565244" />
      </linearGradient>
    </>
  );
}

/** 海・陸の下地・地形・河川。勢力色より下に描く層 */
export function TerrainLayers() {
  return (
    <g>
      {/* 海 */}
      <rect x="0" y="0" width="100%" height="100%" fill="url(#seaGrad)" />

      {/* 海岸線の外側のにじみ */}
      <path d={ALL_LAND} fill="#000" filter="url(#coastOuter)" opacity={0.9} />

      {/* 陸の下地 */}
      <path d={ALL_LAND} fill="url(#landGrad)" />

      {/* 植生の帯。平地を一色にせず、肥沃な平原と乾いた高原を描き分ける */}
      <path d={PLAIN_PATH} fill="#6b7248" opacity={0.45} />
      <path d={PLATEAU_PATH} fill="#7d7154" opacity={0.4} />
      <path d={DESERT_PATH} fill="#a2905f" opacity={0.5} />

      {/* 山脈。裾をぼかして敷き、土色の本体に陰影と稜線を重ねる */}
      <path d={MOUNTAIN_PATH} fill="#000" filter="url(#foothill)" />
      <path d={MOUNTAIN_PATH} fill="#7d6a4d" opacity={0.85} />
      <path
        d={MOUNTAIN_PATH}
        filter="url(#hillshade)"
        style={{ mixBlendMode: 'multiply' }}
        opacity={0.95}
      />
      {/* 稜線は overlay で重ねる。日の当たる面を明るく、影の面を暗くする */}
      <path
        d={MOUNTAIN_PATH}
        filter="url(#ridge)"
        style={{ mixBlendMode: 'overlay' }}
        opacity={0.55}
      />

      {/* 全体のざらつき。山も平地もまとめて紙目を与える */}
      <path d={ALL_LAND} filter="url(#grain)" opacity={0.45} />

      {/* 帝国外の陸地を落として、属州を前に出す */}
      <path d={CONTEXT_LAND_PATH} fill="#111a2b" opacity={0.34} />

      {/* 支流。細く薄く、本数で水系を見せる */}
      <path
        d={MINOR_RIVER_PATH}
        fill="none"
        stroke="#6ea0c8"
        strokeWidth={0.55}
        strokeLinecap="round"
        opacity={0.45}
      />
      {/* 主要な河川 */}
      <path
        d={RIVER_PATH}
        fill="none"
        stroke="#5f93bf"
        strokeWidth={1.3}
        strokeLinecap="round"
        opacity={0.8}
      />

      {/* 湖。海と同じ色で塗り、縁を明るくして水面と分かるようにする */}
      <path d={LAKE_PATH} fill="#2b4a6b" stroke="#7fb0d4" strokeWidth={0.5} opacity={0.9} />
    </g>
  );
}

/**
 * 東ローマ帝国の領域。
 *
 * プレイヤーの属州ではないので支配度の色帯には乗せず、
 * 帝室の紫で一様に塗る。西（支配度で緑〜赤に変わる）とも、
 * 帝国外の蛮族の地（暗く落とした背景）とも区別が付くようにする
 */
export function EastRomanTerritory() {
  return (
    <g pointerEvents="none">
      {/*
       * 乗算だけだと山地の陰影に負けて茶色に沈むので、
       * 先に薄い紫を通常合成で敷いてから乗算を重ねる
       */}
      <path d={EAST_ROMAN_PATH} fill="#7b5fc4" opacity={0.3} />
      <path
        d={EAST_ROMAN_PATH}
        fill="#6247b5"
        opacity={0.5}
        style={{ mixBlendMode: 'multiply' }}
      />
      <path
        d={EAST_ROMAN_PATH}
        fill="none"
        stroke="#c4b5fd"
        strokeWidth={1.3}
        strokeDasharray="5 4"
        opacity={0.7}
        filter="url(#borderGlow)"
      />
    </g>
  );
}

/** 海岸線の内側の影。勢力色より上に重ねて陸を立体的に見せる */
export function CoastShadow() {
  return <path d={ALL_LAND} fill="#000" filter="url(#coastInner)" pointerEvents="none" />;
}

/** 属州の境界。太い黒線をやめ、光彩を添えた点線にする */
export function ProvinceBorders({ selected }: { selected: ProvinceId | null }) {
  const ids = Object.keys(PROVINCE_PATHS) as ProvinceId[];
  return (
    <g fill="none" pointerEvents="none" filter="url(#borderGlow)">
      {ids.map((id) => (
        <path
          key={id}
          d={PROVINCE_PATHS[id]}
          stroke={selected === id ? '#fde047' : '#f3e3b8'}
          strokeWidth={selected === id ? 2.6 : 1.3}
          strokeDasharray={selected === id ? undefined : '5 4'}
          opacity={selected === id ? 1 : 0.75}
        />
      ))}
    </g>
  );
}
