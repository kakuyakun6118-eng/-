// 劉裕の北伐と劉宋の建国(404〜420年)の歴史の事件(13件)。
// どの事件も、ゲームの中の実際の情勢(人物の生死・国の有無・軍団の位置)を確かめてから起こる。条件がそろわなければ「歴史の分岐」になり、
// 史実重視のモードでも、無理に史実へ戻さない。会戦・攻城戦は、軍団が戦場まで進軍してから始まる(事件による瞬間移動はしない)。
import { persons, scenario } from "../data";
import type { ArmyState, Campaign } from "./Campaign";
import { distanceKm } from "./pathfinding";
import { absent, alive, factionOfPersons, H, jinOf, name, owner, P, pick, pw, roll, type Ctx, type HistEventDef } from "./history";

type R = Record<string, string | undefined>;
type Place = { name: string; lon: number; lat: number };

// ---------------- 場所(史料の地名。座標は地図の上の目安) ----------------
const JINGKOU: Place = { name: "京口", lon: 119.45, lat: 32.2 };
const JIANKANG: Place = { name: "建康", lon: 118.8, lat: 32.05 };
const LINQU: Place = { name: "臨朐", lon: 118.55, lat: 36.45 };
const GUANGGU: Place = { name: "広固", lon: 118.5, lat: 36.7 };
const PANYU: Place = { name: "番禺", lon: 113.3, lat: 23.1 };
const LUOYANG: Place = { name: "洛陽", lon: 112.6, lat: 34.72 };
const QUEYUE: Place = { name: "黄河北岸(畔城の付近・推定)", lon: 115.4, lat: 35.75 };
const CHANGAN: Place = { name: "長安", lon: 108.87, lat: 34.31 };

// ---------------- 役の見つけ方 ----------------
/** 劉裕がいる国(生きていて、捕らわれていないとき) */
export const liuYuOf = (c: Campaign): string | undefined => factionOfPersons(c, ["liu_yu_song"]);
/** 南燕(慕容超・慕容徳の国、または開始時の南燕) */
const yanOf = (c: Campaign): string | undefined => factionOfPersons(c, ["murong_chao", "murong_de"], true) ?? pick(c, "nanyan");
/** 後秦(姚興・姚泓の国、または開始時の後秦) */
const houqinOf = (c: Campaign): string | undefined => factionOfPersons(c, ["yao_hong", "yao_xing"], true) ?? pick(c, "houqin");
/** 北魏(拓跋珪・拓跋嗣の国、または開始時の北魏) */
const weiOf = (c: Campaign): string | undefined => factionOfPersons(c, ["tuoba_si", "tuoba_gui"], true) ?? pick(c, "beiwei");
/** 夏(赫連勃勃の国、または開始時の夏) */
const xiaOf = (c: Campaign): string | undefined => factionOfPersons(c, ["helian_bobo"], true) ?? pick(c, "xia");
/** 晋の皇帝(司馬徳宗・司馬徳文)がいる国 */
const jinThroneOf = (c: Campaign): string | undefined => factionOfPersons(c, ["sima_dezong", "sima_dewen"], true) ?? jinOf(c);

const inF = (c: Campaign, id: string, f: string | undefined): boolean => !!f && alive(c, id) && P(id)!.factionId === f;
const cityOf = (c: Campaign, id: string) => c.cities.find((k) => k.id === id);
const gold = (c: Campaign, f: string, d: number): void => {
  const p = c.factionStates[f];
  if (p) p.gold = Math.max(0, p.gold + d);
};
const addGarrison = (c: Campaign, id: string, n: number): void => {
  const k = cityOf(c, id);
  if (!k) return;
  const st = c.cityState(k);
  c.cityStates[id] = { ...st, garrison: Math.max(500, st.garrison + n) };
};
const troopsOf = (s: ArmyState): number => s.army.troops.infantry + s.army.troops.cavalry + s.army.troops.archer;
/** 劉裕の率いる軍団(なければ、その国でいちばん大きい軍団) */
const liuArmy = (x: Ctx, f: string): ArmyState | undefined => x.c.armies.find((s) => s.army.commanderId === "liu_yu_song" && s.army.factionId === f) ?? H(x).largestArmy(f);
/** f の軍団のうち、場所から km 以内でいちばん大きいもの */
const nearArmy = (x: Ctx, f: string | undefined, pl: Place, km: number): ArmyState | undefined => (f ? H(x).largestArmy(f, pl, km) : undefined);
/** 進軍の命令(道があるときだけ。瞬間移動はしない) */
const march = (x: Ctx, s: ArmyState | undefined, to: { lon: number; lat: number }): boolean => {
  if (!s || s.status === "fighting") return false;
  const route = x.c.planRoute(s.army.id, to);
  if (!route) return false;
  x.c.orderMove(s.army.id, route);
  s.targetCityId = null;
  return true;
};
/** 都市の近くにいる f の軍団の数 */
const armiesNear = (x: Ctx, f: string, pl: Place, km: number): ArmyState[] => x.c.armies.filter((s) => s.army.factionId === f && distanceKm(s.army, pl) <= km);
const ruler = (c: Campaign, f: string | undefined) => (f ? c.rulerOf(f) : undefined);
const fameOf = (c: Campaign, id: string): number => c.loyalty.fame[id] ?? 0;
const playerRole = (x: Ctx, r: R): boolean => Object.values(r).includes(x.c.playerFactionId ?? "");

/** 劉宋の旗の色(東晋の青と分けるため、朱に近い色) */
export const SONG_COLOR = "#b8442f";

export const LIUYU_EVENTS: HistEventDef[] = [
  // ===== 1. 404年 劉裕の挙兵 =====
  {
    id: "liuyu404", name: "劉裕の挙兵(桓玄の打倒)", year: 404, month: 2, importance: "major", place: JINGKOU,
    persons: ["liu_yu_song", "huan_xuan2", "he_wuji", "liu_yi2", "meng_chang", "liu_daogui"],
    background: "403年末、桓玄が晋の安帝を廃して楚を建てた。北府軍の劉裕は桓玄に仕えながら、京口で同志の何無忌・劉毅・孟昶らと挙兵の機をうかがっている。",
    history: "404年2月、劉裕は京口で挙兵して桓玄の将を斬り、建康へ攻め上った。桓玄は敗れて江陵へ逃れ、のちに殺された。劉裕は安帝を迎えて晋を復興し、朝廷の実権を握った。",
    sources: ["『宋書』武帝紀上", "『晋書』桓玄伝", "『資治通鑑』巻113"],
    cond: "桓玄が帝位にあり(楚)、劉裕がその国にいる",
    roles: (x) => ({ liu: liuYuOf(x.c), chu: factionOfPersons(x.c, ["huan_xuan2"], true) }),
    ready: (x, r) => {
      if (!r.chu) return "桓玄は帝位についていない(楚が建っていない)";
      if (!r.liu) return absent(x.c, "liu_yu_song");
      if (r.liu !== r.chu) return `劉裕は${name(r.liu)}にいて、桓玄の配下ではない`;
      return true;
    },
    choices: {
      liu: [
        { id: "rise", label: "京口で挙兵し、桓玄を討って晋を復興する", kind: "historic", desc: "北府軍の同志と兵を挙げる。", preview: "劉裕が京口で自立し、桓玄の主力と建康で会戦(進軍してから)。勝てば建康を得て、安帝を迎えて晋を復興する" },
        { id: "wait", label: "桓玄に仕えて時を待つ", kind: "alt", desc: "まだ機は熟していない。", preview: "挙兵しない。劉裕の名声-5、忠誠+10。楚は続く" },
        { id: "self", label: "晋を復興せず、北府軍の国を建てる", kind: "bold", desc: "晋室を立てず、自ら主となる。", preview: "劉裕が京口で自立して楚と戦争(晋の復興はしない)。名声+5、安定-10" },
      ],
    },
    ai: (x, r) => {
      const strong = pw(x, r.chu) > 0 && (x.c.loyalty.loyalty.liu_yu_song ?? 60) < 70;
      return x.c.historyMode === "free" ? (roll(x, "liuyu404-ai") < 0.4 ? "self" : "rise") : strong || x.c.historyMode === "historic" ? "rise" : roll(x, "liuyu404-ai") < 0.3 ? "wait" : "rise";
    },
    apply: (x, r, p) => {
      const h = H(x);
      const chu = r.chu!;
      if (p.liu === "wait") {
        x.c.loyalty.addFame("liu_yu_song", -5);
        x.c.loyalty.add("liu_yu_song", 10, "桓玄に仕えて時を待つ");
        return "劉裕は挙兵を見送り、桓玄に仕え続けた";
      }
      const city = owner("jingkou") === chu ? "jingkou" : ["guangling", "jiankang", "wu"].find((k) => owner(k) === chu) ?? "jingkou";
      const nf = h.found("liu_yu_song", city, p.liu === "rise" ? "晋(義軍)" : "北府(劉裕)", "鎮軍将軍");
      if (!nf) return "劉裕は挙兵しようとしたが、拠る城と兵がなかった(歴史の分岐)";
      h.flag("liuyu404_rise", nf);
      for (const id of ["he_wuji", "liu_yi2", "meng_chang", "liu_daogui", "liu_daolian", "zhuge_changmin", "liu_muzhi", "tan_daoji", "wang_zhene"]) {
        const q = P(id);
        if (q && alive(x.c, id) && q.factionId === chu) x.c.spoils.setFaction(id, nf);
      }
      x.c.setRelation(nf, chu, "war");
      if (p.liu === "self") {
        x.c.loyalty.addFame("liu_yu_song", 5);
        x.c.court.addStability(nf, -10);
      }
      let ra = liuArmy(x, nf);
      if (!ra) {
        addGarrison(x.c, city, 6000);
        const made = x.c.raiseArmy(city, 6000, "liu_yu_song");
        ra = typeof made === "string" ? undefined : made;
      }
      const ca = h.largestArmy(chu, JIANKANG, 900);
      const res = ra && ca ? h.battle(ra, ca, JIANKANG, "liuyu404") : ra && owner("jiankang") === chu ? h.siege(ra, "jiankang", "liuyu404") : "";
      return `劉裕が京口で挙兵した。${res}`;
    },
    onBattle: (x, r, win) => {
      const nf = H(x).flag("liuyu404_rise");
      if (win !== "liu" || !nf) return "桓玄の軍が劉裕を退けた(史実との分岐)";
      const h = H(x);
      if (owner("jiankang") === r.chu) h.give("jiankang", nf);
      if (alive(x.c, "huan_xuan2")) h.capture("huan_xuan2", nf);
      x.c.loyalty.addFame("liu_yu_song", 15);
      // 晋の復興:安帝が生きていれば、劉裕の国に迎えて君主とする(劉裕は臣下として実権を握る)
      const di = P("sima_dezong");
      if (di && x.c.personStatus(di.id) !== "dead" && H(x).flag("liuyu404_rise") && !/北府/.test(name(nf))) {
        if (x.c.spoils.custodyOf(di.id)) x.c.spoils.release(di.id);
        x.c.spoils.setFaction(di.id, nf);
        const ru = x.c.rulerOf(nf);
        if (ru && ru.id !== di.id) x.c.replaceRuler(nf, ru, di);
        x.c.renameState(nf, "東晋");
        x.c.court.ranks[nf] = "emperor";
        return "劉裕が建康を取り戻し、安帝を迎えて晋を復興した。劉裕は朝廷の実権を握った";
      }
      return "劉裕が桓玄の軍を破った";
    },
  },

  // ===== 2. 409年 南燕討伐 =====
  {
    id: "nanyan409", name: "南燕討伐(劉裕の第一次北伐)", year: 409, month: 4, importance: "major", place: LINQU,
    persons: ["liu_yu_song", "murong_chao", "gongsun_wulou", "murong_zhen", "liu_muzhi"],
    background: "南燕の慕容超は、淮北を荒らして晋の民を連れ去った。劉裕は北伐を願い出たが、朝廷には南燕より盧循を恐れる声もある。",
    history: "409年4月、劉裕は水路で下邳に入り、大峴山を越えて南燕に攻め込んだ。慕容超は公孫五楼の「大峴を守り、野を焼き払う」策を退け、臨朐で迎え撃つことにした。",
    sources: ["『宋書』武帝紀上", "『晋書』慕容超載記", "『資治通鑑』巻115"],
    cond: "劉裕が生きていて晋(または自分の国)にあり、南燕があり、自国の都市が南燕から700km以内にある",
    battle: ["att", "def"],
    roles: (x) => ({ att: liuYuOf(x.c), def: yanOf(x.c) }),
    ready: (x, r) => {
      if (!r.att) return absent(x.c, "liu_yu_song");
      if (!r.def) return "南燕がない(すでに滅んだ・建っていない)";
      if (r.att === r.def) return "劉裕が南燕にいる";
      if (["alliance", "vassal"].includes(x.c.relationOf(r.att, r.def))) return "劉裕の国と南燕は同盟・従属の関係にある";
      const near = x.c.cities.some((k) => k.kind !== "pass" && owner(k.id) === r.att && distanceKm(k, GUANGGU) < 700);
      if (!near) return "劉裕の国の都市が南燕から遠すぎる(700km以内にない)";
      return true;
    },
    choices: {
      att: [
        { id: "go", label: "大峴山を越えて南燕へ攻め込む", kind: "historic", desc: "劉穆之に留守を任せ、劉裕が自ら率いる。", preview: "南燕と戦争。劉裕の軍団が臨朐へ向かう(着いてから臨朐の戦い)" },
        { id: "supply", label: "淮水・泗水の水運で兵糧を整えてから進む", kind: "alt", desc: "兵站を固める。", preview: "金800で劉裕の軍団の食糧+40・士気+5。そのあと臨朐へ向かう" },
        { id: "stop", label: "北伐を見送り、盧循に備える", kind: "bold", desc: "南の脅威を優先する。", preview: "北伐はしない。金+500、安定+5。南燕は続く" },
      ],
      def: [
        { id: "meet", label: "大峴を守らず、臨朐で鉄騎により迎え撃つ", kind: "historic", desc: "慕容超の決断。晋軍を平地に引き入れる。", preview: "臨朐で会戦(南燕の騎兵が力を出せる)。士気+5" },
        { id: "pass", label: "公孫五楼の策:大峴山の険を塞ぎ、野を焼き払う", kind: "alt", desc: "山の関所で足止めし、兵糧を断つ。", preview: "劉裕の軍団の食糧-25・士気-8(焦土)。広固の守備兵+3,000" },
        { id: "qin", label: "後秦に臣従して救援を求める", kind: "bold", desc: "姚興を頼る。", preview: "後秦と同盟。後秦が援軍を出せるか(夏との戦いしだい)" },
      ],
    },
    ai: (x, r, role) => {
      if (role === "def") return x.c.historyMode === "historic" ? "meet" : roll(x, "nanyan409-d") < 0.35 ? "pass" : roll(x, "nanyan409-d2") < 0.15 ? "qin" : "meet";
      const ratio = pw(x, r.att) / Math.max(1, pw(x, r.def));
      if (ratio < 1.2 && x.c.historyMode !== "historic") return "stop";
      return (x.c.factionStates[r.att!]?.gold ?? 0) > 3000 ? "supply" : "go";
    },
    apply: (x, r, p) => {
      const att = r.att!;
      const def = r.def!;
      if (p.att === "stop") {
        gold(x.c, att, 500);
        x.c.court.addStability(att, 5);
        return "劉裕は北伐を見送った(南燕は続く)";
      }
      if (!x.c.atWar(att, def)) x.c.setRelation(att, def, "war");
      const a = liuArmy(x, att);
      if (a && p.att === "supply") {
        gold(x.c, att, -800);
        a.army.food += 40;
        a.army.morale = Math.min(100, a.army.morale + 5);
      }
      H(x).flag("nanyan409_go", "1");
      let note = "";
      if (p.def === "pass") {
        if (a) {
          a.army.food = Math.max(5, a.army.food - 25);
          a.army.morale = Math.max(20, a.army.morale - 8);
        }
        if (owner("guanggu") === def) addGarrison(x.c, "guanggu", 3000);
        H(x).flag("nanyan409_pass", "1");
        note = "南燕は大峴山を塞ぎ、野を焼き払った。";
      } else if (p.def === "qin") {
        const q = houqinOf(x.c);
        if (q && q !== att) {
          x.c.setRelation(def, q, "alliance");
          const busy = xiaOf(x.c) && x.c.atWar(q, xiaOf(x.c)) && pw(x, xiaOf(x.c)) > pw(x, q) * 0.25;
          if (busy) note = "後秦は南燕と結んだが、夏との戦いで援軍を出せなかった。";
          else note = `後秦に救援を求めた(${x.c.diplo.dispatchAid(q, def, { lon: GUANGGU.lon, lat: GUANGGU.lat, name: "広固" }).text})。`;
        }
      } else {
        const da = H(x).largestArmy(def, GUANGGU, 400);
        if (da) da.army.morale = Math.min(100, da.army.morale + 5);
      }
      const moved = march(x, a, LINQU);
      return `${note}劉裕は南燕へ攻め込んだ${moved ? `(${a!.army.name}が臨朐へ向かう)` : "(進む道がなく、軍団は動けなかった)"}`;
    },
  },

  // ===== 3. 409年 臨朐の戦い =====
  {
    id: "linqu409", name: "臨朐の戦い(晋の歩兵 対 南燕の鉄騎)", year: 409, month: 6, importance: "critical", place: LINQU,
    persons: ["liu_yu_song", "murong_chao", "hu_fan", "duan_hui", "gongsun_wulou"],
    background: "大峴山を越えた晋軍は臨朐に迫った。南燕は鎧をまとった騎兵で平地の決戦を挑もうとしている。劉裕は戦車四千を左右に並べて騎兵を防ぐ陣を敷いた。",
    history: "409年6月、臨朐で両軍が激突した。戦いが決しないなか、劉裕は胡藩に命じて手薄な臨朐城を奇襲させ、城を落とした。南燕軍は崩れ、慕容超は広固へ逃げ込んだ。",
    sources: ["『宋書』武帝紀上・胡藩伝", "『資治通鑑』巻115"],
    cond: "南燕討伐で劉裕が出陣し、劉裕の軍団が臨朐から300km以内、南燕の野戦の軍団が残っている",
    battle: ["att", "def"],
    roles: (x) => ({ att: liuYuOf(x.c), def: yanOf(x.c) }),
    ready: (x, r) => {
      if (!H(x).flag("nanyan409_go")) return "南燕討伐の出陣がなかった";
      if (!r.att || !r.def) return !r.att ? absent(x.c, "liu_yu_song") : "南燕がない";
      if (!x.c.atWar(r.att, r.def)) return "劉裕の国と南燕は戦争をしていない";
      const a = liuArmy(x, r.att);
      if (!a || distanceKm(a.army, LINQU) > 300) return "劉裕の軍団が臨朐の近く(300km以内)にいない";
      if (!H(x).largestArmy(r.def)) return "南燕に野戦の軍団がない(広固に籠もっている)";
      return true;
    },
    choices: {
      att: [
        { id: "wagon", label: "戦車を並べて鉄騎を防ぎ、胡藩に臨朐城を奇襲させる", kind: "historic", desc: "車陣で歩兵を守り、敵の背後の城を突く。", preview: "会戦(劉裕の側に車陣と奇襲の補正。騎兵の突撃に強い)" },
        { id: "direct", label: "正面から決戦する", kind: "alt", desc: "数で押し切る。", preview: "会戦(補正なし)" },
        { id: "bypass", label: "臨朐を避けて広固へ直行する", kind: "bold", desc: "敵の主力を残して都を突く。", preview: "会戦はしない。劉裕の軍団が広固へ向かう(食糧-15。背後に敵の騎兵が残る)" },
      ],
      def: [
        { id: "cavalry", label: "鉄騎で晋の歩兵を押しつぶす", kind: "historic", desc: "段暉・公孫五楼に騎兵を率いさせる。", preview: "会戦(南燕の騎兵が力を出す)" },
        { id: "hold", label: "臨朐城に兵を入れ、背後を固めてから戦う", kind: "alt", desc: "奇襲に備える。", preview: "会戦(晋の奇襲の補正を消す。南燕の士気-5)" },
        { id: "retreat", label: "決戦を避け、広固に籠もる", kind: "bold", desc: "長い籠城で晋の兵糧が尽きるのを待つ。", preview: "会戦はしない。南燕の軍団は広固へ戻る。広固の守備兵+4,000" },
      ],
    },
    ai: (x, _r, role) => {
      if (role === "att") return x.c.historyMode === "free" && roll(x, "linqu-a") < 0.25 ? "bypass" : roll(x, "linqu-a2") < 0.8 ? "wagon" : "direct";
      return x.c.historyMode === "historic" ? "cavalry" : roll(x, "linqu-d") < 0.25 ? "hold" : roll(x, "linqu-d2") < 0.2 ? "retreat" : "cavalry";
    },
    apply: (x, r, p) => {
      const h = H(x);
      const att = r.att!;
      const def = r.def!;
      const a = liuArmy(x, att);
      const d = h.largestArmy(def);
      if (p.def === "retreat") {
        march(x, d, GUANGGU);
        if (owner("guanggu") === def) addGarrison(x.c, "guanggu", 4000);
        const s = a ? h.siege(a, "guanggu", "guanggu410", 700) : "";
        return `南燕は決戦を避けて広固に籠もった。${s}`;
      }
      if (p.att === "bypass") {
        if (a) a.army.food = Math.max(5, a.army.food - 15);
        h.flag("linqu409_rear", "1");
        return a && owner("guanggu") === def ? `劉裕は臨朐を避けて広固へ向かった。${h.siege(a, "guanggu", "guanggu410", 700)}` : "劉裕は臨朐を避けた";
      }
      // 作戦の補正:車陣(騎兵の突撃を受け止める)と、胡藩の奇襲。南燕が背後を固めれば奇襲の分は消える
      const notes: string[] = [];
      let am = 1;
      let dm = 1;
      if (p.att === "wagon") {
        am *= 1.12;
        notes.push("劉裕の車陣:戦車を左右に並べて鉄騎の突撃を受け止める(攻撃側×1.12)");
        if (p.def !== "hold" && inF(x.c, "hu_fan", att)) {
          am *= 1.1;
          notes.push("胡藩の奇襲:手薄な臨朐城を突く(攻撃側×1.1)");
        }
      }
      if (p.def === "cavalry") {
        dm *= 1.08;
        notes.push("南燕の鉄騎が平地で力を出す(防御側×1.08)");
      }
      if (p.def === "hold") {
        dm *= 0.95;
        notes.push("臨朐城に兵を割いた(防御側×0.95)");
      }
      return h.battle(a, d, LINQU, "linqu409", 420, { attacker: am, defender: dm, panic: p.att === "wagon" && p.def !== "hold" ? "defender" : undefined, panicRisk: 0.35, notes });
    },
    onBattle: (x, r, win) => {
      const h = H(x);
      if (win === "att") {
        x.c.loyalty.addFame("liu_yu_song", 6);
        const d = h.largestArmy(r.def!);
        if (d) d.army.morale = Math.max(15, d.army.morale - 15);
        const a = liuArmy(x, r.att!);
        const s = a && owner("guanggu") === r.def ? h.siege(a, "guanggu", "guanggu410", 700) : "";
        return `南燕の鉄騎は崩れ、慕容超は広固へ逃げ込んだ。${s}`;
      }
      x.c.loyalty.addFame("liu_yu_song", -6);
      x.c.court.addStability(r.att!, -5);
      return "晋軍は臨朐で敗れた(史実との分岐:劉裕の北伐は頓挫しかけている)";
    },
  },

  // ===== 4. 410年 広固攻城戦 =====
  {
    id: "guanggu410", name: "広固攻城戦", year: 409, month: 9, importance: "critical", place: GUANGGU,
    persons: ["liu_yu_song", "murong_chao", "han_fan", "yao_xing", "gongsun_wulou"],
    background: "臨朐で敗れた慕容超は、堅固な広固城に籠もった。城の兵糧は乏しく、民は飢え始めている。南燕は後秦の姚興に救援を求めた。",
    history: "劉裕は長い包囲で広固を囲み、土山や衝車を築いた。後秦は使者を送って劉裕を脅したが、夏との戦いで兵を出せなかった。410年2月、飢えた城はついに落ち、慕容超は捕らえられて建康で斬られた。南燕は滅んだ。",
    sources: ["『宋書』武帝紀上", "『晋書』慕容超載記", "『資治通鑑』巻115"],
    cond: "南燕が広固を持ち、劉裕の軍団が広固から350km以内にいて、戦争中",
    battle: ["att", "def"],
    fallRule: { capture: "ifPresent", survive: false },
    roles: (x) => ({ att: liuYuOf(x.c), def: owner("guanggu") }),
    // 臨朐の戦いのあとに、すでに広固の攻城戦(または広固へ向かう進軍)が始まっていれば、二重には起こさない
    done: (x) => !!x.c.events.find((e) => e.histId === "guanggu410" && e.status !== "cancelled") || H(x).tags.some((t) => t.histId === "guanggu410" && t.until >= Math.floor(x.c.day)),
    ready: (x, r) => {
      if (!r.att) return absent(x.c, "liu_yu_song");
      if (!r.def || r.def === r.att) return "広固はすでに劉裕の国のもの";
      if (!x.c.atWar(r.att, r.def)) return `劉裕の国と${name(r.def)}は戦争をしていない`;
      const a = liuArmy(x, r.att);
      if (!a || distanceKm(a.army, GUANGGU) > 350) return "劉裕の軍団が広固の近く(350km以内)にいない";
      return true;
    },
    choices: {
      att: [
        { id: "siege", label: "長く囲み、土山と衝車で攻める", kind: "historic", desc: "城の兵糧が尽きるのを待ちつつ攻める。", preview: "広固の攻城戦(進軍してから)。城の守備兵-20%(飢え)" },
        { id: "terms", label: "慕容超に降伏を勧める", kind: "alt", desc: "韓範を通じて降伏の条件を示す。", preview: "南燕の国力が劉裕の国の3割未満なら降伏(広固を得て慕容超は捕虜)。そうでなければ断られ、攻城戦" },
        { id: "lift", label: "包囲を解いて兵を返す", kind: "bold", desc: "長い包囲の負担を避ける。", preview: "攻城戦はしない。南燕は続く。劉裕の名声-5" },
      ],
      def: [
        { id: "hold", label: "籠城して後秦の救援を待つ", kind: "historic", desc: "姚興の援軍に望みをかける。", preview: "広固の守備兵+2,000。後秦が援軍を出せるか(夏との戦いしだい)" },
        { id: "sally", label: "城を出て決戦する", kind: "alt", desc: "飢える前に打って出る。", preview: "近くに南燕の軍団があれば会戦。なければ攻城戦" },
        { id: "yield", label: "城を開いて降る", kind: "bold", desc: "民をこれ以上飢えさせない。", preview: "広固を明け渡し、慕容超は捕虜になる" },
      ],
    },
    ai: (x, r, role) => {
      if (role === "def") {
        const ratio = pw(x, r.def) / Math.max(1, pw(x, r.att));
        return ratio < 0.12 && x.c.historyMode !== "historic" ? "yield" : roll(x, "guanggu-d") < 0.15 ? "sally" : "hold";
      }
      const a = liuArmy(x, r.att!);
      if (a && a.army.food < 15 && x.c.historyMode !== "historic") return "lift";
      return roll(x, "guanggu-a") < 0.2 ? "terms" : "siege";
    },
    apply: (x, r, p) => {
      const h = H(x);
      const att = r.att!;
      const def = r.def!;
      const a = liuArmy(x, att);
      if (p.att === "lift") {
        x.c.loyalty.addFame("liu_yu_song", -5);
        return "劉裕は広固の包囲を解いた(史実との分岐:南燕は続く)";
      }
      const surrender = (): string => {
        h.give("guanggu", att);
        if (owner("donglai") === def) h.give("donglai", att);
        const ch = P("murong_chao");
        if (ch && alive(x.c, ch.id) && ch.factionId === def) h.capture(ch.id, att);
        x.c.loyalty.addFame("liu_yu_song", 8);
        return "広固は城を開いて降り、慕容超は捕らえられた";
      };
      if (p.def === "yield") return surrender();
      if (p.att === "terms") {
        if (pw(x, def) < pw(x, att) * 0.3 && p.def !== "sally") return surrender();
      }
      let note = "";
      if (p.def === "hold") {
        addGarrison(x.c, "guanggu", 2000);
        const q = houqinOf(x.c);
        if (q && q !== att && x.c.relationOf(q, def) !== "war") {
          const xia = xiaOf(x.c);
          if (xia && x.c.atWar(q, xia) && pw(x, xia) > pw(x, q) * 0.25) note = "後秦は使者を送って劉裕を脅したが、夏との戦いで援軍を出せなかった。";
          else {
            x.c.setRelation(q, def, "alliance");
            note = `後秦が救援に動いた(${x.c.diplo.dispatchAid(q, def, { lon: GUANGGU.lon, lat: GUANGGU.lat, name: "広固" }).text})。`;
          }
        }
      }
      if (p.att === "siege") {
        const k = cityOf(x.c, "guanggu");
        if (k) {
          const st = x.c.cityState(k);
          x.c.cityStates.guanggu = { ...st, garrison: Math.max(800, Math.round(st.garrison * 0.8)) };
        }
        note += "城の中では飢えが広がった。";
      }
      if (p.def === "sally") {
        const d = h.largestArmy(def, GUANGGU, 120);
        if (d && a) return note + h.battle(a, d, GUANGGU, "guanggu410");
      }
      return note + h.siege(a, "guanggu", "guanggu410", 700);
    },
    onBattle: (x, r, win) => {
      if (win === "att") {
        x.c.loyalty.addFame("liu_yu_song", 10);
        x.c.court.addStability(r.att!, 5);
        return "広固が落ちた";
      }
      x.c.loyalty.addFame("liu_yu_song", -6);
      return "広固は持ちこたえた(史実との分岐:南燕は生き残った)";
    },
  },

  // ===== 5. 410年 盧循の反乱 =====
  {
    id: "luxun410", name: "盧循の反乱", year: 410, month: 2, importance: "major", place: PANYU,
    persons: ["lu_xun", "xu_daofu", "liu_yu_song", "he_wuji", "meng_chang", "liu_yi2"],
    background: "広州の盧循は、晋に刺史として認められていた。姉の夫の徐道覆は「劉裕が北にいる今こそ建康を突くべきだ」と説いている。",
    history: "410年、盧循と徐道覆は北上して何無忌を豫章で討ち取り、劉毅も破って建康に迫った。孟昶は自害した。劉裕は広固の陥落の直後で、急いで兵を返して建康を守り、盧循を退けた。盧循は411年に交州で敗れて自害した。",
    sources: ["『宋書』武帝紀中", "『晋書』盧循伝", "『資治通鑑』巻115"],
    cond: "盧循が生きていて、劉裕のいる国(または晋)の臣下として南の都市にいる",
    battle: ["reb", "liu"],
    // 盧循が背く相手:盧循のいる国(晋)。劉裕がその国にいれば、劉裕が帰るかどうかを選ぶ
    roles: (x) => {
      const reb = factionOfPersons(x.c, ["lu_xun"]);
      return { liu: reb && liuYuOf(x.c) === reb ? reb : jinOf(x.c), reb };
    },
    ready: (x, r) => {
      if (!r.reb) return absent(x.c, "lu_xun");
      if (!r.liu) return "盧循が背く相手(晋・劉裕の国)がない";
      const lx = P("lu_xun")!;
      if (lx.role === "ruler") return "盧循はすでに自立している";
      if (r.reb !== r.liu) return `盧循は${name(r.reb)}にいて、晋の臣下ではない`;
      return true;
    },
    choices: {
      liu: [
        { id: "return", label: "北伐の軍を返して建康を守る", kind: "historic", desc: "劉裕が急いで戻る。", preview: "劉裕の軍団が建康へ向かう(進軍)。建康の守備兵+3,000" },
        { id: "continue", label: "北伐を続け、留守の諸将に任せる", kind: "alt", desc: "劉毅・何無忌・孟昶に建康を守らせる。", preview: "劉裕は北に留まる。金1,000で建康の守備兵+6,000" },
        { id: "split", label: "軍を分け、半分を建康へ返す", kind: "bold", desc: "北の戦果も、都も失わない。", preview: "劉裕の軍団の4割を分けて建康へ向かわせる(その場で分ける。瞬間移動はしない)" },
      ],
      reb: [
        { id: "north", label: "建康へ攻め上る", kind: "historic", desc: "徐道覆の策。", preview: "盧循が番禺で自立し、軍団が建康へ向かう" },
        { id: "jing", label: "荊州の江陵を攻める", kind: "alt", desc: "長江の上流を押さえる。", preview: "盧循が自立し、軍団が江陵へ向かう" },
        { id: "stay", label: "広州に留まり、自立だけを宣言する", kind: "bold", desc: "嶺南の王となる。", preview: "盧循が自立する(攻め上らない)" },
      ],
    },
    ai: (x, r, role) => {
      if (role === "reb") return x.c.historyMode === "historic" ? "north" : roll(x, "luxun-r") < 0.25 ? "jing" : roll(x, "luxun-r2") < 0.15 ? "stay" : "north";
      const a = liuArmy(x, r.liu!);
      const far = a ? distanceKm(a.army, JIANKANG) > 400 : false;
      if (!far) return "return";
      return x.c.historyMode === "historic" ? "return" : roll(x, "luxun-l") < 0.3 ? "split" : roll(x, "luxun-l2") < 0.2 ? "continue" : "return";
    },
    apply: (x, r, p) => {
      const h = H(x);
      const host = r.liu!;
      const k = owner("panyu") === host ? "panyu" : (persons.find((q) => q.id === "lu_xun")?.residence ?? "panyu");
      const nf = h.found("lu_xun", owner(k) === host ? k : "panyu", "盧循(天師道の軍)", "征南大将軍");
      if (!nf) return "盧循は背こうとしたが、拠る城がなかった(反乱は起きなかった)";
      if (inF(x.c, "xu_daofu", host)) x.c.spoils.setFaction("xu_daofu", nf);
      x.c.setRelation(nf, host, "war");
      let ra = h.largestArmy(nf);
      if (!ra) {
        addGarrison(x.c, owner("panyu") === nf ? "panyu" : k, 12000);
        const made = x.c.raiseArmy(owner("panyu") === nf ? "panyu" : k, 12000, "lu_xun");
        ra = typeof made === "string" ? undefined : made;
      }
      const target = p.reb === "jing" ? cityOf(x.c, "jiangling") : cityOf(x.c, "jiankang");
      let text = "盧循が広州で背いた。";
      if (p.reb !== "stay" && ra && target && owner(target.id) === host) text += h.siege(ra, target.id, "luxun410", 2500);
      const a = liuArmy(x, host);
      if (p.liu === "return") {
        addGarrison(x.c, "jiankang", 3000);
        if (a && distanceKm(a.army, JIANKANG) > 60) text += march(x, a, JIANKANG) ? `劉裕は${a.army.name}を返して建康へ向かった。` : "";
      } else if (p.liu === "continue") {
        gold(x.c, host, -1000);
        addGarrison(x.c, "jiankang", 6000);
        text += "劉裕は北に留まり、建康は留守の諸将が守る。";
      } else if (a) {
        const d = x.c.detachArmy(a.army.id, 0.4, ["liu_daogui", "liu_yi2", "tan_daoji", "zhu_lingshi"].find((id) => inF(x.c, id, host) && x.c.postOf(id)?.kind !== "army"), "建康救援の別働隊");
        if (typeof d !== "string") text += march(x, d, JIANKANG) ? "劉裕は軍の4割を分けて建康へ返した。" : "";
      }
      return text;
    },
    onBattle: (x, r, win) => {
      if (win === "reb") {
        x.c.court.addStability(r.liu!, -15);
        return "盧循の軍が勝った(史実との分岐)";
      }
      return "盧循の軍は退けられた";
    },
  },

  // ===== 6. 416年 姚興の死(後秦の継承) =====
  {
    id: "yaoxing416", name: "姚興の死と後秦の後継争い", year: 416, month: 3, importance: "major", place: CHANGAN,
    persons: ["yao_xing", "yao_hong", "yao_bi", "yao_shao", "yao_yi", "yao_hui"],
    background: "後秦の姚興は病に倒れた。太子の姚泓は温和だが、弟の姚弼は帝位を狙って兵を集め、一族は割れている。夏の赫連勃勃は北から関中をうかがう。",
    history: "416年2月、姚興が没し、姚泓が即位した。姚弼は姚興の最期に死を賜った。一族の姚懿・姚恢はのちに背き、後秦は内から弱った。劉裕はこれを北伐の好機と見た。",
    sources: ["『晋書』姚興載記・姚泓載記", "『資治通鑑』巻117"],
    cond: "後秦があり、姚興が亡くなっている(君主の死は宮廷の仕組みで決まる)",
    // 姚氏が君主の国だけ(姚氏の人物がほかの国に仕えているだけなら、この事件は起きない)
    roles: (x) => ({ f: pick(x.c, "houqin") ?? factionOfPersons(x.c, ["yao_hong", "yao_xing", "yao_shao", "yao_bi"], true) }),
    ready: (x, r) => {
      if (!r.f) return "後秦(姚氏の国)がない";
      if (x.c.personStatus("yao_xing") !== "dead" && P("yao_xing")) return "姚興はまだ生きている(後継争いは起きていない)";
      return true;
    },
    choices: {
      f: [
        { id: "hong", label: "姚泓が継ぎ、姚弼の一党を退ける", kind: "historic", desc: "太子の即位を固める。", preview: "姚弼がいれば処刑。安定-15。一族の忠誠-10(のちの内紛の種)" },
        { id: "shao", label: "姚紹を輔政に立てて一族をまとめる", kind: "alt", desc: "長老の姚紹に兵権を預ける。", preview: "安定-5。姚紹の忠誠+20。一族の忠誠+5" },
        { id: "bi", label: "姚弼を立てる", kind: "bold", desc: "武を好む姚弼に国を託す。", preview: "姚弼がいれば君主になる。安定-25。姚泓は地方へ退く" },
      ],
    },
    ai: (x) => (x.c.historyMode === "historic" ? "hong" : roll(x, "yaoxing-ai") < 0.3 ? "shao" : roll(x, "yaoxing-ai2") < 0.1 ? "bi" : "hong"),
    apply: (x, r, p) => {
      const f = r.f!;
      const kin = (q: { people?: string; name: string }) => /^姚/.test(q.name);
      if (p.f === "hong") {
        if (inF(x.c, "yao_bi", f) && P("yao_bi")!.role !== "ruler") x.c.court.kill("yao_bi", "execution", "姚泓の即位");
        x.c.court.addStability(f, -15);
        H(x).loyaltyAll(f, -10, "後継争いのしこり", kin);
        H(x).flag("houqin_weak", "1");
        return "姚泓が後を継ぎ、姚弼は死を賜った。一族のしこりは残った";
      }
      if (p.f === "shao") {
        x.c.court.addStability(f, -5);
        if (inF(x.c, "yao_shao", f)) x.c.loyalty.add("yao_shao", 20, "輔政を任される");
        H(x).loyaltyAll(f, 5, "長老のもとにまとまる", kin);
        return "姚紹が輔政となり、一族はひとまずまとまった(史実との分岐)";
      }
      const bi = P("yao_bi");
      const ru = x.c.rulerOf(f);
      if (bi && inF(x.c, "yao_bi", f) && ru && ru.id !== bi.id) x.c.replaceRuler(f, ru, bi);
      x.c.court.addStability(f, -25);
      H(x).flag("houqin_weak", "1");
      return bi && alive(x.c, bi.id) ? "姚弼が帝位についた(史実との分岐)" : "姚弼はすでにおらず、姚泓が継いだ";
    },
  },

  // ===== 7. 416年 第二次北伐 =====
  {
    id: "beifa416", name: "第二次北伐(後秦討伐)", year: 416, month: 8, importance: "critical", place: LUOYANG,
    persons: ["liu_yu_song", "wang_zhene", "tan_daoji", "shen_linzi", "wang_zhongde", "shen_tianzi", "yao_hong"],
    background: "姚興の死で後秦は揺れている。劉裕は水陸の大軍を起こし、洛陽と関中を同時に狙う作戦を立てた。",
    history: "416年8月、劉裕は建康を発った。王鎮悪・檀道済は淮水・淝水から許昌・洛陽へ、沈林子は汴水を、王仲徳は黄河の水軍を、沈田子・傅弘之は武関道を進んだ。10月、檀道済らは洛陽を落とした。",
    sources: ["『宋書』武帝紀中・王鎮悪伝・檀道済伝", "『資治通鑑』巻117"],
    cond: "劉裕が生きていて、後秦があり、劉裕の国の都市が洛陽から700km以内にある",
    battle: ["att", "def"],
    roles: (x) => ({ att: liuYuOf(x.c), def: houqinOf(x.c) }),
    ready: (x, r) => {
      if (!r.att) return absent(x.c, "liu_yu_song");
      if (!r.def) return "後秦がない";
      if (r.att === r.def) return "劉裕が後秦にいる";
      if (["alliance", "vassal"].includes(x.c.relationOf(r.att, r.def))) return "劉裕の国と後秦は同盟・従属の関係にある";
      if (!x.c.cities.some((k) => k.kind !== "pass" && owner(k.id) === r.att && distanceKm(k, LUOYANG) < 700)) return "劉裕の国の都市が洛陽から遠すぎる";
      return true;
    },
    choices: {
      att: [
        { id: "multi", label: "水陸並進:諸将を分けて洛陽と関中を同時に攻める", kind: "historic", desc: "王鎮悪・檀道済は洛陽へ、沈田子は武関へ、劉裕は本軍で続く。", preview: "後秦と戦争。いまある軍団を洛陽・武関・関中へ向かわせる(各軍団が進軍してから戦う)" },
        { id: "single", label: "本軍だけで洛陽を目指す", kind: "alt", desc: "兵を分けず、確実に進む。", preview: "後秦と戦争。劉裕の軍団だけが洛陽へ向かう" },
        { id: "wait", label: "北伐を見送り、国内を固める", kind: "bold", desc: "なお機を待つ。", preview: "北伐はしない。金+600、安定+5" },
      ],
      def: [
        { id: "tongguan", label: "洛陽を捨て石にし、潼関と関中を固める", kind: "historic", desc: "姚泓は援軍を出しそびれ、洛陽は孤立した。", preview: "潼関の守備兵+5,000。後秦の主力は長安に留まる" },
        { id: "luoyang", label: "洛陽へ援軍を送る", kind: "alt", desc: "姚紹らに洛陽を救わせる。", preview: "後秦のいちばん大きい軍団(長安の本軍を除く)が洛陽へ向かう。洛陽の守備兵+3,000" },
        { id: "wei", label: "北魏に救援を求める", kind: "bold", desc: "婚姻を結んだ拓跋嗣を頼る。", preview: "北魏と同盟し、援軍を求める(北魏が応じるかは国力と関係しだい)" },
      ],
    },
    ai: (x, r, role) => {
      if (role === "def") return x.c.historyMode === "historic" ? "tongguan" : roll(x, "beifa-d") < 0.35 ? "luoyang" : roll(x, "beifa-d2") < 0.2 ? "wei" : "tongguan";
      const ratio = pw(x, r.att) / Math.max(1, pw(x, r.def));
      if (ratio < 1 && x.c.historyMode !== "historic") return "wait";
      return x.c.armies.filter((s) => s.army.factionId === r.att).length >= 3 ? "multi" : "single";
    },
    apply: (x, r, p) => {
      const att = r.att!;
      const def = r.def!;
      if (p.att === "wait") {
        gold(x.c, att, 600);
        x.c.court.addStability(att, 5);
        return "劉裕は北伐を見送った(史実との分岐)";
      }
      if (!x.c.atWar(att, def)) x.c.setRelation(att, def, "war");
      H(x).flag("beifa416", p.att);
      const h = H(x);
      const out: string[] = [];
      // 守る側
      if (p.def === "tongguan") {
        const tg = x.c.cities.find((k) => k.id === "tongguan");
        if (tg && owner("tongguan") === def) addGarrison(x.c, "tongguan", 5000);
      } else if (p.def === "luoyang") {
        if (owner("luoyang") === def) addGarrison(x.c, "luoyang", 3000);
        const cap = x.c.capitalCityOf(def);
        const relief = x.c.armies.filter((s) => s.army.factionId === def && s.status !== "fighting" && (!cap || distanceKm(s.army, cap) > 30)).sort((a, b) => troopsOf(b) - troopsOf(a))[0];
        if (relief && march(x, relief, LUOYANG)) out.push(`${relief.army.name}が洛陽の救援に向かう`);
      } else {
        const w = weiOf(x.c);
        if (w && w !== att) {
          x.c.setRelation(w, def, "alliance");
          out.push(`北魏に救援を求めた(${x.c.diplo.dispatchAid(w, def, { lon: LUOYANG.lon, lat: LUOYANG.lat, name: "洛陽" }).text})`);
        }
      }
      // 攻める側:いまある軍団だけを使う(新しい軍団は作らない)
      const main = liuArmy(x, att);
      const mine = x.c.armies.filter((s) => s.army.factionId === att && s.status !== "fighting" && s !== main && troopsOf(s) >= 3000).sort((a, b) => distanceKm(a.army, LUOYANG) - distanceKm(b.army, LUOYANG));
      const go = (s: ArmyState | undefined, city: string, label: string): void => {
        if (!s || owner(city) === att) return;
        const t = h.siege(s, city, city === "luoyang" ? "luoyang416" : "beifa416", 1200);
        out.push(`${label}:${t}`);
      };
      if (p.att === "multi") {
        const byCmd = (ids: string[]) => mine.find((s) => ids.includes(s.army.commanderId));
        const van = byCmd(["wang_zhene", "tan_daoji"]) ?? mine[0];
        go(van, "luoyang", "前鋒");
        const wu = byCmd(["shen_tianzi", "fu_hongzhi"]);
        if (wu && wu !== van && owner("wuguan") && owner("wuguan") !== att) go(wu, "wuguan", "武関道");
        const third = byCmd(["tan_daoji", "shen_linzi", "wang_zhongde"]);
        if (third && third !== van && third !== wu) {
          const xc = ["xuchang", "xingyang", "junyi"].find((k) => owner(k) === def);
          if (xc) go(third, xc, "別働隊");
        }
        if (main && march(x, main, { lon: 116.5, lat: 34.4 })) out.push(`${main.army.name}は彭城から後に続く`);
      } else {
        go(main, "luoyang", "本軍");
      }
      return `劉裕が北伐を起こした。${out.join("。")}`;
    },
    onBattle: (_x, _r, win) => (win === "att" ? "北伐の軍が勝った" : "後秦の軍が北伐の軍を退けた(史実との分岐)"),
  },

  // ===== 8. 416年 洛陽奪還 =====
  {
    id: "luoyang416", name: "洛陽奪還", year: 416, month: 11, importance: "major", place: LUOYANG,
    persons: ["tan_daoji", "wang_zhene", "liu_yu_song", "yao_guang"],
    background: "洛陽は西晋の旧都。永嘉の乱(311年)ののち、晋の手を離れて久しい。北伐の軍は洛陽の城下に迫っている。",
    history: "416年10月、後秦の姚洸は援軍が来ないまま洛陽を明け渡した。晋は百年ぶりに旧都を取り戻し、劉裕は晋の陵墓を修めさせた。",
    sources: ["『宋書』武帝紀中・檀道済伝", "『資治通鑑』巻117"],
    cond: "第二次北伐が起き、劉裕の国が攻城戦などで実際に洛陽を得ている",
    roles: (x) => ({ f: liuYuOf(x.c) }),
    ready: (x, r) => {
      if (!r.f) return absent(x.c, "liu_yu_song");
      if (!H(x).flag("beifa416")) return "第二次北伐が起きていない(洛陽を取り戻す遠征がなかった)";
      if (owner("luoyang") !== r.f) return `洛陽はまだ${name(owner("luoyang"))}のもの(北伐の軍は洛陽を得ていない)`;
      return true;
    },
    choices: {
      f: [
        { id: "tomb", label: "晋の陵墓を修め、旧都の回復を天下に告げる", kind: "historic", desc: "大義名分を示す。", preview: "劉裕の名声+12、国の安定+8、劉裕の国の軍団の士気+10。周りの国の友好度が変わる" },
        { id: "rest", label: "兵を休め、兵糧を集める", kind: "alt", desc: "関中へ入る前に備える。", preview: "洛陽の近くの軍団の食糧+30・士気+5。洛陽の守備兵+3,000" },
        { id: "press", label: "間をおかず潼関へ進む", kind: "bold", desc: "後秦が立ち直る前に。", preview: "洛陽の近くの軍団が潼関へ向かう(食糧-10)" },
      ],
    },
    ai: (x) => (x.c.historyMode === "historic" ? "tomb" : roll(x, "luoyang-ai") < 0.3 ? "rest" : roll(x, "luoyang-ai2") < 0.15 ? "press" : "tomb"),
    apply: (x, r, p) => {
      const f = r.f!;
      const near = armiesNear(x, f, LUOYANG, 200);
      if (p.f === "tomb") {
        x.c.loyalty.addFame("liu_yu_song", 12);
        x.c.court.addStability(f, 8);
        for (const s of x.c.armies) if (s.army.factionId === f) s.army.morale = Math.min(100, s.army.morale + 10);
        for (const g of scenario.factions) {
          if (g.id === f || g.passive || g.fallen) continue;
          if (/晋|漢/.test(g.people) || /涼/.test(g.name)) x.c.diplo.addAmity(f, g.id, 10);
          else if (g.id === weiOf(x.c) || g.id === houqinOf(x.c)) x.c.diplo.addAmity(f, g.id, -10);
        }
        return `${name(f)}は旧都の洛陽を取り戻し、晋の陵墓を修めた。劉裕の威信は大いに上がった`;
      }
      if (p.f === "rest") {
        for (const s of near) {
          s.army.food += 30;
          s.army.morale = Math.min(100, s.army.morale + 5);
        }
        addGarrison(x.c, "luoyang", 3000);
        return "北伐の軍は洛陽で兵を休めた";
      }
      const tg = x.c.cities.find((k) => k.id === "tongguan");
      let n = 0;
      for (const s of near) {
        s.army.food = Math.max(5, s.army.food - 10);
        if (tg && march(x, s, tg)) n++;
      }
      return `北伐の軍は休まず潼関へ向かった(${n}軍団)`;
    },
  },

  // ===== 9. 417年 却月陣 =====
  {
    id: "queyue417", name: "却月陣(北魏の騎兵との戦い)", year: 417, month: 3, importance: "critical", place: QUEYUE,
    persons: ["liu_yu_song", "ding_wu", "zhu_chaoshi", "zhangsun_song", "tuoba_si"],
    background: "劉裕の水軍は黄河をさかのぼって西へ進む。北岸には北魏の騎兵が付き従い、岸に流れ着いた晋兵を襲っている。北魏の拓跋嗣は後秦と婚姻で結んでいる。",
    history: "417年4月、劉裕は丁旿に兵七百と戦車百を与えて北岸に上陸させ、河を背に三日月の形の陣(却月陣)を敷いた。朱超石が大弩と大槌で加わり、押し寄せた北魏の騎兵三万を打ち破った。",
    sources: ["『宋書』武帝紀中・朱超石伝", "『魏書』長孫嵩伝", "『資治通鑑』巻118"],
    cond: "劉裕の国の軍団が黄河の中流・下流(北岸の近く)にいて、北魏の軍団が500km以内にいる。両国は同盟していない",
    battle: ["jin", "wei"],
    roles: (x) => ({ jin: liuYuOf(x.c), wei: weiOf(x.c) }),
    ready: (x, r) => {
      if (!r.jin) return absent(x.c, "liu_yu_song");
      if (!r.wei) return "北魏がない";
      if (["alliance", "vassal"].includes(x.c.relationOf(r.jin, r.wei))) return "劉裕の国と北魏は同盟・従属の関係にある";
      const a = x.c.armies.filter((s) => s.army.factionId === r.jin).sort((p, q) => distanceKm(p.army, QUEYUE) - distanceKm(q.army, QUEYUE))[0];
      if (!a || distanceKm(a.army, QUEYUE) > 450) return "劉裕の国の軍団が黄河の中流・下流にいない(450km以内)";
      if (!nearArmy(x, r.wei, QUEYUE, 500)) return "北魏の軍団が黄河の近くにいない";
      return true;
    },
    choices: {
      jin: [
        { id: "queyue", label: "北岸に上陸して却月陣を敷く", kind: "historic", desc: "河を背に、戦車と大弩で騎兵を受け止める。", preview: "会戦(劉裕の側に却月陣の補正:騎兵の突撃に強く、弩の力が増す。河を背にするので退けない)" },
        { id: "boat", label: "上陸せず、船で進み続ける", kind: "alt", desc: "北魏と戦わない。", preview: "会戦はしない。劉裕の国の軍団の兵-3%(岸での小競り合い)・疲れ+10" },
        { id: "envoy", label: "北魏に使者を送り、道を借りる", kind: "bold", desc: "後秦を討つだけで北魏とは争わないと告げる。", preview: "北魏の君主の知力が高ければ不可侵。そうでなければ会戦(陣の補正なし)" },
      ],
      wei: [
        { id: "attack", label: "騎兵で上陸した晋兵を押しつぶす", kind: "historic", desc: "長孫嵩に騎兵三万を率いさせる。", preview: "会戦" },
        { id: "watch", label: "北岸で見張るだけにする", kind: "alt", desc: "崔浩の献策:劉裕と争わず、成り行きを見る。", preview: "会戦はしない(晋が上陸していても、北魏は退く)" },
        { id: "aid", label: "後秦を救うため南岸へ渡る", kind: "bold", desc: "婚姻の誼で姚泓を助ける。", preview: "劉裕の国と戦争。北魏の軍団が洛陽へ向かう" },
      ],
    },
    ai: (x, r, role) => {
      if (role === "wei") {
        const ru = ruler(x.c, r.wei);
        return x.c.historyMode === "historic" ? "attack" : ru && ru.intelligence >= 80 && roll(x, "queyue-w") < 0.4 ? "watch" : roll(x, "queyue-w2") < 0.12 ? "aid" : "attack";
      }
      return x.c.historyMode === "free" && roll(x, "queyue-j") < 0.25 ? "envoy" : roll(x, "queyue-j2") < 0.15 ? "boat" : "queyue";
    },
    apply: (x, r, p) => {
      const h = H(x);
      const jin = r.jin!;
      const wei = r.wei!;
      const a = x.c.armies.filter((s) => s.army.factionId === jin && s.status !== "fighting").sort((p1, q) => distanceKm(p1.army, QUEYUE) - distanceKm(q.army, QUEYUE))[0];
      const w = nearArmy(x, wei, QUEYUE, 500);
      if (p.wei === "aid") {
        x.c.setRelation(jin, wei, "war");
        march(x, h.largestArmy(wei, QUEYUE, 600), LUOYANG);
        return "北魏は後秦を救うため南岸へ渡った(史実との分岐)";
      }
      if (p.jin === "boat" || p.wei === "watch") {
        if (p.jin === "boat") for (const s of x.c.armies) if (s.army.factionId === jin && distanceKm(s.army, QUEYUE) < 450) {
          for (const k of ["infantry", "cavalry", "archer"] as const) s.army.troops[k] = Math.round(s.army.troops[k] * 0.97);
          s.army.fatigue = Math.min(100, s.army.fatigue + 10);
        }
        return p.wei === "watch" ? "北魏は北岸で見張るだけで、戦いは起きなかった" : "劉裕は上陸せず、船で進み続けた(北岸の騎兵に少しずつ兵を削られた)";
      }
      if (p.jin === "envoy") {
        const ru = ruler(x.c, wei);
        if (ru && ru.intelligence >= 75 && roll(x, "queyue-envoy") < 0.6) {
          x.c.setRelation(jin, wei, "nonaggression");
          return "北魏は道を貸すことを認めた(不可侵)";
        }
      }
      if (!x.c.atWar(jin, wei)) x.c.setRelation(jin, wei, "war");
      h.flag("queyue417_formation", p.jin === "queyue" ? "1" : "0");
      // 陣を敷いて待ち受けるのは晋の側(守る側)。却月陣の強さは、会戦の中で敵の騎兵の割合と自軍の弩で決まる(autoBattle.ts の queyueMult)
      const tactics = p.jin === "queyue"
        ? { formation: { side: "defender" as const, id: "queyue" as const }, notes: ["却月陣:河を背に三日月の形に戦車を並べる(騎兵の突撃に強く、大弩が騎兵によく当たる。動けず、敗れれば河に追い落とされる)"] }
        : { notes: ["陣を敷かずに北魏の騎兵と戦う"] };
      // 陣を敷いて待ち受けるのは晋の側(守る側)。北魏の騎兵が攻めかかる
      return h.battle(w, a, QUEYUE, "queyue417", 450, tactics);
    },
    onBattle: (x, _r, win) => {
      if (win === "jin") {
        x.c.loyalty.addFame("liu_yu_song", 8);
        if (alive(x.c, "zhu_chaoshi")) x.c.loyalty.addFame("zhu_chaoshi", 6);
        return "北魏の騎兵は却月陣の前に崩れた。北魏はもう北伐を妨げなかった";
      }
      x.c.loyalty.addFame("liu_yu_song", -6);
      return "北魏の騎兵が晋の陣を破った(史実との分岐:北伐の軍は黄河で足止めされた)";
    },
  },

  // ===== 10. 417年 長安攻略 =====
  {
    id: "changan417", name: "長安攻略(後秦の滅亡)", year: 417, month: 8, importance: "critical", place: CHANGAN,
    persons: ["wang_zhene", "liu_yu_song", "yao_hong", "yao_shao", "shen_tianzi"],
    background: "潼関を抜いた北伐の軍は関中に入った。王鎮悪は舟に兵を隠して渭水をさかのぼり、長安の城下に迫ろうとしている。",
    history: "417年8月、王鎮悪は渭水から長安に攻め込み、姚泓は降伏した。姚泓は建康へ送られて斬られ、後秦は滅んだ。",
    sources: ["『宋書』武帝紀中・王鎮悪伝", "『晋書』姚泓載記", "『資治通鑑』巻118"],
    cond: "後秦(または長安を持つ国)が長安を持ち、劉裕の国の軍団が長安から400km以内にいて、戦争中",
    battle: ["att", "def"],
    fallRule: { capture: "ifPresent", survive: false },
    roles: (x) => ({ att: liuYuOf(x.c), def: owner("changan") }),
    ready: (x, r) => {
      if (!r.att) return absent(x.c, "liu_yu_song");
      if (!r.def || r.def === r.att) return "長安はすでに劉裕の国のもの";
      if (!x.c.atWar(r.att, r.def)) return `劉裕の国と${name(r.def)}は戦争をしていない`;
      const near = x.c.armies.filter((s) => s.army.factionId === r.att && distanceKm(s.army, CHANGAN) <= 400);
      if (!near.length) return "劉裕の国の軍団が長安の近く(400km以内)にいない(関中に入れていない)";
      return true;
    },
    choices: {
      att: [
        { id: "river", label: "王鎮悪の舟で渭水をさかのぼり、長安を攻める", kind: "historic", desc: "兵を舟の中に隠して城下に迫る。", preview: "長安の攻城戦(いちばん近い軍団が進軍してから)。王鎮悪がいれば攻め手の士気+10" },
        { id: "terms", label: "姚泓に降伏を勧める", kind: "alt", desc: "命と一族の安全を約束する。", preview: "相手の国力が劉裕の国の35%未満なら降伏(長安を得て、姚泓は捕虜)。そうでなければ攻城戦" },
        { id: "hold", label: "関中に深入りせず、潼関で守りを固める", kind: "bold", desc: "背後の北魏・夏を警戒する。", preview: "攻城戦はしない。潼関の守備兵+4,000" },
      ],
      def: [
        { id: "fight", label: "城外で決戦する", kind: "historic", desc: "姚泓が自ら兵を率いる。", preview: "長安の近くに軍団があれば会戦。なければ攻城戦" },
        { id: "hold", label: "籠城する", kind: "alt", desc: "城壁に拠って援軍を待つ。", preview: "長安の守備兵+3,000で攻城戦" },
        { id: "flee", label: "長安を捨て、西へ逃れて再起を図る", kind: "bold", desc: "安定・上邽で後秦を立て直す。", preview: "長安を明け渡す。君主は西の都市へ移り、国は続く" },
      ],
    },
    ai: (x, r, role) => {
      if (role === "def") {
        const ratio = pw(x, r.def) / Math.max(1, pw(x, r.att));
        return ratio < 0.2 && x.c.historyMode === "free" ? "flee" : roll(x, "changan-d") < 0.3 ? "hold" : "fight";
      }
      return x.c.historyMode === "historic" ? "river" : roll(x, "changan-a") < 0.25 ? "terms" : roll(x, "changan-a2") < 0.1 ? "hold" : "river";
    },
    apply: (x, r, p) => {
      const h = H(x);
      const att = r.att!;
      const def = r.def!;
      const a = x.c.armies.filter((s) => s.army.factionId === att && s.status !== "fighting").sort((p1, q) => distanceKm(p1.army, CHANGAN) - distanceKm(q.army, CHANGAN))[0];
      if (p.def === "flee") {
        const west = x.c.cities.filter((k) => k.kind !== "pass" && owner(k.id) === def && k.id !== "changan").sort((k1, k2) => k2.lon < k1.lon ? 1 : -1)[0];
        if (west) x.c.moveCapital(def, west.id, "長安を捨てて西へ逃れた");
        h.give("changan", att);
        return `後秦は長安を捨てて${west?.name ?? "西"}へ逃れた(史実との分岐:後秦は続く)`;
      }
      if (p.att === "hold") {
        if (owner("tongguan") === att) addGarrison(x.c, "tongguan", 4000);
        return "北伐の軍は潼関で守りを固め、長安へは進まなかった(史実との分岐)";
      }
      const fall = (): string => {
        h.give("changan", att);
        const hg = P("yao_hong");
        if (hg && alive(x.c, hg.id) && hg.factionId === def) h.capture(hg.id, att);
        x.c.loyalty.addFame("liu_yu_song", 12);
        return "姚泓は降伏し、長安は北伐の軍のものとなった";
      };
      if (p.att === "terms" && pw(x, def) < pw(x, att) * 0.35 && p.def !== "fight") return fall();
      if (p.att === "river" && a && a.army.commanderId === "wang_zhene") a.army.morale = Math.min(100, a.army.morale + 10);
      if (p.def === "hold") addGarrison(x.c, "changan", 3000);
      if (p.def === "fight") {
        const d = h.largestArmy(def, CHANGAN, 150);
        if (d && a) return h.battle(a, d, CHANGAN, "changan417");
      }
      return h.siege(a, "changan", "changan417", 900);
    },
    onBattle: (x, _r, win) => {
      if (win === "att") {
        x.c.loyalty.addFame("liu_yu_song", 10);
        if (alive(x.c, "wang_zhene")) x.c.loyalty.addFame("wang_zhene", 8);
        return "北伐の軍が勝った";
      }
      return "後秦は長安を守り切った(史実との分岐:後秦は立て直しの機会を得た)";
    },
  },

  // ===== 11. 417年 劉穆之の死 =====
  {
    id: "muzhi417", name: "劉穆之の死(関中に留まるか、帰るか)", year: 417, month: 12, importance: "major", place: CHANGAN,
    persons: ["liu_muzhi", "liu_yu_song", "liu_yizhen", "wang_zhene", "xu_xianzhi"],
    background: "建康で政務と兵站を一手に担っていた劉穆之が没した。劉裕は長安で、関中に留まって北方を平定するか、建康へ帰るかを迫られている。",
    history: "417年11月、劉穆之が没した。劉裕は12歳の子 劉義真を長安に残し、王鎮悪・沈田子らに守らせて建康へ帰った。",
    sources: ["『宋書』武帝紀中・劉穆之伝", "『資治通鑑』巻118"],
    cond: "劉穆之が亡くなっていて、劉裕が生きていて、劉裕の軍団が自国の都から500km以上離れている",
    roles: (x) => ({ f: liuYuOf(x.c) }),
    ready: (x, r) => {
      if (!r.f) return absent(x.c, "liu_yu_song");
      if (P("liu_muzhi") && x.c.personStatus("liu_muzhi") !== "dead") return "劉穆之はまだ生きている";
      const a = liuArmy(x, r.f);
      const cap = x.c.capitalCityOf(r.f);
      if (!a || !cap || a.army.commanderId !== "liu_yu_song" || distanceKm(a.army, cap) < 500) return `劉裕は遠征に出ていない(都の${cap?.name ?? ""}から500km以内にいる)`;
      return true;
    },
    choices: {
      f: [
        { id: "return", label: "劉義真を長安に残し、建康へ帰る", kind: "historic", desc: "王鎮悪・沈田子らに関中を守らせる。", preview: "劉裕の軍団の6割が建康へ向かう(進軍)。残りは関中の守り。長安を持っていれば劉義真を長安に置く" },
        { id: "stay", label: "関中に留まり、徐羨之に政務を任せる", kind: "alt", desc: "北方の平定を優先する。", preview: "劉裕は留まる。国の安定-10。徐羨之の忠誠+10" },
        { id: "unify", label: "帰らず、北魏・夏を討って北方の統一を目指す", kind: "bold", desc: "天下統一を急ぐ。", preview: "夏と戦争。劉裕の名声+5、国の安定-15。戦略AIが北方の統一を目標にする" },
      ],
    },
    ai: (x) => (x.c.historyMode === "historic" ? "return" : roll(x, "muzhi-ai") < 0.25 ? "stay" : roll(x, "muzhi-ai2") < (x.c.historyMode === "free" ? 0.3 : 0.1) ? "unify" : "return"),
    apply: (x, r, p) => {
      const f = r.f!;
      const a = liuArmy(x, f);
      if (p.f === "stay") {
        x.c.court.addStability(f, -10);
        if (inF(x.c, "xu_xianzhi", f)) x.c.loyalty.add("xu_xianzhi", 10, "政務を任される");
        H(x).flag("liuyu_stayed", "1");
        return "劉裕は関中に留まった(史実との分岐)";
      }
      if (p.f === "unify") {
        const xia = xiaOf(x.c);
        if (xia && xia !== f) x.c.setRelation(f, xia, "war");
        x.c.loyalty.addFame("liu_yu_song", 5);
        x.c.court.addStability(f, -15);
        H(x).flag("liuyu_unify", "1");
        H(x).flag("liuyu_stayed", "1");
        return "劉裕は北方の統一を目指して関中に留まった(史実との分岐)";
      }
      H(x).flag("liuyu_returned", "1");
      if (!a) return "劉裕は建康へ帰った";
      const rest = x.c.detachArmy(a.army.id, 0.4, ["wang_zhene", "shen_tianzi", "fu_hongzhi", "mao_dezu", "zhu_lingshi"].find((id) => inF(x.c, id, f) && x.c.postOf(id)?.kind !== "army"), "関中の守備軍");
      if (owner("changan") === f && P("liu_yizhen") && alive(x.c, "liu_yizhen")) P("liu_yizhen")!.residence = "changan";
      const home = x.c.capitalCityOf(f);
      const back = home ? march(x, a, home) : false;
      return `劉裕は${typeof rest === "string" ? "" : "軍の4割を関中に残し、"}${home?.name ?? "都"}へ帰った${back ? "" : "(帰る道がなく、留まった)"}`;
    },
  },

  // ===== 12. 418年 関中の危機 =====
  {
    id: "guanzhong418", name: "関中の危機(諸将の不和と赫連勃勃の侵攻)", year: 418, month: 1, importance: "critical", place: CHANGAN,
    persons: ["liu_yizhen", "wang_zhene", "shen_tianzi", "helian_bobo", "fu_hongzhi", "zhu_lingshi"],
    background: "劉裕が去った長安では、北人の王鎮悪と南人の沈田子らが反目している。夏の赫連勃勃は、劉裕が去るのを待っていたかのように南下を始めた。",
    history: "418年1月、沈田子は王鎮悪を殺し、自らも処刑された。夏の大軍が長安に迫り、劉義真は長安を捨てて逃れた。撤退の軍は青泥で大敗し、傅弘之は捕らえられて殺された。赫連勃勃は長安で皇帝を称した。",
    sources: ["『宋書』武帝紀中・王鎮悪伝", "『晋書』赫連勃勃載記", "『資治通鑑』巻118"],
    cond: "劉裕の国が長安を持ち、劉裕が長安から300km以上離れていて、夏がある",
    battle: ["xia", "jin"],
    roles: (x) => ({ jin: owner("changan") && owner("changan") === liuYuOf(x.c) ? owner("changan") : undefined, xia: xiaOf(x.c) }),
    ready: (x, r) => {
      if (!H(x).flag("beifa416")) return "第二次北伐が起きていない(関中は北伐で得たものではない)";
      if (!r.jin) return "長安は劉裕の国のものではない";
      if (!r.xia) return "夏がない";
      const ly = x.c.armies.find((s) => s.army.commanderId === "liu_yu_song");
      if (ly && distanceKm(ly.army, CHANGAN) < 300) return "劉裕が関中にいる(諸将の不和は起きていない)";
      return true;
    },
    choices: {
      jin: [
        { id: "feud", label: "諸将の不和を抑えられない", kind: "historic", desc: "沈田子が王鎮悪を殺す。", preview: "王鎮悪と沈田子がともに長安にいれば、王鎮悪は殺され沈田子は処刑される。長安の守備兵-30%" },
        { id: "unite", label: "劉裕が使者を送り、諸将をまとめる", kind: "alt", desc: "王鎮悪に関中の兵権を一本化する。", preview: "金1,500で長安の守備兵+3,000。不和は起きない" },
        { id: "abandon", label: "劉義真を呼び戻し、関中を捨てる", kind: "bold", desc: "早めに兵を引く。", preview: "関中の軍団が潼関の東へ退く(進軍)。長安の守備兵はそのまま" },
      ],
      xia: [
        { id: "invade", label: "長安へ攻め込む", kind: "historic", desc: "王買徳の策:劉裕の去った今が好機。", preview: "夏のいちばん大きい軍団が長安へ向かい、攻城戦(進軍してから)" },
        { id: "wait", label: "なお様子を見る", kind: "alt", desc: "劉裕が戻るのを恐れる。", preview: "攻めない" },
        { id: "treaty", label: "晋と和を結ぶ", kind: "bold", desc: "劉裕と争わない。", preview: "劉裕の国と不可侵" },
      ],
    },
    ai: (x, r, role) => {
      if (role === "xia") return x.c.historyMode === "historic" ? "invade" : pw(x, r.xia) < pw(x, r.jin) * 0.2 ? "wait" : roll(x, "guanzhong-x") < 0.15 ? "treaty" : "invade";
      return x.c.historyMode === "historic" ? "feud" : roll(x, "guanzhong-j") < 0.4 ? "unite" : roll(x, "guanzhong-j2") < 0.15 ? "abandon" : "feud";
    },
    apply: (x, r, p) => {
      const h = H(x);
      const jin = r.jin!;
      const xia = r.xia!;
      const out: string[] = [];
      if (p.jin === "feud") {
        const both = inF(x.c, "wang_zhene", jin) && inF(x.c, "shen_tianzi", jin);
        if (both) {
          x.c.court.kill("wang_zhene", "assassination", "沈田子による(関中の不和)");
          x.c.court.kill("shen_tianzi", "execution", "王鎮悪を殺した罪");
          out.push("沈田子が王鎮悪を殺し、自らも処刑された");
        } else out.push("諸将は反目したが、殺し合いには至らなかった");
        const k = cityOf(x.c, "changan");
        if (k) {
          const st = x.c.cityState(k);
          x.c.cityStates.changan = { ...st, garrison: Math.max(800, Math.round(st.garrison * 0.7)) };
        }
      } else if (p.jin === "unite") {
        gold(x.c, jin, -1500);
        addGarrison(x.c, "changan", 3000);
        out.push("劉裕の使者が諸将をまとめた(史実との分岐)");
      } else {
        const tg = x.c.cities.find((k) => k.id === "tongguan");
        let n = 0;
        for (const s of armiesNear(x, jin, CHANGAN, 250)) if (tg && march(x, s, { lon: tg.lon + 0.6, lat: tg.lat })) n++;
        out.push(`劉義真を呼び戻し、${n}軍団が潼関の東へ退いた`);
      }
      if (p.xia === "treaty") {
        x.c.setRelation(jin, xia, "nonaggression");
        out.push("夏は晋と和を結んだ");
      } else if (p.xia === "invade") {
        if (!x.c.atWar(jin, xia)) x.c.setRelation(jin, xia, "war");
        const xa = h.largestArmy(xia);
        out.push(xa ? h.siege(xa, "changan", "guanzhong418", 1500) : "夏には動ける軍団がなかった");
      } else out.push("夏はなお様子を見た");
      return out.join("。");
    },
    onBattle: (x, _r, win) => {
      if (win === "xia") {
        x.c.loyalty.addFame("helian_bobo", 10);
        return "赫連勃勃が長安を奪った";
      }
      return "晋は長安を守り切った(史実との分岐:劉裕は長安を保った)";
    },
  },

  // ===== 13. 420年 劉宋の建国 =====
  {
    id: "song420", name: "劉宋の建国(晋の禅譲)", year: 420, month: 6, importance: "critical", place: JIANKANG,
    persons: ["liu_yu_song", "sima_dewen", "sima_dezong", "fu_liang", "xu_xianzhi", "liu_yifu"],
    background: "劉裕は宋公から宋王に進み、天下の実権を握った。晋の皇帝は名ばかりとなり、傅亮らは禅譲の準備を進めている。",
    history: "420年6月、晋の恭帝 司馬徳文は劉裕に位を譲った。劉裕は建康で即位して国号を宋とした(武帝)。晋は156年で終わった。",
    sources: ["『宋書』武帝紀下", "『晋書』恭帝紀", "『資治通鑑』巻119"],
    cond: "劉裕が生きていて、晋の皇帝のいる国の臣下で、名声が高い(70以上)",
    roles: (x) => ({ f: liuYuOf(x.c) }),
    ready: (x, r) => {
      if (!r.f) return absent(x.c, "liu_yu_song");
      const ly = P("liu_yu_song")!;
      if (ly.role === "ruler") return "劉裕はすでに君主である(禅譲を受ける相手がいない)";
      const ru = x.c.rulerOf(r.f);
      if (!ru) return "君主がいない";
      const jin = /晋/.test(name(r.f)) || ["sima_dezong", "sima_dewen"].includes(ru.id) || r.f === jinThroneOf(x.c);
      if (!jin) return `劉裕は${name(r.f)}の臣下で、晋の禅譲の場にいない`;
      if (fameOf(x.c, "liu_yu_song") < 70) return `劉裕の名声がまだ足りない(${Math.round(fameOf(x.c, "liu_yu_song"))}・70以上が必要)`;
      return true;
    },
    choices: {
      f: [
        { id: "abdicate", label: "晋の皇帝が劉裕に位を譲り、宋を建てる", kind: "historic", desc: "禅譲の儀を行う。", preview: "劉裕が君主・皇帝となり、国号を「宋」と改める。武将・領土・軍団・財政・婚姻はそのまま引き継ぐ。前の皇帝は零陵王として退く" },
        { id: "vassal", label: "劉裕は宋王にとどまり、晋の臣下のままでいる", kind: "alt", desc: "帝位を求めず、晋を保つ。", preview: "晋は続く。劉裕の忠誠+20、国の安定+5" },
        { id: "unify", label: "帝位より、北方の統一を先にする", kind: "bold", desc: "天下を一つにしてから帝位を考える。", preview: "晋は続く。劉裕の名声+5。戦略AIが北方の統一を目標にする" },
      ],
    },
    ai: (x) => (x.c.historyMode === "historic" ? "abdicate" : roll(x, "song-ai") < (x.c.historyMode === "free" ? 0.35 : 0.15) ? "vassal" : roll(x, "song-ai2") < 0.15 ? "unify" : "abdicate"),
    apply: (x, r, p) => {
      const f = r.f!;
      const ly = P("liu_yu_song")!;
      if (p.f === "vassal") {
        x.c.loyalty.add(ly.id, 20, "晋の臣下にとどまる");
        x.c.court.addStability(f, 5);
        H(x).flag("song_vassal", "1");
        return "劉裕は宋王にとどまり、晋は続いた(史実との分岐)";
      }
      if (p.f === "unify") {
        x.c.loyalty.addFame(ly.id, 5);
        H(x).flag("liuyu_unify", "1");
        return "劉裕は帝位より北方の統一を先にした(史実との分岐)";
      }
      return foundSong(x, f);
    },
  },
];

/**
 * 劉宋の建国:同じ国(勢力のID)のまま、君主を劉裕に替え、国号・旗の色・位を改める。
 * 武将・領土・軍団・財政・婚姻・宝物は、勢力のIDが変わらないので、そのまま引き継がれる。
 */
export function foundSong(x: Ctx, f: string): string {
  const c = x.c;
  const ly = P("liu_yu_song");
  if (!ly || !alive(c, ly.id) || ly.factionId !== f) return "劉裕がいないため、宋は建たなかった";
  const old = c.rulerOf(f);
  if (old && old.id !== ly.id) c.replaceRuler(f, old, ly);
  c.renameState(f, "宋(劉宋)", SONG_COLOR);
  c.court.ranks[f] = "emperor";
  const fac = scenario.factions.find((y) => y.id === f)!;
  fac.title = "皇帝";
  // 後継者:劉義符(いなければ、宮廷の仕組みが決める)
  if (P("liu_yifu") && alive(c, "liu_yifu") && P("liu_yifu")!.factionId === f) c.court.heirs[f] = "liu_yifu";
  c.court.addStability(f, -8);
  c.loyalty.addFame(ly.id, 10);
  // 晋室を慕う者は少し離れる
  for (const q of persons) if (q.factionId === f && q.id !== ly.id && /^司馬/.test(q.name)) c.loyalty.add(q.id, -20, "晋の禅譲");
  // ほかの皇帝の国は、新しい皇帝を認めない
  for (const g of scenario.factions) if (g.id !== f && !g.fallen && !g.passive && c.court.rankOf(g.id) === "emperor") c.diplo.addAmity(f, g.id, -10);
  H(x).flag("song_founded", f);
  H(x).log("crown", `${old?.name ?? "晋の皇帝"}が劉裕に位を譲り、国号を宋と改めた(劉宋の建国)`);
  c.addNews(`【歴史】劉裕が晋の禅譲を受けて即位し、国号を「宋」と改めました`);
  return `${old?.name ?? "晋の皇帝"}は劉裕に位を譲った。劉裕が即位し、国号を宋と改めた(武将・領土・軍団・財政・婚姻はそのまま)`;
}

/** 役に当たる国がプレイヤーの国か(画面の知らせ用。いまは使わない) */
export const involvesPlayer = playerRole;
export { houqinOf, weiOf, xiaOf, yanOf };
