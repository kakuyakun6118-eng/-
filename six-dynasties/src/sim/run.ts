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
import { evaluateScore, tick } from '../core/tick';
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

/** 方針。`general` は守りを埋めるだけ、`unifier` は北伐に枠を割く */
const STRATEGY = argOf('strategy', 'general');

function freshState(difficulty: Difficulty): GameState {
  const inspectors = (
    officialsData.inspectors as ({ provinceId: string } & Official)[]
  ).map((entry) => ({
    provinceId: entry.provinceId as ProvinceId,
    official: {
      id: entry.id,
      name: entry.name,
      competence: entry.competence,
      ambition: entry.ambition,
      tenure: entry.tenure,
      gentryBorn: entry.gentryBorn,
    },
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
  const held = Object.values(state.provinces).filter((p) => p.holder === null && p.control > 0);

  // 突きつけられた要求には答える（枠を消費しない）
  for (const faction of Object.values(state.factions)) {
    if (faction.stance === 'hostile' && faction.demand?.type === 'gold') {
      actions.push({ type: 'tribe_accept_demand', factionId: faction.id });
      break;
    }
  }

  // 都督が空位なら埋める
  if (state.marshal.holder === null && state.treasury > 200) {
    actions.push({ type: 'military_appoint_marshal' });
  }

  // 挙兵した王がいれば討つ
  const rebel = state.princes.find((p) => p.inRevolt);
  if (rebel !== undefined && actions.length < MAX_ACTIONS_PER_TURN) {
    actions.push({ type: 'military_suppress_prince', princeId: rebel.id });
  }

  // 宗室の帰順が危ういなら鎮撫する
  if (
    actions.length < MAX_ACTIONS_PER_TURN &&
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
  if (threatened !== undefined && actions.length < MAX_ACTIONS_PER_TURN) {
    actions.push({ type: 'military_deploy', provinceId: threatened.id });
  }

  // 士族の支持が細ったら機嫌を取る
  if (actions.length < MAX_ACTIONS_PER_TURN && state.gentry < 35) {
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
  if (actions.length < MAX_ACTIONS_PER_TURN && state.centralArmy < 90 && state.treasury > 200) {
    const rich = held.sort((a, b) => b.baseTax * b.control - a.baseTax * a.control)[0];
    if (rich !== undefined) {
      actions.push({ type: 'military_recruit_province', provinceId: rich.id });
    }
  }

  // 失った州が多ければ北伐を試みる
  const lost = Object.values(state.provinces).filter(
    (p) => p.holder !== null && p.holder !== 'prince',
  );
  const threshold = STRATEGY === 'unifier' ? 90 : 160;
  const eagerness = STRATEGY === 'unifier' ? 0.9 : 0.25;
  if (
    actions.length < MAX_ACTIONS_PER_TURN &&
    lost.length > 0 &&
    state.centralArmy > threshold &&
    rng() < eagerness
  ) {
    // 弱い相手から取り返す。北朝を抱えた州は最後に回す
    const ordered = [...lost].sort(
      (a, b) => (a.holder === 'north' ? 1 : 0) - (b.holder === 'north' ? 1 : 0),
    );
    actions.push({ type: 'military_northern_expedition', provinceId: ordered[0].id });
  }

  // それでも枠が余っていれば税を取り立てる
  if (actions.length < MAX_ACTIONS_PER_TURN && state.treasury < 200 && rng() < 0.5) {
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
}

function runOne(difficulty: Difficulty, seed: number): Outcome {
  let state = freshState(difficulty);
  const rng = createRng(seed);

  while (state.status === 'ongoing' && state.year < ENDING_YEAR) {
    state = tick(state, chooseActions(state, rng), seed + state.turn);
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
}
