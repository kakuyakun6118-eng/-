/*
 * ヘッドレスで通しの局を回し、結末の分布を出す。
 *   npm run sim -- --trials 200 --difficulty standard
 *
 * 画面を通さずに計測できるので、調整はここの数字を見て行う。
 * 方針AIは「そこそこ真っ当な打ち手」を模したもので、上手さの上限ではない
 */
import dynastyData from '../data/dynasty.json';
import factionsData from '../data/factions.json';
import homelandsData from '../data/homelands.json';
import officialsData from '../data/officials.json';
import princesData from '../data/princes.json';
import provincesData from '../data/provinces.json';
import { DIFFICULTY_LABELS, ENDING_YEAR, MAX_ACTIONS_PER_TURN } from '../core/constants';
import { createInitialState } from '../core/economy';
import { createRng } from '../core/rng';
import { canCampaignAgainst, canDispatch } from '../core/corps';
import { consumesActionSlot, evaluateScore, tick } from '../core/tick';
import type {
  Difficulty,
  Dynasty,
  Faction,
  GameState,
  Homeland,
  Official,
  PlayerAction,
  Prince,
  Province,
  ProvinceId,
} from '../core/types';

function argOf(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

/** 方針。`general` は守りを埋めるだけ、`unifier` は出征に枠を割く */
const STRATEGY = argOf('strategy', 'general');

/**
 * 中軍をどこまで積むか。**方針とは別の軸として外から与えられるようにしてある。**
 *
 * 出征は積んだ軍を割いて出すものなので、薄い中軍のままでは部隊が
 * 城に取りつく前に崩れる（90で回すと中級では城がひとつも落ちない）。
 * だが「積むこと」そのものが守りも厚くするので、方針の比較で軍の量まで
 * 一緒に動かすと、出征の損得が軍の量の損得に紛れる。
 * `npm run sim -- --strategy general --army 150` で、
 * **同じだけ積んで出さなかった場合**が測れる
 */
const ARMY_TARGET = Number(argOf('army', STRATEGY === 'unifier' ? '150' : '90'));

function freshState(difficulty: Difficulty): GameState {
  const inspectors = (
    officialsData.inspectors as ({ provinceId: string } & Official)[]
  ).map((entry) => ({
    provinceId: entry.provinceId as ProvinceId,
    // 名簿の欄がそのまま武将の欄なので、丸ごと渡す
  official: entry as Official,
  }));

  return createInitialState(
    provincesData as Province[],
    factionsData as Faction[],
    homelandsData as Homeland[],
    princesData as Prince[],
    JSON.parse(JSON.stringify(dynastyData)) as Dynasty,
    JSON.parse(JSON.stringify(officialsData.chancellor)) as Official,
    inspectors,
    difficulty,
  );
}

/**
 * 方針AI。毎年2つまでの行動を選ぶ。
 *
 * 「危ういところを順に埋める」だけの素朴な打ち手にしてある。
 * 巧い打ち手を模すと、調整すべき下限が見えなくなるため
 */
function chooseActions(state: GameState, rng: () => number): PlayerAction[] {
  const actions: PlayerAction[] = [];
  /*
   * **枠を数えるのは枠を食う手だけ。**
   * 応答と人事は枠を食わないのに `actions.length` で数えていたときは、
   * 登用と刺史の任命が二つの枠を潰し、募兵も派遣もできないまま
   * 中軍が0のまま滅んだ（中級の存続が59%から0%へ落ちた）
   */
  const slots = () => actions.filter(consumesActionSlot).length;
  const held = Object.values(state.provinces).filter((p) => p.holder === null && p.control > 0);

  // 突きつけられた要求には答える（枠を消費しない）
  for (const faction of Object.values(state.factions)) {
    if (faction.stance === 'hostile' && faction.demand?.type === 'gold') {
      actions.push({ type: 'tribe_accept_demand', factionId: faction.id });
      break;
    }
  }

  /*
   * 人を抱えていなければ登用する。**任命はそのあとの話。**
   * 名簿が空のまま都督を任じようとしても席は埋まらない
   */
  const retained = state.candidates.filter((o) => o.retained);
  const seatsToFill =
    state.marshal.holder === null || Object.keys(state.inspectors).length < 3;
  // 出征に枠を割く方針は将を余分に抱える。席を埋めた上で野へ出す者が要る
  const wanted = STRATEGY === 'unifier' ? 2 : 1;
  if (
    retained.length < wanted &&
    (seatsToFill || STRATEGY === 'unifier') &&
    state.treasury > 200
  ) {
    const best = [...state.candidates]
      .filter((o) => !o.retained)
      .sort((a, b) => b.abilities.leadership - a.abilities.leadership)[0];
    if (best !== undefined) actions.push({ type: 'court_recruit_officer', officerId: best.id });
  }

  /*
   * 都督が空位なら埋める。**登用したその年のうちに任じる。**
   * 翌年に回していたときは、登用の年と任命の年が交互になり、
   * 都督が居る年が26%しかなかった（席が空いていれば守りがそのぶん薄い）
   */
  const recruiting = actions.some((a) => a.type === 'court_recruit_officer');
  if (
    state.marshal.holder === null &&
    (retained.length > 0 || recruiting) &&
    state.treasury > 200
  ) {
    actions.push({ type: 'military_appoint_marshal' });
  }

  /*
   * 空いた州へ刺史を置く。**任命は枠を食わないので、置かない理由がない。**
   * 刺史は守りと支配度の回復に効き、個性によっては開発や城の修復にも効く
   */
  // 出征に枠を割く方針は、野へ出す一人を残して刺史を置く
  const sparesKept = STRATEGY === 'unifier' ? 1 : 0;
  if (
    retained.length > sparesKept &&
    state.treasury > 520 &&
    Object.keys(state.inspectors).length < 5
  ) {
    const vacant = held
      .filter((p) => state.inspectors[p.id] === undefined)
      .sort((a, b) => b.baseTax * b.control - a.baseTax * a.control)[0];
    const spare = [...retained].sort(
      (a, b) => b.abilities.politics - a.abilities.politics,
    )[0];
    if (vacant !== undefined && spare !== undefined) {
      actions.push({
        type: 'court_appoint_inspector',
        provinceId: vacant.id,
        officialId: spare.id,
      });
    }
  }

  // 忠誠が細った者に恩賞を出す。放っておくと州ごと離れる
  if (state.treasury > 480) {
    const wavering = [...retained, ...Object.values(state.inspectors), state.marshal.holder]
      .filter((o): o is NonNullable<typeof o> => o !== null && o !== undefined && o.loyalty < 22)
      .sort((a, b) => a.loyalty - b.loyalty)[0];
    if (wavering !== undefined) {
      actions.push({ type: 'court_reward_officer', officerId: wavering.id });
    }
  }

  // 挙兵した王がいれば討つ
  const rebel = state.princes.find((p) => p.inRevolt);
  if (rebel !== undefined && slots() < MAX_ACTIONS_PER_TURN) {
    actions.push({ type: 'military_suppress_prince', princeId: rebel.id });
  }

  // 宗室の帰順が危ういなら鎮撫する
  if (
    slots() < MAX_ACTIONS_PER_TURN &&
    state.princeLoyalty < 40 &&
    state.treasury > 300
  ) {
    actions.push({ type: 'court_pacify_princes' });
  }

  // いちばん危ない州へ中軍を差し向ける
  const threatened = held
    .filter((p) =>
      Object.values(state.factions).some(
        (f) => f.stance === 'hostile' && f.location === p.id,
      ),
    )
    .sort((a, b) => a.control - b.control)[0];
  if (threatened !== undefined && slots() < MAX_ACTIONS_PER_TURN) {
    actions.push({ type: 'military_deploy', provinceId: threatened.id });
  }

  // 士族の支持が細ったら機嫌を取る
  if (slots() < MAX_ACTIONS_PER_TURN && state.gentry < 35) {
    actions.push({ type: 'domestic_confirm_privilege' });
  }

  /*
   * 軍が細ったら建て直す。
   *
   * これを「国庫に余裕があるとき」だけにしていたときは、中軍が0のまま
   * 90年を過ごす局が出た。金は積み上がるのに兵がいないので何も起きず、
   * 312年から402年までどの数値も動かない死んだ局面になった。
   * **軍を保つことは余裕のある年の贅沢ではなく、毎年の課題**
   */
  if (slots() < MAX_ACTIONS_PER_TURN && state.centralArmy < ARMY_TARGET && state.treasury > 200) {
    const rich = held.sort((a, b) => b.baseTax * b.control - a.baseTax * a.control)[0];
    if (rich !== undefined) {
      actions.push({ type: 'military_recruit_province', provinceId: rich.id });
    }
  }

  /*
   * 失った州があれば軍を出す。**出すのは1年の手、あとは詔で足りる。**
   * 着くまでに何年かかるかは道のりで決まるので、出しっぱなしにはできない
   */
  const lost = Object.values(state.provinces).filter(
    (p) => p.holder !== null && p.holder !== 'prince',
  );
  const threshold = STRATEGY === 'unifier' ? 110 : 200;
  const eagerness = STRATEGY === 'unifier' ? 0.85 : 0.2;

  // 目的の州を取り終えた部隊には、次の州を指す（枠は使わない）
  for (const corps of state.corps) {
    if (corps.at !== corps.target) continue;
    if (canCampaignAgainst(state, corps.at)) continue;
    const near = lost.sort((a, b) => a.wall - b.wall)[0];
    if (near !== undefined) {
      actions.push({ type: 'military_order_corps', corpsId: corps.id, provinceId: near.id });
    } else {
      actions.push({ type: 'military_recall_corps', corpsId: corps.id });
    }
  }

  if (
    slots() < MAX_ACTIONS_PER_TURN &&
    lost.length > 0 &&
    canDispatch(state) &&
    state.centralArmy > threshold &&
    rng() < eagerness
  ) {
    // 弱い城から取り返す。北朝の抱えた州は最後に回す
    const ordered = [...lost].sort(
      (a, b) =>
        (a.holder === 'north' ? 1 : 0) - (b.holder === 'north' ? 1 : 0) || a.wall - b.wall,
    );
    const general = [...retained].sort(
      (a, b) => b.abilities.leadership - a.abilities.leadership,
    )[0];
    if (general !== undefined) {
      actions.push({
        type: 'military_dispatch_corps',
        officerId: general.id,
        provinceId: ordered[0].id,
      });
    }
  }

  // それでも枠が余っていれば税を取り立てる
  if (slots() < MAX_ACTIONS_PER_TURN && state.treasury < 200 && rng() < 0.5) {
    actions.push({ type: 'domestic_raise_taxes' });
  }

  return actions;
}

interface Outcome {
  status: string;
  year: number;
  score: number;
  provinces: number;
  houses: number;
  crossedSouth: boolean;
  unified: boolean;
  northFounded: number | null;
  northOffensive: boolean;
  northName: string;
  mandate: number;
  taxBase: number;
  kingdoms: number;
  proclaimed: number;
  everProclaimed: number;
  peakProclaimed: number;
  princeTookCapital: boolean;
  marshalRatio: number;
  defections: number;
  inspectorAvg: number;
  citiesLost: number;
  citiesTaken: number;
  corpsBroken: number;
}

function runOne(difficulty: Difficulty, seed: number): Outcome {
  let state = freshState(difficulty);
  const rng = createRng(seed);
  let princeSeized = false;
  let marshalYears = 0;
  let defections = 0;
  let inspectorYears = 0;
  let citiesTaken = 0;
  let corpsBroken = 0;
  // 帝を称したことのある勢力（延べ）と、同時に並び立った最大の数
  const everProclaimed = new Set<string>();
  let peakProclaimed = 0;

  while (state.status === 'ongoing' && state.year < ENDING_YEAR) {
    state = tick(state, chooseActions(state, rng), seed + state.turn);
    if (state.turnEvents.includes('prince_took_capital')) princeSeized = true;
    if (state.marshal.holder !== null) marshalYears++;
    inspectorYears += Object.keys(state.inspectors).length;
    if (state.turnEvents.includes('officer_defected')) defections++;
    citiesTaken += state.turnEvents.filter((e) => e === 'corps_took_city').length;
    corpsBroken += state.turnEvents.filter((e) => e === 'corps_broken').length;
    let now = 0;
    for (const f of Object.values(state.factions)) {
      if (f.proclaimedYear === null) continue;
      everProclaimed.add(f.id);
      now++;
    }
    peakProclaimed = Math.max(peakProclaimed, now);
  }
  const score = evaluateScore(state);
  return {
    status: state.status,
    year: state.year,
    score: score.score,
    provinces: score.provincesHeld,
    houses: score.houseChanges,
    crossedSouth: state.crossedSouthYear !== null,
    unified: state.unifiedYear !== null,
    northFounded: state.north?.foundedYear ?? null,
    northOffensive: state.north?.offensiveSince != null,
    northName: state.north?.name ?? '-',
    mandate: state.mandate,
    taxBase: state.taxBase,
    kingdoms: Object.values(state.factions).filter((f) => f.stance === 'enfeoffed').length,
    proclaimed: Object.values(state.factions).filter((f) => f.proclaimedYear !== null).length,
    everProclaimed: everProclaimed.size,
    peakProclaimed,
    princeTookCapital: princeSeized,
    marshalRatio: marshalYears / Math.max(1, state.turn),
    defections,
    inspectorAvg: inspectorYears / Math.max(1, state.turn),
    citiesLost: Object.values(state.provinces).filter((p) => p.holder !== null).length,
    citiesTaken,
    corpsBroken,
  };
}

function parseArg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const trials = Number(parseArg('trials', '200'));
const only = parseArg('difficulty', 'all');
const difficulties: Difficulty[] =
  only === 'all' ? ['beginner', 'standard', 'veteran'] : [only as Difficulty];

for (const difficulty of difficulties) {
  const outcomes: Outcome[] = [];
  for (let i = 0; i < trials; i++) outcomes.push(runOne(difficulty, 1000 + i * 7919));

  const count = (predicate: (o: Outcome) => boolean) =>
    outcomes.filter(predicate).length;
  const pct = (n: number) => `${((n / trials) * 100).toFixed(0)}%`;
  const mean = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

  const survivors = outcomes.filter((o) => o.status !== 'fallen');
  console.log(`\n── ${DIFFICULTY_LABELS[difficulty]}（${trials}試行） ──`);
  console.log(`  存続 ${pct(count((o) => o.status === 'survived'))}`);
  console.log(`  統一 ${pct(count((o) => o.status === 'unified'))}`);
  console.log(`  滅亡 ${pct(count((o) => o.status === 'fallen'))}`);
  console.log(`  南渡した局 ${pct(count((o) => o.crossedSouth))}`);
  console.log(`  滅亡した年の平均 ${mean(outcomes.filter((o) => o.status === 'fallen').map((o) => o.year)).toFixed(0)}`);
  console.log(`  王朝の交替 平均 ${mean(outcomes.map((o) => o.houses)).toFixed(1)} 回`);
  console.log(`  生存者の保持州 平均 ${mean(survivors.map((o) => o.provinces)).toFixed(1)}`);
  console.log(`  生存者のスコア 平均 ${mean(survivors.map((o) => o.score)).toFixed(0)}`);
  console.log(`  北朝が立った局 ${pct(count((o) => o.northFounded !== null))}（平均 ${mean(outcomes.filter((o) => o.northFounded !== null).map((o) => o.northFounded as number)).toFixed(0)}年）`);
  console.log(`  南征が始まった局 ${pct(count((o) => o.northOffensive))}`);
  console.log(`  終局の天命 平均 ${mean(outcomes.map((o) => o.mandate)).toFixed(0)} / 戸口 ${mean(outcomes.map((o) => o.taxBase)).toFixed(0)}`);
  console.log(`  胡族の建国 平均 ${mean(outcomes.map((o) => o.kingdoms)).toFixed(1)} 国`);
  console.log(`  帝を称した胡族 延べ ${mean(outcomes.map((o) => o.everProclaimed)).toFixed(1)} 勢力／同時に最大 ${mean(outcomes.map((o) => o.peakProclaimed)).toFixed(1)}／終局に残る ${mean(outcomes.map((o) => o.proclaimed)).toFixed(1)}`);
  console.log(`  藩王が帝位に即いた局 ${pct(count((o) => o.princeTookCapital))}`);
  console.log(`  都督が居る年の割合 ${(mean(outcomes.map((o) => o.marshalRatio)) * 100).toFixed(0)}% ／ 刺史 平均 ${mean(outcomes.map((o) => o.inspectorAvg)).toFixed(1)}人 ／ 離反 ${mean(outcomes.map((o) => o.defections)).toFixed(1)}回`);
  console.log(`  失った州 平均 ${mean(outcomes.map((o) => o.citiesLost)).toFixed(1)}`);
  console.log(`  攻め落とした城 平均 ${mean(outcomes.map((o) => o.citiesTaken)).toFixed(1)} ／ 崩れた部隊 ${mean(outcomes.map((o) => o.corpsBroken)).toFixed(1)}`);
}
