// 歴史イベントの一覧(Version 40)。年表とは別に、事件を探し、発動の条件を確かめ、条件がそろえば発動できる。
// 発動すると、従来の事件の画面(3つの選択肢と予想される影響)が開き、選んだ結果がゲームに反映される。
import { ledgerPerson, scenario } from "../data";
import type { Campaign } from "../sim/Campaign";
import { CATEGORY_LABEL, categoriesOf, LIST_STATE_LABEL, type HistEventDef } from "../sim/history";

export interface EventsActions {
  campaign: () => Campaign;
  /** 発動のあと:事件の画面を出す */
  onFired: () => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const MODE_LABEL = { normal: "通常", historic: "史実重視", free: "自由歴史" } as const;

export class EventsScreen {
  private selected: string | null = null;

  constructor(private readonly root: HTMLElement, private readonly actions: EventsActions) {
    (root.querySelector(".events-close") as HTMLElement).addEventListener("click", () => (this.root.hidden = true));
    (root.querySelector(".ev-filter") as HTMLSelectElement).addEventListener("change", () => this.render());
  }

  open(): void {
    this.root.hidden = false;
    this.render();
  }

  private factionName(f: string | undefined): string {
    return scenario.factions.find((x) => x.id === f)?.name ?? "—";
  }

  private render(): void {
    const c = this.actions.campaign();
    const h = c.history;
    const filter = (this.root.querySelector(".ev-filter") as HTMLSelectElement).value;
    const rows = h.defs.map((d) => ({ d, st: h.listState(d), cats: categoriesOf(d) }));
    const shown = rows.filter(({ d, st, cats }) =>
      filter === "all" ? true
        : filter === "mine" ? h.involves(d)
          : filter === "military" || filter === "politics" || filter === "diplomacy" || filter === "founding" ? cats.includes(filter)
            : filter === "occurred" ? st.state === "occurred" || st.state === "past"
              : st.state === filter);
    (this.root.querySelector(".ev-count") as HTMLElement).textContent = `${shown.length}件 / 全${rows.length}件(発動可能 ${rows.filter((r) => r.st.can).length}件)`;
    (this.root.querySelector(".ev-mode") as HTMLElement).textContent = `歴史の流れ:${MODE_LABEL[c.historyMode]}${c.playerFactionId === null ? "・観賞・編集モード" : ""}`;
    if (!shown.some((r) => r.d.id === this.selected)) this.selected = shown[0]?.d.id ?? null;
    const table = el("table", "ev-table");
    const head = el("tr");
    for (const t of ["イベント名", "史実年月", "関係国家", "関係人物", "種類", "状態", ""]) head.append(el("th", "", t));
    table.append(head);
    for (const { d, st, cats } of shown) {
      const tr = el("tr", `ev-row ev-${st.state}`);
      tr.dataset.id = d.id;
      tr.setAttribute("aria-selected", String(d.id === this.selected));
      const roles = d.roles(h.ctx());
      tr.append(
        el("td", "ev-name", d.name),
        el("td", "", `${d.year}年${d.month}月`),
        el("td", "", Object.keys(d.choices).map((r) => this.factionName(roles[r])).join("・")),
        el("td", "", d.persons.slice(0, 3).map((id) => ledgerPerson(id)?.name ?? id).join("・")),
        el("td", "", cats.map((x) => CATEGORY_LABEL[x]).join("・")),
        el("td", "ev-state", LIST_STATE_LABEL[st.state]),
      );
      const td = el("td");
      if (st.can) {
        const b = el("button", "ev-fire-mini", "発動");
        b.type = "button";
        b.addEventListener("click", (e) => { e.stopPropagation(); this.fire(d); });
        td.append(b);
      }
      tr.append(td);
      tr.addEventListener("click", () => { this.selected = d.id; this.render(); });
      table.append(tr);
    }
    (this.root.querySelector(".ev-list") as HTMLElement).replaceChildren(table);
    this.renderDetail();
  }

  private renderDetail(): void {
    const box = this.root.querySelector(".ev-detail") as HTMLElement;
    const c = this.actions.campaign();
    const h = c.history;
    const d = h.defs.find((x) => x.id === this.selected);
    if (!d) return void box.replaceChildren(el("p", "", "事件を選んでください"));
    const st = h.listState(d);
    const rec = h.records[d.id];
    const parts: HTMLElement[] = [
      el("h3", "", d.name),
      el("p", "ev-meta", `史実:${d.year}年${d.month}月・${d.place.name} / いま:${c.dateText()} / 状態:${LIST_STATE_LABEL[st.state]}${rec.manual ? "(一覧から発動)" : ""}`),
      el("p", "", d.background),
      el("p", "ev-history", `史実:${d.history}`),
    ];
    // 発動の条件(満たしているか・理由)
    const conds = st.conds.length ? st.conds : h.conditions(d);
    const ul = el("ul", "ev-conds");
    for (const x of conds) {
      const li = el("li", x.ok ? "ok" : x.info ? "info" : "ng", `${x.ok ? "○" : x.info ? "△" : "×"} ${x.label}${x.ok ? "" : `:${x.why ?? ""}`}`);
      ul.append(li);
    }
    parts.push(el("h4", "", "発動の条件"), ul);
    if (conds.some((x) => x.info && !x.ok)) parts.push(el("p", "ev-note", "△は参考:主要人物がいなくても、代わりの人物(代替指揮官など)で前提条件を満たせば発動できる"));
    // 選択肢と予想される効果
    for (const [role, list] of Object.entries(d.choices)) {
      const roles = d.roles(h.ctx());
      parts.push(el("h4", "", `${this.factionName(roles[role])}(${role})の選択肢`));
      const ol = el("ul", "ev-choices");
      for (const ch of list) ol.append(el("li", "", `【${{ historic: "史実どおり", alt: "合理的な別案", bold: "大胆な改変" }[ch.kind]}】${ch.label}:予想される効果 — ${ch.preview}`));
      parts.push(ol);
    }
    if (rec.result) parts.push(el("p", "ev-result", `結果:${rec.result}`));
    parts.push(el("p", "ev-sources", `史料:${d.sources.join("、")}`));
    const fire = el("button", "ev-fire", st.can ? "イベント発動" : "発動できません");
    fire.type = "button";
    fire.disabled = !st.can;
    fire.addEventListener("click", () => this.fire(d));
    parts.push(fire);
    if (!st.can && st.reasons.length) parts.push(el("p", "ev-why", `理由:${st.reasons.join(" / ")}`));
    const msg = el("p", "ev-message");
    parts.push(msg);
    box.replaceChildren(...parts);
  }

  private fire(d: HistEventDef): void {
    const h = this.actions.campaign().history;
    const r = h.fire(d.id);
    this.selected = d.id;
    this.render();
    (this.root.querySelector(".ev-message") as HTMLElement).textContent = r;
    if (h.queue.length) {
      this.root.hidden = true;
      this.actions.onFired();
    }
  }
}
