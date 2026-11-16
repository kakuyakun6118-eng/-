// 歴史の重大事件(Version 38で追加した分)。型どおりの事件(政変・反乱・遠征・称号・廃太子)は雛形で作り、
// それぞれに史実どおり・合理的な別案・大胆な改変の3つの選択肢と、国・都市・軍団・人物への具体的な効果を持たせる。
import type { Person } from "../data/types";
import { ledgerPerson, persons, scenario } from "../data";
import type { Campaign } from "./Campaign";
import { absent, alive, factionOfPersons, H, hanOf, jinOf, live, name, owner, P, pick, pw, qinOf, roll, shiOf, type Ctx, type HistEventDef } from "./history";

type R = Record<string, string | undefined>;
type Place = { name: string; lon: number; lat: number };
interface Base {
  id: string;
  name: string;
  year: number;
  month: number;
  place: Place;
  persons: string[];
  background: string;
  history: string;
  sources: string[];
  cond: string;
  importance?: "major" | "critical";
}
const ruled = (c: Campaign, ids: string[]): string | undefined => factionOfPersons(c, ids, true);
const inF = (c: Campaign, id: string, f: string | undefined): boolean => !!f && alive(c, id) && P(id)!.factionId === f;
const city = (x: Ctx, id: string) => x.c.cities.find((k) => k.id === id);
const addGarrison = (x: Ctx, id: string, n: number): void => {
  const k = city(x, id);
  if (!k) return;
  const st = x.c.cityState(k);
  x.c.cityStates[id] = { ...st, garrison: Math.max(500, st.garrison + n) };
};
const gold = (x: Ctx, f: string, d: number): void => {
  const p = x.c.factionStates[f];
  if (p) p.gold = Math.max(0, p.gold + d);
};
const nearestCity = (x: Ctx, f: string, pl: Place): string | undefined =>
  x.c.cities.filter((k) => k.kind !== "pass" && owner(k.id) === f).sort((a, b) => Math.hypot(a.lon - pl.lon, a.lat - pl.lat) - Math.hypot(b.lon - pl.lon, b.lat - pl.lat))[0]?.id;

// ---------------- 雛形:政変(簒奪) ----------------
function coup(o: Base & { usurper: string; victims: string[]; rulerIds: string[]; title?: string; stateName?: string; keepVictimAlive?: boolean; labels: [string, string, string]; descs: [string, string, string] }): HistEventDef {
  return {
    ...o, importance: o.importance ?? "major",
    roles: (x) => ({ f: ruled(x.c, o.rulerIds) }),
    done: () => P(o.usurper)?.role === "ruler",
    ready: (x, r) => {
      if (!r.f) return "政変の舞台となる国がない";
      const ruler = x.c.rulerOf(r.f);
      if (!ruler || !o.victims.includes(ruler.id)) return `${ruler?.name ?? "君主"}は、史実で廃された人物ではない`;
      if (!inF(x.c, o.usurper, r.f)) return absent(x.c, o.usurper, r.f);
      return true;
    },
    choices: {
      f: [
        { id: "yield", label: o.labels[0], kind: "historic", desc: o.descs[0], preview: `${nm(o.usurper)}が位につく(前の君主は${o.keepVictimAlive ? "退位" : "殺される"})。安定-20` },
        { id: "curb", label: o.labels[1], kind: "alt", desc: o.descs[1], preview: "簒奪を狙う者の忠誠-35、兵権を外す。拠点と兵があれば自立して内乱になる" },
        { id: "strike", label: o.labels[2], kind: "bold", desc: o.descs[2], preview: "成功すれば相手は処刑(軍団を持っていれば成功しにくい)。失敗すればただちに簒奪される" },
      ],
    },
    apply: (x, r, p) => {
      const f = r.f!;
      const victim = x.c.rulerOf(f)!;
      const u = P(o.usurper)!;
      const usurp = (): string => {
        if (o.keepVictimAlive) x.c.replaceRuler(f, victim, u);
        else {
          x.c.usurp(f, victim, u);
          x.c.court.recordCause(victim.id, "assassination", `${u.name}の政変`);
        }
        x.c.court.counts.usurpations++;
        x.c.court.addStability(f, -20);
        const fac = scenario.factions.find((y) => y.id === f)!;
        if (o.stateName) fac.name = o.stateName;
        if (o.title) {
          fac.title = o.title;
          x.c.court.ranks[f] = /皇帝/.test(o.title) ? "emperor" : /王/.test(o.title) ? "king" : x.c.court.rankOf(f);
        }
        x.h.log("ruler", `${u.name}が${victim.name}を廃して位につく`, undefined, o.id);
        return `${u.name}が${victim.name}を廃して位についた${o.stateName ? `(国号を「${o.stateName}」と改めた)` : ""}`;
      };
      if (p.f === "yield") return usurp();
      if (p.f === "curb") {
        x.c.loyalty.add(u.id, -35, "兵権を削られる");
        const army = x.c.armies.find((s) => s.army.commanderId === u.id);
        if (army) army.army.commanderId = "";
        x.c.court.addStability(f, -5);
        return x.c.secede(u.id, "兵権を削られて") ? `${u.name}は兵権を削られて自立した(内乱)` : `${u.name}の兵権は削られた。深く恨んでいる`;
      }
      const armed = x.c.postOf(u.id)?.kind === "army";
      if (roll(x, `${o.id}-strike`) < (armed ? 0.35 : 0.6)) {
        x.c.court.kill(u.id, "execution", "先手を打たれる");
        x.c.court.addStability(f, -10);
        return `${u.name}は誅殺された`;
      }
      return `誅殺は失敗した。${usurp()}`;
    },
  };
}

// ---------------- 雛形:反乱(権臣・王族が兵を挙げる) ----------------
function rebellion(o: Base & { rebel: string; ally?: string; rulerIds: string[]; base: string[]; capital: string; state: string; title: string; labels: [string, string, string]; descs: [string, string, string]; winFlag: string; extraReady?: (x: Ctx, r: R) => true | string }): HistEventDef {
  return {
    ...o, importance: o.importance ?? "major", battle: ["f", "rebel"],
    roles: (x) => ({ f: ruled(x.c, o.rulerIds) ?? factionOfPersons(x.c, [o.rebel]) }),
    done: () => P(o.rebel)?.role === "ruler",
    ready: (x, r) => {
      if (!r.f) return "反乱の舞台となる国がない";
      if (!inF(x.c, o.rebel, r.f)) return absent(x.c, o.rebel, r.f);
      return o.extraReady ? o.extraReady(x, r) : true;
    },
    choices: {
      f: [
        { id: "fight", label: o.labels[0], kind: "historic", desc: o.descs[0], preview: `${nm(o.rebel)}が挙兵して「${o.state}」を名乗る。都の近くで会戦になり、勝敗で皇権が変わる` },
        { id: "yield", label: o.labels[1], kind: "alt", desc: o.descs[1], preview: "反乱は起きない。相手の忠誠+25、君主の名声-5、安定-5(皇権が弱まる)" },
        { id: "seize", label: o.labels[2], kind: "bold", desc: o.descs[2], preview: "半分の見込みで捕らえる。失敗すれば相手は挙兵する(会戦なし)" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const f = r.f!;
      const reb = P(o.rebel)!;
      const ruler = x.c.rulerOf(f);
      if (p.f === "yield") {
        x.c.loyalty.add(reb.id, 25, "朝廷の譲歩");
        if (ruler) x.c.loyalty.addFame(ruler.id, -5);
        x.c.court.addStability(f, -5);
        h.flag(`${o.id}_concession`, "1");
        return `朝廷は譲歩した。${reb.name}は兵を収めたが、その力は増した`;
      }
      if (p.f === "seize" && roll(x, `${o.id}-seize`) < 0.5) {
        h.capture(reb.id, f);
        x.c.court.addStability(f, -5);
        return `${reb.name}は捕らえられた`;
      }
      // 挙兵:拠点(史実の地)で国を名乗る。軍団を持っていれば、都へ向かう
      const baseCity = o.base.find((c) => owner(c) === f) ?? nearestCity(x, f, o.place);
      const nf = baseCity ? x.c.foundState(reb.id, baseCity, o.state, o.title) : undefined;
      if (!nf) return `${reb.name}は兵を挙げようとしたが、拠点がなく、果たせなかった`;
      if (o.ally && inF(x.c, o.ally, f)) x.c.spoils.setFaction(o.ally, nf);
      if (p.f === "seize") return `${reb.name}は捕縛を逃れて挙兵し、「${o.state}」を名乗った`;
      const cap = city(x, o.capital);
      const ra = h.largestArmy(nf);
      const la = h.largestArmy(f, cap, 900);
      if (!ra) {
        addGarrison(x, baseCity!, 6000);
        const st = x.c.cityState(city(x, baseCity!)!);
        void st;
      }
      const ra2 = ra ?? (x.c.raiseArmy(baseCity!, 5000, reb.id) as never);
      const res = cap ? h.battle(typeof ra2 === "string" ? undefined : ra2, la, { name: cap.name, lon: cap.lon, lat: cap.lat }, o.id) : "";
      return `${reb.name}が「${o.state}」を名乗って挙兵した。${res}`;
    },
    onBattle: (x, r, win) => {
      const h = H(x);
      const f = r.f!;
      const ruler = x.c.rulerOf(f);
      if (win === "f" || win === null) {
        const reb = P(o.rebel);
        if (reb && alive(x.c, reb.id)) h.capture(reb.id, f);
        x.c.court.addStability(f, 5);
        return "朝廷軍が反乱軍を破った";
      }
      h.flag(o.winFlag, "1");
      x.c.court.addStability(f, -20);
      if (ruler) x.c.loyalty.addFame(ruler.id, -10);
      h.troops(f, 0.9);
      return "反乱軍が朝廷軍を破り、都に迫った(皇権は大きく揺らいだ)";
    },
  };
}

// ---------------- 雛形:遠征(会戦の事件) ----------------
function expedition(o: Base & { att: (c: Campaign) => string | undefined; def: (c: Campaign) => string | undefined; commanders: string[]; defCommanders?: string[]; attLabel: string; defLabel: string; onWin: (x: Ctx, r: R) => string; needWar?: boolean; labels: { att: [string, string, string]; def: [string, string, string] } }): HistEventDef {
  return {
    ...o, importance: o.importance ?? "major", battle: ["att", "def"],
    roles: (x) => ({ att: o.att(x.c), def: o.def(x.c) }),
    ready: (x, r) => (!r.att ? `${o.attLabel}がない` : !r.def ? `${o.defLabel}がない` : r.att === r.def ? "同じ国どうし" : ["alliance", "vassal"].includes(x.c.relationOf(r.att, r.def)) ? `${o.attLabel}と${o.defLabel}は同盟・従属の関係にある` : true),
    choices: {
      att: [
        { id: "go", label: o.labels.att[0], kind: "historic", desc: `${o.commanders.map((id) => nm(id)).filter(Boolean).join("・") || "主将"}に軍を率いさせる。`, preview: `${o.place.name}で会戦(遠ければ進軍)。勝てば:${o.labels.att[0].includes("北伐") ? "近くの都市を得る" : "戦果を得る"}` },
        { id: "supply", label: o.labels.att[1], kind: "alt", desc: "兵糧と後続の兵を整えてから進む。", preview: "金800で主力の食糧+40・士気+5にしてから会戦" },
        { id: "stop", label: o.labels.att[2], kind: "bold", desc: "遠征をやめ、その費用を国内に回す。", preview: "会戦は起きない。金+500、安定+5" },
      ],
      def: [
        { id: "meet", label: o.labels.def[0], kind: "historic", desc: "主力で迎え撃つ。", preview: "会戦で迎え撃つ(士気+5)" },
        { id: "hold", label: o.labels.def[1], kind: "alt", desc: "城の守りを固める。", preview: "戦場に近い都市の守備兵+5,000。会戦は相手しだい" },
        { id: "sue", label: o.labels.def[2], kind: "bold", desc: "使者を送って戦いを避ける。", preview: "相手が遠征をやめれば不可侵。続ければ、そのまま会戦(士気-5)" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const att = r.att!;
      const def = r.def!;
      if (p.att === "stop") {
        gold(x, att, 500);
        x.c.court.addStability(att, 5);
        if (p.def === "sue") x.c.setRelation(att, def, "nonaggression");
        return `${name(att)}は遠征を取りやめた`;
      }
      if (!x.c.atWar(att, def)) x.c.setRelation(att, def, "war");
      const aa = h.largestArmy(att, o.place, 1200);
      const da = h.largestArmy(def, o.place, 1200);
      const cmd = o.commanders.find((id) => inF(x.c, id, att));
      if (aa && cmd && aa.army.commanderId !== cmd) x.c.appoint(cmd, { kind: "army", id: aa.army.id });
      const dc = (o.defCommanders ?? []).find((id) => inF(x.c, id, def));
      if (da && dc && da.army.commanderId !== dc) x.c.appoint(dc, { kind: "army", id: da.army.id });
      if (aa && p.att === "supply") {
        gold(x, att, -800);
        aa.army.food += 40;
        aa.army.morale = Math.min(100, aa.army.morale + 5);
      }
      if (da && p.def === "meet") da.army.morale = Math.min(100, da.army.morale + 5);
      if (da && p.def === "sue") da.army.morale = Math.max(10, da.army.morale - 5);
      if (p.def === "hold") {
        const nc = nearestCity(x, def, o.place);
        if (nc) addGarrison(x, nc, 5000);
      }
      const db = p.def === "hold" ? h.largestArmy(def) : da;
      // 野戦に出る軍団が無いときは、国力で決着をつける(都市の守備兵どうしの戦い)
      if (!aa || !db) {
        const aw = pw(x, att) * (p.att === "supply" ? 1.15 : 1);
        const dw = pw(x, def) * (p.def === "hold" ? 1.3 : 1);
        if (roll(x, `${o.id}-res`) < aw / (aw + dw)) return `野戦の軍団がなく、城の攻防で決着した。${o.onWin(x, r)}`;
        return `野戦の軍団がなく、城の攻防で${o.defLabel}が守り切った`;
      }
      return h.battle(aa, db, o.place, o.id);
    },
    onBattle: (x, r, win) => {
      if (win === "att") {
        const cmd = o.commanders.find((id) => alive(x.c, id));
        if (cmd) x.c.loyalty.addFame(cmd, 8);
        return o.onWin(x, r);
      }
      const cmd = o.commanders.find((id) => alive(x.c, id));
      if (cmd) x.c.loyalty.addFame(cmd, -4);
      return `${o.defLabel}が守り切った`;
    },
  };
}

// ---------------- 雛形:称号(建国・即位) ----------------
function proclaim(o: Base & { rulerIds: string[]; rank: "king" | "emperor"; title: string; state?: string; overlord?: (c: Campaign) => string | undefined; labels: [string, string, string]; descs: [string, string, string] }): HistEventDef {
  return {
    ...o, importance: o.importance ?? "major",
    roles: (x) => ({ f: ruled(x.c, o.rulerIds) }),
    done: (x, r) => !!r.f && (x.c.court.rankOf(r.f) === "emperor" || (o.rank === "king" && x.c.court.rankOf(r.f) === "king")),
    ready: (x, r) => (r.f ? true : absent(x.c, o.rulerIds[0])),
    choices: {
      f: [
        { id: "crown", label: o.labels[0], kind: "historic", desc: o.descs[0], preview: `${o.title}を称し${o.state ? `、国号を「${o.state}」とする` : ""}。名声+8、安定+5` },
        { id: "vassal", label: o.labels[1], kind: "alt", desc: o.descs[1], preview: "称号は上げない。宗主(または東晋)との友好度+20、安定+3" },
        { id: "emperor", label: o.labels[2], kind: "bold", desc: o.descs[2], preview: "皇帝を称する。名声+12、安定-15、ほかの皇帝の国との友好度-30" },
      ],
    },
    apply: (x, r, p) => {
      const f = r.f!;
      const fac = scenario.factions.find((y) => y.id === f)!;
      const ruler = x.c.rulerOf(f);
      if (p.f === "vassal") {
        const ov = o.overlord?.(x.c) ?? jinOf(x.c);
        if (ov && ov !== f) x.c.diplo.addAmity(f, ov, 20);
        x.c.court.addStability(f, 3);
        return `${ruler?.name ?? "君主"}は称号を上げず、${ov ? name(ov) + "との関係を保った" : "時機を待った"}`;
      }
      const rank = p.f === "emperor" ? "emperor" : o.rank;
      x.c.court.ranks[f] = rank;
      fac.title = rank === "emperor" ? "皇帝" : o.title;
      if (o.state) fac.name = o.state;
      if (ruler) x.c.loyalty.addFame(ruler.id, rank === "emperor" ? 12 : 8);
      x.c.court.addStability(f, rank === "emperor" && o.rank !== "emperor" ? -15 : 5);
      if (rank === "emperor") for (const g of scenario.factions) if (g.id !== f && x.c.court.rankOf(g.id) === "emperor") x.c.diplo.addAmity(f, g.id, -30);
      x.h.log("crown", `${ruler?.name ?? ""}が${fac.title}を称する${o.state ? `(${o.state})` : ""}`, rank !== o.rank ? `史実では${o.title}` : undefined, o.id);
      return `${ruler?.name ?? "君主"}が${fac.title}を称した${o.state ? `(国号「${o.state}」)` : ""}`;
    },
  };
}

// ---------------- 雛形:廃太子 ----------------
function deposeHeir(o: Base & { rulerIds: string[]; heir: string; next: string; alt: string; labels: [string, string, string]; descs: [string, string, string] }): HistEventDef {
  return {
    ...o, importance: o.importance ?? "major",
    roles: (x) => ({ f: ruled(x.c, o.rulerIds) }),
    ready: (x, r) => (!r.f ? absent(x.c, o.rulerIds[0]) : !inF(x.c, o.heir, r.f) ? absent(x.c, o.heir, r.f) : true),
    choices: {
      f: [
        { id: "depose", label: o.labels[0], kind: "historic", desc: o.descs[0], preview: `${nm(o.heir)}は処刑され、${nm(o.next)}が後継者になる。安定-10` },
        { id: "other", label: o.labels[1], kind: "alt", desc: o.descs[1], preview: `${nm(o.heir)}を廃し、${nm(o.alt)}を後継者に(処刑はしない)。安定-5` },
        { id: "keep", label: o.labels[2], kind: "bold", desc: o.descs[2], preview: `${nm(o.heir)}を後継者に留める。君主の名声-5、${nm(o.heir)}の忠誠+20` },
      ],
    },
    apply: (x, r, p) => {
      const f = r.f!;
      const heir = P(o.heir)!;
      if (p.f === "keep") {
        x.c.court.heirs[f] = heir.id;
        x.c.loyalty.add(heir.id, 20, "許される");
        const ru = x.c.rulerOf(f);
        if (ru) x.c.loyalty.addFame(ru.id, -5);
        return `${heir.name}は許され、後継者に留まった`;
      }
      delete x.c.court.heirs[f];
      if (p.f === "depose") {
        x.c.court.kill(heir.id, "execution", "廃太子");
        x.c.court.addStability(f, -10);
        const nx = inF(x.c, o.next, f) ? o.next : undefined;
        if (nx) x.c.court.designateHeir(f, nx);
        x.h.flag(`${o.id}_minor_heir`, nx ?? "");
        return `${heir.name}は廃されて処刑された${nx ? `。${P(nx)!.name}が後継者となった` : ""}`;
      }
      x.c.loyalty.add(heir.id, -30, "廃される");
      x.c.court.addStability(f, -5);
      const al = inF(x.c, o.alt, f) ? o.alt : undefined;
      if (al) x.c.court.designateHeir(f, al);
      x.h.flag(`${o.id}_elder_heir`, al ?? "");
      return `${heir.name}は廃された${al ? `。${P(al)!.name}が後継者となった` : ""}`;
    },
  };
}
/** 台帳の名前(読み込みの途中でも使える) */
const nm = (id: string): string => ledgerPerson(id)?.name ?? id;

/** 独立(前秦からの自立など):拠点の都市で国を建てる */
function secedeEvent(o: Base & { holder: (c: Campaign) => string | undefined; who: string; cities: string[]; state: string; title: string; readyMore: (x: Ctx, r: R) => true | string; labels: [string, string, string]; descs: [string, string, string] }): HistEventDef {
  return {
    ...o, importance: o.importance ?? "major",
    roles: (x) => ({ f: o.holder(x.c) }),
    done: () => P(o.who)?.role === "ruler",
    ready: (x, r) => (!r.f ? "舞台となる国がない" : !inF(x.c, o.who, r.f) ? absent(x.c, o.who, r.f) : o.readyMore(x, r)),
    choices: {
      f: [
        { id: "allow", label: o.labels[0], kind: "historic", desc: o.descs[0], preview: `${nm(o.who)}が「${o.state}」を建てて自立する(拠点の都市を失う)` },
        { id: "reward", label: o.labels[1], kind: "alt", desc: o.descs[1], preview: "金1,500で忠誠+30。自立しない" },
        { id: "kill", label: o.labels[2], kind: "bold", desc: o.descs[2], preview: "半分の見込みで処刑。失敗すれば自立する。同じ民族の人々の忠誠-20" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const f = r.f!;
      const w = P(o.who)!;
      if (p.f === "reward") {
        gold(x, f, -1500);
        x.c.loyalty.add(w.id, 30, "恩賞で引き留められる");
        return `${w.name}は引き留められた`;
      }
      if (p.f === "kill") {
        for (const q of persons) if (q.people === w.people && q.factionId === f) x.c.loyalty.add(q.id, -20, `${w.name}の誅殺`);
        if (roll(x, `${o.id}-kill`) < 0.5) {
          x.c.court.kill(w.id, "execution", "自立を恐れられる");
          return `${w.name}は誅殺された`;
        }
      }
      const cityId = o.cities.find((c) => owner(c) === f) ?? nearestCity(x, f, o.place);
      const nf = cityId ? h.found(w.id, cityId, o.state, o.title) : undefined;
      return nf ? `${w.name}が「${o.state}」を建てて自立した` : `${w.name}は自立を図ったが、拠点を得られなかった`;
    },
  };
}

const jinEast = (c: Campaign): string | undefined => jinOf(c);
const yanOf = (c: Campaign): string | undefined => ruled(c, ["murong_hui", "murong_huang", "murong_jun", "murong_wei"]) ?? pick(c, "murong", "qianyan");
const houyanOf = (c: Campaign): string | undefined => ruled(c, ["murong_chui", "murong_bao", "murong_sheng"]);
const weiOf = (c: Campaign): string | undefined => ruled(c, ["tuoba_gui"]);

export const EXTRA_EVENTS: HistEventDef[] = [
  // ===== 西晋末期 =====
  expedition({
    id: "bawang301", name: "八王の乱:三王の挙兵(趙王倫の打倒)", year: 301, month: 3, place: { name: "洛陽", lon: 112.6, lat: 34.72 },
    persons: ["sima_lun", "sima_jiong", "sima_ying", "sima_yong", "sun_xiu"],
    background: "趙王司馬倫は恵帝を退けて自ら帝位に即いた。斉王司馬冏・成都王司馬穎・河間王司馬顒が倫の打倒を掲げて兵を挙げようとしている。",
    history: "301年、三王の軍が洛陽に迫り、司馬倫は敗れて死を賜った。恵帝は復位したが、王たちの争いはさらに続いた。", sources: ["『晋書』趙王倫伝・斉王冏伝", "『資治通鑑』巻84"],
    cond: "斉王または成都王の国と、趙王倫の朝廷がある",
    att: (c) => pick(c, "jiong", "ying"), def: (c) => ruled(c, ["sima_lun"]) ?? pick(c, "jin"), commanders: ["sima_jiong", "sima_ying"], defCommanders: ["sun_xiu", "zhang_hong"], attLabel: "挙兵する王の国", defLabel: "趙王倫の朝廷",
    labels: { att: ["三王で挙兵し、洛陽へ進む", "兵を整えてから進む", "挙兵を見送る"], def: ["孫秀に迎え撃たせる", "洛陽に籠もる", "王たちに和を請う"] },
    onWin: (x, r) => {
      const h = H(x);
      const ru = x.c.rulerOf(r.def!);
      if (owner("luoyang") === r.def) h.give("luoyang", r.att!);
      if (ru && ru.id === "sima_lun") x.c.court.kill(ru.id, "execution", "三王の挙兵");
      return "三王の軍が洛陽に入り、趙王倫は死を賜った";
    },
  }),
  {
    id: "yue306", name: "司馬越の権力掌握", year: 306, month: 6, importance: "major", place: { name: "長安", lon: 108.87, lat: 34.31 }, battle: ["yue", "yong"],
    persons: ["sima_yue", "sima_yong", "zhang_fang", "sima_zhong"],
    background: "東海王司馬越は、河間王司馬顒が長安に擁する恵帝を迎え取ろうと、関東の兵を西へ向けた。",
    history: "306年、司馬越の軍が長安に入り、恵帝を洛陽へ連れ戻した。司馬顒は敗走し、翌年殺された。307年に懐帝が立ち、司馬越が朝政を握った。", sources: ["『晋書』東海王越伝・河間王顒伝"],
    cond: "司馬越の国と、長安の朝廷(河間王)がある",
    roles: (x) => ({ yue: ruled(x.c, ["sima_yue"]) ?? pick(x.c, "yue"), yong: ruled(x.c, ["sima_yong"]) ?? (owner("changan") && /河間|晋/.test(name(owner("changan"))) ? owner("changan") : undefined) }),
    ready: (x, r) => (!r.yue ? absent(x.c, "sima_yue") : !r.yong ? "長安に河間王の朝廷がない" : r.yue === r.yong ? "同じ国" : true),
    choices: {
      yue: [
        { id: "march", label: "長安を攻めて皇帝を迎える", kind: "historic", desc: "鮮卑の騎兵も加えて関中へ。", preview: "長安へ向けて会戦(遠ければ進軍)。勝てば長安を得て名声+10" },
        { id: "share", label: "河間王と和を結び、朝政を分け合う", kind: "alt", desc: "戦いを避けて共同で朝廷を立てる。", preview: "両国は同盟(友好度+30)。名声+3" },
        { id: "throne", label: "自ら帝位をうかがう", kind: "bold", desc: "皇帝を迎えず、自ら立つ。", preview: "皇帝を称する。安定-20、晋の諸侯との友好度-30、長安とは戦争" },
      ],
      yong: [
        { id: "fight", label: "張方に迎え撃たせる", kind: "historic", desc: "長安の兵を出す。", preview: "会戦で迎え撃つ" },
        { id: "zhang", label: "張方を殺して和を請う", kind: "alt", desc: "史実で司馬顒が試みた策。", preview: "張方は殺される。司馬越が攻めていれば会戦(士気-10)" },
        { id: "west", label: "皇帝を連れて涼州へ逃れる", kind: "bold", desc: "張軌を頼る。", preview: "長安を捨て、兵の2割を失う。会戦は起きない" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      if (p.yong === "zhang" && inF(x.c, "zhang_fang", r.yong)) x.c.court.kill("zhang_fang", "execution", "和を請うため");
      if (p.yue === "share") {
        x.c.setRelation(r.yue!, r.yong!, "alliance");
        x.c.diplo.addAmity(r.yue!, r.yong!, 30);
        x.c.loyalty.addFame("sima_yue", 3);
        return "司馬越と河間王は和を結び、朝政を分け合った";
      }
      if (p.yue === "throne") {
        x.c.court.ranks[r.yue!] = "emperor";
        scenario.factions.find((f) => f.id === r.yue)!.title = "皇帝";
        x.c.court.addStability(r.yue!, -20);
        for (const g of scenario.factions) if (/晋|王/.test(g.name) && g.id !== r.yue) x.c.diplo.addAmity(r.yue!, g.id, -30);
      }
      x.c.setRelation(r.yue!, r.yong!, "war");
      if (p.yong === "west") {
        if (owner("changan") === r.yong) h.give("changan", r.yue!);
        h.troops(r.yong!, 0.8);
        return "河間王は長安を捨てて西へ逃れた。司馬越は長安を得た";
      }
      const ya = h.largestArmy(r.yong!, { lon: 108.87, lat: 34.31 }, 900);
      if (ya && p.yong === "zhang") ya.army.morale = Math.max(10, ya.army.morale - 10);
      return h.battle(h.largestArmy(r.yue!), ya, { name: "長安", lon: 108.87, lat: 34.31 }, "yue306");
    },
    onBattle: (x, r, win) => {
      if (win !== "yue") return "長安は持ちこたえた";
      if (owner("changan") === r.yong) H(x).give("changan", r.yue!);
      x.c.loyalty.addFame("sima_yue", 10);
      return "司馬越の軍が長安に入り、朝政を握った";
    },
  },
  coup({
    id: "liucong310", name: "劉聡の即位(劉和の誅殺)", year: 310, month: 7, place: { name: "平陽", lon: 111.52, lat: 36.08 },
    persons: ["liu_cong", "liu_he", "huyan_yi"], usurper: "liu_cong", victims: ["liu_he"], rulerIds: ["liu_he"],
    background: "劉淵が没し、太子の劉和が継いだ。劉和は側近に勧められて、兵権を持つ弟たちを除こうとしている。",
    history: "310年7月、劉和は劉聡を攻めたが敗れて殺され、劉聡が即位した。", sources: ["『晋書』劉聡載記", "『資治通鑑』巻87"],
    cond: "劉和が漢の君主で、劉聡が漢の宮廷にいる",
    labels: ["劉聡が兄を討って即位する", "劉聡に大単于の位と兵権を与えて和解", "劉和が先手を打って劉聡を討つ"],
    descs: ["兵権を握る劉聡が先に動く。", "兄弟の争いを避ける。", "側近の策どおり、弟たちを除く。"],
  }),
  {
    id: "shile312", name: "石勒の勢力拡大(襄国を拠点に)", year: 312, month: 7, importance: "major", place: { name: "襄国", lon: 114.5, lat: 37.07 },
    persons: ["shi_le", "zhang_bin", "kui_an", "kong_chang"],
    background: "江淮への南下に失敗した石勒は、張賓の進言に耳を傾けている。張賓は、河北の要地・襄国を拠点として根を張るよう説く。",
    history: "312年、石勒は襄国を拠点に定め、河北の諸城を次々に従えた。のちの後趙の基盤となった。", sources: ["『晋書』石勒載記上", "『資治通鑑』巻88"],
    cond: "石勒が軍を率いる国(石勒軍・漢)がある",
    roles: (x) => ({ f: factionOfPersons(x.c, ["shi_le"]) }),
    ready: (x, r) => (r.f ? true : absent(x.c, "shi_le")),
    choices: {
      f: [
        { id: "base", label: "張賓の策で襄国に拠り、河北を固める", kind: "historic", desc: "流浪をやめ、根拠地を築く。", preview: "襄国が敵のものなら奪い、守備兵+6,000。石勒の名声+8、兵+10%" },
        { id: "south", label: "江淮へ再び南下する", kind: "alt", desc: "江南の司馬睿を討つ。", preview: "江南の晋と戦争になり、主力が寿春へ向かう" },
        { id: "free", label: "漢から自立して王を称する", kind: "bold", desc: "劉聡の臣であることをやめる。", preview: "王の位に上がり、漢と戦争になる。安定-10" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const f = r.f!;
      if (p.f === "base") {
        const o = owner("xiangguo");
        if (o && o !== f && !["alliance", "vassal"].includes(x.c.relationOf(f, o))) h.give("xiangguo", f);
        if (owner("xiangguo") === f) addGarrison(x, "xiangguo", 6000);
        x.c.loyalty.addFame("shi_le", 8);
        for (const s of x.c.armies) if (s.army.commanderId === "shi_le") for (const k of ["infantry", "cavalry", "archer"] as const) s.army.troops[k] = Math.round(s.army.troops[k] * 1.1);
        return "石勒は襄国を拠点とし、河北に根を張った";
      }
      if (p.f === "south") {
        const jin = pick(x.c, "jin_rui", "jin");
        if (jin) x.c.setRelation(f, jin, "war");
        const a = x.c.armies.find((s) => s.army.commanderId === "shi_le") ?? h.largestArmy(f);
        const route = a ? x.c.planRoute(a.army.id, { lon: 116.78, lat: 32.57 }) : null;
        if (a && route) x.c.orderMove(a.army.id, route);
        return "石勒は再び江淮へ向かった";
      }
      if (P("shi_le")!.role !== "ruler") {
        const res = x.c.secede("shi_le", "漢から自立し");
        if (!res) return "石勒は自立を図ったが、拠点がなく果たせなかった";
      }
      const nf = P("shi_le")!.factionId;
      x.c.court.ranks[nf] = "king";
      scenario.factions.find((y) => y.id === nf)!.title = "趙王";
      const han = hanOf(x.c);
      if (han && han !== nf) x.c.setRelation(nf, han, "war");
      x.c.court.addStability(nf, -10);
      return "石勒は漢から自立し、王を称した";
    },
  },
  {
    id: "changan313", name: "長安の晋朝廷(愍帝の即位)", year: 313, month: 4, importance: "major", place: { name: "長安", lon: 108.87, lat: 34.31 },
    persons: ["sima_ye", "qu_yun", "suo_chen", "sima_bao"],
    background: "洛陽が落ち、懐帝は平陽で殺された。関中の麴允・索綝らは、長安で若い司馬鄴を皇帝に立てようとしている。",
    history: "313年4月、司馬鄴が長安で即位した(愍帝)。しかし関中は荒れ果て、朝廷の力は乏しかった。", sources: ["『晋書』孝愍帝紀"],
    cond: "長安を持つ晋の国があり、司馬鄴がいる",
    roles: (x) => ({ f: owner("changan") && /晋|司馬/.test(name(owner("changan")) + (x.c.rulerOf(owner("changan")!)?.name ?? "")) ? owner("changan") : factionOfPersons(x.c, ["sima_ye"]) }),
    ready: (x, r) => (!r.f ? "長安に晋の国がない" : !alive(x.c, "sima_ye") ? absent(x.c, "sima_ye") : true),
    choices: {
      f: [
        { id: "crown", label: "司馬鄴を皇帝に立て、長安で晋を保つ", kind: "historic", desc: "晋の正統を関中で続ける。", preview: "司馬鄴が君主・皇帝となる。長安の守備兵+4,000、安定+5" },
        { id: "south", label: "江南の司馬睿に正統を託す", kind: "alt", desc: "長安を守るより、江南と結ぶ。", preview: "江南の晋と同盟(友好度+30)。長安の安定-5" },
        { id: "liang", label: "長安を捨て、涼州の張軌と合流する", kind: "bold", desc: "河西で再起を図る。", preview: "長安を失い、前涼と同盟。兵の1割を失う" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const f = r.f!;
      if (p.f === "crown") {
        const ye = P("sima_ye")!;
        if (ye.factionId !== f) x.c.spoils.setFaction(ye.id, f);
        const ru = x.c.rulerOf(f);
        if (ru && ru.id !== ye.id) x.c.replaceRuler(f, ru, ye);
        x.c.court.ranks[f] = "emperor";
        scenario.factions.find((y) => y.id === f)!.title = "皇帝";
        addGarrison(x, "changan", 4000);
        x.c.court.addStability(f, 5);
        return "司馬鄴が長安で皇帝に即位した(愍帝)";
      }
      if (p.f === "south") {
        const j = pick(x.c, "jin_rui");
        if (j && j !== f) {
          x.c.setRelation(f, j, "alliance");
          x.c.diplo.addAmity(f, j, 30);
        }
        x.c.court.addStability(f, -5);
        return "長安の晋は、江南の司馬睿と結んだ";
      }
      const han = hanOf(x.c);
      if (han && owner("changan") === f) h.give("changan", han);
      const l = pick(x.c, "qianliang");
      if (l) x.c.setRelation(f, l, "alliance");
      h.troops(f, 0.9);
      return "晋の朝廷は長安を捨て、涼州へ向かった";
    },
  },
  // ===== 東晋の内乱 =====
  rebellion({
    id: "wangdun322", name: "王敦の乱(第一次)", year: 322, month: 1, place: { name: "建康", lon: 118.8, lat: 32.05 },
    persons: ["wang_dun", "sima_rui", "wang_dao", "liu_wei", "diao_xie", "zhou_yi"], rebel: "wang_dun", ally: "qian_feng", rulerIds: ["sima_rui"], base: ["wuchang", "jiangling"], capital: "jiankang", state: "晋(王敦)", title: "大将軍",
    background: "元帝は劉隗・刁協を重く用いて王氏を抑えようとしている。荊州で大軍を握る王敦は「君側の奸を除く」と兵を挙げようとしている。",
    history: "322年、王敦は武昌から建康に攻め上り、石頭城を落とした。劉隗は北へ逃れ、刁協・周顗・戴淵は殺された。元帝は屈服し、同年に憂いのうちに没した。", sources: ["『晋書』王敦伝・元帝紀", "『資治通鑑』巻92"],
    cond: "王敦が東晋にいる(元帝が王氏を抑えたときは、とくに起こりやすい)", winFlag: "wangdun_won",
    labels: ["劉隗・刁協に迎え撃たせる", "王敦の求めを容れ、劉隗を退ける", "先手を打って王敦の兵権を奪う"],
    descs: ["朝廷の兵で建康を守る。", "君側の奸として名指しされた者を遠ざける。", "王敦を都に呼び出して捕らえる。"],
  }),
  {
    id: "wangdun324", name: "王敦の乱(第二次)と明帝の親征", year: 324, month: 6, importance: "major", place: { name: "建康", lon: 118.8, lat: 32.05 }, battle: ["jin", "dun"],
    persons: ["wang_dun", "sima_shao", "wang_dao", "wen_jiao", "qian_feng", "shen_chong"],
    background: "王敦は再び兵を挙げて帝位をうかがっている。しかし王敦は病に倒れており、明帝は温嶠・王導と討伐を図っている。",
    history: "324年6月、明帝は王敦討伐の詔を下した。王敦は病死し、兄の王含・銭鳳らの軍は敗れた。東晋の皇権は回復した。", sources: ["『晋書』明帝紀・王敦伝"],
    cond: "王敦が生きていて、王敦の国(第一次の乱で挙兵)か東晋の宮廷にいる",
    roles: (x) => ({ jin: jinEast(x.c), dun: factionOfPersons(x.c, ["wang_dun"]) }),
    ready: (x, r) => (!alive(x.c, "wang_dun") ? absent(x.c, "wang_dun") : !r.jin ? "東晋がない" : true),
    choices: {
      jin: [
        { id: "march", label: "明帝みずから王敦を討つ", kind: "historic", desc: "温嶠・王導とともに詔を下す。", preview: "王敦が自立していれば会戦。王敦が東晋にいれば、王敦は病死し一党は討たれる。皇権が回復(安定+10)" },
        { id: "talk", label: "王導を通じて和議を結ぶ", kind: "alt", desc: "王氏の内部から説く。", preview: "王敦の国と不可侵。王敦の忠誠+15(東晋にいれば)" },
        { id: "abdicate", label: "王敦に禅譲する", kind: "bold", desc: "流血を避けて位を譲る。", preview: "王敦が東晋の君主になる(簒奪)。安定-25" },
      ],
      dun: [
        { id: "push", label: "病をおして建康を攻める", kind: "historic", desc: "銭鳳・王含に兵を率いさせる。", preview: "会戦(王敦が東晋の外にいるとき)" },
        { id: "wait", label: "病が癒えるまで兵を止める", kind: "alt", desc: "時を待つ。", preview: "会戦は起きない" },
        { id: "seize", label: "皇帝を廃して自ら立つ", kind: "bold", desc: "一気に帝位を奪う。", preview: "王敦が東晋にいれば簒奪を試みる(成功は半分)" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      const jin = r.jin!;
      const dun = P("wang_dun")!;
      const inside = dun.factionId === jin;
      if (p.jin === "abdicate" || (inside && p.dun === "seize" && roll(x, "wd2") < 0.5)) {
        const ru = x.c.rulerOf(jin)!;
        x.c.usurp(jin, ru, dun);
        x.c.court.counts.usurpations++;
        x.c.court.addStability(jin, -25);
        h.flag("wangdun_throne", "1");
        return `王敦が${ru.name}に代わって位についた`;
      }
      if (p.jin === "talk") {
        if (inside) x.c.loyalty.add(dun.id, 15, "和議");
        else x.c.setRelation(jin, dun.factionId, "nonaggression");
        return "王導の仲立ちで和議が結ばれた";
      }
      if (inside) {
        x.c.court.kill(dun.id, "illness", "討伐の最中に病死");
        for (const id of ["qian_feng", "shen_chong", "wang_han"]) if (inF(x.c, id, jin)) x.c.court.kill(id, "execution", "王敦の一党");
        x.c.court.addStability(jin, 10);
        h.flag("throne_restored", "1");
        return "王敦は病死し、銭鳳らは討たれた。東晋の皇権は回復した";
      }
      if (p.dun === "wait") return "王敦は兵を止めた";
      return h.battle(h.largestArmy(dun.factionId), h.largestArmy(jin, { lon: 118.8, lat: 32.05 }, 900), { name: "建康", lon: 118.8, lat: 32.05 }, "wangdun324");
    },
    onBattle: (x, r, win) => {
      if (win === "jin") {
        x.c.court.addStability(r.jin!, 10);
        H(x).flag("throne_restored", "1");
        return "朝廷軍が王敦の軍を破った。皇権は回復した";
      }
      H(x).flag("wangdun_won", "1");
      return "王敦の軍が勝ち、朝廷はさらに弱まった";
    },
  },
  expedition({
    id: "zuti319", name: "祖逖の北伐(雍丘の戦い)", year: 319, month: 5, place: { name: "雍丘", lon: 114.8, lat: 34.5 },
    persons: ["zu_ti", "zu_yue", "tao_bao", "shi_le", "chen_chuan"],
    background: "「中流に楫を撃つ」と誓って長江を渡った祖逖は、兵糧も兵も自ら集めながら河南の塢主たちをまとめ、石勒の将・桃豹と対峙している。",
    history: "319〜320年、祖逖は雍丘を拠点に桃豹を破り、黄河以南の多くを回復した。しかし朝廷の支援は乏しく、321年に祖逖が没すると北伐は頓挫した。", sources: ["『晋書』祖逖伝", "『資治通鑑』巻91"],
    cond: "祖逖が東晋にいて、石勒の国がある",
    att: (c) => factionOfPersons(c, ["zu_ti"]), def: (c) => shiOf(c), commanders: ["zu_ti"], defCommanders: ["tao_bao", "shi_hu"], attLabel: "祖逖の国(東晋)", defLabel: "石勒の国",
    labels: { att: ["祖逖に北伐を続けさせる", "朝廷が兵糧を送り全面支援する", "北伐をやめ祖逖を江南へ呼び戻す"], def: ["桃豹に迎え撃たせる", "陳留の城を固める", "祖逖と互市を開いて和を請う"] },
    onWin: (x, r) => {
      const h = H(x);
      const c = nearestCity(x, r.def!, { name: "雍丘", lon: 114.8, lat: 34.5 });
      const near = c && Math.hypot(city(x, c)!.lon - 114.8, city(x, c)!.lat - 34.5) < 1.4;
      if (near) h.give(c!, r.att!);
      h.flag("zuti_won", "1");
      return `祖逖が勝ち、${near ? city(x, c!)!.name + "を回復した" : "河南の塢主たちが従った"}`;
    },
  }),
  rebellion({
    id: "sujun327", name: "蘇峻の乱", year: 327, month: 12, place: { name: "建康", lon: 118.8, lat: 32.05 },
    persons: ["su_jun", "zu_yue", "yu_liang", "tao_kan", "wen_jiao", "xi_jian"], rebel: "su_jun", ally: "zu_yue", rulerIds: ["sima_yan", "sima_shao"], base: ["hefei", "shouchun"], capital: "jiankang", state: "蘇峻軍", title: "将軍",
    background: "外戚の庾亮は、歴陽で兵を擁する蘇峻を朝廷に召し上げて兵権を奪おうとしている。蘇峻は祖約と結んで兵を挙げようとしている。",
    history: "327年末、蘇峻・祖約が挙兵し、328年に建康を落として略奪した。陶侃・温嶠・郗鑒の連合軍が反撃し、蘇峻は戦死、乱は329年に平定された。建康は荒廃した。", sources: ["『晋書』蘇峻伝・陶侃伝・庾亮伝", "『資治通鑑』巻93-94"],
    cond: "蘇峻が東晋にいる", winFlag: "sujun_sacked",
    labels: ["庾亮の強硬策で蘇峻を召し上げる(挙兵を招く)", "蘇峻を懐柔して歴陽に留める", "先に蘇峻を捕らえる"],
    descs: ["外戚の庾亮が朝議を押し切る。", "温嶠らの進言に従う。", "兵を送って不意を突く。"],
  }),
  expedition({
    id: "yinhao353", name: "殷浩の北伐", year: 353, month: 10, place: { name: "洛陽", lon: 112.6, lat: 34.72 },
    persons: ["yin_hao", "yao_xiang", "huan_wen", "xie_shang"],
    background: "後趙の崩壊で中原が乱れるなか、朝廷は桓温を抑えるため、清談の名士・殷浩に北伐を命じた。先鋒は帰順した羌の姚襄である。",
    history: "353年、殷浩は北伐に出たが、姚襄に背かれて大敗した。殷浩は庶人に落とされ、北伐の主導権は桓温に移った。", sources: ["『晋書』殷浩伝・姚襄載記"],
    cond: "殷浩が東晋にいて、洛陽を持つ国がある",
    att: (c) => factionOfPersons(c, ["yin_hao"]), def: (_c) => owner("luoyang"), commanders: ["yin_hao", "xie_shang"], attLabel: "殷浩の国(東晋)", defLabel: "洛陽を持つ国",
    labels: { att: ["殷浩に北伐させる(姚襄を先鋒に)", "桓温に北伐を任せる", "北伐をやめる"], def: ["洛陽で迎え撃つ", "洛陽を固める", "東晋に和を請う"] },
    onWin: (x, r) => {
      if (owner("luoyang") === r.def) H(x).give("luoyang", r.att!);
      return "東晋が洛陽を回復した";
    },
  }),
  coup({
    id: "huanwen371", name: "桓温による皇帝の廃立", year: 371, month: 11, place: { name: "建康", lon: 118.8, lat: 32.05 },
    persons: ["huan_wen", "sima_yi_fei", "sima_yu", "xie_an", "wang_tanzhi"], usurper: "sima_yu", victims: ["sima_yi_fei"], rulerIds: ["sima_yi_fei"], keepVictimAlive: true,
    background: "枋頭の敗戦で威信を落とした桓温は、皇帝司馬奕に子をなす力がないと言い立て、廃位して会稽王司馬昱を立てようとしている。",
    history: "371年11月、桓温は司馬奕を廃して東海王(のち海西公)に落とし、司馬昱を立てた(簡文帝)。謝安・王坦之は桓温の簒奪を警戒した。", sources: ["『晋書』海西公紀・桓温伝"],
    cond: "司馬奕が東晋の君主で、司馬昱が宮廷にいる",
    labels: ["桓温の廃立を受け入れ、司馬昱を立てる", "謝安・王坦之が桓温を抑える", "桓温を討つ"],
    descs: ["皇帝を退位させる。", "名門が結束して廃立を拒む。", "宮中の兵で桓温を除く。"],
  }),
  coup({
    id: "huanxuan403", name: "桓玄の簒奪(楚の建国)", year: 403, month: 12, place: { name: "建康", lon: 118.8, lat: 32.05 },
    persons: ["huan_xuan2", "sima_dezong", "sima_yuanxian", "liu_laozhi"], usurper: "huan_xuan2", victims: ["sima_dezong", "sima_yao", "sima_dewen"], rulerIds: ["sima_dezong", "sima_yao", "sima_dewen"], keepVictimAlive: true, stateName: "楚", title: "皇帝",
    background: "司馬道子・元顕の政権を倒して建康に入った桓玄は、安帝に禅譲を迫っている。",
    history: "403年12月、桓玄は安帝から禅譲を受けて楚を建てた。しかし翌404年、劉裕ら北府軍の挙兵で敗れ、殺された。", sources: ["『晋書』桓玄伝・安帝紀"],
    cond: "安帝ら司馬氏が東晋の君主で、桓玄が宮廷にいる",
    labels: ["桓玄が禅譲を受け、楚を建てる", "北府軍の諸将が桓玄を抑える", "桓玄を誅殺する"],
    descs: ["安帝は位を譲る。", "劉牢之らの軍が桓玄をけん制する。", "宮中で桓玄を除く。"],
  }),
  // ===== 後趙・冉魏 =====
  {
    id: "shihu333", name: "石虎の権力掌握(石勒の死後)", year: 333, month: 8, importance: "major", place: { name: "襄国", lon: 114.5, lat: 37.07 },
    persons: ["shi_hu", "shi_hong", "cheng_xia", "xu_guang", "shi_kan"],
    background: "石勒が没し、石弘が即位した。兵を握る石虎は宮中を兵で囲み、丞相・魏王の位を求めている。程遐・徐光は石虎を除くよう説いていた。",
    history: "333年、石虎は丞相・魏王となって朝政を握り、程遐・徐光を殺した。石堪は兵を挙げたが敗れた。", sources: ["『晋書』石季龍載記上"],
    cond: "石弘が後趙の君主で、石虎が宮廷にいる",
    roles: (x) => ({ f: ruled(x.c, ["shi_hong"]) }),
    ready: (x, r) => (!r.f ? absent(x.c, "shi_hong") : !inF(x.c, "shi_hu", r.f) ? absent(x.c, "shi_hu", r.f) : true),
    choices: {
      f: [
        { id: "grant", label: "石虎を丞相・魏王とする", kind: "historic", desc: "求めに応じて朝政を委ねる。", preview: "石虎が兵権を握り(忠誠+10)、程遐・徐光は処刑される。のちの簒奪の見込みが上がる" },
        { id: "cheng", label: "程遐に兵権を預け、石虎を地方へ出す", kind: "alt", desc: "石虎を都から遠ざける。", preview: "石虎の忠誠-25。334年の簒奪が起こりにくくなる(石虎は兵権を失う)" },
        { id: "kan", label: "石堪の挙兵を後押しして石虎を討たせる", kind: "bold", desc: "一族の力で対抗する。", preview: "半分の見込みで石虎を除く。失敗すれば石堪が殺され、石虎の力はさらに強まる" },
      ],
    },
    apply: (x, r, p) => {
      const f = r.f!;
      if (p.f === "grant") {
        x.c.loyalty.add("shi_hu", 10, "丞相・魏王となる");
        for (const id of ["cheng_xia", "xu_guang"]) if (inF(x.c, id, f)) x.c.court.kill(id, "execution", "石虎に殺される");
        x.h.flag("shihu_power", "1");
        return "石虎が丞相・魏王となって朝政を握った";
      }
      if (p.f === "cheng") {
        x.c.loyalty.add("shi_hu", -25, "地方へ出される");
        const a = x.c.armies.find((s) => s.army.commanderId === "shi_hu");
        if (a) a.army.commanderId = inF(x.c, "cheng_xia", f) ? "cheng_xia" : "";
        x.h.flag("shihu_curbed", "1");
        return "石虎は兵権を外され、都を離れた";
      }
      if (roll(x, "kan") < 0.5) {
        x.c.court.kill("shi_hu", "battle", "石堪の挙兵");
        return "石堪の挙兵で石虎は討たれた";
      }
      if (inF(x.c, "shi_kan", f)) x.c.court.kill("shi_kan", "execution", "挙兵に敗れる");
      x.c.loyalty.add("shi_hu", 5, "反対派を除く");
      x.h.flag("shihu_power", "1");
      return "石堪の挙兵は失敗し、石虎の力はさらに強まった";
    },
  },
  deposeHeir({
    id: "shisui337", name: "石邃の廃太子", year: 337, month: 7, place: { name: "鄴", lon: 114.35, lat: 36.33 },
    persons: ["shi_hu", "shi_sui", "shi_xuan"], rulerIds: ["shi_hu"], heir: "shi_sui", next: "shi_xuan", alt: "shi_zun",
    background: "石虎の太子・石邃は驕り高ぶり、父を除こうと謀ったと告げられた。",
    history: "337年、石虎は石邃とその妻子ら二十余人を殺し、石宣を太子とした。", sources: ["『晋書』石季龍載記上"],
    cond: "石虎が君主で、石邃がその宮廷にいる",
    labels: ["石邃を廃して処刑し、石宣を太子に", "石邃を廃し、石遵を太子に(処刑はしない)", "石邃を許して太子に留める"],
    descs: ["謀反の罪で一族ごと除く。", "命は助ける。", "父子の情を優先する。"],
  }),
  deposeHeir({
    id: "shixuan348", name: "石宣の廃太子と石世の立太子", year: 348, month: 9, place: { name: "鄴", lon: 114.35, lat: 36.33 },
    persons: ["shi_hu", "shi_xuan", "shi_shi", "shi_zun"], rulerIds: ["shi_hu"], heir: "shi_xuan", next: "shi_shi", alt: "shi_zun",
    background: "太子の石宣は、父に寵愛された弟の石韜を殺した。石虎は激怒している。",
    history: "348年、石虎は石宣を惨殺し、幼い石世を太子とした。翌年の石虎の死後、石遵・石鑑・冉閔の争いで後趙は崩れた。", sources: ["『晋書』石季龍載記下"],
    cond: "石虎が君主で、石宣がその宮廷にいる",
    labels: ["石宣を処刑し、幼い石世を太子に", "石宣を廃し、年長の石遵を太子に", "石宣を許す"],
    descs: ["史実どおり。後継者が幼く、のちの内乱を招く。", "年長の子を立て、内乱を避ける。", "後継の争いを避ける。"],
  }),
  expedition({
    id: "ranwei352", name: "冉魏の滅亡(廉台の戦い)", year: 352, month: 4, place: { name: "廉台", lon: 115.0, lat: 38.0 },
    persons: ["ran_min", "murong_ke", "murong_jun"],
    background: "冉閔は後趙の残党と戦い続けて疲弊している。前燕の慕容儁は弟の慕容恪を南へ送った。",
    history: "352年4月、慕容恪は廉台で冉閔を破って捕らえ、冉閔は処刑された。鄴も落ち、冉魏は滅んだ。", sources: ["『晋書』慕容儁載記・石季龍載記附冉閔伝"],
    cond: "前燕と、冉閔が君主の国がある",
    att: (c) => yanOf(c), def: (c) => ruled(c, ["ran_min"]), commanders: ["murong_ke", "murong_ping"], defCommanders: ["ran_min"], attLabel: "前燕", defLabel: "冉魏",
    labels: { att: ["慕容恪に冉閔を討たせる", "兵糧を整え鉄騎で囲む", "冉魏と和し、後趙の残党を討つ"], def: ["冉閔みずから出撃して決戦", "鄴に籠城する", "東晋に臣従して援軍を求める"] },
    onWin: (x, r) => {
      const h = H(x);
      if (alive(x.c, "ran_min")) h.capture("ran_min", r.att!);
      if (owner("ye") === r.def) h.give("ye", r.att!);
      return "慕容恪が冉閔を捕らえ、冉魏は滅んだ";
    },
  }),
  // ===== 前燕・後燕 =====
  expedition({
    id: "murong319", name: "慕容廆の台頭(三国連合の撃退)", year: 319, month: 12, place: { name: "棘城", lon: 121.0, lat: 41.6 },
    persons: ["murong_hui", "cui_bi", "murong_han", "pei_yi"],
    background: "平州刺史の崔毖は、高句麗・段部・宇文部と結んで慕容廆を討とうとしている。慕容廆は反間の計で連合を割ろうとしている。",
    history: "319年、慕容廆は連合を離間させ、残った宇文部を破った。崔毖は高句麗へ逃れ、遼東は慕容氏のものとなった。", sources: ["『晋書』慕容廆載記", "『資治通鑑』巻91"],
    cond: "慕容部と崔毖の国がある",
    att: (c) => ruled(c, ["murong_hui"]) ?? pick(c, "murong"), def: (c) => pick(c, "cui_bi"), commanders: ["murong_han", "murong_huang"], defCommanders: ["cui_tao"], attLabel: "慕容部", defLabel: "崔毖の国",
    labels: { att: ["反間の計で連合を崩し、崔毖を討つ", "棘城に籠もって連合の自壊を待つ", "高句麗まで攻め入る"], def: ["連合軍で棘城を攻める", "遼東を固める", "慕容廆に和を請う"] },
    onWin: (x, r) => {
      const ru = x.c.rulerOf(r.def!);
      const n = name(r.def);
      x.c.annex(r.def!, r.att!);
      const g = pick(x.c, "goguryeo");
      if (ru && g) x.c.spoils.setFaction(ru.id, g);
      x.c.loyalty.addFame("murong_hui", 10);
      return `${n}は滅び、遼東は慕容氏のものとなった(崔毖は高句麗へ逃れた)`;
    },
  }),
  rebellion({
    id: "murong333", name: "慕容皝の即位と慕容仁の反乱", year: 333, month: 10, place: { name: "棘城", lon: 121.0, lat: 41.6 },
    persons: ["murong_huang", "murong_ren", "murong_han", "murong_zhao"], rebel: "murong_ren", rulerIds: ["murong_huang"], base: ["xiangping"], capital: "jicheng", state: "遼東(慕容仁)", title: "平州刺史",
    background: "慕容廆が没し、慕容皝が継いだ。弟の慕容仁は遼東で兵を握り、兄の継承を認めていない。慕容翰は害を恐れて段部へ逃れた。",
    history: "333年、慕容仁は遼東で自立した。慕容皝は336年、凍った海を渡って奇襲し、慕容仁を討った。", sources: ["『晋書』慕容皝載記", "『資治通鑑』巻95"],
    cond: "慕容皝が君主で、慕容仁が同じ国にいる", winFlag: "murongren_won",
    labels: ["遼東の慕容仁を討つ", "慕容仁に遼東を任せて和解する", "慕容仁・慕容翰を粛清する"],
    descs: ["兄弟の争いを力で収める。", "遼東の自治を認める。", "一族の危険を除く。"],
  }),
  proclaim({
    id: "qianyan337", name: "前燕の建国(慕容皝が燕王を称する)", year: 337, month: 10, place: { name: "棘城", lon: 121.0, lat: 41.6 },
    persons: ["murong_huang", "feng_yi", "murong_ke"], rulerIds: ["murong_huang"], rank: "king", title: "燕王", state: "燕(前燕)",
    background: "遼東・遼西を固めた慕容皝に、封奕らは王を称するよう勧めている。",
    history: "337年10月、慕容皝は燕王を称した(前燕の始まり)。341年には東晋から燕王の冊封を受けた。", sources: ["『晋書』慕容皝載記"],
    cond: "慕容皝が君主の国がある",
    labels: ["燕王を称する", "東晋の臣として燕王の冊封を求める", "皇帝を称する"], descs: ["封奕らの推戴に応える。", "名分を重んじる。", "一気に帝位に即く。"],
  }),
  expedition({
    id: "wandu342", name: "慕容恪・慕容翰の高句麗遠征(丸都の陥落)", year: 342, month: 11, place: { name: "襄平の東", lon: 124.5, lat: 41.4 },
    persons: ["murong_huang", "murong_han", "murong_ke", "gogugwon"],
    background: "慕容翰の策で、前燕は険しい南道から高句麗の都・丸都を突こうとしている。若い慕容恪もこの戦いで頭角を現しつつある。",
    history: "342年、前燕軍は丸都を落とし、故国原王の父の墓をあばき、王母を連れ去った。高句麗は前燕に臣従した。", sources: ["『晋書』慕容皝載記", "『三国史記』高句麗本紀"],
    cond: "前燕(慕容氏の国)と高句麗がある",
    att: (c) => yanOf(c), def: (c) => pick(c, "goguryeo"), commanders: ["murong_han", "murong_ke"], attLabel: "前燕", defLabel: "高句麗",
    labels: { att: ["南道から丸都を突く", "北道から大軍で進む", "朝貢させるだけにする"], def: ["丸都で迎え撃つ", "山城に籠もる", "前燕に臣従する"] },
    onWin: (x, r) => {
      const res = x.c.diplo.act(r.att!, r.def!, "vassal");
      if (!res.ok) {
        x.c.setRelation(r.att!, r.def!, "vassal");
        x.c.diplo.overlord[r.def!] = r.att!;
      }
      x.c.loyalty.addFame("murong_ke", 6);
      return "丸都は落ち、高句麗は前燕に臣従した";
    },
  }),
  {
    id: "chui369", name: "慕容垂の亡命", year: 369, month: 11, importance: "major", place: { name: "鄴", lon: 114.35, lat: 36.33 },
    persons: ["murong_chui", "murong_ping", "kezuhun", "fu_jian", "wang_meng"],
    background: "枋頭で桓温を破った慕容垂の名声は高まったが、太傅の慕容評と可足渾太后は慕容垂を除こうとしている。",
    history: "369年11月、慕容垂は子らとともに前秦へ亡命し、苻堅に厚遇された。前燕は名将を失い、翌年滅んだ。", sources: ["『晋書』慕容垂載記", "『資治通鑑』巻102"],
    cond: "慕容垂が前燕(慕容氏の国)にいて、前秦がある",
    roles: (x) => ({ yan: yanOf(x.c), qin: qinOf(x.c) }),
    ready: (x, r) => (!r.yan ? "前燕がない" : !inF(x.c, "murong_chui", r.yan) ? absent(x.c, "murong_chui", r.yan) : !r.qin ? "亡命先の前秦がない" : true),
    choices: {
      yan: [
        { id: "ignore", label: "慕容評の讒言を放っておく", kind: "historic", desc: "慕容垂は危険を察して西へ逃れる。", preview: "慕容垂と子ら(慕容農・慕容宝・慕容麟)が前秦へ移る。前燕の安定-10" },
        { id: "trust", label: "慕容垂を重く用い、慕容評を退ける", kind: "alt", desc: "名将に国防を委ねる。", preview: "慕容垂の忠誠+25、慕容評の忠誠-20。前燕の安定+5。後燕は史実どおりには生まれない" },
        { id: "kill", label: "慕容垂を誅殺する", kind: "bold", desc: "太后の意に従う。", preview: "慕容垂は処刑され、鮮卑の人々の忠誠-15。前燕の名将が失われる" },
      ],
    },
    apply: (x, r, p) => {
      const yan = r.yan!;
      if (p.yan === "trust") {
        x.c.loyalty.add("murong_chui", 25, "重く用いられる");
        x.c.loyalty.add("murong_ping", -20, "退けられる");
        x.c.court.addStability(yan, 5);
        x.h.flag("chui_stayed", "1");
        return "慕容垂は前燕に留まり、国防を委ねられた";
      }
      if (p.yan === "kill") {
        x.c.court.kill("murong_chui", "execution", "讒言による誅殺");
        for (const q of persons) if (q.people === "鮮卑" && q.factionId === yan) x.c.loyalty.add(q.id, -15, "慕容垂の誅殺");
        return "慕容垂は誅殺された";
      }
      for (const id of ["murong_chui", "murong_nong", "murong_bao", "murong_lin", "murong_de"]) {
        const q = P(id);
        if (q && q.factionId === yan && q.role !== "ruler" && alive(x.c, id) && (id !== "murong_de" || roll(x, "de") < 0.3)) {
          for (const s of x.c.armies) if (s.army.commanderId === id) s.army.commanderId = "";
          x.c.spoils.setFaction(id, r.qin!);
          x.c.loyalty.rebase(id, "前秦へ亡命", 70);
        }
      }
      x.c.court.addStability(yan, -10);
      x.h.flag("chui_exiled", "1");
      return "慕容垂は子らとともに前秦へ亡命し、苻堅に迎えられた";
    },
  },
  {
    id: "murongbao396", name: "慕容宝の即位", year: 396, month: 5, importance: "major", place: { name: "中山", lon: 114.98, lat: 38.52 },
    persons: ["murong_bao", "murong_lin", "murong_nong", "murong_sheng"],
    background: "参合陂の敗戦の翌年、慕容垂は北魏への親征の帰途に没した。太子の慕容宝が継ぐが、弟の慕容麟・慕容農との仲は良くない。",
    history: "396年4月、慕容宝が即位した。北魏の拓跋珪はただちに南下し、慕容宝は翌年中山を捨てて龍城へ逃れた。", sources: ["『晋書』慕容宝載記"],
    cond: "慕容宝が後燕の君主になっている",
    roles: (x) => ({ f: ruled(x.c, ["murong_bao"]) }),
    ready: (x, r) => (r.f ? true : absent(x.c, "murong_bao")),
    choices: {
      f: [
        { id: "rule", label: "慕容宝が親政し、兄弟と対立する", kind: "historic", desc: "太子の権威で押し切る。", preview: "安定-15、慕容麟の忠誠-20" },
        { id: "nong", label: "慕容農に軍を委ねて結束する", kind: "alt", desc: "有能な弟を重んじる。", preview: "安定+10、慕容農の忠誠+15・名声+5" },
        { id: "purge", label: "慕容麟を除き、慕容盛を太子に", kind: "bold", desc: "危険な弟を先に除く。", preview: "慕容麟は処刑、慕容盛が後継者。安定-5" },
      ],
    },
    apply: (x, r, p) => {
      const f = r.f!;
      if (p.f === "rule") {
        x.c.court.addStability(f, -15);
        x.c.loyalty.add("murong_lin", -20, "兄と対立");
        return "慕容宝が親政を始めたが、兄弟の仲は悪化した";
      }
      if (p.f === "nong") {
        x.c.court.addStability(f, 10);
        x.c.loyalty.add("murong_nong", 15, "軍を委ねられる");
        x.c.loyalty.addFame("murong_nong", 5);
        return "慕容宝は慕容農に軍を委ね、一族は結束した";
      }
      if (inF(x.c, "murong_lin", f)) x.c.court.kill("murong_lin", "execution", "粛清");
      if (inF(x.c, "murong_sheng", f)) x.c.court.designateHeir(f, "murong_sheng");
      x.c.court.addStability(f, -5);
      return "慕容麟は除かれ、慕容盛が太子となった";
    },
  },
  expedition({
    id: "weifan397", name: "北魏の後燕への反攻(中山の陥落)", year: 397, month: 10, place: { name: "中山", lon: 114.98, lat: 38.52 },
    persons: ["tuoba_gui", "murong_bao", "murong_lin", "murong_de"],
    background: "参合陂の勝利ののち、拓跋珪は四十万と号する大軍で太行山を越え、後燕の都・中山を囲もうとしている。",
    history: "397年、北魏は柏肆で後燕軍を破り、10月に中山を落とした。後燕は龍城の慕容宝と、鄴から南へ移った慕容徳(南燕)に分かれた。", sources: ["『魏書』太祖紀", "『晋書』慕容宝載記"],
    cond: "北魏と後燕がある(参合陂で北魏が勝っていれば、とくに起こりやすい)",
    att: (c) => weiOf(c), def: (c) => houyanOf(c), commanders: ["tuoba_gui"], defCommanders: ["murong_nong", "murong_bao"], attLabel: "北魏", defLabel: "後燕",
    labels: { att: ["太行山を越えて中山を囲む", "并州(晋陽)を先に取る", "後燕と和を結ぶ"], def: ["柏肆で迎え撃つ", "中山に籠城する", "北魏に和を請う"] },
    onWin: (x, r) => {
      const h = H(x);
      for (const c of ["zhongshan", "xindu"]) if (owner(c) === r.def) h.give(c, r.att!);
      return "北魏が中山を落とした";
    },
  }),
  // ===== 前秦 =====
  proclaim({
    id: "fujian351", name: "苻健の建国(前秦)", year: 351, month: 1, place: { name: "長安", lon: 108.87, lat: 34.31 },
    persons: ["fu_jian_jian", "fu_xiong", "pu_hong"], rulerIds: ["fu_jian_jian", "pu_hong"], rank: "emperor", title: "天王", state: "秦(前秦)",
    background: "父の苻洪が毒殺され、苻健は氐の衆を率いて関中に入り、長安を得た。",
    history: "351年、苻健は長安で天王・大単于を称して国号を秦とし(前秦)、352年に皇帝となった。", sources: ["『晋書』苻健載記"],
    cond: "苻健(または苻洪)が君主の国がある",
    overlord: (c) => jinOf(c),
    labels: ["天王を称し、国号を秦とする", "東晋に帰順して官爵を受ける", "ただちに皇帝を称する"], descs: ["関中の主として立つ。", "名分を得て関中を治める。", "帝位に即く。"],
  }),
  {
    id: "fusheng355", name: "苻生の暴政", year: 355, month: 9, importance: "major", place: { name: "長安", lon: 108.87, lat: 34.31 },
    persons: ["fu_sheng", "fu_jian", "wang_meng", "lv_polou"],
    background: "即位した苻生は酒に溺れ、気に入らない臣下を次々に殺している。宮中は恐れに包まれた。",
    history: "355〜357年、苻生は皇后や重臣を殺し、人心は離れた。これが357年の苻堅の挙兵につながった。", sources: ["『晋書』苻生載記"],
    cond: "苻生が前秦の君主",
    roles: (x) => ({ f: ruled(x.c, ["fu_sheng"]) }),
    ready: (x, r) => (r.f ? true : absent(x.c, "fu_sheng")),
    choices: {
      f: [
        { id: "tyrant", label: "苻生の暴政が続く", kind: "historic", desc: "諫める者を退ける。", preview: "安定-20、全員の忠誠-8、苻堅の忠誠-15(357年の苻堅の挙兵が起こりやすい)" },
        { id: "remonstrate", label: "重臣が命がけで諫める", kind: "alt", desc: "苻生が改める。", preview: "安定+5。苻堅の挙兵は起こりにくくなる" },
        { id: "delegate", label: "苻堅に政務を委ねる", kind: "bold", desc: "苻生は酒色に退き、苻堅が実権を握る。", preview: "苻堅の忠誠+15・名声+8、収入が増える(安定+5)" },
      ],
    },
    apply: (x, r, p) => {
      const f = r.f!;
      if (p.f === "tyrant") {
        x.c.court.addStability(f, -20);
        for (const q of persons) if (q.factionId === f && q.role !== "ruler") x.c.loyalty.add(q.id, -8, "苻生の暴政");
        x.c.loyalty.add("fu_jian", -15, "苻生の暴政");
        x.h.flag("fusheng_tyranny", "1");
        return "苻生の暴政は続き、人心は離れた";
      }
      if (p.f === "remonstrate") {
        x.c.court.addStability(f, 5);
        x.h.flag("fusheng_reformed", "1");
        return "苻生は諫めを容れて改めた";
      }
      x.c.loyalty.add("fu_jian", 15, "政務を委ねられる");
      x.c.loyalty.addFame("fu_jian", 8);
      x.c.court.addStability(f, 5);
      return "苻生は政務を苻堅に委ねた";
    },
  },
  {
    id: "wangmeng358", name: "王猛の改革", year: 358, month: 6, importance: "major", place: { name: "長安", lon: 108.87, lat: 34.31 },
    persons: ["wang_meng", "fu_jian", "qiang_wang", "deng_qiang"],
    background: "苻堅に重く用いられた王猛は、横暴な氐の豪族を法で抑え、官制と農政を立て直そうとしている。",
    history: "358年、王猛は豪族の強徳ら二十余人を処刑して法を示した。苻堅は「天下に法があることを知った」と言った。前秦は富強となった。", sources: ["『晋書』苻堅載記附王猛伝", "『資治通鑑』巻100"],
    cond: "苻堅が君主で、王猛が前秦の宮廷にいる",
    roles: (x) => ({ f: ruled(x.c, ["fu_jian"]) }),
    ready: (x, r) => (!r.f ? absent(x.c, "fu_jian") : !inF(x.c, "wang_meng", r.f) ? absent(x.c, "wang_meng", r.f) : true),
    choices: {
      f: [
        { id: "reform", label: "王猛に法と官制の改革を任せる", kind: "historic", desc: "豪族を抑えて法を立てる。", preview: "全都市の治安+10・商業+10、安定+10。氐の豪族(氐の人物)の忠誠-10" },
        { id: "mild", label: "豪族と妥協して穏やかに改める", kind: "alt", desc: "反発を避ける。", preview: "安定+5、全都市の治安+5" },
        { id: "chancellor", label: "王猛に全権を委ねて丞相とする", kind: "bold", desc: "君主は王猛に国政を一任する。", preview: "王猛の忠誠+20・名声+10、全都市の商業+15・治安+10。苻堅の名声-5" },
      ],
    },
    apply: (x, r, p) => {
      const f = r.f!;
      const bump = (order: number, commerce: number): void => {
        for (const k of x.c.cities) if (owner(k.id) === f && k.kind !== "pass") {
          const st = x.c.cityState(k) as unknown as Record<string, number>;
          const next = { ...st, order: Math.min(100, (st.order ?? 50) + order), commerce: Math.min(100, (st.commerce ?? 0) + commerce) } as never;
          x.c.cityStates[k.id] = next;
        }
      };
      if (p.f === "reform") {
        bump(10, 10);
        x.c.court.addStability(f, 10);
        for (const q of persons) if (q.factionId === f && q.people === "氐" && q.role !== "ruler") x.c.loyalty.add(q.id, -10, "王猛の法");
        x.h.flag("wangmeng_reform", "1");
        return "王猛は豪族を抑えて法を立て、前秦は富強となった";
      }
      if (p.f === "mild") {
        bump(5, 0);
        x.c.court.addStability(f, 5);
        return "穏やかな改革が行われた";
      }
      bump(10, 15);
      x.c.loyalty.add("wang_meng", 20, "丞相となる");
      x.c.loyalty.addFame("wang_meng", 10);
      x.c.loyalty.addFame("fu_jian", -5);
      x.h.flag("wangmeng_reform", "1");
      return "王猛が丞相として国政を一任された";
    },
  },
  secedeEvent({
    id: "houqin384", name: "姚萇の独立(後秦の建国)", year: 384, month: 4, place: { name: "北地", lon: 108.4, lat: 35.1 },
    persons: ["yao_chang", "fu_jian", "fu_rui"], holder: (c) => qinOf(c), who: "yao_chang", cities: ["anding"], state: "秦(後秦)", title: "万年秦王",
    background: "慕容泓討伐に失敗した苻叡が戦死し、その責めを恐れた姚萇は渭北の羌の衆に推されている。",
    history: "384年4月、姚萇は渭北で万年秦王を称して自立した(後秦)。", sources: ["『晋書』姚萇載記"],
    cond: "姚萇が前秦にいて、前秦が淝水で敗れたか不安定",
    readyMore: (x, r) => (x.h.flags.feishui_winner === r.f ? "前秦は淝水で勝ち、羌の人々も従っている" : (x.c.court.stability[r.f!] ?? 60) >= 45 && !x.h.flags.feishui_winner ? "前秦は安定している" : true),
    labels: ["姚萇の自立を止められない", "姚萇を許して恩賞を与える", "姚萇を誅殺する"], descs: ["前秦の力は及ばない。", "敗戦の責めを問わない。", "危険を除く。"],
  }),
  secedeEvent({
    id: "xiyan384", name: "慕容泓・慕容沖の独立(西燕)", year: 384, month: 4, place: { name: "華陰", lon: 110.1, lat: 34.6 },
    persons: ["murong_chong", "murong_hong", "fu_jian", "murong_wei"], holder: (c) => qinOf(c), who: "murong_chong", cities: ["shangdang", "pingyang"], state: "燕(西燕)", title: "皇帝",
    background: "関中にいた慕容泓・慕容沖の兄弟が、鮮卑の衆を集めて兵を挙げようとしている。長安には兄の慕容暐がいる。",
    history: "384年、慕容泓が華陰で挙兵し、慕容沖がこれを継いで385年に阿房で皇帝を称した(西燕)。長安は包囲され、苻堅は城を出た。", sources: ["『晋書』慕容沖載記・苻堅載記"],
    cond: "慕容沖が前秦にいて、前秦が淝水で敗れたか不安定",
    readyMore: (x, r) => (x.h.flags.feishui_winner === r.f ? "前秦は淝水で勝ち、鮮卑の人々も従っている" : (x.c.court.stability[r.f!] ?? 60) >= 45 && !x.h.flags.feishui_winner ? "前秦は安定している" : true),
    labels: ["慕容沖の挙兵を許す(鎮圧に失敗)", "慕容暐を通じて兄弟をなだめる", "慕容暐ら長安の慕容氏を誅殺する"], descs: ["前秦の力は及ばない。", "一族の情に訴える。", "史実で苻堅が最後に選んだ報復。"],
  }),
  {
    id: "fujian385", name: "苻堅の最期", year: 385, month: 7, importance: "major", place: { name: "五将山", lon: 108.2, lat: 34.9 },
    persons: ["fu_jian", "yao_chang", "murong_chong", "fu_hong2"],
    background: "西燕の慕容沖に長安を囲まれた苻堅は、太子の苻宏に長安を託し、自らは五将山へ出ようとしている。そこは後秦の姚萇の勢力圏である。",
    history: "385年7月、苻堅は五将山で姚萇に捕らえられ、8月に新平の仏寺で縊殺された。前秦は苻丕・苻登のもとで細々と続いた。", sources: ["『晋書』苻堅載記下", "『資治通鑑』巻106"],
    cond: "苻堅が前秦の君主で、姚萇が別の国(後秦)の君主として前秦と戦っている",
    roles: (x) => ({ f: ruled(x.c, ["fu_jian"]), yao: ruled(x.c, ["yao_chang"]) }),
    ready: (x, r) => (!r.f ? absent(x.c, "fu_jian") : !r.yao ? "姚萇が自立していない(後秦がない)" : !x.c.atWar(r.f, r.yao) ? "前秦と後秦が戦争していない" : true),
    choices: {
      f: [
        { id: "out", label: "長安を出て五将山へ向かう", kind: "historic", desc: "太子に長安を託す。", preview: "苻堅は姚萇に捕らえられる(国は苻丕・苻宏らが継ぐ)" },
        { id: "hold", label: "長安で籠城する", kind: "alt", desc: "最後まで都を守る。", preview: "長安の守備兵+8,000、安定+5。苻堅は捕らわれない" },
        { id: "jin", label: "東晋に降り、援軍を求める", kind: "bold", desc: "かつての敵を頼る。", preview: "東晋の従属国となり、東晋と同盟。姚萇・慕容沖と戦い続ける" },
      ],
    },
    apply: (x, r, p) => {
      const h = H(x);
      if (p.f === "out") {
        h.capture("fu_jian", r.yao!);
        return "苻堅は五将山で姚萇に捕らえられた";
      }
      if (p.f === "hold") {
        addGarrison(x, "changan", 8000);
        x.c.court.addStability(r.f!, 5);
        return "苻堅は長安で籠城を続けた";
      }
      const j = jinOf(x.c);
      if (j) {
        x.c.setRelation(r.f!, j, "vassal");
        x.c.diplo.overlord[r.f!] = j;
      }
      return "苻堅は東晋に降り、その援軍を待つことになった";
    },
  },
  // ===== 北魏 =====
  {
    id: "tuobagui385", name: "拓跋珪の台頭(賀蘭部への逃亡)", year: 385, month: 8, importance: "major", place: { name: "盛楽", lon: 111.8, lat: 40.4 },
    persons: ["tuoba_gui", "liu_kuren", "liu_xian"],
    background: "独孤部の劉庫仁が殺され、跡を継いだ劉顕は、成長した拓跋珪を除こうとしている。拓跋珪は母の実家の賀蘭部へ逃れようとしている。",
    history: "385年、拓跋珪は劉顕の害を逃れて賀蘭部に身を寄せ、代の旧臣たちが集まった。翌年、拓跋珪は代王に即いた。", sources: ["『魏書』太祖紀"],
    cond: "拓跋珪が生きていて、どこかの国に仕えている(君主でない)",
    roles: (x) => ({ f: factionOfPersons(x.c, ["tuoba_gui"]) }),
    done: () => P("tuoba_gui")?.role === "ruler",
    ready: (x, r) => (!r.f ? absent(x.c, "tuoba_gui") : true),
    choices: {
      f: [
        { id: "flee", label: "拓跋珪は賀蘭部へ逃れ、旧臣を集める", kind: "historic", desc: "代の再興の旗を立てる。", preview: "拓跋珪の名声+15、いまの主君への忠誠-20(386年の北魏建国が起こりやすい)" },
        { id: "serve", label: "拓跋珪を守り、臣として仕えさせる", kind: "alt", desc: "主君が拓跋珪をかばう。", preview: "拓跋珪の忠誠+15" },
        { id: "rise", label: "拓跋珪が劉顕を討って諸部を従える", kind: "bold", desc: "逃げずに戦う。", preview: "拓跋珪の名声+25、主君の安定-10" },
      ],
    },
    apply: (x, r, p) => {
      if (p.f === "flee") {
        x.c.loyalty.addFame("tuoba_gui", 15);
        x.c.loyalty.add("tuoba_gui", -20, "賀蘭部へ逃れる");
        return "拓跋珪は賀蘭部へ逃れ、代の旧臣が集まった";
      }
      if (p.f === "serve") {
        x.c.loyalty.add("tuoba_gui", 15, "かばわれる");
        return "拓跋珪は主君に守られ、仕え続けた";
      }
      x.c.loyalty.addFame("tuoba_gui", 25);
      x.c.court.addStability(r.f!, -10);
      return "拓跋珪は諸部を従え、その名は草原に広まった";
    },
  },
  // ===== その他 =====
  proclaim({
    id: "chenghan304", name: "成漢の建国(李雄の成都王)", year: 304, month: 10, place: { name: "成都", lon: 104.07, lat: 30.66 },
    persons: ["li_xiong", "li_xiang", "fan_changsheng"], rulerIds: ["li_xiong"], rank: "king", title: "成都王", state: "成",
    background: "流民を率いた李特が戦死したのち、子の李雄は成都を落とした。道士の范長生も李雄を支えている。",
    history: "304年、李雄は成都王を称し、306年に皇帝となって国号を大成とした(成漢)。", sources: ["『晋書』李雄載記", "『華陽国志』"],
    cond: "李雄が君主の国がある",
    labels: ["成都王を称する", "晋に帰順して益州を治める", "皇帝を称する"], descs: ["蜀の主として立つ。", "晋の官爵を受ける。", "ただちに帝位に即く。"],
  }),
  expedition({
    id: "chenghan347", name: "桓温の蜀征伐(成漢の滅亡)", year: 347, month: 3, place: { name: "成都", lon: 104.07, lat: 30.66 },
    persons: ["huan_wen", "li_shi2", "zhou_fu"],
    background: "荊州刺史の桓温は、朝廷の許しを待たずに一万の兵で長江をさかのぼり、成漢の都・成都を突こうとしている。",
    history: "347年3月、桓温は笮橋で成漢軍を破り、李勢は降伏した。成漢は滅び、桓温の名声は大いに高まった。", sources: ["『晋書』桓温伝・李勢載記"],
    cond: "桓温が東晋にいて、成漢(李氏の国)がある",
    att: (c) => factionOfPersons(c, ["huan_wen"]), def: (c) => ruled(c, ["li_shi2", "li_shou", "li_qi", "li_xiong"]) ?? pick(c, "chenghan"), commanders: ["huan_wen", "zhou_fu"], attLabel: "東晋", defLabel: "成漢",
    labels: { att: ["桓温に蜀を討たせる", "兵糧を整えてから進む", "遠征を取りやめる"], def: ["笮橋で迎え撃つ", "成都に籠城する", "東晋に降る"] },
    onWin: (x, r) => {
      const h = H(x);
      const ru = x.c.rulerOf(r.def!);
      if (owner("chengdu") === r.def) h.give("chengdu", r.att!);
      if (ru && alive(x.c, ru.id)) h.capture(ru.id, r.att!);
      x.c.loyalty.addFame("huan_wen", 10);
      return "成都は落ち、成漢は滅んだ";
    },
  }),
  coup({
    id: "qianliang353", name: "前涼の内紛(張祚の簒奪)", year: 353, month: 11, place: { name: "姑臧", lon: 102.63, lat: 37.93 },
    persons: ["zhang_zuo", "zhang_yaoling", "zhang_guan", "song_hun"], usurper: "zhang_zuo", victims: ["zhang_yaoling"], rulerIds: ["zhang_yaoling"], title: "涼王",
    background: "張重華が没し、10歳の張耀霊が継いだ。伯父の張祚は宮中の者と通じて位を狙っている。",
    history: "353年、張祚は張耀霊を廃して自ら立ち、涼王を称した。355年、張瓘・宋混らに攻められて殺された。", sources: ["『晋書』張軌伝附張祚伝"],
    cond: "張耀霊が前涼の君主で、張祚が宮廷にいる",
    labels: ["張祚が張耀霊を廃して位につく", "張瓘に兵権を預けて張祚を抑える", "張祚を誅殺する"],
    descs: ["幼君は抗えない。", "外の重臣に頼る。", "宮中で除く。"],
  }),
  {
    id: "chouchi322", name: "仇池の興亡(前趙の遠征)", year: 322, month: 3, importance: "major", place: { name: "仇池", lon: 105.3, lat: 33.9 },
    persons: ["yang_nandi", "yang_jiantou", "liu_yao"],
    background: "隴右を平定した前趙の劉曜は、氐の楊難敵が拠る要害・仇池に兵を向けた。",
    history: "322年、劉曜は仇池を攻め、楊難敵は臣従した。のち楊難敵は漢中へ逃れ、前趙の衰えに乗じて仇池を取り戻した。", sources: ["『晋書』劉曜載記", "『宋書』氐胡伝"],
    cond: "仇池(楊氏の国)と前趙がある",
    roles: (x) => ({ chou: ruled(x.c, ["yang_maosou", "yang_nandi", "yang_jiantou"]) ?? pick(x.c, "chouchi"), han: hanOf(x.c) }),
    ready: (_x, r) => (!r.chou ? "仇池がない" : !r.han ? "前趙がない" : true),
    choices: {
      chou: [
        { id: "submit", label: "前趙に臣従する(のち再起を図る)", kind: "historic", desc: "険しい山に拠りつつ、いったん頭を下げる。", preview: "前趙の従属国になる。いつか宗主が弱れば離れる" },
        { id: "ally", label: "成漢と結んで抵抗する", kind: "alt", desc: "南の成漢を頼る。", preview: "成漢と同盟、前趙と戦争。仇池の守備兵+4,000" },
        { id: "raid", label: "関中へ打って出る", kind: "bold", desc: "攻めて活路を開く。", preview: "前趙と戦争。主力が上邽へ向かう" },
      ],
    },
    apply: (x, r, p) => {
      const ch = r.chou!;
      const han = r.han!;
      if (p.chou === "submit") {
        x.c.setRelation(han, ch, "vassal");
        x.c.diplo.overlord[ch] = han;
        return "仇池は前趙に臣従した";
      }
      x.c.setRelation(han, ch, "war");
      if (p.chou === "ally") {
        const c = pick(x.c, "chenghan");
        if (c) x.c.setRelation(ch, c, "alliance");
        addGarrison(x, "chouchi", 4000);
        return "仇池は成漢と結んで抵抗した";
      }
      const a = H(x).largestArmy(ch);
      const route = a ? x.c.planRoute(a.army.id, { lon: 105.72, lat: 34.58 }) : null;
      if (a && route) x.c.orderMove(a.army.id, route);
      return "仇池の軍は上邽へ打って出た";
    },
  },
  {
    id: "tuyuhun329", name: "吐谷渾の勢力拡大(葉延の国号)", year: 329, month: 6, importance: "major", place: { name: "西平", lon: 101.77, lat: 36.62 },
    persons: ["yeyan", "tuyan"],
    background: "父の吐延が羌に殺され、若い葉延が部を継いだ。葉延は祖父の名「吐谷渾」を部族の号とし、青海の羌・氐を従えようとしている。",
    history: "329年ごろ、葉延は「吐谷渾」を国号とし、のちの吐谷渾国の基礎を築いた。", sources: ["『晋書』吐谷渾伝", "『宋書』鮮卑吐谷渾伝"],
    cond: "吐谷渾がある",
    roles: (x) => ({ f: pick(x.c, "tuyuhun") ?? ruled(x.c, ["yeyan", "tuyan"]) }),
    ready: (_x, r) => (r.f ? true : "吐谷渾がない"),
    choices: {
      f: [
        { id: "name", label: "祖父の名を国号とし、羌・氐を従える", kind: "historic", desc: "部族の結束を固める。", preview: "君主の名声+8、兵+15%、安定+10" },
        { id: "tribute", label: "前涼に朝貢して後ろ盾を得る", kind: "alt", desc: "東の大国と結ぶ。", preview: "前涼との友好度+25、金+300" },
        { id: "east", label: "隴西へ進出する", kind: "bold", desc: "東の豊かな地を狙う。", preview: "前涼と戦争。主力が隴西へ向かう" },
      ],
    },
    apply: (x, r, p) => {
      const f = r.f!;
      const ru = x.c.rulerOf(f);
      if (p.f === "name") {
        if (ru) x.c.loyalty.addFame(ru.id, 8);
        H(x).troops(f, 1.15);
        x.c.court.addStability(f, 10);
        return "吐谷渾が国号となり、部族は結束した";
      }
      const l = pick(x.c, "qianliang");
      if (p.f === "tribute") {
        if (l) x.c.diplo.addAmity(f, l, 25);
        gold(x, f, 300);
        return "吐谷渾は前涼に朝貢した";
      }
      if (l) x.c.setRelation(f, l, "war");
      const a = H(x).largestArmy(f);
      const route = a ? x.c.planRoute(a.army.id, { lon: 104.6, lat: 35.6 }) : null;
      if (a && route) x.c.orderMove(a.army.id, route);
      return "吐谷渾は隴西へ進出した";
    },
  },
];

export function personList(ids: string[]): Person[] {
  return ids.map((id) => P(id)).filter((p): p is Person => !!p);
}
export { live };
