/*
 * 出征軍（部隊）。
 *
 * **失地の回復は、州を選んで一度賽を振る話ではない。** かつての北伐は
 * それだった。誰が率いても同じで、隣も通らずに軍が届き、勝てばその年のうちに
 * 州が戻った。桓温の三度の北伐も劉裕の長安回復も、そこには残らなかった。
 *
 * 部隊にすると、こうなる。
 *
 *   中軍 →（出征）→ 部隊 →（行軍・年をまたぐ）→ 城を囲む →（陥落）→ 州が戻る
 *                      ↓ 兵が尽きる          ↓ 忠誠が尽きる
 *                    崩れる                  離反する
 *
 * 兵は中軍から割いて中軍へ帰る**移し替え**で、新しい資源ではない。
 * 出しているあいだ本土の中軍はそのぶん薄く、維持費は同じ単価で国庫から引かれる。
 * **拡大はこの朝廷には本来ずっと重い**という主題が、留守の薄さとして出る
 */
import {
  CORPS_ATTRITION,
  CORPS_BROKEN_MANDATE,
  CORPS_CAPTURE_GARRISON,
  CORPS_CAPTURE_MANDATE,
  CORPS_COLLAPSE,
  CORPS_COST,
  CORPS_GARRISON_SHARE,
  CORPS_HOSTILE_ATTRITION,
  CORPS_LEAD_PER_POINT,
  CORPS_MAX,
  CORPS_MIN_ARMY,
  CORPS_RECALL_LOSS,
  CORPS_SHARE,
  CORPS_SIEGE_BREACH,
  CORPS_SIEGE_GARRISON_LOSS,
  CORPS_SIEGE_LOSS,
  EXPEDITION_RECOVERED_CONTROL,
  TRAIT_ATTACK_BONUS,
  TRAIT_CASUALTY_RELIEF,
} from './constants';
import { marchPath } from './geography';
import type { Corps, GameState, Official, ProvinceId } from './types';
import { clamp100 } from './util';

/** 攻め込める州か。胡族か北朝の握る州だけ。挙兵した王は討伐で相手をする */
export function canCampaignAgainst(state: GameState, provinceId: ProvinceId): boolean {
  const province = state.provinces[provinceId];
  if (province === undefined) return false;
  return province.holder !== null && province.holder !== 'prince';
}

/** 出征を起こせるか。将と兵と金と、空きの枠が要る */
export function canDispatch(state: GameState): boolean {
  return (
    state.corps.length < CORPS_MAX &&
    state.centralArmy > CORPS_MIN_ARMY &&
    state.treasury >= CORPS_COST &&
    state.candidates.some((o) => o.retained)
  );
}

/**
 * 出征。**将を名簿から連れ出し、中軍から兵を割いて都から発たせる。**
 *
 * 部隊はその年のうちには着かない。着くまでに何年かかるかは
 * 都からの遠さと、途中に敵地があるかで決まる
 */
export function dispatchCorps(
  state: GameState,
  officerId: string,
  provinceId: ProvinceId,
): GameState {
  if (!canDispatch(state)) return state;
  if (!canCampaignAgainst(state, provinceId)) return state;

  const officer = state.candidates.find((o) => o.id === officerId && o.retained);
  if (officer === undefined) return state;

  const troops = state.centralArmy * CORPS_SHARE;
  const corps: Corps = {
    id: `corps_${state.year}_${officerId}`,
    // 部隊を率いるのに問われるのは統率。席と同じく写しておく
    officer: { ...officer, competence: officer.abilities.leadership },
    troops,
    at: state.capital,
    target: provinceId,
    siegeYears: 0,
    raisedYear: state.year,
  };

  return {
    ...state,
    treasury: state.treasury - CORPS_COST,
    centralArmy: state.centralArmy - troops,
    candidates: state.candidates.filter((o) => o.id !== officerId),
    corps: [...state.corps, corps],
    turnEvents: [...state.turnEvents, 'corps_dispatched'],
  };
}

/** 進軍先を改める。詔一本なので行動枠は使わない */
export function orderCorps(
  state: GameState,
  corpsId: string,
  provinceId: ProvinceId,
): GameState {
  if (state.provinces[provinceId] === undefined) return state;
  return {
    ...state,
    corps: state.corps.map((c) => (c.id === corpsId ? { ...c, target: provinceId } : c)),
  };
}

/** 召還。兵は中軍へ戻り、将は名簿へ戻る。帰り道でも兵は減る */
export function recallCorps(state: GameState, corpsId: string): GameState {
  const corps = state.corps.find((c) => c.id === corpsId);
  if (corps === undefined) return state;

  const returning = corps.troops * (1 - CORPS_RECALL_LOSS);
  return {
    ...state,
    centralArmy: state.centralArmy + returning,
    corps: state.corps.filter((c) => c.id !== corpsId),
    candidates:
      state.year > corps.officer.untilYear
        ? state.candidates
        : [...state.candidates, { ...corps.officer, retained: true }],
  };
}

/** その州に立っている部隊。守りの計算と地図の表示が引く */
export function corpsIn(state: GameState, provinceId: ProvinceId): Corps[] {
  return state.corps.filter((c) => c.at === provinceId);
}

/**
 * 自領に立つ部隊が、その州の守りに加える戦力。
 *
 * 出征は攻めるためのものだが、**帰り道で州に居座らせておくこともできる。**
 * 州兵より働くが、中軍として本土にいるよりは効きが薄い
 */
export function corpsDefence(state: GameState, provinceId: ProvinceId): number {
  return corpsIn(state, provinceId).reduce(
    (sum, c) => sum + c.troops * CORPS_GARRISON_SHARE,
    0,
  );
}

/** 出しているあいだも兵は養う。中軍と同じ単価で国庫から引く */
export function corpsTroops(state: GameState): number {
  return state.corps.reduce((sum, c) => sum + c.troops, 0);
}

/**
 * 将が野で没したとき。
 *
 * **部隊は将のものである。** 率いる者を失った軍はその場に留まれず、
 * 半ばを失いながら都へ帰る。桓温が姑孰で没したあと北伐の軍が
 * そのまま散ったのと同じことをさせる
 */
export function updateCorpsOfficers(state: GameState): GameState {
  if (state.corps.length === 0) return state;
  if (state.corps.every((c) => state.year <= c.officer.untilYear)) {
    return {
      ...state,
      corps: state.corps.map((c) => ({
        ...c,
        officer: { ...c.officer, tenure: Math.max(0, c.officer.untilYear - state.year) },
      })),
    };
  }

  let returning = 0;
  const survivors: Corps[] = [];
  for (const corps of state.corps) {
    if (state.year > corps.officer.untilYear) {
      returning += corps.troops * 0.5;
      continue;
    }
    survivors.push({
      ...corps,
      officer: { ...corps.officer, tenure: Math.max(0, corps.officer.untilYear - state.year) },
    });
  }
  return {
    ...state,
    corps: survivors,
    centralArmy: state.centralArmy + returning,
    mandate: clamp100(state.mandate - 3),
    turnEvents: [...state.turnEvents, 'corps_broken'],
  };
}

// ── 年ごとの行軍と攻城 ────────────────────────────────

/** その州を握っている者の後詰。城の守りに乗る */
function holderStrength(state: GameState, provinceId: ProvinceId): number {
  const holder = state.provinces[provinceId].holder;
  if (holder === null || holder === 'prince') return 0;
  if (holder === 'north') return (state.north?.strength ?? 0) * 0.55;
  return (state.factions[holder]?.strength ?? 0) * 0.6;
}

/** 攻める側の力。将の統率と個性が乗る */
function siegePower(corps: Corps): number {
  const lead = 1 + corps.officer.abilities.leadership * CORPS_LEAD_PER_POINT;
  const meng = corps.officer.trait === 'mengjiang' ? 1 + TRAIT_ATTACK_BONUS : 1;
  return corps.troops * lead * meng;
}

/**
 * 部隊の一年。**行軍か、攻城か、そのどちらかだけ。**
 *
 * 自領に立っていて目的の州に着いていなければ一州ぶん進み、
 * 敵の握る州に立っていればその城を囲む。目的の州へ着いてしまえば
 * そこに留まって守りに加わる（召還するまで）
 */
export function advanceCorps(state: GameState, rng: () => number): GameState {
  if (state.corps.length === 0) return state;

  let next = state;
  const survivors: Corps[] = [];

  for (const original of next.corps) {
    /*
     * 囲むのは胡族と北朝の城だけ。**挙兵した王の封国は素通りする。**
     * 王は討伐で相手をするものなので、ここで城攻めにすると
     * 同じことを二通りに処理することになる
     */
    const besieging = canCampaignAgainst(next, original.at);
    const worn =
      original.troops *
      (1 - (next.provinces[original.at].holder !== null ? CORPS_HOSTILE_ATTRITION : CORPS_ATTRITION));
    let corps: Corps = { ...original, troops: worn };

    if (besieging) {
      const result = besiege(next, corps, rng);
      next = result.state;
      corps = result.corps;
    } else if (corps.at !== corps.target) {
      const path = marchPath(next, corps.at, corps.target);
      // 目的の州へ道が無ければ、その場に留まる
      if (path.length > 0) corps = { ...corps, at: path[0], siegeYears: 0 };
    } else {
      corps = { ...corps, siegeYears: 0 };
    }

    if (corps.troops < CORPS_COLLAPSE) {
      next = {
        ...next,
        mandate: clamp100(next.mandate - CORPS_BROKEN_MANDATE),
        candidates:
          next.year > corps.officer.untilYear
            ? next.candidates
            : [
                ...next.candidates,
                // 敗軍の将は戻ってくるが、面目を失っている
                { ...corps.officer, retained: true, loyalty: clamp100(corps.officer.loyalty - 20) },
              ],
        turnEvents: [...next.turnEvents, 'corps_broken'],
      };
      continue;
    }
    survivors.push(corps);
  }

  // 判定に使わなかった目を捨て、次の年の抽選がずれないようにする
  rng();
  return { ...next, corps: survivors };
}

/**
 * 攻城の一年。
 *
 * 城の耐久は攻守の比で削れる。**互角では落ちない** — 守り手の三倍を
 * 揃えてはじめて年に城ひとつぶんが崩れる。囲んでいるあいだ守備隊も痩せるので、
 * 保たせるほどに落としやすくなるが、そのぶん攻め手も兵を失っていく
 */
function besiege(
  state: GameState,
  corps: Corps,
  rng: () => number,
): { state: GameState; corps: Corps } {
  const provinceId = corps.at;
  const province = state.provinces[provinceId];

  const attack = siegePower(corps);
  const defence = province.garrison + holderStrength(state, provinceId);
  const total = attack + defence;
  const ratio = total <= 0 ? 1 : attack / total;

  // 神算・名将を将にすれば、同じ兵でも損害が軽い
  const relief =
    corps.officer.trait === 'shensuan' || corps.officer.trait === 'mingjiang'
      ? 1 - TRAIT_CASUALTY_RELIEF
      : 1;
  const losses = corps.troops * CORPS_SIEGE_LOSS * (1 - ratio) * relief;
  const breach = CORPS_SIEGE_BREACH * Math.max(0, (ratio - 0.3) / 0.7);

  const wall = province.wall - breach;
  const attacker: Corps = {
    ...corps,
    troops: Math.max(0, corps.troops - losses),
    siegeYears: corps.siegeYears + 1,
  };

  if (wall > 0) {
    return {
      state: {
        ...state,
        provinces: {
          ...state.provinces,
          [provinceId]: {
            ...province,
            wall,
            garrison: province.garrison * (1 - CORPS_SIEGE_GARRISON_LOSS),
          },
        },
      },
      corps: attacker,
    };
  }

  // ── 陥落 ──
  const holder = province.holder;
  const left = attacker.troops * CORPS_CAPTURE_GARRISON;

  let taken: GameState = {
    ...state,
    provinces: {
      ...state.provinces,
      [provinceId]: {
        ...province,
        holder: null,
        control: EXPEDITION_RECOVERED_CONTROL,
        wall: Math.max(8, province.wallMax * 0.35),
        garrison: left,
      },
    },
    mandate: clamp100(state.mandate + CORPS_CAPTURE_MANDATE),
    turnEvents: [...state.turnEvents, 'corps_took_city'],
  };

  // 城を失った側は削られる。塞内に郷里を持たない民は野へ追われる
  if (holder === 'north') {
    if (taken.north !== null) {
      taken = { ...taken, north: { ...taken.north, strength: taken.north.strength * 0.82 } };
    }
  } else if (holder !== null && holder !== 'prince') {
    const faction = taken.factions[holder];
    if (faction !== undefined) {
      taken = {
        ...taken,
        factions: {
          ...taken.factions,
          [holder]: {
            ...faction,
            strength: faction.strength * 0.6,
            stance: 'hostile',
            location: 'exterior',
            foundedYear: null,
            kingdomName: null,
          },
        },
      };
    }
  }

  rng();
  return {
    state: taken,
    corps: { ...attacker, troops: attacker.troops - left, target: provinceId, siegeYears: 0 },
  };
}
