// 国家の財政・官職・募兵・内政。
// 毎月:都市の商業・農業・人口の税・交易から収入を得て、軍団・守備兵・俸禄・官僚機構・都市・宮廷・遠征の費用を払う。
// 赤字が続くと、俸禄の未払い(忠誠の低下)→ 兵糧不足(士気の低下)→ 兵の逃亡、と段階的に悪くなる。1か月の赤字では国は崩れない。
import { cityLevelOf, persons, scenario, totalTroops } from "../data";
import offices from "../data/rules/offices.json";
import type { City, CityState, Person } from "../data/types";
import type { Campaign } from "./Campaign";
import { isKin } from "./loyalty";

export interface Office {
  id: string;
  name: string;
  rank: number;
  salary: number;
  quota: number;
  need: { politics?: number; leadership?: number; intelligence?: number; war?: number; kin?: boolean };
}
export type DevKind = "agri" | "commerce" | "order" | "walls" | "population" | "granary" | "talent";
export const DEV_LABEL: Record<DevKind, string> = {
  agri: "農業開発", commerce: "商業開発", order: "治安維持", walls: "城郭整備", population: "人口回復", granary: "兵糧備蓄", talent: "人材探索",
};
export interface FinanceReport {
  income: { commerce: number; tax: number; trade: number; silk: number; total: number; grain: number };
  expense: { army: number; garrison: number; salary: number; bureaucracy: number; cities: number; court: number; expedition: number; total: number; grain: number };
  net: number;
  netGrain: number;
  cities: { id: string; name: string; gold: number; grain: number }[];
}
export interface EconomySave {
  offices: Record<string, string>;
  arrears: Record<string, number>;
  history: Record<string, { day: number; gold: number; net: number }[]>;
  talentUntil: Record<string, number>;
}

const SYSTEMS = offices.systems as Record<string, { label: string; offices: Office[] }>;
const FACTION_SYSTEM = offices.factionSystem as Record<string, string>;

/** 都市の、内政まわりの値(セーブの無い古い状態は、ここで初期値を補う) */
export function cityEcon(city: City, st: CityState): Required<Pick<CityState, "agri" | "commerce" | "order" | "support" | "pop" | "fortify">> {
  return {
    agri: st.agri ?? 20,
    commerce: st.commerce ?? 20,
    order: st.order ?? 70,
    support: st.support ?? 60,
    pop: st.pop ?? city.population ?? cityLevelOf(city) * 20000,
    fortify: st.fortify ?? 0,
  };
}

export class Economy {
  offices: Record<string, string> = {};
  arrears: Record<string, number> = {};
  history: Record<string, { day: number; gold: number; net: number }[]> = {};
  talentUntil: Record<string, number> = {};

  constructor(private readonly c: Campaign) {
    this.assignAll();
  }

  /** 勢力の官制:中原系・遊牧・朝鮮半島。後継国家はもとの国の官制を受け継ぐ */
  systemOf(factionId: string): { id: string; label: string; offices: Office[] } {
    let id = factionId;
    const f = scenario.factions.find((x) => x.id === factionId);
    if (f?.founded) id = f.founded.from;
    const key = FACTION_SYSTEM[id] ?? "chinese";
    return { id: key, ...SYSTEMS[key] };
  }

  officeOf(personId: string): Office | undefined {
    const p = persons.find((x) => x.id === personId);
    const oid = this.offices[personId];
    return p && oid ? this.systemOf(p.factionId).offices.find((o) => o.id === oid) : undefined;
  }

  /** 毎月の俸禄 */
  salaryOf(p: Person): number {
    if (p.role === "ruler") return 0;
    const o = this.officeOf(p.id);
    const gov = this.c.postOf(p.id)?.kind === "city";
    return Math.max(o?.salary ?? 0, gov ? offices.governorSalary : 0, offices.baseSalary);
  }

  /**
   * 俸禄の水準(0.35〜1):官職の俸禄は、国の豊かさに合わせて払う(小さな国の官は、同じ官職でも俸禄が低い)。
   * 名目の俸禄の総額が、収入の4割を超える分だけ下げる(下限は2割)。
   */
  salaryLevel(factionId: string, income?: number): number {
    const staff = persons.filter((p) => p.factionId === factionId && this.c.personStatus(p.id) !== "dead" && !this.c.spoils.custodyOf(p.id));
    const nominal = staff.reduce((s, p) => s + this.salaryOf(p), 0);
    const inc = income ?? this.report(factionId).income.total;
    // 遊牧の国は、俸禄の多くを家畜や戦利品で払うので、金の俸禄の下限が低い
    const floor = this.systemOf(factionId).id === "steppe" ? 0.1 : 0.2;
    return nominal <= 0 ? 1 : Math.max(floor, Math.min(1, (inc * 0.4) / nominal));
  }

  /** 官職の条件を満たすか */
  canHold(p: Person, o: Office): string | null {
    if (p.role === "ruler") return "君主は官職につきません";
    const r = persons.find((x) => x.factionId === p.factionId && x.role === "ruler");
    if (o.need.kin && !(r && isKin(p, r))) return "君主の一族でなければなりません";
    for (const k of ["politics", "leadership", "intelligence", "war"] as const) {
      const need = o.need[k];
      if (need && p[k] < need) return `${{ politics: "政治", leadership: "統率", intelligence: "知力", war: "武力" }[k]}${need}以上が必要です`;
    }
    const holders = persons.filter((x) => x.id !== p.id && x.factionId === p.factionId && this.offices[x.id] === o.id).length;
    if (holders >= o.quota) return `${o.name}の定員(${o.quota}人)がいっぱいです`;
    return null;
  }

  /** 官職に任命する(officeId が null なら解く) */
  setOffice(personId: string, officeId: string | null): string | null {
    const p = persons.find((x) => x.id === personId);
    if (!p) return "人物が見つかりません";
    if (officeId === null) {
      delete this.offices[personId];
      return null;
    }
    const o = this.systemOf(p.factionId).offices.find((x) => x.id === officeId);
    if (!o) return "この勢力には、その官職はありません";
    const err = this.canHold(p, o);
    if (err) return err;
    const before = this.officeOf(personId);
    this.offices[personId] = officeId;
    if (!before || before.rank > o.rank) this.c.loyalty.add(personId, 4 + (before ? before.rank - o.rank : 2), `${o.name}に任命`);
    else if (before.rank < o.rank) this.c.loyalty.add(personId, -6, `${before.name}から${o.name}へ降格`);
    return null;
  }

  /** 官職を、名声と能力の高い人から順に割り当てる(開始時と、AIの年1回の見直し) */
  assignAll(only?: string): void {
    for (const f of scenario.factions) {
      if (f.passive || f.fallen || (only && f.id !== only)) continue;
      const sys = this.systemOf(f.id);
      const staff = persons
        .filter((p) => p.factionId === f.id && p.role !== "ruler" && this.c.personStatus(p.id) === "active" && !this.c.spoils.custodyOf(p.id))
        .sort((a, b) => (this.c.loyalty?.fame[b.id] ?? 50) + b.leadership + b.politics - ((this.c.loyalty?.fame[a.id] ?? 50) + a.leadership + a.politics));
      for (const p of staff) if (this.offices[p.id] && !sys.offices.some((o) => o.id === this.offices[p.id])) delete this.offices[p.id];
      for (const o of [...sys.offices].sort((a, b) => a.rank - b.rank)) {
        for (const p of staff) {
          if (persons.filter((x) => x.factionId === f.id && this.offices[x.id] === o.id).length >= o.quota) break;
          if (this.offices[p.id]) continue;
          if (this.canHold(p, o) === null) this.offices[p.id] = o.id;
        }
      }
    }
  }

  /** 勢力の毎月の収支 */
  report(factionId: string): FinanceReport {
    const mine = this.c.cities.filter((x) => scenario.cityOwners[x.id] === factionId);
    const bonus = 1 + this.c.spoils.factionEffects(factionId).income / 100;
    const inc = { commerce: 0, tax: 0, trade: 0, silk: 0, total: 0, grain: 0 };
    const cityRows: FinanceReport["cities"] = [];
    let garrison = 0;
    let levels = 0;
    for (const city of mine) {
      const st = this.c.cityState(city);
      const e = cityEcon(city, st);
      const prosperity = (st.prosperity ?? 100) / 100;
      const orderF = 0.6 + e.order / 250;
      const commerce = (city.economy ?? 0) * (1 + e.commerce / 100) * prosperity * orderF * bonus;
      const tax = (e.pop / 1000) * 0.6 * (0.5 + e.support / 100) * orderF * (this.systemOf(factionId).id === "steppe" ? 2 : 1);
      const trade = (city.transport ?? 0) >= 4 ? (city.economy ?? 0) * 0.15 * prosperity : 0;
      const grain = (city.food ?? 0) * 0.6 * (1 + e.agri / 100) * prosperity;
      inc.commerce += commerce;
      inc.tax += tax;
      inc.trade += trade;
      inc.grain += grain;
      garrison += st.garrison;
      if (city.kind !== "pass") levels += cityLevelOf(city);
      cityRows.push({ id: city.id, name: city.name, gold: Math.round(commerce + tax + trade), grain: Math.round(grain) });
    }
    // 幼君のときは、摂政の政治で政務の効率が変わる(摂政がいなければ下がる)
    const admin = this.c.court?.adminFactor(factionId) ?? 1;
    if (admin !== 1) {
      inc.commerce *= admin;
      inc.tax *= admin;
    }
    // シルクロードの交易(先月の実績。上限・輸送費・危険を引いたもの)
    inc.silk = this.c.trade?.incomeOf(factionId) ?? 0;
    inc.total = inc.commerce + inc.tax + inc.trade + inc.silk;
    const armies = this.c.armies.filter((s) => s.army.factionId === factionId);
    const troops = armies.reduce((sum, s) => sum + totalTroops(s.army), 0);
    const marching = armies.filter((s) => s.status === "marching" || s.status === "fighting").reduce((sum, s) => sum + totalTroops(s.army), 0);
    const staff = persons.filter((p) => p.factionId === factionId && this.c.personStatus(p.id) !== "dead" && !this.c.spoils.custodyOf(p.id));
    const n = mine.filter((x) => x.kind !== "pass").length;
    // 遊牧の国:部族の兵は、ふだんは牧畜で自らを養う(守備兵・軍団の維持費が軽い)。宮廷と官僚も小さい。
    // そのかわり、家畜と交易からの収入(牧畜)がある。ただし、軍団を遠くに出せば、ほかの国と同じく費用がかかる
    const nomad = this.systemOf(factionId).id === "steppe";
    if (nomad) {
      const herd = mine.reduce((s, city) => s + cityEcon(city, this.c.cityState(city)).pop, 0) / 1000 * 0.15;
      inc.trade += herd;
      inc.total += herd;
    }
    const exp = {
      army: troops * (nomad ? 0.008 : 0.012),
      garrison: garrison * (nomad ? 0.0012 : 0.003),
      salary: staff.reduce((s, p) => s + this.salaryOf(p), 0) * this.salaryLevel(factionId, inc.total),
      bureaucracy: (nomad ? 1 : 2) * Math.pow(n, 1.5),
      cities: levels * 2,
      // 宮廷費:宮廷の規模(都市の数)と、皇室(妃・子女。皇帝は1.5倍)
      court: (n > 0 ? (nomad ? 3 + 3 * Math.sqrt(n) : 5 + 6 * Math.sqrt(n)) : 0) + (this.c.court?.courtCost(factionId) ?? 0),
      expedition: marching * 0.01,
      total: 0,
      grain: troops / 250 + garrison / 800 + marching / 500,
    };
    exp.total = exp.army + exp.garrison + exp.salary + exp.bureaucracy + exp.cities + exp.court + exp.expedition;
    const r = (x: number): number => Math.round(x);
    return {
      income: { commerce: r(inc.commerce), tax: r(inc.tax), trade: r(inc.trade), silk: r(inc.silk), total: r(inc.total), grain: r(inc.grain) },
      expense: { army: r(exp.army), garrison: r(exp.garrison), salary: r(exp.salary), bureaucracy: r(exp.bureaucracy), cities: r(exp.cities), court: r(exp.court), expedition: r(exp.expedition), total: r(exp.total), grain: r(exp.grain) },
      net: r(inc.total - exp.total),
      netGrain: r(inc.grain - exp.grain),
      cities: cityRows.sort((a, b) => b.gold - a.gold),
    };
  }

  /**
   * 毎月の決算。赤字で金が尽きると「未払い」の月が積み上がる。
   * 1か月目:俸禄の遅れ(忠誠が少し下がる)。2か月目から:兵の士気が下がる。3か月目から:兵が逃げ始める。
   * 金は、1か月の支出の3倍までの借りにとどめる(それより下がらない)。
   */
  monthly(): void {
    const day = Math.floor(this.c.day);
    for (const f of scenario.factions) {
      if (f.passive || f.fallen) continue;
      const st = (this.c.factionStates[f.id] ??= { gold: 0, grain: 0 });
      const rep = this.report(f.id);
      st.gold += rep.net;
      // 兵糧は、2年分(毎月の収穫の24倍)を超えると傷んで減る
      st.grain = Math.max(0, Math.min(Math.max(2000, rep.income.grain * 24), st.grain + rep.netGrain));
      st.gold = Math.max(-rep.expense.total * 3, st.gold);
      // 蓄えが収入の3年分(最低3,000)を超えると、超えた分の4%が毎月失われる(管理の費用・横領・散財)。
      // 都市を失った国が、昔の蓄えをいつまでも抱え込まないように
      const hoard = Math.max(3000, rep.income.total * 36);
      if (st.gold > hoard) st.gold -= (st.gold - hoard) * 0.04;
      const h = (this.history[f.id] ??= []);
      h.push({ day, gold: Math.round(st.gold), net: rep.net });
      if (h.length > 24) h.shift();
      if (st.gold < 0) {
        const a = (this.arrears[f.id] = (this.arrears[f.id] ?? 0) + 1);
        for (const p of persons.filter((x) => x.factionId === f.id && x.role !== "ruler")) this.c.loyalty.add(p.id, -Math.min(6, a * 1.5), `俸禄の未払い(${a}か月)`);
        if (a >= 2) for (const s of this.c.armies.filter((x) => x.army.factionId === f.id)) s.army.morale = Math.max(10, s.army.morale - 3 * (a - 1));
        if (a >= 3) {
          for (const s of this.c.armies.filter((x) => x.army.factionId === f.id)) for (const k of ["infantry", "cavalry", "archer"] as const) s.army.troops[k] = Math.floor(s.army.troops[k] * 0.96);
          for (const city of this.c.cities.filter((x) => scenario.cityOwners[x.id] === f.id)) {
            const cs = this.c.cityState(city);
            this.c.cityStates[city.id] = { ...cs, garrison: Math.floor(cs.garrison * 0.97) };
          }
        }
      } else this.arrears[f.id] = 0;
      if (st.grain <= 0) for (const s of this.c.armies.filter((x) => x.army.factionId === f.id)) s.army.morale = Math.max(10, s.army.morale - 2);
    }
    // 年に1度:AIの勢力は、空いた官職に人を入れる
    if (day % 360 < 30) for (const f of scenario.factions) if (f.id !== this.c.playerFactionId) this.assignAll(f.id);
    // 都市:人口は兵糧が足りれば少しずつ増え、治安と民忠はゆっくり平常に戻る
    for (const city of this.c.cities) {
      const st = this.c.cityStates[city.id];
      if (!st) continue;
      const e = cityEcon(city, st);
      const owner = scenario.cityOwners[city.id];
      const fed = (this.c.factionStates[owner]?.grain ?? 1) > 0;
      const cap = (city.population ?? cityLevelOf(city) * 20000) * 1.4;
      st.pop = Math.round(Math.min(cap, e.pop * (fed ? 1.002 : 0.996)));
      // 帰農:守備兵が人口の6%(募兵の上限と同じ)を超える都市では、超えた分の4%が毎月、田畑に帰る(人口に見合わない大軍は保てない)
      const over = st.garrison - st.pop * 0.06;
      if (over > 0) st.garrison = Math.round(st.garrison - over * 0.04);
      st.support = Math.min(70, e.support + 0.5);
    }
  }

  /** 金が尽きて未払いが続いている月数 */
  arrearsOf(factionId: string): number {
    return this.arrears[factionId] ?? 0;
  }

  /** 担当者:その都市の太守(いなければ、勢力でいちばん政治の高い人) */
  private officer(city: City): Person | undefined {
    const owner = scenario.cityOwners[city.id];
    const gid = this.c.cityStates[city.id]?.governorId ?? city.governorId;
    return persons.find((p) => p.id === gid && p.factionId === owner)
      ?? persons.filter((p) => p.factionId === owner && p.role !== "ruler" && this.c.personStatus(p.id) === "active").sort((a, b) => b.politics - a.politics)[0];
  }

  /**
   * 内政:金を払って、都市の値を上げる。1つの都市で、60日に1度まで。値には上限がある。
   * 成果は担当者(太守)の政治・知力・魅力で変わる。結果の文を返す(できないときは、理由)。
   */
  develop(cityId: string, kind: DevKind): string {
    const city = this.c.cities.find((x) => x.id === cityId);
    if (!city) return "都市が見つかりません";
    const owner = scenario.cityOwners[city.id];
    const purse = this.c.factionStates[owner];
    const st = (this.c.cityStates[city.id] = { ...this.c.cityState(city) });
    const e = cityEcon(city, st);
    const day = Math.floor(this.c.day);
    if (st.devDay !== undefined && day - st.devDay < 60) return `${city.name}では内政を行ったばかりです(あと${60 - (day - st.devDay)}日)`;
    const cost = 150;
    if (!purse || purse.gold < cost) return `金が足りません(必要 ${cost})`;
    const o = this.officer(city);
    const pol = o?.politics ?? 40;
    const intl = o?.intelligence ?? 40;
    const cha = o?.charisma ?? 40;
    let text = "";
    switch (kind) {
      case "agri": {
        if (e.agri >= 100) return "農業はこれ以上上がりません";
        const g = Math.round(4 + pol / 12);
        st.agri = Math.min(100, e.agri + g);
        text = `農業 ${e.agri}→${st.agri}`;
        break;
      }
      case "commerce": {
        if (e.commerce >= 100) return "商業はこれ以上上がりません";
        const g = Math.round(4 + (pol + intl) / 25);
        st.commerce = Math.min(100, e.commerce + g);
        text = `商業 ${e.commerce}→${st.commerce}`;
        break;
      }
      case "order": {
        if (e.order >= 100) return "治安はこれ以上上がりません";
        const g = Math.round(6 + cha / 10);
        st.order = Math.min(100, e.order + g);
        st.support = Math.min(100, e.support + 3);
        text = `治安 ${e.order}→${st.order}`;
        break;
      }
      case "walls": {
        if (e.fortify >= 20) return "城郭はこれ以上整えられません";
        st.fortify = Math.min(20, e.fortify + Math.round(2 + intl / 40));
        st.wallDamage = Math.max(0, st.wallDamage - 0.2);
        st.gateDamage = Math.max(0, st.gateDamage - 0.3);
        text = `城の守り +${st.fortify}(損傷も修理)`;
        break;
      }
      case "population": {
        const cap = (city.population ?? cityLevelOf(city) * 20000) * 1.4;
        if (e.pop >= cap) return "人口はこれ以上増えません";
        st.pop = Math.round(Math.min(cap, e.pop * (1.02 + pol / 2500)));
        text = `人口 ${e.pop.toLocaleString("ja-JP")}→${st.pop.toLocaleString("ja-JP")}`;
        break;
      }
      case "granary": {
        const g = Math.round(cost * (1.2 + pol / 200));
        purse.grain += g;
        st.food = Math.min(120, st.food + 10);
        text = `兵糧 +${g}`;
        break;
      }
      case "talent": {
        this.talentUntil[owner] = day + 180;
        text = "180日のあいだ、捕虜や在野の人の登用に応じてもらいやすくなります";
        break;
      }
    }
    purse.gold -= cost;
    st.devDay = day;
    return `${city.name}で${DEV_LABEL[kind]}(担当 ${o?.name ?? "なし"}):${text}`;
  }

  /** 人材探索の効果の残り(登用の見込みに足す) */
  talentBonus(factionId: string): number {
    return (this.talentUntil[factionId] ?? -1) >= Math.floor(this.c.day) ? 0.08 : 0;
  }

  serialize(): EconomySave {
    return JSON.parse(JSON.stringify({ offices: this.offices, arrears: this.arrears, history: this.history, talentUntil: this.talentUntil })) as EconomySave;
  }

  /** 古いセーブ(経済の無いもの)は、官職を割り当て直して始める */
  restore(save: EconomySave | undefined): void {
    this.offices = {};
    this.arrears = {};
    this.history = {};
    this.talentUntil = {};
    if (!save) {
      this.assignAll();
      return;
    }
    Object.assign(this.offices, save.offices);
    Object.assign(this.arrears, save.arrears);
    Object.assign(this.history, save.history);
    Object.assign(this.talentUntil, save.talentUntil ?? {});
  }
}
