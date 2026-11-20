// 勢力の選択(シナリオを選んだあとに出す。三國志14のように、操作する勢力を選んでから始める)。
// 一覧の勢力を選ぶと、地図上でその領土(都市)を強調し、君主・都市数・武将数・兵力・国力を示す。
// 観賞・編集モード(操作する勢力なし)は、通常の選択とは別の釦にする。
import { factionById, persons, scenario } from "../data";
import type { Campaign } from "../sim/Campaign";
import { fillPortrait } from "./portrait";

export interface FactionSelectActions {
  campaign: () => Campaign;
  /** 選んだ勢力で始める(null は観賞・編集モード) */
  onChoose: (factionId: string | null) => void;
  /** 一覧で選んだ勢力の領土を、地図で強調する(null で消す) */
  preview: (factionId: string | null) => void;
  current: () => string | null;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class FactionSelect {
  private selected: string | null = null;
  /** 始める前(閉じられない)か、ゲームの途中の変更(確認を出す)か */
  private mode: "start" | "change" | "fallen" = "start";

  constructor(private readonly root: HTMLElement, private readonly actions: FactionSelectActions) {}

  get visible(): boolean {
    return !this.root.hidden;
  }

  open(mode: "start" | "change" | "fallen" = "start"): void {
    this.mode = mode;
    this.selected = mode === "change" ? this.actions.current() : null;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
    this.actions.preview(null);
  }

  /** 勢力ごとの数字(都市を持つ国だけ) */
  rows(): { id: string; name: string; color: string; ruler: string; rulerId?: string; cities: number; generals: number; troops: number; power: number; capital: string }[] {
    const c = this.actions.campaign();
    return scenario.factions
      .filter((f) => !f.fallen && c.cities.some((k) => scenario.cityOwners[k.id] === f.id))
      .map((f) => {
        const ruler = c.rulerOf(f.id);
        const cap = c.capitalCityOf?.(f.id) ?? c.strategy.capitalOf(f.id);
        return {
          id: f.id, name: f.name, color: f.color, ruler: ruler?.name ?? f.ruler ?? "—", rulerId: ruler?.id,
          cities: c.cities.filter((k) => k.kind !== "pass" && scenario.cityOwners[k.id] === f.id).length,
          generals: persons.filter((p) => p.factionId === f.id && c.personStatus(p.id) === "active").length,
          troops: Math.round(c.strengthOf(f.id)),
          power: Math.round(c.diplo.power(f.id)),
          capital: cap?.name ?? "—",
        };
      })
      .sort((a, b) => b.cities - a.cities || b.troops - a.troops);
  }

  private render(): void {
    const rows = this.rows();
    const head = el("div", "fs-head");
    head.append(
      el("h2", "", this.mode === "change" ? "操作する勢力を変える" : this.mode === "fallen" ? "国が滅びました:次に操作する勢力を選ぶ" : "操作する勢力を選ぶ"),
      el("span", "fs-sub", `${scenario.year}年のシナリオ・${rows.length}勢力。一覧で選ぶと、地図で領土が光ります`),
    );
    if (this.mode === "change") {
      const close = el("button", "fs-close", "閉じる");
      close.type = "button";
      close.addEventListener("click", () => this.close());
      head.append(close);
    }
    const list = el("div", "fs-list");
    for (const r of rows) {
      const b = el("button", "fs-row");
      b.type = "button";
      b.dataset.id = r.id;
      b.setAttribute("aria-pressed", String(r.id === this.selected));
      const chip = el("span", "fs-chip");
      chip.style.background = r.color;
      b.append(chip, el("strong", "", r.name), el("span", "fs-row-sub", `${r.cities}都市・兵${r.troops.toLocaleString("ja-JP")}`));
      b.addEventListener("click", () => {
        this.selected = r.id;
        this.actions.preview(r.id);
        this.render();
      });
      list.append(b);
    }
    const detail = el("div", "fs-detail");
    const sel = rows.find((r) => r.id === this.selected);
    if (sel) {
      const img = el("img", "fs-portrait");
      img.alt = "";
      fillPortrait(img, persons.find((p) => p.id === sel.rulerId));
      const f = factionById(sel.id);
      const dl = el("dl", "fs-facts");
      for (const [k, v] of [["君主", sel.ruler], ["首都", sel.capital], ["都市", `${sel.cities}`], ["武将・人物", `${sel.generals}人`], ["兵力(軍団と守備兵)", sel.troops.toLocaleString("ja-JP")], ["国力の目安", sel.power.toLocaleString("ja-JP")], ["民族", f?.people ?? "—"]] as const) {
        dl.append(el("dt", "", k), el("dd", "", v));
      }
      const go = el("button", "fs-go", this.mode === "change" ? `${sel.name}に変える` : `${sel.name}で始める`);
      go.type = "button";
      go.addEventListener("click", () => this.choose(sel.id));
      detail.append(el("h3", "", sel.name), img, dl, go);
    } else detail.append(el("p", "fs-empty", "左の一覧から勢力を選んでください"));
    // 観賞・編集モード(通常の選択とは別)
    const watch = el("button", "fs-watch", "観賞・編集モード(操作する勢力なしで、すべての国の動きを見る)");
    watch.type = "button";
    watch.addEventListener("click", () => this.choose(null));
    const box = el("div", "fs-inner");
    box.append(head, el("div", "fs-body"), watch);
    (box.querySelector(".fs-body") as HTMLElement).append(list, detail);
    this.root.replaceChildren(box);
  }

  /** 決める。ゲームの途中の変更なら、確かめてから */
  private choose(id: string | null): void {
    if (this.mode === "change") {
      const now = this.actions.current();
      if (id === now) return this.close();
      const box = el("div", "fs-confirm");
      const name = (x: string | null): string => (x ? factionById(x)?.name ?? x : "観賞・編集モード");
      box.append(el("p", "", `操作する勢力を「${name(now)}」から「${name(id)}」に変えますか?(進行はそのまま続きます。元の勢力はAIが動かします)`));
      const yes = el("button", "fs-yes", "変える");
      yes.type = "button";
      yes.addEventListener("click", () => { this.actions.onChoose(id); this.close(); });
      const no = el("button", "fs-no", "やめる");
      no.type = "button";
      no.addEventListener("click", () => box.remove());
      box.append(yes, no);
      this.root.querySelector(".fs-inner")?.append(box);
      return;
    }
    this.actions.onChoose(id);
    this.close();
  }
}
