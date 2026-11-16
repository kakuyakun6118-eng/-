import { persons, scenario } from "../data";
import { fillPortrait } from "./portrait";
import type { Campaign } from "../sim/Campaign";
import { COMMAND_LABEL, RELATION_LABEL, relationNote, type DiploCommand } from "../sim/diplomacy";

export interface DiplomacyActions {
  campaign: () => Campaign;
  playerFactionId: () => string | null;
  /** 関係が変わったあと、地図の表示(軍団のパネルなど)を合わせる */
  onChanged: () => void;
}

/** 関係ごとに、選べる交渉 */
function commandsFor(rel: string): DiploCommand[] {
  if (rel === "war") return ["ceasefire", "peace", "gift", "surrender", "vassal"];
  if (rel === "vassal") return ["goodwill", "gift", "trade", "aid", "marriage", "war"];
  if (rel === "alliance") return ["aid", "goodwill", "gift", "trade", "marriage", "vassal", "war"];
  return ["goodwill", "gift", "trade", "alliance", "nonaggression", "marriage", "vassal", "surrender", "war"];
}

/**
 * 外交と情勢(PCでは3列):左に各国の一覧、中央に選んだ国の詳しい情報と交渉、右に申し入れと最近の出来事。
 * 交渉は、使者と内容を選んで「実行」する。成否と、その理由(見込みの内訳)を表示する。
 */
export class DiplomacyScreen {
  private readonly q: <T extends HTMLElement = HTMLElement>(sel: string) => T;
  private selected: string | null = null;
  private cmd: DiploCommand = "goodwill";
  private result = "";

  constructor(private readonly root: HTMLElement, private readonly actions: DiplomacyActions) {
    this.q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.q(".diplomacy-close").addEventListener("click", () => (this.root.hidden = true));
  }

  open(target?: string): void {
    this.root.hidden = false;
    this.say("");
    this.result = "";
    if (target) this.selected = target;
    this.render();
  }

  private say(text: string): void {
    this.q(".diplomacy-message").textContent = text;
  }

  private button(label: string, onClick: () => void, cls = ""): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener("click", onClick);
    return b;
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  private render(): void {
    const c = this.actions.campaign();
    const me = this.actions.playerFactionId();
    this.q(".diplomacy-hint").textContent = me
      ? "戦えるのは「戦争」の相手だけ。関所は同盟・従属の相手だけが通れます。国を選ぶと、右に詳しい情報と交渉が出ます。"
      : "メニューで「操作する勢力」を選ぶと、ほかの勢力が自動で動きはじめ、ここから外交ができます。";
    const live = scenario.factions.filter((f) => !f.passive);
    if (!this.selected || !live.some((f) => f.id === this.selected) || this.selected === me) {
      this.selected = live.find((f) => f.id !== me && !f.fallen)?.id ?? null;
    }
    const rows = live.map((f) => {
      const row = document.createElement("div");
      row.className = "diplomacy-row";
      row.dataset.faction = f.id;
      if (f.id === this.selected) row.classList.add("selected");
      const cities = c.cities.filter((x) => scenario.cityOwners[x.id] === f.id).length;
      const relation = me && me !== f.id ? c.relationOf(me, f.id) : null;
      const chip = document.createElement("i");
      chip.style.background = f.color;
      const face = this.el("img", "diplomacy-face");
      face.alt = "";
      fillPortrait(face, c.rulerOf(f.id) ?? persons.find((x) => x.factionId === f.id && x.role === "ruler"));
      const name = this.el("span", "diplomacy-name", f.name);
      const info = this.el("span", "diplomacy-info", f.fallen ? "滅亡" : cities === 0 ? "都市なし" : `都市${cities}・兵${Math.round(c.strengthOf(f.id) / 1000)}千${f.founded ? `・${f.title ?? ""}(${scenario.factions.find((x) => x.id === f.founded!.from)?.name ?? ""}から独立)` : ""}`);
      const state = this.el("span", "diplomacy-state", f.id === me ? "自勢力" : relation ? RELATION_LABEL[relation] : "—");
      state.dataset.relation = relation ?? "";
      const am = this.el("span", "diplomacy-amity", me && me !== f.id ? String(c.diplo.amityOf(me, f.id)) : "");
      row.append(chip, face, name, info, state, am);
      if (f.id !== me) row.addEventListener("click", () => {
        this.selected = f.id;
        this.result = "";
        this.render();
      });
      return row;
    });
    this.q(".diplomacy-factions").replaceChildren(...rows);
    this.renderDetail(c, me);

    const proposals = c.proposals.map((x) => {
      const row = this.el("div", "diplomacy-proposal");
      const name = scenario.factions.find((f) => f.id === x.from)?.name ?? "";
      row.append(this.el("span", "", `${name}が${x.kind === "peace" ? "和平" : "同盟"}を求めています`));
      const answer = (accept: boolean) => () => {
        c.answerProposal(x.from, accept);
        this.say(accept ? `${name}の申し入れを受けました` : `${name}の申し入れを断りました`);
        this.actions.onChanged();
        this.render();
      };
      row.append(this.button("受ける", answer(true)), this.button("断る", answer(false)));
      return row;
    });
    this.q(".diplomacy-proposals").replaceChildren(...proposals);

    const news = [...c.news].reverse().map((n) => this.el("li", "", n.text));
    if (news.length === 0) news.push(this.el("li", "", "まだ、出来事はありません"));
    this.q(".diplomacy-news").replaceChildren(...news);
  }

  /** 選んだ国の詳しい情報と、交渉の欄 */
  private renderDetail(c: Campaign, me: string | null): void {
    const box = this.q(".diplomacy-detail");
    const f = scenario.factions.find((x) => x.id === this.selected);
    if (!f) {
      box.replaceChildren(this.el("p", "diplomacy-empty", "国を選んでください"));
      return;
    }
    const d = c.diplo;
    const ruler = c.rulerOf(f.id);
    const head = this.el("div", "dd-head");
    const face = this.el("img", "dd-face");
    face.alt = ruler?.name ?? "";
    fillPortrait(face, ruler);
    const title = this.el("div", "dd-title");
    title.append(this.el("h3", "", f.name), this.el("span", "dd-ruler", ruler ? `${f.title ?? "君主"} ${ruler.name}(魅力${ruler.charisma})` : "君主なし"));
    head.append(face, title);

    const cities = c.cities.filter((x) => scenario.cityOwners[x.id] === f.id).length;
    const rel = me ? c.relationOf(me, f.id) : "neutral";
    const am = me ? d.amityOf(me, f.id) : 0;
    const k = me ? [me, f.id].sort().join("|") : "";
    const treaty = d.treaties[k];
    const months = treaty ? Math.max(0, Math.round((treaty.until - c.day) / 30)) : 0;
    const marriages = me ? d.marriageLinks(me, f.id) : [];
    const nameOf = (id: string): string => persons.find((p) => p.id === id)?.name ?? id;
    const stats = this.el("dl", "dd-stats");
    const add = (label: string, value: string | HTMLElement, cls = ""): void => {
      const dt = this.el("dt", "", label);
      const dd = this.el("dd", cls);
      if (typeof value === "string") dd.textContent = value;
      else dd.append(value);
      stats.append(dt, dd);
    };
    add("国力", Math.round(d.power(f.id) / 1000).toLocaleString("ja-JP") + "千");
    add("兵力", Math.round(c.strengthOf(f.id)).toLocaleString("ja-JP") + "人");
    add("都市", `${cities}`);
    add("威信", `${Math.round(c.loyalty.prestige(f.id))}`);
    if (me) {
      const bar = this.el("span", "dd-amity");
      const fill = this.el("b");
      fill.style.width = `${(am + 100) / 2}%`;
      fill.dataset.sign = am >= 0 ? "plus" : "minus";
      bar.append(fill, this.el("em", "", String(am)));
      add("友好度", bar);
      const relEl = this.el("span", "diplomacy-state", RELATION_LABEL[rel] + (d.isRecorded(me, f.id) || c.relationAge(me, f.id) < 9999 ? "" : "(推定)"));
      relEl.dataset.relation = rel;
      add("関係", relEl);
      const note = relationNote(me, f.id);
      if (note && c.relationAge(me, f.id) >= 9999) add("開始時の根拠", `${note.basis}:${note.note}`, "dd-basis");
      add("条約の期限", treaty ? `${treaty.kind === "alliance" ? "同盟" : "不可侵"} あと${months}か月` : "なし");
      add("婚姻", marriages.length ? marriages.map((m) => `${nameOf(m.husband)}と${nameOf(m.wife)}(${m.historic ? "史実" : "ゲーム内"}・${m.kind === "primary" ? "正室" : "側室"})`).join("、") : "なし");
      if (d.overlord[f.id] === me) add("従属", "こちらに臣従(毎月、収入の1割を貢ぐ)");
      if (d.overlord[me] === f.id) add("従属", "こちらが臣従している");
    }
    const hist = this.el("ul", "dd-history");
    for (const h of [...(me ? d.history[k] ?? [] : [])].reverse()) hist.append(this.el("li", "", h.text));
    if (!hist.children.length) hist.append(this.el("li", "", "外交の記録はまだありません"));

    const parts: HTMLElement[] = [head, stats, this.el("h4", "", "外交の履歴"), hist];
    if (me && !f.fallen && cities > 0) parts.push(this.renderForm(c, me, f.id, rel));
    if (this.result) parts.push(this.el("p", "dd-result", this.result));
    box.replaceChildren(...parts);
  }

  private renderForm(c: Campaign, me: string, target: string, rel: string): HTMLElement {
    const d = c.diplo;
    const form = this.el("div", "dd-form");
    form.append(this.el("h4", "", "交渉"));
    const cmds = commandsFor(rel);
    if (!cmds.includes(this.cmd)) this.cmd = cmds[0];
    const cmdSel = this.el("select", "dd-command");
    cmdSel.setAttribute("aria-label", "交渉の内容");
    for (const x of cmds) {
      const o = this.el("option", "", COMMAND_LABEL[x]);
      o.value = x;
      cmdSel.append(o);
    }
    cmdSel.value = this.cmd;
    const envoySel = this.el("select", "dd-envoy");
    envoySel.setAttribute("aria-label", "使者");
    const envoys = persons.filter((p) => p.factionId === me && c.personStatus(p.id) === "active" && !c.spoils.custodyOf(p.id))
      .sort((a, b) => b.intelligence + b.politics + b.charisma - (a.intelligence + a.politics + a.charisma)).slice(0, 30);
    for (const p of envoys) {
      const o = this.el("option", "", `${p.name}(知${p.intelligence}・政${p.politics}・魅${p.charisma})`);
      o.value = p.id;
      envoySel.append(o);
    }
    const line = (label: string, ...inputs: HTMLElement[]): HTMLElement => {
      const l = this.el("label", "dd-line");
      l.append(this.el("span", "", label), ...inputs);
      return l;
    };
    form.append(line("内容", cmdSel), line("使者", envoySel));
    const extra = this.el("div", "dd-extra");
    const purse = c.factionStates[me] ?? { gold: 0, grain: 0 };
    const gold = this.el("input", "dd-gold");
    const grain = this.el("input", "dd-grain");
    const treasure = this.el("select", "dd-treasure");
    const husband = this.el("select", "dd-husband");
    const wife = this.el("select", "dd-wife");
    if (this.cmd === "gift") {
      Object.assign(gold, { type: "number", min: "0", step: "100", value: String(Math.min(500, Math.floor(purse.gold / 100) * 100)) });
      Object.assign(grain, { type: "number", min: "0", step: "100", value: "0" });
      treasure.append(Object.assign(this.el("option", "", "名品は贈らない"), { value: "" }));
      for (const [id, s] of Object.entries(c.spoils.state)) {
        if (s.cityId || s.owner !== me) continue;
        const t = c.spoils.treasure(id);
        if (t) treasure.append(Object.assign(this.el("option", "", t.name), { value: id }));
      }
      extra.append(line(`金(手持ち${Math.floor(purse.gold)})`, gold), line(`兵糧(手持ち${Math.floor(purse.grain)})`, grain), line("名品", treasure));
    }
    if (this.cmd === "marriage") {
      const year = c.calendar().year;
      const ok = (p: (typeof persons)[number]): boolean => c.personStatus(p.id) === "active" && !c.spoils.custodyOf(p.id) && (p.born === null || year - p.born >= 14);
      for (const p of persons.filter((x) => (x.factionId === me || x.factionId === target) && x.gender !== "female" && ok(x)).sort((a, b) => (a.role === "ruler" ? -1 : 0) - (b.role === "ruler" ? -1 : 0))) {
        husband.append(Object.assign(this.el("option", "", `${p.name}(${scenario.factions.find((f) => f.id === p.factionId)?.name})`), { value: p.id }));
      }
      for (const p of persons.filter((x) => (x.factionId === me || x.factionId === target) && x.gender === "female" && ok(x))) {
        const married = d.spouseOf(p.id).length > 0;
        if (!married) wife.append(Object.assign(this.el("option", "", `${p.name}(${scenario.factions.find((f) => f.id === p.factionId)?.name})`), { value: p.id }));
      }
      if (!wife.children.length) wife.append(Object.assign(this.el("option", "", "嫁げる女性がいません"), { value: "" }));
      extra.append(line("夫", husband), line("妻", wife));
      extra.append(this.el("p", "dd-note", "2つの国の人物を1人ずつ選びます。一族どうし・14歳未満・既婚の女性は選べません。"));
    }
    if (this.cmd === "aid") extra.append(this.el("p", "dd-note", "同盟国が、自国の兵力・国境・財政・兵糧・距離を考えて決めます。送られた軍団は地図を進み、相手の国の軍団のままです(操作はできません)。"));
    if (this.cmd === "war" && ["alliance", "nonaggression", "vassal"].includes(rel)) extra.append(this.el("p", "dd-note dd-warn", "条約を破っての宣戦は裏切りです。相手の友好度が大きく下がり、ほかの国からの信用も落ちます。"));
    form.append(extra);
    const odds = this.el("p", "dd-odds");
    const updateOdds = (): void => {
      if (this.cmd === "war") {
        odds.textContent = "宣戦は、すぐに成り立ちます";
        return;
      }
      if (this.cmd === "aid") {
        odds.textContent = "援軍を出すかどうかは、相手の国が自国の事情で決めます(使者の能力では変わりません)。使者の費用:金50";
        return;
      }
      const o = d.odds(me, target, this.cmd, envoySel.value);
      odds.textContent = `見込み ${Math.round(o.p * 100)}%(${o.parts.join("・")})。使者の費用:金50`;
    };
    updateOdds();
    envoySel.addEventListener("change", updateOdds);
    cmdSel.addEventListener("change", () => {
      this.cmd = cmdSel.value as DiploCommand;
      this.render();
    });
    const run = this.button("実行", () => {
      const text = c.diplomacy(target, this.cmd, {
        envoyId: envoySel.value, gold: Number(gold.value) || 0, grain: Number(grain.value) || 0, treasureId: treasure.value || undefined,
        husbandId: husband.value || undefined, wifeId: wife.value || undefined,
      });
      this.result = text;
      this.say(text);
      this.actions.onChanged();
      this.render();
    }, "dd-run");
    form.append(odds, run);
    return form;
  }
}
