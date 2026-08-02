import type { BarbarianFactionId, GameState } from '../../core/types';
import { FACTION_LABELS, PROVINCE_LABELS, STANCE_LABELS } from '../catalogue';
import {
  eastEmperorAge,
  eastEmperorName,
  factionLeaderName,
  factionPortraitFile,
  generalName,
  persianKingAge,
  persianKingName,
} from '../leaders';
import { LeaderFigure } from './Portrait';

/**
 * 諸国の顔ぶれ — 軍司令官・蛮族の族長・東ローマ皇帝・ペルシア王。
 *
 * 名前は表示のためだけの情報で、どの計算式にも影響しない。
 * 東ローマ皇帝とサーサーン朝の王は実在の人物を実際の在位年で出す
 * （395年アルカディウス／バハラーム4世から、476年ゼノン／ペーローズ1世まで）。
 * 蛮族の族長も史料に残る名を年代順に引く
 */
export function CourtFigures({ state }: { state: GameState }) {
  const factionIds = Object.keys(state.factions) as BarbarianFactionId[];
  const general = state.general.current;
  const showEast = state.scenario === 'reunification';

  return (
    <section className="roman-panel rounded-sm p-3">
      <h2 className="roman-heading text-sm">諸国の顔ぶれ</h2>
      <div className="roman-rule mt-1" />

      <div className="mt-2 grid grid-cols-3 gap-2">
        {general !== null && (
          <Figure
            role="general"
            origin="roman"
            age={termAge(state.year - general.appointedYear, general.military)}
            seedId={general.id}
            title="軍司令官"
            name={generalName(general.id)}
            note={`軍事 ${general.military}`}
          />
        )}

{/*
          東ローマ皇帝は史実シナリオでも出す。属州や軍は持たないが、
          援軍要請や帝位の承認の相手として存在しているため。
          ペルシアは統一シナリオでしか登場しないのでそちらだけに出す
        */}
        <Figure
          role="eastemperor"
          origin="east"
          age={eastEmperorAge(state.year)}
          seedId={`east${eastEmperorName(state.year)}`}
          title="東ローマ皇帝"
          name={eastEmperorName(state.year)}
          note={
            state.east.stance === 'war' ? '交戦中' : `関係 ${Math.round(state.eastRelations)}`
          }
          hostile={state.east.stance === 'war'}
        />

        {showEast && (
          <Figure
            role="shah"
            origin="persia"
            age={persianKingAge(state.year)}
            seedId={`persia${persianKingName(state.year)}`}
            title="ペルシア王"
            name={persianKingName(state.year)}
            note={state.persia.intervened ? `戦力 ${Math.round(state.persia.strength)}` : '静観'}
            hostile={state.persia.intervened}
          />
        )}

        {factionIds.map((id, index) => {
          const faction = state.factions[id];
          /*
           * 種に並び順を混ぜる。勢力 id と族長名だけでは文字列が似すぎて
           * hash が散らず、フランクとブルグントのように同じ顔が並んだ
           */
          const seedId = `${index}:${id}:${factionLeaderName(id, state.year)}`;
          const age = chiefAge(faction.strength);
          const distinct = DISTINCT_ORIGINS[id];
          return (
            <Figure
              key={id}
              role="chief"
              origin={distinct ?? 'barbarian'}
              age={age}
              seedId={seedId}
              // フンとマウリは専用画像を hash で引く。他は勢力ごとに顔を固定する
              file={distinct ? null : factionPortraitFile(id, age)}
              title={FACTION_LABELS[id]}
              name={factionLeaderName(id, state.year)}
              note={`${STANCE_LABELS[faction.stance]}・${Math.round(faction.strength)}${
                faction.location === 'exterior' ? '' : ` / ${PROVINCE_LABELS[faction.location]}`
              }`}
              hostile={faction.stance === 'hostile'}
              faded={faction.stance === 'settled'}
            />
          );
        })}
      </div>
    </section>
  );
}


/**
 * ゲルマン諸族とは風貌が異なる勢力の出自。
 * これらは勢力ごとに顔を固定せず、専用の絵柄から族長名の hash で引く
 */
const DISTINCT_ORIGINS: Partial<Record<BarbarianFactionId, 'hun' | 'mauri'>> = {
  Huns: 'hun',
  Mauri: 'mauri',
};

/**
 * 将軍の肖像に使う年代。将軍は年齢を持たないので、在職年数と軍事能力で代える。
 *
 * 長く在職した将軍は老将になる。それ以外は能力で分け、
 * 練達しているほど老いた顔にする。3つの帯すべてを使うための割り当てで、
 * 在職年数だけで決めていたときは若年の絵が一度も出なかった
 */
function termAge(years: number, military: number): 'youth' | 'adult' | 'elder' {
  if (years >= 16) return 'elder';
  if (military <= 5) return 'youth';
  return military <= 7 ? 'adult' : 'elder';
}

/**
 * 強大な勢力ほど老練な族長に見せる。族長は年齢を持たないので戦力で代える。
 *
 * 帯の境目は勢力の戦力の分布に合わせる。14勢力に割り直したとき
 * 30/60 のままでは9勢力が若年の帯に落ち、若年の絵が2枚しかないため
 * 「諸国の顔ぶれ」に同じ顔が9つ並んだ
 */
function chiefAge(strength: number): 'youth' | 'adult' | 'elder' {
  if (strength < 14) return 'youth';
  return strength >= 45 ? 'elder' : 'adult';
}

function Figure({
  role,
  origin,
  age,
  seedId,
  title,
  name,
  note,
  hostile,
  faded,
  file,
}: {
  role: 'general' | 'chief' | 'eastemperor' | 'shah';
  origin: 'roman' | 'barbarian' | 'east' | 'persia' | 'hun' | 'mauri';
  age: 'youth' | 'adult' | 'elder';
  seedId: string;
  title: string;
  name: string;
  note: string;
  hostile?: boolean;
  faded?: boolean;
  file?: string | null;
}) {
  return (
    <figure
      className="rounded-sm overflow-hidden"
      style={{
        border: `1px solid ${hostile ? 'var(--oxblood)' : 'var(--bronze)'}`,
        background: 'var(--parchment)',
        opacity: faded ? 0.55 : 1,
      }}
    >
      <LeaderFigure
        role={role}
        origin={origin}
        age={age}
        seedId={seedId}
        file={file}
        alt={`${title}の肖像`}
        className="w-full h-auto block"
      />
      <figcaption className="px-1.5 py-1">
        <div className="text-[10px] leading-tight truncate" style={{ color: 'var(--ink-soft)' }}>
          {title}
        </div>
        <div
          className="text-[11px] leading-tight truncate"
          style={{ color: 'var(--purple-deep)' }}
          title={name}
        >
          {name}
        </div>
        <div className="text-[10px] leading-tight truncate" style={{ color: 'var(--ink-soft)' }}>
          {note}
        </div>
      </figcaption>
    </figure>
  );
}
