import { useState } from "react";

/**
 * Illustrated New York scenes used as banner art.
 *
 * These ship as inline SVG so the app stays self-contained and offline-capable
 * with no image licensing to worry about. If you drop a real photo at
 * `public/photos/<key>.jpg` it is used instead automatically — see README.
 */
export type SceneKey =
  | "skyline"
  | "bridge"
  | "times-square"
  | "liberty"
  | "downtown"
  | "stadium"
  | "park"
  | "brownstone";

/**
 * Rotation order for day banners. Scenes that ship with a real photo come
 * first, so a week-long trip shows photos on as many days as possible before
 * falling back to illustrations.
 */
export const SCENE_KEYS: SceneKey[] = [
  "skyline",
  "bridge",
  "times-square",
  "liberty",
  "downtown",
  "stadium",
  "park",
  "brownstone",
];

export const SCENE_LABELS: Record<SceneKey, string> = {
  skyline: "マンハッタンの摩天楼",
  bridge: "イーストリバーの橋と夜景",
  "times-square": "タイムズスクエア",
  liberty: "自由の女神",
  downtown: "ワンワールドとダウンタウン",
  stadium: "ヤンキースタジアム",
  park: "セントラルパーク",
  brownstone: "ブラウンストーンの街並み",
};

/** Deterministic scene pick so a given day always shows the same art. */
export function sceneForIndex(index: number): SceneKey {
  return SCENE_KEYS[index % SCENE_KEYS.length];
}

function Sky({ from, mid, to, id }: { from: string; mid: string; to: string; id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={from} />
        <stop offset="55%" stopColor={mid} />
        <stop offset="100%" stopColor={to} />
      </linearGradient>
    </defs>
  );
}

function SkylineScene() {
  return (
    <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label="マンハッタンの摩天楼">
      <Sky id="sk" from="#1b2a4a" mid="#4a5f8e" to="#e98a5a" />
      <rect width="400" height="160" fill="url(#sk)" />
      <circle cx="322" cy="112" r="16" fill="#ffd9a0" opacity="0.9" />
      <g fill="#16233d" opacity="0.55">
        <rect x="0" y="96" width="40" height="64" />
        <rect x="44" y="84" width="30" height="76" />
        <rect x="80" y="104" width="34" height="56" />
        <rect x="330" y="92" width="34" height="68" />
        <rect x="370" y="104" width="30" height="56" />
      </g>
      <g fill="#0e1932">
        <rect x="118" y="72" width="26" height="88" />
        <rect x="150" y="52" width="20" height="108" />
        <rect x="158" y="34" width="4" height="20" />
        <rect x="176" y="86" width="30" height="74" />
        <rect x="212" y="44" width="24" height="116" />
        <rect x="220" y="24" width="8" height="22" />
        <rect x="242" y="78" width="28" height="82" />
        <rect x="276" y="62" width="22" height="98" />
        <rect x="304" y="88" width="22" height="72" />
      </g>
      <g fill="#ffd98a" opacity="0.85">
        {[
          [124, 84], [132, 96], [124, 108], [136, 120], [124, 132],
          [156, 66], [162, 80], [156, 94], [162, 108], [156, 122], [162, 136],
          [182, 98], [194, 98], [182, 112], [194, 126], [182, 140],
          [218, 58], [228, 70], [218, 84], [228, 98], [218, 112], [228, 126], [218, 140],
          [248, 90], [260, 102], [248, 114], [260, 128], [248, 142],
          [282, 76], [290, 90], [282, 104], [290, 118], [282, 132],
          [310, 100], [318, 114], [310, 128], [318, 142],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="4" height="5" rx="0.5" />
        ))}
      </g>
      <rect y="150" width="400" height="10" fill="#080f1f" />
    </svg>
  );
}

function BridgeScene() {
  return (
    <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label="ブルックリン・ブリッジ">
      <Sky id="br" from="#2b3a63" mid="#7d6a9c" to="#f0a878" />
      <rect width="400" height="160" fill="url(#br)" />
      <circle cx="70" cy="46" r="14" fill="#ffe6bd" opacity="0.85" />
      <g stroke="#22304f" strokeWidth="2" fill="none" opacity="0.9">
        <path d="M0 96 Q 90 40 150 96" />
        <path d="M150 96 Q 240 40 320 96" />
        <path d="M320 96 Q 370 74 400 88" />
      </g>
      <g fill="#1a2540">
        <rect x="138" y="34" width="24" height="90" rx="2" />
        <rect x="308" y="34" width="24" height="90" rx="2" />
      </g>
      <g fill="#f2e2c8">
        <path d="M140 44 h20 v6 h-20z M140 60 h20 v6 h-20z" opacity="0.35" />
        <path d="M310 44 h20 v6 h-20z M310 60 h20 v6 h-20z" opacity="0.35" />
      </g>
      <g stroke="#22304f" strokeWidth="1" opacity="0.5">
        {Array.from({ length: 26 }, (_, i) => (
          <line key={i} x1={8 + i * 15} y1={70 + Math.abs(Math.sin(i / 3)) * 18} x2={8 + i * 15} y2="98" />
        ))}
      </g>
      <rect y="96" width="400" height="8" fill="#141d33" />
      <rect y="104" width="400" height="56" fill="#0f1729" />
      <g fill="#ffd98a" opacity="0.6">
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={i * 34 + 10} y="112" width="16" height="3" rx="1.5" />
        ))}
      </g>
    </svg>
  );
}

function ParkScene() {
  return (
    <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label="セントラルパーク">
      <Sky id="pk" from="#8fc6e8" mid="#bfe0e8" to="#f2f0d8" />
      <rect width="400" height="160" fill="url(#pk)" />
      <g fill="#2b3f63" opacity="0.35">
        <rect x="10" y="30" width="20" height="60" />
        <rect x="36" y="18" width="16" height="72" />
        <rect x="330" y="24" width="18" height="66" />
        <rect x="356" y="36" width="22" height="54" />
      </g>
      <rect y="88" width="400" height="72" fill="#5c9e5a" />
      <path d="M0 88 Q 100 74 200 88 T 400 88 L400 108 L0 108 Z" fill="#6bb268" />
      <g>
        <ellipse cx="200" cy="126" rx="120" ry="20" fill="#71b9d6" opacity="0.75" />
        <ellipse cx="200" cy="124" rx="96" ry="14" fill="#8fd0e4" opacity="0.7" />
      </g>
      <g fill="#2f6b3c">
        <ellipse cx="52" cy="80" rx="26" ry="22" />
        <ellipse cx="92" cy="86" rx="20" ry="17" />
        <ellipse cx="322" cy="82" rx="24" ry="20" />
        <ellipse cx="356" cy="88" rx="18" ry="15" />
      </g>
      <g fill="#4a3524">
        <rect x="48" y="96" width="7" height="18" />
        <rect x="318" y="98" width="7" height="16" />
      </g>
      <g fill="#3d5f8a" opacity="0.8">
        <circle cx="168" cy="112" r="4" />
        <circle cx="180" cy="114" r="4" />
      </g>
    </svg>
  );
}

function TimesSquareScene() {
  return (
    <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label="タイムズスクエア">
      <Sky id="ts" from="#170f2e" mid="#3a1f52" to="#6b2a5a" />
      <rect width="400" height="160" fill="url(#ts)" />
      <g fill="#120a24">
        <rect x="0" y="20" width="110" height="140" />
        <rect x="290" y="10" width="110" height="150" />
        <rect x="120" y="52" width="70" height="108" />
        <rect x="210" y="44" width="70" height="116" />
      </g>
      <g opacity="0.95">
        <rect x="10" y="34" width="86" height="34" rx="3" fill="#ff4d6d" />
        <rect x="10" y="78" width="40" height="52" rx="3" fill="#ffd166" />
        <rect x="56" y="78" width="40" height="24" rx="3" fill="#4ecdc4" />
        <rect x="56" y="108" width="40" height="22" rx="3" fill="#a78bfa" />
        <rect x="302" y="24" width="86" height="40" rx="3" fill="#22d3ee" />
        <rect x="302" y="72" width="86" height="26" rx="3" fill="#fb7185" />
        <rect x="302" y="106" width="40" height="40" rx="3" fill="#facc15" />
        <rect x="348" y="106" width="40" height="40" rx="3" fill="#34d399" />
        <rect x="128" y="62" width="54" height="30" rx="3" fill="#f472b6" />
        <rect x="128" y="100" width="54" height="20" rx="3" fill="#60a5fa" />
        <rect x="218" y="54" width="54" height="26" rx="3" fill="#fbbf24" />
        <rect x="218" y="88" width="54" height="34" rx="3" fill="#c084fc" />
      </g>
      <rect y="140" width="400" height="20" fill="#0a0616" />
      <g fill="#ffe28a" opacity="0.8">
        {Array.from({ length: 14 }, (_, i) => (
          <circle key={i} cx={14 + i * 28} cy="150" r="2.5" />
        ))}
      </g>
    </svg>
  );
}

function LibertyScene() {
  return (
    <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label="自由の女神">
      <Sky id="lb" from="#7fb6dd" mid="#cfe3ee" to="#f6d9b0" />
      <rect width="400" height="160" fill="url(#lb)" />
      <g fill="#2c4a63" opacity="0.25">
        <rect x="300" y="72" width="18" height="46" />
        <rect x="324" y="60" width="14" height="58" />
        <rect x="344" y="80" width="20" height="38" />
      </g>
      <g transform="translate(150,18)">
        <rect x="14" y="88" width="42" height="30" fill="#7d6a52" />
        <rect x="8" y="112" width="54" height="12" fill="#6b5943" />
        <path d="M28 34 L42 34 L46 90 L24 90 Z" fill="#6fb9a4" />
        <circle cx="35" cy="26" r="9" fill="#6fb9a4" />
        <g fill="#6fb9a4">
          <path d="M35 12 l3 8 h-6z" />
          <path d="M25 15 l4 7 -6 1z" />
          <path d="M45 15 l-4 7 6 1z" />
          <path d="M18 22 l5 5 -6 2z" />
          <path d="M52 22 l-5 5 6 2z" />
        </g>
        <rect x="42" y="16" width="5" height="22" fill="#6fb9a4" transform="rotate(12 44 27)" />
        <path d="M47 12 l6 -8 4 8z" fill="#ffd166" />
        <circle cx="53" cy="2" r="4" fill="#ffe8a8" opacity="0.9" />
        <rect x="16" y="52" width="14" height="5" fill="#5da893" transform="rotate(-16 23 54)" />
      </g>
      <rect y="118" width="400" height="42" fill="#4d84a8" />
      <path d="M0 118 Q 60 126 120 118 T 240 118 T 400 118 L400 130 L0 130Z" fill="#5f96b8" opacity="0.7" />
      <g fill="#ffffff" opacity="0.45">
        <ellipse cx="60" cy="136" rx="18" ry="2.5" />
        <ellipse cx="200" cy="146" rx="24" ry="3" />
        <ellipse cx="330" cy="134" rx="16" ry="2.5" />
      </g>
    </svg>
  );
}

function BrownstoneScene() {
  return (
    <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label="ブラウンストーンの街並み">
      <Sky id="bs" from="#f3c98b" mid="#e8a97e" to="#c97d6d" />
      <rect width="400" height="160" fill="url(#bs)" />
      <g>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const x = i * 68;
          const tones = ["#8c5a45", "#a06a4e", "#7a4d3c", "#96604a", "#89583f", "#a3705a"];
          return (
            <g key={i}>
              <rect x={x} y={38 + (i % 3) * 6} width="62" height={122 - (i % 3) * 6} fill={tones[i]} />
              <rect x={x} y={34 + (i % 3) * 6} width="62" height="8" fill="#5f3d2f" />
              <g fill="#f7e3c0" opacity="0.85">
                <rect x={x + 10} y={58 + (i % 3) * 6} width="14" height="18" rx="1.5" />
                <rect x={x + 38} y={58 + (i % 3) * 6} width="14" height="18" rx="1.5" />
                <rect x={x + 10} y={88 + (i % 3) * 6} width="14" height="18" rx="1.5" />
                <rect x={x + 38} y={88 + (i % 3) * 6} width="14" height="18" rx="1.5" />
              </g>
              <rect x={x + 22} y={124} width="18" height="36" fill="#4a2f24" rx="1.5" />
              <rect x={x + 18} y={121} width="26" height="4" fill="#5f3d2f" />
            </g>
          );
        })}
      </g>
      <rect y="152" width="400" height="8" fill="#3d2a20" />
      <g fill="#2f7d4f">
        <circle cx="34" cy="140" r="9" />
        <circle cx="238" cy="142" r="8" />
      </g>
    </svg>
  );
}

function StadiumScene() {
  return (
    <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label="ヤンキースタジアム">
      <Sky id="st" from="#3a5f8f" mid="#7ba2c9" to="#c9dced" />
      <rect width="400" height="160" fill="url(#st)" />
      <g fill="#1f3350" opacity="0.35">
        <rect x="150" y="12" width="16" height="26" />
        <rect x="172" y="6" width="12" height="32" />
        <rect x="220" y="14" width="14" height="24" />
      </g>
      <rect y="38" width="400" height="24" fill="#22364f" />
      <g fill="#e8eef5" opacity="0.5">
        {Array.from({ length: 40 }, (_, i) => (
          <rect key={i} x={i * 10 + 2} y="42" width="6" height="16" rx="1" />
        ))}
      </g>
      <rect y="60" width="400" height="100" fill="#4c9a4e" />
      <path d="M200 150 L60 92 Q200 58 340 92 Z" fill="#5cb35e" />
      <path d="M200 146 L92 96 Q200 70 308 96 Z" fill="#b98b56" />
      <path d="M200 138 L120 100 Q200 82 280 100 Z" fill="#63bd65" />
      <g fill="#f2f5f7">
        <circle cx="200" cy="140" r="3.5" />
        <circle cx="160" cy="112" r="2.5" />
        <circle cx="240" cy="112" r="2.5" />
        <circle cx="200" cy="98" r="2.5" />
      </g>
      <circle cx="200" cy="118" r="7" fill="#b98b56" />
      <g fill="#ffffff" opacity="0.9">
        <rect x="16" y="66" width="30" height="12" rx="2" />
        <rect x="354" y="66" width="30" height="12" rx="2" />
      </g>
    </svg>
  );
}

const SCENES: Record<SceneKey, () => JSX.Element> = {
  skyline: SkylineScene,
  bridge: BridgeScene,
  "times-square": TimesSquareScene,
  liberty: LibertyScene,
  // The downtown photo is another skyline, so it shares the skyline artwork.
  downtown: SkylineScene,
  stadium: StadiumScene,
  park: ParkScene,
  brownstone: BrownstoneScene,
};

/**
 * Renders scene art. Prefers a user-supplied photo at `photos/<scene>.jpg`
 * (relative to the app base) and falls back to the built-in illustration if
 * that file isn't there.
 */
export function Scene({ scene, className }: { scene: SceneKey; className?: string }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const Illustration = SCENES[scene];
  const photoUrl = `${import.meta.env.BASE_URL}photos/${scene}.jpg`;

  return (
    <div className={`scene ${className ?? ""}`} data-scene={scene}>
      {!photoFailed && (
        <img
          className="scene-photo"
          src={photoUrl}
          alt={SCENE_LABELS[scene]}
          loading="lazy"
          onError={() => setPhotoFailed(true)}
        />
      )}
      {photoFailed && <Illustration />}
    </div>
  );
}
