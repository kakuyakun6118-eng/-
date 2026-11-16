// 皇室の画面(PC向け):君主・正室と側室・子女・皇太子・家系図・後継順位・皇室の安定・宮廷費・宮廷の出来事。
// 人物を選ぶと、年齢・血縁・役目・能力・忠誠を表示する。プレイヤーの国では、婚姻・立太子・冊立・即位・慰撫ができる。
import { factionById, persons, scenario } from "../data";
import type { Person } from "../data/types";
import type { Campaign } from "../sim/Campaign";
import { fillPortrait } from "./portrait";

export interface CourtActions {
  campaign: () => Campaign;
  playerFactionId: () => string | null;
  onChanged: () => void;
}

export class CourtScreen {
  private faction: string | null = null;
  private focus: string | null = null;
  private selected: string | null = null;
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
    t.append(this.el("b", "", p.name + (p.fictional ? "*" : "")), this.el("small", "", [c.court.royalTitle(p) || note, age !== null ? `${age}歳` : "年齢不明", st === "dead" ? "故人" : st !== "active" ? { wounded: "負傷", captured: "捕虜", protected: "保護" }[st] ?? "" : ""].filter(Boolean).join("・")));
    k.append(img, t);
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
    info.append(this.el("h3", "", `${ct.rankLabel(f)} ${ruler.name}`), this.el("p", "", `${fac.name}・${ct.age(ruler) !== null ? `${ct.age(ruler)}歳` : "年齢不明"}・威信${c.loyalty.prestige(f)}`));
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
    left.append(dl);

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
    mid.append(this.el("p", "court-note", "* は架空の人物(ゲームの中で生まれた・迎えた人物)。史料にない親子は書いていません。"));

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
    right.append(this.el("h4", "", "宮廷の出来事"));
    const log = this.el("ul", "court-log");
    for (const e of [...(ct.log[f] ?? [])].reverse().slice(0, 14)) log.append(this.el("li", "", e.text));
    if (!log.children.length) log.append(this.el("li", "", "まだありません"));
    right.append(log);
    body.replaceChildren(left, mid, right);
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
    box.append(dl);
    if (p.id !== this.focus) box.append(this.button("この人物の家系図", () => {
      this.focus = p.id;
      this.render();
    }));
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
    box.append(line(this.el("span", "", "宮廷の慰撫"), this.el("small", "court-note", "金1,000で皇室の安定+10"), this.button("恩賞を配る", () => this.act(ct.appease(f)))));
    return box;
  }
}
