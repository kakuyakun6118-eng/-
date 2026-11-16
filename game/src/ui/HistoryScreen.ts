// 歴史の重大事件の画面と、歴史年表の画面(PC向け)。
// 事件:名称・年月・背景・関係人物の肖像・関係国・地図上の地点・選択肢と予想される影響・史実ではどうなったか・史料。
// 永嘉の乱・淝水の戦いなどの最重要の事件は、大きな演出で示す。肖像の無い人物はシルエットのまま(勝手に割り当てない)。
import { persons, scenario } from "../data";
import type { Campaign } from "../sim/Campaign";
import { KIND_LABEL, STATUS_LABEL, type HistEventDef } from "../sim/history";
import { fillPortrait } from "./portrait";

export interface HistoryActions {
  campaign: () => Campaign;
  playerFactionId: () => string | null;
  focus: (lon: number, lat: number) => void;
  /** 戦略マップに、戦場・関係都市・軍団の進軍経路を出す */
  showMap: (place: { lon: number; lat: number }, cities: string[], armies: string[][]) => { routes: number; cities: number };
  hideMap: () => void;
  onChanged: () => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class HistoryEventScreen {
  private current: { id: string; mode: "decide" | "news" | "branch" } | null = null;

  constructor(private readonly root: HTMLElement, private readonly actions: HistoryActions) {}

  /** 順番待ちの事件があれば、次を示す */
  showNext(): void {
    if (!this.root.hidden && this.current) return;
    const h = this.actions.campaign().history;
    const q = h.queue.find((x) => x.mode === "decide") ?? h.queue[0];
    if (!q) return;
    this.current = q;
    this.render();
    this.root.hidden = false;
  }

  close(): void {
    this.actions.hideMap();
    this.root.classList.remove("hist-mapmode");
    const c = this.actions.campaign();
    if (this.current && this.current.mode !== "decide") c.history.dismiss(this.current.id, this.current.mode);
    this.current = null;
    this.root.hidden = true;
    this.showNext();
  }

  private render(): void {
    const c = this.actions.campaign();
    const h = c.history;
    const cur = this.current!;
    const d = h.def(cur.id)!;
    const rec = h.records[d.id];
    const roles = d.roles(h.ctx());
    const box = this.root.querySelector(".hist-inner") as HTMLElement;
    box.className = `hist-inner persons-inner hist-${d.importance}`;
    const head = el("div", "hist-head");
    head.append(el("span", "hist-badge", d.importance === "critical" ? "歴史の大事件" : "歴史の事件"), el("h2", "", d.name), el("span", "hist-date", `史実:${d.year}年${d.month}月 / いま:${c.dateText()} / ${STATUS_LABEL[rec.status]}`));
    const left = el("div", "hist-col");
    left.append(el("h4", "", "歴史的背景"), el("p", "", d.background));
    // 関係人物(肖像の無い人はシルエット)
    const ps = el("div", "hist-persons");
    for (const id of d.persons) {
      const p = persons.find((x) => x.id === id);
      const fig = el("figure", "hist-person");
      const img = el("img");
      img.alt = p?.name ?? id;
      fillPortrait(img, p);
      const st = p ? c.personStatus(p.id) : "dead";
      fig.append(img, el("figcaption", "", p ? `${p.name}${st === "dead" ? "(故人)" : st !== "active" ? "(不在)" : ""}` : "(この年代にいない)"));
      ps.append(fig);
    }
    left.append(el("h4", "", "関係人物"), ps);
    const facs = el("p", "hist-factions");
    for (const [role, f] of Object.entries(roles)) {
      const fac = scenario.factions.find((x) => x.id === f);
      const chip = el("span", "hist-fac", fac ? fac.name : "(該当なし)");
      if (fac) chip.style.borderColor = fac.color;
      chip.title = role;
      facs.append(chip);
    }
    left.append(el("h4", "", "関係国"), facs);
    left.append(el("h4", "", "史実ではどうなったか"), el("p", "hist-history", d.history), el("p", "hist-sources", `史料:${d.sources.join("・")}`));

    const right = el("div", "hist-col");
    // 地図上の地点(小さな略図と、地図を動かす釦)
    right.append(el("h4", "", `発生地点:${d.place.name}`), this.miniMap(d), this.btn("戦略マップで見る(関係都市・軍団・進軍経路・戦場)", () => this.mapMode(d), "hist-focus"));
    if (cur.mode === "decide") {
      const role = Object.keys(d.choices).find((r) => roles[r] === this.actions.playerFactionId());
      right.append(el("h4", "", `選択(${scenario.factions.find((x) => x.id === roles[role!])?.name ?? ""})`));
      for (const ch of role ? d.choices[role] : []) {
        const b = el("button", "hist-choice");
        b.type = "button";
        b.dataset.kind = ch.kind;
        b.dataset.id = ch.id;
        b.append(el("span", "hist-kind", KIND_LABEL[ch.kind]), el("b", "", ch.label), el("small", "", ch.desc), el("em", "", `予想される影響:${ch.preview}`));
        b.addEventListener("click", () => {
          const text = h.choose(d.id, ch.id);
          this.actions.onChanged();
          this.current = { id: d.id, mode: "news" };
          this.render();
          (this.root.querySelector(".hist-result") as HTMLElement | null)?.replaceChildren(el("b", "", "結果:"), document.createTextNode(text));
        });
        right.append(b);
      }
      const others = Object.keys(d.choices).filter((r) => roles[r] && roles[r] !== this.actions.playerFactionId());
      if (others.length) right.append(el("p", "hist-note", `ほかの関係国(${others.map((r) => scenario.factions.find((x) => x.id === roles[r])?.name).join("・")})は、AIが国力・兵力・財政・君主の性格・外交を考えて選びます。`));
    } else {
      right.append(el("h4", "", cur.mode === "branch" ? "歴史の分岐" : "結果"));
      const picks = Object.entries(rec.picks).map(([role, x]) => `${scenario.factions.find((y) => y.id === roles[role])?.name ?? role}:「${d.choices[role]?.find((ch) => ch.id === x.choice)?.label ?? x.choice}」(${x.by === "player" ? "プレイヤー" : "AI"}の選択)`);
      if (picks.length) right.append(el("p", "hist-picks", picks.join(" / ")));
      const res = el("p", "hist-result");
      res.append(el("b", "", rec.historic ? "史実どおり:" : "史実と異なる:"), document.createTextNode(rec.result ?? ""));
      right.append(res);
      right.append(this.btn("閉じる", () => this.close(), "hist-close"));
    }
    box.replaceChildren(head, el("div", "hist-body"));
    (box.querySelector(".hist-body") as HTMLElement).append(left, right);
  }

  /** 戦略マップ(3Dの地形)の上に、事件の位置を示す。事件の画面は右側に寄せる */
  private mapMode(d: HistEventDef): void {
    const c = this.actions.campaign();
    const h = c.history;
    const roles = h.records[d.id].roles ?? d.roles(h.ctx());
    const cities = c.cities.filter((k) => k.kind !== "pass").sort((a, b) => Math.hypot(a.lon - d.place.lon, a.lat - d.place.lat) - Math.hypot(b.lon - d.place.lon, b.lat - d.place.lat)).slice(0, 5).map((k) => k.id);
    const sides = (d.battle ?? Object.keys(roles)).map((r) => roles[r]).filter((f): f is string => !!f);
    const armies = sides.map((f) => {
      const a = h.largestArmy(f);
      return a ? [a.army.id] : [];
    });
    const res = this.actions.showMap(d.place, cities, armies);
    this.root.classList.add("hist-mapmode");
    const box = this.root.querySelector(".hist-inner") as HTMLElement;
    const legend = el("div", "hist-legend");
    const colors = ["#e2705c", "#6fa8dc", "#9fd28a"];
    legend.append(el("h4", "", `戦略マップ:${d.place.name}`), el("p", "", `赤い輪=戦場、金の輪=関係都市(${res.cities})、点線=各国の主力から戦場への進軍経路(${res.routes}本。見込みで、軍はまだ動いていない)`));
    sides.forEach((f, i) => {
      const a = armies[i][0] ? c.stateOf(armies[i][0]) : undefined;
      const row = el("p", "hist-legend-row");
      const sw = el("i");
      sw.style.background = colors[i] ?? "#ccc";
      row.append(sw, document.createTextNode(`${scenario.factions.find((x) => x.id === f)?.name ?? f}:${a ? `${a.army.name}(${Math.round((a.army.troops.infantry + a.army.troops.cavalry + a.army.troops.archer) / 1000)}千)` : "軍団なし"}`));
      legend.append(row);
    });
    legend.append(this.btn("事件の画面に戻る", () => {
      this.actions.hideMap();
      this.root.classList.remove("hist-mapmode");
      this.render();
    }, "hist-back"));
    box.replaceChildren(legend);
  }

  private btn(label: string, f: () => void, cls = ""): HTMLButtonElement {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", f);
    return b;
  }

  /** 東アジアの略図に、発生地点の印を置く */
  private miniMap(d: HistEventDef): SVGSVGElement {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 260 150");
    svg.setAttribute("class", "hist-map");
    const x = (lon: number): number => ((lon - 98) / 28) * 260;
    const y = (lat: number): number => ((44 - lat) / 16) * 150;
    const bg = document.createElementNS(ns, "rect");
    Object.entries({ x: "0", y: "0", width: "260", height: "150", fill: "#1b1410" }).forEach(([k, v]) => bg.setAttribute(k, v));
    svg.append(bg);
    for (const [n, lon, lat] of [["洛陽", 112.6, 34.72], ["長安", 108.87, 34.31], ["建康", 118.8, 32.05], ["鄴", 114.35, 36.33], ["成都", 104.07, 30.66], ["姑臧", 102.63, 37.93]] as [string, number, number][]) {
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", String(x(lon) + 3));
      t.setAttribute("y", String(y(lat) - 2));
      t.setAttribute("fill", "#8a7a60");
      t.setAttribute("font-size", "9");
      t.textContent = n;
      const c0 = document.createElementNS(ns, "circle");
      Object.entries({ cx: String(x(lon)), cy: String(y(lat)), r: "1.8", fill: "#8a7a60" }).forEach(([k, v]) => c0.setAttribute(k, v));
      svg.append(c0, t);
    }
    const mark = document.createElementNS(ns, "circle");
    Object.entries({ cx: String(x(d.place.lon)), cy: String(y(d.place.lat)), r: "6", fill: "none", stroke: "#e2705c", "stroke-width": "2", class: "hist-pin" }).forEach(([k, v]) => mark.setAttribute(k, v));
    const dot = document.createElementNS(ns, "circle");
    Object.entries({ cx: String(x(d.place.lon)), cy: String(y(d.place.lat)), r: "2.5", fill: "#e2705c" }).forEach(([k, v]) => dot.setAttribute(k, v));
    svg.append(mark, dot);
    return svg;
  }
}

/** 歴史年表(史実とゲームの比較)と、歴史の事件の一覧 */
export class TimelineScreen {
  private tab: "timeline" | "list" = "timeline";

  constructor(private readonly root: HTMLElement, private readonly campaign: () => Campaign) {
    (root.querySelector(".timeline-close") as HTMLElement).addEventListener("click", () => (this.root.hidden = true));
    for (const b of root.querySelectorAll<HTMLButtonElement>(".tl-tab")) b.addEventListener("click", () => {
      this.tab = b.dataset.tab as "timeline" | "list";
      this.open();
    });
  }

  open(): void {
    this.root.hidden = false;
    for (const b of this.root.querySelectorAll<HTMLButtonElement>(".tl-tab")) b.classList.toggle("on", b.dataset.tab === this.tab);
    if (this.tab === "list") return this.renderList();
    this.renderTimeline();
  }

  /** 事件の一覧:名称・予定の年月・発生の条件・関係人物・史実の結果・ゲームの結果・状態 */
  private renderList(): void {
    const h = this.campaign().history;
    const table = el("table", "ev-table");
    const head = el("tr");
    for (const t of ["年月", "事件", "発生の条件", "関係人物", "史実の結果", "このゲームの結果", "状態"]) head.append(el("th", "", t));
    table.append(head);
    for (const d of h.defs) {
      const rec = h.records[d.id];
      const tr = el("tr");
      tr.dataset.status = rec.status;
      const ppl = d.persons.map((id) => persons.find((p) => p.id === id)?.name ?? "").filter(Boolean).join("・");
      tr.append(el("td", "", `${d.year}年${d.month}月`), el("td", "ev-name", d.name), el("td", "", d.cond ?? ""), el("td", "", ppl), el("td", "", d.history), el("td", "", rec.result ?? "—"), el("td", "ev-status", STATUS_LABEL[rec.status]));
      table.append(tr);
    }
    const counts: Record<string, number> = {};
    for (const r of Object.values(h.records)) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const sum = el("p", "ev-sum", `全${h.defs.length}件:` + Object.entries(counts).map(([k, v]) => `${STATUS_LABEL[k as keyof typeof STATUS_LABEL]} ${v}`).join("・"));
    const wrap = el("div", "ev-wrap");
    wrap.append(sum, table);
    (this.root.querySelector(".timeline-body") as HTMLElement).replaceChildren(wrap);
  }

  private renderTimeline(): void {
    const h = this.campaign().history;
    const hist = el("div", "tl-col");
    hist.append(el("h3", "", "史実の歴史"));
    for (const d of h.defs) {
      const rec = h.records[d.id];
      const row = el("div", "tl-row");
      row.dataset.status = rec.status;
      row.append(el("span", "tl-date", `${d.year}年${d.month}月`), el("b", "", d.name), el("small", "", `${STATUS_LABEL[rec.status]}${rec.historic === false ? "(史実と異なる)" : ""}`), el("p", "", d.history));
      hist.append(row);
    }
    const game = el("div", "tl-col");
    game.append(el("h3", "", "このゲームの歴史"));
    const KIND: Record<string, string> = { history: "事件", choice: "選択", state: "建国", fall: "滅亡", crown: "即位", ruler: "君主", battle: "会戦", past: "開始前" };
    for (const t of [...h.timeline].reverse()) {
      const row = el("div", "tl-row");
      row.dataset.kind = t.kind;
      row.append(el("span", "tl-date", t.date), el("span", "tl-kind", KIND[t.kind] ?? t.kind), el("p", "", t.text));
      if (t.diff) row.append(el("em", "tl-diff", `史実との違い:${t.diff}`));
      game.append(row);
    }
    if (h.timeline.length === 0) game.append(el("p", "", "まだ記録はありません"));
    (this.root.querySelector(".timeline-body") as HTMLElement).replaceChildren(hist, game);
  }
}
