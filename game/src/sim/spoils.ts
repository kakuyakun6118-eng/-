// 戦利品:名品の所有と装備、都市が落ちたときの捕虜・保護・財宝、略奪と保全。
// 人物を物として扱わない:捕虜(武将)と保護(女性ほか)は、名前・能力・身分を持つ人物のまま、所属と状態だけが変わる。
import { cityLevelOf, persons, scenario } from "../data";
import treasureData from "../data/treasures/treasures.json";
import type { City, CityState, Person, PersonStatus } from "../data/types";

export type TreasureCategory = "jade" | "jewelry" | "arms" | "culture" | "court" | "religion";
export interface TreasureEffects {
  politics?: number; intelligence?: number; charisma?: number; leadership?: number; war?: number;
  diplomacy?: number; income?: number; prestige?: number; morale?: number; culture?: number;
}
export interface Treasure {
  id: string;
  name: string;
  category: TreasureCategory;
  kind: string;
  /** 1=通常 2=上質 3=希少 4=名品 5=国宝級 */
  rarity: number;
  /** 史実 / 伝承 / 実在の様式にもとづく創作 / 創作 */
  historicity: string;
  description: string;
  history: string;
  effects: TreasureEffects;
  /** 人物に装備させられるか(武具・宝飾・玉器・書画の一部) */
  equip: boolean;
  holdings: Record<string, string>;
}
/** 名品のいまの状態。cityId があれば、その都市の蔵にある(持ち主は都市の勢力)。無ければ、owner の勢力の収蔵品 */
export interface TreasureState {
  cityId: string | null;
  owner: string | null;
  holderId: string | null;
  acquired?: { cityId: string; day: number; how: "接収" | "略奪" | "移送" };
}
/** 捕虜(武将)と、保護している人物 */
export interface Custody {
  personId: string;
  kind: "captive" | "protected";
  holder: string;
  from: string;
  cityId: string | null;
  day: number;
  /** 最後に登用などを持ちかけた日(同じ日に何度も試せないように) */
  lastTry?: number;
}
export interface CaptureRecord {
  day: number;
  date: string;
  cityId: string;
  captor: string;
  from: string;
  choice: "loot" | "preserve";
  gold: number;
  grain: number;
  treasures: string[];
  evacuated: string[];
  captives: string[];
  protected: string[];
}
/** プレイヤーの返事を待っている、陥落の処置 */
export interface PendingCapture {
  cityId: string;
  captor: string;
  from: string;
  day: number;
  damage: number;
  /** その場にいた人物(守将・滞在していた人) */
  people: { personId: string; kind: "captive" | "protected" }[];
  /** 蔵にあった名品と、敵が運び出した名品 */
  treasures: string[];
  evacuated: string[];
}
export interface SpoilsSave {
  treasures: Record<string, TreasureState>;
  custody: Custody[];
  records: CaptureRecord[];
  personFactions: Record<string, string>;
  pending: PendingCapture | null;
}

export const CATEGORY_LABEL: Record<TreasureCategory, string> = treasureData.categories as Record<TreasureCategory, string>;
export const RARITY_LABEL: string[] = treasureData.rarities;
const EFFECT_LABEL: Record<keyof TreasureEffects, string> = {
  politics: "政治", intelligence: "知力", charisma: "魅力", leadership: "統率", war: "武力",
  diplomacy: "外交", income: "収入(%)", prestige: "威信", morale: "士気", culture: "文化",
};
export function effectText(e: TreasureEffects): string {
  return (Object.keys(e) as (keyof TreasureEffects)[]).map((k) => `${EFFECT_LABEL[k]}+${e[k]}`).join("・");
}
/** 人物に付く効果(装備したとき) */
const PERSON_KEYS = ["politics", "intelligence", "charisma", "leadership", "war"] as const;

/** 日付と名前から決まる乱数(同じ状況なら同じ結果になる。日や都市が違えば変わる) */
/** ゲーム全体の乱数の種(Version 42)。空なら、これまでと同じ乱数になる。同じ種なら、同じ展開になる */
let gameSeed = "";
export function setGameSeed(s: string): void {
  gameSeed = s;
}
export function getGameSeed(): string {
  return gameSeed;
}

export function chance(seed0: string): number {
  const seed = gameSeed ? `${gameSeed}#${seed0}` : seed0;
  let a = 2166136261;
  for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 16777619);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

/**
 * このシナリオの名品:台帳の品(その年代に所在のあるもの)と、名品を持たない大きな都市の蔵の品(ゲーム上の創作)。
 * 蔵の品は都市の規模と富によって数と格が変わる。
 */
function buildTreasures(cities: City[]): Treasure[] {
  const list = (treasureData.items as Treasure[]).filter((t) => t.holdings[scenario.id]);
  const named = new Set(list.map((t) => t.holdings[scenario.id]));
  for (const c of cities) {
    if (c.kind === "pass") continue;
    const level = cityLevelOf(c);
    const rich = (c.economy ?? 20) + (c.food ?? 20);
    if (level < 2 || (named.has(c.id) && level < 4)) continue;
    list.push({
      id: `gen_${c.id}_vessel`, name: `${c.name}の金銀器`, category: "court", kind: "金銀器", rarity: rich > 140 ? 2 : 1, historicity: "創作",
      description: `${c.name}の役所の蔵にある金銀の器。`, history: "ゲーム上の創作(都市の規模と富から置いた品)。",
      effects: { income: rich > 140 ? 3 : 2, prestige: 2 }, equip: false, holdings: { [scenario.id]: c.id },
    });
    if (level >= 3) {
      list.push({
        id: `gen_${c.id}_jade`, name: `${c.name}の玉璧`, category: "jade", kind: "玉璧", rarity: 2, historicity: "創作",
        description: `${c.name}の蔵に納められた玉の璧。`, history: "ゲーム上の創作(都市の規模から置いた品)。",
        effects: { politics: 1, charisma: 2 }, equip: true, holdings: { [scenario.id]: c.id },
      });
    }
  }
  return list;
}

/** 名品と人物の、戦利品まわりの状態をまとめて持つ */
export class Spoils {
  readonly treasures: Treasure[];
  readonly state: Record<string, TreasureState> = {};
  readonly custody: Custody[] = [];
  readonly records: CaptureRecord[] = [];
  /** 開始時から所属が変わった人物(人物ID → 勢力ID) */
  readonly personFactions: Record<string, string> = {};
  pending: PendingCapture | null = null;
  /** 開始時の所属(ロードで戻すため) */
  private readonly initialFactions = new Map(persons.map((p) => [p.id, p.factionId]));

  constructor(private readonly cities: City[], private readonly cityOwner: (cityId: string) => string | undefined) {
    this.treasures = buildTreasures(cities);
    this.reset();
  }

  private reset(): void {
    for (const k of Object.keys(this.state)) delete this.state[k];
    for (const t of this.treasures) this.state[t.id] = { cityId: t.holdings[scenario.id], owner: null, holderId: null };
    this.custody.length = 0;
    this.records.length = 0;
    for (const k of Object.keys(this.personFactions)) delete this.personFactions[k];
    for (const p of persons) p.factionId = this.initialFactions.get(p.id) ?? p.factionId;
    this.pending = null;
  }

  treasure(id: string): Treasure | undefined {
    return this.treasures.find((t) => t.id === id);
  }

  /** 名品の持ち主の勢力(都市の蔵にあれば、その都市の勢力) */
  ownerOf(id: string): string | null {
    const s = this.state[id];
    if (!s) return null;
    return s.cityId ? this.cityOwner(s.cityId) ?? null : s.owner;
  }

  /** 勢力の収蔵品(蔵から接収したもの・人物が装備しているもの) */
  collectionOf(factionId: string): Treasure[] {
    return this.treasures.filter((t) => !this.state[t.id].cityId && this.state[t.id].owner === factionId);
  }

  /** 都市の蔵にある名品 */
  inCity(cityId: string): Treasure[] {
    return this.treasures.filter((t) => this.state[t.id].cityId === cityId);
  }

  /** 勢力が収蔵品から受ける効果の合計(収入・威信・外交・士気・文化) */
  factionEffects(factionId: string): Required<Pick<TreasureEffects, "income" | "prestige" | "diplomacy" | "morale" | "culture">> {
    const sum = { income: 0, prestige: 0, diplomacy: 0, morale: 0, culture: 0 };
    for (const t of this.collectionOf(factionId)) for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += t.effects[k] ?? 0;
    return sum;
  }

  /** 人物が装備している名品 */
  equippedBy(personId: string): Treasure[] {
    return this.treasures.filter((t) => this.state[t.id].holderId === personId);
  }

  /** 装備の効果を足した人物(戦闘の計算と画面の表示に使う。元の人物は変えない) */
  boosted(p: Person | undefined): Person | undefined {
    if (!p) return p;
    const items = this.equippedBy(p.id);
    if (items.length === 0) return p;
    const q = { ...p };
    for (const t of items) for (const k of PERSON_KEYS) q[k] = Math.min(120, q[k] + (t.effects[k] ?? 0));
    return q;
  }

  /** 装備させる(personId が null なら外す)。できないときは理由を返す。人物1人につき2点まで */
  equip(treasureId: string, personId: string | null): string | null {
    const t = this.treasure(treasureId);
    const s = this.state[treasureId];
    if (!t || !s) return "名品が見つかりません";
    if (s.cityId) return "まだ都市の蔵にあります。先に接収してください";
    if (personId === null) {
      s.holderId = null;
      return null;
    }
    if (!t.equip) return "この種類の名品は、人物には装備できません(勢力の収蔵品として効果があります)";
    const p = persons.find((x) => x.id === personId);
    if (!p || p.factionId !== s.owner) return "持ち主の勢力の人物にだけ装備できます";
    if (this.equippedBy(personId).filter((x) => x.id !== treasureId).length >= 2) return "1人が装備できるのは2点までです";
    s.holderId = personId;
    return null;
  }

  /** 都市の蔵の名品を、その都市の勢力の収蔵品に移す */
  confiscate(treasureId: string, day: number, how: "接収" | "略奪" | "移送" = "接収"): void {
    const s = this.state[treasureId];
    if (!s || !s.cityId) return;
    const owner = this.cityOwner(s.cityId) ?? null;
    s.acquired = { cityId: s.cityId, day, how };
    s.owner = owner;
    s.cityId = null;
  }

  /** 人物の所属を変える(登用・帰還など) */
  setFaction(personId: string, factionId: string): void {
    const p = persons.find((x) => x.id === personId);
    if (!p) return;
    p.factionId = factionId;
    this.personFactions[personId] = factionId;
    // 所属が変われば、持っていた名品は外す
    for (const t of this.equippedBy(personId)) this.state[t.id].holderId = null;
  }

  /**
   * 都市が落ちたとき:その場にいた人物と、蔵の名品を調べる。
   * 敵は、落城の前に名品の一部を別の都市へ運び出していることがある(日と都市によって変わる)。
   */
  onCityCaptured(city: City, captor: string, from: string, governorId: string | undefined, governorFate: string | undefined, damage: number, day: number, statusOf: (id: string) => PersonStatus): PendingCapture {
    const people: PendingCapture["people"] = [];
    if (governorId && governorFate === "captured") people.push({ personId: governorId, kind: "captive" });
    for (const p of persons) {
      if (p.factionId !== from || p.residence !== city.id || statusOf(p.id) !== "active") continue;
      if (people.some((x) => x.personId === p.id)) continue;
      // 滞在していた人:武将は捕虜に、それ以外(后妃・文人など)は保護する
      // 君主と武将は捕虜に、それ以外(后妃・文人など)は保護する
      people.push({ personId: p.id, kind: (p.role === "general" || p.role === "ruler") && p.gender !== "female" ? "captive" : "protected" });
    }
    const treasures: string[] = [];
    const evacuated: string[] = [];
    const fallback = this.cities.filter((c) => c.id !== city.id && this.cityOwner(c.id) === from && c.kind !== "pass")
      .sort((a, b) => Math.hypot(a.lon - city.lon, a.lat - city.lat) - Math.hypot(b.lon - city.lon, b.lat - city.lat))[0];
    for (const t of this.inCity(city.id)) {
      // 価値の高い品ほど、先に運び出される。城の損傷が大きい(急な落城)ほど、運び出せない
      const p = fallback ? (t.rarity >= 4 ? 0.35 : t.rarity >= 3 ? 0.2 : 0.05) * (1 - Math.min(0.8, damage)) : 0;
      if (chance(`${day}|${city.id}|${t.id}|evac`) < p) {
        evacuated.push(t.id);
        this.state[t.id].cityId = fallback!.id;
        this.state[t.id].acquired = { cityId: city.id, day, how: "移送" };
      } else treasures.push(t.id);
    }
    return { cityId: city.id, captor, from, day, damage, people, treasures, evacuated };
  }

  /** 陥落の処置を決める。略奪:財宝と金を多く得るが、都市が荒れる。保全:得るものは少ないが、都市を保つ */
  resolveCapture(pc: PendingCapture, choice: "loot" | "preserve", confiscate: boolean, city: City, state: CityState, date: string,
    give: (factionId: string, gold: number, grain: number) => void, setStatus: (id: string, s: PersonStatus) => void): CaptureRecord {
    const rich = (city.economy ?? 20) * (state.prosperity ?? 100) / 100;
    const r = chance(`${pc.day}|${pc.cityId}|loot`);
    const keep = 1 - Math.min(0.5, pc.damage * 0.4); // 激しい攻城で焼けたり散ったりした分を引く
    const gold = Math.round(rich * (choice === "loot" ? 4 : 1) * keep * (0.75 + r * 0.5));
    const grain = Math.round((city.food ?? 20) * (choice === "loot" ? 3 : 0.8) * keep * (0.75 + r * 0.5));
    give(pc.captor, gold, grain);
    const taken: string[] = [];
    for (const id of pc.treasures) {
      if (this.state[id].cityId !== pc.cityId) continue;
      // 保全なら、接収するのは希少以上の品だけ(ほかは都市の蔵に残す)。略奪なら全部
      const t = this.treasure(id)!;
      if (choice === "loot" || (confiscate && t.rarity >= 3)) {
        this.confiscate(id, pc.day, choice === "loot" ? "略奪" : "接収");
        taken.push(id);
      }
    }
    if (choice === "loot") {
      state.prosperity = Math.max(20, (state.prosperity ?? 100) - 35);
      state.order = Math.max(5, (state.order ?? 70) - 45);
    } else {
      state.prosperity = Math.max(30, (state.prosperity ?? 100) - 5);
      state.order = Math.max(20, (state.order ?? 70) - 10);
    }
    const captives: string[] = [];
    const prot: string[] = [];
    for (const x of pc.people) {
      this.custody.push({ personId: x.personId, kind: x.kind, holder: pc.captor, from: pc.from, cityId: pc.cityId, day: pc.day });
      setStatus(x.personId, x.kind === "captive" ? "captured" : "protected");
      (x.kind === "captive" ? captives : prot).push(x.personId);
    }
    const rec: CaptureRecord = { day: pc.day, date, cityId: pc.cityId, captor: pc.captor, from: pc.from, choice, gold, grain, treasures: taken, evacuated: pc.evacuated, captives, protected: prot };
    this.records.push(rec);
    if (this.records.length > 80) this.records.shift();
    return rec;
  }

  /** 会戦で捕らえた指揮官を、捕虜として記録する */
  addCaptive(personId: string, holder: string, from: string, day: number): void {
    if (this.custody.some((c) => c.personId === personId)) return;
    this.custody.push({ personId, kind: "captive", holder, from, cityId: null, day });
  }

  custodyOf(personId: string): Custody | undefined {
    return this.custody.find((c) => c.personId === personId);
  }

  release(personId: string): void {
    const i = this.custody.findIndex((c) => c.personId === personId);
    if (i >= 0) this.custody.splice(i, 1);
  }

  serialize(): SpoilsSave {
    return JSON.parse(JSON.stringify({ treasures: this.state, custody: this.custody, records: this.records, personFactions: this.personFactions, pending: this.pending })) as SpoilsSave;
  }

  restore(save: SpoilsSave | undefined): void {
    this.reset();
    if (!save) return;
    for (const [id, s] of Object.entries(save.treasures ?? {})) if (this.state[id]) this.state[id] = s;
    this.custody.push(...(save.custody ?? []));
    this.records.push(...(save.records ?? []));
    for (const [id, f] of Object.entries(save.personFactions ?? {})) this.setFaction(id, f);
    // setFaction は装備を外すので、保存されていた装備をもう一度入れる
    for (const [id, s] of Object.entries(save.treasures ?? {})) if (this.state[id]) this.state[id].holderId = s.holderId;
    this.pending = save.pending ?? null;
  }
}

/** いまのゲームの戦利品の状態(戦闘の計算から、装備の効果を引くために使う) */
let current: Spoils | null = null;
export function setCurrentSpoils(s: Spoils): void {
  current = s;
}
/** 装備の効果を足した人物。戦利品の状態がまだ無ければ、そのまま */
export function withEquipment(p: Person | undefined): Person | undefined {
  return current ? current.boosted(p) : p;
}
/** 勢力の収蔵品による士気の上乗せ */
export function factionMoraleBonus(factionId: string): number {
  return current ? current.factionEffects(factionId).morale : 0;
}
