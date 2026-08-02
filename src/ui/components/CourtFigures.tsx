import type { BarbarianFactionId, GameState } from '../../core/types';
import { FACTION_LABELS, PROVINCE_LABELS, STANCE_LABELS } from '../catalogue';
import { eastEmperorName, factionLeaderName, generalName, persianKingName } from '../leaders';
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
            age={termAge(state.year - general.appointedYear)}
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
          age="adult"
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
            age="adult"
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
          return (
            <Figure
              key={id}
              role="chief"
              origin="barbarian"
              age={chiefAge(faction.strength)}
              seedId={seedId}
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
 * 在職が長い将軍ほど老いた肖像にする。将軍は年齢を持たないので在職年数で代える。
 * 任命された年から若者の顔になるのは将にそぐわないので、壮年から始める
 */
function termAge(years: number): 'youth' | 'adult' | 'elder' {
  return years < 16 ? 'adult' : 'elder';
}

/**
 * 強大な勢力ほど老練な族長に見せる。族長は年齢を持たないので戦力で代える。
 *
 * 一度は id の hash で散らしていた。族長の絵が年代ごとに1枚しかなく、
 * 戦力で割り当てると弱小勢力5つが揃って同じ顔になったため。
 * 壮年・老年とも複数枚そろったので、戦力との対応に戻してある
 * （同じ年代の中では族長名から1枚が決まるので、顔は勢力ごとに散る）
 */
function chiefAge(strength: number): 'adult' | 'elder' {
  return strength >= 60 ? 'elder' : 'adult';
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
}: {
  role: 'general' | 'chief' | 'eastemperor' | 'shah';
  origin: 'roman' | 'barbarian' | 'east' | 'persia';
  age: 'youth' | 'adult' | 'elder';
  seedId: string;
  title: string;
  name: string;
  note: string;
  hostile?: boolean;
  faded?: boolean;
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
