/*
 * 不変条件の点検。
 *   npm run audit
 *
 * `run.ts` が「どう転ぶか」を測るのに対し、こちらは「壊れていないか」を見る。
 * 数字の釣り合いではなく、**あってはならない状態**だけを探す。
 *
 * 三通りに分けてある。
 *   1. 値域と整合 — でたらめな手を打たせて、7パラメータと州・胡族・宗室を毎年検める
 *   2. 会戦と保存 — 布陣から決着までの経路と、欄の欠けた保存の扱い
 *   3. 筋 — 壊れてはいないが説明のつかない状態（州を持たない皇帝、動かない都…）
 *
 * 1件でも挙がれば、それは直すべき不具合である。数を見て「少ないから良い」と
 * しないこと。ここに並んだ症状は、いずれも実際にそうやって見つけて直した
 */
import dynastyData from '../data/dynasty.json';
import factionsData from '../data/factions.json';
import homelandsData from '../data/homelands.json';
import officialsData from '../data/officials.json';
import princesData from '../data/princes.json';
import provincesData from '../data/provinces.json';
import { availableBattleLeaders, availableFoes } from '../core/battle';
import { ENDING_YEAR, MAX_ACTIONS_PER_TURN, provincesToProclaim } from '../core/constants';
import { createInitialState } from '../core/economy';
import { canCampaignAgainst } from '../core/corps';
import { NEIGHBOURS, marchPath } from '../core/geography';
import { seatedOfficers } from '../core/officers';
import { appointMarshal } from '../core/officials';
import { createRng } from '../core/rng';
import { deserialize, serialize } from '../core/save';
import { advanceBattle, beginTurn, concludeBattle, deployBattle, tick } from '../core/tick';
import type {
  Difficulty,
  Dynasty,
  Faction,
  FactionId,
  GameState,
  Homeland,
  HomelandId,
  Official,
  PlayerAction,
  Prince,
  Province,
  ProvinceId,
  WingId,
} from '../core/types';

function argOf(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

/** 1難易度あたりの局数。増やすほど稀な破れが出やすい */
const GAMES = argOf('games', 60);

const DIFFICULTIES: Difficulty[] = ['beginner', 'standard', 'veteran'];

const inspectors = (
  officialsData.inspectors as ({ provinceId: string } & Official)[]
).map((entry) => ({
  provinceId: entry.provinceId as ProvinceId,
  // 名簿の欄がそのまま武将の欄なので、丸ごと渡す
  official: entry as Official,
}));

const copy = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

function freshState(difficulty: Difficulty): GameState {
  return createInitialState(
    copy<Province[]>(provincesData),
    copy<Faction[]>(factionsData),
    copy<Homeland[]>(homelandsData),
    copy<Prince[]>(princesData),
    copy<Dynasty>(dynastyData),
    copy<Official>(officialsData.chancellor),
    inspectors,
    difficulty,
  );
}

/** 症状ごとに件数と実例を1つだけ控える。同じ破れが万件並んでも読めないため */
const problems = new Map<string, { count: number; sample: string }>();
function flag(symptom: string, sample: string): void {
  const found = problems.get(symptom);
  if (found === undefined) problems.set(symptom, { count: 1, sample });
  else found.count++;
}

const finite = (value: number): boolean => Number.isFinite(value);

// ── 1. 値域と整合 ──────────────────────────────────────

function checkState(state: GameState, where: string): void {
  const bounded: [string, number][] = [
    ['taxBase', state.taxBase],
    ['mandate', state.mandate],
    ['gentry', state.gentry],
    ['princeLoyalty', state.princeLoyalty],
    ['tribalLoyalty', state.tribalLoyalty],
  ];
  for (const [name, value] of [...bounded, ['treasury', state.treasury] as [string, number]]) {
    if (!finite(value)) flag(`${name} が数でない`, `${where} ${name}=${value}`);
  }
  for (const [name, value] of bounded) {
    if (value < 0 || value > 100) flag(`${name} が0〜100の外`, `${where} ${name}=${value.toFixed(2)}`);
  }
  if (state.centralArmy < 0) flag('中軍が負', `${where} ${state.centralArmy}`);

  for (const province of Object.values(state.provinces)) {
    const at = `${where} ${province.id}`;
    if (!finite(province.control) || province.control < 0 || province.control > 100) {
      flag('支配度が範囲外', `${at}=${province.control}`);
    }
    if (!finite(province.wall) || province.wall < 0 || province.wall > province.wallMax + 0.001) {
      flag('城の耐久が範囲外', `${at} 耐久=${province.wall}／${province.wallMax}`);
    }
    if (!finite(province.garrison) || province.garrison < 0) flag('州兵が負', `${at}=${province.garrison}`);
    if (!finite(province.baseTax) || province.baseTax < 0 || province.baseTax > province.baseTaxMax + 0.001) {
      flag('戸口の豊かさが範囲外', `${at}=${province.baseTax}`);
    }
    // 支配度も城も尽きた州が朝廷の手に残るのは、攻め手を見失ったとき
    if (province.holder === null && province.control <= 0 && province.wall <= 0) {
      flag('朝廷の州なのに支配度も城も尽きている', at);
    }
  }

  for (const faction of Object.values(state.factions)) {
    const at = `${where} ${faction.id}`;
    if (!finite(faction.strength) || faction.strength < 0) flag('胡族の兵が負', `${at}=${faction.strength}`);
    if (faction.strength > faction.strengthMax + 0.001) {
      flag('胡族の兵が天井超え', `${at}=${faction.strength.toFixed(1)}／${faction.strengthMax}`);
    }
    if (faction.location !== 'exterior' && state.provinces[faction.location] === undefined) {
      flag('胡族が存在しない州にいる', `${at}@${faction.location}`);
    }
  }

  for (const prince of state.princes) {
    const at = `${where} ${prince.name}`;
    if (!finite(prince.troops) || prince.troops < 0) flag('藩王の兵が負', `${at}=${prince.troops}`);
    if (state.provinces[prince.province] === undefined) flag('藩王が存在しない州にいる', at);
    if (state.retiredPrinceIds.includes(prince.id)) flag('退場したはずの藩王が名簿にいる', at);
  }
  const princeIds = state.princes.map((p) => p.id);
  if (new Set(princeIds).size !== princeIds.length) flag('藩王が重複している', `${where} ${princeIds.join('・')}`);

  const ruler = state.dynasty.ruler;
  if (!finite(ruler.age) || ruler.age < 0) flag('帝の年齢が異常', `${where} ${ruler.name}=${ruler.age}`);
  if (!finite(ruler.lifespan) || ruler.lifespan <= 0) flag('帝の天寿が異常', `${where} ${ruler.name}=${ruler.lifespan}`);
  for (const ability of Object.values(ruler.abilities)) {
    if (!Number.isInteger(ability) || ability < 1 || ability > 10) {
      flag('帝の能力が1〜10の外', `${where} ${ruler.name}=${ability}`);
    }
  }
  if (state.dynasty.members.some((m) => m.id === ruler.id)) {
    flag('即位した者が継承候補に残っている', `${where} ${ruler.name}`);
  }
  /*
   * 武将は**一人につき一か所**にしかいない。名簿と席の両方に同じ者が
   * 載っていると、恩賞が二重に効いたり、去ったはずの者が残ったりする
   */
  const everyone = [
    ...state.candidates,
    ...seatedOfficers(state),
    ...state.corps.map((c) => c.officer),
  ];
  const ids = everyone.map((o) => o.id);
  if (new Set(ids).size !== ids.length) {
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    flag('同じ武将が二か所にいる', `${where} ${dup}`);
  }
  for (const officer of everyone) {
    const at = `${where} ${officer.name}`;
    if (!finite(officer.loyalty) || officer.loyalty < 0 || officer.loyalty > 100) {
      flag('忠誠が0〜100の外', `${at}=${officer.loyalty}`);
    }
    for (const value of Object.values(officer.abilities)) {
      if (!Number.isInteger(value) || value < 1 || value > 10) {
        flag('武将の能力が1〜10の外', `${at}=${value}`);
      }
    }
    if (state.year > officer.untilYear) flag('去るべき年を過ぎた武将が残っている', at);
  }
  for (const officer of seatedOfficers(state)) {
    if (!officer.retained && officer.historical) {
      // 席に就いている以上は配下のはず（登用せずに官へは就けない）
      flag('登用していない者が官に就いている', `${where} ${officer.name}`);
    }
  }

  /*
   * 出征軍。**兵は中軍から割いた移し替えなので、湧いても消えてもならない。**
   * 存在しない州に立っている部隊や、目的の州へ道の無い部隊も破れになる
   */
  const corpsIds = state.corps.map((c) => c.id);
  if (new Set(corpsIds).size !== corpsIds.length) {
    flag('同じ部隊が二つある', `${where} ${corpsIds.join('・')}`);
  }
  for (const corps of state.corps) {
    const at = `${where} ${corps.officer.name}の軍`;
    if (!finite(corps.troops) || corps.troops < 0) flag('出征軍の兵が負', `${at}=${corps.troops}`);
    if (state.provinces[corps.at] === undefined) flag('出征軍が存在しない州にいる', `${at}@${corps.at}`);
    if (state.provinces[corps.target] === undefined) {
      flag('出征軍が存在しない州を目指している', `${at}→${corps.target}`);
    }
    if (corps.siegeYears < 0 || !finite(corps.siegeYears)) {
      flag('攻城の年数が異常', `${at}=${corps.siegeYears}`);
    }
    // 自領に立ったまま攻城の年数を数えているのは、囲みを畳み忘れた跡
    if (corps.siegeYears > 0 && !canCampaignAgainst(state, corps.at)) {
      flag('囲んでいない部隊が攻城の年数を持っている', `${at}@${corps.at}`);
    }
  }

  if (state.north !== null && (!finite(state.north.strength) || state.north.strength < 0)) {
    flag('北朝の兵が異常', `${where} ${state.north.strength}`);
  }
  if (state.provinces[state.capital] === undefined) flag('都が存在しない州', `${where} ${state.capital}`);
}

/**
 * でたらめな手を打つ。
 *
 * 素朴な方針AI（`run.ts`）が選ぶのは全体のごく一部なので、
 * 打たれない手に潜んだ破れが残る。**選べる手はすべて打たせる**
 */
function randomActions(state: GameState, rng: () => number): PlayerAction[] {
  const held = Object.values(state.provinces).filter((p) => p.holder === null && p.control > 0);
  const pool: PlayerAction[] = [
    { type: 'court_pacify_princes' },
    { type: 'court_curtail_princes' },
    { type: 'court_dismiss_chancellor' },
    { type: 'military_conscript' },
    { type: 'military_appoint_marshal' },
    { type: 'military_dismiss_marshal' },
    { type: 'domestic_raise_taxes' },
    { type: 'domestic_reorganize_army' },
    { type: 'domestic_confirm_privilege' },
    { type: 'domestic_hold_conversation' },
    { type: 'domestic_grant_rank' },
    { type: 'domestic_settle_refugees' },
    { type: 'domestic_register_households' },
  ];
  for (const province of held) {
    pool.push({ type: 'military_deploy', provinceId: province.id });
    pool.push({ type: 'military_defend', provinceId: province.id });
    pool.push({ type: 'military_recruit_province', provinceId: province.id });
    pool.push({ type: 'domestic_move_capital', provinceId: province.id });
    pool.push({ type: 'court_dismiss_inspector', provinceId: province.id });
  }
  for (const province of Object.values(state.provinces)) {
    if (province.holder === null) continue;
    for (const officer of state.candidates) {
      if (!officer.retained) continue;
      pool.push({
        type: 'military_dispatch_corps',
        officerId: officer.id,
        provinceId: province.id,
      });
    }
  }
  for (const corps of state.corps) {
    pool.push({ type: 'military_recall_corps', corpsId: corps.id });
    pool.push({ type: 'court_reward_officer', officerId: corps.officer.id });
    for (const province of Object.values(state.provinces)) {
      pool.push({ type: 'military_order_corps', corpsId: corps.id, provinceId: province.id });
    }
  }
  // 人事も打たせる。登用と恩賞は枠を食わないが、状態は動かす
  for (const officer of state.candidates) {
    pool.push({ type: 'court_recruit_officer', officerId: officer.id });
    pool.push({ type: 'court_reward_officer', officerId: officer.id });
    if (officer.retained) pool.push({ type: 'military_appoint_marshal', officerId: officer.id });
  }
  for (const faction of Object.values(state.factions)) {
    pool.push({ type: 'tribe_tribute', factionId: faction.id, amount: 0 });
    pool.push({ type: 'tribe_hire', factionId: faction.id });
    pool.push({ type: 'tribe_accept_demand', factionId: faction.id });
    pool.push({ type: 'court_marriage', target: { kind: 'tribe', factionId: faction.id } });
    if (held[0] !== undefined) {
      pool.push({ type: 'tribe_enfeoff', factionId: faction.id, provinceId: held[0].id });
    }
  }
  for (const homelandId of Object.keys(state.homelands) as HomelandId[]) {
    pool.push({ type: 'tribe_subdue_homeland', homelandId });
  }
  for (const prince of state.princes) {
    pool.push({ type: 'court_execute_prince', princeId: prince.id });
    pool.push({ type: 'court_empower_prince', princeId: prince.id });
    pool.push({ type: 'military_suppress_prince', princeId: prince.id });
  }
  for (const candidate of state.candidates) {
    pool.push({ type: 'court_appoint_chancellor', officialId: candidate.id });
    if (held[0] !== undefined) {
      pool.push({ type: 'court_appoint_inspector', provinceId: held[0].id, officialId: candidate.id });
    }
  }

  const actions: PlayerAction[] = [];
  for (let i = 0; i < MAX_ACTIONS_PER_TURN; i++) {
    const pick = pool[Math.floor(rng() * pool.length)];
    if (pick !== undefined) actions.push(pick);
  }
  return actions;
}

function auditInvariants(): string {
  let games = 0;
  let turns = 0;
  for (const difficulty of DIFFICULTIES) {
    for (let g = 0; g < GAMES; g++) {
      let state = freshState(difficulty);
      const rng = createRng(g * 104729 + 7);
      checkState(state, `${difficulty}#${g}@初期`);
      while (state.status === 'ongoing' && state.year < ENDING_YEAR) {
        try {
          state = tick(state, randomActions(state, rng), g * 1000 + state.turn);
        } catch (error) {
          flag('tick が例外を投げた', `${difficulty}#${g}@${state.year} ${(error as Error).message}`);
          break;
        }
        checkState(state, `${difficulty}#${g}@${state.year}`);
        turns++;
      }
      // 保存と読み込みの往復。終局の状態がそのまま戻ることを見る
      const round = deserialize(serialize(state, 'x'));
      if (!round.ok) flag('保存した局を読み込めない', `${difficulty}#${g} ${round.error}`);
      else if (round.state.year !== state.year) flag('往復で年がずれる', `${difficulty}#${g}`);
      games++;
    }
  }
  return `${games}局 ／ ${turns}ターン`;
}

// ── 2. 会戦と保存 ──────────────────────────────────────

function auditBattlesAndSaves(): string {
  let battles = 0;
  let rounds = 0;

  for (let g = 0; g < GAMES * 2; g++) {
    let state = freshState('standard');
    const rng = createRng(g * 31 + 3);
    state = appointMarshal(state, rng);

    for (let year = 0; year < 60 && state.status === 'ongoing'; year++) {
      const foes = availableFoes(state);
      const leaders = availableBattleLeaders(state);
      const actions: PlayerAction[] = [];
      if (foes.length > 0 && leaders.length > 0 && rng() < 0.5) {
        const mobilize = Object.values(state.provinces)
          .filter((p) => p.holder === null)
          .slice(0, 2)
          .map((p) => p.id);
        actions.push({
          type: 'military_pitched_battle',
          foe: foes[Math.floor(rng() * foes.length)],
          leader: leaders[0],
          mobilize: rng() < 0.5 ? mobilize : [],
        });
      }

      let next: GameState;
      try {
        next = beginTurn(state, actions, g * 77 + year);
      } catch (error) {
        flag('beginTurn が例外を投げた', (error as Error).message);
        break;
      }

      if (next.battlefield !== null) {
        battles++;
        // 布陣：控えを順に置き、置いてから戻す操作も混ぜる
        const ours = next.battlefield.units.filter((u) => u.side === 'court');
        const wings: WingId[] = ['left', 'center', 'right'];
        ours.forEach((unit, i) => {
          next = deployBattle(next, { placements: { [unit.id]: wings[i % 3] } });
        });
        if (rng() < 0.3 && ours[0] !== undefined) {
          next = deployBattle(next, { placements: { [ours[0].id]: null } });
        }

        let guard = 0;
        while (next.battlefield !== null && next.battlefield.phase !== 'done' && guard++ < 12) {
          try {
            next = advanceBattle(
              next,
              {
                left: 'advance',
                center: rng() < 0.5 ? 'flank' : 'advance',
                right: rng() < 0.3 ? 'withdraw' : 'advance',
              },
              g * 991 + guard,
            );
          } catch (error) {
            flag('advanceBattle が例外を投げた', (error as Error).message);
            break;
          }
          rounds++;
        }
        if (guard >= 12) flag('会戦が決着しない（12合を超えた）', `#${g}@${state.year}`);

        try {
          next = concludeBattle(next, g * 77 + year);
        } catch (error) {
          flag('concludeBattle が例外を投げた', (error as Error).message);
          break;
        }
        if (next.battlefield !== null) flag('決着後も戦場が残っている', `#${g}@${state.year}`);
        if (next.year !== state.year + 1) {
          flag('会戦の年に年が進んでいない', `${state.year}→${next.year}`);
        }
        if (!finite(next.centralArmy) || next.centralArmy < 0) {
          flag('会戦後の中軍が異常', `${next.centralArmy}`);
        }
      }
      state = next;
    }
  }

  /*
   * 欄の欠けた保存を突きつける。
   * 版を上げずに欄を足していたときは、これが**読めてしまい**、
   * 年送りの途中で「retiredPrinceIds is not iterable」で落ちた
   */
  const state = freshState('standard');
  const now = deserialize(serialize(state, 'x'));
  if (!now.ok) flag('いまの版の保存が読み込めない', now.error);

  const old = JSON.parse(serialize(state, 'x')) as { state: Record<string, unknown> };
  delete old.state.retiredPrinceIds;
  for (const province of Object.values(old.state.provinces as Record<string, Record<string, unknown>>)) {
    delete province.wall;
    delete province.wallMax;
  }
  const loaded = deserialize(JSON.stringify(old));
  if (loaded.ok) {
    try {
      tick(loaded.state, [], 1);
      flag('欄の欠けた保存を受け入れ、そのまま進めてしまう', '古い版を模した保存');
    } catch (error) {
      flag('欄の欠けた保存を受け入れたのに tick が落ちる', (error as Error).message);
    }
  }

  return `会戦 ${battles}回 ／ 激突 ${rounds}合`;
}

/**
 * 地図そのものの点検。局を回さずに一度だけ見る。
 *
 * 辺が片方向だと、行けるのに帰れない州ができる。どこかの州が孤立していると、
 * そこへ出した部隊は永久に都から動かない
 */
function auditGeography(): string {
  const ids = Object.keys(NEIGHBOURS) as ProvinceId[];
  for (const id of ids) {
    for (const other of NEIGHBOURS[id]) {
      if (NEIGHBOURS[other] === undefined) flag('隣に存在しない州がある', `${id}→${other}`);
      else if (!NEIGHBOURS[other].includes(id)) flag('隣り合いが片方向', `${id}→${other}`);
    }
    if (NEIGHBOURS[id].includes(id)) flag('州が自分の隣になっている', id);
  }

  // どの州からどの州へも道が通っていること
  const state = freshState('standard');
  let pairs = 0;
  for (const from of ids) {
    for (const to of ids) {
      if (from === to) continue;
      if (marchPath(state, from, to).length === 0) flag('道の通らない州の組', `${from}→${to}`);
      pairs++;
    }
  }
  return `${ids.length}州 ／ ${pairs}組`;
}

// ── 3. 筋が通っているか ────────────────────────────────

/** その民が攻め入れる州。`reach` の外にいれば地理が壊れている */
const REACH: Record<string, ProvinceId[]> = Object.fromEntries(
  (factionsData as Faction[]).map((f) => [f.id, f.reach]),
);

function auditCoherence(): string {
  let turns = 0;
  for (const difficulty of DIFFICULTIES) {
    for (let g = 0; g < GAMES; g++) {
      let state = freshState(difficulty);
      const rng = createRng(g * 7919 + 11);
      let previousYear = state.year;

      while (state.status === 'ongoing' && state.year < ENDING_YEAR) {
        const before = state;
        // ここでは真っ当に打つ。異常な手が招いた歪みではないことを見たいため
        const actions: PlayerAction[] = [];
        const held = Object.values(state.provinces).filter((p) => p.holder === null && p.control > 0);
        if (state.marshal.holder === null && state.treasury > 200) {
          actions.push({ type: 'military_appoint_marshal' });
        }
        const rebel = state.princes.find((p) => p.inRevolt);
        if (rebel !== undefined && actions.length < MAX_ACTIONS_PER_TURN) {
          actions.push({ type: 'military_suppress_prince', princeId: rebel.id });
        }
        if (
          actions.length < MAX_ACTIONS_PER_TURN &&
          state.centralArmy < 90 &&
          state.treasury > 200 &&
          held.length > 0
        ) {
          const rich = [...held].sort((a, b) => b.baseTax - a.baseTax)[0];
          actions.push({ type: 'military_recruit_province', provinceId: rich.id });
        }

        state = tick(state, actions, g * 1000 + state.turn);
        turns++;

        if (state.year !== previousYear + 1) flag('年が1つずつ進んでいない', `${previousYear}→${state.year}`);
        previousYear = state.year;

        for (const faction of Object.values(state.factions)) {
          if (faction.location !== 'exterior' && !REACH[faction.id].includes(faction.location)) {
            flag('胡族が手の届かない州にいる', `${faction.id}@${faction.location}`);
          }
          // 帝を称するには野心に見合う州が要る。失えば号も失う
          if (faction.proclaimedYear !== null) {
            const own = Object.values(state.provinces).filter((p) => p.holder === faction.id).length;
            const need = provincesToProclaim(faction.ambition);
            if (own === 0 && faction.proclaimedYear < state.year) {
              flag('州を1つも持たない勢力が帝を称したまま', `${faction.id} ${faction.proclaimedYear}年`);
            } else if (own > 0 && own < need) {
              flag('要る州に満たないのに帝を称している', `${faction.id} ${own}／${need}州`);
            }
          }
          // 味方として雇った民が州を奪っていれば、味方の定義が壊れている
          if (
            faction.stance === 'auxiliary' &&
            Object.values(state.provinces).some((p) => p.holder === faction.id)
          ) {
            flag('味方のはずの義従胡が州を握っている', faction.id);
          }
        }

        for (const province of Object.values(state.provinces)) {
          const holder = province.holder;
          if (holder !== null && holder !== 'north' && holder !== 'prince') {
            if (!REACH[holder].includes(province.id)) {
              flag('胡族が手の届かない州を握っている', `${holder}=${province.id}`);
            }
          }
          // 挙兵している王がいないのに藩王領が残るのは、王が去るときの後始末漏れ
          if (
            province.holder === 'prince' &&
            !state.princes.some((p) => p.inRevolt && p.province === province.id)
          ) {
            flag('挙兵者がいないのに州が藩王の手のまま', `${province.id} ${state.year}年`);
          }
        }

        if (state.north !== null) {
          const northHeld = Object.values(state.provinces).filter((p) => p.holder === 'north').length;
          if (northHeld === 0) flag('北朝が州を1つも持たない', `${state.year}年 ${state.north.name}`);
        }
        // 都を敵に押さえられた年が続くのは、退く先を探し損ねている
        if (
          state.provinces[state.capital].holder !== null &&
          before.provinces[before.capital].holder !== null
        ) {
          flag('都を失ったまま動かない年がある', `${state.year}年 ${state.capitalName}`);
        }
        if (state.status === 'unified') {
          const foesLeft =
            state.north !== null ||
            Object.values(state.factions).some((f) => f.stance === 'enfeoffed');
          if (foesLeft) flag('統一したのに敵国が残っている', `${state.year}年`);
        }
      }
    }
  }
  return `${DIFFICULTIES.length * GAMES}局 ／ ${turns}ターン`;
}

// ── 実行 ────────────────────────────────────────────────

console.log(`  1. 値域と整合  ${auditInvariants()}`);
console.log(`  2. 会戦と保存  ${auditBattlesAndSaves()}`);
console.log(`  3. 筋の通り方  ${auditCoherence()}`);
console.log(`  4. 地図の繋がり ${auditGeography()}`);

if (problems.size === 0) {
  console.log('\n破れなし');
} else {
  console.log('');
  const sorted = [...problems.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [symptom, { count, sample }] of sorted) {
    console.log(`  ✗ [${count}件] ${symptom}\n        例: ${sample}`);
  }
  process.exitCode = 1;
}
