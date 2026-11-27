// 仮想シナリオ「炎漢再興 ― 天命を継ぐ者」の専用の事件(10件。Version 65 で「漢室再興の詔」を追加)。
// 決まった年月ではなく、領土・威信・人物の生存・軍事力・外交の条件がそろった月に起こる(conditional)。
// 事件の一覧から条件を確かめ、そろっていれば選んで発動できる。軍団は進軍してから戦う(瞬間移動しない)。
import { persons, scenario } from "../data";
import type { Campaign } from "./Campaign";
import { alive, factionOfPersons, H, hanOf, jinOf, live, name, owner, P, pick, pw, roll, type Ctx, type HistEventDef } from "./history";

const SC = ["s304v"];
const XIANGYANG = { name: "襄陽", lon: 112.14, lat: 32.04 };
const LUOYANG = { name: "洛陽", lon: 112.6, lat: 34.72 };
const CHANGAN = { name: "長安", lon: 108.87, lat: 34.31 };
/** 漢の旗の色(炎漢:朱と金) */
export const HAN_COLOR = "#b3201b";

/** 劉皓の国(楚。即位すれば漢) */
export const haoOf = (c: Campaign): string | undefined => factionOfPersons(c, ["vh_liu_hao"], true) ?? pick(c, "chu");
const cities = (c: Campaign, f: string) => c.cities.filter((k) => k.kind !== "pass" && scenario.cityOwners[k.id] === f);
const prestige = (c: Campaign, f: string): number => c.loyalty.prestige(f);
const fame = (c: Campaign, id: string): number => c.loyalty.fame[id] ?? 0;
const troopsOf = (c: Campaign, f: string): number => c.armies.filter((s) => s.army.factionId === f).reduce((n, s) => n + s.army.troops.infantry + s.army.troops.cavalry + s.army.troops.archer, 0);
const gold = (c: Campaign, f: string, d: number): void => {
  const s = c.factionStates[f];
  if (s) s.gold = Math.max(0, s.gold + d);
};
/** 中国本土の都市(西域・朝鮮半島・吐谷渾の地を除く):天下統一の目安 */
const CORE_EXCLUDE = new Set(["wandu", "pyongyang", "hanseong", "geumseong", "tuyuhunting"]);
const coreCities = (c: Campaign) => c.cities.filter((k) => k.kind !== "pass" && k.lon >= 96 && !CORE_EXCLUDE.has(k.id));
const march = (c: Campaign, f: string, to: { lon: number; lat: number }, n = 2): number => {
  let k = 0;
  for (const s of c.armies.filter((x) => x.army.factionId === f && x.status !== "fighting").sort((a, b) => Math.hypot(a.army.lon - to.lon, a.army.lat - to.lat) - Math.hypot(b.army.lon - to.lon, b.army.lat - to.lat)).slice(0, n)) {
    const r = c.planRoute(s.army.id, to);
    if (r) { c.orderMove(s.army.id, r); k++; }
  }
  return k;
};
const ok = (cond: boolean, why: string): true | string => (cond ? true : why);

/**
 * 西晋が続いているか:西晋の朝廷(勢力 jin)が滅びておらず、その君主が司馬氏であること。
 * 年は決めない(316年に限らない)。滅亡・皇統の断絶(司馬氏でない君主)・禅譲のどれでも「滅びた」とみなす
 */
export function westJinAlive(c: Campaign): boolean {
  const g = scenario.factions.find((y) => y.id === "jin");
  if (!g || g.fallen || !live(c, "jin")) return false;
  const r = c.rulerOf("jin");
  return !!r && r.name.startsWith("司馬");
}
/** 西晋の滅び方(記録用) */
export function westJinEnd(c: Campaign): string {
  const g = scenario.factions.find((y) => y.id === "jin");
  if (!g || g.fallen || !live(c, "jin")) return "西晋の朝廷が滅びた";
  return "司馬氏の皇統が絶えた";
}
/** 宣帝の血統の君主(劉皓とその子孫) */
const lineRuler = (c: Campaign, f: string | undefined) => {
  const r = f ? c.rulerOf(f) : undefined;
  return r && r.bloodline === "xuandi" ? r : undefined;
};

const base = { year: 304, month: 10, scenarios: SC, conditional: true, virtual: true, sources: ["仮想シナリオ(ゲームの創作)"] };

export const VIRTUAL_EVENTS: HistEventDef[] = [
  // ===== 1. 劉氏三代の集結 =====
  {
    ...base, id: "vh_sandai", name: "劉氏三代の集結", importance: "major", place: XIANGYANG,
    persons: ["vh_liu_hao", "vh_liu_hao_f", "vh_liu_xiong"],
    background: "曹魏の司空だった祖父 劉雄、西晋の尚書令だった父 劉浩、そして若き劉皓。三代が襄陽にそろい、天下の大計を語り合う。",
    history: "(仮想)楚思王 劉衍の末裔と伝えられる劉氏の三代が、漢室の再興を誓う。",
    cond: "劉皓・劉浩・劉雄の3人が生きていて、劉皓の国にいる",
    roles: (x) => ({ f: haoOf(x.c) }),
    ready: (x, r) => ok(!!r.f && ["vh_liu_hao", "vh_liu_hao_f", "vh_liu_xiong"].every((id) => alive(x.c, id) && P(id)!.factionId === r.f), "劉氏三代のうち、亡くなった・ほかの国にいる人がいる"),
    choices: {
      f: [
        { id: "oath", label: "三代で漢室再興の大計を定める", kind: "historic", desc: "祖父の経験、父の政、劉皓の武を合わせる。", preview: "劉皓の名声+10、国の安定+10、家臣の忠誠+5" },
        { id: "split", label: "劉雄に軍の相談役を、劉浩に政務を委ねる", kind: "alt", desc: "役目を分けて国を固める。", preview: "劉浩を丞相、劉雄を太傅に。金+5,000、国の安定+5" },
        { id: "rise", label: "祖父の遺訓を胸に、急ぎ兵を挙げる", kind: "bold", desc: "時を逃さない。", preview: "楚の全軍の士気+10、疲れ-10" },
      ],
    },
    apply: (x, r, p) => {
      const c = x.c, f = r.f!;
      H(x).flag("vh_sandai", "1");
      if (p.f === "oath") {
        c.loyalty.addFame("vh_liu_hao", 10);
        c.court.addStability(f, 10);
        H(x).loyaltyAll(f, 5, "三代の誓い");
        return "劉氏三代は漢室再興を誓った";
      }
      if (p.f === "split") {
        appointTo(c, f, "vh_liu_hao_f", "chengxiang");
        P("vh_liu_xiong")!.title = "太傅";
        gold(c, f, 5000);
        c.court.addStability(f, 5);
        return "劉浩が丞相、劉雄が太傅となり、国の形が整った";
      }
      for (const s of c.armies.filter((a) => a.army.factionId === f)) {
        s.army.morale = Math.min(100, s.army.morale + 10);
        s.army.fatigue = Math.max(0, s.army.fatigue - 10);
      }
      return "楚の全軍は意気盛んとなった";
    },
  },

  // ===== 2. 楚王の挙兵 =====
  {
    ...base, id: "vh_chuwang", name: "楚王の挙兵", importance: "major", place: XIANGYANG,
    persons: ["vh_liu_hao", "vh_han_xuance", "vh_huo_lie"],
    background: "荊州を押さえた劉皓は、天下に向けて兵を挙げるときを迎えた。北の洛陽、東の江南、どちらへ向かうか。",
    history: "(仮想)楚王 劉皓が檄文を天下に飛ばし、晋の諸王の争いを討つ兵を挙げる。",
    cond: "劉氏三代の集結のあと、劉皓が楚の君主で、軍団を3つ以上・兵5万以上持つ",
    roles: (x) => ({ f: haoOf(x.c) }),
    ready: (x, r) => {
      if (!r.f) return "劉皓の国がない";
      if (!H(x).flag("vh_sandai")) return "劉氏三代の集結が、まだ起きていない";
      const n = x.c.armies.filter((s) => s.army.factionId === r.f).length;
      return ok(n >= 3 && troopsOf(x.c, r.f) >= 50000, `軍団が足りない(${n}軍団・${Math.round(troopsOf(x.c, r.f) / 1000)}千人。3軍団・5万人以上が必要)`);
    },
    choices: {
      f: [
        { id: "north", label: "北上して洛陽を目指す", kind: "historic", desc: "漢の旧都を取り戻す。", preview: "晋と戦争。楚の主力2軍団が洛陽へ向かう(進軍)。戦略AIが洛陽・長安を重く見る" },
        { id: "east", label: "荊州を固め、江南を先に取る", kind: "alt", desc: "長江を押さえて国力を蓄える。", preview: "楚の主力が武昌の東へ向かう。金+10,000" },
        { id: "decree", label: "檄文を天下に飛ばし、諸侯を味方につける", kind: "bold", desc: "戦わずに勢いを得る。", preview: "晋と戦争中のすべての国と友好度+20。劉皓の名声+8" },
      ],
    },
    apply: (x, r, p) => {
      const c = x.c, f = r.f!;
      H(x).flag("vh_chuwang", p.f);
      const jin = jinOf(c);
      if (p.f === "north") {
        if (jin && jin !== f && !c.atWar(f, jin)) c.setRelation(f, jin, "war");
        H(x).flag("han_target", "luoyang");
        const n = march(c, f, LUOYANG, 2);
        return `楚王 劉皓が兵を挙げ、${n}軍団が洛陽へ向かった`;
      }
      if (p.f === "east") {
        gold(c, f, 10000);
        march(c, f, { lon: 116.0, lat: 30.0 }, 1);
        return "楚は荊州を固め、江南へ目を向けた";
      }
      for (const g of scenario.factions) if (g.id !== f && !g.fallen && jin && c.atWar(g.id, jin)) c.diplo.addAmity(f, g.id, 20);
      c.loyalty.addFame("vh_liu_hao", 8);
      return "劉皓の檄文が天下に伝わった";
    },
  },

  // ===== 3. 天下英傑の集結 =====
  {
    ...base, id: "vh_yingjie", name: "天下英傑の集結", importance: "major", place: XIANGYANG,
    persons: ["vh_liu_hao", "vh_xun_jingming"],
    background: "楚王の名は天下に広まった。各地の英傑が、劉皓のもとへ集まろうとしている。",
    history: "(仮想)劉皓の徳を慕って、諸国の才ある者が襄陽に集まる。",
    cond: "楚王の挙兵のあと、劉皓の国が8都市以上か、劉皓の名声90以上かつ国の威信50以上",
    roles: (x) => ({ f: haoOf(x.c) }),
    ready: (x, r) => {
      if (!r.f) return "劉皓の国がない";
      if (!H(x).flag("vh_chuwang")) return "楚王の挙兵が、まだ起きていない";
      const n = cities(x.c, r.f).length;
      return ok(n >= 8 || (fame(x.c, "vh_liu_hao") >= 90 && prestige(x.c, r.f) >= 50), `都市${n}(8以上が必要)・名声${Math.round(fame(x.c, "vh_liu_hao"))}・威信${Math.round(prestige(x.c, r.f))}`);
    },
    choices: {
      f: [
        { id: "welcome", label: "門を開いて英傑を迎える", kind: "historic", desc: "身分を問わず才ある者を用いる。", preview: "ほかの国で忠誠50未満の、君主・王族でない人物から、能力の高い順に3人まで加わる" },
        { id: "school", label: "学舎を建て、人を育てる", kind: "alt", desc: "長い目で人材を養う。", preview: "金-20,000。国の安定+10、家臣の忠誠+5" },
        { id: "poach", label: "敵国の名将を引き抜く", kind: "bold", desc: "大金と高位で誘う。", preview: "金-30,000。戦争中の国の、忠誠70未満の名将1人が半分の見込みで加わる" },
      ],
    },
    apply: (x, r, p) => {
      const c = x.c, f = r.f!;
      const score = (q: typeof persons[number]) => q.leadership + q.war + q.intelligence + q.politics + q.charisma;
      const cand = (maxLoy: number, war: boolean) => persons.filter((q) => q.factionId !== f && q.role !== "ruler" && c.personStatus(q.id) === "active" && !c.spoils.custodyOf(q.id) && (c.loyalty.loyalty[q.id] ?? 100) < maxLoy && !/王|公主|太子|皇/.test(q.title ?? "") && (!war || c.atWar(f, q.factionId)) && (!q.born || c.calendar().year - q.born >= 16)).sort((a, b) => score(b) - score(a));
      if (p.f === "welcome") {
        const list = cand(50, false).slice(0, 3);
        for (const q of list) { c.spoils.setFaction(q.id, f); c.loyalty.rebase(q.id, "楚王のもとへ集まる"); }
        return list.length ? `${list.map((q) => q.name).join("・")}が劉皓のもとへ集まった` : "集まる英傑はいなかった";
      }
      if (p.f === "school") {
        gold(c, f, -20000);
        c.court.addStability(f, 10);
        H(x).loyaltyAll(f, 5, "学舎");
        return "襄陽に学舎が建った";
      }
      gold(c, f, -30000);
      const t = cand(70, true)[0];
      if (t && roll(x, "vh_poach") < 0.5) { c.defect(t.id, f, "楚王の招きに応じて"); return `${t.name}が楚に寝返った`; }
      return "引き抜きは失敗した";
    },
  },

  // ===== 4. 二つの漢 =====
  {
    ...base, id: "vh_twohan", name: "二つの漢", importance: "major", place: { name: "平陽", lon: 111.52, lat: 36.08 },
    persons: ["vh_liu_hao", "liu_yuan"],
    background: "匈奴の劉淵も漢の名を掲げている。漢の正統は、劉氏の血を引く劉皓か、劉淵か。",
    history: "(仮想)二人の「漢」が並び立ち、天下の目がその行方に集まる。",
    cond: "劉皓の国があり、劉淵の漢(またはその後継)があり、どちらかの都市が互いに700km以内",
    roles: (x) => ({ f: haoOf(x.c), han: hanOf(x.c) }),
    ready: (x, r) => {
      if (!r.f || !r.han) return "劉淵の漢、または劉皓の国がない";
      if (r.f === r.han) return "同じ国";
      const near = cities(x.c, r.f).some((a) => cities(x.c, r.han!).some((b) => Math.hypot((a.lon - b.lon) * 92, (a.lat - b.lat) * 111) < 700));
      return ok(near, "両国の都市が遠い(700km以内に無い)");
    },
    choices: {
      f: [
        { id: "war", label: "漢を名乗る者を討つ", kind: "historic", desc: "漢の正統は一つ。", preview: "劉淵の漢と戦争。劉皓の名声+5。戦略AIが漢の都市を重く見る" },
        { id: "ally", label: "劉淵と和を結び、晋を挟み撃つ", kind: "alt", desc: "まずは共通の敵を倒す。", preview: "劉淵の漢と同盟(友好度+30)" },
        { id: "submit", label: "劉淵に臣従を迫る", kind: "bold", desc: "国力の差を見せつける。", preview: "国力が2倍以上なら漢は従属。そうでなければ戦争" },
      ],
      han: [
        { id: "resist", label: "楚を僭称者として退ける", kind: "historic", desc: "劉淵は漢の皇帝を称している。", preview: "楚との関係が悪くなる(友好度-20)" },
        { id: "talk", label: "楚と使者を交わす", kind: "alt", desc: "晋を先に倒す。", preview: "楚との友好度+10" },
        { id: "yield", label: "楚に従う", kind: "bold", desc: "劉皓の徳に服する。", preview: "楚に従属する" },
      ],
    },
    apply: (x, r, p) => {
      const c = x.c, f = r.f!, han = r.han!;
      if (p.han === "yield" || (p.f === "submit" && pw(x, f) > pw(x, han) * 2)) {
        c.setRelation(han, f, "vassal");
        c.diplo.overlord[han] = f;
        return `${name(han)}は${name(f)}に従った`;
      }
      if (p.han === "talk") c.diplo.addAmity(f, han, 10);
      if (p.han === "resist") c.diplo.addAmity(f, han, -20);
      if (p.f === "ally" && p.han !== "resist") {
        c.setRelation(f, han, "alliance");
        c.diplo.addAmity(f, han, 30);
        return "二つの漢は手を結んだ";
      }
      if (!c.atWar(f, han)) c.setRelation(f, han, "war");
      c.loyalty.addFame("vh_liu_hao", 5);
      H(x).flag("han_rival", han);
      return "二つの漢は相争うことになった";
    },
  },

  // ===== 5. 洛陽奪還 =====
  {
    ...base, id: "vh_luoyang", name: "洛陽奪還(漢の旧都)", importance: "critical", place: LUOYANG,
    persons: ["vh_liu_hao", "vh_wei_tian"],
    background: "後漢の都であった洛陽を、劉皓の軍が実際に得た。",
    history: "(仮想)劉氏が百年ぶりに漢の旧都を取り戻す。",
    cond: "劉皓の国が、攻城戦などで実際に洛陽を得ている",
    roles: (x) => ({ f: haoOf(x.c) }),
    ready: (_x, r) => ok(!!r.f && owner("luoyang") === r.f, `洛陽はまだ${name(owner("luoyang"))}のもの`),
    choices: {
      f: [
        { id: "shrine", label: "漢の宗廟を祀り、民を慰撫する", kind: "historic", desc: "天下に漢の再興を告げる。", preview: "劉皓の名声+12、国の安定+10、全軍の士気+10、洛陽の治安+20" },
        { id: "capital", label: "洛陽に都を移す", kind: "alt", desc: "天下の中心に立つ。", preview: "首都を洛陽に移す。国の安定-5、名声+8" },
        { id: "west", label: "間をおかず長安へ進む", kind: "bold", desc: "勢いのまま関中へ。", preview: "洛陽の近くの2軍団が長安へ向かう(進軍)" },
      ],
    },
    apply: (x, r, p) => {
      const c = x.c, f = r.f!;
      H(x).flag("han_target", "changan");
      if (p.f === "shrine") {
        c.loyalty.addFame("vh_liu_hao", 12);
        c.court.addStability(f, 10);
        for (const s of c.armies) if (s.army.factionId === f) s.army.morale = Math.min(100, s.army.morale + 10);
        const k = c.cities.find((y) => y.id === "luoyang")!;
        c.cityStates.luoyang = { ...c.cityState(k), order: Math.min(100, (c.cityState(k).order ?? 60) + 20) };
        return "劉皓は洛陽で漢の宗廟を祀った";
      }
      if (p.f === "capital") {
        c.moveCapital(f, "luoyang", "漢の旧都 洛陽に都を移す");
        c.court.addStability(f, -5);
        c.loyalty.addFame("vh_liu_hao", 8);
        return "楚は洛陽に都を移した";
      }
      return `${march(c, f, CHANGAN, 2)}軍団が長安へ向かった`;
    },
  },

  // ===== 6. 長安入城 =====
  {
    ...base, id: "vh_changan", name: "長安入城(前漢の都)", importance: "critical", place: CHANGAN,
    persons: ["vh_liu_hao", "vh_ma_xuan"],
    background: "高祖 劉邦が都を置いた長安に、劉皓の軍が入った。",
    history: "(仮想)前漢の都に、劉氏の旗が再び翻る。",
    cond: "劉皓の国が、実際に長安を得ている",
    roles: (x) => ({ f: haoOf(x.c) }),
    ready: (_x, r) => ok(!!r.f && owner("changan") === r.f, `長安はまだ${name(owner("changan"))}のもの`),
    choices: {
      f: [
        { id: "enter", label: "高祖の廟に詣で、関中の父老と約す", kind: "historic", desc: "法を簡素にし、民を安んじる。", preview: "劉皓の名声+10、関中の都市の治安+15、国の安定+8" },
        { id: "fort", label: "潼関と長安の守りを固める", kind: "alt", desc: "西と北の敵に備える。", preview: "長安の守備兵+8,000(金-15,000)" },
        { id: "liang", label: "涼州へ使者を送り、西方を従える", kind: "bold", desc: "河西の張氏を味方に。", preview: "涼州(張軌)との友好度+30。国力の差が大きければ従属" },
      ],
    },
    apply: (x, r, p) => {
      const c = x.c, f = r.f!;
      if (p.f === "enter") {
        c.loyalty.addFame("vh_liu_hao", 10);
        c.court.addStability(f, 8);
        for (const id of ["changan", "fengyi", "chencang", "anding"]) {
          const k = c.cities.find((y) => y.id === id);
          if (k && owner(id) === f) c.cityStates[id] = { ...c.cityState(k), order: Math.min(100, (c.cityState(k).order ?? 60) + 15) };
        }
        return "劉皓は長安で高祖の廟に詣でた";
      }
      if (p.f === "fort") {
        gold(c, f, -15000);
        const k = c.cities.find((y) => y.id === "changan")!;
        c.cityStates.changan = { ...c.cityState(k), garrison: c.cityState(k).garrison + 8000 };
        return "長安の守りが固まった";
      }
      const l = pick(c, "qianliang") ?? factionOfPersons(c, ["zhang_gui", "zhang_shi"], true);
      if (!l) return "涼州に使者を送る相手がいなかった";
      if (pw(x, f) > pw(x, l) * 4) { c.setRelation(l, f, "vassal"); c.diplo.overlord[l] = f; return `${name(l)}は楚に従った`; }
      c.diplo.addAmity(f, l, 30);
      return `${name(l)}と誼を結んだ`;
    },
  },

  // ===== 7a. 漢室再興の詔(西晋の滅亡) =====
  {
    ...base, id: "vh_edict", name: "漢室再興の詔", importance: "critical", place: XIANGYANG,
    persons: ["vh_liu_hao", "vh_xun_jingming"],
    background: "司馬氏の晋は滅びた。中原には主がなく、四方の群雄が天命を争っている。",
    history: "(仮想)楚王は、漢の皇統を継ぐ者として、漢室の再興を天下に告げる。",
    cond: "西晋が実際に滅びている(朝廷の滅亡・皇統の断絶・禅譲のどれか。年は問わない)。宣帝の血統の君主が楚を治めている",
    roles: (x) => ({ f: haoOf(x.c) }),
    done: (x) => !!H(x).flag("vh_edict"),
    ready: (x, r) => {
      if (!r.f) return "劉皓の国がない";
      if (westJinAlive(x.c)) return "西晋がまだ続いている(司馬氏の朝廷がある)";
      return ok(!!lineRuler(x.c, r.f), "宣帝の血統(劉氏)の君主がいない");
    },
    choices: {
      f: [
        { id: "proclaim", label: "漢室の再興を天下に告げる", kind: "historic", desc: "晋は滅び、漢の皇統がここにあると示す。", preview: "国の安定+5・君主の名声+10。群臣が即位を勧める(次の事件)" },
        { id: "mourn", label: "晋の遺民を慰め、民心を集める", kind: "alt", desc: "先に民を安んじる。", preview: "すべての都市の治安+10。群臣が即位を勧める(次の事件)" },
        { id: "summon", label: "晋の遺臣を招く", kind: "bold", desc: "晋の人材を漢に迎える。", preview: "家臣の忠誠+5・金-10,000。群臣が即位を勧める(次の事件)" },
      ],
    },
    apply: (x, r, p) => {
      const c = x.c, f = r.f!;
      const why = westJinEnd(c);
      H(x).flag("vh_edict", String(c.court.year()));
      H(x).flag("vh_jin_end", why);
      const rl = lineRuler(c, f);
      if (p.f === "mourn") {
        for (const k of cities(c, f)) c.cityStates[k.id] = { ...c.cityState(k), order: Math.min(100, (c.cityState(k).order ?? 60) + 10) };
      } else if (p.f === "summon") {
        H(x).loyaltyAll(f, 5, "晋の遺臣を招く");
        gold(c, f, -10000);
      } else {
        c.court.addStability(f, 5);
        if (rl) c.loyalty.addFame(rl.id, 10);
      }
      c.addNews(`【仮想の歴史】${why}。${name(f)}の${rl?.name ?? "君主"}が漢室再興の詔を発しました`);
      return `${why}。${rl?.name ?? "君主"}は漢室の再興を天下に告げた`;
    },
  },

  // ===== 7b. 漢皇帝即位(群臣の推戴) =====
  {
    ...base, id: "vh_emperor", name: "漢皇帝即位", importance: "critical", place: XIANGYANG,
    persons: ["vh_liu_hao", "vh_liu_hao_f", "vh_xun_jingming"],
    background: "西晋が滅び、漢室再興の詔が下った。群臣は楚王に、漢の皇帝への即位を勧める。",
    history: "(仮想)楚王が漢の皇帝に即位し、国号を楚から漢に改める。元号は建武。",
    cond: "「漢室再興の詔」のあと、宣帝の血統の君主(劉皓など)が、まだ皇帝でない",
    roles: (x) => ({ f: haoOf(x.c) }),
    done: (x) => x.c.court.rankOf(haoOf(x.c) ?? "") === "emperor" && /漢/.test(name(haoOf(x.c))),
    rearm: (picks) => picks.f === "wait",
    ready: (x, r) => {
      if (!r.f) return "劉皓の国がない";
      const c = x.c;
      if (westJinAlive(c)) return "西晋がまだ続いている(西晋がある間は、漢の皇帝に即位できない)";
      if (!H(x).flag("vh_edict")) return "「漢室再興の詔」が、まだ出ていない";
      if (!lineRuler(c, r.f)) return "宣帝の血統(劉氏)の君主が国を治めていない";
      return ok(c.court.rankOf(r.f) !== "emperor", "すでに皇帝の位にある");
    },
    // AI:国力(都市・安定)を見て決める。ふつうは即位を受ける
    ai: (x, r) => {
      const f = r.f;
      if (!f) return "crown";
      const n = cities(x.c, f).length;
      return n >= 3 && x.c.court.stability[f] !== undefined && x.c.court.stability[f] < 15 ? "wait" : n >= 3 ? "crown" : "wait";
    },
    choices: {
      f: [
        { id: "crown", label: "推戴を受け、漢の皇帝に即位する", kind: "historic", desc: "国号を漢と改め、元号を建武とする。", preview: "国号「漢」・旗・皇帝の位・官職・皇室を改め、皇太子を立てる。人物・軍団・領土・財政・家系はそのまま。皇帝生活が開ける" },
        { id: "wait", label: "即位を延期する", kind: "alt", desc: "まだ天下は定まっていない。", preview: "国の安定+5。1年たてば、また即位を選べる" },
      ],
    },
    apply: (x, r, p) => {
      const c = x.c, f = r.f!;
      if (p.f === "wait") {
        c.court.addStability(f, 5);
        return "楚王は即位を延期した(1年たてば、また即位を選べる)";
      }
      return crownHan(x, f, false);
    },
  },

  // ===== 8. 天下統一 =====
  {
    ...base, id: "vh_unify", name: "天下統一", importance: "critical", place: LUOYANG,
    persons: ["vh_liu_hao"],
    background: "中国本土の大半が劉皓の旗のもとに入った。",
    history: "(仮想)八王の乱から続いた乱世が、劉皓によって終わる。",
    cond: "劉皓の国が、中国本土の都市の8割以上を持つ",
    roles: (x) => ({ f: haoOf(x.c) }),
    ready: (x, r) => {
      if (!r.f) return "劉皓の国がない";
      const core = coreCities(x.c);
      const mine = core.filter((k) => scenario.cityOwners[k.id] === r.f).length;
      return ok(mine >= core.length * 0.8, `中国本土の都市 ${mine}/${core.length}(8割以上が必要)`);
    },
    choices: {
      f: [
        { id: "amnesty", label: "天下に大赦し、税を軽くする", kind: "historic", desc: "乱世で疲れた民を休ませる。", preview: "国の安定+20、すべての都市の治安+15、金の収入は1年のあいだ少し減る(金-20,000)" },
        { id: "law", label: "律令を整え、官を正す", kind: "alt", desc: "長く続く国の基を作る。", preview: "国の安定+15、家臣の忠誠+10" },
        { id: "beyond", label: "さらに塞外へ兵を進める", kind: "bold", desc: "四夷を服させる。", preview: "劉皓の名声+10。戦略AIが西域・遼東を目標にする" },
      ],
    },
    apply: (x, r, p) => {
      const c = x.c, f = r.f!;
      H(x).flag("vh_unified", f);
      c.addNews(`【仮想の歴史】${name(f)}の劉皓が天下を統一しました`);
      if (p.f === "amnesty") {
        c.court.addStability(f, 20);
        gold(c, f, -20000);
        for (const k of cities(c, f)) c.cityStates[k.id] = { ...c.cityState(k), order: Math.min(100, (c.cityState(k).order ?? 60) + 15) };
        return "天下に大赦が下された";
      }
      if (p.f === "law") {
        c.court.addStability(f, 15);
        H(x).loyaltyAll(f, 10, "律令の整備");
        return "律令が整えられた";
      }
      c.loyalty.addFame("vh_liu_hao", 10);
      H(x).flag("vh_beyond", "1");
      return "劉皓はさらに塞外を目指した";
    },
  },

  // ===== 9. 万国来朝 =====
  {
    ...base, id: "vh_wanguo", name: "万国来朝", importance: "major", place: LUOYANG,
    persons: ["vh_liu_hao", "vh_xie_xuanzhi"],
    background: "天下を統一した劉皓のもとへ、高句麗・百済・新羅や西域の国々から使者が訪れようとしている。",
    history: "(仮想)四方の国々が使者を送り、貢ぎ物を献じる。",
    cond: "天下統一のあと、劉皓の国と戦争していない外国(朝鮮半島・西域・吐谷渾など)が3国以上ある",
    roles: (x) => ({ f: haoOf(x.c) }),
    ready: (x, r) => {
      if (!r.f) return "劉皓の国がない";
      if (!H(x).flag("vh_unified")) return "天下統一が、まだ起きていない";
      const n = foreign(x.c, r.f).length;
      return ok(n >= 3, `使者を送れる外国が${n}国(3国以上が必要)`);
    },
    choices: {
      f: [
        { id: "tribute", label: "朝貢を受け、王に封じる", kind: "historic", desc: "冊封の秩序を作る。", preview: "外国はすべて従属(自治は保つ)。毎年の朝貢として金+10,000、劉皓の名声+10" },
        { id: "trade", label: "交易を開く", kind: "alt", desc: "互いに富む。", preview: "外国と友好度+30。金+20,000" },
        { id: "awe", label: "大軍を見せて威を示す", kind: "bold", desc: "二度と背かせない。", preview: "外国はすべて従属。友好度-10" },
      ],
    },
    apply: (x, r, p) => {
      const c = x.c, f = r.f!;
      const list = foreign(c, f);
      if (p.f === "trade") {
        for (const g of list) c.diplo.addAmity(f, g, 30);
        gold(c, f, 20000);
        return `${list.map((g) => name(g)).join("・")}と交易が開かれた`;
      }
      for (const g of list) {
        c.setRelation(g, f, "vassal");
        c.diplo.overlord[g] = f;
        if (p.f === "awe") c.diplo.addAmity(f, g, -10);
      }
      if (p.f === "tribute") { gold(c, f, 10000); c.loyalty.addFame("vh_liu_hao", 10); }
      return `${list.map((g) => name(g)).join("・")}が使者を送り、${name(f)}に従った(万国来朝)`;
    },
  },
];

/** 官職に任命する:定員がいっぱいなら、いまその官職にいる人を外してから任命する */
export function appointTo(c: Campaign, f: string, id: string, office: string): void {
  if (c.economy.officeOf(id)?.id === office) return;
  for (const q of persons) if (q.id !== id && q.factionId === f && c.economy.officeOf(q.id)?.id === office) c.economy.setOffice(q.id, null);
  c.economy.setOffice(id, office);
}

/** 外国(朝鮮半島・西域・吐谷渾など):中国本土の外の都市だけを持つ、戦争していない国 */
function foreign(c: Campaign, f: string): string[] {
  return scenario.factions.filter((g) => g.id !== f && !g.fallen && !g.passive && !c.atWar(f, g.id) && live(c, g.id) && cities(c, g.id).every((k) => k.lon < 96 || CORE_EXCLUDE.has(k.id))).map((g) => g.id);
}

/**
 * 漢の皇帝への即位:同じ勢力のまま、国号を楚から漢へ、旗の色・位(皇帝)・官職・皇室・外交を改める。
 * 人物・軍団・領土・財政・家系図は、勢力のIDが変わらないので、そのまま残る。皇帝生活2Dモードが開ける
 */
export function crownHan(x: Ctx, f: string, formal: boolean): string {
  const c = x.c;
  if (westJinAlive(c)) return "西晋が続いているため、即位できなかった";
  const ruler = lineRuler(c, f);
  if (!ruler || !alive(c, ruler.id) || ruler.factionId !== f) return "宣帝の血統の君主がいないため、即位できなかった";
  const isHao = ruler.id === "vh_liu_hao";
  c.renameState(f, "漢", HAN_COLOR);
  c.court.ranks[f] = "emperor";
  const fac = scenario.factions.find((y) => y.id === f)!;
  fac.title = "皇帝";
  fac.ruler = ruler.name;
  // 在位の記録(初代。元号は建武)。称号は「漢皇帝」
  const rec = c.court.startReign(f, ruler, true);
  // 皇室:父と祖父を尊ぶ(称号はセーブに残す)
  const fa = c.court.fatherOf(ruler.id);
  if (fa && alive(c, fa)) c.court.setTitle(fa, "太上皇");
  const gf = fa ? c.court.fatherOf(fa) : undefined;
  if (gf && alive(c, gf)) c.court.setTitle(gf, "太皇");
  const wife = c.court.primaryOf(ruler.id);
  if (wife && c.personStatus(wife.id) !== "dead") c.court.setTitle(wife.id, "皇后");
  // 皇太子:原則として劉承。いなければ継承順位の1位
  const cheng = P("vh_liu_cheng");
  if (cheng && alive(c, cheng.id) && cheng.factionId === f && cheng.id !== ruler.id) c.court.designateHeir(f, cheng.id);
  else if (!c.court.heirOf(f)) { const o = c.court.successionOrder(f)[0]; if (o) c.court.designateHeir(f, o.p.id); }
  const heir = c.court.heirOf(f);
  if (heir) c.court.setTitle(heir.id, "皇太子");
  rec.heir = heir?.name ?? null;
  rec.empress = wife?.name ?? null;
  // 官職(漢の官制:尚書令・大将軍・司徒)
  for (const [id, office] of [["vh_xun_jingming", "shangshuling"], ["vh_han_xuance", "dajiangjun"], ["vh_pei_xuan", "situ"]] as const) if (alive(c, id) && P(id)!.factionId === f) appointTo(c, f, id, office);
  // 外交:ほかの皇帝の国(劉淵の漢・東晋など)は認めない。従う国・同盟国は祝う
  for (const g of scenario.factions) {
    if (g.id === f || g.fallen || g.passive) continue;
    if (c.court.rankOf(g.id) === "emperor") c.diplo.addAmity(f, g.id, -20);
    else if (["alliance", "vassal"].includes(c.relationOf(f, g.id))) c.diplo.addAmity(f, g.id, 15);
  }
  c.court.addStability(f, formal ? 10 : 5);
  c.loyalty.addFame(ruler.id, 15);
  H(x).flag("vh_han", f);
  H(x).log("crown", `${ruler.name}が漢の皇帝に即位し、国号を楚から漢に改めた(元号 ${rec.era})`);
  c.addNews(`【仮想の歴史】${ruler.name}が漢皇帝に即位し、国号を「漢」、元号を「${rec.era}」と改めました。${heir ? `皇太子は${heir.name}。` : ""}皇帝生活の画面に入れます`);
  return `${ruler.name}${isHao ? "" : "(劉皓の子孫)"}が漢皇帝に即位した。国号は漢、元号は${rec.era}。${heir ? `皇太子は${heir.name}。` : ""}旗・官職・皇室・外交を改めた(人物・軍団・領土・財政・家系はそのまま)`;
}
