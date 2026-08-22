import { useState, type ReactElement } from 'react';

import {
  APPOINT_COST,
  CONSCRIPT_COST,
  CONVERSATION_COST,
  DEFEND_COST,
  MARRIAGE_COST,
  MOVE_CAPITAL_COST,
  CORPS_COST,
  CORPS_MAX,
  CORPS_MIN_ARMY,
  CORPS_SHARE,
  RECRUIT_COST,
  REWARD_COST,
  PACIFY_COST,
  PROVINCE_RECRUIT_COST,
  REGISTER_COST,
  REORGANIZE_COST,
  SETTLE_COST,
} from '../../core/constants';
import { availableBattleLeaders, availableFoes, leaderName } from '../../core/battle';
import {
  auxiliaryPay,
  allHouses,
  brideFor,
  canSubdueHomeland,
  tributeCost,
} from '../../core/diplomacy';
import { canCampaignAgainst, canDispatch } from '../../core/corps';
import { marchPath } from '../../core/geography';
import { canMoveCapital } from '../../core/economy';
import { recruitChance, seatedOfficers, traitName, traitNote } from '../../core/officers';
import type {
  BattleFoe,
  FactionId,
  Official,
  GameState,
  HomelandId,
  PlayerAction,
  ProvinceId,
} from '../../core/types';
import {
  FACTION_LABELS,
  HOMELAND_LABELS,
  PROVINCE_LABELS,
  PROVINCE_SEATS,
} from '../catalogue';
import { actionKey } from '../useGame';
import { FiveRow } from './CourtPanel';
import { Portrait, PortraitFrame, officerRole, seededAge, type PortraitSpec } from './Portrait';

type Category = 'prince' | 'tribe' | 'military' | 'domestic' | 'office' | 'people';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'people', label: '人事' },
  { id: 'prince', label: '宗室' },
  { id: 'tribe', label: '胡族' },
  { id: 'military', label: '軍事' },
  { id: 'domestic', label: '内政' },
  { id: 'office', label: '官職' },
];

/** 配下で無官の武将。官に就けられるのはこの人たちだけ */
function retainedOf(state: GameState): Official[] {
  return state.candidates.filter((o) => o.retained);
}

/** 在野の武将。登用の相手 */
function wanderersOf(state: GameState): Official[] {
  return state.candidates.filter((o) => !o.retained);
}

interface Choice {
  action: PlayerAction;
  title: string;
  detail: string;
  cost?: string;
  disabled?: boolean;
  urgent?: boolean;
  /** 相手の顔。婚姻の申し出で、迎えることになる人物を先に見せる */
  portrait?: PortraitSpec;
  /**
   * 五能力と個性。**人を選ぶ手には、朝廷の一覧と同じ表を出す。**
   * 「統率9・武力8…」と文で書いていたときは、三人並べても
   * 誰が優れているのかを読み比べないと分からなかった
   */
  officer?: Official;
}

function ActionRow({
  choice,
  chosen,
  onToggle,
}: {
  choice: Choice;
  chosen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={choice.disabled}
      className="w-full text-left rounded-sm px-2.5 py-2 transition"
      style={{
        backgroundColor: chosen ? 'rgba(46, 63, 87, 0.14)' : 'rgba(250, 244, 230, 0.7)',
        border: `1px solid ${chosen ? 'var(--imperial)' : choice.urgent ? 'var(--cinnabar)' : 'var(--bamboo)'}`,
        opacity: choice.disabled ? 0.45 : 1,
      }}
    >
      <div className="flex gap-2 items-start">
        {choice.portrait && <PortraitFrame spec={choice.portrait} size={40} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
              {chosen && '✓ '}
              {choice.title}
            </span>
            {choice.cost && (
              <span
                className="text-[10px] tabular-nums shrink-0"
                style={{ color: 'var(--ink-soft)' }}
              >
                {choice.cost}
              </span>
            )}
          </div>
          {choice.officer !== undefined && (
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <FiveRow abilities={choice.officer.abilities} />
              <span
                className="text-[10px] px-1 rounded-[2px]"
                style={{ border: '1px solid var(--gold)', color: 'var(--gold)' }}
              >
                {traitName(choice.officer.trait)}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>
                野心{choice.officer.ambition}
              </span>
            </div>
          )}
          <div className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--ink-soft)' }}>
            {choice.detail}
          </div>
        </div>
      </div>
    </button>
  );
}

/** 州を1つ選ばせる小さな行。派遣・募兵・北伐で使い回す */
function ProvincePicker({
  ids,
  value,
  onChange,
}: {
  ids: ProvinceId[];
  value: ProvinceId | null;
  onChange: (id: ProvinceId) => void;
}) {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mb-1.5">
      {ids.map((id) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="text-[11px] px-1.5 py-0.5 rounded-[2px]"
          style={{
            backgroundColor: value === id ? 'var(--imperial)' : 'rgba(0,0,0,0.05)',
            color: value === id ? 'var(--silk)' : 'var(--ink-soft)',
            border: '1px solid var(--bamboo)',
          }}
        >
          {PROVINCE_LABELS[id]}
        </button>
      ))}
    </div>
  );
}

export function ActionPanel({
  state,
  selected,
  onToggle,
}: {
  state: GameState;
  selected: PlayerAction[];
  onToggle: (action: PlayerAction, key: string) => void;
}) {
  const [category, setCategory] = useState<Category>('military');
  const held = Object.values(state.provinces).filter((p) => p.holder === null && p.control > 0);
  const heldIds = held.map((p) => p.id);
  const [target, setTarget] = useState<ProvinceId | null>(heldIds[0] ?? null);
  const lost = Object.values(state.provinces).filter(
    (p) => p.holder !== null && p.holder !== 'prince',
  );
  const [recoverTarget, setRecoverTarget] = useState<ProvinceId | null>(null);

  const chosenKeys = new Set(selected.map(actionKey));
  const row = (choice: Choice) => {
    const key = actionKey(choice.action);
    return (
      <ActionRow
        key={key}
        choice={choice}
        chosen={chosenKeys.has(key)}
        onToggle={() => onToggle(choice.action, key)}
      />
    );
  };

  const money = (amount: number) => `国庫 ${amount}`;
  const poor = (amount: number) => state.treasury < amount;

  return (
    <div>
      <div className="grid grid-cols-3 gap-1 mb-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className="text-[12px] py-1.5 rounded-[2px]"
            style={{
              backgroundColor: category === c.id ? 'var(--imperial)' : 'rgba(0,0,0,0.05)',
              color: category === c.id ? 'var(--silk)' : 'var(--ink-soft)',
              border: '1px solid var(--bamboo)',
              fontWeight: category === c.id ? 700 : 400,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {category === 'prince' && (
          <>
            {state.princes.length === 0 && (
              <p className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                いま封国を持つ宗室はいない
              </p>
            )}
            {row({
              action: { type: 'court_pacify_princes' },
              title: '諸王を鎮撫する',
              detail: '金を配って宗室の帰順を取り戻す',
              cost: money(PACIFY_COST),
              disabled: poor(PACIFY_COST),
            })}
            {row({
              action: { type: 'court_curtail_princes' },
              title: '削藩する',
              detail:
                '諸王の兵を召し上げて中軍に入れる。中央は強くなるが宗室の帰順を失い、野心が育つ',
              disabled: state.princes.filter((p) => !p.inRevolt).length === 0,
            })}
            {state.princes
              .filter((p) => !p.inRevolt)
              .map((prince) =>
                row({
                  action: { type: 'court_empower_prince', princeId: prince.id },
                  title: `${prince.name}に兵権を委ねる`,
                  detail: `${PROVINCE_LABELS[prince.province]}の守りが固くなるが、この王の野心が育つ（いま野心${prince.ambition}）`,
                }),
              )}
            {state.princes
              .filter((p) => !p.inRevolt)
              .map((prince) =>
                row({
                  action: { type: 'court_execute_prince', princeId: prince.id },
                  title: `${prince.name}を誅する`,
                  detail: '挙兵の芽を摘む。天命と宗室の帰順を大きく損なう',
                }),
              )}
            {state.princes
              .filter((p) => p.inRevolt)
              .map((prince) =>
                row({
                  action: { type: 'military_suppress_prince', princeId: prince.id },
                  title: `${prince.name}を討つ`,
                  detail: `${PROVINCE_LABELS[prince.province]}に拠る。手勢 ${Math.round(prince.troops)}。中軍の65%を投じる`,
                  urgent: true,
                }),
              )}
          </>
        )}

        {category === 'tribe' && (
          <>
            {Object.values(state.factions)
              .filter((f) => f.stance === 'hostile' && f.demand !== null)
              .map((faction) =>
                row({
                  action: { type: 'tribe_accept_demand', factionId: faction.id },
                  title: `${FACTION_LABELS[faction.id]}の要求を飲む`,
                  detail: '行動枠を消費しない。ただし必ず何かを恒久的に差し出す',
                  urgent: true,
                }),
              )}
            {Object.values(state.factions)
              .filter((f) => f.stance === 'hostile' && f.location !== 'exterior')
              .map((faction) =>
                row({
                  action: { type: 'tribe_tribute', factionId: faction.id, amount: 0 },
                  title: `${FACTION_LABELS[faction.id]}に歳幣を送る`,
                  detail: 'その年は攻めてこない。相手の兵の一部も解ける',
                  cost: money(tributeCost(state, faction.id)),
                  disabled: poor(tributeCost(state, faction.id)),
                }),
              )}
            {Object.values(state.factions)
              .filter((f) => f.stance === 'hostile')
              .map((faction) =>
                row({
                  action: { type: 'tribe_hire', factionId: faction.id },
                  title: `${FACTION_LABELS[faction.id]}を義従として雇う`,
                  detail:
                    '戦線が安く埋まる。だが給は年ごとに膨らみ、絶えれば寝返る。士族は嫌う',
                  cost: money(auxiliaryPay(state, faction.id)),
                  disabled: poor(auxiliaryPay(state, faction.id)),
                }),
              )}
            {(Object.keys(state.homelands) as HomelandId[])
              .filter((id) => canSubdueHomeland(state, id))
              .map((id) =>
                row({
                  action: { type: 'tribe_subdue_homeland', homelandId: id },
                  title: `${HOMELAND_LABELS[id]}を討つ`,
                  detail:
                    '塞外へ遠征する。守るのはその地の兵とその民の半数、そして奪った郷里の数だけ固くなる他部族の加勢',
                }),
              )}
          </>
        )}

        {category === 'military' && (
          <>
            <ProvincePicker ids={heldIds} value={target} onChange={setTarget} />
            {target &&
              row({
                action: { type: 'military_deploy', provinceId: target },
                title: `${PROVINCE_LABELS[target]}へ中軍を差し向ける`,
                detail: 'その年の守りに中軍の55%が加わる。行軍そのものが兵を減らす',
              })}
            {target &&
              row({
                action: { type: 'military_defend', provinceId: target },
                title: `${PROVINCE_LABELS[target]}の守りを固める`,
                detail: 'その州の州兵が増える',
                cost: money(DEFEND_COST),
                disabled: poor(DEFEND_COST),
              })}
            {target &&
              row({
                action: { type: 'military_recruit_province', provinceId: target },
                title: `${PROVINCE_LABELS[target]}で募兵する`,
                detail: `その土地から兵を取る。豊かで落ち着いた州ほど多く出る（戸口${Math.round(state.provinces[target].baseTax)}・支配${Math.round(state.provinces[target].control)}）`,
                cost: money(PROVINCE_RECRUIT_COST),
                disabled: poor(PROVINCE_RECRUIT_COST),
              })}
            {row({
              action: { type: 'military_conscript' },
              title: '徴募する',
              detail: '金で一律の兵を買う。どの州を持っていても同じだけ増える',
              cost: money(CONSCRIPT_COST),
              disabled: poor(CONSCRIPT_COST),
            })}
            <div className="pt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
              都督中外諸軍事 —{' '}
              {state.marshal.holder === null
                ? '空位。守りが弱くなっている'
                : `${state.marshal.holder.name}（統率${state.marshal.holder.competence}・${traitName(state.marshal.holder.trait)}・忠誠${Math.round(state.marshal.holder.loyalty)}）`}
            </div>
            {retainedOf(state).length === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--cinnabar)' }}>
                無官の配下がいない。「人事」で在野の士を登用しないと都督は立てられない
              </p>
            )}
            {/* **統率の高い者を上に出す。** 都督に問われるのは統率だから */}
            {[...retainedOf(state)]
              .sort((a, b) => b.abilities.leadership - a.abilities.leadership)
              .map((officer) =>
                row({
                  portrait: {
                    seed: officer.id,
                    role: officerRole(officer.abilities),
                    age: seededAge(officer.id, 26, 64),
                  },
                  action: { type: 'military_appoint_marshal', officerId: officer.id },
                  title: `${officer.name}を都督に任じる`,
                  officer,
                  detail: traitNote(officer.trait),
                  cost: money(APPOINT_COST),
                  disabled: poor(APPOINT_COST),
                  urgent: state.marshal.holder === null,
                }),
              )}
            {state.marshal.holder !== null &&
              row({
                action: { type: 'military_dismiss_marshal' },
                title: `${state.marshal.holder.name}を解任する`,
                detail: '天命は戻るが、その将に従っていた兵は離れる',
              })}

            <div className="pt-1 text-[11px]" style={{ color: 'var(--cinnabar)' }}>
              出征 — 中軍を割いて将に預け、州から州へ動かして城を囲む
            </div>
            {state.corps.map((corps) => {
              const here = PROVINCE_LABELS[corps.at];
              /*
               * 押した先がすぐ光るように、**選びかけの指図があればそれを出す。**
               * 部隊のいまの目的地だけを見ていたときは、州を押しても
               * 何も変わらないように見えた（年を送るまで反映されないため）
               */
              const pending = selected.find(
                (a): a is Extract<PlayerAction, { type: 'military_order_corps' }> =>
                  a.type === 'military_order_corps' && a.corpsId === corps.id,
              );
              const besieging = canCampaignAgainst(state, corps.at);
              const path = marchPath(state, corps.at, corps.target);
              return (
                <div key={corps.id} className="pl-1">
                  <div className="text-[11px]" style={{ color: 'var(--ink)' }}>
                    {corps.officer.name}の軍 — {here}／兵{Math.round(corps.troops)}／忠誠
                    {Math.round(corps.officer.loyalty)}
                    {besieging
                      ? `／${here}の城を囲んで${corps.siegeYears}年（耐久${Math.round(state.provinces[corps.at].wall)}）`
                      : corps.at === corps.target
                        ? '／駐屯'
                        : `／${PROVINCE_LABELS[corps.target]}まであと${path.length}州`}
                  </div>
                  <ProvincePicker
                    ids={lost.map((p) => p.id)}
                    value={
                      pending?.provinceId ?? (corps.target === corps.at ? null : corps.target)
                    }
                    onChange={(id) =>
                      onToggle(
                        { type: 'military_order_corps', corpsId: corps.id, provinceId: id },
                        actionKey({
                          type: 'military_order_corps',
                          corpsId: corps.id,
                          provinceId: id,
                        }),
                      )
                    }
                  />
                  {row({
                    action: { type: 'military_recall_corps', corpsId: corps.id },
                    title: `${corps.officer.name}の軍を召還する`,
                    detail: '兵は中軍へ戻り、将は配下へ戻る。帰り道でも兵は減る',
                  })}
                </div>
              );
            })}

            {lost.length > 0 && (
              <div className="pt-1">
                <ProvincePicker
                  ids={lost.map((p) => p.id)}
                  value={recoverTarget}
                  onChange={setRecoverTarget}
                />
                {recoverTarget === null && (
                  <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                    攻める州を選ぶ
                  </p>
                )}
                {recoverTarget !== null &&
                  (retainedOf(state).length === 0 ? (
                    <p className="text-[11px]" style={{ color: 'var(--cinnabar)' }}>
                      無官の配下がいない。「人事」で在野の士を登用しないと軍は出せない
                    </p>
                  ) : (
                    [...retainedOf(state)]
                      .sort((a, b) => b.abilities.leadership - a.abilities.leadership)
                      .map((officer) =>
                        row({
                          portrait: {
                            seed: officer.id,
                            role: officerRole(officer.abilities),
                            age: seededAge(officer.id, 26, 64),
                          },
                          action: {
                            type: 'military_dispatch_corps',
                            officerId: officer.id,
                            provinceId: recoverTarget,
                          },
                          title: `${officer.name}を${PROVINCE_LABELS[recoverTarget]}へ発たせる`,
                          officer,
                          detail:
                            `中軍の${Math.round(CORPS_SHARE * 100)}%（兵${Math.round(state.centralArmy * CORPS_SHARE)}）を預ける。` +
                            `${state.capitalName}から${marchPath(state, state.capital, recoverTarget).length}州の道のり`,
                          cost: money(CORPS_COST),
                          disabled: !canDispatch(state),
                        }),
                      )
                  ))}
                {state.corps.length >= CORPS_MAX && (
                  <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                    同時に出せる軍は{CORPS_MAX}つまで
                  </p>
                )}
                {state.centralArmy <= CORPS_MIN_ARMY && (
                  <p className="text-[11px]" style={{ color: 'var(--cinnabar)' }}>
                    中軍が薄すぎて軍を割けない（{CORPS_MIN_ARMY}を超えている必要がある）
                  </p>
                )}
              </div>
            )}

            <BattleChoices state={state} chosenKeys={chosenKeys} onToggle={onToggle} />
          </>
        )}

        {category === 'domestic' && (
          <>
            {row({
              action: { type: 'domestic_raise_taxes' },
              title: '税を重くする',
              detail: 'その年の収入が増えるが、士族が離れ天命も削れる',
            })}
            {row({
              action: { type: 'domestic_reorganize_army' },
              title: '軍を再編する',
              detail: '兵は生まれない。州兵を中軍に移すだけで、州の守りは薄くなる',
              cost: money(REORGANIZE_COST),
              disabled: poor(REORGANIZE_COST),
            })}
            <div className="pt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
              士族の機嫌を取る三手 — 差し出すものがそれぞれ違う
            </div>
            {row({
              action: { type: 'domestic_confirm_privilege' },
              title: '免税特権を追認する',
              detail: '戸口を恒久的に削って支持を買う',
            })}
            {row({
              action: { type: 'domestic_hold_conversation' },
              title: '清談の会を催す',
              detail: '金で買う。名士が集い、民も沸くので天命への効きが大きい',
              cost: money(CONVERSATION_COST),
              disabled: poor(CONVERSATION_COST),
            })}
            {row({
              action: { type: 'domestic_grant_rank' },
              title: '郷品を授ける',
              detail: '金も土地も要らない。代わりにその年の栄誉は朝廷ではなくその家のものになる',
            })}
            <div className="pt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
              戸口を戻す
            </div>
            {row({
              action: { type: 'domestic_settle_refugees' },
              title: '流民を屯田に入れる',
              detail: '荒れた地を起こし直す。その地を握っていた士族の支持を失う',
              cost: money(SETTLE_COST),
              disabled: poor(SETTLE_COST) || state.taxBase >= 100,
            })}
            {row({
              action: { type: 'domestic_register_households' },
              title: '土断を行う',
              detail:
                state.crossedSouthYear === null
                  ? '南渡したあとにだけ選べる'
                  : '僑郡の帳簿にしか無い戸を土地に結び直す。戸口は大きく戻るが、隠していた家の恨みを買う',
              cost: money(REGISTER_COST),
              disabled: state.crossedSouthYear === null || poor(REGISTER_COST) || state.taxBase >= 100,
            })}
            <div className="pt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
              遷都
            </div>
            {(Object.keys(PROVINCE_SEATS) as ProvinceId[])
              .filter((id) => canMoveCapital(state, id))
              .map((id) =>
                row({
                  action: { type: 'domestic_move_capital', provinceId: id },
                  title: `${PROVINCE_SEATS[id]}へ遷都する`,
                  detail: '迫られた都から逃れられる。天命を損なう',
                  cost: money(MOVE_CAPITAL_COST),
                  disabled: poor(MOVE_CAPITAL_COST),
                }),
              )}
          </>
        )}

        {category === 'people' && (
          <PeopleChoices state={state} row={row} />
        )}
        {category === 'office' && (
          <OfficeChoices state={state} chosenKeys={chosenKeys} onToggle={onToggle} row={row} />
        )}
      </div>
    </div>
  );
}

/** 会戦。相手と率いる者を選ぶ */
function BattleChoices({
  state,
  chosenKeys,
  onToggle,
}: {
  state: GameState;
  chosenKeys: Set<string>;
  onToggle: (action: PlayerAction, key: string) => void;
}) {
  const foes = availableFoes(state);
  const leaders = availableBattleLeaders(state);
  if (foes.length === 0) return null;

  const describeFoe = (foe: BattleFoe): string => {
    if (foe.kind === 'faction') return FACTION_LABELS[foe.factionId];
    if (foe.kind === 'north') return state.north?.name ?? '北朝';
    return state.princes.find((p) => p.id === foe.princeId)?.name ?? '挙兵した王';
  };

  return (
    <div className="pt-1">
      <div className="text-[11px] mb-1" style={{ color: 'var(--cinnabar)' }}>
        会戦 — 中軍の85%を投じる決戦。戦場の画面に移る
      </div>
      {leaders.length === 0 ? (
        <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
          率いられる者がいない。都督を任じるか、軍事6以上の帝が要る
        </p>
      ) : (
        foes.map((foe) =>
          leaders.map((leader) => {
            const action: PlayerAction = { type: 'military_pitched_battle', foe, leader };
            const key = actionKey(action);
            return (
              <ActionRow
                key={key}
                choice={{
                  action,
                  title: `${describeFoe(foe)}と会戦する（${leaderName(state, leader)}が率いる）`,
                  detail:
                    leader === 'sovereign'
                      ? '帝の親征。軍事能力がそのまま乗るが、大敗すれば捕らわれることがある'
                      : '都督が率いる。捕縛の危険はないが、戦勝の名は将のものになる',
                }}
                chosen={chosenKeys.has(key)}
                onToggle={() => onToggle(action, key)}
              />
            );
          }),
        )
      )}
    </div>
  );
}

/**
 * 人事。登用と恩賞。
 *
 * **どちらも行動枠を食わない。** 詔で招き、詔で賞するので1年を費やす手ではない。
 * 代わりに金がかかり、登用は断られることがある（金は戻らない）
 */
function PeopleChoices({
  state,
  row,
}: {
  state: GameState;
  row: (choice: Choice) => ReactElement;
}) {
  const wanderers = wanderersOf(state);
  const retained = retainedOf(state);
  const seated = seatedOfficers(state);
  const wavering = [...retained, ...seated].sort((a, b) => a.loyalty - b.loyalty).slice(0, 4);

  return (
    <>
      <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        登用も恩賞も行動枠を消費しない。代わりに金がかかり、登用は断られることがある
      </p>

      <div className="pt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        在野 — 登用して配下にしないと官には就けられない
      </div>
      {wanderers.length === 0 && (
        <p className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>
          いま在野に人がいない
        </p>
      )}
      {wanderers.map((officer) =>
        row({
          portrait: {
            seed: officer.id,
            role: officerRole(officer.abilities),
            age: seededAge(officer.id, 26, 64),
          },
          action: { type: 'court_recruit_officer', officerId: officer.id },
          title: `${officer.name}を登用する`,
          officer,
          detail:
            `${traitNote(officer.trait)}／応じる目 ` +
            `${Math.round(recruitChance(state, officer) * 100)}%` +
            `${officer.historical ? '' : '（無名の士）'}`,
          cost: `国庫 ${RECRUIT_COST}`,
          disabled: state.treasury < RECRUIT_COST,
        }),
      )}

      <div className="pt-2 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        恩賞 — 忠誠は年ごとに冷める。尽きた者は去り、州を預けていればその州ごと離れる
      </div>
      {wavering.length === 0 && (
        <p className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>
          仕えている者がいない
        </p>
      )}
      {wavering.map((officer) =>
        row({
          portrait: {
            seed: officer.id,
            role: officerRole(officer.abilities),
            age: seededAge(officer.id, 26, 64),
          },
          action: { type: 'court_reward_officer', officerId: officer.id },
          title: `${officer.name}に恩賞を与える`,
          officer,
          detail: `忠誠 ${Math.round(officer.loyalty)} → ${Math.round(Math.min(100, officer.loyalty + 22))}`,
          cost: `国庫 ${REWARD_COST}`,
          disabled: state.treasury < REWARD_COST,
          urgent: officer.loyalty < 25,
        }),
      )}
    </>
  );
}

/** 官職。任命は行動枠を消費しない */
function OfficeChoices({
  state,
  onToggle,
  row,
}: {
  state: GameState;
  chosenKeys: Set<string>;
  onToggle: (action: PlayerAction, key: string) => void;
  row: (choice: Choice) => ReactElement;
}) {
  const heldIds = Object.values(state.provinces)
    .filter((p) => p.holder === null && p.control > 0)
    .map((p) => p.id);
  const [seat, setSeat] = useState<ProvinceId | null>(heldIds[0] ?? null);
  const houses = allHouses();

  return (
    <>
      <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        任命は行動枠を消費しない（詔一本の話で、1年を費やす行動ではない）。
        解任のほうは枠を使う。**官に就けられるのは配下の武将だけ**で、
        在野の者は「人事」から登用する
      </p>
      {retainedOf(state).length === 0 && (
        <p className="text-[11px]" style={{ color: 'var(--cinnabar)' }}>
          いま無官の配下がいない。「人事」で在野の士を登用しないと席は埋まらない
        </p>
      )}

      <div className="pt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        録尚書事 —{' '}
        {state.chancellor
          ? `${state.chancellor.name}（政治${state.chancellor.competence}・${traitName(state.chancellor.trait)}・忠誠${Math.round(state.chancellor.loyalty)}）`
          : '空位'}
      </div>
      {retainedOf(state).map((candidate) =>
        row({
          portrait: {
            seed: candidate.id,
            role: officerRole(candidate.abilities),
            age: seededAge(candidate.id, 26, 64),
          },
          action: { type: 'court_appoint_chancellor', officialId: candidate.id },
          title: `${candidate.name}を録尚書事に`,
          officer: candidate,
          detail: `忠誠 ${Math.round(candidate.loyalty)}${candidate.gentryBorn ? '／士族の出' : ''}`,
          cost: `国庫 ${APPOINT_COST}`,
          disabled: state.treasury < APPOINT_COST,
        }),
      )}
      {state.chancellor !== null &&
        row({
          action: { type: 'court_dismiss_chancellor' },
          title: `${state.chancellor.name}を罷免する`,
          detail: '天命は戻るが、士族の支持を損なう。行動枠を消費する',
        })}

      <div className="pt-2 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        刺史 — 州の守りと支配度の回復に効く
      </div>
      <ProvincePicker ids={heldIds} value={seat} onChange={setSeat} />
      {seat && (
        <>
          <p className="text-[11px] mb-1" style={{ color: 'var(--ink-soft)' }}>
            {PROVINCE_LABELS[seat]}：
            {state.inspectors[seat]
              ? `${state.inspectors[seat]?.name}（政治${state.inspectors[seat]?.competence}・${traitName(state.inspectors[seat]?.trait ?? 'nengli')}・忠誠${Math.round(state.inspectors[seat]?.loyalty ?? 0)}）`
              : '空位'}
          </p>
          {retainedOf(state).map((candidate) =>
            row({
              portrait: {
                seed: candidate.id,
                role: officerRole(candidate.abilities),
                age: seededAge(candidate.id, 26, 64),
              },
              action: {
                type: 'court_appoint_inspector',
                provinceId: seat,
                officialId: candidate.id,
              },
              title: `${candidate.name}を${PROVINCE_LABELS[seat]}刺史に`,
              officer: candidate,
              detail: `${traitNote(candidate.trait)}／忠誠 ${Math.round(candidate.loyalty)}`,
              cost: `国庫 ${APPOINT_COST}`,
              disabled: state.treasury < APPOINT_COST,
            }),
          )}
          {state.inspectors[seat] &&
            row({
              action: { type: 'court_dismiss_inspector', provinceId: seat },
              title: `${PROVINCE_LABELS[seat]}刺史を罷免する`,
              detail: '野心の高い刺史を抱え続けると、その州ごと離れることがある',
            })}
        </>
      )}

      <div className="pt-2 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        婚姻 —{' '}
        {state.dynasty.consort
          ? `皇后は${state.dynasty.consort.name}（人望${state.dynasty.consort.abilities.charisma}）。代が替わるまで新たに迎えることはできない`
          : '皇后は空位。迎えているあいだ、后はその出自の帰順を毎年支える'}
      </div>
      {state.dynasty.consort === null && (
        <>
          {houses.slice(0, 4).map((house) => {
            const bride = brideFor(state, { kind: 'gentry', houseId: house.id });
            return row({
              action: { type: 'court_marriage', target: { kind: 'gentry', houseId: house.id } },
              title: `${house.name}の${bride.name.replace(`${house.name}の`, '')}を迎える`,
              detail: `${bride.age}歳・統治${bride.abilities.administration}・人望${bride.abilities.charisma}。士族の支持と天命が上がり、以後その支持を支える。持参の荘園に伴う免税で戸口を恒久的に失う`,
              cost: `国庫 ${MARRIAGE_COST}`,
              disabled: state.treasury < MARRIAGE_COST || state.gentry < 30,
              portrait: {
                seed: bride.id,
                role: 'empress',
                age: bride.age,
                female: true,
              },
            });
          })}
          {Object.values(state.factions)
            .filter((f) => f.stance !== 'enfeoffed')
            .slice(0, 3)
            .map((faction) => {
              const bride = brideFor(state, {
                kind: 'tribe',
                factionId: faction.id as FactionId,
              });
              return row({
                action: {
                  type: 'court_marriage',
                  target: { kind: 'tribe', factionId: faction.id as FactionId },
                },
                title: `${FACTION_LABELS[faction.id]}の${bride.name}と和親する`,
                detail: `${bride.age}歳・人望${bride.abilities.charisma}。胡族の帰順が上がり相手が味方になる。士族の支持と天命は落ち、子は混血になる`,
                cost: `国庫 ${MARRIAGE_COST}`,
                disabled: state.treasury < MARRIAGE_COST,
                portrait: {
                  seed: bride.id,
                  role: 'empress',
                  age: bride.age,
                  female: true,
                  hu: true,
                },
              });
            })}
          {state.north !== null &&
            (() => {
              const bride = brideFor(state, { kind: 'north' });
              return row({
                action: { type: 'court_marriage', target: { kind: 'north' } },
                title: `${state.north.name}の公主${bride.name}を迎える`,
                detail: `${bride.age}歳・人望${bride.abilities.charisma}。天命が大きく上がり、以後の天命の減りも和らぐ。成立しにくいこと自体が代償`,
                cost: `国庫 ${MARRIAGE_COST}`,
                disabled: state.treasury < MARRIAGE_COST,
                portrait: {
                  seed: bride.id,
                  role: 'empress',
                  age: bride.age,
                  female: true,
                  hu: true,
                },
              });
            })()}
        </>
      )}
    </>
  );
}
