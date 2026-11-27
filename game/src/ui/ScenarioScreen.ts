import { scenario, scenarioCatalog, switchScenario } from "../data";

/**
 * シナリオの選択画面。目録の史実のシナリオを年の順に並べ、仮想シナリオは別の区分にまとめる。遊べるもの(ready)だけにボタンを出す。
 * 準備中のものは押せず、「準備中(未実装)」と表示する。
 */
export class ScenarioScreen {
  /** 閉じたとき(いまのシナリオのまま始める・閉じる)に呼ぶ。勢力の選択へ進むため */
  constructor(private readonly root: HTMLElement, private readonly onClosed: () => void = () => {}) {
    (root.querySelector(".scenarios-close") as HTMLElement).addEventListener("click", () => this.close());
    const list = root.querySelector(".scenarios-list") as HTMLElement;
    // 史実のシナリオを年の順に並べ、そのあとに「仮想シナリオ」の区分を置く
    const heading = (text: string, note: string): HTMLElement => {
      const h = document.createElement("h3");
      h.className = "scenario-group";
      h.textContent = text;
      const small = document.createElement("small");
      small.textContent = note;
      h.append(small);
      return h;
    };
    const historic = scenarioCatalog.filter((e) => e.category !== "virtual");
    const virtual = scenarioCatalog.filter((e) => e.category === "virtual");
    const cards = (entries: typeof scenarioCatalog) => entries.map((e) => {
        const card = document.createElement("div");
        card.className = "scenario-card";
        card.dataset.id = e.id;
        card.dataset.status = e.id === scenario.id ? "current" : e.status;
        const year = document.createElement("span");
        year.className = "scenario-year";
        year.textContent = `${e.year}年`;
        const title = document.createElement("strong");
        title.textContent = e.title;
        const summary = document.createElement("p");
        summary.textContent = e.summary;
        const seal = document.createElement("span");
        seal.className = "seal";
        seal.textContent = e.id === scenario.id ? "今" : e.status === "ready" ? "可" : "未";
        const facts = document.createElement("dl");
        for (const [label, list] of [["主な勢力", e.powers], ["主な人物", e.figures]] as const) {
          if (!list || list.length === 0) continue;
          const dt = document.createElement("dt");
          dt.textContent = label;
          const dd = document.createElement("dd");
          dd.textContent = list.join("・");
          facts.append(dt, dd);
        }
        const action = document.createElement("button");
        action.type = "button";
        if (e.id === scenario.id) {
          action.textContent = "このシナリオで続ける(いまのシナリオ)";
          action.addEventListener("click", () => this.close());
        } else if (e.status === "ready") {
          action.textContent = "このシナリオで始める";
          action.addEventListener("click", () => switchScenario(e.id));
        } else {
          action.textContent = "準備中(未実装)";
          action.disabled = true;
        }
        if (e.category === "virtual") card.dataset.category = "virtual";
        card.append(seal, year, title, summary, facts, action);
        return card;
      });
    list.replaceChildren(
      ...(virtual.length ? [heading("史実のシナリオ", "史料にもとづく年代")] : []),
      ...cards(historic),
      ...(virtual.length ? [heading("仮想シナリオ", "ゲームの創作。架空の人物が登場し、能力値の上限は120")] : []),
      ...cards(virtual),
    );
  }

  open(): void {
    this.root.hidden = false;
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.onClosed();
  }
}
