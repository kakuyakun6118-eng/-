// シルクロードの交易(Version 39)。
// 交易路は、史実の交通路にそったオアシスの都市の並び(河西回廊・天山南路・西域南道・天山北路)。
// 毎月、交易路の「つながっている区間」を調べ、区間の両端の都市を持つ国に収入が入る。
// 収入には上限がある:都市の市場の大きさ(規模と経済)・輸送費(距離)・道中の危険(砂漠・治安)。
// 戦争・治安の悪化・関所の封鎖・包囲で区間が切れると、その先の交易は止まる。交易協定を結んだ国どうしは2割5分増し。
import { scenario } from "../data";
import type { City } from "../data/types";
import type { Campaign } from "./Campaign";
import { distanceKm } from "./pathfinding";
import { chance } from "./spoils";
import { cityEcon } from "./economy";

export interface TradeRoute {
  id: string;
  name: string;
  /** 主な交易品 */
  goods: string[];
  /** 東から西への都市の並び */
  cities: string[];
  /** ひと月に運べる量の目安(大きいほど収入が多い) */
  volume: number;
  note: string;
}

export const ROUTES: TradeRoute[] = [
  { id: "hexi", name: "河西回廊", goods: ["絹", "馬", "毛織物"], cities: ["changan", "anding", "guzang", "zhangye", "jiuquan", "dunhuang"], volume: 1.0, note: "長安から涼州を経て敦煌に至る道。漢代以来の幹線" },
  { id: "south", name: "西域南道", goods: ["玉", "絹", "香料"], cities: ["dunhuang", "loulan", "shanshan", "qiemo", "jingjue", "yutian", "shache", "shule"], volume: 0.7, note: "崑崙山脈の北の麓のオアシスをつなぐ道。于闐の玉が東へ運ばれた" },
  { id: "tianshan", name: "天山南路(西域北道)", goods: ["金属製品", "香料", "絹", "葡萄酒"], cities: ["dunhuang", "yiwu", "gaochang", "jiaohe", "yanqi", "weili", "qiuci", "gumo", "wensu", "shule"], volume: 0.8, note: "天山の南の麓のオアシスをつなぐ道。亀茲が最大の中継地" },
  { id: "north", name: "天山北路", goods: ["馬", "毛皮"], cities: ["gaochang", "jiaohe", "jushihou"], volume: 0.35, note: "天山を越えて北の草原へ向かう道。この先は烏孫などの遊牧の地(地図の外)" },
];

/** 都市ごとの名産(画面に出す) */
export const PRODUCTS: Record<string, string> = {
  changan: "絹", guzang: "馬", dunhuang: "中継の市", gaochang: "葡萄・白畳(綿布)", qiuci: "金属製品・楽器", yutian: "玉", shule: "馬・西方の香料", shanshan: "毛織物", jushihou: "馬", yanqi: "魚・塩",
};

export interface TradeSave {
  pacts: Record<string, number>;
  last: Record<string, number>;
  totals: Record<string, number>;
  segments: Record<string, boolean>;
}

const key = (a: string, b: string): string => [a, b].sort().join("|");

export class TradeSystem {
  /** 交易協定(国の組 → 期限の日) */
  pacts: Record<string, number> = {};
  /** 先月の交易収入(国ごと) */
  last: Record<string, number> = {};
  /** これまでの交易収入の合計(国ごと) */
  totals: Record<string, number> = {};
  /** 区間がつながっているか("a>b" → true/false) */
  segments: Record<string, boolean> = {};

  constructor(private readonly c: Campaign) {}

  private city(id: string): City | undefined {
    return this.c.cities.find((x) => x.id === id);
  }

  /** 区間が通れるか。通れなければ理由 */
  segmentState(a: City, b: City): string | null {
    const oa = scenario.cityOwners[a.id];
    const ob = scenario.cityOwners[b.id];
    if (!oa || !ob) return "持ち主がいない";
    if (oa !== ob && this.c.atWar(oa, ob)) return "戦争で道が閉ざされている";
    for (const x of [a, b]) {
      if (cityEcon(x, this.c.cityState(x)).order < 25) return `${x.name}の治安が悪い`;
      if (this.c.events.some((e) => e.defenderCityId === x.id && e.status !== "completed" && e.status !== "cancelled")) return `${x.name}が包囲されている`;
    }
    // 玉門関:関所の持ち主が両方の国と戦争していれば、敦煌から西は閉ざされる
    if (a.id === "dunhuang" || b.id === "dunhuang") {
      const yumen = scenario.cityOwners.yumen;
      if (yumen && ((oa !== yumen && this.c.atWar(oa, yumen)) || (ob !== yumen && this.c.atWar(ob, yumen)))) return "玉門関が封鎖されている";
    }
    return null;
  }

  /** 交易路ごとの、通れる区間と止まっている区間(画面と計算で使う) */
  status(): { route: TradeRoute; segs: { a: City; b: City; open: boolean; why: string | null }[] }[] {
    return ROUTES.map((route) => {
      const segs: { a: City; b: City; open: boolean; why: string | null }[] = [];
      for (let i = 0; i < route.cities.length - 1; i++) {
        const a = this.city(route.cities[i]);
        const b = this.city(route.cities[i + 1]);
        if (!a || !b) continue;
        const why = this.segmentState(a, b);
        segs.push({ a, b, open: !why, why });
      }
      return { route, segs };
    });
  }

  /** 市場の大きさ:その都市で、ひと月に交易から得られる金の上限 */
  market(x: City): number {
    return (x.level ?? 1) * 12 + (x.economy ?? 20) * 0.3 + (x.oasis ? 6 : 0);
  }

  /**
   * 毎月の交易:区間ごとに、両端の都市に収入を入れる。区間が切れると、その先(西)の区間には品が届かない。
   * 収入 = 交易量 × 市場 × (1 - 輸送費) × (1 - 危険)。都市ごとの上限で頭打ちになる。
   */
  monthly(): void {
    const day = Math.floor(this.c.day);
    const income: Record<string, number> = {};
    const perCity: Record<string, number> = {};
    this.segments = {};
    for (const { route, segs } of this.status()) {
      let reach = true;
      for (const s of segs) {
        this.segments[`${s.a.id}>${s.b.id}`] = s.open && reach;
        if (!s.open || !reach) {
          reach = false;
          continue;
        }
        const km = distanceKm(s.a, s.b);
        const transport = Math.min(0.5, km / 2400);
        // 道中の危険:砂漠の区間ほど、治安が悪いほど、盗賊に奪われやすい
        const desert = s.a.oasis || s.b.oasis ? 0.12 : 0.04;
        const disorder = Math.max(0, 60 - Math.min(cityEcon(s.a, this.c.cityState(s.a)).order, cityEcon(s.b, this.c.cityState(s.b)).order)) / 200;
        const risk = Math.min(0.6, (desert + disorder) * (0.6 + chance(`${day}|${route.id}|${s.a.id}`) * 0.8));
        for (const x of [s.a, s.b]) {
          const owner = scenario.cityOwners[x.id];
          const other = scenario.cityOwners[(x === s.a ? s.b : s.a).id];
          const pact = owner !== other && (this.pacts[key(owner, other)] ?? -1) >= day ? 1.25 : 1;
          const v = route.volume * this.market(x) * 0.5 * (1 - transport) * (1 - risk) * pact;
          perCity[x.id] = Math.min(this.market(x), (perCity[x.id] ?? 0) + v);
        }
      }
    }
    for (const [cid, v] of Object.entries(perCity)) {
      const o = scenario.cityOwners[cid];
      if (o) income[o] = (income[o] ?? 0) + v;
      // 交易でにぎわう都市は、少しずつ商業が伸びる(上限あり)
      const x = this.city(cid);
      if (x && v > 0) {
        const st = this.c.cityState(x);
        if ((st.commerce ?? 0) < 40) this.c.cityStates[cid] = { ...st, commerce: Math.min(40, (st.commerce ?? 0) + 0.3) };
      }
    }
    this.last = {};
    for (const [f, v] of Object.entries(income)) {
      const r = Math.round(v);
      this.last[f] = r;
      this.totals[f] = (this.totals[f] ?? 0) + r;
    }
    // 交易協定を結んだ国どうしは、友好度が少しずつ上がる
    for (const [k, until] of Object.entries(this.pacts)) {
      if (until < day) {
        delete this.pacts[k];
        continue;
      }
      const [a, b] = k.split("|");
      this.c.diplo.addAmity(a, b, 1);
    }
  }

  /** その国の、ひと月の交易収入(先月の実績) */
  incomeOf(f: string): number {
    return this.last[f] ?? 0;
  }

  /** 交易協定を結ぶ(外交から呼ぶ)。期間は3年 */
  pact(a: string, b: string): void {
    this.pacts[key(a, b)] = Math.floor(this.c.day) + 360 * 3;
  }

  hasPact(a: string, b: string): boolean {
    return (this.pacts[key(a, b)] ?? -1) >= Math.floor(this.c.day);
  }

  /** 2つの国が、交易路の上で隣り合っているか(協定の意味があるか) */
  linked(a: string, b: string): boolean {
    return ROUTES.some((r) => r.cities.some((id, i) => {
      const n = r.cities[i + 1];
      if (!n) return false;
      const x = scenario.cityOwners[id];
      const y = scenario.cityOwners[n];
      return (x === a && y === b) || (x === b && y === a);
    }));
  }

  serialize(): TradeSave {
    return JSON.parse(JSON.stringify({ pacts: this.pacts, last: this.last, totals: this.totals, segments: this.segments })) as TradeSave;
  }

  restore(save: TradeSave | undefined): void {
    this.pacts = { ...(save?.pacts ?? {}) };
    this.last = { ...(save?.last ?? {}) };
    this.totals = { ...(save?.totals ?? {}) };
    this.segments = { ...(save?.segments ?? {}) };
  }
}
