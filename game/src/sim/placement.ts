// 人物の所在(Version 40)。シナリオ開始時の史実の所在(placements.json)を出発点に、
// 任命・出陣・捕縛・亡命・国家の滅亡などで、いまどこにいるかを決める。
// 所在の分からない人物を、根拠なく特定の都市にいたことにはしない(「ゲーム上の推定配置」と明示する)。
import { persons, personById, scenario } from "../data";
import placementData from "../data/scenarios/placements.json";
import type { City } from "../data/types";
import type { Campaign } from "./Campaign";

export type LocationKind = "city" | "pass" | "court" | "army" | "moving" | "captive" | "exile" | "unknown" | "dead";
export type LocationCertainty = "確認" | "推定" | "不明" | "架空" | "ゲーム上の推定配置" | "ゲーム中の任命";

export const LOCATION_LABEL: Record<LocationKind, string> = {
  city: "都市", pass: "関所", court: "宮廷", army: "軍団", moving: "移動中", captive: "捕虜", exile: "亡命", unknown: "不明", dead: "死去",
};

export interface PersonLocation {
  kind: LocationKind;
  cityId?: string;
  armyId?: string;
  /** 画面に出す一文(例:「長安の宮廷」「劉曜軍(出陣中)」) */
  label: string;
  certainty: LocationCertainty;
  source?: string;
  note?: string;
}

interface Home { cityId: string; kind: "city" | "court"; certainty: LocationCertainty; source?: string; note?: string }
type Curated = { kind: "city" | "court" | "army"; at?: string; army?: string; certainty: LocationCertainty; source?: string; note?: string };

export interface PlacementSave { homes: Record<string, Home> }

export class Placement {
  homes: Record<string, Home> = {};
  /** シナリオ開始時の軍団と指揮官(史実の配置か、ゲーム中の任命かを見分けるため) */
  private startArmies = new Map<string, string>();

  constructor(private readonly c: Campaign) {}

  private curated(): Record<string, Curated> {
    return ((placementData.scenarios as Record<string, Record<string, Curated>>)[scenario.id] ?? {});
  }

  /** シナリオ開始時の所在を決める(fresh:新しいゲームの開始時。史実の所在に合わせて、開始時の軍団を拠点のそばに置く) */
  init(fresh = false): void {
    this.homes = {};
    this.startArmies = new Map(this.c.armies.map((s) => [s.army.id, s.army.commanderId]));
    const cur = this.curated();
    for (const p of persons) {
      if (this.c.personStatus(p.id) === "dead") continue;
      const fiction = p.fictional ? "架空" : undefined;
      const k = cur[p.id];
      // 史実の所在の都市があり、開始時にその人が軍団を率いていて、軍団がその都市から150km以内なら、軍団をその都市に置く
      if (fresh && k && k.kind !== "army" && k.at) {
        const city = this.city(k.at);
        const s = this.c.armies.find((x) => x.army.commanderId === p.id);
        if (city && s && scenario.cityOwners[city.id] === s.army.factionId && Math.hypot(city.lon - s.army.lon, city.lat - s.army.lat) < 1.4) {
          s.army.lon = city.lon + 0.12;
          s.army.lat = city.lat - 0.08;
        }
      }
      if (k && k.kind !== "army" && k.at && this.city(k.at)) {
        this.homes[p.id] = { cityId: k.at, kind: k.kind, certainty: (fiction ?? k.certainty) as LocationCertainty, source: k.source, note: k.note };
        continue;
      }
      // 太守・守将の任地
      const post = this.c.postOf(p.id);
      if (post?.kind === "city") {
        this.homes[p.id] = { cityId: post.id, kind: "city", certainty: (fiction ?? "推定") as LocationCertainty, note: "シナリオの太守・守将の配置" };
        continue;
      }
      // 后妃・皇族など、住まいが決まっている人
      if (p.residence && this.city(p.residence)) {
        this.homes[p.id] = { cityId: p.residence, kind: "court", certainty: (fiction ?? "推定") as LocationCertainty, note: "宮廷(皇族・后妃の住まい)" };
        continue;
      }
      const cap = this.c.strategy.capitalOf(p.factionId);
      if (cap) {
        const ruler = p.role === "ruler";
        this.homes[p.id] = { cityId: cap.id, kind: "court", certainty: (fiction ?? (ruler ? "推定" : "ゲーム上の推定配置")) as LocationCertainty, note: ruler ? "君主の都" : "所在の史料がないため、所属国家の都(宮廷)に置く" };
      }
    }
  }

  private city(id: string): City | undefined {
    return this.c.cities.find((x) => x.id === id);
  }

  /** 任地・所在を移す(任命・召集・亡命など) */
  moveTo(personId: string, cityId: string, kind: "city" | "court", note: string): void {
    this.homes[personId] = { cityId, kind, certainty: "ゲーム中の任命", note };
  }

  /** いまの所在 */
  locationOf(personId: string): PersonLocation {
    const p = personById(personId);
    const status = this.c.personStatus(personId);
    if (!p) return { kind: "unknown", label: "不明", certainty: "不明" };
    if (status === "dead") return { kind: "dead", label: "死去", certainty: "確認" };
    if (status === "captured" || status === "protected") {
      const cus = this.c.spoils.custody.find((x) => x.personId === personId);
      const holder = cus?.holder;
      const cap = holder ? this.c.strategy.capitalOf(holder) : undefined;
      const hn = scenario.factions.find((f) => f.id === holder)?.name ?? "";
      return { kind: "captive", cityId: cap?.id, label: `${hn}の${status === "protected" ? "保護下" : "捕虜"}${cap ? `(${cap.name})` : ""}`, certainty: "ゲーム中の任命" };
    }
    // 軍団:出陣中(行軍・戦闘)なら、都市には常駐していない
    const army = this.c.armies.find((s) => s.army.commanderId === personId || s.army.deputyId === personId);
    if (army) {
      const role = army.army.commanderId === personId ? "指揮官" : "副将";
      const away = army.status === "marching" || army.status === "fighting";
      const cur = this.curated()[personId];
      const certainty = (cur?.kind === "army" ? cur.certainty : p.fictional ? "架空" : "推定") as LocationCertainty;
      // 駐屯している都市(野営している軍団のそばの自国の都市)
      const base = away ? undefined : this.c.cities.filter((k) => scenario.cityOwners[k.id] === army.army.factionId && Math.hypot(k.lon - army.army.lon, k.lat - army.army.lat) < 0.45)
        .sort((x, y) => Math.hypot(x.lon - army.army.lon, x.lat - army.army.lat) - Math.hypot(y.lon - army.army.lon, y.lat - army.army.lat))[0];
      return { kind: away ? "moving" : "army", armyId: army.army.id, cityId: base?.id, label: `${army.army.name}の${role}${away ? (army.status === "fighting" ? "(交戦中)" : "(出陣中)") : base ? `(${base.name}に駐屯)` : "(野営)"}`, certainty: this.startArmies.get(army.army.id) === army.army.commanderId ? certainty : "ゲーム中の任命", source: cur?.source, note: cur?.note };
    }
    // 太守・守将
    const post = this.c.postOf(personId);
    if (post?.kind === "city") {
      const city = this.city(post.id)!;
      const h = this.homes[personId];
      const same = h?.cityId === city.id;
      return { kind: city.kind === "pass" ? "pass" : "city", cityId: city.id, label: `${city.name}(${city.kind === "pass" ? "守将" : p.role === "ruler" ? "在城" : "太守"})`, certainty: same ? h.certainty : "ゲーム中の任命", source: same ? h.source : undefined, note: same ? h.note : undefined };
    }
    // 拠点:持ち主が変わっていたら(落城・滅亡・亡命)、いまの所属国家の都へ移す
    let h = this.homes[personId];
    const owner = h ? scenario.cityOwners[h.cityId] : undefined;
    if (!h || (owner !== p.factionId && !["alliance", "vassal"].includes(this.c.relationOf(owner ?? "", p.factionId)))) {
      const cap = this.c.strategy.capitalOf(p.factionId);
      if (!cap) return { kind: "unknown", label: "所在不明(所属国家に都市がない)", certainty: "不明" };
      h = this.homes[personId] = { cityId: cap.id, kind: "court", certainty: h ? "ゲーム中の任命" : "ゲーム上の推定配置", note: h ? "拠点を失い、都へ移った" : "所属国家の都(宮廷)に置く" };
    }
    const city = this.city(h.cityId)!;
    const capital = this.c.strategy.capitalOf(p.factionId)?.id === city.id;
    const kind: LocationKind = h.kind === "court" && capital ? "court" : city.kind === "pass" ? "pass" : "city";
    return { kind, cityId: city.id, label: kind === "court" ? `${city.name}の宮廷` : `${city.name}に在住`, certainty: h.certainty, source: h.source, note: h.note };
  }

  /** その都市にいる人物(太守・在住・宮廷。出陣中の軍団の人は入れない) */
  peopleAt(cityId: string): string[] {
    return persons.filter((p) => {
      const l = this.locationOf(p.id);
      return (l.kind === "city" || l.kind === "pass" || l.kind === "court") && l.cityId === cityId;
    }).map((p) => p.id);
  }

  serialize(): PlacementSave {
    return { homes: JSON.parse(JSON.stringify(this.homes)) as Record<string, Home> };
  }

  restore(save: PlacementSave | undefined): void {
    if (!save) return this.init();
    this.homes = { ...save.homes };
    // 古いセーブや、あとから加わった人物は、初めの配置で補う
    const keep = this.homes;
    this.init();
    this.homes = { ...this.homes, ...keep };
  }
}
