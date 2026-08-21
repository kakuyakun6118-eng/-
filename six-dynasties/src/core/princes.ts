import princesData from '../data/princes.json';
import {
  ADULT_AGE,
  ENDING_YEAR,
  CURTAIL_ARMY_GAIN,
  CURTAIL_LOYALTY_LOSS,
  EMPOWER_AMBITION_GAIN,
  EMPOWER_GARRISON_GAIN,
  EMPOWER_LOYALTY_GAIN,
  EXECUTE_LOYALTY_LOSS,
  EXECUTE_MANDATE_LOSS,
  PACIFY_COST,
  PACIFY_LOYALTY_GAIN,
  PRINCE_AMBITION_PER_POINT,
  PRINCE_LOYALTY_PRESSURE_MAX,
  PRINCE_LOYALTY_THRESHOLD,
  PRINCE_REVOLT_ARMY_SHARE,
  PRINCE_REVOLT_BASE,
  PRINCE_REVOLT_GARRISON_SHARE,
  PRINCE_REVOLT_MANDATE_LOSS,
  PRINCE_MARCH_PROBABILITY,
  PRINCE_MARCH_MARGIN,
  PRINCE_ENTHRONE_MANDATE,
  PRINCE_ENTHRONE_GENTRY_LOSS,
} from './constants';
import { defenceStrength } from './battle';
import type { DeathRecord, GameState, Person, Prince, ProvinceId } from './types';
import { clamp100, heldProvinceIds, pick, randomInt } from './util';

const HISTORICAL_PRINCES = princesData as Prince[];

/** 宗室の諸王を同時に何人まで置くか。史実の八王がちょうど収まる数 */
const MAX_PRINCES = 5;

/**
 * 諸王の顔ぶれを年ごとに入れ替える。
 *
 * 291〜311年は史実の八王をそのまま迎える。それ以降は宗室の成人男子が
 * 封国を得る形で補充する。**南朝も宗室の乱で滅びた**（宋の元凶の変、
 * 斉の東昏侯、梁の侯景の乱に乗じた諸王の争い）ので、
 * この仕組みは八王の乱で終わらせない
 */
export function updatePrinceRoster(state: GameState, rng: () => number): GameState {
  /*
   * 舞台を去る年を過ぎた王は退場する（挙兵中の者はそのまま残す）。
   *
   * **宗室の名簿から消えた者も封国を離れる。** 王は宗室の成人男子なので、
   * 没しても位を継いでも `dynasty.members` から抜ける。抜けたのに諸王として
   * 残していると、没した王が兵を挙げ、継いだ帝が自分に対して挙兵しうる
   */
  const inHouse = new Set(state.dynasty.members.map((member) => `kin_${member.id}`));
  const gone = (prince: Prince): boolean =>
    prince.id.startsWith('kin_') && !inHouse.has(prince.id);

  const leaving = state.princes.filter(
    (p) => gone(p) || (!p.inRevolt && state.year > p.untilYear),
  );
  let princes = state.princes.filter(
    (p) => !gone(p) && (p.inRevolt || state.year <= p.untilYear),
  );

  /*
   * 一度舞台を去った王は二度と現れない。
   *
   * これが無かったときは、誅殺した趙王倫が翌年また封国を得て現れ、
   * 史実の在世年のあいだじゅう何度でも復活した（去った理由を
   * 覚えず、その年の名簿にいないことだけを見ていたため）
   */
  const retired = new Set([...state.retiredPrinceIds, ...leaving.map((p) => p.id)]);

  /*
   * 史実の八王をその年に迎える。
   *
   * **封国が朝廷の手にあるときだけ現れる。** 州の持ち主を見ずに迎えていたときは、
   * すでに氐に落ちた雍州に趙王倫が現れ、挙兵した瞬間にその州を胡族から
   * 奪い返してしまった（土地を持たない皇帝が生まれる原因にもなっていた）
   */
  const courtHeld = new Set(heldProvinceIds(state));
  for (const historical of HISTORICAL_PRINCES) {
    if (state.year < historical.fromYear || state.year > historical.untilYear) continue;
    if (retired.has(historical.id)) continue;
    if (princes.some((p) => p.id === historical.id)) continue;
    if (!courtHeld.has(historical.province)) continue;
    if (princes.length >= MAX_PRINCES) break;
    princes = [...princes, { ...historical }];
  }

  /*
   * 史実の顔ぶれが尽きたら、宗室の成人男子に封国を与える。
   *
   * **皇子も含めて数える。** 傍系（`kin`）だけを封じていたときは、
   * 開始時の一族三人を使い切ったあと諸王がひとりも現れなくなり、
   * 320年以降は**8割の年に王がいない**局になった（実測）。
   * 生まれた子はみな `child` として記録されるので、傍系は増えないためである。
   * 南朝の諸王はいずれも皇子で、宋の元凶の変も斉の諸王の相殺も皇子どうしの争いだった。
   * 「宗室に兵を預ければ中央が倒れる」という主題は、皇子を封じてはじめて立つ。
   *
   * ただし**太子は封国を持たない** — 都にいて位を継ぐ者だから、
   * 成人した嫡子の筆頭だけは諸王に数えない
   */
  if (princes.length < 3 && state.year > 311) {
    const adults = state.dynasty.members.filter((member) => member.age >= ADULT_AGE);
    const heirApparent = adults.find((member) => member.relation === 'child');
    const eligible = adults.filter((member) => member.id !== heirApparent?.id);
    const held = [...courtHeld].filter(
      (id) => !princes.some((p) => p.province === id) && id !== state.capital,
    );
    const titles = [...state.dynasty.princeTitlePool];
    for (const member of eligible) {
      if (princes.length >= 3) break;
      if (retired.has(`kin_${member.id}`)) continue;
      if (princes.some((p) => p.id === `kin_${member.id}`)) continue;
      const province = pick(rng, held);
      if (province === null) break;
      // 同じ年に二人を同じ封国へ置かない。一つの州に二人の王は立たない
      held.splice(held.indexOf(province), 1);
      // 封国の号で呼ぶ。王朝名を冠すると、即位したときに号が食い違う
      const title = titles.shift() ?? `${member.name}王`;
      princes = [
        ...princes,
        {
          id: `kin_${member.id}`,
          name: title,
          province,
          troops: randomInt(rng, 10, 20),
          abilities: {
            military: randomInt(rng, 2, 8),
            administration: randomInt(rng, 2, 8),
            charisma: randomInt(rng, 2, 8),
          },
          ambition: randomInt(rng, 3, 9),
          inRevolt: false,
          fromYear: state.year,
          /*
           * **封国は終身。** 史実の八王には史書どおりの退場年があるが、
           * 生まれた王に十年ほどの任期を与えていたときは、任期が切れた王が
           * 生きているのに二度と封じられず（退場した王は再び現れない規則のため）、
           * 成人の一族が平均1.5人しかいないこの模型では諸王が枯れた。
           * 王が去るのは没したとき・誅されたとき・位を継いだときだけである
           */
          untilYear: ENDING_YEAR,
        },
      ];
    }
  }

  if (princes === state.princes && retired.size === state.retiredPrinceIds.length) return state;

  /*
   * 去った王が挙兵中だったなら、その封国は朝廷へ戻る。
   * 戻さずにいると、拠る王がいないのに「藩王の手」のままの州が残る
   */
  let provinces = state.provinces;
  for (const departed of leaving) {
    const seat = provinces[departed.province];
    if (seat?.holder !== 'prince') continue;
    provinces = {
      ...provinces,
      [seat.id]: { ...seat, holder: null, control: Math.max(20, seat.control) },
    };
  }

  const used = princes.filter((p) => p.id.startsWith('kin_')).map((p) => p.name);
  return {
    ...state,
    princes,
    provinces,
    retiredPrinceIds: [...retired],
    dynasty: {
      ...state.dynasty,
      princeTitlePool: state.dynasty.princeTitlePool.filter((t) => !used.includes(t)),
    },
  };
}

/**
 * 挙兵の判定。**正統性に関わらず毎年引く。**
 *
 * 帰順の低さは確率を押し上げる要因として効かせ、押し上げは線形にする。
 * 閾値を下回った年にだけ引いていたときは、順調な朝廷では一度も起きず、
 * 「宗室はいつ兵を挙げてもおかしくない」という緊張が出なかった
 */
export function checkPrinceRevolts(state: GameState, rng: () => number): GameState {
  let next = state;
  const princes = [...next.princes];
  let revolted = false;

  const pressure =
    next.princeLoyalty >= PRINCE_LOYALTY_THRESHOLD
      ? 0
      : ((PRINCE_LOYALTY_THRESHOLD - next.princeLoyalty) / PRINCE_LOYALTY_THRESHOLD) *
        PRINCE_LOYALTY_PRESSURE_MAX;

  for (let i = 0; i < princes.length; i++) {
    const prince = princes[i];
    if (prince.inRevolt) continue;
    const chance =
      PRINCE_REVOLT_BASE * (1 + prince.ambition * PRINCE_AMBITION_PER_POINT) * (1 + pressure);
    if (rng() >= chance) continue;

    const province = next.provinces[prince.province];
    // 朝廷の手を離れている州は、王が挙兵しても王のものにはならない
    const canSeize = province !== undefined && province.holder === null;
    const fromGarrison = canSeize ? province.garrison * PRINCE_REVOLT_GARRISON_SHARE : 0;
    const fromArmy = next.centralArmy * PRINCE_REVOLT_ARMY_SHARE;

    princes[i] = { ...prince, inRevolt: true, troops: prince.troops + fromGarrison + fromArmy };
    next = {
      ...next,
      centralArmy: Math.max(0, next.centralArmy - fromArmy),
      provinces: !canSeize
        ? next.provinces
        : {
            ...next.provinces,
            [prince.province]: {
              ...province,
              garrison: province.garrison - fromGarrison,
              holder: 'prince',
            },
          },
    };
    revolted = true;
  }

  if (!revolted) return state;
  return {
    ...next,
    princes,
    mandate: clamp100(next.mandate - PRINCE_REVOLT_MANDATE_LOSS),
    princeLoyalty: clamp100(next.princeLoyalty - 8),
    turnEvents: [...next.turnEvents, 'prince_revolt'],
  };
}

/** 挙兵した王は年ごとに兵を蓄える */
export function growRevolts(state: GameState): GameState {
  if (!state.princes.some((p) => p.inRevolt)) return state;
  return {
    ...state,
    princes: state.princes.map((p) => (p.inRevolt ? { ...p, troops: p.troops * 1.07 } : p)),
  };
}

// ── 宗室に対する四つの手 ──────────────────────────────

/** 鎮撫。金で帰順を買う */
export function pacifyPrinces(state: GameState): GameState {
  if (state.treasury < PACIFY_COST) return state;
  return {
    ...state,
    treasury: state.treasury - PACIFY_COST,
    princeLoyalty: clamp100(state.princeLoyalty + PACIFY_LOYALTY_GAIN),
  };
}

/**
 * 削藩。諸王の兵を召し上げて中軍に入れる。
 *
 * 中央は強くなるが、宗室の帰順を失う。
 * **中央が兵を握れば辺境が落ち、辺境に兵を預ければ中央が倒れる** —
 * このゲームの第一の主題がここで表に出る
 */
export function curtailPrinces(state: GameState): GameState {
  const loyal = state.princes.filter((p) => !p.inRevolt);
  if (loyal.length === 0) return state;

  let taken = 0;
  const princes = state.princes.map((prince) => {
    if (prince.inRevolt) return prince;
    const cut = prince.troops * CURTAIL_ARMY_GAIN;
    taken += cut;
    return { ...prince, troops: prince.troops - cut, ambition: Math.min(10, prince.ambition + 1) };
  });

  return {
    ...state,
    princes,
    centralArmy: state.centralArmy + taken,
    princeLoyalty: clamp100(state.princeLoyalty - CURTAIL_LOYALTY_LOSS),
  };
}

/**
 * 誅殺。挙兵の芽を摘むが、宗室と天命を大きく失う。
 *
 * **誅した王は宗室の名簿からも消す。** 名簿に残していたときは、
 * 誅殺したはずの王がのちに帝位を継いで現れた
 */
export function executePrince(state: GameState, princeId: string): GameState {
  const prince = state.princes.find((p) => p.id === princeId);
  if (prince === undefined || prince.inRevolt) return state;

  const province = state.provinces[prince.province];
  const memberId = princeId.startsWith('kin_') ? princeId.slice('kin_'.length) : null;
  return {
    ...state,
    princes: state.princes.filter((p) => p.id !== princeId),
    retiredPrinceIds: [...state.retiredPrinceIds, princeId],
    dynasty:
      memberId === null
        ? state.dynasty
        : {
            ...state.dynasty,
            members: state.dynasty.members.filter((m) => m.id !== memberId),
          },
    // 王の手勢はその州の守備隊に編入される
    provinces:
      province === undefined
        ? state.provinces
        : {
            ...state.provinces,
            [prince.province]: { ...province, garrison: province.garrison + prince.troops * 0.5 },
          },
    mandate: clamp100(state.mandate - EXECUTE_MANDATE_LOSS),
    princeLoyalty: clamp100(state.princeLoyalty - EXECUTE_LOYALTY_LOSS),
  };
}

/**
 * 兵権を委ねる。その州は固くなり帰順も上がるが、野心が育つ。
 * 晋が宗室に兵を与えて国境を守らせた、その判断そのもの
 */
export function empowerPrince(state: GameState, princeId: string): GameState {
  const prince = state.princes.find((p) => p.id === princeId);
  if (prince === undefined || prince.inRevolt) return state;
  const province = state.provinces[prince.province];
  if (province === undefined || province.holder !== null) return state;

  return {
    ...state,
    princes: state.princes.map((p) =>
      p.id === princeId
        ? {
            ...p,
            troops: p.troops + EMPOWER_GARRISON_GAIN * 0.5,
            ambition: Math.min(10, p.ambition + EMPOWER_AMBITION_GAIN),
          }
        : p,
    ),
    provinces: {
      ...state.provinces,
      [prince.province]: { ...province, garrison: province.garrison + EMPOWER_GARRISON_GAIN },
    },
    princeLoyalty: clamp100(state.princeLoyalty + EMPOWER_LOYALTY_GAIN),
  };
}

/**
 * 挙兵した王が都へ攻め上る。
 *
 * **都を陥とせばその王が帝位に即く。** 趙王倫が実際にそうしたように、
 * 宗室の乱は王朝の外へは出ない — 局は続き、帝が入れ替わるだけである。
 * 前の帝は廃され、担いだ兵はそのまま新しい中軍になる
 */
export function checkPrinceMarchOnCapital(state: GameState, rng: () => number): GameState {
  const marchers = state.princes.filter((p) => p.inRevolt);
  if (marchers.length === 0) return state;

  const capital = state.provinces[state.capital];
  if (capital === undefined || capital.holder === 'prince') return state;

  // いちばん兵を集めた王が都を衝く
  const prince = marchers.sort((a, b) => b.troops - a.troops)[0];
  const defence = defenceStrength(state, state.capital, new Set()) + state.centralArmy * 0.6;
  const attack = prince.troops * (1 + prince.abilities.military * 0.04);
  /*
   * **押し勝つだけでは足りない。** 互角に近い兵で都を衝けるようにしていたときは、
   * 朝廷が細った局で挙兵がそのまま即位につながり、中級で局の41%、
   * 上級で51%が藩王の即位で終わった。都を陥とすには目に見えて上回る兵が要る
   */
  if (attack <= defence * PRINCE_MARCH_MARGIN) return state;
  if (rng() >= PRINCE_MARCH_PROBABILITY) return state;

  const record: DeathRecord = {
    name: state.dynasty.ruler.name,
    houseName: state.dynasty.houseName,
    year: state.year,
    age: state.dynasty.ruler.age,
    cause: 'assassination',
    // 王朝の号は替わらない。記録にも「王朝が替わる」と書かせない
    outcome: 'usurped',
  };

  const enthroned: Person = {
    id: `prince_${prince.id}`,
    name: prince.name,
    age: randomInt(rng, 30, 52),
    lifespan: randomInt(rng, 34, 70),
    abilities: prince.abilities,
    relation: 'self',
    lineage: 'han',
  };

  /*
   * 挙兵を収めた王の州も朝廷へ戻す。
   *
   * 即位した王の州だけ戻していたときは、ほかの王は挙兵を解いたのに
   * その州が藩王の手のまま残り、誰も拠っていない州が永久に失われた
   */
  const provinces = { ...state.provinces };
  for (const other of state.princes) {
    const held = provinces[other.province];
    if (held?.holder !== 'prince') continue;
    provinces[other.province] = {
      ...held,
      holder: null,
      control: Math.max(20, held.control),
    };
  }

  return {
    ...state,
    // 担いだ兵はそのまま中軍になる
    centralArmy: state.centralArmy * 0.5 + prince.troops * 0.7,
    mandate: clamp100(Math.max(state.mandate, PRINCE_ENTHRONE_MANDATE)),
    gentry: clamp100(state.gentry - PRINCE_ENTHRONE_GENTRY_LOSS),
    princeLoyalty: clamp100(state.princeLoyalty - 18),
    // 即位した王は諸王ではなくなる。ほかの王は挙兵をいったん収める
    princes: state.princes
      .filter((p) => p.id !== prince.id)
      .map((p) => ({ ...p, inRevolt: false })),
    retiredPrinceIds: [...state.retiredPrinceIds, prince.id],
    provinces,
    dynasty: {
      ...state.dynasty,
      ruler: enthroned,
      history: [...state.dynasty.history, record],
      consort: null,
    },
    turnEvents: [...state.turnEvents, 'prince_took_capital'],
  };
}

/** 挙兵した王が握っている州 */
export function princeHeldProvinces(state: GameState): Set<ProvinceId> {
  return new Set(state.princes.filter((p) => p.inRevolt).map((p) => p.province));
}
