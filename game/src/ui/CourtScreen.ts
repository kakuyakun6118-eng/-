// 皇室の画面(PC向け):君主・正室と側室・子女・皇太子・家系図・後継順位・皇室の安定・宮廷費・宮廷の出来事。
// 人物を選ぶと、年齢・血縁・役目・能力・忠誠を表示する。プレイヤーの国では、婚姻・立太子・冊立・即位・慰撫ができる。
import { factionById, persons, scenario } from "../data";
import type { Person } from "../data/types";
import type { Campaign } from "../sim/Campaign";
import { fillPortrait } from "./portrait";
import { CAUSE_LABEL, EDU_LABEL, type EduPolicy, type EmperorRecord } from "../sim/court";
import { factionFlat, factionMult, factionTraitEffects, HAN_LEGITIMACY, incomeMult, LIMITS, prodOf, sumOf, TRAITS } from "../sim/virtualTraits";

export interface CourtActions {
  campaign: () => Campaign;
  playerFactionId: () => string | null;
  onChanged: () => void;
}

export class CourtScreen {
  private faction: string | null = null;
  private focus: string | null = null;
  private selected: string | null = null;
  /** 歴代皇帝一覧で詳しく見る代 */
  private emperorDetail: number | null = null;
  private message = "";

  constructor(private readonly root: HTMLElement, private readonly actions: CourtActions) {
    (root.querySelector(".court-close") as HTMLElement).addEventListener("click", () => (this.root.hidden = true));
    (root.querySelector(".court-faction") as HTMLSelectElement).addEventListener("change", (e) => {
      this.faction = (e.target as HTMLSelectElement).value;
      this.focus = null;
      this.selected = null;
      this.render();
    });
  }

  /** 開く。人物を渡すと、その人物を中心にした家系図を出す */
  open(personId?: string): void {
    const c = this.actions.campaign();
    const sel = this.root.querySelector(".court-faction") as HTMLSelectElement;
    const p = personId ? persons.find((x) => x.id === personId) : undefined;
    this.faction = p?.factionId ?? this.faction ?? this.actions.playerFactionId() ?? scenario.factions.find((f) => !f.passive && !f.fallen)?.id ?? null;
    sel.replaceChildren(...scenario.factions.filter((f) => !f.passive && !f.fallen).map((f) => new Option(f.name, f.id)));
    if (this.faction) sel.value = this.faction;
    this.focus = p?.id ?? null;
    this.selected = p?.id ?? null;
    this.message = "";
    this.root.hidden = false;
    void c;
    this.render();
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  private button(label: string, onClick: () => void, cls = ""): HTMLButtonElement {
    const b = this.el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  private act(text: string): void {
    this.message = text;
    (this.root.querySelector(".court-message") as HTMLElement).textContent = text;
    this.actions.onChanged();
    this.render();
  }

  /** 人物の札(肖像・名前・身分・年齢) */
  private card(p: Person, note = ""): HTMLElement {
    const c = this.actions.campaign();
    const k = this.el("button", "court-card");
    k.type = "button";
    k.dataset.id = p.id;
    if (p.id === this.selected) k.classList.add("selected");
    const st = c.personStatus(p.id);
    if (st === "dead") k.classList.add("dead");
    const img = this.el("img");
    img.alt = "";
    fillPortrait(img, p);
    const age = c.court.age(p);
    const t = this.el("span", "court-card-text");
    const cause = c.court.causeOf(p.id);
    t.append(this.el("b", "", p.name), this.el("small", "", [c.court.royalTitle(p) || note, age !== null ? `${age}歳` : "年齢不明", st === "dead" ? `故人${cause ? `(${CAUSE_LABEL[cause.cause]})` : ""}` : st !== "active" ? { wounded: "負傷", captured: "捕虜", protected: "保護" }[st] ?? "" : ""].filter(Boolean).join("・")));
    // 史実の人物か、架空の人物か(伝承・推定も区別する)
    const badge = this.el("i", "court-badge", p.fictional ? "架" : p.certainty === "伝承" ? "伝" : p.certainty === "推定" ? "推" : "史");
    badge.dataset.kind = p.fictional ? "fiction" : p.certainty === "伝承" || p.certainty === "推定" ? "uncertain" : "history";
    badge.title = p.fictional ? "架空の人物" : p.certainty ?? "史実の人物";
    k.append(badge, img, t);
    k.addEventListener("click", () => {
      this.selected = p.id;
      this.render();
    });
    k.addEventListener("dblclick", () => {
      this.focus = p.id;
      this.selected = p.id;
      this.render();
    });
    return k;
  }

  private render(): void {
    const c = this.actions.campaign();
    const ct = c.court;
    const f = this.faction;
    const body = this.root.querySelector(".court-body") as HTMLElement;
    (this.root.querySelector(".court-message") as HTMLElement).textContent = this.message;
    const fac = f ? factionById(f) : undefined;
    const ruler = f ? c.rulerOf(f) : undefined;
    if (!f || !fac || !ruler) {
      body.replaceChildren(this.el("p", "", "君主のいる国を選んでください"));
      return;
    }
    const mine = f === this.actions.playerFactionId();
    const focus = persons.find((x) => x.id === this.focus) ?? ruler;

    // ---- 左:君主と妃・皇太子・宮廷 ----
    const left = this.el("div", "court-col court-left");
    const head = this.el("div", "court-ruler");
    const face = this.el("img", "court-face");
    face.alt = ruler.name;
    fillPortrait(face, ruler);
    const info = this.el("div");
    // 漢の皇帝(仮想シナリオ)は「漢皇帝・劉皓」と元号を出す
    const era = ct.eraText(f);
    info.append(this.el("h3", "", ruler.title === "漢皇帝" ? `漢皇帝・${ruler.name}` : `${ct.rankLabel(f)} ${ruler.name}`), this.el("p", "", `${fac.name}・${ct.age(ruler) !== null ? `${ct.age(ruler)}歳` : "年齢不明"}・威信${c.loyalty.prestige(f)}${era ? `・${era}` : ""}`));
    head.append(face, info);
    left.append(head);
    const stab = Math.round(ct.stability[f] ?? 60);
    const bar = this.el("div", "court-bar");
    const fill = this.el("b");
    fill.style.width = `${stab}%`;
    fill.dataset.level = stab < 30 ? "low" : stab < 55 ? "mid" : "high";
    bar.append(fill, this.el("em", "", `${stab}`));
    const dl = this.el("dl", "court-stats");
    const add = (k: string, v: string | HTMLElement): void => {
      const dd = this.el("dd");
      if (typeof v === "string") dd.textContent = v;
      else dd.append(v);
      dl.append(this.el("dt", "", k), dd);
    };
    add("皇室の安定", bar);
    add("宮廷費", `毎月 ${ct.courtCost(f)}(皇室分。宮廷の維持費とは別)`);
    add("側室の上限", `${ct.concubinesOf(ruler.id).length} / ${ct.maxConcubines(f)}人(威信・国力・魅力で決まる)`);
    const risk = ct.disputeRisk(f, ct.heirOf(f) ?? ruler);
    add("継承争いの危険", `${Math.round(risk.value * 100)}%${risk.parts.length ? `(${risk.parts.join("・")})` : ""}`);
    const reg = ct.regentOf(f);
    add("摂政", reg ? `${reg.name}(政治${reg.politics}・名声${Math.round(c.loyalty.fame[reg.id] ?? 0)}・忠誠${Math.round(c.loyalty.loyalty[reg.id] ?? 0)}) 政務の効率×${ct.adminFactor(f).toFixed(2)}` : ct.isMinor(ruler) ? "なし(政務の効率が下がっています)" : "なし(親政)");
    const dw = ct.dowagers(f);
    add("皇太后など", dw.length ? dw.map((d) => `${d.title} ${d.p.name}`).join("、") : "なし");
    left.append(dl);
    // 外戚の影響力と、宮廷の勢力
    left.append(this.el("h4", "", "外戚の影響力"));
    const il = this.el("div", "court-meters");
    for (const x of ct.inLaws(f)) il.append(this.meter(`${x.clan}氏`, x.influence, x.why.join("・")));
    if (!il.children.length) il.append(this.el("p", "court-empty", "外戚はいません"));
    left.append(il, this.el("h4", "", "宮廷の勢力"));
    const pt = this.el("div", "court-meters");
    for (const g of ct.courtParties(f)) pt.append(this.meter(g.name, Math.min(100, g.power), `${g.count}人・平均の忠誠${g.loyalty}`));
    left.append(pt);

    left.append(this.el("h4", "", "正室・側室"));
    const wives = this.el("div", "court-cards");
    const pri = ct.primaryOf(ruler.id);
    if (pri) wives.append(this.card(pri, "正室"));
    for (const w of ct.concubinesOf(ruler.id)) wives.append(this.card(w, "側室"));
    if (!wives.children.length) wives.append(this.el("p", "court-empty", "妃はいません"));
    left.append(wives);
    const heir = ct.heirOf(f);
    left.append(this.el("h4", "", "後継者"), heir ? this.card(heir) : this.el("p", "court-empty", "未指名(継承争いが起こりやすくなります)"));

    if (mine) left.append(this.actionsPanel(c, f, ruler));

    // ---- 中央:家系図 ----
    const mid = this.el("div", "court-col court-tree");
    mid.append(this.el("h4", "", `家系図(${focus.name}を中心に。札を2回押すと、その人物を中心にします)`));
    const row = (label: string, list: Person[]): HTMLElement => {
      const r = this.el("div", "tree-row");
      r.append(this.el("span", "tree-label", label));
      const cards = this.el("div", "court-cards");
      for (const p of list) cards.append(this.card(p));
      if (!list.length) cards.append(this.el("span", "court-empty", "記録なし"));
      r.append(cards);
      return r;
    };
    const parents = [ct.fatherOf(focus.id), ct.motherOf(focus.id)].map((id) => persons.find((x) => x.id === id)).filter((x): x is Person => !!x);
    const note = ct.parentNote(focus.id);
    mid.append(row("父・母", parents));
    if (note) mid.append(this.el("p", "court-note", `注:${note}`));
    mid.append(row("本人", [focus]), row("配偶者", ct.spousesOf(focus.id)), row("兄弟姉妹", ct.siblingsOf(focus.id)), row("子女", ct.childrenOf(focus.id)));
    const grand = ct.childrenOf(focus.id).flatMap((k) => ct.childrenOf(k.id));
    if (grand.length) mid.append(row("孫", grand));
    mid.append(this.el("p", "court-note", "札の印:史=史実の人物・推=推定・伝=伝承・架=架空の人物(ゲームの中で生まれた・迎えた人物)。史料にない親子は書いていません。"));
    // 歴代皇帝一覧(仮想シナリオの漢)
    const reigns = ct.emperors.filter((r) => r.factionId === f);
    if (reigns.length) {
      mid.append(this.el("h4", "", "歴代皇帝一覧"));
      const tb = this.el("table", "court-emperors");
      const tr = (cells: (string | HTMLElement)[], th = false): HTMLElement => {
        const r = this.el("tr");
        for (const x of cells) { const d = this.el(th ? "th" : "td"); if (typeof x === "string") d.textContent = x; else d.append(x); r.append(d); }
        return r;
      };
      tb.append(tr(["代", "肖像", "名", "廟号・諡号", "元号", "生没", "即位・在位", "型", "能力", "固有特性", "漢の正統", "国家目標", "領土", "人口", "財政(金)", "兵力", "征服・遠征", "属国化", "内政・外交", "評価", "皇后・皇太子・後継"], true));
      const num = (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}千` : `${Math.round(v)}`);
      const chg = (a?: number, b?: number | null) => (a === undefined ? "—" : `${num(a)}→${b === null || b === undefined ? "(在位中)" : num(b)}`);
      for (const r of reigns) {
        const p = persons.find((x) => x.id === r.personId);
        const img = this.el("img", "court-emperor-face");
        img.alt = r.name;
        if (p) fillPortrait(img, p);
        const yrs = (r.endYear ?? ct.year()) - r.accYear;
        const open = r.endYear === null;
        const war = [`会戦${r.wins + (open ? ct.tally[f]?.wins ?? 0 : 0)}勝${r.losses + (open ? ct.tally[f]?.losses ?? 0 : 0)}敗`, `攻略${r.captures + (open ? ct.tally[f]?.captures ?? 0 : 0)}`].join("・");
        const exp = Object.entries(r.expeditions ?? {}).map(([k, n]) => `${k}${n}`).join("・");
        const civ = r.achievements.filter((x) => !/^会戦|^城の攻略|^領土/.test(x)).join("・") || (open ? "在位中" : "—");
        const pw = open ? ct.powerOf(f) : null;
        const name = this.button(r.name, () => { this.emperorDetail = this.emperorDetail === r.gen ? null : r.gen; this.render(); }, "court-link");
        tb.append(tr([`${r.gen}`, img, name, open ? "(在位中)" : `${r.templeName ?? ""}${r.templeName ? "・" : ""}${r.posthumous ?? "—"}`, r.era,
          `${r.born ?? "?"}〜${r.died ?? (open ? "" : "?")}`, `${r.accYear}年・${yrs}年${r.endReason ? `(${r.endReason})` : "(在位中)"}`,
          r.type ?? "—", r.stats ?? "—", (r.traits ?? []).join("・") || "—", r.legit === undefined ? "—" : r.legit ? "あり" : "なし", (r.goals ?? []).join("・") || "—",
          `${r.citiesStart}→${r.citiesEnd ?? (open ? `${this.cityCount(c, f)}(在位中)` : "?")}`, chg(r.popStart, open ? pw!.pop : r.popEnd), chg(r.goldStart, open ? pw!.gold : r.goldEnd), chg(r.troopsStart, open ? pw!.troops : r.troopsEnd),
          `${war}${(r.conquered ?? []).length ? `・征服${r.conquered!.length}都市` : ""}${exp ? `・遠征(${exp})` : ""}`, (r.vassalized ?? []).join("・") || "—", civ,
          r.score === null || r.score === undefined ? (open ? "(在位中)" : "—") : `${r.grade}(${r.score})`, `皇后 ${r.empress ?? "なし"}・皇太子 ${r.heir ?? "なし"}・後継 ${r.successor ?? (open ? "—" : "なし")}`]));
      }
      const wrap = this.el("div", "court-emperors-wrap");
      wrap.append(tb);
      const sel = reigns.find((r) => r.gen === this.emperorDetail);
      if (sel) mid.append(this.emperorPanel(c, f, sel));
      mid.append(wrap, this.el("p", "court-note", "名前を押すと、その皇帝の固有特性の説明と、実際の補正の値が出ます。廟号・諡号は、治世が終わったときに、実際の在位・戦績・領土の増減で決まります(初代の劉皓は太祖・宣武皇帝)。即位の前に亡くなった人は載りません。"));
    }

    // ---- 右:後継順位・選んだ人物・出来事 ----
    const right = this.el("div", "court-col court-right");
    right.append(this.el("h4", "", "後継順位"));
    const ol = this.el("ol", "court-order");
    for (const o of ct.successionOrder(f).slice(0, 8)) {
      const li = this.el("li");
      const b = this.button(`${o.p.name}(${o.reason}${ct.age(o.p) !== null ? `・${ct.age(o.p)}歳` : ""})`, () => {
        this.selected = o.p.id;
        this.render();
      }, "court-link");
      li.append(b);
      ol.append(li);
    }
    if (!ol.children.length) ol.append(this.el("li", "", "候補がいません"));
    right.append(ol);
    const sp = persons.find((x) => x.id === this.selected);
    if (sp) right.append(this.personPanel(c, sp));
    if (sp && ct.age(sp) !== null && ct.age(sp)! < 20 && sp.factionId === f) right.append(this.eduPanel(c, sp, mine));
    right.append(this.el("h4", "", "宮廷の出来事"));
    const log = this.el("ul", "court-log");
    for (const e of [...(ct.log[f] ?? [])].reverse().slice(0, 14)) log.append(this.el("li", "", e.text));
    if (!log.children.length) log.append(this.el("li", "", "まだありません"));
    right.append(log);
    body.replaceChildren(left, mid, right);
  }

  private cityCount(c: Campaign, f: string): number {
    return c.cities.filter((k) => k.kind !== "pass" && scenario.cityOwners[k.id] === f).length;
  }

  /** 歴代皇帝の詳細:固有特性の説明・漢の正統・国の補正の実際の値(在位中なら、いまの値) */
  private emperorPanel(c: Campaign, f: string, r: EmperorRecord): HTMLElement {
    const box = this.el("div", "court-emperor-detail");
    box.append(this.el("h4", "", `第${r.gen}代 ${r.name}(${r.type ?? "型なし"}${r.typeLabel ? `・${r.typeLabel}` : ""})`));
    const ul = this.el("ul");
    for (const t of r.traits ?? []) ul.append(this.el("li", "", `${t}:${TRAITS[t]?.label ?? "(効果表にない)"}`));
    ul.append(this.el("li", "", `${HAN_LEGITIMACY}:${r.legit ? "あり" : "なし"}。${TRAITS[HAN_LEGITIMACY]?.label ?? ""}`));
    box.append(ul);
    if (r.endYear === null) {
      const list = factionTraitEffects(f, Math.floor(c.day), (id) => c.personStatus(id));
      const inc = incomeMult(list);
      const v = [`全軍の戦闘力×${factionMult(list, "armyBattle", 1, LIMITS.battle).toFixed(2)}`, `登用+${Math.round(sumOf(list, "recruit") * 100)}`, `忠誠 毎月+${factionFlat(list, "loyaltyMonthly")}`, `治安 毎月+${factionFlat(list, "orderMonthly")}`,
        `金の収入×${inc.gold.toFixed(2)}`, `兵糧の収入×${inc.grain.toFixed(2)}`, `徴兵の効率×${factionMult(list, "conscript", 1, LIMITS.conscript).toFixed(2)}`, `兵糧の消費×${factionMult(list, "armyFood", LIMITS.armyFood, 1).toFixed(2)}`,
        `外交×${prodOf(list, "amity").toFixed(2)}`, `皇族の伸び×${factionMult(list, "growth", 1, LIMITS.growth).toFixed(2)}`, `反乱×${factionMult(list, "rebellion", LIMITS.rebellion, 1).toFixed(2)}`, `人口の増え方×${factionMult(list, "pop", 1, LIMITS.pop).toFixed(2)}`];
      box.append(this.el("p", "", `いまの国の補正(重なりは上限つき):${v.join("・")}`));
    } else box.append(this.el("p", "", "在位を終えているため、国への補正は止まっています。"));
    box.append(this.el("p", "", `国家目標:${(r.goals ?? []).join("・") || "—"}。征服した都市:${(r.conquered ?? []).slice(0, 20).join("・") || "なし"}`));
    return box;
  }

  /** 選んだ人物:年齢・血縁・役目・能力・忠誠 */
  private personPanel(c: Campaign, p: Person): HTMLElement {
    const ct = c.court;
    const box = this.el("div", "court-person");
    const age = ct.age(p);
    box.append(this.el("h4", "", `${p.name}${p.fictional ? "(架空)" : ""}`));
    const dl = this.el("dl", "court-stats");
    const add = (k: string, v: string): void => {
      dl.append(this.el("dt", "", k), this.el("dd", "", v));
    };
    add("年齢", age !== null ? `${age}歳(${ct.stageOf(p)})` : "生年不明");
    add("身分", ct.royalTitle(p) || "—");
    add("君主との血縁", ct.relationToRuler(p));
    add("役目", c.postOf(p.id)?.label ?? (ct.isMinor(p) ? "未成年(役目につけない)" : "なし"));
    add("能力", `統${p.leadership} 武${p.war} 知${p.intelligence} 政${p.politics} 魅${p.charisma}`);
    add("忠誠", p.role === "ruler" ? "—" : `${Math.round(c.loyalty.loyalty[p.id] ?? 0)}`);
    add("名声", `${Math.round(c.loyalty.fame[p.id] ?? 0)}`);
    add("確かさ", p.fictional ? "架空" : p.certainty ?? (p.datesUncertain || p.note ? "推定を含む" : "史実確認済み"));
    const cause = ct.causeOf(p.id);
    if (cause) add("死因", `${CAUSE_LABEL[cause.cause]}${cause.text ? `(${cause.text})` : ""}`);
    box.append(dl);
    if (p.id !== this.focus) box.append(this.button("この人物の家系図", () => {
      this.focus = p.id;
      this.render();
    }));
    return box;
  }

  private meter(label: string, v: number, note: string): HTMLElement {
    const row = this.el("div", "court-meter");
    const bar = this.el("span", "court-meter-bar");
    const b = this.el("b");
    b.style.width = `${Math.max(0, Math.min(100, v))}%`;
    b.dataset.level = v >= 70 ? "high" : v >= 40 ? "mid" : "low";
    bar.append(b);
    row.append(this.el("span", "court-meter-label", label), bar, this.el("em", "", String(v)), this.el("small", "", note));
    return row;
  }

  /** 教育(20歳未満の子女):方針・担当・これまでの伸び */
  private eduPanel(c: Campaign, p: Person, mine: boolean): HTMLElement {
    const ct = c.court;
    const box = this.el("div", "court-edu");
    const e = ct.eduOf(p.id);
    box.append(this.el("h4", "", `${p.name}の教育`));
    const tutor = persons.find((x) => x.id === e.tutor);
    const gain = Object.entries(e.gain).filter(([, v]) => (v ?? 0) >= 0.05).map(([k, v]) => `${{ leadership: "統", war: "武", intelligence: "知", politics: "政", charisma: "魅" }[k]}+${(v ?? 0).toFixed(1)}`).join(" ");
    box.append(this.el("p", "court-note", `方針:${EDU_LABEL[e.policy]} / 担当:${tutor?.name ?? "宮中の師(担当なし)"} / これまでの伸び:${gain || "なし"}(1つの能力につき15まで、能力は100まで)`));
    if (mine) {
      const pol = this.el("select", "court-edu-policy");
      for (const [k, v] of Object.entries(EDU_LABEL)) pol.append(new Option(v, k));
      pol.value = e.policy;
      const tu = this.el("select", "court-edu-tutor");
      tu.append(new Option("担当なし", ""));
      for (const x of persons.filter((y) => y.factionId === p.factionId && y.id !== p.id && c.personStatus(y.id) === "active" && !ct.isMinor(y)).sort((a, b) => (c.loyalty.fame[b.id] ?? 0) - (c.loyalty.fame[a.id] ?? 0)).slice(0, 25)) {
        tu.append(new Option(`${x.name}(統${x.leadership} 武${x.war} 知${x.intelligence} 政${x.politics})`, x.id));
      }
      tu.value = e.tutor ?? "";
      const d = this.el("div", "court-line");
      d.append(pol, tu, this.button("教育を決める", () => this.act(ct.setEducation(p.id, pol.value as EduPolicy, tu.value || undefined)), "court-edu-set"));
      box.append(d);
    }
    return box;
  }

  /** プレイヤーの国の操作:婚姻・立太子・冊立・即位・慰撫 */
  private actionsPanel(c: Campaign, f: string, ruler: Person): HTMLElement {
    const ct = c.court;
    const box = this.el("div", "court-actions");
    box.append(this.el("h4", "", "宮廷の操作"));
    const line = (...xs: HTMLElement[]): HTMLElement => {
      const d = this.el("div", "court-line");
      d.append(...xs);
      return d;
    };
    // 妃を迎える:国内の女性か、名家(臣下の一族)の娘
    const kind = this.el("select", "court-kind");
    kind.append(new Option("正室として", "primary"), new Option("側室として", "secondary"));
    if (ct.primaryOf(ruler.id)) kind.value = "secondary";
    const bride = this.el("select", "court-bride");
    bride.setAttribute("aria-label", "迎える相手");
    for (const w of ct.brideCandidates(ruler)) bride.append(new Option(`${w.name}(${ct.age(w) ?? "?"}歳)`, `w:${w.id}`));
    const sponsors = persons.filter((p) => p.factionId === f && p.role !== "ruler" && p.gender !== "female" && !ct.isRoyal(p) && c.personStatus(p.id) === "active")
      .sort((a, b) => (c.loyalty.fame[b.id] ?? 0) - (c.loyalty.fame[a.id] ?? 0)).slice(0, 12);
    for (const s of sponsors) bride.append(new Option(`${s.name}の一族の娘(架空・金300)`, `s:${s.id}`));
    box.append(line(this.el("span", "", "妃を迎える"), bride, kind, this.button("迎える", () => {
      const v = bride.value;
      if (!v) return this.act("相手を選んでください");
      this.act(v.startsWith("w:") ? ct.marry(ruler.id, v.slice(2), kind.value as "primary" | "secondary") : ct.takeNobleConsort(f, v.slice(2), kind.value as "primary" | "secondary"));
    }, "court-marry")));
    // 側室を正室に
    if (!ct.primaryOf(ruler.id) && ct.concubinesOf(ruler.id).length) {
      const s = this.el("select");
      for (const w of ct.concubinesOf(ruler.id)) s.append(new Option(w.name, w.id));
      box.append(line(this.el("span", "", "正室に立てる"), s, this.button("冊立", () => this.act(ct.promote(f, s.value)))));
    }
    // 後継者の指名
    const h = this.el("select", "court-heir");
    for (const o of ct.successionOrder(f).slice(0, 12)) h.append(new Option(`${o.p.name}(${o.reason})`, o.p.id));
    box.append(line(this.el("span", "", "後継者"), h, this.button("指名", () => this.act(ct.designateHeir(f, h.value)), "court-designate")));
    // 即位
    const chk = ct.crownCheck(f);
    if (chk.next) {
      box.append(line(this.el("span", "", `${chk.next === "emperor" ? "皇帝" : "王"}を称する`), this.el("small", "court-note", chk.ok ? "条件を満たしています" : `条件:${chk.missing.join("・")}`), this.button("即位", () => this.act(ct.crown(f)), "court-crown")));
    }
    // 摂政と親政
    if (ct.isMinor(ruler)) {
      const rs = this.el("select", "court-regent");
      for (const x of ct.regentCandidates(f).slice(0, 10)) rs.append(new Option(`${x.p.name}(${x.reason}・政${x.p.politics})`, x.p.id));
      box.append(line(this.el("span", "", "摂政"), rs, this.button("任命", () => this.act(ct.appointRegent(f, rs.value)), "court-regent-set")));
    } else if (ct.regentOf(f)) {
      box.append(line(this.el("span", "", "親政"), this.el("small", "court-note", `${ruler.name}は成人しました`), this.button("親政を始める", () => this.act(ct.personalRule(f)), "court-personal")));
    }
    box.append(line(this.el("span", "", "宮廷の慰撫"), this.el("small", "court-note", "金1,000で皇室の安定+10"), this.button("恩賞を配る", () => this.act(ct.appease(f)))));
    return box;
  }
}
